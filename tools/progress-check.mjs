// Progression check: real matches through the live modules (headless Edge, Vite dev server), fast-forwarded with the fixed step:
//  1. an idle League match vs bots gives no XP, but is recorded (a loss) and shows the post-match summary
//  2. an autopiloted League match (your drone flown by the Grand Champion bot code) earns XP from its own goals / touches
//  3. League with No bots (no opponents) is not recorded at all; Freeplay neither
//  4. a Dogfight match is recorded under its own mode
//  5. a training pack: XP for newly done shots, none for repeating the same result
//  6. the profile survives a reload; a corrupt profile save loads clean (and is kept aside)
//   node tools/progress-check.mjs [--shots]     --shots: screenshots of the summary, Profile, Garage locks and the pack XP line in shots/
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser, gameReady} from './browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SHOTS = process.argv.includes('--shots'), out = path.join(root, 'shots');
if (SHOTS) fs.mkdirSync(out, {recursive: true});
const {createServer} = await import('vite');
const server = await createServer({root, logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist', '--window-size=1280,720']}), sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const shot = async (p, n) => { if (SHOTS) { await sleep(350); await p.screenshot({path: path.join(out, `progress-${n}.png`)}); } };
try {
  const p = await b.newPage(); await p.setViewport({width: 1280, height: 720}); const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { const u = m.location()?.url || ''; if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text() + ' ' + u)) errs.push(m.text() + ' ' + u); });
  await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
  await p.evaluate(async () => {
    const M = window.__pc = {GS: (await import('/src/state.js')).GS, MA: await import('/src/modes/match.js'), ST: await import('/src/modes/step.js'), DF: await import('/src/modes/dogfight.js'),
      S: (await import('/src/config/settings.js')).S, TR: await import('/src/progress/tracker.js'), TM: await import('/src/modes/training.js'), J: await import('/src/training/judge.js')};
    // a match from kickoff to its end with the fixed step; auto: your drone is flown by the bot code (Grand Champion) against Rookies
    M.match = (mode, {len = 30, auto = false, bots = 1, size = 1, maxSec = 240} = {}) => { const {GS, MA, ST, DF, S} = M; S.len = len; S.size = size; S.bots = bots; S.diff = 0; DF.setGame(mode); MA.startMatch(); GS.paused = true;
      if (auto) { GS.player.bot = true; GS.player.skill = 5; GS.player.pops = true; }
      const rec0 = M.TR.profSnap().rec; let n = 0; while (GS.state !== 'end' && n < maxSec * 120) { ST.step(1 / 120); n++; }
      return {state: GS.state, score: [...GS.score], sim: +(n / 120).toFixed(1), rec0, me: GS.player.team}; };
  });
  const prof = () => p.evaluate(() => window.__pc.TR.profSnap()), vis = s => p.$eval(s, e => !e.hidden);

  // 1. idle
  const a = await p.evaluate(() => window.__pc.match('league', {len: 20}));
  let P = await prof(); await sleep(2300);
  ok(a.state === 'end' && a.rec0 && a.rec0.mode === 'league', `idle League match ran to the end and was recorded (${a.score.join('-')}, ${a.sim} s)`);
  ok(P.hist.length === 1 && P.hist[0].xp === 0 && P.xp === 0, `idle: no XP (hist ${JSON.stringify(P.hist[0])})`);
  ok(await vis('#pmsum') && /idling/i.test(await p.$eval('#pmsum', e => e.textContent)), 'idle: the summary shows and says why there was no XP');
  await p.click('#pmok'); ok(!(await vis('#pmsum')), 'Continue closes the summary');

  // 2. autopilot League
  const c = await p.evaluate(() => window.__pc.match('league', {len: 120, auto: true}));
  P = await prof(); const h = P.hist[0], st = P.st.league || {};
  ok(c.state === 'end' && P.hist.length === 2, `autopiloted League match ended (${c.score.join('-')} for team ${c.me}, ${c.sim} s)`);
  ok(h.xp > 40 && P.xp === h.xp, `autopilot earned XP: ${h.xp} (${h.r}, goals ${st.goals || 0}, touches ${st.touches || 0}, saves ${st.saves || 0}, pops ${st.pops || 0})`);
  ok((st.touches || 0) >= 3 && st.m === 2, `League stats: ${JSON.stringify(st)}`);
  await sleep(2300); const sum = await p.$eval('#pmsum', e => e.textContent);
  ok(await vis('#pmsum') && /Match played/.test(sum) && /XP earned/.test(sum), 'the summary lists the XP sources');
  await shot(p, 'summary');
  console.log('     achievements: ' + P.ach.join(', '));
  await p.click('#pmok');

  // 3. no opponents / Freeplay: not recorded
  const nb = await p.evaluate(() => { const r = window.__pc.match('league', {bots: 0, maxSec: 5}); return r.rec0; });
  ok(nb === null, 'League with No bots (nobody to beat) is not recorded');
  const fp = await p.evaluate(() => { const {GS, MA, DF, TR, ST} = window.__pc; DF.setGame('free'); MA.startMatch(); GS.paused = true; for (let i = 0; i < 240; i++) ST.step(1 / 120); return TR.profSnap().rec; });
  ok(fp === null, 'Freeplay is not recorded');

  // 4. Dogfight
  const d = await p.evaluate(() => window.__pc.match('df', {len: 30, auto: true, size: 2, maxSec: 400}));
  P = await prof(); const df = P.st.df || {};
  ok(d.state === 'end' && df.m === 1 && P.hist[0].s.join() === [d.score[d.me], d.score[1 - d.me]].join(),`Dogfight match recorded under its own mode (${d.score.join('-')}, kills ${df.kills || 0}, deaths ${df.deaths || 0}, hits ${df.hits || 0}, ${d.sim} s, XP ${P.hist[0].xp})`);
  await sleep(2300); await p.click('#pmok').catch(() => {});

  // 5. training pack XP
  const xp0 = (await prof()).xp;
  const tp = await p.evaluate(() => { const {TM, J, GS, TR} = window.__pc; TM.startPack('striker-rookie'); GS.paused = true; for (let i = 0; i < 3; i++) J.record(TM.TR.res[i], true, 4 + i); TM.finish(); const a = TR.profSnap().xp;
    TM.restartPack(); GS.paused = true; for (let i = 0; i < 3; i++) J.record(TM.TR.res[i], true, 4 + i); TM.finish(); return {a, b: TR.profSnap().xp}; });
  ok(tp.a - xp0 === 30 && tp.b === tp.a, `training: +${tp.a - xp0} XP for 3 new shots, +${tp.b - tp.a} for repeating it`);
  await sleep(300); ok(await vis('#trsxp') && /Beat your best/.test(await p.$eval('#trsxp', e => e.textContent)), 'the pack summary shows its XP line');
  await p.evaluate(() => { const {TM, J, GS} = window.__pc; TM.restartPack(); GS.paused = true; for (let i = 0; i < 5; i++) J.record(TM.TR.res[i], true, 4 + i); TM.finish(); }); await sleep(400);
  await shot(p, 'train-xp');

  // screenshots of the Profile and the Garage locks
  if (SHOTS) {
    await p.evaluate(() => { const {TM, MA} = window.__pc; TM.exitTrain(); MA.startDemo(); }); await sleep(600);
    await shot(p, 'menu');
    await p.$eval('#profbtn', e => e.click()); await shot(p, 'profile-stats');
    await p.$eval('#pftabs [data-t="ach"]', e => e.click()); await shot(p, 'profile-ach');
    await p.$eval('#pftabs [data-t="unl"]', e => e.click()); await shot(p, 'profile-unlocks');
    await p.$eval('#pftabs [data-t="hist"]', e => e.click()); await shot(p, 'profile-matches');
    await p.keyboard.press('Escape'); await p.$eval('#garbtn', e => e.click()); await sleep(800);
    await p.$eval('#gtabs button[data-s="4"]', e => e.click()); await p.$eval('#gslots button[data-c="paint"][data-id="chrome"]', e => e.click()); await shot(p, 'garage-paint');
    await p.$eval('#gtabs button[data-s="9"]', e => e.click()); await p.$eval('#gslots button[data-c="trail"][data-id="gold"]', e => e.click()); await shot(p, 'garage-trail');
    await p.$eval('#gok', e => e.click());
    await p.setViewport({width: 400, height: 800}); await p.$eval('#profbtn', e => e.click()); await shot(p, 'profile-phone'); await p.setViewport({width: 1280, height: 720});
  }

  // 6. reload keeps the profile; a corrupt one loads clean and is kept aside
  const before = await prof(); await p.reload(); await gameReady(p); const after = await p.evaluate(() => window.__dl.prof());
  const norm = st => JSON.stringify(Object.keys(st).sort().map(m => [m, Object.entries(st[m]).sort()]));  // the saved copy has the schema's key order
  ok(after.xp === before.xp && after.hist.length === before.hist.length && norm(after.st) === norm(before.st), `the profile survives a reload (${after.xp} XP, level ${after.lv})` + (after.xp === before.xp ? '' : `\n     before ${JSON.stringify(before)}\n     after  ${JSON.stringify(after)}`));
  await p.evaluate(() => localStorage.setItem('droneleague.profile', '{"xp":12,"st":')); await p.reload(); await gameReady(p);
  const bad = await p.evaluate(() => ({p: window.__dl.prof(), bak: localStorage.getItem('droneleague.profile.bak')}));
  ok(bad.p.xp === 0 && bad.bak === '{"xp":12,"st":', 'a corrupt profile loads as a fresh one and the old text is kept in droneleague.profile.bak');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
} catch (e) { console.log('FAIL ' + (e.stack || e)); fails++; }
finally { await b.close(); await server.close(); }
console.log(fails ? `${fails} check(s) failed` : 'all progression checks passed'); process.exit(fails ? 1 : 0);
