// Interceptor harness: headless Edge runs Classic (must behave as before, no errors) and Zombies (waves, money, integrity, base screen,
// game over) by stepping the sim directly through window.__z. Run: node tools/zombies-test.mjs [--shots DIR] [--throttle N]
//   --sections=classic,saves,zombies,roster,helpers,weather,meta,chain,campaign,swarm,spectator,reentry,grid,bosses,sorties,arsenal,radio   run only those sections (CI shards them across jobs); default all
import {serve, launch, open, sleep, frames, drawFrames} from './zlib.mjs';
import {front as campFront} from '../games/interceptor/zcampaign.js';
import {SHOP as BOT_SHOP, level as botLevel} from './zbot.mjs';
const argv = process.argv.slice(2), SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const {server, origin} = await serve();
const browser = await launch();
let fails = 0;
const ONLY = argv.includes('--only');  // with --balance or --tiers: run just those sections
const SECTIONS = argv.find(a => a.startsWith('--sections='))?.slice(11).split(','), want = n => !ONLY && (!SECTIONS || SECTIONS.includes(n));
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };

// --throttle N: CPU throttling on each game page (CDP), e.g. 4, to play a slow CI runner
const THROTTLE = argv.includes('--throttle') ? +argv[argv.indexOf('--throttle') + 1] : 0;
const throttle = async p => { if (THROTTLE > 1) { const s = await p.target().createCDPSession(); await s.send('Emulation.setCPUThrottlingRate', {rate: THROTTLE}); } return p; };
async function page(mode) {
  const errs = [];
  const p = await open(browser, origin + '/games/interceptor/', errs);
  await p.evaluate(() => sessionStorage.setItem('zbossRoster', '0'));  // no random boss events or boss-wave swaps in the plain sections (the bosses section turns them back on)
  await p.evaluate(m => { localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: m, wx: 'clear'})); }, mode);
  await p.reload({waitUntil: 'load'});
  await p.waitForFunction(() => window.__z, {timeout: 60000});
  await frames(p, 5); await drawFrames(p);  // real frames of the menu scene (CI skips draw calls elsewhere: DL_NORENDER)
  await throttle(p);  // after the page is up: a throttled boot only tests the machine
  return {p, errs};
}
// waits are state-driven (the game's own state, or frames drawn), not wall-clock, so a slow machine only makes the run longer
async function play(p) { await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000}); await frames(p, 3); await drawFrames(p, 2); }

// ---------- Classic ----------
if (want('classic')) {
  const {p, errs} = await page('classic');
  ok(await p.$eval('#play', b => b.textContent) === 'Defend', 'Classic: start button reads Defend');
  await play(p);
  const r = await p.evaluate(() => { const {api} = __z; __z.sim(60); return {th: api.TH.length, wave: api.wave, kinds: api.TH.map(t => t.k || (t.jet ? 'jet' : 'shahed')), zhud: document.getElementById('zhud').hidden, score: getComputedStyle(document.getElementById('score')).display}; });
  ok(r.wave === 1 && r.th >= 1, `Classic: wave 1 running with ${r.th} track(s) [${r.kinds}]`);
  ok(r.kinds.every(k => k === 'shahed' || k === 'jet') && !r.kinds.some(k => k === undefined), 'Classic: only Shahed / Geran tracks, no Zombies kinds');
  ok(r.zhud && r.score !== 'none', 'Classic: Classic HUD shown, Zombies HUD hidden');
  await frames(p, 30);  // let the real frame loop run a while (errors show up here)
  if (SHOTS) await p.screenshot({path: SHOTS + '/classic.png'});
  ok(!errs.length, 'Classic: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- saves: hand-edited or foreign values must not break the start menu or a game ----------
if (want('saves')) {
  const errs = [], p = await open(browser, origin + '/games/interceptor/', errs), bad = [];
  for (const save of [{gmode: 'z', zdiff: 'x'}, {gmode: 'z', zdiff: 9}, {gmode: 'z', zdiff: 1.5, zbests: 'oops'}, {gmode: 'z', zmusv: 'loud', zname: {a: 1}}, {gmode: 7, wx: 'nope', cam: 'x'},
    {gmode: 'z', zmeta: 'x', zload: 5}, {gmode: 'z', zmeta: {g: [1, 2]}, zload: {doc: 'fortress', kit: 'lure'}}, {gmode: 'z', zmeta: {v: 1, g: {w10: '15', norep: 99, bogus: 3, boss: -1}}, zload: {doc: {}, kit: [null, 'lure', 'lure', 7]}},
    {gmode: 'z', zmeta: null, zload: {doc: 'qm', kit: ['lrack', 'hflak', 'mpads']}}, {gmode: 'z', zmeta: {v: 1, g: {w10: 2, helpers: 1, boss: 4}}, zload: {doc: 'fortress', kit: ['lrack', 'lure', 'mpads', 'toString']}}, {gmode: 'z', zruns: 'x'}, {gmode: 'z', zruns: [{d: 9, w: 'a'}, null, {d: 1, w: 5, doc: 7}, {d: 2, w: 1e9}]}]) {
    const n0 = errs.length;
    await p.evaluate(s => localStorage.setItem('dl-interceptor', JSON.stringify(s)), save); await p.reload({waitUntil: 'load'});
    const up = await p.waitForFunction(() => window.__z, {timeout: 60000}).then(() => true, () => false);  // a page boot is ~10 s on CI's software GL and can stretch past 20 s on a busy runner
    if (up) { await sleep(200); await p.click('#play'); await sleep(300); await p.evaluate(() => { if (__z.G.on) __z.cont(); __z.sim(5); }); }
    if (!up || errs.length > n0) bad.push(JSON.stringify(save) + (up ? '' : ' (page never came up)'));
  }
  ok(!bad.length, 'Saves: odd saved values still load and play' + (bad.length ? '\n  ' + bad.join('\n  ') + '\n  ' + errs.slice(0, 3).join('\n  ') : ''));
  await p.evaluate(() => localStorage.removeItem('dl-interceptor')); await p.close();
}

// ---------- Zombies ----------
if (want('zombies')) {
  const {p, errs} = await page('z');
  ok(await p.$eval('#play', b => b.textContent) === 'Quick defence', 'Zombies: mode choice switches the start button (Quick defence; the campaign has its own card)');
  ok(await p.evaluate(() => !document.getElementById('zdiff').hidden && document.querySelectorAll('#zdiff button').length === 4 && document.querySelector('#zdiff button.on')?.textContent === 'Normal'), 'Zombies menu: difficulty selector Easy / Normal / Hard / Nightmare, Normal by default');
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-menu.png'});
  await p.click('#zdiff button[data-d="3"]'); await p.waitForFunction(() => document.querySelector('#zdiff button.on')?.getAttribute('data-d') === '3', {timeout: 5000}).catch(() => {});
  const dm = await p.evaluate(() => ({on: document.querySelector('#zdiff button.on')?.textContent, desc: document.getElementById('gmdesc').textContent, zd: JSON.parse(localStorage.getItem('dl-interceptor')).zdiff}));
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-menu-nightmare.png'});
  await p.click('#zdiff button[data-d="1"]'); await p.waitForFunction(() => document.querySelector('#zdiff button.on')?.getAttribute('data-d') === '1', {timeout: 5000}).catch(() => {});
  ok(dm.on === 'Nightmare' && dm.zd === 3 && /Nightmare/.test(dm.desc), `Zombies menu: picking Nightmare highlights it, saves it and describes it ("${dm.desc.split('Nightmare: ')[1]?.slice(0, 50)}")`);
  await play(p);
  const s0 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, cash: __z.G.cash, st: __z.G.state, integ: __z.integrity()}));
  ok(s0.base && s0.st === 'base' && s0.cash === 1500, `Zombies: opens on the base screen with $${s0.cash}, integrity ${s0.integ.hp}/${s0.integ.max}`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-1.png'});
  await p.click('#zgo'); await p.waitForFunction(() => __z.G.state === 'wave', {timeout: 10000}).catch(() => {});
  // wave 1 with a scripted player that runs down every track
  const w1 = await p.evaluate(() => { const out = []; for (let i = 0; i < 400 && __z.G.state === 'wave'; i++) { __z.sim(.5); const pl = __z.api.player; if (pl.dead <= 0 && Math.random() < .5) { const k = __z.botKill(.8); if (k) out.push(k); } } return {out, st: __z.G.state, cash: __z.G.cash, kills: __z.G.kills, streak: __z.G.streak}; });
  ok(w1.kills.p >= 2 && w1.cash > 1500, `Zombies wave 1: scripted player killed ${w1.kills.p} (${w1.out}), cash $${w1.cash}, streak ${w1.streak}`);
  await p.evaluate(() => __z.sim(4));
  const b1 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, st: __z.G.state, wave: __z.G.wave}));
  ok(b1.base && b1.st === 'base' && b1.wave === 1, 'Zombies: wave 1 clear opens the base screen (no timer)');
  // shop: the whole catalogue is listed; buy a drone rack, place it, upgrade it in the Armory, buy a perk
  await p.evaluate(() => { __z.G.cash = 6000; __z.Z.def && document.querySelector('[data-tab="shop"]').click(); });
  const cat = await p.evaluate(() => ({n: __z.G.cards.length, all: Object.keys(__z.ITEMS).filter(k => !__z.ITEMS[k].kit).length, kit: __z.G.cards.filter(c => __z.ITEMS[c.k].kit).length, groups: [...document.querySelectorAll('.ztab h3:not(.zwph)')].map(h => h.textContent).join('/'), reroll: !!document.getElementById('zreroll')}));
  ok(cat.n === cat.all && !cat.kit && cat.groups === 'Helpers/Supplies for the next wave/Active perks/Passive perks' && !cat.reroll, `Shop lists every item but kit (${cat.n}) in groups ${cat.groups}, no reroll`);
  const bought = await p.evaluate(() => { const i = __z.G.cards.findIndex(c => c.k === 'rack'); if (i < 0) return 'no rack'; document.querySelector(`[data-buy="${i}"]`).click(); return !!document.querySelector('[data-slot]'); });
  ok(bought === true, 'Base: buying the rack card asks for a position');
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-place.png'});
  await p.click('[data-slot]');
  const arm = await p.evaluate(() => ({n: __z.Z.def.D.length, cash: __z.G.cash, armory: !!document.querySelector('[data-up]')}));
  ok(arm.n === 1 && arm.cash === 5300 && arm.armory, `Base: rack placed, $700 paid, Armory shows its upgrades`);
  await p.click('[data-up$=":tier"]');
  const up = await p.evaluate(() => ({tier: __z.Z.def.D[0].tier, cash: __z.G.cash}));
  ok(up.tier === 1 && up.cash === 4700, 'Armory: Mk II upgrade bought for $600');
  await p.click('[data-tab="shop"]'); const fz = await p.evaluate(() => { const i = __z.G.cards.findIndex(c => c.k === 'freeze'), c0 = __z.G.cash; document.querySelector(`[data-buy="${i}"]`).click(); return {paid: c0 - __z.G.cash, lvl: __z.Z.perkLevel('freeze'), still: !!document.querySelector(`[data-buy="${i}"]`)}; });
  ok(fz.paid === 900 && fz.lvl === 1 && fz.still, 'Shop: buying a perk charges its price and keeps it listed for the next level');
  await p.evaluate(() => { __z.G.cash = 6000; }); await p.click('[data-tab="sites"]');
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-sites.png'});
  await p.click('[data-tab="shop"]'); await frames(p, 2);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-shop.png'});
  // wave 2 with the rack: helper drones launch, claim (yellow), kill
  const w2 = await p.evaluate(() => { __z.cont(); let claimed = 0, both = 0, launched = 0; for (let i = 0; i < 600 && __z.G.state === 'wave'; i++) { __z.sim(.25); const L = __z.api.TH.filter(__z.api.live); const c = L.filter(t => t.claim).length; if (c) claimed++; if (c && L.length > c) both++; launched = Math.max(launched, __z.Z.def.D[0].shots); } return {claimed, both, launched, hk: __z.G.kills.h, st: __z.G.state}; });
  ok(w2.launched > 0 && w2.claimed > 0, `Wave 2: rack launched ${w2.launched} drone(s), tracks claimed in ${w2.claimed} samples, helper kills ${w2.hk}`);
  // claiming colours: stop mid-wave with one claimed and one free track for the screenshot
  await p.evaluate(() => { while (__z.G.state !== 'base' && __z.G.state !== 'over') __z.sim(1); });
  if (SHOTS) {
    await p.evaluate(() => __z.cont()); await sleep(2800);
    const cl = await p.evaluate(() => { const {api, Z} = __z; __z.G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
      const cam = api.camera, f = new api.THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize(), r = new api.THREE.Vector3(-f.z, 0, f.x), out = [];
      for (const [k, s] of [['shahed', -1], ['shahed', 0], ['jet', 1]]) { const t = __z.make(k, cam.position.x + f.x * 260 + r.x * s * 55, cam.position.z + f.z * 260 + r.z * s * 55); t.p.y = cam.position.y + 30 + s * 6; t.v.copy(r).multiplyScalar(-t.spd); t.wps.length = 0; out.push(t); }
      Z.def.launchDrone(Z.def.D[0], out[0]); return out.map(t => !!t.claim); });
    await sleep(350); await p.screenshot({path: SHOTS + "/z-claim.png"});
    ok(cl[0] && !cl[1], 'Claiming: claimed track yellow, free ones red (see z-claim.png)');
    await p.evaluate(() => { while (__z.G.state !== 'base' && __z.G.state !== 'over') __z.sim(1); });
  }
  // idle player: waves until the defence collapses
  const run = await p.evaluate(() => { const log = []; for (let w = 0; w < 40 && __z.G.state !== 'over'; w++) { __z.cont(); let n = 0; while (__z.G.state === 'wave' && n++ < 1200) __z.sim(.5); log.push([__z.G.wave, __z.api.TH.length, Math.round(__z.integrity().hp), __z.G.cash]); if (__z.G.state === 'clear') __z.sim(4); } return {log, st: __z.G.state, over: !document.getElementById('zover').hidden, best: (JSON.parse(localStorage.getItem('dl-interceptor')).zbests || {}).Normal}; });
  console.log('  wave, tracks, integrity, cash:', run.log.map(r => r.join('/')).join('  '));
  ok(run.st === 'over' && run.over && run.best && run.best.wave >= 2, `Zombies: idle player loses at wave ${run.log.at(-1)[0]}; game-over screen shown, best on Normal saved (${JSON.stringify(run.best)})`);
  if (SHOTS) { await sleep(500); await p.screenshot({path: SHOTS + '/z-gameover.png'}); }
  // difficulty: starting cash, pay per kill, site hit points; the best wave is kept per difficulty
  const dif = await p.evaluate(() => { const {api, G, Z} = __z, out = {};
    for (const zd of [0, 1, 2, 3]) { api.S.zdiff = zd; Z.start(); const c0 = G.cash; G.wave = 12; const pay = Z.earn(100, null, null); out[Z.diff().n] = {start: c0, pay, hp: __z.integrity().max}; }
    G.wave = 1; out.early = Z.earn(100, null, null); api.S.zdiff = 1; api.save(); Z.start(); return out; });
  console.log('  difficulty [start cash, $100 kill pays at wave 12, integrity]:', Object.entries(dif).filter(([k]) => k !== 'early').map(([k, v]) => `${k} ${v.start}/${v.pay}/${v.hp}`).join('  '), `· Nightmare wave 1 pays ${dif.early}`);
  ok(dif.Easy.start > dif.Normal.start && dif.Normal.start > dif.Hard.start && dif.Hard.start > dif.Nightmare.start && dif.Normal.pay === 100 && dif.Hard.pay < 100 && dif.Nightmare.pay < dif.Hard.pay && dif.Easy.pay > 100, 'Difficulty: starting cash and pay per kill step down from Easy to Nightmare');
  ok(!errs.length, 'Zombies: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- roster: every kind flies in and hits, unlocks by wave, boss stages and swarm launches, bunker, direct hit on a fast track ----------
if (want('roster')) {
  const {p, errs} = await page('z');
  await play(p);
  const r = await p.evaluate(() => {
    const {api, G, KIND} = __z, out = {};
    __z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    for (const k of ['shahed', 'jet', 'decoy', 'swarm', 'heavy', 'cruise', 'ballistic', 'hyper', 'icbm']) {
      const hp0 = __z.integrity().hp, t = __z.make(k, 0, -4000); let s = 0; const y0 = t.p.y, d0 = t.p.distanceTo(t.aim);
      while (api.live(t) && s < 400) { __z.sim(.5); s += .5; }
      out[k] = {sec: s, impacted: !!t.impacted, dmg: hp0 - __z.integrity().hp, startKm: +(d0 / 1000).toFixed(1), alt0: Math.round(y0)};
      api.SITES.forEach(x => x.hp = x.max); for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0;
    }
    // unlocks: which kinds each wave's plan contains
    const unl = {}; for (const w of [1, 5, 10, 11, 15, 20, 25, 30, 40]) { const P = []; for (let i = 0; i < 3; i++) P.push(...__z.plan(w).list.map(q => q.split(':')[0])); unl[w] = [...new Set(P)].sort().join(','); }
    // boss: stages, swarm launches; player direct hit on a ballistic track
    const b = __z.make('boss', 0, -3500); const st0 = b.stages; __z.sim(30); const sw = api.TH.filter(t => t.k === 'swarm').length; __z.Z.bossHit(b); const st1 = b.stages;
    while (api.live(b)) __z.Z.bossHit(b); const bossPaid = !!b.paid;
    for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0;
    const m = __z.make('ballistic', 0, -60000), me = api.player; while (m.p.distanceTo(m.aim) > 1500) __z.sim(.25); me.p.copy(m.p).addScaledVector(m.v, 1 / 60).add(new api.THREE.Vector3(.3, 0, 0)); me.v.set(0, 0, 0); __z.sim(1 / 30);
    const dh = !api.live(m) && !!m.paid;
    __z.Z.bunker(true); const bk = api.SITES.length;
    // manual detonation by timing: right behind a Shahed = hit; 12 m off its tail = a miss read out as such
    const det = []; for (const off of [1, 12]) { for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; api.launch(); __z.sim(.05); const t = __z.make('shahed', 0, -1500), me = api.player;
      me.p.copy(t.p).addScaledVector(t.v.clone().normalize(), -off); me.v.copy(t.v); __z.Z.detonate(); det.push(__z.G.det.txt); }
    // evasion: the same jet's heading wanders on Nightmare and not on Normal, with the interceptor close by; a Shahed only evades on Nightmare
    const wander = (zd, k = 'jet') => { api.S.zdiff = zd; for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; api.launch(); __z.sim(.05); const t = __z.make(k, 0, -1500); t.wps.length = 0; t.aim.set(0, 0, 6000); t.v.set(0, 0, t.spd);
      const me = api.player, h0 = Math.atan2(t.v.x, t.v.z); let dev = 0; for (let i = 0; i < 360; i++) { me.p.copy(t.p).add(new api.THREE.Vector3(0, 0, -200)); me.v.set(0, 0, 0); api.step(1 / 120); dev = Math.max(dev, Math.abs(Math.atan2(t.v.x, t.v.z) - h0)); } return +(dev * 57.3).toFixed(1); };
    const ev = {normal: wander(1), nightmare: wander(3), hardShahed: [wander(2, 'shahed'), wander(3, 'shahed')]}; api.S.zdiff = 1;
    // kill chance by miss distance at the moment you press detonate (no closing speed): certain up close, falling off smoothly; armor and the fuse perk
    for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0;
    const fall = {}, sh = __z.make('shahed', 0, -1500), hv = __z.make('heavy', 0, -1500); for (const r of [1, 2, 3, 4, 5, 7, 9]) { let k = 0; for (let i = 0; i < 400; i++) if (__z.Z.outcome(sh, r, 0) === 'kill') k++; fall[r] = Math.round(k / 4); }
    let hk = 0, hd = 0; for (let i = 0; i < 200; i++) { const o = __z.Z.outcome(hv, 3, 0); if (o === 'kill') hk++; if (o === 'damage') hd++; }
    const fuse = [__z.Z.autoFuse()]; G.perks.fuse = 1; fuse.push(__z.Z.autoFuse()); G.perks.fuse = 0;
    for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0;
    return {out, unl, st0, st1, sw, bossPaid, dh, bk, det, ev, fall, hk, hd, fuse};
  });
  for (const [k, v] of Object.entries(r.out)) ok(v.impacted && (k === 'decoy' ? v.dmg === 0 : v.dmg > 0), `Roster ${k}: from ${v.startKm} km at ${v.alt0} m, impact after ${v.sec} s, damage ${v.dmg}`);
  console.log('  kinds per wave:', JSON.stringify(r.unl));
  ok(!r.unl[1].includes('decoy') && r.unl[5].includes('decoy') && r.unl[10].includes('boss') && r.unl[15].includes('heavy') && r.unl[25].includes('ballistic') && r.unl[40].includes('icbm'), 'Roster: new kinds unlock every 5 waves, boss on wave 10');
  ok(r.st0 >= 3 && r.st1 === r.st0 - 1 && r.sw > 0 && r.bossPaid, `Boss: ${r.st0} stages, one hit removes one, launched ${r.sw} swarm drones in 30 s, destroyed and paid`);
  ok(r.dh, 'Direct hit: interceptor sitting on a ballistic track\'s line kills it');
  ok(r.bk === 4, 'Command bunker joins as a fourth site');
  ok(/^HIT/.test(r.det[0]) && /^(MISSED BY|DAMAGED)/.test(r.det[1]), `Manual detonation readout: 1 m -> "${r.det[0]}", 12 m -> "${r.det[1]}"`);
  ok(r.ev.nightmare > r.ev.normal + 5 && r.ev.hardShahed[1] > r.ev.hardShahed[0] + 5, `Evasion: jet heading wanders ${r.ev.normal}° on Normal, ${r.ev.nightmare}° on Nightmare; a Shahed ${r.ev.hardShahed[0]}° on Hard (not an evading kind there), ${r.ev.hardShahed[1]}° on Nightmare`);
  const F = r.fall, ks = Object.keys(F).map(Number);
  ok(F[1] === 100 && F[3] > 25 && F[3] < 95 && F[7] <= 3 && ks.every((k, i) => !i || F[k] <= F[ks[i - 1]] + 6), `Detonation timing: kill chance by miss distance ${ks.map(k => `${k} m ${F[k]}%`).join(', ')}`);
  ok(r.hk === 0 && r.hd > 0, `Detonation: armored heavy at 3 m is only damaged (${r.hd}/200 damaged, ${r.hk} kills)`);
  ok(!r.fuse[0] && r.fuse[1], 'Detonation: manual by default in Zombies; the Proximity fuse perk turns the automatic fuse on');
  if (SHOTS) {  // the timing readout after a manual burst: 3 m behind a Shahed, seen from the chase camera
    await p.evaluate(() => { const {api, G, Z} = __z; Z.base.close(); G.wq.length = 0; G.state = 'wave'; for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; api.launch(); __z.sim(.05); const t = __z.make('shahed', 0, -1500), me = api.player;
      me.p.copy(t.p).addScaledVector(t.v.clone().normalize(), -3); me.v.copy(t.v); __z.Z.detonate(); });
    await sleep(250); await p.screenshot({path: SHOTS + '/z-detonate.png'});
  }
  ok(!errs.length, 'Roster: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- helpers and perks: every helper engages its kinds; Mark, Freeze, Airstrike and the passives do what the cards say ----------
if (want('helpers')) {
  const {p, errs} = await page('z');
  await play(p);
  const r = await p.evaluate(() => {
    const {api, G, Z, KIND} = __z, def = Z.def, out = {};
    // a defence with one of everything; waves 20 and 30 (cruise, ballistic, hyper) with an idle player
    const types = ['rack', 'flak', 'gepard', 'sam', 'ew', 'idome', 'gdome'];
    types.forEach((t, i) => { const d = def.add(t, i); if (t !== 'rack') d.lvl = 1; });
    for (const w of [20, 30]) { __z.jump(w, 0); G.next = __z.plan(w); __z.cont(); let n = 0; while (G.state === 'wave' && n++ < 1600) { __z.sim(.5); if (__z.integrity().hp < 600) api.SITES.forEach(s => s.hp = s.max); } if (G.state === 'clear') __z.sim(4); }
    for (const d of def.D) out[d.type] = {shots: d.shots, kills: d.kills, ...(d.res || {})};
    // Mark: rack Mk I against armored heavies, marked vs not
    const m0 = __z.trials(0, 'heavy', 120, false), m1 = __z.trials(0, 'heavy', 120, true);
    // perks
    G.state = 'wave'; G.perks = {}; for (const k of ['freeze', 'mark', 'air', 'warhead', 'relaunch', 'battery', 'aid', 'radar']) Z.buyPerk(k); Z.pk.refill();
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    const a = __z.make('shahed', 0, -2000), sp0 = a.spd; Z.pk.use('freeze'); const frozen = a.spd / sp0;
    const L = []; for (let i = 0; i < 6; i++) { const t = __z.make('shahed', 300 + i * 12, -1500); t.p.y = 400; t.alt = 400 - api.gh(t.p.x, t.p.z); L.push(t); }
    Z.pk.use('air'); __z.sim(3); const airKills = L.filter(t => !api.live(t)).length;
    const perks = {frozen, airKills, leth: api.LETH, aid: Z.repairK(), radar: Z.radarK(), mark: (Z.pk.use('mark'), api.TH.some(t => t.mark > 0))};
    return {out, m0, m1, perks};
  });
  console.log('  helper shots/kills over waves 20 and 30:', JSON.stringify(r.out));
  for (const t of ['rack', 'flak', 'gepard', 'sam', 'idome']) ok(r.out[t].shots > 0 && r.out[t].kills > 0, `Helper ${t}: ${r.out[t].shots} shots, ${r.out[t].kills} kills`);
  ok(r.out.ew.kills > 0, `EW jammer spoofed ${r.out.ew.kills} tracks`);
  ok(r.out.gdome.shots > 0, `Golden Dome fired ${r.out.gdome.shots} space interceptors (${r.out.gdome.kills} kills)`);
  ok(r.m1.kill > r.m0.kill + 15, `Mark: Mk I rack vs armored heavy, kills ${r.m0.kill}/120 unmarked -> ${r.m1.kill}/120 marked`);
  const P = r.perks;
  ok(Math.abs(P.frozen - .5) < .01 && P.airKills >= 5 && P.leth === 5 && Math.abs(P.aid - .7) < 1e-9 && P.radar === 1.3 && P.mark, `Perks: freeze x${P.frozen}, airstrike ${P.airKills}/6, warhead ${P.leth} m, Foreign Aid repairs x${P.aid}, radar x${P.radar}, mark set`);
  // touching the tuning panel mid-game (it re-applies the tune) must keep the passive perks on top of it
  const tk = await p.evaluate(() => { const {api} = __z, b = {leth: api.LETH}, i = document.querySelector('#m_shake') || document.querySelector('#mod input[type=range]'); if (!i) return null; i.dispatchEvent(new Event('input', {bubbles: true})); return {before: b.leth, after: api.LETH, base: api.S.mod.leth}; });
  ok(tk && tk.after === tk.before && tk.after > tk.base, `Perks survive the tuning panel: warhead radius ${tk?.before} m -> ${tk?.after} m after a tune change (base ${tk?.base} m)`);
  // Rocket Assist: a 15 s burn from lift-off; full-throttle cruise top speed with and without it, ramp-in, stick response at speed,
  // a direct hit at rocket speed (swept check), the HUD and track box at speed, and it switches off by itself
  await p.keyboard.down('KeyW');
  const key = (code, down) => p.evaluate((c, d) => dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', {code: c})), code, down);
  const rkFly = withRocket => p.evaluate(withRocket => {
    const {api, G, Z} = __z, V = api.THREE.Vector3, me = () => api.player;
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); G.state = 'wave'; Z.base.close();  // a spawn that never comes keeps the wave open
    G.perks.rocket = withRocket ? 1 : 0; api.launch(); __z.sim(.05); const d = me(); d.p.set(0, api.gh(0, 800) + 1500, 800); d.q.setFromAxisAngle(new V(1, 0, 0), -85 * Math.PI / 180); d.w.set(0, 0, 0); d.v.set(0, 0, -80);
    let top = 0, at05 = 0; for (let i = 0; i < 7 * 120; i++) { api.step(1 / 120); top = Math.max(top, d.v.length()); if (i === 60) at05 = d.boost || 0; if (d.dead > 0) break; }
    return {top: Math.round(top * 3.6), boost05: Math.round(at05), alive: d.dead <= 0};
  }, withRocket);
  // full pitch stick for 0.3 s at cruise: how far the nose and the flight path swing
  const rkTurn = () => p.evaluate(() => { const {api} = __z, d = api.player, n0 = new api.THREE.Vector3(0, 1, 0).applyQuaternion(d.q), v0 = d.v.clone().normalize();
    dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp'})); for (let i = 0; i < 36; i++) api.step(1 / 120); dispatchEvent(new KeyboardEvent('keyup', {code: 'ArrowUp'}));
    const n1 = new api.THREE.Vector3(0, 1, 0).applyQuaternion(d.q), v1 = d.v.clone().normalize(); for (let i = 0; i < 60; i++) api.step(1 / 120);
    return {nose: Math.round(n0.angleTo(n1) * 57.3), path: Math.round(v0.angleTo(v1) * 57.3), kmh: Math.round(d.v.length() * 3.6), alive: d.dead <= 0}; });
  const rkBase = await rkFly(false), rkBaseTurn = await rkTurn();
  const rkOn = await rkFly(true), rkOnTurn = await rkTurn();
  // a Shahed head-on, 1.7 m off the line: outside the 1.5 m contact sample, so only the swept direct-hit check can catch it at ~400 m/s closing
  const rkHit = await p.evaluate(() => { const {api, G} = __z, V = api.THREE.Vector3;
    const go = () => { api.launch(); __z.sim(.05); const me = api.player; me.p.set(0, api.gh(0, 800) + 1500, 800); me.q.setFromAxisAngle(new V(1, 0, 0), -85 * Math.PI / 180); me.w.set(0, 0, 0); me.v.set(0, 0, -80); for (let i = 0; i < 6 * 120; i++) api.step(1 / 120); return me; };
    let d = go(); const kmh = Math.round(d.v.length() * 3.6), f = d.v.clone().normalize(), side = new V(-f.z, 0, f.x).normalize();
    const t = __z.make('shahed', 0, -1500); t.p.copy(d.p).addScaledVector(f, 40).addScaledVector(side, 1.7); t.v.copy(f).multiplyScalar(-t.spd); t.wps.length = 0; t.aim.copy(t.p).addScaledVector(f, -6000); t.aim.y = t.p.y; t.alt = t.p.y - api.gh(t.p.x, t.p.z);
    const k0 = G.kills.p; for (let i = 0; i < 40 && api.live(t); i++) api.step(1 / 120); const kill = G.kills.p > k0;
    d = go(); const u = __z.make('shahed', 0, -1500); u.p.copy(d.p).add(new V(0, 0, -2500)); api.pickT = u;  // a track ahead for the HUD check
    return {kill, kmh}; });
  // let the real frame loop draw the HUD at speed: wait until it shows the speed, the burn bar and the track box
  await p.waitForFunction(() => +((document.getElementById('osd').textContent.match(/(\d+)\s*km\/h\s+HDG/) || [])[1] || 0) > 1000 && !document.getElementById('zrk').hidden && /T\d\d/.test(document.getElementById('trk').textContent), {timeout: 30000, polling: 50}).catch(() => {});
  const rkHud = await p.evaluate(() => ({osd: document.getElementById('osd').textContent, trk: document.getElementById('trk').textContent, bar: !document.getElementById('zrk').hidden}));
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-rocket.png'});
  // the rest of the burn with the interceptor held 1.5 km over the ground: the live frame loop above advanced the flight by however
  // long the HUD took, so without the hold it could reach a hill in these 12 s, crash, relaunch and re-ignite (seen in CI)
  const rkEnd = await p.evaluate(() => { const {api, Z} = __z, d = api.player, h = d.p.clone(); h.y = Math.max(h.y, api.gh(h.x, h.z) + 1500);
    for (let i = 0; i < 12 * 120; i++) { d.p.copy(h); api.step(1 / 120); } return {burn: +Z.rk.st.t.toFixed(1), boost: d.boost || 0, alive: d.dead <= 0}; });
  await p.keyboard.up('KeyW');
  const hudKmh = +((rkHud.osd.match(/(\d+)\s*km\/h\s+HDG/) || [])[1] || 0);
  console.log('  rocket assist:', JSON.stringify({rkBase, rkBaseTurn, rkOn, rkOnTurn, rkHit, hudKmh, trk: rkHud.trk.slice(0, 60), rkEnd}));
  ok(rkOn.top > 1100 && rkOn.top < 1300 && rkOn.top > rkBase.top * 2.5 && rkOn.alive, `Rocket Assist: top speed ${rkBase.top} -> ${rkOn.top} km/h`);
  ok(rkOn.boost05 > 0 && rkOn.boost05 < 340 * .6, `Rocket Assist: ramps in (boost ${rkOn.boost05} m/s² of 340 after 0.5 s)`);
  ok(rkOnTurn.alive && rkOnTurn.path >= rkBaseTurn.path * .6 && rkOnTurn.path >= 5, `Rocket Assist: full pitch stick for 0.3 s swings the nose ${rkBaseTurn.nose}° -> ${rkOnTurn.nose}° and the flight path ${rkBaseTurn.path}° -> ${rkOnTurn.path}° (speed after: ${rkBaseTurn.kmh} / ${rkOnTurn.kmh} km/h)`);
  ok(rkHit.kill, `Rocket Assist: head-on Shahed 1.7 m off the line at ${rkHit.kmh} km/h is a direct hit (swept check)`);
  ok(hudKmh > 1000 && rkHud.bar && /T\d\d/.test(rkHud.trk), `Rocket Assist: HUD reads ${hudKmh} km/h with the burn bar up; track box: "${rkHud.trk.slice(0, 40)}"`);
  ok(!rkEnd.boost && rkEnd.burn === 0 && rkEnd.alive, 'Rocket Assist: burn ends by itself, still flying');
  ok(!errs.length, 'Helpers/perks: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- weather and look: per-wave forecasts, every Zombies weather, a mid-wave change, the Strela-2 body; Classic keeps Riley's weather and dart ----------
if (want('weather')) {
  const {p, errs} = await page('z');
  await play(p);
  const r = await p.evaluate(() => { const {api, G, Z} = __z, w = Z.wx, me = api.player, out = {};
    out.strela = me.strela.visible && !me.dart.visible && !!me.nozzle;
    out.forecast = /visibility/.test(document.querySelector('#zbase footer')?.textContent || '');
    out.ids = [...new Set(Array.from({length: 80}, (_, i) => w.plan(8 + i % 10).id))].sort().join(',');
    out.early = [...new Set(Array.from({length: 40}, () => w.plan(1).id))].sort().join(',');
    __z.cont(); out.bad = Object.keys(w.T).filter(id => { w.set(id); __z.sim(.5); return api.WX.id !== id || !api.WX.z; }).join(',');
    w.start({id: 'rain', to: 'storm', why: 'storm building', at: G.wt + 1, dur: 4}); __z.sim(3); out.mid = {n: api.WX.n, mix: !!api.WX.mix};
    __z.sim(4); out.end = {id: api.WX.id, mix: !!api.WX.mix, done: w.cur.done};
    return out; });
  ok(r.strela, 'Look: Zombies flies the Strela-2 body, with a nozzle attach point');
  ok(r.forecast, 'Weather: the base screen shows the next wave\'s forecast');
  ok(r.ids.split(',').length >= 9, `Weather: forecasts vary from wave to wave (${r.ids})`);
  ok(!/night|storm|snow|fog|dust/.test(r.early), `Weather: wave 1 stays gentle (${r.early})`);
  ok(!r.bad, 'Weather: every Zombies weather applies' + (r.bad ? ` (failed: ${r.bad})` : ''));
  ok(r.mid.mix && r.end.id === 'storm' && !r.end.mix && r.end.done, `Weather: mid-wave change blends (${r.mid.n}) and ends on the new weather (${r.end.id})`);
  ok(!errs.length, 'Weather: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
  const c = await page('classic');
  await play(c.p);
  const k = await c.p.evaluate(() => { const {api} = __z, me = api.player; return {dart: me.dart.visible && !me.strela.visible, wx: !api.WX.z, rain: api.rainN === api.RN}; });
  ok(k.dart && k.wx && k.rain, 'Classic: Riley\'s dart look and Classic weather by default');
  ok(!c.errs.length, 'Classic look: no errors' + (c.errs.length ? '\n  ' + c.errs.join('\n  ') : ''));
  await c.p.close();
}

// ---------- doctrine & unlocks (zmeta.js), late-game sinks, difficulty tactics ----------
if (want('meta')) {
  const {p, errs} = await page('z');
  await p.evaluate(() => { localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor')), zmeta: null, zload: null, zruns: [], zdiff: 1})); }); await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000});
  // the start-menu panel on a fresh profile: Standard only, kit locked, every goal listed with what it unlocks
  const m0 = await p.evaluate(() => { const b = document.getElementById('zmeta'); b.open = true; const docs = [...b.querySelectorAll('[data-doc]')], kit = [...b.querySelectorAll('[data-kit]')];
    return {shown: !b.hidden, docs: docs.map(x => (x.disabled ? '-' : '+') + x.dataset.doc).join(' '), kit: kit.filter(x => !x.disabled).length, nKit: kit.length, goals: b.querySelectorAll('.zgoals li').length, txt: b.querySelector('summary').textContent}; });
  ok(m0.shown && m0.docs === '+std -fortress -forward -air -partisan -qm' && m0.kit === 0 && m0.nKit === 5 && m0.goals === 10, `Meta panel (fresh): doctrines ${m0.docs}, ${m0.kit}/${m0.nKit} kit open, ${m0.goals} goals ("${m0.txt.trim()}")`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-meta-fresh.png'});
  // goals: earned on a difficulty, refused below its minimum; an unlock is pickable and saved
  const g = await p.evaluate(() => { const {Z, api} = __z, out = {}; api.S.zdiff = 1; out.w10 = Z.meta.award('w10'); out.again = Z.meta.award('w10'); out.hard = Z.meta.award('hard20');
    out.bits = Z.meta.meta().g; document.querySelector('[data-doc="fortress"]').click(); Z.meta.award('helpers'); Z.meta.award('boss');
    document.querySelector('[data-kit="lrack"]').click(); document.querySelector('[data-kit="lure"]').click();
    out.load = JSON.parse(localStorage.getItem('dl-interceptor')).zload; out.dots = document.querySelector('.zgoals li.done .zdd i.on')?.textContent; return out; });
  ok(g.w10 && !g.again && !g.hard && g.bits.w10 === 2 && !g.bits.hard20 && g.dots === 'N', `Goals: "Clear wave 10" met on Normal (bits ${g.bits.w10}, shows ${g.dots}), not twice; "wave 20 on Hard" refused on Normal`);
  ok(g.load.doc === 'fortress' && g.load.kit.join() === 'lrack,lure', `Loadout picked and saved: ${JSON.stringify(g.load)}`);
  if (SHOTS) { await p.evaluate(() => { document.getElementById('zmeta').open = true; }); await p.screenshot({path: SHOTS + '/z-meta-picked.png'});
    await p.evaluate(() => { document.getElementById('zmeta').open = false; document.getElementById('zboard').open = true; }); await p.screenshot({path: SHOTS + '/z-menu-board.png'}); await p.evaluate(() => { document.getElementById('zboard').open = false; }); }
  // leaderboard: the bots from zbench.json, then a run of yours slotted in by score, with the verdict against the bots on its difficulty
  const lb = await p.evaluate(() => { const {Z, api} = __z, B = Z.board, n0 = B.entries().length, bots = B.entries().filter(e => e.bot).length, nb = B.bench ? B.bench.levels.length : 0;
    const cur = B.record(1, 20, false), E = B.entries(cur), me = E.findIndex(e => e.me), html = B.overHTML(cur), ok = Array.isArray(api.S.zruns) && api.S.zruns.length === 1; api.S.zruns = []; api.save(); B.sync();
    return {n0, bots, nb, me, n: E.length, label: E[me] && `You · Normal · wave ${E[me].w}`, verdict: B.verdict(1, 20), ok, html: /class="you cur"/.test(html), first: E[0] && E[0].bot}; });
  ok(lb.bots === lb.n0 && lb.bots === lb.nb * 4 && lb.me >= 0 && lb.n === lb.n0 + 1 && lb.ok && lb.html, `Leaderboard: ${lb.bots} bot entries to start (${lb.nb} levels x 4 difficulties), a Normal wave-20 run slots in at #${lb.me + 1} of ${lb.n} ("${lb.verdict.replace(/<[^>]+>/g, '')}")`);
  // Fortress in play: tougher sites, no forward positions; the kit's light rack and lure beacon are in the shop
  await play(p);
  const f = await p.evaluate(() => { const {Z, G, api} = __z, def = Z.def; return {doc: Z.meta.doc().n, hp: api.SITES.map(s => s.max), open: def.SLOTS.filter((_, j) => def.slotOpen(j)).length, fob: def.slotFree(11), canFob: def.canOpen(11, Z.meta.doc()), canRear: def.canOpen(14, Z.meta.doc()),
    kit: G.cards.filter(c => __z.ITEMS[c.k].kit).map(c => c.k).join(), slots: def.SLOTS.filter(s => !s.park).length}; });
  ok(f.doc === 'Fortress' && f.hp[0] === 480 && f.open === 11 && !f.fob && !f.canFob && f.canRear && f.kit === 'lrack,lure' && f.slots === 22, `Fortress: site hp ${f.hp}, ${f.open} of ${f.slots} positions open, forward pad closed for good, rear slot can open; kit in the shop: ${f.kit}`);
  // sinks on Standard: expansion, refits, moving, supplies, upkeep with a shortfall, rebuilding, and the jammer's spoofs doing no damage
  await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('dl-interceptor')); l.zload = {doc: 'std', kit: ['lrack', 'lure']}; localStorage.setItem('dl-interceptor', JSON.stringify(l)); __z.api.S.zload = l.zload; __z.api.startMatch(); });
  const s = await p.evaluate(() => { const {Z, G, api, ITEMS} = __z, def = Z.def, B = Z.base, out = {};
    G.cash = 100000; out.open0 = def.SLOTS.filter((_, j) => def.slotOpen(j)).length;
    const c0 = G.cash; B.expand(14); out.exp1 = c0 - G.cash; const c1 = G.cash; B.expand(20); out.exp2 = c1 - G.cash; out.open1 = def.SLOTS.filter((_, j) => def.slotOpen(j)).length;
    const r = B.act.place('rack', 14); out.placed = !!r;
    B.refit(r.id, 'swarm'); out.swarm = [def.effOf(r, 'swarm'), def.effOf(r, 'jet')]; B.refit(r.id, 'range'); out.range = [def.capOf(r), def.rangeOf(r), r.refit];
    const c2 = G.cash; B.startMove(r.id); B.place(20); out.moved = [r.slot, c2 - G.cash];
    G.wave = 8; const sam = B.act.place('sam', 0); B.setTab('shop');
    for (const k of ['reload', 'harden']) { const i = G.cards.findIndex(c => c.k === k); B.buy(i); }
    out.sup = Object.keys(G.sup).sort().join();
    Z.continue(); out.ammo = [sam.ammo, def.magOf(sam)]; sam.ammo = 0; r.ready = 0;
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    const st = api.SITES[0], hp0 = st.hp, t = __z.make('shahed', st.x, st.z - 400, st); t.p.set(t.aim.x, t.aim.y + 30, t.aim.z - 10); t.v.subVectors(t.aim, t.p).setLength(t.spd); t.wps.length = 0; t.st = 'dive'; for (let i = 0; i < 200 && api.live(t); i++) api.step(1 / 60); out.harden = hp0 - st.hp;
    const u = __z.make('shahed', st.x, st.z - 400, st); u.spoof = 1; u.p.set(u.aim.x, u.aim.y + 30, u.aim.z - 10); u.v.subVectors(u.aim, u.p).setLength(u.spd); u.wps.length = 0; u.st = 'dive'; const hp1 = st.hp; for (let i = 0; i < 200 && api.live(u); i++) api.step(1 / 60); out.spoof = hp1 - st.hp; out.spoofHit = !!u.impacted;
    // upkeep: at wave 12 everything owned costs 2% a wave (forward 4%); with an empty purse the dearest go short and deploy at half load
    G.wave = 12; const U = Z.upkeep(12); out.up = [U.total, U.per.get(r), U.per.get(sam)];
    sam.spent = 60000; G.cash = 0; G.wq.length = 0; for (const x of api.TH) api.scene.remove(x.mesh); api.TH.length = 0; G.state = 'wave'; __z.sim(1);
    out.short = def.D.filter(d => d.short).map(d => d.type).join(); out.paid = G.lastUp; __z.sim(4); out.base = G.state;
    G.cash = 50000; Z.continue(); out.shortAmmo = [sam.ammo, def.magOf(sam)];
    // rebuild a destroyed site at 40%
    G.state = 'base'; api.SITES[2].hp = 0; const c3 = G.cash; B.act.rebuild(2); out.rebuild = [api.SITES[2].hp, api.SITES[2].max, c3 - G.cash];
    out.spend = {...G.spend}; return out; });
  ok(s.open0 === 14 && s.exp1 === 1800 && s.exp2 === 2500 && s.open1 === 16 && s.placed, `Expansion: ${s.open0} positions, opening two costs $${s.exp1} then $${s.exp2}, now ${s.open1}; a rack placed on the new rear slot`);
  ok(s.swarm[0] === 1 && s.swarm[1] === .6 && s.range[0] === 1 && s.range[1] === 4500 && s.range[2] === 'range', `Refits: Swarm seekers swarm ${s.swarm[0]} / jet ${s.swarm[1]}; Long-range drones ${s.range[1]} m with ${s.range[0]} drone`);
  ok(s.moved[0] === 20 && s.moved[1] > 0, `Move: rack to the west outpost for $${s.moved[1]}`);
  ok(s.sup === 'harden,reload' && s.ammo[0] === s.ammo[1] + 2 && s.harden === 30 && s.spoof === 0 && s.spoofHit, `Supplies: reloads give the SAM ${s.ammo[0]} of ${s.ammo[1]}; sandbags turn a Shahed's 40 into ${s.harden}; a spoofed Shahed does ${s.spoof} damage`);
  ok(s.up[1] === 108 && s.up[2] === 56 && s.up[0] === 164, `Upkeep at wave 12: $${s.up[0]} a wave (rack on an outpost, $2,700 in it, at 4%: $${s.up[1]}; SAM at 2%: $${s.up[2]})`);
  ok(s.short === 'sam' && s.paid > 0 && s.base === 'base' && s.shortAmmo[0] === Math.ceil(s.shortAmmo[1] / 2), `Upkeep unpaid: the purse covered $${s.paid}, the ${s.short} goes short and deploys with ${s.shortAmmo[0]} of ${s.shortAmmo[1]}`);
  ok(s.rebuild[0] === Math.round(s.rebuild[1] * .4) && s.rebuild[2] === 3000, `Rebuild: destroyed site back at ${s.rebuild[0]}/${s.rebuild[1]} for $${s.rebuild[2]}; spend tally ${JSON.stringify(s.spend)}`);
  if (SHOTS) { await p.evaluate(() => { const {Z, G} = __z; G.state = 'clear'; Z.openBase(); G.cash = 12000; Z.base.setTab('sites'); }); await frames(p, 3); await p.screenshot({path: SHOTS + '/z-base-positions.png'});
    await p.evaluate(() => __z.Z.base.setTab('armory')); await frames(p, 3); await p.screenshot({path: SHOTS + '/z-base-armory.png'});
    await p.evaluate(() => __z.Z.base.setTab('shop')); await frames(p, 3); await p.screenshot({path: SHOTS + '/z-base-shop-sinks.png'}); }
  // kit perk: the lure beacon pulls drones near the interceptor; one that reaches the beacon does no damage
  const lu = await p.evaluate(() => { const {Z, G, api} = __z; Z.base.close(); G.state = 'wave'; G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    G.perks.lure = 1; Z.pk.refill(); api.launch(); __z.sim(.1); const me = api.player, L = []; for (let i = 0; i < 3; i++) { const t = __z.make('shahed', me.p.x + 300 + i * 50, me.p.z - 200); L.push(t); }
    const hp = __z.integrity().hp, used = Z.pk.use('lure'); const lured = L.filter(t => t.lure > 0).length; __z.sim(9); return {used, lured, back: L.filter(t => api.live(t) && t.lure === 0 && t.aim === t.aim0).length, lost: hp - __z.integrity().hp, ch: G.ch.lure}; });
  ok(lu.used && lu.lured === 3 && lu.ch === 0 && lu.lost === 0, `Lure beacon: ${lu.lured} Shaheds turned toward it, ${lu.back} back on course after 8 s, sites lost ${lu.lost}`);
  // difficulty: when kinds arrive, escorts and time on target on Hard / Nightmare
  const d = await p.evaluate(() => { const {Z, api, G} = __z, out = {}; for (const zd of [0, 1, 2, 3]) { api.S.zdiff = zd; out[Z.diff().n] = {hyper: Z.kindFrom('hyper'), decoy: Z.kindFrom('decoy'), gdome: Z.itemFrom('gdome')}; }
    const arr = zd => { api.S.zdiff = zd; let dec = 0, sh = 0, spread = 0; const NS = 60; for (let i = 0; i < NS; i++) { const P = __z.plan(12); dec += P.list.filter(k => k === 'decoy').length; sh += P.list.filter(k => k === 'shahed').length;
      const eta = P.q.filter(q => !q.k.startsWith('boss')).map(q => { const K = __z.KIND[q.k.split(':')[0]]; return q.at + (K.far || 5200) / K.spd; }).sort((a, b) => a - b); spread += eta[Math.floor(eta.length * .9)] - eta[Math.floor(eta.length * .1)]; }
      return {dec: +(dec / NS).toFixed(1), sh: +(sh / NS).toFixed(1), spread: Math.round(spread / NS)}; };  /* 60 plans: 6 was too few to compare difficulties reliably */
    out.plan = {Normal: arr(1), Hard: arr(2), Nightmare: arr(3)}; api.S.zdiff = 1; return out; });
  console.log('  difficulty roster and raids:', JSON.stringify(d));
  ok(d.Easy.hyper > d.Normal.hyper && d.Normal.hyper > d.Hard.hyper && d.Hard.hyper > d.Nightmare.hyper && d.Hard.gdome < d.Hard.hyper && d.Nightmare.gdome < d.Nightmare.hyper, `Difficulty: hypersonics arrive at wave ${['Easy', 'Normal', 'Hard', 'Nightmare'].map(n => d[n].hyper).join(' / ')}, Golden Dome before them`);
  ok(d.plan.Hard.dec > d.plan.Normal.dec && d.plan.Nightmare.spread < d.plan.Normal.spread * .6, `Raids: decoys per wave-12 raid ${d.plan.Normal.dec} / ${d.plan.Hard.dec} / ${d.plan.Nightmare.dec}; arrival spread (10-90%) ${d.plan.Normal.spread} / ${d.plan.Hard.spread} / ${d.plan.Nightmare.spread} s`);
  ok(!errs.length, 'Meta and sinks: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.evaluate(() => localStorage.removeItem('dl-interceptor'));
  await p.close();
}

// ---------- kill chain and early warning (zchain.js, zwarn.js): the three layers, detection, the alert panel, harden / evacuate / decoy,
// the sorties hook (fast launches per sector) and the cause of a game over ----------
if (want('chain')) {
  const {p, errs} = await page('z');
  await play(p);
  const r = await p.evaluate(() => {
    const {api, G, Z, KIND} = __z, C = Z.chain, W = Z.warn, out = {}, clr = () => { for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; api.SITES.forEach(s => s.hp = s.max); };
    // the Kill chain tab: locked early, open two waves before the ballistic missiles
    Z.base.setTab('chain'); out.lockTxt = document.querySelector('.ztab').textContent.slice(0, 60); out.lockBuy = C.act('bb', 0);
    __z.jump(C.from, 100000); G.next = __z.plan(G.wave + 1); Z.base.render();
    out.from = C.from; out.buttons = document.querySelectorAll('[data-kc]').length;
    out.buy = ['bb:0', 'pb:1', 'ew:0', 'dc:2'].map(s => { const [a, x] = s.split(':'); return !!C.act(a, x); });
    out.noStock = C.act('st', 1); const gd = Z.def.add('gdome', 0); gd.spent = 9000; out.stock = !!C.act('st', 2) && G.kc.stock === 2;
    out.move = !!C.act('bm', '0>2') && !G.kc.boost[0] && !!G.kc.boost[2]; C.act('bm', '2>0');
    // the sorties hook: next wave's fast launches per sector, and cutting them
    G.next = __z.plan(34); const fp = Z.fastPlan(), n0 = fp.reduce((a, s) => a + s.total, 0), inList = G.next.list.filter(k => ['ballistic', 'hyper', 'icbm'].includes(k)).length;
    const sec = fp.findIndex(s => s.total), cut = sec >= 0 ? Z.cutFast(sec, 1) : 0, n1 = Z.fastPlan().reduce((a, s) => a + s.total, 0);
    out.sorties = {n0, inList, cut, n1, list: G.next.list.filter(k => ['ballistic', 'hyper', 'icbm'].includes(k)).length};
    __z.jump(34, 100000); G.next = {list: [], brgs: [], q: [{k: 'shahed', at: 1e9, brg: 0}], wx: null}; Z.def.remove(gd); __z.cont(); clr();
    const fire = (k, brg, site, R) => { R = R || KIND[k].far; const t = __z.make(k, Math.sin(brg) * R, 1950 - Math.cos(brg) * R, api.SITES[site]); return t; };
    // detection: a hypersonic from the north (no battery there) is off the radar until 25 s (+15 s early-warning radar) before impact; one from the west is seen at launch
    const tn = fire('hyper', 0, 0); __z.sim(.2); out.det0 = {seen: Z.seen(tn), tti: Math.round(tn.p.distanceTo(tn.aim) / tn.spd), warn: Z.warnS()};
    while (!Z.seen(tn) && api.live(tn)) __z.sim(.25); out.det1 = Math.round(tn.p.distanceTo(tn.aim) / tn.spd);
    clr(); const tw = fire('hyper', -1, 0); __z.sim(.2); out.detW = Z.seen(tw) && tw.kc.cue === 1 && tw.kc.b === 'wait';
    // boost phase: 40 ballistic launches from the west edge, level 1 battery, magazine refilled for each
    clr(); let bk = 0; for (let i = 0; i < 40; i++) { G.kc.boost[0].ammo = 2; const t = fire('ballistic', -1 + Math.random() * .4, i % 3); __z.sim(7); if (!api.live(t)) bk++; clr(); } out.boost = bk;
    // terminal: 40 hypersonics diving on the fuel depot (point defence level 1, recharged each time), no other layer; and its charges run out
    let pk = 0, tries = 0; for (let i = 0; i < 40; i++) { G.kc.pd['FUEL DEPOT'].ch = 2; const t = fire('hyper', 0, 1, 12000); t.kc = {sec: 1, b: 'none', det: 1, mm: 0, pd: '', dc: 0}; let s = 0; while (api.live(t) && s++ < 120 * 60) api.step(1 / 120); if (t.pdT) tries++; if (!t.impacted) pk++; clr(); }
    out.pd = {kills: pk, tries};
    // midcourse: Golden Dome with an empty magazine reloads from the stock for a hypersonic it alone can stop
    const g2 = Z.def.add('gdome', 0); Z.def.deploy(); g2.ammo = 0; G.kc.stock = 2; const th = fire('hyper', 0, 2, 40000); th.kc = {sec: 1, b: 'none', det: 1, mm: 0, pd: '', dc: 0}; let s2 = 0; while (api.live(th) && s2++ < 120 * 60) api.step(1 / 120);
    out.mid = {stock: G.kc.stock, shots: g2.shots, killed: !th.impacted}; Z.def.remove(g2); clr();
    // warning actions: harden cuts a ballistic hit on the apartments to 30%; a second harden waits for the cooldown; evacuate halves the next hit and
    // the wave bonus; a decoy (forced to work) sends the warhead into a field
    const hit = (k, site, pre) => { const t = fire(k, 0, site, 15000); t.kc = {sec: 1, b: 'none', det: 1, mm: 0, pd: '', dc: 0}; G.kc.pd = {}; if (pre) pre(t); const hp0 = api.SITES[site].hp; let s = 0; while (api.live(t) && s++ < 120 * 60) api.step(1 / 120); const d = hp0 - api.SITES[site].hp; clr(); return d; };
    G.kc.hcd = 0; const c0 = G.cash; out.hardDmg = hit('ballistic', 2, t => { out.hardOk = W.act('harden', t.id); out.hardCost = c0 - G.cash; out.cd = G.kc.hcd; });
    out.plainDmg = hit('ballistic', 2);
    out.evacDmg = hit('ballistic', 0, t => W.act('evac', t.id)); out.income = Z.incomeK(); out.nSites = api.SITES.length;
    const p0 = Math.random; out.decoyDmg = hit('hyper', 1, t => { Math.random = () => 0; out.decoyOk = W.act('decoy', t.id); Math.random = p0; out.dcy = t.dcy; });
    // key J in flight act on the most urgent alert
    G.kc.hcd = 0; G.kc.hard = {}; const tk = fire('ballistic', 0, 1, 15000); tk.kc = {sec: 1, b: 'none', det: 1, mm: 0, pd: '', dc: 0}; __z.sim(.1); Z.fxTest?.endCine();  /* the impact cam of the last hit would take the key */
    dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyJ'})); dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyJ'})); out.key1 = !!G.kc.hard['FUEL DEPOT'];
    Z.warnHud(); out.panel = document.getElementById('zalert').textContent; out.line = Z.chainLine(tk, false); out.label = Z.label(tk).replace(/<[^>]+>/g, '');
    out.stats = C.stats();
    return out; });
  ok(/arrives with wave/.test(r.lockTxt) && !r.lockBuy, `Kill chain tab: locked before wave ${r.from} ("${r.lockTxt.trim().slice(0, 40)}…")`);
  ok(r.buttons >= 10 && r.buy.every(Boolean), `Kill chain tab: open from wave ${r.from} with ${r.buttons} buttons; boost battery, point defence, early-warning radar, decoys bought (${r.buy})`);
  ok(!r.noStock && r.stock, 'Kill chain: space interceptors need a Golden Dome, then go into its stock');
  ok(r.move, 'Kill chain: a boost battery moves to another launch edge');
  ok(r.sorties.n0 === r.sorties.inList && (!r.sorties.n0 || r.sorties.cut === 1 && r.sorties.n1 === r.sorties.n0 - 1 && r.sorties.list === r.sorties.n0 - 1), `Sorties hook: wave 34 plans ${r.sorties.n0} fast launches by sector; cutting one leaves ${r.sorties.n1} (list ${r.sorties.list})`);
  ok(!r.det0.seen && r.det0.tti > 60 && Math.abs(r.det1 - r.det0.warn) <= 1 && r.det0.warn === 35, `Early warning: a hypersonic is off the radar ${r.det0.tti} s out and shows up ${r.det1} s before impact (warning ${r.det0.warn} s: 20 + 15 from the early-warning radar)`);
  ok(r.detW, 'Early warning: the west boost battery sees a west launch at once and takes its shot');
  ok(r.boost >= 6 && r.boost <= 28, `Boost phase: level 1 battery stops ${r.boost}/40 ballistic launches (40% each)`);
  ok(r.pd.tries === 40 && r.pd.kills >= 2 && r.pd.kills <= 20, `Terminal: point defence fires at all 40 hypersonics diving on its site and stops ${r.pd.kills} (22% each)`);
  ok(r.mid.shots >= 1 && r.mid.stock === 2 - r.mid.shots, `Midcourse: an empty Golden Dome reloads from the stock (stock 2 -> ${r.mid.stock}, ${r.mid.shots} shot${r.mid.shots > 1 ? 's' : ''}, ${r.mid.killed ? 'killed' : 'missed'})`);
  ok(r.hardOk && r.hardDmg === 110 && r.plainDmg === 220 && r.hardCost > 0 && r.cd > 20, `Harden: a ballistic hit ${r.plainDmg} -> ${r.hardDmg} on a hardened site ($${r.hardCost}); the next harden waits (${Math.round(r.cd)} s left)`);
  ok(r.evacDmg === 154 && Math.abs(r.income - (1 - 1 / r.nSites)) < 1e-6, `Evacuate: the hit takes ${r.evacDmg} instead of 220 (70%); the wave bonus x${r.income.toFixed(2)}`);
  ok(r.decoyOk && r.dcy && r.decoyDmg === 0, `Decoy: the warhead turns for the dummy site, no damage (${r.decoyDmg})`);
  ok(r.key1, 'Key J in flight hardens the target site of the most urgent alert');
  ok(/LAUNCH DETECTED — BALLISTIC — FUEL DEPOT — \d+ s/.test(r.panel) && /BOOST .* → MID .* → TERMINAL/.test(r.line) && /HARDEN|EVACUATE|DECOY/.test(r.panel) && /BOOST/.test(r.label), `Alert panel: "${r.panel.slice(0, 120)}"; chain "${r.line}"`);
  console.log('  chain stats:', JSON.stringify(r.stats));
  if (SHOTS) { await frames(p, 4); await drawFrames(p, 2); await p.screenshot({path: SHOTS + '/z-alert.png'}); }
  // the cause of a game over: the kind whose hit did the last damage, on the game-over panel
  const go = await p.evaluate(() => { const {api, G, Z} = __z; api.SITES.forEach(s => s.hp = 1); for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; G.kc.hard = {}; G.kc.evac = {};
    const t = __z.make('ballistic', 0, 1950 - 15000, api.SITES[0]); api.SITES.forEach((s, i) => { if (i) s.hp = 0; }); let s = 0; while (G.state !== 'over' && s++ < 120 * 60) api.step(1 / 120);
    return {st: G.state, cause: G.cause, txt: document.getElementById('zover').textContent}; });
  ok(go.st === 'over' && go.cause === 'ballistic' && /Final blow\s*Ballistic missile/.test(go.txt), `Game over: cause logged (${go.cause}) and shown ("${(go.txt.match(/Final blow[^·]*·[^A-Z]*/) || [''])[0].trim()}")`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-over-cause.png'});
  ok(!errs.length, 'Kill chain: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- sorties and fog of war (zsortie.js, zsites.js, zfog.js): the Sortie tab, a launch, a convoy found and bombed (the next wave shrinks),
// salvage banked inside the line, a launch site (the fast missiles of its sector, two waves) and a factory (three waves), a strike order,
// a late return (the wave starts, drone and salvage lost), fog that reveals and stays ----------
if (want('sorties')) {
  const {p, errs} = await page('z');
  await play(p);
  const b0 = await p.evaluate(() => { const {G, Z} = __z, so = __z.so, W = so.W; Z.base.setTab('sortie');
    const enemyFog = so.fog.frac((x, z) => W.enemy(x, z));
    return {tab: !!document.querySelector('[data-tab="sortie"]'), go: document.querySelector('[data-so="go"]')?.disabled, launch: so.launch(), sites: W.list.filter(t => t.t !== 'convoy').map(t => t.t), known: so.known().length, enemyFog, routes: W.routes.length}; });
  ok(b0.tab && b0.go === true && b0.launch === false, 'Sorties: a Sortie tab on the base screen; no sortie before wave 1 (button disabled)');
  ok(b0.sites.filter(t => t === 'launch').length === 3 && b0.sites.includes('factory') && b0.routes === 3, `Sorties: the enemy side has a launch site per sector, a factory and three roads [${b0.sites}]`);
  ok(b0.known === 0 && b0.enemyFog < .2, `Fog: the far ground starts unknown (${Math.round(b0.enemyFog * 100)}% of the enemy side revealed by the radar's ground circle), no site known`);
  await p.evaluate(() => __z.cont());
  await p.evaluate(() => { for (let i = 0; i < 400 && __z.G.state === 'wave'; i++) { __z.sim(.5); if (__z.api.player.dead <= 0 && Math.random() < .5) __z.botKill(.8); } __z.sim(4); });
  const l1 = await p.evaluate(() => { const {G, Z} = __z, so = __z.so; Z.base.setTab('sortie'); const cv = so.W.list.find(t => t.t === 'convoy');
    return {st: G.state, wave: G.wave, convoy: !!cv, go: document.querySelector('[data-so="go"]')?.disabled, launch: so.launch(), on: so.S.on, base: !document.getElementById('zbase').hidden, hold: Z.hold(), clock: so.S.t, fog0: so.fog.count()}; });
  ok(l1.st === 'base' && l1.wave === 1 && l1.convoy && l1.go === false, 'Sorties: after wave 1 a convoy is on the roads and the Launch button is live');
  ok(l1.launch && l1.on && !l1.base && !l1.hold && l1.clock === 120, `Sortie launched: the base screen closes, the game runs, ${l1.clock} s on the clock`);
  if (SHOTS) { await frames(p, 3); await drawFrames(p, 2); await p.screenshot({path: SHOTS + '/sortie-launch.png'}); }
  // fly to the convoy (it is seen), stop it and bomb every truck from above
  // the clock and the defenders are parked here: this part checks fog, bombs, cuts and salvage; the clock and the guns have checks of their own
  // (with them running, a far convoy on this run's random roads could use up the 2:00 on the way back and start the wave)
  const c1 = await p.evaluate(() => { const {G} = __z, so = __z.so, t = so.W.list.find(u => u.t === 'convoy'); so.S.t = 1e4; so.W.calm = true;
    so.fly(t.x, t.z + 250, 90, 100); const seen = t.seen, fog = so.fog.count(), out = so.S.home === false;
    t.halt = 1e9; for (const u of so.W.list) for (const q of u.pats) q.st = 'dead'; for (const u of so.W.list) for (const q of u.parts) if (q.aa) q.lock = -1e9;
    const k = t.cargo.k, n0 = G.next.list.reduce((a, s) => a + (s.split(':')[0] === k ? +(s.split(':')[1] || 1) : 0), 0), trucks = t.parts.filter(q => q.main).length;
    for (const q of t.parts.filter(x => x.main)) { so.drop(q.x, q.y + 40, q.z); so.hold(3.5); }
    const n1 = G.next.list.reduce((a, s) => a + (s.split(':')[0] === k ? +(s.split(':')[1] || 1) : 0), 0);
    return {seen, fog, out, k, n0, n1, trucks, dead: t.dead, all: !!t.cargo.all, carry: so.S.carry, cuts: JSON.stringify(G.next.cuts), note: Z_note(), feed: document.getElementById('feed')?.innerText || ''};
    function Z_note() { return __z.Z.cutNote(); } });
  ok(c1.seen && c1.out && c1.fog > l1.fog0, `Fog: flying out reveals ground (${l1.fog0} → ${c1.fog} cells) and the convoy is spotted`);
  ok(c1.dead && c1.n1 < c1.n0 && /Convoy destroyed/.test(c1.feed) && /Sorties/.test(c1.note), `Convoy bombed: all ${c1.trucks} trucks destroyed, next wave's ${c1.k} ${c1.n0} → ${c1.n1}${c1.all ? ' (first appearance delayed)' : ''}; forecast reads "${c1.note.replace(/<[^>]+>/g, '').slice(0, 60)}"`);
  ok(c1.carry > 0, `Salvage carried: $${c1.carry} (not banked yet)`);
  const h1 = await p.evaluate(() => { const {G, api} = __z, so = __z.so, f = api.FOBS[1], c0 = G.cash, carry = so.S.carry; so.S.t = 1e4; so.fly(f.x, f.z + 150, 60, 100); so.hold(.5); const banked = G.cash - c0, home = so.S.home;
    const diag = {dead: api.player.dead > 0, st: G.state, hull: so.S.hull, d: Math.round(Math.hypot(api.player.p.x - f.x, api.player.p.z - f.z))};
    so.finish(); return {carry, banked, home, diag, on: so.S.on, base: !document.getElementById('zbase').hidden, go: document.querySelector('[data-so="go"]')?.disabled}; });
  ok(h1.home && h1.banked === h1.carry && h1.carry > 0, `Salvage banked inside the line: +$${h1.banked}` + (h1.banked === h1.carry ? '' : ' ' + JSON.stringify(h1.diag)));
  ok(!h1.on && h1.base && h1.go === true, 'Sortie over: back on the base screen, one sortie a break (Launch disabled)');
  if (SHOTS) { await frames(p, 3); await drawFrames(p, 2); await p.screenshot({path: SHOTS + '/sortie-tab.png'}); }
  // a launch site: its sector's fast missiles next wave (the kill chain's count) and half the wave after; a factory: a third of its kind for 3 waves
  const ls = await p.evaluate(() => { const {G, Z, api} = __z, so = __z.so, W = so.W, me = 'me'; if (G.state !== 'base') Z.openBase(); __z.jump(31, 1e5);  /* each part starts on a base screen, whatever the one before did */ G.next = __z.plan(31); so.S.used = -1;
    const t = W.list.find(u => u.t === 'launch' && !u.dead), brg = [-1, 0, 1][t.sec];
    for (let i = 0; i < 3; i++) G.next.q.push({k: 'ballistic', at: 60 + i, brg}); G.next.list = G.next.q.map(e => e.k);
    const f0 = Z.fastPlan()[t.sec].total; for (const q of t.parts.filter(x => x.main)) W.blast(q, 3, 1, me);
    const f1 = Z.fastPlan()[t.sec].total, c = G.cuts.find(x => x.src === 'launch'), pad = Array.from({length: 30}, (_, i) => ({k: 'shahed', at: 9 + i, brg})), P = {q: [0, 1, 2, 3].map(i => ({k: 'ballistic', at: i, brg})).concat(pad), list: [], brgs: [brg]}; Z.cutPlan(P, c.w0 + 1); const P3 = {q: [0, 1].map(i => ({k: 'ballistic', at: i, brg})), list: []}; Z.cutPlan(P3, c.w0 + 2);
    const f = W.list.find(u => u.t === 'factory' && !u.dead); f.kind = 'shahed'; for (let i = 0; i < 10; i++) G.next.q.push({k: 'shahed', at: 70 + i, brg: 0}); G.next.list = G.next.q.map(e => e.k);
    const s0 = G.next.list.filter(k => k === 'shahed').length, h = f.parts.find(q => q.t === 'hall'); for (let i = 0; i < 5; i++) W.blast(h, 3, 1, me); const alive5 = !f.dead; W.blast(h, 3, 1, me);
    const s1 = G.next.list.filter(k => k === 'shahed').length, cf = G.cuts.find(x => x.src === 'factory');
    return {f0, f1, w: [c.w0, c.w1], half: P.q.filter(e => e.k === 'ballistic').length, after: P3.q.length, sec: t.sec, dead: t.dead, rebuild: t.rebuild, alive5, fdead: f.dead, s0, s1, fw: cf && [cf.w0, cf.w1], carry: so.S.carry}; });
  ok(ls.dead && ls.f0 >= 3 && ls.f1 === 0 && ls.w[1] === ls.w[0] + 1, `Launch site destroyed: ${['West', 'North', 'East'][ls.sec]} fast missiles next wave ${ls.f0} → ${ls.f1} (Z.fastPlan / Z.cutFast)`);
  ok(ls.half === 2 && ls.after === 2 && ls.rebuild === 33, `Launch site: half its sector's fast missiles the wave after (4 → ${ls.half}), none cut later (${ls.after} left), rebuilt at break ${ls.rebuild}`);
  ok(ls.alive5 && ls.fdead && ls.s1 < ls.s0 && ls.fw && ls.fw[1] === ls.fw[0] + 2, `Factory: holds 5 hits, the 6th destroys it; next wave's Shaheds ${ls.s0} → ${ls.s1}, cut for waves ${ls.fw}`);
  // strike order on a known target: costs money, no salvage
  const so1 = await p.evaluate(() => { const {G} = __z, so = __z.so, t = so.W.list.find(u => u.t === 'launch' && !u.dead); t.known = true; const c0 = G.cash, k0 = so.S.carry, hits = so.strike(t.id), again = so.strike(t.id);
    return {hits, again, paid: c0 - G.cash, carry: so.S.carry - k0, cost: Math.round((300 + 35 * G.wave) / 50) * 50}; });
  ok(so1.hits != null && so1.again === null && so1.paid === so1.cost && so1.carry === 0, `Strike order: $${so1.paid}, ${so1.hits} drones got through, no salvage; one strike per target a break`);
  // late: out past the line with salvage when the clock runs out; the wave starts, the drone and the salvage are lost
  const lt = await p.evaluate(() => { const {G, api} = __z, so = __z.so, fog0 = so.fog.count(); G.next = __z.plan(32); so.S.used = -1; const c0 = G.cash; so.launch(); so.fly(0, -2600, 80, 100);
    so.S.carry = 500; so.S.t = .05; so.hold(.2); return {st: G.state, dead: api.player.dead > 0, carry: so.S.carry, on: so.S.on, cash: G.cash - c0, fog: so.fog.count() >= fog0}; });
  ok(lt.st === 'wave' && lt.dead && lt.carry === 0 && !lt.on && lt.cash <= 0, 'Late return: the clock ran out outside the line; the wave started with the drone lost (relaunching) and the $500 salvage gone');
  ok(lt.fog, 'Fog: revealed ground stays known');
  ok(!errs.length, 'Sorties: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- campaign (zcampaign.js): the map, launching a sector, losing and winning it, the front moving, carry-over, save/load, corrupt saves ----------
if (want('campaign')) {
  const {p, errs} = await page('z');
  const boot = async (camp) => { await p.evaluate(c => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); if (c === undefined) delete s.zcamp; else s.zcamp = c; s.zdiff = 1; s.gmode = 'z'; s.zload = null; localStorage.setItem('dl-interceptor', JSON.stringify(s)); }, camp);
    await p.reload({waitUntil: 'load'}); return p.waitForFunction(() => window.__z, {timeout: 60000}).then(() => true, () => false); };
  // a sector run to its end: won = clear the objective wave, else the defence collapses (or the hospital falls: G.cpRes set by the rule)
  const finish = won => p.evaluate(won => { const {G, Z, api} = __z; if (G.state === 'base') __z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    if (won) { G.wave = Z.cp.run.obj; G.state = 'wave'; for (let i = 0; i < 40 && G.state !== 'over'; i++) __z.sim(.5); } else Z.gameOver();
    return {st: G.state, over: !document.getElementById('zover').hidden, h2: document.querySelector('#zover h2')?.textContent, txt: document.getElementById('zover').textContent, c: api.S.zcamp}; }, won);
  const launch = async id => { await p.evaluate(id => { __z.Z.cp.openMap(); __z.Z.cp.select(id); }, id); await p.click('#zcpgo'); return p.waitForFunction(() => __z.G.state === 'base' && !!__z.Z.cp.run, {timeout: 30000}).then(() => true, () => false); };
  await boot(undefined);
  // the start menu card and the map on a fresh campaign
  const m0 = await p.evaluate(() => { const card = document.getElementById('zcpm'); document.getElementById('zcpopen').click(); const ov = document.getElementById('zcamp'), Z = __z.Z;
    return {card: !card.hidden && /0 of 12/.test(card.textContent), play: document.getElementById('play').textContent, open: !ov.hidden, nodes: ov.querySelectorAll('.zc-n').length, front: Z.cp.front().join(), gate: Z.cp.status('gate'),
      fl: (ov.querySelector('.zc-fl')?.getAttribute('d') || '').length, sel: ov.querySelector('.zc-n.sel')?.dataset.sec, icons: ov.querySelectorAll('.zc-mi').length, go: document.getElementById('zcpgo')?.textContent}; });
  ok(m0.card && m0.play === 'Quick defence' && m0.open && m0.nodes === 12 && m0.front === 'mill,river,silo' && m0.gate === 'locked' && m0.fl > 20 && m0.icons >= 20, `Campaign map (fresh): ${m0.nodes} sectors, front ${m0.front}, capstone ${m0.gate}, ${m0.icons} modifier icons, front line drawn, selected ${m0.sel}, button "${m0.go}"`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-camp-map.png'});
  await p.keyboard.press('ArrowRight'); const kb = await p.evaluate(() => document.querySelector('#zcamp .zc-n.sel')?.dataset.sec); await p.keyboard.press('Escape');
  const esc = await p.evaluate(() => document.getElementById('zcamp').hidden && !document.getElementById('menu').hidden);
  ok(kb && kb !== m0.sel && esc, `Map keys: arrow moves the selection (${m0.sel} -> ${kb}), Esc closes the map back to the menu`);
  // Old Mill: launch from the map, win: held, reserve banked, the front moves
  ok(await launch('mill'), 'Campaign: Continue launches the selected sector (Old Mill) onto the base screen');
  const b0 = await p.evaluate(() => ({bar: document.querySelector('#zbase .zcpbar')?.textContent || '', hud: (__z.Z.hud(0), document.getElementById('zw').textContent), wx: Array.from({length: 4000}, (_, i) => __z.Z.wx.plan(2 + i % 8)?.id).filter(id => ['clear', 'scattered', 'golden'].includes(id)).length / 4000}));  /* 4000 forecasts: about 85% expected, 0.6% sampling error (200 left it a coin flip near 75%) */
  ok(/OLD MILL/.test(b0.bar) && /Hold 8 waves/.test(b0.bar) && b0.hud === 'WAVE 1/8 NEXT' && b0.wx > .75, `Sector strip on the base screen ("${b0.bar.replace(/\s+/g, ' ').trim().slice(0, 60)}"), HUD "${b0.hud}", clear-skies tendency ${Math.round(b0.wx * 100)}% fair forecasts`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-camp-base.png'});
  const w0 = await finish(true);
  ok(w0.over && w0.h2 === 'Sector held' && w0.c.held.join() === 'mill' && w0.c.res.repair === 1 && /Rail Junction, Quarry/.test(w0.txt), `Win: "${w0.h2}", held [${w0.c.held}], reserve repair ×${w0.c.res.repair}, the front moves to Rail Junction and Quarry`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-camp-won.png'});
  // River Crossing: lost -> pressure next door, nothing locked; Retry; then won -> relic, the pressure eases
  ok(await launch('river'), 'Campaign: River Crossing launched');
  const rv = await p.evaluate(() => Array.from({length: 200}, (_, i) => __z.Z.wx.plan(2 + i % 8)?.id).filter(id => id === 'night').length / 200);
  const l0 = await finish(false);
  ok(l0.h2 === 'Sector lost' && l0.c.pr.air === 1 && l0.c.pr.hosp === 1 && l0.c.pr.rail === 1 && l0.c.pr.silo === 1 && l0.c.ls.river === 1 && campFront(l0.c).includes('river') && rv > .45, `Loss: "${l0.h2}", pressure ${JSON.stringify(l0.c.pr)}, River Crossing still on the front; night tendency ${Math.round(rv * 100)}% of forecasts`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-camp-lost.png'});
  await p.click('#zcpretry'); const rt = await p.waitForFunction(() => __z.G.state === 'base' && __z.Z.cp.run?.id === 'river' && document.getElementById('zover').hidden, {timeout: 30000}).then(() => true, () => false);
  const w1 = await finish(true);
  ok(rt && w1.h2 === 'Sector held' && w1.c.relics.join() === 'warchest' && !Object.keys(w1.c.pr).length && ['rail', 'hosp', 'air', 'silo', 'quarry'].every(k => campFront(w1.c).includes(k)), `Retry, then win: relic ${w1.c.relics}, pressure eased (${JSON.stringify(w1.c.pr)}), front ${campFront(w1.c)}`);
  // Hospital Hill: the fragile site is the hospital, and losing it loses the sector (pressure on its neighbours)
  ok(await launch('hosp'), 'Campaign: Hospital Hill launched');
  const hp = await p.evaluate(() => { const {api, G, Z} = __z, h = api.SITES.find(s => s.n === 'HOSPITAL'); const r = {name: !!h, hp: h?.max}; __z.cont(); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); h.hp = 0; __z.sim(.2);
    return {...r, st: G.state, h2: document.querySelector('#zover h2')?.textContent, why: /hospital fell/.test(document.getElementById('zover').textContent), pr: api.S.zcamp.pr}; });
  ok(hp.name && hp.hp === 360 && hp.st === 'over' && hp.h2 === 'Sector lost' && hp.why && hp.pr.factory === 1 && hp.pr.ridge === 1, `Fragile hospital: ${hp.hp} hp (600 x 0.6); it falls mid-wave -> "${hp.h2}", pressure ${JSON.stringify(hp.pr)}`);
  // Grain Silos with pressure 1 (from the hospital), the war chest relic and the field repair reserve: numbers, roster, the repair button, the reserve spent
  await p.evaluate(() => { __z.Z.cp.openMap(); __z.Z.cp.select('silo'); document.querySelector('[data-crel="warchest"]').click(); document.querySelector('[data-cres="repair"]').click(); });
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-camp-briefing.png'});
  await p.click('#zcpgo'); await p.waitForFunction(() => __z.G.state === 'base' && __z.Z.cp.run?.id === 'silo', {timeout: 30000}).catch(() => {});
  const sl = await p.evaluate(() => { const {api, G, Z} = __z, r = Z.cp.run, n = [3, 5, 8].map(w => { let s = 0; for (let i = 0; i < 4; i++) s += __z.plan(w).list.filter(k => k.startsWith('swarm')).length; return s; });
    for (const s of api.SITES) s.hp = Math.round(s.max / 3); Z.base.refresh(); document.getElementById('zcprep').click(); const full = api.SITES.every(s => s.hp === s.max);
    return {pr: r.pr, wave: Z.diff().wave, cash: G.cash, cashK: Z.meta.k('cashK'), relic: r.relic, res: r.res, swarms: n, full, used: r.used, again: document.getElementById('zcprep')?.disabled}; });
  ok(sl.pr === 1 && Math.abs(sl.wave - 1.08) < 1e-9 && sl.cash === 1350 + 1200 && Math.abs(sl.cashK - .9) < 1e-9 && sl.swarms.every(n => n > 0), `Grain Silos: pressure ${sl.pr} -> waves x${sl.wave}; start cash $${sl.cash} (1500 x 0.9 + war chest 1200); income x${sl.cashK}; swarms planned in waves 3/5/8: ${sl.swarms}`);
  ok(sl.res === 'repair' && sl.full && sl.used && sl.again, 'Reserve: the field repair crew puts every site back to full once, then the button greys out');
  const w2 = await finish(true);
  ok(w2.h2 === 'Sector held' && w2.c.res.repair === 0 && w2.c.relics.join() === 'warchest,drill' && w2.c.eq === 'warchest' && !w2.c.pr.silo, `Grain Silos held: repair reserve spent (×${w2.c.res.repair}), relics ${w2.c.relics}, its own pressure cleared (${JSON.stringify(w2.c.pr)})`);
  // modifiers that need a sector deeper in: Factory Belt (forced) has no Golden Dome, hypersonics every third wave from 9, heavies from 6
  const fb = await p.evaluate(() => { const {Z, G} = __z; Z.cp.start('factory', true); const r = {id: Z.cp.run?.id, gd: Z.itemFrom('gdome'), card: G.cards.some(c => c.k === 'gdome'), hy: __z.plan(9).list.includes('hyper'), hy10: __z.plan(10).list.includes('hyper'), hv: [0, 1, 2, 3].some(() => __z.plan(7).list.includes('heavy'))};
    Z.cp.start('air', true); r.air = {shift: Z.diff().shift, cruise: Z.kindFrom('cruise'), idome: Z.itemFrom('idome')}; return r; });
  ok(fb.id === 'factory' && fb.gd === 999 && !fb.card && fb.hy && !fb.hy10 && fb.hv && fb.air.shift === 5 && fb.air.cruise === 15, `Modifiers: Factory Belt has no Golden Dome (shop and itemFrom), a hypersonic on wave 9 (not 10), heavies by wave 7; Airfield's missile front brings cruise missiles at wave ${fb.air.cruise}`);
  // save and load: a reload keeps the campaign; the map draws the held sectors and the moved front line
  const before = await p.evaluate(() => JSON.stringify(__z.api.S.zcamp)); await p.evaluate(() => __z.api.startDemo()); await boot(JSON.parse(before));
  const ld = await p.evaluate(() => { __z.Z.cp.openMap(); return {c: JSON.stringify(__z.api.S.zcamp), held: document.querySelectorAll('#zcamp .zc-n.held').length, card: document.getElementById('zcpm').textContent}; });
  ok(ld.c === before && ld.held === 3 && /3 of 12/.test(ld.card), `Save/load: the campaign survives a reload (${ld.held} held on the map, card "${ld.card.replace(/\s+/g, ' ').trim().slice(0, 40)}")`);
  if (SHOTS) { await p.evaluate(() => __z.Z.cp.select('hosp')); await p.screenshot({path: SHOTS + '/z-camp-map-mid.png'}); }
  // the capstone: sealed until 7 sectors are held, then on the front; holding it completes the campaign
  const cap = await p.evaluate(() => { const {Z} = __z, c = Z.cp.C(); c.held = ['mill', 'river', 'silo', 'rail', 'hosp', 'air']; Z.cp.put(c); const s6 = Z.cp.status('gate'); c.held.push('power'); Z.cp.put(c); const s7 = Z.cp.status('gate'); return {s6, s7}; });
  ok(await launch('gate'), 'Capstone launched once open');
  const fin = await finish(true);
  ok(cap.s6 === 'sealed' && cap.s7 === 'front' && fin.h2 === 'Campaign complete' && fin.c.done === 1, `Capstone: ${cap.s6} with 6 held, ${cap.s7} with 7; holding it: "${fin.h2}"`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-camp-complete.png'});
  // Quick defence afterwards is the plain game: no sector, standard numbers, site names back
  await p.evaluate(() => { document.getElementById('zover').hidden = true; __z.api.startDemo(); }); await play(p);
  const qd = await p.evaluate(() => ({run: __z.Z.cp.run, wave: __z.Z.diff().wave, n: __z.api.SITES.map(s => s.n).join(), cash: __z.G.cash, bar: !!document.querySelector('#zbase .zcpbar'), gd: __z.Z.itemFrom('gdome')}));
  ok(!qd.run && qd.wave === 1 && qd.n === 'SUBSTATION,FUEL DEPOT,APARTMENTS' && qd.cash === 1500 && !qd.bar && qd.gd === 28, 'Quick defence after the campaign: no sector, Normal numbers, sites and shop as usual');
  // corrupt and foreign campaign saves: each loads, the map opens, a sector launches and plays
  const bad = [];
  for (const junk of ['x', 7, [1, 2], null, {v: 99, held: ['mill']}, {v: 1, held: 'mill', pr: [1], res: 'lots'}, {v: 1, d: 9, held: [null, 'toString', '__proto__', 'mill', 'mill', 5], pr: {rail: 99, quarry: -1, bogus: 2, mill: 1}, ls: {mill: 'x'}},
    {v: 1, relics: ['ace', 'ace', 7, 'constructor'], eq: 'nope', res: {repair: -5, slot: '2', x: 1}, sel: {}, done: 1}, {v: 1, held: ['gate'], done: 1, sel: 'gate'}, JSON.parse('{"v":1,"__proto__":{"held":["mill"]},"pr":{"__proto__":{"rail":2}}}')]) {
    const n0 = errs.length, up = await boot(junk);
    let r = null;
    if (up) r = await p.evaluate(() => { try { document.getElementById('zcpopen').click(); const id = __z.Z.cp.front()[0] || 'mill'; __z.Z.cp.select(id); document.getElementById('zcpgo').click(); if (__z.G.on) { __z.cont(); __z.sim(3); } return {c: __z.api.S.zcamp, on: __z.G.on}; } catch (e) { return {err: String(e)}; } });
    if (!up || errs.length > n0 || !r || r.err || r.c?.v !== 1) bad.push(JSON.stringify(junk) + (up ? '' : ' (page never came up)') + (r?.err ? ' ' + r.err : ''));
  }
  ok(!bad.length, 'Corrupt campaign saves: every one loads, opens the map and plays a sector' + (bad.length ? '\n  ' + bad.join('\n  ') + '\n  ' + errs.slice(0, 3).join('\n  ') : ''));
  // the validator on random junk: always a well-formed campaign
  const fz = await p.evaluate(() => { const {Z} = __z, ids = Z.cp.SECTORS.map(s => s.id), R = Object.keys(Z.cp.RELICS), pickv = () => { const r = Math.random(), a = [...ids, ...R, 'x', '', null, 3, -1, 1.5, 1e9, true, {}, [], 'toString'];
      return r < .5 ? a[Math.random() * a.length | 0] : r < .7 ? a.slice(0, Math.random() * 8 | 0).sort(() => Math.random() - .5) : r < .9 ? Object.fromEntries(a.slice(0, 6).map(k => [String(k), a[Math.random() * a.length | 0]])) : undefined; };
    let badN = 0; for (let i = 0; i < 500; i++) { const j = {v: Math.random() < .8 ? 1 : pickv(), d: pickv(), held: pickv(), pr: pickv(), ls: pickv(), relics: pickv(), eq: pickv(), res: pickv(), sel: pickv(), done: pickv()};
      try { const c = Z.cp.cleanCamp(j, 1), okc = c.v === 1 && Number.isInteger(c.d) && c.d >= 0 && c.d < 4 && new Set(c.held).size === c.held.length && c.held.every(k => ids.includes(k)) && Object.entries(c.pr).every(([k, v]) => ids.includes(k) && !c.held.includes(k) && v >= 1 && v <= 2)
          && c.relics.every(k => R.includes(k)) && (c.eq === '' || c.relics.includes(c.eq)) && Object.values(c.res).every(v => Number.isInteger(v) && v >= 0 && v <= 3) && ids.includes(c.sel) && (c.done === 0 || c.done === 1);
        for (const id of ids) Z.cp.result(c, id, Math.random() < .5, null); if (!okc) badN++; } catch (e) { badN++; } } return badN; });
  ok(fz === 0, `Campaign validator: 500 random saves all clean to a well-formed campaign (${fz} bad)`);
  ok(!errs.length, 'Campaign: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.evaluate(() => localStorage.removeItem('dl-interceptor'));
  await p.close();
}

// ---------- personal swarm, lock-on and battery (zswarm.js, zlock.js, zbatt.js): deploy once per wave, no respawn on a crash, the five
// formations, attack my lock / screen / strike (air and a ground target), lock-on build / fog / Optics / break, Better battery = 2x life ----------
if (want('swarm')) {
  const {p, errs} = await page('z');
  await play(p);
  // a scripted pilot: held at least 600 m over the ground flying north at v m/s (the swarm flies around it); the wave is kept open by a spawn that never comes
  const setup = `(() => { const {api, G, Z} = __z, V = api.THREE.Vector3; window.__sw = {
    pins: [], clear() { for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); this.pins.length = 0; },
    pin(t, x, y, z) { this.pins.push([t, x, y, z]); return t; },
    home() { const me = api.player; if (!this.p0) return; const d = new V(0, 0, 2500).sub(me.p); d.y = api.gh(0, 2500) + 600 - me.p.y; me.p.add(d); for (const q of Z.sw.drones) q.p.add(d); this.p0 = me.p.clone(); this.t = 0; },  /* back to the south of the AO (its edges are walls), the swarm with it */
    fly(sec, v = 80, look = null) { const me = api.player, n = Math.round(sec * 120); if (!this.p0) { this.p0 = new V(0, api.gh(0, 0) + 600, 0); this.t = 0; }
      for (let i = 0; i < n; i++) { api.step(1 / 120); this.t += 1 / 120; if (me.dead > 0) continue; me.p.copy(this.p0).add(new V(0, 0, -v * this.t)); me.p.y = Math.max(me.p.y, api.gh(me.p.x, me.p.z) + 600);  /* terrain rises to the north */ me.v.set(0, 0, -v); me.q.setFromAxisAngle(new V(1, 0, 0), -80 * Math.PI / 180); me.w.set(0, 0, 0);
        for (const [t, x, y, z] of this.pins) { t.p.set(me.p.x + x, me.p.y + y, me.p.z + z); t.v.set(0, 0, -v); }
        const c = api.camera; c.position.copy(me.p); c.quaternion.identity(); if (look) c.lookAt(look()); c.updateMatrixWorld(); } },
    frame() { const me = __z.api.player, f = new V(0, 0, -1), r = new V(1, 0, 0), D = __z.Z.sw.drones, c = new V(); for (const d of D) c.add(d.p); c.divideScalar(Math.max(1, D.length)).sub(me.p);
      return {fwd: +c.dot(f).toFixed(1), right: +c.dot(r).toFixed(1), up: +c.y.toFixed(1), spread: +(D.reduce((m, d) => m + d.p.distanceTo(me.p), 0) / Math.max(1, D.length)).toFixed(1), lat: +Math.max(...D.map(d => Math.abs(d.p.clone().sub(me.p).dot(r)))).toFixed(1), n: D.length}; },
    ahead(k, dist, side = 0, alt = 0) { const me = api.player, t = __z.make(k, me.p.x + side, me.p.z - dist); t.p.set(me.p.x + side, me.p.y + alt, me.p.z - dist); t.alt = t.p.y - api.gh(t.p.x, t.p.z); return t; } }; })()`;
  await p.evaluate(setup);
  // battery: the Zombies pack, Better battery doubles it; flight time at full throttle measured to a flat pack with and without the perk
  const bat = await p.evaluate(() => { const {api, G, Z} = __z, me = api.player, V = api.THREE.Vector3, out = {classic: api.S.mod.bcap};
    const run = perk => { G.perks.battery = perk; Z.pk.apply(); api.launch(); const cap = api.BCAP, h = new V(0, api.gh(0, 0) + 800, 0); let t = 0;
      dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW'})); while (me.mah < cap && t < 3000) { api.step(1 / 60); t += 1 / 60; me.p.copy(h); me.v.set(0, 0, 0); me.q.identity(); me.w.set(0, 0, 0); }
      dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyW'})); return {cap, t: Math.round(t)}; };
    out.base = run(0); out.perk = run(1); G.perks.battery = 0; Z.pk.apply(); api.launch(); return out; });
  console.log('  battery:', JSON.stringify(bat));
  ok(bat.base.cap === bat.classic * 1.6 && bat.perk.cap === bat.base.cap * 2, `Battery: Zombies pack ${bat.base.cap} mAh (Classic ${bat.classic}), Better battery ${bat.perk.cap} mAh`);
  ok(Math.abs(bat.perk.t / bat.base.t - 2) < .03 && bat.base.t > 380, `Battery: full-throttle flight time ${bat.base.t} s -> ${bat.perk.t} s with Better battery (x${(bat.perk.t / bat.base.t).toFixed(2)})`);
  // the swarm: wave 12, Personal swarm level 2 (6 drones), Mk III drones
  const dep = await p.evaluate(() => { const {api, G, Z} = __z; G.cash = 50000; G.perks.swarm = 2; G.perks.swarmk = 2; __z.jump(12); api.S.zwx = 'menu'; G.next = __z.plan(12); __z.cont(); __sw.clear(); const c0 = G.cash; __sw.fly(.1);
    return {n: Z.sw.drones.length, ch: Z.sw.mine.ch, paid: c0 - G.cash, st: G.state, wave: G.wave}; });
  ok(dep.st === 'wave' && dep.n === 6 && dep.ch === 2, `Swarm: deploys ${dep.n} drones at the start of wave ${dep.wave} (Mk III: ${dep.ch} strike charges)`);
  // formations: hold each for 6 s at 80 m/s and read where the drones sit relative to the pilot (fwd + = ahead, right + = east)
  const forms = await p.evaluate(() => { const {Z} = __z, out = {}; __sw.fly(10);  /* catch up from the launch mat */
    for (const [i, f] of ['cloud', 'wedge', 'line', 'screen', 'column'].entries()) { if (f === 'screen') __sw.pin(__sw.ahead('shahed', 0, 1800), 1800, 0, 0); if (f === 'column') __sw.clear(); Z.sw.command('form#', i); __sw.fly(6); out[f] = __sw.frame(); __sw.fly(.5); out[f].err = __sw.frame().spread - out[f].spread; }
    return out; });
  console.log('  formations:', JSON.stringify(forms));
  ok(Math.hypot(forms.cloud.fwd, forms.cloud.right) < 9 && forms.cloud.spread > 10 && forms.cloud.spread < 35, `Formation cloud: centred on you (${forms.cloud.fwd}, ${forms.cloud.right}), ${forms.cloud.spread} m out`);
  ok(forms.wedge.fwd > 8, `Formation wedge: out in front (${forms.wedge.fwd} m ahead)`);
  ok(forms.line.lat > 14 && Math.abs(forms.line.fwd) < 8, `Formation line abreast: ${forms.line.lat} m either side, ${forms.line.fwd} m fore/aft`);
  ok(forms.screen.right > 25 && Math.abs(forms.screen.spread - 55) < 12, `Formation screen: a wall ${forms.screen.spread} m out toward the threat (${forms.screen.right} m to the right, where the track is)`);
  ok(forms.column.fwd < -15, `Formation column: trailing ${-forms.column.fwd} m behind`);
  ok(Object.values(forms).every(f => f.n === 6 && Math.abs(f.err) < 4), 'Formations: all 6 drones keep station at 80 m/s');
  // lock-on: a track held in the reticle locks in about 1.5 s in clear air; slower in fog, faster with Optics; looking away loses it
  const lk = await p.evaluate(() => { const {api, G, Z} = __z; __sw.clear(); __sw.home(); const out = {};
    const hold = (fog, optics) => { __sw.clear(); Z.lk.clear(); G.perks.optics = optics; const t = __sw.ahead('shahed', 1000, 0, 0); t.spd = 0; t.v.set(0, 0, -80); api.scene.fog.far = fog; let s = 0;
      while (!Z.lk.t && s < 10) { __sw.fly(.05, 80, () => t.p); t.p.set(api.player.p.x, api.player.p.y, api.player.p.z - 1000); s += .05; } return +s.toFixed(2); };
    out.clear = hold(14000, 0); out.sel = api.selT() === Z.lk.t; out.fog = hold(1100, 0); out.optics = hold(14000, 3);
    const t = Z.lk.t; __sw.pin(t, 1000, 0, 0); __sw.fly(2, 80, () => api.player.p.clone().add(new api.THREE.Vector3(-1000, 0, 0))); out.lost = !Z.lk.t && !!t;  /* off the sights and off the flight path (a lock also holds while you fly straight at it) */
    api.scene.fog.far = 14000; G.perks.optics = 0; return out; });
  ok(lk.clear > 1.1 && lk.clear < 2.2 && lk.sel, `Lock-on: ${lk.clear} s to lock a track 1 km out in clear air; it becomes the selected track`);
  ok(lk.fog > lk.clear * 1.5 && lk.optics < lk.clear * .65, `Lock-on: fog slows it (${lk.fog} s), Optics 3 speeds it up (${lk.optics} s)`);
  ok(lk.lost, 'Lock-on: looking away from a locked track drops the lock');
  // attack my lock: every drone goes after the locked track, it goes down, the survivors come back into formation
  const atk = await p.evaluate(() => { const {api, G, Z} = __z; __sw.clear(); __sw.home(); Z.sw.command('form#', 0); const t = __sw.ahead('shahed', 700, 300, 50), h0 = G.kills.h;
    Z.lk.force(t); const ok = Z.sw.command('attack'); let s = 0, eng = 0; while (api.live(t) && s < 25) { __sw.fly(.25); eng = Math.max(eng, Z.sw.drones.filter(d => d.st === 'eng').length); s += .25; }
    const killed = !api.live(t) && t.sw === 'me' && G.kills.h > h0; __sw.fly(12); return {ok, eng, killed, s, mode: Z.sw.mine.mode, back: Z.sw.drones.every(d => d.st === 'form'), n: Z.sw.drones.length}; });
  ok(atk.ok && atk.eng >= 5 && atk.killed, `Attack my lock: ${atk.eng} drones went after the locked track; down by the swarm in ${atk.s} s`);
  ok(atk.mode === 'escort' && atk.back, `Attack my lock: the ${atk.n} survivors are back in formation (mode ${atk.mode})`);
  // screen: a track passing 800 m off is left alone in escort (cloud reaches 320 m) but intercepted in screen
  const scr = await p.evaluate(() => { const {api, Z} = __z, run = mode => { __sw.clear(); __sw.home(); if (Z.sw.mine.mode !== mode) Z.sw.command('screen'); const t = __sw.ahead('shahed', 800, 120, 0); t.spd = 0; t.v.set(0, 0, -80);
      __sw.pin(t, 120, 0, -800); let eng = 0; for (let i = 0; i < 12; i++) { __sw.fly(.25); eng = Math.max(eng, Z.sw.drones.filter(d => d.st === 'eng').length); } return eng; };
    const r = {escort: run('escort'), screen: run('screen')}; Z.sw.command('form'); __sw.clear(); __sw.fly(10); return r; });
  ok(scr.escort === 0 && scr.screen >= 1, `Screen: a track 800 m ahead draws ${scr.escort} drones in escort, ${scr.screen} in screen`);
  // strike: a cloud of 6 Shaheds 2.5 km ahead; boosters, kills, survivors return; the second charge, then none left
  const stk = await p.evaluate(() => { const {api, G, Z} = __z; __sw.clear(); __sw.home(); const L = []; for (let i = 0; i < 6; i++) L.push(__sw.ahead('shahed', 2500 + i * 30, (i % 3) * 40, (i >> 1) * 15));
    Z.sw.deploy(Z.sw.mine, 6, 2); const ch0 = Z.sw.mine.ch, ok = Z.sw.command('strike'), n0 = Z.sw.drones.length; let top = 0; for (let i = 0; i < 12; i++) { __sw.fly(.25); for (const d of Z.sw.drones) top = Math.max(top, d.v.length()); }
    const isBack = () => Z.sw.drones.every(d => d.st === 'form' || d.st === 'ret'); __sw.fly(18); for (let i = 0; i < 30 && !isBack(); i++) __sw.fly(1); const down = L.filter(t => !api.live(t)).length, back = isBack();
    for (let i = 0; i < 3; i++) __sw.ahead('jet', 2000 + i * 40, 100 * i, 0);
    const ok2 = Z.sw.command('strike'), ok3 = Z.sw.command('strike'); return {ok, ch0, ch1: Z.sw.mine.ch, n0, n1: Z.sw.drones.length, top: Math.round(top), down, back, ok2, ok3}; });
  ok(stk.ok && stk.ch0 === 2 && stk.top > 250, `Strike: launched (${stk.n0} drones, top speed ${stk.top} m/s on boosters), a charge spent`);
  ok(stk.down >= 2 && stk.back, `Strike: ${stk.down} of 6 tracks down; ${stk.n1} survivors heading back`);
  ok(stk.ok2 && stk.ok3 === false && stk.ch1 === 0, `Strike: no charges left -> refused (the second charge went at three jets: ${stk.ok2})`);
  // ground target (the sorties hook): Z.groundTargets is feature-detected; the strike goes for it when no threats are around
  const gnd = await p.evaluate(() => { const {api, G, Z} = __z; __sw.clear(); __sw.home(); __sw.fly(8); Z.sw.mine.ch = 1; const me = api.player, g = {id: 7, p: {x: me.p.x + 200, y: api.gh(me.p.x + 200, me.p.z - 2000), z: me.p.z - 2000}, r: 10, alive: true, hits: 0, hit(n) { this.hits += n; }};
    Z.groundTargets = () => [g]; const ok = Z.swarm.strike(); __sw.fly(25); delete Z.groundTargets; return {ok, hits: g.hits, n: Z.sw.drones.length}; });
  ok(gnd.ok && gnd.hits > 0, `Ground strike (sorties hook): ${gnd.hits} drones hit the ground target`);
  // no respawn: two drones lost, the interceptor crashes and relaunches, the swarm is still short; the next wave brings a full set
  const rs = await p.evaluate(() => { const {api, G, Z} = __z, D = Z.sw.drones; D.splice(0, 2); const n0 = D.length; api.lose('crash'); __sw.fly(3.5); api.launch(); __sw.fly(3);
    const n1 = Z.sw.drones.length; G.wq.length = 0; __sw.clear(); G.wq.length = 0; __z.sim(8); const base = G.state; __z.cont(); __sw.clear(); __sw.fly(.2); return {n0, n1, base, n2: Z.sw.drones.length, wave: G.wave}; });
  ok(rs.n1 === rs.n0 && rs.base === 'base' && rs.n2 === 6, `No respawn: ${rs.n0} drones before the crash, ${rs.n1} after the relaunch; wave ${rs.wave} deploys ${rs.n2} again`);
  // lock break on Nightmare: a locked evader jinks and breaks the lock (dice loaded for the test)
  const brk = await p.evaluate(() => { const {api, G, Z} = __z; __sw.clear(); __sw.home(); G.dfo = 3; const t = __sw.ahead('shahed', 900, 0, 0); t.spd = 0; Z.lk.force(t); const r0 = Math.random; Math.random = () => 0; let s = 0;
    while (Z.lk.t && s < 4) { __sw.fly(.05, 80, () => t.p); t.p.set(api.player.p.x, api.player.p.y, api.player.p.z - 900); s += .05; } Math.random = r0; G.dfo = undefined; return {broken: !Z.lk.t, s: +s.toFixed(2), brk: t.brk > 0}; });
  ok(brk.broken && brk.brk, `Lock-on: on Nightmare a locked evader jinks and breaks the lock (after ${brk.s} s)`);
  // HUD: the swarm panel and the battery readout
  await p.evaluate(() => { __sw.fly(.5); __z.api.visuals(1 / 60, performance.now()); __z.api.hud?.(1 / 60); });
  await frames(p, 6);
  const hud = await p.evaluate(() => ({sw: document.getElementById('zsw')?.textContent || '', swOn: !document.getElementById('zsw')?.hidden, bat: document.getElementById('zbat')?.textContent || '', batOn: !document.getElementById('zbat')?.hidden}));
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-swarm-hud.png'});
  ok(hud.swOn && /SWARM \d+\/6/.test(hud.sw) && /attack lock/.test(hud.sw), `HUD: swarm panel "${hud.sw.slice(0, 60)}"`);
  ok(hud.batOn && /\d+% · \d+:\d\d · [\d.]+ km/.test(hud.bat), `HUD: battery readout "${hud.bat}"`);
  // Classic is untouched: back to the menu, Classic's pack is Riley's again
  const cls = await p.evaluate(() => { __z.api.startDemo(); return {cap: __z.api.BCAP, mod: __z.api.S.mod.bcap, panel: document.getElementById('zsw').hidden}; });
  ok(cls.cap === cls.mod && cls.panel, `Classic: battery back to ${cls.cap} mAh, swarm panel hidden`);
  ok(!errs.length, 'Swarm / lock / battery: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- spatial grid (grid.js): every query gives what a plain loop over TH gives (random scenes); a whole wave with the helpers, the
// swarm, lock-on, the fuse and direct hits ends exactly the same with the grid and with plain loops (grid.brute), same seed and clock ----------
if (want('grid')) {
  const {p, errs} = await page('z');
  await play(p);
  const q = await p.evaluate(() => { const {api} = __z, g = api.grid, TH = api.TH, V = api.THREE.Vector3; let s = 99; const R = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const keep = TH.splice(0); let bad = 0, checks = 0, cells = 0; const ex = [];
    for (let sc = 0; sc < 80; sc++) { TH.length = 0; const N = 1 + (R() * 320 | 0), spread = [300, 3000, 9000, 40000][sc % 4];
      for (let i = 0; i < N; i++) TH.push({id: i + 1, st: R() < .15 ? 'dead' : R() < .1 ? 'fall' : 'cruise', p: new V((R() - .5) * spread * 2, R() * 3000, (R() - .5) * spread * 2 + (R() < .3 ? 1950 : 0)), v: new V()});
      if (sc % 5 === 0) for (let i = 0; i < 12; i++) TH.push({id: 1000 + i, st: 'cruise', p: TH[0].p.clone(), v: new V()});  /* exact ties */
      for (let k = 0; k < 50; k++) { const P = new V((R() - .5) * spread * 2.4, R() * 2000, (R() - .5) * spread * 2.4), r = [5, 30, 71, 350, 1800, 4500, 14000, 9e9][k % 8] * (.5 + R()), stop = 1 + (R() * 20 | 0);
        const inR = (t, c, rr) => Math.hypot(t.p.x - c.x, t.p.z - c.z) <= rr;  /* the callers' own tests are like this one */
        const run = brute => { g.brute = brute; g.open(); const a = []; let m = 0;
          g.near(P, r, t => { if (!inR(t, P, r)) return; a.push(t.id); if (k % 3 === 0 && a.length === 2) g.near(t.p, 200, u => { if (inR(u, t.p, 200)) a.push(-u.id); }); return k % 4 === 0 && ++m >= stop; });  /* nested queries, early stop */
          const nb = g.nearest(P, api.live); g.close(); return a.join(',') + '|' + (nb ? nb.id : 0); };
        const A = run(false), B = run(true); checks++; if (A !== B) { bad++; if (ex.length < 2) ex.push({sc, k, r, A: A.slice(0, 80), B: B.slice(0, 80)}); } } }
    g.brute = false; TH.length = 0; TH.push(...keep); return {bad, checks, ex}; });
  ok(!q.bad, `Grid: ${q.checks} neighbour / nearest queries on random scenes match a plain loop over TH` + (q.bad ? ` (${q.bad} differ: ${JSON.stringify(q.ex)})` : ''));
  ok(!errs.length, 'Grid queries: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
  // a whole wave 18 (helpers, a 6-drone swarm, a pilot chasing the most urgent track with the proximity fuse, lock-on): grid vs plain loops,
  // each in a fresh page with Math.random seeded from the start and a fake clock (and audio clock), so the two runs are the same game
  const RUN = brute => { const {api, G, Z} = __z, pn = performance.now; let T = 1e7, s = 777; performance.now = () => T; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    Object.defineProperty(BaseAudioContext.prototype, 'currentTime', {get: () => T / 1000, configurable: true});  /* the audio clock too: some sounds draw random numbers on its time */
    try { api.grid.brute = brute; api.startMatch(); const cam = api.camera, V = api.THREE.Vector3;
      G.perks.swarm = 2; G.perks.swarmk = 1; G.perks.fuse = 1; Z.pk.apply();
      [['rack', 0, 3], ['gepard', 1], ['flak', 6], ['sam', 9], ['ew', 10], ['rack', 12, 2], ['gepard', 4], ['rack', 3, 1]].forEach(([t, sl, l]) => { const d = Z.def.add(t, sl); if (t === 'rack') { d.tier = l; d.cap = 3; } else d.lvl = 1; });
      __z.jump(18, 40000); G.next = __z.plan(18); __z.cont(); api.WB.set(3, 0, -2); api.WIND.set(3, 0, -2);
      const me = api.player, dir = new V(), h = 1 / 120; let shots = 0, dets = 0, was = true;
      for (let i = 0; i < 120 * 80 && G.state === 'wave'; i++) {
        if (me.dead <= 0) { const t = Z.urgent(); if (t) { dir.copy(t.v).normalize(); me.p.copy(t.p).addScaledVector(dir, -(4 + 26 * Math.sin(i / 40) ** 2)).add(new V(2, 1, 0)); me.v.copy(t.v); cam.position.copy(me.p); cam.lookAt(t.p); cam.updateMatrixWorld(); } }
        else if (i % 120 === 0) api.launch();
        if (i === 1800) Z.sw.command('screen'); if (i === 3000) Z.sw.command('strike');
        api.step(h); T += 1000 / 120; shots = Math.max(shots, Z.def.shots.length); if (was && me.dead > 0) dets++; was = me.dead <= 0;
        if (i % 12 === 11) api.visuals(h * 12, T); }
      const r = x => Math.round(x * 1e6) / 1e6, P = v => [r(v.x), r(v.y), r(v.z)];
      return JSON.stringify({st: G.state, w: G.wave, k: G.kills, cash: r(G.cash), earned: r(G.earned), sites: api.SITES.map(q => r(q.hp)), dets, shots, lock: Z.lk.t?.id || 0, sel: api.selT()?.id || 0,
        th: api.TH.map(t => [t.id, t.st, ...P(t.p), t.claim ? 1 : 0]), sh: Z.def.shots.map(q => [q.id, ...P(q.p)]), sw: Z.sw.drones.map(d => [d.st, ...P(d.p)]), me: [...P(me.p), r(me.dead)], rnd: Math.random()});
    } finally { performance.now = pn; api.grid.brute = false; } };
  const game = async brute => { const errs = [], p = await open(browser, 'about:blank', errs);
    await p.evaluateOnNewDocument(() => { let s = 4242; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; });
    await p.goto(origin + '/games/interceptor/', {waitUntil: 'load'}); await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0})));
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000});
    const o = await p.evaluate(RUN, brute); await p.close(); return {o, errs}; };
  const A = await game(false), B = await game(true), a = JSON.parse(A.o), b = JSON.parse(B.o);
  console.log(`  grid game: wave ${a.w} ${a.st}, ${a.k.p} pilot / ${a.k.h} helper kills, ${a.dets} bursts, ${a.th.length} tracks, up to ${a.shots} shots, ${a.sw.length} swarm drones`);
  ok(a.k.p + a.k.h >= 10 && a.dets > 3 && a.sw.length, `Grid game: busy enough to mean something (${a.k.p + a.k.h} kills, ${a.dets} bursts)`);
  ok(A.o === B.o, `Grid: a whole wave plays out identically with the grid and with plain loops (${A.o.length} chars of end state compared)` + (A.o === B.o ? '' : `\n  grid ${A.o.slice(0, 300)}\n  loop ${B.o.slice(0, 300)}`));
  ok(!A.errs.length && !B.errs.length, 'Grid game: no errors' + (A.errs.length + B.errs.length ? '\n  ' + [...A.errs, ...B.errs].join('\n  ') : ''));
}

// ---------- boss roster (zbosses.js + zboss-*.js): the registry and spawn rules, then every boss through the debug trigger: its intro, its
// code-built model with canvas decals, its sounds, its phases, beaten by the bot pilots' real burst path, its reward granted and recorded;
// the special mechanics one by one (the Ace's learning, lock and record, the Ghost of the Ace chain, the Jammer King's reveal and hunt, the
// Twins' link, the Juggernaut's weak points, the Hive's split, the Mirror's habits, the Undertaker's drain and growth, the Siren's false IFF,
// the Puppeteer's wires and trails) ----------
if (want('bosses')) {
  const {p, errs} = await page('z');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); delete s.zboss; localStorage.setItem('dl-interceptor', JSON.stringify({...s, zwx: 'menu'})); sessionStorage.setItem('zbossRoster', '1'); });
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 3);
  await play(p);
  await p.evaluate(() => { const {G} = __z; G.cash = 1e5; __z.jump(24); G.next = __z.plan(24); __z.cont();
    window.__b = {
      // an empty wave that stays open (a queue entry far in the future), sites full, nothing in the air
      clear() { const {api, G} = __z; for (const t of api.TH) t.st = 'dead'; __z.sim(.1); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); G.benc = []; for (const s of api.SITES) s.hp = s.max; if (api.player.dead > 0) api.launch(); },
      // the bot pilots' boss runs (zbot.mjs) until the fight is over; returns the phases seen and the outcome
      beat(t, n = 260) { const {api, Z} = __z, ph = new Set([t.bs.ph]); let k = 0; for (let i = 0; i < n; i++) { if (api.player.dead > 0) api.launch(); if (Z.bosses.bot(1)) k++; __z.sim(.3);
          const D = Z.bosses.BOSSES[t.k]; if (D.phaseName) ph.add(D.phaseName(Z.bosses.ctx, t.bs.enc)); else for (const u of api.TH) if (u.bs && u.bs.enc === t.bs.enc && !Z.bosses.BOSSES[u.k].minor && !u.bs.dead) ph.add(u.bs.ph); if (t.bs.enc.over) break; }
        return {ph: [...ph], won: !!t.bs.enc.won, runs: k}; },
      decals(t) { let n = 0; t.mesh.traverse(o => { for (const m of [o.material, o.userData?.m0]) if (m && m.map && m.map.image instanceof HTMLCanvasElement) n++; }); return n; },
      V: (x, y, z) => new __z.api.THREE.Vector3(x, y, z)};
    __z.sim(.5); });
  // registry and spawn rules
  const reg = await p.evaluate(() => { const {Z, KIND, G} = __z, B = Z.bosses, r0 = Math.random, out = {ids: B.ROSTER.slice(), kinds: B.ROSTER.every(k => KIND[k]?.bossy && KIND[k].armor), rewards: Object.keys(B.REWARDS).length};
    G.bseen = {}; out.w10 = __z.plan(10).list.filter(k => k === 'boss' || B.BOSSES[k]);
    const pool = new Set(); for (let i = 0; i < 80; i++) { G.bseen = {}; pool.add(__z.plan(30).list.find(k => k === 'boss' || B.BOSSES[k])); } out.pool = [...pool];
    G.bevW = -99; Math.random = () => .001; try { out.ev = __z.plan(27).list.filter(k => B.BOSSES[k]); out.ev28 = __z.plan(28).list.filter(k => B.BOSSES[k]).length; G.bevW = -99; out.ev30 = __z.plan(30).list.filter(k => k === 'boss' || B.BOSSES[k]).length; } finally { Math.random = r0; }
    out.force = B.force('hive') && __z.plan(13).list.includes('hive'); G.bevW = -99; G.bseen = {}; return out; });
  console.log('  roster:', reg.ids.join(', '), '· wave 30 pool:', reg.pool.join(', '));
  ok(['ace', 'gace', 'jammer', 'twins', 'jugg', 'ghost', 'hive', 'mirror', 'undertaker', 'siren', 'puppet'].every(k => reg.ids.includes(k)) && reg.kinds && reg.rewards >= 11, `Registry: ${reg.ids.length} bosses registered with registerBoss, each a KIND with ${reg.rewards} rewards`);
  ok(reg.w10.join() === 'boss' && reg.pool.length >= 4 && reg.pool.includes('boss'), `Boss waves: wave 10 is the Mothership; wave 30 draws from ${reg.pool.length} bosses`);
  ok(reg.ev.length === 1 && reg.ev30 === 1 && reg.ev28 === 0 && reg.force, `Events: one rare boss on wave 27 (${reg.ev}), none on a boss wave, none the next wave (3 apart); force() puts one in the next plan`);
  // every boss: debug trigger, intro, model with canvas decals, sounds, phases, beaten through the real burst path, reward, record
  const ids = ['twins', 'jugg', 'ghost', 'hive', 'mirror', 'siren', 'jammer'];
  const runs = await p.evaluate(ids => { const {api, Z, G} = __z, out = {};
    G.hab = {n: 400, alt: 300 * 400, spd: 90 * 400, L: 300, R: 100, asp: {'LEVEL SIX': 9, 'HIGH BEAM': 2}, side: {LEFT: 6, RIGHT: 5}, dets: 0, yaw: null, t: 0};  /* habits for the Mirror to copy */
    for (const id of ids) { __b.clear(); api.player.v.set(0, 0, -40); const t = Z.bosses.spawn(id), D = Z.bosses.BOSSES[id]; __z.sim(3);
      const o = {intro: !!t.bs.intro, decals: __b.decals(t), sound: typeof D.sting === 'function' && typeof D.loop === 'function', max: t.bs.max, phases: D.phases?.length || 1, net: Z.bossOut(t).every(Number.isFinite)};
      Object.assign(o, __b.beat(t)); o.reward = !!G.brw[D.reward.id]; o.won0 = api.S.zboss?.b?.[id]?.won | 0; out[id] = o; } return out; }, ids);
  for (const id of ids) { const o = runs[id]; console.log(`  ${id}:`, JSON.stringify(o));
    ok(o.intro && o.decals >= 2 && o.sound && o.net, `${id}: spawned by the debug trigger, intro played, model with ${o.decals} canvas-decal materials, signature and presence sounds`);
    ok(o.won && o.ph.length >= Math.min(2, o.phases) && o.reward && o.won0 === 1, `${id}: beaten in ${o.runs} bot runs, phases ${o.ph.join('→')}, reward granted and the win recorded`); }
  // the Ghost (stealth): no radar track far out, seen up close; the lock slips
  const gh = await p.evaluate(() => { __b.clear(); const {api, Z} = __z, t = Z.bosses.spawn('ghost'); __z.sim(2); Z.fxTest?.endCine(); t.p.set(-2500, api.gh(-2500, -2800) + 1100, -2800); const me = api.player, cam = api.camera, far = Z.seen(t), hid = Z.hid(t); me.p.copy(t.p).add(__b.V(0, 0, 600)); const near = Z.seen(t);
    Z.lk.force(t); let s = 0; while (Z.lk.t === t && s < 5) { me.p.copy(t.p).add(__b.V(0, 0, 600)); cam.position.copy(me.p); cam.lookAt(t.p); cam.updateMatrixWorld(); __z.sim(.1); s += .1; } const slip = +s.toFixed(1), lj = Z.lockJam(t); t.st = 'dead'; return {far, hid, near, slip, lj}; });
  ok(!gh.far && gh.hid && gh.near && gh.slip > 1.5 && gh.slip < 3 && gh.lj > 100, `Ghost: off radar and unbracketed far out, seen within 1.2 km; a lock slips after ${gh.slip} s and will not take again for 3 s`);
  // the Twins: the link soaks proximity bursts until it snaps; kill one and the other enrages
  const tw = await p.evaluate(() => { __b.clear(); const {api, Z} = __z; Z.bosses.spawn('twins'); __z.sim(1.5); const [a, b] = api.TH.filter(t => t.k === 'twins' && api.live(t)); b.p.copy(a.p).add(__b.V(40, 0, 0));
    const h0 = a.bs.hp; Z.bosses.hitAt(a, 'damage', a.p); const s1 = a.bs.strain, h1 = a.bs.hp; Z.bosses.hitAt(a, 'damage', a.p); const snap = a.bs.snap > 0; Z.bosses.hitAt(a, 'damage', a.p); const h2 = a.bs.hp;
    for (let i = 0; i < 4 && api.live(b); i++) { b.bs.snap = 8; Z.bosses.hitAt(b, 'kill', b.p); } __z.sim(.1); const r = {h0, s1, h1, snap, h2, rage: a.bs.rage, bdead: b.st === 'dead'}; a.st = 'dead'; return r; });
  ok(tw.h1 === tw.h0 && tw.s1 === 1 && tw.snap && tw.h2 === tw.h0 - 1, `Twins: linked, a proximity burst only strains the link (${tw.s1}/2); the second snaps it; then it counts (${tw.h0} → ${tw.h2})`);
  ok(tw.bdead && tw.rage === 1, 'Twins: kill POLLUX and CASTOR enrages');
  // the Juggernaut: armour shrugs off bursts away from the glowing weak points; stages blow the plates off the next ones
  const jg = await p.evaluate(() => { __b.clear(); const {api, Z} = __z, t = Z.bosses.spawn('jugg'); __z.sim(2); const W = [[2.2, 2.9, -11.6], [-2.2, 2.9, -11.6], [3.3, 0, 0], [-3.3, 0, 0], [0, -3.3, 5], [0, 0, 24.4]];
    const wp = i => { t.mesh.updateMatrixWorld(); return __b.V(...W[i]).applyMatrix4(t.mesh.matrixWorld); }, on = () => t.mesh.userData.plates.filter(q => q.on).length, out = {h0: t.bs.hp, p0: on()};
    Z.bosses.hitAt(t, 'damage', t.p.clone()); out.center = t.bs.hp; Z.bosses.hitAt(t, 'damage', wp(2)); out.covered = t.bs.hp;
    Z.bosses.hitAt(t, 'damage', wp(0)); out.wp0 = t.bs.hp; Z.bosses.hitAt(t, 'damage', wp(1)); out.wp1 = t.bs.hp; __z.sim(.5); out.p1 = on(); out.ph = t.bs.ph; Z.bosses.hitAt(t, 'damage', wp(2)); out.vent = t.bs.hp; __z.sim(.3); out.fires = t.mesh.userData.applied.filter(Boolean).length;
    out.slow = t.spd; out.won = __b.beat(t).won; return out; });
  ok(jg.center === jg.h0 && jg.covered === jg.h0 && jg.wp0 === jg.h0 - 1 && jg.wp1 === jg.h0 - 2, `Juggernaut: a burst at the hull or on a covered vent does nothing; each glowing weak point hit counts (${jg.h0} → ${jg.wp1})`);
  ok(jg.p1 < jg.p0 && jg.ph === 1 && jg.vent === jg.wp1 - 1 && jg.fires >= 3 && jg.won, `Juggernaut: stage 1 cleared blew ${jg.p0 - jg.p1} plates off (BREACHED), the vents opened; fires at ${jg.fires} weak points; beaten`);
  // the Hive splits into three brood carriers at half strength
  const hv = await p.evaluate(() => { __b.clear(); const {api, Z} = __z, t = Z.bosses.spawn('hive'); __z.sim(1); for (let i = 0; i < 4; i++) Z.bosses.hitAt(t, 'damage', t.p.clone()); __z.sim(.2);
    const b = api.TH.filter(u => u.k === 'brood' && api.live(u)); const r = {split: t.bs.split, gone: t.st, broods: b.length, sites: new Set(b.map(u => u.bs.site?.n)).size}; for (const u of b) u.st = 'dead'; return r; });
  ok(hv.split && hv.broods === 3 && hv.sites >= 2, `Hive: at half strength it splits into ${hv.broods} brood carriers bound for ${hv.sites} sites`);
  // the Mirror: bursts from your favourite aspect glance off; from another aspect they count
  const mr = await p.evaluate(() => { __b.clear(); const {api, Z} = __z, t = Z.bosses.spawn('mirror'); __z.sim(1); const r0 = Math.random, v = t.v.clone().normalize(); Math.random = () => .5;
    try { const h0 = t.bs.hp; Z.bosses.hitAt(t, 'damage', t.p.clone().addScaledVector(v, -4)); const fav = t.bs.hp; Z.bosses.hitAt(t, 'damage', t.p.clone().add(__b.V(0, 4, 0))); const off = t.bs.hp; t.st = 'dead'; return {h0, fav, off, h: t.bs.h.fav}; } finally { Math.random = r0; } });
  ok(mr.fav === mr.h0 && mr.off === mr.h0 - 1, `Mirror: it copies your habit (${mr.h}); a burst from there glances off, one from above counts (${mr.h0} → ${mr.off})`);
  // the Ace of Aces: he files your approaches and breaks early against your favourite; his lock and missile; the record between runs
  const ace = await p.evaluate(() => { __b.clear(); const {api, Z, G} = __z, t = Z.bosses.spawn('ace'), me = api.player; __z.sim(1); t.p.set(0, api.gh(0, 600) + 600, 600); t.bs.mcd = 99;  /* inside the area: the pilot cannot follow it past the edge */
    const run = (up, back, side = 0) => { if (me.dead > 0) api.launch(); const f = t.v.clone().setY(0).normalize(), r = __b.V(-f.z, 0, f.x); me.p.copy(t.p).addScaledVector(f, -back).addScaledVector(r, side).add(__b.V(0, up, 0)); me.v.copy(t.v).multiplyScalar(2); t.bs.brkCd = 0; t.bs.brkT = 0; __z.sim(1 / 60); const b = t.bs.brkT > 0;
      me.p.add(__b.V(t.p.x > 0 ? -2000 : 2000, 300, 0)); __z.sim(1 / 60); return b; };  /* away toward the middle (straight up would hit the 4 km ceiling, sideways the edge of the area) */
    const out = {}; for (let i = 0; i < 6 && t.bs.fav !== 'HIGH SIX'; i++) run(260, 430); out.fav = t.bs.fav; out.dbg = {learn: t.bs.learn, dead: me.dead, d: Math.round(me.p.distanceTo(t.p)), st: t.st};  /* a run can be lost to a stray hazard in the harness: up to six */ out.brkFav = run(260, 470); out.brkOther = run(-200, 0, 470);
    t.bs.mcd = 0; t.bs.brkCd = 99; t.bs.ext = 0; const f = t.v.clone().normalize(); let s = 0; while (!(t.bs.mcd > 0) && s < 8) { me.p.copy(t.p).addScaledVector(f, 500); me.v.copy(t.v); __z.sim(.1); s += .1; } out.lockT = +s.toFixed(1);
    const k0 = api.S.zboss.ace.kills | 0; s = 0; while (me.dead <= 0 && s < 10) { __z.sim(.1); s += .1; } out.shot = me.dead > 0; out.kills = (api.S.zboss.ace.kills | 0) - k0;
    out.beat = __b.beat(t); out.rec = JSON.parse(localStorage.getItem('dl-interceptor')).zboss.ace; out.reward = !!G.brw.instinct; return out; });
  console.log('  ace:', JSON.stringify(ace));
  ok(ace.fav === 'HIGH SIX' && ace.brkFav && !ace.brkOther, `Ace: runs from the high six make it his favourite read (${ace.fav}); he breaks early against it at 470 m, not against a low beam pass` + (ace.fav === 'HIGH SIX' ? '' : ' ' + JSON.stringify(ace.dbg)));
  ok(ace.lockT > 1.5 && ace.lockT < 4 && ace.shot && ace.kills === 1, `Ace: sitting in his nose cone he locks in ${ace.lockT} s and his missile gets you; the kill goes on his record`);
  ok(ace.beat.won && ace.reward && ace.rec.beaten === 1 && ace.rec.met >= 1, `Ace: beaten (phases ${ace.beat.ph.join('→')}); Ace Instinct granted; record saved between runs (met ${ace.rec.met}, beaten ${ace.rec.beaten}, kills ${ace.rec.kills})`);
  // the Ghost of the Ace: the wreck only exists once the Ace has been beaten; find it and he returns next wave with spectres of what you killed
  const g0 = await p.evaluate(() => ({wreck: !!__z.G.wreck}));
  await p.evaluate(() => { document.getElementById('zover').hidden = true; __z.api.startDemo(); }); await play(p);
  const ga = await p.evaluate(() => { const {api, Z, G} = __z, w = G.wreck, out = {wreck: !!w}; if (!w) return out; out.far = Math.round(Math.hypot(w.x - 0, w.z - 1950)); out.inAO = Math.abs(w.x) < 4300 && Math.abs(w.z) < 4300;
    G.cash = 1e5; __z.jump(20); G.next = __z.plan(20); __z.cont(); __b.clear(); out.before = G.gnext | 0; api.player.p.set(w.x, w.y + 12, w.z); api.player.v.set(0, 0, 0); __z.sim(.2); out.found = w.found; out.gnext = G.gnext; out.note = /stirs/.test(Z.tacNote());
    G.fallen = {jet: 4, heavy: 2, shahed: 6}; G.wq.length = 0; for (const t of api.TH) t.st = 'dead'; __z.sim(5); out.base = G.state; __z.cont(); __z.sim(1); const g = api.TH.find(t => t.k === 'gace');
    out.ghost = !!g; out.spec = [...new Set(api.TH.filter(t => t.k === 'spectre' && api.live(t)).map(t => t.src))]; out.nspec = api.TH.filter(t => t.k === 'spectre' && api.live(t)).length; if (!g) return out;
    G.wq.push({k: 'shahed', at: 1e9, brg: 0}); out.decals = __b.decals(g); out.beat = __b.beat(g, 400); out.reward = !!G.brw.deathless;
    if (api.player.dead > 0) api.launch(); __z.sim(.1); out.save1 = Z.bosses.ctx.shoot('test'); out.alive = api.player.dead <= 0; out.save2 = Z.bosses.ctx.shoot('test'); out.rec = api.S.zboss.ghost; return out; });
  console.log('  ghost of the ace:', JSON.stringify(ga));
  ok(!g0.wreck && ga.wreck && ga.far > 1800 && ga.inAO, `Ghost of the Ace: no wreck before the Ace is beaten; after, a wreck lies ${ga.far} m out inside the area of operations (beyond the river line when sorties exist)`);
  ok(ga.before === 0 && ga.found && ga.gnext === 1 && ga.note, 'Ghost of the Ace: flying over the wreck finds it; the base screen warns that something stirs');
  ok(ga.ghost && ga.nspec >= 4 && ga.spec.every(k => ['jet', 'heavy', 'shahed'].includes(k)), `Ghost of the Ace: next wave he rises with ${ga.nspec} spectres of what you killed (${ga.spec})`);
  ok(ga.beat?.won && ga.beat.ph.length >= 2 && ga.reward && ga.rec?.beaten === 1, `Ghost of the Ace: beaten (phases ${ga.beat?.ph.join('→')}), Deathless granted, recorded`);
  ok(ga.save1 === false && ga.alive && ga.save2 === true, 'Deathless: the first interceptor loss of a wave is undone, the second is not');
  // the Jammer King: the silhouette, then gone; the jamming; its windows, relay pods and bearing lines, the overload, the exposed network
  const jk = await p.evaluate(() => { __b.clear(); const {api, Z, G} = __z, other = Z.make('shahed', 0, -2000), rk0 = Z.radarK(), lj0 = Z.lockJam(other), t = Z.bosses.spawn('jammer'); __z.sim(.3);
    const out = {sil: t.bs.sil > 0, silVis: t.mesh.visible, seen0: Z.seen(t), hid0: Z.hid(t)}; t.bs.pt = 0; out.lj = +(Z.lockJam(other) / lj0).toFixed(2); out.rk = +(Z.radarK() / rk0).toFixed(2);
    __z.sim(5); out.gone = !t.mesh.visible && Z.hid(t) && !Z.seen(t); out.pods = api.TH.filter(u => u.k === 'jpod' && api.live(u)).length; api.player.p.set(0, api.gh(0, 1950) + 6000, 1950); out.podRadar = api.TH.filter(u => u.k === 'jpod').every(u => !Z.seen(u));
    api.player.p.copy(t.p).add(__b.V(0, 0, 3000)); t.bs.pt = 8.5; out.winSeen = Z.seen(t); out.winLj = +(Z.lockJam(other) / lj0).toFixed(2); t.bs.pt = 0;
    const pods = api.TH.filter(u => u.k === 'jpod' && api.live(u)); for (const q of pods.slice(0, 2)) { q.by = 'p'; api.killThreat(q, true); } out.lines = t.bs.lines.length;
    const q = pods[2]; for (let i = 0; i < 8; i++) { const u = Z.make('shahed', q.p.x, q.p.z); u.p.copy(q.p).add(__b.V(i * 20, -50, 0)); u.by = 'p'; api.killThreat(u, true); } out.surf = t.bs.surf; out.surfSeen = Z.seen(t);
    for (const u of pods.slice(2)) { u.by = 'p'; api.killThreat(u, true); } __z.sim(.2); out.exposed = t.bs.exposed; out.status = document.getElementById('zbb') ? 1 : 0; other.st = 'dead'; return out; });
  console.log('  jammer:', JSON.stringify(jk));
  ok(jk.sil && jk.silVis && !jk.seen0 && jk.hid0 && jk.gone, 'Jammer King: shows once as a silhouette in the haze, then vanishes into the fog (no radar track, no bracket)');
  ok(jk.lj >= 2 && jk.rk <= .6 && jk.pods >= 3 && jk.podRadar, `Jammer King: while it jams, lock-on x${jk.lj} slower and radar range x${jk.rk}; ${jk.pods} relay pods off radar`);
  ok(jk.winSeen && jk.winLj === 1, 'Jammer King: in a jamming window it shows on radar within 6 km and your lock is normal');
  ok(jk.lines === 2 && jk.surf > 0 && jk.surfSeen && jk.exposed === 1, `Jammer King: two relay pods down draw ${jk.lines} bearing lines; 8 kills inside a bubble overload it (surfaced ${Math.round(jk.surf)} s); every pod down exposes it`);
  // the Undertaker: comes for a lost site, strips it and drains the others, grows armour; waits over the base screen; repairs starve it
  const ut = await p.evaluate(() => { __b.clear(); const {api, Z, G} = __z, S = api.SITES, out = {}; G.utW = -99; G.uthp = null; __z.sim(.1); S[0].hp = 0; __z.sim(9); const t = api.TH.find(u => u.k === 'undertaker'); out.came = !!t; if (!t) return out;
    __z.sim(45); out.on = t.bs.on; const hp0 = S.slice(1).map(s => s.hp); __z.sim(10); out.drained = S.slice(1).map((s, i) => +(hp0[i] - s.hp).toFixed(1)); out.armor = t.bs.hp - 2; out.decals = __b.decals(t);
    const a0 = t.bs.hp; G.wq.length = 0; __z.sim(4); out.gone = t.st === 'dead' && !api.TH.some(u => u.k === 'undertaker' && u.st !== 'dead'); out.kept = G.bkeep?.undertaker?.hp; __z.sim(5); out.state = G.state; out.note = /UNDERTAKER[\s\S]*armour/.test(Z.tacNote());
    out.fx = Z.bosses.fx(); __z.cont(); __z.sim(.2); const t2 = api.TH.find(u => u.k === 'undertaker' && api.live(u)); out.back = !!t2 && t2.bs.anchor === S[0]; out.grew = t2 ? t2.bs.hp - a0 : -1;
    G.wq.push({k: 'shahed', at: 1e9, brg: 0}); S[0].hp = Math.round(S[0].max * .5); __z.sim(.2); out.starved = t2 && t2.bs.hp < a0 + out.grew; out.leave = t2?.bs.leave | 0;
    const u = Z.bosses.spawn('undertaker', {x: S[1].x, z: S[1].z - 100}); S[1].hp = 20; u.bs.anchor = S[1]; __z.sim(1); out.beat = __b.beat(u); out.reward = !!G.brw.ledger; for (const s of S) s.hp = s.max; return out; });
  console.log('  undertaker:', JSON.stringify(ut));
  ok(ut.came && ut.on === 1 && ut.drained.every(d => d > 3) && ut.armor >= 1, `Undertaker: comes for the lost substation, strips it and drains the other sites (${ut.drained.join(' / ')} hp in 10 s), armour +${ut.armor} while it worked`);
  ok(ut.gone && ut.kept > 2 && ut.state === 'base' && ut.note && ut.fx.tracks === 0 && ut.fx.tethers === 0 && ut.back && ut.grew === 2, 'Undertaker: the wave still ends; it sinks into the wreck (track, tethers and drain gone; its armour kept for the run, shown on the forecast) and rises next wave 2 plates bigger');
  ok(ut.starved && ut.leave === 1 && ut.beat.won && ut.reward, 'Undertaker: repairing the wreck above 35% starves it (plates fall, it leaves); a fresh one beaten for the Ledger');
  // the Siren: drones within its song read friendly (green) and your helpers hold fire; within 600 m you see it for what it is
  const sr = await p.evaluate(() => { __b.clear(); const {api, Z} = __z, t = Z.bosses.spawn('siren'); __z.sim(3); const cov = api.TH.filter(u => api.live(u) && !Z.bosses.BOSSES[u.k] && u.p.distanceTo(t.p) < 900);
    const out = {n: cov.length, iff: cov.filter(u => u.iff > 0).length, green: cov.every(u => Z.rcol(u) === '61,220,132'), self: Z.label(t), selfIff: t.iff > 0};
    t.p.set(0, api.gh(0, 600) + 500, 600); api.player.p.copy(t.p).add(__b.V(0, 120, 300)); api.player.v.set(0, 0, 0); __z.sim(.1); out.ident = t.bs.ident; out.label = Z.label(t); for (const u of api.TH) u.st = 'dead'; return out; });
  ok(sr.n >= 3 && sr.iff === sr.n && sr.green && /FRIENDLY/.test(sr.self) && sr.selfIff, `Siren: its ${sr.n} escorts read FRIENDLY (green, helpers hold fire); the Siren itself shows as a friendly`);
  ok(sr.ident === 1 && /SIREN/.test(sr.label), 'Siren: within 600 m it is unmasked');
  // the Puppeteer: off radar in a disguise; wires boost enemies and hijack your drones; a fallen wire leaves a trail; only a direct strike counts
  const pp = await p.evaluate(() => { __b.clear(); const {api, Z, G} = __z, t = Z.bosses.spawn('puppet'), D = Z.bosses.BOSSES.puppet; __z.sim(1); const vis = k => t.mesh.userData.sub[k].visible;
    const out = {seen: Z.seen(t), hid: Z.hid(t), dis: t.bs.dis, disVis: vis(t.bs.dis), decals: __b.decals(t)};
    const L = []; for (let i = 0; i < 3; i++) { const u = Z.make('shahed', t.p.x + 600 + i * 50, t.p.z - 900); L.push(u); } const s0 = L.map(u => u.spd); t.bs.wt = 0; const r0 = Math.random; Math.random = () => .9; try { __z.sim(.1); } finally { Math.random = r0; }
    const w = L.find(u => u.pup === t.id); out.wired = !!w; out.boost = w ? +(w.spd / s0[L.indexOf(w)]).toFixed(2) : 0; if (w) { w.by = 'p'; api.killThreat(w, true); } __z.sim(.3); out.trail = D.dbg().paths;
    api.player.p.copy(t.p).add(__b.V(0, 120, 0)); Z.sw.deploy(Z.sw.mine, 4, 0); const n0 = Z.sw.drones.length; t.bs.wt = 0; Math.random = () => .1; try { __z.sim(.1); } finally { Math.random = r0; } out.hijack = t.bs.hij | 0; out.lost = n0 - Z.sw.drones.length; out.pp = api.TH.filter(u => u.k === 'ppdrone' && api.live(u)).length;
    t.bs.next = 0; __z.sim(.2); out.moving = !!t.bs.mv && vis('truck');
    const h0 = t.bs.hp; Z.bosses.hitAt(t, 'damage', t.p.clone()); out.prox = t.bs.hp === h0; Z.bosses.hitAt(t, 'kill', t.p.clone()); out.exposed = t.bs.exposed && vis('spider'); Z.bosses.hitAt(t, 'kill', t.p.clone()); __z.sim(.3);
    out.dead = t.st === 'dead'; out.reward = !!G.brw.strings; for (const u of api.TH) u.st = 'dead'; Z.sw.mine.d.length = 0; return out; });
  console.log('  puppeteer:', JSON.stringify(pp));
  ok(!pp.seen && pp.hid && pp.disVis && pp.decals >= 3, `Puppeteer: no radar track, no bracket, disguised as a ${pp.dis}`);
  ok(pp.wired && pp.boost > 1.2 && pp.trail >= 1, `Puppeteer: wires an enemy drone (x${pp.boost} speed); when it falls its wire leaves a trail on the ground`);
  ok(pp.hijack === 1 && pp.lost >= 1 && pp.moving, 'Puppeteer: hijacks one of your swarm drones (it turns on your base; your own escort may shoot it down); relocates as a truck');
  ok(pp.prox && pp.exposed && pp.dead && pp.reward, 'Puppeteer: a proximity burst does nothing; the first direct strike exposes it, the second kills it (Puppet Strings)');
  // the end of a wave ends every boss effect: models, particles, wires and tethers, trails, debris, missiles, sound loops, the bar, false IFF,
  // jamming; a boss still up when the wave ends is gone (the two that outlive a wave withdraw with their run state). Same at game over and quit.
  const ends = await p.evaluate(() => { const {api, Z, G} = __z, out = {}, other = () => Z.make('shahed', 0, -2500), base = {lj: 0, rk: 0};
    __b.clear(); const o0 = other(); base.lj = Z.lockJam(o0); base.rk = Z.radarK(); o0.st = 'dead';
    G.hab = {n: 400, alt: 120000, spd: 36000, L: 300, R: 100, asp: {'LEVEL SIX': 9}, side: {LEFT: 6, RIGHT: 5}, dets: 0, yaw: null, t: 0}; G.fallen = {jet: 3, shahed: 6}; G.bkeep = {};
    const wxNow = () => { const f = api.scene.fog; return {near: f.near, far: f.far, col: f.color.getHex(), sun: api.sun.intensity, hemi: api.hemi.intensity}; }, same = (a, b) => ['near', 'far', 'col', 'sun', 'hemi'].filter(k => a[k] !== b[k]);
    for (const id of [...Z.bosses.ROSTER, 'brood', 'mothership']) { if (G.state !== 'wave') { __z.cont(); } __b.clear(); if (id === 'undertaker') api.SITES[0].hp = 0; const W0 = wxNow();
      const t = id === 'mothership' ? (() => { const m = Z.make('boss', 0, -900); m.p.y = api.gh(0, -900) + 650; return m; })() : id === 'brood' ? (() => { const h = Z.bosses.spawn('hive'); __z.sim(.5); for (let i = 0; i < 4; i++) Z.bosses.hitAt(h, 'damage', h.p.clone()); return h; })() : Z.bosses.spawn(id, id === 'undertaker' ? {x: api.SITES[0].x, z: api.SITES[0].z - 60, set: {anchor: api.SITES[0]}} : {});
      if (id === 'puppet') { __z.sim(.1); for (let i = 0; i < 3; i++) Z.make('shahed', t.p.x + 300, t.p.z - 500 - i * 40); t.bs.wt = 0; }
      if (id === 'jammer') { const q = api.TH.find(u => u.k === 'jpod'); if (q) { q.by = 'p'; api.killThreat(q, true); } }
      for (let i = 0; i < 8; i++) { api.player.p.copy(t.p).add(__b.V(0, 40, 300)); api.camera.position.copy(api.player.p); api.camera.updateMatrixWorld(); __z.sim(.5); }  /* the pilot 300 m off the boss, and the camera with it (a headless sim never moves the camera; the distance-based atmospheres read it) */
      __z.Z.fxTest?.endCine();
      const during = Z.bosses.fx(), o1 = other(), jam = Z.lockJam(o1) / base.lj; o1.st = 'dead'; const st = Z.atmos.state(), pr = Z.atmos.probe(), atm = st.on ? {fog: +(pr.fogFar / W0.far).toFixed(2), light: +(pr.sun / W0.sun).toFixed(2), grade: st.pass} : null;
      // the wave ends: what is still in the air (the boss included) goes, and the state moves on
      G.wq.length = 0; for (const u of api.TH) if (!Z.bosses.BOSSES[u.k]?.persist) u.st = 'dead'; if (!Z.bosses.BOSSES[id]?.persist) { G.state = 'clear'; G.clearT = 3; } __z.sim(.5);  /* the two that outlive a wave end it themselves (they withdraw) */
      const after = Z.bosses.fx(), o2 = other(), lj = +(Z.lockJam(o2) / base.lj).toFixed(2), rk = +(Z.radarK() / base.rk).toFixed(2); o2.st = 'dead';
      const left = Object.entries(after).filter(([k, v]) => v && v !== 0).map(([k, v]) => k + '=' + v);
      if (lj !== 1) left.push('lockJam x' + lj); if (rk !== 1) left.push('radar x' + rk);
      { const p = Z.atmos.probe(), d1 = same(W0, wxNow()), d2 = same(W0, {near: p.fogNear, far: p.fogFar, col: p.fogCol, sun: p.sun, hemi: p.hemi}); if (d1.length) left.push('scene ' + d1); if (d2.length) left.push('as drawn ' + d2); }  /* the weather's own fog, fog colour and light, exactly */
      out[id] = {atm, during: Object.entries(during).filter(([k, v]) => v).map(([k, v]) => k + '=' + (v === true ? 1 : v)).join(' '), jam: +jam.toFixed(2), left}; __z.sim(4); if (G.state === 'base') G.bkeep = {}; }
    // game over and quit clear too
    __z.cont(); __b.clear(); Z.bosses.spawn('twins'); Z.bosses.spawn('jugg'); __z.sim(3); G.wq.length = 0; Z.gameOver(); __z.sim(.3); out.over = Z.bosses.fx();
    return out; });
  for (const [id, o] of Object.entries(ends)) if (id !== 'over') console.log(`  wave end ${id}: during [${o.during}] → left [${o.left.join(' ')}]`);
  ok(Object.entries(ends).filter(([k]) => k !== 'over').every(([, o]) => !o.left.length), 'Wave end: every boss (spawned, effects running) leaves nothing behind: no model, particles, wire, tether, trail, debris, missile, sound loop, bar, false IFF or jamming' +
    Object.entries(ends).filter(([k, o]) => k !== 'over' && o.left.length).map(([k, o]) => `\n  ${k}: ${o.left.join(' ')}`).join(''));
  ok(ends.jammer.jam >= 2 && /loops=\d|smoke=\d|fx=\d/.test(ends.jugg.during + ends.ghost.during) && /wires=\d|trails=\d/.test(ends.puppet.during) && /tether/.test(ends.twins.during), 'Wave end: the effects were really running before it (jamming, smoke, wires, tether) ' + JSON.stringify([ends.jammer.jam, ends.puppet.during]));
  ok(Object.values(ends.over).every(v => !v), 'Game over: the bosses and their effects are cleared ' + JSON.stringify(ends.over));
  { const A = ['gace', 'jammer', 'ghost', 'hive', 'jugg', 'undertaker'].map(k => [k, ends[k].atm]);
    ok(A.every(([, a]) => a && a.grade && (a.fog < .9 || a.light < .9)) && /shadows=1/.test(ends.mothership.during), 'Atmosphere: while they live the battlefield changes (fog / light: ' + A.map(([k, a]) => k + ' ' + (a ? a.fog + ' / ' + a.light : 'off')).join(', ') + '; the grade on; the Mothership casts its shadow); after the wave the fog, its colour and the light are the weather\'s again, exactly'); }
  await p.evaluate(() => { document.getElementById('zover').hidden = true; __z.api.startDemo(); }); await play(p);
  await p.evaluate(() => { const {G} = __z; G.cash = 1e5; __z.jump(24); G.next = __z.plan(24); __z.cont(); __b.clear(); __z.sim(.3); });
  // bots know the roster; HUD boss bar; Classic untouched
  const bb = await p.evaluate(async () => { const brain = await import('./zbotbrain.js'); return {hook: brain.hooks.some(h => h.name === 'bosses')}; });
  const {LEVELS} = await import('./zbot.mjs'), {bossBrain} = await import('../games/interceptor/zboss-brain.js');
  ok(bb.hook && typeof bossBrain.wave === 'function' && LEVELS.length === 6, 'Bots: the boss roster rides on the shared bot brain (zbotbrain.js hook: benchmark runs at bosses, the Undertaker starved at the base screen)');
  await p.evaluate(() => { __b.clear(); __z.Z.bosses.spawn('hive'); __z.sim(2); }); await drawFrames(p, 4);
  const bar = await p.evaluate(() => { __z.Z.hud(1 / 60); const b = document.getElementById('zbb'); return {on: !b.hidden, txt: b.textContent.slice(0, 120), dbg: JSON.stringify({st: __z.G.state, on: __z.G.on, demo: __z.api.demo, menu: __z.api.menuOpen, e: __z.Z.bosses.encs.map(e => [e.id, e.over]), t: __z.api.TH.filter(t => t.k === 'hive').map(t => t.st)})}; });
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-boss-bar.png'});
  ok(bar.on && /HIVE/.test(bar.txt), `HUD: boss bar "${bar.txt}"` + (bar.on ? '' : ' ' + bar.dbg));
  const cls = await p.evaluate(() => { __z.api.startDemo(); return {on: __z.Z.on, boss: __z.api.TH.some(t => __z.Z.bosses.BOSSES[t.k]), bar: document.getElementById('zbb').hidden || getComputedStyle(document.getElementById('zbb')).display === 'none'}; });
  ok(!cls.on && !cls.boss && cls.bar, 'Classic: no bosses, no boss bar');
  ok(!errs.length, 'Bosses: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); delete s.zboss; localStorage.setItem('dl-interceptor', JSON.stringify(s)); });
  await p.close();
}

// ---------- Bot Spectator (zspectate.js, zbotfly.js, zbotbrain.js): a bot pilot plays the real game: it shops visibly, takes off and kills
// by flying (no teleporting), the speed, cameras and tuning panel work, the report shows at the end, and none of it touches the saves ----------
if (want('spectator')) {
  const {p, errs} = await page('z');
  const saves0 = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); return JSON.stringify([s.zbests, s.zruns, s.zmeta, s.zcamp]); });
  await p.evaluate(() => { document.getElementById('zspc').open = true; });
  const card = await p.evaluate(() => ({shown: !document.getElementById('zspc').hidden, lv: document.querySelectorAll('[data-zsl]').length, d: document.querySelectorAll('[data-zsd]').length, go: !!document.getElementById('zspgo')}));
  ok(card.shown && card.lv === 6 && card.d === 4 && card.go, `Spectator: "Watch a bot" on the Zombies menu (${card.lv} bot levels, ${card.d} difficulties)`);
  await p.click('[data-zsl="Legend"]'); await p.click('[data-zsd="1"]'); await p.click('#zspgo');
  await p.waitForFunction(() => __z.spec.on && __z.G.state === 'base', {timeout: 30000});
  // the base screen plays visibly: a caption per step, then it starts the wave by itself (8x speed: a short delay per step)
  await p.evaluate(() => __z.spec.setSpeed(8));
  await p.waitForFunction(() => /Buying|Repairing|Upgrading/.test(document.getElementById('zspcap')?.textContent || ''), {timeout: 30000});
  const cap = await p.evaluate(() => document.getElementById('zspcap').textContent);
  await p.waitForFunction(() => __z.G.state === 'wave', {timeout: 60000});
  const shop = await p.evaluate(() => ({buys: __z.spec.sp.stats.buys.length, defs: __z.Z.def.D.length, cost: __z.spec.sp.stats.buys[0]?.cost | 0}));
  ok(shop.buys >= 1 && shop.defs >= 1 && shop.cost > 0, `Spectator: the bot shopped one step at a time with a reason ("${cap.replace(/^Base screen · \$[\d,]+/, '')}"), ${shop.defs} defence(s), then started wave 1`);
  // flying: from the mat, through its own sticks; positions move step by step (no teleport), and a detonation kills something
  const fl = await p.evaluate(() => { const {api, G, spec} = __z; spec.setSpeed(1); const me = api.player, prev = me.p.clone(); let jump = 0, agl = 0, t = 0, lock = 0, lastT = me.t, steps = 0;
    const st = spec.sp.stats, tk = () => st.kills.pilot?.n | 0;
    while (G.state !== 'over' && t < 400 && !tk()) { if (G.state === 'base') { spec.bench.shop(); __z.cont(); } api.step(1 / 120);  /* the helpers can take wave 1's two tracks first: then on into wave 2 */ t += 1 / 120; if (++steps % 12 === 0) api.visuals(.1, performance.now());
      if (me.dead <= 0) { if (me.t > lastT) jump = Math.max(jump, me.p.distanceTo(prev)); agl = Math.max(agl, me.p.y - api.gh(me.p.x, me.p.z)); if (__z.Z.lk.t) lock = 1; }
      prev.copy(me.p); lastT = me.t; }
    return {t: Math.round(t), jump: +jump.toFixed(2), agl: Math.round(agl), kills: tk(), bursts: st.bursts, fired: spec.sp.pilot.st.fired, lock, by: Object.keys(st.kills)}; });
  console.log('  flight:', JSON.stringify(fl));
  ok(fl.agl > 30 && fl.jump < 4, `Spectator: the bot took off and flew (up to ${fl.agl} m AGL; largest move in one physics step ${fl.jump} m: no teleporting)`);
  ok(fl.kills >= 1 && fl.bursts >= 1, `Spectator: the bot killed ${fl.kills} by flying into its warhead's reach (${fl.bursts} detonation${fl.bursts > 1 ? 's' : ''}, ${fl.fired} pressed by the bot, the rest on contact; ${fl.t} s of flying)`);
  // speed, pause and step
  const spd = await p.evaluate(() => { const {spec, Z, G} = __z; spec.setSpeed(1); const b = Z.tsc; spec.setSpeed(4); const x4 = Z.tsc / b; spec.setSpeed(8); const x8 = Z.tsc / b, cap = Z.stepCap;
    spec.setPause(true); const held = Z.hold(), w0 = spec.sp.stats.simT; spec.stepOnce(); const stepped = +(spec.sp.stats.simT - w0).toFixed(3); spec.setSpeed(1); return {x4, x8, cap, held, stepped, after: Z.hold()}; });
  ok(Math.abs(spd.x4 - 4) < .01 && Math.abs(spd.x8 - 8) < .01 && spd.cap >= 96, `Spectator: speed 4× / 8× (game clock ×${spd.x4.toFixed(1)} / ×${spd.x8.toFixed(1)}, up to ${spd.cap} physics steps a frame)`);
  ok(spd.held && spd.stepped === .1 && !spd.after, `Spectator: pause holds the game, Step advances it ${spd.stepped} s, a speed button resumes`);
  // cameras: chase (Riley's chase cam), the bot's FPV, and the spectator's own (free, sites, threat) placed after the game's camera
  const cams = {};
  for (const c of ['fpv', 'sites', 'threat', 'free', 'chase']) { await p.evaluate(c => __z.spec.setCam(c, true), c); await frames(p, 3);
    cams[c] = await p.evaluate(() => { const {api} = __z, c = api.camera.position, me = api.player, s = api.SITES[__z.spec.sp.site % api.SITES.length]; return {mode: api.camMode, toMe: Math.round(c.distanceTo(me.p)), toSite: Math.round(Math.hypot(c.x - s.x, c.z - s.z)), btn: document.querySelector('#zspctl button.on')?.dataset.zcam}; }); }
  console.log('  cameras:', JSON.stringify(cams));
  ok(cams.fpv.mode === 0 && cams.chase.mode === 1 && cams.sites.toSite < 450 && Object.entries(cams).every(([k, v]) => v.btn === k), 'Spectator: cameras switch (bot FPV, chase, sites, threat, free) and the bar shows which');
  // tuning: a value typed into the panel applies live; JSON export lists the changes; Reset puts them back
  const tn = await p.evaluate(() => { const {spec, ITEMS, KIND, Z} = __z; spec.toggleTune(); const i = document.querySelector('[data-tp="price.flak"]'), k0 = Z.meta.k('cashK'), p0 = ITEMS.flak.price;
    i.value = 999; i.dispatchEvent(new Event('change')); spec.apply('econ.cashK', 2); spec.apply('kind.shahed.spd', 40); const t = __z.Z.make('shahed', 0, -3000);
    const out = {price: ITEMS.flak.price, shop: Z.itemPrice('flak'), cash: Z.meta.k('cashK') / k0, spd: Math.round(t.spd), exp: JSON.stringify(spec.TUNE.v), panel: !!document.getElementById('zsptune')};
    __z.api.TH.splice(__z.api.TH.indexOf(t), 1); __z.api.scene.remove(t.mesh); spec.resetAll(); spec.toggleTune(); out.back = ITEMS.flak.price === p0 && Z.meta.k('cashK') === k0 && KIND.shahed.spd === 51; return out; });
  ok(tn.panel && tn.price === 999 && tn.shop === 999 && tn.cash === 2 && tn.spd >= 37 && tn.spd <= 45 && /price\.flak/.test(tn.exp) && tn.back, `Tuning: flak $999 in the shop, income ×${tn.cash}, Shaheds spawn at ${tn.spd} m/s; export ${tn.exp}; Reset restores`);
  // the end: every site but one down, a raid on it: the report replaces the end screen
  const rep = await p.evaluate(() => { const {api, G} = __z, S = api.SITES; S.forEach((s, i) => s.hp = i ? 0 : 1); const t = __z.make('shahed', S[0].x + 300, S[0].z - 300, S[0]); t.p.copy(t.aim); __z.Z.impact(t);  /* a Shahed arriving on the last site */
    let n = 0; while (G.state !== 'over' && n++ < 20) __z.sim(.5); const el = document.getElementById('zover');
    return {st: G.state, shown: !el.hidden, h: el.querySelector('h2')?.textContent, txt: el.textContent, chart: !!el.querySelector('svg path'), bars: el.querySelectorAll('.bars i').length, rows: el.querySelectorAll('.buys tr').length - 1, again: !!document.getElementById('zspagain')}; });
  ok(rep.st === 'over' && rep.shown && rep.h === 'Bot report' && /Shahed-136 hit the/.test(rep.txt) && /pilot/.test(rep.txt), 'Report: wave reached, cause of death (the Shahed that hit the last site), kills by source' + (rep.h === 'Bot report' && /Shahed-136 hit the/.test(rep.txt) ? '' : `
  ${rep.h}: ${rep.txt.slice(0, 400)}`));
  ok(rep.chart && rep.bars >= 1 && rep.rows >= 1 && rep.again, `Report: money-over-time chart, ${rep.bars} kill sources, ${rep.rows} purchases with their wave and reason, Watch again`);
  const saves1 = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); return JSON.stringify([s.zbests, s.zruns, s.zmeta, s.zcamp]); });
  ok(saves1 === saves0, "Spectator: a bot's run left the saves alone (best waves, leaderboard runs, goals, campaign)");
  await p.click('#zmenu');
  const off = await p.evaluate(() => ({on: __z.spec.on, menu: !document.getElementById('menu').hidden, bar: !!document.getElementById('zspbar'), bot: typeof __z.Z.botIn, cam: __z.api.camMode === (__z.api.S.cam | 0)}));
  ok(!off.on && off.menu && !off.bar && off.bot === 'undefined' && off.cam, 'Spectator: Menu ends it (hooks off, your camera back)');
  // lock-on from the chase view: a player flying behind and below a track with the interceptor pointed at it locks it (the sights are the
  // airframe's boresight in the chase and threat views; the chase camera itself only follows the heading, so a track above could never be locked)
  await p.click('#play'); await p.waitForFunction(() => __z.G.state === 'base', {timeout: 30000});
  const hum = await p.evaluate(() => { const {api, G, Z} = __z; __z.cont(); const V = api.THREE.Vector3, me = api.player; api.camMode = 1;
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); Z.lk.clear();
    const t = __z.make('shahed', 0, -1500), v = new V(0, 0, -50); t.spd = 0; let s = 0, held = 0;
    for (let i = 0; i < 120 * 8; i++) { t.p.set(0, api.gh(0, -1500) + 600, -1500 - 50 * i / 120); t.v.copy(v);
      me.p.copy(t.p).add(new V(0, -90, 800)); me.v.copy(v); me.q.setFromUnitVectors(new V(0, 1, 0), t.p.clone().sub(me.p).normalize()); me.w.set(0, 0, 0);
      api.step(1 / 120); if (Z.lk.t === t) { if (!s) s = i / 120; held++; } }
    api.camMode = api.S.cam | 0; return {s: +s.toFixed(2), held: +(held / 120).toFixed(1)}; });
  ok(hum.s > 0 && hum.s < 3 && hum.held > 4, `Lock-on in the chase view: pointing the interceptor at a track 90 m above locks it in ${hum.s} s and holds it (${hum.held} s)`);
  // a bot coming up behind a track locks it and keeps the lock through its run-in: still locked when it first gets within 30 m. Only that is
  // asserted: whether the first pass kills is down to dice (aim wander, gusts, detonate timing); after a miss it turns about, which rightly
  // drops the lock, and the kill may come on a later pass (about 1 run in 12). Sim-stepped, so the machine's speed doesn't matter.
  const tail = await p.evaluate(() => { const {api, G, Z, spec} = __z; api.startDemo(); spec.bench.start('Legend', 1); __z.cont(); const me = api.player;
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); Z.lk.clear();
    const f = me.home, t = __z.make('shahed', f.x, f.z + 500); t.p.y = api.gh(t.p.x, t.p.z) + 300; t.alt = 300; t.wps.length = 0; t.aim = new api.THREE.Vector3(f.x, 0, f.z + 7000);  /* a long straight leg south, no dive */ const n0 = {...Z.lk.L.n}; let s = 0, lockAtKill = false, close = null, run = 0, held = 0, i = 0;
    for (; i < 120 * 150 && api.live(t); i++) { lockAtKill = Z.lk.t === t; api.step(1 / 120); const on = Z.lk.t === t; if (on && !s) s = i / 120; run = on ? run + 1 : 0; held = Math.max(held, run);  /* the burst that kills it also ends the interceptor (and its lock) in the same step */
      if (close === null && me.dead <= 0 && api.live(t) && t.p.distanceTo(me.p) < 30) close = on; }
    const out = {s: +s.toFixed(1), held: +(held / 120).toFixed(1), close, kill: !api.live(t) && t.by === 'p', lockAtKill, t: +(i / 120).toFixed(1), lost: Z.lk.L.n.lost - n0.lost}; spec.stop(); return out; });
  ok(tail.s > 0 && tail.s < 6 && tail.held >= 3 && tail.close === true, `Lock-on, bot: coming up behind a Shahed, Legend locks it ${tail.s} s in, holds it ${tail.held} s and is still locked when it first closes within 30 m`
    + ` (then: ${tail.kill ? `killed ${tail.t} s in${tail.lockAtKill ? ' with the lock' : ' on a later pass'}` : 'no kill in 150 s'}, lock lost ${tail.lost}×)`);
  ok(!errs.length, 'Spectator: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- re-entry (zreentry.js), the long-range radar layers (zstratradar.js), the threat sound and its voice budget (zthreatsfx.js) ----------
if (want('reentry')) {
  const {p, errs} = await page('z');
  await play(p);
  // a wave that stays open (a queued track far in the future), a Golden Dome
  // (with the kill chain's early warning, both early-warning radar levels: the fast tracks are picked up 50 s out, before they re-enter)
  const setup = w => p.evaluate(w => { const {G, Z, api} = __z; G.cash = 1e6; __z.jump(w); G.next = __z.plan(w); __z.cont(); G.wq = [{k: 'shahed', at: 1e9, brg: 0}]; if (G.kc) G.kc.ewr = 2;
    for (const t of api.TH) t.st = 'dead'; __z.sim(.2); return {wave: G.wave, sr: Z.sr.state()}; }, w);
  // radar layers: Normal brings the ballistic missiles at 25, the ICBMs at 40 (Hard: 3 waves earlier)
  const u24 = await setup(24), u25 = await setup(25);
  await p.evaluate(() => __z.sim(3));
  const ann = await p.evaluate(() => ({feed: document.getElementById('feed').textContent, sr: __z.Z.sr.state()}));
  const u39 = await setup(39), u40 = await setup(40);
  const hard = await p.evaluate(() => { const {G, Z} = __z; G.dfo = 2; const r = Z.sr.state(); G.dfo = undefined; return r; });
  ok(u24.sr.cont === 0 && u25.sr.cont === 25 && u25.sr.glob === 0, `Radar layers: continental locked on wave 24, unlocked on wave 25 (Normal)`);
  ok(/Continental radar online/.test(ann.feed), 'Radar layers: the continental unlock is announced');
  ok(u39.sr.glob === 0 && u40.sr.glob === 40, `Radar layers: global locked on wave 39, unlocked on wave 40`);
  ok(hard.contFrom === 22 && hard.globFrom === 37, `Radar layers on Hard: continental from ${hard.contFrom}, global from ${hard.globFrom}`);
  // the ICBM: midcourse, the re-entry call (banner, alarm, sky flash, rumble), the slower final approach
  const ic = await p.evaluate(() => { const {Z, api} = __z, gd = Z.def.add('gdome', Z.def.SLOTS.findIndex((s, j) => Z.def.slotFree(j))); gd.spent = 9000; Z.def.deploy(); gd.ammo = 0; Z.tsfx.reset();
    const t = __z.make('icbm', 0, 1950 - 160000, api.SITES[0]); __z.sim(.2); const T0 = Z.reTti(t); let T = 0, re = null, low = null, ban = '', st = null;
    while (api.live(t) && T < 120) { __z.sim(.1); T += .1; if (!re && Z.re.log.some(e => e.e === 'reentry')) { re = T; st = Z.re.state(); api.hud?.(.1); Z.hud(.1); ban = document.getElementById('zre').textContent; }
      if (!low && t.p.y - t.aim.y < 2000) low = Math.round(t.v.length()); }
    return {T0: +T0.toFixed(1), total: +T.toFixed(1), re: +(re || 0).toFixed(1), ban, st, low, imp: !!t.impacted, alarm: Z.tsfx.log.some(e => e.e === 'alarm' && e.big), gd: gd.id}; });
  console.log('  icbm:', JSON.stringify({...ic, st: {flash: ic.st?.flash, rumble: +(ic.st?.rumble || 0).toFixed(2), samples: ic.st?.samples}}));
  ok(ic.imp && ic.total > 60 && ic.total < 90 && Math.abs(ic.total - .2 - ic.T0) < 4, `ICBM: ${ic.total} s from launch to impact (predicted ${ic.T0} s); re-entry at ${ic.re} s`);
  ok(/^RE-ENTRY — SUBSTATION — T-\d+ s/.test(ic.ban) && ic.alarm && ic.st.flash > .2, `Re-entry call: banner "${ic.ban}", alarm stinger, sky flash ${ic.st?.flash}`);
  ok(ic.total - ic.re > 25 && ic.total - ic.re < 40 && ic.st.samples > 0, `Re-entry: ${(ic.total - ic.re).toFixed(1)} s from the entry flash to impact, plasma trail drawn`);
  ok(ic.low > 800 && ic.low < 1500, `Final approach: ${ic.low} m/s under 2 km (slowed from 6.5 km/s; still far beyond a pilot)`);
  // the Golden Dome answers: the kill vehicle drops out of orbit over the defended area, in the camera's view, with a trail; flash and debris at the intercept
  const kv = await p.evaluate(gid => { const {Z, api} = __z, gd = Z.def.D.find(d => d.id === gid); gd.ammo = 2; const L0 = Z.re.log.length; const t = __z.make('icbm', 20000, 1950 - 160000, api.SITES[1]);
    let seen = null; for (let i = 0; i < 1200 && api.live(t); i++) { __z.sim(.1); const h = Z.def.shots.find(h => h.kind === 'space'); if (h && !seen) { __z.sim(.3); const c = api.camera; c.lookAt(h.p); c.updateMatrixWorld(); seen = {scr: Z.re.screen(h.p), st: Z.re.state(), y: Math.round(h.p.y)}; } }
    __z.sim(.3); const L = Z.re.log.slice(L0); return {seen, kv: L.filter(e => e.e === 'kv'), ix: L.find(e => e.e === 'intercept'), up: L.some(e => e.e === 'uplink') || Z.tsfx.log.some(e => e.e === 'uplink'), st: Z.re.state(), imp: !!t.impacted}; }, ic.gd);
  console.log('  dome:', JSON.stringify({seen: kv.seen?.scr, y: kv.seen?.y, kv: kv.kv.map(e => [e.y, e.iy, e.tau]), ix: kv.ix, debris: kv.st.debris}));
  ok(kv.seen && kv.seen.scr.front && Math.abs(kv.seen.scr.x) < .2 && Math.abs(kv.seen.scr.y) < .2 && kv.seen.st.kvTrails >= 1 && kv.seen.st.samples > 0, `Golden Dome: kill vehicle away at ${kv.seen?.y} m, on screen with its trail and the uplink`);
  ok(kv.ix && kv.ix.by === 'gdome' && kv.ix.h > 3000 && kv.st.debris > 0 || kv.imp && kv.kv.length >= 2, `Golden Dome: intercept at ${kv.ix ? Math.round(kv.ix.h / 1000) + ' km' : '—'} with flash and ${kv.st.debris} burning fragments`);
  // the kill chain's early warning (when present): a re-entry nobody has picked up yet shows no site and no time
  const blind = await p.evaluate(() => { const {G, Z, api} = __z; if (!G.kc) return null; for (const t of api.TH) if (api.live(t)) t.st = 'dead'; __z.sim(.2); G.kc.ewr = 0; const L0 = Z.re.log.length, t = __z.make('icbm', 0, 1950 - 160000, api.SITES[0]);
    for (let i = 0; i < 900 && !Z.re.log.slice(L0).some(e => e.e === 'reentry'); i++) __z.sim(.1); Z.hud(.1); const b = document.getElementById('zre').textContent; G.kc.ewr = 2; t.st = 'dead'; __z.sim(.2); return b; });
  if (blind != null) ok(/^RE-ENTRY — TRACKING… — T-\?/.test(blind), `Kill chain early warning: an undetected re-entry reads "${blind}"`);
  // the ballistic missile's lesser re-entry: the call comes 30 s out, amber, the small stinger
  const bal = await p.evaluate(() => { const {Z, api} = __z; for (const t of api.TH) if (api.live(t)) t.st = 'dead'; __z.sim(.2); const L0 = Z.re.log.length, A0 = Z.tsfx.log.length; const t = __z.make('ballistic', 0, 1950 - 65000, api.SITES[2]);
    let T = null; for (let i = 0; i < 1000 && api.live(t) && T == null; i++) { __z.sim(.1); const e = Z.re.log.slice(L0).find(e => e.e === 'reentry'); if (e) { T = e.T; Z.hud(.1); } }
    return {e: Z.re.log.slice(L0).find(e => e.e === 'reentry'), cls: document.querySelector('#zre .l')?.className, small: Z.tsfx.log.slice(A0).some(e => e.e === 'alarm' && !e.big)}; });
  ok(bal.e && bal.e.T >= 29 && bal.e.T <= 31 && bal.cls === 'l b' && bal.small, `Ballistic: lesser re-entry call at T-${bal.e?.T} s (amber banner, small stinger)`);
  // threat sound: 150 tracks around the camera; the voices stay inside the budget and go to the loudest; a supersonic pass is heard after it passes
  const snd = await p.evaluate(() => { const {Z, api} = __z, V = api.THREE.Vector3, c = api.camera.position.clone(); for (const t of api.TH) if (api.live(t)) t.st = 'dead'; __z.sim(.2); Z.tsfx.reset();
    const K = ['shahed', 'jet', 'cruise', 'heavy', 'decoy', 'swarm']; for (let i = 0; i < 150; i++) { const a = i * 2.39, r = 300 + (i % 25) * 120, t = __z.make(K[i % 6], c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); if (t) t.grp = t.k === 'swarm' ? 1000 + (i % 3) : t.grp; }
    for (let i = 0; i < 25; i++) __z.sim(.1); const s = Z.tsfx.stats(), live = api.TH.filter(api.live).length;
    const near = api.TH.filter(t => api.live(t) && t.k !== 'swarm').sort((a, b) => a.p.distanceTo(c) - b.p.distanceTo(c))[0];
    return {s, live, nearV: s.ids.includes(near?.id)}; });
  console.log('  voices:', JSON.stringify(snd));
  ok(snd.live >= 120 && snd.s.peakV <= 8 && snd.s.voices >= 4 && snd.s.peakO <= 8, `Threat sound: ${snd.live} tracks in the air, ${snd.s.voices} voices (peak ${snd.s.peakV} of 8), one-shots peak ${snd.s.peakO} of 8`);
  ok(snd.nearV, 'Threat sound: the nearest track has a voice');
  const sup = await p.evaluate(() => { const {Z, api} = __z, V = api.THREE.Vector3, c = api.camera.position.clone(); for (const t of api.TH) if (api.live(t)) t.st = 'dead'; __z.sim(.2); Z.tsfx.reset();
    const t = __z.make('ballistic', c.x - 20000, c.z, api.SITES[0]); t.p.set(c.x - 20000, c.y + 400, c.z); t.aim = new V(c.x + 30000, c.y + 400, c.z); t.v.set(900, 0, 0);
    for (let i = 0; i < 300 && !Z.tsfx.log.some(e => e.e === 'pass'); i++) __z.sim(.1); const ps = Z.tsfx.log.find(e => e.e === 'pass'), pre = Z.tsfx.log.filter(e => e.e === 'boom').length; return {ps, pre, x: Math.round(t.p.x - c.x)}; });
  await sleep(1800); await frames(p, 6);
  const boom = await p.evaluate(() => __z.Z.tsfx.log.filter(e => e.e === 'boom').length);
  ok(sup.ps && sup.ps.sup && Math.abs(sup.ps.d - 400) < 40 && sup.ps.delay > .9 && sup.pre === 0 && boom >= 1, `Supersonic pass at ${sup.ps?.d} m: silent on the way in, the boom ${sup.ps?.delay} s after it passed (${boom} boom)`);
  // Classic: none of it
  const cls = await p.evaluate(() => { __z.api.startDemo(); return {sr: document.getElementById('zsr').hidden, re: document.getElementById('zre').textContent, v: __z.Z.tsfx.stats().voices}; });
  ok(cls.sr && !cls.re, 'Classic / menu: no long-range inset, no re-entry banner');
  ok(!errs.length, 'Re-entry / radar layers / threat sound: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- arsenal (zarsenal.js, zweapons.js, zarsdef.js): every pilot weapon and every extra defence can be bought or loaded, does its thing,
// and its weakness applies. Scripted set-ups through window.__z; dice are loaded only where a single roll decides the check ----------
if (want('arsenal')) {
  const {p, errs} = await page('z');
  await play(p);
  // a scripted arena: the wave kept open by a spawn that never comes, the interceptor held 600 m up in the south of the AO (flying north at v m/s),
  // tracks put relative to it and flown straight north with it
  await p.evaluate(`(() => { const {api, G, Z} = __z, V = api.THREE.Vector3; window.__ar = {
    clear() { for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); G.state = 'wave'; Z.base.close(); },
    pilot(v = 60) { if (api.player.dead > 0 || !this.up) { api.launch(); this.up = 1; } const me = api.player; me.p.set(0, api.gh(0, 2600) + 600, 2600); me.v.set(0, 0, -v); me.q.setFromAxisAngle(new V(1, 0, 0), -80 * Math.PI / 180); me.w.set(0, 0, 0); return me; },
    put(k, dx, dy, dz, v = 60) { const me = api.player, t = __z.make(k, me.p.x + dx, me.p.z + dz); t.p.set(me.p.x + dx, me.p.y + dy, me.p.z + dz); t.alt = t.p.y - api.gh(t.p.x, t.p.z); t.v.set(0, 0, -v); t.spd = t.cs = v; t.wps.length = 0; t.aim = new V(t.p.x, api.gh(t.p.x, t.p.z - 20000), t.p.z - 20000); return t; },  /* a new aim: the site's aim points are shared */
    away() { const me = api.player; me.p.set(3000, api.gh(3000, -3000) + 1500, -3000); me.v.set(0, 0, 0); },  /* out of the helpers' way (they leave the pilot's own terminal track alone) */
    load(w) { G.state = 'base'; const ok = Z.ars.equip(w); G.state = 'wave'; Z.ars.onWave(); return ok; },
    strip() { for (const d of [...Z.def.D]) Z.def.remove(d); },
    rig(fn, r = .01) { const m = Math.random; Math.random = () => r; try { return fn(); } finally { Math.random = m; } } }; })()`);
  // ---- the base screen: the Pilot weapon section, buying and loading; the defences in the shop with their chips ----
  const shop = await p.evaluate(() => { const {G, Z} = __z, A = Z.ars, q = s => [...document.querySelectorAll(s)];
    const out = {n: q('#zbase [data-ars^="w:"]').length, locked: q('#zbase [data-ars^="w:"]').filter(b => /^Wave/.test(b.textContent)).map(b => b.dataset.ars.slice(2)), loaded: q('#zbase .zwp.got .zid > b').map(b => b.textContent)};
    __z.jump(12, 30000); Z.base.refresh(); const c0 = G.cash; document.querySelector('#zbase [data-ars="w:net"]').click(); out.net = {paid: c0 - G.cash, cur: A.cur()};
    for (const w of ['flech', 'flare', 'cluster', 'emp', 'dart']) A.buyW(w); out.own = [...A.P(A.me()).own].sort().join(); out.cash = G.cash;
    Z.base.refresh(); document.querySelector('#zbase [data-ars="w:std"]').click(); out.back = A.cur(); out.spent = 30000 - G.cash;
    out.defs = G.cards.filter(c => ['laser', 'mwave', 'barrage', 'smoke', 'carrier'].includes(c.k)).map(c => c.k).join();
    out.chips = q('#zbase .zitem').filter(e => /Laser battery/.test(e.textContent)).map(e => e.querySelectorAll('.zvs .vg').length + '/' + e.querySelectorAll('.zvs .vn').length)[0];
    out.cards = q('#zbase .zitem').filter(e => /Microwave dome|Balloon barrage|Smoke generators|Drone carrier|Laser battery/.test(e.textContent)).every(e => /Strong:.*Weak:/.test(e.textContent));
    return out; });
  if (SHOTS) await p.screenshot({path: SHOTS + '/ars-shop.png'});
  ok(shop.n === 7 && shop.locked.includes('dart') && shop.loaded.join() === 'Standard warhead', `Loadout: 7 pilot weapons on the base screen, standard warhead loaded, locked at wave 1: ${shop.locked.join(', ')}`);
  ok(shop.net.paid === 600 && shop.net.cur === 'net', `Loadout: buying the net drone costs $${shop.net.paid} and loads it`);
  ok(shop.own === 'cluster,dart,emp,flare,flech,net,std' && shop.back === 'std' && shop.spent === 600 + 900 + 800 + 1200 + 1400 + 1600, `Loadout: every weapon bought once ($${shop.spent}), swapping back to the standard warhead is free`);
  ok(shop.defs === 'laser,mwave,barrage,smoke,carrier' && shop.cards && shop.chips, `Shop: the five new defences listed with strength / weakness cards and chips (laser green/struck: ${shop.chips})`);

  // ---- net drone: catches a slow drone intact and pays a capture bonus; can't hold a jet ----
  const net = await p.evaluate(() => { const {api, G, Z} = __z, out = {};
    __ar.clear(); __ar.load('std'); __ar.pilot(); let t = __ar.put('shahed', 0, 0, -1); let c0 = G.cash; Z.detonate(); out.std = G.cash - c0;
    __ar.clear(); __ar.load('net'); __ar.pilot(); t = __ar.put('shahed', 0, 2, -4); const k0 = G.kills.p; c0 = G.cash; G.streak = 0; Z.detonate(); out.net = G.cash - c0; out.st = t.st; out.kill = G.kills.p - k0; out.txt = G.det.txt;
    __z.sim(6); out.landed = t.st === 'dead' || !api.TH.includes(t); out.ground = +(t.p.y - api.gh(t.p.x, t.p.z)).toFixed(1);
    __ar.clear(); __ar.pilot(); const j = __ar.put('jet', 0, 0, -3, 92); Z.detonate(); out.jet = api.live(j); out.jtxt = G.det.txt; return out; });
  ok(net.st === 'cap' && net.kill === 1 && net.net > net.std * 1.4, `Net: a Shahed 4 m away is captured (${net.txt}): paid $${net.net} vs $${net.std} for a warhead kill`);
  ok(net.landed && net.ground < 3, `Net: towed down into a field (${net.ground} m above the ground when it lands)`);
  ok(net.jet && /CAN'T HOLD/.test(net.jtxt), `Net weakness: a jet 3 m away is untouched ("${net.jtxt}")`);

  // ---- EMP: disables a pack without killing it; helpers get a bonus on disabled tracks; missiles ignore it; they recover ----
  const emp = await p.evaluate(() => { const {api, G, Z} = __z, out = {};
    __ar.clear(); __ar.load('emp'); __ar.pilot(); const L = []; for (let i = 0; i < 5; i++) L.push(__ar.put('shahed', (i - 2) * 9, (i % 2) * 6, -22 - (i % 3) * 6));
    const b = __ar.put('ballistic', 10, -5, -25, 900);
    const k0 = G.kills.p; Z.detonate(); out.kills = G.kills.p - k0; out.stunned = L.filter(t => t.emp > 0).length; out.txt = G.det.txt; out.bal = !(b.emp > 0);
    __z.sim(1); out.slow = Math.max(...L.map(t => Math.hypot(t.v.x, t.v.z) / t.cs)); out.label = Z.label(L[0]).includes('DISABLED');
    const roll = t => { let n = 0; for (let i = 0; i < 3000; i++) if (Z.helperHit(t, .3) === 'kill') n++; return n / 3000; };
    const free = __ar.put('shahed', 400, 0, -400); out.pOn = roll(L[0]); out.pOff = roll(free); out.jink = Z.jink(L[0]);
    __z.sim(5); out.back = L.every(t => !(t.emp > 0)) && Math.min(...L.map(t => Math.hypot(t.v.x, t.v.z) / t.spd)) > .95; return out; });
  ok(emp.kills === 0 && emp.stunned === 5 && /EMP — 5 DISABLED/.test(emp.txt), `EMP: a pack of 5 Shaheds 22-34 m away disabled, none killed ("${emp.txt}")`);
  ok(emp.slow < .6 && emp.label, `EMP: disabled tracks drift at ${Math.round(emp.slow * 100)}% speed or less, flagged DISABLED`);
  ok(emp.pOn > emp.pOff * 1.45 && emp.jink === 1, `EMP: a helper's 30% shot kills a disabled track ${Math.round(emp.pOn * 100)}% of the time (${Math.round(emp.pOff * 100)}% otherwise); no jinking`);
  ok(emp.bal && emp.back, 'EMP weakness: a ballistic missile in the pulse is not disabled; the pack recovers full speed after 4.5 s');

  // ---- flechette: a cone that shreds a swarm; nothing behind you, armor holds ----
  const fl = await p.evaluate(() => { const {api, G, Z} = __z, out = {};
    __ar.clear(); __ar.load('flech'); __ar.pilot(); const S = []; for (let i = 0; i < 6; i++) S.push(__ar.put('swarm', (i % 3 - 1) * 2.5, (i >> 1) % 2 * 2, -5 - i * .5)); const B = []; for (let i = 0; i < 3; i++) B.push(__ar.put('swarm', i * 2 - 2, 0, 8));
    __ar.rig(() => Z.detonate()); out.ahead = S.filter(t => !api.live(t)).length; out.behind = B.filter(t => !api.live(t)).length; out.txt = G.det.txt;
    let hk = 0, hd = 0; for (let i = 0; i < 20; i++) { __ar.clear(); __ar.pilot(); const h = __ar.put('heavy', 0, 0, -5); Z.detonate(); if (!api.live(h)) hk++; if (h.dmg) hd++; } out.hk = hk; out.hd = hd; return out; });
  ok(fl.ahead === 6 && fl.behind === 0, `Flechette: ${fl.ahead} of 6 swarm drones 5-7.5 m ahead in the cone shredded in one burst (dice loaded) ("${fl.txt}"), ${fl.behind} of 3 behind you`);
  ok(fl.hk === 0 && fl.hd >= 10, `Flechette weakness: an armored heavy 5 m ahead, 20 bursts: ${fl.hk} kills, ${fl.hd} damaged`);

  // ---- kinetic dart: ram it and anything dies, armor included; a miss costs nothing; a wider window on fast missiles ----
  const dt = await p.evaluate(() => { const {api, G, Z} = __z, out = {};
    __ar.clear(); __ar.load('dart'); const me = __ar.pilot(); const s = __ar.put('shahed', 0, 0, -12); Z.detonate(); out.miss = {alive: me.dead <= 0, track: api.live(s), txt: document.getElementById('banner')?.textContent || ''};
    const h = __ar.put('heavy', 0, 0, -.6); Z.detonate(); out.heavy = !api.live(h); out.htxt = G.det.txt;
    const pass = w => { __ar.clear(); __ar.load(w); const m = __ar.pilot(0); m.v.set(0, 0, 0); const b = __ar.put('ballistic', 2.1, 0, -120, 900); b.v.set(0, 0, 900); b.aim = new api.THREE.Vector3(b.p.x, b.p.y, b.p.z + 30000);
      for (let i = 0; i < 40 && api.live(b); i++) { m.p.set(0, m.p.y, 2600); m.v.set(0, 0, 0); api.step(1 / 120); } return !api.live(b); };
    out.fastDart = pass('dart'); out.fastStd = pass('std'); return out; });
  ok(dt.miss.alive && dt.miss.track, 'Dart: firing with nothing in contact does nothing; the drone flies on (no drone lost)');
  ok(dt.heavy && /DART/.test(dt.htxt), `Dart: rams an armored heavy and kills it ("${dt.htxt}")`);
  ok(dt.fastDart && !dt.fastStd, `Dart: a ballistic missile passing 2.1 m off the nose dies to the dart (${dt.fastDart}), the warhead's direct-hit window misses it (${!dt.fastStd})`);

  // ---- cluster: bomblets home on a spread-out pack; nothing against armor ----
  const cu = await p.evaluate(() => { const {api, G, Z} = __z, out = {};
    __ar.clear(); __ar.load('cluster'); __ar.pilot(); const L = []; for (let i = 0; i < 8; i++) L.push(__ar.put('shahed', (i - 3.5) * 50, (i % 2) * 30, -140 - i * 18, 20));
    const k0 = G.kills.p; Z.detonate(); out.txt = G.det.txt; __ar.rig(() => __z.sim(8)); out.down = L.filter(t => !api.live(t)).length; out.kp = G.kills.p - k0;
    __ar.clear(); __ar.pilot(); const H = []; for (let i = 0; i < 4; i++) H.push(__ar.put('heavy', (i - 1.5) * 50, 0, -150, 20)); Z.detonate(); __z.sim(8); out.heavy = H.filter(t => !api.live(t)).length; out.htxt = G.det.txt; return out; });
  ok(cu.down >= 6 && cu.kp >= 6, `Cluster: one detonation 140-265 m from a spread pack, the bomblets reach and bring down ${cu.down} of 8 ("${cu.txt}", dice loaded)`);
  ok(cu.heavy === 0, `Cluster weakness: 4 armored heavies, ${cu.heavy} down ("${cu.htxt}")`);

  // ---- flare / chaff pod: chaff decoys a passing cruise missile, not a Shahed; the pod drains the pack; flares beat a sortie's AA ----
  const fp = await p.evaluate(() => { const {api, G, Z} = __z, A = Z.ars, out = {};
    __ar.clear(); __ar.load('flare'); __ar.pilot(); const P = A.P(A.me()); out.ch0 = P.ch;
    const s = __ar.put('shahed', 200, 0, -100); const c = __ar.put('cruise', 300, -50, -200, 210); __ar.rig(() => __z.sim(.3)); out.ch1 = P.ch; out.cruise = !!c.spoof; out.shahed = !s.spoof;
    const draw = w => { __ar.clear(); __ar.load(w); const m = __ar.pilot(0); const m0 = m.mah; for (let i = 0; i < 600; i++) { m.p.set(0, m.p.y, 2600); m.v.set(0, 0, 0); api.step(1 / 60); } return m.mah - m0; };
    out.podDraw = +(draw('flare') - draw('std')).toFixed(1);
    // sorties (zsortie.js): its real hit callback, with the sortie marked as flying; a flare voids an AA burst, then the flares run out and the hull takes it
    const SO = Z.so.S, on0 = SO.on, hull0 = SO.hull; __ar.load('flare'); __ar.pilot(0); A.onBase(); G.state = 'wave'; __z.sim(.1); SO.on = true; SO.hull = 100; const sch0 = P.sch;
    __ar.rig(() => Z.so.W.onHit(A.me(), 34, 'aa')); out.saved = SO.hull === 100 && P.sch === sch0 - 1; out.sch0 = sch0; P.sch = 0; Z.so.W.onHit(A.me(), 34, 'pat'); out.noFlares = SO.hull === 66; out.hull = SO.hull;
    SO.on = on0; SO.hull = hull0; return out; });
  ok(fp.ch0 === 4 && fp.ch1 === 3 && fp.cruise && fp.shahed, `Pod: a cruise missile passing 360 m away draws a chaff burst (4 -> ${fp.ch1}) and is decoyed; a Shahed nearby is not (GPS)`);
  ok(fp.podDraw > 20 && fp.podDraw < 36, `Pod weakness: 10 s of hover costs ${fp.podDraw} mAh more than without the pod (10 A)`);
  ok(fp.saved && fp.noFlares && fp.sch0 === 6, `Pod on sorties (zsortie.js W.onHit): ${fp.sch0} flares a sortie; a flare beats an AA burst (hull 100); out of flares a patrol drone's blast lands (hull ${fp.hull})`);

  // ---- laser: dwell-time kill in clear air; fog stretches it, a storm shuts it down ----
  const lz = await p.evaluate(() => { const {api, G, Z} = __z, def = Z.def, out = {};
    __ar.strip(); G.state = 'base'; const j = def.SLOTS.findIndex((s, j) => def.slotFree(j) && /substation north/i.test(s.n)), d = Z.base.act.place('laser', j); G.state = 'wave'; def.deploy(); const s = def.SLOTS[j];
    const trial = wx => { __ar.clear(); api.S.zwx = 'z'; Z.wx.set(wx); __ar.pilot(); __ar.away(); const t = __z.make('shahed', s.x, s.z - 1200); t.p.y = api.gh(t.p.x, t.p.z) + 400; t.alt = 400; let on = -1, n = 0;
      while (api.live(t) && n < 30 * 60) { api.step(1 / 60); n++; if (on < 0 && d.lz) on = n; } return {t: on < 0 ? null : +((n - on) / 60).toFixed(2), alive: api.live(t), beam: on >= 0}; };
    out.clear = trial('clear'); out.fog = trial('fog'); out.storm = trial('storm'); Z.wx.set('clear'); out.kills = d.kills; return out; });
  ok(lz.clear.t > 5.6 && lz.clear.t < 6.6 && !lz.clear.alive, `Laser: burns a Shahed down in ${lz.clear.t} s of beam in clear air (6 s by the book, no dice)`);
  ok(lz.fog.t > lz.clear.t * 2.5, `Laser weakness: fog stretches the burn to ${lz.fog.t} s`);
  ok(!lz.storm.beam, 'Laser weakness: in a heavy storm it never fires');

  // ---- microwave dome: one pulse fries a swarm; a jet in the same bubble flies on ----
  const mw = await p.evaluate(() => { const {api, G, Z} = __z, def = Z.def, out = {};
    __ar.clear(); __ar.strip(); G.state = 'base'; const j = def.SLOTS.findIndex((s, j) => def.slotFree(j) && /fuel depot north/i.test(s.n)), d = Z.base.act.place('mwave', j); G.state = 'wave'; def.deploy(); const s = def.SLOTS[j];
    __ar.pilot(); __ar.away(); const S = []; for (let i = 0; i < 6; i++) { const t = __z.make('swarm', s.x + (i - 3) * 30, s.z - 300, s.site); t.p.y = api.gh(t.p.x, t.p.z) + 40; S.push(t); }
    const jt = __z.make('jet', s.x, s.z - 250); jt.p.y = api.gh(jt.p.x, jt.p.z) + 300; jt.alt = 300; __z.sim(1); out.swarm = S.filter(t => !api.live(t)).length; out.jet = api.live(jt); out.pulses = d.shots; out.cd = +d.cd.toFixed(1); return out; });
  ok(mw.swarm === 6 && mw.pulses === 1, `Microwave dome: one pulse fried all ${mw.swarm} swarm drones (recharging, ${mw.cd} s left)`);
  ok(mw.jet, 'Microwave weakness: a jet inside the dome flies on');

  // ---- balloon barrage: snags low swarm drones, a few a wave; a high Shahed passes over; your own drone can hit a cable ----
  const ba = await p.evaluate(() => { const {api, G, Z} = __z, def = Z.def, out = {};
    __ar.clear(); __ar.strip(); G.state = 'base'; const j = def.SLOTS.findIndex((s, j) => def.slotFree(j) && /apartments north/i.test(s.n)), d = Z.base.act.place('barrage', j); G.state = 'wave'; def.deploy(); const s = def.SLOTS[j];
    __ar.pilot(); __ar.away(); const S = []; for (let i = 0; i < 8; i++) { const t = __z.make('swarm', s.x + (i - 4) * 25, s.z - 700, s.site); t.p.y = api.gh(t.p.x, t.p.z) + 45; t.wps.length = 0; S.push(t); }
    const hi = __z.make('shahed', s.x, s.z - 900); hi.p.y = api.gh(hi.p.x, hi.p.z) + 600; hi.alt = 600; hi.wps.length = 0; hi.aim = new api.THREE.Vector3(s.x, hi.p.y, s.z + 20000);
    __ar.rig(() => { for (let i = 0; i < 40 * 60 && S.some(api.live); i++) api.step(1 / 60); }, .01); out.snag = d.snag; out.cap = Z.def.L(d).snags; out.hi = !d.jam.has(hi.id);
    out.balloons = d.bw?.length; const q = d.bw[0], me = __ar.pilot(0); me.p.set(q.x + .8, q.g0 + 60, q.z); me.v.set(0, 0, 0); api.step(1 / 60); out.crash = me.dead > 0; return out; });
  ok(ba.balloons === 4 && ba.snag === ba.cap, `Barrage: ${ba.balloons} balloons up; low swarm drones snagged until the wave's ${ba.cap} snags are used up (${ba.snag})`);
  ok(ba.hi, 'Barrage weakness: a Shahed crossing at 600 m passes over the cables');
  ok(ba.crash, 'Barrage weakness: your own interceptor flying into a cable crashes');

  // ---- smoke: a diving track loses its aim and hits a field (no damage, no money); wind thins it ----
  const sm = await p.evaluate(() => { const {api, G, Z} = __z, def = Z.def, out = {};
    __ar.clear(); __ar.strip(); G.state = 'base'; const j = def.SLOTS.findIndex((s, j) => def.slotFree(j) && /substation west/i.test(s.n)), d = Z.base.act.place('smoke', j); G.state = 'wave'; def.deploy(); const s = def.SLOTS[j], site = s.site;
    __ar.pilot(); __ar.away(); api.WB.set(3, 0, 0); const aim = site.aims[0], t = __z.make('shahed', aim.x, aim.z - 300, site); t.aim = aim; t.wps.length = 0; t.p.set(aim.x, aim.y + 150, aim.z - 150); t.st = 'dive';
    const hp0 = site.hp, c0 = G.cash; __ar.rig(() => { for (let i = 0; i < 20 * 60 && api.live(t); i++) api.step(1 / 60); }); out.smk = !!t.smk; out.hp = site.hp === hp0; out.hpv = [hp0, site.hp]; out.cash = G.cash === c0; out.div = d.kills; out.st = t.st;
    api.WB.set(12, 0, 0); api.step(1 / 60); out.wk = d.wk; api.WB.set(3, 0, 0); return out; });
  ok(sm.smk && sm.hp && sm.div === 1, 'Smoke: a Shahed diving on the substation lost its aim in the smoke and hit a field; the site took no damage' + (sm.smk && sm.hp ? '' : ' ' + JSON.stringify(sm)));
  ok(sm.cash && sm.wk === .6, `Smoke weakness: no money for it; a 12 m/s wind thins it (x${sm.wk})`);

  // ---- drone carrier: parked anywhere without taking a position, a load of drones in volleys, no rearm in a wave ----
  const ca = await p.evaluate(() => { const {api, G, Z} = __z, def = Z.def, A = Z.ars, out = {};
    __ar.clear(); __ar.strip(); G.state = 'base'; G.cash = 30000; const free0 = def.SLOTS.filter((_, j) => def.slotFree(j)).length; const j = def.SLOTS.findIndex((_, j) => def.slotFree(j, 'carrier')), d = Z.base.act.place('carrier', j);
    out.park = def.SLOTS[j].park === 1; out.free = def.SLOTS.filter((_, j) => def.slotFree(j)).length === free0; A.park(d.id, 400, -200); out.at = [def.SLOTS[j].x, def.SLOTS[j].z].join();
    G.state = 'wave'; def.deploy(); out.ammo0 = d.ammo; __ar.pilot(); __ar.away(); const L = []; for (let i = 0; i < 8; i++) { const t = __z.make('shahed', 400 + (i - 4) * 120, -1400 - i * 60); t.p.y = api.gh(t.p.x, t.p.z) + 400; t.alt = 400; L.push(t); }
    __z.sim(4); out.ammo1 = d.ammo; out.shots = d.shots; __z.sim(30); out.kills = d.kills; d.ammo = 0; __z.sim(20); out.ammo2 = d.ammo; return out; });
  ok(ca.park && ca.free && ca.at === '400,-200', `Carrier: parks at (${ca.at}) without taking one of the positions`);
  ok(ca.ammo0 === 12 && ca.ammo1 <= 4 && ca.shots >= 8 && ca.kills >= 2, `Carrier: ${ca.shots} drones out in volleys within 4 s (${ca.ammo0} -> ${ca.ammo1} left), ${ca.kills} kills`);
  ok(ca.ammo2 === 0, 'Carrier weakness: empty, it stays empty for the rest of the wave (no rearm)');

  // ---- bots (tools/zbot.mjs): a Legend at wave 16 with money to spend builds arsenal defences, parks its carrier and loads a weapon for the wave ----
  await p.evaluate(() => { const {G, Z} = __z; __ar.clear(); __ar.strip(); __z.jump(16, 40000); Z.base.open(); G.next = __z.plan(16); G.next.list = ['shahed', 'shahed', 'jet', 'swarm:16', 'swarm:16', 'swarm:12']; });  /* a swarm-heavy wave: the standard warhead is not the best answer */
  await p.evaluate(BOT_SHOP + `(${JSON.stringify(botLevel('Legend'))})`);
  const bot = await p.evaluate(() => { const {G, Z} = __z, def = Z.def, c = def.D.find(d => d.type === 'carrier'), s = c && def.SLOTS[c.slot], b = Z.ars.bestPark();
    return {ars: def.D.filter(d => ['laser', 'mwave', 'barrage', 'smoke', 'carrier'].includes(d.type)).map(d => d.type).join(), parked: !!s && Math.hypot(s.x - b.x, s.z - b.z) < 5, w: Z.ars.cur(), own: [...Z.ars.P(Z.ars.me()).own].join()}; });
  ok(bot.ars.length > 0 && bot.parked, `Bots: a Legend's base screen builds [${bot.ars}] and parks its carrier on the main approach`);
  ok(bot.w !== 'std', `Bots: the Legend weighs the weapons against the next wave and loads the ${bot.w} for a swarm-heavy wave (owns ${bot.own})`);
  if (SHOTS) { await p.evaluate(() => { __z.Z.base.setTab('armory'); }); await p.screenshot({path: SHOTS + '/ars-armory.png'}); }
  ok(!errs.length, 'Arsenal: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- radio chatter (zradio.js): callouts from the game's state, merged and rate-limited; the HUD log, a modest squelch, speech through
// speechSynthesis (and without it); the old subtitle taken over and given back; muted in menus; nothing left behind when a wave ends ----------
if (want('radio')) {
  const {p, errs} = await page('z');
  await play(p);
  const r0 = await p.evaluate(() => { const {S} = __z.api, {Z} = __z, R = Z.radio;
    window.__syn = {spoken: [], cancels: 0, speaking: false, pending: false, speak(u) { this.spoken.push({text: u.text, pitch: u.pitch, rate: u.rate, volume: u.volume}); }, cancel() { this.cancels++; }, getVoices() { return []; }};
    window.__Utt = function (t) { this.text = t; };
    R.env.synth = () => window.__syn; R.env.utter = () => window.__Utt;  /* a speechSynthesis stand-in: what was said, and when it was cut off */
    window.__rf = () => { R.flush(); for (let i = 0; i < 5; i++) R.step(2); };  /* make the merged calls due and let the channel run */
    window.__at = (brg, k = 'shahed', site = 1, rr = 5000) => __z.make(k, Math.sin(brg) * rr, 1950 - Math.cos(brg) * rr, __z.api.SITES[site]);
    window.__clr = () => { for (const u of __z.api.TH) __z.api.scene.remove(u.mesh); __z.api.TH.length = 0; const k = __at(.3, 'shahed', 0, 5000); k._rz = 1; };  /* the sky is emptied but for one far track nobody calls: the page's own loop would end the wave between two checks */
    return {has: !!R, rows: ['f_zradio', 'f_zrspeech', 'f_zradiov'].map(id => !!document.getElementById(id)), css: !!document.querySelector('link[href*="zradio.css"]'), chat: !!document.getElementById('zchat'),
      def: [S.zradio, S.zrspeech, S.zradiov], cap: R.cap, ac: !!__z.api.AC}; });
  ok(r0.has && r0.css && r0.chat && r0.rows.every(Boolean), 'Radio: the module is up with its HUD log, stylesheet and three settings rows (chatter, speech, volume)');
  ok(r0.def[0] === true && r0.def[1] === true && r0.def[2] === .6 && r0.cap <= .1, `Radio: defaults are chatter on, speech on, volume ${r0.def[2]}; the sound cap is ${r0.cap}`);

  // new tracks: three Shaheds from the east are one call, with the direction and the site they threaten
  const m1 = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio;
    __z.cont(); G.wq.length = 0; R.hush(); R.calls.length = 0;
    for (let i = 0; i < 3; i++) __at(1.571 + i * .03);
    __z.sim(8);
    return {calls: R.calls.map(c => `${c.topic}|${c.pri}|${c.who}|${c.txt}`), err: R.err && String(R.err.stack || R.err), lines: R.lines().length, dom: document.querySelectorAll('#zchat .zc').length}; });
  const trk1 = m1.calls.filter(c => c.startsWith('trk|'));
  ok(m1.calls.some(c => /^wave\|1\|OVERLORD\|.*(Wave|wave) 1/.test(c) && /three/.test(c)), `Radio: the wave start is called, with the track count ("${(m1.calls.find(c => c.startsWith('wave|')) || '').split('|')[3]}")`);
  ok(trk1.length === 1 && /Three Shaheds from the east, heading for the fuel depot|Three (new )?Shaheds? (coming in )?from the east/.test(trk1[0]), `Radio: three new tracks are one call ("${(trk1[0] || 'none').split('|')[3]}")`);
  ok(!m1.err && m1.lines === m1.dom && m1.dom >= 2 && m1.dom <= 3, `Radio: the HUD log shows ${m1.dom} lines (never more than three), no errors in the module`);

  // a flood of tracks from every side: one 'trk' call at a time at least six seconds apart (merged, not a call each), and the calls per 20 s stay within the budget
  const fl = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio;
    __clr(); R.hush(); R.calls.length = 0; const made0 = R.st.made;
    for (let k = 0; k < 24; k++) { __at(-1.2 + (k % 8) * .35, 'shahed', k % 3); __z.sim(.5); }
    __z.sim(30);
    const L = R.calls, tr = L.filter(c => c.topic === 'trk'); let win = 0; for (const c of L) win = Math.max(win, L.filter(d => d.t >= c.t && d.t < c.t + 20).length);
    return {tracks: api.TH.filter(api.live).length, calls: L.length, trk: tr.length, gaps: tr.slice(1).map((c, i) => +(c.at - tr[i].at).toFixed(1)), win, drop: {...R.st.drop}, txt: tr.map(c => c.txt)}; });
  ok(fl.trk >= 1 && fl.trk <= 8 && fl.trk < 24 / 2, `Radio merging: 24 tracks over 12 s made ${fl.trk} track calls ("${fl.txt[0]}")`);
  ok(fl.gaps.every(g => g >= 5.9), `Radio cooldown: the track calls are at least 6 s apart (${fl.gaps.join(', ')})`);
  ok(fl.win <= 4, `Radio budget: at most ${fl.win} calls in any 20 s of a track flood (4 allowed), ${fl.drop.rate} held back by the budget`);
  const big = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio; __clr(); R.hush(); R.calls.length = 0;
    for (let i = 0; i < 12; i++) __at(-.05 + i * .008);
    __z.sim(8); return R.calls.filter(c => c.topic === 'trk').map(c => c.txt); });
  ok(big.length === 1 && /^Twelve .* from the north/.test(big[0]), `Radio merging: twelve tracks from the north in a second are one call ("${big[0]}")`);

  // the kill chain: launch detected, brace for impact, then the layer that stopped it
  const ch = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {};
    __clr(); R.hush(); R.calls.length = 0;
    const h = __at(0, 'hyper', 2, 40000); __z.sim(26);  /* about 31 s to impact; the 20 s warning shows it 11 s in, terminal at 12 s out is 19 s in */
    out.det = R.calls.map(c => `${c.topic}|${c.pri}|${c.who}|${c.txt}`);
    __clr(); out.kills = {};
    for (const [name, set] of [['bkill', t => { t.kc.b = 'kill'; }], ['tkill', t => { t.kc.pd = 'kill'; }], ['mkill', t => { t.claim = {type: 'gdome'}; }], ['dkill', t => { t.by = 'p'; }]]) {
      R.hush(); R.calls.length = 0; const t = __at(-1, 'ballistic', 0, 30000); t.kc = {sec: 0, b: 'none', det: 1, mm: 0, pd: '', dc: 0}; t.by = 'h'; set(t); api.killThreat(t, true); __rf();
      out.kills[name] = R.calls.map(c => c.topic + '|' + c.txt); out.kills[name + 'Pend'] = R.pend().join(); }
    R.hush(); R.calls.length = 0; const t2 = __at(0, 'ballistic', 1, 60000); t2.kc = {sec: 1, b: 'miss', det: 1, mm: 0, pd: '', dc: 0}; out.miss = [];
    __z.sim(.6); __rf(); out.miss.push(R.calls.map(c => c.txt)); R.calls.length = 0;
    t2.claim = {type: 'idome'}; __z.sim(.6); __rf(); out.miss.push(R.calls.map(c => c.txt)); R.calls.length = 0;
    t2.claim = null; t2.kc.mm = 1; __z.sim(.6); __rf(); out.miss.push(R.calls.map(c => c.txt)); R.calls.length = 0;
    t2.kc.pd = 'miss'; __z.sim(.6); __rf(); out.miss.push(R.calls.map(c => c.pri + '|' + c.txt));
    out.err = R.err && String(R.err.stack || R.err); __clr(); return out; });
  ok(ch.det.some(c => /^fast\|[23]\|EARLY WARNING\|.*(aunch|Hypersonic).*apartments/i.test(c) && /hypersonic/i.test(c)), `Radio kill chain: a launch is called with the missile, the site and the time ("${(ch.det.find(c => c.startsWith('fast|')) || '').split('|')[3]}")`);
  ok(ch.det.some(c => /^chain\|3\|EARLY WARNING\|.*(Brace|terminal)/.test(c)), `Radio kill chain: urgent brace call as it dives ("${(ch.det.find(c => c.startsWith('chain|')) || '').split('|')[3]}")`);
  ok(/Boost-phase|boost/i.test(ch.kills.bkill.join()) && /Point defence got|Terminal kill/.test(ch.kills.tkill.join()) && /Midcourse kill|Dome got/.test(ch.kills.mkill.join()) && /Direct hit|destroyed/.test(ch.kills.dkill.join()),
    `Radio kill chain: each layer's kill is called by name: ${['bkill', 'tkill', 'mkill', 'dkill'].map(k => ch.kills[k].map(c => c.split('|')[1]).join('/')).join(' · ')}`);
  ok(!ch.kills.bkillPend && ['bkill', 'tkill', 'mkill', 'dkill'].every(k => ch.kills[k].length === 1 && ch.kills[k][0].startsWith('chain|')), 'Radio kill chain: a fast missile\'s kill is one chain call, not also a "splash"');
  ok(/battery missed|Boost-phase miss/.test(ch.miss[0].join()) && /Midcourse intercept|Dome has/.test(ch.miss[1].join()) && /Midcourse missed|Dome missed/.test(ch.miss[2].join()) && /^3\|.*(Point defence missed|got through point defence)/.test(ch.miss[3].join()),
    `Radio kill chain: boost miss, midcourse engagement, midcourse miss and a missed point defence (urgent) are called ("${ch.miss.map(m => (m[m.length - 1] || '').replace(/^\d\|/, '')).join('" / "')}")`);

  // the channel: an important call waits, an urgent one cuts in; a stale ambient call is dropped; repeats and chatter inside a cooldown are not said
  const q1 = await p.evaluate(() => { const {Z} = __z, R = Z.radio, out = {}; R.hush(); R.calls.length = 0; const c0 = R.st.cut, cancels0 = __syn.cancels;
    R.say('x', 1, 'OVERLORD', 'This is a long routine call that keeps the channel busy for a good while yes.'); const c1 = R.cur;
    R.say('y', 2, 'OVERLORD', 'Important but not urgent.'); out.imp = {cur: R.cur === c1, queued: R.q.map(c => c.txt), cut: R.st.cut - c0};
    R.say('z', 3, 'OVERLORD', 'Urgent call.'); out.urg = {cur: R.cur?.txt, firstCut: c1.cut === 1, cut: R.st.cut - c0, cancels: __syn.cancels - cancels0};
    R.hush(); const s0 = R.st.drop.stale, d0 = R.st.drop.dup, k0 = R.st.drop.cool;
    R.say('a', 1, 'OVERLORD', 'First long call that holds the channel for quite a long while, over.'); R.say('c', 1, 'OVERLORD', 'Second long call that also holds the channel for a good while, over.'); R.say('b', 0, 'OVERLORD', 'Ambient chatter that goes stale.');
    R.step(7); R.step(1); out.stale = {dropped: R.st.drop.stale - s0, said: R.calls.some(c => /Ambient/.test(c.txt))};
    R.hush(); R.say('d', 1, 'OVERLORD', 'Same words.'); const again = R.say('d2', 1, 'OVERLORD', 'Same words.'); out.dup = {again, n: R.st.drop.dup - d0};
    R.say('kill', 0, 'DART ONE', 'Splash one.'); const k2 = R.say('kill', 0, 'DART ONE', 'Splash two.'); out.cool = {again: k2, n: R.st.drop.cool - k0}; R.hush(); return out; });
  ok(q1.imp.cur && q1.imp.queued.length === 1 && q1.imp.cut === 0, 'Radio channel: an important (priority 2) call waits for the one on the air');
  ok(q1.urg.cur === 'Urgent call.' && q1.urg.firstCut && q1.urg.cut === 1 && q1.urg.cancels >= 1, 'Radio channel: only an urgent (priority 3) call cuts in, and the speech of the cut call is cancelled');
  ok(q1.stale.dropped >= 1 && !q1.stale.said, 'Radio channel: an ambient call that waited too long is dropped, not said late');
  ok(q1.dup.again === false && q1.dup.n === 1 && q1.cool.again === false && q1.cool.n === 1, 'Radio channel: the same words twice, and a second call of a topic inside its cooldown, are not said');

  // the sites: small hits add up before they are called; a site in trouble and a site lost are urgent
  const st1 = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, s = api.SITES[1], out = {}; __clr(); R.hush(); R.calls.length = 0; R.scan();
    for (let i = 0; i < 3; i++) { s.hp -= 5; R.scan(); } out.small = R.pend().includes('site');
    s.hp -= 5; R.scan(); out.added = R.pend().includes('site'); __rf(); out.hit = R.calls.map(c => c.pri + '|' + c.txt);
    R.hush(); R.calls.length = 0; s.hp = s.max * .3; R.scan(); __rf(); out.crit = R.calls.map(c => c.pri + '|' + c.txt);
    R.hush(); R.calls.length = 0; s.hp = 0; R.scan(); __rf(); out.lost = R.calls.map(c => c.pri + '|' + c.txt);
    s.hp = s.max; R.scan(); R.hush(); out.err = R.err && String(R.err.stack || R.err); return out; });
  ok(!st1.small && st1.added && /^2\|.*fuel depot/.test(st1.hit[0] || ''), `Radio sites: three 5-point hits stay quiet, the fourth is called ("${(st1.hit[0] || '').slice(2)}")`);
  ok(/^3\|.*(critical|won't take much more).*(30|25) percent/.test(st1.crit[0] || '') && /^3\|.*(lost the fuel depot|fuel depot is gone)/.test(st1.lost[0] || ''), `Radio sites: critical ("${(st1.crit[0] || '').slice(2)}") and lost ("${(st1.lost[0] || '').slice(2)}") are urgent`);

  // helpers (a SAM battery running dry, the swarm), the pilot's battery, the bosses
  const hb = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {}; __clr(); R.hush(); R.calls.length = 0;
    const d = Z.def.add('sam', 0); Z.def.deploy(); R.scan(); out.mag = d.ammo; d.ammo = 0; R.scan(); __rf(); out.sam = R.calls.map(c => c.who + '|' + c.txt); Z.def.remove(d);
    R.hush(); R.calls.length = 0; R.note('help', {sw: 1, left: 2}); __rf(); out.sw = R.calls.map(c => c.txt);
    R.hush(); R.calls.length = 0; const me = api.player; me.dead = 0; me.mah = api.BCAP * .75; R.scan(); __rf(); out.b1 = R.calls.map(c => c.txt);
    me.mah = api.BCAP * .95; R.hush(); R.calls.length = 0; R.scan(); __rf(); out.b2 = R.calls.map(c => c.txt); me.mah = 0; R.scan(); R.hush(); return out; });
  ok(hb.mag > 0 && /^LANCE\|(Magazine empty|Out of missiles|Winchester)/.test(hb.sam[0] || ''), `Radio helpers: the SAM battery (callsign LANCE) reports its magazine empty ("${hb.sam[0]}")`);
  ok(/swarm/i.test(hb.sw[0] || ''), `Radio swarm: a lost swarm drone is called ("${hb.sw[0]}")`);
  ok(/Battery|pack/.test(hb.b1[0] || '') && /critical/i.test(hb.b2[0] || ''), `Radio battery: 25% ("${hb.b1[0]}") then critical ("${hb.b2[0]}")`);
  const bs = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {}; __clr(); R.hush(); R.calls.length = 0;
    const b = __z.make('boss', 5000, 1950, api.SITES[1]); __z.sim(2); __rf(); out.arr = R.calls.map(c => c.txt); R.calls.length = 0;
    Z.bossHit(b); __z.sim(.6); __rf(); out.stage = R.calls.map(c => c.txt); R.calls.length = 0;
    __clr(); const j = Z.bosses.spawn('jugg', {brg: 1}); __z.sim(.6); Z.fxTest?.endCine(); R.hush(); R.calls.length = 0; j.bs.ph = 1; __z.sim(.6); __rf(); out.phase = R.calls.map(c => c.txt);
    Z.bossClear('test'); Z.fxTest?.endCine(); __clr(); R.hush(); R.calls.length = 0;
    const b2 = __z.make('boss', 5000, 1950, api.SITES[1]); __z.sim(.6); R.hush(); R.calls.length = 0; api.killThreat(b2, true); __rf(); out.down = R.calls.map(c => c.txt); __clr(); out.err = R.err && String(R.err.stack || R.err); return out; });
  ok(/Heavy contact.*Mothership|Mothership/.test(bs.arr[0] || '') && /Stage down\. Two left/.test(bs.stage[0] || '') && /Mothership|carrier/.test(bs.down[0] || ''), `Radio bosses: arrival ("${bs.arr[0]}"), a stage ("${bs.stage[0]}"), the kill ("${bs.down[0]}")`);
  ok(/breached/i.test(bs.phase.join(' ')) && !bs.err, `Radio bosses: a phase change is called ("${bs.phase.find(t => /breached/i.test(t)) || bs.phase[0]}")`);

  // co-op partners, from the state a client has (pilots, their drones' dead flags, the kill credit)
  const co = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {}, k0 = [Z.pilotsK, Z.netMe, Z.netName]; __clr(); R.hush(); R.calls.length = 0;
    const peer = {dead: 0}; let list = [['me', api.player], ['p2', peer]]; Z.pilotsK = () => list; Z.netMe = () => 'me'; Z.netName = k => 'Sam';
    R.scan(); __rf(); out.join = R.calls.map(c => c.txt); R.calls.length = 0; R.hush();
    peer.dead = 1; R.scan(); __rf(); out.down = R.calls.map(c => c.pri + '|' + c.txt); R.calls.length = 0; R.hush();
    peer.dead = 0; R.scan(); __rf(); out.up = R.calls.map(c => c.txt); R.calls.length = 0; R.hush();
    list = [['me', api.player]]; R.scan(); __rf(); out.left = R.calls.map(c => c.txt); R.calls.length = 0; R.hush();
    const t = __at(.5, 'shahed', 0, 3000); t.by = 'o'; t.byN = 'p2'; api.killThreat(t, true); __rf(); out.kill = R.calls.map(c => c.who + '|' + c.txt);
    [Z.pilotsK, Z.netMe, Z.netName] = k0; __clr(); R.hush(); return out; });
  ok(/Sam is on the net/.test(co.join[0] || '') && /^2\|.*Sam/.test(co.down[0] || '') && /Sam is back/.test(co.up[0] || '') && /dropped off/.test(co.left[0] || ''), `Radio co-op: a partner joining, going down, coming back and leaving are called ("${co.join[0]}" / "${(co.down[0] || '').slice(2)}" / "${co.up[0]}" / "${co.left[0]}")`);
  ok(/^SAM\|(Splash|Kill confirmed|Target down)/.test(co.kill[0] || ''), `Radio co-op: a partner's kill is called under their name ("${co.kill[0]}")`);

  // the old subtitle: its generic lines are covered by the events here and dropped; a boss's scripted line comes through the same channel
  const lg = await p.evaluate(() => { const {Z} = __z, R = Z.radio, out = {}; R.hush(); R.calls.length = 0; const n0 = R.st.made, l0 = R.st.by.line | 0;
    for (const t of ['Sky is clear. Rearm and stand by.', 'Air raid warning. Wave 5, all units stand to.', 'Impact on the substation! 200 left.', 'Fuel depot is hit! 340 left.', 'Splash two.', 'Launch detected, ballistic missile, fuel depot, 30 seconds.', 'Three Shaheds inbound from the north-east.', "We've lost the apartments!"]) Z.an.radio('OVERLORD', t, 1);
    out.generic = R.st.made - n0; Z.an.radio('KOSCHEI', '"Another day, little drone."', 2); out.line = R.cur ? [R.cur.who, R.cur.vc, R.cur.txt, R.cur.topic] : null;
    R.step(1); Z.an.radio('EARLY WARNING', 'Re-entry, re-entry! Warhead coming down on the substation, 20 seconds.', 2); out.reentry = (R.st.by.line | 0) - l0; R.hush(); return out; });
  ok(lg.generic === 0 && lg.line && lg.line[0] === 'KOSCHEI' && lg.line[1] === 'foe' && lg.line[3] === 'line' && lg.reentry === 2, `Radio takeover: eight generic subtitle lines dropped, a boss's line and the re-entry call come through (${lg.line && lg.line.join(' / ')})`);

  // presentation: the log, the squelch and static, and the loudness cap
  const au = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, S = api.S, out = {}; R.hush(); const n0 = R.au.n, sp0 = __syn.spoken.length;
    S.zradiov = 1; S.zsfxv = 1; for (const t of ['Level check one.', 'Level check two.', 'Level check three.', 'Level check four.']) { R.say('lv' + t, 2, 'OVERLORD', t); R.step(6); R.step(1); }
    out.full = {peak: R.au.peak, bus: R.busGain(), n: R.au.n - n0, spoken: __syn.spoken.slice(sp0)}; out.lines = R.lines(); out.dom = document.querySelectorAll('#zchat .zc').length;
    S.zradiov = 9; S.zsfxv = 7; R.hush(); R.say('lvb', 2, 'OVERLORD', 'Level check five.'); out.bad = {peak: R.au.peak, bus: R.busGain()};
    S.zradiov = 0; R.hush(); const n1 = R.au.n, sp1 = __syn.spoken.length; R.say('lvc', 2, 'OVERLORD', 'Level check six.'); out.mute = {sound: R.au.n - n1, spoken: __syn.spoken.length - sp1, logged: R.calls.at(-1)?.txt};
    S.zradiov = .6; S.zsfxv = 1; R.hush(); out.ac = !!api.AC; return out; });
  ok(au.ac ? au.full.n === 4 && au.full.peak > 0 && au.full.peak <= r0.cap + 1e-9 && au.full.bus <= r0.cap + 1e-9 && au.bad.peak <= r0.cap + 1e-9 && au.bad.bus <= r0.cap + 1e-9 : true,
    `Radio sound: a squelch click and a static burst per call (${au.full.n} for 4 calls); loudest ${au.full.peak.toFixed(3)} at full volume, ${au.bad.bus.toFixed(3)} even with a bad volume setting, cap ${r0.cap}`);
  ok(au.lines.length === 3 && au.dom === 3 && /Level check four/.test(au.lines[2]), `Radio log: the HUD shows the last three calls (${au.lines.map(l => l.replace(/^OVERLORD/, '')).join(' | ')})`);
  ok(au.mute.sound === 0 && au.mute.spoken === 0 && au.mute.logged === 'Level check six.', 'Radio volume 0: the call is still logged on the HUD but there is no sound and no speech');

  // speech: clipped and quick; cut with the call; off in the settings; absent in the browser
  const sp = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, S = api.S, out = {}; R.hush(); R.calls.length = 0; __syn.spoken.length = 0;
    R.say('s1', 2, 'OVERLORD', 'Speech check one.'); R.say('s2', 3, 'EARLY WARNING', 'Speech check two.'); R.hush(); R.say('s3', 2, 'KOSCHEI', '"Speech check three."');
    out.said = __syn.spoken.map(s => s.text); out.v = __syn.spoken.map(s => [s.pitch, s.rate, s.volume]);
    R.hush(); S.zrspeech = false; const n0 = __syn.spoken.length; R.say('s4', 2, 'OVERLORD', 'Speech check four.'); out.off = {spoken: __syn.spoken.length - n0, logged: R.calls.at(-1)?.txt}; S.zrspeech = true;
    R.hush(); const na0 = R.speech.na; R.env.synth = () => undefined; R.say('s5', 2, 'OVERLORD', 'Speech check five.'); out.none = {na: R.speech.na - na0, logged: R.calls.at(-1)?.txt, lines: R.lines().length};
    R.hush(); R.env.synth = () => { throw new Error('no speech here'); }; R.say('s6', 2, 'OVERLORD', 'Speech check six.'); out.throws = R.calls.at(-1)?.txt;
    R.env.synth = () => window.__syn; R.hush(); R.env.utter = () => { throw new Error('no utterance'); }; R.say('s7', 2, 'OVERLORD', 'Speech check seven.'); out.badUtter = R.calls.at(-1)?.txt;
    R.env.utter = () => window.__Utt; R.hush(); return out; });
  ok(sp.said.length === 3 && sp.said[0] === 'Speech check one.' && sp.said[2] === 'Speech check three.' && sp.v.every(([pi, ra, vo]) => pi > .3 && pi < 1.5 && ra >= .85 && ra <= 1.4 && vo > 0 && vo <= .8), `Radio speech: spoken through speechSynthesis, clipped and quick (pitch / rate / volume ${sp.v.map(v => v.join('/')).join(', ')}); a boss voices lower and slower`);
  ok(sp.v[2][0] < sp.v[0][0] && sp.v[2][1] < sp.v[0][1], 'Radio speech: the base, the defences and a boss voice differ in pitch and rate');
  ok(sp.off.spoken === 0 && sp.off.logged === 'Speech check four.', 'Radio speech: off in the settings, the call still shows on the HUD');
  ok(sp.none.na === 1 && sp.none.logged === 'Speech check five.' && sp.none.lines >= 1 && sp.throws === 'Speech check six.' && sp.badUtter === 'Speech check seven.', 'Radio speech: no speechSynthesis in the browser (or one that throws) is handled: the calls still run, log and sound');

  // muted in menus
  const mu = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, out = {}; __clr(); __at(.3, 'shahed', 0, 5000); R.hush(); R.calls.length = 0; const sp0 = __syn.spoken.length, q0 = R.st.drop.quiet;
    R.say('m1', 1, 'OVERLORD', 'Menu check before.'); out.before = R.cur?.txt; api.showMenu(true); __z.sim(.3);
    out.cleared = !R.cur && !R.q.length && R.lines().length === 0; const ok1 = R.say('m2', 1, 'OVERLORD', 'Menu check during.'); out.during = {ok: ok1, drop: R.st.drop.quiet - q0, cur: R.cur?.txt};
    api.showMenu(false); R.hush(); const ok2 = R.say('m3', 1, 'OVERLORD', 'Menu check after.'); out.after = {ok: ok2, cur: R.cur?.txt}; R.hush(); return out; });
  ok(mu.before === 'Menu check before.' && mu.cleared && mu.during.ok === false && mu.during.drop === 1 && !mu.during.cur && mu.after.ok === true, 'Radio menus: opening the menu hushes the channel (speech cancelled, log cleared) and nothing is said while it is open');

  // the settings rows, saved with the rest; Off gives the old subtitle back
  await p.select('#f_zradio', '0'); await p.select('#f_zrspeech', '0'); await p.$eval('#f_zradiov', e => { e.value = '.3'; e.dispatchEvent(new Event('input')); });
  const sv = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, out = {}, s = JSON.parse(localStorage.getItem('dl-interceptor')); out.saved = [s.zradio, s.zrspeech, s.zradiov]; out.live = [api.S.zradio, api.S.zrspeech, api.S.zradiov];
    R.hush(); const n0 = R.st.made; Z.an.radio('OVERLORD', 'Sky is clear. Rearm and stand by.', 1); Z.an.radioTick(); out.legacy = {cls: document.getElementById('zradio').className, made: R.st.made - n0}; Z.an.radioClear?.();
    out.sayOff = R.say('off1', 2, 'OVERLORD', 'Radio is off.'); return out; });
  ok(sv.saved[0] === false && sv.saved[1] === false && sv.saved[2] === .3 && sv.live[0] === false, `Radio settings: chatter, speech and volume are saved with the other settings (${sv.saved.join(', ')})`);
  ok(/on/.test(sv.legacy.cls) && sv.legacy.made === 0 && sv.sayOff === false, 'Radio settings: with the chatter off the old radio subtitle comes back and nothing is queued');
  await p.select('#f_zradio', '1'); await p.select('#f_zrspeech', '1'); await p.$eval('#f_zradiov', e => { e.value = '.6'; e.dispatchEvent(new Event('input')); });

  // the end of this scripted wave (the sky is emptied): the clear is called, and when the base screen opens nothing is left on the air, in the queue, on the HUD or in a speech queue
  const w0 = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {}; for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; R.hush(); R.calls.length = 0; const by0 = R.st.by.wave | 0, c0 = __syn.cancels; G.wq.length = 0;
    let n = 0; while (G.state !== 'base' && n++ < 40) __z.sim(.5);
    out.state = G.state; out.by = (R.st.by.wave | 0) - by0; out.calls = R.calls.map(c => c.topic + '|' + c.txt); out.cancelled = __syn.cancels - c0;
    out.left = {q: R.q.length, cur: !!R.cur, pend: R.pend().length, lines: R.lines().length, dom: document.querySelectorAll('#zchat .zc').length, sw: R.sw(), live: R.speech.live}; return out; });
  ok(w0.state === 'base' && w0.by === 1 && /^wave\|.*(Sky is clear|held|defeated|All tracks down)/.test(w0.calls[0] || ''), `Radio wave end: the clear is called ("${(w0.calls[0] || '').split('|')[1]}")`);
  ok(w0.left.q === 0 && !w0.left.cur && w0.left.pend === 0 && w0.left.lines === 0 && w0.left.dom === 0 && w0.left.sw === 0 && w0.left.live === 0 && w0.cancelled >= 1, `Radio wave end: the base screen opens quiet, nothing left (queue ${w0.left.q}, on air ${w0.left.cur}, merging ${w0.left.pend}, HUD lines ${w0.left.lines}/${w0.left.dom}, speech queued ${w0.left.live}; the clear's speech cut: ${w0.cancelled})`);

  // a whole wave played by the director and a bot: the start and the end are called, kills and tracks in between, and again nothing is left when the base screen opens
  const w1 = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {}; R.hush(); R.calls.length = 0; const by0 = {...R.st.by}, cancels0 = __syn.cancels;
    __z.cont(); for (let i = 0; i < 700 && G.state !== 'base'; i++) { __z.sim(.5); if (api.player.dead <= 0 && Math.random() < .5) __z.botKill(.8); }
    out.state = G.state; out.by = Object.fromEntries(Object.keys(R.st.by).map(k => [k, R.st.by[k] - (by0[k] | 0)])); out.calls = R.calls.map(c => c.topic + '|' + c.txt);
    __z.sim(.2); out.left = {state: G.state, q: R.q.length, cur: !!R.cur, pend: R.pend().length, lines: R.lines().length, dom: document.querySelectorAll('#zchat .zc').length, sw: R.sw(), live: R.speech.live, cancelled: __syn.cancels - cancels0};
    out.err = R.err && String(R.err.stack || R.err); out.th = api.TH.filter(api.live).map(t => t.k).join(); out.wave = G.wave; return out; });
  ok(w1.state === 'base' && w1.by.wave >= 2 && w1.calls.some(c => /^wave\|(Wave|Stand to)/.test(c)) && w1.calls.length >= 3, `Radio wave: a wave played end to end made ${w1.calls.length} calls, the start and the end among them (${w1.by.wave} wave calls)`);
  ok(w1.left.state === 'base' && w1.left.q === 0 && !w1.left.cur && w1.left.pend === 0 && w1.left.lines === 0 && w1.left.dom === 0 && w1.left.sw === 0 && w1.left.live === 0, `Radio wave end: the base screen is quiet, nothing left (queue ${w1.left.q}, on air ${w1.left.cur}, merging ${w1.left.pend}, HUD lines ${w1.left.lines}/${w1.left.dom}, speech queued ${w1.left.live})`);

  // sorties: the launch, an AA lock, hits on the hull, salvage banked, a site found and destroyed; a lost sortie is called
  const so = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, so = __z.so, W = so.W, out = {}; R.hush(); R.calls.length = 0; so.S.used = -1; so.W.calm = true;
    const launched = so.launch(); __z.sim(.6); so.S.t = 1e4; __rf(); out.launch = [launched, ...R.calls.map(c => c.who + '|' + c.txt)]; R.calls.length = 0;
    so.S.tw = 1; so.S.hull = 60; __z.sim(.6); __rf(); out.hit = R.calls.map(c => c.txt); R.calls.length = 0; so.S.tw = 0;
    so.S.carry = 300; R.scan(); so.S.carry = 0; R.scan(); __rf(); out.bank = R.calls.map(c => c.txt); R.calls.length = 0;  /* salvage carried, then banked inside the line */
    const t = W.list.find(u => u.t === 'launch' && !u.dead); t.known = true; __z.sim(.6); __rf(); out.found = R.calls.map(c => c.txt); R.calls.length = 0;
    for (const q of t.parts.filter(x => x.main)) W.blast(q, 3, 1, 'me'); __z.sim(.6); __rf(); out.dead = R.calls.map(c => c.txt); R.calls.length = 0;
    R.note('so', {ev: 'end'}); __rf(); out.lost = R.calls.map(c => c.txt); R.calls.length = 0;
    so.finish(); __z.sim(.3); out.after = {on: so.S.on, calls: R.calls.length, base: !document.getElementById('zbase').hidden}; out.err = R.err && String(R.err.stack || R.err); return out; });
  ok(so.launch[0] === true && /clock|airborne|Off the mat/.test(so.launch[1] || ''), `Radio sortie: the launch is called by the pilot ("${so.launch[1]}")`);
  ok(/AA|Gun lock|tracking|Break off/.test(so.hit.join(' ')) && /hull|hit/i.test(so.hit.join(' ')) && /Salvage|Cargo/.test(so.bank.join(' ')), `Radio sortie: AA lock ("${so.hit[0]}"), hull ("${so.hit[1]}") and salvage banked ("${so.bank[0]}") are called`);
  ok(/Launch site located/.test(so.found[0] || '') && /Launch site (destroyed|is gone)/.test(so.dead[0] || ''), `Radio sortie: a site found ("${so.found[0]}") and destroyed ("${so.dead[0]}")`);
  ok(!so.after.on && so.after.base && so.after.calls === 0, 'Radio sortie: back inside the line the base screen is quiet (no call over the shop)');
  ok(/Sortie lost|lost the drone/.test(so.lost[0] || '') && !so.err, `Radio sortie: a lost sortie is called ("${so.lost[0]}")`);
  const own = await p.evaluate(() => { const e = __z.Z.radio.err; return e && String(e.stack || e); });
  ok(!own, 'Radio: the module caught no error of its own' + (own ? '\n  ' + own : ''));
  ok(!errs.length, 'Radio: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();

  // odd saved values (hand-edited or foreign) fall back to the defaults, and the game still plays
  const bad = [];
  for (const save of [{gmode: 'z', zradio: 'x', zrspeech: 5, zradiov: 'loud'}, {gmode: 'z', zradio: null, zrspeech: [], zradiov: 9}, {gmode: 'z', zradiov: -3}, {gmode: 'z', zradiov: null}, {gmode: 'z', zradio: false, zrspeech: false}]) {
    const e2 = [], p2 = await open(browser, origin + '/games/interceptor/', e2);
    await p2.evaluate(s => localStorage.setItem('dl-interceptor', JSON.stringify(s)), save); await p2.reload({waitUntil: 'load'});
    const up = await p2.waitForFunction(() => window.__z, {timeout: 60000}).then(() => true, () => false);
    let r = null;
    if (up) { await sleep(200); await p2.click('#play'); await sleep(300); r = await p2.evaluate(() => { const {G, Z, api} = __z; if (G.on) __z.cont(); __z.sim(5); const S = api.S; return {z: S.zradio, s: S.zrspeech, v: S.zradiov, ok: typeof S.zradiov === 'number' && S.zradiov >= 0 && S.zradiov <= 1 && typeof S.zradio === 'boolean' && typeof S.zrspeech === 'boolean', err: Z.radio.err && String(Z.radio.err)}; }); }
    if (!up || e2.length || !r?.ok || r.err) bad.push(JSON.stringify(save) + ' -> ' + JSON.stringify(r) + (up ? '' : ' (page never came up)') + (e2.length ? ' ' + e2[0] : ''));
    await p2.evaluate(() => localStorage.removeItem('dl-interceptor')); await p2.close();
  }
  ok(!bad.length, 'Radio saves: odd saved values load as defaults and play' + (bad.length ? '\n  ' + bad.join('\n  ') : ''));
}

// ---------- balance: a scripted player who shops sensibly and runs down a share of the tracks; how far does it get? ----------
if (argv.includes('--balance')) {  // about 10 minutes
  for (const skill of [.01, .025]) {  // chance per half second of a player kill: about one kill every 50 s (casual) or 20 s (good)
    const {p, errs} = await page('z');
    await play(p);
    const r = await p.evaluate(skill => {
      const {api, G, Z, KIND} = __z, def = Z.def, log = [];
      const PRIO = ['gdome', 'idome', 'sam', 'gepard', 'rack', 'flak', 'ew', 'mark', 'air', 'warhead', 'freeze', 'radar', 'aid', 'relaunch', 'battery', 'optics'];
      function shop() {
        for (const s of api.SITES) { const need = s.max - s.hp; if (s.hp > 0 && need > 0) { const k = Z.repairK(), hp = Math.min(need, Math.floor(G.cash * .5 / (2.2 * k))); G.cash -= Math.ceil(hp * 2.2 * k); s.hp += hp; } }
        for (let pass = 0; pass < 6; pass++) {
          const cards = G.cards.map((c, i) => ({...c, i})).filter(c => PRIO.includes(c.k) && G.wave + 1 >= __z.ITEMS[c.k].from && !(__z.ITEMS[c.k].type === 'perk' && Z.perkMaxed(c.k))).sort((a, b) => PRIO.indexOf(a.k) - PRIO.indexOf(b.k));
          for (const c of cards) { const it = __z.ITEMS[c.k], price = it.type === 'perk' ? Z.perkPrice(c.k) : it.price; if (G.cash < price) continue;
            if ((c.k === 'idome' && G.wave < 22) || (c.k === 'gdome' && G.wave < 27)) continue;
            if (it.type === 'helper' && !def.SLOTS.some((_, j) => def.slotFree(j))) { const w = def.D.filter(d => d.type === 'flak' || d.type === 'ew').sort((a, b) => a.kills - b.kills)[0]; if (!w || PRIO.indexOf(c.k) > PRIO.indexOf('gepard')) continue; Z.base.sell(w.id); Z.base.sell(w.id); }  // make room for better helpers
            Z.base.buy(c.i); if (G.placing) { const j = def.SLOTS.findIndex((_, j) => def.slotFree(j)); if (j < 0) { G.placing = null; continue; } Z.base.place(j); } }
          for (const d of def.D) { Z.base.upgrade(d.id, d.type === 'rack' ? 'tier' : 'lvl'); if (d.type === 'rack') Z.base.upgrade(d.id, 'cap'); }
          if (pass >= 2) break;
        }
      }
      while (G.state !== 'over' && G.wave < 45) {
        shop(); __z.cont(); let n = 0;
        while (G.state === 'wave' && n++ < 2400) { __z.sim(.5); if (Math.random() < skill) { const t = Z.urgent(); if (t && KIND[t.k].armor !== 'hard' && api.player.dead <= 0) __z.botKill(.8); } if (Math.random() < .02) ['freeze', 'mark', 'air'].forEach(k => Z.pk.use(k)); }
        if (G.state === 'clear') __z.sim(4);
        log.push([G.wave, Math.round(100 * __z.integrity().hp / __z.integrity().max), G.cash, def.D.length]);
      }
      return {log, wave: G.wave, kills: G.kills, earned: G.earned, defs: def.D.map(d => d.type + (d.type === 'rack' ? 'T' + (d.tier + 1) : 'L' + (d.lvl + 1))).join(' '), perks: JSON.stringify(G.perks)};
    }, skill);
    console.log(`  skill ${skill}: reached wave ${r.wave}, kills you ${r.kills.p} / helpers ${r.kills.h}, earned $${r.earned}\n   per wave [wave, integrity %, cash, defences]: ${r.log.map(x => x.join('/')).join(' ')}\n   defences: ${r.defs}\n   perks: ${r.perks}`);
    ok(!errs.length, `Balance skill ${skill}: no errors` + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
    await p.close();
  }
}

// ---------- helper rack tiers: kill rate per tier and enemy kind (balance check) ----------
if (argv.includes('--tiers')) {
  const {p, errs} = await page('z');
  await play(p);
  const N = +(argv[argv.indexOf('--tiers') + 1]) || 120, kinds = ['shahed', 'jet', 'decoy', 'swarm', 'heavy', 'cruise'];
  const rows = [];
  for (let tier = 0; tier < 5; tier++) {
    const r = await p.evaluate((tier, kinds, N) => kinds.map(k => __z.trials(tier, k, N)), tier, kinds, N);
    rows.push(r);
    console.log(`  Mk ${['I', 'II', 'III', 'IV', 'V'][tier].padEnd(3)} ` + r.map((x, i) => `${kinds[i]} ${Math.round(100 * x.kill / N)}%`.padEnd(13)).join('') + ` | core (shahed+jet) ${Math.round(50 * (r[0].kill + r[1].kill) / N)}%`);
  }
  const core = rows.map(r => r[0].kill / N), want = [.30, .50, .65, .80, .90];  // the tier numbers are for a standard Shahed; other kinds scale by RESIST
  ok(core.every((c, i) => Math.abs(c - want[i]) < Math.max(.06, 3 * Math.sqrt(want[i] * (1 - want[i]) / N))), 'Tiers: Shahed kill rate matches 30/50/65/80/90% within 3 sigma of sampling noise');
  ok(core.every((c, i) => !i || c > core[i - 1]), 'Tiers: each Mk better than the last');
  ok(!errs.length, 'Tiers: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
