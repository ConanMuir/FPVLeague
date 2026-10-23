/* Tournament check: the pure rules in node (every format and size built, advanced with simulated results to a champion, rebuilt from
   its save, humans and bots listed and slotted), then the mode in the game headless (Edge through the Vite dev server): the menu's
   Tournament screen, a bot match simulated flat out behind the menu, a match of yours played to its end and recorded, a bot match
   watched with no player, the bracket resumed from the save after a reload, a tournament won for the trophy. Exits 1 on a failure.
     node tools/tournament-check.mjs */
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gameReady, launchBrowser, until} from './browser.mjs';
import {FORMATS, SIZES, createTournament, entrantName, log2, matchKind, mulberry, playable, replay, report, setupOf, standings, teamsOf} from '../src/tournament/bracket.js';
import {SECOND_PILOT, TOURN_V, cleanEntrant, cleanSetup, loadTournament, newSave} from '../src/tournament/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const T0 = Date.now(), el = () => `[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)} s]`;
const {DIFF} = await import(pathToFileURL(path.join(root, 'src/config/constants.js')).href);
const NAMES = DIFF.map(d => d.n), idx = n => NAMES.indexOf(n);

/* ---------- the rules in node ---------- */
const entrants = n => Array.from({length: n}, (_, i) => i ? {kind: 'bot', lv: NAMES[(i - 1) % NAMES.length], skill: (i - 1) % NAMES.length} : {kind: 'human', pilot: 'p1', name: 'You'});
const setup = (format, size, o = {}) => cleanSetup(NAMES)({format, size, team: 1, len: 120, pairing: 'seed', mates: 2, seed: 5, entrants: entrants(size), ...o});
function playOut(T, seed) { const rnd = mulberry(seed); let n = 0;
  while (!T.done) { const p = playable(T); if (!p.length) throw new Error('stuck'); const m = p[Math.floor(rnd() * p.length)], sa = T.entrants[m.a].skill ?? 2, sb = T.entrants[m.b].skill ?? 2;
    const aw = rnd() < 1 / (1 + Math.exp(-(sa - sb) * .6)), x = 1 + Math.floor(rnd() * 4), y = Math.floor(rnd() * x); if (!report(T, m.id, aw ? [x, y] : [y, x])) throw new Error('report refused'); n++; }
  return n; }
const pairKey = m => Math.min(m.a, m.b) + '-' + Math.max(m.a, m.b);
for (const [f, fname] of FORMATS) for (const n of SIZES) {
  let why = ''; try {
    const T = createTournament(setup(f, n)), k = log2(n), played = playOut(T, n * 3 + f.length), S = standings(T), L = Object.fromEntries(S.map(r => [r.i, r.l]));
    if (!T.done || T.champion == null) why = 'no champion'; else if (S[0].i !== T.champion || S[0].rank !== 1 || S.length !== n) why = 'standings';
    else if (f === 'single' && (played !== n - 1 || L[T.champion] !== 0 || S[1].rank !== 2)) why = 'single: ' + played;
    else if (f === 'double' && (played < 2 * n - 2 || played > 2 * n - 1 || L[T.champion] > 1 || S.some(r => r.l > 2) || S.slice(1).some(r => r.l < 1))) why = 'double: ' + played;
    else if (f === 'rr' && (played !== n * (n - 1) / 2 || new Set(T.matches.map(pairKey)).size !== played || S.some(r => r.p !== n - 1))) why = 'round robin: ' + played;
    else if (f === 'swiss' && (T.rounds !== k || played !== k * n / 2 || new Set(T.matches.map(pairKey)).size !== played)) why = 'swiss: ' + played;
    else if (T.matches.some(m => m.a != null && m.a === m.b)) why = 'an entrant against itself';
    else { const R = replay(setupOf(T), T.results); if (JSON.stringify(R.matches) !== JSON.stringify(T.matches) || R.champion !== T.champion) why = 'replay differs';
      const sv = newSave(setupOf(T)); sv.results = T.results.slice(0, played >> 1); const Ld = loadTournament(() => JSON.stringify(sv), () => {}, NAMES);
      if (!Ld) why = 'the save did not load'; else { const H = replay(Ld.setup, Ld.results), H2 = replay(setupOf(T), sv.results); if (H.done || JSON.stringify(playable(H).map(m => m.id)) !== JSON.stringify(playable(H2).map(m => m.id))) why = 'resume from the save'; } }
    ok(!why, `${fname}, ${n} entrants: ${played} matches to a champion (${entrantName(T, T.champion)}), the same from its save${why ? ': ' + why : ''}`);
  } catch (e) { ok(false, `${fname}, ${n}: ${e.message}`); }
}
{ const T = createTournament(setup('rr', 4, {team: 2, mates: idx('Champion'), entrants: [{kind: 'human', pilot: 'p1', name: 'You'}, {kind: 'bot', lv: 'Legend'}, {kind: 'bot', lv: 'Legend'}, {kind: 'bot', lv: 'Rookie'}]}));
  const names = [0, 1, 2, 3].map(i => entrantName(T, i)), mine = T.matches.find(m => m.a === 0 || m.b === 0), t = teamsOf(T, mine), side = mine.a === 0 ? 0 : 1;
  const bots = T.matches.find(m => m.a === 1 && m.b === 3 || m.a === 3 && m.b === 1), tb = teamsOf(T, bots);
  ok(names.join('|') === 'You|Legend A|Legend B|Rookie' && T.entrants.map(e => e.kind).join() === 'human,bot,bot,bot', `humans and bots listed: ${names.join(', ')}`);
  ok(t.keys[side][0] === 'h' && t.skill[t.keys[side][1]] === idx('Champion') && t.keys[1 - side].length === 2 && matchKind(T, mine) === 'play', `your match: you fly 'h' with a ${NAMES[t.skill[t.keys[side][1]]]} team-mate against ${entrantName(T, mine.a === 0 ? mine.b : mine.a)}`);
  ok(!tb.keys.flat().includes('h') && tb.keys.flat().map(k => tb.skill[k]).sort().join() === [0, 0, 3, 3].sort().join() && matchKind(T, bots) === 'bots', `a bot match: no pilot, every bot at its entrant's level`);
  const w = []; const unv = loadTournament(() => JSON.stringify({setup: setupOf(T), results: []}), o => w.push(o), NAMES);
  ok(unv && unv.tv === TOURN_V && w.length === 1 && w[0].tv === TOURN_V, `an unversioned save migrates to tv ${TOURN_V} and is written once`);
  ok(cleanEntrant({kind: 'human', pilot: 'p2'}, NAMES) === null && !SECOND_PILOT, 'the second pilot slot is hidden (one controller map in src/input)');
  ok(loadTournament(() => JSON.stringify({tv: 1, setup: {...setupOf(T), entrants: [...T.entrants.slice(0, 3), {kind: 'bot', lv: 'Gen 99 Nobody'}]}, results: []}), () => {}, NAMES) === null, 'a save with a level that no longer exists does not resume');
}

/* ---------- the mode in the game, headless ---------- */
console.log(`${el()} booting the game headless`);
const {createServer} = await import('vite');
const server = await createServer({root, logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist'], protocolTimeout: 0});
const p = await b.newPage(); p.setDefaultTimeout(0); const errs = []; p.on('pageerror', e => errs.push(e.message)); const url = server.resolvedUrls.local[0] + 'app.html';
await p.goto(url); await gameReady(p);
const r = await p.evaluate(async () => {
  const TM = await import('/src/modes/tournament.js'), UI = await import('/src/ui/tournament.js'), B = await import('/src/tournament/bracket.js'), {cleanSetup} = await import('/src/tournament/store.js'),
    {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'), {DIFF} = await import('/src/config/constants.js'), {S} = await import('/src/config/settings.js');
  const names = DIFF.map(d => d.n), dt = 1 / 120, out = {}, snap = () => window.__dl.tourn(), $ = id => document.getElementById(id);
  const q = sel => document.querySelector(sel), qa = sel => [...document.querySelectorAll(sel)];
  localStorage.removeItem('droneleague.tournament'); TM.tournAbandon();
  /* 1. the screen: the nav button, the setup with its slots and levels */
  $('tournbtn').click(); out.screen = {open: !$('scr-tournament').hidden, slots: qa('#tnslots .tnslot').length, options: q('#tnslots select')?.options.length, levels: names.length, start: !!$('tnstart')};
  /* 1b. through its controls: round robin of 4, the second slot moved to the top with its arrow, Start, then Simulate on a bot match's button */
  const set = (id, v) => { const s = $(id); s.value = String(v); s.dispatchEvent(new Event('change', {bubbles: true})); };
  set('tn_format', 'rr'); set('tn_size', 4); set('tn_len', 60); q('[data-mv="1:-1"]').click(); const top = q('#tnslots select').value; $('tnstart').click(); const u0 = snap();
  q('[data-act="sim"]')?.click(); const u1 = snap(); let g0 = 0; while (TM.TN.sim && g0++ < 4000) TM.simTick(200); const u2 = snap();
  /* then Simulate all: every bot match left (two more of the three bot v bot ones) in turn, the queue outliving each match's end, until only your matches are left */
  UI.renderTournament(); $('tnsimall').click(); const u3 = snap(); const stopBtn = !!$('tnstopq'); let g1 = 0; while ((TM.TN.sim || TM.TN.queue) && g1++ < 40000) TM.simTick(200); const u4 = snap();
  out.ui = {on: u0.on, format: u0.format, size: u0.size, top, first: u0.entrants[0], simStarted: u1.cur?.how === 'sim', results: u2.results, abandon: !!$('tnquit'), queued: u3.queue, stopBtn, all: u4.results, noBots: !TM.nextBots(), left: u4.playable.length}; TM.tournAbandon(); UI.renderTournament();
  /* 1c. abandoned while a simulation runs (not offered by the screen, whose Abandon is disabled meanwhile; a caller can): the mode goes back to your own, with its menu demo */
  S.game = 'league'; TM.tournNew(cleanSetup(names)({format: 'single', size: 4, team: 1, len: 60, pairing: 'list', mates: 2, seed: 4, entrants: [{kind: 'bot', lv: 'Rookie'}, {kind: 'bot', lv: 'Pro'}, {kind: 'bot', lv: 'Legend'}, {kind: 'bot', lv: 'Champion'}]}));
  TM.tournSimAll(); TM.simTick(30); const a0 = {before: GS.GM, sim: !!TM.TN.sim}; TM.tournAbandon(); out.abandonSim = {...a0, GM: GS.GM, demo: GS.demo, on: window.__dl.tourn().on, drones: GS.drones.length}; UI.renderTournament();
  /* 2. a small one: you and three bots, 1v1, 1 minute, as listed (You v Rookie, Legend v Pro) */
  const setup = cleanSetup(names)({format: 'single', size: 4, team: 1, len: 60, pairing: 'list', mates: 2, seed: 1, entrants: [{kind: 'human', pilot: 'p1'}, {kind: 'bot', lv: 'Rookie'}, {kind: 'bot', lv: 'Legend'}, {kind: 'bot', lv: 'Pro'}]});
  TM.tournNew(setup); UI.renderTournament();
  out.bracket = {boxes: qa('#tnbody .tnm').length, play: !!q('[data-act="play"][data-id="w1-0"]'), watch: !!q('[data-act="watch"][data-id="w1-1"]'), sim: !!q('[data-act="sim"][data-id="w1-1"]'), saved: !!localStorage.getItem('droneleague.tournament')};
  /* 3. simulate the bot match flat out (the frame loop would do this in its budget; here in one go) */
  const t0 = performance.now(); out.simStart = TM.tournSim('w1-1'); const s0 = snap(); let guard = 0;
  while (TM.TN.sim && guard++ < 4000) TM.simTick(200);
  const s1 = snap(); out.sim = {started: s0.cur?.how, demo0: s0.demo, paused0: s0.paused, drones0: s0.drones, results: s1.results, last: s1.last, demoAfter: s1.demo, pausedAfter: s1.paused, after: s1.after, savedResults: s1.saved?.results?.length, ms: Math.round(performance.now() - t0)};
  /* 4. play your match: the normal match flow in mode 'tourn', then the clock run out with the bot ahead, recorded by the end event */
  out.playStart = TM.tournPlay('w1-0'); const s2 = snap(); out.play = {mode: s2.mode, demo: s2.demo, player: s2.player, drones: s2.drones, clock: GS.clock, menu: GS.menuOpen, how: s2.cur?.how};
  for (let i = 0; i < 120 * 4 && GS.state !== 'play'; i++) ST.step(dt); GS.score = [0, 1]; GS.clock = 1.5; for (let i = 0; i < 120 * 12 && !GS.demo; i++) ST.step(dt);
  const s3 = snap(); out.played = {state: GS.state, demo: s3.demo, results: s3.results, last: s3.last, after: s3.after, playable: s3.playable, cur: s3.cur, rec: window.__dl.prof().hist[0] || null, stTourn: window.__dl.prof().st.tourn || null};
  /* 5. watch the final: no player of yours, the spectator label, bots at their levels, played out to its end */
  out.watchStart = TM.tournWatch('w2-0'); const s4 = snap(); out.watch = {player: s4.player, spect: s4.spect, drones: s4.drones, demo: s4.demo, how: s4.cur?.how, osd: $('osd').textContent};
  for (let i = 0; i < 120 * 4 && GS.state !== 'play'; i++) ST.step(dt); for (let i = 0; i < 120 * 3; i++) ST.step(dt); GS.score = [2, 1]; GS.clock = .5; for (let i = 0; i < 120 * 12 && !GS.demo; i++) ST.step(dt);
  const s5 = snap(); out.watched = {done: s5.done, champion: s5.champion, champName: s5.entrants[s5.champion]?.name, results: s5.results, spect: s5.spect, trophy: s5.trophy, savedDone: s5.saved?.results?.length};
  UI.renderTournament(); out.results = {win: q('#tnbody .tnwin b')?.textContent, rows: qa('#tnbody .tnt tbody tr').length, newBtn: !!$('tnnew')};
  /* 6. win one: you against three bots, every match of yours scored by the clock trick, the bots' simulated */
  TM.tournAbandon(); TM.tournNew(cleanSetup(names)({format: 'single', size: 4, team: 2, len: 60, pairing: 'seed', mates: 3, seed: 2, entrants: [{kind: 'human', pilot: 'p1'}, {kind: 'bot', lv: 'Rookie'}, {kind: 'bot', lv: 'Pro'}, {kind: 'bot', lv: 'All-Star'}]}));
  const ach0 = window.__dl.prof().ach.includes('tourn1'), xp0 = window.__dl.prof().xp;
  TM.tournSimAll(); guard = 0; while (TM.TN.sim && guard++ < 4000) TM.simTick(200);
  const win = id => { if (!TM.tournPlay(id)) return null; const d = snap().drones; for (let i = 0; i < 120 * 4 && GS.state !== 'play'; i++) ST.step(dt); GS.score = [3, 0]; GS.clock = .5; for (let i = 0; i < 120 * 12 && !GS.demo; i++) ST.step(dt);
    return {n: d.length, mates: d.filter(x => x.team === 0 && x.bot).map(x => x.skill)}; };
  const s6 = snap(); out.won = {afterSim: s6.playable, first: win(s6.playable[0])};
  const s7 = snap(); out.won.second = s7.playable[0] ? win(s7.playable[0]) : null; const s8 = snap();
  out.won = {...out.won, done: s8.done, champion: s8.champion, trophy: s8.trophy, ach: window.__dl.prof().ach.includes('tourn1'), ach0, xpGain: window.__dl.prof().xp - xp0};
  return out;
});
console.log(JSON.stringify(r, null, 1));
ok(r.screen.open && r.screen.slots === 8 && r.screen.options === r.screen.levels + 1 && r.screen.start, `the Tournament screen: 8 slots by default, each offering You and the ${r.screen.levels} bot levels`);
ok(r.ui.on && r.ui.format === 'rr' && r.ui.size === 4 && r.ui.top === 'b:0' && r.ui.first.kind === 'bot' && r.ui.first.name === NAMES[0] && r.ui.simStarted && r.ui.results === 1 && r.ui.abandon, `through the controls: a round robin of 4 started with ${r.ui.first.name} moved to the top seed, a bot match simulated from its button`);
ok(r.ui.queued && r.ui.stopBtn && r.ui.all === 3 && r.ui.noBots && r.ui.left === 3, `Simulate all bot matches runs every bot match in turn (the round robin of 4 with you: ${r.ui.all} of the 3 bot matches done, ${r.ui.left} of yours left); Stop after this match offered meanwhile`);
ok(r.abandonSim.sim && r.abandonSim.before === 'tourn' && r.abandonSim.GM === 'league' && r.abandonSim.demo && !r.abandonSim.on, `abandoned under a simulation (mode ${r.abandonSim.before} before): the mode is back to ${r.abandonSim.GM} with its menu demo (${r.abandonSim.drones} quads), no tournament left`);
ok(r.bracket.boxes === 3 && r.bracket.play && r.bracket.watch && r.bracket.sim && r.bracket.saved, 'a 4-player single elimination: 3 match boxes, Play on yours, Watch / Simulate on the bots\' one, saved');
ok(r.simStart && r.sim.started === 'sim' && r.sim.demo0 && r.sim.paused0 && r.sim.drones0.length === 2 && r.sim.drones0.every(d => d.bot) && r.sim.drones0.map(d => d.skill).sort().join() === [idx('Legend'), idx('Pro')].sort().join(), `simulate: 1v1 of bots at their levels behind the menu (${r.sim.drones0.map(d => NAMES[d.skill]).join(' v ')})`);
ok(r.sim.results === 1 && r.sim.last?.id === 'w1-1' && r.sim.last.score[0] !== r.sim.last.score[1] && r.sim.savedResults === 1 && r.sim.demoAfter && !r.sim.pausedAfter, `simulated to a result (${r.sim.last?.score.join('-')}) in ${r.sim.ms} ms, saved, the menu demo back`);
ok(r.playStart && r.play.mode === 'tourn' && !r.play.demo && r.play.player === 'h' && r.play.drones.length === 2 && r.play.drones.find(d => d.bot)?.skill === idx('Rookie') && r.play.clock === 60 && !r.play.menu, 'play: your match is a normal match in mode tourn against the Rookie, 1 minute');
ok(r.played.demo && r.played.results === 2 && r.played.last?.id === 'w1-0' && r.played.last.score.join('-') === '0-1' && r.played.cur === null && r.played.rec?.m === 'tourn' && r.played.stTourn?.m === 1, `your match's end is recorded (${r.played.last?.score.join('-')}) and counted in the profile under tourn`);
ok(r.watchStart && r.watch.player === null && r.watch.spect && r.watch.drones.length === 2 && r.watch.drones.every(d => d.bot) && !r.watch.demo && r.watch.how === 'watch', `watch: no player, spectating "${r.watch.spect}"`);
ok(r.watched.done && r.watched.results === 3 && r.watched.champion != null && !r.watched.trophy && r.watched.savedDone === 3 && !r.watched.spect, `watched to the end: champion ${r.watched.champName}, no trophy for a bot`);
ok(r.results.win === r.watched.champName && r.results.rows === 4 && r.results.newBtn, 'the results screen: the champion and 4 standings rows');
ok(r.won.first?.n === 4 && r.won.first.mates.join() === String(idx('Legend')) && r.won.second?.n === 4, `2v2: four quads, your team-mate a ${NAMES[r.won.first?.mates[0]]} (the mates level)`);
ok(r.won.done && r.won.champion === 0 && r.won.trophy && r.won.trophy.xp > 0 && r.won.ach && !r.won.ach0 && r.won.xpGain >= r.won.trophy.xp, `won one: trophy +${r.won.trophy?.xp} XP, achievement Trophy Cabinet`);
/* resume: the save survives a reload (the won tournament's finished state), then abandon clears it */
await p.reload(); await gameReady(p);
const r2 = await p.evaluate(async () => { const TM = await import('/src/modes/tournament.js'); const s = window.__dl.tourn(); TM.tournAbandon(); return {on: s.on, done: s.done, champion: s.champion, results: s.results, cleared: !localStorage.getItem('droneleague.tournament') && !window.__dl.tourn().on}; });
ok(r2.on && r2.done && r2.champion === 0 && r2.results === 3 && r2.cleared, 'resume: after a reload the finished tournament is back from its save; Abandon clears it');
/* resume mid-way: a saved tournament with two results opens at the right match */
const r3 = await p.evaluate(async () => { const B = await import('/src/tournament/bracket.js'), {cleanSetup, newSave} = await import('/src/tournament/store.js'), {DIFF} = await import('/src/config/constants.js');
  const names = DIFF.map(d => d.n), sv = newSave(cleanSetup(names)({format: 'double', size: 4, team: 1, len: 60, pairing: 'list', mates: 2, seed: 1, entrants: [{kind: 'human', pilot: 'p1'}, {kind: 'bot', lv: 'Rookie'}, {kind: 'bot', lv: 'Legend'}, {kind: 'bot', lv: 'Pro'}]}));
  sv.results = [{id: 'w1-0', score: [2, 0]}, {id: 'w1-1', score: [0, 1]}]; localStorage.setItem('droneleague.tournament', JSON.stringify(sv)); return sv.results.length; });
await p.reload(); await gameReady(p);
const r4 = await p.evaluate(async () => { const s = window.__dl.tourn(); document.getElementById('tournbtn').click(); return {...s, open: !document.getElementById('scr-tournament').hidden, live: [...document.querySelectorAll('#tnbody .tnm.next')].length}; });
ok(r4.on && r4.format === 'double' && r4.results === 2 && r4.playable.join() === 'w2-0,l1-0' && r4.open && r4.live === 2, `resume mid-way: a double elimination with 2 results opens at ${r4.playable.join(' and ')}`);
ok(!errs.length, 'no page errors' + (errs.length ? ':\n  ' + errs.join('\n  ') : ''));
await b.close(); await server.close();
console.log(`${el()} ${fails ? fails + ' FAILED' : 'TOURNAMENT CHECK PASSED'}`);
process.exit(fails ? 1 : 0);
