import { useMemo, useState } from 'react';
import { computeStats, WHY } from '../sim/stats';
import { useGame } from '../store/game';

const fmt = (n: number, d = 1, unit = '') => (Number.isFinite(n) && n > 0 ? `${n.toFixed(d)}${unit}` : '—');

function Row({ k, label, value, sub }: { k: string; label: string; value: string; sub?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">
        {value}
        {sub && <small>{sub}</small>}
      </span>
      {WHY[k] && (
        <button className={`why ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-label={`Why: ${label}`} onBlur={() => setOpen(false)}>
          ?
          {open && <span className="why-pop">{WHY[k]}</span>}
        </button>
      )}
    </div>
  );
}

export function StatsPanel({ compact }: { compact?: boolean }) {
  const sockets = useGame((s) => s.car.sockets);
  const worn = useGame((s) => s.car.worn);
  const st = useMemo(() => computeStats({ sockets, worn }), [sockets, worn]);
  const [collapsed, setCollapsed] = useState(compact ?? false);
  return (
    <section className={`panel stats ${collapsed ? 'collapsed' : ''}`}>
      <header onClick={() => setCollapsed(!collapsed)}>
        <span>Build sheet</span>
        <span className="mono dim">{st.driveable ? 'ROADWORTHY' : `MISSING: ${st.missing.join(', ').toUpperCase()}`}</span>
      </header>
      {!collapsed && (
        <div className="stat-grid">
          <Row k="hp" label="Power" value={fmt(st.hp, 0, ' hp')} sub={st.hp ? ` @ ${st.hpRpm}` : ''} />
          <Row k="hp" label="Torque" value={fmt(st.nm, 0, ' Nm')} sub={st.nm ? ` @ ${st.nmRpm}` : ''} />
          <Row k="mass" label="Mass" value={fmt(st.mass, 0, ' kg')} />
          <Row k="com" label="Balance F/R" value={`${st.frontPct.toFixed(1)} / ${(100 - st.frontPct).toFixed(1)}`} sub=" %" />
          <Row k="powerToWeight" label="hp / tonne" value={fmt(st.powerToWeight, 0)} />
          <Row k="zeroHundred" label="0–100 km/h" value={fmt(st.zeroHundred, 2, ' s')} />
          <Row k="quarterMile" label="¼ mile" value={fmt(st.quarterMile, 2, ' s')} sub={st.trapKmh ? ` · ${st.trapKmh.toFixed(0)} km/h` : ''} />
          <Row k="topKmh" label="Top speed" value={fmt(st.topKmh, 0, ' km/h')} sub={st.topKmh ? ` · ${st.topLimitedBy}` : ''} />
          <Row k="braking" label="100–0" value={fmt(st.braking, 1, ' m')} />
          <Row k="handling" label="Handling" value={`${st.handling}`} sub=" /100" />
          <Row k="mu" label="Tyre μ" value={st.mu.toFixed(2)} />
          <Row k="cd" label="Cd" value={st.cd.toFixed(3)} />
          <div className="bar-row">
            <span className="stat-label">Handling</span>
            <div className="bar">
              <i style={{ width: `${st.handling}%` }} />
            </div>
          </div>
          <p className="fine">Engine figures are gameplay values, not manufacturer data.</p>
        </div>
      )}
    </section>
  );
}
