import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { PART_BY_ID, TEMPLATE, type Hinge } from './catalog';
import { ProcFrame, ProcPart } from './ProcParts';
import { PaintProvider, usePaintMaterial } from './paint';
import { AssetModel } from '../assets/loader';
import { rankSockets } from './assembly';
import { ctxOf, useGame } from '../store/game';
import { computeStats } from '../sim/stats';
import { MAT } from '../scene/materials';
import { anim, easeInOutQuad, easeOutQuad, springStep, STATION_POS } from '../scene/anim';

const DEG = Math.PI / 180;
const BODY_SLOTS = new Set(['hood', 'trunk', 'doorFront', 'doorRear', 'fenderFront', 'fenderRear', 'bumperF', 'bumperR', 'roof', 'mirror', 'skirt', 'spoiler']);
const SPIN_SLOTS = new Set(['wheel', 'brake']);

const openAngle = (h: Hinge) => (Math.abs(h.min) > Math.abs(h.max) ? h.min : h.max) * DEG;

/** Pivot-rotate children about `hinge` by `value` (0 closed → 1 open). Click toggles (400 ms easeOutQuad), drag follows the joint axis. */
function HingeGroup({ socket, hinge, children }: { socket: string; hinge?: Hinge; children: ReactNode }) {
  const target = useGame((s) => s.car.hinges[socket] ?? 0);
  const rot = useRef<THREE.Group>(null);
  const tween = useRef({ from: 0, to: 0, t0: 0, cur: 0 });
  const drag = useRef<{ dragging: boolean }>({ dragging: false });

  useEffect(() => {
    const tw = tween.current;
    if (drag.current.dragging) {
      tw.cur = tw.to = tw.from = target;
      return;
    }
    tw.from = tw.cur;
    tw.to = target;
    tw.t0 = performance.now();
  }, [target]);

  useFrame(() => {
    if (!hinge || !rot.current) return;
    const tw = tween.current;
    if (!drag.current.dragging) {
      const k = Math.min(1, (performance.now() - tw.t0) / 400);
      tw.cur = tw.from + (tw.to - tw.from) * easeOutQuad(k);
    }
    const ax = new THREE.Vector3(...hinge.axis).normalize();
    rot.current.quaternion.setFromAxisAngle(ax, openAngle(hinge) * tw.cur);
  });

  if (!hinge) return <>{children}</>;
  return (
    <group position={hinge.pivot} userData={{ hingeSocket: socket, drag: drag.current }}>
      <group ref={rot}>
        <group position={[-hinge.pivot[0], -hinge.pivot[1], -hinge.pivot[2]]}>{children}</group>
      </group>
    </group>
  );
}

/** Attach animation: spring snap (180–250 ms, slight overshoot), hoist path (1.5 s easeInOut), or impact-wrench bolts. */
function FxGroup({ socket, children, bolts }: { socket: string; children: ReactNode; bolts?: boolean }) {
  const fx = useGame((s) => s.fx.find((f) => f.socket === socket));
  const g = useRef<THREE.Group>(null);
  const spring = useRef({ x: 0, v: 0, started: 0 });
  const boltRefs = useRef<(THREE.Mesh | null)[]>([]);

  useLayoutEffect(() => {
    if (!fx || performance.now() - fx.at > 400) return;
    spring.current = { x: 1, v: 0, started: fx.at };
  }, [fx]);

  useFrame((_, dt) => {
    if (!g.current || !fx) return;
    const t = (performance.now() - fx.at) / 1000;
    if (fx.kind === 'hoist') {
      const k = Math.min(1, t / 1.5);
      const e = easeInOutQuad(k);
      anim.hoist = k < 1 ? 1 : 0;
      g.current.position.set(0, (1 - e) * 1.1, (1 - e) * 0.6);
    } else {
      const sp = spring.current;
      if (t < 0.6) {
        const [x, v] = springStep(sp.x, sp.v, 0, Math.min(dt, 1 / 60));
        sp.x = x;
        sp.v = v;
      } else sp.x = 0;
      g.current.position.set(0, sp.x * 0.22, 0);
      g.current.scale.setScalar(1 - sp.x * 0.04);
    }
    if (bolts) {
      boltRefs.current.forEach((b, i) => {
        if (!b) return;
        const tb = t - 0.2 - i * 0.12;
        b.visible = t < 0.2 + 4 * 0.12 + 0.25;
        if (tb > 0 && tb < 0.12) b.rotation.x += dt * 90;
        b.position.x = 0.13 + (tb < 0 ? 0.03 : tb < 0.12 ? 0.03 * (1 - tb / 0.12) : 0);
      });
    }
  });

  return (
    <group ref={g}>
      {children}
      {bolts &&
        [0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            ref={(m) => (boltRefs.current[i] = m)}
            visible={false}
            material={MAT.chrome}
            position={[0.13, Math.cos((i * Math.PI) / 2) * 0.06, Math.sin((i * Math.PI) / 2) * 0.06]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.012, 0.012, 0.03, 6]} />
          </mesh>
        ))}
    </group>
  );
}

function SpinGroup({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (enabled && g.current) g.current.rotation.x = anim.wheelAngle;
  });
  return <group ref={g}>{children}</group>;
}

function PartVisual({ socket, partId }: { socket: string; partId: string }) {
  const s = TEMPLATE.sockets[socket];
  const part = PART_BY_ID[partId];
  const paint = usePaintMaterial();
  const ov = TEMPLATE.overrides[socket]?.[partId];
  const fit = useMemo(() => ({ size: s.size }), [s.size]);
  return (
    <group position={ov?.offset ?? [0, 0, 0]} rotation={(ov?.rotation ?? [0, 0, 0]).map((d) => d * DEG) as [number, number, number]} scale={ov?.scale ?? 1}>
      <AssetModel
        id={part.id}
        match={part.match}
        fit={fit}
        paint={BODY_SLOTS.has(part.slot) ? paint : undefined}
        fallback={<ProcPart part={part} socket={s} name={socket} />}
      />
    </group>
  );
}

function SocketPart({ socket, partId }: { socket: string; partId: string }) {
  const s = TEMPLATE.sockets[socket];
  const part = PART_BY_ID[partId];
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  const hover = useGame((st) => st.ui.hoverSocket === socket);
  const focus = useGame((st) => st.ui.focusSocket === socket);
  const worn = useGame((st) => st.car.worn.includes(socket));
  const root = useRef<THREE.Group>(null);
  const down = useRef<{ x: number; y: number; h: number; moved: boolean; dragObj: { dragging: boolean } | null } | null>(null);

  if (!part || !s) return null;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const st = useGame.getState();
    const h = s.hinge ? st.car.hinges[socket] ?? 0 : 0;
    let dragObj: { dragging: boolean } | null = null;
    e.eventObject.traverseAncestors((a) => {
      if (a.userData.hingeSocket === socket) dragObj = a.userData.drag;
    });
    down.current = { x: e.clientX, y: e.clientY, h, moved: false, dragObj };
    const move = (ev: PointerEvent) => {
      const d = down.current;
      if (!d || !s.hinge || !root.current) return;
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      if (d.dragObj) d.dragObj.dragging = true;
      // Screen-space direction the panel tip moves when opening → project drag onto it.
      const tip = new THREE.Vector3(...s.size).multiplyScalar(0.5);
      const pivot = new THREE.Vector3(...s.hinge.pivot);
      const ax = new THREE.Vector3(...s.hinge.axis).normalize();
      const arm = tip.clone().sub(pivot);
      const a0 = arm.clone().applyAxisAngle(ax, openAngle(s.hinge) * d.h).add(pivot);
      const a1 = arm.clone().applyAxisAngle(ax, openAngle(s.hinge) * Math.min(1, d.h + 0.1)).add(pivot);
      const p0 = root.current.localToWorld(a0).project(camera);
      const p1 = root.current.localToWorld(a1).project(camera);
      const dir = new THREE.Vector2((p1.x - p0.x) * size.width / 2, -(p1.y - p0.y) * size.height / 2);
      const len2 = Math.max(dir.lengthSq(), 4);
      const dh = ((dx * dir.x + dy * dir.y) / len2) * 0.1;
      useGame.getState().setHinge(socket, d.h + dh);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = down.current;
      down.current = null;
      if (d?.dragObj) d.dragObj.dragging = false;
      if (d?.moved) return;
      const g = useGame.getState();
      if (s.hinge && (g.ui.focusSocket === socket || !g.ui.selectedPart)) g.toggleHinge(socket);
      g.setUI({ focusSocket: socket });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <group position={s.pos} rotation={(s.rot ?? [0, 0, 0]).map((d) => d * DEG) as [number, number, number]} scale={[s.mirror ? -1 : 1, 1, 1]}>
      <group ref={root}>
        <HingeGroup socket={socket} hinge={s.hinge}>
          <FxGroup socket={socket} bolts={part.slot === 'wheel'}>
            <group
              onPointerOver={(e) => {
                e.stopPropagation();
                useGame.getState().setUI({ hoverSocket: socket });
              }}
              onPointerOut={() => useGame.getState().ui.hoverSocket === socket && useGame.getState().setUI({ hoverSocket: null })}
              onPointerDown={onDown}
            >
              <SpinGroup enabled={SPIN_SLOTS.has(part.slot)}>
                <PartVisual socket={socket} partId={partId} />
              </SpinGroup>
            </group>
          </FxGroup>
          {(hover || focus) && (
            <mesh material={MAT.hover} raycast={() => null}>
              <boxGeometry args={[s.size[0] + 0.04, s.size[1] + 0.04, s.size[2] + 0.04]} />
            </mesh>
          )}
        </HingeGroup>
      </group>
      {hover && (
        <Html position={[0, s.size[1] / 2 + 0.12, 0]} center className="tag" zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag-inner">
            <span className="tag-k">{s.label}</span>
            <span>{part.name}</span>
            {worn && <span className="tag-warn">worn</span>}
            <span className="tag-hint">{s.hinge ? 'click: open/close · drag: swing' : 'F: focus'}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Ghost() {
  const partId = useGame((s) => s.ui.selectedPart);
  const socket = useGame((s) => s.ui.ghostSocket);
  const state = useGame();
  const g = useRef<THREE.Group>(null);
  const ranked = useMemo(() => (partId ? rankSockets(ctxOf(state), partId) : []), [partId, state]);
  const entry = ranked.find((r) => r.socket === socket);
  const ok = !!entry?.verdict.ok;
  const mat = ok ? MAT.ghostOk : MAT.ghostBad;

  useLayoutEffect(() => {
    g.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = mat;
        m.castShadow = false;
        m.raycast = () => null;
      }
    });
  });
  useFrame(({ clock }) => {
    mat.opacity = 0.22 + 0.12 * Math.sin(clock.elapsedTime * 6);
  });

  if (!partId || !socket) return null;
  const s = TEMPLATE.sockets[socket];
  const part = PART_BY_ID[partId];
  return (
    <group position={s.pos} rotation={(s.rot ?? [0, 0, 0]).map((d) => d * DEG) as [number, number, number]} scale={[s.mirror ? -1 : 1, 1, 1]}>
      <group ref={g} onClick={(e) => (e.stopPropagation(), useGame.getState().confirmAttach())}>
        <ProcPart part={part} socket={s} name={socket} />
      </group>
      <Html position={[0, s.size[1] / 2 + 0.18, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`ghost-tag ${ok ? 'ok' : 'bad'}`}>
          <b>{s.label}</b> {ok ? (entry?.occupied ? '· swap — click to fit' : '· click to fit') : `· ${entry?.verdict.reason}`}
        </div>
      </Html>
    </group>
  );
}

function ComMarker() {
  const sockets = useGame((s) => s.car.sockets);
  const com = useMemo(() => computeStats({ sockets }).com, [sockets]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => ref.current?.scale.setScalar(1 + 0.15 * Math.sin(clock.elapsedTime * 4)));
  return (
    <group position={com}>
      <mesh ref={ref} material={MAT.accent} raycast={() => null}>
        <sphereGeometry args={[0.035, 16, 12]} />
      </mesh>
      <mesh position={[0, -com[1] / 2, 0]} material={MAT.accent} raycast={() => null}>
        <cylinderGeometry args={[0.003, 0.003, com[1], 4]} />
      </mesh>
    </group>
  );
}

export function CarRig() {
  const sockets = useGame((s) => s.car.sockets);
  const station = useGame((s) => s.car.station);
  const mode = useGame((s) => s.mode);
  const group = useRef<THREE.Group>(null);
  const base = STATION_POS[station];
  const [showCom] = useState(true);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.position.set(base[0], base[1] + (station === 'lift' ? anim.liftH : 0), base[2]);
    anim.wheelAngle += anim.wheelOmega * dt;
  });

  return (
    <PaintProvider>
      <group ref={group} name="car">
        <AssetModel id={TEMPLATE.frame} fit={{ size: [1.7, 0.9, 4.3], clamp: [0.5, 2] }} fallback={<ProcFrame />} />
        {Object.entries(sockets).map(([sock, id]) => (
          <SocketPart key={sock + id} socket={sock} partId={id} />
        ))}
        <Ghost />
        {showCom && mode !== 'menu' && <ComMarker />}
      </group>
    </PaintProvider>
  );
}
