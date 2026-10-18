# Drone League rebuild plan (branch `modular-rewrite`)

## Decisions
- **`Drone League/drone-league.html` is frozen** once the split lands. Everything up to v15 (commit 67f935e) is carried over. All new work goes into `src/`.
- **Output is still one HTML file.** `npm run build` writes `dist/drone-league.html` with everything inlined: Three.js, Rapier's WASM, CSS. The build then copies it to `Drone League/standalone/index.html` so `Play Drone League.bat` still works. The claude.ai artifact version, without `<html>`/`<head>`, is built too.
- **Stack:** Vite and plain ES modules, with JSDoc where it helps. Three.js 0.160.0 and `@dimforge/rapier3d-compat` 0.14.0 come from npm, pinned. PeerJS 1.5.4 is still loaded on demand.
- **Rapier comes in now**, for hitboxes, curved collisions and bullet hits. The acro flight model stays our own code.
- **The AI tuner can change:** rates, stick deadband and expo, throttle mid and expo, and assist strength.

## Module layout (target)
```
src/
  main.js            boot, main loop (fixed 120 Hz physics step + render interpolation)
  config/            world constants, DEF settings, storage + migrations (physV)
  render/            renderer, post-processing, materials, lighting presets, particles
  world/             arena geometry, maps (Neon, Meadow, Canyon, Alpine), Highlands
  physics/           Rapier world, colliders, contact handling, ball, arena SDF/trimesh
  flight/            Drone flight model, rates (Betaflight formulas), attitude controller
  parts/             arms, chassis, power: data, stats, meshes, collider descriptors
  input/             gamepad/radio/keyboard, binding, calibration
  tuner/             Calibration Lab training pack + auto-tuner
  bots/              prediction, intercept, roles, controllers, dogfight bots
  modes/             league, dogfight, training packs
  net/               room/PeerJS, sync, validation of remote data
  ui/                menu, HUD, OSD, mod panel, rates panel, garage
  audio/             WebAudio synth, motor sounds
tools/smoke.mjs      headless Edge smoke test (no console errors, sim runs, modes switch)
```

## Phase 1: split, no behaviour change (one agent, blocks the rest)
Set up Vite. Split the v15 script into the modules above. Mutable state shared across modules moves into exported state objects, because ES modules can't reassign another module's `let`. Add the single-file build and the smoke test. **Done means** the built game plays the same as v15. The smoke test passes, and settings saved by v15 (localStorage `droneleague`) still load.

## Phase 2: four parallel tracks (each in its own worktree)
### A. Visuals: Rocket League-style clean look
- Fix the jagged edges with anti-aliasing: an MSAA render target in the composer (samples 4), with SMAA as a fallback. Cap the pixel ratio sensibly.
- Make it less blown-out: raise the bloom threshold and lower its strength, and cap emissive and `multiplyScalar(2+)` glow colours. Retune exposure and ACES. Make each map's bloom and lighting in `LOOKS` consistent.
- Soften shadows with PCFSoft and tune the frustum and bias per map. Use more segments on curved meshes, and smooth normals where shapes are meant to be round.
- Keep a quality setting (Low/Med/High) so slower machines still run.

### B. Physics + geometry: Rapier, curves, Rocket League-style bounces
- Add a Rapier world stepped at a fixed 120 Hz, with interpolation for rendering.
- **Arena gets Rocket League-style curves:** quarter-pipes from floor to wall, curves from wall to ceiling, rounded corners, and rounded goal posts and crossbar. The collision mesh is high resolution with internal-edge fixing, so nothing bumps along curved surfaces. The ball has to roll up a curve and back without jitter or losing energy.
- The ball is a Rapier dynamic body. Keep the current touch feel: `TB` restitution curve, the RL-style push, dribble grip.
- **Drones become Rapier dynamic bodies built from several collision shapes** (described by the parts track). The flight model applies thrust, drag and torque as forces. Ground contact, turtle and flip-over behaviour still have to work.
- Bullets become raycasts or shape-casts, so fast rounds can't pass through things. The Highlands obstacles get real colliders.
- **Interface for parts:** `buildDroneBody(loadout)` takes collider descriptors `{shape:'box'|'capsule'|'sphere'|'cylinder'|'hull', size, pos, rot, tag}` and mass/inertia from `parts/`. Tags (`chassis`, `arm`, `prop`, `camera`) let hits report which zone was struck.

### C. Controls + Calibration Lab (AI tuner)
- **Binding fix:** any button, trigger or axis can bind to any function, including RT/LT on every browser. Triggers that are reported as an axis, or as both an axis and a button, are recognised. Each stage shows a live readout.
- **Calibration Lab**, its own small room like a Rocket League training pack. The pilot sits in a box with walls, and the drills stay basic so each one measures one thing:
  1. *Hold still / hover.* Measures stick noise at rest, which sets the deadband, and where the pilot hovers, which sets throttle mid.
  2. *Roll snaps, pitch snaps, yaw snaps.* Rotate to the target angle and stop. Overshoot and undershoot, settle time and wobble feed rate and expo for each axis.
  3. *Small corrections.* Keep a tiny reticle on a slowly drifting target. Measures centre-stick precision, which sets centre sensitivity and expo.
  4. *Dodge.* The pilot stays upright in the box and dodges incoming projectiles. Measures reaction to big stick moves, which sets max rate and assist strength.
  5. *Altitude gates.* Hold a height band while it steps up and down. Measures throttle expo and mid.
- **Tunes in real time:** after every trial, a bounded update nudges the settings toward the preset's target behaviour and applies them right away. The steps get smaller as the measurements settle. A live panel shows what changed and why.
- **Presets:** *Default* is forgiving, with more expo, gentler centre, and some assist allowed. *Pro* aims for a real FPV pilot setup: Actual rates with a high centre, low expo and no assists, and it penalises any lag between stick and drone.
- At the end, the results are saved to a rate profile in a format the Betaflight rates panel and CLI export can read. Before/after is shown, with a Revert button.

### D. Drone parts: 5 arms × 5 chassis × 5 power units
Stats come from the geometry wherever possible, so the tradeoffs hold up physically. Arm length and position set the inertia and the motor lever arm for each axis. Prop size sets thrust and drag. Mass comes from the parts. Hitboxes are built from the actual shape of each part.

**Stock is the default and is worse than everything else.** Each stock part is a jack of all trades: average on every stat, with a small penalty on all of them and no strength. Every other part beats it clearly in at least one area.

| Slot | Options (working names) | Main tradeoffs |
|---|---|---|
| Arms | Stock X, True-X Freestyle, Stretch-X Racer, Dead-Cat, Squash-H | Arms placed further forward/back mean more pitch inertia and less yaw authority. Wide arms mean slow roll and snappy pitch. Longer arms give a bigger prop hitbox and more thrust. |
| Chassis | Stock Box, Slim Racer, Brick, Low-Pro Plank, Pod | A bigger, heavier body hits the ball harder but is slower to turn and bigger to hit. A flat, wide body controls the ball better. A slim body has less drag but less ball punch. |
| Power | Stock 6S, 6S Race Punch, 4S Efficient, High-KV, Long-Range Pack | Punch (T/W) vs. boost capacity/drain vs. spool speed vs. top speed vs. weight. |

- Each part has data (stats, mass, collider descriptors, mesh builder), so new parts can be added without code changes elsewhere.
- **Garage screen:** pick one part per slot, with a 3D preview, stat bars and the hitbox shown as an overlay.
- **Online:** the loadout is sent as part ids and checked against the known list. Bots get random loadouts.

## Phase 3: integrate and balance (me)
Merge A–D. Connect part colliders to the Rapier drone body. Run a balance pass: no loadout should dominate, and stock should come out slightly worse than every other loadout. Update `drone-league-notes.md` for the new layout and rebuild the single file. Open a PR to `main`.

## What I can't test
How it actually feels to fly. Whether each drill and part reads right needs a pilot on a real controller.
