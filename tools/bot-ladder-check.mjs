/* Check: one tiny generation of the bot self-play ladder (tools/bot-ladder.mjs) runs end to end headless and writes a valid file, twice
   with the same seed to the same results (deterministic), and the game-side loader (src/bots/evolved-levels.js) turns such a file into
   a few well-formed levels. Exits 1 on a failure. Runs in CI's league area with a small budget (one archetype, one child, 1 sim minute).
     node tools/bot-ladder-check.mjs [--keep] */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BOUNDS, loadFile, mutableKeys, mutate, mulberry, outOfBounds, root, runLadder, tableText, validateFile} from './bot-ladder-lib.mjs';
import {MAX_LEVELS, evolvedLevels} from '../src/bots/evolved-levels.js';

let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const T0 = Date.now(), el = () => `[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)} s]`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-ladder-')), keep = process.argv.includes('--keep');
const {DIFF} = await import(pathToFileURL(path.join(root, 'src/config/constants.js')).href);

/* ---------- the pure parts: mutation stays inside the bounds, the loader keeps to a few levels ---------- */
{
  const rnd = mulberry(5); let bad = 0, changed = 0;
  for (const n of ['Legend', 'Dribbler', 'Freestyler']) { const p = DIFF.find(d => d.n === n); for (let i = 0; i < 200; i++) { const m = mutate(p, rnd); bad += outOfBounds(m.profile).length; changed += Object.keys(m.keys).length; if (m.profile.iq !== p.iq || m.profile.drib !== p.drib || m.profile.fs !== p.fs) bad++; } }
  ok(bad === 0 && changed >= 600, `600 mutations of Legend / Dribbler / Freestyler stay inside the bounds and keep the flags (${changed} tunables stepped)`);
  const keys = n => mutableKeys(DIFF.find(d => d.n === n)).map(k => k[0]);
  ok(!keys('Legend').some(k => k in BOUNDS.drib || k in BOUNDS.fs) && keys('Dribbler').includes('hold') && !keys('Dribbler').includes('tapP') && keys('Freestyler').includes('tapP'), 'each archetype mutates only the tunables its controller reads');
  const file = {v: 1, profiles: [{id: 'a', arch: 'Dribbler', gen: 2, parent: 'Dribbler', profile: {kp: 2, drib: 1}}, {id: 'b', arch: 'Dribbler', gen: 5, parent: 'a', profile: {kp: 2.1, drib: 1}}, {id: 'c', arch: 'Legend', gen: 1, parent: 'Legend', profile: {kp: 1.9}}, {id: 'd', arch: 'Freestyler', gen: 3, parent: 'Freestyler', profile: {fs: 1}}, {id: 'e', arch: 'Champion', gen: 9, parent: 'Champion', profile: {}}, null, {id: 'x'}]};
  const L = evolvedLevels(file, DIFF.map(d => d.n));
  ok(L.length === MAX_LEVELS && L.map(l => l.n).join('|') === 'Gen 1 Legend|Gen 9 Champion|Gen 5 Dribbler' && L[2].id === 'b' && L[2].kp === 2.1 && L[2].drib === 1, `the loader offers the latest generation per archetype, at most ${MAX_LEVELS}, in the stock order: ${L.map(l => l.n).join(', ')}`);
  ok(evolvedLevels(null).length === 0 && evolvedLevels({}).length === 0 && evolvedLevels({profiles: 'no'}).length === 0, 'no file, or a malformed one, adds nothing');
}

/* ---------- a tiny generation, twice ---------- */
const opts = {out: path.join(dir, 'a.json'), seed: 7, roster: ['Dribbler'], cands: 1, matchMin: 1, parallel: 1, gens: 1, minutes: 0, rr: false, rrEnd: false, fresh: true, log: m => console.log('  ' + m)};
console.log(`${el()} ladder run A (Dribbler, 1 child, 1 sim min)`);
const A = await runLadder(opts);
ok(A.gen === 1 && A.games >= 2 && A.log.length === 1 && A.log[0].matches.length >= 2, `one generation ran: ${A.games} matches, log ${A.log.length} entry`);
ok(A.page.levels.length === DIFF.length + (fs.existsSync(path.join(root, 'src/bots/evolved.json')) ? evolvedLevels(JSON.parse(fs.readFileSync(path.join(root, 'src/bots/evolved.json'), 'utf8')), DIFF.map(d => d.n)).length : 0) && A.page.levels.join('|') === A.page.select.join('|'), `the game lists ${A.page.levels.length} levels and the menu's Bot skill select matches them: ${A.page.levels.slice(-3).join(', ')}`);
const F = loadFile(opts.out), bad = validateFile(F, opts.roster);
ok(bad.length === 0, 'the file is valid' + (bad.length ? ': ' + bad.join('; ') : ''));
ok(F.log[0].gate && Array.isArray(F.log[0].gate.why) && F.log[0].gate.stats && typeof F.log[0].gate.stats.touchesPerMin === 'number', `the log carries the gate's verdict and stats (${F.log[0].promoted ? 'promoted' : 'not promoted'}: ${F.log[0].gate.why.join('; ') || 'passed'})`);
ok(Object.keys(F.log[0].keys).length >= 1 && Object.values(F.log[0].keys).every(([a, b]) => Number.isFinite(a) && Number.isFinite(b)), `the child changed ${Object.keys(F.log[0].keys).join(', ')}`);
const r0 = F.log[0].matches[0]; ok(r0.score.every(Number.isFinite) && F.log[0].gate.stats.min > .5, `a match has a score (${r0.score.join('-')}) and play time (${F.log[0].gate.stats.min} min)`);
const levels = evolvedLevels(F, DIFF.map(d => d.n));
ok(levels.length === F.profiles.length && levels.every(l => l.drib === 1 && l.iq === 2 && outOfBounds(l).length === 0 && /^Gen \d+ Dribbler$/.test(l.n)), `the loader turns the file into ${levels.length} level(s)${levels.length ? ': ' + levels.map(l => l.n).join(', ') : ''}`);
console.log(`${el()} ladder run B (same seed)`);
const B = await runLadder({...opts, out: path.join(dir, 'b.json')});
const res = D => D.log.map(e => e.matches.map(m => `${m.size}v${m.size}@${m.seed}=${m.score.join('-')}`).join(' ')).join(';');
ok(res(A) === res(B), `the same seed gives the same matches: ${res(A)}`);
ok(JSON.stringify(A.ratings) === JSON.stringify(B.ratings) && JSON.stringify(A.log[0].gate.stats) === JSON.stringify(B.log[0].gate.stats), 'and the same ratings and stats');
console.log(tableText(A.table));

if (!keep) fs.rmSync(dir, {recursive: true, force: true}); else console.log('kept ' + dir);
console.log(`${el()} ${fails ? fails + ' FAILED' : 'all ok'}`);
process.exit(fails ? 1 : 0);
