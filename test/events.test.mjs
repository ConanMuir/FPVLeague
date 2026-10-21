// Event bus (src/core/events.js): order, unsubscribing (also during delivery), unknown types, reused payloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS, emitEv, hasEv, onEv, onFx, replayEv} from '../src/core/events.js';

test('listeners run in subscription order with the producer\'s payload object', () => {
  const seen = [], P = {speed: 0};
  const off1 = onEv('orb', e => seen.push(['a', e, e.speed])), off2 = onEv('orb', e => seen.push(['b', e, e.speed]));
  P.speed = 3; emitEv('orb', P); P.speed = 7; emitEv('orb', P);
  assert.deepEqual(seen, [['a', P, 3], ['b', P, 3], ['a', P, 7], ['b', P, 7]]);
  off1(); off2(); assert.equal(hasEv('orb'), false);
});

test('a listener can unsubscribe itself or add one while an event is delivered; the change applies from the next event', () => {
  const seen = []; let off2 = null;
  const off1 = onEv('kickoff', () => { seen.push(1); off1(); off2 = onEv('kickoff', () => seen.push(2)); });
  const off3 = onEv('kickoff', () => seen.push(3));
  emitEv('kickoff', {n: 1}); emitEv('kickoff', {n: 2});
  assert.deepEqual(seen, [1, 3, 3, 2]); off2(); off3(); assert.equal(hasEv('kickoff'), false);
});

test('unknown types throw (typos fail loudly); every documented type can be used', () => {
  assert.throws(() => onEv('tuoch', () => {})); assert.throws(() => emitEv('tuoch', {}));
  for (const t of EVENTS) { let n = 0; const off = onEv(t, () => n++); assert.ok(hasEv(t)); emitEv(t, {}); off(); assert.equal(n, 1, t); }
  emitEv('goal', {});  // no listeners: nothing happens
});

test('emitting allocates nothing per event (heap stays flat over a million emits)', () => {
  const P = {d: null, speed: 0}; let s = 0; const off = onEv('touch', e => { s += e.speed; });
  for (let i = 0; i < 1e5; i++) { P.speed = i; emitEv('touch', P); }  // warm up
  globalThis.gc?.(); const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 1e6; i++) { P.speed = 1; emitEv('touch', P); }
  const grow = process.memoryUsage().heapUsed - h0; off();
  assert.ok(grow < 4e6, 'heap grew ' + grow + ' bytes'); assert.ok(s > 1e6);
});

test('replayed events (render/replay.js) reach onFx listeners only; onFx listeners also hear live events', () => {
  const seen = []; const offE = onEv('goal', e => seen.push('ev' + e.n)), offF = onFx('goal', e => seen.push('fx' + e.n));
  emitEv('goal', {n: 1}); replayEv('goal', {n: 2});
  assert.deepEqual(seen, ['ev1', 'fx1', 'fx2']);
  offF(); replayEv('goal', {n: 3}); emitEv('goal', {n: 4}); offE();
  assert.deepEqual(seen, ['ev1', 'fx1', 'fx2', 'ev4']); assert.equal(hasEv('goal'), false);
  assert.throws(() => replayEv('tuoch', {}));
});
