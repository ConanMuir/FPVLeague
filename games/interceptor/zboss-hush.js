/* Boss: the Hush, a silent hunter that fights in total darkness. While it lives the atmosphere drops to near-black (zatmos.js), your radar fills
   with static for it and the thermal camera too (ordinary drones keep a faint presence on both, so the wave stays playable), and it has no
   bracket and no lock. You track it by ear: an HRTF-panned engine hum with doppler, the whoosh of its passes rising as it closes and falling
   away after, wind-shear when it banks, and a hull creak just before it commits to a pass (the tell). Wear headphones.
   It circles outside sight, then makes fast passes at you or a site. The only visual tell is a glint and exhaust flare at the top of each
   pass: it is open (can be hurt) while the flare burns and for a moment after the pass; any burst outside that finds nothing. A hit snaps the
   flare out and spooks it off its pass. Optional "audio assist" in the settings (default off) adds a faint direction cue to the HUD.
   WHISPER (slow passes, long windows) -> HUSH (faster, shorter windows) -> SILENCE (it cuts its engine between passes: only the whoosh
   and the creak tell you). It slips away after five minutes. Beaten: the Acoustic Array trophy.
   The sound maths is zhush-cue.js (also what the bots hear), the voices are zhush-snd.js; this file is the fight. */
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
import {AC, nbuf} from '../../engine/audio.js';
import {cue, MD} from './zhush-cue.js';
import {hushVoice, listen, stopAll, voices} from './zhush-snd.js';

/* per phase: pass speed, reveal and after-pass windows (s), circling time (s), circling radius (m), windup (the creak, s), pass damage */
const PASS = [150, 170, 190], REV = [2.8, 2.3, 1.8], AFT = [3.2, 2.7, 2.2], ORB = [[4, 7], [3, 6], [2.5, 5]], RAD = [900, 800, 700], WIND = [1.8, 1.5, 1.3], DMG = [55, 65, 75];
const COL = '#9db4d8';
const ZERO = {x: 0, y: 0, z: 0};
let _A = null, _d = null, _s = null, _t = null, _F = null, _U = null, _fc = null;  /* scratch vectors, made on first use */
const vec = C => { if (!_A) { _A = new C.V3(); _d = new C.V3(); _s = new C.V3(); _t = new C.V3(); _F = new C.V3(); _U = new C.V3(); _fc = new C.V3(); } };
const _b = {p: null, v: null, yr: 0, md: 0, wf: 0, ph: 0}, _me = {p: null, v: null, f: null, u: null}, _c = {};

/* ---------- model: a dark owl-winged flying wing with two ducted fans, a feather-scalloped hull and a dim owl-eye emblem ---------- */
function skinTex(C) { return C.decal('hs-skin', 512, 512, (g, w, h) => { g.fillStyle = '#101319'; g.fillRect(0, 0, w, h);
  for (let y = 0, r = 0; y < h + 24; y += 16, r++) for (let x = (r % 2) * 14; x < w + 28; x += 28) { g.strokeStyle = 'rgba(70,84,110,.35)'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, 14, 0, Math.PI); g.stroke(); }  /* soft feather scallops */
  C.D2.panels(g, w, h, '#05070a', 8, .4); C.D2.grime(g, w, h, .08); }); }
function eyeTex(C) { return C.decal('hs-eye', 256, 128, (g, w, h) => { for (const x of [w * .27, w * .73]) { g.fillStyle = 'rgba(26,32,46,.9)'; g.beginPath(); g.ellipse(x, h / 2, 40, 40, 0, 0, 7); g.fill();
  g.strokeStyle = 'rgba(157,180,216,.55)'; g.lineWidth = 4; g.beginPath(); g.ellipse(x, h / 2, 40, 40, 0, 0, 7); g.stroke(); g.fillStyle = 'rgba(157,180,216,.7)'; g.fillRect(x - 3, h / 2 - 30, 6, 60); }  /* slit pupils */
  C.D2.text(g, 'HUSH', w / 2, h * .9, 14, 'rgba(157,180,216,.5)', '900'); }); }
const MT = {};
function mats(C) { if (MT.skin) return MT; const T = C.THREE;
  return Object.assign(MT, {skin: new T.MeshStandardMaterial({map: skinTex(C), roughness: .95, metalness: .1}), dark: new T.MeshStandardMaterial({color: 0x0a0c10, roughness: .9, metalness: .3, side: T.DoubleSide}),
    eye: new T.MeshBasicMaterial({map: eyeTex(C), transparent: true, alphaTest: .05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2}),
    mouth: new T.MeshBasicMaterial({color: 0x020305}),
    core: new T.SpriteMaterial({map: dot, color: new T.Color(0xfff0d8).multiplyScalar(7), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false}),
    halo: new T.SpriteMaterial({map: dot, color: new T.Color(0xffa860).multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false})}); }
function model(C) { const T = C.THREE, M = mats(C), g = C.group(), m = (geo, mat, x = 0, y = 0, z = 0) => C.mesh(g, geo, mat, x, y, z, false);
  /* the wing: swept leading edge, a serrated trailing edge like owl feathers */
  const s = new T.Shape(), tip = 12, teeth = [];
  for (let i = 0; i < 6; i++) { const x = tip - i * 2; teeth.push([x - .6, -4.2 - (i % 2) * .4], [x - 2, -2.6]); }
  s.moveTo(0, 6.5); s.lineTo(tip, -1.2); for (const [x, y] of teeth) s.lineTo(x, y); s.lineTo(0, -3.4); for (let i = teeth.length - 1; i >= 0; i--) s.lineTo(-teeth[i][0], teeth[i][1]); s.lineTo(-tip, -1.2); s.closePath();
  const wg = new T.ExtrudeGeometry(s, {depth: .5, bevelEnabled: true, bevelThickness: .2, bevelSize: .25, bevelSegments: 2}).rotateX(Math.PI / 2).translate(0, .3, 0), uv = wg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 12) / 24, (uv.getY(i) + 4.5) / 11);
  m(wg, M.skin);
  m(new T.SphereGeometry(1, 16, 10).scale(1.5, .7, 5), M.skin, 0, .5, 1);  /* the body */
  for (const x of [-3.2, 3.2]) { m(new T.CylinderGeometry(1.5, 1.3, 2.6, 16, 1, true).rotateX(Math.PI / 2), M.dark, x, 1.1, -3.4); m(new T.CircleGeometry(1.3, 16), M.mouth, x, 1.1, -4.5).rotation.y = Math.PI; m(new T.CircleGeometry(1.4, 16), M.mouth, x, 1.1, -2.1); }
  m(new T.BoxGeometry(.25, 2.4, 2.6), M.skin, 0, 1.7, -4.2);
  const e = m(new T.PlaneGeometry(7, 3.5), M.eye, 0, 1.25, 1.2); e.rotation.x = -Math.PI / 2;
  const core = new T.Sprite(M.core), halo = new T.Sprite(M.halo); core.position.set(0, 1.1, -5); halo.position.copy(core.position); core.scale.setScalar(.034); halo.scale.setScalar(.1); core.visible = halo.visible = false; g.add(core, halo);
  Object.assign(g.userData, {core, halo}); return g; }

/* ---------- the listener and the sound picture, for the speakers, the HUD cue and the bots ---------- */
function ear(C, d, cam) {  /* the camera is the ear of the local pilot; another pilot is heard from where they are, facing north */
  vec(C); const api = C.api, c = api.camera, local = !d || d === api.player;
  if (local) { _F.set(0, 0, -1).applyQuaternion(c.quaternion); _U.set(0, 1, 0).applyQuaternion(c.quaternion); } else { _F.set(0, 0, -1); _U.set(0, 1, 0); }
  _me.p = cam && local || !d ? c.position : d.p; _me.v = (local ? api.player?.v : d.v) || ZERO; _me.f = _F; _me.u = _U; return _me; }
function src(t) { const B = t.bs; _b.p = t.p; _b.v = t.v; _b.yr = B.yr || 0; _b.md = B.md | 0; _b.wf = B.wf || 0; _b.ph = B.ph | 0; return _b; }
const heard = (C, t, d, cam) => cue(_c, src(t), ear(C, d, cam));
const open = B => (B.rv || 0) > 0 || (B.af || 0) > 0;
const assistOn = C => C.S.zassist === 1 || C.S.zassist === true;

/* ---------- the audio-assist setting (default off) ---------- */
function mountAssist(C) { const S = C.S; if (!S || typeof document === 'undefined') return;
  setTimeout(() => { if (document.getElementById('f_zassist')) return; const set = document.getElementById('set'); if (!set) return;
    const l = document.createElement('label'), i = document.createElement('select'), o = document.createElement('output');
    l.textContent = 'Hush audio assist'; i.id = l.htmlFor = 'f_zassist'; o.id = 'o_zassist'; i.add(new Option('Off (the full experience)', '0')); i.add(new Option('On (a faint direction cue)', '1'));
    i.addEventListener('input', () => { S.zassist = +i.value; C.api.save(); });
    const after = document.getElementById('o_zsfxv'); if (after) after.after(l, i, o); else set.append(l, i, o);
    const sync = () => { i.value = assistOn(C) ? '1' : '0'; for (const e of [l, i, o]) e.style.display = S.gmode === 'z' ? '' : 'none'; };
    sync(); document.getElementById('gmode')?.addEventListener('click', () => setTimeout(sync)); }, 0); }

/* ---------- the fight ---------- */
const focus = (C, t) => { const d = C.nearPilot(t.p); if (d) return d.p; const s = C.sites()[0]; return _fc.set(s ? s.x : C.siteC.x, 0, s ? s.z : C.siteC.z); };
function orbit(C, t, F, dt, spd, rate) { const B = t.bs, dx = t.p.x - F.x, dz = t.p.z - F.z, d = Math.hypot(dx, dz) || 1, k = C.cl((d - RAD[B.ph]) / 300, -1, 1), des = _d.set(-dz / d * B.dir - dx / d * k, 0, dx / d * B.dir - dz / d * k);
  des.y = C.cl((C.api.gh(t.p.x, t.p.z) + B.alt - t.p.y) / 160, -.4, .4); C.steer(t, des.normalize(), spd, rate, dt, 60); }
function pickTarget(C, t) { const B = t.bs, L = C.sites(); if (C.me() && (!L.length || Math.random() < .6)) { B.tg = 'p'; B.site = null; } else if (L.length) { const far = L.filter(q => Math.hypot(q.x - t.p.x, q.z - t.p.z) > 500); B.tg = 's'; B.site = C.pick(far.length ? far : L); } else { B.tg = 'p'; B.site = null; } }
/* the point it commits to: a site, or where you will be when it gets there (a straight line, not a homing one: step off it) */
function commit(C, t) { const B = t.bs, me = C.me(), g = C.api.gh; vec(C);
  if (B.tg === 's' && B.site) B.A.set(B.site.x, B.site.y + 30, B.site.z);
  else if (me) { const lead = C.cl(t.p.distanceTo(me.p) / PASS[B.ph] * .9, 0, 6); B.A.copy(me.p).addScaledVector(me.v, lead * .8); B.A.y = Math.max(B.A.y, g(B.A.x, B.A.z) + 15); }
  else { B.tg = 's'; const s = C.pick(C.sites()); if (!s) return false; B.site = s; B.A.set(s.x, s.y + 30, s.z); }
  return true; }
function startRun(C, t) { const B = t.bs; if (!commit(C, t)) { B.md = MD.orbit; B.tm = 3; return; }
  B.md = MD.run; B.tm = 0; B.wf = 0; B.rv = REV[B.ph]; B.af = 0; B.ck = 0; B.cd = 1e9; B.gl = .2; }
function endRun(C, t) { const B = t.bs; B.md = MD.orbit; B.tm = C.rnd(...ORB[B.ph]); B.af = AFT[B.ph]; B.ps = (B.ps | 0) + 1; }
function clip(C, t) {  /* it passes within 28 m of your interceptor: clipped. A near miss only shakes the picture */
  const B = t.bs, me = C.me(); if (!me || B.ck) return; vec(C); const a = t.pp || t.p, ab = _d.subVectors(t.p, a), ap = _s.subVectors(me.p, a), L = ab.lengthSq() || 1, k = C.cl(ap.dot(ab) / L, 0, 1), dd = _t.copy(a).addScaledVector(ab, k).distanceTo(me.p);
  if (dd < 28) { B.ck = 1; C.shoot('the Hush clipped you'); } else if (dd < 90) C.api.shake = .6; }

registerBoss({id: 'hush', n: 'The Hush', tag: 'HUSH', col: COL, spd: 62, alt: [150, 200], hitR: 3.5, det: 9000, cash: 1100, bounty: 5500, far: 5200,
  resist: {rack: .2, gepard: .2, sam: .3, mpads: .2, idome: .1, hflak: .15, flak: .1}, hp: 5, phases: ['WHISPER', 'HUSH', 'SILENCE'],
  note: 'a silent hunter in total darkness: radar and thermal are static for it, no bracket, no lock. Hunt it by ear (wear headphones): its hum, the whoosh of its passes, wind-shear on the banks and a creak before each pass. It is open only while its exhaust flare burns and a moment after a pass.',
  warn: 'lights out', spawn: {event: {from: 24, p: .04}, boss: 45},
  introFn(C, t) { C.Z.an?.say('THE HUSH', 'lights out · radar and thermal are static · headphones on', COL, 3);
    C.Z.an?.radio('OVERLORD', 'All contacts dark and the scope is static. Put your headphones on: you will hear it before you see it.', 2);
    C.api.feed('<span style="color:#9db4d8">The lights went out.</span> Listen for the hum, the whoosh, the creak. Burst it when the flare burns.'); },
  build: C => model(C),
  init(C, t) { const B = t.bs, {api} = C; vec(C); B.md = MD.orbit; B.tm = C.rnd(8, 12); B.rv = B.af = B.ps = B.wf = B.yr = 0; B.dir = Math.random() < .5 ? 1 : -1; B.alt = 170 + C.rnd(-20, 30); B.A = new C.V3(); B.yw = null;
    const F = focus(C, t), dx = t.p.x - F.x, dz = t.p.z - F.z, d = Math.hypot(dx, dz) || 1; if (d > 3200) { t.p.x = F.x + dx / d * 3200; t.p.z = F.z + dz / d * 3200; }
    t.p.y = api.gh(t.p.x, t.p.z) + B.alt; t.v.set(-dx / d, 0, -dz / d).multiplyScalar(60); },
  tick(C, t, dt) { const B = t.bs, {api} = C; vec(C); B.rv = Math.max(0, B.rv - dt); B.af = Math.max(0, B.af - dt); B.gl = Math.max(0, (B.gl || 0) - dt);
    if (B.age > 300 && !B.flee) B.flee = 1;
    if (B.flee) { const e = _d.set(t.p.x, 0, t.p.z).normalize().multiplyScalar(6000); C.steer(t, C.levelTo(t, e, 400), 100, .4, dt, 60); if (Math.abs(t.p.x) > 4600 || Math.abs(t.p.z) > 4600) C.vanish(t, 'escaped'); return true; }
    const F = focus(C, t), far = Math.hypot(t.p.x - F.x, t.p.z - F.z);
    if (B.md === MD.orbit) { orbit(C, t, F, dt, far > RAD[B.ph] + 700 ? 110 : 62, B.af > 0 ? .9 : .5); B.tm -= dt;
      if (B.tm <= 0 && B.af <= 0 && Math.abs(far - RAD[B.ph]) < 450) { pickTarget(C, t); B.md = MD.wind; B.tm = WIND[B.ph]; B.wf = 0; } }
    else if (B.md === MD.wind) { orbit(C, t, F, dt, 62, .5); B.tm -= dt; B.wf = C.cl(1 - B.tm / WIND[B.ph], 0, 1); if (B.tm <= 0) startRun(C, t); }
    else { B.tm += dt; const to = _d.subVectors(B.A, t.p), dist = to.length(); C.steer(t, to.normalize(), PASS[B.ph], 1.6, dt, 25); B.cd = Math.min(B.cd, dist);
      if (dist < 40 || (dist > B.cd + 60 && B.cd < 500) || B.tm > 18) endRun(C, t); }
    if (B.md === MD.run || B.af > 0) { clip(C, t); const S = B.site; if (B.tg === 's' && S && S.hp > 0 && !B.ck && Math.hypot(S.x - t.p.x, S.z - t.p.z) < 160 && t.p.y - C.api.gh(t.p.x, t.p.z) < 260) { B.ck = 1; C.strike(t, S, DMG[B.ph]); } }  /* through the end of the pass and the moment after */
    return true; },
  /* total darkness: the sky, the light and the picture go near-black (fog and light through zatmos.js, so the weather composes and is restored exactly);
     on the thermal camera the picture fills with static, heavier the nearer it is. Highlights are spared: its flare reads from anywhere */
  atmos(C, t, o) { const d = C.api.camera.position.distanceTo(t.p), s = C.cl(1.15 - d / 3000, 0, 1);
    o.fog = .55; o.fogC.set(0x010208); o.fogMix = .88; o.light = .06; o.dark = .86; o.tint.set(0x1a2a4a); o.tintA = .14; o.desat = .35; o.vign = .55; o.noise = C.api.thermLook ? .14 + .12 * s : 0; return 1; },
  seen: () => false, hid: () => true, radarK: () => .85,
  hit(C, t, h) { if (!open(t.bs)) { h.txt = 'NO CONTACT · wait for the flare'; return 0; } return h.q === 'kill' ? 2 : 1; },
  hurt(C, t) { const B = t.bs; B.rv = B.af = 0; if (B.md === MD.run) { B.md = MD.orbit; B.tm = C.rnd(...ORB[B.ph]) * .8; } },
  phase(C, t, i) { if (i === 1) C.api.feed('<span class="co">The Hush is faster and its flare is shorter.</span>'); if (i === 2) C.api.feed('<span class="cr">The Hush cut its engine between passes: only the whoosh and the creak tell you now.</span>'); },
  status(C, e) { const B = e.main.bs; const a = assistOn(C) ? ` · assist: ${B.rv > 0 ? '<b>OPEN: the flare</b>' : B.af > 0 ? '<b>OPEN: it just passed</b>' : 'hidden'}, ${['circling', 'winding up', 'ON A PASS'][B.md | 0]}` : '';
    return `passes ${B.ps | 0} · hunt it by ear: a creak means a pass is coming, the flare means it is open${a}`; },
  /* every screen, every frame: the heading change (wind-shear), a client's timers, the flare and its exhaust; the hull and the flare vanish in thermal (static) */
  vis(C, t, dt) { const B = t.bs, U = t.mesh.userData, th = C.api.thermLook; vec(C);
    if (dt > 1e-4) { const yaw = Math.atan2(t.v.x, t.v.z); if (B.yw != null) { let dy = yaw - B.yw; dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; B.yr = (B.yr || 0) + (dy / dt - (B.yr || 0)) * Math.min(1, dt * 5); } B.yw = yaw;
      if (!C.auth()) { B.rv = Math.max(0, (B.rv || 0) - dt); B.af = Math.max(0, (B.af || 0) - dt); B.gl = Math.max(0, (B.gl || 0) - dt); } }
    const lit = B.rv > 0, em = !lit && B.af > 0, show = !th && (lit || em), now = performance.now();
    t.mesh.visible = !th; U.core.visible = U.halo.visible = show;
    if (show) { const k = lit ? 1 : C.cl(B.af / 1.6, 0, 1) * .45, fl = lit ? .85 + .15 * Math.sin(now / 31) : .8 + .2 * Math.sin(now / 90), g = (B.gl || 0) > 0 ? 1.8 : 1;
      MT.core.opacity = C.cl(fl * k * g, 0, 1); MT.halo.opacity = C.cl(fl * k * .55, 0, 1); U.core.scale.setScalar(.034 * g); U.halo.scale.setScalar(.1 * g);
      if ((B.fx = (B.fx || 0) - dt) <= 0) { B.fx = lit ? .03 : .12; C.FX.emit(t.mesh.localToWorld(_t.set(0, 1.1, -5)), lit ? 0xffe2b8 : 0xff9a50, lit ? 2 : 1, lit ? 24 : 10, lit ? .35 : .5, null, lit ? 3.2 : 2.2); } } },
  /* the radar scope: static for it (no blip, no bearing); heavier as it closes, so it tells you "near" and nothing else */
  radar(C, rc, P, t) { const k = C.cl(1.15 - t.p.distanceTo(C.api.camera.position) / 3200, 0, 1), n = 24 + (90 * k | 0);
    rc.fillStyle = 'rgba(170,230,200,.42)'; for (let i = 0; i < n; i++) rc.fillRect(C.rnd(20, 480), C.rnd(20, 480), C.rnd(1, 4), 1.5);
    rc.strokeStyle = 'rgba(170,230,200,.12)'; rc.lineWidth = 2; for (let i = 0; i < 3; i++) { const y = C.rnd(0, 500); rc.beginPath(); rc.moveTo(0, y); rc.lineTo(500, y + C.rnd(-14, 14)); rc.stroke(); } },
  /* audio assist (off by default): a faint ring where the sound is, nearer the edge the further off your view it is, a chevron when it is closing */
  overlay(C, oc, t, W, H) { if (!assistOn(C)) return; const c = heard(C, t, C.api.player, true); if (c.loud < .03) return;
    const X = Math.sin(c.az) * Math.cos(c.el), Y = Math.sin(c.el), Zf = Math.cos(c.az) * Math.cos(c.el), phi = Math.acos(C.cl(Zf, -1, 1)), q = Math.round(Math.atan2(X, Y) / .35) * .35, m = Math.min(W, H), r = m * .1 + m * .3 * C.cl(phi / 2.3, 0, 1);
    const x = W / 2 + Math.sin(q) * r, y = H / 2 - Math.cos(q) * r; oc.save(); oc.globalAlpha = C.cl(.14 + .5 * Math.sqrt(c.loud), 0, .62); oc.strokeStyle = oc.fillStyle = COL; oc.lineWidth = 2.5;
    const sx = Math.sin(q), cx = Math.cos(q); oc.setLineDash([9, 7]); oc.beginPath(); oc.arc(x, y, 15, 0, 7); oc.stroke(); oc.setLineDash([]);
    if (c.cs > 25) { oc.beginPath(); oc.moveTo(x - sx * 19 + cx * 7, y + cx * 19 + sx * 7); oc.lineTo(x - sx * 28, y + cx * 28); oc.lineTo(x - sx * 19 - cx * 7, y + cx * 19 - sx * 7); oc.stroke(); }
    if (Math.abs(c.el) > .35) oc.fillText(c.el > 0 ? '▲' : '▼', x, y + 5); oc.restore(); },
  netOut: (C, t) => [t.bs.md | 0, Math.round((t.bs.rv || 0) * 10), Math.round((t.bs.af || 0) * 10), t.bs.ps | 0, Math.round((t.bs.wf || 0) * 10)],
  netIn(C, t, a) { const B = t.bs; if (a[0] === MD.run && B.md !== MD.run) B.gl = .2; B.md = a[0] | 0; B.rv = (a[1] | 0) / 10; B.af = (a[2] | 0) / 10; B.ps = a[3] | 0; B.wf = (a[4] | 0) / 10; },
  /* what a pilot would perceive, for the bots (zboss-brain.js): the same cue the speakers play, plus the two tells. attn: how much it has their attention */
  hear(C, t, d) { const c = heard(C, t, d, false), B = t.bs, tell = open(B) ? 1 : B.md === MD.wind ? .6 : .15; return {loud: c.loud, d: c.d, az: c.az, cs: c.cs, glint: (B.rv || 0) > 0, ember: (B.af || 0) > 0, creak: B.md === MD.wind, attn: c.loud * tell}; },
  aim(C, t, s) { const d = C.me(); if (!d) return null; const c = heard(C, t, d, false), q = C.cl(c.loud * 3, 0, 1) * (open(t.bs) ? 1 : .12) * s; if (!(Math.random() < q)) return null;
    return {p: t.p.clone().addScaledVector(t.v.clone().normalize(), Math.random() < s ? -1 : -8)}; },
  winTxt: 'The Hush is silent for good. Lights up.', escTxt: 'slipped back into the quiet',
  /* lights out: a breath going out and a falling sub, with one creak */
  sting(S) { const t0 = S.t + .05, o = S.out(.8), n = S.nz(t0, 3.2), f = S.filt('lowpass', 900, .8); f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(120, t0 + 3); n.connect(f).connect(S.env(t0, .06, .2, 3.2, o));
    const x = S.osc('sine', 70, t0, 3.2); x.frequency.exponentialRampToValueAtTime(34, t0 + 3); x.connect(S.env(t0, .08, .05, 3.2, o));
    const c = S.osc('sawtooth', 110, t0 + 1.4, .5), bp = S.filt('bandpass', 900, 9); c.frequency.exponentialRampToValueAtTime(70, t0 + 1.9); c.connect(bp).connect(S.env(t0 + 1.4, .03, .05, .5, o)); },
  /* its presence: the spatial voice. The loop's own gain is the effects volume; the voices carry their own levels (zhush-cue.js GAIN, at most CAP) */
  loop(S) { const o = S.out(0), V = AC && nbuf ? hushVoice(AC, nbuf, o) : null;
    return {g: o, V, set(C, t) { if (!V) return; listen(AC, C.api.camera); V.set(src(t), ear(C, C.api.player, true)); }, stop() { V?.stop(); try { o.disconnect(); } catch (e) { /* already apart */ } }}; },
  loopVol: () => 1,
  clear() { stopAll(AC); },
  fxLeft: () => ({hush: voices()}),
  g: {init(C) { mountAssist(C); }, stop() { stopAll(AC); }},
  reward: {id: 'array', n: 'Acoustic Array', short: 'radar +10%; every drone within 1.8 km of you shows on the scope, jamming or not',
    txt: 'The Hush\'s listening gear: your radar reaches 10% farther, and any drone within 1.8 km of your interceptor is heard and shown on the scope even through jamming or fog.',
    radarK: () => 1.1, seen(C, t) { if (!['shahed', 'jet', 'decoy', 'heavy'].includes(t.k)) return null; const d = C.me(); return d && d.p.distanceTo(t.p) < 1800 ? true : null; }}});
