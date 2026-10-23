// Zombies bot brain: the strategy of the bot pilots, in one place. The page runs it for the Bot Spectator (zspectate.js: the bot flies the
// real game, zbotfly.js) and tools/zbot.mjs imports it for the benchmark (tools/zombies-bench.mjs), so the shopping, perks, swarm and
// warning decisions have one source of truth. Pure logic: no three.js, no DOM. Everything in the game comes in through E (the page's
// window.__z: {api, G, Z, KIND, ITEMS, REFIT, expCost}), read live.
//
// Levels are named with Drone League's levels. Each is a strategy profile (what it buys and how it uses its perks) plus two skill profiles:
//   rate, miss, dodgeK, fast, relaunch   the teleporting benchmark pilot (tools/zbot.mjs WAVE: rolls dice instead of flying)
//   fly                                   the real pilot (zbotfly.js): how it flies the dart, see FLY below
//   shop      'naive' cheapest helpers first, few upgrades, domes only once the missiles have come; 'basic' a sound order; 'smart' the best order
//   spend     share of the purse it's willing to spend on a base screen (the rest sits idle: new players hoard or hesitate)
//   up        chance per defence per base screen of buying its next upgrade
//   repairAt / repairShare   repair a site below this share of its hit points, spending at most this share of the purse
//   perks     'none' / 'random' (fires its active perks now and then) / 'smart' (Freeze the closest danger, Mark armor and the boss, Airstrike crowds, Lure packs)
//   domes     how many waves before the ballistic / hypersonic threats it buys Iron Dome / Golden Dome (-1: the wave after they first appear; -99: never)
//   sell, expand, refit, supply, rebuild   the late-game choices it knows how to use
//   swarm     personal swarm (zswarm.js): 0 never buys it, 1 buys it and fires commands now and then, 2 flies it well (screen formation and
//             command, strikes on crowds, attacks what it locks)
//   explore   how far the real pilot roams (zbotroam.js, zbotsortiefly.js, zbotstat.js): 0 holds over the sites; 1 waits at forward stations on the raids' bearings;
//             2 + tours unseen ground between raids, flies sorties and uses what the shop gives it; 3 the full run: every system, the strategic targets, variety
//   lock      teleporting pilot only: chance per half second of forcing a lock (the real pilot has to hold its sights on a track, zlock.js)
//   chain     the kill chain against the fast missiles (zchain.js, when the build has it): 0 none; 1 one point defence; 2 + a boost battery at the
//             edge most launches come from and space interceptors; 3 + batteries wherever launches are planned, point defence at every site,
//             early-warning radar, decoys; 4 every layer and every upgrade
//   warn      launch-alert actions (zwarn.js, when the build has it): rate = chance per half second of acting; mode 'random' / 'harden' / 'smart' / 'best'
//   tryNew    chance per base screen of trying a shop item this brain has never heard of (a new weapon or base defence from another branch)
// FLY (the real pilot): react = seconds between looks at the radar picture (new target, relaunch); aim = how far its aim wanders (m, a slow
// drift, like thumbs on sticks); det = timing error of its detonate press (s, one standard deviation); fire = the closest approach it
// waits for before pressing detonate (m; worse and it goes round again); pick 'near' (the closest track) / 'urgent' (the soonest impact) /
// 'smart' (the soonest impact it can still reach, skipping identified decoys and tracks a helper drone has claimed); decoy = chance it chases
// a decoy anyway; line = chance it tries to sit on a ballistic / hypersonic / ICBM line for a direct hit; relaunch = it presses R for a
// fresh interceptor at the pad nearest its next target when that is quicker than flying there; cruise = share of top speed it cruises at; lockAim = chance it
// deliberately holds its sights on a track to lock it (zlock.js) before closing in, and keeps the lock through the run-in.
// All numbers are game-balance values for bot skill, not measurements of anyone.
export const DODGE = {none: 0, some: .3, all: .45};
export const LEVELS = [
  {n: 'Rookie', rate: .004, miss: .55, dodgeK: 1.4, relaunch: .06, shop: 'naive', spend: .4, up: .25, repairAt: .3, repairShare: .25, perks: 'none', domes: -99, perkBuy: ['battery', 'warhead'], swarm: 0, explore: 0, lock: 0, chain: 0, tryNew: .1,
    fly: {lockAim: 0, react: 1.1, aim: 7, det: .09, fire: 7, pick: 'near', decoy: 1, line: 0, relaunch: 0, cruise: .75}},
  {n: 'Pro', rate: .008, miss: .35, dodgeK: 1.15, relaunch: .12, shop: 'basic', spend: .6, up: .4, repairAt: .45, repairShare: .35, perks: 'random', domes: -1, perkBuy: ['warhead', 'freeze', 'radar', 'swarm'], swarm: 1, explore: 1, lock: .04, chain: 1, warn: {rate: .015, mode: 'random'}, tryNew: .25,
    fly: {lockAim: 0.35, react: .7, aim: 4, det: .05, fire: 5, pick: 'urgent', decoy: .5, line: 0, relaunch: 0, cruise: .85}},
  {n: 'All-Star', rate: .011, miss: .26, dodgeK: 1, relaunch: .15, fast: .005, shop: 'smart', spend: .85, up: .8, repairAt: .8, repairShare: .6, perks: 'random', domes: 2, sell: 1, swarm: 1, explore: 2, lock: .08, chain: 2, warn: {rate: .06, mode: 'harden'}, tryNew: .4,
    fly: {lockAim: 0.6, react: .45, aim: 2.5, det: .03, fire: 3.5, pick: 'smart', decoy: .2, line: .25, relaunch: 1, cruise: .95}},
  {n: 'Champion', rate: .016, miss: .15, dodgeK: .8, relaunch: .22, fast: .012, shop: 'smart', spend: 1, up: 1, repairAt: .75, repairShare: .5, perks: 'smart', domes: 3, sell: 1, expand: 1, rebuild: 1, swarm: 2, explore: 3, lock: .14, chain: 3, warn: {rate: .12, mode: 'smart'}, tryNew: .6,
    fly: {lockAim: 0.8, react: .3, aim: 1.5, det: .02, fire: 2.6, pick: 'smart', decoy: 0, line: .5, relaunch: 1, cruise: 1}},
  {n: 'Grand Champion', rate: .021, miss: .1, dodgeK: .7, relaunch: .32, fast: .028, shop: 'smart', spend: 1, up: 1, repairAt: .85, repairShare: .55, perks: 'smart', domes: 3, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1, swarm: 2, explore: 3, lock: .2, chain: 3, warn: {rate: .2, mode: 'smart'}, tryNew: .8,
    fly: {lockAim: 0.9, react: .22, aim: 1, det: .012, fire: 2, pick: 'smart', decoy: 0, line: .75, relaunch: 1, cruise: 1}},
  {n: 'Legend', rate: .03, miss: .04, dodgeK: .55, relaunch: .5, fast: .06, shop: 'smart', spend: 1, up: 1, repairAt: .9, repairShare: .6, perks: 'smart', domes: 4, sell: 1, expand: 1, refit: 1, supply: 1, rebuild: 1, swarm: 2, explore: 3, lock: .3, chain: 4, warn: {rate: .25, mode: 'best'}, tryNew: 1,
    fly: {lockAim: 1, react: .15, aim: .5, det: .006, fire: 1.6, pick: 'smart', decoy: 0, line: 1, relaunch: 1, cruise: 1}}];
// the loadout a level of bot takes into a run, from the sector it plays (campaign choices): sec = a sector of zcampaign.js SECTORS (its mods: ids, or [id, number]) or
// null for a quick defence. Returns {doc, kit, why}. The levels that explore like Air Mobile (Rocket Assist from wave 1 for the dash out to a far raid); the
// sector's modifiers move it to the doctrine that answers them. The pilot's own kit perks (Lure, Salvage) are not worth much to a bot that flies far from the sites.
export function loadout(P, sec) {
  const m = new Map((sec?.mods || []).map(x => Array.isArray(x) ? x : [x, 1])), has = k => m.has(k), why = [];
  let doc = P.explore >= 3 ? 'air' : 'std', kit = [];
  if (has('poor')) { doc = 'qm'; why.push('thin supply line: no upkeep'); }
  else if (has('fragile') || has('tot') || (m.get('big') || 0) >= 1.15 || (m.get('missile') || 0) >= 5) { doc = 'fortress'; why.push('heavy pressure: sturdier sites'); }
  else if (doc === 'air') why.push('Rocket Assist from wave 1 for the dash out to a far raid');
  if (has('jets') || has('armor') || has('missile') || has('hyper')) { kit.push('hflak'); why.push('heavy flak for jets and cruise missiles'); }
  if (has('swarm')) { kit.push('lure'); why.push('a lure beacon for the swarms'); }
  if (kit.length < 2 && P.shop !== 'naive') kit.push('lrack');
  return {doc, kit: kit.slice(0, 2), why: why.join('; ') || 'the standard base'};
}
/* does this bot explore (P.explore, see above)? Only the flying pilot of the Bot Spectator does: the teleporting benchmark's numbers stay what they were */
export const explores = (P, E, n) => P.explore >= n && !!E.spec?.on;
const key = s => String(s).toLowerCase().replace(/[\s-]+/g, '');
export const level = n => LEVELS.find(l => key(l.n) === key(n));

// every shop item this brain has an opinion about; anything else in the shop is new (another branch's weapon or base defence) and gets
// the generic evaluation (itemValue) instead
const ORDERS = {naive: ['flak', 'rack', 'lrack', 'ew', 'gepard', 'sam', 'mpads', 'hflak', 'idome', 'gdome'],
  basic: ['gdome', 'idome', 'sam', 'gepard', 'rack', 'mpads', 'flak', 'ew', 'hflak', 'lrack', 'mark', 'air', 'lure', 'salvage', 'swarm'],
  smart: ['gdome', 'idome', 'sam', 'gepard', 'mpads', 'hflak', 'rack', 'lrack', 'flak', 'ew', 'mark', 'air', 'warhead', 'freeze', 'lure', 'salvage', 'radar', 'aid', 'relaunch', 'battery', 'optics', 'rocket', 'swarm', 'swarmk']};
export const KNOWN = new Set([...ORDERS.smart, ...ORDERS.naive, 'fuse', 'drones', 'reload', 'harden', 'overtime']);
const prio = P => [...ORDERS[P.shop], ...(P.perkBuy || [])].filter(k => P.swarm || k !== 'swarm' && k !== 'swarmk');

// hooks for features this brain doesn't know yet: push {name, shop(P, E, ctx) (a generator of steps, see step() below), early(P, E, ctx) (the same, ahead of
// the helpers, for the levels that explore), wave(P, E, ctx)}
// (ctx.real: the flying pilot is in the air, ctx.me: its interceptor). Another branch can register its bot logic here instead of editing it.
export const hooks = [];
// one shop action: why (the caption the spectator shows), what (a short tag), run() does it and returns what it spent / did
const step = (why, what, run, o = {}) => ({why, what, run, ...o});
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const pct = s => Math.round(100 * Math.max(0, s.hp) / s.max);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the next wave's roster, {kind: count}
function forecast(G) { const n = {}; for (const q of G.next?.list || []) { const [k, c] = q.split(':'); n[k] = (n[k] || 0) + (+c || 1); } return n; }
// why a helper: domes by when the missiles come, the rest by what in the next wave it is good against
function whyHelper(k, E, nw) {
  const {Z, KIND, ITEMS, RESIST} = E, kf = x => Z.kindFrom ? Z.kindFrom(x) : KIND[x].from, it = ITEMS[k];
  const when = (kind, label) => { const w = kf(kind) - nw; return w > 0 ? `${label} arrive in ${plural(w, 'wave')}` : `${label} are already here`; };
  if (k === 'idome') return `Buying ${it.n}: ${when('ballistic', 'ballistic threats')}`;
  if (k === 'gdome') return `Buying ${it.n}: ${when('hyper', 'hypersonic gliders')}`;
  const R = RESIST?.[k], fc = forecast(E.G), good = Object.entries(fc).filter(([q]) => R && (R[q] ?? 0) >= .7).sort((a, b) => b[1] * (KIND[b[0]]?.dmg || 1) - a[1] * (KIND[a[0]]?.dmg || 1)).slice(0, 2);
  return `Buying ${it.n}: ${good.length ? 'next wave brings ' + good.map(([q, c]) => `${c}× ${KIND[q]?.n || q}`).join(' and ') + ', which it handles well' : 'more cover over the sites'}`;
}
const PERK_WHY = {warhead: 'a bigger kill radius, so more of its bursts kill', battery: 'twice the flight time', freeze: 'slows the most dangerous track', mark: 'helpers hit a marked track twice as hard',
  air: 'clears a crowd of tracks', radar: 'sees tracks earlier', optics: 'thermal through cloud and a faster lock', relaunch: 'back in the air sooner', aid: 'cheaper repairs', rocket: '3× speed after each launch',
  swarm: 'close-support drones that fly with it', swarmk: 'better swarm drones', lure: 'pulls drone packs into an empty field', salvage: 'kills near the sites pay more', fuse: 'the warhead fires itself at closest approach'};
const REFIT_WHY = {swarm: 'FPV swarms are in the waves', range: 'more reach', prox: 'more kills on the slow drones', ap: 'armored heavies are coming', radar: 'more reach', reload: 'more missiles a wave', wide: 'spoofs jets too', bal: 'saves its interceptors for the missiles'};
const CHAIN_N = {pb: 'point defence', bb: 'a boost battery', bm: 'moving a boost battery', st: 'space interceptors', ew: 'early-warning radar', dc: 'decoys', bu: 'a boost battery upgrade', pu: 'a point-defence upgrade'};

// what a defence's next upgrade costs and is, or null (mirrors zbase.js act.upgrade, so the spectator only shows upgrades that happen)
function upInfo(d, what, E) {
  const {Z, ITEMS} = E, def = Z.def, D = E.data, upCost = c => Math.round(c * Z.meta.k('upK') / 10) * 10;
  if (def.isRack ? def.isRack(d) : d.type === 'rack') {
    if (what === 'tier') { const N = D.RACK_TIERS[d.tier + 1]; if (!N || d.type === 'lrack' && d.tier >= D.LRACK.maxTier) return null; return {cost: upCost(N.cost), txt: `${N.n}: ${Math.round(N.hit * 100)}% kill per hit`}; }
    if (d.type !== 'rack') return null; const ci = D.RACK_CAP.indexOf(d.cap), c = D.RACK_CAP_COST[ci + 1]; return c ? {cost: upCost(c), txt: `+1 drone (${D.RACK_CAP[ci + 1]})`} : null;
  }
  const n = D.HELP[d.type]?.lv[d.lvl + 1]; return n ? {cost: upCost(n.cost), txt: `level ${d.lvl + 2}: ${n.txt || ITEMS[d.type].n}`} : null;
}

// generic value of a shop item this brain doesn't know, per $1,000: a helper by how well it covers the kinds in the next wave and the
// ones that have arrived (RESIST, or the item's own vs table), a perk or supply a flat guess. Used for new weapons and base defences.
export function itemValue(k, E) {
  const {G, Z, KIND, ITEMS, RESIST} = E, it = ITEMS[k]; if (!it) return 0;
  const price = Math.max(1, (it.type === 'perk' ? Z.perkPrice?.(k) : Z.itemPrice ? Z.itemPrice(k) : it.price) || it.price || 1000);
  if (it.type === 'helper') {
    const R = RESIST?.[k] || it.vs || it.resist || null, fc = forecast(G); let v = 0, n = 0;
    for (const [q, c] of Object.entries(fc)) { const e = R ? R[q] ?? 0 : .5; v += e * c * (KIND[q]?.dmg || 30); n += c * (KIND[q]?.dmg || 30); }
    return n ? 1000 * v / n / price * 3 : .5;
  }
  if (it.type === 'perk') return 1000 / price;
  return .3 * 1000 / price;
}

// ---------- the base screen: a generator of shop steps (the spectator runs them one by one with a caption; the benchmark runs them at once) ----------
/* every step it yields also tells the bot tracker (zbotstat.js) which system it used, when it runs */
export function* shopSteps(P, E) { for (const s of shopSteps0(P, E)) { const r0 = s.run; s.run = () => { const r = r0(); try { E.bot?.shop?.(s, r); } catch (e) {} return r; }; yield s; } }
function* shopSteps0(P, E) {
  const {api, G, Z, KIND} = E, IT = E.ITEMS, def = Z.def, B = Z.base, kf = k => Z.kindFrom ? Z.kindFrom(k) : KIND[k].from, nw = G.wave + 1;
  const PRIO = prio(P), top = PRIO.indexOf('gepard');
  const from = k => Z.itemFrom ? Z.itemFrom(k) : IT[k].from, cost = k => IT[k].type === 'perk' ? Z.perkPrice(k) : (Z.itemPrice ? Z.itemPrice(k) : IT[k].price);
  const domeOK = k => k === 'idome' ? nw >= kf('ballistic') - P.domes : k === 'gdome' ? nw >= kf('hyper') - P.domes : true;
  const repK = () => (Z.repairK?.() ?? 1) * 3;
  for (let i = 0; i < api.SITES.length; i++) { const s = api.SITES[i]; if (s.hp > 0 && s.hp < s.max * P.repairAt) { const hp = Math.min(Math.floor(G.cash * P.repairShare / 3), s.max - s.hp, Math.floor(G.cash / repK()));
    if (hp > 0) yield step(`Repairing ${s.n}: ${pct(s)}% hit points left`, 'repair', () => B.act.repair(i, Math.floor(G.cash * P.repairShare / 3)), {site: i}); } }
  if (P.rebuild && B.act.rebuild) for (let i = 0; i < api.SITES.length; i++) { const s = api.SITES[i]; if (s.hp <= 0 && G.cash > 9000) yield step(`Rebuilding ${s.n}: destroyed, back at 40%`, 'rebuild', () => B.act.rebuild(i), {site: i}); }
  const open = () => def.SLOTS.some((_, j) => def.slotFree(j)), keep = G.cash * (1 - (P.spend ?? 1)), afford = c => G.cash - c >= keep;
  for (const h of hooks) if (h.early && explores(P, E, 2)) { try { yield* h.early(P, E, {afford, open, keep}); } catch (e) { console.warn('bot hook ' + h.name, e); } }  /* hooks that want a place ahead of the helpers (the arsenal's weapon and big defences) */
  if (P.chain >= 2) yield* chainSteps(P, E, afford);  // from All-Star up the kill chain comes before more helpers: it needs no free position
  for (let pass = 0; pass < 3; pass++) {
    const cards = G.cards.map((c, i) => ({...c, i})).filter(c => PRIO.includes(c.k) && IT[c.k] && nw >= from(c.k) && IT[c.k].type !== 'supply' && !(IT[c.k].type === 'perk' && Z.perkMaxed(c.k))).sort((a, b) => PRIO.indexOf(a.k) - PRIO.indexOf(b.k));
    for (const c of cards) { const it = IT[c.k], price = cost(c.k); if (!afford(price) || !domeOK(c.k)) continue;
      if (it.kit && it.type === 'helper' && def.D.filter(d => d.type === c.k).length >= 2) continue;  /* kit helpers as a supplement: two of each at most */
      let note = '';
      if (it.type === 'helper' && !open()) {
        if (P.expand && def.canOpen && PRIO.indexOf(c.k) <= top) { const j = def.SLOTS.findIndex((_, j) => def.canOpen(j, Z.meta.doc())), xc = E.expCost(G.exp | 0, Z.meta.k('expK'));
          if (j >= 0 && G.cash > price + xc) { yield step(`Opening ${def.SLOTS[j].n} (${money(xc)}): every position is full and it wants a ${it.n.toLowerCase()}`, 'expand', () => B.act.expand(j), {slot: j}); note = ' in the new position'; } }
        if (!open()) { if (!P.sell) continue; const w = def.D.filter(d => d.type === 'flak' || d.type === 'ew' || d.type === 'lrack').sort((a, b) => a.kills - b.kills)[0]; if (!w || PRIO.indexOf(c.k) > top) continue;
          yield step(`Selling the ${IT[w.type].n.toLowerCase()} at ${def.SLOTS[w.slot].n} (${plural(w.kills, 'kill')}) to make room for a ${it.n.toLowerCase()}`, 'sell', () => B.act.sell(w.id), {id: w.id}); note = ' where it was'; } }
      if (it.type === 'helper') { const j = def.SLOTS.findIndex((_, j) => def.slotFree(j)); if (j >= 0) yield step(whyHelper(c.k, E, nw) + note, 'place', () => B.act.place(c.k, j), {k: c.k, slot: j, cost: price}); }
      else yield step(`Buying ${it.n}${Z.perkLevel?.(c.k) ? ` (level ${Z.perkLevel(c.k) + 1})` : ''}: ${PERK_WHY[c.k] || 'worth having'}`, 'buy', () => B.buy(c.i), {k: c.k, cost: price}); }
    for (const d of def.D) if (Math.random() < P.up && G.cash > keep + 600) { const rk = def.isRack ? def.isRack(d) : d.type === 'rack', w = rk ? 'tier' : 'lvl', u = upInfo(d, w, E);
      if (u && G.cash >= u.cost) yield step(`Upgrading the ${IT[d.type].n.toLowerCase()} at ${def.SLOTS[d.slot]?.n}: ${u.txt}`, 'upgrade', () => B.act.upgrade(d.id, w), {id: d.id, cost: u.cost});
      if (d.type === 'rack') { const u2 = upInfo(d, 'cap', E); if (u2 && G.cash >= u2.cost) yield step(`Upgrading the drone rack at ${def.SLOTS[d.slot]?.n}: ${u2.txt}`, 'upgrade', () => B.act.upgrade(d.id, 'cap'), {id: d.id, cost: u2.cost}); } }
  }
  if ((P.refit || explores(P, E, 3)) && B.act.refit) for (const d of def.D) { const R = E.REFIT[d.type]; if (!R || d.refit) continue;
    const want = {rack: nw >= kf('swarm') ? 'swarm' : 'range', flak: 'prox', gepard: nw >= kf('heavy') ? 'ap' : 'radar', sam: 'reload', ew: 'wide', idome: 'bal'}[d.type], r = R.find(x => x.id === want);
    if (r && G.cash > r.cost * 2.5) yield step(`Refitting the ${IT[d.type].n.toLowerCase()} at ${def.SLOTS[d.slot]?.n} with ${r.n}: ${REFIT_WHY[want] || r.txt}`, 'refit', () => B.act.refit(d.id, want), {id: d.id}); }
  if ((P.supply || explores(P, E, 3)) && nw >= 12) for (const k of ['reload', 'harden', 'drones', 'overtime']) if (B.act.supply && IT[k] && !G.sup?.[k] && nw >= from(k) && G.cash > cost(k) * 4)
    yield step(`Loading ${IT[k].n} for wave ${nw}: ${E.data?.SUPPLY?.[k]?.txt || 'this wave only'}`, 'supply', () => B.act.supply(k), {k});
  if (P.chain === 1) yield* chainSteps(P, E, afford);
  yield* tryNew(P, E, afford, open);
  for (const h of hooks) if (h.shop) { try { yield* h.shop(P, E, {afford, open}); } catch (e) { console.warn('bot hook ' + h.name, e); } }
}
// the benchmark: every step at once
export function shopNow(P, E) { const done = []; for (const s of shopSteps(P, E)) { const c0 = E.G.cash; done.push(s); s.result = s.run(); s.spent = Math.round(c0 - E.G.cash); } return done; }

// new items (feature detection): anything in the shop this brain has no opinion about gets the generic value; a level tries one now and
// then (tryNew), the better levels when it is worth it and the purse is comfortable
function* tryNew(P, E, afford, open) {
  const {G, Z} = E, IT = E.ITEMS, def = Z.def, B = Z.base, nw = G.wave + 1, from = k => Z.itemFrom ? Z.itemFrom(k) : IT[k].from;
  const NEW = G.cards.map((c, i) => ({...c, i})).filter(c => IT[c.k] && !KNOWN.has(c.k) && nw >= from(c.k) && !(IT[c.k].type === 'perk' && Z.perkMaxed?.(c.k)) && !(IT[c.k].type === 'supply' && G.sup?.[c.k]));
  if (!NEW.length || !(P.tryNew > 0)) return;
  const ranked = NEW.map(c => ({...c, v: itemValue(c.k, E)})).sort((a, b) => b.v - a.v);
  for (const c of ranked) { const it = IT[c.k], price = (it.type === 'perk' ? Z.perkPrice(c.k) : Z.itemPrice ? Z.itemPrice(c.k) : it.price) || 0;
    if (!price || !afford(price) || G.cash < price * (P.shop === 'smart' ? 1.5 : 1.2) || Math.random() > P.tryNew) continue;
    const owned = it.type === 'helper' ? def.D.filter(d => d.type === c.k).length : 0;
    if (it.type === 'helper') { if (owned >= 2 && c.v < 1 || !open()) continue; const j = def.SLOTS.findIndex((_, j) => def.slotFree(j)); if (j < 0) continue;
      yield step(`Trying ${it.n}: new in this build, it rates ${c.v.toFixed(2)} against the next wave per $1,000`, 'place', () => B.act.place(c.k, j), {k: c.k, slot: j, cost: price, tryNew: 1}); }
    else if (it.type === 'supply') { if (B.act.supply) yield step(`Trying ${it.n}: a new supply in this build`, 'supply', () => B.act.supply(c.k), {k: c.k, tryNew: 1}); }
    else yield step(`Trying ${it.n}: new in this build`, 'buy', () => B.buy(c.i), {k: c.k, cost: price, tryNew: 1});
    if (P.shop !== 'smart') break; }
}

// the kill chain (zchain.js, feature-detected: Z.chain), by level: what it buys and whether it places the boost batteries where the next wave's launches come from
function* chainSteps(P, E, afford) {
  const {api, G, Z, KIND} = E, def = Z.def, C = Z.chain, nw = G.wave + 1, kf = k => Z.kindFrom ? Z.kindFrom(k) : KIND[k].from;
  if (!C || !P.chain || !G.kc || nw < (C.from | 0)) return;
  const K = G.kc, c = P.chain, fp = Z.fastPlan ? Z.fastPlan() : [], fast = nw >= kf('ballistic');
  const tr = (a, x, cost) => afford(cost) ? step(`Kill chain: ${CHAIN_N[a] || a}${a === 'pb' || a === 'pu' ? ' at ' + (api.SITES[x]?.n || 'a site') : a === 'bb' || a === 'bm' ? ' at the ' + (fp[String(x).split('>').pop()]?.n || 'edge') + ' edge' : ''}: ${fast ? 'fast missiles are in the waves' : 'before the fast missiles come'}`, 'chain', () => C.act(a, x), {chain: a}) : null;
  const weakSite = () => api.SITES.map((s, i) => ({s, i})).filter(o => o.s.hp > 0 && !K.pd?.[o.s.n]).sort((a, b) => a.s.hp / a.s.max - b.s.hp / b.s.max)[0];
  let s;
  if (c === 1) { if (fast && !Object.keys(K.pd || {}).length) { const w = weakSite(); if (w && (s = tr('pb', w.i, 4500))) yield s; } return; }
  const want = fp.map((q, i) => ({i, n: q.total})).sort((a, b) => b.n - a.n);
  if (c === 2) { if (fast && !K.boost?.some(Boolean) && want[0]?.n && (s = tr('bb', want[0].i, 6000))) yield s; if (fast && Object.keys(K.pd || {}).length < 2) { const w = weakSite(); if (w && (s = tr('pb', w.i, 4500))) yield s; }
    if (def.D.some(d => d.type === 'gdome') && K.stock < 2 && (s = tr('st', 2 - K.stock, 1600))) yield s; return; }
  for (const w of want) { if (!w.n || K.boost?.[w.i]) continue; const idle = (K.boost || []).findIndex((b, j) => b && !fp[j].total); if (idle >= 0) { if ((s = tr('bm', idle + '>' + w.i, 1200))) yield s; } else if ((c >= 4 || (K.boost || []).filter(Boolean).length < 2) && (s = tr('bb', w.i, 6000))) yield s; }
  if (fast) for (const o of api.SITES.map((q, i) => ({s: q, i})).filter(o => o.s.hp > 0 && !K.pd?.[o.s.n]).sort((a, b) => a.s.hp - b.s.hp)) if ((s = tr('pb', o.i, 4500))) yield s;
  if (fast && K.ewr < (c >= 4 ? 2 : 1) && (s = tr('ew', 0, 3600))) yield s;
  if (fast && K.decoys < (c >= 4 ? 4 : 2) && (s = tr('dc', 1, 500))) yield s;
  if (def.D.some(d => d.type === 'gdome') && C.stockCap) for (let n = 0; n < 12 && K.stock < C.stockCap(); n++) { const q = tr('st', 1, 800); if (!q) break; yield q; }
  if (c >= 4) { for (let i = 0; i < (K.boost || []).length; i++) { const b = K.boost[i]; if (b && !b.lvl && (s = tr('bu', i, 4500))) yield s; }
    for (let i = 0; i < api.SITES.length; i++) { const q = api.SITES[i]; if (K.pd?.[q.n] && !K.pd[q.n].lvl && (s = tr('pu', i, 4000))) yield s; } }
}

// ---------- during a wave, every half second: perks, launch alerts, lock (teleporting pilot only) and the swarm. Returns what the swarm is doing. ----------
// o.teleport: the benchmark pilot (forces locks, as tools/zbot.mjs always did); o.me / o.alive: the interceptor
export function tactics(P, E, o = {}) {
  const {api, G, Z, KIND} = E, me = o.me || api.player, alive = !!me && me.dead <= 0, live = () => api.TH.filter(api.live), tti = t => Math.hypot(t.aim.x - t.p.x, t.aim.z - t.p.z) / Math.max(1, t.spd);
  if (P.perks === 'random' && Math.random() < .02) ['freeze', 'mark', 'air', 'lure'].forEach(k => Z.pk.use(k));
  if (P.perks === 'smart') { const L = live();
    if (G.ch.freeze > 0 && L.some(t => KIND[t.k].dmg >= 40 && tti(t) < 15)) Z.pk.use('freeze');
    if (G.ch.mark > 0) { const m = L.find(t => (KIND[t.k].armor === 1 || t.k === 'boss') && !t.mark); if (m) { const k0 = o.teleport ? null : api.pickT; api.pickT = m; Z.pk.use('mark'); api.pickT = k0; } }
    if (G.ch.air > 0 && L.length >= 10) Z.pk.use('air');
    if (G.ch.lure > 0 && alive && L.filter(t => t.p.distanceTo(me.p) < 1500 && KIND[t.k].armor !== 'hard').length >= 3) Z.pk.use('lure'); }
  warn(P, E);
  const sw = Z.sw?.mine;
  if (o.teleport && P.lock && alive && Z.lk && !Z.lk.t && Math.random() < P.lock) { const t = Z.urgent(); if (t && KIND[t.k].armor !== 'hard' && t.p.distanceTo(me.p) < 3500) Z.lk.force(t); }
  let sd = '';
  if (P.swarm && sw && sw.d.length && alive) { const L = live().filter(t => t.p.distanceTo(me.p) < 4500 && KIND[t.k].armor !== 'hard');
    if (P.swarm >= 2) { const ex = explores(P, E, 3), f = ex ? swarmForm(E, sw, L, me) : 3; if (sw.form !== f && (!ex || swarmHold(E, sw))) Z.sw.command('form#', f); if (sw.mode === 'escort' && L.length >= (ex ? 2 : 0)) Z.sw.command('screen');
      if (Z.lk?.t && sw.mode !== 'attack' && (KIND[Z.lk.t.k].armor === 1 || Z.lk.t.k === 'boss' || L.length < 6)) Z.sw.command('attack');
      if (sw.ch > 0 && L.length >= 6) Z.sw.command('strike'); }
    else if (Math.random() < .02) { if (Z.lk?.t) Z.sw.command('attack'); else Z.sw.command(['screen', 'strike', 'next'][Math.random() * 3 | 0]); }
    sd = sw.d.some(d => d.st === 'strike' || d.st === 'gnd') ? 'striking with the swarm' : sw.mode === 'attack' && sw.tgt ? `swarm attacking T${String(sw.tgt.id).padStart(2, '0')}` : sw.mode === 'screen' ? 'screening with the swarm' : 'swarm in escort'; }
  for (const h of hooks) if (h.wave) { try { h.wave(P, E, o); } catch (e) { console.warn('bot hook ' + h.name, e); } }
  return sd;
}
// the formation that suits what the swarm is about to do (the levels that explore use all five): column under Rocket Assist (it keeps up and draws less), a wedge
// when it is going at a lock on an armored track or the Mothership (+25% kill chance on attacks and strikes), line abreast against FPV swarms (a pass can take a
// neighbour), the screen against a crowd, the cloud when there is little about; never more often than every 6 s of the wave
function swarmForm(E, sw, L, me) {
  const {Z, KIND} = E, lk = Z.lk?.t;
  if (me.boost > 0) return 4;
  if (sw.mode === 'attack' && sw.tgt && (KIND[sw.tgt.k].armor === 1 || sw.tgt.k === 'boss') || lk && (KIND[lk.k].armor === 1 || lk.k === 'boss')) return 1;
  if (L.filter(t => t.k === 'swarm').length >= 4) return 2;
  return L.length >= 3 ? 3 : 0;
}
function swarmHold(E, sw) { const t = E.G.wt || 0; if (sw.fT != null && t - sw.fT < 6 && t >= sw.fT) return false; sw.fT = t; return true; }
// launch alerts (zwarn.js, feature-detected: Z.warn): harden / evacuate / decoy, as well as this level knows how
function warn(P, E) {
  const {G, Z, KIND} = E, Wn = Z.warn, M = P.warn && P.warn.mode; if (!Wn || !M || !(Math.random() < P.warn.rate)) return;
  const A = Wn.alerts(), ok = (a, t) => !Wn.why(a, t), dmg = t => KIND[t.k].dmg * (G.sup && G.sup.harden ? .75 : 1), tt = t => t.p.distanceTo(t.aim) / Math.max(1, t.spd);
  if (!A.length) return;
  if (M === 'random') { const t = A[Math.random() * A.length | 0], a = ['harden', 'evac', 'decoy'][Math.random() * 3 | 0]; if (ok(a, t)) Wn.act(a, t.id); return; }
  if (M === 'harden') { const t = A.find(t => t.k !== 'ballistic' && tt(t) < 10 && ok('harden', t)); if (t) Wn.act('harden', t.id); return; }
  const by = new Map(); for (const t of A) if (tt(t) < 15 && !t.dcy) by.set(t.tgt, (by.get(t.tgt) || 0) + dmg(t));
  const d = A.filter(t => t.k !== 'ballistic' || M === 'best').find(t => tt(t) > 6 && ok('decoy', t) && (t.k !== 'ballistic' || G.kc?.decoys > 2)); if (d) Wn.act('decoy', d.id);
  for (const [s, x] of [...by].sort((a, b) => b[1] - a[1])) { const t = A.find(u => u.tgt === s && tt(u) < 15); if (!t) continue;
    if ((x >= s.hp * .8 || M === 'best' && x >= 300) && ok('harden', t)) { Wn.act('harden', t.id); break; }
    if (M === 'best' && x >= s.hp && ok('evac', t)) { Wn.act('evac', t.id); break; } }
}
