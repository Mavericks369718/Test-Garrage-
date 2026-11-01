# TORQUE HOUSE

A browser-based 3D mechanic game. You run a late-night performance garage where you **build** cars from a bare frame, **modify** customer cars (engine swaps, turbo or supercharger, wheels, suspension, aero, paint), and **test** them on an in-garage dyno. The dyno and stats sheet run on a small but real physics model.

Stack: Vite · React · TypeScript · three.js via @react-three/fiber + drei · @react-three/rapier · zustand · Howler.js · glTF-Transform + meshoptimizer (offline pipeline).

```bash
npm install
npm run dev          # http://localhost:5173  (Fit-check lab at /lab, profiler with ?debug)
npm test             # sim + assembly unit tests
npm run build        # typecheck + production build
```

The game runs without any downloaded models. Every SimReady asset has a **procedural stand-in** at real-world scale (car panels, engines, wheels, lifts, racks and so on). When you build the real assets, they replace the stand-ins automatically through `public/assets/manifest.json`.

## Assets (Milestone 0)

Source: `codepawl/simready-glb`, which is NVIDIA SimReady converted to GLB (CC BY 4.0, credit NVIDIA). See [CREDITS.md](CREDITS.md). Do **not** use `imagineio/PhysicalAI-SimReady-Assets`, which is CC BY-NC.

```bash
npm run assets:download   # hf download … --include only the categories we use (never the full 3.2 GB)
npm run assets:build      # → public/assets/glb/*.lodN.glb + manifest.json + per-zone MB report
npm run assets:report     # re-print the size report
```

`scripts/build-assets.mjs` does the following for each raw GLB:

1. Looks up its tier in `asset-tiers.json`:

   | Tier | Triangles | Textures |
   |---|---|---|
   | HERO | ≤ 60k | 1024 |
   | PART | ≤ 15k | 512 |
   | PROP | ≤ 25k | 512 |
   | FILL | ≤ 4k | 256 |

2. Runs `weld` → `simplify` (ratio = target / current, error 0.001 to 0.01).
3. Resizes textures and encodes them to WebP. If `toktx` is on PATH, it also encodes KTX2: ETC1S, plus UASTC for HERO normal maps.
4. Re-encodes geometry with meshopt.
5. Runs `flatten`/`join`/`palette` **only on jointless FILL assets**.
6. Writes LOD0/1/2 (100% / 35% / 10%) for HERO and PROP.
7. Records `id, category, tier, tris[], bytes[], bbox, mass, joints[], hasHulls, thumb, hash` in the manifest.
8. Clamps masses per category and logs each clamp to `scripts/mass-overrides.json`.
9. **Fails** if a HERO asset is over 60k tris or 2.5 MB, or a FILL asset is over 4k tris.

At runtime, `GLTFLoader + MeshoptDecoder + KTX2Loader` (worker transcoder in `public/basis/`) loads the files with real MB-loaded/MB-total progress. A Service Worker caches GLBs keyed by the manifest hash. The game never loads a raw GLB.

**Asset ids:** the zone props use the exact ids from the design brief. Car-part ids that the brief doesn't name (for example `bodyPart_hood_b01`) are best guesses. Each part in `src/data/parts.json` has a `match` regex, so if the exact id isn't in the manifest, the first matching asset is used. If nothing matches, the procedural part is used. Verify fits in `/lab`.

## Fit-check lab (`/lab`)

The parts come from many different cars, and no complete car shell exists. The lab loads the frame, lets you pick a socket and a part, and lets you drag, rotate and scale the part with a gizmo or numeric fields. Each part auto-fits its bbox to the socket size first (uniform scale, clamped 0.85–1.15).

You can save the results in three ways:

- **Save to repo:** writes `src/data/car-templates.json` (dev server only).
- **Export JSON:** downloads the file.
- Overrides are also kept in localStorage, so the game picks them up immediately.

Kits A (Street), B (GT) and C (Rally) are the verified sets. Mixing parts outside a kit shows a **Custom fit** badge.

## Gameplay

| Mode | What |
|---|---|
| **Career** | 10 customer jobs, for example "+80 hp under ₹2L", "fix brakes", "go electric" or "sub-11 s ¼ mile". You pay for parts, sell removed parts for 40%, and buy upgrades in order: Paint Booth → Dyno → Bay 2 (Bay 2 adds the transmission jack). |
| **Build** | Bare frame on the Bay 2 platform. Enforced order: axles → struts → brakes → wheels → engine → transmission → exhaust → interior → body → glass → trim. A 60-second guided first build is included, with "Auto-fit stage". |
| **Free garage** | Sandbox. Everything is unlocked and you can load Kit A, B or C in one click. |

**Rules:** tools gate jobs. Wheels need the impact wrench, the engine needs the engine hoist, a tyre swap needs the tyre changer, and paint needs the booth. Engine work needs the hood open (via its revolute joint). An EV needs the reduction gearbox and can't take an exhaust, intake or boost. When a part can't go into a socket, its ghost turns red and shows the reason in one line.

**Controls (desktop):**

- Drag to orbit. `F` focuses the hovered part. `Tab` opens the parts list.
- Click a part to ghost it at the nearest valid socket, then click again or press `Enter` to fit it. `[` and `]` cycle sockets.
- `Del` removes the focused part. `WASD` switches to walk mode (pointer lock), `Shift` runs and `Esc` exits.
- Click a hinged panel to open or close it, or drag it along its joint axis.

**Controls (mobile):** tap to focus. Use two fingers to orbit and zoom, and one finger to pan. Parts open in a bottom sheet, and zone buttons replace walk mode.

## Science (`src/sim/`)

- **Mass and CoM:** `m = Σ parts + frame + 75 kg driver`, `CoM = Σ mᵢ·posᵢ / Σ mᵢ`. Shown as a glowing marker, with the front/rear split.
- **Engines:** a Hermite torque curve that makes the brief's peak torque and peak power exact maxima. The EV has flat torque, then constant power to 9000 rpm, then field weakening. Turbo is ×1.25 (0.6 s first-order spool lag on the dyno). Supercharger is ×1.18 (no lag, −3% efficiency). Intake and exhaust add ±2–6%.
- **Acceleration:** fixed step, dt = 1/120 s. `F_drive = min(P(v)/max(v,1), μ·(m·g + F_down)·driveAxleShare)` with gear selection, shift time and load transfer. Drag is `½ρCdAv²` and rolling resistance is `Crr·m·g`. Results are 0–100, ¼ mile and trap speed.
- **Top speed:** bisection on `P·η = (F_drag + F_roll)·v`, capped by redline in top gear.
- **Braking:** `d = v²/(2μg·brakeFactor)`.
- **Handling:** a weighted score from μ, stiffness, CoM height, 50:50 balance and downforce.
- Every stat has a **Why?** tooltip with its formula.
- **Dyno:** sweeps 1000 rpm → redline in 5 s of real time, with a live power/torque chart, wheel spin from rpm ÷ gearing, and engine pitch that follows rpm.

## Performance

- **Lazy loading:** zones load lazily (the current zone first, the rest at `requestIdleCallback`). On mobile, zones more than two hops away are unloaded.
- **Geometry:** drei `<Detailed>` LODs at [0, 6, 15] m. Pallets, drums, LED panels, beams and similar props are instanced. `<Bvh firstHitOnly>` speeds up picking.
- **Adaptive quality:** `<PerformanceMonitor>` + `<AdaptiveDpr>`, with DPR [1, 2] on desktop and [0.75, 1.5] on mobile. Bloom and SMAA drop out when FPS falls.
- **Lighting and shadows:** one shadow-casting light on desktop and none on mobile, with `shadowMap.autoUpdate = false` (shadows re-render only on attach, lift motion or station change). The paint booth interior is hidden when the camera is outside it.
- **Physics:** Rapier runs at a fixed step and pauses while menus are open. Bodies use convex hulls only (from `extras.collisionHulls` when present), capped at 60 on desktop and 25 on mobile.
- **Debug overlay:** `?debug` shows r3f-perf (lazy-loaded) plus a per-zone triangle overlay.
- **First load:** the JS bundle is about 1.5 MB gzipped. `npm run assets:report` prints the first-playable estimate against the 8 MB / 12 MB budgets.

## Code layout

```
scripts/        build-assets.mjs, report-assets.mjs, download-assets.sh
src/assets/     manifest, GLTF/meshopt/KTX2 loader with LOD + procedural fallback, progress
src/car/        catalog (parts/template types), assembly rules, CarRig (sockets, hinges, ghost, snap/hoist/bolt anims), procedural parts, paint
src/scene/      Garage canvas, shell/floor/exterior, zones + booth, props, lighting, camera rig, physics, controllers
src/sim/        engine curves, performance sim, stats + formulas, dyno (+ tests)
src/store/      zustand game state, persistence, jobs, economy
src/ui/         HUD, inventory, stats, panels (jobs/store/upgrades/paint/saves/credits), dyno chart, menu
src/lab/        /lab fit-check tool
src/data/       parts.json, car-templates.json, zones.json, jobs.json
```

## Status against the milestones

| # | Status |
|---|---|
| M0 | Pipeline, tiers, LODs, manifest, budgets, mass clamps and report are implemented. Tested end-to-end on synthetic SimReady-style GLBs. **Not yet run on the real dataset** (Hugging Face was unreachable from the build environment). |
| M1 | Shell, all zones and lighting are done. 60 fps has not been profiled on target hardware. |
| M2 | `/lab` and the Kit A/B/C templates are done. The kits are verified with procedural parts and need re-verifying with the real GLBs. |
| M3–M6 | Build rules, ghosts, snapping, tools, modify mode, paint booth, stats with formulas, real-time dyno, 10 jobs, economy, localStorage save, and JSON export/import are all done. |
| M7 | Mobile layout, DPR clamps, zone unloading and the shadow-off path are in place. **Not yet measured** on a mid-range Android over throttled 4G. |
| M8 | Synthesised audio, credits screen and 60-second onboarding are done. |

### Known simplifications

- Tool carts and dollies are single convex rigid bodies with low damping. Per-wheel joints from the GLB are not simulated yet.
- Rapier's default sleep threshold (about 2 s) is used, not 1 s.
- The scissor-lift car collider does not follow the lift height.
