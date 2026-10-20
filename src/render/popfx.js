// pop rings: a circle at the contact between a quad and the ball when a pop is earned or fired, so pops read from the chase cam
// and FPV, whoever made it (player or bot). Ordinary touches, however hard, get no ring (effects.js still flashes hard hits).
//  - 'earn' : a pop earned (the ball on top, centred over all the motors; the 'popEarn' event from modes/step.js): a thick cyan ring
//             under the ball that rides with it, then a thinner echo
//  - 'pop'  : a pop fired (the 'popFire' event from flight/drone.js): gold, larger, with a second ring a beat later
// Both come from onFx listeners, so goal replays and the kill cam (render/replay.js) show them too. Remote pilots' pops are not sent
// over the network, so they show no ring on other screens.
// Rings never shrink below MIN_SCR of the camera distance, and draw over the ball and frame (no depth test).
import * as THREE from 'three';
import {BR} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
import {ballMesh} from './ball.js';
import {onFx} from '../core/events.js';
import {camera, scene} from './renderer.js';
const N = 12, Z = new THREE.Vector3(0, 0, 1), MIN_SCR = .045;
const KIND = {earn: {c: 0x3ee6ff, o: 1, t: .8, w: .6, g: .55}, echo: {c: 0x3ee6ff, o: .7, t: .5, w: .82, g: 1.4}, pop: {c: 0xffc640, o: .95, t: .7, w: .66, g: 1.6}};
const geo = {}; for (const k in KIND) geo[k] = new THREE.RingGeometry(KIND[k].w, 1, 64);
const R = Array.from({length: N}, () => { const m = new THREE.Mesh(geo.earn, new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false}));
  m.visible = false; m.renderOrder = 10; m.frustumCulled = false; scene.add(m); return {m, t: 0, d: 0, k: null, r: 1, s: 1, q: new THREE.Quaternion(), off: new THREE.Vector3(), fol: false}; });
let ri = 0;
const _p = new THREE.Vector3(), _n = new THREE.Vector3();
// p: centre, n: facing (the contact normal), r: radius (m), kind: 'earn' | 'echo' | 'pop', delay: seconds before it shows
export function popFx(p, n, r, kind = 'earn', delay = 0) {
  const K = KIND[kind] || KIND.earn, e = R[ri++ % N]; e.m.geometry = geo[kind] || geo.earn; e.m.material.color.setHex(K.c); e.m.position.copy(p);
  e.q.setFromUnitVectors(Z, _n.copy(n).normalize()); e.m.quaternion.copy(e.q); e.k = K; e.r = r; e.s = 1; e.t = K.t; e.d = delay; e.m.visible = false; e.fol = kind !== 'pop'; e.off.subVectors(p, ball.p); }  // an earned pop's ring rides under the ball
onFx('popEarn', e => { popFx(e.p, e.n, e.r); popFx(e.p, e.n, e.r * 1.1, 'echo', .16); });  // a pop earned (modes/step.js)
// a pop fired: gold rings at the contact point, facing along drone -> ball, or on the quad when the ball is not on it
function popRing(d) { if (GS.OBSON || !ballMesh.visible || !(d.dead <= 0)) return;
  if (d.p.distanceTo(ball.p) < BR + 4) { _n.subVectors(ball.p, d.p); if (_n.lengthSq() < 1e-6) _n.set(0, 1, 0); _n.normalize(); _p.copy(ball.p).addScaledVector(_n, -BR); popFx(_p, _n, BR * 1.05, 'pop'); popFx(_p, _n, BR * 1.05, 'pop', .14); }
  else { _n.set(0, 1, 0).applyQuaternion(d.q); popFx(_p.copy(d.p).addScaledVector(_n, .6), _n, 1.6, 'pop'); } }
onFx('popFire', e => popRing(e.d));  // a pop fired (flight/drone.js)
export function popTick(dt) {
  for (const e of R) { if (e.t <= 0) continue; if (e.d > 0) { e.d -= dt; continue; } e.t -= dt; const f = Math.max(0, e.t / e.k.t); if (e.fol) e.m.position.addVectors(ball.p, e.off);
    e.s *= 1 + dt * e.k.g; const dist = camera.position.distanceTo(e.m.position), min = dist * MIN_SCR; e.m.scale.setScalar(Math.max(e.r * e.s, min * e.s));
    e.m.quaternion.copy(e.q).slerp(camera.quaternion, Math.min(1, Math.max(0, (dist - 12) / 30)));  // far away it turns to face the camera, so it never reads edge-on
    e.m.material.opacity = e.k.o * f * f * (3 - 2 * f) * Math.min(1, Math.max(.3, (dist - 1.5) / 5)); e.m.visible = e.t > 0; }  // right in front of the camera (your own pop in FPV) it stays see-through
}
