// Look checks for the Strela-2 interceptor body and Zombies weather: node tools/zombies-look-shots.mjs OUTDIR [drone] [weather] [classic]
//  drone    close-ups of the Strela body from several angles (standing on the mat and in flight), plus the chase and FPV cameras
//  weather  one chase-camera view per Zombies weather mid-wave (the storm with a lightning flash), night in FPV and thermal, and the base-screen forecast
//  classic  Classic's default dart and the Classic "Strela-2" look option
// Prints the JS cost of the weather step per weather.
import {serve, launch, open, sleep} from './zlib.mjs';
const [OUT, ...what] = process.argv.slice(2), want = k => !what.length || what.includes(k);
const {server, origin} = await serve(); const b = await launch(); const errs = [];
async function page(mode, extra = {}) {
  const p = await open(b, origin + '/games/interceptor/', errs);
  await p.evaluate((m, x) => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: m, wx: 'clear', cam: 1, ...x})), mode, extra);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500);
  // a camera override applied just before the scene is rendered (after Riley's updateCam), in either mode
  await p.evaluate(() => { const {api} = __z, r = api.renderer.render.bind(api.renderer); api.renderer.render = (s, c) => { if (s === api.scene) window.__cam?.(); r(s, c); }; });
  return p;
}
// orbit view of the player's mesh: camera at (yaw, pitch, distance) around a point on the body
const orbit = (p, yaw, pitch, dist, up = .05) => p.evaluate((yaw, pitch, dist, up) => { const {api} = __z, V = api.THREE.Vector3;
  window.__cam = () => { const me = api.player, c = me.p.clone().add(new V(0, up, 0).applyQuaternion(me.q)); api.camera.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * dist, c.y + Math.sin(pitch) * dist, c.z + Math.cos(yaw) * Math.cos(pitch) * dist); api.camera.lookAt(c); api.camera.fov = 40; api.camera.updateProjectionMatrix(); }; }, yaw, pitch, dist, up);

if (want('drone')) {
  const p = await page('z');
  await p.click('#play'); await sleep(600);
  await p.evaluate(() => { document.getElementById('zbase').hidden = true; document.getElementById('hud').style.visibility = 'hidden'; });
  // standing on its fins on the launch mat (base screen = sim paused)
  for (const [n, yaw, pitch, d] of [['mat-front', .6, .15, 1.6], ['mat-rear', 3.5, .35, 1.5], ['mat-low', -1.2, -.05, 1.3]]) { await orbit(p, yaw, pitch, d); await sleep(350); await p.screenshot({path: `${OUT}/drone-${n}.png`}); }
  // in flight: pitched over into dart cruise
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3, me = api.player; me.p.y += 40; me.q.setFromAxisAngle(new V(1, 0, 0), -1.35); });
  for (const [n, yaw, pitch, d] of [['fly-side', 1.57, .1, 1.5], ['fly-top', .4, 1.2, 1.4], ['fly-nose', 3.14, .25, 1.2], ['fly-tail', 0, .25, 1.3]]) { await orbit(p, yaw, pitch, d); await sleep(350); await p.screenshot({path: `${OUT}/drone-${n}.png`}); }
  // the game's own cameras, flying: chase, then FPV (the body must not show in the picture)
  await p.evaluate(() => { window.__cam = null; document.getElementById('hud').style.visibility = ''; const {api, G} = __z, V = api.THREE.Vector3, me = api.player; __z.cont(); const at = me.p.clone().add(new V(0, 80, 0)), q = new api.THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), -1.25);
    window.__hold = setInterval(() => { me.p.copy(at); me.v.set(0, 0, -.01); me.w.set(0, 0, 0); me.q.copy(q); me.mah = 0; }, 4); });
  await sleep(1500); await p.screenshot({path: `${OUT}/drone-chase.png`});
  await p.keyboard.press('KeyC'); await sleep(300); await p.keyboard.press('KeyC'); await sleep(900); await p.screenshot({path: `${OUT}/drone-fpv.png`});
  const vis = await p.evaluate(() => ({meshVisible: __z.api.player.mesh.visible, nozzle: __z.api.player.nozzle.getWorldPosition(new __z.api.THREE.Vector3()).toArray().map(v => +v.toFixed(2))}));
  console.log('fpv: player mesh visible =', vis.meshVisible, '· nozzle world', vis.nozzle);
  // Rocket Assist burning (zrocket.js puts its flame on player.nozzle)
  await p.keyboard.press('KeyC'); await sleep(300);
  await p.evaluate(() => { const {Z} = __z; if (Z.rk) Z.rk.st.t = 10; });
  await orbit(p, 2.4, .2, 2.4, -.2); await sleep(400); await p.screenshot({path: `${OUT}/drone-rocket.png`}); await p.evaluate(() => { window.__cam = null; if (__z.Z.rk) __z.Z.rk.stop(); });
  await p.close();
}
if (want('weather')) {
  const p = await page('z', {zwx: 'wave'});
  await p.click('#play'); await sleep(600);
  // base-screen forecast with a mid-wave change
  await p.evaluate(() => { const {Z, G} = __z; G.next = __z.plan(6); G.next.wx = {id: 'overcast', to: 'rain', why: 'rain moving in', at: 20, dur: 35}; Z.base.render(); });
  await sleep(300); await p.screenshot({path: `${OUT}/wx-forecast.png`});
  await p.evaluate(() => { const {api, G} = __z, V = api.THREE.Vector3, me = api.player; __z.jump(8, 5000); G.next = __z.plan(8); __z.cont(); __z.sim(40); api.SITES.forEach(s => s.hp = s.max);
    window.__keep = setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200);
    const at = new V(150, 0, 900); at.y = api.gh(at.x, at.z) + 110; const q = new api.THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), Math.PI).multiply(new api.THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), -1.2));
    window.__hold = setInterval(() => { me.p.copy(at); me.v.set(0, 0, 0); me.w.set(0, 0, 0); me.q.copy(q); me.mah = 0; }, 4); });
  const cost = {};
  for (const id of ['clear', 'scattered', 'golden', 'overcast', 'dusk', 'rain', 'storm', 'fog', 'snow', 'dust', 'night']) {
    await p.evaluate(id => { __z.Z.wx.set(id); }, id); await sleep(1300);
    cost[id] = await p.evaluate(() => { const w = __z.Z.wx, t0 = performance.now(); for (let i = 0; i < 60; i++) w.step(1 / 60, performance.now()); return +((performance.now() - t0) / 60).toFixed(3); });
    if (id === 'storm') await p.evaluate(() => { __z.api.hemi.userData.f = 1; });
    await sleep(60); await p.screenshot({path: `${OUT}/wx-${id}.png`});
  }
  console.log('weather step ms/frame', JSON.stringify(cost));
  // night, facing the nearest inbound tracks: their dim red engine / nav glow
  await p.evaluate(() => { const {api, Z} = __z, V = api.THREE.Vector3, me = api.player; Z.wx.set('night'); clearInterval(window.__hold);
    const L = api.TH.filter(t => api.live(t)).sort((a, b) => a.p.distanceTo(me.p) - b.p.distanceTo(me.p)), t = L[0], at = me.p.clone(), yaw = Math.atan2(-(t.p.x - at.x), -(t.p.z - at.z));
    const q = new api.THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), yaw).multiply(new api.THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), -1.2));
    window.__hold = setInterval(() => { me.p.copy(at); me.v.set(0, 0, 0); me.w.set(0, 0, 0); me.q.copy(q); me.mah = 0; }, 4); });
  await sleep(1200); await p.screenshot({path: `${OUT}/wx-night-tracks.png`});
  // night through the FPV camera, day cam and thermal
  await p.keyboard.press('KeyC'); await sleep(300); await p.keyboard.press('KeyC'); await sleep(900); await p.screenshot({path: `${OUT}/wx-night-fpv.png`});
  await p.keyboard.press('KeyH'); await sleep(900); await p.screenshot({path: `${OUT}/wx-night-thermal.png`}); await p.keyboard.press('KeyH');
  // a mid-wave change, half-way: fog lifting into overcast (the cloud deck fades in)
  await p.keyboard.press('KeyC'); await sleep(300);
  await p.evaluate(() => { const {Z, G} = __z; Z.wx.start({id: 'fog', to: 'overcast', why: 'fog lifting', at: G.wt - 17.5, dur: 35}); });
  await sleep(1200); await p.screenshot({path: `${OUT}/wx-shift-half.png`});
  const st = await p.evaluate(() => ({wx: __z.api.WX.n, mix: !!__z.api.WX.mix, f: +__z.Z.wx.cur.f.toFixed(2)})); console.log('mid-wave shift', JSON.stringify(st));
  await p.close();
}
if (want('classic')) {
  for (const skin of ['dart', 'strela']) {
    const p = await page('classic', {skin});
    await p.click('#play'); await sleep(800);
    await p.evaluate(() => { document.getElementById('hud').style.visibility = 'hidden'; });  // standing on the mat, motors off
    await orbit(p, .6, .15, 1.6); await sleep(400); await p.screenshot({path: `${OUT}/classic-${skin}.png`});
    await p.close();
  }
}
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
