// Bot vs bot: two bot skill levels play each other headless (the real modules through the Vite dev server, stock parts for everyone),
// half the time on each side, and print goals (League) or points (Dogfight), touches and the bots' cost per tick.
//   node tools/bot-match.mjs [league|df] [levelA] [levelB] [sim minutes] [team size]      levels: DIFF index or name, e.g. 5 3 / "Grand Champion" Legend
//   node tools/bot-match.mjs drill A B 0 [trials/10]        shooting drill: one bot, random ball and start, touches / on target / goals
//   node tools/bot-match.mjs solo A B [sim minutes]          one bot alone on the League field: carry time, pops earned/fired/goalward per minute
//   BT='{"D":{"vmax":80},"DB":{"kd":3}}' overrides DIFF fields of level A (D) and B (DB) for tuning
import {launchBrowser} from './browser.mjs';
const [mode = 'league', la = '5', lb = '3', mins = '6', size = '3'] = process.argv.slice(2);
const {createServer} = await import('vite');
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({protocolTimeout: 0, args: ['--ignore-gpu-blocklist']});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(server.resolvedUrls.local[0] + 'app.html'); await new Promise(r => setTimeout(r, 6000));
p.setDefaultTimeout(0);
const r = await p.evaluate(async (mode, la, lb, mins, size, bt) => {
  const DF = await import('/src/modes/dogfight.js'), DFm = DF, MA = await import('/src/modes/match.js'), {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'),
    {ball} = await import('/src/physics/ball.js'), C = await import('/src/config/constants.js'), {DIFF} = C, {STOCK} = await import('/src/parts/index.js'),
    LB = await import('/src/bots/league.js'), DB = await import('/src/bots/dogfight.js'), {topOf} = await import('/src/bots/dribble.js'), {BR} = await import('/src/config/tune.js'), W = await import('/src/physics/world.js');
  let hitBy = null; W.onHit(e => { if (e.type === 'ball') hitBy = e.d; });  // who touched the ball this tick (ball.last keeps the last toucher for the bots)
  // carry and pop bookkeeping (League): time with the ball resting on a quad's top, pops earned, pops fired, and pops that sent the ball goalward
  const _r = new (ball.p.constructor)(), pend = [], prevC = new Map(), prevT = new Map();
  const onTop = d => { _r.subVectors(ball.p, d.p); const h = topOf(d) + BR; return Math.hypot(_r.x, _r.z) < 1.2 && _r.y > h - .5 && _r.y < h + .6; };
  const track = (key, sim) => { for (const d of GS.drones) { if (d.dead > 0) continue; const st = sim(d), k = key(d);
      if (GS.state === 'play' && onTop(d)) st.carry = (st.carry || 0) + 1 / 120;
      const c0 = prevC.get(d) || 0; if (!(c0 > 0) && d.popC > 0) st.earned = (st.earned || 0) + 1; prevC.set(d, d.popC || 0);
      const t0 = prevT.get(d) || 0; if (!(t0 > 0) && d.popT > 0) { st.popsFired = (st.popsFired || 0) + 1; pend.push({st, d, t: 1, withBall: Math.hypot(ball.p.x - d.p.x, ball.p.z - d.p.z) < 1.6 && ball.p.y > d.p.y}); } prevT.set(d, d.popT || 0); }
    for (let i = pend.length - 1; i >= 0; i--) { const e = pend[i]; e.t -= 1 / 120; const gz = (e.d.team ? 1 : -1) * HL, gx = -ball.p.x, gzz = gz - ball.p.z, gl = Math.hypot(gx, gzz) || 1, vg = (ball.v.x * gx + ball.v.z * gzz) / gl;
      if (e.withBall && vg > 8 && ball.v.y > -2) { e.st.popGood = (e.st.popGood || 0) + 1; pend.splice(i, 1); } else if (e.t <= 0) pend.splice(i, 1); }
    tricks(sim); };
  // tricks: pop chains (pops in a row by one quad with the ball never touching the floor), air-dribble touches (a quad touching the ball
  // again while it is in the air, 0.2-2 s after its last touch), double taps (its touch, the ball off the backboard or end wall above the
  // goal, then its touch again within 3.5 s, no floor or other touch between), spin (ball spin rate in the 0.1 s after a spin-shot touch) and curve (the most the ball
  // drifts sideways off the straight line it left on, over the next 1.5 s, until another touch or a wall)
  const FS = new Map(), fsOf = d => FS.get(d) || FS.set(d, {chain: 0, live: false, lastT: -9, air: false, wall: false, was: false}).get(d); let tnow = 0, lastBy = null, touchedNow = null, cv = null; const U = new (ball.v.constructor)();
  const endChain = (f, st) => { if (f.live && f.chain > 0) (st.chains || (st.chains = [])).push(f.chain); f.live = false; f.chain = 0; };
  const tricks = sim => { tnow += 1 / 120; const floor = ball.c && ball.p.y < BR + .4;
    if (cv) { cv.t += 1 / 120; if (cv.t < cv.a) { const hl = Math.hypot(ball.v.x, ball.v.z) || 1; Object.assign(cv, {w: Math.max(cv.w, ball.w.length()), x: ball.p.x, z: ball.p.z, hx: ball.v.x / hl, hz: ball.v.z / hl}); }  // the first 0.1 s (0.25 s after a pop): still in contact
      else { const lat = Math.abs((ball.p.x - cv.x) * -cv.hz + (ball.p.z - cv.z) * cv.hx); cv.max = Math.max(cv.max, lat);
        if (cv.t > 1.6 || touchedNow || ball.c && Math.abs(ball.n.y) < .7) { (cv.st.spins || (cv.st.spins = [])).push(cv.w); (cv.st.curves || (cv.st.curves = [])).push(cv.max); cv = null; } } }
    for (const d of GS.drones) { const f = fsOf(d), st = sim(d); const fi = d.ai.fin || null; if (fi && fi !== f.fin) (st.fins || (st.fins = {}))[fi] = ((st.fins || {})[fi] || 0) + 1; f.fin = fi;  // finishers chosen on a carry
      const fm = d.ai.fm || null, pf = f.fm; if (fm && fm !== f.fm) (st.modes || (st.modes = {}))[fm] = ((st.modes || {})[fm] || 0) + 1; f.fm = fm;
      if (d.popC > 0 && !(f.pc > 0) && d.p.y > 6 && U.set(0, 1, 0).applyQuaternion(d.q).y < -.2) st.resets = (st.resets || 0) + 1; f.pc = d.popC;  // flip reset: a pop earned upside down in the air
      if (d.popT > 0 && !f.pw) { f.chain = f.live ? f.chain + 1 : 1; f.live = true;
        if (pf === 'rsd') { st.resetDodges = (st.resetDodges || 0) + 1; f.rd = tnow; }  // the reset pop spent as a dodge
        if (d.p.y > C.H - 15 && d.p.distanceTo(ball.p) < BR + 4) st.ceilPops = (st.ceilPops || 0) + 1;  // popped off the ceiling
        if (d.ai.fin === 'spin' && DIFF[d.skill]?.fs && d.p.distanceTo(ball.p) < BR + 4) { if (cv) { (cv.st.spins || (cv.st.spins = [])).push(cv.w); (cv.st.curves || (cv.st.curves = [])).push(cv.max); } st.spinPops = (st.spinPops || 0) + 1; cv = {st, t: 0, a: .25, max: 0, w: ball.w.length(), x: ball.p.x, z: ball.p.z, hx: 0, hz: 1}; }  // a spin pop (the frame yawed flat out under the ball, then popped it)
        if ((C.HW - Math.abs(d.p.x) < 16 || C.HL - Math.abs(d.p.z) < 16 && Math.abs(d.p.x) > C.GW / 2) && d.p.y > 9 && d.p.distanceTo(ball.p) < BR + 4) st.wallPops = (st.wallPops || 0) + 1; } f.pw = d.popT > 0;
      if (floor) { endChain(f, st); f.air = false; f.wall = false; }
      const now = touchedNow === d; if (now && !f.was) { const dtT = tnow - f.lastT;
        if (f.air && dtT > .2 && dtT < 2 && ball.p.y > BR + 2 && d.p.y > 2) st.air = (st.air || 0) + 1;
        if (f.wall && dtT < 3.5) { st.taps = (st.taps || 0) + 1; if (d.ai.fm === 'follow') st.tapsPlanned = (st.tapsPlanned || 0) + 1; }
        if (d.ai.fm === 'air') st.airDribble = (st.airDribble || 0) + 1;
        if (tnow - (f.rd ?? -9) < .8) st.resetHits = (st.resetHits || 0) + 1;
        if (d.ai.fm === 'ceil') { st.ceilShots = (st.ceilShots || 0) + 1; const gz = (d.team ? 1 : -1) * C.HL, gx = -ball.p.x, gzz = gz - ball.p.z; if ((ball.v.x * gx + ball.v.z * gzz) / (Math.hypot(gx, gzz) || 1) > 10) st.ceilGoalward = (st.ceilGoalward || 0) + 1; }  // the strike after a ceiling pop
        st.touchEv = (st.touchEv || 0) + 1;
        const w = ball.w.length(); if (d.ai.fm === 'spin' && DIFF[d.skill]?.fs) { if (cv) { (cv.st.spins || (cv.st.spins = [])).push(cv.w); (cv.st.curves || (cv.st.curves = [])).push(cv.max); } const hl = Math.hypot(ball.v.x, ball.v.z) || 1; cv = {st, t: 0, a: .1, max: 0, w, x: ball.p.x, z: ball.p.z, hx: ball.v.x / hl, hz: ball.v.z / hl}; } else (st.wAll || (st.wAll = [])).push(w);
        f.lastT = tnow; f.air = !floor; f.wall = false; for (const o of GS.drones) if (o !== d) { const g = fsOf(o); g.air = false; g.wall = false; } lastBy = d; }
      f.was = now; }
    if (lastBy && ball.c && Math.abs(ball.p.z) > HL - BR - 2 && ball.p.y > GH && !floor) fsOf(lastBy).wall = true; };
  const trickStats = (o, min) => { const ch = (o.chains || []).filter(n => n >= 2), sp = o.spins || [], wa = o.wAll || [], avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
    return {chains_perMin: +(ch.length / min).toFixed(2), chainAvg: avg(ch), chainMax: ch.length ? Math.max(...ch) : 0, popsInChains: ch.reduce((x, y) => x + y, 0), airTouches: o.air || 0, airTouches_perMin: +((o.air || 0) / min).toFixed(1),
      wallPops: o.wallPops || 0, doubleTaps: o.taps || 0, doubleTapsPlanned: o.tapsPlanned || 0, airDribbleTouches: o.airDribble || 0, trickAttempts: o.modes || {}, finishers: o.fins || {}, flipResets: o.resets || 0, resetDodges: o.resetDodges || 0, resetDodgeHits: o.resetHits || 0, ceilingPops: o.ceilPops || 0, ceilingShots: o.ceilShots || 0, ceilingShotsGoalward: o.ceilGoalward || 0, spinShots: sp.length, spinPops: o.spinPops || 0, spinAvg: avg(sp), spinMax: sp.length ? +Math.max(...sp).toFixed(1) : null, spin10: sp.filter(x => x >= 10).length, curveAvg_m: avg(o.curves || []), curveMax_m: (o.curves || []).length ? +Math.max(...o.curves).toFixed(2) : null, otherTouchSpinAvg: avg(wa)}; };
  const rates = (o, min) => ({carryS_perMin: +((o.carry || 0) / min).toFixed(1), earned_perMin: +((o.earned || 0) / min).toFixed(1), popsFired_perMin: +((o.popsFired || 0) / min).toFixed(1), popsGoalward: o.popGood || 0, popsFired: o.popsFired || 0, popSuccessPct: o.popsFired ? Math.round(100 * (o.popGood || 0) / o.popsFired) : null});
  const lv = x => { const i = DIFF.findIndex(d => d.n.toLowerCase() === String(x).toLowerCase()); return i >= 0 ? i : +x; }, A = lv(la), B = lv(lb), dt = 1 / 120; Object.assign(DIFF[A], bt.D || {}); Object.assign(DIFF[B], bt.DB || {});
  DF.setGame(mode); MA.startDemo(); GS.paused = true; GS.menuOpen = true;
  GS.drones = GS.drones.filter(d => { if (d.i < size) return true; d.dispose(); return false; });
  for (const d of GS.drones) d.setLoadout(STOCK);
  const {HL, GW, GH} = C, vb = new (ball.v.constructor)(), q = {A: {n: 0, onT: 0, spd: 0, nErr: 0, nc: 0}, B: {n: 0, onT: 0, spd: 0, nErr: 0, nc: 0}};
  const out = {levels: [DIFF[A].n, DIFF[B].n], forA: 0, forB: 0, touchA: 0, touchB: 0, playS: 0, halves: []};
  if (mode === 'drill') {  // shooting drill: one bot, random ball and start, until its first touch; then did it score within 4 s?
    const bot = GS.drones.find(d => d.team === 0 && d.i === 0); for (const d of GS.drones) if (d !== bot) d.dead = 1e9;
    let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, res = {};
    for (const L of [A, B]) { bot.skill = L; seed = 7; let touched = 0, goals = 0, tt = 0, onT = 0, spd = 0; const N = +size * 10;
      for (let k = 0; k < N; k++) { GS.state = 'play'; ball.p.set((rnd() - .5) * 120, 3 + rnd() * 22, -100 + rnd() * 140); ball.v.set((rnd() - .5) * 30, (rnd() - .3) * 15, (rnd() - .5) * 30); ball.w.set(0, 0, 0); ball.c = false;
        bot.p.set(ball.p.x + (rnd() - .5) * 80, 4 + rnd() * 20, Math.min(ball.p.z + 30 + rnd() * 50, C.HL - 5)); bot.v.set(0, 0, 0); bot.w.set(0, 0, 0); bot.q.set(0, 0, 0, 1); bot.ai.t = 0; bot.ai.strike = false; bot.role = 'attack';
        LB.predict(); const s0 = GS.score[0]; let hit = -1;
        for (let i = 0; i < 120 * 9; i++) { ball.last = null; ST.step(dt); if (hit < 0 && ball.last) { hit = i; touched++; tt += i * dt; spd += ball.v.length(); const gz = -C.HL, v = ball.v; if (v.z < 0) { const tz = (gz - ball.p.z) / v.z, x = ball.p.x + v.x * tz, y = ball.p.y + v.y * tz; if (Math.abs(x) < C.GW / 2 && y < C.GH) onT++; } }
          if (GS.score[0] !== s0) { if (hit >= 0) goals++; GS.score[0] = s0; break; } if (hit >= 0 && i - hit > 480) break; if (hit < 0 && i > 600) break; } }
      res[DIFF[L].n] = {trials: N, touched, avgTouchS: +(tt / (touched || 1)).toFixed(2), onTarget: onT, goals, avgSpeed: +(spd / (touched || 1)).toFixed(1)}; }
    return res; }
  if (mode === 'tapdrill') {  // planned double taps: the bot carries the ball 18-30 m out with a lob into the backboard planned; did its next touch come after the backboard?
    const bot = GS.drones.find(d => d.team === 0 && d.i === 0); for (const d of GS.drones) if (d !== bot) d.dispose(); GS.drones = [bot]; bot.skill = A;
    let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, N = +size * 10, H0 = topOf(bot) + BR; let wall = 0, second = 0, goals = 0, planned = 0; const fms = [];
    for (let k = 0; k < N; k++) { GS.state = 'play'; const x = (rnd() - .5) * 24, z = -C.HL + 18 + rnd() * 12; bot.p.set(x, 9, z); bot.v.set(0, 0, -6); bot.w.set(0, 0, 0); bot.q.set(0, 0, 0, 1);
      ball.p.set(x, 9 + H0, z + .5); ball.v.set(0, 0, -6); ball.w.set(0, 0, 0); Object.assign(bot.ai, {fm: null, mv: 'lob', fin: 'tap', ct: 0, ch: 3, cht: 1, epi: true}); bot.role = 'attack'; LB.predict();
      const s0 = GS.score[0]; let hitWall = false, sec = false, tn = 0, lastT = -1;
      for (let i = 0; i < 120 * 6; i++) { hitBy = null; ST.step(dt); tn += dt; if (GS.score[0] !== s0) { goals++; GS.score[0] = s0; break; }
        if (!hitWall && ball.c && Math.abs(ball.p.z) > C.HL - BR - 2 && ball.p.y > C.GH) hitWall = true;
        if (hitBy === bot && hitWall && tn - lastT > .3 && !sec) { sec = tn; second++; if (bot.ai.fm === 'follow') planned++; } if (hitBy === bot) { lastT = tn; if (k < 3) fms.push(k + '@' + tn.toFixed(2) + ':' + (bot.ai.fm || '-') + (hitWall ? 'W' : '') + (bot.popT > 0 ? 'P' : '')); } if (sec && tn - sec > 3) break; }
      if (hitWall) wall++; }
    return {trials: N, offBackboard: wall, secondTouchAfterBackboard: second, secondTouchAsPlannedStrike: planned, goals, fms: fms.slice(0, 60)}; }
  if (mode === 'solo') {  // one bot alone on the League field (kickoffs, goals and all) for `mins` per level: how much it carries and pops
    const bot = GS.drones.find(d => d.team === 0 && d.i === 0); for (const d of GS.drones) if (d !== bot) d.dispose(); GS.drones = [bot]; const res = {};
    // the touch/pop rings (render/popfx.js) run here too: count rings that appear, by colour, against touches and pops
    const PF = await import('/src/render/popfx.js'), R = await import('/src/render/renderer.js'), ringsOf = () => R.scene.children.filter(o => o.renderOrder === 10 && o.geometry?.type === 'RingGeometry'), RS = new Map();
    const ringTick = st => { PF.popTick(dt); for (const m of ringsOf()) { const was = RS.get(m) || false; if (m.visible && !was) { const c = m.material.color.getHex(), k = c === 0xffc640 ? 'ringPop' : c === 0xffffff ? 'ringHit' : 'ringEarn'; st[k] = (st[k] || 0) + 1; } RS.set(m, m.visible); } };
    for (const L of [A, B]) { bot.skill = L; GS.score = [0, 0]; MA.kickoff(); const st = {}, dm = {}; let play = 0;
      for (let i = 0; i < mins * 60 * 120; i++) { hitBy = null; ST.step(dt); touchedNow = hitBy; ringTick(st); if (GS.state === 'play') { play += dt; dm[bot.ai.dm || '-'] = (dm[bot.ai.dm || '-'] || 0) + dt; } track(() => 0, () => st); }
      res[DIFF[L].n] = {simMin: mins, playMin: +(play / 60).toFixed(1), goals: GS.score[0], ownGoals: GS.score[1], ...rates(st, play / 60), ...trickStats(st, play / 60), rings: {hit: st.ringHit || 0, earn: st.ringEarn || 0, pop: st.ringPop || 0, touchEvents: st.touchEv || 0, popsFired: st.popsFired || 0}, modeShare: DIFF[L].drib && Object.fromEntries(Object.entries(dm).map(([k, v]) => [k, Math.round(100 * v / play)]))}; }
    return res; }
  for (const half of [0, 1]) {
    for (const d of GS.drones) d.skill = (d.team === half) ? A : B;  // half 0: A is blue, half 1: A is orange
    GS.score = [0, 0]; MA.kickoff(); let last = null, lastT = -1, n = Math.round(mins * 60 / 2 / dt), tA = 0, tB = 0;
    for (let i = 0; i < n; i++) {
      hitBy = null; if (mode === 'league') vb.copy(ball.v);
      const al = GS.drones.map(d => d.dead <= 0), pt = GS.drones.map(d => d.popT > 0), tu = DFm.TUR.map(t => t.re > 0);
      ST.step(dt); if (GS.state === 'play') out.playS += dt;
      touchedNow = hitBy;
      if (mode === 'league') track(d => d.team === half ? 'A' : 'B', d => q[d.team === half ? 'A' : 'B']);
      DFm.TUR.forEach((t, j) => { if (!tu[j] && t.re > 0) { const k = t.t === half ? 'A' : 'B'; q[k].turretsLost = (q[k].turretsLost || 0) + 1; } }); GS.drones.forEach((d, j) => { const k = d.team === half ? 'A' : 'B'; if (al[j] && d.dead > 0 && GS.state === 'play') q[k].demoed = (q[k].demoed || 0) + 1; if (!pt[j] && d.popT > 0) q[k].pops = (q[k].pops || 0) + 1; });
      if (mode === 'league' && touchedNow) { const d = touchedNow; if (d !== last || i - lastT > 30) { const k = d.team === half ? 'A' : 'B'; if (k === 'A') tA++; else tB++;
          // shot quality: does the ball now head for the enemy goal mouth (straight line), and did the touch go along the planned normal
          const gz = (d.team ? 1 : -1) * HL, v = ball.v, st = q[k]; st.n++; st.spd += v.length();
          if (v.z * (gz - ball.p.z) > 0) { const tz = (gz - ball.p.z) / v.z, x = ball.p.x + v.x * tz, y = ball.p.y + v.y * tz; if (Math.abs(x) < GW / 2 && y < GH && y > -10) st.onT++; }
          if (d.ai.n && d.ai.strike) { const dv = v.clone().sub(vb).normalize(); st.nErr += Math.acos(Math.max(-1, Math.min(1, dv.dot(d.ai.n)))) * 57.3; st.nc++; } }
        last = d; lastT = i; }
    }
    const fa = GS.score[half], fb = GS.score[1 - half]; out.forA += fa; out.forB += fb; out.touchA += tA; out.touchB += tB; out.halves.push({aTeam: half, forA: fa, forB: fb, touchA: tA, touchB: tB});
  }
  // cost: every bot thinks every call (worst case), plus a normal tick
  const cost = {};
  for (const L of [A, B]) { for (const d of GS.drones) d.skill = L; MA.kickoff(); GS.state = 'play'; for (let i = 0; i < 240; i++) ST.step(dt);
    const f = mode === 'league' ? LB.botControl : DB.dfBot, N = 300; let t0 = performance.now();
    for (let i = 0; i < N; i++) for (const d of GS.drones) { if (d.dead > 0) continue; d.ai.t = 0; f(d, dt); }
    const think = (performance.now() - t0) / N / GS.drones.length; t0 = performance.now(); const M = 1200; for (let i = 0; i < M; i++) ST.step(dt);
    const stepMs = (performance.now() - t0) / M; let pr = 0; if (mode === 'league') { t0 = performance.now(); for (let i = 0; i < 200; i++) LB.predict(); pr = (performance.now() - t0) / 200; }
    cost[DIFF[L].n] = {thinkMsPerBot: +think.toFixed(4), stepMs: +stepMs.toFixed(3), predictMs: +pr.toFixed(3)}; }
  out.cost = cost; for (const k in q) { const o = q[k]; out['shots' + k] = {touches: o.n, onTarget: o.onT, avgSpeed: +(o.spd / (o.n || 1)).toFixed(1), normalErrDeg: o.nc ? +(o.nErr / o.nc).toFixed(1) : null, demolished: o.demoed || 0, turretsLost: o.turretsLost || 0, pops: o.pops || 0, ...(mode === 'league' ? {...rates(o, out.playS / 60), ...trickStats(o, out.playS / 60)} : {})}; } out.playS = +out.playS.toFixed(0); return out;
}, mode, la, lb, +mins, +size, JSON.parse(process.env.BT || '{}'));
r.errors = errs; console.log(JSON.stringify(r)); await b.close(); await server.close(); process.exit(errs.length ? 1 : 0);
