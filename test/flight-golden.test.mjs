// Golden flight trajectories: the shared flight core (src/flight/core.js) must fly every game exactly as before it existed.
// Each model is flown through fixed input sequences (hover, punch-out, rolls, flips, boost, prop wash, turtle, self-righting,
// pops, parts) with Math.random seeded, and the sampled positions, attitudes, velocities, body rates and motor speed are compared
// with test/fixtures/flight-golden.json, recorded from the code before the refactor. The tune, parts multipliers and hull come
// from the fixture too, so retuning a game or rebalancing parts does not move these goldens.
//   Riley's League:  engine/flight.js Quad.step (its own integration and ground contact, a flat floor at y = 0)
//   Jared's League:  src/flight/drone.js Drone.step (the real file; test/fixtures/flight-stubs.mjs stubs its DOM imports). Rapier
//                    integrates p, q in the game; here a plain p += v dt, q *= exp(w dt) and a flat-floor push-out stand in for it.
//   Rates, throttle curve and the attitude controller from both sides.
// The Interceptor's dart needs its page (terrain, wind, battery): tools/flight-golden.mjs runs it headless.
// Re-record (only when a feel change is intended): GOLDEN_RECORD=1 node --test test/flight-golden.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
register('./fixtures/flight-stubs.mjs', import.meta.url);
const THREE = await import('three'), V3 = THREE.Vector3, QT = THREE.Quaternion;
const R = await import('../engine/flight.js'), RR = await import('../engine/rates.js'), RS = (await import('../engine/settings.js')).S;
const J = await import('../src/flight/drone.js'), JR = await import('../src/flight/rates.js'), JA = await import('../src/flight/attitude.js');
const JT = await import('../src/config/tune.js'), {GS} = await import('../src/state.js'), PARTS = await import('../src/parts/index.js'), {MDEF} = await import('../src/config/mods.js');

const FIX = new URL('./fixtures/flight-golden.json', import.meta.url), RECORD = !!process.env.GOLDEN_RECORD;
const GOLD = RECORD ? {} : JSON.parse(fs.readFileSync(FIX, 'utf8')), OUT = {};
const DT = 1 / 120, EVERY = 12;
const lcg = s => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
function seeded(seed, fn) { const r = Math.random; Math.random = lcg(seed); try { return fn(); } finally { Math.random = r; } }
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
// compare a fresh result with the golden one: every number within float noise; returns the largest difference
function same(name, got, want) {
  let worst = 0;
  const walk = (a, b, at) => {
    if (Array.isArray(b)) { assert.equal(a.length, b.length, `${name}${at}: length`); b.forEach((x, i) => walk(a[i], x, `${at}[${i}]`)); return; }
    if (b && typeof b === 'object') { for (const k in b) walk(a[k], b[k], `${at}.${k}`); return; }
    if (typeof b === 'number') { worst = Math.max(worst, Math.abs(a - b)); assert.ok(close(a, b), `${name}${at}: ${a} != golden ${b}`); return; }
    assert.deepEqual(a, b, `${name}${at}`);
  };
  walk(got, want, '');
  return worst;
}
function golden(key, fresh) {
  if (RECORD) { OUT[key] = fresh; return; }
  assert.ok(GOLD[key], `no golden for ${key} (record with GOLDEN_RECORD=1)`);
  const w = same(key, fresh, GOLD[key]); if (w) console.log(`  ${key}: largest difference ${w}`);
}

// ---------- rates and throttle curve ----------
const PROFS = [
  {type: 'BETAFLIGHT', ax: [[80, 70, 30], [80, 70, 30], [80, 75, 30]], thrMid: 50, thrExpo: 0, thrLimit: 100},
  {type: 'BETAFLIGHT', ax: [[250, 90, 80], [120, 0, 0], [20, 99, 100]], thrMid: 30, thrExpo: 60, thrLimit: 80},
  {type: 'ACTUAL', ax: [[7, 67, 0], [20, 100, 50], [70, 30, 100]], thrMid: 70, thrExpo: 100, thrLimit: 25},
  {type: 'QUICK', ax: [[100, 67, 0], [200, 120, 50], [10, 0, 100]], thrMid: 0, thrExpo: 30, thrLimit: 100},
  {type: 'KISS', ax: [[100, 70, 0], [200, 98, 50], [50, 0, 100]], thrMid: 100, thrExpo: 50, thrLimit: 60},
  {type: 'RACEFLIGHT', ax: [[37, 80, 50], [255, 255, 100], [10, 0, 0]], thrMid: 50, thrExpo: 100, thrLimit: 100}];
const XS = Array.from({length: 41}, (_, i) => -1 + i * .05);
test('rates and throttle curve (src/flight/rates.js, engine/rates.js)', () => {
  const src = [], eng = [];
  for (const P of PROFS) {
    const {RO} = JR; RO.r = P; RS.rprof = [P]; RS.rpi = 0;
    src.push({rate: [0, 1, 2].map(a => XS.map(x => JR.rateR(P, a, x))), rt: [0, 1, 2].map(a => XS.map(x => JR.rate(a, x))), thr: XS.map(x => JR.thrCurve((x + 1) / 2))});
    eng.push({rate: [0, 1, 2].map(a => XS.map(x => RR.rate(a, x))), thr: XS.map(x => RR.thrCurve((x + 1) / 2))});
    RO.r = null;
  }
  golden('rates.src', src); golden('rates.engine', eng);
  for (let i = 0; i < PROFS.length; i++) { assert.deepEqual(eng[i].rate, src[i].rate, 'both sides compute the same rates'); assert.deepEqual(eng[i].thr, src[i].thr, 'and the same throttle curve'); }
});

// ---------- attitude controller ----------
test('attitude controller (src/flight/attitude.js, engine/flight.js)', () => {
  const cases = seeded(7, () => Array.from({length: 60}, () => {
    const r = () => Math.random() * 2 - 1, q = new QT().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), up = new V3(r(), r() + .6, r()).normalize(), fwd = new V3(r(), r() * .3, r());
    if (Math.random() < .1) fwd.copy(up).multiplyScalar(2);
    return {q, up, fwd, k: 4 + Math.random() * 14, maxR: 6 + Math.random() * 14, yawW: Math.random() < .5 ? 1 : .6};
  }));
  const run = att => cases.map(c => { const d = {q: c.q.clone(), wt: new V3(9, 9, 9)}; att(d, c.up.clone(), c.fwd.clone(), c.k, c.maxR, c.yawW); return d.wt.toArray(); });
  const src = run(JA.attitude), eng = run(R.attitude);
  golden('attitude.src', src); golden('attitude.engine', eng);
  assert.deepEqual(eng, src, 'both sides compute the same attitude command');
});

// ---------- input sequences ----------
// u(t, i, hov) -> {thr, r, p, y (sticks -1..1), b (super boost), flip (press the flip button this step), pop (spend a pop this step)}
const sn = Math.sin, AIR = {p: [0, 40, 0]}, FLOOR = {p: [0, .5, 0]}, INV = {p: [0, .5, 0], roll: Math.PI};
const SC = {
  hover: {...AIR, n: 360, u: (t, i, h) => ({thr: h})},
  punch: {...AIR, n: 360, u: (t, i, h) => ({thr: t < 1.2 ? 1 : t < 2 ? 0 : h})},
  rolls: {...AIR, n: 360, u: t => ({thr: .65, r: t < .8 ? 1 : t > 2.2 && t < 2.6 ? -.5 : 0, p: t > 1.2 && t < 1.7 ? -1 : t > 2.2 && t < 2.6 ? .5 : 0, y: t > 1.7 && t < 2.2 ? .8 : 0})},
  flip: {...AIR, n: 360, u: t => t < .45 ? {thr: .2, p: 1} : {thr: .8, p: .15}},
  boost: {...AIR, n: 300, u: t => ({thr: .9, b: t > .5 && t < 1.5, p: t < .4 ? .35 : 0})},
  wash: {...AIR, v: [0, -30, 0], n: 300, u: t => ({thr: t < 1.5 ? .35 : 1})},
  freestyle: {...AIR, n: 480, u: t => ({thr: .45 + .4 * sn(1.7 * t), r: sn(3 * t), p: sn(2.1 * t + 1), y: .5 * sn(1.3 * t)})},
  turtle: {...INV, n: 360, u: t => t < .4 ? {thr: 0} : t < 1.6 ? {thr: 0, r: .8} : {thr: .6}},
  selfright: {...INV, n: 360, u: () => ({thr: 0})},
  flipover: {...INV, n: 240, u: (t, i) => ({thr: .1, flip: i === 60})},
  slide: {...FLOOR, v: [15, 0, 0], n: 240, u: () => ({thr: .2, r: .3})},
  takeoff: {...FLOOR, n: 300, u: t => ({thr: t < .5 ? 0 : .7, p: t > 1 ? .2 : 0})}};
const PROF = PROFS[0];
const sample = d => [d.p.x, d.p.y, d.p.z, d.q.x, d.q.y, d.q.z, d.q.w, d.v.x, d.v.y, d.v.z, d.w.x, d.w.y, d.w.z, d.ms, d.boost];
function start(d, s) { d.p.set(...s.p); d.v.set(...(s.v || [0, 0, 0])); d.q.setFromAxisAngle(new V3(0, 0, 1), s.roll || 0); d.w.set(0, 0, 0); d.wt.set(0, 0, 0); }
function sticks(d, u, rate) { d.thr = u.thr; d.wt.set(-rate(1, u.p || 0), -rate(2, u.y || 0), -rate(0, u.r || 0)); d.boosting = !!u.b; }

// ---------- Riley's League: engine/flight.js Quad (Riley's League defaults, games/league/league.js MODS) ----------
const T_RILEY = {grav: 34.5, thr: 345, te: 1.6, vp: 240, maxv: 200, tau: 4, dl: .04, dq: .0039, size: 2, dbounce: .05, gfric: .1, spool: 20, turtle: 260, wash: 1.4, bzone: 5, boost: 60, bkick: 8, drain: 33, start: 33};
test("Riley's League quad (engine/flight.js Quad.step)", () => {
  const T = RECORD ? T_RILEY : GOLD['riley.tune']; golden('riley.tune', T);
  R.tuneFlight(T); R.setWorld((x, y, z) => -y); RS.rprof = [PROF]; RS.rpi = 0;
  const out = {};
  for (const [k, s] of Object.entries(SC)) out[k] = seeded(11, () => {
    const d = new R.Quad(), S = []; start(d, s); d.thr = d.ms = R.HOV; d.boost = 33;
    for (let i = 0; i < s.n; i++) {
      const u = s.u(i * DT, i, R.HOV); sticks(d, u, RR.rate); if (u.flip) d.flipUp();
      d.step(DT); if (i % EVERY === EVERY - 1) S.push(sample(d));
    }
    return S;
  });
  golden('riley', out);
});

// ---------- Jared's League: src/flight/drone.js Drone ----------
const _q = new QT(), _a = new V3(), _b = new V3();
function jaredDrone(F, pts) {
  const d = Object.create(J.Drone.prototype);
  Object.assign(d, {team: 0, i: 0, bot: false, key: 'p', p: new V3(), v: new V3(), q: new QT(), w: new V3(), wt: new V3(), thr: JT.HOV, ms: JT.HOV, gt: 0, wn: new V3(), boost: 33, boostOn: false, boosting: false, dead: 0, hp: 100, flipT: 0});
  d.fl = F; d.pts = pts.map(o => ({p: new V3(...o.p), r: o.r})); return d;
}
// what Rapier does in the game, reduced to a flat floor: integrate, then push the hull out of the floor and flag the contact
function world(d) {
  if (d.ph) { d.p.addScaledVector(d.v, DT); const wl = d.w.length(); if (wl > 1e-9) { _q.setFromAxisAngle(_a.copy(d.w).divideScalar(wl), wl * DT); d.q.multiply(_q).normalize(); } }
  let lo = 0; for (const c of d.pts) lo = Math.min(lo, _b.copy(c.p).applyQuaternion(d.q).add(d.p).y - c.r);
  if (lo < 0) { d.p.y -= lo; if (d.v.y < 0) d.v.y = 0; d.gt = .12; (d.cn || (d.cn = new V3())).set(0, 1, 0); }
  d.ph = 0; d.piv = 0;
}
test("Jared's League drone (src/flight/drone.js Drone.step)", () => {
  let T, LO;
  if (RECORD) {
    T = {...MDEF}; GS.hostTune = T; JT.applyTune();
    const lo = ids => { const L = PARTS.computeLoadout(ids, JT.DRAD / .6); return {ids, F: L.flight, pts: L.hbp.map(p => ({p, r: L.hbr}))}; };
    const all = PARTS.allLoadouts(true).map(lo), acc = o => o.F.acc[0] + o.F.acc[1] + o.F.acc[2];
    LO = {stock: lo([...PARTS.STOCK]), heavy: all.filter(o => !o.F.wheels).sort((a, b) => acc(a) - acc(b))[0], wheels: all.filter(o => o.F.wheels).sort((a, b) => acc(a) - acc(b))[0]};
  } else { T = GOLD['jared.tune']; LO = GOLD['jared.loadouts']; }
  golden('jared.tune', T); golden('jared.loadouts', LO);
  GS.hostTune = T; JT.applyTune();
  const rate = (a, x) => JR.rateR(PROF, a, x), out = {};
  const fly = (s, L, pre) => seeded(11, () => {
    const d = jaredDrone(L.F, L.pts), S = []; start(d, s); pre?.(d);
    for (let i = 0; i < s.n; i++) {
      const u = s.u(i * DT, i, JT.HOV); sticks(d, u, rate); if (u.flip) d.flipUp(); if (u.pop) d.tryPop(u.pop);
      d.step(DT); world(d); if (i % EVERY === EVERY - 1) S.push(sample(d));
    }
    return S;
  });
  for (const [k, s] of Object.entries(SC)) out[k] = fly(s, LO.stock);
  out.pop = fly({...AIR, n: 240, u: (t, i) => ({thr: .6, pop: i === 36 ? [0, -1, 0, .6] : null})}, LO.stock, d => { d.popC = 1; });
  out.popRoll = fly({...AIR, n: 240, u: (t, i) => ({thr: .5, r: i < 30 ? .4 : 0, pop: i === 30 ? [.9, 0, 0, .5] : null})}, LO.stock, d => { d.popC = 1; });
  for (const k of ['rolls', 'freestyle', 'turtle', 'slide']) { out['heavy.' + k] = fly(SC[k], LO.heavy); out['wheels.' + k] = fly(SC[k], LO.wheels); }
  golden('jared', out);
  GS.hostTune = null;
});

test.after(() => { if (RECORD) fs.writeFileSync(FIX, JSON.stringify(OUT) + '\n'); });
