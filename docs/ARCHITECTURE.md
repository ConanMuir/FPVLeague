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
