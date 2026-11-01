import { PART_BY_ID, TEMPLATE, type Vec3 } from '../car/catalog';
import { HP_TO_KW, NO_INDUCTION, peaks, type Induction } from './engine';
import { brakingDistance, simulateAccel, topSpeed, type CarParams } from './performance';

export const DRIVER_MASS = 75;
export const WORN_BRAKE = 0.6;
export const WORN_MU = 0.75;

export interface BuildSpec {
  sockets: Record<string, string>;
  worn?: string[];
}

export interface Stats {
  driveable: boolean;
  missing: string[];
  mass: number;
  com: Vec3;
  frontPct: number;
  hp: number;
  hpRpm: number;
  nm: number;
  nmRpm: number;
  powerToWeight: number; // hp / tonne
  zeroHundred: number;
  quarterMile: number;
  trapKmh: number;
  topKmh: number;
  topLimitedBy: 'power' | 'gearing';
  braking: number;
  handling: number;
  handlingParts: Record<string, number>;
  mu: number;
  cd: number;
  efficiency: number; // relative fuel/energy efficiency (1 = baseline)
  params: CarParams | null;
  value: number;
}

export function inductionOf(sockets: Record<string, string>): Induction {
  const ind: Induction = { ...NO_INDUCTION };
  const f = sockets.forced_induction ? PART_BY_ID[sockets.forced_induction] : undefined;
  if (f?.stats.powerMul) {
    ind.boostMul = f.stats.powerMul;
    ind.kind = f.stats.spoolLag ? 'turbo' : 'supercharger';
    ind.spoolLag = f.stats.spoolLag ?? 0;
    ind.spoolRpm = f.stats.spoolRpm ?? 3000;
    ind.efficiencyDelta = f.stats.efficiency ?? 0;
  }
  for (const s of ['intake', 'exhaust']) {
    const p = sockets[s] ? PART_BY_ID[sockets[s]] : undefined;
    if (p?.stats.powerMul) ind.boltOnMul *= p.stats.powerMul;
  }
  return ind;
}

/** Mass and centre of mass. Σ mᵢ·posᵢ / Σ mᵢ over attached parts + frame + 75 kg driver. */
export function massProperties(sockets: Record<string, string>) {
  let m = TEMPLATE.frameMass;
  const sum: Vec3 = [0, 0.42 * m, 0.05 * m];
  const addMass = (mass: number, p: Vec3) => {
    m += mass;
    sum[0] += mass * p[0];
    sum[1] += mass * p[1];
    sum[2] += mass * p[2];
  };
  for (const [sock, id] of Object.entries(sockets)) {
    const part = PART_BY_ID[id];
    const s = TEMPLATE.sockets[sock];
    if (!part || !s) continue;
    const battery = part.stats.engine?.batteryMass ?? 0;
    addMass(part.mass - battery, s.pos);
    if (battery) addMass(battery, [0, 0.24, -0.25]); // pack in the floor pan
  }
  const seat = TEMPLATE.sockets.seat_driver.pos;
  addMass(DRIVER_MASS, [seat[0], seat[1] + 0.28, seat[2]]);
  const com: Vec3 = [sum[0] / m, sum[1] / m, sum[2] / m];
  const half = TEMPLATE.wheelbase / 2;
  const frontShare = Math.min(1, Math.max(0, (com[2] + half) / TEMPLATE.wheelbase));
  return { mass: m, com, frontShare };
}

const avg = (xs: number[], fallback: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function computeStats(build: BuildSpec): Stats {
  const { sockets } = build;
  const worn = new Set(build.worn ?? []);
  const part = (s: string) => (sockets[s] ? PART_BY_ID[sockets[s]] : undefined);
  const corners = ['FL', 'FR', 'RL', 'RR'];

  const { mass, com, frontShare } = massProperties(sockets);

  const engine = part('engine_bay')?.stats.engine;
  const gearbox = part('transmission')?.stats.gearbox;
  const missing: string[] = [];
  if (!engine) missing.push('engine');
  if (!gearbox) missing.push('transmission');
  if (!sockets.axle_front || !sockets.axle_rear) missing.push('axles');
  if (corners.some((c) => !sockets[`wheel_${c}`])) missing.push('4 wheels');
  if (corners.some((c) => !sockets[`brake_${c}`])) missing.push('4 brakes');

  const mus = corners.flatMap((c) => {
    const p = part(`wheel_${c}`);
    return p?.stats.mu ? [p.stats.mu * (worn.has(`wheel_${c}`) ? WORN_MU : 1)] : [];
  });
  const mu = avg(mus, 0.9);
  const brakeFactor = Math.min(
    ...corners.map((c) => (part(`brake_${c}`)?.stats.brakeFactor ?? 0.5) * (worn.has(`brake_${c}`) ? WORN_BRAKE : 1)),
  );
  const stiffness = avg(corners.flatMap((c) => (part(`strut_${c}`)?.stats.stiffness != null ? [part(`strut_${c}`)!.stats.stiffness!] : [])), 0.3);
  const rideHeight = avg(corners.flatMap((c) => (part(`strut_${c}`)?.stats.rideHeight != null ? [part(`strut_${c}`)!.stats.rideHeight!] : [])), 0);

  // Aero: dominant body kit sets Cd; each missing major panel adds drag; spoiler adds cdDelta + downforce.
  const kitVotes: Record<string, number> = {};
  const majorPanels = ['hood', 'trunk_lid', 'roof_panel', 'bumper_F', 'bumper_R', 'windscreen', 'door_FL', 'door_FR', 'fender_FL', 'fender_FR'];
  let missingPanels = 0;
  for (const s of majorPanels) {
    const p = part(s);
    if (!p) missingPanels++;
    else if (p.stats.cd) kitVotes[p.stats.cd] = (kitVotes[p.stats.cd] ?? 0) + 1;
  }
  const kitCd = Object.entries(kitVotes).sort((a, b) => b[1] - a[1])[0]?.[0];
  const spoiler = part('spoiler');
  const cd = (kitCd ? +kitCd : 0.34) + missingPanels * 0.012 + (spoiler?.stats.cdDelta ?? 0);
  const downforceN = spoiler?.stats.downforce ?? 0;
  const comHeight = com[1] + rideHeight + (part('seat_driver')?.stats.comHeight ?? 0);

  const ind = inductionOf(sockets);
  const diff = part('diff_rear');
  const launchBonus = diff?.stats.launch ?? 0;

  const value = Object.values(sockets).reduce((acc, id) => acc + (PART_BY_ID[id]?.price ?? 0), 0);

  // Handling (0–100): grip 30 · stiffness 20 · CoM height 20 · balance 20 · downforce 10 + diff/wheel bonuses
  const frontPct = frontShare * 100;
  const hp_ = {
    grip: 30 * clamp01((mu - 0.85) / (1.2 - 0.85)),
    suspension: 20 * clamp01((stiffness - 0.3) / 0.5),
    comHeight: 20 * clamp01((0.6 - comHeight) / (0.6 - 0.42)),
    balance: 20 * clamp01(1 - Math.abs(frontPct - 50) / 15),
    downforce: 10 * clamp01(downforceN),
    bonus: 100 * ((diff?.stats.handling ?? 0) + avg(corners.map((c) => part(`wheel_${c}`)?.stats.handling ?? 0), 0)),
  };
  const handling = Math.round(Math.min(100, Object.values(hp_).reduce((a, b) => a + b, 0)));

  const base = {
    missing, mass, com, frontPct, mu, cd, handling, handlingParts: hp_, value,
    efficiency: 1 + ind.efficiencyDelta - (ind.kind === 'turbo' ? 0.02 : 0),
  };

  if (engine && gearbox && !!gearbox.evOnly !== (engine.kind === 'ev')) missing.push(engine.kind === 'ev' ? 'EV reduction gearbox' : 'ICE gearbox');
  if (!engine || !gearbox || !!gearbox.evOnly !== (engine.kind === 'ev')) {
    return { ...base, driveable: false, hp: 0, hpRpm: 0, nm: 0, nmRpm: 0, powerToWeight: 0, zeroHundred: Infinity, quarterMile: Infinity,
      trapKmh: 0, topKmh: 0, topLimitedBy: 'power', braking: brakingDistance({ mu, brakeFactor } as CarParams), params: null };
  }

  const params: CarParams = {
    mass, frontShare, comHeight, wheelbase: TEMPLATE.wheelbase, mu, brakeFactor, cd, area: 2.1, crr: 0.012,
    clA: 0.6 * downforceN, tireRadius: 0.33, launchBonus, engine, induction: ind, gearbox,
  };
  const pk = peaks(engine, ind);
  const driveable = missing.length === 0;
  const acc = driveable ? simulateAccel(params) : { zeroHundred: Infinity, quarterMile: Infinity, trapKmh: 0 };
  const top = driveable ? topSpeed(params, pk.hp * HP_TO_KW * 1000) : { kmh: 0, limitedBy: 'power' as const };
  return {
    ...base,
    driveable,
    hp: pk.hp, hpRpm: pk.hpRpm, nm: pk.nm, nmRpm: pk.nmRpm,
    powerToWeight: pk.hp / (mass / 1000),
    zeroHundred: acc.zeroHundred, quarterMile: acc.quarterMile, trapKmh: acc.trapKmh,
    topKmh: top.kmh, topLimitedBy: top.limitedBy,
    braking: brakingDistance(params),
    params,
  };
}

/** Formulas shown in the HUD "Why?" tooltips. */
export const WHY: Record<string, string> = {
  mass: 'm_total = Σ part.mass + frame + 75 kg driver (part masses clamped to sane ranges).',
  com: 'CoM = Σ(mᵢ · posᵢ) / Σ mᵢ.  Front % = (CoM.z − z_rear_axle) / wheelbase.',
  hp: 'P = T · rpm / 9549 (kW). Turbo ×1.25 above spool (0.6 s lag), supercharger ×1.18 (no lag, −3% efficiency), intake/exhaust ±2–6%.',
  zeroHundred: 'Fixed-step sim, dt = 1/120 s:  a = (F_drive − F_drag − F_roll) / m.  F_drive = min(P(v)/max(v,1), μ·(m·g + F_down)·driveAxleShare); clutch slip below launch rpm is torque-limited; shifts cut drive.',
  quarterMile: 'Same integration as 0–100, run until x = 402.3 m. Trap speed = v at the line.',
  topKmh: 'Solve P_peak·η = F_drag·v + F_roll·v, with F_drag = ½·ρ(1.225)·Cd·A(2.1 m²)·v² and F_roll = Crr(0.012)·m·g. Capped by redline in top gear.',
  braking: 'd = v² / (2 · μ_tire · g · brakeFactor).  brakeFactor 0.85 stock, 1.0 brake upgrade, ×0.6 when worn.',
  handling: 'Weighted 0–100: tyre μ 30 · suspension stiffness 20 · CoM height 20 · balance near 50:50 20 · spoiler downforce 10 (+ LSD / rally-tyre bonus).',
  powerToWeight: 'hp per tonne = P_peak / (m_total / 1000).',
  cd: 'Cd from the dominant body kit (Street 0.32 · GT 0.29 · Rally 0.36), +0.012 per missing major panel, + spoiler ΔCd.',
  mu: 'Tyre grip μ: stock 0.9 · sport 1.05 · semi-slick 1.2 · gravel 1.0 (×0.75 when worn). Average of 4 corners.',
};
