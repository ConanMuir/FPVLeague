// npm test: skill training packs: success detection (judge), results and best scores, the settings cleaner, frames, aiming, pack data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {GRACE,REST,SETTLE,aimVel,better,carrying,cleanTrain,judge,newResults,packScore,record,toLocal,toWorld,vecWorld,yawWorld} from '../src/training/judge.js';
import {CATS,PACKS,TIERS,packById,packsOf} from '../src/training/packs.js';
const base = o => ({kind: 'goal', req: {}, t: 1, limit: 8, touched: true, since: 1, goal: 0, pred: false, last: {y: 0, pop: false}, carry: 0, popped: false, land: null, zone: null, rest: 0, ...o});

test('goal: a goal in the target counts, the other goal and the clock do not', () => {
  assert.deepEqual(judge(base({goal: 1})), {ok: true, why: 'Goal'});
  assert.equal(judge(base({goal: -1})).ok, false);
  assert.equal(judge(base({})), null, 'nothing yet');
  assert.deepEqual(judge(base({t: 8, touched: false})), {ok: false, why: 'Time'});
  assert.equal(judge(base({t: 8, pred: false})).why, 'Time');
  // still flying in at the buzzer: grace, then time
  assert.equal(judge(base({t: 8.5, pred: true})), null);
  assert.equal(judge(base({t: 8 + GRACE + .01, pred: true})).why, 'Time');
  assert.equal(judge(base({t: 8.5, pred: true, goal: 1})).ok, true, 'a goal in the grace counts');
  // a ball left sitting on the floor after a touch fails early
  assert.equal(judge(base({rest: REST})).why, 'Ball stopped');
  assert.equal(judge(base({rest: REST, touched: false})), null);
});

test('goal requirements: aerial height, carry time, pop', () => {
  assert.equal(judge(base({goal: 1, req: {air: 8}, last: {y: 3, pop: false}})).why, 'Not an aerial touch');
  assert.equal(judge(base({goal: 1, req: {air: 8}, last: {y: 8.2, pop: false}})).ok, true);
  assert.equal(judge(base({goal: 1, req: {air: 8}, last: null})).ok, false, 'untouched goal is not an aerial');
  assert.match(judge(base({goal: 1, req: {carry: 1.5}, carry: .9})).why, /^Carry it longer \(0\.9\/1\.5 s\)$/);
  assert.equal(judge(base({goal: 1, req: {carry: 1.5}, carry: 1.6})).ok, true);
  assert.equal(judge(base({goal: 1, req: {pop: true}, last: {y: 9, pop: false}})).why, 'Score it with a pop');
  assert.equal(judge(base({goal: 1, req: {pop: true}, last: {y: 9, pop: true}})).ok, true);
});

test('save: touched and no longer going in, a goal against fails, held out at the buzzer', () => {
  const s = o => base({kind: 'save', ...o});
  assert.deepEqual(judge(s({goal: 1})), {ok: false, why: 'Goal against'});
  assert.equal(judge(s({since: SETTLE - .01})), null, 'wait a moment after the touch');
  assert.deepEqual(judge(s({since: SETTLE})), {ok: true, why: 'Saved'});
  assert.equal(judge(s({pred: true})), null, 'touched but still going in');
  assert.equal(judge(s({touched: false})), null, 'untouched, not going in: wait for the clock');
  assert.equal(judge(s({touched: false, t: 8})).why, 'Kept out');
  assert.equal(judge(s({touched: false, t: 8.2, pred: true})), null, 'grace while it is going in');
  assert.equal(judge(s({touched: false, t: 8 + GRACE, pred: true})).why, 'Time');
});

test('zone: the first landing after a pop decides', () => {
  const z = o => base({kind: 'zone', zone: {x: 0, d: 30, r: 8}, ...o});
  assert.equal(judge(z({land: [3, 33]})), null, 'a landing before any pop is ignored');
  assert.deepEqual(judge(z({popped: true, land: [3, 33]})), {ok: true, why: 'On target'});
  assert.deepEqual(judge(z({popped: true, land: [0, 50]})), {ok: false, why: 'Missed by 12 m'});
  assert.equal(judge(z({goal: 1})).ok, false);
  assert.equal(judge(z({t: 8})).why, 'Time');
  assert.equal(judge(z({t: 8, popped: true})), null, 'a pop still in the air gets the grace');
  assert.equal(judge(z({rest: REST})).why, 'No pop');
});

test('carrying: on top, inside the footprint, moving with the quad', () => {
  assert.ok(carrying([0, 3.2, 0], [0, 0, 0], 2.6, .6));
  assert.ok(!carrying([0, 3.2, 3], [0, 0, 0], 2.6, .6), 'off to the side');
  assert.ok(!carrying([0, -3.2, 0], [0, 0, 0], 2.6, .6), 'underneath');
  assert.ok(!carrying([0, 3.2, 0], [0, 12, 0], 2.6, .6), 'flying off');
  assert.ok(!carrying([0, 8, 0], [0, 0, 0], 2.6, .6), 'high above');
});

test('results: record, score, better, and the settings cleaner', () => {
  const rs = newResults(3);record(rs[0], false, 2);record(rs[0], true, 4.2);record(rs[0], true, 3.1);record(rs[1], false, 8);
  assert.deepEqual(rs[0], {ok: true, tries: 3, t: 3.1});assert.deepEqual(rs[1], {ok: false, tries: 1, t: null});assert.deepEqual(rs[2], {ok: null, tries: 0, t: null});
  assert.deepEqual(packScore(rs), {n: 1, of: 3, t: 3.1, tries: 4});
  assert.ok(better({n: 2, t: 9}, {n: 1, t: 3}));assert.ok(better({n: 2, t: 5}, {n: 2, t: 6}));assert.ok(!better({n: 2, t: 6}, {n: 2, t: 6}));assert.ok(!better({n: 1, t: 1}, {n: 2, t: 9}));
  assert.ok(better({n: 0, t: 0}, null), 'first play is stored');assert.ok(!better({n: 0, t: 0}, {n: 0, t: 0}));
  assert.deepEqual(cleanTrain(undefined), {});assert.deepEqual(cleanTrain([1]), {});assert.deepEqual(cleanTrain('x'), {});
  assert.deepEqual(cleanTrain({'striker-rookie': {n: 5, of: 8, t: 41.2}, 'BAD id': {n: 1, of: 2, t: 1}, 'aerial-pro': {n: 9, of: 7, t: 1}, 'pops-pro': {n: 1, of: 7, t: 'x'}, 'goalie-pro': null}),
    {'striker-rookie': {n: 5, of: 8, t: 41.2}});
});

test('frames: local pack coordinates to the world and back, both goals', () => {
  const HL = 180;
  assert.deepEqual(toWorld(5, 2, 30, HL, false), [5, 2, -150]);assert.deepEqual(toWorld(5, 2, 30, HL, true), [-5, 2, 150]);
  for (const f of [false, true]) assert.deepEqual(toLocal(toWorld(-7, 3, 44, HL, f), HL, f), [-7, 3, 44]);
  assert.deepEqual(vecWorld([1, 2, -3], false), [1, 2, -3]);assert.deepEqual(vecWorld([1, 2, -3], true), [-1, 2, 3]);
  // yaw 0 faces the goal: three.js forward (0,0,-1) turned by the world angle about +y
  const fwd = a => [-Math.sin(a), -Math.cos(a)];
  assert.deepEqual(fwd(yawWorld(0, false)).map(Math.round), [-0, -1]);assert.deepEqual(fwd(yawWorld(0, true)).map(Math.round), [-0, 1]);
  assert.deepEqual(fwd(yawWorld(90, false)).map(Math.round), [1, -0], 'yaw 90 faces right');
});

test('aimVel: reaches the aim point in T under gravity (and with drag, close enough)', () => {
  const sim = (a, v, g, bd, T) => { const p = [...a], u = [...v], dt = 1 / 600; for (let t = 0; t < T - 1e-9; t += dt) { u[1] -= g * dt; const s = Math.hypot(...u), k = Math.max(0, 1 - (bd + bd * .02 * s) * dt); for (let i = 0; i < 3; i++) { u[i] *= k; p[i] += u[i] * dt; } } return p; };
  for (const [a, b, T] of [[[0, 0, 70], [0, 0, -3], 2.2], [[-10, 0, 85], [17, 11, -3], 1.2], [[0, 0, 60], [-12, 9, -3], 2]]) {
    const v0 = aimVel(a, b, T, 34.5, 0), p0 = sim(a, v0, 34.5, 0, T);assert.ok(Math.hypot(p0[0] - b[0], p0[1] - b[1], p0[2] - b[2]) < .3, 'no drag ' + p0);
    const v = aimVel(a, b, T, 34.5, .03), p = sim(a, v, 34.5, .03, T);assert.ok(Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]) < 1.5, 'drag ' + p);
  }
});

test('pack data: five categories x three tiers, 6-10 shots each, valid spawns and zones', () => {
  assert.equal(CATS.length, 5);assert.equal(TIERS.length, 3);
  const ids = new Set();
  for (const c of CATS) assert.deepEqual(packsOf(c.id).map(p => p.tier), [0, 1, 2], c.id);
  for (const P of PACKS) {
    assert.ok(/^[a-z0-9-]{1,40}$/.test(P.id) && !ids.has(P.id), P.id);ids.add(P.id);assert.equal(packById(P.id), P);
    assert.ok(['goal', 'save', 'zone'].includes(P.kind) && P.t > 0 && P.shots.length >= 6 && P.shots.length <= 10, P.id);
    for (const s of P.shots) {
      const k = s.kind || P.kind, b = s.ball, ok3 = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
      assert.ok(s.n && ok3(s.drone.p) && (b.on || ok3(b.p)), P.id + ' ' + s.n);
      assert.ok(!b.v || ok3(b.v));assert.ok(!b.aim || b.aim.length === 4 && b.aim[3] > 0);
      if (k === 'zone') assert.ok(s.zone && s.zone.r > 0, P.id + ' ' + s.n + ' needs a zone');
      assert.ok(Math.abs(s.drone.p[0]) < 100 && s.drone.p[2] > 0 && s.drone.p[2] < 2 * 140, 'drone inside the Classic arena');
    }
  }
});
