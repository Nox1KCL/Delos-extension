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

export type ToBackgroundMsg =
  | GetStatusMsg
  | ToggleMsg
  | OpenOptionsMsg
  | CaptureStoppedMsg;

export interface StartCaptureMsg {
  type: 'OFFSCREEN_START_CAPTURE';
  target: 'offscreen';
  streamId: string;
  tabId: number;
}

export interface StopCaptureMsg {
  type: 'OFFSCREEN_STOP_CAPTURE';
  target: 'offscreen';
}

export type ToOffscreenMsg = StartCaptureMsg | StopCaptureMsg;

export interface StateChangedMsg {
  type: 'DELOS_STATE_CHANGED';
  active: boolean;
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
  reason?: 'blocked' | 'no_api_key' | 'capture_failed';
}
