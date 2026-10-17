# Drone League: Interceptor

Fly a Ukrainian-style tail-sitter interceptor drone and run down Shahed-136 and jet Geran-3 attack drones before they reach the substation, the fuel depot and the apartment blocks.

## How to play

- Open the launcher (see the [main README](../../README.md#how-to-play): double-click `Play Drone League.bat` on Windows, or use the GitHub Pages link) and pick **Interceptor**.
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

**RC radio or sim dongle:** plug it in by USB, set it to USB Joystick (HID), move a stick, then press **Calibrate controller** in the menu. An Xbox controller works straight away too (RT detonates). Detonate is mapped in the controller panel. Camera tilt, thermal, guidance and next track can each be mapped to a radio switch or button: press **Learn** next to one, then flip the switch or press the button. Throttle is full range by default.

## How to intercept

1. Take off vertically with the camera level, climb, then flip the camera to 90° (L) and pitch over to about 85°. It flies like a dart, where the nose points: about 360 km/h level at full throttle.
2. Use the radar scope (bottom right) to head for the amber track, the most urgent one.
3. Get behind it. The proximity fuse window shrinks as closing speed rises, so head-on passes need a direct hit; from the tail you get the full 4 m. Fly through the small circle drawn behind the target.
4. Trees and houses are solid. A hit above 12 m/s is a crash.
5. Midcourse guidance (on by default) puts a cyan PIP diamond on the feed and the radar: fly it to come out behind the selected track. The OSD shows time to go and steer / climb cues. Inside 1.5 km it hands over to TERMINAL and you fly it by eye.
6. The video link fades with range from your launch position and drops when terrain blocks it. Watch LQ% on the OSD and climb to get the picture back.
7. Thermal (H) makes the engines glow white, which helps spot a Shahed from behind.

Settings live in your browser (localStorage key `dl-interceptor`). Your radio calibration, rates, flight mode and FOV are shared with Drone League; the camera tilt stays separate (90° here, 30° on the League quad).
