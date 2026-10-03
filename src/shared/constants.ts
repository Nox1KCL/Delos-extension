export const BLACKLISTED_HOSTS: readonly string[] = [
  'open.spotify.com',
  'spotify.com',
  'music.apple.com',
  'soundcloud.com',
  'music.youtube.com',
  'www.deezer.com',
  'deezer.com',
  'tidal.com',
  'tiktok.com',
  'www.tiktok.com',
] as const;

export const BLACKLISTED_PATH_PREFIXES: readonly string[] = [
  '/shorts/',
  '/reels/',
] as const;

export const VIDEO_CONSTRAINTS = {
  MIN_DURATION_SEC: 1,
  MIN_WIDTH_PX:     100,
  MIN_HEIGHT_PX:    60,
} as const;

export const STORAGE_KEYS = {
  API_KEY:              'deepgramApiKey',
  LANGUAGE:             'language',
  TARGET_LANGUAGE:      'targetLanguage',
  UI_LANGUAGE:          'ui_language',
  THEME:                'ui_theme',
  SUBTITLE_FONT_SIZE:   'sub_fontSize',
  SUBTITLE_FONT_FAMILY: 'sub_fontFamily',
  SUBTITLE_COLOR:       'sub_color',
  SUBTITLE_BG_COLOR:    'sub_bgColor',
  SUBTITLE_BG_OPACITY:  'sub_bgOpacity',
  SUBTITLE_POSITION:    'sub_position',
  SUBTITLE_OFFSET:      'sub_offset',
  SUBTITLE_ALIGN:       'sub_align',
} as const;

export const SUBTITLE_DEFAULTS = {
  fontSize:   20,
  fontFamily: 'Inter',
  color:      '#ffffff',
  bgColor:    '#141416',
  bgOpacity:  75,
  position:   'bottom' as 'top' | 'bottom',
  offset:     14,
  align:      'center' as 'left' | 'center' | 'right',
} as const;

export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_TARGET_LANGUAGE = 'uk';
export const DEFAULT_UI_LANGUAGE = 'en' as 'en' | 'uk';
export const DEFAULT_THEME = 'dark' as 'dark' | 'light';

export const BACKEND_WS_URL = 'ws://localhost:8080/delos/api/v1/audio/dg';
export const BACKEND_TRANSLATE_URL = 'http://localhost:8080/delos/api/v1/translate';
export const BACKEND_CACHE_URL = 'http://localhost:8080/delos/api/v1/audio/cache';

export const VAD = {
  RMS_THRESHOLD:         0.0015,
  HANGOVER_MS:           1500,
  SILENCE_DISCONNECT_MS: 30000,
} as const;

export const MSG = {
  GET_STATUS:      'GET_STATUS',
  TOGGLE:          'TOGGLE',
  OPEN_OPTIONS:    'OPEN_OPTIONS',
  STATE_CHANGED:   'DELOS_STATE_CHANGED',
  START_CAPTURE:   'OFFSCREEN_START_CAPTURE',
  STOP_CAPTURE:    'OFFSCREEN_STOP_CAPTURE',
  CAPTURE_STOPPED: 'OFFSCREEN_CAPTURE_STOPPED',
  GET_VIDEO_INFO:  'GET_VIDEO_INFO',
  VIDEO_TIME_SYNC:       'DELOS_VIDEO_TIME_SYNC',
  SUBTITLE:              'DELOS_SUBTITLE',
  SET_WINDOW_FULLSCREEN: 'DELOS_SET_WINDOW_FULLSCREEN',
  TRANSLATE_WORD:        'DELOS_TRANSLATE_WORD',
  LOAD_CACHED_TIMELINE:  'DELOS_LOAD_CACHED_TIMELINE',
} as const;
