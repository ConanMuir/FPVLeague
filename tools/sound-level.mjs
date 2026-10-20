// Sound levels: renders the game's real synth (audio/audio.js, audio/sfx.js) into an OfflineAudioContext in headless Edge and
// measures each sound's peak and loudness at the master output (after the master bus and its limiter) and on each volume bus.
// The page's AudioContext is swapped for an offline one before audioInit, so nothing plays out loud; one timeline renders every
// scenario a few seconds apart: motors at full throttle, ball hits, a bounce, a landing, a pop, the GO, the crowd in play and a
// save, the goal (boom alone, then the whole goal: boom, horn, stinger, roar), everything at once, a replayed goal (ducked) and
// the goal with the Effects and Crowd sliders at 50%.
//   node tools/sound-level.mjs            prints the table; fails if the master clips or the goal is far louder than a hard hit
import {launchBrowser, gameReady} from './browser.mjs';
const {createServer} = await import('vite');
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({args: ['--ignore-gpu-blocklist'], protocolTimeout: 300000});
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const BUSES = ['fx', 'crowd', 'mot', 'wind', 'oth'];
await p.evaluateOnNewDocument((BUSES) => {
  // 2 master channels + 2 per bus; the master tap stands in for the context's destination
  const SR = 48000, DUR = 64, NCH = 2 + 2 * BUSES.length;
  const OAC = function () { const c = new OfflineAudioContext(NCH, SR * DUR, SR), mg = c.createChannelMerger(NCH); mg.connect(c.destination);
    const tap = (ch) => { const g = c.createGain(); g.channelCount = 2; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; const sp = c.createChannelSplitter(2); g.connect(sp); sp.connect(mg, 0, ch); sp.connect(mg, 1, ch + 1); return g; };
    Object.defineProperty(c, 'destination', {value: tap(0)}); c.__tap = tap; c.__resume = OfflineAudioContext.prototype.resume.bind(c); c.resume = () => Promise.resolve(); window.__oac = c; return c; };
  window.AudioContext = window.webkitAudioContext = OAC;
}, BUSES);
await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p);
const r = await p.evaluate(async (BUSES) => {
  const A = await import('/src/audio/audio.js'), X = await import('/src/audio/sfx.js'), DF = await import('/src/modes/dogfight.js'), MA = await import('/src/modes/match.js'),
    {GS} = await import('/src/state.js'), {ball} = await import('/src/physics/ball.js'), {S} = await import('/src/config/settings.js'), {camera} = await import('/src/render/renderer.js'), EV = await import('/src/core/events.js');
  DF.setGame("league"); MA.startMatch(); GS.paused = true; GS.menuOpen = false; window.requestAnimationFrame = () => 0; await new Promise(q => setTimeout(q, 300)); const c = window.__oac;  // the game loop stops: its paused audioTick / sfxTick would mute the loops under test
  if (!c || A.AC !== c) return {err: 'no offline context'};
  BUSES.forEach((k, i) => A.BUS[k].connect(c.__tap(2 + 2 * i)));
  const me = GS.player, sleep = ms => new Promise(q => setTimeout(q, ms)), V = ball.p.constructor;
  const front = () => { const f = new V(0, 0, -1).applyQuaternion(camera.quaternion); return camera.position.clone().addScaledVector(f, 10); };
  const motor = on => { const pz = GS.paused, dm = GS.demo; GS.paused = false; GS.demo = !on; me.dead = 0; me.thr = me.ms = 1; me.boostOn = true; me.v.set(0, 0, -30); A.audioTick(1 / 60); GS.paused = pz; GS.demo = dm; };
  const tick = () => { const pz = GS.paused; GS.paused = false; X.sfxTick(1 / 60); GS.paused = pz; };
  // the replay's duck: audio.js duckReplay when it exists, else the levels render/replay.js used to set (effects 40%, motors 25%, wind off, other quads 30%, crowd as is)
  const duck = on => { if (A.duckReplay) return A.duckReplay(on); if (!on) return A.setVolumes(); const t = c.currentTime, v = k => ((S[k] ?? 100) / 100) ** 2;
    A.BUS.fx.gain.setTargetAtTime(v('vFx') * .4, t, .05); A.BUS.mot.gain.setTargetAtTime(v('vMotor') * .25, t, .05); A.BUS.wind.gain.setTargetAtTime(0, t, .05); A.BUS.oth.gain.setTargetAtTime(v('vOther') * .3, t, .05); };
  const goal = () => { ball.p.copy(front()); GS.state = 'goal'; GS.stT = 3; X.goalSfx(me.team, ball.p); };
  const W = [], ev = []; const win = (name, t0, t1) => W.push({name, t0, t1}); const at = (t, f) => ev.push([t, f]);
  const quiet = (t0, t1) => { for (let t = t0; t < t1 - .01; t += .25) at(t, () => { GS.demo = true; GS.state = 'play'; tick(); motor(false); }); };
  // 0-3 s: own motors at full throttle with boost (and the wind at 30 m/s)
  for (let t = .1; t < 3; t += .1) at(t, () => motor(true)); win('motors full + boost', 1, 3); quiet(3, 4);
  at(4, () => { GS.demo = false; ball.p.copy(front()); ball.w.set(0, 0, 0); X.ballHit(me, 20); }); win('ball hit 20 m/s', 4, 5);
  at(5, () => { ball.p.copy(front()); ball.w.set(0, 0, 12); X.ballHit(me, 40); }); win('ball hit 40 m/s (spinning)', 5, 6);
  at(6, () => { ball.p.copy(front()); ball.n.set(0, 1, 0); X.ballBounce(35); }); win('ball bounce 35 m/s', 6, 7);
  at(7, () => { X.groundHit(me, 25, me.p); }); win('landing 25 m/s', 7, 8);
  at(8, () => { X.popWhoosh(.4); }); win('pop', 8, 9);
  at(9, () => { X.countdown(0); }); win('GO', 9, 10); quiet(10, 13);
  // the crowd in play, then a save
  for (let t = 13; t < 19; t += .1) at(t + .02, () => { GS.demo = false; GS.state = 'play'; tick(); });
  win('crowd bed in play', 14, 16); at(16, () => EV.emitEv('save', {d: me, speed: 40})); win('crowd: save cheer', 16, 19); quiet(19, 23);
  // the goal: boom alone (demo), then the whole goal with the crowd bed at its goal level
  at(23, () => { GS.demo = true; goal(); }); win('goal boom alone', 23, 25.5); quiet(25.5, 27);
  const fullGoal = (t0, extra) => { at(t0, () => { GS.demo = false; goal(); extra?.(); }); for (let t = t0 + .1; t < t0 + 5; t += .1) at(t, () => { GS.stT = 3 - (c.currentTime - t0); tick(); }); };
  fullGoal(27); win('goal (boom + horn + stinger + roar)', 27, 32); quiet(32, 36);
  // everything at once: the goal, a hard hit, a bounce, a landing and full motors
  for (let t = 36; t < 41; t += .1) at(t + .05, () => motor(true));
  fullGoal(37, () => { ball.w.set(0, 0, 12); X.ballHit(me, 40); X.ballBounce(40); X.groundHit(me, 30, me.p); }); win('stacked: goal + hit + bounce + landing + motors', 37, 42); quiet(42, 46);
  // a replayed goal: the duck on, the goal's sounds as the replay sends them
  at(46, () => duck(true)); fullGoal(46.5); win('replayed goal (ducked)', 46.5, 51.5); at(51.5, () => duck(false)); quiet(51.5, 55);
  // the goal with Effects and Crowd at 50%
  at(55, () => { S.vFx = 50; S.vCrowd = 50; A.setVolumes(); }); fullGoal(55.5); win('goal, Effects + Crowd sliders 50%', 55.5, 60.5); at(60.5, () => { S.vFx = 100; S.vCrowd = 100; A.setVolumes(); });
  ev.sort((a, b) => a[0] - b[0]); const q = 128 / c.sampleRate, seen = new Set();
  for (const [t, f] of ev) { const k = Math.round(t / q); if (seen.has(k)) continue; seen.add(k); c.suspend(k * q).then(async () => { try { f(); } catch (e) { window.__sErr = e.message; } await sleep(60); c.__resume(); }); }
  const buf = await c.startRendering(), sr = buf.sampleRate, ch = i => buf.getChannelData(i), db = x => x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -120;
  // loudness: ITU-R BS.1770 K-weighting (48 kHz coefficients), momentary = 400 ms, short-term = 3 s, both slid in 100 ms steps; LUFS = -0.691 + 10 log10(L ms + R ms)
  const kw = (x, a, z) => { const y = new Float32Array(z - a); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, w1 = 0, w2 = 0;
    for (let j = a; j < z; j++) { const v = x[j], s1 = 1.53512485958697 * v - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - .73248077421585 * y2; x2 = x1; x1 = v; y2 = y1; y1 = s1;
      const s2 = s1 - 2 * u1 + u2 + 1.99004745483398 * w1 - .99007225036621 * w2; u2 = u1; u1 = s1; w2 = w1; w1 = s2; y[j - a] = s2; } return y; };
  const lufs = ms => ms > 0 ? +(-0.691 + 10 * Math.log10(ms)).toFixed(1) : -120;
  const stat = (i, t0, t1) => { const L = ch(i), R = ch(i + 1), a = Math.floor(t0 * sr), z = Math.floor(t1 * sr); let pk = 0, s = 0;
    for (let j = a; j < z; j++) { const l = L[j], r = R[j]; pk = Math.max(pk, Math.abs(l), Math.abs(r)); s += (l * l + r * r) / 2; }
    const w0 = Math.max(0, a - Math.floor(.2 * sr)), kL = kw(L, w0, z), kR = kw(R, w0, z), off = a - w0, cum = new Float64Array(kL.length + 1);
    for (let j = 0; j < kL.length; j++) cum[j + 1] = cum[j] + kL[j] * kL[j] + kR[j] * kR[j];
    const slide = win => { const n = Math.floor(win * sr), st = Math.floor(.1 * sr); let m = 0; for (let j = off; j + n <= kL.length; j += st) m = Math.max(m, (cum[j + n] - cum[j]) / n); return m; };
    return {peak: db(pk), rms: db(Math.sqrt(s / Math.max(1, z - a))), M: lufs(slide(.4)), S: t1 - t0 >= 3 ? lufs(slide(3)) : null}; };
  return {sErr: window.__sErr || null, limiter: !!A.LIM, rows: W.map(w => ({name: w.name, master: stat(0, w.t0, w.t1), ...Object.fromEntries(BUSES.map((k, i) => [k, stat(2 + 2 * i, w.t0, w.t1)]))}))};
}, BUSES);
r.errors = errs; if (r.err) { console.log(r); process.exit(1); }
console.log('peak dBFS / rms dBFS over the window / loudest 400 ms (LUFS, momentary) / loudest 3 s (LUFS, short-term)'); console.log('sound'.padEnd(48), 'master'.padEnd(28), 'effects bus'.padEnd(28), 'crowd bus');
const f = s => `${s.peak} / ${s.rms} / ${s.M}${s.S == null ? '' : ' / ' + s.S}`.padEnd(28);
for (const w of r.rows) console.log(w.name.padEnd(48), f(w.master), f(w.fx), f(w.crowd));
const row = n => r.rows.find(w => w.name.startsWith(n)), hit = row('ball hit 40'), g = row('goal ('), st = row('stacked'), rp = row('replayed'), sl = row('goal, Effects');
const ok = r.limiter && st.master.peak <= -0.5 && g.master.peak <= -1 && g.master.M - hit.master.M <= 6 && rp.master.M <= g.master.M - 5 && sl.master.M <= g.master.M - 4 && !r.sErr && !errs.length;
console.log(`goal vs hard hit (momentary): ${(g.master.M - hit.master.M).toFixed(1)} dB; replayed goal vs live: ${(rp.master.M - g.master.M).toFixed(1)} dB; sliders 50%: ${(sl.master.M - g.master.M).toFixed(1)} dB; stacked master peak ${st.master.peak} dBFS; limiter ${r.limiter}`);
if (r.sErr || errs.length) console.log('errors', r.sErr, errs);
console.log(ok ? 'SOUND LEVEL CHECK PASSED' : 'SOUND LEVEL CHECK FAILED'); await b.close(); await server.close(); process.exit(ok ? 0 : 1);
