/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/** Dev-only: lets the /lab Fit-Check tool write src/data/car-templates.json directly. */
function labSave(): Plugin {
  return {
    name: 'torque-house-lab-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lab/save', (req, res) => {
        if (req.method !== 'POST') return res.writeHead(405).end();
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (!json.sockets || !json.kits) throw new Error('not a car template');
            fs.writeFileSync(path.resolve(__dirname, 'src/data/car-templates.json'), JSON.stringify(json, null, 1));
            res.writeHead(200).end('ok');
          } catch (e) {
            res.writeHead(400).end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), labSave()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          physics: ['@react-three/rapier'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
