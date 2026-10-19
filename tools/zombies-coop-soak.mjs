// Zombies co-op soak: a host and two clients (one browser, ?netloop transport) play many waves through the real base screens and ready-up.
// The host's scripted player shops and runs down tracks (time fast-forwarded a few times over real time); the clients detonate on tracks
// as they see them and buy repairs. Watches every page for errors, the tracks / purse / site hit points / wave staying in sync, ready-up
// that never starts the wave, snapshot size, the clients' mirror maps, scene objects and JS heap over time, and that the solo-only features
// (slow-mo, cinematic cams, pause behind the menu) stay off in co-op. Run: node tools/zombies-coop-soak.mjs [--waves 14] [--delay 40]
import {serve, launch, open, sleep, newWindow} from './zlib.mjs';
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const WAVES = +arg('--waves', 14), DELAY = +arg('--delay', 40);
const {server, origin} = await serve();
const browser = await launch({w: 960, h: 540});
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const URL = `${origin}/games/interceptor/?mode=zombies&netloop=${DELAY}`;
async function page(name) {
  const errs = [], p = await open(browser, URL, errs, {page: await newWindow(browser), w: 960, h: 540});
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'wave', zdiff: 1})));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z && window.__z.net, {timeout: 60000});
  await p.$eval('#zname', (e, n) => { e.value = n; }, name);
  return {p, errs, name};
}
const until = async (P, fn, arg, ms = 15000) => { try { await P.p.waitForFunction(fn, {timeout: ms, polling: 100}, arg); return true; } catch (e) { return false; } };
const ev = (P, fn, arg) => P.p.evaluate(fn, arg);
async function heapMB(P) { const s = await P.p.target().createCDPSession(); await s.send('HeapProfiler.collectGarbage'); const h = await s.send('Runtime.getHeapUsage'); await s.detach(); return +(h.usedSize / 1048576).toFixed(1); }
const STATS = () => { const {api, G, Z} = __z, n = __z.net.n; let objs = 0; api.scene.traverse(() => objs++);
  return {st: G.state, wave: G.wave, cash: Math.round(G.cash), hp: api.SITES.map(s => Math.ceil(s.hp)), live: api.TH.filter(api.live).map(t => t.id).sort((a, b) => a - b), th: api.TH.length, objs,
    geo: api.renderer.info.memory.geometries, defs: Z.def.D.length, shots: Z.def.shots.length, pops: G.pops.length, ts: n?.ts.size ?? -1, tm: n?.tm.size ?? -1, evs: n?.evs.length ?? -1, out: n?.out.length ?? -1, pil: n?.pil.size ?? -1,
    snap: window.__snap || null, tsc: Z.tsc, cine: !!Z.cine, fx: Z.fxState().cine, on: G.on, rows: __z.net.rows().length,
    nan: !Number.isFinite(G.cash) || api.SITES.some(s => !Number.isFinite(s.hp)) || api.TH.some(t => !Number.isFinite(t.p.x + t.p.y + t.p.z)) };
};

const H = await page('Hosty'), A = await page('Ash'), B = await page('Bea'), all = [H, A, B];
await H.p.click('#zhost');
ok(await until(H, () => __z.G.on && __z.G.state === 'base' && __z.net.n?.code), 'Host: co-op game up');
const code = await ev(H, () => __z.net.n.code);
for (const C of [A, B]) { await C.p.$eval('#zcode', (e, c) => { e.value = c; }, code); await C.p.click('#zjoin'); }
ok(await until(H, () => __z.net.rows().length === 3), `Lobby: 3 pilots in ${code}`);
for (const C of [A, B]) await until(C, () => __z.G.on && __z.G.state === 'base');
// the host's snapshot size, measured where it is sent
await ev(H, () => { const r = __z.net.n.r, o = r.presence.bind(r); window.__snap = {n: 0, max: 0, sum: 0, last: 0, T: 0};
  r.presence = P => { if (P && P.g) { const L = JSON.stringify(P).length, s = window.__snap; s.n++; s.sum += L; s.last = L; s.max = Math.max(s.max, L); s.T = Math.max(s.T, P.g.T.length); } return o(P); }; });

const SHOP = () => { const {api, G, Z} = __z, def = Z.def, PRIO = ['sam', 'gepard', 'rack', 'flak', 'idome', 'gdome', 'radar', 'aid'];
  for (const k of PRIO) { const i = G.cards.findIndex(c => c.k === k), it = __z.ITEMS[k]; if (i < 0 || G.wave + 1 < it.from) continue; const price = it.type === 'perk' ? Z.perkPrice(k) : it.price; if (G.cash < price * 1.2) continue;
    if (it.type === 'perk') { if (!Z.perkMaxed(k)) Z.base.buy(i); continue; }
    const j = def.SLOTS.findIndex((_, j) => def.slotFree(j)); if (j < 0) continue; Z.base.buy(i); if (G.placing) Z.base.place(j); }
  for (const d of def.D) Z.base.upgrade(d.id, d.type === 'rack' ? 'tier' : 'lvl'); };
const rows = [], issues = [];
let simSec = 0;
for (let w = 0; w < WAVES; w++) {
  const s0 = await Promise.all(all.map(P => ev(P, STATS)));
  if (s0.some(s => s.st !== 'base')) { issues.push(`before wave ${w + 1}: states ${s0.map(s => s.st)}`); break; }
  await ev(H, SHOP); await sleep(300);
  // a client spends from the shared purse: a repair if anything is damaged, else nothing
  await ev(A, () => { const b = document.querySelector('[data-tab="sites"]'); b?.click(); setTimeout(() => document.querySelector('[data-rep]:not([disabled])')?.click(), 50); });
  await sleep(400);
  const c1 = await Promise.all(all.map(P => ev(P, () => Math.round(__z.G.cash))));
  if (!(c1[0] === c1[1] && c1[1] === c1[2])) { await sleep(800); const c2 = await Promise.all(all.map(P => ev(P, () => Math.round(__z.G.cash)))); if (!(c2[0] === c2[1] && c2[1] === c2[2])) issues.push(`base ${w}: purse differs ${c2}`); }
  // ready-up through the real buttons, clients first
  for (const P of [A, B, H]) await ev(P, () => document.getElementById('zgo')?.click());
  const started = await Promise.all(all.map(P => until(P, w => __z.G.state === 'wave' && __z.G.wave === w, w + 1, 15000)));
  if (!started.every(Boolean)) { issues.push(`wave ${w + 1}: ready-up did not start it on ${all.filter((_, i) => !started[i]).map(P => P.name)} (${JSON.stringify(await Promise.all(all.map(P => ev(P, () => [__z.G.state, __z.G.wave, __z.net.rows().map(r => r[3]).join('')]))))})`); break; }
  // the wave: host fast-forwards 1 s at a time; every few seconds the clients try a burst on what they see; sync is sampled with the host paused
  let t = 0, syncWorst = 0, syncLag = 0, syncMiss = 0, samples = 0;
  while (t < 1500) {
    const st = await ev(H, () => { const {api, G} = __z; __z.sim(1); if (__z.integrity().hp < __z.integrity().max * .5) api.SITES.forEach(s => { if (s.hp > 0) s.hp = s.max; });
      if (Math.random() < .12 && api.player.dead <= 0) __z.botKill(.8); if (api.player.dead > 0 && Math.random() < .3) api.launch(); return G.state; });
    t += 1; simSec += 1;
    if (st !== 'wave') break;
    if (t % 6 === 0) for (const C of [A, B]) await ev(C, () => { const {api, Z} = __z, me = api.player, u = api.TH.filter(api.live).sort((a, b) => a.p.distanceTo(a.aim) - b.p.distanceTo(b.aim))[0]; if (!u || !me || me.dead > 0) { if (me && me.dead > 0) api.launch(); return; } me.p.copy(u.p).addScaledVector(u.v.clone().normalize(), -1); me.v.copy(u.v); Z.detonate(); });
    if (t % 15 === 0) { await sleep(700); samples++;
      const h = await ev(H, () => __z.api.TH.filter(__z.api.live).map(t => [t.id, t.p.x, t.p.y, t.p.z, t.v.length()]));
      for (const C of [A, B]) { const c = new Map((await ev(C, () => __z.api.TH.filter(__z.api.live).map(t => { const q = t.np || t.p; return [t.id, q.x, q.y, q.z]; }))).map(a => [a[0], a]));
        const miss = [];
        for (const a of h) { const b = c.get(a[0]); if (!b) { miss.push(a[0]); continue; } const g = Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]); syncWorst = Math.max(syncWorst, g); syncLag = Math.max(syncLag, g / Math.max(a[4], 5));
          if (g / Math.max(a[4], 5) > 1.5) { const hd = await ev(H, id => { const t = __z.api.TH.find(u => u.id === id); return t && {k: t.k, st: t.st, p: t.p.toArray().map(Math.round), v: t.v.toArray().map(Math.round), frz: t.frz, grp: t.grp}; }, a[0]);
            const cd = await ev(C, id => { const t = __z.api.TH.find(u => u.id === id); return t && {k: t.k, st: t.st, p: t.p.toArray().map(Math.round), np: t.np?.toArray().map(Math.round), nv: t.nv?.toArray().map(Math.round), frz: t.frz, net: t.net, snap: __z.net.n.tm.has(id)}; }, a[0]);
            issues.push(`wave ${w + 1}: T${a[0]} ${Math.round(g)} m apart on ${C.name}: host ${JSON.stringify(hd)} client ${JSON.stringify(cd)}`); } }
        if (miss.length) { await sleep(1500);  /* a track missing on a client: only a desync if it is still missing there while the host still has it */
          const still = await ev(H, ids => ids.filter(id => __z.api.TH.some(t => t.id === id && __z.api.live(t))), miss), cs = await ev(C, () => __z.api.TH.filter(__z.api.live).map(t => t.id));
          const lost = still.filter(id => !cs.includes(id)); syncMiss += lost.length; if (lost.length) issues.push(`wave ${w + 1}: ${C.name} lacks host tracks ${lost} for 1.5 s+ (${JSON.stringify(await ev(C, ids => ids.map(id => { const t = __z.api.TH.find(u => u.id === id); return t ? [id, t.st] : [id, 'absent', __z.net.n.ts.has(id)]; }), lost))})`); } } }
    else await sleep(100);
  }
  if (t >= 1500) { issues.push(`wave ${w + 1}: still running after ${t} s`); break; }
  const back = await Promise.all(all.map(P => until(P, w => (__z.G.state === 'base' || __z.G.state === 'over') && __z.G.wave === w, w + 1, 20000)));
  if (!back.every(Boolean)) { issues.push(`wave ${w + 1}: not back on the base screen on ${all.filter((_, i) => !back[i]).map(P => P.name)}`); break; }
  await sleep(500);
  const s = await Promise.all(all.map(P => ev(P, STATS)));
  if (s.some(x => x.nan)) issues.push(`wave ${w + 1}: NaN on ${all.filter((_, i) => s[i].nan).map(P => P.name)}`);
  if (s.some(x => x.tsc !== 1 || x.cine || x.fx)) issues.push(`wave ${w + 1}: solo-only effects on in co-op: ${JSON.stringify(s.map(x => [x.tsc, x.cine, x.fx]))}`);
  if (!(s[0].cash === s[1].cash && s[1].cash === s[2].cash) || s[0].hp.join() !== s[1].hp.join() || s[0].hp.join() !== s[2].hp.join()) issues.push(`wave ${w + 1}: purse/sites differ ${JSON.stringify(s.map(x => [x.cash, x.hp]))}`);
  const heaps = (w + 1) % 4 === 0 ? await Promise.all(all.map(heapMB)) : null;
  rows.push({w: w + 1, t, syncWorst: +syncWorst.toFixed(1), syncLag: +syncLag.toFixed(2), syncMiss, samples, s, heaps});
  console.log(`  wave ${w + 1}: ${t} s, ${s[0].st}, purse $${s[0].cash}, sites ${s[0].hp}, defs ${s[0].defs} | sync worst ${syncWorst.toFixed(1)} m (${syncLag.toFixed(2)} s of flight), ${syncMiss} missing of ${samples} samples | snapshot max ${s[0].snap?.max} B (last ${s[0].snap?.last}, max tracks ${s[0].snap?.T}) | objs ${s.map(x => x.objs)} geo ${s.map(x => x.geo)} th ${s.map(x => x.th)} | client ts/tm/out ${[1, 2].map(i => `${s[i].ts}/${s[i].tm}/${s[i].out}`)} host evs ${s[0].evs}${heaps ? ' | heap MB ' + heaps : ''}`);
  if (s[0].st === 'over') break;
}
// the clients' bursts (made where they see the tracks) count on the host: kills on the roster
{ const R = await ev(H, () => __z.net.rows()); ok(R.filter(r => r[1] !== 'Hosty').reduce((a, r) => a + r[2], 0) >= 3, `Co-op: the clients' bursts count (${R.map(r => r[1] + ' ' + r[2]).join(', ')} kills)`); }
// solo-only features in a live co-op wave: no slow-mo after a multi-kill, no cinematic cam, the menu doesn't pause the game
const solo = await ev(H, () => { const {api, G, Z} = __z; if (G.state !== 'base') return null; __z.cont(); return true; });
if (solo) {
  for (const P of [A, B]) await ev(P, () => document.getElementById('zgo')?.click());
  await until(H, () => __z.G.state === 'wave');
  const r = await ev(H, () => { const {api, Z} = __z; Z.fxTest.slowmo(.2, 1, .5); const tsc = Z.tsc; Z.fxTest.cine('impact', null, api.SITES[0].aims[0], 'X', 'y'); const cine = Z.fxState().cine; return {tsc, cine}; });
  // the host's wave clock over 1.5 s with the menu shut, then open (headless frames are slow, so compare the two rather than with real time)
  const clock = async open => { await ev(H, o => __z.api.showMenu(o), open); const a = await ev(H, () => __z.G.wt); await sleep(1500); const b = await ev(H, () => __z.G.wt); return +(b - a).toFixed(2); };
  const shut = await clock(false), menu = await clock(true); await ev(H, () => __z.api.showMenu(false));
  await ev(A, () => __z.api.showMenu(true)); await sleep(300); const ca = await ev(A, () => ({p: __z.api.player.p.y, wt: __z.G.wt})); await sleep(1500); const cb = await ev(A, () => ({p: __z.api.player.p.y, wt: __z.G.wt})); await ev(A, () => __z.api.showMenu(false));
  ok(r.tsc === 1 && !r.cine, `Co-op: slow-mo and cinematic cams stay off (time x${r.tsc}, cine ${r.cine})`);
  ok(menu > shut * .4 && cb.wt > ca.wt, `Co-op: the menu does not pause the game (host wave clock +${shut} s menu shut, +${menu} s menu open; a client behind its menu still follows the host: ${ca.wt} -> ${cb.wt})`);
}
const last = rows.at(-1), first = rows.find(r => r.w >= 4) || rows[0];
ok(!issues.length, 'Co-op soak: no stuck ready-up, desyncs or NaNs' + (issues.length ? '\n  ' + issues.join('\n  ') : ''));
if (last && first && last !== first) {
  /* the client side is its mirrored state (t.np, dead-reckoned from the snapshots), not the smoothed mesh position, which trails it when headless frames are slow;
     the host runs slower than real time under load while the clients dead-reckon in real time, so the gap is judged in seconds of the track's own flight */
  ok(rows.every(r => r.syncLag < 1.5 && !r.syncMiss), `Co-op: tracks in sync, worst gap host vs client ${Math.max(...rows.map(r => r.syncWorst))} m = ${Math.max(...rows.map(r => r.syncLag))} s of flight, ${rows.reduce((a, r) => a + r.syncMiss, 0)} tracks missing on a client`);
  ok(last.s[0].snap.max < 60000, `Co-op: snapshot stays bounded (max ${last.s[0].snap.max} B with up to ${last.s[0].snap.T} tracks)`);
  ok([1, 2].every(i => last.s[i].ts <= last.s[i].th + 5 && last.s[i].tm <= last.s[i].th + 400 && last.s[i].out <= 64), `Co-op: client mirror maps bounded (ts/tm/out ${[1, 2].map(i => `${last.s[i].ts}/${last.s[i].tm}/${last.s[i].out}`)})`);
  ok(last.s.every((x, i) => x.objs - first.s[i].objs < 400), `Co-op: scene objects ${first.s.map(x => x.objs)} at wave ${first.w} -> ${last.s.map(x => x.objs)} at wave ${last.w}`);
  const hr = rows.filter(r => r.heaps); if (hr.length > 1) ok(hr.at(-1).heaps.every((h, i) => h - hr[0].heaps[i] < 30), `Co-op: JS heap ${hr[0].heaps} MB at wave ${hr[0].w} -> ${hr.at(-1).heaps} at wave ${hr.at(-1).w}`);
}
for (const P of all) ok(!P.errs.length, `${P.name}: no errors` + (P.errs.length ? '\n  ' + [...new Set(P.errs)].slice(0, 6).join('\n  ') : ''));
console.log(`co-op: ${rows.length} waves, ${Math.round(simSec / 60)} game-minutes`);
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
