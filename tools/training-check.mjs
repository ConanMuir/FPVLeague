// Skill training check: every pack's spawns are inside the arena, every goalie shot scores if nobody touches it, and a scripted
// pilot proves the success detection with the real physics (a goal counts, a miss / a low touch / no pop / no input doesn't, a save
// counts, a pop lands on a target, a carry is measured), plus the pack flow (next, previous, retry, summary, best saved).
// Runs the live modules in headless Edge through the Vite dev server.   node tools/training-check.mjs
import {launchBrowser, gameReady} from './browser.mjs';
const {createServer} = await import('vite');
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist']});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
const r = await p.evaluate(async () => {
  const TM = await import('/src/modes/training.js'), {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'), {ball} = await import('/src/physics/ball.js'),
    T = await import('/src/config/tune.js'), PK = await import('/src/training/packs.js'), C = await import('/src/config/constants.js'), {sdf} = await import('/src/physics/sdf.js'), {S} = await import('/src/config/settings.js');
  const V = ball.p.constructor, dt = 1 / 120, BR = T.BR, out = {};
  const run = (secs, f) => { for (let i = 0; i < secs * 120; i++) { f?.(i); ST.step(dt); if (TM.TR.ph !== 'live' && TM.TR.ph !== 'ready' && i > 2) return; } };
  const start = (id, i) => { TM.startPack(id); GS.paused = true; TM.loadShot(i); TM.goShot(); return GS.player; };
  const goalC = () => new V(0, BR, -C.HL);  // the goal you attack (world -z)
  // velocity pilot: fly at `speed` toward a point (the flight model still adds its bit each tick; the pilot overrides the velocity)
  const fly = (d, to, speed) => { const v = to.clone().sub(d.p); const l = v.length(); d.v.copy(l > 1e-3 ? v.multiplyScalar(Math.min(speed, l * 8) / l) : v); d.w.set(0, 0, 0); };
  // push the ball along unit dir u: get behind it, then drive through it
  const pusher = (d, u, speed = 34) => { let ph = 0; return () => { const behind = ball.p.clone().addScaledVector(u, -(BR + 3.5)); behind.y = Math.max(ball.p.y, 1.6);
    if (ph === 0 && d.p.distanceTo(behind) < 1.5) ph = 1; if (ph === 0) fly(d, behind, 60); else fly(d, ball.p.clone().addScaledVector(u, 20), speed); }; };
  const verdict = () => TM.TR.verdict && {ok: TM.TR.verdict.ok, why: TM.TR.verdict.why, t: TM.TR.verdict.t};
  // 1. spawns inside the arena (SDF < 0 is free space)
  out.spawnBad = [];
  for (const P of PK.PACKS) { TM.startPack(P.id); GS.paused = true;
    P.shots.forEach((sh, i) => { const s = TM.shotSpawn(P, sh, TM.TR.top); if (sdf(s.bp.x, s.bp.y, s.bp.z) > -BR + .05 || sdf(s.dp.x, s.dp.y, s.dp.z) > -.8) out.spawnBad.push(P.id + '#' + i); }); }
  // 2. every goalie shot goes in if nobody touches it (the quad is parked out of the way)
  out.goalieUntouched = {};
  for (const P of PK.PACKS.filter(q => q.kind === 'save')) out.goalieUntouched[P.id] = P.shots.map((sh, i) => { const d = start(P.id, i); run(P.t + 4, () => { d.p.set(C.HW - 20, 30, 0); d.v.set(0, 0, 0); }); return verdict()?.why; });
  // 3. striker: a goal counts
  { const d = start('striker-rookie', 0), u = goalC().sub(ball.p).setY(0).normalize(), f = pusher(d, u); run(12, f); out.strikerGoal = verdict(); }
  // 4. striker: a miss (pushed sideways) doesn't
  { const d = start('striker-rookie', 0), f = pusher(d, new V(1, 0, 0)); run(16, f); out.strikerMiss = verdict(); }
  // 5. striker: no input at all -> time
  { start('striker-rookie', 1); run(16); out.strikerIdle = verdict(); }
  // 6. goalie: fly into the ball -> saved
  { const d = start('goalie-rookie', 0); run(8, () => { if (!TM.TR.touched) fly(d, ball.p, 45); else d.v.set(0, 0, 0); }); out.goalieSave = verdict(); }
  // 7. aerial: a goal from a ground touch doesn't count; a high touch does
  { const d = start('aerial-rookie', 0); let f = null;
    run(14, () => { if (!f && ball.p.y < BR + .3 && TM.TR.t > 1.2) f = pusher(d, goalC().sub(ball.p).setY(0).normalize()); if (f) f(); else d.v.set(0, 0, 0); }); out.aerialLow = verdict(); out.aerialLowTouch = TM.TR.last; }
  { const d = start('aerial-rookie', 0); let ph = 0;
    const tr = []; run(10, () => { if (TM.TR.touched) { if (tr.length < 6 && TM.TR.t * 10 % 1 < .09) tr.push([...ball.p.toArray(), ...ball.v.toArray(), ...d.p.toArray()].map(x => +x.toFixed(1))); d.v.multiplyScalar(.9); return; } const u = new V(0, -8, -C.HL).sub(ball.p).normalize(), behind = ball.p.clone().addScaledVector(u, -(BR + 3.5));
      if (ph === 0 && ball.v.y < 10 && d.p.distanceTo(behind) < 2) ph = 1; if (ph === 0) fly(d, behind, 90); else fly(d, ball.p.clone().addScaledVector(u, 20), 40); });
    out.aerialHigh = verdict(); out.aerialHighTouch = TM.TR.last; out.aerialTrace = tr.map(String); }
  // 8. pops: a goal without a pop doesn't count; a pop that goes in does
  { const d = start('pops-rookie', 0), f = pusher(d, goalC().sub(ball.p).setY(0).normalize()); let t = 0; run(12, () => { if ((t += dt) > .4) f(); }); out.popNoPop = verdict(); }
  const popRun = (id, i, dir = [0, .9, 0]) => { const d = start(id, i); let t = 0, popped = false, back = null;
    run(12, () => { t += dt; if (!popped && t > .3) { popped = d.tryPop(dir); back = d.p.clone(); } if (popped && d.popT <= 0 && back) { d.v.set(0, 0, 0); d.p.copy(back); } });  // after the pop the quad holds still
    return {verdict: verdict(), last: TM.TR.last, land: TM.TR.land, popped}; };
  out.popGoal = popRun('pops-rookie', 0);
  out.popZone = [3, 4, 5].map(i => popRun('pops-rookie', i));
  // 9. dribble: a resting ball on top counts as a carry
  { const d = start('dribble-rookie', 0), h = d.p.clone(); run(1.6, () => { d.v.set(0, 0, 0); d.p.copy(h); }); out.carry = +TM.TR.carry.toFixed(2); }
  // 10. pack flow: next / previous / retry / finish, summary, best saved
  { delete S.train['striker-rookie']; TM.startPack('striker-rookie'); GS.paused = true; const f = [];
    TM.nextShot(); f.push(TM.TR.i); TM.nextShot(); f.push(TM.TR.i); TM.prevShot(); f.push(TM.TR.i); TM.retryShot(); f.push(TM.TR.i + ':' + TM.TR.ph);
    TM.loadShot(0); TM.goShot(); const d = GS.player, fp = pusher(d, goalC().sub(ball.p).setY(0).normalize()); for (let i = 0; i < 14 * 120 && TM.TR.i === 0; i++) { if (TM.TR.ph === 'live') fp(); ST.step(dt); }
    f.push('after goal -> shot ' + TM.TR.i);
    while (TM.TR.ph !== 'sum') TM.nextShot();
    out.flow = {steps: f, ph: TM.TR.ph, score: TM.TR.score, saved: S.train['striker-rookie'], newBest: TM.TR.newBest}; TM.exitTrain(); }
  return out;
});
r.errors = errs; console.log(JSON.stringify(r, null, 1));
const allIn = Object.values(r.goalieUntouched).flat().every(w => w === 'Goal against');
const chk = [
  ['spawns inside the arena', !r.spawnBad.length],
  ['every goalie shot scores untouched', allIn],
  ['striker: a goal counts', r.strikerGoal?.ok === true && r.strikerGoal.why === 'Goal'],
  ['striker: a miss does not', r.strikerMiss?.ok === false],
  ['striker: no input -> time', r.strikerIdle?.ok === false && r.strikerIdle.why === 'Time'],
  ['goalie: a touch that keeps it out is a save', r.goalieSave?.ok === true],
  ['aerial: a ground-level goal does not count', r.aerialLow?.ok === false && r.aerialLow.why === 'Not an aerial touch'],
  ['aerial: a high touch that scores counts', r.aerialHigh?.ok === true],
  ['pops: a goal without a pop does not count', r.popNoPop?.ok === false && r.popNoPop.why === 'Score it with a pop'],
  ['pops: a pop into the goal counts', r.popGoal.verdict?.ok === true],
  ['pops: a straight pop lands on the rookie targets (or misses with a distance)', r.popZone.every(z => z.popped && z.verdict && /On target|Missed by/.test(z.verdict.why)) && r.popZone[0].verdict.ok],
  ['dribble: a ball resting on top is carried', r.carry > 1.2],
  ['flow: next/prev/retry/finish/summary/best', r.flow.steps.slice(0, 4).join() === '1,2,1,1:ready' && r.flow.steps[4] === 'after goal -> shot 1' && r.flow.ph === 'sum' && r.flow.score.n === 1 && r.flow.saved?.n === 1 && r.flow.newBest],
  ['no page errors', !errs.length]];
for (const [n, ok] of chk) console.log((ok ? 'ok   ' : 'FAIL ') + n);
const ok = chk.every(c => c[1]);
console.log(ok ? 'TRAINING CHECK PASSED' : 'TRAINING CHECK FAILED'); await b.close(); await server.close(); process.exit(ok ? 0 : 1);
