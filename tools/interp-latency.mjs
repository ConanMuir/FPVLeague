// How late a body is drawn under engine/loop.js's fixed 120 Hz tick, for a range of display rates (frame intervals with seeded jitter), when it is
//   newest  drawn as simulated (no render interpolation: the Interceptor before sim-smooth, Drone League v15)
//   interp  interpolated between its last two ticks (engine/interp.js add(): every track, helper and shot; the player's craft before this change)
//   lead    extrapolated from its last two ticks to real time (engine/interp.js lead(): the player's craft now)
// Pure arithmetic in node, no browser: the loop's accumulator (engine/loop.js: TICK, MAXTICKS) is replayed, and engine/interp.js is the real module.
//   lag     = how far behind real time the drawn pose is for a body moving at a steady speed, in ms: mean over the frames, and the worst frame
//   judder  = spread of the drawn speed from frame to frame / the true speed (0 = perfectly even)
//   err     = for a body whose velocity changes inside one tick (a stick slammed over), the worst gap between the drawn pose and the pose the sim
//             then really has at that frame's real time: a position at 100 m/s whose acceleration (10 g) flips sign (cm), and an attitude turning at 700 deg/s that changes
//             its rate by 67 deg/s (1.17 rad/s, the rate loop's limit per tick: AMAX 140 rad/s^2) at some ticks (deg)
// Run: node tools/interp-latency.mjs
import * as THREE from 'three';
import {makeInterp} from '../engine/interp.js';
const TICK = 1 / 120, MAXTICKS = 12, V = 50, MODES = ['newest', 'interp', 'lead'];
const CASES = [['60 Hz', 1000 / 60, .3], ['60 Hz, uneven', 1000 / 60, 3], ['75 Hz', 1000 / 75, .3], ['90 Hz', 1000 / 90, .3], ['120 Hz', 1000 / 120, .3], ['144 Hz', 1000 / 144, .3], ['165 Hz', 1000 / 165, .3], ['240 Hz', 1000 / 240, .3], ['45 fps dips', 1000 / 45, 6]];
const rng = () => { let s = 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const reg = (I, mode, b) => { if (mode === 'lead') I.lead([b]); else I.add([b]); };
/* the loop of engine/loop.js: tick() for each whole tick of the frame's time, then draw(frame, real time, alpha, dt) */
function run(ms, jit, n, tick, draw) {
  const R = rng(); let acc = 0, real = 0;
  for (let f = 0; f < n; f++) {
    const dt = Math.min(.05, Math.max(1, ms + (R() - .5) * 2 * jit) / 1000); acc += dt; real += dt; let k = 0;
    while (acc >= TICK && k < MAXTICKS) { tick(); acc -= TICK; k++; } if (acc >= TICK) acc = TICK * .999;
    draw(f, real, Math.min(1, acc / TICK), dt);
  }
}
function steady(ms, jit, mode) {
  const I = makeInterp(), b = {p: new THREE.Vector3()}; reg(I, mode, b);
  let t = 0, last = null; const sp = [], lag = [];
  run(ms, jit, 3000, () => { I.snap(); t += TICK; b.p.x = V * t; }, (f, real, a, dt) => {
    if (mode !== 'newest') I.begin(a); const x = b.p.x; if (mode !== 'newest') I.end();
    if (f > 100) { lag.push((V * real - x) / V * 1000); if (last != null) sp.push((x - last) / dt); } last = x;
  });
  const sd = Math.sqrt(sp.reduce((q, y) => q + (y - V) ** 2, 0) / sp.length);
  return {lagMean: lag.reduce((q, y) => q + y, 0) / lag.length, lagMax: Math.max(...lag), judder: sd / V};
}
/* a body at 100 m/s whose acceleration (10 g) flips sign at every 17th tick, against the sim path at each frame's real time (known once the next tick has run) */
function reversal(ms, mode) {
  const I = makeInterp(), b = {p: new THREE.Vector3()}; reg(I, mode, b);
  let n = 0, v = 100, s = 1; const xs = [0], drawn = [], A = 100; let err = 0;  /* 100 m/s^2 is 10 g: the dart at full thrust plus a crash-hard drag */
  run(ms, .3, 3000, () => { I.snap(); n++; if (n % 17 === 0) s = -s; v += s * A * TICK; b.p.x += v * TICK; xs.push(b.p.x); }, (f, real, a) => {
    if (mode !== 'newest') I.begin(a); const x = b.p.x; if (mode !== 'newest') I.end(); drawn.push([real, x]); });
  drawn.forEach(([real, x], f) => { const s = real / TICK, i = Math.floor(s); if (f > 100 && i < xs.length - 1) err = Math.max(err, Math.abs(x - (xs[i] + (xs[i + 1] - xs[i]) * (s - i)))); });
  return err * 100;
}
function turn(ms, mode) {
  const I = makeInterp(), b = {p: new THREE.Vector3(), q: new THREE.Quaternion()}; reg(I, mode, b);
  let n = 0, w = 12.2; const ax = new THREE.Vector3(1, 0, 0), dq = new THREE.Quaternion(), qs = [b.q.clone()], drawn = []; let err = 0;
  run(ms, .3, 3000, () => { I.snap(); n++; if (n % 17 === 0) w = w > 12 ? 12.2 - 1.17 : 12.2; b.q.multiply(dq.setFromAxisAngle(ax, w * TICK)); qs.push(b.q.clone()); }, (f, real, a) => {
    if (mode !== 'newest') I.begin(a); const q = b.q.clone(); if (mode !== 'newest') I.end(); drawn.push([real, q]); });
  drawn.forEach(([real, q], f) => { const s = real / TICK, i = Math.floor(s); if (f > 100 && i < qs.length - 1) err = Math.max(err, q.angleTo(qs[i].clone().slerp(qs[i + 1], s - i)) * 180 / Math.PI); });
  return err * 180 / Math.PI / (180 / Math.PI);
}
const f2 = x => x.toFixed(2).padStart(6);
console.log(`Body at ${V} m/s under the 120 Hz tick, 3000 frames per case: how far behind real time it is drawn (ms), and how evenly (judder: 0 = perfectly even)`);
console.log('case             |   newest lag mean  max  judder |   interp lag mean  max  judder |    lead lag mean  max  judder');
for (const [n, ms, jit] of CASES) { const r = MODES.map(m => steady(ms, jit, m));
  console.log(`${n.padEnd(16)} | ${r.map(x => `${f2(x.lagMean)} ${f2(x.lagMax)}  ${x.judder.toFixed(3)}`).join(' | ')}`); }
console.log('\nA sudden change of velocity inside a tick: worst gap between the drawn pose and the sim path at that frame\'s real time');
console.log('case             |   position at 100 m/s, acceleration (10 g) flips (cm)|   attitude turning at 700 deg/s, rate changing 67 deg/s (deg)');
for (const [n, ms] of CASES.slice(0, 8)) console.log(`${n.padEnd(16)} |   ${MODES.map(m => `${m} ${f2(reversal(ms, m))}`).join('  ')}  |   ${MODES.map(m => `${m} ${f2(turn(ms, m))}`).join('  ')}`);
