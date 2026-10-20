// Where does a Zombies frame go? (routes-scout measurement, not a test). Headless Edge, real GPU.
//   node proto/frame-profile.mjs [--gpu intel|nvidia] [--wave 28] [--cam 0|2] [--wx clear|storm] [--dpr 1.5] [--w 1707 --h 960] [--frames 240] [--cpuprof] [--nolog]
// Per ablation: frame interval (rAF), CPU in the rAF callbacks, CPU inside composer.render (three.js JS + GL submit), GPU time of composer.render
// (EXT_disjoint_timer_query_webgl2), draw calls / triangles per frame; then the cost of one 120 Hz sim step; optionally a CDP CPU profile by file.
// --nolog serves engine/render.js with logarithmicDepthBuffer forced off (scratch measurement only: the far terrain z-fights).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {launchBrowser} from '../tools/browser.mjs';
import {open, sleep, root} from '../tools/zlib.mjs';
const A = process.argv, arg = (k, d) => { const i = A.indexOf('--' + k); return i > 0 ? A[i + 1] : d; }, has = k => A.includes('--' + k);
const GPU = arg('gpu', 'intel'), WAVE = +arg('wave', 28), CAM = +arg('cam', 0), WX = arg('wx', 'clear'), DPR = +arg('dpr', 1.5), W = +arg('w', 1707), H = +arg('h', 960), N = +arg('frames', 150);
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png'};
const server = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end(); return; }
  let body = fs.readFileSync(f); if (has('nolog') && u === '/engine/render.js') body = body.toString().replace('logDepth?{logarithmicDepthBuffer:true}:{}', '{}');
  r.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream'}); r.end(body); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = `http://127.0.0.1:${server.address().port}`;
const b = await launchBrowser({protocolTimeout: 600000, defaultViewport: null, args: [`--window-size=${W},${H}`, '--ignore-gpu-blocklist', '--enable-gpu', '--disable-frame-rate-limit', '--disable-gpu-vsync', ...(GPU === 'nvidia' ? ['--force_high_performance_gpu'] : [])]});
const errs = [], p = await b.newPage();
await p.evaluateOnNewDocument(() => { const raf = window.requestAnimationFrame.bind(window); window.__cb = new Map();
  window.requestAnimationFrame = f => raf(t => { const s = performance.now(); try { f(t); } finally { window.__cb.set(t, (window.__cb.get(t) || 0) + performance.now() - s); } }); });
await p.setViewport({width: W, height: H, deviceScaleFactor: DPR});
await open(b, origin + '/games/interceptor/', errs, {w: W, h: H, page: p}); await p.setViewport({width: W, height: H, deviceScaleFactor: DPR});
await p.evaluate(c => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', cam: c})), CAM);
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500); await p.click('#play'); await sleep(500);
const info = await p.evaluate(W => { const {api, G, Z} = __z, def = Z.def;
  [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13]].forEach(([t, s, l]) => { const d = def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
  __z.jump(W, 20000); G.next = __z.plan(W); __z.cont(); __z.sim(55); api.SITES.forEach(s => s.hp = s.max); setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200);
  const gl = api.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info');
  return {gpu: gl.getParameter(e.UNMASKED_RENDERER_WEBGL).replace(/ANGLE \(|\(0x.*$/g, ''), tracks: api.TH.filter(api.live).length, buf: [gl.drawingBufferWidth, gl.drawingBufferHeight], logDepth: api.renderer.capabilities.logarithmicDepthBuffer}; }, WAVE);
if (WX !== 'clear') await p.evaluate(id => { __z.api.S.zwx = 'wave'; __z.Z.wx.set(id); }, WX);
await sleep(1500);
await p.evaluate(async () => { const R = await import('/engine/render.js'), {renderer, composer} = R, gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const orig = composer.render.bind(composer), pend = []; renderer.info.autoReset = false; window.__R = R; window.__orig = orig;
  window.__rec = {gpu: [], rcpu: [], calls: [], tris: [], progs: 0};
  window.__wrap = inner => { composer.render = (...a) => { const r = window.__rec; renderer.info.reset(); let q; if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const t0 = performance.now(); inner(...a); r.rcpu.push(performance.now() - t0); if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pend.push(q); }
    r.calls.push(renderer.info.render.calls); r.tris.push(renderer.info.render.triangles); r.progs = renderer.info.programs.length;
    while (pend.length && gl.getQueryParameter(pend[0], gl.QUERY_RESULT_AVAILABLE)) { const q0 = pend.shift(); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) r.gpu.push(gl.getQueryParameter(q0, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q0); } }; };
  window.__wrap(orig); });
const measure = (label, setup, undo, q) => p.evaluate(async (N, setup, undo) => {
  const R = window.__R; if (setup) await (0, eval)(setup)(R); await new Promise(r => setTimeout(r, 700)); window.__cb.clear(); window.__rec = {gpu: [], rcpu: [], calls: [], tris: [], progs: 0};
  const ts = await new Promise(res => { const ts = []; let last = 0; const f = now => { if (last) ts.push(now - last); last = now; if (ts.length < N) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); });
  const r = window.__rec, cb = [...window.__cb.values()]; if (undo) await (0, eval)(undo)(R);
  const st = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), q = k => +s[Math.min(s.length - 1, Math.floor(s.length * k))].toFixed(2); return {avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p50: q(.5), p95: q(.95), p99: q(.99)}; };
  return {frame: st(ts), cbCPU: st(cb), renderCPU: st(r.rcpu), gpu: st(r.gpu), calls: Math.round(r.calls.reduce((x, y) => x + y, 0) / r.calls.length), tris: Math.round(r.tris.reduce((x, y) => x + y, 0) / r.tris.length / 1e3) + 'k', progs: r.progs};
}, N, setup?.toString(), undo?.toString()).then(r => { if (!q) console.log(label.padEnd(22), JSON.stringify(r)); return r; });
console.log(JSON.stringify({GPU, WAVE, CAM, WX, DPR, W, H, nolog: has('nolog'), ...info}));
const res = {}, med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
// A/B interleaved: the wave keeps evolving, so each ablation is measured against a baseline taken right before it, R rounds, medians reported
async function ab(label, setup, undo, R = +arg('rounds', 3)) { const base = [], abl = [], O = arg('only', ''); if (O && !O.split(',').some(s => label.includes(s))) return null;
  for (let i = 0; i < R; i++) { base.push(await measure('', null, null, true)); abl.push(await measure('', setup, undo, true)); }
  const k = (L, f) => +med(L.map(f)).toFixed(2), row = L => ({frame: k(L, r => r.frame.avg), p95: k(L, r => r.frame.p95), cbCPU: k(L, r => r.cbCPU.avg), renderCPU: k(L, r => r.renderCPU.avg), gpu: k(L, r => r.gpu?.p50 ?? 0), calls: k(L, r => r.calls), tris: med(L.map(r => r.tris))});
  const o = {base: row(base), abl: row(abl)}; console.log(label.padEnd(24), 'base', JSON.stringify(o.base), '\n'.padEnd(25), 'this', JSON.stringify(o.abl)); return o; }
res.base = await measure('baseline');
if (!has('quick')) {
  res.noShadowPass = await ab('shadow pass frozen', R => { R.renderer.shadowMap.autoUpdate = false; }, R => { R.renderer.shadowMap.autoUpdate = true; });
  res.noBloom = await ab('bloom off', R => { R.bloom.enabled = false; }, R => { R.bloom.enabled = true; });
  res.noPost = await ab('no composer (direct)', R => { window.__wrap(() => R.renderer.render(R.scene, R.camera)); }, R => { window.__wrap(window.__orig); });
  res.noForest = await ab('forest hidden', () => { __z.api.scene.children.forEach(o => { if (o.userData.forest) o.visible = false; }); }, () => { __z.api.scene.children.forEach(o => { if (o.userData.forest) o.visible = true; }); });
  res.noRadar = await ab('radar 2D canvas skipped', () => { const P = CanvasRenderingContext2D.prototype, rc = document.getElementById('radar').getContext('2d'); window.__rcK = Object.entries(Object.getOwnPropertyDescriptors(P)).filter(([, d]) => typeof d.value === 'function').map(([k]) => k); for (const k of window.__rcK) rc[k] = () => {}; }, () => { const rc = document.getElementById('radar').getContext('2d'); for (const k of window.__rcK) delete rc[k]; });
  res.pr1 = await ab('pixelRatio 1.0', R => { R.renderer.setPixelRatio(1); dispatchEvent(new Event('resize')); }, R => { R.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); dispatchEvent(new Event('resize')); });
  res.pr075 = await ab('pixelRatio 0.75', R => { R.renderer.setPixelRatio(.75); dispatchEvent(new Event('resize')); }, R => { R.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); dispatchEvent(new Event('resize')); });
  res.matAuto = await ab('all matrixAutoUpdate off (bound)', () => { window.__ma = []; __z.api.scene.traverse(o => { if (o.matrixAutoUpdate && !o.isCamera) { o.matrixAutoUpdate = false; window.__ma.push(o); } }); }, () => { for (const o of window.__ma) o.matrixAutoUpdate = true; });
}
const sim = await p.evaluate(() => { const {api} = __z, h = 1 / 120, n = 240, t0 = performance.now(); for (let i = 0; i < n; i++) api.step(h); const st = (performance.now() - t0) / n;
  const t1 = performance.now(); for (let i = 0; i < 60; i++) api.visuals(1 / 60, performance.now()); const vis = (performance.now() - t1) / 60;
  return {stepMs: +st.toFixed(3), simMsPerFrameAt60: +(st * 2).toFixed(2), visualsMs: +vis.toFixed(2)}; });
console.log('sim'.padEnd(22), JSON.stringify(sim));
if (has('cpuprof')) {
  const s = await p.target().createCDPSession(); await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', {interval: 200}); await s.send('Profiler.start'); await sleep(5000);
  const {profile} = await s.send('Profiler.stop'), dt = (profile.endTime - profile.startTime) / 1000, tot = {}, fn = {};
  const by = new Map(profile.nodes.map(n => [n.id, n])); const cnt = {}; for (const id of profile.samples) cnt[id] = (cnt[id] || 0) + 1; const per = dt / profile.samples.length;
  for (const [id, c] of Object.entries(cnt)) { const n = by.get(+id), u = n.callFrame.url, g = /three\.module/.test(u) ? 'three.js' : /interceptor\/z/.test(u) ? 'zombies z*.js' : /interceptor\/(interceptor|buildings|ground|strela)/.test(u) ? 'interceptor.js etc' : /engine\//.test(u) ? 'engine/' : u ? 'other script' : n.callFrame.functionName || '(native)';
    tot[g] = (tot[g] || 0) + c * per; const k = n.callFrame.functionName + ' ' + u.split('/').pop() + ':' + n.callFrame.lineNumber; fn[k] = (fn[k] || 0) + c * per; }
  const wall = dt; console.log('cpu profile (ms of', wall.toFixed(0), 'ms wall):', JSON.stringify(Object.fromEntries(Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v).toFixed(0)]))));
  console.log('top functions (self ms):', Object.entries(fn).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `\n  ${v.toFixed(0).padStart(5)} ${k}`).join(''));
}
fs.writeFileSync(path.join(root, 'proto', `profile-${GPU}-c${CAM}-${WX}${has('nolog') ? '-nolog' : ''}.json`), JSON.stringify({info, res, sim}, null, 1));
console.log(errs.length ? errs.slice(0, 5).join('\n') : 'no errors'); await b.close(); server.close();
