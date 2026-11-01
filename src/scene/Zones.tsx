import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';
import zonesJson from '../data/zones.json';
import { AssetModel, prefetch } from '../assets/loader';
import { resolveAsset, type AssetEntry } from '../assets/manifest';
import { ProcProp, type Fallback } from './props';
import { MAT } from './materials';
import { anim } from './anim';
import { isUnlockedZone, useGame } from '../store/game';
import { PhysicsProp } from './Physics';

export interface PropDef {
  asset: string;
  pos: [number, number, number];
  rotY: number;
  fallback: Fallback;
  instances?: [number, number, number][];
  dynamic?: boolean;
  role?: string;
}
export interface ZoneDef {
  id: string;
  name: string;
  center: [number, number];
  size: [number, number];
  station: string | null;
  unlock: string;
  enclosed?: boolean;
  adj: string[];
  camera: { pos: [number, number, number]; target: [number, number, number] };
  props: PropDef[];
}

export const ZONES = (zonesJson as unknown as { zones: ZoneDef[] }).zones;
export const SHELL_PROPS = (zonesJson as unknown as { shell: { props: PropDef[] } }).shell.props;
export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export const isMobile = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function zoneDistance(a: string, b: string) {
  if (a === b) return 0;
  const seen = new Set([a]);
  let frontier = [a];
  for (let d = 1; d < 8; d++) {
    const next: string[] = [];
    for (const z of frontier) for (const n of ZONE_BY_ID[z].adj) if (!seen.has(n)) { if (n === b) return d; seen.add(n); next.push(n); }
    frontier = next;
  }
  return 99;
}

const DEG = Math.PI / 180;

/** Procedural instancing recipes for FILL props (pallets, drums, bottles, extinguishers). */
const INSTANCE_RECIPES: Record<string, { geo: THREE.BufferGeometry; mat: (fb: Fallback) => THREE.Material; parts: [number, number, number][] }[]> = {
  pallet: [
    { geo: new THREE.BoxGeometry(0.1, 0.1, 1.2), mat: () => MAT.wood, parts: [[-0.5, 0.05, 0], [0, 0.05, 0], [0.5, 0.05, 0]] },
    { geo: new THREE.BoxGeometry(1.0, 0.022, 0.12), mat: () => MAT.wood, parts: [[0, 0.11, -0.5], [0, 0.11, -0.25], [0, 0.11, 0], [0, 0.11, 0.25], [0, 0.11, 0.5]] },
  ],
  drum: [{ geo: new THREE.CylinderGeometry(0.29, 0.29, 0.88, 20), mat: (fb) => colorMat(fb.color ?? '#3a4148'), parts: [[0, 0.44, 0]] }],
  extinguisher: [
    { geo: new THREE.CylinderGeometry(0.08, 0.08, 0.5, 14), mat: () => MAT.red, parts: [[0, 0.25, 0]] },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), mat: () => MAT.plastic, parts: [[0, 0.54, 0]] },
  ],
  cylinder: [{ geo: new THREE.CylinderGeometry(0.5, 0.5, 1, 14), mat: (fb) => colorMat(fb.color ?? '#555'), parts: [[0, 0.5, 0]] }],
};
const cm = new Map<string, THREE.Material>();
function colorMat(c: string) {
  if (!cm.has(c)) cm.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3 }));
  return cm.get(c)!;
}

function InstancedProp({ def }: { def: PropDef }) {
  const entry = resolveAsset(def.asset);
  const recipe = INSTANCE_RECIPES[def.fallback.kind];
  if (entry || !recipe) {
    // GLB FILL assets are flattened/joined by the pipeline → cheap per-instance clones share geometry + material.
    return (
      <>
        {def.instances!.map((p, i) => (
          <group key={i} position={p} rotation={[0, def.rotY * DEG, 0]}>
            <AssetModel id={def.asset} lods={false} fallback={<ProcProp fb={def.fallback} />} />
          </group>
        ))}
      </>
    );
  }
  const scale = def.fallback.kind === 'cylinder' ? def.fallback.size ?? [0.3, 0.5, 0.3] : [1, 1, 1];
  return (
    <>
      {recipe.map((r, ri) => (
        <Instances key={ri} geometry={r.geo} material={r.mat(def.fallback)} castShadow receiveShadow limit={64}>
          {def.instances!.flatMap((p, i) =>
            r.parts.map((lp, j) => (
              <Instance
                key={`${i}-${j}`}
                position={[p[0] + lp[0] * scale[0], p[1] + lp[1] * scale[1], p[2] + lp[2] * scale[2]]}
                scale={def.fallback.kind === 'cylinder' ? [scale[0], scale[1], scale[2]] : 1}
                rotation={[0, def.rotY * DEG, 0]}
              />
            )),
          )}
        </Instances>
      ))}
    </>
  );
}

export function Prop({ def }: { def: PropDef }) {
  if (def.instances) return <InstancedProp def={def} />;
  if (def.dynamic) return <PhysicsProp def={def} />;
  return (
    <group position={def.pos} rotation={[0, def.rotY * DEG, 0]}>
      <AssetModel id={def.asset} fallback={<ProcProp fb={def.fallback} />} />
    </group>
  );
}

/** Floor-painted zone label: canvas texture (no font download). */
function ZoneLabel({ z, locked }: { z: ZoneDef; locked: boolean }) {
  const text = `${z.id} · ${z.name.toUpperCase()}${locked ? ' · LOCKED' : ''}`;
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    const c = cv.getContext('2d')!;
    const font = '600 56px "Inter Tight", system-ui, sans-serif';
    c.font = font;
    const w = Math.ceil(c.measureText(text).width + 8);
    cv.width = w + text.length * 8;
    cv.height = 72;
    c.font = font;
    c.letterSpacing = '8px';
    c.fillStyle = locked ? '#55585d' : '#F2C230';
    c.textBaseline = 'middle';
    c.fillText(text, 4, 38);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, locked]);
  const h = 0.22;
  const w = (h * tex.image.width) / tex.image.height;
  return (
    <mesh position={[z.center[0] - z.size[0] / 2 + 0.3 + w / 2, 0.004, z.center[1] + z.size[1] / 2 - 0.3 - h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent opacity={0.75} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Paint booth: enclosed walls (occluders), emissive ceiling panel. Interior hidden while the camera is outside. */
function BoothShell({ z, children }: { z: ZoneDef; children: React.ReactNode }) {
  const interior = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const [x0, x1] = [z.center[0] - z.size[0] / 2, z.center[0] + z.size[0] / 2];
  const [z0, z1] = [z.center[1] - z.size[1] / 2, z.center[1] + z.size[1] / 2];
  useFrame(() => {
    const p = camera.position;
    anim.inBooth = p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y < 3.4;
    if (interior.current) interior.current.visible = anim.inBooth;
  });
  const h = 3.4;
  const wall = (pos: [number, number, number], size: [number, number, number]) => (
    <mesh position={pos} material={MAT.white} receiveShadow castShadow>
      <boxGeometry args={size} />
    </mesh>
  );
  return (
    <group>
      {wall([x0 + 0.05, h / 2, z.center[1]], [0.1, h, z.size[1]])}
      {wall([x1 - 0.05, h / 2, z.center[1]], [0.1, h, z.size[1]])}
      {wall([x0 + 0.3, h / 2, z1 - 0.05], [0.6, h, 0.1])}
      {wall([x1 - 0.3, h / 2, z1 - 0.05], [0.6, h, 0.1])}
      {wall([z.center[0], 3.0, z1 - 0.05], [z.size[0] - 1.2, 0.8, 0.1])}
      {/* PVC strip curtain over the car opening */}
      <mesh position={[z.center[0], 1.3, z1 - 0.05]}>
        <boxGeometry args={[z.size[0] - 1.2, 2.6, 0.02]} />
        <meshStandardMaterial color="#9fb3c8" transparent opacity={0.18} roughness={0.1} depthWrite={false} />
      </mesh>
      {wall([z.center[0], h + 0.05, z.center[1]], [z.size[0], 0.1, z.size[1]])}
      <mesh position={[z.center[0], h - 0.02, z.center[1]]} rotation={[Math.PI / 2, 0, 0]} material={MAT.boothLight}>
        <planeGeometry args={[z.size[0] - 1.2, z.size[1] - 1.6]} />
      </mesh>
      <group ref={interior}>
        <pointLight position={[z.center[0], h - 0.4, z.center[1]]} intensity={14} distance={7} decay={1.6} color="#ffffff" />
        {children}
      </group>
      {/* exhaust grates on the floor */}
      <mesh position={[z.center[0], 0.004, z.center[1]]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.steelDark}>
        <planeGeometry args={[z.size[0] - 1.2, z.size[1] - 1.2]} />
      </mesh>
    </group>
  );
}

function Zone({ z }: { z: ZoneDef }) {
  const locked = useGame((s) => !isUnlockedZone(s, z.id));
  const props = z.props.map((p, i) => <Prop key={i} def={p} />);
  return (
    <group name={`zone-${z.id}`}>
      <ZoneLabel z={z} locked={locked} />
      {locked && (
        <mesh position={[z.center[0], 0.006, z.center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[z.size[0] - 0.4, z.size[1] - 0.4]} />
          <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {z.enclosed ? <BoothShell z={z}>{props}</BoothShell> : props}
    </group>
  );
}

/**
 * Lazy zones: render the zone the player is in; preload + mount adjacent zones at idle (requestIdleCallback);
 * on mobile, unmount zones more than two hops away.
 */
export function ZoneManager() {
  const current = useGame((s) => s.ui.zone);
  const [mounted, setMounted] = useState<string[]>([current]);

  useEffect(() => {
    const mobile = isMobile();
    setMounted((m) => {
      let next = m.includes(current) ? m : [...m, current];
      if (mobile) next = next.filter((id) => zoneDistance(current, id) <= 2);
      return next;
    });
    const ric: (cb: () => void) => number = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb) => window.setTimeout(cb, 200));
    const queue = [...ZONE_BY_ID[current].adj];
    // Desktop: keep expanding outward so the whole room fills in during idle time.
    if (!mobile) for (const z of ZONES) if (!queue.includes(z.id) && z.id !== current) queue.push(z.id);
    let cancelled = false;
    const step = () => {
      if (cancelled || !queue.length) return;
      const id = queue.shift()!;
      const entries = ZONE_BY_ID[id].props.map((p) => resolveAsset(p.asset)).filter(Boolean) as AssetEntry[];
      prefetch(entries);
      setMounted((m) => (m.includes(id) ? m : [...m, id]));
      ric(step);
    };
    ric(step);
    return () => {
      cancelled = true;
    };
  }, [current]);

  const zones = useMemo(() => ZONES.filter((z) => mounted.includes(z.id)), [mounted]);
  return (
    <group>
      {zones.map((z) => (
        <Zone key={z.id} z={z} />
      ))}
      {SHELL_PROPS.map((p, i) => (
        <Prop key={i} def={p} />
      ))}
    </group>
  );
}
