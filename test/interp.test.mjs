// Interceptor render interpolation (engine/interp.js): add() bodies are drawn between their last two ticks, lead() bodies (the player's craft) are
// drawn ahead of the newest tick, at real time; end() always puts the sim state back, exactly; a teleport is not swept across.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeInterp} from '../engine/interp.js';

const body = () => ({p: new THREE.Vector3(), q: new THREE.Quaternion()});
const tick = (I, b, f) => { I.snap(); f(b); };

test('add: drawn alpha of the way from the previous tick to the newest', () => {
  const I = makeInterp(), b = body(); I.add([b]);
  tick(I, b, b => b.p.x = 10); tick(I, b, b => b.p.x = 20);
  I.begin(.25); assert.equal(b.p.x, 12.5); I.end(); assert.equal(b.p.x, 20);
});

test('lead: drawn ahead of the newest tick by alpha, i.e. at real time', () => {
  const I = makeInterp(), b = body(); I.lead([b]);
  tick(I, b, b => b.p.x = 10); tick(I, b, b => b.p.x = 20);
  I.begin(.25); assert.equal(b.p.x, 22.5); I.end(); assert.equal(b.p.x, 20);
  I.begin(0); assert.equal(b.p.x, 20); I.end();
});

test('lead and add side by side: each its own draw, both restored', () => {
  const I = makeInterp(), a = body(), c = body(); I.lead([a]); I.add([c]);
  for (const x of [0, 5, 10]) { I.snap(); a.p.x = c.p.x = x; }
  I.begin(.5); assert.equal(a.p.x, 12.5); assert.equal(c.p.x, 7.5); I.end(); assert.equal(a.p.x, 10); assert.equal(c.p.x, 10);
});

test('lead: attitude is extrapolated along the turn, a steady turn stays steady', () => {
  const I = makeInterp(), b = body(), ax = new THREE.Vector3(0, 0, 1), dq = new THREE.Quaternion(), w = 12;  /* 12 rad/s */
  I.lead([b]); const step = () => { I.snap(); b.q.multiply(dq.setFromAxisAngle(ax, w / 120)); };
  step(); step(); const sim = b.q.clone();
  I.begin(.5); const ang = new THREE.Quaternion().identity().angleTo(b.q); I.end();
  assert.ok(Math.abs(ang - 2 * w / 120 - w / 120 * .5) < 1e-9, 'two ticks plus half a tick of turn');
  assert.ok(b.q.equals(sim), 'the sim attitude is back');
});

test('a teleport (more than 400 m in a tick, or cut) is drawn where it is, for add and lead alike', () => {
  const I = makeInterp(), a = body(), c = body(); I.lead([a]); I.add([c]);
  I.snap(); a.p.x = c.p.x = 0; I.snap(); a.p.x = c.p.x = 1000;
  I.begin(.5); assert.equal(a.p.x, 1000); assert.equal(c.p.x, 1000); I.end();
  I.snap(); a.p.x = c.p.x = 1001; I.cut(a); I.begin(.5); assert.equal(a.p.x, 1001); assert.equal(c.p.x, 1000.5); I.end();
});

test('a body that moved itself while drawn keeps its move (a snapshot snap) and is drawn where it is until the next tick', () => {
  const I = makeInterp(), a = body(); I.lead([a]);
  I.snap(); a.p.x = 0; I.snap(); a.p.x = 10;
  I.begin(.5); a.p.x = 500; I.end(); assert.equal(a.p.x, 500);
  I.begin(.5); assert.equal(a.p.x, 500); I.end();
});

test('alpha 1 draws the newest tick as it is', () => {
  const I = makeInterp(), a = body(); I.lead([a]);
  I.snap(); a.p.x = 0; I.snap(); a.p.x = 10;
  I.begin(1); assert.equal(a.p.x, 10); I.end();
});
