#!/usr/bin/env node
/**
 * TORQUE HOUSE — offline asset pipeline (Milestone 0).
 *
 * For every GLB in raw/glb/:
 *   weld → simplify (ratio = target / currentTris) → texture resize + KTX2 (toktx) or WebP fallback
 *   → meshopt re-encode → LODs for HERO/PROP → manifest entry.
 *
 * Usage:
 *   node scripts/build-assets.mjs              # process every raw GLB
 *   node scripts/build-assets.mjs --only-used  # only ids referenced by src/data/*.json
 *   node scripts/build-assets.mjs --filter v8  # only ids matching a regex
 *
 * Never runs join/flatten/palette on assets with joints (it would destroy hinged nodes).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, prune, weld, simplify, textureCompress, meshopt, join, flatten, palette, getBounds,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'raw', 'glb');
const RAW_THUMBS = path.join(ROOT, 'raw', 'thumbs');
const OUT = path.join(ROOT, 'public', 'assets', 'glb');
const OUT_THUMBS = path.join(ROOT, 'public', 'assets', 'thumbs');
const MANIFEST = path.join(ROOT, 'public', 'assets', 'manifest.json');
const MASS_OVERRIDES = path.join(ROOT, 'scripts', 'mass-overrides.json');
const TIERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'asset-tiers.json'), 'utf8'));

const args = process.argv.slice(2);
const onlyUsed = args.includes('--only-used');
const filterIdx = args.indexOf('--filter');
const filterRe = filterIdx >= 0 ? new RegExp(args[filterIdx + 1]) : null;

const hasToktx = (() => {
  try { execFileSync('toktx', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// ---------------------------------------------------------------------------- helpers
function classify(id) {
  for (const r of TIERS.rules) if (new RegExp(r.match).test(id)) return { tier: r.tier, category: r.category };
  return { tier: 'FILL', category: 'misc' };
}

function countTris(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // TRIANGLES only
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      tris += Math.floor((idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3);
    }
  }
  return tris;
}

function collectPhysics(doc) {
  const joints = [];
  let mass = 0;
  let density = null;
  let hasHulls = false;
  const visit = (extras, nodeName) => {
    if (!extras) return;
    if (Array.isArray(extras.joints)) for (const j of extras.joints) joints.push({ node: nodeName, ...j });
    if (typeof extras.mass === 'number') mass += extras.mass;
    if (typeof extras.density === 'number') density = extras.density;
    if (extras.collisionHulls) hasHulls = true;
  };
  for (const node of doc.getRoot().listNodes()) visit(node.getExtras(), node.getName());
  for (const scene of doc.getRoot().listScenes()) visit(scene.getExtras(), scene.getName());
  visit(doc.getRoot().getExtras(), 'root');
  for (const mesh of doc.getRoot().listMeshes()) if (mesh.getExtras()?.collisionHulls) hasHulls = true;
  return { joints, mass, density, hasHulls };
}

const massOverrides = [];
function clampMass(id, mass) {
  for (const [pattern, [lo, hi]] of Object.entries(TIERS.massClamps)) {
    if (!new RegExp(pattern).test(id)) continue;
    const clamped = Math.min(hi, Math.max(lo, mass || (lo + hi) / 2));
    if (clamped !== mass) massOverrides.push({ id, original: mass, clamped, range: [lo, hi], rule: pattern });
    return clamped;
  }
  return mass;
}

function usedIds() {
  const ids = new Set();
  const scan = (v) => {
    if (typeof v === 'string' && /^[a-zA-Z]+_[a-zA-Z0-9_]+$/.test(v)) ids.add(v);
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') Object.values(v).forEach(scan);
  };
  for (const f of ['parts.json', 'zones.json', 'car-templates.json']) {
    const p = path.join(ROOT, 'src', 'data', f);
    if (fs.existsSync(p)) scan(JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  return ids;
}

async function compressTextures(doc, tierCfg, outPath, tier) {
  // Always resize first (WebP fallback path also covers resizing).
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tierCfg.texMax, tierCfg.texMax], quality: 82 }),
  );
  return { outPath, ktx2: hasToktx && tier !== 'FILL' };
}

function ktx2Encode(file, tier) {
  // KTX2 via the gltf-transform CLI (needs KTX-Software `toktx` on PATH). UASTC for HERO normals, ETC1S otherwise.
  const cli = path.join(ROOT, 'node_modules', '.bin', 'gltf-transform');
  const tmp = file.replace(/\.glb$/, '.ktx.glb');
  execFileSync(cli, ['etc1s', file, tmp, '--slots', tier === 'HERO' ? '!normalTexture' : '*'], { stdio: 'ignore' });
  if (tier === 'HERO') execFileSync(cli, ['uastc', tmp, tmp, '--slots', 'normalTexture'], { stdio: 'ignore' });
  execFileSync(cli, ['meshopt', tmp, file], { stdio: 'ignore' });
  fs.rmSync(tmp);
}

// ---------------------------------------------------------------------------- main
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(OUT_THUMBS, { recursive: true });

if (!fs.existsSync(RAW)) {
  console.error(`No raw assets at ${RAW}. Run: npm run assets:download`);
  process.exit(1);
}

const used = onlyUsed ? usedIds() : null;
const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.glb')).sort();
const manifest = { version: 1, generated: new Date().toISOString(), ktx2: hasToktx, assets: [] };
const failures = [];

console.log(`[assets] ${files.length} raw GLBs · KTX2 ${hasToktx ? 'on (toktx)' : 'off → WebP fallback'}`);

for (const file of files) {
  const id = file.replace(/\.glb$/, '');
  if (used && !used.has(id)) continue;
  if (filterRe && !filterRe.test(id)) continue;

  const { tier, category } = classify(id);
  const cfg = TIERS.tiers[tier];
  const src = path.join(RAW, file);

  const probe = await io.read(src);
  const rawTris = countTris(probe);
  const phys = collectPhysics(probe);
  const target = Math.min(rawTris, cfg.trisMax);
  const lodRatios = cfg.lods;

  const entry = {
    id, category, tier,
    tris: [], bytes: [], files: [], hash: '',
    bbox: null, mass: clampMass(id, phys.mass), density: phys.density,
    joints: phys.joints, hasHulls: phys.hasHulls, thumb: null,
  };

  for (let lod = 0; lod < lodRatios.length; lod++) {
    const doc = await io.read(src);
    const lodTarget = Math.max(64, Math.round(target * lodRatios[lod]));
    const ratio = Math.min(1, lodTarget / Math.max(1, rawTris));
    const hasJoints = phys.joints.length > 0;

    await doc.transform(
      dedup(),
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: cfg.error * (lod + 1), lockBorder: false }),
      // Destructive scene-graph ops ONLY for jointless FILL assets.
      ...(tier === 'FILL' && !hasJoints ? [flatten(), join(), palette({ min: 3 })] : []),
      prune(),
    );

    const name = `${id}.lod${lod}.glb`;
    const outPath = path.join(OUT, name);
    const { ktx2 } = await compressTextures(doc, cfg, outPath, tier);
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(outPath, doc);
    if (ktx2) {
      try { ktx2Encode(outPath, tier); } catch (e) { console.warn(`  ! KTX2 failed for ${name}, keeping WebP (${e.message})`); }
    }

    const bytes = fs.statSync(outPath).size;
    const outDoc = await io.read(outPath);
    const tris = countTris(outDoc);
    if (lod === 0) {
      const scene = outDoc.getRoot().getDefaultScene() ?? outDoc.getRoot().listScenes()[0];
      const b = getBounds(scene);
      entry.bbox = { min: b.min, max: b.max, size: b.max.map((v, i) => +(v - b.min[i]).toFixed(4)) };
      entry.hash = createHash('sha1').update(fs.readFileSync(outPath)).digest('hex').slice(0, 12);
    }
    entry.tris.push(tris);
    entry.bytes.push(bytes);
    entry.files.push(`assets/glb/${name}`);
  }

  // Budgets (M0 hard fail)
  if (tier === 'HERO' && (entry.tris[0] > 60000 || entry.bytes[0] > 2.5 * 1024 * 1024))
    failures.push(`${id}: HERO over budget (${entry.tris[0]} tris, ${(entry.bytes[0] / 1048576).toFixed(2)} MB)`);
  if (tier === 'FILL' && entry.tris[0] > 4000) failures.push(`${id}: FILL over budget (${entry.tris[0]} tris)`);

  for (const ext of ['.webp', '.png', '.jpg']) {
    const t = path.join(RAW_THUMBS, id + ext);
    if (fs.existsSync(t)) {
      await sharp(t).resize(256, 256, { fit: 'inside' }).webp({ quality: 75 }).toFile(path.join(OUT_THUMBS, `${id}.webp`));
      entry.thumb = `assets/thumbs/${id}.webp`;
      break;
    }
  }

  manifest.assets.push(entry);
  console.log(
    `  ${tier.padEnd(4)} ${id.padEnd(56)} ${String(rawTris).padStart(8)} → ${entry.tris.join('/').padEnd(18)} ${(entry.bytes[0] / 1024).toFixed(0)} KB`,
  );
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
fs.writeFileSync(MASS_OVERRIDES, JSON.stringify(massOverrides, null, 2));
console.log(`[assets] manifest → ${path.relative(ROOT, MANIFEST)} (${manifest.assets.length} assets), ${massOverrides.length} mass clamps logged`);

execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'report-assets.mjs')], { stdio: 'inherit' });

if (failures.length) {
  console.error(`\n[assets] BUDGET FAILURES (${failures.length}):\n  ` + failures.join('\n  '));
  process.exit(1);
}
