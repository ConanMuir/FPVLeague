// Zombies re-entry frames (zreentry.js, zstratradar.js): an ICBM's re-entry seen from the ground near its target (the streak, the sky flash,
// the banner), the Golden Dome's kill vehicle coming out of orbit and the intercept, the debris; a ballistic missile's lesser re-entry; the
// continental and global radar layers; the same ICBM at night. Headless. node tools/zombies-reentry-shots.mjs OUTDIR  (frames: OUTDIR/re-*.png)
import fs from 'node:fs';
import {serve, launch, open, sleep, frames} from './zlib.mjs';
const OUT = process.argv[2] || 'reentry-out'; fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const p = await open(b, origin + '/games/interceptor/?mode=zombies', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', cam: 1})));
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(300);
await p.click('#play'); await sleep(300);
const shot = async name => { await frames(p, 3); await p.screenshot({path: `${OUT}/re-${name}.png`}); console.log('shot', name); };
// a wave that stays open (a queued track far in the future), a Golden Dome, a camera held on the ground near the target looking at a point
await p.evaluate(() => { const {G, Z, api} = __z; G.cash = 1e6; __z.jump(40); G.next = __z.plan(40); const gi = Z.def.SLOTS.findIndex((s, j) => Z.def.slotFree(j) && s.site); const d = Z.def.add('gdome', gi); d.spent = 9000;
  __z.cont(); G.wq = [{k: 'shahed', at: 1e9, brg: 0}]; for (const t of api.TH) t.st = 'dead'; __z.sim(.2); window.__gd = d;
  const c0 = Z.cam; window.__cam = null; Z.cam = dt => { c0(dt); const v = window.__cam; if (!v) return; const cm = api.camera; cm.position.copy(v.p); cm.lookAt(typeof v.t === 'function' ? v.t() : v.t); cm.fov = v.fov || 70; cm.updateProjectionMatrix(); api.sky.position.copy(cm.position); };
  const me = api.player; me.p.set(0, api.gh(0, 3000) + 400, 3000); me.v.set(0, 0, 0); window.__hold = setInterval(() => { if (me.dead <= 0) { me.p.set(0, api.gh(0, 3000) + 400, 3000); me.v.set(0, 0, 0); } }, 5); });
const look = (from, at, fov) => p.evaluate((from, at, fov) => { const V = __z.api.THREE.Vector3; window.__cam = {p: new V(...from), t: typeof at === 'string' ? new Function('return ' + at) : new V(...at), fov}; }, from, at, fov);
// the ICBM: from the north at the substation; the camera 4 km south-east of the target, 300 m up, looking at the warhead
const site = await p.evaluate(() => { const s = __z.api.SITES[0]; window.__t = __z.make('icbm', s.x + 4000, s.z - 160000, s); return [s.x, s.y, s.z]; });
const eye = [site[0] + 1500, site[1] + 300, Math.min(site[2] + 1600, 4000)];  // inside the 9 km map (beyond it the camera sits under the far-field terrain)
await look(eye, '__t.p', 70);
await p.evaluate(() => { const {api} = __z, t = window.__t; while (api.live(t) && t.p.y - t.aim.y > 90200) __z.sim(.05); window.__gd.ammo = 0; });
await sleep(50); await p.evaluate(() => __z.sim(.6)); await shot('1-reentry-flash');
await p.evaluate(() => __z.sim(3)); await shot('2-streak');
await p.evaluate(() => { window.__gd.ammo = 2; __z.sim(1.2); }); await shot('3-kv-launch');
await look(eye, '__t.p.clone().lerp(__z.Z.def.shots.find(h=>h.kind==="space")?.p||__t.p,.5)', 95);
await p.evaluate(() => { const {Z} = __z; let k = 0; while (Z.def.shots.some(h => h.kind === 'space' && h.p.distanceTo(window.__t.p) > 9000) && k++ < 400) __z.sim(.02); });
await shot('4-kv-closing');
await look(eye, '__t.p', 70);
await p.evaluate(() => { const {api} = __z, t = window.__t; window.__ip = t.p.clone(); let k = 0; while (api.live(t) && k++ < 400) __z.sim(.02); window.__ip = t.p.clone(); __z.sim(.08); });
await look(eye, '__ip', 70); await shot('5-intercept');
await p.evaluate(() => __z.sim(1.4)); await shot('6-debris');
// a second ICBM the dome can't stop: its final approach, seen from 2.5 km off its target
const s2 = await p.evaluate(() => { const s = __z.api.SITES[1]; window.__gd.ammo = 0; window.__t = __z.make('icbm', s.x - 3000, s.z - 160000, s); const t = window.__t; while (__z.api.live(t) && t.p.y - t.aim.y > 6000) __z.sim(.05); return [s.x, s.y, s.z]; });
await look([s2[0] + 2000, s2[1] + 150, Math.min(s2[2] + 800, 4000)], '__t.p', 60); await shot('7-terminal');
// a ballistic missile (the lesser form) from the north-west, and the continental layer
await p.evaluate(() => { const {api} = __z; while (api.TH.some(api.live)) __z.sim(.2); api.S.zsrm = 'auto'; const s = api.SITES[2]; for (let i = 0; i < 3; i++) __z.make('ballistic', s.x - 30000 + i * 25000, s.z - 65000, api.SITES[i % 3]);
  __z.make('hyper', s.x + 80000, s.z - 70000, s); __z.make('cruise', s.x - 15000, s.z - 14000, s); window.__t = api.TH.find(t => t.k === 'ballistic' && api.live(t)); while (Z_reTti(window.__t) > 28) __z.sim(.1);
  function Z_reTti(t) { return __z.Z.reTti(t); } });
const s3 = await p.evaluate(() => [window.__t.aim.x, window.__t.aim.y, window.__t.aim.z]);
await look([s3[0] + 1800, s3[1] + 250, Math.min(s3[2] + 1800, 4000)], '__t.p', 70); await p.evaluate(() => __z.sim(2.5)); await sleep(1200); await shot('8-ballistic-continental');
// the global layer: two ICBMs in midcourse, one re-entering
await p.evaluate(() => { const {api} = __z; for (const t of api.TH) if (api.live(t)) t.st = 'dead'; __z.sim(.2); for (let i = 0; i < 3; i++) __z.make('icbm', (i - 1) * 60000, 1950 - 160000, api.SITES[i]); const t = api.TH.find(t => t.k === 'icbm' && api.live(t)); for (let i = 0; i < 400 && t.p.y - t.aim.y > 92000; i++) __z.sim(.1); __z.make('icbm', 30000, 1950 - 160000, api.SITES[0]); __z.sim(1); });
await look(eye, '__z.api.TH.find(t=>t.k==="icbm"&&__z.api.live(t)).p', 75); await sleep(1200); await shot('9-global');
// night: the same re-entry over a dark sky
await p.evaluate(() => { const {api} = __z; for (const t of api.TH) if (api.live(t)) t.st = 'dead'; __z.sim(.2); __z.Z.wx.start?.('night'); api.setWeather?.('night'); const s = api.SITES[0]; window.__t = __z.make('icbm', s.x + 4000, s.z - 160000, s); const t = window.__t; while (api.live(t) && t.p.y - t.aim.y > 60000) __z.sim(.05); });
await look(eye, '__t.p', 70); await shot('10-night');
const st = await p.evaluate(() => ({re: __z.Z.re.state(), sr: __z.Z.sr.state(), log: __z.Z.re.log.map(e => e.e + ':' + (e.k || '') + '@' + e.T).join(' ')}));
console.log(JSON.stringify(st)); console.log('errors', errs.length ? errs : 'none');
clearInterval(0); await b.close(); server.close();
