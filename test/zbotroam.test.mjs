// Interceptor exploring bot (games/interceptor/zbotroam.js): the HUD words of the roaming leg are rebuilt four times a second, not on every sim tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoam} from '../games/interceptor/zbotroam.js';

function rig() {
  const calls = {km: 0, why: 0}, st = {id: 's1', k: 'ridge', n: 'the north ridge', x: 0, z: -900, r: 300, agl: 70};
  const M = {SC: {x: 0, z: 1950}, pick: () => st, kmTxt: d => { calls.km++; return Math.round(d) + ' m'; }, why: () => { calls.why++; return 'Holding the ridge'; }};
  const api = {gh: () => 0, TH: [], live: () => false, AW: 4300, BCAP: 16000}, B = {map: M, t: 0}, E = {api, G: {wq: []}, KIND: {}};
  return {calls, st, B, R: createRoam(E, B, {relaunch: 0}), me: p => ({p, mah: 0})};
}
const pos = (x, z) => ({x, y: 100, z});

test('roam: a station leg rebuilds its words four times a second, not on every tick', () => {
  const {calls, B, R, me} = rig(), m = me(pos(0, -800));  /* 100 m from the station: holding it */
  let first = null, same = true;
  for (let i = 0; i < 240; i++) { B.t = i / 120; const o = R.nav(m, 1 / 120); if (!first) first = o.why; same = same && typeof o.why === 'string' && o.why.length > 0; }
  assert.ok(same && first === 'Holding the ridge');
  assert.equal(R.out.kind, 'station');
  assert.ok(calls.why >= 7 && calls.why <= 10, '2 s at 4 a second, not 240: ' + calls.why);
});

test('roam: a transit leg refreshes its distance four times a second and switches kind at once', () => {
  const {calls, B, R, me} = rig(); let x = 3000;
  const kinds = [];
  for (let i = 0; i < 240; i++) { B.t = i / 120; const o = R.nav(me(pos(x, -800)), 1 / 120); kinds.push(o.kind); if (i === 119) x = 0; }  /* far for a second, then at the station */
  assert.equal(kinds[0], 'transit'); assert.equal(kinds[239], 'station');
  assert.ok(calls.km >= 7 && calls.km <= 10, 'distance text 2 s at 4 a second: ' + calls.km);
  assert.ok(R.out.what.startsWith('holding') && R.out.why === 'Holding the ridge', 'the kind changed at once: ' + R.out.what);
});

test('roam: a clock that went back (a new run) makes the next call rebuild the words', () => {
  const {calls, B, R, me} = rig(), m = me(pos(0, -800));
  B.t = 50; R.nav(m, 1 / 120); const n0 = calls.why; R.nav(m, 1 / 120); assert.equal(calls.why, n0, 'the next tick keeps the words');
  B.t = 0; R.nav(m, 1 / 120); assert.equal(calls.why, n0 + 1, 'the clock went back: rebuilt');
});
