// Input-to-motion latency of both games, in a headless page: a stick step is injected through a fake radio (navigator.getGamepads) at random
// moments between frames, and the tool counts how long the drone's pose takes to respond -- in sim ticks, rendered frames and milliseconds --
// both in the simulation and in the pose that is actually drawn (the camera / view matrix of the frame).
//   sim     = the drone's own state after the tick (what a game without render interpolation draws)
//   drawn   = the camera of the frame, FPV (what the player sees)
// The Interceptor (Zombies) is read through window.__z.api (player, camera); Drone League through the built single file, patched on the way
// out of the server to expose its state (GS) and through the WebGL view matrix of every frame (three.js uploads it as the viewMatrix uniform).
// Several builds can be compared: --root points at any checkout of the repo (a scratch worktree of an older commit, say); --v15 flies the frozen
// "Drone League/drone-league.html" (no render interpolation at all).
// Run: node tools/feel-latency.mjs [--game z|l|v15] [--root DIR] [--trials 60] [--scale 1] [--cam 0|1] [--fcap 0|60|80|120] [--nofix] [--json]
//   --scale S   time scale of the Interceptor's loop (Z.tsc: .35 is the multi-kill slow-mo, .25 the impact cam)
//   --cam 1     chase cam (camera smoothing on top of the pose; the number is the camera's own lag)
//   --ext X     Interceptor only: the player's draw mode via api.interp (see games/interceptor/interceptor.js)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {open, frames} from './zlib.mjs';
import {launchBrowser} from './browser.mjs';

const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d, has = k => argv.includes(k);
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(arg('--root', HERE)), GAME = arg('--game', 'z'), TRIALS = +arg('--trials', 60), SCALE = +arg('--scale', 1), CAM = +arg('--cam', 0), FCAP = +arg('--fcap', 0);
const require = createRequire(import.meta.url);
const threeDir = path.resolve(path.dirname(require.resolve('three')), '..');

// ---------- a static server for ROOT; the League's single file gets a read-only hook added on the fly ----------
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png'};
function patchLeague(html) {
  /* the built bundle: window.__dl={...snap:()=>({state:y.state,...  -- y is the game state GS under a minified name */
  const m = /snap:\(\)=>\(\{state:(\w+)\.state/.exec(html);
  if (!m) throw new Error('feel-latency: League hook not found in the bundle');
  return html.replace('window.__dl={', `window.__dl={gs:${m[1]},`);
}
function patchV15(html) {
  /* the frozen v15 file: a module script, so its variables are private; the smoke test adds a hook the same way */
  const hook = 'window.__dl={get gs(){return{get player(){return player},get drones(){return drones}}}};\n', i = html.lastIndexOf('</script>');
  return html.slice(0, i) + hook + html.slice(i);
}
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]), f;
  if (u.startsWith('/__three/')) f = path.join(threeDir, u.slice(9)); else { if (u.endsWith('/')) u += 'index.html'; f = path.join(ROOT, u); }
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end(); return; }
  let b = fs.readFileSync(f);
  if (GAME === 'l' && /games[\\/]drone-league[\\/]index\.html$/.test(f)) b = patchLeague(b.toString('utf8'));
  if (GAME === 'v15' && /drone-league\.html$/.test(f)) b = patchV15(b.toString('utf8'));
  r.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream'}); r.end(b);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---------- in the page: the fake radio, WebGL view-matrix capture ----------
function installRadio() {
  const g = {id: 'EdgeTX Radiomaster Pocket Joystick', index: 0, connected: true, mapping: '', timestamp: 1, axes: new Array(8).fill(0), buttons: Array.from({length: 16}, () => ({pressed: false, touched: false, value: 0}))};
  const CAL = [{a: 2, c: 0.0275, s: -0.7922}, {a: 5, c: -0.0431, s: 0.7843}, {a: 1, c: 0.0431, s: -0.8392}, {a: 0, c: -0.0039, s: 0.8235}];  /* the games' default calibration: throttle, yaw, pitch, roll */
  window.__stick = (thr, yaw, pit, rol) => { [thr, yaw, pit, rol].forEach((v, i) => { const c = CAL[i]; g.axes[c.a] = c.c + c.s * v; }); g.timestamp = performance.now(); };
  window.__stick(-1, 0, 0, 0);
  Object.defineProperty(navigator, 'getGamepads', {value: () => [g], configurable: true});
  /* the drawn camera, from the view matrix three.js uploads for the perspective camera each frame */
  const names = new WeakMap(); let proj = null; window.__vm = null;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) { if (!C) continue;
    const gl0 = C.prototype.getUniformLocation, um = C.prototype.uniformMatrix4fv;
    C.prototype.getUniformLocation = function (pr, n) { const l = gl0.call(this, pr, n); if (l && (n === 'viewMatrix' || n === 'projectionMatrix')) names.set(l, n); return l; };
    C.prototype.uniformMatrix4fv = function (l, t, v, ...r) { const n = names.get(l);
      if (n === 'projectionMatrix') proj = v[11] === -1; else if (n === 'viewMatrix' && proj) window.__vm = Float32Array.from(v);
      return um.call(this, l, t, v, ...r); };
  }
}

// ---------- in the page: the trials ----------
async function runTrials(cfg) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const quatOfView = m => { /* camera orientation from the view matrix: the transpose of its rotation part */
    const r00 = m[0], r01 = m[1], r02 = m[2], r10 = m[4], r11 = m[5], r12 = m[6], r20 = m[8], r21 = m[9], r22 = m[10], t = r00 + r11 + r22; let x, y, z, w;
    if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (r12 - r21) / s; y = (r20 - r02) / s; z = (r01 - r10) / s; }
    else if (r00 > r11 && r00 > r22) { const s = Math.sqrt(1 + r00 - r11 - r22) * 2; w = (r12 - r21) / s; x = s / 4; y = (r01 + r10) / s; z = (r02 + r20) / s; }
    else if (r11 > r22) { const s = Math.sqrt(1 + r11 - r00 - r22) * 2; w = (r20 - r02) / s; x = (r01 + r10) / s; y = s / 4; z = (r12 + r21) / s; }
    else { const s = Math.sqrt(1 + r22 - r00 - r11) * 2; w = (r01 - r10) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = s / 4; }
    return [x, y, z, w]; };
  const ang = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };  /* degrees between two orientations */
  const G = cfg.game === 'z' ? (() => { const {api, Z, G: gg} = window.__z; return {me: () => api.player, cam: () => { const q = api.camera.quaternion; return [q.x, q.y, q.z, q.w]; }, api, Z, gg}; })()
    : {me: () => window.__dl.gs.player, cam: () => window.__vm ? quatOfView(window.__vm) : null};
  const me = G.me(), ticks = [], frs = [];
  const q4 = q => [q.x, q.y, q.z, q.w];
  /* every tick call: when it runs and the state it starts from */
  const step0 = me.step; me.step = function (dt) { ticks.push([performance.now(), q4(this.q)]); return step0.call(this, dt); };
  let thr = cfg.thr0, roll = 0, pit = 0, yaw = 0, y0 = null;
  const send = () => window.__stick(thr, yaw, pit, roll);
  let raf = 0, nf = 0;
  const probe = now => { raf = requestAnimationFrame(probe);
    const c = G.cam(); frs.push({t: performance.now(), raf: now, n: ticks.length, sim: q4(me.q), cam: c, y: me.p.y, vy: me.v.y});
    if (y0 == null) y0 = me.p.y;
    if (cfg.hold) { thr = Math.max(-.9, Math.min(.8, thr + (cfg.kp * (y0 - me.p.y) - cfg.kd * me.v.y) * .02)); send(); } };
  raf = requestAnimationFrame(probe);
  await sleep(300);
  const out = [];
  for (let i = 0; i < cfg.trials; i++) {
    await sleep(Math.random() * 25);  /* the stick moves at a random moment between frames */
    const f0 = frs.length, k0 = ticks.length, t0 = performance.now(), b = frs[f0 - 1];
    if (!b || !b.cam) { await sleep(100); continue; }
    roll = (i & 1 ? -1 : 1) * cfg.amp; send();
    const tEnd = performance.now() + 700; let done = false;
    while (performance.now() < tEnd && !done) { await sleep(8); const L = frs[frs.length - 1]; if (frs.length - f0 > 2 && L.cam && ang(L.cam, b.cam) > cfg.stop) done = true; }
    roll = 0; send(); const f1 = frs.length, k1 = ticks.length;
    out.push({t0, f0, k0, f1, k1, base: {sim: b.sim, cam: b.cam}, n: b.n}); await sleep(450);
  }
  cancelAnimationFrame(raf); me.step = step0; send();
  /* analysis in the page, where the records are */
  const TH = cfg.th, res = [];
  for (const o of out) {
    const r = {sim: {}, draw: {}, mx: Math.max(0, ...frs.slice(o.f0, o.f1).map(F => F.cam ? ang(F.cam, o.base.cam) : 0)), dur: frs[o.f1 - 1].t - o.t0};
    for (const th of TH) {
      /* sim state: the first tick call (counted from the stick change) whose starting state already differs = the tick before it responded */
      let j = -1; for (let k = o.k0; k < o.k1; k++) if (ang(ticks[k][1], o.base.sim) > th) { j = k - o.k0; break; }
      /* sim: the first frame whose probe-time sim state differs; drawn: the first frame whose camera differs */
      let fs = -1, fd = -1;
      for (let f = o.f0; f < o.f1; f++) { const F = frs[f]; if (fs < 0 && ang(F.sim, o.base.sim) > th) fs = f; if (fd < 0 && F.cam && ang(F.cam, o.base.cam) > th) fd = f; if (fs >= 0 && fd >= 0) break; }
      r.sim[th] = {ticks: j, frames: fs < 0 ? null : fs - o.f0 + 1, ms: fs < 0 ? null : frs[fs].t - o.t0};
      r.draw[th] = {ticks: fd < 0 ? null : frs[fd].n - o.k0, frames: fd < 0 ? null : fd - o.f0 + 1, ms: fd < 0 ? null : frs[fd].t - o.t0};
    }
    res.push(r);
  }
  /* frame pacing of the run */
  const dts = []; for (let f = 1; f < frs.length; f++) dts.push(frs[f].t - frs[f - 1].t);
  const tpf = []; for (let f = 1; f < frs.length; f++) tpf.push(frs[f].n - frs[f - 1].n);
  /* the lag of the drawn pose behind the newest sim state, at a steady turn: frames where the drawn turn is 7-11 deg, (sim - drawn) angle / turn rate */
  const steady = [];
  for (const o of out) for (let f = o.f0 + 1; f < o.f1 - 1; f++) { const F = frs[f], a = ang(F.cam, o.base.cam); if (a < 7 || a > 11) continue;
    const w = (ang(frs[f + 1].cam, o.base.cam) - ang(frs[f - 1].cam, o.base.cam)) / (frs[f + 1].t - frs[f - 1].t); if (w < .02) continue; steady.push((ang(F.sim, o.base.sim) - a) / w); }
  return {res, dts, tpf, steady};
}

// ---------- node side ----------
/* --fast: no vsync and no frame-rate limit, a stand-in for a high-refresh display (frames as fast as the machine makes them) */
const errs = [], b = await launchBrowser({protocolTimeout: 600000, args: ['--window-size=960,540', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu',
  ...(has('--fast') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])]});
const p = await open(b, 'about:blank', errs, {w: 960, h: 540});
await p.evaluateOnNewDocument(installRadio);
const start = {
  z: async () => {
    await p.goto(origin + '/games/interceptor/', {waitUntil: 'load'});
    await p.evaluate((cam, fcap) => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', cam, fcap, zmus: 0, setV: 5})), CAM, FCAP);
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 5);
    await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000}); await frames(p, 3);
    await p.evaluate(() => __z.cont()); await frames(p, 5);
    return p.evaluate((scale, ext) => { const {api, Z, G} = __z, me = api.player, P = Object.getPrototypeOf(me);
      P.aero = function () {};  /* no turbulence, no fin weathervane: the stick step is the only thing that turns the drone */
      api.S.mod.shake = 0; api.applyTune(); api.WB.set(0, 0, 0); api.WIND.set(0, 0, 0);
      G.state = 'wave'; for (const s of api.SITES) s.hp = s.max = 1e6;  /* nothing ends the run */
      api.TH.length = 0;
      me.p.set(100, api.gh(100, 300) + 300, 300); me.v.set(0, 0, 0); me.w.set(0, 0, 0); me.wt.set(0, 0, 0); me.q.identity(); me.gt = 0; me.dead = 0; api.interp?.cut(me);
      const S = api.S.mod, hov = Math.pow(S.grav / S.thr, 1 / S.te); me.ms = me.thr = hov;
      if (scale !== 1) Object.defineProperty(Z, 'tsc', {get: () => scale, configurable: true});
      if (ext != null) api.interp?.player?.(me, ext);
      return {thr0: 2 * hov - 1}; }, SCALE, has('--ext') ? +arg('--ext', 0) : null);
  },
  l: async () => {
    await p.goto(origin + '/games/drone-league/index.html', {waitUntil: 'load'});
    await p.evaluate((cam, fcap) => localStorage.setItem('droneleague', JSON.stringify({game: 'free', cam, fcap})), CAM, FCAP);
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => !!window.__dl?.snap().drones.length, {timeout: 60000}); await frames(p, 5);
    await p.click('#play'); await p.waitForFunction(() => { const s = __dl.snap(); return !s.demo && s.state === 'play'; }, {timeout: 60000}); await frames(p, 10);
    return {thr0: -.2};
  },
  v15: async () => {
    await p.goto(origin + '/Drone%20League/drone-league.html', {waitUntil: 'load'});
    await p.evaluate(cam => localStorage.setItem('droneleague', JSON.stringify({cam})), CAM);
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => !!window.__dl?.gs.drones.length, {timeout: 90000}); await frames(p, 5);
    await p.click('#play'); await p.waitForFunction(() => !!window.__dl.gs.player && !window.__dl.gs.player.dead && window.__dl.gs.player.p.y > -1e9, {timeout: 60000}); await frames(p, 10);
    return {thr0: -.2};
  }}[GAME];
const setup = await start();
if (GAME !== 'z') {
  /* League: take off with the fake radio, climb to a few metres and hold the height with a throttle loop while the roll steps are injected */
  await p.evaluate(() => { window.__stick(-.2, 0, 0, 0); });
}
const cfg = {game: GAME === 'z' ? 'z' : 'l', trials: TRIALS, amp: .5, stop: 12, th: [.05, .5, 2, 6], thr0: setup.thr0, hold: true, kp: GAME === 'z' ? .004 : .05, kd: GAME === 'z' ? .02 : .08};
if (GAME !== 'z') {
  /* let it climb: full-ish throttle until the player is 6 m up (read through the hook), then the hold loop takes over */
  await p.evaluate(async () => { const gs = window.__dl.gs; window.__stick(.2, 0, 0, 0); const t0 = performance.now(); while (performance.now() - t0 < 6000) { const d = gs.player; if (d.p.y > 8) break; await new Promise(r => setTimeout(r, 30)); } window.__stick(-.25, 0, 0, 0); });
}
const out = await p.evaluate(runTrials, cfg);
await b.close(); server.close();

// ---------- report ----------
const pct = (a, q) => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null; };
const f1 = x => x == null ? '  -  ' : x.toFixed(1).padStart(5), f0 = x => x == null ? ' - ' : String(x).padStart(2);
const N = out.res.length, dts = out.dts.filter(x => x < 200), mean = dts.reduce((a, c) => a + c, 0) / dts.length;
const summary = {game: GAME, root: path.basename(ROOT), trials: N, frameMs: +mean.toFixed(2), fps: +(1000 / mean).toFixed(1), ticksPerFrame: +(out.tpf.reduce((a, c) => a + c, 0) / out.tpf.length).toFixed(2), rows: {}};
for (const th of cfg.th) for (const w of ['sim', 'draw']) {
  const g = k => out.res.map(r => r[w][th][k]);
  const ms = g('ms').filter(x => x != null);
  summary.rows[`${w} >${th}deg`] = {ticksMed: pct(g('ticks'), .5), framesMed: pct(g('frames'), .5), msMean: ms.reduce((a, c) => a + c, 0) / Math.max(1, ms.length), msMed: pct(g('ms'), .5), msP90: pct(g('ms'), .9), msMin: pct(g('ms'), 0), msMax: pct(g('ms'), .999), n: g('ms').filter(x => x != null).length};
}
/* what the draw adds to the sim, paired per trial (the frame phase cancels): drawn response ms minus sim response ms */
{ const s = out.steady, m = s.reduce((a, c) => a + c, 0) / Math.max(1, s.length), sd = Math.sqrt(s.reduce((a, c) => a + (c - m) ** 2, 0) / Math.max(1, s.length)); summary.steadyLag = {meanMs: +m.toFixed(2), sdMs: +sd.toFixed(2), n: s.length}; }
summary.lag = {};
for (const th of cfg.th) { const d = out.res.filter(r => r.sim[th].ms != null && r.draw[th].ms != null).map(r => r.draw[th].ms - r.sim[th].ms);
  summary.lag[th] = {meanMs: +(d.reduce((a, c) => a + c, 0) / Math.max(1, d.length)).toFixed(1), later: +(d.filter(x => x > 1).length / Math.max(1, d.length)).toFixed(2), n: d.length}; }
if (has('--json')) console.log(JSON.stringify(summary));
else {
  console.log(`${GAME} ${path.basename(ROOT)}  trials ${N}  frames ${summary.frameMs} ms (${summary.fps} fps)  ticks/frame ${summary.ticksPerFrame}  scale ${SCALE}  cam ${CAM}`);
  console.log('                     ticks  frames   ms mean  med   p90    min    max');
  for (const [k, r] of Object.entries(summary.rows)) console.log(`${k.padEnd(18)}  ${f0(r.ticksMed)}     ${f0(r.framesMed)}     ${f1(r.msMean)} ${f1(r.msMed)} ${f1(r.msP90)} ${f1(r.msMin)} ${f1(r.msMax)}   (n ${r.n})`);
  console.log(`steady turn, drawn pose behind the newest sim state: ${summary.steadyLag.meanMs} ms (sd ${summary.steadyLag.sdMs}, n ${summary.steadyLag.n})`);
  console.log('drawn minus sim, paired: ' + cfg.th.map(th => `>${th}deg ${summary.lag[th].meanMs} ms (${Math.round(summary.lag[th].later * 100)}% of trials a frame later)`).join(' | '));
}
if (has("--debug")) console.log(out.res.map(r => r.mx.toFixed(1) + "/" + r.dur.toFixed(0)).join(" "));
if (errs.length) console.log('errors:', errs.slice(0, 5).join('\n'));
