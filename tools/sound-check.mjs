// Sound check: drives game scenarios (kickoff countdown, landing, scrape, tumble, ball hit / bounce / roll, save, near miss,
// goal, pop, Dogfight bullet into rock) through the real modules in headless Edge via the Vite dev server, and checks that the
// right synth triggers fire (audio/sfx.js counts every trigger in SND.n) with no page errors. Every sound is first called with no
// AudioContext (as before audioInit, or a browser without WebAudio): nothing may throw.
// Scenarios run in separate evaluate calls a little apart, because the sounds' rate limits run on wall time.
//   node tools/sound-check.mjs
import {launchBrowser, gameReady} from './browser.mjs';
const {createServer} = await import('vite');
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
const r = {}, sc = async f => { Object.assign(r, await p.evaluate(f)); await new Promise(q => setTimeout(q, 150)); };
// setup: modules and helpers on window.T_; then no-AudioContext safety
await sc(async () => {
  const M = {A: await import('/src/audio/audio.js'), X: await import('/src/audio/sfx.js'), DF: await import('/src/modes/dogfight.js'), MA: await import('/src/modes/match.js'),
    GS: (await import('/src/state.js')).GS, ST: await import('/src/modes/step.js'), ball: (await import('/src/physics/ball.js')).ball, C: await import('/src/config/constants.js'),
    T: await import('/src/config/tune.js'), G: await import('/src/modes/guns.js')};
  M.N = M.X.SND.n; M.snap = () => ({...M.N}); M.diff = (a, k) => (M.N[k] || 0) - (a[k] || 0);
  M.run = (s, f) => { for (let i = 0; i < s * 120; i++) { f?.(i); M.ST.step(1 / 120); } };
  M.tick = () => { const pz = M.GS.paused; M.GS.paused = false; M.X.sfxTick(1 / 60); M.GS.paused = pz; };  // the per-frame loop update, as visuals.js runs it
  M.park = () => { M.ball.p.set(0, M.T.BR + .1, 60); M.ball.v.set(0, 0, 0); M.ball.w.set(0, 0, 0); };
  window.T_ = M; const {A, X, GS, ball} = M, out = {noAC: A.AC === null};
  try { const d = GS.drones[0] || {p: ball.p, w: ball.w}; X.groundHit(d, 20, ball.p); X.ballHit(d, 30); X.ballBounce(20); X.goalSfx(0, ball.p); X.countdown(3); X.countdown(0); X.popWhoosh(.4); X.bulletRock(ball.p); X.sfxTick(1 / 60); out.noACsafe = true; }
  catch (e) { out.noACsafe = 'threw: ' + e.message; }
  M.DF.setGame('league'); M.MA.startMatch(); out.ac = !!A.AC && A.AC.state; GS.paused = true; GS.menuOpen = false; return out;
});
// kickoff countdown: 3 pips and a GO
await sc(() => { const {snap, diff, run, GS} = T_, s = snap(); run(3.1); return {count: diff(s, 'count'), go: diff(s, 'go'), state: GS.state}; });
// landing: the quad dropped flat onto the floor at 15 m/s
await sc(() => { const {snap, diff, run, park, GS} = T_, d = GS.player, s = snap(); d.q.set(0, 0, 0, 1); d.p.set(-40, 3, 0); d.v.set(0, -15, 0); d.w.set(0, 0, 0); run(.3, () => { park(); d.thr = d.ms = 0; }); return {thud: diff(s, 'thud')}; });
// scrape: on the floor, sliding sideways at 20 m/s, motors off
await sc(() => { const {run, park, tick, X, GS} = T_, d = GS.player; let sc = 0, sl = 0; d.q.set(0, 0, 0, 1); d.p.set(-40, .4, 0); d.v.set(20, 0, 0); d.w.set(0, 0, 0);
  run(.25, i => { park(); d.thr = d.ms = 0; if (i % 2 === 0) { tick(); sc = Math.max(sc, X.SND.scrape); sl = Math.max(sl, d.slide || 0); } }); return {scrape: +sc.toFixed(3), slide: +sl.toFixed(1)}; });
// tumble: spinning hard on the floor
await sc(() => { const {snap, diff, run, park, tick, GS} = T_, d = GS.player, s = snap(); d.q.set(0, 0, 0, 1); d.p.set(-40, .4, 0); d.v.set(8, 0, 0);
  run(.3, i => { park(); d.thr = d.ms = 0; d.w.set(0, 0, 25); if (i % 2 === 0) tick(); }); return {clatter: diff(s, 'clatter')}; });
// ball hit: the ball flies into the parked quad at 30 m/s
await sc(() => { const {snap, diff, run, ball, GS} = T_, d = GS.player, s = snap(), hold = () => { d.p.set(0, 20, 0); d.v.set(0, 0, 0); d.w.set(0, 0, 0); };
  d.q.set(0, 0, 0, 1); hold(); ball.p.set(0, 20, -8); ball.v.set(0, 0, 30); ball.w.set(0, 0, 0); run(.4, hold); return {ballHit: diff(s, 'ballHit')}; });
// ball bounce: dropped from 12 m
await sc(() => { const {snap, diff, run, ball, GS} = T_, d = GS.player, s = snap(); d.p.set(-40, 20, 0); ball.p.set(20, 12, 0); ball.v.set(0, -20, 0); run(.6, () => d.p.set(-40, 20, 0)); return {bounce: diff(s, 'ballBounce')}; });
// ball roll along the floor
await sc(() => { const {run, tick, ball, X, T, GS} = T_, d = GS.player; let rl = 0; ball.p.set(20, T.BR, 0); ball.v.set(0, 0, 15); ball.w.set(15 / T.BR, 0, 0);
  run(.3, i => { d.p.set(-40, 20, 0); if (i % 4 === 0) { tick(); rl = Math.max(rl, X.SND.roll); } }); return {roll: +rl.toFixed(3)}; });
// save: a shot on the blue goal (+z), the blue player's quad in its path
await sc(() => { const {snap, diff, run, ball, C, GS} = T_, d = GS.player, s = snap(), hold = () => { d.p.set(0, 2.6, C.HL - 20); d.v.set(0, 0, 0); d.w.set(0, 0, 0); };
  d.q.set(0, 0, 0, 1); hold(); ball.p.set(0, 2.7, C.HL - 40); ball.v.set(0, 0, 45); ball.w.set(0, 0, 0); run(.6, hold); return {team: d.team, save: diff(s, 'save'), saveCheer: diff(s, 'crowd_cheer')}; });
// near miss: a hard shot off the back wall just wide of the orange goal (-z); then the crowd bed in play
await sc(() => { const {snap, diff, run, tick, ball, C, X, GS} = T_, d = GS.player, s = snap(); d.p.set(-40, 20, 0); ball.p.set(C.GW / 2 + 6, 8, -C.HL + 12); ball.v.set(0, 0, -40);
  run(.5, () => d.p.set(-40, 20, 0)); tick(); return {nearMiss: diff(s, 'nearMiss'), ooh: diff(s, 'crowd_ooh'), crowdBed: +X.SND.crowd.toFixed(2)}; });
// goal: the ball into the orange goal (blue scores)
await sc(() => { const {snap, diff, run, tick, ball, C, T, X, GS} = T_, s = snap(); GS.state = 'play'; ball.p.set(0, 8, -C.HL - T.BR - 1); ball.v.set(0, 0, -10); run(.05);
  const o = {goal: diff(s, 'goal'), horn: diff(s, 'horn'), goalCheer: diff(s, 'crowd_cheer'), score: GS.score.slice()}; run(.5); tick(); o.crowdGoal = +X.SND.crowd.toFixed(2); return o; });
// pop: earn one with the ball resting on top, then spend it (pop whoosh)
await sc(() => { const {snap, diff, run, ball, T, MA, GS} = T_, d = GS.player; MA.kickoff(); run(3.1); const s = snap(), hold = () => { d.p.set(0, 30, 0); d.v.set(0, 0, 0); d.w.set(0, 0, 0); };
  const top = Math.max(...d.lo.colliders.map(c => c.pos[1] + (c.shape === 'box' ? c.size[1] : c.size[0]))); d.q.set(0, 0, 0, 1); d.popC = d.popT = 0;
  ball.p.set(0, 30 + top + T.BR - .05, 0); ball.v.set(0, 0, 0); run(.05, hold); const o = {popEarned: d.popC > 0, popped: d.tryPop([0, .9, 0])}; o.pop = diff(s, 'pop'); return o; });
// Dogfight: a bullet fired straight down into the ground; the crowd stays silent there
await sc(() => { const {snap, diff, run, tick, X, G, DF, MA, GS} = T_; DF.setGame('df'); MA.startMatch(); GS.paused = true; GS.menuOpen = false; run(3.1); const s = snap(), q = GS.player.p, V = q.constructor;
  G.shoot(q.clone().add(new V(0, -3, 0)), new V(0, -1, 0), null, GS.player.team, false, GS.player, 0, 0, 400); run(.5); tick(); return {rock: diff(s, 'rock'), dfCrowd: X.SND.crowd, counts: {...T_.N}}; });
r.errors = errs; console.log(JSON.stringify(r, null, 1));
const ok = r.noAC && r.noACsafe === true && r.count === 3 && r.go === 1 && r.thud > 0 && r.scrape > .05 && r.clatter > 0 && r.ballHit > 0 && r.bounce > 0 && r.roll > .05 && r.save > 0 && r.saveCheer > 0
  && r.nearMiss > 0 && r.ooh > 0 && r.crowdBed > 0 && r.goal === 1 && r.horn === 1 && r.goalCheer > 0 && r.crowdGoal > r.crowdBed && r.popEarned && r.popped && r.pop === 1 && r.rock > 0 && r.dfCrowd === 0 && !errs.length;
console.log(ok ? 'SOUND CHECK PASSED' : 'SOUND CHECK FAILED'); await b.close(); await server.close(); process.exit(ok ? 0 : 1);
