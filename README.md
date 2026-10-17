# FPVLeague
Rocket league but with drones

## Play
- **Online:** turn on GitHub Pages for this repo and open the site. The launcher (`index.html`) lists the games.
- **On Windows:** double-click `Play Drone League.bat`. It starts a small local web server (`serve.ps1`) and opens the launcher in an Edge app window. The games are ES modules, so they need a web server; opening `index.html` straight from the folder won't work.
- **Anywhere else:** run any static server in this folder, for example `python -m http.server 8765`, then open http://localhost:8765/.

## Layout
One flight engine, several games on top of it. Plain ES modules, no build step. The only outside code is Three.js 0.160.0 and PeerJS 1.5.4, loaded from jsDelivr.

```
index.html              launcher
engine/                 shared by every game
  flight.js             the quad: thrust curve, prop inflow, spool, body-axis drag, prop wash, super boost,
                        rounded-box ground contact, turtle pivots, inverted-pendulum self-righting, flip-over,
                        attitude controller (Angle mode + bots), stick input; tuneFlight(T), setWorld(sdf)
  rates.js              Betaflight rates (BETAFLIGHT / ACTUAL / QUICK / KISS / RACEFLIGHT), 3 profiles,
                        throttle curve, Rates tab with CLI import/export, Easy sensitivity setup
  input.js              keyboard, mouse, Gamepad API, RC radio detection + guided calibration, Xbox profile,
                        controller panel, fire / flip buttons
  settings.js           saved settings; the pilot profile (calibration, rates, camera, flight mode, buttons)
                        is shared between games under the "droneleague" key
  render.js             Three.js renderer, bloom, sky texture, FPV camera (uptilt, horizontal FOV)
  hud.js audio.js       banner / feed / edge arrow; motor synth (4 motors, Betaflight quad-X mixer), noise, tones
  menu.js modpanel.js   settings grid, mod panel (Rates + Physics tabs, presets, export/import)
  net.js loop.js        online rooms (claude.ai room or PeerJS), 120 Hz fixed-step main loop
  engine.css            shared look (OSD, menu, mod panel, controller panel)
games/league/           Drone League + Dogfight (one game, two modes: ?mode=league / ?mode=df)
  league.js             match rules, ball, bots, guns, turrets, online sync, HUD
  consts.js arena.js highlands.js scene.js   arena + maps + ball styles, the Highlands, lights
games/interceptor/      Interceptor (still its own single file for now, not yet on the engine)
Drone League/           the original single-file Drone League (claude.ai artifact version), kept as is
```

A new game imports the engine, builds its world, calls `setWorld(sdf)` with its collision shape, extends `Quad` for its drone, and hands `startLoop()` its step and draw functions. See `games/league/league.js`.
