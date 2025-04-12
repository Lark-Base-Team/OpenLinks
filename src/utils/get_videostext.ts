import React from 'react';
import axios from 'axios';

// 定义后端 API 的基础 URL
// const API_BASE_URL = 'https://www.ccai.fun';
const API_BASE_URL = ''; // 使用相对路径触发代理

// 接口定义
interface VideoText {
  aweme_id: string;
  play_addr?: string | null;
  audio_addr?: string | null;
  video_text_ori?: string | null; // 原始 ASR 结果
  video_text_arr?: string | null; // LLM 整理结果
  asr_task_id?: string | null;    // ASR 任务 ID
  llm_task_id_list?: { conversation_id: string; chat_id: string }[] | null; // LLM 任务 ID 列表
  recordId?: string; // 对应的飞书表格记录 ID
  duration?: number; // 视频时长（秒）
}

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 统一的 API 请求函数
async function makeApiRequest(
  endpoint: string,
  data: any,
  logger: (message: string) => void,
  method: 'post' | 'get' = 'post'
): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  logger(`发送 ${method.toUpperCase()} 请求到: ${url}`);
  logger(`请求数据: ${JSON.stringify(data, null, 2)}`);
  try {
    const response = await axios({ method, url, data });
    logger(`收到响应: ${JSON.stringify(response.data, null, 2)}`);
    if (response.data && response.data.status === 'success') {
      return response.data.data; // 返回 data 部分
    } else {
      const errorMessage = `API 请求失败 (${endpoint}): ${response.data?.message || '未知错误'}`;
      logger(errorMessage);
      throw new Error(errorMessage);
    }
  } catch (error) {
    logger(`API 请求 (${endpoint}) 捕获到错误: ${error}`);
    if (axios.isAxiosError(error)) {
      logger(`Axios 错误详情: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
    }
    throw error; // 继续向上抛出错误
  }
}

// 阶段一：提交 ASR 任务
async function submitAsrTasks(
  videos: VideoText[],
  username: string,
  password: string,
  logger: (message: string) => void
): Promise<VideoText[]> {
  logger("--- 阶段一：提交 ASR 任务 ---");
  const endpoint = '/api/text/submitAsrTask';
  const results: VideoText[] = [];

  for (const video of videos) {
    // 检查时长是否超过 300 秒 (5分钟)
    if (video.duration && video.duration > 300) {
        logger(`视频 ${video.aweme_id} 时长 ${video.duration} 秒，超过 300 秒限制，跳过 ASR 任务提交。`);
        results.push(video); // 仍然将视频信息传递到下一步，但不包含 asr_task_id
        continue; // 跳过当前循环
    }

    // 只有在时长符合条件时才提交任务
    const data = {
    username,
    password,
      aweme_id: video.aweme_id,
      play_addr: video.play_addr,
      audio_addr: video.audio_addr,
    };
    try {
      const responseData = await makeApiRequest(endpoint, data, logger);
      if (responseData && responseData.task_id) {
        logger(`视频 ${video.aweme_id} 的 ASR 任务提交成功，任务 ID: ${responseData.task_id}`);
        results.push({ ...video, asr_task_id: responseData.task_id });
      } else {
        logger(`视频 ${video.aweme_id} 的 ASR 任务提交响应缺少 task_id`);
        results.push(video); // 即使失败也保留原始信息
      }
    } catch (error) {
      logger(`视频 ${video.aweme_id} 的 ASR 任务提交失败: ${error}`);
      results.push(video); // 即使失败也保留原始信息
    }
    await delay(500); // 短暂延迟避免请求过于频繁
  }
  logger("--- 阶段一完成 ---");
  return results;
}


// 阶段二：查询 ASR 结果
async function queryAsrResults(
  videos: VideoText[],
  username: string,
  password: string,
  logger: (message: string) => void,
  setTextButtonText: (text: string) => void
): Promise<VideoText[]> {
  logger("--- 阶段二：查询 ASR 结果 ---");
  const endpoint = '/api/text/queryAsrResult';
  let completedCount = 0;
  const totalTasks = videos.filter(v => v.asr_task_id).length; // 只计算提交了任务的视频
  const maxRetries = 10; // 最多查询次数
  const initialDelay = 5000; // 初始延迟 5 秒
  const results: VideoText[] = [...videos]; // 创建副本以修改

  if (totalTasks === 0) {
      logger("没有需要查询的 ASR 任务。");
      logger("--- 阶段二完成 ---");
      return results;
  }

  for (let retry = 0; retry < maxRetries; retry++) {
    logger(`ASR 结果查询轮次 ${retry + 1}/${maxRetries}...`);
    let tasksToCheck = results.filter(v => v.asr_task_id && !v.video_text_ori); // 筛选出有任务ID且尚未获取结果的

    if (tasksToCheck.length === 0) {
      logger("所有 ASR 任务已完成或达到最大查询次数。");
      break; // 如果没有需要检查的任务了，提前退出循环
    }

    logger(`本轮需要查询 ${tasksToCheck.length} 个 ASR 任务结果...`);
    setTextButtonText(`查询ASR(${completedCount}/${totalTasks})`);

    for (let i = 0; i < tasksToCheck.length; i++) {
      const video = tasksToCheck[i];
      if (!video.asr_task_id) continue; // 双重检查

      const data = {
    username,
    password,
        task_id: video.asr_task_id,
      };

      try {
        const responseData = await makeApiRequest(endpoint, data, logger);
        if (responseData && responseData.status === 'completed' && responseData.video_text_ori) {
          logger(`视频 ${video.aweme_id} (任务 ${video.asr_task_id}) ASR 完成，获取到文案。`);
          // 更新 results 数组中对应项的 video_text_ori
          const index = results.findIndex(v => v.asr_task_id === video.asr_task_id);
          if (index !== -1) {
            results[index] = { ...results[index], video_text_ori: responseData.video_text_ori };
            completedCount++;
            setTextButtonText(`查询ASR(${completedCount}/${totalTasks})`);
          }
        } else if (responseData && responseData.status === 'processing') {
          logger(`视频 ${video.aweme_id} (任务 ${video.asr_task_id}) ASR 仍在处理中...`);
        } else {
          logger(`视频 ${video.aweme_id} (任务 ${video.asr_task_id}) ASR 状态未知或失败: ${responseData?.status}`);
          // 可选：标记为失败或移除 task_id 以免重复查询
           const index = results.findIndex(v => v.asr_task_id === video.asr_task_id);
           if (index !== -1) {
             results[index] = { ...results[index], asr_task_id: null }; // 标记为无需再查
             logger(`将任务 ${video.asr_task_id} 标记为不再查询。`);
           }
        }
      } catch (error) {
        logger(`查询视频 ${video.aweme_id} (任务 ${video.asr_task_id}) ASR 结果失败: ${error}`);
         // 可选：标记为失败或移除 task_id
         const index = results.findIndex(v => v.asr_task_id === video.asr_task_id);
         if (index !== -1) {
           results[index] = { ...results[index], asr_task_id: null }; // 标记为无需再查
           logger(`将任务 ${video.asr_task_id} 因查询错误标记为不再查询。`);
         }
      }
      await delay(500); // 查询间隔
    }

    // 如果所有任务都已完成，提前结束
    if (results.every(v => !v.asr_task_id || v.video_text_ori)) {
       logger("所有需要查询的 ASR 任务均已获取结果。");
       break;
    }


    // 如果不是最后一轮，则等待更长时间再进行下一轮查询
    if (retry < maxRetries - 1) {
      const waitTime = initialDelay * (retry + 1); // 逐渐增加等待时间
      logger(`等待 ${waitTime / 1000} 秒后进行下一轮查询...`);
      await delay(waitTime);
    }
  }

  const remainingTasks = results.filter(v => v.asr_task_id && !v.video_text_ori).length;
  if (remainingTasks > 0) {
      logger(`警告：仍有 ${remainingTasks} 个 ASR 任务未能在最大查询次数内获取结果。`);
    } else {
      logger("所有 ASR 任务查询完毕。");
  }

  setTextButtonText(`查询ASR(${completedCount}/${totalTasks}) - 完成`);
  logger("--- 阶段二完成 ---");
  return results;
}

// 阶段三：提交 LLM 任务
async function submitLlmTasks(
  videos: VideoText[],
  username: string,
  password: string,
  logger: (message: string) => void
): Promise<VideoText[]> {
  logger("--- 阶段三：提交 LLM 任务 ---");
  const endpoint = '/api/text/submitLlmTask';
  const results: VideoText[] = [];

  for (const video of videos) {
    // 只为有原始文案的视频提交 LLM 任务
    if (video.video_text_ori) {
      const data = {
    username,
    password,
        aweme_id: video.aweme_id,
        video_text_ori: video.video_text_ori,
      };
      try {
        const responseData = await makeApiRequest(endpoint, data, logger);
        // 注意：LLM 提交接口返回的是包含 conversation_id 和 chat_id 的对象列表
        if (responseData && Array.isArray(responseData) && responseData.length > 0) {
          logger(`视频 ${video.aweme_id} 的 LLM 任务提交成功，任务 ID 列表: ${JSON.stringify(responseData)}`);
          results.push({ ...video, llm_task_id_list: responseData });
        } else {
          logger(`视频 ${video.aweme_id} 的 LLM 任务提交响应无效或为空`);
          results.push(video);
        }
      } catch (error) {
        logger(`视频 ${video.aweme_id} 的 LLM 任务提交失败: ${error}`);
        results.push(video);
      }
    } else {
      logger(`视频 ${video.aweme_id} 没有原始文案，跳过 LLM 任务提交。`);
      results.push(video); // 保留没有原始文案的视频
    }
    await delay(500); // 短暂延迟
  }
  logger("--- 阶段三完成 ---");
  return results;
}

// 阶段四：查询 LLM 结果
async function queryLlmResults(
  videos: VideoText[],
  username: string,
  password: string,
  logger: (message: string) => void,
  setTextButtonText: (text: string) => void
): Promise<VideoText[]> {
  logger("--- 阶段四：查询 LLM 结果 ---");
  const endpoint = '/api/text/queryLlmResult';
  let completedCount = 0;
  // 总任务数是所有视频中 llm_task_id_list 数组元素的总和
  const totalTasks = videos.reduce((sum, v) => sum + (v.llm_task_id_list ? v.llm_task_id_list.length : 0), 0);
  const maxRetries = 10;
  const initialDelay = 5000;
  const results: VideoText[] = [...videos]; // 创建副本

  if (totalTasks === 0) {
      logger("没有需要查询的 LLM 任务。");
      logger("--- 阶段四完成 ---");
      return results;
  }

  // 用于跟踪每个视频是否已获取最终整理文案
  const videoCompletionStatus: { [aweme_id: string]: boolean } = {};
  results.forEach(v => {
      if (v.llm_task_id_list && v.llm_task_id_list.length > 0) {
          videoCompletionStatus[v.aweme_id] = false;
        } else {
          videoCompletionStatus[v.aweme_id] = true; // 没有任务ID，视为已完成
      }
  });


  for (let retry = 0; retry < maxRetries; retry++) {
    logger(`LLM 结果查询轮次 ${retry + 1}/${maxRetries}...`);

    // 筛选出尚未完成整理的视频
    let videosToCheck = results.filter(v => v.llm_task_id_list && v.llm_task_id_list.length > 0 && !videoCompletionStatus[v.aweme_id]);

    if (videosToCheck.length === 0) {
      logger("所有 LLM 任务已完成或达到最大查询次数。");
      break;
    }

    logger(`本轮需要查询 ${videosToCheck.length} 个视频的 LLM 任务结果...`);
    // 更新按钮文本，显示已完成整理的视频数量
    const videosCompleted = Object.values(videoCompletionStatus).filter(status => status).length;
    const totalVideosWithTasks = Object.keys(videoCompletionStatus).length;
    setTextButtonText(`整理文案(${videosCompleted}/${totalVideosWithTasks})`);


    for (let i = 0; i < videosToCheck.length; i++) {
      const video = videosToCheck[i];
      if (!video.llm_task_id_list || video.llm_task_id_list.length === 0) continue; // 双重检查

      // LLM 可能有多个任务ID，我们需要查询每一个
      // 通常我们只需要最后一个任务的结果作为最终整理文案
      const lastTask = video.llm_task_id_list[video.llm_task_id_list.length - 1];

      const data = {
              username,
              password,
        conversation_id: lastTask.conversation_id,
        chat_id: lastTask.chat_id,
      };

      try {
        const responseData = await makeApiRequest(endpoint, data, logger);
        // LLM 查询结果直接在 data 字段中包含 video_text_arr
        if (responseData && responseData.status === 'completed' && responseData.video_text_arr) {
          logger(`视频 ${video.aweme_id} (任务 ${lastTask.chat_id}) LLM 完成，获取到整理文案。`);
          // 更新 results 数组中对应项的 video_text_arr
          const index = results.findIndex(v => v.aweme_id === video.aweme_id);
          if (index !== -1) {
            results[index] = { ...results[index], video_text_arr: responseData.video_text_arr };
            videoCompletionStatus[video.aweme_id] = true; // 标记该视频已完成
            completedCount++; // 这里可以理解为完成了一个视频的整理
          }
        } else if (responseData && responseData.status === 'processing') {
          logger(`视频 ${video.aweme_id} (任务 ${lastTask.chat_id}) LLM 仍在处理中...`);
        } else {
          logger(`视频 ${video.aweme_id} (任务 ${lastTask.chat_id}) LLM 状态未知或失败: ${responseData?.status}`);
           // 标记为完成（不再查询），即使失败
           videoCompletionStatus[video.aweme_id] = true;
           logger(`将视频 ${video.aweme_id} 标记为不再查询 LLM 结果。`);
        }
      } catch (error) {
        logger(`查询视频 ${video.aweme_id} (任务 ${lastTask.chat_id}) LLM 结果失败: ${error}`);
         // 标记为完成（不再查询），即使失败
         videoCompletionStatus[video.aweme_id] = true;
         logger(`将视频 ${video.aweme_id} 因查询错误标记为不再查询 LLM 结果。`);
      }
      await delay(500); // 查询间隔
    }

     // 更新按钮文本
    const finalVideosCompleted = Object.values(videoCompletionStatus).filter(status => status).length;
    setTextButtonText(`整理文案(${finalVideosCompleted}/${totalVideosWithTasks})`);


    // 如果所有视频都已完成，提前结束
    if (Object.values(videoCompletionStatus).every(status => status)) {
       logger("所有需要查询的 LLM 任务均已获取结果或标记完成。");
       break;
    }


    // 等待下一轮
    if (retry < maxRetries - 1) {
      const waitTime = initialDelay * (retry + 1);
      logger(`等待 ${waitTime / 1000} 秒后进行下一轮查询...`);
      await delay(waitTime);
    }
  }

  const remainingVideos = Object.entries(videoCompletionStatus).filter(([id, status]) => !status).length;
  if (remainingVideos > 0) {
      logger(`警告：仍有 ${remainingVideos} 个视频的 LLM 任务未能在最大查询次数内获取最终结果。`);
  } else {
      logger("所有 LLM 任务查询完毕。");
  }

  const finalVideosCompleted = Object.values(videoCompletionStatus).filter(status => status).length;
  setTextButtonText(`整理文案(${finalVideosCompleted}/${totalVideosWithTasks}) - 完成`);
  logger("--- 阶段四完成 ---");
  return results;
}


// 主处理函数
export async function processVideoTexts(
  initialVideos: VideoText[],
  username: string,
  password: string,
  logger: (message: string) => void, // 修改参数类型
  setTextButtonText: (text: string) => void
): Promise<VideoText[]> {
  logger("开始处理视频文案...");

  if (!username || !password) {
    logger("错误：用户名和密码不能为空");
    return initialVideos; // 返回原始数据
  }
  if (!initialVideos || initialVideos.length === 0) {
    logger("没有需要处理的视频");
    return [];
  }

  try {
    // 阶段一：提交 ASR
    let videosAfterAsrSubmit = await submitAsrTasks(initialVideos, username, password, logger);

    // 阶段二：查询 ASR
    let videosAfterAsrQuery = await queryAsrResults(videosAfterAsrSubmit, username, password, logger, setTextButtonText);

    // 阶段三：提交 LLM
    let videosAfterLlmSubmit = await submitLlmTasks(videosAfterAsrQuery, username, password, logger);

    // 阶段四：查询 LLM
    let finalVideos = await queryLlmResults(videosAfterLlmSubmit, username, password, logger, setTextButtonText);

    logger("视频文案处理流程完成。");
    return finalVideos;

  } catch (error) {
    logger(`处理视频文案过程中发生严重错误: ${error}`);
    return initialVideos; // 发生错误时返回处理到当前阶段的数据或初始数据
  } finally {
     // 可以在这里重置按钮文本，或者由调用者处理
     // setTextButtonText('开始获取文案');
  }
}
