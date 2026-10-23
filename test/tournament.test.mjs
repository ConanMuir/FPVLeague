// Tournament rules (src/tournament/bracket.js) and the saved form (src/tournament/store.js): every format and size builds, advances to a
// champion with simulated results and rebuilds the same from its save; humans and bots are listed and slotted right.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMATS,SIZES,createTournament,entrantName,log2,matchKind,mulberry,playable,replay,report,roundsOf,seedOrder,setupOf,standings,teamsOf} from '../src/tournament/bracket.js';
import {SECOND_PILOT,TOURN_V,cleanEntrant,cleanSetup,loadTournament,newSave} from '../src/tournament/store.js';

const NAMES = ['Rookie', 'Pro', 'All-Star', 'Legend', 'Champion', 'Grand Champion', 'Dribbler', 'Freestyler'];
const entrants = n => Array.from({length: n}, (_, i) => i ? {kind: 'bot', lv: NAMES[(i - 1) % NAMES.length], skill: (i - 1) % NAMES.length} : {kind: 'human', pilot: 'p1', name: 'You'});
const setup = (format, size, o = {}) => ({format, size, team: 1, len: 120, pairing: 'seed', mates: 2, seed: 5, entrants: entrants(size), ...o});
// play it out: the stronger side usually wins (seeded), never a draw
function playOut(T, seed = 1) { const rnd = mulberry(seed); let n = 0;
  while (!T.done) { const p = playable(T); assert.ok(p.length, 'stuck with nothing to play'); const m = p[Math.floor(rnd() * p.length)], sa = T.entrants[m.a].skill ?? 2, sb = T.entrants[m.b].skill ?? 2;
    const aw = rnd() < 1 / (1 + Math.exp(-(sa - sb) * .6)), x = 1 + Math.floor(rnd() * 4), y = Math.floor(rnd() * x); assert.ok(report(T, m.id, aw ? [x, y] : [y, x])); n++; }
  return n; }
const pairKey = m => Math.min(m.a, m.b) + '-' + Math.max(m.a, m.b);

test('seeding: 1 meets the last seed, 4 meets 5', () => { assert.deepEqual(seedOrder(4), [0, 3, 1, 2]); assert.deepEqual(seedOrder(8), [0, 7, 3, 4, 1, 6, 2, 5]); assert.equal(seedOrder(16).length, 16); assert.equal(new Set(seedOrder(16)).size, 16); });

test('every format and size plays to a champion and rebuilds the same from its results', () => {
  for (const [f] of FORMATS) for (const n of SIZES) {
    const T = createTournament(setup(f, n)), k = log2(n), played = playOut(T, n + f.length);
    assert.ok(T.done && T.champion != null, f + n); assert.equal(played, T.results.length);
    const S = standings(T), L = Object.fromEntries(S.map(r => [r.i, r.l]));
    assert.equal(S[0].i, T.champion, f + n + ': the champion tops the standings'); assert.equal(S[0].rank, 1); assert.equal(S.length, n);
    if (f === 'single') { assert.equal(played, n - 1); assert.equal(L[T.champion], 0); assert.ok(S.every(r => r.l <= 1)); assert.equal(S[1].rank, 2, 'a runner-up'); }
    if (f === 'double') { assert.ok(played === 2 * n - 2 || played === 2 * n - 1, 'double: 2n-2 matches, one more with a bracket reset'); assert.ok(L[T.champion] <= 1); assert.ok(S.every(r => r.l <= 2)); assert.ok(S.slice(1).every(r => r.l >= 1), 'everyone but the champion lost'); }
    if (f === 'rr') { assert.equal(played, n * (n - 1) / 2); assert.equal(new Set(T.matches.map(pairKey)).size, played, 'everyone meets everyone once'); assert.equal(T.rounds, n - 1); assert.ok(S.every(r => r.p === n - 1)); }
    if (f === 'swiss') { assert.equal(T.rounds, k); assert.equal(played, k * n / 2); assert.equal(new Set(T.matches.map(pairKey)).size, played, 'no rematches'); for (let r = 1; r <= k; r++) assert.equal(T.matches.filter(m => m.r === r).length, n / 2); }
    for (const m of T.matches) if (m.a != null && m.b != null) assert.notEqual(m.a, m.b);
    const R = replay(setupOf(T), T.results); assert.equal(JSON.stringify(R.matches), JSON.stringify(T.matches), f + n + ': replay'); assert.equal(R.champion, T.champion);
    const half = replay(setupOf(T), T.results.slice(0, played >> 1)); assert.equal(half.done, false); assert.ok(playable(half).length > 0);
    assert.ok(roundsOf(T).every(r => r.name && r.matches.length), 'named rounds');
  }
});

test('report refuses draws, unknown and unready matches; a double-elimination final resets when the losers\' champion wins it', () => {
  const T = createTournament(setup('single', 4, {pairing: 'list'}));
  assert.equal(report(T, 'w1-0', [2, 2]), false); assert.equal(report(T, 'nope', [1, 0]), false); assert.equal(report(T, 'w2-0', [1, 0]), false, 'the final is not ready');
  assert.deepEqual(playable(T).map(m => m.id), ['w1-0', 'w1-1']); assert.equal(matchKind(T, T.matches[0]), 'play'); assert.equal(matchKind(T, T.matches[1]), 'bots'); assert.equal(matchKind(T, T.matches[2]), '');
  const D = createTournament(setup('double', 4, {pairing: 'list'}));
  for (const [id, s] of [['w1-0', [1, 0]], ['w1-1', [1, 0]], ['w2-0', [1, 0]], ['l1-0', [1, 0]], ['l2-0', [0, 1]]]) assert.ok(report(D, id, s), id);
  const f1 = D.matches.find(m => m.id === 'f1-0'); assert.equal(f1.a, 0); assert.equal(f1.b, 2, 'the losers\' champion came through the losers\' bracket');
  assert.ok(report(D, 'f1-0', [0, 1])); assert.equal(D.done, false, 'the losers\' champion wins once: a reset'); assert.deepEqual(playable(D).map(m => m.id), ['f2-0']);
  assert.ok(report(D, 'f2-0', [1, 0])); assert.ok(D.done); assert.equal(D.champion, 0);
  const E = createTournament(setup('double', 4, {pairing: 'list'})); for (const [id, s] of [['w1-0', [1, 0]], ['w1-1', [1, 0]], ['w2-0', [1, 0]], ['l1-0', [1, 0]], ['l2-0', [0, 1]], ['f1-0', [1, 0]]]) assert.ok(report(E, id, s));
  assert.ok(E.done); assert.ok(E.matches.find(m => m.id === 'f2-0').void, 'no reset needed');
});

test('humans and bots: names, teams, team-mates\' level, the hidden second pilot', () => {
  const T = createTournament(setup('rr', 4, {team: 2, mates: 5, entrants: [{kind: 'human', pilot: 'p1', name: 'You'}, {kind: 'bot', lv: 'Legend', skill: 3}, {kind: 'bot', lv: 'Legend', skill: 3}, {kind: 'bot', lv: 'Rookie', skill: 0}]}));
  assert.deepEqual([0, 1, 2, 3].map(i => entrantName(T, i)), ['You', 'Legend A', 'Legend B', 'Rookie']);
  const mine = T.matches.find(m => m.a === 0 || m.b === 0), t = teamsOf(T, mine), side = mine.a === 0 ? 0 : 1;
  assert.equal(t.keys[side][0], 'h'); assert.equal(t.keys[side][1], 'b' + side + '1'); assert.equal(t.skill['b' + side + '1'], 5, 'your team-mate flies the mates level'); assert.equal(t.keys[1 - side].length, 2);
  const bots = T.matches.find(m => m.a === 1 && m.b === 3 || m.a === 3 && m.b === 1), tb = teamsOf(T, bots);
  assert.ok(!tb.keys.flat().includes('h')); assert.deepEqual(tb.keys.flat().map(k => tb.skill[k]).sort(), [0, 0, 3, 3]);
  assert.equal(SECOND_PILOT, false); assert.equal(cleanEntrant({kind: 'human', pilot: 'p2'}, NAMES), null, 'p2 is hidden until a second pilot can fly');
  assert.deepEqual(cleanEntrant({kind: 'human', pilot: 'p1', name: 'A very long pilot name here'}, NAMES), {kind: 'human', pilot: 'p1', name: 'A very long pilo'});
  assert.deepEqual(cleanEntrant({kind: 'bot', lv: 'Legend', skill: 99}, NAMES), {kind: 'bot', lv: 'Legend', skill: 3}, 'a bot is found by its level name');
  assert.equal(cleanEntrant({kind: 'bot', lv: 'Gen 9 Nobody'}, NAMES), null);
});

test('the save: a clean setup, resume with results, a migration from an unversioned save, junk dropped, a stale level cannot resume', () => {
  const T = createTournament(setup('swiss', 8)); playOut(T, 3);
  const half = T.results.slice(0, 6), sv = newSave(setupOf(T), 1000); sv.results = half; const writes = [];
  const L = loadTournament(() => JSON.stringify(sv), o => writes.push(o), NAMES);
  assert.ok(L); assert.equal(L.tv, TOURN_V); assert.equal(writes.length, 0, 'an up-to-date save is not written'); assert.equal(L.results.length, 6); assert.equal(L.started, 1000);
  const R = replay(L.setup, L.results); assert.equal(R.results.length, 6); assert.deepEqual(playable(R).map(m => m.id), playable(replay(setupOf(T), half)).map(m => m.id));
  const old = {setup: sv.setup, results: half}; const w2 = []; const L2 = loadTournament(() => JSON.stringify(old), o => w2.push(o), NAMES);
  assert.ok(L2); assert.equal(L2.tv, TOURN_V); assert.equal(w2.length, 1, 'an unversioned save is migrated and written once'); assert.equal(w2[0].tv, TOURN_V);
  const junk = {tv: 1, setup: {...sv.setup, len: 7, team: 9, pairing: 'x', mates: -1}, results: [...half, {id: 'zz', score: [1]}, null, {id: 'w9-9', score: [1, 0]}, {id: 's1-0', score: [-1, 2]}], started: 'no'};
  const L3 = loadTournament(() => JSON.stringify(junk), () => {}, NAMES); assert.ok(L3); assert.equal(L3.setup.len, 180); assert.equal(L3.setup.team, 1); assert.equal(L3.setup.pairing, 'seed'); assert.equal(L3.setup.mates, 2); assert.equal(L3.results.length, 7, 'well-formed results are kept'); assert.equal(replay(L3.setup, L3.results).results.length, 6, 'one that does not fit the bracket is dropped on replay'); assert.equal(L3.started, 0);
  assert.equal(loadTournament(() => '{garbage', () => {}, NAMES), null); assert.equal(loadTournament(() => null, () => {}, NAMES), null); assert.equal(loadTournament(() => '[]', () => {}, NAMES), null);
  assert.equal(loadTournament(() => JSON.stringify(sv), () => {}, NAMES.slice(0, 2)), null, 'a level that no longer exists');
  assert.equal(loadTournament(() => JSON.stringify({tv: 1, setup: {...sv.setup, size: 4}, results: []}), () => {}, NAMES), null, 'the wrong number of entrants');
  const c = cleanSetup(NAMES)({format: 'rr', size: 4, team: 2, len: 60, pairing: 'random', mates: 3, seed: 9, entrants: entrants(4)});
  assert.deepEqual(Object.keys(c), ['format', 'size', 'team', 'len', 'pairing', 'mates', 'seed', 'entrants']); assert.equal(c.entrants[1].skill, 0);
  const rT = createTournament(c), rT2 = createTournament(c); assert.equal(JSON.stringify(rT.matches), JSON.stringify(rT2.matches), 'a random draw is seeded: the same draw on every load');
});
