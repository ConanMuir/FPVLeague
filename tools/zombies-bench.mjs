// Zombies benchmark: every bot pilot level (tools/zbot.mjs) plays full runs on every difficulty, several at once in one headless browser,
// from a fresh profile (no unlocks, Standard doctrine, no kit). The median wave per level and difficulty (with the range) goes to
// games/interceptor/zbench.json, which the game's leaderboard shows as its bot entries. It also checks the ladder: every level beats the one
// below it on every difficulty, and every level does worse on each harder difficulty.
// Run: node tools/zombies-bench.mjs [--levels Rookie,Pro,...] [--diff 0,1,2,3] [--runs 5] [--cap 60] [--par 12] [--no-write] [--out FILE] [--raw FILE]
//   the version stamped in zbench.json is package.json's plus the git commit (or ZBENCH_REV when run from a copy of the repo)
//   --diag prints, per run, the site damage by enemy kind over the last waves (what ended the run)
//   every run logs the cause of its game over (the kind whose hit did the last damage); the summary tables them and zbench.json keeps them per cell (cause)
//   --merge RAW keeps the other levels' runs from an earlier --raw file and re-runs only --levels
//   also for balance checks: [--load '{"doc":"fortress","kit":["lrack","lure"]}'] [--meta full]  (a loadout; full = every goal met, so everything is unlocked)
//   --real: the bots fly for real (games/interceptor/zbotfly.js, the Bot Spectator's pilot, headless at sim speed) instead of teleporting behind
//           their tracks; never writes the teleporting numbers of zbench.json. Each run also logs the pilot's detonations, pilot kills and interceptors lost,
//           and how much of the map it flew over (cells, places visited, systems used: games/interceptor/zbotstat.js).
//           --real --write-fly (all levels and difficulties) adds each cell's flying result, with that coverage, to zbench.json as "fly" (the leaderboard shows it)
//           e.g. DL_NORENDER=1 node tools/zombies-bench.mjs --real --diff 1 --runs 3 --par 6
import {serve, launch, open, root} from './zlib.mjs';
import {LEVELS, DODGE, SHOP, WAVE, level} from './zbot.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const LV = arg('--levels', null) ? arg('--levels').split(',').map(n => level(n) || (() => { throw new Error('unknown level ' + n); })()) : LEVELS;
const DIFFS = String(arg('--diff', '0,1,2,3')).split(',').map(Number), RUNS = +arg('--runs', 5), CAP = +arg('--cap', 60), PAR = +arg('--par', 12);
const LOAD = arg('--load', null), META = arg('--meta', ''), RAW = arg('--raw', null), DIAG = argv.includes('--diag');
const MERGE = arg('--merge', null), REAL = argv.includes('--real');  /* --merge RAW: earlier runs (a --raw file) of the levels not being run now, to re-run one level and keep the rest */
const FLYW = REAL && argv.includes('--write-fly') && !LOAD && !META && DIFFS.length === 4 && (LV === LEVELS || MERGE);
const WRITE = !argv.includes('--no-write') && !REAL && !LOAD && !META && (LV === LEVELS || MERGE) && DIFFS.length === 4, OUT = arg('--out', path.join(root, 'games/interceptor/zbench.json'));
const DN = ['Easy', 'Normal', 'Hard', 'Nightmare'], GOALS = ['w10', 'helpers', 'streak', 'boss', 'clutch', 'norep', 'lean', 'perfect3', 'hard20', 'night15'];
const {server, origin} = await serve();
const browser = await launch({w: 640, h: 360});

async function run(L, zd, idx) {
  // each run in its own browser context: the pages share one origin, and a shared localStorage would let parallel runs read each other's difficulty
  const ctx = await browser.createBrowserContext(), errs = [], p = await open(browser, origin + '/games/interceptor/', errs, {w: 640, h: 360, page: await ctx.newPage()});
  try {
    await p.evaluate((zd, load, meta, goals) => { const s = {gmode: 'z', zdiff: zd, wx: 'clear', zwx: 'menu', zmus: 0};
      if (load) s.zload = JSON.parse(load); if (meta === 'full') s.zmeta = {v: 1, g: Object.fromEntries(goals.map(g => [g, 15]))};
      localStorage.setItem('dl-interceptor', JSON.stringify(s)); }, zd, LOAD, META, GOALS);
    await p.reload({waitUntil: 'load', timeout: 180000}); await p.waitForFunction(() => window.__z, {timeout: 180000});
    if (LOAD) { const lo = await p.evaluate(() => JSON.stringify(__z.Z.meta.load())); if (lo !== JSON.stringify({doc: 'std', kit: [], ...JSON.parse(LOAD)})) throw new Error('loadout not accepted: ' + lo); }
    // site damage by wave and kind, and the kind of the last hit that did damage (the cause of a game over)
    await p.evaluate(() => { const Z = __z.Z, i0 = Z.impact; window.__dmg = {}; window.__last = null; Z.impact = t => { const s = t.tgt, h = s ? s.hp : 0; i0(t); const l = h - (s ? s.hp : 0); if (l > 0) { const w = __z.G.wave, D = __dmg[w] || (__dmg[w] = {}); D[t.k] = (D[t.k] | 0) + l; window.__last = t.k; } }; });
    if (REAL) await p.evaluate((n, zd, load) => __z.spec.bench.start(n, zd, load ? JSON.parse(load) : {}), L.n, zd, LOAD);
    else await p.evaluate(() => { document.getElementById('play').click(); });
    await p.waitForFunction(() => __z.G.state === 'base', {timeout: 60000});
    const P = JSON.stringify(L), dodge = DODGE[['none', 'none', 'some', 'all'][zd]], log = [];
    let full = 0;
    while (true) {
      if (REAL) await p.evaluate(() => __z.spec.bench.shop()); else await p.evaluate(SHOP + `(${P})`);
      const b = await p.evaluate(() => ({w: __z.G.wave, cash: Math.round(__z.G.cash), defs: __z.Z.def.D.length, free: __z.Z.def.SLOTS.filter((_, j) => __z.Z.def.slotFree(j)).length}));
      if (!full && !b.free) full = b.w + 1;
      if (await p.evaluate(() => __z.G.state === 'base')) await p.evaluate(() => __z.cont());  // a sortie that came back late (zsortie.js, a brain hook in the shop) has started the wave already
      const st = REAL ? await p.evaluate(() => __z.spec.bench.wave()) : await p.evaluate(WAVE + `(${P}, ${dodge})`);
      const a = await p.evaluate(() => ({w: __z.G.wave, integ: Math.round(100 * __z.integrity().hp / __z.integrity().max)}));
      log.push([a.w, a.integ, b.cash, b.defs]);
      if (st === 'over' || a.w >= CAP || st === 'wave') break;
    }
    const end = await p.evaluate(() => ({wave: __z.G.wave, earned: Math.round(__z.G.earned), kills: __z.G.kills, spend: __z.G.spend || null, exp: __z.G.exp | 0, dmg: window.__dmg, diff: __z.Z.diff().n, bal: __z.Z.kindFrom ? __z.Z.kindFrom('ballistic') : __z.KIND.ballistic.from,
      so: __z.so?.bot || null, over: __z.G.state === 'over', cause: __z.G.state === 'over' ? window.__last : null, chain: __z.Z.chain?.stats?.() || null,
      defs: __z.Z.def.D.reduce((a, d) => (a[d.type] = (a[d.type] | 0) + 1, a), {}), domes: __z.Z.def.D.filter(d => /dome/.test(d.type)).map(d => d.type + ' L' + (d.lvl + 1) + ' ' + JSON.stringify(d.res || {})),
      cov: __z.bot?.on ? __z.bot.summary() : null,
      pilot: __z.spec?.on ? (s => ({bursts: s.bursts, kills: s.kills.pilot?.n | 0, lost: s.deaths, simT: Math.round(s.simT), crashes: s.crashes}))(__z.spec.sp.stats) : null}));
    return {lv: L.n, zd, idx, ...end, full, log, errs: errs.slice(0, 3)};
  } finally { await ctx.close().catch(() => {}); }
}

// jobs interleaved so slow (deep) and quick runs share the pool
const jobs = [];
for (let i = 0; i < RUNS; i++) for (const L of LV) for (const zd of DIFFS) jobs.push([L, zd, i]);
const results = [], T0 = Date.now();
let failed = 0;
let next = 0;
async function worker() { while (next < jobs.length) { const j = jobs[next++]; try { const r = await run(...j); results.push(r);
  console.log(`  ${r.lv} · ${DN[r.zd]} #${r.idx}: wave ${r.wave}${r.wave >= CAP ? ' (cap)' : ''}${r.cause ? ', final hit ' + r.cause : ''}${r.chain ? ', chain ' + JSON.stringify(r.chain) : ''}${r.so ? ', sorties ' + JSON.stringify(r.so) : ''}${r.cov ? `, coverage ${r.cov.cells} cells (${Math.round(r.cov.pct * 100)}%), ${r.cov.places}/${r.cov.placesTotal} places, ${r.cov.systems}/${r.cov.systemsTotal} systems, ${r.cov.stuck} stuck` : ''}, positions full before wave ${r.full || '-'}, purse at base ${r.log.filter((_, i) => i % 5 === 4).map(x => x[0] + ':$' + x[2]).join(' ')}, sinks ${JSON.stringify(r.spend)}${DIAG ? ` [${r.diff}, ballistic from wave ${r.bal}]` + '\n    defences ' + JSON.stringify(r.defs) + ' domes ' + (r.domes || []).join('; ') + '\n    integrity ' + r.log.map(x => x[1]).join(' ') + '\n    damage by wave/kind ' + Object.entries(r.dmg || {}).slice(-8).map(([w, d]) => w + ':' + Object.entries(d).map(([k, v]) => k + ' ' + v).join(',')).join(' | ') : ''}${r.pilot ? `, pilot ${r.pilot.kills} kills from ${r.pilot.bursts} detonations, lost ${JSON.stringify(r.pilot.lost)}, ${Math.round(r.pilot.simT / 60)} min in the air${DIAG && r.pilot.crashes.length ? '\n    crashes ' + r.pilot.crashes.map(c => `w${c.w} (${c.x},${c.y},${c.z}) agl ${c.agl} ${c.mode} ${c.v} m/s t${c.t} "${c.intent}"`).join(' | ') : ''}` : ''}${r.errs.length ? ' ERR ' + r.errs.join(' | ') : ''} (${Math.round((Date.now() - T0) / 1000)} s)`); }
  catch (e) { failed++; console.log('  run failed', j[0].n, DN[j[1]], String(e.message || e).split('\n')[0]); } } }
await Promise.all(Array.from({length: Math.min(PAR, jobs.length)}, worker));
const TL = MERGE ? (results.push(...JSON.parse(fs.readFileSync(MERGE, 'utf8')).filter(r => !LV.some(L => L.n === r.lv))), LEVELS) : LV;

const med = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2 : 0; };
const table = TL.map(L => ({n: L.n, d: DIFFS.map(zd => { const w = results.filter(r => r.lv === L.n && r.zd === zd).map(r => r.wave); return w.length ? {med: med(w), min: Math.min(...w), max: Math.max(...w), n: w.length} : null; })}));
console.log(`\n${REAL ? 'REAL FLYING · ' : ''}${LOAD ? 'loadout ' + LOAD : 'fresh profile, Standard doctrine, no kit'}${META ? ', meta ' + META : ''}: wave reached, median [range] of ${RUNS} runs (cap ${CAP})`);
const covRows = TL.map(L => { const R = DIFFS.map(zd => results.filter(r => r.lv === L.n && r.zd === zd && r.cov)); return R.some(a => a.length) ? L.n.padEnd(16) + R.map(a => a.length ? `${Math.round(med(a.map(r => r.cov.cells)))} cells ${Math.round(100 * med(a.map(r => r.cov.pct)))}% · ${med(a.map(r => r.cov.places))} places · ${med(a.map(r => r.cov.systems))} sys`.padEnd(34) : '-'.padEnd(34)).join('') : null; }).filter(Boolean);
console.log('level'.padEnd(16) + DIFFS.map(zd => DN[zd].padEnd(16)).join(''));
for (const r of table) console.log(r.n.padEnd(16) + r.d.map(c => (c ? `${c.med} [${c.min}-${c.max}]` : '-').padEnd(16)).join(''));
if (covRows.length) { console.log('\nmap coverage per run, median (cells flown over, share of the operational area, places visited, systems used)'); covRows.forEach(r => console.log(r)); }
// the ladder: higher levels beat lower ones on every difficulty; harder difficulties lower every level (medians; a capped run counts as the cap)
const bad = [];
if (failed) bad.push(`${failed} of ${jobs.length} runs failed`);
if (!results.length) bad.push('no runs finished');
for (let i = 1; i < table.length; i++) DIFFS.forEach((zd, j) => { const a = table[i - 1].d[j], b = table[i].d[j]; if (a && b && !(b.med > a.med) && !(a.med >= CAP && b.med >= CAP)) bad.push(`${table[i].n} ${b.med} vs ${table[i - 1].n} ${a.med} on ${DN[zd]}`); });
for (const r of table) for (let j = 1; j < DIFFS.length; j++) { const a = r.d[j - 1], b = r.d[j]; if (a && b && !(b.med < a.med) && !(a.med >= CAP && b.med >= CAP)) bad.push(`${r.n}: ${DN[DIFFS[j]]} ${b.med} not below ${DN[DIFFS[j - 1]]} ${a.med}`); }
// causes of game over: the kind whose hit did the last damage, per level and difficulty, plus where the site damage of the last 3 waves came from
const causeOf = (lv, zd) => { const c = {}; for (const r of results) if (r.lv === lv && r.zd === zd && r.cause) c[r.cause] = (c[r.cause] | 0) + 1; return c; };
const lateDmg = (lv, zd) => { const c = {}; let tot = 0; for (const r of results) if (r.lv === lv && r.zd === zd && r.over) { const ws = Object.keys(r.dmg || {}).map(Number).sort((a, b) => a - b).slice(-3); for (const w of ws) for (const [k, v] of Object.entries(r.dmg[w])) { c[k] = (c[k] | 0) + v; tot += v; } }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + Math.round(100 * v / Math.max(1, tot)) + '%').join(', '); };
console.log('\ncause of game over (kind of the final hit) | share of site damage in the last 3 waves before it');
for (const L of TL) for (const zd of DIFFS) { const c = causeOf(L.n, zd); if (Object.keys(c).length) console.log(`  ${L.n.padEnd(15)} ${DN[zd].padEnd(10)} ${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' x' + v).join(', ').padEnd(34)} | ${lateDmg(L.n, zd)}`); }
console.log(bad.length ? 'LADDER NOT MONOTONIC:\n  ' + bad.join('\n  ') : 'ladder ok: every level beats the one below on every difficulty, and every level does worse on each harder difficulty');
if (RAW) fs.writeFileSync(RAW, JSON.stringify(results, null, 1));
if (FLYW) {
  const f = JSON.parse(fs.readFileSync(OUT, 'utf8')), mm = a => med(a.filter(x => x != null));
  for (const L of f.levels) for (const zd of DIFFS) {
    const R = results.filter(r => r.lv === L.n && r.zd === zd && r.cov), cell = L.d[DN[zd]];
    if (!R.length || !cell) continue;
    cell.fly = {med: mm(R.map(r => r.wave)), min: Math.min(...R.map(r => r.wave)), max: Math.max(...R.map(r => r.wave)), n: R.length, cells: Math.round(mm(R.map(r => r.cov.cells))), pct: +mm(R.map(r => r.cov.pct)).toFixed(2),
      places: mm(R.map(r => r.cov.places)), systems: mm(R.map(r => r.cov.systems))};
  }
  f.fly = {date: new Date().toISOString().slice(0, 10), runs: RUNS, note: 'fly: the same bot levels flown for real (zbotfly.js: sticks, sorties, roaming), median wave and how much of the map and how many systems each run used. Written by tools/zombies-bench.mjs --real --write-fly.'};
  fs.writeFileSync(OUT, JSON.stringify(f, null, 1) + '\n'); console.log('wrote the flying results to ' + path.relative(root, OUT));
}
if (WRITE) {
  let ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; if (process.env.ZBENCH_REV) ver += '+' + process.env.ZBENCH_REV; else try { ver += '+' + execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch (e) {}
  const out = {date: new Date().toISOString().slice(0, 10), version: ver, runs: RUNS, cap: CAP, note: 'Median wave reached by each bot pilot level (tools/zbot.mjs) on each difficulty, fresh profile, Standard doctrine, no kit. Written by tools/zombies-bench.mjs.',
    levels: table.map(r => ({n: r.n, d: Object.fromEntries(DIFFS.map((zd, j) => [DN[zd], r.d[j] && {med: r.d[j].med, min: r.d[j].min, max: r.d[j].max, cause: causeOf(r.n, zd)}]))}))};
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n'); console.log('wrote ' + path.relative(root, OUT));
}
await browser.close(); server.close();
console.log(`done in ${Math.round((Date.now() - T0) / 1000)} s`);
process.exit(bad.length ? 1 : 0);
