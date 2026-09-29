import { MSG } from '../shared/constants';
import type { StatusResponse, ToggleResponse } from '../shared/types';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const toggleInput    = document.getElementById('toggleInput')    as HTMLInputElement;
const toggleSublabel = document.getElementById('toggleSublabel') as HTMLElement;
const badgeBlocked   = document.getElementById('badgeBlocked')   as HTMLElement;
const badgeNoKey     = document.getElementById('badgeNoKey')     as HTMLElement;
const settingsBtn    = document.getElementById('settingsBtn')    as HTMLButtonElement;
const settingsLink   = document.getElementById('settingsLink')   as HTMLButtonElement;

// ─── State ────────────────────────────────────────────────────────────────────

let currentTabId = -1;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Ask background for the current tab's status
  const status = await chrome.runtime.sendMessage<typeof MSG.GET_STATUS, StatusResponse>(
    { type: MSG.GET_STATUS }
  );

  currentTabId = status.tabId;
  render(status);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render(status: StatusResponse): void {
  // Reset visibility
  badgeBlocked.style.display = 'none';
  badgeNoKey.style.display   = 'none';
  toggleInput.disabled       = false;

  if (status.blocked) {
    // Music site — show blocked badge, disable toggle
    badgeBlocked.style.display = 'flex';
    toggleInput.disabled = true;
    toggleInput.checked  = false;
    toggleSublabel.textContent = 'Недоступно';
    return;
  }

  if (!status.hasApiKey) {
    // No API key set — warn user, disable toggle
    badgeNoKey.style.display = 'flex';
    toggleInput.disabled = true;
    toggleInput.checked  = false;
    toggleSublabel.textContent = 'Потрібен API ключ';
    return;
  }

  // Normal state
  toggleInput.checked = status.active;
  toggleSublabel.textContent = status.active
    ? `Активно · ${status.language.toUpperCase()}`
    : 'Вимкнено';
}

// ─── Events ───────────────────────────────────────────────────────────────────

toggleInput.addEventListener('change', async () => {
  const response = await chrome.runtime.sendMessage<typeof MSG.TOGGLE, ToggleResponse>({
    type: MSG.TOGGLE,
    tabId: currentTabId,
  });

  if (response.success && response.active !== undefined) {
    toggleSublabel.textContent = response.active ? 'Активно' : 'Вимкнено';
  } else {
    // Something went wrong — revert the visual toggle state
    toggleInput.checked = !toggleInput.checked;

    if (response.reason === 'no_api_key') {
      badgeNoKey.style.display = 'flex';
      toggleInput.disabled = true;
    }
  }
});

function openOptions(): void {
  chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS });
}

settingsBtn.addEventListener('click', openOptions);
settingsLink.addEventListener('click', openOptions);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

init();
