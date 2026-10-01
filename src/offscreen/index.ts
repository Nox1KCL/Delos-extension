import { MSG } from '../shared/constants';
import type { ToOffscreenMsg } from '../shared/types';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let activeTabId: number | null = null;

async function startCapture(streamId: string, tabId: number): Promise<void> {
  await stopCapture(false);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as unknown as MediaTrackConstraints,
    video: false,
  });

  mediaStream = stream;
  activeTabId = tabId;

  audioContext = new AudioContext();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(audioContext.destination);

  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => {
      void stopCapture(true);
    });
  }
}

async function stopCapture(notifyBackground: boolean): Promise<void> {
  const stoppedTabId = activeTabId;
  activeTabId = null;

  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch {}
    sourceNode = null;
  }

  if (audioContext) {
    try {
      await audioContext.close();
    } catch {}
    audioContext = null;
  }

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }

  if (notifyBackground && stoppedTabId !== null) {
    chrome.runtime
      .sendMessage({
        type: MSG.CAPTURE_STOPPED,
        tabId: stoppedTabId,
      })
      .catch(() => {});
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: ToOffscreenMsg,
    _sender,
    sendResponse: (res: { success: boolean; error?: string }) => void
  ) => {
    if (!message || message.target !== 'offscreen') {
      return false;
    }

    if (message.type === MSG.START_CAPTURE) {
      startCapture(message.streamId, message.tabId)
        .then(() => sendResponse({ success: true }))
        .catch((err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('[Delos Offscreen] Capture failed:', errorMsg);
          sendResponse({ success: false, error: errorMsg });
        });
      return true;
    }

    if (message.type === MSG.STOP_CAPTURE) {
      stopCapture(false)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    return false;
  }
);
