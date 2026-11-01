import { Suspense, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, Bvh, PerformanceMonitor, Preload } from '@react-three/drei';
import * as THREE from 'three';
import { Perf } from 'r3f-perf';
import { CarRig } from '../car/CarRig';
import { initLoaders } from '../assets/loader';
import { useGame } from '../store/game';
import { CameraRig } from './CameraRig';
import { DynoController, KeyboardController, LiftController, SprayController } from './Controllers';
import { Effects } from './Effects';
import { Lighting } from './Lighting';
import { LooseParts, PhysicsWorld } from './Physics';
import { Exterior, Floor, Roof, Walls } from './Shell';
import { ZoneManager, ZONES, isMobile } from './Zones';

export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/** ?debug: per-zone triangle counts alongside r3f-perf. */
function ZoneTriCounter({ onUpdate }: { onUpdate: (c: Record<string, number>) => void }) {
  const scene = useThree((s) => s.scene);
  const last = useState({ t: 0 })[0];
  useFrame(() => {
    const now = performance.now();
    if (now - last.t < 1000) return;
    last.t = now;
    const out: Record<string, number> = {};
    for (const z of ZONES) {
      const g = scene.getObjectByName(`zone-${z.id}`);
      if (!g) continue;
      let tris = 0;
      g.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        const idx = m.geometry.index;
        const n = (idx ? idx.count : m.geometry.attributes.position?.count ?? 0) / 3;
        tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
      });
      out[z.id] = Math.round(tris);
    }
    const car = scene.getObjectByName('car');
    if (car) {
      let tris = 0;
      car.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position?.count ?? 0) / 3;
      });
      out.car = Math.round(tris);
    }
    onUpdate(out);
  });
  return null;
}

export function Garage() {
  const mobile = isMobile();
  const setUI = useGame((s) => s.setUI);
  const [zoneTris, setZoneTris] = useState<Record<string, number>>({});
  const dpr: [number, number] = mobile ? [0.75, 1.5] : [1, 2];

  return (
    <>
      <Canvas
        shadows={!mobile}
        dpr={dpr}
        camera={{ position: [0.2, 2.4, 0.4], fov: 45, near: 0.05, far: 400 }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          initLoaders(gl);
        }}
      >
        <color attach="background" args={['#0c0d0f']} />
        <fog attach="fog" args={['#0c0d0f', 30, 90]} />
        <PerformanceMonitor onDecline={() => setUI({ quality: 'low' })} onIncline={() => setUI({ quality: 'high' })} flipflops={3} onFallback={() => setUI({ quality: 'low' })} />
        <AdaptiveDpr pixelated />
        <Suspense fallback={null}>
          <Lighting />
          <Bvh firstHitOnly>
            <Floor />
            <Walls />
            <Roof />
            <Exterior />
            <PhysicsWorld>
              <ZoneManager />
              <LooseParts />
            </PhysicsWorld>
            <CarRig />
          </Bvh>
          <SprayController />
          <Effects />
          <Preload all />
        </Suspense>
        <CameraRig />
        <LiftController />
        <DynoController />
        {DEBUG && (
          <>
            <Perf position="top-left" minimal={mobile} />
            <ZoneTriCounter onUpdate={setZoneTris} />
          </>
        )}
      </Canvas>
      <KeyboardController />
      {DEBUG && (
        <div className="debug-tris">
          {Object.entries(zoneTris).map(([z, n]) => (
            <div key={z}>
              <span>{z}</span>
              <span>{n.toLocaleString()} tris</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
