# One shared engine: audit, first steps, migration plan

The repo holds two codebases that grew up side by side:

- **Jared's game, `src/`.** A Vite build: League, Dogfight, Freeplay, Training, the Calibration Lab. Rapier physics, drone parts.
- **Riley's games, `engine/` + `games/`.** Raw ES modules served as they are (no build). `games/interceptor` is the Interceptor
  (Zombies; its original Classic mode was removed). `games/league` was Riley's League and Dogfight; it was retired on 2026-10-19 (section 0).

`engine/flight.js` began as a port of an older League flight model. The rule was "when League's flight model changes, port the
changed lines" (`interceptor/interceptor-notes.md`), so every fix had to be made twice. The plan the user approved is one shared
engine and many games. This document records the audit, the first steps already taken (a shared flight core and shared stick
code), how they were proven not to change any game's feel, and the steps that remain.

## 0. Update 2026-10-19: one League

The user's decision: Jared's game is **the** Drone League (League, Dogfight, Freeplay, Training). Riley's duplicate League and
Dogfight, `games/league`, was deleted; it is in git history (the last commit with it is the merge of PR #58, `b58ac85`).

- **Paths.** The build output moved from `games/jared-league/` to `games/drone-league/` (`tools/postbuild.mjs`, `serve.ps1`, both
  `Play Drone League.bat`, `tools/check-build.mjs`, `tools/ci-scope.mjs`). `games/jared-league/index.html` is now a tiny redirect,
  so old links and bookmarks still work (an online join code in the `#hash` is kept). The root `index.html` launcher has two cards:
  Drone League and the Interceptor (Zombies). The Interceptor's "Back to Drone League" opens `../drone-league/`.
- **`engine/` code only Riley's League used was removed** (nothing else imported it; the Interceptor, Zombies and every tool and
  test were checked):
  - `engine/flight.js`: the League `Quad` (SDF ground contact, turtle pivots, self-righting, flip-over), its `humanControl`,
    `tuneFlight`, `setWorld`, `sdN`, the unused `setGroundFeel`, and the tune `let`s. What is left is what the Interceptor
    imports: `attitude` (from the core), `gn`, `ou`, `weathervane`.
  - `engine/audio.js`: `quadVoice` and `audioInit`'s `voice` option (the nearest-other-quad voice). The default `motor.phys` is
    now the constants `[15, 1.6, 240]` instead of `flight.js`'s tune; the Interceptor passes its own `phys`, as before.
  - `engine/input.js` `flipIn`; `engine/rates.js` `initSens` (the Easy sensitivity walkthrough) and its CSS in `engine.css`;
    `engine/menu.js` `PILOT_FIELDS`; `engine/modpanel.js` `setHostTune`; `engine/hud.js` `edgeArrow`, `fmt`;
    `engine/render.js` `scaleUV`, `skyTex`, `fpvCam`.
  - The goldens for those went too: "Riley's League quad" in `test/flight-golden.test.mjs` and "Riley's humanControl" in
    `test/input-golden.test.mjs` (and their keys in the fixtures). The rates, throttle-curve and attitude goldens for
    `engine/` stay, because the Interceptor uses them; every other golden is unchanged, bit for bit.
- **The pilot-profile button strings** (section 6) are fixed. Drone League's form is the main one: a button index, `-1`, `'aN'`
  (axis N above +0.5) or `'aN-'` (below −0.5). `engine/settings.js` `save()` writes that form into `droneleague` (`'-aN'` and a
  learned `'aN<m'` become `'aN-'`, a learned `'aN>m'` becomes `'aN'`) and keeps the exact binding in the game's own key;
  `loadSettings` uses the exact one while the shared value is still its reduction, so a learned threshold survives, and otherwise
  takes the shared value (rebound in Drone League). `engine/input.js` `swOn` / `swName` also read `'aN-'`. Drone League is
  unchanged. `test/pilot-profile.test.mjs` covers it, including that every Drone League value means the same to `swOn` as to
  Drone League's `btnOn`.
- The tables and plan below are kept as the record of the audit. Where they name `games/league` or Riley's `Quad`, that code is
  gone; plan step 9 is resolved.

## 1. Who uses what

| Module | What it is | Used by |
| --- | --- | --- |
| `src/flight/core.js` **(new, shared)** | rates maths, rates types, throttle curve, attitude controller, flip-over levelling, air-model blocks, `quadAir` | `src/flight/drone.js`, `rates.js`, `attitude.js`, `src/config/ratetypes.js`, `src/input/sticks.js`, `engine/flight.js`, `engine/rates.js`, `games/interceptor/interceptor.js` |
| `src/input/sticks.js` **(new, shared)** | controller detection, stick-to-command maths | `src/input/input.js`, `engine/input.js`, `engine/flight.js` |
| `src/ui/fpsmeter.js` **(shared)** | FPS meter (top right, 4 updates a second) and the one rAF frame sampler (`onFrame`) | `src/render/renderer.js`, `engine/gfx.js`, `games/interceptor/igfx.js` |
| `src/render/dynres.js` **(shared)** | dynamic resolution controller (pure logic: frame times in, render scale out) | `src/render/renderer.js` (League Auto), `engine/gfx.js` (Interceptor Auto) |
| `engine/gfx.js`, `engine/warm.js` | Interceptor Graphics quality (levels, factors, `gfx.on`, Auto governor) and the shader warm-up (`warm(x)`) | `games/interceptor/*` |
| `src/flight/drone.js` | Jared's `Drone`: parts, pops, turtle, self-righting, flip-over; Rapier integrates it | `src/` (step, world, modes, input, bots via `GS.drones`) |
| `src/flight/rates.js`, `attitude.js` | the profile in use (`RO` Lab override) over the core; re-export | `src/input`, `src/ui`, `src/modes`, `src/tuner`, `src/bots` |
| `src/input/input.js`, `calibration.js`, `binding.js` | axes, deadband, assist, bindings, `humanControl`, guided binding | `src/` |
| `src/config/settings.js` (+ `schema.js`) | `S` from localStorage `droneleague`, schema and migrations | `src/` |
| `src/audio/audio.js`, `sfx.js` | motor synth, volume buses, event sounds | `src/` |
| `engine/flight.js` | the attitude controller (re-exported from the core) and rough air (`gn`, `ou`, `weathervane`); Riley's `Quad` and `humanControl` were removed with `games/league` | `games/interceptor` (attitude, `ou`, `weathervane`) |
| `engine/rates.js` | rate profile in use, Rates tab | `games/interceptor`, `engine/loop.js` |
| `engine/input.js` | axes, switches (Learn / Assign), calibration, controller panel | `games/interceptor`, `rates.js`, `loop.js`, `menu.js` |
| `engine/settings.js` | per-game key plus a **pilot profile shared through Jared's `droneleague` key** | every engine module, the Interceptor |
| `engine/audio.js` | the motor synth, parametrised per airframe (`motor: {rot, wind, phys}`) | `games/interceptor`, `zaudio.js` |
| `games/interceptor/interceptor.js` `Drone` | the tail-sitter dart: its own step, ground, `humanControl` | Zombies (`newDrone`) |

Three is a bare import (`'three'`) everywhere. Vite resolves it from `node_modules` for `src/`. The games' import map resolves it
to jsDelivr `three@0.160.0`, the same version. So a shared module can `import * as THREE from 'three'` and be loaded by both:
Riley's files import it as `../../src/flight/core.js`. `serve.ps1`, GitHub Pages and the test servers (`tools/zlib.mjs`) all
serve the whole repo, so `src/` is there for the games. The old single-file Interceptor in `interceptor/standalone` is not on
the core; it is a frozen copy.

## 2. Audit

### Flight model: three copies before this work

| | Jared's League (`src/flight/drone.js`) | Riley's League / Dogfight (`engine/flight.js` `Quad`, removed 2026-10-19) | Interceptor dart (`interceptor.js` `Drone`) |
| --- | --- | --- | --- |
| rates maths, throttle curve, rates types | same code | same code | same code (engine/rates.js) |
| attitude controller | same maths (on the shared `scratch.js` vectors) | same | uses engine's |
| prop wash, motor spool, thrust curve, prop inflow, gravity, top speed | same expressions, times parts multipliers | same | same expressions, on **airspeed** (wind and gusts) |
| body-axis drag | shape `.9, 1.8, .7` times parts `dq` | shape `.9, 1.8, .7` | shape `FS, 1, FS` (fins), on airspeed |
| super boost | same, times parts `boost`/`drain` | same (`onBoost` hook) | none; Zombies **Rocket Assist** along the body after gravity, raises top speed by `bmax` |
| rate loop | per-axis: rates capped at the airframe's `rmax`, angular acceleration at `acc` (on the ground, sliding > 4 m/s: as hard as the motors' spin allows); wheels: plain lerp | plain lerp toward the sticks | finite authority: the change is capped as a vector at 140 rad/s² × a throttle-dependent factor, plus turbulence and fin weathervaning (`aero`) |
| integration | Rapier turns `q` by `w` after the step; thrust and drag use the end-of-tick attitude | in the step, same maths | in the step |
| ground contact | Rapier colliders from the parts loadout | SDF spheres on a rounded-box hull, impulses (`GK 1.15, GS .45, GT .2`) | its own copy of the older solver (impulse ×1.6, spin ×1, friction torque .3) on fin and prop tips |
| turtle (sticks lever it over an edge) | rates cut only below 10 m/s | always on the ground | only once it has fallen over (fins hold it up) |
| self-righting pendulum | keeps rolling under power when the pivot loses the ground | stops when the pivot fails | none |
| flip-over (E) | after 0.2 s of ground contact, any speed | below 20 m/s | none |
| pops, ball, parts, wheels | yes | no | no |
| battery sag on thrust | no | no | yes (voltage², pack current, IR drop) |

**Why they diverged.** The dart is a different airframe: a tail-sitter that cruises nose-first on its fins, flies in wind, runs a
battery down, and has weak differential thrust near idle and full throttle. Jared's League gained parts (multipliers and caps from
the loadout), pops, Rapier contacts and two rounds of ground-handling fixes (turtle only when slow, pendulum carry-through, flip
after contact) that were never ported back. Riley's League kept the older triggers.

**Tune defaults** (mod panel): both Leagues share gravity 34.5, thrust 345, curve 1.6, prop pitch 240, top speed 200, stick lag 4 ms,
drag .04/.0039, size 2, spool 20 ms, turtle 260°/s, wash 1.4, boost 60/8/33. They differ in ground grip (Jared .7, Riley .1).
Jared's **stock parts are not neutral**: thrust ×0.90, spool ×1.18, drag ×0.985, boost ×0.93, drain ×1.12, rates capped at
1198/863/1198 °/s and angular acceleration at 320/126/320 rad/s². So the two Leagues already fly a little differently on the same
tune. The Interceptor's tune is its own (9.81 g, thrust 48, curve 1.4, 26 ms stick lag, fins 4).

### Rates

The maths (`rate`/`rateR`, `thrCurve`) and the rates types table (`RTYPES`, `defRates`) were identical. Jared adds `RO` (the Lab's
temporary profile) and the tuner. The Rates tab UI is still two copies (`src/ui/rates.js`; `engine/rates.js` `initRates`,
`drawRates`, `initSens`). Jared's CLI export and import also carry the deadband and assist.

### Input

- **Identical:** radio detection (`RADIO`, `isX`, `pad`), `PAIR`, `BTN`, `CAL`, `thrFull`, and in `humanControl` the throttle stick
  mapping, keyboard easing, stick-or-key pick, the Acro mapping and the whole Angle mode.
- **Diverged:**
  - Axis maths: Jared's `axv` adds a trigger rest value (`r`), an opposite-direction channel (`nb`), a separate yaw deadband (`dzy`),
    the Lab's overrides (`OV`), and counts a digital button that reports value 0 while pressed as pressed. Riley's counts it as 0.
  - `humanControl`: Jared adds assist smoothing, a boost button, pops on the flip button and the Lab's forced Acro. Riley's has the
    `sb` / `menu` options. The Interceptor has its own: fpv mix through the camera angle, an 88° Angle mode, keyboard arming.
  - Button and switch bindings: **two string formats for the same saved keys** (see section 6).
  - Calibration: Jared's guided binding (`input/binding.js`, `calibration.js`); Riley's older `calTick`, plus switch Learn/Assign.

### Settings

Jared: `config/settings.js` with a schema and migrations, replayed against 65 recorded saves. Riley: `engine/settings.js`, a key
per game (`dl-interceptor`, ...) plus a **pilot profile** (`mode, tilt, fov, thrMode, dz, cal, xcal, fireBtn, xfire, fireInv,
xflip, flipBtn, rprof, rpi`) that it reads from and writes into localStorage `droneleague`, Jared's own save. A radio calibrated
in one game is calibrated in all of them, and the rate profiles are shared. That is why identical rates maths matters. Nothing
validates the shared fields the same way on both sides.

### Audio

`engine/audio.js` is the parametrised version of Jared's motor synth: four motor voices with the quad-X mixer split, whine, prop and
wind hiss, the nearest other quad. `motor: {rot, wind, phys}` lets the dart's bigger, slower props share it. The motor maths
(`rotHz`, mixer, wash flutter) is the same on both sides with League defaults. Jared adds volume buses and event sounds (`sfx.js`).

### Smaller duplicates

`sdN` (three copies), `cl`/`V3`/`QT` helpers (`engine/util.js`, `src/config/constants.js`), the fixed 120 Hz loop.
`engine/flight.js` exports `setGroundFeel` for "the Interceptor's livelier bumps", but nothing calls it. The Interceptor keeps
its own copy of the ground solver instead.

## 3. What is shared now

### `src/flight/core.js`: the flight core

A leaf module with no DOM, no audio and no game state; it imports only three. It contains:

- **Rates:** `RTYPES`, `defRates`, `rateR(R, axis, x)`, `thrCurveR(R, t)`, `P3`, `wrapA`.
- **Attitude:** `attitude(d, up, fwd, k, maxR, yawW)` (bots and Angle mode), `rightUp(d, k)` (flip-over levelling).
- **Air-model blocks:** `rateLoop`, `propWash`, `turn` (the attitude step), `spool`, `thrust`, `inflow`, `bodyDrag`, `capSpeed`.
- **`quadAir(d, dt, K, F, wt, gd, lk, qn)`:** one League-quad tick in the air, built from the blocks.
  - `K` is the game's tune, read live through getters.
  - `F` is the airframe's multipliers: a parts loadout, or `ONE`, a plain quad with every multiplier 1 and no caps.
  - `qn` receives the end-of-tick attitude. Pass `d.q` to turn the quad there (Riley), or a spare quaternion when Rapier turns it
    (Jared).

Game-specific behaviour stays in the games, as config or hooks. Jared's parts are `F`. Pops are `lk` (the rates lock). The boost
effects are an `onBoost()` method. Ground contact, turtle, self-righting, flip-over triggers and the ball stay where they were.
The dart composes its own step from the blocks, keeping its rate loop, fins, wind, battery and Rocket Assist.

### `src/input/sticks.js`: the stick code

Controller detection (`RADIO`, `PAIR`, `BTN`, `pad`, `padX`, `padBlocked`) and the stick maths:

- `stickThr`: sprung or full-range throttle;
- `kbEase`: keyboard easing;
- `pick`: the stick or the key, whichever is pushed further;
- `acroCmd`: Acro rates;
- `angleCmd`: Angle-mode heading and tilt.

Each game keeps its own axis calibration, deadband, bindings, keyboard state and settings.

### Every change, file by file (for review)

**Riley's files:**

- `engine/flight.js`
  - `Quad.step`: the air part (rate lerp, wash, attitude step, spool, thrust, inflow, boost, gravity, drag, top speed: 12 lines)
    became `quadAir(this, dt, K, ONE, wt, gd, false, this.q)`. `K` is a getter object over the existing `let`s, so
    `tuneFlight` works as before.
  - The flip-over (`flipT`), turtle, pendulum, `pivot` and `ground` are untouched.
  - `rightUp` and `wrapA` come from the core.
  - `attitude` is re-exported from the core: same name, same signature, same private scratch vectors as before.
  - `humanControl` calls `stickThr`, `kbEase`, `pick`, `acroCmd` and `angleCmd`. It keeps its options, keyboard state, boost
    and flip handling.
  - The unused `THREE` import and scratch vectors went.
- `engine/rates.js`: `rate(axis, x)` and `thrCurve(t)` call the core's `rateR` / `thrCurveR` on `RT()`. `RTYPES` and `defRates` are
  imported from the core. The Rates tab, CLI export/import and sensitivity walkthrough are untouched.
- `engine/input.js`: `RADIO`, `PAIR`, `BTN`, `pad`, `padX` and `padBlocked` are imported from `src/input/sticks.js` and
  re-exported under the same names. `CAL`, `thrFull` and the rest are untouched.
- `games/interceptor/interceptor.js`: one import line, and seven lines of `Drone.step` call the core's blocks: `propWash`,
  `turnQ` (the core's `turn`, renamed because the threats have a `turn`), `spool`, `thrust`, `inflow`, `bodyDrag` with
  `FS, 1, FS`, and `capSpeed` with `MAXV + bmax`. The rate loop, `aero`, battery, Rocket Assist, `pivot` and `ground` are
  untouched.
- `games/league/*` and every Zombies file (`z*.js`): unchanged.

**Jared's files:**

- `src/flight/drone.js`: the air part of `Drone.step` became `quadAir(this, dt, K, F, wt, gd, lk, _qn)`. The super boost
  shake and sound moved into `onBoost()`. `rightUp` and `wrapA` come from the core; `wrapA` is still exported from here.
- `src/flight/rates.js`, `src/flight/attitude.js`, `src/config/ratetypes.js` are thin wrappers or re-exports of the core, with the
  same exports as before.
- `src/input/input.js`: detection is re-exported from `sticks.js`, and `humanControl` uses the stick maths. It no longer imports
  `flight/drone.js` or `attitude.js`. Module evaluation order from `src/main.js` was checked and is unchanged, apart from the new
  side-effect-free leaves.

### Why nothing moved, not even by a bit

- Every block is the old expression, operation for operation and in the same order. Where one game multiplied by a parts value
  and another didn't, the other now multiplies by exactly 1. `x * 1` and `x ** (y * 1)` are exact in floating point.
  `(k * .9) * 1` is the old `k * .9`; `(k * FS) * 1` is the dart's `k * FS`.
- Riley's `w.lerp(wt, a)` is `w.x += (wt.x - w.x) * a`. The core's capped loop with `ONE`'s infinite caps computes
  `cl((cl(wt.x, -Inf, Inf) - w.x) * a, -Inf, Inf)`, which is the same number.
- The core uses private scratch vectors. Jared's `attitude` and `step` used the shared `scratch.js` vectors, but no caller
  passes those vectors in or reads them back afterwards (checked).

## 4. Golden tests

| Test | Runs in | Covers |
| --- | --- | --- |
| `test/flight-golden.test.mjs` | `npm test` (CI fast job) | rates and throttle curve (6 profiles, all types, both sides); attitude (60 cases, both sides); Jared's real `Drone.step` (Riley's `Quad.step` until 2026-10-19) |
| `test/input-golden.test.mjs` | `npm test` | Drone League's `humanControl`, and Riley's until 2026-10-19: radio, Xbox, keyboard; Acro, Angle; sprung and full throttle; deadband; boost; assist; Lab Acro |
| `tools/flight-golden.mjs` | CI browser job (`flight-golden`) | the Interceptor dart in its page |

**Riley's quad (12 sequences, removed with `games/league`):** hover, punch-out, rolls, flip, super boost, prop-wash dive, freestyle, turtle, self-righting,
flip-over, slide, take-off.

**Jared's drone (22 sequences):** the same 12, plus two pops, and rolls, freestyle, turtle and slide on the heaviest parts
loadout and on the heaviest one with wheels. Node imports `src/flight/drone.js` with its DOM, WebGL and Rapier imports stubbed
by `test/fixtures/flight-stubs.mjs`; `sdf` becomes a flat floor. Rapier is replaced by `p += v dt`, `q *= exp(w dt)` and a
floor push-out, so the goldens pin the flight model, not the contact solver. That is covered by `physics-check`.

**The dart (8 sequences):** take-off from the mat, hover, dart cruise, rolls, cruise in an 8 m/s wind, Rocket Assist, prop-wash
dive, freestyle. Threats are cleared and the wind is pinned for the run.

Each sequence uses fixed inputs and a seeded `Math.random` (prop wash, turbulence). Every 0.1 s it samples position, attitude,
velocity, body rates, motor speed, boost, and for the dart the battery voltage, mAh and impacts. Each fixture also stores the
tune, parts multipliers and hull it was recorded with, so a retune or a parts rebalance does not move the goldens. Re-record only
when a feel change is intended:

- `GOLDEN_RECORD=1 node --test test/flight-golden.test.mjs` (likewise `input-golden`);
- `node tools/flight-golden.mjs --record`.

**Results.** All goldens were recorded before any refactor, and after it they match with a largest difference of exactly 0 (bit
for bit): node flight, node input, and the dart in the browser.

**Sensitivity.**
- Changing the drag shape factor by one part in 10⁷ fails both Leagues' goldens.
- Changing the Angle tilt factor by one part in 10⁷ fails both input goldens.

## 5. Migration plan (small steps, each with goldens first)

1. ~~Flight core~~ (done here).
2. ~~Stick code~~ (done here, both Leagues).
3. **Interceptor input.** Its keyboard easing, throttle mapping and pick are the same expressions. Add an `__z` hook to drive its
   `humanControl` in `tools/flight-golden.mjs`, record, then switch it to `sticks.js`.
4. **One binding format.** (The shared profile is fixed at the settings boundary, section 0; one parser for both games is
   still to do.) Make one parser in `sticks.js` accept both formats (`'aN'`, `'aN-'`, `'-aN'`, `'aN>m'`, `'aN<m'`).
   It must keep today's meaning of every value each game writes. This only changes values that are broken today (section 6).
5. **Axis maths.** Move Jared's `axr`/`axv` into `sticks.js`; Riley's settings never carry `r` or `nb`, so they act as before. One
   edge differs: a digital button that reports value 0 while pressed. Decide it with Riley (Jared's reading is the fix).
6. **Pilot profile.** One module owns the shared keys (defaults and validation), used by Jared's schema and by `engine/settings.js`,
   so neither side can reset or break the other's values.
7. **Rates tab.** One implementation, mounted by both. Jared's has the deadband and assist in the CLI text; Riley's has the
   sensitivity walkthrough.
8. **Ground behaviour.** Move the turtle, pendulum and flip-over triggers into the core as options, with each game's current
   settings, behind goldens. The contact solvers stay per game: Rapier in `src/`, SDF impulses in `engine/`.
9. ~~**Converge the two Leagues.**~~ Resolved on 2026-10-19 by retiring Riley's League (`games/league`): Jared's is the one
   League, Dogfight and Freeplay (section 0). Nothing was re-recorded and no feel changed.
10. **Audio.** Share the motor synth core (`rotHz`, mixer split, wash flutter), with a `sound-check` golden.
11. **Small helpers.** One `sdN`, one `cl`/`V3` helper module, one fixed-step loop.

## 6. For Riley to look at

- **Binding format clash in the shared pilot profile (fixed 2026-10-19, section 0; what it was:)**
  - Jared's game writes axis buttons as `'aN'` / `'aN-'`, and its settings schema only accepts `/^a\d-?$/`.
  - Riley's games write `'-aN'`, and learned thresholds such as `'a5>0.12'`.
  - Both go into the same keys of `droneleague`: `fireBtn`, `flipBtn`, `xfire`, `xflip`.
  - A switch learned in the Interceptor is reset to the default when Jared's game next loads.
  - An `'a3-'` bound in Jared's game never fires in Riley's games: `swOn` returns `null` for it.
  - Left over: Drone League's schema accepts one-digit axes only (`/^a\d-?$/`), so a switch on axis 10 or higher is still reset
    there. Drone League's reading of a learned threshold is the plain ±0.5 one.
- **Your files changed:** `engine/flight.js`, `engine/rates.js`, `engine/input.js`, and seven lines plus one import in
  `games/interceptor/interceptor.js`. Section 3 has every change. The games now load `../../src/flight/core.js` and
  `../../src/input/sticks.js`; if a game is ever served without `src/`, it will not start.
- **When you change flight maths now,** change it in `src/flight/core.js`. Every game flies it. Then run `npm test` and
  `node tools/flight-golden.mjs`. They fail on any change, which is the point. Re-record them when the change is meant.
- `setGroundFeel` in `engine/flight.js` has no callers. The Interceptor's `ground()` is a separate copy with the older bump
  values.
- `interceptor/interceptor-notes.md` (the frozen single-file build) still says to port flight changes by hand. That applies only to
  that frozen copy.
