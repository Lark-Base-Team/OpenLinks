import React from 'react';
import axios from 'axios';

// 定义后端 API 的基础 URL
const API_BASE_URL = 'https://www.ccai.fun';

// 接口定义
interface VideoText {
  aweme_id: string;
  play_addr?: string | null;
  audio_addr?: string | null;
  video_text_ori?: string | null;
  video_text_arr?: string | null;
  asr_task_id?: string | null;
  llm_task_id_list?: any[] | null; // 实际上是 { conversation_id: string; chat_id: string }[]
}

interface VideoTextRequestPayload {
  username: string;
  password?: string;
  videotext: VideoText;
}

interface VideoTextResponse {
  message: string;
  videotext: VideoText;
  bonus_points_balance?: number | null;
  recent_deducted_points?: number | null;
}

/**
 * 调用后端 API 启动视频原始文案获取任务 (ASR)
 * 对应后端 /videotext/update-ori-post
 */
export const UpdateVideoTextOriPost = async (
  username: string,
  password: string,
  videotext: VideoText,
  setPreviewInfo: (value: React.SetStateAction<string>) => void
): Promise<VideoTextResponse> => {
  const apiUrl = `${API_BASE_URL}/api/videotext/update-ori-post`;
  const payload: VideoTextRequestPayload = {
    username,
    password,
    videotext: {
      aweme_id: videotext.aweme_id,
      play_addr: videotext.play_addr || null,
      audio_addr: videotext.audio_addr || null,
      video_text_ori: null,
      video_text_arr: null,
      asr_task_id: null,
      llm_task_id_list: null,
    }
  };

  setPreviewInfo(prev => prev + `\n发送视频 ${videotext.aweme_id} 原始文案请求...`);

  try {
    const response = await axios.post(apiUrl, payload);
    const data = response.data;

    if (data.bonus_points_balance !== undefined) {
      setPreviewInfo(prev => prev + `\n当前积分余额: ${data.bonus_points_balance}`);
    }

    setPreviewInfo(prev => prev + `\n视频 ${videotext.aweme_id} 原始文案请求成功: ${data.message}`);
    return data;
  } catch (error: any) {
    setPreviewInfo(prev => prev + `\n发送视频 ${videotext.aweme_id} 的原始文案请求失败: ${error.message}`);
    throw error;
  }
};

/**
 * 调用后端 API 获取视频原始文案 (ASR) 的结果
 * 对应后端 /videotext/update-ori-get
 */
export const UpdateVideoTextOriGet = async (
  username: string,
  password: string,
  videotext: VideoText,
  setPreviewInfo: (value: React.SetStateAction<string>) => void
): Promise<VideoTextResponse> => {
  const apiUrl = `${API_BASE_URL}/api/videotext/update-ori-get`;
  const payload: VideoTextRequestPayload = {
    username,
    password,
    videotext: {
      aweme_id: videotext.aweme_id,
      asr_task_id: videotext.asr_task_id,
      play_addr: null,
      audio_addr: null,
      video_text_ori: null,
      video_text_arr: null,
      llm_task_id_list: null,
    }
  };

  setPreviewInfo(prev => prev + `\n获取视频 ${videotext.aweme_id} 原始文案结果...`);

  try {
    const response = await axios.post(apiUrl, payload);
    const data = response.data;

    if (data.bonus_points_balance !== undefined) {
      setPreviewInfo(prev => prev + `\n当前积分余额: ${data.bonus_points_balance}`);
    }

    // 如果获取到了原始文案
    if (data.videotext?.video_text_ori) {
      setPreviewInfo(prev => prev + `\n视频 ${videotext.aweme_id} 原始文案获取成功`);
    } else {
      setPreviewInfo(prev => prev + `\n视频 ${videotext.aweme_id} 原始文案处理中: ${data.message}`);
    }

    return data;
  } catch (error: any) {
    setPreviewInfo(prev => prev + `\n获取视频 ${videotext.aweme_id} 的原始文案结果失败: ${error.message}`);
    throw error;
  }
};

/**
 * 调用后端 API 启动视频文案整理任务 (Coze)
 * 对应后端 /videotext/update-arr-post
 */
export const UpdateVideoTextArrPost = async (
  username: string,
  password: string,
  videotext: VideoText,
  setPreviewInfo: (value: React.SetStateAction<string>) => void
): Promise<VideoTextResponse> => {
  const apiUrl = `${API_BASE_URL}/api/videotext/update-arr-post`;
  const payload: VideoTextRequestPayload = {
    username,
    password,
    videotext: {
      aweme_id: videotext.aweme_id,
      play_addr: null,
      audio_addr: null,
      video_text_ori: null,
      video_text_arr: null,
      asr_task_id: null,
      llm_task_id_list: null,
    }
  };

  setPreviewInfo(prev => prev + `\n发送视频 ${videotext.aweme_id} 整理文案请求...`);

  try {
    const response = await axios.post(apiUrl, payload);
    const data = response.data;

    if (data.bonus_points_balance !== undefined) {
      setPreviewInfo(prev => prev + `\n当前积分余额: ${data.bonus_points_balance}`);
    }

    if (data.videotext?.llm_task_id_list) {
      setPreviewInfo(prev => prev + `\n视频 ${videotext.aweme_id} 整理文案请求成功`);
    } else {
      setPreviewInfo(prev => prev + `\n视频 ${videotext.aweme_id} 整理文案请求返回: ${data.message}`);
    }

    return data;
  } catch (error: any) {
    setPreviewInfo(prev => prev + `\n发送视频 ${videotext.aweme_id} 的整理文案请求失败: ${error.message}`);
    throw error;
  }
};

/**
 * 调用后端 API 获取视频整理文案 (Coze) 的结果
 * 对应后端 /videotext/update-arr-get
 */
export const UpdateVideoTextArrGet = async (
  username: string,
  password: string,
  videotext: VideoText,
  setPreviewInfo: (value: React.SetStateAction<string>) => void
): Promise<VideoTextResponse> => {
  const apiUrl = `${API_BASE_URL}/api/videotext/update-arr-get`;
  
  if (!videotext.llm_task_id_list || videotext.llm_task_id_list.length === 0) {
    const errorMsg = '获取文案整理结果需要提供有效的 llm_task_id_list。';
    setPreviewInfo(prev => prev + `\n错误: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const payload: VideoTextRequestPayload = {
    username,
    password,
    videotext: {
      aweme_id: videotext.aweme_id,
      llm_task_id_list: videotext.llm_task_id_list,
      play_addr: null,
      audio_addr: null,
      video_text_ori: null,
      video_text_arr: null,
      asr_task_id: null,
    }
  };

  setPreviewInfo(prev => prev + `\n获取视频 ${videotext.aweme_id} 整理文案结果...`);

  try {
    const response = await axios.post(apiUrl, payload);
    const data = response.data;

    if (data.bonus_points_balance !== undefined) {
      setPreviewInfo(prev => prev + `\n当前积分余额: ${data.bonus_points_balance}`);
    }

    // 如果获取到了整理文案
    if (data.videotext?.video_text_arr) {
      setPreviewInfo(prev => prev + `\n视频 ${videotext.aweme_id} 整理文案获取成功`);
    } else {
      setPreviewInfo(prev => prev + `\n视频 ${videotext.aweme_id} 整理文案处理中: ${data.message}`);
    }

    return data;
  } catch (error: any) {
    setPreviewInfo(prev => prev + `\n获取视频 ${videotext.aweme_id} 的整理文案结果失败: ${error.message}`);
    throw error;
  }
};

/**
 * 执行文案处理流程，按照四个阶段获取视频文案
 * 1. 发送原始文案请求
 * 2. 获取原始文案结果
 * 3. 发送整理文案请求
 * 4. 获取整理文案结果
 */ 
export const processVideoTexts = async (
  videotexts: any[],
  username: string,
  password: string,
  setPreviewInfo: (value: React.SetStateAction<string>) => void,
  setButtonText: (text: string) => void
): Promise<any[]> => {
  const updatedVideotexts = [...videotexts];
  const MAX_POLLING_ATTEMPTS = 12;
  const POLLING_INTERVAL = 3000; // 3秒

  // 处理状态跟踪
  const processingErrors = new Map<string, string>();
  const successfulVideos = new Set<string>();
  
  try {
    // 阶段1: 发送原始文案请求
    setPreviewInfo(prev => prev + '\n开始发送原始文案请求...');
    setButtonText(`原始文案请求中...`);
    
    for (let i = 0; i < updatedVideotexts.length; i++) {
      const video = updatedVideotexts[i];
      setButtonText(`原始文案请求 ${i+1}/${updatedVideotexts.length}...`);
      
      // 跳过已有文案的视频
      if (video.video_text_ori) {
        setPreviewInfo(prev => prev + `\n视频 ${video.aweme_id} 已有文案，跳过`);
        continue;
      }
      
      try {
        const response = await UpdateVideoTextOriPost(
          username, 
          password, 
          {
            aweme_id: video.aweme_id,
            play_addr: video.play_addr,
            audio_addr: video.audio_addr
          },
          setPreviewInfo
        );
        
        // 检查是否获取到任务ID
        if (response.videotext?.asr_task_id) {
          updatedVideotexts[i].asr_task_id = response.videotext.asr_task_id;
        } else if (response.message && response.message.includes("已有文案")) {
          updatedVideotexts[i].already_has_text = true;
        } else {
          processingErrors.set(video.aweme_id, `未获取到原始文案任务ID: ${response.message}`);
        }
      } catch (error: any) {
        processingErrors.set(video.aweme_id, `原始文案请求失败: ${error.message}`);
      }
      
      // 请求间隔
      if (i < updatedVideotexts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // 阶段2: 获取原始文案
    setPreviewInfo(prev => prev + '\n开始获取原始文案结果...');
    
    // 需要轮询的视频
    let pendingOriVideos = updatedVideotexts.filter(v => 
      v.asr_task_id && !v.video_text_ori && !v.already_has_text
    );
    
    if (pendingOriVideos.length > 0) {
      setPreviewInfo(prev => prev + `\n需要轮询原始文案的视频数量: ${pendingOriVideos.length}`);
      
      // 轮询获取原始文案
      let oriPollingAttempts = 0;
      
      while (pendingOriVideos.length > 0 && oriPollingAttempts < MAX_POLLING_ATTEMPTS) {
        oriPollingAttempts++;
        setButtonText(`原始文案轮询 ${oriPollingAttempts}/${MAX_POLLING_ATTEMPTS}...`);
        
        // 记录本轮完成的视频ID，用于从pendingOriVideos中移除
        const completedThisRound: string[] = [];
        
        for (const video of pendingOriVideos) {
          try {
            const response = await UpdateVideoTextOriGet(
              username,
              password,
              {
                aweme_id: video.aweme_id,
                asr_task_id: video.asr_task_id
              },
              setPreviewInfo
            );
            
            // 如果获取到文案
            if (response.videotext?.video_text_ori) {
              // 更新视频对象
              const videoIndex = updatedVideotexts.findIndex(v => v.aweme_id === video.aweme_id);
              if (videoIndex !== -1) {
                updatedVideotexts[videoIndex].video_text_ori = response.videotext.video_text_ori;
              }
              completedThisRound.push(video.aweme_id);
              processingErrors.delete(video.aweme_id); // 移除可能存在的错误记录
            }
            // 处理中状态不做特殊处理，继续下一轮轮询
          } catch (error: any) {
            processingErrors.set(video.aweme_id, `获取原始文案失败: ${error.message}`);
            completedThisRound.push(video.aweme_id); // 错误也从队列中移除，不再重试
          }
        }
        
        // 更新待处理列表
        pendingOriVideos = pendingOriVideos.filter(v => !completedThisRound.includes(v.aweme_id));
        
        // 如果还有未完成的，等待后继续
        if (pendingOriVideos.length > 0 && oriPollingAttempts < MAX_POLLING_ATTEMPTS) {
          setPreviewInfo(prev => prev + `\n等待${POLLING_INTERVAL/1000}秒后继续轮询原始文案...`);
          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        }
      }
      
      // 检查是否达到最大轮询次数仍有未完成的
      if (pendingOriVideos.length > 0) {
        for (const video of pendingOriVideos) {
          processingErrors.set(video.aweme_id, `获取原始文案超时，请稍后查看`);
        }
      }
    }
    
    // 阶段3: 发送整理文案请求
    setPreviewInfo(prev => prev + '\n开始发送整理文案请求...');
    setButtonText(`整理文案请求中...`);
    
    // 需要发送整理请求的视频
    const needArrProcess = updatedVideotexts.filter(v => 
      (v.video_text_ori || v.already_has_text) && !v.llm_task_id_list
    );
    
    if (needArrProcess.length > 0) {
      setPreviewInfo(prev => prev + `\n需要整理文案的视频数量: ${needArrProcess.length}`);
      
      for (let i = 0; i < needArrProcess.length; i++) {
        const video = needArrProcess[i];
        setButtonText(`整理文案请求 ${i+1}/${needArrProcess.length}...`);
        
        try {
          const response = await UpdateVideoTextArrPost(
            username,
            password,
            { aweme_id: video.aweme_id },
            setPreviewInfo
          );
          
          if (response.videotext?.llm_task_id_list) {
            // 更新视频对象
            const videoIndex = updatedVideotexts.findIndex(v => v.aweme_id === video.aweme_id);
            if (videoIndex !== -1) {
              updatedVideotexts[videoIndex].llm_task_id_list = response.videotext.llm_task_id_list;
            }
          } else {
            processingErrors.set(video.aweme_id, `未获取到整理文案任务ID: ${response.message}`);
          }
        } catch (error: any) {
          processingErrors.set(video.aweme_id, `整理文案请求失败: ${error.message}`);
        }
        
        // 请求间隔
        if (i < needArrProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // 阶段4: 获取整理文案
      setPreviewInfo(prev => prev + '\n开始获取整理文案结果...');
      
      // 需要轮询的视频
      let pendingArrVideos = updatedVideotexts.filter(v => 
        v.llm_task_id_list && !v.video_text_arr
      );
      
      if (pendingArrVideos.length > 0) {
        setPreviewInfo(prev => prev + `\n需要轮询整理文案的视频数量: ${pendingArrVideos.length}`);
        
        // 轮询获取整理文案
        let arrPollingAttempts = 0;
        
        while (pendingArrVideos.length > 0 && arrPollingAttempts < MAX_POLLING_ATTEMPTS) {
          arrPollingAttempts++;
          setButtonText(`整理文案轮询 ${arrPollingAttempts}/${MAX_POLLING_ATTEMPTS}...`);
          
          // 记录本轮完成的视频ID
          const completedThisRound: string[] = [];
          
          for (const video of pendingArrVideos) {
            try {
              const response = await UpdateVideoTextArrGet(
                username,
                password,
                {
                  aweme_id: video.aweme_id,
                  llm_task_id_list: video.llm_task_id_list
                },
                setPreviewInfo
              );
              
              // 如果获取到文案
              if (response.videotext?.video_text_arr) {
                // 更新视频对象
                const videoIndex = updatedVideotexts.findIndex(v => v.aweme_id === video.aweme_id);
                if (videoIndex !== -1) {
                  updatedVideotexts[videoIndex].video_text_arr = response.videotext.video_text_arr;
                }
                completedThisRound.push(video.aweme_id);
                processingErrors.delete(video.aweme_id); // 移除可能存在的错误记录
                successfulVideos.add(video.aweme_id); // 标记为完全成功
              }
              // 处理中状态不做特殊处理，继续下一轮轮询
            } catch (error: any) {
              processingErrors.set(video.aweme_id, `获取整理文案失败: ${error.message}`);
              completedThisRound.push(video.aweme_id); // 错误也从队列中移除，不再重试
            }
          }
          
          // 更新待处理列表
          pendingArrVideos = pendingArrVideos.filter(v => !completedThisRound.includes(v.aweme_id));
          
          // 如果还有未完成的，等待后继续
          if (pendingArrVideos.length > 0 && arrPollingAttempts < MAX_POLLING_ATTEMPTS) {
            setPreviewInfo(prev => prev + `\n等待${POLLING_INTERVAL/1000}秒后继续轮询整理文案...`);
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
          }
        }
        
        // 检查是否达到最大轮询次数仍有未完成的
        if (pendingArrVideos.length > 0) {
          for (const video of pendingArrVideos) {
            processingErrors.set(video.aweme_id, `获取整理文案超时，请稍后查看`);
          }
        }
      }
    }
    
    // 最终统计处理结果
    const successCount = updatedVideotexts.filter(v => v.video_text_ori || v.video_text_arr).length;
    const errorCount = processingErrors.size;
    const totalCount = updatedVideotexts.length;
    
    let resultMessage = `处理完成: ${successCount}/${totalCount} 个成功`;
    if (errorCount > 0) {
      resultMessage += `，${errorCount} 个失败`;
      setPreviewInfo(prev => prev + `\n${resultMessage}。失败详情: ${JSON.stringify(Object.fromEntries(processingErrors))}`);
    } else {
      setPreviewInfo(prev => prev + `\n${resultMessage}`);
    }
    
    setButtonText(resultMessage);
    
    return updatedVideotexts;
  } catch (error: any) {
    setPreviewInfo(prev => prev + `\n整体处理出错: ${error.message}`);
    throw error;
  }
};
