import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadManifest } from './assets/manifest';
import { useGame } from './store/game';
import './ui/hud.css';

// Dev/test hook for scripted playtests.
if (import.meta.env.DEV) (window as unknown as { __game: typeof useGame }).__game = useGame;

async function boot() {
  await loadManifest();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();
