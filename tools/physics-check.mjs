// Physics checks (track B): measurable numbers for the Rapier world, the arena geometry, the ball, the drones and bullets.
//   node tools/physics-check.mjs            all checks (needs Microsoft Edge; serves src/ with Vite, nothing is built)
//   node tools/physics-check.mjs --geo      only the geometry checks (node, no browser)
//   node tools/physics-check.mjs --shots    also write close-up screenshots of the goal mouth to shots/ (gitignored)
// Geometry runs in node on src/physics/arena-shape.js. Everything else runs inside the real game in headless Edge: the page is
// paused (GS.paused) and the checks import the live modules from the Vite dev server and step them directly.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const f = (x, n = 2) => +(+x).toFixed(n);
let failed = false;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) failed = true; };

// ---------- geometry (node) ----------
{
  const {buildArena, arenaTrimesh, arenaSD} = await import(pathToFileURL(path.join(root, 'src/physics/arena-shape.js')).href), CK = await import(pathToFileURL(path.join(root, 'src/config/constants.js')).href);
  const t0 = performance.now(), A = buildArena(), T = arenaTrimesh(A), ms = performance.now() - t0, V = T.vertices, I = T.indices, E = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a, o = E.get(k) || {n: 0, dir: 0}; o.n++; o.dir += a < b ? 1 : -1; E.set(k, o); }
  let open = 0, non2 = 0, mis = 0; for (const o of E.values()) { if (o.n === 1) open++; else if (o.n !== 2) non2++; else if (o.dir) mis++; }
  let mv = 0; for (let i = 0; i < V.length; i += 3) mv = Math.max(mv, Math.abs(arenaSD(V[i], V[i + 1], V[i + 2])));
  let mc = 0, inward = 0, maxTurn = 0; const g = (x, y, z) => { const h = 1e-3; return [arenaSD(x + h, y, z) - arenaSD(x - h, y, z), arenaSD(x, y + h, z) - arenaSD(x, y - h, z), arenaSD(x, y, z + h) - arenaSD(x, y, z - h)]; };
  const fn = []; for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, cx = (V[a] + V[b] + V[c]) / 3, cy = (V[a + 1] + V[b + 1] + V[c + 1]) / 3, cz = (V[a + 2] + V[b + 2] + V[c + 2]) / 3;
    mc = Math.max(mc, Math.abs(arenaSD(cx, cy, cz))); const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], v = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n), gr = g(cx, cy, cz); if (n[0] * gr[0] + n[1] * gr[1] + n[2] * gr[2] > 0) inward++; fn.push(n.map(x => x / l)); }
  // largest angle between neighbouring faces that share an edge (how faceted the smooth parts are; creases are the 90 deg floor joins)
  const EF = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; (EF.get(k) || EF.set(k, []).get(k)).push(t / 3); }
  const turns = []; for (const [, fs2] of EF) if (fs2.length === 2) { const [p, q] = fs2.map(i => fn[i]); turns.push(Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) * 180 / Math.PI); }
  turns.sort((a, b) => a - b); const smooth = turns.filter(x => x < 30); maxTurn = smooth[smooth.length - 1];
  console.log(`\n== (geo) arena surface (${CK.W} x ${CK.L} x ${CK.H} m): one profile -> visual pieces + welded trimesh`);
  console.log(`  ${V.length / 3} vertices, ${I.length / 3} triangles, built in ${f(ms, 0)} ms; pieces: floor ${A.floor.idx.length / 3}, ramp ${A.ramp.idx.length / 3}, wall ${A.wall.idx.length / 3}, ceiling ${A.ceil.idx.length / 3}, nets ${A.nets[0].idx.length / 3}x2, mouth floor ${A.mouth[0].idx.length / 3}x2, goal floor ${A.goalF[0].idx.length / 3}x2`);
  console.log(`  max |SDF| at vertices ${f(mv * 1000, 3)} mm, at triangle centroids ${f(mc * 100, 2)} cm; largest bend between neighbouring faces on curved parts ${f(maxTurn, 2)} deg (creases ${turns.filter(x => x >= 30).length} edges)`);
  check(open === 0 && non2 === 0 && mis === 0, `trimesh is closed and consistently wound (open edges ${open}, non-manifold ${non2}, misoriented ${mis})`);
  check(inward === 0, `every face normal points into the free space (${inward} wrong)`);
  check(mv < 1e-3 && mc < .03, 'mesh lies on the analytic SDF (vertices < 1 mm, chords < 3 cm)');
  const p99 = turns.filter(x => x < 30)[Math.floor(smooth.length * .99)];
  console.log(`  99% of neighbouring faces on curved parts bend < ${f(p99, 2)} deg`);
  // the collision trimesh (floor and ceiling are boxes; the mesh keeps 4 m strips along their edges)
  const Tc = arenaTrimesh(A, true), Ic = Tc.indices, Ec = new Map(); for (let t = 0; t < Ic.length; t += 3) for (let e = 0; e < 3; e++) { const a = Ic[t + e], b = Ic[t + (e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a, o = Ec.get(k) || {n: 0, dir: 0}; o.n++; o.dir += a < b ? 1 : -1; Ec.set(k, o); }
  let co = 0, cn = 0, cm = 0, cfl = 0; for (const [k, o] of Ec) { if (o.n === 1) { co++; const [a, b] = k.split(',').map(Number); if (Tc.vertices[a * 3 + 1] !== 0 && Tc.vertices[a * 3 + 1] !== CK.H || Tc.vertices[b * 3 + 1] !== 0 && Tc.vertices[b * 3 + 1] !== CK.H) cfl++; } else if (o.n !== 2) cn++; else if (o.dir) cm++; }
  console.log(`  collision trimesh: ${Tc.vertices.length / 3} vertices, ${Ic.length / 3} triangles, open edges ${co} (all on the floor/ceiling planes: ${cfl === 0})`);
  check(cn === 0 && cm === 0 && cfl === 0, 'collision trimesh is consistently wound, open only where it meets the floor/ceiling boxes');
}
if (args.has('--geo')) process.exit(failed ? 1 : 0);

// ---------- browser ----------
const {createServer} = await import('vite');
const puppeteer = (await import('puppeteer-core')).default;
const server = await createServer({root, logLevel: 'error', server: {port: 0, host: '127.0.0.1'}});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const EDGE = [process.env.EDGE_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const browser = await puppeteer.launch({executablePath: EDGE, headless: true, env, protocolTimeout: 900000, args: ['--window-size=1280,720', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']});
const page = await browser.newPage(); const errors = [];
page.on('pageerror', e => errors.push(String(e?.message || e))); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|favicon/.test(m.text() + (m.location()?.url || ''))) errors.push(m.text()); if (m.type() === 'log') console.log('   [page] ' + m.text()); });
await page.setViewport({width: 1280, height: 720});
await page.goto(url, {waitUntil: 'domcontentloaded'});
for (let i = 0; i < 600 && !(await page.evaluate(() => !!window.__dl?.snap().drones.length)); i++) await new Promise(r => setTimeout(r, 100));

// shared in-page helpers
await page.evaluate(async () => {
  const imp = p => import(p);
  const M = window.__pc = {W: await imp('/src/physics/world.js'), B: await imp('/src/physics/ball.js'), GS: (await imp('/src/state.js')).GS, T: await imp('/src/config/tune.js'), D: await imp('/src/flight/drone.js'),
    C: await imp('/src/config/constants.js'), DF: await imp('/src/modes/dogfight.js'), H: await imp('/src/world/highlands.js'), CV: await imp('/src/world/caves.js'), S: await imp('/src/physics/sdf.js'), ST: await imp('/src/modes/step.js'), MA: await imp('/src/modes/match.js'),
    R: await imp('/src/render/renderer.js'), AS: await imp('/src/physics/arena-shape.js')};
  M.GS.paused = true; M.dt = 1 / 120;
  M.V3 = M.C.V3; M.QT = M.C.QT;
  M.league = () => { if (M.GS.OBSON) M.DF.setGame('league'); M.GS.drones.forEach(d => d.dispose()); M.GS.drones = []; M.GS.state = 'play'; M.W.physStep(M.dt, false); };
  M.df = () => { if (!M.GS.OBSON) M.DF.setGame('df'); M.GS.drones.forEach(d => d.dispose()); M.GS.drones = []; M.W.physStep(M.dt, false); };
});

const run = (name, fn, arg) => page.evaluate(fn, arg).catch(e => { errors.push(name + ': ' + e.message); return null; });

// ---------- (a) ball up the quarter-pipe ----------
console.log(`\n== (a) ball rolling at the side wall: energy from entering the quarter-pipe to coming back out (ball radius ${await page.evaluate(() => window.__pc.T.BR)}, ramp radius 10, wall ${await page.evaluate(() => window.__pc.C.H)} m)`);
const qp = await run('a', () => {
  const M = window.__pc, {B, W, T, S} = M, ball = B.ball, dt = M.dt, out = {}, X0 = M.C.HW - M.C.RF;  // side ramp starts at x = X0
  // v15's ball, for reference: sliding (no spin), Coulomb friction .25 on every contact impulse
  const v15 = (p, v) => { v.y -= T.BG * dt; const s = v.length(); v.multiplyScalar(Math.max(0, 1 - (T.BD + T.BD * .02 * s) * dt)); if (s > T.MAXB) v.multiplyScalar(T.MAXB / s); p.addScaledVector(v, dt);
    const n = new M.V3(); for (let it = 0; it < 2; it++) { const d = S.sdf(p.x, p.y, p.z); if (d <= -T.BR) break; S.sdN(p, n); p.addScaledVector(n, -(d + T.BR)); const vn = -(v.dot(n)); if (vn >= 0) continue;
      const tx = v.x + n.x * vn, ty = v.y + n.y * vn, tz = v.z + n.z * vn, tl = Math.hypot(tx, ty, tz), k = tl > 1e-6 ? Math.max(0, 1 - .25 * -vn * (1 + T.BB) / tl) : 0; v.set(tx * k + n.x * vn * T.BB, ty * k + n.y * vn * T.BB, tz * k + n.z * vn * T.BB); } };
  M.league();
  for (const mode of ['sdf', 'sdf, no roll-out', 'mesh', 'v15']) for (const sp of [15, 20, 30, 45, 60, 80]) {
    W.setBallMode(mode === 'mesh'); B.BALL.rr = mode === 'sdf, no roll-out' ? 0 : .25; ball.p.set(X0 - 5, T.BR, 0); ball.c = true; ball.n.set(0, -1, 0); ball.v.set(sp, 0, 0); ball.w.set(0, 0, mode === 'v15' ? 0 : -sp / T.BR); ball.q.set(0, 0, 0, 1);
    const E = () => .5 * ball.v.lengthSq() + T.BG * (ball.p.y - T.BR);  // linear + potential (the spin just follows the rolling)
    let E0 = E(), entry = null; let drag = 0, maxY = 0, pen = 0, back = null, apex = false, prevV = ball.v.clone(), acc = [], hops = 0, inC = false, contacts = 0, out_ = false;
    for (let i = 0; i < 8 * 120; i++) {
      const s = ball.v.length(), k = Math.max(0, 1 - (T.BD + T.BD * .02 * s) * dt); drag += .5 * s * s * (1 - k * k);
      const v0 = ball.v.clone();
      if (mode === 'v15') v15(ball.p, ball.v); else { B.ballPre(ball.v, dt); W.physStep(dt, true); }
      const d = S.sdf(ball.p.x, ball.p.y, ball.p.z); pen = Math.max(pen, d + T.BR); if (Math.abs(ball.p.x) > M.C.HW) out_ = true;
      const c = d > -T.BR - .02; if (c && !inC) contacts++; inC = c;
      // contact acceleration on the curved part (gravity and drag taken out)
      if (ball.p.x > X0 - T.BR && ball.p.y < 12) { const dv = ball.v.clone().sub(v0); dv.y += T.BG * dt; acc.push(dv.length() / dt); }
      maxY = Math.max(maxY, ball.p.y); if (ball.v.x < 0) apex = true;
      if (!entry && ball.p.x >= X0 - 1) entry = {E: E(), drag};
      if (apex && entry && ball.p.x < X0 - 1 && !back) { back = {E: E() - 0, t: i * dt, drag: drag - entry.drag}; break; }
    }
    // jitter: largest step-to-step jump in contact acceleration, relative to its median while on the curve
    const med = acc.slice().sort((a, b) => a - b)[acc.length >> 1] || 1; let jump = 0; for (let i = 1; i < acc.length; i++) jump = Math.max(jump, Math.abs(acc[i] - acc[i - 1]));
    if (entry) E0 = entry.E;
    (out[mode] = out[mode] || []).push({speed: sp, maxHeight: +maxY.toFixed(2), back: !!back, energyLossPct: back ? +(100 * (1 - back.E / E0)).toFixed(1) : null, dragPct: back ? +(100 * back.drag / E0).toFixed(1) : null,
      contactLossPct: back ? +(100 * (1 - (back.E + back.drag) / E0)).toFixed(1) : null, accJumpRel: +(jump / med).toFixed(2), contactStarts: contacts, maxPenetrationCm: +(pen * 100).toFixed(1), escaped: out_});
  }
  W.setBallMode(false); B.BALL.rr = .25; return out;
});
if (qp) { const qpCeil = await page.evaluate(() => window.__pc.C.H - window.__pc.T.BR - .5);
  for (const m in qp) { console.log(`  ${m}: speed m/s -> max height m | energy lost % (drag %, contact+rolling %) | contact-accel jump (x median) | contact starts | max penetration cm`);
    for (const r of qp[m]) console.log(`        ${String(r.speed).padStart(3)} -> ${String(r.maxHeight).padStart(6)} | ${String(r.energyLossPct).padStart(5)} (${r.dragPct}, ${r.contactLossPct}) | ${r.accJumpRel} | ${r.contactStarts} | ${r.maxPenetrationCm}${r.escaped ? ' ESCAPED' : ''}`); }
  check(qp.sdf.every(r => r.back && !r.escaped && r.maxPenetrationCm < 5 && r.contactStarts <= 2), 'analytic ball: every run comes back, stays on the surface (no hops), no tunnelling');
  check(qp['sdf, no roll-out'].filter(r => r.maxHeight < qpCeil).every(r => r.contactLossPct < 3), 'analytic ball: the curve and wall themselves cost < 3% (what the default loses on top is the floor roll-out on the shallow part of the ramp)');
  check(qp.sdf.every((r, i) => (r.contactLossPct ?? 100) <= (qp.v15[i].contactLossPct ?? 100)),  // null: never came back out (the slow v15 ball stops on the ramp)
    'analytic ball keeps more energy on the curve than v15');
}

// ---------- (b) ball dropped on edges, corners, posts ----------
console.log('\n== (b) ball dropped / thrown at edges: rim fillet (crossbar, post, ramp cut, top corner), goal back corner, arena corner');
const drops = await run('b', () => {
  const M = window.__pc, {B, W, T, S, C} = M, ball = B.ball, dt = M.dt, out = {}, HL = C.HL, GW = C.GW, GH = C.GH;
  const cases = {crossbar: [[0, GH + 12, HL + .7], [0, 0, 0]], post: [[GW / 2 + 1.2, 8, HL - 30], [0, 0, 30]], rampCut: [[GW / 2 + 1, 14, HL - 4], [0, 0, 0]], topCorner: [[GW / 2 - .5, GH + 12, HL + .6], [0, 0, 0]],
    goalBack: [[GW / 2 - 1, GH - 1, HL + 6], [0, 0, 25]], arenaCorner: [[90, 30, 120], [0, 0, 0]], floor: [[0, 20, 0], [0, 0, 0]]};
  M.league();
  for (const mode of ['sdf', 'mesh']) { W.setBallMode(mode === 'mesh'); out[mode] = {};
    for (const k in cases) { const [p, v] = cases[k]; ball.p.set(...p); ball.v.set(...v); ball.w.set(0, 0, 0); ball.q.set(0, 0, 0, 1);
      let pen = 0, bounces = 0, inC = false, first = null, last = [], nanOk = true; const n = new M.V3();
      for (let i = 0; i < 9 * 120; i++) { const v0 = ball.v.clone(); B.ballPre(ball.v, dt); W.physStep(dt, true); if (!Number.isFinite(ball.p.x)) { nanOk = false; break; }
        const d = S.sdf(ball.p.x, ball.p.y, ball.p.z); pen = Math.max(pen, d + T.BR); const c = d > -T.BR - .02; if (c && !inC && v0.length() > 1.5) { bounces++;
          if (!first) { S.sdN(ball.p, n); const dv = ball.v.clone().sub(v0); dv.y += T.BG * dt; first = {in: +v0.length().toFixed(1), out: +ball.v.length().toFixed(1), impulseVsNormalDeg: +(Math.acos(Math.min(1, -dv.normalize().dot(n))) * 180 / Math.PI).toFixed(1)}; } }
        inC = c; if (i >= 8 * 120) last.push(ball.p.clone()); }
      const mean = last.reduce((a, b) => a.add(b), new M.V3()).divideScalar(last.length || 1), jit = Math.sqrt(last.reduce((a, b) => a + b.distanceToSquared(mean), 0) / (last.length || 1));
      out[mode][k] = {bounces, first, maxPenetrationCm: +(pen * 100).toFixed(1), restJitterMm: +(jit * 1000).toFixed(2), restSpeed: +ball.v.length().toFixed(3), finite: nanOk, end: ball.p.toArray().map(x => +x.toFixed(1))}; } }
  W.setBallMode(false); return out;
});
if (drops) {
  for (const m in drops) { console.log(`  ${m}: case: bounces (>1.5 m/s) | first impact in->out m/s, impulse angle to surface normal | max penetration cm | after 8 s: position spread over the last second mm, speed m/s`);
    for (const k in drops[m]) { const r = drops[m][k]; console.log(`        ${k.padEnd(12)} ${r.bounces} | ${r.first ? r.first.in + '->' + r.first.out + ', ' + r.first.impulseVsNormalDeg + ' deg' : '-'} | ${r.maxPenetrationCm} | ${r.restJitterMm} mm, ${r.restSpeed} m/s  (ends at ${r.end})`); } }
  check(Object.values(drops.sdf).every(r => r.finite && r.maxPenetrationCm < 10), 'analytic ball: no NaN, penetration < 10 cm on every edge');
  check(drops.sdf.floor.restJitterMm < 1 && drops.sdf.floor.restSpeed < .05, 'ball dropped on the floor comes to rest without jitter');
}

// ---------- (c) free flight vs the v15 integration ----------
console.log('\n== (c) free flight: Rapier-integrated drone vs the plain v15 integration of the same flight model (default 6S settings, stock parts loadout)');
const fl = await run('c', () => {
  const M = window.__pc, {W, T, D, GS} = M, dt = M.dt, out = {};
  M.league(); W.PHYS.net = false; const statics = []; W.world.forEachCollider(c => { if (!c.parent()) { statics.push([c, c.isEnabled()]); c.setEnabled(false); } });
  const d = new D.Drone(0, 0, false, 'x'); GS.drones = [d]; d.boosting = false; const HOV = (T.G / (T.THR * d.fl.thr)) ** (1 / (T.TE * d.fl.te));  // the stock parts loadout's hover
  const reset = (q) => { d.p.set(0, 0, 0); d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.wt.set(0, 0, 0); d.q.copy(q || new M.QT()); d.thr = d.ms = HOV; d.gt = 0; d.flipT = 0; d.boost = 0; };
  const go = (rapier, secs, thr, q) => { reset(q); const tr = []; for (let i = 0; i < secs * 120; i++) { d.thr = thr; d.wt.set(0, 0, 0); d.step(dt); if (rapier) W.physStep(dt, false); else ref();  tr.push(d.p.clone()); } return tr; };
  const real = x => x / (T.G / 9.81);
  const ref = () => { const wl = d.w.length(); if (wl > 1e-6) d.q.multiply(new M.QT().setFromAxisAngle(d.w.clone().divideScalar(wl), wl * dt)).normalize(); d.p.addScaledVector(d.v, dt); d.ph = 0; };  // v15: q turned by w*dt, p += v*dt
  out.hoverThrottle = +HOV.toFixed(4);
  { const a = go(false, 2, HOV), b = go(true, 2, HOV); out.hoverDrift2s = [+a[a.length - 1].y.toFixed(4), +b[b.length - 1].y.toFixed(4)]; }
  { const a = go(false, 1, 1), b = go(true, 1, 1); out.punch1s = {v15: +a[119].y.toFixed(2), rapier: +b[119].y.toFixed(2), realMetres: +real(b[119].y).toFixed(1), maxDiff: +Math.max(...a.map((p, i) => p.distanceTo(b[i]))).toFixed(5)}; }
  // level top speed: fixed pitch (no rotation), full throttle; bisect the pitch so the height stays put after 12 s
  const lev = (rapier, th) => { const q = new M.QT().setFromAxisAngle(new M.V3(1, 0, 0), -th); const tr = go(rapier, 12, 1, q); return {vy: (tr[tr.length - 1].y - tr[tr.length - 121].y), vh: Math.hypot(d.v.x, d.v.z)}; };
  let lo = .2, hi = 1.5; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (lev(false, m).vy > 0) lo = m; else hi = m; }
  const r0 = lev(false, lo), r1 = lev(true, lo); out.level = {pitchDeg: +(lo * 180 / Math.PI).toFixed(1), v15: +r0.vh.toFixed(2), rapier: +r1.vh.toFixed(2), kmhReal: +(r1.vh * 3.6 / (T.G / 9.81)).toFixed(0)};
  // a flip with stick input (rates), and drop to terminal flat
  { const run2 = rapier => { reset(); const tr = []; for (let i = 0; i < 240; i++) { d.thr = .3; d.wt.set(i < 60 ? 6 : 0, 0, i < 120 ? 3 : 0); d.step(dt); if (rapier) W.physStep(dt, false); else ref();  tr.push([d.p.clone(), d.q.clone()]); } return tr; };
    const a = run2(false), b = run2(true); out.sticks2s = {maxPosDiff: +Math.max(...a.map((p, i) => p[0].distanceTo(b[i][0]))).toFixed(5), maxAngleDiffDeg: +Math.max(...a.map((p, i) => p[1].angleTo(b[i][1]) * 180 / Math.PI)).toFixed(4)}; }
  { const tr = go(true, 8, 0); out.flatFallTerminalReal = +real((tr[tr.length - 1].y - tr[tr.length - 2].y) * 120).toFixed(1); }
  statics.forEach(([c, e]) => c.setEnabled(e)); W.PHYS.net = true; d.dispose(); GS.drones = []; return out;
});
if (fl) {
  console.log(`  hover throttle ${fl.hoverThrottle}; height change after 2 s at hover: v15 ${fl.hoverDrift2s[0]} m, Rapier ${fl.hoverDrift2s[1]} m`);
  console.log(`  1 s full punch from hover: v15 ${fl.punch1s.v15} m, Rapier ${fl.punch1s.rapier} m (${fl.punch1s.realMetres} m real scale), largest path difference ${fl.punch1s.maxDiff} m`);
  console.log(`  level top speed (full throttle, ${fl.level.pitchDeg} deg pitch): v15 ${fl.level.v15} m/s, Rapier ${fl.level.rapier} m/s (${fl.level.kmhReal} km/h real scale)`);
  console.log(`  2 s of rolls/flips: position difference ${fl.sticks2s.maxPosDiff} m, attitude difference ${fl.sticks2s.maxAngleDiffDeg} deg; flat-fall terminal ${fl.flatFallTerminalReal} m/s real`);
  check(fl.punch1s.maxDiff < .01 && Math.abs(fl.level.v15 - fl.level.rapier) < .05 && fl.sticks2s.maxPosDiff < .01, 'free flight in Rapier matches the v15 integration (< 1 cm, < 0.05 m/s)');
}

// ---------- (d) on the ground ----------
console.log('\n== (d) drone on the ground: rest, slide, ramp, self-righting, turtle with sticks');
const gr = await run('d', () => {
  const M = window.__pc, {W, T, D, GS, S} = M, dt = M.dt, out = {}; M.league();
  const d = new D.Drone(0, 0, false, 'x'); GS.drones = [d]; d.boosting = false;
  // v17's own ground() (src/flight/drone.js at 4f7a32a), on the same SDF, for reference numbers: motors off or a fixed thrust, no rotation input
  const v15 = (p0, q0, v0, thr, secs, rec) => { const p = new M.V3(...p0), q = q0.clone(), v = new M.V3(...v0), w = new M.V3(), _H = Array.from({length: 16}, () => [new M.V3(), new M.V3()]);
    for (let i = 0; i < secs * 120; i++) { const up = new M.V3(0, 1, 0).applyQuaternion(q); v.addScaledVector(up, thr ? T.THR * d.fl.thr * thr ** (T.TE * d.fl.te) * dt : 0); v.y -= T.G * dt;
      { const s = v.length(); if (s > 1e-4) { const bx = new M.V3(1, 0, 0).applyQuaternion(q), bz = new M.V3(0, 0, 1).applyQuaternion(q), k = T.DQ * s, g = bx.clone().multiplyScalar(v.dot(bx) * (T.DL + k * .9)).addScaledVector(up, v.dot(up) * (T.DL + k * 1.8)).addScaledVector(bz, v.dot(bz) * (T.DL + k * .7)), dl = g.length() * dt; v.addScaledVector(g, -dt * (dl > s ? s / dl : 1)); } }  // the flight model's body drag
      const wl = w.length(); if (wl > 1e-6) q.multiply(new M.QT().setFromAxisAngle(w.clone().divideScalar(wl), wl * dt)).normalize(); p.addScaledVector(v, dt);
      let c = 0, dm = 0; const ww = w.clone().applyQuaternion(q), na = new M.V3();
      for (const C of d.hbp) { const r = C.clone().applyQuaternion(q), P = p.clone().add(r), dd = S.sdf(P.x, P.y, P.z) + d.hbr; if (dd <= 0) continue; const h = _H[c++]; S.sdN(P, h[1]).negate(); h[0].copy(r).addScaledVector(h[1], -d.hbr); na.add(h[1]); dm = Math.max(dm, dd); }
      if (c) { p.addScaledVector(na.normalize(), dm); for (let k = 0; k < c; k++) { const [r, n] = _H[k], vp = new M.V3().crossVectors(ww, r).add(v), vn = vp.dot(n); if (vn >= 0) continue;
        const rn = new M.V3().crossVectors(r, n), den = 1 + rn.lengthSq() / d.di, j = -(1 + (-vn > 3 ? T.DB : 0)) * vn / den / c * 1.15; v.addScaledVector(n, j); ww.addScaledVector(rn, j * .45 / d.di);
        vp.addScaledVector(n, -vn); const tl = vp.length(); if (tl > 1e-4) { vp.divideScalar(tl); const rt = new M.V3().crossVectors(r, vp), jt = Math.min(T.GF * Math.min(j, T.G * .05 / c), tl / (1 + rt.lengthSq() / d.di) / c); v.addScaledVector(vp, -jt); ww.addScaledVector(rt, -jt * .2 / d.di); } }
        w.copy(ww).applyQuaternion(q.clone().invert()); w.multiplyScalar(Math.exp(-dt / .09)); }  // (ground rate damping, as the flight model with sticks centred)
      rec?.(i, p, v, q); } return {p, v, q}; };
  const pen = () => { let m = -1; for (const c of d.pts) { const p = c.p.clone().applyQuaternion(d.q).add(d.p); m = Math.max(m, S.sdf(p.x, p.y, p.z) + c.r); } return m; };
  const place = (p, q, v) => { d.p.set(...p); d.q.copy(q || new M.QT()); d.v.set(...(v || [0, 0, 0])); d.w.set(0, 0, 0); d.wt.set(0, 0, 0); d.thr = d.ms = 0; d.gt = 0; d.flipT = 0; d.pw = 0; };
  const sim = (secs, ctl, rec) => { for (let i = 0; i < secs * 120; i++) { ctl?.(i); d.step(dt); W.physStep(dt, false); rec?.(i); } };
  // rest: dropped flat from 1 m
  { place([0, 1, 0]); let ys = [], vs = [], ws = [], mp = -1, mi = -1; sim(4, () => { d.thr = 0; }, i => { mi = Math.max(mi, pen()); if (i >= 3 * 120) { mp = Math.max(mp, pen()); ys.push(d.p.y); vs.push(d.v.length()); ws.push(d.w.length()); } });
    const my = ys.reduce((a, b) => a + b) / ys.length; out.rest = {height: +my.toFixed(4), expected: +T.HBR.toFixed(3), ySpreadMm: +(1000 * Math.sqrt(ys.reduce((a, b) => a + (b - my) ** 2, 0) / ys.length)).toFixed(3), maxSpeed: +Math.max(...vs).toFixed(4), maxRate: +Math.max(...ws).toFixed(4), maxPenetrationMm: +(mp * 1000).toFixed(1), landingPenetrationMm: +(mi * 1000).toFixed(1)};
    const ys2 = []; v15([0, 1, 0], new M.QT(), [0, 0, 0], 0, 4, (i, p) => { if (i >= 360) ys2.push(p.y); }); const m2 = ys2.reduce((a, b) => a + b) / ys2.length; out.rest.v15 = {height: +m2.toFixed(4), ySpreadMm: +(1000 * Math.sqrt(ys2.reduce((a, b) => a + (b - m2) ** 2, 0) / ys2.length)).toFixed(3)}; }
  // slide: 20 m/s along the floor, motors off: decel should be Ground grip x G
  { place([0, T.HBR + .01, 0], null, [20, 0, 0]); let v1 = null, mp = -1; sim(1, () => { d.thr = 0; }, i => { mp = Math.max(mp, pen()); if (i === 119) v1 = d.v.length(); });
    out.slide = {decel: +(20 - v1).toFixed(2), v15: +(20 - v15([0, T.HBR + .01, 0], new M.QT(), [20, 0, 0], 0, 1).v.length()).toFixed(2), maxPenetrationMm: +(mp * 1000).toFixed(1)}; }
  // slide upside down at full throttle into the floor: v17 caps the grip, so it still slides
  { const qd = new M.QT().setFromAxisAngle(new M.V3(0, 0, 1), Math.PI); place([0, .14, 0], qd, [20, 0, 0]); d.ms = 1; let v1 = null; sim(.5, () => { d.thr = 1; d.wt.set(0, 0, 0); }, i => { if (i === 59) v1 = Math.hypot(d.v.x, d.v.z); });
    const r = v15([0, .14, 0], qd, [20, 0, 0], 1, .5); out.slideThrusting = {lostIn05s: +(20 - v1).toFixed(2), v15: +(20 - Math.hypot(r.v.x, r.v.z)).toFixed(2), uncappedWouldBe: +(T.GF * (T.G + T.THR) * .5).toFixed(1)}; }
  // ramp: let go on the side quarter-pipe at 45 deg
  { const a = Math.PI / 4, x = M.C.HW - M.C.RF + M.C.RF * Math.sin(a), y = M.C.RF - M.C.RF * Math.cos(a); place([x - .4, y + .4, 0], new M.QT().setFromAxisAngle(new M.V3(0, 0, 1), a)); let mp = -1, ys = []; sim(5, () => { d.thr = 0; }, i => { mp = Math.max(mp, pen()); if (i >= 4 * 120) ys.push(d.p.y); });
    out.ramp = {end: d.p.toArray().map(v => +v.toFixed(2)), maxPenetrationMm: +(mp * 1000).toFixed(1), endUpY: +new M.V3(0, 1, 0).applyQuaternion(d.q).y.toFixed(3), ySpreadMm: +(1000 * (Math.max(...ys) - Math.min(...ys))).toFixed(2)}; }
  // self-righting (v16 pendulum): upside down / on its side, no input
  for (const [k, q, thr] of [['upsideDown', new M.QT().setFromAxisAngle(new M.V3(0, 0, 1), Math.PI), 0], ['onSide', new M.QT().setFromAxisAngle(new M.V3(0, 0, 1), Math.PI / 2), 0], ['lean80', new M.QT().setFromAxisAngle(new M.V3(0, 0, 1), Math.PI * 80 / 180), 0], ['upsideDownThrottle', new M.QT().setFromAxisAngle(new M.V3(1, 0, 0), Math.PI), .2]]) {
    place([0, k === 'onSide' || k === 'lean80' ? Math.max(...d.hbp.map(p => Math.abs(p.x))) + d.hbr + .1 : .6, 0], q); let t = null, mp = -1; sim(4, () => { d.thr = t == null ? thr : 0; d.wt.set(0, 0, 0); }, i => { mp = Math.max(mp, pen()); if (t == null && new M.V3(0, 1, 0).applyQuaternion(d.q).y > .9 && d.gt > 0) t = i * dt; });
    out[k] = {uprightAfter: t == null ? null : +t.toFixed(2), maxPenetrationMm: +(mp * 1000).toFixed(1), endUpY: +new M.V3(0, 1, 0).applyQuaternion(d.q).y.toFixed(3)}; }
  // turtle with sticks: upside down, full roll stick, motors off
  { place([0, .6, 0], new M.QT().setFromAxisAngle(new M.V3(0, 0, 1), Math.PI)); sim(.5, () => { d.thr = 0; });  // settle
    let t = null, mp = -1; sim(4, () => { d.thr = 0; d.wt.set(0, 0, 6); }, i => { mp = Math.max(mp, pen()); if (t == null && new M.V3(0, 1, 0).applyQuaternion(d.q).y > .9) t = i * dt; });
    out.turtleStick = {uprightAfter: t == null ? null : +t.toFixed(2), maxPenetrationMm: +(mp * 1000).toFixed(1)}; }
  // flip button (E / Xbox B)
  { place([0, .6, 0], new M.QT().setFromAxisAngle(new M.V3(0, 0, 1), Math.PI)); sim(.5); d.flipUp(); let t = null; sim(2, () => { d.thr = 0; }, i => { if (t == null && new M.V3(0, 1, 0).applyQuaternion(d.q).y > .9) t = i * dt; }); out.flipButton = {uprightAfter: t == null ? null : +t.toFixed(2)}; }
  d.dispose(); GS.drones = []; return out;
});
if (gr) {
  console.log(`  at rest on the floor (dropped from 1 m): centre height ${gr.rest.height} m (hull edge radius ${gr.rest.expected}; v17: ${gr.rest.v15.height}), spread ${gr.rest.ySpreadMm} mm (v17: ${gr.rest.v15.ySpreadMm}), max speed ${gr.rest.maxSpeed} m/s, max rate ${gr.rest.maxRate} rad/s, max penetration at rest ${gr.rest.maxPenetrationMm} mm (landing ${gr.rest.landingPenetrationMm} mm)`);
  console.log(`  slide at 20 m/s, motors off: ${gr.slide.decel} m/s lost in 1 s (v17 ground(): ${gr.slide.v15}), max penetration ${gr.slide.maxPenetrationMm} mm`);
  console.log(`  slide upside down at full throttle into the floor: ${gr.slideThrusting.lostIn05s} m/s lost in 0.5 s (v17: ${gr.slideThrusting.v15}; without v17's cap it would be ${gr.slideThrusting.uncappedWouldBe})`);
  console.log(`  let go on the 45 deg ramp: ends at ${gr.ramp.end} up.y ${gr.ramp.endUpY}, last-second spread ${gr.ramp.ySpreadMm} mm, max penetration ${gr.ramp.maxPenetrationMm} mm`);
  for (const k of ['upsideDown', 'onSide', 'lean80', 'upsideDownThrottle']) console.log(`  self-righting ${k} (${k === 'upsideDownThrottle' ? '20% throttle, below hover' : 'no input'}): upright after ${gr[k].uprightAfter} s (end up.y ${gr[k].endUpY}), max penetration ${gr[k].maxPenetrationMm} mm`);
  console.log(`  turtle with roll stick: upright after ${gr.turtleStick.uprightAfter} s, max penetration ${gr.turtleStick.maxPenetrationMm} mm; flip button: upright after ${gr.flipButton.uprightAfter} s`);
  check(gr.rest.ySpreadMm < 1 && gr.rest.maxSpeed < .1 && gr.rest.maxPenetrationMm < 10, 'drone rests on the floor without jitter or sinking');
  check(Math.abs(gr.slide.decel - gr.slide.v15) < .5, 'sliding friction matches v17');
  check(gr.slideThrusting.lostIn05s < gr.slideThrusting.v15 * 1.25 && gr.slideThrusting.lostIn05s < gr.slideThrusting.uncappedWouldBe * .7, 'thrusting into the floor is capped like v17 (within 25%; both sit near the G*.05 cap)');
  check(['upsideDown', 'upsideDownThrottle'].every(k => gr[k].uprightAfter != null && gr[k].uprightAfter < 4) && gr.onSide.uprightAfter == null, 'v20 self-righting: upside down on the floor rights itself; on its side (90 deg) it stays (flip button / sticks right it); at 80 deg it just falls back flat');
  check(gr.turtleStick.uprightAfter != null && gr.flipButton.uprightAfter != null, 'turtle with sticks and the flip button work');
}

// ---------- (e) bullets ----------
console.log('\n== (e) bullets at 720 m/s (400 + a 320 m/s shooter) at thin things in the Highlands');
const bul = await run('e', () => {
  const M = window.__pc, {W, H, S, D, GS} = M, dt = M.dt, out = {}; M.df();
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const fire = (from, to, target) => { const dir = to.clone().sub(from).normalize(), dv = dir.clone().multiplyScalar(720 * dt), p = from.clone(); let v15 = null;
    for (let i = 0; i < 60; i++) { const h = W.bulletCast(p, dv, -1, null); if (h) return {hit: h, v15, travelled: h.p.distanceTo(from)}; p.add(dv); if (v15 == null && S.sdf(p.x, p.y, p.z) > 0) v15 = p.distanceTo(from); } return {hit: null, v15}; };
  const trees = H.OBS.filter(o => o.t === 'tree'), spires = H.OBS.filter(o => o.t === 'cyl' && o.r < 9), bridges = H.OBS.filter(o => o.t === 'box' && o.hx > 40);
  const res = {tree: [0, 0, 0, 0], spire: [0, 0, 0, 0], bridge: [0, 0, 0, 0]};  // shots, hit something before passing the target, of those the v15 point test would have missed, analytic misses
  const shoot = (k, c, r) => { const a = rnd() * Math.PI * 2, dist = 40 + rnd() * 100, from = c.clone().add(new M.V3(Math.cos(a) * dist, (rnd() - .3) * 20, Math.sin(a) * dist));
    if (S.sdf(from.x, from.y, from.z) > -1) return; const aim = c.clone().add(new M.V3((rnd() - .5) * r, 0, (rnd() - .5) * r)), o = fire(from, aim);
    const R = res[k]; R[0]++; if (o.hit && o.travelled <= from.distanceTo(aim) + 1) { R[1]++; if (o.v15 == null || o.v15 > o.travelled + 6) R[2]++; } else R[3]++; };
  for (let i = 0; i < 400; i++) { const t = trees[i % trees.length]; shoot('tree', new M.V3(t.x, t.y0 + t.h * .12, t.z), .5); }
  for (let i = 0; i < 300; i++) { const s = spires[i % spires.length]; shoot('spire', new M.V3(s.x, s.y0 + 20 + rnd() * 30, s.z), s.r); }
  for (let i = 0; i < 200; i++) { const b = bridges[i % bridges.length]; shoot('bridge', new M.V3(b.x + (rnd() - .5) * 100, b.y, b.z), 4); }
  out.obstacles = res;
  // drones: a kinematic target hovering in the open, shots offset sideways and from above
  const d = new D.Drone(1, 0, false, 'tgt'); GS.drones = [d]; d.p.set(0, 420, 0); d.q.set(0, 0, 0, 1); d.ph = 0; W.physStep(dt, false);
  out.ext = +d.bound.toFixed(2); out.drone = {}; const br = W.bulletR(); out.br = +br.toFixed(2); for (const off of [0, .5, 1, +br.toFixed(2), 2, 3, +(d.bound + br + .2).toFixed(2), +(d.bound + 2.5).toFixed(2)]) { let h = 0; const N = 16;
    for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, dir = new M.V3(Math.cos(a), k % 4 === 0 ? -.8 : 0, Math.sin(a)).normalize(), side = new M.V3().crossVectors(dir, new M.V3(0, 1, 0)); if (side.lengthSq() < .1) side.set(1, 0, 0); side.normalize();
      const aim = d.p.clone().addScaledVector(side, off), o = fire(aim.clone().addScaledVector(dir, -90), aim.clone().addScaledVector(dir, 10)); if (o.hit?.d === d) { h++; out.drone.tag = o.hit.tag; } }
    out.drone[off] = h / N; }
  d.dispose(); GS.drones = []; return out;
});
if (bul) {
  for (const k in bul.obstacles) { const [n, hit, saved, miss] = bul.obstacles[k]; console.log(`  ${k.padEnd(7)} ${n} shots: ${hit} hit before passing the aim point, ${miss} did not; ${saved} of the hits would have tunnelled with v15's end-point test`); }
  console.log(`  drone target (stock parts, bounding radius ${bul.ext} m), fraction hit by lateral miss distance (sweep: parts + ${bul.br} m): ` + Object.entries(bul.drone).filter(([k]) => k !== 'tag').sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} m ${v}`).join(', ') + `; tag reported '${bul.drone.tag}'`);
  check(bul.obstacles.tree[3] === 0 && bul.obstacles.spire[3] === 0 && bul.obstacles.bridge[3] === 0, 'no bullet passes through a tree trunk, spire or bridge');
  check(bul.drone[0] === 1 && bul.drone[bul.br] === 1 && bul.drone[(bul.ext + bul.br + .2).toFixed(2) * 1] === 0, 'drone hits: always within the sweep radius of the centre, never beyond the parts + sweep');
}

// ---------- (g) bots' predictor and the touch model ----------
console.log('\n== (g) bot prediction vs the real ball; ball touches and drone bumps through Rapier queries vs v15 formulas');
const pt = await run('g', async () => {
  const M = window.__pc, {W, B, T, D, GS, C} = M, dt = M.dt, out = {}; M.league(); const L = window.__pcLeague;
  let seed = 5; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, ball = B.ball;
  // predictor: 2 s ahead at 50 Hz (as bots/league.js) vs the game's ball at 120 Hz, from random throws
  let worst = 0, sum = 0, n = 0;
  for (let k = 0; k < 40; k++) { ball.p.set((rnd() - .5) * 160, 3 + rnd() * 30, (rnd() - .5) * 200); ball.v.set((rnd() - .5) * 80, (rnd() - .3) * 40, (rnd() - .5) * 80); ball.w.set(0, 0, 0); ball.c = false;
    const pb = {p: ball.p.clone(), v: ball.v.clone(), w: new M.V3(), c: false, n: new M.V3()}; for (let i = 0; i < 100; i++) B.ballPhys(pb, 1 / 50);
    for (let i = 0; i < 240; i++) { B.ballPre(ball.v, dt); W.physStep(dt, true); } const e = ball.p.distanceTo(pb.p); worst = Math.max(worst, e); sum += e; n++; }
  out.predict = {mean: +(sum / n).toFixed(2), worst: +worst.toFixed(2)};
  // ball touch: Rapier queries on the v15 descriptor (defaultDroneDesc: BBX box) vs v15's ballBox() formula, random poses
  const d = new D.Drone(0, 0, false, 't'); W.buildDroneBody(d, W.defaultDroneDesc()); GS.drones = [d]; let dn = 0, dp = 0, cnt = 0, miss = 0, inside = 0, tag = null; const n1 = new M.V3(), l = new M.V3(), o = new M.V3(), qi = new M.QT();
  for (let k = 0; k < 400; k++) { d.p.set(0, 20, 0); d.q.set(rnd() - .5, rnd() - .5, rnd() - .5, rnd() - .5).normalize(); d.ph = 0; W.physStep(dt, false);
    ball.p.copy(d.p).add(new M.V3(rnd() - .5, rnd() - .5, rnd() - .5).normalize().multiplyScalar(T.BR + rnd() * 1.2 - .3));
    l.subVectors(ball.p, d.p).applyQuaternion(qi.copy(d.q).invert()); o.set(l.x - C.cl(l.x, -T.BBX[0], T.BBX[0]), l.y - C.cl(l.y, -T.BBX[1], T.BBX[1]), l.z - C.cl(l.z, -T.BBX[2], T.BBX[2])); const dd = o.length();
    const r = W.ballTouch(d, n1); const hit15 = dd < T.BR; if (!!r !== hit15) { if (Math.abs(dd - T.BR) > .01) miss++; continue; } if (!r) continue; if (dd < 1e-4) { inside++; continue; }  // centre inside the box: v15 pushes out along the centre line, Rapier along the shallowest face
    o.divideScalar(dd).applyQuaternion(d.q); dn = Math.max(dn, o.angleTo(n1) * 180 / Math.PI); dp = Math.max(dp, Math.abs(r.pen - (T.BR - dd))); cnt++; tag = r.tag; }
  out.touch = {cases: cnt, inside, disagreements: miss, maxNormalDeg: +dn.toFixed(3), maxPenMm: +(dp * 1000).toFixed(2), tag};
  // drone-drone: two stock quads 1 m apart (spheres DRAD as v15)
  const e = new D.Drone(1, 0, false, 'u'); W.buildDroneBody(e, W.defaultDroneDesc()); GS.drones = [d, e]; d.p.set(0, 20, 0); e.p.set(.9, 20.3, 0); d.q.set(0, 0, 0, 1); e.q.set(0, 0, 0, 1); d.ph = e.ph = 0; W.physStep(dt, false);
  const c = W.droneTouch(d, e, n1), dist = d.p.distanceTo(e.p); out.bump = {pen: c ? +c.pen.toFixed(4) : null, v15pen: +(2 * T.DRAD - dist).toFixed(4), normalDeg: c ? +(n1.angleTo(e.p.clone().sub(d.p).normalize()) * 180 / Math.PI).toFixed(3) : null, tags: c ? [c.ta, c.tb] : null};
  d.dispose(); e.dispose();
  // every parts loadout builds a body and rests on the floor
  const P = await import('/src/parts/index.js'); const LS = P.allLoadouts(); let ok = 0, lo = 9, hi = 0, bad = [];
  for (const ids of LS) { const q = new D.Drone(0, 0, false, 'p'); q.setLoadout(ids); GS.drones = [q]; q.p.set(0, .6, 0); q.q.set(0, 0, 0, 1); q.v.set(0, 0, 0); q.w.set(0, 0, 0); q.thr = q.ms = 0;
    for (let i = 0; i < 240; i++) { q.thr = 0; q.wt.set(0, 0, 0); q.step(dt); W.physStep(dt, false); } const y = q.p.y, sp = q.v.length();
    if (Number.isFinite(y) && Math.abs(y - q.hbr) < .02 && sp < .1) ok++; else bad.push(ids.join('/') + ' y' + y.toFixed(3) + ' v' + sp.toFixed(2)); lo = Math.min(lo, q.rb.numColliders()); hi = Math.max(hi, q.rb.numColliders()); q.dispose(); }
  out.loadouts = {n: LS.length, ok, colliders: [lo, hi], bad: bad.slice(0, 4)}; GS.drones = []; return out;
});
if (pt) {
  console.log(`  predictor (50 Hz, same ball code) vs the game ball (120 Hz in Rapier), 2 s ahead, 40 throws: mean ${pt.predict.mean} m, worst ${pt.predict.worst} m`);
  console.log(`  ball touch, v15 descriptor: ${pt.touch.cases} contacts (+${pt.touch.inside} with the ball centre inside the box), ${pt.touch.disagreements} disagreements with v15's ballBox (beyond 1 cm), normal within ${pt.touch.maxNormalDeg} deg, depth within ${pt.touch.maxPenMm} mm, tag '${pt.touch.tag}'`);
  console.log(`  drone bump, v15 descriptor: depth ${pt.bump.pen} m (v15 spheres ${pt.bump.v15pen}), normal off by ${pt.bump.normalDeg} deg, tags ${pt.bump.tags}`);
  check(pt.predict.mean < 1.5, 'bots\' prediction tracks the real ball (mean error < 1.5 m over 2 s)');
  check(pt.touch.disagreements === 0 && pt.touch.maxNormalDeg < .5 && pt.touch.maxPenMm < 2, 'ball touches: same contact, normal and depth as v15 ballBox()');
  check(pt.bump.pen != null && Math.abs(pt.bump.pen - pt.bump.v15pen) < .002 && pt.bump.normalDeg < .1, 'drone bumps: same contact as v15 (DRAD spheres)');
  console.log(`  parts loadouts: ${pt.loadouts.ok}/${pt.loadouts.n} build a body (${pt.loadouts.colliders.join('-')} colliders) and rest on their ground hull${pt.loadouts.bad.length ? '; not: ' + pt.loadouts.bad.join(', ') : ''}`);
  check(pt.loadouts.ok === pt.loadouts.n, 'every parts loadout builds a Rapier body and rests on the floor');
}

// ---------- heightfield = terrain mesh ----------
const hf = await run('hf', () => {
  const M = window.__pc, {W, H} = M; M.df(); const T = H.dfGrid(); let e = 0, ed = 0, n = 0, seed = 3; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, R = W.R;
  for (let i = 0; i < 3000; i++) { const x = (rnd() - .5) * 1000, z = (rnd() - .5) * 1300, h = W.world.castRay(new R.Ray({x, y: 900, z}, {x: 0, y: -1, z: 0}), 2000, true, undefined, W.grp(W.QRY, W.GW_), undefined, undefined, c => c.handle === W.PHYS.dfTerrain.handle);
    if (!h) continue; const y = 900 - h.timeOfImpact, fx = (x + T.w / 2) / T.w * T.nx, fz = (z + T.l / 2) / T.l * T.nz, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, n1 = T.nx + 1, g = (a, b) => T.h[(iz + b) * n1 + ix + a];
    const mesh = u + v < 1 ? g(0, 0) + u * (g(1, 0) - g(0, 0)) + v * (g(0, 1) - g(0, 0)) : g(1, 1) + (1 - u) * (g(0, 1) - g(1, 1)) + (1 - v) * (g(1, 0) - g(1, 1)); e = Math.max(e, Math.abs(y - mesh)); ed = Math.max(ed, Math.abs(y - H.dfH(x, z))); n++; }
  return {n, meshErr: e, dfHErr: ed};
});
if (hf) { console.log(`\n== Highlands terrain collider (trimesh, cut open at the caves) vs the terrain mesh (${hf.n} rays): max ${f(hf.meshErr * 100, 2)} cm (vs the exact dfH() the old SDF used: ${f(hf.dfHErr, 2)} m)`); check(hf.n > 2500 && hf.meshErr < .02, 'Rapier terrain = the visible terrain triangles'); }

// ---------- (h) the underground level ----------
console.log('\n== (h) Highlands caves: mesh, roof, flights through every tunnel and entrance, bullets and sight through rock, bots underground');
const cv = await run('h', async () => {
  const M = window.__pc, {W, H, CV, D, GS, S} = M, dt = M.dt, R = W.R, out = {}; M.df(); W.physStep(dt, false);
  const D2 = H.dfCollision(), mesh = [D2.terrain, D2.caves];
  // closure: open edges (welded by position) and the widest crack between neighbouring open edges
  const key = new Map(), V = [], I = [];for (const m of mesh) { const map = []; for (let i = 0; i < m.vertices.length; i += 3) { const k = m.vertices[i] + ',' + m.vertices[i + 1] + ',' + m.vertices[i + 2]; let j = key.get(k); if (j == null) { j = V.length / 3; key.set(k, j); V.push(m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]); } map.push(j); } for (const i of m.indices) I.push(map[i]); }
  const E = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; const o = E.get(k) || {n: 0, a, b, dir: 0}; o.n++; o.dir += a < b ? 1 : -1; E.set(k, o); }
  const T = H.dfGrid(), border = (x, z) => Math.abs(Math.abs(x) - T.w / 2) < .01 || Math.abs(Math.abs(z) - T.l / 2) < .01, open = []; let non = 0, mis = 0;
  for (const o of E.values()) { if (o.n === 1) { const ax = V[o.a * 3], az = V[o.a * 3 + 2], bx = V[o.b * 3], bz = V[o.b * 3 + 2]; if (!(border(ax, az) && border(bx, bz))) open.push(o); } else if (o.n > 2) non++; else if (o.dir) mis++; }
  // every inner open edge must lie where two surfaces meet: on a cave wall and on the terrain or another cave piece
  let offSeam = 0; const cell = new Map(), C = 4, mid = o => [0, 1, 2].map(c => (V[o.a * 3 + c] + V[o.b * 3 + c]) / 2);
  for (const o of open) { const m = mid(o), k = Math.floor(m[0] / C) + ',' + Math.floor(m[1] / C) + ',' + Math.floor(m[2] / C); (cell.get(k) || cell.set(k, []).get(k)).push(o);
    const seam = q => { const sc = Math.abs(CV.sdCave(q[0], q[1], q[2])), st = Math.abs(H.dfHt(q[0], q[2]) - q[1]); return st < CV.SEAM + .1 || sc < CV.SEAM + .3 || CV.CAVE.pieces.some(p => Math.abs(CV.sdPiece(p, q[0], q[1], q[2]) + CV.SEAM) < .3); };
    if (![o.a, o.b].every(i => seam([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]]))) offSeam++; }  // both ends where a surface stops 0.35 m past another (the clipper places them exactly)  // open edges end a little past a seam (caves.js SEAM overlap)
  // can a round get through a seam? rays from 3 m inside the cave straight through 500 seam points into the rock must hit something within 4 m
  let seamRays = 0, seamMiss = 0; const g = new M.V3(), P0 = new M.V3();
  for (let i = 0; i < open.length; i += Math.max(1, Math.floor(open.length / 500))) { const m = mid(open[i]), h = .05; g.set(CV.sdCave(m[0] + h, m[1], m[2]) - CV.sdCave(m[0] - h, m[1], m[2]), CV.sdCave(m[0], m[1] + h, m[2]) - CV.sdCave(m[0], m[1] - h, m[2]), CV.sdCave(m[0], m[1], m[2] + h) - CV.sdCave(m[0], m[1], m[2] - h)).normalize();
    P0.set(m[0] - g.x * 3, m[1] - g.y * 3, m[2] - g.z * 3); if (H.sdDFt(P0.x, P0.y, P0.z) > -.5) continue; seamRays++; const hit = W.world.castRay(new R.Ray(P0, g), 7, true, undefined, W.grp(W.QRY, W.GW_)); if ((!hit || hit.timeOfImpact > 4) && H.sdDFt(m[0] + g.x * 4, m[1] + g.y * 4, m[2] + g.z * 4) > .5) seamMiss++; }  // past the seam into rock without a hit (at a cave/cave seam the ray may rightly carry on into the next cave)
  out.mesh = {tris: I.length / 3, open: open.length, nonManifold: non, misoriented: mis, offSeam, seamRays, seamMiss};
  // SDF vs mesh: vertices and triangle centroids against the map SDF (terrain or cave)
  let mv = 0, mc = 0; const used = new Set(I); for (let i = 0; i < V.length; i += 3) if (used.has(i / 3)) if (Math.abs(V[i]) < H.DHW - 1 && Math.abs(V[i + 2]) < H.DHL - 1 && V[i + 1] < H.DCEIL) mv = Math.max(mv, Math.abs(Math.min(H.dfHt(V[i], V[i + 2]) - V[i + 1], CV.sdCave(V[i], V[i + 1], V[i + 2])) * (V[i + 1] > H.dfHt(V[i], V[i + 2]) + .01 ? 0 : 1)));
  for (let t = 0; t < I.length; t += 30) { const c = [0, 1, 2].map(j => (V[I[t] * 3 + j] + V[I[t + 1] * 3 + j] + V[I[t + 2] * 3 + j]) / 3); mc = Math.max(mc, Math.abs(Math.min((H.dfHt(c[0], c[2]) - c[1]), CV.sdCave(c[0], c[1], c[2])))); }
  out.sdf = {vertexCm: +(mv * 100).toFixed(2), centroidCm: +(mc * 100).toFixed(1)};
  // roof: rock above every cave wall vertex away from the entrances
  let roof = 1e9; const cw = D2.caves.vertices; for (let i = 0; i < cw.length; i += 3) { const x = cw[i], y = cw[i + 1], z = cw[i + 2]; if (CV.CAVE.entrances.some(e => Math.hypot(x - e.p[0], z - e.p[2]) < 90)) continue; roof = Math.min(roof, H.dfHt(x, z) - y); }
  out.roof = +roof.toFixed(1); out.entrances = CV.CAVE.entrances.map(e => e.name + '@' + e.p.map(v => Math.round(v)).join(','));
  // scripted flights: a drone steered along every tunnel and entrance axis (and back) at 60 m/s; it must never touch a wall or need the safety net
  const d = new D.Drone(0, 0, false, 'cave'); GS.drones.forEach(o => o.dispose()); GS.drones = [d]; const e0 = W.PHYS.stats.escapes; let touches = 0, worst = -99, flown = 0;
  for (const ax of CV.caveAxes(4)) for (const pts of [ax.pts, [...ax.pts].reverse()]) { d.p.set(...pts[0]); d.v.set(0, 0, 0); d.q.set(0, 0, 0, 1); d.w.set(0, 0, 0); d.gt = 0; let k = 1;
    for (let i = 0; i < 2400 && k < pts.length; i++) { const tg = new M.V3(...pts[k]); if (tg.distanceTo(d.p) < 6) { k++; continue; } const want = tg.clone().sub(d.p).setLength(60), a = want.sub(d.v).multiplyScalar(6).clampLength(0, 200); a.y += M.T.G;
      const up = a.clone().normalize(); d.q.setFromUnitVectors(new M.V3(0, 1, 0), up); d.w.set(0, 0, 0); d.wt.set(0, 0, 0); d.thr = Math.min(1, (a.length() / (M.T.THR * d.fl.thr)) ** (1 / (M.T.TE * d.fl.te))); d.step(dt); W.physStep(dt, false);
      flown += d.v.length() * dt; if (d.gt > 0) touches++; worst = Math.max(worst, H.sdDFt(d.p.x, d.p.y, d.p.z)); } }
  out.flight = {km: +(flown / 1000).toFixed(1), wallTicks: touches, worstSdf: +worst.toFixed(1), escapes: W.PHYS.stats.escapes - e0};
  // bullets and sight: rays out of every tunnel through its wall, rays down into the ground over the tunnels, sight from a tunnel to the surface above it
  let shots = 0, through = 0, losBad = 0, losAlong = 0, nAlong = 0; let seed = 9; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (const o of CV.CAVE.pieces) if (o.k === 'c') for (let i = 0; i < 25; i++) { const t = (.15 + .7 * rnd()) * o.L, c = new M.V3(...o.a.map((v, j) => v + o.d[j] * t)), dir = new M.V3(rnd() - .5, rnd() - .5, rnd() - .5); dir.addScaledVector(new M.V3(...o.d), -dir.dot(new M.V3(...o.d))).normalize();
    if (CV.sdCave(c.x, c.y, c.z) > -2) continue; const dv = dir.clone().multiplyScalar(o.r + 40), h = W.bulletCast(c, dv, -1, null), e = c.clone().add(dv); shots++; if (!h && H.sdDFt(e.x, e.y, e.z) > 0) through++;  // through: ended inside rock without hitting a wall
    const above = new M.V3(c.x, H.dfHt(c.x, c.z) + 30, c.z); if (!o.ent && W.los(c, above)) losBad++; const c2 = new M.V3(...o.a.map((v, j) => v + o.d[j] * Math.min(o.L, t + 40))); if (!o.ent) { nAlong++; if (W.los(c, c2)) losAlong++; } }
  out.bullets = {shots, through, losThroughRock: losBad, losAlongTunnel: losAlong + '/' + nAlong};
  // a bot chasing a foe that hides in the central hall
  const foe = new D.Drone(0, 0, false, 'foe'), bot = new D.Drone(1, 0, true, 'b10'); GS.drones = [foe, bot]; foe.p.set(...CV.CAVE.nodes.H0); bot.p.set(0, 120, -380); bot.v.set(0, 0, 0);
  const BD = await import('/src/bots/dogfight.js'), TR = M.DF.TUR.map(t => t.re); M.DF.TUR.forEach(t => t.re = 1e9); let reachedUG = null, closest = 1e9, inside = 0; GS.state = 'play';  // turrets off: the foe is the only target
  for (let i = 0; i < 120 * 40; i++) { foe.v.set(0, 0, 0); foe.ph = 0; BD.dfBot(bot, dt); bot.step(dt); W.physStep(dt, false); const ug = CV.inCave(bot.p.x, bot.p.y, bot.p.z); if (ug) { inside++; if (reachedUG == null) reachedUG = i * dt; } closest = Math.min(closest, bot.p.distanceTo(foe.p)); if (closest < 60) break; }
  M.DF.TUR.forEach((t, i) => t.re = TR[i]);
  out.bot = {underground: reachedUG == null ? null : +reachedUG.toFixed(1), closestM: +closest.toFixed(0)};
  out.spawns = (await import('/src/world/highlands.js')).dfSpawnPoint([]).slice(0, 3).map(v => +v.toFixed(0));
  foe.dispose(); bot.dispose(); d.dispose(); GS.drones = []; return out;
});
if (cv) { const CVS = await page.evaluate(() => window.__pc.CV.SEAM);
  console.log(`  mesh (terrain + caves, welded): ${cv.mesh.tris} triangles, ${cv.mesh.open} open edges inside the map (all on a terrain/cave or cave/cave seam: ${cv.mesh.offSeam === 0}), rays through ${cv.mesh.seamRays} seam points that got past the rock: ${cv.mesh.seamMiss}, non-manifold ${cv.mesh.nonManifold}, misoriented ${cv.mesh.misoriented}`);
  console.log(`  mesh vs SDF: vertices ${cv.sdf.vertexCm} cm, triangle centroids ${cv.sdf.centroidCm} cm; rock over the caves away from the entrances >= ${cv.roof} m`);
  console.log(`  entrances (axis meets the ground): ${cv.entrances.join('  ')}`);
  console.log(`  scripted flights through every tunnel and entrance, both ways: ${cv.flight.km} km flown, ${cv.flight.wallTicks} ticks touching a wall, worst SDF ${cv.flight.worstSdf} m, safety-net escapes ${cv.flight.escapes}`);
  console.log(`  bullets from inside the tunnels at the walls: ${cv.bullets.through} of ${cv.bullets.shots} got through the rock; sight from a tunnel to the surface above: ${cv.bullets.losThroughRock} clear (should be 0); sight 40 m along a tunnel: ${cv.bullets.losAlongTunnel} clear`);
  console.log(`  bot chasing a foe in the central hall from 120 m over the orange half: underground after ${cv.bot.underground} s, closest ${cv.bot.closestM} m; a respawn point: ${cv.spawns}`);
  check(cv.mesh.nonManifold === 0 && cv.mesh.misoriented === 0 && cv.mesh.offSeam === 0 && cv.mesh.seamMiss === 0, 'terrain + caves: consistently wound, open only along cave seams, and no round gets through a seam');
  check(cv.sdf.vertexCm < (CVS + .3) * 100 && cv.sdf.centroidCm < (CVS + .3) * 100, 'cave and terrain mesh agree with the map SDF (to the seam overlap plus chord error)');
  check(cv.roof >= 10, 'solid rock (>= 10 m) over the caves except at the entrances');
  check(cv.flight.escapes === 0 && cv.flight.worstSdf < -3 && cv.flight.wallTicks === 0, 'a drone flies every tunnel and entrance without touching a wall or being pushed out');
  check(cv.bullets.through === 0 && cv.bullets.losThroughRock === 0, 'bullets and line of sight stop at the cave walls');
  check(cv.bot.underground != null && cv.bot.closestM < 150, 'a bot follows a foe into the caves');
}

// ---------- (f) step cost ----------
console.log('\n== (f) cost per 120 Hz tick: 3v3 bots + ball, the whole step() (bots, guns, touches) and the Rapier part (physStep)');
const cost = await run('f', () => {
  const M = window.__pc, {W, GS, ST, MA, DF} = M, out = {};
  for (const m of ['league', 'df']) { DF.setGame(m); MA.startDemo(); GS.paused = true; GS.state = 'play'; GS.menuOpen = true;
    for (let i = 0; i < 240; i++) ST.step(M.dt); const s0 = {...W.PHYS.stats}, t0 = performance.now(), N = 1800; for (let i = 0; i < N; i++) ST.step(M.dt);
    out[m] = {drones: GS.drones.length, stepMs: +((performance.now() - t0) / N).toFixed(3), physMs: +((W.PHYS.stats.ms - s0.ms) / (W.PHYS.stats.steps - s0.steps)).toFixed(3), escapes: W.PHYS.stats.escapes - s0.escapes}; }
  DF.setGame('league'); MA.startDemo(); GS.paused = true; return out;
});
if (cost) { for (const m in cost) console.log(`  ${m.padEnd(6)} ${cost[m].drones} drones: step() ${cost[m].stepMs} ms, physStep ${cost[m].physMs} ms per tick (${f(cost[m].stepMs * 120 / 10, 1)}% of a 60 fps frame budget per second of sim); safety-net escapes ${cost[m].escapes}`);
  check(cost.league.stepMs < 2 && cost.df.stepMs < 3, 'a tick costs < 2 ms (League) / < 3 ms (Highlands)'); }

// ---------- screenshots ----------
if (args.has('--shots')) {
  fs.mkdirSync(path.join(root, 'shots'), {recursive: true});
  const views = {mouth: [[0, 9, 105], [0, 9, 140]], post: [[38, 4, 118], [23, 6, 140]], corner: [[-60, 14, -95], [-100, 6, -130]], inside: [[10, 6, 135], [-10, 8, 152]], wide: [[70, 45, 40], [0, 5, 135]], side: [[0, 20, 60], [110, 8, 60]]};
  await page.evaluate(async () => { const M = window.__pc; M.DF.setGame('league'); M.MA.startDemo(); M.GS.paused = true; const cam = M.R.camera; cam.position.copy = function () { return this; }; cam.lookAt = () => {}; const st = document.createElement('style'); st.textContent = 'body>*:not(canvas){visibility:hidden!important}'; document.head.append(st); });
  for (const [k, [p, t]] of Object.entries(views)) {
    await page.evaluate((p, t) => { const M = window.__pc, cam = M.R.camera; cam.position.set(...p); const o = new cam.constructor(); o.position.set(...p); o.lookAt(...t); cam.quaternion.copy(o.quaternion); cam.fov = 70; cam.updateProjectionMatrix(); }, p, t);
    await new Promise(r => setTimeout(r, 600)); await page.screenshot({path: path.join(root, 'shots', 'physics-' + k + '.png')}); console.log('  shots/physics-' + k + '.png');
  }
}

console.log(errors.length ? '\nerrors:\n  ' + errors.slice(0, 10).join('\n  ') : '\nno page errors');
await browser.close(); await server.close();
console.log(failed || errors.length ? 'PHYSICS CHECK FAILED' : 'PHYSICS CHECK PASSED');
process.exit(failed || errors.length ? 1 : 0);
