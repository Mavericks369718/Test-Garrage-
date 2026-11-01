export interface AssetEntry {
  id: string;
  category: string;
  tier: 'HERO' | 'PART' | 'PROP' | 'FILL';
  tris: number[];
  bytes: number[];
  files: string[];
  hash: string;
  bbox: { min: number[]; max: number[]; size: number[] } | null;
  mass: number;
  density: number | null;
  joints: { node: string; type: string; parent?: string; pivot: number[]; axis: number[]; min: number; max: number; unit?: string }[];
  hasHulls: boolean;
  thumb: string | null;
}

export interface Manifest {
  version: number;
  generated: string | null;
  ktx2: boolean;
  assets: AssetEntry[];
}

const BASE = import.meta.env.BASE_URL;
let manifest: Manifest = { version: 1, generated: null, ktx2: false, assets: [] };
const byId = new Map<string, AssetEntry>();

export async function loadManifest(): Promise<Manifest> {
  try {
    const res = await fetch(`${BASE}assets/manifest.json`, { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch {
    /* offline / missing → procedural mode */
  }
  byId.clear();
  for (const a of manifest.assets) byId.set(a.id, a);
  return manifest;
}

export const getManifest = () => manifest;
export const hasAssets = () => manifest.assets.length > 0;

/**
 * Resolve an asset id. Exact id first; otherwise the first asset whose id matches `match` (regex) — the parts don't
 * come from one car, so ids in data files are best guesses and the lab is where fits get verified.
 */
export function resolveAsset(id: string, match?: string): AssetEntry | undefined {
  const hit = byId.get(id);
  if (hit || !match) return hit;
  const re = new RegExp(match, 'i');
  return manifest.assets.find((a) => re.test(a.id));
}

export const assetUrl = (entry: AssetEntry, lod = 0) =>
  `${BASE}${entry.files[Math.min(lod, entry.files.length - 1)]}?v=${entry.hash}`;
