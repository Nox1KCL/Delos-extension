import type {
  LoadCachedTimelineMsg,
  StateChangedMsg,
  TranscriptEvent,
  VideoInfoResponse,
} from '../shared/types';
import { BLACKLISTED_PATH_PREFIXES, MSG, VIDEO_CONSTRAINTS } from '../shared/constants';
import { normalizeVideoUrl } from '../shared/utils';
import { SubtitleOverlay } from './overlay';

if (window !== window.top) {
  // Only run in the top-level window (never inside ad or widget iframes)
  throw new Error('[Delos] Subframe injection skipped');
}

let isDelosEnabled = false;
let activeVideo: HTMLVideoElement | null = null;
let domObserver: MutationObserver | null = null;
let cachedTimeline: TranscriptEvent[] = [];
let currentCueIndex = -1;
const overlay = new SubtitleOverlay();

console.log('[Delos Content] Injected on', window.location.href);

function isQualifyingVideo(video: HTMLVideoElement): boolean {
  if (
    BLACKLISTED_PATH_PREFIXES.some((prefix) =>
      window.location.pathname.startsWith(prefix)
    )
  ) {
    return false;
  }

  // Reject only if duration is a finite positive number less than minimum
  if (Number.isFinite(video.duration) && video.duration > 0 && video.duration < VIDEO_CONSTRAINTS.MIN_DURATION_SEC) {
    return false;
  }

  const rect = video.getBoundingClientRect();
  if (
    (rect.width > 0 && rect.width < VIDEO_CONSTRAINTS.MIN_WIDTH_PX) ||
    (rect.height > 0 && rect.height < VIDEO_CONSTRAINTS.MIN_HEIGHT_PX)
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
    const area = (rect.width || 640) * (rect.height || 360);
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

  if (cachedTimeline.length > 0 && activeVideo && !activeVideo.paused) {
    const curTime = activeVideo.currentTime;
    const foundIdx = cachedTimeline.findIndex((ev) => {
      const s = ev.start_sec ?? ev.startSec ?? 0;
      const e = ev.end_sec ?? ev.endSec ?? 0;
      return curTime >= s && curTime <= e + 0.3;
    });

    if (foundIdx !== -1 && foundIdx !== currentCueIndex) {
      currentCueIndex = foundIdx;
      const ev = cachedTimeline[foundIdx];
      const s = ev.start_sec ?? ev.startSec ?? 0;
      const e = ev.end_sec ?? ev.endSec ?? 0;
      overlay.showSubtitle(ev.text, s, e, true);
    } else if (foundIdx === -1 && currentCueIndex !== -1) {
      const curCue = cachedTimeline[currentCueIndex];
      const e = curCue.end_sec ?? curCue.endSec ?? 0;
      if (curTime > e + 1.2 || curTime < (curCue.start_sec ?? curCue.startSec ?? 0) - 1.0) {
        currentCueIndex = -1;
      }
    }
  }
}

function onVideoPlaybackEvent(): void {
  sendVideoTimeSync();
  currentCueIndex = -1;
  if (cachedTimeline.length > 0 && activeVideo) {
    onVideoTimeUpdate();
  }
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

  overlay.attach(video);
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
  overlay.detach();
}

function evaluateVideos(): void {
  if (!isDelosEnabled) return;

  // If already tracking a valid video attached to the DOM, do not disturb it
  if (activeVideo && document.contains(activeVideo)) {
    return;
  }

  const candidate = findMainVideo();
  if (candidate) {
    attachToVideo(candidate);
  } else if (activeVideo && !document.contains(activeVideo)) {
    detachVideo();
  }
}

function onVideoEvent(e: Event): void {
  if (e.target instanceof HTMLVideoElement) {
    evaluateVideos();
  }
}

function onFullscreenChange(): void {
  if (!isDelosEnabled) return;
  const isFs = Boolean(
    document.fullscreenElement ||
    (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
  );
  chrome.runtime.sendMessage({
    type: MSG.SET_WINDOW_FULLSCREEN,
    fullscreen: isFs,
  }).catch(() => {});
}

function startWatchingVideos(): void {
  evaluateVideos();

  document.addEventListener('loadedmetadata', onVideoEvent, true);
  document.addEventListener('durationchange', onVideoEvent, true);
  document.addEventListener('play', onVideoEvent, true);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  window.addEventListener('yt-navigate-finish', evaluateVideos);
  window.addEventListener('popstate', evaluateVideos);

  if (!domObserver) {
    domObserver = new MutationObserver(() => {
      if (!activeVideo || !document.contains(activeVideo)) {
        evaluateVideos();
      }
    });
    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

function stopWatchingVideos(): void {
  document.removeEventListener('loadedmetadata', onVideoEvent, true);
  document.removeEventListener('durationchange', onVideoEvent, true);
  document.removeEventListener('play', onVideoEvent, true);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
  window.removeEventListener('yt-navigate-finish', evaluateVideos);
  window.removeEventListener('popstate', evaluateVideos);

  chrome.runtime.sendMessage({
    type: MSG.SET_WINDOW_FULLSCREEN,
    fullscreen: false,
  }).catch(() => {});

  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  cachedTimeline = [];
  currentCueIndex = -1;
  overlay.clearSubtitle();

  detachVideo();
}

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; text?: string; startSec?: number; endSec?: number; isFinal?: boolean; active?: boolean; timeline?: TranscriptEvent[] },
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

    if (message.type === MSG.LOAD_CACHED_TIMELINE) {
      cachedTimeline = message.timeline || [];
      currentCueIndex = -1;
      console.log(
        '[Delos Content] Loaded cached timeline from DB:',
        cachedTimeline.length,
        'cues'
      );
      if (activeVideo && !activeVideo.paused) {
        onVideoTimeUpdate();
      }
      return false;
    }

    if (message.type === MSG.GET_VIDEO_INFO) {
      const video = findMainVideo();
      console.log('[Delos Content] Query video:', video ? { duration: video.duration, currentTime: video.currentTime } : 'no qualifying video');
      if (video) {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 600;
        sendResponse({
          url: normalizeVideoUrl(window.location.href),
          duration,
          currentTime: video.currentTime || 0,
        });
      }
      return false;
    }

    if (message.type === MSG.SUBTITLE) {
      console.log(
        `[Delos] Subtitle [${message.startSec?.toFixed(1)}s–${message.endSec?.toFixed(1)}s]:`,
        message.text
      );
      if (message.text) {
        if (!activeVideo || !document.contains(activeVideo)) {
          evaluateVideos();
        }
        overlay.showSubtitle(
          message.text,
          message.startSec ?? 0,
          message.endSec ?? 0,
          message.isFinal ?? false
        );
      }
      return false;
    }

    return false;
  }
);
