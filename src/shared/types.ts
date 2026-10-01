export interface GetStatusMsg {
  type: 'GET_STATUS';
}

export interface ToggleMsg {
  type: 'TOGGLE';
  tabId: number;
}

export interface OpenOptionsMsg {
  type: 'OPEN_OPTIONS';
}

export interface CaptureStoppedMsg {
  type: 'OFFSCREEN_CAPTURE_STOPPED';
  tabId: number;
}

export interface SubtitleMsg {
  type: 'DELOS_SUBTITLE';
  tabId: number;
  text: string;
  startSec: number;
  endSec: number;
  isFinal: boolean;
}

export interface VideoTimeSyncMsg {
  type: 'DELOS_VIDEO_TIME_SYNC';
  target?: 'offscreen';
  currentTime: number;
  paused: boolean;
  playbackRate: number;
}

export type ToBackgroundMsg =
  | GetStatusMsg
  | ToggleMsg
  | OpenOptionsMsg
  | CaptureStoppedMsg
  | SubtitleMsg
  | VideoTimeSyncMsg;

export interface StartCaptureMsg {
  type: 'OFFSCREEN_START_CAPTURE';
  target: 'offscreen';
  streamId: string;
  tabId: number;
  apiKey: string;
  language: string;
  videoUrl: string;
  duration: number;
  baseTime: number;
  backendWsUrl: string;
}

export interface StopCaptureMsg {
  type: 'OFFSCREEN_STOP_CAPTURE';
  target: 'offscreen';
}

export type ToOffscreenMsg = StartCaptureMsg | StopCaptureMsg | VideoTimeSyncMsg;

export interface StateChangedMsg {
  type: 'DELOS_STATE_CHANGED';
  active: boolean;
}

export interface GetVideoInfoMsg {
  type: 'GET_VIDEO_INFO';
}

export interface VideoInfoResponse {
  url: string;
  duration: number;
  currentTime: number;
}

export interface StatusResponse {
  active: boolean;
  blocked: boolean;
  hasApiKey: boolean;
  language: string;
  targetLanguage: string;
  tabId: number;
}

export interface ToggleResponse {
  success: boolean;
  active?: boolean;
  reason?: 'blocked' | 'no_api_key' | 'capture_failed' | 'no_video';
}
