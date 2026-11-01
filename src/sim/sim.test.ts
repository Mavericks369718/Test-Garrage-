import { describe, expect, it } from 'vitest';
import { PART_BY_ID, TEMPLATE } from '../car/catalog';
import { DynoRun } from './dyno';
import { baseTorque, hpFromTorque, NO_INDUCTION, peaks } from './engine';
import { computeStats, inductionOf } from './stats';

const kit = (k: string, over: Record<string, string> = {}) => ({ ...TEMPLATE.kits[k].sockets, ...over });
const ENGINES = {
  v6: 'engineAssembly_v6_engine_a01',
  v8: 'engineAssembly_v8_engine_a01',
  v12: 'engineAssembly_v12_engine_a01',
  ev: 'engineAssembly_electric_engine_a01',
};
const withEngine = (key: keyof typeof ENGINES) =>
  kit('A', {
    engine_bay: ENGINES[key],
    ...(key === 'ev' ? { transmission: 'drivetrain_transmission_ev_c01' } : {}),
  });

describe('engine curves', () => {
  for (const [key, id] of Object.entries(ENGINES)) {
    const e = PART_BY_ID[id].stats.engine!;
    it(`${key}: peak power and torque match the spec table`, () => {
      const pk = peaks(e, NO_INDUCTION);
      expect(pk.hp).toBeGreaterThan(e.peakHp * 0.99);
      expect(pk.hp).toBeLessThan(e.peakHp * 1.01);
      expect(pk.nm).toBeGreaterThan(e.peakNm * 0.99);
      expect(pk.nm).toBeLessThan(e.peakNm * 1.01);
      if (e.kind !== 'ev') expect(Math.abs(pk.hpRpm - e.peakHpRpm)).toBeLessThan(300);
    });
    it(`${key}: torque is positive and finite across the rev range`, () => {
      for (let r = 1000; r <= e.redline; r += 250) {
        const t = baseTorque(e, r);
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThan(0);
        expect(hpFromTorque(t, r)).toBeLessThanOrEqual(e.peakHp * 1.01);
      }
    });
  }

  it('turbo adds 25% peak power, supercharger 18%', () => {
    const e = PART_BY_ID[ENGINES.v6].stats.engine!;
    const turbo = peaks(e, inductionOf({ forced_induction: 'engineComponent_turbocompressor_a01' }));
    const sc = peaks(e, inductionOf({ forced_induction: 'engineComponent_supercharger_a01' }));
    expect(turbo.hp / 280).toBeCloseTo(1.25, 1);
    expect(sc.hp / 280).toBeCloseTo(1.18, 1);
  });
});

describe('performance is sane for each engine', () => {
  const ranges = {
    v6: { zh: [4.8, 7.5], top: [230, 290] },
    // RWD on stock 0.9 μ tyres is traction-limited off the line, so big engines don't gain much 0–100 here.
    v8: { zh: [3.8, 6.2], top: [260, 330] },
    v12: { zh: [3.0, 6.2], top: [290, 370] },
    ev: { zh: [2.8, 4.8], top: [200, 300] },
  } as const;
  for (const key of Object.keys(ENGINES) as (keyof typeof ENGINES)[]) {
    it(`${key}: 0–100, ¼ mile, top speed, braking`, () => {
      const s = computeStats({ sockets: withEngine(key) });
      expect(s.driveable).toBe(true);
      expect(s.zeroHundred).toBeGreaterThan(ranges[key].zh[0]);
      expect(s.zeroHundred).toBeLessThan(ranges[key].zh[1]);
      expect(s.quarterMile).toBeGreaterThan(9.5);
      expect(s.quarterMile).toBeLessThan(15.5);
      expect(s.topKmh).toBeGreaterThan(ranges[key].top[0]);
      expect(s.topKmh).toBeLessThan(ranges[key].top[1]);
      expect(s.braking).toBeGreaterThan(30);
      expect(s.braking).toBeLessThan(60);
    });
  }

  it('more power never makes the car slower (same chassis)', () => {
    const t = (k: keyof typeof ENGINES) => computeStats({ sockets: withEngine(k) }).quarterMile;
    expect(t('v8')).toBeLessThan(t('v6'));
    expect(t('v12')).toBeLessThan(t('v8'));
  });

  it('V12 on semi-slicks beats the V8 over the quarter mile', () => {
    const slicks = { wheel_FL: 'wheelAssembly_semislick_b02', wheel_FR: 'wheelAssembly_semislick_b02', wheel_RL: 'wheelAssembly_semislick_b02', wheel_RR: 'wheelAssembly_semislick_b02' };
    const v8 = computeStats({ sockets: { ...withEngine('v8'), ...slicks } }).quarterMile;
    const v12 = computeStats({ sockets: { ...withEngine('v12'), ...slicks } }).quarterMile;
    expect(v12).toBeLessThan(v8);
  });

  it('brake upgrade + grippier tyres shorten braking distance', () => {
    const stock = computeStats({ sockets: kit('A') }).braking;
    const gt = computeStats({ sockets: kit('B') }).braking;
    expect(gt).toBeLessThan(stock);
    const worn = computeStats({ sockets: kit('A'), worn: ['brake_FL'] }).braking;
    expect(worn).toBeGreaterThan(stock);
  });
});

describe('mass, balance and handling', () => {
  it('mass includes the 75 kg driver and is car-like', () => {
    const s = computeStats({ sockets: kit('A') });
    expect(s.mass).toBeGreaterThan(1150);
    expect(s.mass).toBeLessThan(1700);
    expect(s.frontPct).toBeGreaterThan(40);
    expect(s.frontPct).toBeLessThan(65);
  });
  it('GT kit handles better than Street', () => {
    expect(computeStats({ sockets: kit('B') }).handling).toBeGreaterThan(computeStats({ sockets: kit('A') }).handling);
  });
  it('incomplete car is not driveable', () => {
    const s = computeStats({ sockets: { axle_front: 'drivetrain_axle_front_a01' } });
    expect(s.driveable).toBe(false);
    expect(s.missing).toContain('engine');
  });
});

describe('dyno', () => {
  it('sweeps 1000 → redline in 4–6 s and shows turbo lag', () => {
    const e = PART_BY_ID[ENGINES.v6].stats.engine!;
    const gb = PART_BY_ID['drivetrain_transmission_manual_a01'].stats.gearbox!;
    const run = new DynoRun(e, inductionOf({ forced_induction: 'engineComponent_turbocompressor_a01' }), gb, 5);
    while (!run.done) run.step(1 / 120);
    expect(run.t).toBeGreaterThanOrEqual(4);
    expect(run.t).toBeLessThanOrEqual(6.01);
    const at = (rpm: number) => run.samples.find((s) => s.rpm >= rpm)!;
    expect(at(3000).boost).toBeLessThan(0.6);
    expect(run.samples[run.samples.length - 1].boost).toBeGreaterThan(0.95);
  });
});
