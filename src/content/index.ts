import type { StateChangedMsg, VideoInfoResponse } from '../shared/types';
import { BLACKLISTED_PATH_PREFIXES, MSG, VIDEO_CONSTRAINTS } from '../shared/constants';

let isDelosEnabled = false;
let activeVideo: HTMLVideoElement | null = null;
let domObserver: MutationObserver | null = null;

console.log('[Delos Content] Injected on', window.location.href);

function isQualifyingVideo(video: HTMLVideoElement): boolean {
  if (
    BLACKLISTED_PATH_PREFIXES.some((prefix) =>
      window.location.pathname.startsWith(prefix)
    )
  ) {
    return false;
  }

  if (!Number.isFinite(video.duration) || video.duration < VIDEO_CONSTRAINTS.MIN_DURATION_SEC) {
    return false;
  }

  const rect = video.getBoundingClientRect();
  if (
    rect.width < VIDEO_CONSTRAINTS.MIN_WIDTH_PX ||
    rect.height < VIDEO_CONSTRAINTS.MIN_HEIGHT_PX
  ) {
    return false;
  }

  return true;
}

function findMainVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll('video'));
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;

  for (const video of videos) {
    if (!isQualifyingVideo(video)) continue;
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = video;
    }
  }

  return best;
}

let lastTimeSync = 0;

function sendVideoTimeSync(): void {
  if (!activeVideo || !isDelosEnabled) return;
  chrome.runtime.sendMessage({
    type: MSG.VIDEO_TIME_SYNC,
    currentTime: activeVideo.currentTime,
    paused: activeVideo.paused,
    playbackRate: activeVideo.playbackRate || 1,
  }).catch(() => {});
}

function onVideoTimeUpdate(): void {
  const now = Date.now();
  if (now - lastTimeSync >= 1000) {
    lastTimeSync = now;
    sendVideoTimeSync();
  }
}

function onVideoPlaybackEvent(): void {
  sendVideoTimeSync();
}

function attachToVideo(video: HTMLVideoElement): void {
  if (activeVideo === video) return;
  detachVideo();
  activeVideo = video;

  video.addEventListener('timeupdate', onVideoTimeUpdate);
  video.addEventListener('seeked', onVideoPlaybackEvent);
  video.addEventListener('pause', onVideoPlaybackEvent);
  video.addEventListener('play', onVideoPlaybackEvent);
  video.addEventListener('ratechange', onVideoPlaybackEvent);

  sendVideoTimeSync();
}

function detachVideo(): void {
  if (activeVideo) {
    activeVideo.removeEventListener('timeupdate', onVideoTimeUpdate);
    activeVideo.removeEventListener('seeked', onVideoPlaybackEvent);
    activeVideo.removeEventListener('pause', onVideoPlaybackEvent);
    activeVideo.removeEventListener('play', onVideoPlaybackEvent);
    activeVideo.removeEventListener('ratechange', onVideoPlaybackEvent);
    activeVideo = null;
  }
}

function evaluateVideos(): void {
  if (!isDelosEnabled) return;

  const candidate = findMainVideo();
  if (candidate) {
    attachToVideo(candidate);
  } else if (activeVideo && !isQualifyingVideo(activeVideo)) {
    detachVideo();
  }
}

function onVideoEvent(e: Event): void {
  if (e.target instanceof HTMLVideoElement) {
    evaluateVideos();
  }
}

function startWatchingVideos(): void {
  evaluateVideos();

  document.addEventListener('loadedmetadata', onVideoEvent, true);
  document.addEventListener('durationchange', onVideoEvent, true);
  document.addEventListener('play', onVideoEvent, true);

  if (!domObserver) {
    domObserver = new MutationObserver(() => evaluateVideos());
    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

function stopWatchingVideos(): void {
  document.removeEventListener('loadedmetadata', onVideoEvent, true);
  document.removeEventListener('durationchange', onVideoEvent, true);
  document.removeEventListener('play', onVideoEvent, true);

  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  detachVideo();
}

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; text?: string; startSec?: number; endSec?: number; isFinal?: boolean; active?: boolean },
    _sender,
    sendResponse: (r?: VideoInfoResponse | undefined) => void
  ) => {
    if (message.type === MSG.STATE_CHANGED) {
      isDelosEnabled = (message as StateChangedMsg).active;
      if (isDelosEnabled) {
        startWatchingVideos();
      } else {
        stopWatchingVideos();
      }
      return false;
    }

    if (message.type === MSG.GET_VIDEO_INFO) {
      const video = findMainVideo();
      console.log('[Delos Content] Query video:', video ? { duration: video.duration, currentTime: video.currentTime } : 'no qualifying video');
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        sendResponse({
          url: window.location.href,
          duration: video.duration,
          currentTime: video.currentTime,
        });
      }
      return false;
    }

    if (message.type === MSG.SUBTITLE) {
      console.log(
        `[Delos] Subtitle [${message.startSec?.toFixed(1)}s–${message.endSec?.toFixed(1)}s]:`,
        message.text
      );
      return false;
    }

    return false;
  }
);
