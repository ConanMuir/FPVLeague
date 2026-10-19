// Zombies soak: a scripted player who shops sensibly plays long runs on each difficulty (to --waves or game over) while the harness
// watches for page errors, NaNs, stuck states (a wave that never ends, a base screen that never opens, a boss that never dies) and
// leaks (tracks, scene objects, GPU geometries/textures, JS heap after GC), then checks that Classic still works and the modes switch.
// Run: node tools/zombies-soak.mjs [--diff 0,1,2,3] [--waves 32] [--skill .05] [--god]   (--god keeps the sites topped up to reach late waves)
import {serve, launch, open, sleep} from './zlib.mjs';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const DIFFS = String(arg('--diff', '0,1,2,3')).split(',').map(Number), WAVES = +arg('--waves', 32), SKILL = +arg('--skill', .05), GOD = argv.includes('--god');
const {server, origin} = await serve();
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };

async function heapMB(p) {  // JS heap after a full GC
  const s = await p.target().createCDPSession();
  await s.send('HeapProfiler.collectGarbage'); const h = await s.send('Runtime.getHeapUsage'); await s.detach();
  return +(h.usedSize / 1048576).toFixed(1);
}
// one wave's worth of play, in chunks so the real frame loop draws between them (render paths, FX, overlay)
const PLAY = `(function(skill, god, budgetSec){
  const {api, G, Z, KIND} = __z; let t = 0, bossT = 0, maxTH = 0;
  while (G.state === 'wave' && t < budgetSec) { __z.sim(.5); t += .5; maxTH = Math.max(maxTH, api.TH.length);
    if (god && __z.integrity().hp < __z.integrity().max * .5) api.SITES.forEach(s => { if (s.hp > 0) s.hp = s.max; });
    if (Math.random() < skill) { const u = Z.urgent(); if (u && KIND[u.k].armor !== 'hard' && api.player && api.player.dead <= 0) __z.botKill(.8); }
    if (api.player && api.player.dead > 0 && Math.random() < .2) api.launch();
    if (Math.random() < .02) ['freeze', 'mark', 'air'].forEach(k => Z.pk.use(k));
    if (api.TH.some(u => u.k === 'boss' && api.live(u))) bossT += .5; }
  return {t, bossT, maxTH, st: G.state};
})`;
const SHOP = `(function(){
  const {api, G, Z} = __z, def = Z.def;
  const PRIO = ['gdome', 'idome', 'sam', 'gepard', 'rack', 'flak', 'ew', 'mark', 'air', 'warhead', 'freeze', 'radar', 'aid', 'relaunch', 'battery', 'optics', 'fuse', 'rocket'];
  for (const s of api.SITES) { const need = s.max - s.hp; if (s.hp > 0 && need > 0) { const k = Z.repairK(), hp = Math.min(need, Math.floor(G.cash * .5 / (3 * k))); G.cash -= Math.ceil(hp * 3 * k); s.hp += hp; } }
  for (let pass = 0; pass < 3; pass++) {
    const cards = G.cards.map((c, i) => ({...c, i})).filter(c => PRIO.includes(c.k) && G.wave + 1 >= __z.ITEMS[c.k].from && !(__z.ITEMS[c.k].type === 'perk' && Z.perkMaxed(c.k))).sort((a, b) => PRIO.indexOf(a.k) - PRIO.indexOf(b.k));
    for (const c of cards) { const it = __z.ITEMS[c.k], price = it.type === 'perk' ? Z.perkPrice(c.k) : it.price; if (G.cash < price) continue;
      if ((c.k === 'idome' && G.wave < 22) || (c.k === 'gdome' && G.wave < 27)) continue;
      if (it.type === 'helper' && !def.SLOTS.some((_, j) => def.slotFree(j))) { const w = def.D.filter(d => d.type === 'flak' || d.type === 'ew').sort((a, b) => a.kills - b.kills)[0]; if (!w || PRIO.indexOf(c.k) > PRIO.indexOf('gepard')) continue; Z.base.sell(w.id); Z.base.sell(w.id); }
      Z.base.buy(c.i); if (G.placing) { const j = def.SLOTS.findIndex((_, j) => def.slotFree(j)); if (j < 0) { G.placing = null; continue; } Z.base.place(j); } }
    for (const d of def.D) { Z.base.upgrade(d.id, d.type === 'rack' ? 'tier' : 'lvl'); if (d.type === 'rack') Z.base.upgrade(d.id, 'cap'); }
  }
})`;
// counts that should stay flat from wave to wave at the base screen
const STATS = `(function(){
  const {api, G, Z} = __z; let objs = 0, meshes = 0, lights = 0; api.scene.traverse(o => { objs++; if (o.isMesh || o.isPoints || o.isLine || o.isSprite) meshes++; if (o.isLight) lights++; });
  const m = api.renderer.info.memory, nan = [];
  if (!Number.isFinite(G.cash) || !Number.isFinite(G.earned)) nan.push('cash ' + G.cash + '/' + G.earned);
  for (const s of api.SITES) if (!Number.isFinite(s.hp)) nan.push(s.n + ' hp');
  const me = api.player; if (me && !(Number.isFinite(me.p.x) && Number.isFinite(me.p.y) && Number.isFinite(me.p.z) && Number.isFinite(me.v.x))) nan.push('player');
  for (const t of api.TH) if (!Number.isFinite(t.p.x + t.p.y + t.p.z)) nan.push('track ' + t.k);
  if (!Number.isFinite(api.camera.position.x + api.camera.position.y + api.camera.position.z)) nan.push('camera');
  return {objs, meshes, lights, scene: api.scene.children.length, geo: m.geometries, tex: m.textures, th: api.TH.length, pops: G.pops.length,
    drones: Z.def.drones?.length ?? -1, shots: Z.def.shots?.length ?? -1, defs: Z.def.D.length, st: G.state, wave: G.wave, cash: G.cash,
    integ: Math.round(100 * __z.integrity().hp / __z.integrity().max), base: !document.getElementById('zbase').hidden, over: !document.getElementById('zover').hidden,
    feed: document.getElementById('feed')?.children.length ?? -1, nan, orphan: (() => { const live = new Set(); api.scene.traverse(o => o.geometry && live.add(o.geometry)); const by = {}; let n = 0;
      for (const [g, at] of window.__geo || []) if (!live.has(g)) { n++; by[at] = (by[at] || 0) + 1; } return {n, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => v + ' x ' + k.slice(0, 160))}; })()};
})()`;

const summary = [];
for (const zd of DIFFS) {  // a fresh browser per difficulty; a crash fails that difficulty and the soak goes on
  const browser = await launch({w: 960, h: 540}), errs = [];
  try { await soak(browser, zd, errs); } catch (e) { ok(false, `difficulty ${zd}: harness stopped: ${String(e.message || e).split('\n')[0]}` + (errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : '')); summary.push(`difficulty ${zd}: stopped (${String(e.message || e).split('\n')[0]})`); }
  await browser.close().catch(() => {});
}
async function soak(browser, zd, errs) {
  const T0 = Date.now();
  const p = await open(browser, origin + '/games/interceptor/', errs, {w: 960, h: 540});
  await p.evaluate(zd => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', zdiff: zd})), zd);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await sleep(500);
  // leak probe: every geometry the renderer uploads is remembered until it is disposed; one that is neither disposed nor in the scene any more is leaked GPU memory
  await p.evaluate(() => { const {api} = __z, BG = api.THREE.BufferGeometry.prototype, ED = Object.getPrototypeOf(BG), add = ED.addEventListener, dis = BG.dispose; window.__geo = new Map();
    ED.addEventListener = function (t, f) { if (t === 'dispose' && this.isBufferGeometry && !__geo.has(this)) __geo.set(this, (new Error().stack.split('\n')[4] || '').trim().replace(/https?:\/\/[^/]+/, '')); return add.call(this, t, f); };
    BG.dispose = function () { __geo.delete(this); return dis.call(this); }; });
  await p.click('#play'); await sleep(500);
  const name = await p.evaluate(() => __z.Z.diff().n), rows = [], heaps = [], stuck = [];
  let simSec = 0;
  for (let w = 0; w < WAVES; w++) {
    const s0 = await p.evaluate(STATS);
    if (s0.st !== 'base') { stuck.push(`wave ${s0.wave}: expected the base screen, state ${s0.st}`); break; }
    await p.evaluate(SHOP + '()');
    await p.click('#zgo'); await sleep(50);
    let r = {st: 'wave'}, waveT = 0, bossT = 0, maxTH = 0;
    for (let chunk = 0; chunk < 40 && r.st === 'wave'; chunk++) {  // 40 x 30 s = 20 minutes of game time at most
      r = await p.evaluate(PLAY + `(${SKILL}, ${GOD}, 30)`); waveT += r.t; bossT += r.bossT; maxTH = Math.max(maxTH, r.maxTH);
      await sleep(40);  // a couple of real frames
    }
    simSec += waveT;
    if (r.st === 'wave') { const left = await p.evaluate(() => ({q: __z.G.wq.length, live: __z.api.TH.filter(__z.api.live).map(t => t.k + ':' + t.st + ':' + Math.round(t.p.y))})); stuck.push(`wave ${w + 1} still running after ${waveT} s: ${JSON.stringify(left).slice(0, 300)}`); break; }
    if (r.st === 'clear') await p.evaluate(() => __z.sim(4));
    const s = await p.evaluate(STATS);
    if (s.nan.length) stuck.push(`wave ${s.wave}: NaN in ${s.nan.join(', ')}`);
    if (bossT > 300) stuck.push(`wave ${s.wave}: a boss stayed alive ${bossT} s`);
    if (s.wave % 5 === 0 || s.st === 'over') heaps.push([s.wave, await heapMB(p)]);
    rows.push({...s, waveT, maxTH});
    if (s.st === 'over') break;
    if (s.st !== 'base' || !s.base) { stuck.push(`wave ${s.wave}: after the wave the state is ${s.st}, base screen shown ${s.base}`); break; }
  }
  const last = rows.at(-1) || {}, first = rows[0] || {};
  console.log(`\n${name}: reached wave ${last.wave} (${last.st}), ${Math.round(simSec / 60)} game-minutes in ${Math.round((Date.now() - T0) / 1000)} s`);
  console.log('  wave/integrity%/cash/defs/waveSec/maxTracks | objs geo tex orphanGeo th pops drones shots feed');
  for (const x of rows) console.log(`  ${x.wave}/${x.integ}/${x.cash}/${x.defs}/${x.waveT}/${x.maxTH} | ${x.objs} ${x.geo} ${x.tex} ${x.orphan.n} ${x.th} ${x.pops} ${x.drones} ${x.shots} ${x.feed}`);
  if (last.orphan?.n) console.log('  orphaned geometries by where they were made:', JSON.stringify(last.orphan.top));
  console.log('  heap MB after GC by wave:', heaps.map(h => h.join(':')).join('  '));
  ok(!stuck.length, `${name}: no stuck states or NaNs` + (stuck.length ? '\n  ' + stuck.join('\n  ') : ''));
  // leak checks: compare the second base screen with the last one (the first waves add defences and the bunker, so start from wave 10 when we have it)
  const ref = rows.find(x => x.wave >= 10) || first;
  if (rows.length > 6) {
    ok(last.th <= 2, `${name}: no dead tracks left in the list at the base screen (${last.th})`);
    ok(last.objs - ref.objs < 400 + 40 * (last.defs - ref.defs), `${name}: scene objects ${ref.objs} at wave ${ref.wave} -> ${last.objs} at wave ${last.wave} (defences ${ref.defs} -> ${last.defs})`);
    ok(last.orphan.n - ref.orphan.n < 20, `${name}: GPU geometries left behind (uploaded, not disposed, out of the scene) ${ref.orphan.n} at wave ${ref.wave} -> ${last.orphan.n} at wave ${last.wave} (all uploaded: ${ref.geo} -> ${last.geo}, textures ${ref.tex} -> ${last.tex})`);
    const h0 = heaps.find(h => h[0] >= 10) || heaps[0], h1 = heaps.at(-1);
    if (h0 && h1 && h1 !== h0) ok(h1[1] - h0[1] < 25, `${name}: JS heap ${h0[1]} MB at wave ${h0[0]} -> ${h1[1]} MB at wave ${h1[0]}`);
  }
  // after the run: Try again starts a clean game, then the menu and Classic still work
  if (last.st === 'over') {
    await p.click('#zagain'); await sleep(400);
    const a = await p.evaluate(() => ({st: __z.G.state, wave: __z.G.wave, cash: __z.G.cash, defs: __z.Z.def.D.length, th: __z.api.TH.length, start: __z.Z.diff().start, hp: __z.integrity()}));
    ok(a.st === 'base' && a.wave === 0 && a.cash === a.start && a.defs === 0 && a.th === 0 && a.hp.hp === a.hp.max, `${name}: Try again starts clean (${JSON.stringify(a)})`);
  }
  await p.evaluate(() => __z.api.startDemo()); await sleep(300);
  await p.evaluate(() => { document.querySelector('#gmode button[data-m="classic"]').click(); }); await sleep(100);
  await p.click('#play'); await sleep(600);
  const c = await p.evaluate(() => { const {api} = __z; __z.sim(40); return {zon: __z.Z.on, wave: api.wave, th: api.TH.length, kinds: [...new Set(api.TH.map(t => t.k || (t.jet ? 'jet' : 'shahed')))], sites: api.SITES.length, hp: api.SITES.map(s => s.max), aw: api.AW, rrs: api.RRS.length, zhud: document.getElementById('zhud').hidden, base: document.getElementById('zbase').hidden}; });
  ok(!c.zon && c.wave >= 1 && c.sites === 3 && c.hp.every(h => h === 3) && c.aw === 3000 && c.rrs === 3 && c.zhud && c.base && c.kinds.every(k => k === 'shahed' || k === 'jet'), `${name}: Classic after Zombies: ${JSON.stringify(c)}`);
  await p.evaluate(() => __z.api.startDemo()); await sleep(200);
  await p.evaluate(() => { document.querySelector('#gmode button[data-m="z"]').click(); }); await p.click('#play'); await sleep(400);
  const z2 = await p.evaluate(() => ({st: __z.G.state, on: __z.Z.on, wave: __z.G.wave, sites: __z.api.SITES.length, defs: __z.Z.def.D.length}));
  ok(z2.on && z2.st === 'base' && z2.wave === 0 && z2.sites === 3 && z2.defs === 0, `${name}: back to Zombies starts a fresh game (${JSON.stringify(z2)})`);
  ok(!errs.length, `${name}: no page errors` + (errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : ''));
  summary.push(`${name}: wave ${last.wave} ${last.st}, ${Math.round(simSec / 60)} game-min, heap ${heaps.map(h => h[1]).join('/')} MB`);
  await p.close();
}
console.log('\n' + summary.join('\n'));
server.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
