# FPVLeague
Rocket league but with drones

## Branch status
Branch: `bots-freestyle-3`   Owner: Jared   Last updated: 2026-10-19 by Claude (Opus 5.5)
Based on: origin/main 5cf88e6 (Freestyler pass 2, PR #44), with origin/main 1c4169b (zombies co-op, PR #46) merged in
Doing: Freestyler pass 3: no more wall-stuck re-scoops (Freestyler and Dribbler), wall pops, spin pops at 10+ rad/s, curve measured.
Touches: src/bots/freestyle.js (wall feed/wall pop, spin pop, brush), src/bots/dribble.js (wall-side scoop, `roomBehind`, stuck back-off, applies the spin-pop yaw), tools/bot-match.mjs (wallPops, spin pops, spin10, curve).
Open items / help wanted: spin has no effect in flight (ball physics has no Magnus term), so the measured curve is ~0; a Magnus term in physics/ball.js (and the bot predictor) would be a shared physics decision. The brush on loose balls rarely lands 10+ rad/s; the spin pop does. Flip resets and ceiling plays not attempted.
Overlaps: none known on src/bots.

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

## SOP for Claude agents working in this repo
This section applies to **every Claude agent** (Claude Code, claude.ai projects, any session) that reads or changes this repository, whichever person it works for. At least two people (Riley and Jared) each run their own Claudes here, often at the same time, and none of those Claudes can see each other's conversations. The branches and their READMEs are the only shared memory, so follow these steps every time.

### 1. Before you start: survey every branch
1. `git fetch origin --prune`, then list branches: `git branch -r`.
2. For each branch, read its latest commits and READMEs without checking it out:
   ```
   git log -5 --format='%h %an %ad %s' --date=short origin/<branch>
   git ls-tree -r --name-only origin/<branch> | grep -i readme
   git show origin/<branch>:README.md
   ```
3. Check which files your task touches and whether another branch already changes them: `git diff --stat origin/main...origin/<branch>`.
4. Check open pull requests for the same work.

### 2. Decide: overlap, help, or go ahead
- **Same feature already in progress on another branch:** don't start a parallel version. Build on that branch's work (branch from it or merge it in), or tell your person it exists and ask how they want to proceed.
- **Same files, different feature:** go ahead, but expect a merge. Keep your change small and say in your branch README which files you touched, so the other agent can plan around it.
- **Work you can help with:** if another branch's README lists open items or known problems that match what your person wants, offer to pick them up rather than duplicating them.
- **Never** push to, rebase, force-push or rewrite someone else's branch unless the person who owns it asked you to. Merge their branch into yours instead.
- **Never** push to `main` unless your person explicitly says so. Work on a branch and open a PR.

### 3. Explain other people's changes to your person
When you start, tell your person in plain words what has changed on other branches since they last looked: who changed what, on which branch, and whether it affects their task. Credit the author (use the git author or the branch README). Don't present someone else's work as your own, and don't undo it without asking.

### 4. Keep your branch README current
Every working branch keeps a short **Branch status** section at the top of its root `README.md` (or a `docs/` note it links to). Update it in the same commit as your change:
```
## Branch status
Owner: <person>   Last updated: <YYYY-MM-DD> by <agent/person>
Based on: <branch + commit it came from>
Doing: <one or two lines on the current goal>
Touches: <main files or folders changed>
Open items / help wanted: <anything another agent could pick up>
Overlaps: <other branches touching the same files, and how to merge>
```
This is how the next Claude, working for anyone, finds out what you did without asking.

### 5. When you finish
Commit with a clear message, push your branch, update its Branch status, and note any follow-up another agent should know about (an unported change, a known bug, a merge still to do).

### Branch snapshot (2026-10-18)
A starting point only; re-run step 1, because this goes stale.

| Branch | Owner | What it is |
|---|---|---|
| `main` | shared | Jared's Vite + `src/` build (Rapier physics, RL-style Garage, attachments, drone detail), merged from PRs #5-#11 |
| `modular-rewrite`, `physics-rapier`, `garage-rl`, `attachments`, `drone-detail`, `arena-ball-detail`, `dogfight-hitzone` | Jared | Jared's feature branches, mostly merged into `main` |
| `rileys-branch` | Riley | Riley's default branch: single-file League + modular `engine/` + `games/` + Interceptor |
| `claude/project-thread-6m02vl` | Riley | Modular engine + games split (PR #1), merged into `rileys-branch` |
| `claude/project-thread-s7tpv5`, `claude/project-thread-pwu70p` | Riley | Interceptor game (PR #3, earlier #2) |
| `riley-test-0u2krq` | Riley | Riley's test build: `rileys-branch` plus Jared's `physics-rapier` and `main` up to PR #11 |
| `riley-test-2` | Riley | `riley-test-0u2krq` plus Jared's latest `main` (PRs #12-#21) |
