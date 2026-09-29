/**
 * Offscreen document — Task 2/3 stub.
 *
 * Future responsibilities:
 *  - Receive MediaStream from background (via chrome.tabCapture)
 *  - Run loopback AudioContext so user still hears video audio
 *  - AudioWorkletNode: resample Float32 → 16 kHz mono Int16 PCM
 *  - Silero VAD (WASM): only forward chunks that contain speech
 *  - Forward PCM ArrayBuffer chunks to content script
 *
 * Will be implemented in Task 2 (capture) and Task 3 (pipeline + VAD).
 */

console.log('[Delos Offscreen] document ready — awaiting Task 2 implementation');
