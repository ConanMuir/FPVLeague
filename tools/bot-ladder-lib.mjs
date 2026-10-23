/* The bot self-play ladder (tools/bot-ladder.mjs) and its check (tools/bot-ladder-check.mjs) share this: the tunable bounds and the
   mutation, Elo, the promotion gate, seeded randomness, the in-page match runner and the ladder loop itself. No side effects on import.
   Matches run through the real modules in a headless browser (tools/browser.mjs, draw calls stubbed) at full sim speed, with Math.random
   seeded per match, every drone rebuilt per match and the ball's spin zeroed, so a match is a function of (profiles, team size, seed). */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gameReady, installRenderStub, launchBrowser, until} from './browser.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILE_V = 1, K_ELO = 24, START_ELO = 1500;

/* ---------- seeded randomness ---------- */
export const hash = (...a) => { let h = 2166136261; for (const x of a) for (const c of String(x) + '|') { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const gauss = rnd => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* ---------- the tunables evolution may touch: [min, max, default] per key, grouped by the part of the bot that reads them ----------
   The bounds are the ranges the controllers were written for (the flight model, thrust and rate limits are the game's and the same for
   everyone, so nothing here makes a bot stronger than a player's quad). A key without a default is only mutated when the profile has it
   (its default differs between code paths, e.g. kv / ke / am / cy in bots/dribble.js and bots/freestyle.js). */
export const BOUNDS = {
  plan: {kp: [1, 3], kd: [2, 6], vmax: [60, 120], att: [8, 30], rate: [8, 30], react: [.01, .15], noise: [0, .6], slack: [.8, 1.25], ka: [.5, 3, 1.5], fl: [.2, .9, .55], shd: [0, .6, .2], clrZ: [20, 90, 50]},
  top: {evT: [.2, 1, .45], kdR: [30, 120, 75], kdB: [60, 200, 120], bump: [60, 400], posT: [.3, 1.2, .6], posK: [.2, 1.2, .6], posG: [.6, 2.5, 1.5], posZ: [.4, .9, .66]},
  drib: {dv: [5, 20, 10], hold: [.2, 1.5], cm: [.3, 1, .6], cl: [2, 40, 4], nr: [5, 30, 10], sa: [8, 24, 12], sbk: [10, 36, 24], kc: [1, 6, 2.5], kn: [6, 24, 10], kv: [3, 14], ke: [2, 8], topR: [1, 3],
    apA: [12, 40, 22], apW: [2, 10, 5], apM: [.7, 1.1, .95], apG: [0, 1, .25], brk: [10, 40, 20], ayM: [20, 60, 40], sy: [1, 2.5, 1.4], sdc: [20, 80, 40], am: [15, 60], ah: [30, 80, 55], kg: [.5, 2.5, 1.2], wallR: [10, 35, 20], rm: [20, 100, 50], nh: [6, 20, 12], cy: [2, 14]},
  fs: {tapP: [0, .6, 0], rdE: [.2, .9, .3], rdU: [.7, .98, .93], rdY: [.5, 4, 1], spP: [0, .6, .3], upP: [0, .8, .4], airP: [0, .7, .35], rsC: [0, .5, .25], ceP: [0, .4, .15], wpP: [0, .6, .35], hopP: [.2, .9, .6], tapA: [10, 24, 16], tapB: [24, 45, 32], spinL: [0, .8, .3], cutO: [2, 5, 3.5]}};
export const META = new Set(['n', 'id', 'gen', 'arch', 'parent']);  /* profile fields that are not tunables */
/* the keys a profile may mutate, with their bounds */
export function mutableKeys(p) {
  const out = [], add = (g, cond = true) => { if (!cond) return; for (const [k, b] of Object.entries(BOUNDS[g])) if (k in p || b.length > 2) out.push([k, b]); };
  add('plan'); add('top', !!(p.drib || p.kdemo || 'bump' in p)); add('drib', !!p.drib); add('fs', !!p.fs);
  return out.filter(([k, b]) => !(k === 'bump' && !('bump' in p)) && !(['kdR', 'kdB'].includes(k) && !p.kdemo) && !(['evT', 'posT', 'posK', 'posG', 'posZ'].includes(k) && !p.drib));
}
export const round4 = v => +(+v).toPrecision(4);
/** a child of profile p: 1-3 of its tunables stepped by a gaussian of 8% of their range, clamped; returns {profile, keys: {k: [from, to]}} */
export function mutate(p, rnd) {
  const keys = mutableKeys(p), n = 1 + Math.floor(rnd() * 3), picked = new Map(), out = {};
  for (const k in p) if (!META.has(k)) out[k] = p[k];
  while (picked.size < Math.min(n, keys.length)) { const [k, b] = keys[Math.floor(rnd() * keys.length)]; if (!picked.has(k)) picked.set(k, b); }
  const changed = {};
  for (const [k, [lo, hi, def]] of picked) { const from = k in p ? p[k] : def, to = round4(Math.min(hi, Math.max(lo, from + gauss(rnd) * (hi - lo) * .08))); out[k] = to; changed[k] = [from, to]; }
  return {profile: out, keys: changed};
}
/** every tunable of p inside its bounds? returns the keys that are not */
export function outOfBounds(p) {
  const bad = []; for (const [k, [lo, hi]] of mutableKeys(p)) if (k in p && !(p[k] >= lo && p[k] <= hi)) bad.push(k); return bad;
}

/* ---------- Elo and records ---------- */
export function eloUpdate(R, a, b, sa, K = K_ELO) { const ra = R[a] ?? START_ELO, rb = R[b] ?? START_ELO, ea = 1 / (1 + 10 ** ((rb - ra) / 400)); R[a] = ra + K * (sa - ea); R[b] = rb - K * (sa - ea); }
export const record = (REC, id) => REC[id] || (REC[id] = {w: 0, d: 0, l: 0, gf: 0, ga: 0});
export function tally(REC, a, b, ga, gb) { const A = record(REC, a), B = record(REC, b); A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga; if (ga > gb) { A.w++; B.l++; } else if (ga < gb) { A.l++; B.w++; } else { A.d++; B.d++; } }

/* ---------- the promotion gate: a candidate that wins without playing football is not promoted ----------
   Summed over its matches against the champion (per sim minute of play): it must touch the ball, hold it part of the time, shoot on
   target, score with its own touches (not live off the opponent's own goals), and the ball must never leave the arena or go NaN
   (a physics exploit would show as that). */
export const GATE = {touchesPerMin: 3, possession: .2, shotsPerMin: .4, scored: 1, outRun: 30, outMax: 1.5};
export const freshStats = () => ({play: 0, touches: 0, pos: 0, posAll: 0, shots: 0, gf: 0, ga: 0, scored: 0, own: 0, carry: 0, pops: 0, demoed: 0, out: 0, outRun: 0, outMax: 0, nan: 0});
export function addStats(S, r, me) { const T = r[me], O = r[me === 'A' ? 'B' : 'A']; S.play += r.play; S.posAll += T.pos + O.pos; for (const k of ['touches', 'pos', 'shots', 'gf', 'ga', 'scored', 'own', 'carry', 'pops', 'demoed']) S[k] += T[k]; S.out += r.out; S.outRun = Math.max(S.outRun, r.outRun); S.outMax = Math.max(S.outMax, r.outMax); S.nan += r.nan; return S; }
export function gate(S) {
  const min = Math.max(S.play / 60, 1e-6), why = [], f = x => +x.toFixed(2);
  if (S.nan) why.push(`the ball went NaN for ${S.nan} ticks (a physics exploit)`);
  if (S.outRun > GATE.outRun || S.outMax > GATE.outMax) why.push(`the ball sat outside the arena for ${S.outRun} ticks in a row, up to ${f(S.outMax)} m deep (a physics exploit; hard contacts only spike a few ticks)`);
  if (S.touches / min < GATE.touchesPerMin) why.push(`${f(S.touches / min)} touches/min < ${GATE.touchesPerMin}: it does not play the ball`);
  if (S.posAll > 0 && S.pos / S.posAll < GATE.possession) why.push(`${Math.round(100 * S.pos / S.posAll)}% possession < ${100 * GATE.possession}%: it camps`);
  if (S.shots / min < GATE.shotsPerMin) why.push(`${f(S.shots / min)} shots on target/min < ${GATE.shotsPerMin}: it does not attack`);
  if (S.scored < GATE.scored) why.push(`${S.scored} goals from its own touch < ${GATE.scored}`);
  if (S.gf - S.scored > S.scored) why.push(`${S.gf - S.scored} of its ${S.gf} goals were the opponent's own goals`);
  return {ok: why.length === 0, why, stats: {min: f(min), touchesPerMin: f(S.touches / min), possession: S.posAll ? f(S.pos / S.posAll) : null, shotsPerMin: f(S.shots / min), gf: S.gf, ga: S.ga, scored: S.scored, ownGoals: S.own, carrySPerMin: f(S.carry / min), popsPerMin: f(S.pops / min), demoed: S.demoed, out: S.out, outRun: S.outRun, outMax: f(S.outMax), nan: S.nan}};
}

/* ---------- the file (src/bots/evolved.json): every generation's result, resumable ---------- */
export const emptyFile = seed => ({v: FILE_V, seed, gen: 0, games: 0, ratings: {}, records: {}, champs: {}, profiles: [], log: []});
export function loadFile(file) { if (!fs.existsSync(file)) return null; const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d.v !== FILE_V) throw new Error(`${file}: version ${d.v}, expected ${FILE_V}`); return d; }
export function saveFile(file, d) { d.log = d.log.slice(-400); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, JSON.stringify(d, (k, v) => typeof v === 'number' && !Number.isInteger(v) ? round4(v) : v) + '\n'); }
export function validateFile(d, roster = []) {
  const bad = [];
  if (!d || d.v !== FILE_V) bad.push('version');
  if (!(d.gen >= 0) || !(d.games >= 0)) bad.push('gen/games');
  for (const k of ['ratings', 'records', 'champs']) if (!d[k] || typeof d[k] !== 'object') bad.push(k);
  if (!Array.isArray(d.profiles) || !Array.isArray(d.log)) bad.push('profiles/log');
  if (bad.length) return bad;
  for (const n of roster) { if (!(d.ratings[n] > 0)) bad.push(`no rating for ${n}`); if (!d.champs[n]) bad.push(`no champion for ${n}`); }
  for (const p of d.profiles) { if (!p.id || !p.arch || !(p.gen > 0) || !p.parent || !p.profile) bad.push(`profile ${p.id} incomplete`); else { const o = outOfBounds(p.profile); if (o.length) bad.push(`profile ${p.id} out of bounds: ${o}`); if (!(d.ratings[p.id] > 0)) bad.push(`profile ${p.id} unrated`); } }
  for (const e of d.log) { if (!e.id || !(e.gen >= 0) || !Array.isArray(e.matches) || !e.gate || !Array.isArray(e.gate.why)) bad.push(`log entry ${e.id} incomplete`); for (const m of e.matches || []) if (!m.score || m.score.length !== 2 || !(m.seed >= 0)) bad.push(`log entry ${e.id}: bad match`); }
  return bad;
}

/* ---------- the browser: one headless window, N pages, each with the game booted and the match runner installed ---------- */
export async function openPages(n, errs) {
  const {createServer} = await import('vite');
  const server = await createServer({root, logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
  const b = await launchBrowser({protocolTimeout: 0, args: ['--ignore-gpu-blocklist']}), pages = [], url = server.resolvedUrls.local[0] + 'app.html';
  for (let i = 0; i < n; i++) {
    const p = await b.newPage(); await installRenderStub(p, true); p.setDefaultTimeout(0);
    p.on('pageerror', e => errs.push(`page ${i}: ${e.message}`)); p.on('error', e => errs.push(`page ${i} crashed: ${e.message}`));
    await p.goto(url); await gameReady(p); p.info = await p.evaluate(PAGE_SETUP);
    /* main.js queues first-use work for idle time (render/warm.js: shaders, textures, the Highlands and its Rapier colliders); a task landing
       between two matches would change the physics world's collider set mid-ladder, so the Rapier part is built in PAGE_SETUP and the rest is
       waited out here (nothing else runs in idle time after it) */
    await until(() => p.evaluate(async () => (await import('/src/render/warm.js')).warmLeft().length === 0), {timeout: 240000, every: 250, what: 'the warm-up queue'});
    pages.push(p);
  }
  return {pages, close: async () => { await b.close(); await server.close(); }};
}
/* runs inside the page once: imports the live modules, parks the game (demo, paused) and installs window.__ladder.match */
const PAGE_SETUP = async () => {
  const DF = await import('/src/modes/dogfight.js'), MA = await import('/src/modes/match.js'), {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'),
    {ball} = await import('/src/physics/ball.js'), {DIFF} = await import('/src/config/constants.js'), {STOCK} = await import('/src/parts/index.js'),
    {onEv} = await import('/src/core/events.js'), {sdf} = await import('/src/physics/sdf.js'), {BR} = await import('/src/config/tune.js'), {topOf} = await import('/src/bots/dribble.js'),
    {warmDFPhys} = await import('/src/physics/world.js');
  let touch = null, shot = null; onEv('touch', e => { touch = e.d; if (e.verdict === 'shot') shot = e.d; });
  warmDFPhys();  /* the Highlands colliders now, not in idle time between two matches (openPages) */
  DF.setGame('league'); MA.startDemo(); GS.paused = true; GS.menuOpen = true;
  const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const _r = new (ball.p.constructor)(), onTop = d => { _r.subVectors(ball.p, d.p); const h = topOf(d) + BR; return Math.hypot(_r.x, _r.z) < 1.2 && _r.y > h - .5 && _r.y < h + .6; };
  const fresh = () => ({touches: 0, pos: 0, shots: 0, gf: 0, ga: 0, scored: 0, own: 0, carry: 0, pops: 0, demoed: 0}), BASE = DIFF.length;
  /* one match: profile objects pa, pb (full DIFF entries), team size, sim seconds (half each way), seed. Side A is blue in the first half, orange in the second. */
  window.__ladder = {match(pa, pb, size, secs, seed) {
    DIFF.length = BASE; const ia = DIFF.push({...pa}) - 1, ib = DIFF.push({...pb}) - 1, R0 = Math.random; Math.random = mulberry(seed);
    try {
      for (const d of GS.drones) d.dispose(); GS.drones = []; GS.player = null;
      MA.applySlots([0, 1].map(t => Array.from({length: size}, (_, i) => 'b' + t + i))); for (const d of GS.drones) d.setLoadout(STOCK);
      ball.w.set(0, 0, 0); ball.q.identity(); ball.v0.set(0, 0, 0); ball.c = false; ball.n.set(0, 1, 0); ball.hit = 0; GS.stepN = 0;  /* what kickoff() leaves from the game before: spin, contact, the predict / roles phase */
      const dt = 1 / 120, n = Math.round(secs / 2 / dt), T = {A: fresh(), B: fresh()}; let play = 0, out = 0, outRun = 0, outMax = 0, run = 0, nan = 0;
      for (const half of [0, 1]) {
        const side = d => d.team === half ? 'A' : 'B'; for (const d of GS.drones) d.skill = d.team === half ? ia : ib; GS.score = [0, 0]; MA.kickoff();
        let last = null, li = -1e9, ls = null, lsi = -1e9, sc = [0, 0];
        for (let i = 0; i < n; i++) {
          touch = null; shot = null; const was = GS.drones.map(d => d.dead > 0), pt = GS.drones.map(d => d.popT > 0); ST.step(dt);
          const playing = GS.state === 'play';
          if (playing) { play += dt; if (ball.last) T[side(ball.last)].pos += dt; for (const d of GS.drones) if (d.dead <= 0 && onTop(d)) T[side(d)].carry += dt;
            if (!Number.isFinite(ball.p.x + ball.p.y + ball.p.z + ball.v.x + ball.v.y + ball.v.z)) nan++;
            else { const dep = sdf(ball.p.x, ball.p.y, ball.p.z) + BR; if (dep > .3) { out++; run++; outRun = Math.max(outRun, run); outMax = Math.max(outMax, dep); } else run = 0; } }  /* the ball outside the arena's free space: hard contacts spike a few ticks, a run means stuck through a wall */
          if (touch && (touch !== last || i - li > 30)) { T[side(touch)].touches++; last = touch; li = i; }
          if (shot && (shot !== ls || i - lsi > 30)) { T[side(shot)].shots++; ls = shot; lsi = i; }
          GS.drones.forEach((d, j) => { const k = side(d); if (!was[j] && d.dead > 0 && playing) T[k].demoed++; if (!pt[j] && d.popT > 0) T[k].pops++; });
          if (GS.score[0] !== sc[0] || GS.score[1] !== sc[1]) { const t = GS.score[0] > sc[0] ? 0 : 1; sc = [GS.score[0], GS.score[1]]; const w = t === half ? 'A' : 'B', l = w === 'A' ? 'B' : 'A';
            T[w].gf++; T[l].ga++; if (ball.last) { if (side(ball.last) === w) T[w].scored++; else T[l].own++; } }
        }
      }
      for (const k of ['A', 'B']) { T[k].pos = +T[k].pos.toFixed(2); T[k].carry = +T[k].carry.toFixed(2); }
      return {gA: T.A.gf, gB: T.B.gf, A: T.A, B: T.B, play: +play.toFixed(1), out, outRun, outMax: +outMax.toFixed(2), nan};
    } finally { Math.random = R0; }
  }};
  return {levels: DIFF.map(d => d.n), select: [...document.querySelectorAll('#f_diff option')].map(o => o.textContent)};
};
/* a pool: jobs {pa, pb, size, secs, seed} run on free pages, results land in job.r in any order (ratings are applied in job order after) */
export async function runJobs(pages, jobs, onDone) {
  let next = 0; const worker = async p => { for (;;) { const j = jobs[next++]; if (!j) return; j.r = await p.evaluate((pa, pb, size, secs, seed) => window.__ladder.match(pa, pb, size, secs, seed), j.pa, j.pb, j.size, j.secs, j.seed); if (onDone) onDone(j); } };
  await Promise.all(pages.map(worker));
}

/* ---------- the ladder ---------- */
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const strip = p => { const o = {}; for (const k in p) if (!META.has(k)) o[k] = p[k]; return o; };
export const fmtRes = j => `${j.size}v${j.size} ${j.r.gA}-${j.r.gB}`;
/**
 * opts: {out, seed, roster, cands, matchMin, parallel, minutes, gens, rr, rrEnd, fresh, log}; returns the file's data (also written to opts.out).
 * One generation: for each archetype, `cands` children of its champion each play it 1v1 and 2v2 (a confirmation 1v1 when ahead); the best
 * child that is ahead by 2 goals, has more wins than losses and passes the gate becomes the champion. The loop stops at `gens` or the
 * wall-clock budget `minutes` (a generation is only started when the last one's duration still fits).
 */
export async function runLadder(opts) {
  const o = {out: path.join(root, 'src/bots/evolved.json'), seed: 1, roster: ['Legend', 'Dribbler', 'Freestyler'], cands: 3, matchMin: 3, parallel: 2, minutes: 0, gens: 0, rr: true, rrEnd: true, fresh: false, log: console.log, ...opts};
  const say = o.log || (() => {}), T0 = Date.now(), el = () => `[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)} s]`;
  const {DIFF} = await import(pathToFileURL(path.join(root, 'src/config/constants.js')).href);
  const BASES = Object.fromEntries(DIFF.map(d => [d.n, d]));
  for (const n of o.roster) if (!BASES[n]) throw new Error(`unknown level ${n}; levels: ${Object.keys(BASES).join(', ')}`);
  const D = (!o.fresh && loadFile(o.out)) || emptyFile(o.seed);
  if (D.seed !== o.seed) say(`note: the file was made with seed ${D.seed}, continuing with ${o.seed}`);
  const R = D.ratings, REC = D.records, byId = new Map(D.profiles.map(p => [p.id, p]));
  for (const n of o.roster) { if (!D.champs[n] || (!BASES[D.champs[n]] && !byId.has(D.champs[n]))) D.champs[n] = n; R[n] ??= START_ELO; }
  const profileOf = id => BASES[id] ? {...BASES[id], id} : {...byId.get(id).profile, n: `Gen ${byId.get(id).gen} ${byId.get(id).arch}`, id};
  const errs = [], {pages, close} = await openPages(o.parallel, errs);
  say(`${el()} ${pages.length} page(s) ready; levels in the game: ${pages[0].info.levels.join(', ')}`);
  const secs = o.matchMin * 60;
  const settle = jobs => { for (const j of jobs) { const a = j.pa.id, b = j.pb.id; D.games++; tally(REC, a, b, j.r.gA, j.r.gB); eloUpdate(R, a, b, j.r.gA > j.r.gB ? 1 : j.r.gA < j.r.gB ? 0 : .5); } };
  const roundRobin = async tag => {
    const ids = [...new Set([...o.roster, ...o.roster.map(n => D.champs[n])])], jobs = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (const size of [1, 2]) jobs.push({pa: profileOf(ids[i]), pb: profileOf(ids[j]), size, secs, seed: hash(o.seed, tag, D.gen, ids[i], ids[j], size)});
    say(`${el()} round robin (${tag}): ${ids.join(', ')}: ${jobs.length} matches of ${o.matchMin} sim min`);
    await runJobs(pages, jobs, j => say(`${el()}   ${j.pa.id} v ${j.pb.id} ${fmtRes(j)}`)); settle(jobs);
    D.log.push({gen: D.gen, id: 'rr-' + tag, arch: '', parent: '', keys: {}, matches: jobs.map(j => ({vs: [j.pa.id, j.pb.id], size: j.size, seed: j.seed, score: [j.r.gA, j.r.gB]})), gate: {ok: true, why: []}, promoted: false});
  };
  try {
    if (o.rr && D.gen === 0) await roundRobin('start');
    let lastGen = 0, g = D.gen; const gen0 = D.gen;
    for (;;) {
      if (o.gens && g - gen0 >= o.gens) break;
      if (o.minutes && Date.now() - T0 + lastGen > o.minutes * 60e3) break;
      if (!o.gens && !o.minutes) break;
      const t1 = Date.now(), G = g + 1, cands = [], jobs = [];
      for (const arch of o.roster) { const champ = profileOf(D.champs[arch]);
        for (let c = 0; c < o.cands; c++) { const m = mutate(champ, mulberry(hash(o.seed, 'mut', G, arch, c))), id = `g${G}-${slug(arch)}-${c}`, cand = {...m.profile, n: `Gen ${G} ${arch}`, id};
          R[id] = R[champ.id]; const C = {arch, cand, champ, keys: m.keys, jobs: []}; cands.push(C);
          for (const [k, size] of [[0, 1], [1, 2]]) { const j = {C, pa: cand, pb: champ, size, secs, seed: hash(o.seed, 'm', G, arch, c, k)}; C.jobs.push(j); jobs.push(j); } } }
      say(`${el()} generation ${G}: ${cands.length} candidates x 2 matches of ${o.matchMin} sim min`);
      const show = j => say(`${el()}   ${j.pa.id} (${Object.entries(j.C.keys).map(([k, [a, b]]) => `${k} ${a}->${b}`).join(', ')}) v ${j.pb.id} ${fmtRes(j)}`);
      await runJobs(pages, jobs, show);
      const agg = C => { let gf = 0, ga = 0, w = 0, l = 0; for (const j of C.jobs) { gf += j.r.gA; ga += j.r.gB; if (j.r.gA > j.r.gB) w++; else if (j.r.gA < j.r.gB) l++; } return {gd: gf - ga, w, l}; };
      const conf = []; for (const C of cands) { const a = agg(C); if (a.gd >= 2 && a.w > a.l) { const j = {C, pa: C.cand, pb: C.champ, size: 1, secs, seed: hash(o.seed, 'm', G, C.arch, C.cand.id, 2)}; C.jobs.push(j); conf.push(j); } }
      if (conf.length) { say(`${el()}   ${conf.length} ahead: confirmation 1v1`); await runJobs(pages, conf, show); }
      settle([...jobs, ...conf]);
      for (const arch of o.roster) { let best = null;
        for (const C of cands.filter(c => c.arch === arch)) { const a = agg(C), S = freshStats(); for (const j of C.jobs) addStats(S, j.r, 'A'); const gt = gate(S), promoted = a.gd >= 2 && a.w > a.l && gt.ok; C.a = a; C.gt = gt;
          D.log.push({gen: G, id: C.cand.id, arch, parent: C.champ.id, keys: C.keys, matches: C.jobs.map(j => ({vs: [j.pa.id, j.pb.id], size: j.size, seed: j.seed, score: [j.r.gA, j.r.gB]})), gd: a.gd, w: a.w, l: a.l, rating: round4(R[C.cand.id]), gate: gt, promoted});
          say(`${el()}   ${C.cand.id}: ${a.w}-${C.jobs.length - a.w - a.l}-${a.l}, goals ${a.gd >= 0 ? '+' : ''}${a.gd}, rating ${R[C.cand.id].toFixed(0)}${promoted ? ' PROMOTED' : gt.ok ? '' : ' (gate: ' + gt.why.join('; ') + ')'}`);
          if (promoted && (!best || a.gd > best.a.gd || a.gd === best.a.gd && R[C.cand.id] > R[best.cand.id])) best = C; }
        for (const C of cands.filter(c => c.arch === arch)) if (C !== best) { delete R[C.cand.id]; delete REC[C.cand.id]; }
        if (best) { const p = {id: best.cand.id, n: best.cand.n, arch, gen: G, parent: best.champ.id, rating: round4(R[best.cand.id]), born: new Date().toISOString(), keys: best.keys, gate: best.gt.stats, profile: strip(best.cand)}; D.profiles.push(p); byId.set(p.id, p); D.champs[arch] = p.id;
          say(`${el()}   ${arch}: new champion ${p.id} (from ${p.parent})`); } }
      D.gen = g = G; for (const p of D.profiles) p.rating = round4(R[p.id]); saveFile(o.out, D); lastGen = Date.now() - t1;
      say(`${el()} generation ${G} done in ${(lastGen / 1000).toFixed(0)} s, written to ${path.relative(root, o.out)}`);
    }
    if (o.rrEnd && D.gen > 0) { await roundRobin('end'); for (const p of D.profiles) p.rating = round4(R[p.id]); saveFile(o.out, D); }
    else if (!fs.existsSync(o.out) || o.fresh) saveFile(o.out, D);
  } finally { await close(); }
  if (errs.length) throw new Error('page errors:\n' + errs.join('\n'));
  D.table = table(D); D.page = pages[0].info; return D;
}
/* the ratings table: every rated profile, best first */
export function table(D) {
  const rows = Object.keys(D.ratings).map(id => { const r = D.records[id] || {w: 0, d: 0, l: 0, gf: 0, ga: 0}, p = D.profiles.find(x => x.id === id); return {id, rating: Math.round(D.ratings[id]), w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, gen: p ? p.gen : 0, parent: p ? p.parent : '', champion: Object.values(D.champs).includes(id)}; });
  return rows.sort((a, b) => b.rating - a.rating);
}
export function tableText(rows) {
  const w = Math.max(8, ...rows.map(r => r.id.length)), line = r => `${r.id.padEnd(w)}  ${String(r.rating).padStart(6)}  ${`${r.w}-${r.d}-${r.l}`.padStart(8)}  ${`${r.gf}-${r.ga}`.padStart(7)}  ${String(r.gen).padStart(3)}  ${r.parent.padEnd(w)}${r.champion ? '  *' : ''}`;
  return [`${'profile'.padEnd(w)}  rating     W-D-L    GF-GA  gen  parent`, ...rows.map(line), '* a current champion'].join('\n');
}
