// touch and pop rings: a circle at the contact between a quad and the ball, so every touch and pop reads from the chase cam
// and FPV, whoever made it (player, bot or remote pilot).
//  - 'hit'  : a ball touch with a real kick (the ball's velocity jumps by HIT_DV m/s or more next to a drone): white, quick
//  - 'earn' : a pop earned (the ball on top, inside the motors; the 'popEarn' event from modes/step.js): bright white, a little longer
//  - 'pop'  : a pop spent (any drone's popT starts): gold, larger, with a second ring a beat later
// Hits are detected here from the ball's velocity each frame, so they also show for remote pilots' touches on any screen.
// Rings never shrink below MIN_SCR of the camera distance, and draw over the ball and frame (no depth test).
import * as THREE from 'three';
import {BR} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
import {ballMesh} from './ball.js';
import {onEv} from '../core/events.js';
import {camera, scene} from './renderer.js';
const N = 12, Z = new THREE.Vector3(0, 0, 1), HIT_DV = 4, MIN_SCR = .045;
const KIND = {hit: {c: 0xffffff, o: .75, t: .35, w: .78, g: .9}, earn: {c: 0xe8fbff, o: .9, t: .55, w: .7, g: .7}, pop: {c: 0xffc640, o: .95, t: .7, w: .66, g: 1.6}};
const geo = {}; for (const k in KIND) geo[k] = new THREE.RingGeometry(KIND[k].w, 1, 64);
const R = Array.from({length: N}, () => { const m = new THREE.Mesh(geo.hit, new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false}));
  m.visible = false; m.renderOrder = 10; m.frustumCulled = false; scene.add(m); return {m, t: 0, d: 0, k: null, r: 1, s: 1, q: new THREE.Quaternion(), off: new THREE.Vector3(), fol: false}; });
let ri = 0;
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _vb = new THREE.Vector3(), _lv = new THREE.Vector3(), lastHit = new WeakMap(), popWas = new WeakMap();
// p: centre, n: facing (the contact normal), r: radius (m), kind: 'hit' | 'earn' | 'pop', delay: seconds before it shows
export function popFx(p, n, r, kind = 'earn', delay = 0) {
  const K = KIND[kind] || KIND.earn, e = R[ri++ % N]; e.m.geometry = geo[kind] || geo.earn; e.m.material.color.setHex(K.c); e.m.position.copy(p);
  e.q.setFromUnitVectors(Z, _n.copy(n).normalize()); e.m.quaternion.copy(e.q); e.k = K; e.r = r; e.s = 1; e.t = K.t; e.d = delay; e.m.visible = false; e.fol = kind === 'earn'; e.off.subVectors(p, ball.p); }  // an earned pop's ring rides under the ball
onEv('popEarn', e => popFx(e.p, e.n, e.r));  // a pop earned (modes/step.js)
// a quad touched the ball: ring at the contact point, facing along drone -> ball
function touchRing(d, kind) { _n.subVectors(ball.p, d.p); if (_n.lengthSq() < 1e-6) _n.set(0, 1, 0); _n.normalize(); _p.copy(ball.p).addScaledVector(_n, -BR);
  popFx(_p, _n, BR * (kind === 'pop' ? 1.05 : .8), kind); if (kind === 'pop') popFx(_p, _n, BR * 1.05, 'pop', .14); }
export function popTick(dt) {
  if (!GS.OBSON && ballMesh.visible) {
    const dv = _vb.subVectors(ball.v, _lv).length(); _lv.copy(ball.v); const now = performance.now();
    for (const d of GS.drones) {  // pops spent (players and bots): always a ring, at the ball or on the quad; remote pilots' pops show as their hit
      const on = d.popT > 0; if (on && !popWas.get(d) && d.dead <= 0) { if (d.p.distanceTo(ball.p) < BR + 4) touchRing(d, 'pop'); else { _n.set(0, 1, 0).applyQuaternion(d.q); popFx(_p.copy(d.p).addScaledVector(_n, .6), _n, 1.6, 'pop'); } } popWas.set(d, on); }
    if (dv > HIT_DV) { let best = null, bd = (BR + 2.5) ** 2; for (const d of GS.drones) { if (d.dead > 0) continue; const q = d.p.distanceToSquared(ball.p); if (q < bd) { bd = q; best = d; } }
      if (best && now - (lastHit.get(best) || 0) > 150) { lastHit.set(best, now); if (!(best.popT > 0)) touchRing(best, 'hit'); } } }
  for (const e of R) { if (e.t <= 0) continue; if (e.d > 0) { e.d -= dt; continue; } e.t -= dt; const f = Math.max(0, e.t / e.k.t); if (e.fol) e.m.position.addVectors(ball.p, e.off);
    e.s *= 1 + dt * e.k.g; const dist = camera.position.distanceTo(e.m.position), min = dist * MIN_SCR; e.m.scale.setScalar(Math.max(e.r * e.s, min * e.s));
    e.m.quaternion.copy(e.q).slerp(camera.quaternion, Math.min(1, Math.max(0, (dist - 12) / 30)));  // far away it turns to face the camera, so it never reads edge-on
    e.m.material.opacity = e.k.o * f * f * (3 - 2 * f) * Math.min(1, Math.max(.3, (dist - 1.5) / 5)); e.m.visible = e.t > 0; }  // right in front of the camera (your own pop in FPV) it stays see-through
}
