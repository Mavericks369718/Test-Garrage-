import { useState } from 'react';
import { formatINR } from '../car/catalog';
import { useProgress } from '../assets/progress';
import { getManifest } from '../assets/manifest';
import { useGame } from '../store/game';
import { Credits } from './Panels';

export function LoadBar() {
  const { loaded, total, inflight } = useProgress();
  if (!total || (!inflight && loaded >= total)) return null;
  const pct = Math.min(100, (loaded / total) * 100);
  return (
    <div className="loadbar">
      <div className="loadbar-track">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="mono">
        {(loaded / 1048576).toFixed(1)} MB / {(total / 1048576).toFixed(1)} MB
      </span>
    </div>
  );
}

export function Menu() {
  const career = useGame((s) => s.career);
  const newGame = useGame((s) => s.newGame);
  const [credits, setCredits] = useState(false);
  const hasAssets = getManifest().assets.length > 0;
  return (
    <div className="menu">
      <div className="menu-card">
        <div className="logo">
          TORQUE<span>HOUSE</span>
        </div>
        <p className="tag">Build, modify and dyno-test cars in a late-night performance shop.</p>
        <div className="menu-actions">
          <button className="menu-btn primary" onClick={() => newGame('modify')}>
            <b>Career</b>
            <span>Customer jobs · {formatINR(career.money)} · {career.completed.length}/10 done</span>
          </button>
          <button className="menu-btn" onClick={() => newGame('build')}>
            <b>Build</b>
            <span>Bare frame on the build platform. Assemble in order.</span>
          </button>
          <button className="menu-btn" onClick={() => newGame('free')}>
            <b>Free garage</b>
            <span>Sandbox · every part and zone unlocked.</span>
          </button>
          <a className="menu-btn" href={`${import.meta.env.BASE_URL}lab`}>
            <b>Fit-check lab</b>
            <span>Align parts to sockets · export car-templates.json</span>
          </a>
        </div>
        <div className="menu-foot">
          <button className="link" onClick={() => setCredits(true)}>Credits</button>
          <span className="dim mono">{hasAssets ? `${getManifest().assets.length} SimReady assets` : 'procedural assets · run npm run assets:build for SimReady models'}</span>
        </div>
      </div>
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  );
}
