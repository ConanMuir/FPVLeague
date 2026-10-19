// Versioned settings (src/config/schema.js, src/config/settings.js): old saves migrate exactly as before the schema rewrite.
// fixtures/settings-golden.json was recorded from the hand-written v16 loader (before config/schema.js) for 65 saved settings:
// v15 saves, every physV, broken and hostile JSON, out-of-range values, Riley's long line / tilt keys, and so on. For each it has
// the hash of the loaded settings' JSON (values and key order), whether dzy exists, and the hash of every write the load made.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {DROP,field,int,isTrue,num,oneOf,runSchema,version} from '../src/config/schema.js';
import {MIGRATIONS,SETTINGS_V,loadSettings} from '../src/config/settings.js';
import {MDEF} from '../src/config/mods.js';

const h = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const G = JSON.parse(fs.readFileSync(new URL('./fixtures/settings-golden.json', import.meta.url), 'utf8'));
const load = raw => { const writes = []; const S = loadSettings(() => { if (raw === '<throws>') throw new Error('blocked'); return raw; }, o => { if (raw !== '<throws>') writes.push(JSON.stringify(o)); }); return {S, writes}; };

test('every recorded save loads bit-for-bit as before (values, key order, writes)', () => {
  for (const [name, g] of Object.entries(G)) {
    const {S, writes} = load(g.raw);
    assert.equal(h(JSON.stringify(S)), g.json, name + ': loaded settings differ');
    assert.equal('dzy' in S, g.dzy, name + ': dzy presence differs');
    assert.deepEqual(writes.map(h), g.writes, name + ': the writes during the load differ');
  }
});

test('a v15 save: old physics defaults move to the new ones, changed values stay, bad values are fixed', () => {
  const v15 = JSON.parse(G.v15.raw), {S, writes} = load(G.v15.raw);
  assert.equal(S.physV, SETTINGS_V); assert.equal(writes.length, MIGRATIONS.length + 1);
  assert.equal(S.mod.thr, MDEF.thr); assert.equal(S.mod.bgrav, MDEF.bgrav); assert.equal(S.mod.grav, 30); assert.equal(S.mod.size, 4); assert.equal(S.mod.bogus, undefined);
  assert.deepEqual(S.loadout, ['stock', 'stock', 'stock', 'none']); assert.equal(S.xcal.length, 4); assert.equal(S.flipBtn, 'a5');
  assert.equal(S.rprof[2].thrLimit, 100); assert.equal(S.rpi, 2); assert.equal(S.gfx, 'auto'); assert.equal(S.map, v15.map); assert.deepEqual(S.train, {});
});

test('migrations run once each, in order, from the saved version', () => {
  const {S, writes} = load(JSON.stringify({physV: 3, mod: {bgrav: 19.5, thr: 124}}));
  assert.equal(S.mod.bgrav, MDEF.bgrav, 'v4 resets an untouched old v3 default'); assert.equal(S.mod.thr, 124, 'v2 already ran for this save');
  assert.equal(writes.length, 2 + 1); assert.deepEqual(writes.slice(0, 2).map(w => JSON.parse(w).physV), [4, 5]);
  assert.equal(load(JSON.stringify({physV: SETTINGS_V})).writes.length, 1, 'an up-to-date save only gets the rate-profile write');
});

test('schema: field order is key order, DROP deletes, if skips, save writes, version runs newer migrations', () => {
  const log = [], S = {b: 1, a: 'x', z: 5};
  runSchema(S, [field('a', oneOf(['x', 'y'], 'y')), field('n', num(0, 10, 3, true), {save: true}), field('z', () => DROP), field('q', isTrue(), {if: S => 'q' in S}),
    version('v', [{v: 1, run: S => log.push('m1')}, {v: 2, run: S => log.push('m2:' + S.v)}]), field('i', int(-1, 4, -1))], o => log.push(JSON.stringify(o)));
  assert.deepEqual(Object.keys(S), ['b', 'a', 'n', 'v', 'i']); assert.equal(S.n, 3); assert.equal(S.i, -1);
  assert.deepEqual(log, ['{"b":1,"a":"x","z":5,"n":3}', 'm1', '{"b":1,"a":"x","n":3,"v":1}', 'm2:1', '{"b":1,"a":"x","n":3,"v":2}']);
  assert.equal(num(0, 100, 7, true)(42.6), 43); assert.equal(num(0, 100, 7)('5'), 7); assert.equal(num(-90, 90, 0)(-200), -90); assert.equal(int(0, 3, 9)(3), 9);
});
