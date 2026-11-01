import { create } from 'zustand';
import type { DynoSample } from './dyno';

interface DynoState {
  samples: DynoSample[];
  running: boolean;
  peakHp: number;
  peakNm: number;
  redline: number;
  set: (p: Partial<DynoState>) => void;
}

/** Live dyno chart data (updated ~30 Hz from the dyno controller). */
export const useDyno = create<DynoState>((set) => ({
  samples: [],
  running: false,
  peakHp: 0,
  peakNm: 0,
  redline: 8000,
  set: (p) => set(p),
}));
