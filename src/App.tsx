import { lazy, Suspense } from 'react';
import { Garage } from './scene/Garage';
import { HUD } from './ui/HUD';
import { LoadBar, Menu } from './ui/Menu';
import { useGame } from './store/game';

const Lab = lazy(() => import('./lab/Lab').then((m) => ({ default: m.Lab })));

const isLab = () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return location.pathname.replace(base, '').replace(/\/$/, '') === '/lab' || location.hash === '#lab';
};

export function App() {
  const mode = useGame((s) => s.mode);
  if (isLab()) {
    return (
      <Suspense fallback={<div className="boot">Loading lab…</div>}>
        <Lab />
      </Suspense>
    );
  }
  return (
    <>
      <Garage />
      {mode === 'menu' ? <Menu /> : <HUD />}
      <LoadBar />
    </>
  );
}
