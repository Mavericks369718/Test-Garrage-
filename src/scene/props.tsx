/** Procedural stand-ins for garage props (used when the SimReady GLB isn't in manifest.json). Real-world scale. */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAT } from './materials';
import { anim, LIFT_MAX } from './anim';

export interface Fallback {
  kind: string;
  size?: [number, number, number];
  color?: string;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const colorMat = (c: string) => {
  let m = matCache.get(c);
  if (!m) matCache.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.2 })));
  return m;
};

function B({ s, m, p = [0, 0, 0], r }: { s: [number, number, number]; m: THREE.Material; p?: [number, number, number]; r?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={r} material={m} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}
function C({ r, h, m, p = [0, 0, 0], rot, seg = 16 }: { r: number; h: number; m: THREE.Material; p?: [number, number, number]; rot?: [number, number, number]; seg?: number }) {
  return (
    <mesh position={p} rotation={rot} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, seg]} />
    </mesh>
  );
}

function ScissorLift() {
  const top = useRef<THREE.Group>(null);
  const arms = useRef<THREE.Group[]>([]);
  useFrame(() => {
    const h = anim.liftH;
    if (top.current) top.current.position.y = 0.1 + h;
    const ang = Math.asin(Math.min(0.98, (h + 0.06) / 1.9));
    arms.current.forEach((a, i) => a && (a.rotation.x = (i % 2 ? 1 : -1) * ang));
  });
  return (
    <group>
      {[0.55, -0.55].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <B s={[0.5, 0.06, 4.2]} m={MAT.steelDark} p={[0, 0.03, 0]} />
          {[0, 1].map((i) => (
            <group key={i} position={[0, 0.06, 0]} ref={(g) => g && (arms.current[i + (x > 0 ? 0 : 2)] = g)}>
              <B s={[0.08, 0.06, 1.9]} m={MAT.red} />
            </group>
          ))}
        </group>
      ))}
      <group ref={top} position={[0, 0.1, 0]}>
        {[0.55, -0.55].map((x) => (
          <B key={x} s={[0.55, 0.08, 4.4]} m={MAT.red} p={[x, 0, 0]} />
        ))}
        {[0.55, -0.55].map((x) => (
          <B key={x} s={[0.5, 0.012, 4.3]} m={MAT.steel} p={[x, 0.046, 0]} />
        ))}
      </group>
      <B s={[0.5, 0.9, 0.35]} m={MAT.red} p={[-1.5, 0.45, -2.6]} />
      <B s={[0.3, 0.12, 0.05]} m={MAT.screen} p={[-1.5, 0.8, -2.42]} />
    </group>
  );
}

export function liftMax() {
  return LIFT_MAX;
}

function Hoist() {
  const arm = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!arm.current) return;
    const target = anim.hoist ? -0.55 : -0.25;
    arm.current.rotation.x += (target - arm.current.rotation.x) * Math.min(1, dt * 3);
  });
  return (
    <group>
      {[0.4, -0.4].map((x) => <B key={x} s={[0.08, 0.08, 1.4]} m={MAT.red} p={[x, 0.08, 0.2]} />)}
      <B s={[0.1, 1.5, 0.1]} m={MAT.red} p={[0, 0.8, -0.4]} />
      <group ref={arm} position={[0, 1.5, -0.4]} rotation={[-0.25, 0, 0]}>
        <B s={[0.09, 0.09, 1.6]} m={MAT.red} p={[0, 0, 0.8]} />
        <C r={0.006} h={0.6} m={MAT.steel} p={[0, -0.3, 1.58]} />
        <B s={[0.07, 0.04, 0.07]} m={MAT.steelDark} p={[0, -0.62, 1.58]} />
      </group>
      <C r={0.05} h={0.6} m={MAT.steelDark} p={[0, 1.1, -0.2]} rot={[0.6, 0, 0]} />
    </group>
  );
}

function ToolCart() {
  return (
    <group>
      <B s={[0.75, 0.85, 0.46]} m={MAT.red} p={[0, 0.5, 0]} />
      {[0, 1, 2, 3].map((i) => <B key={i} s={[0.7, 0.008, 0.01]} m={MAT.steel} p={[0, 0.25 + i * 0.18, 0.235]} />)}
      <B s={[0.78, 0.03, 0.48]} m={MAT.steelDark} p={[0, 0.94, 0]} />
      {[[0.3, 0.18], [-0.3, 0.18], [0.3, -0.18], [-0.3, -0.18]].map(([x, z], i) => (
        <C key={i} r={0.04} h={0.03} m={MAT.rubber} p={[x, 0.04, z]} rot={[0, 0, Math.PI / 2]} />
      ))}
    </group>
  );
}

function Rack({ size = [2.4, 2.4, 0.9] }: { size?: [number, number, number] }) {
  const [w, h, d] = size;
  const levels = Math.max(3, Math.round(h / 0.6));
  return (
    <group>
      {[w / 2, -w / 2].flatMap((x) => [d / 2, -d / 2].map((z) => <B key={`${x}${z}`} s={[0.06, h, 0.06]} m={MAT.blue} p={[x, h / 2, z]} />))}
      {Array.from({ length: levels }, (_, i) => (
        <group key={i} position={[0, 0.15 + (i * (h - 0.25)) / (levels - 1), 0]}>
          <B s={[w, 0.05, 0.06]} m={MAT.safety} p={[0, 0, d / 2]} />
          <B s={[w, 0.05, 0.06]} m={MAT.safety} p={[0, 0, -d / 2]} />
          <B s={[w - 0.06, 0.02, d]} m={MAT.wood} p={[0, 0.03, 0]} />
        </group>
      ))}
      {/* stock on shelves */}
      <B s={[0.5, 0.35, 0.4]} m={colorMat('#7a5a3a')} p={[-w / 4, 0.68, 0]} />
      <B s={[0.4, 0.25, 0.4]} m={colorMat('#2a2d31')} p={[w / 4, 0.62, 0]} />
      <C r={0.2} h={0.24} m={MAT.rubber} p={[0, 1.4, 0]} rot={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function TireRack() {
  return (
    <group>
      {[0.8, -0.8].map((x) => <B key={x} s={[0.05, 1.6, 0.6]} m={MAT.steelDark} p={[x, 0.8, 0]} />)}
      {[0.45, 1.15].map((y) => (
        <group key={y}>
          <B s={[1.6, 0.04, 0.04]} m={MAT.steel} p={[0, y - 0.3, 0.2]} />
          <B s={[1.6, 0.04, 0.04]} m={MAT.steel} p={[0, y - 0.3, -0.2]} />
          {[-0.55, -0.28, 0, 0.28, 0.55].map((x) => (
            <mesh key={x} position={[x, y, 0]} rotation={[0, Math.PI / 2, 0]} material={MAT.rubber} castShadow>
              <torusGeometry args={[0.26, 0.1, 10, 24]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function TireChanger() {
  return (
    <group>
      <B s={[0.8, 0.85, 0.6]} m={MAT.red} p={[0, 0.425, 0]} />
      <C r={0.3} h={0.04} m={MAT.steel} p={[0, 0.88, 0]} seg={24} />
      <B s={[0.12, 1.3, 0.12]} m={MAT.red} p={[0, 1.2, -0.35]} />
      <B s={[0.08, 0.08, 0.5]} m={MAT.steelDark} p={[0, 1.8, -0.15]} />
    </group>
  );
}

function EngineStand() {
  return (
    <group>
      <B s={[0.06, 0.06, 0.9]} m={MAT.red} p={[0.3, 0.05, 0]} />
      <B s={[0.06, 0.06, 0.9]} m={MAT.red} p={[-0.3, 0.05, 0]} />
      <B s={[0.06, 0.8, 0.06]} m={MAT.red} p={[0, 0.45, -0.3]} />
      <C r={0.12} h={0.03} m={MAT.steelDark} p={[0, 0.82, -0.25]} rot={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function Dolly() {
  return (
    <group>
      <B s={[0.5, 0.05, 0.5]} m={MAT.steelDark} p={[0, 0.1, 0]} />
      <C r={0.14} h={0.04} m={MAT.rubber} p={[0, 0.15, 0]} seg={20} />
      {[[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]].map(([x, z], i) => <C key={i} r={0.035} h={0.025} m={MAT.rubber} p={[x, 0.035, z]} rot={[0, 0, Math.PI / 2]} />)}
    </group>
  );
}

function Platform() {
  return (
    <group>
      <B s={[1.9, 0.06, 4.6]} m={MAT.steelDark} p={[0, 0.06, 0]} />
      {[0.7, -0.7].flatMap((x) => [1.35, -1.35].map((z) => <B key={`${x}${z}`} s={[0.3, 0.32, 0.4]} m={MAT.safety} p={[x, 0.25, z]} />))}
      {[0.85, -0.85].flatMap((x) => [2.1, -2.1].map((z) => <C key={`${x}${z}`} r={0.05} h={0.04} m={MAT.rubber} p={[x, 0.03, z]} rot={[0, 0, Math.PI / 2]} />))}
    </group>
  );
}

function FloorJack() {
  return (
    <group>
      <B s={[0.32, 0.14, 0.75]} m={MAT.red} p={[0, 0.1, 0]} />
      <B s={[0.04, 0.04, 1.0]} m={MAT.steelDark} p={[0, 0.35, -0.75]} r={[0.35, 0, 0]} />
      <C r={0.06} h={0.03} m={MAT.steelDark} p={[0, 0.2, 0.36]} />
    </group>
  );
}

function JackStand() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} material={MAT.red} castShadow>
        <cylinderGeometry args={[0.04, 0.14, 0.4, 4]} />
      </mesh>
      <C r={0.02} h={0.2} m={MAT.steel} p={[0, 0.48, 0]} />
    </group>
  );
}

function TripodLight() {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
          <B s={[0.02, 1.0, 0.02]} m={MAT.steelDark} p={[0, 0.48, 0.2]} r={[-0.38, 0, 0]} />
        </group>
      ))}
      <B s={[0.03, 1.0, 0.03]} m={MAT.steelDark} p={[0, 1.3, 0]} />
      <B s={[0.32, 0.24, 0.1]} m={MAT.safety} p={[0, 1.85, 0]} />
      <B s={[0.28, 0.2, 0.01]} m={MAT.warmLamp} p={[0, 1.85, 0.055]} />
    </group>
  );
}

function Drum({ color = '#3a4148' }: { color?: string }) {
  return (
    <group>
      <C r={0.29} h={0.88} m={colorMat(color)} p={[0, 0.44, 0]} seg={20} />
      {[0.3, 0.6].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={colorMat(color)}>
          <torusGeometry args={[0.293, 0.012, 6, 24]} />
        </mesh>
      ))}
    </group>
  );
}

function Pallet() {
  return (
    <group>
      {[-0.5, 0, 0.5].map((x) => <B key={x} s={[0.1, 0.1, 1.2]} m={MAT.wood} p={[x, 0.05, 0]} />)}
      {[-0.5, -0.25, 0, 0.25, 0.5].map((z) => <B key={z} s={[1.0, 0.022, 0.12]} m={MAT.wood} p={[0, 0.11, z]} />)}
    </group>
  );
}

function DynoRollers() {
  const rollers = useRef<THREE.Group>(null);
  useFrame(() => {
    if (rollers.current) rollers.current.children.forEach((c) => (c.rotation.x = -anim.wheelAngle * (0.33 / 0.16)));
  });
  return (
    <group>
      <B s={[2.6, 0.02, 5.0]} m={MAT.steelDark} p={[0, 0.005, 0]} />
      {[1.35, -1.35].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <B s={[2.3, 0.01, 0.62]} m={MAT.wallDark} p={[0, 0.012, 0]} />
          <group ref={z > 0 ? rollers : undefined}>
            {[-0.17, 0.17].map((dz) => (
              <mesh key={dz} position={[0, -0.12, dz]} rotation={[0, 0, Math.PI / 2]} material={MAT.steel} castShadow={false}>
                <cylinderGeometry args={[0.16, 0.16, 2.1, 24]} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
      {[[1.25, 0], [-1.25, 0]].map(([x], i) => <B key={i} s={[0.04, 0.02, 5.0]} m={MAT.safety} p={[x, 0.016, 0]} />)}
      <B s={[0.5, 1.1, 0.4]} m={MAT.steelDark} p={[2.0, 0.55, 2.2]} />
      <B s={[0.42, 0.3, 0.02]} m={MAT.screen} p={[2.0, 0.92, 2.0]} />
    </group>
  );
}

function ExtractorFan() {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => blades.current && (blades.current.rotation.z += dt * 8));
  return (
    <group position={[0, 3.6, 0]}>
      <mesh rotation={[0, 0, 0]} material={MAT.steelDark}>
        <torusGeometry args={[0.5, 0.06, 8, 32]} />
      </mesh>
      <group ref={blades}>
        {[0, 1, 2, 3, 4].map((i) => <B key={i} s={[0.12, 0.44, 0.02]} m={MAT.steel} p={[0, 0, 0]} r={[0.3, 0, (i * Math.PI * 2) / 5]} />)}
      </group>
    </group>
  );
}

function Barrier() {
  return (
    <group>
      {[1.2, -1.2].map((x) => <B key={x} s={[0.08, 1.05, 0.08]} m={MAT.safety} p={[x, 0.52, 0]} />)}
      {[0.5, 1.0].map((y) => <B key={y} s={[2.4, 0.06, 0.04]} m={MAT.safety} p={[0, y, 0]} />)}
    </group>
  );
}

function Sign({ color = '#F2C230' }: { color?: string }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 4]} material={colorMat(color)}>
        <boxGeometry args={[0.35, 0.35, 0.01]} />
      </mesh>
      <B s={[0.04, 0.16, 0.012]} m={MAT.plastic} p={[0, 0.03, 0.006]} />
      <B s={[0.04, 0.04, 0.012]} m={MAT.plastic} p={[0, -0.09, 0.006]} />
    </group>
  );
}

function WetFloor() {
  return (
    <group>
      <B s={[0.3, 0.62, 0.02]} m={MAT.safety} p={[0, 0.3, 0.12]} r={[0.2, 0, 0]} />
      <B s={[0.3, 0.62, 0.02]} m={MAT.safety} p={[0, 0.3, -0.12]} r={[-0.2, 0, 0]} />
    </group>
  );
}

function Chair() {
  return (
    <group>
      <C r={0.3} h={0.03} m={MAT.plastic} p={[0, 0.06, 0]} seg={5} />
      <C r={0.025} h={0.4} m={MAT.steel} p={[0, 0.26, 0]} />
      <B s={[0.48, 0.08, 0.46]} m={MAT.plastic} p={[0, 0.48, 0]} />
      <B s={[0.46, 0.55, 0.06]} m={MAT.plastic} p={[0, 0.82, -0.22]} r={[-0.1, 0, 0]} />
    </group>
  );
}

function Monitor() {
  return (
    <group>
      <B s={[0.2, 0.02, 0.16]} m={MAT.plastic} p={[0, 0.01, 0]} />
      <B s={[0.04, 0.3, 0.03]} m={MAT.plastic} p={[0, 0.16, -0.03]} />
      <B s={[0.6, 0.36, 0.03]} m={MAT.plastic} p={[0, 0.38, 0]} />
      <B s={[0.56, 0.32, 0.005]} m={MAT.screen} p={[0, 0.38, 0.016]} />
    </group>
  );
}

function Extinguisher() {
  return (
    <group>
      <C r={0.08} h={0.5} m={MAT.red} p={[0, 0.25, 0]} />
      <C r={0.03} h={0.08} m={MAT.plastic} p={[0, 0.54, 0]} />
    </group>
  );
}

function HandTruck() {
  return (
    <group>
      {[0.2, -0.2].map((x) => <B key={x} s={[0.03, 1.2, 0.03]} m={MAT.red} p={[x, 0.6, -0.1]} r={[-0.15, 0, 0]} />)}
      <B s={[0.45, 0.02, 0.25]} m={MAT.steel} p={[0, 0.02, 0.05]} />
      {[0.25, -0.25].map((x) => <C key={x} r={0.12} h={0.06} m={MAT.rubber} p={[x, 0.12, -0.15]} rot={[0, 0, Math.PI / 2]} />)}
    </group>
  );
}

function Ladder() {
  return (
    <group>
      {[0.22, -0.22].map((x) => <B key={x} s={[0.04, 1.4, 0.05]} m={MAT.aluminium} p={[x, 0.68, 0.12]} r={[0.18, 0, 0]} />)}
      {[0.3, 0.6, 0.9, 1.2].map((y) => <B key={y} s={[0.44, 0.03, 0.1]} m={MAT.aluminium} p={[0, y, 0.12 - (y - 0.68) * 0.18]} />)}
      {[0.22, -0.22].map((x) => <B key={x} s={[0.03, 1.3, 0.03]} m={MAT.aluminium} p={[x, 0.65, -0.18]} r={[-0.2, 0, 0]} />)}
    </group>
  );
}

function SprayGun() {
  return (
    <group>
      <B s={[0.04, 0.12, 0.16]} m={MAT.steel} />
      <C r={0.045} h={0.12} m={MAT.white} p={[0, 0.12, 0]} />
    </group>
  );
}

function TransJack() {
  return (
    <group>
      <B s={[0.6, 0.06, 0.6]} m={MAT.red} p={[0, 0.08, 0]} />
      <C r={0.05} h={0.9} m={MAT.red} p={[0, 0.55, 0]} />
      <B s={[0.4, 0.04, 0.4]} m={MAT.steelDark} p={[0, 1.02, 0]} />
    </group>
  );
}

export function ProcProp({ fb }: { fb: Fallback }) {
  switch (fb.kind) {
    case 'scissorLift': return <ScissorLift />;
    case 'hoist': return <Hoist />;
    case 'toolCart': return <ToolCart />;
    case 'rack': return <Rack size={fb.size} />;
    case 'tireRack': return <TireRack />;
    case 'tireChanger': return <TireChanger />;
    case 'engineStand': return <EngineStand />;
    case 'dolly': return <Dolly />;
    case 'platform': return <Platform />;
    case 'floorJack': return <FloorJack />;
    case 'jackStand': return <JackStand />;
    case 'tripodLight': return <TripodLight />;
    case 'drum': return <Drum color={fb.color} />;
    case 'pallet': return <Pallet />;
    case 'dynoRollers': return <DynoRollers />;
    case 'extractorFan': return <ExtractorFan />;
    case 'barrier': return <Barrier />;
    case 'sign': return <Sign color={fb.color} />;
    case 'wetFloor': return <WetFloor />;
    case 'chair': return <Chair />;
    case 'monitor': return <Monitor />;
    case 'extinguisher': return <Extinguisher />;
    case 'handTruck': return <HandTruck />;
    case 'ladder': return <Ladder />;
    case 'sprayGun': return <SprayGun />;
    case 'transJack': return <TransJack />;
    case 'cylinder': {
      const [w, h] = fb.size ?? [0.3, 0.5, 0.3];
      return <C r={w / 2} h={h} m={colorMat(fb.color ?? '#555')} p={[0, h / 2, 0]} />;
    }
    default: {
      const s = fb.size ?? [0.5, 0.5, 0.5];
      return <B s={s} m={colorMat(fb.color ?? '#444')} p={[0, s[1] / 2, 0]} />;
    }
  }
}
