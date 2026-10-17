# Drone League: Interceptor

Fly a Ukrainian-style tail-sitter interceptor drone and run down Shahed-136 and jet Geran-3 attack drones before they reach the substation, the fuel depot and the apartment blocks.

## How to play

- **Easiest:** open `standalone/index.html` in Chrome or Edge (double-click it). It needs an internet connection the first time to load Three.js from jsDelivr.
- `drone-interceptor.html` is the same game without the outer HTML wrapper, for pasting into a Claude artifact.
- Press **Defend** to start. You sit on the launch mat at the forward position nearest the most urgent track, motors off.

## Controls

| Key | Action |
| --- | --- |
| W / S | Throttle up / down (released = hover; idle on the mat until you first press W) |
| A / D | Yaw |
| Arrow keys | Pitch / roll |
| L | Camera tilt switch: 90° for cruise, level for take-off and hover |
| H | Thermal camera switch (white-hot) |
| G | Midcourse guidance on / off |
| N | Next track (otherwise guidance takes the most urgent one) |
| F or click | Detonate (the proximity fuse also fires on its own) |
| V | Radar range 2 / 5 / 10 km |
| C | Camera: FPV, chase, threat cam |
| M | Acro / Angle mode (keyboard players: try Angle) |
| R | Fresh interceptor on the mat |
| Esc | Menu · T mod panel |

**RC radio or sim dongle:** plug it in by USB, set it to USB Joystick (HID), move a stick, then press **Calibrate radio** in the menu. Detonate, camera tilt, thermal, guidance and next track can each be mapped to a radio switch or button under the controller settings: press **Assign switches** and flip each switch when it names the function (any key skips one), or press **Learn** next to a single one. A switch that only sends part of its range, or the middle of a 3-position switch, is learned at the position you flip it to. If a switch doesn't move any of the axis bars at all, the radio isn't sending it over USB: put it on a channel from 5 to 8 in the radio's mixer. Throttle is full range by default.

## How to intercept

1. Take off vertically with the camera level, climb, then flip the camera to 90° (L) and pitch over to about 85°. It flies like a dart, where the nose points: about 360 km/h level at full throttle.
2. Each wave is one piston Shahed-136, then a jet Geran-3 a little later. Use the radar scope (bottom right) to head for the amber track, the most urgent one.
3. Get behind it. The warhead is a small fragmentation charge: a direct hit (under about 1 m) always kills, about 3 m from the tail is roughly a coin toss, and past 6 m it does nothing. The proximity fuse fires at closest approach within 6 m but has about 15 ms of delay, so at high closing speed it bursts past the target and head-on passes need a direct hit. KILL R on the track box is the 50% kill distance at your current closing speed. A near miss can leave it damaged: smoking, slower, sinking, and sometimes it fails on its own. A close hit can set off its own warhead. Fly through the small circle drawn behind the target.
4. Trees and houses are solid. A hit above 12 m/s is a crash. The air isn't perfectly smooth: light turbulence (a bit more in wind and in a Shahed's wake), small gusts, slightly softer roll and pitch at full throttle, and the fins pull the nose into the airflow. It's a heavy airframe: the motors and rates take a moment to respond and it carries its momentum. The 12S pack sags under load like a real LiPo (the OSD shows volts and amps): a full-throttle punch drops it about 0.5 V per cell, it recovers when you back off, and thrust falls with it, more so as the pack drains.
5. Midcourse guidance (on by default) puts a cyan PIP diamond on the feed and the radar: fly it to come out behind the selected track. The OSD shows time to go and steer / climb cues. Inside 1.5 km it hands over to TERMINAL and you fly it by eye.
6. The video link fades with range from your launch position and drops when terrain blocks it. Watch LQ% on the OSD and climb to get the picture back.
7. Thermal (H) makes the engines glow white, which helps spot a Shahed from behind.

Settings live in your browser (localStorage key `dl-interceptor`). `interceptor-notes.md` explains how the code is put together.
