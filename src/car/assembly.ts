import { PART_BY_ID, SOCKET_NAMES, TEMPLATE, type Part } from './catalog';

export type ToolId = 'impactWrench' | 'engineHoist' | 'transmissionJack' | 'tireChanger';

export const TOOL_LABEL: Record<ToolId, string> = {
  impactWrench: 'Impact wrench',
  engineHoist: 'Engine hoist',
  transmissionJack: 'Transmission jack',
  tireChanger: 'Tyre changer',
};

export interface AssemblyContext {
  sockets: Record<string, string>;
  /** hinge state per socket: 0 = closed, 1 = fully open */
  hinges: Record<string, number>;
  tools: Partial<Record<ToolId, boolean>>;
}

export interface Verdict {
  ok: boolean;
  reason?: string;
}

const OK: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

function isBlockedByClosedPanel(ctx: AssemblyContext, socket: string): Verdict {
  const s = TEMPLATE.sockets[socket];
  if (s.blockedBy && ctx.sockets[s.blockedBy] && (ctx.hinges[s.blockedBy] ?? 0) < 0.6) {
    return no(`Open the ${TEMPLATE.sockets[s.blockedBy].label.toLowerCase()} first`);
  }
  return OK;
}

/** Can `partId` go into `socket` right now? Returns a one-line reason when not. */
export function canAttach(ctx: AssemblyContext, socket: string, partId: string): Verdict {
  const s = TEMPLATE.sockets[socket];
  const part: Part | undefined = PART_BY_ID[partId];
  if (!s || !part) return no('Unknown part');
  if (part.slot !== s.slot) return no(`${part.name} doesn't fit ${s.label.toLowerCase()}`);
  for (const req of s.requires) {
    if (!ctx.sockets[req]) return no(`Fit ${TEMPLATE.sockets[req].label.toLowerCase()} first`);
  }
  const blocked = isBlockedByClosedPanel(ctx, socket);
  if (!blocked.ok) return blocked;
  if (s.tool && !ctx.tools[s.tool]) return no(`Needs the ${TOOL_LABEL[s.tool].toLowerCase()}`);

  const engine = ctx.sockets.engine_bay ? PART_BY_ID[ctx.sockets.engine_bay]?.stats.engine : undefined;
  const isEv = engine?.kind === 'ev';
  if (s.slot === 'exhaust' && isEv) return no('Electric motors have no exhaust');
  if ((s.slot === 'forced' || s.slot === 'intake') && isEv) return no('Not compatible with an electric motor');
  if (s.slot === 'transmission' && engine) {
    const ev = !!part.stats.gearbox?.evOnly;
    if (ev && !isEv) return no('Single-speed reduction is for electric motors only');
    if (!ev && isEv) return no('Electric motor needs the single-speed reduction');
  }
  if (s.slot === 'engine' && ctx.sockets.transmission) {
    const gbEv = !!PART_BY_ID[ctx.sockets.transmission]?.stats.gearbox?.evOnly;
    if (gbEv !== (part.stats.engine?.kind === 'ev')) return no('Remove the transmission first (wrong type for this engine)');
  }
  if (s.slot === 'engine' && part.stats.engine?.kind === 'ev' && (ctx.sockets.exhaust || ctx.sockets.forced_induction)) {
    return no('Remove the exhaust and forced induction first');
  }
  return OK;
}

/** Sockets whose parts depend on `socket` being filled. */
export function dependents(socket: string): string[] {
  return SOCKET_NAMES.filter((n) => TEMPLATE.sockets[n].requires.includes(socket));
}

export function canRemove(ctx: AssemblyContext, socket: string): Verdict {
  if (!ctx.sockets[socket]) return no('Nothing fitted');
  const blocking = dependents(socket).filter((d) => ctx.sockets[d]);
  if (blocking.length) return no(`Remove ${TEMPLATE.sockets[blocking[0]].label.toLowerCase()} first`);
  const blocked = isBlockedByClosedPanel(ctx, socket);
  if (!blocked.ok) return blocked;
  const tool = TEMPLATE.sockets[socket].tool;
  if (tool && !ctx.tools[tool]) return no(`Needs the ${TOOL_LABEL[tool].toLowerCase()}`);
  return OK;
}

/** Replacing a fitted part in place keeps dependents valid; only access + tools matter. */
export function canSwap(ctx: AssemblyContext, socket: string): Verdict {
  const blocked = isBlockedByClosedPanel(ctx, socket);
  if (!blocked.ok) return blocked;
  const s = TEMPLATE.sockets[socket];
  if (s.tool && !ctx.tools[s.tool]) return no(`Needs the ${TOOL_LABEL[s.tool].toLowerCase()}`);
  if (s.slot === 'wheel' && !ctx.tools.tireChanger) return no('Tyre swap needs the tyre changer');
  return OK;
}

/**
 * Candidate sockets for a part, best first: empty + valid → occupied + valid (swap) → invalid.
 * Ties broken by distance to `near` (car-space point, e.g. the camera target).
 */
export function rankSockets(ctx: AssemblyContext, partId: string, near?: [number, number, number]) {
  const part = PART_BY_ID[partId];
  if (!part) return [];
  const cands = SOCKET_NAMES.filter((n) => TEMPLATE.sockets[n].slot === part.slot);
  const dist = (n: string) => {
    if (!near) return 0;
    const p = TEMPLATE.sockets[n].pos;
    return Math.hypot(p[0] - near[0], p[1] - near[1], p[2] - near[2]);
  };
  return cands
    .map((socket) => {
      const occupied = !!ctx.sockets[socket];
      const same = ctx.sockets[socket] === partId;
      const v = canAttach(ctx, socket, partId);
      const swap = occupied ? canSwap(ctx, socket) : OK;
      const verdict: Verdict = same ? no('Already fitted') : !v.ok ? v : occupied && !swap.ok ? swap : OK;
      const score = (verdict.ok ? 0 : 100) + (occupied ? 10 : 0) + dist(socket);
      return { socket, verdict, occupied, score };
    })
    .sort((a, b) => a.score - b.score);
}

/** Stage-ordered list of the next sockets the player could fill (for onboarding & hints). */
export function nextSteps(ctx: AssemblyContext): string[] {
  return SOCKET_NAMES.filter((n) => !ctx.sockets[n] && TEMPLATE.sockets[n].requires.every((r) => ctx.sockets[r])).sort(
    (a, b) => TEMPLATE.sockets[a].stage - TEMPLATE.sockets[b].stage,
  );
}
