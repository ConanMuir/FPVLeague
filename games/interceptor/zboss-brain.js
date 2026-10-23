// The boss roster's bot logic as a hook for the shared bot brain (zbotbrain.js `hooks`, from the spectator branch): push bossBrain onto
// its hooks and the benchmark pilot and the Bot Spectator handle bosses the same way tools/zbot.mjs does today. Pure logic, E = window.__z.
//   shop   Champion and up starve the Undertaker: repair (or rebuild) the site it waits in above its starve line
//   wave   the teleporting benchmark pilot makes runs at live bosses where the boss module says a pilot of its skill would burst
//          (zbosses.js Z.bosses.bot); the flying pilot (the spectator) is pointed at a boss it can see when the level knows how
// Skill per level (chance per half second of a run, skill 0..1); P.boss on a level overrides it.
const SKILL = {rookie: [.01, .25], pro: [.02, .4], allstar: [.03, .55], champion: [.045, .7], grandchampion: [.06, .8], legend: [.08, .9]};
const key = s => String(s || '').toLowerCase().replace(/[\s-]+/g, '');
const skill = P => P.boss || SKILL[key(P.n)] || [.02, .4];
const cares = P => P.bossCare ?? ['champion', 'grandchampion', 'legend'].includes(key(P.n));
/* A boss that is heard, not seen (the Hush has a hear(ctx, t, pilot) hook: the same sound cue the speakers play, zhush-cue.js) has no radar track, so
   the bots listen: they pay far more attention to it (the rate is scaled up to 1 + 14 x skill x attn) while it is loud and its tell is on (the creak
   before a pass, the flare, the moment after). attn is 0..1; nothing in the game changes for bosses without the hook. */
const ear = (E, me, sk) => { const {api, Z} = E; let m = 1; for (const u of api.TH) { const D = Z.bosses.BOSSES[u.k]; if (!D?.hear || !api.live(u)) continue; m = Math.max(m, 1 + 14 * sk * D.hear(Z.bosses.ctx, u, me).attn); } return m; };
export const bossBrain = {name: 'bosses',
  *shop(P, E) { const {api, G, Z} = E, K = G.bkeep?.undertaker, s = K && api.SITES[K.anchor]; if (!s || !cares(P)) return; const i = K.anchor, B = Z.base;
    if (s.hp <= 0 && B.act.rebuild) yield {why: `Rebuilding ${s.n} to starve the Undertaker waiting in it`, what: 'rebuild', run: () => B.act.rebuild(i), site: i};
    else if (s.hp > 0 && s.hp < s.max * .4) yield {why: `Repairing ${s.n} above 35% to starve the Undertaker`, what: 'repair', run: () => B.act.repair(i, Math.ceil(s.max * .4 - s.hp)), site: i}; },
  wave(P, E, o = {}) { const {api, Z} = E; if (!Z.bosses) return; const [rate, sk] = skill(P), me = o.me || api.player; if (!me || me.dead > 0 || !(Math.random() < rate * ear(E, me, sk))) return;
    if (o.teleport === true) { Z.bosses.bot(sk); return; }  // the benchmark pilot; the flying pilot (zbotfly.js) only picks the boss
    const t = api.TH.find(u => Z.bosses.BOSSES[u.k] && !Z.bosses.BOSSES[u.k].minor && api.live(u) && (!Z.hid?.(u) || Z.bosses.BOSSES[u.k].hear)); if (t && sk >= .55) api.pickT = t; }};
