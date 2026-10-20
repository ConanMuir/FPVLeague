// Zombies sim cost per tick and on-screen smoothness, in one headless page. A late wave with nobody shooting for a while (the tracks pile up,
// as in tools/zombies-perf.mjs's stress run), then a full defence and a 12-drone personal swarm wake up mid-swarm; Math.random is seeded so
// two builds see the same scene. It reports:
//   tick   the time of api.step (one 1/120 s sim tick, visuals every 12th as __z.sim does): mean, p50, p95, p99 and the worst tick, in ms
//   frames the real frame loop for a few seconds: frame time (mean, p95) and how evenly a cruising Shahed's mesh moves from frame to frame
//          (judder = spread of its on-screen speed per frame / its mean; 0 = perfectly even; stalls = frames where it did not move at all)
// Run: node tools/zombies-tick.mjs [--wave 32] [--ticks 2400] [--seed 7] [--runs 3]
import {serve, launch, open, sleep} from './zlib.mjs';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const W = +arg('--wave', 32), N = +arg('--ticks', 2400), SEED = +arg('--seed', 7), RUNS = +arg('--runs', 3);
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const out = [];
for (let run = 0; run < RUNS; run++) {
  const p = await open(b, origin + '/games/interceptor/', errs);
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', cam: 1, zmus: 0})));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500); await p.click('#play'); await sleep(300);
  const r = await p.evaluate((W, N, seed) => {
    let s = seed >>> 0; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const {api, G, Z} = __z, hp = () => api.SITES.forEach(q => q.hp = q.max);
    G.perks = {...G.perks, swarm: 5, swarmk: 2}; Z.pk.apply?.();
    __z.jump(W, 5000); G.next = __z.plan(W); __z.cont(); __z.sim(70); hp();
    [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13], ['rack', 5, 4], ['flak', 8]].forEach(([t, sl, l]) => { const d = Z.def.add(t, sl); if (!d) return; if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
    Z.def.deploy(); __z.sim(2);
    const T = new Float64Array(N), h = 1 / 120; let tr = 0;
    for (let i = 0; i < N; i++) { if (i % 120 === 0) hp(); tr += api.TH.length; const t0 = performance.now(); api.step(h); T[i] = performance.now() - t0; if (i % 12 === 11) api.visuals(h * 12, performance.now()); }
    const a = [...T].sort((x, y) => x - y), q = f => +a[Math.min(N - 1, Math.floor(f * N))].toFixed(3);
    return {tracks: Math.round(tr / N), live: api.TH.filter(api.live).length, shots: Z.def.shots.length, swarm: Z.sw?.drones.length | 0, mean: +(T.reduce((x, y) => x + y) / N).toFixed(3), p50: q(.5), p95: q(.95), p99: q(.99), max: +a[N - 1].toFixed(3)};
  }, W, N, SEED + run);
  // real frames: frame time, and how evenly one cruising Shahed's mesh moves on screen
  const f = await p.evaluate(() => new Promise(res => { const {api} = __z, keep = setInterval(() => api.SITES.forEach(q => q.hp = q.max), 200);
    const pick = () => api.TH.find(t => api.live(t) && t.st === 'cruise' && (t.k === 'shahed' || t.k === 'decoy') && t.mesh);
    let t = pick(), last = null, lt = 0; const ft = [], sp = []; let stall = 0;
    const fr = now => { if (lt) ft.push(now - lt);
      if (!t || !api.live(t)) { t = pick(); last = null; }
      if (t) { const m = t.mesh.position; if (last && lt) { const d = Math.hypot(m.x - last.x, m.y - last.y, m.z - last.z), dt = (now - lt) / 1000; if (d < 1e-6) stall++; sp.push(d / dt); } last = {x: m.x, y: m.y, z: m.z}; }
      lt = now; if (ft.length < 240) requestAnimationFrame(fr); else { clearInterval(keep); const s = [...ft].sort((x, y) => x - y), mu = sp.reduce((x, y) => x + y, 0) / Math.max(1, sp.length), sd = Math.sqrt(sp.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, sp.length));
        res({ftMean: +(ft.reduce((x, y) => x + y) / ft.length).toFixed(2), ftP95: +s[Math.floor(s.length * .95)].toFixed(2), judder: +(sd / mu).toFixed(3), stalls: stall, samples: sp.length}); } };
    requestAnimationFrame(fr); }));
  out.push({...r, ...f}); console.log(`run ${run + 1}`, JSON.stringify({...r, ...f}));
  await p.close();
}
const med = k => { const s = out.map(o => o[k]).sort((x, y) => x - y); return s[s.length >> 1]; };
console.log('median', JSON.stringify(Object.fromEntries(['tracks', 'mean', 'p50', 'p95', 'p99', 'max', 'ftMean', 'ftP95', 'judder', 'stalls'].map(k => [k, med(k)]))));
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
