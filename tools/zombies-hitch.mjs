// First-use hitches in Zombies: the worst frame when each thing first happens in a run (a boss spawning and coming into view, a weather
// change, the first explosion of each kind, the re-entry streak, the base screen, the campaign map, Watch a bot, the swarm, the kill chain's
// mounts, the long-range radar...). Real rendering, headless; one page, so every event is measured the first time it happens.
// For each event: the worst frame (requestAnimationFrame to requestAnimationFrame, ms) in the frames after it, the frame time before it (p50),
// and what the renderer had to do (new shader programs, textures, geometries).
// Run: node tools/zombies-hitch.mjs [--only boss,wx,...] [--json out.json] [--url-extra '&nowarm'] [--budget 50] (fails an event over the budget, ms)
import fs from 'node:fs';
import {serve, launch, open, frames, sleep} from './zlib.mjs';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const ONLY = arg('--only', ''), JSONOUT = arg('--json', ''), EXTRA = arg('--url-extra', ''), BUDGET = +arg('--budget', 0);
const {server, origin} = await serve();
const browser = await launch({w: 960, h: 540});
const errs = [], p = await open(browser, origin + '/games/interceptor/?' + EXTRA, errs, {w: 960, h: 540});
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0, cam: 0})));
// the probes, from page load on: __fr.d = every rAF interval (ms), __fr.c = the main-thread time of each frame's callbacks (the game's frame:
// sim, scene, draw calls, and any shader compile or upload that blocks it); __gl = what the GL context was asked to do (programs linked, time
// blocked on link status, texture uploads and their pixels, buffer bytes)
await p.evaluateOnNewDocument(() => {
  const R = window.__fr = {d: [], c: [], last: 0, acc: 0}, raf = window.requestAnimationFrame.bind(window);
  let pend = [], sched = false;
  /* every shader program's first use (three.js's lazy error check waits for the GPU process to finish compiling it): name, ms, when */
  const FU = window.__fu = {list: [], seen: new WeakSet()};
  const wrapProgs = () => { const P = window.__z?.api?.renderer?.info?.programs; if (!P) return; for (const q of P) { if (FU.seen.has(q)) continue; FU.seen.add(q); const g = q.getUniforms; let used = false;
    q.getUniforms = function () { if (used) return g.call(this); used = true; const t0 = performance.now(), v = g.call(this), d = performance.now() - t0; if (d > 15) FU.list.push([q, d]); return v; }; } };
  const run = now => { sched = false; wrapProgs(); const L = pend; pend = []; const t0 = performance.now(); for (const f of L) { try { f(now); } catch (e) { setTimeout(() => { throw e; }); } } R.c.push(performance.now() - t0); if (R.last) R.d.push(now - R.last); R.last = now; };
  window.requestAnimationFrame = f => { pend.push(f); if (!sched) { sched = true; raf(run); } return pend.length; };
  const G = window.__gl = {link: 0, wait: 0, tex: 0, px: 0, buf: 0};
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) { const P = C.prototype;
    const lp = P.linkProgram; P.linkProgram = function (...a) { G.link++; return lp.apply(this, a); };
    const gp = P.getProgramParameter; P.getProgramParameter = function (...a) { const t0 = performance.now(), v = gp.apply(this, a); G.wait += performance.now() - t0; return v; };
    for (const m of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'texImage3D', 'compressedTexImage2D']) { const f = P[m]; if (!f) continue; P[m] = function (...a) { G.tex++; const im = a.find(x => x && typeof x === 'object' && 'width' in x); G.px += im ? im.width * im.height : (typeof a[3] === 'number' && typeof a[4] === 'number' ? a[3] * a[4] : 0); return f.apply(this, a); }; }
    const bd = P.bufferData; P.bufferData = function (...a) { G.buf += a[1]?.byteLength || (typeof a[1] === 'number' ? a[1] : 0); return bd.apply(this, a); };
    /* --glprof: time every GL call, to see which one a long frame waits in */
    if (/glprof/.test(location.search)) { G.t = {}; for (const k of Object.getOwnPropertyNames(P)) { let f; try { f = P[k]; } catch (e) { continue; } if (typeof f !== 'function' || k === 'constructor') continue;
      P[k] = function (...a) { const t0 = performance.now(), v = f.apply(this, a), d = performance.now() - t0; if (d > .5) G.t[k] = (G.t[k] || 0) + d; return v; }; } } }
});
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000});
const rows = [];
const want = n => !ONLY || /^(start zombies|base close \(first)/.test(n) || ONLY.split(',').some(k => n.startsWith(k));  /* the run's own start always runs */
const info = () => p.evaluate(() => { const r = __z.api.renderer.info; return {prog: r.programs?.length || 0, tex: r.memory.textures, geo: r.memory.geometries}; });
// measure one event: settle, then run js in the page (synchronously, like the game would inside a frame) and watch n frames
async function ev(name, js, {n = 40, settle = 25, arg = null, pre = ''} = {}) {  // pre: setup run (and not measured) before the settle
  if (!want(name)) return;
  if (pre) await p.evaluate(new Function('arg', pre), arg);
  await frames(p, settle);
  const i0 = await info();
  const r = await p.evaluate(async (js, arg) => { const d = __fr.d, c = __fr.c, base = c.slice(-20).sort((a, b) => a - b), bd = d.slice(-20).sort((a, b) => a - b); d.length = c.length = 0; window.__gl0 = {...__gl}; if (__gl.t) __gl.t = {}; window.__P0 = new Set(__z.api.renderer.info.programs); __fu.list.length = 0;
    const t0 = performance.now(); let v = new Function('arg', js)(arg); if (v?.then) v = await v;
    return {sync: performance.now() - t0, p50: base[base.length >> 1] || 0, d50: bd[bd.length >> 1] || 0, v: v ?? null}; }, js, arg);
  await frames(p, n);
  const {c, d, gl} = await p.evaluate(() => ({c: __fr.c.slice(), d: __fr.d.slice(), gl: Object.fromEntries(Object.entries(__gl).filter(([k]) => k !== 't').map(([k, v]) => [k, Math.round(v - __gl0[k])]))})), i1 = await info();
  /* cpu = the event's own call plus the worst frame after it (they land in one frame in the game, where it runs inside the frame) */
  const cw = Math.max(0, ...c), row = {name, cpu: +(cw + r.sync).toFixed(1), frame: +cw.toFixed(1), sync: +r.sync.toFixed(1), worst: +Math.max(0, ...d).toFixed(1), p50: +r.p50.toFixed(1), d50: +r.d50.toFixed(1),
    prog: i1.prog - i0.prog, tex: i1.tex - i0.tex, geo: i1.geo - i0.geo, gl, note: r.v};
  const fu = await p.evaluate(() => { const R = __z.api.renderer, own = q => { const L = new Set(); __z.api.scene.traverse(o => { for (const m of [o.material].flat()) if (m && R.properties.get(m).currentProgram === q) L.add((o.name || o.type) + '/' + (m.name || m.type) + (m.map ? '+map' : '') + (o.isInstancedMesh ? '+inst' : '') + (o.parent && o.parent !== __z.api.scene ? '<' + (o.parent.name || o.parent.type) : '')); }); if (!L.size && /^depth/.test(q.cacheKey)) __z.api.scene.traverse(o => { if (o.isMesh && o.castShadow && o.visible) for (const m of [o.material].flat()) if (m && m.alphaTest > 0 && (m.map || m.alphaMap)) L.add('caster? ' + o.geometry.type + ' ' + m.type + ' map ' + m.map?.image?.width + 'x' + m.map?.image?.height + ' alphaTest ' + m.alphaTest + ' parent kids ' + o.parent?.children.length + ' pos ' + o.getWorldPosition(new __z.api.THREE.Vector3()).toArray().map(Math.round)); });
    return [...L].slice(0, 4).join(' ') || 'not in the scene'; };
    return [...__fu.list.map(([q, d]) => 'first use ' + Math.round(d) + ' ms ' + q.name + ' [' + own(q) + ']'), ...R.info.programs.filter(q => !__P0.has(q)).map(q => { const a = q.cacheKey.split(','), best = [...__P0].filter(o => o.name === q.name).map(o => { const b = o.cacheKey.split(','), d = []; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d.push(i + ':' + String(b[i]).slice(0, 20) + '>' + String(a[i]).slice(0, 20)); return d; }).sort((x, y) => x.length - y.length)[0];
    return 'NEW ' + (q.name || '?') + ' [' + own(q) + '] ' + (best ? 'vs nearest: ' + best.slice(0, 5).join(' ') : a.slice(0, 8).join(',').slice(0, 90)); })]; });
  const gt = await p.evaluate(() => __gl.t ? Object.entries(__gl.t).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + ' ' + Math.round(v)).join(', ') : '');
  row.firstUse = fu; rows.push(row); console.log(`${name.padEnd(26)} cpu ${String(row.cpu).padStart(6)} ms (js ${row.sync} + frame ${row.frame}; frame p50 ${row.p50})  interval worst ${row.worst} (p50 ${row.d50})  link ${gl.link} wait ${gl.wait} ms tex ${gl.tex} ${Math.round(gl.px / 1e3)}kpx buf ${Math.round(gl.buf / 1e3)}kB${row.note != null ? '  ' + JSON.stringify(row.note).slice(0, 80) : ''}${gt ? '\n      gl: ' + gt : ''}${fu.length ? '\n      shaders: ' + fu.join(' | ') : ''}`);
}
// the menu itself (the frames while it is up, the shader warm-up if there is one)
// the menu with Zombies picked: its idle-time warm-up (zwarm.js) runs here; wait for it (a player reads the menu or the base screen first)
await frames(p, 120); const W0 = Date.now();
await p.waitForFunction(() => !__z.Z.warmSt || __z.Z.warmSt.done, {timeout: 180000, polling: 250}).catch(() => console.log('warm-up still running after 180 s'));
const menu = await p.evaluate(() => { const c = __fr.c.slice(5); return {cpu: +Math.max(...c).toFixed(1), n: c.length, gl: {...__gl}, warm: __z.Z.warmSt ? {...__z.Z.warmSt, idle: {...__z.Z.warmSt.idle}} : null}; });
console.log(`menu (${menu.n} frames)`.padEnd(26), `cpu worst ${menu.cpu} ms`, JSON.stringify(menu.gl), menu.warm ? `
  warm-up: ${JSON.stringify(menu.warm)} (waited ${Date.now() - W0} ms)` : '');
await ev('start zombies', `document.getElementById('play').click()`, {n: 60, settle: 2});
await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000});
await ev('base close (first wave)', `__z.G.cash = 1e6; __z.jump(24); __z.G.next = __z.plan(24); __z.cont()`, {n: 60});
// the showcase camera (as tools/zombies-boss-shots.mjs): __sc.t = a track to frame, or __sc.at = a point to look at from 160 m
await p.evaluate(() => { const {api, G, Z} = __z, V = api.THREE.Vector3; G.wq = [{k: 'shahed', at: 1e9, brg: 0}];
  window.__sc = {t: null, at: null, off: new V(40, 12, 30), fov: 55};
  const c0 = Z.cam; Z.cam = dt => { c0(dt); const s = __sc, cam = api.camera; if (s.at) { cam.position.copy(s.at).add(s.off); cam.lookAt(s.at); cam.fov = s.fov; cam.updateProjectionMatrix(); return; }
    if (!s.t || s.t.st === 'dead') return; const t = s.t, f = t.v.clone().setY(0); if (f.lengthSq() < .01) f.set(0, 0, 1); f.normalize();
    const r = new V(-f.z, 0, f.x), P = t.p.clone().addScaledVector(r, s.off.x).add(new V(0, s.off.y, 0)).addScaledVector(f, s.off.z); cam.position.copy(P); cam.up.set(0, 1, 0); cam.lookAt(t.p); cam.fov = s.fov; cam.updateProjectionMatrix(); };
  window.__clear = () => { for (const t of api.TH) t.st = 'dead'; __z.sim(.05); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); for (const s of api.SITES) s.hp = s.max; Z.fxTest?.endCine(); __sc.t = null; __sc.at = null; };
  window.__near = (k, d = 300) => { const s = api.SITES[1], t = __z.make(k, s.x + d, s.z - d * 2, s); if (t) { t.p.y = api.gh(t.p.x, t.p.z) + 200; } return t; }; });
await ev('idle (reference)', `return null`);
// the enemy kinds (their instanced meshes exist from the start; a first sight still draws them)
for (const k of ['shahed', 'jet', 'cruise', 'heavy', 'swarm', 'ballistic', 'hyper'])
  await ev('enemy ' + k, `__clear(); const t = __near(arg); __sc.t = t; __sc.off.set(30, 8, 20); return t ? t.k : 'none'`, {arg: k, n: 30});
// every boss, spawned and framed (the Mothership is the classic boss kind; the roster from zbosses.js)
const ids = await p.evaluate(() => __z.Z.bosses.ROSTER.slice());
await ev('boss boss (Mothership)', `__clear(); const s = __z.api.SITES[1], t = __z.make('boss', s.x + 900, s.z - 1800, s); __sc.t = t; __sc.off.set(70, 20, 50); return !!t`, {n: 45});
for (const id of ids) await ev('boss ' + id, `__clear(); const t = __z.Z.bosses.spawn(arg); __sc.t = t; __sc.off.set(60, 18, 40); __z.sim(.2); return t ? t.k : 'none'`, {arg: id, n: 45});
await ev('boss (second Mothership)', `__clear(); const s = __z.api.SITES[1], t = __z.make('boss', s.x + 900, s.z - 1800, s); __sc.t = t; __sc.off.set(70, 20, 50); return !!t`, {n: 45});
// explosions: Riley's airburst, a kill (zfx: shockwave, debris, fire), a ground impact at a site, a boss dying, a hard kill
await ev('boom airburst', `__clear(); const s = __z.api.SITES[1], P = new __z.api.THREE.Vector3(s.x, s.y + 120, s.z - 300); __sc.at = P; __z.api.boom(P, 1.5); return null`);
await ev('kill (zfx)', `__clear(); const t = __near('shahed'); __sc.at = t.p.clone(); t.by = 'p'; __z.api.killThreat(t, true); return null`);
await ev('impact at a site', `__clear(); const s = __z.api.SITES[0], t = __z.make('shahed', s.x + 20, s.z + 20, s); t.p.set(s.x + 5, s.y + 3, s.z); __sc.at = t.p.clone(); __z.Z.impact(t); return null`);
await ev('heavy impact', `__clear(); const s = __z.api.SITES[2], t = __z.make('heavy', s.x + 20, s.z + 20, s); t.p.set(s.x + 5, s.y + 3, s.z); __sc.at = t.p.clone(); __z.Z.impact(t); return null`);
await ev('boss death', `__clear(); const s = __z.api.SITES[1], t = __z.make('boss', s.x + 600, s.z - 900, s); __z.sim(.1); __sc.at = t.p.clone(); __sc.off.set(120, 40, 90); t.stages = 1; t.by = 'p'; __z.Z.bossHit(t); return t.st`, {n: 60});
// weather: each Zombies weather once
for (const id of ['scattered', 'golden', 'overcast', 'dusk', 'rain', 'storm', 'fog', 'snow', 'dust', 'night', 'clear'])
  await ev('weather ' + id, `__clear(); __z.api.S.zwx = 'wave'; __z.Z.wx.set(arg); return __z.api.WX.id`, {arg: id, n: 30});
// the re-entry streak: an ICBM flown on the sim to just before it re-enters, then real frames on it
await ev('re-entry streak', `__sc.t = window.__ic; __sc.off.set(200, 60, 300); return Math.round(window.__ic.p.y - window.__ic.aim.y)`, {n: 120, settle: 2, pre: `__clear(); const {Z, api} = __z, L0 = Z.re.log.length, t = window.__ic = __z.make('icbm', 0, 1950 - 160000, api.SITES[1]);
  for (let i = 0; i < 3000 && api.live(t) && t.p.y - t.aim.y > Z.re.RE.HE + 6000; i++) __z.sim(.05);`});
// a defence placed, and the first helpers firing
await ev('defences placed', `__clear(); const d = __z.Z.def; [['rack', 0], ['gepard', 1], ['flak', 6], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11]].forEach(([t, s]) => { const x = d.add(t, s); if (t === 'rack') { x.tier = 3; x.cap = 4; } else x.lvl = 1; }); __sc.at = new __z.api.THREE.Vector3(__z.api.SITES[0].x, __z.api.SITES[0].y + 20, __z.api.SITES[0].z); __sc.off.set(120, 60, 120); return d.D.length`);
await ev('defences fire', `__clear(); for (let i = 0; i < 6; i++) __near('shahed', 500 + i * 60); __z.Z.def.deploy?.(); __z.sim(2); __sc.at = new __z.api.THREE.Vector3(__z.api.SITES[1].x, __z.api.SITES[1].y + 30, __z.api.SITES[1].z); return __z.Z.def.shots.length`, {n: 60});
// the swarm: deploy and a strike
await ev('swarm deploy', `__clear(); const {Z, api} = __z; api.player.p.set(api.SITES[1].x, api.SITES[1].y + 150, api.SITES[1].z - 200); Z.sw.deploy(Z.sw.mine, 6, 2); __sc.at = api.player.p.clone(); __sc.off.set(20, 6, 14); return Z.sw.drones.length`);
// the kill chain: point defence mounts at the sites, a boost battery
await ev('kill chain mounts', `__clear(); const {Z, api, G} = __z; G.cash = 1e6; const a = [0, 1, 2].map(i => Z.chain.act('pb', i)); Z.chain.act('bb', 0); __sc.at = new api.THREE.Vector3(api.SITES[0].x, api.SITES[0].y, api.SITES[0].z); __sc.off.set(60, 40, 60); return a.map(x => !!x)`);
// the long-range radar layers (zstratradar.js): unlocked from wave 25 / 40; jump there and draw the HUD
await ev('strategic radar unlock', `__clear(); const {G, Z} = __z; G.wave = 41; Z.sr && Z.sr.state(); __z.sim(.2); return Z.sr.state()`);
// base screen open and close, the campaign map, Watch a bot
await ev('base open', `__clear(); __z.G.state = 'clear'; __z.Z.openBase(); return !document.getElementById('zbase').hidden`, {n: 40});
await ev('base tab chain', `__z.Z.base.setTab?.('chain'); return null`);
await ev('base close', `__z.Z.continue(); return __z.G.state`, {n: 40});
await ev('campaign map', `__z.Z.cp.openMap(); return !document.getElementById('zcamp')?.hidden`, {n: 40});
await ev('campaign map close', `document.getElementById('zcamp').hidden = true; document.body.classList.remove('zcp-open'); return null`);
await ev('menu (leave)', `__z.api.startDemo(); return null`, {n: 40});
await ev('watch a bot', `document.getElementById('zspc').open = true; document.getElementById('zspgo').click(); return null`, {n: 90, settle: 30});
const total = rows.reduce((a, r) => a + Math.max(0, r.cpu - 2 * r.p50), 0);
console.log(`\nsum over the events of the cpu hitch beyond twice the usual frame: ${Math.round(total)} ms; events over 50 ms: ${rows.filter(r => r.cpu > 50).map(r => r.name + ' ' + Math.round(r.cpu)).join(', ') || 'none'}`);
if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify({menu, rows}, null, 1));
console.log(errs.length ? 'errors:\n  ' + [...new Set(errs)].slice(0, 10).join('\n  ') : 'no errors');
await browser.close(); server.close();
const over = BUDGET ? rows.filter(r => r.cpu > BUDGET && !/watch a bot|start zombies|menu/.test(r.name)) : [];
if (over.length) console.log('FAIL over the ' + BUDGET + ' ms budget: ' + over.map(r => r.name + ' ' + r.cpu).join(', '));
process.exit(over.length || errs.length ? 1 : 0);
