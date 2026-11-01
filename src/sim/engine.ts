import type { EngineSpec } from '../car/catalog';

/** Gameplay engine model. Values are game numbers, not manufacturer data. */
export const HP_TO_KW = 0.745699872;
export const kwFromTorque = (nm: number, rpm: number) => (nm * rpm) / 9549.3;
export const hpFromTorque = (nm: number, rpm: number) => kwFromTorque(nm, rpm) / HP_TO_KW;

function hermite(x: number, x0: number, y0: number, m0: number, x1: number, y1: number, m1: number) {
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}

/**
 * Naturally-aspirated torque at the crank (Nm).
 * ICE: cubic Hermite through (idle, 0.55·Tpk) → (Tpk rpm, Tpk, slope 0) → (Ppk rpm, Ppk·9549/rpm, slope −T/rpm so dP/drpm = 0)
 *      → redline (power falls off). This makes the requested peak torque AND peak power exact maxima.
 * EV:  flat torque to base speed, constant power to 9000 rpm, then field-weakening to redline.
 */
export function baseTorque(e: EngineSpec, rpm: number): number {
  const peakKw = e.peakHp * HP_TO_KW;
  if (e.kind === 'ev') {
    const r = Math.max(0, Math.min(rpm, e.redline));
    const base = (peakKw * 9549.3) / e.peakNm;
    if (r <= base) return e.peakNm;
    const flatTo = Math.min(9000, e.redline);
    const t = (peakKw * 9549.3) / r;
    // Above 9000 rpm: field weakening, power falls ∝ 9000/rpm.
    return r <= flatTo ? t : t * (flatTo / r);
  }
  const r = Math.max(e.idle * 0.5, Math.min(rpm, e.redline));
  const Tpk = e.peakNm;
  const rT = e.peakNmRpm;
  const rP = e.peakHpRpm;
  const TP = (peakKw * 9549.3) / rP;
  const T0 = 0.55 * Tpk;
  const r0 = e.idle;
  const TR = TP * Math.pow(rP / e.redline, 1.4);
  const mP = -TP / rP;
  const mR = (-1.4 * TR) / e.redline;
  if (r <= r0) return T0 * (r / r0);
  if (r <= rT) return hermite(r, r0, T0, ((Tpk - T0) / (rT - r0)) * 1.1, rT, Tpk, 0);
  if (r <= rP) return hermite(r, rT, Tpk, 0, rP, TP, mP);
  return hermite(r, rP, TP, mP, e.redline, TR, mR);
}

export interface Induction {
  /** Multiplier on torque from bolt-ons (intake, exhaust). */
  boltOnMul: number;
  /** Turbo or supercharger multiplier at full boost (1 = none). */
  boostMul: number;
  /** Turbo spool delay (s); 0 for supercharger / none. */
  spoolLag: number;
  /** Turbo needs exhaust flow: boost builds from spoolRpm−1200 to spoolRpm+800. */
  spoolRpm: number;
  /** Fuel efficiency delta (supercharger: −3%). */
  efficiencyDelta: number;
  kind: 'none' | 'turbo' | 'supercharger';
}

export const NO_INDUCTION: Induction = { boltOnMul: 1, boostMul: 1, spoolLag: 0, spoolRpm: 0, efficiencyDelta: 0, kind: 'none' };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Steady-state boost fraction (0..1) at a given rpm. */
export function boostTarget(ind: Induction, rpm: number): number {
  if (ind.kind === 'none') return 0;
  if (ind.kind === 'supercharger') return 1;
  return smoothstep(ind.spoolRpm - 1200, ind.spoolRpm + 800, rpm);
}

/** Torque with induction. `boost` overrides steady-state boost (used by the dyno for lag). */
export function torqueAt(e: EngineSpec, ind: Induction, rpm: number, boost?: number): number {
  const b = boost ?? boostTarget(ind, rpm);
  return baseTorque(e, rpm) * ind.boltOnMul * (1 + (ind.boostMul - 1) * b);
}

export function curve(e: EngineSpec, ind: Induction, step = 100) {
  const pts: { rpm: number; nm: number; hp: number }[] = [];
  for (let rpm = Math.max(1000, e.idle); rpm <= e.redline; rpm += step) {
    const nm = torqueAt(e, ind, rpm);
    pts.push({ rpm, nm, hp: hpFromTorque(nm, rpm) });
  }
  return pts;
}

export function peaks(e: EngineSpec, ind: Induction) {
  let hp = 0, hpRpm = 0, nm = 0, nmRpm = 0;
  for (let rpm = Math.max(500, e.idle); rpm <= e.redline; rpm += 25) {
    const t = torqueAt(e, ind, rpm);
    const p = hpFromTorque(t, rpm);
    if (p > hp) { hp = p; hpRpm = rpm; }
    if (t > nm) { nm = t; nmRpm = rpm; }
  }
  return { hp, hpRpm, nm, nmRpm };
}
