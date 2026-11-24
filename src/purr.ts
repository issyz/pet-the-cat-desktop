// Synthesised purr: band-limited noise and a low rumble, both pulsed at ~25 Hz,
// alternating between a softer inhale and a stronger exhale.
export class Purr {
  private ctx?: AudioContext;
  private master?: GainNode;
  private pulse?: OscillatorNode;
  private breath?: GainNode;
  private timer?: number;
  private exhale = true;
  private enabled = false;
  private intensity = 0;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.ensure();
    if (this.ctx) {
      if (on) void this.ctx.resume();
      this.apply();
    }
  }

  setIntensity(value: number) {
    if (Math.abs(value - this.intensity) < 0.01) return;
    this.intensity = value;
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.master) return;
    const target = this.enabled ? this.intensity * 0.55 : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  private ensure() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 140;
    band.Q.value = 0.8;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 700;

    const rumble = ctx.createOscillator();
    rumble.type = "triangle";
    rumble.frequency.value = 52;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.35;

    const am = ctx.createGain();
    am.gain.value = 0;
    const pulse = ctx.createOscillator();
    pulse.frequency.value = 26;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.pow(Math.max(0, x), 2.2);
    }
    shaper.curve = curve;
    pulse.connect(shaper).connect(am.gain);

    const breath = ctx.createGain();
    breath.gain.value = 1;
    const master = ctx.createGain();
    master.gain.value = 0;

    noise.connect(band).connect(low).connect(am);
    rumble.connect(rumbleGain).connect(am);
    am.connect(breath).connect(master).connect(ctx.destination);
    noise.start();
    rumble.start();
    pulse.start();

    this.master = master;
    this.pulse = pulse;
    this.breath = breath;
    this.timer = window.setInterval(() => this.cycle(), 1300);
    this.cycle();
  }

  private cycle() {
    if (!this.ctx || !this.pulse || !this.breath) return;
    const t = this.ctx.currentTime;
    this.exhale = !this.exhale;
    this.pulse.frequency.setTargetAtTime(this.exhale ? 27 : 23, t, 0.15);
    this.breath.gain.setTargetAtTime(this.exhale ? 1 : 0.55, t, 0.2);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
  }
}
