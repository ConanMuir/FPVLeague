// Bot vs bot: two bot skill levels play each other headless (the real modules through the Vite dev server, stock parts for everyone),
// half the time on each side, and print goals (League) or points (Dogfight), touches and the bots' cost per tick.
//   node tools/bot-match.mjs [league|df] [levelA] [levelB] [sim minutes] [team size]      levels: DIFF index or name, e.g. 5 3 / "Grand Champion" Legend
//   node tools/bot-match.mjs drill A B 0 [trials/10]        shooting drill: one bot, random ball and start, touches / on target / goals
//   node tools/bot-match.mjs solo A B [sim minutes]          one bot alone on the League field: carry time, pops earned/fired/goalward per minute
//   BT='{"D":{"vmax":80},"DB":{"kd":3}}' overrides DIFF fields of level A (D) and B (DB) for tuning
import puppeteer from 'puppeteer-core';
const [mode = 'league', la = '5', lb = '3', mins = '6', size = '3'] = process.argv.slice(2);
const {createServer} = await import('vite');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await puppeteer.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, protocolTimeout: 0, env, args: ['--ignore-gpu-blocklist']});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(server.resolvedUrls.local[0] + 'app.html'); await new Promise(r => setTimeout(r, 6000));
p.setDefaultTimeout(0);
const r = await p.evaluate(async (mode, la, lb, mins, size, bt) => {
  const DF = await import('/src/modes/dogfight.js'), DFm = DF, MA = await import('/src/modes/match.js'), {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'),
    {ball} = await import('/src/physics/ball.js'), C = await import('/src/config/constants.js'), {DIFF} = C, {STOCK} = await import('/src/parts/index.js'),
    LB = await import('/src/bots/league.js'), DB = await import('/src/bots/dogfight.js'), {topOf} = await import('/src/bots/dribble.js'), {BR} = await import('/src/config/tune.js');
  // carry and pop bookkeeping (League): time with the ball resting on a quad's top, pops earned, pops fired, and pops that sent the ball goalward
  const _r = new (ball.p.constructor)(), pend = [], prevC = new Map(), prevT = new Map();
  const onTop = d => { _r.subVectors(ball.p, d.p); const h = topOf(d) + BR; return Math.hypot(_r.x, _r.z) < 1.2 && _r.y > h - .5 && _r.y < h + .6; };
  const track = (key, sim) => { for (const d of GS.drones) { if (d.dead > 0) continue; const st = sim(d), k = key(d);
      if (GS.state === 'play' && onTop(d)) st.carry = (st.carry || 0) + 1 / 120;
      const c0 = prevC.get(d) || 0; if (!(c0 > 0) && d.popC > 0) st.earned = (st.earned || 0) + 1; prevC.set(d, d.popC || 0);
      const t0 = prevT.get(d) || 0; if (!(t0 > 0) && d.popT > 0) { st.popsFired = (st.popsFired || 0) + 1; pend.push({st, d, t: 1, withBall: Math.hypot(ball.p.x - d.p.x, ball.p.z - d.p.z) < 1.6 && ball.p.y > d.p.y}); } prevT.set(d, d.popT || 0); }
    for (let i = pend.length - 1; i >= 0; i--) { const e = pend[i]; e.t -= 1 / 120; const gz = (e.d.team ? 1 : -1) * HL, gx = -ball.p.x, gzz = gz - ball.p.z, gl = Math.hypot(gx, gzz) || 1, vg = (ball.v.x * gx + ball.v.z * gzz) / gl;
      if (e.withBall && vg > 8 && ball.v.y > -2) { e.st.popGood = (e.st.popGood || 0) + 1; pend.splice(i, 1); } else if (e.t <= 0) pend.splice(i, 1); } };
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
  if (mode === 'solo') {  // one bot alone on the League field (kickoffs, goals and all) for `mins` per level: how much it carries and pops
    const bot = GS.drones.find(d => d.team === 0 && d.i === 0); for (const d of GS.drones) if (d !== bot) d.dispose(); GS.drones = [bot]; const res = {};
    for (const L of [A, B]) { bot.skill = L; GS.score = [0, 0]; MA.kickoff(); const st = {}, dm = {}; let play = 0;
      for (let i = 0; i < mins * 60 * 120; i++) { ST.step(dt); if (GS.state === 'play') { play += dt; dm[bot.ai.dm || '-'] = (dm[bot.ai.dm || '-'] || 0) + dt; } track(() => 0, () => st); }
      res[DIFF[L].n] = {simMin: mins, playMin: +(play / 60).toFixed(1), goals: GS.score[0], ownGoals: GS.score[1], ...rates(st, play / 60), modeShare: DIFF[L].drib && Object.fromEntries(Object.entries(dm).map(([k, v]) => [k, Math.round(100 * v / play)]))}; }
    return res; }
  for (const half of [0, 1]) {
    for (const d of GS.drones) d.skill = (d.team === half) ? A : B;  // half 0: A is blue, half 1: A is orange
    GS.score = [0, 0]; MA.kickoff(); let last = null, lastT = -1, n = Math.round(mins * 60 / 2 / dt), tA = 0, tB = 0;
    for (let i = 0; i < n; i++) {
      if (mode === 'league') { ball.last = null; vb.copy(ball.v); }
      const al = GS.drones.map(d => d.dead <= 0), pt = GS.drones.map(d => d.popT > 0), tu = DFm.TUR.map(t => t.re > 0);
      ST.step(dt); if (GS.state === 'play') out.playS += dt;
      if (mode === 'league') track(d => d.team === half ? 'A' : 'B', d => q[d.team === half ? 'A' : 'B']);
      DFm.TUR.forEach((t, j) => { if (!tu[j] && t.re > 0) { const k = t.t === half ? 'A' : 'B'; q[k].turretsLost = (q[k].turretsLost || 0) + 1; } }); GS.drones.forEach((d, j) => { const k = d.team === half ? 'A' : 'B'; if (al[j] && d.dead > 0 && GS.state === 'play') q[k].demoed = (q[k].demoed || 0) + 1; if (!pt[j] && d.popT > 0) q[k].pops = (q[k].pops || 0) + 1; });
      if (mode === 'league' && ball.last) { const d = ball.last; if (d !== last || i - lastT > 30) { const k = d.team === half ? 'A' : 'B'; if (k === 'A') tA++; else tB++;
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
  out.cost = cost; for (const k in q) { const o = q[k]; out['shots' + k] = {touches: o.n, onTarget: o.onT, avgSpeed: +(o.spd / (o.n || 1)).toFixed(1), normalErrDeg: o.nc ? +(o.nErr / o.nc).toFixed(1) : null, demolished: o.demoed || 0, turretsLost: o.turretsLost || 0, pops: o.pops || 0, ...(mode === 'league' ? rates(o, out.playS / 60) : {})}; } out.playS = +out.playS.toFixed(0); return out;
}, mode, la, lb, +mins, +size, JSON.parse(process.env.BT || '{}'));
r.errors = errs; console.log(JSON.stringify(r)); await b.close(); await server.close(); process.exit(errs.length ? 1 : 0);
