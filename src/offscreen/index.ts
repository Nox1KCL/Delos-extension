import { BACKEND_WS_URL, MSG, VAD } from '../shared/constants';
import type { ToOffscreenMsg, VideoTimeSyncMsg } from '../shared/types';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let pcmNode: AudioWorkletNode | null = null;
let activeTabId: number | null = null;

let ws: WebSocket | null = null;
let wsReady = false;
let isSpeaking = false;
let hangoverTimer: ReturnType<typeof setTimeout> | null = null;
let silenceDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingChunks: ArrayBuffer[] = [];

let lastKnownVideoTime = 0;
let lastSyncWallClock = 0;
let isVideoPaused = false;
let videoPlaybackRate = 1;

const SILENT_CHUNK = new ArrayBuffer(6400);

interface CaptureConfig {
  apiKey: string;
  language: string;
  videoUrl: string;
  duration: number;
  backendWsUrl: string;
}

let config: CaptureConfig | null = null;

function getCurrentVideoTime(): number {
  if (isVideoPaused || lastSyncWallClock === 0) {
    return lastKnownVideoTime;
  }
  const elapsedSec = (Date.now() - lastSyncWallClock) / 1000;
  return lastKnownVideoTime + elapsedSec * videoPlaybackRate;
}

function openWs(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  wsReady = false;
  pendingChunks = [];

  const url = config?.backendWsUrl ?? BACKEND_WS_URL;
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    const handshake = JSON.stringify({
      api_key: config!.apiKey,
      base_time: getCurrentVideoTime(),
      options: {
        model: 'nova-3',
        language: config!.language,
      },
      video_url: config!.videoUrl,
      duration: config!.duration,
    });
    ws!.send(handshake);
    wsReady = true;

    for (const chunk of pendingChunks) {
      ws!.send(chunk);
    }
    pendingChunks = [];
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string);
      if (data.text && activeTabId !== null) {
        chrome.runtime.sendMessage({
          type: MSG.SUBTITLE,
          tabId: activeTabId,
          text: data.text,
          startSec: data.start_sec ?? 0,
          endSec: data.end_sec ?? 0,
          isFinal: data.is_final ?? false,
        }).catch(() => {});
      }
    } catch {}
  };

  ws.onerror = () => {
    wsReady = false;
  };

  ws.onclose = () => {
    wsReady = false;
  };
}

function closeWs(): void {
  wsReady = false;
  pendingChunks = [];
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
}

function clearAllTimers(): void {
  if (hangoverTimer !== null) {
    clearTimeout(hangoverTimer);
    hangoverTimer = null;
  }
  if (silenceDisconnectTimer !== null) {
    clearTimeout(silenceDisconnectTimer);
    silenceDisconnectTimer = null;
  }
}

function handlePcmChunk(pcm: ArrayBuffer, rms: number): void {
  const speechDetected = rms > VAD.RMS_THRESHOLD;

  if (speechDetected) {
    clearAllTimers();

    if (!isSpeaking) {
      isSpeaking = true;
    }

    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      openWs();
    }

    if (wsReady && ws?.readyState === WebSocket.OPEN) {
      ws.send(pcm);
    } else {
      if (pendingChunks.length > 25) {
        pendingChunks.shift();
      }
      pendingChunks.push(pcm);
    }
  } else if (isSpeaking) {
    if (hangoverTimer === null) {
      hangoverTimer = setTimeout(() => {
        isSpeaking = false;
        hangoverTimer = null;

        if (silenceDisconnectTimer === null) {
          silenceDisconnectTimer = setTimeout(() => {
            silenceDisconnectTimer = null;
            closeWs();
          }, VAD.SILENCE_DISCONNECT_MS);
        }
      }, VAD.HANGOVER_MS);
    }

    if (wsReady && ws?.readyState === WebSocket.OPEN) {
      ws.send(pcm);
    }
  } else if (ws && ws.readyState === WebSocket.OPEN && wsReady) {
    ws.send(SILENT_CHUNK);
  }
}

async function startCapture(streamId: string, tabId: number, baseTime: number): Promise<void> {
  await stopCapture(false);

  activeTabId = tabId;
  lastKnownVideoTime = baseTime;
  lastSyncWallClock = Date.now();
  isVideoPaused = false;
  videoPlaybackRate = 1;

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

  audioContext = new AudioContext();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(audioContext.destination);

  await audioContext.audioWorklet.addModule(
    chrome.runtime.getURL('pcm-processor.js')
  );
  pcmNode = new AudioWorkletNode(audioContext, 'pcm-processor');
  sourceNode.connect(pcmNode);

  pcmNode.port.onmessage = (event: MessageEvent) => {
    const { pcm, rms } = event.data as { pcm: ArrayBuffer; rms: number };
    handlePcmChunk(pcm, rms);
  };

  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => {
      void stopCapture(true);
    });
  }
}

async function stopCapture(notifyBackground: boolean): Promise<void> {
  const stoppedTabId = activeTabId;
  activeTabId = null;

  isSpeaking = false;
  clearAllTimers();
  closeWs();

  if (pcmNode) {
    try { pcmNode.disconnect(); } catch {}
    pcmNode = null;
  }

  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }

  if (audioContext) {
    try { await audioContext.close(); } catch {}
    audioContext = null;
  }

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }

  config = null;
  lastKnownVideoTime = 0;
  lastSyncWallClock = 0;

  if (notifyBackground && stoppedTabId !== null) {
    chrome.runtime.sendMessage({
      type: MSG.CAPTURE_STOPPED,
      tabId: stoppedTabId,
    }).catch(() => {});
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
      config = {
        apiKey: message.apiKey,
        language: message.language,
        videoUrl: message.videoUrl,
        duration: message.duration,
        backendWsUrl: message.backendWsUrl || BACKEND_WS_URL,
      };

      startCapture(message.streamId, message.tabId, message.baseTime)
        .then(() => sendResponse({ success: true }))
        .catch((err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
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

    if (message.type === MSG.VIDEO_TIME_SYNC) {
      const syncMsg = message as VideoTimeSyncMsg;
      const prevTime = getCurrentVideoTime();
      lastKnownVideoTime = syncMsg.currentTime;
      lastSyncWallClock = Date.now();
      isVideoPaused = syncMsg.paused;
      videoPlaybackRate = syncMsg.playbackRate || 1;

      const jumped = Math.abs(syncMsg.currentTime - prevTime) > 2.0;
      if ((syncMsg.paused || jumped) && ws) {
        closeWs();
      }
      return false;
    }

    return false;
  }
);
