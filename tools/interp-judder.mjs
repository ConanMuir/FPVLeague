// How evenly a body moving at constant speed is drawn under engine/loop.js's fixed 120 Hz tick, with and without engine/interp.js, for a
// few display timings (frame intervals with jitter, seeded). Pure arithmetic in node, no browser: the loop's accumulator (engine/loop.js: TICK, MAXTICKS) is replayed here.
//   judder = spread of the drawn speed from frame to frame / the true speed (0 = perfectly even)
//   stalls = frames where the body did not move on screen; off = largest gap between where it is drawn and a smooth path one tick behind (m)
// Run: node tools/interp-judder.mjs
import * as THREE from 'three';
import {makeInterp} from '../engine/interp.js';
const TICK = 1 / 120, MAXTICKS = 12, V = 50, CASES = [['60 Hz', 1000 / 60, .3], ['60 Hz, uneven', 1000 / 60, 3], ['75 Hz', 1000 / 75, .3], ['144 Hz', 1000 / 144, .3], ['165 Hz', 1000 / 165, .3], ['45 fps dips', 1000 / 45, 6]];
function run(ms, jit, interp) {
  let s = 1; const R = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const I = makeInterp(), b = {p: new THREE.Vector3()}; I.add([b]);
  let acc = 0, t = 0, last = null; const sp = []; let stalls = 0, err = 0;
  for (let f = 0; f < 3000; f++) {
    const dt = Math.min(.05, Math.max(1, ms + (R() - .5) * 2 * jit) / 1000); acc += dt; let n = 0;
    while (acc >= TICK && n < MAXTICKS) { I.snap(); t += TICK; b.p.x = V * t; acc -= TICK; n++; } if (acc >= TICK) acc = TICK * .999;
    const a = Math.min(1, acc / TICK); if (interp) I.begin(a); const x = b.p.x; if (interp) I.end();
    if (f > 100) err = Math.max(err, Math.abs(x - V * (t - TICK + acc)));
    if (last != null && f > 100) { const d = x - last; if (Math.abs(d) < 1e-9) stalls++; sp.push(d / dt); } last = x;
  }
  const mu = V, sd = Math.sqrt(sp.reduce((q, y) => q + (y - mu) ** 2, 0) / sp.length);
  return {judder: +(sd / mu).toFixed(3), stalls, err: +err.toFixed(3)};
}
for (const [n, ms, jit] of CASES) { const a = run(ms, jit, false), b = run(ms, jit, true);
  console.log(`${n.padEnd(15)} no interpolation: judder ${String(a.judder).padEnd(6)} stalls ${String(a.stalls).padEnd(4)} | interpolated: judder ${String(b.judder).padEnd(6)} stalls ${String(b.stalls).padEnd(4)} off ${a.err} m -> ${b.err} m`); }
