import {
  DEFAULT_TARGET_LANGUAGE,
  MSG,
  STORAGE_KEYS,
  SUBTITLE_DEFAULTS,
} from '../shared/constants';
import type {
  TranslateWordMsg,
  TranslateWordResponse,
} from '../shared/types';
import {
  createWordPopup,
  type WordPopupController,
} from '../shared/wordPopup';

export interface SubtitleConfig {
  fontSize: number;
  fontFamily: string;
  color: string;
  bgColor: string;
  bgOpacity: number;
  position: 'top' | 'bottom';
  offset: number;
  align: 'left' | 'center' | 'right';
}

function hexToRgba(hexColor: string, opacityPercent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 20;
  const g = parseInt(hex.slice(2, 4), 16) || 20;
  const b = parseInt(hex.slice(4, 6), 16) || 22;
  const opacity = Math.max(0, Math.min(100, opacityPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

interface QueuedCue {
  text: string;
  startSec: number;
  endSec: number;
}

export class SubtitleOverlay {
  private activeVideo: HTMLVideoElement | null = null;
  private playerContainer: HTMLElement | null = null;

  private hostEl: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private stageEl: HTMLElement | null = null;
  private cueWrapperEl: HTMLElement | null = null;
  private prevBoxEl: HTMLElement | null = null;
  private currBoxEl: HTMLElement | null = null;
  private popupController: WordPopupController | null = null;

  private config: SubtitleConfig = { ...SUBTITLE_DEFAULTS };
  private targetLanguage: string = DEFAULT_TARGET_LANGUAGE;
  private translationCache = new Map<string, { translatedWord: string; translatedSentence: string }>();

  private currHideTimer: ReturnType<typeof setTimeout> | null = null;
  private prevHideTimer: ReturnType<typeof setTimeout> | null = null;
  private currHideUntil = 0;
  private prevHideUntil = 0;
  private currHideRemaining = 0;
  private prevHideRemaining = 0;

  private currentCue: QueuedCue | null = null;
  private previousCue: QueuedCue | null = null;
  private lastCueRenderTime = 0;
  private isCurrentCommitted = false;
  private interimDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInterim: { text: string; startSec: number; endSec: number } | null = null;

  private currentSentence = '';
  private currentStartSec = 0;
  private currentEndSec = 0;

  private onFullscreenChangeBound = this.handleFullscreenChange.bind(this);
  private onStorageChangeBound = this.handleStorageChange.bind(this);
  private onVideoPlayBound = this.handleVideoPlay.bind(this);
  private onVideoPauseBound = this.handleVideoPause.bind(this);
  private onVideoSeekedBound = this.handleVideoSeeked.bind(this);

  constructor() {
    this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const keys = [
        STORAGE_KEYS.SUBTITLE_FONT_SIZE,
        STORAGE_KEYS.SUBTITLE_FONT_FAMILY,
        STORAGE_KEYS.SUBTITLE_COLOR,
        STORAGE_KEYS.SUBTITLE_BG_COLOR,
        STORAGE_KEYS.SUBTITLE_BG_OPACITY,
        STORAGE_KEYS.SUBTITLE_POSITION,
        STORAGE_KEYS.SUBTITLE_OFFSET,
        STORAGE_KEYS.SUBTITLE_ALIGN,
        STORAGE_KEYS.TARGET_LANGUAGE,
      ];
      try {
        const data = await chrome.storage.local.get(keys);
        this.config = {
          fontSize:
            typeof data[STORAGE_KEYS.SUBTITLE_FONT_SIZE] === 'number'
              ? data[STORAGE_KEYS.SUBTITLE_FONT_SIZE]
              : SUBTITLE_DEFAULTS.fontSize,
          fontFamily:
            data[STORAGE_KEYS.SUBTITLE_FONT_FAMILY] || SUBTITLE_DEFAULTS.fontFamily,
          color: data[STORAGE_KEYS.SUBTITLE_COLOR] || SUBTITLE_DEFAULTS.color,
          bgColor: data[STORAGE_KEYS.SUBTITLE_BG_COLOR] || SUBTITLE_DEFAULTS.bgColor,
          bgOpacity:
            typeof data[STORAGE_KEYS.SUBTITLE_BG_OPACITY] === 'number'
              ? data[STORAGE_KEYS.SUBTITLE_BG_OPACITY]
              : SUBTITLE_DEFAULTS.bgOpacity,
          position:
            data[STORAGE_KEYS.SUBTITLE_POSITION] || SUBTITLE_DEFAULTS.position,
          offset:
            typeof data[STORAGE_KEYS.SUBTITLE_OFFSET] === 'number'
              ? (data[STORAGE_KEYS.SUBTITLE_OFFSET] <= 8 ? SUBTITLE_DEFAULTS.offset : data[STORAGE_KEYS.SUBTITLE_OFFSET])
              : SUBTITLE_DEFAULTS.offset,
          align: data[STORAGE_KEYS.SUBTITLE_ALIGN] || SUBTITLE_DEFAULTS.align,
        };
        if (data[STORAGE_KEYS.TARGET_LANGUAGE]) {
          this.targetLanguage = String(data[STORAGE_KEYS.TARGET_LANGUAGE]) || DEFAULT_TARGET_LANGUAGE;
        }
        this.applyConfig();
      } catch (err) {
        console.warn('[Delos Overlay] Failed to load config from storage:', err);
      }
    }
  }

  private handleStorageChange(
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ): void {
    if (areaName !== 'local') return;

    let updated = false;
    if (changes[STORAGE_KEYS.SUBTITLE_FONT_SIZE]) {
      this.config.fontSize = Number(changes[STORAGE_KEYS.SUBTITLE_FONT_SIZE].newValue) || SUBTITLE_DEFAULTS.fontSize;
      updated = true;
    }
    if (changes[STORAGE_KEYS.SUBTITLE_FONT_FAMILY]) {
      this.config.fontFamily = String(changes[STORAGE_KEYS.SUBTITLE_FONT_FAMILY].newValue) || SUBTITLE_DEFAULTS.fontFamily;
      updated = true;
    }
    if (changes[STORAGE_KEYS.SUBTITLE_COLOR]) {
      this.config.color = String(changes[STORAGE_KEYS.SUBTITLE_COLOR].newValue) || SUBTITLE_DEFAULTS.color;
      updated = true;
    }
    if (changes[STORAGE_KEYS.SUBTITLE_BG_COLOR]) {
      this.config.bgColor = String(changes[STORAGE_KEYS.SUBTITLE_BG_COLOR].newValue) || SUBTITLE_DEFAULTS.bgColor;
      updated = true;
    }
    if (changes[STORAGE_KEYS.SUBTITLE_BG_OPACITY]) {
      this.config.bgOpacity = Number(changes[STORAGE_KEYS.SUBTITLE_BG_OPACITY].newValue) ?? SUBTITLE_DEFAULTS.bgOpacity;
      updated = true;
    }
    if (changes[STORAGE_KEYS.SUBTITLE_POSITION]) {
      this.config.position = (changes[STORAGE_KEYS.SUBTITLE_POSITION].newValue as 'top' | 'bottom') || SUBTITLE_DEFAULTS.position;
      updated = true;
    }
    if (changes[STORAGE_KEYS.SUBTITLE_OFFSET]) {
      this.config.offset = Number(changes[STORAGE_KEYS.SUBTITLE_OFFSET].newValue) ?? SUBTITLE_DEFAULTS.offset;
      updated = true;
    }
    if (changes[STORAGE_KEYS.SUBTITLE_ALIGN]) {
      this.config.align = (changes[STORAGE_KEYS.SUBTITLE_ALIGN].newValue as 'left' | 'center' | 'right') || SUBTITLE_DEFAULTS.align;
      updated = true;
    }
    if (changes[STORAGE_KEYS.TARGET_LANGUAGE]) {
      this.targetLanguage = String(changes[STORAGE_KEYS.TARGET_LANGUAGE].newValue) || DEFAULT_TARGET_LANGUAGE;
    }

    if (updated) {
      this.applyConfig();
    }
  }

  private getBestPlayerContainer(video: HTMLVideoElement): HTMLElement {
    const ytPlayer = video.closest<HTMLElement>('#movie_player');
    if (ytPlayer) return ytPlayer;
    return video.parentElement || (document.body as HTMLElement);
  }

  public attach(video: HTMLVideoElement): void {
    if (this.activeVideo === video && this.hostEl && document.contains(this.hostEl)) {
      return;
    }

    this.detach();

    this.activeVideo = video;
    this.playerContainer = this.getBestPlayerContainer(video);

    if (this.playerContainer !== document.body && !this.playerContainer.id.includes('movie_player')) {
      const compPos = window.getComputedStyle(this.playerContainer).position;
      if (compPos === 'static') {
        this.playerContainer.style.position = 'relative';
      }
    }

    this.hostEl = document.createElement('delos-subtitles-host');
    this.hostEl.className = 'delos-overlay-host';
    this.hostEl.style.cssText =
      'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none !important; z-index: 2147483646; overflow: hidden; display: block; box-sizing: border-box;';

    this.shadowRoot = this.hostEl.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = this.generateShadowStyles();
    this.shadowRoot.appendChild(styleEl);

    this.stageEl = document.createElement('div');
    this.stageEl.className = 'delos-overlay-stage';

    this.cueWrapperEl = document.createElement('div');
    this.cueWrapperEl.className = 'delos-cue-wrapper';

    this.prevBoxEl = document.createElement('div');
    this.prevBoxEl.className = 'delos-cue-box delos-older hidden';

    this.currBoxEl = document.createElement('div');
    this.currBoxEl.className = 'delos-cue-box hidden';

    this.cueWrapperEl.appendChild(this.prevBoxEl);
    this.cueWrapperEl.appendChild(this.currBoxEl);
    this.stageEl.appendChild(this.cueWrapperEl);
    this.shadowRoot.appendChild(this.stageEl);

    this.popupController = createWordPopup(this.stageEl);

    const ytControls = this.playerContainer.querySelector('.ytp-chrome-bottom');
    if (ytControls && ytControls.parentElement === this.playerContainer) {
      this.playerContainer.insertBefore(this.hostEl, ytControls);
    } else {
      this.playerContainer.appendChild(this.hostEl);
    }

    this.applyConfig();

    document.addEventListener('fullscreenchange', this.onFullscreenChangeBound);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChangeBound);

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(this.onStorageChangeBound);
    }

    video.addEventListener('play', this.onVideoPlayBound);
    video.addEventListener('pause', this.onVideoPauseBound);
    video.addEventListener('seeked', this.onVideoSeekedBound);

    console.log('[Delos Overlay] Mounted Shadow DOM overlay over video player', {
      container: this.playerContainer?.tagName + '#' + (this.playerContainer?.id || '?'),
      hostInDOM: document.contains(this.hostEl),
      hostParent: this.hostEl.parentElement?.tagName + '#' + (this.hostEl.parentElement?.id || '?'),
      videoSrc: video.src?.slice(0, 80),
    });
  }

  public detach(): void {
    if (this.currHideTimer) {
      clearTimeout(this.currHideTimer);
      this.currHideTimer = null;
    }
    if (this.prevHideTimer) {
      clearTimeout(this.prevHideTimer);
      this.prevHideTimer = null;
    }
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }
    this.pendingInterim = null;

    document.removeEventListener('fullscreenchange', this.onFullscreenChangeBound);
    document.removeEventListener('webkitfullscreenchange', this.onFullscreenChangeBound);

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(this.onStorageChangeBound);
    }

    if (this.activeVideo) {
      this.activeVideo.removeEventListener('play', this.onVideoPlayBound);
      this.activeVideo.removeEventListener('pause', this.onVideoPauseBound);
      this.activeVideo.removeEventListener('seeked', this.onVideoSeekedBound);
      this.activeVideo = null;
    }

    if (this.popupController) {
      this.popupController.hide();
      this.popupController = null;
    }

    if (this.hostEl && this.hostEl.parentElement) {
      this.hostEl.parentElement.removeChild(this.hostEl);
    }

    this.hostEl = null;
    this.shadowRoot = null;
    this.stageEl = null;
    this.cueWrapperEl = null;
    this.prevBoxEl = null;
    this.currBoxEl = null;
    this.playerContainer = null;
  }

  private handleFullscreenChange(): void {
    this.repositionOverlay();
    // YouTube may rebuild DOM asynchronously after fullscreenchange
    setTimeout(() => this.repositionOverlay(), 100);
  }

  private repositionOverlay(): void {
    if (!this.hostEl || !this.activeVideo) return;

    const fullscreenEl = (document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement) as HTMLElement | null;

    if (fullscreenEl) {
      // Always reposition into the fullscreen element — stacking context
      // changes on fullscreen entry and the overlay must sit above player layers
      const ytControls = fullscreenEl.querySelector('.ytp-chrome-bottom');
      if (ytControls && ytControls.parentElement === fullscreenEl) {
        fullscreenEl.insertBefore(this.hostEl, ytControls);
      } else {
        fullscreenEl.appendChild(this.hostEl);
      }
    } else {
      // Exiting fullscreen — move back into the original player container
      const originalContainer = this.playerContainer || this.getBestPlayerContainer(this.activeVideo);
      if (originalContainer) {
        const ytControls = originalContainer.querySelector('.ytp-chrome-bottom');
        if (ytControls && ytControls.parentElement === originalContainer) {
          originalContainer.insertBefore(this.hostEl, ytControls);
        } else {
          originalContainer.appendChild(this.hostEl);
        }
      }
    }
  }

  private handleVideoPlay(): void {
    if (this.currBoxEl && !this.currBoxEl.classList.contains('hidden')) {
      const remaining = this.currHideRemaining > 0 ? this.currHideRemaining : 2600;
      this.currHideRemaining = 0;
      this.scheduleCurrHide(remaining);
    }
    if (this.prevBoxEl && !this.prevBoxEl.classList.contains('hidden')) {
      const remaining = this.prevHideRemaining > 0 ? this.prevHideRemaining : 1600;
      this.prevHideRemaining = 0;
      this.schedulePrevHide(remaining);
    }
  }

  private handleVideoPause(): void {
    if (this.currHideTimer !== null) {
      clearTimeout(this.currHideTimer);
      this.currHideTimer = null;
    }
    if (this.prevHideTimer !== null) {
      clearTimeout(this.prevHideTimer);
      this.prevHideTimer = null;
    }
    const now = Date.now();
    if (this.currHideUntil > now) {
      this.currHideRemaining = this.currHideUntil - now;
    } else {
      this.currHideRemaining = 0;
    }
    if (this.prevHideUntil > now) {
      this.prevHideRemaining = this.prevHideUntil - now;
    } else {
      this.prevHideRemaining = 0;
    }
  }

  private handleVideoSeeked(): void {
    this.clearSubtitle();
  }

  public clearSubtitle(): void {
    if (this.currHideTimer !== null) {
      clearTimeout(this.currHideTimer);
      this.currHideTimer = null;
    }
    if (this.prevHideTimer !== null) {
      clearTimeout(this.prevHideTimer);
      this.prevHideTimer = null;
    }
    if (this.interimDebounceTimer !== null) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }
    this.pendingInterim = null;
    this.currHideUntil = 0;
    this.prevHideUntil = 0;
    this.currHideRemaining = 0;
    this.prevHideRemaining = 0;
    this.currentCue = null;
    this.previousCue = null;
    this.lastCueRenderTime = 0;
    this.isCurrentCommitted = false;

    if (this.currBoxEl) {
      this.currBoxEl.classList.remove('delos-fading');
      this.currBoxEl.classList.add('hidden');
      this.currBoxEl.innerHTML = '';
    }
    if (this.prevBoxEl) {
      this.prevBoxEl.classList.remove('delos-fading');
      this.prevBoxEl.classList.add('hidden');
      this.prevBoxEl.innerHTML = '';
    }
    if (this.popupController) {
      this.popupController.hide();
    }
  }

  public showSubtitle(
    text: string,
    startSec = 0,
    endSec = 0,
    isFinal = false
  ): void {
    if (!this.currBoxEl || !this.prevBoxEl || !this.cueWrapperEl) {
      return;
    }

    const cleanText = text.trim();
    if (!cleanText) return;

    // Do NOT advance or show completely new subtitles while video is paused,
    // but allow finalizing the currently active in-flight speech segment
    if (this.activeVideo && this.activeVideo.paused) {
      if (!isFinal || !this.currentCue) {
        return;
      }
    }

    if (isFinal) {
      // Final message: flush any pending interim immediately and commit definitive text
      if (this.interimDebounceTimer !== null) {
        clearTimeout(this.interimDebounceTimer);
        this.interimDebounceTimer = null;
      }
      this.pendingInterim = null;
      this.handleFinal(cleanText, startSec, endSec);
    } else {
      this.scheduleInterim(cleanText, startSec, endSec);
    }
  }

  /**
   * Micro-debounce (65ms) for interim hypothesis stability.
   * Flattens acoustic flapping (e.g. "cat" -> "kidding") before it reaches the DOM.
   */
  private scheduleInterim(text: string, startSec: number, endSec: number): void {
    this.pendingInterim = { text, startSec, endSec };

    if (this.interimDebounceTimer !== null) {
      clearTimeout(this.interimDebounceTimer);
    }

    this.interimDebounceTimer = setTimeout(() => {
      this.interimDebounceTimer = null;
      if (this.pendingInterim) {
        const { text: pText, startSec: pStart, endSec: pEnd } = this.pendingInterim;
        this.pendingInterim = null;
        this.handleInterim(pText, pStart, pEnd);
      }
    }, 65);
  }

  /**
   * Interim result: Deepgram is streaming partial words in real-time.
   * Update currBoxEl in-place so words appear fluidly without jumping.
   */
  private handleInterim(text: string, startSec: number, endSec: number): void {
    if (!this.currBoxEl || !this.prevBoxEl) return;

    // If previous cue was already committed (final received), promote it to prev line!
    if (this.isCurrentCommitted && this.currentCue && !this.currBoxEl.classList.contains('hidden')) {
      this.promoteToPrev();
    }

    if (!this.currentCue || this.isCurrentCommitted) {
      this.currentCue = { text, startSec, endSec };
      this.isCurrentCommitted = false;
    } else {
      this.currentCue.text = text;
      this.currentCue.endSec = endSec;
    }

    this.currentSentence = text;
    this.currentStartSec = startSec;
    this.currentEndSec = endSec;

    // Update words via DOM-diffing in-place (no full innerHTML wipe)
    this.renderWords(text, this.currBoxEl);
    this.currBoxEl.classList.remove('hidden', 'delos-fading');

    // Keep active while speech is streaming
    if (this.currHideTimer) {
      clearTimeout(this.currHideTimer);
      this.currHideTimer = null;
    }
  }

  /**
   * Final result: Deepgram has locked in this speech segment.
   * Render definitive text, mark as committed, and schedule hide timer.
   */
  private handleFinal(text: string, startSec: number, endSec: number): void {
    if (!this.currBoxEl || !this.prevBoxEl) return;

    if (this.isCurrentCommitted && this.currentCue && !this.currBoxEl.classList.contains('hidden')) {
      this.promoteToPrev();
    }

    this.currentCue = { text, startSec, endSec };
    this.currentSentence = text;
    this.currentStartSec = startSec;
    this.currentEndSec = endSec;
    this.isCurrentCommitted = true;
    this.lastCueRenderTime = Date.now();

    this.renderWords(text, this.currBoxEl);
    this.currBoxEl.classList.remove('hidden', 'delos-fading');

    // Auto-hide when silence follows: minimum 2.6s, +280ms per word (up to 4.2s max)
    const words = text.split(/\s+/).filter(Boolean);
    const holdMs = Math.min(Math.max(2600, words.length * 280 + 400), 4200);

    if (!this.activeVideo || !this.activeVideo.paused) {
      this.scheduleCurrHide(holdMs);
    }
  }

  /**
   * Promote the current committed cue to the upper (prev) subtitle line.
   * Transitions smoothly upwards into the upper slot while gently dimming.
   */
  private promoteToPrev(): void {
    if (!this.prevBoxEl || !this.currentCue) return;

    this.previousCue = this.currentCue;
    this.prevBoxEl.innerHTML = '';
    this.renderWords(this.previousCue.text, this.prevBoxEl);
    this.prevBoxEl.classList.remove('hidden', 'delos-fading');
    this.prevBoxEl.classList.add('delos-promoting');

    // Remove promoting class on next frame to trigger CSS upward transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.prevBoxEl?.classList.remove('delos-promoting');
      });
    });

    this.schedulePrevHide(1800);
  }

  private scheduleCurrHide(delayMs: number): void {
    if (this.currHideTimer) {
      clearTimeout(this.currHideTimer);
    }
    this.currHideUntil = Date.now() + delayMs;
    this.currHideTimer = setTimeout(() => {
      this.currHideTimer = null;
      if (this.activeVideo && this.activeVideo.paused) {
        return;
      }
      this.hideCurrBox();
      this.hidePrevBox();
      this.currentCue = null;
      this.previousCue = null;
      if (this.popupController?.isOpen()) {
        this.popupController.hide();
      }
    }, delayMs);
  }

  private schedulePrevHide(delayMs: number): void {
    if (this.prevHideTimer) {
      clearTimeout(this.prevHideTimer);
    }
    this.prevHideUntil = Date.now() + delayMs;
    this.prevHideTimer = setTimeout(() => {
      this.prevHideTimer = null;
      if (this.activeVideo && this.activeVideo.paused) {
        return;
      }
      this.hidePrevBox();
      this.previousCue = null;
    }, delayMs);
  }

  private hidePrevBox(): void {
    if (!this.prevBoxEl || this.prevBoxEl.classList.contains('hidden')) return;
    this.prevBoxEl.classList.add('delos-fading');
    setTimeout(() => {
      if (this.prevBoxEl && this.prevBoxEl.classList.contains('delos-fading')) {
        this.prevBoxEl.classList.remove('delos-fading');
        this.prevBoxEl.classList.add('hidden');
      }
    }, 220);
  }

  private hideCurrBox(): void {
    if (!this.currBoxEl || this.currBoxEl.classList.contains('hidden')) return;
    this.currBoxEl.classList.add('delos-fading');
    setTimeout(() => {
      if (this.currBoxEl && this.currBoxEl.classList.contains('delos-fading')) {
        this.currBoxEl.classList.remove('delos-fading');
        this.currBoxEl.classList.add('hidden');
      }
    }, 220);
  }

  /**
   * Smart DOM diffing: updates or appends words without destroying already rendered elements.
   * Newly appended words animate smoothly, while existing words stay rock-solid in DOM.
   */
  private renderWords(sentence: string, container: HTMLElement): void {
    const tokens = sentence.split(/\s+/).filter(Boolean);
    const existingSpans = Array.from(container.querySelectorAll<HTMLElement>('.delos-sub-word'));

    // 1. Update matching prefix spans or reuse them without re-creating DOM nodes
    const minLen = Math.min(tokens.length, existingSpans.length);
    for (let i = 0; i < minLen; i++) {
      const token = tokens[i];
      const span = existingSpans[i];
      if (span.textContent !== token) {
        span.textContent = token;
        const cleanWord = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        span.dataset.word = cleanWord || token;
        span.dataset.sentence = this.currentSentence;
        span.dataset.start = String(this.currentStartSec);
        span.dataset.end = String(this.currentEndSec);
      }
    }

    // 2. If tokens shrank, remove excess spans and their space text nodes
    if (existingSpans.length > tokens.length) {
      for (let i = tokens.length; i < existingSpans.length; i++) {
        const span = existingSpans[i];
        if (span.previousSibling && span.previousSibling.nodeType === Node.TEXT_NODE) {
          span.previousSibling.remove();
        }
        span.remove();
      }
    }

    // 3. If tokens grew, append new spans with entrance animation
    if (tokens.length > existingSpans.length) {
      for (let i = existingSpans.length; i < tokens.length; i++) {
        const token = tokens[i];

        if (container.lastChild) {
          container.appendChild(document.createTextNode(' '));
        }

        const span = document.createElement('span');
        span.className = 'delos-sub-word';
        span.textContent = token;

        const cleanWord = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        span.dataset.word = cleanWord || token;
        span.dataset.sentence = this.currentSentence;
        span.dataset.start = String(this.currentStartSec);
        span.dataset.end = String(this.currentEndSec);

        span.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onWordClicked(token, span);
        });

        container.appendChild(span);
      }
    }
  }

  private async onWordClicked(word: string, element: HTMLElement): Promise<void> {
    if (this.activeVideo && !this.activeVideo.paused) {
      this.activeVideo.pause();
    }

    if (this.cueWrapperEl) {
      this.cueWrapperEl
        .querySelectorAll('.delos-sub-word.selected')
        .forEach((el) => el.classList.remove('selected'));
    }
    element.classList.add('selected');

    if (!this.popupController) return;

    const cleanWord = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
    const targetWord = cleanWord || word.trim();
    const sentence = element.dataset.sentence || this.currentSentence || targetWord;

    if (!targetWord) return;

    const cacheKey = `${this.targetLanguage}:${targetWord.toLowerCase()}:${sentence.trim()}`;
    const cached = this.translationCache.get(cacheKey);

    if (cached) {
      this.popupController.show(
        {
          word: targetWord,
          translation: cached.translatedWord,
          sentenceTranslation: cached.translatedSentence,
        },
        element
      );
      return;
    }

    // Show popup immediately with loading indicator
    this.popupController.show(
      {
        word: targetWord,
        translation: '',
        loading: true,
      },
      element
    );

    try {
      const msg: TranslateWordMsg = {
        type: MSG.TRANSLATE_WORD,
        requestedWord: targetWord,
        fullSentence: sentence,
        targetLanguage: this.targetLanguage,
      };

      const resp = await chrome.runtime.sendMessage<TranslateWordMsg, TranslateWordResponse>(msg);

      if (resp && resp.success && resp.translatedWord) {
        this.translationCache.set(cacheKey, {
          translatedWord: resp.translatedWord,
          translatedSentence: resp.translatedSentence || '',
        });

        if (this.popupController.isOpen()) {
          this.popupController.update({
            word: targetWord,
            translation: resp.translatedWord,
            sentenceTranslation: resp.translatedSentence,
            loading: false,
          });
        }
      } else {
        if (this.popupController.isOpen()) {
          this.popupController.update({
            word: targetWord,
            error: resp?.error || 'Translation unavailable',
            loading: false,
          });
        }
      }
    } catch (err) {
      console.warn('[Delos Overlay] Translation request failed:', err);
      if (this.popupController.isOpen()) {
        this.popupController.update({
          word: targetWord,
          error: 'Connection error',
          loading: false,
        });
      }
    }
  }

  private applyConfig(): void {
    if (!this.hostEl || !this.cueWrapperEl) return;

    this.cueWrapperEl.dataset.pos = this.config.position;
    this.cueWrapperEl.dataset.align = this.config.align;
    this.cueWrapperEl.style.setProperty('--delos-offset', `${this.config.offset}%`);

    this.hostEl.style.setProperty('--delos-font-family', this.config.fontFamily);
    this.hostEl.style.setProperty('--delos-font-size', `${this.config.fontSize}px`);
    this.hostEl.style.setProperty('--delos-color', this.config.color);

    const bgComputed = hexToRgba(this.config.bgColor, this.config.bgOpacity);
    this.hostEl.style.setProperty('--delos-bg-computed', bgComputed);

    if (this.popupController) {
      this.popupController.syncStyle({
        fontFamily: this.config.fontFamily,
        fontSize: this.config.fontSize,
        color: this.config.color,
        bgColor: this.config.bgColor,
        bgOpacity: this.config.bgOpacity,
        position: this.config.position,
      });
    }
  }

  private generateShadowStyles(): string {
    return `
      :host {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none !important;
        z-index: 2147483646;
        overflow: hidden;
        display: block;
        box-sizing: border-box;
        font-family: var(--delos-font-family, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      }

      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .delos-overlay-stage {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        display: flex;
        flex-direction: column;
      }

      .delos-cue-wrapper {
        position: absolute;
        max-width: 90%;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: none;
        transition: top 0.2s ease, bottom 0.2s ease, opacity 0.15s ease;
      }

      .delos-cue-wrapper[data-pos="bottom"] {
        bottom: var(--delos-offset, 8%);
        top: auto;
      }

      .delos-cue-wrapper[data-pos="top"] {
        top: var(--delos-offset, 8%);
        bottom: auto;
      }

      .delos-cue-wrapper[data-align="left"] {
        left: 5%;
        right: auto;
        transform: none;
        align-items: flex-start;
      }

      .delos-cue-wrapper[data-align="center"] {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        align-items: center;
      }

      .delos-cue-wrapper[data-align="right"] {
        left: auto;
        right: 5%;
        transform: none;
        align-items: flex-end;
      }

      .delos-cue-box {
        display: block;
        width: fit-content;
        max-width: 100%;
        box-sizing: border-box;
        background-color: var(--delos-bg-computed, rgba(20, 20, 22, 0.75));
        color: var(--delos-color, #ffffff);
        font-size: var(--delos-font-size, 20px);
        line-height: 1.45;
        padding: 6px 14px;
        border-radius: 6px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 1px rgba(0, 0, 0, 0.9);
        white-space: pre-wrap;
        word-break: break-word;
        text-align: center;
        pointer-events: none;
        opacity: 1;
        transform: translateY(0);
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    filter 0.22s ease-out;
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .delos-cue-box.delos-older {
        opacity: 0.78;
        font-size: calc(var(--delos-font-size, 20px) * 0.92);
        filter: brightness(0.92);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .delos-cue-box.delos-promoting {
        transform: translateY(22px);
        opacity: 0.95;
        transition: none !important;
      }

      .delos-cue-box.delos-fading {
        opacity: 0;
        transform: translateY(-8px);
        filter: blur(1px);
        pointer-events: none;
      }

      .delos-cue-box.hidden {
        display: none !important;
      }

      @starting-style {
        .delos-cue-box:not(.hidden):not(.delos-fading):not(.delos-promoting) {
          opacity: 0;
          transform: translateY(6px);
        }
      }

      .delos-sub-word {
        display: inline-block;
        padding: 0 2px;
        border-radius: 3px;
        color: inherit;
        cursor: pointer;
        pointer-events: auto !important;
        transition: background-color 0.12s ease, outline 0.12s ease, color 0.12s ease;
        user-select: none;
        animation: delosWordAppear 0.18s ease-out both;
      }

      @keyframes delosWordAppear {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .delos-sub-word:hover {
        background-color: rgba(229, 190, 119, 0.28);
        outline: 1px solid var(--delos-color, #ffffff);
      }

      .delos-sub-word.selected {
        background-color: rgba(229, 190, 119, 0.45);
        color: #ffffff;
        outline: 1px solid #e5be77;
      }

      /* Word Popup Inside Shadow DOM */
      .delos-word-popup {
        position: absolute;
        z-index: 2147483647;
        min-width: 170px;
        max-width: 280px;
        background: var(--delos-bg-computed, rgba(20, 20, 22, 0.95));
        border: 1px solid #e5be77;
        border-radius: 8px;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
        font-size: 14px;
        color: #f2efe9;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }

      .delos-word-popup__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(229, 190, 119, 0.3);
      }

      .delos-word-popup__word {
        font-weight: 600;
        color: #e5be77;
        font-size: 15px;
      }

      .delos-word-popup__close {
        background: none;
        border: none;
        color: #a39d93;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 3px;
        line-height: 1;
      }

      .delos-word-popup__close:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }

      .delos-word-popup__translation {
        font-weight: 500;
        color: #f2efe9;
        line-height: 1.35;
        font-size: 13px;
      }

      .delos-word-popup__sentence {
        font-weight: 400;
        color: rgba(242, 239, 233, 0.85);
        line-height: 1.35;
        font-size: 12px;
        padding-top: 4px;
        border-top: 1px dashed rgba(229, 190, 119, 0.25);
        font-style: italic;
      }

      .delos-word-popup__loader {
        font-weight: 600;
        font-size: 16px;
        letter-spacing: 2px;
        color: #e5be77;
        animation: delosPulse 1.2s infinite ease-in-out;
        padding: 2px 0;
      }

      @keyframes delosPulse {
        0%, 100% { opacity: 0.35; transform: scale(0.96); }
        50% { opacity: 1; transform: scale(1.04); }
      }

      .delos-word-popup__footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }

      .delos-word-popup__settings {
        background: none;
        border: none;
        color: #a39d93;
        padding: 3px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
      }

      .delos-word-popup__settings:hover {
        color: #e5be77;
        background: rgba(255, 255, 255, 0.1);
      }

      .delos-word-popup__settings svg {
        width: 13px;
        height: 13px;
        display: block;
      }
    `;
  }
}
