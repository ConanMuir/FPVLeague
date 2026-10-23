/* Arsenal stats: which items get how many kills. Measurement only, nothing in the game is changed by it.
   Bot pilots (tools/zbot.mjs, the benchmark's teleporting pilot) play full headless runs on Normal and Hard, a few bot levels and runs each, and the game's
   item ledger (zarsenal.js: Z.ars.stats() kl / kc / buy / spent / dw / eq) says which weapon or defence made each kill, what it cost and how long it stood.
   The tables go to docs/ARSENAL-STATS.md (the "## Reading" section at its end is kept by hand) and the raw runs to docs/ARSENAL-STATS.json.
   Run: node tools/arsenal-stats.mjs [--levels Pro,All-Star,Champion] [--diff 1,2] [--runs 3] [--cap 40] [--wx zombies|clear] [--out FILE] [--json FILE] [--no-write]
     --diff: difficulty indexes (0 Easy, 1 Normal, 2 Hard, 3 Nightmare); --runs: runs per level and difficulty (the game reads the wall clock and the audio clock, so runs of one setup differ; the spread is the noise)
     --wx: the per-wave Zombies weather (default, it matters to the laser) or clear skies
     --from FILE: no games, build the report again from the raw runs of an earlier run (docs/ARSENAL-STATS.json), e.g. after a change to the tables
     --quick: one short run (Pro, Normal, 12 waves) that only checks the tool runs and that every kill is attributed to an item; writes nothing (CI)
   At most 2 pages run at once. */
import {serve, launch, open, root} from './zlib.mjs';
import {DODGE, SHOP, WAVE, level} from './zbot.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d, QUICK = argv.includes('--quick');
const DN = ['Easy', 'Normal', 'Hard', 'Nightmare'], FROM = arg('--from', null), SRC = FROM ? JSON.parse(fs.readFileSync(FROM, 'utf8')) : null, SP = SRC?.params;
const LV = String(arg('--levels', SP ? SP.levels.join(',') : QUICK ? 'Pro' : 'Pro,All-Star,Champion')).split(',').map(n => level(n) || (() => { throw new Error('unknown level ' + n); })());
const DIFFS = String(arg('--diff', SP ? SP.diff.map(d => DN.indexOf(d)).join(',') : QUICK ? '1' : '1,2')).split(',').map(Number), RUNS = +arg('--runs', SP ? SP.runs : QUICK ? 1 : 3), CAP = +arg('--cap', SP ? SP.cap : QUICK ? 12 : 40), WX = arg('--wx', SP ? SP.wx : 'zombies');
const PAR = Math.min(2, Math.max(1, +arg('--par', 2))), WRITE = !QUICK && !argv.includes('--no-write');
const OUT = arg('--out', path.join(root, 'docs/ARSENAL-STATS.md')), JSON_OUT = arg('--json', OUT.replace(/\.md$/, '.json'));
/* the rows: weapons, then the arsenal's defences, then the stock helpers; the other kill sources have no price and are listed apart */
const WEAPONS = ['std', 'net', 'flech', 'flare', 'cluster', 'emp', 'dart'], ARS_DEF = ['laser', 'mwave', 'barrage', 'smoke', 'carrier'], STOCK_DEF = ['rack', 'flak', 'ew', 'gepard', 'sam', 'idome', 'gdome'];
const OTHER = ['airstrike', 'swarm', 'ram', 'sortie', 'pilot', 'coop', 'helper-dmg', 'other'];
const ONE = {airstrike: 'Airstrike perk', swarm: 'Personal FPV swarm', ram: 'Ramming direct hit (fast tracks)', sortie: 'Sortie bombs', pilot: 'Pilot, no weapon tag', coop: 'Co-op pilots', 'helper-dmg': 'Helper / swarm damage that failed later', other: 'No tag (kill chain, boss bolts)'};

const {server, origin} = FROM ? {} : await serve();
const browser = FROM ? null : await launch({w: 640, h: 360});
const sum = a => a.reduce((x, y) => x + y, 0), N = x => x | 0;
/* the enemy kinds of the waves; the units of a boss fight (twins, jpod, ...) count as boss, and smoke / the jammer make no kills: their effect is a count of their own */
const KINDS = ['shahed', 'jet', 'decoy', 'swarm', 'heavy', 'cruise', 'ballistic', 'hyper', 'icbm', 'boss'], kindOf = k => KINDS.includes(k) ? k : 'boss';
const EFFECT = {smoke: 'dives diverted', ew: 'tracks spoofed'};

async function run(L, zd, idx) {
  /* each run in its own browser context (its own localStorage) */
  const ctx = await browser.createBrowserContext(), errs = [], pg = await ctx.newPage();
  try {
    const p = await open(browser, origin + '/games/interceptor/', errs, {w: 640, h: 360, page: pg});
    await p.evaluate((zd, wx) => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', zdiff: zd, wx: 'clear', zmus: 0, ...(wx === 'clear' ? {zwx: 'menu'} : {})})), zd, WX);
    await p.reload({waitUntil: 'load', timeout: 180000}); await p.waitForFunction(() => window.__z, {timeout: 180000});
    await p.evaluate(() => document.getElementById('play').click());
    await p.waitForFunction(() => __z.G.state === 'base', {timeout: 60000});
    const P = JSON.stringify(L), dodge = DODGE[['none', 'none', 'some', 'all'][zd]];
    /* shop, start the wave and play it in one page call, so nothing else steps the game in between */
    const wave = `(function(P, dodge){ const shop = ${SHOP}, wave = ${WAVE}; shop(P); if (__z.G.state === 'base') __z.cont(); return wave(P, dodge); })`;
    while (true) {
      const st = await p.evaluate(wave + `(${P}, ${dodge})`), w = await p.evaluate(() => __z.G.wave);
      if (st === 'over' || w >= CAP || st === 'wave') break;
    }
    const end = await p.evaluate(() => { const {G, Z, ITEMS} = __z, A = Z.ars, wpn = {}, items = {};
      for (const id of A.WORDER) wpn[id] = {n: A.WPN[id].n, price: A.WPN[id].price, from: A.WPN[id].from};
      for (const [k, it] of Object.entries(ITEMS)) if (it.type === 'helper') items[k] = {n: it.n, price: it.price, from: Z.itemFrom ? Z.itemFrom(k) : it.from};
      return {wave: G.wave, over: G.state === 'over', kills: G.kills, earned: Math.round(G.earned), perks: G.perks, ars: A.stats(), wpn, items}; });
    return {lv: L.n, zd, idx, ...end, errs: errs.slice(0, 3)};
  } finally { await ctx.close().catch(() => {}); }
}

const jobs = [];
if (!FROM) for (let i = 1; i <= RUNS; i++) for (const L of LV) for (const zd of DIFFS) jobs.push([L, zd, i]);
const results = SRC ? [...SRC.runs] : [], T0 = Date.now();
let next = 0, failed = 0;
async function worker() { while (next < jobs.length) { const j = jobs[next++]; try { const r = await run(...j); results.push(r);
  const kl = r.ars.kl, tot = sum(Object.values(kl).map(o => sum(Object.values(o)))), top = Object.entries(kl).map(([k, o]) => [k, sum(Object.values(o))]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => k + ' ' + n).join(', ');
  console.log(`  ${r.lv} · ${DN[r.zd]} #${r.idx}: wave ${r.wave}${r.over ? ' (over)' : ' (cap)'} · ${tot} kills (${r.kills.p} pilot, ${r.kills.h} helpers) · ${top}${r.errs.length ? ' ERR ' + r.errs.join(' | ') : ''} (${Math.round((Date.now() - T0) / 1000)} s)`); }
  catch (e) { failed++; console.log('  run failed', j[0].n, DN[j[1]], '#' + j[2], String(e.message || e).split('\n')[0]); } } }
await Promise.all(Array.from({length: Math.min(PAR, jobs.length)}, worker));
results.sort((a, b) => a.zd - b.zd || LV.findIndex(l => l.n === a.lv) - LV.findIndex(l => l.n === b.lv) || a.idx - b.idx);
if (!FROM) { await browser.close(); server.close(); }

/* ---------- the numbers ---------- */
const meta = results[0] ? {wpn: results[0].wpn, items: results[0].items} : {wpn: {}, items: {}};
const fromOf = (r, id) => r.wpn[id]?.from ?? r.items[id]?.from ?? 1;
const nameOf = id => meta.wpn[id]?.n || meta.items[id]?.n || id;
const killsOf = (r, id) => sum(Object.values(r.ars.kl[id] || {}));
const allKills = rs => sum(rs.map(r => sum(Object.values(r.ars.kl).map(o => sum(Object.values(o))))));
function row(rs, id) {
  const wpn = WEAPONS.includes(id), E = rs.filter(r => r.wave >= fromOf(r, id)), price = meta.wpn[id]?.price ?? 0;
  const bought = sum(rs.map(r => N(r.ars.buy[id]))), kills = sum(rs.map(r => killsOf(r, id))), tg = {};
  for (const r of rs) for (const [k, n] of Object.entries(r.ars.kl[id] || {})) tg[kindOf(k)] = (tg[kindOf(k)] | 0) + n;
  const spent = wpn ? bought * price : sum(rs.map(r => N(r.ars.spent[id]))), waves = sum(rs.map(r => N((wpn ? r.ars.eq : r.ars.dw)[id])));
  return {id, name: nameOf(id), bought, buyers: E.filter(r => N(r.ars.buy[id]) > 0).length, eligible: E.length, kills, share: kills / Math.max(1, allKills(rs)), perPurchase: bought ? kills / bought : null,
    per1000: spent ? 1000 * kills / spent : null, payback: spent ? sum(rs.map(r => N(r.ars.kc[id]))) / spent : null, spent, waves, perWave: waves ? kills / waves : null, pay: sum(rs.map(r => N(r.ars.kc[id]))), pick: E.length && id !== 'std' ? E.filter(r => N(r.ars.buy[id]) > 0).length / E.length : null,
    perRun: rs.length ? kills / rs.length : 0, effect: EFFECT[id] ? sum(rs.map(r => N(r.ars.dkills[id]))) : 0, targets: Object.entries(tg).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n / Math.max(1, kills)])};
}
const fx = (rs, k) => sum(rs.map(r => N(r.ars.fx[k])));

/* ---------- the report ---------- */
const f2 = x => x == null ? '-' : x.toFixed(2), f1 = x => x == null ? '-' : x >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1), n0 = x => Math.round(x).toLocaleString('en-US'), pc = x => x == null ? '-' : Math.round(100 * x) + '%';
const tg = r => r.targets.slice(0, 3).filter(([, s]) => s >= .05).map(([k, s]) => `${k} ${Math.round(100 * s)}%`).join(', ') || (r.effect ? `no kills: ${n0(r.effect)} ${EFFECT[r.id]}` : '-');
const tbl = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map((h, i) => i < 2 ? ' --- ' : ' ---: ').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
function report() {
  const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version + (process.env.ZBENCH_REV ? '+' + process.env.ZBENCH_REV : (() => { try { return '+' + execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch (e) { return ''; } })());
  const out = [`# Arsenal stats: kills per item`, '',
    `Generated by \`node tools/arsenal-stats.mjs\` on ${new Date().toISOString().slice(0, 10)} (version ${ver}). Raw runs: \`${path.basename(JSON_OUT)}\`. Measurement only: no balance was changed to get these numbers.`, '',
    `**Setup.** Bot pilots (${LV.map(l => l.n).join(', ')}) play full runs from a fresh profile with the whole arsenal on offer, ${RUNS} run${RUNS === 1 ? "" : "s"} per level and difficulty (${results.length} runs), `
    + `stopping at game over or wave ${CAP}. ${WX === 'clear' ? 'Clear skies every wave.' : 'The per-wave Zombies weather is on (the laser needs clear air).'} They are the benchmark's teleporting pilots (\`tools/zbot.mjs\`): a pilot's burst is a dice roll with the level's skill, so read the weapon rows as "what the weapon does in a competent bot's hands", not as a human's ranking.`, '',
    `**Columns.** *Bought*: purchases over all runs. *Kills*: paid kills booked to the item that made them (a pilot weapon: its bursts, the dart's contact, the bomblets; a defence: its own shots, drones, pulses, snags, beams), *Share* of all kills in that mode. *Kills/purchase* = Kills / Bought. `
    + `*Kills/$1000*: kills per $1,000 spent on it (purchase plus upgrades and refits; upkeep from wave 11 is not counted), *Pay/$*: what those kills paid into the purse per $1 spent (a helper's kill pays 70% of a pilot's; a swarm drone pays $20, a Shahed $100). *Waves*: waves the weapon was loaded / defence-waves it stood. *Kills/wave* = Kills / Waves. `
    + `*Pick rate*: share of the runs that reached the item's unlock wave that bought it at least once. *Targets*: the enemy kinds its kills were made on (3 biggest, 5% and up).`, ''];
  for (const zd of DIFFS) {
    const rs = results.filter(r => r.zd === zd); if (!rs.length) continue;
    const med = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2 : 0; };
    out.push(`## ${DN[zd]}`, '', `${rs.length} runs, median wave reached ${med(rs.map(r => r.wave))} (${Math.min(...rs.map(r => r.wave))}-${Math.max(...rs.map(r => r.wave))}), ${allKills(rs).toLocaleString('en-US')} kills in all (${sum(rs.map(r => r.kills.p)).toLocaleString('en-US')} by the pilot's own hand, ${sum(rs.map(r => r.kills.h)).toLocaleString('en-US')} by helpers).`, '');
    const grp = ids => ids.reduce((a, id) => a + row(rs, id).kills, 0) / Math.max(1, allKills(rs));
    out.push(`Share of all kills: pilot weapons ${pc(grp(WEAPONS))}, arsenal defences ${pc(grp(ARS_DEF))}, stock helpers ${pc(grp(STOCK_DEF))}, everything else (airstrike, swarm, damaged tracks failing later, ...) ${pc(grp(OTHER))}.`, '');
    const mk = (title, ids) => { out.push(`**${title}**`, ''); out.push(tbl(['Item', 'Mode', 'Bought', 'Kills', 'Share', 'Kills/purchase', 'Kills/$1000', 'Pay/$', 'Waves', 'Kills/wave', 'Pick rate', 'Targets'],
      ids.map(id => { const r = row(rs, id); return [`${r.name}`, DN[zd], id === 'std' ? 'free' : n0(r.bought), n0(r.kills), pc(r.share), f1(r.perPurchase), f1(r.per1000), f2(r.payback), n0(r.waves), f1(r.perWave),
        id === 'std' ? 'always' : r.eligible ? `${pc(r.pick)} (${r.buyers}/${r.eligible})` : 'n/a', tg(r)]; })), ''); };
    mk('Pilot weapons', WEAPONS); mk('Arsenal base defences', ARS_DEF); mk('Stock helpers', STOCK_DEF.filter(id => results.some(r => r.items[id])));
    out.push('**Other kill sources**', '', tbl(['Source', 'Mode', 'Kills', 'Share', 'Targets'], OTHER.map(id => { const r = row(rs, id); return [ONE[id], DN[zd], n0(r.kills), pc(r.share), tg(r)]; })), '');
    const sf = (k, n) => `${fx(rs, k).toLocaleString('en-US')} ${n}`;
    out.push('**Support effects that are not kills**', '', `- Smoke generators diverted ${sum(rs.map(r => N(r.ars.dkills.smoke))).toLocaleString('en-US')} dives; EW jammers spoofed ${sum(rs.map(r => N(r.ars.dkills.ew))).toLocaleString('en-US')} tracks (a jammed track hits a field: no kill, no pay).`,
      `- EMP warheads disabled ${sf('emp.disabled', 'tracks')}; helpers and the swarm made ${sf('emp.assist', 'kills on disabled tracks')} (credited to them, not to the EMP).`,
      `- Chaff pods: ${sf('chaff.decoyed', 'bursts decoyed a jet or cruise missile')}, ${sf('chaff.burned', 'were burned through')}. Microwave domes fired ${sf('mwave.pulses', 'pulses')}; carriers launched ${sf('carrier.drones', 'drones')}.`, '');
    /* by bot level: pick rate and kills per run */
    const items = [...WEAPONS.slice(1), ...ARS_DEF, ...STOCK_DEF.filter(id => results.some(r => r.items[id]))];
    out.push(`**By bot level** (pick rate · kills per run)`, '', tbl(['Item', ...LV.map(l => l.n)], items.map(id => [nameOf(id), ...LV.map(l => { const r = row(rs.filter(q => q.lv === l.n), id); return r.eligible || r.kills ? `${pc(r.pick)} · ${f1(r.perRun)}` : '-'; })])), '');
  }
  return out.join('\n');
}

/* ---------- checks: the tool ran, and every kill is attributed ---------- */
const bad = [];
if (failed) bad.push(`${failed} of ${jobs.length} runs failed`);
if (!results.length) bad.push('no runs finished');
for (const r of results) {
  const tot = sum(Object.values(r.ars.kl).map(o => sum(Object.values(o)))), all = r.kills.p + r.kills.h, tag = `${r.lv} ${DN[r.zd]} #${r.idx}`;
  if (tot !== all) bad.push(`${tag}: ${tot} kills in the ledger but the game counted ${all}`);
  if (!all) bad.push(`${tag}: no kills at all`);
  if (r.errs.length) bad.push(`${tag}: page errors ${r.errs.join(' | ')}`);
  const untagged = killsOf(r, 'other') + killsOf(r, 'pilot');  /* a kill with no item behind it */
  if (all && untagged > all * .1) bad.push(`${tag}: ${untagged} of ${all} kills carry no item tag`);
  if (Object.keys(r.ars.kl).filter(k => killsOf(r, k) > 0 && !OTHER.includes(k)).length < 2) bad.push(`${tag}: kills credited to fewer than 2 items (${Object.keys(r.ars.kl).join(', ')})`);
}
if (results.length) {
  const text = report();
  if (!/\| Item \| Mode \| Bought \| Kills \|/.test(text) || !/Pilot weapons/.test(text)) bad.push('the report has no item table');
  console.log('\n' + text.split('\n').filter(l => !/^(\*\*(Setup|Columns)|Generated by)/.test(l)).join('\n'));
  if (WRITE) {
    const keep = fs.existsSync(OUT) ? (fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n').match(/\n## Reading[\s\S]*$/) || [''])[0] : '';
    fs.writeFileSync(OUT, text + '\n' + (keep || '\n## Reading\n\n(to be written)\n'));
    if (!FROM) fs.writeFileSync(JSON_OUT, JSON.stringify({date: new Date().toISOString().slice(0, 10), params: {levels: LV.map(l => l.n), diff: DIFFS.map(d => DN[d]), runs: RUNS, cap: CAP, wx: WX}, meta,
      rows: Object.fromEntries(DIFFS.map(zd => [DN[zd], Object.fromEntries([...WEAPONS, ...ARS_DEF, ...STOCK_DEF, ...OTHER].map(id => { const r = row(results.filter(q => q.zd === zd), id); return [id, {...r, targets: Object.fromEntries(r.targets)}]; }))])),
      runs: results}, null, 1) + '\n');
    console.log('wrote ' + path.relative(root, OUT) + (FROM ? '' : ' and ' + path.relative(root, JSON_OUT)));
  }
}
console.log(bad.length ? 'PROBLEMS:\n  ' + bad.join('\n  ') : QUICK ? `quick ok: ${results.length} run${results.length === 1 ? '' : 's'}, every kill attributed to an item` : 'all runs finished');
console.log(`done in ${Math.round((Date.now() - T0) / 1000)} s`);
process.exit(bad.length ? 1 : 0);
