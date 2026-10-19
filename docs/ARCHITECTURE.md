# Drone League architecture notes

Short notes for the game in `src/` (Riley's `games/` and `engine/` are separate). `src/main.js` boots the modules and runs the frame
loop: a fixed 120 Hz simulation (`modes/step.js`), then rendering, HUD and net.

## Modes and overlays (`src/modes/registry.js`)

A **mode** is what the menu's mode buttons pick (League, Dogfight, Freeplay) or what a feature switches to (Training). Each mode
registers itself from its own file with `registerMode(id, def)`. The core loop, HUD, input and net code never test for a particular
mode; they call the mode's hooks and read its flags:

| hook / flag | when |
| --- | --- |
| `enter({prev})`, `exit(next)` | `setGame()` switches mode: the old mode's `exit`, the world swap, then the new mode's `enter` |
| `pre(dt)` | start of each physics step; return `true` to take the step over (only the Rapier step runs after it) |
| `bot(d, dt)` / `pilot(d, dt)` | bot controller (default `bots/league.js`) / after the local pilot's controls are read |
| `droneTick(d, dt, auth)` / `tick(dt, auth)` | per local drone after the Rapier step / once per step after the drones (guns, turrets) |
| `post(dt)` | end of each step, after touches and goals |
| `hud(now, active)` | every rendered frame, active or not, so it can hide its own UI (UI files attach it with `addHud(id, fn)`) |
| `net.{pilot, host, joiner, fromHost, fromPeer}` | the mode's part of the online packets (see `net/net.js`) |
| `world` | `'arena'` (pitch, ball, goals) or `'highlands'` (terrain, guns; sets `GS.OBSON`) |
| `free` | no match clock, one pilot, no bots; HUD shows FREEPLAY |
| `allowGoals` (default true), `allowReset` (default = `free`) | the ball scores / R and Xbox Y respawn you; may be functions |

An **overlay** (`registerOverlay(id, def)`) layers over whatever mode is set while its `on()` is true. The Calibration Lab is one: it
runs League underneath for its rigs and Freeplay for "Test first". Overlays take the same hooks; their `pre`/`post` run before the
mode's, and any flag they define wins over the mode's (`modeFlag(name)`). Overlay-only flags: `fixedCam`, `fixedFlightMode`.

`GS.OBSON` is the *world* (Highlands: no ball, guns), not the mode; code that only cares whether there is a ball keeps reading it.

### Adding a mode

1. Create `src/modes/<name>.js`:
   ```js
   import {registerMode} from './registry.js';
   registerMode('keepy',{name:'Keepy-up',title:'KEEPY-UP',sub:'Keep the ball off the floor.',order:3,free:true,allowGoals:false,
    enter:()=>{/* reset your counters */},post:dt=>{/* judge, score, banner */}});
   ```
2. Import it in `src/main.js` next to `./modes/league.js`. The menu button, saved `S.game`, lobby label and `setGame()` pick it up.
3. Need a new kind of world? Add a `world` id and handle it in `setGame()` (`modes/dogfight.js`) and `setMap()`.
4. Per-frame UI goes in `src/ui/<name>.js` with `addHud('keepy', fn)`.
5. React to game events (touches, goals, ...) with `onEv` from `src/core/events.js` rather than new calls inside `step.js`.

## Game events (`src/core/events.js`)

Gameplay code *emits* events; sound (`audio/sfx.js`), effects (`render/effects.js`, `render/popfx.js`, `render/goalfx.js`),
training judging, bots and tools *listen*. The full list of types and payloads is the comment at the top of `events.js`: `touch`,
`bump`, `bullet`, `ground`, `bounce`, `popEarn`, `popFire`, `save`, `shot`, `goal`, `demo`, `kill`, `kickoff`, `count`, `orb`, `end`.

```js
import {onEv} from '../core/events.js';
const off=onEv('goal',e=>{log.push({team:e.team,x:e.p.x})});  // copy what you keep; off() unsubscribes
```

Rules, because several of these fire every physics tick:

- **Payloads are reused.** Each producer owns one payload object per type (and its vectors) and overwrites it for every event. Read
  what you need inside the listener and copy anything you keep. Never store the payload or its `p` / `n`.
- **No allocation on emit.** `emitEv` walks a plain array; listener lists are copied only when someone subscribes or unsubscribes.
- Listeners run synchronously inside the producer, in subscription order, and see the world as the producer left it.
- Hot producers check `hasEv(type)` before doing extra work to build a payload.
- `onEv` throws on an unknown type; add new types to `EVENTS` with a one-line payload description.
- `physics/world.js` still exports the old `onHit(fn)` / `emitHit(e)` for the four contact events (`e.type` is `'ball'`, `'drone'`,
  `'bullet'`, `'ground'`), which `tools/bot-match.mjs` uses.

### Replays and cosmetic listeners (`src/render/replay.js`)

Goal replays (League) and the Dogfight kill cam replay recorded render state; nothing is re-simulated. `main.js` `tick()` calls
`rpRec(dt)` after every step: a preallocated ring keeps 10 s of the ball and up to 6 drones at 60 Hz (pose, velocity, throttle, boost /
dead / pop flags), plus an event ring (touch, bump, bounce, popEarn, popFire, goal) and a ring of the Dogfight rounds fired (`guns.js`
`BH` hooks). To play, a window is copied into a clip; each frame `rpIn()` swaps the clip's state into the ball and drone objects before
`visuals()`, and `rpOut()` / `rpVis()` put the live state back (like `lerpIn` / `lerpOut`), while `camera.js` `CAM.fn` hands the camera to
the replay. Recorded events are sent with `replayEv`, which only reaches listeners that subscribed with **`onFx`** (effects and sound).
Gameplay listeners use `onEv` and never see a replayed touch or goal. If you add a purely cosmetic listener for an event that replays,
subscribe it with `onFx`.

Timing: `goal()` asks `goalHold()` how much to extend the post-goal wait (the host's `stT` goes to joiners, so online kickoffs stay
synced). Offline, the wait ends when the replay ends or is skipped. Online, each pilot sends `rs` (the goal whose replay it is done with)
and the host starts the kickoff once everyone is done.

### Adding an event

1. Add the type and its payload line to the comment and `EVENTS` in `src/core/events.js`.
2. In the producer: a module-level payload object, filled and sent with `emitEv('type', P)` at the moment it happens.
3. Listeners subscribe once at module load (or in an init function, like `sfxInit`, if they must not run before it).

## Settings (`src/config/settings.js`, `src/config/schema.js`)

`S` is loaded once at startup from localStorage `droneleague`: the saved JSON merged over `DEF`, then the `SCHEMA` list runs in order.
Each `field(key, clean)` checks and clamps one setting (`oneOf`, `num`, `int`, `isTrue` cover most); `version('physV', MIGRATIONS)`
runs every migration newer than the save's `physV`, once, and writes the settings out after each. The list order is the saved JSON's
key order, which `tools/smoke.mjs` compares with v15's, so append new fields at the end. `test/settings.test.mjs` replays 65 recorded
old saves (`test/fixtures/settings-golden.json`) and checks the result and every write bit-for-bit.

- New setting: append a `field()` (its default goes in the field's clean function; `DEF` is v15's list and stays as it is).
- Changing what old saves mean: append `{v: next, run(S){...}}` to `MIGRATIONS`.

## Progression (`src/progress/`, `src/ui/profile.js`)

Level, XP, lifetime stats, achievements and cosmetic unlocks. Everything comes from the event bus; gameplay code has no progression
calls (the one producer added for it is the `pack` event when a training pack finishes).

- `progress/tracker.js` listens to `kickoff`, `count`, `touch`, `popFire`, `bounce`, `save`, `shot`, `goal`, `demo`, `kill`, `bullet`,
  `end` and `pack`. A match is recorded from a kickoff at 0-0 in a mode with a clock and opponents (League, Dogfight), with no overlay,
  not in the attract demo. `end` commits it. Leaving early keeps the counts but gives no XP. Only events about your own drone count.
  The profile is never sent online.
- Pure rules, tested in node (`test/progress.test.mjs`): `xp.js` (levels, match XP with its anti-farm rules, training XP),
  `match-rec.js` (one match's counts: goals, assists, pop chains, air dribbles, kills, ...), `achievements.js`, `unlocks.js` (which
  Garage cosmetics a level or achievement unlocks; parts are never locked), `profile.js` (the saved profile).
- The profile is localStorage `droneleague.profile`, its own key with its own version (`pv`): loaded through `config/schema.js` like
  the settings (every field cleaned; a broken save loads fresh and the old text is kept in `droneleague.profile.bak`), then
  `PROFILE_MIGRATIONS` newer than the save run once each. `test/fixtures/profile-golden.json` pins how 21 saves load.
  Changing what an old profile means: append `{v: next, run(P, ctx)}` to `PROFILE_MIGRATIONS`.
- New achievement: append to `ACH` (never rename an id: it is saved). New locked cosmetic: add it to `LEVEL_UNLOCKS` or give an
  achievement a `reward`. `tools/progress-check.mjs` plays real matches headless and checks the whole loop.

## Shared with Riley's games (`src/flight/core.js`, `src/input/sticks.js`)

Two leaf modules are loaded by every game, Jared's (through Vite) and Riley's (`engine/`, `games/`, as raw ES modules), so they
import nothing but three and touch no DOM when loaded. `flight/core.js` is the flight maths: rates and throttle curve, the attitude
controller, flip-over levelling, and the air model (`quadAir` and its blocks). `input/sticks.js` is controller detection and the
stick maths of `humanControl`. `flight/drone.js` keeps what is Jared's own: parts multipliers (`F`), pops, turtle, self-righting,
flip-over triggers; Rapier still integrates and collides. Change flight maths in the core and every game flies it. The golden tests
(`test/flight-golden.test.mjs`, `test/input-golden.test.mjs`, `tools/flight-golden.mjs` for the Interceptor) fail on any change by
design; re-record them only for an intended feel change. Audit, rules and the migration plan: `docs/SHARED-ENGINE.md`.
