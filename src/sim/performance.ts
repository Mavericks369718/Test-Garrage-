import type { EngineSpec, GearboxSpec } from '../car/catalog';
import { torqueAt, type Induction } from './engine';

export const G = 9.81;
export const RHO = 1.225;
export const DT = 1 / 120;
export const KMH = 3.6;
/** Peak longitudinal grip sits ~15% above a tyre's rated (lateral) μ at optimal slip ratio. */
export const LONG_GRIP = 1.15;

export interface CarParams {
  mass: number; // kg incl. driver
  frontShare: number; // static front weight fraction 0..1
  comHeight: number; // m
  wheelbase: number; // m
  mu: number; // tyre grip
  brakeFactor: number;
  cd: number;
  area: number; // frontal area m²
  crr: number;
  clA: number; // downforce coefficient × area (m²)
  tireRadius: number;
  launchBonus: number; // LSD traction bonus (fraction)
  engine: EngineSpec;
  induction: Induction;
  gearbox: GearboxSpec;
}

const rpmFromSpeed = (v: number, ratio: number, gb: GearboxSpec, r: number) => ((v / r) * ratio * gb.final * 60) / (2 * Math.PI);

/** Engine-limited wheel force in the best gear at speed v (N). Includes clutch slip below launch rpm. */
export function engineForce(p: CarParams, v: number): { force: number; gear: number; rpm: number } {
  const { engine: e, gearbox: gb } = p;
  const launchRpm = e.kind === 'ev' ? 0 : Math.min(e.peakNmRpm, e.idle + 2600);
  let best = { force: 0, gear: gb.ratios.length - 1, rpm: e.redline };
  gb.ratios.forEach((ratio, i) => {
    const rpm = rpmFromSpeed(v, ratio, gb, p.tireRadius);
    if (rpm > e.redline) return;
    const effRpm = Math.max(rpm, launchRpm);
    const t = torqueAt(e, p.induction, effRpm);
    const f = (t * ratio * gb.final * gb.efficiency) / p.tireRadius;
    if (f > best.force) best = { force: f, gear: i, rpm };
  });
  return best;
}

export function dragForce(p: CarParams, v: number) {
  return 0.5 * RHO * p.cd * p.area * v * v;
}
export function rollForce(p: CarParams) {
  return p.crr * p.mass * G;
}
export function downforce(p: CarParams, v: number) {
  return 0.5 * RHO * p.clA * v * v;
}

/** Traction limit: μ · 1.15 · (m·g + downforce) · driveAxleShare (with longitudinal load transfer). */
export function tractionLimit(p: CarParams, v: number, a: number) {
  const transfer = (a * p.comHeight) / (p.wheelbase * G);
  let share: number;
  if (p.gearbox.drive === 'AWD') share = 1;
  else if (p.gearbox.drive === 'RWD') share = Math.min(1, 1 - p.frontShare + transfer);
  else share = Math.max(0, p.frontShare - transfer);
  return p.mu * LONG_GRIP * (1 + p.launchBonus) * (p.mass * G + downforce(p, v)) * share;
}

export interface AccelResult {
  zeroHundred: number;
  quarterMile: number;
  trapKmh: number;
  trace: { t: number; v: number; gear: number }[];
}

/** Fixed-step (dt = 1/120 s) straight-line acceleration run. */
export function simulateAccel(p: CarParams, maxTime = 60): AccelResult {
  let v = 0, x = 0, t = 0, a = 0;
  let gear = 0;
  let shiftTimer = 0;
  let zeroHundred = Infinity;
  let quarterMile = Infinity;
  let trapKmh = 0;
  const trace: AccelResult['trace'] = [];
  while (t < maxTime) {
    const ef = engineForce(p, v);
    if (ef.gear > gear) {
      gear = ef.gear;
      shiftTimer = p.gearbox.shiftTime;
    }
    let fDrive = shiftTimer > 0 ? 0 : Math.min(ef.force, tractionLimit(p, v, a));
    if (shiftTimer > 0) shiftTimer -= DT;
    const fRes = dragForce(p, v) + (v > 0.01 ? rollForce(p) : 0);
    if (fDrive < 0) fDrive = 0;
    a = (fDrive - fRes) / p.mass;
    v = Math.max(0, v + a * DT);
    x += v * DT;
    t += DT;
    if (trace.length === 0 || t - trace[trace.length - 1].t >= 0.1) trace.push({ t, v, gear });
    if (zeroHundred === Infinity && v >= 100 / KMH) zeroHundred = t;
    if (x >= 402.336) {
      quarterMile = t;
      trapKmh = v * KMH;
      break;
    }
  }
  return { zeroHundred, quarterMile, trapKmh, trace };
}

/** Top speed: solve P_peak·η = (F_drag + F_roll)·v by bisection, then cap by gearing at redline and by actual wheel force. */
export function topSpeed(p: CarParams, peakPowerW: number): { kmh: number; limitedBy: 'power' | 'gearing' } {
  const pAvail = peakPowerW * p.gearbox.efficiency;
  const f = (v: number) => (dragForce(p, v) + rollForce(p)) * v - pAvail;
  let lo = 1, hi = 200;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  const vPower = lo;
  const top = p.gearbox.ratios[p.gearbox.ratios.length - 1];
  const vGear = ((p.engine.redline * 2 * Math.PI) / 60) * p.tireRadius / (top * p.gearbox.final);
  // Wheel-force check across gears (curve shape can make the peak-power answer optimistic).
  let vForce = 0;
  for (let v = 1; v < 200; v += 0.25) {
    if (engineForce(p, v).force >= dragForce(p, v) + rollForce(p)) vForce = v;
  }
  const v = Math.min(vPower, vGear, vForce || vPower);
  return { kmh: v * KMH, limitedBy: vGear < vPower && vGear <= vForce ? 'gearing' : 'power' };
}

/** Braking 100–0: d = v² / (2 · μ · g · brakeFactor). */
export function brakingDistance(p: CarParams, fromKmh = 100) {
  const v = fromKmh / KMH;
  return (v * v) / (2 * p.mu * G * p.brakeFactor);
}
