// ─── Messages: Popup / Options → Background ───────────────────────────────────

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

export type ToBackgroundMsg = GetStatusMsg | ToggleMsg | OpenOptionsMsg;

// ─── Messages: Background → Content Script ────────────────────────────────────

export interface StateChangedMsg {
  type: 'DELOS_STATE_CHANGED';
  active: boolean;
}

// ─── Response types ───────────────────────────────────────────────────────────

/** Returned by GET_STATUS */
export interface StatusResponse {
  /** Is Delos currently active for this tab? */
  active: boolean;
  /** Is this tab on the blacklist? */
  blocked: boolean;
  /** Has the user saved a Deepgram API key? */
  hasApiKey: boolean;
  /** Currently selected subtitle language code, e.g. "en" */
  language: string;
  /** Current tab id (for the popup to send a TOGGLE) */
  tabId: number;
}

/** Returned by TOGGLE */
export interface ToggleResponse {
  success: boolean;
  active?: boolean;
  reason?: 'blocked' | 'no_api_key';
}
