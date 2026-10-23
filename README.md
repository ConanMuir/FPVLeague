# FPVLeague
Rocket league but with drones

## Branch status
Branch: `bots-unstoppable`   Owner: Jared   Last updated: 2026-10-21 by Claude (Opus 5.5)
Based on: origin/main (merged up to the PR's base)
Doing: League bots from Legend up are out of a human's reach and Dribbler / Freestyler are the top levels. Legend, Champion and Grand Champion all fly the shot planner with a player's full thrust (DIFF[].full, bots/league.js thrOf), goal-side defence (shadow a foe who gets there first, race home past a ball heading for the goal, never push it in from behind, clear wide in front of the goal) and no flying into the ball when not striking; the ladder is reaction, noise, speed and extras. Dribbler / Freestyler add the quickest reactions, demolishing a lone keeper before a shot, winning collisions, and the possession game (carry, pops, evasive pops) only when the ball is safely theirs, with an open-goal shot taking priority. Their teammates now play (the planner) instead of standing aside.
Touches: src/bots/league.js, src/bots/dribble.js (dribbleSupport removed, full thrust), src/bots/freestyle.js (header), src/config/constants.js (Legend .. Freestyler: one profile object per tier, every knob a tier reads is on its entry), src/progress/xp.js (difficulty factors), tools/bot-match.mjs (kickoffs, possession, goal context).
Open items / help wanted: Dribbler vs Grand Champion in 1v1 is only a narrow win (25-20 over 50 min); the possession game itself still loses the ball more often than the planner, so it is kept to safe moments and the visible mechanics are modest in matches (~0.7 pops/min, few chains). The 'human' gauge is a scripted profile (Champion-like planner, 0.2 s reaction), not a person.
Overlaps: another agent is on the battery/OSD (src/ui/osd.js, untouched here).

## How to play

The launcher (`index.html`) lists the two games: **Drone League** (League, Dogfight, Freeplay and Training, in `games/drone-league/`) and the **Interceptor** (Classic or Zombies). Drone League's menu also links to the Interceptor. Pick whichever way is easiest:

1. **Windows:** double-click `Play Drone League.bat`. It starts a small local web server and opens Drone League in its own Edge window. Close the black server window when you're done.
2. **Online:** turn on GitHub Pages for this repo (Settings > Pages > deploy from the main branch), then open the site link. Nothing to install.
3. **Mac / Linux:** open a terminal in this folder, run `python3 -m http.server 8765`, then open http://localhost:8765/ in Chrome or Edge.

Double-clicking `index.html` on its own won't work: the Interceptor is split into modules, and browsers only load those from a web server. You need an internet connection the first time, because Three.js (the 3D library) loads from the web. Chrome or Edge work best.

Drone League shows its controls in its own menu; the Interceptor has a README with them: [Interceptor](games/interceptor/README.md).

**Radio or Xbox controller:** plug it in, press a button or move a stick, then use **Calibrate controller** in a game's menu. Your calibration, rates, flight mode and FOV are shared between games, so you only set them up once.

## Layout
Two games. Drone League is the Vite build in `src/` (built to one HTML file). The Interceptor runs on Riley's engine, plain ES
modules with no build step. Both fly the same flight core and stick maths (`src/flight/core.js`, `src/input/sticks.js`; see
`docs/SHARED-ENGINE.md`) and share the pilot profile. The Interceptor's only outside code is Three.js 0.160.0 and PeerJS 1.5.4,
loaded from jsDelivr.

```
index.html              launcher: Drone League and the Interceptor
games/drone-league/     Drone League: League, Dogfight, Freeplay, Training (built file, made by `npm run build` from src/)
games/jared-league/     a redirect to games/drone-league/ for old links
app.html src/           Drone League's Vite source (see below)
engine/                 Riley's engine, used by the Interceptor
  flight.js             attitude controller (from the shared core), rough-air helpers (coloured-noise turbulence,
                        fin weathervaning)
  rates.js              Betaflight rates (BETAFLIGHT / ACTUAL / QUICK / KISS / RACEFLIGHT), 3 profiles,
                        throttle curve, Rates tab with CLI import/export
  input.js              keyboard, mouse, Gamepad API, RC radio detection + guided calibration, Xbox profile,
                        controller panel, fire / flip buttons, switch mapping with Learn and Assign switches
  settings.js           saved settings; the pilot profile (calibration, rates, camera, flight mode, buttons)
                        is shared between games under the "droneleague" key
  render.js             Three.js renderer, bloom, canvas textures, horizontal FOV,
                        world-space surface detail shader, lumpy tree crowns
  hud.js audio.js       banner / feed; motor synth (4 motors, Betaflight quad-X mixer), noise, tones
  menu.js modpanel.js   settings grid, mod panel (Rates + Physics tabs, presets, export/import)
  net.js loop.js        online rooms (claude.ai room or PeerJS), 120 Hz fixed-step main loop
  engine.css            shared look (OSD, menu, mod panel, controller panel)
games/interceptor/      Interceptor (Classic, Zombies): the tail-sitter dart's step is built from the shared flight core
                        (interceptor.js); everything else is the engine
Drone League/           the original single-file Drone League (claude.ai artifact version), kept as is
```

Riley's own League and Dogfight (`games/league/`) were retired on 2026-10-19: Drone League (`src/`) is the one League. They are in
git history; `docs/SHARED-ENGINE.md` section 0 lists what went with them.

## Drone League (Vite, `src/`)
Jared's modular Drone League: Rapier physics, garage with drone parts, Calibration Lab auto-tuner, choose-your-controls binding,
skill training, replays and progression, a game-mode registry and a Rocket League-style menu and HUD. The launcher's "Drone
League" card opens the built file, `games/drone-league/index.html`, so playing it needs no Node.

To change it you need Node 20+:
```
npm ci
npm run dev      # live dev server at http://localhost:5173/app.html (DL_OPEN=1 opens it in the browser)
npm run build    # dist/index.html: the whole game in one HTML file; also updates games/drone-league/index.html
                 # and writes dist/drone-league.artifact.html (the claude.ai artifact form)
npm run smoke    # headless Microsoft Edge smoke test, plus a comparison run of the frozen v15 file (needs internet)
```
The entry page is `app.html`; source is in `src/` (ES modules). See `docs/jared-build-notes.md` for the layout and `docs/PLAN.md` for the plan.

### Checks and CI
GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request, in two jobs side by side:

| Job | What runs |
|---|---|
| **fast** | `npm ci`, `npm run build` (then `tools/check-build.mjs` warns if the committed `games/drone-league/index.html` is stale), `npm test` (node:test), `node tools/parts-balance.mjs`, `node tools/lint-comments.mjs --strict` |
| **browser** | nine entries side by side, on the runner's Chrome with software WebGL: `tools/smoke.mjs` in two halves after a build (`--parts=main`, `--parts=lab,train`), `physics-check`, `pop-check`, `sound-check`, `training-check`, and `zombies-test` in three shards (`--sections=...`); last, `audio-levels --quick` per game (every sound rendered offline and measured against its peak cap; over a cap warns here, fails locally) |

- **No-render mode.** SwiftShader draws the games at about 1 fps on a runner, so in CI (`DL_NORENDER=1`) every page gets a WebGL stub that skips draw calls, clears and blits. Shaders still compile and link, buffers and textures still upload, and three.js still walks the scene, so GL errors still show; only the pixels are skipped, and the sim runs at full speed. Where a check wants real pixels it calls `drawFrames(page)`: smoke draws the menu demo, the garage view, League, Dogfight, every graphics quality, the Lab, a training pack and the artifact form; zombies-test draws each menu and each start of play.
- **Only what changed.** Each browser entry first runs `tools/ci-scope.mjs`: the League checks are skipped when nothing under `src/`, `app.html`, `index.html`, `games/drone-league/`, `Drone League/` or their tools changed, and the zombies-test shards when nothing under `engine/`, `games/interceptor/`, `interceptor/` or their tools changed. Shared files (package-lock, the workflow, `tools/browser.mjs`) run both, and main always runs everything.
- The runner's preinstalled Chrome is used (a stable Chrome is downloaded only if it has none); npm's cache is restored by setup-node.

Run the same things locally (all headless; nothing pops up): `npm test`, `node tools/parts-balance.mjs`, `npm run smoke`, `node tools/physics-check.mjs` and so on.
- **Browser:** every tool picks it in `tools/browser.mjs`: `EDGE_PATH`, then `CHROME_PATH`, then the usual Edge / Chrome / Chromium install for the platform.
- **Flags:** `DL_SWIFTSHADER=1` forces software WebGL (on by default in CI). `DL_NORENDER=1` skips draw calls outside `drawFrames()` (on by default in CI). `DL_TIMING_WARN=1` turns wall-clock budgets (physics-check's ms per tick) into warnings. They are warnings in CI, because shared runners are too noisy to time.
- **Waits are state-driven.** The checks wait on the game's own state (`window.__dl` snapshots, the Lab, training and binding state, `__z` in the Interceptor) or on frames drawn, not on fixed sleeps. A slow machine makes a run take longer, but it doesn't fail. Keep new checks that way.
- Dev-server tools load `app.html`, because the root `index.html` is the games launcher.

### Comment lint
The code here packs many statements onto one line, often with a `// note` at the end. A `//` comment inserted in the middle of such a line silently turns the rest of the line into comment. The build stays green and the game breaks; this has disabled real code more than once. `node tools/lint-comments.mjs` flags added or changed lines where code seems to follow a `//` on the same line. For example, a statement after a `;` inside the comment, a comment after code that ends like a statement, or code before a second `//`.
```
node tools/lint-comments.mjs                 # lines changed since the merge base with origin/main
node tools/lint-comments.mjs --base <ref>    # ... since another ref
node tools/lint-comments.mjs --all           # every line (it is tuned to report nothing on the current code)
node tools/lint-comments.mjs --strict        # exit 1 on findings (CI runs it this way: a finding fails the fast job)
```
Fix a finding by moving the comment to the end of the line or using `/* */`. If a comment really means to quote code, put `lint-ok` in it.

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
