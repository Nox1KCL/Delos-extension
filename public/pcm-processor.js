class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / 16000;
    this._counter = 0;
    this._chunkSize = 3200;
    this._buffer = new Float32Array(this._chunkSize);
    this._offset = 0;
    this._rmsSum = 0;
    this._rmsSamples = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0].length) return true;

    const numCh = input.length;
    const len = input[0].length;

    for (let i = 0; i < len; i++) {
      this._counter++;
      if (this._counter >= this._ratio) {
        this._counter -= this._ratio;

        let sample = 0;
        for (let ch = 0; ch < numCh; ch++) {
          sample += input[ch][i];
        }
        sample /= numCh;

        this._buffer[this._offset] = sample;
        this._rmsSum += sample * sample;
        this._rmsSamples++;
        this._offset++;

        if (this._offset >= this._chunkSize) {
          const rms = Math.sqrt(this._rmsSum / this._rmsSamples);
          const int16 = new Int16Array(this._chunkSize);
          for (let j = 0; j < this._chunkSize; j++) {
            const s = Math.max(-1, Math.min(1, this._buffer[j]));
            int16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          this.port.postMessage({ pcm: int16.buffer, rms }, [int16.buffer]);
          this._offset = 0;
          this._rmsSum = 0;
          this._rmsSamples = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
