/* Audio levels, both games: the real synths (League: src/audio/audio.js + sfx.js and the modes' own tone / noise calls; Zombies: engine/audio.js,
   zaudio.js, zthreatsfx.js, the bosses', the arsenal's and the modules' api.tone calls) are rendered into an OfflineAudioContext in headless
   Edge / Chrome (nothing plays out loud) and every sound is measured at the master output, after the game's master bus and limiter:
     peak and RMS (dBFS), loudness (ITU-R BS.1770 K-weighted, loudest 400 ms = momentary LUFS), the peak before the limiter (pre) and the most
     the limiter / compressor pulled it down inside the window (lim, dB: the limiter engaged), and how many triggers the window holds (count).
   One timeline per game, a few seconds per sound, driven through the games' APIs (League: the modules behind window.__dl; Zombies: window.__z).
   Then bursts (many of one sound in a second: a wall or not), everything at once, and the volume sliders (do they scale what they claim).
   Each sound has a class with a peak cap (dBFS): big (the biggest hits) -3, mid (ordinary events) -8, ui (beeps, chimes) -12, bed (sustained:
   motors, crowd, music, threat voices) -12, burst and stack -1. Over the cap fails the check locally and only warns in CI, like the timing
   checks (tools/browser.mjs TIMING_WARN). The targets: big hits peaking around -6, ordinary events -12 to -18, beds lower, nothing near 0.
     node tools/audio-levels.mjs                   both games, the whole table
     node tools/audio-levels.mjs --game=zombies    one game (league | zombies)
     node tools/audio-levels.mjs --quick           the caps only: no bursts, stacks or slider sweeps (CI runs this per game)
     node tools/audio-levels.mjs --json FILE       also write the rows as JSON */
import fs from 'node:fs';
import {launchBrowser, gameReady, TIMING_WARN, CI} from './browser.mjs';
import {serve, launch, open, sleep} from './zlib.mjs';

const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : argv.find(a => a.startsWith(k + '='))?.slice(k.length + 1); };  /* --game zombies or --game=zombies */
const GAME = opt('--game') || 'both', QUICK = argv.includes('--quick'), JSON_OUT = opt('--json');
if (!['both', 'league', 'zombies'].includes(GAME)) { console.error('--game must be league, zombies or both'); process.exit(2); }
const CAP = {big: -3, mid: -8, ui: -12, bed: -12, burst: -1, stack: -1};
let fails = 0, warns = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };
/* a level check: fails locally, warn-only in CI (DL_TIMING_WARN), like tools/browser.mjs timingCheck */
const soft = (ok, msg) => { if (ok || !TIMING_WARN) return check(ok, msg); warns++; console.log('  WARN ' + msg + ' (level check is warn-only here: ' + (CI ? 'CI' : 'DL_TIMING_WARN') + ')'); if (process.env.GITHUB_ACTIONS) console.log('::warning title=audio level::' + msg.replace(/[\r\n]+/g, ' ')); };

/* ---------- in the page: the offline context (4 channels: master L/R, pre-limiter L/R), the event scheduler and the meter ---------- */
/* installed before the page loads: window.AudioContext hands out one OfflineAudioContext whose "destination" is a tap into channels 0/1 of a
   merger on the real destination; c.__tap(2) gives a second tap (channels 2/3) for the signal before the limiter */
const OAC = (DUR) => {
  const SR = 48000, NCH = 4;
  const OAC = function () { const c = new OfflineAudioContext(NCH, SR * DUR, SR), mg = c.createChannelMerger(NCH); mg.connect(c.destination);
    const tap = (ch) => { const g = c.createGain(); g.channelCount = 2; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; const sp = c.createChannelSplitter(2); g.connect(sp); sp.connect(mg, 0, ch); sp.connect(mg, 1, ch + 1); return g; };
    Object.defineProperty(c, 'destination', {value: tap(0), configurable: true}); c.__tap = tap; c.__resume = OfflineAudioContext.prototype.resume.bind(c); c.resume = () => Promise.resolve(); window.__oac = c; return c; };
  window.AudioContext = window.webkitAudioContext = OAC;
};
const PAGE = `window.__lv = (() => {
  const db = x => x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -120;
  /* ITU-R BS.1770 K-weighting (48 kHz coefficients) */
  const kw = (x, a, z) => { const y = new Float32Array(z - a); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, w1 = 0, w2 = 0;
    for (let j = a; j < z; j++) { const v = x[j], s1 = 1.53512485958697 * v - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - .73248077421585 * y2; x2 = x1; x1 = v; y2 = y1; y1 = s1;
      const s2 = s1 - 2 * u1 + u2 + 1.99004745483398 * w1 - .99007225036621 * w2; u2 = u1; u1 = s1; w2 = w1; w1 = s2; y[j - a] = s2; } return y; };
  /* peak, RMS over the window, loudest 400 ms (momentary LUFS) of channels L/R between t0 and t1 */
  const stat = (L, R, sr, t0, t1) => { const a = Math.floor(t0 * sr), z = Math.min(L.length, Math.floor(t1 * sr)); let pk = 0, s = 0;
    for (let j = a; j < z; j++) { const l = L[j], r = R[j]; pk = Math.max(pk, Math.abs(l), Math.abs(r)); s += (l * l + r * r) / 2; }
    const kL = kw(L, a, z), kR = kw(R, a, z), n = Math.floor(.4 * sr), st = Math.floor(.05 * sr), cum = new Float64Array(kL.length + 1); for (let j = 0; j < kL.length; j++) cum[j + 1] = cum[j] + kL[j] * kL[j] + kR[j] * kR[j];
    let m = 0; for (let j = 0; j + n <= kL.length; j += st) m = Math.max(m, (cum[j + n] - cum[j]) / n); return {peak: db(pk), rms: db(Math.sqrt(s / Math.max(1, z - a))), M: m > 0 ? +(-0.691 + 10 * Math.log10(m)).toFixed(1) : -120}; };
  /* render the timeline: every event fires in a suspend at its time (one suspend per render quantum), the compressors' reduction is probed every
     probeMs inside the windows (the most negative value per window = how hard the limiter worked), wait = wall ms after a fired event (the
     League's rate limits run on wall time) */
  async function render(c, ev, W, comps, probeMs, wait) {
    const q = 128 / c.sampleRate, at = new Map(), red = W.map(() => 0), add = (t, f) => { const k = Math.max(1, Math.round(t / q)); if (!at.has(k)) at.set(k, []); at.get(k).push(f); };
    const probe = () => { const t = c.currentTime; for (let i = 0; i < W.length; i++) if (t >= W[i].t0 - .01 && t <= W[i].t1) for (const x of comps) if (x) red[i] = Math.min(red[i], x.reduction); };
    for (const [t, f] of ev) add(t, f);
    for (const w of W) for (let t = w.t0; t < w.t1; t += probeMs / 1000) add(t, probe);
    for (const [k, fs] of [...at.entries()].sort((a, b) => a[0] - b[0])) c.suspend(k * q).then(async () => { let w = 0; for (const f of fs) { try { if (f === probe) f(); else { f(); w = wait; } } catch (e) { window.__lvErr = (window.__lvErr || '') + e.message + '; '; } } if (w) await new Promise(r => setTimeout(r, w)); c.__resume(); });
    const buf = await c.startRendering(), sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1), PL = buf.getChannelData(2), PR = buf.getChannelData(3);
    return W.map((w, i) => ({name: w.name, cls: w.cls, count: w.count, ...stat(L, R, sr, w.t0, w.t1), pre: stat(PL, PR, sr, w.t0, w.t1).peak, lim: +red[i].toFixed(1)}));
  }
  /* a timeline builder: one(name, cls, len, fire) = fire once and measure len seconds; burst(name, cls, n, sp, len, fire) = n fires sp apart;
     bed(name, cls, len, tick, stop, from) = tick every 50 ms for len s and measure from \`from\` s in (the loops settle), then stop */
  function timeline(T0) { let T = T0; const W = [], ev = [], at = (t, f) => ev.push([t, f]);
    const one = (name, cls, len, f, gap = .4) => { const t0 = T; at(t0 + .01, f); W.push({name, cls, t0, t1: t0 + len, count: 1}); T = t0 + len + gap; };
    const burst = (name, cls, n, sp, len, f) => { const t0 = T; for (let i = 0; i < n; i++) at(t0 + .01 + i * sp, () => f(i)); W.push({name, cls, t0, t1: t0 + len, count: n}); T = t0 + len + .5; };
    const bed = (name, cls, len, tick, stop, from = .5) => { const t0 = T; for (let t = 0; t < len; t += .05) at(t0 + t, tick); if (stop) at(t0 + len + .01, stop); W.push({name, cls, t0: t0 + from, t1: t0 + len, count: 1}); T = t0 + len + .9; };
    const win = (name, cls, t0, t1, count = 1) => W.push({name, cls, t0, t1, count});
    return {W, ev, at, one, burst, bed, win, get T() { return T; }, set T(v) { T = v; }}; }
  return {db, stat, render, timeline};
})()`;

/* ---------- Drone League ---------- */
async function league() {
  const {createServer} = await import('vite');
  const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
  const b = await launchBrowser({args: ['--ignore-gpu-blocklist'], protocolTimeout: 600000});
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.setDefaultNavigationTimeout(120000);  /* a cold Vite root bundles its deps on the first load: well past puppeteer's 30 s on a busy machine */
  await p.evaluateOnNewDocument(OAC, QUICK ? 110 : 190);
  await p.goto(server.resolvedUrls.local[0] + 'app.html'); await gameReady(p, 180000); await p.addScriptTag({content: PAGE});
  const r = await p.evaluate(async (QUICK) => {
    const A = await import('/src/audio/audio.js'), X = await import('/src/audio/sfx.js'), DF = await import('/src/modes/dogfight.js'), MA = await import('/src/modes/match.js'),
      {GS} = await import('/src/state.js'), {ball} = await import('/src/physics/ball.js'), {S} = await import('/src/config/settings.js'), {camera} = await import('/src/render/renderer.js'), EV = await import('/src/core/events.js'), C = await import('/src/config/constants.js'), {BR} = await import('/src/config/tune.js');
    DF.setGame('league'); MA.startMatch(); GS.paused = true; GS.menuOpen = false; window.requestAnimationFrame = () => 0; await new Promise(q => setTimeout(q, 300)); const c = window.__oac;  /* the game loop stops: only the timeline makes sound */
    if (!c || A.AC !== c) return {err: 'no offline context'};
    A.BUS.mst.connect(c.__tap(2));  /* the master bus before the limiter */
    const me = GS.player, V = ball.p.constructor, front = () => { const f = new V(0, 0, -1).applyQuaternion(camera.quaternion); return camera.position.clone().addScaledVector(f, 10); };
    const other = GS.drones.find(d => d !== me);
    const live = f => { const pz = GS.paused, dm = GS.demo; GS.paused = false; GS.demo = false; try { f(); } finally { GS.paused = pz; GS.demo = dm; } };
    const motor = (ms, v, boost) => live(() => { me.dead = 0; me.thr = me.ms = ms; me.boostOn = boost; me.v.set(0, 0, -v); if (other) { other.ms = 0; other.p.set(500, 50, 0); } A.audioTick(1 / 60); });
    const motorOff = () => { const pz = GS.paused; GS.paused = false; GS.demo = true; try { A.audioTick(1 / 60); } finally { GS.paused = pz; GS.demo = false; } };  /* the quad "not flying": motors, wash and wind fade out (an idle quad still hums) */
    const tick = () => live(() => X.sfxTick(1 / 60));
    const goal = (t) => { ball.p.copy(front()); GS.state = 'goal'; GS.stT = 3; X.goalSfx(t, ball.p); };
    const hit = (sp, spin = 0) => { ball.p.copy(front()); ball.w.set(0, 0, spin); X.ballHit(me, sp); };
    const bounce = (sp, floor = true) => { ball.p.copy(front()); ball.n.set(floor ? 0 : 1, floor ? 1 : 0, 0); X.ballBounce(sp); };
    const tl = __lv.timeline(.3), {one, burst, bed, at, win} = tl;
    const place = () => { ball.p.copy(front()); me.w.set(0, 0, 0); GS.demo = false; GS.state = 'play'; };
    /* a slider set a moment ahead of the sound (setVolumes ramps with a 20 ms time constant) */
    const vol = (k, v) => { S[k] = v; A.setVolumes(); }, slide = (k, v) => at(tl.T - .25, () => vol(k, v));
    /* the crowd bed sits under everything in play: muted except in its own, the goal's and the stacked rows, so each sound is measured alone */
    at(.05, () => vol('vCrowd', 0));
    /* beds: own motors, wind (own motors muted: their idle hum would drown it), the nearest other quad */
    bed('motors: full throttle + boost (wind 30 m/s)', 'bed', 2.5, () => motor(1, 30, true), () => motorOff());
    slide('vWind', 0); bed('motors only: full throttle + boost (wind muted)', 'bed', 2.5, () => motor(1, 30, true), () => { motorOff(); vol('vWind', 100); });
    slide('vMotor', 0); bed('wind at 70 m/s (own motors muted)', 'bed', 2.5, () => motor(.02, 70, false), () => { motorOff(); vol('vMotor', 100); });
    if (other) { slide('vMotor', 0); bed('other quad 5 m away, full throttle (own motors muted)', 'bed', 2.5, () => live(() => { me.dead = 0; me.ms = 0; me.v.set(0, 0, 0); other.dead = 0; other.ms = 1; other.p.copy(camera.position).add(new V(5, 0, 0)); A.audioTick(1 / 60); }), () => { motorOff(); vol('vMotor', 100); }); }
    /* one-shots from sfx.js */
    one('ball hit 20 m/s', 'mid', 1, () => { place(); hit(20); });
    one('ball hit 40 m/s, spinning', 'big', 1.2, () => { place(); hit(40, 12); });
    one('ball bounce 35 m/s (floor)', 'mid', 1, () => { place(); bounce(35); });
    one('ball bounce 35 m/s (wall: panel ring)', 'mid', 1, () => { place(); bounce(35, false); });
    one('landing 25 m/s', 'mid', 1, () => { place(); X.groundHit(me, 25, me.p); });
    one('landing 30 m/s, tumbling (clatter)', 'mid', 1, () => { place(); me.w.set(0, 0, 20); X.groundHit(me, 30, me.p); me.w.set(0, 0, 0); });
    one('pop whoosh', 'mid', 1, () => X.popWhoosh(.4));
    one('pop earned (chime)', 'ui', .6, () => A.tone(1500, 2200, .08, .05));
    one('countdown pip', 'ui', .6, () => X.countdown(3));
    one('GO (chord + sweep + cheer)', 'mid', 1.2, () => { place(); X.countdown(0); });
    bed('scrape: sliding 20 m/s on the floor', 'bed', 2, () => { place(); me.dead = 0; me.slide = 20; me.gt = 1; tick(); }, () => { me.slide = 0; me.gt = 0; tick(); });
    bed('ball rolling 15 m/s', 'bed', 2, () => { place(); ball.c = true; ball.bodyMode = 'dyn'; ball.v.set(0, 0, 15); ball.w.set(15 / BR, 0, 0); tick(); }, () => { ball.c = false; ball.v.set(0, 0, 0); ball.w.set(0, 0, 0); tick(); });
    /* the crowd: the bed in play, then reactions on top of it */
    slide('vCrowd', 100); bed('crowd bed in play', 'bed', 3.5, () => { place(); tick(); }, null, 1.5);
    one('crowd: save cheer', 'mid', 3, () => { place(); tick(); EV.emitEv('save', {d: me, speed: 40}); });
    one('crowd: shot on target (ooh)', 'mid', 2.5, () => { place(); tick(); EV.emitEv('shot', {d: me}); });
    one('crowd: near miss off the back wall (ooh)', 'mid', 2.5, () => { place(); tick(); ball.p.set(C.GW / 2 + 6, 8, -C.HL + 12); ball.n.set(0, 0, 1); X.ballBounce(40); });
    at(tl.T - .3, () => { GS.demo = true; tick(); });
    /* the goal */
    one('goal boom alone (demo)', 'big', 2.5, () => { GS.demo = true; goal(me.team); GS.demo = false; });
    const fullGoal = (name, cls, team, extra) => { const t0 = tl.T; at(t0 + .01, () => { place(); goal(team); extra?.(); }); for (let t = .1; t < 5; t += .1) at(t0 + t, () => { GS.stT = 3 - t; tick(); }); at(t0 + 5.05, () => { GS.demo = true; tick(); GS.demo = false; }); win(name, cls, t0, t0 + 5); tl.T = t0 + 5.9; };
    fullGoal('goal: boom + horn + stinger + roar', 'big', me.team);
    fullGoal('goal against (opponent scores: smaller cheer, groan)', 'big', 1 - me.team); slide('vCrowd', 0);
    /* the modes' own sounds (as src/flight/drone.js, modes/*.js, net/net.js, render/replay.js call tone / noise) */
    one('super boost lit (drone.js)', 'mid', 1, () => { A.noise(.35, 140, .5); A.tone(110, 320, .3, .12, 'sawtooth'); });
    one('boost orb picked up (step.js)', 'ui', .6, () => A.tone(700, 1400, .15, .08));
    one('match end chime (match.js)', 'mid', 1, () => A.tone(523, 1046, .6, .2, 'triangle'));
    one('quad demolished burst (match.js / net.js / replay.js)', 'big', 1, () => A.noise(.6, 200, .7));
    one('Dogfight: shot down burst', 'big', 1.2, () => A.noise(.7, 180, .8));
    one('Dogfight: hit marker', 'ui', .5, () => A.tone(1500, 900, .05, .05, 'square'));
    one('Dogfight: hurt', 'mid', .6, () => A.noise(.12, 300, .25));
    one('Dogfight: bullet into rock', 'mid', .6, () => X.bulletRock(front()));
    one('Dogfight: gun shot tick (guns.js)', 'ui', .4, () => A.noise(.05, 1800, .1, 2));
    one('Training: goal (burst + chime)', 'big', 1.8, () => { A.noise(1.2, 300, .8, .6); A.tone(880, 1320, .35, .16, 'triangle'); });
    one('Training: miss', 'mid', 1, () => A.tone(300, 150, .35, .14, 'sawtooth'));
    one('Longline: ball stolen', 'mid', .6, () => A.tone(520, 260, .18, .12, 'triangle'));
    one('Lab / calibration beep', 'ui', .5, () => A.tone(880, 880, .08, .08));
    /* envelopes started off the render quantum (the spin zip starts 10 ms after the hit): a gain that is 1 until its first event leaks a click */
    burst('ball spin zips x30 (offset envelope onsets)', 'mid', 30, .05, 2.5, () => { place(); hit(12, 30 / BR); });
    if (!QUICK) {
      /* bursts: many of one sound in about a second (the per-sound rate limits and the voice cap are part of what is measured) */
      burst('burst: 20 ball hits 40 m/s in 1.2 s', 'burst', 20, .06, 2, () => { place(); hit(40, 12); });
      burst('burst: 12 landings 30 m/s in 1 s', 'burst', 12, .08, 2, () => { place(); X.groundHit(me, 30, me.p); });
      burst('burst: 10 bounces 40 m/s in .6 s', 'burst', 10, .06, 1.5, () => { place(); bounce(40); });
      burst('burst: 20 bullets into rock in .8 s', 'burst', 20, .04, 1.5, () => X.bulletRock(front()));
      burst('burst: 4 quads shot down at once', 'burst', 4, .02, 1.5, () => A.noise(.7, 180, .8));
      burst('burst: 8 super boosts in .8 s', 'burst', 8, .1, 1.5, () => { A.noise(.35, 140, .5); A.tone(110, 320, .3, .12, 'sawtooth'); });
      /* everything at once: the goal, a hard hit, a bounce, a landing and full motors */
      slide('vCrowd', 100); { const t0 = tl.T; for (let t = 0; t < 5; t += .1) at(t0 + t + .05, () => motor(1, 30, true)); fullGoal('stacked: goal + hit + bounce + landing + motors', 'stack', me.team, () => { hit(40, 12); bounce(40); X.groundHit(me, 30, me.p); }); at(tl.T - .3, () => motorOff()); } slide('vCrowd', 0);
      /* the sliders: each scales its own bus (and only that one); 50% = (0.5)^2 = -12 dB (squared so the slider feels even to the ear); each
         setting is restored right after its row (before the next row's set) */
      const back = (k, v) => at(tl.T - .35, () => vol(k, v));
      slide('vMaster', 50); one('slider: ball hit 20 m/s, Master 50%', 'mid', 1, () => { place(); hit(20); }); back('vMaster', 100);
      slide('vFx', 50); one('slider: ball hit 20 m/s, Effects 50%', 'mid', 1, () => { place(); hit(20); }); back('vFx', 100);
      slide('vCrowd', 50); one('slider: ball hit 20 m/s, Crowd 50% (no change)', 'mid', 1, () => { place(); hit(20); }); back('vCrowd', 0);
      slide('vCrowd', 50); bed('slider: crowd bed in play, Crowd 50%', 'bed', 3.5, () => { place(); tick(); }, () => { GS.demo = true; tick(); vol('vCrowd', 0); }, 1.5);
      slide('vWind', 0); slide('vMotor', 50); bed('slider: motors only, Motors 50%', 'bed', 2.5, () => motor(1, 30, true), () => { motorOff(); vol('vMotor', 100); vol('vWind', 100); });
      slide('vMotor', 0); slide('vWind', 50); bed('slider: wind 70 m/s, Wind 50% (own motors muted)', 'bed', 2.5, () => motor(.02, 70, false), () => { motorOff(); vol('vWind', 100); vol('vMotor', 100); });
      slide('vMaster', 0); one('slider: ball hit 20 m/s, Master 0%', 'ui', 1, () => { place(); hit(20); }); back('vMaster', 100);
    }
    at(tl.T, () => vol('vCrowd', 100));
    if (tl.T > c.length / c.sampleRate) return {err: 'timeline longer than the render: ' + tl.T.toFixed(1) + ' s'};
    const rows = await __lv.render(c, tl.ev, tl.W, [A.LIM], 40, 55);
    return {rows, sErr: window.__lvErr || null, limiter: !!A.LIM};
  }, QUICK);
  await b.close(); await server.close();
  return {...r, errs};
}

/* ---------- Zombies ---------- */
async function zombies() {
  const {server, origin} = await serve(); const b = await launch(); const errs = [];
  const p = await b.newPage();
  await p.evaluateOnNewDocument(OAC, QUICK ? 280 : 330);
  await open(b, origin + '/games/interceptor/?mode=zombies', errs, {page: p});
  await p.evaluate(() => { sessionStorage.setItem('zbossRoster', '0'); localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zsfxv: 1, zmusv: 1})); });
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 120000}); await sleep(300);
  await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000}); await sleep(300); await p.addScriptTag({content: PAGE});
  const r = await p.evaluate(async (QUICK) => {
    const {Z, G, api} = __z, c = window.__oac, S = api.S; window.requestAnimationFrame = () => 0; await new Promise(q => setTimeout(q, 200));  /* the game loop stops: only the timeline makes sound */
    const E = await import('/engine/audio.js'), {PATCH} = await import('/games/interceptor/zthreatsfx.js'), {nbuf} = E;
    if (!c || E.AC !== c) return {err: 'no offline context'};
    S.zmus = 0; const A = Z.au.bus; if (!A) return {err: 'no zaudio bus'}; Z.au.stopMusic(); Z.au.music(0, 'off', .05);  /* the frame loop had started the base screen's pad: off; the music stays muted (B) except in its own windows */
    E.AC.destination.connect(c.__tap(2));  /* the engine's master gain, before its limiter */
    const cam = api.camera.position, V = api.THREE.Vector3, at = (dx, dy, dz) => new V(cam.x + dx, cam.y + dy, cam.z + dz), now = () => c.currentTime;
    const boomLv = (B, d) => B / (1 + (d / 700) ** 1.3), dly = d => d > 100 ? Math.min(3.2, d / 343) : 0;
    const me = api.player, dart = {ms: 1, v: new V(0, 0, -90), q: me.q.clone(), w: new V(0, 0, 0), boostOn: false};  /* the engine's motor synth: your interceptor at full throttle, 90 m/s */
    E.motorAudio(me, 1 / 60, false);  /* the frame loop left your interceptor's motors running: off, so they are not under every window (their own bed below) */
    const tl = __lv.timeline(11.6), {one, burst, bed, win} = tl;
    /* the wave starts now (Z.continue: the air-raid siren and the sting are scheduled from t = 0); state 'clear' keeps the front's random artillery quiet */
    Z.an?.radioClear?.(); __z.cont(); Z.an?.radioClear?.(); G.state = 'clear';
    win('wave start: sting (drum + brass stab)', 'big', .05, 1.6); win('air-raid siren (10.5 s)', 'bed', 2, 10.4);
    const vis = () => { Z.an?.radioClear?.(); Z.visuals(.05); };
    bed('your interceptor: motors at full throttle, 90 m/s (engine motor synth)', 'bed', 2.5, () => E.motorAudio(dart, .05, true), () => E.motorAudio(dart, .05, false));
    /* explosions (zaudio boom), the kill path through interceptor.js boom() (Z.flash -> zaudio boom), kills */
    one('explosion k=1 at 30 m (small kill, close)', 'big', 1.5, () => Z.au.boom(at(0, 0, -30), 1));
    one('explosion k=3 at 50 m (a kill up close)', 'big', 2, () => Z.au.boom(at(0, 0, -50), 3));
    one('explosion k=4 at 150 m (site hit)', 'big', 2.5 + dly(150), () => Z.au.boom(at(0, 0, -150), 4));
    one('explosion k=6 at 300 m (ICBM impact)', 'big', 3 + dly(300), () => Z.au.boom(at(0, 0, -300), 6));
    one('explosion k=6 at 1500 m (far impact)', 'mid', 3 + dly(1500), () => Z.au.boom(at(0, 0, -1500), 6));
    one('kill via api.boom k=3.2 at 100 m (interceptor.js boom: raw noise + zaudio boom)', 'big', 2.5, () => api.boom(at(0, 0, -100), 3.2));
    one('ICBM impact via api.boom k=6 at 300 m', 'big', 3 + dly(300), () => api.boom(at(0, 0, -300), 6));
    one('your kill: confirm (zaudio kill, 1)', 'mid', 1, () => Z.au.kill(1, false));
    one('quad kill + clutch (zaudio kill, 4)', 'mid', 1.2, () => Z.au.kill(4, true));
    /* the real kill path (killThreat -> boom + Z.kill -> the next visuals() -> zaudio kill): oscillators are logged by their frequency sweep, so the check below can count the confirm's voices */
    const OSC = []; { const mk = c.createOscillator.bind(c); c.createOscillator = () => { const o = mk(), e = {}, f = o.frequency, sv = f.setValueAtTime.bind(f), xr = f.exponentialRampToValueAtTime.bind(f), st = o.start.bind(o);
      f.setValueAtTime = (v, t) => { e.f0 = e.f0 ?? v; return sv(v, t); }; f.exponentialRampToValueAtTime = (v, t) => { e.f1 = v; return xr(v, t); }; o.start = t => { e.type = o.type; e.at = t ?? c.currentTime; OSC.push(e); return st(t); }; return o; }; }
    const KT0 = tl.T, KLEN = .6;  /* short on purpose: the music windows' peaks depend on where the timeline puts them, so rows keep their length when others are swapped */
    one('your kill, the real path (killThreat: explosion + zaudio confirm, no interceptor.js beep)', 'big', KLEN, () => { const t = __z.make('shahed', cam.x, cam.z - 100); t.p.set(cam.x, cam.y + 5, cam.z - 100); t.by = 'p'; G.burst = {n: 0}; api.killThreat(t, true); G.burst = null; vis(); Z.an?.radioClear?.(); t.mesh.visible = false; });  /* the banner / radio line the kill queues must not play into later windows */
    one('Mothership down (chord + rumble)', 'big', 4, () => Z.au.bossDown());
    one('boss wave sting', 'big', 3.6, () => Z.au.sting(true));
    one('wave clear chord', 'mid', 2.5, () => Z.au.clearChord());
    one('summary star', 'ui', 1, () => Z.au.star(2, true));
    one('cash chink', 'ui', .4, () => Z.au.coin());
    one('site hit rumble (big)', 'mid', 3.5, () => Z.au.siteHit(true));
    one('integrity alarm', 'ui', 1, () => Z.au.alarm());
    one('radio call (1.5 s)', 'ui', 2.3, () => Z.au.radio(1.5));
    burst('radio calls x12 (envelope onsets off the render quantum)', 'ui', 12, .2, 4.5, () => Z.au.radio(1.5));  /* a gain that is 1 until its first event leaks a click */
    one('near miss whoosh (zfx, .4)', 'mid', 1, () => Z.au.whoosh(.4, 1));
    for (const [g, len] of [['gepard', 1], ['flak', .8], ['sam', 2.8], ['idome', 1.9], ['rack', 1]]) one(`helper ${g} firing at 50 m`, 'mid', len, () => Z.au.gun(at(20, 0, -46), g));
    one('artillery rumble on the horizon (.11)', 'bed', 3, () => Z.au.rumble(.11, 0, 2.5));
    one('game over rumble (.5)', 'mid', 4.5, () => Z.au.rumble(.5, 0, 4));
    /* threat sound (zthreatsfx.js): re-entry events, sonic booms, passes, the rumble voice, the continuous voices at their reference distance */
    one('re-entry alarm (ICBM)', 'big', 3, () => Z.tsfx.alarm(true));
    one('re-entry alarm (ballistic)', 'mid', 1.5, () => Z.tsfx.alarm(false));
    one('Golden Dome uplink 500 m', 'ui', 2.6, () => Z.tsfx.uplink(at(0, 300, -400)));
    one('intercept crack 1 km (ICBM warhead, as zthreatsfx.intercept places it)', 'big', 5, () => PATCH.boom(c, nbuf, A.sfx, now() + .01, Math.min(.6, Math.max(.015, .55 / (1 + (1000 / 5000) ** 1.3))), {len: .16, dull: .2, roll: 1.575}));
    one('sonic boom: ballistic passing 150 m', 'big', 4, () => PATCH.boom(c, nbuf, A.sfx, now() + .01, boomLv(.7, 150), {len: .11, dull: 150 / 9000, roll: .64}));
    one('sonic boom: ICBM passing 600 m', 'big', 4, () => PATCH.boom(c, nbuf, A.sfx, now() + .01, boomLv(.8, 600), {len: .09 * 1.02, dull: 600 / 9000, roll: .75}));
    one('sonic boom: kill vehicle passing 100 m', 'mid', 3.5, () => PATCH.boom(c, nbuf, A.sfx, now() + .01, boomLv(.45, 100), {len: .05, dull: .01, roll: .62}));
    one('near miss: jet whoosh (tsfx, .42)', 'mid', 2, () => PATCH.whoosh(c, nbuf, A.sfx, now() + .01, .42, {dur: .7, f0: 2000, f1: 260, p0: -1, p1: 1, low: .8}));
    bed('re-entry rumble at full (live voice)', 'bed', 4, () => { Z.tsfx.rumble = 1; vis(); }, () => { Z.tsfx.rumble = 0; vis(); }, 1.5);
    const TH = api.TH, voice = (name, k, ref, n = 1) => { let L = []; bed(name, 'bed', 3, () => { if (!L.length) for (let i = 0; i < n; i++) { const t = __z.make(k, cam.x, cam.z - 3000); if (!t) break; t.p.set(cam.x + i * 3, cam.y, cam.z - ref); t.v.set(0, 0, 0); if (n > 1) t.grp = 'lv'; L.push(t); } vis(); }, () => { for (const t of L) { const i = TH.indexOf(t); if (i >= 0) TH.splice(i, 1); } L = []; for (let i = 0; i < 10; i++) vis(); }, 1); };
    voice('threat voice: Shahed at 150 m (its reference distance)', 'shahed', 150); voice('threat voice: decoy at 110 m', 'decoy', 110); voice('threat voice: heavy at 190 m', 'heavy', 190);
    voice('threat voice: Mothership at 340 m', 'boss', 340); voice('threat voice: jet Geran at 260 m', 'jet', 260); voice('threat voice: cruise missile at 250 m', 'cruise', 250); voice('threat voice: swarm of 8 at 60 m', 'swarm', 60, 8);
    /* the bosses' own synth (zbosses.js SND, on the effects volume): stings and presence loops */
    const BS = Z.bosses, SND = BS?.ctx?.SND, STING = {ace: 1.6, ghost: 4.2, hive: 4.2, jammer: 1.4, jugg: 4.2, mirror: 2.5, puppet: 2.8, siren: 3.6, twins: 3, undertaker: 5};
    if (SND) { for (const [id, len] of Object.entries(STING)) if (BS.BOSSES[id]?.sting) one(`boss sting: ${id}`, 'mid', len, () => BS.BOSSES[id].sting(SND));
      for (const [id, v] of [['jugg', .12], ['ghost', .18], ['jammer', .13], ['ace', .07]]) if (BS.BOSSES[id]?.loop) { let L = null; bed(`boss loop: ${id} overhead (loop level ${v})`, 'bed', 2.2, () => { if (!L) { L = BS.BOSSES[id].loop(SND); L.g.gain.setTargetAtTime(v * SND.vol(), now(), .15); } }, () => { L.g.gain.setTargetAtTime(0, now(), .1); setTimeout(() => L.stop?.(), 400); }, 1); } }
    /* the arsenal's synth (zarsenal.js) at 30 m */
    const AS = Z.ars?.snd; if (AS) for (const [n, f, len] of [['EMP', () => AS.emp(at(0, 0, -30)), 1.2], ['net launch', () => AS.netShot(at(0, 0, -30)), .8], ['net capture', () => AS.net(at(0, 0, -30)), .8], ['flechette', () => AS.flech(at(0, 0, -30)), .8], ['kinetic dart clang', () => AS.dart(at(0, 0, -30)), 1.2],
      ['cluster x6', () => AS.cluster(at(0, 0, -30), 6), 1.6], ['flares + chaff', () => AS.flares(at(0, 0, -30)), 1.6], ['shop click', () => AS.click(), .4], ['microwave pulse', () => AS.pulse(at(0, 0, -30)), 1.4], ['cable twang', () => AS.twang(at(0, 0, -30)), 1.2], ['carrier volley x4', () => AS.volley(at(0, 0, -30), 4), 1.4], ['smoke hiss', () => AS.hiss(at(0, 0, -30)), 3]])
      one(`arsenal: ${n} at 30 m`, n === 'shop click' ? 'ui' : 'mid', len, f);
    /* the modules' direct api.tone / noise calls (engine/audio.js, straight to the master bus), as they call them */
    one('readout: HIT (zweapons / znet / zombies.js tone)', 'ui', .6, () => api.tone(520, 1040, .22, .14, 'triangle'));
    one('readout: MISS (zweapons sawtooth)', 'ui', .7, () => api.tone(300, 140, .35, .12, 'sawtooth'));
    one('site hit tone (zombies.js)', 'ui', .8, () => api.tone(150, 80, .45, .07, 'triangle'));
    one('sortie: hull hit (zsortie sawtooth)', 'mid', .7, () => api.tone(180, 90, .3, .14, 'sawtooth'));
    one('swarm command (zswarm)', 'ui', .5, () => api.tone(700, 900, .12, .06, 'triangle'));
    one('perk: freeze (zperk)', 'ui', .7, () => api.tone(1200, 600, .4, .08, 'triangle'));
    one('bomb away (zsortie square)', 'ui', .5, () => api.tone(520, 260, .12, .08, 'square'));
    one('lock tick (zsortie / Ace lock)', 'ui', .4, () => api.tone(1250, 1250, .05, .05, 'square'));
    one('dart ground strike (interceptor.js noise)', 'mid', .6, () => api.noise(.12, 500, .4));
    one('thunder (interceptor.js weather)', 'big', 4, () => { api.noise(3.5, 70, .7, .4); api.noise(1.2, 160, .35, .6); });
    one('calibration beep (engine/input.js)', 'ui', .5, () => api.tone(880, 880, .08, .08));
    /* the score */
    const music = (I, st) => () => { S.zmus = 1; Z.au.music(I, st, .05); }, musicOff = () => { Z.au.stopMusic(); S.zmus = 0; Z.au.music(0, 'off', .05); };
    bed('music, full intensity (wave)', 'bed', 8, music(1, 'wave'), musicOff, 3.5); tl.T += 1;
    bed('music, pad only (base screen)', 'bed', 4, music(0, 'base'), musicOff, 2); tl.T += 1;
    if (!QUICK) {
      /* bursts: many of one sound in about a second (the voice caps and rate limits are part of what is measured) */
      burst('burst: 20 explosions k=2 at 40-120 m in 1 s', 'burst', 20, .05, 3, i => Z.au.boom(at((i % 5) * 20 - 40, 0, -40 - i * 4), 2));
      burst('burst: 20 kills (zaudio kill) in 1 s', 'burst', 20, .05, 2.5, i => Z.au.kill(1 + i % 3, i % 4 === 0));
      burst('burst: 20 cash chinks in .2 s', 'burst', 20, .01, 1, () => Z.au.coin());
      burst('burst: helper volley (6 racks, 4 Gepards, 2 SAMs, 2 flak at 50-150 m)', 'burst', 14, .04, 3.5, i => Z.au.gun(at(i * 10 - 70, 0, -50 - i * 7), i < 6 ? 'rack' : i < 10 ? 'gepard' : i < 12 ? 'sam' : 'flak'));
      burst('burst: 10 readout HIT tones in .5 s', 'burst', 10, .05, 1.2, () => api.tone(520, 1040, .22, .14, 'triangle'));
      burst('burst: 12 kills through api.boom k=3.2 at 60-200 m in 1 s', 'burst', 12, .08, 3, i => api.boom(at(i * 12 - 70, 0, -60 - i * 12), 3.2));
      burst('burst: 8 sonic booms (ballistic 150-600 m) at once', 'burst', 8, .03, 4, i => PATCH.boom(c, nbuf, A.sfx, now() + .01, boomLv(.7, 150 + i * 64), {len: .11, dull: .05, roll: .7}));
      if (AS) burst('burst: arsenal flechette + dart + cluster x3 at 30 m', 'burst', 3, .03, 2, i => [() => AS.flech(at(0, 0, -30)), () => AS.dart(at(0, 0, -30)), () => AS.cluster(at(0, 0, -30), 6)][i]());
      /* everything at once */
      { const t0 = tl.T; for (let t = 0; t < 5; t += .05) tl.at(t0 + t, music(1, 'wave')); tl.at(t0 + 3, () => { Z.au.boom(at(0, 0, -300), 6); PATCH.boom(c, nbuf, A.sfx, now() + .01, boomLv(.7, 150), {len: .11, roll: .64}); Z.tsfx.alarm(true); PATCH.whoosh(c, nbuf, A.sfx, now() + .01, .42, {low: .8}); api.tone(520, 1040, .22, .14, 'triangle'); api.boom(at(30, 0, -100), 3.2); });
        tl.at(t0 + 5.05, musicOff); win('stacked: ICBM impact + sonic boom + alarm + whoosh + kill + readout + music', 'stack', t0 + 3, t0 + 5, 7); tl.T = t0 + 6; }
      /* the sliders: effects (zsfxv) scales every effect, music (zmusv) the score; 50% = -6 dB (linear). Set a moment ahead (the gains ramp over 50 ms) */
      const sfx = v => { S.zsfxv = v; Z.au.music(0, 'off', .05); }, slide = v => tl.at(tl.T - .25, () => sfx(v)), back = () => tl.at(tl.T - .35, () => sfx(1));
      one('slider: helper rack firing at 60 m', 'mid', 1, () => Z.au.gun(at(20, 0, -57), 'rack'));
      slide(.5); one('slider: helper rack firing at 60 m, effects 50%', 'mid', 1, () => Z.au.gun(at(20, 0, -57), 'rack')); back();
      slide(.5); one('slider: readout HIT tone, effects 50%', 'ui', .6, () => api.tone(520, 1040, .22, .14, 'triangle')); back();
      if (AS) { slide(.5); one('slider: arsenal dart clang at 30 m, effects 50%', 'mid', 1.2, () => AS.dart(at(0, 0, -30))); back(); }
      if (SND) { slide(.5); one('slider: boss sting jugg, effects 50%', 'mid', 4.2, () => BS.BOSSES.jugg.sting(SND)); back(); }
      slide(.5); one('slider: re-entry alarm (ballistic), effects 50%', 'mid', 1.5, () => Z.tsfx.alarm(false)); back();
      bed('slider: music full, music 50%', 'bed', 8, () => { S.zmusv = .5; music(1, 'wave')(); }, () => { musicOff(); S.zmusv = 1; }, 3.5); tl.T += 1;
      slide(0); one('slider: helper rack firing at 60 m, effects 0%', 'ui', 1, () => Z.au.gun(at(20, 0, -57), 'rack')); back();
      bed('slider: music full, muted (B)', 'bed', 3, () => { S.zmus = 0; Z.au.music(1, 'wave', .05); }, musicOff, 1.5);
    }
    if (tl.T > c.length / c.sampleRate) return {err: 'timeline longer than the render: ' + tl.T.toFixed(1) + ' s'};
    const rows = await __lv.render(c, tl.ev, tl.W, [E.LIM, A.c], 40, 4);
    const inKill = e => e.at >= KT0 && e.at <= KT0 + KLEN, kill = {beeps: OSC.filter(e => inKill(e) && e.type === 'triangle' && e.f0 === 660 && e.f1 === 1320).length, thunks: OSC.filter(e => inKill(e) && e.type === 'sine' && e.f0 === 160 && e.f1 === 48).length};
    return {rows, kill, sErr: window.__lvErr || null, limiter: !!E.LIM, state: G.state};
  }, QUICK);
  await b.close(); server.close();
  return {...r, errs};
}

/* ---------- the table and the checks ---------- */
const out = {}, pad = (s, n) => String(s).padEnd(n), num = (v, n) => String(v).padStart(n);
for (const [g, run] of [['league', league], ['zombies', zombies]]) {
  if (GAME !== 'both' && GAME !== g) continue;
  console.log(`\n=== ${g === 'league' ? 'Drone League' : 'Zombies'} ===`);
  const r = await run(); out[g] = r;
  if (r.err) { console.log('FAIL ' + r.err); fails++; continue; }
  console.log(pad('sound', 74) + pad('class', 6) + num('peak', 6) + num('pre', 6) + num('lim', 6) + num('rms', 7) + num('LUFS', 7) + num('count', 6) + '  (dBFS: peak after the limiter, pre = before it, lim = limiter reduction dB; LUFS = loudest 400 ms)');
  for (const w of r.rows) console.log(pad(w.name, 74) + pad(w.cls, 6) + num(w.peak, 6) + num(w.pre, 6) + num(w.lim || '-', 6) + num(w.rms, 7) + num(w.M, 7) + num(w.count, 6) + (w.peak > CAP[w.cls] ? '  OVER' : ''));
  /* caps: every sound under its class cap; the master never near 0 */
  const over = r.rows.filter(w => w.peak > CAP[w.cls]);
  soft(!over.length, `${g}: every sound under its class cap (big ${CAP.big}, mid ${CAP.mid}, ui / bed ${CAP.ui} dBFS peak)` + (over.length ? ': over: ' + over.map(w => `${w.name} ${w.peak} (${w.cls} cap ${CAP[w.cls]})`).join('; ') : ''));
  const mx = Math.max(...r.rows.map(w => w.peak));
  check(r.limiter && mx <= -0.5, `${g}: the master limiter is in and nothing reaches -0.5 dBFS (loudest peak ${mx})`);
  /* a player kill is one confirm: zaudio's thunk + notes, not also interceptor.js's killThreat beep (a 660 to 1320 Hz triangle sweep) */
  if (g === 'zombies') check(r.kill && r.kill.thunks === 1 && r.kill.beeps === 0, `zombies: a player kill has one confirm voice (zaudio kill: ${r.kill?.thunks} of 1; interceptor.js killThreat beep: ${r.kill?.beeps} of 0)`);
  const row = n => r.rows.find(w => w.name === n || w.name.startsWith(n)), near = (a, b, d, tol) => a && b && Math.abs((a.rms - b.rms) - d) <= tol;
  if (!QUICK && g === 'league') {
    const h = row('ball hit 20 m/s'), st = row('stacked');
    soft(st && st.peak <= CAP.stack, `league: everything at once stays under ${CAP.stack} dBFS (peak ${st?.peak}, limiter ${st?.lim} dB)`);
    for (const [n, d, tol] of [['slider: ball hit 20 m/s, Master 50%', -12, 1.5], ['slider: ball hit 20 m/s, Effects 50%', -12, 1.5], ['slider: ball hit 20 m/s, Crowd 50% (no change)', 0, 1]])
      check(near(row(n), h, d, tol), `league ${n}: ${(row(n)?.rms - h?.rms).toFixed(1)} dB vs the same hit at 100% (expected ${d})`);
    for (const [n, b, d] of [['slider: crowd bed in play, Crowd 50%', 'crowd bed in play', -12], ['slider: motors only, Motors 50%', 'motors only', -12], ['slider: wind 70 m/s, Wind 50%', 'wind at 70 m/s', -12]])
      check(near(row(n), row(b), d, 2), `league ${n}: ${(row(n)?.rms - row(b)?.rms).toFixed(1)} dB vs 100% (expected ${d})`);  /* beds: the crowd's slow LFOs and tension term move its level about 1.5 dB run to run */
    const m0 = row('slider: ball hit 20 m/s, Master 0%'); check(m0 && m0.peak <= -70, `league: Master 0% is silence (peak ${m0?.peak})`);
  }
  if (!QUICK && g === 'zombies') {
    const st = row('stacked'); soft(st && st.peak <= CAP.stack, `zombies: everything at once stays under ${CAP.stack} dBFS (peak ${st?.peak}, limiter ${st?.lim} dB)`);
    const rk = row('slider: helper rack firing at 60 m');
    for (const [n, b, d, tol] of [['slider: helper rack firing at 60 m, effects 50%', rk, -6, 1.5], ['slider: readout HIT tone, effects 50%', row('readout: HIT'), -6, 1.5], ['slider: arsenal dart clang at 30 m, effects 50%', row('arsenal: kinetic dart clang'), -6, 1.5],
      ['slider: boss sting jugg, effects 50%', row('boss sting: jugg'), -6, 1.5], ['slider: re-entry alarm (ballistic), effects 50%', row('re-entry alarm (ballistic)'), -6, 1.5], ['slider: music full, music 50%', row('music, full intensity'), -6, 1.5]])
      if (row(n) && b) check(near(row(n), b, d, tol), `zombies ${n}: ${(row(n).rms - b.rms).toFixed(1)} dB vs 100% (expected ${d})`);
    const z0 = row('slider: helper rack firing at 60 m, effects 0%'), mm = row('slider: music full, muted');
    check(z0 && z0.peak <= -70, `zombies: effects 0% is silence (peak ${z0?.peak})`); check(mm && mm.peak <= -70, `zombies: music muted (B) is silence (peak ${mm?.peak})`);
  }
  if (r.sErr || r.errs.length) { console.log('errors', r.sErr, r.errs); fails++; }
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
console.log(fails ? `AUDIO LEVELS FAILED (${fails})` : warns ? `AUDIO LEVELS PASSED with ${warns} warning(s)` : 'AUDIO LEVELS PASSED');
process.exit(fails ? 1 : 0);
