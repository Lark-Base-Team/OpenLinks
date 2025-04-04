import { bitable, FieldType } from '@lark-base-open/js-sdk';
import axios from 'axios';

// 定义视频数据的接口
interface Video {
  nickname: string;
  aweme_id: string;
  share_url: string;
  conv_create_time: string;
  desc: string;
  digg_count: string;
  collect_count: string;
  comment_count: string;
  duration: string;
  play_addr: string;
  audio_addr: string;
  share_count: string;
}

/**
 * 获取视频数据并写入多维表格
 * @param username 用户名
 * @param password 密码
 * @param platform 平台（douyin/tiktok）
 * @param linkType 链接类型（homepage/videourl）
 * @param updateMethod 更新方式（extract/update）
 * @param pageCount 翻页数
 * @param url 输入的链接
 * @param setPreviewInfo 更新预览信息的函数
 * @returns 处理结果
 */
export const getVideosData = async (
  username: string,
  password: string,
  platform: string,
  linkType: string,
  updateMethod: string,
  pageCount: number,
  url: string,
  setPreviewInfo: (value: React.SetStateAction<string>) => void
) => {
  // 构建数据结构
  const data = {
    username: username,
    password: password,
    url_type: linkType,
    url_process_type: updateMethod,
    platform: platform,
    raw_url_inputs: url,  // 保持为包含换行符的字符串
    raw_url_input: '',
    page_turns: pageCount
  };

  try {
    // 修改请求URL，使用相对路径
    const baseUrl = '';  // 改为空字符串
    const endpoint = '/api/video/doutikhub';
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

    // 处理返回数据并写入工作表
    if (!responseData.videos) {
      throw new Error('响应数据中缺少videos字段');
    }
    if (!Array.isArray(responseData.videos)) {
      throw new Error('videos字段不是数组类型');
    }
    if (responseData.message === "处理成功" && responseData.videos.length > 0) {
      try {
        const base = bitable.base;
        const tables = await base.getTableMetaList();

        // 按昵称分组处理视频数据
        const videosByNickname: Record<string, Video[]> = {};
        for (const video of responseData.videos) {
          if (!videosByNickname[video.nickname]) {
            videosByNickname[video.nickname] = [];
          }
          videosByNickname[video.nickname].push(video);
        }
        

        // 处理每个昵称的视频数据
        for (const [nickname, videos] of Object.entries(videosByNickname)) {
          setPreviewInfo(prev => prev + `\n开始处理用户 "${nickname}" 的数据...`);
          // 检查是否存在对应昵称的表
          let table = tables.find(t => t.name === nickname) as any;
          let tableId;

          if (!table) {
            setPreviewInfo(prev => prev + `\n创建新表格 "${nickname}"...`);
            try {
              // 创建新表
              const { tableId: newTableId } = await base.addTable({
                name: nickname,
                fields: []
              });
              tableId = newTableId;
              
              setPreviewInfo(prev => prev + '\n表格创建成功，获取表格实例...');
              
              table = await base.getTableById(tableId);
              if (!table) {
                throw new Error('无法获取新创建的表格实例');
              }
              
              // 获取默认创建的字段列表
              const initialFields = await table.getFieldMetaList();
              // 找到第一个字段（通常是系统创建的索引列）
              const primaryField = initialFields[0];
              
              if (primaryField) {
                // 将默认索引列重命名为"视频编号"
                setPreviewInfo(prev => prev + '\n将默认索引列重命名为"视频编号"...');
                await table.setField(primaryField.id, {
                  name: '视频编号'
                });
              }
              
              setPreviewInfo(prev => prev + '\n开始创建其他字段...');
              // 定义要创建的其他字段（不包括"视频编号"）
              const fields = [
                { type: FieldType.Text, name: '昵称' },
                { type: FieldType.Text, name: '链接' },
                { type: FieldType.Text, name: '发布日期' },
                { type: FieldType.Text, name: '描述' },
                { type: FieldType.Number, name: '点赞数' },
                { type: FieldType.Number, name: '收藏数' },
                { type: FieldType.Number, name: '评论数' },
                { type: FieldType.Number, name: '分享数' },
                { type: FieldType.Number, name: '时长' },
                { type: FieldType.Text, name: '下载链接' },
                { type: FieldType.Text, name: '音频链接' },
                { type: FieldType.Text, name: '文案' }
              ];
              
              // 逐个创建字段
              for (const field of fields) {
                try {
                  setPreviewInfo(prev => prev + `\n正在创建字段: ${field.name}...`);
                  await table.addField({
                    type: field.type,
                    name: field.name
                  });
                } catch (fieldError: any) {
                  setPreviewInfo(prev => prev + `\n创建字段 ${field.name} 失败: ${fieldError.message}`);
                  throw new Error(`创建字段 ${field.name} 失败: ${fieldError.message}`);
                }
              }
              
              setPreviewInfo(prev => prev + '\n所有字段创建完成');
            } catch (error: any) {
              setPreviewInfo(prev => prev + `\n创建表格或字段时出错: ${error.message}`);
              throw error;
            }
          } else {
            tableId = table.id;
            table = await base.getTableById(tableId);
          }

          if (!table) {
            throw new Error('无法获取表格实例');
          }

          setPreviewInfo(prev => prev + '\n获取字段元数据...');
          // 获取现有记录的视频编号
          const fields = await table.getFieldMetaList();
          const fieldMap: Record<string, string> = {};
          fields.forEach((field: any) => {
            fieldMap[field.name] = field.id;
          });

          // 检查字段映射是否正确
          setPreviewInfo(prev => prev + '\n检查字段映射...');
          for (const fieldName of ['视频编号', '昵称', '链接', '发布日期', '描述', '点赞数', '收藏数', '评论数', '时长', '下载链接', '音频链接', '文案', '分享数']) {
            if (!fieldMap[fieldName]) {
              setPreviewInfo(prev => prev + `\n警告: 未找到字段 "${fieldName}" 的映射`);
            }
          }

          setPreviewInfo(prev => prev + '\n获取视频编号列数据...');
          let existingVideoIds = new Set();
          try {
            // 使用 getRecords 方法获取所有记录，但只关注视频编号字段
            const videoIdFieldId = fieldMap['视频编号'];
            if (videoIdFieldId) {
              // 使用getCellString方法获取单元格的文本表示
              const recordIdList = await table.getRecordIdList();
              existingVideoIds = new Set();

              for (const recordId of recordIdList) {
                try {
                  const videoId = await table.getCellString(videoIdFieldId, recordId);
                  if (videoId) {
                    existingVideoIds.add(videoId);
                  }
                } catch (error) {
                  console.error(`获取记录 ${recordId} 的值失败:`, error);
                }
              }
              
              setPreviewInfo(prev => prev + `\n现有视频数量: ${existingVideoIds.size}`);
            } else {
              setPreviewInfo(prev => prev + '\n警告: 未找到视频编号字段，将添加所有记录');
            }
          } catch (recordError: any) {
            // 如果获取记录失败，假设是因为表格是新的，没有记录
            setPreviewInfo(prev => prev + `\n获取视频编号数据失败，可能是新表格: ${recordError.message}`);
          }

          setPreviewInfo(prev => prev + `\n现有视频编号列表: ${Array.from(existingVideoIds).join(', ')}`);

          // 准备新增记录数据
          const newRecords = [];
          for (const video of videos) {
            if (!existingVideoIds.has(video.aweme_id)) {
              const record = {
                fields: {
                  [fieldMap['视频编号']]: video.aweme_id,
                  [fieldMap['昵称']]: video.nickname,
                  [fieldMap['链接']]: video.share_url,
                  [fieldMap['发布日期']]: video.conv_create_time,
                  [fieldMap['描述']]: video.desc,
                  [fieldMap['点赞数']]: parseInt(video.digg_count) || 0,
                  [fieldMap['收藏数']]: parseInt(video.collect_count) || 0,
                  [fieldMap['评论数']]: parseInt(video.comment_count) || 0,
                  [fieldMap['时长']]: parseInt(video.duration) || 0,
                  [fieldMap['下载链接']]: video.play_addr,
                  [fieldMap['音频链接']]: video.audio_addr,
                  [fieldMap['文案']]: '',
                  [fieldMap['分享数']]: parseInt(video.share_count) || 0
                }
              };
              newRecords.push(record);
            }
          }

          setPreviewInfo(prev => prev + `\n准备添加 ${newRecords.length} 条新记录...`);
          // 批量添加记录
          if (newRecords.length > 0) {
            try {
              setPreviewInfo(prev => prev + '\n开始批量添加记录...');
              
              // 修改记录格式部分
              const formattedRecords = newRecords.map(record => ({
                fields: {
                  // 补全所有字段
                  [fieldMap['视频编号']]: record.fields[fieldMap['视频编号']],
                  [fieldMap['昵称']]: record.fields[fieldMap['昵称']],
                  [fieldMap['链接']]: record.fields[fieldMap['链接']],
                  [fieldMap['发布日期']]: record.fields[fieldMap['发布日期']],
                  [fieldMap['描述']]: record.fields[fieldMap['描述']],
                  [fieldMap['点赞数']]: record.fields[fieldMap['点赞数']],
                  [fieldMap['收藏数']]: record.fields[fieldMap['收藏数']],
                  [fieldMap['评论数']]: record.fields[fieldMap['评论数']],
                  [fieldMap['时长']]: record.fields[fieldMap['时长']],
                  [fieldMap['下载链接']]: record.fields[fieldMap['下载链接']],
                  [fieldMap['音频链接']]: record.fields[fieldMap['音频链接']],
                  [fieldMap['文案']]: record.fields[fieldMap['文案']],
                  [fieldMap['分享数']]: record.fields[fieldMap['分享数']]
                }
              }));
              
              // 使用正确的批量添加记录方法
              for (let i = 0; i < formattedRecords.length; i += 10) {
                const batch = formattedRecords.slice(i, i + 10);
                await table.addRecords(batch);
                setPreviewInfo(prev => prev + `\n成功添加第 ${i+1} 到 ${Math.min(i+10, formattedRecords.length)} 条记录`);
              }
              
              setPreviewInfo(prev => prev + `\n成功添加 ${formattedRecords.length} 条记录到表格 "${nickname}"`);
            } catch (error: any) {
              setPreviewInfo(prev => prev + `\n添加记录失败: ${error.message}\n错误详情: ${JSON.stringify(error, null, 2)}`);
              throw error;
            }
          } else {
            setPreviewInfo(prev => prev + `\n表格 "${nickname}" 中没有新的记录需要添加`);
          }
        }
      } catch (error: any) {
        setPreviewInfo(prev => prev + `\n写入数据到工作表时出错: ${error.message}\n错误详情: ${JSON.stringify(error, null, 2)}`);
        console.error('写入数据失败:', error);
      }
    }
  } catch (error: any) {
    // 显示错误信息
    setPreviewInfo(prev => prev + `\n\n请求出错:\n${error.message}`);
    console.error('请求失败:', error);
  }
}; 