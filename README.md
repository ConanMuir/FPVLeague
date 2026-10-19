# FPVLeague
Rocket league but with drones

## Branch status
Owner: Jared   Last updated: 2026-10-18 by Claude (Opus 5.5)
Based on: origin/main 5c965f2 (ball feel, PR #21), merged with 4a49f56 (goal explosions, PR #23)
Doing: Gameplay effects (`src/render/effects.js`): boost flame jets under every motor + boost ribbon trail + embers, motor-wash glow at high throttle, prop-wash dust off the ground/walls tinted per map (arena haze, Meadow grass clippings, Canyon dust, Alpine snow powder, Highlands grass/dirt), sparks + fading scuff decals when the frame scrapes/tumbles, a speed-based ball trail and a flash + shock ring + sparks on hard ball hits. Scaled by the graphics quality, all pooled.
Touches: src/render/effects.js (new), src/render/visuals.js (calls `gameFx`, old boost embers removed), src/physics/world.js (`onHit` type `'ground'` event from `groundContacts`), src/modes/step.js (ball `onHit` event carries `p`/`n`; the old hit emit removed), tools/fx-shots.mjs (new: scenario screenshots + frame time with effects on/off).
Open items / help wanted: remote (online) drones don't send ground contacts, so they get no sparks/scuffs; boost trail colour is `d.trailCol` (0xRRGGBB, null = team colour) for a cosmetic to set; sound can listen to `onHit` `'ground'` (`speed` impact, `slide` scrape speed).
Overlaps: goal explosions (`src/render/goalfx.js`, merged) and sound may also use `onHit`; event types were only extended, none renamed.

## Play
Open `Drone League/Play Drone League.bat` (Windows, Microsoft Edge), or open `Drone League/standalone/index.html` in a browser.

## Build
Needs Node 20+.
```
npm ci
npm run dev      # live dev server (http://localhost:5173)
npm run build    # dist/index.html: the whole game in one HTML file; also updates Drone League/standalone/index.html
                 # and writes dist/drone-league.artifact.html (the claude.ai artifact form)
npm run smoke    # headless Microsoft Edge smoke test, plus a comparison run of the frozen v15 file (needs internet)
```
Source is in `src/` (ES modules); see `Drone League/claude-project/drone-league-notes.md` for the layout and `docs/PLAN.md` for the plan.

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
| `riley-test-0u2krq` | Riley | Riley's test build: `rileys-branch` plus Jared's `physics-rapier` and latest `main` |
