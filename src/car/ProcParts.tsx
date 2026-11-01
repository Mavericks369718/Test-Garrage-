/**
 * Procedural stand-ins for every car part, built at real scale in socket-local space.
 * Used when a part's GLB is not in the manifest (or doesn't fit) — so the car never has holes.
 */
import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Part, Socket } from './catalog';
import {
  beamTransform, crownedPanel, frontExtrude, pipeGeometry, roundedRectShape, sideExtrude, springGeometry, tyreGeometry,
} from './geometry';
import { caliperMat, MAT } from '../scene/materials';
import { usePaintMaterial } from './paint';

type P = { part: Part; socket: Socket; name: string };
const kitOf = (p: Part) => p.kit ?? 'a';

function M({ g, m, ...rest }: { g: THREE.BufferGeometry; m: THREE.Material } & JSX.IntrinsicElements['mesh']) {
  return <mesh geometry={g} material={m} castShadow receiveShadow {...rest} />;
}
function Box({ s, m, ...rest }: { s: [number, number, number]; m: THREE.Material } & JSX.IntrinsicElements['mesh']) {
  return (
    <mesh material={m} castShadow receiveShadow {...rest}>
      <boxGeometry args={s} />
    </mesh>
  );
}
function Cyl({ r, h, m, seg = 20, r2, ...rest }: { r: number; h: number; m: THREE.Material; seg?: number; r2?: number } & JSX.IntrinsicElements['mesh']) {
  return (
    <mesh material={m} castShadow receiveShadow {...rest}>
      <cylinderGeometry args={[r2 ?? r, r, h, seg]} />
    </mesh>
  );
}
function Beam({ a, b, r, m }: { a: THREE.Vector3Tuple; b: THREE.Vector3Tuple; r: number | [number, number]; m: THREE.Material }) {
  const t = useMemo(() => beamTransform(a, b), [a, b]);
  const [w, d] = Array.isArray(r) ? r : [r, r];
  return (
    <mesh position={t.position} quaternion={t.quaternion} material={m} castShadow>
      <cylinderGeometry args={[w / 2, d / 2, t.length, 10]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ chassis & drivetrain
export function ProcFrame() {
  const m = MAT.steelDark;
  return (
    <group>
      {[0.5, -0.5].map((x) => (
        <Box key={x} s={[0.08, 0.12, 4.1]} m={m} position={[x, 0.3, 0]} />
      ))}
      {[-1.95, -1.35, -0.6, 0.3, 0.85, 1.35, 1.95].map((z) => (
        <Box key={z} s={[1.0, 0.08, 0.07]} m={m} position={[0, 0.3, z]} />
      ))}
      {/* floor pan + tunnel */}
      <Box s={[1.62, 0.025, 2.75]} m={MAT.gunmetal} position={[0, 0.27, -0.55]} />
      <Box s={[0.28, 0.18, 1.6]} m={MAT.gunmetal} position={[0, 0.36, 0.0]} />
      {/* firewall + rear bulkhead */}
      <Box s={[1.5, 0.55, 0.03]} m={MAT.gunmetal} position={[0, 0.6, 0.86]} />
      <Box s={[1.5, 0.45, 0.03]} m={MAT.gunmetal} position={[0, 0.55, -1.6]} />
      {/* sills */}
      {[0.82, -0.82].map((x) => (
        <Box key={x} s={[0.12, 0.16, 1.9]} m={m} position={[x, 0.32, -0.05]} />
      ))}
      {/* strut towers */}
      {[0.6, -0.6].flatMap((x) => [1.35, -1.35].map((z) => <Cyl key={`${x}${z}`} r={0.11} h={0.1} m={m} position={[x, 0.8, z]} />))}
      {/* front crash structure + radiator */}
      <Box s={[1.3, 0.1, 0.08]} m={MAT.aluminium} position={[0, 0.42, 2.0]} />
      <Box s={[0.7, 0.42, 0.05]} m={MAT.plasticGrey} position={[0, 0.62, 1.92]} />
    </group>
  );
}

function Axle({ part }: P) {
  const front = part.id.includes('front');
  return (
    <group>
      <Cyl r={0.035} h={1.4} m={MAT.steel} rotation={[0, 0, Math.PI / 2]} />
      <Box s={[0.9, 0.08, 0.32]} m={MAT.steelDark} position={[0, 0.06, front ? 0.05 : -0.05]} />
      {[0.62, -0.62].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box s={[0.08, 0.2, 0.12]} m={MAT.steelDark} />
          <Beam a={[0, 0, 0]} b={[-0.42 * Math.sign(x), 0.02, 0.28]} r={0.03} m={MAT.steel} />
          <Beam a={[0, 0, 0]} b={[-0.42 * Math.sign(x), 0.02, -0.22]} r={0.03} m={MAT.steel} />
        </group>
      ))}
    </group>
  );
}

function Diff({ part }: P) {
  const lsd = part.id.includes('lsd');
  return (
    <group>
      <mesh material={MAT.engineBlock} castShadow scale={[1, 0.85, 1]}>
        <sphereGeometry args={[0.15, 20, 14]} />
      </mesh>
      <Cyl r={0.12} h={0.03} m={lsd ? MAT.red : MAT.steelDark} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.14]} />
      <Cyl r={0.045} h={0.2} m={MAT.steel} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.18]} />
    </group>
  );
}

function Strut({ part }: P) {
  const k = kitOf(part);
  const springMat = k === 'b' ? MAT.red : k === 'c' ? MAT.blue : MAT.plastic;
  return (
    <group>
      <Cyl r={0.035} h={0.44} m={k === 'a' ? MAT.steelDark : MAT.aluminium} position={[0, -0.04, 0]} />
      <Cyl r={0.018} h={0.12} m={MAT.chrome} position={[0, 0.22, 0]} />
      <M g={springGeometry(0.065, 0.32, 6, 0.011)} m={springMat} position={[0, 0.05, 0]} />
      <Cyl r={0.08} h={0.02} m={MAT.steel} position={[0, 0.2, 0]} />
      <Cyl r={0.08} h={0.02} m={MAT.steel} position={[0, -0.12, 0]} />
    </group>
  );
}

function Brake({ part }: P) {
  const big = part.stats.brakeFactor === 1;
  const r = big ? 0.185 : 0.16;
  return (
    <group>
      <Cyl r={r} h={0.028} m={MAT.steel} seg={36} rotation={[0, 0, Math.PI / 2]} />
      <Cyl r={0.07} h={0.04} m={MAT.steelDark} rotation={[0, 0, Math.PI / 2]} position={[0.015, 0, 0]} />
      <group position={[0.0, r * 0.62, -r * 0.62]} rotation={[Math.PI / 4, 0, 0]}>
        <Box s={[0.075, 0.08, big ? 0.2 : 0.13]} m={caliperMat(part.stats.caliper)} />
      </group>
    </group>
  );
}

const RIM = {
  street: { mat: MAT.aluminium, spokes: 5, w: 0.05 },
  forged: { mat: MAT.gunmetal, spokes: 10, w: 0.022 },
  rally: { mat: MAT.white, spokes: 6, w: 0.07 },
} as const;

export function WheelVisual({ part }: { part: Part }) {
  const rim = RIM[(part.stats.rim as keyof typeof RIM) ?? 'street'] ?? RIM.street;
  const profile = part.stats.tire === 'semi-slick' ? 'slick' : part.stats.tire === 'gravel' ? 'gravel' : part.stats.tire === 'sport' ? 'sport' : 'street';
  const rimR = part.stats.rim === 'rally' ? 0.19 : part.stats.rim === 'forged' ? 0.23 : 0.215;
  const width = profile === 'slick' || profile === 'sport' ? 0.245 : 0.215;
  return (
    <group>
      <M g={tyreGeometry(0.33, rimR, width, profile)} m={profile === 'gravel' ? MAT.tread : MAT.rubber} />
      <Cyl r={rimR} h={width * 0.85} m={MAT.steelDark} seg={32} rotation={[0, 0, Math.PI / 2]} />
      <Cyl r={rimR - 0.01} h={0.01} m={rim.mat} seg={32} rotation={[0, 0, Math.PI / 2]} position={[width * 0.38, 0, 0]} />
      <group position={[width * 0.4, 0, 0]}>
        {Array.from({ length: rim.spokes }, (_, i) => (
          <group key={i} rotation={[(i / rim.spokes) * Math.PI * 2, 0, 0]}>
            <Box s={[0.03, rimR * 0.92, rim.w]} m={rim.mat} position={[0.008, rimR * 0.5, 0]} />
          </group>
        ))}
        <Cyl r={0.055} h={0.04} m={rim.mat} rotation={[0, 0, Math.PI / 2]} position={[0.01, 0, 0]} />
        <Cyl r={0.025} h={0.045} m={MAT.chrome} rotation={[0, 0, Math.PI / 2]} position={[0.02, 0, 0]} />
      </group>
    </group>
  );
}

function Engine({ part }: P) {
  const e = part.stats.engine!;
  if (e.kind === 'ev') {
    return (
      <group>
        <Cyl r={0.16} h={0.5} m={MAT.aluminium} rotation={[0, 0, Math.PI / 2]} position={[0, -0.12, 0.05]} />
        <Box s={[0.42, 0.22, 0.3]} m={MAT.battery} position={[0, 0.1, -0.05]} />
        <Box s={[0.36, 0.04, 0.24]} m={MAT.hvOrange} position={[0, 0.23, -0.05]} />
        {[-0.12, 0.12].map((x) => (
          <Beam key={x} a={[x, 0.15, -0.2]} b={[x * 1.6, -0.36, -0.75]} r={0.025} m={MAT.hvOrange} />
        ))}
        {/* battery pack in the floor pan */}
        <Box s={[1.25, 0.12, 1.9]} m={MAT.battery} position={[0, -0.33, -1.42]} />
        <Box s={[1.2, 0.01, 1.85]} m={MAT.hvOrange} position={[0, -0.265, -1.42]} />
      </group>
    );
  }
  const cyl = e.kind === 'v6' ? 3 : e.kind === 'v8' ? 4 : 6;
  const len = 0.12 * cyl + 0.18;
  const cover = e.kind === 'v8' ? MAT.engineCover : e.kind === 'v12' ? MAT.carbon : MAT.plasticGrey;
  return (
    <group>
      <Box s={[0.36, 0.3, len]} m={MAT.engineBlock} position={[0, -0.1, 0]} />
      <Box s={[0.3, 0.12, len * 0.95]} m={MAT.steelDark} position={[0, -0.28, 0]} />
      {[1, -1].map((s) => (
        <group key={s} position={[0.16 * s, 0.1, 0]} rotation={[0, 0, -0.5 * s]}>
          <Box s={[0.16, 0.16, len]} m={MAT.engineBlock} />
          <Box s={[0.15, 0.05, len * 0.96]} m={cover} position={[0, 0.1, 0]} />
          {Array.from({ length: cyl }, (_, i) => (
            <Cyl key={i} r={0.012} h={0.05} m={MAT.plastic} position={[0, 0.14, -len / 2 + 0.1 + i * 0.12]} />
          ))}
        </group>
      ))}
      <Box s={[0.18, 0.08, len * 0.85]} m={cover} position={[0, 0.2, 0]} />
      <Cyl r={0.09} h={0.05} m={MAT.steel} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.12, len / 2 + 0.03]} />
      <Cyl r={0.06} h={0.03} m={MAT.plastic} rotation={[Math.PI / 2, 0, 0]} position={[0.12, 0.02, len / 2 + 0.02]} />
    </group>
  );
}

function Forced({ part }: P) {
  if (part.stats.spoolLag) {
    return (
      <group>
        <mesh material={MAT.steel} castShadow rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.075, 0.045, 12, 24]} />
        </mesh>
        <Cyl r={0.06} h={0.1} m={MAT.aluminium} rotation={[0, 0, Math.PI / 2]} position={[0.07, 0, 0]} />
        <Cyl r={0.04} h={0.14} m={MAT.chrome} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.03, 0.1]} />
      </group>
    );
  }
  return (
    <group position={[0.26, -0.02, -0.1]}>
      <Box s={[0.2, 0.12, 0.36]} m={MAT.aluminium} />
      <Cyl r={0.06} h={0.03} m={MAT.steelDark} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0.2]} />
      {Array.from({ length: 6 }, (_, i) => (
        <Box key={i} s={[0.21, 0.01, 0.01]} m={MAT.steel} position={[0, 0.065, -0.15 + i * 0.06]} />
      ))}
    </group>
  );
}

function Intake({ part }: P) {
  const cai = part.id.includes('cold');
  return (
    <group rotation={[0, 0, 0]}>
      <Cyl r={0.06} r2={cai ? 0.085 : 0.06} h={cai ? 0.2 : 0.12} m={cai ? MAT.red : MAT.plasticGrey} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.04]} />
      <Cyl r={0.035} h={0.18} m={cai ? MAT.aluminium : MAT.plastic} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.14]} />
    </group>
  );
}

function Transmission({ part }: P) {
  const ev = part.stats.gearbox?.evOnly;
  if (ev) return <Cyl r={0.12} h={0.3} m={MAT.aluminium} rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0.2]} />;
  return (
    <group>
      <Cyl r={0.12} r2={0.17} h={0.24} m={MAT.aluminium} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.26]} />
      <Cyl r={0.09} r2={0.12} h={0.46} m={MAT.aluminium} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.02, -0.08]} />
      <Cyl r={0.03} h={0.35} m={MAT.steel} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.04, -0.45]} />
    </group>
  );
}

function Exhaust({ part }: P) {
  const k = kitOf(part);
  const r = k === 'c' ? 0.032 : 0.027;
  const path: [number, number, number][] = [[-0.3, 0.38, 1.6], [-0.15, 0.05, 1.2], [-0.1, 0, 0.6], [-0.05, 0, -0.6], [0, 0, -1.3], [0.05, 0.05, -1.75]];
  return (
    <group>
      <M g={pipeGeometry(`ex${k}`, path, r)} m={k === 'c' ? MAT.steel : MAT.steelDark} />
      {k !== 'c' && <Cyl r={0.08} h={0.38} m={MAT.steelDark} rotation={[Math.PI / 2, 0, 0]} position={[-0.07, 0, -0.1]} />}
      <Box s={[0.36, 0.13, 0.3]} m={k === 'b' ? MAT.steel : MAT.steelDark} position={[0, 0.03, -1.6]} />
      {(k === 'b' ? [-0.1, 0.1] : [0.06]).map((x) => (
        <Cyl key={x} r={k === 'c' ? 0.055 : 0.042} h={0.16} m={MAT.chrome} rotation={[Math.PI / 2, 0, 0]} position={[x, 0.03, -1.82]} />
      ))}
    </group>
  );
}

function Seat({ part }: P) {
  const bucket = part.id.includes('bucket');
  const m = bucket ? MAT.suede : MAT.leather;
  return (
    <group>
      <Box s={[0.5, 0.12, 0.52]} m={m} position={[0, 0.06, 0.02]} />
      <group position={[0, 0.12, -0.22]} rotation={[-0.2, 0, 0]}>
        <Box s={[0.48, 0.62, 0.11]} m={m} position={[0, 0.31, 0]} />
        {!bucket && <Box s={[0.26, 0.16, 0.09]} m={m} position={[0, 0.74, 0]} />}
        {bucket && [0.22, -0.22].map((x) => <Box key={x} s={[0.07, 0.5, 0.18]} m={m} position={[x, 0.27, 0.06]} />)}
      </group>
      <Box s={[0.36, 0.1, 0.4]} m={MAT.steelDark} position={[0, -0.06, 0.02]} />
    </group>
  );
}

function RearSeat() {
  return (
    <group>
      <Box s={[1.28, 0.14, 0.48]} m={MAT.leather} position={[0, 0.08, 0.06]} />
      <Box s={[1.28, 0.55, 0.12]} m={MAT.leather} position={[0, 0.38, -0.2]} rotation={[-0.22, 0, 0]} />
    </group>
  );
}

function Dashboard() {
  return (
    <group>
      <Box s={[1.45, 0.18, 0.34]} m={MAT.plastic} position={[0, 0, 0]} />
      <Box s={[1.4, 0.06, 0.2]} m={MAT.suede} position={[0, 0.11, -0.04]} />
      <Box s={[0.28, 0.1, 0.02]} m={MAT.screen} position={[0.36, 0.08, -0.16]} rotation={[-0.3, 0, 0]} />
      <Box s={[0.22, 0.14, 0.02]} m={MAT.screen} position={[0, 0.0, -0.17]} rotation={[-0.2, 0, 0]} />
      <Box s={[0.22, 0.32, 0.4]} m={MAT.plastic} position={[0, -0.24, -0.2]} />
    </group>
  );
}

function Steering({ part }: P) {
  const sport = part.id.includes('sport');
  return (
    <group>
      <mesh material={sport ? MAT.suede : MAT.leather} castShadow>
        <torusGeometry args={[0.18, 0.018, 10, 36]} />
      </mesh>
      <Box s={[0.33, 0.03, 0.02]} m={MAT.plastic} />
      <Cyl r={0.05} h={0.04} m={MAT.plastic} rotation={[Math.PI / 2, 0, 0]} />
      {sport && <Box s={[0.02, 0.03, 0.022]} m={MAT.accent} position={[0, 0.18, 0]} />}
      <Cyl r={0.022} h={0.3} m={MAT.steelDark} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.16]} />
    </group>
  );
}

// ------------------------------------------------------------------ body panels
function Hood({ part }: P) {
  const paint = usePaintMaterial();
  const k = kitOf(part);
  return (
    <group>
      <M g={crownedPanel(1.44, 1.15, 0.025, 0.035)} m={k === 'b' ? MAT.carbon : paint} />
      {k === 'b' && <M g={crownedPanel(1.0, 0.8, 0.026, 0.034)} m={paint} position={[0, 0.001, -0.1]} />}
      {k === 'b' && [0.3, -0.3].map((x) => <Box key={x} s={[0.22, 0.02, 0.32]} m={MAT.plastic} position={[x, 0.04, 0.22]} />)}
      {k === 'c' && (
        <group position={[0, 0.07, -0.08]}>
          <Box s={[0.42, 0.07, 0.38]} m={paint} />
          <Box s={[0.36, 0.05, 0.02]} m={MAT.plastic} position={[0, 0, 0.19]} />
        </group>
      )}
    </group>
  );
}

function Trunk({ part }: P) {
  const paint = usePaintMaterial();
  return <M g={crownedPanel(1.36, 0.5, 0.025, 0.02, part.kit === 'b' ? -0.01 : 0)} m={paint} />;
}

function Door({ part, socket }: P) {
  const paint = usePaintMaterial();
  const L = socket.size[2];
  const front = socket.slot === 'doorFront';
  const g = sideExtrude(`door:${L}:${part.kit}`, (s) => roundedRectShape(s, -L / 2, -0.51, L / 2, 0.15, 0.06), 0.07);
  const glassG = useMemo(() => {
    const s = new THREE.Shape();
    const top = 0.5;
    if (front) {
      s.moveTo(-L / 2 + 0.04, 0.17); s.lineTo(L / 2 - 0.06, 0.17); s.lineTo(L / 2 - 0.36, top); s.lineTo(-L / 2 + 0.04, top);
    } else {
      s.moveTo(-L / 2 + 0.16, 0.17); s.lineTo(L / 2 - 0.04, 0.17); s.lineTo(L / 2 - 0.04, top); s.lineTo(-L / 2 + 0.3, top - 0.02);
    }
    const geo = new THREE.ShapeGeometry(s);
    geo.rotateY(-Math.PI / 2);
    return geo;
  }, [L, front]);
  return (
    <group>
      <M g={g} m={paint} />
      <group position={[-0.03, 0, 0]} rotation={[0, 0, 0.1]}>
        <mesh geometry={glassG} material={MAT.glass} />
      </group>
      <Box s={[0.02, 0.035, 0.14]} m={part.kit === 'b' ? MAT.plastic : MAT.chrome} position={[0.045, 0.06, -L / 2 + 0.2]} />
    </group>
  );
}

function Fender({ part, socket }: P) {
  const paint = usePaintMaterial();
  const L = socket.size[2];
  const H = socket.size[1];
  const front = socket.slot === 'fenderFront';
  const wheelZ = front ? 1.35 - socket.pos[2] : -1.35 - socket.pos[2];
  const wheelY = 0.33 - socket.pos[1];
  const r = part.kit === 'c' ? 0.42 : 0.39;
  const g = sideExtrude(`fender:${front}:${part.kit}`, (s) => {
    const y0 = -H / 2, y1 = H / 2;
    s.moveTo(-L / 2, y0 + 0.03);
    s.lineTo(wheelZ - r, y0 + 0.03);
    s.absarc(wheelZ, wheelY, r, Math.PI, 0, true);
    s.lineTo(L / 2, y0 + 0.03);
    if (front) {
      s.lineTo(L / 2, y1 - 0.14);
      s.quadraticCurveTo(L / 2, y1 - 0.05, L / 2 - 0.12, y1 - 0.04);
      s.lineTo(-L / 2, y1);
    } else {
      s.lineTo(L / 2, y1 - 0.02);
      s.lineTo(-L / 2 + 0.1, y1 - 0.02);
      s.quadraticCurveTo(-L / 2, y1 - 0.04, -L / 2, y1 - 0.14);
    }
    s.lineTo(-L / 2, y0 + 0.03);
  }, 0.1);
  return (
    <group>
      <M g={g} m={paint} />
      {part.kit === 'c' && (
        <mesh position={[0.05, wheelY, wheelZ]} rotation={[0, Math.PI / 2, 0]} material={MAT.plastic}>
          <torusGeometry args={[r + 0.015, 0.02, 6, 24, Math.PI]} />
        </mesh>
      )}
    </group>
  );
}

function Bumper({ part, socket }: P) {
  const paint = usePaintMaterial();
  const front = socket.slot === 'bumperF';
  const k = kitOf(part);
  const d = front ? 1 : -1;
  const g = sideExtrude(`bumper:${front}`, (s) => {
    const zf = 0.15 * d, zb = -0.15 * d;
    s.moveTo(zb, -0.24);
    s.lineTo(zf - 0.06 * d, -0.24);
    s.quadraticCurveTo(zf, -0.24, zf, -0.12);
    s.lineTo(zf, 0.12);
    s.quadraticCurveTo(zf, 0.24, zf - 0.1 * d, 0.24);
    s.lineTo(zb, 0.24);
    s.lineTo(zb, -0.24);
  }, 1.78, 0.04);
  return (
    <group>
      <M g={g} m={paint} />
      {front && <Box s={[1.1, 0.1, 0.02]} m={MAT.plastic} position={[0, -0.1, 0.16]} />}
      {k === 'b' && <Box s={[1.7, 0.02, 0.12]} m={MAT.carbon} position={[0, -0.24, 0.1 * d]} />}
      {k === 'c' && front && <Box s={[0.9, 0.02, 0.3]} m={MAT.aluminium} position={[0, -0.25, 0.05]} rotation={[0.25, 0, 0]} />}
      {!front && <Box s={[0.52, 0.12, 0.02]} m={MAT.plastic} position={[0, 0.02, -0.16]} />}
    </group>
  );
}

function Roof({ part, socket }: P) {
  const paint = usePaintMaterial();
  const o = socket.pos;
  const L = (p: THREE.Vector3Tuple): THREE.Vector3Tuple => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const rearGlass = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1.2, 0.68);
    geo.rotateX(-Math.PI / 2 - 0.72);
    return geo;
  }, []);
  const pillar = 0.05;
  return (
    <group>
      <M g={crownedPanel(1.3, 1.2, 0.03, 0.03)} m={part.kit === 'b' ? MAT.carbon : paint} />
      {[1, -1].map((s) => (
        <group key={s}>
          <Beam a={L([0.7 * s, 0.98, 0.85])} b={L([0.63 * s, 1.36, 0.15])} r={[pillar * 1.3, pillar]} m={paint} />
          <Beam a={L([0.72 * s, 0.98, -0.15])} b={L([0.65 * s, 1.36, -0.15])} r={[0.07, 0.06]} m={MAT.plastic} />
          <Beam a={L([0.64 * s, 1.36, -1.05])} b={L([0.72 * s, 1.0, -1.62])} r={[0.09, 0.13]} m={paint} />
        </group>
      ))}
      <mesh geometry={rearGlass} material={MAT.glass} position={L([0, 1.18, -1.33])} />
      {part.kit === 'c' && [0.5, -0.5].map((x) => <Box key={x} s={[0.03, 0.04, 1.0]} m={MAT.aluminium} position={[x, 0.05, 0]} />)}
    </group>
  );
}

function Windscreen() {
  return (
    <group>
      <M g={crownedPanel(1.34, 0.8, 0.008, 0.03)} m={MAT.glass} />
      <Box s={[1.36, 0.01, 0.03]} m={MAT.plastic} position={[0, 0.0, 0.39]} />
    </group>
  );
}

function Grille({ part }: P) {
  const k = kitOf(part);
  return (
    <group>
      <Box s={[0.78, 0.16, 0.03]} m={MAT.plastic} />
      {Array.from({ length: k === 'b' ? 6 : 4 }, (_, i) => (
        <Box key={i} s={[0.74, 0.008, 0.02]} m={k === 'a' ? MAT.chrome : MAT.gunmetal} position={[0, -0.06 + (i * 0.12) / ((k === 'b' ? 6 : 4) - 1), 0.02]} />
      ))}
    </group>
  );
}

function Headlight({ part }: P) {
  const k = kitOf(part);
  return (
    <group>
      <Box s={[0.36, k === 'b' ? 0.08 : 0.13, 0.12]} m={MAT.plastic} />
      <Box s={[0.3, k === 'b' ? 0.03 : 0.07, 0.02]} m={MAT.headlight} position={[0, 0, 0.06]} />
      <Box s={[0.36, k === 'b' ? 0.08 : 0.13, 0.01]} m={MAT.lensClear} position={[0, 0, 0.07]} />
      {k === 'c' && <Cyl r={0.05} h={0.05} m={MAT.headlight} rotation={[Math.PI / 2, 0, 0]} position={[-0.1, -0.15, 0.08]} />}
    </group>
  );
}

function Taillight({ part }: P) {
  return (
    <group>
      <Box s={[0.34, part.kit === 'b' ? 0.06 : 0.11, 0.06]} m={MAT.taillight} />
    </group>
  );
}

function Mirror() {
  const paint = usePaintMaterial();
  return (
    <group>
      <Box s={[0.08, 0.04, 0.05]} m={MAT.plastic} position={[-0.05, -0.03, 0]} />
      <mesh material={paint} castShadow position={[0.05, 0, -0.02]} scale={[1, 0.62, 0.5]}>
        <sphereGeometry args={[0.085, 16, 10]} />
      </mesh>
      <mesh material={MAT.chrome} position={[0.05, 0, -0.065]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.13, 0.08, 0.004]} />
      </mesh>
    </group>
  );
}

function Skirt({ part, socket }: P) {
  const paint = usePaintMaterial();
  return <Box s={[0.07, 0.12, socket.size[2]]} m={part.kit === 'b' ? MAT.carbon : paint} />;
}

function Spoiler({ part }: P) {
  const paint = usePaintMaterial();
  const k = kitOf(part);
  if (k === 'a') return <Box s={[1.3, 0.04, 0.12]} m={paint} position={[0, 0, -0.02]} rotation={[-0.25, 0, 0]} />;
  const h = k === 'b' ? 0.3 : 0.16;
  const wing = frontExtrude(`wing${k}`, (s) => {
    s.moveTo(-0.16, 0);
    s.quadraticCurveTo(0, 0.05, 0.16, 0.0);
    s.quadraticCurveTo(0, 0.015, -0.16, 0);
  }, 0.01, 0);
  return (
    <group>
      {[0.42, -0.42].map((x) => (
        <Box key={x} s={[0.025, h, 0.08]} m={k === 'b' ? MAT.carbon : paint} position={[x, h / 2, 0]} />
      ))}
      <group position={[0, h, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={wing} material={k === 'b' ? MAT.carbon : paint} scale={[1, 1, 140]} castShadow />
      </group>
      {k === 'b' && [0.71, -0.71].map((x) => <Box key={x} s={[0.01, 0.12, 0.34]} m={MAT.carbon} position={[x, h, 0]} />)}
    </group>
  );
}

const BY_SLOT: Record<string, (p: P) => ReactNode> = {
  axle: Axle, diff: Diff, strut: Strut, brake: Brake, wheel: ({ part }) => <WheelVisual part={part} />, engine: Engine,
  forced: Forced, intake: Intake, transmission: Transmission, exhaust: Exhaust, seat: Seat, seatRear: RearSeat,
  dashboard: Dashboard, steering: Steering, hood: Hood, trunk: Trunk, doorFront: Door, doorRear: Door,
  fenderFront: Fender, fenderRear: Fender, bumperF: Bumper, bumperR: Bumper, roof: Roof, windscreen: Windscreen,
  grille: Grille, headlight: Headlight, taillight: Taillight, mirror: Mirror, skirt: Skirt, spoiler: Spoiler,
};

export function ProcPart(props: P) {
  const C = BY_SLOT[props.part.slot];
  return C ? <C {...props} /> : <Box s={props.socket.size} m={MAT.plasticGrey} />;
}
