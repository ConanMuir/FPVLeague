// Golden stick input: humanControl in Jared's game (src/input/input.js) and Riley's (engine/flight.js) must turn the same
// controller and keyboard sequences into the same commands as before the shared stick code (src/input/sticks.js) existed.
// A fake radio, a fake Xbox pad and the keyboard are driven through fixed sequences in Acro and Angle (sprung and full-range
// throttle, deadband, super boost, Jared's assist); each tick's throttle, target body rates, boost flag, stick values, Angle
// heading and flip presses are sampled and compared with test/fixtures/input-golden.json, recorded from the code before.
// The Interceptor's humanControl is private to its page (fpv mix, 88° Angle, keyboard arming) and is not shared yet.
// Re-record (only when a change is intended): GOLDEN_RECORD=1 node --test test/input-golden.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
register('./fixtures/flight-stubs.mjs', import.meta.url);
let PADS = [];
globalThis.addEventListener ??= () => {};
Object.defineProperty(globalThis, 'navigator', {value: {getGamepads: () => PADS, userAgent: 'node'}, configurable: true});
const THREE = await import('three'), V3 = THREE.Vector3, QT = THREE.Quaternion;
const R = await import('../engine/flight.js'), RS = (await import('../engine/settings.js')).S, RI = await import('../engine/input.js'), RR = await import('../engine/rates.js');
const JI = await import('../src/input/input.js'), JS = (await import('../src/config/settings.js')).S, JT = await import('../src/config/tune.js'), {GS} = await import('../src/state.js'), JR = await import('../src/flight/rates.js');

const FIX = new URL('./fixtures/input-golden.json', import.meta.url), RECORD = !!process.env.GOLDEN_RECORD;
const GOLD = RECORD ? {} : JSON.parse(fs.readFileSync(FIX, 'utf8')), OUT = {};
const close = (a, b) => a === b || typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
function golden(key, fresh) {
  if (RECORD) { OUT[key] = fresh; return; }
  const want = GOLD[key]; assert.ok(want, `no golden for ${key}`);
  for (const [k, rows] of Object.entries(want)) {
    assert.equal(fresh[k]?.length, rows.length, `${key}.${k}: sample count`);
    rows.forEach((row, i) => row.forEach((b, j) => assert.ok(close(fresh[k][i][j], b), `${key}.${k} sample ${i} value ${j}: ${fresh[k][i][j]} != golden ${b}`)));
  }
}
test.after(() => { if (RECORD) fs.writeFileSync(FIX, JSON.stringify(OUT) + '\n'); });

const DT = 1 / 120, N = 480, sn = Math.sin;
const PROF = {type: 'BETAFLIGHT', ax: [[80, 70, 30], [80, 70, 30], [80, 75, 30]], thrMid: 40, thrExpo: 30, thrLimit: 90};
const CAL = [{a: 2, c: 0.0275, s: -0.7922}, {a: 5, c: -0.0431, s: 0.7843}, {a: 1, c: 0.0431, s: -0.8392}, {a: 0, c: -0.0039, s: 0.8235}];
const XCAL = [{a: 1, c: 0, s: -1, m: 'spring'}, {a: 0, c: 0, s: 1}, {a: 3, c: 0, s: -1}, {a: 2, c: 0, s: 1}];
// sticks at time t (thr, yaw, pitch, roll, each -1..1) and the raw pad they come from through a calibration
const sticks = t => [sn(1.1 * t) * .98, .7 * sn(2 * t), sn(1.3 * t + 1), sn(1.7 * t + 2) * .9];
const btns = n => Array.from({length: n}, () => ({pressed: false, value: 0}));
function rawPad(id, mapping, cal, t, i) {
  const v = sticks(t), axes = new Array(8).fill(0);
  cal.forEach((c, k) => { axes[c.a] = c.c + v[k] * c.s; });
  if (t > 1 && t < 1.05) axes[cal[2].a] = cal[2].c + .02 * cal[2].s;  // inside the deadband
  return {id, mapping, connected: true, timestamp: i, axes, buttons: btns(17)};
}
// keyboard: W / S throttle, arrows pitch / roll, A / D yaw, E flip
const KEYS = t => ({KeyW: t < .8 || t > 2.6 && t < 3, KeyS: t > 1.6 && t < 2, ArrowUp: t > .5 && t < 1.2, ArrowDown: t > 3.2 && t < 3.5, ArrowRight: t > 1 && t < 2, ArrowLeft: t > 2.2 && t < 2.4, KeyD: t > 2 && t < 2.5, KeyA: t > 3 && t < 3.3, KeyE: t > 1.5 && t < 1.52, ShiftLeft: t > 2.7 && t < 2.9});
const SEQ = {
  radioAcro: {pad: (t, i) => rawPad('EdgeTX RadioMaster TX16S Joystick', '', CAL, t, i), mode: 'acro', thrMode: 'full'},
  radioAngle: {pad: (t, i) => rawPad('EdgeTX RadioMaster TX16S Joystick', '', CAL, t, i), mode: 'angle', thrMode: 'spring'},
  radioBoost: {pad: (t, i) => rawPad('EdgeTX RadioMaster TX16S Joystick', '', CAL, t, i), mode: 'acro', thrMode: 'full', sb: true},
  xbox: {pad: (t, i) => rawPad('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'standard', XCAL, t, i), mode: 'acro', thrMode: 'full'},
  xboxAngle: {pad: (t, i) => rawPad('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'standard', XCAL, t, i), mode: 'angle', thrMode: 'full', sb: true},
  keyboard: {mode: 'acro'},
  keyboardAngle: {mode: 'angle', sb: true}};
const _q = new QT(), _a = new V3();
function run(control, keys, S, s, stk) {
  const d = {q: new QT(), wt: new V3(), thr: 0, boosting: false, hd: null, flips: 0, flipUp() { this.flips++; }, tryPop() { return false; }}, out = [];
  S.mode = s.mode; S.thrMode = s.thrMode || 'full';
  for (let i = 0; i < N; i++) {
    const t = i * DT; PADS = s.pad ? [s.pad(t, i)] : [];
    for (const k in keys) delete keys[k]; if (!s.pad) Object.assign(keys, KEYS(t));
    control(d, DT, s);
    const wl = d.wt.length(); if (wl > 1e-9) { _q.setFromAxisAngle(_a.copy(d.wt).divideScalar(wl), wl * DT); d.q.multiply(_q).normalize(); }
    if (i % 8 === 7) out.push([d.thr, d.wt.x, d.wt.y, d.wt.z, d.boosting ? 1 : 0, ...stk, d.hd ?? -99, d.flips]);
  }
  for (const k in keys) delete keys[k];
  return out;
}

test("Riley's humanControl (engine/flight.js)", () => {
  R.tuneFlight({grav: 34.5, thr: 345, te: 1.6, vp: 240, maxv: 200, tau: 4, dl: .04, dq: .0039, size: 2, dbounce: .05, gfric: .1, spool: 20, turtle: 260, wash: 1.4, bzone: 5, boost: 60, bkick: 8, drain: 33, start: 33});
  Object.assign(RS, {rprof: [PROF], rpi: 0, cal: CAL.map(c => ({...c})), xcal: XCAL.map(c => ({...c})), dz: .03, fireBtn: 5, flipBtn: -1, xflip: 1});
  const out = {};
  for (const [k, s] of Object.entries(SEQ)) out[k] = run((d, dt) => R.humanControl(d, dt, {sb: !!s.sb, menu: false}), RI.keys, RS, s, RR.stk);
  golden('riley', out);
});

test("Jared's humanControl (src/input/input.js)", () => {
  GS.hostTune = {grav: 34.5, thr: 345, te: 1.6, vp: 240, maxv: 200, tau: 4, dl: .04, dq: .0039, size: 2, dbounce: .05, gfric: .7, spool: 20, turtle: 260, wash: 1.4, bzone: 5, boost: 60, bkick: 8, drain: 33, start: 33, padb: 100, pads: 20, bgrav: 34.5, bsize: 2.6, bbounce: .6, tbounce: .15, bdrag: .03, bmax: 160, bmass: .2, kick: 1, demo: 40, speed: 1, botv: 1, bloom: .9, shake: 1};
  JT.applyTune(); JR.RO.r = PROF;
  Object.assign(JS, {cal: CAL.map(c => ({...c})), xcal: XCAL.map(c => ({...c})), dz: .03, dzy: undefined, fireBtn: 5, flipBtn: -1, xflip: 1, xboost: -1, boostBtn: -1});
  const out = {};
  for (const [k, s] of Object.entries(SEQ)) { JS.sboost = !!s.sb; JS.assist = 0; out[k] = run((d, dt) => JI.humanControl(d, dt), JI.keys, JS, s, JR.stk); }
  JS.sboost = false;
  for (const k of ['radioAcro', 'keyboardAngle']) { JS.assist = .6; out[k + '.assist'] = run((d, dt) => JI.humanControl(d, dt), JI.keys, JS, SEQ[k], JR.stk); }
  JS.assist = 0; out['radioAngle.labAcro'] = run((d, dt) => JI.humanControl(d, dt, true), JI.keys, JS, SEQ.radioAngle, JR.stk);
  golden('jared', out);
  JR.RO.r = null; GS.hostTune = null;
});
