# FPVLeague
Rocket league but with drones

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
