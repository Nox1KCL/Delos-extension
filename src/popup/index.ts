import {
  DEFAULT_THEME,
  DEFAULT_UI_LANGUAGE,
  MSG,
  STORAGE_KEYS,
} from '../shared/constants';
import { applyUiLocale, t, type UiLocale } from '../shared/i18n';
import { applyTheme, type ThemeMode } from '../shared/theme';
import type { StatusResponse, ToggleResponse } from '../shared/types';

const toggleInput    = document.getElementById('toggleInput')    as HTMLInputElement;
const toggleSublabel = document.getElementById('toggleSublabel') as HTMLElement;
const badgeBlocked   = document.getElementById('badgeBlocked')   as HTMLElement;
const badgeNoKey     = document.getElementById('badgeNoKey')     as HTMLElement;
const settingsBtn    = document.getElementById('settingsBtn')    as HTMLButtonElement;

let currentTabId = -1;

async function init(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.UI_LANGUAGE,
    ]);
    const theme = ((stored[STORAGE_KEYS.THEME] as string) || DEFAULT_THEME) as ThemeMode;
    const locale = ((stored[STORAGE_KEYS.UI_LANGUAGE] as string) || DEFAULT_UI_LANGUAGE) as UiLocale;
    applyTheme(theme);
    applyUiLocale(locale);
  } catch {
    applyTheme(DEFAULT_THEME);
    applyUiLocale(DEFAULT_UI_LANGUAGE);
  }

  const status = (await chrome.runtime.sendMessage({
    type: MSG.GET_STATUS,
  })) as StatusResponse;

  currentTabId = status.tabId;
  render(status);
}

function render(status: StatusResponse): void {
  badgeBlocked.style.display = 'none';
  badgeNoKey.style.display   = 'none';
  toggleInput.disabled       = false;

  if (status.blocked) {
    badgeBlocked.style.display = 'flex';
    toggleInput.disabled = true;
    toggleInput.checked  = false;
    toggleSublabel.textContent = t('popupBlocked');
    return;
  }

  if (!status.hasApiKey) {
    badgeNoKey.style.display = 'flex';
    toggleInput.disabled = true;
    toggleInput.checked  = false;
    toggleSublabel.textContent = t('popupNeedKey');
    return;
  }

  toggleInput.checked = status.active;
  toggleSublabel.textContent = status.active ? t('popupOn') : t('popupOff');
}

toggleInput.addEventListener('change', async () => {
  const response = (await chrome.runtime.sendMessage({
    type: MSG.TOGGLE,
    tabId: currentTabId,
  })) as ToggleResponse;

  if (response.success && response.active !== undefined) {
    toggleSublabel.textContent = response.active ? t('popupOn') : t('popupOff');
  } else {
    toggleInput.checked = !toggleInput.checked;

    if (response.reason === 'no_api_key') {
      badgeNoKey.style.display = 'flex';
      toggleInput.disabled = true;
      toggleSublabel.textContent = t('popupNeedKey');
    } else if (response.reason === 'no_video') {
      toggleSublabel.textContent = t('popupNoVideo');
    } else if (response.reason === 'capture_failed') {
      toggleSublabel.textContent = t('popupCaptureFailed');
    }
  }
});

function openOptions(): void {
  chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS });
}

settingsBtn.addEventListener('click', openOptions);
badgeNoKey.addEventListener('click', openOptions);

init();
