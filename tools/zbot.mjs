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
//   sortie    between waves (games/interceptor/zsortie.js): go = chance of flying the break's sortie; pick 'near' (the closest known target),
//             'value' (what it takes out of the next waves for the defences around it) or 'smart' (value, launch sites first when its sector
//             has fast missiles planned, only targets the clock allows); aim = bomb error (m); back = chance of judging the return in time
//             (otherwise it lingers and is late: drone and salvage lost, the wave starts); depth = deepest tier it goes for (0 near, 1 mid,
//             2 deep); strike = also orders strikes from the base screen on known launch sites when the purse is comfortable.
//             With nothing known it scouts the nearest unexplored ground first. It flies at 100 m/s, 70 m up, and hovers over the target
//             while its bombs fall, so the guns and patrols get their chance.
// The bots teleport behind their track, so they can't feel evasion; an attempt on a track that evades on this difficulty is shaken off with
// DODGE[evade mode] x dodgeK instead (a model, not a measurement).
export const DODGE = {none: 0, some: .3, all: .45};
export const LEVELS = [
  {n: 'Rookie', rate: .004, miss: .55, dodgeK: 1.4, relaunch: .06, shop: 'naive', spend: .4, up: .25, repairAt: .3, repairShare: .25, perks: 'none', domes: -99, perkBuy: ['battery', 'warhead'], chain: 0, sortie: {go: .15, pick: 'near', aim: 22, back: .65, depth: 0}},
  {n: 'Pro', rate: .008, miss: .35, dodgeK: 1.15, relaunch: .12, shop: 'basic', spend: .6, up: .4, repairAt: .45, repairShare: .35, perks: 'random', domes: -1, perkBuy: ['warhead', 'freeze', 'radar'], chain: 1, warn: {rate: .03, mode: 'random'}, sortie: {go: .3, pick: 'near', aim: 14, back: .8, depth: 1}},
  {n: 'All-Star', rate: .011, miss: .26, dodgeK: 1, relaunch: .15, fast: .005, shop: 'smart', spend: .85, up: .8, repairAt: .8, repairShare: .6, perks: 'random', domes: 2, sell: 1, chain: 2, warn: {rate: .06, mode: 'harden'}, sortie: {go: .5, pick: 'value', aim: 9, back: .88, depth: 1}},
  {n: 'Champion', rate: .016, miss: .15, dodgeK: .8, relaunch: .22, fast: .012, shop: 'smart', spend: 1, up: 1, repairAt: .75, repairShare: .5, perks: 'smart', domes: 3, sell: 1, expand: 1, rebuild: 1, chain: 3, warn: {rate: .12, mode: 'smart'}, sortie: {go: .65, pick: 'smart', aim: 6, back: .94, depth: 2}},
  {n: 'Grand Champion', rate: .021, miss: .1, dodgeK: .7, relaunch: .32, fast: .028, shop: 'smart', spend: 1, up: 1, repairAt: .85, repairShare: .55, perks: 'smart', domes: 3, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1, chain: 3, warn: {rate: .2, mode: 'smart'}, sortie: {go: .75, pick: 'smart', aim: 4, back: .97, depth: 2, strike: 1}},
  {n: 'Legend', rate: .03, miss: .04, dodgeK: .55, relaunch: .5, fast: .06, shop: 'smart', spend: 1, up: 1, repairAt: .9, repairShare: .6, perks: 'smart', domes: 4, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1, chain: 4, warn: {rate: .4, mode: 'best'}, sortie: {go: .85, pick: 'smart', aim: 2.5, back: .99, depth: 2, strike: 1}}];
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
  // the kill chain (zchain.js), by level: what it buys and whether it places the boost batteries where next wave's launches come from
  const C = Z.chain, chain = () => { if (!C || !P.chain || nw < C.from) return; const K = G.kc, c = P.chain, fp = Z.fastPlan ? Z.fastPlan() : [], fast = nw >= kf('ballistic');
    const try_ = (a, x, cost) => afford(cost) && C.act(a, x);
    const weakSite = () => api.SITES.map((s, i) => ({s, i})).filter(o => o.s.hp > 0 && !K.pd[o.s.n]).sort((a, b) => a.s.hp / a.s.max - b.s.hp / b.s.max)[0];
    if (c === 1) { if (fast && !Object.keys(K.pd).length) { const w = weakSite(); if (w) try_('pb', w.i, 4000); } return; }
    const want = fp.map((s, i) => ({i, n: s.total})).sort((a, b) => b.n - a.n);
    if (c === 2) { if (fast && !K.boost.some(Boolean) && want[0].n) try_('bb', want[0].i, 5000); if (fast && Object.keys(K.pd).length < 2) { const w = weakSite(); if (w) try_('pb', w.i, 4000); }
      if (def.D.some(d => d.type === 'gdome') && K.stock < 2) try_('st', 2 - K.stock, 1600); return; }
    // 3+: a battery wherever launches are planned (move one sitting at a quiet edge first), point defence at every site, the radar, decoys, the stock
    for (const w of want) { if (!w.n || K.boost[w.i]) continue; const idle = K.boost.findIndex((b, j) => b && !fp[j].total); if (idle >= 0) try_('bm', idle + '>' + w.i, 1200); else if (c >= 4 || K.boost.filter(Boolean).length < 2) try_('bb', w.i, 5000); }
    if (fast) for (const o of api.SITES.map((s, i) => ({s, i})).filter(o => o.s.hp > 0 && !K.pd[o.s.n]).sort((a, b) => a.s.hp - b.s.hp)) try_('pb', o.i, 4000);
    if (fast && K.ewr < (c >= 4 ? 2 : 1)) try_('ew', 0, 3600);
    if (fast && K.decoys < (c >= 4 ? 4 : 2)) try_('dc', 1, 450);
    if (def.D.some(d => d.type === 'gdome')) while (K.stock < C.stockCap() && try_('st', 1, 800)) {}
    if (c >= 4) { K.boost.forEach((b, i) => { if (b && !b.lvl) try_('bu', i, 4000); }); api.SITES.forEach((s, i) => { if (K.pd[s.n] && !K.pd[s.n].lvl) try_('pu', i, 3500); }); } };
  if (P.chain >= 3) chain();
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
  if (P.chain && P.chain < 3) chain();
})`;

// in-page source: the break's sortie (and strike orders) for a level. Returns what happened ('skip', 'home', 'late', 'lost') and counts it in window.__so.
export const SORTIE = `(function(P){
  const SP = P.sortie, so = __z.so, {G, api, Z} = __z, R = window.__so || (window.__so = {n: 0, late: 0, lost: 0, kills: 0, banked: 0, strikes: 0});
  if (!SP || !so || G.state !== 'base' || G.wave < so.SO.from) return 'skip';
  const W = so.W, FAST = ['ballistic', 'hyper', 'icbm'], fastIn = s => (Z.fastPlan ? Z.fastPlan()[s]?.total : 0) | 0, cnt = k => G.next.list.reduce((a, q) => a + (q.split(':')[0] === k ? +(q.split(':')[1] || 1) : 0), 0);
  const value = t => t.t === 'convoy' ? (t.cargo.all ? 40 : (t.cargo.left ?? t.cargo.n) * 10) : t.t === 'launch' ? 15 + 50 * fastIn(t.sec) * (SP.pick === 'smart' ? 3 : 1) : 12 * cnt(t.kind) + 30;
  const guard = t => 1 + t.parts.filter(q => q.aa && q.alive).length + .7 * t.pats.filter(q => q.st !== 'dead').length;
  if (SP.strike) for (const t of so.known()) { const c = Math.round((so.SO.strike.base + so.SO.strike.perW * G.wave) / 50) * 50; if (t.t === 'launch' && !t.dead && fastIn(t.sec) >= 2 && G.cash > c * 5 && so.strike(t.id) != null) R.strikes++; }
  if (Math.random() > SP.go || !so.launch()) return 'skip';
  R.n++; const me = () => api.player, V = 100, late = Math.random() > SP.back, c0 = G.cash;
  const homeD = () => { const d = me(); let b = 1e9; for (const f of api.FOBS) b = Math.min(b, Math.hypot(f.x - d.p.x, f.z - d.p.z)); return b; };
  const leave = () => so.S.t < (late ? -30 : homeD() / V + 10), D = t => Math.hypot(t.x - me().p.x, t.z - me().p.z);
  const pick = () => { const L = so.known().filter(t => !t.dead && !t.done && t.tier <= SP.depth && (t.t !== 'factory' || G.wave >= 6));
    if (SP.pick === 'smart') { const ok = L.filter(t => (D(t) + Math.hypot(t.x - api.FOBS[1].x, t.z - api.FOBS[1].z)) / V + 25 < so.S.t); return ok.sort((a, b) => value(b) / guard(b) / (D(b) / 1000 + 1) - value(a) / guard(a) / (D(a) / 1000 + 1))[0]; }
    if (SP.pick === 'value') return L.sort((a, b) => value(b) / guard(b) - value(a) / guard(a))[0];
    return L.sort((a, b) => D(a) - D(b))[0]; };
  // scouting: along the supply roads first (convoys drive there, launch sites sit near them), then any unexplored ground a kilometre on
  const scout = () => { const ok = c => !so.fog.known(c.x, c.z) && W.tierOf(W.depth(c.x, c.z)) <= SP.depth && Math.abs(c.x) < 3900 && Math.abs(c.z) < 3900;
    const R2 = W.routes.flatMap(r => [.3, .45, .6, .75].map(f => W.at(r, r.L * f))).filter(ok); if (R2.length) return R2.sort((a, b) => D(a) - D(b))[0];
    const C = W.cands().filter(c => ok(c) && D(c) > 1000); return C.length ? C.sort((a, b) => D(a) - D(b))[0] : null; };
  const trace = window.__soTrace ? [] : null;
  for (let leg = 0; leg < 8 && so.S.on && !leave(); leg++) {
    if (me().dead > 0) { R.lost++; __z.sim(3); continue; }
    const t = pick(); if (trace) trace.push([leg, t ? t.t + '/' + t.tier : 'scout', Math.round(so.S.t), so.S.hull, so.S.bombs, so.known().length]);
    if (!t) { const c = scout(); if (!c) break; so.fly(c.x, c.z, 70, V, leave); continue; }
    // the run in: 'near' pilots come in high and hover while each bomb falls; 'value' lower, quicker; 'smart' low (under most of the guns' cover) with a salvo
    const agl = SP.pick === 'smart' ? 25 : SP.pick === 'value' ? 45 : 70, gap = SP.pick === 'smart' ? .3 : SP.pick === 'value' ? 1.6 : 3.6;
    so.fly(t.x, t.z, agl, V, () => leave() || D(t) < 120);
    const aims = t.parts.filter(x => x.main && x.alive), was = aims.filter(q => q.alive).length;
    for (let i = 0; so.S.bombs > 0 && so.S.on && me().dead <= 0 && aims.some(q => q.alive) && i < 9; i++) { const q = aims.filter(x => x.alive)[i % Math.max(1, aims.filter(x => x.alive).length)], a = Math.random() * 6.283, e = SP.aim * Math.random();
      so.S.bombs--; so.drop(q.x + Math.cos(a) * e, q.y + 60, q.z + Math.sin(a) * e); so.hold(gap); }
    if (gap < 3.6 && so.S.on && me().dead <= 0) so.hold(3.6 - gap);
    R.kills += was - aims.filter(q => q.alive).length;
    if (SP.pick === 'smart' && t.t !== 'convoy' && !t.dead && me().dead <= 0 && so.S.on) { const h = t.parts.find(x => x.main && x.alive); if (h && h.hp <= so.SO.kamiDmg) { me().p.set(h.x, h.y + h.h * .5, h.z); __z.Z.detonate(); } }
    if (so.S.bombs <= 0 && me().dead <= 0) break; }
  if (late && so.S.on && me().dead <= 0 && !so.S.home) so.hold(so.S.t + 1);  /* misjudged the way back: still out there when the clock runs out */
  if (so.S.on && me().dead <= 0) { const f = api.FOBS[so.S.pad]; so.fly(f.x, f.z + 120, 60, V, () => so.S.home); }
  while (so.S.on && me().dead > 0) __z.sim(.5);
  if (so.S.on && !late) so.finish();
  while (so.S.on) __z.sim(.5);
  R.banked += Math.max(0, G.cash - c0); if (trace) window.__soTrace.push([G.wave, ...trace]);
  if (G.state !== 'base') { R.late++; return 'late'; }
  return 'home';
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
            if (M === 'best' && x >= s.hp && ok('evac', t)) { Wn.act('evac', t.id); break; } } } } } }
  if (G.state === 'clear') __z.sim(4);
  return G.state;
})`;
