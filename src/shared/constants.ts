export const BLACKLISTED_HOSTS: readonly string[] = [
  'open.spotify.com',
  'spotify.com',
  'music.apple.com',
  'soundcloud.com',
  'music.youtube.com',
  'www.deezer.com',
  'deezer.com',
  'tidal.com',
] as const;

export const STORAGE_KEYS = {
  API_KEY:              'deepgramApiKey',
  LANGUAGE:             'language',
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
  bgColor:    '#000000',
  bgOpacity:  70,
  position:   'bottom' as 'top' | 'bottom',
  offset:     8,
  align:      'center' as 'left' | 'center' | 'right',
} as const;

export const DEFAULT_LANGUAGE = 'en';

export const MSG = {
  GET_STATUS:    'GET_STATUS',
  TOGGLE:        'TOGGLE',
  OPEN_OPTIONS:  'OPEN_OPTIONS',
  STATE_CHANGED: 'DELOS_STATE_CHANGED',
} as const;
