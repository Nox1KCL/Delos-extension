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
  sentenceTranslation?: string;
  loading?: boolean;
  error?: string;
}

export interface WordPopupController {
  element: HTMLElement;
  show: (data: WordPopupData, anchorWordEl?: HTMLElement) => void;
  update: (data: Partial<WordPopupData>) => void;
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

function renderSentenceWithHighlight(
  container: HTMLElement,
  sentence: string,
  wordTranslation?: string
): void {
  container.innerHTML = '';
  const trimmedSentence = (sentence || '').trim();
  if (!trimmedSentence) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  if (!wordTranslation || !wordTranslation.trim()) {
    container.textContent = trimmedSentence;
    return;
  }

  const rawCandidates: string[] = [];
  const cleanFull = wordTranslation.trim().replace(/[.,!?;:«»"']/g, '').trim();
  if (cleanFull) rawCandidates.push(cleanFull);

  wordTranslation
    .split(/[,;/()]/)
    .map((s) => s.replace(/[.,!?;:«»"']/g, '').trim())
    .filter((s) => s.length >= 2)
    .forEach((s) => {
      if (!rawCandidates.includes(s)) rawCandidates.push(s);
    });

  const extraWords: string[] = [];
  for (const c of rawCandidates) {
    c.split(/\s+/).forEach((w) => {
      const cw = w.trim();
      if (cw.length >= 3 && !rawCandidates.includes(cw) && !extraWords.includes(cw)) {
        extraWords.push(cw);
      }
    });
  }
  rawCandidates.push(...extraWords);
  rawCandidates.sort((a, b) => b.length - a.length);

  const lowerSentence = trimmedSentence.toLowerCase();
  let bestMatch: { start: number; end: number } | null = null;

  for (const cand of rawCandidates) {
    const lowerCand = cand.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < lowerSentence.length) {
      const idx = lowerSentence.indexOf(lowerCand, searchFrom);
      if (idx === -1) break;
      const end = idx + lowerCand.length;

      const isStartWord = idx === 0 || !/\p{L}/u.test(trimmedSentence[idx - 1]);
      const isEndWord = end === trimmedSentence.length || !/\p{L}/u.test(trimmedSentence[end]);

      if (isStartWord && isEndWord) {
        bestMatch = { start: idx, end };
        break;
      }
      searchFrom = idx + 1;
    }
    if (bestMatch) break;
  }

  if (!bestMatch) {
    const wordMatches = Array.from(trimmedSentence.matchAll(/\p{L}+/gu));
    for (const cand of rawCandidates) {
      const lowerCand = cand.toLowerCase();
      const stemLength = Math.max(3, Math.min(lowerCand.length, Math.floor(lowerCand.length * 0.75)));
      const stem = lowerCand.slice(0, stemLength);

      for (const m of wordMatches) {
        const sentenceWord = m[0];
        const lowerSW = sentenceWord.toLowerCase();
        const mIndex = m.index ?? 0;

        if (
          (lowerSW.startsWith(stem) || lowerCand.startsWith(lowerSW.slice(0, stemLength))) &&
          Math.abs(lowerSW.length - lowerCand.length) <= 3
        ) {
          bestMatch = { start: mIndex, end: mIndex + sentenceWord.length };
          break;
        }
      }
      if (bestMatch) break;
    }
  }

  if (bestMatch) {
    const beforeText = trimmedSentence.slice(0, bestMatch.start);
    const highlightedText = trimmedSentence.slice(bestMatch.start, bestMatch.end);
    const afterText = trimmedSentence.slice(bestMatch.end);

    if (beforeText) {
      container.appendChild(document.createTextNode(beforeText));
    }

    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'delos-word-popup__highlight';
    highlightSpan.textContent = highlightedText;
    container.appendChild(highlightSpan);

    if (afterText) {
      container.appendChild(document.createTextNode(afterText));
    }
  } else {
    container.textContent = trimmedSentence;
  }
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

  const sentenceEl = document.createElement('div');
  sentenceEl.className = 'delos-word-popup__sentence';
  sentenceEl.style.display = 'none';

  const loaderEl = document.createElement('div');
  loaderEl.className = 'delos-word-popup__loader';
  loaderEl.textContent = '···';
  loaderEl.style.display = 'none';

  const footer = document.createElement('div');
  footer.className = 'delos-word-popup__footer';

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'delos-word-popup__settings';
  settingsBtn.dataset.i18nTitle = 'wordPopupSettings';
  settingsBtn.title = t('wordPopupSettings');
  settingsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

  footer.appendChild(settingsBtn);

  popup.append(header, loaderEl, translationEl, sentenceEl, footer);
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
    popup.style.backgroundColor = hexToRgba(style.bgColor, style.bgOpacity);

    wordEl.style.fontSize = `${Math.round(basePx * 0.95)}px`;
    translationEl.style.fontSize = `${Math.round(basePx * 0.88)}px`;
    sentenceEl.style.fontSize = `${Math.round(basePx * 0.78)}px`;
    settingsBtn.title = t('wordPopupSettings');

    positionNearAnchor();
  }

  let currentTranslation = '';
  let currentSentence = '';

  function applyData(data: Partial<WordPopupData>): void {
    if (data.word !== undefined) {
      wordEl.textContent = data.word;
    }

    if (data.loading) {
      loaderEl.style.display = 'block';
      translationEl.style.display = 'none';
      sentenceEl.style.display = 'none';
    } else {
      loaderEl.style.display = 'none';
      if (data.error) {
        translationEl.textContent = 'Translation unavailable';
        translationEl.style.display = 'block';
        translationEl.style.opacity = '0.9';
        translationEl.style.color = '#f87171';
        sentenceEl.textContent = data.error;
        sentenceEl.style.display = 'block';
        sentenceEl.style.opacity = '0.75';
        sentenceEl.style.fontSize = '11px';
      } else {
        translationEl.style.color = '';
        sentenceEl.style.opacity = '';
        if (data.translation !== undefined) {
          currentTranslation = data.translation;
          translationEl.textContent = data.translation;
          translationEl.style.display = data.translation ? 'block' : 'none';
          translationEl.style.opacity = '1';
        }
        if (data.sentenceTranslation !== undefined) {
          currentSentence = data.sentenceTranslation;
        }

        if (currentSentence) {
          renderSentenceWithHighlight(sentenceEl, currentSentence, currentTranslation);
        } else {
          sentenceEl.style.display = 'none';
          sentenceEl.innerHTML = '';
        }
      }
    }
  }

  function show(data: WordPopupData, anchorWordEl?: HTMLElement): void {
    open = true;
    if (anchorWordEl) {
      currentAnchor = anchorWordEl;
    }

    currentTranslation = data.translation ?? '';
    currentSentence = data.sentenceTranslation ?? '';

    applyData(data);
    settingsBtn.title = t('wordPopupSettings');

    popup.style.display = 'flex';
    syncStyle(currentStyle);
  }

  function update(patch: Partial<WordPopupData>): void {
    if (!open) return;
    applyData(patch);
    positionNearAnchor();
  }

  function hide(): void {
    open = false;
    popup.style.display = 'none';
    currentTranslation = '';
    currentSentence = '';
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
    update,
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
