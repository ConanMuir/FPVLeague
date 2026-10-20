// Zombies sim cost per tick and on-screen smoothness, in headless pages. A late wave with nobody shooting for a while (the tracks pile up,
// as in tools/zombies-perf.mjs's stress run), then a full defence and a 12-drone personal swarm wake up mid-swarm. Math.random is seeded
// from the page's start and the game runs on a fake clock while it is measured, so two builds play the same scene (until their logic differs).
// It reports:
//   tick   the time of api.step (one 1/120 s sim tick, visuals every 12th as __z.sim does): mean, p50, p95, p99 and the worst tick, in ms
//   parts  (--prof, which adds its own clock reads) for the worst 1% of ticks: the mean time in the helpers (Z.def.step), the track movers (Z.tstep), the wave director and the rest of
//          Z.step (swarm, lock-on, perks, effects hooks); what is left is the interceptor, the fuse and the Classic movers
//   frames the real frame loop for a few seconds: frame time (mean, p95) and how evenly a cruising Shahed's mesh moves from frame to frame
//          (judder = spread of its on-screen speed per frame / its mean; 0 = perfectly even; stalls = frames where it did not move at all)
// Run: node tools/zombies-tick.mjs [--wave 32] [--ticks 2400] [--seed 7] [--runs 3] [--prof]   (DL_NORENDER=1 skips the GPU draws: CPU-bound frames)
import {serve, launch, open} from './zlib.mjs';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const PROF = argv.includes('--prof'), W = +arg('--wave', 32), N = +arg('--ticks', 2400), SEED = +arg('--seed', 7), RUNS = +arg('--runs', 3);
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const out = [];
for (let run = 0; run < RUNS; run++) {
  const p = await open(b, 'about:blank', errs);
  await p.evaluateOnNewDocument(s => { Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, SEED + run);
  await p.goto(origin + '/games/interceptor/', {waitUntil: 'load'});
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', cam: 1, zmus: 0})));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z);
  const r = await p.evaluate((W, N, seed, prof) => {
    let s = seed >>> 0; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const clock = performance.now.bind(performance); let T = 1e7; performance.now = () => T;
    try {
      const {api, G, Z} = __z, hp = () => api.SITES.forEach(q => q.hp = q.max), sim = n => { for (let i = 0; i < n; i++) { api.step(1 / 120); T += 1000 / 120; if (i % 12 === 11) api.visuals(.1, T); } };
      api.startMatch(); api.camera.position.set(0, 400, 2600); api.camera.lookAt(0, 300, 0); api.camera.updateMatrixWorld();
      G.perks.swarm = 5; G.perks.swarmk = 2; Z.pk.apply();
      __z.jump(W, 5000); G.next = __z.plan(W); __z.cont(); api.WB.set(3, 0, -2); api.WIND.set(3, 0, -2); sim(120 * 70); hp();
      [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13], ['rack', 5, 4], ['flak', 8]].forEach(([t, sl, l]) => { const d = Z.def.add(t, sl); if (!d) return; if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
      Z.def.deploy(); sim(240);
      const TT = new Float64Array(N), PT = {def: new Float64Array(N), tstep: new Float64Array(N), waves: new Float64Array(N), zstep: new Float64Array(N)}, h = 1 / 120; let tr = 0, cur = 0;
      const wrap = (o, k, part) => { const f = o[k]; o[k] = (...a) => { const t0 = clock(); try { return f(...a); } finally { PT[part][cur] += clock() - t0; } }; return () => { o[k] = f; }; };
      const un = prof ? [wrap(Z.def, 'step', 'def'), wrap(Z, 'tstep', 'tstep'), wrap(Z, 'waves', 'waves'), wrap(Z, 'step', 'zstep')] : [];
      for (let i = 0; i < N; i++) { cur = i; if (i % 120 === 0) hp(); tr += api.TH.length; const t0 = clock(); api.step(h); TT[i] = clock() - t0; T += 1000 / 120; if (i % 12 === 11) api.visuals(h * 12, T); }
      un.forEach(f => f());
      const worst = [...TT.keys()].sort((x, y) => TT[y] - TT[x]).slice(0, Math.max(1, N / 100 | 0)), wm = k => +(worst.reduce((x, i) => x + PT[k][i], 0) / worst.length).toFixed(3);
      const parts = prof && {def: wm('def'), tstep: wm('tstep'), waves: wm('waves'), zstepRest: +(wm('zstep') - wm('def')).toFixed(3), total: +(worst.reduce((x, i) => x + TT[i], 0) / worst.length).toFixed(3)};
      const a = [...TT].sort((x, y) => x - y), q = f => +a[Math.min(N - 1, Math.floor(f * N))].toFixed(3);
      return {tracks: Math.round(tr / N), live: api.TH.filter(api.live).length, shots: Z.def.shots.length, swarm: Z.sw?.drones.length | 0, parts, mean: +(TT.reduce((x, y) => x + y) / N).toFixed(3), p50: q(.5), p95: q(.95), p99: q(.99), max: +a[N - 1].toFixed(3)};
    } finally { performance.now = clock; }
  }, W, N, SEED + run, PROF);
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
