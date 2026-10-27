import { LAYERS, mixFor, type Layer, type Mix } from './moods';

// Generative background music with the Web Audio API: no audio files, just a slow chord loop
// that seven layers play over, each with its own fader (see moods.ts). Changing rooms only
// moves the faders, so one mood melts into the next instead of cutting to another track.

const BPM = 72;
const STEP = 60 / BPM / 2; // an eighth note, in seconds
const STEPS_PER_CHORD = 16; // two bars of 4/4
const CHORD_TIME = STEP * STEPS_PER_CHORD;
const LOOKAHEAD = 0.3; // how far ahead notes are scheduled, s
const TICK_MS = 100;
const CROSSFADE = 2.5; // time constant of a layer fading to its new level, s
const VOLUME = 0.55;

// D major, all four chords sharing most of their notes so the loop never lands anywhere.
// MIDI numbers: a bass note and five tones voiced around the middle of the keyboard.
const CHORDS = [
  { bass: 38, tones: [50, 54, 57, 61, 64] }, // Dmaj9
  { bass: 35, tones: [47, 50, 54, 57, 61] }, // Bm9
  { bass: 43, tones: [47, 50, 54, 57, 62] }, // Gmaj9
  { bass: 45, tones: [52, 57, 59, 61, 64] }, // A add9
];
type Chord = (typeof CHORDS)[number];

// Reverb and echo per layer: the sustained layers sit further back in the room.
const SENDS: Record<Layer, { reverb: number; echo?: boolean }> = {
  piano: { reverb: 0.35 },
  guitar: { reverb: 0.25 },
  pulse: { reverb: 0.1 },
  texture: { reverb: 0.5, echo: true },
  pad: { reverb: 0.6 },
  drone: { reverb: 0.4 },
  bell: { reverb: 0.7, echo: true },
};

const STORAGE_KEY = 'cuantoes:musica';

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export class Soundtrack {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private layers = {} as Record<Layer, { input: GainNode; busyUntil: number }>;
  private noise!: AudioBuffer;
  private plucks = new Map<number, AudioBuffer>();
  private mix: Mix = mixFor(1);
  private step = 0;
  private nextTime = 0;
  private suspendTimer = 0;
  private _muted = readMuted();

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx?.suspend();
      else if (!this._muted) void this.ctx?.resume();
    });
  }

  get muted() {
    return this._muted;
  }

  // Call from a user gesture (a click or a key): browsers only let audio start from one.
  play() {
    if (this._muted) return;
    const ctx = this.ctx ?? this.build();
    clearTimeout(this.suspendTimer);
    void ctx.resume();
    this.master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.8);
  }

  // Also a user gesture: unmuting starts the music if it hadn't started yet.
  toggleMuted() {
    this._muted = !this._muted;
    try {
      localStorage.setItem(STORAGE_KEY, this._muted ? 'off' : 'on');
    } catch {
      // private mode or blocked storage: the choice just won't be remembered
    }
    if (!this._muted) return this.play();
    const ctx = this.ctx;
    if (!ctx) return;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    this.suspendTimer = window.setTimeout(() => void ctx.suspend(), 1200); // stop using the CPU once it's quiet
  }

  setAmount(amount: number) {
    this.mix = mixFor(amount);
    if (this.ctx) this.applyMix(this.ctx.currentTime, CROSSFADE);
  }

  // ---------- Graph ----------

  private build(): AudioContext {
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = new GainNode(ctx, { gain: 0 });
    const compressor = new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 3, attack: 0.02, release: 0.3 });
    const bus = new GainNode(ctx);
    bus.connect(compressor).connect(this.master).connect(ctx.destination);

    const reverb = new ConvolverNode(ctx, { buffer: impulse(ctx, 3.5) });
    reverb.connect(bus);

    // A dotted-eighth echo, darker on every repeat.
    const echo = new DelayNode(ctx, { delayTime: STEP * 1.5 });
    const feedback = new GainNode(ctx, { gain: 0.35 });
    const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2500 });
    echo.connect(tone).connect(feedback).connect(echo);
    echo.connect(bus);
    echo.connect(reverb);

    for (const layer of LAYERS) {
      const input = new GainNode(ctx, { gain: 0 });
      input.connect(bus);
      input.connect(new GainNode(ctx, { gain: SENDS[layer].reverb })).connect(reverb);
      if (SENDS[layer].echo) input.connect(echo);
      this.layers[layer] = { input, busyUntil: 0 };
    }

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.applyMix(ctx.currentTime, 0.01);
    this.nextTime = ctx.currentTime + 0.1;
    window.setInterval(this.tick, TICK_MS);
    return ctx;
  }

  // A silent layer stops getting notes once its fade-out has died away.
  private applyMix(now: number, timeConstant: number) {
    for (const layer of LAYERS) {
      const level = this.mix[layer];
      this.layers[layer].input.gain.setTargetAtTime(level, now, timeConstant);
      this.layers[layer].busyUntil = level > 0.001 ? Infinity : now + timeConstant * 4;
    }
  }

  // ---------- Sequencer ----------

  private tick = () => {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    // A throttled timer can fall behind: skip the missed notes instead of playing them all at once.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += STEP;
    }
  };

  private playStep(step: number, t: number) {
    const chord = CHORDS[Math.floor(step / STEPS_PER_CHORD) % CHORDS.length];
    const s = step % STEPS_PER_CHORD;
    const on = (layer: Layer) => t < this.layers[layer].busyUntil;

    // Familiaridad: a fingerpicked guitar and a few piano notes floating over it.
    if (on('guitar')) {
      if (s === 0 || s === 8) this.guitar(chord.bass + 12, t, 0.9);
      else if ([3, 6, 11, 14].includes(s)) this.guitar(chord.tones[(s * 3) % 5], t, 0.6);
    }
    if (on('piano') && [0, 5, 10].includes(s) && (s === 0 || Math.random() < 0.7)) {
      this.piano(pick(chord.tones.slice(2)) + 12, t, s === 0 ? 0.35 : 0.25);
    }
    // Curiosidad: a soft eighth-note pulse and electronic blips that echo around.
    if (on('pulse')) this.pulse(chord, s, t);
    if (on('texture') && Math.random() < 0.3) this.blip(pick(chord.tones) + 24, t);
    // Asombro: wide sustained chords over a deep root.
    if (s === 0 && on('pad')) this.pad(chord, t);
    if (s === 0 && on('drone')) this.drone(chord.bass, t);
    // Reflexión: a single bell now and then, with plenty of silence around it.
    if (on('bell') && (s === 0 || s === 10)) this.bell(pick(chord.tones.slice(2)) + 12, t);
  }

  // ---------- Instruments ----------

  // A gain envelope into a layer: quick rise to `peak`, then an exponential fade over `decay` seconds.
  private envelope(layer: Layer, t: number, peak: number, attack: number, decay: number, pan = 0) {
    const ctx = this.ctx!;
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.setTargetAtTime(0, t + attack, decay / 5);
    if (pan) env.connect(new StereoPannerNode(ctx, { pan })).connect(this.layers[layer].input);
    else env.connect(this.layers[layer].input);
    return env;
  }

  private osc(type: OscillatorType, frequency: number, dest: AudioNode, t: number, end: number, detune = 0) {
    const osc = new OscillatorNode(this.ctx!, { type, frequency, detune });
    osc.connect(dest);
    osc.start(t);
    osc.stop(end);
    return osc;
  }

  private piano(midi: number, t: number, velocity: number) {
    const env = this.envelope('piano', t, velocity, 0.008, 2.8, (Math.random() - 0.5) * 0.4);
    const overtone = new GainNode(this.ctx!, { gain: 0.25 });
    overtone.connect(env);
    this.osc('sine', freq(midi), env, t, t + 3);
    this.osc('triangle', freq(midi) * 2, overtone, t, t + 3);
  }

  private guitar(midi: number, t: number, velocity: number) {
    const src = new AudioBufferSourceNode(this.ctx!, { buffer: this.pluck(midi) });
    const gain = new GainNode(this.ctx!, { gain: velocity * 0.7 });
    src.connect(gain).connect(this.layers.guitar.input);
    src.start(t);
  }

  // A plucked string (Karplus–Strong), rendered once per note. The pick is smoothed noise, so the
  // attack comes out round, closer to nylon than steel.
  private pluck(midi: number): AudioBuffer {
    const cached = this.plucks.get(midi);
    if (cached) return cached;
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.floor(rate * 2.5), rate);
    const out = buffer.getChannelData(0);
    const period = Math.max(2, Math.round(rate / freq(midi) - 0.5)); // the averaging adds half a sample
    const string = new Float32Array(period);
    let smooth = 0;
    for (let i = 0; i < period; i++) string[i] = smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4;
    const fadeFrom = out.length - rate * 0.2;
    for (let i = 0; i < out.length; i++) {
      const j = i % period;
      out[i] = string[j] * (i > fadeFrom ? (out.length - i) / (out.length - fadeFrom) : 1);
      string[j] = (string[j] + string[(j + 1) % period]) * 0.5 * 0.996;
    }
    this.plucks.set(midi, buffer);
    return buffer;
  }

  private pulse(chord: Chord, s: number, t: number) {
    const ctx = this.ctx!;
    // A filtered square on the root, every eighth, stronger on the beat.
    const env = this.envelope('pulse', t, s % 2 === 0 ? 0.22 : 0.13, 0.005, 0.25);
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 6, frequency: 1600 });
    filter.frequency.setTargetAtTime(250, t, 0.04);
    filter.connect(env);
    this.osc('square', freq(chord.bass + 12), filter, t, t + 0.4);
    // A light tick on the off-beats.
    if (s % 2 === 1) {
      const tick = this.envelope('pulse', t, 0.08, 0.002, 0.06, 0.3);
      const src = new AudioBufferSourceNode(ctx, { buffer: this.noise });
      src.connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 8000 })).connect(tick);
      src.start(t, Math.random() * 0.5, 0.1);
    }
    // A soft thump every half bar.
    if (s % 8 === 0) {
      const thump = this.envelope('pulse', t, 0.5, 0.004, 0.35);
      const osc = this.osc('sine', 110, thump, t, t + 0.5);
      osc.frequency.setTargetAtTime(45, t, 0.04);
    }
  }

  private blip(midi: number, t: number) {
    const env = this.envelope('texture', t, 0.12, 0.004, 0.4, (Math.random() - 0.5) * 1.4);
    this.osc(Math.random() < 0.5 ? 'sine' : 'triangle', freq(midi), env, t, t + 0.6);
  }

  // Each chord tone as two detuned saws, slowly opening and closing a filter, overlapping the next chord.
  private pad(chord: Chord, t: number) {
    const ctx = this.ctx!;
    const end = t + CHORD_TIME;
    chord.tones.forEach((midi, i) => {
      const env = new GainNode(ctx, { gain: 0 });
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.035, t + 2.5);
      env.gain.setTargetAtTime(0, end, 1.2);
      const filter = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 0.5 });
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.linearRampToValueAtTime(1400, t + CHORD_TIME / 2);
      filter.frequency.linearRampToValueAtTime(600, end + 3);
      const pan = new StereoPannerNode(ctx, { pan: (i / (chord.tones.length - 1) - 0.5) * 1.2 });
      filter.connect(env).connect(pan).connect(this.layers.pad.input);
      this.osc('sawtooth', freq(midi), filter, t, end + 6, -8);
      this.osc('sawtooth', freq(midi), filter, t, end + 6, 8);
    });
  }

  private drone(bass: number, t: number) {
    const ctx = this.ctx!;
    const end = t + CHORD_TIME;
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.2, t + 3);
    env.gain.setTargetAtTime(0, end, 1.5);
    env.connect(this.layers.drone.input);
    const octave = new GainNode(ctx, { gain: 0.3 });
    octave.connect(env);
    this.osc('sine', freq(bass), env, t, end + 8);
    this.osc('triangle', freq(bass + 12), octave, t, end + 8);
  }

  // FM bell: a sine modulated at an inharmonic ratio, the metallic edge fading faster than the tone.
  private bell(midi: number, t: number) {
    const ctx = this.ctx!;
    const f = freq(midi);
    const env = this.envelope('bell', t, 0.22, 0.005, 6, (Math.random() - 0.5) * 0.6);
    const carrier = this.osc('sine', f, env, t, t + 7);
    const depth = new GainNode(ctx, { gain: f * 1.2 });
    depth.gain.setTargetAtTime(0, t, 0.5);
    depth.connect(carrier.frequency);
    this.osc('sine', f * 3.5, depth, t, t + 7);
  }
}

// A stereo room tail: decaying noise, different in each ear.
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}
