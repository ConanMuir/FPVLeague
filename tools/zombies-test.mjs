// Interceptor harness: headless Edge runs Classic (must behave as before, no errors) and Zombies (waves, money, integrity, base screen,
// game over) by stepping the sim directly through window.__z. Run: node tools/zombies-test.mjs [--shots DIR]
//   --sections=classic,saves,zombies,roster,helpers,weather,meta,campaign,swarm,arsenal   run only those sections (CI shards them across jobs); default all
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

async function page(mode) {
  const errs = [];
  const p = await open(browser, origin + '/games/interceptor/', errs);
  await p.evaluate(m => { localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: m, wx: 'clear'})); }, mode);
  await p.reload({waitUntil: 'load'});
  await p.waitForFunction(() => window.__z, {timeout: 60000});
  await frames(p, 5); await drawFrames(p);  // real frames of the menu scene (CI skips draw calls elsewhere: DL_NORENDER)
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
  const cat = await p.evaluate(() => ({n: __z.G.cards.length, all: Object.keys(__z.ITEMS).filter(k => !__z.ITEMS[k].kit).length, kit: __z.G.cards.filter(c => __z.ITEMS[c.k].kit).length, groups: [...document.querySelectorAll('.ztab h3')].map(h => h.textContent).join('/'), reroll: !!document.getElementById('zreroll')}));
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
    kit: G.cards.filter(c => __z.ITEMS[c.k].kit).map(c => c.k).join(), slots: def.SLOTS.length}; });
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
    const arr = zd => { api.S.zdiff = zd; let dec = 0, sh = 0, spread = 0; for (let i = 0; i < 6; i++) { const P = __z.plan(12); dec += P.list.filter(k => k === 'decoy').length; sh += P.list.filter(k => k === 'shahed').length;
      const eta = P.q.filter(q => !q.k.startsWith('boss')).map(q => { const K = __z.KIND[q.k.split(':')[0]]; return q.at + (K.far || 5200) / K.spd; }).sort((a, b) => a - b); spread += eta[Math.floor(eta.length * .9)] - eta[Math.floor(eta.length * .1)]; }
      return {dec: +(dec / 6).toFixed(1), sh: +(sh / 6).toFixed(1), spread: Math.round(spread / 6)}; };
    out.plan = {Normal: arr(1), Hard: arr(2), Nightmare: arr(3)}; api.S.zdiff = 1; return out; });
  console.log('  difficulty roster and raids:', JSON.stringify(d));
  ok(d.Easy.hyper > d.Normal.hyper && d.Normal.hyper > d.Hard.hyper && d.Hard.hyper > d.Nightmare.hyper && d.Hard.gdome < d.Hard.hyper && d.Nightmare.gdome < d.Nightmare.hyper, `Difficulty: hypersonics arrive at wave ${['Easy', 'Normal', 'Hard', 'Nightmare'].map(n => d[n].hyper).join(' / ')}, Golden Dome before them`);
  ok(d.plan.Hard.dec > d.plan.Normal.dec && d.plan.Nightmare.spread < d.plan.Normal.spread * .6, `Raids: decoys per wave-12 raid ${d.plan.Normal.dec} / ${d.plan.Hard.dec} / ${d.plan.Nightmare.dec}; arrival spread (10-90%) ${d.plan.Normal.spread} / ${d.plan.Hard.spread} / ${d.plan.Nightmare.spread} s`);
  ok(!errs.length, 'Meta and sinks: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.evaluate(() => localStorage.removeItem('dl-interceptor'));
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
  const b0 = await p.evaluate(() => ({bar: document.querySelector('#zbase .zcpbar')?.textContent || '', hud: (__z.Z.hud(0), document.getElementById('zw').textContent), wx: Array.from({length: 200}, (_, i) => __z.Z.wx.plan(2 + i % 8)?.id).filter(id => ['clear', 'scattered', 'golden'].includes(id)).length / 200}));
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
    const t = Z.lk.t; __sw.fly(1.2, 80, () => api.player.p.clone().add(new api.THREE.Vector3(1000, 0, 0))); out.lost = !Z.lk.t && !!t;
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
    __sw.fly(18); const down = L.filter(t => !api.live(t)).length, back = Z.sw.drones.every(d => d.st === 'form' || d.st === 'ret');
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
    const pass = w => { __ar.clear(); __ar.load(w); const m = __ar.pilot(0); m.v.set(0, 0, 0); const b = __ar.put('ballistic', 2.3, 0, -120, 900); b.v.set(0, 0, 900); b.aim = new api.THREE.Vector3(b.p.x, b.p.y, b.p.z + 30000);
      for (let i = 0; i < 40 && api.live(b); i++) { m.p.set(0, m.p.y, 2600); m.v.set(0, 0, 0); api.step(1 / 120); } return !api.live(b); };
    out.fastDart = pass('dart'); out.fastStd = pass('std'); return out; });
  ok(dt.miss.alive && dt.miss.track, 'Dart: firing with nothing in contact does nothing; the drone flies on (no drone lost)');
  ok(dt.heavy && /DART/.test(dt.htxt), `Dart: rams an armored heavy and kills it ("${dt.htxt}")`);
  ok(dt.fastDart && !dt.fastStd, `Dart: a ballistic missile passing 2.3 m off the nose dies to the dart (${dt.fastDart}), the warhead's direct-hit window misses it (${!dt.fastStd})`);

  // ---- cluster: bomblets home on a spread-out pack; nothing against armor ----
  const cu = await p.evaluate(() => { const {api, G, Z} = __z, out = {};
    __ar.clear(); __ar.load('cluster'); __ar.pilot(); const L = []; for (let i = 0; i < 6; i++) L.push(__ar.put('shahed', (i - 2.5) * 60, (i % 2) * 30, -140 - i * 25, 20));
    const k0 = G.kills.p; Z.detonate(); out.txt = G.det.txt; __ar.rig(() => __z.sim(8)); out.down = L.filter(t => !api.live(t)).length; out.kp = G.kills.p - k0;
    __ar.clear(); __ar.pilot(); const H = []; for (let i = 0; i < 4; i++) H.push(__ar.put('heavy', (i - 1.5) * 50, 0, -150, 20)); Z.detonate(); __z.sim(8); out.heavy = H.filter(t => !api.live(t)).length; out.htxt = G.det.txt; return out; });
  ok(cu.down >= 4 && cu.kp >= 4, `Cluster: one detonation 140-265 m from a spread pack, the bomblets reach and bring down ${cu.down} of 6 ("${cu.txt}", dice loaded)`);
  ok(cu.heavy === 0, `Cluster weakness: 4 armored heavies, ${cu.heavy} down ("${cu.htxt}")`);

  // ---- flare / chaff pod: chaff decoys a passing cruise missile, not a Shahed; the pod drains the pack; flares beat a sortie's AA ----
  const fp = await p.evaluate(() => { const {api, G, Z} = __z, A = Z.ars, out = {};
    __ar.clear(); __ar.load('flare'); __ar.pilot(); const P = A.P(A.me()); out.ch0 = P.ch;
    const s = __ar.put('shahed', 200, 0, -100); const c = __ar.put('cruise', 300, -50, -200, 210); __ar.rig(() => __z.sim(.3)); out.ch1 = P.ch; out.cruise = !!c.spoof; out.shahed = !s.spoof;
    const draw = w => { __ar.clear(); __ar.load(w); const m = __ar.pilot(0); const m0 = m.mah; for (let i = 0; i < 600; i++) { m.p.set(0, m.p.y, 2600); m.v.set(0, 0, 0); api.step(1 / 60); } return m.mah - m0; };
    out.podDraw = +(draw('flare') - draw('std')).toFixed(1);
    let hits = 0; Z.so = {W: {onHit() { hits++; }}}; __ar.load('flare'); A.onBase(); G.state = 'wave'; __z.sim(.1); const sch0 = P.sch;
    __ar.rig(() => Z.so.W.onHit(A.me(), 34, 'aa')); out.saved = hits === 0 && P.sch === sch0 - 1; P.sch = 0; Z.so.W.onHit(A.me(), 34, 'aa'); out.noFlares = hits === 1; delete Z.so; return out; });
  ok(fp.ch0 === 4 && fp.ch1 === 3 && fp.cruise && fp.shahed, `Pod: a cruise missile passing 360 m away draws a chaff burst (4 -> ${fp.ch1}) and is decoyed; a Shahed nearby is not (GPS)`);
  ok(fp.podDraw > 20 && fp.podDraw < 36, `Pod weakness: 10 s of hover costs ${fp.podDraw} mAh more than without the pod (10 A)`);
  ok(fp.saved && fp.noFlares, 'Pod on sorties (feature-detected hook on zsortie\'s W.onHit): a flare beats an AA burst; out of flares, the hit lands');

  // ---- laser: dwell-time kill in clear air; fog stretches it, a storm shuts it down ----
  const lz = await p.evaluate(() => { const {api, G, Z} = __z, def = Z.def, out = {};
    __ar.strip(); G.state = 'base'; const j = def.SLOTS.findIndex((s, j) => def.slotFree(j) && /substation north/i.test(s.n)), d = Z.base.act.place('laser', j); G.state = 'wave'; def.deploy(); const s = def.SLOTS[j];
    const trial = wx => { __ar.clear(); Z.wx.set(wx); __ar.pilot(); __ar.away(); const t = __z.make('shahed', s.x, s.z - 1200); t.p.y = api.gh(t.p.x, t.p.z) + 400; t.alt = 400; let on = -1, n = 0;
      while (api.live(t) && n < 12 * 60) { api.step(1 / 60); n++; if (on < 0 && d.lz) on = n; } return {t: on < 0 ? null : +((n - on) / 60).toFixed(2), alive: api.live(t), beam: on >= 0}; };
    out.clear = trial('clear'); out.fog = trial('fog'); out.storm = trial('storm'); Z.wx.set('clear'); out.kills = d.kills; return out; });
  ok(lz.clear.t > 1.9 && lz.clear.t < 2.8 && !lz.clear.alive, `Laser: burns a Shahed down in ${lz.clear.t} s of beam in clear air (2.2 s by the book, no dice)`);
  ok(lz.fog.t > lz.clear.t * 2.5, `Laser weakness: fog stretches the burn to ${lz.fog.t} s`);
  ok(!lz.storm.beam && lz.storm.alive, 'Laser weakness: in a heavy storm it never fires and the Shahed flies on');

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
  await p.evaluate(() => { const {G, Z} = __z; __ar.clear(); __ar.strip(); __z.jump(16, 40000); Z.base.open(); G.next = __z.plan(16); });
  await p.evaluate(BOT_SHOP + `(${JSON.stringify(botLevel('Legend'))})`);
  const bot = await p.evaluate(() => { const {G, Z} = __z, def = Z.def, c = def.D.find(d => d.type === 'carrier'), s = c && def.SLOTS[c.slot], b = Z.ars.bestPark();
    return {ars: def.D.filter(d => ['laser', 'mwave', 'barrage', 'smoke', 'carrier'].includes(d.type)).map(d => d.type).join(), parked: !!s && Math.hypot(s.x - b.x, s.z - b.z) < 5, w: Z.ars.cur(), own: [...Z.ars.P(Z.ars.me()).own].join()}; });
  ok(bot.ars.length > 0 && bot.parked, `Bots: a Legend's base screen builds [${bot.ars}] and parks its carrier on the main approach`);
  ok(bot.w !== 'std', `Bots: the Legend weighs the weapons against the next wave and loads the ${bot.w} (owns ${bot.own})`);
  if (SHOTS) { await p.evaluate(() => { __z.Z.base.setTab('armory'); }); await p.screenshot({path: SHOTS + '/ars-armory.png'}); }
  ok(!errs.length, 'Arsenal: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
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
