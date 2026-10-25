// Zombies smoothness regression: the same scenes on any checkout, so two builds (a baseline worktree and now) can be compared number for number.
//   node tools/zombies-regress.mjs [scene,...] [--sec=5] [--reps=3] [--json=out.json] [--off=Scars,Radio,...] [--cam=director] [--top=14] [--no-files] [--funcs] [--draws]
// scenes: w1, w20boss (wave 20, a full defence, a Mothership), fixed60 (the same 60 tracks in every build), tracks400, base (the base screen at wave 24), endless60 (Endless,
//   wave 60, scars on the ground), spec (Bot Spectator with the Director camera), coop (a host and two clients over ?netloop; the host is measured), hush and jammer (a roster
//   boss on its own; hushq: the Hush with its voice stubbed out), buddy (Little Buddy flying), buddyv (the same with the camera on it), guide (the first-wave guide), codex (the Enemies screen opening). A scene a build does not have prints "n/a".
//   The file runs unchanged from an older worktree's tools/ (copy it there): it serves and measures the checkout it sits in.
// How the frames are made: the game's own frame (engine/loop.js) is called from the page on a timer, one every 16.7 ms, instead of by the display. A machine that is busy with other
//   programs starves the compositor and a page gets a few frames a second (this tool was written on such a machine); a timer still fires, and what is measured is the renderer's
//   CPU time per frame (Chrome's ThreadTime: it does not count the time spent waiting for a core), the allocations and the draw calls, which do not depend on the load.
// Per scene (medians over --reps fresh pages): thread = CPU ms per frame of the renderer's main thread (sim ticks, visuals, HUD, draw calls, GC, idle tasks); the time of the game frame
//   (wall clock: p50 / p95 / p99 / worst, the frames over 8 ms, which is a missed frame at 120 Hz) and the gap from one frame's start to the next (a frame that ran long or a late timer);
//   draw calls and triangles; GC pauses (Chrome trace); allocation per frame (sampling heap profiler, garbage included); per source file the CPU self time (ms per frame; a native
//   call such as fillText or bufferSubData goes to the game file that made it) and the allocation (KB per frame), so a module's cost can be read off.
// --off=Scars,Radio: switch those modules off in the page before the measurement (the names are the initX functions in zombies.js without "init"): their frame and tick hooks are
//   skipped, so a module's cost is the difference to the run without it. --wrap installs the switches without using any (the baseline for that comparison).
// --funcs: the hottest functions by CPU and by allocation. --draws: the draw calls by object. DL_HIGHGPU=1 for the discrete GPU on a dual-GPU laptop.
import fs from 'node:fs';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {serve, open, sleep, newWindow} from './zlib.mjs';
import {launchBrowser} from './browser.mjs';
const A = process.argv.slice(2), opt = (k, d) => { const a = A.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SEC = +opt('sec', 5), REPS = +opt('reps', 1), TOP = +opt('top', 14), JSONOUT = opt('json', ''), OFF = opt('off', '').split(',').filter(Boolean), FILES = !A.includes('--no-files'), FUNCS = A.includes('--funcs'),
  SEED = +opt('seed', 12345), CAM = opt('cam', 'director'), DRAWS = A.includes('--draws'), N = Math.round(SEC * 60);
const ONLY = (A.find(a => !a.startsWith('--')) || '').split(',').filter(Boolean);
const r1 = v => +(+v).toFixed(1), r2 = v => +(+v).toFixed(2), pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0, avg = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const cpuT = () => os.cpus().reduce((a, c) => { const t = c.times; return [a[0] + t.idle, a[1] + t.user + t.nice + t.sys + t.irq + t.idle]; }, [0, 0]);  /* total and idle CPU time of the machine, to say how loaded it was */
const med = a => { const s = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

/* in the page before anything loads */
const instrument = seed => {
  /* the same random numbers in every build and run (mulberry32): the wave plans, the weather and the bots start the same way */
  let s = seed | 0; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  /* the game's frame (engine/loop.js: function frame(now) { requestAnimationFrame(frame) ... o.step ...) is picked up when it first asks for a frame, so drive() can call it; while the page is
     driven by timers, its own requests for the next display frame are dropped */
  const raf = window.requestAnimationFrame.bind(window); window.__manual = false;
  window.requestAnimationFrame = cb => { if (!window.__loopFrame && cb.name === 'frame' && /o\.step/.test(Function.prototype.toString.call(cb))) window.__loopFrame = cb; return window.__manual && cb === window.__loopFrame ? 0 : raf(cb); };
  /* --wrap / --off: zombies.js is served with every initX(api, G, Z) wrapped by this. A module that took over a per-frame hook (it wrapped the one before it) gets a switch: with
     __off[name] set, the hook calls the one it wrapped, i.e. runs without the module's part. Only the hooks that run every frame or tick are switched. */
  window.__off = {};
  window.__offWrap = (name, init, Z) => { const H = ['step', 'visuals', 'overlay', 'radar', 'hud', 'cam', 'flash'], before = {}; for (const h of H) before[h] = Z[h]; const r = init();
    for (const h of H) { const prev = before[h], cur = Z[h]; if (cur !== prev && typeof cur === 'function' && typeof prev === 'function') Z[h] = function (a, b, c, d) { return window.__off[name] ? prev.call(this, a, b, c, d) : cur.call(this, a, b, c, d); }; } return r; };
};
const DEF = [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13]];
/* helpers the scene scripts use, defined in the page as globals (the scripts run there) */
const PRELUDE = () => {
  window.defend = DEF => { const {Z} = __z; DEF.forEach(([t, s, l]) => { const d = Z.def.add(t, s); if (!d) return; if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; }); };
  /* the sites are kept whole, so no run ends: by a timer in real time and after every driven frame */
  window.keep = () => { const {api} = __z, f = () => api.SITES.forEach(s => s.hp = s.max); setInterval(f, 200); window.__perFrame = f; };
  window.stat = () => { const {api, G, Z} = __z; return {wave: G.wave, state: G.state, tracks: api.TH.filter(api.live).length, boss: api.TH.filter(t => api.live(t) && (/boss/.test(t.k) || t.boss)).length, kinds: [...new Set(api.TH.filter(api.live).map(t => t.k))].slice(0, 8).join(','), scars: Z.sc?.stats?.().craters ?? null, def: Z.def.D.length}; };
  /* n frames of the game, one every 16.7 ms by timer; until() is asked every 10 frames and stops it. Returns when each frame started and how long it ran (ms). */
  window.drive = async (n, until) => {
    const fr = window.__loopFrame; if (!fr) throw new Error('no loop frame found'); window.__manual = true;
    const s = [], w = []; let due = performance.now();
    for (let i = 0; i < n; i++) {
      due += 1000 / 60; const d = due - performance.now();
      if (d > 1.5) await new Promise(r => setTimeout(r, d - 1)); else if (d < -100) due = performance.now();  /* more than 100 ms behind: no catching up */
      const t0 = performance.now(); fr(t0); s.push(t0); w.push(performance.now() - t0);
      if (window.__perFrame) window.__perFrame();
      if (until && i % 10 === 9 && until()) break;
    }
    return {s, w};
  };
  /* hand the page back to the display: the game's pending request (made before the driving) runs and is dropped, then one new request starts a single chain again */
  window.resume = async () => { await new Promise(r => requestAnimationFrame(r)); window.__manual = false; requestAnimationFrame(window.__loopFrame); };
};

/* scene setups, run in the page once Zombies is up. Each returns what it built. */
const SCENES = {
  w1: {run: () => { __z.cont(); __z.sim(5); return stat(); }},
  /* wave 20 as the game plans it, a full defence, and the Mothership if the plan brought no boss (the roster differs from build to build) */
  w20boss: {run: DEF => { const {G, api} = __z; defend(DEF); __z.jump(20, 20000); G.next = __z.plan(20); __z.cont(); __z.sim(30); api.SITES.forEach(s => s.hp = s.max);
    if (!api.TH.some(t => api.live(t) && t.k === 'boss')) { const s = api.SITES[1]; __z.make('boss', s.x + 900, s.z - 1800, s); __z.sim(1); } keep(); return stat(); }, arg: DEF},
  /* the same 60 tracks in every build: the Mothership and 59 of five kinds on rings 3.3-4.3 km out, no defence to thin them, the sites kept whole */
  fixed60: {run: () => { const {G, api} = __z; __z.jump(30, 1e5); __z.cont(); __z.sim(.5); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; const K = ['shahed', 'cruise', 'heavy', 'decoy', 'jet'], S = api.SITES;
    __z.make('boss', S[1].x + 900, S[1].z - 3600, S[1]);
    for (let i = 0; i < 59; i++) { const a = i * 2.399, r = 3300 + (i % 10) * 100; __z.make(K[i % 5], Math.cos(a) * r, 1950 + Math.sin(a) * r, S[i % S.length]); }
    S.forEach(s => s.hp = s.max); keep(); __z.sim(2); return stat(); }},
  /* 400 tracks (a mix of kinds) on the field at once, wave 40: what one track costs the frame and the tick, the same on every build */
  tracks400: {run: () => { const {G, api} = __z; __z.jump(40, 1e5); __z.cont(); __z.sim(.5); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; const K = ['shahed', 'cruise', 'heavy', 'decoy', 'jet'];
    for (let i = 0; i < 400; i++) { const a = i * 2.399, r = 3300 + (i % 10) * 100; __z.make(K[i % 5], Math.cos(a) * r, 1950 + Math.sin(a) * r, api.SITES[i % api.SITES.length]); }
    api.SITES.forEach(s => s.hp = s.max); keep(); __z.sim(2); return stat(); }},
  base: {run: DEF => { const {G, Z} = __z; defend(DEF); __z.jump(24, 1e6); G.next = __z.plan(24); __z.cont(); __z.sim(30); __z.api.SITES.forEach(s => s.hp = s.max); keep();
    for (const t of __z.api.TH) __z.api.scene.remove(t.mesh); __z.api.TH.length = 0; G.wq.length = 0; G.state = 'clear'; Z.openBase();
    const bench = (f, n) => { if (!f) return null; for (let i = 0; i < 20; i++) f(); const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return +((performance.now() - t0) / n).toFixed(3); };  /* ms per call: the briefing card, a whole redraw of the base screen */
    return {...stat(), briefMs: bench(Z.briefHTML, 200), refreshMs: bench(Z.base.refresh, 100)}; }, arg: DEF},
  endless60: {need: () => !!window.__z?.Z?.endless, boot: s => { s.zcamp = {v: 1}; },
    run: async DEF => { const {G, Z, api} = __z; const c = Z.cp.C(); c.held = ['mill', 'river', 'silo', 'rail', 'hosp', 'power', 'air', 'gate']; c.done = 1; Z.cp.put(c);
      if (!Z.endless.start('gate', true)) return {err: 'endless refused'}; await new Promise(r => setTimeout(r, 400));
      defend(DEF); const S = Z.sc; S.ensure?.(); const R = (a, b) => a + Math.random() * (b - a);  /* a long run's scars on the ground: craters, burns, rubble */
      for (let i = 0; i < 160; i++) { const x = R(-2500, 2500), z = R(-2500, 500); if (!S.bad(x, z, 8)) S.add(i % 5 === 0 ? 1 : i % 9 === 0 ? 2 : 0, x, z, 3 + i % 6, {fade: 1}); }
      __z.jump(60, 1e6); G.next = __z.plan(60); __z.cont(); __z.sim(30); api.SITES.forEach(s => s.hp = s.max); keep(); return stat(); }, arg: DEF},
  spec: {arg: CAM, need: () => !!window.__z?.spec, boot: s => { s.zspec = {lv: 'Champion', d: 1, sec: '', doc: 'std', auto: false, kit: []}; },
    run: async CAM => { document.getElementById('zspc').open = true; document.getElementById('zspgo').click();
      await drive(900, () => __z.spec.on && __z.G.state === 'base');
      const sp = __z.spec; if (sp.dir) sp.setCam(CAM, true); const w0 = __z.G.wave;
      /* the bot plays from wave 1 at 8x with the sites kept whole until a wave with some traffic is up (wave 4 and 8 or more tracks); then real speed, the Director cutting between the dramatic moments */
      keep(); sp.setSpeed?.(8);
      const f = await drive(30000, () => __z.G.state === 'wave' && __z.G.wave >= 4 && __z.api.TH.filter(__z.api.live).length >= 8);
      sp.setSpeed?.(1); await resume(); return {...stat(), cam: sp.sp?.cam || sp.cam, w0, framesToGetThere: f.w.length, dirStats: sp.dir?.stats ? {...sp.dir.stats} : null}; }},
  /* a roster boss on its own (the Hush: its spatial voice and the dark; the Jammer King: the electronic-warfare duel), wave 30, full defence */
  hush: {need: () => !!window.__z?.Z?.bosses?.BOSSES?.hush, run: DEF => { const {G, Z} = __z; defend(DEF); __z.jump(30, 1e5); G.next = __z.plan(30); __z.cont(); __z.sim(5); const t = Z.bosses.spawn('hush'); __z.sim(3); __z.api.SITES.forEach(s => s.hp = s.max); keep(); return {...stat(), spawned: t ? t.k : null}; }, arg: DEF},
  /* the Hush with its spatial voice replaced by nothing (its loop hook stubbed before it spawns): against hush, what the voice costs */
  hushq: {need: () => !!window.__z?.Z?.bosses?.BOSSES?.hush, run: DEF => { const {G, Z} = __z; defend(DEF); __z.jump(30, 1e5); G.next = __z.plan(30); __z.cont(); __z.sim(5); Z.bosses.BOSSES.hush.loop = S => ({g: S.out(0), set() {}, stop() {}});
    const t = Z.bosses.spawn('hush'); __z.sim(3); __z.api.SITES.forEach(s => s.hp = s.max); keep(); return {...stat(), spawned: t ? t.k : null}; }, arg: DEF},
  jammer: {need: () => !!window.__z?.Z?.bosses?.BOSSES?.jammer, run: DEF => { const {G, Z} = __z; defend(DEF); __z.jump(30, 1e5); G.next = __z.plan(30); __z.cont(); __z.sim(5); const t = Z.bosses.spawn('jammer'); __z.sim(3); __z.api.SITES.forEach(s => s.hp = s.max); keep(); return {...stat(), spawned: t ? t.k : null}; }, arg: DEF},
  /* Little Buddy (zbuddy.js) with a garage quad: wave 12, a defence, the buddy out of its pad after a few seconds of the wave */
  buddy: {need: () => !!window.__z?.Z?.bd, ls: {droneleague: {loadout: ['truex', 'brick', 'hikv', 'ram'], cos: {paint: 'cobalt', props: 'ice', bell: 'gold', led: 'cyan'}, physV: 5}},
    run: DEF => { const {G, Z, api} = __z; defend(DEF); __z.jump(12, 20000); G.next = __z.plan(12); __z.cont(); __z.sim(25); api.SITES.forEach(s => s.hp = s.max); keep(); const b = Z.bd.mine; return {...stat(), buddy: b.state + '/' + b.job, model: b.model?.kind || null}; }, arg: DEF},
  /* the same with the camera on the buddy (the chase camera does not see it in `buddy`): its model's draws, in the main and the shadow pass, are in the frame */
  buddyv: {need: () => !!window.__z?.Z?.bd, ls: {droneleague: {loadout: ['truex', 'brick', 'hikv', 'ram'], cos: {paint: 'cobalt', props: 'ice', bell: 'gold', led: 'cyan'}, physV: 5}},
    run: DEF => { const {G, Z, api} = __z; defend(DEF); __z.jump(12, 20000); G.next = __z.plan(12); __z.cont(); __z.sim(25); api.SITES.forEach(s => s.hp = s.max); keep(); const b = Z.bd.mine, c = api.camera;
      Z.cam = () => { c.position.set(b.p.x + 14, b.p.y + 7, b.p.z + 22); c.up.set(0, 1, 0); c.lookAt(b.p); }; return {...stat(), buddy: b.state + '/' + b.job, model: b.model?.kind || null}; }, arg: DEF},
  /* the first-wave guide (zonboard.js) running through wave 1: against w1, what the guide costs */
  guide: {url: '?guide=1', need: () => !!window.__z?.Z?.onboard, run: () => { __z.cont(); __z.sim(2); return {...stat(), guide: __z.Z.onboard.on}; }},
  /* the Enemies screen opening with every boss in the codex (zcodex.js): the silhouettes are drawn by a software rasteriser, a few per slice, while frames go on */
  codex: {need: () => !!window.__z?.Z?.codex, settle: 0, run: () => { const {Z} = __z; Z.codex.force('all'); __z.cont(); __z.sim(2); let k = 0; window.__perFrame = () => { if (k++ === 0) Z.codex.open(); };  /* opened by the first measured frame */
    return {...stat()}; }}
};

/* --wrap / --off=Scars,Radio: serve zombies.js with each initX(api, G, Z) call wrapped (see instrument); --off switches those modules' frame and tick hooks off in the page */
const WRAP = A.includes('--wrap') || OFF.length > 0;
if (WRAP) { const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { const r = rf.call(this, f, ...a); return /interceptor[\\/]zombies\.js$/.test(String(f)) ? Buffer.from(String(r).replace(/\b(init[A-Z]\w*)\(api,G,Z\)/g, (m, n) => `window.__offWrap('${n.slice(4)}',()=>${m},Z)`)) : r; }; }

/* the page for a scene: a fresh Edge page with the game's settings pre-seeded, Zombies started (or the menu left up for the Spectator) */
async function scene1(b, origin, name, errs) {
  const S = SCENES[name], p = await b.newPage(); await p.evaluateOnNewDocument(instrument, SEED); await p.setViewport({width: 1280, height: 720});
  await open(b, origin + '/games/interceptor/' + (S.url || ''), errs, {page: p, w: 1280, h: 720});
  const boot = S.boot ? S.boot.toString() : '';
  await p.evaluate((boot, ls) => { const s = {gmode: 'z', wx: 'clear', zwx: 'menu', cam: 0, fps: false, zmus: 0}; if (boot) new Function('s', 'return (' + boot + ')(s)')(s); localStorage.setItem('dl-interceptor', JSON.stringify(s)); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, JSON.stringify(v)); }, boot, S.ls || {});
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z && window.__loopFrame, {timeout: 120000}); await sleep(600); await p.evaluate(PRELUDE);
  if (S.need && !(await p.evaluate(S.need))) { await p.close(); return null; }
  /* the idle-time warm-up (zwarm.js) runs while the menu shows, as a player would have it, and is done before the scene starts */
  await p.waitForFunction(() => !__z.Z.warmSt || __z.Z.warmSt.done, {timeout: 240000, polling: 500}).catch(() => console.log('  warm-up still running after 240 s'));
  if (name !== 'spec') { await p.click('#play'); await sleep(500); }
  return p;
}

/* the renderer's CPU time (not wall time: on a shared machine a frame can wait for a core, and wall time counts that) */
const threadMs = async p => { const cs = p.__cs ||= await p.createCDPSession(); await cs.send('Performance.enable'); const m = (await cs.send('Performance.getMetrics')).metrics.find(x => x.name === 'ThreadTime'); return m ? m.value * 1000 : 0; };
/* the browser and everything it started run a notch above normal priority for the measurement (Windows): other programs' busy threads then take less of the frame */
const boost = br => { const pid = br.process()?.pid; if (process.platform !== 'win32' || !pid) return;
  spawnSync('powershell', ['-NoProfile', '-Command', `$all=Get-CimInstance Win32_Process;$ids=@(${pid});$q=@(${pid});while($q.Count){$n=@();foreach($i in $q){$c=@($all|?{$_.ParentProcessId -eq $i}|%{$_.ProcessId});$n+=$c;$ids+=$c};$q=$n};foreach($i in $ids){try{(Get-Process -Id $i).PriorityClass='AboveNormal'}catch{}}`], {stdio: 'ignore'}); };
/* wait (up to 30 s) for the machine to be less busy than 55% */
async function calm() { for (let i = 0; i < 15; i++) { const c0 = cpuT(); await sleep(2000); const c1 = cpuT(), l = 100 * (1 - (c1[0] - c0[0]) / Math.max(1, c1[1] - c0[1])); if (l < 55) return l; } return -1; }

/* the measured part: five runs of N driven frames on the same page: the frames (wall times, draw calls), a Chrome trace (GC, long tasks), the CPU profile, the heap sampler, and with --draws the draw calls by object */
async function collect(p, settle) {
  await p.evaluate(n => drive(n).then(() => 0), settle);  /* shader compiles and uploads of the first frames drawn this way */
  const th0 = await threadMs(p), c0 = cpuT();
  const t = await p.evaluate(async n => {
    const {composer, renderer} = await import('/engine/render.js'), inf = renderer.info; inf.autoReset = false;
    const R = [], r0 = composer.render, LT = [], po = new PerformanceObserver(l => { for (const e of l.getEntries()) LT.push([Math.round(e.startTime), Math.round(e.duration)]); }); try { po.observe({entryTypes: ["longtask"]}); } catch (e) { }
    composer.render = function (...a) { inf.reset(); const t0 = performance.now(); r0.apply(this, a); R.push({ms: performance.now() - t0, calls: inf.render.calls, tris: inf.render.triangles}); };
    const T0 = performance.now(), d = await drive(n); composer.render = r0; inf.autoReset = true; po.disconnect(); d.lt = LT.map(x => [x[0] - Math.round(T0), x[1]]);
    let vis = 0; __z.api.scene.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) vis++; });
    return {...d, R, objects: vis, programs: renderer.info.programs?.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures};
  }, N);
  const th1 = await threadMs(p), c1 = cpuT(), load = 100 * (1 - (c1[0] - c0[0]) / Math.max(1, c1[1] - c0[1])), thread = (th1 - th0) / Math.max(1, t.w.length);
  const gaps0 = t.s.slice(1).map((v, i) => v - t.s[i]), gaps = [...gaps0].sort((a, b) => a - b), cpu = [...t.w].sort((a, b) => a - b), o = {};
  o.lt = JSON.stringify(t.lt); Object.assign(o, {gAt: gaps0.indexOf(gaps[gaps.length - 1]), thread: r2(thread), load: r1(load), frames: t.w.length, gP50: r1(pct(gaps, .5)), gP95: r1(pct(gaps, .95)), gP99: r1(pct(gaps, .99)), gWorst: r1(gaps[gaps.length - 1] || 0), over25: gaps.filter(v => v > 25).length,
    cAvg: r2(avg(cpu)), cP50: r2(pct(cpu, .5)), cP95: r2(pct(cpu, .95)), cP99: r2(pct(cpu, .99)), cWorst: r2(cpu[cpu.length - 1] || 0), cOver8: cpu.filter(v => v > 8).length,
    calls: Math.round(avg(t.R.map(r => r.calls))), tris: Math.round(avg(t.R.map(r => r.tris)) / 1000), renderMs: r2(avg(t.R.map(r => r.ms))), objects: t.objects, programs: t.programs, geos: t.geometries, texs: t.textures});
  if (DRAWS) { const br = await p.evaluate(async () => {
      const {renderer} = await import('/engine/render.js'), sc = __z.api.scene, B = {}, r0 = renderer.renderBufferDirect, top = o => { let t = o; while (t.parent && t.parent !== sc) t = t.parent; return t; };
      renderer.renderBufferDirect = function (cam, scn, geo, mat, obj) { const pass = mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial ? 'shadow' : scn === sc ? 'main' : 'post', t = top(obj);
        const k = pass + ' ' + (t.userData.forest ? 'forest' : (t.name || t.type) + (t.children.length ? `[${t.children.length}]` : '') + (t !== obj ? '>' + obj.type : '') + ' ' + (mat.type || '') + (mat.transparent ? ' T' : '') + (obj.isInstancedMesh ? ' inst' : '') + (t.userData.house ? ' house' : ''));
        const e = B[k] ||= {calls: 0}; e.calls++; return r0.apply(this, arguments); };
      await drive(20); renderer.renderBufferDirect = r0; return B; });
    o.drawTop = Object.entries(br).sort((a, b) => b[1].calls - a[1].calls).slice(0, 14).map(([k, e]) => `${(e.calls / 20).toFixed(1)} ${k}`); }
  await p.tracing.start({categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc']});
  await p.evaluate(n => drive(n).then(() => 0), N); const buf = await p.tracing.stop();
  const ev = JSON.parse(Buffer.from(buf).toString()).traceEvents, fc = ev.find(e => e.name === 'FunctionCall'), onMain = e => fc && e.pid === fc.pid && e.tid === fc.tid && e.ph === 'X';
  const gc = ev.filter(e => onMain(e) && /^(MinorGC|MajorGC|MinorMS)$/.test(e.name)), mi = gc.filter(e => e.name !== 'MajorGC'), ma = gc.filter(e => e.name === 'MajorGC');
  const tasks = ev.filter(e => onMain(e) && /RunTask$/.test(e.name) && e.dur > 16000).map(e => e.dur / 1000);
  Object.assign(o, {minorN: mi.length, minorMs: r1(mi.reduce((s, e) => s + e.dur / 1000, 0)), minorMax: r1(Math.max(0, ...mi.map(e => e.dur / 1000))), majorN: ma.length, majorMax: r1(Math.max(0, ...ma.map(e => e.dur / 1000))), longTasks: tasks.length});
  const s = await p.createCDPSession(); await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', {interval: 250});
  await s.send('Profiler.start'); await p.evaluate(n => drive(n).then(() => 0), N); const {profile} = await s.send('Profiler.stop');
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), par = new Map(); for (const n of profile.nodes) for (const c of n.children || []) par.set(c, n.id);
  const fileOf = u => { const m = /\/(games|engine|src)\/(?:[^?]*\/)?([^/?]+)$/.exec(u || ''); return m ? m[2] : /three(\.module)?\.js/.test(u || '') ? 'three.js' : u ? u.split('/').pop().split('?')[0] || '(page)' : ''; };
  const self = new Map(), fself = new Map(), dl = profile.timeDeltas; let total = 0, idle = 0;
  profile.samples.forEach((id, i) => { const d = dl[i] || 0, n = nodes.get(id), fn = n.callFrame.functionName; total += d; if (fn === '(idle)') { idle += d; return; }
    let f = fileOf(n.callFrame.url);
    if (!f) { /* a native or runtime frame: the nearest game file above it made the call */ let q = par.get(id); while (q) { const g = fileOf(nodes.get(q).callFrame.url); if (g && g !== 'three.js') { f = g; break; } q = par.get(q); } f = f || (fn === '(garbage collector)' ? '(gc)' : fn === '(program)' ? '(program)' : '(native)'); }
    self.set(f, (self.get(f) || 0) + d);
    if (FUNCS) { let q = id, nn = n; while (nn && !fileOf(nn.callFrame.url)) { q = par.get(q); nn = q && nodes.get(q); } const k = nn ? `${nn.callFrame.functionName || '(anon)'} ${fileOf(nn.callFrame.url)}:${nn.callFrame.lineNumber + 1}` + (nn === n ? '' : ' +' + (fn || 'native')) : fn; fself.set(k, (fself.get(k) || 0) + d); } });
  o.busyPct = r1(100 * (total - idle) / total);
  const per = us => r2(us / 1000 / N);  /* ms per frame (the profile is of exactly N driven frames; the profiler's own samples of the idle waits between them are left out) */
  const cpuBy = {}; for (const [k, us] of self) cpuBy[k] = per(us);
  await s.send('HeapProfiler.enable');
  await s.send('HeapProfiler.startSampling', {samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true});
  await p.evaluate(n => drive(n).then(() => 0), N); const {profile: hp} = await s.send('HeapProfiler.stopSampling');
  const al = new Map(), afn = new Map(); let bytes = 0; const walk = n => { bytes += n.selfSize; if (n.selfSize) { const f = fileOf(n.callFrame.url) || '(native)'; al.set(f, (al.get(f) || 0) + n.selfSize); if (FUNCS) { const k = `${n.callFrame.functionName || "(anon)"} ${f}:${n.callFrame.lineNumber + 1}`; afn.set(k, (afn.get(k) || 0) + n.selfSize); } } for (const c of n.children) walk(c); };
  walk(hp.head); await s.detach();
  o.allocKBf = r1(bytes / 1024 / N); const allocBy = {}; for (const [k, b] of al) allocBy[k] = r2(b / 1024 / N);
  if (FUNCS) { o.hotFn = [...fself].sort((a, b) => b[1] - a[1]).slice(0, TOP * 2).map(([k, us]) => `${per(us)} ${k}`); o.allocFn = [...afn].sort((a, b) => b[1] - a[1]).slice(0, TOP * 2).map(([k, b]) => `${r2(b / 1024 / N)} ${k}`); }
  o.cpuBy = cpuBy; o.allocBy = allocBy; await p.evaluate(() => resume()); return o;
}

/* co-op: the host (drawn) and two clients (draw calls stubbed, they only keep the game going); the host is measured once the wave is up */
async function coopScene(b, origin, errs) {
  const URL = `${origin}/games/interceptor/?mode=zombies&netloop=40`, mk = async (name, render) => { const p = await newWindow(b, {noRender: !render}); await p.evaluateOnNewDocument(instrument, SEED);
    await open(b, URL, errs, {page: p, w: 1280, h: 720}); await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zdiff: 1, fps: false, zmus: 0})));
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z && window.__z.net && window.__loopFrame, {timeout: 60000}); await p.evaluate(PRELUDE); await p.$eval('#zname', (e, n) => { e.value = n; }, name); return p; };
  const H = await mk('Hosty', true), C1 = await mk('Ash', false), C2 = await mk('Bea', false), up = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, {timeout: ms, polling: 100}, arg).then(() => true, () => false);
  await H.click('#zhost'); if (!await up(H, () => __z.G.on && __z.G.state === 'base' && __z.net.n?.code)) throw new Error('host did not start');
  const code = await H.evaluate(() => __z.net.n.code);
  for (const C of [C1, C2]) { await C.$eval('#zcode', (e, c) => { e.value = c; }, code); await C.click('#zjoin'); }
  if (!await up(H, () => __z.net.rows().length === 3)) throw new Error('clients did not join');
  await H.evaluate(DEF => { defend(DEF); __z.jump(20, 20000); __z.G.next = __z.plan(20); }, DEF);
  for (const C of [C1, C2]) if (!await up(C, () => __z.G.on && __z.G.state === 'base' && __z.net.rows().length === 3 && !document.getElementById('zbase').hidden)) throw new Error('client not on the base screen');
  for (const P of [C1, C2, H]) await P.evaluate(() => document.getElementById('zgo')?.click());
  if (!await up(H, () => __z.G.state === 'wave')) throw new Error('wave did not start');
  await H.evaluate(() => { __z.sim(30); keep(); }); await sleep(2500);
  return {p: H, extra: [C1, C2], info: await H.evaluate(() => stat()).catch(() => null)};
}

function median(rs) {
  const o = {}; for (const k of Object.keys(rs[0])) {
    if (k === 'cpuBy' || k === 'allocBy') { const all = new Set(rs.flatMap(r => Object.keys(r[k]))); o[k] = {}; for (const f of all) o[k][f] = med(rs.map(r => r[k][f] ?? 0)); } else if (typeof rs[0][k] === 'number') o[k] = med(rs.map(r => r[k])); else o[k] = rs[0][k]; }
  return o;
}
const out = {}, errs = [], names = Object.keys(SCENES).concat(['coop']).filter(n => !ONLY.length || ONLY.includes(n));
const {server, origin} = await serve();  /* no background throttling: a page the OS thinks is hidden gets a frame every few seconds */
const b = await launchBrowser({protocolTimeout: 900000, args: ['--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']});
for (const name of names) {
  const runs = []; let info = null;
  for (let rep = 0; rep < REPS; rep++) {
    let p = null, extra = [];
    try {
      if (name === 'coop') { const c = await coopScene(b, origin, errs); p = c.p; extra = c.extra; info = c.info; } else { p = await scene1(b, origin, name, errs); if (!p) break; info = await p.evaluate(SCENES[name].run, SCENES[name].arg); await sleep(SCENES[name].settle ?? 2500); }
      if (OFF.length) await p.evaluate(names => { for (const k of names) window.__off[k] = true; }, OFF);
      if (!A.includes('--noboost')) boost(b); const cl0 = await calm(); if (cl0 < 0) console.log('  the machine stayed busy (over 55%) for 30 s: measuring anyway');
      const r = await collect(p, name === 'codex' ? 0 : 90); runs.push(r);
      process.stdout.write(`${name} #${rep + 1}: thread ${r.thread} ms/frame, load ${r.load}%, frame wall p50 ${r.cP50} p99 ${r.cP99} worst ${r.cWorst}, gap worst ${r.gWorst}, alloc ${r.allocKBf} KB/f, ${r.calls} calls\n`);
    } catch (e) { console.log(`${name} #${rep + 1} failed: ${String(e.stack || e).split('\n').slice(0, 3).join(' | ')}`); }
    for (const x of [p, ...extra]) if (x) await x.close().catch(() => 0);
  }
  if (!runs.length) { console.log(`${name}: n/a`); continue; }
  const m = median(runs); m.info = info; out[name] = m;
  const {cpuBy, allocBy, hotFn, allocFn, drawTop, info: inf, ...rest} = m; console.log(`\n=== ${name} (median of ${runs.length})\n  ${JSON.stringify(inf)}\n  ${JSON.stringify(rest)}`);
  if (DRAWS && drawTop) console.log('  draw calls per frame by object:\n    ' + drawTop.join('\n    '));
  if (FUNCS && runs[0].hotFn) console.log('  hot functions (ms/frame self, natives to their caller):\n    ' + runs[0].hotFn.join('\n    ') + '\n  allocating functions (KB/frame):\n    ' + runs[0].allocFn.join('\n    '));
  if (FILES) { const ks = Object.keys(cpuBy).sort((a, b) => cpuBy[b] - cpuBy[a]).slice(0, TOP); console.log('  cpu ms/frame by file: ' + ks.map(k => `${k} ${cpuBy[k]}`).join(', '));
    const as = Object.keys(allocBy).sort((a, b) => allocBy[b] - allocBy[a]).slice(0, TOP); console.log('  alloc KB/frame by file: ' + as.map(k => `${k} ${allocBy[k]}`).join(', ')); }
}
if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify(out, null, 1));
console.log(errs.length ? 'errors:\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : '\nno errors'); await b.close(); server.close(); process.exit(0);
