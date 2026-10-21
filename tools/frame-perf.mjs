// Frame pacing, allocations and GC in the real frame loop (src/main.js), headless Edge on the real GPU, through the Vite dev server.
//   node tools/frame-perf.mjs [--secs=20] [--asecs=8] [--only=league,df,hitch] [--top=20] [--json=out.json] [--uncapped]
// --uncapped: rAF as fast as it goes (no vsync, no frame-rate limit), the nearest headless gets to a high-refresh screen
// Scenes (every drone a bot, chase cam, live frames):
//   league  League 3v3 match on the arena (goal replays on)
//   df      Dogfight 3v3 on the Highlands: turrets, guns, caves (one bot is sent through the caves so they are drawn)
//   hitch   one fresh page: the first goal explosion, the first goal replay, every map's first switch, the garage, the first Dogfight (caves)
// Per scene it reports the main loop's work per frame (the time inside main.js frame(), GC included), p50 / p95 / p99 / worst, the
// rAF intervals, the GC pauses (trace events MinorGC / MajorGC: count, total, worst) and the JS bytes allocated per frame (CDP sampling
// heap profiler, objects collected by minor and major GC included) with the functions that allocate most.
// Headless Chrome / Edge paces rAF at 60 Hz whatever the screen, so frame *intervals* say little about a 240 Hz screen; the work per frame
// and the GC pauses are what decide whether a 4.2 ms frame (240 Hz) is met. tools/league-judder.mjs covers the refresh rates themselves.
import fs from 'node:fs';
import {launchBrowser, gameReady} from './browser.mjs';
const argv = process.argv.slice(2), arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const SECS = +arg('secs', 20), ASECS = +arg('asecs', 8), UNCAP = argv.includes('--uncapped'), ONLY = new Set(arg('only', 'league,df,hitch').split(',')), TOP = +arg('top', 20), JSONF = arg('json', '');
const {createServer} = await import('vite');
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const URL = server.resolvedUrls.local[0] + 'app.html';
const b = await launchBrowser({protocolTimeout: 600000, args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', ...(UNCAP ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])]});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (a, f) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const r2 = x => +x.toFixed(2);
const out = {};

// every rAF callback named frame (main.js's loop) is timed; the log keeps [start, work ms, interval ms]
function timer() {
  const R = window.requestAnimationFrame.bind(window), F = window.__ft = {on: false, log: [], last: 0, marks: []};
  window.requestAnimationFrame = cb => cb.name !== 'frame' ? R(cb) : R(ts => { const t0 = performance.now(); cb(ts); const t1 = performance.now();
    if (F.on) F.log.push([t0, t1 - t0, F.last ? ts - F.last : 0]); F.last = ts; });
  F.mark = s => F.marks.push([performance.now(), s]);
}
async function page() {
  const p = await b.newPage(); await p.setViewport({width: 1280, height: 720}); await p.evaluateOnNewDocument(timer);
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await gameReady(p);
  await p.evaluate(async () => { window.__fp = {DF: await import('/src/modes/dogfight.js'), MA: await import('/src/modes/match.js'), GS: (await import('/src/state.js')).GS,
    S: (await import('/src/config/settings.js')).S, ball: (await import('/src/physics/ball.js')).ball, C: await import('/src/config/constants.js'), T: await import('/src/config/tune.js'),
    MP: await import('/src/world/maps.js'), G: await import('/src/ui/garage.js'), RP: await import('/src/render/replay.js')}; });
  p.errs = errs; return p;
}
// a 3v3 match with every drone a bot (the player's too), chase cam
const startMatch = (p, mode) => p.evaluate(mode => { const {DF, MA, GS, S} = window.__fp; S.bots = 1; S.size = 3; S.replay = 'on'; S.killcam = true; DF.setGame(mode); MA.startMatch(); GS.menuOpen = false;
  GS.camMode = 1; GS.player.bot = true; GS.player.skill = S.diff; }, mode);

async function measure(p, secs, label) {
  const cdp = await p.target().createCDPSession();
  // phase 1: frame timing and GC pauses (a trace, no heap profiler running)
  await p.tracing.start({categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc']});
  await p.evaluate(() => { window.__ft.log.length = 0; window.__ft.on = true; });
  await sleep(secs * 1000);
  await p.evaluate(() => { window.__ft.on = false; });
  const trace = JSON.parse(Buffer.from(await p.tracing.stop()).toString());
  const log = await p.evaluate(() => window.__ft.log);
  // phase 2: allocations (sampling heap profiler; objects already collected by minor and major GC included)
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', {samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true});
  await p.evaluate(() => { window.__ft.log.length = 0; window.__ft.on = true; });
  await sleep(ASECS * 1000);
  await p.evaluate(() => { window.__ft.on = false; });
  const {profile} = await cdp.send('HeapProfiler.stopSampling');
  const alog = await p.evaluate(() => window.__ft.log);
  await cdp.detach();
  const t0 = log.length ? log[0][0] : 0, t1 = log.length ? log[log.length - 1][0] : 0, an = alog.length, asec = an > 1 ? (alog[an - 1][0] - alog[0][0]) / 1000 : 1;
  // GC pauses on the main thread of the page's renderer, inside the measured window
  const evs = trace.traceEvents || trace, main = evs.find(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  const gcs = evs.filter(e => (e.name === 'MinorGC' || e.name === 'MajorGC') && e.ph === 'X' && (!main || (e.pid === main.pid && e.tid === main.tid)));
  const gc = {minor: 0, major: 0, ms: 0, worst: 0};
  for (const e of gcs) { gc[e.name === 'MinorGC' ? 'minor' : 'major']++; const d = e.dur / 1000; gc.ms += d; gc.worst = Math.max(gc.worst, d); }
  // allocations: walk the sampled tree, bytes per function (self)
  const by = new Map(); let total = 0;
  const walk = n => { const s = n.selfSize || 0; total += s; if (s) { const c = n.callFrame, k = `${c.functionName || '(anon)'} ${String(c.url).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}:${c.lineNumber + 1}`; by.set(k, (by.get(k) || 0) + s); } (n.children || []).forEach(walk); };
  walk(profile.head);
  const n = log.length, work = log.map(x => x[1]), iv = log.slice(1).map(x => x[2]);
  const r = {frames: n, secs: r2((t1 - t0) / 1000), work: {p50: r2(q(work, .5)), p95: r2(q(work, .95)), p99: r2(q(work, .99)), worst: r2(Math.max(0, ...work))},
    interval: {p50: r2(q(iv, .5)), p95: r2(q(iv, .95)), worst: r2(Math.max(0, ...iv))}, over4ms: work.filter(x => x > 4.17).length, over8ms: work.filter(x => x > 8.33).length,
    gc: {minor: gc.minor, major: gc.major, ms: r2(gc.ms), worst: r2(gc.worst)}, alloc: {kbPerSec: r2(total / 1024 / asec), kbPerFrame: r2(total / 1024 / Math.max(1, an)), frames: an},
    top: [...by].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, v]) => [k, r2(v / 1024 / asec)])};
  console.log(`\n== ${label}: ${r.frames} frames in ${r.secs} s`);
  console.log(`   frame work ms  p50 ${r.work.p50}  p95 ${r.work.p95}  p99 ${r.work.p99}  worst ${r.work.worst}   (> 4.17 ms: ${r.over4ms}, > 8.33 ms: ${r.over8ms})`);
  console.log(`   rAF interval   p50 ${r.interval.p50}  p95 ${r.interval.p95}  worst ${r.interval.worst}`);
  console.log(`   GC             ${r.gc.minor} minor + ${r.gc.major} major, ${r.gc.ms} ms total, worst ${r.gc.worst} ms`);
  console.log(`   allocated      ${r.alloc.kbPerSec} KB / s, ${r.alloc.kbPerFrame} KB / frame (${an} frames in ${r2(asec)} s, measured after the timing)`);
  for (const [k, v] of r.top) console.log(`     ${String(v).padStart(8)} KB/s  ${k}`);
  return r;
}

for (const mode of ['league', 'df']) {
  if (!ONLY.has(mode)) continue;
  const p = await page(); await startMatch(p, mode);
  if (mode === 'df') await p.evaluate(() => { const {GS} = window.__fp; GS.player.p.set(0, 40, 0); });  // a bot near the middle, where the cave mouths are
  await sleep(4000);  // warm up: shaders compiled, first kickoff over
  out[mode] = await measure(p, SECS, mode === 'league' ? 'League 3v3 (bots)' : 'Dogfight 3v3 (bots, turrets, caves)');
  out[mode].score = await p.evaluate(() => [...window.__fp.GS.score]);
  if (p.errs.length) console.log('   page errors: ' + p.errs.slice(0, 5).join(' | '));
  await p.close();
}

// ---------- first-use hitches ----------
// the worst frame (work ms) in the window after each event, plus the synchronous time of the call where there is one
if (ONLY.has('hitch')) {
  const p = await page();
  const worstAfter = async (fn, ms = 1500) => { await p.evaluate(() => { window.__ft.log.length = 0; window.__ft.on = true; });
    const call = await p.evaluate(fn); await sleep(ms); const w = await p.evaluate(() => { window.__ft.on = false; return window.__ft.log.map(x => x[1]); });
    return {call: call == null ? null : r2(call), worst: r2(Math.max(0, ...w)), frames: w.length}; };
  const H = out.hitch = {};
  // a player in the menu first (12 s): render/warm.js does its first-use work then (builds without it skip this). The worst frame of the
  // menu's attract demo meanwhile is what that costs.
  const warm = await p.evaluate(async () => { try { return !!(window.__fp.W = await import('/src/render/warm.js')); } catch (e) { return false; } });
  if (warm) { await p.evaluate(() => { window.__ft.log.length = 0; window.__ft.on = true; }); const t0 = Date.now(); while (Date.now() - t0 < 30000 && (await p.evaluate(() => window.__fp.W.warmLeft().length))) await sleep(250);
    const w = await p.evaluate(() => { window.__ft.on = false; const L = window.__ft.log; return [Math.max(0, ...L.map(x => x[2])), L.length]; }); H.menuWhileWarming = {call: null, worst: r2(w[0]), frames: w[1]};  // the warm-up runs between frames: its cost is the longest gap between two menu frames
    H.warmTasks = await p.evaluate(() => window.__fp.W.warmLog()); await p.evaluate(() => { window.__ft.on = false; }); }
  else await sleep(12000);
  await startMatch(p, 'league'); await sleep(5000);
  const score = `() => { const {GS, ball, C, T} = window.__fp; GS.state = 'play'; ball.p.set(0, T.BR + 3, -(C.HL + T.BR + 1)); ball.v.set(0, 0, -5); }`;
  // first goal: the explosion; second goal later for comparison
  H.goal1 = await worstAfter(new Function('return (' + score + ')()'), 1800);
  H.replay1 = await worstAfter(() => null, 2500);  // the replay starts 2 s after the goal
  await p.evaluate(() => { const {RP} = window.__fp; RP.rpDebug.skip(); }); await sleep(4500);
  H.goal2 = await worstAfter(new Function('return (' + score + ')()'), 1800);
  H.replay2 = await worstAfter(() => null, 2500);
  await p.evaluate(() => window.__fp.RP.rpDebug.skip()); await sleep(1000);
  // maps: each one's first switch, then a second visit
  const maps = await p.evaluate(() => Object.keys(window.__fp.MP.LOOKS).filter(k => k !== 'df' && k !== window.__fp.MP.mapId));
  H.maps = {};
  for (const m of maps) H.maps[m] = await worstAfter(new Function(`const t0 = performance.now(); window.__fp.MP.setMap(${JSON.stringify(m)}); return performance.now() - t0;`), 800);
  H.mapsAgain = {};
  for (const m of maps.slice(0, 2)) H.mapsAgain[m] = await worstAfter(new Function(`const t0 = performance.now(); window.__fp.MP.setMap(${JSON.stringify(m)}); return performance.now() - t0;`), 800);
  await p.evaluate(() => window.__fp.MP.setMap('arena'));
  H.garage = await worstAfter(() => { const t0 = performance.now(); window.__fp.G.openGarage(); return performance.now() - t0; }, 1200);
  await p.evaluate(() => window.__fp.G.closeGarage()); await sleep(300);
  H.garage2 = await worstAfter(() => { const t0 = performance.now(); window.__fp.G.openGarage(); return performance.now() - t0; }, 1200);
  await p.evaluate(() => window.__fp.G.closeGarage()); await sleep(300);
  H.dogfight = await worstAfter(() => { const {DF, MA, GS} = window.__fp; const t0 = performance.now(); DF.setGame('df'); MA.startMatch(); GS.menuOpen = false; GS.player.bot = true; return performance.now() - t0; }, 2500);
  H.league = await worstAfter(() => { const {DF, MA, GS} = window.__fp; const t0 = performance.now(); DF.setGame('league'); MA.startMatch(); GS.menuOpen = false; GS.player.bot = true; return performance.now() - t0; }, 1500);
  H.dogfight2 = await worstAfter(() => { const {DF, MA, GS} = window.__fp; const t0 = performance.now(); DF.setGame('df'); MA.startMatch(); GS.menuOpen = false; GS.player.bot = true; return performance.now() - t0; }, 2500);
  console.log('\n== first-use hitches (call: ms inside the call; worst: worst frame ms in the window after it)');
  const show = (k, v) => console.log(`   ${k.padEnd(22)} call ${String(v.call ?? '-').padStart(7)}   worst frame ${String(v.worst).padStart(7)} ms  (${v.frames} frames)`);
  for (const [k, v] of Object.entries(H)) if (k === 'warmTasks') console.log('   warm-up tasks (ms): ' + v.map(([n, ms]) => n + ' ' + ms).join(', ')); else if (v.worst != null) show(k, v); else for (const [m, w] of Object.entries(v)) show(k + ' ' + m, w);
  if (p.errs.length) console.log('   page errors: ' + p.errs.slice(0, 5).join(' | '));
  await p.close();
}
if (JSONF) fs.writeFileSync(JSONF, JSON.stringify(out, null, 1));
await b.close(); await server.close();
