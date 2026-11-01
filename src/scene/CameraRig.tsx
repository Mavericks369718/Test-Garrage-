import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { TEMPLATE } from '../car/catalog';
import { useGame } from '../store/game';
import { ZONE_BY_ID, isMobile } from './Zones';
import { STATION_POS, anim, easeInOutCubic, easeOutCubic } from './anim';

interface Tween {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  t0: number;
  dur: number;
  ease: (t: number) => number;
}

function WalkControls() {
  const ref = useRef<{ lock: () => void } | null>(null);
  useEffect(() => {
    try {
      ref.current?.lock();
    } catch {
      /* needs a user gesture; click to lock */
    }
  }, []);
  return (
    <PointerLockControls
      ref={ref as never}
      makeDefault
      onUnlock={() => useGame.getState().setUI({ cameraMode: 'orbit' })}
    />
  );
}

const BOUNDS = { x: [-11.6, 11.6], z: [-7.6, 7.6] };

/**
 * Orbit by default. Zone jump: 700 ms easeInOutCubic fly. Focus a part: 400 ms easeOutCubic. Dyno: locked side view.
 * Walk mode (desktop): WASD + pointer lock at eye height.
 */
export function CameraRig() {
  const controls = useRef<OrbitImpl>(null);
  const camera = useThree((s) => s.camera);
  const tween = useRef<Tween | null>(null);
  const zone = useGame((s) => s.ui.zone);
  const mode = useGame((s) => s.ui.cameraMode);
  const focus = useGame((s) => s.ui.focusSocket);
  const station = useGame((s) => s.car.station);
  const gameMode = useGame((s) => s.mode);
  const keys = useRef<Record<string, boolean>>({});

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, dur: number, ease: (t: number) => number) => {
    const c = controls.current;
    tween.current = {
      fromPos: camera.position.clone(), fromTarget: c ? c.target.clone() : new THREE.Vector3(),
      toPos: pos, toTarget: target, t0: performance.now(), dur, ease,
    };
  };

  // Zone jumps
  useEffect(() => {
    if (mode === 'walk') return;
    const z = ZONE_BY_ID[zone];
    if (!z) return;
    if (mode === 'dyno') {
      const p = STATION_POS.dyno;
      flyTo(new THREE.Vector3(p[0] + 4.6, 1.0, p[2]), new THREE.Vector3(p[0], 0.6, p[2]), 700, easeInOutCubic);
      return;
    }
    const liftY = z.station === 'lift' ? 0 : 0;
    flyTo(new THREE.Vector3(...z.camera.pos).setY(z.camera.pos[1] + liftY), new THREE.Vector3(...z.camera.target), gameMode === 'menu' ? 1 : 700, easeInOutCubic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, mode, gameMode]);

  // Focus on a socket (F key or click)
  useEffect(() => {
    if (!focus || mode !== 'orbit') return;
    const s = TEMPLATE.sockets[focus];
    const base = STATION_POS[station];
    const target = new THREE.Vector3(base[0] + s.pos[0], base[1] + s.pos[1] + (station === 'lift' ? anim.liftH : 0), base[2] + s.pos[2]);
    const dir = camera.position.clone().sub(target).normalize();
    const dist = Math.max(1.4, Math.max(...s.size) * 2.4);
    flyTo(target.clone().add(dir.multiplyScalar(dist)).setY(Math.max(0.4, target.y + 0.5)), target, 400, easeOutCubic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (mode === 'walk') {
      camera.position.y = 1.7;
    }
  }, [mode, camera]);

  useFrame((_, dt) => {
    const tw = tween.current;
    const c = controls.current;
    if (tw) {
      const k = Math.min(1, (performance.now() - tw.t0) / tw.dur);
      const e = tw.ease(k);
      camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      if (c) c.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      else camera.lookAt(new THREE.Vector3().lerpVectors(tw.fromTarget, tw.toTarget, e));
      if (k >= 1) tween.current = null;
    }
    if (mode === 'walk') {
      const speed = (keys.current.ShiftLeft ? 4.2 : 2.2) * dt;
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const k = keys.current;
      if (k.KeyW) camera.position.addScaledVector(fwd, speed);
      if (k.KeyS) camera.position.addScaledVector(fwd, -speed);
      if (k.KeyD) camera.position.addScaledVector(right, speed);
      if (k.KeyA) camera.position.addScaledVector(right, -speed);
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, BOUNDS.x[0], BOUNDS.x[1]);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, BOUNDS.z[0], BOUNDS.z[1]);
      camera.position.y = 1.7;
    }
    c?.update();
  });

  if (mode === 'walk' && !isMobile()) {
    return <WalkControls />;
  }
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={mode !== 'dyno'}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.8}
      maxDistance={14}
      maxPolarAngle={Math.PI / 2 - 0.04}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  );
}
