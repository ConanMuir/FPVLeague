// Cosmetics data: untrusted ids are cleaned, bots get valid seeded looks, and the team colour rule keeps rival hues off a team.
import test from 'node:test';
import assert from 'node:assert/strict';
import {COS,COS_CATS,COS_DEF,RARITY,cleanCos,cosIds,seededCos,shifted,teamSafe} from '../src/parts/cosmetics.js';

test('every item has a unique id, a name and a known rarity', () => {
  for (const c of COS_CATS) {
    const ids = COS[c].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, c);
    for (const it of COS[c]) { assert.ok(it.name && RARITY[it.r], `${c}/${it.id}`); assert.ok(it.id.length < 16); }
    assert.equal(COS[c][0].id, COS_DEF[c], `${c}: the default is the first item`);
  }
});

test('cleanCos: saves and network input', () => {
  assert.deepEqual(cleanCos(undefined), COS_DEF);
  assert.deepEqual(cleanCos('candy'), COS_DEF);
  assert.deepEqual(cleanCos({paint: 'candy', decal: 'nope', props: 5, led: 'green'}), {...COS_DEF, paint: 'candy', led: 'green'});
  const a = ['chrome', 'n23', 'smoke', 'oil', 'cyan', 'plasma'];
  assert.deepEqual(cosIds(cleanCos(a)), a);
  assert.deepEqual(cleanCos(['x'.repeat(40), {}, null]), COS_DEF);
  assert.deepEqual(cleanCos(new Array(500).fill('carbon')), COS_DEF);
  assert.deepEqual(cleanCos({paint: '__proto__', decal: 'constructor'}), COS_DEF);
});

test('seededCos: valid and stable per key and seed', () => {
  for (let s = 0; s < 50; s++) for (const k of ['b00', 'b01', 'b10']) {
    const c = seededCos(k, s); assert.deepEqual(cleanCos(c), c); assert.deepEqual(seededCos(k, s), c);
  }
});

test('teamSafe: null is the team colour, rival hues move to your own team, others stay', () => {
  assert.equal(teamSafe(null, 0), 0x2d8cff); assert.equal(teamSafe(null, 1), 0xff7a1a);
  assert.ok(shifted(0xff9a1a, 0), 'amber on blue reads as orange');
  assert.ok(!shifted(0xff9a1a, 1), 'amber on orange is fine');
  assert.ok(shifted(0x2d8cff, 1), 'blue on orange reads as blue');
  for (const h of [0xffffff, 0x101114, 0x9a0c18, 0x3dff6a, 0xa04dff, 0xe0bd55, 0x9a7c1a]) for (const t of [0, 1]) assert.ok(!shifted(h, t), h.toString(16));
});
