import { create } from 'zustand';

interface Progress {
  loaded: number;
  total: number;
  inflight: number;
  add: (total: number) => void;
  tick: (bytes: number) => void;
  done: () => void;
}

/** Real byte progress (MB loaded / MB total) across all GLB fetches. */
export const useProgress = create<Progress>((set) => ({
  loaded: 0,
  total: 0,
  inflight: 0,
  add: (total) => set((s) => ({ total: s.total + total, inflight: s.inflight + 1 })),
  tick: (bytes) => set((s) => ({ loaded: s.loaded + bytes })),
  done: () => set((s) => ({ inflight: Math.max(0, s.inflight - 1) })),
}));
