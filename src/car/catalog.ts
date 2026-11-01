import partsJson from '../data/parts.json';
import templateJson from '../data/car-templates.json';

export type Vec3 = [number, number, number];

export interface EngineSpec {
  kind: 'v6' | 'v8' | 'v12' | 'ev';
  peakHp: number;
  peakHpRpm: number;
  peakNm: number;
  peakNmRpm: number;
  redline: number;
  idle: number;
  batteryMass?: number;
}

export interface GearboxSpec {
  drive: 'RWD' | 'AWD' | 'FWD';
  ratios: number[];
  final: number;
  shiftTime: number;
  efficiency: number;
  evOnly?: boolean;
}

export interface PartStats {
  engine?: EngineSpec;
  gearbox?: GearboxSpec;
  powerMul?: number;
  spoolLag?: number;
  spoolRpm?: number;
  efficiency?: number;
  stiffness?: number;
  rideHeight?: number;
  brakeFactor?: number;
  caliper?: string;
  mu?: number;
  tire?: string;
  rim?: string;
  handling?: number;
  launch?: number;
  cd?: number;
  cdDelta?: number;
  downforce?: number;
  comHeight?: number;
}

export interface Part {
  id: string;
  name: string;
  slot: string;
  price: number;
  mass: number;
  match?: string;
  kit?: 'a' | 'b' | 'c';
  unlock: 'start' | 'job';
  note?: string;
  stats: PartStats;
}

export interface Hinge {
  pivot: Vec3;
  axis: Vec3;
  min: number;
  max: number;
}

export interface Socket {
  slot: string;
  stage: number;
  pos: Vec3;
  rot?: Vec3;
  size: Vec3;
  requires: string[];
  tool?: 'impactWrench' | 'engineHoist' | 'transmissionJack' | 'tireChanger';
  blockedBy?: string;
  label: string;
  mirror?: boolean;
  hinge?: Hinge;
}

export interface SocketOverride {
  offset: Vec3;
  rotation: Vec3; // degrees
  scale: number;
}

export interface Kit {
  name: string;
  cd: number;
  verified: boolean;
  sockets: Record<string, string>;
}

export interface CarTemplate {
  frame: string;
  frameMass: number;
  wheelbase: number;
  sockets: Record<string, Socket>;
  /** overrides[socket][partId] — saved by the /lab Fit-Check tool */
  overrides: Record<string, Record<string, SocketOverride>>;
  kits: Record<string, Kit>;
}

export const PARTS: Part[] = (partsJson as { parts: Part[] }).parts;
export const PART_BY_ID: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]));

const LAB_KEY = 'torque-house:lab-overrides';
function loadTemplate(): CarTemplate {
  const t = structuredClone(templateJson) as unknown as CarTemplate;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LAB_KEY) : null;
    if (raw) {
      const o = JSON.parse(raw) as CarTemplate['overrides'];
      for (const [s, byPart] of Object.entries(o)) t.overrides[s] = { ...(t.overrides[s] ?? {}), ...byPart };
    }
  } catch {
    /* storage unavailable */
  }
  return t;
}
export const TEMPLATE: CarTemplate = loadTemplate();
export const SOCKET_NAMES = Object.keys(TEMPLATE.sockets);

export function saveLabOverrides(o: CarTemplate['overrides']) {
  TEMPLATE.overrides = o;
  try {
    localStorage.setItem(LAB_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export const SLOT_LABEL: Record<string, string> = {
  axle: 'Axles', diff: 'Differential', strut: 'Suspension', brake: 'Brakes', wheel: 'Wheels', engine: 'Engines',
  forced: 'Forced induction', intake: 'Intake', transmission: 'Transmission', exhaust: 'Exhaust', seat: 'Seats',
  seatRear: 'Rear seat', dashboard: 'Dashboard', steering: 'Steering', hood: 'Hood', trunk: 'Trunk',
  doorFront: 'Front doors', doorRear: 'Rear doors', fenderFront: 'Fenders', fenderRear: 'Quarter panels',
  bumperF: 'Front bumper', bumperR: 'Rear bumper', grille: 'Grille', headlight: 'Headlights', taillight: 'Taillights',
  roof: 'Roof', windscreen: 'Glass', mirror: 'Mirrors', skirt: 'Side skirts', spoiler: 'Spoilers',
};

export const SLOT_ORDER = Object.keys(SLOT_LABEL);

export function socketsForSlot(slot: string): string[] {
  return SOCKET_NAMES.filter((s) => TEMPLATE.sockets[s].slot === slot);
}

export function engineOf(sockets: Record<string, string>): EngineSpec | undefined {
  const id = sockets.engine_bay;
  return id ? PART_BY_ID[id]?.stats.engine : undefined;
}

export const formatINR = (n: number) => {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '−' : ''}₹${rest ? rest + ',' : ''}${last3}`;
};
