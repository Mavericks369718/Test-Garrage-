import type { EngineSpec, GearboxSpec } from '../car/catalog';
import { boostTarget, hpFromTorque, torqueAt, type Induction } from './engine';

export interface DynoSample { t: number; rpm: number; nm: number; hp: number; boost: number }

/**
 * Real-time dyno sweep: 1000 rpm → redline in `sweepSeconds` (4–6 s) in a ~1:1 gear.
 * Turbo boost follows its steady-state target with first-order lag τ = spoolLag (0.6 s).
 */
export class DynoRun {
  t = 0;
  rpm: number;
  boost = 0;
  samples: DynoSample[] = [];
  done = false;
  readonly sweepSeconds: number;
  readonly startRpm: number;

  constructor(readonly engine: EngineSpec, readonly ind: Induction, readonly gearbox: GearboxSpec, sweepSeconds = 5) {
    this.startRpm = Math.max(1000, engine.idle);
    this.rpm = this.startRpm;
    this.sweepSeconds = Math.min(6, Math.max(4, sweepSeconds));
    if (ind.kind === 'supercharger') this.boost = 1;
  }

  /** Dyno gear: the ratio closest to 1:1 (EV: its single reduction). */
  get gearRatio() {
    const r = this.gearbox.ratios;
    return r.reduce((best, x) => (Math.abs(x - 1) < Math.abs(best - 1) ? x : best), r[0]);
  }

  /** Wheel angular speed (rad/s) for the current rpm. */
  get wheelOmega() {
    return (this.rpm * 2 * Math.PI) / 60 / (this.gearRatio * this.gearbox.final);
  }

  step(dt: number) {
    if (this.done) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.sweepSeconds);
    this.rpm = this.startRpm + (this.engine.redline - this.startRpm) * k;
    const target = boostTarget(this.ind, this.rpm);
    if (this.ind.kind === 'turbo') this.boost += (target - this.boost) * (1 - Math.exp(-dt / Math.max(0.05, this.ind.spoolLag)));
    else this.boost = target;
    const nm = torqueAt(this.engine, this.ind, this.rpm, this.boost);
    this.samples.push({ t: this.t, rpm: this.rpm, nm, hp: hpFromTorque(nm, this.rpm), boost: this.boost });
    if (k >= 1) this.done = true;
  }

  get peak() {
    return this.samples.reduce(
      (acc, s) => ({ hp: Math.max(acc.hp, s.hp), nm: Math.max(acc.nm, s.nm) }),
      { hp: 0, nm: 0 },
    );
  }
}
