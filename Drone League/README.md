# Drone League

FPV quad game in one HTML file. Two modes, picked at the top of the menu:

- **Drone League**: Rocket League with 5-inch acro quads. Knock the ball into the other team's goal.
- **Dogfight**: guns, turrets and bots on the Highlands map.

## Play it

Pick whichever is easiest:

1. **Windows:** double-click `Play Drone League.bat`. It opens the game in its own Microsoft Edge window.
2. **Any computer:** open `standalone/index.html` (or `drone-league.html`) in Chrome or Edge. On a Mac, right-click it and choose Open With > Google Chrome.
3. **In Claude:** the published artifact link, if Riley has shared it with you.

You need an internet connection the first time, because the 3D graphics library (Three.js) loads from the web. Chrome or Edge work best.

Then pick a mode, set the options on the right, and press **Play vs bots**.

## Controls

| Key | Does |
|---|---|
| W / S | Throttle up / down (let go = hover) |
| A / D | Yaw |
| Arrow keys | Pitch and roll |
| F or left click | Fire (Dogfight) |
| E | Flip back over (it also rolls back onto its feet by itself) |
| C | Camera: FPV, chase, ball cam (enemy cam in Dogfight) |
| M | Switch Acro / Angle. **New to FPV or on keyboard? Use Angle.** |
| R | Respawn |
| Esc | Menu |
| T | Mod panel (physics, ball, boost, presets) |

Shift or Space is super boost, but only when **Super boost** is turned on in the menu (off by default).

## Xbox controller

Plug it in or pair it, then press any button. The menu shows its name with "(Xbox layout)".

- It works straight away: left stick is throttle (centre = hover) and yaw, right stick is pitch and roll.
- **RT** fire, **B** flip over, **LB** camera, **Y** respawn, **Menu** pause.
- The Controller section in the menu shows every button live, so you can check each one registers.
- Want throttle on a trigger, or yaw on the bumpers? Press **Calibrate controller** and follow the 4 steps. Pull RT when it asks for throttle, or press RB when it asks for yaw (LB becomes the other direction).

## RC radio (EdgeTX / OpenTX / Ethos)

1. Plug the radio in by USB and choose **USB Joystick (HID)** on the radio.
2. Move a stick so the browser sees it.
3. Press **Calibrate controller** and follow the prompts: centre the sticks with throttle down, then move throttle up, yaw right, pitch forward, roll right.
4. Optional: map **Fire** and **Flip over** to switches in the Controller section.

The radio keeps its own calibration, separate from the Xbox controller.

## Sensitivity

- **Easy sensitivity setup**: three questions (spin speed, how twitchy small moves feel, yaw speed), then a live "try it" screen. Good for beginners.
- **Rates (Betaflight style)**: full Betaflight, Actual, Quick, KISS and Raceflight rates with 3 profiles, for pilots who already have rates they like.

## Online play

1. One player presses **Host**. A game code appears.
2. Send friends the game file (or the artifact link) and the code.
3. They type the code and press **Join**.

Set **Bots** to **No bots** before hosting for players-only games. Online play goes peer-to-peer, so some school or work networks block it.

## Tips

- Lost in the settings? Press **T**, then **Reset all** in the mod panel to get the default physics back.
- **Copy all my settings** in the menu copies your whole setup as text to save or share.
