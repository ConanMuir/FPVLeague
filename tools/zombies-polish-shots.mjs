// Zombies polish checks and screenshots: node tools/zombies-polish-shots.mjs OUTDIR [money] [impact] [boss] [muzzle] [settings] [night] [integ]
//  money     a kill's money pop flying into the cash counter (the counter only rolls once it lands)
//  impact    the impact cam when a ballistic missile hits a site, and skipping it with a key
//  boss      the Mothership fly-by when it appears (time crawls meanwhile)
//  muzzle    drone racks, SAM, Iron Dome, Gepard and mortar firing: flashes, launch smoke, backblast, missile trails
//  settings  the music / effects volume sliders in the menu, and B as a quick music mute
//  night     window lights, site lamps and searchlights at night, then with the substation destroyed and the blocks at 30 %
//  integ     a real-time wave with damage stages, hit fires and smoke; a snow wave on the ground; thermal FPV on the buildings
//  snowtrees tree crowns under snow stay readable (frosted), not near-black
// Prints ok / FAIL per check; frames are OUTDIR/p-*.png.
import fs from 'node:fs';
import {serve, launch, open, sleep, luma} from './zlib.mjs';
const [OUT, ...what] = process.argv.slice(2), want = k => !what.length || what.includes(k);
fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve(); const b = await launch(); const errs = []; let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const p = await open(b, origin + '/games/interceptor/?mode=zombies', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', cam: 1, zwx: 'wave'})));
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500);
await p.click('#play'); await sleep(400);
const shot = async name => p.screenshot({path: `${OUT}/p-${name}.png`});
// __render: draw the scene straight from a camera at pos looking at tgt (no HUD, no bloom) and return a PNG; __look: hold the interceptor so the
// game's own camera frames a spot (fpv: nose level toward it)
await p.evaluate(() => { const {api} = __z, sc = api.scene, V = api.THREE.Vector3;
  window.__render = (pos, tgt, fov = 55) => { const cam = api.camera, sun = api.sun, d = new V().subVectors(sun.position, sun.target.position); cam.position.set(...pos); cam.lookAt(new V(...tgt)); cam.fov = fov; cam.updateProjectionMatrix();
    sun.target.position.set(tgt[0], tgt[1], tgt[2]); sun.position.copy(sun.target.position).add(d); sun.target.updateMatrixWorld(); api.sky.position.copy(cam.position);
    api.renderer.render(sc, cam); return api.renderer.domElement.toDataURL('image/png'); };
  window.__look = (x, z, dist, h, ang = 2.4, fpv = false) => { clearInterval(window.__hold); const px = x + Math.sin(ang) * dist, pz = z + Math.cos(ang) * dist, dir = new V(x - px, 0, z - pz).normalize(); dir.y = .1; dir.normalize();
    const Zb = new V(0, -1, 0), Y = new V(0, 1, 0), bz = dir.clone().setY(0).normalize().negate(), q = new api.THREE.Quaternion().setFromRotationMatrix(fpv ? new api.THREE.Matrix4().makeBasis(new V().crossVectors(Y, bz), Y, bz) : new api.THREE.Matrix4().makeBasis(new V().crossVectors(dir, Zb), dir, Zb));
    const hold = () => { const me = api.player; if (!me || me.dead > 0) return; me.p.set(px, api.gh(px, pz) + h, pz); me.v.set(0, 0, 0); me.w.set(0, 0, 0); me.q.copy(q); me.mah = 0; }; hold(); window.__hold = setInterval(hold, 5); };
  window.__clear = () => { for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; __z.G.wq.length = 0; };
  // a fresh wave w with nothing in it but one Shahed 30 km out (so it doesn't end by itself)
  window.__wave = (w, wx = 'clear') => { const {G} = __z; __clear(); if (G.state !== 'base') { G.state = 'clear'; G.clearT = 0; __z.sim(.1); } __z.jump(w); G.next = __z.plan(w); G.next.wx = {id: wx}; __z.cont(); __clear(); __z.make('shahed', 0, -28000); }; });
const render = async (name, pos, tgt, fov) => { const u = await p.evaluate((a, b, c) => __render(a, b, c), pos, tgt, fov); fs.writeFileSync(`${OUT}/p-${name}.png`, Buffer.from(u.split(',')[1], 'base64')); };
const site = i => p.evaluate(i => { const s = __z.api.SITES[i]; return {x: s.x, y: s.y ?? __z.api.gh(s.x, s.z), z: s.z, r: s.r, n: s.n}; }, i);
await p.evaluate(() => { __z.cont(); __z.sim(1); });

if (want('money')) {
  // a Shahed just in front of the interceptor; the bot puts it 1 m behind and detonates. The pop's clock is set back to catch it rising and mid-flight.
  await p.evaluate(() => { __wave(2); const {api} = __z; __z.sim(api.player.dead > 0 ? 3 : 1); const me = api.player; const t = __z.make('shahed', me.p.x + 40, me.p.z - 160); t.p.y = me.p.y + 30; __z.botKill(1); });
  const f = [], st = () => p.evaluate(() => ({fly: __z.G.pops.filter(p => p.amt).length, shown: +document.getElementById('zc').textContent.replace(/\D/g, ''), cash: __z.G.cash}));
  for (const a of [.3, .62]) {  // (slow headless frames add up to ~0.2 s on top of the pinned age)
    await p.evaluate(a => { clearInterval(window.__pin); window.__pin = setInterval(() => { for (const q of __z.G.pops) if (q.amt) q.t0 = performance.now() - a * 1000; }, 4); }, a); await sleep(60); f.push(await st()); await shot('money-' + a); }
  await p.evaluate(() => clearInterval(window.__pin));
  await sleep(1400); f.push(await st());
  console.log('money', JSON.stringify(f));
  ok(f[0].fly >= 1 && f[1].fly >= 1 && f[1].shown < f[1].cash, `kill money in flight, the counter waits (${f[1].shown} of ${f[1].cash})`);
  ok(f[2].fly === 0 && f[2].shown === f[2].cash, `money landed and the counter rolled up (${f[2].shown})`);
}

if (want('impact')) {
  const s = await site(0);
  await p.evaluate(() => { __wave(3); const {api, G} = __z, s = api.SITES[0]; s.hp = s.max; const t = __z.make('ballistic', s.x + 900, s.z - 1200, s); window.__bt = t; window.__look(s.x, s.z, 900, 120, 2); for (let i = 0; i < 3000 && !t.impacted && G.state === 'wave'; i++) __z.sim(1 / 30); });
  await sleep(150); const c1 = await p.evaluate(() => __z.Z.fxState());
  const L = {};  // brightness between the letterbox bars: the blast must not wash the whole picture out, even with time crawling
  for (const u of [.3, .75]) { await p.evaluate(u => { clearInterval(window.__pin); window.__pin = setInterval(() => __z.Z.fxTest.cineAt(u), 4); }, u); await sleep(80); const png = await p.screenshot({encoding: 'base64'}); fs.writeFileSync(`${OUT}/p-impact-${u}.png`, Buffer.from(png, 'base64')); L[u] = await luma(p, [0, .15, 1, .85], png); }
  await p.evaluate(() => { clearInterval(window.__pin); __z.Z.fxTest.cineAt(.3); });
  ok(c1.cine === 'impact' && c1.tsc < .5, `impact cam on a ballistic hit (cine ${c1.cine}, time x${c1.tsc.toFixed(2)})`);
  ok(L[.3].hot < .08 && L[.3].mean < L[.75].mean * 1.25, `impact cam: the blast doesn't wash out the picture (mean luma ${L[.3].mean} at 0.3 vs ${L[.75].mean} at 0.75, ${Math.round(L[.3].hot * 100)}% near-white)`);
  await p.keyboard.press('KeyK'); await sleep(100);
  const c2 = await p.evaluate(() => ({cine: __z.Z.fxState().cine, tsc: __z.Z.tsc, hud: document.getElementById('hud').classList.contains('zcine')}));
  ok(!c2.cine && c2.tsc === 1 && !c2.hud, 'a key skips it: camera, time and HUD back');
  await p.evaluate(() => clearInterval(window.__hold));
}

if (want('boss')) {
  await p.evaluate(() => { const {api, G} = __z; __clear(); if (G.state !== 'base') { G.state = 'clear'; G.clearT = 0; __z.sim(.1); } __z.jump(10, 50000); G.next = __z.plan(10); __z.cont(); __z.sim(5.6); });
  await sleep(300); const c1 = await p.evaluate(() => ({...__z.Z.fxState(), boss: __z.api.TH.some(t => t.k === 'boss')}));
  // frames along the fly-by: its clock is pinned for each screenshot
  for (const u of [.12, .5, .88]) { await p.evaluate(u => { clearInterval(window.__pin); window.__pin = setInterval(() => __z.Z.fxTest.cineAt(u), 4); }, u); await sleep(80); await shot('boss-' + u); }
  await p.evaluate(() => { clearInterval(window.__pin); __z.Z.fxTest.cineAt(.9); });
  ok(c1.boss && c1.cine === 'boss' && c1.tsc < .2, `Mothership fly-by when it appears (cine ${c1.cine}, time x${c1.tsc.toFixed(2)})`);
  await sleep(1200); const c2 = await p.evaluate(() => __z.Z.fxState());
  ok(!c2.cine && c2.tsc === 1, 'fly-by ends by itself and time comes back');
  await p.evaluate(() => { const {api} = __z; for (const t of api.TH) if (t.k === 'boss') { while (api.live(t)) { t.by = 'h'; __z.Z.bossHit(t); } } __clear(); });
  await sleep(500);
}

if (want('muzzle')) {
  // a defence round the apartments and the radar pad, Shaheds and jets coming in close; close-ups of each helper as it fires, a missile climbing out
  await p.evaluate(() => { const {api, Z} = __z, def = Z.def; __wave(6); for (const s of api.SITES) s.hp = s.max; def.clear();
    [['rack', 6, 3], ['sam', 7], ['gepard', 8], ['flak', 9], ['idome', 10]].forEach(([t, s, l]) => { const d = def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; }); def.deploy();
    const s = api.SITES[2]; for (let i = 0; i < 10; i++) { const t = __z.make(i % 3 ? 'shahed' : 'jet', s.x + (i - 5) * 250, s.z - 1400 - i * 100, s); t.p.y = api.gh(t.p.x, t.p.z) + 220; }
    __z.make('ballistic', s.x + 3000, s.z - 9000, s); window.__look(s.x, s.z, 600, 300, 2.6); });
  const H = await p.evaluate(() => __z.Z.def.D.map(d => { const s = __z.Z.def.SLOTS[d.slot]; return {type: d.type, x: s.x, y: s.y, z: s.z}; }));
  const got = {}; let seen = 0, trail = 0;
  for (let i = 0; i < 40; i++) { await sleep(100);
    const st = await p.evaluate(() => ({mz: __z.Z.fxState().mz, sam: __z.Z.def.shots.filter(h => h.kind !== 'drone' && h.kind !== 'space' && h.fuel > h.P.fuel - 4).map(h => [h.p.x, h.p.y, h.p.z, h.v.x, h.v.y, h.v.z])}));
    seen = Math.max(seen, st.mz.length);
    for (const h of H) { if ((got[h.type] | 0) >= 2 || !st.mz.some(m => Math.hypot(m[0] - h.x, m[2] - h.z) < 12)) continue; got[h.type] = (got[h.type] | 0) + 1;
      await render(`muzzle-${h.type}-${got[h.type]}`, [h.x + 16, h.y + 7, h.z + 20], [h.x, h.y + 2.5, h.z], 50); }
    if (st.sam.length && trail < 2) { const [x, y, z, vx, vy, vz] = st.sam[0], v = Math.hypot(vx, vy, vz) || 1; trail++; const gy = await p.evaluate((x, z) => __z.api.gh(x, z), x + 40, z + 40); await render('muzzle-missile-' + trail, [x + 40, Math.max(y - 10, gy + 8), z + 40], [x, y - 15, z], 60); } }
  console.log('muzzle close-ups', JSON.stringify(got));
  ok(seen > 0 && Object.keys(got).length >= 3, `muzzle flashes seen (max ${seen} at once; close-ups of ${Object.keys(got).join(', ')})`);
  await p.evaluate(() => { clearInterval(window.__hold); __z.Z.def.clear(); });
}

if (want('settings')) {
  await p.keyboard.press('Escape'); await sleep(300);
  const r = await p.evaluate(() => { const m = document.getElementById('f_zmusv'), x = document.getElementById('f_zsfxv'); if (!m || !x) return null; m.value = .4; m.dispatchEvent(new Event('input')); x.value = .65; x.dispatchEvent(new Event('input'));
    const S = JSON.parse(localStorage.getItem('dl-interceptor')); return {mus: S.zmusv, sfx: S.zsfxv, shown: getComputedStyle(m).display !== 'none', out: document.getElementById('o_zmusv').textContent}; });
  ok(r && Math.abs(r.mus - .4) < 1e-6 && Math.abs(r.sfx - .65) < 1e-6 && r.shown, `volume sliders in the menu save (music ${r?.mus}, effects ${r?.sfx}, "${r?.out}")`);
  await p.evaluate(() => document.getElementById('f_zmusv').scrollIntoView()); await shot('settings');
  await p.keyboard.press('Escape'); await sleep(200);
  await p.keyboard.press('KeyB'); await sleep(100); const m1 = await p.evaluate(() => JSON.parse(localStorage.getItem('dl-interceptor')).zmus);
  await p.keyboard.press('KeyB'); await sleep(100); const m2 = await p.evaluate(() => JSON.parse(localStorage.getItem('dl-interceptor')).zmus);
  ok(m1 === 0 && m2 === 1, `B mutes and unmutes the music (${m1} then ${m2})`);
}

if (want('night')) {
  await p.evaluate(() => { const {api, Z} = __z; __clear(); for (const s of api.SITES) s.hp = s.max; Z.wx.set('night'); for (let i = 0; i < 30; i++) api.visuals(1 / 30, performance.now()); });
  const a = await site(2), c = await site(0);
  const nv = async tag => { const n = await p.evaluate(async () => { const m = await import('/games/interceptor/buildings.js'); return {w: m.NIGHT.w.value, apt: +m.NIGHT.apt.value.toFixed(3), vil: +m.NIGHT.vil.value.toFixed(3), beams: __z.api.scene.children.filter(o => o.isMesh && o.geometry.type === 'ConeGeometry' && o.visible).length}; }); console.log('night ' + tag, JSON.stringify(n)); return n; };
  const n1 = await nv('intact');
  await render('night-apts', [a.x + 210, a.y + 70, a.z + 260], [a.x, a.y + 15, a.z], 55);
  await render('night-sites', [0, 300, 2950], [0, 30, 1900], 60);
  const hp = await p.evaluate(() => { const {api} = __z, im = api.scene.children.find(o => o.isInstancedMesh && !o.userData.forest && o.material.map), m = new api.THREE.Matrix4(); im.getMatrixAt(0, m); const v = new api.THREE.Vector3().setFromMatrixPosition(m); return [v.x, v.y, v.z]; });
  await render('night-village', [hp[0] + 120, hp[1] + 45, hp[2] + 90], [hp[0], hp[1] + 2, hp[2]], 60);
  await p.evaluate(() => { const {api} = __z; api.SITES[0].hp = 0; api.SITES[2].hp = Math.round(api.SITES[2].max * .3); for (let i = 0; i < 30; i++) api.visuals(1 / 30, performance.now()); });
  const n2 = await nv('substation down, blocks 30%');
  await render('night-apts-dmg', [a.x + 210, a.y + 70, a.z + 260], [a.x, a.y + 15, a.z], 55);
  await render('night-sites-dmg', [0, 300, 2950], [0, 30, 1900], 60);
  await render('night-village-dark', [hp[0] + 120, hp[1] + 45, hp[2] + 90], [hp[0], hp[1] + 2, hp[2]], 60);
  ok(n1.w > 0 && n1.apt > .4 && n1.vil > .4, 'night: windows lit in the blocks and the villages');
  // searchlight fade: three.js alphaMaps read the green channel, so the beam texture must go from bright green at the lamp (canvas top, v = 1) to black at the far rim
  const bf = await p.evaluate(() => { const m = __z.api.scene.children.find(o => o.isMesh && o.geometry.type === 'ConeGeometry' && o.material.alphaMap), c = m.material.alphaMap.image, g = c.getContext('2d'), h = c.height;
    const px = y => g.getImageData(1, Math.min(h - 1, Math.round(y * h)), 1, 1).data;  /* an opaque grey ramp: a white-to-transparent one keeps green at 255 almost to the rim (the cap) */
    return {lamp: px(0)[1], mid: px(.5)[1], near: px(.9)[1], rim: px(1)[1], opaque: [0, .5, .9, 1].every(y => px(y)[3] === 255)}; });
  ok(bf.opaque && bf.lamp > 200 && bf.mid < bf.lamp && bf.near < 40 && bf.rim < 8, `searchlights fade out along the beam, no visible cap at the far end (alphaMap green: lamp ${bf.lamp}, middle ${bf.mid}, 90% ${bf.near}, far rim ${bf.rim}, opaque ${bf.opaque})`);
  { const e = await p.evaluate(() => { const m = __z.api.scene.children.find(o => o.isMesh && o.geometry.type === 'ConeGeometry' && o.visible && o.material.alphaMap); m.updateMatrixWorld(true); const s = m.position, t = m.localToWorld(new __z.api.THREE.Vector3(0, 2600, 0)); return [s.x, s.y, s.z, t.x, t.y, t.z]; });
    await render('night-beam-end', [e[3] + 300, e[4] + 150, e[5] + 200], [e[3], e[4] - 300, e[5]], 60); }
  ok(n2.apt < n1.apt * .4 && n2.vil < .01 && n2.beams === n1.beams - 1, `damage takes the lights down (blocks ${n2.apt}, villages ${n2.vil}, searchlights ${n1.beams} -> ${n2.beams})`);
  await p.evaluate(() => { const {api, Z} = __z; for (const s of api.SITES) s.hp = s.max; Z.wx.set('clear'); });
}

if (want('snowtrees')) {
  // tree crowns under snow: the pixels the forest covers (a render with the forest minus one without it) must not go near-black against the white fields
  await p.evaluate(() => { const {api, Z} = __z; __clear(); Z.wx.set('snow'); for (let i = 0; i < 30; i++) api.visuals(1 / 30, performance.now()); });
  const r = await p.evaluate(async () => { const {api} = __z, V = api.THREE.Vector3, m = new api.THREE.Matrix4(), v = new V(), F = api.scene.children.filter(o => o.isInstancedMesh && o.userData.forest);
    let best = null; for (const o of F) if (o.geometry.attributes.position.count > 50) for (let i = 0; i < o.count; i += 2) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m); const d = Math.hypot(v.x, v.z - 1950); if (!best || d < best.d) best = {d, p: v.clone()}; }
    const b = best.p, img = async () => { const im = new Image(); im.src = __render([b.x + 45, b.y + 18, b.z + 32], [b.x, b.y, b.z], 60); await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const a = await img(); F.forEach(o => o.visible = false); const n = await img(); F.forEach(o => o.visible = true);
    let s = 0, k = 0, gs = 0, gk = 0; const L = (d, i) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
    for (let i = 0; i < a.length; i += 8) { const la = L(a, i), ln = L(n, i); if (Math.abs(la - ln) > 12) { s += la; k++; } else { gs += la; gk++; } }
    return {trees: +(s / k).toFixed(1), rest: +(gs / gk).toFixed(1), px: k}; });
  await render('snow-trees', ...(await p.evaluate(() => { const c = __z.api.camera; return [[c.position.x, c.position.y, c.position.z], [c.position.x - 45, c.position.y - 18, c.position.z - 32]]; })), 60);
  ok(r.px > 2000 && r.trees > 68 && r.trees > r.rest * .45, `snow: tree crowns frost over instead of going near-black (mean luma ${r.trees} on ${r.px} tree pixels, ${r.rest} elsewhere)`);
  await p.evaluate(() => __z.Z.wx.set('clear'));
}

if (want('integ')) {
  // a real wave with nothing defending: hits on the sites (fires, smoke, damage stages), then real time and views of the sites
  await p.evaluate(() => { const {api, G, Z} = __z; __clear(); Z.def.clear(); if (G.state !== 'base') { G.state = 'clear'; G.clearT = 0; __z.sim(.1); } __z.jump(9, 0); G.next = __z.plan(9); G.next.wx = {id: 'clear'}; __z.cont();
    const lo = [.55, .45, .3, .6], keep = () => api.SITES.forEach((s, i) => s.hp = Math.max(Math.min(s.hp, s.max * lo[i]), s.max * (lo[i] - .12))); keep(); window.__keep = setInterval(keep, 50); for (let i = 0; i < 70; i++) { __z.sim(1); keep(); } });
  await sleep(3000);
  const st = await p.evaluate(() => ({fx: __z.Z.fxState(), stg: __z.api.SITES.map(s => s.stg), hp: __z.api.SITES.map(s => Math.round(s.hp / s.max * 100))}));
  console.log('integ wave', JSON.stringify({fires: st.fx.fires, smoke: st.fx.smoke, stages: st.stg, hp: st.hp}));
  for (const i of [0, 1, 2]) { const s = await site(i), k = 1.6; await render(`integ-site${i}`, [s.x + s.r * k * .8, s.y + s.r * k * .55, s.z + s.r * k], [s.x, s.y + 6, s.z], 55); }
  const s0 = await site(0); await p.evaluate(s => window.__look(s.x, s.z, 260, 60, 2.2), s0); await sleep(900); await shot('integ-chase');
  // thermal FPV on the damaged blocks
  const s2 = await site(2); await p.evaluate(s => { window.__look(s.x, s.z, 330, 40, 2.6, true); __z.api.player.home = {n: 'POS NEAR', x: s.x + 200, y: s.y, z: s.z + 300}; }, s2);
  await p.keyboard.press('KeyC'); await p.keyboard.press('KeyC'); await sleep(600); await shot('integ-fpv-day');
  await p.keyboard.press('KeyH'); await sleep(600); await shot('integ-fpv-thermal');
  await p.evaluate(() => __z.Z.wx.set('night')); await sleep(800); await shot('integ-fpv-thermal-night');
  await p.keyboard.press('KeyH'); await sleep(600); await shot('integ-fpv-night');
  // snow on the new ground, from the chase camera low over the fields and over a site
  await p.evaluate(() => __z.Z.wx.set('snow')); await p.keyboard.press('KeyC'); await sleep(200);
  await p.evaluate(() => window.__look(700, -1300, 120, 12, 2.4)); await sleep(1500); await shot('integ-snow-fields');
  await p.evaluate(s => window.__look(s.x, s.z, 300, 50, 2.2), s0); await sleep(1200); await shot('integ-snow-site');
  await p.evaluate(() => { clearInterval(window.__keep); clearInterval(window.__hold); });
}

// the menu afterwards: no time scale, no cinematic, no night lights
const cl = await p.evaluate(async () => { __z.api.startDemo(); const m = await import('/games/interceptor/buildings.js'); return {tsc: __z.Z.tsc, cine: __z.Z.cine, night: m.NIGHT.w.value}; });
ok(cl.tsc === 1 && !cl.cine && cl.night === 0, 'menu: time scale 1, no cinematic cam, no night lights');
ok(!errs.length, 'no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
await b.close(); server.close(); process.exit(fails ? 1 : 0);
