// Online goal replays: a host and a joining pilot, each in its own headless window, talking through a BroadcastChannel stand-in for
// the claude.ai room (window.claude.use('room'), so net/net.js runs its normal room path). The host scores a scripted goal.
// Checks: the host's post-goal wait grows to fit the replay and reaches the joiner; both pilots play their own replay; the joiner's
// replay is over before the host's kickoff; when both skip the next replay, the host starts the kickoff at once (the rs vote);
// the score and kickoffs stay in sync; no page errors.
//   node tools/replay-online-check.mjs
import fs from 'node:fs';
import {launchBrowser, gameReady} from './browser.mjs';
import {newWindow} from './zlib.mjs';
const {createServer} = await import('vite');
fs.mkdirSync('shots', {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist', '--window-size=960,540']});
const fails = [], chk = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };
// the room stand-in: one BroadcastChannel per game; presence is merged and broadcast, peers are everyone heard from
const ROOM = () => { const mk = name => { const bc = new BroadcastChannel(name), id = 'p' + Math.random().toString(36).slice(2, 9), others = new Map(), hs = []; let me = {peer: id, sameTab: true, presence: {}};
    const fire = () => { const peers = [me, ...others.values()]; hs.forEach(h => h({peers})); };
    bc.onmessage = e => { const m = e.data; if (!m || m.from === id) return; if (m.t === 'x') others.delete(m.from); else others.set(m.from, {peer: m.from, sameTab: false, presence: m.d}); fire(); };
    return {presence(p) { me = {...me, presence: {...me.presence, ...p}}; bc.postMessage({from: id, d: me.presence}); return Promise.resolve(); },
      onPeers(h) { hs.push(h); setTimeout(() => h({peers: [me, ...others.values()]}), 0); return () => {}; }, leave() { bc.postMessage({from: id, t: 'x'}); bc.close(); return Promise.resolve(); }}; };
  const lobby = {presence: () => Promise.resolve(), onPeers: () => () => {}, join: name => Promise.resolve(mk(name))};
  window.claude = {use: async k => k === 'room' ? lobby : null}; };
async function page(name) {
  const p = await newWindow(b); await p.setViewport({width: 960, height: 540}); const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.evaluateOnNewDocument(ROOM); await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
  await p.evaluate(async name => { const M = window.__m = {GS: (await import('/src/state.js')).GS, S: (await import('/src/config/settings.js')).S, N: await import('/src/net/net.js'), RP: await import('/src/render/replay.js'),
    ball: (await import('/src/physics/ball.js')).ball, C: await import('/src/config/constants.js'), T: await import('/src/config/tune.js'), DF: await import('/src/modes/dogfight.js')};
    M.S.name = name; M.S.bots = 0; M.S.replay = 'on'; M.S.tp = name === 'Hosty' ? '0' : '1'; M.DF.setGame('league'); M.log = []; M.ends = [];
    let was = false, last = null; const loop = () => { const s = M.RP.rpState(); if (was && !s.on) M.ends.push({...last, state: M.GS.state, at: performance.now()}); was = s.on; if (s.on) last = {el: s.el, dur: s.clip.dur, pt: s.pt, tB: s.clip.tB};
      M.log.push([performance.now(), M.GS.state]); if (M.log.length > 4000) M.log.splice(0, 2000); requestAnimationFrame(loop); }; loop(); }, name);
  return {p, errs, name};
}
const H = await page('Hosty'), J = await page('Joy');
const st = P => P.p.evaluate(() => { const M = window.__m, G = M.GS, s = M.RP.rpState(); return {on: s.on, pend: s.pend, el: s.el, kind: s.kind, dur: s.clip?.dur, rs: s.rs, state: G.state, stT: +G.stT.toFixed(2), goalLen: G.goalLen, score: [...G.score], n: G.drones.length, ko: G.net ? (G.net.host ? G.koN : G.net.ko) : null, ends: M.ends.length}; });
const waitFor = async (P, f, ms, what) => { const t0 = Date.now(); for (;;) { const s = await st(P); if (f(s)) return s; if (Date.now() - t0 > ms) throw new Error(P.name + ' timed out: ' + what + ' ' + JSON.stringify(s) + ' errs: ' + P.errs.join(' | ')); await sleep(30); } };
await H.p.evaluate(() => window.__m.N.enterGame('rpck', true)); await sleep(500); await J.p.evaluate(() => window.__m.N.enterGame('rpck', false));
await waitFor(J, s => s.n === 2 && s.state === 'play', 30000, 'joined and playing'); await waitFor(H, s => s.n === 2 && s.state === 'play', 10000, 'host playing');
const shoot = () => H.p.evaluate(() => { const M = window.__m, d = M.GS.player, {ball} = M, BR = M.T.BR, z0 = -(M.C.HL - 70); ball.p.set(0, BR, z0); ball.v.set(0, 0, 0); ball.w.set(0, 0, 0);
  d.p.set(0, BR, z0 + 45); d.q.set(0, 0, 0, 1); d.v.set(0, 0, -26); let n = 0;
  const run = () => { if (M.GS.state !== 'play' || ball.last === d || ++n > 400) return; d.v.set(0, 0, -26); d.w.set(0, 0, 0); d.q.set(0, 0, 0, 1); d.p.y = BR; d.p.x = 0; requestAnimationFrame(run); }; run(); });

// ---------- goal 1: nobody skips ----------
await sleep(1500); await shoot();
const h1 = await waitFor(H, s => s.state === 'goal', 10000, 'the goal on the host'); const tGoal = Date.now();
const j1 = await waitFor(J, s => s.state === 'goal', 3000, 'the goal on the joiner');
chk(h1.goalLen > 5, `the host's post-goal wait grows for the replay (${h1.goalLen.toFixed(2)} s, joiner sees stT ${j1.stT})`);
await waitFor(J, s => s.on, 5000, 'the joiner\'s replay'); await waitFor(H, s => s.on, 3000, 'the host\'s replay');
await sleep(1500); await J.p.screenshot({path: 'shots/replay-online-joiner.png'});
await waitFor(H, s => s.state === 'kickoff', 20000, 'the host\'s kickoff'); const koMs = Date.now() - tGoal;
await waitFor(J, s => s.state === 'kickoff' || s.state === 'play', 3000, 'the joiner\'s kickoff');
const e1 = await Promise.all([H, J].map(P => P.p.evaluate(() => window.__m.ends.slice(-1)[0])));
chk(e1.every(e => e && e.state === 'goal' && e.el >= e.dur - .3), `both replays played to the end before the kickoff (host ${e1[0]?.el.toFixed(2)}/${e1[0]?.dur.toFixed(2)} s, joiner ${e1[1]?.el.toFixed(2)}/${e1[1]?.dur.toFixed(2)} s; kickoff ${koMs} ms after the goal)`);

// ---------- goal 2: both skip; the host's kickoff follows the second skip ----------
await waitFor(H, s => s.state === 'play', 10000, 'play again'); await sleep(800); await shoot();
await waitFor(H, s => s.state === 'goal', 10000, 'goal 2 on the host'); await waitFor(J, s => s.on, 6000, 'the joiner\'s replay 2'); await waitFor(H, s => s.on, 3000, 'the host\'s replay 2');
await sleep(700); await H.p.keyboard.press('KeyW'); await sleep(600); const mid = await st(H);
chk(!mid.on && mid.state === 'goal', 'the host skipped but waits for the joiner (still in the goal state)');
await J.p.keyboard.press('KeyW'); const tSkip = Date.now();
await waitFor(H, s => s.state === 'kickoff', 4000, 'the kickoff after both skipped'); const skipMs = Date.now() - tSkip;
chk(skipMs < 1500, `both skipped: the host's kickoff follows (${skipMs} ms after the joiner's skip)`);
const fin = await Promise.all([st(H), st(J)]);
chk(fin[0].score.join() === '2,0' && fin[1].score.join() === '2,0', `score in sync (${fin[0].score} / ${fin[1].score})`);
chk(!H.errs.length && !J.errs.length, 'no page errors' + (H.errs.length + J.errs.length ? ': ' + [...H.errs, ...J.errs].slice(0, 3).join(' | ') : ''));
await b.close(); await server.close(); process.exit(fails.length ? 1 : 0);
