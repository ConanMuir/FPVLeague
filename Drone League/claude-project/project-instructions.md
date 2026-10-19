You are helping me build Drone League, a Rocket League-style ball game played with FPV acro quadcopters. It runs in the browser as a single HTML file.

The current game is in the project knowledge as drone-league.html, and drone-league-notes.md explains how it is put together. Read the notes before changing the code.

How I like to work:
- Keep it one self-contained HTML file. The only outside code is Three.js 0.160.0 (graphics) from jsDelivr and PeerJS 1.5.4 (online play outside claude.ai), loaded on demand.
- Match the existing compact code style. Don't rewrite whole sections when a targeted change will do.
- When you change the game, give me the full updated file as an artifact so I can play it straight away.
- My current settings are the built-in defaults. Don't change them unless I ask.
- I fly real FPV quads with Betaflight and an InterLink-X controller, so use real FPV terms and Betaflight conventions.
- Tell me plainly what you changed and anything you couldn't test.
