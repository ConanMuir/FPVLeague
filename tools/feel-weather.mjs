// What the weather does to the player's craft in the Interceptor, measured on the game's own flight code in one headless page:
//   1. per weather (Riley's seven and the Zombies table): the wind (nominal, and over a minute with its gusts), the drag it puts on a hovering
//      craft (m/s^2), the angular kick of turbulence and fin weathervane (deg/s^2), and what a hands-off acro pilot sees (body rate and attitude walk)
//   2. what a run meets: the mean and spread of the wind per wave of the Zombies forecast against Riley's one random weather per match,
//      and how often a wave changes weather part-way
//   3. the mid-wave change itself, played in the real game: the wind vector, sampled each second across the blend
// "Pinned": every tick the craft is put back at one spot, level, at rest, and the tick runs; what it picked up in that tick is the air's push on it.
// Wind gusts are the game's (interceptor.js weather(): the wind vector x (1 + .35 sin(.7 t) + .2 sin(2.3 t + 1)), a vertical wave above 8 m/s), driven here by
// sim time. Run: node tools/feel-weather.mjs [--root DIR] [--json]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {launch, open, frames} from './zlib.mjs';

const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d, has = k => argv.includes(k);
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ROOT = path.resolve(arg('--root', HERE));
const require = createRequire(import.meta.url), threeDir = path.resolve(path.dirname(require.resolve('three')), '..');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png'};
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]), f;
  if (u.startsWith('/__three/')) f = path.join(threeDir, u.slice(9)); else { if (u.endsWith('/')) u += 'index.html'; f = path.join(ROOT, u); }
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const errs = [], b = await launch({w: 960, h: 540}), p = await open(b, 'about:blank', errs, {w: 960, h: 540});
await p.goto(origin + '/games/interceptor/', {waitUntil: 'load'});
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'wave', cam: 1, zmus: 0, setV: 5})));
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 5);
await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000}); await frames(p, 3);
await p.evaluate(() => __z.cont()); await frames(p, 3);

const R = await p.evaluate(async () => {
  const {api, Z, G} = __z, me = api.player, DT = 1 / 120, S = api.S.mod, deg = 180 / Math.PI;
  const HOV = Math.pow(S.grav / S.thr, 1 / S.te);
  const rnd = s => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  api.TH.length = 0; for (const s of api.SITES) s.hp = s.max = 1e6;
  const home = () => { me.p.set(0, api.gh(0, 300) + 400, 300); me.v.set(0, 0, 0); me.w.set(0, 0, 0); me.wt.set(0, 0, 0); me.q.identity(); me.gt = 0; me.dead = 0; me.ms = me.thr = HOV; me.tb.set(0, 0, 0); me.gu.set(0, 0, 0); me.mah = 0; };
  /* the game's gust model (interceptor.js weather()), at sim time t */
  const gust = (t, W) => { api.WIND.copy(api.WB).multiplyScalar(1 + .35 * Math.sin(t * .7) + .2 * Math.sin(t * 2.3 + 1)); api.WIND.y = W.wind > 8 ? Math.sin(t * 1.7) * W.wind * .08 : 0; };
  const A0 = -Math.PI * .15;
  const setWind = W => { api.setWeather(W); api.WB.set(Math.sin(A0), 0, Math.cos(A0)).multiplyScalar(api.WX.wind * .95); };  /* the mean of the game's random .7 - 1.2 x wind */
  const stat = a => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n; return {mean: m, rms: Math.sqrt(a.reduce((x, y) => x + y * y, 0) / n), max: Math.max(...a.map(Math.abs))}; };
  const rows = [], RILEY = ['clear', 'scattered', 'overcast', 'rain', 'storm', 'fog', 'dusk'], EXTRA = ['golden', 'snow', 'dust', 'night', 'storm'];
  /* Riley's seven (the Weather setting: interceptor.js WXS, by id) and the Zombies table's extra five (zwx.js; its own heavy storm is the last) */
  for (const [k, W] of [...RILEY.map(k => [k, k]), ...EXTRA.map(k => ['z:' + k, Z.wx.T[k]])]) {
    setWind(W); const Wx = api.WX; Math.random = rnd(7);
    /* 1. pinned: the push on a hovering craft */
    home(); const wind = [], dwind = [], lat = [], vert = [], ang = []; let last = null;
    for (let i = 0; i < 120 * 90; i++) { const t = i * DT; gust(t, Wx); wind.push(api.WIND.length()); if (last != null) dwind.push(api.WIND.clone().sub(last).length() / DT); last = api.WIND.clone();
      me.p.set(0, api.gh(0, 300) + 400, 300); me.v.set(0, 0, 0); me.w.set(0, 0, 0); me.q.identity(); me.gt = 0; me.ms = me.thr = HOV; me.wt.set(0, 0, 0);
      me.step(DT); lat.push(Math.hypot(me.v.x, me.v.z) / DT); vert.push((me.v.y) / DT); ang.push(me.w.length() / DT * deg); }
    /* 2. free, hands off: sticks centred, height held by the throttle only */
    home(); const rate = [], tilt = []; const y0 = me.p.y, ux = me.p.x, uz = me.p.z; const hd = []; const up = new api.THREE.Vector3();
    for (let i = 0; i < 120 * 30; i++) { const t = i * DT; gust(t, Wx); me.thr = Math.max(.05, Math.min(.9, HOV + .004 * (y0 - me.p.y) - .02 * me.v.y)); me.wt.set(0, 0, 0); me.step(DT);
      if (i > 120 * 5) { rate.push(me.w.length() * deg); up.set(0, 1, 0).applyQuaternion(me.q); tilt.push(Math.acos(Math.min(1, up.y)) * deg); hd.push(Math.hypot(me.p.x - ux, me.p.z - uz)); } }
    rows.push({k, name: Wx.n + (k.startsWith('z:') ? ' (Z)' : ''), wind: Wx.wind, kmh: Math.round(Wx.wind * .95 * 3.6),
      windMin: +Math.min(...wind).toFixed(1), windMax: +Math.max(...wind).toFixed(1), windMean: +(wind.reduce((x, y) => x + y, 0) / wind.length).toFixed(1), dWindMax: +Math.max(...dwind).toFixed(1),
      dragRms: +stat(lat).rms.toFixed(2), dragMax: +stat(lat).max.toFixed(2), vertMax: +stat(vert).max.toFixed(2), angRms: +stat(ang).rms.toFixed(0), angMax: +stat(ang).max.toFixed(0),
      freeRate: +stat(rate).rms.toFixed(1), freeRateMax: +Math.max(...rate).toFixed(1), tiltMax: +Math.max(...tilt).toFixed(1), drift: +hd[hd.length - 1].toFixed(0)});
  }
  /* 3. the forecast: wind per wave, and how often a wave shifts part-way */
  const fc = {};
  for (const w of [1, 2, 3, 4, 5, 6, 10]) { let sw = 0, sum = 0, sq = 0, hi = 0, shifts = 0, n = 4000; const M = {};
    Math.random = rnd(99 + w);
    for (let i = 0; i < n; i++) { const pl = Z.wx.plan(w), W = Z.wx.T[pl.id]; sum += W.wind * .95; sq += (W.wind * .95) ** 2; if (W.wind >= 11) hi++; if (pl.to) { shifts++; const j = Math.abs(Z.wx.T[pl.to].wind * .95 - W.wind * (.7 + .5 * .5)); sw += j; } M[pl.id] = (M[pl.id] || 0) + 1; }
    fc[w] = {mean: +(sum / n).toFixed(1), sd: +Math.sqrt(sq / n - (sum / n) ** 2).toFixed(1), windy: +(hi / n).toFixed(2), shift: +(shifts / n).toFixed(2), jump: shifts ? +(sw / shifts).toFixed(1) : 0}; }
  /* 4. a real mid-wave shift in the game (rain -> storm: at 20 s into the wave, blended over 35 s): the base wind vector (WB) and WX.wind, once a second */
  const sh = [];
  { home(); Math.random = rnd(5); api.setWeather(Z.wx.T.rain); api.WB.set(Math.sin(A0), 0, Math.cos(A0)).multiplyScalar(Z.wx.T.rain.wind * .95); G.state = 'wave'; G.wt = 0; G.perfect = true;
    Z.wx.start({id: 'rain', to: 'storm', why: 'storm building', at: 20, dur: 35});
    for (let s = 0; s <= 70; s++) { sh.push([s, +api.WB.length().toFixed(2), +api.WX.wind.toFixed(2), +G.wt.toFixed(1)]); for (let i = 0; i < 120; i++) { me.p.set(0, api.gh(0, 300) + 400, 300); me.v.set(0, 0, 0); api.step(DT); if (i % 12 === 11) api.visuals(.1, performance.now()); } } }
  /* the push of a steady wind of 10.45 m/s (rain) and 16.15 m/s (storm) on the pinned hover: the size of the one-tick step the old blend end made */
  const drag = L => { home(); api.WIND.set(Math.sin(A0), 0, Math.cos(A0)).multiplyScalar(L); me.step(DT); return Math.hypot(me.v.x, me.v.z) / DT; };
  const stepDrag = [drag(10.45), drag(16.15)];
  return {rows, fc, hov: HOV, sh, stepDrag};
});
console.log(JSON.stringify(R.hov));
const res = {rows: R.rows, fc: R.fc, shift: R.sh, stepDrag: R.stepDrag};
if (has('--json')) console.log(JSON.stringify(res));
else {
  console.log('A rain -> storm shift played in the game (shift starts at 20 s, 35 s long). s: base wind vector length | wind setting of the weather, per second:');
  console.log(R.sh.filter((_, i) => i >= 15 && i <= 62).map(([s, wb, w]) => `${s}s ${wb}|${w}`).join('  '));
  { let big = 0, at = 0; for (let i = 1; i < R.sh.length; i++) { const d = Math.abs(R.sh[i][1] - R.sh[i - 1][1]); if (d > big) { big = d; at = R.sh[i][0]; } } console.log(`biggest one-second change of the base wind: ${big.toFixed(2)} m/s at ${at} s`);
  console.log(`a steady 10.45 m/s wind pushes the hovering craft with ${R.stepDrag[0].toFixed(2)} m/s2, 16.15 m/s with ${R.stepDrag[1].toFixed(2)} m/s2: a step of ${(R.stepDrag[1] - R.stepDrag[0]).toFixed(2)} m/s2 (${((R.stepDrag[1] - R.stepDrag[0]) / 9.81).toFixed(2)} g) if the wind jumps in one tick\n`); }
  console.log('weather            wind m/s (km/h)   with gusts min/mean/max  dWind/dt max |  drag on a hover rms/max m/s2  vert max |  turbulence+fins deg/s2 rms/max |  hands-off: body rate rms/max deg/s  tilt max deg  drift m after 30 s');
  for (const r of R.rows) console.log(`${r.name.padEnd(18)} ${String(r.wind).padStart(4)} (${String(r.kmh).padStart(3)})        ${r.windMin}/${r.windMean}/${r.windMax}`.padEnd(66) + `${r.dWindMax}`.padStart(6) + ` |   ${r.dragRms}/${r.dragMax}`.padEnd(30) + `${r.vertMax}`.padStart(6) + ` |   ${r.angRms}/${r.angMax}`.padEnd(26) + ` |   ${r.freeRate}/${r.freeRateMax}   ${r.tiltMax}   ${r.drift}`);
  console.log('\nForecast per wave (Zombies, new weather each wave) wind m/s mean (sd), share of windy waves (>= 11 m/s), share that shift part-way, mean jump of the wind at the end of the shift (m/s):');
  for (const [w, f] of Object.entries(R.fc)) console.log(`wave ${w.padStart(2)}: ${f.mean} (${f.sd})  windy ${Math.round(f.windy * 100)}%  shifts ${Math.round(f.shift * 100)}%  jump ${f.jump}`);
}
if (errs.length) console.log('errors:', errs.slice(0, 5).join('\n'));
await b.close(); server.close();
