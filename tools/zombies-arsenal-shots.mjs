// Screenshots of the Zombies arsenal (zarsenal.js, zweapons.js, zarsdef.js): each defence at work (laser beam, microwave pulse, balloon barrage,
// smoke screen, drone carrier volley) and each weapon's burst (net capture, EMP, flechette, cluster bomblets, chaff), from the chase camera,
// plus the laser's burn arc in the FPV view. Headless; one page. Run: node tools/zombies-arsenal-shots.mjs OUTDIR [names,...]
import fs from 'node:fs';
import {serve, launch, open, frames, drawFrames} from './zlib.mjs';
const OUT = process.argv[2], ONLY = process.argv[3] ? process.argv[3].split(',') : null;
if (!OUT) { console.log('usage: node tools/zombies-arsenal-shots.mjs OUTDIR [names]'); process.exit(1); }
fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve();
const browser = await launch();
const errs = [], p = await open(browser, origin + '/games/interceptor/', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0, cam: 1})));
await p.reload({waitUntil: 'load'});
await p.waitForFunction(() => window.__z, {timeout: 60000});
await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000});
// wave 14, everything bought; the interceptor is pinned (position, heading) by a wrapper on Z.step, tracks too
await p.evaluate(() => { const {api, G, Z} = __z, V = api.THREE.Vector3; __z.jump(14, 1e6);
  for (const w of ['net', 'flech', 'flare', 'cluster', 'emp', 'dart']) Z.ars.buyW(w);
  window.__S = {pin: null, pins: [], hold: true,
    clear() { for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); this.pins.length = 0; for (const d of [...Z.def.D]) Z.def.remove(d); },
    // the drone at p, heading toward q (yaw only, a little nose down), standing still
    place(p, q) { this.pin = {p: p.clone(), yaw: Math.atan2(-(q.x - p.x), -(q.z - p.z))}; },
    build(type, j) { G.state = 'base'; const d = Z.base.act.place(type, j); G.state = 'wave'; Z.def.deploy(); return d; },
    slot(re) { return Z.def.SLOTS.findIndex((s, j) => Z.def.slotFree(j) && re.test(s.n)); },
    load(w) { G.state = 'base'; Z.ars.equip(w); G.state = 'wave'; Z.ars.onWave(); },
    // helpers leave the pilot's own selected track alone: select a far-off decoy so they work on the rest
    decoy() { const t = __z.make('decoy', 3500, -3000); t.p.y = api.gh(t.p.x, t.p.z) + 900; __S.pins.push([t, t.p.clone()]); api.pickT = t; } };
  const s0 = Z.step; Z.step = dt => { s0(dt); const me = api.player, P = __S.pin; if (!me || me.dead > 0 || !P || !__S.hold) return; me.p.copy(P.p); me.v.set(-Math.sin(P.yaw) * 12, 0, -Math.cos(P.yaw) * 12); me.w.set(0, 0, 0);
    me.q.setFromEuler(new api.THREE.Euler(-.12, P.yaw, 0, 'YXZ')); for (const [u, o] of __S.pins) { u.p.copy(o); u.v.set(0, 0, -2); } };
  G.next = __z.plan(14); __z.cont(); api.launch(); __S.clear(); });
const settle = async n => { await frames(p, n); await drawFrames(p, 2); };
const shot = async name => { await p.screenshot({path: `${OUT}/${name}.png`}); console.log('wrote', name); };
const want = n => !ONLY || ONLY.includes(n);

// laser: a battery on the substation burning a Shahed 700 m out; the camera 120 m behind and above the battery
if (want('laser')) {
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3; __S.clear(); const j = __S.slot(/substation north/i), d = __S.build('laser', j), s = __z.Z.def.SLOTS[j];
    const t = __z.make('shahed', s.x + 150, s.z - 700); t.p.y = api.gh(t.p.x, t.p.z) + 260; t.alt = 260; __S.pins.push([t, t.p.clone()]); __S.decoy();
    __S.place(new V(s.x - 40, s.y + 60, s.z + 120), t.p); });
  await p.waitForFunction(() => __z.Z.def.D[0]?.lz?.prog > .45, {timeout: 30000, polling: 50}).catch(() => {}); await drawFrames(p, 2); await shot('ars-laser');
}
// microwave dome: a swarm of 10 drones over the fuel depot, the pulse just fired
if (want('mwave')) {
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3; __S.clear(); const j = __S.slot(/fuel depot north/i), d = __S.build('mwave', j), s = __z.Z.def.SLOTS[j]; d.cd = 1.2;
    for (let i = 0; i < 10; i++) { const t = __z.make('swarm', s.x - 200 + i * 40, s.z - 260, s.site); t.p.y = api.gh(t.p.x, t.p.z) + 50; }
    __S.place(new V(s.x + 260, s.y + 140, s.z + 700), new V(s.x, s.y, s.z - 150)); });
  await p.waitForFunction(() => __z.Z.def.D[0]?.shots > 0, {timeout: 20000, polling: 10}).catch(() => {}); await drawFrames(p, 2); await shot('ars-mwave');
}
// balloon barrage over the apartments
if (want('barrage')) {
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3; __S.clear(); const j = __S.slot(/apartments north/i), d = __S.build('barrage', j), s = __z.Z.def.SLOTS[j];
    __S.place(new V(s.x - 260, s.y + 110, s.z + 420), new V(s.x, s.y + 150, s.z)); });
  await settle(40); await shot('ars-barrage');
}
// smoke screen over the substation after 15 s of generators running
if (want('smoke')) {
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3; __S.clear(); const j = __S.slot(/substation west/i), d = __S.build('smoke', j), s = __z.Z.def.SLOTS[j];
    __S.place(new V(s.x - 260, s.y + 60, s.z + 330), new V(s.x, s.y + 20, s.z)); });
  await p.evaluate(() => { __z.G.state = 'wave'; }); await settle(240); console.log('screen', await p.evaluate(() => { const d = __z.Z.def.D[0], g = d.bubble, q = d.puffs[0], w = q.getWorldPosition(new __z.api.THREE.Vector3()); return JSON.stringify({so: d.so, vis: g.visible, inScene: !!g.parent, sc: g.scale.x, op: q.material.opacity, w: [w.x, w.y, w.z].map(Math.round), cam: __z.api.camera.position.toArray().map(Math.round), ws: q.getWorldScale(new __z.api.THREE.Vector3()).x}); })); await shot('ars-smoke');
}
// drone carrier parked 900 m north, a volley going up at a raid
if (want('carrier')) {
  await p.evaluate(() => { const {api, Z} = __z, V = api.THREE.Vector3; __S.clear(); const d = __S.build('carrier', 22); Z.ars.park(d.id, 200, 1000); const s = Z.def.SLOTS[22];
    for (let i = 0; i < 8; i++) { const t = __z.make('shahed', 200 + (i - 4) * 90, -900 - i * 50); t.p.y = api.gh(t.p.x, t.p.z) + 300; t.alt = 300; }
    __S.decoy(); d.cd = 2.5; __S.place(new V(s.x + 60, s.y + 25, s.z + 70), new V(s.x - 10, s.y + 40, s.z - 200)); });
  await settle(200); await shot('ars-carrier');
}
// weapons: a pack ahead of the interceptor, the burst, the camera watching (the dead cam after the drone goes)
const burst = async (w, kind, n, spread, dist, name, wait = 6) => {
  await p.evaluate(([w, kind, n, spread, dist]) => { const {api, Z} = __z, V = api.THREE.Vector3; __S.clear(); __S.load(w); if (api.player.dead > 0) api.launch();
    const P = new V(-300, api.gh(-300, 300) + 300, 300); __S.place(P, new V(-300, P.y - 30, -1000));
    for (let i = 0; i < n; i++) { const t = __z.make(kind, P.x, P.z - dist); t.p.set(P.x + (i % 4 - 1.5) * spread, P.y - 3 + (i >> 2) * spread * .6, P.z - dist - (i % 3) * spread * .5); t.alt = t.p.y - api.gh(t.p.x, t.p.z); __S.pins.push([t, t.p.clone()]); } }, [w, kind, n, spread, dist]);
  await settle(20); await p.evaluate(() => { __S.pins.length = 0; __z.Z.detonate(); }); await settle(wait); await shot(name); };
if (want('emp')) await burst('emp', 'shahed', 8, 14, 30, 'ars-emp', 5);
if (want('flech')) await burst('flech', 'swarm', 8, 2.5, 8, 'ars-flechette', 2);
if (want('net')) { await burst('net', 'shahed', 1, 1, 4, 'ars-net', 30); }
if (want('cluster')) await burst('cluster', 'shahed', 6, 40, 160, 'ars-cluster', 40);
// chaff: the pod against a cruise missile passing 300 m off
if (want('chaff')) {
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3; __S.clear(); __S.load('flare'); if (api.player.dead > 0) api.launch(); const P = new V(-300, api.gh(-300, 300) + 300, 300);
    __S.place(P, new V(P.x + 300, P.y - 40, P.z - 300)); const t = __z.make('cruise', P.x + 300, P.z - 900); t.p.y = P.y - 60; t.alt = t.p.y - api.gh(t.p.x, t.p.z); });
  await p.waitForFunction(() => __z.Z.ars.P(__z.Z.ars.me()).ch < 4, {timeout: 20000, polling: 20}).catch(() => {}); await settle(6); await shot('ars-chaff');
}
// FPV: the laser's burn arc on a track and the weapon tag on the HUD
if (want('fpv')) {
  await p.evaluate(() => { const {api, Z} = __z, V = api.THREE.Vector3; __S.clear(); __S.load('emp'); if (api.player.dead > 0) api.launch(); const j = __S.slot(/substation north/i), d = __S.build('laser', j), s = Z.def.SLOTS[j];
    const t = __z.make('shahed', s.x + 100, s.z - 900); t.p.y = api.gh(t.p.x, t.p.z) + 200; t.alt = 200; __S.pins.push([t, t.p.clone()]); __S.decoy(); __S.place(new V(s.x - 100, s.y + 150, s.z + 300), t.p);
    dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyC'})); dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyC'})); });
  for (let i = 0; i < 4 && (await p.evaluate(() => __z.api.camMode)) !== 0; i++) await p.evaluate(() => { dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyC'})); dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyC'})); });
  await p.waitForFunction(() => __z.Z.def.D[0]?.lz?.prog > .5, {timeout: 30000, polling: 50}).catch(() => {}); await drawFrames(p, 2); await shot('ars-fpv-laser');
}
console.log(errs.length ? 'errors:\n  ' + errs.join('\n  ') : 'no errors');
await browser.close(); server.close();
