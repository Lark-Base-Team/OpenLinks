import React from 'react';

/**
 * 发送文案请求函数
 * @param videotexts 视频文案数据数组
 * @param username 用户名
 * @param password 密码
 * @param setPreviewInfo 更新预览信息的函数
 * @returns 更新后的videotexts数组
 */
export const postVideotext = async (
  videotexts: any[],
  username: string,
  password: string,
  setPreviewInfo: (value: React.SetStateAction<string>) => void
): Promise<any[]> => {
  setPreviewInfo(prev => prev + `\n开始逐个发送文案更新请求...`);
  
  // 创建一个新数组，避免直接修改原数组
  const updatedVideotexts = [...videotexts];
  
  // 逐个处理每个视频
  for (let i = 0; i < updatedVideotexts.length; i++) {
    const videoItem = updatedVideotexts[i];
    
    // 准备单个视频的请求数据，移除recordId和duration
    const { recordId, duration, ...apiVideoItem } = videoItem;
    
    // 显示请求体内容
    const requestBody = {
      username,
      password,
      videotexts: [apiVideoItem] // 单个视频作为数组元素
    };
    
    setPreviewInfo(prev => prev + `\n\n发送第 ${i+1}/${updatedVideotexts.length} 个请求:\n${JSON.stringify(requestBody, null, 2)}`);
    
    try {
      const response = await fetch('/api/videotext/update-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // 检查返回消息
      if (result.message === "处理成功") {
        // 处理API返回的结果
        if (result.videotexts && Array.isArray(result.videotexts) && result.videotexts.length > 0) {
          // 更新task_id和video_text_ori
          const returnedItem = result.videotexts[0];
          if (returnedItem) {
            updatedVideotexts[i] = {
              ...updatedVideotexts[i],
              task_id: returnedItem.task_id || '',
              video_text_ori: returnedItem.video_text_ori || ''
            };
            setPreviewInfo(prev => prev + `\n成功获取任务ID: ${returnedItem.task_id}`);
            
            // 如果已经有文案，显示文案
            if (returnedItem.video_text_ori) {
              setPreviewInfo(prev => prev + `\n已获取文案: ${returnedItem.video_text_ori.substring(0, 30)}...`);
            }
          }
        } else {
          setPreviewInfo(prev => prev + `\n警告: 返回数据格式不正确`);
        }
      } else {
        setPreviewInfo(prev => prev + `\n警告: 请求未成功处理，消息: ${result.message}`);
      }
    } catch (error) {
      setPreviewInfo(prev => prev + `\n发送请求失败: ${error}`);
    }
    
    // 每个请求之间稍微延迟，避免API限制
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  setPreviewInfo(prev => prev + `\n所有文案更新请求已发送`);
  return updatedVideotexts;
};

/**
 * 处理文案返回函数
 * @param videotexts 视频文案数据数组
 * @param username 用户名
 * @param password 密码
 * @param setPreviewInfo 更新预览信息的函数
 * @returns 更新后的videotexts数组
 */
export const getVideotext = async (
  videotexts: any[],
  username: string,
  password: string,
  setPreviewInfo: (value: React.SetStateAction<string>) => void
): Promise<any[]> => {
  setPreviewInfo(prev => prev + '\n开始获取文案...');
  
  // 创建一个新数组，避免直接修改原数组
  let updatedVideotexts = [...videotexts];
  
  // 最大轮询次数，防止无限循环
  const maxPollingCount = 10;
  let pollingCount = 0;
  
  // 轮询直到所有视频都有文案或达到最大轮询次数
  while (pollingCount < maxPollingCount) {
    pollingCount++;
    setPreviewInfo(prev => prev + `\n开始第 ${pollingCount} 轮文案获取...`);
    
    // 标记是否所有视频都有文案
    let allHaveText = true;
    
    // 逐个获取每个视频的文案
    for (let i = 0; i < updatedVideotexts.length; i++) {
      const videoItem = updatedVideotexts[i];
      
      // 如果已经有文案，跳过
      if (videoItem.video_text_ori) {
        continue;
      }
      
      // 如果没有task_id，标记为未完成并跳过
      if (!videoItem.task_id) {
        allHaveText = false;
        setPreviewInfo(prev => prev + `\n跳过没有任务ID的视频: ${videoItem.aweme_id}`);
        continue;
      }
      
      // 准备单个视频的请求数据，移除recordId和duration
      const { recordId, duration, ...apiVideoItem } = videoItem;
      
      // 显示请求体内容
      const getRequestBody = {
        username,
        password,
        videotexts: [apiVideoItem] // 单个视频作为数组元素
      };
      
      setPreviewInfo(prev => prev + `\n\n获取第 ${i+1}/${updatedVideotexts.length} 个视频的文案:\n${JSON.stringify(getRequestBody, null, 2)}`);
      
      try {
        const getResponse = await fetch('/api/videotext/update-get', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(getRequestBody)
        });
        
        if (!getResponse.ok) {
          throw new Error(`获取文案请求失败: ${getResponse.status} ${getResponse.statusText}`);
        }
        
        const getResult = await getResponse.json();
        
        // 检查返回消息
        if (getResult.message === "处理成功") {
          // 处理获取文案的结果
          if (getResult.videotexts && Array.isArray(getResult.videotexts)) {
            // 获取文案内容 - 由于是单元素列表，直接取第一个元素
            const apiItem = getResult.videotexts[0];
            if (apiItem) {
              const text = apiItem.video_text_ori || apiItem.video_text_arr || '';
              
              if (text) {
                // 更新内存中的文案
                updatedVideotexts[i] = {
                  ...updatedVideotexts[i],
                  video_text_ori: text
                };
                
                setPreviewInfo(prev => prev + `\n成功获取视频 ${videoItem.aweme_id} 的文案: ${text.substring(0, 30)}...`);
              } else {
                // 标记为未完成
                allHaveText = false;
                setPreviewInfo(prev => prev + `\n视频 ${videoItem.aweme_id} 的文案尚未生成`);
              }
            } else {
              // 标记为未完成
              allHaveText = false;
              setPreviewInfo(prev => prev + `\n警告: 返回的videotexts数组为空`);
            }
          } else {
            // 标记为未完成
            allHaveText = false;
            setPreviewInfo(prev => prev + `\n警告: 返回数据格式不正确`);
          }
        } else {
          // 标记为未完成
          allHaveText = false;
          setPreviewInfo(prev => prev + `\n警告: 请求未成功处理，消息: ${getResult.message}`);
        }
      } catch (error) {
        // 标记为未完成
        allHaveText = false;
        setPreviewInfo(prev => prev + `\n获取文案失败: ${error}`);
      }
      
      // 每个请求之间稍微延迟，避免API限制
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 如果所有视频都有文案，结束轮询
    if (allHaveText) {
      setPreviewInfo(prev => prev + '\n所有视频文案已获取完成');
      break;
    }
    
    // 如果还有视频没有文案，等待2秒后继续轮询
    if (pollingCount < maxPollingCount) {
      setPreviewInfo(prev => prev + `\n等待2秒后进行下一轮获取...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // 检查是否达到最大轮询次数
  if (pollingCount >= maxPollingCount) {
    setPreviewInfo(prev => prev + `\n达到最大轮询次数(${maxPollingCount})，部分视频可能未获取到文案`);
  }
  
  return updatedVideotexts;
};
