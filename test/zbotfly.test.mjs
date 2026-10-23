// Interceptor bot pilot (games/interceptor/zbotfly.js): the boss's turn estimate starts again after a gap, as the lock-on's does (lead.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {turnTrack} from '../games/interceptor/zbotfly.js';

const V3 = THREE.Vector3, DT = 1 / 120;
const boss = () => ({p: new V3(), v: new V3(0, 0, -80)});
const turn = (t, w) => { const a = w * DT, c = Math.cos(a), s = Math.sin(a); t.v.set(t.v.x * c + t.v.z * s, 0, -t.v.x * s + t.v.z * c); };

test('turnTrack: a steady turn settles on the centripetal acceleration (horizontal)', () => {
  const accs = new WeakMap(), t = boss(); let now = 0, A;
  for (let i = 0; i < 480; i++) { turn(t, .3); now += DT; A = turnTrack(accs, t, DT, now, V3); }
  assert.ok(Math.abs(Math.hypot(A.a.x, A.a.z) - 80 * .3) < 1, 'a = v w: ' + Math.hypot(A.a.x, A.a.z).toFixed(2));
  assert.equal(A.n, 479, "the first call only starts the track");
});

test('turnTrack: the bot looked elsewhere for seven seconds and the boss turned 70 degrees meanwhile: no phantom turn', () => {
  const accs = new WeakMap(), t = boss(); let now = 0, A;
  for (let i = 0; i < 240; i++) { now += DT; A = turnTrack(accs, t, DT, now, V3); }
  turn(t, 70 * Math.PI / 180 / DT); now += 7;
  A = turnTrack(accs, t, DT, now, V3);
  assert.ok(Math.hypot(A.a.x, A.a.z) < 1e-9 && A.n === 1, 'started again: a ' + Math.hypot(A.a.x, A.a.z).toFixed(1) + ', n ' + A.n);
});
