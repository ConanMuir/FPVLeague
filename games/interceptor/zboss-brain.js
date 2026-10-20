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
export const bossBrain = {name: 'bosses',
  *shop(P, E) { const {api, G, Z} = E, K = G.bkeep?.undertaker, s = K && api.SITES[K.anchor]; if (!s || !cares(P)) return; const i = K.anchor, B = Z.base;
    if (s.hp <= 0 && B.act.rebuild) yield {why: `Rebuilding ${s.n} to starve the Undertaker waiting in it`, what: 'rebuild', run: () => B.act.rebuild(i), site: i};
    else if (s.hp > 0 && s.hp < s.max * .4) yield {why: `Repairing ${s.n} above 35% to starve the Undertaker`, what: 'repair', run: () => B.act.repair(i, Math.ceil(s.max * .4 - s.hp)), site: i}; },
  wave(P, E, o = {}) { const {api, Z} = E; if (!Z.bosses) return; const [rate, sk] = skill(P), me = o.me || api.player; if (!me || me.dead > 0 || !(Math.random() < rate)) return;
    if (o.teleport !== false && !o.real) { Z.bosses.bot(sk); return; }
    const t = api.TH.find(u => Z.bosses.BOSSES[u.k] && !Z.bosses.BOSSES[u.k].minor && api.live(u) && !Z.hid?.(u)); if (t && sk >= .55) api.pickT = t; }};
