'use client';

/**
 * Tiny procedural audio bed for the world: a low engine drone, filtered wind, and a
 * two-tone horn. Everything is synthesised with the WebAudio API (no asset downloads),
 * and nothing is created until the first user gesture so autoplay policies stay happy.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let engine: { oscA: OscillatorNode; oscB: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
let wind: { gain: GainNode } | null = null;
let enabled = true;
let started = false;

const MASTER_GAIN = 0.5;

function now(): number {
  return ctx ? ctx.currentTime : 0;
}

function start() {
  if (started || typeof window === 'undefined') return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    ctx = new Ctor();
  } catch {
    return;
  }

  master = ctx.createGain();
  master.gain.value = enabled ? MASTER_GAIN : 0;
  master.connect(ctx.destination);

  // Engine: two detuned oscillators through a lowpass that opens with speed.
  const eg = ctx.createGain();
  eg.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.6;
  const oscA = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscA.frequency.value = 54;
  const oscB = ctx.createOscillator();
  oscB.type = 'triangle';
  oscB.frequency.value = 86;
  oscB.detune.value = 9;
  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(eg);
  eg.connect(master);
  oscA.start();
  oscB.start();
  engine = { oscA, oscB, gain: eg, filter };

  // Wind: looping brown-ish noise through a bandpass.
  const seconds = 2;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.4;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 520;
  bp.Q.value = 0.7;
  const wg = ctx.createGain();
  wg.gain.value = 0;
  src.connect(bp);
  bp.connect(wg);
  wg.connect(master);
  src.start();
  wind = { gain: wg };

  started = true;
}

/** Resume/create the graph on a user gesture (keydown, pointerdown, click). */
export function unlockAudio() {
  start();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(on ? MASTER_GAIN : 0, ctx.currentTime, 0.06);
}

export function updateAudio(speed: number) {
  if (!started || !ctx || !engine || !wind) return;
  const intensity = Math.min(Math.abs(speed) / 10, 1.2);
  engine.gain.gain.value = enabled ? 0.045 + 0.16 * intensity : 0;
  engine.oscA.frequency.value = 52 + Math.abs(speed) * 6.5;
  engine.oscB.frequency.value = 84 + Math.abs(speed) * 10.5;
  engine.filter.frequency.value = 340 + intensity * 1500;
  wind.gain.gain.value = enabled ? intensity * 0.06 : 0;
}

export function playHorn() {
  if (!started || !ctx || !master) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  const o1 = ctx.createOscillator();
  o1.type = 'square';
  o1.frequency.value = 330;
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = 248;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1700;
  o1.connect(g);
  o2.connect(g);
  g.connect(f);
  f.connect(master);
  o1.start(t);
  o2.start(t);
  o1.stop(t + 0.36);
  o2.stop(t + 0.36);
}

export function silenceAudio() {
  if (!ctx) return;
  if (engine) engine.gain.gain.value = 0;
  if (wind) wind.gain.gain.value = 0;
}
