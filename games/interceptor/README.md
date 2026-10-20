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

Endless waves that keep growing. You fly the same interceptor with the same warhead and radar as Classic (and a bigger battery, see Lock-on and battery below); between waves you spend what you earned on helpers and perks. Pick **Zombies** on the start menu, pick a difficulty and press **Hold the line**.

**Difficulty.** The four difficulties differ mostly in how the raids fly, not just their size:
- **Easy**: smaller waves (×0.6), +35% money, sites +30% hit points, and every new enemy type arrives 4 waves later than on Normal. Relaxed: a casual pilot goes deep.
- **Normal**: the intended game, generous early and hard late.
- **Hard**: waves only ×1.1 and −15% money, but new types come 3 waves early (and Iron Dome / Golden Dome with them), and the raids use tactics: they are timed so the edges and the fast kinds arrive together (time on target), Shahed raids bring decoy escorts, a third of the tracks go for your weakest site (fewest defences near it, least hit points), and jets, heavies, cruise missiles, swarms and the boss jink: they break away from your interceptor and dodge 15% of what your helper drones and guns would have hit.
- **Nightmare**: waves ×1.2, −30% money, sites ×0.9, new types 6 waves early, every raid timed to arrive at once, more escorts, 60% of tracks hunt the weakest site, 30% switch to another site on the way in (feints), and everything but the fast missiles jinks (25% off your helpers' hits).

The base screen's forecast lists the next wave's tactics. Your best wave is saved per difficulty. The bot pilots' benchmark (below) shows how far each skill level gets on each difficulty.

**Detonating.** In Zombies you time the warhead yourself: press detonate (F, click, or the mapped button) when you judge you're close. The kill chance is Classic's warhead model: certain well inside the kill radius, then falling off smoothly with the miss distance at that moment (closing speed adds the fuse lag, so a head-on pass needs to be tighter). A contact hit always fires. Armor still needs a near-direct hit. The screen reads out how you did ("HIT — 2.1 m", "DAMAGED — 4.0 m", "MISSED BY 7 m") with a result sound. The **Proximity fuse** perk ($800) brings back Classic's automatic fuse if you'd rather not time it.

**The loop.** Each wave has a threat budget that grows every round, spent on raids from several map edges (the base screen shows where the next one comes from). The defended sites have hit points; their sum is **Defense Integrity** at the top of the HUD. Anything that gets through damages its site by type. At 0 integrity the defence collapses: the game-over screen shows the wave you reached, kills (yours and the helpers'), money earned and your best run. From wave 10 a **command bunker** on the radar pad joins as a fourth site.

**Money.** You start with $1,500 on Normal ($2,500 Easy, $1,200 Hard, $1,000 Nightmare; your doctrine can change it). Every intercept pays by enemy type; a helper's kill pays 70% of what the same kill pays you. Early waves pay extra so defences go up fast: ×2.2 on wave 1, tapering to normal by wave 10. Your kills in a row build a streak multiplier (up to ×2), a kill within 600 m of its target pays a 50% **clutch** bonus, and several in one burst pay a multi-kill bonus. Clearing a wave pays a bonus, more for a perfect one with no damage.

**Base screen** (between waves, no timer): an overview map (sites with HP rings, placement slots, positions you can still open as small **+** squares, your defences and their range, red arrows for the next wave's approach), a line with your doctrine, the upkeep due and anything short of ammo, and three tabs. **Shop**: everything you can buy, grouped as Helpers, Supplies for the next wave, Active perks and Passive perks; items not unlocked yet show the wave they arrive, and kit items (see Doctrine & unlocks) show a KIT tag. Helpers can be bought once per free position, perks up to their top level, supplies once per wave. **Armory**: upgrade, refit, move or sell anything you own. **Base**: repair or rebuild the sites, open more positions, and see the upkeep. Underneath is the next wave's forecast, with a note on any new enemy type and the difficulty's tactics. Press **Start wave** when ready. Keys: arrows move, Enter / Space choose, 1-3 tabs, C start; gamepad D-pad, A, B (cancel placement), LB / RB tabs, Y start. New helpers appear on their slots when the wave starts.

**Late-game spending.** The 14 standard positions fill by about wave 8-10. After that the money goes into choices:
- **More positions** (Base tab, or click a **+** on the map): a rear position at each site, a second pad at each forward position, and two outposts north of the river (22 positions in all). Each one you open costs more: $1,800, $2,500, $3,500, $4,900, $6,900... Forward pads and outposts engage first but cost double upkeep.
- **Upkeep**: from wave 11 every defence costs 2% of what you spent on it per wave (4% on a forward pad or outpost), taken when a wave is cleared. If the purse can't cover it, the dearest defences go into the next wave short of ammo (half their drones or missiles). Selling what no longer earns its keep is a real option.
- **Armory refits**: one per defence, each a trade, and fitting the other one costs its price again:

| Defence | Refit A | Refit B |
|---|---|---|
| Drone rack | Swarm seekers ($900): kills swarms like Shaheds, splashes more of them; 30% worse against jets and cruise | Long-range drones ($1,100): 4.5 km reach; one drone fewer |
| Flak mortar | Heavy shells ($700): reaches jets and cruise missiles up to 2 km high; reloads 40% slower | Proximity fuzes ($800): +35% kill chance; 1.3 km reach instead of 1.8 |
| Gepard gun | AP rounds ($1,000): armored heavies go down to an ordinary hit; 40% worse against swarms | Fire-control radar ($1,200): +30% reach; a burst every 1.6 s instead of 1.1 |
| SAM battery | Ready racks ($1,500): +3 missiles a wave; 7 s between launches | Long-range seekers ($1,400): 14 km reach; 78% kill chance instead of 90% |
| EW jammer | Wideband ($900): spoofs jets fully and cruise missiles half the time; bubble 30% smaller | Focused emitter ($800): +40% spoof chance; bubble 35% smaller |
| Iron Dome | Counter-drone mode ($1,600): fires at drones whenever idle; 4 interceptors fewer | Ballistic priority ($1,600): +4 interceptors; never fires at drones |

- **Moving** a defence to another open position costs 15% of what it cost (at least $250) instead of selling it at half price; it redeploys when the wave starts.
- **Rebuilding** a destroyed site brings it back at 40% of its hit points: $3,000, then $5,000, $7,000...
- **Supplies** for the next wave only, priced by what they cover: Reserve drones ($150 per rack: two extra drones ready), Missile reloads ($350 per launcher: +2 missiles, +1 for Golden Dome), Sandbags ($300 per site: 25% less site damage), Overtime crews ($100 per helper: everything reloads 30% faster).

**Track colours.** Red = free, **yellow = a helper has claimed it** (pick another), white ring = your selected track. If the helper misses or is lost, the track goes red again. The radar shows helper shots as cyan dots with a thin yellow line to their claim. Auto-selection (and N) prefers free tracks you can actually stop. Zombies has no free aiming aids: the midcourse PIP diamond, its radar line and the pursuit circle are Classic only, so you judge the intercept yourself, or earn the lock-on's intercept path (below).

**Enemies.** One hit kills, except armor: a direct hit always kills; a proximity burst uses the Classic kill model.

| From wave | Enemy | Notes |
|---|---|---|
| 1 | Shahed-136, Geran-3 jet | As in Classic |
| 5 | Gerbera decoy | Harmless, passes for a Shahed on radar until you get close (or use thermal/optics); soaks up helpers |
| 10, 20, 30… | Mothership (boss) | Big, slow carrier; launches FPV swarms until destroyed; loses a stage per hit |
| 11 | FPV swarm | Many tiny quads, low and erratic; one burst can take several |
| 15 | Armored heavy | A proximity burst only damages it; needs a direct hit (or Mark for helpers) |
| 20 | Cruise missile | Low, very fast, terrain-following; detected far out |
| 25 | Ballistic missile | Very fast, steep, from far beyond the map; only the kill chain (boost battery, Iron / Golden Dome, point defence) or a direct hit stops it |
| 30 | Hypersonic glider | Kill chain: boost battery, Golden Dome, point defence (or a direct hit) |
| 40 | ICBM warhead | Kill chain: boost battery, Golden Dome, point defence |

The fast threats start tens to hundreds of km out, the radar has 25 / 100 / 250 km ranges in Zombies (V), and the HUD and the FPV overlay count down to their predicted impact points. Sit on a fast track's line and you can still score a direct hit.

**Kill chain** (`zchain.js`, the base screen's **Kill chain** tab, key 4; from two waves before the ballistic missiles). Every ballistic, hypersonic and ICBM track passes three layers, and each layer gets its own chance, so the late game is about buying and placing layers:

| Layer | What | Price | Numbers |
|---|---|---|---|
| Boost phase | A forward battery at a launch edge (West, North, East; one each). One shot at every fast missile launched from its edge, about 5 s after launch. It also sees those launches, so they get full warning. The base screen shows how many launches each edge has next wave; moving a battery costs $1,200 | $6,000, level 2 $4,500 | 1 shot a wave: ballistic 40%, hypersonic 20%, ICBM 25%; level 2: 2 shots, 50 / 27 / 32% |
| Midcourse | Iron Dome (ballistic) and Golden Dome as before, plus a stock of space interceptors: when a Golden Dome's magazine for the wave is empty it reloads from the stock (unfired rounds go back) | $800 each, up to 4 per Golden Dome | Golden Dome 92-94% a shot |
| Terminal | Point defence at one site: a laser turret's last-chance shot at each fast missile within 4 km of the site, and at cruise missiles and heavies within 1.5 km; it keeps its last charge for a fast missile when one is coming | $4,500, level 2 $4,000 | 1 charge a wave: ballistic 35%, hypersonic 22%, ICBM 15%, cruise 60%; level 2: 2 charges, 45 / 30 / 22 / 70% |

Each fast track's chain shows on the alert panel ("BOOST ✗ → MID ✓ pending → TERMINAL ready"), in its track box, as three coloured squares by its impact cross on the radar and as B / M / T under the impact marker: green is a layer at work or ready, red ✗ is a gap or a miss.

**Early warning** (`zwarn.js`). A fast missile shows up (radar, domes, alert) 20 s before impact, +8 s per Long-range radar level and +15 s per level of the early-warning radar (Kill chain tab, $2,200 and $3,600), 30% less in a campaign sector with the blind modifier; a boost battery at its edge sees it launch. Then the alert goes up on the right ("LAUNCH DETECTED — HYPERSONIC — FUEL DEPOT — 45 s") and you can act on it mid-flight: **J** Harden the target site (50% less damage from every hit on it until that missile is gone; $200 + $20 per wave, then 60 s before the next), **K** Evacuate it (30% less damage for the rest of the wave, but its share of the wave-clear bonus is lost this wave and the next), **U** Decoy (from a stock bought in the Kill chain tab, $500, up to 6: 40% ballistic, 30% hypersonic, 20% ICBM chance the warhead goes for the dummy site; needs 5 s). The actions apply to your selected track if it is a fast one, else to the most urgent alert. Gamepad: Back picks an action, L3 does it (keys 1-5 belong to the personal swarm); the buttons on the panel can be clicked too. In co-op any pilot can act; the host checks and applies it. The game-over screen names the final blow.

For the sorties work: `Z.fastPlan()` gives the next wave's planned fast launches per sector and `Z.cutFast(sector, n, kind)` removes some (zombies.js).

**Helpers** (placed on slots around the sites, the radar pad and the forward positions):

| Helper | Price | Good against | Useless against |
|---|---|---|---|
| Interceptor drone rack | $700 | drones of all kinds; upgrade Mk I→V | ballistic, hypersonic, ICBM |
| Flak mortar | $450 | swarms, Shaheds, decoys | jets, missiles |
| EW jammer | $1,100 | spoofs Shaheds and heavies into empty fields (no damage to the site) | FPV swarms (fibre-guided), missiles |
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
| Optics | | Thermal through cloud and fog, then decoy IFF, then target site and time to impact on every track box; each level also locks on faster (×0.8 / ×0.65 / ×0.5) | $600, $700, $900 |
| Fast relaunch | | Next interceptor in 1.5 s, then 0.9 s | $500, $900 |
| Bigger warhead | | Kill radius +1 / +2 / +3 m | $700, $1,100, $1,600 |
| Better battery | | Twice the pack: double the flight time and range, and 25% less sag | $900 |
| Foreign Aid | | Repairs cost 30% less | $1,200 |
| Proximity fuse | automatic | Your warhead fires by itself at closest approach inside 6 m (Classic's fuse) | $800 |
| Rocket Assist | automatic | Each interceptor gets a 15 s rocket burst once it lifts off the mat: about 3× normal top speed, same stick rates; flame, smoke trail, roar and a HUD burn bar | $1,500 |
| Personal swarm | 1-5 / A, B, X, R3, RB | From wave 12. A swarm of close-support drones flies with you: 4 / 6 / 8 / 10 / 12 drones by level (see Personal swarm below) | $2,400, $1,500, $1,800, $2,200, $2,600 |
| Swarm drones Mk | | From wave 15. Mk II: kill chance 45% → 58% a pass, lost on 30% of passes instead of 40%, faster. Mk III: 70%, 20%, and 2 strike charges | $2,000, $3,000 |

**Personal swarm** (`zswarm.js`, numbers in `zswdata.js`). A late-game perk line: close-support drones that fly around you like a cloud and do what you tell them.
- **One set per wave.** The swarm deploys around you when the wave starts. Drones lost during the wave stay lost until the next one: a crash or a relaunch does not bring them back (they loiter where you went down and rejoin your next interceptor).
- **Cost.** $30 upkeep per drone each wave, paid from the purse when it deploys (the doctrine's upkeep factor applies; if the purse is short, fewer drones fly). Every drone in the air draws 3 A from your pack, so a big swarm shortens your flight. Strike charges are limited (1 a wave, 2 with Mk III).
- **What a pass does.** A drone that reaches a track rolls its kill chance (Mk I 45%, Mk II 58%, Mk III 70% against a Shahed, scaled by kind like a helper drone rack's; armor and Mark work as for helpers) and is lost on 40 / 30 / 20% of passes. A swarm kill is a helper kill (70% pay). It can't touch ballistic, hypersonic or ICBM tracks: the domes still matter.
- **Formations** (5 or RB cycles; the panel bottom left shows a diagram):

| Formation | Shape | Tactics |
|---|---|---|
| CLOUD | A loose cloud orbiting you | All-round self-defence (320 m), drones lost 15% less often |
| WEDGE | A V out in front | Hits hardest: +25% kill chance on attacks and strikes; reaches 520 m ahead |
| LINE | Line abreast | A wide sweep (300 m); a pass on an FPV swarm can take a neighbour too |
| SCREEN | A curved wall 55 m out between you and the threat axis | Intercepts the most: self-defence out to 520 m; 10% weaker passes |
| COLUMN | A file trailing you | Keeps up under Rocket Assist, draws 40% less from your pack, guards your six; shortest reach (180 m) |

- **Commands** (keys 1-4, pad A / B / X / R3):
  - **1 / A: Attack my lock.** Every drone goes after the track you have locked (see Lock-on), one pass each, then they come back. Without a lock: "NO LOCK".
  - **2 / B: Screen.** The swarm intercepts anything within 900 m of you or within 300 m of your formation axis up to 1.8 km ahead, and every drone may peel off. Press again for escort, the default: self-defence inside the formation's reach, with at most half the swarm away at once.
  - **3 / X: Strike.** Spends a charge: rocket boosters (330 m/s, orange flames) take the whole swarm to the densest cloud of threats within 4.5 km (in front of you counts double), one pass each, and the survivors fly back. If a ground target is under your reticle (sorties), they go for that instead.
  - **4 / R3: Form up.** Recall everyone into formation, escort mode.
- **Co-op.** Each pilot's swarm is their own. Only the formation, the command, the attack target and strike requests go over the wire; every screen flies every swarm from those, the host rolls the passes and sends each pilot's drone count and charges, and the others trim their copies to match.
- **For sorties** (`zombies-sorties`): define `Z.groundTargets = () => [{id, p: {x, y, z}, r, alive, hit(n, pilotKey)}]` and the strike command can take a ground target (each drone that reaches it calls `hit(1)` on the host); `Z.swarm.strike(target)` sends the swarm at a target directly. `Z.swarm` also has `count`, `charges`, `form`, `mode`, `command(name)` and `setForm(id)`.

**Lock-on** (`zlock.js`, numbers in `zswdata.js` LOCK). An earned aim aid. Keep a track inside the small dashed circle (your sights) and a lock builds: an amber ring closes on the track while a tone beeps faster and higher. Your sights are the interceptor's own: in FPV the camera's view (the circle at the centre), in the chase and threat views the boresight down the nose (the circle is drawn where the nose points), and flying straight at a track counts too (at 40-70 m/s the dart flies 10-20° nose-high, so with the camera tilted up a track you are running down sits a little below the circle). A close track locks in about 1.4 s in clear air, longer the farther it is (up to 3.5 km). At full lock the tone goes steady, the track becomes your selected track, and a cyan intercept path curves from your flight path onto the point where you would meet it, with the time to intercept (an arrow on the screen edge when it is off screen). A full lock holds while the track stays inside the seeker's 30° field (wider in the last 40 m); look and fly away from it for 1.5 s, or turn about, and it drops. A track whose lock you just lost locks again three times faster for 4 s. Fog, haze, rain and night slow the lock (thermal helps), so does jamming near a Mothership; Optics speeds it up. On Hard and Nightmare a locked evader jinks now and then, and a jink can break the lock. The swarm's attack command goes after your lock.

**Battery** (`zbatt.js`). Zombies flies a bigger pack than Classic: 1.6× (25,600 mAh against Classic's 16,000, which is unchanged), about 6.8 minutes and 40 km flat out instead of 4.2 minutes and 25 km. Better battery doubles it (51,200 mAh, 13.6 minutes, about 80 km). The top bar shows the charge left with the flight time and range you have at full throttle (with your swarm's draw).

**Doctrine & unlocks** (`zmeta.js`). Progress between runs adds options, not power. On the Zombies start menu, **Doctrine & unlocks** shows your loadout, what is unlocked and the goal for everything that isn't. Before a run you pick **one doctrine** (it shapes the base) and **up to two kit picks** (new helpers or perks in your shop). Every unlock is a sidegrade with a cost, so a fully unlocked pilot has more ways to play, not a stronger base: the bot benchmark checks that the best loadout doesn't reach meaningfully further than a fresh one.

| Doctrine | Strength | Weakness | Unlocked by |
|---|---|---|---|
| Standard | The base as issued | None | (always) |
| Fortress | Sites +20% hit points, repairs 25% cheaper | All income −15%; no forward positions or outposts (11 positions, 14 at most) | Clear wave 10 |
| Forward Defense | Both outposts and the second forward pads open from the start (19 positions); forward upkeep halved | Starting cash −40%; no rear positions at the sites | Clear wave 15 without buying a repair (Normal or harder) |
| Air Mobile | Rocket Assist and Fast relaunch half price, Rocket Assist from wave 1; your kills pay +20% | No radar-pad positions or outposts (12 positions, 16 at most); expansions cost 50% more | Clear wave 20 on Hard or Nightmare |
| Partisan | Your kills pay +50%, streak up to ×3 | Helper kills pay 40% instead of 70%; wave-clear bonuses −30% | Clear wave 15 on Nightmare |
| Quartermaster | No upkeep; supplies 40% cheaper | Upgrades and refits +25%; selling refunds a quarter | Three perfect waves in a row from wave 10 on |

| Kit | What it is | The catch | Unlocked by |
|---|---|---|---|
| Light rack (helper, $400) | A cheap drone rack for early coverage | 2 drones, 2.2 km, Mk III at most, no refits | From wave 8 on, clear a wave where the helpers make every kill and the sites lose under 10% |
| Heavy flak (helper, $900) | A mortar that reaches jets and cruise missiles up to 2 km high | Slow reload, half as good against swarms, no upgrades | Clear wave 20 with 8 or fewer defences |
| MANPADS team (helper, $1,200) | 3 heat-seeking missiles a wave, 4.5 km, moves for free | Blind to swarms, fooled by decoys half the time, no upgrades | A streak of 8 kills |
| Lure beacon (active perk, Z / D-pad down, $1,200) | Up to 6 drones near your interceptor turn toward a beacon under it for 8 s; any that reach it hit an empty field | Missiles and the Mothership ignore it; one charge a wave | Destroy a Mothership with your own detonation, without the Proximity fuse |
| Salvage crews (passive perk, $600) | Your kills within 1.2 km of a site pay +40% | Your kills more than 3 km from every site pay −30% | Five clutch saves in one wave |

Goals are tracked per difficulty (the letters next to each goal show where you have met it); a goal met on any allowed difficulty unlocks its option. The game-over screen lists the goals met in that run. Saves (`S.zmeta`, `S.zload`) are checked on every read, so a corrupt or hand-edited save falls back to Standard with no kit.

**Campaign** (`zcampaign.js`, `zcampaign.css`). The Zombies start menu has a **Campaign** card next to the difficulty; the play button is **Quick defence** (one endless run, as before). The campaign map is a front line of 12 sectors running from our lines (south) to the enemy's launch complex (north). Each sector is a Zombies run with its own objective (hold N waves), modifiers, weather tendency and reward. The map shows the regions (blue = held, amber = on the front, red hatch = enemy-held), the front line between them, each sector's waves to hold and modifier icons, and red chevrons for enemy pressure. Select a sector for its briefing (objective, modifiers, reward, loadout) and press **Continue**. Keys: arrows move between sectors, Enter continues, Esc goes back.

| Sector | Hold | Modifiers | Reward |
|---|---|---|---|
| Old Mill | 8 | Clear skies | Reserve: field repair crew |
| River Crossing | 10 | Night-heavy | Relic: War chest |
| Grain Silos | 10 | Swarm-heavy (swarms from wave 3) | Relic: Drill sergeant |
| Rail Junction | 12 | Jet-heavy, +2 enemy launch sites (with sorties; otherwise waves +10%) | Reserve: engineer platoon |
| Hospital Hill | 12 | Fragile hospital (−40% hp; it falls, the sector is lost), storm season | Relic: Field engineers |
| Power Station | 12 | Armored column (heavies from wave 6), income −15% | Relic: Sandbag stockpile |
| Quarry | 15 | Dust and fog, coordinated raids, waves +15% | Reserve: field repair crew |
| Airfield | 15 | Missile front (kinds 5 waves early), jet-heavy | Relic: Ace's scarf |
| Radar Ridge | 15 | Blind early warning (radar −30%), night-heavy, waves +10% | Relic: Early-warning net |
| The Dam | 18 | Swarm-heavy, storm season, coordinated raids, waves +10% | Reserve: engineer platoon |
| Factory Belt | 18 | Hypersonic every third wave from 9, no Golden Dome, armored column | Reserve: field repair crew |
| Launch Complex (capstone) | 20 | Missile front (8 early), coordinated raids, a Mothership every 5 waves, waves +8%, +2 launch sites (or another +10%) | Wins the campaign |

- **The front.** Sectors next to a held one (or our lines) are on the front. Winning holds the sector, puts its neighbours on the front and eases the pressure next door by one. Losing raises the **enemy pressure** on its unheld neighbours (per level: waves +8%, starting cash −10%; at most 2 levels). Nothing ever locks: a lost sector can be retried at once. The capstone opens once 7 sectors are held. Held sectors can be replayed for practice (no reward).
- **Carry-over** is small on purpose. **Relics** are trades and only one is equipped per sector: War chest (+$1,200 at the start, income −10%), Drill sergeant (overtime crews free every wave, helper kills −25%), Field engineers (repairs −35%, upgrades +15%), Sandbag stockpile (sandbags free every wave, sites −15% hp), Ace's scarf (your kills +25%, helper kills −20%), Early-warning net (radar +30%, wave-clear bonuses −25%). **Reserves** are one-offs, at most 3 banked, one committed per sector: a field repair crew (every site to full once, from the base screen; spent only if used) or an engineer platoon (one extra open position). Doctrine and kit are the ordinary unlocks, picked on the briefing.
- **Difficulty** is fixed per campaign (the Zombies difficulty selected when it starts; **New campaign…** wipes it and starts again on the current one). Sector numbers sit on top of it.
- **Co-op.** **Host in co-op** on the briefing hosts that sector; friends join with the code as usual. The host's campaign save is the one that moves; clients see the sector, its strip on the base screen and the result. From the result screen the host can open the map and launch the next sector for everyone.
- **Saves.** `S.zcamp` (versioned, `v: 1`) is validated on every read (`cleanCamp`): unknown ids, wrong types and out-of-range numbers are dropped and a newer version starts fresh. `tools/zombies-test.mjs --sections=campaign` covers the map, a win and a loss, the front moving, pressure, relics and reserves, save/load, corrupt saves and a 500-save fuzz. `tools/zombies-campaign-bench.mjs` has the bot pilots play every sector.
- **Hooks for other features.** Read the sector with `Z.cp.has(id)` and `Z.cp.n('launchSites')`. A modifier that drives another feature (`need`) shows only when that feature is in the build (`Z.feat[name]` or `Z[name]`); otherwise the sector gets its listed alternative.

**Leaderboard and bot pilots** (`zboard.js`, `zbench.json`). Six bot pilot levels, named after Drone League's: Rookie, Pro, All-Star, Champion, Grand Champion and Legend. Each is a skill profile (how often and how well it runs tracks down, flight quality against evading tracks, how fast it relaunches) and a strategy profile (how much of the purse it dares spend, how sound its shopping order is, upgrades, when it repairs, when it buys domes, whether it uses perks well, opens positions, refits, buys supplies, rebuilds, tries direct hits on fast missiles). The levels and their whole strategy live in `zbotbrain.js` (shared by the benchmark and the Bot Spectator below). `node tools/zombies-bench.mjs` plays every level on every difficulty from a fresh profile (Standard doctrine, no kit), several runs each, and writes the median wave and range to `zbench.json` with the date and game version; it fails if the ladder isn't monotonic (every level beats the one below on every difficulty, and every level does worse on each harder difficulty). The leaderboard on the game-over screen and the start menu starts with only the bots ("Rookie bot · Easy · wave 12") and adds your runs ("You · Normal · wave 14", best 20 kept). Entries are ranked by one score, wave × difficulty weight, where the weight is how much further the bots get on Normal than on that difficulty (from the benchmark), so a Nightmare wave counts like the Normal wave the same pilots would reach. The end screen says which bot your run beat on its difficulty and which one is next.

**Bot Spectator** (`zspectate.js`, `zbotfly.js`, `zbotbrain.js`). **Watch a bot** on the Zombies start menu: pick a bot level, a difficulty and, if you like, a campaign sector, doctrine and kit (every doctrine and kit is open to bots), then **Watch**. The bot plays the real game in the page: a bot run never touches your saves (no goals, no leaderboard entry, no best wave, no campaign progress).
- **It really flies.** `zbotfly.js` works out where it wants the dart to go each physics step and turns that into stick positions, through your own acro rates and throttle curve, plus the detonate press, the camera tilt switch (L), relaunch (R), next track (N) and the perk and swarm keys. It takes off from the mat, climbs, runs tracks down from their six (or meets fast ones on a collision course), presses detonate at the closest approach with its level's timing error, misses and goes round again, and can crash. It locks on by holding its sights on a track. It sits on a ballistic, hypersonic or ICBM line for a direct hit if its level knows how, and copes with Rocket Assist. Skill per level (`LEVELS[].fly`): reaction time, aim wander, detonate timing, how close it waits for, target choice, decoys, lock-on, line-sitting, relaunching.
- **The base screen plays visibly.** One shop step at a time, with the button highlighted and a caption saying why ("Buying Iron Dome: ballistic threats arrive in 2 waves", "Selling the flak mortar at … to make room for a SAM battery"). The strategy is `zbotbrain.js`, the same code the benchmark uses. Shop items it has never heard of (another branch's new weapons and defences) get a generic value against the next wave and are tried now and then (`tryNew`); the kill chain and launch alerts are used when the build has them; other features can register `hooks` (`shop`, `wave`).
- **Controls** (bar at the bottom): cameras **Chase**, **Bot FPV**, **Free cam** (WASD, Q/E down/up, drag to look, Shift faster), **Sites** (press again or V for the next site) and **Threat cam** (behind the bot's target), C cycles them; speed **1× 2× 4× 8×** (keys 1-4), **Pause** (Space) and **Step** (.) 0.1 s; **Tune** (K); **Stop**. Esc opens the menu. Under the score, the bot's level and what it is doing right now ("chasing T12 Shahed-136 · 1.8 km", "locking on T07 · 60%", "sitting on the line of T31 Ballistic missile · impact in 12 s", "screening with the swarm", "returning to mat").
- **Tuning panel.** Edit key numbers live: economy multipliers (all income, pilot and helper kill pay, wave-clear bonus, upkeep, upgrades, repairs, expansions), the difficulty's numbers, every helper's price and every perk's price factor, each enemy's speed, bounty, site damage and spawn weight (and extra Mothership stages), and each helper's kill chance. Prices and enemy numbers apply from the next purchase or spawn. **Export JSON** lists only what changed, **Import** applies such JSON, **Reset all** puts everything back; changes last until then or a page reload. Flight and warhead physics stay in the mod panel (a button opens it).
- **Report** (instead of the end screen): wave reached, the cause of death (which kind's hit did the last damage, and on which site), interceptors used (bursts, crashes, flat packs), detonations and pilot kills, time in the air, money over time (purse and money earned, a chart with wave ticks), kills by source (pilot, airstrike, swarm, each helper type, damaged tracks that failed later), and every purchase with its wave, cost and reason. **Watch again**, **Export JSON**, **Menu**.
- **Benchmark.** `node tools/zombies-bench.mjs --real` runs the same flying bots headless at sim speed (about 25× real time with `DL_NORENDER=1`) instead of the teleporting ones; it never writes `zbench.json`. Screenshots: `node tools/zombies-spectator-shots.mjs OUTDIR [level] [difficulty]`.

**Weather** (`zwx.js`). Every wave gets its own forecast, shown at the bottom of the base screen: clear, scattered cloud, golden hour, overcast, dusk, rain, fog, dust haze, snow, night (moon, stars, searchlights, site lamps, lit windows in the blocks and the villages) or a heavy storm with lightning. Wave 1 is always clear or golden hour; fog, haze, snow, night and storms come in from waves 4 to 6. From wave 3 some waves change part-way through (rain moving in, a storm building or easing, fog lifting, the sun going down), blended over about 35 s. Weather only changes what you see. Radar, the track list, the brackets and the guidance cue work the same in every weather, so bad weather pushes you onto the HUD but never hides a threat. At night a site's lamps go out one by one as it takes damage and its searchlight dies when it is destroyed (the radar pad's go with the command bunker); the blocks' windows go dark as they are hit and as the substation loses power, and the villages go dark with the substation. Under snow the roofs, yards and tree tops whiten as well as the fields. Thermal (H) is the counter to night and haze, and Optics level 2 still lets it see through cloud and fog. At night every track shows a dim red engine glow. Setting **Zombies weather** to *Use the Weather setting* in the menu keeps the menu's weather for every wave.

**Look** (`strela.js`). In Zombies the interceptor's body is styled as a 9K32 Strela-2 missile: an olive tube with the glass seeker dome, canards, clipped tail fins, bands and stencils. The props, hitbox and flight are unchanged. Classic keeps Riley's dart unless **Interceptor look (Classic)** is set to Strela-2. `node tools/zombies-look-shots.mjs OUTDIR [drone] [weather] [classic]` takes the look screenshots.

**Feel.** The battlefield reacts.
- **Your kills:** a short hit-stop and slow-mo, with the sound muffled. The dead-cam then becomes a kill cam that follows the wreck down. A big call names the kill: SHAHED DOWN, DOUBLE KILL, CLUTCH SAVE or MOTHERSHIP DESTROYED.
- **Explosions:** a shockwave ring, a dust ring when near the ground, burning debris, and black smoke left hanging in the sky. Their sound reaches you at the speed of sound and gets duller with distance.
- **Fires:** wrecks and impacts keep burning, with smoke columns that drift with the wind for about a minute.
- **Each wave:** it opens with an air-raid siren and a radio call. The radio (subtitled, under a garbled voice) calls each raid by direction, launches, hits on the sites and the all-clear.
- **The front:** artillery flickers and rumbles on the horizon, and far-off AA tracer climbs into the sky.
- **Helpers:** you hear and see them fire: muzzle flashes on the Gepard's barrels and the mortar, a flash and a puff of launch gas on the drone racks, and SAM / Iron Dome missiles leave their tubes with a flash and a backblast cloud, then climb out on a motor flame and a smoke trail.
- **Money:** a kill's money rises from the wreck and flies into the cash counter, which rolls up (with a chink) as it lands.
- **Cinematic cams:** a Mothership gets a short fly-by when it appears, and a ballistic, hypersonic or ICBM hit on a site cuts to an impact cam. Time crawls meanwhile, so nothing can happen to your interceptor, and any key, button or click skips it.
- **Close calls:** a close pass whooshes, and a hit on a site flashes the screen edges red.
- **Score:** a code-built score builds with the number of tracks and how close they are to impact. The music and effects volume are sliders in the menu (shown with Zombies picked); **B** is a quick music mute.
- **End of wave:** a card with up to three stars (held, no damage, you pulled your weight) and medals.

**Re-entry** (`zreentry.js`). The fast missiles' big moment. An ICBM warhead flies midcourse high above the air, then comes back in about 30 s before impact: a curved re-entry that starts shallow far out to one side and steepens into the final dive, so from the defended area its burning plasma streak climbs across the sky with a long trail and a smoke wake. The moment it enters, there is an alarm stinger, a sky flash and a rising rumble, the call **RE-ENTRY**, and a banner **RE-ENTRY — FUEL DEPOT — T-23 s** (an arrow at the screen edge points at it when it is out of view). The glow fades as it slows near the ground: the last kilometres come down at about 1000 m/s, so you see it for a moment but no pilot can catch it. A ballistic missile gets the lesser form 30 s out (amber banner, a short stinger). The **Golden Dome** answers: its ground station's uplink fires, and a kill vehicle drops out of orbit high over the defended area (over your interceptor if you're up) and runs head-on at the warhead, aiming to meet it around 28 km up. An intercept is a flash, a dark burst and burning debris, with the crack and rolling thunder arriving late with the distance; a miss means a second, lower shot if the magazine allows. The streaks and flashes are drawn on a sky shell inside the camera's range with sizes from the true distance, so they read from 100 km away; trails, glows and debris are pooled and capped and thinned by the performance governor. All the numbers (speeds, heights, times) are game values chosen for the spectacle.

**Long-range radar layers** (`zstratradar.js`). An inset next to the radar scope that unlocks as the threats grow and is announced the first time: **Continental** the wave the ballistic and hypersonic missiles arrive (25 on Normal, earlier on Hard and Nightmare), a 600 km map with the front, the launch areas, each fast track from its launch point to its impact, cruise missiles and Golden Dome kill vehicles; **Global** with the ICBMs (40 on Normal), a stylised globe with each ICBM's arc from its launch site over the pole through midcourse to re-entry, with its phase and time left. It shows itself while something it covers is up; **Y** cycles Auto / Continental / Global / Off. With the kill chain's early warning only the tracks it has picked up are drawn, a new alert flashes its launch point, and each track carries its kill chain squares.

**Threat sound** (`zthreatsfx.js`). Every incoming threat is heard where it is: Shaheds buzz, FPV quads whine, the jet Geran roars, cruise missiles hiss. Each voice is placed by distance (quieter and duller with it), panned, Doppler-shifted (theirs and your own speed) and heard late by the speed of sound, from where it was when the sound left it. Supersonic tracks (ballistic, hypersonic, ICBM, the Golden Dome's kill vehicles) are silent until their shock cone reaches you: you hear them after they pass, the crack of the sonic boom first, then the rumble and the roar of the wake. A close pass whooshes and shakes the picture. A voice budget keeps it cheap: the 8 loudest or nearest tracks get a voice (a swarm is one voice), at most 8 one-shots at a time. Everything goes through the Zombies effects volume, the slow-mo muffle and the compressor. `node tools/zombies-audio-levels.mjs` renders the sounds offline and checks their levels against the explosions and the music.

**Performance.** Enemies, shots and tracers are pooled and drawn instanced, so a late wave with 100+ tracks costs about the same as Classic. If frames stay slow for a few seconds in Zombies, trees stop casting shadows (Classic is never changed).

**Sim loop, interpolation, grid, stagger** (Classic and Zombies). The sim ticks at a fixed 120 Hz (the step the flight model and its goldens use; `engine/loop.js`), at most 12 ticks a frame; slow-mo and game speed scale the time fed in, never the tick. Each frame is drawn between the last two ticks (`engine/interp.js`): before every tick `api.interp` remembers where every registered body was, and for the length of one frame's drawing it moves each to the in-between moment, then puts the sim state back, so meshes, the camera, overlays, radar and sounds stay smooth at any frame rate. Register anything you move in the sim and draw from `.p` (and `.q`): `api.interp.add(array)` or `api.interp.add(each => { for (...) each(body) })`; `api.interp.cut(body)` after a teleport. Neighbour queries over the tracks go through a uniform grid (`grid.js`, `api.grid`): `api.grid.near(p, r, fn)` calls `fn(t)` for every track within r horizontally of p, in TH order (keep your own exact tests in fn; return true to stop), `api.grid.nearest(p, ok)`; it gives exactly what a loop over TH gives (`node tools/zombies-test.mjs --sections=grid` checks random scenes and a whole wave both ways). Code that moves tracks outside a sim tick while a frame is drawn calls `api.grid.touch()`. AI decisions are staggered: `api.think(id)` is true on every 4th tick, offset by id; helpers search for targets, drones that lost theirs look again, tracks decide to break away and Nightmare feints re-plan on their turn, while all movement runs every tick. Per-tick cost and on-screen judder: `node tools/zombies-tick.mjs`.

**Co-op** (`znet.js`). Two to four pilots can play Zombies together. On the Zombies start menu, type a pilot name and press **Host co-op**: you get a game code (on the open web the page link also ends in `#z<code>`). Friends open the page, pick Zombies, type the code and press **Join**. Pilots who join during a wave watch from the mat and come in at the next base screen; a fifth pilot is turned away.
- **Loadouts**: the host's doctrine is the team's (it shapes the shared base, purse and sites, so there can only be one; the base screen shows it). Each pilot brings their own kit: a kit helper any pilot brought is in everyone's shop (shared purse, shared base), a kit perk only in the shop of the pilot who brought it. The host checks both when a request comes in.
- **The host runs the world**: the wave director, every track, the helpers and their shots, the sites, the purse and the weather plan. Each pilot flies their own interceptor and sends its state; other pilots show as Strela-2 interceptors with name tags (and cyan triangles on the radar).
- **Detonating**: your burst is measured against the tracks as you see them (miss distance and closing speed for each track within 30 m) and sent to the host, which rolls kill / damage / miss with the solo rules and sends the result back (the HIT / DAMAGED / MISSED readout arrives a moment later). Direct hits on fast tracks work the same way.
- **One shared purse.** Everything you can buy either defends everyone (helpers, repairs, the team perks Long-range radar and Foreign Aid) or makes a pilot better for the team (the other perks are personal: each pilot buys their own warhead, battery, fuse, Rocket Assist, Freeze, Mark and Airstrike). Most money in later waves comes from helper kills that belong to nobody, and the big items (Iron Dome, Golden Dome) take the whole team's money, so nobody has to gift. Every purchase is announced with the buyer's name, the Armory shows who bought each defence, and the HUD and base screen show each pilot's kills. A track another pilot is running down shows their name and stays yellow for you, and helpers leave it to them.
- **Ready-up.** On the base screen, Continue (button, C, pad Y) marks you ready; the wave starts when every pilot is ready, or when the host presses **Start now**. The game doesn't pause behind the menu in co-op, and there is no kill slow-mo (the host's clock is everyone's).
- **Leaving.** A client who quits drops off the roster. If the host quits or disconnects, every client's game ends with "The host left the game" on the menu. At game over the host can start a new game for everyone.
- **Network.** Presence messages over the engine's rooms (the claude.ai room, else PeerJS p2p). Pilots send their drone at 20 Hz (position 1 cm, rotation 0.001, velocity 0.1 m/s); the host sends a snapshot at 10 Hz (down to 4 Hz in huge waves) with tracks quantised to 10 cm and 1 m/s, their static part (site, aim point) only when new and once a second, helper shots, defences, the purse, sites and a log of events (explosions, kills with who made them, impacts, gun bursts, team messages). Clients dead-reckon tracks and shots between snapshots. Test: `node tools/zombies-coop.mjs [--shots DIR] [--delay MS]` runs a host and two clients in one headless browser over `?netloop`, a BroadcastChannel stand-in for the room with an artificial delay.

**Code.** `zombies.js` (director, money, HUD, hooks), `znet.js` (co-op), `zcampaign.js` (the campaign map, sectors and their save), `zdata.js` (every number: enemies, prices, helper levels), `zenemy.js` (instanced enemies, movers, boss, far-field terrain), `zdef.js` (slots, helpers, shots), `zperk.js` (perks), `zchain.js` (the kill chain against the fast missiles), `zwarn.js` (early warning, launch alerts, harden / evacuate / decoy), `zbase.js` (base screen), `zmeta.js` (doctrine & unlocks, goals), `zboard.js` (leaderboard), `zbench.json` (bot benchmark), `zombies.css`, `zfx.js` (game feel: time scale, kill cam, explosions, fires, smoke, the front; it wraps the Z hooks), `zaudio.js` (all Zombies sound and the score), `zannounce.js` + `zfx.css` (announcer, radio, wave card), `zswarm.js` (personal swarm), `zlock.js` (lock-on), `zbatt.js` (Zombies battery and its readout), `zswdata.js` (their numbers), `zspectate.js` (Bot Spectator), `zbotfly.js` (the flying bot pilot), `zbotbrain.js` (bot levels and strategy). `interceptor.js` only calls them through one-line hooks behind `Z.on`. Headless tests: `node tools/zombies-test.mjs [--tiers N] [--balance] [--only]`, bot benchmark and balance checks: `node tools/zombies-bench.mjs [--levels L,..] [--diff 0,1,2,3] [--runs N] [--load JSON] [--meta full] [--diag] [--no-write] [--real]` (bot levels in `zbotbrain.js`; the teleporting benchmark pilot in `tools/zbot.mjs`), screenshots: `node tools/zombies-shots.mjs OUTDIR [kinds] [chaos] [base]`, frame times: `node tools/zombies-perf.mjs`, game-feel frame sequences and checks: `node tools/zombies-fx.mjs OUTDIR`, polish checks and frames (money flight, boss and impact cams, muzzle flashes, volume settings, night lights, damage stages with fires, snow, thermal): `node tools/zombies-polish-shots.mjs OUTDIR [section]`, the swarm's formations, a strike and the lock-on overlay: `node tools/zombies-swarm-shots.mjs OUTDIR`.
