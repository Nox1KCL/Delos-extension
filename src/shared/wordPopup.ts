import { MSG } from './constants';
import { t } from './i18n';

export interface SubtitleStyleSync {
  fontFamily: string;
  fontSize: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  position: 'top' | 'bottom';
}

export interface WordPopupData {
  word: string;
  translation: string;
}

export interface WordPopupController {
  element: HTMLElement;
  show: (data: WordPopupData, anchorWordEl?: HTMLElement) => void;
  hide: () => void;
  isOpen: () => boolean;
  syncStyle: (style: SubtitleStyleSync) => void;
}

function hexToRgba(hexColor: string, opacityPercent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 20;
  const g = parseInt(hex.slice(2, 4), 16) || 20;
  const b = parseInt(hex.slice(4, 6), 16) || 22;
  const effectiveOpacity = Math.max(82, Math.min(100, opacityPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${effectiveOpacity})`;
}

export function createWordPopup(
  stageContainer: HTMLElement,
  onOpenSettings?: () => void
): WordPopupController {
  const popup = document.createElement('div');
  popup.className = 'delos-word-popup';
  popup.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'delos-word-popup__header';

  const wordEl = document.createElement('span');
  wordEl.className = 'delos-word-popup__word';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'delos-word-popup__close';
  closeBtn.textContent = '✕';

  header.append(wordEl, closeBtn);

  const translationEl = document.createElement('div');
  translationEl.className = 'delos-word-popup__translation';

  const footer = document.createElement('div');
  footer.className = 'delos-word-popup__footer';

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'delos-word-popup__settings';
  settingsBtn.dataset.i18nTitle = 'wordPopupSettings';
  settingsBtn.title = t('wordPopupSettings');
  settingsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

  footer.appendChild(settingsBtn);

  popup.append(header, translationEl, footer);
  stageContainer.appendChild(popup);

  let open = false;
  let currentAnchor: HTMLElement | null = null;
  let currentStyle: SubtitleStyleSync = {
    fontFamily: 'Inter, sans-serif',
    fontSize: 16,
    color: '#ffffff',
    bgColor: '#141416',
    bgOpacity: 85,
    position: 'bottom',
  };

  function positionNearAnchor(): void {
    if (!open) return;

    if (!currentAnchor || !stageContainer.contains(currentAnchor)) {
      popup.style.left = '50%';
      popup.style.transform = 'translateX(-50%)';
      return;
    }

    const stageRect = stageContainer.getBoundingClientRect();
    const wordRect = currentAnchor.getBoundingClientRect();

    if (stageRect.width === 0) return;

    const wordCenterX = wordRect.left - stageRect.left + wordRect.width / 2;
    const popupWidth = popup.offsetWidth || 180;
    const minCenter = popupWidth / 2 + 12;
    const maxCenter = stageRect.width - popupWidth / 2 - 12;
    const clampedX = Math.max(minCenter, Math.min(maxCenter, wordCenterX));

    popup.style.left = `${Math.round(clampedX)}px`;
    popup.style.transform = 'translateX(-50%)';

    if (currentStyle.position === 'bottom') {
      const bottomPx = stageRect.bottom - wordRect.top + 10;
      popup.style.bottom = `${Math.max(12, Math.round(bottomPx))}px`;
      popup.style.top = 'auto';
    } else {
      const topPx = wordRect.bottom - stageRect.top + 10;
      popup.style.top = `${Math.max(12, Math.round(topPx))}px`;
      popup.style.bottom = 'auto';
    }
  }

  function syncStyle(style: SubtitleStyleSync): void {
    currentStyle = style;

    const basePx = Math.max(11, Math.min(26, style.fontSize));
    popup.style.fontFamily = style.fontFamily;
    popup.style.color = style.color;
    popup.style.backgroundColor = hexToRgba(style.bgColor, style.bgOpacity);

    wordEl.style.fontSize = `${Math.round(basePx * 0.92)}px`;
    wordEl.style.color = style.color;
    translationEl.style.fontSize = `${Math.round(basePx * 0.88)}px`;
    translationEl.style.color = style.color;
    settingsBtn.style.color = style.color;
    settingsBtn.title = t('wordPopupSettings');

    positionNearAnchor();
  }

  function show(data: WordPopupData, anchorWordEl?: HTMLElement): void {
    open = true;
    if (anchorWordEl) {
      currentAnchor = anchorWordEl;
    }

    wordEl.textContent = data.word;
    translationEl.textContent = data.translation;
    settingsBtn.title = t('wordPopupSettings');

    popup.style.display = 'flex';
    syncStyle(currentStyle);
  }

  function hide(): void {
    open = false;
    popup.style.display = 'none';
    stageContainer
      .querySelectorAll('.delos-sub-word.selected')
      .forEach((el) => el.classList.remove('selected'));
  }

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hide();
  });

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS }).catch(() => {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        }
      });
    }
  });

  return {
    element: popup,
    show,
    hide,
    isOpen: () => open,
    syncStyle,
  };
}

export function renderClickableSubtitleWords(
  container: HTMLElement,
  text: string,
  selectedIndex: number | null,
  onWordSelect: (word: string, index: number, el: HTMLElement) => void
): HTMLElement | null {
  container.innerHTML = '';
  const tokens = text.split(' ');
  let selectedEl: HTMLElement | null = null;

  tokens.forEach((token, idx) => {
    const span = document.createElement('span');
    span.className = 'delos-sub-word';
    span.textContent = token;

    if (selectedIndex === idx) {
      span.classList.add('selected');
      selectedEl = span;
    }

    span.addEventListener('click', (e) => {
      e.stopPropagation();
      container
        .querySelectorAll('.delos-sub-word.selected')
        .forEach((w) => w.classList.remove('selected'));
      span.classList.add('selected');
      onWordSelect(token, idx, span);
    });

    container.appendChild(span);
    if (idx < tokens.length - 1) {
      container.appendChild(document.createTextNode(' '));
    }
  });

  return selectedEl;
}
