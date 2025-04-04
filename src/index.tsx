import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { bitable } from '@lark-base-open/js-sdk';
import { Alert, AlertProps, Button, Select, Input, InputNumber, Card, Space } from 'antd';
import { getVideosData} from './utils/get_videosdata';
import { postVideotext, getVideotext } from './utils/get_videostext';
import * as XLSX from 'xlsx';
import axios from 'axios';

const { Option } = Select;

// 定义表格项的接口
interface TableItem {
  value: string;
  label: string;
}

interface TableRecord {
  recordId: string;
  [key: string]: any;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LoadApp/>
  </React.StrictMode>
)

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

  // 用户名和密码
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // 添加积分相关状态
  const [bonusPointsBalance, setBonusPointsBalance] = useState(0);
  const [recentDeductedPoints, setRecentDeductedPoints] = useState(0);

  // 平台和链接类型选择
  const [platform, setPlatform] = useState('douyin');
  const [linkType, setLinkType] = useState('homepage');
  const [updateMethod, setUpdateMethod] = useState('update');
  const [pageCount, setPageCount] = useState(1);

  // URL输入
  const [url, setUrl] = useState('');

  // 预览信息
  const [previewInfo, setPreviewInfo] = useState('');
  
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

  // 开始获取数据
  const startFetch = async () => {
    await getVideosData(
      username,
      password,
      platform,
      linkType,
      updateMethod,
      pageCount,
      url,
      setPreviewInfo
    );
  };
  
  // 开始获取文案
  const handleVideoText = async () => {
    try {
      setPreviewInfo('开始获取文案...');
      setTextButtonDisabled(true);
      
      // 1. 获取当前表格
      const selection = await bitable.base.getSelection();
      if (!selection || !selection.tableId) {
        setPreviewInfo('请先选择一个表格');
        setTextButtonDisabled(false);
        return;
      }
      
      const table = await bitable.base.getTableById(selection.tableId);
      const tableName = await table.getName();
      setPreviewInfo(prev => prev + `\n当前表格: ${tableName}`);
      
      // 2. 获取字段信息
      const fields = await table.getFieldMetaList();
      setPreviewInfo(prev => prev + `\n获取到 ${fields.length} 个字段`);
      
      // 查找"文案"字段和"视频编号"字段
      const textField = fields.find(field => field.name === '文案');
      const videoIdField = fields.find(field => field.name === '视频编号');
      
      if (!textField) {
        setPreviewInfo(prev => prev + '\n未找到"文案"字段，请确保表格中有名为"文案"的字段');
        setTextButtonDisabled(false);
        return;
      }
      
      if (!videoIdField) {
        setPreviewInfo(prev => prev + '\n未找到"视频编号"字段，请确保表格中有名为"视频编号"的字段');
        setTextButtonDisabled(false);
        return;
      }
      
      setPreviewInfo(prev => prev + `\n找到"文案"字段，ID: ${textField.id}`);
      setPreviewInfo(prev => prev + `\n找到"视频编号"字段，ID: ${videoIdField.id}`);
      
      // 3. 获取所有记录ID
      setPreviewInfo(prev => prev + '\n正在获取所有记录...');
      const recordIdList = await table.getRecordIdList();
      setPreviewInfo(prev => prev + `\n获取到 ${recordIdList.length} 条记录ID`);
      
      // 4. 筛选出"文案"字段为空的记录
      let videotexts: any[] = [];
      
      for (const recordId of recordIdList) {
        try {
          // 获取"文案"字段的值
          const textValue = await table.getCellValue(textField.id, recordId);
          
          // 如果"文案"字段为空，则获取其他必要字段
          if (!textValue) {
            // 获取视频编号
            const videoIdValue = await table.getCellValue(videoIdField.id, recordId);
            
            // 确保视频编号不为空
            if (videoIdValue) {
              // 获取各字段的字符串表示
              const videoIdString = await table.getCellString(videoIdField.id, recordId);
              
              // 查找下载链接、音频链接和时长字段
              const playAddrField = fields.find(field => field.name === '下载链接');
              const audioAddrField = fields.find(field => field.name === '音频链接');
              const durationField = fields.find(field => field.name === '时长');
              
              // 获取下载链接、音频链接和时长的值
              let playAddr = '';
              let audioAddr = '';
              let duration = 0;
              
              if (playAddrField) {
                playAddr = await table.getCellString(playAddrField.id, recordId) || '';
              }
              
              if (audioAddrField) {
                audioAddr = await table.getCellString(audioAddrField.id, recordId) || '';
              }
              
              if (durationField) {
                const durationValue = await table.getCellValue(durationField.id, recordId);
                duration = typeof durationValue === 'number' ? durationValue : 0;
              }
              
              setPreviewInfo(prev => prev + `\n处理记录 ${recordId}，视频编号: ${videoIdString}`);
              
              // 构建符合API要求的对象
              videotexts.push({
                aweme_id: videoIdString,
                play_addr: playAddr,
                audio_addr: audioAddr,
                video_text_ori: '',
                video_text_arr: '',
                task_id: '',
                recordId: recordId,
                duration: duration // 添加时长字段
              });
            } else {
              setPreviewInfo(prev => prev + `\n记录 ${recordId} 的视频编号为空，跳过`);
            }
          }
        } catch (error) {
          setPreviewInfo(prev => prev + `\n处理记录 ${recordId} 时出错: ${error}`);
        }
      }
      
      if (videotexts.length === 0) {
        setPreviewInfo(prev => prev + '\n没有需要处理的记录');
        setTextButtonDisabled(false);
        return;
      }
      
      setPreviewInfo(prev => prev + `\n共有 ${videotexts.length} 个视频需要处理`);
      
      // 5. 调用发送文案请求函数
      videotexts = await postVideotext(videotexts, username, password, setPreviewInfo);

      // 在调用postVideotext后
      // 只考虑尚未获取到文案的记录的时长
      const maxDuration = Math.max(
        ...videotexts
          .filter(item => !item.video_text_ori) // 过滤掉已有文案的记录
          .map(item => item.duration || 0)
      );
      const waitTime = Math.ceil(maxDuration / 1000 / 15); // 根据视频时长计算等待时间

      setPreviewInfo(prev => prev + `\n等待${waitTime}秒，给后台处理时间...`);
      setTextButtonText(`处理中(${waitTime}秒)`);

      // 使用倒计时
      for (let i = waitTime; i > 0; i--) {
        setTextButtonText(`处理中(${i}秒)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setTextButtonText('开始获取文案');

      // 6. 调用处理文案返回函数
      videotexts = await getVideotext(videotexts, username, password, setPreviewInfo);

      // 显示最终处理后的视频数据
      setPreviewInfo(prev => prev + `\n最终处理后的视频数据:\n${JSON.stringify(videotexts, null, 2)}`);
      
      // 7. 统一更新表格中的文案
      setPreviewInfo(prev => prev + '\n开始更新表格中的文案...');
      let updateCount = 0;
      
      for (const videoItem of videotexts) {
        if (videoItem.video_text_ori && videoItem.recordId) {
          try {
            await table.setCellValue(textField.id, videoItem.recordId, videoItem.video_text_ori);
            updateCount++;
            setPreviewInfo(prev => prev + `\n成功更新记录 ${videoItem.recordId} 的文案`);
          } catch (error) {
            setPreviewInfo(prev => prev + `\n更新记录 ${videoItem.recordId} 失败: ${error}`);
          }
        }
      }
      
      setPreviewInfo(prev => prev + `\n共更新 ${updateCount} 条记录的文案`);
      setPreviewInfo(prev => prev + '\n所有记录处理完成');
    } catch (error) {
      console.error('处理失败:', error);
      setPreviewInfo(prev => prev + `\n处理失败: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error('错误堆栈:', error.stack);
      }
    } finally {
      setTextButtonDisabled(false);
    }
  };

  // 下载视频文案函数
  const downloadtxt = async () => {
    try {
      setDownloadButtonDisabled(true);
      setPreviewInfo('开始准备下载视频文案...');
      
      // 1. 获取当前表格
      const selection = await bitable.base.getSelection();
      if (!selection || !selection.tableId) {
        setPreviewInfo('请先选择一个表格');
        setDownloadButtonDisabled(false);
        return;
      }
      
      const table = await bitable.base.getTableById(selection.tableId);
      const tableName = await table.getName();
      setPreviewInfo(prev => prev + `\n当前表格: ${tableName}`);
      
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
        setPreviewInfo(prev => prev + '\n缺少必要字段"文案"，请确保表格中有该字段');
        setDownloadButtonDisabled(false);
        return;
      }
      
      // 3. 获取所有记录ID
      const recordIdList = await table.getRecordIdList();
      setPreviewInfo(prev => prev + `\n获取到 ${recordIdList.length} 条记录`);
      
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
          setPreviewInfo(prev => prev + `\n成功生成文件: ${fileName}`);
          
          // 每个文件下载后稍微延迟，避免浏览器阻止多个下载
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          setPreviewInfo(prev => prev + `\n处理记录 ${recordId} 时出错: ${error}`);
        }
      }
      
      if (successCount === 0) {
        setPreviewInfo(prev => prev + '\n没有找到有效的文案记录');
      } else {
        setPreviewInfo(prev => prev + `\n成功生成 ${successCount} 个文案文件`);
      }
    } catch (error) {
      console.error('下载文案失败:', error);
      setPreviewInfo(prev => prev + `\n下载文案失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDownloadButtonDisabled(false);
    }
  };

  // 下载表格数据函数
  const downloadexcel = async () => {
    try {
      setExcelButtonDisabled(true);
      setPreviewInfo('开始准备下载表格数据...');
      
      // 1. 获取当前表格
      const selection = await bitable.base.getSelection();
      if (!selection || !selection.tableId) {
        setPreviewInfo('请先选择一个表格');
        setExcelButtonDisabled(false);
        return;
      }
      
      const table = await bitable.base.getTableById(selection.tableId);
      const tableName = await table.getName();
      setPreviewInfo(prev => prev + `\n当前表格: ${tableName}`);
      
      // 2. 获取字段信息
      const fields = await table.getFieldMetaList();
      
      // 查找必要字段
      const textField = fields.find(field => field.name === '文案');
      const videoIdField = fields.find(field => field.name === '视频编号');
      const nicknameField = fields.find(field => field.name === '昵称');
      const createTimeField = fields.find(field => field.name === '发布日期');
      const descField = fields.find(field => field.name === '描述');
      const diggCountField = fields.find(field => field.name === '点赞数');
      const commentCountField = fields.find(field => field.name === '评论数');
      const collectCountField = fields.find(field => field.name === '收藏数');
      const shareCountField = fields.find(field => field.name === '分享数');
      const shareUrlField = fields.find(field => field.name === '链接');
      
      // 3. 获取所有记录ID
      const recordIdList = await table.getRecordIdList();
      setPreviewInfo(prev => prev + `\n获取到 ${recordIdList.length} 条记录`);
      
      // 4. 准备Excel数据
      const data = [];
      
      // 添加表头
      data.push([
        '视频编号',
        '作者昵称',
        '发布日期',
        '描述',
        '点赞数',
        '评论数',
        '收藏数',
        '分享数',
        '分享链接',
        '文案'
      ]);
      
      // 处理每条记录
      for (const recordId of recordIdList) {
        try {
          // 获取各字段值
          const videoId = videoIdField ? await table.getCellString(videoIdField.id, recordId) || '' : '';
          const nickname = nicknameField ? await table.getCellString(nicknameField.id, recordId) || '' : '';
          const createTime = createTimeField ? await table.getCellString(createTimeField.id, recordId) || '' : '';
          const desc = descField ? await table.getCellString(descField.id, recordId) || '' : '';
          const diggCount = diggCountField ? await table.getCellValue(diggCountField.id, recordId) || 0 : 0;
          const commentCount = commentCountField ? await table.getCellValue(commentCountField.id, recordId) || 0 : 0;
          const collectCount = collectCountField ? await table.getCellValue(collectCountField.id, recordId) || 0 : 0;
          const shareCount = shareCountField ? await table.getCellValue(shareCountField.id, recordId) || 0 : 0;
          const shareUrl = shareUrlField ? await table.getCellString(shareUrlField.id, recordId) || '' : '';
          const textValue = textField ? await table.getCellString(textField.id, recordId) || '' : '';
          
          // 添加数据行
          data.push([
            videoId,
            nickname,
            createTime,
            desc,
            diggCount,
            commentCount,
            collectCount,
            shareCount,
            shareUrl,
            textValue
          ]);
        } catch (error) {
          setPreviewInfo(prev => prev + `\n处理记录 ${recordId} 时出错: ${error}`);
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
      
      setPreviewInfo(prev => prev + `\n成功生成Excel文件: ${fileName}`);
    } catch (error) {
      console.error('下载表格数据失败:', error);
      setPreviewInfo(prev => prev + `\n下载表格数据失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExcelButtonDisabled(false);
    }
  };

  // 获取用户信息函数
  const getUserInfo = async () => {
    try {
      setPreviewInfo('正在获取用户积分信息...');
      
      if (!username || !password) {
        setPreviewInfo('请输入用户名和密码');
        return;
      }
      
      // 构建数据结构
      const data = {
        username: username,
        password: password
      };

      // 修改请求URL，使用相对路径
      const baseUrl = '';  // 改为空字符串
      const endpoint = '/api/user/getUserInfo';
      const requestUrl = `${baseUrl}${endpoint}`;

      // 显示请求信息
      setPreviewInfo(`发送请求到: ${requestUrl}\n请求数据:\n${JSON.stringify(data, null, 2)}`);

      setPreviewInfo(prev => prev + '\n开始发送请求...');
      // 发送POST请求
      const response = await axios.post(requestUrl, data);

      setPreviewInfo(prev => prev + '\n开始解析响应数据...');
      // 解析响应数据
      const responseData = response.data;

      // 更新预览信息，添加响应数据
      setPreviewInfo(prev => prev + `\n\n收到响应:\n${JSON.stringify(responseData, null, 2)}`);
      
      // 更新积分信息
      setBonusPointsBalance(responseData.bonus_points_balance || 0);
      setRecentDeductedPoints(responseData.recent_deducted_points || 0);
      
      setPreviewInfo(prev => prev + `\n用户积分信息获取成功!\n积分余额: ${responseData.bonus_points_balance}\n最新消耗: ${responseData.recent_deducted_points}`);
    } catch (error) {
      console.error('获取用户信息失败:', error);
      setPreviewInfo(`获取用户信息失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

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

  return (
    <div style={{ padding: '16px' }}>
      <Alert message={info} type={alertType} style={{ marginBottom: '16px' }} />
      
      <div style={{ padding: '0 16px' }}>
        <div style={formItemStyle}>
          <span style={labelStyle}>用户名</span>
          <Input 
            placeholder="请输入用户名" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            style={inputStyle}
          />
        </div>
        
        <div style={formItemStyle}>
          <span style={labelStyle}>密码</span>
          <Input.Password 
            placeholder="请输入密码" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            style={inputStyle}
          />
        </div>
        
        {/* 修改积分信息和更新按钮的布局 */}
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
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </div>
        
        <Space direction="vertical" style={{ width: '100%', marginBottom: '16px' }}>
          <Button 
            type="primary" 
            onClick={startFetch}
            style={{ width: '100%' }}
          >
            开始获取数据
          </Button>
          
          <Button 
            type="primary" 
            onClick={handleVideoText}
            disabled={textButtonDisabled}
            style={{ width: '100%' }}
          >
            {textButtonText}
          </Button>
          
          <Button 
            type="primary" 
            onClick={downloadtxt}
            disabled={downloadButtonDisabled}
            style={{ width: '100%' }}
          >
            下载视频文档
          </Button>
          
          <Button 
            type="primary" 
            onClick={downloadexcel}
            disabled={excelButtonDisabled}
            style={{ width: '100%' }}
          >
            下载表格数据
          </Button>
          
        </Space>
        
        <Card 
          title="运行日志" 
          bodyStyle={{ 
            minHeight: '100px', 
            maxHeight: '500px', 
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          {previewInfo}
        </Card>
      </div>
    </div>
  );
}