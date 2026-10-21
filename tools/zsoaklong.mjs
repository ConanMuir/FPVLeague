// The long-session soak for tools/zombies-soak.mjs --minutes N (see there): one run with everything on, sampled every game-minute.
// longSoak(ctx, browser, zd, errs): ctx = {origin, open, sleep, ok, heapMB, PLAY, SHOP, SKILL, MINUTES, JSONOUT}
import fs from 'node:fs';
export async function longSoak({origin, open, sleep, ok, heapMB, PLAY, SHOP, SKILL, MINUTES, JSONOUT}, browser, zd, errs) {
  const T0 = Date.now(), p = await open(browser, 'about:blank', errs, {w: 960, h: 540});
  // probes from page load: main-thread ms per frame (rAF callbacks), audio sources started and not yet ended, audio nodes made
  await p.evaluateOnNewDocument(() => {
    const R = window.__fr = {c: []}, raf = window.requestAnimationFrame.bind(window); let pend = [], sched = false;
    const run = now => { sched = false; const L = pend; pend = []; const t0 = performance.now(); for (const f of L) { try { f(now); } catch (e) { setTimeout(() => { throw e; }); } } R.c.push(performance.now() - t0); if (R.c.length > 4000) R.c.splice(0, 2000); };
    window.requestAnimationFrame = f => { pend.push(f); if (!sched) { sched = true; raf(run); } return pend.length; };
    const A = window.__au = {made: 0, live: 0}, S = window.AudioScheduledSourceNode?.prototype, B = window.BaseAudioContext?.prototype;
    if (S) { const st = S.start; S.start = function (...a) { if (!this.__c) { this.__c = 1; A.live++; this.addEventListener('ended', () => { A.live--; }, {once: true}); } return st.apply(this, a); }; }
    if (B) for (const m of ['createOscillator', 'createGain', 'createBufferSource', 'createBiquadFilter', 'createStereoPanner', 'createPanner', 'createDynamicsCompressor', 'createConvolver', 'createWaveShaper', 'createDelay']) {
      const f = B[m]; if (f) B[m] = function (...a) { A.made++; return f.apply(this, a); }; }
  });
  await p.goto(origin + '/games/interceptor/', {waitUntil: 'load'});
  await p.evaluate(zd => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', zdiff: zd, zwx: 'wave', gfx: 'high', fps: false})), zd);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000});
  await p.waitForFunction(() => !__z.Z.warmSt || __z.Z.warmSt.done, {timeout: 180000, polling: 500}).catch(() => {});
  const cdp = await p.target().createCDPSession(); await cdp.send('Performance.enable');
  // GPU geometry leak probe (as the per-difficulty soak): uploaded, not disposed and out of the scene = leaked, by where it was made
  await p.evaluate(() => { const {api} = __z, BG = api.THREE.BufferGeometry.prototype, ED = Object.getPrototypeOf(BG), add = ED.addEventListener, dis = BG.dispose, sa = BG.setAttribute, made = new WeakMap(); window.__geo = new Map();
    BG.setAttribute = function (n, a) { if (!made.has(this)) made.set(this, (new Error().stack.split('\n').slice(2).find(l => !/three\.module/.test(l)) || '').trim().replace(/https?:\/\/[^/]+/, '')); return sa.call(this, n, a); };
    ED.addEventListener = function (t, f) { if (t === 'dispose' && this.isBufferGeometry && !__geo.has(this)) __geo.set(this, made.get(this) || 'made before the probe'); return add.call(this, t, f); };
    BG.dispose = function () { __geo.delete(this); return dis.call(this); }; });
  await p.click('#play'); await sleep(500);
  const name = await p.evaluate(() => __z.Z.diff().n);
  const frameStats = async n => { await p.evaluate(() => { __fr.c.length = 0; }); await p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    return p.evaluate(() => { const c = __fr.c.slice(2).sort((a, b) => a - b), q = f => +(c[Math.min(c.length - 1, Math.floor(c.length * f))] || 0).toFixed(1); return {p50: q(.5), p95: q(.95), worst: q(1)}; }); };
  const SAMPLE = () => { const {api, G, Z} = __z; let objs = 0; api.scene.traverse(() => objs++); const m = api.renderer.info.memory, live = new Set(); api.scene.traverse(o => o.geometry && live.add(o.geometry)); let orphan = 0; const by = {};
    for (const [g, at] of window.__geo || []) if (!live.has(g)) { orphan++; by[at] = (by[at] || 0) + 1; }
    return {wave: G.wave, st: G.state, geo: m.geometries, tex: m.textures, progs: api.renderer.info.programs?.length || 0, objs, top: api.scene.children.length, th: api.TH.length, pops: G.pops.length, shots: Z.def.shots?.length ?? -1,
      drones: Z.def.drones?.length ?? -1, defs: Z.def.D.length, sw: Z.sw?.drones?.length ?? -1, audioLive: __au.live, audioMade: __au.made, orphan,
      orphanTop: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => v + ' x ' + k.slice(0, 120)), bfx: Z.bosses?.fx?.() || {}}; };
  const metrics = async () => { const {metrics: M} = await cdp.send('Performance.getMetrics'), g = k => M.find(x => x.name === k)?.value ?? -1; return {nodes: g('Nodes'), listeners: g('JSEventListeners')}; };
  const WXC = ['clear', 'scattered', 'golden', 'overcast', 'dusk', 'rain', 'storm', 'fog', 'snow', 'dust', 'night'], SH = {overcast: 'rain', rain: 'storm', storm: 'rain', fog: 'overcast', golden: 'dusk', snow: 'overcast', clear: 'scattered', scattered: 'clear'};
  const rows = [], base = []; let simSec = 0, nextMin = 1, w = 0;
  const sample = async () => { const s = await p.evaluate(SAMPLE), heap = await heapMB(p), m = await metrics(), f = await frameStats(45);
    await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyH', key: 'h'})));  /* the thermal camera, toggled every minute */
    const r = {min: Math.round(simSec / 60), ...s, heap, ...m, frame: f}; rows.push(r);
    if (rows.length > 1 && s.orphan > rows.at(-2).orphan + 20) console.log('    orphans by origin:', JSON.stringify(s.orphanTop));
    console.log(`  min ${String(r.min).padStart(3)} w${r.wave} heap ${heap} nodes ${m.nodes} lis ${m.listeners} geo ${s.geo} tex ${s.tex} prog ${s.progs} objs ${s.objs} th ${s.th} pops ${s.pops} shots ${s.shots} sw ${s.sw} audio ${s.audioLive}/${s.audioMade} orphan ${s.orphan} | frame ${f.p50}/${f.p95}/${f.worst}`); };
  while (simSec < MINUTES * 60 && w < 400) {
    const st = await p.evaluate(() => __z.G.state); if (st === 'over') break;
    if (st !== 'base') { await p.evaluate(() => __z.sim(1)); continue; }
    // the base screen: the constant-load probe, the shop, then the wave's set-up
    if (w % 2 === 0) { const f = await frameStats(60); base.push({min: Math.round(simSec / 60), wave: w, ...f}); }
    await p.evaluate(SHOP + '()');
    await p.evaluate(([w, WXC, SH]) => { const {G, Z} = __z, R = Z.bosses?.ROSTER || []; G.cash = Math.max(G.cash, 60000);
      if (R.length) Z.bosses.force(R[w % R.length]); for (let i = 0; i < 3; i++) Z.chain?.act?.('pb', i);
      const id = WXC[w % WXC.length]; if (G.next) { G.next.wx = {id}; if (w % 3 === 1 && SH[id]) Object.assign(G.next.wx, {to: SH[id], why: 'changing', at: 25, dur: 30}); }
      }, [w, WXC, SH]);
    /* a sortie every third break: it flies out of the base screen and the wave starts when its clock runs out (the scripted pilot stays home) */
    const so = w % 3 === 2 && await p.evaluate(() => { try { return __z.so?.launch?.() === true; } catch (e) { return false; } });
    if (so) { for (let i = 0; i < 400 && await p.evaluate(() => __z.G.state === 'base'); i++) await p.evaluate(() => __z.sim(.5)); }
    else { await p.click('#zgo'); await sleep(50); }
    w++;
    await p.evaluate(w => { const {api, Z} = __z, R = Z.bosses?.ROSTER || []; if (R.length) Z.bosses.spawn(R[(w + 4) % R.length]);
      if (w % 2 === 0) { const s = api.SITES[1]; __z.make('boss', s.x + 1500, s.z - 3000, s); }
      try { Z.sw?.deploy?.(Z.sw.mine, 6, 2); } catch (e) {} }, w);
    let r = {st: 'wave'};
    for (let chunk = 0; chunk < 60 && r.st === 'wave'; chunk++) {
      r = await p.evaluate(PLAY + `(${SKILL}, true, 20)`); simSec += r.t;
      if (chunk === 2) await p.evaluate(() => { try { __z.Z.sw?.command?.('strike'); } catch (e) {} });
      /* the bosses get fought (a bot pilot's bursts from where each boss module says one would be); after 3 minutes they are finished off */
      await p.evaluate(chunk => { const B = __z.Z.bosses; if (!B) return; for (let i = 0; i < 4; i++) try { B.bot(.9); } catch (e) {}
        if (chunk >= 9) for (const t of B.alive()) for (let i = 0; i < 12 && t.st !== 'dead'; i++) try { B.hitAt(t, 'kill', t.p.clone()); } catch (e) { break; } }, chunk);
      await sleep(30);
      if (simSec >= nextMin * 60) { nextMin = Math.floor(simSec / 60) + 1; if (r.st === 'wave') await sample(); }
      if (simSec >= MINUTES * 60) break;
    }
    if (r.st === 'clear') await p.evaluate(() => __z.sim(4));
  }
  const last = rows.at(-1) || {};
  console.log(`\n${name} long session: ${Math.round(simSec / 60)} game-minutes, ${w} waves, wave ${last.wave}, in ${Math.round((Date.now() - T0) / 1000)} s; ${rows.length} samples`);
  console.log('  base-screen probe (frame ms p50/p95/worst):', base.map(b => `m${b.min}:${b.p50}/${b.p95}/${b.worst}`).join('  '));
  if (last.orphan) console.log('  orphaned geometries by where they were made:', JSON.stringify(last.orphanTop));
  if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify({rows, base}, null, 1));
  ok(rows.length >= Math.min(MINUTES, 10) * .8, `long session: sampled ${rows.length} game-minutes`);
  if (rows.length > 4) {
    const L = rows.slice(-3), F = rows.slice(0, 3), mx = k => Math.max(...L.map(x => x[k])), mn = k => Math.min(...F.map(x => x[k]));
    ok(mx('heap') - mn('heap') < 25, `JS heap after GC ${mn('heap')} -> ${mx('heap')} MB`);
    ok(mx('nodes') - mn('nodes') < 800, `DOM nodes ${mn('nodes')} -> ${mx('nodes')}`);
    ok(mx('listeners') - mn('listeners') < 300, `event listeners ${mn('listeners')} -> ${mx('listeners')}`);
    ok(mx('progs') - mn('progs') < 15, `shader programs ${mn('progs')} -> ${mx('progs')}`);
    ok(mx('tex') - mn('tex') < 30, `GPU textures ${mn('tex')} -> ${mx('tex')}`);
    ok(mx('orphan') - mn('orphan') < 40, `orphaned GPU geometries ${mn('orphan')} -> ${mx('orphan')}`);
    ok(mx('audioLive') - mn('audioLive') < 60, `audio sources playing ${mn('audioLive')} -> ${mx('audioLive')}`);
    const b0 = base.slice(1, 4), b1 = base.slice(-3), med = a => a.map(x => x.p50).sort((a, b) => a - b)[a.length >> 1] || 0;
    if (b0.length && b1.length) ok(med(b1) <= med(b0) * 1.3 + 1.5, `base-screen frame time (same view) p50 ${med(b0)} ms early -> ${med(b1)} ms late`);
  }
  ok(!errs.length, 'long session: no page errors' + (errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : ''));
  await p.close();
}
