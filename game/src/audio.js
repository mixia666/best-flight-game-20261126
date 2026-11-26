// Sound, synthesized live with WebAudio: no audio files to ship.
// A low engine drone follows the throttle, wind rush follows speed, and short
// blips mark rings, landings and crashes. Silent until the first gesture.
export class Sound {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.muted = false;
  }

  /** Call from a user gesture; browsers refuse audio before one. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      this.ctx = new Ctx();
      // Engine: two detuned saws through a low-pass, quiet by default.
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 52;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 78;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.4;
      this.engineOsc.connect(filter);
      osc2.connect(gain2);
      gain2.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      osc2.start();
      // Wind: looped white noise through a band-pass.
      const len = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      noise.connect(band);
      band.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      noise.start();
    } catch {
      this.ctx = null;
    }
  }

  /** Continuous levels, called every frame while flying. */
  update(throttle, speed, flying) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const engineLevel = flying ? 0.03 + throttle * 0.05 : 0.012;
    this.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(46 + throttle * 66 + speed * 0.12, t, 0.1);
    this.windGain.gain.setTargetAtTime(flying ? Math.min(0.05, speed * 0.00022) : 0, t, 0.2);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx && this.engineGain) this.engineGain.gain.value = 0;
    if (this.ctx && this.windGain) this.windGain.gain.value = 0;
  }

  blip(freq, dur, type = 'sine', vol = 0.12, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  ring() {
    this.blip(880, 0.16);
    this.blip(1318, 0.28, 'sine', 0.1, 0.09);
  }

  miss() {
    this.blip(220, 0.25, 'triangle', 0.09);
  }

  takeoff() {
    this.blip(523, 0.12);
    this.blip(659, 0.12, 'sine', 0.1, 0.1);
    this.blip(784, 0.22, 'sine', 0.1, 0.2);
  }

  landed() {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.3, 'sine', 0.11, i * 0.12));
  }

  crash() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.3;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
    this.blip(110, 0.5, 'sine', 0.16);
  }
}
