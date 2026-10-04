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

const SILENT_CHUNK = new ArrayBuffer(3200);

interface CaptureConfig {
  apiKey: string;
  language: string;
  videoUrl: string;
  duration: number;
  backendWsUrl: string;
  cachedUpToSec?: number;
}

let config: CaptureConfig | null = null;

function getCurrentVideoTime(): number {
  if (isVideoPaused || lastSyncWallClock === 0) {
    return lastKnownVideoTime;
  }
  const elapsedSec = (Date.now() - lastSyncWallClock) / 1000;
  return lastKnownVideoTime + elapsedSec * videoPlaybackRate;
}

function isWithinCachedTerritory(): boolean {
  if (!config?.cachedUpToSec || config.cachedUpToSec <= 0) return false;
  return getCurrentVideoTime() < config.cachedUpToSec - 1.0;
}

function openWs(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  if (isWithinCachedTerritory()) {
    console.log(
      `[Delos Offscreen] Current playback time (${getCurrentVideoTime().toFixed(1)}s) is within cached territory (up to ${config?.cachedUpToSec?.toFixed(1)}s). Deferring WebSocket connection.`
    );
    return;
  }

  wsReady = false;
  pendingChunks = [];

  const url = config?.backendWsUrl ?? BACKEND_WS_URL;
  console.log('[Delos Offscreen] Opening WebSocket to:', url);
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    try {
      console.log('[Delos Offscreen] WebSocket connected! Sending handshake...');
      if (!config) {
        console.error('[Delos Offscreen] Cannot send handshake: config is null');
        return;
      }
      const handshake = JSON.stringify({
        api_key: config.apiKey,
        base_time: getCurrentVideoTime(),
        options: {
          model: 'nova-2',
          language: config.language,
        },
        video_url: config.videoUrl,
        duration: config.duration,
      });
      ws!.send(handshake);
      wsReady = true;
      console.log('[Delos Offscreen] Handshake sent:', {
        model: 'nova-2',
        language: config.language,
        baseTime: getCurrentVideoTime(),
      });

      for (const chunk of pendingChunks) {
        ws!.send(chunk);
      }
      pendingChunks = [];
    } catch (err) {
      console.error('[Delos Offscreen] Error in ws.onopen:', err);
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string);
      console.log('[Delos Offscreen] Received message from backend:', data);
      if (data.text && activeTabId !== null) {
        chrome.runtime.sendMessage({
          type: MSG.SUBTITLE,
          tabId: activeTabId,
          text: data.text,
          startSec: data.start_sec ?? 0,
          endSec: data.end_sec ?? 0,
          isFinal: data.is_final ?? false,
        }).catch((err) => {
          console.warn('[Delos Offscreen] Failed to forward subtitle to tab:', err);
        });
      }
    } catch (err) {
      console.error('[Delos Offscreen] Failed to parse message JSON:', err, event.data);
    }
  };

  ws.onerror = (e) => {
    console.error('[Delos Offscreen] WebSocket error:', e);
    wsReady = false;
  };

  ws.onclose = (e) => {
    console.warn('[Delos Offscreen] WebSocket closed:', e.code, e.reason);
    wsReady = false;
    ws = null;
  };
}

function closeWs(): void {
  wsReady = false;
  pendingChunks = [];
  isSpeaking = false;
  clearAllTimers();
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
  if (isVideoPaused || isWithinCachedTerritory()) {
    if (isWithinCachedTerritory() && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      closeWs();
    }
    return;
  }

  const speechDetected = rms > VAD.RMS_THRESHOLD;

  if (speechDetected) {
    clearAllTimers();

    if (!isSpeaking) {
      isSpeaking = true;
      console.log('[Delos Offscreen] Speech started (RMS:', rms.toFixed(4), ')');
    }

    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      openWs();
    }
  } else if (isSpeaking) {
    if (hangoverTimer === null) {
      hangoverTimer = setTimeout(() => {
        isSpeaking = false;
        hangoverTimer = null;

        if (silenceDisconnectTimer === null) {
          silenceDisconnectTimer = setTimeout(() => {
            silenceDisconnectTimer = null;
            console.log('[Delos Offscreen] Inactive for', VAD.SILENCE_DISCONNECT_MS, 'ms, closing socket');
            closeWs();
          }, VAD.SILENCE_DISCONNECT_MS);
        }
      }, VAD.HANGOVER_MS);
    }
  }

  // Always send real audio PCM while connected so Deepgram hears all speech nuances and soft words
  if (wsReady && ws?.readyState === WebSocket.OPEN) {
    ws.send(pcm);
  } else if (speechDetected || isSpeaking) {
    if (pendingChunks.length > 25) {
      pendingChunks.shift();
    }
    pendingChunks.push(pcm);
  }
}

async function startCapture(
  streamId: string,
  tabId: number,
  baseTime: number,
  newConfig: CaptureConfig
): Promise<void> {
  await stopCapture(false);

  config = newConfig;
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

  // Pre-connect WebSocket if outside cached range
  if (!isWithinCachedTerritory()) {
    openWs();
  } else {
    console.log(
      `[Delos Offscreen] Video playback is currently at ${baseTime.toFixed(1)}s, within cached range (up to ${newConfig.cachedUpToSec?.toFixed(1)}s). Deferring WebSocket connection until cache boundary.`
    );
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
      const newConfig: CaptureConfig = {
        apiKey: message.apiKey,
        language: message.language,
        videoUrl: message.videoUrl,
        duration: message.duration,
        backendWsUrl: message.backendWsUrl || BACKEND_WS_URL,
        cachedUpToSec: message.cachedUpToSec || 0,
      };

      startCapture(message.streamId, message.tabId, message.baseTime, newConfig)
        .then(() => sendResponse({ success: true }))
        .catch((err: unknown) => {
          console.error('[Delos Offscreen] startCapture failed:', err);
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
      if (jumped) {
        console.log(
          `[Delos Offscreen] Video jump detected (from ${prevTime.toFixed(1)}s to ${syncMsg.currentTime.toFixed(1)}s), resetting socket for new base time`
        );
        closeWs();
      }

      // If capture is active, video is playing, socket is not open, and we are past the cached territory: open it!
      if (config && !syncMsg.paused && !isWithinCachedTerritory() && (!ws || ws.readyState === WebSocket.CLOSED)) {
        openWs();
      }
      return false;
    }

    return false;
  }
);
