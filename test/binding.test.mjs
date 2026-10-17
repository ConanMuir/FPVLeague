// npm test: control binding detection with synthetic gamepads (every trigger case).
import test from 'node:test';
import assert from 'node:assert/strict';
import {detector,detect,calEntry,negEntry,btnEntry,chans} from '../src/input/binding.js';
const pad = (axes, btns = []) => ({axes, buttons: btns.map(v => typeof v === 'object' ? v : {value: v, pressed: v > .5})});
// run frames: [ms, axes, buttons] keyframes held until the next one; 16 ms frames
function run(D, frames) { let t = 0; for (const [dur, ax, b] of frames) for (let e = 0; e < dur; e += 16) { detect(D, pad(ax, b), t); t += 16; } return D; }
const REST = [0, 0, 0, 0, -1, -1], B0 = Array(17).fill(0);
const B = (j, v) => { const b = [...B0]; b[j] = v; return b; };

test('centred stick axis -> spring throttle on Xbox, half-range channel for yaw', () => {
  const D = run(detector(), [[1000, REST, B0], [400, [0, -1, 0, 0, -1, -1], B0], [400, REST, B0]]);
  assert.equal(D.ph, 'done'); assert.equal(D.res.id, 1); assert.equal(D.res.dir, -1);
  assert.deepEqual(calEntry(D.res, 0, true), {a: 1, c: 0, s: -1, m: 'spring'});
  assert.deepEqual(calEntry(D.res, 1, true), {a: 1, c: 0, s: -1});
});
test('trigger as an axis resting at -1 (Firefox / DirectInput)', () => {
  const D = run(detector(), [[1000, REST, B0], [400, [0, 0, 0, 0, -1, 1], B0], [400, REST, B0]]);
  assert.equal(D.res.id, 5); assert.ok(D.res.trig);
  assert.deepEqual(calEntry(D.res, 0, true), {a: 5, c: 0, s: 1, r: -1}, 'full-range throttle on a trigger');
  assert.equal(btnEntry(D.res), 'a5');
});
test('trigger axis that reads 0 until its first press, then rests at -1', () => {
  const R0 = [0, 0, 0, 0, -1, 0];
  const D = run(detector(), [[1000, R0, B0], [400, [0, 0, 0, 0, -1, 1], B0], [100, [0, 0, 0, 0, -1, 0], B0], [500, [0, 0, 0, 0, -1, -1], B0]]);
  assert.equal(D.ph, 'done'); assert.equal(D.res.id, 5); assert.ok(D.res.late, 'flagged late'); assert.equal(D.res.rest, -1);
  assert.deepEqual(calEntry(D.res, 0, true), {a: 5, c: 0, s: 1, r: -1});
});
test('analog trigger reported as a button AND an axis: the button wins', () => {
  const D = run(detector(), [[1000, REST, B0], [400, [0, 0, 0, 0, -1, 1], B(7, 1)], [400, REST, B0]]);
  assert.equal(D.res.id, 107); assert.equal(btnEntry(D.res), 7);
  assert.deepEqual(calEntry(D.res, 0, true), {a: 107, c: .5, s: .5});
  assert.deepEqual(negEntry(D.res), {b: 7});
  // half-pressed analog button still counts once past 30%
  const H = run(detector(), [[1000, REST, B0], [400, REST, B(6, .45)], [400, REST, B0]]); assert.equal(H.res.id, 106);
  // digital button that reports value 0 while pressed
  assert.equal(chans(pad([], [{value: 0, pressed: true}]))[100], 1);
});
test('channels moving at rest are ignored; a spoiled baseline restarts; quick taps are not a binding', () => {
  let t = 0; const D = detector();
  for (let i = 0; i < 80; i++) { detect(D, pad([0, 0, Math.sin(i) * .06, 0, -1, -1], B0), t); t += 16; }  // axis 2 jitters ±0.06 (noisy)
  assert.equal(D.ph, 'wait'); assert.ok(D.noisy.has(2));
  for (let i = 0; i < 40; i++) { detect(D, pad([0, 0, .9, 0, -1, -1], B0), t); t += 16; }
  assert.equal(D.ph, 'wait', 'noisy axis ignored even when it moves');
  for (let i = 0; i < 5; i++) { detect(D, pad([0, 0, 0, 0, -1, -1], B(0, 1)), t); t += 16; }
  for (let i = 0; i < 5; i++) { detect(D, pad([0, 0, 0, 0, -1, -1], B0), t); t += 16; }
  assert.equal(D.ph, 'wait', 'an 80 ms tap is not deliberate');
  const S = run(detector(), [[300, REST, B0], [300, [1, 0, 0, 0, -1, -1], B0], [1000, REST, B0]]);
  assert.equal(S.ph, 'wait'); assert.ok(S.tries >= 1, 'baseline restarted'); assert.equal(S.rest[0], 0, 'rest taken after the movement');
  const U = run(detector({used: [1]}), [[1000, REST, B0], [400, [0, -1, 0, -.8, -1, -1], B0], [400, REST, B0]]);
  assert.equal(U.res.id, 3, 'already-bound channels are skipped');
});
test('a radio throttle (resting at the bottom) is full range; stick pushed negative gives a negative axis button', () => {
  const D = run(detector(), [[1000, [-1, 0, 0, 0], []], [400, [1, 0, 0, 0], []], [400, [-1, 0, 0, 0], []]]);
  assert.deepEqual(calEntry(D.res, 0, false), {a: 0, c: 0, s: 1, r: -1});
  const N = run(detector(), [[1000, [0, 0, 0, 0], []], [400, [0, 0, -1, 0], []], [400, [0, 0, 0, 0], []]]);
  assert.equal(btnEntry(N.res), 'a2-');
});
