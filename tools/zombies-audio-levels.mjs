// Zombies sound levels (zaudio.js, zthreatsfx.js): renders the real synth into an OfflineAudioContext in headless Edge (nothing plays out
// loud) and measures each sound at the master output, after zaudio's effects bus and compressor: peak, RMS over the window, and loudness
// (ITU-R BS.1770 K-weighted, loudest 400 ms = momentary LUFS). One timeline, a few seconds per sound: explosions (a kill up close, an ICBM
// impact 300 m away), sonic booms (a ballistic missile passing 150 m and 600 m away, a kill vehicle), a near-miss whoosh, the re-entry alarm,
// the re-entry rumble at full, a high intercept's crack 30 km off, the music at full intensity, everything at once, and a boom with the
// effects slider at 50%. Fails if anything clips or the new sounds are louder than the explosions. Everything runs through zaudio's
// compressor (threshold -16 dB), so loud sounds gain little loudness above it: that is the master limiter doing its job.
//   node tools/zombies-audio-levels.mjs
import {serve, launch, open, sleep} from './zlib.mjs';
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const SR = 48000, DUR = 46;
  window.AudioContext = window.webkitAudioContext = function () { const c = new OfflineAudioContext(2, SR * DUR, SR); c.__resume = OfflineAudioContext.prototype.resume.bind(c); c.resume = () => Promise.resolve(); window.__oac = c; return c; };
});
await open(b, origin + '/games/interceptor/?mode=zombies', errs, {page: p});
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zsfxv: 1, zmusv: 1})));
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(300);
await p.click('#play'); await sleep(500);
const r = await p.evaluate(async () => {
  const {Z, api} = __z, c = window.__oac; if (!c || !Z.au.bus) return {err: 'no offline context'};
  window.requestAnimationFrame = () => 0; await new Promise(q => setTimeout(q, 200));  // the game loop stops: only what the timeline calls makes sound
  const {PATCH, CS} = await import('/games/interceptor/zthreatsfx.js'), {nbuf} = await import('/engine/audio.js');
  const A = Z.au.bus, cam = api.camera.position, V = api.THREE.Vector3, at = (dx, dy, dz) => new V(cam.x + dx, cam.y + dy, cam.z + dz);
  const W = [], ev = [], win = (name, t0, t1) => W.push({name, t0, t1}), on = (t, f) => ev.push([t, f]);
  const boomLv = (B, d) => B / (1 + (d / 700) ** 1.3);
  on(.1, () => Z.au.boom(at(0, 0, -50), 3)); win('explosion k=3 at 50 m (a kill up close)', 0, 3);
  on(3.1, () => Z.au.boom(at(0, 0, -300), 6)); win('explosion k=6 at 300 m (ICBM impact)', 3, 6.5);
  on(6.6, () => PATCH.boom(c, nbuf, A.sfx, c.currentTime, boomLv(.7, 150), {len: .11, dull: 150 / 9000, roll: .64})); win('sonic boom: ballistic passing 150 m', 6.5, 10);
  on(10.1, () => PATCH.boom(c, nbuf, A.sfx, c.currentTime, boomLv(.8, 600), {len: .09 * 1.02, dull: 600 / 9000, roll: .75})); win('sonic boom: ICBM passing 600 m', 10, 13.5);
  on(13.6, () => PATCH.boom(c, nbuf, A.sfx, c.currentTime, boomLv(.45, 100), {len: .05, dull: .01, roll: .62})); win('sonic boom: kill vehicle passing 100 m', 13.5, 16.5);
  on(16.6, () => PATCH.whoosh(c, nbuf, A.sfx, c.currentTime, .42, {dur: .7, f0: 2000, f1: 260, p0: -1, p1: 1, low: .8})); win('near miss: jet whoosh', 16.5, 18.5);
  on(18.6, () => Z.tsfx.alarm(true)); win('re-entry alarm (ICBM)', 18.5, 21.5);
  on(21.6, () => PATCH.rumble(c, nbuf, A.sfx, c.currentTime, .32, 4)); win('re-entry rumble at full', 21.5, 26);
  on(26.1, () => PATCH.boom(c, nbuf, A.sfx, c.currentTime + 0, Math.max(.015, .55 / (1 + (30000 / 5000) ** 1.3)), {len: .16, dull: .5, roll: .85})); win('intercept crack 30 km off', 26, 30.5);
  for (let t = 30.6; t < 37; t += .1) on(t, () => Z.au.music(1, 'wave', .1)); win('music, full intensity', 32, 37);
  on(37.1, () => { Z.au.boom(at(0, 0, -300), 6); PATCH.boom(c, nbuf, A.sfx, c.currentTime, boomLv(.7, 150), {len: .11, roll: .64}); Z.tsfx.alarm(true); PATCH.whoosh(c, nbuf, A.sfx, c.currentTime, .42, {low: .8}); });
  for (let t = 37.1; t < 41; t += .1) on(t, () => Z.au.music(1, 'wave', .1)); win('stacked: ICBM impact + boom + alarm + whoosh + music', 37, 41);
  on(41.2, () => { Z.au.stopMusic(); api.S.zsfxv = .5; Z.au.music(0, 'off', .1); }); on(42.1, () => PATCH.boom(c, nbuf, A.sfx, c.currentTime, boomLv(.7, 150), {len: .11, roll: .64})); win('sonic boom 150 m, effects slider 50%', 42, 45.5);
  ev.sort((a, b) => a[0] - b[0]); const q = 128 / c.sampleRate, seen = new Set();
  for (const [t, f] of ev) { const k = Math.round(t / q); if (seen.has(k)) continue; seen.add(k); c.suspend(k * q).then(async () => { try { f(); } catch (e) { window.__sErr = e.message; } await new Promise(z => setTimeout(z, 20)); c.__resume(); }); }
  const buf = await c.startRendering(), sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1), db = x => x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -120;
  const kw = (x, a, z) => { const y = new Float32Array(z - a); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, w1 = 0, w2 = 0;
    for (let j = a; j < z; j++) { const v = x[j], s1 = 1.53512485958697 * v - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - .73248077421585 * y2; x2 = x1; x1 = v; y2 = y1; y1 = s1;
      const s2 = s1 - 2 * u1 + u2 + 1.99004745483398 * w1 - .99007225036621 * w2; u2 = u1; u1 = s1; w2 = w1; w1 = s2; y[j - a] = s2; } return y; };
  const stat = (t0, t1) => { const a = Math.floor(t0 * sr), z = Math.floor(t1 * sr); let pk = 0, s = 0; for (let j = a; j < z; j++) { pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j])); s += (L[j] * L[j] + R[j] * R[j]) / 2; }
    const kL = kw(L, a, z), kR = kw(R, a, z), n = Math.floor(.4 * sr), st = Math.floor(.05 * sr), cum = new Float64Array(kL.length + 1); for (let j = 0; j < kL.length; j++) cum[j + 1] = cum[j] + kL[j] * kL[j] + kR[j] * kR[j];
    let m = 0; for (let j = 0; j + n <= kL.length; j += st) m = Math.max(m, (cum[j + n] - cum[j]) / n); return {peak: db(pk), rms: db(Math.sqrt(s / Math.max(1, z - a))), M: m > 0 ? +(-0.691 + 10 * Math.log10(m)).toFixed(1) : -120}; };
  return {sErr: window.__sErr || null, rows: W.map(w => ({name: w.name, ...stat(w.t0, w.t1)}))};
});
if (r.err) { console.log(r); process.exit(1); }
console.log('sound'.padEnd(56), 'peak dBFS'.padEnd(11), 'rms dBFS'.padEnd(10), 'loudest 400 ms (LUFS)');
for (const w of r.rows) console.log(w.name.padEnd(56), String(w.peak).padEnd(11), String(w.rms).padEnd(10), w.M);
const row = n => r.rows.find(w => w.name.startsWith(n)), ex = row('explosion k=6'), b150 = row('sonic boom: ballistic'), al = row('re-entry alarm'), mu = row('music'), st = row('stacked'), sl = row('sonic boom 150 m, effects'), ic = row('intercept');
const checks = [[Math.max(...r.rows.map(w => w.peak)) <= -.3, 'nothing clips (every peak under -0.3 dBFS)'], [b150.M <= ex.M + 2, `a close sonic boom (${b150.M} LUFS) is no louder than an ICBM impact (${ex.M}) + 2 dB`],
  [al.M <= ex.M - 3, `the re-entry alarm (${al.M}) sits under the impact (${ex.M})`], [b150.peak >= mu.peak, `a close boom's crack (peak ${b150.peak}) cuts through the music (peak ${mu.peak}; loudness ${b150.M} vs ${mu.M} LUFS, the compressor holds the boom down)`], [ic.M <= b150.M - 2, `a far intercept (${ic.M}) is under a close boom (${b150.M})`],
  [sl.M <= b150.M - 2.5, `the effects slider at 50% takes the boom down ${(b150.M - sl.M).toFixed(1)} dB`], [st.peak <= -.3, `stacked peak ${st.peak} dBFS`]];
for (const [c, m] of checks) console.log((c ? 'ok   ' : 'FAIL ') + m);
if (r.sErr || errs.length) console.log('errors', r.sErr, errs);
const ok = checks.every(c => c[0]) && !r.sErr && !errs.length; console.log(ok ? 'ZOMBIES AUDIO LEVELS PASSED' : 'ZOMBIES AUDIO LEVELS FAILED'); await b.close(); server.close(); process.exit(ok ? 0 : 1);
