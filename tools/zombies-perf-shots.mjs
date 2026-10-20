// Same-seed, same-view screenshots of Zombies for before/after comparisons of renderer and effects changes (forest, clouds, particles, weather).
// Math.random is seeded before the page loads and every view is a fixed camera, so two builds can be compared picture for picture.
//   node tools/zombies-perf-shots.mjs OUTDIR [view,...]      views: forest sites smoke storm snow overcast high night thermal burn
//   node tools/zombies-perf-shots.mjs --diff DIR_A DIR_B     mean / max channel difference per view (and the share of pixels off by > 24)
import fs from 'node:fs';
import path from 'node:path';
import {serve, launch, open, sleep} from './zlib.mjs';
const A = process.argv.slice(2);
if (A[0] === '--diff') {
  const b = await launch(), p = await b.newPage();
  for (const f of fs.readdirSync(A[1]).filter(f => f.endsWith('.png'))) {
    if (!fs.existsSync(path.join(A[2], f))) continue;
    const r = await p.evaluate(async (x, y) => { const ld = async s => { const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const a = await ld(x), c = await ld(y); let s = 0, mx = 0, big = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - c[i]), Math.abs(a[i + 1] - c[i + 1]), Math.abs(a[i + 2] - c[i + 2])); s += d; if (d > mx) mx = d; if (d > 24) big++; }
      return {mean: +(s / (a.length / 4)).toFixed(2), max: mx, off24: +(100 * big / (a.length / 4)).toFixed(2) + '%'}; }, fs.readFileSync(path.join(A[1], f), 'base64'), fs.readFileSync(path.join(A[2], f), 'base64'));
    console.log(f.padEnd(16), JSON.stringify(r));
  }
  await b.close(); process.exit(0);
}
const OUT = A[0], ONLY = (A[1] || '').split(',').filter(Boolean); fs.mkdirSync(OUT, {recursive: true});
const seed = () => { let s = 12345; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
// [weather, wave, camera position, look-at, extra setup]
const V = {forest: ['clear', 1, [-300, 90, 700], [-300, 20, -800]], sites: ['scattered', 1, [0, 160, 2900], [0, 40, 1700]], high: ['clear', 1, [0, 1100, 3000], [0, 0, -2000]],
  smoke: ['clear', 28, [-200, 60, 1500], [0, 60, 900], 'fx'], storm: ['storm', 1, [-300, 90, 700], [-300, 20, -800]], snow: ['snow', 1, [0, 160, 2900], [0, 40, 1700]],
  overcast: ['overcast', 1, [0, 60, 1600], [0, 700, -2000]], night: ['night', 1, [0, 160, 2900], [0, 40, 1700]], thermal: ['clear', 28, [-200, 60, 1500], [0, 60, 900], 'therm'], burn: ['clear', 1, [-640, 45, 1880], [-720, 25, 1740], 'burn']};
const {server, origin} = await serve(); const b = await launch(); const errs = [];
for (const [name, [wx, W, pos, at, extra]] of Object.entries(V)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const p = await b.newPage(); await p.evaluateOnNewDocument(seed); await open(b, origin + '/games/interceptor/', errs, {page: p});
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'wave', cam: 0})));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(400); await p.click('#play'); await sleep(400);
  await p.evaluate(([wx, W, pos, at, extra]) => { const {api, G, Z} = __z, V3 = api.THREE.Vector3; api.S.zwx = 'wave';
    __z.jump(W, 20000); G.next = __z.plan(W); G.next.wx = {id: wx}; delete G.next.wx.to; __z.cont(); __z.sim(W > 1 ? 20 : 2);
    setInterval(() => api.SITES.forEach((s, i) => s.hp = extra === 'burn' && i === 0 ? s.max * .15 : s.max), 200);
    if (extra === 'burn') { let k = 0; setInterval(() => { if (k++ < 12) api.boom(new V3(-735 + (k % 4) * 12, 30 + (k % 3) * 6, 1770), 1.2); }, 250); }
    if (extra === 'fx') { for (let i = 0; i < 4; i++) Z.fxTest.fire(new V3(-150 + i * 90, 0, 950 + i * 40), 1.4, 60); for (let i = 0; i < 8; i++) Z.flash(new V3(-200 + i * 50, 120 + i * 15, 1000), 2); }
    if (extra === 'therm') document.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyH', key: 'h'}));
    const c = api.camera; Z.cam = () => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(new V3(...at)); }; }, [wx, W, pos, at, extra]);
  await sleep(3000); await p.screenshot({path: path.join(OUT, name + '.png')}); await p.close(); console.log('shot', name);
}
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
