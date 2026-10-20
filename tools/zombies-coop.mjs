// Zombies co-op harness: one headless Edge, three pages of the game (a host and two clients) talking over the ?netloop transport
// (engine/net.js: a BroadcastChannel stand-in for the room, with a one-way delay), driven through the real menu, base screen and the
// window.__z hooks. Checks: lobby (host / join by code), ready-up and forced start, waves and tracks in sync, a client's kill counts,
// shared purse and shop requests (helper, personal perk, team perk, repair, kill chain), personal swarms (formation and strike over the wire),
// site hit points in sync, launch alerts and warning actions from clients (harden, decoy), late join, a client leaving,
// the host leaving. Run: node tools/zombies-coop.mjs [--shots DIR] [--delay MS]
// The three windows skip their WebGL draw calls (tools/browser.mjs render stub) unless --shots asks for pictures: drawing three full game
// windows can drop a busy machine to ~1 frame a second, and the game loop caps the sim per frame, so every wait here would starve.
import {serve, launch, open, sleep, newWindow} from './zlib.mjs';
const argv = process.argv.slice(2), SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const DELAY = argv.includes('--delay') ? +argv[argv.indexOf('--delay') + 1] : 40;
const {server, origin} = await serve();
const browser = await launch();
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const URL = `${origin}/games/interceptor/?mode=zombies&netloop=${DELAY}`;
// each pilot's own unlocks and loadout (zmeta.js): the host picks the Partisan doctrine, Ash brings the light rack, Bea the lure beacon
const LOADS = {Hosty: {zmeta: {v: 1, g: {night15: 8}}, zload: {doc: 'partisan', kit: []}}, Ash: {zmeta: {v: 1, g: {helpers: 2}}, zload: {doc: 'std', kit: ['lrack']}}, Bea: {zmeta: {v: 1, g: {boss: 2, w10: 2}}, zload: {doc: 'fortress', kit: ['lure']}}};
async function page(name) {
  const errs = [], p = await open(browser, URL, errs, {page: await newWindow(browser, {noRender: !SHOTS})});
  await p.evaluate(lo => localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: 'z', wx: 'clear', zwx: 'menu', zdiff: 1, ...lo})), LOADS[name]);
  await p.reload({waitUntil: 'load'});
  await p.waitForFunction(() => window.__z && window.__z.net, {timeout: 60000});
  await p.$eval('#zname', (e, n) => { e.value = n; }, name);
  return {p, errs, name};
}
const until = async (P, fn, arg, ms = 10000) => { try { await P.p.waitForFunction(fn, {timeout: ms, polling: 50}, arg); return true; } catch (e) { return false; } };
const ev = (P, fn, arg) => P.p.evaluate(fn, arg);
// base-screen buttons are clicked in the page: a snapshot can redraw the panel between puppeteer's lookup and its click
const tap = async (P, sel) => { await P.p.waitForSelector(sel); await ev(P, s => document.querySelector(s).click(), sel); };
const st = P => ev(P, () => { const {G, api} = __z, n = __z.net.n; return {on: G.on, state: G.state, wave: G.wave, cash: G.cash, rows: __z.net.rows(), late: !!n?.late, code: n?.code, me: n?.me,
  hp: api.SITES.map(s => Math.ceil(s.hp)), live: api.TH.filter(api.live).map(t => t.id).sort((a, b) => a - b), defs: __z.Z.def.D.map(d => d.type + '/' + (d.by || '')), perks: {...G.perks}, kills: G.kills}; });

console.log('opening pages');const H = await page('Hosty');console.log('host page up');const A = await page('Ash'), B = await page('Bea');console.log('client pages up');
const all = [H, A, B];

// ---------- lobby: host from the Zombies start menu, two clients join with the code ----------
await H.p.click('#zhost');
ok(await until(H, () => __z.G.on && __z.G.state === 'base' && __z.net.n?.code), 'Host: Host co-op starts a Zombies game on the base screen');
const code = (await st(H)).code;
for (const C of [A, B]) { await C.p.$eval('#zcode', (e, c) => { e.value = c; }, code); await C.p.click('#zjoin'); }
ok(await until(H, () => __z.net.rows().length === 3), `Lobby: two clients joined game ${code.toUpperCase()}`);
for (const C of [A, B]) ok(await until(C, () => __z.G.on && __z.G.state === 'base' && __z.net.rows().length === 3 && !document.getElementById('zbase').hidden), `${C.name}: on the base screen with the 3-pilot roster`);
{ const s = await Promise.all(all.map(st)); ok(s.every(x => x.cash === s[0].cash), `Purse: everyone sees the same shared purse ($${s.map(x => x.cash).join(' / ')})`);
  ok(s[1].rows.map(r => r[1]).join() === 'Hosty,Ash,Bea', `Roster on a client: ${s[1].rows.map(r => r[1]).join(', ')}`); }
if (SHOTS) await B.p.screenshot({path: SHOTS + '/coop-base.png'});
// loadouts: the host's doctrine is everyone's; each pilot's kit is their own, and a kit helper is in the whole team's shop
{ for (const P of all) await until(P, () => __z.Z.meta.teamKit().sort().join() === 'lrack,lure');  // each screen has the whole roster's kit once the host's snapshot carrying it arrives
  const lo = await Promise.all(all.map(P => ev(P, () => ({doc: __z.Z.meta.doc().n, own: __z.Z.meta.load().doc, team: __z.Z.meta.teamKit().sort().join(), cards: __z.G.cards.filter(c => __z.ITEMS[c.k].kit).map(c => c.k).join(), strip: document.querySelector('#zbase .zcoop span')?.textContent || ''}))));
  ok(lo.every(x => x.doc === 'Partisan') && lo[2].own === 'fortress', `Doctrine: the host's Partisan on every screen (Bea's own pick, ${lo[2].own}, waits for her solo games); strip "${lo[1].strip}"`);
  ok(lo.every(x => x.team === 'lrack,lure'), `Team kit on every screen: ${lo.map(x => x.team).join(' / ')}`);
  ok(lo[0].cards === 'lrack' && lo[1].cards === 'lrack' && lo[2].cards === 'lrack,lure', `Kit in the shops: host [${lo[0].cards}], Ash [${lo[1].cards}], Bea [${lo[2].cards}] (the lure beacon is Bea's own perk)`); }

// ---------- ready-up: the wave waits for everyone ----------
await tap(H, '#zgo'); await tap(A, '#zgo'); await sleep(600);
ok((await st(H)).state === 'base' && await ev(H, () => document.getElementById('zgo').textContent.includes('2/3')), 'Ready-up: 2 of 3 ready, the wave has not started (button reads 2/3)');
await tap(B, '#zgo');
ok(await until(H, () => __z.G.state === 'wave' && __z.G.wave === 1), 'Ready-up: the third pilot readies, wave 1 starts on the host');
for (const C of [A, B]) ok(await until(C, () => __z.G.state === 'wave' && __z.G.wave === 1 && document.getElementById('zbase').hidden), `${C.name}: wave 1 started (base screen closed)`);

// ---------- waves sync: the same tracks, close to where the host has them ----------
await ev(H, () => __z.sim(30)); await sleep(800);
{ const sync = async () => { const h = await ev(H, () => __z.api.TH.filter(__z.api.live).map(t => [t.id, t.p.x, t.p.y, t.p.z])); const c = await ev(A, () => __z.api.TH.filter(__z.api.live).map(t => [t.id, t.p.x, t.p.y, t.p.z, t.k]));
    const m = new Map(c.map(a => [a[0], a])); let worst = 0; for (const a of h) { const b = m.get(a[0]); worst = Math.max(worst, b ? Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]) : 1e9); } return {h: h.map(a => a[0]), c: c.map(a => a[0]), kinds: c.map(a => a[4]), worst}; };
  const s = await sync();
  ok(s.h.length >= 2 && s.h.join() === s.c.join(), `Waves sync: host tracks [${s.h}] = client tracks [${s.c}] (${s.kinds})`);
  ok(s.worst < 30, `Waves sync: worst track position gap host vs client ${s.worst.toFixed(1)} m (snapshots 10 Hz, ${DELAY} ms delay, dead reckoning)`); }

// a screenshot of another pilot's drone with its name tag: Ash parks 18 m in front of the host's camera (held idle so it stays put)
if (SHOTS) {
  const at = await ev(H, () => { const c = __z.api.camera, f = new __z.api.THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion); return [c.position.x + f.x * 18, c.position.y + f.y * 18 + 1, c.position.z + f.z * 18]; });
  await ev(A, at => { const me = __z.api.player; __z.net.n.late = true; me.p.set(...at); me.v.set(0, 0, 0); }, at); await sleep(700);
  await H.p.screenshot({path: SHOTS + '/coop-host-sees-ash.png'});
  await ev(A, () => { __z.net.n.late = false; __z.api.launch(); });
}

// ---------- a client's kill counts: Ash detonates 1 m behind a track as Ash sees it; the host rolls it and pays the purse ----------
{ const h0 = await st(H);
  const k = await ev(A, () => { const {api, Z} = __z, me = api.player, t = api.TH.filter(api.live).sort((a, b) => a.p.y - b.p.y)[0]; if (!t || me.dead > 0) return null; me.p.copy(t.p).addScaledVector(t.v.clone().normalize(), -1); me.v.copy(t.v); Z.detonate(); return t.id; });
  ok(k != null, `Ash detonates behind T${k}`);
  ok(await until(H, id => !__z.api.TH.some(t => t.id === id && __z.api.live(t)), k), `Host: T${k} is down`);
  ok(await until(A, () => /^HIT/.test(__z.G.det?.txt || '')), 'Ash: the host\'s result comes back as a HIT readout');
  const h1 = await st(H), ash = h1.rows.find(r => r[1] === 'Ash');
  ok(ash && ash[2] === 1 && h1.kills.p === h0.kills.p + 1 && h1.cash > h0.cash, `Kill counts: Ash 1 kill on the roster, pilot kills ${h0.kills.p} -> ${h1.kills.p}, purse $${h0.cash} -> $${h1.cash}`);
  ok(await until(B, id => !__z.api.TH.some(t => t.id === id && __z.api.live(t)) && __z.net.rows().find(r => r[1] === 'Ash')?.[2] === 1, k), 'Bea: sees the track go down and Ash\'s kill on the roster');
  if (SHOTS) { await sleep(300); await A.p.screenshot({path: SHOTS + '/coop-ash-kill.png'}); } }

// ---------- the host clears the wave; everyone goes back to the base screen ----------
await ev(H, () => { for (let i = 0; i < 400 && __z.G.state === 'wave'; i++) { __z.sim(.5); if (__z.api.player.dead <= 0) __z.botKill(.8); } __z.sim(4); });
ok(await until(H, () => __z.G.state === 'base'), 'Host: wave 1 cleared, base screen');
for (const C of [A, B]) ok(await until(C, () => __z.G.state === 'base' && !document.getElementById('zbase').hidden && __z.G.wave === 1), `${C.name}: back on the base screen after wave 1`);

// ---------- sorties (zsortie.js): Ash flies out while the others stay; the host owns the convoys, the cuts and the purse ----------
{ const cv = await ev(H, () => { const t = __z.so.W.list.find(u => u.t === 'convoy'); if (!t) return null; t.halt = 1e9; for (const u of __z.so.W.list) { for (const q of u.pats) q.st = 'dead'; for (const q of u.parts) if (q.aa) q.lock = -1e9; } __z.so.W.ver++;
    const k = t.cargo.k; return {id: t.id, k, n: __z.G.next.list.filter(s => s.split(':')[0] === k).length, fog: __z.so.fog.count()}; });
  ok(cv && await until(A, id => __z.so.W.list.some(t => t.id === id), cv.id), `Sorties: the host's convoy (${cv?.k}) is in Ash's world too`);
  ok(await ev(A, () => __z.so.launch()) && await ev(H, () => !__z.so.S.on && __z.G.state === 'base'), 'Sorties: Ash launches a sortie; the host stays on the base screen');
  await ev(A, id => { const so = __z.so, t = so.W.list.find(u => u.id === id); so.fly(t.x, t.z + 250, 90, 100); }, cv.id); await sleep(400);
  await ev(A, id => { const so = __z.so, t = so.W.list.find(u => u.id === id); for (const q of t.parts.filter(x => x.main)) so.drop(q.x, q.y + 40, q.z); so.hold(3.5); }, cv.id);
  ok(await until(H, id => __z.so.W.list.find(u => u.id === id)?.dead, cv.id), 'Sorties: Ash\'s bombs reach the host, which destroys the convoy');
  ok(await until(A, () => __z.so.S.carry > 0), `Sorties: Ash carries the salvage the host paid out ($${await ev(A, () => __z.so.S.carry)})`);
  const n1 = await ev(H, k => __z.G.next.list.filter(s => s.split(':')[0] === k).length, cv.k);
  ok(n1 < cv.n && await until(B, n => __z.G.next.list.length >= 0 && document.querySelector('.zfc')?.textContent.includes('Sorties'), 0), `Sorties: next wave's ${cv.k} ${cv.n} → ${n1}, and Bea's forecast shows the strike`);
  const c0 = (await st(H)).cash, carry = await ev(A, () => __z.so.S.carry);
  await ev(A, () => { const f = __z.api.FOBS[1], so = __z.so; so.fly(f.x, f.z + 150, 60, 100); so.hold(.5); so.finish(); });
  ok(await until(H, c => __z.G.cash >= c, c0 + carry), `Sorties: back inside the line, Ash banks $${carry} into the shared purse`);
  ok(await until(A, () => !__z.so.S.on && !document.getElementById('zbase').hidden), 'Sorties: Ash is back on the base screen');
  await ev(A, () => __z.Z.base.setTab('shop'));
  ok(await until(B, f => __z.so.fog.count() > f && __z.so.W.list.find(t => t.t === 'convoy')?.dead, cv.fog), 'Fog and the enemy side: what Ash saw and destroyed shows for Bea too'); }

// ---------- shop on the shared purse: a helper (Ash), a personal perk and a team perk (Bea), a repair (Ash) ----------
{ await ev(H, () => { __z.G.cash = 6000; }); await until(A, () => __z.G.cash === 6000); await until(B, () => __z.G.cash === 6000);
  await ev(A, () => { const i = __z.G.cards.findIndex(c => c.k === 'rack'); document.querySelector(`[data-buy="${i}"]`).click(); });
  await A.p.waitForSelector('[data-slot]'); await tap(A, '[data-slot]');
  ok(await until(H, () => __z.Z.def.D.length === 1 && __z.Z.def.D[0].by === 'Ash' && __z.G.cash === 5300), 'Shop: Ash buys a drone rack, the host places it (bought by Ash), purse $6,000 -> $5,300');
  ok(await until(B, () => __z.Z.def.D.length === 1 && __z.Z.def.D[0].type === 'rack' && __z.G.cash === 5300), 'Shop: Bea sees the rack and the new purse');
  const warhead = async () => ev(B, () => { const i = __z.G.cards.findIndex(c => c.k === 'warhead'); document.querySelector(`[data-buy="${i}"]`)?.click(); });
  await warhead();
  ok(await until(B, () => __z.G.perks.warhead === 1 && __z.api.LETH === __z.api.S.mod.leth + 1 && __z.G.cash === 4600), 'Shop: Bea buys Bigger warhead (personal): her warhead radius +1 m, purse -$700');
  const hp = await st(H), ap = await st(A);
  ok(!hp.perks.warhead && !ap.perks.warhead, 'Shop: the host and Ash do not get Bea\'s personal perk');
  await ev(B, () => { const i = __z.G.cards.findIndex(c => c.k === 'radar'); document.querySelector(`[data-buy="${i}"]`)?.click(); });
  ok(await until(H, () => __z.G.perks.radar === 1) && await until(A, () => __z.G.perks.radar === 1 && __z.Z.radarK() === 1.3), 'Shop: Bea buys Long-range radar, a team perk: the host and Ash have it too');
  await tap(A, '[data-tab="shop"]'); await ev(A, () => { const i = __z.G.cards.findIndex(c => c.k === 'freeze'); document.querySelector(`[data-buy="${i}"]`)?.click(); });
  ok(await until(A, () => __z.G.perks.freeze === 1 && __z.G.ch.freeze === 1) && await until(H, () => __z.G.cash === 3200), 'Shop: Ash buys Freeze (an active perk, personal): one charge, purse -$900');
  await ev(H, () => { __z.api.SITES[0].hp -= 120; });
  ok(await until(A, () => __z.api.SITES[0].hp === __z.api.SITES[0].max - 120), 'Site HP sync: damage on the host shows on the clients');
  const c0 = (await st(H)).cash;
  await tap(A, '[data-tab="sites"]'); await tap(A, '[data-rep="0"]');
  ok(await until(H, () => __z.api.SITES[0].hp === __z.api.SITES[0].max) && (await st(H)).cash === c0 - 360, `Shop: Ash repairs the substation (+120 hp, $${c0} -> $${(await st(H)).cash})`);
  ok(await until(B, () => __z.api.SITES[0].hp === __z.api.SITES[0].max), 'Site HP sync: the repair shows on Bea\'s screen');
  if (SHOTS) { await tap(A, '[data-tab="armory"]'); await sleep(400); await A.p.screenshot({path: SHOTS + '/coop-shop.png'}); }
  // the new purchases go through the host too: a kit helper, a kit perk, a forged perk request, opening a position, a refit
  await ev(H, () => { __z.G.cash = 20000; }); await until(A, () => __z.G.cash === 20000);
  await tap(A, '[data-tab="shop"]'); await ev(A, () => { const i = __z.G.cards.findIndex(c => c.k === 'lrack'); document.querySelector(`[data-buy="${i}"]`).click(); });
  await A.p.waitForSelector('[data-slot]'); await tap(A, '[data-slot]');
  ok(await until(H, () => __z.Z.def.D.some(d => d.type === 'lrack' && d.by === 'Ash') && __z.G.cash === 19600), 'Kit helper: Ash places a light rack ($400) on the host');
  await tap(B, '[data-tab="shop"]'); await ev(B, () => { const i = __z.G.cards.findIndex(c => c.k === 'lure'); document.querySelector(`[data-buy="${i}"]`).click(); });
  ok(await until(H, () => __z.net.n.perks[Object.keys(__z.net.n.names).find(k => __z.net.n.names[k] === 'Bea')]?.lure === 1) && await until(B, () => __z.G.perks.lure === 1 && __z.G.ch.lure === 1), 'Kit perk: Bea buys her lure beacon (one charge)');
  await ev(A, () => __z.Z.req(['p', 'lure'])); await sleep(800);
  ok(await ev(H, () => !__z.net.n.perks[Object.keys(__z.net.n.names).find(k => __z.net.n.names[k] === 'Ash')]?.lure), 'Kit perk: a forged request from Ash for the lure beacon (not in his kit) is refused');
  await tap(A, '[data-tab="sites"]'); await tap(A, '[data-ex="14"]');
  ok(await until(H, () => __z.G.open[14] && __z.G.exp === 1) && await until(B, () => __z.G.open[14] && __z.Z.def.slotFree(14)), 'Expansion: Ash opens the substation rear position; the host and Bea see it open');
  const rid = await ev(H, () => __z.Z.def.D.find(d => d.type === 'rack').id);
  await tap(B, '[data-tab="armory"]'); await tap(B, `[data-fit="${rid}:range"]`);
  ok(await until(H, id => __z.Z.def.D.find(d => d.id === id)?.refit === 'range', rid) && await until(A, id => __z.Z.def.D.find(d => d.id === id)?.refit === 'range', rid), 'Refit: Bea fits long-range drones to the rack; the host and Ash see it'); }

// ---------- kill chain purchases (zchain.js) go through the host: the host's wave is moved up to unlock the tab, then put back ----------
{ await ev(H, () => { __z.G.wave = 29; __z.G.cash = 30000; }); await until(A, () => __z.G.wave === 29 && __z.G.cash === 30000); await until(B, () => __z.G.wave === 29);
  await tap(A, '[data-tab="chain"]'); await tap(A, '[data-kc="bb:1"]');
  ok(await until(H, () => !!__z.G.kc.boost[1] && __z.G.cash === 24000) && await until(B, () => !!__z.G.kc.boost[1]), 'Kill chain: Ash builds the north boost battery ($6,000) on the host; Bea sees it');
  await tap(B, '[data-tab="chain"]'); await tap(B, '[data-kc="dc:1"]');
  ok(await until(H, () => __z.G.kc.decoys === 1) && await until(A, () => __z.G.kc.decoys === 1), 'Kill chain: Bea buys a decoy site; the host and Ash have it in stock');
  if (SHOTS) await A.p.screenshot({path: SHOTS + '/coop-chain.png'});
  await ev(H, () => { __z.G.wave = 1; }); await until(A, () => __z.G.wave === 1); await until(B, () => __z.G.wave === 1); }

// ---------- personal swarms (zswarm.js): each pilot's own; given here (they're a wave-12 perk), deployed when wave 2 starts ----------
const ashKey = await ev(H, () => Object.keys(__z.net.n.names).find(k => __z.net.n.names[k] === 'Ash'));
await ev(H, k => { const n = __z.net.n; (n.perks[k] ||= {}).swarm = 2; __z.G.perks.swarm = 1; }, ashKey);
ok(await until(A, () => __z.G.perks.swarm === 2), 'Swarm: Ash has Personal swarm level 2 (6 drones), the host level 1 (4)');
// ---------- forced start: the host starts wave 2 with nobody else ready ----------
await tap(H, '#zforce');
ok(await until(H, () => __z.G.state === 'wave' && __z.G.wave === 2), 'Host: Start now begins wave 2 without the others ready');
for (const C of [A, B]) ok(await until(C, () => __z.G.state === 'wave' && __z.G.wave === 2), `${C.name}: wave 2 started`);
ok(await until(A, () => __z.Z.def.D[0]?.mesh?.parent != null), 'Ash: the rack is deployed on the client too');
{ const hostKey = await ev(A, () => __z.net.n.hostPeer);
  ok(await until(H, k => __z.Z.sw.SWS.get(k)?.d.length === 6 && __z.Z.sw.drones.length === 4 && __z.G.spend?.swarm === 300, ashKey), 'Swarm: the host flies its 4 drones and Ash’s 6, upkeep $300 from the purse');
  ok(await until(A, k => __z.Z.sw.drones.length === 6 && __z.Z.sw.SWS.get(k)?.d.length === 4, hostKey), 'Swarm: Ash flies his 6 and sees the host’s 4');
  ok(await until(B, ([a, h]) => __z.Z.sw.SWS.get(a)?.d.length === 6 && __z.Z.sw.SWS.get(h)?.d.length === 4, [ashKey, hostKey], 20000), 'Swarm: Bea sees both swarms ' + await ev(B, ([a, h]) => JSON.stringify([__z.Z.sw.SWS.get(a)?.d.length, __z.Z.sw.SWS.get(a)?.want, __z.Z.sw.SWS.get(a)?.ww, __z.Z.sw.SWS.get(h)?.d.length, __z.Z.sw.SWS.get(h)?.want, __z.G.wave, [...__z.Z.sw.SWS.keys()]]), [ashKey, hostKey]));
  await ev(A, () => __z.Z.sw.command('form#', 1));
  ok(await until(H, k => __z.Z.sw.SWS.get(k)?.form === 1, ashKey) && await until(B, k => __z.Z.sw.SWS.get(k)?.form === 1, ashKey), 'Swarm: Ash picks the wedge; the host and Bea fly his swarm in a wedge (only the formation went over the wire)');
  // a strike from Ash: the host spawns a cloud of Shaheds 1.2 km from Ash's interceptor; Ash strikes it, the host rolls the passes
  await ev(H, k => { const {api, G} = __z, r = __z.net.n.pil.get(k), P = r.d.p; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    for (let i = 0; i < 4; i++) { const t = __z.make('shahed', P.x + i * 30, P.z - 1200); t.p.set(P.x + i * 30, api.gh(P.x, P.z - 1200) + 250, P.z - 1200 - i * 20); t.alt = 250; t.spd = t.cs = 4; } }, ashKey);
  ok(await until(A, () => __z.api.TH.filter(t => __z.api.live(t) && t.k === 'shahed').length >= 4), 'Swarm: Ash sees the Shahed cloud');
  const sk = await ev(A, () => ({ok: __z.Z.sw.command('strike'), ch: __z.Z.sw.mine.ch}));
  ok(sk.ok && sk.ch === 0, 'Swarm: Ash strikes (his one charge spent)');
  ok(await until(H, k => { const s = __z.Z.sw.SWS.get(k); return s && s.ch === 0 && s.d.some(d => d.st === 'strike' || d.boost); }, ashKey), 'Swarm: the host launches Ash’s strike on its copy of his swarm');
  await ev(H, () => __z.sim(12));  /* the host's own clock: its window may get few frames next to the two clients */
  ok(await until(H, k => __z.Z.sw.SWS.get(k)?.kills > 0, ashKey, 5000), 'Swarm: Ash’s strike kills on the host ' + await ev(H, k => { const s = __z.Z.sw.SWS.get(k); return JSON.stringify({n: s.d.length, k: s.kills, st: s.d.map(d => d.st + ':' + Math.round(d.t ? d.t.p.distanceTo(d.p) : -1)), th: __z.api.TH.filter(t => __z.api.live(t)).map(t => t.k + '@' + Math.round(t.p.distanceTo(s.A.p))).slice(0, 8)}); }, ashKey));
  await sleep(1500);
  const cnt = async () => [await ev(H, k => __z.Z.sw.SWS.get(k).d.length, ashKey), await ev(A, () => __z.Z.sw.drones.length)];
  ok(await until(A, n => __z.Z.sw.drones.length === n, (await cnt())[0], 5000), `Swarm: Ash's own drone count follows the host's (host / Ash: ${(await cnt()).join(' / ')})`); }

// ---------- site hit points in a wave: a Shahed hits the fuel depot on the host ----------
{ const r = await ev(H, () => { const {api, G} = __z; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); const s = api.SITES[1], aim = s.aims[0], t = __z.make('shahed', aim.x, aim.z - 300); t.tgt = s; t.aim = aim; t.wps.length = 0; t.p.set(aim.x, aim.y + 120, aim.z - 200); t.st = 'dive';
    for (let i = 0; i < 400 && api.live(t); i++) api.step(1 / 60); return {id: t.id, hp: Math.ceil(s.hp), impacted: !!t.impacted}; });
  ok(r.impacted, `Host: T${r.id} impacted the fuel depot (hp ${r.hp})`);
  for (const C of [A, B]) ok(await until(C, hp => Math.ceil(__z.api.SITES[1].hp) === hp, r.hp), `${C.name}: fuel depot hp ${r.hp} matches the host`);
  ok(await until(A, id => __z.api.TH.every(t => t.id !== id || t.impacted), r.id), 'Ash: saw the impact as an event (track marked impacted)'); }

// ---------- helpers fire on the clients' screens: the host's rack drones show up as shots ----------
{ await ev(H, () => { const {api, G} = __z; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); const s = __z.Z.def.SLOTS[__z.Z.def.D[0].slot]; for (let i = 0; i < 2; i++) { const t = __z.make('shahed', s.x + 300 * i, s.z - 1700); t.p.y = api.gh(t.p.x, t.p.z) + 300; } __z.sim(3); });
  const hs = await ev(H, () => JSON.stringify({shots: __z.Z.def.shots.length, st: __z.G.state, th: __z.api.TH.filter(__z.api.live).length, D: __z.Z.def.D.map(d => [d.type, d.slot, d.ready, d.cap, d.refit, d.shots])}));
  ok(await until(A, () => __z.Z.def.shots.length > 0 && __z.Z.def.shots.some(h => h.tgt)), 'Helpers: the host\'s rack drones fly on Ash\'s screen with their claimed targets (host ' + hs + ')');
  const u = await ev(A, () => ({used: __z.Z.pk.use('freeze'), left: __z.G.ch.freeze}));
  ok(u.used && u.left === 0 && await until(H, () => __z.api.TH.some(t => __z.api.live(t) && t.frz > 0)) && await until(B, () => __z.api.TH.some(t => __z.api.live(t) && t.frz > 0)), 'Perks: Ash uses Freeze (charge spent); the host slows a track and Bea sees it frozen');
  if (SHOTS) await A.p.screenshot({path: SHOTS + '/coop-client-wave.png'}); }

// ---------- launch alert in co-op (zwarn.js): the host sees a hypersonic, every pilot gets the alert; Ash hardens with key J, Bea sends the decoy with key U ----------
{ const id = await ev(H, () => { const {api} = __z, t = __z.make('hyper', -17000, 1950 - 11000, api.SITES[1]); return t.id; });  // from the west: no boost battery there to shoot it first
  ok(await until(A, id => __z.Z.warn.alerts().some(t => t.id === id), id) &&await until(B, id => __z.Z.warn.alerts().some(t => t.id === id), id), `Launch alert: T${id} (hypersonic on the fuel depot) is up on Ash's and Bea's screens`);
  const c0 = (await st(H)).cash;
  await ev(A, () => { dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyJ'})); dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyJ'})); });
  ok(await until(H, () => !!__z.G.kc.hard['FUEL DEPOT']) && (await st(H)).cash < c0 && await until(B, () => !!__z.G.kc.hard['FUEL DEPOT']), `Harden: Ash's key J is applied by the host (purse $${c0} -> $${(await st(H)).cash}); Bea sees the site hardened`);
  await ev(B, () => { dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyU'})); dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyU'})); });
  ok(await until(H, id => __z.G.kc.decoys === 0 && __z.api.TH.find(t => t.id === id)?.kc?.dc === 1, id), 'Decoy: Bea\'s key U spends the team\'s decoy on the host');
  if (SHOTS) await B.p.screenshot({path: SHOTS + '/coop-alert.png'});
  await ev(H, id => { const t = __z.api.TH.find(t => t.id === id); if (t && __z.api.live(t)) __z.Z.helperKill(t); }, id); }

// ---------- a client leaves; then rejoins mid-wave (late join), comes in at the next base screen ----------
await ev(B, () => __z.api.showMenu(true)); await B.p.click('#leave');
ok(await until(H, () => __z.net.rows().length === 2), 'Leave: Bea quits, the host roster drops to 2');
ok(await until(A, () => __z.net.rows().length === 2 && __z.net.n.pil.size === 1), 'Leave: Ash sees the roster drop and Bea\'s drone go');
ok(!(await st(B)).on && await ev(B, () => !document.getElementById('menu').hidden), 'Leave: Bea is back on the start menu');
await B.p.$eval('#zcode', (e, c) => { e.value = c; }, code); await B.p.click('#zjoin');
ok(await until(B, () => __z.G.on && __z.G.state === 'wave' && __z.net.n?.late), 'Late join: Bea rejoins during wave 2 and waits (spectating, idle on the mat)');
ok(await ev(B, () => __z.Z.idle() && document.getElementById('zinb').textContent.includes('NEXT BASE')) || await until(B, () => document.getElementById('zinb').textContent.includes('NEXT BASE'), null, 3000), 'Late join: the HUD says she joins at the next base screen');
await ev(H, () => { __z.G.wq.length = 0; for (let i = 0; i < 600 && __z.G.state === 'wave'; i++) { __z.sim(.5); if (__z.api.player.dead <= 0) __z.botKill(.8); } __z.sim(4); });
ok(await until(B, () => __z.G.state === 'base' && !__z.net.n.late && __z.net.rows().length === 3), 'Late join: at the base screen Bea is in, roster back to 3');

// ---------- campaign (zcampaign.js): the host plays a sector of their campaign; the clients play it with them; only the host's save moves ----------
{ const c0 = await ev(A, () => JSON.stringify(__z.api.S.zcamp ?? null));
  await ev(H, () => __z.Z.cp.start('hosp', true));
  ok(await until(H, () => __z.G.state === 'base' && __z.Z.cp.run?.id === 'hosp'), 'Campaign co-op: the host launches Hospital Hill for the whole team');
  for (const C of [A, B]) ok(await until(C, () => __z.G.state === 'base' && __z.Z.cp.run?.id === 'hosp' && /HOSPITAL HILL/.test(document.querySelector('#zbase .zcpbar')?.textContent || '') && __z.api.SITES.some(s => s.n === 'HOSPITAL' && s.max === 360)), `${C.name}: in the host's sector (strip on the base screen, the field hospital at 360 hp)`);
  await ev(H, () => { const {G, api, Z} = __z; Z.base.close(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wave = Z.cp.run.obj; G.state = 'wave'; for (let i = 0; i < 40 && G.state !== 'over'; i++) __z.sim(.5); });
  ok(await until(H, () => __z.G.state === 'over' && document.querySelector('#zover h2')?.textContent === 'Sector held' && __z.api.S.zcamp.held.includes('hosp')), "Campaign co-op: the host holds the sector; the host's campaign save moves");
  for (const C of [A, B]) ok(await until(C, () => document.querySelector('#zover h2')?.textContent === 'Sector held' && /Waiting for the host/.test(document.getElementById('zover').textContent)), `${C.name}: sees "Sector held" and waits for the host`);
  ok(await ev(A, () => JSON.stringify(__z.api.S.zcamp ?? null)) === c0, "Campaign co-op: a client's own campaign save is untouched");
  if (SHOTS) await A.p.screenshot({path: SHOTS + '/coop-campaign-held.png'}); }

// ---------- the host leaves: every client's game ends with a message ----------
await ev(H, () => __z.api.showMenu(true)); await H.p.click('#leave');
for (const C of [A, B]) ok(await until(C, () => !__z.G.on && /host left/i.test(document.getElementById('zmpnote').textContent) && !document.getElementById('menu').hidden), `${C.name}: host left -> back on the menu with "${'The host left the game'}"`);
if (SHOTS) await A.p.screenshot({path: SHOTS + '/coop-host-left.png'});

for (const P of all) ok(!P.errs.length, `${P.name}: no errors` + (P.errs.length ? '\n  ' + P.errs.slice(0, 6).join('\n  ') : ''));
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
