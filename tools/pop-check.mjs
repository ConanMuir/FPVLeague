// Pop mechanic check: earning (top, inside the motors), the direction rule, the locked turn returning to the start attitude,
// and that where the ball sits on the quad changes the pop. Runs the real modules in headless Edge through the Vite dev server.
//   node tools/pop-check.mjs
import puppeteer from 'puppeteer-core';
const {createServer} = await import('vite');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await puppeteer.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, env, args: ['--ignore-gpu-blocklist']});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(server.resolvedUrls.local[0] + 'app.html');  // the root index.html is the games launcher await new Promise(r => setTimeout(r, 6000));
const r = await p.evaluate(async () => {
  const DF = await import('/src/modes/dogfight.js'), MA = await import('/src/modes/match.js'), {GS} = await import('/src/state.js'), ST = await import('/src/modes/step.js'),
    {ball} = await import('/src/physics/ball.js'), T = await import('/src/config/tune.js'), D = await import('/src/flight/drone.js');
  DF.setGame('free'); MA.startMatch(); GS.paused = true; GS.state = 'play'; GS.menuOpen = false;
  const d = GS.player, dt = 1 / 120, BR = T.BR, top = Math.max(...d.lo.colliders.map(c => c.pos[1] + (c.shape === 'box' ? c.size[1] : c.shape === 'sphere' ? c.size[0] : c.size[0])));  // the real top of the parts
  const run = (s, f) => { for (let i = 0; i < s * 120; i++) { f?.(i); ST.step(dt); } };
  const place = (ox, oz, below) => { d.p.set(0, 30, 0); d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.wt.set(0, 0, 0); d.q.set(0, 0, 0, 1); d.popC = 0; d.popT = 0;
    ball.p.set(ox, below ? 30 - top - BR + .05 : 30 + top + BR - .05, oz); ball.v.set(0, 0, 0); };
  const hold = () => { d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.p.set(0, 30, 0); };  // keep the quad parked while the ball settles on it
  const out = {};
  place(0, 0); run(.05, hold); out.earnCentre = d.popC > 4.5;
  const motor = Math.max(...d.popM.map(m => Math.hypot(m[0], m[2])));
  place(motor * .85, motor * .85); run(.05, hold); out.earnOutside = d.popC > 0;
  place(0, 0, true); run(.05, hold); out.earnBelow = d.popC > 0;
  place(0, 0); run(.05, hold); out.noDirection = d.tryPop([0, 0, 0]) === false && d.popC > 0;
  // locked pitch-forward pop: turn rate, sticks ignored, back to the start attitude after POP_D
  const q0 = d.q.clone(); out.popped = d.tryPop([0, .9, 0]); let wMid = 0;
  run(D.POP_D * .5, () => { d.wt.set(9, 9, 9); }); wMid = d.w.x; run(D.POP_D * .6 + .02);
  out.turnRate = +(wMid / D.POP_W).toFixed(2); out.backToStart = +(2 * Math.acos(Math.min(1, Math.abs(d.q.dot(q0)))) * 180 / Math.PI).toFixed(2); out.unlocked = !(d.popT > 0); out.spent = d.popC === 0;
  // ball pops: the same pitch-forward pop from three placements along the quad (front, centre, back)
  out.pops = {};
  for (const [name, oz] of [['front', -.45], ['centre', 0], ['back', .45]]) {
    place(0, oz * motor); run(.05, hold); d.tryPop([0, .9, 0]); run(D.POP_D + .1);
    out.pops[name] = {v: [ball.v.x, ball.v.y, ball.v.z].map(v => +v.toFixed(1)), speed: +ball.v.length().toFixed(1)};
  }
  place(0, 0); d.q.setFromAxisAngle(new (d.p.constructor)(0, 1, 0), Math.PI / 2); run(.05, () => { hold(); d.q.setFromAxisAngle(new (d.p.constructor)(0, 1, 0), Math.PI / 2); }); d.tryPop([0, .9, 0]); run(D.POP_D + .1);
  out.pops.centreYawed90 = {v: [ball.v.x, ball.v.y, ball.v.z].map(v => +v.toFixed(1))};
  place(0, 0); run(.05, hold); d.tryPop([.9, 0, 0]); run(D.POP_D + .1); out.pops.rollRight = {v: [ball.v.x, ball.v.y, ball.v.z].map(v => +v.toFixed(1))};
  return out;
});
r.errors = errs; console.log(JSON.stringify(r, null, 1));
const sym = Math.abs(r.pops.centre.v[0]) < .5 && Math.abs(r.pops.centreYawed90.v[2]) < .5 && Math.abs(r.pops.rollRight.v[2]) < .5 && Math.abs(r.pops.centreYawed90.v[0] - r.pops.centre.v[2]) < .5;  // straight pops go straight, whatever the heading
const dirs = ['front', 'centre', 'back'].every(k => r.pops[k].v[1] > 0 && r.pops[k].v[2] < 0) && r.pops.rollRight.v[0] > 0 && r.pops.rollRight.v[1] > 0;  // pitch-forward pops go up and forward, roll-right goes up and right
const ok = dirs && sym && r.earnCentre && !r.earnOutside && !r.earnBelow && r.noDirection && r.popped && Math.abs(r.turnRate) > .9 && r.backToStart < .5 && r.unlocked && r.spent && !errs.length;
console.log(ok ? 'POP CHECK PASSED' : 'POP CHECK FAILED'); await b.close(); await server.close(); process.exit(ok ? 0 : 1);
