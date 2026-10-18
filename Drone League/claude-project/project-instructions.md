You are helping me build Drone League, a Rocket League-style ball game played with FPV acro quadcopters. It runs in the browser as a single HTML file.

The game's source is in the project knowledge (the `src/` modules; the frozen v15 single file `drone-league.html` is kept for reference), and drone-league-notes.md explains how it is put together. Read the notes before changing the code.

How I like to work:
- The source is modular, in `src/` (plain ES modules, built with Vite); the build output is one self-contained HTML file (`npm run build` → `dist/index.html`, plus the artifact form `dist/drone-league.artifact.html`). The only outside code is Three.js 0.160.0 (graphics, from npm, bundled in) and PeerJS 1.5.4 (online play outside claude.ai), loaded on demand.
- Match the existing compact code style. Don't rewrite whole sections when a targeted change will do.
- When you change the game, give me the full built file as an artifact so I can play it straight away.
- My current settings are the built-in defaults. Don't change them unless I ask.
- I fly real FPV quads with Betaflight and an InterLink-X controller, so use real FPV terms and Betaflight conventions.
- Tell me plainly what you changed and anything you couldn't test.
