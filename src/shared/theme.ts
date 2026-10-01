import { DEFAULT_THEME, STORAGE_KEYS } from './constants';

export type ThemeMode = 'dark' | 'light';

let currentTheme: ThemeMode = DEFAULT_THEME;
const listeners = new Set<(theme: ThemeMode) => void>();

export function getTheme(): ThemeMode {
  return currentTheme;
}

export function applyTheme(theme: ThemeMode): void {
  currentTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = currentTheme;
  listeners.forEach((fn) => fn(currentTheme));
}

export function onThemeChange(callback: (theme: ThemeMode) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.THEME]) {
      const next = (changes[STORAGE_KEYS.THEME].newValue as ThemeMode) || DEFAULT_THEME;
      applyTheme(next);
    }
  });
}
