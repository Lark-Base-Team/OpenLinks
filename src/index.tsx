import React, { useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { bitable, FieldType, IRecord, IFieldMeta } from '@lark-base-open/js-sdk';
import { Alert, AlertProps, Button, Select, Input, InputNumber, Card, Space } from 'antd';
import { getVideosData } from './utils/get_videosdata';
import * as XLSX from 'xlsx';
import axios from 'axios';
import pLimit from 'p-limit';
import { Toaster, toast } from 'sonner';

const { Option } = Select;

// 定义后端 API 的基础 URL
const API_BASE_URL = 'https://www.ccai.fun';

// 定义表格项的接口
interface TableItem {
  value: string;
  label: string;
}

// 定义视频处理过程中的数据结构
interface ProcessingVideo {
  recordId: string; // 飞书表格记录 ID
  aweme_id: string; // 视频编号
  play_addr?: string | null;
  audio_addr?: string | null;
  duration?: number;
  video_text_ori?: string | null; // 原始文案
  video_text_arr?: string | null; // 整理后文案
  asr_task_id?: string | null;    // ASR 任务 ID
  llm_task_id_list?: { conversation_id: string; chat_id: string }[] | null; // LLM 任务 ID 列表
  status: 'pending' | 'asr_posting' | 'asr_polling' | 'asr_done' | 'llm_posting' | 'llm_polling' | 'llm_done' | 'completed' | 'failed';
  error?: string | null; // 错误信息
}

// 定义 API 响应结构 (根据后端调整)
interface VideoTextApiResponse {
    message: string;
    videotext: { // 注意后端返回的是 videotext 对象
        aweme_id: string;
        play_addr?: string | null;
        audio_addr?: string | null;
        video_text_ori?: string | null;
        video_text_arr?: string | null;
        asr_task_id?: string | null;
        llm_task_id_list?: { conversation_id: string; chat_id: string }[] | null;
    };
    bonus_points_balance?: number | null;
    recent_deducted_points?: number | null;
}

// 定义 EXIST 标记 (与后端 handlers.py 保持一致)
const ASR_TASK_EXIST_MARKER = "EXIST";
const LLM_TASK_EXIST_MARKER = [{ conversation_id: "EXIST", chat_id: "EXIST" }];

// 辅助函数判断是否为 LLM EXIST 标记
function isLlmTaskExistMarker(list: any): boolean {
  return Array.isArray(list) && list.length === 1 && list[0]?.conversation_id === "EXIST";
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('找不到 root 元素');

// 只初始化一次 root
const root = ReactDOM.createRoot(rootElement); 

root.render(
  <React.StrictMode>
    <LoadApp/>
  </React.StrictMode>
);

/**
 * 主应用组件，负责：
 * 1. 初始化SDK并获取当前表格信息
 * 2. 处理用户输入和API请求
 * 3. 将数据写入多维表格
 */
function LoadApp() {
  // 状态：用于显示表格信息
  const [info, setInfo] = useState('获取表格名称中，请稍候...');
  const [alertType, setAlertType] = useState<AlertProps['type']>('info');

  // 用户认证状态
  const [username, setUsername] = useState('');
  const [passtoken, setPasstoken] = useState('');

  // 添加积分相关状态
  const [bonusPointsBalance, setBonusPointsBalance] = useState(0);
  const [recentDeductedPoints, setRecentDeductedPoints] = useState(0);

  // 平台配置
  const [platform, setPlatform] = useState('douyin');
  const [linkType, setLinkType] = useState('homepage');
  const [updateMethod, setUpdateMethod] = useState('update');
  const [pageCount, setPageCount] = useState(1);

  // URL输入
  const [url, setUrl] = useState('');
  
  // 当前表格和选中记录
  const [currentTable, setCurrentTable] = useState<any>(null);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  
  // 按钮状态
  const [textButtonText, setTextButtonText] = useState('开始获取文案');
  const [textButtonDisabled, setTextButtonDisabled] = useState(false);

  // 添加下载按钮状态
  const [downloadButtonDisabled, setDownloadButtonDisabled] = useState(false);

  // 在LoadApp组件中添加新的状态
  const [excelButtonDisabled, setExcelButtonDisabled] = useState(false);

  // 在状态定义部分
  const [updateScope, setUpdateScope] = useState<'latest' | 'all'>('latest');

  // 在状态定义部分添加新状态
  // 测试环境使用秒
  const [intervalHours, setIntervalHours] = useState(12); // 单位：小时（原为秒）
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [countdown, setCountdown] = useState(0); // 初始化为0

  // 在状态定义部分添加新状态
  const [botWebURL, setBotWebURL] = useState('https://open.feishu.cn/open-apis/bot/v2/hook/2c433239-cc8f-471a-8457-052e9b3a1c99'); // 新增订阅地址状态，设置默认值
  const [subscriptionTimer, setSubscriptionTimer] = useState<NodeJS.Timeout | null>(null); // 用于存储定时器引用

  // 在状态定义部分添加新状态
  const [templateId, setTemplateId] = useState('AAqReM3nWGMWd'); // 飞书模板ID，设置默认值
  const [templateVersionName, setTemplateVersionName] = useState('1.0.2'); // 模板版本号，设置默认值

  // 1. 定义ref
  const subRef = useRef(false);

  // 初始化：组件加载时获取表格信息
  useEffect(() => {
    const fn = async () => {
      console.info('获取活动表格...');
      const table = await bitable.base.getActiveTable();
      setCurrentTable(table);
      
      const tableName = await table.getName();
      console.info(`获取到表格名称: ${tableName}`);
      setInfo(`当前表格名称: ${tableName}`);
      setAlertType('success');
      
      // 获取字段映射
      const fields = await table.getFieldMetaList();
      const fieldMapObj: Record<string, string> = {};
      fields.forEach((field: any) => {
        fieldMapObj[field.name] = field.id;
      });
      setFieldMap(fieldMapObj);
      
      // 获取选中的记录
      try {
        // 使用 table.getSelection() 获取当前选择
        const selection = await bitable.base.getSelection();
        if (selection && selection.recordId) {
          setSelectedRecords([selection.recordId]);
        }
      } catch (error) {
        console.error('获取选中记录失败:', error);
      }
      
      // 监听选择变化
      bitable.base.onSelectionChange(({ data }) => {
        if (data && data.recordId) {
          setSelectedRecords([data.recordId]);
        } else {
          setSelectedRecords([]);
        }
      });
    };
    fn();
  }, []);



  // 获取用户信息函数
  const getUserInfo = async () => {
    try {
      console.log('正在获取用户积分信息...');
      
      if (!username || !passtoken) {
        console.log('请输入用户名和密码');
        toast.error('请输入用户名和密码');
        return;
      }
      
      const data = {
        username: username,
        passtoken: passtoken
      };

      const endpoint = '/api/user/getUserInfo';
      const requestUrl = `${API_BASE_URL}${endpoint}`;

      console.log(`发送请求到: ${requestUrl}\n请求数据:\n${JSON.stringify(data, null, 2)}`);
      console.log('开始发送请求...');
      const response = await axios.post(requestUrl, data);

      console.log('开始解析响应数据...');
      const responseData = response.data;
      console.log(`收到响应:\n${JSON.stringify(responseData, null, 2)}`);
      
      // 更新积分信息
      setBonusPointsBalance(responseData.bonus_points_balance || 0);
      setRecentDeductedPoints(responseData.recent_deducted_points || 0);
      
      console.log(`用户积分信息获取成功!\n积分余额: ${responseData.bonus_points_balance}\n最新消耗: ${responseData.recent_deducted_points}`);
    } catch (error) {
      console.error('获取用户信息失败:', error);
      if (axios.isAxiosError(error)) {
          const errorDetail = error.response?.data?.detail || error.message;
          console.log(`获取用户信息失败: ${errorDetail}`);
          toast.error(`获取用户信息失败: ${errorDetail}`);
      } else if (error instanceof Error && error.message.includes('Network Error')) {
         console.log(`获取用户信息失败: 网络错误。请检查后端服务器 (${API_BASE_URL}) 是否配置了正确的 CORS 策略以允许来自飞书域名的访问。`);
         toast.error('获取用户信息失败: 网络错误或 CORS 配置问题');
      } else {
         console.log(`获取用户信息失败: ${error instanceof Error ? error.message : String(error)}`);
         toast.error(`获取用户信息失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  // 开始获取数据
  const startFetch = async () => {
    await getVideosData(
      username,
      passtoken,
      platform,
      linkType,
      updateMethod,
      pageCount,
      url,
      console.log
    );
  };
  

  // 下载视频文案函数
  const downloadtxt = async () => {
    try {
      setDownloadButtonDisabled(true);
      console.log('开始准备下载视频文案...');
      
      // 1. 获取当前表格
      const selection = await bitable.base.getSelection();
      if (!selection || !selection.tableId) {
        console.log('请先选择一个表格');
        setDownloadButtonDisabled(false);
        return;
      }
      
      const table = await bitable.base.getTableById(selection.tableId);
      const tableName = await table.getName();
      console.log(`当前表格: ${tableName}`);
      
      // 2. 获取字段信息
      const fields = await table.getFieldMetaList();
      
      // 查找必要字段
      const textField = fields.find(field => field.name === '文案');
      const nicknameField = fields.find(field => field.name === '昵称');
      const createTimeField = fields.find(field => field.name === '发布日期');
      const descField = fields.find(field => field.name === '描述');
      const diggCountField = fields.find(field => field.name === '点赞数');
      const commentCountField = fields.find(field => field.name === '评论数');
      const collectCountField = fields.find(field => field.name === '收藏数');
      const shareCountField = fields.find(field => field.name === '分享数');
      const shareUrlField = fields.find(field => field.name === '分享链接');
      
      if (!textField) {
        console.log('缺少必要字段"文案"，请确保表格中有该字段');
        setDownloadButtonDisabled(false);
        return;
      }
      
      // 3. 获取所有记录ID
      const recordIdList = await table.getRecordIdList();
      console.log(`获取到 ${recordIdList.length} 条记录`);
      
      // 4. 处理每条记录并生成文件
      let successCount = 0;
      
      for (const recordId of recordIdList) {
        try {
          // 获取文案，如果为空则赋空值
          const textValue = await table.getCellString(textField.id, recordId) || '';
          
          // 获取其他字段值
          const nickname = nicknameField ? await table.getCellString(nicknameField.id, recordId) || '未知作者' : '未知作者';
          const createTime = createTimeField ? await table.getCellString(createTimeField.id, recordId) || '未知时间' : '未知时间';
          const desc = descField ? await table.getCellString(descField.id, recordId) || '' : '';
          const diggCount = diggCountField ? await table.getCellValue(diggCountField.id, recordId) || 0 : 0;
          const commentCount = commentCountField ? await table.getCellValue(commentCountField.id, recordId) || 0 : 0;
          const collectCount = collectCountField ? await table.getCellValue(collectCountField.id, recordId) || 0 : 0;
          const shareCount = shareCountField ? await table.getCellValue(shareCountField.id, recordId) || 0 : 0;
          const shareUrl = shareUrlField ? await table.getCellString(shareUrlField.id, recordId) || '' : '';
          
          // 构建文件名
          // 格式: "昵称_发布日期_点赞数_评论数_描述.txt"
          const createTimeShort = createTime.replace(/[^0-9]/g, '').substring(0, 8); // 提取日期数字部分
          const shortDesc = desc.length > 50 ? desc.substring(0, 50) : desc; // 截取描述前50个字符
          const sanitizedDesc = shortDesc.replace(/[\\/:*?"<>|]/g, '_'); // 移除文件名中不允许的字符
          
          const fileName = `${nickname}_${createTimeShort}_digg${diggCount}_comt${commentCount}_${sanitizedDesc}.txt`;
          
          // 构建文件内容
          const content = 
            `作者: ${nickname}\n` +
            `发布时间: ${createTime}\n` +
            `点赞数: ${diggCount}\n` +
            `评论数: ${commentCount}\n` +
            `收藏数: ${collectCount}\n` +
            `分享数: ${shareCount}\n\n` +
            `视频标题:\n${desc}\n\n` +
            `视频文案:\n${textValue}\n\n` +
            `视频链接:\n${shareUrl}`;
          
          // 下载文件
          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          successCount++;
          console.log(`成功生成文件: ${fileName}`);
          
          // 每个文件下载后稍微延迟，避免浏览器阻止多个下载
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.log(`处理记录 ${recordId} 时出错: ${error}`);
        }
      }
      
      if (successCount === 0) {
        console.log('没有找到有效的文案记录');
      } else {
        console.log(`成功生成 ${successCount} 个文案文件`);
      }
    } catch (error) {
      console.error('下载文案失败:', error);
      console.log(`下载文案失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDownloadButtonDisabled(false);
    }
  };

  // 下载表格数据函数
  const downloadexcel = async () => {
    try {
      setExcelButtonDisabled(true);
      console.log('开始准备下载表格数据...');

      // 1. 获取当前表格
      const selection = await bitable.base.getSelection();
      if (!selection || !selection.tableId) {
        console.log('请先选择一个表格');
        setExcelButtonDisabled(false);
        return;
      }

      const table = await bitable.base.getTableById(selection.tableId);
      const tableName = await table.getName();
      console.log(`当前表格: ${tableName}`);

      // 2. 获取字段信息
      const fields = await table.getFieldMetaList();

      // 查找必要字段 (确保查找所有表头对应的字段)
      const videoIdField = fields.find(field => field.name === '视频编号');
      const nicknameField = fields.find(field => field.name === '昵称');
      const createTimeField = fields.find(field => field.name === '发布日期');
      const descField = fields.find(field => field.name === '描述');
      const diggCountField = fields.find(field => field.name === '点赞数');
      const commentCountField = fields.find(field => field.name === '评论数');
      const collectCountField = fields.find(field => field.name === '收藏数');
      const shareCountField = fields.find(field => field.name === '分享数');
      // --- 新增查找 ---
      const durationField = fields.find(field => field.name === '时长');
      const shareUrlField = fields.find(field => field.name === '分享链接'); // 查找 '分享链接'
      const downloadLinkField = fields.find(field => field.name === '下载链接');
      const audioLinkField = fields.find(field => field.name === '音频链接');
      // --- 结束新增查找 ---
      const textField = fields.find(field => field.name === '文案');


      // 3. 获取所有记录ID
      const recordIdList = await table.getRecordIdList();
      console.log(`获取到 ${recordIdList.length} 条记录`);

      // 4. 准备Excel数据
      const data = [];

      // 添加表头 (与你的修改保持一致)
      data.push([
        '视频编号', '昵称', '发布日期', '描述', '点赞数', '评论数', '收藏数', '分享数', '时长',
        '分享链接', '下载链接', '音频链接', '文案'
      ]);

      // 处理每条记录
      for (const recordId of recordIdList) {
        try {
          // --- 修改：按照表头顺序获取单元格数据 ---
          const rowData = await Promise.all([
            videoIdField ? table.getCellString(videoIdField.id, recordId) : '',
            nicknameField ? table.getCellString(nicknameField.id, recordId) : '',
            createTimeField ? table.getCellString(createTimeField.id, recordId) : '',
            descField ? table.getCellString(descField.id, recordId) : '',
            diggCountField ? table.getCellString(diggCountField.id, recordId) : '',
            commentCountField ? table.getCellString(commentCountField.id, recordId) : '',
            collectCountField ? table.getCellString(collectCountField.id, recordId) : '',
            shareCountField ? table.getCellString(shareCountField.id, recordId) : '',
            durationField ? table.getCellString(durationField.id, recordId) : '', // 获取时长
            shareUrlField ? table.getCellString(shareUrlField.id, recordId) : '', // 获取分享链接
            downloadLinkField ? table.getCellString(downloadLinkField.id, recordId) : '', // 获取下载链接
            audioLinkField ? table.getCellString(audioLinkField.id, recordId) : '', // 获取音频链接
            textField ? table.getCellString(textField.id, recordId) : '' // 获取文案
          ]);
          data.push(rowData);
          // --- 结束修改 ---
        } catch (error) {
          console.error(`处理记录 ${recordId} 失败:`, error);
          // 可以选择跳过此记录或添加一行错误提示
          data.push([`错误: 处理记录 ${recordId} 失败`]);
        }
      }
      
      // 5. 生成Excel文件
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      
      // 6. 生成文件名
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `视频数据_${dateStr}_${timeStr}.xlsx`;
      
      // 7. 下载文件
      XLSX.writeFile(workbook, fileName);
      
      console.log(`成功生成Excel文件: ${fileName}`);
    } catch (error) {
      console.error('下载表格数据失败:', error);
      console.log(`下载表格数据失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExcelButtonDisabled(false);
    }
  };


  // 开始获取文案
  /**
   * 处理视频文案获取的主要函数
   * 
   * 该函数负责从选定的表格中获取视频信息，并为空白的文案字段获取对应的文案内容
   * 主要流程分为四个阶段：
   * 1. 提交ASR任务 (原始文案提取)
   * 2. 轮询ASR结果
   * 3. 提交LLM任务 (文案整理)
   * 4. 轮询LLM结果
   * 
   * 状态管理：
   * - 使用ProcessingVideo接口跟踪每个视频的处理状态
   * - 使用setTextButtonDisabled控制按钮状态
   * - 使用setTextButtonText更新按钮进度文本
   * - 使用toast显示操作反馈
   * 
   * 错误处理：
   * - 验证用户凭据
   * - 检查必需字段是否存在
   * - 处理记录获取和更新过程中的异常
   * - 超时处理机制
   * 
   * 并发控制：
   * - 使用pLimit限制并发请求数量(5个并发)
   * - 轮询间隔5秒
   * - 最大轮询尝试次数12次(共1分钟超时)
   * 
   * 特殊处理：
   * - 跳过超过300秒的视频ASR处理
   * - 处理"EXIST"标记(已存在的结果)
   * - 批量更新表格记录
   * 
   * @returns {Promise<void>} 无返回值，通过状态更新和toast通知反馈执行结果
   */
  const handleVideoText = async () => {
    console.log('开始获取文案流程...');
    setTextButtonDisabled(true);
    setTextButtonText('准备中...');

    // 1. 验证用户凭据
    if (!username || !passtoken) {
      console.error('错误：用户名和密码不能为空');
      toast.error('请输入用户名和密码');
      setTextButtonDisabled(false);
      setTextButtonText('开始获取文案');
      return;
    }

    let processingVideos: ProcessingVideo[] = [];
    let table: any = null;
    let textFieldId: string | undefined = undefined;

    try {
      // 2. 获取表格和字段信息
      // 2.1 检查是否已选择表格
      const selection = await bitable.base.getSelection();
      if (!selection || !selection.tableId) {
        console.log('请先选择一个表格');
        toast.info('请先选择一个表格');
        setTextButtonDisabled(false);
        setTextButtonText('开始获取文案');
        return;
      }

      // 2.2 获取表格对象和名称
      table = await bitable.base.getTableById(selection.tableId);
      const tableName = await table.getName();
      console.log(`当前表格: ${tableName}`);
      
      // 2.3 获取所有字段元数据
      const fields = await table.getFieldMetaList();
      console.log(`获取到 ${fields.length} 个字段`);

      // 2.4 查找必需字段
      const textField = fields.find((field: IFieldMeta) => field.name === '文案');
      const videoIdField = fields.find((field: IFieldMeta) => field.name === '视频编号');
      const playAddrField = fields.find((field: IFieldMeta) => field.name === '下载链接');
      const audioAddrField = fields.find((field: IFieldMeta) => field.name === '音频链接');
      const durationField = fields.find((field: IFieldMeta) => field.name === '时长');

      // 2.5 验证必需字段是否存在
      if (!textField || !videoIdField) {
        const missing = [!textField && '"文案"', !videoIdField && '"视频编号"'].filter(Boolean).join('、');
        console.error(`错误：未找到必需字段 ${missing}`);
        toast.error(`未找到必需字段 ${missing}，请确保表格中存在`);
        setTextButtonDisabled(false);
        setTextButtonText('开始获取文案');
        return;
      }
      textFieldId = textField.id;
      console.log(`找到"文案"字段 ID: ${textField.id}`);
      console.log(`找到"视频编号"字段 ID: ${videoIdField.id}`);

      // 3. 获取需要处理的记录
      // 3.1 获取所有记录ID
      console.log('正在获取所有记录 ID...');
      const recordIdList = await table.getRecordIdList();
      console.log(`获取到 ${recordIdList.length} 条记录 ID`);

      // 3.2 筛选文案为空的记录
      console.log('正在筛选"文案"字段为空的记录...');
      const recordsToFetchDetails: string[] = [];
      for (const recordId of recordIdList) {
        try {
          const textValue = await table.getCellValue(textField.id, recordId);
          if (!textValue) {
            recordsToFetchDetails.push(recordId);
          }
        } catch (error) {
          console.warn(`检查记录 ${recordId} 文案字段时出错: ${error}`);
        }
      }

      // 3.3 检查是否有需要处理的记录
      if (recordsToFetchDetails.length === 0) {
        console.log('没有找到"文案"字段为空的记录');
        toast.info('没有需要处理的记录（"文案"字段均不为空）');
        setTextButtonDisabled(false);
        setTextButtonText('开始获取文案');
        return;
      }
      console.log(`找到 ${recordsToFetchDetails.length} 条"文案"为空的记录，准备获取详细信息...`);

      // 3.4 获取记录的详细信息
      for (const recordId of recordsToFetchDetails) {
        try {
          const videoIdValue = await table.getCellString(videoIdField.id, recordId);
          if (!videoIdValue) {
            console.warn(`记录 ${recordId} 的视频编号为空，跳过`);
            continue;
          }
          const playAddr = playAddrField ? await table.getCellString(playAddrField.id, recordId) : null;
          const audioAddr = audioAddrField ? await table.getCellString(audioAddrField.id, recordId) : null;
          const durationValue = durationField ? await table.getCellValue(durationField.id, recordId) : null;
          const duration = typeof durationValue === 'number' ? durationValue : undefined;

          processingVideos.push({
            recordId: recordId,
            aweme_id: videoIdValue,
            play_addr: playAddr,
            audio_addr: audioAddr,
            duration: duration,
            status: 'pending',
          });
        } catch (error) {
          console.error(`获取记录 ${recordId} 详细信息时出错: ${error}`);
        }
      }

      // 3.5 检查筛选后是否有有效记录
      if (processingVideos.length === 0) {
        console.log('筛选后没有有效的视频记录需要处理');
        toast.info('筛选后没有有效的视频记录需要处理');
        setTextButtonDisabled(false);
        setTextButtonText('开始获取文案');
        return;
      }

      const totalVideosToProcess = processingVideos.length;
      console.log(`最终确定 ${totalVideosToProcess} 个视频需要处理文案`);

      // 4. 执行四阶段处理流程
      const limit = pLimit(5); // 并发限制5个请求
      const POLLING_INTERVAL = 5000; // 轮询间隔5秒
      const MAX_POLLING_ATTEMPTS = 12; // 最大轮询次数12次(1分钟超时)

      // --- 阶段1: 提交ASR任务 ---
      console.log("--- 阶段1: 提交ASR任务 ---");
      setTextButtonText(`提交ASR 0/${totalVideosToProcess}`);
      let asrPostCount = 0;
      const asrPostPromises = processingVideos.map(video =>
        limit(async () => {
          video.status = 'asr_posting';
          try {
            const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-ori-post`, {
              username,
              passtoken,
              videotext: { aweme_id: video.aweme_id, play_addr: video.play_addr, audio_addr: video.audio_addr }
            }).then(res => res.data);
            // videotext 结构说明：
            // {
            //   aweme_id: string,          // 视频唯一标识
            //   play_addr?: string | null, // 视频播放地址
            //   audio_addr?: string | null, // 音频地址
            //   video_text_ori?: string | null, // 原始文案
            //   video_text_arr?: string | null, // 整理后文案
            //   asr_task_id?: string | null,    // ASR 任务 ID
            //   llm_task_id_list?: { conversation_id: string; chat_id: string }[] | null // LLM 任务 ID 列表
            // }

            // 处理API响应
            // 处理ASR任务提交响应
            if (response.videotext?.asr_task_id) {
              // 保存ASR任务ID
              video.asr_task_id = response.videotext.asr_task_id;
              
              // 检查是否为已有文案标记
              if (video.asr_task_id === ASR_TASK_EXIST_MARKER) {
                console.log(`视频 ${video.aweme_id} 后端返回已有原始文案。`);
                // 直接使用已有文案
                video.video_text_ori = response.videotext.video_text_ori;
                // 标记任务完成
                video.status = 'asr_done';
              } else {
                // 新提交的ASR任务
                console.log(`视频 ${video.aweme_id} ASR 任务提交成功，ID: ${video.asr_task_id}`);
                // 进入轮询状态
                video.status = 'asr_polling';
              }
            } else {
              // 未返回有效任务ID
              throw new Error(response.message || '未返回有效的 ASR 任务 ID 或 EXIST 标记');
            }
          } catch (error: any) {
            // 处理ASR提交错误
            const errorMsg = error.response?.data?.detail || error.message || '提交 ASR 任务失败';
            console.error(`视频 ${video.aweme_id} 提交 ASR 任务失败: ${errorMsg}`, error);
            // 标记任务失败
            video.status = 'failed';
            video.error = `ASR提交失败: ${errorMsg}`;
          } finally {
            // 更新进度计数
            asrPostCount++;
            setTextButtonText(`提交ASR ${asrPostCount}/${totalVideosToProcess}`);
          }
        })
      );
      await Promise.allSettled(asrPostPromises);
      console.log("--- 阶段1 完成 ---");

      // --- 阶段 2: 轮询 ASR 结果 (ori-get) ---
      console.log("--- 阶段 2: 查询 ASR 结果 ---");
      // 获取需要轮询ASR结果的视频列表
      let videosToPollAsr = processingVideos.filter(v => v.status === 'asr_polling');
      let asrPollingAttempts = 0; // 记录轮询次数
      // 统计已完成ASR任务的数量（包括成功和失败）
      let asrCompletedCount = processingVideos.filter(v => v.status === 'asr_done' || v.status === 'failed').length;

      // 开始轮询循环，直到所有任务完成或达到最大轮询次数
      while (videosToPollAsr.length > 0 && asrPollingAttempts < MAX_POLLING_ATTEMPTS) {
        asrPollingAttempts++; // 增加轮询次数
        const currentPollingCount = videosToPollAsr.length; // 当前轮询任务数量
        // 更新按钮文本显示当前轮询进度
        setTextButtonText(`查询ASR ${asrCompletedCount}/${totalVideosToProcess} (第 ${asrPollingAttempts}轮)`);
        console.log(`ASR 结果查询轮次 ${asrPollingAttempts}/${MAX_POLLING_ATTEMPTS}，剩余 ${currentPollingCount} 个任务`);

        // 创建并执行所有ASR查询任务
        const asrGetPromises = videosToPollAsr.map(video =>
          limit(async () => {
            if (!video.asr_task_id) return; // 跳过没有任务ID的视频
            try {
              // 发送查询请求获取ASR结果
              const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-ori-get`, {
                username,
                passtoken,
                videotext: { aweme_id: video.aweme_id, asr_task_id: video.asr_task_id }
              }).then(res => res.data);

              // 处理查询结果
              if (response.videotext?.video_text_ori) {
                console.log(`视频 ${video.aweme_id} ASR 完成，获取到文案。`);
                video.video_text_ori = response.videotext.video_text_ori; // 保存原始文案
                video.status = 'asr_done'; // 标记任务完成
              } else if (response.message.includes("处理中")) {
                console.log(`视频 ${video.aweme_id} ASR 仍在处理中...`); // 任务仍在处理
              } else {
                 throw new Error(response.message || '获取 ASR 结果状态未知'); // 未知状态
              }
            } catch (error: any) {
              // 处理查询错误
              const errorMsg = error.response?.data?.detail || error.message || '查询 ASR 结果失败';
              console.error(`视频 ${video.aweme_id} 查询 ASR 结果失败: ${errorMsg}`, error);
              video.status = 'failed'; // 标记任务失败
              video.error = `ASR查询失败: ${errorMsg}`; // 记录错误信息
            }
          })
        );
        await Promise.allSettled(asrGetPromises); // 等待所有查询任务完成

        // 更新需要轮询的视频列表和完成数量
        videosToPollAsr = processingVideos.filter(v => v.status === 'asr_polling');
        asrCompletedCount = processingVideos.filter(v => v.status === 'asr_done' || v.status === 'failed').length;

        // 如果还有未完成的任务且未达到最大轮询次数，等待一段时间后继续
        if (videosToPollAsr.length > 0 && asrPollingAttempts < MAX_POLLING_ATTEMPTS) {
          console.log(`等待 ${POLLING_INTERVAL / 1000} 秒进行下一轮 ASR 查询...`);
          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        }
      }
      // 处理轮询超时的情况
      if (videosToPollAsr.length > 0) {
          console.warn(`ASR 轮询超时，仍有 ${videosToPollAsr.length} 个任务未完成`);
          videosToPollAsr.forEach(v => {
              v.status = 'failed'; // 标记超时任务为失败
              v.error = 'ASR 轮询超时'; // 记录超时错误
          });
          asrCompletedCount = processingVideos.filter(v => v.status === 'asr_done' || v.status === 'failed').length;
      }
      // 更新按钮文本显示最终结果
      setTextButtonText(`查询ASR ${asrCompletedCount}/${totalVideosToProcess} - 完成`);
      console.log("--- 阶段 2 完成 ---");


      // --- 阶段 3: 提交 LLM 任务 (arr-post) ---
      console.log("--- 阶段 3: 提交 LLM 任务 ---");
      // 过滤出已完成 ASR 且包含原始文案的视频
      const videosForLlm = processingVideos.filter(v => v.status === 'asr_done' && v.video_text_ori);
      const totalLlmPost = videosForLlm.length; // 需要处理的视频总数
      let llmPostCount = 0; // 已处理的视频计数
      setTextButtonText(`提交LLM 0/${totalLlmPost}`); // 更新按钮文本

      if (totalLlmPost > 0) {
          // 使用限流器并发处理每个视频
          const llmPostPromises = videosForLlm.map(video =>
            limit(async () => {
              video.status = 'llm_posting'; // 标记为正在提交LLM任务
              try {
                // 调用API提交LLM任务
                const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-arr-post`, {
                  username,
                  passtoken,
                  videotext: { aweme_id: video.aweme_id }
                }).then(res => res.data);

                if (response.videotext?.llm_task_id_list) {
                  video.llm_task_id_list = response.videotext.llm_task_id_list; // 保存任务ID列表
                  if (isLlmTaskExistMarker(video.llm_task_id_list)) {
                     // 如果返回的是EXIST标记，表示已有整理文案
                     console.log(`视频 ${video.aweme_id} 后端返回已有整理文案。`);
                     video.video_text_arr = response.videotext.video_text_arr; // 保存整理后的文案
                     video.status = 'llm_done'; // 标记任务完成
            } else {
                     // 正常提交LLM任务的情况
                     console.log(`视频 ${video.aweme_id} LLM 任务提交成功，ID列表: ${JSON.stringify(video.llm_task_id_list)}`);
                     video.status = 'llm_polling'; // 标记为等待轮询结果
                  }
                } else {
                  throw new Error(response.message || '未返回有效的 LLM 任务 ID 列表或 EXIST 标记');
                }
              } catch (error: any) {
                // 处理提交失败的情况
                const errorMsg = error.response?.data?.detail || error.message || '提交 LLM 任务失败';
                console.error(`视频 ${video.aweme_id} 提交 LLM 任务失败: ${errorMsg}`, error);
                video.status = 'failed'; // 标记任务失败
                video.error = `LLM提交失败: ${errorMsg}`; // 记录错误信息
              } finally {
                llmPostCount++; // 更新已处理计数
                setTextButtonText(`提交LLM ${llmPostCount}/${totalLlmPost}`); // 更新按钮文本
              }
            })
          );
          await Promise.allSettled(llmPostPromises); // 等待所有任务完成
      } else {
          console.log("没有需要提交 LLM 任务的视频。");
      }
      console.log("--- 阶段 3 完成 ---");


      // --- 阶段 4: 轮询 LLM 结果 (arr-get) ---
      console.log("--- 阶段 4: 查询 LLM 结果 ---");
      let videosToPollLlm = processingVideos.filter(v => v.status === 'llm_polling');
      let llmPollingAttempts = 0;
      let llmCompletedCount = totalVideosToProcess - processingVideos.filter(v => v.status === 'failed' || v.status === 'llm_polling').length;

      while (videosToPollLlm.length > 0 && llmPollingAttempts < MAX_POLLING_ATTEMPTS) {
        llmPollingAttempts++;
        const currentPollingCount = videosToPollLlm.length;
        setTextButtonText(`查询LLM ${llmCompletedCount}/${totalVideosToProcess} (第 ${llmPollingAttempts}轮)`);
        console.log(`LLM 结果查询轮次 ${llmPollingAttempts}/${MAX_POLLING_ATTEMPTS}，剩余 ${currentPollingCount} 个任务`);

        const llmGetPromises = videosToPollLlm.map(video =>
          limit(async () => {
            if (!video.llm_task_id_list || isLlmTaskExistMarker(video.llm_task_id_list)) return;
            try {
              const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-arr-get`, {
        username, 
                passtoken,
                videotext: { aweme_id: video.aweme_id, llm_task_id_list: video.llm_task_id_list }
              }).then(res => res.data);

              if (response.videotext?.video_text_arr) {
                console.log(`视频 ${video.aweme_id} LLM 完成，获取到整理文案。`);
                video.video_text_arr = response.videotext.video_text_arr;
                video.status = 'llm_done';
              } else if (response.message.includes("处理中")) {
                console.log(`视频 ${video.aweme_id} LLM 仍在处理中...`);
              } else {
                 throw new Error(response.message || '获取 LLM 结果状态未知');
              }
            } catch (error: any) {
              const errorMsg = error.response?.data?.detail || error.message || '查询 LLM 结果失败';
              console.error(`视频 ${video.aweme_id} 查询 LLM 结果失败: ${errorMsg}`, error);
              video.status = 'failed';
              video.error = `LLM查询失败: ${errorMsg}`;
            }
          })
        );
        await Promise.allSettled(llmGetPromises);

        videosToPollLlm = processingVideos.filter(v => v.status === 'llm_polling');
        llmCompletedCount = totalVideosToProcess - processingVideos.filter(v => v.status === 'failed' || v.status === 'llm_polling').length;

        if (videosToPollLlm.length > 0 && llmPollingAttempts < MAX_POLLING_ATTEMPTS) {
          console.log(`等待 ${POLLING_INTERVAL / 1000} 秒进行下一轮 LLM 查询...`);
          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        }
      }
       if (videosToPollLlm.length > 0) {
          console.warn(`LLM 轮询超时，仍有 ${videosToPollLlm.length} 个任务未完成`);
          videosToPollLlm.forEach(v => {
              v.status = 'failed';
              v.error = 'LLM 轮询超时';
          });
          llmCompletedCount = totalVideosToProcess - processingVideos.filter(v => v.status === 'failed' || v.status === 'llm_polling').length;
      }
      setTextButtonText(`查询LLM ${llmCompletedCount}/${totalVideosToProcess} - 完成`);
      console.log("--- 阶段 4 完成 ---");


      // 4. 统一更新表格
      console.log('开始更新表格中的文案...');
      setTextButtonText('更新表格...');
      let updateCount = 0; // 成功更新记录数
      let failCount = 0; // 失败记录数
      const recordsToUpdate: { recordId: string; fields: { [fieldId: string]: any } }[] = []; // 待更新记录集合

      // 遍历处理中的视频，准备更新数据
      for (const video of processingVideos) {
        // 处理成功的情况：LLM完成或ASR完成且无需LLM处理
        if (video.status === 'llm_done' || (video.status === 'asr_done' && !video.llm_task_id_list)) {
          const finalText = video.video_text_arr || video.video_text_ori; // 最终文案：优先使用LLM处理结果，否则使用原始文案
          if (finalText && video.recordId && textFieldId) {
            // 将待更新记录加入集合
            recordsToUpdate.push({
                recordId: video.recordId,
                fields: { [textFieldId]: finalText }
            });
          // recordsToUpdate 结构说明：
          // - recordId: 表格中记录的ID
          // - fields: 要更新的字段对象，其中：
          //   - key: 字段ID
          //   - value: 要更新的字段值

          } else if (!finalText) {
             // 文案为空的情况
             console.warn(`视频 ${video.aweme_id} (Record: ${video.recordId}) 处理完成但最终文案为空，不更新表格。`);
             failCount++;
          }
        } else if (video.status === 'failed') {
          // 处理失败的情况
          console.error(`视频 ${video.aweme_id} (Record: ${video.recordId}) 处理失败，原因: ${video.error}`);
          failCount++;
        } else {
            // 其他异常状态
            console.warn(`视频 ${video.aweme_id} (Record: ${video.recordId}) 最终状态异常: ${video.status}，不更新表格。`);
            failCount++;
        }
      }

      // 如果有待更新记录
      if (recordsToUpdate.length > 0) {
          console.log(`准备批量更新 ${recordsToUpdate.length} 条记录...`);
          try {
              // 尝试批量更新
              await table.setRecords(recordsToUpdate);
              // 更新成功计数
              updateCount = recordsToUpdate.length;
              console.log(`成功更新 ${updateCount} 条记录的文案`);
          } catch (error) {
              // 批量更新失败处理
              console.error(`批量更新表格失败: ${error}`);
              toast.error(`批量更新表格失败: ${error}`);
              // 重置成功计数，将全部记录标记为失败
              updateCount = 0;
              failCount = recordsToUpdate.length;
              console.log("尝试单条更新...");
              // 逐条更新作为回退方案
              for (const record of recordsToUpdate) {
                  try {
                      // 单条记录更新尝试
                      await table.setRecord(record.recordId, record);
                      console.log(`成功更新记录 ${record.recordId}`);
                      // 更新成功计数
                      updateCount++;
                      // 减少失败计数
                      failCount--;
                  } catch (singleError) {
                      // 单条记录更新失败处理
                      console.error(`更新记录 ${record.recordId} 失败: ${singleError}`);
                  }
              }
          }
      } else {
          console.log("没有需要更新到表格的记录。");
      }

      // 输出最终处理结果
      console.log(`文案处理流程结束。成功: ${updateCount}, 失败: ${failCount}`);
      toast.success(`处理完成！成功: ${updateCount}, 失败: ${failCount}`);

    } catch (error: any) {
      console.error('处理文案流程发生严重错误:', error);
      toast.error(`处理失败: ${error.message || String(error)}`);
      if (error.stack) {
        console.error('错误堆栈:', error.stack);
      }
    } finally {
      setTextButtonDisabled(false);
        setTextButtonText('开始获取文案');
    }
  };


  const executeSubscriptionTask = async (): Promise<void> => {
    try {
      console.log('【任务开始】获取表格数据...');
      const selection = await bitable.base.getSelection();
      if (!selection?.tableId) {
        console.warn('⚠️ 未选择表格');
        return;
      }
      
      const table = await bitable.base.getTableById(selection.tableId);
      const videoIdField = (await table.getFieldMetaList())
        .find(field => field.name === '视频编号');
      
      if (!videoIdField) {
        console.warn('⚠️ 表格中缺少"视频编号"字段');
        return;
      }
      
      // 获取初始记录
      const initialRecords = await table.getRecordIdList();
      console.log('📊 初始记录数:', initialRecords.length);

      // 执行数据获取
      console.log('⬇️ 开始获取视频数据...');
      await getVideosData(
        username,
        passtoken,
        platform,
        linkType,
        updateMethod,
        pageCount,
        url,
        console.log
      ).catch(e => console.error('获取视频数据失败:', e));
      
      // 获取文案
      console.log('✏️ 开始处理视频文案...');
      await handleVideoText().catch(e => console.error('处理文案失败:', e));

      // 检查新增记录
      const currentRecords = await table.getRecordIdList();
      const newRecordIds = currentRecords.filter(id => !initialRecords.includes(id));
      console.log('🆕 新增记录数:', newRecordIds.length);
      
      if (newRecordIds.length === 0) {
        console.log('ℹ️ 本次未新增视频记录');
        return;
      }

      // 异步构建aweme_ids
      const awemeIds = await Promise.all(
        newRecordIds.map(async recordId => {
          const id = await table.getCellString(videoIdField.id, recordId);
          return id?.trim() || null;
        })
      ).then(results => results.filter(Boolean) as string[]);

      console.log('📝 订阅请求体:', {
        username,
        passtoken,
        botWebURL,
        template_id: templateId, // 新增参数
        template_version_name: templateVersionName, // 新增参数
        aweme_ids: awemeIds // 现在保证是字符串数组
      });

      const response = await axios.post(`${API_BASE_URL}/api/video/subscribe-message`, {
        username,
        passtoken,
        botWebURL,
        template_id: templateId, // 新增参数
        template_version_name: templateVersionName, // 新增参数
        aweme_ids: awemeIds
      });

      if (response?.data?.success) {
        console.log('✅ 订阅任务完成');
      } else {
        console.warn('⚠️ 订阅请求未成功');
      }
    } catch (error) {
      console.error('❌ 任务执行遇到意外错误:', error);
    }
  };

  // 2. 修改订阅函数
  const bloggersSubscribe = async () => {
    if (!botWebURL || !username || !passtoken) return;

    subRef.current = true;
    setIsSubscribed(true);
    setCountdown(intervalHours * 3600); // 将小时转换为秒
    toast.success('订阅服务已启动');

    try {
      while (subRef.current) {
        setCountdown(intervalHours * 3600); // 每次循环重置时也转换为秒
        console.log('🔄 开始执行订阅任务循环...');
        
        // 执行任务（不await，使用void避免未处理Promise警告）
        void executeSubscriptionTask();
        
        // 等待周期（不受任务影响）
        await new Promise(resolve => {
          const intervalId = setInterval(() => {
            if (!subRef.current) {
              clearInterval(intervalId);
              resolve(null);
            }
          }, 5000);

          setTimeout(() => {
            clearInterval(intervalId);
            resolve(null);
          }, intervalHours * 3600 * 1000); // 原为 intervalHours * 1000
        });
      }
    } finally {
      console.log('⏹️ 订阅流程结束');
    }
  };

  // 3. 修改取消函数
  const cancelSubscription = () => {
    subRef.current = false;
    setIsSubscribed(false);
    toast.success('已取消订阅');
  };

  // 简化倒计时效果（仅UI）
  useEffect(() => {
    if (!isSubscribed || countdown <= 0) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0)); // 确保不小于0
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isSubscribed, countdown]);

  // 自定义表单项样式
  const formItemStyle = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px'
  };

  const labelStyle = {
    width: '80px',
    fontSize: '14px',
    color: '#333',
    textAlign: 'right' as const,
    paddingRight: '8px'
  };

  const inputStyle = {
    flex: 1
  };

  // 新增格式化函数
  const formatCountdown = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}小时${m}分${s}秒`;
  };

  return (
    <div style={{ padding: '16px' }}>
      <Toaster position="top-center" richColors />
      <Alert message={info} type={alertType} style={{ marginBottom: '16px' }} />
      
      <div style={{ padding: '0 16px' }}>
        <div style={formItemStyle}>
          <span style={labelStyle}>用户名</span>
          <Input 
            placeholder="请输入用户名" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            disabled={isSubscribed}
            style={inputStyle}
          />
        </div>
        
        <div style={formItemStyle}>
          <span style={labelStyle}>密码</span>
          <Input.Password 
            placeholder="请输入密码" 
            value={passtoken} 
            onChange={e => setPasstoken(e.target.value)} 
            disabled={isSubscribed}
            style={inputStyle}
          />
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', marginBottom: '4px' }}>
            <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-start' }}>
              <span style={{ fontSize: '14px', color: '#333' }}>积分余额:</span>
              <span style={{ fontSize: '14px', color: '#333', marginLeft: '6px' }}>{bonusPointsBalance}</span>
            </div>
            <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
              <span style={{ fontSize: '14px', color: '#333' }}>最近消耗:</span>
              <span style={{ fontSize: '14px', color: '#333', marginLeft: '6px' }}>{recentDeductedPoints}</span>
            </div>
            <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-end' }}>
              <a 
                href="https://www.ccai.fun/app" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: '14px', color: '#1890ff' }}
              >
                注册/充值
              </a>
            </div>
          </div>
          <Button 
            type="primary" 
            onClick={getUserInfo}
            disabled={isSubscribed}
            style={{ width: '100%', marginTop: '4px' }}
          >
            更新积分
          </Button>
        </div>
        
        <div style={formItemStyle}>
          <span style={labelStyle}>所属平台</span>
          <Select 
            value={platform} 
            onChange={value => setPlatform(value)}
            disabled={isSubscribed}
            style={inputStyle}
          >
            <Option value="douyin">抖音</Option>
            <Option value="tiktok">TikTok</Option>
          </Select>
        </div>
        
        <div style={formItemStyle}>
          <span style={labelStyle}>链接类型</span>
          <Select 
            value={linkType} 
            onChange={value => setLinkType(value)}
            disabled={isSubscribed}
            style={inputStyle}
          >
            <Option value="homepage">主页链接</Option>
            <Option value="videourl">视频链接</Option>
          </Select>
        </div>
        
        <div style={formItemStyle}>
          <span style={labelStyle}>更新方式</span>
          <Select 
            value={updateMethod} 
            onChange={value => setUpdateMethod(value)}
            disabled={isSubscribed}
            style={inputStyle}
          >
            <Option value="extract">提取</Option>
            <Option value="update">更新</Option>
          </Select>
        </div>
        
        <div style={formItemStyle}>
          <span style={labelStyle}>更新范围</span>
          <Select 
            value={updateScope}
            onChange={value => {
              setUpdateScope(value);
              setPageCount(value === 'latest' ? 1 : 99);
            }}
            disabled={isSubscribed}
            style={inputStyle}
          >
            <Option value="latest">获取最新</Option>
            <Option value="all">更新全部</Option>
          </Select>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontSize: '14px', color: '#333' }}>输入链接（支持多行粘贴）</div>
          <Input.TextArea 
            placeholder="请输入链接，支持多行粘贴" 
            value={url} 
            onChange={e => setUrl(e.target.value)} 
            disabled={isSubscribed}
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </div>
        
        <Space direction="vertical" style={{ width: '100%', marginBottom: '16px' }}>
          <Button 
            type="primary" 
            onClick={startFetch}
            disabled={isSubscribed || textButtonDisabled}
            style={{ width: '100%' }}
          >
            开始获取数据
          </Button>
          
          <Button 
            type="primary" 
            onClick={handleVideoText}
            disabled={isSubscribed || textButtonDisabled}
            style={{ width: '100%' }}
          >
            {textButtonText}
          </Button>
          
          <Button 
            type="primary" 
            onClick={downloadtxt}
            disabled={isSubscribed || downloadButtonDisabled}
            style={{ width: '100%' }}
          >
            下载视频文档
          </Button>
          
          <Button 
            type="primary" 
            onClick={downloadexcel}
            disabled={isSubscribed || excelButtonDisabled}
            style={{ width: '100%' }}
          >
            下载表格数据
          </Button>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '4px', fontSize: '14px', color: '#333' }}>飞书模板ID</div>
            <Input
              placeholder="请输入飞书模板ID"
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              disabled={isSubscribed}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '4px', fontSize: '14px', color: '#333' }}>模板版本号</div>
            <Input
              placeholder="请输入模板版本号"
              value={templateVersionName}
              onChange={e => setTemplateVersionName(e.target.value)}
              disabled={isSubscribed}
            />
          </div>
        </div>

          {/* 新增订阅地址输入框 */}
          <div style={formItemStyle}>
            <span style={labelStyle}>订阅地址</span>
            <Input
              placeholder="请输入订阅地址"
              value={botWebURL}
              onChange={e => setBotWebURL(e.target.value)}
              disabled={isSubscribed}
              style={inputStyle}
            />
          </div>
          
          {/* 新增订阅频率输入框 */}
          <div style={formItemStyle}>
            <span style={labelStyle}>订阅间隔</span>
            <InputNumber 
              min={1}
              max={72} // 最大24小时（原为3600秒）
              addonAfter="小时" // 原为"秒"
              value={intervalHours}
              onChange={value => setIntervalHours(value || 1)}
              disabled={isSubscribed}
              style={inputStyle}
            />
          </div>
          
          {/* 新增订阅按钮 */}
          <Button 
            type="primary" 
            onClick={bloggersSubscribe}
            disabled={isSubscribed}
            style={{ width: '100%' }}
          >
            {isSubscribed ? 
              `下次运行: ${formatCountdown(countdown)}` : 
              '博主视频订阅'}
          </Button>
          
          {/* 新增取消订阅按钮 */}
          <Button 
            type="primary" 
            onClick={cancelSubscription}
            disabled={false}
            style={{ width: '100%' }}
          >
            取消视频订阅
          </Button>
        </Space>
      </div>
    </div>
  );
}