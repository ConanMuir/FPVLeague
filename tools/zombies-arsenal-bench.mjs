// Zombies arsenal balance sampler: the bot pilots (tools/zbot.mjs) play full runs with the arsenal (zarsenal.js) available, without it, or with
// options taken out or alone, and it prints the waves reached and how often each option was picked. A small sample for balance checks, not the
// leaderboard benchmark (tools/zombies-bench.mjs, zbench.json): nothing is written to the game.
// Run: node tools/zombies-arsenal-bench.mjs [--levels Pro,Champion,Legend] [--diff 1] [--runs 3] [--cap 45] [--par 12] [--configs none,all] [--wx zombies|clear] [--raw FILE]
//   --wx: the per-wave Zombies weather (default; it matters to the laser) or clear skies every wave like the leaderboard bench
//   configs: none = every arsenal option banned (the game as before), all = everything available, only:X = just X (plus the standard warhead),
//            no:X = everything but X, force:X = everything available and the bot always loads weapon X once it can (what X is worth to it).
//            X is a weapon (net, flech, flare, cluster, emp, dart) or a defence (laser, mwave, barrage, smoke, carrier).
import {serve, launch, open} from './zlib.mjs';
import {LEVELS, DODGE, SHOP, WAVE, level} from './zbot.mjs';
import fs from 'node:fs';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const LV = String(arg('--levels', 'Pro,Champion,Legend')).split(',').map(n => level(n) || (() => { throw new Error('unknown level ' + n); })());
const WX = arg('--wx', 'zombies'), ZD = +arg('--diff', 1), RUNS = +arg('--runs', 3), CAP = +arg('--cap', 45), PAR = +arg('--par', 12), RAW = arg('--raw', null);
const ALL = ['net', 'flech', 'flare', 'cluster', 'emp', 'dart', 'laser', 'mwave', 'barrage', 'smoke', 'carrier'], WPN = ALL.slice(0, 6);
const CONF = String(arg('--configs', 'none,all')).split(',');
const banOf = c => c === 'none' ? 'all' : c === 'all' || c.startsWith('force:') ? [] : c.startsWith('only:') ? ALL.filter(x => x !== c.slice(5)) : c.startsWith('no:') ? [c.slice(3)] : (() => { throw new Error('unknown config ' + c); })();
const DN = ['Easy', 'Normal', 'Hard', 'Nightmare'];
const {server, origin} = await serve();
const browser = await launch({w: 640, h: 360});

async function run(L, conf, idx) {
  const ctx = await browser.createBrowserContext(), errs = [], p = await open(browser, origin + '/games/interceptor/', errs, {w: 640, h: 360, page: await ctx.newPage()});
  try {
    await p.evaluate((zd, ban, wx) => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', zdiff: zd, wx: 'clear', zmus: 0, zarsBan: ban, ...(wx === 'clear' ? {zwx: 'menu'} : {})})), ZD, banOf(conf), WX);
    await p.reload({waitUntil: 'load', timeout: 180000}); await p.waitForFunction(() => window.__z, {timeout: 180000});
    await p.evaluate(() => document.getElementById('play').click());
    await p.waitForFunction(() => __z.G.state === 'base', {timeout: 60000});
    const P = JSON.stringify(conf.startsWith('force:') ? {...L, force: conf.slice(6)} : L), dodge = DODGE[['none', 'none', 'some', 'all'][ZD]];
    while (true) {
      await p.evaluate(SHOP + `(${P})`);
      await p.evaluate(() => __z.cont());
      const st = await p.evaluate(WAVE + `(${P}, ${dodge})`);
      const w = await p.evaluate(() => __z.G.wave);
      if (st === 'over' || w >= CAP || st === 'wave') break;
    }
    const end = await p.evaluate(() => ({wave: __z.G.wave, kills: __z.G.kills, ars: __z.Z.ars.stats(), ban: [...__z.Z.ars.ban]}));
    return {lv: L.n, conf, idx, ...end, errs: errs.slice(0, 3)};
  } finally { await ctx.close().catch(() => {}); }
}
const jobs = [];
for (let i = 0; i < RUNS; i++) for (const c of CONF) for (const L of LV) jobs.push([L, c, i]);
const res = [], T0 = Date.now();
let next = 0, failed = 0;
async function worker() { while (next < jobs.length) { const j = jobs[next++]; try { const r = await run(...j); res.push(r);
  const s = r.ars, w = Object.entries(s.eq).map(([k, n]) => k + ':' + n).join(' '), d = Object.entries(s.dmax).filter(([k]) => ALL.includes(k)).map(([k, n]) => `${k}×${n}(${s.dkills[k] | 0})`).join(' ');
  console.log(`  ${r.lv} · ${r.conf} #${r.idx}: wave ${r.wave}${r.wave >= CAP ? ' (cap)' : ''} · weapon waves ${w || '-'} · arsenal defences ${d || '-'}${r.errs.length ? ' ERR ' + r.errs.join(' | ') : ''} (${Math.round((Date.now() - T0) / 1000)} s)`); }
  catch (e) { failed++; console.log('  run failed', j[0].n, j[1], String(e.message || e).split('\n')[0]); } } }
await Promise.all(Array.from({length: Math.min(PAR, jobs.length)}, worker));
if (RAW) fs.writeFileSync(RAW, JSON.stringify(res, null, 1));

const med = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2 : 0; };
console.log(`\n${DN[ZD]}, ${WX === 'clear' ? 'clear skies' : 'Zombies weather'}: wave reached, median [range] of ${RUNS} runs (cap ${CAP})`);
console.log('config'.padEnd(16) + LV.map(L => L.n.padEnd(18)).join('') + 'all levels');
for (const c of CONF) { const row = LV.map(L => { const w = res.filter(r => r.conf === c && r.lv === L.n).map(r => r.wave); return w.length ? `${med(w)} [${Math.min(...w)}-${Math.max(...w)}]` : '-'; });
  const all = res.filter(r => r.conf === c).map(r => r.wave); console.log(c.padEnd(16) + row.map(x => x.padEnd(18)).join('') + (all.length ? med(all) : '-')); }
// each config against none: per run, its wave minus the median wave of the same level with nothing from the arsenal; mean and range per config
if (CONF.includes('none') && CONF.length > 1) { const base = {}; for (const L of LV) base[L.n] = med(res.filter(r => r.conf === 'none' && r.lv === L.n).map(r => r.wave));
  console.log('\nwaves vs none (same level), mean [min..max] over every run of the config:');
  for (const c of CONF) { if (c === 'none') continue; const d = res.filter(r => r.conf === c && base[r.lv] != null).map(r => r.wave - base[r.lv]); if (!d.length) continue;
    console.log(`  ${c.padEnd(14)} ${(d.reduce((a, b) => a + b, 0) / d.length >= 0 ? '+' : '') + (d.reduce((a, b) => a + b, 0) / d.length).toFixed(1)} [${Math.min(...d)}..${Math.max(...d)}] (${d.length} runs)`); } }
// pick rates where everything was available: weapons = share of runs that bought it and share of all waves flown with it loaded; defences = share
// of runs that built one, the most at once, kills
const A = res.filter(r => r.conf === 'all');
if (A.length) {
  console.log(`\npick rates with everything available (${A.length} runs):`);
  const waves = A.reduce((a, r) => a + Object.values(r.ars.eq).reduce((x, y) => x + y, 0), 0);
  for (const k of ['std', ...WPN]) { const b = A.filter(r => k === 'std' || r.ars.bought[k]).length, eq = A.reduce((a, r) => a + (r.ars.eq[k] | 0), 0), wk = A.reduce((a, r) => a + (r.ars.wk[k] | 0), 0);
    console.log(`  weapon ${k.padEnd(8)} bought in ${String(Math.round(100 * b / A.length)).padStart(3)}% of runs, loaded for ${String(Math.round(100 * eq / Math.max(1, waves))).padStart(3)}% of waves, ${wk} pilot kills with it` + (k !== 'std' && b ? `, first bought at wave ${med(A.filter(r => r.ars.bought[k]).map(r => r.ars.bought[k]))} (median)` : '')); }
  for (const k of ALL.slice(6)) { const b = A.filter(r => r.ars.dmax[k]).length, mx = A.reduce((a, r) => a + (r.ars.dmax[k] | 0), 0), kl = A.reduce((a, r) => a + (r.ars.dkills[k] | 0), 0);
    console.log(`  defence ${k.padEnd(8)} built in ${String(Math.round(100 * b / A.length)).padStart(3)}% of runs, ${(mx / Math.max(1, b)).toFixed(1)} at most per run that built it, ${(kl / A.length).toFixed(0)} kills${k === 'smoke' ? ' (diversions)' : ''} per run`); }
  for (const L of LV) { const R = A.filter(r => r.lv === L.n), eq = {}; for (const r of R) for (const [k, n] of Object.entries(r.ars.eq)) eq[k] = (eq[k] | 0) + n; const t = Object.values(eq).reduce((a, b) => a + b, 0);
    console.log(`  ${L.n.padEnd(15)} waves by weapon: ${Object.entries(eq).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${Math.round(100 * n / t)}%`).join(', ')}`); }
}
console.log(failed ? `${failed} runs failed` : 'all runs finished');
await browser.close(); server.close();
console.log(`done in ${Math.round((Date.now() - T0) / 1000)} s`);
process.exit(failed ? 1 : 0);
