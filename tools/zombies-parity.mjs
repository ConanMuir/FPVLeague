// Pixel parity of what a merge or a batch touches in Zombies: the same things drawn by the game's own renderer from fixed cameras into a render target, with only their own lights and scene (no sky, no
// post-processing, nothing that moves), so two builds can be compared pixel for pixel. The raw linear pixels go to OUTDIR/*.bin (and a gamma-corrected PNG next to each), the draw calls and meshes per view to info.json.
//   node tools/zombies-parity.mjs buddy OUTDIR     Little Buddy's model (zbudmodel.js): 7 garage loadouts (League parts, cosmetics) x 4 cameras, props at angle 0; ONLY=a,f runs some loadouts
//   node tools/zombies-parity.mjs sites OUTDIR     the enemy sites (zsites.js): 3 launch sites and 3 factories built from fixed seeds, a launcher, a gun and a hall wrecked, 3 cameras at each
//   node tools/zombies-parity.mjs --cmp DIR_A DIR_B  per image the mean and largest channel difference and the pixels that differ (any, over 3, over 15 of 255), then the draw calls and meshes of each view
// It serves and measures the checkout it sits in: copy the file into an older worktree's tools/ for the "before". buddy also times 150 renders of the model alone (cpuMs, the median of 7 runs).
import fs from 'node:fs';
import path from 'node:path';
import {serve, launch, open, sleep} from './zlib.mjs';
const A = process.argv.slice(2);
if (A[0] === '--cmp') {
  const [a, b] = A.slice(1); let worst = 0;
  for (const f of fs.readdirSync(a).filter(f => f.endsWith('.bin'))) {
    const x = fs.readFileSync(path.join(a, f)), y = fs.readFileSync(path.join(b, f)); let s = 0, mx = 0, n0 = 0, n3 = 0, n15 = 0, lit = 0;
    for (let i = 0; i < x.length; i += 4) { const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])); s += d; if (d > mx) mx = d; if (d > 0) n0++; if (d > 3) n3++; if (d > 15) n15++; if (x[i] + x[i + 1] + x[i + 2] > 12) lit++; }
    worst = Math.max(worst, mx); console.log(f.padEnd(14), `mean ${(s / (x.length / 4)).toFixed(4)} max ${mx} px>0 ${n0} px>3 ${n3} px>15 ${n15} of ${lit} lit px`);
  }
  const ia = JSON.parse(fs.readFileSync(path.join(a, 'info.json'))), ib = JSON.parse(fs.readFileSync(path.join(b, 'info.json')));
  console.log('draw calls (main + shadow) and drawn meshes per view, A -> B:'); for (const v of ia.views) { const w = ib.views.find(q => q.name === v.name); console.log('  ', v.name.padEnd(10), v.calls, '->', w?.calls, '  meshes', v.meshes, '->', w?.meshes); }
  console.log('worst channel difference', worst); process.exit(0);
}
const [MODE, OUT] = A; if (!/^(buddy|sites)$/.test(MODE) || !OUT) { console.log('usage: zombies-parity.mjs buddy|sites OUTDIR   |   --cmp DIR_A DIR_B'); process.exit(2); }
fs.mkdirSync(OUT, {recursive: true});
const LOADS = {a: {loadout: ['truex', 'brick', 'hikv', 'ram'], cos: {paint: 'cobalt', props: 'ice', bell: 'gold', led: 'cyan'}}, b: {loadout: ['stock', 'stock', 'stock', 'none']}, c: {loadout: ['deadcat', 'slim', 'lr', 'cage']},
  d: {loadout: ['squash', 'plank', 'eff', 'armor'], cos: {paint: 'gold', props: 'team'}}, e: {loadout: ['truex', 'stock', 'punch', 'wheels']}, f: {loadout: ['stretch', 'pod', 'lr', 'ducts']},
  g: {loadout: ['stock', 'brick', 'lr', 'ducts'], cos: {paint: 'carbon', props: 'red', bell: 'silver', led: 'lime'}}};
const seed = () => { let s = 12345; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
/* in the page: draw scene sc from cam into a render target (shadow map updated), return its raw pixels (flipped upright) and a gamma-corrected PNG */
const PX = () => {
  window.__px = (rt, sc, cam, W, H) => { const {api} = __z, ren = api.renderer, sm = ren.shadowMap, sa = sm.autoUpdate, rt0 = ren.getRenderTarget(), inf = ren.info;
    inf.autoReset = false; inf.reset(); sm.autoUpdate = true; sm.needsUpdate = true; ren.setRenderTarget(rt); ren.clear(); ren.render(sc, cam); ren.setRenderTarget(rt0); sm.autoUpdate = sa; const calls = inf.render.calls; inf.autoReset = true;
    const px = new Uint8Array(W * H * 4); ren.readRenderTargetPixels(rt, 0, 0, W, H, px); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H), flat = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4; for (let k = 0; k < 3; k++) { im.data[d + k] = Math.round(255 * Math.pow(px[s + k] / 255, 1 / 2.2)); flat[d + k] = px[s + k]; } im.data[d + 3] = flat[d + 3] = 255; }
    g.putImageData(im, 0, 0); let bin = ''; for (let i = 0; i < flat.length; i += 8192) bin += String.fromCharCode.apply(null, flat.subarray(i, i + 8192)); return {png: c.toDataURL('image/png').split(',')[1], bin: btoa(bin), calls}; };
};
const save = (name, v) => { fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(v.png, 'base64')); fs.writeFileSync(path.join(OUT, name + '.bin'), Buffer.from(v.bin, 'base64')); };
const {server, origin} = await serve(), b = await launch(), errs = [], info = {views: []};
async function boot(save) {
  const p = await b.newPage(); await p.evaluateOnNewDocument(seed); await open(b, origin + '/games/interceptor/', errs, {page: p});
  await p.evaluate(s => { localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', cam: 0, fps: false, zmus: 0, gfx: 'high'})); if (s) localStorage.setItem('droneleague', JSON.stringify({...s, physV: 5})); }, save);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(400); await p.click('#play'); await sleep(500); await p.evaluate(PX); return p;
}
if (MODE === 'buddy') for (const [name, sv] of Object.entries(LOADS)) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
  const p = await boot(sv); await p.evaluate(() => { const {G} = __z; __z.jump(6, 20000); G.next = __z.plan(6); __z.cont(); __z.sim(3); }); await sleep(1500); await p.evaluate(() => __z.sim(1)); await sleep(500);
  const r = await p.evaluate(() => {
    const {G, Z, api} = __z, T = api.THREE, bd = Z.bd.mine, ren = api.renderer, m = bd.model; if (!m) return {err: 'no model'};
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    const sc = new T.Scene(), W = 600, H = 400, rt = new T.WebGLRenderTarget(W, H, {type: T.UnsignedByteType, samples: 0});
    sc.environment = api.scene.environment; sc.add(new T.HemisphereLight(0xbfd8ff, 0x403830, .9));
    const sun = new T.DirectionalLight(0xfff0d8, 2.4); sun.position.set(6, 12, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); const s2 = sun.shadow.camera; s2.left = s2.bottom = -4; s2.right = s2.top = 4; s2.near = 1; s2.far = 40; sun.shadow.bias = -.0005; sc.add(sun, sun.target);
    const ground = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshStandardMaterial({color: 0x555555, roughness: 1})); ground.rotation.x = -Math.PI / 2; ground.position.y = -.35; ground.receiveShadow = true; sc.add(ground);
    m.grp.removeFromParent(); m.grp.visible = true; m.grp.position.set(0, 0, 0); m.grp.quaternion.identity(); for (const pr of m.props) pr.rotation.y = 0; sc.add(m.grp);
    const cam = new T.PerspectiveCamera(40, W / H, .1, 100), out = {views: []}, meshes = []; m.grp.traverse(o => { if (o.isMesh) meshes.push(o); }); out.meshes = meshes.length; out.casters = meshes.filter(o => o.castShadow).length;
    for (const v of [[3.2, 1.6, 5.2], [-4.4, 3.4, -3.6], [0, 7.5, .5], [1.4, -.2, 2.2]]) { cam.position.set(...v); cam.up.set(0, 1, 0); cam.lookAt(0, .3, 0); cam.updateMatrixWorld(); out.views.push(__px(rt, sc, cam, W, H)); }
    cam.position.set(3.2, 1.6, 5.2); cam.lookAt(0, .3, 0); cam.updateMatrixWorld(); const sm = ren.shadowMap, rt0 = ren.getRenderTarget(), T7 = []; for (let i = 0; i < 20; i++) { sm.needsUpdate = true; ren.setRenderTarget(rt); ren.render(sc, cam); }
    for (let rep = 0; rep < 7; rep++) { const t0 = performance.now(); for (let i = 0; i < 150; i++) { sm.needsUpdate = true; ren.setRenderTarget(rt); ren.render(sc, cam); } T7.push((performance.now() - t0) / 150); } ren.setRenderTarget(rt0); T7.sort((x, y) => x - y); out.cpuMs = +T7[3].toFixed(3); return out; });
  if (r.err) { console.log(name, r.err); await p.close(); continue; }
  r.views.forEach((v, i) => { save(`${name}-${i}`, v); info.views.push({name: `${name}-${i}`, calls: v.calls, meshes: r.meshes}); }); (info.models ||= {})[name] = {meshes: r.meshes, casters: r.casters, cpuMs: r.cpuMs};
  console.log(`loadout ${name}: ${r.meshes} meshes, ${r.casters} shadow casters, ${r.cpuMs} ms of CPU for one render of the model alone`); await p.close();
}
if (MODE === 'sites') {
  const p = await boot(null);
  const r = await p.evaluate(async () => {
    const {G, Z, api} = __z, T = api.THREE, W = Z.so.W; __z.cont(); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    /* three.js draws a random number for every id it gives an object, so a build that makes more objects shifts Math.random: every site is built from its own seed, and the fog starts unknown */
    const rs = n => { let s = n; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
    Z.so.fog.reset(); rs(777); W.reset(4242); for (let s = 0; s < 3; s++) { rs(100 + s); W.build('launch', s, 26); } for (let s = 0; s < 3; s++) { rs(200 + s); W.build('factory', s, 26); }
    const L = W.list.filter(t => t.t !== 'convoy'), l0 = L.find(t => t.t === 'launch'), f0 = L.find(t => t.t === 'factory'), out = {sites: L.map(t => `${t.t}@${Math.round(t.x)},${Math.round(t.z)}`), views: []};
    W.wreck(l0, l0.parts.find(q => q.t === 'tel'), true); W.wreck(l0, l0.parts.find(q => q.aa), true); W.wreck(f0, f0.parts.find(q => q.t === 'hall'), true);
    for (const t of L) for (const q of t.parts) if (q.tur) { q.tur.rotation.y = .7; q.tur.rotation.x = -.2; }
    const sc = new T.Scene(), Wd = 800, Ht = 500, rt = new T.WebGLRenderTarget(Wd, Ht, {type: T.UnsignedByteType, samples: 0});
    sc.environment = api.scene.environment; sc.fog = api.scene.fog; sc.add(new T.HemisphereLight(0xbfd8ff, 0x403830, .9));
    const sun = new T.DirectionalLight(0xfff0d8, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const s2 = sun.shadow.camera; s2.left = s2.bottom = -90; s2.right = s2.top = 90; s2.near = 1; s2.far = 400; sun.shadow.bias = -.0005; sc.add(sun, sun.target);
    const ground = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshStandardMaterial({color: 0x4a5a3a, roughness: 1})); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
    api.scene.remove(W.root); W.root.visible = true; sc.add(W.root); const cam = new T.PerspectiveCamera(50, Wd / Ht, 1, 3000); let i = 0;
    for (const t of L) { i++; const n = t.t[0] + i;
      for (const [k, off] of [['obl', t.t === 'factory' ? [80, 45, 120] : [50, 30, 80]], ['top', [1, t.t === 'factory' ? 170 : 110, 1]], ['low', [-70, 10, -60]]]) {
        ground.position.set(t.x, t.y - .2, t.z); sun.position.set(t.x + 90, t.y + 150, t.z + 70); sun.target.position.set(t.x, t.y, t.z); sun.target.updateMatrixWorld();
        cam.position.set(t.x + off[0], t.y + off[1], t.z + off[2]); cam.up.set(0, 1, 0); cam.lookAt(t.x, t.y + 6, t.z); cam.updateMatrixWorld(); let meshes = 0; W.root.traverseVisible(o => { if (o.isMesh) meshes++; });
        out.views.push({name: `${n}-${k}`, meshes, ...__px(rt, sc, cam, Wd, Ht)}); } }
    W.root.parent.remove(W.root); api.scene.add(W.root); return out; });
  for (const v of r.views) { save(v.name, v); info.views.push({name: v.name, calls: v.calls, meshes: v.meshes}); } info.sites = r.sites;
  console.log(r.sites.join('  ')); console.log(info.views.map(v => `${v.name} ${v.calls}c/${v.meshes}m`).join('  ')); await p.close();
}
fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify(info, null, 1));
console.log(errs.length ? 'errors:\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : 'no errors'); await b.close(); server.close(); process.exit(0);
