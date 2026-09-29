import {
  BLACKLISTED_HOSTS,
  DEFAULT_LANGUAGE,
  MSG,
  STORAGE_KEYS,
} from '../shared/constants';
import type {
  StatusResponse,
  ToBackgroundMsg,
  ToggleResponse,
} from '../shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the given URL belongs to a blacklisted music service.
 * We check by exact hostname or subdomain match.
 */
function isBlacklisted(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return BLACKLISTED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

/** Read whether this specific tab has Delos active (from session storage). */
async function getTabActive(tabId: number): Promise<boolean> {
  const key = `tab_${tabId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] === true;
}

/** Write the active state for a specific tab to session storage. */
async function setTabActive(tabId: number, active: boolean): Promise<void> {
  const key = `tab_${tabId}`;
  if (active) {
    await chrome.storage.session.set({ [key]: true });
  } else {
    await chrome.storage.session.remove(key);
  }
}

/** Read the Deepgram API key from persistent local storage. */
async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return (result[STORAGE_KEYS.API_KEY] as string) || null;
}

/** Read the subtitle language from persistent local storage. */
async function getLanguage(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LANGUAGE);
  return (result[STORAGE_KEYS.LANGUAGE] as string) || DEFAULT_LANGUAGE;
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ToBackgroundMsg,
    _sender,
    sendResponse: (r: StatusResponse | ToggleResponse | { success: boolean }) => void
  ) => {
    handleMessage(message).then(sendResponse);
    // Return true to keep the message channel open for the async response.
    return true;
  }
);

async function handleMessage(
  message: ToBackgroundMsg
): Promise<StatusResponse | ToggleResponse | { success: boolean }> {
  // ── GET_STATUS ──────────────────────────────────────────────────────────────
  if (message.type === MSG.GET_STATUS) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !tab.url) {
      return { active: false, blocked: false, hasApiKey: false, language: DEFAULT_LANGUAGE, tabId: -1 };
    }

    const blocked = isBlacklisted(tab.url);
    const active = blocked ? false : await getTabActive(tab.id);
    const apiKey = await getApiKey();
    const language = await getLanguage();

    return {
      active,
      blocked,
      hasApiKey: Boolean(apiKey),
      language,
      tabId: tab.id,
    } satisfies StatusResponse;
  }

  // ── TOGGLE ──────────────────────────────────────────────────────────────────
  if (message.type === MSG.TOGGLE) {
    const { tabId } = message;

    // Double-check blacklist even if called programmatically
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || isBlacklisted(tab.url)) {
      return { success: false, reason: 'blocked' } satisfies ToggleResponse;
    }

    // Require API key before allowing activation
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, reason: 'no_api_key' } satisfies ToggleResponse;
    }

    const currentActive = await getTabActive(tabId);
    const nextActive = !currentActive;
    await setTabActive(tabId, nextActive);

    // Notify the content script running on that tab (fire-and-forget)
    chrome.tabs
      .sendMessage(tabId, { type: MSG.STATE_CHANGED, active: nextActive })
      .catch(() => {
        // Content script may not be injected yet — that's fine.
      });

    return { success: true, active: nextActive } satisfies ToggleResponse;
  }

  // ── OPEN_OPTIONS ────────────────────────────────────────────────────────────
  if (message.type === MSG.OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage();
    return { success: true };
  }

  return { success: false };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * When a tab is closed, remove its session state so we don't
 * accumulate stale entries in chrome.storage.session.
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab_${tabId}`);
});
