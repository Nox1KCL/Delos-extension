import { DEFAULT_LANGUAGE, STORAGE_KEYS, SUBTITLE_DEFAULTS } from '../shared/constants';

const apiKeyInput  = document.getElementById('apiKey')        as HTMLInputElement;
const languageSel  = document.getElementById('language')      as HTMLSelectElement;
const showKeyBtn   = document.getElementById('showKeyBtn')    as HTMLButtonElement;
const saveBtn      = document.getElementById('saveBtn')       as HTMLButtonElement;
const toast        = document.getElementById('toast')         as HTMLElement;

const subFontSize   = document.getElementById('subFontSize')   as HTMLInputElement;
const subFontFamily = document.getElementById('subFontFamily') as HTMLSelectElement;
const subColor      = document.getElementById('subColor')      as HTMLInputElement;
const subBgColor    = document.getElementById('subBgColor')    as HTMLInputElement;
const subBgOpacity  = document.getElementById('subBgOpacity')  as HTMLInputElement;
const subOffset     = document.getElementById('subOffset')     as HTMLInputElement;

const fontSizeVal  = document.getElementById('fontSizeVal')  as HTMLElement;
const bgOpacityVal = document.getElementById('bgOpacityVal') as HTMLElement;
const offsetVal    = document.getElementById('offsetVal')    as HTMLElement;

const previewText         = document.getElementById('previewText')         as HTMLElement;
const previewSubtitleWrap = document.getElementById('previewSubtitleWrap') as HTMLElement;

function getPosition(): 'top' | 'bottom' {
  const el = document.querySelector<HTMLInputElement>('input[name="subPosition"]:checked');
  return (el?.value ?? SUBTITLE_DEFAULTS.position) as 'top' | 'bottom';
}

function getAlign(): 'left' | 'center' | 'right' {
  const el = document.querySelector<HTMLInputElement>('input[name="subAlign"]:checked');
  return (el?.value ?? SUBTITLE_DEFAULTS.align) as 'left' | 'center' | 'right';
}

function updatePreview(): void {
  const fontSize   = Number(subFontSize.value);
  const fontFamily = subFontFamily.value;
  const color      = subColor.value;
  const bgColor    = subBgColor.value;
  const opacity    = Number(subBgOpacity.value) / 100;
  const position   = getPosition();
  const align      = getAlign();
  const offset     = Number(subOffset.value);

  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const bgRgba = `rgba(${r},${g},${b},${opacity})`;

  previewText.style.fontFamily  = fontFamily;
  previewText.style.fontSize    = `${Math.round(fontSize * 0.55)}px`;
  previewText.style.color       = color;
  previewText.style.background  = bgRgba;

  previewSubtitleWrap.style.flexDirection = 'column';
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

  fontSizeVal.textContent  = String(fontSize);
  bgOpacityVal.textContent = String(subBgOpacity.value);
  offsetVal.textContent    = String(offset);
}

async function loadSettings(): Promise<void> {
  const keys = Object.values(STORAGE_KEYS);
  const result = await chrome.storage.local.get(keys);

  apiKeyInput.value  = (result[STORAGE_KEYS.API_KEY]  as string) || '';
  languageSel.value  = (result[STORAGE_KEYS.LANGUAGE]  as string) || DEFAULT_LANGUAGE;

  subFontSize.value   = String(result[STORAGE_KEYS.SUBTITLE_FONT_SIZE]   ?? SUBTITLE_DEFAULTS.fontSize);
  subFontFamily.value = String(result[STORAGE_KEYS.SUBTITLE_FONT_FAMILY] ?? SUBTITLE_DEFAULTS.fontFamily);
  subColor.value      = String(result[STORAGE_KEYS.SUBTITLE_COLOR]       ?? SUBTITLE_DEFAULTS.color);
  subBgColor.value    = String(result[STORAGE_KEYS.SUBTITLE_BG_COLOR]    ?? SUBTITLE_DEFAULTS.bgColor);
  subBgOpacity.value  = String(result[STORAGE_KEYS.SUBTITLE_BG_OPACITY]  ?? SUBTITLE_DEFAULTS.bgOpacity);
  subOffset.value     = String(result[STORAGE_KEYS.SUBTITLE_OFFSET]      ?? SUBTITLE_DEFAULTS.offset);

  const savedPos   = (result[STORAGE_KEYS.SUBTITLE_POSITION] as string) ?? SUBTITLE_DEFAULTS.position;
  const savedAlign = (result[STORAGE_KEYS.SUBTITLE_ALIGN]    as string) ?? SUBTITLE_DEFAULTS.align;

  const posEl = document.querySelector<HTMLInputElement>(`input[name="subPosition"][value="${savedPos}"]`);
  if (posEl) posEl.checked = true;

  const alignEl = document.querySelector<HTMLInputElement>(`input[name="subAlign"][value="${savedAlign}"]`);
  if (alignEl) alignEl.checked = true;

  updatePreview();
}

async function saveSettings(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.API_KEY]:              apiKeyInput.value.trim(),
    [STORAGE_KEYS.LANGUAGE]:             languageSel.value,
    [STORAGE_KEYS.SUBTITLE_FONT_SIZE]:   Number(subFontSize.value),
    [STORAGE_KEYS.SUBTITLE_FONT_FAMILY]: subFontFamily.value,
    [STORAGE_KEYS.SUBTITLE_COLOR]:       subColor.value,
    [STORAGE_KEYS.SUBTITLE_BG_COLOR]:    subBgColor.value,
    [STORAGE_KEYS.SUBTITLE_BG_OPACITY]:  Number(subBgOpacity.value),
    [STORAGE_KEYS.SUBTITLE_POSITION]:    getPosition(),
    [STORAGE_KEYS.SUBTITLE_OFFSET]:      Number(subOffset.value),
    [STORAGE_KEYS.SUBTITLE_ALIGN]:       getAlign(),
  });
  showToast();
}

function showToast(): void {
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

showKeyBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

const liveInputs = [subFontSize, subFontFamily, subColor, subBgColor, subBgOpacity, subOffset];
liveInputs.forEach(el => el.addEventListener('input', updatePreview));

document.querySelectorAll<HTMLInputElement>('input[name="subPosition"], input[name="subAlign"]')
  .forEach(el => el.addEventListener('change', updatePreview));

saveBtn.addEventListener('click', saveSettings);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveSettings();
  }
});

loadSettings();
