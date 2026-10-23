// Progression (src/progress/): the saved profile, XP rules and anti-farm rules, the match recorder, achievements and cosmetic unlocks.
// fixtures/profile-golden.json was recorded from the v1 loader for 21 saves (none, broken and hostile JSON, prototype keys, huge
// numbers, a full v1 profile, a newer version, long history, many modes, the cosmetics worn at the first load). Each holds the
// loaded profile's JSON (values and key order) and every write the load made, so a later change to the loader or a new migration
// can't silently change what an old save means.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COS,COS_CATS,COS_DEF} from '../src/parts/cosmetics.js';
import {PARTS} from '../src/parts/index.js';
import {PACKS} from '../src/training/packs.js';
import {ACH,ACH_CATS,achProg,packCounts} from '../src/progress/achievements.js';
import {REC_KEYS,newRec,recCounts,recDemo,recFeats,recFloor,recGoal,recHit,recKill,recPop,recSave,recShot,recTouch} from '../src/progress/match-rec.js';
import {PROFILE_MIGRATIONS,PROFILE_V,commitLeft,commitMatch,loadProfile,newProfile,unlockAch,view} from '../src/progress/profile.js';
import {LEVEL_UNLOCKS,UNLOCK,lockOf,newlyUnlocked,reqText} from '../src/progress/unlocks.js';
import {BASE,CAPS,DIFF_F,PERF_CAP,WIN,levelOf,matchXp,packXp,xpFor} from '../src/progress/xp.js';
import {DIFF} from '../src/config/constants.js';

const G = JSON.parse(fs.readFileSync(new URL('./fixtures/profile-golden.json', import.meta.url), 'utf8'));
const load = (raw, cos, now = 1760832000000) => { const writes = []; const P = loadProfile(() => { if (raw === '<throws>') throw new Error('blocked'); return raw; }, o => writes.push(JSON.stringify(o)), {cos, now}); return {P, writes}; };
const STOCK = {...COS_DEF};

test('every recorded profile save loads exactly as recorded (values, key order, writes)', () => {
  assert.ok(Object.keys(G).length >= 20);
  for (const [name, g] of Object.entries(G)) {
    const {P, writes} = load(g.raw, g.cos);
    assert.equal(JSON.stringify(P), g.json, name + ': loaded profile differs');
    assert.deepEqual(writes, g.writes, name + ': the writes during the load differ');
  }
});

test('profile: corrupt or hostile data never throws and always loads a valid profile', () => {
  const junk = ['{', '}{', '[[[', 'undefined', 'NaN', '1e999', '"\\u0000"', '{"xp":{"a":1}}', '{"st":"x"}', '{"st":{"league":[]}}', '{"hist":{"0":1}}', '{"grant":"paint:gold"}',
    '{"ach":[1,2]}', '{"best":null}', '{"pv":"1"}', '{"pv":-3}', '{"since":"yesterday"}', JSON.stringify({st: {league: {goals: {valueOf: 5}}}}), 'x'.repeat(10000)];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const vals = () => [null, true, -1, 0, 3.7, 1e308, 'a', [], {}, [1, 'x'], {m: 2}][Math.floor(rnd() * 11)];
  for (let i = 0; i < 300; i++) { const o = {}; for (const k of ['pv', 'xp', 'st', 'best', 'feat', 'streak', 'bstreak', 'ach', 'grant', 'hist', 'since', 'zz']) if (rnd() < .6) o[k] = k === 'st' ? {league: {goals: vals(), m: vals()}, [String(vals())]: vals()} : vals(); junk.push(JSON.stringify(o)); }
  for (const raw of junk) {
    const {P} = load(raw, STOCK);
    assert.equal(P.pv, PROFILE_V, raw); assert.ok(Number.isInteger(P.xp) && P.xp >= 0, raw);
    for (const m in P.st) for (const [k, v] of Object.entries(P.st[m])) assert.ok(Number.isInteger(v) && v > 0, `${raw}: ${m}.${k}`);
    assert.ok(Array.isArray(P.grant) && Array.isArray(P.hist) && P.hist.length <= 10, raw);
    assert.equal(Object.getPrototypeOf(P.st), Object.prototype, raw);
    assert.doesNotThrow(() => view(P, null, {}), raw);
  }
});

test('profile migration v1: what you wore before progression stays unlocked; it runs once', () => {
  const cos = {paint: 'chrome', decal: 'check', props: 'team', bell: 'oil', led: 'team', trail: 'rainbow'};
  const {P, writes} = load(null, cos);
  assert.equal(writes.length, 1); assert.deepEqual(P.grant, ['paint:chrome', 'decal:check', 'bell:oil', 'trail:rainbow']);
  for (const c of COS_CATS) assert.equal(lockOf(P, c, cos[c]), null, c);
  assert.ok(lockOf(P, 'paint', 'gold'), 'other locked items stay locked');
  const again = load(writes[0], {paint: 'pearl'});
  assert.equal(again.writes.length, 0, 'an up-to-date profile is not rewritten'); assert.ok(lockOf(again.P, 'paint', 'pearl'), 'the migration does not run twice');
  assert.equal(PROFILE_MIGRATIONS.at(-1).v, PROFILE_V);
});

test('levels: XP needed grows, then flattens; levelOf and xpFor agree', () => {
  assert.equal(levelOf(0).lv, 1); assert.equal(levelOf(299).lv, 1); assert.equal(levelOf(300).lv, 2);
  for (const lv of [2, 5, 10, 16, 17, 30, 50, 98, 99]) { assert.equal(levelOf(xpFor(lv)).lv, lv, 'lv ' + lv); assert.equal(levelOf(xpFor(lv) - 1).lv, lv - 1, 'lv ' + lv); }
  assert.equal(levelOf(1e12).lv, 99); assert.equal(levelOf(-50).lv, 1); assert.equal(levelOf(NaN).lv, 1);
});

const good = {touches: 30, goals: 2, assists: 1, saves: 2, shots: 4, pops: 3, chainSteps: 1, aerial: 1};
test('match XP: base + win + performance, scaled by match length and opponent level', () => {
  const x = matchXp(good, {played: 180, won: true, df: 1, opp: 2});
  assert.equal(x.items[0].xp, BASE); assert.equal(x.items[1].xp, WIN); assert.equal(x.total, x.items.reduce((a, i) => a + i.xp, 0));
  assert.ok(x.total > 150 && x.total < 300, String(x.total));
  assert.ok(matchXp(good, {played: 180, won: false, df: 1, opp: 2}).total < x.total, 'a win is worth more');
  assert.ok(matchXp(good, {played: 180, won: true, df: DIFF_F[5], opp: 2}).total > matchXp(good, {played: 180, won: true, df: DIFF_F[0], opp: 2}).total, 'Grand Champion beats Rookie');
  assert.equal(DIFF_F.length, DIFF.length, 'a difficulty factor for every bot level');
  const short = matchXp(good, {played: 10, won: true, df: 1, opp: 1});
  assert.equal(short.items[0].xp, Math.round(BASE * .1), 'a (hand-edited) 10 s match: base clamps at 0.1');
  assert.ok(short.total < x.total / 4, `a 10 s match can't farm the performance cap (${short.total} vs ${x.total})`);
  assert.ok(matchXp(good, {played: 120, won: true, df: 1, opp: 1}).total < x.total, 'a 2 min match gives a little less than a 3 min one');
  assert.equal(matchXp(good, {played: 3000, won: true, df: 1, opp: 1}).items[0].xp, Math.round(BASE * 5 / 3), 'a long one at 5/3');
});

test('anti-farm: no opponents, idling, own goals and stat padding give nothing extra', () => {
  assert.equal(matchXp(good, {played: 180, won: true, df: 1, opp: 0}).total, 0, 'alone (No bots): no XP');
  assert.equal(matchXp({touches: 2}, {played: 180, won: true, df: 1.3, opp: 3}).total, 0, 'idle while bot team-mates win: no XP');
  assert.equal(matchXp({touches: 50, og: 9}, {played: 180, won: false, df: 1, opp: 1}).total, BASE, 'own goals: only the base for playing');
  const g1 = matchXp({touches: 30, goals: 1}, {played: 180, won: true, df: 1, opp: 1}), g10 = matchXp({touches: 30, goals: 10}, {played: 180, won: true, df: 1, opp: 1});
  assert.ok(g10.total - g10.items[0].xp - g10.items[1].xp < 10 * (g1.total - BASE - WIN) * .7, 'diminishing returns per match');
  const huge = matchXp({touches: 1e5, goals: 1e3, saves: 1e3, shots: 1e3, pops: 1e3, kills: 1e3}, {played: 300, won: true, df: 1.3, opp: 3});
  assert.ok(huge.total <= Math.round(BASE * 5 / 3) + Math.round(WIN * 5 / 3 * 1.3) + PERF_CAP, 'a hard ceiling per match');
  assert.equal(matchXp({touches: 30, shots: 100}, {played: 180, won: false, df: 1, opp: 1}).raw, CAPS.shots * 4, 'shots count up to their cap');
});

test('training XP: only newly done shots, the first full clear, and a 5% faster best', () => {
  assert.equal(packXp(null, {n: 0, of: 8, t: 0}, 0).total, 0);
  assert.equal(packXp(null, {n: 4, of: 8, t: 20}, 0).total, 40);
  const clear = packXp({n: 6, of: 8, t: 50}, {n: 8, of: 8, t: 60}, 2); assert.deepEqual(clear.items.map(i => i.k), ['shots', 'clear']); assert.equal(clear.total, 2 * 20 + 120);
  assert.equal(packXp({n: 8, of: 8, t: 60}, {n: 8, of: 8, t: 60}, 2).total, 0, 'repeating a cleared pack: nothing');
  assert.equal(packXp({n: 8, of: 8, t: 60}, {n: 8, of: 8, t: 58}, 2).total, 0, 'a tiny time gain: nothing');
  assert.equal(packXp({n: 8, of: 8, t: 60}, {n: 8, of: 8, t: 56}, 2).total, 10);
  assert.equal(packXp({n: 8, of: 8, t: 60}, {n: 5, of: 8, t: 20}, 2).total, 0, 'a worse run: nothing');
});

// a League match from the recorder's side: you are 'h' on blue (team 0); b01 a blue bot, b10 / b11 orange bots
const rec = () => newRec({mode: 'league', key: 'h', team: 0});
const touch = (r, key, t, y = 1, pop = false) => recTouch(r, {key, team: key === 'h' || key[1] === '0' ? 0 : 1, t, y, pop});
test('recorder: goals, own goals, assists, saves, shots, demos; other pilots\' events are not yours', () => {
  const r = rec();
  touch(r, 'h', 1); recGoal(r, {team: 0, by: 'h', t: 2});
  touch(r, 'h', 10); touch(r, 'b01', 12); recGoal(r, {team: 0, by: 'b01', t: 13});
  touch(r, 'h', 20); touch(r, 'b10', 21); touch(r, 'b01', 22); recGoal(r, {team: 0, by: 'b01', t: 23});
  touch(r, 'h', 30); touch(r, 'b01', 50); recGoal(r, {team: 0, by: 'b01', t: 51});
  touch(r, 'h', 60); recGoal(r, {team: 1, by: 'h', t: 61});
  touch(r, 'h', 70); touch(r, 'b10', 71); recGoal(r, {team: 1, by: 'b10', t: 72});
  recSave(r, 'h'); recSave(r, 'b01'); recShot(r, 'h'); recShot(r, 'b10');
  recDemo(r, {key: 'b10', team: 1}, {key: 'h', team: 0}); recDemo(r, {key: 'b01', team: 0}, {key: 'h', team: 0}); recDemo(r, {key: 'b11', team: 1}, {key: 'b01', team: 0});
  const c = recCounts(r);
  assert.equal(c.goals, 1); assert.equal(c.og, 1); assert.equal(c.assists, 1, 'only the pass right before a team-mate\'s goal, inside 8 s');
  assert.equal(c.saves, 1); assert.equal(c.shots, 1); assert.equal(c.demos, 1, 'demolishing a team-mate does not count'); assert.equal(c.conceded, 2);
  assert.deepEqual(r.score, [4, 2]); assert.deepEqual(Object.keys(c), REC_KEYS);
});

test('recorder: pop chains, aerial / pop / air dribble goals', () => {
  const r = rec();
  recPop(r, 'h'); touch(r, 'h', 1, 2, true); touch(r, 'h', 1.01, 2, true);
  recPop(r, 'h'); touch(r, 'h', 2.5, 5, true); recPop(r, 'h'); touch(r, 'h', 4, 6, true);
  assert.equal(r.pops, 3, 'one count per pop, however many contact steps'); assert.equal(r.bestChain, 3); assert.equal(r.chains, 1); assert.equal(r.chainSteps, 2);
  recGoal(r, {team: 0, by: 'h', t: 5}); assert.equal(r.aerial, 1); assert.equal(r.popg, 1); assert.equal(r.adrib, 0, 'two touches up high are not an air dribble');
  recPop(r, 'h'); touch(r, 'h', 10, 1, true); recFloor(r); recPop(r, 'h'); touch(r, 'h', 11, 1, true); assert.equal(r.chain, 1, 'the ball landing ends a chain');
  touch(r, 'b10', 11.5); recPop(r, 'h'); touch(r, 'h', 12, 1, true); assert.equal(r.chain, 1, 'someone else touching ends a chain');
  recPop(r, 'h'); touch(r, 'h', 20, 1, true); recPop(r, 'h'); touch(r, 'h', 23.5, 1, true); assert.equal(r.chain, 1, 'too slow');
  for (let t = 30; t < 31.2; t += .3) touch(r, 'h', t, 4);
  recGoal(r, {team: 0, by: 'h', t: 32}); assert.equal(r.adrib, 1);
  touch(r, 'h', 40, 4); touch(r, 'h', 40.2, 4); touch(r, 'h', 40.4, 4); recGoal(r, {team: 0, by: 'h', t: 41}); assert.equal(r.adrib, 1, 'three touches in 0.4 s are not an air dribble');
  touch(r, 'h', 50, .4); recGoal(r, {team: 0, by: 'h', t: 51}); assert.equal(r.aerial, 3, 'a goal off a touch 0.4 m up is not aerial'); assert.equal(r.goals, 4);
});

test('recorder: Dogfight kills, turrets, deaths, hits; match feats', () => {
  const r = newRec({mode: 'df', key: 'h', team: 0});
  recKill(r, {key: 'b10', team: 1}, 'h'); recKill(r, {key: null, team: 1, turret: true}, 'h'); recKill(r, {key: 'b01', team: 0}, 'h'); recKill(r, {key: 'h', team: 0}, 'b10'); recKill(r, {key: 'b11', team: 1}, 'b01');
  recHit(r, {team: 1}, 'h'); recHit(r, {team: 0}, 'h'); recHit(r, {team: 1}, null);
  assert.deepEqual([r.kills, r.turrets, r.deaths, r.hits], [1, 1, 1, 1]);
  const lg = rec(); recGoal(lg, {team: 1, by: 'b10', t: 1}); recGoal(lg, {team: 1, by: 'b10', t: 2}); recGoal(lg, {team: 0, by: 'h', t: 3}); recGoal(lg, {team: 0, by: 'h', t: 4}); recGoal(lg, {team: 0, by: 'h', t: 5});
  const f = recFeats(lg, {winner: 0, overtime: true, oppBots: true, mateBots: false, diffs: [5]});
  assert.deepEqual(f, {won: true, clean: 0, comeback: 1, ot: 1, champ: 1, gc: 1});
  assert.equal(recFeats(lg, {winner: 0, overtime: false, oppBots: true, mateBots: true, diffs: [5, 5]}).gc, 0, 'bot team-mates: no Giant Slayer');
  assert.equal(recFeats(lg, {winner: 0, overtime: false, oppBots: true, mateBots: false, diffs: [3]}).champ, 0, 'Legend is not Champion');
  assert.equal(recFeats(lg, {winner: 1, overtime: false, oppBots: true, mateBots: false, diffs: [5]}).gc, 0);
  const hard = recFeats(lg, {winner: 0, overtime: false, oppBots: true, mateBots: false, diffs: [7, 9]});
  assert.deepEqual([hard.champ, hard.gc], [1, 1], 'the Freestyler and an evolved level are harder than Grand Champion: Champion Material and Giant Slayer');
  assert.deepEqual((f => [f.champ, f.gc])(recFeats(lg, {winner: 0, overtime: false, oppBots: true, mateBots: false, diffs: [4, 6]})), [1, 0], 'a Champion with a Dribbler: Champion Material only');
});

test('profile commits: stats, records, streaks, history, achievements and the unlocks they bring', () => {
  const P = newProfile({cos: STOCK, now: 1});
  const r = rec(); for (let i = 0; i < 3; i++) { touch(r, 'h', i * 10); recGoal(r, {team: 0, by: 'h', t: i * 10 + 1}); }
  const V0 = view(P, r, {}); assert.equal(V0.st.league.goals, 3, 'the view includes the match in progress');
  const live = unlockAch(P, V0, 5).map(a => a.id); assert.ok(live.includes('goal1') && live.includes('hat'), live.join());
  assert.equal(lockOf(P, 'decal', 'check'), null, 'Hat Trick unlocks the Chequered decal');
  const f = recFeats(r, {winner: 0, overtime: false, oppBots: true, mateBots: true, diffs: [2]}), x = matchXp({...recCounts(r), clean: f.clean}, {played: 180, won: true, df: DIFF_F[2], opp: 2});
  commitMatch(P, r, f, x.total, 9);
  assert.equal(P.st.league.m, 1); assert.equal(P.st.league.w, 1); assert.equal(P.st.league.goals, 3); assert.equal(P.best.goals, 3); assert.equal(P.xp, x.total); assert.equal(P.streak, 1);
  assert.deepEqual(P.hist[0], {m: 'league', r: 'W', s: [3, 0], xp: x.total, t: 9});
  assert.ok(unlockAch(P, view(P, null, {}), 10).some(a => a.id === 'clean' || a.id === 'win1'));
  const left = rec(); touch(left, 'h', 1); recGoal(left, {team: 0, by: 'h', t: 2}); const xp = P.xp; commitLeft(P, left);
  assert.equal(P.st.league.goals, 4); assert.equal(P.st.league.m, 1, 'a left match is not a finished one'); assert.equal(P.xp, xp, 'and gives no XP'); assert.equal(P.streak, 1);
  for (let i = 0; i < 15; i++) commitMatch(P, rec(), {won: false}, 0, i);
  assert.equal(P.hist.length, 10); assert.equal(P.streak, 0); assert.equal(P.bstreak, 1);
  const before = {xp: 0, ach: {}, grant: []}; assert.ok(newlyUnlocked(before, P).includes('decal:check'));
});

test('achievements: 20-40 of them, unique, each with a reachable goal, a category and a working progress bar', () => {
  assert.ok(ACH.length >= 20 && ACH.length <= 40, String(ACH.length));
  assert.equal(new Set(ACH.map(a => a.id)).size, ACH.length);
  const cats = new Set(ACH_CATS.map(c => c[0])), V = view(newProfile({now: 1}), null, {});
  for (const a of ACH) { assert.ok(cats.has(a.cat) && a.name && a.desc && a.goal >= 1, a.id); const p = achProg(a, V); assert.equal(p.v, 0, a.id); assert.equal(p.done, false, a.id); }
  const all = Object.fromEntries(PACKS.map(P => [P.id, {n: P.shots.length, of: P.shots.length, t: 30}]));
  const pc = packCounts(all); assert.equal(pc.done, PACKS.length);
  const V2 = view(newProfile({now: 1}), null, all); for (const id of ['pack1', 'rookies', 'allstar', 'packs10']) assert.ok(achProg(ACH.find(a => a.id === id), V2).done, id);
  assert.equal(packCounts({'striker-rookie': {n: 3, of: 8, t: 9}, nope: {n: 5}}).done, 0);
});

test('unlocks: cosmetic only, defaults and most items free from the start, every requirement points at something real', () => {
  const P = newProfile({cos: STOCK, now: 1}), total = COS_CATS.reduce((a, c) => a + COS[c].length, 0);
  for (const k of UNLOCK.keys()) { const [c, id] = k.split(':'); assert.ok(COS[c]?.some(x => x.id === id), k); assert.notEqual(COS_DEF[c], id, k + ' is a default'); }
  for (const c of COS_CATS) assert.equal(lockOf(P, c, COS_DEF[c]), null);
  let free = 0; for (const c of COS_CATS) for (const it of COS[c]) if (!lockOf(P, c, it.id)) free++;
  assert.ok(free >= 45 && free / total > .6, `${free}/${total} free from the start`);
  for (const c of COS_CATS) assert.ok(COS[c].filter(it => !lockOf(P, c, it.id)).length >= 4, c + ': a real choice from the start');
  for (const slot of Object.keys(PARTS)) for (const p of PARTS[slot]) assert.ok(![...UNLOCK.keys()].some(k => k.endsWith(':' + p.id) && k.startsWith(slot)), 'parts are never locked');
  const rewards = ACH.filter(a => a.reward).map(a => a.reward); assert.equal(new Set(rewards).size, rewards.length);
  assert.ok(LEVEL_UNLOCKS.every(([lv], i) => lv > 1 && (!i || lv > LEVEL_UNLOCKS[i - 1][0])));
  P.xp = xpFor(6); assert.equal(lockOf(P, 'paint', 'forged'), null); assert.ok(lockOf(P, 'paint', 'midnight'));
  assert.equal(reqText({lv: 10}), 'Reach level 10'); assert.equal(reqText({ach: 'hat'}), 'Achievement: Hat Trick');
});
