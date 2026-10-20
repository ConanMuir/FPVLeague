// Ball spin check: how much spin (rad/s) a touch leaves on the ball. The quad flies into a ball at rest at light / medium / hard
// speed from several sideways offsets (square to glancing), level and pitched, with and without its own body rates, plus a quad
// brushing past, the Freestyler's spin-up (yawing flat out under a ball resting on top, then a pop) and a carry that must keep
// the ball on top, then a 5 minute bot match (Freestyler vs Grand Champion) splitting each step's spin change into the map's part
// and the touches' part. Runs the real modules in headless Edge through the Vite dev server.
//   node tools/spin-check.mjs          prints the table and checks the limits at the end
import {launchBrowser, gameReady} from './browser.mjs';
const {createServer} = await import('vite');
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist']});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
const r = await p.evaluate(async () => {
  const DF = await import('/src/modes/dogfight.js'), MA = await import('/src/modes/match.js'), {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'),
    {ball} = await import('/src/physics/ball.js'), T = await import('/src/config/tune.js'), D = await import('/src/flight/drone.js'), {onEv} = await import('/src/core/events.js');
  DF.setGame('free'); MA.startMatch(); GS.paused = true; GS.state = 'play'; GS.menuOpen = false;
  const d = GS.player, dt = 1 / 120, BR = T.BR, V = d.p.constructor, Q = d.q.constructor, f1 = x => +x.toFixed(1);
  const top = Math.max(...d.lo.colliders.map(c => c.pos[1] + (c.shape === 'box' ? c.size[1] : c.size[0])));
  let touches = 0; onEv('touch', e => { if (e.d === d) touches++; });
  const run = (s, f) => { for (let i = 0; i < s * 120; i++) { f?.(i); ST.step(dt); } };
  // the quad at sideways offset `off`, flying at `sp` m/s along -z into the ball at rest; pitch (deg, nose down) and body rates wb held until the touch
  const hit = (sp, off, pitch = 0, wb = [0, 0, 0]) => {
    const q = new Q().setFromAxisAngle(new V(1, 0, 0), -pitch * Math.PI / 180), y = 20, z0 = BR + 1.6;
    d.p.set(off, y, z0); d.q.copy(q); d.v.set(0, 0, -sp); d.w.set(...wb); d.wt.set(0, 0, 0); d.popC = d.popT = 0; ball.p.set(0, y, 0); ball.v.set(0, 0, 0); ball.w.set(0, 0, 0); ball.c = false;
    touches = 0; let t = -1, wMax = 0, w05 = 0, w30 = 0, bv = 0;
    for (let i = 0; i < 120 * 1.2; i++) {
      if (!touches) { d.v.set(0, 0, -sp); d.w.set(...wb); if (!wb.some(Boolean)) d.q.copy(q); ball.p.set(0, y, 0); ball.v.set(0, 0, 0); ball.w.set(0, 0, 0); }
      ST.step(dt); if (touches && t < 0) t = i;
      if (t >= 0) { const k = i - t, w = ball.w.length(); wMax = Math.max(wMax, w); if (k === 6) { w05 = w; bv = ball.v.length(); } if (k === 36) { w30 = w; break; } } }
    return t < 0 ? null : {w05: f1(w05), w30: f1(w30), wMax: f1(wMax), rps: +(wMax / 2 / Math.PI).toFixed(2), ballV: f1(bv), touches};
  };
  const out = {BR, hits: {}};
  for (const [name, sp] of [['light', 6], ['medium', 18], ['hard', 36]]) for (const pitch of [0, 35]) for (const off of [0, 1.2, 2.2, 2.8, 3.2]) out.hits[`${name} ${sp}m/s pitch${pitch} off${off}`] = hit(sp, off, pitch);
  out.brush = {};
  for (const [k, sp, off, wb] of [['graze 30m/s off3.3', 30, 3.3], ['graze 45m/s off3.4', 45, 3.4], ['soft 4m/s flipping 20rad/s', 4, 0, [20, 0, 0]], ['soft 4m/s off1.5 rolling 20rad/s', 4, 1.5, [0, 0, 20]],
    ['soft 4m/s yawing 15rad/s', 4, .5, [0, 15, 0]], ['medium 18m/s off1.5 rolling 12rad/s', 18, 1.5, [0, 0, 12]], ['hard 36m/s off2.5 flipping 20rad/s', 36, 2.5, [20, 0, 0]]]) out.brush[k] = hit(sp, off, 0, wb);
  // the Freestyler's spin shot: yaw flat out (15 rad/s) under a ball resting on top until it spins at 10 rad/s, then pop it forward
  { d.p.set(0, 30, 0); d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.q.set(0, 0, 0, 1); d.popC = d.popT = 0; ball.p.set(0, 30 + top + BR - .05, 0); ball.v.set(0, 0, 0); ball.w.set(0, 0, 0);
    run(.05, () => { d.p.set(0, 30, 0); d.v.set(0, 0, 0); d.w.set(0, 0, 0); });
    let tReach = null, k = 0; for (; k < 240; k++) { d.p.set(0, 30, 0); d.v.set(0, 0, 0); d.w.set(0, 15, 0); ST.step(dt); if (tReach == null && Math.abs(ball.w.y) >= 10) { tReach = k * dt; break; } }
    const wUp = Math.abs(ball.w.y), popped = d.tryPop([0, .9, 0]); run(D.POP_D + .1);
    out.spinShot = {reach10_s: tReach == null ? null : +tReach.toFixed(2), spinAtPop: f1(wUp), popped, spinAfterPop: f1(ball.w.length()), spinYAfterPop: f1(Math.abs(ball.w.y)), ballV: [ball.v.x, ball.v.y, ball.v.z].map(f1)}; }
  // carry: the ball resting on top while the quad speeds up to 6 m/s and turns; it has to stay on
  { d.p.set(0, 12, 60); d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.q.set(0, 0, 0, 1); d.popC = d.popT = 0; ball.p.set(0, 12 + top + BR - .05, 60); ball.v.set(0, 0, 0); ball.w.set(0, 0, 0);
    run(.1, () => { d.p.set(0, 12, 60); d.v.set(0, 0, 0); d.w.set(0, 0, 0); }); let wMax = 0, off = 0, yaw = 0, lost = false;
    run(2, i => { const t = i * dt, s = Math.min(6, t * 3); yaw += (t > .8 ? .8 : 0) * dt; d.q.setFromAxisAngle(new V(0, 1, 0), yaw); d.w.set(0, t > .8 ? .8 : 0, 0); d.v.set(-Math.sin(yaw) * s, 0, -Math.cos(yaw) * s); d.p.y = 12;
      wMax = Math.max(wMax, ball.w.length()); const h = Math.hypot(ball.p.x - d.p.x, ball.p.z - d.p.z); off = Math.max(off, h); if (ball.p.y < d.p.y) lost = true; });
    out.carry = {maxSpin: f1(wMax), maxSideOffset: +off.toFixed(2), onTop: !lost && Math.hypot(ball.p.x - d.p.x, ball.p.z - d.p.z) < 1.5 && ball.p.y > d.p.y}; }
  // a real bot match (Freestyler vs Grand Champion, 3 v 3, 5 sim minutes): the ball's spin in the air and after touches, and what changed it:
  // each step is split at the mode's tick hook (after the Rapier step and the map contact, before the touches) into a map part and a touch part
  { const {DIFF} = await import('/src/config/constants.js'), RG = await import('/src/modes/registry.js'), FS = DIFF.findIndex(x => x.fs), GC = DIFF.findIndex(x => x.n === 'Grand Champion');
    DF.setGame('league'); MA.startDemo(); GS.paused = true; GS.menuOpen = true; for (const x of GS.drones) x.skill = x.team ? GC : FS;
    const M = RG.curMode(), tk0 = M.tick, wPrev = new V(), wMid = new V(), dv = new V(); M.tick = (dt, A) => { wMid.copy(ball.w); tk0?.(dt, A); };
    let tch = null, n = 0; const air = [], dTouch = [], dMap = [], big = [], ep = []; let cur = null; const off = onEv('touch', e => { tch = e; n++; });
    for (let i = 0; i < 5 * 60 * 120; i++) { tch = null; wPrev.copy(ball.w); ST.step(dt); const w = ball.w.length();
      const dm = dv.subVectors(wMid, wPrev).length(), dt2 = dv.subVectors(ball.w, wMid).length(); if (dm > .5) { dMap.push(dm); if (dm > 15 && big.length < 6) big.push({from: f1(wPrev.length()), to: f1(wMid.length()), v: f1(ball.v.length()), hit: f1(ball.hit), ny: +ball.n.y.toFixed(2), y: f1(ball.p.y)}); }
      if (tch) { dTouch.push(dt2); if (!cur || cur.d !== tch.d || i - cur.i > 3) { if (cur) ep.push(cur); cur = {d: tch.d, i, w0: wMid.clone(), steps: 0, rate: 0, pop: false, sp: 0}; }
        cur.i = i; cur.steps++; cur.w1 = ball.w.clone(); cur.rate = Math.max(cur.rate, tch.d.w.length()); cur.pop ||= tch.d.popT > 0; cur.sp = Math.max(cur.sp, tch.speed); }
      if (!ball.c) air.push(w); }
    if (cur) ep.push(cur); off(); M.tick = tk0;
    const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return f1(s[Math.min(s.length - 1, Math.floor(q * s.length))]); }, st = a => ({n: a.length, p50: pct(a, .5), p90: pct(a, .9), p99: pct(a, .99), max: pct(a, 1)});
    const eAdd = e => e.w1.length() - e.w0.length(), eAbs = e => e.w1.length();
    out.match = {touches: n, episodes: ep.length, airSpin: st(air), touchStepChange: st(dTouch), mapStepChange: st(dMap), biggestMapChanges: big,
      episodeSpinAfter: st(ep.filter(e => !e.pop).map(eAbs)), episodeSpinAdded: st(ep.filter(e => !e.pop).map(eAdd)), popEpisodeSpinAfter: st(ep.filter(e => e.pop).map(eAbs)),
      longEpisodes: st(ep.filter(e => e.steps > 6).map(eAbs)), fastSpinningQuad: st(ep.filter(e => e.rate > 10 && !e.pop).map(eAbs)),
      top: ep.filter(e => !e.pop).sort((a, b) => eAdd(b) - eAdd(a)).slice(0, 6).map(e => ({from: f1(e.w0.length()), to: f1(e.w1.length()), steps: e.steps, quadRate: f1(e.rate), speed: f1(e.sp)}))}; }
  return out;
});
r.errors = errs;
const rows = Object.entries(r.hits).filter(([, v]) => v);
console.log('touch'.padEnd(36), 'w@0.05s  w@0.3s  wMax  rev/s  ballV  touches');
for (const [k, v] of [...rows, ...Object.entries(r.brush).filter(([, v]) => v)]) console.log(k.padEnd(36), String(v.w05).padStart(7), String(v.w30).padStart(7), String(v.wMax).padStart(5), String(v.rps).padStart(6), String(v.ballV).padStart(6), String(v.touches).padStart(7));
console.log('spin shot', JSON.stringify(r.spinShot)); console.log('carry', JSON.stringify(r.carry)); console.log('match', JSON.stringify(r.match)); if (errs.length) console.log('errors', errs);
// limits: square hits (offset <= 1.2 m) leave under 2 rad/s, every plain hit under 4; a brush spins more than a square hit; the Freestyler's
// spin-up still reaches 10 rad/s and the pop keeps most of it; the carry holds; in a match the touches and the air stay under the cap (16 rad/s) + a little
const H = r.hits, mx = f => Math.max(...Object.entries(H).filter(([k, v]) => v && f(k)).map(([, v]) => v.wMax)), cap = 16;
const checks = [[mx(k => / off(0|1\.2)$/.test(k)) < 2, 'square hits < 2 rad/s'], [mx(() => true) < 4, 'every plain hit < 4 rad/s'],
  [r.brush['graze 45m/s off3.4']?.wMax > 2 * mx(k => k.startsWith('hard') && / off0$/.test(k)), 'a hard brush spins the ball more than twice a hard square hit'],
  [r.spinShot.reach10_s != null && r.spinShot.popped && r.spinShot.spinAfterPop >= 8, 'Freestyler spin-up reaches 10 rad/s, the pop keeps >= 8'], [r.carry.onTop, 'carry keeps the ball on top'],
  [r.match.episodeSpinAfter.max <= cap + .1, 'match: spin after a touch <= the cap'], [r.match.airSpin.p99 <= cap + 2, 'match: 99% of the time in the air under cap + 2']];
for (const [ok, m] of checks) console.log((ok ? '  ok   ' : '  FAIL ') + m);
const ok = checks.every(c => c[0]) && !errs.length; console.log(ok ? 'SPIN CHECK PASSED' : 'SPIN CHECK FAILED');
await b.close(); await server.close(); process.exit(ok ? 0 : 1);
