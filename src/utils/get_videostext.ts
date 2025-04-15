import axios from 'axios';
import pLimit from 'p-limit';
import { ProcessingVideo, VideoTextApiResponse } from '../index';
import { API_BASE_URL } from '../index';

// 阶段1: 提交ASR任务
export const submitAsrTasks = async (
  videos: ProcessingVideo[],
  username: string,
  passtoken: string,
  updateProgress: (count: number, total: number) => void
) => {
  const limit = pLimit(5);
  let asrPostCount = 0;
  const asrPostPromises = videos.map(video =>
    limit(async () => {
      video.status = 'asr_posting';
      try {
        const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-ori-post`, {
          username,
          passtoken,
          videotext: { aweme_id: video.aweme_id, play_addr: video.play_addr, audio_addr: video.audio_addr }
        }).then(res => res.data);

        if (response.videotext?.asr_task_id) {
          video.asr_task_id = response.videotext.asr_task_id;
          if (video.asr_task_id === "EXIST") {
            video.video_text_ori = response.videotext.video_text_ori;
            video.status = 'asr_done';
          } else {
            video.status = 'asr_polling';
          }
        } else {
          throw new Error(response.message || '未返回有效的 ASR 任务 ID 或 EXIST 标记');
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || error.message || '提交 ASR 任务失败';
        video.status = 'failed';
        video.error = `ASR提交失败: ${errorMsg}`;
      } finally {
        updateProgress(asrPostCount + 1, videos.length);
      }
    })
  );
  await Promise.allSettled(asrPostPromises);
};

// 阶段2: 轮询ASR结果
export const pollAsrResults = async (
  videos: ProcessingVideo[],
  username: string,
  passtoken: string,
  updateProgress: (completed: number, total: number, attempt: number) => void
) => {
  const limit = pLimit(5);
  const POLLING_INTERVAL = 5000;
  const MAX_POLLING_ATTEMPTS = 12;
  
  let videosToPoll = videos.filter(v => v.status === 'asr_polling');
  let attempts = 0;

  while (videosToPoll.length > 0 && attempts < MAX_POLLING_ATTEMPTS) {
    attempts++;
    const asrGetPromises = videosToPoll.map(video =>
      limit(async () => {
        if (!video.asr_task_id) return;
        try {
          const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-ori-get`, {
            username,
            passtoken,
            videotext: { aweme_id: video.aweme_id, asr_task_id: video.asr_task_id }
          }).then(res => res.data);

          if (response.videotext?.video_text_ori) {
            video.video_text_ori = response.videotext.video_text_ori;
            video.status = 'asr_done';
          }
        } catch (error) {
          console.log(`视频 ${video.aweme_id} ASR 查询无结果，继续轮询...`);
        }
      })
    );
    await Promise.allSettled(asrGetPromises);

    videosToPoll = videos.filter(v => v.status === 'asr_polling');
    const completed = videos.filter(v => v.status === 'asr_done' || v.status === 'failed').length;
    updateProgress(completed, videos.length, attempts);

    if (videosToPoll.length > 0 && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
  }

  videosToPoll.forEach(v => {
    v.status = 'failed';
    v.error = 'ASR 处理超时';
  });
};

// 阶段3: 提交LLM任务
export const submitLlmTasks = async (
  videos: ProcessingVideo[],
  username: string,
  passtoken: string,
  updateProgress: (count: number, total: number) => void
) => {
  const limit = pLimit(5);
  const videosForLlm = videos.filter(v => v.status === 'asr_done' && v.video_text_ori);
  let llmPostCount = 0;
  const llmPostPromises = videosForLlm.map(video =>
    limit(async () => {
      video.status = 'llm_posting';
      try {
        const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-arr-post`, {
          username,
          passtoken,
          videotext: { aweme_id: video.aweme_id }
        }).then(res => res.data);

        if (response.videotext?.llm_task_id_list) {
          video.llm_task_id_list = response.videotext.llm_task_id_list;
          if (video.llm_task_id_list[0]?.conversation_id === "EXIST") {
            video.video_text_arr = response.videotext.video_text_arr;
            video.status = 'llm_done';
          } else {
            video.status = 'llm_polling';
          }
        } else {
          throw new Error(response.message || '未返回有效的 LLM 任务 ID 列表或 EXIST 标记');
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || error.message || '提交 LLM 任务失败';
        video.status = 'failed';
        video.error = `LLM提交失败: ${errorMsg}`;
      } finally {
        updateProgress(llmPostCount + 1, videosForLlm.length);
      }
    })
  );
  await Promise.allSettled(llmPostPromises);
};

// 阶段4: 轮询LLM结果
export const pollLlmResults = async (
  videos: ProcessingVideo[],
  username: string,
  passtoken: string,
  updateProgress: (completed: number, total: number, attempt: number) => void
) => {
  const limit = pLimit(5);
  const POLLING_INTERVAL = 5000;
  const MAX_POLLING_ATTEMPTS = 12;
  
  let videosToPoll = videos.filter(v => v.status === 'llm_polling');
  let attempts = 0;

  while (videosToPoll.length > 0 && attempts < MAX_POLLING_ATTEMPTS) {
    attempts++;
    const llmGetPromises = videosToPoll.map(video =>
      limit(async () => {
        if (!video.llm_task_id_list || video.llm_task_id_list[0]?.conversation_id === "EXIST") return;
        try {
          const response: VideoTextApiResponse = await axios.post(`${API_BASE_URL}/api/videotext/update-arr-get`, {
            username, 
            passtoken,
            videotext: { aweme_id: video.aweme_id, llm_task_id_list: video.llm_task_id_list }
          }).then(res => res.data);

          if (response.videotext?.video_text_arr) {
            video.video_text_arr = response.videotext.video_text_arr;
            video.status = 'llm_done';
          } else if (response.message.includes("处理中")) {
            console.log(`视频 ${video.aweme_id} LLM 仍在处理中...`);
          } else {
            throw new Error(response.message || '获取 LLM 结果状态未知');
          }
        } catch (error: any) {
          const errorMsg = error.response?.data?.detail || error.message || '查询 LLM 结果失败';
          video.status = 'failed';
          video.error = `LLM查询失败: ${errorMsg}`;
        }
      })
    );
    await Promise.allSettled(llmGetPromises);

    videosToPoll = videos.filter(v => v.status === 'llm_polling');
    const completed = videos.length - videos.filter(v => v.status === 'failed' || v.status === 'llm_polling').length;
    updateProgress(completed, videos.length, attempts);

    if (videosToPoll.length > 0 && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
  }

  videosToPoll.forEach(v => {
    v.status = 'failed';
    v.error = 'LLM 轮询超时';
  });
};
