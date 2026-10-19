// Interceptor harness: headless Edge runs Classic (must behave as before, no errors) and Zombies (waves, money, integrity, base screen,
// game over) by stepping the sim directly through window.__z. Run: node tools/zombies-test.mjs [--shots DIR]
import {serve, launch, open, sleep} from './zlib.mjs';
const argv = process.argv.slice(2), SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const {server, origin} = await serve();
const browser = await launch();
let fails = 0;
const ONLY = argv.includes('--only');  // with --balance or --tiers: run just those sections
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };

async function page(mode) {
  const errs = [];
  const p = await open(browser, origin + '/games/interceptor/', errs);
  await p.evaluate(m => { localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: m, wx: 'clear'})); }, mode);
  await p.reload({waitUntil: 'load'});
  await p.waitForFunction(() => window.__z, {timeout: 60000});
  await sleep(500);
  return {p, errs};
}

// ---------- Classic ----------
if (!ONLY) {
  const {p, errs} = await page('classic');
  ok(await p.$eval('#play', b => b.textContent) === 'Defend', 'Classic: start button reads Defend');
  await p.click('#play'); await sleep(1500);
  const r = await p.evaluate(() => { const {api} = __z; __z.sim(60); return {th: api.TH.length, wave: api.wave, kinds: api.TH.map(t => t.k || (t.jet ? 'jet' : 'shahed')), zhud: document.getElementById('zhud').hidden, score: getComputedStyle(document.getElementById('score')).display}; });
  ok(r.wave === 1 && r.th >= 1, `Classic: wave 1 running with ${r.th} track(s) [${r.kinds}]`);
  ok(r.kinds.every(k => k === 'shahed' || k === 'jet') && !r.kinds.some(k => k === undefined), 'Classic: only Shahed / Geran tracks, no Zombies kinds');
  ok(r.zhud && r.score !== 'none', 'Classic: Classic HUD shown, Zombies HUD hidden');
  await sleep(1500);
  if (SHOTS) await p.screenshot({path: SHOTS + '/classic.png'});
  ok(!errs.length, 'Classic: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- Zombies ----------
if (!ONLY) {
  const {p, errs} = await page('z');
  ok(await p.$eval('#play', b => b.textContent) === 'Hold the line', 'Zombies: mode choice switches the start button');
  ok(await p.evaluate(() => !document.getElementById('zdiff').hidden && document.querySelectorAll('#zdiff button').length === 4 && document.querySelector('#zdiff button.on')?.textContent === 'Normal'), 'Zombies menu: difficulty selector Easy / Normal / Hard / Nightmare, Normal by default');
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-menu.png'});
  await p.click('#play'); await sleep(800);
  const s0 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, cash: __z.G.cash, st: __z.G.state, integ: __z.integrity()}));
  ok(s0.base && s0.st === 'base' && s0.cash === 1500, `Zombies: opens on the base screen with $${s0.cash}, integrity ${s0.integ.hp}/${s0.integ.max}`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-1.png'});
  await p.click('#zgo'); await sleep(300);
  // wave 1 with a scripted player that runs down every track
  const w1 = await p.evaluate(() => { const out = []; for (let i = 0; i < 400 && __z.G.state === 'wave'; i++) { __z.sim(.5); const pl = __z.api.player; if (pl.dead <= 0 && Math.random() < .5) { const k = __z.botKill(.8); if (k) out.push(k); } } return {out, st: __z.G.state, cash: __z.G.cash, kills: __z.G.kills, streak: __z.G.streak}; });
  ok(w1.kills.p >= 2 && w1.cash > 1500, `Zombies wave 1: scripted player killed ${w1.kills.p} (${w1.out}), cash $${w1.cash}, streak ${w1.streak}`);
  await p.evaluate(() => __z.sim(4));
  const b1 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, st: __z.G.state, wave: __z.G.wave}));
  ok(b1.base && b1.st === 'base' && b1.wave === 1, 'Zombies: wave 1 clear opens the base screen (no timer)');
  // shop: the whole catalogue is listed; buy a drone rack, place it, upgrade it in the Armory, buy a perk
  await p.evaluate(() => { __z.G.cash = 6000; __z.Z.def && document.querySelector('[data-tab="shop"]').click(); });
  const cat = await p.evaluate(() => ({n: __z.G.cards.length, all: Object.keys(__z.ITEMS).length, groups: [...document.querySelectorAll('.ztab h3')].map(h => h.textContent).join('/'), reroll: !!document.getElementById('zreroll')}));
  ok(cat.n === cat.all && cat.groups === 'Helpers/Active perks/Passive perks' && !cat.reroll, `Shop lists every item (${cat.n}) in groups ${cat.groups}, no reroll`);
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
  await p.click('[data-tab="shop"]'); await sleep(200);
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
  ok(!errs.length, 'Zombies: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- roster: every kind flies in and hits, unlocks by wave, boss stages and swarm launches, bunker, direct hit on a fast track ----------
if (!ONLY) {
  const {p, errs} = await page('z');
  await p.click('#play'); await sleep(500);
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
    // evasion: the same jet's heading wanders on Nightmare and not on Normal, with the interceptor close by
    const wander = zd => { api.S.zdiff = zd; for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; api.launch(); __z.sim(.05); const t = __z.make('jet', 0, -1500); t.wps.length = 0; t.aim.set(0, 0, 6000);
      const me = api.player, h0 = Math.atan2(t.v.x, t.v.z); let dev = 0; for (let i = 0; i < 360; i++) { me.p.copy(t.p).add(new api.THREE.Vector3(0, 0, -200)); me.v.set(0, 0, 0); api.step(1 / 120); dev = Math.max(dev, Math.abs(Math.atan2(t.v.x, t.v.z) - h0)); } return +(dev * 57.3).toFixed(1); };
    const ev = {normal: wander(1), nightmare: wander(3)}; api.S.zdiff = 1;
    return {out, unl, st0, st1, sw, bossPaid, dh, bk, det, ev};
  });
  for (const [k, v] of Object.entries(r.out)) ok(v.impacted && (k === 'decoy' ? v.dmg === 0 : v.dmg > 0), `Roster ${k}: from ${v.startKm} km at ${v.alt0} m, impact after ${v.sec} s, damage ${v.dmg}`);
  console.log('  kinds per wave:', JSON.stringify(r.unl));
  ok(!r.unl[1].includes('decoy') && r.unl[5].includes('decoy') && r.unl[10].includes('boss') && r.unl[15].includes('heavy') && r.unl[25].includes('ballistic') && r.unl[40].includes('icbm'), 'Roster: new kinds unlock every 5 waves, boss on wave 10');
  ok(r.st0 >= 3 && r.st1 === r.st0 - 1 && r.sw > 0 && r.bossPaid, `Boss: ${r.st0} stages, one hit removes one, launched ${r.sw} swarm drones in 30 s, destroyed and paid`);
  ok(r.dh, 'Direct hit: interceptor sitting on a ballistic track\'s line kills it');
  ok(r.bk === 4, 'Command bunker joins as a fourth site');
  ok(/^HIT/.test(r.det[0]) && /^(MISSED BY|DAMAGED)/.test(r.det[1]), `Manual detonation readout: 1 m -> "${r.det[0]}", 12 m -> "${r.det[1]}"`);
  ok(r.ev.nightmare > r.ev.normal + 5, `Evasion: jet heading wanders ${r.ev.normal}° on Normal, ${r.ev.nightmare}° on Nightmare`);
  ok(!errs.length, 'Roster: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- helpers and perks: every helper engages its kinds; Mark, Freeze, Airstrike and the passives do what the cards say ----------
if (!ONLY) {
  const {p, errs} = await page('z');
  await p.click('#play'); await sleep(500);
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
  // Rocket Assist: a 15 s burn from lift-off; full-throttle cruise top speed with and without it, and it switches off by itself
  await p.keyboard.down('KeyW');
  const rk = await p.evaluate(() => {
    const {api, G, Z} = __z, V = api.THREE.Vector3, me = () => api.player;
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.state = 'wave';
    function fly(withRocket) { G.perks.rocket = withRocket ? 1 : 0; api.launch(); __z.sim(.05); const d = me(); d.p.set(0, api.gh(0, 800) + 1500, 800); d.q.setFromAxisAngle(new V(1, 0, 0), -85 * Math.PI / 180); d.w.set(0, 0, 0); d.v.set(0, 0, -80);
      let top = 0, t = 0; const burn = []; for (let i = 0; i < 16 * 120; i++) { api.step(1 / 120); t += 1 / 120; top = Math.max(top, d.v.length()); if (i % 120 === 0) burn.push(+(Z.rk.st.t).toFixed(1)); if (d.dead > 0) break; }
      return {top: Math.round(top * 3.6), boostAfter: d.boost || 0, alive: d.dead <= 0, burn: burn.slice(0, 3).concat(burn.slice(-2))}; }
    return {base: fly(false), rocket: fly(true)};
  });
  await p.keyboard.up('KeyW');
  console.log('  rocket assist:', JSON.stringify(rk));
  ok(rk.rocket.top > rk.base.top * 1.5 && rk.rocket.top < 1100 && !rk.rocket.boostAfter && rk.rocket.alive, `Rocket Assist: top speed ${rk.base.top} -> ${rk.rocket.top} km/h, burn ends by itself, still flying`);
  ok(!errs.length, 'Helpers/perks: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- balance: a scripted player who shops sensibly and runs down a share of the tracks; how far does it get? ----------
if (argv.includes('--balance')) {  // about 10 minutes
  for (const skill of [.01, .025]) {  // chance per half second of a player kill: about one kill every 50 s (casual) or 20 s (good)
    const {p, errs} = await page('z');
    await p.click('#play'); await sleep(400);
    const r = await p.evaluate(skill => {
      const {api, G, Z, KIND} = __z, def = Z.def, log = [];
      const PRIO = ['gdome', 'idome', 'sam', 'gepard', 'rack', 'flak', 'ew', 'mark', 'air', 'warhead', 'freeze', 'radar', 'aid', 'relaunch', 'battery', 'optics'];
      function shop() {
        for (const s of api.SITES) { const need = s.max - s.hp; if (s.hp > 0 && need > 0) { const k = Z.repairK(), hp = Math.min(need, Math.floor(G.cash * .5 / (2.2 * k))); G.cash -= Math.ceil(hp * 2.2 * k); s.hp += hp; } }
        for (let pass = 0; pass < 6; pass++) {
          const cards = G.cards.map((c, i) => ({...c, i})).filter(c => G.wave + 1 >= __z.ITEMS[c.k].from && !(__z.ITEMS[c.k].type === 'perk' && Z.perkMaxed(c.k))).sort((a, b) => PRIO.indexOf(a.k) - PRIO.indexOf(b.k));
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
  await p.click('#play'); await sleep(500);
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
