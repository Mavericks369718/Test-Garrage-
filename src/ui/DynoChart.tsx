import { useEffect, useRef } from 'react';
import { useDyno } from '../sim/dynoStore';
import { useGame } from '../store/game';

const POWER = '#FF5A1F';
const TORQUE = '#7cc4ff';

/** Live torque + power chart: thin lines, mono labels, drawn on a 2D canvas each update. */
export function DynoChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { samples, running, peakHp, peakNm, redline } = useDyno();
  const station = useGame((s) => s.car.station);
  const runningUI = useGame((s) => s.ui.dynoRunning);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const c = cv.getContext('2d')!;
    c.scale(dpr, dpr);
    c.clearRect(0, 0, W, H);
    const pad = { l: 40, r: 40, t: 14, b: 22 };
    const maxRpm = Math.ceil(redline / 1000) * 1000;
    const maxHp = Math.max(200, Math.ceil((peakHp * 1.15) / 100) * 100);
    const maxNm = Math.max(200, Math.ceil((peakNm * 1.15) / 100) * 100);
    const x = (rpm: number) => pad.l + ((rpm - 1000) / (maxRpm - 1000)) * (W - pad.l - pad.r);
    const yH = (v: number) => H - pad.b - (v / maxHp) * (H - pad.t - pad.b);
    const yN = (v: number) => H - pad.b - (v / maxNm) * (H - pad.t - pad.b);
    c.font = '10px "JetBrains Mono", ui-monospace, monospace';
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.lineWidth = 1;
    c.fillStyle = 'rgba(255,255,255,0.4)';
    for (let r = 1000; r <= maxRpm; r += 1000) {
      c.beginPath();
      c.moveTo(Math.round(x(r)) + 0.5, pad.t);
      c.lineTo(Math.round(x(r)) + 0.5, H - pad.b);
      c.stroke();
      c.fillText(`${r / 1000}k`, x(r) - 6, H - 6);
    }
    for (let i = 0; i <= 4; i++) {
      const yy = Math.round(pad.t + (i * (H - pad.t - pad.b)) / 4) + 0.5;
      c.beginPath();
      c.moveTo(pad.l, yy);
      c.lineTo(W - pad.r, yy);
      c.stroke();
      c.fillStyle = POWER;
      c.fillText(`${Math.round(maxHp * (1 - i / 4))}`, 4, yy + 3);
      c.fillStyle = TORQUE;
      c.fillText(`${Math.round(maxNm * (1 - i / 4))}`, W - pad.r + 6, yy + 3);
    }
    const line = (color: string, f: (s: (typeof samples)[number]) => number) => {
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.beginPath();
      samples.forEach((s, i) => (i ? c.lineTo(x(s.rpm), f(s)) : c.moveTo(x(s.rpm), f(s))));
      c.stroke();
    };
    line(POWER, (s) => yH(s.hp));
    line(TORQUE, (s) => yN(s.nm));
  }, [samples, peakHp, peakNm, redline]);

  if (station !== 'dyno') return null;
  const last = samples[samples.length - 1];
  return (
    <section className="panel dyno">
      <header>
        <span>Dyno · AWD rollers</span>
        <span className="mono">
          <b style={{ color: POWER }}>{peakHp.toFixed(0)} hp</b> · <b style={{ color: TORQUE }}>{peakNm.toFixed(0)} Nm</b>
        </span>
      </header>
      <canvas ref={ref} className="dyno-canvas" />
      <footer>
        <span className="mono dim">
          {last ? `${Math.round(last.rpm)} rpm · boost ${(last.boost * 100).toFixed(0)}%` : '1000 rpm → redline in 5 s'}
        </span>
        <button className="btn accent" disabled={runningUI || running} onClick={() => useGame.getState().setUI({ dynoRunning: true })}>
          {running ? 'Running…' : 'Run dyno'}
        </button>
      </footer>
    </section>
  );
}
