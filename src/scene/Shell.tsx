import { useMemo } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';
import { MAT } from './materials';
import { AssetModel } from '../assets/loader';
import { resolveAsset } from '../assets/manifest';

const W = 24, D = 16, H = 6;

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** Procedural dark epoxy concrete: subtle speckle albedo + roughness variation. */
function useFloorMaterial() {
  return useMemo(() => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const albedo = canvasTex(512, (c, s) => {
      c.fillStyle = '#1A1C1F';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) {
        const v = 24 + rnd() * 22;
        c.fillStyle = `rgba(${v},${v + 1},${v + 3},${0.35 + rnd() * 0.4})`;
        c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
    }, 8);
    albedo.colorSpace = THREE.SRGBColorSpace;
    const rough = canvasTex(256, (c, s) => {
      c.fillStyle = '#6a6a6a';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        const g = c.createRadialGradient(rnd() * s, rnd() * s, 0, rnd() * s, rnd() * s, 20 + rnd() * 60);
        const v = Math.floor(70 + rnd() * 80);
        g.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, s, s);
      }
    }, 4);
    return new THREE.MeshStandardMaterial({ map: albedo, roughnessMap: rough, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
  }, []);
}

function useHazardMaterial() {
  return useMemo(() => {
    const t = canvasTex(128, (c, s) => {
      c.fillStyle = '#111214';
      c.fillRect(0, 0, s, s);
      c.fillStyle = '#F2C230';
      for (let i = -2; i < 4; i++) {
        c.beginPath();
        c.moveTo(i * s / 2, 0);
        c.lineTo(i * s / 2 + s / 4, 0);
        c.lineTo(i * s / 2 + s / 4 + s, s);
        c.lineTo(i * s / 2 + s, s);
        c.fill();
      }
    });
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  }, []);
}

function Stripe({ from, to, w = 0.1, hazard }: { from: [number, number]; to: [number, number]; w?: number; hazard?: THREE.Material }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const mat = hazard ?? MAT.safety;
  if (hazard && (hazard as THREE.MeshStandardMaterial).map) {
    // keep stripes square-ish regardless of length
  }
  return (
    <mesh position={[(from[0] + to[0]) / 2, 0.003, (from[1] + to[1]) / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(dz, dx)]} material={mat} receiveShadow>
      <planeGeometry args={[len, w]} />
    </mesh>
  );
}

export function Floor() {
  const floor = useFloorMaterial();
  const hazard = useHazardMaterial();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={floor} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      {/* Bay lines */}
      {[-12, -6, 0].map((x) => (
        <Stripe key={x} from={[x + 0.15, -7.8]} to={[x + 0.15, 0]} w={0.08} />
      ))}
      <Stripe from={[-11.8, 0]} to={[5, 0]} w={0.08} />
      <Stripe from={[5.0, -7.8]} to={[5.0, 0]} w={0.08} />
      {/* Hazard stripes: lift footprint + dyno pit edges */}
      <Stripe from={[-10.6, -6.6]} to={[-7.4, -6.6]} w={0.18} hazard={hazard} />
      <Stripe from={[-10.6, -1.4]} to={[-7.4, -1.4]} w={0.18} hazard={hazard} />
      <Stripe from={[1.1, -7.2]} to={[1.1, -1.8]} w={0.16} hazard={hazard} />
      <Stripe from={[3.9, -7.2]} to={[3.9, -1.8]} w={0.16} hazard={hazard} />
      {/* Walkway */}
      <Stripe from={[0.4, 7.9]} to={[0.4, 0.4]} w={0.06} />
      <Stripe from={[3.6, 7.9]} to={[3.6, 0.4]} w={0.06} />
    </group>
  );
}

function TiledWall({ from, to, gap }: { from: [number, number]; to: [number, number]; gap?: [number, number] }) {
  const entry = resolveAsset('structure_wall_straight_a01');
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const ang = -Math.atan2(dz, dx);
  if (entry?.bbox) {
    const seg = Math.max(0.5, entry.bbox.size[0]);
    const n = Math.round(len / seg);
    return (
      <group position={[from[0], 0, from[1]]} rotation={[0, ang, 0]}>
        {Array.from({ length: n }, (_, i) => {
          const c = (i + 0.5) * (len / n);
          if (gap && c > gap[0] && c < gap[1]) return null;
          return (
            <group key={i} position={[c, 0, 0]}>
              <AssetModel id="structure_wall_straight_a01" lods={false} fallback={null} />
            </group>
          );
        })}
      </group>
    );
  }
  // Procedural: wall panels with a dado line, gap for the roller door.
  const parts: [number, number][] = gap ? [[0, gap[0]], [gap[1], len]] : [[0, len]];
  return (
    <group position={[from[0], 0, from[1]]} rotation={[0, ang, 0]}>
      {parts.map(([a, b]) => (
        <group key={a}>
          <mesh position={[(a + b) / 2, H / 2, 0]} material={MAT.wall} receiveShadow>
            <boxGeometry args={[b - a, H, 0.2]} />
          </mesh>
          <mesh position={[(a + b) / 2, 0.6, 0.105]} material={MAT.wallDark}>
            <boxGeometry args={[b - a, 1.2, 0.01]} />
          </mesh>
        </group>
      ))}
      {gap && (
        <group>
          <mesh position={[(gap[0] + gap[1]) / 2, H - 0.6, 0]} material={MAT.wall}>
            <boxGeometry args={[gap[1] - gap[0], 1.2, 0.2]} />
          </mesh>
          {/* rolled-up roller door drum */}
          <mesh position={[(gap[0] + gap[1]) / 2, H - 1.35, 0.2]} rotation={[0, 0, Math.PI / 2]} material={MAT.steel}>
            <cylinderGeometry args={[0.3, 0.3, gap[1] - gap[0] + 0.2, 20]} />
          </mesh>
          {[gap[0], gap[1]].map((x) => (
            <mesh key={x} position={[x, (H - 1.2) / 2, 0.12]} material={MAT.safety}>
              <boxGeometry args={[0.12, H - 1.2, 0.06]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export function Walls() {
  return (
    <group>
      <TiledWall from={[-W / 2, -D / 2]} to={[W / 2, -D / 2]} />
      <TiledWall from={[W / 2, -D / 2]} to={[W / 2, D / 2]} />
      {/* front wall with the roller-door entrance at x 0..4 */}
      <TiledWall from={[-W / 2, D / 2]} to={[W / 2, D / 2]} gap={[12, 16.6]} />
      <TiledWall from={[-W / 2, D / 2]} to={[-W / 2, -D / 2]} />
      {/* columns */}
      <Instances material={MAT.steelDark} castShadow>
        <boxGeometry args={[0.3, H, 0.3]} />
        {[-12, -6, 0, 6, 12].flatMap((x) => [-8, 8].map((z) => <Instance key={`${x}${z}`} position={[x, H / 2, z]} />))}
      </Instances>
    </group>
  );
}

/** Roof trusses + hex LED panels (instanced). Rect-area lights live in Lighting. */
export const LED_POSITIONS: [number, number, number][] = [-9, -3, 3, 9].flatMap((x) => [-4, 3].map((z) => [x, H - 0.45, z] as [number, number, number]));

export function Roof() {
  return (
    <group>
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.wallDark}>
        <planeGeometry args={[W, D]} />
      </mesh>
      <Instances material={MAT.steelDark}>
        <boxGeometry args={[0.12, 0.35, D]} />
        {[-10, -6, -2, 2, 6, 10].map((x) => <Instance key={x} position={[x, H - 0.25, 0]} />)}
      </Instances>
      <Instances material={MAT.steelDark}>
        <boxGeometry args={[W, 0.12, 0.08]} />
        {[-6, -2, 2, 6].map((z) => <Instance key={z} position={[0, H - 0.42, z]} />)}
      </Instances>
      {/* hex-grid LED fixtures */}
      <Instances material={MAT.ledPanel}>
        <cylinderGeometry args={[0.32, 0.32, 0.03, 6]} />
        {LED_POSITIONS.flatMap(([x, y, z]) =>
          [[0, 0], [0.56, 0.32], [-0.56, 0.32], [0, 0.64], [0.56, -0.32], [-0.56, -0.32], [0, -0.64]].map(([dx, dz], i) => (
            <Instance key={`${x}${z}${i}`} position={[x + dx, y, z + dz]} />
          )),
        )}
      </Instances>
    </group>
  );
}

/** Driveway + soft gradient sky seen through the open roller door. */
export function Exterior() {
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'varying vec3 vP; void main(){ float h = clamp(vP.y*1.4+0.1,0.0,1.0); vec3 low = vec3(0.98,0.62,0.38); vec3 mid = vec3(0.33,0.33,0.45); vec3 top = vec3(0.06,0.08,0.14); vec3 c = mix(low, mid, smoothstep(0.0,0.25,h)); c = mix(c, top, smoothstep(0.25,0.9,h)); gl_FragColor = vec4(c*0.9,1.0); }',
      }),
    [],
  );
  return (
    <group>
      <mesh material={sky}>
        <sphereGeometry args={[120, 32, 16]} />
      </mesh>
      <mesh position={[2, -0.01, 28]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color="#2b2c2e" roughness={0.95} />
      </mesh>
      <mesh position={[2.3, 0.0, 14]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 12]} />
        <meshStandardMaterial color="#3a3b3d" roughness={0.9} />
      </mesh>
    </group>
  );
}
