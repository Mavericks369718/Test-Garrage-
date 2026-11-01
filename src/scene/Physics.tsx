import { Suspense, type ReactNode } from 'react';
import { CuboidCollider, ConvexHullCollider, Physics, RigidBody } from '@react-three/rapier';
import { suspend } from 'suspend-react';
import { AssetModel, loadGltf } from '../assets/loader';
import { assetUrl, resolveAsset, type AssetEntry } from '../assets/manifest';
import { PART_BY_ID, TEMPLATE } from '../car/catalog';
import { ProcPart } from '../car/ProcParts';
import { PaintProvider } from '../car/paint';
import { useGame } from '../store/game';
import { ProcProp } from './props';
import type { PropDef } from './Zones';

const DEG = Math.PI / 180;

/** Pull convex hulls out of the GLB's `extras.collisionHulls` (several encodings tolerated). */
function parseHulls(raw: unknown): Float32Array[] {
  const out: Float32Array[] = [];
  const push = (pts: unknown) => {
    if (!Array.isArray(pts)) return;
    const flat = (Array.isArray(pts[0]) ? (pts as number[][]).flat() : (pts as number[])).filter((n) => typeof n === 'number');
    if (flat.length >= 12) out.push(new Float32Array(flat));
  };
  if (Array.isArray(raw)) {
    for (const h of raw) {
      if (Array.isArray(h)) push(h);
      else if (h && typeof h === 'object') push((h as { points?: unknown; vertices?: unknown }).points ?? (h as { vertices?: unknown }).vertices);
    }
  }
  return out;
}

function GlbHulls({ entry }: { entry: AssetEntry }) {
  const gltf = suspend(() => loadGltf(assetUrl(entry, 0), entry.bytes[0]), [assetUrl(entry, 0)]);
  const hulls: Float32Array[] = [];
  gltf.scene.traverse((o) => hulls.push(...parseHulls(o.userData?.collisionHulls)));
  hulls.push(...parseHulls((gltf.parser.json as { extras?: { collisionHulls?: unknown } }).extras?.collisionHulls));
  if (!hulls.length) return <CuboidCollider args={entry.bbox ? (entry.bbox.size.map((s) => s / 2) as [number, number, number]) : [0.3, 0.3, 0.3]} />;
  return (
    <>
      {hulls.map((h, i) => (
        <ConvexHullCollider key={i} args={[h]} />
      ))}
    </>
  );
}

function DynamicBody({ entry, position, rotationY = 0, children, onClick }: { entry?: AssetEntry; position: [number, number, number]; rotationY?: number; children: ReactNode; onClick?: () => void }) {
  const hulls = entry?.hasHulls;
  return (
    <RigidBody
      type="dynamic"
      position={position}
      rotation={[0, rotationY, 0]}
      colliders={hulls ? false : 'hull'}
      canSleep
      linearDamping={0.6}
      angularDamping={0.8}
      friction={0.6}
    >
      {hulls && entry && (
        <Suspense fallback={null}>
          <GlbHulls entry={entry} />
        </Suspense>
      )}
      <group onClick={onClick && ((e) => (e.stopPropagation(), onClick()))}>{children}</group>
    </RigidBody>
  );
}

/** Carts, dollies, jacks — dynamic, convex colliders only (never trimesh). */
export function PhysicsProp({ def }: { def: PropDef }) {
  const entry = resolveAsset(def.asset);
  return (
    <DynamicBody entry={entry} position={[def.pos[0], def.pos[1] + 0.01, def.pos[2]]} rotationY={def.rotY * DEG}>
      <AssetModel id={def.asset} fallback={<ProcProp fb={def.fallback} />} />
    </DynamicBody>
  );
}

/** Parts removed with "drop" fall to the floor as dynamic bodies. Click one to put it back in inventory. */
export function LooseParts() {
  const loose = useGame((s) => s.loose);
  const station = useGame((s) => s.car.station);
  const base = { lift: [-9, 0, -4], build: [-3, 0, -4], booth: [8.5, 0, -5], dyno: [2.5, 0, -4.5] }[station];
  return (
    <PaintProvider>
      {loose.map((l) => {
        const part = PART_BY_ID[l.partId];
        const sock = Object.keys(TEMPLATE.sockets).find((s) => TEMPLATE.sockets[s].slot === part.slot)!;
        return (
          <DynamicBody key={l.key} entry={resolveAsset(part.id, part.match)} position={[base[0] + l.pos[0], l.pos[1], base[2] + l.pos[2]]} onClick={() => useGame.getState().pickupLoose(l.key)}>
            <ProcPart part={part} socket={TEMPLATE.sockets[sock]} name={sock} />
          </DynamicBody>
        );
      })}
    </PaintProvider>
  );
}

/** Rapier world: fixed step, paused while any menu/panel is open. Attached car parts are NOT simulated (kinematic children of the car). */
export function PhysicsWorld({ children }: { children: ReactNode }) {
  const paused = useGame((s) => s.mode === 'menu' || s.ui.panel !== 'none' || s.ui.menuOpen);
  return (
    <Physics paused={paused} timeStep={1 / 60} gravity={[0, -9.81, 0]}>
      <CuboidCollider args={[12, 0.1, 8]} position={[0, -0.1, 0]} />
      <CuboidCollider args={[12, 3, 0.1]} position={[0, 3, -8]} />
      <CuboidCollider args={[12, 3, 0.1]} position={[0, 3, 8.1]} />
      <CuboidCollider args={[0.1, 3, 8]} position={[-12, 3, 0]} />
      <CuboidCollider args={[0.1, 3, 8]} position={[12, 3, 0]} />
      {/* car body proxy so dropped parts don't fall through the car */}
      <CarProxy />
      {children}
    </Physics>
  );
}

function CarProxy() {
  const station = useGame((s) => s.car.station);
  const p = { lift: [-9, 0.75, -4], build: [-3, 0.95, -4], booth: [8.5, 0.6, -5], dyno: [2.5, 0.6, -4.5] }[station] as [number, number, number];
  return (
    <RigidBody type="fixed" position={p} colliders={false}>
      <CuboidCollider args={[0.9, 0.5, 2.2]} />
    </RigidBody>
  );
}
