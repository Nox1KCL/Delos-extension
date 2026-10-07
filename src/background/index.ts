import {
  BACKEND_CACHE_URL,
  BACKEND_TRANSLATE_URL,
  BACKEND_WS_URL,
  BLACKLISTED_HOSTS,
  BLACKLISTED_PATH_PREFIXES,
  DEFAULT_GROQ_MODEL,
  DEFAULT_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  MSG,
  STORAGE_KEYS,
} from '../shared/constants';
import { normalizeVideoUrl } from '../shared/utils';
import type {
  StartCaptureMsg,
  StatusResponse,
  StopCaptureMsg,
  SubtitleMsg,
  ToBackgroundMsg,
  ToggleResponse,
  TranscriptEvent,
  TranslateWordMsg,
  TranslateWordResponse,
  VideoAttachedMsg,
  VideoInfoResponse,
} from '../shared/types';

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/index.html';
const ACTIVE_TAB_SESSION_KEY = 'activeTabId';

const ACTIVE_ICON_PATHS: Record<string, string> = {
  16: '/icons/icon-16.png',
  32: '/icons/icon-32.png',
  48: '/icons/icon-48.png',
  128: '/icons/icon-128.png',
};

const INACTIVE_ICON_PATHS: Record<string, string> = {
  16: '/icons/icon-off-16.png',
  32: '/icons/icon-off-32.png',
  48: '/icons/icon-off-48.png',
  128: '/icons/icon-off-128.png',
};

let creatingOffscreenPromise: Promise<void> | null = null;
let currentCaptureSession: {
  tabId: number;
  url: string;
  duration: number;
} | null = null;
let isStartingCapture = false;

function isBlacklisted(url: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url);

    if (protocol !== 'http:' && protocol !== 'https:') {
      return true;
    }

    const hostBlocked = BLACKLISTED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
    if (hostBlocked) return true;

    const pathBlocked = BLACKLISTED_PATH_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix)
    );
    return pathBlocked;
  } catch {
    return true;
  }
}

async function updateToolbarIcon(tabId: number, active: boolean): Promise<void> {
  const path = active ? ACTIVE_ICON_PATHS : INACTIVE_ICON_PATHS;
  try {
    await chrome.action.setIcon({ tabId, path });
  } catch {}
}

async function syncToolbarIconForTab(tabId: number): Promise<void> {
  const active = await getTabActive(tabId);
  await updateToolbarIcon(tabId, active);
}

async function getActiveTabId(): Promise<number | null> {
  const result = await chrome.storage.session.get(ACTIVE_TAB_SESSION_KEY);
  const id = result[ACTIVE_TAB_SESSION_KEY];
  return typeof id === 'number' ? id : null;
}

async function getTabActive(tabId: number): Promise<boolean> {
  const activeTabId = await getActiveTabId();
  return activeTabId === tabId;
}

async function setActiveTabId(tabId: number | null): Promise<void> {
  const prev = await getActiveTabId();

  if (tabId !== null) {
    await chrome.storage.session.set({
      [ACTIVE_TAB_SESSION_KEY]: tabId,
      [`tab_${tabId}`]: true,
    });
    await updateToolbarIcon(tabId, true);
  } else {
    const keysToRemove = [ACTIVE_TAB_SESSION_KEY];
    if (prev !== null) {
      keysToRemove.push(`tab_${prev}`);
    }
    await chrome.storage.session.remove(keysToRemove);
    if (prev !== null) {
      await updateToolbarIcon(prev, false);
    }
  }
}

async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return (result[STORAGE_KEYS.API_KEY] as string) || null;
}

async function getLanguage(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LANGUAGE);
  return (result[STORAGE_KEYS.LANGUAGE] as string) || DEFAULT_LANGUAGE;
}

async function getTargetLanguage(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TARGET_LANGUAGE);
  return (result[STORAGE_KEYS.TARGET_LANGUAGE] as string) || DEFAULT_TARGET_LANGUAGE;
}

async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  if ('getContexts' in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.AUDIO_PLAYBACK,
      ],
      justification: 'Capture tab audio for real-time speech-to-text and loopback playback',
    })
    .finally(() => {
      creatingOffscreenPromise = null;
    });

  await creatingOffscreenPromise;
}

function getTabMediaStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        reject(
          new Error(
            chrome.runtime.lastError?.message || 'Failed to obtain tab media stream ID'
          )
        );
        return;
      }
      resolve(streamId);
    });
  });
}

const tabVideoFrames = new Map<number, number>();

function sendToTabFrames(tabId: number, message: unknown): void {
  const targetFrameId = tabVideoFrames.get(tabId);
  if (typeof targetFrameId === 'number' && targetFrameId !== 0) {
    chrome.tabs.sendMessage(tabId, message, { frameId: targetFrameId }).catch(() => {});
  }
  chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {});
}

async function getVideoInfo(tabId: number): Promise<VideoInfoResponse | null> {
  let canonicalUrl = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    canonicalUrl = tab?.url || '';
  } catch {}

  const knownFrameId = tabVideoFrames.get(tabId);
  if (typeof knownFrameId === 'number') {
    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: MSG.GET_VIDEO_INFO },
        { frameId: knownFrameId }
      );
      if (response?.duration > 0) {
        return {
          url: canonicalUrl || response.url,
          duration: response.duration,
          currentTime: response.currentTime || 0,
        };
      }
    } catch {}
  }

  try {
    const response = await chrome.tabs.sendMessage(
      tabId,
      { type: MSG.GET_VIDEO_INFO },
      { frameId: 0 }
    );
    if (response?.duration > 0) {
      tabVideoFrames.set(tabId, 0);
      return {
        url: canonicalUrl || response.url,
        duration: response.duration,
        currentTime: response.currentTime || 0,
      };
    }
  } catch {}

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const videos = Array.from(document.querySelectorAll('video'));
        let best: { duration: number; currentTime: number } | null = null;
        let bestArea = 0;
        for (const v of videos) {
          if (Number.isFinite(v.duration) && v.duration > 0 && v.duration < 1) continue;
          const rect = v.getBoundingClientRect();
          const w = rect.width || v.offsetWidth || v.videoWidth || 640;
          const h = rect.height || v.offsetHeight || v.videoHeight || 360;
          const area = w * h;
          if (area > bestArea) {
            bestArea = area;
            best = {
              duration: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0,
              currentTime: v.currentTime || 0,
            };
          }
        }
        return best;
      },
    });

    for (const res of results) {
      if (res.result) {
        const targetFrameId = res.frameId ?? 0;
        tabVideoFrames.set(tabId, targetFrameId);
        return {
          url: canonicalUrl || '',
          duration: res.result.duration,
          currentTime: res.result.currentTime,
        };
      }
    }
  } catch (err) {
    console.warn('[Delos Background] Scripting executeScript query failed:', err);
  }

  return null;
}

async function computeEpisodeHash(
  url: string,
  duration: number,
  language: string
): Promise<string> {
  const cleanUrl = normalizeVideoUrl(url);
  const roundedSec = Math.round(duration);
  const combined = `${cleanUrl}_${roundedSec}_${language}`;
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(combined)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function checkSubtitleCache(
  videoUrl: string,
  duration: number,
  language: string
): Promise<TranscriptEvent[] | null> {
  try {
    const hash = await computeEpisodeHash(videoUrl, duration, language);
    const resp = await fetch(
      `${BACKEND_CACHE_URL}?hash=${encodeURIComponent(hash)}&language=${encodeURIComponent(language)}`
    );
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    const timeline = data?.Timeline || data?.timeline;
    if (Array.isArray(timeline) && timeline.length > 0) {
      return timeline as TranscriptEvent[];
    }
    return null;
  } catch (err) {
    console.warn('[Delos Background] Failed to check subtitle cache:', err);
    return null;
  }
}

async function startTabAudioCapture(
  tabId: number,
  fallbackInfo?: { url: string; duration: number }
): Promise<void> {
  if (isStartingCapture) {
    return;
  }
  isStartingCapture = true;

  try {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('No API key');

    const language = await getLanguage();
    let videoInfo = await getVideoInfo(tabId);

    if (!videoInfo && fallbackInfo && fallbackInfo.duration > 0) {
      videoInfo = {
        url: fallbackInfo.url,
        duration: fallbackInfo.duration,
        currentTime: 0,
      };
    }

    if (!videoInfo) throw new Error('No qualifying video found on this tab');

    const cleanVideoUrl = normalizeVideoUrl(videoInfo.url);
    currentCaptureSession = {
      tabId,
      url: cleanVideoUrl,
      duration: videoInfo.duration,
    };

    const cachedTimeline = await checkSubtitleCache(
      cleanVideoUrl,
      videoInfo.duration,
      language
    );

    const maxCachedEnd =
      cachedTimeline && cachedTimeline.length > 0
        ? cachedTimeline.reduce((max, ev) => {
            const end = ev.end_sec ?? ev.endSec ?? 0;
            return end > max ? end : max;
          }, 0)
        : 0;

    const isCacheComplete =
      cachedTimeline &&
      cachedTimeline.length > 0 &&
      (maxCachedEnd >= videoInfo.duration - 90 || maxCachedEnd >= videoInfo.duration * 0.85);

    if (isCacheComplete) {
      console.log(
        '[Delos Background] Found complete cached subtitles timeline in DB! Live streaming skipped.',
        { cues: cachedTimeline.length, maxCachedEnd, duration: videoInfo.duration, url: cleanVideoUrl }
      );
      sendToTabFrames(tabId, {
        type: MSG.LOAD_CACHED_TIMELINE,
        timeline: cachedTimeline,
      });
      return;
    }

    if (cachedTimeline && cachedTimeline.length > 0) {
      console.log(
        `[Delos Background] Partial cache found (${cachedTimeline.length} cues, up to ${maxCachedEnd.toFixed(1)}s of ${videoInfo.duration.toFixed(1)}s). Pre-loading cached cues and starting live capture for remaining audio.`
      );
      sendToTabFrames(tabId, {
        type: MSG.LOAD_CACHED_TIMELINE,
        timeline: cachedTimeline,
      });
    }

    await ensureOffscreenDocument();
    const streamId = await getTabMediaStreamId(tabId);

    const msg: StartCaptureMsg = {
      type: MSG.START_CAPTURE,
      target: 'offscreen',
      streamId,
      tabId,
      apiKey,
      language,
      videoUrl: cleanVideoUrl,
      duration: videoInfo.duration,
      baseTime: videoInfo.currentTime,
      backendWsUrl: BACKEND_WS_URL,
      cachedUpToSec: maxCachedEnd,
    };

    const response = await chrome.runtime.sendMessage<
      StartCaptureMsg,
      { success: boolean; error?: string }
    >(msg);

    if (!response?.success) {
      throw new Error(response?.error || 'Offscreen capture failed to start');
    }
  } finally {
    isStartingCapture = false;
  }
}

async function stopTabAudioCapture(): Promise<void> {
  currentCaptureSession = null;
  if (!(await hasOffscreenDocument())) {
    return;
  }

  const msg: StopCaptureMsg = {
    type: MSG.STOP_CAPTURE,
    target: 'offscreen',
  };

  try {
    await chrome.runtime.sendMessage(msg);
  } catch {}

  try {
    await chrome.offscreen.closeDocument();
  } catch {}
}

function notifyTabStateChanged(tabId: number, active: boolean): void {
  sendToTabFrames(tabId, { type: MSG.STATE_CHANGED, active });
}

async function deactivateCurrentTab(): Promise<void> {
  currentCaptureSession = null;
  const prevTabId = await getActiveTabId();
  await stopTabAudioCapture();
  await setActiveTabId(null);
  if (prevTabId !== null) {
    notifyTabStateChanged(prevTabId, false);
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: (ToBackgroundMsg | SubtitleMsg) & { target?: string },
    sender,
    sendResponse: (r: StatusResponse | ToggleResponse | { success: boolean }) => void
  ) => {
    if (message?.target === 'offscreen') {
      return false;
    }

    if (sender?.tab?.id && typeof sender.frameId === 'number') {
      tabVideoFrames.set(sender.tab.id, sender.frameId);
    }

    if (message?.type === MSG.SUBTITLE) {
      const subMsg = message as SubtitleMsg;
      if (subMsg.tabId > 0) {
        sendToTabFrames(subMsg.tabId, {
          type: MSG.SUBTITLE,
          text: subMsg.text,
          startSec: subMsg.startSec,
          endSec: subMsg.endSec,
          isFinal: subMsg.isFinal,
        });
      }
      return false;
    }

    if (message?.type === MSG.VIDEO_TIME_SYNC) {
      chrome.runtime
        .sendMessage({
          ...message,
          target: 'offscreen',
        })
        .catch(() => {});
      return false;
    }

    if (message?.type === MSG.VIDEO_ATTACHED) {
      void (async () => {
        const activeTabId = await getActiveTabId();
        const senderTabId = sender?.tab?.id;
        if (!senderTabId || activeTabId !== senderTabId) {
          return;
        }

        const videoMsg = message as VideoAttachedMsg;
        const cleanUrl = normalizeVideoUrl(videoMsg.url || sender.tab?.url || '');
        const duration = videoMsg.duration || 0;

        if (
          currentCaptureSession &&
          currentCaptureSession.tabId === senderTabId &&
          currentCaptureSession.url === cleanUrl &&
          Math.round(currentCaptureSession.duration) === Math.round(duration) &&
          duration > 0
        ) {
          return;
        }

        try {
          await stopTabAudioCapture();
          await startTabAudioCapture(senderTabId, {
            url: cleanUrl,
            duration,
          });
        } catch (err) {
          console.warn('[Delos Background] Failed to start capture on video attached:', err);
        }
      })();
      return false;
    }

    if (message?.type === MSG.TRANSLATE_WORD) {
      const translateMsg = message as TranslateWordMsg;
      handleTranslateWord(translateMsg).then(sendResponse);
      return true;
    }

    handleMessage(message as ToBackgroundMsg).then(sendResponse);
    return true;
  }
);

async function getGroqApiKey(): Promise<string> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.GROQ_API_KEY);
  return (data[STORAGE_KEYS.GROQ_API_KEY] as string) || '';
}

async function getGroqModel(): Promise<string> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.GROQ_MODEL);
  const stored = (data[STORAGE_KEYS.GROQ_MODEL] as string) || '';
  if (!stored || stored === 'openai/gpt-oss-20b') {
    return DEFAULT_GROQ_MODEL;
  }
  return stored;
}

async function handleTranslateWord(
  msg: TranslateWordMsg
): Promise<TranslateWordResponse> {
  try {
    const groqKey = await getGroqApiKey();
    if (!groqKey) {
      return {
        success: false,
        error: 'Groq API Key missing. Please add it in Delos Settings.',
      };
    }

    const groqModel = await getGroqModel();

    const resp = await fetch(BACKEND_TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requested_word: msg.requestedWord,
        full_sentence: msg.fullSentence,
        target_language: msg.targetLanguage,
        api_keys: {
          groq: groqKey,
        },
        models: {
          groq: groqModel,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn('[Delos Background] Translation failed:', resp.status, errText);
      const friendlyErr =
        resp.status === 404 || errText.includes("result wasn't gotten")
          ? 'Translation unavailable (LLM service error)'
          : errText || `HTTP ${resp.status}`;
      return { success: false, error: friendlyErr };
    }

    const data = await resp.json();
    return {
      success: true,
      requestedWord: data.requested_word ?? msg.requestedWord,
      translatedWord: data.translated_word ?? '',
      fullSentence: data.full_sentence ?? msg.fullSentence,
      translatedSentence: data.translated_sentence ?? '',
    };
  } catch (err) {
    console.error('[Delos Background] Translation fetch error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleMessage(
  message: ToBackgroundMsg
): Promise<StatusResponse | ToggleResponse | { success: boolean }> {
  if (message.type === MSG.GET_STATUS) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !tab.url) {
      return {
        active: false,
        blocked: false,
        hasApiKey: false,
        language: DEFAULT_LANGUAGE,
        targetLanguage: DEFAULT_TARGET_LANGUAGE,
        tabId: -1,
      };
    }

    const blocked = isBlacklisted(tab.url);
    const active = blocked ? false : await getTabActive(tab.id);
    const apiKey = await getApiKey();
    const language = await getLanguage();
    const targetLanguage = await getTargetLanguage();

    await updateToolbarIcon(tab.id, active);

    return {
      active,
      blocked,
      hasApiKey: Boolean(apiKey),
      language,
      targetLanguage,
      tabId: tab.id,
    } satisfies StatusResponse;
  }

  if (message.type === MSG.TOGGLE) {
    const { tabId } = message;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || isBlacklisted(tab.url)) {
      return { success: false, reason: 'blocked' } satisfies ToggleResponse;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, reason: 'no_api_key' } satisfies ToggleResponse;
    }

    const currentActive = await getTabActive(tabId);
    const nextActive = !currentActive;

    if (!nextActive) {
      await deactivateCurrentTab();
      return { success: true, active: false } satisfies ToggleResponse;
    }

    const prevTabId = await getActiveTabId();
    if (prevTabId !== null && prevTabId !== tabId) {
      await deactivateCurrentTab();
    }

    try {
      await startTabAudioCapture(tabId);
      await setActiveTabId(tabId);
      notifyTabStateChanged(tabId, true);
      return { success: true, active: true } satisfies ToggleResponse;
    } catch (err) {
      console.error('[Delos Background] Failed to start tab capture:', err);
      await deactivateCurrentTab();
      const reason = err instanceof Error && err.message.includes('No qualifying video')
        ? 'no_video' as const
        : 'capture_failed' as const;
      return { success: false, reason } satisfies ToggleResponse;
    }
  }

  if (message.type === MSG.CAPTURE_STOPPED) {
    const activeTabId = await getActiveTabId();
    if (activeTabId === message.tabId) {
      currentCaptureSession = null;
      await setActiveTabId(null);
      notifyTabStateChanged(message.tabId, false);
      try {
        await chrome.offscreen.closeDocument();
      } catch {}
    }
    return { success: true };
  }

  if (message.type === MSG.OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage();
    return { success: true };
  }

  if (message.type === MSG.SET_WINDOW_FULLSCREEN) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        const win = await chrome.windows.get(tab.windowId);
        if (message.fullscreen) {
          if (win.state !== 'fullscreen') {
            await chrome.storage.session.set({ prevWindowState: win.state || 'normal' });
            await chrome.windows.update(tab.windowId, { state: 'fullscreen' });
          }
        } else {
          if (win.state === 'fullscreen') {
            const data = await chrome.storage.session.get('prevWindowState');
            const targetState = (data.prevWindowState === 'minimized' ? 'normal' : data.prevWindowState) || 'normal';
            await chrome.windows.update(tab.windowId, { state: targetState });
          }
        }
      }
    } catch (err) {
      console.warn('[Delos Background] Failed to toggle window fullscreen:', err);
    }
    return { success: true };
  }

  return { success: false };
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void syncToolbarIconForTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabVideoFrames.delete(tabId);
  void (async () => {
    const activeTabId = await getActiveTabId();
    if (activeTabId === tabId) {
      await stopTabAudioCapture();
      await setActiveTabId(null);
    }
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    tabVideoFrames.delete(tabId);
  }
  void (async () => {
    const activeTabId = await getActiveTabId();
    if (activeTabId !== tabId) {
      if (changeInfo.status === 'complete') {
        await updateToolbarIcon(tabId, false);
      }
      return;
    }

    if (changeInfo.status === 'loading') {
      await stopTabAudioCapture();
      return;
    }

    if (changeInfo.url && isBlacklisted(changeInfo.url)) {
      await deactivateCurrentTab();
      return;
    }

    if (changeInfo.url && currentCaptureSession) {
      const cleanUpdatedUrl = normalizeVideoUrl(changeInfo.url);
      if (cleanUpdatedUrl !== currentCaptureSession.url) {
        await stopTabAudioCapture();
      }
    }

    if (changeInfo.status === 'complete' && tab.url && !isBlacklisted(tab.url)) {
      await updateToolbarIcon(tabId, true);
      notifyTabStateChanged(tabId, true);
    }
  })();
});
