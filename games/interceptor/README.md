# Drone League: Interceptor

Fly a Ukrainian-style tail-sitter interceptor drone and run down Shahed-136 and jet Geran-3 attack drones before they reach the substation, the fuel depot and the apartment blocks.

## How to play

- Open the launcher (see the [main README](../../README.md#how-to-play): double-click `Play Drone League.bat` on Windows, or use the GitHub Pages link) and pick **Interceptor**.
- Pick a mode on the start menu: **Classic** (the game described below) or **Zombies** (see [Zombies mode](#zombies-mode)).
- Press **Defend** to start. You sit on the launch mat at the forward position nearest the most urgent track, motors off.

## Controls

| Key | Action |
| --- | --- |
| W / S | Throttle up / down (released = hover; idle on the mat until you first press W) |
| A / D | Yaw |
| Arrow keys | Pitch / roll |
| L | Camera tilt switch: 90° for cruise, level for take-off and hover |
| H | Thermal camera switch (white-hot) |
| F or click | Detonate (the proximity fuse also fires on its own) |
| G | Midcourse guidance on / off |
| N | Next track (otherwise guidance takes the most urgent one) |
| V | Radar range 2 / 5 / 10 km |
| C | Camera: FPV, chase, threat cam |
| M | Acro / Angle mode (keyboard players: try Angle) |
| R | Fresh interceptor on the mat |
| Esc | Menu · T mod panel |

**RC radio or sim dongle:** plug it in by USB, set it to USB Joystick (HID), move a stick, then press **Calibrate controller** in the menu. An Xbox controller works straight away too (RT detonates). Detonate, camera tilt, thermal, guidance and next track can each be mapped to a radio switch or button under the controller settings: press **Assign switches** and flip each switch when it names the function (any key skips one), or press **Learn** next to a single one. A switch that only sends part of its range, or the middle of a 3-position switch, is learned at the position you flip it to. If a switch doesn't move any of the axis bars at all, the radio isn't sending it over USB: put it on a channel from 5 to 8 in the radio's mixer. Throttle is full range by default.

## How to intercept

1. Take off vertically with the camera level, climb, then flip the camera to 90° (L) and pitch over to about 85°. It flies like a dart, where the nose points: about 360 km/h level at full throttle.
2. Each wave is one piston Shahed-136, then a jet Geran-3 a little later. Use the radar scope (bottom right) to head for the amber track, the most urgent one.
3. Get behind it. The warhead is a small fragmentation charge: a direct hit (under about 1 m) always kills, about 3 m from the tail is roughly a coin toss, and past 6 m it does nothing. The proximity fuse fires at closest approach within 6 m but has about 15 ms of delay, so at high closing speed it bursts past the target and head-on passes need a direct hit. KILL R on the track box is the 50% kill distance at your current closing speed. A near miss can leave it damaged: smoking, slower, sinking, and sometimes it fails on its own. A close hit can set off its own warhead. Fly through the small circle drawn behind the target.
4. Trees and houses are solid. A hit above 12 m/s is a crash. The air isn't perfectly smooth: light turbulence (a bit more in wind and in a Shahed's wake), small gusts, slightly softer roll and pitch at full throttle, and the fins pull the nose into the airflow. It's a heavy airframe: the motors and rates take a moment to respond and it carries its momentum. The 12S pack sags under load like a real LiPo (the OSD shows volts and amps): a full-throttle punch drops it about 0.5 V per cell, it recovers when you back off, and thrust falls with it, more so as the pack drains.
5. Midcourse guidance (on by default) puts a cyan PIP diamond on the feed and the radar: fly it to come out behind the selected track. The OSD shows time to go and steer / climb cues. Inside 1.5 km it hands over to TERMINAL and you fly it by eye.
6. The video link fades with range from your launch position and drops when terrain blocks it. Watch LQ% on the OSD and climb to get the picture back.
7. Thermal (H) makes the engines glow white, which helps spot a Shahed from behind.

Settings live in your browser (localStorage key `dl-interceptor`). Your radio calibration, rates, flight mode and FOV are shared with Drone League; the camera tilt stays separate (90° here, 30° on the League quad).

## Zombies mode

Endless waves that keep growing. You fly the same interceptor with the same warhead, fuse, guidance, radar and battery as Classic; between waves you spend what you earned on helpers and perks. Pick **Zombies** on the start menu and press **Hold the line**.

**The loop.** Each wave has a threat budget that grows every round, spent on raids from several map edges (the base screen shows where the next one comes from). The defended sites have hit points; their sum is **Defense Integrity** at the top of the HUD. Anything that gets through damages its site by type. At 0 integrity the defence collapses: the game-over screen shows the wave you reached, kills (yours and the helpers'), money earned and your best run. From wave 10 a **command bunker** on the radar pad joins as a fourth site.

**Money.** Every intercept pays by enemy type (helpers earn a quarter of that). Your kills in a row build a streak multiplier (up to ×2), a kill within 600 m of its target pays a 50% **clutch** bonus, and several in one burst pay a multi-kill bonus. Clearing a wave pays a bonus, more for a perfect one with no damage.

**Base screen** (between waves, no timer): an overview map (sites with HP rings, placement slots, your defences and their range, red arrows for the next wave's approach), and three tabs. **Shop**: four random cards (helpers and perks), with a paid reroll. **Armory**: upgrade or sell anything you own. **Sites**: repair damage (paid; a destroyed site stays destroyed). Underneath is the next wave's forecast, with a note on any new enemy type. Press **Start wave** when ready. Keys: arrows move, Enter / Space choose, 1-3 tabs, C start; gamepad D-pad, A, B (cancel placement), LB / RB tabs, Y start. New helpers appear on their slots when the wave starts.

**Track colours.** Red = free, **yellow = a helper has claimed it** (pick another), white ring = your selected track. If the helper misses or is lost, the track goes red again. The radar shows helper shots as cyan dots with a thin yellow line to their claim. Auto-selection (and N) prefers free tracks you can actually stop.

**Enemies.** One hit kills, except armor: a direct hit always kills; a proximity burst uses the Classic kill model.

| From wave | Enemy | Notes |
|---|---|---|
| 1 | Shahed-136, Geran-3 jet | As in Classic |
| 5 | Gerbera decoy | Harmless, passes for a Shahed on radar until you get close (or use thermal/optics); soaks up helpers |
| 10, 20, 30… | Mothership (boss) | Big, slow carrier; launches FPV swarms until destroyed; loses a stage per hit |
| 11 | FPV swarm | Many tiny quads, low and erratic; one burst can take several |
| 15 | Armored heavy | A proximity burst only damages it; needs a direct hit (or Mark for helpers) |
| 20 | Cruise missile | Low, very fast, terrain-following; detected far out |
| 25 | Ballistic missile | Very fast, steep, from far beyond the map; only a dome or a direct hit stops it |
| 30 | Hypersonic glider | Only Golden Dome (or a direct hit) |
| 40 | ICBM warhead | Golden Dome only, in practice |

The fast threats start tens to hundreds of km out: early warning shows them at once, the radar has 25 / 100 / 250 km ranges in Zombies (V), and the HUD and the FPV overlay count down to their predicted impact points. Sit on a fast track's line and you can still score a direct hit.

**Helpers** (placed on slots around the sites, the radar pad and the forward positions):

| Helper | Price | Good against | Useless against |
|---|---|---|---|
| Interceptor drone rack | $700 | drones of all kinds; upgrade Mk I→V | ballistic, hypersonic, ICBM |
| Flak mortar | $450 | swarms, Shaheds, decoys | jets, missiles |
| EW jammer | $1,100 | spoofs Shaheds and heavies into empty fields | FPV swarms (fibre-guided), missiles |
| Gepard gun | $1,600 | drones, jets, cruise missiles | ballistic and faster |
| SAM battery | $2,800 | anything up to cruise missiles, ignores armor | wasted on swarms and decoys |
| Iron Dome | $4,200 | ballistic and cruise missiles | hypersonic, ICBM |
| Golden Dome | $9,000 | hypersonic, ICBM (and last-ditch ballistic) | everything else |

Drone rack tiers set the kill chance of a drone that reaches its target: Mk I 30%, Mk II 50%, Mk III 65%, Mk IV 80%, Mk V 90% (against a Shahed; other kinds scale down). Mk V seekers ignore decoys.

**Perks** (yours; the active ones get charges every wave):

| Perk | Key / pad | What it does | Prices per level |
|---|---|---|---|
| Freeze | Q / D-pad left | Slows the most dangerous track by 50% for 6-8 s | $900, $800, $1,200 |
| Mark | E / D-pad right | Marks your selected track: helper hits on it count double (two kill rolls, near misses kill, armor ignored) and helpers go for it first | $1,000, $900, $1,400 |
| Airstrike | X / D-pad up | Clears the densest cluster within 260 m (a boss loses a stage) | $1,800, $1,600 |
| Long-range radar | | Detection ×1.3 / ×1.6 / ×2 | $500, $800, $1,200 |
| Optics | | Lead cross, then thermal through cloud, then decoy IFF | $600, $700, $900 |
| Fast relaunch | | Next interceptor in 1.5 s, then 0.9 s | $500, $900 |
| Bigger warhead | | Kill radius +1 / +2 / +3 m | $700, $1,100, $1,600 |
| Better battery | | +25% capacity and 25% less sag per level | $500, $900 |
| Foreign Aid | | Repairs cost 30% less | $1,200 |

**Feel.** The battlefield reacts.
- **Your kills:** a short hit-stop and slow-mo, with the sound muffled. The dead-cam then becomes a kill cam that follows the wreck down. A big call names the kill: SHAHED DOWN, DOUBLE KILL, CLUTCH SAVE or MOTHERSHIP DESTROYED.
- **Explosions:** a shockwave ring, a dust ring when near the ground, burning debris, and black smoke left hanging in the sky. Their sound reaches you at the speed of sound and gets duller with distance.
- **Fires:** wrecks and impacts keep burning, with smoke columns that drift with the wind for about a minute.
- **Each wave:** it opens with an air-raid siren and a radio call. The radio (subtitled, under a garbled voice) calls each raid by direction, launches, hits on the sites and the all-clear.
- **The front:** artillery flickers and rumbles on the horizon, and far-off AA tracer climbs into the sky.
- **Helpers:** you hear them fire.
- **Close calls:** a close pass whooshes, and a hit on a site flashes the screen edges red.
- **Score:** a code-built score builds with the number of tracks and how close they are to impact. **B** turns it on or off.
- **End of wave:** a card with up to three stars (held, no damage, you pulled your weight) and medals.

**Performance.** Enemies, shots and tracers are pooled and drawn instanced, so a late wave with 100+ tracks costs about the same as Classic. If frames stay slow for a few seconds in Zombies, trees stop casting shadows (Classic is never changed).

**Code.** `zombies.js` (director, money, HUD, hooks), `zdata.js` (every number: enemies, prices, helper levels), `zenemy.js` (instanced enemies, movers, boss, far-field terrain), `zdef.js` (slots, helpers, shots), `zperk.js` (perks), `zbase.js` (base screen), `zombies.css`, `zfx.js` (game feel: time scale, kill cam, explosions, fires, smoke, the front; it wraps the Z hooks), `zaudio.js` (all Zombies sound and the score), `zannounce.js` + `zfx.css` (announcer, radio, wave card). `interceptor.js` only calls them through one-line hooks behind `Z.on`. Headless tests: `node tools/zombies-test.mjs [--tiers N] [--balance] [--only]`, screenshots: `node tools/zombies-shots.mjs OUTDIR [kinds] [chaos] [base]`, frame times: `node tools/zombies-perf.mjs`, game-feel frame sequences and checks: `node tools/zombies-fx.mjs OUTDIR`.
