/* Intercept check: does the aim point the HUD draws match where you actually meet the track? Headless, one browser, sim-stepped.
   For each case a track flies a scripted path (straight, a steady turn, a fast missile) and a scripted interceptor flies straight at the
   current pip at a fixed speed, re-aimed every tick (what a pilot following the pip does). It records the pip every tick, then finds the
   closest approach and compares, at 20 / 10 / 5 / 2 s before it: the pip against the track's position at closest approach (the actual meet
   point) and the time-to-go against the real remaining time. Also the miss distance (interceptor to track at closest approach).
   Classic: the midcourse guidance PIP (interceptor.js, api.pip). Zombies: the lock-on intercept overlay (zlock.js, Z.lk.ip / tti).
   Run: node tools/intercept-check.mjs [--old]   (--old: Classic's PIP from the pre-fix formula, replicated here, for comparison)
   Exits 1 when a steady case is off by more than TOL metres or the interceptor misses by more than TOL. */
import {serve, launch, open, frames} from './zlib.mjs';
const OLD = process.argv.includes('--old'), TOL = 5;
const {server, origin} = await serve(); const browser = await launch({w: 640, h: 360});
const CASES = [
  {n: 'straight Shahed, 100 m/s', k: 'straight', s: 100, steady: 1},
  {n: 'straight Shahed, 70 m/s', k: 'straight', s: 70, steady: 1},
  {n: 'turning jet (1.5 km radius)', k: 'turn', s: 110},
  {n: 'fast missile, head-on', k: 'missile', s: 100, steady: 1}];
async function run(mode) {
  const errs = [], p = await open(browser, origin + '/games/interceptor/', errs, {w: 640, h: 360});
  await p.evaluate(m => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: m, wx: 'clear', zwx: 'menu', zmus: 0, guide: 1, fuse: 'manual'})), mode === 'z' ? 'z' : 'classic');
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 120000});
  await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 60000});
  const out = [];
  for (const C of CASES) out.push(await p.evaluate((C, mode, OLD) => { const {api, G, Z} = __z, V = api.THREE.Vector3, me = api.player, dt = 1 / 120;
    if (mode === 'z') { if (G.state === 'base') __z.cont(); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); }
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    const t = __z.make(C.k === 'missile' && mode === 'z' ? 'ballistic' : 'shahed', 0, -2000);
    /* scripted motions; the interceptor starts at P0 */
    const P0 = new V(0, api.gh(0, 1000) + 400, 1000), P = P0.clone(), Vk = new V();
    if (C.k === 'straight') { t.p.set(2600, P0.y + 120, -2400); t.v.set(-51, 0, 0); }
    if (C.k === 'turn') { t.p.set(2600, P0.y + 200, -2600); t.v.set(-92, 0, 0); }
    if (C.k === 'missile') { t.p.set(7000, P0.y + 4000, -7000); t.v.copy(new V(0, 0, 0).sub(new V(7000, 4000, -8000)).setLength(900)); }
    const w = C.k === 'turn' ? 92 / 1500 : 0;
    t.__kin = dt2 => { if (w) t.v.applyAxisAngle(new V(0, 1, 0), w * dt2); t.p.addScaledVector(t.v, dt2); };
    const ts0 = Z.tstep; Z.tstep = (u, d) => u.__kin ? (u.__kin(d), true) : ts0(u, d);
    /* the test pilot keeps its sights on the track (its own camera: headless steps never move the view camera) */
    const sc0 = Z.sightCam, SQ = {position: P, quaternion: new api.THREE.Quaternion()}; Z.sightCam = () => (SQ.quaternion.setFromUnitVectors(new V(0, 0, -1), t.p.clone().sub(P).normalize()), SQ);
    api.pickT = t; if (mode === 'z') Z.lk.force(t); let relock = 0;
    /* the pre-fix Classic PIP, replicated: radar velocity flattened, at least 95 m/s, 60 m into the track's six */
    const old = () => { const tv = new V(t.v.x, 0, t.v.z), vh = tv.clone().normalize(), vi = Math.max(me.v.length(), 95), pip = new V(); let tau = t.p.distanceTo(me.p) / vi;
      for (let i = 0; i < 6; i++) { pip.copy(t.p).addScaledVector(tv, tau).addScaledVector(vh, -60); tau = Math.min(150, pip.distanceTo(me.p) / vi); } return {p: pip, tau}; };
    const read = () => mode === 'z' ? (Z.lk.t === t ? {p: Z.lk.ip.clone(), tau: Z.lk.tti} : null) : OLD ? old() : api.pip ? {p: api.pip.p.clone(), tau: api.pip.tau} : null;
    const rec = []; let best = 1e9, bi = -1, aim = null;
    for (let i = 0; i < 120 * 150; i++) {
      const pp = aim ? aim.p : t.p; Vk.subVectors(pp, P).setLength(C.s);
      me.p.copy(P); me.v.copy(Vk); me.q.setFromUnitVectors(new V(0, 1, 0), Vk.clone().normalize()); me.w.set(0, 0, 0); me.dead = 0;
      api.step(dt); P.addScaledVector(Vk, dt); me.p.copy(P);
      if (mode === 'z' && Z.lk.t !== t && api.live(t)) { Z.lk.force(t); relock++; }
      aim = read(); const d = P.distanceTo(t.p); rec.push({t: i * dt, pip: aim ? aim.p.clone() : null, tau: aim ? aim.tau : null, tp: t.p.clone(), mp: P.clone()});
      if (d < best) { best = d; bi = i; } else if (bi >= 0 && i - bi > 240) break;
      if (!api.live(t)) break; }  /* killed (the warhead fires on contact): that tick is the meet */
    Z.tstep = ts0; if (sc0) Z.sightCam = sc0; else delete Z.sightCam;
    const cpa = rec[bi], T = cpa.t, chk = [20, 10, 5, 2].map(c => { const r = rec[Math.round((T - c) / dt)]; if (!r || !r.pip) return null;
      return {c, pip: +r.pip.distanceTo(cpa.tp).toFixed(1), tt: +Math.abs(r.tau - c).toFixed(2)}; });
    for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0;
    return {n: C.n, steady: !!C.steady, T: +T.toFixed(1), miss: +best.toFixed(2), chk, relock}; }, C, mode, OLD));
  /* the drawn marker: real frames (the camera and the bodies interpolated between ticks), the label the overlay draws next to the point
     against the projection of the same world point through that frame's camera, in each view */
  const scr = [];
  for (const cm of mode === 'z' ? [0, 1, 2] : [1, 2]) {
    await p.evaluate((mode, cm) => { const {api, G, Z} = __z, V = api.THREE.Vector3, me = api.player;
      for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; if (mode === 'z') { G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); }
      const t = __z.make('shahed', 0, -2000); me.p.set(0, api.gh(0, 1000) + 400, 1000); t.p.set(600, me.p.y + 60, -4000); t.v.set(-51, 0, 0); const dir = t.p.clone().sub(me.p).normalize(); me.v.copy(dir).multiplyScalar(100); me.q.setFromUnitVectors(new V(0, 1, 0), dir); me.w.set(0, 0, 0); me.dead = 0; api.camUp = true;  /* nose and the tilted-up camera on the track */
      api.pickT = t; if (mode === 'z') Z.lk.force(t); api.camMode = cm;
      const C2 = CanvasRenderingContext2D.prototype; if (!C2.__ft0) { C2.__ft0 = C2.fillText; C2.fillText = function (s, x, y) { if (/^(PIP|INTERCEPT)/.test(s)) window.__lbl = {s, x, y}; return C2.__ft0.apply(this, arguments); }; }
      window.__lbl = null; }, mode, cm);
    await frames(p, cm === 1 ? 45 : 6);  /* the chase camera eases onto a new heading over many frames */
    scr.push(await p.evaluate((mode, cm) => { const {api, Z} = __z, L = window.__lbl, w = mode === 'z' ? Z.lk.ip : api.pip?.p; if (!L || !w) return {cm, none: true};
      const q = w.clone().project(api.camera), X = (q.x * .5 + .5) * innerWidth, Y = (-q.y * .5 + .5) * innerHeight, on = q.z < 1 && Math.abs(q.x) < .95 && Math.abs(q.y) < .92;
      return {cm, on, dx: +Math.abs(L.x - X).toFixed(2), dy: +Math.abs(L.y - (mode === 'z' ? 30 : 26) - Y).toFixed(2)}; }, mode, cm));
  }
  await p.close(); return {out, errs, scr};
}
let bad = 0;
for (const mode of ['classic', 'z']) {
  const {out, errs, scr} = await run(mode);
  console.log(`\n${mode === 'z' ? 'Zombies lock-on intercept overlay' : 'Classic midcourse PIP' + (OLD ? ' (pre-fix formula)' : '')}`);
  for (const r of out) { const line = r.chk.map(c => c ? `${c.c}s: pip ${c.pip} m, ttg ${c.tt} s` : '-').join(' | ');
    const worst = Math.max(...r.chk.filter(Boolean).map(c => c.pip)), fail = r.steady && (worst > TOL || r.miss > TOL); if (fail) bad++;
    console.log(`  ${fail ? 'FAIL' : 'ok  '} ${r.n.padEnd(28)} meets after ${r.T} s, miss ${r.miss} m | ${line}${r.relock ? ` (lock re-forced ${r.relock}x)` : ''}`); }
  for (const r of scr) { const vn = ['FPV', 'chase', 'threat cam'][r.cm], fail = !r.none && r.on && (r.dx > 2 || r.dy > 2); if (fail) bad++;
    console.log(`  ${fail ? 'FAIL' : 'ok  '} drawn in ${vn}: ${r.none ? 'no label drawn (off screen)' : r.on ? `label ${r.dx} / ${r.dy} px from the projected point` : 'point off screen (edge arrow)'}`); }
  if (errs.length) { bad++; console.log('  errors: ' + errs.slice(0, 3).join(' | ')); }
}
await browser.close(); server.close();
console.log(bad ? `${bad} problem(s)` : 'all steady cases within ' + TOL + ' m');
process.exit(bad ? 1 : 0);
