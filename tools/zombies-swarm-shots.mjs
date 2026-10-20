// Screenshots of the Zombies personal swarm and lock-on (zswarm.js, zlock.js): the five formations from the chase camera, a strike on
// rocket boosters, and the FPV view while a lock builds and at full lock with the intercept path. Headless; one page.
// Run: node tools/zombies-swarm-shots.mjs OUTDIR
import fs from 'node:fs';
import {serve, launch, open, frames, drawFrames} from './zlib.mjs';
const OUT = process.argv[2];
if (!OUT) { console.log('usage: node tools/zombies-swarm-shots.mjs OUTDIR'); process.exit(1); }
fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve();
const browser = await launch();
const errs = [], p = await open(browser, origin + '/games/interceptor/', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0, cam: 1})));
await p.reload({waitUntil: 'load'});
await p.waitForFunction(() => window.__z, {timeout: 60000});
await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000});
// wave 12 with a full swarm; the interceptor is held flying north at 70 m/s, 300 m up (a wrapper on Z.step re-pins it every physics step)
await p.evaluate(() => { const {api, G, Z} = __z, V = api.THREE.Vector3; G.cash = 1e5; G.perks.swarm = 5; G.perks.swarmk = 2; __z.jump(12); G.next = __z.plan(12); __z.cont();
  G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
  const P0 = new V(-400, api.gh(-400, 2600) + 300, 2600), v = new V(0, 0, -70), pins = []; let t = 0;
  window.__pin = {P0, v, pins, q: null, reset() { t = 0; }, at(s) { const me = api.player; return me.p.clone().add(s); }};
  const s0 = Z.step; Z.step = dt => { s0(dt); const me = api.player; if (!me || me.dead > 0) return; t += dt; me.p.copy(P0).addScaledVector(v, t); me.v.copy(v); if (__pin.q) me.q.copy(__pin.q); else me.q.setFromAxisAngle(new V(1, 0, 0), -80 * Math.PI / 180); me.w.set(0, 0, 0);
    for (const [u, o] of pins) { u.p.copy(me.p).add(o); u.v.copy(v); } };
  api.launch(); });
const settle = async n => { await frames(p, n); await drawFrames(p, 2); };
const shot = async name => { await p.screenshot({path: `${OUT}/${name}.png`}); console.log('wrote', name); };
await p.evaluate(() => { const f = __z.api.player; f.p.copy(__pin.P0); for (const d of __z.Z.sw.drones) d.p.copy(__pin.P0).add(new __z.api.THREE.Vector3(Math.random() * 20 - 10, Math.random() * 6, Math.random() * 20 - 10)); });
await settle(240);
for (const [i, f] of ['cloud', 'wedge', 'line', 'screen', 'column'].entries()) {
  await p.evaluate(i => { const {api, Z} = __z, V = api.THREE.Vector3; __pin.pins.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    if (i === 3) { const t = __z.make('shahed', 0, 0); __pin.pins.push([t, new V(1500, 120, -600)]); } Z.sw.command('form#', i); }, i);
  await settle(200); await shot('swarm-' + f);
}
// strike on boosters: a cloud of Shaheds 1.6 km ahead
await p.evaluate(() => { const {api, Z} = __z, V = api.THREE.Vector3; __pin.pins.length = 0; Z.sw.command('form#', 1); for (let i = 0; i < 6; i++) { const t = __z.make('shahed', 0, 0); __pin.pins.push([t, new V(-60 + i * 25, 40 + (i % 2) * 20, -1600 - i * 15)]); } });
await settle(60); await p.evaluate(() => __z.Z.sw.command('strike')); await settle(40); await shot('swarm-strike');
await settle(200); await shot('swarm-strike-late');
// FPV, camera level, nose up (the camera looks north): a lock building on a track crossing ahead, then the full lock with its intercept path
await p.evaluate(() => { const {api, Z} = __z, V = api.THREE.Vector3; __pin.pins.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; __pin.q = new api.THREE.Quaternion();
  api.S.cam = 0; dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyC'})); dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyC'})); Z.lk.clear();
  const t = __z.make('jet', 0, 0); t.spd = 0; __pin.pins.push([t, new V(0, 20, -1100)]); window.__lt = t; });
await p.evaluate(() => { for (const k of ['KeyC']) dispatchEvent(new KeyboardEvent('keyup', {code: k})); });
const cam = await p.evaluate(() => __z.api.camMode);
console.log('cam mode', cam);
await p.waitForFunction(() => __z.Z.lk.prog > .45 || __z.Z.lk.t, {timeout: 20000, polling: 30}).catch(() => {});
await shot('lock-building');
await p.waitForFunction(() => !!__z.Z.lk.t, {timeout: 20000, polling: 50}).catch(() => {});
// at full lock the track breaks east: the intercept path bends onto where it will be
await p.evaluate(() => { const {api} = __z, V = api.THREE.Vector3; __pin.pins.length = 0; __lt.v.set(90, 0, 0); __lt.spd = __lt.cs = 90; });
await settle(30); await shot('lock-intercept');
console.log(errs.length ? 'errors:\n  ' + errs.join('\n  ') : 'no errors');
await browser.close(); server.close();
