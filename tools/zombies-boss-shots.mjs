// Screenshots of the Zombies boss roster (zbosses.js, zboss-*.js): each boss close up (models and decals), the Juggernaut intact and
// degraded, the Hive split, the Undertaker's tethers, the Puppeteer's wire and trail, the Jammer King's silhouette and its radar picture.
// A showcase camera (a wrapper on Z.cam) frames the boss in its own frame of reference while the game runs. Headless; one page.
// Run: node tools/zombies-boss-shots.mjs OUTDIR [ids...]
import fs from 'node:fs';
import {serve, launch, open, frames, drawFrames} from './zlib.mjs';
const OUT = process.argv[2], CMP = process.argv.includes('--compare'), ONLY = process.argv.slice(3).filter(a => a !== '--compare');  // --compare: each shot twice, without and with the boss atmosphere (zatmos.js)
if (!OUT) { console.log('usage: node tools/zombies-boss-shots.mjs OUTDIR [ids...]'); process.exit(1); }
fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve();
const browser = await launch();
const errs = [], p = await open(browser, origin + '/games/interceptor/', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0, cam: 1, zboss: {v: 1, b: {jugg: {met: 3, won: 0, lost: 4}}, ace: {beaten: 1, kills: 17, hits: 6}, ghost: {}}})));
await p.reload({waitUntil: 'load'});
await p.waitForFunction(() => window.__z, {timeout: 60000});
await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000});
await p.evaluate(() => { const {api, G, Z} = __z, V = api.THREE.Vector3; G.cash = 1e5; __z.jump(24); G.next = __z.plan(24); __z.cont();
  window.__sc = {t: null, off: new V(20, 4, 6), look: new V(), fov: 50};
  const c0 = Z.cam; Z.cam = dt => { c0(dt); const s = __sc; if (!s.t || s.t.st === 'dead' && !s.keep) return; const t = s.t, cam = api.camera, f = t.v.clone().setY(0); if (f.lengthSq() < .01) f.set(0, 0, 1); f.normalize();
    const r = new V(-f.z, 0, f.x), P = t.p.clone().addScaledVector(r, s.off.x).add(new V(0, s.off.y, 0)).addScaledVector(f, s.off.z); cam.position.copy(P); cam.up.set(0, 1, 0); cam.lookAt(t.p.clone().add(s.look)); cam.fov = s.fov; cam.updateProjectionMatrix(); };
  window.__clear = () => { for (const t of api.TH) t.st = 'dead'; __z.sim(.1); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); for (const s of api.SITES) s.hp = s.max; Z.fxTest?.endCine(); }; });
const settle = async n => { await frames(p, n); await drawFrames(p, 3); };
const shot = async name => { await p.evaluate(() => __z.Z.fxTest?.endCine());
  if (CMP) { await p.evaluate(() => { __z.Z.atmos.off = true; }); await drawFrames(p, 3); await p.screenshot({path: `${OUT}/${name}-before.png`}); await p.evaluate(() => { __z.Z.atmos.off = false; }); }
  await drawFrames(p, 3); await p.screenshot({path: `${OUT}/${name}${CMP ? '-after' : ''}.png`}); console.log('wrote', name); };
const want = id => !ONLY.length || ONLY.includes(id);
const show = async (id, off, look = [0, 0, 0], fov = 50, setup = '') => { await p.evaluate((id, off, look, fov, setup) => { __clear(); const {Z, api} = __z, V = api.THREE.Vector3; const t = Z.bosses.spawn(id); __z.sim(.5); if (setup) new Function('t', setup)(t);
  __sc.t = t; __sc.off.set(...off); __sc.look.set(...look); __sc.fov = fov; }, id, off, look, fov, setup); await settle(30); };
if (want('mothership')) { await p.evaluate(() => { __clear(); const {Z, api} = __z, V = api.THREE.Vector3; const t = Z.make('boss', 0, -900); t.p.y = api.gh(0, -900) + 650; __z.sim(2.5); const m = Z.bosses.shadows[0];
  __sc.t = {p: m.position, v: new V(1, 0, 0), st: 'cruise'}; __sc.off.set(220, 300, 160); __sc.look.set(0, 40, 0); __sc.fov = 70; }); await settle(60); await shot('boss-mothership-shadow'); }
if (want('ace')) { await show('ace', [13, 3, 4], [0, 0, -1], 45); await shot('boss-ace'); await p.evaluate(() => __sc.off.set(-10, 6, -14)); await settle(10); await shot('boss-ace-tail'); }
if (want('gace')) { await p.evaluate(() => { __z.G.fallen = {jet: 6, shahed: 8, heavy: 2}; }); await show('gace', [18, 5, 10], [0, 0, 0], 55); await settle(60); await shot('boss-ghost-of-the-ace');
  await p.evaluate(() => __sc.off.set(70, 30, 60)); await settle(40); await shot('boss-ghost-legion'); }
if (want('twins')) { await show('twins', [40, 10, 20], [25, 0, -10], 55); await settle(40); await shot('boss-twins'); }
if (want('jugg')) { await show('jugg', [38, 10, 16], [0, 0, 2], 55); await shot('boss-juggernaut');
  await p.evaluate(() => { const t = __sc.t; for (const i of [0, 1, 2]) { t.bs.wm &= ~(1 << i); t.bs.hp--; } __z.sim(1.5); }); await settle(90); await shot('boss-juggernaut-damaged');
  await p.evaluate(() => { const t = __sc.t; for (const i of [3, 4]) { t.bs.wm &= ~(1 << i); t.bs.hp--; } __z.sim(1); __sc.off.set(-30, -8, -30); }); await settle(90); await shot('boss-juggernaut-core'); }
if (want('ghost')) { await show('ghost', [34, 9, 14], [0, 0, 0], 50); await shot('boss-ghost'); await p.evaluate(() => { __sc.off.set(260, 160, -700); }); await settle(240); await shot('boss-ghost-contrail'); }
if (want('hive')) { await show('hive', [70, 20, 40], [0, -4, 0], 55); await shot('boss-hive');
  await p.evaluate(() => { const t = __sc.t; for (let i = 0; i < 4; i++) __z.Z.bosses.hitAt(t, 'damage', t.p.clone()); __sc.t = __z.api.TH.find(u => u.k === 'brood' && u.st !== 'dead'); __sc.off.set(120, 70, 80); __sc.keep = 0; }); await settle(120); await shot('boss-hive-split'); }
if (want('mirror')) { await p.evaluate(() => { __z.G.hab = {n: 400, alt: 120000, spd: 36000, L: 300, R: 100, asp: {'LEVEL SIX': 9}, side: {LEFT: 6, RIGHT: 5}, dets: 0, yaw: null, t: 0}; });
  await show('mirror', [3.2, .8, 2.2], [0, 0, 0], 55); await shot('boss-mirror'); }
if (want('siren')) { await show('siren', [12, 3, 5], [0, 0, 0], 50); await shot('boss-siren'); await p.evaluate(() => __sc.off.set(400, 200, 300)); await settle(30); await shot('boss-siren-escort'); }
if (want('undertaker')) { await p.evaluate(() => { __clear(); const {api, Z} = __z, S = api.SITES[0]; S.hp = 0; const t = Z.bosses.spawn('undertaker', {x: S.x, z: S.z - 60, set: {anchor: S}}); t.p.set(S.x + 8, S.y + 30, S.z - 6); __z.sim(25);
  __sc.t = t; __sc.off.set(26, 10, 18); __sc.look.set(0, -4, 0); __sc.fov = 55; }); await settle(60); await shot('boss-undertaker');
  await p.evaluate(() => { __sc.off.set(260, 180, 200); __sc.fov = 60; }); await settle(30); await shot('boss-undertaker-tethers'); }
if (want('puppet')) { await show('puppet', [9, 4, 7], [0, 1, 0], 50); await shot('boss-puppeteer');
  await p.evaluate(() => { const {api, Z} = __z, t = __sc.t; for (let i = 0; i < 3; i++) { const u = Z.make('shahed', t.p.x + 300 + i * 40, t.p.z - 500); u.p.y = t.p.y + 160; } t.bs.wt = 0; const r0 = Math.random; Math.random = () => .9; try { __z.sim(.05); } finally { Math.random = r0; } __sc.off.set(140, 90, 120); __sc.look.set(150, 60, -150); }); await settle(40); await shot('boss-puppeteer-wire');
  await p.evaluate(() => { const {api} = __z, w = api.TH.find(u => u.pup); if (w) { w.by = 'p'; api.killThreat(w, true); } __z.sim(.5); __sc.off.set(260, 260, 260); __sc.look.set(0, 0, 0); }); await settle(40); await shot('boss-puppeteer-trail'); }
if (want('jammer')) { await p.evaluate(() => { __clear(); __sc.t = null; const {api, Z} = __z, me = api.player; me.p.set(0, api.gh(0, 600) + 400, 600); me.v.set(0, 0, -40); me.q.setFromAxisAngle(new api.THREE.Vector3(1, 0, 0), -80 * Math.PI / 180); api.camera.position.copy(me.p); api.camera.lookAt(me.p.x, me.p.y, me.p.z - 100); api.camera.updateMatrixWorld(); window.__jk = Z.bosses.spawn('jammer'); __z.sim(.3); });
  await settle(10); await shot('boss-jammer-silhouette');
  await p.evaluate(() => { const t = __jk; __z.sim(5); t.bs.pt = 9; __sc.t = t; __sc.off.set(60, 12, 40); __sc.fov = 55; }); await settle(20); await shot('boss-jammer-window');
  await p.evaluate(() => { const {api} = __z, t = __jk; for (const q of api.TH.filter(u => u.k === 'jpod' && api.live(u)).slice(0, 2)) { q.by = 'p'; api.killThreat(q, true); } t.bs.pt = 0; __sc.t = null; const me = api.player; me.p.set(0, api.gh(0, 1500) + 600, 1500); }); await settle(20); await shot('boss-jammer-radar'); }
console.log(errs.length ? 'errors:\n  ' + errs.join('\n  ') : 'no errors');
await browser.close(); server.close();
