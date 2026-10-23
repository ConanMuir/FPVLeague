// Interceptor leaderboard (games/interceptor/zboard.js): the benchmark file is read defensively; a missing difficulty or a stray block never throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanBench} from '../games/interceptor/zboard.js';

const cell = (med, fly) => ({med, min: med - 1, max: med + 2, ...(fly ? {fly} : {})});

test('cleanBench: the shipped zbench.json reads, every level with all four difficulties and the flying numbers', () => {
  const B = cleanBench(JSON.parse(fs.readFileSync(new URL('../games/interceptor/zbench.json', import.meta.url), 'utf8')));
  assert.ok(B && B.levels.length >= 6);
  for (const l of B.levels) { assert.deepEqual(Object.keys(l.d), ['Easy', 'Normal', 'Hard', 'Nightmare']); assert.ok(l.d.Normal.fly && l.d.Normal.fly.pct >= 0 && l.d.Normal.fly.pct <= 1); }
});

test('cleanBench: a level missing a difficulty, or a cell with a fly block and no median, is skipped, not a throw', () => {
  const j = {date: '2026-10-22', version: 'x', runs: 3, levels: [
    {n: 'Rookie', d: {Easy: cell(5), Normal: cell(4, {med: 3, pct: .5, systems: 7})}},  /* Hard and Nightmare missing */
    {n: 'Pro', d: {Easy: {fly: {med: 3, pct: .5, systems: 7}}, Normal: null, Hard: cell(9), Nightmare: 7}},  /* a fly block with no cell, a null, a number */
    {n: 'Odd', d: 'text'}, {n: 5}, null]};
  let B; assert.doesNotThrow(() => { B = cleanBench(j); });
  assert.deepEqual(B.levels.map(l => l.n), ['Rookie', 'Pro', 'Odd']);
  assert.equal(B.levels[0].d.Normal.fly.systems, 7);
  assert.deepEqual(Object.keys(B.levels[1].d), ['Hard']);
  assert.deepEqual(B.levels[2].d, {});
});

test('cleanBench: bad fly numbers are dropped, the cell stays; a foreign file is none', () => {
  const B = cleanBench({levels: [{n: 'A', d: {Easy: cell(5, {med: 'x', pct: 1, systems: 2}), Normal: cell(6, {med: 3, pct: 9, systems: 2.7})}}]});
  assert.equal(B.levels[0].d.Easy.fly, undefined);
  assert.deepEqual(B.levels[0].d.Normal.fly, {med: 3, pct: 1, systems: 2});
  for (const v of [null, 0, 'x', [], {}, {levels: 'no'}, {levels: []}]) assert.equal(cleanBench(v), null);
});
