# Zombies performance: profile, fixes, before / after

Branch `perf-hotpaths` (2026-10-20). The goal is a smoother Zombies without losing the look. What matters is the **p95 and the worst frame**
(you feel the jaggedness, not the average). Measured on the user's laptop: i9-14900HX with an Intel UHD iGPU, an RTX 4070 Laptop and a
2560×1600 240 Hz panel. All runs are headless Edge.

## Tools

- `node tools/zombies-profile.mjs [w1,w28,boss,storm,snow,night,dust,rain,fog,scattered,fx] [--sec=4] [--json=f] [--w= --h= --dpr=] [--no-ablate]`
  For each scenario it reports:
  - frame pacing (avg / p50 / p95 / p99 / worst interval, frames over 20 ms) and frame CPU (all rAF callbacks);
  - GPU time per frame (`EXT_disjoint_timer_query_webgl2` around `composer.render`);
  - draw calls and triangles, split into shadow / main / post passes and grouped by top-level object;
  - programs, objects, transparent objects and materials;
  - the GPU cost of each big feature, by switching it off for a moment (shadow map, forest, clouds, bloom, Zombies effects);
  - GC pauses, long tasks and style / layout / paint time from a Chrome trace;
  - JS self time and inclusive time per game function (CDP profiler);
  - **allocations per frame**, garbage included (sampling heap profiler with `includeObjectsCollectedByMinor/MajorGC`).
- `node tools/zombies-profile.mjs --events [--cpu]`: one 15 s timeline through the moments that used to hitch: the boss wave starting,
  weather changing to storm, snow, night, dust and golden, a 12-burst barrage, and a crash and relaunch. It lists every frame over 12 ms of
  CPU or 25 ms of interval, with the event before it, and **every shader compile over 20 ms with the material and object that caused it**.
- `node tools/zombies-perf-shots.mjs OUTDIR [views]` and `--diff A B`: same-seed, fixed-camera screenshots (forest, sites, high, smoke, burn,
  storm, snow, overcast, night, thermal) to compare two builds picture for picture.
- `DL_HIGHGPU=1` (tools/browser.mjs) starts headless Edge with `--force_high_performance_gpu`. Without it, headless Edge on this laptop
  draws on the **Intel iGPU**.
- `DL_NORENDER=1` skips draw calls: use it for the CPU side only.

Caveat: the GPU and CPU were shared with up to five other agents' browsers during these runs. Frame intervals (especially p95 / worst)
were noisy from run to run. Frame CPU, allocations, draw calls, GC and the event timeline are the steadier numbers. Before / after runs
were interleaved (before, after, before, after) and the medians are reported.

## 1. Profile findings (before)

Zombies wave 28 with a full defence, unless noted. "Before" is `origin/main` at 956ba53.

**GPU choice.** Headless Edge draws on the Intel UHD unless `--force_high_performance_gpu` is passed. There, wave 28 takes 130–210 ms of
GPU time per frame at 1280×720: 4–7 fps. It is vertex-bound on the forest's 4 M triangles. On the RTX the same frame is 3–6 ms of GPU time,
even at 2560×1600. **Check `edge://gpu` (GL_RENDERER) in the browser you play in.** If it says Intel, set Windows Settings → System →
Display → Graphics → Microsoft Edge → High performance. routes-scout (docs/ROUTES.md) measured the same.

**On the RTX the frame is main-thread bound,** about 5–7 ms of CPU against 3–5 ms of GPU. The jaggedness came from these sources, worst first:

| # | Cause | Measured (before) |
|---|---|---|
| 1 | **Shader compiles in the middle of play.** (a) Weathers without sky light (cloud deck, night, dust) and the thermal camera set `scene.environment = null`. That gave every lit material a second program, compiled on the spot. (b) The sites' warm-up (`buildings.js` prepare) compiled for the screen, but the composer draws into a render target: no tone mapping and linear output, which is a different program. So the first time the camera turned to the sites, about 12 programs compiled anyway. | **0.6–2 s freezes** at the first storm, snow or night, and when the boss cine or the player first looked south. 25 compiles over 20 ms in the event timeline. The night scenario: p95 534 ms, worst 686 ms. |
| 2 | **Major GCs** from about 350–475 KB of garbage per frame (`pickTarget`/`fit()` making `[]` and `{}` per track per defence per step, `Math.hypot` boxing its arguments, radar/overlay arrays and strings, `TH.filter(...)` in the HUD, `toLocaleString`). | Minor GC every 1–2 s, **MajorGC 5–37 ms** in 12 of 20 scenario windows. |
| 3 | **DOM churn.** The HUD rewrote `innerHTML` (OSD, track box) and `textContent` (wave, cash written twice a frame with different values by two modules, inbound, integrity, streak) every frame. | 85–110 ms/s of style, layout, paint and hit test: **1.4–1.8 ms per frame** outside the rAF callback. |
| 4 | **Per-frame shader-program lookups.** three's single shadow depth material flipped between instanced, instanced-with-colour and plain meshes, so `getProgram` + `getParameters` + the cache key ran about 5× per frame. | ~5% of main-thread time; 17–40 KB/frame of garbage |
| 5 | **Radar**: a 500×500 canvas fully redrawn every frame (up to 240 times a second on this panel). New `[x,y]` arrays and `cos`/`sin` per point, label strings per track. | 1.5–2 ms per frame (routes-scout: −1.9 ms when skipped) |
| 6 | **Clouds**: 150 cumulus × 7 sprites, each with its own SpriteMaterial: 1,050 objects in `updateMatrixWorld`, 50–55 draw calls, 600+ transparent objects to sort | ~25% of draw calls |
| 7 | **Forest**: 17k trees at full detail everywhere. 3.6–3.8 M triangles in the main pass and 0.5 M in the shadow pass (far tiles drawn into the shadow box in full) | 4.1–4.7 M triangles per frame; the iGPU's whole problem |
| 8 | `updateMatrixWorld` over static scenery (houses, pylons, site props, building stages) | ~9% of main-thread time (routes-scout), 615 of 746 objects recomposed per frame |
| 9 | Particle systems: 6 `Points` (FX, SMK, the sites' FIRE and SMOKE, the Zombies flames and trails), each walking and uploading all its slots every frame (~270 KB of `bufferSubData` per frame, idle or not); the Zombies smoke (3,400 slots) likewise | `bufferSubData` was the top self-time entry |

Not the problem: the simulation (0.1–0.3 ms per 120 Hz step), post-processing (bloom about 0.5 ms GPU) and the shadow pass on the GPU.

## 2. Fixes (highest impact first)

1. **No environment-map program variants** (`interceptor.js` `wxLook`): when there is no sky light, `scene.environment` is a black PMREM
   map of the same size instead of `null`. The lighting is the same (IBL × 0), and there's one program per material.
2. **The sites' warm-up compiles into a render target** (`engine/hot.js` `compileFor`, used by `buildings.js` prepare), like the composer
   draws. Note for the shader warm-up work (perf-quickwins): a plain `renderer.compile(scene, camera)` warms the wrong variant for everything
   the composer draws. Use `compileFor`. Hidden pooled objects (weather points, the cloud deck, the zfx root outside Zombies) are skipped by
   `compile()`, because it only walks visible objects.
3. **Allocations**: shared frozen empty objects in `fit()` / `pickTarget`, `hyp()` instead of `Math.hypot` in per-track paths
   (`engine/hot.js`), one reused list for `hardT()`, counting loops instead of `filter().length`, radar points from a ring of four reused
   arrays, cached radar and overlay label strings, `money()` without ICU (same text), particle windows. **350 → 165–220 KB per frame**, and no
   major GCs in any measured window.
4. **HUD writes only on change** (`engine/hot.js` `txt` / `html` / `css` / `cls` / `hide`). The OSD and the track box are built once and their
   lines rewritten only when they change. The wave label comes from one place (`Z.waveTxt`, the campaign's). The cash counter is
   zannounce's alone (`Z.cashRoll`). Style, layout and paint went from 85–110 to 30–55 ms/s.
5. **Shadow depth material fix** (`depthFix`): instanced shadow casters get their own depth material (one with instance colour, one without).
   No program flips per frame (verified: 0 flips).
6. **Radar**: the scope disc, rings and cross, the ring labels (per range) and the rim are cached canvases. Blips, river and sites are redrawn at
   up to 30 Hz with the accumulated time, so the sweep and the blip ages are unchanged.
7. **Clouds as one instanced mesh** with three's sprite shader (same texture, colour, opacity, fog, tone mapping, size). They're drawn before
   other transparent things (renderOrder −1, the sun disc −2), which is where the distance sort put them anyway. They're re-sorted back to
   front when the camera moves 150 m. Same cloud field from the same seed.
8. **Forest crown LOD per tile**: the full 180-face crown within 900 m, 80 faces to 2.5 km, 20 beyond (under ~5 px). It's chosen after every
   camera, the cinematic cams included. The shadow box only ever sees near tiles. Main-pass triangles: 3.9 M → 1.9 M.
9. **Frozen static scenery** (`freeze`): terrain, river, houses, pylons and wires, the forest, the sites' props and every building damage stage.
   **634 of 746 objects** skip `updateMatrixWorld`. Verified: none of them moves (matrix = position/quaternion/scale after a damaged-site wave).
10. **Shared pooled particles** (`engine/particles.js`): one additive and one alpha `Points` for every `psys()` emitter (Riley's FX/SMK, the
    sites' fire and smoke, the Zombies flames and debris trails). The look is three's PointsMaterial unchanged, with only a per-particle size
    attribute. Each emitter walks and uploads only its live window (`addUpdateRange`), so idle emitters cost nothing. 6 draws → 2.
    `PFX.scale` (0..1) thins every emitter for a graphics setting. The Zombies smoke columns (custom soft shader) keep their shader but use
    the same live-window walk and upload.

## 3. Before / after

Interleaved runs (before, after, before, after; medians), wave 28 with a full defence unless noted. **CPU side**: `DL_NORENDER=1`, 5 s per
scenario. Frame intervals are capped by the 60 Hz headless vsync, so the jaggedness shows in p99 / worst and in the frame CPU.

| scenario | p95 ms | p99 ms | worst ms | frame CPU avg | CPU p95 | CPU worst | alloc KB/frame | draw calls |
|---|---|---|---|---|---|---|---|---|
| wave 1 | 16.9 → 18.9 | 33.6 → 25.3 | **350 → 26** | 5.2 → 3.2 | 7.0 → 5.3 | 45.6 → 15.0 | 147 → 68 | 176 → 124 |
| wave 28 | 16.9 → 17.8 | 25.1 → 25.4 | 33 → 50 | 6.2 → 3.5 | 8.3 → 5.5 | 11.4 → 8.0 | 349 → 166 | 208 → 146 |
| boss (w30) | 17.0 → 25.8 | 33.3 → 33.5 | 42 → 76 | 5.4 → 4.3 | 7.3 → 7.0 | 10.0 → 10.9 | 336 → 181 | 202 → 154 |
| storm | 17.9 → 17.7 | 25.8 → 25.4 | 34 → 51 | 7.0 → 5.2 | 10.8 → 9.3 | 16.0 → 20.6 | 337 → 173 | 150 → 143 |
| snow | 25.7 → 25.4 | 73.1 → 33.7 | **201 → 42** | 7.2 → 5.2 | 12.9 → 7.9 | 23.4 → 13.6 | 395 → 188 | 130 → 145 |
| night | **534 → 17** | **685 → 26** | **686 → 34** | 12.3 → 4.1 | 29.1 → 6.6 | 37.8 → 9.8 | 445 → 223 | 141 → 157 |
| dust | 33.3 → 17.3 | 58.5 → 18.9 | **109 → 25** | 7.7 → 4.8 | 15.5 → 8.2 | 56.9 → 15.1 | 403 → 166 | 142 → 143 |
| rain | 16.9 → 17.0 | 17.1 → 25.3 | 117 → 50 | 5.4 → 5.2 | 7.7 → 10.8 | 10.7 → 33.4 | 405 → 197 | 219 → 121 |
| fog | 16.9 → 17.0 | 25.3 → 17.4 | 50 → 18 | 4.5 → 4.8 | 6.7 → 8.1 | 8.8 → 13.2 | 412 → 193 | 150 → 146 |
| heavy effects | 16.9 → 16.9 | 25.3 → 17.0 | 42 → 25 | 4.7 → 3.8 | 6.7 → 5.4 | 8.2 → 6.9 | 323 → 186 | 203 → 140 |

These runs shared the machine with other agents' browsers. The few "after" rows that are worse (boss p95, rain and fog CPU p95) moved
by different amounts from round to round, and their allocations and draw calls went down like the rest. The steady gains are frame CPU
(−20 to −45%), allocation (−45 to −55%), major GCs (gone) and the compile freezes (gone).

GC: before, a **major GC of 5–37 ms in 12 of 20 windows**; after, none, with minor GCs at 2–3 per 5 s (≤ 3.7 ms, one outlier of 12 ms under load).
Style, layout and paint: e.g. wave 1 82 → 30 ms/s, wave 28 100 → 57 ms/s.

**GPU side** (RTX, 2560×1600 drawing buffer, real rendering, medians of two interleaved rounds):

| scenario | worst ms | frame CPU avg / p95 / worst | GPU avg / p95 ms | draw calls | triangles |
|---|---|---|---|---|---|
| wave 28 | 34.1 → 17.7 | 3.5 / 5.1 / 7.3 → 2.8 / 4.2 / 6.0 | 4.6 / 4.8 → 4.2 / 4.5 | 179 → 146 | 4.04 M → 2.35 M |
| storm | 33.9 → 18.3 | 3.8 / 5.3 / 6.8 → 2.8 / 3.7 / 5.0 | 4.3 / 4.7 → 3.7 / 4.2 | 151 → 123 | 4.53 M → 1.86 M |
| night | 17.6 → 18.1 | 3.5 / 4.8 / 8.7 → 2.8 / 4.7 / 5.8 | 4.3 / 4.7 → 4.0 / 4.5 | 165 → 159 | 4.68 M → 2.43 M |
| heavy effects | 17.8 → 17.4 | 3.6 / 5.2 / 10.3 → 2.8 / 3.7 / 4.7 | 4.5 / 4.7 → 4.3 / 4.7 | 199 → 147 | 4.53 M → 2.33 M |

Visible objects: 562 → 436, transparent objects to sort: 149 → 20.

**Event timeline** (`--events`, RTX: boss wave start, storm, snow, barrage, night, crash, dust, golden):

| | before (2 runs) | after |
|---|---|---|
| worst frame | 650 ms, 1,017 ms | **83 ms** |
| shader compiles over 20 ms | 25, 25 | **1** (49 ms, a helper's MeshBasic at the boss wave start) |
| frames over 50 ms CPU | 3, 3 | 2 (87 ms at the boss wave start: deploying the helpers; 65 ms at the snow change: the environment map) |

**Sim tick allocations** (sim-smooth's `tools/zombies-tick.mjs` scene: wave 32, 95–150 tracks, a full defence and a 12-drone swarm;
2,400 ticks traced for GC, with sampling heap allocation):

| | main | perf-hotpaths |
|---|---|---|
| allocated per 120 Hz tick | 122–159 KB (`pickTarget`, `effOf`, `Z.urgent`, `Math.hypot`, `ew`) | 57–68 KB (`threatStep` object fields, the swarm mover, minor ones) |
| worst tick | 2.5–4.3 ms (the worst coincided with a 3 ms major GC) | 1.3–3.0 ms |

The 12–24 ms tick that sim-smooth saw with one seed did not reproduce here (seeds 1–9, on sim-smooth and on this branch). Its
fingerprint (outside every Zombies hook, the heap jumping) fits a major GC landing on that tick. With half the garbage per tick, major
GCs come half as often. A major GC's pause depends on the live heap, so a rare 3 ms one remains.

After merging main with the bosses (#68) and the spectator (#66), the event timeline's worst frame is 66 ms (the boss wave starting:
deploying the helpers, plus a 35 ms first-sight sprite compile) and frame CPU p95 is 4.1 ms.

**With perf-quickwins (#69) merged** (Graphics levels, warm-up, frame cap, MSAA), the systems are integrated:

- **Particles.** `PFX.scale` follows the level's `gfx.k.fx` (through `gfx.on`).
  - The sites' fire and smoke thin through it alone, not twice.
  - Zombies' debris trails opt out, because their debris count already follows `gfx.k.fx`.
- **Warm-up.** `engine/warm.js` compiles through `compileFor`.
  - The environment-map variant pass is gone: `envOff` keeps one program per material.
  - The menu warm-up is now 27 programs instead of 49.
- **Forest.** There is one LOD system (`igfx.js`): thinning and draw distance per level, plus three crown levels at `gfx.k.lodD` / `lodD2`.
  - High: 180 faces to 900 m, 80 to 2.5 km, 20 beyond.
  - Medium: 900 / 2,000 m.
  - Low: 80 faces from 0 m, 20 from 1.3 km.
- **Shadows.** The instanced depth materials sit alongside the per-level shadow map size.

**Event timeline, one run each on the RTX:**

| | main (#69 merged) | perf-hotpaths |
|---|---|---|
| worst frame CPU | 257 ms | 73 ms |
| slow shader compiles | 15 | 1 |

On main, `PMREM.Background` recompiled at every weather change (170–340 ms each), and the sites and other materials still compiled on first sight.

Same-seed shots at High against main (`DL_GFX=high`) match for forest, high, sites, storm, snow, overcast, night and burn (mean
difference 5–9 / 255). The wave-28 views (smoke, thermal) differ because the boss roster diverged (a Ghost intro played in one run), not
in the rendering. Main's thermal shot also showed a black rectangle over half the frame, which looks like a render-target resize
artifact worth checking on main.

## 4. Look

`tools/zombies-perf-shots.mjs` (same seed, fixed cameras), before vs after, all viewed side by side: forest, sites (scattered cloud), high
(far forest LOD), smoke, burn (a burning site, explosions close up), storm, snow, overcast (cloud deck), night, thermal. The clouds are in the
same places with the same shapes, the far forest reads the same, the cloud deck still hides the cumulus, and night lighting and searchlights are
unchanged. The remaining pixel differences (mean 5–9 / 255) come from randomness and timing (wind, sensor grain, radio lines, a lock-on
that happened in one run) and the HUD text.

## 5. What's left

- **First-sight compiles of hidden pooled objects** (weather points, the cloud deck, the boss and helper materials). They're one-time,
  50–100 ms each. That's the shader warm-up work (perf-quickwins); `compileFor` is the right call for it.
- **Frame pacing** on the 240 Hz panel (0/1/2 sim steps per frame): sim-smooth.
- 2D-canvas `font` sets: cheap in isolation here (0.4 µs). routes-scout saw 11% with Google Fonts blocked in the harness, so it's worth
  re-checking in a real window.
- Remaining garbage, about 170 KB/frame. Most of it is in the canvas and WebGL bindings (doubles boxed into HeapNumbers when passed to
  `lineTo` / `uniform*`), three's lights `setup` and uniform uploads, plus `threatStep`'s object fields. It's minor-GC only now.
- `zreentry.js` (#65) draws its trails as ribbons and its glows as pixel-sized points on a sky shell: a different technique, so it isn't in
  the particle pools. It rebuilds compact buffers each frame (fine), with small allocations (`(...a)=>gput(...)` spreads).
- The Intel iGPU stays far off 60 fps (it's vertex- and fill-bound). The forest LOD halves its triangles. The rest is impostors and a Low tier
  (routes-scout route 4, perf-quickwins).
