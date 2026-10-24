/* Intercept check: does the aim point the HUD draws match where you actually meet the track? Headless, one browser, sim-stepped.
   For each case a track flies a scripted path (straight, a steady turn, a fast missile) and a scripted interceptor flies straight at the
   current pip at a fixed speed, re-aimed every tick (what a pilot following the pip does). It records the pip every tick, then finds the
   closest approach and compares, at 20 / 10 / 5 / 2 s before it: the pip against the track's position at closest approach (the actual meet
   point) and the time-to-go against the real remaining time. Also the miss distance (interceptor to track at closest approach).
   The aim point is Zombies' lock-on intercept overlay (zlock.js, Z.lk.ip / tti).
   Run: node tools/intercept-check.mjs
   Exits 1 when a steady case is off by more than TOL metres or the interceptor misses by more than TOL. */
import {serve, launch, open, frames} from './zlib.mjs';
const TOL = 5;
const {server, origin} = await serve(); const browser = await launch({w: 640, h: 360});
const CASES = [
  {n: 'straight Shahed, 100 m/s', k: 'straight', s: 100, steady: 1},
  {n: 'straight Shahed, 70 m/s', k: 'straight', s: 70, steady: 1},
  {n: 'turning jet (1.5 km radius)', k: 'turn', s: 110},
  {n: 'fast missile, head-on', k: 'missile', s: 100, steady: 1}];
async function run() {
  const errs = [], p = await open(browser, origin + '/games/interceptor/', errs, {w: 640, h: 360});
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({wx: 'clear', zwx: 'menu', zmus: 0})));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 120000});
  await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 60000});
  const out = [];
  for (const C of CASES) out.push(await p.evaluate(C => { const {api, G, Z} = __z, V = api.THREE.Vector3, me = api.player, dt = 1 / 120;
    if (G.state === 'base') __z.cont(); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    const t = __z.make(C.k === 'missile' ? 'ballistic' : 'shahed', 0, -2000);
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
    api.pickT = t; Z.lk.force(t); let relock = 0;
    const read = () => Z.lk.t === t ? {p: Z.lk.ip.clone(), tau: Z.lk.tti} : null;
    const rec = []; let best = 1e9, bi = -1, aim = null;
    for (let i = 0; i < 120 * 150; i++) {
      const pp = aim ? aim.p : t.p; Vk.subVectors(pp, P).setLength(C.s);
      me.p.copy(P); me.v.copy(Vk); me.q.setFromUnitVectors(new V(0, 1, 0), Vk.clone().normalize()); me.w.set(0, 0, 0); me.dead = 0;
      api.step(dt); P.addScaledVector(Vk, dt); me.p.copy(P);
      if (Z.lk.t !== t && api.live(t)) { Z.lk.force(t); relock++; }
      aim = read(); const d = P.distanceTo(t.p); rec.push({t: i * dt, pip: aim ? aim.p.clone() : null, tau: aim ? aim.tau : null, tp: t.p.clone(), mp: P.clone()});
      if (d < best) { best = d; bi = i; } else if (bi >= 0 && i - bi > 240) break;
      if (!api.live(t)) break; }  /* killed (the warhead fires on contact): that tick is the meet */
    Z.tstep = ts0; if (sc0) Z.sightCam = sc0; else delete Z.sightCam;
    const cpa = rec[bi], T = cpa.t, chk = [20, 10, 5, 2].map(c => { const r = rec[Math.round((T - c) / dt)]; if (!r || !r.pip) return null;
      return {c, pip: +r.pip.distanceTo(cpa.tp).toFixed(1), tt: +Math.abs(r.tau - c).toFixed(2)}; });
    for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0;
    return {n: C.n, steady: !!C.steady, T: +T.toFixed(1), miss: +best.toFixed(2), chk, relock}; }, C));
  /* the drawn marker, in real frames (the camera and the bodies interpolated between ticks): every frame the overlay draws the label, the
     camera it projected with must be the camera that frame renders with, and the label must sit on the projection of the world point it was
     given through that camera. Each label is paired with its own frame's render (renderer.render is hooked), so a later frame (the drone
     down, the view changed) can't be mistaken for it. */
  const scr = [];
  for (const cm of [0, 1, 2]) {
    await p.evaluate(cm => { const {api, G, Z} = __z, V = api.THREE.Vector3, me = api.player;
      for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
      const t = __z.make('shahed', 0, -2000); me.p.set(0, api.gh(0, 1000) + 400, 1000); t.p.set(600, me.p.y + 60, -4000); t.v.set(-51, 0, 0); const dir = t.p.clone().sub(me.p).normalize(); me.v.copy(dir).multiplyScalar(100); me.q.setFromUnitVectors(new V(0, 1, 0), dir); me.w.set(0, 0, 0); me.dead = 0; api.camUp = true;  /* nose and the tilted-up camera on the track */
      api.pickT = t; Z.lk.force(t); api.camMode = cm;
      const C2 = CanvasRenderingContext2D.prototype, R = api.renderer;
      if (!C2.__ft0) { C2.__ft0 = C2.fillText; C2.fillText = function (s, x, y) { if (/^(PIP|INTERCEPT)/.test(s) && window.__pend !== undefined) { const c = __z.api.camera, w = __z.Z.lk.ip;
        window.__pend = {s, x, y, cam: [...c.matrixWorldInverse.elements], pm: [...c.projectionMatrix.elements], w: w ? [w.x, w.y, w.z] : null}; } return C2.__ft0.apply(this, arguments); }; }
      if (!R.__r0) { R.__r0 = R.render; R.render = function (sc, ca) { if (ca === __z.api.camera && window.__pend) { const P = window.__pend; window.__pend = null; ca.updateMatrixWorld();
        P.rcam = [...ca.matrixWorldInverse.elements]; P.rpm = [...ca.projectionMatrix.elements]; window.__pairs.push(P); } return R.__r0.apply(this, arguments); }; }
      window.__pairs = []; window.__pend = null; }, cm);
    await frames(p, cm === 1 ? 45 : 6);  /* the chase camera eases onto a new heading over many frames */
    scr.push(await p.evaluate(cm => { const {api} = __z, M4 = api.THREE.Matrix4, V = api.THREE.Vector3, P = window.__pairs; window.__pend = undefined;
      if (!P.length) return {cm, none: true};
      let cam = 0, px = 0, n = 0, on = 0;
      for (const L of P) { if (!L.w) continue; n++; cam = Math.max(cam, ...L.cam.map((v, i) => Math.abs(v - L.rcam[i])), ...L.pm.map((v, i) => Math.abs(v - L.rpm[i])));
        const q = new V(...L.w).applyMatrix4(new M4().fromArray(L.rcam)).applyMatrix4(new M4().fromArray(L.rpm)), X = (q.x * .5 + .5) * innerWidth, Y = (-q.y * .5 + .5) * innerHeight;
        if (q.z < 1 && Math.abs(q.x) < .95 && Math.abs(q.y) < .92) { on++; px = Math.max(px, Math.abs(L.x - X), Math.abs(L.y - 30 - Y)); } }
      return {cm, frames: n, on, cam: +cam.toExponential(2), px: +px.toFixed(2)}; }, cm));
  }
  await p.close(); return {out, errs, scr};
}
let bad = 0;
{
  const {out, errs, scr} = await run();
  console.log('\nZombies lock-on intercept overlay');
  for (const r of out) { const line = r.chk.map(c => c ? `${c.c}s: pip ${c.pip} m, ttg ${c.tt} s` : '-').join(' | ');
    const worst = Math.max(...r.chk.filter(Boolean).map(c => c.pip)), fail = r.steady && (worst > TOL || r.miss > TOL); if (fail) bad++;
    console.log(`  ${fail ? 'FAIL' : 'ok  '} ${r.n.padEnd(28)} meets after ${r.T} s, miss ${r.miss} m | ${line}${r.relock ? ` (lock re-forced ${r.relock}x)` : ''}`); }
  for (const r of scr) { const vn = ['FPV', 'chase', 'threat cam'][r.cm], fail = !r.none && (r.cam > 1e-6 || r.px > 1.5); if (fail) bad++;
    console.log(`  ${fail ? 'FAIL' : 'ok  '} drawn in ${vn}: ${r.none ? 'no label drawn' : `${r.frames} frames, overlay camera vs that frame's render camera off by ${r.cam}, label within ${r.px} px of the projected point (${r.on} frames on screen)`}`); }
  if (errs.length) { bad++; console.log('  errors: ' + errs.slice(0, 3).join(' | ')); }
}
await browser.close(); server.close();
console.log(bad ? `${bad} problem(s)` : 'all steady cases within ' + TOL + ' m');
process.exit(bad ? 1 : 0);
