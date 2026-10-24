// Interceptor lead solver (games/interceptor/lead.js): the constant-turn model of a track and the gap rule of track().
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {solve, track} from '../games/interceptor/lead.js';

const V3 = THREE.Vector3, DT = 1 / 120;
const mk = (vx, vz) => ({p: new V3(0, 300, -2000), v: new V3(vx, 0, vz)});
const turn = (t, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); t.v.set(t.v.x * c + t.v.z * s, t.v.y, -t.v.x * s + t.v.z * c); };

test('track: a steady velocity has no acceleration, a steady turn settles on the centripetal one', () => {
  const t = mk(0, 50); let k = 0;
  for (let i = 0; i < 240; i++) track(t, DT, V3, ++k);
  assert.ok(t.__ld.a.length() < 1e-9);
  const w = 0.4;  /* rad/s */
  for (let i = 0; i < 360; i++) { turn(t, w * DT * 180 / Math.PI); t.p.addScaledVector(t.v, DT); track(t, DT, V3, ++k); }
  assert.ok(Math.abs(t.__ld.a.length() - 50 * w) < 0.6, 'a = v w (' + t.__ld.a.length().toFixed(2) + ' vs ' + 50 * w + ')');
});

test('track: a lock dropped and taken again later does not turn the track by the change since', () => {
  const t = mk(0, 50); let k = 0;
  for (let i = 0; i < 240; i++) track(t, DT, V3, ++k);
  turn(t, 60); k += 900;  /* seven seconds with no lock, the track jinked 60 degrees meanwhile */
  const L = track(t, DT, V3, ++k);
  assert.ok(L.a.length() < 1e-9 && L.n === 1, 'the gap starts the estimate again, a = ' + L.a.length().toFixed(1));
  const out = {p: new V3()}, me = new V3(0, 300, 0);
  solve(out, t.p, t.v, L.n > 3 ? L.a : null, me, 90, V3);
  const straight = {p: new V3()};
  solve(straight, t.p, t.v, null, me, 90, V3);
  assert.ok(out.p.distanceTo(straight.p) < 1e-6, 'the first solution after the gap is the straight one');
  /* the call without a tick keeps the stale velocity and reads the whole 60 degrees as one tick's acceleration (that spike is what the gap rule replaces) */
  const u = mk(0, 50); for (let i = 0; i < 240; i++) track(u, DT, V3); turn(u, 60);
  assert.ok(track(u, DT, V3).a.length() > 50, 'without the tick the stale velocity is a huge spike');
});

test('track: ticks one apart (or two) are not a gap', () => {
  const t = mk(0, 50); let k = 0;
  for (let i = 0; i < 30; i++) track(t, DT, V3, k += 2);
  assert.equal(t.__ld.n, 30);
});

test('solve: a straight track gives the exact quadratic meet, a turning one bends toward its turn', () => {
  const me = new V3(0, 300, 0), o = {p: new V3()};
  const t = {p: new V3(0, 300, -2000), v: new V3(40, 0, 0)};
  solve(o, t.p, t.v, null, me, 80, V3);
  const tau = o.tau;
  assert.ok(Math.abs(o.p.distanceTo(me) / 80 - tau) < 1e-6 && o.p.z < 0, 'it takes tau to get there at 80 m/s');
  /* the track is pulling 12 m/s2 toward -z, across its heading: a turn of 0.3 rad/s */
  const a = new V3(0, 0, -12), o2 = {p: new V3()};
  solve(o2, t.p, t.v, a, me, 80, V3);
  assert.ok(o2.p.z < o.p.z - 5, 'the turning track is met nearer to the line it is turning toward: ' + o2.p.z.toFixed(0) + ' vs ' + o.p.z.toFixed(0));
});
