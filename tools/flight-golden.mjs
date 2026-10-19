// Golden flight trajectories for the Interceptor's tail-sitter dart (games/interceptor/interceptor.js Drone.step), which needs its
// page (terrain, wind, fins, battery). The node test test/flight-golden.test.mjs covers both Leagues, the rates and the attitude
// controller; this is the same check for the dart, in one headless page. Fixed input sequences (mat take-off, hover, dart cruise,
// rolls, wind, Rocket Assist, prop wash, angle-mode style tilt) with Math.random seeded; positions, attitudes, velocities, body
// rates, motor speed and battery are compared with test/fixtures/flight-golden-interceptor.json, which holds the tune it was
// recorded with, so retuning the game does not move it.
//   node tools/flight-golden.mjs            compare (exit 1 on any difference beyond float noise)
//   node tools/flight-golden.mjs --record   re-record (only when a feel change is intended)
import fs from 'node:fs';
import path from 'node:path';
import {serve, launch, open, frames, root} from './zlib.mjs';
const RECORD = process.argv.includes('--record'), FIX = path.join(root, 'test/fixtures/flight-golden-interceptor.json');
const gold = RECORD ? null : JSON.parse(fs.readFileSync(FIX, 'utf8'));
const {server, origin} = await serve();
const browser = await launch();
let fails = 0;
try {
  const errs = [], p = await open(browser, origin + '/games/interceptor/', errs);
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: 'classic', wx: 'clear'})));
  await p.reload({waitUntil: 'load'});
  await p.waitForFunction(() => window.__z, {timeout: 60000});
  await frames(p, 3);
  const res = await p.evaluate(async T0 => {
    const {api} = __z, {S} = api, {rate} = await import('/engine/rates.js'), THREE = api.THREE, V3 = THREE.Vector3;
    const keep = {mod: {...S.mod}, rprof: S.rprof, rpi: S.rpi, wind: api.WIND.clone(), th: api.TH.splice(0), pick: api.pickT}; api.pickT = null;
    if (T0) S.mod = {...S.mod, ...T0};
    const T = {...S.mod}; api.applyTune(); api.SAGK = 1;
    S.rprof = [{type: 'BETAFLIGHT', ax: [[80, 70, 30], [80, 70, 30], [80, 75, 30]], thrMid: 50, thrExpo: 0, thrLimit: 100}]; S.rpi = 0;
    const lcg = s => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296, DT = 1 / 120, sn = Math.sin;
    const d = api.newDrone(), F = api.FOBS[1], up = new V3(0, 1, 0), ax = new V3(1, 0, 0);
    const AIR = d => { d.spawn(); d.p.set(F.x, F.mat.y + 250, F.z); d.q.set(0, 0, 0, 1); d.gt = 0; d.thr = d.ms = .5; };
    // u(t, i) -> {thr, r, p, y}; acro sticks through the rates, the way humanControl does with fpv mix off
    const SC = {
      mat: {n: 480, init: d => d.spawn(), u: t => ({thr: t < .5 ? 0 : t < 1.5 ? (t - .5) * .7 : .62, p: t > 2.5 && t < 2.9 ? .3 : 0})},
      hover: {n: 360, init: AIR, u: t => ({thr: .5 + .1 * sn(2 * t)})},
      cruise: {n: 600, init: AIR, u: t => t < .55 ? {thr: .6, p: .6} : {thr: 1, p: t > 2 && t < 2.3 ? -.15 : 0, y: t > 3 && t < 3.6 ? .3 : 0}},
      rolls: {n: 360, init: AIR, u: t => ({thr: .6, r: t < .8 ? 1 : 0, p: t > 1 && t < 1.5 ? -1 : 0, y: t > 1.6 && t < 2.2 ? .8 : 0})},
      wind: {n: 480, init: d => { AIR(d); api.WIND.set(8, 0, 4); }, u: t => t < .55 ? {thr: .6, p: .6} : {thr: .85, r: .2 * sn(t)}},
      rocket: {n: 480, init: d => { AIR(d); d.boost = 60; d.bmax = 30; }, u: t => t < .55 ? {thr: .6, p: .6} : {thr: 1}},
      wash: {n: 300, init: d => { AIR(d); d.v.set(0, -30, 0); }, u: t => ({thr: t < 1.5 ? .35 : 1})},
      freestyle: {n: 600, init: AIR, u: t => ({thr: .55 + .4 * sn(1.7 * t), r: sn(3 * t), p: sn(2.1 * t + 1), y: .5 * sn(1.3 * t)})}};
    const out = {};
    for (const [k, s] of Object.entries(SC)) {
      const r0 = Math.random; Math.random = lcg(11); api.WIND.set(0, 0, 0); d.boost = 0; d.bmax = 0;
      try {
        s.init(d); const o = [];
        for (let i = 0; i < s.n; i++) {
          const u = s.u(i * DT, i); d.thr = u.thr; d.wt.set(-rate(1, u.p || 0), -rate(2, u.y || 0), -rate(0, u.r || 0));
          const h = d.step(DT);
          if (i % 12 === 11) o.push([d.p.x, d.p.y, d.p.z, d.q.x, d.q.y, d.q.z, d.q.w, d.v.x, d.v.y, d.v.z, d.w.x, d.w.y, d.w.z, d.ms, d.vc, d.mah, h]);
        }
        out[k] = o;
      } finally { Math.random = r0; }
    }
    api.scene.remove(d.mesh);
    Object.assign(S, {mod: keep.mod, rprof: keep.rprof, rpi: keep.rpi}); api.applyTune(); api.WIND.copy(keep.wind); api.TH.push(...keep.th); api.pickT = keep.pick;
    return {tune: T, wxWind: api.WX.wind, out};
  }, gold ? gold.tune : null);
  if (errs.length) { console.log('FAIL page errors\n  ' + errs.join('\n  ')); fails++; }
  if (RECORD) { fs.writeFileSync(FIX, JSON.stringify(res) + '\n'); console.log('recorded', Object.keys(res.out).join(', ')); }
  else {
    if (res.wxWind !== gold.wxWind) { console.log(`FAIL clear-weather wind ${res.wxWind} != golden ${gold.wxWind}`); fails++; }
    for (const [k, G] of Object.entries(gold.out)) {
      const A = res.out[k]; let worst = 0, bad = null;
      if (!A || A.length !== G.length) { console.log(`FAIL ${k}: ${A ? A.length : 0} samples, golden ${G.length}`); fails++; continue; }
      G.forEach((row, i) => row.forEach((b, j) => { const e = Math.abs(A[i][j] - b); worst = Math.max(worst, e); if (!bad && e > 1e-9 * Math.max(1, Math.abs(b))) bad = `sample ${i} value ${j}: ${A[i][j]} != ${b}`; }));
      if (bad) { console.log(`FAIL ${k}: ${bad}`); fails++; } else console.log(`ok   ${k} (${G.length} samples, largest difference ${worst})`);
    }
  }
} finally { await browser.close(); server.close(); }
console.log(fails ? `${fails} failure(s)` : 'Interceptor flight goldens: all match');
process.exit(fails ? 1 : 0);
