import { useEffect, useMemo, useState } from 'react';
import { PART_BY_ID, TEMPLATE, formatINR } from '../car/catalog';
import { canRemove, nextSteps } from '../car/assembly';
import { ZONES, isMobile } from '../scene/Zones';
import { anim } from '../scene/anim';
import { ctxOf, isCreative, isUnlockedZone, useGame, type Station } from '../store/game';
import { computeStats } from '../sim/stats';
import { sfx } from '../audio/sfx';
import { StatsPanel } from './StatsPanel';
import { Inventory } from './Inventory';
import { ActiveJob, Panels } from './Panels';
import { DynoChart } from './DynoChart';

function Toast() {
  const toast = useGame((s) => s.ui.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), toast.tone === 'warn' ? 2600 : 3200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return <div className={`toast ${toast.tone} ${visible ? 'in' : ''}`}>{toast.text}</div>;
}

function FocusCard() {
  const focus = useGame((s) => s.ui.focusSocket);
  const state = useGame();
  if (!focus) return null;
  const s = TEMPLATE.sockets[focus];
  const id = state.car.sockets[focus];
  const part = id ? PART_BY_ID[id] : null;
  const ctx = ctxOf(state);
  const rem = canRemove(ctx, focus);
  const worn = state.car.worn.includes(focus);
  return (
    <section className="panel focus">
      <header>
        <span>{s.label}</span>
        <button className="icon-btn" onClick={() => state.setUI({ focusSocket: null })} aria-label="Close">×</button>
      </header>
      {part ? (
        <div className="focus-body">
          <div className="focus-name">
            {part.name} {worn && <span className="pill warn">worn</span>}
          </div>
          <div className="mono dim">{part.mass} kg · {formatINR(part.price)}</div>
          {part.note && <p className="fine">{part.note}</p>}
          <div className="btn-row">
            {s.hinge && (
              <button className="btn" onClick={() => state.toggleHinge(focus)}>
                {(state.car.hinges[focus] ?? 0) > 0.5 ? 'Close' : 'Open'}
              </button>
            )}
            <button className="btn" onClick={() => state.setUI({ inventoryOpen: true })}>Swap…</button>
            <button className="btn" disabled={!rem.ok} title={rem.reason} onClick={() => state.remove(focus, 'inventory')}>Remove</button>
            {!isCreative(state) && <button className="btn" disabled={!rem.ok} title={rem.reason} onClick={() => state.remove(focus, 'sell')}>Sell 40%</button>}
            <button className="btn ghost" disabled={!rem.ok} title={rem.reason} onClick={() => state.remove(focus, 'drop')}>Drop</button>
          </div>
          {!rem.ok && <p className="fine warn">{rem.reason}</p>}
        </div>
      ) : (
        <div className="focus-body dim">Empty socket. Open the parts list to fit something.</div>
      )}
    </section>
  );
}

const STATIONS: { id: Station; label: string; zone: string }[] = [
  { id: 'lift', label: 'Lift', zone: 'A' },
  { id: 'build', label: 'Build bay', zone: 'B' },
  { id: 'booth', label: 'Paint booth', zone: 'E' },
  { id: 'dyno', label: 'Dyno', zone: 'G' },
];

function StationBar() {
  const state = useGame();
  const station = state.car.station;
  const st = useMemo(() => computeStats({ sockets: state.car.sockets }), [state.car.sockets]);
  return (
    <div className="station-bar panel">
      <span className="dim lbl">Car at</span>
      {STATIONS.map((s) => {
        const ok = isUnlockedZone(state, s.zone);
        const needsWheels = s.id !== 'build' && s.id !== 'lift' && !st.driveable && s.id === 'dyno';
        return (
          <button
            key={s.id}
            className={`chip ${station === s.id ? 'on' : ''}`}
            disabled={!ok || needsWheels}
            title={!ok ? 'Unlock in Garage upgrades' : needsWheels ? `Needs a complete drivetrain (${st.missing.join(', ')})` : ''}
            onClick={() => {
              sfx.play('click');
              state.setStation(s.id);
            }}
          >
            {s.label}
          </button>
        );
      })}
      {station === 'lift' && (
        <>
          <span className="sep" />
          <button className="chip" onClick={() => state.setUI({ liftTarget: 1 })}>Raise</button>
          <button className="chip" onClick={() => state.setUI({ liftTarget: 0 })}>Lower</button>
        </>
      )}
    </div>
  );
}

function ZoneBar() {
  const zone = useGame((s) => s.ui.zone);
  const state = useGame();
  return (
    <nav className="zone-bar">
      {ZONES.map((z) => (
        <button
          key={z.id}
          className={`zone ${zone === z.id ? 'on' : ''} ${isUnlockedZone(state, z.id) ? '' : 'locked'}`}
          onClick={() => state.setUI({ zone: z.id, focusSocket: null, cameraMode: state.ui.cameraMode === 'dyno' ? 'orbit' : state.ui.cameraMode === 'walk' ? 'orbit' : state.ui.cameraMode })}
          title={z.name}
        >
          <b>{z.id}</b>
          <span>{z.name.split('·')[0].trim()}</span>
        </button>
      ))}
    </nav>
  );
}

const ONBOARDING: { text: string; done: (s: ReturnType<typeof useGame.getState>) => boolean }[] = [
  { text: 'Open the parts list — Tab (or the Parts button).', done: (s) => s.ui.inventoryOpen },
  { text: 'Fit the front and rear axles. Click a part to ghost it, click again to fit.', done: (s) => !!(s.car.sockets.axle_front && s.car.sockets.axle_rear) },
  { text: 'Struts, then brakes, on all four corners.', done: (s) => ['FL', 'FR', 'RL', 'RR'].every((c) => s.car.sockets[`brake_${c}`]) },
  { text: 'Wheels on — the impact wrench runs four bolts each.', done: (s) => ['FL', 'FR', 'RL', 'RR'].every((c) => s.car.sockets[`wheel_${c}`]) },
  { text: 'Hoist in an engine, then the transmission and exhaust.', done: (s) => !!(s.car.sockets.engine_bay && s.car.sockets.transmission) },
  { text: 'Interior, then body panels, glass and trim. “Auto-fit stage” speeds things up.', done: (s) => computeStats({ sockets: s.car.sockets }).driveable && !!s.car.sockets.hood && !!s.car.sockets.roof_panel },
];

function fitNextStage() {
  const s = useGame.getState();
  const next = nextSteps(ctxOf(s));
  if (!next.length) return s.toast('Every socket is filled', 'good');
  const stage = TEMPLATE.sockets[next[0]].stage;
  const kit = TEMPLATE.kits.A.sockets;
  let fitted = 0;
  for (const sock of next.filter((n) => TEMPLATE.sockets[n].stage === stage)) {
    if (kit[sock] && useGame.getState().attach(sock, kit[sock])) fitted++;
  }
  if (!fitted) s.toast('Nothing to auto-fit at this stage', 'warn');
}

function Onboarding() {
  const step = useGame((s) => s.ui.onboarding);
  const state = useGame();
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (step < 0) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [step]);
  useEffect(() => {
    if (step < 0) return;
    if (ONBOARDING[step]?.done(state)) {
      const next = step + 1;
      if (next >= ONBOARDING.length) {
        localStorage.setItem('torque-house:onboarded', '1');
        state.setUI({ onboarding: -1 });
        state.toast(`First build done in ${Math.round((Date.now() - t0) / 1000)} s`, 'good');
      } else state.setUI({ onboarding: next });
    }
  }, [state, step, t0]);
  if (step < 0) return null;
  return (
    <section className="panel onboarding">
      <header>
        <span>First build · {step + 1}/{ONBOARDING.length}</span>
        <span className="mono dim">{Math.round((now - t0) / 1000)} s</span>
      </header>
      <p>{ONBOARDING[step].text}</p>
      <footer>
        <button className="btn ghost" onClick={() => { localStorage.setItem('torque-house:onboarded', '1'); state.setUI({ onboarding: -1 }); }}>Skip</button>
        <button className="btn" onClick={fitNextStage}>Auto-fit stage</button>
      </footer>
    </section>
  );
}

export function HUD() {
  const mode = useGame((s) => s.mode);
  const money = useGame((s) => s.career.money);
  const cameraMode = useGame((s) => s.ui.cameraMode);
  const invOpen = useGame((s) => s.ui.inventoryOpen);
  const state = useGame.getState();
  const mobile = isMobile();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const i = setInterval(() => {
      if (anim.liftH > 0 && useGame.getState().car.station !== 'lift') anim.liftH = 0;
    }, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className={`hud ${mobile ? 'mobile' : ''} ${invOpen ? 'inv-open' : ''}`}>
      <div className="top-bar">
        <button className="brand" onClick={state.toMenu}>TORQUE<span>HOUSE</span></button>
        <span className="mode-pill">{mode === 'modify' ? 'Career' : mode === 'build' ? 'Build' : 'Free garage'}</span>
        <div className="spacer" />
        {mode === 'modify' && <span className="money mono">{formatINR(money)}</span>}
        {mode === 'modify' && (
          <>
            <button className="btn ghost" onClick={() => state.setUI({ panel: 'jobs' })}>Jobs</button>
            <button className="btn ghost" onClick={() => state.setUI({ panel: 'shop' })}>Store</button>
            <button className="btn ghost" onClick={() => state.setUI({ panel: 'upgrades' })}>Upgrades</button>
          </>
        )}
        {mode === 'build' && <button className="btn ghost" onClick={fitNextStage}>Auto-fit stage</button>}
        {mode === 'free' && (
          <>
            {Object.entries(TEMPLATE.kits).map(([k, kit]) => (
              <button key={k} className="btn ghost" title={`Load Kit ${k} (${kit.name})`} onClick={() => useGame.setState((s) => ({ car: { ...s.car, sockets: { ...kit.sockets }, worn: [] }, shadowVersion: s.shadowVersion + 1 }))}>
                Kit {k}
              </button>
            ))}
          </>
        )}
        <button className="btn ghost" onClick={() => state.setUI({ panel: 'saves' })}>Save</button>
        <button className="btn ghost" onClick={() => state.setUI({ panel: 'credits' })}>Credits</button>
        <button className="btn ghost" onClick={() => { sfx.setMuted(!muted); setMuted(!muted); }} aria-label="Mute">{muted ? 'Sound off' : 'Sound on'}</button>
      </div>

      <ZoneBar />
      <StationBar />

      <div className="left-col">
        <StatsPanel compact={mobile} />
        <ActiveJob />
        <Onboarding />
      </div>

      <div className="right-col">
        <FocusCard />
        <Panels />
        <DynoChart />
      </div>

      <Inventory />

      <div className="bottom-bar">
        <button className="btn accent" onClick={() => state.setUI({ inventoryOpen: !useGame.getState().ui.inventoryOpen })}>Parts {mobile ? '' : <kbd>Tab</kbd>}</button>
        <CustomFitBadge />
        {!mobile && (
          <span className="hint dim">
            {cameraMode === 'walk' ? 'WASD walk · Shift run · Esc to exit' : 'Drag orbit · F focus · WASD walk · [ ] cycle socket · Del remove'}
          </span>
        )}
      </div>
      <Toast />
    </div>
  );
}

function CustomFitBadge() {
  const sockets = useGame((s) => s.car.sockets);
  const label = useMemo(() => {
    const filled = Object.entries(sockets);
    if (!filled.length) return null;
    for (const [k, kit] of Object.entries(TEMPLATE.kits)) {
      if (filled.every(([sock, id]) => kit.sockets[sock] === id)) return { custom: false, text: `Kit ${k} · ${kit.name}` };
    }
    return { custom: true, text: 'Custom fit' };
  }, [sockets]);
  if (!label) return null;
  return <span className={`pill ${label.custom ? 'warn' : 'good'}`} title={label.custom ? 'Parts outside a verified kit — fits are auto-scaled' : 'Verified kit'}>{label.text}</span>;
}
