import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { Detailed } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { suspend } from 'suspend-react';
import { assetUrl, resolveAsset, type AssetEntry } from './manifest';
import { useProgress } from './progress';
import { dedupeMaterial } from '../scene/materials';

const BASE = import.meta.env.BASE_URL;

// Initialised once: meshopt decoder + KTX2 transcoder (runs in a Web Worker inside KTX2Loader).
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
let ktx2: KTX2Loader | null = null;

export function initLoaders(gl: THREE.WebGLRenderer) {
  if (ktx2) return;
  ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}basis/`).setWorkerLimit(2).detectSupport(gl);
  gltfLoader.setKTX2Loader(ktx2);
}

const cache = new Map<string, Promise<GLTF>>();

/** Streams the GLB with real byte progress, then parses. Cached per URL (Service Worker caches across sessions). */
export function loadGltf(url: string, expectedBytes = 0): Promise<GLTF> {
  let p = cache.get(url);
  if (p) return p;
  const prog = useProgress.getState();
  prog.add(expectedBytes);
  p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`${res.status} ${url}`);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.byteLength;
        if (got <= expectedBytes || !expectedBytes) useProgress.getState().tick(value.byteLength);
      }
      const buf = new Uint8Array(got);
      let o = 0;
      for (const c of chunks) {
        buf.set(c, o);
        o += c.byteLength;
      }
      const gltf = await gltfLoader.parseAsync(buf.buffer, url.replace(/[^/]+$/, ''));
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          m.material = Array.isArray(m.material) ? m.material.map(dedupeMaterial) : dedupeMaterial(m.material);
        }
      });
      return gltf;
    } finally {
      useProgress.getState().done();
    }
  })();
  cache.set(url, p);
  return p;
}

/** Prefetch assets without rendering (adjacent-zone idle preload). */
export function prefetch(entries: AssetEntry[]) {
  for (const e of entries) loadGltf(assetUrl(e, 0), e.bytes[0]).catch(() => {});
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface FitSpec {
  size: [number, number, number];
  clamp?: [number, number];
}

interface ModelProps {
  entry: AssetEntry;
  lod: number;
  fit?: FitSpec;
  paint?: THREE.Material;
}

const GLASS = /glass|window|lens|windshield|windscreen/i;
const KEEP = /rubber|tire|tyre|chrome|metal|steel|black|trim|plastic|light|lamp|carbon/i;

function GltfModel({ entry, lod, fit, paint }: ModelProps) {
  const url = assetUrl(entry, lod);
  const gltf = suspend(() => loadGltf(url, entry.bytes[lod] ?? 0), [url]);
  const obj = useMemo(() => {
    const root = gltf.scene.clone(true);
    if (paint) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.transparent || GLASS.test(mat.name) || KEEP.test(mat.name)) return;
        m.material = paint;
      });
    }
    if (!fit) return root;
    // Auto-fit: centre bbox on the socket, uniform scale toward the socket's target size, clamped 0.85–1.15.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const ratios = [fit.size[0] / size.x, fit.size[1] / size.y, fit.size[2] / size.z].filter((r) => Number.isFinite(r) && r > 0);
    const [lo, hi] = fit.clamp ?? [0.85, 1.15];
    const s = Math.min(hi, Math.max(lo, Math.min(...ratios)));
    const wrap = new THREE.Group();
    root.position.sub(centre);
    wrap.add(root);
    wrap.scale.setScalar(s);
    return wrap;
  }, [gltf, fit, paint]);
  return <primitive object={obj} />;
}

export interface AssetModelProps {
  id: string;
  match?: string;
  fallback: ReactNode;
  fit?: FitSpec;
  paint?: THREE.Material;
  /** Use LOD files when the asset has them. */
  lods?: boolean;
  distances?: number[];
}

/** Renders a pipeline GLB (with LODs) when present in manifest.json, else the procedural fallback. Never loads raw GLBs. */
export function AssetModel({ id, match, fallback, fit, paint, lods = true, distances = [0, 6, 15] }: AssetModelProps) {
  const entry = resolveAsset(id, match);
  if (!entry) return <>{fallback}</>;
  const levels = lods ? entry.files.length : 1;
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        {levels > 1 ? (
          <Detailed distances={distances.slice(0, levels)}>
            {entry.files.map((_, i) => (
              <GltfModel key={i} entry={entry} lod={i} fit={fit} paint={paint} />
            ))}
          </Detailed>
        ) : (
          <GltfModel entry={entry} lod={0} fit={fit} paint={paint} />
        )}
      </Suspense>
    </Boundary>
  );
}
