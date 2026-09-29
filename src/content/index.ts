import type { StateChangedMsg } from '../shared/types';
import { MSG } from '../shared/constants';

/**
 * Content script — Task 1 stub.
 *
 * Listens for state-change messages from the background service worker.
 * Full subtitle overlay, WebSocket streaming, and word-click logic
 * will be implemented in Tasks 4–6.
 */

chrome.runtime.onMessage.addListener((message: StateChangedMsg) => {
  if (message.type !== MSG.STATE_CHANGED) return;

  if (message.active) {
    console.log('[Delos] Activated on', window.location.hostname);
    // TODO Task 4: open WebSocket, render subtitle overlay
  } else {
    console.log('[Delos] Deactivated');
    // TODO Task 4: close WebSocket, remove overlay
  }
});
