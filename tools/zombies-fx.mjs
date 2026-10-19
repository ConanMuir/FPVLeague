// Zombies game-feel check and frame sequences (zfx.js): a player kill (hit-stop, slow-mo, kill cam, shockwave, announcer), a site impact
// (fire, smoke column, vignette, radio), the end-of-wave stars, a boss kill, a late-wave battlefield after a minute of fighting, and the
// JS cost of the FX layer. node tools/zombies-fx.mjs OUTDIR   (frames are OUTDIR/fx-*.png; prints checks and timings)
import fs from 'node:fs';
import {serve, launch, open, sleep} from './zlib.mjs';
const OUT = process.argv[2] || 'fx-out'; fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve(); const b = await launch(); const errs = []; let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const p = await open(b, origin + '/games/interceptor/?mode=zombies', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', cam: 1})));
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500);
await p.click('#play'); await sleep(400);
const shot = async (name, n = 1, gap = 120) => { for (let i = 0; i < n; i++) { await p.screenshot({path: `${OUT}/fx-${name}${n > 1 ? '-' + String(i).padStart(2, '0') : ''}.png`}); if (n > 1) await sleep(gap); } };
const st = () => p.evaluate(() => __z.Z.fxState());
// hold the interceptor dist m from (x, z), h m up, nose level toward it, so the chase camera frames that spot
await p.evaluate(() => { window.__look = (x, z, dist, h, ang = 2.4, fpv = false) => { clearInterval(window.__hold); const {api} = __z, V = api.THREE.Vector3, px = x + Math.sin(ang) * dist, pz = z + Math.cos(ang) * dist, dir = new V(x - px, 0, z - pz).normalize(); dir.y = .1; dir.normalize();
  const Zb = new V(0, -1, 0), Y = new V(0, 1, 0), bz = dir.clone().setY(0).normalize().negate(), q = new api.THREE.Quaternion().setFromRotationMatrix(fpv ? new api.THREE.Matrix4().makeBasis(new V().crossVectors(Y, bz), Y, bz) : new api.THREE.Matrix4().makeBasis(new V().crossVectors(dir, Zb), dir, Zb));  // nose (body +Y) along dir, belly camera axis (-Z) up
  const hold = () => { const me = api.player; if (!me || me.dead > 0) return; me.p.set(px, api.gh(px, pz) + h, pz); me.v.set(0, 0, 0); me.q.copy(q); }; hold(); window.__hold = setInterval(hold, 5); }; });

// ---------- wave 1: siren + radio, then a player kill from behind (kill cam) ----------
await p.evaluate(() => { __z.cont(); __z.sim(2); });
await sleep(2200);
const r1 = await p.evaluate(() => ({radio: document.getElementById('zradio').textContent, on: document.getElementById('zradio').className, pad: !!__z.Z.au.M.pad}));
ok(/wave 1|Wave 1|inbound/i.test(r1.radio), `radio on wave start: "${r1.radio}"`);
await shot('wave-start');
// put the interceptor 60 m behind the Shahed, matched to it, looking at it, then let the fuse take it in real time
// ride 12 m behind it for 2 s so the chase camera settles, then close to a direct hit and detonate
await p.evaluate(() => { const {api} = __z, t = api.TH.find(t => api.live(t)), me = api.player; if (me.dead > 0) __z.sim(3); window.__kt = t;
  window.__ride = setInterval(() => { const d = t.v.clone().normalize(); me.p.copy(t.p).addScaledVector(d, -12); me.p.y += 2; me.v.copy(t.v); me.q.setFromUnitVectors(new api.THREE.Vector3(0, 1, 0), d); }, 5); });
await sleep(2000);
await p.evaluate(() => { const {Z, api} = __z, t = window.__kt, me = api.player; clearInterval(window.__ride); me.p.copy(t.p).addScaledVector(t.v.clone().normalize(), -.8); me.v.copy(t.v); Z.detonate(); });
await p.waitForFunction(() => __z.Z.fxState().tsc < 1, {timeout: 3000}).catch(() => {});
const k1 = await st();
ok(k1.tsc < 1, `slow-mo after your kill (tsc ${k1.tsc.toFixed(2)})`);
ok(k1.killCam, 'kill cam on');
await shot('kill', 12, 90);
await sleep(1500);
const k2 = await st();
ok(k2.tsc === 1, `time back to normal (tsc ${k2.tsc})`);
ok(k2.W.you === 1, `wave record counts your kill (${k2.W.you})`);

// ---------- a site impact: a Shahed dives onto a site; watch from 450 m off, then the smoke column 8 s later ----------
await p.evaluate(() => { const {api} = __z, s = api.SITES[0]; __z.sim(3); const t = __z.make('shahed', s.x + 400, s.z - 300, s); t.p.y = api.gh(t.p.x, t.p.z) + 120; t.wps.length = 0; t.v.subVectors(t.aim, t.p).setLength(t.spd); window.__t = t; window.__look(t.aim.x, t.aim.z, 450, 45);
  for (let i = 0; i < 200 && !t.impacted && t.p.distanceTo(t.aim) > 90; i++) __z.sim(.1); });
await p.waitForFunction(() => window.__t.impacted, {timeout: 20000}).catch(() => {});
await sleep(150); await shot('impact', 6, 150);
await sleep(8000); await shot('impact-8s');
const s2 = await st();
ok(s2.fires >= 1 && s2.smoke > 10, `fire and smoke column at the impact (${s2.fires} fire(s), ${s2.smoke} puffs)`);
await p.evaluate(() => clearInterval(window.__hold));

// ---------- wave clear: the stars card ----------
await p.evaluate(() => { const {api, G} = __z; for (const t of api.TH) if (api.live(t)) api.killThreat(t, true); G.wq.length = 0; __z.sim(.5); });
await sleep(1900); await shot('summary');
const sm = await p.evaluate(() => ({hidden: document.getElementById('zsum').hidden, stars: document.querySelectorAll('#zsum .st i.on').length, txt: document.getElementById('zsum').textContent.replace(/\s+/g, ' ')}));
ok(!sm.hidden && sm.stars >= 1, `summary card shows ${sm.stars} star(s): ${sm.txt}`);

// ---------- boss: wave 10, a Mothership killed by helpers while you fly ----------
await p.evaluate(() => { const {api, G, Z} = __z; while (G.state !== 'base') __z.sim(1); __z.jump(10, 50000); G.next = __z.plan(10); __z.cont(); __z.sim(8); });
await sleep(1500);
const boss = await p.evaluate(() => { const {api, Z} = __z, t = api.TH.find(t => t.k === 'boss'), me = api.player; if (!t) return null; me.p.copy(t.p).add(new api.THREE.Vector3(30, 10, 60)); me.v.set(0, 0, 0); return t.stages; });
ok(boss, `wave 10 has a Mothership (${boss} stages)`);
await shot('boss-intro');
await p.evaluate(() => { const {api, Z} = __z, t = api.TH.find(t => t.k === 'boss'); while (api.live(t)) { t.by = 'p'; Z.bossHit(t); } });
await sleep(60); await shot('boss-kill', 8, 150);

// ---------- late wave: a minute of fighting with a full defence, then the battlefield from the chase and FPV cameras ----------
const W = +(process.env.ZWAVE || 28);
await p.evaluate(W => { const {api, G, Z} = __z, def = Z.def; G.wq.length = 0; for (const t of api.TH) if (api.live(t)) api.killThreat(t, true); while (G.state !== 'base') __z.sim(1);
  def.clear(); __z.jump(W, 20000); G.next = __z.plan(W);
  [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13], ['flak', 5], ['rack', 8, 3]].forEach(([t, s, l]) => { const d = def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
  __z.cont(); window.__keep = setInterval(() => api.SITES.forEach(s => s.hp = Math.max(s.hp, s.max * .5)), 100);
  for (let i = 0; i < 60; i++) { __z.sim(1); if (i % 10 === 9) api.SITES.forEach(s => s.hp = Math.max(s.hp, s.max * .5)); } }, W);
await sleep(2500);
const s3 = await st();
console.log('late wave fx', JSON.stringify({fires: s3.fires, debris: s3.debris, waves: s3.waves, tracers: s3.tracers, glow: s3.glow, audio: s3.music, smoke: s3.smoke, W: s3.W}));
await p.evaluate(() => { const f = __z.Z.fxState().fireAt, c = f.length ? f.reduce((a, b) => [a[0] + b[0] / f.length, 0, a[2] + b[2] / f.length], [0, 0, 0]) : [0, 0, -1000]; window.__fc = c; window.__look(c[0], c[2], 1100, 140, 2.8); });
await sleep(300);
console.log('fires vs camera', JSON.stringify(await p.evaluate(() => { const c = __z.api.camera.position, s = __z.Z.fxState(); return {cam: c.toArray().map(Math.round), smoke: s.smoke, fires: s.fireAt.map(f => [Math.round(f[0]), Math.round(f[2]), Math.round(Math.hypot(f[0] - c.x, f[2] - c.z))])}; })));
await sleep(800); await shot('battle-chase');
await p.evaluate(() => window.__look(window.__fc[0], window.__fc[2], 1100, 140, 2.8, true)); await p.keyboard.press('KeyC'); await p.keyboard.press('KeyC'); await sleep(600); await shot('battle-fpv');
// frame time and the JS cost of a step and a draw-side update at this load (compare with tools/zombies-shots.mjs chaos)
const perf = await p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = now => { ts.push(now - last); last = now; if (ts.length < 180) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res({avg: +(ts.reduce((a, b) => a + b) / ts.length).toFixed(1), p50: +ts[90].toFixed(1), p95: +ts[171].toFixed(1)}); } }; requestAnimationFrame(f); }));
const js = await p.evaluate(() => { const {api} = __z; let t0 = performance.now(); for (let i = 0; i < 120; i++) api.step(1 / 120); const step = (performance.now() - t0) / 120; t0 = performance.now(); for (let i = 0; i < 30; i++) api.visuals(1 / 60, performance.now()); return {stepMs: +step.toFixed(3), visualsMs: +((performance.now() - t0) / 30).toFixed(3), tracks: api.TH.filter(api.live).length}; });
console.log('late wave perf', JSON.stringify({...perf, ...js}));
await p.evaluate(() => { clearInterval(window.__hold); clearInterval(window.__keep); });

// ---------- Classic is untouched: no time scale, no FX state ----------
const cl = await p.evaluate(() => { __z.api.startDemo(); return {tsc: __z.Z.tsc, on: __z.Z.on, fires: __z.Z.fxState().fires}; });
ok(cl.tsc === 1 && !cl.on && cl.fires === 0, 'menu / Classic: time scale 1, FX cleared');
ok(!errs.length, 'no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
await b.close(); server.close(); process.exit(fails ? 1 : 0);
