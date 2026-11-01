import { useMemo, useState } from 'react';
import { PARTS, SLOT_LABEL, SLOT_ORDER, TEMPLATE, formatINR, type Part } from '../car/catalog';
import { rankSockets } from '../car/assembly';
import { resolveAsset } from '../assets/manifest';
import { ctxOf, isCreative, partUnlocked, useGame } from '../store/game';

function partBadge(p: Part) {
  const s = p.stats;
  if (s.engine) return `${s.engine.peakHp} hp · ${s.engine.peakNm} Nm`;
  if (s.powerMul) return `${s.powerMul >= 1 ? '+' : '−'}${Math.abs((s.powerMul - 1) * 100).toFixed(0)}% power${s.spoolLag ? ' · lag' : ''}`;
  if (s.mu) return `μ ${s.mu}`;
  if (s.brakeFactor) return `brake ×${s.brakeFactor}`;
  if (s.stiffness != null) return `stiffness ${s.stiffness}`;
  if (s.gearbox) return `${s.gearbox.ratios.length}-spd · ${s.gearbox.drive}`;
  if (s.downforce) return `downforce ${s.downforce}`;
  if (s.cd) return `Cd ${s.cd}`;
  return '';
}

export function Inventory() {
  const open = useGame((s) => s.ui.inventoryOpen);
  const selected = useGame((s) => s.ui.selectedPart);
  const focus = useGame((s) => s.ui.focusSocket);
  const mode = useGame((s) => s.mode);
  const inv = useGame((s) => s.career.inventory);
  const state = useGame();
  const [q, setQ] = useState('');
  const [onlyFit, setOnlyFit] = useState(false);
  const focusSlot = focus ? TEMPLATE.sockets[focus].slot : null;

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return SLOT_ORDER.map((slot) => ({
      slot,
      parts: PARTS.filter((p) => p.slot === slot && (!ql || p.name.toLowerCase().includes(ql) || p.id.toLowerCase().includes(ql)) && (!onlyFit || !focusSlot || p.slot === focusSlot)),
    })).filter((g) => g.parts.length);
  }, [q, onlyFit, focusSlot]);

  if (!open) return null;
  const ctx = ctxOf(state);
  return (
    <aside className="panel inventory" onWheel={(e) => e.stopPropagation()}>
      <header>
        <span>Parts</span>
        <button className="icon-btn" onClick={() => state.setUI({ inventoryOpen: false })} aria-label="Close inventory">×</button>
      </header>
      <div className="inv-tools">
        <input placeholder="Search parts" value={q} onChange={(e) => setQ(e.target.value)} />
        {focusSlot && (
          <label className="chk">
            <input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} /> fits {TEMPLATE.sockets[focus!].label.toLowerCase()}
          </label>
        )}
      </div>
      <div className="inv-list">
        {groups.map((g) => (
          <div key={g.slot} className="inv-group">
            <h4>{SLOT_LABEL[g.slot]}</h4>
            {g.parts.map((p) => {
              const locked = !partUnlocked(state, p.id);
              const owned = inv[p.id] ?? 0;
              const best = rankSockets(ctx, p.id)[0];
              const fitsNow = best?.verdict.ok;
              const asset = resolveAsset(p.id, p.match);
              return (
                <button
                  key={p.id}
                  className={`inv-item ${selected === p.id ? 'sel' : ''} ${locked ? 'locked' : ''}`}
                  disabled={locked}
                  onClick={() => state.selectPart(selected === p.id ? null : p.id)}
                  title={locked ? 'Unlock by completing jobs' : best?.verdict.reason ?? 'Click to preview, click again to fit'}
                >
                  {asset?.thumb ? <img src={`${import.meta.env.BASE_URL}${asset.thumb}`} alt="" loading="lazy" /> : <span className={`dot ${fitsNow ? 'ok' : ''}`} />}
                  <span className="inv-name">
                    {p.name}
                    {p.kit && <em className="kit">{p.kit.toUpperCase()}</em>}
                    <small>{partBadge(p)} · {p.mass} kg</small>
                  </span>
                  <span className="inv-price mono">
                    {isCreative({ mode }) ? 'free' : locked ? 'locked' : owned ? `×${owned}` : formatINR(p.price)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <footer className="fine">Click to ghost at the nearest valid socket · click again (or Enter) to fit · [ ] cycle sockets</footer>
    </aside>
  );
}
