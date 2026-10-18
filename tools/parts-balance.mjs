// Parts balance check: stats for all 125 loadouts (5 arms x 5 chassis x 5 power), with the default physics settings.
//   node tools/parts-balance.mjs          per-part summary + assertions
//   node tools/parts-balance.mjs --all    also print the full 125-row table
// Asserts: Stock-Stock-Stock is last or near-last on the composite score; every non-stock part beats its Stock counterpart
// clearly on at least one stat and loses on at least one (swapped onto a Stock base); each part's listed pros/cons hold;
// no loadout Pareto-dominates more than a small share of the others; props clear the chassis.
import {MDEF} from '../src/config/mods.js';
import {ARMS,CHASSIS,POWER,SCORED,STATS,STOCK,allLoadouts,computeLoadout,statsOf} from '../src/parts/index.js';

const ALL = process.argv.includes('--all');
const rows = allLoadouts().map(ids => { const lo = computeLoadout(ids); return {ids, lo, s: statsOf(lo, MDEF)}; });
const keys = STATS.map(s => s[0]);
// normalise each stat to 0..1 across all loadouts (what the garage bars show); composite = mean of the scored bars
const lo_ = {}, hi_ = {};
for (const k of keys) { lo_[k] = Math.min(...rows.map(r => r.s[k])); hi_[k] = Math.max(...rows.map(r => r.s[k])); }
const bar = (k, v) => (v - lo_[k]) / ((hi_[k] - lo_[k]) || 1);
for (const r of rows) r.score = SCORED.reduce((a, k) => a + bar(k, r.s[k]), 0) / SCORED.length;
rows.sort((a, b) => b.score - a.score);
const name = ids => ids.join('/');
const fmt = (k, v) => k === 'punch' ? v.toFixed(2) : k === 'ball' || k === 'size' ? v.toFixed(2) : Math.round(v).toString();
const head = 'loadout'.padEnd(24) + keys.map(k => k.padStart(7)).join('') + '  score';
if (ALL) { console.log(head); for (const r of rows) console.log(name(r.ids).padEnd(24) + keys.map(k => fmt(k, r.s[k]).padStart(7)).join('') + '  ' + r.score.toFixed(3)); console.log(); }

let failed = 0; const fail = m => { failed++; console.log('FAIL ' + m); };
// ---------- per-part summary: each part swapped onto a Stock base, % change vs Stock ----------
const base = rows.find(r => name(r.ids) === name(STOCK));
console.log('Stock-Stock-Stock: ' + keys.map(k => `${k} ${fmt(k, base.s[k])}`).join(', ') + ` | raw ${JSON.stringify(base.s.raw)} | AUW ${base.lo.auw} g`);
console.log('\nper part, swapped onto a Stock base (% vs Stock; ' + SCORED.join(' ') + ' scored, size is a trade):');
console.log('part'.padEnd(26) + keys.map(k => k.padStart(7)).join('') + '  score');
const CLEAR = 0.03;  // a "clear" win or loss: 3%
for (const [slot, list] of [[0, ARMS], [1, CHASSIS], [2, POWER]]) for (const part of list) {
  const ids = [...STOCK]; ids[slot] = part.id; const r = rows.find(x => name(x.ids) === name(ids));
  const d = {}; for (const k of keys) d[k] = r.s[k] / base.s[k] - 1;
  console.log((['arms', 'chassis', 'power'][slot] + ':' + part.name).padEnd(26) + keys.map(k => ((d[k] >= 0 ? '+' : '') + (d[k] * 100).toFixed(0) + '%').padStart(7)).join('') + '  ' + r.score.toFixed(3));
  if (part.id === 'stock') continue;
  const wins = SCORED.filter(k => d[k] > CLEAR), losses = SCORED.filter(k => d[k] < -CLEAR);
  if (!wins.length) fail(`${part.name} beats Stock on no stat`);
  if (!losses.length && !(d.size > CLEAR)) fail(`${part.name} loses to Stock on no stat`);
  for (const k of part.good || []) if (!(d[k] > CLEAR)) fail(`${part.name}: listed pro "${k}" is not better than Stock (${(d[k] * 100).toFixed(1)}%)`);
  for (const k of part.bad || []) if (!(k === 'size' ? d[k] > CLEAR : d[k] < -CLEAR)) fail(`${part.name}: listed con "${k}" is not worse than Stock (${(d[k] * 100).toFixed(1)}%)`);
}
// ---------- composite: Stock-Stock-Stock last or near-last ----------
const rank = rows.indexOf(base) + 1;
console.log(`\ncomposite score: best ${name(rows[0].ids)} ${rows[0].score.toFixed(3)}, median ${rows[62].score.toFixed(3)}, worst ${name(rows.at(-1).ids)} ${rows.at(-1).score.toFixed(3)}; Stock-Stock-Stock ${base.score.toFixed(3)} = rank ${rank}/125`);
console.log('bottom 5: ' + rows.slice(-5).map(r => `${name(r.ids)} ${r.score.toFixed(3)}`).join(', '));
if (rank < 120) fail(`Stock-Stock-Stock should be last or near-last (rank ${rank}/125)`);
// ---------- Pareto dominance on the scored stats ----------
const dom = (a, b) => SCORED.every(k => a.s[k] >= b.s[k] - 1e-9) && SCORED.some(k => a.s[k] > b.s[k] + 1e-9);
let maxDom = 0, who = rows[0], pairs = 0;
for (const a of rows) { let n = 0; for (const b of rows) if (a !== b && dom(a, b)) n++; pairs += n; if (n > maxDom) { maxDom = n; who = a; } }
const domStock = rows.filter(a => a !== base && dom(a, base)).length;
console.log(`Pareto: ${pairs} dominated pairs of ${125 * 124}; most dominant ${name(who.ids)} beats ${maxDom} loadouts outright; ${domStock} loadouts dominate Stock-Stock-Stock`);
if (maxDom > 125 * 0.08) fail(`${name(who.ids)} Pareto-dominates ${maxDom} loadouts (> 8%)`);
// ---------- geometry sanity: props clear the chassis box (or sit above it) ----------
for (const r of rows) { const {meshSpec: m} = r.lo, c = m.chassis, rr = m.arms.prop.r;
  for (const [x, z] of m.motors) { const dx = Math.max(0, Math.abs(x) - c.half[0]), dz = Math.max(0, Math.abs(z) - c.half[2]);
    if (Math.hypot(dx, dz) < rr * .97 && m.propY - .015 < c.y + c.half[1]) { fail(`${name(r.ids)}: prop hits the chassis`); break; } } }
console.log(failed ? `\n${failed} check(s) FAILED` : '\nparts balance OK');
process.exit(failed ? 1 : 0);
