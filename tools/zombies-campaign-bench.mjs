// Zombies campaign balance: the bot pilots (tools/zbot.mjs) play every campaign sector (games/interceptor/zcampaign.js) solo, from a fresh
// profile (Standard doctrine, no kit, no relic, no reserve, no enemy pressure), several at once in one headless browser. Prints each sector's
// win rate and the wave reached per level, so the sector ladder (opener easy, capstone hard) can be checked after a balance change.
// Run: node tools/zombies-campaign-bench.mjs [--levels Rookie,Pro,All-Star] [--sectors mill,river,...] [--diff 1] [--runs 3] [--par 10]
//   [--relic ace] [--pressure 2]   play with a relic equipped / that much enemy pressure on every sector
import {serve, launch, open} from './zlib.mjs';
import {LEVELS, DODGE, SHOP, WAVE, level} from './zbot.mjs';
import {SECTORS, fresh} from '../games/interceptor/zcampaign.js';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const LV = arg('--levels', 'Rookie,Pro,All-Star').split(',').map(n => level(n) || (() => { throw new Error('unknown level ' + n); })());
const SEC = arg('--sectors', null) ? arg('--sectors').split(',') : SECTORS.map(s => s.id), ZD = +arg('--diff', 1), RUNS = +arg('--runs', 3), PAR = +arg('--par', 10);
const RELIC = arg('--relic', ''), PR = +arg('--pressure', 0);
const {server, origin} = await serve();
const browser = await launch({w: 640, h: 360});

async function run(L, id, idx) {
  const ctx = await browser.createBrowserContext(), errs = [], p = await open(browser, origin + '/games/interceptor/', errs, {w: 640, h: 360, page: await ctx.newPage()});
  try {
    const c = fresh(ZD); if (RELIC) { c.relics = [RELIC]; c.eq = RELIC; } if (PR) c.pr = {[id]: PR};
    await p.evaluate((zd, c) => { localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', zdiff: zd, wx: 'clear', zwx: 'menu', zmus: 0, zcamp: c})); sessionStorage.setItem('zcodex', 'all'); }, ZD, c);  /* the full boss roster (zcodex.js) */
    await p.reload({waitUntil: 'load', timeout: 180000}); await p.waitForFunction(() => window.__z, {timeout: 180000});
    await p.evaluate(id => __z.Z.cp.start(id, true), id);
    await p.waitForFunction(() => __z.G.state === 'base', {timeout: 60000});
    const P = JSON.stringify(L), dodge = DODGE[['none', 'none', 'some', 'all'][ZD]];
    for (let w = 0; w < 40; w++) {
      await p.evaluate(SHOP + `(${P})`); await p.evaluate(() => __z.cont());
      const st = await p.evaluate(WAVE + `(${P}, ${dodge})`);
      if (st === 'over' || st === 'wave') break;
    }
    return await p.evaluate(id => ({id, won: __z.Z.cp.run?.over === 'won', wave: __z.G.wave, obj: __z.Z.cp.run?.obj, integ: Math.round(100 * __z.integrity().hp / __z.integrity().max), earned: Math.round(__z.G.earned)}), id).then(r => ({lv: L.n, idx, ...r, errs: errs.slice(0, 2)}));
  } finally { await ctx.close().catch(() => {}); }
}
const jobs = []; for (let i = 0; i < RUNS; i++) for (const id of SEC) for (const L of LV) jobs.push([L, id, i]);
const out = [], T0 = Date.now(); let next = 0, failed = 0;
async function worker() { while (next < jobs.length) { const j = jobs[next++]; try { const r = await run(...j); out.push(r);
  console.log(`  ${r.id.padEnd(8)} ${r.lv.padEnd(9)} #${r.idx}: ${r.won ? 'WON ' : 'lost'} wave ${r.wave}/${r.obj}, integrity ${r.integ}%${r.errs.length ? ' ERR ' + r.errs.join(' | ') : ''} (${Math.round((Date.now() - T0) / 1000)} s)`); }
  catch (e) { failed++; console.log('  run failed', j[1], j[0].n, String(e.message || e).split('\n')[0]); } } }
await Promise.all(Array.from({length: Math.min(PAR, jobs.length)}, worker));
console.log(`\nwin rate (wave reached on a loss, median) · difficulty ${['Easy', 'Normal', 'Hard', 'Nightmare'][ZD]}${RELIC ? ' · relic ' + RELIC : ''}${PR ? ' · pressure ' + PR : ''} · ${RUNS} runs each`);
console.log('sector'.padEnd(10) + 'obj  ' + LV.map(L => L.n.padEnd(16)).join(''));
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : '-'; };
for (const id of SEC) { const S = SECTORS.find(s => s.id === id); console.log(id.padEnd(10) + String(S.obj).padEnd(5) + LV.map(L => { const R = out.filter(r => r.id === id && r.lv === L.n), w = R.filter(r => r.won).length, lost = R.filter(r => !r.won).map(r => r.wave);
  return `${w}/${R.length}${lost.length ? ` (w${med(lost)})` : ''}`.padEnd(16); }).join('')); }
await browser.close(); server.close();
console.log(`done in ${Math.round((Date.now() - T0) / 1000)} s${failed ? `, ${failed} runs failed` : ''}`);
process.exit(failed ? 1 : 0);
