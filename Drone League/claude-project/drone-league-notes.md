# Drone League: how the game is built

## Source layout (v16+, branch `modular-rewrite`)
The game is now a Vite project at the repo root. Source is plain ES modules in `src/`; the build inlines everything into one HTML file. `Drone League/drone-league.html` is the frozen v15 single file (kept byte-identical as a reference). The sections and mechanics below still describe the code; the names are unchanged, only the file they live in moved.
- **Build:** `npm ci`, then `npm run build` → `dist/index.html` (all JS + CSS inlined, vite-plugin-singlefile). `tools/postbuild.mjs` copies it to `Drone League/standalone/index.html` (what the .bat opens) and writes `dist/drone-league.artifact.html` (no doctype/html/head/body, for a claude.ai artifact). `npm run dev` serves it live. Three.js 0.160.0 comes from npm; PeerJS 1.5.4 is still loaded from jsDelivr on demand; the fonts link is in `index.html`, the CSS in `src/styles.css`.
- **Test:** `npm run smoke` (`tools/smoke.mjs`) drives headless Edge: menu demo, League vs bots, Dogfight, mod panel, rates panel/CLI, sensitivity setup, a v15 localStorage save, and the artifact form; fails on any console/page error. It also runs the frozen v15 file as a baseline and compares (needs internet for its jsDelivr three.js; `--no-baseline` skips it, `--swiftshader` forces software WebGL). `window.__dl.snap()` is a read-only hook for it.
- **Shared state:** ES modules can't reassign another module's `let`, so:
  - `GS` (`src/state.js`) holds every v15 global that several modules reassign: `drones player state stT score clock overtime endPending demo paused menuOpen timeScale shake stepN lastCount camMode koN goalSide net room myPeer hostTune GM OBSON`. Write `GS.player`, never a copy.
  - Physics tunables (`G THR TE VP MAXV TAU HBP HBR BBX DI HOV BR BB TB …`) are live `export let`s in `config/tune.js`; only `applyTune()` assigns them. Modules that cache something derived from them register `onTune(fn)` (bloom strength in `world/maps.js`, ball/ring scale in `render/ball.js`, drone mesh scale in `render/drone-mesh.js`).
  - `S` (settings) is a live `export let` in `config/settings.js`; mutate `S.x` and call `save()`. Other single-writer live bindings: `floorM` (arena), `mapId`/`lookBK` (maps), `AC` (audio), `ballTick` (render/ball), `padX`/`padBlocked`/`mouseFire` (input), `calib` (input/calibration).
  - `src/scratch.js` holds the scratch vectors that v15 shared between sections (`_v _w _u _q _t _a _b _f _x _z _ip _lat _gq …`); they stay shared so the maths is identical.
  - Rollup refuses to build if a module assigns to an imported binding, so a missed one is a build error, not a silent bug.
- **Boot:** `main.js` imports every module in v15's section order (so the scene is built in the same order), then calls the init functions in v15's order (`initMenu`, `initCalib`, `initModPanel`, `renderPresets/applyTune/syncMod/setMap/setBall`, `initRates`, `initSens`, `syncRates`, `setGame`, `startDemo`, the frame loop, `connectRoom`). Module top levels only declare things and build Three.js objects; DOM wiring is in the `init*` functions.
- **Where each v15 section lives now:**
  | v15 section | file(s) |
  |---|---|
  | `$ V3 QT cl`, world constants, `COL CSS TEAM UP DIFF` | `config/constants.js` |
  | tunables `let G=…` + `applyTune()` (from the mod panel) | `config/tune.js` |
  | `DEF`, `S`, `save`, all migrations (cal/xcal/map/ball/game, `physV` 2 and 3, presets, `rprof`) | `config/settings.js` |
  | `MODS MDEF PRESETS cleanMod` (34 physics sliders) | `config/mods.js` |
  | `RTYPES defRates` | `config/ratetypes.js` |
  | rates maths `RT rate thrCurve stk` | `flight/rates.js` |
  | renderer, scene, camera, bloom, lights, `tex glow scaleUV` | `render/renderer.js` |
  | arena (`contour band prof RIM RIML goalG neonG …`) + `pitchLines` | `world/arena.js` |
  | `hash2 sm vnoise fbm` | `world/noise.js` |
  | maps (`OUT LOOKS buildOutdoor setMap snowP skyTex`) | `world/maps.js` |
  | particles (`emit updParts dot`) | `render/particles.js` |
  | audio (`audioInit audioTick noise tone near`) | `audio/audio.js` |
  | physics: `pl sdArena sdGoal sdf sdN arena`, plus `los` | `physics/sdf.js` |
  | `ball ballPhys ballBox` | `physics/ball.js` |
  | `ballMesh ballLight ring BALLS SOC BSTY setBall` | `render/ball.js` |
  | boost orbs `ORBS` | `world/orbs.js` |
  | drone `GEO MAT markTex TN`, mesh building (`buildDrone`, was `Drone.build`) | `render/drone-mesh.js` |
  | `Drone` (`step pivot ground spawn flipUp`), `NAMES SLOTS rightUp wrapA` | `flight/drone.js` |
  | `attitude()` | `flight/attitude.js` |
  | human input (`pad axv CAL humanControl RADIO PAIR BTN`), `flipIn`, key/mouse events, `padEdges cycleCam togglePause` | `input/input.js` |
  | calibration (`calib calTick`) | `input/calibration.js` |
  | League bots (`predict intercept think botControl assignRoles`) | `bots/league.js` |
  | Highlands (`dfH OBS OGRID sdObs sdDF DSLOTS DFC LOOKS.df buildDF dfG`) | `world/highlands.js` |
  | turrets, `DORB`, damage/kills/scoring, `fireIn aimOk setGame dfState nearestFoe` | `modes/dogfight.js` |
  | bullets/tracers (`BUL shoot droneFire bullets dfDraw gunDir BSPD`) | `modes/guns.js` |
  | `dfBot` | `bots/dogfight.js` |
  | game state globals → `GS`; `isBot auth SB esc nick` | `state.js` |
  | match flow (`applySlots buildTeams kickoff goal endMatch demolish startMatch startDemo showMenu`) | `modes/match.js` |
  | `step()` | `modes/step.js` |
  | online play (`netSync netSend enterGame leaveGame onHostState …`) + `connectRoom` (was the room IIFE) | `net/net.js` |
  | PeerJS stand-in `p2pRoom p2p` | `net/p2p.js` |
  | camera (`updateCam setFov`, `bfov`) | `render/camera.js` |
  | HUD (`hud radar`), `banner feed tag` | `ui/hud.js` |
  | `visuals()` | `render/visuals.js` |
  | menu/settings (`FIELDS syncUI menuPad renderGames pickGame`, copy-settings button) | `ui/menu.js` |
  | mod panel UI (`syncMod modChanged renderPresets toggleMod`) | `ui/modpanel.js` |
  | Rates panel + CLI (`syncRates cliText tab drawRates`) | `ui/rates.js` |
  | easy sensitivity setup | `ui/sens.js` |
  | main loop `frame()`, boot | `main.js` |
- `parts/` and `tuner/` are reserved for Phase 2 (see `docs/PLAN.md`).

## Files (v15)
- `drone-league.html` is the game. On claude.ai it is published as an artifact page, without `<!doctype>`/`<html>`/`<head>` tags, because the artifact adds them.
- `standalone/index.html` is the same file wrapped in a full HTML document so it can run on its own. Rebuild it after every change to `drone-league.html`: add `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>` before it and `</body></html>` after it.
- `Play Drone League.bat` opens `standalone/index.html` in a Microsoft Edge app window.

## Code layout (sections marked with `// ---------- name ----------`)
1. **Constants and settings.** Arena size (W 220 × L 280 × H 64 m, Rocket League proportions relative to the ball; goals 46 × 18 × 14 m; corner radius RC 32, ramp radius RF 10). Spawns, orbs, floor markings (`pitchLines()`) and cameras are written relative to these. `DEF` holds the default settings, saved in the browser under the key `droneleague`.
2. **Rates.** `rate(axis, x)` implements Betaflight's rate formulas for BETAFLIGHT, ACTUAL, QUICK, KISS and RACEFLIGHT, returning rad/s; axis 0 is roll, 1 pitch, 2 yaw. `thrCurve()` applies throttle mid, expo and limit. There are three rate profiles in `S.rprof`, and `S.rpi` is the active one.
3. **Renderer.** Three.js with an UnrealBloom glow pass and ACES tone mapping.
4. **Arena.** `contour()` traces the rounded floor plan and `band()` builds the curved ramp and glass walls from the profile in `prof`. The goal mouths are cut out. The stadium crowd, light towers and stars come after that, in `neonG`.
4b. **Maps.** `OUT` holds the outdoor recipes (Meadow, Canyon, Alpine: sky, sun, turf, terrain, props); `LOOKS` holds per-map lighting, fog, shadow frustum and bloom. `buildOutdoor()` builds a map on first use into `mapG[id]`; `setMap()` swaps the floor, ramp, wall, goal-mouth and goal-floor materials and toggles `neonG` / the map groups / `snowP`. Maps are visual only and share the arena collision shape. The map choice is local, not synced online.
5. **Physics.** The arena collision shape is a signed distance function, `sdf()`. It is the rounded arena combined with the goal boxes, which extend into the field so the mouth stays open. `arena()` resolves sphere collisions with bounce and friction. `ballPhys()` moves the ball. Drone-ball touches use the drone's box (`BBX`, `ballBox()`), restitution `TB` (Touch bounce) at low speed rising to 0.6 at 36 m/s, a Rocket League-style extra push along drone→ball leaning toward the flight direction, and a little grip on soft touches for dribbling.
5b. **Ball styles.** `BSTY` builds Classic, Soccer (truncated-icosahedron shader), Plasma and Beach looks; `setBall()` swaps them. Visual only.
6. **Drones.** `Drone.step()` is the acro flight model. Sticks set target body rates and the drone eases toward them over `TAU`. LiftOff-style touches: motor spool (`SPOOL`), thrust falling off with axial inflow, body-axis drag (prop disc ~2x the frontal area), prop wash wobble when descending into it, and a soft speed cap. Ground contact is a rounded box (`HBP`: 16 spheres of radius `HBR` along a rounded-rectangle outline, 0.34 m corner radius, built in `applyTune()`; `ground()`) with shared impulses and lever arms and low sliding friction (`GF`, Ground grip); while touching with too little lift, `pivot()` levers the frame over its lowest edge at `TURT` (turtle mode without a switch). Boost: the top `BZ` (5%) of the throttle stick, or Shift/Space, is super boost (`BOOST` 140 m/s² on top with no spool or inflow loss, a `BKICK` 8 m/s kick when it lights, 1.5x speed cap, +14° FOV stretch via `bfov`) burning `DRAIN`/s; the rest of the stick maps to 0–100% motor. `ORBS` (8 big, 26 small) refill the meter.
7. **Attitude controller.** `attitude()` turns a target up/forward direction into body rates. Bots and Angle mode use it.
8. **Input.** Gamepad or radio through the browser's Gamepad API. `S.cal` stores the calibrated axis, centre and signed range for throttle, yaw, pitch and roll, and keyboard input is mixed in.
9. **Bots.** `predict()` simulates the ball 4 s ahead and `intercept()` finds the earliest point a bot can reach. `think()` handles attack, keep, mid and boost roles (attack lines up behind the ball, then commits to a strike with hysteresis, `ai.strike`), `assignRoles()` reassigns them every ~0.4 s, and `botControl()` is a cascaded controller (position error → velocity command capped at `DIFF[].vmax` → acceleration; pure pursuit at the contact point while striking) feeding `attitude()`. `DIFF` holds the four skill levels.
10. **Game state.** Kickoff, play, goal and end states, slots, demolitions and the boost orbs.
11. **Online play.** The host simulates the ball, score and bots. Each pilot flies their own drone locally and sends position, attitude and velocity about 30 times a second, plus a sequence-numbered ball-hit message the host acknowledges. On claude.ai this runs over the artifact `room` channel. Outside claude.ai, `p2pRoom()` provides the same calls over PeerJS/WebRTC, with the host relaying to everyone. Slot keys are `h` for the host, `bTI` for bots and a peer label for each human.
12. **Mod panel.** The Rates tab works like Betaflight Configurator, including CLI import and export. The Physics tab has 25 sliders defined in `MODS`, with presets and export/import. In online games the host's physics settings apply to everyone.
12b. **Dogfight mode.** `S.game` ('league' | 'df') picks the mode from the two buttons at the top of the menu; `setGame()` switches `GM`/`OBSON`, swaps to the Highlands map (`setMap('df')`, `buildDF()` builds its meshes on first use into `dfG`), hides `goalG`, the arena and the ball, and moves the orbs to `o.dp`. Highlands: 1100 x 1400 m (`DW`, `DLEN`), ceiling `DCEIL` 260, terrain `dfH(x,z)` (fbm hills, river canyon along `cxR(z)` at y -40, mountain walls at the edges, flat team bases at z = ±`DBASE`), all point-symmetric. `OBS` holds mesas and spire fields (cyl), hangars open at both ends (hang), towers and canyon bridges (box), rock arches (ring), boulders and ~480 trees, seeded and mirrored; `OGRID` is a 40 m spatial hash, so `sdObs` is exact only within 10 m. `sdDF` = max(ceiling, walls, terrain, -obstacles) replaces `sdf` in Dogfight. `los()` sphere-traces line of sight: turrets (6 per team, 200 m) and bots only shoot what they can see. Guns fire along the FPV camera axis (`gunDir`; bots use 30°): 12 rounds/s, 320 m/s plus the shooter's velocity, 8 damage, hit radius 1.6 m, 100 HP, 3 s respawn at the base (`DSLOTS`). A kill or a turret is 1 point. `dfBot()` scores targets by distance, facing and visibility, cruises at 60 m/s when far, holds ~40 m, avoids terrain with two look-ahead probes, and in range tips the quad so the uptilted camera points at the lead. Fire input: F, left mouse, `S.fireBtn`, and `S.afire` auto-fire. Online: the host owns HP, deaths (`g.lf`), turrets (`g.tg`) and the kill feed (`g.kf`); joiners report their own hits as `P.hs`, and send `P.f`/`P.ti`. `g.m` carries the mode.
12d. **Dogfight visuals and bot feel.** Tracers are instanced additive streaks (`BSTR`, width ~0.5% of camera distance) plus thin lines. Enemy drones draw 1.6x larger in Dogfight and every drone's bullet hit radius is 2 m. `RIML` holds the arena rim lines, hidden in Highlands. `dfBot` flies nose-first (heading follows the thrust tilt, yaws to the target only near level), smooths sticks and throttle like a pilot (`ai.ps`, ~60–110 ms), and aims with a wandering error that grows with range (`ai.nz`).
12e. **Guns, fire input, snow.** Twin muzzles under the frame (body offset ±0.4, -0.55, -0.3), alternating, converging on the camera axis 150 m out; tracer tails are clamped to distance flown (`b.dist`) and your own rounds fade in over the first 30 m. `S.fireInv` inverts the Fire button/switch. Alpine snow (`snowP`) is in world space and wraps in a 160 m box around the camera.
12c. **Super boost toggle.** `S.sboost` (default off). `SB()` is the live value (the host's `g.sb` for joiners). Off: the whole throttle stick is 0–100% motor, Shift/Space do nothing, bots never boost, the boost bar and orbs are hidden.

## Gotchas
- The page relies on the CSS rule `[hidden]{display:none!important}`. Keep it.
- Anything received from other players is untrusted. Validate the numbers and set names with `textContent`.
- After editing, check that the script parses, for example by extracting the module script and running `node --check`. (v16+: `npm run build && npm run smoke`.)
- Bot slot keys are `b` + team + index; `isBot` must be `/^b[01]\d$/` (an earlier copy had lost the backslash, so bots mirrored the player's sticks).

## 12f. 6S 5-inch flight model, taller Highlands, motor audio (v11)
- World is ~3.5x real scale (G 34.5 = 9.81 x 3.5). OSD km/h and ALT now show real-scale values (divided by G/9.81).
- Thrust = THR * ms^TE (thrust curve, new `te` slider, default 1.6) times prop inflow `cl(1-va/VP,0,1.15)` (new `vp` "Prop pitch speed", default 240). HOV = (G/THR)^(1/TE) ~ 24%.
- New defaults: thr 345 (10:1 T/W, slider max 600), maxv 200 (max 300), dl .04, dq .0039, spool 20. Sim: ~24 m real climb in 1 s punch, ~150 km/h level, flat-fall terminal ~19 m/s real.
- Migration: `S.physV<2` moves untouched old defaults (thr 124, maxv 111, dl .14, dq .0065, spool 30) to the new ones.
- Bots: throttle = (need/THR)^(1/TE); accel cap uses BTHR = min(THR, 160*G/34.5) so they don't get 10:1 punch.
- BSPD 320 -> 400. Highlands: DCEIL 520, hills x1.5, edge walls 430, mesas 90-330 m tall, spires 55-180, towers taller.
- Audio: 4 motor voices at blade-pass freq (shaft Hz x3) with per-motor detune and Betaflight quad-X mixer split from angular accel; motor whine (x7 pole pairs); prop hiss; wind by speed; prop-wash flutter; nearest other quad with distance, Doppler and stereo pan. `audioTick(dt)` in visuals.
- v12: softer bumps. Ground impulse factor 1.6 -> 1.15, impact spin x.45, friction torque .3 -> .2 (spin off a bump about half), impact sound lower/quieter (280 Hz, max .25, hit>10). Wall bounce setting untouched.
- v13: Xbox/standard gamepads get their own profile `S.xcal` + `S.xfire` (radio `S.cal`/`fireBtn` untouched); `padX` set in pad(). Channel source a>=100 = button/trigger (value 0..1), `b` = paired button for the other direction (PAIR LB/RB, LT/RT). Calibration watches buttons too; on Xbox a stick-axis throttle stays spring (centre = hover, m:'spring'), trigger/bumper throttle is full range. Fire moves to A/RT/X if calibration takes it. Shortcut buttons skip ones used for flight. Default Xbox: Mode 2 sticks, fire RT.
- v13: `S.bots` (Bots: Fill empty spots / No bots) for solo and hosting; clients accept a team with zero drones.
- v14: Riley's mode baked into MDEF: dbounce .05, wash 1.4, boost 60, bgrav 19.5 (physV 3 migrates untouched old values).
- v15: pad() picks the most recently used gamepad (timestamp). Menu shows live button pills (#btns, Xbox names, analog fill). Xbox throttle axis resting at an end (trigger reported as axis) is full range, centred stick stays spring. Calibration hold-still tolerance .12 on gamepads.
- v15: flip-over: on the ground, slow and up.y<.55 with throttle >30% or any stick -> `flipT` rights it (rightUp keeps heading). Flip button: E key, Xbox B (`S.xflip`), radio/other `S.flipBtn` (default none, mappable to a switch). Angle mode keeps an integrated heading `d.hd` (reset on spawn or >1.2 rad drift).
- v15: "Easy sensitivity setup" walkthrough (#sens): spin speed, centre feel, yaw speed, live try-it bars; saves Actual rates into the current rate profile. Betaflight rates panel unchanged.
- v16: inverted pendulum: on the ground with up.y<.9 the drone levers over its lowest edge via pivot() with a growing rate this.pw (PEND 14 rad/s², x1.6 with throttle, max 9 rad/s; deep contact allowed). Replaced the instant auto-flip on stick/throttle; flip button (E / Xbox B) unchanged.
- v17: ground slide: friction impulse uses min(j, G*.05/c) so thrust shoving into the ground doesn't add grip (Ground grip setting still scales it). Pendulum self-righting only when thrust < G or ground-plane speed < 3 m/s, so throttling against the ground slides.
- Track C: **Choose your controls + Calibration Lab.**
  - `input/binding.js` (pure) detects which control moved: per-step baseline, channels moving at rest ignored, 30% of travel held 250 ms, stored on release. Triggers as analog buttons, as axes resting at -1, as axes that read 0 until first pressed (rest re-learnt on release; `r` in the cal entry is used until the axis first reports), or both (button wins). `input/calibration.js` is the wizard (`#bind`, opened by `#calbtn` and from the Lab intro): throttle, yaw, pitch, roll (one-way controls ask for the other direction: `b` button or `nb` any channel), fire, flip, boost (if Super boost). Fire/flip/boost bindings: button index, `'aN'` (axis > .5) or `'aN-'` (< -.5); `btnOn()` reads all forms. Gamepad shortcuts skip any bound button.
  - New settings: `assist` (0..1, menu "Flight assist": stick smoothing up to 70 ms + Horizon-style self-level that fades with stick), optional `dzy` (yaw deadband, falls back to `dz`), `xboost`/`boostBtn`. CLI export adds `deadband`/`yaw_deadband` (×500) and imports them.
  - Lab: `modes/lab.js` (enter/exit, rigs, save/revert; `step()` hands over while `LAB.on`), `tuner/drills.js` (7 drills, plain data), `tuner/metrics.js` + `tuner/tuner.js` (pure; `npm test`), `tuner/presets.js` (Default/Pro targets and bounds), `tuner/rshape.js` (any rates type ↔ centre/max/expo), `tuner/room.js` (the box at the arena centre), `ui/lab.js`. While the Lab runs, the working tune lives in `RO.r` (flight/rates.js) and `OV` (input.js) and is only written to `S` on Save.
- v19: pendulum reworked: only when resting (ground-plane speed < 3 m/s, plus the pivot's own swing speed once tipping) on a floor or wall (contact normal `this.cn` from ground(), cn.y > -.3, never the ceiling). Rate pw ramps from 0 by PEND*(sin lean + .15*(1-up.y)) per s (x1.5 with throttle), max 8; pivot only once pw > .15. Sliding upside down just slides and slows.
- v19: Rocket League ball: bgrav 34.5 (= drone gravity, as in RL), bbounce .6, bmax 160, bmass .2. Hits use RL's extra-impulse curve (0.65 of relative speed up to 5u, down to .55 at 23u, .30 at 46u; u = BR/.93) along the centre line, flattened vertically x.35 and with 35% of the drone's forward axis removed. Ball leaves at ~0.9x a 5 m/s hit, ~1.65x a 60 m/s hit.
- v19: drone size default .75 -> 2 (about 2/3 the ball's diameter, the RL car:ball ratio). Size only scales hull/HBP, ball box BBX, inertia DI, DRAD and the mesh; flight forces untouched. FPV cam offset scales with DRAD/.6, chase cam backs off by 1+.35*(DRAD/.6-1). physV 4 migrates untouched old ball/size defaults.
- v20: arena sizes ARENAS [name,W,L,ceiling]: Classic 220x280x90, Big 280x360x100 (default, S.arena 1), Huge 340x440x115, Massive 420x540x130. W/L/H are consts read at load (AI), so changing "Arena size" reloads the page. Host sends `ar` in host state; a client with a different size stores sessionStorage dlArenaNet + dlRejoin, leaves the room, reloads and auto-joins. Light towers H+6 tall.
- v20: pendulum only starts fully upside down (up.y<-.6) on the floor (cn.y>.6) at rest (<3 m/s); latched (this.pr) until up.y>.93. Rate eases toward PEND(3.6)*(.5+.5*smooth((1-up.y)/2)) with a .35 s lag (x1.3 with throttle). On its side or a wall it no longer self-rights (flip button / sticks do).
- v20: goal slow-mo steps physics every frame with dt*timeScale (sub-steps <= DT) instead of the fixed-step accumulator, eases back to 1x from 2.4 s; goal camera shake removed.
- v20.1: kickoff() resets timeScale=1 (starting a match during the menu demo's goal slow-mo used to leave the match at 0.3x).
- **Game modes (registry):** each mode registers itself with `registerMode(id,{name,title,sub,world,order})` from its own file in `src/modes/` (`league.js`, `dogfight.js`). The menu mode buttons, the saved `S.game` check, the online lobby label and `setGame()` read `MODES`; unknown ids fall back to League. To add a mode: a new file in `src/modes/` that registers it, plus one import in `main.js`. A mode needing a new kind of world adds a `world` id and handles it in `setGame()`/`setMap()`.
