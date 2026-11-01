import { describe, expect, it } from 'vitest';
import { SOCKET_NAMES, TEMPLATE } from './catalog';
import { canAttach, canRemove, canSwap, nextSteps, rankSockets, type AssemblyContext } from './assembly';

const allTools = { impactWrench: true, engineHoist: true, transmissionJack: true, tireChanger: true };

describe('assembly dependency graph', () => {
  for (const [k, kit] of Object.entries(TEMPLATE.kits)) {
    it(`Kit ${k} can be built from the bare frame by always fitting the next available step`, () => {
      const ctx: AssemblyContext = { sockets: {}, hinges: {}, tools: allTools };
      let guard = 0;
      for (;;) {
        const next = nextSteps(ctx).filter((s) => kit.sockets[s]);
        if (!next.length || guard++ > 200) break;
        for (const s of next) {
          const v = canAttach(ctx, s, kit.sockets[s]);
          if (v.ok) ctx.sockets[s] = kit.sockets[s];
        }
        // body panels may need the hood open to reach the engine bay (only matters for later engine work)
      }
      const missing = Object.keys(kit.sockets).filter((s) => !ctx.sockets[s]);
      expect(missing).toEqual([]);
    });
  }

  it('every socket requirement refers to a real socket, and the graph has no cycles', () => {
    for (const n of SOCKET_NAMES) for (const r of TEMPLATE.sockets[n].requires) expect(TEMPLATE.sockets[r]).toBeTruthy();
    const visiting = new Set<string>();
    const done = new Set<string>();
    const dfs = (n: string) => {
      if (done.has(n)) return;
      expect(visiting.has(n)).toBe(false);
      visiting.add(n);
      TEMPLATE.sockets[n].requires.forEach(dfs);
      visiting.delete(n);
      done.add(n);
    };
    SOCKET_NAMES.forEach(dfs);
  });

  it('wheels need brakes first and the impact wrench', () => {
    const ctx: AssemblyContext = { sockets: { axle_front: 'drivetrain_axle_front_a01' }, hinges: {}, tools: {} };
    expect(canAttach(ctx, 'wheel_FL', 'wheelAssembly_street_a01').reason).toMatch(/brake/i);
    ctx.sockets.strut_FL = 'suspension_strut_stock_a01';
    ctx.sockets.brake_FL = 'brakeSystem_disc_stock_a01';
    expect(canAttach(ctx, 'wheel_FL', 'wheelAssembly_street_a01').reason).toMatch(/impact wrench/i);
  });

  it('engine cannot come out while the hood is closed', () => {
    const ctx: AssemblyContext = { sockets: { ...TEMPLATE.kits.A.sockets }, hinges: {}, tools: allTools };
    // swap is the in-place replacement path
    expect(canSwap(ctx, 'engine_bay').ok).toBe(false);
    expect(canSwap(ctx, 'engine_bay').reason).toMatch(/hood/i);
    ctx.hinges.hood = 1;
    expect(canSwap(ctx, 'engine_bay').ok).toBe(true);
  });

  it('removal respects dependents', () => {
    const ctx: AssemblyContext = { sockets: { ...TEMPLATE.kits.A.sockets }, hinges: {}, tools: allTools };
    expect(canRemove(ctx, 'brake_FL').ok).toBe(false);
    expect(canRemove(ctx, 'spoiler').ok).toBe(true);
  });

  it('wrong part for a socket gives a one-line reason and ranks last', () => {
    const ctx: AssemblyContext = { sockets: {}, hinges: {}, tools: allTools };
    expect(canAttach(ctx, 'hood', 'wheelAssembly_street_a01').ok).toBe(false);
    const ranked = rankSockets(ctx, 'drivetrain_axle_front_a01');
    expect(ranked[0].verdict.ok).toBe(true);
  });

  it('EV needs the reduction gearbox and refuses an exhaust', () => {
    const ctx: AssemblyContext = { sockets: { axle_front: 'drivetrain_axle_front_a01', engine_bay: 'engineAssembly_electric_engine_a01' }, hinges: {}, tools: allTools };
    expect(canAttach(ctx, 'transmission', 'drivetrain_transmission_manual_a01').ok).toBe(false);
    expect(canAttach(ctx, 'transmission', 'drivetrain_transmission_ev_c01').ok).toBe(true);
    expect(canAttach(ctx, 'exhaust', 'exhaustSystem_stock_a01').ok).toBe(false);
  });
});

describe('EV conversion path (job j07)', () => {
  it('GT kit can be converted to EV without a full teardown', () => {
    const ctx: AssemblyContext = { sockets: { ...TEMPLATE.kits.B.sockets }, hinges: { hood: 1 }, tools: allTools };
    const rm = (s: string) => {
      const v = canRemove(ctx, s);
      expect(v.reason ?? 'ok').toBe('ok');
      delete ctx.sockets[s];
    };
    rm('bumper_R');
    rm('exhaust');
    rm('intake');
    expect(canSwap(ctx, 'engine_bay').ok).toBe(true);
    expect(canAttach(ctx, 'engine_bay', 'engineAssembly_electric_engine_a01').ok).toBe(true);
    ctx.sockets.engine_bay = 'engineAssembly_electric_engine_a01';
    expect(canAttach(ctx, 'transmission', 'drivetrain_transmission_ev_c01').ok).toBe(true);
    ctx.sockets.transmission = 'drivetrain_transmission_ev_c01';
    expect(canAttach(ctx, 'bumper_R', 'bodyPart_bumper_rear_b01').ok).toBe(true);
  });
});
