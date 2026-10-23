// Zombies bot pilots: the scripted players behind tools/zombies-bench.mjs (the leaderboard's bot entries, games/interceptor/zbench.json) and
// tools/zombies-balance.mjs. The levels and the whole strategy (shopping, perks, swarm, kill chain, launch alerts, new shop items) live in
// games/interceptor/zbotbrain.js: the page's Bot Spectator (zspectate.js) runs the same brain, so there is one source of truth. See the
// level fields there.
// This file keeps the benchmark's fast pilot: it teleports behind its track and rolls dice instead of flying (rate, miss, dodgeK, fast,
// relaunch below). For bots that really fly, run the benchmark with --real (zbotfly.js through __z.spec.bench).
// The teleporting bots can't feel evasion; an attempt on a track that evades on this difficulty is shaken off with DODGE[evade mode] x dodgeK
// instead (a model, not a measurement).
export {DODGE, LEVELS, level} from '../games/interceptor/zbotbrain.js';

// in-page source: the base-screen shopper (zbotbrain.js shopSteps, every step at once). (P) = a level.
// The arsenal (games/interceptor/zarsbot.js, a brain hook): its weapon and big defences are shopped before the brain's helpers, the rest in the
// brain's hook pass after them.
export const SHOP = `(function(P){ const {G, Z} = __z, AB = Z.ars && Z.ars.bot, keep = G.cash * (1 - (P.spend ?? 1)); let n = 0;
  if (AB) for (const part of ['weapon', 'early']) for (const s of AB.shop(P, __z, {afford: c => G.cash - c >= keep, keep, part})) { s.run(); n++; }
  return n + __z.brain.shopNow(P, __z).length; })`;

// in-page source: one wave of play. (P, dodge) = a level and the difficulty's base dodge chance. Returns the state at the end.
//   rate      chance per half second of running a track down (reaction, finding the next target)
//   miss      share of those runs where the burst is badly timed (a 7 m miss instead of 0.8 m)
//   dodgeK    how often an evading track shakes this pilot off, relative to the difficulty's base (flight quality)
//   fast      chance per half second of sitting on a ballistic / hypersonic / ICBM track's line for a direct hit (inside 15 km of impact; tried before any drone)
//   relaunch  chance per half second of getting the next interceptor off the mat after losing one
// Perks, launch alerts, lock and the swarm: zbotbrain.js tactics (the teleporting pilot forces its locks).
export const WAVE = `(function(P, dodge){
  const {api, G, Z, KIND} = __z, AB = Z.ars && Z.ars.bot; let n = 0;  /* AB: how to fire the loaded arsenal weapon (zarsbot.js) */
  const evades = t => { if (Z.evades) return Z.evades(t); const m = Z.evadeMode(); return m !== 'none' && KIND[t.k].armor !== 'hard' && (m === 'all' || ['jet', 'heavy', 'cruise', 'swarm', 'boss'].includes(t.k)); };
  while (G.state === 'wave' && n++ < 2400) { __z.sim(.5); const me = api.player, alive = me && me.dead <= 0;
    if (P.fast && alive && Math.random() < P.fast * (AB ? AB.fastK(__z) : 1)) { const h = api.TH.filter(t => api.live(t) && KIND[t.k].armor === 'hard' && t.p.distanceTo(t.aim) < 15000).sort((a, b) => a.p.distanceTo(a.aim) - b.p.distanceTo(b.aim))[0];
      if (h) { me.p.copy(h.p).addScaledVector(h.v.clone().normalize(), -.5); me.v.set(0, 0, 0); Z.detonate(); continue; } }
    if (Math.random() < P.rate) { const t = Z.urgent(); if (t && KIND[t.k].armor !== 'hard' && alive) { const bad = Math.random() < P.miss || evades(t) && Math.random() < Math.min(.9, dodge * P.dodgeK), r = AB ? AB.run(P, __z, t, bad) : null;
      if (r) { me.p.copy(r.at || r.t.p).addScaledVector(r.t.v.clone().normalize(), -r.off); me.v.copy(r.t.v); Z.detonate(); } else __z.botKill(bad ? 7 : .8); } }
    if (me && me.dead > 0 && Math.random() < P.relaunch) api.launch();
    __z.brain.tactics(P, __z, {teleport: true}); }
  if (G.state === 'clear') __z.sim(4);
  return G.state;
})`;
