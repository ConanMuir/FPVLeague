// npm test: metric and tuning functions of the Calibration Lab, driven by synthetic stick/attitude traces.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rateR} from '../src/flight/rates.js';
import {toShape,fromShape} from '../src/tuner/rshape.js';
import {snapMetrics,trackMetrics,holdMetrics,altMetrics,noiseMetrics,crossings} from '../src/tuner/metrics.js';
import {makeTuner,profile,extras,onSnap,onAlt,onRest,onHover,onHold,onHoverPhys,onTrack,nudge,rateAt} from '../src/tuner/tuner.js';
import {PRESETS} from '../src/tuner/presets.js';
import {rng,simSnap,simAlt} from './sim.mjs';
const deg=r=>r*180/Math.PI,PROF=(type,ax,o={})=>({type,ax:[ax,ax,ax],thrMid:50,thrExpo:0,thrLimit:100,...o});

test('rshape: toShape/fromShape round-trip every rates type and match the rate maths', () => {
  for (const [type, ax] of [['BETAFLIGHT', [80, 70, 30]], ['BETAFLIGHT', [100, 70, 0]], ['BETAFLIGHT', [220, 60, 10]], ['ACTUAL', [7, 67, 0]], ['ACTUAL', [20, 80, 30]],
    ['QUICK', [100, 67, 20]], ['KISS', [100, 70, 20]], ['RACEFLIGHT', [37, 80, 50]]]) {
    const s = toShape(type, ax), back = fromShape(type, s);
    assert.deepEqual(back, ax, `${type} ${ax} -> ${JSON.stringify(s)} -> ${back}`);
    const R = PROF(type, ax), mx = deg(rateR(R, 0, 1)), c = deg(rateR(R, 0, .001)) / .001;
    assert.ok(Math.abs(mx - Math.min(1998, s.m)) < 1, `${type} max ${mx} vs ${s.m}`);
    assert.ok(Math.abs(c - s.c) < 2, `${type} centre ${c} vs ${s.c}`);
  }
  // converting a curve to Actual keeps centre and max
  const a = fromShape('ACTUAL', toShape('BETAFLIGHT', [100, 70, 0]));
  assert.deepEqual(a, [20, 67, 0]);
});

test('snapMetrics: overshoot, stop-short, settle and wobble from a known trace', () => {
  const s = [], dt = 1 / 120;
  // 0.2 s reaction, rotate at 450°/s to 99° (10% past a 90° target), hold, then at 0.6 s counter-steer back to 90 and stay
  let th = 0, back = false;
  for (let k = 0; k < 300; k++) { const t = k * dt; let x = 0;
    if (t >= .2 && !back && th < 99) { x = .7; th = Math.min(99, th + 450 * dt); } else if (t >= .6 && th > 90) { back = true; x = -.3; th = Math.max(90, th - 450 * dt); }
    s.push({t, x, th}); }
  const M = snapMetrics({start: 0, target: 90, s});
  assert.ok(M.valid && M.reached && M.settled);
  assert.ok(Math.abs(M.os - 10) < .5, 'overshoot ' + M.os);
  assert.equal(M.us, 0); assert.equal(M.osc, 0, 'one pass through the target is not a wobble');
  assert.ok(Math.abs(M.react - 200) < 10, 'react ' + M.react);
  assert.ok(M.settle > 150 && M.settle < 300, 'settle ' + M.settle);
  assert.equal(M.rev, 1, 'counter-steer counted');
  assert.ok(Math.abs(M.use - .7) < .01);
  // a rep that stops 30% short and never gets there
  const s2 = []; th = 0; for (let k = 0; k < 300; k++) { const t = k * dt, x = t > .2 && th < 63 ? .5 : 0; if (x) th += 300 * dt; s2.push({t, x, th}); }
  const M2 = snapMetrics({start: 0, target: 90, s: s2});
  assert.ok(!M2.reached && Math.abs(M2.us - 28) < 1.5, 'stop short ' + M2.us);
  assert.equal(snapMetrics({start: 0, target: 90, s: s2.map(o => ({...o, x: 0}))}).valid, false, 'no stick = no attempt');
  assert.equal(crossings([0, 3, -3, 3, 1, -1], 2), 2);
});

// the tuner converges for a simulated pilot with a known tendency, in both presets
// learn=false: the same pilot on frozen settings (the baseline)
function runSnaps(T, pilot, reps, seed = 1, learn = true) {
  const rnd = rng(seed), amps = [90, -120, 60, -90, 135, -60], hist = [];
  for (let r = 0; r < reps; r++) { const amp = amps[r % amps.length], rep = simSnap(x => rateAt(T, 0, x), amp, pilot, rnd); const M = snapMetrics(rep); if (learn) onSnap(T, 0, M); hist.push(M); }
  return hist;
}
const avg = (h, k, n = 6) => h.slice(-n).reduce((s, m) => s + (m[k] ?? 0), 0) / n;
const base = (mk, pilot, k) => avg(runSnaps(mk(), pilot, 12, 99, false), k, 12);
// convergence: the same simulated pilot on frozen settings (baseline) vs. the last 6 of 30 reps with the tuner on, both presets
for (const [pid, mk, pilot, k, tgt, why] of [
  ['pro', () => makeTuner('pro', PROF('ACTUAL', [20, 120, 0]), {dz: .03}), {react: .18, h: .6, want: 360}, 'os', PRESETS.pro.tg.os, 'over-rotates (rates too high for them)'],
  ['def', () => makeTuner('def', PROF('BETAFLIGHT', [140, 75, 0]), {dz: .03}), {react: .2, h: .5, want: 90}, 'os', PRESETS.def.tg.os, 'over-rotates, on Betaflight rates'],
  ['pro', () => makeTuner('pro', PROF('ACTUAL', [12, 60, 0]), {}), {react: .18, h: .6, want: 450}, 'us', PRESETS.pro.tg.us, 'stops short (rates too low)'],
  ['def', () => makeTuner('def', PROF('ACTUAL', [10, 45, 30]), {}), {react: .2, h: .55, want: 300}, 'us', PRESETS.def.tg.us, 'stops short, on Actual rates']]) {
  test(`tuner, ${pid}: a pilot who ${why} converges inside the preset target`, () => {
    const b = base(mk, pilot, k), T = mk(), r0 = rateAt(T, 0, pilot.h), h = runSnaps(T, pilot, 30), after = avg(h, k);
    const rep = h.findIndex((_, i) => i >= 5 && avg(h.slice(0, i + 1), k, 6) <= tgt + 3);
    console.log(`  ${pid} ${k === 'os' ? 'overshoot' : 'stop-short'} ${b.toFixed(1)}% -> ${after.toFixed(1)}% (inside target by rep ${rep + 1}), roll ${r0.toFixed(0)}->${rateAt(T, 0, pilot.h).toFixed(0)}°/s at ${pilot.h * 100}% stick, ${T.type} ${JSON.stringify(profile(T).ax[0])}, ${T.changes} changes`);
    assert.ok(b > tgt + 5, `baseline well outside target: ${b}`);
    assert.ok(after <= tgt + 3, `converged: ${after}`);
    assert.ok(k === 'os' ? rateAt(T, 0, pilot.h) < r0 : rateAt(T, 0, pilot.h) > r0, 'rate moved the right way');
    assert.equal(profile(T).type, pid === 'pro' ? 'ACTUAL' : mk().type);
    for (const q of Object.values(T.p)) assert.ok(q.v >= q.lo - 1e-9 && q.v <= q.hi + 1e-9, q.k + ' in bounds');
    if (pid === 'def') assert.ok(T.p.e0.v >= PRESETS.def.b.e[0], 'default keeps some expo');
    assert.equal(T.p.as.v, 0, 'no preset ever adds assist');
  });
}
test('tuner: steps shrink after a reversal, and a change that makes things worse is backed off', () => {
  const T = makeTuner('pro', PROF('ACTUAL', [20, 100, 0]), {});
  const bad = {valid: true, reached: true, os: 25, us: 0, settle: 200, osc: 0, rev: 0, lag: 80, sat: 0, use: .6};
  const c = onSnap(T, 0, bad); assert.equal(c.length, 1); const k = c[0].k, from = c[0].from;
  // the next rep is much worse: the change is backed off straight away (judged after one rep, so the tune keeps moving)
  const worse = {...bad, os: 90, osc: 3};
  assert.equal(onSnap(T, 0, worse).length, 0);
  assert.equal(T.p[k].v, from, 'backed off to the old value');
  assert.ok(T.log.some(l => l.back), 'logged the back-off');
  assert.ok(T.p[k].g < PRESETS.pro.g0, 'step halved');
  // gain shrinks when the direction flips
  const T2 = makeTuner('pro', PROF('ACTUAL', [20, 100, 0]), {}), g0 = T2.p.m0.g;
  nudge(T2, 'm0', -1, 1, 'a'); nudge(T2, 'm0', 1, 1, 'b'); assert.ok(T2.p.m0.g < g0 * .6);
  // hard bounds: 200 reps of huge overshoot can't take max rate below the preset floor
  const T3 = makeTuner('pro', PROF('ACTUAL', [20, 100, 0]), {});
  for (let i = 0; i < 200; i++) onSnap(T3, 0, {...bad, os: 80, use: .9});
  assert.ok(T3.p.m0.v >= PRESETS.pro.b.m[0] && T3.p.c0.v >= PRESETS.pro.b.c[0]);
});
test('hold still: deadband from resting stick noise; throttle mid from hover; yaw deadband from throttle-stick cross-talk', () => {
  const rnd = rng(5), raw = Array.from({length: 300}, () => [.02 + (rnd() - .5) * .02, (rnd() - .5) * .03, (rnd() - .5) * .05]);
  const N = noiseMetrics(raw); assert.ok(N[0].need > .025 && N[0].need < .032 && N[2].need > .02 && N[2].need <= .025);
  const T = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {dz: .03});
  onRest(T, N); assert.ok(Math.abs(T.p.dz.v - (N[0].need * 1.25 + .01)) < 1e-6, 'dz ' + T.p.dz.v);
  onHover(T, {motor: .237, cross: .06}); assert.equal(Math.round(T.p.tm.v), 24); assert.ok(T.p.dzy.v >= .066 - 1e-9);
  assert.deepEqual(Object.keys(extras(T)), ['dz', 'dzy', 'assist']);
  const P = makeTuner('pro', PROF('ACTUAL', [20, 80, 0]), {dz: .1}); onRest(P, noiseMetrics(Array.from({length: 50}, () => [0, 0, 0])));
  assert.ok(P.p.dz.v <= .006, 'perfect sticks: pro deadband near zero');
});
test('altitude gates: throttle mid follows the hover, throttle expo rises for a pilot who bounces through the band', () => {
  const hov = .237, tc = (t, m, e) => { m /= 100; e /= 100; const d = t - m, y = d > 0 ? 1 - m : m; return Math.min(1, Math.max(0, m + d * (1 - e + e * d * d / (y * y || 1)))); };
  const steps = [[5, 11], [11, 6], [6, 13], [13, 7], [7, 12], [12, 5]];
  const fly = (T, pl, n, seed) => { const rnd = rng(seed), h = []; for (let i = 0; i < n; i++) { const [a, b] = steps[i % steps.length];
    const M = altMetrics(simAlt(t => tc(t, T.p.tm.v, T.p.te.v), hov, a, b - 1.2, b + 1.2, {react: .2, hs: hov, ...pl}, rnd)); h.push(M); onAlt(T, M); } return h; };
  const C = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {}); fly(C, {k: .012, kd: .014}, 12, 9);
  assert.ok(Math.abs(C.p.tm.v - hov * 100) < 4, 'thr mid at hover: ' + C.p.tm.v);
  assert.equal(C.p.te.v, 0, 'a calm pilot gets no throttle expo they do not need');
  const B = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {}), h = fly(B, {k: .018, kd: .004}, 24, 4);
  const o0 = avg(h.slice(0, 4), 'over', 4), o1 = avg(h, 'over', 4);
  console.log(`  alt: calm pilot thr mid 50 -> ${C.p.tm.v.toFixed(0)}; bouncy pilot thr expo 0 -> ${B.p.te.v.toFixed(0)}, overshoot ${o0.toFixed(2)} -> ${o1.toFixed(2)} band`);
  assert.ok(B.p.te.v > 10, 'more throttle expo for a bouncy pilot');
  assert.ok(o1 < o0, 'and it bounces less');
});
test('live hold: bouncing adds throttle expo, drifting with a still stick moves throttle mid, pinned and short removes expo', () => {
  const win = (f) => Array.from({length: 180}, (_, k) => { const t = k / 120; return {t, ...f(t)}; });
  // bouncing ±1.6 m at ~1.3 Hz around the band centre with the throttle working
  const B = holdMetrics(win(t => ({y: 8 + 1.6 * Math.sin(t * 8.2), vy: 13 * Math.cos(t * 8.2), thr: .5 + .2 * Math.sin(t * 8.2), m: .3})), 6.8, 9.2);
  assert.ok(B.bounce > .6 && B.amp > 2, JSON.stringify(B));
  const T1 = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {}); const te0 = T1.p.te.v; onHold(T1, B); assert.ok(T1.p.te.v > te0, 'bouncing -> more throttle expo');
  // sinking 1.2 m/s with the stick held still at a motor of 31%: throttle mid moves toward 31
  const D = holdMetrics(win(t => ({y: 9 - 1.2 * t, vy: -1.2, thr: .5, m: .31})), 6.8, 9.2);
  const T2 = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {}); const tm0 = T2.p.tm.v; onHold(T2, D); assert.ok(T2.p.tm.v < tm0 && T2.p.tm.v >= 31 - 1e-9, 'drift -> throttle mid follows the motor');
  // stick pinned at full and still below the band: less expo
  const P = holdMetrics(win(t => ({y: 3 + .3 * t, vy: .3, thr: 1, m: .9})), 6.8, 9.2);
  const T3 = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {}); T3.p.te.v = 30; onHold(T3, P); assert.ok(T3.p.te.v < 30, 'pinned and short -> less expo');
});

test('tracking: lagging a drifting target adds centre', () => {
  // tracking: lagging a drifting target -> more centre on that axis
  const s = Array.from({length: 600}, (_, k) => { const t = k / 120, tv = 20 * Math.cos(t), e = 8 * Math.sign(tv); return {t, e: [e, 0, 0], x: [.2, 0, 0], r: [.2, 0, 0], tv: [tv, 0, 0]}; });
  const TM = trackMetrics(s, .03); assert.ok(TM[0].rms > 7 && TM[0].bias > .9);
  const K = makeTuner('pro', PROF('ACTUAL', [20, 80, 0]), {}); onTrack(K, TM); assert.ok(K.p.c0.v > K.p.c0.v0, 'more roll centre');
});

test('altitude gates: a pilot who keeps over-throttling past the band is fixed (throttle mid at the real hover, expo softens the curve around it)', () => {
  const hov = .237, DT = 1 / 120, tc = (t, m, e) => { m /= 100; e /= 100; const d = t - m, y = d > 0 ? 1 - m : m; return Math.min(1, Math.max(0, m + d * (1 - e + e * d * d / (y * y || 1)))); };
  // an aggressive pilot: high gain, little damping, starts each band a little high and keeps correcting (integral), 0.2 s reaction
  const band = (curve, from, lo, hi, rnd) => { const s = [], hist = [], mid = (lo + hi) / 2, n = 24; let y = from, vy = 0, I = 0;
    for (let k = 0; k < 600; k++) { const seen = k >= n ? hist[k - n] : [from, 0], e = mid - seen[0]; I += e * DT;
      const thr = Math.min(1, Math.max(0, hov + .06 + .045 * e - .006 * seen[1] + .006 * I + (rnd() - .5) * .02)), m = curve(thr);
      vy += (34.5 * ((m / hov) ** 1.6) - 34.5) * DT; vy *= 1 - DT * .8; y += vy * DT; if (y < 0) { y = 0; vy = 0; } hist.push([y, vy]); s.push({t: k * DT, y, vy, thr, m}); }
    return {lo, hi, s}; };
  const steps = [[5, 11], [11, 6], [6, 13], [13, 7], [7, 12], [12, 5]];
  const fly = (T, n, seed) => { const rnd = rng(seed); let out = 0, cnt = 0;
    for (let i = 0; i < n; i++) { const [a, b] = steps[i % steps.length], ev = band(t => tc(t, T.p.tm.v, T.p.te.v) * T.p.tl.v / 100, a, b - 1.2, b + 1.2, rnd);
      for (let w = 1.5; w + 1.5 <= 5.001; w += 1.5) { const win = ev.s.filter(o => o.t >= w && o.t < w + 1.5); if (T.live) onHold(T, holdMetrics(win, ev.lo, ev.hi));
        if (i >= n - 6) { out += win.filter(o => o.y > ev.hi || o.y < ev.lo).length; cnt += win.length; } }
      if (T.live) onAlt(T, altMetrics(ev)); }
    return out / cnt; };
  const F = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {}), base = fly(F, 24, 4);  // the same pilot, no tuning
  const T = makeTuner('def', PROF('BETAFLIGHT', [100, 70, 0]), {}); T.live = true; onHoverPhys(T, hov); const tuned = fly(T, 24, 4);
  console.log(`  over-throttler: outside the band ${(base * 100).toFixed(0)}% untuned -> ${(tuned * 100).toFixed(0)}% tuned (mid ${T.p.tm.v.toFixed(0)}, expo ${T.p.te.v.toFixed(0)}, limit ${T.p.tl.v.toFixed(0)}%)`);
  assert.ok(Math.abs(T.p.tm.v * T.p.tl.v / 100 - hov * 100) < 3, 'the curve pivots on the real hover: mid ' + T.p.tm.v + ' x limit ' + T.p.tl.v);
  assert.ok(T.p.te.v >= 15, 'expo raised: ' + T.p.te.v);
  assert.ok(tuned < base * .7, `time outside the band: ${(base * 100).toFixed(0)}% untuned -> ${(tuned * 100).toFixed(0)}% tuned`);
});
