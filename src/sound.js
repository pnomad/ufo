// Tiny WebAudio synth for machine sounds (no audio files needed).
export class Sound {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.motor = null;
  }

  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);
    // continuous motor hum, gated by the claw state
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 70;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    osc.connect(lp).connect(g).connect(this.master);
    osc.start();
    this.motor = { osc, g };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  tone(freq, dur, { type = 'square', vol = 0.25, at = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  coin() {
    this.unlock();
    this.tone(988, 0.08);
    this.tone(1319, 0.25, { at: 0.08 });
  }

  start() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.1, { at: i * 0.08, vol: 0.18 }));
  }

  state(s) {
    if (s === 'open' || s === 'drop') this.tone(300, 0.15, { type: 'triangle', slide: 200, vol: 0.2 });
    if (s === 'close') this.tone(500, 0.18, { type: 'triangle', slide: -250, vol: 0.2 });
  }

  win() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, 0.18, { at: i * 0.11, vol: 0.22 }));
  }

  update(sim) {
    if (!this.motor) return;
    const moving = ['moveX', 'moveZ', 'descend', 'rise', 'return'].includes(sim.state);
    const target = moving ? 0.12 : 0;
    const g = this.motor.g.gain;
    g.value += (target - g.value) * 0.2;
    this.motor.osc.frequency.value = sim.state === 'descend' || sim.state === 'rise' ? 55 : 75;
  }
}
