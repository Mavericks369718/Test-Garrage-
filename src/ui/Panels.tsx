import { useRef, useState } from 'react';
import { PARTS, TEMPLATE, formatINR } from '../car/catalog';
import { getManifest } from '../assets/manifest';
import { JOBS, ZONE_UPGRADES, checkObjective, partUnlocked, useGame, type Panel } from '../store/game';

function Shell({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  const setUI = useGame((s) => s.setUI);
  return (
    <div className="modal-back" onClick={() => setUI({ panel: 'none' })}>
      <section className={`panel modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <span>{title}</span>
          <button className="icon-btn" onClick={() => setUI({ panel: 'none' })} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function Jobs() {
  const career = useGame((s) => s.career);
  const startJob = useGame((s) => s.startJob);
  return (
    <Shell title="Job board" wide>
      <div className="jobs">
        {JOBS.map((j) => {
          const done = career.completed.includes(j.id);
          const needs = j.requiresZone && !career.zones.includes(j.requiresZone);
          return (
            <article key={j.id} className={`job ${done ? 'done' : ''}`}>
              <div className="job-head">
                <b>{j.title}</b>
                <span className="mono">{formatINR(j.reward)}</span>
              </div>
              <p>
                <span className="dim">{j.customer} · {TEMPLATE.kits[j.car.kit].name} kit</span>
                <br />“{j.brief}”
              </p>
              <div className="job-foot">
                <span className="mono dim">{j.budget ? `budget ${formatINR(j.budget)}` : 'labour only'}</span>
                {done ? (
                  <span className="pill good">done</span>
                ) : needs ? (
                  <span className="pill">needs {ZONE_UPGRADES.find((z) => z.zone === j.requiresZone)?.name}</span>
                ) : (
                  <button className="btn" onClick={() => startJob(j.id)} disabled={career.activeJob === j.id}>
                    {career.activeJob === j.id ? 'In progress' : 'Take job'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Shell>
  );
}

function Upgrades() {
  const career = useGame((s) => s.career);
  const buyZone = useGame((s) => s.buyZone);
  return (
    <Shell title="Garage upgrades">
      <p className="dim">Unlock order: Paint Booth → Dyno → Bay 2. Bay 2 also brings the transmission jack.</p>
      {ZONE_UPGRADES.map((u) => {
        const owned = career.zones.includes(u.zone);
        return (
          <div key={u.zone} className="row-line">
            <span>{u.zone} · {u.name}</span>
            {owned ? <span className="pill good">owned</span> : (
              <button className="btn" disabled={career.money < u.price} onClick={() => buyZone(u.zone)}>
                {formatINR(u.price)}
              </button>
            )}
          </div>
        );
      })}
    </Shell>
  );
}

function Shop() {
  const state = useGame();
  return (
    <Shell title="Parts store" wide>
      <p className="dim">Buying stocks your inventory. Selling a fitted part returns 40% of its value (worn parts 10%).</p>
      <div className="shop">
        {PARTS.map((p) => {
          const ok = partUnlocked(state, p.id);
          return (
            <div key={p.id} className="row-line">
              <span>
                {p.name} <small className="dim">· {p.mass} kg</small>
              </span>
              <span className="mono dim">×{state.career.inventory[p.id] ?? 0}</span>
              <button className="btn" disabled={!ok || state.career.money < p.price} onClick={() => state.buyPart(p.id)}>
                {ok ? formatINR(p.price) : 'locked'}
              </button>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

const SWATCHES = ['#8a1c1c', '#ff5a1f', '#f2c230', '#2f5d3a', '#1d4fa0', '#5b6670', '#c9ccd1', '#e8e8e6', '#101214', '#4b2a6b'];

function PaintPanel() {
  const paint = useGame((s) => s.car.paint);
  const coverage = useGame((s) => s.spray.coverage);
  const station = useGame((s) => s.car.station);
  const { setPaint, setPaintTarget, setUI } = useGame.getState();
  if (station !== 'booth') return null;
  return (
    <section className="panel paint">
      <header>
        <span>Paint booth</span>
        <span className="mono">{(coverage * 100).toFixed(0)}% coverage</span>
      </header>
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button key={c} className={`sw ${paint.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setPaintTarget(c)} aria-label={c} />
        ))}
        <input type="color" value={paint.color} onChange={(e) => setPaintTarget(e.target.value)} aria-label="Custom colour" />
      </div>
      <label className="slider">Metallic <input type="range" min={0} max={1} step={0.01} value={paint.metallic} onChange={(e) => setPaint({ metallic: +e.target.value })} /><span className="mono">{paint.metallic.toFixed(2)}</span></label>
      <label className="slider">Base roughness <input type="range" min={0.05} max={0.9} step={0.01} value={paint.roughness} onChange={(e) => setPaint({ roughness: +e.target.value })} /><span className="mono">{paint.roughness.toFixed(2)}</span></label>
      <label className="slider">Clearcoat <input type="range" min={0} max={1} step={0.01} value={paint.clearcoat} onChange={(e) => setPaint({ clearcoat: +e.target.value })} /><span className="mono">{paint.clearcoat.toFixed(2)}</span></label>
      <label className="slider">Clearcoat rough. <input type="range" min={0.05} max={0.15} step={0.005} value={paint.clearcoatRoughness} onChange={(e) => setPaint({ clearcoatRoughness: +e.target.value })} /><span className="mono">{paint.clearcoatRoughness.toFixed(3)}</span></label>
      <label className="chk"><input type="checkbox" checked={paint.flake} onChange={(e) => setPaint({ flake: e.target.checked })} /> metallic flake</label>
      <button
        className="btn accent spray-btn"
        disabled={coverage >= 1}
        onPointerDown={() => setUI({ spraying: true })}
        onPointerUp={() => setUI({ spraying: false })}
        onPointerLeave={() => setUI({ spraying: false })}
      >
        {coverage >= 1 ? 'Pick a colour to respray' : 'Hold to spray'}
      </button>
    </section>
  );
}

function Saves() {
  const exportBuild = useGame((s) => s.exportBuild);
  const importBuild = useGame((s) => s.importBuild);
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  return (
    <Shell title="Save · export · import">
      <p className="dim">Progress autosaves to this browser. Builds can be exported as JSON and imported anywhere.</p>
      <div className="row-line">
        <button
          className="btn"
          onClick={() => {
            const blob = new Blob([exportBuild()], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `torque-house-build-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Export build (.json)
        </button>
        <button className="btn" onClick={() => file.current?.click()}>Import build…</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) importBuild(await f.text());
          e.target.value = '';
        }} />
      </div>
      <textarea className="mono" placeholder="…or paste build JSON here" value={text} onChange={(e) => setText(e.target.value)} rows={5} />
      <div className="row-line">
        <button className="btn" disabled={!text} onClick={() => importBuild(text) && setText('')}>Import pasted JSON</button>
        <button className="btn danger" onClick={() => { if (confirm('Erase career progress on this device?')) { localStorage.removeItem('torque-house:save'); location.reload(); } }}>Reset career</button>
      </div>
    </Shell>
  );
}

export function Credits({ onClose }: { onClose?: () => void }) {
  const m = getManifest();
  const body = (
    <div className="credits">
      <h3>3D models</h3>
      <p>
        NVIDIA SimReady Assets (CC BY 4.0) — <a href="https://huggingface.co/datasets/nvidia/simready-assets" target="_blank" rel="noreferrer">huggingface.co/datasets/nvidia/simready-assets</a> — web
        conversion by <a href="https://huggingface.co/datasets/codepawl/simready-glb" target="_blank" rel="noreferrer">codepawl/simready-glb</a>. Models were simplified and recompressed for this game.
      </p>
      <p className="dim">{m.assets.length ? `${m.assets.length} SimReady assets loaded via manifest (${m.ktx2 ? 'KTX2' : 'WebP'} textures).` : 'No SimReady assets built yet — the garage is using procedural stand-ins.'}</p>
      <h3>Built with</h3>
      <p className="dim">three.js · React Three Fiber · drei · Rapier · zustand · Howler.js · glTF-Transform · meshoptimizer</p>
      <h3>Numbers</h3>
      <p className="dim">Engine outputs and part stats are gameplay values, not manufacturer data.</p>
    </div>
  );
  if (onClose) return (
    <div className="modal-back" onClick={onClose}>
      <section className="panel modal" onClick={(e) => e.stopPropagation()}>
        <header><span>Credits</span><button className="icon-btn" onClick={onClose}>×</button></header>
        <div className="modal-body">{body}</div>
      </section>
    </div>
  );
  return <Shell title="Credits">{body}</Shell>;
}

export function ActiveJob() {
  const state = useGame();
  const job = JOBS.find((j) => j.id === state.career.activeJob);
  if (!job || state.mode === 'free') return null;
  const results = job.objectives.map((o) => checkObjective(o, state));
  const over = job.budget > 0 && state.career.jobSpend > job.budget;
  return (
    <section className="panel job-card">
      <header>
        <span>{job.title}</span>
        <span className="mono">{formatINR(job.reward)}</span>
      </header>
      <ul>
        {results.map((r, i) => (
          <li key={i} className={r.ok ? 'ok' : ''}>
            <span>{r.ok ? '■' : '□'} {r.label}</span>
            <span className="mono">{r.value}</span>
          </li>
        ))}
        {job.budget > 0 && (
          <li className={over ? 'bad' : 'ok'}>
            <span>{over ? '□' : '■'} Parts spend</span>
            <span className="mono">{formatINR(state.career.jobSpend)} / {formatINR(job.budget)}</span>
          </li>
        )}
      </ul>
      <footer>
        <button className="btn ghost" onClick={state.abandonJob}>Abandon</button>
        <button className="btn accent" onClick={state.completeJob}>Hand over keys</button>
      </footer>
    </section>
  );
}

export function Panels() {
  const panel = useGame((s) => s.ui.panel) as Panel;
  return (
    <>
      {panel === 'jobs' && <Jobs />}
      {panel === 'upgrades' && <Upgrades />}
      {panel === 'shop' && <Shop />}
      {panel === 'saves' && <Saves />}
      {panel === 'credits' && <Credits />}
      <PaintPanel />
    </>
  );
}

