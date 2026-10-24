// Interceptor enemies codex (games/interceptor/zcodex.js): the Quick defence boss rotation, pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rotate, scripted, cleanCodex, isAllowed} from '../games/interceptor/zcodex.js';

const heavy = () => ['heavy', 'jet'], isB = k => ['boss', 'twins'].includes(k);
const info = id => ({boss: {debut: 10, fixed: 1}, twins: {debut: 20}})[id] || null;
const rot = (w, pool, shift) => rotate(['shahed', 'boss'], w, {pool, info, heavy, isBoss: isB, shift, rnd: () => .5}).out;

test('rotate: the Mothership is on wave 10 on every difficulty, Easy included', () => {
  for (const shift of [-4, 0, 3, 6]) assert.ok(rot(10, ['boss'], shift).includes('boss'), 'shift ' + shift);
  assert.ok(rot(20, ['boss'], -4).includes('boss'));
});

test('rotate: a boss with its own first boss wave still comes later on Easy, and not before the difficulty allows on Nightmare', () => {
  assert.ok(!rot(20, ['twins'], -4).includes('twins') && rot(20, ['twins'], -4).includes('heavy'), 'Easy: wave 24 at the earliest, so a heavy raid at 20');
  assert.ok(rot(20, ['twins'], 0).includes('twins'));
  assert.ok(rot(10, ['twins'], 6).includes('heavy'), 'wave 10 is before its first boss wave (20 less 6 is 14): a heavy raid');
});

test('rotate: with every boss blocked the boss wave is a heavy raid', () => {
  const out = rot(10, [], 0);
  assert.ok(!out.includes('boss') && out.includes('heavy'));
});

test('scripted: a campaign sector plays its own set piece and the every-10 Mothership goes (unless Mothership escort keeps it)', () => {
  const S = {boss: 'twins', wave: 8};
  assert.deepEqual(scripted(['shahed'], 8, S, false, heavy, () => .5, isB), ['shahed', 'twins']);
  assert.ok(!scripted(['shahed', 'boss'], 10, S, false, heavy, () => .5, isB).includes('boss'));
  assert.ok(scripted(['shahed', 'boss'], 10, S, true, heavy, () => .5, isB).includes('boss'));
});

test('cleanCodex: a foreign or damaged save is an empty codex; the Mothership is always unlocked', () => {
  for (const v of [null, 5, 'x', [], {}, {v: 2}, {v: 1}, {v: 1, b: 'x'}, {v: 1, b: []}]) assert.deepEqual(cleanCodex(v), {v: 1, b: {}});
  const c = cleanCodex({v: 1, b: {twins: {beaten: true, allowed: false}, nope: {beaten: true}, boss: 5}});
  assert.deepEqual(Object.keys(c.b), ['twins']);
  assert.equal(c.b.twins.seen, true);
  assert.ok(isAllowed(c, 'boss') && !isAllowed(c, 'twins') && !isAllowed(c, 'jugg'));
});
