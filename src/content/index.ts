import type { StateChangedMsg } from '../shared/types';
import { BLACKLISTED_PATH_PREFIXES, MSG, VIDEO_CONSTRAINTS } from '../shared/constants';

let isDelosEnabled = false;
let activeVideo: HTMLVideoElement | null = null;
let domObserver: MutationObserver | null = null;

function isQualifyingVideo(video: HTMLVideoElement): boolean {
  if (
    BLACKLISTED_PATH_PREFIXES.some((prefix) =>
      window.location.pathname.startsWith(prefix)
    )
  ) {
    return false;
  }

  if (Number.isNaN(video.duration) || video.duration < VIDEO_CONSTRAINTS.MIN_DURATION_SEC) {
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

function attachToVideo(video: HTMLVideoElement): void {
  if (activeVideo === video) return;
  activeVideo = video;

  const durationLabel = Number.isFinite(video.duration)
    ? `${Math.round(video.duration)}s`
    : 'LIVE';
  console.log(
    `[Delos] Activated on qualifying <video> (${durationLabel}) in`,
    window.location.hostname
  );
}

function detachVideo(): void {
  if (activeVideo) {
    console.log('[Delos] Deactivated on', window.location.hostname);
    activeVideo = null;
  }
}

function evaluateVideos(): void {
  if (!isDelosEnabled) return;

  const candidate = findMainVideo();
  if (candidate) {
    attachToVideo(candidate);
  } else if (activeVideo && ! isQualifyingVideo(activeVideo)) {
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

chrome.runtime.onMessage.addListener((message: StateChangedMsg) => {
  if (message.type !== MSG.STATE_CHANGED) return;

  isDelosEnabled = message.active;
  if (isDelosEnabled) {
    startWatchingVideos();
  } else {
    stopWatchingVideos();
  }
});
