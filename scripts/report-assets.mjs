#!/usr/bin/env node
/** Prints MB per zone (LOD0 + LODs), car-part totals and the first-playable estimate from public/assets/manifest.json. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8'));
const zones = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/zones.json'), 'utf8'));
const parts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/parts.json'), 'utf8')).parts;
const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/car-templates.json'), 'utf8'));
const byId = new Map(manifest.assets.map((a) => [a.id, a]));
const resolve = (id, match) => byId.get(id) ?? (match ? manifest.assets.find((a) => new RegExp(match, 'i').test(a.id)) : undefined);
const MB = (b) => (b / 1048576).toFixed(2).padStart(7) + ' MB';

const sum = (ids) => {
  const seen = new Set();
  let lod0 = 0, all = 0, tris = 0, missing = 0;
  for (const id of ids) {
    const a = resolve(id.id ?? id, id.match);
    if (!a) { missing++; continue; }
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    lod0 += a.bytes[0];
    all += a.bytes.reduce((x, y) => x + y, 0);
    tris += a.tris[0];
  }
  return { lod0, all, tris, missing, count: seen.size };
};

console.log('\n[report] Download per zone (unique assets, LOD0 / all LODs, LOD0 tris)');
const rows = [];
const shell = sum(['structure_wall_straight_a01', 'structure_wall_corner_a01', 'structure_wall_column_a01', 'structure_wall_entrance_a01', ...zones.shell.props.map((p) => p.asset)]);
rows.push(['Shell', shell]);
for (const z of zones.zones) rows.push([`${z.id} ${z.name}`, sum(z.props.map((p) => p.asset))]);
const kitA = sum([tpl.frame, ...Object.values(tpl.kits.A.sockets).map((id) => ({ id, match: parts.find((p) => p.id === id)?.match }))]);
rows.push(['Car · Kit A', kitA]);
const allParts = sum(parts.map((p) => ({ id: p.id, match: p.match })));
rows.push(['Car · all parts', allParts]);
for (const [name, r] of rows) {
  console.log(`  ${name.padEnd(30)} ${MB(r.lod0)} ${MB(r.all)} ${String(r.tris).padStart(9)} tris  (${r.count} assets${r.missing ? `, ${r.missing} procedural` : ''})`);
}

// First playable = shell + the starting zone (Bay 1) + Kit A car (LOD0) + JS bundle (if built).
let js = 0;
const dist = path.join(ROOT, 'dist', 'assets');
if (fs.existsSync(dist)) for (const f of fs.readdirSync(dist)) if (/\.(js|css|wasm)$/.test(f)) js += fs.statSync(path.join(dist, f)).size;
const zoneA = rows.find(([n]) => n.startsWith('A '))[1];
const first = shell.lod0 + zoneA.lod0 + kitA.lod0 + js;
console.log(`\n[report] First playable ≈ ${MB(first)}  (shell + zone A + Kit A + ${js ? 'JS bundle' : 'JS not built — run npm run build'})`);
console.log(`         budgets: desktop ≤ 12 MB, mobile ≤ 8 MB → ${first <= 8 * 1048576 ? 'OK for both' : first <= 12 * 1048576 ? 'OK desktop, over mobile' : 'OVER BUDGET'}`);
