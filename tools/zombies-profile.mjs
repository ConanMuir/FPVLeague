// Zombies stutter profile. Per scenario: frame pacing (avg / p95 / worst frame, frame CPU, GPU time from a timer query), renderer.info (draw calls,
// triangles, programs) and what the draws are per pass (shadow / main / post), the GPU cost of each big feature (by switching it off for a moment),
// GC pauses and long tasks from a Chrome trace, JS self-time hot spots (CDP Profiler) and allocations per frame (sampling heap profiler, garbage
// included). Headless Edge / Chrome on the real GPU (DL_HIGHGPU=1: the discrete one on a dual-GPU laptop), or DL_NORENDER=1 for the CPU side only.
//   node tools/zombies-profile.mjs [scenario,...] [--sec=4] [--json=out.json] [--top=16] [--w=1280 --h=720 --dpr=1] [--no-ablate]
//   node tools/zombies-profile.mjs --events      one 15 s timeline through boss wave start, weather changes, a barrage, a crash: the slow frames and what came before
// scenarios: w1 w28 boss storm snow night dust rain fog scattered fx (default: all)
import fs from 'node:fs';
import {serve, launch, open, sleep} from './zlib.mjs';
import {NO_RENDER} from './browser.mjs';
const A = process.argv.slice(2), opt = k => (A.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const SEC = +(opt('sec') || 4), TOP = +(opt('top') || 16), JSONOUT = opt('json'), ONLY = (A.find(a => !a.startsWith('--')) || '').split(',').filter(Boolean);
const VW = +(opt('w') || 1280), VH = +(opt('h') || 720), DPR = +(opt('dpr') || 1), ABLATE = !A.includes('--no-ablate') && !NO_RENDER;

// in the page before anything loads: time every requestAnimationFrame callback (summed per frame)
const instrument = () => {
  const raf = window.requestAnimationFrame.bind(window), F = window.__pf = {on: false, cpu: new Map()};
  window.requestAnimationFrame = cb => raf(ts => { const t0 = performance.now(); try { cb(ts); } finally { if (F.on) F.cpu.set(ts, (F.cpu.get(ts) || 0) + performance.now() - t0); } });
};
// setups, run in the page once the game is up (Zombies picked)
const DEF = [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13]];
const setup = ([W, def, wx, fx]) => { const {api, G, Z} = __z;
  if (def) def.forEach(([t, s, l]) => { const d = Z.def.add(t, s); if (!d) return; if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
  __z.jump(W, 20000); G.next = __z.plan(W); G.next.wx = {id: wx || 'clear'}; delete G.next.wx.to; __z.cont(); __z.sim(W >= 20 ? 55 : 5); api.SITES.forEach(s => s.hp = s.max);
  setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200);
  if (fx) { const C = api.camera.position, V = api.THREE.Vector3, f = new V(), p = new V(); let k = 0;  // heavy effects: three explosions in view every 120 ms, a ground fire every 0.7 s
    setInterval(() => { f.set(0, 0, -1).applyQuaternion(api.camera.quaternion).setY(0).normalize();
      for (let i = 0; i < 3; i++) { p.copy(C).addScaledVector(f, 300 + Math.random() * 900); p.x += (Math.random() - .5) * 600; p.z += (Math.random() - .5) * 200; p.y = api.gh(p.x, p.z) + 30 + Math.random() * 250; Z.flash(p.clone(), .8 + Math.random() * 2.5); }
      if (k++ % 6 === 0) { p.copy(C).addScaledVector(f, 400 + Math.random() * 600); Z.fxTest.fire(p.clone(), 1.4, 40); } }, 120); }
  return {tracks: api.TH.filter(api.live).length, shots: Z.def.shots.length}; };
const SC = {w1: [1], w28: [28, DEF], boss: [30, DEF], storm: [28, DEF, 'storm'], snow: [28, DEF, 'snow'], night: [28, DEF, 'night'], dust: [28, DEF, 'dust'], rain: [28, DEF, 'rain'],
  fog: [28, DEF, 'fog'], scattered: [28, DEF, 'scattered'], fx: [28, DEF, 'clear', true]};
const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0, r1 = v => +(+v).toFixed(1), avg = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

// in the page: GPU ms per frame (EXT_disjoint_timer_query_webgl2 around composer.render) over ms milliseconds
const gpuTime = async ms => { const {renderer, composer} = await import('/engine/render.js'), gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return []; const r0 = composer.render, qs = [], out = [];
  const poll = () => { for (let i = qs.length - 1; i >= 0; i--) { const q = qs[i]; if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); qs.splice(i, 1); } } };
  composer.render = function (...a) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); r0.apply(this, a); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); poll(); };
  await new Promise(r => setTimeout(r, ms)); composer.render = r0; await new Promise(r => setTimeout(r, 100)); poll(); return out; };

async function collect(p) {
  // 1) frame timing + renderer.info + GPU time (timer queries are cheap), nothing else attached
  const t = await p.evaluate(async (sec, gpuTimeSrc) => {
    const {composer, renderer} = await import('/engine/render.js'), F = window.__pf, inf = renderer.info; inf.autoReset = false;
    const R = [], r0 = composer.render;
    composer.render = function (...a) { inf.reset(); const t0 = performance.now(); r0.apply(this, a); R.push({ms: performance.now() - t0, calls: inf.render.calls, tris: inf.render.triangles, pts: inf.render.points}); };
    F.cpu.clear(); F.on = true; const ts = []; let last = 0; const gp = eval(gpuTimeSrc)(sec * 1000);
    await new Promise(res => { const t0 = performance.now(); const f = now => { if (last) ts.push([now - last, now]); last = now; if (now - t0 < sec * 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const gpu = await gp; F.on = false; composer.render = r0; inf.autoReset = true;
    const spikes = [...ts].sort((a, b) => b[0] - a[0]).slice(0, 5).map(([d, now]) => `${d.toFixed(0)}ms(cpu ${(F.cpu.get(now) || 0).toFixed(1)})`);
    let vis = 0, tr = 0, inst = 0; const mats = new Set(); __z.api.scene.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { vis++; if (o.material?.transparent) tr++; if (o.isInstancedMesh) inst++; mats.add(o.material); } });
    return {ts: ts.map(x => x[0]), cpu: [...F.cpu.values()], gpu, spikes, R, programs: renderer.info.programs?.length, objects: vis, transparent: tr, instanced: inst, materials: mats.size, mem: inf.memory,
      tracks: __z.api.TH.filter(__z.api.live).length, fx: __z.Z.fxState?.()};
  }, SEC, gpuTime.toString());
  const ft = [...t.ts].sort((a, b) => a - b), cpu = [...t.cpu].sort((a, b) => a - b), gpu = [...t.gpu].sort((a, b) => a - b);
  const out = {frames: ft.length, avg: r1(avg(ft)), p50: r1(pct(ft, .5)), p95: r1(pct(ft, .95)), p99: r1(pct(ft, .99)), worst: r1(ft[ft.length - 1] || 0), over20: ft.filter(v => v > 20).length,
    cpuAvg: r1(avg(cpu)), cpuP95: r1(pct(cpu, .95)), cpuWorst: r1(cpu[cpu.length - 1] || 0), gpuAvg: r1(avg(gpu)), gpuP95: r1(pct(gpu, .95)), gpuWorst: r1(gpu[gpu.length - 1] || 0), spikes: t.spikes.join(' '),
    calls: Math.round(avg(t.R.map(r => r.calls))), tris: Math.round(avg(t.R.map(r => r.tris)) / 1000) + 'k', points: Math.round(avg(t.R.map(r => r.pts))),
    programs: t.programs, objects: t.objects, transparent: t.transparent, instanced: t.instanced, materials: t.materials, geometries: t.mem.geometries, textures: t.mem.textures, tracks: t.tracks, smoke: t.fx?.smoke, fires: t.fx?.fires};
  // 1b) what the draw calls are: per pass (shadow / main / post), grouped by the scene's top-level object, over 20 frames
  const br = await p.evaluate(async () => {
    const {renderer} = await import('/engine/render.js'), sc = __z.api.scene, B = {}, r0 = renderer.renderBufferDirect;
    const top = o => { let t = o; while (t.parent && t.parent !== sc) t = t.parent; return t; };
    renderer.renderBufferDirect = function (cam, scn, geo, mat, obj) {
      const pass = mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial ? 'shadow' : scn === sc ? 'main' : 'post', t = top(obj);
      const k = pass + ' ' + (t.userData.forest ? 'forest' : (t.name || t.type) + (t.children.length ? `[${t.children.length}]` : '') + (t !== obj ? '>' + obj.type : '') + ' ' + (mat.type || '') + (mat.transparent ? ' T' : '') + (obj.isInstancedMesh ? ' inst' : ''));
      const n = Math.min(geo.index ? geo.index.count : geo.attributes.position?.count || 0, geo.drawRange.count) * (obj.isInstancedMesh ? obj.count : 1);
      const e = B[k] ||= {calls: 0, prims: 0}; e.calls++; e.prims += obj.isPoints || obj.isLine ? 0 : n / 3; return r0.apply(this, arguments); };
    await new Promise(res => { let k = 0; const f = () => ++k > 20 ? res() : requestAnimationFrame(f); requestAnimationFrame(f); });
    renderer.renderBufferDirect = r0; return B; });
  const byPass = {}; for (const [k, e] of Object.entries(br)) { const q = byPass[k.split(' ')[0]] ||= {calls: 0, tris: 0}; q.calls += e.calls / 21; q.tris += e.prims / 21; }
  out.passes = Object.entries(byPass).map(([k, q]) => `${k} ${Math.round(q.calls)} calls ${Math.round(q.tris / 1000)}k tris`).join(', ');
  out.drawTop = Object.entries(br).sort((a, b) => b[1].calls - a[1].calls).slice(0, 12).map(([k, e]) => `${Math.round(e.calls / 21)} calls ${Math.round(e.prims / 21000)}k tris  ${k}`);
  out.trisTop = Object.entries(br).sort((a, b) => b[1].prims - a[1].prims).slice(0, 6).map(([k, e]) => `${Math.round(e.prims / 21000)}k tris ${Math.round(e.calls / 21)} calls  ${k}`);
  // 1c) GPU cost of each big feature: GPU ms with it switched off for a moment, against the same moment with everything on
  if (ABLATE) out.gpuOff = await p.evaluate(async gpuTimeSrc => {
    const {renderer, composer, bloom} = await import('/engine/render.js'), api = __z.api, sc = api.scene, G = eval(gpuTimeSrc), m = a => a.length ? a.sort((x, y) => x - y)[a.length >> 1] : 0;
    const forest = sc.children.filter(o => o.userData.forest), passes = composer.passes, sens = passes[passes.length - 1];
    const X = {shadowMap: [() => renderer.shadowMap.autoUpdate = false, () => renderer.shadowMap.autoUpdate = true], forest: [() => forest.forEach(o => o.visible = false), () => forest.forEach(o => o.visible = true)],
      clouds: [() => api.cloudG.visible = false, () => api.cloudG.visible = true], bloom: [() => bloom.enabled = false, () => bloom.enabled = true],
      zfx: [() => sc.children.forEach(o => { if (o.isGroup && o.children.some(c => c.isPoints && c.material.isShaderMaterial)) o.visible = !(o.userData.pfOff = o.visible); }), () => sc.children.forEach(o => { if (o.userData.pfOff) { o.visible = true; delete o.userData.pfOff; } })]};
    const res = {}; const base = m(await G(700)); res.all = +base.toFixed(2);
    for (const [k, [off, on]] of Object.entries(X)) { off(); await new Promise(r => setTimeout(r, 150)); const v = m(await G(600)); on(); res[k] = +(base - v).toFixed(2); await new Promise(r => setTimeout(r, 150)); }
    return res; }, gpuTime.toString());
  // 2) trace: GC pauses and long tasks
  await p.tracing.start({categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc']});
  await sleep(SEC * 1000); const buf = await p.tracing.stop();
  const ev = JSON.parse(Buffer.from(buf).toString()).traceEvents, fc = ev.find(e => e.name === 'FunctionCall'), onMain = e => fc && e.pid === fc.pid && e.tid === fc.tid && e.ph === 'X';
  const gc = ev.filter(e => onMain(e) && /^(MinorGC|MajorGC|V8\.GCIncrementalMarking|V8\.GCFinalizeMC|MinorMS)$/.test(e.name));
  const gcBy = {}; for (const e of gc) { const g = gcBy[e.name] ||= {n: 0, ms: 0, max: 0}; g.n++; g.ms += e.dur / 1000; g.max = Math.max(g.max, e.dur / 1000); }
  const tasks = ev.filter(e => onMain(e) && /RunTask$/.test(e.name) && e.dur > 16000).map(e => e.dur / 1000).sort((a, b) => b - a);
  const freed = gc.filter(e => e.name === 'MinorGC').reduce((s, e) => s + Math.max(0, (e.args?.usedHeapSizeBefore || 0) - (e.args?.usedHeapSizeAfter || 0)), 0);
  out.gc = Object.entries(gcBy).map(([k, g]) => `${k} ${g.n}x ${r1(g.ms)}ms max ${r1(g.max)}`).join(', ');
  const dom = {}; for (const e of ev) if (onMain(e) && /^(UpdateLayoutTree|Layout|Paint|PrePaint|Layerize|Commit|HitTest|ParseHTML)$/.test(e.name)) dom[e.name] = (dom[e.name] || 0) + e.dur / 1000;
  out.domMsPerSec = Object.entries(dom).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${r1(v / SEC)}`).join(', ');
  out.longTasks = tasks.length ? `${tasks.length} (longest ${r1(tasks[0])} ms)` : 0; out.scavengedKBs = Math.round(freed / 1024 / SEC);
  // 3) CPU profile: self time by function
  const s = await p.createCDPSession(); await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', {interval: 250}); await s.send('Profiler.start');
  await sleep(SEC * 1000); const {profile} = await s.send('Profiler.stop');
  const self = new Map(), dtl = profile.timeDeltas, byId = new Map(profile.nodes.map(n => [n.id, n])); let total = 0;
  const key = cf => `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-1)[0]}:${cf.lineNumber + 1}`;
  profile.samples.forEach((id, i) => { const k = key(byId.get(id).callFrame), d = dtl[i] || 0; total += d; self.set(k, (self.get(k) || 0) + d); });
  const idle = ['(idle) :0', '(program) :0', '(garbage collector) :0'].map(k => self.get(k) || 0);
  out.mainBusy = r1(100 * (total - idle[0]) / total) + '%'; out.gcSelf = r1(100 * idle[2] / total) + '%';
  out.hot = [...self].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, us]) => `${r1(100 * us / total)}% ${k}`);
  // inclusive time of the game's own functions (three.js and the browser left out), ms per frame
  const kids = new Map(profile.nodes.map(n => [n.id, n.children || []])), selfT = new Map(); profile.samples.forEach((id, i) => selfT.set(id, (selfT.get(id) || 0) + (dtl[i] || 0)));
  const incl = new Map(), sum = id => { let t = selfT.get(id) || 0; for (const c of kids.get(id)) t += sum(c); const n = byId.get(id), k = key(n.callFrame); if (/(games|engine)\//.test(n.callFrame.url) || /zombies|interceptor|z[a-z]+\.js/.test(k)) n._t = t; return t; };
  sum(profile.nodes[0].id); for (const n of profile.nodes) if (n._t) { const k = key(n.callFrame); incl.set(k, (incl.get(k) || 0) + n._t); }
  const fps = out.frames / SEC;
  out.incl = [...incl].sort((a, b) => b[1] - a[1]).slice(0, TOP + 8).map(([k, us]) => `${r1(us / 1000 / (total / 1e6) / fps)}ms/f ${k}`);
  // 4) allocations: everything allocated (sampled), garbage included, per frame
  await s.send('HeapProfiler.enable'); await p.evaluate(() => { window.__pf.cpu.clear(); window.__pf.on = true; });
  await s.send('HeapProfiler.startSampling', {samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true});
  await sleep(SEC * 1000); const {profile: hp} = await s.send('HeapProfiler.stopSampling');
  const nf = Math.max(1, await p.evaluate(() => { window.__pf.on = false; return window.__pf.cpu.size; }));
  const sites = new Map(); let bytes = 0; const walk = n => { bytes += n.selfSize; if (n.selfSize) { const k = key(n.callFrame); sites.set(k, (sites.get(k) || 0) + n.selfSize); } for (const c of n.children) walk(c); };
  walk(hp.head); await s.detach();
  out.allocKBf = r1(bytes / 1024 / nf); out.allocTop = [...sites].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, b]) => `${r1(b / 1024 / nf)}KB/f ${k}`);
  return out;
}

// --events: one timeline through the moments that used to hitch (the boss wave starting, weather changes, a barrage, a crash and relaunch):
// every frame whose CPU time passes 12 ms or whose interval passes 25 ms, with the event before it, plus GC and long tasks over the run
const timeline = async () => { const {api, G, Z} = __z, F = window.__pf, out = [], marks = [], T0 = performance.now(), mark = s => marks.push([performance.now() - T0, s]);
  api.S.zwx = 'wave'; __z.jump(10, 20000); G.next = __z.plan(10); G.next.wx = {id: 'clear'}; delete G.next.wx.to;
  const ev = [[500, 'boss wave starts', () => __z.cont()], [3500, 'weather: storm', () => Z.wx.set('storm')], [5500, 'weather: snow', () => Z.wx.set('snow')],
    [7000, 'barrage: 12 bursts', () => { const c = api.camera.position, V = api.THREE.Vector3; for (let i = 0; i < 12; i++) Z.flash(new V(c.x + (Math.random() - .5) * 800, c.y + 60 + Math.random() * 200, c.z - 300 - Math.random() * 600), 1 + Math.random() * 2.5); }],
    [8500, 'weather: night', () => Z.wx.set('night')], [10000, 'crash and relaunch', () => api.lose('crash')], [11500, 'weather: dust', () => Z.wx.set('dust')], [13000, 'weather: golden', () => Z.wx.set('golden')]];
  const {renderer} = await import('/engine/render.js'), gl = renderer.getContext(), compiles = [];  // which material made a slow shader compile (three checks the link on first use)
  let cur = null; const rb = renderer.renderBufferDirect; renderer.renderBufferDirect = function (c, s, g, m, o) { cur = [m, o]; return rb.apply(this, arguments); };
  const gi = gl.getProgramInfoLog.bind(gl); gl.getProgramInfoLog = q => { const t = performance.now(), r = gi(q), d = performance.now() - t; if (d > 20 && cur) { let o = cur[1], path = []; while (o && path.length < 4) { path.push(o.name || o.type); o = o.parent; }
    const m = cur[0], key = m.customProgramCacheKey?.() || '', top = (() => { let t = cur[1]; while (t.parent && t.parent.parent) t = t.parent; return t; })();
    compiles.push(`${Math.round(d)} ms ${m.type}${m.name ? ' ' + m.name : ''} #${m.color?.getHexString?.() || ''} ${key.slice(0, 24)} on ${path.join('<')} (top: ${top.type} ${Object.keys(top.userData).join('/')} ${top.children.length} kids, visible ${top.visible}) at ${((performance.now() - T0) / 1000).toFixed(2)}s`); } return r; };
  let last = 0; F.cpu.clear(); F.on = true;
  await new Promise(res => { const f = now => { const t = now - T0; while (ev.length && t >= ev[0][0]) { const [, n, fn] = ev.shift(); mark(n); fn(); } if (last) out.push([t, now - last, now]); last = now; if (t < 15000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  F.on = false; setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200);
  const rows = out.map(([t, iv, now]) => [t, iv, F.cpu.get(now) || 0]), at = t => (marks.filter(m => m[0] <= t).pop() || [0, 'start'])[1];
  const cpu = rows.map(r => r[2]).sort((a, b) => a - b), ivs = rows.map(r => r[1]).sort((a, b) => a - b);
  renderer.renderBufferDirect = rb; gl.getProgramInfoLog = gi;
  return {compiles, frames: rows.length, cpuP50: cpu[cpu.length >> 1], cpuP95: cpu[Math.floor(cpu.length * .95)], cpuWorst: cpu[cpu.length - 1], ivP95: ivs[Math.floor(ivs.length * .95)], ivWorst: ivs[ivs.length - 1],
    slow: rows.filter(r => r[2] > 12 || r[1] > 25).map(r => `${(r[0] / 1000).toFixed(2)}s cpu ${r[2].toFixed(1)} ms, interval ${r[1].toFixed(0)} ms (after: ${at(r[0])})`)}; };
if (A.includes('--events')) {
  const {server, origin} = await serve(); const b = await launch(); const errs = [];
  const p = await b.newPage(); await p.evaluateOnNewDocument(instrument); await open(b, origin + '/games/interceptor/', errs, {page: p});
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'wave', cam: 0})));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500); await p.click('#play'); await sleep(1500);
  await p.evaluate(DEF => DEF.forEach(([t, s, l]) => { const d = __z.Z.def.add(t, s); if (!d) return; if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; }), DEF);
  const cs = A.includes('--cpu') ? await p.createCDPSession() : null; if (cs) { await cs.send('Profiler.enable'); await cs.send('Profiler.setSamplingInterval', {interval: 500}); await cs.send('Profiler.start'); }
  await p.tracing.start({categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc']});
  const r = await p.evaluate(timeline); const buf = await p.tracing.stop();
  if (cs) { const {profile: P} = await cs.send('Profiler.stop'), byId = new Map(P.nodes.map(n => [n.id, n])), par = new Map(), self = new Map(), K = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
    for (const n of P.nodes) for (const c of n.children || []) par.set(c, n.id);
    P.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + P.timeDeltas[i]));
    const tops = [...self].filter(([id]) => !/^\((idle|program|root)\)/.test(K(byId.get(id)))).sort((a, b) => b[1] - a[1]).slice(0, 6);
    for (const [id, us] of tops) { const st = []; let q = id; while (q && st.length < 14) { st.push(K(byId.get(q))); q = par.get(q); } console.log(`${r1(us / 1000)} ms in: ${st.join(' < ')}`); } }
  const ev = JSON.parse(Buffer.from(buf).toString()).traceEvents, fc = ev.find(e => e.name === 'FunctionCall'), onMain = e => fc && e.pid === fc.pid && e.tid === fc.tid && e.ph === 'X';
  const gc = ev.filter(e => onMain(e) && /^(MinorGC|MajorGC)$/.test(e.name)).map(e => e.dur / 1000), tasks = ev.filter(e => onMain(e) && /RunTask$/.test(e.name) && e.dur > 16000).map(e => e.dur / 1000).sort((a, b) => b - a);
  const {slow, compiles, ...rest} = r; console.log(JSON.stringify(rest)); console.log('slow shader compiles (> 20 ms):\n  ' + (compiles.join('\n  ') || 'none')); console.log(`GC: ${gc.length} pauses, ${r1(gc.reduce((a, b) => a + b, 0))} ms, worst ${r1(Math.max(0, ...gc))} ms · long tasks > 16 ms: ${tasks.length}${tasks.length ? ' (' + tasks.slice(0, 8).map(r1).join(', ') + ' ms)' : ''}`);
  console.log(slow.join('\n')); console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close(); process.exit(0);
}
const {server, origin} = await serve(); const b = await launch({w: Math.round(VW * DPR), h: Math.round(VH * DPR)}); const errs = [], RES = {};
for (const [name, arg] of Object.entries(SC)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const p = await b.newPage(); await p.evaluateOnNewDocument(instrument); await p.setViewport({width: VW, height: VH, deviceScaleFactor: DPR});
  await open(b, origin + '/games/interceptor/', errs, {page: p, w: VW, h: VH}); await p.setViewport({width: VW, height: VH, deviceScaleFactor: DPR});
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'wave', cam: 0})));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500); await p.click('#play'); await sleep(500);
  const gpu = await p.evaluate(() => { const gl = __z.api.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'), c = __z.api.renderer.domElement; return (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?') + ` ${c.width}x${c.height}`; });
  const info = await p.evaluate(setup, arg); await sleep(2500);
  const r = await collect(p); r.setup = info; r.gpuName = gpu.replace(/ANGLE \(|\(0x.*?\)|Direct3D.*?D3D11\)/g, '').trim(); RES[name] = r; await p.close();
  const {hot, incl, allocTop, drawTop, trisTop, ...rest} = r; console.log(`\n=== ${name}`); for (const [k, v] of Object.entries(rest)) console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  for (const [k, L] of Object.entries({draws: drawTop, tris: trisTop, hot, incl, alloc: allocTop})) console.log(`  ${k}:\n    ` + L.join('\n    '));
}
if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify(RES, null, 1));
console.log(errs.length ? errs.join('\n') : '\nno errors'); await b.close(); server.close();
