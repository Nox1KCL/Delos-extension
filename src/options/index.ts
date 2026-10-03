import {
  DEFAULT_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  DEFAULT_THEME,
  DEFAULT_UI_LANGUAGE,
  STORAGE_KEYS,
  SUBTITLE_DEFAULTS,
} from '../shared/constants';
import {
  applyUiLocale,
  getLanguageName,
  t,
  type UiLocale,
} from '../shared/i18n';
import { applyTheme, type ThemeMode } from '../shared/theme';
import {
  createWordPopup,
  renderClickableSubtitleWords,
} from '../shared/wordPopup';

async function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local.get(keys);
  }
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (raw !== null) {
      try {
        out[k] = JSON.parse(raw);
      } catch {
        out[k] = raw;
      }
    }
  }
  return out;
}

async function storageSet(items: Record<string, unknown>): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set(items);
    return;
  }
  for (const [k, v] of Object.entries(items)) {
    localStorage.setItem(k, JSON.stringify(v));
  }
}

interface SampleSentence {
  text: string;
  words: Record<string, Record<string, string>>;
}

const PREVIEW_SAMPLES: Record<string, SampleSentence> = {
  en: {
    text: 'The dog began to bark at the stranger.',
    words: {
      the: { uk: 'означений артикль', en: 'definite article', de: 'bestimmter Artikel', fr: 'article défini', es: 'artículo definido', pl: 'przedimek określony' },
      dog: { uk: 'собака, пес', en: 'domestic canine', de: 'Hund', fr: 'chien', es: 'perro', it: 'cane', pl: 'pies', pt: 'cão', ja: '犬', ko: '개', zh: '狗' },
      began: { uk: 'почав, розпочав', en: 'started', de: 'begann', fr: 'a commencé', es: 'empezó', it: 'iniziò', pl: 'zaczął', pt: 'começou', ja: '始めた', ko: '시작했다', zh: '开始' },
      to: { uk: 'частка інфінітива', en: 'infinitive marker', de: 'zu', fr: 'à, de', es: 'a', pl: 'do' },
      bark: { uk: 'гавкати', en: 'make a sharp cry', de: 'bellen', fr: 'aboyer', es: 'ladrar', it: 'abbaiare', pl: 'szczekać', pt: 'latir', ja: '吠える', ko: '짖다', zh: '吠叫' },
      at: { uk: 'на (когось)', en: 'directed toward', de: 'an, auf', fr: 'sur, vers', es: 'a, hacia', pl: 'na' },
      stranger: { uk: 'незнайомець, чужинець', en: 'unknown person', de: 'Fremder', fr: 'inconnu, étranger', es: 'extraño, desconocido', it: 'sconosciuto', pl: 'nieznajomy', pt: 'estranho', ja: '見知らぬ人', ko: '낯선 사람', zh: '陌生人' },
    },
  },
  uk: {
    text: 'Субтитри автоматично підлаштовуються під плеєр.',
    words: {
      субтитри: { en: 'subtitles, captions', uk: 'текстовий супровід', de: 'Untertitel', pl: 'napisy', fr: 'sous-titres', es: 'subtítulos' },
      автоматично: { en: 'automatically', uk: 'самостійно', de: 'automatisch', pl: 'automatycznie', fr: 'automatiquement', es: 'automáticamente' },
      підлаштовуються: { en: 'adapt, adjust', uk: 'адаптуються', de: 'passen sich an', pl: 'dostosowują się', fr: "s'adaptent", es: 'se adaptan' },
      під: { en: 'to, for', uk: 'відповідно до', de: 'an', pl: 'pod' },
      плеєр: { en: 'video player', uk: 'відеопрогравач', de: 'Videoplayer', pl: 'odtwarzacz', fr: 'lecteur vidéo', es: 'reproductor' },
    },
  },
  de: {
    text: 'Die Geschichte dieser Stadt bleibt ein Rätsel.',
    words: {
      geschichte: { uk: 'історія', en: 'history, story', pl: 'historia', fr: 'histoire' },
      dieser: { uk: 'цього, цієї', en: 'of this', pl: 'tego' },
      stadt: { uk: 'місто', en: 'city, town', pl: 'miasto', fr: 'ville' },
      bleibt: { uk: 'залишається', en: 'remains', pl: 'pozostaje', fr: 'reste' },
      rätsel: { uk: 'загадка, таємниця', en: 'mystery, riddle', pl: 'zagadka', fr: 'énigme' },
    },
  },
  fr: {
    text: 'La lumière du soir éclaire doucement la rue.',
    words: {
      lumière: { uk: 'світло', en: 'light', de: 'Licht', pl: 'światło' },
      soir: { uk: 'вечір', en: 'evening', de: 'Abend', pl: 'wieczór' },
      éclaire: { uk: 'освітлює', en: 'illuminates', de: 'beleuchtet', pl: 'oświetla' },
      doucement: { uk: 'м’яко, тихо', en: 'gently, softly', de: 'sanft', pl: 'łagodnie' },
      rue: { uk: 'вулиця', en: 'street', de: 'Straße', pl: 'ulica' },
    },
  },
  es: {
    text: 'El silencio de la noche revela secretos.',
    words: {
      silencio: { uk: 'тиша', en: 'silence', de: 'Stille', pl: 'cisza' },
      noche: { uk: 'ніч', en: 'night', de: 'Nacht', pl: 'noc' },
      revela: { uk: 'розкриває', en: 'reveals', de: 'enthüllt', pl: 'ujawnia' },
      secretos: { uk: 'таємниці, секрети', en: 'secrets', de: 'Geheimnisse', pl: 'sekrety' },
    },
  },
  it: {
    text: 'Ogni parola racconta una storia diversa.',
    words: {
      ogni: { uk: 'кожен, кожне', en: 'every, each' },
      parola: { uk: 'слово', en: 'word' },
      racconta: { uk: 'розповідає', en: 'tells' },
      storia: { uk: 'історія', en: 'story' },
      diversa: { uk: 'інша, різна', en: 'different' },
    },
  },
  pl: {
    text: 'Każde nowe słowo możesz łatwo przetłumaczyć.',
    words: {
      każde: { uk: 'кожне', en: 'every, each' },
      nowe: { uk: 'нове', en: 'new' },
      słowo: { uk: 'слово', en: 'word' },
      możesz: { uk: 'можеш', en: 'you can' },
      łatwo: { uk: 'легко', en: 'easily' },
      przetłumaczyć: { uk: 'перекласти', en: 'translate' },
    },
  },
  pt: {
    text: 'A tradução ajuda a compreender expressões.',
    words: {
      tradução: { uk: 'переклад', en: 'translation' },
      ajuda: { uk: 'допомагає', en: 'helps' },
      compreender: { uk: 'розуміти', en: 'understand' },
      expressões: { uk: 'вирази', en: 'expressions' },
    },
  },
  ja: {
    text: '静かな夜の海には古い物語が隠されている。',
    words: {
      '静かな夜の海には古い物語が隠されている。': {
        uk: 'У тихому нічному морі прихована давня історія.',
        en: 'An ancient story is hidden in the quiet night sea.',
      },
    },
  },
  ko: {
    text: '모든 문장은 맥락 속에서 새로운 의미를 가집니다.',
    words: {
      모든: { uk: 'усі, кожне', en: 'every, all' },
      문장은: { uk: 'речення', en: 'sentence' },
      맥락: { uk: 'контекст', en: 'context' },
      속에서: { uk: 'всередині, у', en: 'within, in' },
      새로운: { uk: 'новий', en: 'new' },
      의미를: { uk: 'значення', en: 'meaning' },
      가집니다: { uk: 'має', en: 'has, holds' },
    },
  },
  zh: {
    text: '每一个词语在语境中都有独特的含义。',
    words: {
      '每一个词语在语境中都有独特的含义。': {
        uk: 'Кожне слово в контексті має своє унікальне значення.',
        en: 'Every word has a unique meaning in context.',
      },
    },
  },
};

const FONT_STACKS: Record<string, string> = {
  'Inter': "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  'Roboto': "'Roboto', Arial, sans-serif",
  'Open Sans': "'Open Sans', 'Segoe UI', sans-serif",
  'Montserrat': "'Montserrat', sans-serif",
  'Georgia': "Georgia, 'Times New Roman', serif",
  'Courier New': "'Courier New', Courier, monospace",
};

const apiKeyInput       = document.getElementById('apiKey')         as HTMLInputElement;
const apiKeyStatus      = document.getElementById('apiKeyStatus')   as HTMLElement;
const showKeyBtn        = document.getElementById('showKeyBtn')     as HTMLButtonElement;
const languageSel       = document.getElementById('language')       as HTMLSelectElement;
const targetLanguageSel = document.getElementById('targetLanguage') as HTMLSelectElement;
const resetBtn          = document.getElementById('resetBtn')       as HTMLButtonElement;
const saveStatus        = document.getElementById('saveStatus')     as HTMLElement;
const saveStatusText    = document.getElementById('saveStatusText') as HTMLElement;

const subFontFamily = document.getElementById('subFontFamily') as HTMLSelectElement;
const subFontSize   = document.getElementById('subFontSize')   as HTMLInputElement;
const subColor      = document.getElementById('subColor')      as HTMLInputElement;
const subColorHex   = document.getElementById('subColorHex')   as HTMLInputElement;
const subBgColor    = document.getElementById('subBgColor')    as HTMLInputElement;
const subBgColorHex = document.getElementById('subBgColorHex') as HTMLInputElement;
const subBgOpacity  = document.getElementById('subBgOpacity')  as HTMLInputElement;
const subOffset     = document.getElementById('subOffset')     as HTMLInputElement;

const fontSizeVal  = document.getElementById('fontSizeVal')  as HTMLElement;
const bgOpacityVal = document.getElementById('bgOpacityVal') as HTMLElement;
const offsetVal    = document.getElementById('offsetVal')    as HTMLElement;

const previewStage        = document.getElementById('previewStage')        as HTMLElement;
const previewSubtitleWrap = document.getElementById('previewSubtitleWrap') as HTMLElement;
const previewText         = document.getElementById('previewText')         as HTMLElement;

const wordPopup = createWordPopup(previewStage, () => {
  subFontFamily.focus();
});

let selectedWordIndex: number | null = 7;
let lastLangRendered = '';
let saveTimer: number | null = null;

function getRadioValue<T extends string>(name: string, fallback: T): T {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return (el?.value as T) ?? fallback;
}

function setRadioValue(name: string, value: string): void {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function normalizeHex(input: string, fallback: string): string {
  const clean = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean.toLowerCase();
  return fallback;
}

function updateSwatchesActive(targetId: string, hexValue: string): void {
  const container = document.querySelector(`.color-swatches[data-target="${targetId}"]`);
  if (!container) return;
  container.querySelectorAll<HTMLButtonElement>('.swatch-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.color?.toLowerCase() === hexValue.toLowerCase());
  });
}

function resolveWordTranslation(sample: SampleSentence, rawToken: string): { word: string; translation: string } {
  const trgLang = (targetLanguageSel.value || DEFAULT_TARGET_LANGUAGE).toLowerCase();
  const cleanWord = rawToken.replace(/[.,!?;:«»"']/g, '');
  const key = cleanWord.toLowerCase();

  const entry = sample.words[key] ?? sample.words[rawToken];
  const translation =
    entry?.[trgLang] ??
    entry?.uk ??
    entry?.en ??
    getLanguageName(trgLang);

  return {
    word: cleanWord || rawToken,
    translation,
  };
}

function updatePreview(): void {
  const lang       = languageSel.value || DEFAULT_LANGUAGE;
  const fontFamily = subFontFamily.value || SUBTITLE_DEFAULTS.fontFamily;
  const fontSize   = Number(subFontSize.value) || SUBTITLE_DEFAULTS.fontSize;
  const color      = normalizeHex(subColor.value, SUBTITLE_DEFAULTS.color);
  const bgColor    = normalizeHex(subBgColor.value, SUBTITLE_DEFAULTS.bgColor);
  const bgOpacity  = Number(subBgOpacity.value);
  const offset     = Number(subOffset.value);
  const position   = getRadioValue<'top' | 'bottom'>('subPosition', SUBTITLE_DEFAULTS.position);
  const align      = getRadioValue<'left' | 'center' | 'right'>('subAlign', SUBTITLE_DEFAULTS.align);

  const sample = PREVIEW_SAMPLES[lang] ?? PREVIEW_SAMPLES.en;
  const tokens = sample.text.split(' ');

  if (lang !== lastLangRendered) {
    lastLangRendered = lang;
    selectedWordIndex = tokens.length - 1;
  }

  subColorHex.value   = color.toUpperCase();
  subBgColorHex.value = bgColor.toUpperCase();
  updateSwatchesActive('subColor', color);
  updateSwatchesActive('subBgColor', bgColor);

  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const alpha = Math.max(0, Math.min(100, bgOpacity)) / 100;

  const resolvedFontStack = FONT_STACKS[fontFamily] ?? fontFamily;
  const scaledFontSize = Math.round(fontSize * 0.78);

  previewText.style.fontFamily      = resolvedFontStack;
  previewText.style.fontWeight      = '400';
  previewText.style.fontSize        = `${scaledFontSize}px`;
  previewText.style.color           = color;
  previewText.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  previewText.style.borderRadius    = '6px';
  previewText.style.padding         = '6px 12px';
  previewText.style.textShadow      = 'none';
  previewText.style.textAlign       = align;

  previewSubtitleWrap.style.alignItems =
    align === 'left' ? 'flex-start' :
    align === 'right' ? 'flex-end' : 'center';

  if (position === 'bottom') {
    previewSubtitleWrap.style.top    = 'auto';
    previewSubtitleWrap.style.bottom = `${offset}%`;
  } else {
    previewSubtitleWrap.style.bottom = 'auto';
    previewSubtitleWrap.style.top    = `${offset}%`;
  }

  const activeSpan = renderClickableSubtitleWords(
    previewText,
    sample.text,
    selectedWordIndex,
    (clickedToken, idx, spanEl) => {
      selectedWordIndex = idx;
      const info = resolveWordTranslation(sample, clickedToken);
      wordPopup.show(info, spanEl);
    }
  );

  wordPopup.syncStyle({
    fontFamily: resolvedFontStack,
    fontSize: scaledFontSize,
    color,
    bgColor,
    bgOpacity,
    position,
  });

  if (selectedWordIndex !== null && activeSpan) {
    const activeToken = tokens[selectedWordIndex] ?? tokens[tokens.length - 1];
    const info = resolveWordTranslation(sample, activeToken);
    wordPopup.show(info, activeSpan);
  }

  fontSizeVal.textContent  = String(fontSize);
  bgOpacityVal.textContent = String(bgOpacity);
  offsetVal.textContent    = String(offset);

  const hasKey = apiKeyInput.value.trim().length > 0;
  apiKeyStatus.textContent = hasKey ? t('apiKeyActive') : t('apiKeyMissing');
  apiKeyStatus.classList.toggle('ok', hasKey);
}

previewStage.addEventListener('click', () => {
  selectedWordIndex = null;
  wordPopup.hide();
});

async function loadSettings(): Promise<void> {
  try {
    const keys = Object.values(STORAGE_KEYS);
    const result = await storageGet(keys);

    const savedUiLang = ((result[STORAGE_KEYS.UI_LANGUAGE] as string) || DEFAULT_UI_LANGUAGE) as UiLocale;
    setRadioValue('uiLanguage', savedUiLang);
    applyUiLocale(savedUiLang);

    const savedTheme = ((result[STORAGE_KEYS.THEME] as string) || DEFAULT_THEME) as ThemeMode;
    setRadioValue('uiTheme', savedTheme);
    applyTheme(savedTheme);

    apiKeyInput.value       = (result[STORAGE_KEYS.API_KEY] as string) || '';
    languageSel.value       = (result[STORAGE_KEYS.LANGUAGE] as string) || DEFAULT_LANGUAGE;
    targetLanguageSel.value = (result[STORAGE_KEYS.TARGET_LANGUAGE] as string) || DEFAULT_TARGET_LANGUAGE;

    subFontFamily.value = String(result[STORAGE_KEYS.SUBTITLE_FONT_FAMILY] ?? SUBTITLE_DEFAULTS.fontFamily);
    subFontSize.value   = String(result[STORAGE_KEYS.SUBTITLE_FONT_SIZE]   ?? SUBTITLE_DEFAULTS.fontSize);
    subColor.value      = normalizeHex(String(result[STORAGE_KEYS.SUBTITLE_COLOR]    ?? SUBTITLE_DEFAULTS.color), SUBTITLE_DEFAULTS.color);
    subBgColor.value    = normalizeHex(String(result[STORAGE_KEYS.SUBTITLE_BG_COLOR] ?? SUBTITLE_DEFAULTS.bgColor), SUBTITLE_DEFAULTS.bgColor);
    subBgOpacity.value  = String(result[STORAGE_KEYS.SUBTITLE_BG_OPACITY]  ?? SUBTITLE_DEFAULTS.bgOpacity);
    const rawOffset = result[STORAGE_KEYS.SUBTITLE_OFFSET];
    const effectiveOffset = typeof rawOffset === 'number' && rawOffset > 8 ? rawOffset : SUBTITLE_DEFAULTS.offset;
    subOffset.value = String(effectiveOffset);

    setRadioValue('subPosition', String(result[STORAGE_KEYS.SUBTITLE_POSITION] ?? SUBTITLE_DEFAULTS.position));
    setRadioValue('subAlign',    String(result[STORAGE_KEYS.SUBTITLE_ALIGN]    ?? SUBTITLE_DEFAULTS.align));
  } catch (err) {
    console.warn('[Delos] Failed to read storage, using defaults:', err);
  }

  updatePreview();
}

async function persistSettings(): Promise<void> {
  const theme = getRadioValue<ThemeMode>('uiTheme', DEFAULT_THEME);
  const uiLocale = getRadioValue<UiLocale>('uiLanguage', DEFAULT_UI_LANGUAGE);

  await storageSet({
    [STORAGE_KEYS.API_KEY]:              apiKeyInput.value.trim(),
    [STORAGE_KEYS.LANGUAGE]:             languageSel.value,
    [STORAGE_KEYS.TARGET_LANGUAGE]:      targetLanguageSel.value,
    [STORAGE_KEYS.UI_LANGUAGE]:          uiLocale,
    [STORAGE_KEYS.THEME]:                theme,
    [STORAGE_KEYS.SUBTITLE_FONT_FAMILY]: subFontFamily.value,
    [STORAGE_KEYS.SUBTITLE_FONT_SIZE]:   Number(subFontSize.value),
    [STORAGE_KEYS.SUBTITLE_COLOR]:       normalizeHex(subColor.value, SUBTITLE_DEFAULTS.color),
    [STORAGE_KEYS.SUBTITLE_BG_COLOR]:    normalizeHex(subBgColor.value, SUBTITLE_DEFAULTS.bgColor),
    [STORAGE_KEYS.SUBTITLE_BG_OPACITY]:  Number(subBgOpacity.value),
    [STORAGE_KEYS.SUBTITLE_OFFSET]:      Number(subOffset.value),
    [STORAGE_KEYS.SUBTITLE_POSITION]:    getRadioValue('subPosition', SUBTITLE_DEFAULTS.position),
    [STORAGE_KEYS.SUBTITLE_ALIGN]:       getRadioValue('subAlign', SUBTITLE_DEFAULTS.align),
  });

  saveStatus.classList.add('saved');
  saveStatusText.textContent = t('statusSaving');
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStatus.classList.remove('saved');
    saveStatusText.textContent = t('statusSynced');
  }, 1400);
}

function scheduleAutoSave(): void {
  updatePreview();
  void persistSettings();
}

async function resetSubtitleDefaults(): Promise<void> {
  subFontFamily.value = SUBTITLE_DEFAULTS.fontFamily;
  subFontSize.value   = String(SUBTITLE_DEFAULTS.fontSize);
  subColor.value      = SUBTITLE_DEFAULTS.color;
  subBgColor.value    = SUBTITLE_DEFAULTS.bgColor;
  subBgOpacity.value  = String(SUBTITLE_DEFAULTS.bgOpacity);
  subOffset.value     = String(SUBTITLE_DEFAULTS.offset);

  setRadioValue('subPosition', SUBTITLE_DEFAULTS.position);
  setRadioValue('subAlign',    SUBTITLE_DEFAULTS.align);

  updatePreview();
  await persistSettings();
}

showKeyBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

apiKeyInput.addEventListener('input', scheduleAutoSave);
languageSel.addEventListener('change', scheduleAutoSave);
targetLanguageSel.addEventListener('change', scheduleAutoSave);

document.querySelectorAll<HTMLInputElement>('input[name="uiLanguage"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const locale = getRadioValue<UiLocale>('uiLanguage', DEFAULT_UI_LANGUAGE);
    applyUiLocale(locale);
    scheduleAutoSave();
  });
});

document.querySelectorAll<HTMLInputElement>('input[name="uiTheme"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const theme = getRadioValue<ThemeMode>('uiTheme', DEFAULT_THEME);
    applyTheme(theme);
    scheduleAutoSave();
  });
});

const liveControls = [
  subFontFamily,
  subFontSize,
  subColor,
  subBgColor,
  subBgOpacity,
  subOffset,
];

liveControls.forEach((ctrl) => {
  ctrl.addEventListener('input', scheduleAutoSave);
  ctrl.addEventListener('change', scheduleAutoSave);
});

subColorHex.addEventListener('input', () => {
  const val = subColorHex.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    subColor.value = val.toLowerCase();
    scheduleAutoSave();
  }
});

subBgColorHex.addEventListener('input', () => {
  const val = subBgColorHex.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    subBgColor.value = val.toLowerCase();
    scheduleAutoSave();
  }
});

document.querySelectorAll<HTMLElement>('.color-swatches').forEach((group) => {
  const targetId = group.dataset.target;
  group.querySelectorAll<HTMLButtonElement>('.swatch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hex = btn.dataset.color;
      if (!hex || !targetId) return;
      const inputEl = document.getElementById(targetId) as HTMLInputElement | null;
      if (inputEl) {
        inputEl.value = hex;
        scheduleAutoSave();
      }
    });
  });
});

document
  .querySelectorAll<HTMLInputElement>('input[name="subPosition"], input[name="subAlign"]')
  .forEach((el) => {
    el.addEventListener('change', scheduleAutoSave);
  });

resetBtn.addEventListener('click', () => {
  void resetSubtitleDefaults();
});

window.addEventListener('resize', () => {
  updatePreview();
});

applyUiLocale(DEFAULT_UI_LANGUAGE);
applyTheme(DEFAULT_THEME);
updatePreview();
void loadSettings();
