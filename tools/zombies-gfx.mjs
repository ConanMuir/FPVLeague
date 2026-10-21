// Graphics quality, FPS meter and shader warm-up check for the Interceptor (engine/gfx.js, games/interceptor/igfx.js, engine/warm.js).
//   node tools/zombies-gfx.mjs [--shots] [--hitch] [--prox]
// Always: the page loads clean, the warm-up runs during the menu, the Graphics setting switches live through Low / Medium / High / Auto
// (pixel ratio, shadow map, forest tiles) and is saved and validated, the FPS meter shows and hides with its setting.
// --shots: screenshots to shots/gfx-*.png (Classic and a Zombies wave at 1280x720 on High and Low, the meter at 900x640).
// --prox: proximity falloff on High off vs on from two fixed views (pixel difference, render time), plus haze and Low (shots/gfx-prox*.png).
// --hitch: first-use cost of an explosion, the Mothership, three weather changes and the thermal camera, with and without the warm-up
// (?nowarm): shader programs compiled at that moment and the longest frame right after it.
import fs from 'node:fs';
import path from 'node:path';
import {serve, launch, open, sleep, root} from './zlib.mjs';
const A = process.argv.slice(2), SHOTS = A.includes('--shots'), HITCH = A.includes('--hitch'), PROX = A.includes('--prox');
const {server, origin} = await serve(); const b = await launch(); const errs = []; let fails = 0;
const chk = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };
const dir = path.join(root, 'shots'); if (SHOTS || PROX) fs.mkdirSync(dir, {recursive: true});
async function page(store, {w = 1280, h = 720, q = ''} = {}) {
  const p = await open(b, origin + '/games/interceptor/' + q, errs, {w, h});
  p.on('console', async m => { if (m.type() === 'error') console.log('  console.error', (await Promise.all(m.args().map(a => a.evaluate(x => x?.stack || String(x)).catch(() => '?')))).join(' ').slice(0, 600)); });
  await p.evaluate(s => localStorage.setItem('dl-interceptor', JSON.stringify(s)), store);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z?.gfx, {timeout: 120000}); return p;
}
const setSel = (p, id, v) => p.$eval('#f_' + id, (e, v) => { e.value = JSON.stringify(v); e.dispatchEvent(new Event('input')); }, v);
const state = p => p.evaluate(() => { const {api, gfx} = __z, sc = api.scene, f = sc.children.filter(o => o.userData.forest && o.userData.tile);
  return {pref: gfx.pref, level: gfx.level, pr: +api.renderer.getPixelRatio().toFixed(3), sh: api.sun.shadow.mapSize.x, treeSh: f.some(o => o.castShadow), tiles: f.length,
    drawn: f.filter(o => o.visible).reduce((a, o) => a + o.count, 0), all: f.reduce((a, o) => a + o.userData.n, 0), meter: !document.getElementById('fpsm')?.hidden,
    saved: JSON.parse(localStorage.getItem('dl-interceptor')).gfx}; });

// ---------- levels, validation, meter ----------
{
  const p = await page({gmode: 'classic', wx: 'clear', cam: 0, gfx: 'bogus'});
  await p.waitForFunction(() => __z.warm.ran, {timeout: 60000}).catch(() => {});
  const w = await p.evaluate(() => ({...__z.warm}));
  chk(w.ran, `warm-up ran during the menu: ${w.programs} programs in ${w.ms} ms`);
  let s = await state(p); chk(s.pref === 'auto' && s.level === 'high', `a bad saved value loads as Auto (High): ${s.pref} / ${s.level}`);
  await p.click('#play'); await sleep(1500);
  const R = {};
  for (const q of ['low', 'med', 'high', 'auto']) { await p.keyboard.press('Escape'); await sleep(200); await setSel(p, 'gfx', q); await p.click('#resume').catch(() => {}); await sleep(800); R[q] = s = await state(p); console.log('   ', q.padEnd(5), JSON.stringify(s)); }
  chk(R.low.level === 'low' && R.low.sh === 1024 && !R.low.treeSh && R.low.drawn < R.low.all, 'Low: 1024 shadow map, no tree shadows, fewer trees drawn');
  chk(R.med.level === 'med' && R.med.sh === 2048 && R.med.treeSh, 'Medium: 2048 shadow map, tree shadows');
  chk(R.high.level === 'high' && R.high.sh === 4096 && R.high.treeSh && R.high.drawn === R.high.all, 'High: 4096 shadow map, tree shadows, every tree (as before)');
  chk(R.low.pr < R.med.pr && R.med.pr < R.high.pr, `pixel ratio falls with the level: ${R.low.pr} < ${R.med.pr} < ${R.high.pr}`);
  chk(R.auto.pref === 'auto' && R.auto.saved === 'auto', 'Auto is saved');
  chk(s.meter, 'FPS meter shows by default');
  await p.keyboard.press('Escape'); await sleep(200); await setSel(p, 'fps', false); await p.click('#resume').catch(() => {}); await sleep(300);
  chk(!(await state(p)).meter && await p.evaluate(() => JSON.parse(localStorage.getItem('dl-interceptor')).fps === false), 'FPS meter hides and the Off is saved');
  await p.close();
}

// ---------- screenshots ----------
if (SHOTS) {
  const shot = async (name, store, setup, opt) => { const p = await page(store, opt); await sleep(1500); await p.click('#play'); await sleep(800); await p.evaluate(setup); await sleep(2500);
    await p.screenshot({path: path.join(dir, `gfx-${name}.png`)}); await p.close(); console.log('  shot shots/gfx-' + name + '.png'); };
  const wave = () => { __z.jump(12, 5000); __z.G.next = __z.plan(12); __z.cont(); __z.sim(20); };
  for (const g of ['high', 'low']) {
    await shot('classic-' + g, {gmode: 'classic', wx: 'clear', cam: 1, gfx: g}, () => __z.sim(4));
    await shot('zombies-' + g, {gmode: 'z', wx: 'clear', zwx: 'menu', cam: 1, gfx: g}, wave);
  }
  await shot('zombies-narrow', {gmode: 'z', wx: 'clear', zwx: 'menu', cam: 1, gfx: 'auto'}, wave, {w: 900, h: 640});
  await shot('classic-narrow', {gmode: 'classic', wx: 'clear', cam: 0, gfx: 'auto'}, () => __z.sim(2), {w: 900, h: 640});
}

// ---------- proximity detail falloff on High: the same view from 500 m up with it off and on, compared pixel by pixel ----------
// (rendered straight after each other from a fixed camera, read back from the canvas). Also the view with distance haze and on Low.
if (PROX) {
  const p = await page({gmode: 'classic', wx: 'clear', cam: 1, gfx: 'high'}); await sleep(2500);
  const grab = (mode) => p.evaluate(async mode => {
    const {api, gfx} = __z, H = __z.gfxGK.high, keep = {lodD: H.lodD, gFar: H.gFar, detD: H.detD};
    if (mode === 'off') Object.assign(H, {lodD: Infinity, gFar: 1e9, detD: 1e9});
    gfx.haze = mode === 'haze'; gfx.set(mode === 'low' ? 'low' : 'high');
    const c = api.camera, r = api.renderer, out = [];
    for (const [x, y, z, tx, tz] of [[0, 500, 2600, 0, -2500], [-1800, 120, 400, 600, -3000]]) {
      c.position.set(x, y, z); c.lookAt(tx, 0, tz); c.updateMatrixWorld();
      for (let i = 0; i < 3; i++) { api.scene.onBeforeRender(r, api.scene, c); __z.composer.render(); }  /* tiles and uniforms settle */
      const gl = r.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < 3; i++) { __z.composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } const ms = (performance.now() - t0) / 3;
      __z.composer.render(); out.push({png: r.domElement.toDataURL('image/png'), ms: +ms.toFixed(1)});
    }
    Object.assign(H, keep); gfx.haze = false; gfx.set('high'); return out;
  }, mode);
  const diff = (a, b) => p.evaluate(async (a, b) => { const im = async s => { const i = new Image(); i.src = s; await i.decode(); return i; }; const A = await im(a), B = await im(b);
    const c = document.createElement('canvas'), w = c.width = A.width, h = c.height = A.height, g = c.getContext('2d'); g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, w, h).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, w, h).data;
    let s = 0, n = 0; for (let i = 0; i < da.length; i += 4) { const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3; s += d; if (d > 12) n++; } return {mean: +(s / (w * h)).toFixed(2), over12: +(100 * n / (w * h)).toFixed(2)}; }, a, b);
  const R = {}; for (const m of ['off', 'on', 'haze', 'low']) R[m] = await grab(m);
  for (let v = 0; v < 2; v++) {
    for (const m of ['off', 'on', 'haze', 'low']) fs.writeFileSync(path.join(dir, `gfx-prox${v}-${m}.png`), Buffer.from(R[m][v].png.split(',')[1], 'base64'));
    const d = await diff(R.off[v].png, R.on[v].png);
    console.log(`  view ${v}: render ms  off ${R.off[v].ms}  on ${R.on[v].ms}  haze ${R.haze[v].ms}  low ${R.low[v].ms}; High off vs on: mean diff ${d.mean}/255, ${d.over12}% of pixels differ by more than 12`);
    chk(d.mean < 2, `view ${v}: proximity falloff on High is not visibly different (mean ${d.mean}/255)`);
  }
  await p.close();
}

// ---------- first-use hitch, with and without the warm-up ----------
if (HITCH) {
  const run = async q => {
    const p = await page({gmode: 'z', wx: 'clear', zwx: 'wave', cam: 0, gfx: 'high'}, {q});
    await sleep(4000); await p.click('#play'); await sleep(1500);
    await p.evaluate(() => { __z.jump(3, 5000); __z.G.next = __z.plan(3); __z.G.next.wx = {id: 'clear'}; __z.cont(); });
    await sleep(3000);
    const ev = async (name, fn) => p.evaluate(async (name, fn) => {
      const raf = () => new Promise(r => requestAnimationFrame(r)), info = __z.api.renderer.info;
      const base = []; let l = await raf(); for (let i = 0; i < 6; i++) { const t = await raf(); base.push(t - l); l = t; }
      const p0 = info.programs.length; (0, eval)('(' + fn + ')')(); let mx = 0; l = await raf();
      for (let i = 0; i < 4; i++) { const t = await raf(); mx = Math.max(mx, t - l); l = t; }
      base.sort((a, b) => a - b); return {name, programs: info.programs.length - p0, worst: Math.round(mx), typical: Math.round(base[3])};
    }, name, fn.toString());
    const out = [];
    out.push(await ev('explosion', () => { const c = __z.api.camera, d = new c.position.constructor(0, 0, -60).applyQuaternion(c.quaternion).add(c.position); __z.api.boom(d, 2.5); }));
    out.push(await ev('mothership', () => { const t = __z.make('boss', 0, 0); const c = __z.api.camera; t.p.copy(new c.position.constructor(0, 0, -120).applyQuaternion(c.quaternion).add(c.position)); }));
    for (const w of ['night', 'snow', 'storm']) out.push(await ev('weather ' + w, new Function(`__z.Z.wx.set('${w}')`)));
    out.push(await ev('thermal', () => document.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyH', key: 'h', bubbles: true}))));
    await p.close(); return out;
  };
  const cold = await run('?nowarm'), warm = await run('');
  console.log('\n  first use            no warm-up (programs / worst frame / typical)   with warm-up');
  cold.forEach((c, i) => { const w = warm[i]; console.log(`  ${c.name.padEnd(18)} ${String(c.programs).padStart(3)} / ${String(c.worst).padStart(5)} ms / ${String(c.typical).padStart(4)} ms` + ' '.repeat(22) + `${String(w.programs).padStart(3)} / ${String(w.worst).padStart(5)} ms / ${String(w.typical).padStart(4)} ms`); });
  const cp = cold.reduce((a, c) => a + c.programs, 0), wp = warm.reduce((a, c) => a + c.programs, 0);
  chk(wp < cp || cp === 0, `the warm-up leaves fewer shaders to compile in play: ${cp} without, ${wp} with`);
}
chk(!errs.length, errs.length ? 'page errors:\n' + errs.join('\n') : 'no page errors');
await b.close(); server.close(); process.exit(fails ? 1 : 0);
