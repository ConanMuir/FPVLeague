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
// The bots teleport behind their track, so they can't feel evasion; an attempt on a track that evades on this difficulty is shaken off with
// DODGE[evade mode] x dodgeK instead (a model, not a measurement).
export const DODGE = {none: 0, some: .3, all: .45};
export const LEVELS = [
  {n: 'Rookie', rate: .004, miss: .55, dodgeK: 1.4, relaunch: .06, shop: 'naive', spend: .4, up: .25, repairAt: .3, repairShare: .25, perks: 'none', domes: -99, perkBuy: ['battery', 'warhead']},
  {n: 'Pro', rate: .008, miss: .35, dodgeK: 1.15, relaunch: .12, shop: 'basic', spend: .6, up: .4, repairAt: .45, repairShare: .35, perks: 'random', domes: -1, perkBuy: ['warhead', 'freeze', 'radar']},
  {n: 'All-Star', rate: .011, miss: .26, dodgeK: 1, relaunch: .15, fast: .005, shop: 'smart', spend: .85, up: .8, repairAt: .8, repairShare: .6, perks: 'random', domes: 2, sell: 1},
  {n: 'Champion', rate: .016, miss: .15, dodgeK: .8, relaunch: .22, fast: .012, shop: 'smart', spend: 1, up: 1, repairAt: .75, repairShare: .5, perks: 'smart', domes: 3, sell: 1, expand: 1, rebuild: 1},
  {n: 'Grand Champion', rate: .021, miss: .1, dodgeK: .7, relaunch: .32, fast: .028, shop: 'smart', spend: 1, up: 1, repairAt: .85, repairShare: .55, perks: 'smart', domes: 3, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1},
  {n: 'Legend', rate: .03, miss: .04, dodgeK: .55, relaunch: .5, fast: .06, shop: 'smart', spend: 1, up: 1, repairAt: .9, repairShare: .6, perks: 'smart', domes: 4, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1}];
const key = s => String(s).toLowerCase().replace(/[\s-]+/g, '');
export const level = n => LEVELS.find(l => key(l.n) === key(n));

// in-page source: the base-screen shopper. (P) = a level.
export const SHOP = `(function(P){
  const {api, G, Z, KIND} = __z, def = Z.def, B = Z.base, IT = __z.ITEMS, kf = k => Z.kindFrom ? Z.kindFrom(k) : KIND[k].from, nw = G.wave + 1;
  const ORDERS = {naive: ['flak', 'rack', 'lrack', 'ew', 'gepard', 'sam', 'mpads', 'hflak', 'idome', 'gdome'],
    basic: ['gdome', 'idome', 'sam', 'gepard', 'rack', 'mpads', 'flak', 'ew', 'hflak', 'lrack', 'mark', 'air', 'lure', 'salvage'],
    smart: ['gdome', 'idome', 'sam', 'gepard', 'mpads', 'hflak', 'rack', 'lrack', 'flak', 'ew', 'mark', 'air', 'warhead', 'freeze', 'lure', 'salvage', 'radar', 'aid', 'relaunch', 'battery', 'optics', 'rocket']};
  const PRIO = [...ORDERS[P.shop], ...(P.perkBuy || [])], top = PRIO.indexOf(P.shop === 'naive' ? 'gepard' : 'gepard');
  const from = k => Z.itemFrom ? Z.itemFrom(k) : IT[k].from, cost = k => IT[k].type === 'perk' ? Z.perkPrice(k) : (Z.itemPrice ? Z.itemPrice(k) : IT[k].price);
  const domeOK = k => k === 'idome' ? nw >= kf('ballistic') - P.domes : k === 'gdome' ? nw >= kf('hyper') - P.domes : true;
  for (let i = 0; i < api.SITES.length; i++) { const s = api.SITES[i]; if (s.hp > 0 && s.hp < s.max * P.repairAt) B.act.repair(i, Math.floor(G.cash * P.repairShare / 3)); }
  if (P.rebuild && B.act.rebuild) api.SITES.forEach((s, i) => { if (s.hp <= 0 && G.cash > 9000) B.act.rebuild(i); });
  const open = () => def.SLOTS.some((_, j) => def.slotFree(j)), keep = G.cash * (1 - (P.spend ?? 1)), afford = c => G.cash - c >= keep;
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
})`;

// in-page source: one wave of play. (P, dodge) = a level and the difficulty's base dodge chance. Returns the state at the end.
export const WAVE = `(function(P, dodge){
  const {api, G, Z, KIND} = __z; let n = 0;
  const evades = t => { if (Z.evades) return Z.evades(t); const m = Z.evadeMode(); return m !== 'none' && KIND[t.k].armor !== 'hard' && (m === 'all' || ['jet', 'heavy', 'cruise', 'swarm', 'boss'].includes(t.k)); }, live = () => api.TH.filter(api.live), tti = t => Math.hypot(t.aim.x - t.p.x, t.aim.z - t.p.z) / Math.max(1, t.spd);
  while (G.state === 'wave' && n++ < 2400) { __z.sim(.5); const me = api.player, alive = me && me.dead <= 0;
    if (P.fast && alive && Math.random() < P.fast) { const h = api.TH.filter(t => api.live(t) && KIND[t.k].armor === 'hard' && t.p.distanceTo(t.aim) < 15000).sort((a, b) => a.p.distanceTo(a.aim) - b.p.distanceTo(b.aim))[0];
      if (h) { me.p.copy(h.p).addScaledVector(h.v.clone().normalize(), -.5); me.v.set(0, 0, 0); Z.detonate(); continue; } }
    if (Math.random() < P.rate) { const t = Z.urgent(); if (t && KIND[t.k].armor !== 'hard' && alive) { const off = Math.random() < P.miss || evades(t) && Math.random() < Math.min(.9, dodge * P.dodgeK) ? 7 : .8; __z.botKill(off); } }
    if (me && me.dead > 0 && Math.random() < P.relaunch) api.launch();
    if (P.perks === 'random' && Math.random() < .02) ['freeze', 'mark', 'air', 'lure'].forEach(k => Z.pk.use(k));
    if (P.perks === 'smart') { const L = live();
      if (G.ch.freeze > 0 && L.some(t => KIND[t.k].dmg >= 40 && tti(t) < 15)) Z.pk.use('freeze');
      if (G.ch.mark > 0) { const m = L.find(t => (KIND[t.k].armor === 1 || t.k === 'boss') && !t.mark); if (m) { api.pickT = m; Z.pk.use('mark'); api.pickT = null; } }
      if (G.ch.air > 0 && L.length >= 10) Z.pk.use('air');
      if (G.ch.lure > 0 && alive && L.filter(t => t.p.distanceTo(me.p) < 1500 && KIND[t.k].armor !== 'hard').length >= 3) Z.pk.use('lure'); } }
  if (G.state === 'clear') __z.sim(4);
  return G.state;
})`;
