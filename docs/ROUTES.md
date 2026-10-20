# Routes to a smoother and better-looking game (scouting report, 2026-10-20)

Branch `routes-scout`. Nothing here changes `main` or any game's default code path. The measurement tools are in `proto/`.
The numbers come from this machine: an i9-14900HX laptop with **two GPUs**, an Intel UHD iGPU and an RTX 4070 Laptop. The display is
2560 px wide, 240 Hz on the NVIDIA. I tested headless Edge 155, Zombies wave 28 with a full defence (38–80 live tracks), at a
2560×1440 drawing buffer (1707×960 CSS px at DPR 1.5, the game's own pixel-ratio cap) with uncapped frames, unless a row says otherwise.

## Best value first

| # | Route | Fixes | Expected gain | Effort | Risk | What's lost | Recommendation |
|---|---|---|---|---|---|---|---|
| 0 | **Run on the RTX, not the Intel iGPU.** Set Windows' per-app GPU for Edge, or have the launcher start Edge with `--force_high_performance_gpu` | smoothness | **Measured: 10–25× on GPU time.** Intel: 100–240 ms GPU per frame (4–10 fps). RTX: ~3 ms | 5 min (setting) / 1 h (launcher) | low | nothing (a separate Edge profile for the launcher would start with empty localStorage) | **Do it first, and check `edge://gpu` today** |
| 1 | **Frame pacing.** Interpolate the 120 Hz sim, cap the frame rate to a divisor of the display (120 / 80 / 60 on 240 Hz), keep the main thread under budget | smoothness | On the RTX the game runs 6–16 ms, CPU-bound, with p99 spikes to 25–40 ms. Interpolation removes the 0/1/2-steps-per-frame judder | 1–3 days (sim-smooth is already on it) | low | nothing | **Yes (in flight).** Add a cap option to the graphics setting |
| 2 | **Main-thread diet** (the GPU idles, the CPU is the limit): 2D-canvas `font` churn, the radar redraw, `updateMatrixWorld` over static objects, per-frame program lookups, forest draw calls | smoothness | Measured: font sets ≈11 %, radar ≈12–17 %, `updateMatrixWorld` ≈9 % of main-thread time. Skipping the radar alone: −1.5 to −2 ms per frame. Expect 25–40 % off the CPU frame | 2–4 days | low | nothing | **Yes**: hand the profile below to perf-hotpaths |
| 3 | **Antialiasing that actually reaches the 3D scene.** The Interceptor's composer target has no MSAA, so `antialias:true` does nothing for the scene | looks | Clean tree, wire and roof edges. Measured on the RTX at 1440p: **SMAA +0.5 ms GPU**, **MSAA ×4 +2.3 ms GPU**, ±0 CPU | ½ day | low | a little GPU on iGPUs (Drone League already has a Med = SMAA tier for that) | **Yes**: a cheap, visible win |
| 4 | **Forest LOD + impostors** (and a lighter shadow caster) | both | Measured: the forest is 4.1 M of the 4.5 M triangles. Hiding it saves 1.3 ms GPU / ~2 ms CPU on the RTX, and ~40 % of GPU time on the iGPU. Impostors past ~400 m should keep the look and recover most of that | 3–5 days | med (impostor pop / lighting match) | nothing if done well | **Yes**, after perf-quickwins' distance LOD lands. It's the enabler for the iGPU and for CSM |
| 5 | **Graphics upgrades in the current stack (r160 WebGL):** CSM, GTAO, height fog, terrain detail normals, clouds, water | looks | ~10 ms of GPU headroom per 60 Hz frame on the RTX (the frame uses ~3 ms). Most upgrades cost 0.2–1.5 ms GPU each. CSM's real cost is CPU (extra shadow draws) | 1–3 days each | low–med | iGPU frame rate (gate them behind the graphics setting) | **Yes, staged** (§6 order) |
| 6 | **Upgrade three r160 → r186 but stay on WebGLRenderer** | enabler | Newer CSM, reversed-Z (`reversedDepthBuffer`), fixes, and the door to WebGPU later | 2–4 days (re-check every `onBeforeCompile` anchor, the logdepth chunks in custom shaders, golden screenshots) | med | nothing | **Later**: only once a feature needs it |
| 7 | **WebGPU (WebGPURenderer + TSL)** | both (in theory) | Prototype (Zombies smoke on TSL compute) measured: the same GPU time as today's r160 path, and ~0.2 ms less JS per frame at today's 3,400 particles. The big win only shows at 50k–200k particles (−0.6 / −7.5 ms JS), and it also works on WebGPURenderer's **WebGL 2 fallback**. ≈0 smoothness gain at today's content | 4–7 weeks for both games (14 custom shader sites + 2 composers + every `gl_PointSize` effect) | high | the r160 code paths. The look must be re-matched by hand | **Not now.** Revisit after routes 0–4, when a feature needs compute |
| 8 | **Desktop wrapper (Electron)** | smoothness (GPU choice, no throttling, frame cap) | The same as route 0 plus a frame cap and no background throttling. Frame time is identical to Edge (the same Chromium) | 1–2 days for a basic wrapper | low | ~90 MB download per build, the single-file / claude.ai play (it stays as a separate build), auto-update work | **Optional**: route 0 gets 90 % of it for free. Tauri doesn't help: WebView2 is Edge |
| 9 | **OffscreenCanvas render worker / sim in a worker** | smoothness | At most it overlaps three.js (≈40 % of main thread) with game JS. But gamepad, audio, WebRTC and the DOM HUD stay on the main thread | 3–6 weeks (the game mutates the scene from 20+ modules) | high | simplicity. `SharedArrayBuffer` needs COOP/COEP headers that file:// and claude.ai can't give | **No** for now |
| 10 | **WebAssembly sim** | smoothness | Measured: one 120 Hz step is **0.10–0.32 ms**, i.e. 2–4 % of the frame. Even a 3× faster sim saves < 0.3 ms | 2–4 weeks | med | two languages, the goldens | **No** |
| 11 | **Native engine port (Godot 4 / Unity / Unreal)** | both | Large (native GPU path, real tooling), but the gain sits mostly in places routes 0–5 already cover | 3–6 months per game | very high | browser sharing, claude.ai rooms, single-file builds, all the existing code and goldens | **No** |

**Headline.** The single biggest lever is which GPU draws the game. Headless Edge on this laptop picks the **Intel iGPU** by
default: WebGL *and* WebGPU, even with `powerPreference:'high-performance'`. There, Zombies wave 28 takes 100 ms GPU per frame at 720p and
~240 ms at 1440p. On the RTX the same frame is ~3 ms GPU, and the game becomes CPU-bound at 6–16 ms. Windows has no GPU preference
for `msedge.exe` set on this machine (`HKCU\Software\Microsoft\DirectX\UserGpuPreferences` has no Edge entry). A visible window
*may* still get the RTX: on some laptops the display's GPU wins. So the first thing to do is look at `edge://gpu` →
"GL_RENDERER" in the browser you play in.

---

## How I measured

- `node proto/gpu-probe.mjs` reports which adapter WebGL2 / WebGPU get, with and without `--force_high_performance_gpu`.
- `node proto/frame-profile.mjs [--gpu intel|nvidia] [--cam 0|2] [--wx storm] [--nolog] [--cpuprof] [--only …]` uses the Zombies wave-28
  set-up from `tools/zombies-perf.mjs` and records:
  - the frame interval and the CPU time inside the rAF callbacks;
  - the CPU time inside `composer.render`, and its GPU time (`EXT_disjoint_timer_query_webgl2`);
  - draw calls and triangles;
  - the cost of one `api.step(1/120)`.

  Ablations are measured A/B interleaved (base, then variant, three rounds, medians), because the wave keeps evolving and a
  late baseline is slower than an early one. `--cpuprof` adds a CDP sampling CPU profile, grouped by file. Results are in `proto/profile-*.json`.
- Caveats:
  - This is headless. The swap chain, compositor and vsync differ from a real window, so absolute fps in a window will be lower.
  - Fonts from Google Fonts are blocked in the harness, which may inflate the `ctx.font` cost.
  - Intel numbers are noisy (several seconds per frame at times).

## 0. GPU selection (measured)

| Adapter | WebGL renderer string | Zombies w28, GPU ms / frame (`composer.render`) | triangles / draw calls |
|---|---|---|---|
| default (headless Edge) | `ANGLE (Intel, Intel(R) UHD Graphics … D3D11)` | **~100 ms @1280×720**, ~240 ms @2560×1440 | 4.0 M / 186 |
| `--force_high_performance_gpu` | `ANGLE (NVIDIA, GeForce RTX 4070 Laptop … D3D11)` | **2.8–3.5 ms @2560×1440** | 4.5 M / 196 |

- WebGPU is the same story. `requestAdapter({powerPreference:'high-performance'})` returned `intel / gen-12lp` unless the switch was given.
  Then both preferences return `nvidia / lovelace`. Timestamp queries are available on both.
- On the Intel GPU, the main thread spends ~70 % of its time blocked in `vertexAttribPointer` / `bindBuffer`, waiting on a full GPU queue.
  It's vertex-bound: hiding the forest (4.0 M → 0.38 M triangles) cut GPU time from ~100 ms to ~62 ms at 720p. Even then it's far
  off 60 fps. The iGPU is not a target for Zombies in its current form. Its only route is route 4 plus a Low tier.
- Fixes, cheapest first:
  1. **Windows Settings → System → Display → Graphics → Microsoft Edge → High performance.** It's per machine, takes no code, and applies to every
     tab. Restart Edge afterwards.
  2. **The launcher** (`serve.ps1` runs `msedge --app=…`). Add `--force_high_performance_gpu`. The flag is ignored if Edge is already running, unless
     the launcher also passes its own `--user-data-dir`. A new profile starts with **empty localStorage**: settings, rates and best waves would
     have to be copied over, or the launcher keeps the default profile and only helps when Edge is closed.
  3. The game can **detect** the case: the WebGL renderer string contains Intel while a second adapter exists (not detectable from JS). Show
     a one-time hint ("Edge is drawing on the integrated GPU, see …"), and default the graphics setting to Low there. Drone League's
     `autoQ()` already maps Intel to `med`; the Interceptor has no equivalent yet (perf-quickwins is adding a graphics setting).
- Chrome / Edge on Windows don't honour `powerPreference` for WebGL or WebGPU on hybrid laptops; they use the adapter Windows gives
  the browser process. Measured above. See also the Chromium WebGPU notes on `powerPreference` (Windows support is limited):
  https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips

## 1. Where the frame goes on the RTX (measured)

Zombies w28, FPV on the mat, 2560×1440, uncapped:

| | ms / frame |
|---|---|
| frame interval | 6–16 (drifts up as the wave grows; p95 9–29, p99 10–40) |
| CPU in rAF callbacks | 5–13 |
| …of which `composer.render` CPU (three.js scene walk + GL submit) | 2.5–7 |
| …of which the sim (`step` × steps per frame) | **0.2–0.6** (0.10–0.32 ms per 120 Hz step) |
| GPU time of the whole frame | **2.7–3.6** |
| draw calls / triangles / programs | ~200 / 4.5 M / 106 |

The CPU profile (5.2 s of uncapped frames, main thread, self time) breaks down as follows:

- **three.js 37–38 %**: `updateMatrixWorld` 9 %, `projectObject` / `intersectsObject` (culling) 4 %, `getParameters` / `getProgram` / `setProgram` 5 %, `renderObject` / `renderBufferDirect` 3 %.
- **Browser internals ("(program)") 17–18 %.**
- **2D canvas ≈15 %**: the `font` setter alone is 11 %, plus `fillText` 2 %. The radar function was 12 % in one run.
- **Zombies modules 10–12 %**: `money()` formatting 1.5 %, `Z.hud` 1 %, `pickTarget` 0.7 %.
- **interceptor.js 6–18 %**: radar, HUD.
- `bufferSubData` 2 %, GC < 0.3 %.

Ablations (A/B medians, RTX, ms):

| Variant | Frame | CPU cb | GPU | Calls | Notes |
|---|---|---|---|---|---|
| shadow pass frozen (`shadowMap.autoUpdate=false`) | ≈0 | −0.1 to −0.4 | −0.16 to −0.7 | −34 to −66 | the shadow pass is cheap on the GPU; it's draw calls |
| bloom off | ≈0 | ≈0 | −0.47 | −14 | |
| no composer at all (direct render) | ≈0 | ≈0 | −0.23 | −18 | post-processing is cheap here |
| forest hidden | −2.2 | −2.2 | −1.3 (−0.85 threat cam) | −64 | 4.1 M triangles |
| radar 2D canvas skipped | **−1.9** | **−1.5** | 0 | 0 | |
| pixel ratio 1.0 (from 1.5) | −1.0 | −0.8 | −0.2 | 0 | not fill-bound |
| pixel ratio 0.75 | −1.3 | −1.0 | −0.35 | 0 | dynamic resolution won't help on the RTX |
| logarithmic depth off (`--nolog`, scratch) | ≈0 | — | ≈0 | | not worth changing for speed |
| storm weather | — | — | 2.7 | 146 | no worse than clear |

**Reading it:**

- On the dGPU, Zombies is **CPU-bound**, mostly in three.js scene work and 2D-canvas HUD work. The GPU is ~20 % busy at 60 fps.
- The jaggedness on a 240 Hz panel is almost certainly **frame pacing**: frames between 6 and 16 ms with spikes, a 120 Hz sim with no
  interpolation, and so 0, 1 or 2 sim steps per displayed frame. That is the sim-smooth agent's work. Capping to 120 or 80 fps will look
  smoother than an uncapped 90–160 fps.
- WASM (route 10) and a sim worker (route 9) attack the 3 % sim slice. Route 2 attacks the 60 % that matters.

Hot spots for perf-hotpaths (exact functions, file:line from the profile):

- `interceptor.js:523 radar` and the overlay: set `ctx.font` only when it changes, draw the static rings / AO / river into a cached canvas,
  and redraw blips at 30 Hz.
- The other `ctx.font=` sites: `zombies.js:269-273`, `zbase.js`, `zchain.js`, `zlock.js`, `znet.js`, `zswarm.js`, `strela.js`.
- `updateMatrixWorld`: set `matrixAutoUpdate=false` (plus one `updateMatrix()`) on static meshes (houses, buildings, props, forest tiles, sites).
- `WebGLPrograms.getParameters` runs every frame. Some material's program is re-validated every frame (a changing light state or `needsUpdate`).
  Worth a breakpoint.
- `money()` in `zombies.js:22`: cache the formatted string per value.

## 2. Desktop wrapper: Electron vs Tauri

| | Electron 44.x | Tauri 2.x |
|---|---|---|
| Engine | its own Chromium, the same Blink / ANGLE / V8 as Edge, so **frame time = Edge's** on the same GPU | the system WebView2 = **Edge** on Windows (WebKitGTK on Linux, WKWebView on macOS: different engines with weaker WebGL / WebGPU) |
| Forcing the dGPU | `app.commandLine.appendSwitch('force_high_performance_gpu')` works (it's Chromium's own switch) | not reliable: WebView2 draws in `msedgewebview2.exe`, so the Windows preference must target that exe. Flags need `AdditionalBrowserArguments` |
| No tab / background throttling | `backgroundThrottling:false` | WebView2 setting, partial |
| Frame-rate cap / uncap | in JS (rAF skipping) on both; `--disable-frame-rate-limit` / `--disable-gpu-vsync` for testing only (tearing) | same |
| Fullscreen | `win.setFullScreen`, plus Pointer Lock and keyboard lock | yes |
| Download | **≈90–110 MB** installer (≈250 MB unpacked) | **≈3–10 MB** (WebView2 is already on Windows 10/11) |
| Online play | PeerJS / WebRTC work unchanged. **claude.ai rooms don't** (they're the artifact runtime), except by loading the claude.ai page itself | the same |
| Gamepad / WebAudio | identical to Chrome | identical to Edge |

- Electron gives route 0 plus a frame cap and no throttling, at the cost of a large download, a signing / update pipeline, and a second build to keep green.
- Since the frame time is the same Chromium, the measured gain over a correctly configured Edge (route 0) is ≈0. I didn't build the wrapper:
  with the profile above there is nothing for it to win in frame time, and the GPU question is answered by the probe.
- If wanted later: a 30-line `main.js` that loads `games/interceptor/index.html` from disk (the three import map must point at a local copy instead
  of jsDelivr) is a day's work.
- Docs: https://www.electronjs.org/docs/latest/api/command-line-switches,
  https://www.electronjs.org/docs/latest/api/browser-window (`backgroundThrottling`), https://v2.tauri.app/reference/webview-versions/

## 3. OffscreenCanvas and workers

- **Feasible:** three.js renders into `canvas.transferControlToOffscreen()` in a worker. There's an official example
  (`webgl_worker_offscreencanvas`), and the WebGL and WebGPU renderers both work there.
- **Hard here:**
  - The game logic creates and mutates scene objects from ~25 modules (`t.mesh.position…`, `scene.add` in `zfx`, `zdef`, `zswarm`, …), so the render
    worker needs either the whole game (then input, the Gamepad API, WebAudio, WebRTC and the DOM HUD must be proxied: none of them exist in a worker)
    or a transform / visibility sync layer (a rewrite of the scene layer).
  - Canvas textures for labels, and the 2D overlay, stay on the main thread.
  - `SharedArrayBuffer` needs COOP / COEP headers (not possible for file:// single-file builds or claude.ai artifacts), so sync would be by `postMessage` copies.
- **Gain:** overlap of three.js' ~40 % with game / HUD JS. Best case ≈35 % lower CPU frame time, which routes 1–2 mostly get for a fraction of the work.
- **Sim-only worker:** the sim is 3 % of the frame (§1). No.

## 4. WebAssembly for the simulation

Measured: `api.step(1/120)` costs 0.10–0.32 ms at wave 28 with 40–80 tracks and a full defence, i.e. 0.2–0.6 ms per 60 Hz frame. Rendering
and HUD JS are 15–30× that. Drone League's sim already uses Rapier (WASM) for physics. Porting the Zombies sim to Rust / C++ would save
well under 0.5 ms, and add a build step, a second language and golden-test churn. **Not worth it.** Revisit only if a future feature
(thousands of agents, say) makes the sim > 25 % of the frame.

## 5. Native engine ports

| | Godot 4.x | Unity 6 | Unreal 5 |
|---|---|---|---|
| Port estimate, Interceptor Classic + Zombies (≈ 600 KB of dense JS, 20+ systems, the custom shaders, the net code) | **14–22 weeks** (one dev) | 16–24 weeks | 24+ weeks |
| Plus Drone League (Rapier, parts, tuner, bots, replays) | +12–20 weeks | +12–20 | +20 |
| Web export | WebGL 2 "Compatibility" renderer only (no Forward+ / Vulkan features on web), ~25–40 MB wasm+pck (~8–10 MB brotli), slow start, threads need COOP / COEP; C# web export limited | WebGL 2 (WebGPU backend experimental in Unity 6), 10–30 MB typical, IL2CPP build times | none (HTML5 dropped) |

- **Gained:** native frame pacing, profilers, editors, GPU-driven features (Godot SDFGI, Unity HDRP / URP volumetrics, Nanite / Lumen in UE5).
- **Lost:**
  - instant browser sharing and the claude.ai room play;
  - the single-file HTML build;
  - every line of existing code, every golden test and bot benchmark;
  - the "edit a file, reload" loop the agents use.
- The web exports would *not* run better than the current three.js game in a browser: they sit on the same WebGL 2.
- **Verdict:** no. The measured problems (GPU selection, pacing, main-thread JS, an un-antialiased composer) are all fixable in place.
- Docs: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html,
  https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-technical-overview.html

## 6. Looking better in the current stack (r160, WebGL 2)

**Budget:** on the RTX the frame uses ~3 ms GPU at 1440p, so there is ~10 ms of GPU headroom at 60 fps (~5 ms at 120 fps). CPU is the scarce resource, so
**prefer upgrades that cost GPU, not draw calls**. Gate everything behind the graphics setting (iGPU = off).

Costs are for the RTX at 2560×1440. "est." means estimated from typical figures for these passes; "meas." means measured here.

| Upgrade | Visual gain | GPU cost | CPU cost | Notes |
|---|---|---|---|---|
| **AA in the composer** (MSAA ×4 on the HalfFloat target, or SMAA) | high: the scene currently has **no AA at all** (EffectComposer's own target is created without `samples`; setting `samples=4` doubled the GPU time, which confirms there was none) | **meas. SMAA +0.5, MSAA ×4 +2.3** | ±0 (meas.) | Drone League's `QUAL` already does exactly this (`msaa` / `smaa`). SMAA on Med, MSAA (or MSAA + SMAA) on High |
| **Height / ground fog** (exponential height fog in the existing fog chunk, same colours per weather) | high: valleys, river mist, depth at dawn and dusk; it keeps the current `Fog` look as the far term | 0.1–0.2 | 0 | an `onBeforeCompile` on `fog_fragment` (every material) or a depth-based full-screen pass after the RenderPass. Height fog needs the world position, which the `detail()` materials already pass (`vWP`) |
| **GTAO** (r160 `GTAOPass`) | med–high: contact shading under houses, trees on the ground, the bunker | **meas. +3.8** (full res and half res alike) | **meas. +2.2** (draw calls 200 → 380, triangles 4.6 M → 9.3 M) | the cost is the pass's own normal / depth re-render of the whole scene, not the AO maths, so half res doesn't help. It becomes affordable after route 4 (forest LOD), or with a depth-only AO (normals from depth) or the r186 MRT path. Note: GTAO with the log depth buffer needs checking visually |
| **CSM** (3 cascades: 0–150 m, 150–600 m, 600–2500 m) | high: shadows past 220 m (today the forest beyond the 440 m box has none), steadier near shadows | 0.5–1.0 | **+1 shadow draw set per cascade** (today 34–66 calls; with the forest, ×3) | three r160 ships `CSM` (addons, `CSMShader` patches materials, which conflicts with our `onBeforeCompile` chains; needs care). The far cascade at 1024² with trunk-less, impostor or low-LOD trees. Do it after route 4 |
| **Bloom tuning** (soft-knee bright-pass, as Drone League already does; threshold on luminance) | med: cleaner glows on fires and tracers, less wash on snow | 0 | 0 | copy `src/render/renderer.js` bright-pass |
| **TAA** | high for foliage and wires, but ghosts on fast FPV motion and on additive particles | 0.4–0.8 | velocity pass (CPU +draws) | not recommended for a 360 km/h FPV game; SMAA + MSAA is safer |
| **Terrain detail normals** (a real tiling normal and roughness set per crop type, triplanar on slopes) | med: close-up ground at low altitude | 0.2–0.4 | 0 | extends `ground.js` GLSL; textures as small DataTextures, so the single-file build stays small |
| **Impostor trees** (octahedral or 8-view billboards past ~400 m, real meshes near) | med look (denser far forest becomes affordable), **big perf** | −1 (saves) | −2 (saves) | route 4 |
| **Cloud layer** (a 2D noise cloud dome or a raymarched slab at the `deck` height per weather) | high for the storm / overcast / dusk weathers | 0.5–2 (raymarched) / 0.1 (dome) | 0 | `Sky` stays; the clouds blend over it. The `deck` values already exist in `zwx.js` |
| **Better water** (the river: a `Water`-style normal-map ripple, sky reflection from the existing PMREM env, depth tint) | med (the river is visible from altitude) | 0.2–0.5 | 0 | no planar reflection (that doubles the scene draws) |
| **HDR environment lighting** (PMREM from `Sky`, already used for metal and water) on all materials, plus an `envMapIntensity` per weather | med: less flat shading on overcast days | ≈0 | 0 | already half done (`pmrem`, `envRT`) |

## 7. Rendering architecture

- **Draw calls.** ~200 per frame (~350 in threat cam), of which the forest is 64 (32 tiles × trunk / crown) plus the shadow pass. That's fine
  for WebGL; the CPU cost is per *object* (scene walk, matrices, culling, program checks), and three walks every object every frame.
  - `matrixAutoUpdate=false` on static objects.
  - Merge static village / props geometry per tile (`BufferGeometryUtils.mergeGeometries`).
  - Keep `InstancedMesh` for every repeated thing. Zombies already does this for enemies, defences and swarms.
- **Texture atlas.** Little to gain. Textures are few and mostly procedural canvases; draw calls don't break on texture swaps here.
- **LOD / impostors.** The forest: 4.1 M of 4.5 M triangles. The crown is an `IcosahedronGeometry(1,2)` (320 triangles) × 2 per tree.
  - A 3-level LOD (320, then 80, then an impostor) per 1125 m tile would cut ~85 % of the triangles.
  - The shadow pass could use the 80-triangle crown always.
- **Frustum culling of effects.** Particles and Points are `frustumCulled=false` (correct: one buffer each). Their cost is the CPU loop over
  3,000–3,400 slots per system per frame plus a full-buffer upload (`bufferSubData` 2 %). Use `updateRange` / `addUpdateRange` for the live
  slice, and early-out when a system is empty (`zfx` smoke already does).
- **Occlusion culling.** Not worth it: open farmland, a high camera.
- **Resolution vs post order.**
  - Today: scene at full res (pixel ratio ≤1.5) → bloom (half-res mips) → OutputPass → the `sens` FPV pass.
  - Upscaling won't help the RTX (pixel ratio 0.75 saved only 0.35 ms GPU); on iGPUs, dynamic resolution helps less than LOD (vertex-bound).
  - Keep the HUD and the `sens` noise at native resolution (they're cheap). Render the scene at the dynamic resolution. That's perf-quickwins' work.

## 1b. WebGPU via three's WebGPURenderer (route 7)

- **Version.** Latest is three **r186.1** (npm, 2026-09-24), installed in `proto/webgpu/` only.
  - `WebGPURenderer` comes from `three/webgpu`, TSL from `three/tsl`. It falls back to a WebGL 2 backend automatically when `navigator.gpu` is missing.
  - r186 has `logarithmicDepthBuffer`, `reversedDepthBuffer`, `PostProcessing` / `RenderPipeline`, `BloomNode`, `GTAONode`, `SMAANode`, `FXAANode`, `TRAANode`, `CSMShadowNode`,
    `SkyMesh`, `WaterMesh`, `PointsNodeMaterial` (`sizeNode`), `SpriteNodeMaterial`, `instancedArray` (storage buffers) and `computeAsync`. All checked in the installed build.
- **What breaks.**
  - WebGPURenderer does not run `ShaderMaterial`, `RawShaderMaterial` or `onBeforeCompile` (`onBeforeCompile` is WebGL-only by design).
  - `EffectComposer` / `ShaderPass` / `UnrealBloomPass` are WebGL-only.
  - WebGPU has no `gl_PointSize`: point sprites > 1 px must become instanced quads (`PointsNodeMaterial` with `sizeNode`, or `SpriteNodeMaterial`).
  - `glslFn` only runs on the WebGL fallback backend, so the GLSL must be rewritten in TSL to be portable (`wgslFn` is WebGPU-only).
- **Browser support** (2026): Chrome / Edge 113+ (Windows, macOS, ChromeOS), Android Chrome 121+, Safari 26, Firefox 141+ on Windows (other platforms
  rolling out). Here: available in headless Edge 155 on both GPUs, with `timestamp-query`.
- Docs:
  - https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer
  - https://threejs.org/docs/TSL.html
  - https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
  - https://caniuse.com/webgpu

### Inventory of custom shader code (both games)

Effort is for a TSL port that looks the same. The checks: the screenshot tools (`tools/zombies-look-shots.mjs`, `fx-shots`, `goalfx-shots`).

| Game | Where | Kind | What it does | Port effort |
|---|---|---|---|---|
| shared | `engine/render.js detail()` | onBeforeCompile on MeshStandard (ground, trees, trunks, houses, roofs) | world-space 2-scale noise albedo, derivative bump normals, crop rows, snow | 3–4 d: **the key one**, it's on most materials. TSL: `colorNode` + `normalNode` with `dFdx` → `dFdx()` / `fwidth()` nodes |
| shared | `engine/render.js snowy()` | onBeforeCompile | snow on up-facing normals | ½ d |
| shared | `engine/render.js initRender` | EffectComposer + UnrealBloom + OutputPass | post chain | 1 d → `PostProcessing(pass(scene,camera)).bloom()` |
| Interceptor | `ground.js groundMaterial` | onBeforeCompile (~60 lines GLSL on top of `detail`) | field layout from a data texture, crop rows, tramlines, tracks, verges, snow, box-filtered by footprint | 4–6 d (branchy; the `if(ty==…)` chain becomes `If()` / `select()`) |
| Interceptor | `buildings.js winLights` | onBeforeCompile | night window lights, instanced variant | 1 d |
| Interceptor | `interceptor.js sens` | ShaderPass | FPV sensor: grain, thermal, link-loss snow, rolling band, vignette, auto exposure | 1–2 d |
| Interceptor | `interceptor.js psys` (FX 3000, SMK 2500) | PointsMaterial + size | fire and smoke sprites, CPU-updated | 1–2 d (→ sprites; compute optional) |
| Interceptor | `zfx.js` shockwaves | ShaderMaterial, instanced, logdepth chunks | ring and dust-ring billboards | 1 d |
| Interceptor | `zfx.js` glow points, `zenemy.js` flashes | ShaderMaterial Points, `gl_PointSize` in px | far-visible embers and flashes | 1 d each (pixel-sized sprites need a `sizeAttenuation:false`-style node) |
| Interceptor | `zfx.js` smoke (3,400) | ShaderMaterial Points, fog chunks, rotation | smoke columns and bursts | 2 d (**prototype target**) |
| Interceptor | `zwx.js`, `zdef.js`, `zswarm.js`, `zenemy.js` points | PointsMaterial | rain, snow, tracers, glints | ½ d each |
| Interceptor | `Sky` (addon), PMREM env | addon ShaderMaterial | sky and environment | ½ d (`SkyMesh`) |
| Drone League | `src/render/effects.js` (5 ShaderMaterials: trails, flames, decals add / mul) | instanced quads | boost trails, flames, scorch decals | 4–5 d |
| Drone League | `src/render/goalfx.js` (ring, shell, sparks) | ShaderMaterial | goal explosion | 2–3 d |
| Drone League | `src/render/ball.js` (2), `cos-mat.js`, `drone-mesh.js`, `world/buildings.js`, `world/outdoor.js` (2) | onBeforeCompile | ball surface, cosmetics, carbon, building / outdoor detail | 5–7 d |
| Drone League | `src/render/renderer.js` composer + custom bright-pass + SMAA + `LineMaterial` lines | post / lines | quality tiers | 2–3 d (`Line2NodeMaterial` exists) |

**Total:** ≈ 30–40 dev-days for both games, plus re-tuning the look and the tests. Drone League also needs Rapier's
debug and replay paths re-checked. That makes it a 4–7 week project with no measured smoothness gain on this machine: the frame is CPU-bound in
three's scene walk and the HUD, and WebGPURenderer's per-object CPU cost is not lower (TSL node building and pipeline caching
at first sight of every material, a fresh shader warm-up story). **What it would buy:**

- compute particles (tens of thousands of smoke and rain particles at no CPU cost);
- GPU-driven culling later;
- a modern post stack (GTAO, TRAA, SSR) maintained upstream.

### Prototype: the Zombies smoke on TSL compute (measured)

`proto/webgpu/smoke.html` + `node proto/webgpu/run-smoke.mjs` (three r186.1 installed in `proto/webgpu/` only). It's one scene: a ground plane,
fog, and 40 smoke columns with the same particle maths as `zfx.js`: respawn, wind drag, buoyancy decay, growth, fade and spin. It runs three ways:

- **gl160**: today's approach. Three r160 `WebGLRenderer`, a JS loop over every particle each frame, a full `bufferSubData` upload, `Points` +
  `ShaderMaterial` with `gl_PointSize`.
- **gpu**: three r186 `WebGPURenderer` on WebGPU. A TSL compute kernel updates `instancedArray` storage buffers on the GPU (respawn by `hash`),
  and an instanced `SpriteNodeMaterial` (`Sprite.count = N`) reads them with `toAttribute()`. No per-particle JS at all.
- **gpugl**: the same TSL code on `WebGPURenderer({forceWebGL:true})`, the WebGL 2 fallback.

Results: headless Edge on the RTX, 1920×1080, the median of ~600 frames after warm-up. "GPU" is timer / timestamp queries; "JS" is step + draw submit.

| Particles | gl160 JS | gl160 GPU | gpu JS | gpu GPU | gpugl JS | gpugl GPU |
|---|---|---|---|---|---|---|
| 3,400 (today's smoke pool) | 0.20 | 2.26 | 0.40 | 1.97 | 0.30 | 2.40 |
| 50,000 | 1.0 (p95 2.2) | 6.05 | 0.40 | 6.00 | 0.30 | 5.95 |
| 200,000 | 5.7 (p95 17.5) | 6.97* | 0.60 | 12.4 | 0.60 | 12.3 |

\* r160 clamps `gl_PointSize` to 420 px, so it draws less fill at 200k than the unclamped sprites. The GPU columns aren't equal work at that size.

What the prototype shows:

1. **At the game's current particle counts, compute particles buy nothing measurable.** The JS loop over 3,400 smoke slots costs ~0.2 ms, and
   WebGPU's own per-frame overhead is about the same. GPU time is set by blending fill, which no API changes.
2. **They pay off for 10×–60× more particles** (dense storms, battlefield smoke, debris): −0.6 ms JS at 50k, −5 to −17 ms at 200k. Even then it
   needs **r186's WebGPURenderer, not WebGPU itself**: the WebGL 2 fallback ran the same TSL compute (transform feedback) with the same CPU win.
3. **The look doesn't port 1:1.** The same constant colour came out visibly lighter in TSL (node materials treat `colorNode` as linear and convert
   it to sRGB; the r160 `ShaderMaterial` wrote it raw). The pixel-size clamp (3–420 px) and `gl_PointCoord` rotation had to become a world-size
   sprite with `rotationNode`. Every effect needs a side-by-side screenshot pass.
4. **Porting cost** for this one effect: ~70 lines and half a day, including learning TSL's typing (`mod(float(i), E)`, not `uint`).
   The first frame compiles pipelines: JS p95 is higher for the first ~30 frames, the same warm-up story as WebGL.

Not measured: whole-game CPU cost under WebGPURenderer (that would need the full port). That is the number that decides smoothness, and it's the
reason this route stays parked. Headless WebGPU frames are not paced by the GPU (rAF runs ahead), so only GPU timestamps are trustworthy here;
a "wait for the GPU each frame" measurement was dominated by GPU clock ramp-down between frames and is not reported.

## Recommended sequence (next 1–2 weeks)

1. **Today (5 min):** open `edge://gpu` in the browser you play in. If GL_RENDERER says Intel, set Edge to High performance in Windows' Graphics
   settings and restart Edge. Re-try Zombies before judging anything else.
2. **This week, in flight:** sim-smooth (fixed step + interpolation), perf-quickwins (FPS meter, graphics setting, warm-up, LOD), perf-hotpaths.
   Hand them §1's hot-spot list:
   - font caching;
   - the radar as a cached layer at 30 Hz;
   - `matrixAutoUpdate` on statics;
   - the per-frame `getParameters`;
   - `money()`.
3. **Then (½ day):** a frame-rate cap option (Auto = the highest divisor of the refresh rate the machine holds; 60 / 120 / uncapped), and the launcher
   change (route 0, option 2) with a localStorage carry-over or a hint.
4. **Then (½ day):** composer AA (MSAA ×4 on High, SMAA on Med) for the Interceptor, reusing Drone League's `QUAL` pattern. Plus the bloom soft-knee.
5. **Week 2:** forest LOD and impostors (with perf-quickwins' distance LOD), then height fog, then CSM (3 cascades, low-LOD casters), then GTAO on High.
   Measure each with `proto/frame-profile.mjs --gpu nvidia` (A/B) and the look-shots.
6. **Park:** the WebGPU port, the wrapper, workers, WASM and native ports. Re-open WebGPU when a feature needs GPU compute, or when three's r160 → r18x upgrade
   (route 6) is done anyway.
