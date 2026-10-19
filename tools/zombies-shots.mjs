// Zombies screenshots for eyeballing: node tools/zombies-shots.mjs OUTDIR [kinds] [chaos] [base] [perf]
//  kinds  every enemy kind lined up in front of the chase camera
//  chaos  a late wave (default 28) with a full defence, mid-fight, from the FPV and chase cameras; prints frame times
//  base   the base screen at that point
import {serve, launch, open, sleep} from './zlib.mjs';
const [OUT, ...what] = process.argv.slice(2), want = k => !what.length || what.includes(k);
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const p = await open(b, origin + '/games/interceptor/', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', cam: 1})));
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500);
await p.click('#play'); await sleep(400);

if (want('kinds')) {
  await p.evaluate(() => { const {api, G} = __z; __z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; });
  await sleep(2800);
  await p.evaluate(() => {
    const {api, G} = __z, cam = api.camera, V = api.THREE.Vector3, f = new V(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize(), r = new V(-f.z, 0, f.x);
    const ks = ['shahed', 'jet', 'decoy', 'heavy', 'cruise', 'ballistic', 'hyper', 'icbm'];
    ks.forEach((k, i) => { const s = i - (ks.length - 1) / 2, t = __z.make(k, cam.position.x + f.x * 60 + r.x * s * 7, cam.position.z + f.z * 60 + r.z * s * 7); t.p.y = cam.position.y + 6; t.v.copy(r).multiplyScalar(.01); t.spd = .01; t.wps.length = 0; t.aim = t.p.clone().addScaledVector(r, 1e5); });
    for (let i = 0; i < 12; i++) { const t = __z.make('swarm', cam.position.x + f.x * 40 + r.x * (i - 6) * 1.2, cam.position.z + f.z * 40 + r.z * (i - 6) * 1.2); t.grp = 999; t.p.y = cam.position.y + 1; t.spd = .01; t.v.set(0, 0, .01); t.aim = t.p.clone().addScaledVector(r, 1e5); t.wps.length = 0; }
    window.__freeze = setInterval(() => { for (const t of api.TH) { t.v.setLength(.01); } }, 16);
  });
  await sleep(600); await p.screenshot({path: OUT + '/z-kinds.png'});
  await p.evaluate(() => { clearInterval(window.__freeze); const {api} = __z; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; while (__z.G.state === 'wave') __z.sim(1); });
}
if (want('rocket')) {
  // Rocket Assist mid-burn from the chase camera: flame, smoke trail, HUD burn bar
  await p.evaluate(() => { const {api, G, Z} = __z; if (G.state === 'base') __z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.perks.rocket = 1; api.launch(); });
  await p.keyboard.down('KeyW');
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3, d = api.player; __z.sim(.05); d.p.set(0, api.gh(0, 900) + 300, 900); d.q.setFromAxisAngle(new V(1, 0, 0), -80 * Math.PI / 180); d.w.set(0, 0, 0); d.v.set(0, 0, -90); });
  await sleep(3500); await p.screenshot({path: OUT + '/z-rocket.png'}); await p.keyboard.up('KeyW');
}
if (want('chaos')) {
  const W = +(process.env.ZWAVE || 28);
  await p.evaluate(W => {
    const {api, G, Z} = __z, def = Z.def;
    if (G.state !== 'base') { while (G.state === 'wave') __z.sim(1); if (G.state === 'clear') __z.sim(4); }
    def.clear();
    G.perks = {}; for (const k of ['freeze', 'mark', 'air', 'radar', 'optics']) Z.buyPerk(k);
    // the wave streams in undefended for a while (sites held up), then the whole defence switches on at once
    __z.jump(W, 20000); G.next = __z.plan(W); __z.cont(); window.__keep = setInterval(() => api.SITES.forEach(s => s.hp = s.max), 100);
    for (let i = 0; i < 75; i++) { __z.sim(1); api.SITES.forEach(s => s.hp = s.max); }
    [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13], ['flak', 5], ['rack', 8, 3]].forEach(([t, s, l]) => { const d = def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
    def.deploy();
  }, W);
  // let it run in real time, then measure
  await sleep(1500);
  const perf = await p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = now => { ts.push(now - last); last = now; if (ts.length < 240) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); const {api, Z} = __z; res({n: ts.length, avg: ts.reduce((a, b) => a + b) / ts.length, p50: ts[ts.length >> 1], p95: ts[Math.floor(ts.length * .95)], calls: api.renderer.info.render.calls, tris: api.renderer.info.render.triangles, tracks: api.TH.filter(api.live).length, shots: Z.def.shots.length}); } }; requestAnimationFrame(f); }));
  // JS cost of one sim step and one draw-side update at this load, without rendering
  const js = await p.evaluate(() => { const {api} = __z; let t0 = performance.now(); for (let i = 0; i < 120; i++) api.step(1 / 120); const step = (performance.now() - t0) / 120; t0 = performance.now(); for (let i = 0; i < 30; i++) api.visuals(1 / 60, performance.now()); return {stepMs: +step.toFixed(3), visualsMs: +((performance.now() - t0) / 30).toFixed(3)}; });
  console.log('chaos perf', JSON.stringify({...perf, ...js, avg: +perf.avg.toFixed(1), p50: +perf.p50.toFixed(1), p95: +perf.p95.toFixed(1)}));
  if (process.env.ZPROF) {
    // which part of the scene costs the frame: switch groups off one at a time and time 90 frames each
    const prof = await p.evaluate(async () => {
      const {api} = __z, sc = api.scene, fps = () => new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { if (++n < 90) requestAnimationFrame(f); else res(+((performance.now() - t0) / 90).toFixed(1)); }; requestAnimationFrame(f); });
      const out = {all: await fps()}; const kids = sc.children.slice();
      const groups = {points: o => o.isPoints, lines: o => o.isLineSegments, instanced: o => o.isInstancedMesh, sprites: o => o.isGroup && o.children[0]?.isSprite, meshes: o => o.isMesh && !o.isInstancedMesh, groups: o => o.isGroup && !o.children[0]?.isSprite};
      for (const [k, fn] of Object.entries(groups)) { const hid = kids.filter(o => o.visible && fn(o)); hid.forEach(o => o.visible = false); out[k + ' off'] = await fps(); hid.forEach(o => o.visible = true); out[k + ' n'] = hid.length; }
      api.renderer.shadowMap.enabled = false; out['shadows off'] = await fps(); api.renderer.shadowMap.enabled = true;
      for (const o of kids.filter(o => o.isInstancedMesh && o.visible)) { o.visible = false; out[`im ${o.geometry.type}/${o.material.type}/${o.count}/${o.instanceMatrix.count}`] = await fps(); o.visible = true; }
      return out;
    });
    console.log('profile ms/frame', JSON.stringify(prof));
  }
  // views: hold the interceptor 700 m short of the thick of the fight, facing it; chase, threat and FPV cameras
  await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3, me = api.player, L = api.TH.filter(t => api.live(t) && Math.hypot(t.p.x, t.p.z - 1950) < 2500);
    const c = L.length ? L.reduce((a, t) => a.add(t.p), new V()).divideScalar(L.length) : new V(0, 300, 1000), at = new V(0, 0, 2300); at.y = api.gh(at.x, at.z) + 160;
    const yaw = Math.atan2(-(c.x - at.x), -(c.z - at.z)); window.__hold = setInterval(() => { me.p.copy(at); me.v.set(0, 0, 0); me.w.set(0, 0, 0); me.q.setFromAxisAngle(new V(0, 1, 0), yaw); me.mah = 0; }, 4); });
  await sleep(1200); await p.screenshot({path: OUT + '/z-chaos-chase.png'});
  await p.keyboard.press('KeyC'); await sleep(900); await p.screenshot({path: OUT + '/z-chaos-threatcam.png'});
  await p.keyboard.press('KeyC'); await sleep(900); await p.screenshot({path: OUT + '/z-chaos-fpv.png'});
  await p.evaluate(() => clearInterval(window.__hold));
}
if (want('base')) {
  // a mid-game base: wave 14 cleared, a handful of defences and perks, some damage
  await p.evaluate(() => {
    const {api, G, Z} = __z, def = Z.def;
    if (G.state !== 'base') { while (G.state === 'wave') __z.sim(1); if (G.state === 'clear') __z.sim(4); }
    [['rack', 0, 2], ['gepard', 3], ['flak', 6], ['sam', 9], ['ew', 10], ['rack', 12, 1]].forEach(([t, s, l]) => { const d = def.add(t, s); if (t === 'rack') d.tier = l; else d.lvl = 1; d.kills = 3 + (Math.random() * 20 | 0); });
    G.perks = {}; for (const k of ['freeze', 'mark', 'radar']) Z.buyPerk(k);
    G.wave = 14; G.cash = 8450; Z.bunker(true); api.SITES[0].hp = 230; api.SITES[2].hp = 410; api.SITES[3].hp = 500;
    Z.base.close(); G.next = __z.plan(15); Z.base.open();
  });
  await sleep(400); await p.screenshot({path: OUT + '/z-base-shop.png'});
  await p.click('[data-tab="armory"]'); await sleep(300); await p.screenshot({path: OUT + '/z-base-armory.png'});
  await p.click('[data-tab="sites"]'); await sleep(300); await p.screenshot({path: OUT + '/z-base-sites.png'});
  await p.setViewport({width: 412, height: 860}); await p.click('[data-tab="shop"]'); await sleep(400); await p.screenshot({path: OUT + '/z-base-phone.png'}); await p.setViewport({width: 1280, height: 720});
}
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
