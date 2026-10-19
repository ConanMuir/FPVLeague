// Replay check: goal replays and the Dogfight kill cam (render/replay.js) in headless Edge, through the Vite dev server, live frames.
//  1. League, offline, no bots: a scripted pilot flies into the ball and scores. The ball's live positions are logged against the
//     recorder clock; while the replay plays, the drawn ball (its mesh) must sit on that logged path at the replay's clock.
//     The replay must show the three cameras (scorer chase, ball cam, goal line), slow down at the last touch, send no live
//     touch / goal events, and the kickoff must follow when it ends.
//  2. A second goal, skipped with a key press: the replay stops at once and the kickoff follows.
//  3. The pause menu's Replays screen replays the last goal, and a key returns to the menu.
//  4. Dogfight: shot down by a bot -> the kill cam plays from the killer's view and ends at the respawn; another one is skipped.
// Screenshots: shots/replay-<what>.png (shots/ is gitignored).
//   node tools/replay-check.mjs
import fs from 'node:fs';
import {launchBrowser, gameReady} from './browser.mjs';
const {createServer} = await import('vite');
fs.mkdirSync('shots', {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const p = await b.newPage(); await p.setViewport({width: 1280, height: 720}); const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });  // a missing favicon is not an error
await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
const res = {}, fails = [];
const chk = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };
const st = () => p.evaluate(() => window.__rc.st());
const waitFor = async (f, ms, what) => { const t0 = Date.now(); for (;;) { const s = await st(); if (f(s)) return s; if (Date.now() - t0 > ms) { console.log('page errors: ' + errs.join(' | ')); await sleep(500); console.log('later: ' + JSON.stringify(await st())); throw new Error('timed out: ' + what + ' ' + JSON.stringify(s)); } await sleep(30); } };

// page-side helpers: module handles, a scripted pilot, the live-ball log and the replay observations
await p.evaluate(async () => {
  const M = {DF: await import('/src/modes/dogfight.js'), MA: await import('/src/modes/match.js'), GS: (await import('/src/state.js')).GS, ball: (await import('/src/physics/ball.js')).ball,
    C: await import('/src/config/constants.js'), T: await import('/src/config/tune.js'), S: (await import('/src/config/settings.js')).S, RP: await import('/src/render/replay.js'),
    RB: await import('/src/render/ball.js'), EV: await import('/src/core/events.js')};
  const rc = window.__rc = {M, live: [], obs: [], ev: {touch: 0, goal: 0}, run: null};
  M.EV.onEv('touch', () => rc.ev.touch++); M.EV.onEv('goal', () => rc.ev.goal++);  // gameplay listeners: must not hear replays
  rc.st = () => { const s = M.RP.rpState(), G = M.GS; return {...s, state: G.state, stT: +G.stT.toFixed(2), ts: G.timeScale, fr: rc.fr, lost: !!window.__lost, score: [...G.score], menu: G.menuOpen, paused: G.paused, ev: {...rc.ev}, dead: G.player?.dead ?? null, nObs: rc.obs.length}; };
  // every frame: the live ball against the recorder clock (outside a replay), the drawn ball against the replay clock (during one)
  const loop = () => { const s = M.RP.rpState(); if (s.on) { const m = M.RB.ballMesh; rc.obs.push([s.pt, m.position.x, m.position.y, m.position.z, s.shot]); }  // the mesh keeps the replayed pose between frames
    else if (M.GS.state === 'play' || M.GS.state === 'goal') rc.live.push([s.rt, M.ball.p.x, M.ball.p.y, M.ball.p.z]);
    rc.fr = (rc.fr || 0) + 1; if (rc.run) rc.run(); requestAnimationFrame(loop); }; loop(); document.getElementById('gl').addEventListener('webglcontextlost', () => { window.__lost = 1; });
  // the scripted shot: ball resting 70 m out from the orange (-z) goal, the quad 45 m behind it flying straight at it at 26 m/s
  rc.shoot = () => { const d = M.GS.player, {ball} = M, BR = M.T.BR, z0 = -(M.C.HL - 70); ball.p.set(0, BR, z0); ball.v.set(0, 0, 0); ball.w.set(0, 0, 0);
    d.p.set(0, BR, z0 + 45); d.q.set(0, 0, 0, 1); d.v.set(0, 0, -26); d.w.set(0, 0, 0); let n = 0;
    rc.run = () => { if (M.GS.state !== 'play' || ball.last === d || ++n > 400) { rc.run = null; return; } d.v.set(0, 0, -26); d.w.set(0, 0, 0); d.q.set(0, 0, 0, 1); d.p.y = BR; d.p.x = 0; }; };
});

// ---------- 1. a goal and its replay, watched to the end ----------
await p.evaluate(() => { const {M} = window.__rc; M.S.bots = 0; M.S.replay = 'on'; M.DF.setGame('league'); M.MA.startMatch(); M.GS.menuOpen = false; M.GS.camMode = 1; });
await waitFor(s => s.state === 'play', 8000, 'kickoff -> play');
await sleep(400); await p.evaluate(() => window.__rc.shoot());
let s = await waitFor(s => s.state === 'goal', 8000, 'the scripted goal');
res.goal1 = {score: s.score, ev: s.ev, pend: s.pend};
await p.screenshot({path: 'shots/replay-0-live-goal.png'});
s = await waitFor(s => s.on, 4000, 'the replay to start');
res.replay1 = {clip: s.clip, kind: s.kind};
const evAtStart = s.ev; const shots = {};
for (let t0 = Date.now(); ;) { s = await st(); if (!s.on) break; if (Date.now() - t0 > 20000) break;
  if (s.shot && !shots[s.shot] && s.el > .25) { shots[s.shot] = s.pt; await sleep(250); await p.screenshot({path: `shots/replay-1-${s.shot}.png`}); }
  if (s.clip && s.clip.slow && !shots.slow && Math.abs(s.pt - s.clip.tTouch) < .12) { shots.slow = s.pt; await p.screenshot({path: 'shots/replay-1-slowmo-touch.png'}); }
  await sleep(40); }
const endS = s; const tEnd = Date.now(); s = await waitFor(s => s.state === 'kickoff', 4000, 'the kickoff after the replay'); const koLag = Date.now() - tEnd;
const R1 = await p.evaluate(() => { const rc = window.__rc, L = rc.live, O = rc.obs; let n = 0, max = 0, sum = 0, pts = new Set();
  // the logged live ball at clock t (linear between the two log entries around it)
  const at = t => { let lo = 0, hi = L.length - 1; if (t < L[0][0] || t > L[hi][0]) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m][0] <= t) lo = m; else hi = m; }
    const a = L[lo], b = L[hi], k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0; return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]; };
  const tG = window.__rc.M.RP.rpState().clip.tGoal, errs = [];
  // skip the instants where the live log jumps (the scripted shot teleports the ball): the log has two positions at one clock time there
  const jumps = []; for (let i = 1; i < L.length; i++) if (Math.hypot(L[i][1] - L[i - 1][1], L[i][3] - L[i - 1][3]) > 5) jumps.push(L[i][0]);
  for (const o of O) { if (o[0] > tG - .02 || jumps.some(t => Math.abs(t - o[0]) < .05)) continue; const q = at(o[0]); if (!q) continue; const e = Math.hypot(q[0] - o[1], q[1] - o[2], q[2] - o[3]); errs.push(e); max = Math.max(max, e); sum += e; n++; pts.add(o[4]); }
  errs.sort((a, b) => a - b); const span = O.length ? O[O.length - 1][0] - O[0][0] : 0;
  return {obs: O.length, compared: n, mean: n ? +(sum / n).toFixed(3) : null, median: n ? +errs[n >> 1].toFixed(3) : null, p95: n ? +errs[Math.floor(n * .95)].toFixed(3) : null, max: +max.toFixed(3), span: +span.toFixed(2), shots: [...pts],
    travelled: O.length ? +Math.hypot(O[O.length - 1][1] - O[0][1], O[O.length - 1][3] - O[0][3]).toFixed(1) : 0}; });
res.path1 = R1; res.shots1 = shots; res.koLag1 = koLag; res.evDuring = {start: evAtStart, end: endS.ev};
chk(res.goal1.score[0] === 1 && res.goal1.pend, 'scripted goal scored by blue; a replay is pending');
chk(res.replay1.kind === 'goal' && res.replay1.clip.n > 100 && res.replay1.clip.tTouch > res.replay1.clip.tA, `the replay clip holds the run-up and the last touch (${res.replay1.clip.n} samples)`);
chk(R1.compared > 50 && R1.median < .05 && R1.p95 < .35, `the replayed ball follows the recorded path (median ${R1.median} m, p95 ${R1.p95} m, max ${R1.max} m over ${R1.compared} frames, ${R1.travelled} m travelled)`);
chk(['chase', 'ball', 'goal'].every(k => shots[k] != null), 'scorer chase, ball cam and goal-line cam all shown (' + Object.keys(shots).join(', ') + ')');
chk(shots.slow != null && res.replay1.clip.slow, 'slow-mo at the last touch');
chk(endS.ev.touch === evAtStart.touch && endS.ev.goal === evAtStart.goal, 'no live touch / goal events while the replay played');
chk(koLag < 1500, `kickoff follows the replay (${koLag} ms after it ended)`);

// ---------- 2. a second goal, replay skipped with a key ----------
s = await waitFor(s => s.state === 'play', 8000, 'play after the kickoff');
await sleep(300); await p.evaluate(() => window.__rc.shoot());
await waitFor(s => s.state === 'goal', 8000, 'the second goal'); s = await waitFor(s => s.on, 4000, 'the second replay');
await sleep(900); await p.screenshot({path: 'shots/replay-2-before-skip.png'});
const before = await st(); await p.keyboard.press('KeyW'); const tSkip = Date.now(); await sleep(60); const after = await st();
s = await waitFor(s => s.state === 'kickoff', 4000, 'the kickoff after the skip'); const skipLag = Date.now() - tSkip;
res.skip = {before: {on: before.on, el: before.el}, after: {on: after.on}, skipLag};
chk(before.on && !after.on, 'a key press skips the replay');
chk(skipLag < 1200, `kickoff follows the skip (${skipLag} ms)`);

// ---------- 3. the pause menu's Replays screen ----------
await waitFor(s => s.state === 'play', 8000, 'play again'); await p.keyboard.press('Escape'); await sleep(200);
const btn = await p.evaluate(() => !document.getElementById('rpbtn').hidden); await p.click('#rpbtn'); await sleep(150);
const items = await p.$$eval('#rplist button', l => l.map(x => x.textContent)); await p.screenshot({path: 'shots/replay-3-menu.png'});
await p.click('#rplist button'); await sleep(1200); const hl = await st(); await p.screenshot({path: 'shots/replay-3-highlight.png'});
await p.keyboard.press('KeyW'); await sleep(250); const hlEnd = await st();
res.menu = {btn, items, hl: {on: hl.on, hl: hl.hl, paused: hl.paused}, back: {on: hlEnd.on, menu: hlEnd.menu}};
chk(btn && items.length === 2, `pause menu offers the replays (${items.join(' | ')})`);
chk(hl.on && hl.hl && hl.paused, 'a highlight plays with the match paused');
chk(!hlEnd.on && hlEnd.menu, 'a key ends the highlight and the pause menu comes back');
await p.keyboard.press('Escape'); await sleep(100);

// ---------- 4. Dogfight kill cam ----------
await p.evaluate(() => { const {M} = window.__rc; M.S.bots = 1; M.S.killcam = true; M.DF.setGame('df'); M.MA.startMatch(); M.GS.menuOpen = false; M.GS.camMode = 1; });
await waitFor(s => s.state === 'play', 40000, 'Dogfight play'); await sleep(2500);
const kill = () => p.evaluate(() => { const {M} = window.__rc, me = M.GS.player, foe = M.GS.drones.find(d => d.team !== me.team); me.lock = 0; M.DF.hitDrone(me, 1000, foe); return foe.name; });
// a real kill: a foe parked 45 m behind your quad, facing it, fires its guns until you go down (the kill cam must show its tracers)
const gunKill = () => p.evaluate(async () => { const {M} = window.__rc, G = await import('/src/modes/guns.js'), me = M.GS.player, foe = M.GS.drones.find(d => d.team !== me.team), V = me.p.constructor;
  me.lock = 0; let n = 0; return new Promise(res => { const f = () => { if (me.dead > 0 || ++n > 600) { res(foe.name); return; } const back = new V(0, 0, 1).applyQuaternion(me.q).setY(0).normalize();
    foe.p.copy(me.p).addScaledVector(back, 45).setY(me.p.y + 4); foe.v.set(0, 0, 0); foe.w.set(0, 0, 0); const dir = new V().subVectors(me.p, foe.p).normalize(); foe.q.setFromUnitVectors(new V(0, 0, -1), dir);
    if (n % 5 === 0) G.shoot(foe.p.clone().addScaledVector(dir, 2), dir, foe.v, foe.team, true, foe, 8, .002, G.BSPD); requestAnimationFrame(f); }; f(); }); });
res.killer = await gunKill(); s = await waitFor(s => s.on, 2000, 'the kill cam'); await sleep(1300); await p.screenshot({path: 'shots/replay-4-killcam.png'});
const kc = await st(); s = await waitFor(s => !s.on, 4000, 'the kill cam to end'); const kcEnd = s; await sleep(400); const resp = await st();
res.kill = {kind: kc.kind, shot: kc.shot, clip: kc.clip, endDead: kcEnd.dead, respawned: resp.dead};
chk(kc.kind === 'kill' && kc.shot === 'killer', `kill cam from the killer's view (${res.killer})`);
chk(resp.dead <= 0, 'respawned after the kill cam');
await sleep(1500); await kill(); await waitFor(s => s.on, 2000, 'the second kill cam'); await sleep(400); await p.keyboard.press('KeyW'); await sleep(80); const ks = await st();
chk(!ks.on && ks.dead > 0, 'a key skips the kill cam (still waiting to respawn)');

chk(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
console.log(JSON.stringify(res, null, 1));
await b.close(); await server.close(); process.exit(fails.length ? 1 : 0);
