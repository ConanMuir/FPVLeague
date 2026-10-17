# Drone League: how the game is built

## Files
- `drone-league.html` is the game. On claude.ai it is published as an artifact page, without `<!doctype>`/`<html>`/`<head>` tags, because the artifact adds them.
- `standalone/index.html` is the same file wrapped in a full HTML document so it can run on its own. Rebuild it after every change to `drone-league.html`: add `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>` before it and `</body></html>` after it.
- `Play Drone League.bat` opens `standalone/index.html` in a Microsoft Edge app window.

## Code layout (sections marked with `// ---------- name ----------`)
1. **Constants and settings.** Arena size (W 100 × L 150 × H 44 m; goals 26 × 12 × 10 m; corner radius RC 22, ramp radius RF 8). `DEF` holds the default settings, saved in the browser under the key `droneleague`.
2. **Rates.** `rate(axis, x)` implements Betaflight's rate formulas for BETAFLIGHT, ACTUAL, QUICK, KISS and RACEFLIGHT, returning rad/s; axis 0 is roll, 1 pitch, 2 yaw. `thrCurve()` applies throttle mid, expo and limit. There are three rate profiles in `S.rprof`, and `S.rpi` is the active one.
3. **Renderer.** Three.js with an UnrealBloom glow pass and ACES tone mapping.
4. **Arena.** `contour()` traces the rounded floor plan and `band()` builds the curved ramp and glass walls from the profile in `prof`. The goal mouths are cut out. The stadium crowd, light towers and stars come after that.
5. **Physics.** The arena collision shape is a signed distance function, `sdf()`. It is the rounded arena combined with the goal boxes, which extend into the field so the mouth stays open. `arena()` resolves sphere collisions with bounce and friction. `ballPhys()` moves the ball.
6. **Drones.** `Drone.step()` is the acro flight model. Sticks set target body rates and the drone eases toward them over `TAU`. Thrust acts along the drone's up axis, plus gravity, drag and boost.
7. **Attitude controller.** `attitude()` turns a target up/forward direction into body rates. Bots and Angle mode use it.
8. **Input.** Gamepad or radio through the browser's Gamepad API. `S.cal` stores the calibrated axis, centre and signed range for throttle, yaw, pitch and roll, and keyboard input is mixed in.
9. **Bots.** `predict()` simulates the ball 4 s ahead and `intercept()` finds the earliest point a bot can reach. `think()` handles attack, keep, mid and boost roles, `assignRoles()` reassigns them every ~0.4 s, and `botControl()` is a PD position controller feeding `attitude()`. `DIFF` holds the four skill levels.
10. **Game state.** Kickoff, play, goal and end states, slots, demolitions and the boost pads.
11. **Online play.** The host simulates the ball, score and bots. Each pilot flies their own drone locally and sends position, attitude and velocity about 30 times a second, plus a sequence-numbered ball-hit message the host acknowledges. On claude.ai this runs over the artifact `room` channel. Outside claude.ai, `p2pRoom()` provides the same calls over PeerJS/WebRTC, with the host relaying to everyone. Slot keys are `h` for the host, `bTI` for bots and a peer label for each human.
12. **Mod panel.** The Rates tab works like Betaflight Configurator, including CLI import and export. The Physics tab has 25 sliders defined in `MODS`, with presets and export/import. In online games the host's physics settings apply to everyone.

## Gotchas
- The page relies on the CSS rule `[hidden]{display:none!important}`. Keep it.
- Anything received from other players is untrusted. Validate the numbers and set names with `textContent`.
- After editing, check that the script parses, for example by extracting the module script and running `node --check`.
