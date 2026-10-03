import { DEFAULT_UI_LANGUAGE, STORAGE_KEYS } from './constants';

export type UiLocale = 'en' | 'uk';

export const UI_LANGUAGES: readonly { code: UiLocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UK' },
] as const;

export const CONTENT_LANGUAGES: readonly { code: string; name: Record<UiLocale, string> }[] = [
  { code: 'en', name: { en: 'English',    uk: 'Англійська (English)' } },
  { code: 'uk', name: { en: 'Ukrainian',  uk: 'Українська' } },
  { code: 'de', name: { en: 'German',     uk: 'Німецька (Deutsch)' } },
  { code: 'fr', name: { en: 'French',     uk: 'Французька (Français)' } },
  { code: 'es', name: { en: 'Spanish',    uk: 'Іспанська (Español)' } },
  { code: 'it', name: { en: 'Italian',    uk: 'Італійська (Italiano)' } },
  { code: 'pl', name: { en: 'Polish',     uk: 'Польська (Polski)' } },
  { code: 'pt', name: { en: 'Portuguese', uk: 'Португальська (Português)' } },
  { code: 'ja', name: { en: 'Japanese',   uk: 'Японська (日本語)' } },
  { code: 'ko', name: { en: 'Korean',     uk: 'Корейська (한국어)' } },
  { code: 'zh', name: { en: 'Chinese',    uk: 'Китайська (中文)' } },
] as const;

const en = {
  pageTitle: 'Delos – Settings',
  brandSub: 'Subtitles & translation',

  apiKeyLabel: 'Deepgram API Key',
  apiKeyPlaceholder: 'Paste key dg_...',
  apiKeyShowHide: 'Show or hide key',
  apiKeyActive: 'Key active',
  apiKeyMissing: 'No key',
  keyInvalid: 'Invalid format',

  videoLangLabel: 'Video language',
  translateToLabel: 'Translate to',
  appLangLabel: 'App language',
  themeLabel: 'Theme',
  themeDark: 'Dark',
  themeLight: 'Light',

  statusSynced: 'Saved',
  statusSaving: 'Saved ✓',
  resetBtn: 'Reset',
  resetBtnTitle: 'Reset subtitle settings to default',

  subPanelTitle: 'Subtitles',
  subPanelHint: 'Auto-saved',

  fontLabel: 'Font',
  fontStandard: 'Inter (Default)',
  fontSerif: 'Georgia (Serif)',
  fontMono: 'Courier New (Mono)',

  fontSizeLabel: 'Text size',
  textColorLabel: 'Text color',
  bgColorLabel: 'Background color',
  bgOpacityLabel: 'Background opacity',
  screenMarginLabel: 'Edge offset',

  positionLabel: 'Position',
  posTop: 'Top',
  posBottom: 'Bottom',

  alignLabel: 'Alignment',
  alignLeft: 'Left',
  alignCenter: 'Center',
  alignRight: 'Right',

  previewTitle: 'Preview',
  wordPopupSettings: 'Settings',

  popupSubtitles: 'Subtitles on tab',
  popupOff: 'Off',
  popupOn: 'Active',
  popupBlocked: 'Not available on this site',
  popupNeedKey: 'Add API key in settings',
  popupNoVideo: 'No video found (refresh tab or play video)',
  popupCaptureFailed: 'Capture failed (refresh tab)',
  popupOpenSettings: 'Settings',

  groqApiKeyLabel: 'Groq API Key',
  groqApiKeyPlaceholder: 'Paste key gsk_...',
  groqApiKeyShowHide: 'Show or hide Groq key',
  groqApiKeyActive: 'Key active',
  groqApiKeyMissing: 'No key',
  helpKeyTitle: 'How to get free key?',
  tutorialModalTitle: 'How to get free API Key',
  tutorialDeepgramTitle: 'How to get free Deepgram Key',
  tutorialDeepgramStep1: 'Go to console.deepgram.com and sign up with Google or GitHub.',
  tutorialDeepgramStep2: 'Deepgram automatically gives you $200 in free credits.',
  tutorialDeepgramStep3: 'Navigate to "API Keys" -> click "Create a New API Key".',
  tutorialDeepgramStep4: 'Copy the key and paste it into the field.',
  tutorialGroqTitle: 'How to get free Groq Key',
  tutorialGroqStep1: 'Go to console.groq.com/keys and sign in with Google or GitHub.',
  tutorialGroqStep2: 'Click the "Create API Key" button and name it (e.g. Delos).',
  tutorialGroqStep3: 'Copy the generated key (starts with gsk_...) — it is completely free.',
  tutorialGroqStep4: 'Paste the key into the Groq field for instant translations.',
  tutorialOpenWebsite: 'Open Website ↗',
  tutorialClose: 'Close',
};

export type TranslationKey = keyof typeof en;
export type TranslationDict = Record<TranslationKey, string>;

const uk: TranslationDict = {
  pageTitle: 'Delos – Налаштування',
  brandSub: 'Субтитри та переклад',

  apiKeyLabel: 'API ключ Deepgram',
  apiKeyPlaceholder: 'Встав ключ dg_...',
  apiKeyShowHide: 'Показати або сховати ключ',
  apiKeyActive: 'Ключ є',
  apiKeyMissing: 'Немає ключа',
  keyInvalid: 'Невірний формат',

  videoLangLabel: 'Мова відео',
  translateToLabel: 'Мова перекладу',
  appLangLabel: 'Мова меню',
  themeLabel: 'Тема',
  themeDark: 'Темна',
  themeLight: 'Світла',

  statusSynced: 'Збережено',
  statusSaving: 'Збережено ✓',
  resetBtn: 'Скинути',
  resetBtnTitle: 'Скинути вигляд субтитрів до стандартного',

  subPanelTitle: 'Субтитри',
  subPanelHint: 'Зберігається саме',

  fontLabel: 'Шрифт',
  fontStandard: 'Inter (Звичайний)',
  fontSerif: 'Georgia (Із зарубками)',
  fontMono: 'Courier New (Моно)',

  fontSizeLabel: 'Розмір тексту',
  textColorLabel: 'Колір тексту',
  bgColorLabel: 'Колір фону',
  bgOpacityLabel: 'Прозорість фону',
  screenMarginLabel: 'Відступ від краю',

  positionLabel: 'Позиція',
  posTop: 'Зверху',
  posBottom: 'Знизу',

  alignLabel: 'Вирівнювання',
  alignLeft: 'Зліва',
  alignCenter: 'По центру',
  alignRight: 'Справа',

  previewTitle: "Прев'ю",
  wordPopupSettings: 'Налаштування',

  popupSubtitles: 'Субтитри на вкладці',
  popupOff: 'Вимкнено',
  popupOn: 'Працює',
  popupBlocked: 'Недоступно на цьому сайті',
  popupNeedKey: 'Додай API ключ у налаштуваннях',
  popupNoVideo: 'Відео не знайдено (онови вкладку або увімкни відео)',
  popupCaptureFailed: 'Помилка захоплення (онови вкладку)',
  popupOpenSettings: 'Налаштування',

  groqApiKeyLabel: 'API ключ Groq',
  groqApiKeyPlaceholder: 'Встав ключ gsk_...',
  groqApiKeyShowHide: 'Показати або сховати ключ Groq',
  groqApiKeyActive: 'Ключ є',
  groqApiKeyMissing: 'Немає ключа',
  helpKeyTitle: 'Як отримати безкоштовний ключ?',
  tutorialModalTitle: 'Як отримати безкоштовний API ключ',
  tutorialDeepgramTitle: 'Як отримати безкоштовний ключ Deepgram',
  tutorialDeepgramStep1: 'Перейди на console.deepgram.com та увійди через Google або GitHub.',
  tutorialDeepgramStep2: 'Deepgram автоматично нараховує $200 безкоштовних кредитів.',
  tutorialDeepgramStep3: 'Перейди у розділ "API Keys" -> натисни "Create a New API Key".',
  tutorialDeepgramStep4: 'Скопіюй ключ і встав його у відповідне поле.',
  tutorialGroqTitle: 'Як отримати безкоштовний ключ Groq',
  tutorialGroqStep1: 'Перейди на console.groq.com/keys та увійди через Google або GitHub.',
  tutorialGroqStep2: 'Натисни кнопку "Create API Key" і вкажи будь-яку назву (наприклад, Delos).',
  tutorialGroqStep3: 'Скопіюй створений ключ (починається на gsk_...) — це на 100% безкоштовно.',
  tutorialGroqStep4: 'Встав ключ у поле Groq для миттєвого перекладу.',
  tutorialOpenWebsite: 'Відкрити сайт ↗',
  tutorialClose: 'Закрити',
};

export const TRANSLATIONS: Record<UiLocale, TranslationDict> = {
  en,
  uk,
};

let currentLocale: UiLocale = DEFAULT_UI_LANGUAGE;
const localeListeners = new Set<(locale: UiLocale) => void>();

export function getUiLocale(): UiLocale {
  return currentLocale;
}

export function t(key: TranslationKey): string {
  const dict = TRANSLATIONS[currentLocale] ?? TRANSLATIONS.en;
  return dict[key] ?? TRANSLATIONS.en[key];
}

export function getLanguageName(code: string): string {
  const found = CONTENT_LANGUAGES.find((l) => l.code === code);
  if (!found) return code.toUpperCase();
  return found.name[currentLocale] ?? found.name.en;
}

export function applyUiLocale(locale: UiLocale): void {
  currentLocale = locale in TRANSLATIONS ? locale : DEFAULT_UI_LANGUAGE;
  document.documentElement.lang = currentLocale;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as TranslationKey;
    if (key) {
      el.textContent = t(key);
    }
  });

  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder as TranslationKey;
    if (key) {
      el.placeholder = t(key);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle as TranslationKey;
    if (key) {
      el.title = t(key);
    }
  });

  document.querySelectorAll<HTMLSelectElement>('select[data-lang-select]').forEach((sel) => {
    const currentVal = sel.value;
    Array.from(sel.options).forEach((opt) => {
      opt.textContent = getLanguageName(opt.value);
    });
    sel.value = currentVal;
  });

  localeListeners.forEach((fn) => fn(currentLocale));
}

export function onLocaleChange(callback: (locale: UiLocale) => void): () => void {
  localeListeners.add(callback);
  return () => localeListeners.delete(callback);
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.UI_LANGUAGE]) {
      const next = (changes[STORAGE_KEYS.UI_LANGUAGE].newValue as UiLocale) || DEFAULT_UI_LANGUAGE;
      applyUiLocale(next);
    }
  });
}
