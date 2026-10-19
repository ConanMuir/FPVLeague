// Terrain and building screenshots for eyeballing: node tools/zombies-terrain-shots.mjs OUTDIR [ground] [sites] [classic] [gpu]
//  ground   the farmland from a chase-cam height, 40 m, 300 m and 1500 m
//  sites    every defended site (and the command bunker) at each damage stage: 100 / 75 / 50 / 25 / 0 % HP, then repaired
//  classic  Classic mode: the sites from the menu's demo camera height (no damage states there)
//  gpu      GPU time per frame (render + gl.finish, not vsync-bound) from the chase cam and from altitude
// Frames are rendered straight from the scene camera (no HUD, no bloom), so the base screen and the OSD don't get in the way.
import fs from 'node:fs';
import {serve, launch, open, sleep} from './zlib.mjs';
const [OUT, ...what] = process.argv.slice(2), want = k => !what.length || what.includes(k);
fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve(); const b = await launch(); const errs = [];
async function page(mode) {
  const p = await open(b, origin + '/games/interceptor/', errs);
  await p.evaluate(m => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: m, wx: 'clear', cam: 1})), mode);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500);
  await p.click('#play'); await sleep(600);
  // shot(): put the camera at pos looking at tgt, move the sun's shadow box there, render once and return a PNG
  await p.evaluate(() => {
    const {api} = __z, sc = api.scene, sun = sc.children.find(o => o.isDirectionalLight), V = api.THREE.Vector3;
    window.__shot = (pos, tgt, fov = 60) => { const cam = api.camera, d = new V().subVectors(sun.position, sun.target.position).normalize();
      cam.position.set(...pos); cam.lookAt(new V(...tgt)); cam.fov = fov; cam.updateProjectionMatrix();
      const f = new V(...tgt); sun.target.position.copy(f); sun.position.copy(f).addScaledVector(d, 700); sun.target.updateMatrixWorld();
      for (const o of sc.children) if (o.isMesh && o.material?.uniforms?.sunPosition) o.position.copy(cam.position);
      api.renderer.render(sc, cam); return api.renderer.domElement.toDataURL('image/png'); };
    window.__gy = (x, z) => api.gh(x, z);
  });
  return p;
}
const save = async (p, name, pos, tgt, fov) => { const u = await p.evaluate((a, b, c) => __shot(a, b, c), pos, tgt, fov); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(u.split(',')[1], 'base64')); };
const at = async (p, x, z, h) => (await p.evaluate((x, z) => __gy(x, z), x, z)) + h;

if (want('ground') || want('sites') || want('gpu')) {
  const p = await page('z');
  if (want('ground')) {
    const x = 700, z = -1300;
    await save(p, 'ground-chase', [x, await at(p, x, z, 4), z], [x - 20, await at(p, x - 20, z - 60, 0), z - 60], 65);
    await save(p, 'ground-chase2', [-1500, await at(p, -1500, 600, 6), 600], [-1450, await at(p, -1450, 520, 0), 520], 65);
    await save(p, 'ground-40m', [x, await at(p, x, z, 40), z], [x - 80, await at(p, x - 80, z - 260, 0), z - 260], 60);
    await save(p, 'ground-300m', [x, await at(p, x, z, 300), z], [x - 300, await at(p, x - 300, z - 1100, 0), z - 1100], 60);
    await save(p, 'ground-1500m', [0, 1500, 2600], [0, 0, 300], 60);
    await save(p, 'ground-sites-200m', [0, 260, 2900], [0, 40, 1800], 60);
    // a village street: the first instanced house, from 45 m off at 14 m up
    const hp = await p.evaluate(() => { const {api} = __z, im = api.scene.children.find(o => o.isInstancedMesh && !o.userData.forest && o.material.map), m = new api.THREE.Matrix4(); im.getMatrixAt(0, m); const v = new api.THREE.Vector3().setFromMatrixPosition(m); return [v.x, v.y, v.z]; });
    // snow cover hook (Zombies weather sets it): the same 300 m view under full snow
    await p.evaluate(() => { __z.api.groundSnow = 1; });
    await save(p, 'ground-snow-300m', [x, await at(p, x, z, 300), z], [x - 300, await at(p, x - 300, z - 1100, 0), z - 1100], 60);
    await p.evaluate(() => { __z.api.groundSnow = 0; });
    await save(p, 'ground-village',[hp[0] + 40, hp[1] + 14, hp[2] + 25], [hp[0], hp[1] + 2, hp[2]], 60);
  }
  if (want('sites')) {
    await p.evaluate(() => { __z.Z.bunker(true); });
    const views = await p.evaluate(() => __z.api.SITES.map(s => ({n: s.n, x: s.x, z: s.z, y: s.y ?? __z.api.gh(s.x, s.z), r: s.r})));
    for (const [i, v] of views.entries()) {
      const k = v.r < 30 ? 2.6 : 1.45, pos = [v.x + v.r * k * .8, v.y + v.r * k * .55, v.z + v.r * k], tgt = [v.x, v.y + 6, v.z];
      for (const f of [1, .75, .5, .25, 0]) {
        await p.evaluate((i, f) => { const s = __z.api.SITES[i]; s.hp = Math.round(s.max * f); for (let k = 0; k < 40; k++) __z.api.visuals(1 / 20, performance.now()); }, i, f);
        await save(p, `site${i}-${Math.round(f * 100)}`, pos, tgt, 55);
        if (f === 1 || f === .5 || f === 0) await save(p, `site${i}-${Math.round(f * 100)}-close`, [v.x + v.r * .55, v.y + Math.max(10, v.r * .22), v.z + v.r * .7], [v.x - v.r * .1, v.y + 6, v.z], 60);
      }
      // repaired between waves: back to the intact stage (and its collision boxes)
      const rep = await p.evaluate(i => { const s = __z.api.SITES[i], seen = []; for (const f of [1, .75, .5, .25, 0]) { s.hp = Math.round(s.max * f); __z.api.visuals(1 / 60, performance.now()); seen.push(s.stg); }
        s.hp = s.max; for (let k = 0; k < 80; k++) __z.api.visuals(1 / 20, performance.now()); return {seen, after: s.stg, sol: s.sol.length}; }, i);
      console.log(`${v.n}: stages ${rep.seen.join('/')} at 100/75/50/25/0 %, after repair ${rep.after}, ${rep.sol} collision shapes`);
      await save(p, `site${i}-repaired`, pos, tgt, 55);
    }
  }
  if (want('gpu')) {
    // GPU time per frame: render the scene and read a pixel back (forces the GPU to finish; not vsync-bound). Median of 15 per view,
    // with everything, without shadows and without the instanced forest/houses, so the ground's own cost shows apart from the trees
    const r = await p.evaluate(() => { const {api} = __z, gl = api.renderer.getContext(), sc = api.scene, cam = api.camera, V = api.THREE.Vector3, out = {}, px = new Uint8Array(4);
      const sun = sc.children.find(o => o.isDirectionalLight), d = new V().subVectors(sun.position, sun.target.position).normalize();
      const run = (pos, tgt) => { cam.position.set(...pos); cam.lookAt(new V(...tgt)); cam.fov = 65; cam.updateProjectionMatrix(); sun.target.position.set(pos[0], api.gh(pos[0], pos[2]), pos[2]); sun.position.copy(sun.target.position).addScaledVector(d, 700); sun.target.updateMatrixWorld();
        const t = () => { api.renderer.render(sc, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
        for (let i = 0; i < 3; i++) t(); const ts = []; for (let i = 0; i < 15; i++) { const t0 = performance.now(); t(); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b); return +ts[7].toFixed(1); };
      const gy = (x, z) => api.gh(x, z), views = {chase: [[700, gy(700, -1300) + 4, -1300], [680, gy(680, -1360), -1360]], sites: [[0, 120, 2700], [0, 20, 1900]], high: [[0, 1500, 2600], [0, 0, 300]]};
      const trees = sc.children.filter(o => o.isInstancedMesh);
      for (const [k, [a, b]] of Object.entries(views)) { out[k] = run(a, b); api.renderer.shadowMap.enabled = false; out[k + ' noshadow'] = run(a, b); api.renderer.shadowMap.enabled = true;
        trees.forEach(o => o.visible = false); out[k + ' notrees'] = run(a, b); trees.forEach(o => o.visible = true); }
      out.gpu = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); return out; });
    console.log('gpu ms/frame (render + readback, median of 15)', JSON.stringify(r));
  }
  await p.close();
}
if (want('classic')) {
  const p = await page('classic');
  await save(p, 'classic-sites', [0, 320, 2950], [0, 30, 1900], 55);
  await save(p, 'classic-sub', [-720 + 90, await at(p, -720, 1750, 60), 1750 + 110], [-720, await at(p, -720, 1750, 6), 1750], 55);
  await p.close();
}
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
