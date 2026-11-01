import { Howl, Howler } from 'howler';

/**
 * All sounds are synthesised at startup into small WAV data URIs and played through Howler,
 * so the game ships zero audio files (keeps the first download small).
 */
const RATE = 22050;

function wav(samples: Float32Array): string {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:audio/wav;base64,' + btoa(bin);
}

function synth(seconds: number, fn: (t: number, i: number) => number) {
  const n = Math.floor(seconds * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i);
  return out;
}

let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));

const BANK: Record<string, () => Float32Array> = {
  // Engine loop at 1000 rpm-equivalent; pitch-shifted by Howler rate. Firing pulses + harmonics + a little noise.
  engine: () => {
    const f = 50;
    return synth(1, (t) => {
      const ph = (t * f) % 1;
      const pulse = Math.exp(-ph * 9) * 0.6;
      return 0.45 * (pulse + 0.35 * Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(2 * Math.PI * f * 2 * t) + 0.08 * noise());
    });
  },
  // Impact wrench "brrrt": 120 ms bursts of hammering (≈ 40 Hz) noise.
  impact: () => synth(0.52, (t) => {
    const burst = Math.floor(t / 0.13);
    const tb = t - burst * 0.13;
    const gate = tb < 0.11 ? 1 : 0;
    const hammer = Math.exp(-((t * 42) % 1) * 6);
    return gate * hammer * (0.55 * noise() + 0.35 * Math.sin(2 * Math.PI * 180 * t)) * 0.8;
  }),
  snap: () => synth(0.12, (t) => env(t, 0.002, 0.025) * (0.6 * noise() + 0.4 * Math.sin(2 * Math.PI * 900 * t))),
  ratchet: () => synth(0.3, (t) => {
    const click = Math.exp(-((t * 28) % 1) * 30);
    return click * noise() * 0.5;
  }),
  hinge: () => synth(0.35, (t) => env(t, 0.01, 0.12) * (0.2 * Math.sin(2 * Math.PI * (220 + 90 * t) * t) + 0.12 * noise())),
  hum: () => synth(1, (t) => 0.3 * Math.sin(2 * Math.PI * 60 * t) + 0.12 * Math.sin(2 * Math.PI * 120 * t) + 0.06 * noise()),
  spray: () => synth(1, () => 0.35 * noise()),
  deny: () => synth(0.16, (t) => env(t, 0.004, 0.06) * 0.35 * Math.sign(Math.sin(2 * Math.PI * 140 * t))),
  cash: () => synth(0.32, (t) => env(t, 0.003, 0.09) * 0.3 * (Math.sin(2 * Math.PI * 1320 * t) + Math.sin(2 * Math.PI * 1760 * t * (t > 0.08 ? 1 : 0)))),
  click: () => synth(0.04, (t) => env(t, 0.001, 0.008) * noise() * 0.4),
};

const LOOPS = new Set(['engine', 'hum', 'spray']);

class Sfx {
  private howls = new Map<string, Howl>();
  private loopIds = new Map<string, number>();
  muted = false;

  private get(name: string): Howl | null {
    if (typeof window === 'undefined') return null;
    let h = this.howls.get(name);
    if (!h) {
      h = new Howl({ src: [wav(BANK[name]())], format: ['wav'], loop: LOOPS.has(name), volume: name === 'engine' ? 0.5 : 0.6 });
      this.howls.set(name, h);
    }
    return h;
  }

  play(name: keyof typeof BANK | string) {
    if (this.muted || !BANK[name]) return;
    this.get(name)?.play();
  }

  /** Start/stop a loop; `rate` pitch-shifts (engine: rpm / 1000 · 0.5). */
  loop(name: string, on: boolean, rate = 1, volume?: number) {
    const h = this.get(name);
    if (!h) return;
    let id = this.loopIds.get(name);
    if (on && !this.muted) {
      if (id == null || !h.playing(id)) {
        id = h.play();
        this.loopIds.set(name, id);
      }
      h.rate(Math.min(4, Math.max(0.5, rate)), id);
      if (volume != null) h.volume(volume, id);
    } else if (id != null) {
      h.stop(id);
      this.loopIds.delete(name);
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    Howler.mute(m);
  }
}

export const sfx = new Sfx();
