import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PART_BY_ID, PARTS, TEMPLATE } from '../car/catalog';
import { canAttach, canRemove, canSwap, rankSockets, type AssemblyContext, type ToolId } from '../car/assembly';
import jobsJson from '../data/jobs.json';
import { computeStats } from '../sim/stats';
import { sfx } from '../audio/sfx';

export type Mode = 'menu' | 'build' | 'modify' | 'free';
export type Station = 'lift' | 'build' | 'booth' | 'dyno';
export type Panel = 'none' | 'jobs' | 'shop' | 'paint' | 'saves' | 'credits' | 'upgrades';

export interface Paint {
  color: string;
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  flake: boolean;
}

export interface CarState {
  sockets: Record<string, string>;
  worn: string[];
  paint: Paint;
  hinges: Record<string, number>;
  station: Station;
}

export interface Objective {
  type: 'noWorn' | 'braking' | 'powerGain' | 'tireGrip' | 'paint' | 'zeroHundred' | 'handling' | 'engineKind' | 'quarterMile' | 'massMax' | 'topSpeed';
  max?: number; min?: number; hp?: number; kg?: number; color?: string; metallic?: boolean; kind?: string;
}
export interface Job {
  id: string; customer: string; title: string; brief: string;
  car: { kit: string; paint: string; worn?: string[] };
  budget: number; requiresZone?: string; objectives: Objective[]; reward: number; unlocks: string[];
}
export const JOBS: Job[] = (jobsJson as { jobs: Job[] }).jobs;

export const ZONE_UPGRADES: { zone: string; name: string; price: number }[] = [
  { zone: 'E', name: 'Paint Booth', price: 150000 },
  { zone: 'G', name: 'Dyno Bay', price: 250000 },
  { zone: 'B', name: 'Service Bay 2 · Build', price: 400000 },
];

export const ZONE_TOOLS: Record<ToolId, string> = {
  impactWrench: 'A', engineHoist: 'C', transmissionJack: 'B', tireChanger: 'D',
};

export interface AttachFx {
  socket: string;
  kind: 'snap' | 'hoist' | 'bolts';
  at: number;
}

export interface LoosePart {
  key: number;
  partId: string;
  pos: [number, number, number];
}

export const DEFAULT_PAINT: Paint = { color: '#8a1c1c', metallic: 0.75, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, flake: true };
const START_MONEY = 300000;

interface Career {
  money: number;
  zones: string[];
  unlockedParts: string[];
  inventory: Record<string, number>;
  completed: string[];
  activeJob: string | null;
  jobSpend: number;
  jobBaselineHp: number;
}

interface UI {
  inventoryOpen: boolean;
  selectedPart: string | null;
  ghostSocket: string | null;
  ghostIndex: number;
  focusSocket: string | null;
  hoverSocket: string | null;
  zone: string;
  cameraMode: 'orbit' | 'walk' | 'dyno';
  panel: Panel;
  toast: { text: string; tone: 'info' | 'warn' | 'good'; at: number } | null;
  onboarding: number; // -1 = done/off
  liftTarget: number; // 0..1
  dynoRunning: boolean;
  spraying: boolean;
  quality: 'high' | 'low';
  menuOpen: boolean;
}

export interface GameState {
  mode: Mode;
  career: Career;
  car: CarState;
  ui: UI;
  spray: { from: string; coverage: number };
  fx: AttachFx[];
  loose: LoosePart[];
  shadowVersion: number;

  newGame: (mode: Exclude<Mode, 'menu'>) => void;
  toMenu: () => void;
  startJob: (id: string) => void;
  completeJob: () => void;
  abandonJob: () => void;

  selectPart: (id: string | null) => void;
  cycleGhost: (dir?: number) => void;
  confirmAttach: () => void;
  attach: (socket: string, partId: string) => boolean;
  remove: (socket: string, how: 'inventory' | 'sell' | 'drop') => boolean;
  pickupLoose: (key: number) => void;
  buyPart: (id: string) => boolean;

  setHinge: (socket: string, v: number) => void;
  toggleHinge: (socket: string) => void;
  setPaint: (p: Partial<Paint>) => void;
  setPaintTarget: (color: string) => void;
  sprayTick: (dt: number) => void;
  setStation: (s: Station) => void;
  buyZone: (zone: string) => void;

  setUI: (p: Partial<UI>) => void;
  toast: (text: string, tone?: 'info' | 'warn' | 'good') => void;
  bumpShadows: () => void;
  importBuild: (json: string) => boolean;
  exportBuild: () => string;
}

export const isUnlockedZone = (s: Pick<GameState, 'mode' | 'career'>, zone: string) =>
  s.mode === 'free' || s.career.zones.includes(zone);

export function toolsFor(s: Pick<GameState, 'mode' | 'career'>): Partial<Record<ToolId, boolean>> {
  const out: Partial<Record<ToolId, boolean>> = {};
  for (const [tool, zone] of Object.entries(ZONE_TOOLS) as [ToolId, string][]) out[tool] = isUnlockedZone(s, zone);
  return out;
}

export function ctxOf(s: GameState): AssemblyContext {
  return { sockets: s.car.sockets, hinges: s.car.hinges, tools: toolsFor(s) };
}

export function partUnlocked(s: Pick<GameState, 'mode' | 'career'>, id: string) {
  const p = PART_BY_ID[id];
  return s.mode === 'free' || p?.unlock === 'start' || s.career.unlockedParts.includes(id);
}

const freshCareer = (): Career => ({
  money: START_MONEY, zones: ['A', 'C', 'D', 'F', 'H'], unlockedParts: [], inventory: {}, completed: [],
  activeJob: null, jobSpend: 0, jobBaselineHp: 0,
});

const bareCar = (station: Station): CarState => ({ sockets: {}, worn: [], paint: { ...DEFAULT_PAINT }, hinges: {}, station });
const kitCar = (kit: string, paint: string, worn: string[] = []): CarState => ({
  sockets: { ...TEMPLATE.kits[kit].sockets }, worn: [...worn], paint: { ...DEFAULT_PAINT, color: paint }, hinges: {}, station: 'lift',
});

let looseKey = 1;

function hexDist(a: string, b: string) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const d = [16, 8, 0].map((sh) => ((pa >> sh) & 255) - ((pb >> sh) & 255));
  return Math.hypot(d[0], d[1], d[2]);
}

export function checkObjective(o: Objective, s: GameState): { ok: boolean; label: string; value: string } {
  const st = computeStats({ sockets: s.car.sockets, worn: s.car.worn });
  switch (o.type) {
    case 'noWorn': return { ok: s.car.worn.length === 0, label: 'Replace worn parts', value: `${s.car.worn.length} worn` };
    case 'braking': return { ok: st.braking <= o.max!, label: `100–0 ≤ ${o.max} m`, value: `${st.braking.toFixed(1)} m` };
    case 'powerGain': return { ok: st.hp >= s.career.jobBaselineHp + o.hp! - 0.5, label: o.hp ? `+${o.hp} hp` : 'Keep stock power', value: `${st.hp - s.career.jobBaselineHp >= 0 ? '+' : ''}${(st.hp - s.career.jobBaselineHp).toFixed(0)} hp` };
    case 'tireGrip': return { ok: st.mu >= o.min! - 1e-6, label: `Tyre μ ≥ ${o.min}`, value: `μ ${st.mu.toFixed(2)}` };
    case 'paint': return { ok: hexDist(s.car.paint.color, o.color!) < 60 && (!o.metallic || s.car.paint.metallic >= 0.5) && s.spray.coverage >= 0.98, label: `Paint ${o.color}${o.metallic ? ' metallic' : ''}`, value: s.car.paint.color };
    case 'zeroHundred': return { ok: st.zeroHundred <= o.max!, label: `0–100 ≤ ${o.max} s`, value: Number.isFinite(st.zeroHundred) ? `${st.zeroHundred.toFixed(2)} s` : '—' };
    case 'handling': return { ok: st.handling >= o.min!, label: `Handling ≥ ${o.min}`, value: `${st.handling}` };
    case 'engineKind': return { ok: PART_BY_ID[s.car.sockets.engine_bay]?.stats.engine?.kind === o.kind, label: `Engine: ${o.kind?.toUpperCase()}`, value: PART_BY_ID[s.car.sockets.engine_bay]?.name ?? '—' };
    case 'quarterMile': return { ok: st.quarterMile <= o.max!, label: `¼ mile ≤ ${o.max} s`, value: Number.isFinite(st.quarterMile) ? `${st.quarterMile.toFixed(2)} s` : '—' };
    case 'massMax': return { ok: st.mass <= o.kg!, label: `Mass ≤ ${o.kg} kg`, value: `${st.mass.toFixed(0)} kg` };
    case 'topSpeed': return { ok: st.topKmh >= o.min!, label: `Top ≥ ${o.min} km/h`, value: `${st.topKmh.toFixed(0)} km/h` };
  }
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      mode: 'menu',
      career: freshCareer(),
      car: bareCar('build'),
      ui: {
        inventoryOpen: false, selectedPart: null, ghostSocket: null, ghostIndex: 0, focusSocket: null, hoverSocket: null,
        zone: 'B', cameraMode: 'orbit', panel: 'none', toast: null, onboarding: -1, liftTarget: 0, dynoRunning: false,
        spraying: false, quality: 'high', menuOpen: false,
      },
      spray: { from: DEFAULT_PAINT.color, coverage: 1 },
      fx: [],
      loose: [],
      shadowVersion: 0,

      newGame: (mode) => {
        if (mode === 'free') {
          set({ mode, car: kitCar('A', DEFAULT_PAINT.color), loose: [] });
          get().setStation('lift');
        } else if (mode === 'build') {
          const s = get();
          const firstBuild = !s.career.completed.length && !localStorage.getItem('torque-house:onboarded');
          set({ mode, car: bareCar('build'), loose: [], ui: { ...s.ui, onboarding: firstBuild ? 0 : -1 } });
          get().setStation('build');
        } else {
          set({ mode, ui: { ...get().ui, panel: 'jobs' } });
          get().setStation('lift');
        }
      },
      toMenu: () => set((s) => ({ mode: 'menu', ui: { ...s.ui, panel: 'none', inventoryOpen: false, selectedPart: null, ghostSocket: null, cameraMode: 'orbit' } })),

      startJob: (id) => {
        const job = JOBS.find((j) => j.id === id);
        if (!job) return;
        if (job.requiresZone && !get().career.zones.includes(job.requiresZone)) {
          get().toast(`Needs the ${ZONE_UPGRADES.find((z) => z.zone === job.requiresZone)?.name}`, 'warn');
          return;
        }
        const car = kitCar(job.car.kit, job.car.paint, job.car.worn);
        const baseline = computeStats({ sockets: car.sockets }).hp;
        set((s) => ({
          mode: 'modify', car, loose: [], spray: { from: car.paint.color, coverage: 1 },
          career: { ...s.career, activeJob: id, jobSpend: 0, jobBaselineHp: baseline },
          ui: { ...s.ui, panel: 'none' },
        }));
        get().setStation('lift');
        get().toast(`${job.customer}: “${job.brief}”`);
      },
      completeJob: () => {
        const s = get();
        const job = JOBS.find((j) => j.id === s.career.activeJob);
        if (!job) return;
        const results = job.objectives.map((o) => checkObjective(o, s));
        if (job.budget > 0 && s.career.jobSpend > job.budget) return get().toast('Over the customer’s budget', 'warn');
        if (!results.every((r) => r.ok)) return get().toast(`Not done: ${results.find((r) => !r.ok)!.label}`, 'warn');
        set({
          career: {
            ...s.career, money: s.career.money + job.reward, completed: [...new Set([...s.career.completed, job.id])],
            unlockedParts: [...new Set([...s.career.unlockedParts, ...job.unlocks])], activeJob: null,
          },
          ui: { ...s.ui, panel: 'jobs' },
        });
        sfx.play('cash');
        get().toast(`Job done · +₹${job.reward.toLocaleString('en-IN')}${job.unlocks.length ? ' · new part unlocked' : ''}`, 'good');
      },
      abandonJob: () => set((s) => ({ career: { ...s.career, activeJob: null }, ui: { ...s.ui, panel: 'jobs' } })),

      selectPart: (id) => {
        const s = get();
        if (!id) return set({ ui: { ...s.ui, selectedPart: null, ghostSocket: null, ghostIndex: 0 } });
        if (s.ui.selectedPart === id && s.ui.ghostSocket) return get().confirmAttach();
        const ranked = rankSockets(ctxOf(s), id, s.ui.focusSocket ? TEMPLATE.sockets[s.ui.focusSocket].pos : undefined);
        set({ ui: { ...s.ui, selectedPart: id, ghostSocket: ranked[0]?.socket ?? null, ghostIndex: 0 } });
      },
      cycleGhost: (dir = 1) => {
        const s = get();
        if (!s.ui.selectedPart) return;
        const ranked = rankSockets(ctxOf(s), s.ui.selectedPart);
        if (!ranked.length) return;
        const i = (s.ui.ghostIndex + dir + ranked.length) % ranked.length;
        set({ ui: { ...s.ui, ghostIndex: i, ghostSocket: ranked[i].socket } });
      },
      confirmAttach: () => {
        const s = get();
        const { selectedPart, ghostSocket } = s.ui;
        if (!selectedPart || !ghostSocket) return;
        if (get().attach(ghostSocket, selectedPart)) {
          const next = rankSockets(ctxOf(get()), selectedPart).find((r) => r.verdict.ok && !r.occupied);
          set((st) => ({ ui: { ...st.ui, ghostSocket: next?.socket ?? null, selectedPart: next ? selectedPart : null, ghostIndex: 0 } }));
        }
      },
      attach: (socket, partId) => {
        const s = get();
        const ctx = ctxOf(s);
        const occupied = s.car.sockets[socket];
        const v = canAttach(ctx, socket, partId);
        const sw = occupied ? canSwap(ctx, socket) : { ok: true };
        if (!v.ok || !sw.ok) {
          sfx.play('deny');
          get().toast((v.reason ?? sw.reason)!, 'warn');
          return false;
        }
        const part = PART_BY_ID[partId];
        const career = { ...s.career, inventory: { ...s.career.inventory } };
        if (s.mode !== 'free') {
          if (!partUnlocked(s, partId)) { get().toast('Part is locked — finish jobs to unlock', 'warn'); return false; }
          if ((career.inventory[partId] ?? 0) > 0) career.inventory[partId]--;
          else if (career.money >= part.price) { career.money -= part.price; career.jobSpend += part.price; }
          else { sfx.play('deny'); get().toast(`Not enough money (${part.name})`, 'warn'); return false; }
          if (occupied) career.inventory[occupied] = (career.inventory[occupied] ?? 0) + 1;
        }
        const kind: AttachFx['kind'] = part.slot === 'engine' ? 'hoist' : part.slot === 'wheel' ? 'bolts' : 'snap';
        set({
          career,
          car: { ...s.car, sockets: { ...s.car.sockets, [socket]: partId }, worn: s.car.worn.filter((w) => w !== socket) },
          fx: [...s.fx.filter((f) => f.socket !== socket), { socket, kind, at: performance.now() }],
          shadowVersion: s.shadowVersion + 1,
        });
        sfx.play(kind === 'bolts' ? 'impact' : 'snap');
        return true;
      },
      remove: (socket, how) => {
        const s = get();
        const v = canRemove(ctxOf(s), socket);
        if (!v.ok) { sfx.play('deny'); get().toast(v.reason!, 'warn'); return false; }
        const id = s.car.sockets[socket];
        const part = PART_BY_ID[id];
        const sockets = { ...s.car.sockets };
        delete sockets[socket];
        const career = { ...s.career, inventory: { ...s.career.inventory } };
        let loose = s.loose;
        if (how === 'sell' && s.mode !== 'free') {
          const worn = s.car.worn.includes(socket);
          const refund = Math.round(part.price * 0.4 * (worn ? 0.25 : 1));
          career.money += refund;
          career.jobSpend -= refund;
          get().toast(`Sold ${part.name} · +₹${refund.toLocaleString('en-IN')}`, 'good');
          sfx.play('cash');
        } else if (how === 'drop') {
          const cap = matchMedia?.('(pointer: coarse)').matches ? 25 : 60;
          const p = TEMPLATE.sockets[socket].pos;
          loose = [...s.loose, { key: looseKey++, partId: id, pos: [p[0] * 1.6, 1.2, p[2]] as [number, number, number] }].slice(-cap);
        } else if (s.mode !== 'free') {
          career.inventory[id] = (career.inventory[id] ?? 0) + 1;
        }
        set({
          career, loose,
          car: { ...s.car, sockets, worn: s.car.worn.filter((w) => w !== socket) },
          shadowVersion: s.shadowVersion + 1,
          ui: { ...s.ui, focusSocket: s.ui.focusSocket === socket ? null : s.ui.focusSocket },
        });
        sfx.play('ratchet');
        return true;
      },
      pickupLoose: (key) => {
        const s = get();
        const l = s.loose.find((x) => x.key === key);
        if (!l) return;
        const career = { ...s.career, inventory: { ...s.career.inventory } };
        if (s.mode !== 'free') career.inventory[l.partId] = (career.inventory[l.partId] ?? 0) + 1;
        set({ loose: s.loose.filter((x) => x.key !== key), career });
        get().toast(`${PART_BY_ID[l.partId].name} → inventory`);
      },
      buyPart: (id) => {
        const s = get();
        const p = PART_BY_ID[id];
        if (!p || !partUnlocked(s, id)) return false;
        if (s.career.money < p.price) { get().toast('Not enough money', 'warn'); return false; }
        set({ career: { ...s.career, money: s.career.money - p.price, jobSpend: s.career.jobSpend + p.price, inventory: { ...s.career.inventory, [id]: (s.career.inventory[id] ?? 0) + 1 } } });
        sfx.play('cash');
        return true;
      },

      setHinge: (socket, v) => set((s) => ({ car: { ...s.car, hinges: { ...s.car.hinges, [socket]: Math.min(1, Math.max(0, v)) } } })),
      toggleHinge: (socket) => {
        const cur = get().car.hinges[socket] ?? 0;
        get().setHinge(socket, cur > 0.5 ? 0 : 1);
        sfx.play('hinge');
      },
      setPaint: (p) => set((s) => ({ car: { ...s.car, paint: { ...s.car.paint, ...p } } })),
      setPaintTarget: (color) => set((s) => ({ spray: { from: s.spray.coverage >= 1 ? s.car.paint.color : s.spray.from, coverage: 0 }, car: { ...s.car, paint: { ...s.car.paint, color } } })),
      sprayTick: (dt) => set((s) => ({ spray: { ...s.spray, coverage: Math.min(1, s.spray.coverage + dt * 0.3) } })),
      setStation: (station) => {
        const zone = { lift: 'A', build: 'B', booth: 'E', dyno: 'G' }[station];
        set((s) => ({ car: { ...s.car, station }, ui: { ...s.ui, zone, cameraMode: station === 'dyno' ? 'dyno' : s.ui.cameraMode === 'dyno' ? 'orbit' : s.ui.cameraMode, liftTarget: 0 }, shadowVersion: s.shadowVersion + 1 }));
      },
      buyZone: (zone) => {
        const s = get();
        const up = ZONE_UPGRADES.find((z) => z.zone === zone);
        if (!up || s.career.zones.includes(zone)) return;
        if (s.career.money < up.price) return get().toast('Not enough money', 'warn');
        set({ career: { ...s.career, money: s.career.money - up.price, zones: [...s.career.zones, zone] } });
        sfx.play('cash');
        get().toast(`${up.name} unlocked`, 'good');
      },

      setUI: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
      toast: (text, tone = 'info') => set((s) => ({ ui: { ...s.ui, toast: { text, tone, at: Date.now() } } })),
      bumpShadows: () => set((s) => ({ shadowVersion: s.shadowVersion + 1 })),
      exportBuild: () => JSON.stringify({ format: 'torque-house/build@1', car: get().car }, null, 2),
      importBuild: (json) => {
        try {
          const d = JSON.parse(json);
          const car = d.car as CarState;
          if (!car?.sockets) throw new Error('bad');
          for (const [sock, id] of Object.entries(car.sockets)) if (!TEMPLATE.sockets[sock] || !PART_BY_ID[id]) delete car.sockets[sock];
          set((s) => ({ car: { ...bareCar(s.car.station), ...car, station: s.car.station }, mode: s.mode === 'menu' ? 'free' : s.mode }));
          get().toast('Build imported', 'good');
          return true;
        } catch {
          get().toast('Could not read that build file', 'warn');
          return false;
        }
      },
    }),
    {
      name: 'torque-house:save',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ mode: s.mode === 'menu' ? 'menu' : s.mode, career: s.career, car: s.car, spray: s.spray }),
      merge: (persisted, current) => {
        const p = persisted as Partial<GameState>;
        return { ...current, ...p, mode: 'menu', career: { ...current.career, ...(p.career ?? {}) }, car: { ...current.car, ...(p.car ?? {}) } };
      },
    },
  ),
);

export const ALL_PARTS = PARTS;
