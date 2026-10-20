// Pop mechanic check: earning (the ball on the top, centred so it covers ALL the motors: flight/drone.js popZone), the direction rule,
// the locked turn returning to the start attitude, and that where the ball sits on the quad changes the pop. Runs the real modules in
// headless Edge through the Vite dev server.
//   node tools/pop-check.mjs
// Earning, for every arm set and a few chassis / power units: a centred rest earns; inside the sweet spot (0.8 x its edge, toward each
// motor and along the four axes) earns; just past it (1.25 x) doesn't; an off-centre touch near one motor doesn't (the old rule, contact point inside the motors,
// did: checked here so the case keeps meaning something); the ball below the quad doesn't. An off-centre touch fires no popEarn.
import {launchBrowser, gameReady} from './browser.mjs';
const {createServer} = await import('vite');
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist']});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
const r = await p.evaluate(async () => {
  const DF = await import('/src/modes/dogfight.js'), MA = await import('/src/modes/match.js'), {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'),
    {ball} = await import('/src/physics/ball.js'), T = await import('/src/config/tune.js'), D = await import('/src/flight/drone.js'), {onEv} = await import('/src/core/events.js'), {STOCK} = await import('/src/parts/index.js');
  DF.setGame('free'); MA.startMatch(); GS.paused = true; GS.state = 'play'; GS.menuOpen = false;
  const d = GS.player, dt = 1 / 120, BR = T.BR; let earnEv = 0; onEv('popEarn', e => { if (e.d === d) earnEv++; });
  const topOf = () => Math.max(...d.lo.colliders.map(c => c.pos[1] + (c.shape === 'box' ? c.size[1] : c.shape === 'capsule' ? c.size[1] : c.size[0])));  // the real top of the parts
  const run = (s, f) => { for (let i = 0; i < s * 120; i++) { f?.(i); ST.step(dt); } };
  const ballAt = (ox, oz, below) => { const top = topOf(); ball.p.set(ox, below ? 30 - top - BR + .05 : 30 + top + BR - .05, oz); ball.v.set(0, 0, 0); ball.w.set(0, 0, 0); };
  const place = (ox, oz, below) => { d.p.set(0, 30, 0); d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.wt.set(0, 0, 0); d.q.set(0, 0, 0, 1); d.popC = 0; d.popT = 0; ballAt(ox, oz, below); };
  const hold = () => { d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.p.set(0, 30, 0); };  // keep the quad parked while the ball settles on it
  const earns = (ox, oz, below) => { place(ox, oz, below); const e0 = earnEv; run(.05, hold); return {earned: d.popC > 0, ev: earnEv - e0}; };
  // the old rule (before pop-strict): the contact point (straight under the ball on a flat top) inside the motor polygon, inset 10%
  const oldRule = (x, z) => { const M = d.popM; let sg = 0; for (let i = 0; i < M.length; i++) { const A = M[i], B = M[(i + 1) % M.length], cr = (B[0] - A[0]) * .9 * (z - A[2] * .9) - (B[2] - A[2]) * .9 * (x - A[0] * .9); const s = cr > 0 ? 1 : -1; if (sg && s !== sg) return false; sg = s; } return true; };
  const out = {loadouts: {}};
  const LOS = [STOCK, ['truex', 'stock', 'stock', 'none'], ['stretch', 'stock', 'stock', 'none'], ['deadcat', 'stock', 'stock', 'none'], ['squash', 'stock', 'stock', 'none'],
    ['stock', 'plank', 'stock', 'none'], ['stock', 'pod', 'stock', 'none'], ['stock', 'stock', 'lr', 'none'], ['squash', 'brick', 'punch', 'none']];
  for (const lo of LOS) { d.setLoadout(lo); const M = d.popM, [cx, cz] = d.popO, R = d.popR, e = D.popF(d) - R, o = {reach: +R.toFixed(3), sweet: +e.toFixed(3)};
    o.centre = earns(cx, cz).earned;
    // the sweet spot's edge along direction u: how far the ball's centre can go before some motor leaves its footprint (radius f)
    const f = D.popF(d), edge = (ux, uz) => Math.min(...M.map(m => { const wx = m[0] - cx, wz = m[2] - cz, k = wx * ux + wz * uz; return k + Math.sqrt(k * k - wx * wx - wz * wz + f * f); }));
    const dirs = [...M.map(m => { const l = Math.hypot(m[0] - cx, m[2] - cz); return [(m[0] - cx) / l, (m[2] - cz) / l]; }), [1, 0], [-1, 0], [0, 1], [0, -1]];  // toward each motor, then right, left, back, forward
    o.edges = dirs.map(([ux, uz]) => +edge(ux, uz).toFixed(2));
    o.inside = dirs.every(([ux, uz]) => { const l = edge(ux, uz) * .8; return earns(cx + ux * l, cz + uz * l).earned; });
    o.outside = dirs.map(([ux, uz]) => { const l = edge(ux, uz) * 1.25; return earns(cx + ux * l, cz + uz * l).earned; });
    // near one motor: the ball 60% of the way out to motor 0
    const nx = cx + (M[0][0] - cx) * .6, nz = cz + (M[0][2] - cz) * .6, nr = earns(nx, nz); o.nearMotor = nr.earned; o.nearMotorEv = nr.ev; o.nearMotorOldRule = oldRule(nx, nz);
    o.below = earns(cx, cz, true).earned;
    o.ok = o.centre && o.inside && o.outside.every(x => !x) && !o.nearMotor && !o.nearMotorEv && o.nearMotorOldRule && !o.below;
    out.loadouts[lo.slice(0, 3).join('/')] = o; }
  d.setLoadout(STOCK);
  const motor = Math.max(...d.popM.map(m => Math.hypot(m[0], m[2])));
  out.earnCentre = earns(0, 0).earned && d.popC > 4.5;
  out.earnOutside = earns(motor * .85, motor * .85).earned;
  out.earnBelow = earns(0, 0, true).earned;
  // earned centred, the pop is kept while the ball rolls off centre (it is spent or runs out, never taken away)
  place(0, 0); run(.05, hold); ballAt(motor * .4, 0); run(.05, hold); out.keptOffCentre = d.popC > 4;
  place(0, 0); run(.05, hold); out.noDirection = d.tryPop([0, 0, 0]) === false && d.popC > 0;
  // locked pitch-forward pop: turn rate, sticks ignored, back to the start attitude after POP_D
  const q0 = d.q.clone(); out.popped = d.tryPop([0, .9, 0]); let wMid = 0;
  run(D.POP_D * .5, () => { d.wt.set(9, 9, 9); }); wMid = d.w.x; run(D.POP_D * .6 + .02);
  out.turnRate = +(wMid / D.POP_W).toFixed(2); out.backToStart = +(2 * Math.acos(Math.min(1, Math.abs(d.q.dot(q0)))) * 180 / Math.PI).toFixed(2); out.unlocked = !(d.popT > 0); out.spent = d.popC === 0;
  // ball pops: earned centred, then the ball moved to where it sits when the pop fires: the same pitch-forward pop from front, centre, back
  const earnThen = (ox, oz) => { place(0, 0); run(.05, hold); ballAt(ox, oz); run(.02, hold); return d.popC > 0; };
  out.pops = {};
  for (const [name, oz] of [['front', -.45], ['centre', 0], ['back', .45]]) {
    const had = earnThen(0, oz * motor); d.tryPop([0, .9, 0]); run(D.POP_D + .1);
    out.pops[name] = {had, v: [ball.v.x, ball.v.y, ball.v.z].map(v => +v.toFixed(1)), speed: +ball.v.length().toFixed(1)};
  }
  place(0, 0); d.q.setFromAxisAngle(new (d.p.constructor)(0, 1, 0), Math.PI / 2); run(.05, () => { hold(); d.q.setFromAxisAngle(new (d.p.constructor)(0, 1, 0), Math.PI / 2); }); d.tryPop([0, .9, 0]); run(D.POP_D + .1);
  out.pops.centreYawed90 = {v: [ball.v.x, ball.v.y, ball.v.z].map(v => +v.toFixed(1))};
  place(0, 0); run(.05, hold); d.tryPop([.9, 0, 0]); run(D.POP_D + .1); out.pops.rollRight = {v: [ball.v.x, ball.v.y, ball.v.z].map(v => +v.toFixed(1))};
  { const had = earnThen(-.45 * motor, 0); d.tryPop([.9, 0, 0]); run(D.POP_D + .1); out.pops.rollRightFarSide = {had, v: [ball.v.x, ball.v.y, ball.v.z].map(v => +v.toFixed(1))}; }  // roll pop with the ball on the far side: more up
  return out;
});
r.errors = errs; const {loadouts, ...rest} = r; for (const [k, o] of Object.entries(loadouts)) console.log(k.padEnd(20), JSON.stringify(o)); console.log(JSON.stringify(rest));
const P = r.pops, sym = Math.abs(P.centre.v[0]) < .5 && Math.abs(P.centreYawed90.v[2]) < .5 && Math.abs(P.rollRight.v[2]) < .5 && Math.abs(P.centreYawed90.v[0] - P.centre.v[2]) < .5;  // straight pops go straight, whatever the heading
const dirs = ['front', 'centre', 'back'].every(k => P[k].v[1] > 0 && P[k].v[2] < 0) && P.rollRight.v[0] > 0 && P.rollRight.v[1] > 0;  // pitch-forward pops go up and forward, roll-right goes up and right
const place = P.front.had && P.back.had && P.rollRightFarSide.had && P.front.v[2] < P.back.v[2] && P.back.v[1] > P.front.v[1] && P.rollRightFarSide.v[1] > P.rollRight.v[1];  // ball at the front: flatter and further; at the back: higher (the lob); far side of a roll: higher
const los = Object.entries(r.loadouts), losOk = los.every(([, o]) => o.ok);
for (const [k, o] of los) if (!o.ok) console.log('loadout failed:', k, JSON.stringify(o));
const ok = dirs && sym && place && losOk && r.earnCentre && !r.earnOutside && !r.earnBelow && r.keptOffCentre && r.noDirection && r.popped && Math.abs(r.turnRate) > .9 && r.backToStart < .5 && r.unlocked && r.spent && !errs.length;
console.log(ok ? 'POP CHECK PASSED' : 'POP CHECK FAILED'); await b.close(); await server.close(); process.exit(ok ? 0 : 1);
