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
- `node tools/zombies-regress.mjs [w1,w20boss,fixed60,tracks400,base,endless60,spec,coop,hush,hushq,jammer,buddy,buddyv,guide,codex] [--reps=3] [--sec=3] [--json=f] [--off=Scars,Radio] [--cam=chase] [--funcs] [--draws]`
  (2026-10-23): the same scenes on any checkout, to compare two builds number for number (copy the file into an older worktree's `tools/`).
  The game's own frame (`engine/loop.js`) is called from the page by a timer, one every 16.7 ms, so a busy machine cannot starve the measurement of frames
  (see "The measurement" in section 6). Per scene: CPU ms per frame of the renderer's main thread (Chrome's ThreadTime), the time of the game frame
  (p50 / p95 / p99 / worst, frames over 8 ms) and of the gap between frame starts, draw calls, GC, allocation per frame, and the CPU and the allocation per source file.
  `--off=Scars,Radio` switches those modules' frame and tick hooks off (the names are the `initX` calls in `zombies.js`): the difference to a `--wrap` run is the
  module's cost. `--funcs` lists the hottest functions, `--draws` the draw calls by object.
- `node tools/zombies-parity.mjs buddy|sites OUTDIR` and `--cmp A B` (2026-10-24): pixel parity of what a merge or a batch touches (Little Buddy's model, the enemy sites), drawn by the game's renderer into a render target from
  fixed cameras with nothing else in the scene, so two builds compare exactly; also the draw calls and meshes per view (section 7).
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

**Against main after sim-smooth (#70), league-smooth (#74), pop-strict (#76), CI retry (#77) and sorties (#78).** Interleaved, two
rounds, medians. CPU side uses `DL_NORENDER=1`. Main is much quieter now (fixed tick, interpolation, grid, warm-up), and the machine
was too:

| scenario | frame CPU avg | CPU p95 | CPU worst | KB allocated per frame | draw calls |
|---|---|---|---|---|---|
| wave 1 | 2.3 → 1.4 | 2.8 → 1.8 | 3.3 → 2.3 | 161 → 89 | 207 → 155 |
| wave 28 | 2.8 → 2.0 | 3.3 → 2.5 | 4.1 → 3.8 | 308 → 184 | 171 → 141 |
| boss | 2.7 → 1.8 | 3.2 → 2.3 | 4.1 → 3.0 | 262 → 157 | 233 → 140 |
| storm | 2.9 → 2.4 | 3.3 → 2.9 | 4.0 → 4.0 | 337 → 207 | 179 → 137 |
| snow | 2.8 → 2.2 | 3.4 → 2.9 | 4.2 → 4.0 | 327 → 216 | 180 → 137 |
| night | 2.8 → 2.3 | 3.3 → 2.8 | 3.9 → 4.2 | 328 → 256 | 182 → 190 |
| dust | 2.8 → 2.2 | 3.3 → 2.7 | 4.4 → 3.3 | 303 → 170 | 164 → 178 |
| heavy effects | 3.0 → 2.3 | 3.5 → 2.8 | 4.1 → 4.5 | 332 → 229 | 233 → 180 |

- **Frame intervals:** p95 17.1–17.5 ms and worst 17.7–18.1 ms on both builds (vsync-bound, no spikes).
- **GC:** main had a major GC of 1.7–3.9 ms in 10 of 16 windows; this branch had one in 2 of 16 (2.4 and 2.8 ms).
- **RTX at 2560×1600, wave 28:** frame CPU 3.1 → 2.3 ms, 179 → 101 draw calls, 3.0 M → 1.3 M triangles.
- **Event timeline:** main's worst was 48 and 51 ms, this branch's 48 and 47 ms. Main's warm-up and fixed tick already removed its big hitches. CPU p95 over the timeline was 3.5 → 2.8 ms.

In this merge, sim-smooth's grid queries, interpolation and staggered thinking are kept. On top of them, the hot searches make no
closures: `pickTarget`, the jammer and lock-on keep their query state in one object, with callbacks made once.

`Math.hypot` stays in the jammer's range test. With `hyp()` there, the grid-vs-loop whole-wave comparison in zombies-test diverged.
That suggests a latent grid/brute-dependent path that a borderline roll exposes. One candidate is the near-miss readout in
`zombies.js`, which has no range cap of its own in brute mode. sim-smooth may want to look at it.

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

## 6. Did the week's landings cost smoothness? (2026-10-23, branch `perf-regress`)

Three builds, the same scenes and seeds (`tools/zombies-regress.mjs`): **before** = `bf10c83`, the last commit before 2026-10-21; **now** = `7a0e6c6`, main with
the week's 230 commits (scars, the Director, radio and speech, the Hush, the EW duel, the codex, Little Buddy, the roaming bot, the briefing, onboarding,
Endless, the player's lead() extrapolation); **after** = this branch. Headless Edge on the RTX (`DL_HIGHGPU=1`), 1280×720, clear weather, the menu
warm-up finished before each scene. Three runs of each, interleaved (before, now, after, before, ...); medians, with the best run in brackets.

**The measurement.** The machine was shared with other agents' browsers (load 10–60%, at times 100%), and a starved page got 4 to 80 frames in 4 s, so
numbers taken from displayed frames were useless. The tool now calls the game's own frame (`engine/loop.js`) from a timer, one every 16.7 ms (the sim
ticks twice a frame, as in play), and reports: the renderer thread's CPU time per frame (Chrome's `ThreadTime`, which does not count the time a frame
waits for a core), the wall time of the frame function (p50 / p99 / worst), the allocation per frame (sampling heap profiler, garbage included) and the draw
calls, which do not depend on the load. Absolute CPU still moves with the load (one scene ran 2.6 to 3.9 ms between a quiet and a busy minute); only
before / now / after taken in the same minutes compare. The wave-plan scenes bring different tracks in different builds (the boss roster changed), so
`fixed60` (the same 60 tracks) and `tracks400` (the same 400) are the controlled ones. Of the 79 runs two had a frame start more than 25 ms after the last (a late timer:
28 ms at most), none had a long task, and the p99 of the gap between frame starts never passed 22.3 ms. (None of the 79 table runs had one, but in later probes at very low load the harness itself met a main-thread stall of about
0.5 s once or twice a window, in every build including the baseline: a trace shows it as `CanvasRenderingContext2D::FinalizeFrame` waiting in `SharedContextRateLimiter::Tick`, Chrome's GPU backpressure on
2D-canvas frames (frames submitted from a timer are not paced by the compositor, so the GPU queue fills; an empty rAF loop alongside does not change it). It is not game code and not in the CPU,
allocation or draw-call columns, and the baseline has it too, so it is not one of the week's regressions; whether a rAF-paced session on a slow GPU feels it was not measured.)

| scene | tracks | CPU ms / frame (best) | frame p50 | frame p99 | worst | frames over 8 ms | KB allocated / frame | draw calls |
|---|---|---|---|---|---|---|---|---|
| wave 1 | 1 | 1.9 → 1.9 → 2.9 (1.7 → 1.8 → 1.9) | 1.4 → 1.4 → 2.0 | 2.1 → 2.0 → 3.8 | 2.6 → 2.5 → 4.1 | 0 → 0 → 0 | 87 → 82 → 83 | 157 |
| wave 20, a boss | 13–32 | 3.0 → 2.7 → 3.1 (2.7 → 2.6 → 3.0) | 2.1 → 2.1 → 2.3 | 4.5 → 4.4 → 4.5 | 4.5 → 5.2 → 4.6 | 0 → 0 → 0 | 159 → 178 → 157 | 192 → 183 → 185 |
| 60 fixed tracks, a boss | 60 | 3.3 → 3.9 → 3.3 (2.9 → 3.1 → 2.6) | 2.2 → 2.6 → 2.2 | 5.1 → 5.7 → 4.2 | 5.6 → 6.2 → 4.8 | 0 → 0 → 0 | 226 → 234 → 199 | 176 → 177 → 177 |
| **400 fixed tracks** | 400 | **7.9 → 9.0 → 5.2** (5.7 → 7.2 → 5.0) | 6.4 → 7.6 → 3.8 | 16.8 → 17.9 → 8.4 | 17.8 → 19.5 → 9.2 | **44 → 65 → 3** | 479 → 613 → 428 | 165 |
| base screen, wave 24 | 0 | 3.2 → 2.7 → 2.5 (2.6 → 2.3 → 2.2) | 2.6 → 2.1 → 1.8 | 4.6 → 3.9 → 4.1 | 5.0 → 4.1 → 4.2 | 0 → 0 → 0 | 108 → 109 → 107 | 241 → 246 → 244 |
| **Endless, wave 60** | 420–440 | (new) 8.8 → 5.6 (8.3 → 4.8) | 7.5 → 4.5 | 13.8 → 7.5 | 15.7 → 7.9 | **76 → 0** | 567 → 393 | 217 → 210 |
| Bot Spectator, Director | 8 | 3.3 → 3.5 → 4.1 (3.1 → 2.6 → 2.7) | 2.4 → 2.6 → 3.2 | 5.0 → 5.4 → 4.6 | 5.2 → 5.6 → 5.0 | 0 → 0 → 0 | 175 → 157 → 166 | 231 → 312 → 376 (camera) |
| co-op host, 2 clients | 5–30 | 4.2 → 3.9 → 4.9 (4.2 → 3.9 → 3.2) | 3.4 → 3.1 → 3.7 | 5.7 → 4.6 → 6.3 | 6.5 → 5.2 → 6.4 | 0 → 0 → 0 | 316 → 341 → 299 | 291 → 259 → 258 |
| Jammer King | 8–24 | 3.6 → 3.4 → 3.4 (3.0 → 2.8 → 2.8) | 2.6 → 2.4 → 2.4 | 4.5 → 4.8 → 5.1 | 4.6 → 5.5 → 5.2 | 0 → 0 → 0 | 223 → 220 → 181 | 186 → 192 → 181 |
| the Hush | 5–8 | (new) 4.2 → 2.8 (2.9 → 2.6) | 2.9 → 2.1 | 5.0 → 4.0 | 5.3 → 4.7 | 0 → 0 | 200 → 194 | 189 → 190 |

Each cell reads before → now → after (a single arrow where a build has no such scene). GC: 0.5–2.7 ms of minor GC in a 3 s window in every scene; a major GC of 2–5 ms landed
in 10 of the 79 windows (in all three builds: the spectator, the 400-track scene, Endless), none longer than a frame.

**What it says.**
1. **Nothing the week added costs measurable frame time at normal loads.** Wave 1, wave 20 with a boss, 60 tracks, the base screen, the Jammer King, the
   spectator and the co-op host are within ±0.3 ms of the baseline's (run-to-run noise); draw calls are the same (the spectator's differ with where the
   Director points the camera). The costliest new thing per frame is the Jammer King's noise bar (0.16 ms, 11 KB), then the Little Buddy (below).
2. **One real cost, and it was already there: the radar picture check.** `Z.seen(t)` (is this track on the radar) went through `Z.radarK()`, which scanned the
   whole track list for living bosses and built the trophy list again, for every call; the lock-on search asks it for every track in range every sim tick
   (about 1,000 calls a frame at 400 tracks) and the radar once per track. That is 4.4 ms of the 9 ms frame at 400 tracks (2.2 + 0.6 ms in the
   baseline). Endless, whose waves climb to 600 tracks (`CAP_TRACKS`), made the case reachable: at wave 60 it was 440 tracks, 8.8 ms of CPU a frame, 76 of 180
   frames over 8 ms (a missed frame at 120 Hz). Fixed at the source (below): **400 tracks 9.0 → 5.2 ms, Endless wave 60 8.8 → 5.6 ms, frames over 8 ms 76 → 0.**
3. **First-use hitches** (`tools/zombies-hitch.mjs`, three runs each, medians): no event over 50 ms in the game in any build; the worst frame while the menu
   warms 143 → 115 → 109 ms; Play 132 → 155 → 149 ms (that one is the audio context, below). The warm-up's longest idle slice went 202 → 202 → **133** ms
   (the one left is three.js's first-use check of one shader program, which waits for the driver); before the fix it was a single 256 ms slice (the
   scars' textures) and a 174 ms one (the sites' damage stages), now ≤ 5 ms slices and 8–24 ms ones (one of 66 ms, the first stage with its shader) (208 → 224 → 396 tasks, 613 ms in all).

**What each module costs** (CPU profile self time per frame, natives such as `fillText` counted to the file that made them; sampling at 250 µs, so under
0.02 ms is noise). Switching a module's frame and tick hooks off (`--off=Scars`, three runs each) moves the whole frame by −0.4 to +2.7 ms, but that is the machine's load changing between two runs
(9 to 50%), not the module; what it confirms is the module's own file dropping out of the profile by the amount listed (the EW off: `zew.js` −0.13 ms and −10.8 KB/frame, and the draw calls unchanged):

| module | where | CPU ms / frame | KB / frame | notes |
|---|---|---|---|---|
| scars (`zscars.js`) | Endless 60, 29 scars | < 0.02 | 0.4 | 3 instanced draws; the texture build was one 256 ms idle slice in the menu, now ≤ 5 ms slices |
| Director (`zdirector.js`) | spectator | < 0.02 | 0.2 | the scorer runs 10 Hz (every frame at fast-forward), no allocation |
| radio (`zradio.js`) | wave 20 / Endless 60 | < 0.02 | 0.3 / 1.5 | speech: `getVoices()` was asked per call, now once |
| the Hush's voice (`zhush-snd.js`, `zboss-hush.js`, `zhush-cue.js`) | the Hush | < 0.03 | 2.8 | 13 AudioParam writes a frame; the audio thread's cost is not in these numbers |
| EW duel (`zew.js`) | Jammer King | 0.16 → 0.08 | 11.1 → 2.7 | the noise bar and the pip's static built a colour string per speck |
| codex (`zcodex.js`) | any wave / first open | < 0.02 / 12 pictures | 0.1 | opening the Enemies screen: 12 models drawn by the software rasteriser and PNG-coded, 3–12 ms each (the Juggernaut 12–32), one per timer slice; `open()` 0.8 ms, the opening frame 40–56 ms of layout and paint, not script |
| Little Buddy (`zbuddy.js`) | with a garage quad | 0.02 + **39 draw calls** | 1.3 | the League model is 22 meshes (17 cast shadows): 158 → 197 calls in view, about 0.3–0.4 ms of submission |
| roaming bot (`zbotroam.js`, `zbotmap.js`, `zbotstat.js`) | spectator | 0.05 | 2.1 | bots only |
| briefing (`zbrief.js`) | base screen | 0 a frame; 0.04 ms per card | 0 | a whole redraw of the base screen is 10.2 ms (6.9 before the week), on a click only |
| onboarding (`zonboard.js`) | first run | 0.01 | 0.3 | none after the guide ends |
| lead() (`lead.js`, the player's extrapolation in `interp.js`) | all | < 0.02 | 0.5 | `interp.js` as a whole is 0.01–0.12 ms (the tracks' interpolation grows with their number) |

**Fixed in this branch** (behaviour unchanged; each measured, then the whole `zombies-test.mjs` (707 checks), `zombies-coop.mjs` (121) and `npm test` pass):
- `zbosses.js`: the boss list is found by one scan of the track list per sim tick, and the trophy list is kept until the trophies change (`Z.seen`,
  `Z.radarK`, `Z.ident`, `Z.jink` and `Z.lockJam` were O(tracks) each, with two arrays): 400 tracks 9.0 → 5.2 ms/frame (4.4 → 0.2 ms spent in `Z.seen` and what it calls),
  Endless wave 60 8.8 → 5.6 ms.
- `zlock.js`: the lock-on search tests the range before asking the radar picture. `zperk.js`: `Z.radarK` made a four-number array per call.
- `zwarn.js`: `alerts()` (twice a frame in the HUD) built and sorted an array and ran `TH.includes` per fast track; now no array while nothing is up (16 → 2.6 KB/frame at 60 tracks).
- `zew.js`: the static's colours from 16-step tables, not a string per speck (Jammer King 11.1 → 2.7 KB/frame, 0.16 → 0.08 ms).
- `zthreatsfx.js`: the sound sources are kept records (Endless 60: 20 → 6 KB/frame of garbage). `zenemy.js`: the per-kind counters and exhaust colours made once.
  `zfx.js`: the music intensity uses `hyp()` (no boxed `Math.hypot` arguments per track). `interceptor.js`: the target bracket's corners.
  `zbuddy.js`: the card text is built when its numbers change, not every frame; the props' spin without a closure.
- Idle stalls: `zscars.js` builds its terrain textures in slices and uploads the finished textures in idle time (the warm-up no longer runs the whole build in one
  slice: 256 → ≤ 5 ms); `buildings.js` builds the sites' damage stages one a slice in the warm-up (174 → 10–24 ms).

**Proposals** (design changes, not made):
- **Radar labels**: the scope writes `T07 12` for every live track at 30 Hz: `fillText` is 0.45 ms/frame of the 5.2 at 400 tracks (the whole radar 0.85). Labelling the 40 nearest
  and the selected one saves about 0.4 ms at 400 tracks and nothing below 40.
- **Little Buddy**: merging its static frame meshes by material, and a blade and its disc, takes 22 meshes to about 10 (−12 main, −9 shadow draws, about 0.15 ms each buddy; a
  co-op game has up to three). Past about 1 km it is under a pixel: hiding the model there (its name tag stays) saves the other 39.
- **The enemy bases** (`zsites.js`, 31 meshes at the map's edge, drawn every frame from the pad): one mesh per material, or no draw past 6 km, is up to 30 draw calls (about 0.25 ms).
- **The audio context** (`engine/audio.js`): `audioInit` is 122 ms of the 132–155 ms the first Play click takes (`new AudioContext()` opens the device). Created suspended in the menu's idle time and
  resumed on the click, it would leave the click. It touches the autoplay handling, so it wants a look on a real machine.
- **Endless's track cap**: a track costs 0.0056 ms of CPU a frame after the fix (0.015 before; from 60 to 400 tracks), so the cap of 600 is about 6.3 ms on this machine (11.9 before): inside the 120 Hz budget
  (8.3 ms), but the 240 Hz budget (4.2 ms) is gone at about 160 tracks. A lower cap, or thinning the far swarm drones' sim, is the lever if 240 Hz matters in Endless.
- The Director's scoring rate, the scar caps (256 / 128 / 64) and the radio's speech were looked at and need no change: under 0.02 ms each in the worst scenes.
- The radar labels, Little Buddy's merge, the enemy bases' batch, the audio context and the Endless ceiling are done: section 7.

## 7. The five proposals of section 6, made and measured (2026-10-24, branch `zombies-perf2`)

**Method.** Before = `origin/main` at 278db25 in its own worktree, after = this branch, the same tools on both: `tools/zombies-regress.mjs`, `tools/zombies-hitch.mjs` and the new
`tools/zombies-parity.mjs` (pixels), on the RTX (`DL_HIGHGPU=1`), headless Edge, 1280×720, the menu warm-up finished. The regress and hitch runs were **interleaved** (before, after, before, ...; the
order flips every round), three rounds of one fresh page each, medians. The machine was shared again (load 7–50% in the runs): the whole-frame CPU rows move by ±0.3 ms between runs of the same build,
so the numbers that carry each item are the ones that do not depend on the load: draw calls, objects, allocation, the profiler's per-function time and, for the pixels, a render target. New scene
`buddyv` in the regress tool: the same as `buddy` with the camera on the buddy (the chase camera never has it in view in `buddy`, so its draws were not in that frame).

| item | measure (tool) | before | after |
|---|---|---|---|
| 1 radar labels | `radar()` self time with its natives, 400 tracks (`zombies-regress tracks400 --funcs`, 3 rounds) | 0.29 / 0.38 / 0.37 ms per frame | **0.20 / 0.19 / 0.18** (the `fillText` part 0.16–0.20 → 0.02–0.05) |
| | labels written by one repaint with 120 tracks in range (`zombies-test` endless section) | 120 | **≤ 41** (the 40 nearest and the selected one); every blip is still drawn |
| | garbage from `interceptor.js` at 400 tracks | 109 KB per frame | 87 KB per frame |
| 2 Little Buddy | meshes in the model (the League builder's 14 frame meshes, 4 blades, 4 discs) | 22–23, 17–18 of them casting shadows | **8**, 6 casting |
| | draws of the model, main + shadow pass (`zombies-parity buddy`) | 39–41 | **14** |
| | CPU of one `renderer.render` of the model alone (150-frame loop, median of 7, 7 loadouts) | 0.061–0.067 ms | **0.028–0.035 ms** |
| | pixels, 7 loadouts × 4 cameras, 28 renders of 240,000 px | | 15 pixels differ (silhouette-edge specks, 6 of them far off), mean difference under 0.006 / 255 |
| 3 enemy sites | draw calls of the sites' group in the scene (`zombies-regress w20boss --draws`) | 31 per frame | **10** (the whole frame: 184 → 161 calls; `tracks400` 166 → 145; objects 491 → 469) |
| | six sites (3 launch, 3 factory; a launcher, a gun and a hall wrecked), 18 views (`zombies-parity sites`): visible meshes | 77 | **39** |
| | main + shadow draws per view | 32, 21, 22, 27, 34, 40, 14, 19 ... | 17, 11, 11, 12, 20, 20, 7, 10 ... |
| | pixels of those 18 renders (210,000–400,000 lit px each) | | mean difference ≤ 0.02 / 255; at most 143 px over 15 levels (coplanar slabs z-fighting differently) |
| 4 audio context | the first Play click of a session (`zombies-hitch`, 3 rounds): JS of the click, frame CPU, worst frame interval | 138 / 186 / 653 ms*, 155 / 216 / 698 ms, 167 / 283 / 767 ms | **14 / 40 / 49 ms**, 26 / 75 / 107 ms, 33 / 150 / 183 ms |
| 5 Endless ceiling | most tracks alive at once, a full defence, no pilot, waves 25 / 30 / 40 / 50 / 60 / 80 | 84, 106, 222, 293, **417**, **579** | 83, 108, 195, 267, **400**, **400** |
| | `endless60` (wave 60, 30 s in): tracks on the field, CPU thread, frame average, p99, calls, KB per frame | 420 / 444 / 423; 4.96, 3.95, 5.3 ms, 222, 324 | **347–388; 4.52, 3.58, 4.7 ms, 178, 274** (items 1 and 3 are in this too) |

\* round 3's baseline click also uploaded 15 textures: the warm-up was not finished, which says nothing about the context. The whole-frame time of the other scenes did not move beyond the load's noise
(`w20boss` 2.79 → 2.79 ms of thread time, `buddy` 2.71 → 2.74, `tracks400` 4.32 → 4.34): a draw call is a microsecond or two of submission here (the buddy's 25 fewer draws are 0.034 ms), so 20 draws are
a few hundredths of a millisecond and the radar's 0.18 ms is what a profile sees; under a shared machine none of it shows in a stopwatch over a whole frame.

**1. Radar labels** (`interceptor.js`). `radar()` writes `T07 12` for the `RLAB` = 40 live tracks nearest the scope's centre and for the selected one. The cut is the 40th smallest squared distance
(a `Float64Array` sorted in place, only when there are more than 40 tracks), so with 40 tracks or fewer the picture is the same as before. Blips, velocity ticks and colours are unchanged.

**2. Little Buddy** (`zbudmodel.js`). The proposal said "merge by material, 22 to about 10". The League's builder already merges per material key, and the 14 frame meshes carry **13 different
materials** (they differ in roughness, metalness, glow or colour): merging by material alone gives 18. So the plain opaque standard materials (12 of the 13) become one mesh with **one shared
`MeshStandardMaterial`** that reads each part's colour, roughness, metalness and glow from its vertices (an `onBeforeCompile` patch of three's physical shader: the same numbers through the same lighting
code; it checks that the shader chunks it patches are there, and falls back to merging by material if a three.js changes them). The clear-coated carbon and the glowing LEDs stay their own meshes, the
four blades stay (they spin), and the four discs (flat and round, so their spin cannot show) become one mesh. The merged buffers are freed with the model; the League's cached geometry is untouched. One
program is added (116 against 115); its sample is in the warm-up (`warmers`), so the first buddy does not compile it.

**3. Enemy sites** (`zsites.js`). Per site, the pad, crate and net and every hall, launcher and gun base still standing are one mesh in world coordinates (`batch`); the turrets (they aim), the patrols and
the trucks (they move) keep theirs. Each part keeps its own mesh, hidden, for its wreck: when a part goes it shows its burnt mesh and the batch is made again without it (also when a gun is replaced at
the break and when a co-op client's world says a part is back). The three roads are one mesh. A site's geometry is freed when the site is dropped.

**4. Audio context** (`engine/audio.js`, `interceptor.js`). `audioPrime` opens the context and builds the engine's voices in an idle slice on the menu (`later`, heavy, queued first) and suspends it. `AC`
stays `null` until `audioInit` adopts the primed context in the Play click, so nothing can schedule a sound on a clock that is not running and a menu with no run on it stays silent; `startMatch`
resumes it as before. If the click comes first (a `?mode=zombies` start, a slow machine) `audioInit` builds it on the spot, as it always did. `tools/audio-levels.mjs` makes its offline context when the
timeline's length is known, so it sets `window.__noAudioPrime` and primes by hand (`api.audioPrime()`) just before Play: it passes (every sound under its cap, every slider row at -6 dB). Two things to
know. The context is created before any gesture, which Chrome logs once as "The AudioContext was not allowed to start" (a console warning, not an error). And the noise buffer now has its own generator
instead of `Math.random`: with the game's, a primed page and a page that was clicked early would have given a seeded run two different games (the grid test caught that in the first version); a seeded
run's numbers after Play differ from before this change, the same in both orders.

**5. Endless ceiling** (`zendless.js`). `CAP_LIVE` = 400 tracks in the air (the `tracks400` scene is where the quadratic radar check was measured). Each step, the wave's due entries go out while the
tracks aloft plus the entry fit under it (a swarm whole, in the queue's order); the rest are lifted out of the queue for that step and put back at its front, so they go out the moment tracks die. A boss
costs nothing and is never held, and the wave cannot clear while entries wait (400 tracks are up). The campaign and the Quick defence are untouched. The threat briefing's Endless note ends with "at most 400
tracks in the air". The peaks above say where it bites: up to wave 50 a full defence never has more than 293 alive (play is unchanged); from wave 60 the plan holds 420–510 tracks, nearly all of
them alive at once, and the ceiling holds the wave at 400 (wave 80: 579 → 400).

**Tests added** (`zombies-test.mjs`): the radar's label count; the ceiling (600 drones due at once: ≤ 400 fly, 34 swarms wait, 100 deaths let 17 out, all 100 swarms go out in the end, no ceiling with the
climb off); the briefing's note; the audio context (suspended and not live on the menu, adopted and running after Play). `tools/zombies-regress.mjs` has the new `buddyv` scene and
`tools/zombies-parity.mjs` is new (`buddy` and `sites` render the same things in a private scene from fixed cameras and `--cmp` two runs; copy it into an older worktree's `tools/` for the before).
