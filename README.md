# FPVLeague
Rocket league but with drones

## How to play

The launcher (`index.html`) lists every game: **Drone League**, **Dogfight**, **Interceptor** and **Drone League (Jared's build)**. Pick whichever way is easiest:

1. **Windows:** double-click `Play Drone League.bat`. It starts a small local web server and opens the launcher in its own Edge window. Close the black server window when you're done.
2. **Online:** turn on GitHub Pages for this repo (Settings > Pages > deploy from the main branch), then open the site link. Nothing to install.
3. **Mac / Linux:** open a terminal in this folder, run `python3 -m http.server 8765`, then open http://localhost:8765/ in Chrome or Edge.

Double-clicking `index.html` on its own won't work: the games are split into modules, and browsers only load those from a web server. You need an internet connection the first time, because Three.js (the 3D library) loads from the web. Chrome or Edge work best.

Each game folder has its own README with the controls: [Drone League and Dogfight](games/league/README.md), [Interceptor](games/interceptor/README.md).

**Radio or Xbox controller:** plug it in, press a button or move a stick, then use **Calibrate controller** in a game's menu. Your calibration, rates, flight mode and FOV are shared between games, so you only set them up once.

## Layout
One flight engine, several games on top of it. Plain ES modules, no build step. The only outside code is Three.js 0.160.0 and PeerJS 1.5.4, loaded from jsDelivr.

```
index.html              launcher
engine/                 shared by every game
  flight.js             the quad: thrust curve, prop inflow, spool, body-axis drag, prop wash, super boost,
                        rounded-box ground contact, turtle pivots, inverted-pendulum self-righting, flip-over,
                        attitude controller (Angle mode + bots), stick input; tuneFlight(T), setWorld(sdf);
                        rough-air helpers (coloured-noise turbulence, fin weathervaning) for airframes that use them
  rates.js              Betaflight rates (BETAFLIGHT / ACTUAL / QUICK / KISS / RACEFLIGHT), 3 profiles,
                        throttle curve, Rates tab with CLI import/export, Easy sensitivity setup
  input.js              keyboard, mouse, Gamepad API, RC radio detection + guided calibration, Xbox profile,
                        controller panel, fire / flip buttons, switch mapping with Learn and Assign switches
  settings.js           saved settings; the pilot profile (calibration, rates, camera, flight mode, buttons)
                        is shared between games under the "droneleague" key
  render.js             Three.js renderer, bloom, sky texture, FPV camera (uptilt, horizontal FOV),
                        world-space surface detail shader, lumpy tree crowns
  hud.js audio.js       banner / feed / edge arrow; motor synth (4 motors, Betaflight quad-X mixer), noise, tones
  menu.js modpanel.js   settings grid, mod panel (Rates + Physics tabs, presets, export/import)
  net.js loop.js        online rooms (claude.ai room or PeerJS), 120 Hz fixed-step main loop
  engine.css            shared look (OSD, menu, mod panel, controller panel)
games/league/           Drone League + Dogfight (one game, two modes: ?mode=league / ?mode=df)
  league.js             match rules, ball, bots, guns, turrets, online sync, HUD
  consts.js arena.js highlands.js scene.js   arena + maps + ball styles, the Highlands, lights
games/interceptor/      Interceptor: the tail-sitter dart keeps its own flight model (interceptor.js); everything else is the engine
Drone League/           the original single-file Drone League (claude.ai artifact version), kept as is
games/jared-league/     Jared's build of Drone League (built file, made by `npm run build` from src/)
app.html src/           Jared's Vite source for it (see below)
```

A new game imports the engine, builds its world, calls `setWorld(sdf)` with its collision shape, extends `Quad` for its drone, and hands `startLoop()` its step and draw functions. See `games/league/league.js`.

## Jared's build (Vite, `src/`)
A second modular version of Drone League by Jared: Rapier physics, garage with drone parts, Calibration Lab auto-tuner,
choose-your-controls binding, game-mode registry and a Rocket League-style menu and HUD. It lives beside the engine above and
shares no code with it. The launcher's "Drone League (Jared's build)" card opens the built file, so playing it needs no Node.

To change it you need Node 20+:
```
npm ci
npm run dev      # live dev server, opens http://localhost:5173/app.html
npm run build    # dist/index.html: the whole game in one HTML file; also updates games/jared-league/index.html
                 # and writes dist/drone-league.artifact.html (the claude.ai artifact form)
npm run smoke    # headless Microsoft Edge smoke test, plus a comparison run of the frozen v15 file (needs internet)
```
The entry page is `app.html`; source is in `src/` (ES modules). See `docs/jared-build-notes.md` for the layout and `docs/PLAN.md` for the plan.
