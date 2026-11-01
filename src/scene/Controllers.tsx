import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PART_BY_ID } from '../car/catalog';
import { DynoRun } from '../sim/dyno';
import { useDyno } from '../sim/dynoStore';
import { inductionOf } from '../sim/stats';
import { sfx } from '../audio/sfx';
import { useGame } from '../store/game';
import { LIFT_MAX, LIFT_SPEED, STATION_POS, anim } from './anim';

/** Scissor lift: linear travel, 2.5 s full stroke, hydraulic hum while moving. */
export function LiftController() {
  useFrame((_, dt) => {
    const s = useGame.getState();
    const target = s.car.station === 'lift' ? s.ui.liftTarget * LIFT_MAX : 0;
    const d = target - anim.liftH;
    const moving = Math.abs(d) > 1e-4;
    if (moving) anim.liftH += Math.sign(d) * Math.min(Math.abs(d), LIFT_SPEED * dt);
    sfx.loop('hum', moving, 1, 0.35);
  });
  return null;
}

/** Dyno: sweeps 1000 → redline in 5 s real time; wheels spin at rpm / gear; exhaust pitch follows rpm. */
export function DynoController() {
  const run = useRef<DynoRun | null>(null);
  const lastPush = useRef(0);
  useFrame((_, dt) => {
    const s = useGame.getState();
    if (s.ui.dynoRunning && !run.current) {
      const engine = PART_BY_ID[s.car.sockets.engine_bay]?.stats.engine;
      const gb = PART_BY_ID[s.car.sockets.transmission]?.stats.gearbox;
      if (!engine || !gb) {
        s.toast('Dyno needs an engine and a transmission', 'warn');
        s.setUI({ dynoRunning: false });
        return;
      }
      run.current = new DynoRun(engine, inductionOf(s.car.sockets), gb, 5);
      useDyno.getState().set({ samples: [], running: true, redline: engine.redline, peakHp: 0, peakNm: 0 });
    }
    const r = run.current;
    if (!r) {
      anim.wheelOmega *= Math.exp(-dt * 1.5);
      if (Math.abs(anim.wheelOmega) < 0.05) anim.wheelOmega = 0;
      return;
    }
    r.step(Math.min(dt, 1 / 30));
    anim.wheelOmega = r.wheelOmega;
    const ev = r.engine.kind === 'ev';
    sfx.loop('engine', true, ev ? 0.6 + r.rpm / 9000 : r.rpm / 1800, ev ? 0.15 : 0.55);
    const now = performance.now();
    if (now - lastPush.current > 33 || r.done) {
      lastPush.current = now;
      const pk = r.peak;
      useDyno.getState().set({ samples: [...r.samples], peakHp: pk.hp, peakNm: pk.nm });
    }
    if (r.done) {
      run.current = null;
      sfx.loop('engine', false);
      useDyno.getState().set({ running: false });
      useGame.getState().setUI({ dynoRunning: false });
    }
  });
  return null;
}

/** Paint booth spray: coverage builds while held; particle mist at the nozzle. */
export function SprayController() {
  const pts = useRef<THREE.Points>(null);
  const N = 300;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const vel = useMemo(() => new Float32Array(N * 3), []);
  const life = useMemo(() => new Float32Array(N), []);
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 0.02, transparent: true, opacity: 0.5, depthWrite: false }), []);
  const t = useRef(0);

  useFrame((_, dt) => {
    const s = useGame.getState();
    const on = s.ui.spraying && s.car.station === 'booth' && s.spray.coverage < 1;
    sfx.loop('spray', on, 1, 0.25);
    if (on) s.sprayTick(dt);
    mat.color.set(s.car.paint.color);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const b = STATION_POS.booth;
    t.current += dt;
    const nozzle = new THREE.Vector3(b[0] + 1.5 * Math.cos(t.current * 0.6), 1.0 + 0.3 * Math.sin(t.current * 1.3), b[2] + 2.0 * Math.sin(t.current * 0.6));
    for (let i = 0; i < N; i++) {
      life[i] -= dt;
      if (life[i] <= 0 && on) {
        life[i] = 0.35 + Math.random() * 0.25;
        pos.setXYZ(i, nozzle.x, nozzle.y, nozzle.z);
        const dir = new THREE.Vector3(b[0], 0.8, b[2]).sub(nozzle).normalize();
        vel[i * 3] = dir.x * 3 + (Math.random() - 0.5) * 0.8;
        vel[i * 3 + 1] = dir.y * 3 + (Math.random() - 0.5) * 0.8;
        vel[i * 3 + 2] = dir.z * 3 + (Math.random() - 0.5) * 0.8;
      } else if (life[i] > 0) {
        pos.setXYZ(i, pos.getX(i) + vel[i * 3] * dt, pos.getY(i) + vel[i * 3 + 1] * dt, pos.getZ(i) + vel[i * 3 + 2] * dt);
      } else pos.setXYZ(i, 0, -10, 0);
    }
    pos.needsUpdate = true;
    if (pts.current) pts.current.visible = on;
  });
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />;
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
};

/** Desktop keys: Tab inventory · F focus hovered · WASD walk · [ ] cycle ghost · Enter fit · Del remove · Esc close. */
export function KeyboardController() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const s = useGame.getState();
      if (s.mode === 'menu') return;
      switch (e.code) {
        case 'Tab':
          e.preventDefault();
          s.setUI({ inventoryOpen: !s.ui.inventoryOpen });
          break;
        case 'KeyF':
          if (s.ui.hoverSocket) s.setUI({ focusSocket: s.ui.hoverSocket });
          break;
        case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD':
          if (s.ui.cameraMode === 'orbit' && !matchMedia('(pointer: coarse)').matches && s.ui.panel === 'none') s.setUI({ cameraMode: 'walk' });
          break;
        case 'BracketRight': s.cycleGhost(1); break;
        case 'BracketLeft': s.cycleGhost(-1); break;
        case 'Enter': s.confirmAttach(); break;
        case 'Delete': case 'Backspace':
          if (s.ui.focusSocket) s.remove(s.ui.focusSocket, 'inventory');
          break;
        case 'Escape':
          if (s.ui.selectedPart) s.selectPart(null);
          else if (s.ui.panel !== 'none') s.setUI({ panel: 'none' });
          else if (s.ui.inventoryOpen) s.setUI({ inventoryOpen: false });
          else if (s.ui.focusSocket) s.setUI({ focusSocket: null });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
