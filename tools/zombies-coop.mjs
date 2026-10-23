// Zombies co-op harness: one headless Edge, three pages of the game (a host and two clients) talking over the ?netloop transport
// (engine/net.js: a BroadcastChannel stand-in for the room, with a one-way delay), driven through the real menu, base screen and the
// window.__z hooks. Checks: lobby (host / join by code), ready-up and forced start, waves and tracks in sync, a client's kill counts,
// shared purse and shop requests (helper, personal perk, team perk, repair, kill chain), personal swarms (formation and strike over the wire), Little Buddies (each pilot with a garage gets one, flown by the host, drawn on every screen),
// the arsenal (a client's weapon purchase, loadout and EMP resolved on the host, the host's laser beam and a client-parked carrier on every screen),
// site hit points in sync, the living map's scars, launch alerts and warning actions from clients (harden, decoy), late join, a client leaving,
// the host leaving. Run: node tools/zombies-coop.mjs [--shots DIR] [--delay MS] [--throttle N]  (N: CPU throttling per page, e.g. 4, to play a slow CI runner)
// The three windows skip their WebGL draw calls (tools/browser.mjs render stub) unless --shots asks for pictures: drawing three full game
// windows can drop a busy machine to ~1 frame a second, and the game loop caps the sim per frame, so every wait here would starve.
import {serve, launch, open, sleep, newWindow} from './zlib.mjs';
import {timingCheck} from './browser.mjs';
const argv = process.argv.slice(2), SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const DELAY = argv.includes('--delay') ? +argv[argv.indexOf('--delay') + 1] : 40;
const THROTTLE = argv.includes('--throttle') ? +argv[argv.indexOf('--throttle') + 1] : 0;
const {server, origin} = await serve();
const browser = await launch();
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const URL = `${origin}/games/interceptor/?mode=zombies&netloop=${DELAY}`;
// each pilot's own unlocks and loadout (zmeta.js): the host picks the Partisan doctrine, Ash brings the light rack, Bea the lure beacon
const LOADS = {Hosty: {zmeta: {v: 1, g: {night15: 8}}, zload: {doc: 'partisan', kit: []}}, Ash: {zmeta: {v: 1, g: {helpers: 2}}, zload: {doc: 'std', kit: ['lrack']}}, Bea: {zmeta: {v: 1, g: {boss: 2, w10: 2}}, zload: {doc: 'fortress', kit: ['lure']}}};
async function page(name) {
  const errs = [], p = await open(browser, URL, errs, {page: await newWindow(browser, {noRender: !SHOTS})});
  if (THROTTLE > 1) { const s = await p.target().createCDPSession(); await s.send('Emulation.setCPUThrottlingRate', {rate: THROTTLE}); }
  await p.evaluate(lo => localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: 'z', wx: 'clear', zwx: 'menu', zdiff: 1, ...lo})), LOADS[name]);
  await p.reload({waitUntil: 'load'});
  await p.waitForFunction(() => window.__z && window.__z.net, {timeout: 60000});
  await p.$eval('#zname', (e, n) => { e.value = n; }, name);
  return {p, errs, name};
}
// Every wait here is on game state with a generous upper bound (a slow CI runner gets there late, not never), and anything that needs sim
// time drives the host's sim explicitly (__z.sim): no fixed sleeps standing in for "long enough".
const until = async (P, fn, arg, ms = 60000) => { try { await P.p.waitForFunction(fn, {timeout: ms, polling: 50}, arg); return true; } catch (e) { return false; } };
// the host has handled every request pilot P sent so far (its ack covers P's latest sequence number)
const handled = async P => { const s = await ev(P, () => __z.net.n.oseq); return until(H, ([k, s]) => (__z.net.n.hk[k] || 0) >= s, [await ev(P, () => __z.net.n.me), s]); };
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
await tap(H, '#zgo'); await tap(A, '#zgo'); await until(H, () => document.getElementById('zgo').textContent.includes('2/3'));  // both readies have reached the host (state, not a fixed wait)
ok((await st(H)).state === 'base' && await ev(H, () => document.getElementById('zgo').textContent.includes('2/3')), 'Ready-up: 2 of 3 ready, the wave has not started (button reads 2/3)');
await tap(B, '#zgo');
ok(await until(H, () => __z.G.state === 'wave' && __z.G.wave === 1), 'Ready-up: the third pilot readies, wave 1 starts on the host');
for (const C of [A, B]) ok(await until(C, () => __z.G.state === 'wave' && __z.G.wave === 1 && document.getElementById('zbase').hidden), `${C.name}: wave 1 started (base screen closed)`);

// ---------- waves sync: the same tracks, close to where the host has them ----------
await ev(H, () => __z.sim(30));
await until(A, ids => { const c = __z.api.TH.filter(__z.api.live).map(t => t.id).sort((a, b) => a - b).join(); return c === ids; }, (await ev(H, () => __z.api.TH.filter(__z.api.live).map(t => t.id).sort((a, b) => a - b).join())));
{ const sync0 = async () => { const t0 = Date.now(), h = await ev(H, () => __z.api.TH.filter(__z.api.live).map(t => [t.id, t.p.x, t.p.y, t.p.z, t.v.length()])); const c = await ev(A, () => __z.api.TH.filter(__z.api.live).map(t => [t.id, t.p.x, t.p.y, t.p.z, t.k])), lag = (Date.now() - t0) / 1000;  /* lag: wall time between the two reads; the tracks really move that far in it */
    const m = new Map(c.map(a => [a[0], a])); let worst = 0; for (const a of h) { const b = m.get(a[0]); worst = Math.max(worst, b ? Math.max(0, Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]) - a[4] * lag) : 1e9); } return {h: h.map(a => a[0]), c: c.map(a => a[0]), kinds: c.map(a => a[4]), worst}; };
  // the two reads are a moment apart while both pages run: take the best of a few samples
  const sync = async () => { let b = null; for (let i = 0; i < 6; i++) { const s = await sync0(); if (!b || s.worst < b.worst) b = s; if (b.worst < 30 && b.h.join() === b.c.join()) break; await sleep(150); } return b; };
  const s = await sync();
  ok(s.h.length >= 2 && s.h.join() === s.c.join(), `Waves sync: host tracks [${s.h}] = client tracks [${s.c}] (${s.kinds})`);
  ok(s.worst < 30, `Waves sync: worst track position gap host vs client ${s.worst.toFixed(1)} m, net of the time between the two reads (snapshots 10 Hz, ${DELAY} ms delay, dead reckoning)`); }
// radio chatter (zradio.js): each screen makes its own calls from the state it has (the wave start, the new tracks it sees), not from the host's messages
for (const C of [H, A, B]) { await until(C, () => __z.Z.radio.calls.some(c => c.topic === 'trk'), null, 30000);
  const r = await ev(C, () => { const R = __z.Z.radio; return {wave: R.st.by.wave | 0, trk: R.st.by.trk | 0, err: R.err && String(R.err), first: R.calls.find(c => c.topic === 'wave')?.txt, t: R.calls.find(c => c.topic === 'trk')?.txt}; });
  ok(r.wave >= 1 && r.trk >= 1 && !r.err && /[Ww]ave 1/.test(r.first || ''), `Radio: ${C.name} makes its own calls from its copy of the game ("${r.first}" / "${r.t}")`); }

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
  await ev(A, () => __z.Z.req(['p', 'lure'])); ok(await handled(A), 'Kit perk: the host has handled Ash\'s forged request');
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
// ---------- arsenal (zarsenal.js): a pilot weapon bought from the shared purse is that pilot's own; the team's new defences show on every
// screen; a client parks the carrier through the host ----------
const aKey = await ev(H, () => Object.keys(__z.net.n.names).find(k => __z.net.n.names[k] === 'Ash'));
{ const c0 = (await st(H)).cash;
  await tap(A, '[data-tab="shop"]'); await tap(A, '[data-ars="w:net"]');
  ok(await until(H, c => __z.G.cash === c - 600, c0) && await until(A, () => __z.Z.ars.cur() === 'net' && __z.Z.ars.P(__z.Z.ars.me()).own.has('net')), 'Arsenal: Ash buys the net drone from the shared purse (-$600); it is his, loaded');
  ok(await ev(H, () => __z.Z.ars.cur() === 'std') && await ev(B, () => __z.Z.ars.cur() === 'std'), 'Arsenal: the host and Bea still carry the standard warhead');
  // the EMP (a wave-6 weapon) handed to Ash for the test, then loaded from his base screen: the host learns which weapon he carries
  await ev(H, k => __z.Z.ars.P(k).own.add('emp'), aKey); await ev(A, () => { __z.Z.ars.P(__z.Z.ars.me()).own.add('emp'); __z.Z.ars.equip('emp'); });
  ok(await until(H, k => __z.Z.ars.P(k).cur === 'emp', aKey), 'Arsenal: Ash loads the EMP warhead; the host knows what he carries');
  await ev(H, () => { __z.Z.def.add('carrier', 22).spent = 3000; });
  ok(await until(B, () => __z.Z.def.D.some(d => d.type === 'carrier' && d.slot === 22)), 'Arsenal: the host\'s drone carrier shows in Bea\'s base');
  const cid = await ev(H, () => __z.Z.def.D.find(d => d.type === 'carrier').id);
  await ev(B, id => __z.Z.ars.park(id, -600, 900), cid);
  const at = P => until(P, () => { const s = __z.Z.def.SLOTS[22]; return s.x === -600 && s.z === 900; });
  ok(await at(H) && await at(A), 'Arsenal: Bea parks the carrier from her screen; the host and Ash see it parked there');
  await ev(H, () => __z.Z.def.remove(__z.Z.def.D.find(d => d.type === 'carrier'))); }  /* out of the way of the swarm checks below */

// ---------- personal swarms (zswarm.js): each pilot's own; given here (they're a wave-12 perk), deployed when wave 2 starts ----------
const ashKey = await ev(H, () => Object.keys(__z.net.n.names).find(k => __z.net.n.names[k] === 'Ash'));
await ev(H, k => { const n = __z.net.n; (n.perks[k] ||= {}).swarm = 2; __z.G.perks.swarm = 1; }, ashKey);
ok(await until(A, () => __z.G.perks.swarm === 2), 'Swarm: Ash has Personal swarm level 2 (6 drones), the host level 1 (4)');
// ---------- Little Buddy (zbuddy.js): a pilot with a Drone League garage gets a buddy at every wave start; the host flies all of them, every screen draws them.
// The three windows share one browser's localStorage, so the garages are handed to the pages directly (Z.bd.force): the host and Ash have one, Bea none ----------
await ev(H, () => { __z.Z.bd.force = {has: true, ids: ['stock', 'stock', 'stock', 'none'], cos: null}; });
await ev(A, () => { __z.Z.bd.force = {has: true, ids: ['squash', 'pod', 'lr', 'armor'], cos: ['gold', null, null, null, 'cyan', null]}; });
// ---------- forced start: the host starts wave 2 with nobody else ready ----------
await tap(H, '#zforce');
ok(await until(H, () => __z.G.state === 'wave' && __z.G.wave === 2), 'Host: Start now begins wave 2 without the others ready');
for (const C of [A, B]) ok(await until(C, () => __z.G.state === 'wave' && __z.G.wave === 2), `${C.name}: wave 2 started`);
ok(await until(A, () => __z.Z.def.D[0]?.mesh?.parent != null), 'Ash: the rack is deployed on the client too');

// Little Buddy: the host's buddy and Ash's are up on the host; Ash and Bea draw both from the host's snapshot and Ash's loadout; Bea has none of her own
{ const hostKey = await ev(A, () => __z.net.n.hostPeer);
  const live2 = (P, ks) => until(P, ks => { const B = __z.Z.bd.BD, o = k => B.get(k) && B.get(k).state !== 'off'; return ks.every(o); }, ks);
  ok(await live2(H, ['me', aKey]), 'Buddy: the host flies its own buddy and Ash\'s (his loadout came over presence)');
  ok(await live2(A, ['me', hostKey]), 'Buddy: Ash draws his own buddy and the host\'s');
  ok(await live2(B, [aKey, hostKey]), 'Buddy: Bea draws both buddies from the host\'s snapshot');
  const bea = await ev(B, () => ({own: __z.Z.bd.mine.has, out: __z.Z.bd.mine.state, card: document.getElementById('zbd').hidden}));
  ok(!bea.own && bea.out === 'off' && bea.card, 'Buddy: Bea has no garage, so no buddy of her own and no card');
  ok(await until(B, k => { const b = __z.Z.bd.BD.get(k); return b && b.ids.join() === 'squash,pod,lr,armor' && b.model?.kind === 'parts' && b.tag?.userData.text === 'Ash\'s Little Buddy'; }, aKey), 'Buddy: on Bea\'s screen Ash\'s buddy is built from his parts (Squash-H, Pod, Long-Range, Armor) with the tag "Ash\'s Little Buddy"');
  const st2 = await ev(H, k => { const b = __z.Z.bd.BD.get(k); return {tuf: b.st.tuf, end: b.st.end, agi: b.st.agi}; }, aKey), bs = await ev(B, k => { const b = __z.Z.bd.BD.get(k); return {tuf: b.st.tuf, end: b.st.end, agi: b.st.agi}; }, aKey);
  ok(st2.tuf === bs.tuf && st2.end === bs.end && st2.agi === bs.agi && st2.end > 100, `Buddy: the host and Bea work Ash's buddy out the same from his parts (charge ${Math.round(st2.end)} s, hp ${Math.round(st2.tuf)}, agility ${Math.round(st2.agi)})`);
  // sync of a buddy at rest: Ash's buddy parked on the pad on the host shows at the same spot on Bea's screen (nothing moves, so there is no lag to allow for)
  { const pad = await ev(H, k => { const b = __z.Z.bd.BD.get(k); b.state = 'pad'; b.job = 'perch'; b.jt = 1e9; b.v.set(0, 0, 0); __z.sim(.1); return b.p.toArray(); }, aKey);
    ok(await until(B, ([k, x, y, z]) => { const b = __z.Z.bd.BD.get(k); return b.state === 'pad' && b.p.distanceTo(new __z.api.THREE.Vector3(x, y, z)) < 2; }, [aKey, ...pad]), 'Buddy sync: Ash\'s buddy parked on the pad on the host is within 2 m of that spot on Bea\'s screen'); await ev(H, k => { __z.Z.bd.BD.get(k).jt = 0; }, aKey); }  /* released: it picks a job again */
  // small drones near the pad send them out; Ash's buddy flies on the host, Bea's copy follows it
  await ev(H, () => { const {api} = __z; for (let i = 0; i < 6; i++) { const x = 100 + i * 40, z = 1500, t = __z.make('decoy', x, z); t.p.set(x, api.gh(x, z) + 60, z); t.alt = 60; t.v.set(0, 0, 0); t.spd = t.cs = .5; t.wps.length = 0; t.cpb = 1; } __z.sim(6); });
  ok(await until(H, k => __z.Z.bd.BD.get(k).state === 'fly', aKey) && await until(B, k => __z.Z.bd.BD.get(k).state === 'fly', aKey), 'Buddy: Ash\'s buddy takes off on the host and Bea sees it fly');
  // sync of a buddy in flight: the host flies Ash's buddy along a straight line at 60 m/s (scripted, so where it is at any moment is known exactly). Bea's copy must be on that line (always),
  // never ahead of the host and behind it by no more than the snapshot interval, twice the net delay and the gap between the two reads allow, stretched by how far her own game clock runs behind
  // the wall clock (a starved page dead-reckons less per second): the metres follow speed x lag, not a fixed number. Each page also records the longest gap between two of its sim steps
  // (counting the time since the last one at the moment of a read): a page that steps in bursts a frame apart, or not at all, is a page whose position stands still while the other's moves on.
  // When either page gets a frame every few seconds (clock x8 and slower) the measurement itself is meaningless, so then the ahead / follow checks are timing checks: warn-only in CI.
  await ev(H, k => { const {api, Z} = __z, V = api.THREE.Vector3, P0 = new V(-1200, 0, 4200); P0.y = api.gh(-1200, 3000) + 700; const L = window.__line = {t: 0, v: 60, dir: new V(0, 0, -1), P0, on: true}, s0 = Z.step;
    Z.step = dt => { s0(dt); const b = Z.bd.BD.get(k); if (!L.on || !b || b.state === 'off') return; L.t += dt; const s = L.v * (L.t % 80); b.state = 'fly'; b.job = 'escort'; b.jt = 1e9; b.tgt = null; b.hp = b.st.tuf; b.chg = b.st.end; b.p.copy(L.P0).addScaledVector(L.dir, s); b.v.copy(L.dir).multiplyScalar(L.v); if (L.t === dt) api.interp.cut(b); }; }, aKey);
  for (const P of [H, B]) await ev(P, () => { window.__gt = 0; window.__sp = {lw: 0, gmax: 0}; const s0 = __z.Z.step;
    __z.Z.step = dt => { const w = performance.timeOrigin + performance.now(); if (__sp.lw) __sp.gmax = Math.max(__sp.gmax, w - __sp.lw); __sp.lw = w; s0(dt); window.__gt += dt; };
    window.__w = (k, L) => { const V = __z.api.THREE.Vector3, b = __z.Z.bd.BD.get(k), d = new V(...L.dir), r = b.p.clone().sub(new V(...L.P0)), s = r.dot(d), w = performance.timeOrigin + performance.now(); return {s, perp: r.addScaledVector(d, -s).length(), st: b.state, gt: window.__gt, w, stall: Math.max(__sp.gmax, w - __sp.lw)}; }; });
  { const L = await ev(H, () => ({P0: __line.P0.toArray(), dir: __line.dir.toArray(), v: __line.v}));
    ok(await until(B, ([k, L]) => { const c = __w(k, L); return c.st === 'fly' && c.perp < 3 && c.s > 0; }, [aKey, L]), 'Buddy sync: Bea\'s copy of Ash\'s buddy picks up the host\'s line');
    for (const P of [H, B]) await ev(P, () => { __sp.gmax = 0; __sp.lw = performance.timeOrigin + performance.now(); });
    const S = [];
    for (let i = 0; i < 6; i++) { const t0 = Date.now(), c = await ev(B, ([k, L]) => __w(k, L), [aKey, L]), h = await ev(H, ([k, L]) => __w(k, L), [aKey, L]); S.push({c, h, gap: (Date.now() - t0) / 1000}); await sleep(150); }
    const first = S[0], last = S.at(-1), strch = (x, y) => { const wall = (y.w - x.w) / 1000, game = y.gt - x.gt; return Math.max(1, game > 0 ? wall / game : 999); }, stretch = strch(first.c, last.c), hstretch = strch(first.h, last.h), starved = Math.max(stretch, hstretch) > 8;
    const soft = (c, msg) => starved ? timingCheck(c, `${msg} [a page runs ${Math.max(stretch, hstretch).toFixed(0)}x slow (Bea x${stretch.toFixed(0)}, host x${hstretch.toFixed(0)}): a timing check]`, ok) : ok(c, msg);
    const lag = S.map(x => (x.h.s - x.c.s) / L.v), allow = S.map(x => (.25 + 2 * DELAY / 1000 + x.gap) * stretch * 1.5 + .25), best = Math.min(...lag.map((l, i) => l - allow[i]));
    ok(S.every(x => x.c.perp < 3 && x.h.perp < 3), `Buddy sync: Bea's copy stays on the host's line (worst ${Math.max(...S.map(x => x.c.perp)).toFixed(1)} m off it)`);
    // ahead of the host: a page that steps its sim in bursts a frame apart (or not at all) while its timers keep sending snapshots (the host) or applying them (Bea) stands still while the other
    // dead-reckons on at 60 m/s: her copy can run ahead of the host's read, by speed x the time she extrapolates, and only while a sim stands still. So the most it may lead is speed x the
    // shorter of the longest stall of either page (measured on the page) and the snapshot interval + twice the net delay + the read gap, x1.5, and 1 m for the rounding (two steady pages: about 2 m)
    const lead = Math.max(...S.map(x => x.c.s - x.h.s)), hs = Math.max(...S.map(x => x.h.stall)) / 1000, cs = Math.max(...S.map(x => x.c.stall)) / 1000, win = .25 + 2 * DELAY / 1000 + Math.max(...S.map(x => x.gap)), leadMax = L.v * Math.min(Math.max(hs, cs), win) * 1.5 + 1;
    soft(lead <= leadMax, `Buddy sync: Bea's copy is never ahead of the host by more than the stalls allow (most ahead ${lead.toFixed(1)} m; ${L.v} m/s x1.5 x the shorter of the longest gap between two sim steps, host ${(hs * 1000).toFixed(0)} ms / Bea ${(cs * 1000).toFixed(0)} ms, and the extrapolation window, ${(win * 1000).toFixed(0)} ms, + 1 m = ${leadMax.toFixed(0)} m)`);
    const moved = last.h.s - first.h.s, follows = moved < 5 || last.c.s - first.c.s > .5 * moved;  /* a host that did not move in the window gives nothing to follow */
    soft(best <= 0 && follows, `Buddy sync: Bea's copy follows Ash's buddy at 60 m/s about ${Math.min(...lag).toFixed(2)} s behind at best (about ${(Math.min(...lag) * L.v).toFixed(0)} m; allowed for the snapshot interval, ${2 * DELAY} ms of delay and the read gap, x${stretch.toFixed(1)} for her starved clock; the host moved ${moved.toFixed(0)} m in the window)`); }
  await ev(H, () => { __line.on = false; });
  ok(await until(A, () => { const c = document.getElementById('zbd'); return !c.hidden && /LITTLE BUDDY/.test(c.textContent) && /HP/.test(c.textContent); }), `Buddy: Ash's HUD card is up ("${(await ev(A, () => document.getElementById('zbd').textContent)).replace(/\s+/g, ' ').slice(0, 50)}")`);
  // a crash on the host shows on every screen, and the card says so
  await ev(H, k => { __z.Z.bd.BD.get(k).hp = 0; __z.sim(1); }, aKey);
  ok(await until(A, () => __z.Z.bd.mine.state === 'down' && /down until the next wave/.test(document.getElementById('zbd').textContent)) && await until(B, k => __z.Z.bd.BD.get(k).state === 'down', aKey), 'Buddy: a crash on the host (health gone) shows on Ash\'s card and on Bea\'s screen; it stays down for the wave');
  // out of the way of the swarm checks below
  await ev(H, () => { const {api} = __z; for (const t of api.TH.filter(t => t.cpb)) { api.scene.remove(t.mesh); api.TH.splice(api.TH.indexOf(t), 1); } for (const b of __z.Z.bd.BD.values()) b.state = 'off'; __z.Z.bd.force = null; });
  await ev(A, () => { __z.Z.bd.force = null; }); }
{ const hostKey = await ev(A, () => __z.net.n.hostPeer);
  ok(await until(H, k => __z.Z.sw.SWS.get(k)?.d.length === 6 && __z.Z.sw.drones.length === 4 && __z.G.spend?.swarm === 300, ashKey), 'Swarm: the host flies its 4 drones and Ash’s 6, upkeep $300 from the purse');
  ok(await until(A, k => __z.Z.sw.drones.length === 6 && __z.Z.sw.SWS.get(k)?.d.length === 4, hostKey), 'Swarm: Ash flies his 6 and sees the host’s 4');
  ok(await until(B, ([a, h]) => __z.Z.sw.SWS.get(a)?.d.length === 6 && __z.Z.sw.SWS.get(h)?.d.length === 4, [ashKey, hostKey]), 'Swarm: Bea sees both swarms ' + await ev(B, ([a, h]) => JSON.stringify([__z.Z.sw.SWS.get(a)?.d.length, __z.Z.sw.SWS.get(a)?.want, __z.Z.sw.SWS.get(a)?.ww, __z.Z.sw.SWS.get(h)?.d.length, __z.Z.sw.SWS.get(h)?.want, __z.G.wave, [...__z.Z.sw.SWS.keys()]]), [ashKey, hostKey]));
  await ev(A, () => __z.Z.sw.command('form#', 1));
  ok(await until(H, k => __z.Z.sw.SWS.get(k)?.form === 1, ashKey) && await until(B, k => __z.Z.sw.SWS.get(k)?.form === 1, ashKey), 'Swarm: Ash picks the wedge; the host and Bea fly his swarm in a wedge (only the formation went over the wire)');
  // a strike from Ash: the host spawns a cloud of Shaheds 1.2 km from Ash's interceptor; Ash strikes it, the host rolls the passes
  await ev(H, k => { const {api, G} = __z, s = __z.Z.sw.SWS.get(k), P = s.A ? s.A.p : __z.net.n.pil.get(k).d.p;  /* 1.2 km from where the host flies Ash's swarm */ G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    for (let i = 0; i < 4; i++) { const t = __z.make('shahed', P.x + i * 30, P.z - 1200); t.p.set(P.x + i * 30, api.gh(P.x, P.z - 1200) + 250, P.z - 1200 - i * 20); t.alt = 250; t.spd = t.cs = 4; } }, ashKey);
  ok(await until(A, () => __z.api.TH.filter(t => __z.api.live(t) && t.k === 'shahed').length >= 4), 'Swarm: Ash sees the Shahed cloud');
  const sk = await ev(A, () => ({ok: __z.Z.sw.command('strike'), ch: __z.Z.sw.mine.ch}));
  ok(sk.ok && sk.ch === 0, 'Swarm: Ash strikes (his one charge spent)');
  ok(await until(H, k => { const s = __z.Z.sw.SWS.get(k); return s && s.ch === 0 && s.d.some(d => d.st === 'strike' || d.boost); }, ashKey), 'Swarm: the host launches Ash’s strike on its copy of his swarm');
  await ev(H, k => { for (let i = 0; i < 20 && !(__z.Z.sw.SWS.get(k)?.kills > 0); i++) __z.sim(1); }, ashKey);  /* the host's own clock, until a pass kills (or 20 s): its window may get few frames next to the two clients */
  ok(await until(H, k => __z.Z.sw.SWS.get(k)?.kills > 0, ashKey), 'Swarm: Ash’s strike kills on the host ' + await ev(H, k => { const s = __z.Z.sw.SWS.get(k); return JSON.stringify({n: s.d.length, k: s.kills, st: s.d.map(d => d.st + ':' + Math.round(d.t ? d.t.p.distanceTo(d.p) : -1)), th: __z.api.TH.filter(t => __z.api.live(t)).map(t => t.k + '@' + Math.round(t.p.distanceTo(s.A.p))).slice(0, 8)}); }, ashKey));
  // the host's count is the truth and can still change (drones lost in the strike): poll both until they agree
  const cnt = async () => [await ev(H, k => __z.Z.sw.SWS.get(k).d.length, ashKey), await ev(A, () => __z.Z.sw.drones.length)];
  let c2 = await cnt(); for (let i = 0; i < 300 && c2[0] !== c2[1]; i++) { await sleep(200); c2 = await cnt(); }
  ok(c2[0] === c2[1], `Swarm: Ash's own drone count follows the host's (host / Ash: ${c2.join(' / ')})`); }

// ---------- site hit points in a wave: a Shahed hits the fuel depot on the host ----------
{ const r = await ev(H, () => { const {api, G} = __z; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); const s = api.SITES[1], aim = s.aims[0], t = __z.make('shahed', aim.x, aim.z - 300); t.tgt = s; t.aim = aim; t.wps.length = 0; t.p.set(aim.x, aim.y + 25, aim.z - 18); t.st = 'dive';
    t.v.set(0, -25, 18).setLength(t.spd);  /* close in and diving: it lands in well under a second, before any helper drone or swarm on the host can reach it */
    for (let i = 0; i < 400 && api.live(t); i++) api.step(1 / 60); return {id: t.id, hp: Math.ceil(s.hp), impacted: !!t.impacted}; });
  ok(r.impacted, `Host: T${r.id} impacted the fuel depot (hp ${r.hp})`);
  for (const C of [A, B]) ok(await until(C, hp => Math.ceil(__z.api.SITES[1].hp) === hp, r.hp), `${C.name}: fuel depot hp ${r.hp} matches the host`);
  ok(await until(A, id => __z.api.TH.every(t => t.id !== id || t.impacted), r.id), 'Ash: saw the impact as an event (track marked impacted)'); }

// ---------- the living map (zscars.js): the host's scars reach every client in a snapshot, a destroyed house with them; a client's own explosions make none ----------
{ const r = await ev(H, () => { const {Z, api} = __z, S = Z.sc; S.ensure(); for (let i = 0; i < 6; i++) S.add(i % 2, -1800 + i * 90, -900, 5 + i, {fade: 1}); const h = S.houses(); S.houseDown(30); S.add(2, h.x[30], h.z[30], 7.4, {fade: 1}); return S.stats(); });
  for (const C of [A, B]) ok(await until(C, n => { const t = __z.Z.sc.stats(); return t.craters === n[0] && t.burns === n[1] && t.rubble === n[2] && __z.Z.sc.houses().dead[30] === 1; }, [r.craters, r.burns, r.rubble]), `${C.name}: the host's ${r.craters} craters, ${r.burns} burns and ${r.rubble} rubble arrive in a snapshot, the house is gone`);
  ok(await ev(A, () => { const S = __z.Z.sc, V = __z.api.THREE.Vector3, c = S.stats().craters; S.refill(); S.boom(new V(-1000, __z.api.gh(-1000, -1000) + .5, -1000), 3); return S.stats().craters === c; }), "Ash: an explosion on a client's own screen leaves no scar of its own"); }

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
// ---------- arsenal in a wave: Ash's EMP goes to the host, which disables the pack; the stun shows on Bea's screen; the laser's beam shows on the clients ----------
{ const P0 = await ev(A, () => { const {api} = __z; api.launch(); const me = api.player; __z.net.n.late = true; me.p.set(-300, api.gh(-300, 600) + 400, 600); me.v.set(0, 0, 0); return [me.p.x, me.p.y, me.p.z]; });
  ok(await until(H, ([k, x, y, z]) => { const r = __z.net.n.pil.get(k); return !!r && r.d.p.distanceTo(new __z.api.THREE.Vector3(x, y, z)) < 3; }, [aKey, ...P0]), 'Arsenal: the host sees Ash holding 400 m up');
  const ids = await ev(H, ([x, y, z]) => { const {api, G} = __z, out = []; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    for (let i = 0; i < 3; i++) { const t = __z.make('shahed', x + 15 + i * 8, z - 20); t.p.set(x + 15 + i * 8, y + 2, z - 20 - i * 5); t.alt = t.p.y - api.gh(t.p.x, t.p.z); t.spd = t.cs = 4; t.v.set(0, 0, -4); t.wps.length = 0; out.push(t.id); } return out; }, P0);
  ok(await until(A, ids => ids.every(id => __z.api.TH.some(t => t.id === id && __z.api.live(t))), ids), 'Arsenal: Ash sees the three Shaheds next to him');
  ok(await until(B, ids => ids.every(id => __z.api.TH.some(t => t.id === id && __z.api.live(t))), ids), 'Arsenal: Bea sees the three Shaheds too (the stun is an event: a screen without the tracks when it arrives never shows it)');
  await ev(B, ids => { window.__emp = new Set(); clearInterval(window.__empIv); window.__empIv = setInterval(() => { for (const t of __z.api.TH) if (t.emp > 0) __emp.add(t.id); }, 15); }, ids);  /* the stun lasts 4.5 s: a slow runner can miss it between two polls, so it is recorded as it happens */
  await ev(A, () => __z.Z.detonate());
  ok(await until(H, ids => ids.every(id => __z.api.TH.find(t => t.id === id)?.emp > 0), ids), 'Arsenal: the host resolves Ash\'s EMP with the solo rules: all three disabled');
  ok(await until(B, ids => ids.every(id => __emp.has(id)), ids), 'Arsenal: Bea sees them disabled');
  await ev(B, () => clearInterval(window.__empIv));
  ok(await until(A, () => /^EMP — 3 DISABLED/.test(__z.G.det?.txt || '')), 'Arsenal: Ash gets the readout from the host ("EMP — 3 DISABLED")');
  await ev(A, () => { __z.net.n.late = false; __z.api.launch(); });
  // the host builds a laser battery mid-wave (meshes go up on every screen with a redeploy) and gives it a track
  await ev(H, () => { const def = __z.Z.def, j = def.SLOTS.findIndex((s, j) => def.slotFree(j) && /substation/i.test(s.n)); def.add('laser', j).spent = 2200; def.deploy(); });
  for (const C of [A, B]) if (await until(C, () => __z.Z.def.D.some(d => d.type === 'laser'))) await ev(C, () => __z.Z.def.deploy());
  // the host's own selected track is left to the host (helpers never take it): a far-off decoy is selected so the laser takes the new Shahed
  await ev(H, () => { const {api} = __z, def = __z.Z.def, d = def.D.find(q => q.type === 'laser'), s = def.SLOTS[d.slot]; for (let k = 0; k < 3; k++) { const t = __z.make('shahed', s.x + 200 + k * 150, s.z + 1100 + k * 120); t.p.y = api.gh(t.p.x, t.p.z) + 350; t.alt = 350; }  /* south of the sites, away from the pilots' pads */
    const far = __z.make('decoy', 3500, -3000); far.p.y = api.gh(far.p.x, far.p.z) + 900; api.pickT = far; });
  const seen = await until(H, () => __z.Z.def.D.some(d => d.type === 'laser' && d.lzSeen), null, 30000), id = await ev(H, () => __z.Z.def.D.find(d => d.type === 'laser').lzSeen), lz = P => until(P, id => __z.Z.def.D.some(d => d.type === 'laser' && d.lzSeen === id), id, 20000), lzOk = seen && await lz(A) && await lz(B);  /* state-driven: each screen keeps the last track its copy of the laser locked */
  ok(lzOk, 'Arsenal: the host\'s laser locks a track and its beam shows on both clients' + (lzOk ? '' : ' ' + await ev(H, () => { const d = __z.Z.def.D.find(q => q.type === 'laser'); return JSON.stringify({st: __z.G.state, lz: !!d?.lz, seen: d?.lzSeen, wx: d?.wx, cd: d?.cd, mesh: !!d?.mesh, live: __z.api.TH.filter(__z.api.live).map(t => t.k + (t.claim ? '*' : ''))}); })));
  if (SHOTS) await B.p.screenshot({path: SHOTS + '/coop-arsenal.png'}); }

// ---------- a client leaves; then rejoins mid-wave (late join), comes in at the next base screen ----------
await ev(B, () => __z.api.showMenu(true)); await B.p.click('#leave');
ok(await until(H, () => __z.net.rows().length === 2), 'Leave: Bea quits, the host roster drops to 2');
ok(await until(A, () => __z.net.rows().length === 2 && __z.net.n.pil.size === 1), 'Leave: Ash sees the roster drop and Bea\'s drone go');
ok(!(await st(B)).on && await ev(B, () => !document.getElementById('menu').hidden), 'Leave: Bea is back on the start menu');
await B.p.$eval('#zcode', (e, c) => { e.value = c; }, code); await B.p.click('#zjoin');
ok(await until(B, () => __z.G.on && __z.G.state === 'wave' && __z.net.n?.late), 'Late join: Bea rejoins during wave 2 and waits (spectating, idle on the mat)');
ok(await ev(B, () => __z.Z.idle() && document.getElementById('zinb').textContent.includes('NEXT BASE')) || await until(B, () => document.getElementById('zinb').textContent.includes('NEXT BASE')), 'Late join: the HUD says she joins at the next base screen');
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
