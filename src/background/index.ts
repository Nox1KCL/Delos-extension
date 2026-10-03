import {
  BACKEND_CACHE_URL,
  BACKEND_TRANSLATE_URL,
  BACKEND_WS_URL,
  BLACKLISTED_HOSTS,
  BLACKLISTED_PATH_PREFIXES,
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

async function getVideoInfo(tabId: number): Promise<VideoInfoResponse | null> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: MSG.GET_VIDEO_INFO,
    });
    if (response?.url && response?.duration > 0) {
      return response as VideoInfoResponse;
    }
    return null;
  } catch {
    return null;
  }
}

async function computeEpisodeHash(
  url: string,
  duration: number,
  language: string
): Promise<string> {
  const cleanUrl = normalizeVideoUrl(url);
  const combined = `${cleanUrl}_${duration.toFixed(2)}_${language}`;
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

async function startTabAudioCapture(tabId: number): Promise<void> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key');

  const language = await getLanguage();
  const videoInfo = await getVideoInfo(tabId);

  if (!videoInfo) throw new Error('No qualifying video found on this tab');

  const cleanVideoUrl = normalizeVideoUrl(videoInfo.url);

  const cachedTimeline = await checkSubtitleCache(
    cleanVideoUrl,
    videoInfo.duration,
    language
  );
  if (cachedTimeline && cachedTimeline.length > 0) {
    console.log(
      '[Delos Background] Found cached subtitles timeline in DB! Live streaming skipped.',
      { cues: cachedTimeline.length, url: cleanVideoUrl }
    );
    await chrome.tabs.sendMessage(tabId, {
      type: MSG.LOAD_CACHED_TIMELINE,
      timeline: cachedTimeline,
    });
    return;
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
  };

  const response = await chrome.runtime.sendMessage<
    StartCaptureMsg,
    { success: boolean; error?: string }
  >(msg);

  if (!response?.success) {
    throw new Error(response?.error || 'Offscreen capture failed to start');
  }
}

async function stopTabAudioCapture(): Promise<void> {
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
  chrome.tabs
    .sendMessage(tabId, { type: MSG.STATE_CHANGED, active })
    .catch(() => {});
}

async function deactivateCurrentTab(): Promise<void> {
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
    _sender,
    sendResponse: (r: StatusResponse | ToggleResponse | { success: boolean }) => void
  ) => {
    if (message?.target === 'offscreen') {
      return false;
    }

    if (message?.type === MSG.SUBTITLE) {
      const subMsg = message as SubtitleMsg;
      if (subMsg.tabId > 0) {
        chrome.tabs
          .sendMessage(subMsg.tabId, {
            type: MSG.SUBTITLE,
            text: subMsg.text,
            startSec: subMsg.startSec,
            endSec: subMsg.endSec,
            isFinal: subMsg.isFinal,
          })
          .catch(() => {});
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

    if (message?.type === MSG.TRANSLATE_WORD) {
      const translateMsg = message as TranslateWordMsg;
      handleTranslateWord(translateMsg).then(sendResponse);
      return true;
    }

    handleMessage(message as ToBackgroundMsg).then(sendResponse);
    return true;
  }
);

async function handleTranslateWord(
  msg: TranslateWordMsg
): Promise<TranslateWordResponse> {
  try {
    const resp = await fetch(BACKEND_TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requested_word: msg.requestedWord,
        full_sentence: msg.fullSentence,
        target_language: msg.targetLanguage,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn('[Delos Background] Translation failed:', resp.status, errText);
      return { success: false, error: errText || `HTTP ${resp.status}` };
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
  void (async () => {
    const activeTabId = await getActiveTabId();
    if (activeTabId === tabId) {
      await stopTabAudioCapture();
      await setActiveTabId(null);
    }
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    const activeTabId = await getActiveTabId();
    if (activeTabId !== tabId) {
      if (changeInfo.status === 'complete') {
        await updateToolbarIcon(tabId, false);
      }
      return;
    }

    if (changeInfo.url && isBlacklisted(changeInfo.url)) {
      await deactivateCurrentTab();
      return;
    }

    if (changeInfo.status === 'complete' && tab.url && !isBlacklisted(tab.url)) {
      await updateToolbarIcon(tabId, true);
      notifyTabStateChanged(tabId, true);
    }
  })();
});
