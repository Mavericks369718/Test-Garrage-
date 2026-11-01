/**
 * /lab — Fit-Check tool. Loads the car frame, lets you pick a socket + part, drag it with a gizmo,
 * and save offset / rotation / scale per (socket, part). Saved to localStorage immediately; in dev it also writes
 * src/data/car-templates.json through a Vite middleware; "Export JSON" works everywhere.
 */
import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import templateJson from '../data/car-templates.json';
import { PARTS, PART_BY_ID, SLOT_LABEL, TEMPLATE, saveLabOverrides, type SocketOverride, type Vec3 } from '../car/catalog';
import { ProcFrame, ProcPart } from '../car/ProcParts';
import { PaintProvider, usePaintMaterial } from '../car/paint';
import { AssetModel } from '../assets/loader';
import { resolveAsset } from '../assets/manifest';

const DEG = Math.PI / 180;
const BODY = new Set(['hood', 'trunk', 'doorFront', 'doorRear', 'fenderFront', 'fenderRear', 'bumperF', 'bumperR', 'roof', 'mirror', 'skirt', 'spoiler']);
const ID: SocketOverride = { offset: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };

function LabPart({ socket, partId, ov, selected, onObject }: { socket: string; partId: string; ov: SocketOverride; selected: boolean; onObject?: (o: THREE.Object3D | null) => void }) {
  const s = TEMPLATE.sockets[socket];
  const p = PART_BY_ID[partId];
  const paint = usePaintMaterial();
  return (
    <group position={s.pos} rotation={(s.rot ?? [0, 0, 0]).map((d) => d * DEG) as Vec3} scale={[s.mirror ? -1 : 1, 1, 1]}>
      <group ref={selected ? onObject : undefined} position={ov.offset} rotation={ov.rotation.map((d) => d * DEG) as Vec3} scale={ov.scale}>
        <AssetModel id={p.id} match={p.match} fit={{ size: s.size }} paint={BODY.has(p.slot) ? paint : undefined} fallback={<ProcPart part={p} socket={s} name={socket} />} />
      </group>
      {selected && (
        <mesh>
          <boxGeometry args={s.size} />
          <meshBasicMaterial color="#FF5A1F" wireframe transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

export function Lab() {
  const [overrides, setOverrides] = useState(() => structuredClone(TEMPLATE.overrides));
  const [kit, setKit] = useState<'A' | 'B' | 'C'>('A');
  const [socket, setSocket] = useState('hood');
  const [partId, setPartId] = useState(TEMPLATE.kits.A.sockets.hood);
  const [showKit, setShowKit] = useState(true);
  const [gizmo, setGizmo] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const [status, setStatus] = useState('');
  const dragging = useRef(false);

  const s = TEMPLATE.sockets[socket];
  const ov: SocketOverride = overrides[socket]?.[partId] ?? ID;
  const candidates = useMemo(() => PARTS.filter((p) => p.slot === s.slot), [s.slot]);
  const kitSockets = TEMPLATE.kits[kit].sockets;

  const setOv = (next: SocketOverride) => {
    const o = { ...overrides, [socket]: { ...(overrides[socket] ?? {}), [partId]: next } };
    setOverrides(o);
    saveLabOverrides(o);
  };

  const commitFromObject = () => {
    if (!target) return;
    const r = new THREE.Euler().setFromQuaternion(target.quaternion);
    setOv({
      offset: target.position.toArray().map((v) => +v.toFixed(4)) as Vec3,
      rotation: [r.x, r.y, r.z].map((v) => +(v / DEG).toFixed(2)) as Vec3,
      scale: +target.scale.x.toFixed(4),
    });
  };

  const fullJson = () => JSON.stringify({ ...templateJson, overrides }, null, 1);

  const saveToRepo = async () => {
    try {
      const res = await fetch('/__lab/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: fullJson() });
      setStatus(res.ok ? 'Saved to src/data/car-templates.json' : 'Dev server not available — use Export JSON');
    } catch {
      setStatus('Dev server not available — use Export JSON');
    }
  };

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([fullJson()], { type: 'application/json' }));
    a.download = 'car-templates.json';
    a.click();
  };

  const slotSockets = Object.keys(TEMPLATE.sockets);
  return (
    <div className="lab">
      <aside className="panel lab-side">
        <header>
          <span>Fit-check lab</span>
          <a className="btn ghost" href={import.meta.env.BASE_URL}>← Garage</a>
        </header>
        <div className="lab-body">
          <label className="lab-field">Kit preview
            <select value={kit} onChange={(e) => setKit(e.target.value as 'A' | 'B' | 'C')}>
              {Object.entries(TEMPLATE.kits).map(([k, v]) => <option key={k} value={k}>Kit {k} · {v.name}</option>)}
            </select>
          </label>
          <label className="chk"><input type="checkbox" checked={showKit} onChange={(e) => setShowKit(e.target.checked)} /> show whole kit</label>
          <label className="lab-field">Socket
            <select value={socket} onChange={(e) => {
              const ns = e.target.value;
              setSocket(ns);
              setPartId(kitSockets[ns] ?? PARTS.find((p) => p.slot === TEMPLATE.sockets[ns].slot)!.id);
            }}>
              {slotSockets.map((n) => <option key={n} value={n}>{n} — {SLOT_LABEL[TEMPLATE.sockets[n].slot]}</option>)}
            </select>
          </label>
          <label className="lab-field">Part
            <select value={partId} onChange={(e) => setPartId(e.target.value)}>
              {candidates.map((p) => <option key={p.id} value={p.id}>{p.name} {resolveAsset(p.id, p.match) ? '' : '(procedural)'}</option>)}
            </select>
          </label>
          <div className="mono dim fine">
            asset: {resolveAsset(PART_BY_ID[partId].id, PART_BY_ID[partId].match)?.id ?? 'none in manifest → procedural'}<br />
            target size: {s.size.join(' × ')} m
          </div>
          <div className="btn-row">
            {(['translate', 'rotate', 'scale'] as const).map((g) => (
              <button key={g} className={`chip ${gizmo === g ? 'on' : ''}`} onClick={() => setGizmo(g)}>{g}</button>
            ))}
          </div>
          {(['offset', 'rotation'] as const).map((k) => (
            <div key={k} className="lab-vec">
              <span>{k}</span>
              {[0, 1, 2].map((i) => (
                <input key={i} type="number" step={k === 'offset' ? 0.005 : 1} value={ov[k][i]} onChange={(e) => {
                  const v = [...ov[k]] as Vec3;
                  v[i] = +e.target.value;
                  setOv({ ...ov, [k]: v });
                }} />
              ))}
            </div>
          ))}
          <div className="lab-vec">
            <span>scale</span>
            <input type="number" step={0.01} min={0.85} max={1.15} value={ov.scale} onChange={(e) => setOv({ ...ov, scale: Math.min(1.15, Math.max(0.85, +e.target.value)) })} />
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => setOv(ID)}>Reset</button>
            <button className="btn accent" onClick={saveToRepo}>Save to repo</button>
            <button className="btn" onClick={exportJson}>Export JSON</button>
          </div>
          {status && <p className="fine">{status}</p>}
          <p className="fine dim">Auto-fit scales each part toward its socket size (clamped 0.85–1.15). Your offset/rotation/scale are applied on top. Overrides persist in this browser and in the exported car-templates.json.</p>
        </div>
      </aside>
      <Canvas shadows camera={{ position: [3.6, 2.2, 4.2], fov: 40 }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; }}>
        <color attach="background" args={['#111214']} />
        <Environment resolution={128} environmentIntensity={0.6}>
          <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
          <Lightformer form="rect" intensity={1} position={[5, 2, 5]} scale={[4, 3, 1]} color="#ffd2a8" />
        </Environment>
        <directionalLight position={[4, 6, 3]} intensity={1.6} castShadow />
        <Grid infiniteGrid cellSize={0.1} sectionSize={1} cellColor="#222" sectionColor="#3a3a3a" fadeDistance={20} />
        <PaintProvider>
          <AssetModel id={TEMPLATE.frame} fit={{ size: [1.7, 0.9, 4.3], clamp: [0.5, 2] }} fallback={<ProcFrame />} />
          {showKit && Object.entries(kitSockets).filter(([n]) => n !== socket).map(([n, id]) => (
            <LabPart key={n} socket={n} partId={id} ov={overrides[n]?.[id] ?? ID} selected={false} />
          ))}
          <LabPart key={socket + partId} socket={socket} partId={partId} ov={ov} selected onObject={setTarget} />
        </PaintProvider>
        {target && (
          <TransformControls
            object={target}
            mode={gizmo}
            size={0.7}
            onMouseDown={() => (dragging.current = true)}
            onMouseUp={() => { dragging.current = false; commitFromObject(); }}
          />
        )}
        <ContactShadows scale={8} blur={2} opacity={0.6} far={2} />
        <OrbitControls makeDefault target={[0, 0.6, 0]} />
      </Canvas>
    </div>
  );
}
