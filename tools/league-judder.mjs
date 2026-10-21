// How evenly Drone League draws a body moving at constant speed under its fixed 120 Hz tick, for a range of display rates (frame
// intervals with seeded jitter). Pure arithmetic in node, no browser: main.js's real clock (src/core/loop.js) and render interpolation
// (src/render/interp.js) are run here, the same accumulator-replay method as tools/interp-judder.mjs (the Interceptor's).
//   judder = spread of the drawn speed from frame to frame / the true speed (0 = perfectly even)
//   stalls = frames where the body did not move on screen; back = frames where it moved backwards
//   off    = largest gap between where it is drawn and a smooth path one tick behind (m)
// Rows: "drawn as simulated" is what had no interpolation (Dogfight tracers and turret heads before league-smooth); "interpolated" is the
// ball and the local quads (main.js has interpolated them since the rewrite) and, since league-smooth, the tracers and turret heads.
// The second table: leaving the goal slow-mo (time scale ramps .3 -> 1 at 1.2/s, modes/step.js) with the old clock and the new one.
// Run: node tools/league-judder.mjs
import * as THREE from 'three';
import {DT, makeLoop} from '../src/core/loop.js';
import {makeInterp} from '../src/render/interp.js';
const V = 50, CASES = [['60 Hz', 1000 / 60, .3], ['60 Hz, uneven', 1000 / 60, 3], ['75 Hz', 1000 / 75, .3], ['120 Hz', 1000 / 120, .3], ['144 Hz', 1000 / 144, .3], ['165 Hz', 1000 / 165, .3],
  ['240 Hz', 1000 / 240, .3], ['240 Hz, uneven', 1000 / 240, 1.5], ['45 fps dips', 1000 / 45, 6]];
const rng = () => { let s = 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
function stats(xs, ts, dts, speed) {
  let stalls = 0, back = 0, err = 0; const sp = [];
  for (let f = 101; f < xs.length; f++) { const d = xs[f] - xs[f - 1]; if (Math.abs(d) < 1e-9) stalls++; else if (d < 0) back++; sp.push(d / dts[f]); err = Math.max(err, Math.abs(xs[f] - ts[f])); }
  const sd = Math.sqrt(sp.reduce((q, y) => q + (y - speed) ** 2, 0) / sp.length);
  return {judder: +(sd / speed).toFixed(3), stalls, back, err: +err.toFixed(3)};
}
function steady(ms, jit, interp) {
  const R = rng(), b = {p: new THREE.Vector3(), q: new THREE.Quaternion()}, I = makeInterp(f => f(b));
  let t = 0; const L = makeLoop(h => { I.snap(); t += h; b.p.x = V * t; });
  const xs = [], ts = [], dts = [];
  for (let f = 0; f < 3000; f++) {
    const dt = Math.min(.05, Math.max(1, ms + (R() - .5) * 2 * jit) / 1000), a = L.advance(dt, false, () => 1, 1);
    if (interp) I.begin(a); xs.push(b.p.x); if (interp) I.end();
    ts.push(V * (t - DT + L.acc)); dts.push(dt);
  }
  return stats(xs, ts, dts, V);
}
// the goal slow-mo: time scale .3, after 0.8 s (sim) it ramps up 1.2 / s to 1 (modes/step.js), then normal speed; frames around the exit
function slowExit(ms, carry) {
  const R = rng(), b = {p: new THREE.Vector3(), q: new THREE.Quaternion()}, I = makeInterp(f => f(b));
  let t = 0, ts = .3, tg = 0; const L = makeLoop(h => { I.snap(); t += h; b.p.x = V * t; tg += h; if (tg > .8) ts = Math.min(1, ts + h * 1.2); }, carry);
  let last = null, back = 0, stalls = 0, jolt = 0, exitF = -1;
  for (let f = 0; f < 4000; f++) {
    const dt = Math.min(.05, Math.max(1, ms + (R() - .5) * .6) / 1000), was = ts, a = L.advance(dt, false, () => ts, 1);
    if (was < 1 && ts >= 1 && exitF < 0) exitF = f;
    I.begin(a); const x = b.p.x; I.end();
    if (last != null && exitF >= 0 && f - exitF < 30) { const d = x - last; if (d < -1e-9) back++; else if (d < 1e-9) stalls++; jolt = Math.max(jolt, Math.abs(d / (V * dt) - 1)); }  /* the frame the ramp reaches 1 and the 29 after it */
    last = x;
  }
  return {back, stalls, jolt: Math.round(jolt * 100)};
}
console.log(`Body at ${V} m/s, 120 Hz sim, 3000 frames per case (judder: 0 = perfectly even)`);
for (const [n, ms, jit] of CASES) { const a = steady(ms, jit, false), b = steady(ms, jit, true);
  console.log(`${n.padEnd(15)} drawn as simulated: judder ${String(a.judder).padEnd(6)} stalls ${String(a.stalls).padEnd(5)} | interpolated: judder ${String(b.judder).padEnd(6)} stalls ${String(b.stalls).padEnd(3)} back ${b.back}   off ${a.err} m -> ${b.err} m`); }
console.log(`\nLeaving the goal slow-mo (the frame the time scale reaches 1 and the 29 after it): frames drawn standing still / backwards, and the worst frame's drawn speed off the true one`);
for (const [n, ms] of [['60 Hz', 1000 / 60], ['144 Hz', 1000 / 144], ['240 Hz', 1000 / 240]]) { const a = slowExit(ms, false), b = slowExit(ms, true);
  console.log(`${n.padEnd(8)} old clock: stalls ${a.stalls} back ${a.back} worst ${a.jolt}% | new clock: stalls ${b.stalls} back ${b.back} worst ${b.jolt}%`); }
