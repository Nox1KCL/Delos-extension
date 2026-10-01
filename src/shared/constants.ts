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
  MIN_DURATION_SEC: 60,
  MIN_WIDTH_PX:     200,
  MIN_HEIGHT_PX:    120,
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
  offset:     8,
  align:      'center' as 'left' | 'center' | 'right',
} as const;

export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_TARGET_LANGUAGE = 'uk';
export const DEFAULT_UI_LANGUAGE = 'en' as 'en' | 'uk';
export const DEFAULT_THEME = 'dark' as 'dark' | 'light';

export const BACKEND_WS_URL = 'ws://localhost:8080/delos/api/v1/audio/dg';

export const VAD = {
  RMS_THRESHOLD:         0.008,
  HANGOVER_MS:           800,
  SILENCE_DISCONNECT_MS: 4000,
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
  VIDEO_TIME_SYNC: 'DELOS_VIDEO_TIME_SYNC',
  SUBTITLE:        'DELOS_SUBTITLE',
} as const;
