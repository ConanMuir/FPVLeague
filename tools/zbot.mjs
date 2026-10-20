// Zombies bot pilots: the scripted players behind tools/zombies-bench.mjs (the leaderboard's bot entries, games/interceptor/zbench.json) and
// tools/zombies-balance.mjs. Each level is a skill profile, named with Drone League's levels. Higher levels play smarter, not only sharper:
//   rate      chance per half second of running a track down (reaction, finding the next target)
//   miss      share of those runs where the burst is badly timed (a 7 m miss instead of 0.8 m)
//   dodgeK    how often an evading track shakes this pilot off, relative to the difficulty's base (flight quality)
//   fast      chance per half second of sitting on a ballistic / hypersonic / ICBM track's line for a direct hit (inside 15 km of impact; tried before any drone)
//   relaunch  chance per half second of getting the next interceptor off the mat after losing one
//   shop      'naive' cheapest helpers first, few upgrades, domes only once the missiles have come; 'basic' a sound order; 'smart' the best order
//   spend     share of the purse it's willing to spend on a base screen (the rest sits idle: new players hoard or hesitate)
//   up        chance per defence per base screen of buying its next upgrade
//   repairAt / repairShare   repair a site below this share of its hit points, spending at most this share of the purse
//   perks     'none' / 'random' (fires its active perks now and then) / 'smart' (Freeze the closest danger, Mark armor and the boss, Airstrike crowds, Lure packs)
//   domes     how many waves before the ballistic / hypersonic threats it buys Iron Dome / Golden Dome (-1: the wave after they first appear; -99: never)
//   sell, expand, refit, supply, rebuild   the late-game choices it knows how to use
//   chain     the kill chain against the fast missiles (games/interceptor/zchain.js): 0 none; 1 one point defence; 2 + a boost battery at the edge
//             most launches come from and space interceptors; 3 + batteries wherever launches are planned (moving them), point defence at every
//             site, early-warning radar, decoys; 4 every layer and every upgrade
//   warn      launch-alert actions (zwarn.js): rate = chance per half second of acting on the alerts; mode 'random' (any action, any time),
//             'harden' (hardens a site just before a hypersonic or ICBM lands), 'smart' (decoys the big ones early, hardens a site that can't
//             take what is coming), 'best' (also evacuates a site that would be lost anyway, and times the harden for several hits at once)
//   swarm     personal swarm (zswarm.js): 0 never buys it, 1 buys it and fires commands now and then, 2 flies it well (screen formation and
//             command, strikes on crowds, attacks what it locks)
//   lock      chance per half second of locking the most urgent track within 3.5 km of its interceptor (zlock.js), which its swarm then attacks
// The arsenal (pilot weapons, the five extra defences) is shopped and used by games/interceptor/zarsbot.js (ARSBOT, by level name): SHOP runs it
// (the weapon before the helpers, the defences after them) and the teleporting pilot asks it how to fire the loaded weapon. With the shared bot
// brain (zbotbrain.js) in the build, the same ARSBOT is registered as one of its hooks.
// The bots teleport behind their track, so they can't feel evasion; an attempt on a track that evades on this difficulty is shaken off with
// DODGE[evade mode] x dodgeK instead (a model, not a measurement).
export const DODGE = {none: 0, some: .3, all: .45};
export const LEVELS = [
  {n: 'Rookie', rate: .004, miss: .55, dodgeK: 1.4, relaunch: .06, shop: 'naive', spend: .4, up: .25, repairAt: .3, repairShare: .25, perks: 'none', domes: -99, perkBuy: ['battery', 'warhead'], swarm: 0, lock: 0, chain: 0},
  {n: 'Pro', rate: .008, miss: .35, dodgeK: 1.15, relaunch: .12, shop: 'basic', spend: .6, up: .4, repairAt: .45, repairShare: .35, perks: 'random', domes: -1, perkBuy: ['warhead', 'freeze', 'radar', 'swarm'], swarm: 1, lock: .04, chain: 1, warn: {rate: .015, mode: 'random'}},
  {n: 'All-Star', rate: .011, miss: .26, dodgeK: 1, relaunch: .15, fast: .005, shop: 'smart', spend: .85, up: .8, repairAt: .8, repairShare: .6, perks: 'random', domes: 2, sell: 1, swarm: 1, lock: .08, chain: 2, warn: {rate: .06, mode: 'harden'}},
  {n: 'Champion', rate: .016, miss: .15, dodgeK: .8, relaunch: .22, fast: .012, shop: 'smart', spend: 1, up: 1, repairAt: .75, repairShare: .5, perks: 'smart', domes: 3, sell: 1, expand: 1, rebuild: 1, swarm: 2, lock: .14, chain: 3, warn: {rate: .12, mode: 'smart'}},
  {n: 'Grand Champion', rate: .021, miss: .1, dodgeK: .7, relaunch: .32, fast: .028, shop: 'smart', spend: 1, up: 1, repairAt: .85, repairShare: .55, perks: 'smart', domes: 3, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1, swarm: 2, lock: .2, chain: 3, warn: {rate: .2, mode: 'smart'}},
  {n: 'Legend', rate: .03, miss: .04, dodgeK: .55, relaunch: .5, fast: .06, shop: 'smart', spend: 1, up: 1, repairAt: .9, repairShare: .6, perks: 'smart', domes: 4, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1, swarm: 2, lock: .3, chain: 4, warn: {rate: .25, mode: 'best'}}];
const key = s => String(s).toLowerCase().replace(/[\s-]+/g, '');
export const level = n => LEVELS.find(l => key(l.n) === key(n));

// in-page source: the base-screen shopper. (P) = a level.
export const SHOP = `(function(P){
  const {api, G, Z, KIND} = __z, def = Z.def, B = Z.base, IT = __z.ITEMS, kf = k => Z.kindFrom ? Z.kindFrom(k) : KIND[k].from, nw = G.wave + 1;
  const ORDERS = {naive: ['flak', 'rack', 'lrack', 'ew', 'gepard', 'sam', 'mpads', 'hflak', 'idome', 'gdome'],
    basic: ['gdome', 'idome', 'sam', 'gepard', 'rack', 'mpads', 'flak', 'ew', 'hflak', 'lrack', 'mark', 'air', 'lure', 'salvage', 'swarm'],
    smart: ['gdome', 'idome', 'sam', 'gepard', 'mpads', 'hflak', 'rack', 'lrack', 'flak', 'ew', 'mark', 'air', 'warhead', 'freeze', 'lure', 'salvage', 'radar', 'aid', 'relaunch', 'battery', 'optics', 'rocket', 'swarm', 'swarmk']};
  const PRIO = [...ORDERS[P.shop], ...(P.perkBuy || [])].filter(k => P.swarm || k !== 'swarm' && k !== 'swarmk'), top = PRIO.indexOf(P.shop === 'naive' ? 'gepard' : 'gepard');
  const from = k => Z.itemFrom ? Z.itemFrom(k) : IT[k].from, cost = k => IT[k].type === 'perk' ? Z.perkPrice(k) : (Z.itemPrice ? Z.itemPrice(k) : IT[k].price);
  const domeOK = k => k === 'idome' ? nw >= kf('ballistic') - P.domes : k === 'gdome' ? nw >= kf('hyper') - P.domes : true;
  for (let i = 0; i < api.SITES.length; i++) { const s = api.SITES[i]; if (s.hp > 0 && s.hp < s.max * P.repairAt) B.act.repair(i, Math.floor(G.cash * P.repairShare / 3)); }
  if (P.rebuild && B.act.rebuild) api.SITES.forEach((s, i) => { if (s.hp <= 0 && G.cash > 9000) B.act.rebuild(i); });
  const open = () => def.SLOTS.some((_, j) => def.slotFree(j)), keep = G.cash * (1 - (P.spend ?? 1)), afford = c => G.cash - c >= keep;
  const AB = Z.ars && Z.ars.bot, ars = part => { if (AB) for (const s of AB.shop(P, __z, {afford, keep, part})) s.run(); };
  ars('weapon'); ars('early');  /* the arsenal's pilot weapon (a one-off buy) and its big defences first (zarsbot.js) */
  // the kill chain (zchain.js), by level: what it buys and whether it places the boost batteries where next wave's launches come from
  const C = Z.chain, chain = () => { if (!C || !P.chain || nw < C.from) return; const K = G.kc, c = P.chain, fp = Z.fastPlan ? Z.fastPlan() : [], fast = nw >= kf('ballistic');
    const try_ = (a, x, cost) => afford(cost) && C.act(a, x);
    const weakSite = () => api.SITES.map((s, i) => ({s, i})).filter(o => o.s.hp > 0 && !K.pd[o.s.n]).sort((a, b) => a.s.hp / a.s.max - b.s.hp / b.s.max)[0];
    if (c === 1) { if (fast && !Object.keys(K.pd).length) { const w = weakSite(); if (w) try_('pb', w.i, 4500); } return; }
    const want = fp.map((s, i) => ({i, n: s.total})).sort((a, b) => b.n - a.n);
    if (c === 2) { if (fast && !K.boost.some(Boolean) && want[0].n) try_('bb', want[0].i, 6000); if (fast && Object.keys(K.pd).length < 2) { const w = weakSite(); if (w) try_('pb', w.i, 4500); }
      if (def.D.some(d => d.type === 'gdome') && K.stock < 2) try_('st', 2 - K.stock, 1600); return; }
    // 3+: a battery wherever launches are planned (move one sitting at a quiet edge first), point defence at every site, the radar, decoys, the stock
    for (const w of want) { if (!w.n || K.boost[w.i]) continue; const idle = K.boost.findIndex((b, j) => b && !fp[j].total); if (idle >= 0) try_('bm', idle + '>' + w.i, 1200); else if (c >= 4 || K.boost.filter(Boolean).length < 2) try_('bb', w.i, 6000); }
    if (fast) for (const o of api.SITES.map((s, i) => ({s, i})).filter(o => o.s.hp > 0 && !K.pd[o.s.n]).sort((a, b) => a.s.hp - b.s.hp)) try_('pb', o.i, 4500);
    if (fast && K.ewr < (c >= 4 ? 2 : 1)) try_('ew', 0, 3600);
    if (fast && K.decoys < (c >= 4 ? 4 : 2)) try_('dc', 1, 500);
    if (def.D.some(d => d.type === 'gdome')) while (K.stock < C.stockCap() && try_('st', 1, 800)) {}
    if (c >= 4) { K.boost.forEach((b, i) => { if (b && !b.lvl) try_('bu', i, 4500); }); api.SITES.forEach((s, i) => { if (K.pd[s.n] && !K.pd[s.n].lvl) try_('pu', i, 4000); }); } };
  if (P.chain >= 2) chain();  /* from All-Star up the chain comes before more helpers: it needs no free position */
  for (let pass = 0; pass < 3; pass++) {
    const cards = G.cards.map((c, i) => ({...c, i})).filter(c => PRIO.includes(c.k) && nw >= from(c.k) && IT[c.k].type !== 'supply' && !(IT[c.k].type === 'perk' && Z.perkMaxed(c.k))).sort((a, b) => PRIO.indexOf(a.k) - PRIO.indexOf(b.k));
    for (const c of cards) { const it = IT[c.k], price = cost(c.k); if (!afford(price) || !domeOK(c.k)) continue;
      if (it.kit && it.type === 'helper' && def.D.filter(d => d.type === c.k).length >= 2) continue;  /* kit helpers as a supplement: two of each at most */
      if (it.type === 'helper' && !open()) {
        if (P.expand && def.canOpen && PRIO.indexOf(c.k) <= top) { const j = def.SLOTS.findIndex((_, j) => def.canOpen(j, Z.meta.doc())); if (j >= 0 && G.cash > price + __z.expCost(G.exp | 0, Z.meta.k('expK'))) B.act.expand(j); }
        if (!open()) { if (!P.sell) continue; const w = def.D.filter(d => d.type === 'flak' || d.type === 'ew' || d.type === 'lrack').sort((a, b) => a.kills - b.kills)[0]; if (!w || PRIO.indexOf(c.k) > top) continue; B.act.sell(w.id); } }
      if (it.type === 'helper') { const j = def.SLOTS.findIndex((_, j) => def.slotFree(j)); if (j >= 0) B.act.place(c.k, j); }
      else B.buy(c.i); }
    for (const d of def.D) if (Math.random() < P.up && G.cash > keep + 600) { const rk = def.isRack ? def.isRack(d) : d.type === 'rack'; B.act.upgrade(d.id, rk ? 'tier' : 'lvl'); if (d.type === 'rack') B.act.upgrade(d.id, 'cap'); }
  }
  if (P.refit && B.act.refit) for (const d of def.D) { const R = __z.REFIT[d.type]; if (!R || d.refit) continue;
    const want = {rack: nw >= kf('swarm') ? 'swarm' : 'range', flak: 'prox', gepard: nw >= kf('heavy') ? 'ap' : 'radar', sam: 'reload', ew: 'wide', idome: 'bal'}[d.type], r = R.find(x => x.id === want);
    if (r && G.cash > r.cost * 2.5) B.act.refit(d.id, want); }
  if (P.supply && nw >= 12) for (const k of ['reload', 'harden', 'drones', 'overtime']) if (B.act.supply && !G.sup?.[k] && nw >= from(k) && G.cash > cost(k) * 4) B.act.supply(k);
  if (P.chain === 1) chain();
  ars('def');  /* the rest of the arsenal's defences and carrier parking (zarsbot.js) */
})`;

// in-page source: one wave of play. (P, dodge) = a level and the difficulty's base dodge chance. Returns the state at the end.
export const WAVE = `(function(P, dodge){
  const {api, G, Z, KIND} = __z, AB = Z.ars && Z.ars.bot; let n = 0;
  const evades = t => { if (Z.evades) return Z.evades(t); const m = Z.evadeMode(); return m !== 'none' && KIND[t.k].armor !== 'hard' && (m === 'all' || ['jet', 'heavy', 'cruise', 'swarm', 'boss'].includes(t.k)); }, live = () => api.TH.filter(api.live), tti = t => Math.hypot(t.aim.x - t.p.x, t.aim.z - t.p.z) / Math.max(1, t.spd);
  while (G.state === 'wave' && n++ < 2400) { __z.sim(.5); const me = api.player, alive = me && me.dead <= 0;
    if (P.fast && alive && Math.random() < P.fast * (AB ? AB.fastK(__z) : 1)) { const h = api.TH.filter(t => api.live(t) && KIND[t.k].armor === 'hard' && t.p.distanceTo(t.aim) < 15000).sort((a, b) => a.p.distanceTo(a.aim) - b.p.distanceTo(b.aim))[0];
      if (h) { me.p.copy(h.p).addScaledVector(h.v.clone().normalize(), -.5); me.v.set(0, 0, 0); Z.detonate(); continue; } }
    if (Math.random() < P.rate) { const t = Z.urgent(); if (t && KIND[t.k].armor !== 'hard' && alive) { const bad = Math.random() < P.miss || evades(t) && Math.random() < Math.min(.9, dodge * P.dodgeK), r = AB ? AB.run(P, __z, t, bad) : null;
      if (r) { me.p.copy(r.at || r.t.p).addScaledVector(r.t.v.clone().normalize(), -r.off); me.v.copy(r.t.v); Z.detonate(); } else __z.botKill(bad ? 7 : .8); } }  /* r: how to fire the loaded arsenal weapon (zarsbot.js) */
    if (me && me.dead > 0 && Math.random() < P.relaunch) api.launch();
    if (P.perks === 'random' && Math.random() < .02) ['freeze', 'mark', 'air', 'lure'].forEach(k => Z.pk.use(k));
    if (P.perks === 'smart') { const L = live();
      if (G.ch.freeze > 0 && L.some(t => KIND[t.k].dmg >= 40 && tti(t) < 15)) Z.pk.use('freeze');
      if (G.ch.mark > 0) { const m = L.find(t => (KIND[t.k].armor === 1 || t.k === 'boss') && !t.mark); if (m) { api.pickT = m; Z.pk.use('mark'); api.pickT = null; } }
      if (G.ch.air > 0 && L.length >= 10) Z.pk.use('air');
      if (G.ch.lure > 0 && alive && L.filter(t => t.p.distanceTo(me.p) < 1500 && KIND[t.k].armor !== 'hard').length >= 3) Z.pk.use('lure'); }
    // launch alerts (zwarn.js): harden / evacuate / decoy, as well as this level knows how
    const Wn = Z.warn, M = P.warn && P.warn.mode; if (Wn && M && Math.random() < P.warn.rate) { const A = Wn.alerts(), ok = (a, t) => !Wn.why(a, t), dmg = t => KIND[t.k].dmg * (G.sup && G.sup.harden ? .75 : 1), tt = t => t.p.distanceTo(t.aim) / Math.max(1, t.spd);
      if (A.length) {
        if (M === 'random') { const t = A[Math.random() * A.length | 0], a = ['harden', 'evac', 'decoy'][Math.random() * 3 | 0]; if (ok(a, t)) Wn.act(a, t.id); }
        else if (M === 'harden') { const t = A.find(t => t.k !== 'ballistic' && tt(t) < 10 && ok('harden', t)); if (t) Wn.act('harden', t.id); }
        else {
          // incoming fast damage per site in the next 15 s, and whether the site can take it
          const by = new Map(); for (const t of A) if (tt(t) < 15 && !t.dcy) by.set(t.tgt, (by.get(t.tgt) || 0) + dmg(t));
          const d = A.filter(t => t.k !== 'ballistic' || M === 'best').find(t => tt(t) > 6 && ok('decoy', t) && (t.k !== 'ballistic' || G.kc.decoys > 2)); if (d) Wn.act('decoy', d.id);
          for (const [s, x] of [...by].sort((a, b) => b[1] - a[1])) { const t = A.find(u => u.tgt === s && tt(u) < 15); if (!t) continue;
            if ((x >= s.hp * .8 || M === 'best' && x >= 300) && ok('harden', t)) { Wn.act('harden', t.id); break; }
            if (M === 'best' && x >= s.hp && ok('evac', t)) { Wn.act('evac', t.id); break; } } } } }
    // lock-on and the personal swarm (zlock.js, zswarm.js): a lock on the most urgent track in reach, which the swarm then attacks
    const sw = Z.sw?.mine;
    if (P.lock && alive && Z.lk && !Z.lk.t && Math.random() < P.lock) { const t = Z.urgent(); if (t && KIND[t.k].armor !== 'hard' && t.p.distanceTo(me.p) < 3500) Z.lk.force(t); }
    if (P.swarm && sw && sw.d.length && alive) { const L = live().filter(t => t.p.distanceTo(me.p) < 4500 && KIND[t.k].armor !== 'hard');
      if (P.swarm >= 2) { if (sw.form !== 3) Z.sw.command('form#', 3); if (sw.mode === 'escort') Z.sw.command('screen');
        if (Z.lk?.t && sw.mode !== 'attack' && (KIND[Z.lk.t.k].armor === 1 || Z.lk.t.k === 'boss' || L.length < 6)) Z.sw.command('attack');
        if (sw.ch > 0 && L.length >= 6) Z.sw.command('strike'); }
      else if (Math.random() < .02) { if (Z.lk?.t) Z.sw.command('attack'); else Z.sw.command(['screen', 'strike', 'next'][Math.random() * 3 | 0]); } } }
  if (G.state === 'clear') __z.sim(4);
  return G.state;
})`;
