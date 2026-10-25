// Interceptor harness: headless Edge runs Zombies (waves, money, integrity, base screen, game over) by stepping the sim directly through
// window.__z. Run: node tools/zombies-test.mjs [--shots DIR] [--throttle N]
//   --sections=saves,zombies,roster,helpers,weather,meta,chain,campaign,swarm,spectator,reentry,grid,bosses,sorties,arsenal,ew,sell,codex,radio,onboard,scars,briefing,endless,buddy,explore,director,debug,types,layout,keys,practice   run only those sections (CI shards them across jobs); default all
import {serve, launch, open, sleep, frames, drawFrames, newWindow, until} from './zlib.mjs';
import {front as campFront, SECTORS as CAMP_SECTORS, modsOf, modName, rankMods, MAP_MODS} from '../games/interceptor/zcampaign.js';
import {SHOP as BOT_SHOP, level as botLevel} from './zbot.mjs';
import {SET as CDX_SET, ORDER as CDX_ORDER, SECRET as CDX_SECRET, cleanCodex, rotate as cdxRotate, scripted as cdxScripted, isAllowed as cdxAllowed, FREE as CDX_FREE} from '../games/interceptor/zcodex.js';
import fs from 'node:fs';
import {timingCheck, CI, installRenderStub} from './browser.mjs';
import {statsOf, tipOf, readGarage, cleanIds, cleanCos, PARTS, LEAGUE, BASE, K as BK, STOCK_IDS, SLOT_KEYS} from '../games/interceptor/zbuddata.js';
import {ARMS, CHASSIS, POWER, ATTACH} from '../src/parts/index.js';
const argv = process.argv.slice(2), SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const {server, origin} = await serve();
const browser = await launch();
let fails = 0;
const ONLY = argv.includes('--only');  // with --balance or --tiers: run just those sections
const SECTIONS = argv.find(a => a.startsWith('--sections='))?.slice(11).split(','), want = n => !ONLY && (!SECTIONS || SECTIONS.includes(n));
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
/* the enemy's roads (zsites.js W.reset) are new at every game start, and a scar keeps clear of them (zscars.js bad): one saved in a run sits where it was valid then, and under the next run's roads it is dropped
   on load (about one start in five for a dozen scars). The sections that save scars and start again pin the roads' seed, so the same ground is valid every time. Called again after a page reload. */
const pinRoads = p => p.evaluate(() => { const W = __z.Z.so.W, r = W.reset; if (!r._pin) { const f = () => r(424242); f._pin = 1; W.reset = f; } });

// --throttle N: CPU throttling on each game page (CDP), e.g. 4, to play a slow CI runner
const THROTTLE = argv.includes('--throttle') ? +argv[argv.indexOf('--throttle') + 1] : 0;
const throttle = async p => { if (THROTTLE > 1) { const s = await p.target().createCDPSession(); await s.send('Emulation.setCPUThrottlingRate', {rate: THROTTLE}); } return p; };
async function page() {
  const errs = [];
  const p = await open(browser, origin + '/games/interceptor/', errs);
  await p.evaluate(() => sessionStorage.setItem('zbossRoster', '0'));  // no random boss events or boss-wave swaps in the plain sections (the bosses section turns them back on)
  await p.evaluate(() => { localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), wx: 'clear'})); });
  await p.reload({waitUntil: 'load'});
  await p.waitForFunction(() => window.__z, {timeout: 60000});
  await frames(p, 5); await drawFrames(p);  // real frames of the menu scene (CI skips draw calls elsewhere: DL_NORENDER)
  await throttle(p);  // after the page is up: a throttled boot only tests the machine
  return {p, errs};
}
// waits are state-driven (the game's own state, or frames drawn), not wall-clock, so a slow machine only makes the run longer
async function play(p) { await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000}); await frames(p, 3); await drawFrames(p, 2); }

// ---------- saves: hand-edited or foreign values must not break the start menu or a game ----------
if (want('saves')) {
  const errs = [], p = await open(browser, origin + '/games/interceptor/', errs), bad = [];
  for (const save of [{gmode: 'z', zdiff: 'x'}, {gmode: 'z', zdiff: 9}, {gmode: 'z', zdiff: 1.5, zbests: 'oops'}, {gmode: 'z', zmusv: 'loud', zname: {a: 1}}, {zsfxv: 'loud', zmusv: {}}, {zsfxv: [1, 2], zmusv: 9},{gmode: 7, wx: 'nope', cam: 'x'},
    {gmode: 'z', zmeta: 'x', zload: 5}, {gmode: 'z', zmeta: {g: [1, 2]}, zload: {doc: 'fortress', kit: 'lure'}}, {gmode: 'z', zmeta: {v: 1, g: {w10: '15', norep: 99, bogus: 3, boss: -1}}, zload: {doc: {}, kit: [null, 'lure', 'lure', 7]}},
    {gmode: 'z', zmeta: null, zload: {doc: 'qm', kit: ['lrack', 'hflak', 'mpads']}}, {gmode: 'z', zmeta: {v: 1, g: {w10: 2, helpers: 1, boss: 4}}, zload: {doc: 'fortress', kit: ['lrack', 'lure', 'mpads', 'toString']}}, {gmode: 'z', zruns: 'x'}, {gmode: 'z', zruns: [{d: 9, w: 'a'}, null, {d: 1, w: 5, doc: 7}, {d: 2, w: 1e9}]},
    {gmode: 'classic', diff: 2, fuse: 'manual', skin: 'strela', guide: 0, guideSw: 3, setV: 4, mod: {tspd: 2, tcnt: 3, bcap: 20000}}]) {  /* an old Classic save, with the Threats panel values */
    const n0 = errs.length;
    await p.evaluate(s => localStorage.setItem('dl-interceptor', JSON.stringify(s)), save); await p.reload({waitUntil: 'load'});
    const up = await p.waitForFunction(() => window.__z, {timeout: 60000}).then(() => true, () => false);  // a page boot is ~10 s on CI's software GL and can stretch past 20 s on a busy runner
    if (up) { await sleep(200); await p.click('#play'); await sleep(300); await p.evaluate(() => { if (__z.G.on) __z.cont(); __z.sim(5); }); }
    if (!up || errs.length > n0) bad.push(JSON.stringify(save) + (up ? '' : ' (page never came up)'));
  }
  ok(!bad.length, 'Saves: odd saved values still load and play' + (bad.length ? '\n  ' + bad.join('\n  ') + '\n  ' + errs.slice(0, 3).join('\n  ') : ''));
  /* a field of view from a hand-edited or foreign pilot profile (the shared droneleague key): the lens stays sane and the reticle in a wave draws (zlock's arc took a negative radius from fov -1 or 1e9) */
  { const fb = [];
    for (const fov of [-1, 1e9, 0, 'x', 5, 400]) { const n0 = errs.length;
      await p.evaluate(f => { localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z'})); localStorage.setItem('droneleague', JSON.stringify({fov: f})); }, fov); await p.reload({waitUntil: 'load'});  /* the pilot profile is the League's key */
      await p.waitForFunction(() => window.__z, {timeout: 60000}); await p.click('#play'); await p.waitForFunction(() => __z.G.state === 'base', {timeout: 30000});
      await p.evaluate(() => __z.cont()); await frames(p, 8);
      const cf = await p.evaluate(() => __z.api.camera.fov); if (!(cf > 1 && cf < 179) || errs.length > n0) fb.push(`fov ${JSON.stringify(fov)}: camera ${cf}${errs.length > n0 ? ' ' + errs.at(-1) : ''}`); }
    await p.evaluate(() => localStorage.removeItem('droneleague'));  /* the profile is shared by every page of this run */
    ok(!fb.length, 'Saves: a field of view of -1, 1e9, 0, text, 5 or 400 is clamped (lens and reticle stay sane)' + (fb.length ? '\n  ' + fb.join('\n  ') : '')); }
  /* Classic is gone: an old Classic save (and ?mode=classic) opens Zombies, there is no mode picker, and the settings only Classic read are dropped */
  await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'classic', diff: 2, fuse: 'manual', skin: 'strela', guide: 0, guideSw: 3, setV: 4, wx: 'clear'})));
  await p.goto(origin + '/games/interceptor/?mode=classic', {waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000});
  const mg = await p.evaluate(() => { const S = __z.api.S; return {gone: ['gmode', 'diff', 'fuse', 'skin', 'guide', 'guideSw'].filter(k => k in S), setV: S.setV, picker: !!document.getElementById('gmode'), play: document.getElementById('play').textContent, zdiff: !!document.getElementById('zdiff')}; });
  ok(!mg.gone.length && mg.setV === 7 && !mg.picker && mg.play === 'Quick defence' && mg.zdiff, `Saves: an old Classic save and ?mode=classic open Zombies, no mode picker (${JSON.stringify(mg)})`);
  await p.evaluate(() => localStorage.removeItem('dl-interceptor')); await p.close();
}

// ---------- Zombies ----------
if (want('zombies')) {
  const {p, errs} = await page();
  ok(await p.$eval('#play', b => b.textContent) === 'Quick defence', 'Zombies: the start button reads Quick defence (the campaign has its own card)');
  ok(await p.evaluate(() => !document.getElementById('zdiff').hidden && document.querySelectorAll('#zdiff button').length === 4 && document.querySelector('#zdiff button.on')?.textContent === 'Normal'), 'Zombies menu: difficulty selector Easy / Normal / Hard / Nightmare, Normal by default');
  ok(await p.evaluate(() => { const pl = document.getElementById('play'), b = pl.getBoundingClientRect(); return document.getElementById('zdiff').nextElementSibling === pl.parentNode && b.top > 0 && b.bottom <= innerHeight; }), 'Zombies menu: the Quick defence / Campaign button row sits right under the difficulty tabs, on screen without scrolling (not below six cards)');
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-menu.png'});
  await p.click('#zdiff button[data-d="3"]'); await p.waitForFunction(() => document.querySelector('#zdiff button.on')?.getAttribute('data-d') === '3', {timeout: 5000}).catch(() => {});
  const dm = await p.evaluate(() => ({on: document.querySelector('#zdiff button.on')?.textContent, desc: document.getElementById('gmdesc').textContent, zd: JSON.parse(localStorage.getItem('dl-interceptor')).zdiff}));
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-menu-nightmare.png'});
  await p.click('#zdiff button[data-d="1"]'); await p.waitForFunction(() => document.querySelector('#zdiff button.on')?.getAttribute('data-d') === '1', {timeout: 5000}).catch(() => {});
  ok(dm.on === 'Nightmare' && dm.zd === 3 && /Nightmare/.test(dm.desc), `Zombies menu: picking Nightmare highlights it, saves it and describes it ("${dm.desc.split('Nightmare: ')[1]?.slice(0, 50)}")`);
  /* the audio context is opened ahead in idle time on the menu (engine/audio.js audioPrime): suspended, and not the game's yet (api.AC stays null, so a menu with no run on it makes no sound); Play adopts it and starts it */
  const au = await p.evaluate(async () => { const A = await import('/engine/audio.js'); for (let i = 0; i < 300 && A.audioPrimed() !== 'suspended'; i++) await new Promise(r => setTimeout(r, 100)); return {primed: A.audioPrimed(), live: !!A.AC, on: A.audioOn()}; });
  ok(au.primed === 'suspended' && !au.live && !au.on, `Zombies audio: the context is built ahead on the menu and waits suspended (${au.primed}), the game's own AC and the engine voices are not live yet (${au.live}/${au.on})`);
  await play(p);
  const au2 = await p.evaluate(async () => { const A = await import('/engine/audio.js'); for (let i = 0; i < 50 && A.AC?.state !== 'running'; i++) await new Promise(r => setTimeout(r, 100)); return {live: !!A.AC, state: A.AC?.state, primed: A.audioPrimed(), on: A.audioOn(), sfx: __z.api.AC === A.AC}; });
  ok(au2.live && au2.state === 'running' && au2.primed === null && au2.on && au2.sfx, `Zombies audio: Play adopts the primed context and starts it (${au2.state}), the motor voices are on, one context`);
  { const out = [];  /* the event feed (top left) never runs under the centred top bar, at a laptop, a 1080p and a short window */
    for (const [w, h] of [[1280, 720], [1920, 1080], [900, 420], [1280, 720]]) {
      await p.setViewport({width: w, height: h});
      await frames(p, 3);
      out.push(await p.evaluate(() => { for (const t of ['Inbound: 4× Shahed-136, 3× Geran-3 jet, 2× decoy, 1× Lancet', 'Wave 13 clear: <span class="cg">+$12,400</span> (perfect defence bonus included)', 'Upkeep: <span class="co">−$800</span>', 'Passed Shahed 14 m off']) __z.api.feed(t);  /* fed in the same tick as the measurement: on a slow CI runner the frames after the resize can outlast the feed's own timeout, and the rows check read 0 */
        const f = document.getElementById('feed').getBoundingClientRect(), b = {left: 1e9, top: 1e9, right: 0, bottom: 0}; for (const c of document.getElementById('zhud').children) { const q = c.getBoundingClientRect(); if (q.width) { b.left = Math.min(b.left, q.left); b.top = Math.min(b.top, q.top); b.right = Math.max(b.right, q.right); b.bottom = Math.max(b.bottom, q.bottom); } }  /* the bar, the site row and a warning: wider than the grid box itself when the window is narrow */
        return {vp: innerWidth + 'x' + innerHeight, hit: f.left < b.right && b.left < f.right && f.top < b.bottom && b.top < f.bottom, feed: [f.left, f.top, f.right, f.bottom].map(Math.round), bar: [b.left, b.top, b.right, b.bottom].map(Math.round), rows: document.getElementById('feed').children.length}; }));
    }
    ok(out.every(r => r.rows >= 3 && !r.hit), `Zombies HUD: the event feed keeps clear of the top bar at 1280x720, 1920x1080 and 900x420 (${out.map(r => r.vp + (r.hit ? ' OVERLAP ' + r.feed + ' / ' + r.bar : ' ok')).join(', ')})`); }
  const s0 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, cash: __z.G.cash, st: __z.G.state, integ: __z.integrity()}));
  ok(s0.base && s0.st === 'base' && s0.cash === 1500, `Zombies: opens on the base screen with $${s0.cash}, integrity ${s0.integ.hp}/${s0.integ.max}`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-1.png'});
  await p.click('#zgo'); await p.waitForFunction(() => __z.G.state === 'wave', {timeout: 10000}).catch(() => {});
  /* a bounty still flying into the counter while the purse is spent (a hardening, a swarm's upkeep): the counter never reads negative */
  const neg = await p.evaluate(() => { const {G, Z, api} = __z, g0 = G.cash; Z.pop(api.player.p.clone(), '+$900', '#3ddc84', 900); G.cash = 40; Z.hud(.016); const t = document.getElementById('zc').textContent; G.pops.length = 0; G.cash = g0; Z.hud(.016); return t; });
  ok(neg === '$0', `Zombies: spending while a bounty is still flying never makes the purse read negative (counter "${neg}")`);
  /* the wave-start siren is one scheduled 10 s bed: leaving the run (Quit to menu, game over) cuts it off */
  const sir = await p.evaluate(() => { const au = __z.Z.au, n0 = au.sirens; au.siren(false); const n1 = au.sirens; au.stopMusic(); return [n0, n1, au.sirens]; });  /* stopMusic is what leaving the run calls (zfx.js Z.stop) */
  ok(sir[0] === 1 && sir[1] === 2 && sir[2] === 0, `Zombies: the wave-start siren (the wave's own, then one more) is cut when the run ends (sirens sounding: ${sir.join(' -> ')})`);
  // wave 1 with a scripted player that runs down every track
  const w1 = await p.evaluate(() => { const out = []; for (let i = 0; i < 400 && __z.G.state === 'wave'; i++) { __z.sim(.5); const pl = __z.api.player; if (pl.dead <= 0 && Math.random() < .5) { const k = __z.botKill(.8); if (k) out.push(k); } } return {out, st: __z.G.state, cash: __z.G.cash, kills: __z.G.kills, streak: __z.G.streak}; });
  ok(w1.kills.p >= 2 && w1.cash > 1500, `Zombies wave 1: scripted player killed ${w1.kills.p} (${w1.out}), cash $${w1.cash}, streak ${w1.streak}`);
  await p.evaluate(() => __z.sim(4));
  const b1 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, st: __z.G.state, wave: __z.G.wave}));
  ok(b1.base && b1.st === 'base' && b1.wave === 1, 'Zombies: wave 1 clear opens the base screen (no timer)');
  // shop: the whole catalogue is listed; buy a drone rack, place it, upgrade it in the Armory, buy a perk
  await p.evaluate(() => { __z.G.cash = 6000; __z.Z.def && document.querySelector('[data-tab="shop"]').click(); });
  const cat = await p.evaluate(() => ({n: __z.G.cards.length, all: Object.keys(__z.ITEMS).filter(k => !__z.ITEMS[k].kit).length, kit: __z.G.cards.filter(c => __z.ITEMS[c.k].kit).length, groups: [...document.querySelectorAll('.ztab .zsec h3')].map(h => h.firstChild.textContent.trim()).join('/'), reroll: !!document.getElementById('zreroll')}));
  ok(cat.n === cat.all && !cat.kit && cat.groups === 'Defences/Supplies/Pilot gear/Perks/Craft' && !cat.reroll, `Shop lists every item but kit (${cat.n}) in the sections ${cat.groups}, no reroll`);
  const bought = await p.evaluate(() => { const i = __z.G.cards.findIndex(c => c.k === 'rack'); if (i < 0) return 'no rack'; document.querySelector(`[data-buy="${i}"]`).click(); return !!document.querySelector('[data-slot]'); });
  ok(bought === true, 'Base: buying the rack card asks for a position');
  await p.keyboard.press('Escape'); const esc1 = await p.evaluate(() => ({menu: __z.api.menuOpen, placing: !!__z.G.placing})); await p.keyboard.press('Escape');
  const esc2 = await p.evaluate(() => ({menu: __z.api.menuOpen, placing: !!__z.G.placing, slots: document.querySelectorAll('[data-slot]').length}));
  ok(esc1.menu && esc1.placing && !esc2.menu && esc2.placing && esc2.slots > 0, 'Base: Esc opens the menu and Esc closes it again with the placement still pending (Cancel backs out of it)');
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
  const {p, errs} = await page();
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
    // kill chance by miss distance at the moment you press detonate (no closing speed): certain inside the 5 m fuse radius, falling off smoothly past it; armor and the fuse perk
    for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0;
    const fall = {}, sh = __z.make('shahed', 0, -1500), hv = __z.make('heavy', 0, -1500); for (const r of [1, 3, 4, 5, 6, 7, 9]) { let k = 0; for (let i = 0; i < 400; i++) if (__z.Z.outcome(sh, r, 0) === 'kill') k++; fall[r] = Math.round(k / 4); }
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
  ok(F[1] === 100 && F[3] === 100 && F[4] === 100 && F[5] === 100 && F[7] > 10 && F[7] < 60 && F[9] <= 5 && ks.every((k, i) => !i || F[k] <= F[ks[i - 1]] + 6), `Detonation timing: kill chance by miss distance ${ks.map(k => `${k} m ${F[k]}%`).join(', ')}`);
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
  const {p, errs} = await page();
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
  ok(Math.abs(P.frozen - .5) < .01 && P.airKills >= 5 && P.leth === 6 && Math.abs(P.aid - .7) < 1e-9 && P.radar === 1.3 && P.mark, `Perks: freeze x${P.frozen}, airstrike ${P.airKills}/6, warhead ${P.leth} m, Foreign Aid repairs x${P.aid}, radar x${P.radar}, mark set`);
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

// ---------- weather and look: per-wave forecasts, every Zombies weather, a mid-wave change, the Strela-2 body ----------
if (want('weather')) {
  const {p, errs} = await page();
  await play(p);
  const r = await p.evaluate(() => { const {api, G, Z} = __z, w = Z.wx, me = api.player, out = {};
    out.strela = me.strela.visible && !me.dart && !!me.nozzle;
    out.forecast = /visibility/.test(document.querySelector('#zbase .zfc')?.textContent || '');  /* the forecast is the .zfc section now: the panel's footer is the sticky Undo / Start wave bar */
    out.ids = [...new Set(Array.from({length: 80}, (_, i) => w.plan(8 + i % 10).id))].sort().join(',');
    out.early = [...new Set(Array.from({length: 40}, () => w.plan(1).id))].sort().join(',');
    __z.cont(); out.bad = Object.keys(w.T).filter(id => { w.set(id); __z.sim(.5); return api.WX.id !== id || !api.WX.z; }).join(',');
    w.start({id: 'rain', to: 'storm', why: 'storm building', at: G.wt + 1, dur: 4}); const wbs = [api.WB.length()];
    for (let i = 0; i < 70; i++) { __z.sim(.1); wbs.push(api.WB.length()); if (i === 29) out.mid = {n: api.WX.n, mix: !!api.WX.mix}; }
    out.end = {id: api.WX.id, mix: !!api.WX.mix, done: w.cur.done};
    out.wb = {last: wbs[wbs.length - 1], step: Math.max(...wbs.slice(1).map((v, i) => Math.abs(v - wbs[i])))};  /* the base wind vector: biggest change in 0.1 s */
    return out; });
  ok(r.strela, 'Look: Zombies flies the Strela-2 body, with a nozzle attach point');
  ok(r.forecast, 'Weather: the base screen shows the next wave\'s forecast');
  ok(r.ids.split(',').length >= 9, `Weather: forecasts vary from wave to wave (${r.ids})`);
  ok(!/night|storm|snow|fog|dust/.test(r.early), `Weather: wave 1 stays gentle (${r.early})`);
  ok(!r.bad, 'Weather: every Zombies weather applies' + (r.bad ? ` (failed: ${r.bad})` : ''));
  ok(r.mid.mix && r.end.id === 'storm' && !r.end.mix && r.end.done, `Weather: mid-wave change blends (${r.mid.n}) and ends on the new weather (${r.end.id})`);
  ok(r.wb.step < .5 && Math.abs(r.wb.last - 17 * .95) < .05, `Weather: the wind ramps along with the blend, no jump at its end (biggest change in 0.1 s ${r.wb.step.toFixed(2)} m/s, ends at ${r.wb.last.toFixed(2)})`);
  ok(!errs.length, 'Weather: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- doctrine & unlocks (zmeta.js), late-game sinks, difficulty tactics ----------
if (want('meta')) {
  const {p, errs} = await page();
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
  const {p, errs} = await page();
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
  const {p, errs} = await page();
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
  const {p, errs} = await page();
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
  const {p, errs} = await page();
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
  const bat = await p.evaluate(() => { const {api, G, Z} = __z, me = api.player, V = api.THREE.Vector3, out = {tuned: api.S.mod.bcap};
    const run = perk => { G.perks.battery = perk; Z.pk.apply(); api.launch(); const cap = api.BCAP, h = new V(0, api.gh(0, 0) + 800, 0); let t = 0;
      dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW'})); while (me.mah < cap && t < 3000) { api.step(1 / 60); t += 1 / 60; me.p.copy(h); me.v.set(0, 0, 0); me.q.identity(); me.w.set(0, 0, 0); }
      dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyW'})); return {cap, t: Math.round(t)}; };
    out.base = run(0); out.perk = run(1); G.perks.battery = 0; Z.pk.apply(); api.launch(); return out; });
  console.log('  battery:', JSON.stringify(bat));
  ok(bat.base.cap === bat.tuned * 1.6 && bat.perk.cap === bat.base.cap * 2, `Battery: Zombies pack ${bat.base.cap} mAh (the mod panel's ${bat.tuned}), Better battery ${bat.perk.cap} mAh`);
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
  // back to the menu: the pack is the tuned one again
  const cls = await p.evaluate(() => { __z.api.startDemo(); return {cap: __z.api.BCAP, mod: __z.api.S.mod.bcap, panel: document.getElementById('zsw').hidden}; });
  ok(cls.cap === cls.mod && cls.panel, `Menu: battery back to ${cls.cap} mAh, swarm panel hidden`);
  ok(!errs.length, 'Swarm / lock / battery: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- spatial grid (grid.js): every query gives what a plain loop over TH gives (random scenes); a whole wave with the helpers, the
// swarm, lock-on, the fuse and direct hits ends exactly the same with the grid and with plain loops (grid.brute), same seed and clock ----------
if (want('grid')) {
  const {p, errs} = await page();
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
      const me = api.player, dir = new V(), h = 1 / 120; let shots = 0, dets = 0, was = true, swMax = 0;
      for (let i = 0; i < 120 * 80 && G.state === 'wave'; i++) {
        if (me.dead <= 0) { const t = Z.urgent(); if (t) { dir.copy(t.v).normalize(); me.p.copy(t.p).addScaledVector(dir, -(4 + 26 * Math.sin(i / 40) ** 2)).add(new V(2, 1, 0)); me.v.copy(t.v); cam.position.copy(me.p); cam.lookAt(t.p); cam.updateMatrixWorld(); } }
        else if (i % 120 === 0) api.launch();
        if (i === 1800) Z.sw.command('screen'); if (i === 3000) Z.sw.command('strike');
        api.step(h); T += 1000 / 120; shots = Math.max(shots, Z.def.shots.length); swMax = Math.max(swMax, Z.sw.drones.length); if (was && me.dead > 0) dets++; was = me.dead <= 0;
        if (i % 12 === 11) api.visuals(h * 12, T); }
      const r = x => Math.round(x * 1e6) / 1e6, P = v => [r(v.x), r(v.y), r(v.z)];
      return JSON.stringify({st: G.state, w: G.wave, k: G.kills, cash: r(G.cash), earned: r(G.earned), sites: api.SITES.map(q => r(q.hp)), dets, shots, lock: Z.lk.t?.id || 0, sel: api.selT()?.id || 0,
        th: api.TH.map(t => [t.id, t.st, ...P(t.p), t.claim ? 1 : 0]), sh: Z.def.shots.map(q => [q.id, ...P(q.p)]), sw: Z.sw.drones.map(d => [d.st, ...P(d.p)]), swMax, swLost: Z.sw.mine.lost | 0, swKills: Z.sw.mine.kills | 0, me: [...P(me.p), r(me.dead)], rnd: Math.random()});
    } finally { performance.now = pn; api.grid.brute = false; } };
  const game = async brute => { const errs = [], p = await open(browser, 'about:blank', errs);
    await p.evaluateOnNewDocument(() => { let s = 4242; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; });
    await p.goto(origin + '/games/interceptor/', {waitUntil: 'load'}); await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0})));
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000});
    /* both pages start the game in the same state: the menu's idle work (the textures and pools, the scars' build, the shader warm-up) is done on each. Mid-way it is not: the scars exist or do not (a destroyed house lifts its collider), and how far it had got when the game started was a matter of timing */
    await p.waitForFunction(() => { const w = __z.Z.warmSt; return __z.Z.sc.ready && w.done && !w.idle.left; }, {timeout: 180000, polling: 200});
    const o = await p.evaluate(RUN, brute); await p.close(); return {o, errs}; };
  const A = await game(false), B = await game(true), a = JSON.parse(A.o), b = JSON.parse(B.o);
  console.log(`  grid game: wave ${a.w} ${a.st}, ${a.k.p} pilot / ${a.k.h} helper kills, ${a.dets} bursts, ${a.th.length} tracks, up to ${a.shots} shots, swarm ${a.swMax} up, ${a.swLost} lost, ${a.swKills} kills, ${a.sw.length} left`);
  /* the swarm counts if it flew this wave: its attack passes lose drones on the dice, so how many are left at the end is luck (all six can go) */
  ok(a.k.p + a.k.h >= 10 && a.dets > 3 && a.swMax > 0, `Grid game: busy enough to mean something (${a.k.p + a.k.h} kills, ${a.dets} bursts, swarm of ${a.swMax} flew)`);
  const gd = A.o === B.o ? -1 : [...A.o].findIndex((c, i) => c !== B.o[i]);  /* where the two end states first differ */
  ok(A.o === B.o, `Grid: a whole wave plays out identically with the grid and with plain loops (${A.o.length} chars of end state compared)` + (A.o === B.o ? '' : `\n  first difference at ${gd}\n  grid ${A.o.slice(Math.max(0, gd - 120), gd + 180)}\n  loop ${B.o.slice(Math.max(0, gd - 120), gd + 180)}`));
  ok(!A.errs.length && !B.errs.length, 'Grid game: no errors' + (A.errs.length + B.errs.length ? '\n  ' + [...A.errs, ...B.errs].join('\n  ') : ''));
}

// ---------- boss roster (zbosses.js + zboss-*.js): the registry and spawn rules, then every boss through the debug trigger: its intro, its
// code-built model with canvas decals, its sounds, its phases, beaten by the bot pilots' real burst path, its reward granted and recorded;
// the special mechanics one by one (the Ace's learning, lock and record, the Ghost of the Ace chain, the Jammer King's reveal and hunt, the
// Twins' link, the Juggernaut's weak points, the Hive's split, the Mirror's habits, the Undertaker's drain and growth, the Siren's false IFF,
// the Puppeteer's wires and trails) ----------
if (want('bosses')) {
  const {p, errs} = await page();
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); delete s.zboss; localStorage.setItem('dl-interceptor', JSON.stringify({...s, zwx: 'menu'})); sessionStorage.setItem('zbossRoster', '1'); sessionStorage.setItem('zcodex', 'all'); });  /* the whole roster: every boss unlocked and allowed (zcodex.js) */
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
  ok(['ace', 'gace', 'jammer', 'twins', 'jugg', 'ghost', 'hive', 'mirror', 'undertaker', 'siren', 'puppet', 'hush'].every(k => reg.ids.includes(k)) && reg.kinds && reg.rewards >= 12, `Registry: ${reg.ids.length} bosses registered with registerBoss, each a KIND with ${reg.rewards} rewards`);
  ok(reg.w10.join() === 'boss' && reg.pool.length >= 4 && reg.pool.includes('boss'), `Boss waves: wave 10 is the Mothership; wave 30 draws from ${reg.pool.length} bosses`);
  ok(reg.ev.length === 1 && reg.ev30 === 1 && reg.ev28 === 0 && reg.force, `Events: one rare boss on wave 27 (${reg.ev}), none on a boss wave, none the next wave (3 apart); force() puts one in the next plan`);
  // every boss: debug trigger, intro, model with canvas decals, sounds, phases, beaten through the real burst path, reward, record
  const ids = ['twins', 'jugg', 'ghost', 'hive', 'mirror', 'siren', 'jammer', 'hush'];
  const runs = await p.evaluate(ids => { const {api, Z, G} = __z, out = {};
    G.hab = {n: 400, alt: 300 * 400, spd: 90 * 400, L: 300, R: 100, asp: {'LEVEL SIX': 9, 'HIGH BEAM': 2}, side: {LEFT: 6, RIGHT: 5}, dets: 0, yaw: null, t: 0};  /* habits for the Mirror to copy */
    for (const id of ids) { __b.clear(); api.player.v.set(0, 0, -40); const t = Z.bosses.spawn(id), D = Z.bosses.BOSSES[id]; __z.sim(3);
      const o = {intro: !!t.bs.intro, decals: __b.decals(t), sound: typeof D.sting === 'function' && typeof D.loop === 'function', max: t.bs.max, phases: D.phases?.length || 1, net: Z.bossOut(t).every(v => Number.isFinite(v) || typeof v === 'string')};  /* numbers, and the odd string (a pilot's key, the Mirror's favourite approach): never NaN or undefined */
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
  // the Hush: near-total darkness while it lives and exactly the weather's after; radar and thermal go to static for it while ordinary drones keep a faint
  // presence; the reveal windows (the flare and the moment after a pass) and nothing hurts it outside them; the sound (HRTF panner, doppler, whoosh, wind-shear,
  // creak) under its gain cap; the audio-assist cue (off by default); co-op sync; the bots' hearing; nothing left behind
  const hs1 = await p.evaluate(async () => { __b.clear(); const {api, Z, G} = __z, A = Z.atmos, snd = await import('./zhush-snd.js'), cm = await import('./zhush-cue.js'), out = {};
    const wx = () => { const f = api.scene.fog; return {near: f.near, far: f.far, col: f.color.getHex(), sun: api.sun.intensity, hemi: api.hemi.intensity}; }; window.__hsW0 = wx();
    A.clear(); __z.sim(.2); const o1 = Z.make('shahed', api.PADP.x + 200, api.PADP.z - 700); o1.p.y = api.gh(o1.p.x, o1.p.z) + 300; const rk0 = Z.radarK(); window.__hsRk = rk0; out.seen0 = Z.seen(o1); out.off = A.state();
    const t = Z.bosses.spawn('hush'); window.__hsT = t; const me = api.player; me.v.set(0, 0, 0);
    for (let i = 0; i < 80; i++) { api.camera.position.copy(me.p); api.camera.updateMatrixWorld(); __z.sim(.1); }
    out.intro = !!t.bs.intro; const pr = A.probe(), st = A.state(), W0 = window.__hsW0; out.dark = {dark: st.dark, light: st.light, on: st.on, pass: st.pass, sources: st.sources, sun: +(pr.sun / W0.sun).toFixed(2), hemi: +(pr.hemi / W0.hemi).toFixed(2)};
    out.radar = {seen: Z.seen(t), hid: Z.hid(t), other: Z.seen(o1), rk: +(Z.radarK() / rk0).toFixed(2)}; o1.st = 'dead';
    out.fx = Z.bosses.fx(); const V = snd.live()[0]; out.voice = V ? {n: snd.voices(), model: V.pan.panningModel, dist: V.pan.distanceModel, ref: V.pan.refDistance, peak: +V.peak.toFixed(3), cap: V.cap} : null;
    // the windows: until four passes have run, with the pilot out of the way (down, so nothing it flies near can burst it): the reveal and the after-pass window per pass,
    // the voice levels against the cap, the panner on the boss
    const RV = [], AF = []; let cr = 0, ca = 0; const mx = {hum: 0, blade: 0, whoosh: 0, shear: 0, creak: 0, now: 0}; let panErr = 0;
    const hov = {x: me.p.x, y: me.p.y + 120, z: me.p.z}, down = () => { api.player.dead = 1e9; api.camera.position.copy(api.player.p); api.camera.updateMatrixWorld(); };
    t.bs.age = 0;  /* (a short pass at a near site can end while its flare still burns: the two windows are counted on their own) */
    for (let i = 0; i < 3000 && !(AF.length >= 4 && RV.length >= 4); i++) { down(); __z.sim(.1); const B = t.bs; if (i % 1000 === 999) B.age = 0;  /* until four passes have run (how long that takes depends on which sites it picks), not for a fixed time */

      if (B.rv > 0) cr += .1; else if (cr) { RV.push(+cr.toFixed(1)); cr = 0; } if (B.af > 0) ca += .1; else if (ca) { AF.push(+ca.toFixed(1)); ca = 0; }
      const v = snd.live()[0]; if (v) { for (const q in mx) mx[q] = Math.max(mx[q], q === 'now' ? v.now() : v.lvl[q]); panErr = Math.max(panErr, Math.abs(v.pan.positionX.value - t.p.x) + Math.abs(v.pan.positionZ.value - t.p.z)); } if (t.st === 'dead') break; }
    out.rv = RV; out.af = AF; out.passes = t.bs.ps | 0;
    out.mx = Object.fromEntries(Object.entries(mx).map(([k, v]) => [k, +v.toFixed(3)])); out.panErr = Math.round(panErr); out.caps = {sum: +(cm.GAIN.hum + cm.GAIN.blade + cm.GAIN.whoosh + cm.GAIN.shear + cm.GAIN.creak).toFixed(3), cap: cm.CAP};
    out.alive = t.st !== 'dead'; out.hp = t.bs.hp; t.bs.age = 0;
    // a pass at a site strikes it (the next target forced to a site, the pilot still down)
    { const hp0 = api.SITES.reduce((a, s) => a + s.hp, 0), r0 = Math.random, ps0 = t.bs.ps; Math.random = () => .9; t.bs.md = 0; t.bs.tm = 0; t.bs.af = 0;
      try { for (let i = 0; i < 500 && t.bs.ps === ps0; i++) { down(); __z.sim(.1); } for (let i = 0; i < 40; i++) { down(); __z.sim(.1); } } finally { Math.random = r0; }
      out.siteHit = Math.round(hp0 - api.SITES.reduce((a, s) => a + s.hp, 0)); out.siteTg = t.bs.tg; }
    // a pass at you in the air clips your interceptor: the pilot hovers 120 m up until it is lost (nothing else is near it; it is not relaunched in time to burst the boss)
    { api.launch(); t.bs.age = 0; out.clipped = false; for (let i = 0; i < 2500; i++) { api.player.p.set(hov.x, hov.y, hov.z); api.player.v.set(0, 0, 0); api.camera.position.copy(api.player.p); __z.sim(.1); if (api.player.dead > 0) { out.clipped = true; out.clipAt = i / 10; break; } } }
    out.hp2 = t.bs.hp; if (api.player.dead > 0) api.launch(); __z.sim(.2); return out; });
  console.log('  hush:', JSON.stringify({dark: hs1.dark, radar: hs1.radar, rv: hs1.rv, af: hs1.af, mx: hs1.mx, clipped: hs1.clipped, siteHit: hs1.siteHit}));
  ok(hs1.off.sources === 0 && !hs1.off.on && hs1.intro && hs1.dark.on && hs1.dark.pass && hs1.dark.dark >= .7 && hs1.dark.light <= .15 && hs1.dark.sun <= .15 && hs1.dark.hemi <= .15,
    `Hush: its arrival drops the atmosphere to near-total darkness (dark ${hs1.dark.dark}, light ${hs1.dark.light}, the scene drawn at sun x${hs1.dark.sun} / sky x${hs1.dark.hemi}), through the atmosphere layer`);
  ok(!hs1.radar.seen && hs1.radar.hid && hs1.seen0 && hs1.radar.other && hs1.radar.rk >= .8 && hs1.radar.rk < 1, `Hush: no radar track and no bracket for it; an ordinary drone keeps a faint presence (still on the scope, range x${hs1.radar.rk})`);
  ok(hs1.rv.length >= 3 && hs1.af.length >= 3 && hs1.rv.every(n => n >= 1.5 && n <= 3.1) && hs1.af.every(n => n >= 1.5 && n <= 3.5) && hs1.passes >= 3 && hs1.clipped && hs1.siteHit > 0, `Hush: the reveal windows exist: ${hs1.rv.length} flares (${hs1.rv.join(', ')} s) and ${hs1.af.length} after-pass windows (${hs1.af.join(', ')} s) over ${hs1.passes} passes; a pass at your hovering interceptor clipped it after ${hs1.clipAt} s and a pass at a site struck it for ${hs1.siteHit}`);
  ok(hs1.voice && hs1.voice.n === 1 && hs1.voice.model === 'HRTF' && hs1.voice.dist === 'inverse' && hs1.panErr < 60, `Hush: one spatial voice, an HRTF panner with distance rolloff, tracking the boss (within ${hs1.panErr} m)`);
  ok(hs1.mx.hum > .02 && hs1.mx.whoosh > .02 && hs1.mx.creak > .02 && hs1.mx.shear > 0 && hs1.mx.now <= hs1.caps.cap && hs1.voice.peak <= hs1.caps.cap && hs1.caps.sum <= hs1.caps.cap,
    `Hush: hum, whoosh, wind-shear and creak all played (peaks ${JSON.stringify(hs1.mx)}); the voices never add up past the gain cap ${hs1.caps.cap} (nominal ${hs1.caps.sum})`);
  // the thermal camera (H): static for it, the picture fills with noise; ordinary drones are still there. The boss is held in its circling (no passes can clip the pilot
  // or kill the camera feed) and the pilot is alive in the FPV camera; every toggle waits on the state, polled (the feed switches in the draw loop, slow on CI)
  await p.evaluate(() => { const {api} = __z, B = __hsT.bs; B.md = 0; B.tm = 1e9; B.rv = B.af = 0; B.age = 0; if (api.player.dead > 0) api.launch(); __z.sim(.2); });
  const feed = async want => { for (let k = 0; k < 3; k++) { if (await p.evaluate(w => __z.api.thermLook === w, want)) return true; await p.keyboard.press('KeyH'); if (await until(() => p.evaluate(w => __z.api.thermLook === w, want), {timeout: 30000, every: 100})) return true; } return false; };
  const hsOn = await feed(true);
  const hsT = await p.evaluate(() => { const {api, Z} = __z, t = __hsT, o = Z.make('shahed', api.PADP.x + 200, api.PADP.z - 700); o.p.y = api.gh(o.p.x, o.p.z) + 300; __z.sim(3); const r = {therm: api.thermLook, noise: Z.atmos.state().noise, hull: t.mesh.visible, seen: Z.seen(t), other: Z.seen(o), flare: t.mesh.userData.core.visible, dead: api.player.dead, cam: api.camMode, cine: !!Z.cine}; o.st = 'dead'; return r; });
  const hsOff = await feed(false);
  const hsT2 = await p.evaluate(() => { const {api, Z} = __z, t = __hsT; __z.sim(3); return {therm: api.thermLook, noise: Z.atmos.state().noise, hull: t.mesh.visible}; });
  console.log('  hush thermal:', JSON.stringify([hsT, hsT2]));
  ok(hsOn && hsOff && hsT.therm && hsT.noise >= .1 && !hsT.hull && !hsT.flare && !hsT.seen && hsT.other && !hsT2.therm && hsT2.noise === 0 && hsT2.hull, `Hush: thermal goes to static for it (picture noise ${hsT.noise} on the thermal camera, none on the day camera; hull and flare gone from it) while ordinary drones still show`);
  const hs2 = await p.evaluate(async () => { const {api, Z, G} = __z, D = Z.bosses.BOSSES.hush, C = Z.bosses.ctx, t = __hsT, B = t.bs, cm = await import('./zhush-cue.js'), out = {};
    const rec = () => { let n = 0; return {get n() { return n; }, oc: new Proxy({}, {get: (o, k) => k in o ? o[k] : (...a) => { n++; }, set: (o, k, v) => { o[k] = v; return true; }})}; };
    const me = api.player; if (me.dead > 0) api.launch(); me.p.set(0, api.gh(0, 600) + 300, 600); me.v.set(0, 0, 0); api.camera.position.copy(me.p); api.camera.quaternion.identity(); api.camera.updateMatrixWorld();
    t.p.set(300, me.p.y, 600); t.v.set(-120, 0, 0); B.md = 2; B.rv = 2; B.af = 0;
    // the radar scope: static, heavier near it
    { const r = rec(); D.radar(C, r.oc, null, t); out.radarN = r.n; }
    // audio assist: off by default, nothing drawn; on, a faint cue; far away (inaudible), nothing
    out.assist0 = api.S.zassist ?? 0; { const r = rec(); D.overlay(C, r.oc, t, 1280, 720); out.assistOff = r.n; }
    api.S.zassist = 1; { const r = rec(); D.overlay(C, r.oc, t, 1280, 720); out.assistOn = r.n; } const p0 = t.p.clone(); t.p.set(400000, me.p.y, 600); { const r = rec(); D.overlay(C, r.oc, t, 1280, 720); out.assistFar = r.n; } t.p.copy(p0); delete api.S.zassist;
    const sel = document.getElementById('f_zassist'); out.ui = !!sel && sel.value === '0' && getComputedStyle(sel).display !== 'none' && /Hush audio assist/.test(sel.previousElementSibling?.textContent || '');
    if (sel) { sel.value = '1'; sel.dispatchEvent(new Event('input')); out.saved = JSON.parse(localStorage.getItem('dl-interceptor')).zassist === 1 && api.S.zassist === 1; sel.value = '0'; sel.dispatchEvent(new Event('input')); out.back = api.S.zassist === 0; }
    // the sound picture: doppler, whoosh rising as it closes and falling after, panning, distance, shear on a bank, creak in the windup only, silence between passes in the last phase
    const L = {p: {x: 0, y: 0, z: 0}, v: {x: 0, y: 0, z: 0}, f: {x: 0, y: 0, z: -1}, u: {x: 0, y: 1, z: 0}}, bs = (x, vz, md = 2, ph = 0, yr = 0, wf = 0, z = -500) => ({p: {x, y: 0, z}, v: {x: 0, y: 0, z: vz}, md, ph, yr, wf}), cue = b => ({...cm.cue({}, b, L)});
    const ap = cue(bs(0, 150)), re = cue(bs(0, -150)), rt = cue(bs(300, 0, 0)), lf = cue(bs(-300, 0, 0)), far = cue(bs(0, 150, 2, 0, 0, 0, -3000)), bank = cue(bs(0, 150, 2, 0, .6)), wind = cue(bs(0, 0, 1, 0, 0, 1)), idle = cue(bs(0, 0, 0)), quiet = cue(bs(0, 0, 0, 2));
    out.cue = {dop: [+ap.dop.toFixed(2), +re.dop.toFixed(2)], cs: [Math.round(ap.cs), Math.round(re.cs)], whoosh: [+ap.whoosh.toFixed(3), +re.whoosh.toFixed(3)], sweep: [+ap.sweep.toFixed(2), +re.sweep.toFixed(2)], az: [+rt.az.toFixed(2), +lf.az.toFixed(2)], loud: [+ap.loud.toFixed(2), +far.loud.toFixed(2)], shear: [+bank.shear.toFixed(3), +cue(bs(0, 150)).shear.toFixed(3)], creak: [+wind.creak.toFixed(3), idle.creak], hum: [+idle.hum.toFixed(3), +quiet.hum.toFixed(3)]};
    // what a client computes from the synced track and the extras
    const t2 = {bs: {ph: B.ph}}; D.netIn(C, t2, D.netOut(C, t)); const bsOf = (x, b) => ({p: x.p, v: x.v, yr: 0, md: b.md, wf: b.wf, ph: b.ph});
    out.net = ['md', 'rv', 'af', 'ps', 'wf'].every(k => Math.abs((t2.bs[k] || 0) - (B[k] || 0)) < .06) && D.netOut(C, t).every(Number.isFinite); out.netCue = Math.abs(cue(bsOf(t, B)).loud - cue(bsOf(t, t2.bs)).loud) < .01;
    // the bots hear what the speakers play; the tells (flare, the moment after, the creak) have their attention
    const h = o => D.hear(C, t, me)[o]; B.md = 2; B.rv = 2; const open = h('attn'), loud = h('loud'); B.rv = 0; B.af = 0; B.md = 0; const idle2 = h('attn'); B.md = 1; const creak = h('attn'); B.md = 2;
    out.ear = {open: +open.toFixed(2), creak: +creak.toFixed(2), idle: +idle2.toFixed(2), loud: +loud.toFixed(2)};
    let a1 = 0, a2 = 0; B.rv = 2; for (let i = 0; i < 300; i++) if (D.aim(C, t, 1)) a1++; B.rv = 0; B.af = 0; for (let i = 0; i < 300; i++) if (D.aim(C, t, 1)) a2++; out.aim = [a1, a2];
    // nothing hurts it outside the flare and the moment after a pass; a hit inside snaps the windows shut
    const hv = (q, rv, af) => { B.rv = rv; B.af = af; const k = {q, txt: ''}; return [D.hit(C, t, k), k.txt]; }; const k0 = hv('kill', 0, 0); out.hit = [k0[0], hv('kill', 1, 0)[0], hv('damage', 0, 1)[0], hv('damage', 0, 0)[0]]; out.txt = /NO CONTACT/.test(k0[1]);
    const hp0 = B.hp; B.rv = B.af = 0; Z.bosses.hitAt(t, 'kill', t.p.clone()); out.closedHp = B.hp - hp0; B.rv = 1.5; B.md = 2; Z.bosses.hitAt(t, 'kill', t.p.clone()); out.openHp = B.hp - hp0; out.shut = B.rv === 0 && B.af === 0 && B.md === 0; out.ph = B.ph;
    return out; });
  console.log('  hush:', JSON.stringify(hs2));
  ok(hs2.radarN >= 24 && hs2.assist0 === 0 && hs2.assistOff === 0 && hs2.assistOn > 0 && hs2.assistFar === 0 && hs2.ui && hs2.saved && hs2.back, `Hush: radar static for it (${hs2.radarN} specks); the audio-assist cue is off by default (nothing drawn), on in the settings it draws a faint cue (${hs2.assistOn} calls), none when it is out of earshot`);
  { const c = hs2.cue; ok(c.dop[0] > 1.1 && c.dop[1] < .9 && c.cs[0] > 100 && c.cs[1] < -100 && c.whoosh[0] > c.whoosh[1] && c.sweep[0] > c.sweep[1] && c.az[0] > 0 && c.az[1] < 0 && c.loud[0] > c.loud[1] && c.shear[0] > 0 && c.shear[1] === 0 && c.creak[0] > 0 && c.creak[1] === 0 && c.hum[0] > c.hum[1] * 3,
    'Hush: the sound picture: doppler up as it closes and down as it leaves, the whoosh louder and brighter approaching, panned to the side it is on, quieter far away, wind-shear only when it banks, the creak only in the windup, the engine cut in the last phase ' + JSON.stringify(c)); }
  ok(hs2.net && hs2.netCue, 'Hush: co-op: the pass state rides on the snapshot extras and a client computes the same sound picture from the synced position');
  ok(hs2.ear.open > .1 && hs2.ear.open > 3 * hs2.ear.idle && hs2.ear.creak > hs2.ear.idle && hs2.aim[0] > 60 && hs2.aim[1] < 75, `Hush: the bots hear what the speakers play: attention ${hs2.ear.open} on the flare, ${hs2.ear.creak} on the creak, ${hs2.ear.idle} idle; its aim finds it ${hs2.aim[0]}/300 open and ${hs2.aim[1]}/300 closed`);
  ok(hs2.hit[0] === 0 && hs2.hit[1] === 2 && hs2.hit[2] === 1 && hs2.hit[3] === 0 && hs2.txt && hs2.closedHp === 0 && hs2.openHp === -2 && hs2.shut && hs2.ph === 1, 'Hush: a burst outside the flare and the after-pass window finds nothing; inside, a direct hit does 2 and snaps the windows shut (and moves it to HUSH)');
  // what is drawn and heard each frame (the Hush's and the Jammer King's radar static, the creak's pitch) is on its own stream: the frames drawn never move the game's Math.random
  const hr = await p.evaluate(async () => { const {Z, api} = __z, C = Z.bosses.ctx, t = __hsT, snd = await import('./zhush-snd.js'), V = snd.live()[0], R0 = Math.random, rc = document.createElement('canvas').getContext('2d'), P = (x, z) => [250 + x / 40, 250 + z / 40];
    const E = Z.ew.E, e0 = [E.on, E.neff]; let n = 0, calls = 0, ink = 0; Math.random = () => { n++; return R0(); };
    try { for (let i = 0; i < 5; i++) { Z.bosses.BOSSES.hush.radar(C, rc, P, t); calls++; }
      if (V) { const b = {p: t.p, v: t.v, yr: .5, md: 1, wf: .6, ph: 1}, me = {p: api.camera.position, v: api.player.v, f: new C.V3(0, 0, -1), u: new C.V3(0, 1, 0)}; for (let i = 0; i < 5; i++) { if (V.set(b, me)?.creak > 0) ink++; } }
      E.on = true; E.neff = .9; for (let i = 0; i < 5; i++) { Z.bosses.BOSSES.jammer.radar(C, rc, P, {bs: {}, p: new C.V3()}); calls++; } } finally { Math.random = R0; E.on = e0[0]; E.neff = e0[1]; }
    return {n, calls, ink, voice: !!V}; });
  ok(hr.n === 0 && hr.calls === 10 && hr.voice && hr.ink === 5, `Boss draws: the Hush's radar static, its creak (${hr.ink} of 5 updates sounding) and the Jammer King's radar static used ${hr.n} Math.random calls over ${hr.calls} radar draws`);
  // the wave ends: darkness, radar, thermal, the voice, the listener all back exactly
  await until(() => p.evaluate(() => { const f = __z.api.scene.fog, W = window.__hsW0; return !__z.api.thermLook && f.near === W.near && f.far === W.far && f.color.getHex() === W.col; }), {timeout: 30000, every: 100});  /* the day look is back and the fog is the weather's again (the draw loop did it), only then compare */
  const hs3 = await p.evaluate(async () => { const {api, Z, G} = __z, snd = await import('./zhush-snd.js'), A = Z.atmos, out = {}, W0 = window.__hsW0, V = snd.live()[0];
    const wx = () => { const f = api.scene.fog; return {near: f.near, far: f.far, col: f.color.getHex(), sun: api.sun.intensity, hemi: api.hemi.intensity}; }, same = (a, b) => ['near', 'far', 'col', 'sun', 'hemi'].filter(k => a[k] !== b[k]);
    out.therm = api.thermLook; out.during = {voices: snd.voices(), dark: A.state().dark, grade: A.state().pass}; const aud = await import('/engine/audio.js');
    G.wq.length = 0; for (const u of api.TH) u.st = 'dead'; G.state = 'clear'; G.clearT = 3; __z.sim(.5);
    const pr = A.probe(), st = A.state(), l = aud.AC?.listener; out.after = {voices: snd.voices(), now: V ? V.now() : 0, on: st.on, pass: st.pass, sources: st.sources, dark: st.dark, noise: st.noise}; out.fx = Z.bosses.fx(); out.rk = +(Z.radarK() / window.__hsRk).toFixed(2);
    out.diff = [...same(W0, wx()), ...same(W0, {near: pr.fogNear, far: pr.fogFar, col: pr.fogCol, sun: pr.sun, hemi: pr.hemi})]; out.lis = l && l.positionX ? [l.positionX.value, l.positionY.value, l.positionZ.value, l.forwardZ.value, l.upY.value] : null;
    __z.sim(4); if (G.state === 'base') G.bkeep = {}; __z.cont(); __b.clear(); return out; });
  ok(!hs3.therm && !hs3.after.voices && !hs3.after.now && !hs3.after.on && !hs3.after.pass && !hs3.after.sources && !hs3.after.dark && !hs3.after.noise && hs3.rk === 1 && !hs3.diff.length && Object.values(hs3.fx).every(v => !v) && (!hs3.lis || hs3.lis.join() === '0,0,0,-1,1'),
    'Hush: after the wave the darkness, the static, the voice and the listener are back exactly (fog, fog colour and light the weather\'s own; radar range x1; no sound left) ' + JSON.stringify({therm: hs3.therm, after: hs3.after, diff: hs3.diff, rk: hs3.rk, lis: hs3.lis, fx: Object.entries(hs3.fx).filter(([, v]) => v).map(([k]) => k)}));
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
  { const A = ['gace', 'jammer', 'ghost', 'hive', 'jugg', 'undertaker', 'hush'].map(k => [k, ends[k].atm]);
    ok(A.every(([, a]) => a && a.grade && (a.fog < .9 || a.light < .9)) && /shadows=1/.test(ends.mothership.during), 'Atmosphere: while they live the battlefield changes (fog / light: ' + A.map(([k, a]) => k + ' ' + (a ? a.fog + ' / ' + a.light : 'off')).join(', ') + '; the grade on; the Mothership casts its shadow); after the wave the fog, its colour and the light are the weather\'s again, exactly'); }
  await p.evaluate(() => { document.getElementById('zover').hidden = true; __z.api.startDemo(); }); await play(p);
  await p.evaluate(() => { const {G} = __z; G.cash = 1e5; __z.jump(24); G.next = __z.plan(24); __z.cont(); __b.clear(); __z.sim(.3); });
  // bots know the roster; HUD boss bar; the menu has none
  const bb = await p.evaluate(async () => { const brain = await import('./zbotbrain.js'); return {hook: brain.hooks.some(h => h.name === 'bosses')}; });
  const {LEVELS} = await import('./zbot.mjs'), {bossBrain} = await import('../games/interceptor/zboss-brain.js');
  ok(bb.hook && typeof bossBrain.wave === 'function' && LEVELS.length === 6, 'Bots: the boss roster rides on the shared bot brain (zbotbrain.js hook: benchmark runs at bosses, the Undertaker starved at the base screen)');
  await p.evaluate(() => { __b.clear(); __z.Z.bosses.spawn('hive'); __z.sim(2); }); await drawFrames(p, 4);
  const bar = await p.evaluate(() => { __z.Z.hud(1 / 60); const b = document.getElementById('zbb'); return {on: !b.hidden, txt: b.textContent.slice(0, 120), dbg: JSON.stringify({st: __z.G.state, on: __z.G.on, demo: __z.api.demo, menu: __z.api.menuOpen, e: __z.Z.bosses.encs.map(e => [e.id, e.over]), t: __z.api.TH.filter(t => t.k === 'hive').map(t => t.st)})}; });
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-boss-bar.png'});
  ok(bar.on && /HIVE/.test(bar.txt), `HUD: boss bar "${bar.txt}"` + (bar.on ? '' : ' ' + bar.dbg));
  /* no boss holds a wave for ever against a pilot who cannot hurt it: past six minutes (those with timers of their own go sooner) it breaks off with a radio call and flies out, its whole encounter with it */
  const lv = await p.evaluate(() => { const {Z} = __z, B = Z.bosses, R = Z.radio, out = {};
    for (const id of ['mirror', 'jugg', 'twins', 'hive']) { __b.clear(); R.hush(); R.calls.length = 0; B.spawn(id); __z.sim(12); const L = B.alive().filter(t => !B.BOSSES[t.k].minor); for (const t of L) t.bs.age = 361; __z.sim(1);
      const flagged = L.every(t => t.bs.out); __z.sim(140); out[id] = {n: L.length, flagged, gone: L.every(t => t.bs.gone === 'escaped'), left: B.alive().length, call: R.calls.some(c => /breaking off/.test(c.txt))}; }
    return out; });
  ok(Object.values(lv).every(o => o.n >= 1 && o.flagged && o.gone && !o.left && o.call) && lv.twins.n === 2, `Bosses: after six minutes the Mirror, the Juggernaut, the Twins (both) and the Hive break off, say so on the radio and are gone (${JSON.stringify(lv)})`);
  const cls = await p.evaluate(() => { __z.api.startDemo(); return {on: __z.Z.on, boss: __z.api.TH.some(t => __z.Z.bosses.BOSSES[t.k]), bar: document.getElementById('zbb').hidden || getComputedStyle(document.getElementById('zbb')).display === 'none'}; });
  ok(!cls.on && !cls.boss && cls.bar, 'Menu: no bosses, no boss bar');
  ok(!errs.length, 'Bosses: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); delete s.zboss; localStorage.setItem('dl-interceptor', JSON.stringify(s)); });
  await p.close();
}

// ---------- Bot Spectator (zspectate.js, zbotfly.js, zbotbrain.js): a bot pilot plays the real game: it shops visibly, takes off and kills
// by flying (no teleporting), the speed, cameras and tuning panel work, the report shows at the end, and none of it touches the saves ----------
if (want('spectator')) {
  const {p, errs} = await page();
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
  /* the boss record (the Ace's tally, the wreck it unlocks, the wear on the bosses) and a sector's scars are yours too: a bot's run on a sector writes neither */
  const bz = await p.evaluate(() => { const {api, Z, spec} = __z, ctx = Z.bosses.ctx, rd = () => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); return JSON.stringify([s.zboss?.b ?? {}, s.zboss?.ace ?? {}, s.zboss?.ghost ?? {}, s.zcamp?.sc ?? {}]); };
    const r0 = rd(); spec.bench.start('Rookie', 1, {sec: 'mill'}); __z.cont(); ctx.bump('mirror', 'won'); ctx.recAdd('ace', 'kills'); ctx.recAdd('ace', 'beaten'); Z.sc.add(0, 40, -300, 6); Z.sc.persist(); __z.sim(2);
    const out = {r0, r1: rd(), scars: Z.sc.stats().craters}; api.startDemo(); out.r2 = rd(); out.off = !spec.on; return out; });
  ok(bz.r0 === bz.r1 && bz.r1 === bz.r2 && bz.scars >= 1 && bz.off, `Spectator: a bot's run on a sector writes no boss record and no scars into your saves (${bz.scars} crater in the run, save unchanged)`);
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
  /* a boss in the queue is worth 0 threat points: its bearing must not poison the roaming bot's picture of the raids (no station scored, the first one was null and the pilot threw) */
  const rm = await p.evaluate(() => { const {api, G, Z, spec} = __z; api.startDemo(); spec.bench.start('Legend', 1); G.wave = 9; G.next = Z.plan(10); G.next.q = [{k: 'boss', at: 5, brg: .2}, {k: 'shahed', at: 8, brg: -1}]; G.next.list = ['boss', 'shahed']; __z.cont();
    let err = ''; try { __z.sim(6); } catch (e) { err = String(e.message); } const o = {err, st: G.state}; spec.stop(); return o; });
  ok(!rm.err && rm.st === 'wave', `Roaming, bot: a wave whose queue holds a boss does not stop the roaming pilot${rm.err ? ' (' + rm.err + ')' : ''}`);
  ok(!errs.length, 'Spectator: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- re-entry (zreentry.js), the long-range radar layers (zstratradar.js), the threat sound and its voice budget (zthreatsfx.js) ----------
if (want('reentry')) {
  const {p, errs} = await page();
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
  // the menu: none of it
  const cls = await p.evaluate(() => { __z.api.startDemo(); return {sr: document.getElementById('zsr').hidden, re: document.getElementById('zre').textContent, v: __z.Z.tsfx.stats().voices}; });
  ok(cls.sr && !cls.re, 'Menu: no long-range inset, no re-entry banner');
  ok(!errs.length, 'Re-entry / radar layers / threat sound: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- arsenal (zarsenal.js, zweapons.js, zarsdef.js): every pilot weapon and every extra defence can be bought or loaded, does its thing,
// and its weakness applies. Scripted set-ups through window.__z; dice are loaded only where a single roll decides the check ----------
if (want('arsenal')) {
  const {p, errs} = await page();
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

/* ---------- electronic warfare (zew.js + the Jammer King in zboss-jammer.js): the noise-against-signal duel on the pip, the radar, the lock-on and the
   helpers. The pip's error rises with the jamming and returns to the solver's exact point in a burn-through; distance and emitters scale it; ghosts,
   the HUD bar, the bot pilot through the same function; everything is gone at the end of the wave ---------- */
if (want('ew')) {
  const {p, errs} = await page();
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); delete s.zboss; localStorage.setItem('dl-interceptor', JSON.stringify({...s, zwx: 'menu'})); sessionStorage.setItem('zbossRoster', '1'); sessionStorage.setItem('zcodex', 'all'); });  /* the whole roster (zcodex.js) */
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 3);
  await play(p);
  await p.evaluate(() => { const {api, Z, G} = __z, V = api.THREE.Vector3; G.cash = 1e5; __z.jump(24); G.next = __z.plan(24); __z.cont();
    /* a rig: a static Shahed, the interceptor shadowing it at E.d metres (closing at 70 m/s, sights on it, the lock re-forced when it drops), the King and its four relay pods pinned where we say */
    const E = window.__e = {V, dt: 1 / 120, d: 2000, relocks: 0, hold: true, ts0: Z.tstep, sc0: Z.sightCam, P: new V(), dir: new V(0, 0, 1), king: null, pods: [], kp: new V(), base: null};
    E.clear = () => { for (const t of api.TH) t.st = 'dead'; __z.sim(.1); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); G.benc = []; for (const s of api.SITES) s.hp = s.max; if (api.player.dead > 0) api.launch(); };
    E.place = d => { E.d = d; E.P.copy(E.T).addScaledVector(E.dir, d); E.P.y = Math.max(E.T.y + 60, api.gh(E.P.x, E.P.z) + 250); };
    E.setup = () => { E.clear(); E.T = new V(0, api.gh(0, -1200) + 300, -1200); E.relocks = 0; E.hold = true; E.king = null; E.pods = []; api.camUp = true;
      const t = E.t = __z.make('shahed', 0, -1200); t.p.copy(E.T); t.v.set(0, 0, 0); t.__kin = () => {};
      Z.tstep = (u, d) => u.__kin ? (u.__kin(d), true) : E.ts0(u, d);
      const SQ = {position: E.P, quaternion: new api.THREE.Quaternion()}; Z.sightCam = () => (SQ.quaternion.setFromUnitVectors(new V(0, 0, -1), E.T.clone().sub(E.P).normalize()), SQ);
      E.place(2000); return t; };
    E.teardown = () => { Z.tstep = E.ts0; if (E.sc0) Z.sightCam = E.sc0; else delete Z.sightCam; };
    /* the King at kd metres from the pilot (at range d from the target), the pods in a ring of radius pr round the pilot */
    E.emit = (kd, pr, d = E.d) => { E.place(d); E.kp.set(E.P.x + kd * .8, 0, E.P.z - kd * .6); E.kp.y = api.gh(E.kp.x, E.kp.z) + 700;
      E.pods.forEach((u, i) => { const a = i * Math.PI / 2 + Math.PI / 4; u.p.set(E.P.x + Math.sin(a) * pr, 0, E.P.z + Math.cos(a) * pr); u.p.y = u.bs.y0 = api.gh(u.p.x, u.p.z) + 250; }); };
    E.king0 = (kd = 2600, pr = 1500) => { const K = E.king = Z.bosses.spawn('jammer'); __z.sim(.1); K.bs.sil = 0; E.pods = api.TH.filter(u => u.k === 'jpod' && api.live(u)); E.emit(kd, pr); return K; };
    E.run = (sec, o = {}) => { const me = api.player, n = Math.round(sec / E.dt), d0 = E.d, d1 = o.d1 ?? E.d, er = [], ew = Z.ew.E;
      const r = {rl0: E.relocks, over: -1e9, ghosts: 0, rg: 0, lockK: 0, helperK: 1, burnT: 0, burnErr: 0, burnGhosts: 0, burnLockK: 0, afterErr: 0, ampMax: 0};
      for (let i = 0; i < n; i++) { E.place(d0 + (d1 - d0) * (i + 1) / n);
        me.p.copy(E.P); me.v.copy(E.dir).multiplyScalar(-70); me.q.setFromUnitVectors(new V(0, 1, 0), E.dir.clone().multiplyScalar(-1)); me.w.set(0, 0, 0); me.dead = 0; api.camera.position.copy(E.P);
        if (E.king) { E.king.p.copy(E.kp); E.king.bs.pt = o.win ? 9 : 1; }
        api.step(E.dt); me.p.copy(E.P); if (i % 12 === 11) api.visuals(E.dt * 12, performance.now());
        if (E.hold && api.live(E.t) && Z.lk.t !== E.t) { Z.lk.force(E.t); E.relocks++; }
        const lk = Z.lk, e = lk.t === E.t ? lk.dp.distanceTo(lk.ip) : null;
        if (e != null) { er.push(e); r.over = Math.max(r.over, e - lk.eu);
          if (ew.burn > 0 && ew.age > .6) { r.burnErr = Math.max(r.burnErr, e); r.burnGhosts = Math.max(r.burnGhosts, Z.ew.ghostN() + Z.ew.radarN()); r.burnLockK = Math.max(r.burnLockK, Z.ew.lockK()); }
          else if (ew.burn <= 0 && ew.cd > 0) r.afterErr = Math.max(r.afterErr, e); }
        if (ew.burn > 0) r.burnT += E.dt;
        r.ghosts = Math.max(r.ghosts, Z.ew.ghostN()); r.rg = Math.max(r.rg, Z.ew.radarN()); r.lockK = Math.max(r.lockK, Z.ew.lockK()); r.helperK = Math.min(r.helperK, Z.ew.helperK()); r.ampMax = Math.max(r.ampMax, ew.amp); }
      r.rms = er.length ? +Math.sqrt(er.reduce((a, b) => a + b * b, 0) / er.length).toFixed(1) : 0; r.max = er.length ? +Math.max(...er).toFixed(1) : 0; r.n = er.length; r.relocks = E.relocks - r.rl0; r.st = Z.ew.state(); return r; };
    /* the HUD as one frame draws it, onto an offscreen canvas: how many pixels of a colour are near the pip / in the bar's place */
    E.px = (g, x0, y0, w, h, f) => { const d = g.getImageData(Math.max(0, x0 | 0), Math.max(0, y0 | 0), w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60 && f(d[i], d[i + 1], d[i + 2])) n++; return n; };
    E.violet = (r, g, b) => r > 150 && g < 170 && b > 200; E.green = (r, g, b) => g > 170 && r < 150 && b < 190 && g > r + 70; E.red = (r, g, b) => r > 235 && g < 110 && b < 110; E.bg = (r, g, b) => b >= 12 && b <= 20 && r <= 12 && g <= 10;  /* the bar's own dark fill (text shadows are pure black) */
    E.draw = () => { if (Z.lk.L.st !== 2) E.run(.03); const W = innerWidth, H = innerHeight, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true});
      api.camera.position.copy(E.P); api.camera.lookAt(E.T); api.camera.updateMatrixWorld(); Z.overlay(g);
      const q = Z.lk.dp.clone().project(api.camera), X = (q.x * .5 + .5) * W, Y = (-q.y * .5 + .5) * H;
      return {locked: Z.lk.t === E.t, near: f => E.px(g, X - 50, Y - 50, 100, 100, f), bar: f => E.px(g, W / 2 - 130, 185, 260, 65, f)}; };
    E.radar = () => { const c = document.createElement('canvas'); c.width = c.height = 500; const g = c.getContext('2d', {willReadFrequently: true}), me = api.player; g.save(); g.beginPath(); g.arc(250, 250, 240, 0, 7); g.clip();
      Z.radar(g, (x, z) => [250 + (x - me.p.x) * .05, 250 + (z - me.p.z) * .05], null, 1); g.restore(); return E.px(g, 0, 0, 500, 500, E.red); };
  });
  ok(await p.evaluate(() => !!__z.Z.ew), 'EW: the engine is loaded (Z.ew)');
  /* 1. no jamming: the pip is the solver's point, exactly */
  const base = await p.evaluate(() => { const {Z} = __z, E = __e, t = E.setup(), lj0 = Z.lockJam(t), r = E.run(2); E.base = {lj0, lt0: Z.lk.lockTime(t, __z.api.player)};
    return {r, on: Z.ew.state().on, held: Z.lk.t === t, same: Z.lk.dp.distanceTo(Z.lk.ip), ghosts: Z.ew.ghostN(), lj0, lt0: E.base.lt0}; });
  console.log('  ew baseline:', JSON.stringify({rms: base.r.rms, max: base.r.max, on: base.on, same: base.same}));
  ok(!base.on && base.held && base.r.n > 200 && base.r.max === 0 && base.same === 0 && base.ghosts === 0, `EW: with no jammer the pip is the solver's point to the metre (error ${base.r.max} m over ${base.r.n} ticks with the lock held)`);
  /* 2. the King lives, near, all four pods up: the pip drifts and jitters inside its ring, ghosts, slower and dropping lock, weaker helpers */
  const jam = await p.evaluate(() => { const {api, Z} = __z, E = __e, t = E.t; E.king0(2600, 1500); const r = E.run(5), ew = Z.ew.E;
    const lt = Z.lk.lockTime(t, api.player) / E.base.lt0, sk = Z.ew.state(), lj = Z.lockJam(t) / E.base.lj0, jk = Z.jink(t);
    /* the bot's way to the same pip: skew() on the solver's point at the clock of the last HUD frame gives the HUD's point */
    const ip = Z.lk.ip.clone(), c0 = ew.clock; ew.clock -= E.dt; Z.ew.skew(ip, api.player.p, t.p.distanceTo(api.player.p)); ew.clock = c0; const botOff = ip.distanceTo(Z.lk.dp);
    /* the lock drops now and then (a private random stream), never near the target */
    let drops = 0, near = 0; for (let i = 0; i < 7200; i++) drops += Z.ew.lockDrop(t, api.player, E.dt) ? 1 : 0;
    const tp = t.p.clone(); t.p.copy(api.player.p).add(new E.V(0, 0, -300)); for (let i = 0; i < 7200; i++) near += Z.ew.lockDrop(t, api.player, E.dt) ? 1 : 0; t.p.copy(tp);
    return {r, lt, lj, jk, sk, botOff, drops, near}; });
  console.log('  ew jammed:', JSON.stringify({rms: jam.r.rms, max: jam.r.max, over: +jam.r.over.toFixed(1), amp: +jam.r.ampMax.toFixed(0), ghosts: jam.r.ghosts, rg: jam.r.rg, lockK: jam.r.lockK, helperK: jam.r.helperK, relocks: jam.r.relocks, lt: +jam.lt.toFixed(2), lj: +jam.lj.toFixed(2), jk: jam.jk, bot: +jam.botOff.toFixed(1), drops: jam.drops, near: jam.near}));
  ok(jam.sk.on && jam.sk.neff > .6 && jam.r.rms >= .15 * jam.r.ampMax && jam.r.rms > 20 && jam.r.max > 20, `EW: with the King and its four pods near, the pip error rises from 0 to ${jam.r.rms} m rms (up to ${jam.r.max} m; noise scale ${jam.r.ampMax.toFixed(0)} m)`);
  ok(jam.r.over <= .01 && jam.r.max <= 1.3 * jam.r.ampMax + .01, `EW: the uncertainty ring always holds the true point (the pip stays ${(-jam.r.over).toFixed(1)} m or more inside it) and the error stays within the noise scale`);
  ok(jam.r.ghosts >= 1 && jam.r.rg >= 1, `EW: ghost pips (${jam.r.ghosts}) and ghost tracks on the radar (${jam.r.rg}) appear`);
  ok(jam.lt >= 2 && jam.r.lockK <= 3.25 && jam.lj >= 2 && jam.r.helperK <= .7 && jam.r.helperK >= .6 && Math.abs(jam.jk - jam.sk.helperK) < .006, `EW: lock-on takes ${jam.lt.toFixed(1)}x as long (never worse than ${jam.r.lockK.toFixed(2)}x), helpers keep ${Math.round(jam.r.helperK * 100)}% of their odds (the Z.jink they already use)`);
  ok(jam.drops >= 2 && jam.near === 0, `EW: the jamming drops the lock now and then (${jam.drops} in 60 s of ticks) but never inside 350 m (${jam.near})`);
  ok(jam.botOff < Math.max(2, .12 * jam.r.ampMax), `EW: the bot's pip comes from the same function as the HUD's (skew() on the solver's point lands within ${jam.botOff.toFixed(1)} m of the HUD's)`);
  /* 3. distance: the same pilot, the emitters further away */
  const dist = await p.evaluate(() => { const E = __e, out = []; for (const [kd, pr] of [[2600, 1500], [4200, 2400], [5600, 3000], [9000, 4800]]) { E.emit(kd, pr); const r = E.run(.05); out.push({kd, nb: r.st.nb, amp: Math.round(r.ampMax), lockK: r.st.lockK}); } E.emit(2600, 1500); return out; });
  console.log('  ew distance:', JSON.stringify(dist));
  ok(dist.every((d, i) => !i || d.nb < dist[i - 1].nb) && dist[0].nb > .6 && dist[3].nb === 0 && dist[3].lockK === 1, `EW: the noise scales with distance to the emitters (${dist.map(d => d.nb).join(' > ')}) and is nothing out of their reach`);
  /* 4. a pulse window: the King's quiet 4 s takes most of it away (and is not a burn-through) */
  const win = await p.evaluate(() => { const E = __e, b0 = __z.Z.ew.E.burns; E.run(1.5); const a = E.run(3), w = E.run(3, {win: true}), back = E.run(3); return {a: a.st.neff, w: w.st.neff, amp: w.st.amp, burns: w.st.burns - b0, b: back.st.neff}; });
  ok(win.w < .2 * win.a && win.amp < 30 && win.burns === 0 && win.b > .8 * win.a, `EW: in a pulse window the noise falls ${win.a} -> ${win.w} (pip error scale ${win.amp} m) without a burn-through, and is back at ${win.b} after`);
  /* 5. burn-through: holding the lock and closing the range is not enough while the pods live; the pods going down is what lets it through */
  const bt = await p.evaluate(() => { const {api} = __z, E = __e, out = {}; E.emit(2600, 1500, 1600); const a = E.run(5, {d1: 900}); out.alive = {burns: a.st.burns, snr: a.st.snr, nb: a.st.nb, hold: a.st.hold};
    const seq = [], rs = []; let k = 0;
    for (const u of E.pods) { u.by = 'p'; api.killThreat(u, true); k++; const r = E.run(4, {d1: Math.max(500, E.d - 100)}); seq.push({k, nb: r.st.nb, snr: r.st.snr, killed: r.st.killed, burns: r.st.burns, amp: Math.round(r.ampMax)}); rs.push(r); if (r.st.burns) break; }
    const last = rs[rs.length - 1]; out.seq = seq; out.k = k; out.last = {burnErr: last.burnErr, burnGhosts: last.burnGhosts, burnLockK: last.burnLockK, burnT: +last.burnT.toFixed(1), ampBefore: Math.round(Math.max(...rs.map(r => r.ampMax)))};
    return out; });
  console.log('  ew burn-through:', JSON.stringify(bt));
  ok(bt.alive.burns === 0 && bt.alive.snr < .58 && bt.alive.hold === 1, `EW: holding the lock and closing to 900 m is not enough with the pods up (SNR ${bt.alive.snr} of the 0.58 needed, noise ${bt.alive.nb})`);
  ok(bt.seq.length >= 2 && bt.seq.every((s, i) => s.nb < (i ? bt.seq[i - 1].nb : bt.alive.nb) && (!i || s.killed > bt.seq[i - 1].killed)), `EW: each pod destroyed lowers the noise and raises the signal (noise ${bt.alive.nb} -> ${bt.seq.map(s => s.nb).join(' -> ')})`);
  ok(bt.seq[bt.seq.length - 1].burns >= 1 && bt.k >= 2 && bt.k <= 4, `EW: with ${bt.k} of 4 pods down the signal burns through (SNR ${bt.seq[bt.seq.length - 1].snr} over the 0.58 level)`);
  ok(bt.last.burnErr <= .01 && bt.last.burnGhosts === 0 && bt.last.burnLockK <= 1.02 && bt.last.ampBefore > 20, `EW: in the burn-through the pip is the solver's point again (error ${bt.last.burnErr} m; it was up to ${bt.last.ampBefore} m), no ghosts, lock-on at normal speed, for ${bt.last.burnT} s`);
  /* the window ends and the King re-tunes: the noise comes back for a moment before the signal can burn through again */
  const ret = await p.evaluate(() => { const r = __e.run(14); return {burns: r.st.burns, after: r.afterErr}; });
  ok(ret.burns >= 2 && ret.after > 5, `EW: after the window it re-tunes (${ret.after.toFixed(0)} m of pip error comes back before the next burn-through; ${ret.burns} burn-throughs so far)`);
  /* 6. the HUD: green and clean when burned through, static over the pip and in the bar when jammed, ghost blips on the radar; real frames meanwhile */
  const seek = async (what, sec) => p.evaluate((what, sec) => { const E = __e, ew = __z.Z.ew.E, f = what === 'burn' ? () => ew.burn > 1.5 && ew.bk > .95 : () => ew.burn <= 0 && ew.neff > .3;
    for (let i = 0; i < sec * 4; i++) { if (f()) return true; E.run(.25); } return f(); }, what, sec);
  const hud = {};
  hud.burnSeen = await seek('burn', 10);
  if (SHOTS) { await drawFrames(p, 3); await p.screenshot({path: SHOTS + '/ew-burn-through.png'}); await seek('burn', 10); }
  Object.assign(hud, await p.evaluate(() => { const d = __e.draw(), E = __e; return {burnLocked: d.locked, burnBar: d.bar(E.green), burnPip: d.near(E.green), burnStatic: d.near(E.violet)}; }));
  hud.jamSeen = await seek('jam', 14);
  if (SHOTS) { await drawFrames(p, 3); await p.screenshot({path: SHOTS + '/ew-jammed.png'}); await seek('jam', 14); }
  Object.assign(hud, await p.evaluate(() => { const d = __e.draw(), E = __e, ew = __z.Z.ew.E; let red = 0; for (let i = 0; i < 24 && !red; i++) { ew.clock += .11; red = E.radar(); }
    return {jamLocked: d.locked, jamBg: d.bar(E.bg), jamBar: d.bar(E.violet), jamBarGreen: d.bar(E.green), jamStatic: d.near(E.violet), radarRed: red}; }));
  await frames(p, 12); await drawFrames(p, 2);
  console.log('  ew hud:', JSON.stringify(hud));
  ok(hud.burnSeen && hud.burnLocked && hud.burnBar > 150 && hud.burnPip > 6 && hud.burnStatic === 0, `EW HUD: burned through, the bar is green (${hud.burnBar} px), a green ring marks the pip and there is no static over it (${hud.burnStatic} px)`);
  ok(hud.jamSeen && hud.jamLocked && hud.jamBg > 100 && hud.jamBar > 20 && hud.jamStatic > 6, `EW HUD: jammed, static (violet) fills the pip (${hud.jamStatic} px) and the bar's noise side (${hud.jamBar} px violet, ${hud.jamBarGreen} px green)`);
  ok(hud.radarRed > 0, `EW HUD: ghost tracks blink on the radar scope (${hud.radarRed} px of blips drawn in one of 24 samples)`);
  /* 7. the wave ends: everything the jamming did is put back exactly, at once */
  const end = await p.evaluate(() => { const {api, Z, G} = __z, E = __e, ew = Z.ew.E, seekTo = f => { for (let i = 0; i < 80 && !f(); i++) E.run(.25); return f(); };
    /* jammed (ghosts out), then mid burn-through (the window and its timers running): the wave ends in the second */
    const jamOn = seekTo(() => ew.burn <= 0 && ew.neff > .3), jammed = {fx: Z.bosses.fx(), st: Z.ew.state()}; seekTo(() => ew.burn > 1.5 && ew.bk > .95); const before = {fx: Z.bosses.fx(), st: Z.ew.state(), jammed, jamOn};
    E.teardown(); G.wq.length = 0; for (const u of api.TH) u.st = 'dead'; G.state = 'clear'; G.clearT = 3; __z.sim(.5);
    const o = Z.make('shahed', 0, -2500), ip = new E.V(100, 300, -900), p0 = ip.clone(), ring = Z.ew.skew(ip, api.player.p, 1500), d = E.draw();
    const after = {fx: Z.bosses.fx(), st: Z.ew.state(), lj: Z.lockJam(o) / E.base.lj0, jk: Z.jink(o), rk: Z.radarK(), off: ip.distanceTo(p0), ring, drop: Z.ew.lockDrop(o, api.player, 1), bar: d.bar(E.bg), radar: E.radar()};
    o.st = 'dead'; return {before, after}; });
  const left = Object.entries(end.after.fx).filter(([k, v]) => v && v !== 0).map(([k, v]) => k + '=' + v), A = end.after;
  if (A.st.on || A.st.neff || A.st.amp || A.st.burn || A.st.snr || A.st.ghosts || A.st.rGhosts || A.st.lockK !== 1 || A.st.helperK !== 1) left.push('state ' + JSON.stringify(A.st));
  if (A.lj !== 1) left.push('lockJam x' + A.lj); if (A.jk !== 1) left.push('jink x' + A.jk); if (A.rk !== 1) left.push('radar x' + A.rk); if (A.off || A.ring || A.drop) left.push('skew ' + A.off + ' ring ' + A.ring + ' drop ' + A.drop); if (A.bar) left.push('bar ' + A.bar + ' px'); if (A.radar) left.push('radar blips ' + A.radar + ' px');
  console.log('  ew wave end: during', JSON.stringify(Object.entries(end.before.fx).filter(([k, v]) => v && k.startsWith('ew')).map(([k, v]) => k + '=' + v)), '-> left', JSON.stringify(left));
  ok(end.before.jamOn && end.before.jammed.fx.ew === 1 && end.before.jammed.fx.ewGhost > 0 && end.before.fx.ewBurn === 1 && end.before.st.burn > 0, 'EW: the jamming was really running before the wave ended (jammed ' + JSON.stringify(end.before.jammed.st) + '; then in a burn-through ' + JSON.stringify(end.before.st) + ')');
  ok(!left.length, "EW: at the end of the wave the noise, burn-through, ghost pips and tracks, lock-on time, helpers' odds, pip error, radar range and the bar are all back exactly, and the bosses' fx() is all zero" + (left.length ? ' (' + left.join('; ') + ')' : ''));
  /* 8. the King dies: the jamming stops at once; its EW Crown makes you immune to the next one */
  const kill = await p.evaluate(() => { const {api, Z, G} = __z, E = __e; __z.sim(4); if (G.state === 'base') { G.bkeep = {}; __z.cont(); }
    const t = E.setup(); E.king0(2600, 1500); const r = E.run(2); Z.bosses.ctx.kill(E.king, 'p'); E.run(.1); const k1 = Z.ew.state(); E.run(1); const crown = !!G.brw.crown;
    const K2 = E.king = Z.bosses.spawn('jammer'); __z.sim(.1); K2.bs.sil = 0; E.pods = api.TH.filter(u => u.k === 'jpod' && api.live(u)); E.emit(2600, 1500); const r2 = E.run(2);
    return {nb: r.st.nb, on: r.st.on, k1, crown, imm: r2.st, lj: Z.lockJam(t) / E.base.lj0, jk: Z.jink(t), rg: r2.rg, g: r2.ghosts, pods: E.pods.length}; });
  console.log('  ew king killed:', JSON.stringify({nb: kill.nb, k1: kill.k1.neff, crown: kill.crown, pods: kill.pods, imm: kill.imm.on, lj: kill.lj, jk: kill.jk, g: kill.g, rg: kill.rg}));
  ok(kill.on && kill.nb > .5 && !kill.k1.on && kill.k1.neff === 0 && kill.k1.lockK === 1, `EW: killing the Jammer King ends the jamming at once (noise ${kill.nb} -> ${kill.k1.neff})`);
  ok(kill.crown && kill.pods === 4 && !kill.imm.on && kill.lj <= 1 && kill.jk === 1 && kill.g === 0 && kill.rg === 0, 'EW: holding the EW Crown, a second Jammer King does nothing to you (no noise, ghosts or helper penalty; the Crown even builds lock-ons x' + (1 / kill.lj).toFixed(2) + ' faster)');
  await p.evaluate(() => { const {api, G} = __z; __e.teardown(); delete G.brw.crown; for (const t of api.TH) t.st = 'dead'; });
  /* 9. the bot pilot (Legend, the real flying pilot) in a wave with the King near: it flies its lock to the jammed pip through the same function */
  const bot = await p.evaluate(() => { const {api, G, Z, spec} = __z, V = api.THREE.Vector3; api.startDemo(); spec.bench.start('Legend', 1); __z.cont(); const me = api.player;
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); Z.lk.clear();
    const f = me.home, t = __z.make('shahed', f.x, f.z + 2400); t.p.y = api.gh(t.p.x, t.p.z) + 300; t.alt = 300; t.wps.length = 0; t.aim = new V(f.x, 0, f.z + 9000);
    const K = Z.bosses.spawn('jammer'); __z.sim(.1); K.bs.sil = 0; const kp = new V(f.x + 1700, 0, f.z - 400); kp.y = api.gh(kp.x, kp.z) + 700;
    api.TH.filter(u => u.k === 'jpod' && api.live(u)).forEach((u, i) => { const a = i * Math.PI / 2 + .6; u.p.set(f.x + Math.sin(a) * 1900, 0, f.z + 400 + Math.cos(a) * 1900); u.p.y = u.bs.y0 = api.gh(u.p.x, u.p.z) + 250; });
    const sk0 = Z.ew.skew, c = {hud: 0, bot: 0, hudOff: 0, botOff: 0, noise: 0, lockJam: 0}, b0 = new V();
    Z.ew.skew = (q, fr, d) => { b0.copy(q); const r = sk0(q, fr, d); if (q === Z.lk.dp) { c.hud++; c.hudOff = Math.max(c.hudOff, q.distanceTo(b0)); } else { c.bot++; c.botOff = Math.max(c.botOff, q.distanceTo(b0)); } return r; };
    let i = 0; for (; i < 120 * 140 && api.live(t) && !(c.bot >= 60 && c.hud >= 60); i++) { K.p.copy(kp); K.bs.pt = 1; api.step(1 / 120); if (i % 12 === 11) api.visuals(.1, performance.now()); c.noise = Math.max(c.noise, Z.ew.neff); c.lockJam = Math.max(c.lockJam, Z.lockJam(t)); }
    Z.ew.skew = sk0; c.t = Math.round(i / 120); c.alive = api.live(t); spec.stop(); return c; });
  console.log('  ew bot:', JSON.stringify(bot));
  ok(bot.noise > .5 && bot.lockJam > 2 && bot.hud > 0 && bot.bot > 0 && bot.botOff > 5 && bot.hudOff > 5, `EW, bot: the Legend flies its lock-on through the jamming (lock-on x${bot.lockJam.toFixed(1)}); the HUD's pip is moved ${bot.hud}x (up to ${bot.hudOff.toFixed(0)} m) and the pip the bot flies to ${bot.bot}x (up to ${bot.botOff.toFixed(0)} m) by the same skew() (${bot.t} s)`);
  ok(!errs.length, 'EW: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

/* ---------- sell (zsell.js, zbase.js, zchain.js, znet.js) and the campaign map's modifier cap (zcampaign.js). Anything you own sells for money on the base
   screen and its card keeps an Undo until the wave starts: a defence, a dome, a position you paid to open, a kill chain battery. A sale pays everything
   spent on it this base screen plus half (the doctrine's share) of the earlier spending; the standard positions, the sites and free positions never
   sell. A co-op client's sale and undo are requests to the host. The map shows a sector's three strongest modifiers and a "+n" chip that opens the rest ---------- */
if (want('sell')) {
  const {p, errs} = await page();
  await play(p);
  // 1. the rule at the briefing: a defence bought and upgraded this base screen sells back in full, and its card stays with an Undo
  const a1 = await p.evaluate(() => { const {G, Z} = __z, B = Z.base.act; G.cash = 20000; const d = B.place('flak', 0); B.upgrade(d.id, 'lvl'); const id = d.id, spent = d.spent;
    document.querySelector('[data-tab="armory"]').click(); const label = document.querySelector(`[data-sell="${id}"]`).textContent, why = document.querySelector('.zrf')?.textContent;
    document.querySelector(`[data-sell="${id}"]`).click();
    return {spent, label, why, cash: G.cash, left: Z.def.D.length, sold: G.sold.length, ghost: !!document.querySelector('.zsold [data-undo]'), freed: Z.def.slotFree(0, 'flak')}; });
  ok(a1.spent === 900 && a1.label === 'Sell +$900' && /Full refund/.test(a1.why) && a1.cash === 20000 && !a1.left && a1.sold === 1 && a1.ghost && a1.freed, `Sell: bought and upgraded this base screen sells back in full (${a1.label}: "${a1.why}"), the position is free, the card keeps an Undo`);
  const a2 = await p.evaluate(() => { const {G, Z} = __z; document.querySelector('.zsold [data-undo]').click(); const d = Z.def.D[0];
    return {cash: G.cash, n: Z.def.D.length, type: d?.type, lvl: d?.lvl, spent: d?.spent, slot: d?.slot, sold: G.sold.length, ghost: !!document.querySelector('.zsold'), card: !!document.querySelector(`[data-sell="${d?.id}"]`)}; });
  ok(a2.cash === 19100 && a2.n === 1 && a2.type === 'flak' && a2.lvl === 1 && a2.spent === 900 && a2.slot === 0 && !a2.sold && !a2.ghost && a2.card, `Sell: Undo takes the $900 back and the flak mortar returns as it was (level ${a2.lvl + 1}, position ${a2.slot}, cash $${a2.cash})`);
  // 1b. a sortie closes the base screen and opens it again: still the same break, so a defence bought before it sells in full and a sale keeps its Undo
  const a1b = await p.evaluate(() => { const {G, Z} = __z, B = Z.base.act; G.cash = 20000; const f = Z.def.SLOTS.map((s, i) => i).filter(i => Z.def.slotFree(i, 'flak')), keep = B.place('flak', f[0]), gone = B.place('flak', f[1]);
    const v0 = Z.sell.dval(keep); B.sell(gone.id); const n0 = G.sold.length, sid = G.sold[0]?.id;
    Z.so.S.on = true; Z.base.close(); const mid = G.sold.length; Z.so.S.on = false; Z.base.open();  /* what a sortie does (zsortie.js start and end) */
    const v1 = Z.sell.dval(Z.def.D.find(d => d.id === keep.id)), n1 = G.sold.length, undo = !!Z.sell.undo(sid), back = Z.def.D.find(d => d.slot === f[1]);
    Z.def.remove(Z.def.D.find(d => d.id === keep.id)); if (back) Z.def.remove(back); G.sold.length = 0;
    return {v0, v1, n0, mid, n1, undo, back: !!back}; });
  ok(a1b.v0 === 450 && a1b.v1 === 450 && a1b.n0 === 1 && a1b.mid === 1 && a1b.n1 === 1 && a1b.undo && a1b.back, `Sell: a sortie round trip (base screen closed and opened) keeps the break: a flak bought before it still sells for $${a1b.v1} of $${a1b.v0}, the sale is still in the ledger (${a1b.n1}) and its Undo works`);
  // 2. a position opened now (older by the next base screen) and a second flak sold; the wave starting ends the Undo
  const a3 = await p.evaluate(() => { const {G, Z} = __z, B = Z.base.act; G.cash = 20000; const j = Z.def.SLOTS.findIndex((s, i) => Z.def.canOpen(i, Z.meta.doc())), paid = B.expand(j), d2 = B.place('flak', 1), r = B.sell(d2.id), id = G.sold[0]?.id;
    __z.cont(); return {j, paid, r, id, ledger: G.sold.length, undo: Z.sell.undo(id), st: G.state}; });
  ok(a3.paid === 1800 && a3.r === 450 && a3.id && a3.ledger === 0 && a3.undo === null && a3.st === 'wave', `Sell: a position opened for $${a3.paid}; a flak bought and sold at once pays $${a3.r}; starting the wave clears the Undo (ledger ${a3.ledger}, undo ${a3.undo})`);
  const w1 = await p.evaluate(() => { for (let i = 0; i < 4000 && __z.G.state !== 'base' && __z.G.state !== 'over'; i++) __z.sim(1); return {st: __z.G.state, wave: __z.G.wave}; });
  ok(w1.st === 'base' && w1.wave === 1, 'Sell: wave 1 played out, the base screen is back');
  // 3. at the next base screen the flak is older: half of its $900, plus everything spent on it since this screen opened
  const b1 = await p.evaluate(() => { const {G, Z} = __z, B = Z.base.act, d = Z.def.D[0]; G.cash = 20000; const half = Z.sell.dval(d); B.upgrade(d.id, 'lvl'); const mixed = Z.sell.dval(d), why = Z.sell.dwhy(d);
    document.querySelector('[data-tab="armory"]').click(); const b = document.querySelector(`[data-sell="${d.id}"]`), label = b.textContent, c0 = G.cash; b.click(); const after = G.cash; document.querySelector('.zsold [data-undo]').click();
    return {half, mixed, why, label, gain: after - c0, back: G.cash - c0, n: Z.def.D.length, lvl: Z.def.D[0]?.lvl}; });
  ok(b1.half === 450 && b1.mixed === 1200 && b1.label === 'Sell +$1,200' && b1.gain === 1200 && b1.back === 0 && b1.n === 1 && b1.lvl === 2 && /\$750/.test(b1.why) && /50%/.test(b1.why), `Sell: an older flak pays half of its $900 ($${b1.half}); after a $750 upgrade this screen it pays $${b1.mixed} ("${b1.why}"); Undo restores it`);
  // 4. the opened position: half of its $1,800 now; closing it frees nothing in use, and it can't close under a defence
  const x1 = await p.evaluate(j => { const {G, Z} = __z; G.cash = 20000; const val = Z.sell.xval(j), why = Z.sell.xwhy(j); document.querySelector('[data-tab="sites"]').click();
    const b = document.querySelector(`[data-xs="${j}"]`), label = b?.textContent, c0 = G.cash, e0 = G.exp; b.click(); const closed = {open: Z.def.slotOpen(j), exp: G.exp, gain: G.cash - c0, xp: !!G.xp[j], ghost: !!document.querySelector('.zsold [data-undo]')};
    document.querySelector('.zsold [data-undo]').click(); return {val, why, label, e0, closed, back: {open: Z.def.slotOpen(j), exp: G.exp, cash: G.cash - c0, xp: !!G.xp[j]}}; }, a3.j);
  ok(x1.val === 900 && /50%/.test(x1.why) && x1.label === 'Close +$900' && !x1.closed.open && x1.closed.exp === x1.e0 - 1 && x1.closed.gain === 900 && !x1.closed.xp && x1.closed.ghost && x1.back.open && x1.back.exp === x1.e0 && x1.back.cash === 0 && x1.back.xp,
    `Sell: the position you opened pays half ($${x1.val}) to close and goes dormant; Undo reopens it at the same price (exp ${x1.e0} -> ${x1.closed.exp} -> ${x1.back.exp})`);
  const x2 = await p.evaluate(j => { const {G, Z} = __z; Z.base.act.place('flak', j); document.querySelector('[data-tab="sites"]').click(); const b = document.querySelector(`[data-xs="${j}"]`), r = Z.sell.closeX(j), open = Z.def.slotOpen(j), why = Z.sell.xcan(j);
    Z.base.act.sell(Z.def.D.find(d => d.slot === j).id); return {dis: b.disabled, r, open, why}; }, a3.j);
  ok(x2.dis && x2.r === null && x2.open && /Sell or move/.test(x2.why), `Sell: a position with a defence on it can't close (button disabled, closeX refused: "${x2.why}")`);
  // 5. never below the minimum: the standard positions and the sites can't be sold, free positions have no price; with everything sold the base still plays a wave
  const s1 = await p.evaluate(j => { const {G, Z, api} = __z, std = Z.def.SLOTS.map((s, i) => i).filter(i => !Z.def.SLOTS[i].ex && !Z.def.SLOTS[i].park), hp0 = api.SITES.map(s => s.hp).join(), integ0 = __z.integrity().hp;
    const stdSold = std.filter(i => Z.sell.closeX(i) !== null).length; for (const d of [...Z.def.D]) Z.base.act.sell(d.id); const xr = Z.sell.closeX(j), cash = G.cash;
    return {stdN: std.length, stdSold, stdOpen: std.every(i => Z.def.slotOpen(i)), defs: Z.def.D.length, ledger: G.sold.length, xr, hp: api.SITES.map(s => s.hp).join() === hp0, integ: __z.integrity().hp === integ0, openNow: Z.def.SLOTS.filter((s, i) => !s.park && Z.def.slotOpen(i)).length, cash}; }, a3.j);
  ok(s1.stdN === 14 && !s1.stdSold && s1.stdOpen && !s1.defs && s1.ledger >= 1 && s1.xr === 900 && s1.hp && s1.integ && s1.openNow === 14, `Sell: ${s1.stdN} standard positions can't be sold (${s1.stdSold} sold), sites untouched, defences all sold (${s1.ledger} Undo cards), ${s1.openNow} positions open after closing the one I opened`);
  const w2 = await p.evaluate(() => { __z.cont(); for (let i = 0; i < 4000 && __z.G.state !== 'base' && __z.G.state !== 'over'; i++) __z.sim(1); return {st: __z.G.state, wave: __z.G.wave, ledger: __z.G.sold.length}; });
  ok((w2.st === 'base' || w2.st === 'over') && w2.wave === 2 && !w2.ledger, `Sell: the base with nothing left still plays wave 2 (${w2.st})`);
  // 6. the doctrine's share (Quartermaster pays a quarter) and the kill chain / dome
  const q1 = await p.evaluate(() => { const {Z} = __z, k0 = Z.meta.k; Z.meta.k = (key, d) => key === 'sellK' ? .25 : k0(key, d); const r = [Z.sell.val(1000, 1000), Z.sell.val(1000, 0), Z.sell.val(1000, 600)]; Z.meta.k = k0; return r; });
  ok(q1.join() === '250,1000,550', `Sell: under the Quartermaster's quarter, $1,000 old pays ${q1[0]}, new pays ${q1[1]}, $600 old + $400 new pays ${q1[2]}`);
  const c1 = await p.evaluate(() => { const {G, Z} = __z, B = Z.base.act; if (G.state !== 'base') return null; __z.jump(30, 80000); const j = Z.def.SLOTS.findIndex((s, i) => Z.def.slotFree(i, 'gdome')), d = B.place('gdome', j), c0 = G.cash;
    Z.chain.act('st', 2); const stock = G.kc.stock, c1 = G.cash; const r = B.sell(d.id), after = {stock: G.kc.stock, gain: G.cash - c1, gone: !Z.def.D.includes(d)}; const u = Z.sell.undo(G.sold[0].id);
    return {c0, stock, after, undo: !!u, stock2: G.kc.stock, cash: G.cash, type: Z.def.D.at(-1)?.type, r}; });
  ok(c1 && c1.stock === 2 && c1.after.stock === 0 && c1.after.gain === 10600 && c1.after.gone && c1.undo && c1.stock2 === 2 && c1.cash === c1.c0 - 1600 && c1.type === 'gdome', `Sell: a Golden Dome ($9,000, new) pays $${c1?.after.gain} with the ${c1?.stock} space interceptors it can no longer hold; Undo puts both back`);
  const c2 = await p.evaluate(() => { const {G, Z} = __z, K = Z.chain; K.act('bb', 0); const c0 = G.cash; const r = K.act('bs', 0); document.querySelector('[data-tab="chain"]').click(); const btn = document.querySelector('.ztab [data-undo]'), label = btn?.textContent, rec = G.sold.find(q => q.k === 'b');
    const out = {gain: G.cash - c0, none: !G.kc.boost[0], msg: r?.msg, label, rec: !!rec}; btn?.click(); out.back = !!G.kc.boost[0]; out.cash = G.cash - c0; return out; });
  ok(c2.gain === 6000 && c2.none && c2.rec && /Undo sale/.test(c2.label) && c2.back && c2.cash === 0, `Sell: a boost battery bought now sells back for $${c2.gain}, its empty card offers "${c2.label}", and Undo rebuilds it (${c2.msg})`);
  // 7. the campaign map: the three strongest modifiers per sector, a "+n" chip opens the rest, nothing leaves the rules
  const sortF = await p.evaluate(() => !!(__z.Z.feat?.sorties || __z.Z.sorties)), feat = () => sortF;  /* the Enemy launch sites modifier needs the sorties feature, else it falls back to Heavy pressure */
  const rk = rankMods(modsOf('gate', 0, feat)).map(modName), rd = rankMods(modsOf('dam', 0, feat)).map(modName);
  ok(rk.slice(0, MAP_MODS).join() === 'Missile front,Mothership escort,Coordinated raids' && rd.slice(0, MAP_MODS).join() === 'Coordinated raids,Heavy pressure,Swarm-heavy' && rd[3] === 'Storm season', `Map: modifiers rank by impact (Launch Complex shows ${rk.slice(0, 3).join(' / ')}, hides ${rk.slice(3).join(' / ')}; The Dam hides ${rd[3]})`);
  const mp = await p.evaluate(() => { __z.Z.cp.openMap(); const ov = document.getElementById('zcamp');
    return [...ov.querySelectorAll('.zc-n')].map(n => { const id = n.dataset.sec, chip = n.querySelector('.zc-more'); return {id, icons: n.querySelectorAll('.zc-mi').length, shown: [...n.querySelectorAll('.zc-mi title')].map(t => t.textContent), chip: chip ? chip.querySelector('text').textContent : '',
      rest: [...ov.querySelectorAll(`[data-pop="${id}"] .zc-pn`)].map(t => t.textContent), vis: ov.querySelector(`[data-pop="${id}"]`) ? getComputedStyle(ov.querySelector(`[data-pop="${id}"]`)).visibility : ''}; }); });
  const want3 = CAMP_SECTORS.map(s => { const n = s.mods.length; return {id: s.id, icons: Math.min(3, n), chip: n > 3 ? '+' + (n - 3) : '', rest: Math.max(0, n - 3)}; });
  const mapOk = mp.length === 12 && want3.every(w => { const m = mp.find(q => q.id === w.id); return m && m.icons === w.icons && m.chip === w.chip && m.rest.length === w.rest && (!w.rest || m.vis === 'hidden'); });
  const tot = mp.reduce((a, m) => a + m.icons + (m.rest.length || 0), 0);
  ok(mapOk && tot === 29 && mp.every(m => m.icons <= 3), `Map: ${mp.reduce((a, m) => a + m.icons, 0)} icons on the map (was ${tot}), none over 3 per sector, chips ${mp.filter(m => m.chip).map(m => m.id + ' ' + m.chip).join(', ')}; the lists hold the other ${mp.reduce((a, m) => a + m.rest.length, 0)}, hidden until asked`);
  ok(mp.find(m => m.id === 'gate').shown.join() === rk.slice(0, 3).join() && mp.find(m => m.id === 'gate').rest.join() === rk.slice(3).join() && mp.find(m => m.id === 'dam').rest.join() === 'Storm season', `Map: the expander lists exactly the hidden ones (Launch Complex: ${mp.find(m => m.id === 'gate').rest.join(', ')}; The Dam: ${mp.find(m => m.id === 'dam').rest.join(', ')})`);
  const hv = await p.evaluate(() => { const ov = document.getElementById('zcamp'), vis = id => getComputedStyle(ov.querySelector(`[data-pop="${id}"]`)).visibility, chip = ov.querySelector('[data-more="gate"]'), sel0 = ov.querySelector('.zc-n.sel')?.dataset.sec, out = {rest: vis('gate')};
    chip.dispatchEvent(new MouseEvent('mouseenter')); out.hover = vis('gate'); chip.dispatchEvent(new MouseEvent('mouseleave')); out.left = vis('gate');
    chip.dispatchEvent(new MouseEvent('click', {bubbles: true})); out.pin = vis('gate'); chip.dispatchEvent(new MouseEvent('mouseleave')); out.pinLeft = vis('gate'); out.sel = ov.querySelector('.zc-n.sel')?.dataset.sec === sel0;
    chip.dispatchEvent(new MouseEvent('click', {bubbles: true})); out.unpin = vis('gate'); return out; });
  ok(hv.rest === 'hidden' && hv.hover === 'visible' && hv.left === 'hidden' && hv.pin === 'visible' && hv.pinLeft === 'visible' && hv.unpin === 'hidden' && hv.sel, `Map: the "+2" chip shows its list on hover, holds it open on click, closes on a second click, and never changes the selected sector (${JSON.stringify(hv)})`);
  if (SHOTS) { await p.evaluate(() => document.querySelector('[data-more="gate"]').dispatchEvent(new MouseEvent('click', {bubbles: true}))); await p.screenshot({path: SHOTS + '/z-camp-map-cap.png'}); }
  const eff = await p.evaluate(() => { const Z = __z.Z; Z.cp.select('gate'); const li = document.querySelectorAll('#zcamp .zcpmods li').length; Z.cp.start('gate', true); const r = Z.cp.run;
    return {li, mods: r.mods.length, wave: +r.K.wave.toFixed(3), shift: r.K.shift, tot: r.K.tac.tot, boss5: r.mix.has('boss5'), raid: Z.cp.has('raid')}; });
  const waveK = +modsOf('gate', 0, feat).reduce((a, m) => a * (m.id === 'big' ? m.n : 1), 1).toFixed(3);  /* the Heavy pressure numbers multiply */
  ok(eff.li === 5 && eff.mods === 5 && eff.wave === waveK && eff.shift === 8 && eff.tot === .7 && eff.boss5, `Map: all five Launch Complex modifiers are listed in the briefing and in effect in the run (waves x${eff.wave}, enemies ${eff.shift} waves early, raids timed, Mothership every 5)`);
  ok(!errs.length, 'Sell: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
  await p.close();

  // 8. co-op: a client's sale, Undo and position close are requests to the host (a host and a client over the ?netloop transport)
  const URLN = origin + '/games/interceptor/?mode=zombies&netloop=40', cerrs = [];
  const cpage = async name => { const q = await open(browser, URLN, cerrs, {page: await newWindow(browser, {noRender: !SHOTS})});
    await q.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: 'z', wx: 'clear', zwx: 'menu', zdiff: 1, zcamp: undefined})));
    await q.reload({waitUntil: 'load'}); await q.waitForFunction(() => window.__z && window.__z.net, {timeout: 60000}); await q.$eval('#zname', (e, n) => { e.value = n; }, name); return q; };
  const until = (q, fn, arg) => q.waitForFunction(fn, {timeout: 60000, polling: 50}, arg).then(() => true, () => false);
  const H = await cpage('Hosty'), C = await cpage('Ash');
  await H.click('#zhost');
  ok(await until(H, () => __z.G.on && __z.G.state === 'base' && __z.net.n?.code), 'Sell, co-op: the host is up on the base screen');
  const code = await H.evaluate(() => __z.net.n.code);
  await C.$eval('#zcode', (e, c) => { e.value = c; }, code); await C.click('#zjoin');
  ok(await until(C, () => __z.G.on && __z.G.state === 'base' && __z.net.rows().length === 2 && !document.getElementById('zbase').hidden), 'Sell, co-op: the client joined the host\'s base screen');
  await H.evaluate(() => { const {G, Z} = __z; G.cash = 20000; const d = Z.base.act.place('flak', 0, 'Hosty'); Z.base.act.upgrade(d.id, 'lvl'); Z.base.refresh(); });
  ok(await until(C, () => __z.G.cash === 19100 && __z.Z.def.D.length === 1 && __z.Z.def.D[0].lvl === 1 && __z.Z.def.D[0].spent === 900), 'Sell, co-op: the client sees the host\'s flak mortar');
  const k1 = await C.evaluate(() => { const {G, Z} = __z; document.querySelector('[data-tab="armory"]').click(); const b = document.querySelector('[data-sell]'), label = b.textContent; b.click(); return {label, n: Z.def.D.length, cash: G.cash, ghost: !!document.querySelector('.zsold')}; });
  ok(k1.label === 'Sell +$900' && k1.n === 1 && k1.cash === 19100 && !k1.ghost, `Sell, co-op: the client's Sell button reads ${k1.label} and changes nothing on its own screen: it is a request to the host`);
  ok(await until(H, () => __z.Z.def.D.length === 0 && __z.G.cash === 20000 && __z.G.sold.length === 1), 'Sell, co-op: the host applied the sale (defence gone, purse $20,000, one Undo)');
  ok(await until(C, () => __z.Z.def.D.length === 0 && __z.G.cash === 20000 && !!document.querySelector('.zsold [data-undo]:not([disabled])')), 'Sell, co-op: the client sees the sale and an Undo on the card');
  await C.evaluate(() => document.querySelector('.zsold [data-undo]').click());
  ok(await until(H, () => __z.Z.def.D.length === 1 && __z.Z.def.D[0].lvl === 1 && __z.Z.def.D[0].spent === 900 && __z.G.cash === 19100 && !__z.G.sold.length), 'Sell, co-op: the client\'s Undo went to the host, which restored the flak mortar and took the $900 back');
  ok(await until(C, () => __z.Z.def.D.length === 1 && __z.G.cash === 19100 && !document.querySelector('.zsold') && !!document.querySelector('[data-sell]')), 'Sell, co-op: the client\'s card is back');
  const jx = await H.evaluate(() => { const {Z} = __z, j = Z.def.SLOTS.findIndex((s, i) => Z.def.canOpen(i, Z.meta.doc())); Z.base.act.expand(j); Z.base.refresh(); return j; });
  ok(await until(C, j => !!__z.G.xp?.[j] && __z.Z.def.slotOpen(j), jx), 'Sell, co-op: the client sees the position the host opened and what it cost');
  const k2 = await C.evaluate(j => { document.querySelector('[data-tab="sites"]').click(); const b = document.querySelector(`[data-xs="${j}"]`), label = b?.textContent; b?.click(); return {label, open: __z.Z.def.slotOpen(j)}; }, jx);
  ok(k2.label === 'Close +$1,800' && k2.open, `Sell, co-op: the client's ${k2.label} is a request too (the position is still open on its screen)`);
  ok(await until(H, j => !__z.Z.def.slotOpen(j) && __z.G.exp === 0, jx) && await until(C, j => !__z.Z.def.slotOpen(j) && !!document.querySelector('.zsold [data-undo]'), jx), 'Sell, co-op: the host closed the position; both screens show it dormant, with an Undo');
  await C.evaluate(() => document.querySelector('.zsold [data-undo]').click());
  ok(await until(H, j => __z.Z.def.slotOpen(j) && __z.G.exp === 1 && !__z.G.sold.length, jx), 'Sell, co-op: the client\'s Undo reopened the position on the host');
  ok(!cerrs.length, 'Sell, co-op: no errors' + (cerrs.length ? '\n  ' + cerrs.slice(0, 5).join('\n  ') : ''));
  await H.close(); await C.close();
}

/* ---------- enemies codex (zcodex.js): every campaign sector introduces one boss as a set piece (at its wave, with a radio warning); beating it marks it
   beaten in the save and losing to it marks it seen; the Enemies screen shows silhouettes until then and the full entry after, with an Allowed switch that
   filters the Quick defence boss pool (the Mothership is the free baseline boss; with every boss blocked the boss waves bring a heavy raid); the save round-trips; bots, the bench and the tests get the
   whole roster ---------- */
if (want('codex')) {
  // the tables and the pure rotation (node side)
  const sb = CAMP_SECTORS.map(s => CDX_SET[s.id]?.boss), cap = CAMP_SECTORS.find(s => s.cap);
  ok(CAMP_SECTORS.length === 12 && sb.every(Boolean) && new Set(sb).size === 12 && !sb.some(b => CDX_SECRET.includes(b)) && CDX_ORDER.join() === sb.join()
    && CAMP_SECTORS.every(s => CDX_SET[s.id].wave >= 3 && CDX_SET[s.id].wave <= s.obj - 2 && CDX_SET[s.id].warn.length > 30) && CDX_SET[cap.id].boss === 'hush',
    `Codex tables: each of the ${CAMP_SECTORS.length} sectors has its own boss (${sb.join(', ')}), a set wave with room after it and a radio line; the capstone gets the Hush, and no secret boss is on the map`);
  const bad = [null, 'x', 7, [], {v: 2, b: {twins: {beaten: true}}}, {v: 1, b: [1, 2]}, {v: 1, b: 'x'}].map(c => JSON.stringify(cleanCodex(c)));
  const dirty = cleanCodex({v: 1, b: {twins: {beaten: 'yes', allowed: 7}, nope: {beaten: true}, hive: {beaten: true, allowed: false}, jugg: [1], ace: {seen: true}, mirv: {beaten: true}, constructor: {beaten: true}}});
  ok(bad.every(s => s === '{"v":1,"b":{}}') && JSON.stringify(Object.keys(dirty.b).sort()) === '["ace","hive","mirv","twins"]' && !dirty.b.twins.beaten && dirty.b.twins.allowed && dirty.b.hive.beaten && dirty.b.hive.seen && !dirty.b.hive.allowed && dirty.b.ace.seen && !dirty.b.ace.beaten
    && JSON.stringify(cleanCodex(JSON.parse(JSON.stringify(dirty)))) === JSON.stringify(dirty), 'Codex save: any value cleans to a valid codex (wrong types, unknown ids, a foreign version drop out; beaten implies seen), and it round-trips through JSON');
  const c0 = cleanCodex(null);
  ok(CDX_FREE.join() === 'boss' && cdxAllowed(c0, 'boss') && !cdxAllowed(c0, 'twins') && !cdxAllowed({v: 1, b: {boss: {seen: true, beaten: false, allowed: false}}}, 'boss') && cdxAllowed({v: 1, b: {twins: {seen: true, beaten: true, allowed: true}}}, 'twins'),
    'Codex baseline: the Mothership is free (allowed on an empty codex, blockable); every other boss needs to be beaten, and is then allowed until blocked');
  const info = id => ({boss: {debut: 10}, twins: {debut: 20, event: {from: 14, p: .5}}, jugg: {debut: 20}})[id] || null, hv = () => ['heavy', 'jet'], isB = k => ['boss', 'twins', 'jugg'].includes(k), rot = (out, w, pool, rnd = () => .5, o = {}) => cdxRotate(out, w, {pool, info, heavy: hv, isBoss: isB, rnd, ...o}).out;
  const r1 = rot(['shahed', 'boss'], 10, []), r2 = rot(['shahed', 'boss'], 10, ['boss', 'twins']), r3 = rot(['shahed', 'boss'], 20, ['twins']), r4 = rot(['shahed', 'boss'], 40, ['boss', 'twins', 'jugg'], () => 0), r5 = rot(['shahed', 'boss'], 40, ['boss', 'twins', 'jugg'], () => .99), r6 = rot(['shahed', 'boss'], 60, ['boss', 'twins', 'jugg'], () => 0);
  const r7 = rot(['shahed', 'jet'], 16, ['twins'], () => 0), r8 = rot(['shahed', 'jet'], 16, ['twins'], () => 0, {bevW: 14}), r9 = rot(['shahed', 'jet'], 16, [], () => 0);
  ok(r1.join() === 'shahed,heavy,jet' && r2.join() === 'shahed,boss' && r3.join() === 'shahed,twins' && r4.filter(isB).length === 2 && r5.filter(isB).length === 1 && r6.filter(isB).length === 3 && r7.includes('twins') && !r8.includes('twins') && !r9.some(isB),
    `Codex rotation: no boss unlocked = a heavy raid in its place (${r1}); a boss waits for its first boss wave; a second joins from wave 30, a third from 60; events need the boss in the pool and stay three waves apart`);
  const s1 = cdxScripted(['shahed', 'boss', 'jet'], 10, {boss: 'twins', wave: 10}, false, hv, () => .5, isB), s2 = cdxScripted(['shahed', 'boss'], 10, {boss: 'twins', wave: 8}, false, hv, () => .5, isB), s3 = cdxScripted(['shahed', 'boss'], 10, {boss: 'twins', wave: 8}, true, hv, () => .5, isB),
    s4 = cdxScripted(['shahed', 'jet'], 8, {boss: 'twins', wave: 8}, false, hv, () => .99, isB), s5 = cdxScripted(['shahed', 'jet'], 8, {boss: 'undertaker', wave: 8, direct: 1}, false, hv, () => .99, isB);
  ok(s1.join() === 'shahed,twins,jet' && s2.join() === 'shahed,heavy,jet' && s3.join() === 'shahed,boss' && s4.join() === 'shahed,jet,twins' && s5.join() === 'shahed,jet', 'Codex set piece: it takes the boss-wave slot or joins its wave; a boss wave without one is a heavy raid (the Mothership-escort modifier keeps its Mothership); a direct one (the Undertaker) is not queued');

  const {p, errs} = await page();
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); delete s.zcodex; delete s.zboss; localStorage.setItem('dl-interceptor', JSON.stringify({...s, zwx: 'menu'})); sessionStorage.setItem('zbossRoster', '1'); sessionStorage.removeItem('zcodex'); });  /* the bosses on, a fresh codex, the player's rules */
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 3);
  const imgs = () => p.waitForFunction(() => { const im = [...document.querySelectorAll('#zcdx img[data-img]')]; return im.length >= 12 && im.every(i => i.src.startsWith('data:image/png')); }, {timeout: 30000});

  // the menu: an Enemies card, every boss a dark silhouette with its name hidden and a hint of the sector that introduces it
  const m0 = await p.evaluate(() => { const X = __z.Z.codex, r = X.rows(); return {card: /0 of 12/.test(document.getElementById('zcdxm')?.textContent || ''), btn: !!document.getElementById('zcdxbtn'), n: r.length, st: [...new Set(r.map(x => x.st))].join(), names: [...new Set(r.map(x => x.name))].join(), all: X.all(), pool: X.pool().join()}; });
  ok(m0.card && m0.btn && m0.n === 12 && m0.st === 'new' && m0.names === '???' && !m0.all && m0.pool === 'boss', `Codex menu: an Enemies card ("0 of 12 bosses beaten"), 12 unknown entries, and on a fresh profile only the free baseline boss (the Mothership) in the Quick defence pool (${JSON.stringify(m0)})`);
  await p.click('#zcdxbtn'); await imgs();
  const sc = await p.evaluate(() => { const X = __z.Z.codex, B = __z.Z.bosses.BOSSES, txt = X.el.querySelector('.zcdxg').textContent, SEC = __z.Z.cp.SECTORS, px = {}; for (const id of X.ORDER) px[id] = [X.pixels(X.shot(id, false)), X.pixels(X.shot(id, true))];
    return {opened: X.opened, cards: X.el.querySelectorAll('.zcdxc').length, sil: X.el.querySelectorAll('.zcdxc.new').length, leak: Object.values(B).filter(D => D.n && txt.includes(D.n)).map(D => D.n).concat(txt.includes('Mothership') ? ['Mothership'] : []),
      hints: X.rows().every(r => r.hint.includes(SEC.find(s => s.id === r.sector).n)), tog: X.el.querySelectorAll('[data-allow]').length, px}; });
  const ids = Object.keys(sc.px);
  ok(sc.opened && sc.cards === 12 && sc.sil === 12 && !sc.leak.length && sc.hints && sc.tog === 1, `Codex screen: 12 unknown cards, no name or description in the grid (${sc.leak.join() || 'none leaked'}), each with its sector ("Introduced in …"), an Allowed switch only on the free baseline boss (${sc.tog})`);
  const fb = await p.evaluate(() => { const X = __z.Z.codex, b = () => X.el.querySelector('[data-id="boss"] [data-allow]'), o = {t0: b().textContent, p0: X.pool().join()}; b().click(); o.t1 = b().textContent; o.p1 = X.pool().join(); o.st = X.rows().find(r => r.id === 'boss').st; b().click(); o.t2 = b().textContent; o.p2 = X.pool().join(); X.reset(); X.open(); return o; });
  ok(fb.t0 === 'Allowed ✓' && fb.p0 === 'boss' && fb.t1 === 'Blocked' && fb.p1 === '' && fb.t2 === 'Allowed ✓' && fb.p2 === 'boss' && fb.st === 'new', `Codex baseline boss: the Mothership's card is still dark until it is beaten, but its Allowed switch works (${fb.t0} → ${fb.t1} → ${fb.t2})`);
  ok(ids.every(id => sc.px[id][0].cover > .04 && sc.px[id][0].max <= 40 && !sc.px[id][0].col), `Codex silhouettes: each boss's model drawn flat and dark (coverage ${ids.map(id => Math.round(sc.px[id][0].cover * 100) + '%').join(' ')}, brightest pixel ${Math.max(...ids.map(id => sc.px[id][0].max))})`);
  ok(ids.every(id => sc.px[id][1].cover > .04 && sc.px[id][1].max >= 60) && ids.some(id => sc.px[id][1].col > .02), 'Codex full models: the same models drawn lit in their own colours (what a beaten entry shows)');
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-codex-new.png'});
  // a secret boss stays out of the grid until it is found
  const se = await p.evaluate(() => { const X = __z.Z.codex, n0 = X.rows().length; X.set('gace', 'seen', true); X.open(); const r = X.rows(), g = r.find(x => x.id === 'gace'), el = X.el.querySelector('[data-id="gace"]'); const o = {n0, n1: r.length, name: g?.name, st: g?.st, card: !!el && el.classList.contains('sec') && el.classList.contains('seen'), tog: !!el?.querySelector('[data-allow]')}; X.reset(); X.open(); o.n2 = X.rows().length; o.cards = X.el.querySelectorAll('.zcdxc').length; X.close(); return o; });
  ok(se.n0 === 12 && se.n1 === 13 && se.name === '???' && se.st === 'seen' && se.card && !se.tog && se.n2 === 12 && se.cards === 12, `Codex secrets: the Ghost of the Ace is not listed until it is found (12 → ${se.n1} once seen, still "???"), and is gone again with the reset`);

  // Quick defence on a fresh profile: the Mothership on its boss waves and no other boss; with it blocked a heavy raid instead; the base screen says so; the codex gates a boss's own trigger
  await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && !!__z.api.player, {timeout: 30000}); await frames(p, 2);
  const q0 = await p.evaluate(() => { const {Z} = __z, X = Z.codex, B = Z.bosses.BOSSES, out = {}, isB = k => k === 'boss' || B[k], W = [10, 20, 30, 40, 60];
    const meas = () => { const o = {}; for (const w of W) { let bosses = 0, other = 0, heavy = 0; for (let i = 0; i < 40; i++) for (const k of __z.plan(w).list) { const b = k.split(':')[0]; if (isB(b)) { bosses++; if (b !== 'boss') other++; } if (k === 'heavy' || k === 'cruise' || k === 'jet') heavy++; } o[w] = {bosses, other, heavy: Math.round(heavy / 40)}; } return o; };
    __z.G.next = __z.plan(10); Z.base.refresh(); out.bar = document.querySelector('#zbase .zcdxbar')?.textContent || ''; out.free = meas();
    X.set('boss', 'allowed', false); out.blocked = meas(); __z.G.next = __z.plan(10); Z.base.refresh(); out.bar2 = document.querySelector('#zbase .zcdxbar')?.textContent || ''; X.reset();
    const C = Z.bosses.ctx, a = C.spawn('undertaker'), b = Z.bosses.spawn('undertaker'), c = C.spawn('gace'); Z.bossClear('test'); out.gate = {gated: a === null, debug: !!b, secret: !!c}; return out; });
  ok(q0.free[10].bosses === 40 && [10, 20, 30, 40, 60].every(w => q0.free[w].bosses === 40 && !q0.free[w].other), `Quick defence, fresh profile: the Mothership on every boss wave (10 to 60), one a wave and no other boss (${[10, 20, 30, 40, 60].map(w => w + ': ' + q0.free[w].bosses / 40).join(', ')} per plan)`);
  ok([10, 20, 30, 40, 60].every(w => q0.blocked[w].bosses === 0 && q0.blocked[w].heavy >= 4), `Quick defence, the Mothership blocked and nothing else unlocked: no boss on waves 10 to 60, a heavy raid on the boss waves (jets, armoured heavies, cruise missiles: ${[10, 20, 30, 40, 60].map(w => w + ': ' + q0.blocked[w].heavy).join(', ')} a wave)`);
  ok(q0.gate.gated && q0.gate.debug && q0.gate.secret, 'Codex gate: a locked boss does not start by its own trigger (the Undertaker through the registry) but the debug trigger and the secret chain do');
  ok(/0 of 12 bosses beaten/.test(q0.bar) && /boss pool: Mothership/.test(q0.bar) && !/heavy raid/.test(q0.bar) && /none \(boss waves bring a heavy raid\)/.test(q0.bar2), `Codex base screen: the Enemies strip shows the pool ("${q0.bar.replace(/Enemies ▸$/, '').trim()}"), and "none (boss waves bring a heavy raid)" with the Mothership blocked`);
  await p.click('#zcdxb'); await p.waitForFunction(() => __z.Z.codex.opened, {timeout: 5000});
  await p.keyboard.press('Escape'); await sleep(150);
  const esc = await p.evaluate(() => ({closed: !__z.Z.codex.opened, menu: __z.api.menuOpen, base: !document.getElementById('zbase').hidden, focus: document.activeElement?.id}));
  ok(esc.closed && !esc.menu && esc.base && esc.focus === 'zcdxb', `Codex: the base screen's Enemies button opens it, Esc closes it (not the game's menu) and focus goes back (${JSON.stringify(esc)})`);

  // the campaign: the first sector's boss at its wave with a radio warning; beating it marks it beaten (unlocked, allowed) and the Quick defence pool gets it
  const cm = await p.evaluate(() => { const {Z, G, api} = __z, rs = [], r0 = Z.an.radio; Z.an.radio = (...a) => { rs.push(String(a[1])); return r0(...a); }; window.__rs = rs;
    Z.stop(); Z.cp.start('mill', true); G.cash = 1e5; const S = Z.codex.SET.mill, has = w => { let n = 0; for (let i = 0; i < 6; i++) if (__z.plan(w).list.includes('boss')) n++; return n; };
    const o = {before: [has(S.wave - 1), has(S.wave), has(S.wave + 1)]}; __z.jump(S.wave); G.next = __z.plan(S.wave); __z.cont(); __z.sim(1); o.radio = rs.includes(S.warn);
    __z.sim(8); const t = api.TH.find(u => u.k === 'boss' && api.live(u)); o.boss = !!t; o.seen = JSON.stringify(Z.codex.c.b.boss);
    G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); t.by = 'p'; for (let i = 0; i < 4 && api.live(t); i++) Z.bossHit(t); __z.sim(.5);
    o.after = JSON.stringify(Z.codex.c.b.boss); o.pool = Z.codex.pool().join(); o.new = G.cdx.new.join(); o.saved = JSON.stringify(JSON.parse(localStorage.getItem('dl-interceptor')).zcodex.b.boss);
    G.cpRes = 'won'; Z.gameOver(); o.over = /added to your codex/.test(document.getElementById('zover').textContent); return o; });
  ok(cm.before[0] === 0 && cm.before[1] === 6 && cm.before[2] === 0 && cm.radio && cm.boss, `Codex campaign: Old Mill's Mothership is in the plan on wave 5 only (${cm.before}), with Overlord's radio warning, and it arrives`);
  ok(cm.seen === '{"seen":true,"beaten":false,"allowed":true}' && cm.after === '{"seen":true,"beaten":true,"allowed":true}' && cm.saved === cm.after && cm.pool === 'boss' && cm.new === 'boss' && cm.over, `Codex campaign: meeting it marks it seen, beating it marks it beaten (allowed), it is saved, joins the Quick defence pool and the sector's result screen says so (${cm.after})`);

  // every sector's set piece: in the plan at its wave and nowhere else, and it really arrives with the radio warning (the Undertaker comes for a site the saboteurs put down)
  const s12 = await p.evaluate(() => { const {Z, G, api} = __z, out = {}, B = Z.bosses.BOSSES, isB = k => k === 'boss' || B[k], rs = window.__rs;
    for (const s of Z.cp.SECTORS) { Z.stop(); Z.cp.start(s.id, true); G.cash = 1e5; const S = Z.codex.SET[s.id], o = {}, at = w => { const L = []; for (let i = 0; i < 8; i++) L.push(__z.plan(w).list.filter(k => isB(k.split(':')[0])).join('+') || '-'); return [...new Set(L)].join('|'); };
      o.at = at(S.wave); o.pre = at(S.wave - 1); o.post = at(S.wave + 1); rs.length = 0;
      __z.jump(S.wave); G.next = __z.plan(S.wave); __z.cont(); let n = 0, t = null; while (n++ < 400 && !t) { __z.sim(.1); t = api.TH.find(u => u.k === S.boss && api.live(u)); }
      o.spawned = !!t; o.t = +(n * .1).toFixed(1); o.radio = rs.includes(S.warn); o.low = api.SITES.some(q => q.hp <= q.max * .25); out[s.id] = o; Z.bossClear('test'); }
    Z.stop(); return out; });
  for (const s of CAMP_SECTORS) { const o = s12[s.id], S = CDX_SET[s.id], want = S.direct ? '-' : S.boss;
    ok(o.at === want && o.pre === '-' && (o.post === '-' || s.cap && o.post === '-') && o.spawned && o.radio && (!S.direct || o.low), `Codex ${s.id}: ${S.boss} at wave ${S.wave} of ${s.obj} (plan ${o.at}, before ${o.pre}, after ${o.post}), arrived after ${o.t} s${S.direct ? ' for a sabotaged site' : ''}, radio warning${o.radio ? '' : ' MISSING'}`); }
  const cg = await p.evaluate(() => { const {Z, G} = __z, out = {}; Z.stop(); Z.cp.start('gate', true); const k = [5, 10, 15, 17, 20]; for (const w of k) { const L = []; for (let i = 0; i < 6; i++) L.push(__z.plan(w).list.filter(x => x === 'boss' || Z.bosses.BOSSES[x]).join('+') || '-'); out[w] = [...new Set(L)].join('|'); }
    Z.stop(); Z.cp.start('river', true); out.river10 = [...new Set(Array.from({length: 6}, () => __z.plan(10).list.filter(x => x === 'boss').length))].join(); out.river10h = Math.round(Array.from({length: 20}, () => __z.plan(10).list.filter(x => x === 'jet' || x === 'heavy').length).reduce((a, b) => a + b) / 20); Z.stop(); return out; });
  ok(cg[5] === 'boss' && cg[10] === 'boss' && cg[15] === 'boss' && cg[17] === 'hush' && cg[20] === 'boss' && cg.river10 === '0' && cg.river10h >= 4, `Codex campaign: the Launch Complex keeps its Mothership escort (waves 5, 10, 15, 20) and gets the Hush on 17; a sector without the modifier has no Mothership on wave 10, a heavy raid instead (${JSON.stringify(cg)})`);

  // beating marks beaten, losing marks seen
  const bt = await p.evaluate(() => { const {Z, G, api} = __z; Z.stop(); Z.cp.start('rail', true); G.cash = 1e5; const S = Z.codex.SET.rail; __z.jump(S.wave); G.next = __z.plan(S.wave); __z.cont();
    let n = 0, t = null; while (n++ < 200 && !t) { __z.sim(.1); t = api.TH.find(u => u.k === 'twins' && api.live(u)); }
    G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); for (const u of api.TH) if (u.k !== 'twins') u.st = 'dead'; __z.sim(.2);
    const o = {seen0: JSON.stringify(Z.codex.c.b.twins)}, enc = t.bs.enc; let runs = 0; for (let i = 0; i < 300 && !enc.over; i++) { if (api.player.dead > 0) api.launch(); if (Z.bosses.bot(1)) runs++; __z.sim(.3); for (const s of api.SITES) s.hp = s.max; }
    __z.sim(.5); o.won = !!enc.won; o.runs = runs; o.c = JSON.stringify(Z.codex.c.b.twins); o.pool = Z.codex.pool().join(); Z.stop(); return o; });
  ok(bt.seen0 === '{"seen":true,"beaten":false,"allowed":true}' && bt.won && bt.c === '{"seen":true,"beaten":true,"allowed":true}' && bt.pool === 'boss,twins', `Codex campaign: Rail Junction's Twins met (seen), then beaten in ${bt.runs} bot runs: beaten, allowed, in the pool (${bt.pool})`);
  const ls = await p.evaluate(() => { const {Z, G, api} = __z; Z.stop(); Z.cp.start('hosp', true); G.cash = 1e5; const S = Z.codex.SET.hosp; __z.jump(S.wave); G.next = __z.plan(S.wave); __z.cont();
    let n = 0, t = null; while (n++ < 200 && !t) { __z.sim(.1); t = api.TH.find(u => u.k === 'siren' && api.live(u)); }
    __z.sim(.3); const o = {met: JSON.stringify(Z.codex.c.b.siren)}; Z.bosses.ctx.vanish(t, 'escaped'); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); for (const u of api.TH) u.st = 'dead'; __z.sim(1.5);
    o.c = JSON.stringify(Z.codex.c.b.siren); o.lost = api.S.zboss?.b?.siren?.lost | 0; o.pool = Z.codex.pool().join(); Z.stop(); return o; });
  ok(ls.met === '{"seen":true,"beaten":false,"allowed":true}' && ls.c === ls.met && ls.lost === 1 && ls.pool === 'boss,twins', `Codex campaign: the Siren got away at Hospital Hill: marked seen, not beaten, not in the pool (lost ${ls.lost}×, pool ${ls.pool})`);

  // the screen after that: the beaten in full (name, line, trophy, Allowed switch), the seen and unknown still dark
  await p.evaluate(() => { __z.Z.codex.open(); }); await imgs();
  const f1 = await p.evaluate(() => { const X = __z.Z.codex, el = id => X.el.querySelector(`[data-id="${id}"]`), row = id => X.rows().find(r => r.id === id), px = id => X.pixels(X.shot(id, row(id).st === 'beaten')), tw = el('twins'), si = el('siren'), mo = el('boss'), ju = el('jugg');
    return {tw: {cls: tw.className, name: tw.querySelector('h3').textContent, trophy: /Twin Darts/.test(tw.textContent), line: (tw.querySelector('.zcdxd')?.textContent || '').length > 20, allow: tw.querySelector('[data-allow]')?.textContent, img: tw.querySelector('img').dataset.full},
      si: {cls: si.className, name: si.querySelector('h3').textContent, line: !!si.querySelector('.zcdxd'), hint: si.querySelector('.zcdxh')?.textContent, allow: !!si.querySelector('[data-allow]')}, mo: {name: mo.querySelector('h3').textContent, trophy: /No trophy/.test(mo.textContent)}, ju: {cls: ju.className, name: ju.querySelector('h3').textContent},
      px: {tw: px('twins'), si: px('siren'), jugg: px('jugg')}, head: X.el.querySelector('.zcdxs').textContent, count: X.count()}; });
  ok(f1.tw.cls.includes('beaten') && f1.tw.name === 'The Twins' && f1.tw.trophy && f1.tw.line && f1.tw.allow === 'Allowed ✓' && f1.tw.img === '1' && f1.mo.name === 'Mothership' && f1.mo.trophy, `Codex beaten entries in full: "${f1.tw.name}" with its line, trophy and an Allowed switch, "${f1.mo.name}" (no trophy)`);
  ok(f1.si.cls.includes('seen') && f1.si.name === '???' && !f1.si.line && !f1.si.allow && /You have met it/.test(f1.si.hint) && f1.ju.cls.includes('new') && f1.ju.name === '???' && f1.count.n === 2 && /2 of 12/.test(f1.head), `Codex unbeaten entries stay dark: the Siren (met, got away) is "???" with a note that you met it, the rest unknown; ${f1.head.trim()}`);
  ok(f1.px.tw.max >= 60 && f1.px.si.max <= 40 && f1.px.jugg.max <= 40, `Codex pictures: the beaten Twins lit in colour (brightest ${f1.px.tw.max}), the Siren and the Juggernaut flat and dark (${f1.px.si.max}, ${f1.px.jugg.max})`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-codex.png'});

  // the Allowed switch filters the Quick defence pool; more bosses come more often than one every ten waves
  const al = await p.evaluate(() => { const {Z} = __z, X = Z.codex, B = Z.bosses.BOSSES, isB = k => k === 'boss' || B[k], out = {}; X.close(); document.getElementById('play').click(); X.set('jugg', 'beaten', true); X.open();
    const cnt = (w, n = 60) => { const h = {}, per = []; for (let i = 0; i < n; i++) { __z.G.bseen = {}; __z.G.bevW = -99; const L = __z.plan(w).list.filter(k => isB(k.split(':')[0])); per.push(L.length); for (const k of L) h[k] = (h[k] | 0) + 1; } return {h, max: Math.max(...per)}; };
    out.pool0 = X.pool().join(); X.el.querySelector('[data-allow="twins"]').click(); out.pool1 = X.pool().join(); out.btn = X.el.querySelector('[data-allow="twins"]').textContent; out.saved = JSON.parse(localStorage.getItem('dl-interceptor')).zcodex.b.twins.allowed;
    out.w10 = cnt(10); out.w20 = cnt(20); out.w40 = cnt(40); X.el.querySelector('[data-allow="twins"]').click(); out.pool2 = X.pool().join(); out.btn2 = X.el.querySelector('[data-allow="twins"]').textContent; out.w60 = cnt(60, 100); out.w20b = cnt(20);
    X.el.querySelector('[data-all="0"]').click(); out.pool3 = X.pool().join(); out.w10c = cnt(10, 20); X.el.querySelector('[data-all="1"]').click(); out.pool4 = X.pool().join(); X.close();
    const C = Z.bosses.ctx, a = C.spawn('undertaker'); X.set('undertaker', 'beaten', true); const b = C.spawn('undertaker'); Z.bossClear('test'); X.set('undertaker', 'allowed', false); const c = C.spawn('undertaker'); X.set('undertaker', 'allowed', true); out.gate = {a, b: !!b, c};  /* the Undertaker's own trigger: locked, unlocked, blocked */
    Z.stop(); return out; });
  ok(al.pool0 === 'boss,twins,jugg' && al.pool1 === 'boss,jugg' && al.btn === 'Blocked' && al.saved === false && al.pool2 === 'boss,twins,jugg' && al.btn2 === 'Allowed ✓' && al.pool3 === '' && al.pool4 === 'boss,twins,jugg', `Codex Allowed switch: Twins off leaves the pool ${al.pool1} (and the save), on brings it back (${al.pool2}); Block all empties it, Allow all fills it`);
  ok(!al.w40.h.twins && al.w40.h.jugg > 0 && al.w40.h.boss > 0 && !al.w10.h.jugg && !al.w10.h.twins && al.w10.max === 1 && al.w20.max === 1 && al.w20b.max === 1 && al.w40.max === 2 && al.w60.max === 3 && al.w10c.max === 0,
    `Codex pool in play: a blocked boss never comes (wave 40: ${JSON.stringify(al.w40.h)}), none before its first boss wave (wave 10: ${JSON.stringify(al.w10.h)}), one boss on waves 10 and 20, a second from 30 (max ${al.w40.max}), a third from 60 (max ${al.w60.max}), a heavy raid with none allowed`);
  ok(al.gate.a === null && al.gate.b && al.gate.c === null, 'Codex gate: the Undertaker\'s own trigger needs it unlocked and allowed (locked: nothing, unlocked: it comes, blocked: nothing)');

  // the save round-trips; odd saved values load and play
  const sv = await p.evaluate(() => ({ls: JSON.parse(localStorage.getItem('dl-interceptor')).zcodex, c: __z.Z.codex.c, rows: __z.Z.codex.rows().map(r => r.id + ':' + r.st + ':' + r.allowed).join()}));
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000});
  const sv2 = await p.evaluate(() => ({c: __z.Z.codex.c, rows: __z.Z.codex.rows().map(r => r.id + ':' + r.st + ':' + r.allowed).join(), card: document.getElementById('zcdxm').textContent}));
  ok(JSON.stringify(sv.ls) === JSON.stringify(sv.c) && JSON.stringify(sv2.c) === JSON.stringify(sv.c) && sv2.rows === sv.rows && /4 of 12/.test(sv2.card) && sv.c.b.twins.beaten && sv.c.b.boss.beaten && !sv.c.b.siren.beaten && sv.c.b.siren.seen, `Codex save: beaten / seen / allowed survive a reload exactly (${sv2.card.replace(/\s+/g, ' ').slice(0, 70)})`);
  const odd = [];
  for (const z of ['x', 7, [], {v: 1, b: [1]}, {v: 2, b: {twins: {beaten: true}}}, {v: 1, b: {twins: {beaten: 'true', allowed: 3}, nope: {beaten: true}, __proto__: {beaten: true}}}]) {
    const n0 = errs.length; await p.evaluate(z => { const s = JSON.parse(localStorage.getItem('dl-interceptor')); s.zcodex = z; localStorage.setItem('dl-interceptor', JSON.stringify(s)); }, z); await p.reload({waitUntil: 'load'});
    const up = await p.waitForFunction(() => window.__z, {timeout: 60000}).then(() => true, () => false);
    const r = up && await p.evaluate(() => { __z.Z.codex.open(); const r = __z.Z.codex.rows(); __z.Z.codex.close(); return r.length === 12 && r.every(x => x.st === 'new') && __z.Z.codex.pool().join() === 'boss'; });
    if (!up || errs.length > n0 || !r) odd.push(JSON.stringify(z)); }
  ok(!odd.length, 'Codex save: odd saved values (text, numbers, arrays, a foreign version, wrong types, unknown ids) load as an empty codex and the screen opens' + (odd.length ? '\n  ' + odd.join('\n  ') + '\n  ' + errs.slice(0, 3).join('\n  ') : ''));

  // bots, the bench and the tests: the whole roster, the old rotation, nothing written to the save
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dl-interceptor')); s.zcodex = {v: 1, b: {}}; localStorage.setItem('dl-interceptor', JSON.stringify(s)); sessionStorage.setItem('zcodex', 'all'); });
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 2);
  const bo = await p.evaluate(() => { const {Z, G} = __z, X = Z.codex, B = Z.bosses.BOSSES; document.getElementById('play').click(); const o = {all: X.all(), pool: X.pool().length, w10: __z.plan(10).list.filter(k => k === 'boss' || B[k]).join()};
    const set = new Set(); for (let i = 0; i < 80; i++) { G.bseen = {}; set.add(__z.plan(30).list.find(k => k === 'boss' || B[k])); } o.p30 = set.size; const c0 = JSON.stringify(X.c); X.note('twins', 'won'); o.wrote = JSON.stringify(X.c) !== c0; o.bar = (document.getElementById('zcdxm')?.textContent || '').slice(0, 60);
    const C = Z.bosses.ctx; o.gate = !!C.spawn('undertaker'); Z.bossClear('test'); Z.stop(); return o; });
  ok(bo.all && bo.pool >= 10 && bo.w10 === 'boss' && bo.p30 >= 4 && !bo.wrote && bo.gate, `Codex bots and tests (sessionStorage zcodex = all): every boss unlocked and allowed (${bo.pool} in the pool), wave 10 the Mothership and wave 30 drawing from ${bo.p30} bosses as before, nothing written, no gate`);
  const hooked = ['zombies-bench', 'zombies-campaign-bench', 'zombies-arsenal-bench', 'zombies-soak', 'zombies-tick', 'zsoaklong'].filter(f => !/sessionStorage\.setItem\('zcodex', 'all'\)/.test(fs.readFileSync(new URL(`./${f}.mjs`, import.meta.url), 'utf8')));
  ok(!hooked.length, 'Codex bench: the benchmark (the bot-only leaderboard), the campaign / arsenal benches and the soaks all run with the whole roster' + (hooked.length ? ' (missing in ' + hooked.join(', ') + ')' : ''));
  await p.evaluate(() => { sessionStorage.removeItem('zcodex'); }); await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 2);
  const sp = await p.evaluate(() => { const {Z, G} = __z, X = Z.codex, B = Z.bosses.BOSSES, o = {off: X.all()}, c0 = JSON.stringify(X.c); __z.spec.start({lv: 'Pro', d: 1, sec: '', doc: 'std', kit: []}); o.on = X.all(); o.pool = X.pool().length; o.w10 = __z.plan(10).list.filter(k => k === 'boss' || B[k]).join();
    X.note('twins', 'won'); o.wrote = JSON.stringify(X.c) !== c0; __z.spec.stop(); Z.stop(); o.after = X.all();
    __z.spec.start({lv: 'Pro', d: 1, sec: 'rail', doc: 'std', kit: []}); o.sec = __z.plan(Z.codex.SET.rail.wave).list.includes('twins'); o.secAll = X.all(); __z.spec.stop(); Z.stop(); return o; });
  ok(!sp.off && sp.on && sp.pool >= 10 && sp.w10 === 'boss' && !sp.wrote && !sp.after && sp.sec && sp.secAll, `Codex Bot Spectator: a bot's run has every boss unlocked and allowed by itself (pool ${sp.pool}), writes nothing, and a campaign sector still plays its set piece; off again after`);
  ok(!errs.length, 'Codex: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
  await p.close();
}

// ---------- radio chatter (zradio.js): callouts from the game's state, merged and rate-limited; the HUD log, a modest squelch and static (no
// voice); the old subtitle taken over and given back; muted in menus; nothing left behind when a wave ends ----------
if (want('radio')) {
  const {p, errs} = await page();
  await play(p);
  const r0 = await p.evaluate(() => { const {S} = __z.api, {Z} = __z, R = Z.radio;
    window.__spoke = 0; try { Object.defineProperty(window, 'speechSynthesis', {configurable: true, get: () => ({speak() { window.__spoke++; }, cancel() {}, getVoices() { return []; }})}); } catch (e) { /* no trap here */ }  /* the radio has no voice: a trap counts any attempt to speak */
    window.__rf = () => { R.flush(); for (let i = 0; i < 5; i++) R.step(2); };  /* make the merged calls due and let the channel run */
    window.__at = (brg, k = 'shahed', site = 1, rr = 5000) => __z.make(k, Math.sin(brg) * rr, 1950 - Math.cos(brg) * rr, __z.api.SITES[site]);
    window.__clr = () => { for (const u of __z.api.TH) __z.api.scene.remove(u.mesh); __z.api.TH.length = 0; const k = __at(.3, 'shahed', 0, 5000); k._rz = 1; };  /* the sky is emptied but for one far track nobody calls: the page's own loop would end the wave between two checks */
    return {has: !!R, rows: ['f_zradio', 'f_zradiov'].map(id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; }), css: !!document.querySelector('link[href*="zradio.css"]'), chat: !!document.getElementById('zchat'),
      def: [S.zradio, S.zradiov], voiceRow: !!document.getElementById('f_zrspeech'), voiceKey: 'zrspeech' in S, cap: R.cap, ac: !!__z.api.AC}; });
  ok(r0.has && r0.css && r0.chat && r0.rows.every(Boolean) && !r0.voiceRow && !r0.voiceKey, 'Radio: the module is up with its HUD log, stylesheet and two settings rows (chatter, volume), none of them hidden, and no speech row or setting');
  ok(r0.def[0] === true && r0.def[1] === .6 && r0.cap <= .1, `Radio: defaults are chatter on, volume ${r0.def[1]}; the sound cap is ${r0.cap}`);
  /* the old subtitle's radio sound (zaudio.js Z.au.radio, heard with the chatter off) has no synthesized voice either: a squelch, static and one roger beep, no sawtooth syllables (asked while the page is quiet: the voice budget skips it when busy) */
  const ro = await p.evaluate(() => { const {Z, api} = __z, AC = api.AC; if (!AC || !Z.au.ready) return null; const made = [], c0 = AC.createOscillator.bind(AC); AC.createOscillator = () => { const o = c0(); made.push(o); return o; };
    try { Z.au.radio(1.5); } finally { delete AC.createOscillator; } return made.map(o => o.type); });
  ok(ro === null || ro.length === 1 && ro[0] === 'sine', `Radio sound: the old subtitle's call is a squelch, static and one roger beep, no voice (oscillators: ${ro && ro.join() || 'none'})`);

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
  const q1 = await p.evaluate(() => { const {Z} = __z, R = Z.radio, out = {}; R.hush(); R.calls.length = 0; const c0 = R.st.cut;
    R.say('x', 1, 'OVERLORD', 'This is a long routine call that keeps the channel busy for a good while yes.'); const c1 = R.cur;
    R.say('y', 2, 'OVERLORD', 'Important but not urgent.'); out.imp = {cur: R.cur === c1, queued: R.q.map(c => c.txt), cut: R.st.cut - c0};
    R.say('z', 3, 'OVERLORD', 'Urgent call.'); out.urg = {cur: R.cur?.txt, firstCut: c1.cut === 1, cut: R.st.cut - c0};
    R.hush(); const s0 = R.st.drop.stale, d0 = R.st.drop.dup, k0 = R.st.drop.cool;
    R.say('a', 1, 'OVERLORD', 'First long call that holds the channel for quite a long while, over.'); R.say('c', 1, 'OVERLORD', 'Second long call that also holds the channel for a good while, over.'); R.say('b', 0, 'OVERLORD', 'Ambient chatter that goes stale.');
    R.step(7); R.step(1); out.stale = {dropped: R.st.drop.stale - s0, said: R.calls.some(c => /Ambient/.test(c.txt))};
    R.hush(); R.say('d', 1, 'OVERLORD', 'Same words.'); const again = R.say('d2', 1, 'OVERLORD', 'Same words.'); out.dup = {again, n: R.st.drop.dup - d0};
    R.say('kill', 0, 'DART ONE', 'Splash one.'); const k2 = R.say('kill', 0, 'DART ONE', 'Splash two.'); out.cool = {again: k2, n: R.st.drop.cool - k0}; R.hush(); return out; });
  ok(q1.imp.cur && q1.imp.queued.length === 1 && q1.imp.cut === 0, 'Radio channel: an important (priority 2) call waits for the one on the air');
  ok(q1.urg.cur === 'Urgent call.' && q1.urg.firstCut && q1.urg.cut === 1, 'Radio channel: only an urgent (priority 3) call cuts in on the one on the air');
  ok(q1.stale.dropped >= 1 && !q1.stale.said, 'Radio channel: an ambient call that waited too long is dropped, not said late');
  ok(q1.dup.again === false && q1.dup.n === 1 && q1.cool.again === false && q1.cool.n === 1, 'Radio channel: the same words twice, and a second call of a topic inside its cooldown, are not said');

  /* the first-run guide's lines (soft, zonboard.js): in a wave a battle call goes first and may cut in on one (said again once), the guide does not use up the battle budget, and a line that waited is still said */
  const gd = await p.evaluate(() => { const {G, Z} = __z, R = Z.radio, out = {wave: G.state}, L = 'A long guide line that keeps the channel busy for a good while yes, over.', soft = {nb: 1, over: true, soft: 1};
    const heard = () => R.calls.map(c => c.txt.slice(0, 12) + (c.cut ? '*' : '')).join('|'), adv = s => { for (let t = 0; t < s; t += .25) R.step(.25); };  /* the channel runs frame by frame: a coarse step would only age the waiting guide line */
    R.hush(); R.calls.length = 0; R.say('guide', 2, 'OVERLORD', L, soft); const c1 = R.cur; R.say('trk', 1, 'OVERLORD', 'Battle call one.'); adv(.25);
    out.cut = {first: c1.cut === 1, now: R.cur?.txt, again: R.q.some(c => c.txt === L && c.re === 1)}; adv(12); out.cutHeard = heard();
    R.hush(); R.calls.length = 0; R.say('x', 1, 'OVERLORD', 'A long routine call that is on the air while the other two wait their turn.'); R.say('guide', 2, 'OVERLORD', L, soft); R.say('trk', 1, 'OVERLORD', 'Battle call two.');
    adv(16); out.order = heard();
    R.hush(); R.calls.length = 0; const r0 = R.st.drop.rate; for (let i = 0; i < 6; i++) { R.say('guide', 2, 'OVERLORD', 'Guide line number ' + i + '.', soft); adv(3); }
    for (const [k, t] of [['trk', 'Track one.'], ['fast', 'Track two.'], ['site', 'Track three.']]) { R.say(k, 1, 'OVERLORD', t); adv(3); }
    out.budget = {rate: R.st.drop.rate - r0, battle: R.calls.filter(c => c.pri === 1).length, guide: R.calls.filter(c => c.topic === 'guide').length};
    R.hush(); R.calls.length = 0; let gone = false; R.say('x', 1, 'OVERLORD', 'A long routine call that is on the air while the guide line waits.'); R.say('guide', 2, 'OVERLORD', L, {...soft, alive: () => !gone}); gone = true; adv(12); out.alive = heard();
    R.hush(); R.calls.length = 0; return out; });
  ok(gd.wave === 'wave' && gd.cut.first && gd.cut.now === 'Battle call one.' && gd.cut.again && gd.cutHeard === 'A long guide*|Battle call |A long guide', `Radio guide: a battle call cuts in on a guide line during the wave and the guide line is said again after it (${gd.cutHeard})`);
  ok(gd.order === 'A long routi|Battle call |A long guide', `Radio guide: queued together, the battle call is said before the guide line (${gd.order}), and the guide line still comes (it was not starved)`);
  ok(gd.budget.guide === 6 && gd.budget.battle === 3 && gd.budget.rate === 0, `Radio guide: six guide lines do not use up the battle budget (battle calls said ${gd.budget.battle} of 3, rate-limited ${gd.budget.rate}, guide lines ${gd.budget.guide})`);
  ok(gd.alive === 'A long routi', `Radio guide: a guide line whose prompt is gone is not said late (${gd.alive})`);

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
  /* a boss the pilot cannot see is an unknown contact (no name, bearing or time: the call would do the hunting); Little Buddy's bump is the Buddy's kill; the site has its article */
  const hw = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, out = {}; __clr(); R.hush(); R.calls.length = 0;
    const h = Z.bosses.spawn('hush', {brg: 1}); __z.sim(.6); __rf(); for (let i = 0; i < 4; i++) R.step(2); out.hush = R.calls.map(c => c.txt); out.hid = Z.hid(h); out.hushName = R.calls.some(c => /Hush|Heavy contact|north|south|east|west|minute|seconds/.test(c.txt)); Z.bossClear('test'); Z.fxTest?.endCine(); __clr(); R.hush(); R.calls.length = 0;
    const m = __z.make('shahed', 3000, 1000, api.SITES[1]); __z.sim(.3); R.hush(); R.calls.length = 0; m.bd = 1; Z.helperKill(m); __rf(); out.buddy = R.calls.map(c => c.who + '|' + c.txt); __clr(); R.hush(); R.calls.length = 0;
    const t = __z.make('shahed', 3000, 1000, api.SITES[2]); const L = new Set(); for (let i = 0; i < 80; i++) for (const c of R.GEN.trk([{t, k: 'shahed', id: 5, dir: 'east', site: 'apartments', eta: 60, n: 1}], {over: 0})) L.add(c.txt); out.trk = [...L]; __clr(); return out; });
  ok(hw.hid && hw.hush.some(s => /unknown contact/i.test(s)) && !hw.hushName, `Radio bosses: the Hush is an unknown contact, no name, bearing or time ("${hw.hush.join(' / ')}")`);
  ok(hw.buddy.length === 1 && /^BUDDY\|/.test(hw.buddy[0]), `Radio kills: Little Buddy's bump is called by BUDDY ("${hw.buddy[0]}")`);
  ok(hw.trk.length >= 2 && hw.trk.every(s => /the apartments/.test(s)), `Radio tracks: every phrasing of a track for the apartments says "the apartments" (${hw.trk.length} phrasings)`);

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
  const au = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, S = api.S, out = {}; R.hush(); const n0 = R.au.n;
    S.zradiov = 1; S.zsfxv = 1; for (const t of ['Level check one.', 'Level check two.', 'Level check three.', 'Level check four.']) { R.say('lv' + t, 2, 'OVERLORD', t); R.step(6); R.step(1); }
    out.full = {peak: R.au.peak, bus: R.busGain(), n: R.au.n - n0}; out.lines = R.lines(); out.dom = document.querySelectorAll('#zchat .zc').length;
    S.zradiov = 9; S.zsfxv = 7; R.hush(); R.say('lvb', 2, 'OVERLORD', 'Level check five.'); out.bad = {peak: R.au.peak, bus: R.busGain()};
    S.zradiov = 0; R.hush(); const n1 = R.au.n; R.say('lvc', 2, 'OVERLORD', 'Level check six.'); out.mute = {sound: R.au.n - n1, logged: R.calls.at(-1)?.txt};
    S.zradiov = .6; S.zsfxv = 1; R.hush(); out.ac = !!api.AC; return out; });
  ok(au.ac ? au.full.n === 4 && au.full.peak > 0 && au.full.peak <= r0.cap + 1e-9 && au.full.bus <= r0.cap + 1e-9 && au.bad.peak <= r0.cap + 1e-9 && au.bad.bus <= r0.cap + 1e-9 : true,
    `Radio sound: a squelch click and a static burst per call (${au.full.n} for 4 calls); loudest ${au.full.peak.toFixed(3)} at full volume, ${au.bad.bus.toFixed(3)} even with a bad volume setting, cap ${r0.cap}`);
  ok(au.lines.length === 3 && au.dom === 3 && /Level check four/.test(au.lines[2]), `Radio log: the HUD shows the last three calls (${au.lines.map(l => l.replace(/^OVERLORD/, '')).join(' | ')})`);
  ok(au.mute.sound === 0 && au.mute.logged === 'Level check six.', 'Radio volume 0: the call is still logged on the HUD but there is no sound');

  // no voice: nothing in all of that asked the browser to speak
  const nv = await p.evaluate(() => ({spoke: window.__spoke, n: __z.Z.radio.calls.length}));
  ok(nv.spoke === 0 && nv.n > 0, `Radio: ${nv.n} calls were made and none was spoken (the radio is text, squelch and static only; speak() called ${nv.spoke} times)`);

  // muted in menus
  const mu = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, out = {}; __clr(); __at(.3, 'shahed', 0, 5000); R.hush(); R.calls.length = 0; const q0 = R.st.drop.quiet;
    R.say('m1', 1, 'OVERLORD', 'Menu check before.'); out.before = R.cur?.txt; api.showMenu(true); __z.sim(.3);
    out.cleared = !R.cur && !R.q.length && R.lines().length === 0; const ok1 = R.say('m2', 1, 'OVERLORD', 'Menu check during.'); out.during = {ok: ok1, drop: R.st.drop.quiet - q0, cur: R.cur?.txt};
    api.showMenu(false); R.hush(); const ok2 = R.say('m3', 1, 'OVERLORD', 'Menu check after.'); out.after = {ok: ok2, cur: R.cur?.txt}; R.hush(); return out; });
  ok(mu.before === 'Menu check before.' && mu.cleared && mu.during.ok === false && mu.during.drop === 1 && !mu.during.cur && mu.after.ok === true, 'Radio menus: opening the menu hushes the channel (log cleared) and nothing is said while it is open');

  // the settings rows, saved with the rest; Off gives the old subtitle back
  await p.select('#f_zradio', '0'); await p.$eval('#f_zradiov', e => { e.value = '.3'; e.dispatchEvent(new Event('input')); });
  const sv = await p.evaluate(() => { const {Z, api} = __z, R = Z.radio, out = {}, s = JSON.parse(localStorage.getItem('dl-interceptor')); out.saved = [s.zradio, s.zradiov]; out.live = [api.S.zradio, api.S.zradiov];
    R.hush(); const n0 = R.st.made; Z.an.radio('OVERLORD', 'Sky is clear. Rearm and stand by.', 1); Z.an.radioTick(); out.legacy = {cls: document.getElementById('zradio').className, made: R.st.made - n0}; Z.an.radioClear?.();
    out.sayOff = R.say('off1', 2, 'OVERLORD', 'Radio is off.'); return out; });
  ok(sv.saved[0] === false && sv.saved[1] === .3 && sv.live[0] === false, `Radio settings: chatter and volume are saved with the other settings (${sv.saved.join(', ')})`);
  ok(/on/.test(sv.legacy.cls) && sv.legacy.made === 0 && sv.sayOff === false, 'Radio settings: with the chatter off the old radio subtitle comes back and nothing is queued');
  await p.select('#f_zradio', '1'); await p.$eval('#f_zradiov', e => { e.value = '.6'; e.dispatchEvent(new Event('input')); });

  // the end of this scripted wave (the sky is emptied): the clear is called, and when the base screen opens nothing is left on the air, in the queue or on the HUD
  const w0 = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {}; for (const u of api.TH) api.scene.remove(u.mesh); api.TH.length = 0; R.hush(); R.calls.length = 0; const by0 = R.st.by.wave | 0; G.wq.length = 0;
    let n = 0; while (G.state !== 'base' && n++ < 40) __z.sim(.5);
    out.state = G.state; out.by = (R.st.by.wave | 0) - by0; out.calls = R.calls.map(c => c.topic + '|' + c.txt);
    out.left = {q: R.q.length, cur: !!R.cur, pend: R.pend().length, lines: R.lines().length, dom: document.querySelectorAll('#zchat .zc').length, sw: R.sw()}; return out; });
  ok(w0.state === 'base' && w0.by === 1 && /^wave\|.*(Sky is clear|held|defeated|All tracks down)/.test(w0.calls[0] || ''), `Radio wave end: the clear is called ("${(w0.calls[0] || '').split('|')[1]}")`);
  ok(w0.left.q === 0 && !w0.left.cur && w0.left.pend === 0 && w0.left.lines === 0 && w0.left.dom === 0 && w0.left.sw === 0, `Radio wave end: the base screen opens quiet, nothing left (queue ${w0.left.q}, on air ${w0.left.cur}, merging ${w0.left.pend}, HUD lines ${w0.left.lines}/${w0.left.dom})`);

  // a whole wave played by the director and a bot: the start and the end are called, kills and tracks in between, and again nothing is left when the base screen opens
  const w1 = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.radio, out = {}; R.hush(); R.calls.length = 0; const by0 = {...R.st.by};
    __z.cont(); for (let i = 0; i < 700 && G.state !== 'base'; i++) { __z.sim(.5); if (api.player.dead <= 0 && Math.random() < .5) __z.botKill(.8); }
    out.state = G.state; out.by = Object.fromEntries(Object.keys(R.st.by).map(k => [k, R.st.by[k] - (by0[k] | 0)])); out.calls = R.calls.map(c => c.topic + '|' + c.txt);
    __z.sim(.2); out.left = {state: G.state, q: R.q.length, cur: !!R.cur, pend: R.pend().length, lines: R.lines().length, dom: document.querySelectorAll('#zchat .zc').length, sw: R.sw()};
    out.err = R.err && String(R.err.stack || R.err); out.th = api.TH.filter(api.live).map(t => t.k).join(); out.wave = G.wave; return out; });
  ok(w1.state === 'base' && w1.by.wave >= 2 && w1.calls.some(c => /^wave\|(Wave|Stand to)/.test(c)) && w1.calls.length >= 3, `Radio wave: a wave played end to end made ${w1.calls.length} calls, the start and the end among them (${w1.by.wave} wave calls)`);
  ok(w1.left.state === 'base' && w1.left.q === 0 && !w1.left.cur && w1.left.pend === 0 && w1.left.lines === 0 && w1.left.dom === 0 && w1.left.sw === 0, `Radio wave end: the base screen is quiet, nothing left (queue ${w1.left.q}, on air ${w1.left.cur}, merging ${w1.left.pend}, HUD lines ${w1.left.lines}/${w1.left.dom})`);

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

  // odd saved values (hand-edited or foreign) fall back to the defaults, a saved speech setting is dropped (settings v6), and the game still plays
  const bad = [];
  for (const save of [{gmode: 'z', zradio: 'x', zrspeech: 5, zradiov: 'loud'}, {gmode: 'z', zradio: null, zrspeech: [], zradiov: 9}, {gmode: 'z', zradiov: -3}, {gmode: 'z', zradiov: null}, {gmode: 'z', zradio: false, zrspeech: false}]) {
    const e2 = [], p2 = await open(browser, origin + '/games/interceptor/', e2);
    await p2.evaluate(s => localStorage.setItem('dl-interceptor', JSON.stringify(s)), save); await p2.reload({waitUntil: 'load'});
    const up = await p2.waitForFunction(() => window.__z, {timeout: 60000}).then(() => true, () => false);
    let r = null;
    if (up) { await sleep(200); await p2.click('#play'); await sleep(300); r = await p2.evaluate(() => { const {G, Z, api} = __z; if (G.on) __z.cont(); __z.sim(5); const S = api.S; return {z: S.zradio, s: 'zrspeech' in S, v: S.zradiov, ok: typeof S.zradiov === 'number' && S.zradiov >= 0 && S.zradiov <= 1 && typeof S.zradio === 'boolean' && !('zrspeech' in S), err: Z.radio.err && String(Z.radio.err)}; }); }
    if (!up || e2.length || !r?.ok || r.err) bad.push(JSON.stringify(save) + ' -> ' + JSON.stringify(r) + (up ? '' : ' (page never came up)') + (e2.length ? ' ' + e2[0] : ''));
    await p2.evaluate(() => localStorage.removeItem('dl-interceptor')); await p2.close();
  }
  ok(!bad.length, 'Radio saves: odd saved values load as defaults and play' + (bad.length ? '\n  ' + bad.join('\n  ') : ''));
}

// ---------- onboard: the one-time first-wave guide (zonboard.js) ----------
if (want('onboard')) {
  const GURL = origin + '/games/interceptor/', errs = [];
  /* a page on a fresh save (the harness is an automated browser, so the guide only runs when the URL says ?guide=1) */
  const fresh = async (p, qs) => {
    await p.evaluate(() => { sessionStorage.setItem('zbossRoster', '0'); localStorage.setItem('dl-interceptor', JSON.stringify({wx: 'clear'})); });
    await p.goto(GURL + qs, {waitUntil: 'load'}); await inject(p);
  };
  const inject = async p => {  /* the page's helpers (they go with a reload) */
    await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 3);
    await p.evaluate(() => {
      window.__spoke = 0; try { Object.defineProperty(window, 'speechSynthesis', {configurable: true, get: () => ({speak() { window.__spoke++; }, cancel() {}, getVoices() { return []; }})}); } catch (e) { /* no trap here */ }  /* the guide has no voice: a trap counts any attempt to speak */
      window.__u = (fn, max = 20) => { for (let i = 0; i < max * 4 && !fn(); i++) __z.sim(.25); return !!fn(); };  /* sim until fn() or max seconds */
      window.__key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code}));
      window.__hold = (n, fn) => { for (let i = 0; i < n; i++) { const t = __z.api.TH.find(__z.api.live); if (t) __z.Z.lk.force(t); __z.sim(.1); if (fn()) return true; } return !!fn(); };  /* keep the lock on the first track while the sim runs */
      window.__clear = () => { const {api, G} = __z; for (const t of api.TH.filter(api.live)) { t.by = 'p'; api.killThreat(t, true); } G.wq.length = 0; let n = 0; while (G.state === 'wave' && n++ < 200) __z.sim(.5); __z.sim(5); };
      window.__g = () => { const o = __z.Z.onboard; return {on: o.on, why: o.why, ended: o.ended, step: o.step, fin: o.fin, log: [...new Set(o.log)], st: {...o.st}, text: o.text, shown: o.shown, gentle: o.gentle, card: !!document.getElementById('zob'), flag: JSON.parse(localStorage.getItem('dl-interceptor') || '{}').zonb, hl: document.querySelectorAll('.zob-hl').length}; };
    });
  };
  const ratio = () => { const {api, KIND} = __z, t = api.TH.find(u => api.live(u) && u.k === 'shahed'); return t ? +(t.spd / KIND.shahed.spd).toFixed(2) : null; };
  const p = await open(browser, GURL, errs); await p.evaluate(() => sessionStorage.setItem('zbossRoster', '0'));

  // an automated browser never gets the guide on its own (benches and every other harness run on fresh saves): wave 1 is the plain wave, nothing is saved
  await fresh(p, '');
  await play(p);
  const a0 = await p.evaluate(() => { const r = {wd: navigator.webdriver, api: !!__z.Z.onboard, g: __g()}; __z.cont(); r.at = __z.G.wq.map(q => q.at); r.n = r.at.length; __z.sim(6); return r; });
  const a1 = await p.evaluate(`(${ratio})()`);
  ok(a0.wd === true && a0.api && !a0.g.on && a0.g.why === 'auto' && a0.g.flag === undefined && !a0.g.card, `Onboard: an automated browser gets no guide by default (why "${a0.g.why}"), no flag saved, no card`);
  ok(a0.n === 2 && a0.at.join() === '0,25' && a1 >= .9, `Onboard: so wave 1 is the plain wave there (tracks at ${a0.at.join('/')} s, Shahed at ${a1} of its speed)`);

  // ?guide=1 on a fresh save: the first run is guided, and the flag is saved the moment it starts
  await fresh(p, '?guide=1');
  const m0 = await p.evaluate(() => ({api: !!__z.Z.onboard, css: !!document.querySelector('link[href*="zonboard.css"]'), skip2: document.getElementById('zobskip2')?.hidden, g: __g()}));
  ok(m0.api && m0.css && m0.skip2 === true && !m0.g.card && !m0.g.on, 'Onboard: the module is up with its stylesheet; nothing shows on the menu');
  await play(p);
  await p.evaluate(() => __u(() => __z.Z.onboard.step === 'brief', 3));
  const b0 = await p.evaluate(() => ({g: __g(), skip: !!document.getElementById('zobskip'), skip2: document.getElementById('zobskip2').hidden, spoke: window.__spoke, calls: __z.Z.radio.calls.filter(c => c.topic === 'guide').map(c => c.who), base: !document.getElementById('zbase').hidden}));
  ok(b0.g.on && b0.g.why === '' && b0.g.flag === 1 && b0.g.step === 'brief' && b0.g.shown && /Briefing/.test(b0.g.text) && b0.skip && b0.base, `Onboard: the first run starts the guide at the Briefing and saves the flag at once (flag ${b0.g.flag}, step ${b0.g.step})`);
  ok(b0.calls[0] === 'OVERLORD' && b0.spoke === 0, `Onboard: OVERLORD's line goes on the radio log as text and static; nothing is spoken (${b0.calls.join()}; speak() called ${b0.spoke} times)`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-guide-brief.png'});
  const w0 = await p.evaluate(() => { __z.cont(); const {G, Z} = __z; return {at: G.wq.map(q => q.at), n: G.wq.length, gentle: Z.onboard.gentle}; });
  ok(w0.gentle && w0.n <= 3 && w0.at[0] === 3 && w0.at[1] > 25, `Onboard: wave 1 starts gentler: at most 3 tracks, the first at ${w0.at[0]} s, the rest spread (${w0.at.join('/')} s)`);
  await p.evaluate(() => __u(() => __z.api.TH.some(__z.api.live), 10)); await p.evaluate(() => __z.sim(.5));
  const sl = await p.evaluate(`(${ratio})()`);
  ok(sl >= .65 && sl <= .85, `Onboard: and its tracks fly slower (Shahed at ${sl} of its speed, against ${a1} in the plain wave)`);
  // prompts come in order, each when its action is due
  await p.evaluate(() => __u(() => __z.Z.onboard.step === 'fly', 4));
  const f0 = await p.evaluate(() => __g());
  ok(f0.step === 'fly' && /take off/i.test(f0.text) && f0.log.join() === 'brief,fly' && f0.st.brief === 'done' && !f0.fin, `Onboard: wave 1 starts with the flying prompt ("${f0.text.slice(0, 40)}...")`);
  await p.evaluate(() => { __key('KeyW'); __u(() => __z.Z.onboard.ev.fly, 25); __key('KeyW', false); });
  const f1 = await p.evaluate(() => { __u(() => __z.Z.onboard.fin, 3); return __g(); });
  ok(f1.fin && /^✓/.test(f1.text), `Onboard: taking off and flying away ticks the flying prompt ("${f1.text}")`);
  await p.evaluate(() => __u(() => __z.Z.onboard.step === 'look', 6));
  const l0 = await p.evaluate(() => __g()); ok(l0.step === 'look' && /camera/i.test(l0.text) && l0.st.fly === 'done', `Onboard: then the camera ("${l0.text.slice(0, 44)}...")`);
  await p.evaluate(() => { __key('KeyL'); __z.sim(.3); __key('KeyL', false); __u(() => __z.Z.onboard.step === 'lock', 8); });
  const k0 = await p.evaluate(() => __g()); ok(k0.step === 'lock' && /lock/i.test(k0.text) && k0.st.look === 'done', `Onboard: pressing L for the camera ticks it, a track is in radar range, so the lock-on prompt comes ("${k0.text.slice(0, 40)}...")`);
  await p.evaluate(() => __hold(30, () => __z.Z.onboard.step === 'pip'));
  const pp0 = await p.evaluate(() => __g()); ok(pp0.step === 'pip' && /pip/i.test(pp0.text) && pp0.st.lock === 'done', `Onboard: a lock ticks it and the pip is explained ("${pp0.text.slice(0, 44)}...")`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-guide-pip.png'});
  await p.evaluate(() => { const {api} = __z, t = api.TH.find(api.live); api.player.p.set(t.p.x, t.p.y, t.p.z - 100); __hold(40, () => __z.Z.onboard.step === 'burst'); });
  const bu0 = await p.evaluate(() => __g()); ok(bu0.step === 'burst' && /Detonate/i.test(bu0.text) && /fuse/i.test(bu0.text) && bu0.st.pip === 'done', `Onboard: closing on the locked track ends the pip prompt and the burst / proximity fuse one comes ("${bu0.text.slice(0, 30)}...")`);
  await p.evaluate(() => { __key('KeyF'); __z.sim(.15); __key('KeyF', false); __z.sim(.1); __u(() => __z.Z.onboard.fin, 3); });
  const bu1 = await p.evaluate(() => __g()); ok(bu1.fin && /^✓/.test(bu1.text), `Onboard: the burst ticks it ("${bu1.text}")`);
  const lg = await p.evaluate(() => { __clear(); return {g: __g(), tr: __z.api.TH.filter(__z.api.live).length}; });
  ok(lg.g.log.join().startsWith('brief,fly,look,lock,pip,burst') && ['fly', 'look', 'lock', 'pip', 'burst'].every(k => lg.g.st[k] === 'done'),`Onboard: the wave-1 prompts came in order (${lg.g.log.join(' > ')}) and all five were done (${JSON.stringify(lg.g.st)})`);
  ok(!lg.g.gentle && lg.g.card && lg.g.ended === '', `Onboard: wave 1 over: the gentle wave is switched off, the guide goes on to the base screen`);
  /* the guide's radio lines (priority 2) used to starve the battle calls on wave 1: the wave's own call and the tracks' calls were dropped as stale or rate-limited behind them */
  const gr = await p.evaluate(() => { const c = __z.Z.radio.calls; return c.filter(x => x.topic !== 'guide' && x.pri >= 1).map(x => x.topic); });
  ok(gr.includes('wave') && gr.includes('trk'), `Onboard radio: the guided wave still gets its battle calls (the wave's own call and a new track's call were heard: ${gr.join(' ')})`);
  // the base screen: the first helper, then sorties
  await p.evaluate(() => __u(() => __z.Z.onboard.step === 'helper', 6));
  const h0 = await p.evaluate(() => { const i = __z.G.cards.findIndex(c => c.k === 'rack'); return {g: __g(), hl: document.querySelector('.zob-hl')?.dataset.buy === String(i), base: document.body.classList.contains('zb-open')}; });
  ok(h0.g.step === 'helper' && /Interceptor drone rack/.test(h0.g.text) && h0.hl && h0.base, `Onboard: on the base screen it asks for the first helper and glows the drone rack's button`);
  const cov = await p.evaluate(() => { const c = document.getElementById('zob').getBoundingClientRect(), r = document.querySelector('.zob-hl').getBoundingClientRect(); return {hidden: !(r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom), card: [c.left, c.top, c.right, c.bottom].map(Math.round), btn: [r.left, r.top, r.right, r.bottom].map(Math.round)}; });
  ok(!cov.hidden, `Onboard: the glowing Buy button is not under the guide card (card ${cov.card}, button ${cov.btn})`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-guide-helper.png'});
  /* the sell cards (zsell.js: a Sold card with an Undo in the Armory) do not confuse the glow: with another tab open it is the Shop tab, back on the Shop it is the rack's Buy button */
  const sc = await p.evaluate(async () => { const {Z, G} = __z, wait = () => new Promise(r => setTimeout(r, 40)), d = Z.base.act.place('rack', Z.def.SLOTS.findIndex((_, j) => Z.def.slotFree(j, 'rack')));
    Z.base.act.sell(d.id); document.querySelector('[data-tab="armory"]').click(); await wait(); const a = {sold: !!document.querySelector('.zsold [data-undo]'), tab: document.querySelector('.zob-hl')?.dataset.tab};
    document.querySelector('[data-tab="shop"]').click(); await wait(); a.buy = document.querySelector('.zob-hl')?.dataset.buy === String(G.cards.findIndex(c => c.k === 'rack')); a.n = Z.def.D.length; a.step = __g().step; return a; });
  ok(sc.sold && sc.tab === 'shop' && sc.buy && sc.n === 0 && sc.step === 'helper', `Onboard: with a Sold card in the Armory the glow still finds the Shop tab, then the rack's Buy button (${JSON.stringify(sc)})`);
  await p.evaluate(() => { const i = __z.G.cards.findIndex(c => c.k === 'rack'); document.querySelector(`[data-buy="${i}"]`).click(); __z.sim(.3); });
  const h1 = await p.evaluate(() => __g()); ok(h1.step === 'helper' && /free position/.test(h1.text), `Onboard: choosing it switches the prompt to picking a position ("${h1.text.slice(0, 30)}...")`);
  await p.evaluate(() => { document.querySelector('[data-slot]').click(); __z.sim(.3); __u(() => __z.Z.onboard.fin, 3); });
  const h2 = await p.evaluate(() => ({g: __g(), n: __z.Z.def.D.length})); ok(h2.n === 1 && h2.g.fin && /^✓/.test(h2.g.text), `Onboard: placing it ticks that (a rack is on the line)`);
  await p.evaluate(() => __u(() => __z.Z.onboard.step === 'sortie', 6));
  const s0 = await p.evaluate(() => ({g: __g(), hl: document.querySelector('.zob-hl')?.dataset.tab === __z.Z.xTab.id}));
  ok(s0.g.step === 'sortie' && /Sortie/.test(s0.g.text) && s0.hl && s0.g.st.helper === 'done', `Onboard: sorties are open after wave 1, so the Sortie tab is pointed at`);
  await p.evaluate(() => { document.querySelector(`[data-tab="${__z.Z.xTab.id}"]`).click(); __z.sim(.3); __u(() => __z.Z.onboard.fin, 3); });
  const s1 = await p.evaluate(() => __g()); ok(s1.fin && /^✓/.test(s1.text), 'Onboard: opening the Sortie tab ticks it');
  // later unlocks: Rocket Assist when the shop opens it, the swarm commands when a swarm is up
  const r0 = await p.evaluate(() => { __u(() => !__z.Z.onboard.step, 4); const q = __g(); q.from = __z.Z.itemFrom('rocket') + '@' + __z.G.wave; __z.jump(3, 9000); __z.Z.base.refresh(); __u(() => __z.Z.onboard.step === 'rocket', 4); return {q, g: __g(), hl: document.querySelector('.zob-hl')?.dataset.tab === 'shop'}; });  /* the Sortie tab is still open, so the Shop tab is what glows */
  ok(!r0.q.step && r0.q.log.join().endsWith('sortie') && r0.g.step === 'rocket' && /Rocket Assist/.test(r0.g.text) && r0.hl, `Onboard: nothing more is asked until Rocket Assist opens in the shop, then it is pointed at (${r0.g.log.join(' > ')}; before: ${r0.q.step} ${r0.q.from})`);
  const rg = await p.evaluate(async () => { document.querySelector('[data-tab="shop"]').click(); await new Promise(r => setTimeout(r, 30));  /* the redraw's observer runs after this task */
    const i = __z.G.cards.findIndex(c => c.k === 'rocket'), hl = document.querySelector('.zob-hl')?.dataset.buy === String(i); document.querySelector(`[data-buy="${i}"]`).click(); __z.sim(.3); __u(() => __z.Z.onboard.fin, 3); return hl; });
  ok(rg, 'Onboard: back on the Shop tab the glow moves to the Rocket Assist button (it survives the base screen redrawing)');
  const r1 = await p.evaluate(() => ({g: __g(), own: __z.Z.perkLevel('rocket')})); ok(r1.own === 1 && r1.g.fin, 'Onboard: buying Rocket Assist ticks it');
  const r2 = await p.evaluate(() => { __z.cont(); const gw = __g().gentle; __z.sim(.3); __key('KeyW'); __u(() => __z.Z.rk.st.t > 0, 8); __key('KeyW', false); __u(() => __z.Z.onboard.step === 'rocketfly', 3); const g = __g(); __u(() => !__z.Z.onboard.step, 12); return {gw, g, after: __g()}; });
  ok(r2.g.step === 'rocketfly' && /Rocket burn/.test(r2.g.text) && r2.after.st.rocketfly === 'done', `Onboard: the first rocket burn gets its line, which closes by itself`);
  // wave 3 is the plain wave: nothing slowed, no gentle flag
  const w3 = await p.evaluate(() => { const {api, KIND, G} = __z; __u(() => api.TH.some(t => api.live(t) && t.k === 'shahed'), 30); __z.sim(.3); const t = api.TH.find(u => api.live(u) && u.k === 'shahed'); return {wave: G.wave, ob: api.TH.some(u => u._ob), r: t ? +(t.spd / KIND.shahed.spd).toFixed(2) : null, gentle: __g().gentle}; });
  ok(w3.wave === 3 && !w3.ob && !w3.gentle && (w3.r === null || w3.r >= .9), `Onboard: nothing leaks into the later waves (wave ${w3.wave}: no slowed track, Shahed at ${w3.r} of its speed, no gentle flag)`);
  const sw = await p.evaluate(() => { __clear(); __z.Z.buyPerk('swarm'); __z.G.cash = 9000; __z.cont(); __u(() => __z.Z.onboard.step === 'swarm', 5); const g0 = __g(); __z.Z.sw.command('screen'); __z.sim(.3); __u(() => __z.Z.onboard.fin, 3); return {g0, g1: __g()}; });
  ok(sw.g0.step === 'swarm' && /Swarm commands/.test(sw.g0.text) && sw.g1.fin, `Onboard: with a swarm up it lists the commands, and giving one ticks it`);
  const en = await p.evaluate(() => { __u(() => !__z.Z.onboard.on, 5); return {g: __g(), skip2: document.getElementById('zobskip2').hidden}; });
  ok(!en.g.on && en.g.ended === 'done' && !en.g.card && en.g.hl === 0 && en.skip2 && en.g.log.join() === 'brief,fly,look,lock,pip,burst,helper,sortie,rocket,rocketfly,swarm' && ['fly', 'look', 'lock', 'pip', 'burst', 'helper', 'sortie', 'rocket', 'swarm'].every(k => en.g.st[k] === 'done'),
    `Onboard: every prompt ticked, the guide ends by itself and leaves nothing behind (${en.g.log.join(' > ')})`);

  // never again: not in the same page, a new run, a campaign sector, after a settings reset or a reload (the flag is in the save)
  const nv = await p.evaluate(() => { const {api, Z, G} = __z; api.startDemo(); const a = {}; Z.start(); a.again = __g();
    Z.cp.start('factory', true); a.camp = __g(); a.cpOn = Z.cp.on; document.getElementById('mreset').click(); a.reset = {flag: __g().flag, S: api.S.zonb}; return a; });
  ok(!nv.again.on && nv.again.why === 'seen' && !nv.again.card && !nv.camp.on && nv.cpOn && nv.camp.why === 'seen' && nv.reset.flag === 1 && nv.reset.S === 1, `Onboard: a second run and a campaign sector never show it (why "${nv.again.why}"), and the flag survives a settings reset`);
  await p.reload({waitUntil: 'load'}); await inject(p); await play(p);
  const rl =await p.evaluate(() => { __z.cont(); return {g: __g(), at: __z.G.wq.map(q => q.at)}; });
  ok(!rl.g.on && rl.g.why === 'seen' && rl.g.flag === 1 && !rl.g.card && rl.at.join() === '0,25', `Onboard: after a reload it is still off, and wave 1 is the plain wave (${rl.at.join('/')} s)`);

  // the save is the only place the flag lives: a wiped save is a new browser. Nothing is done here, so every prompt waits and times out, play is never blocked, and Skip ends it at once
  await fresh(p, '?guide=1'); await play(p);
  const t0 = await p.evaluate(() => { __z.cont(); __u(() => __z.Z.onboard.st.fly === 'timeout', 40); const g = __g(); __u(() => __z.Z.onboard.step === 'look', 5); return {g, g2: __g(), tracks: __z.api.TH.filter(__z.api.live).length, st: __z.G.state}; });
  ok(t0.g.st.fly === 'timeout' && t0.g2.step === 'look' && t0.st === 'wave', `Onboard: a prompt nobody acts on times out (flying: ${t0.g.st.fly}) and the next one comes; the wave ran on meanwhile (${t0.tracks} track(s) live)`);
  /* and a pilot who takes their time hears everything: each prompt's line was said whole (none dropped for waiting) between the battle calls (the wave's call and the first track's) */
  const ig = await p.evaluate(() => { const {api, Z} = __z, R = Z.radio; __z.sim(2); __z.make('shahed', api.player.p.x, api.player.p.z - 2400);  /* a track in sight now: the wave's own first one is seen when its bearing and the ground allow, and on a slow day that was past the window */
    __u(() => R.calls.some(x => x.topic === 'trk'), 30); __u(() => !R.cur && !R.q.length, 20);  /* its call is made, and the line of the prompt it opens (lock-on) is said after it */
    const c = R.calls; return {guide: new Set(c.filter(x => x.topic === 'guide' && !x.cut && x.t > 0).map(x => x.txt)).size, opened: __z.Z.onboard.log.filter(s => s !== 'brief').length, bat: c.filter(x => x.topic !== 'guide' && x.pri >= 1).map(x => x.topic).join(' '), seq: c.map(x => x.topic + (x.cut ? '*' : '')).join(' ')}; });
  ok(ig.opened >= 2 && ig.guide >= ig.opened && /wave/.test(ig.bat) && /trk/.test(ig.bat), `Onboard radio: with nobody acting, each opened prompt's line was said (${ig.guide} lines for ${ig.opened} prompts) and so were the wave's call and a track's (${ig.seq})`);
  const me1 = await p.evaluate(() => { __z.api.showMenu(true); __z.sim(.3); return {g: __g(), skip2: document.getElementById('zobskip2').hidden, shown: __z.Z.onboard.shown}; });  /* the pause menu has its own Skip guide (on the base screen the menu sits behind the panel, the card's button is the one there) */
  ok(me1.g.on && !me1.skip2 && !me1.shown, 'Onboard: the pause menu shows Skip guide and the card steps aside while it is open');
  await p.click('#zobskip2'); await p.evaluate(() => { __z.api.showMenu(false); }); await frames(p, 2);
  const sk = await p.evaluate(() => { const g = __g(); __z.sim(3); return {g, later: __g(), skip2: document.getElementById('zobskip2').hidden, st: __z.G.state}; });
  ok(!sk.g.on && sk.g.ended === 'skip' && !sk.g.card && !sk.g.gentle && sk.later.step === null && sk.skip2 && sk.g.flag === 1 && sk.st === 'wave', 'Onboard: Skip guide ends it at once: card gone, gentle wave off, the pause-menu button hidden, the wave still running, the flag still set');

  // bots and benches never get it and never use the flag up; the next human run still does. Skipping at the Briefing leaves the plain wave
  await fresh(p, '?guide=1');
  const bt = await p.evaluate(() => { const {api, Z, G, spec} = __z, o = {}; api.startDemo(); spec.bench.start('Legend', 1); o.bench = __g(); api.startDemo();
    spec.start({lv: 'Legend', d: 1, doc: 'std', kit: [], sec: ''}); o.watch = __g(); spec.stop(); api.startDemo(); o.after = __g(); return o; });
  ok(!bt.bench.on && bt.bench.why === 'bot' && !bt.watch.on && bt.watch.why === 'bot' && !bt.bench.card && !bt.watch.card && bt.bench.flag === undefined && bt.after.flag === undefined, `Onboard: the bot benchmark and Bot Spectator never get it, and leave the flag alone (why "${bt.bench.why}" / "${bt.watch.why}")`);
  await play(p);
  const me2 = await p.evaluate(() => { __u(() => __z.Z.onboard.step === 'brief', 3); return {g: __g(), shown: __z.Z.onboard.shown}; });
  ok(me2.g.on && me2.g.flag === 1 && me2.shown, 'Onboard: the first human run after the bots still gets the guide (they left the flag alone)');
  await p.click('#zobskip');  /* a real click on the card's button, over the base screen */
  const sk2 = await p.evaluate(() => { __z.cont(); return {g: __g(), at: __z.G.wq.map(q => q.at), skip2: document.getElementById('zobskip2').hidden}; });
  ok(!sk2.g.on && sk2.g.ended === 'skip' && !sk2.g.gentle && sk2.at.join() === '0,25' && sk2.skip2, `Onboard: skipping at the Briefing leaves wave 1 the plain wave (${sk2.at.join('/')} s)`);
  ok(!errs.length, 'Onboard: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
  // the guide always finishes: a pilot who never buys a helper, Rocket Assist or the swarm sees it end by itself, each step dropped after its wave
  await fresh(p, '?guide=1'); await play(p);
  const fin = await p.evaluate(() => { const {Z} = __z; __z.cont(); __clear(); const o = {on1: __g().on}; __z.jump(5); __z.sim(.5); const a = __g(); o.w4 = {on: a.on, st: {...a.st}}; __z.jump(Z.itemFrom('swarm') + 10); __z.sim(.5); const b = __g(); o.late = {on: b.on, ended: b.ended, st: {...b.st}, card: b.card}; return o; });
  ok(fin.on1 && fin.w4.on && fin.w4.st.helper === 'timeout' && fin.w4.st.sortie === 'timeout' && !fin.w4.st.rocket && !fin.late.on && fin.late.ended === 'done' && !fin.late.card && ['helper', 'sortie', 'rocket', 'rocketfly', 'swarm'].every(k => fin.late.st[k] === 'timeout'),
    `Onboard: a pilot who buys nothing still sees the guide end by itself: the helper and the sortie dropped after wave 3 (${fin.w4.st.helper}/${fin.w4.st.sortie}), Rocket Assist and the swarm a few waves after they open (${JSON.stringify(fin.late)})`);
  await p.close();

  // co-op: the host and a client (a real lobby over ?netloop) get no guide and keep the flag unset
  {
    const cerrs = [], CU = `${origin}/games/interceptor/?mode=zombies&netloop=40&guide=1`;
    const cp = async name => { const q = await open(browser, CU, cerrs, {page: await newWindow(browser, {noRender: !SHOTS})});
      await q.evaluate(() => { sessionStorage.setItem('zbossRoster', '0'); localStorage.setItem('dl-interceptor', JSON.stringify({wx: 'clear', gmode: 'z', zdiff: 1})); }); await q.reload({waitUntil: 'load'});
      await q.waitForFunction(() => window.__z && window.__z.net, {timeout: 60000}); await q.$eval('#zname', (e, n) => { e.value = n; }, name); return q; };
    const H = await cp('Hosty'), C = await cp('Cleo');
    await H.click('#zhost'); await H.waitForFunction(() => __z.G.on && __z.G.state === 'base' && __z.net.n?.code, {timeout: 60000});
    const code = await H.evaluate(() => __z.net.n.code); await C.$eval('#zcode', (e, c) => { e.value = c; }, code); await C.click('#zjoin');
    await C.waitForFunction(() => __z.G.on && __z.G.state === 'base' && __z.net.rows().length === 2, {timeout: 60000});
    const cg = () => { const o = __z.Z.onboard; return {on: o.on, why: o.why, card: !!document.getElementById('zob'), flag: JSON.parse(localStorage.getItem('dl-interceptor') || '{}').zonb, role: __z.Z.netRole()}; };
    await H.evaluate(() => __z.sim(.5)); await C.evaluate(() => __z.sim(.5));
    const hg = await H.evaluate(cg), cg1 = await C.evaluate(cg);
    ok(hg.role === 'host' && !hg.on && hg.why === 'coop' && !hg.card && hg.flag === undefined, `Onboard: a co-op host gets no guide and saves no flag (why "${hg.why}")`);
    ok(cg1.role === 'client' && !cg1.on && cg1.why === 'coop' && !cg1.card && cg1.flag === undefined, `Onboard: a co-op client gets none either (why "${cg1.why}")`);
    ok(!cerrs.length, 'Onboard co-op: no errors' + (cerrs.length ? '\n  ' + cerrs.slice(0, 5).join('\n  ') : ''));
    await H.close(); await C.close();
  }
}

// ---------- the living map (zscars.js): craters, burns and rubble that stay; caps and recycling, the save, the campaign, co-op, no glitches, frame cost, no leaks ----------
if (want('scars')) {
  const {p, errs} = await page(); await pinRoads(p);
  /* nobody has played yet: the menu's idle time builds the textures and pools, a few ms a slice */
  const idle = await p.waitForFunction(() => __z.Z.sc.ready, {timeout: 120000}).then(() => true, () => false), worst = await p.evaluate(() => __z.Z.sc.worst);
  ok(idle, 'Scars: the textures and pools are built in idle time at the menu, before anyone plays');
  timingCheck(worst < 80, `Scars: the longest slice of that build is ${worst.toFixed(1)} ms (budget 80 ms: a slice is a few ms, the rest is a busy machine)`, ok);
  await play(p);
  // helpers inside the page: spots, a held-open wave, frame grabs (pixels read right after a direct render: scene -> canvas), a median
  await p.evaluate(() => {
    const {Z, G, api} = __z, S = Z.sc, V = api.THREE.Vector3, gh = api.gh, R = (a, b) => a + Math.random() * (b - a); S.ensure();
    const sl = (x, z) => Math.hypot(gh(x + 3, z) - gh(x - 3, z), gh(x, z + 3) - gh(x, z - 3)) / 6;
    window.__find = crop => { for (let z = -2800; z < 1000; z += 60) for (let x = -2800; x < 2800; x += 60) { if (S.bad(x, z, 30) || S.cropAt(x, z) !== crop || sl(x, z) > .05) continue;
      if ([[30, 0], [-30, 0], [0, 30], [0, -30]].every(([a, b]) => S.cropAt(x + a, z + b) === crop && S.flamAt(x + a, z + b) > 0)) return {x, z}; } return null; };
    window.__spots = () => { const o = {}; for (let z = -2800; z < 1000 && !(o.flat && o.slope); z += 90) for (let x = -2800; x < 2800; x += 90) { if (S.bad(x, z, 30)) continue; let mn = 9, mx = 0;
      for (let a = 0; a < 8; a++) { const q = sl(x + Math.cos(a * .785) * 30, z + Math.sin(a * .785) * 30); mn = Math.min(mn, q); mx = Math.max(mx, q); }
      if (!o.flat && mx < .035) o.flat = {x, z}; if (!o.slope && mn > .15 && mx < .45) o.slope = {x, z}; } return o; };
    window.__pos = r => { for (;;) { const x = R(-2500, 2500), z = R(-2500, 500); if (![[0, 0], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]].some(([a, b]) => S.bad(x + a, z + b, r * 1.1 + 1))) return [x, z]; } };  /* a place a scar may be, with room for the 2.2 m grid (a saved one anywhere else is dropped on load) */
    window.__set = a => JSON.stringify(a.map(r => r.join()).sort());  /* the records as a set: slots are not an order */
    window.__open = () => { __z.cont(); G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); for (const t of api.TH) { t.st = 'dead'; if (t.mesh) t.mesh.visible = false; } };  /* a wave that stays open: burns spread only while a wave runs */
    window.__med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    window.__rd = f => { const w = window.__dlNoRender; window.__dlNoRender = false; try { return f(); } finally { window.__dlNoRender = w; } };
    window.__sig = m => Array.from(m.instanceMatrix.array).reduce((a, b, i) => a + b * ((i % 97) + 1), 0);
  });
  // the houses as they were, to see everything put back
  const H0 = await p.evaluate(() => { const h = __z.Z.sc.houses(); return {n: h.n, walls: __sig(h.w), roofs: __sig(h.r)}; });

  // ---- scars appear: ground bursts, a downed wreck, a crash, a destroyed house; not in the air, not on the defended ground ----
  const A = await p.evaluate(() => { const {Z, G, api} = __z, S = Z.sc, V = api.THREE.Vector3, gh = api.gh, o = {}, bm = (p, k) => { S.refill(); S.boom(p, k); };
    o.ready = S.ready; o.start = S.stats();
    const w = __find(1), f = __find(6); o.spots = !!(w && f);
    bm(new V(w.x, gh(w.x, w.z) + 120, w.z), 2); o.air = S.stats().craters;                         /* an air burst leaves nothing */
    bm(new V(f.x, gh(f.x, f.z) + .5, f.z), 1.6); o.plough = {c: S.stats().craters, b: S.stats().burns};  /* a wreck on ploughed earth: a crater, it will not burn */
    for (const s of api.SITES) bm(new V(s.x + 10, gh(s.x, s.z) + 1, s.z), 6); o.site = S.stats().craters;  /* the defended ground has its own damage stages */
    bm(new V(w.x, gh(w.x, w.z) + .5, w.z), 3); o.wheat = {c: S.stats().craters, b: S.stats().burns};   /* a big hit on dry wheat: a crater and a fire */
    const c2 = S.stats().craters; for (const q of Z.def.SLOTS) if (!q.park) bm(new V(q.x + 5, gh(q.x, q.z) + 1, q.z), 3); o.slots = S.stats().craters - c2;  /* nor under the positions a defence stands on */
    /* a downed Shahed falls on a field through the game's own path (threatStep -> boom -> Z.flash) */
    S.refill(); const w2 = __find(3) || __find(2) || w, c0 = S.stats().craters, t = __z.make('shahed', w2.x, w2.z); t.p.set(w2.x, gh(w2.x, w2.z) + 25, w2.z); t.v.set(0, -15, 0); t.st = 'fall'; t.spin = 2; __z.sim(4);
    o.fall = {dead: t.st === 'dead', craters: S.stats().craters - c0, near: S.list(0).some(r => Math.hypot(r.x - w2.x, r.z - w2.z) < 40)};
    /* the interceptor crashes into a field */
    S.refill(); const me = api.player, c1 = S.stats().craters, f2 = __find(8) || __find(2) || w; me.p.set(f2.x, gh(f2.x, f2.z) + 1, f2.z); api.lose('crash'); o.crash = S.stats().craters - c1;
    /* a house: hit it hard; it, its shadow and its collider go, rubble stays */
    S.refill(); const h = S.houses(), r0 = S.stats().rubble, i = 40, hx = h.x[i], hz = h.z[i], y0 = api.scene.userData.hcol[i].y, e0 = Array.from(h.w.instanceMatrix.array.slice(i * 16, i * 16 + 16));
    S.boom(new V(hx, gh(hx, hz) + 1, hz), 3);
    const e1 = Array.from(h.w.instanceMatrix.array.slice(i * 16, i * 16 + 16)), r1 = Array.from(h.r.instanceMatrix.array.slice(i * 16, i * 16 + 16));
    o.house = {dead: h.dead[i], rub: S.stats().rubble - r0, col: api.scene.userData.hcol[i].y > 1e5 && y0 < 1e5, gone: e1.slice(0, 12).every(v => v === 0) && r1.slice(0, 12).every(v => v === 0) && e1[12] === e0[12], rubAt: S.list(2).some(r => Math.hypot(r.x - hx, r.z - hz) < 3)};
    return o; });
  ok(A.ready && A.spots && A.start.craters + A.start.burns + A.start.rubble === 0, `Scars: ready after the idle build, the run starts clean (${JSON.stringify(A.start.hw)})`);
  ok(A.air === 0, 'Scars: an air burst high above the ground leaves nothing');
  ok(A.plough.c === 1 && A.plough.b === 0, `Scars: a wreck on ploughland leaves a crater and no fire (craters ${A.plough.c}, burns ${A.plough.b})`);
  ok(A.site === 1, 'Scars: hits on the defended sites add none (their damage stages are their rubble)');
  ok(A.slots === 0, `Scars: nor do hits next to the positions a defence can stand on (${A.slots} new craters)`);
  ok(A.wheat.c === 2 && A.wheat.b === 1, `Scars: a big hit on dry wheat leaves a crater and a fire (craters ${A.wheat.c}, burns ${A.wheat.b})`);
  ok(A.fall.dead && A.fall.craters === 1 && A.fall.near, `Scars: a downed Shahed falling on a field leaves a crater where it lands (${A.fall.craters})`);
  ok(A.crash === 1, `Scars: the interceptor crashing into a field leaves a mark (${A.crash})`);
  ok(A.house.dead === 1 && A.house.rub >= 1 && A.house.col && A.house.gone && A.house.rubAt, `Scars: a destroyed house is gone (walls, roof, shadow, collider) and rubble stands in its place ${JSON.stringify(A.house)}`);

  // ---- a fire spreads slowly while it burns, then stops ----
  const B = await p.evaluate(() => { const {Z, G} = __z, S = Z.sc; __open(); const b = S.list(1)[0], T = S.burnTime(b.r), s = [b.pf]; let t = 0;
    for (const u of [5, 15, 30]) { __z.sim(u - t); t = u; s.push(S.list(1)[0].pf); }
    __z.sim(T + 8 - t); const done = S.list(1)[0].pf, g0 = S.pools[1].glow[b.i]; __z.sim(30); const after = S.list(1)[0].pf, g1 = S.pools[1].glow[b.i];
    return {r: b.r, T, s, done, after, g0, g1}; });
  ok(B.s[0] < B.s[1] && B.s[1] < B.s[2] && B.s[3] < 1 && B.s[3] > B.s[2], `Burn: spreads steadily while it burns (progress ${B.s.map(v => v.toFixed(2)).join(' -> ')} over 30 s of a ${B.T.toFixed(0)} s fire)`);
  ok(B.done === 1 && B.after === 1 && B.g1 === 0, `Burn: stops at its full size (${B.done}, still ${B.after} 30 s later) and the embers go out (${B.g0.toFixed(2)} -> ${B.g1})`);

  // ---- caps and recycling ----
  const C = await p.evaluate(() => { const {Z, api} = __z, S = Z.sc, R = (a, b) => a + Math.random() * (b - a), o = {}; S.clear();
    const spot = () => [R(-2500, 2500), R(-2500, 500)];
    for (let i = 0; i < 256; i++) { const [x, z] = spot(); S.add(0, x, z, 3 + i % 4, {a: i < 100 ? 15 : 0, fade: 1}); }
    o.full = S.stats().craters; for (let i = 0; i < 100; i++) { const [x, z] = spot(); S.add(0, x, z, 9, {a: 0, fade: 1}); }
    o.dying = S.list(0).filter(r => r.st === 2).length; __z.sim(3);
    const L = S.list(0); o.n = L.length; o.big = L.filter(r => r.r > 8).length; o.old = L.filter(r => r.age === 15).length; o.small = L.filter(r => r.r < 6 && r.age === 0).length; o.q = S.pools[0].q.length; o.ic = S.pools[0].geo.instanceCount;
    S.clear(); for (let i = 0; i < 128; i++) { const [x, z] = spot(); S.add(1, x, z, 8 + i % 5, {p: i < 10 ? 8 : 31, fade: 1}); }
    for (let i = 0; i < 40; i++) { const [x, z] = spot(); S.add(1, x, z, 16, {p: 31, fade: 1}); } __z.sim(3);
    const Lb = S.list(1); o.bn = Lb.length; o.spreading = Lb.filter(r => r.pf < 1).length; o.bic = S.pools[1].geo.instanceCount; o.bnew = Lb.filter(r => r.r > 15).length;
    S.clear(); const h = S.houses(); let k = 0, refused = 0; for (let i = 0; i < 90 && k < 70; i++) { if (S.houseDown(i)) { S.add(2, h.x[i], h.z[i], 7.4, {fade: 1}); k++ } else refused++; }
    o.rub = S.stats().rubble; o.refused = refused; o.ric = S.pools[2].geo.instanceCount; o.meshes = api.scene.children.filter(m => m.userData.scars !== undefined).length; S.clear(); return o; });
  ok(C.full === 256 && C.n === 256 && C.ic <= 256 && C.q === 0, `Caps: 256 craters at most (${C.n}; instances drawn ${C.ic}) when 100 more arrive`);
  ok(C.dying === 100 && C.big === 100 && C.old === 0 && C.small === 156, `Recycling: the 100 oldest are the ones that fade out (new ${C.big}, old left ${C.old}, younger small ones kept ${C.small}, ${C.dying} fading when they came)`);
  ok(C.bn === 128 && C.spreading === 10 && C.bic <= 128 && C.bnew === 40, `Caps: 128 burns at most (${C.bn}); a fire that is still spreading is never the one recycled (${C.spreading} of 10 kept, ${C.bnew} new)`);
  ok(C.rub === 64 && C.refused >= 6 && C.ric <= 64, `Caps: 64 rubble at most (${C.rub}); a destroyed house stays destroyed, so the 65th is refused, not recycled`);
  ok(C.meshes === 3, 'Scars: three draws in all, one instanced mesh per type');

  // ---- quality: fewer shown at Medium and Low, the records keep every one ----
  const Q = await p.evaluate(() => { const {Z, api} = __z, S = Z.sc, gfx = __z.gfx, o = {}; S.clear(); for (let i = 0; i < 256; i++) S.add(0, -2000 + (i % 16) * 90, -2000 + (i >> 4) * 90, 4, {fade: 1}); for (let i = 0; i < 128; i++) S.add(1, 100 + (i % 16) * 90, -2000 + (i >> 4) * 90, 9, {p: 31, fade: 1});
    for (const lv of ['high', 'med', 'low', 'high']) { gfx.set(lv); const t = S.stats(); o[lv] = {c: t.craters, b: t.burns, shown: t.shown, far: S.uniforms.uCam.value.y}; } gfx.set('auto'); S.clear(); return o; });
  ok(Q.high.shown[0] === 256 && Q.med.shown[0] === 153 && Q.low.shown[0] === 76 && Q.low.shown[1] === 38 && Q.low.c === 256 && Q.low.b === 128, `Quality: craters drawn High ${Q.high.shown[0]} / Medium ${Q.med.shown[0]} / Low ${Q.low.shown[0]} (burns ${Q.low.shown[1]} at Low); all ${Q.low.c} records kept`);
  ok(Q.high.far > Q.med.far && Q.med.far > Q.low.far, `Quality: the fade distance shrinks with the level (${Q.high.far} / ${Q.med.far} / ${Q.low.far} m)`);

  // ---- save and load: the codec round-trips, junk is dropped, the campaign validator keeps what is valid ----
  const D = await p.evaluate(() => { const {Z, api} = __z, S = Z.sc, R = (a, b) => a + Math.random() * (b - a), o = {}; S.clear(); const h = S.houses();
    for (let i = 0; i < 40; i++) { const r = R(2, 15), [x, z] = __pos(r); S.add(0, x, z, r, {v: i % 4, y: i % 32, a: i % 16, fade: 1}); }
    for (let i = 0; i < 20; i++) { const r = R(6, 28), [x, z] = __pos(r); S.add(1, x, z, r, {v: i % 4, y: i % 32, p: i % 5 ? 31 : 12, a: i % 16, fade: 1}); }
    for (let i = 60; i < 65; i++) if (S.houseDown(i)) S.add(2, h.x[i], h.z[i], 7.4, {v: i % 4, y: i % 32, fade: 1});
    const R1 = S.recs(), s1 = S.encode(); o.n = R1.length; o.len = s1.length; o.chars = /^[A-Za-z0-9_-]*$/.test(s1); o.pack = S.pack(S.unpack(s1)) === s1;
    S.clear(); S.load(s1); const R2 = S.recs(); o.same = __set(R1) === __set(R2); o.hidden = Array.from(h.dead).reduce((a, b) => a + b, 0);
    S.load(s1, {settle: true}); o.settled = S.list(1).every(r => r.pf === 1);
    const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_!?+/', rs = n => Array.from({length: n}, () => AL[Math.random() * AL.length | 0]).join(''); let bad = 0, kept = 0;
    for (let i = 0; i < 300; i++) { const s = i % 3 ? rs(8 * (Math.random() * 120 | 0)) : i % 2 ? s1.slice(0, Math.random() * s1.length | 0) : s1.replace(/./g, c => Math.random() < .03 ? '!' : c);
      try { const r = S.unpack(s); if (r.length > 448 || r.some(x => x.length !== 8 || x[0] > 2 || x[3] > 63)) bad++; S.load(s); const t = S.stats(); if (t.craters > 256 || t.burns > 128 || t.rubble > 64) bad++; kept += r.length > 0 ? 1 : 0; } catch (e) { bad++; } }
    o.junk = {bad, kept}; S.clear();
    const cc = Z.cp.cleanCamp({v: 1, d: 1, sc: {mill: s1, river: 5, silo: 'no good!', bogus: 'AAAAAAAA', rail: 'A'.repeat(3585), hosp: ''}}, 1).sc; o.camp = {keys: Object.keys(cc).join(), mill: cc.mill === s1};
    o.fresh = JSON.stringify(Z.cp.cleanCamp(null, 1).sc);
    return o; });
  ok(D.n === 65 && D.len === 8 * D.n && D.chars && D.pack && D.same && D.hidden === 5, `Save: ${D.n} scars are ${D.len} characters of the codec's alphabet and load back identically (${D.hidden} houses hidden again)`);
  ok(D.settled, 'Save: burns loaded from a save have long burnt out');
  ok(D.junk.bad === 0, `Save: 300 corrupt or truncated strings never throw and never pass a cap (${D.junk.kept} still gave some valid records)`);
  ok(D.camp.keys === 'mill,hosp' && D.camp.mill, `Campaign save: only valid scar strings survive cleanCamp (${D.camp.keys}), a valid one verbatim`);
  ok(D.fresh === '{}', 'Campaign save: a new campaign has none');

  // ---- the campaign keeps its sectors' scars; a quick defence keeps them for the run ----
  const E = await p.evaluate(() => { const {Z, G, api} = __z, S = Z.sc, o = {}; Z.cp.put(Z.cp.cleanCamp(null, 1));
    const mk = n => { for (let i = 0; i < n; i++) { const [x, z] = __pos(5); S.add(0, x, z, 5, {fade: 1}); } const [bx, bz] = __pos(12); S.add(1, bx, bz, 12, {p: 20, fade: 1}); const h = S.houses(); if (S.houseDown(10 + n)) S.add(2, h.x[10 + n], h.z[10 + n], 7.4, {fade: 1}); };
    o.start = Z.cp.start('mill', true); o.id = Z.cp.run?.id; o.s0 = S.stats(); mk(6); o.made = S.stats();
    /* clearing a wave saves them by itself */
    __open(); __z.sim(.5); G.wq.length = 0; __z.sim(2); o.clear = G.state; o.saved = api.S.zcamp.sc?.mill || ''; o.savedN = o.saved.length / 8; o.rec1 = JSON.stringify(S.recs());
    Z.cp.start('river', true); o.river = S.stats(); o.rivIds = Z.cp.run?.id; mk(3); o.river2 = S.stats();
    Z.cp.start('mill', true); o.back = S.stats(); const fin = r => r[0] === 1 ? [...r.slice(0, 6), 31, r[7]] : r; o.sameBack = __set(S.recs().map(fin)) === __set(JSON.parse(o.rec1).map(fin)); o.hid = Array.from(S.houses().dead).reduce((a, b) => a + b, 0);
    Z.cp.start('river', true); o.river3 = S.stats(); o.keys = Object.keys(api.S.zcamp.sc || {}).sort().join();
    Z.cp.openMap(); document.getElementById('zcpnew').click(); document.getElementById('zcpnew').click(); o.mid = S.stats(); Z.cp.closeMap(); Z.cp.start('mill', true); o.newCamp = S.stats(); o.newKeys = Object.keys(api.S.zcamp.sc || {}).join(); o.hid2 = Array.from(S.houses().dead).reduce((a, b) => a + b, 0);
    return o; });
  ok(E.start && E.id === 'mill' && E.s0.craters === 0 && E.made.craters === 6 && E.made.burns === 1 && E.made.rubble === 1, `Campaign: a sector starts clean and collects scars (${E.made.craters} craters, ${E.made.burns} burn, ${E.made.rubble} rubble)`);
  ok(E.savedN === 8, `Campaign: clearing a wave saves them into the campaign by itself (${E.savedN} scars saved, state ${E.clear})`);
  ok(E.river.craters + E.river.burns + E.river.rubble === 0 && E.river2.craters === 3, 'Campaign: another sector has its own (starts with none)');
  ok(E.back.craters === 6 && E.back.burns === 1 && E.back.rubble === 1 && E.sameBack && E.hid === 1, `Campaign: back in the first sector every scar is where it was, burns burnt out, the house still gone (${E.hid})`);
  ok(E.river3.craters === 3 && E.keys === 'mill,river', `Campaign: each sector keeps its own (${E.keys})`);
  ok(E.mid.craters + E.mid.burns + E.mid.rubble === 0 && E.newCamp.craters + E.newCamp.burns + E.newCamp.rubble === 0 && E.newKeys === '' && E.hid2 === 0, 'Campaign: New campaign clears them at once, nothing of the old one is saved into it, the houses are back');
  // a wave cleared with no frame drawn since the sector started (only sim steps: a fast harness, a tab in the background) is still saved: nothing waits for a frame to have seen the state before
  const E2 = await p.evaluate(() => { const {Z, G, api} = __z, S = Z.sc; Z.cp.put(Z.cp.cleanCamp(null, 1)); Z.cp.start('mill', true); for (let i = 0; i < 4; i++) { const [x, z] = __pos(5); S.add(0, x, z, 5, {fade: 1}); }
    __z.cont(); G.wq.length = 0; for (const t of api.TH) t.st = 'dead'; let n = 0; while (G.state !== 'clear' && n++ < 60) api.step(1 / 120);  /* sim steps only: no visuals call between the start and the clear */
    return {st: G.state, n, saved: (api.S.zcamp.sc?.mill || '').length / 8}; });
  ok(E2.st === 'clear' && E2.saved === 4, `Campaign: a wave cleared before any frame was drawn is saved all the same (${E2.saved} scars after ${E2.n} sim steps, state ${E2.st})`);
  const F = await p.evaluate(() => { const {Z, G, api} = __z, S = Z.sc, o = {}; api.startMatch(); o.run = Z.cp.run?.id || null; o.s0 = S.stats(); S.add(0, -1000, -1000, 5, {fade: 1}); const h = S.houses(); S.houseDown(7); S.add(2, h.x[7], h.z[7], 7.4, {fade: 1});
    __z.cont(); __z.sim(1); o.w1 = S.stats(); G.wq.length = 0; for (const t of api.TH) t.st = 'dead'; __z.sim(8); __z.cont(); __z.sim(2); o.wave = G.wave; o.w2 = S.stats(); o.saved = !!api.S.zcamp.sc?.mill;
    api.startMatch(); o.again = S.stats(); o.hid = Array.from(S.houses().dead).reduce((a, b) => a + b, 0); return o; });
  ok(F.run === null && F.s0.craters === 0 && F.w2.craters === 1 && F.w2.rubble === 1 && F.wave >= 2, `Quick defence: starts clean, keeps its scars for the run (wave ${F.wave}: ${F.w2.craters} crater, ${F.w2.rubble} rubble)`);
  ok(F.again.craters + F.again.rubble === 0 && F.hid === 0, 'Quick defence: the next run starts clean, the houses are back');

  // ---- co-op: the host's scars are the truth. Snapshot cadence is bounded; a client mirrors it and never makes its own ----
  const K = await p.evaluate(() => { const {Z, api} = __z, S = Z.sc, V = api.THREE.Vector3, gh = api.gh, o = {}, od = Object.getOwnPropertyDescriptor(Z, 'online'), md = Object.getOwnPropertyDescriptor(Z, 'mirror'); let host = true;
    Object.defineProperty(Z, 'online', {get: () => true, configurable: true}); Object.defineProperty(Z, 'mirror', {get: () => !host, configurable: true});
    try { S.clear(); for (let i = 0; i < 30; i++) { const r = 4 + i % 9, [x, z] = __pos(r); S.add(i % 2, x, z, r, {fade: 1}); } const h = S.houses(); if (S.houseDown(21)) S.add(2, h.x[21], h.z[21], 7.4, {fade: 1});
      const a = S.netOut(10000), b = S.netOut(10100); const [ex, ez] = __pos(6); S.add(0, ex, ez, 6, {fade: 1}); const c = S.netOut(10200), d = S.netOut(11000), e = S.netOut(11300), f = S.netOut(16200);
      o.cad = [!!a.d, !!b.d, !!c.d, !!d.d, !!e.d, !!f.d].join(); o.size = Math.max(a.d.length, d.d.length, f.d.length); o.revs = [a.r === b.r, c.r === d.r, c.r > a.r].join();
      const hostRecs = __set(S.recs()); host = false; S.clear();
      S.netIn(d); o.mirror = __set(S.recs()) === hostRecs; o.n = S.stats(); o.hid = Array.from(h.dead).reduce((x, y) => x + y, 0);
      __z.sim(1); o.faded = S.list(0).every(r => r.fade === 1);   /* in, faded */
      const before = JSON.stringify(S.list(0).map(r => [r.i, r.st, r.fade])); S.netIn({r: 77, d: d.d}); o.again = before === JSON.stringify(S.list(0).map(r => [r.i, r.st, r.fade]));
      S.refill(); const c0 = S.stats().craters; S.boom(new V(-2000, gh(-2000, -1500) + .5, -1500), 3); o.client = S.stats().craters - c0;
      /* the host drops two scars: the client fades them out */
      const recs = S.unpack(d.d); S.netIn({r: 78, d: S.pack(recs.slice(2))}); o.fadingOut = S.list(0).filter(r => r.st === 2).length + S.list(1).filter(r => r.st === 2).length; __z.sim(3); o.after = S.stats();
      o.badIn = (() => { try { S.netIn(null); S.netIn(5); S.netIn({r: 1, d: 7}); S.netIn({r: 2, d: 'zz'}); S.netIn({r: 3, d: '!!!!!!!!'}); return true; } catch (er) { return false; } })();
      host = true; o.hostOut = S.netOut(20000) !== null; Object.defineProperty(Z, 'mirror', {get: () => true, configurable: true}); o.mirrorOut = S.netOut(30000);
    } finally { Object.defineProperty(Z, 'online', od); Object.defineProperty(Z, 'mirror', md); S.clear(); S.cRev = -1; }
    return o; });
  ok(K.cad === 'true,false,false,true,false,true' && K.revs === 'true,true,true', `Co-op: the records go out on change (at most about once a second) and every 5 s, otherwise only the revision (${K.cad}; ${K.size} characters at most)`);
  ok(K.mirror && K.n.craters === 16 && K.n.burns === 15 && K.n.rubble === 1 && K.hid === 1, `Co-op: a client rebuilds the host's scars exactly (${K.n.craters} craters, ${K.n.burns} burns, ${K.n.rubble} rubble, the house gone)`);
  ok(K.again && K.faded, 'Co-op: the same snapshot again changes nothing (no flicker, no re-fade)');
  ok(K.client === 0, `Co-op: a client's own explosions make no scars (${K.client})`);
  ok(K.fadingOut === 2 && K.after.craters + K.after.burns === 29, `Co-op: what the host dropped fades out on the client (${K.fadingOut} fading, then ${K.after.craters + K.after.burns} left)`);
  ok(K.badIn && K.hostOut && K.mirrorOut === null, 'Co-op: junk in a snapshot is ignored; only the host sends scars');

  // a full pool on the client: the host swaps ten scars for ten new ones, and the client swaps the same ten (a fading slot is reused, no other scar is let go)
  const K2 = await p.evaluate(() => { const Z = __z.Z, S = Z.sc, o = {}, q = v => Math.round((v + 4500) / 9000 * 4095), as = (host, f) => { const od = Object.getOwnPropertyDescriptor(Z, 'online'), md = Object.getOwnPropertyDescriptor(Z, 'mirror');
      Object.defineProperty(Z, 'online', {get: () => true, configurable: true}); Object.defineProperty(Z, 'mirror', {get: () => !host, configurable: true}); try { return f(); } finally { Object.defineProperty(Z, 'online', od); Object.defineProperty(Z, 'mirror', md); } };
    S.clear(); for (let i = 0; i < 256; i++) S.add(0, -2000 + (i % 16) * 90, -2000 + (i >> 4) * 90, 3 + i % 5, {a: i % 16, fade: 1}); const s1 = S.encode(), keep = S.unpack(s1).slice(10);  /* on a grid: no two in one 2.2 m cell */
    as(false, () => { S.clear(); S.netIn({r: 1, d: s1}); }); __z.sim(1); o.n0 = S.stats().craters;
    for (let i = 0; i < 10; i++) keep.push([0, q(-1955 + i * 90), q(-2000 + 45), 10, 0, 0, 31, 0]);
    as(false, () => S.netIn({r: 2, d: S.pack(keep)})); o.mid = S.list(0).length; __z.sim(3); o.after = S.stats().craters; o.same = __set(S.recs()) === __set(keep); o.q = S.pools[0].q.length; o.nd = S.pools[0].nd; S.clear(); return o; });
  ok(K2.n0 === 256 && K2.after === 256 && K2.same && K2.q === 0 && K2.nd === 0, `Co-op: with every slot taken, a swap of ten scars on the host is the same ten on the client (${K2.n0} -> ${K2.after}, nothing pending)`);

  // ---- no glitches: the decal against the terrain, pixel by pixel ----
  // A = with the scars; B = the same frame with the depth test off (the scars drawn over everything in the same order); C = without scars. If a scar ever dips below the
  // terrain (z-fighting, clipping, a chord through a crease) A and B differ there. Flicker: the scar's own contribution (A - C) must not move when the camera moves a millimetre.
  await p.evaluate(() => __z.gfx.set('high'));  /* a fixed level: on Auto a busy machine drops the render resolution between two frames and they stop being comparable */
  const sp = await p.evaluate(() => __spots());
  ok(!!(sp.flat && sp.slope), `Pixels: a flat spot and a slope found for the checks (${JSON.stringify(sp)})`);
  await p.evaluate(() => {
    const {Z, api} = __z, S = Z.sc, gh = api.gh, sc = api.scene, ren = api.renderer, gl = ren.getContext(), M = S.pools.map(q => q.mesh), fr = window.__fr = {};
    window.__fill = (x, z) => { S.clear(); for (const [dx, dz, r, v] of [[0, 0, 3, 0], [9, 3, 6, 1], [-10, 5, 12, 2], [22, -9, 9, 3], [-28, -18, 4.5, 1]]) S.add(0, x + dx, z + dz, r, {v, y: v * 7, fade: 1}); S.add(1, x - 20, z + 18, 14, {p: 31, v: 1, y: 3, fade: 1}); S.add(1, x + 14, z + 24, 11, {p: 19, v: 2, y: 3, fade: 1}); };
    window.__cam = (c, t) => { const cam = api.camera; cam.position.set(c[0], c[1], c[2]); cam.up.set(0, 1, 0); cam.lookAt(t[0], t[1], t[2]); cam.fov = 60; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
    const hide = [], ob = sc.onBeforeRender, sh = ren.shadowMap.autoUpdate;
    window.__begin = () => { for (const o of sc.children) if (o.userData.forest || o.userData.house) { hide.push([o, o.visible]); o.visible = false; } sc.onBeforeRender = () => {}; ren.shadowMap.autoUpdate = false; };
    window.__end = () => { for (const [o, v] of hide) o.visible = v; hide.length = 0; sc.onBeforeRender = ob; ren.shadowMap.autoUpdate = sh; };
    window.__view = (spot, d, el, off = 0) => { const x = spot.x, z = spot.z, gx = gh(x + 3, z) - gh(x - 3, z), gz = gh(x, z + 3) - gh(x, z - 3), l = Math.hypot(gx, gz), ux = l > .01 ? -gx / l : 0, uz = l > .01 ? -gz / l : 1, e = el * Math.PI / 180,
      cx = x + ux * d * Math.cos(e), cz = z + uz * d * Math.cos(e), y0 = gh(x, z); __cam([cx + off * -uz, Math.max(y0 + d * Math.sin(e), gh(cx, cz) + 2), cz + off * ux], [x, y0 + 1, z]); };
    window.__grab = (name, mode) => __rd(() => { S.tick(1e-4); S.uniforms.uTime.value = 1; if (Z.so) Z.so.W.root.visible = !!window.__roads;  /* the embers flicker with time: hold it still */ for (const m of M) { m.visible = mode !== 'off' && m.geometry.instanceCount > 0; m.material.depthTest = mode !== 'nodepth'; }
      ren.render(sc, api.camera); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); fr[name] = b; b.dims = w + 'x' + h; for (const m of M) m.material.depthTest = true; return w * h; });
    window.__diff = (a, b, thr) => { const A = fr[a], B = fr[b]; if (A.dims !== B.dims) return NaN; let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) > thr || Math.abs(A[i + 1] - B[i + 1]) > thr || Math.abs(A[i + 2] - B[i + 2]) > thr) n++; return n; };
    /* pixels where frames a and b differ by more than thr, counted only where m1 and m2 differ by more than 8 (the footprint of the scars) */
    window.__diffIn = (a, b, thr, m1, m2) => { const A = fr[a], B = fr[b], X = fr[m1], Y = fr[m2]; if (A.dims !== B.dims || A.dims !== X.dims || A.dims !== Y.dims) return NaN; let n = 0, f = 0; for (let i = 0; i < A.length; i += 4) { if (Math.abs(X[i] - Y[i]) <= 8 && Math.abs(X[i + 1] - Y[i + 1]) <= 8 && Math.abs(X[i + 2] - Y[i + 2]) <= 8) continue; f++; if (Math.abs(A[i] - B[i]) > thr || Math.abs(A[i + 1] - B[i + 1]) > thr || Math.abs(A[i + 2] - B[i + 2]) > thr) n++; } return [n, f]; };
    window.__flick = (a0, c0, a1, c1, thr) => { const A0 = fr[a0], C0 = fr[c0], A1 = fr[a1], C1 = fr[c1]; if (A0.dims !== A1.dims || A0.dims !== C0.dims || A0.dims !== C1.dims) return [NaN, 0]; let n = 0, m = 0; for (let i = 0; i < A0.length; i += 4) for (let k = 0; k < 3; k++) { const d0 = A0[i + k] - C0[i + k], d1 = A1[i + k] - C1[i + k]; if (d0 !== 0 || d1 !== 0) m++; if (Math.abs(d0 - d1) > thr) n++; } return [n, m]; };
    /* which scar owns the pixels that differ (a failure's diagnosis: scar -> number of differing pixels) */
    window.__who = (a, b, m1, m2) => { const A = fr[a], B = fr[b], X = fr[m1], Y = fr[m2], [w, h] = A.dims.split('x').map(Number), cam = api.camera, V = api.THREE.Vector3, L = [], by = {};
      for (const t of [0, 1]) for (const r of S.list(t)) { const v = new V(r.x, gh(r.x, r.z), r.z), d = v.distanceTo(cam.position); v.project(cam); L.push({id: ['crater', 'burn'][t] + ' r' + Math.round(r.r) + ' @' + Math.round(r.x) + ',' + Math.round(r.z), x: (v.x * .5 + .5) * w, y: (v.y * .5 + .5) * h, rad: r.r * cam.projectionMatrix.elements[5] * h / 2 / d}); }
      for (let i = 0, k = 0; i < A.length; i += 4, k++) { if (Math.abs(X[i] - Y[i]) <= 8 && Math.abs(X[i + 1] - Y[i + 1]) <= 8 && Math.abs(X[i + 2] - Y[i + 2]) <= 8) continue;
        if (!(Math.abs(A[i] - B[i]) > 5 || Math.abs(A[i + 1] - B[i + 1]) > 5 || Math.abs(A[i + 2] - B[i + 2]) > 5)) continue; const px = k % w, py = k / w | 0; let best = null, bd = 1e9; for (const s of L) { const q = Math.hypot(px - s.x, py - s.y) / Math.max(1, s.rad); if (q < bd) { bd = q; best = s.id; } } by[best] = (by[best] | 0) + 1; }
      return by; };
    window.__trio = (spot, d, el) => { __view(spot, d, el); __grab('on', 'on'); __grab('nd', 'nodepth'); __grab('off', 'off'); const [ab, ac] = __diffIn('on', 'nd', 5, 'nd', 'off'); return {ab, ac, who: ab > Math.max(10, ac * .01) ? __who('on', 'nd', 'nd', 'off') : null}; };  /* ac: where the scars would show with no depth test at all; ab: how much of that differs when the depth test is on */
    window.__flk = (spot, d, el) => { for (let k = 0; k < 3; k++) { __view(spot, d, el, k * .001); __grab('a' + k, 'on'); __grab('c' + k, 'off'); } const x = __flick('a0', 'c0', 'a1', 'c1', 10), y = __flick('a1', 'c1', 'a2', 'c2', 10); return [x[0] + y[0], x[1]]; };
    __begin();
  });
  const rep = [];
  for (const [nm, spot] of [['flat', sp.flat], ['slope', sp.slope]]) {
    await p.evaluate(({x, z}) => __fill(x, z), spot);
    for (const [d, el] of [[14, 10], [14, 45], [60, 12], [60, 45], [200, 14], [200, 45], [500, 18], [500, 60]]) {
      const r = await p.evaluate(({spot, d, el}) => __trio(spot, d, el), {spot, d, el});
      rep.push(`${nm} ${d} m ${el} deg: ${r.ac} scar px, ${r.ab} differ without depth` + (r.who ? ' ' + JSON.stringify(r.who) : ''));
      ok(r.ac > 40 && r.ab <= Math.max(10, r.ac * .01), `Pixels (${nm}, ${d} m, ${el} deg): the scars sit on the terrain, ${r.ab} of ${r.ac} scar pixels differ with the depth test off`);
    }
    for (const [d, el] of [[40, 20], [300, 30]]) {
      const [n, m] = await p.evaluate(({spot, d, el}) => __flk(spot, d, el), {spot, d, el});
      ok(m > 200 && n <= Math.max(4, m * .0005), `Pixels (${nm}, ${d} m): no flicker, a millimetre of camera motion moves ${n} of ${m} scarred samples`);
    }
  }
  console.log('  ' + rep.join('\n  '));
  // the enemy's supply roads are raised ribbons: no scar is made on one or reaching one (it would be cut off along the ribbon's edge); a crater beside a road sits clear of it
  const Rd = await p.evaluate(() => { const {Z, api} = __z, S = Z.sc, V = api.THREE.Vector3, gh = api.gh, o = {}, W = Z.so.W; S.clear(); let pick = null;
    for (const r of W.routes) for (let i = 8; i < r.X.length - 8 && !pick; i += 6) { const tx = r.X[i + 1] - r.X[i - 1], tz = r.Z[i + 1] - r.Z[i - 1], l = Math.hypot(tx, tz), x = r.X[i], z = r.Z[i], bx = x - tz / l * 14, bz = z + tx / l * 14;
      if (!S.bad(bx, bz, 6) && Math.abs(gh(bx, bz) - gh(x, z)) < 4 && Math.abs(x) < 4000 && Math.abs(z) < 4000) pick = {x, z, bx, bz}; }
    o.found = !!pick; if (!pick) return o; const {x, z, bx, bz} = pick; o.gap = S.roadGap(x, z) < 1;
    S.refill(); S.boom(new V(x, gh(x, z) + .5, z), 3); o.onRoad = S.stats().craters + S.stats().burns;                       /* a big hit on the road itself: no scar */
    S.refill(); S.boom(new V(x + (bx - x) * 6 / 14, gh(x, z) + .5, z + (bz - z) * 6 / 14), 3); o.near = S.stats().craters + S.stats().burns;  /* 6 m off the centre line: still touching the ribbon */
    S.refill(); S.boom(new V(bx, gh(bx, bz) + .5, bz), 1.6); o.beside = S.stats().craters; __z.sim(1); /* it fades in */ window.__roads = true; return Object.assign(o, {spot: {x: bx, z: bz}}); });
  ok(Rd.found && Rd.gap && Rd.onRoad === 0 && Rd.near === 0 && Rd.beside === 1, `Roads: a hit on an enemy road or touching it leaves no scar (${Rd.onRoad} / ${Rd.near}); 14 m beside it a crater is made (${Rd.beside})`);
  if (Rd.found) { const r = await p.evaluate(spot => { const [ab, ac] = (__view(spot, 30, 40), __grab('on', 'on'), __grab('nd', 'nodepth'), __grab('off', 'off'), __diffIn('on', 'nd', 5, 'nd', 'off')); window.__roads = false; return {ab, ac}; }, Rd.spot);
    ok(r.ac > 40 && r.ab <= Math.max(10, r.ac * .01), `Roads: with the road drawn, a crater beside it sits on the ground: ${r.ab} of ${r.ac} scar pixels differ with the depth test off`); }

  const far = await p.evaluate(spot => { __fill(spot.x, spot.z); __view(spot, 2600, 20); __grab('fon', 'on'); __grab('foff', 'off'); return __diff('fon', 'foff', 4); }, sp.flat);
  ok(far <= 4, `Pixels: 2.6 km away the scars have faded out completely (${far} pixels)`);
  await p.evaluate(() => __end());

  // ---- frame cost with every cap full (256 + 128 + 64), looking straight down at them ----
  const T = await p.evaluate(() => { const {Z, api} = __z, S = Z.sc, gh = api.gh, ren = api.renderer, gl = ren.getContext(), M = S.pools.map(q => q.mesh), o = {}; S.clear(); const cx = 700, cz = -1100, R = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 256; i++) S.add(0, cx + R(-70, 70), cz + R(-70, 70), R(3, 14), {v: i % 4, y: i % 32, fade: 1});
    for (let i = 0; i < 128; i++) S.add(1, cx + R(-70, 70), cz + R(-70, 70), R(8, 26), {v: i % 4, y: i % 32, p: i % 3 ? 31 : 14, fade: 1});
    const h = S.houses(); let k = 0; for (let i = 0; i < 400 && k < 64; i++) if (S.houseDown(i)) { S.add(2, h.x[i], h.z[i], 7.4, {fade: 1}); k++ }
    o.full = S.stats(); __begin(); __cam([cx, gh(cx, cz) + 120, cz + 60], [cx, gh(cx, cz), cz]);
    const px = new Uint8Array(4), time = on => __rd(() => { S.tick(1e-4); S.uniforms.uTime.value = 1; if (Z.so) Z.so.W.root.visible = false; for (const m of M) m.visible = on && m.geometry.instanceCount > 0; const t0 = performance.now(); ren.render(api.scene, api.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const dt = performance.now() - t0;  /* reading a pixel waits for the GPU: finish() does not in Chrome */ return [dt, ren.info.render.calls, ren.info.render.triangles]; });
    time(true); time(false); const on = [], off = []; let ci = [0, 0], ti = [0, 0];
    for (let i = 0; i < 8; i++) { const a = time(true), b = time(false); on.push(a[0]); off.push(b[0]); ci = [a[1], b[1]]; ti = [a[2], b[2]]; }
    o.on = __med(on); o.off = __med(off); o.calls = ci[0] - ci[1]; o.tris = ti[0] - ti[1];
    /* the per-frame JS of the scars (fades, spread, flames, upload) with every slot live and a wave running */
    __end(); __open(); __z.sim(.3); const t0 = performance.now(); for (let i = 0; i < 300; i++) Z.visuals(.016); o.cpu = (performance.now() - t0) / 300; S.clear(); const t1 = performance.now(); for (let i = 0; i < 300; i++) Z.visuals(.016); o.cpu0 = (performance.now() - t1) / 300;
    return o; });
  console.log(`  frame time with every cap full: ${T.on.toFixed(2)} ms with scars, ${T.off.toFixed(2)} ms without (+${(T.on - T.off).toFixed(2)} ms), +${T.calls} draw calls, +${T.tris} triangles; per-frame JS ${T.cpu.toFixed(3)} ms vs ${T.cpu0.toFixed(3)} ms empty`);
  ok(T.full.craters === 256 && T.full.burns === 128 && T.full.rubble === 64, `Frame cost: every cap full (${T.full.craters} / ${T.full.burns} / ${T.full.rubble})`);
  ok(T.calls === 3 && T.tris > 0, `Frame cost: three more draw calls for everything (+${T.calls}, +${T.tris} triangles)`);
  timingCheck(T.on - T.off < 5, `Frame cost: ${(T.on - T.off).toFixed(2)} ms more to draw 448 scars packed into one 140 m square, fifteen layers deep, from 120 m up (budget 5 ms, the dev GPU adds 1 to 2 ms to that and is noisy when busy; GPU time locally, software GL in CI)`, ok);
  timingCheck(T.cpu - T.cpu0 < .35, `Frame cost: the scars' per-frame JS with every slot live is ${(T.cpu - T.cpu0).toFixed(3)} ms (budget .35 ms)`, ok);

  // ---- nothing leaks: restarts put everything back, no GPU or JS growth from the scars ----
  const Lk = await p.evaluate((H0) => { const {Z, api, G} = __z, S = Z.sc, o = {}, mem = () => { const m = api.renderer.info.memory; return [m.geometries, m.textures, api.renderer.info.programs.length]; };
    const fill = () => { S.clear(); for (let i = 0; i < 256; i++) S.add(0, -2000 + i * 10, -1900, 5, {fade: 1}); for (let i = 0; i < 128; i++) S.add(1, -2000 + i * 20, -1800, 10, {fade: 1}); const h = S.houses(); for (let i = 0; i < 30; i++) if (S.houseDown(100 + i)) S.add(2, h.x[100 + i], h.z[100 + i], 7.4, {fade: 1}); };
    fill(); __z.sim(.5); S.load(S.encode()); __z.sim(.5); const m0 = mem();
    for (let c = 0; c < 8; c++) { fill(); __z.sim(.5); S.load(S.encode()); S.apply(S.encode()); __z.sim(.5); S.clear(); }
    o.mem = [m0, mem()]; o.q = S.pools.map(q => q.q.length);
    for (let c = 0; c < 4; c++) { fill(); __z.sim(.3); api.startMatch(); }
    const h = S.houses(); o.stats = S.stats(); o.walls = __sig(h.w) === H0.walls && __sig(h.r) === H0.roofs; o.col = api.scene.userData.hcol.every(q => q.y < 1e5); o.dead = Array.from(h.dead).reduce((a, b) => a + b, 0);
    Z.stop(); o.stop = S.stats(); o.vis = S.pools.map(q => q.mesh.visible); o.meshes = api.scene.children.filter(x => x.userData.scars !== undefined).length; return o; }, H0);
  ok(Lk.mem[0].join() === Lk.mem[1].join(), `Leaks: eight cycles of full caps, save, load and snapshot add no GPU geometries, textures or programs (${Lk.mem[0]} -> ${Lk.mem[1]}) and leave nothing pending (${Lk.q})`);
  ok(Lk.stats.craters + Lk.stats.burns + Lk.stats.rubble === 0 && Lk.dead === 0 && Lk.walls && Lk.col, 'Leaks: four full-to-the-caps runs and restarts later nothing is left (scars 0, houses all back, colliders back)');
  ok(Lk.vis.every(v => !v) && Lk.meshes === 3 && Lk.stop.craters === 0, 'Leaks: once the run is stopped no scar is drawn (the menu sees nothing), still three meshes in all');
  ok(!errs.length, 'Scars: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- threat briefing (zbrief.js): the card on the base screen says what the wave that then spawns holds (types, numbers, directions, timing); the boss
// warning; what the intel level shows; it follows the plan when a strike cuts it; the collapse toggle (and its memory); the radio line; nothing leaks ----------
if (want('briefing')) {
  const {p, errs} = await page();
  await p.evaluate(() => { const S = __z.api.S; S.zwx = 'wave'; delete S.zbrief; });  /* the weather plan on and the card open, whatever an earlier section left in the shared saved settings (the bosses section turns Zombies weather off) */
  await play(p);
  // inside the page: open the break of wave w at an intel level, read the card, spawn the wave (launch times squeezed under 1.5 s unless told otherwise) and measure what appeared
  await p.evaluate(() => {
    const {Z, G, api, KIND} = __z, sec = b => b < -.43 ? 0 : b > .43 ? 2 : 1;
    window.__brk = (w, radar, ewr) => { G.perks.radar = radar; G.kc.ewr = ewr; __z.jump(w, 1e6); Z.openBase(); return Z.brief.data(); };
    window.__card = () => { const c = document.getElementById('zbrief'); return {text: c ? c.innerText.replace(/\s+/g, ' ') : '', rows: c ? c.querySelectorAll('.zbrows li').length : 0, icons: c ? [...c.querySelectorAll('.zbrows .zbg')].every(e => e.textContent.trim()) : false,
      foot: [...document.querySelectorAll('#zbase .zfk')].map(e => e.textContent.replace(/\s+/g, ' ').trim())}; };
    window.__spawn = squeeze => { const seen = new Set(), rec = [], at = G.next.q.map(e => e.at).sort((a, b) => a - b); __z.cont(); if (squeeze) for (const q of G.wq) q.at = Math.min(q.at, 1.5);
      const scan = () => { for (const t of api.TH) if (!seen.has(t.id)) { seen.add(t.id); rec.push({k: t.k, brg: Math.atan2(t.p.x, 1950 - t.p.z), t: G.wt}); } };
      for (let i = 0; i < 20000 && G.state === 'wave' && G.wq.length; i++) { __z.sim(1 / 120); scan(); } scan();  /* one tick at a time: a track is read where it appeared, not a quarter second on (a bearing near a sector's edge could flip) */
      for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; return {rec, at}; };
    // the briefing against what spawned: kinds and numbers exactly, the share of threat by compass point and by launch sector, the launch times
    window.__cmp = (D, R, timed) => { const cnt = {}, bk = Object.fromEntries(D.kinds.map(k => [k.k, k.n])); for (const r of R.rec) cnt[r.k] = (cnt[r.k] | 0) + 1;
      const kinds = Object.keys(bk).length === Object.keys(cnt).length && Object.keys(bk).every(k => bk[k] === cnt[k]);
      const wt = r => r.k === 'swarm' ? 2 : Math.max(4, KIND[r.k].pts || 0); let tot = 0; const dm = {}, sm = {};
      for (const r of R.rec) { tot += wt(r); const d = Z.brief.dirOf(r.brg), s = sec(r.brg); dm[d] = (dm[d] || 0) + wt(r); sm[s] = (sm[s] || 0) + wt(r); }
      const dev = (A, B) => { let m = 0; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) m = Math.max(m, Math.abs((A[k] || 0) - (B[k] || 0))); return m; };
      const cd = Object.fromEntries(D.dirs.map(d => [d.id, d.share])), cs = Object.fromEntries(D.secs.map(s => [s.id, s.share])), act = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / tot]));
      const ts = R.rec.map(r => r.t).sort((a, b) => a - b); let tdev = 0; if (timed) ts.forEach((t, i) => { tdev = Math.max(tdev, Math.abs(t - R.at[i])); });
      return {kinds, n: R.rec.length, dirDev: dev(cd, act(dm)), secDev: dev(cs, act(sm)), tdev, spawned: Object.keys(cnt).join()}; };
  });
  // ---- the card matches the wave that spawns, at every intel level ----
  const cases = [{w: 1, radar: 0, ewr: 0, tier: 0, sq: false}, {w: 6, radar: 3, ewr: 0, tier: 1, sq: true}, {w: 15, radar: 3, ewr: 1, tier: 2, sq: true}, {w: 25, radar: 3, ewr: 2, tier: 3, sq: true}, {w: 10, radar: 0, ewr: 0, tier: 0, sq: true}];
  const TN = ['BASIC', 'GOOD', 'HIGH', 'FULL'];
  for (const c of cases) {
    const r = await p.evaluate(c => { const D = __brk(c.w, c.radar, c.ewr), card = __card(), R = __spawn(c.sq); return {D, card, cmp: __cmp(D, R, !c.sq)}; }, c);
    const foot = r.card.foot.reduce((a, t) => a + (+(t.match(/^(\d+)×/) || [0, 0])[1]), 0);
    ok(r.cmp.kinds && r.cmp.n === r.D.n && r.D.n > 0 && foot === r.D.n && r.card.text.includes(`${r.D.n} tracks`), `Briefing wave ${c.w}: ${r.D.n} tracks of ${r.D.kinds.map(k => k.k).join('/')} on the card = the footer list = what spawned (${r.cmp.n}: ${r.cmp.spawned})`);
    ok(r.cmp.dirDev <= .06 && r.cmp.secDev <= .06, `Briefing wave ${c.w}: the compass shares (${r.D.dirs.map(d => d.id + ' ' + Math.round(d.share * 100) + '%').join(' ')}) and launch sectors match where the tracks appeared (off by ${(r.cmp.dirDev * 100).toFixed(1)} / ${(r.cmp.secDev * 100).toFixed(1)} points)`);
    if (!c.sq) ok(r.cmp.tdev <= .05 && r.D.t0 === 0 && Math.abs(r.D.t1 - 25) < .5,`Briefing wave ${c.w}: tracks launched when the plan said (launch window ${r.D.t0}-${r.D.t1} s, largest difference ${r.cmp.tdev.toFixed(2)} s)`);
    ok(r.D.tier === c.tier && r.card.text.includes('INTEL ' + TN[c.tier]) && r.card.rows >= 3 && r.card.rows <= 5 && r.card.icons, `Briefing wave ${c.w}: INTEL ${TN[r.D.tier]} (${r.D.warn} s of warning), ${r.card.rows} lines with an icon each`);
  }
  // ---- what each intel level shows (one plan with a ballistic missile in it, read at all four levels), and that nothing is said that the plan does not hold ----
  const IL = await p.evaluate(() => { const {Z, G} = __z, o = [], D0 = __brk(25, 0, 0);
    for (const [radar, ewr] of [[0, 0], [3, 0], [3, 1], [3, 2]]) { G.perks.radar = radar; G.kc.ewr = ewr; Z.base.refresh(); const D = Z.brief.data(); o.push({tier: D.tier, text: __card().text, raids: D.raids, fast: D.fast.map(f => f.k + ':' + f.secs.join('/')), peak: D.peak != null, heavy: !!D.heavy}); }
    return {o, kinds: D0.kinds.map(k => k.k).join()}; });
  const T = IL.o.map(x => x.text);
  ok(IL.o.map(x => x.tier).join() === '0,1,2,3', `Intel: warning time 20 s -> BASIC, Long-range radar x3 (44 s) -> GOOD, + early-warning radar 1 / 2 (59 / 74 s) -> HIGH / FULL`);
  ok(!/raid|%/.test(T[0]) && /From [A-Z][a-z]+/.test(T[0]) && /raids?/.test(T[1]) && /\d+%/.test(T[1]) && /launching \d:\d\d–\d:\d\d/.test(T[1]) && !/peak|heaviest/.test(T[1] + T[2]), `Intel: BASIC says the launch sector only; GOOD adds compass bearings with shares, the raids and the launch window (BASIC: "${T[0].match(/From[^⚠]*/)?.[0].trim()}")`);
  ok(/fast missiles: \d+ ballistics?\b(?! \()/.test(T[1]) && /fast missiles: [^⚠☁]*\((West|North|East)/.test(T[2]) && IL.o[2].fast.length > 0, `Intel: the fast missiles by launch sector from HIGH up (GOOD: "${T[1].match(/fast missiles: [^⚠☁]*/)?.[0].trim()}", HIGH: "${T[2].match(/fast missiles: [^⚠☁]*/)?.[0].trim()}")`);
  ok(IL.o[3].peak && IL.o[3].heavy && /peak ~\d:\d\d/.test(T[3]) && /heaviest raid [A-Z]+ \(\d+\)/.test(T[3]) && !/peak|heaviest/.test(T[2]), 'Intel: FULL adds the moment of peak pressure and the heaviest raid');
  // ---- boss warning when one is due, a look-ahead when not ----
  const BW = await p.evaluate(() => [1, 9, 10, 11, 19, 20].map(w => { const D = __brk(w, 0, 0), t = __card().text; return {w, boss: D.boss.map(b => b.k).join(), due: D.due, next: D.next, warn: /BOSS WAVE: Mothership/.test(t), look: (t.match(/next boss: wave \d+ \(\d+ waves? on\)/) || [''])[0]}; }));
  ok(BW.filter(b => b.warn).map(b => b.w).join() === '10,20' && BW.filter(b => b.boss).map(b => b.w).join() === '10,20' && BW.filter(b => b.due).map(b => b.w).join() === '10,20', `Boss: the warning is on the card for waves 10 and 20 and no other (${BW.map(b => b.w + (b.warn ? ' BOSS' : '')).join(', ')})`);
  ok(BW[0].look === 'next boss: wave 10 (9 waves on)' && BW[1].look === 'next boss: wave 10 (1 wave on)' && BW[3].look === 'next boss: wave 20 (9 waves on)', `Boss: otherwise the card says how far the next one is ("${BW[0].look}", "${BW[1].look}", "${BW[3].look}")`);
  /* the look-ahead follows what decides the plan: with every boss blocked no boss is announced (a heavy raid comes), a campaign sector announces its set piece and not the every-10 Mothership */
  const NB = await p.evaluate(() => { const {Z} = __z, B = Z.brief, run0 = Object.getOwnPropertyDescriptor(Z.cp, 'run'), sect = (id, mods) => Object.defineProperty(Z.cp, 'run', {get: () => ({id, endless: false, mods: mods.map(id => ({id}))}), configurable: true}), o = {};
    o.quick = [B.bossDue(10), B.nextBoss(1)]; Z.codex.set('boss', 'allowed', false); o.blocked = [B.bossDue(10), B.nextBoss(1)]; Z.codex.set('boss', 'allowed', true);
    sect('mill', ['clear']); o.mill = [B.bossDue(5), B.bossDue(10), B.nextBoss(0)]; sect('gate', ['boss5']); o.gate = [B.bossDue(15), B.bossDue(17), B.bossDue(20), B.nextBoss(10)]; Object.defineProperty(Z.cp, 'run', run0); return o; });
  ok(NB.quick.join() === 'true,10' && NB.blocked.join() === 'false,0' && NB.mill.join() === 'true,false,5' && NB.gate.join() === 'true,true,true,15', `Boss look-ahead: ${JSON.stringify(NB)} (quick defence: wave 10; every boss blocked: none; Old Mill: its set piece at 5, not 10; Launch Complex: the escort every 5 and the Hush at 17)`);
  // ---- it follows the plan: a strike that cuts the fast missiles out of the wave changes the card ----
  const CU = await p.evaluate(() => { const {Z, G} = __z, D = __brk(25, 3, 0), a = D.fast.map(f => f.n).reduce((x, y) => x + y, 0);
    let cut = 0; for (let si = 0; si < 3; si++) cut += Z.cutFast(si, 99, 'ballistic'); Z.base.refresh(); const D2 = Z.brief.data(), t = __card().text; return {n0: D.n, n1: D2.n, a, cut, fast1: D2.fast.length, shown: /ballistic/.test(t), says: t.includes(`${D2.n} tracks`)}; });
  ok(CU.cut > 0 && CU.n1 === CU.n0 - CU.cut && CU.fast1 === 0 && !CU.shown && CU.says, `Plan cut: a strike took ${CU.cut} ballistic missile${CU.cut > 1 ? 's' : ''} out of the next wave, the card went from ${CU.n0} to ${CU.n1} tracks and lost its fast-missile line`);
  // ---- a co-op client has no timed queue (only the list and the bearings): the card still reads, and the pure analysis agrees ----
  const CO = await p.evaluate(() => { const {Z, G} = __z, D = __brk(25, 3, 0), P = G.next, keep = P.q; const A = Z.brief.analyse({list: P.list, brgs: P.brgs, wx: null}, {w: 25, tier: 1}); G.next = {list: P.list, brgs: P.brgs, wx: null}; Z.base.refresh(); const h = Z.brief.html(), t = __card().text;
    G.next = {list: [], brgs: [], q: [], wx: null}; let empty = ''; try { empty = Z.brief.html(); } catch (e) { empty = 'ERR ' + e; } G.next = P; Z.base.refresh();
    return {n: A.n, nFull: D.n, t0: A.t0, kinds: A.kinds.map(k => k.k + k.n).join() === D.kinds.map(k => k.k + k.n).join(), html: h.includes(`${D.n} tracks`), card: t.includes(`${D.n} tracks`), empty: typeof empty === 'string' && !/^ERR/.test(empty), nul: Z.brief.analyse(null) === null}; });
  ok(CO.n === CO.nFull && CO.kinds && CO.t0 === null && CO.html && CO.card && CO.empty && CO.nul, 'Briefing from a plan without the timed queue (a co-op client), an empty plan and no plan: the same counts, no timing, nothing thrown');
  // ---- the radio line when the wave starts, through the announcer's radio (Z.an.radio) ----
  const RD = await p.evaluate(() => { const {Z, G, api} = __z, calls = [], r0 = Z.an.radio; Z.an.radio = (who, txt, pri) => { calls.push([who, txt, pri]); }; __brk(7, 0, 0); const line = Z.brief.line(); __z.cont();
    Z.an.radio = r0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; const mine = calls.filter(c => c[0] === 'OVERLORD' && /^(Wave 7|Intel): /.test(c[1]));
    return {line, calls: mine.length, text: mine[0]?.[1] || '', radioOn: !!Z.radio && api.S.zradio !== false}; });
  /* with the radio chatter on (zradio.js) it calls the wave itself, so this one reads "Intel: ..."; without it, "Wave 7: ..." */
  ok(/^Wave 7: \d+ tracks?, .+, from the [a-z -]+\.$/.test(RD.line) && RD.calls === 1 && RD.text === (RD.radioOn ? RD.line.replace(/^Wave 7: /, 'Intel: ') : RD.line), `Radio: one line at the start of the wave, through the announcer's radio (${RD.radioOn ? 'the radio chatter is on, so "Intel: ..."' : 'plain'}: "${RD.text}")`);
  // ---- collapse: one line instead of the rows, kept in the settings ----
  const CL = await p.evaluate(() => { const {Z, G, api} = __z, S = api.S; __brk(12, 3, 0); const q = () => { const c = document.getElementById('zbrief'); return {col: c.classList.contains('col'), rows: c.querySelectorAll('.zbrows').length, line: c.querySelector('.zbl')?.textContent || '', exp: c.querySelector('#zbtog').getAttribute('aria-expanded'), btn: c.querySelector('#zbtog').textContent, s: S.zbrief | 0}; };
    const a = q(); document.getElementById('zbtog').click(); const b = q(); document.getElementById('zbtog').click(); const c = q(); document.getElementById('zbtog').click(); return {a, b, c, d: q()}; });
  ok(!CL.a.col && CL.a.rows === 1 && CL.a.exp === 'true' && CL.b.col && CL.b.rows === 0 && /^Wave 12: \d+ tracks/.test(CL.b.line) && /wind \d+–\d+ km\/h/.test(CL.b.line) && CL.b.exp === 'false' && CL.b.s === 1 && !CL.c.col && CL.c.s === 0 && CL.d.col && CL.d.s === 1, `Collapse: the button folds the card to one line ("${CL.b.line.trim().slice(0, 90)}") and back, the choice goes to the settings`);
  // ---- nothing leaks: many redraws, toggles and restarts add no nodes, listeners, GPU objects or wrappers ----
  const LK = await p.evaluate(() => { const {Z, G, api} = __z, S = api.S, m = () => { const i = api.renderer.info.memory; return [i.geometries, i.textures, api.renderer.info.programs.length].join(); }, nodes = () => document.querySelectorAll('#zbase *').length;
    /* the baseline is taken after one of everything (a redraw, a toggle, a restart: whatever the base screen, the codex strip, the scars or the onboarding card build lazily), on this very page: what is checked is growth, not a count */
    if (Z.brief.collapsed()) Z.brief.toggle(); __brk(12, 3, 0); Z.base.refresh(); Z.brief.toggle(); Z.brief.toggle(); api.startMatch(); __brk(12, 3, 0); Z.base.refresh();
    const o = {m0: m(), n0: nodes(), c0: Z.continue, h0: Z.briefHTML};
    for (let i = 0; i < 60; i++) { Z.base.refresh(); if (i % 3 === 0) Z.brief.toggle(); } if (Z.brief.collapsed()) Z.brief.toggle(); o.n1 = nodes(); o.m1 = m(); o.cards = document.querySelectorAll('#zbrief').length;
    for (let i = 0; i < 3; i++) api.startMatch(); o.same = Z.continue === o.c0 && Z.briefHTML === o.h0; o.cards2 = document.querySelectorAll('#zbrief').length; document.getElementById('zbtog').click(); o.once = (S.zbrief | 0) === 1; document.getElementById('zbtog').click();
    __brk(12, 3, 0); Z.base.refresh(); o.m2 = m(); o.n2 = nodes(); return o; });
  ok(LK.n1 === LK.n0 && LK.m1 === LK.m0 && LK.m2 === LK.m0 && LK.cards === 1 && LK.cards2 === 1, `Leaks: 60 redraws, 20 toggles and 3 restarts add nothing to the base screen (${LK.n0} -> ${LK.n1} nodes over the redraws, one card) or the GPU (${LK.m0} -> ${LK.m1} -> ${LK.m2})`);
  ok(LK.same && LK.once, 'Leaks: the hooks are wrapped once (Continue, the base screen hook) and the toggle fires once per click after restarts');
  // ---- the choice survives a reload ----
  await p.evaluate(() => { __z.api.S.zbrief = 1; __z.api.save(); });
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 5); await play(p);
  const RL = await p.evaluate(() => { const c = document.getElementById('zbrief'); return {col: c?.classList.contains('col'), line: c?.querySelector('.zbl')?.textContent || ''}; });
  ok(RL.col && /^Wave 1: 2 tracks/.test(RL.line), `Collapse: after a reload the card is still folded ("${RL.line.trim().slice(0, 70)}")`);
  ok(!errs.length, 'Briefing: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.evaluate(() => localStorage.removeItem('dl-interceptor'));  /* the folded card is a saved setting: the next section starts clean */
  await p.close();
}

// ---------- Endless (zendless.js): opens only once the Launch Complex is held; a sector with no objective whose waves climb past the caps (tracks, speed, armour, damage, bosses);
// milestones; the sector's scars carry forward, grow and are saved (and survive a reload); the run goes on the Endless table and costs the campaign nothing; nothing leaks ----------
if (want('endless')) {
  const {p, errs} = await page(); await pinRoads(p);
  const reload = async () => { await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 3); await pinRoads(p); };
  const boot = async (camp, zend) => { await p.evaluate((c, z) => { const s = JSON.parse(localStorage.getItem('dl-interceptor') || '{}'); if (c === undefined) delete s.zcamp; else s.zcamp = c; if (z === undefined) delete s.zend; else s.zend = z;
    Object.assign(s, {zdiff: 1, gmode: 'z', zload: null}); delete s.zbrief; localStorage.setItem('dl-interceptor', JSON.stringify(s)); }, camp, zend); await reload(); };
  const begun = () => p.waitForFunction(() => __z.G.state === 'base' && !!__z.Z.cp.run, {timeout: 30000}).then(() => true, () => false);
  const nosc = c => JSON.stringify({...c, sc: 0});  /* the campaign without the scars: what an Endless run must not change */

  // ---- locked until the capstone is held ----
  await boot(undefined, undefined);
  const L0 = await p.evaluate(() => { const {Z} = __z, r = {un: Z.endless.unlocked(), go: !!document.getElementById('zendgo'), hidden: document.getElementById('zendboard').hidden, a: Z.endless.start('gate'), b: Z.endless.start('mill')};
    Z.cp.openMap(); Z.cp.select('mill'); const b = document.getElementById('zcpend'); r.btn = b ? {dis: b.disabled, title: b.title} : null; Z.cp.closeMap(); return r; });
  ok(!L0.un && !L0.go && L0.hidden && !L0.a && !L0.b && L0.btn?.dis && /Launch Complex/.test(L0.btn.title), `Endless is locked on a fresh campaign: no menu button, no table, start() refuses, the briefing's button is greyed ("${L0.btn?.title}")`);
  const L1 = await p.evaluate(() => { const {Z} = __z, ids = ['mill', 'river', 'silo', 'rail', 'hosp', 'power', 'air'], c = Z.cp.C(); c.held = ids; c.done = 1; Z.cp.put(c);  /* seven sectors and a hand-set "done" */
    const r = {done: Z.cp.C().done, un: Z.endless.unlocked(), a: Z.endless.start('mill'), gate: Z.cp.status('gate'), go0: !!document.getElementById('zendgo')};
    const w = Z.cp.result(Z.cp.C(), 'gate', true, null); Z.cp.put(w.c); Z.syncMode(); r.done2 = Z.cp.C().done; r.un2 = Z.endless.unlocked(); r.go = !!document.getElementById('zendgo'); r.hidden = document.getElementById('zendboard').hidden;
    r.txt = document.getElementById('zcpm').textContent.replace(/\s+/g, ' '); return r; });
  ok(L1.done === 0 && !L1.un && !L1.a && L1.gate === 'front' && !L1.go0 && L1.done2 === 1 && L1.un2 && L1.go && !L1.hidden, `Endless: seven sectors held (and a forged "done") still locked; holding the Launch Complex opens it (menu card: "${L1.txt}")`);
  const DONE = await p.evaluate(() => { const {Z} = __z, c = Z.cp.C(); c.res.repair = 2; c.relics = ['warchest']; c.eq = 'warchest'; Z.cp.put(c); return Z.cp.C(); });

  // ---- start from the menu button: no objective, the strip, the HUD, the briefing, the reserve left alone ----
  const before = nosc(DONE);
  await p.evaluate(() => document.getElementById('zendgo').click());
  const B0 = await begun() ? await p.evaluate(() => { const {Z, G} = __z, run = Z.cp.run; Z.hud(0); return {en: Z.endless.on(), id: run.id, endless: run.endless, obj: run.obj, res: run.res, relic: run.relic, hud: document.getElementById('zw').textContent, strip: document.querySelector('#zbase .zcpbar')?.textContent.replace(/\s+/g, ' ') || '',
    brief: document.getElementById('zbrief')?.innerText.replace(/\s+/g, ' ') || '', pr: run.pr, wave: G.wave}; }) : null;
  ok(B0 && B0.en && B0.id === 'gate' && B0.endless && B0.obj > 1e6 && B0.res === '' && B0.relic === 'warchest' && B0.hud === 'WAVE 1 NEXT ∞' && /ENDLESS/.test(B0.strip) && !/Hold \d/.test(B0.strip) && /Endless: the climb starts after wave 20/.test(B0.brief), `Endless starts from the menu on the Launch Complex: no objective, the relic stays, the reserve is left alone, HUD "${B0?.hud}", strip "${B0?.strip.slice(0, 50)}", briefing "Endless: the climb starts after wave 20"`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-endless-base.png'});

  // ---- the sector's scars carry from wave to wave, are saved at every clear and at the end ----
  const defs = async () => { await p.waitForFunction(() => __z.Z.sc.ready, {timeout: 120000});  /* helpers inside the page (they go with a reload): scars on ground where they may stand, an emptied wave, the scars as a sorted list */
    await p.evaluate(() => { const {Z, G, api} = __z, S = Z.sc, R = (a, b) => a + Math.random() * (b - a);
      window.__pos = r => { for (;;) { const x = R(-2500, 2500), z = R(-2500, 500); if (![[0, 0], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]].some(([a, b]) => S.bad(x + a, z + b, r * 1.1 + 1))) return [x, z]; } };
      window.__add = n => { S.ensure(); for (let i = 0; i < n; i++) { const [x, z] = __pos(6); S.add(0, x, z, 4 + i % 4, {fade: 1}); } };
      window.__clear = () => { G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; };
      window.__keys = () => S.recs().map(r => r[0] + ':' + r[1] + ':' + r[2]).sort(); }); };
  await defs();
  const SC = await p.evaluate(() => { const {Z, G, api} = __z, o = {}, saved = () => { const s = api.S.zcamp.sc?.gate; return s ? Z.sc.unpack(s).map(r => r[0] + ':' + r[1] + ':' + r[2]).sort() : []; };
    o.start = Z.sc.stats().craters; __z.cont(); __add(6); __clear(); __z.sim(.5); o.k1 = __keys(); o.s1 = saved(); o.st1 = G.state; __z.sim(3.5); o.base2 = G.state;
    __z.cont(); o.carry = Z.sc.stats().craters; __add(4); __clear(); __z.sim(.5); o.k2 = __keys(); o.s2 = saved(); o.others = Object.keys(api.S.zcamp.sc || {}).join(); __z.sim(3.5); return o; });
  ok(SC.start === 0 && SC.k1.length === 6 && SC.s1.join() === SC.k1.join() && SC.st1 === 'clear', `Scars: six craters made in wave 1 are saved into the sector (S.zcamp.sc.gate) when the wave is cleared (${SC.s1.length} saved)`);
  ok(SC.carry === 6 && SC.k2.length === 10 && SC.k1.every(k => SC.k2.includes(k)) && SC.s2.join() === SC.k2.join() && SC.others === 'gate', `Scars: wave 2 starts on the same ground (${SC.carry} craters), four more make ${SC.k2.length}, all ten are saved; no other sector gets any (${SC.others})`);
  const KEYS = SC.k2;

  // ---- milestones: wave 10 pays and repairs, wave 9 does not ----
  const MS = await p.evaluate(() => { const {Z, G, api} = __z, out = {}; for (const w of [9, 10]) { __z.jump(w, 3000); Z.openBase(); const s = api.SITES[0]; s.hp = Math.round(s.max * .4); const c0 = G.cash, hp0 = s.hp;
      __z.cont(); __clear(); __z.sim(.5); out[w] = {state: G.state, ms: [...G.end.ms], dc: G.cash - c0, hp: s.hp, hp0, max: s.max, zms: api.S.zend.ms}; __z.sim(3.5); } return out; });
  ok(MS[9].state === 'clear' && !MS[9].ms.length && MS[9].hp === MS[9].hp0, 'Milestone: clearing wave 9 is an ordinary clear (no milestone, no repair)');
  ok(MS[10].ms.join() === '10' && MS[10].dc >= 800 && MS[10].hp === Math.min(MS[10].max, MS[10].hp0 + Math.round(MS[10].max * .25)) && MS[10].zms === 10, `Milestone: wave 10 paid $${Math.round(MS[10].dc)} (at least the $800 purse), repaired a damaged site from ${MS[10].hp0} to ${MS[10].hp} of ${MS[10].max}, and is on the record (${MS[10].zms})`);

  // ---- the briefing of a climbing wave ----
  const BR = await p.evaluate(() => { const {Z} = __z; __z.jump(33, 1e6); Z.openBase(); const t = document.getElementById('zbrief').innerText.replace(/\s+/g, ' '); return {t, line: Z.brief.data().extra.join(' | ')}; });
  ok(/Endless \+\d+% tracks · \+\d+% speed · \d+% of the Shaheds armored · sites take \+\d+%/.test(BR.t) && /boss every 5 waves · milestone wave 40: \+\$3,200 and a repair/.test(BR.t), `Briefing in Endless at wave 33: "${BR.line}"`);
  ok(/at most 400 tracks in the air/.test(BR.t), 'Briefing in Endless: the note says how many tracks can be in the air at once (the ceiling)');

  // ---- the end: the Endless screen, the Endless table, the campaign untouched, the scars saved ----
  const GO = await p.evaluate(() => { const {Z, G, api} = __z, S = api.S; __z.jump(13, 0); Z.openBase(); G.wave = 12; Z.gameOver();
    return {st: G.state, h2: document.querySelector('#zover h2')?.textContent, txt: document.getElementById('zover').textContent.replace(/\s+/g, ' '), hidden: document.getElementById('zover').hidden, runs: S.zend.runs, zms: S.zend.ms, camp: S.zcamp, zruns: S.zruns || null, zbests: S.zbests || null,
      board: document.getElementById('zendboard').textContent.replace(/\s+/g, ' '), saved: Z.sc.unpack(S.zcamp.sc.gate).length, btns: [...document.querySelectorAll('#zover button')].map(b => b.id).join()}; });
  ok(GO.st === 'over' && !GO.hidden && GO.h2 === 'Endless run over' && /WAVE 12/.test(GO.txt) && GO.runs.length === 1 && GO.runs[0].w === 12 && GO.runs[0].sec === 'gate' && GO.runs[0].d === 1 && GO.runs[0].ms === 10 && GO.btns === 'zendagain,zcpmap,zmenu', `Endless over: "${GO.h2}", wave ${GO.runs[0]?.w}, recorded {${JSON.stringify(GO.runs[0])}}, buttons ${GO.btns}`);
  ok(/Endless, wave 12 · Launch Complex · Normal/.test(GO.txt) && /Endless, wave 12 · Launch Complex · Normal/.test(GO.board) && GO.zruns === null && GO.zbests === null, 'Leaderboard: "Endless, wave 12 · Launch Complex · Normal" is on the end screen and in the menu table; the Quick defence table and bests are untouched');
  ok(nosc(GO.camp) === before && GO.saved === 10, `Campaign: an Endless loss changes nothing (held, pressure, losses, relics, reserves, done), and the ten scars are saved at the end (${GO.saved})`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-endless-over.png'});
  // again: the same sector, the same ground
  await p.evaluate(() => document.getElementById('zendagain').click()); await begun();
  const AG = await p.evaluate(() => ({run: __z.Z.cp.run?.id, endless: __z.Z.cp.run?.endless, craters: __z.Z.sc.stats().craters, wave: __z.G.wave, hidden: document.getElementById('zover').hidden, keys: __keys()}));
  ok(AG.run === 'gate' && AG.endless && AG.wave === 0 && AG.hidden && AG.craters === 10 && AG.keys.join() === KEYS.join(), 'Endless again: a fresh run on the same sector begins on the ten scars of the last one');

  // ---- a reload keeps the scars, the table and the unlock ----
  await reload();
  const RL = await p.evaluate(() => { const S = __z.api.S, c = __z.Z.cp.C(); return {done: c.done, held: c.held.length, sc: Object.keys(c.sc).join(), runs: S.zend.runs.map(r => r.w).join(), board: document.getElementById('zendboard').textContent.replace(/\s+/g, ' '), go: document.getElementById('zendgo')?.textContent.replace(/\s+/g, ' ')}; });
  ok(RL.done === 1 && RL.sc === 'gate' && RL.runs === '12' && /Endless, wave 12/.test(RL.board) && /Launch Complex/.test(RL.go), `Reload: the unlock, the table (wave ${RL.runs}) and the sector's scars are still there; the menu button says "${RL.go}"`);
  await p.evaluate(() => document.getElementById('zendgo').click()); await begun(); await defs();
  const RS = await p.evaluate(() => ({keys: __keys(), n: __z.Z.sc.stats().craters}));
  ok(RS.n === 10 && RS.keys.join() === KEYS.join(), 'Reload: an Endless run started after it stands on the same ten craters');

  // ---- a chosen held sector, and the climb itself (River Crossing has no Mothership escort of its own) ----
  const RV = await p.evaluate(() => { const {Z, G, api, KIND} = __z, o = {no: Z.endless.start('dam'), ok: Z.endless.start('river')}; o.run = Z.cp.run?.id; o.endless = Z.cp.run?.endless; o.sec = api.S.zend.sec; o.state = G.state; return o; });
  ok(!RV.no && RV.ok && RV.run === 'river' && RV.endless && RV.sec === 'river' && RV.state === 'base', 'Endless on a chosen held sector: River Crossing starts (an unheld one, the Dam, is refused), and it is the sector the menu button remembers');
  const CL = await p.evaluate(() => { const {Z, G, api, KIND} = __z, R = Z.cp.run, o = {};
    const units = L => L.reduce((a, s) => { const [k, c] = s.split(':'); return a + (KIND[k].armor === 'boss' ? 0 : +c || 1); }, 0), pts = L => L.reduce((a, s) => { const [k, c] = s.split(':'); return a + (+c || 1) * (KIND[k].pts || 0); }, 0);
    const meas = (w, n) => { let u = 0, pp = 0, h = 0, mu = 0; for (let i = 0; i < n; i++) { const L = __z.plan(w).list, uu = units(L); u += uu; mu = Math.max(mu, uu); pp += pts(L); h += L.filter(k => k === 'heavy').length; } return {u: u / n, pts: pp / n, heavy: h / n, maxU: mu}; };
    const both = (w, n) => { R.endless = true; const e = meas(w, n); R.endless = false; const b = meas(w, n); R.endless = true; return {e, b}; };
    o.w20 = both(20, 150); o.w30 = both(30, 150); o.w40 = both(40, 150); o.w70 = both(70, 15);
    const sp = w => { G.wave = w; let s = 0; for (let i = 0; i < 40; i++) { const t = __z.make('shahed', 0, -3000); s += t.spd; api.scene.remove(t.mesh); api.TH.pop(); } return s / 40; };
    o.sp = [20, 60, 100, 140].map(sp); R.endless = false; o.spOff = sp(60); R.endless = true;
    const dk = w => { G.wave = w; return Z.dmgK(api.SITES[0], {id: -1, k: 'shahed'}); }; o.dk = [20, 40, 60].map(dk); G.wave = 0;
    const nb = w => __z.plan(w).list.filter(k => KIND[k.split(':')[0]].armor === 'boss').length; o.b = Object.fromEntries([23, 25, 30, 51, 52, 60, 80].map(w => [w, nb(w)])); R.endless = false; o.b25off = nb(25); o.b51off = nb(51); R.endless = true; return o; });
  const rat = w => CL['w' + w].e.pts / CL['w' + w].b.pts;
  ok(rat(20) > .85 && rat(20) < 1.2 && rat(30) > 1.1 && rat(40) > 1.25 && rat(40) < 1.85 && rat(40) > rat(30) * .98, `Climb, tracks: threat per wave against the same wave without the climb x${rat(20).toFixed(2)} at 20, x${rat(30).toFixed(2)} at 30 (+2.5% a wave: 1.25), x${rat(40).toFixed(2)} at 40 (1.50)`);
  ok(CL.w70.e.maxU <= 620 && CL.w70.e.u > CL.w70.b.u, `Climb, tracks: past the cap the plan stops at 600 tracks (wave 70: at most ${CL.w70.e.maxU} in one plan, ${Math.round(CL.w70.e.u)} on average against ${Math.round(CL.w70.b.u)} without the climb)`);
  ok(CL.w40.e.heavy > CL.w40.b.heavy * 1.3 && CL.w30.e.heavy > CL.w30.b.heavy, `Climb, armour: armored heavies per wave ${CL.w40.b.heavy.toFixed(1)} -> ${CL.w40.e.heavy.toFixed(1)} at wave 40 (and ${CL.w30.b.heavy.toFixed(1)} -> ${CL.w30.e.heavy.toFixed(1)} at 30)`);
  ok(CL.sp[1] / CL.sp[0] > 1.3 && CL.sp[2] > CL.sp[1] * 1.08 && Math.abs(CL.sp[3] / CL.sp[2] - 1) < .05 && CL.spOff < CL.sp[1] * .8, `Climb, speed: a Shahed flies ${CL.sp.map(v => v.toFixed(1)).join(' / ')} m/s at waves 20 / 60 / 100 / 140 (+40% at 60, capped at +60%; ${CL.spOff.toFixed(1)} at 60 without the climb)`);
  ok(CL.dk[0] === 1 && Math.abs(CL.dk[1] - 1.2) < 1e-9 && Math.abs(CL.dk[2] - 1.4) < 1e-9, `Climb, damage: a hit on a site is x${CL.dk.join(' / ')} at waves 20 / 40 / 60`);
  ok(CL.b[23] === 0 && CL.b[25] === 1 && CL.b[30] === 1 && CL.b[51] === 2 && CL.b[52] === 0 && CL.b[60] === 2 && CL.b[80] === 3 && CL.b25off === 0 && CL.b51off === 0, `Climb, bosses: ${JSON.stringify(CL.b)} (waves 23 / 25 / 30 / 51 / 52 / 60 / 80: every 5 waves past 20, every 3 past 50, two at a time from wave 50, three from 80); wave 25 without the climb has ${CL.b25off}`);
  // the radar scope writes a label (T07 12) for the 40 nearest tracks and the selected one, not for every track (every track still has its blip)
  const RD = await p.evaluate(async () => { const {Z, G, api} = __z, P = api.PADP, o = {labels: 0, paints: 0}, rc = document.getElementById('radar').getContext('2d'), c0 = rc.clearRect, f0 = rc.fillText; let k = 0;
    __z.cont(); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); api.SITES.forEach(s => s.hp = s.max);
    for (let i = 0; i < 120; i++) { const a = i * 2.399, r = 1200 + (i % 12) * 100; __z.make('shahed', P.x + Math.cos(a) * r, P.z + Math.sin(a) * r, api.SITES[i % 3]); }  /* 120 Shaheds inside the radar's reach, looked at over some real frames */
    rc.clearRect = function (...a) { o.labels = Math.max(o.labels, k); k = 0; o.paints++; return c0.apply(this, a); }; rc.fillText = function (t, ...a) { if (/^T\d+ -?\d+$/.test(t)) k++; return f0.call(this, t, ...a); };
    await new Promise(r => setTimeout(r, 900)); delete rc.clearRect; delete rc.fillText; o.n = api.TH.filter(api.live).length; G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; return o; });
  ok(RD.paints >= 2 && RD.labels >= 30 && RD.labels <= 41, `Radar: with ${RD.n} tracks on the scope a repaint writes ${RD.labels} labels (the 40 nearest and the selected one; ${RD.paints} repaints looked at)`);  /* two repaints are enough to judge the cap: a loaded CI runner draws only two or three in the 900 ms window */
  // the ceiling: no more than CAP_LIVE tracks in the air; what the plan has due past it waits in the queue (a swarm whole) and goes out as tracks die, nothing is lost; with the climb off there is no ceiling
  const CP = await p.evaluate(() => { const {Z, G, api} = __z, E = Z.endless, o = {cap: E.CAP_LIVE}, live = () => api.TH.filter(api.live).length, keep = () => api.SITES.forEach(s => s.hp = s.max);
    const clear = () => { for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; };
    const start = on => { Z.cp.run.endless = on; __z.cont(); clear(); keep(); G.wq.length = 0; const g0 = G.gid; for (let i = 0; i < 100; i++) G.wq.push({k: 'swarm:6', at: 0, brg: (i % 9 - 4) * .2}); return g0; };  /* 100 swarms of 6, all due at once */
    let g0 = start(true); __z.sim(.3); o.l1 = live(); o.q1 = G.wq.length; o.s1 = G.gid - g0; o.st1 = G.state;
    let n = 0; for (const t of api.TH) if (api.live(t) && n++ < 100) t.st = 'dead'; __z.sim(.1); o.l2 = live(); o.q2 = G.wq.length;  /* 100 tracks die: the queue goes out into the room they left */
    for (let i = 0; i < 60 && (G.wq.length || live()); i++) { for (const t of api.TH) if (api.live(t)) t.st = 'dead'; keep(); __z.sim(.1); } o.s3 = G.gid - g0; o.q3 = G.wq.length;
    g0 = start(false); __z.sim(.3); o.l4 = live(); o.q4 = G.wq.length;  /* the climb off: all 600 at once */
    Z.cp.run.endless = true; G.wq.length = 0; clear(); keep(); return o; });
  ok(CP.cap === 400 && CP.l1 > 390 && CP.l1 <= 400 && CP.q1 >= 30 && CP.s1 === 100 - CP.q1 && CP.st1 === 'wave', `Climb, ceiling: 600 drones due at once, ${CP.l1} fly (at most ${CP.cap}), ${CP.q1} swarms wait in the queue`);
  ok(CP.l2 > 390 && CP.l2 <= 400 && CP.q2 < CP.q1 && CP.q2 > 0, `Climb, ceiling: 100 tracks die and the queue fills the room (${CP.l2} in the air, ${CP.q1} -> ${CP.q2} swarms waiting)`);
  ok(CP.s3 === 100 && CP.q3 === 0, `Climb, ceiling: the whole plan goes out in the end (${CP.s3} of 100 swarms), nothing lost`);
  ok(CP.l4 === 600 && CP.q4 === 0, `Climb, ceiling: with the climb off there is no ceiling (${CP.l4} in the air)`);
  // the boss codex (zcodex.js): an Endless run's bosses come from its pool (unlocked and allowed), never from the sector's set piece; the Launch Complex's own Mothership escort does not double the boss
  const CX = await p.evaluate(() => { const {Z, G, api, KIND} = __z, S = api.S, X = Z.codex, o = {}, R0 = Z.bosses.roster;
    const bs = L => L.filter(k => { const K = KIND[k.split(':')[0]]; return K.armor === 'boss' || !!K.bossy; }), seen = (w, n) => { const m = {}; for (let i = 0; i < n; i++) for (const k of bs(__z.plan(w).list)) m[k] = (m[k] | 0) + 1; return m; };
    const dex = (ids, off = []) => ({v: 1, b: Object.fromEntries([...ids, ...off].map(id => [id, {seen: true, beaten: true, allowed: !off.includes(id)}]))});
    o.real = !!X && typeof X.pool === 'function' && typeof X.plan === 'function';
    S.zcodex = dex([]); o.p0 = X.pool(25).join(); o.m0 = Object.keys(seen(25, 20)).join(); o.m23 = Object.keys(seen(23, 20)).join();
    S.zcodex = dex(['jammer', 'hive']); o.p1 = X.pool(54); o.m1 = Object.keys(seen(54, 80)).sort(); o.dup = 0; o.n54 = new Set();  /* wave 54: two bosses a wave (climb 34) */
    for (let i = 0; i < 40; i++) { const L = bs(__z.plan(54).list); o.n54.add(L.length); if (new Set(L).size !== L.length) o.dup++; } o.n54 = [...o.n54].join();
    Z.bosses.roster = true; o.dupR = 0; for (let i = 0; i < 300; i++) { const L = bs(__z.plan(60).list); if (new Set(L).size !== L.length) o.dupR++; } Z.bosses.roster = R0;  /* wave 60 with the real rotation: it plans a boss first (a boss wave), the climb adds the second */
    S.zcodex = dex(['hive'], ['jammer']); o.p2 = X.pool(54); o.m2 = Object.keys(seen(54, 80)).sort();
    S.zcodex = dex([], ['boss', 'jammer', 'hive']); o.p3 = X.pool(25).length; const l3 = __z.plan(25).list; o.m3 = bs(l3).length; o.l3 = l3.length;  /* every boss switched off: the codex's heavy raid instead */
    S.zcodex = dex(['jammer']); Z.bosses.roster = true;  /* the real rotation, as a player has it: an Endless run is planned by the codex's Quick defence rotation, a campaign sector by its set piece (the every-10 Mothership goes) */
    o.endless10 = bs(Z.bossCompose(['boss', 'shahed'], 10)).length;
    Z.cp.start('river', true); o.camp = !Z.endless.on(); o.camp10 = bs(Z.bossCompose(['boss', 'shahed'], 10)).length;
    Z.bosses.roster = R0; delete S.zcodex; Z.endless.start('gate');
    o.g = bs(__z.plan(25).list).length; o.g2 = bs(__z.plan(30).list).length; return o; });
  ok(CX.real && CX.p0 === 'boss' && CX.m0 === 'boss' && CX.m23 === '', 'Boss codex: with nothing beaten the pool is the Mothership alone, and the extra boss of Endless wave 25 is that; wave 23 has none (' + CX.p0 + ' / ' + CX.m0 + ')');
  ok(CX.p1.includes('jammer') && CX.m1.includes('jammer') && CX.m1.every(k => CX.p1.includes(k)) && CX.m1.length >= 2 && CX.n54 === '2' && CX.dup === 0 && CX.dupR === 0, 'Boss codex: with the Jammer King and the Hive beaten, wave 54\'s two Endless bosses come from the pool (' + CX.p1 + ') and from nowhere else (' + CX.m1 + '), never the same twice in a wave');
  ok(CX.p2.length > 0 && !CX.p2.includes('jammer') && !CX.m2.includes('jammer') && CX.m2.every(k => CX.p2.includes(k)), 'Boss codex: with the Jammer King switched off (Allowed) it never comes (' + CX.m2 + ' of ' + CX.p2 + ')');
  ok(CX.p3 === 0 && CX.m3 === 0 && CX.l3 > 0, 'Boss codex: with every boss switched off Endless wave 25 brings the codex\'s heavy raid, no boss (' + CX.l3 + ' tracks)');
  ok(CX.endless10 === 1 && CX.camp && CX.camp10 === 0, 'Boss codex: an Endless run keeps its every-10 boss through the Quick defence rotation (' + CX.endless10 + '), a campaign sector\'s set piece takes the Mothership out (' + CX.camp10 + ')');
  ok(CX.g === 1 && CX.g2 === 1, 'Launch Complex Endless: its own Mothership escort is not doubled by the climb (' + CX.g + ' boss on wave 25, ' + CX.g2 + ' on 30)');
  // the Launch Complex's "Enemy launch sites": the sorties feature flag is set, so the modifier is real (not the second Heavy pressure it fell back to) and the world has the extra sites
  const LS = await p.evaluate(() => { const {Z, G} = __z, W = Z.so.W, o = {feat: Z.feat?.sorties, n: Z.cp.n('launchSites'), ids: Z.cp.run.mods.map(m => m.id).join()}, count = s => W.list.filter(t => t.t === 'launch' && t.sec === s).length;
    o.per = [0, 1, 2].map(count).join(); const two = W.list.filter(t => t.t === 'launch' && t.sec === 1), cuts = () => (G.cuts || []).filter(c => c.src === 'launch' && c.sec === 1).length; o.eff = '';
    two[0].dead = true; W.onDead(two[0], null); o.afterOne = cuts(); two[1].dead = true; W.onDead(two[1], null); o.afterBoth = cuts();
    Z.cp.openMap(); Z.cp.select('gate'); const names = [...document.querySelectorAll('#zcamp .zcpmods li b')].map(b => b.textContent); Z.cp.closeMap(); o.names = names.join(' | '); return o; });
  ok(LS.feat === 1 && LS.n === 2 && LS.ids === 'missile,tot,boss5,raid,big' && LS.per === '2,2,1' && LS.afterOne === 0 && LS.afterBoth === 1, `Enemy launch sites (Launch Complex): the sorties flag is set, the sector's modifiers are ${LS.ids} (one Heavy pressure, no fallback), launch sites per sector ${LS.per}; the first site of a doubled sector cuts nothing (${LS.afterOne}), the second does (${LS.afterBoth})`);
  ok((LS.names.match(/Heavy pressure/g) || []).length === 1 && /Enemy launch sites/.test(LS.names), `Enemy launch sites: the briefing lists it once, and Heavy pressure once ("${LS.names}")`);

  // ---- the late-game sink: past wave 40 upkeep and repairs grow with the wave, so the purse of a strong run stays bounded (up to wave 40 they cost what they always did) ----
  const SINK = await p.evaluate(() => { const {Z, G, api} = __z, E = Z.endless, o = {};
    E.start('gate'); const R = Z.cp.run, def = Z.def;
    for (let j = 0, n = 0; j < def.SLOTS.length && n < 14; j++) if (def.slotFree(j, 'rack')) { const d = def.add('rack', j); if (d) { d.spent = 20000; n++; } }  /* a full line: fourteen racks with $20,000 spent on each, as a deep run has it */
    o.defs = def.D.length; const up = w => Z.upkeep(w).total;
    o.plain = [11, 30, 40].map(w => { R.endless = true; const a = up(w); R.endless = false; const b = up(w); R.endless = true; return a === b && a > 0; });  /* up to wave 40 Endless pays exactly what any run pays */
    G.wave = 39; R.endless = true; const r1 = Z.repairK(); R.endless = false; const r2 = Z.repairK(); R.endless = true; o.repair40 = r1 === r2; G.wave = 59; o.repair60 = Z.repairK() / r2; G.wave = 0;
    o.k = [41, 50, 60, 75].map(w => +(up(w) / up(40)).toFixed(3)); o.curve = [41, 50, 60, 75].map(w => +E.sinkK(w).toFixed(3));
    const income = w => 18 * w * w;  /* about what a strong run's kills pay a wave: $45K at wave 50, $100K at 75 (the Legend bot's Endless runs) */
    const play = on => { R.endless = on; G.cash = 0; G.wave = 40; Z.openBase(); const out = {};
      for (let w = 41; w <= 90; w++) { __z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.cash += income(w); __z.sim(.5);  /* the wave's raid is down: it clears, the bonus and the upkeep are paid */
        if (G.state !== 'clear' || G.wave !== w) return {err: `wave ${w} is ${G.state} (${G.wave})`}; __z.sim(4);  /* the base screen opens */
        api.SITES.forEach((s, i) => { s.hp = Math.round(s.max * .85); Z.base.act.repair(i, s.max - s.hp); });  /* the wave's damage, repaired at the going price */
        if (w % 5 === 0) out[w] = Math.round(G.cash); }
      return out; };
    o.on = play(true); o.off = play(false); R.endless = true; return o; });
  ok(SINK.defs === 14 && SINK.plain.every(Boolean) && SINK.repair40, `Endless sink: up to wave 40 the upkeep (waves 11 / 30 / 40) and the repair price are exactly the ordinary ones (${SINK.defs} defences)`);
  ok(SINK.k.join() === SINK.curve.join() && Math.abs(SINK.k[1] - 2) < 1e-6 && Math.abs(SINK.k[2] - 5) < 1e-6 && SINK.k[0] > 1 && SINK.k[0] < 1.05 && Math.abs(SINK.repair60 - 5) < 1e-6, `Endless sink: past wave 40 the upkeep and the repairs grow on a gentle curve (x${SINK.k.join(' / x')} at waves 41 / 50 / 60 / 75; repairs x${SINK.repair60.toFixed(2)} at 60)`);
  const sOn = SINK.on, sOff = SINK.off, peak = Math.max(...Object.values(sOn || {}), 0), k$ = v => '$' + Math.round(v / 1000) + 'K';
  ok(!SINK.err && !sOff?.err && peak < 1e6 && sOn[90] < sOn[75] && sOn[90] < sOff[90] * .25 && sOff[90] > 3e6, `Endless sink: in a scripted strong run (14 racks, $20,000 each, ordinary income of 18 x wave squared, real clears and repairs) the purse peaks at ${k$(peak)} and is falling by wave 90 (${k$(sOn?.[75])} at 75, ${k$(sOn?.[90])} at 90), where the same run without the sink holds ${k$(sOff?.[75])} / ${k$(sOff?.[90])}${SINK.err ? ' ' + SINK.err : ''}`);

  // ---- a campaign sector after it is a plain campaign sector ----
  const PL = await p.evaluate(() => { const {Z, G, api, KIND} = __z; Z.cp.start('mill', true); const r = {en: Z.endless.on(), obj: Z.cp.run?.obj, hud: (Z.hud(0), document.getElementById('zw').textContent), strip: document.querySelector('#zbase .zcpbar')?.textContent || '', b: __z.plan(60).list.filter(k => KIND[k.split(':')[0]].armor === 'boss').length};
    G.wave = 59; r.dk = Z.dmgK(api.SITES[0], {id: -1, k: 'shahed'}); G.wave = 0; api.startDemo(); r.after = Z.endless.on(); return r; });
  ok(!PL.en && PL.obj === 8 && PL.hud === 'WAVE 1/8 NEXT' && /Hold 8 waves/.test(PL.strip) && PL.b === 1 && PL.dk === 1 && !PL.after, 'Old Mill afterwards is the plain campaign sector: 8 waves, no climb (one boss on wave 60, a hit counts x1), and leaving it turns Endless off');

  // ---- the bots can play it (the bench hook), and it is off by default ----
  const BH = (await import('node:fs')).readFileSync(new URL('./zombies-bench.mjs', import.meta.url), 'utf8');
  ok(/'--endless'/.test(BH) && /!ENDLESS/.test(BH) && /Z\.endless\.start\(id\)/.test(BH) && /ENDLESS \? campDone/.test(BH), 'Bench hook: tools/zombies-bench.mjs --endless [sector] plays Endless on a finished campaign, never writes zbench.json, and is off unless asked for');

  // ---- nothing leaks: restarts, redraws and the menu button add no objects, nodes, listeners or wrappers ----
  await defs();
  const LK = await p.evaluate(() => { const {Z, G, api} = __z, m = () => { const i = api.renderer.info.memory; return [i.geometries, i.textures, api.renderer.info.programs.length].join(); }, o = {}, hooks = () => [Z.cpCompose, Z.en.dress, Z.dmgK, Z.upkeep, Z.repairK, Z.step, Z.cpOver, Z.cpHTML, Z.waveTxt, Z.syncMode, Z.continue];
    Z.endless.start('gate'); __z.cont(); __add(3); __clear(); __z.sim(.5); __z.sim(3.5); const fns = hooks(); o.m0 = m();
    for (let i = 0; i < 4; i++) { Z.endless.start(i % 2 ? 'gate' : 'river'); __z.cont(); __add(3); __clear(); __z.sim(.5); __z.sim(3.5); } for (let i = 0; i < 20; i++) Z.syncMode();
    o.same = hooks().every((f, i) => f === fns[i]); o.m1 = m(); o.th = api.TH.length; api.startDemo(); o.boards = document.querySelectorAll('#zendboard').length; o.btns = document.querySelectorAll('#zendgo').length;
    let n = 0; const sm = api.startMatch; api.startMatch = () => { n++; return sm(); }; document.getElementById('zendgo').click(); api.startMatch = sm; o.starts = n; o.run = Z.cp.run?.endless; return o; });
  ok(LK.same && LK.boards === 1 && LK.btns === 1 && LK.starts === 1 && LK.run, `Leaks: the hooks are wrapped once, the menu has one Endless table and one button after 20 redraws, and one click starts one run (${LK.starts})`);
  ok(LK.m0 === LK.m1 && LK.th === 0, `Leaks: five Endless starts, wave clears and quits add no GPU geometries, textures or programs (${LK.m0} -> ${LK.m1}) and leave no tracks behind (${LK.th})`);

  // ---- corrupt Endless records: every one loads, shows the table and plays ----
  const bad = [];
  for (const junk of ['x', 7, {v: 1, runs: [{d: 9, w: -1}, {d: 1, w: 5, sec: '__proto__'}, null, 3, {d: 1, w: 7, sec: 'gate', ms: 'a', t: 'b'}], ms: 'a', sec: 'nope'}]) {
    const n0 = errs.length; await boot(DONE, junk);
    const r = await p.evaluate(() => { try { const Z = __z.Z, e = Z.endless.state(); const b = document.getElementById('zendboard').textContent; const st = Z.endless.start('gate'); if (__z.G.on) { __z.cont(); __z.sim(2); } return {e, st, b}; } catch (e) { return {err: String(e)}; } });
    if (errs.length > n0 || !r || r.err || !r.st || r.e.v !== 1 || !Array.isArray(r.e.runs) || r.e.runs.length > 10 || !r.e.runs.every(x => Number.isInteger(x.w) && x.w > 0 && x.d >= 0 && x.d < 4 && typeof x.sec === 'string')) bad.push(JSON.stringify(junk).slice(0, 80) + ' ' + (r?.err || ''));
  }
  ok(!bad.length, 'Corrupt Endless records: every one loads, the menu shows the table and a run plays' + (bad.length ? '\n  ' + bad.join('\n  ') + '\n  ' + errs.slice(0, 3).join('\n  ') : ''));
  const fz = await p.evaluate(() => { const {Z} = __z, E = Z.endless, ids = ['gate', 'mill', 'x', '', null, 3, 'toString', '__proto__'], fv = () => { const a = [...ids, 1, 4, -1, 0, 1.5, 1e9, true, {}, [], 'a']; return Math.random() < .1 ? undefined : a[Math.random() * a.length | 0]; },
      pv = () => { const r = Math.random(); return r < .5 ? fv() : r < .85 ? Array.from({length: Math.random() * 14 | 0}, () => Math.random() < .1 ? fv() : ({d: fv(), w: fv(), sec: fv(), ms: fv(), t: fv()})) : undefined; };
    let badN = 0; for (let i = 0; i < 400; i++) { const j = {v: Math.random() < .85 ? 1 : pv(), runs: pv(), ms: pv(), sec: pv()}; try { const c = E.cleanEnd(j);
        const okc = c.v === 1 && c.runs.length <= 10 && c.runs.every((r, k) => Number.isInteger(r.d) && r.d >= 0 && r.d < 4 && Number.isInteger(r.w) && r.w >= 1 && r.w <= 9999 && ids.includes(r.sec) && r.sec && Number.isInteger(r.ms) && (!k || c.runs[k - 1].w >= r.w)) && Number.isInteger(c.ms) && typeof c.sec === 'string' && c.sec;
        if (!okc) badN++; } catch (e) { badN++; } } return badN; });
  ok(fz === 0, `Endless validator: 400 random records all clean to a well-formed one (${fz} bad)`);
  ok(!errs.length, 'Endless: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.evaluate(() => localStorage.removeItem('dl-interceptor'));
  await p.close();
}

// ---------- Little Buddy (zbuddy.js, zbuddata.js, zbudmodel.js): your Drone League garage quad flies in Zombies as a free helper. The data first (parts -> stats,
// reading the League's save), then the game: absent without a save, present from every wave start with one, its stats follow the parts, it picks its
// jobs, recharges on the pad, stays down after a crash until the next wave, never pushes the kill share over its cap or finishes a boss, leaves nothing behind ----------
if (want('buddy')) {
  // -- the data (no browser): the League's own part lists against the table, the stats, reading the save --
  const SRC = fs.readFileSync(new URL('../src/config/settings.js', import.meta.url), 'utf8'), vs = [...SRC.matchAll(/\{v:(\d+),run/g)].map(m => +m[1]);
  ok(LEAGUE.key === 'droneleague' && LEAGUE.v === vs.at(-1) && SRC.includes("localStorage.getItem('droneleague')"), `Buddy data: reads the League's key (${LEAGUE.key}) at its settings version (${LEAGUE.v}, the League's last migration is ${vs.at(-1)})`);
  const LISTS = {arms: ARMS, chassis: CHASSIS, power: POWER, attach: ATTACH}, missing = [], stale = [], misnamed = [];
  for (const s of SLOT_KEYS) { for (const x of LISTS[s]) { const r = PARTS[s][x.id]; if (!r) missing.push(s + '/' + x.id); else if (r.n !== x.name) misnamed.push(`${s}/${x.id} "${r.n}" != "${x.name}"`); }
    for (const id of Object.keys(PARTS[s])) if (!LISTS[s].some(x => x.id === id)) stale.push(s + '/' + id); }
  ok(!stale.length && !misnamed.length, `Buddy data: every row of the part table is a League part with its League name${stale.length ? ' (stale: ' + stale + ')' : ''}${misnamed.length ? ' (names: ' + misnamed + ')' : ''}`);
  if (missing.length) console.log('  note: League parts with no Little Buddy row yet (they count as stock): ' + missing.join(', '));
  const S0 = statsOf(STOCK_IDS), st = (a, c, p, t = 'none') => statsOf([a, c, p, t]), same = (s, ks) => ks.every(k => s[k] === S0[k]);
  ok(['spd', 'acc', 'end', 'tuf', 'agi'].every(k => S0[k] === BASE[k]), `Buddy stats: the stock quad is the base numbers (${Object.entries(BASE).map(([k, v]) => k + ' ' + v).join(', ')})`);
  ok(st('stock', 'stock', 'hikv').spd > S0.spd && st('stock', 'stock', 'hikv').end < S0.end && st('stock', 'stock', 'punch').acc > S0.acc && st('stock', 'stock', 'eff').end > S0.end && st('stock', 'stock', 'lr').end > 1.5 * S0.end,
    'Buddy stats: motors set speed and accel, the pack sets charge (High-KV faster, Race Punch quicker, Efficient and Long-Range last longer)');
  ok(st('stock', 'brick', 'stock').tuf > S0.tuf && st('stock', 'slim', 'stock').tuf < S0.tuf && st('stock', 'stock', 'stock', 'armor').tuf > S0.tuf && st('truex', 'stock', 'stock').agi > S0.agi && st('deadcat', 'stock', 'stock').agi < S0.agi,
    'Buddy stats: the frame and attachment set toughness (Brick, Armor up; Slim down), the props set agility (True-X up; Dead-Cat down)');
  ok(ARMS.every(a => same(st(a.id, 'stock', 'stock'), ['spd', 'acc', 'end', 'tuf'])) && CHASSIS.every(c => same(st('stock', c.id, 'stock'), ['spd', 'acc', 'end', 'agi'])) && POWER.every(p => same(st('stock', 'stock', p.id), ['tuf', 'agi'])),
    'Buddy stats: each part only moves its own numbers (arms: agility; chassis: toughness; power: speed, accel and charge)');
  const ex = statsOf(['squash', 'brick', 'lr', 'armor']), ex2 = statsOf(['deadcat', 'slim', 'punch', 'ducts']);
  ok(ex.tuf <= 1.7 * BASE.tuf && ex2.end >= .6 * BASE.end && [ex, ex2].every(s => ['spd', 'acc', 'end', 'tuf', 'agi'].every(k => s[k] >= .6 * BASE[k] && s[k] <= 1.7 * BASE[k])), 'Buddy stats: any build stays within x0.6 .. x1.7 of the base');
  { const u = statsOf(['zz', 'zz', 'zz', 'zz']); ok(['spd', 'acc', 'end', 'tuf', 'agi'].every(k => u[k] === S0[k]), 'Buddy stats: a part the table does not know counts as stock'); }
  { const t = tipOf(['truex', 'brick', 'hikv', 'ram'], statsOf(['truex', 'brick', 'hikv', 'ram']));
    ok(/Motors \(High-KV\)/.test(t) && /Pack \(High-KV\)/.test(t) && /Frame \(Brick \+ Ram Bumper\)/.test(t) && /Props \(True-X Freestyle\)/.test(t), `Buddy tooltip: names the part behind each number (${t.split('\n').length} lines)`); }
  const rg = o => readGarage(k => k === 'droneleague' ? (typeof o === 'string' ? o : JSON.stringify(o)) : null), none = readGarage(() => null), thrower = readGarage(() => { throw new Error('no storage'); });
  ok(!none.has && none.ids.join() === STOCK_IDS.join() && !thrower.has && !rg('{oops').has && !rg('[1]').has && !rg({mode: 'acro', fov: 110}).has && !rg({loadout: 'x'}).has && !rg({loadout: ['Stock!', 'stock', 'stock']}).has && !rg({loadout: [1, 2, 3]}).has,
    'Buddy garage: no save, no storage, a League key without a loadout, junk and bad ids all read as "no garage" with the stock quad');
  { const a = rg({loadout: ['truex', 'brick', 'hikv'], physV: 5}), b = rg({loadout: ['truex', 'brick', 'hikv', 'ram'], physV: 5, cos: {paint: 'cobalt', bell: 'x y', led: 'cyan'}}), c = rg({loadout: ['stock', 'stock', 'stock', 'none'], physV: 99, cos: {paint: 'gold'}});
    ok(a.has && a.ids.join() === 'truex,brick,hikv,none' && b.has && b.cos.join() === 'cobalt,,,,cyan,' && c.has && c.cos === null && cleanIds(['a', 'b']) === null && cleanCos('x') === null,
      'Buddy garage: a pre-attachment save (3 ids) gets none, cosmetics are cleaned id by id, a save from a newer League keeps its parts but not its cosmetics'); }

  // -- the game --
  const ZB = {loadout: ['truex', 'brick', 'hikv', 'ram'], cos: {paint: 'cobalt', props: 'ice', bell: 'gold', led: 'cyan'}, physV: 5};
  async function bpage(save) {
    const errs = [], p = await open(browser, origin + '/games/interceptor/', errs);
    await p.evaluate(s => { sessionStorage.setItem('zbossRoster', '0'); localStorage.setItem('dl-interceptor', JSON.stringify({wx: 'clear', zwx: 'menu'})); if (s) localStorage.setItem('droneleague', JSON.stringify(s)); else localStorage.removeItem('droneleague'); }, save);
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 5);
    await play(p);
    // a scripted arena: the wave kept open by a spawn that never comes, tracks that hover, the pilot held where it is told (v = 0 on the ground at the pad)
    await p.evaluate(() => { const {api, G, Z} = __z; window.__bd = {pin: null,
      clear() { for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); this.pin = {p: new api.THREE.Vector3(0, api.gh(0, 1000) + 1, 1000), v: new api.THREE.Vector3()}; },
      hold(k, x, y, z, spd = .5, site) { const t = __z.make(k, x, z, site); t.p.set(x, y, z); t.alt = y - api.gh(x, z); t.v.set(0, 0, 0); t.spd = t.cs = spd; t.wps.length = 0; return t; },
      up(x = 0, z = 1250, h = 60) { const b = Z.bd.mine; b.state = 'fly'; b.p.set(x, api.gh(x, z) + h, z); b.v.set(0, 0, 0); b.hp = b.st.tuf; b.chg = b.st.end; b.tgt = b.skip = null; b.job = 'perch'; b.jt = 1e9; b.low = false; api.interp.cut(b); return b; },
      sample(n = 60) { const b = Z.bd.mine, c = {}; for (let i = 0; i < n; i++) { b.job = 'perch'; b.tgt = null; b.state = 'fly'; Z.bd.think(b, b.src()); c[b.job] = (c[b.job] | 0) + 1; } b.job = 'perch'; b.tgt = null; return c; },
      run(sec, f) { const out = []; for (let i = 0; i < sec; i++) { __z.sim(1); out.push(f ? f(i) : null); } return out; } };
      const s0 = Z.step; Z.step = dt => { s0(dt); const me = api.player, P = __bd.pin; if (P && me && me.dead <= 0) { me.p.copy(P.p); me.v.copy(P.v); me.w.set(0, 0, 0); } }; });
    return {p, errs};
  }
  const start = p => p.evaluate(() => { __z.cont(); __bd.clear(); __z.sim(.1); return __z.G.state; });

  // no League save: no buddy
  { const {p, errs} = await bpage(null);
    const r = await p.evaluate(() => { const {G, Z} = __z, bd = Z.bd; const g0 = bd.garage(); __z.cont(); __bd.clear(); __z.sim(20); const o = {has: g0.has, st: bd.mine.state, fx: bd.fx(), card: document.getElementById('zbd').hidden, row: document.querySelectorAll('.zbdr').length, wave: G.wave};
      localStorage.setItem('droneleague', JSON.stringify({mode: 'acro', fov: 110})); o.keyOnly = bd.read().has; return o; });
    ok(!r.has && r.st === 'off' && r.fx.models === 0 && r.fx.vis === 0 && r.card && !r.row && !r.keyOnly, `Buddy, no garage: no buddy in wave ${r.wave} (state ${r.st}, ${r.fx.models} models, card hidden, no base row); a League key without a loadout is no garage either`);
    ok(!errs.length, 'Buddy, no garage: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : '')); await p.close(); }

  // with a garage
  const {p, errs} = await bpage(ZB);
  await p.waitForFunction(() => __z.Z.bd.mine.model, {timeout: 30000}).catch(() => {});
  { const r = await p.evaluate(() => { const bd = __z.Z.bd, b = bd.mine; return {has: bd.garage().has, kind: b.model?.kind, tag: b.tag?.userData.text, st: b.st, ids: b.ids, tip: b.tip, row: document.querySelector('.zbdr')?.title || ''}; });
    const want = statsOf(ZB.loadout);
    ok(r.has && r.kind === 'parts' && r.tag === 'Little Buddy', `Buddy: a League save is read, the model is built from its parts by the League's own builder (${r.kind}), name tag "${r.tag}"`);
    ok(['spd', 'acc', 'end', 'tuf', 'agi'].every(k => Math.abs(r.st[k] - want[k]) < 1e-9) && r.ids.join() === ZB.loadout.join(), `Buddy: its numbers follow the garage parts (speed ${Math.round(r.st.spd)} m/s, accel ${Math.round(r.st.acc)}, charge ${Math.round(r.st.end)} s, hp ${Math.round(r.st.tuf)}, agility ${Math.round(r.st.agi)})`);
    ok(/Motors/.test(r.tip) && /Pack/.test(r.tip) && /Frame/.test(r.tip) && /Props/.test(r.tip) && /Motors/.test(r.row), 'Buddy: the tooltip (HUD card and the base screen\'s row) shows which part drives which number'); }
  // wave start: on the pad, charged, with the HUD card
  { const r = await p.evaluate(() => { const {G, Z} = __z, b = Z.bd.mine; __z.cont(); __bd.clear(); __z.sim(.1); const c = document.getElementById('zbd');
      return {state: b.state, job: b.job, hp: b.hp / b.st.tuf, chg: b.chg / b.st.end, card: !c.hidden, text: c.textContent, title: c.title, fx: Z.bd.fx(), pos: b.p.toArray()}; });
    ok(r.state === 'pad' && r.hp === 1 && r.chg === 1 && r.card && /LITTLE BUDDY/.test(r.text) && /Motors/.test(r.title), `Buddy: at the wave start it is on the radar pad, full charge and health; the HUD card is up ("${r.text.replace(/\s+/g, ' ').slice(0, 60)}")`);
    ok(r.fx.models === 1 && r.fx.vis === 1, 'Buddy: its model is shown while the wave runs'); }
  { const out = [];  /* the HUD card stays off the top bar and the FPS meter and the radar, short window or tall */
    for (const [w, h] of [[1280, 720], [900, 420], [1280, 720]]) {
      await p.setViewport({width: w, height: h}); await frames(p, 3);
      out.push(await p.evaluate(() => { const r = e => e.getBoundingClientRect(), zt = document.querySelector('#zhud .zt'), pad = document.createElement('span');
        pad.style.cssText = 'padding:0;width:' + Math.max(0, 772 - r(zt).width) + 'px'; zt.append(pad);  /* the bar as a flying pilot has it: weapon, battery and range readouts included, about 770 px */
        const c = r(document.getElementById('zbd')), hit = [...document.querySelectorAll('#zhud .zt,#zsites,#fpsm,#radw,#feed')].filter(e => { const b = r(e); return b.width && c.left < b.right && b.left < c.right && c.top < b.bottom && b.top < c.bottom; }).map(e => e.id || e.className); pad.remove();
        return {vp: innerWidth + 'x' + innerHeight, hit, shown: !document.getElementById('zbd').hidden, inside: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight}; }));
    }
    ok(out.every(r => r.shown && r.inside && !r.hit.length), `Buddy: the HUD card overlaps no top bar, FPS meter, radar or feed at 1280x720 and 900x420 (${out.map(r => r.vp + (r.hit.length ? ' hits ' + r.hit : r.inside ? ' ok' : ' off screen')).join(', ')})`); }
  // no tracks and the pilot on the ground: it waits on the pad
  { const r = await p.evaluate(() => { const b = __z.Z.bd.mine; const c0 = b.chg; __bd.run(15); return {state: b.state, chg: b.chg - c0, job: b.job, s: __bd.sample(40)}; });
    ok(r.state === 'pad' && r.job === 'perch' && r.s.perch >= 38, `Buddy, nothing inbound: it perches on the pad and uses no charge (${JSON.stringify(r.s)})`); }
  // job choice: what it picks in each situation (60 looks at the same scene; the weights are 5 perch, 6.4 harass, ~3.8-5 bump, 3.5 spot, 2.9 herd, 9 recharge)
  const jobs = await p.evaluate(() => { const {api, Z} = __z, b = Z.bd.mine, gh = api.gh, out = {}, S = (name, build, post) => { __bd.clear(); build(); __bd.up(); if (post) post(); out[name] = __bd.sample(60); };
    S('bump', () => { for (let i = 0; i < 6; i++) __bd.hold('decoy', 150 + i * 40, gh(0, 1450) + 60, 1450); });
    S('spot', () => { const a = __bd.hold('heavy', 600, gh(600, 1700) + 150, 1700), c = __bd.hold('heavy', 700, gh(700, 1700) + 150, 1700); api.pickT = a; });
    S('harass', () => { const t = __bd.hold('boss', 500, gh(500, 1300) + 300, 1300); });
    S('herd', () => { __bd.hold('heavy', 1500, gh(1500, 400) + 200, 400, 60); });
    S('hidden', () => { __bd.hold('hush', 500, gh(500, 1300) + 300, 1300); });  /* a boss the pilot cannot see: the buddy must not circle it, its blip and its marks would give it away */
    S('recharge', () => { __bd.hold('decoy', 200, gh(200, 1450) + 60, 1450); }, () => { b.chg = 4; });
    __bd.clear(); api.pickT = null; return out; });
  console.log('  buddy job choice (60 looks each):', Object.entries(jobs).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join('  '));
  ok(!jobs.hidden.harass && jobs.hidden.perch >= 50, `Buddy: it leaves a boss the pilot cannot see alone (the Hush: ${JSON.stringify(jobs.hidden)})`);
  ok(jobs.bump.bump >= 50 && jobs.spot.spot >= 45 && jobs.harass.harass >= 50 && jobs.herd.herd >= 45 && jobs.recharge.recharge >= 55, 'Buddy: it picks its own job from what is going on: bump for small drones, spot the selected track, harass a boss, herd a straggler, recharge when low');
  // bump: it rams hovering decoys, loses health, slows them (and restores them), and with no kills yet in the run it is not allowed one
  { const r = await p.evaluate(() => { const {api, G, Z} = __z, gh = api.gh, b = Z.bd.mine; __bd.clear(); const D = []; for (let i = 0; i < 8; i++) D.push(__bd.hold('decoy', -160 + i * 45, gh(0, 1450) + 50 + (i % 3) * 8, 1450)); __bd.up(); Z.bd.think(b, b.src()); const j0 = b.job;
      let slowed = 0, hit = 0; for (let i = 0; i < 40 && b.bumps < 3; i++) { __z.sim(1); if (D.some(t => t.bdSl > 0)) slowed++; if (b.bumps) hit++; }
      const o = {j0, bumps: b.bumps, hp: b.hp / b.st.tuf, slowed, kills: b.kills, gk: {...G.kills}, slows: Z.bd.fx().slows, spd0: D.map(t => t.spd.toFixed(2))};
      b.job = 'perch'; b.state = 'pad'; b.jt = 1e9; __bd.run(12); o.after = {slows: Z.bd.fx().slows, spd: D.map(t => +t.spd.toFixed(2))}; return o; });
    ok(r.j0 === 'bump' && r.bumps >= 1 && r.hp < 1 && r.slowed > 0, `Buddy bump: it went for the decoys (${r.bumps} bumps, health ${(100 * r.hp).toFixed(0)}%), and a bumped drone is slowed`);
    ok(r.kills === 0 && r.gk.h === 0 && r.gk.p === 0, 'Buddy bump: no kills yet in the run, so none for the buddy (a kill needs room under the share cap)');
    ok(r.after.slows === 0 && r.after.spd.every(s => s === .5), `Buddy bump: slowed drones get their speed back (${r.after.spd.join(' ')})`); }
  // the kill share: with the run's kills at 40, 7% leaves room for 2; the dice are loaded, so it kills whenever it may
  { const r = await p.evaluate(() => { const {api, G, Z} = __z, gh = api.gh, b = Z.bd.mine; const m = Math.random; Math.random = () => .01;
      try { __bd.clear(); G.kills.p = 40; G.kills.h = 0; const bk0 = Z.bd.kills; for (let i = 0; i < 40; i++) __bd.hold('swarm', -150 + i * 8, gh(0, 1450) + 40 + (i % 4) * 5, 1450 + (i % 3) * 10); __bd.up(); b.wk = 0; Z.bd.think(b, b.src()); for (let i = 0; i < 50; i++) { b.jt = 0; __z.sim(1); }
        const o = {k40: Z.bd.kills - bk0, tot: G.kills.p + G.kills.h, wk: b.wk, left: api.TH.filter(api.live).length};
        G.kills.p = 600; b.hp = b.st.tuf; for (let i = 0; i < 40; i++) __bd.hold('swarm', -150 + i * 8, gh(0, 1450) + 40 + (i % 4) * 5, 1450 + (i % 3) * 10); b.job = 'perch'; for (let i = 0; i < 60; i++) { b.jt = 0; __z.sim(1); } o.k600 = Z.bd.kills - bk0; o.tot2 = G.kills.p + G.kills.h; o.wk2 = b.wk; o.share = Z.bd.kills / o.tot2; return o; } finally { Math.random = m; } });
    console.log('  buddy kill share:', JSON.stringify(r));
    let room = 0, tot = 40; while (room + 1 <= BK.cap * (tot + 1) && room < BK.waveMax) { room++; tot++; }
    ok(r.k40 === room && r.k40 / r.tot <= BK.cap, `Buddy kill share: with 40 kills in the run and ${Math.round(100 * BK.cap)}% it may take ${room}: it took ${r.k40} (${(100 * r.k40 / r.tot).toFixed(1)}% of ${r.tot})`);
    ok(r.wk2 === BK.waveMax && r.k600 - r.k40 >= 1 && r.share <= BK.cap, `Buddy kill share: plenty of room in the run, but a wave caps it at ${BK.waveMax} (${r.wk2} this wave, ${r.k600} in the run, ${(100 * r.share).toFixed(1)}% of all kills)`); }
  // spot: the track you have selected gets marked, and a marked track locks in less time
  { const r = await p.evaluate(() => { const {api, Z} = __z, gh = api.gh, b = Z.bd.mine; __bd.clear(); const a = __bd.hold('heavy', 300, gh(300, 1500) + 120, 1500), c = __bd.hold('heavy', 380, gh(380, 1500) + 120, 1500); api.pickT = a; __bd.up(); b.chg = b.st.end;
      let marked = 0, jam = 1, seen = ''; for (let i = 0; i < 30; i++) { b.jt = 0; __z.sim(1); if (b.job === 'spot') seen = 'spot'; if (a.bdSp > 0) { marked++; jam = Z.lockJam(a); } }
      const o = {seen, marked, jam, other: Z.lockJam(c)}; api.pickT = null; __bd.clear(); b.job = 'perch'; b.tgt = null; b.jt = 1e9; __bd.run(4); o.after = {sp: a.bdSp | 0, spots: Z.bd.fx().spots}; return o; });
    ok(r.seen === 'spot' && r.marked > 0 && r.jam < 1 && r.other === 1, `Buddy spot: it hangs by the selected track (marked in ${r.marked} of 30 s) and the lock-on time there is x${r.jam}; an unmarked track keeps x${r.other}`);
    ok(r.after.sp === 0 && r.after.spots === 0, 'Buddy spot: the mark fades once it stops'); }
  // harass: a boss is circled and marked for the helpers, never damaged: the Mothership on its last stage is still there afterwards
  { const r = await p.evaluate(() => { const {api, G, Z} = __z, gh = api.gh, b = Z.bd.mine; __bd.clear(); const t = __bd.hold('boss', 400, gh(400, 1250) + 220, 1250, 1); t.stages = 1; __bd.up(); b.chg = b.st.end; b.hp = b.st.tuf;
      const gk = {...G.kills}, bk0 = Z.bd.kills; let marked = 0, harass = 0, minD = 1e9; for (let i = 0; i < 40; i++) { b.jt = 0; __z.sim(1); if (b.job === 'harass') harass++; if (t.mark > 0) marked++; minD = Math.min(minD, b.p.distanceTo(t.p)); if (!api.live(t)) break; }
      return {alive: api.live(t), stages: t.stages, harass, marked, minD: Math.round(minD), bk: Z.bd.kills - bk0, gk0: gk, gk: {...G.kills}, hp: b.hp / b.st.tuf}; });
    ok(r.alive && r.stages === 1 && r.bk === 0 && r.gk.p === r.gk0.p && r.gk.h === r.gk0.h, `Buddy harass: the Mothership on its last stage is still flying after 40 s with the buddy at it (stages ${r.stages}, buddy kills ${r.bk})`);
    ok(r.harass >= 25 && r.marked > 0 && r.minD < 120, `Buddy harass: it circled the boss (${r.harass} of 40 s on the job, closest ${r.minD} m) and marked it for the helpers (${r.marked} s)`); }
  // herd: a lone heavy is slowed and nudged, then restored
  { const r = await p.evaluate(() => { const {api, G, Z} = __z, gh = api.gh, b = Z.bd.mine; __bd.clear(); const t = __bd.hold('heavy', 1000, gh(1000, 700) + 150, 700, 25, api.SITES[1]); __bd.pin.p.set(-3000, gh(-3000, 2500) + 1, 2500); __bd.up();  /* the pilot far off: the track is not the one it is spotting */ b.chg = b.st.end; const v0 = t.spd; let slowed = 0, spd = v0, job = '';
      for (let i = 0; i < 80 && api.live(t); i++) { b.jt = 0; __z.sim(1); if (b.job === 'herd') job = 'herd'; if (t.bdSl > 0) { slowed++; spd = Math.min(spd, t.spd); } if (slowed >= 3) break; }
      b.job = 'perch'; b.tgt = null; b.state = 'pad'; b.jt = 1e9; __bd.run(10); return {job, slowed, v0, spd, after: t.spd, slows: Z.bd.fx().slows, bdSl: t.bdSl | 0}; });
    ok(r.job === 'herd' && r.slowed > 0 && r.spd < r.v0 * .8, `Buddy herd: a lone heavy was pushed (${r.v0} -> ${r.spd.toFixed(1)} m/s while slowed)`);
    ok(r.after > r.spd * 1.2 && r.slows === 0 && r.bdSl === 0, `Buddy herd: its speed comes back afterwards (${r.spd.toFixed(1)} -> ${r.after.toFixed(1)} m/s)`); }
  // recharge: out on a far errand with a low charge it flies home, lands on the pad, charges, then goes back to work
  { const r = await p.evaluate(() => { const {api, G, Z} = __z, gh = api.gh, b = Z.bd.mine; __bd.clear(); for (let i = 0; i < 8; i++) __bd.hold('decoy', 1500 + i * 30, gh(1500, 1500) + 60, 1500); __bd.up(1500, 1450, 60); b.chg = b.st.end * .6; b.low = false; Z.bd.think(b, b.src());
      const o = {j0: b.job}; let t = 0; for (; t < 90 && b.state !== 'pad'; t++) __z.sim(1); o.landed = b.state === 'pad'; o.tLand = t; o.chgLand = b.chg / b.st.end; o.dist = Math.hypot(b.p.x - api.PADP.x, b.p.z - api.PADP.z);
      o.maxc = 0; for (let i = 0; i < 30 && b.state === 'pad'; i++) { b.jt = 0; __z.sim(1); o.maxc = Math.max(o.maxc, b.chg / b.st.end); } o.again = b.state + '/' + b.job; return o; });
    ok(r.j0 === 'recharge' && r.landed && r.dist < 30 && r.chgLand > 0, `Buddy recharge: low on charge it went home and landed on the pad in ${r.tLand} s (${(100 * r.chgLand).toFixed(0)}% left)`);
    ok(r.maxc >= .85 && /^fly\//.test(r.again), `Buddy recharge: charged on the pad (${(100 * r.maxc).toFixed(0)}% when it took off), then back to work (${r.again})`); }
  // a crash keeps it down until the next wave (a flat battery too), then it is back, charged and mended
  { const r = await p.evaluate(() => { const {api, G, Z} = __z, b = Z.bd.mine; __bd.clear(); __bd.hold('decoy', 200, api.gh(200, 1450) + 60, 1450); __bd.up(); b.hp = 0; __z.sim(1); const o = {st1: b.state, job: b.job}; __bd.run(20); o.st2 = b.state; o.vis = Z.bd.fx().vis; o.card = document.getElementById('zbd').textContent;
      b.state = 'fly'; b.hp = b.st.tuf; b.chg = .05; b.v.set(0, 0, 0); b.p.set(0, api.gh(0, 1250) + 80, 1250); b.jt = 1e9; b.job = 'escort'; b.tgt = null; __z.sim(1); o.flat = b.state; return o; });
    ok(r.st1 === 'down' && r.job === 'down' && r.st2 === 'down' && r.vis === 0 && /down until the next wave/.test(r.card), `Buddy crash: health gone, it falls and stays down for the rest of the wave (card: "${r.card.replace(/\s+/g, ' ').slice(-30)}")`);
    ok(r.flat === 'down', 'Buddy crash: a flat battery in the air brings it down too');
    const w = await p.evaluate(() => { const {api, G, Z} = __z, b = Z.bd.mine, w0 = G.wave; __bd.clear(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; let n = 0; while (G.state !== 'base' && n++ < 60) __z.sim(1);
      const o = {base: G.state, off: b.state, fx: Z.bd.fx(), scene: api.scene.children.length, mem: [api.renderer.info.memory.geometries, api.renderer.info.memory.textures]}; __z.cont(); __z.sim(.2); o.next = {wave: G.wave - w0, st: b.state, hp: b.hp / b.st.tuf, chg: b.chg / b.st.end, job: b.job}; return o; });
    ok(w.base === 'base' && w.off === 'off' && w.next.wave === 1 && w.next.st === 'pad' && w.next.hp === 1 && w.next.chg === 1, `Buddy respawn: the wave ends, the next wave starts and it is back on the pad at full health and charge (${JSON.stringify(w.next)})`);
    // nothing left behind at the wave end: no visible model or tag, no marks, no slowed tracks, no new objects in the scene or on the GPU wave after wave
    const seen = [];
    for (let k = 0; k < 3; k++) {
      const q = await p.evaluate(() => { const {api, G, Z} = __z, gh = api.gh, b = Z.bd.mine; __bd.clear(); const h = __bd.hold('heavy', 300, gh(300, 1500) + 100, 1500), d = []; for (let i = 0; i < 4; i++) d.push(__bd.hold('decoy', 100 + i * 30, gh(100, 1450) + 50, 1450)); api.pickT = h; __bd.up();
        for (let i = 0; i < 30; i++) { b.jt = 0; __z.sim(1); } const mid = Z.bd.fx(); api.pickT = null; G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; let n = 0; while (G.state !== 'base' && n++ < 60) __z.sim(1);
        const o = {mid, end: Z.bd.fx(), scene: api.scene.children.length, mem: [api.renderer.info.memory.geometries, api.renderer.info.memory.textures], bumps: b.bumps}; __z.cont(); __z.sim(.2); return o; });
      seen.push(q); }
    const e = seen.map(q => q.end), near = (a, b, n) => Math.abs(a - b) <= n, same2 = seen[1].scene === seen[2].scene && near(seen[1].mem[0], seen[2].mem[0], 2) && near(seen[1].mem[1], seen[2].mem[1], 2);  /* waves 2 and 3 only: the first wave still uploads what it draws for the first time (the renderer counts a geometry on its first draw); past that the game itself uploads a geometry or a texture now and then and frees one a frame later (the idle warm-up, a label's canvas), so the counts wobble by one or two, while a buddy leak adds objects every wave */
    ok(e.every(x => x.vis === 0 && x.tags === 0 && x.spots === 0 && x.slows === 0 && x.marked === 0) && seen.every(q => q.mid.marked > 0 || q.mid.vis >= 1), `Buddy wave end: no visible model or tag, no marked or slowed track left behind (mid-wave it had ${seen.map(q => q.mid.marked).join('/')} marked)`);
    ok(same2, `Buddy wave end: no new objects in the scene (${seen.map(q => q.scene).join('/')}) or on the GPU (geometries/textures ${seen.map(q => q.mem.join('/')).join(' | ')}) from wave to wave`); }
  // the base screen: a row with the same tooltip on the Shop tab
  { await p.evaluate(() => { const {G, Z} = __z; __bd.clear(); G.wq.length = 0; for (const t of __z.api.TH) __z.api.scene.remove(t.mesh); __z.api.TH.length = 0; let n = 0; while (G.state !== 'base' && n++ < 60) __z.sim(1); Z.base.setTab?.('shop'); Z.base.refresh?.(); });
    const r = await p.evaluate(() => ({row: !!document.querySelector('#zbase .zbdr'), title: document.querySelector('#zbase .zbdr')?.title || '', card: document.getElementById('zbd').hidden, text: document.querySelector('#zbase .zbdr')?.textContent || ''}));
    ok(r.row && /Pack/.test(r.title) && r.card, `Buddy base row: "${r.text.slice(0, 90)}" with the tooltip; the HUD card is hidden on the base screen`); }
  // Stop / restart: the buddy is gone with the run
  { const r = await p.evaluate(() => { const {G, Z} = __z; Z.stop(); const o = {fx: Z.bd.fx(), card: document.getElementById('zbd').hidden, st: Z.bd.mine.state}; return o; });
    ok(r.st === 'off' && r.fx.vis === 0 && r.fx.tags === 0 && r.card, 'Buddy: leaving Zombies takes it down (no model, no tag, no card)'); }
  ok(!errs.length, 'Buddy: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- bot explore (zbotroam.js, zbotsortiefly.js, zbotstat.js): the Bot Spectator roams the map, flies the sorties, uses what the game gives it and says what
// it is doing and why. The visual run flies a sortie between two waves with the shop paused; three headless Champion runs on Normal cover the map, the
// places, the systems and never stick, and reach the benchmark's wave; one run with a full purse from wave 15 uses the late-game systems ----------
if (want('explore')) {
  /* the numbers this section holds the bot to (real-flying benchmark, Champion on Normal, fresh profile: median wave 36.5 over 20 runs before roaming and sorties; cells by wave 12: 208 before, 323 after). BASE_WAVE sits below the benchmark's quarter-point so a bad draw of three does not fail it; the coverage floors sit well under what the bot reaches. */
  /* CI (software GL on a slow runner, the shard has 20 minutes and a retry) runs the light version: one Champion run to wave 13 (the coverage floors are read at wave 12) instead of three to wave 30, beside the full-purse run of two waves from wave 15 instead of five (two windows, not four contexts), the visual run and the campaign
     choice on one page; the same assertions with floors that one run clears (3 standard deviations under what a run reaches by wave 12: a single run is a wider draw than the median of three; it reaches 13 in all but about 1 run in 20, and the shard retries once). Locally: the full one. */
  const BASE_CAP = CI ? 13 : 30, BASE_WAVE = CI ? 13 : 26, COV_CELLS = CI ? 230 : 240, COV_PLACES = CI ? 12 : 15, COV_SYS = CI ? 14 : 18, N_RUNS = CI ? 1 : 3, SYS_WAVES = CI ? 2 : 5, SHOP_ACT = CI ? 3 : 4;  /* SHOP_ACT: kinds of shop action in the full-purse window; two waves draw three or four (CI failed one run in five on 3), five waves four or more */
  const T0 = Date.now(), lap = n => console.log(`  [explore ${n}: ${Math.round((Date.now() - T0) / 1000)} s]`);
  const KINDS = ['shop', 'launch', 'station', 'transit', 'intercept', 'lock', 'line', 'boss', 'sortie', 'bomb', 'return', 'strike', 'relaunch', 'idle'];
  // 1. the visual run: the leaderboard's flying results, the HUD line, Z.bot.intent, and a sortie flown frame by frame (the shop waits for it, then goes on)
  {
    const {p, errs} = await page();
    const lb = await p.waitForFunction(() => /flown: wave \d+, \d+% of the map, \d+ systems/.test(document.getElementById('zboard')?.textContent || ''), {timeout: 30000}).then(() => true, () => false);
    ok(lb, 'Explore: the leaderboard shows what each bot level flew for real (wave, share of the map, systems used) beside the benchmark');
    await p.evaluate(() => { __z.spec.start({lv: 'Champion', d: 1, doc: 'std', kit: [], sec: ''}); __z.spec.setSpeed(8); });
    const cx = await p.evaluate(() => ({all: __z.Z.codex?.all(), pool: __z.Z.codex?.pool().length, on: __z.spec.on}));  /* the enemies codex (zcodex.js) is on: a Bot Spectator run still meets the whole boss roster, nothing written to the save */
    ok(cx.on && cx.all === true && cx.pool >= 10, `Explore: with the codex on, the spectator gets the full boss roster (${cx.pool} bosses in its pool)`);
    await p.waitForFunction(() => __z.G.state === 'wave', {timeout: 120000});
    await p.waitForFunction(() => { const e = document.getElementById('zspwhy'); return e && !e.hidden && e.textContent.length > 12 && __z.Z.bot.intent.kind !== 'idle'; }, {timeout: 120000});
    const it = await p.evaluate(() => { const B = __z.Z.bot, I = B.intent, e = document.getElementById('zspwhy'); return {kind: I.kind, why: I.why, tgt: I.target ? [I.target.x, I.target.z, I.target.label].map(v => typeof v) : null, line: e.textContent, on: B.on}; });
    ok(it.on && KINDS.includes(it.kind) && it.why.length > 6 && (!it.tgt || it.tgt[0] === 'number' && it.tgt[1] === 'number'), `Explore: Z.bot.intent says what and why ({kind: ${it.kind}, why: "${it.why}"}, a target when it has one)`);
    ok(it.line.toLowerCase().includes(it.kind) && it.line.length > 12, `Explore: the spectator HUD line shows it ("${it.line}")`);
    await p.waitForFunction(() => __z.Z.bot.sortie.on(), {timeout: 400000});
    const so1 = await p.evaluate(() => { const {G, Z} = __z, so = __z.so; return {state: G.state, base: !document.getElementById('zbase').hidden, wait: Z.bot.wait(), gen: !!__z.spec.sp.gen, kind: Z.bot.intent.kind, hold: Z.hold(), t: so.S.t}; });
    ok(so1.state === 'base' && !so1.base && so1.wait && so1.gen && !so1.hold, `Explore: the bot flies the break's sortie in the visual run (base screen closed, the shop waits, ${Math.round(so1.t)} s on the clock, intent "${so1.kind}")`);
    await p.waitForFunction(() => { const e = document.getElementById('zspwhy'); return e && !e.hidden && /sortie|bombing|back to the line|warhead/i.test(e.textContent); }, {timeout: 60000});
    await p.waitForFunction(() => !__z.Z.bot.sortie.on(), {timeout: 400000});
    const so2 = await p.evaluate(() => { const B = __z.Z.bot, S = __z.so.S; return {n: B.sr.n, home: B.sr.home, lost: B.sr.lost, used: S.used}; });
    ok(so2.n === 1 && so2.used === 1 && so2.home + so2.lost >= 1, `Explore: the sortie ended (${so2.home} home, ${so2.lost} drone(s) lost) and counted in the break`);
    await p.waitForFunction(() => __z.G.wave >= 2 && __z.G.state === 'wave', {timeout: 400000});
    ok(true, 'Explore: the shop went on after the sortie and wave 2 started');
    await p.evaluate(() => __z.api.startDemo());
    // campaign choices: "Bot's choice" picks the doctrine and kit that answer the sector (Grain Silos: swarms, so a lure beacon; Air Mobile for the dash out)
    const c = await p.evaluate(() => { const {spec, Z, G} = __z; spec.start({lv: 'Champion', d: 1, doc: 'std', kit: [], sec: 'silo', auto: true}); const o = spec.sp.o, r = {doc: o.doc, kit: o.kit, g: G.doc, camp: Z.bot.did('camp'), cp: !!Z.cp.on}; spec.stop(); return r; });
    ok(c.doc === 'air' && c.kit.includes('lure') && c.g === 'air' && c.camp && c.cp, `Explore: Bot's choice for Grain Silos: ${c.doc} doctrine with ${c.kit.join(' + ')}, flown in the campaign sector`);
    await p.evaluate(() => __z.api.startDemo());
    lap('visual run and campaign choice');
    ok(!errs.length, 'Explore: visual run: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
    await p.close();
  }
  // 2. headless runs: Champion on Normal, a fresh profile, in parallel, each in its own context (as tools/zombies-bench.mjs: a shared save would let them read each other's); on CI with their draw calls stubbed
  async function botRun(lv, d, o = {}) {
    const ctx = await browser.createBrowserContext(), errs = [], pg = await ctx.newPage();
    if (CI) await installRenderStub(pg, true);
    const p = await open(browser, origin + '/games/interceptor/', errs, {w: 640, h: 360, page: pg});
    try {
      await p.evaluate(zd => { localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', zdiff: zd, wx: 'clear', zwx: 'menu', zmus: 0})); sessionStorage.setItem('zbossRoster', '0'); }, d);  /* no random boss events: the Mirror outruns a tail chase and can hold a wave for good (bosses have their own section) */
      await p.reload({waitUntil: 'load', timeout: 180000}); await p.waitForFunction(() => window.__z, {timeout: 180000});
      await p.evaluate((lv, d) => __z.spec.bench.start(lv, d, {}), lv, d);
      await p.waitForFunction(() => __z.G.state === 'base', {timeout: 60000});
      if (o.jump) await p.evaluate((w, c) => { __z.jump(w, c); __z.G.next = __z.plan(w); __z.Z.base.refresh?.(); }, o.jump, o.cash);
      const log = []; let st = 'base';
      for (let i = 0; i < (o.waves || 30); i++) {
        await p.evaluate(() => __z.spec.bench.shop());
        if (await p.evaluate(() => __z.G.state === 'base')) await p.evaluate(() => __z.cont());
        st = await p.evaluate(() => __z.spec.bench.wave());
        log.push(await p.evaluate(() => { const s = __z.Z.bot.summary(); return {w: s.wave, cells: s.cells, pct: s.pct, places: s.places, sys: s.systems, stuck: s.stuck}; }));
        if (st === 'over' || st === 'wave' || log[log.length - 1].w >= (o.cap || 99)) break;
      }
      const sum = await p.evaluate(() => { const B = __z.Z.bot; return {s: B.summary(), stuck: B.stuckLog, over: __z.G.state === 'over', modeT: B.modeT}; });
      return {log, st, sum, errs};
    } finally { await ctx.close().catch(() => {}); }
  }
  const med = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const jobs = [...Array.from({length: N_RUNS}, () => () => botRun('Champion', 1, {cap: BASE_CAP})), () => botRun('Champion', 1, {jump: 15, cash: 60000, waves: SYS_WAVES})];
  const done = await Promise.all(jobs.map(j => j()));
  const RS = done.pop(), RUNS = done, R0 = RUNS[0];
  lap('headless runs');
  const waves = RUNS.map(r => r.log[r.log.length - 1].w), at = (r, w) => r.log.find(l => l.w >= w) || r.log[r.log.length - 1];
  console.log('  Champion x' + N_RUNS + ' (Normal): final waves', waves.join(' '), '| at wave 12: cells', RUNS.map(r => at(r, 12).cells).join(' '), 'places', RUNS.map(r => at(r, 12).places).join(' '), 'systems', RUNS.map(r => at(r, 12).sys).join(' '));
  ok(RUNS.every(r => r.st !== 'wave'), `Explore: no wave runs on without end (no stuck state): ${RUNS.map(r => r.st).join(' ')}`);
  ok(RUNS.every(r => r.sum.s.stuck === 0), `Explore: the bot never sat still in a state that should move (${RUNS.map(r => r.sum.s.stuck).join(' / ')} stuck)${RUNS.some(r => r.sum.stuck.length) ? ' ' + JSON.stringify(RUNS.flatMap(r => r.sum.stuck).slice(0, 3)) : ''}`);
  ok(med(RUNS.map(r => at(r, 12).cells)) >= COV_CELLS, `Explore: by wave 12 it has flown over ${med(RUNS.map(r => at(r, 12).cells))} map cells (median of ${N_RUNS}; at least ${COV_CELLS} = ${Math.round(100 * COV_CELLS / RUNS[0].sum.s.cellTotal)}% of the operational area)`);
  ok(med(RUNS.map(r => at(r, 12).places)) >= COV_PLACES, `Explore: and ${med(RUNS.map(r => at(r, 12).places))} of ${RUNS[0].sum.s.placesTotal} places (ridges, the river valley, villages, sites, forward positions; at least ${COV_PLACES})`);
  const SOR = [...RUNS, RS].map(r => r.sum.s.sorties);  /* bombs over every headless run: one run can draw a gun that turns it back (hull under 28) at every site */
  ok(med(RUNS.map(r => r.sum.s.sorties.n)) >= 3 && SOR.reduce((a, q) => a + q.bombs, 0) >= 1, `Explore: sorties flown ${RUNS.map(r => r.sum.s.sorties.n).join(' / ')} (${RUNS.map(r => r.sum.s.sorties.home).join(' / ')} home), bombs dropped ${RUNS.map(r => r.sum.s.sorties.bombs).join(' / ')}, ${RUNS.map(r => Object.values(r.sum.s.sorties.kills).reduce((a, b) => a + b, 0)).join(' / ')} targets destroyed`);
  ok(med(waves) >= BASE_WAVE, `Explore: the wave baseline holds: Champion on Normal reached waves ${waves.join(' / ')} (median ${med(waves)}; the real-flying benchmark's median before roaming was 36.5, so at least ${BASE_WAVE})`);
  const S = RS.sum.s;
  console.log('  systems run (wave 15, $60,000):', S.systems + '/' + S.systemsTotal, S.systemIds.join(','), '| unused:', S.unused.join(','));
  const has = pre => S.systemIds.filter(i => i.startsWith(pre)).length;
  ok(S.systems >= COV_SYS && has('wpn:') + has('def:') >= 2 && has('swarm:') >= 2 && has('perk:') >= 2 && S.systemIds.includes('lock') && has('shop:') >= SHOP_ACT, `Explore: a full purse from wave 15 uses ${S.systems} of ${S.systemsTotal} systems (arsenal ${has('wpn:') + has('def:')}, swarm commands ${has('swarm:')}, perks ${has('perk:')}, lock-on, shop actions ${has('shop:')} of at least ${SHOP_ACT}; at least ${COV_SYS} systems)`);
  ok(RS.sum.s.stuck === 0, 'Explore: and sat still nowhere');
  const errs = [...RUNS, RS].flatMap(r => r.errs);
  ok(!errs.length, 'Explore: headless runs: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
}

/* ---------- spectator director (zdirector.js): the Director camera cuts between the dramatic moments of a bot's run ---------- */
if (want('director')) {
  const {p, errs} = await page();
  await p.evaluate(() => { __z.spec.start({lv: 'Legend', d: 1, doc: 'std', kit: [], sec: ''}); });
  await p.waitForFunction(() => __z.spec.on && __z.G.state === 'base', {timeout: 30000});
  const d0 = await p.evaluate(() => { const {spec} = __z; return {cam: spec.sp.cam, active: spec.dir.active, on: document.querySelector('#zspctl button.on')?.dataset.zcam, btns: [...document.querySelectorAll('#zspctl [data-zcam]')].map(b => b.dataset.zcam).join(), mode: __z.api.camMode, sdf: typeof __z.api.sdf}; });
  ok(d0.cam === 'director' && d0.active && d0.on === 'director' && /,director$/.test(d0.btns), `Director: the default camera when spectating a bot, last in the camera list (${d0.btns})`);
  ok(d0.sdf === 'function', 'Director: the world SDF (terrain, trees, buildings) is on the api for the camera');
  /* a scripted wave: the bot flies it for real; Z.cam runs each step like the draw loop does (the bodies at their in-between pose) */
  const run = await p.evaluate(() => { try { const {api, G, Z, spec} = __z, dir = spec.dir, IP = api.interp, V = api.THREE.Vector3, cam = api.camera, TICK = 1 / 120;
    const M = {frames: 0, cine: 0, noView: 0, under: 0, solid: 0, mode: 0, bad: [], booms: [], ip: [], iv: 0, cineHeld: null, card: '', kb: '', sstrike: null, fpv: 0, t: 0, boss: 0};
    const f0 = Z.flash; Z.flash = (q, k) => { f0(q, k); const f = new V(0, 0, -1).applyQuaternion(cam.quaternion), d = q.clone().sub(cam.position); M.booms.push({t: dir.now, k, vis: d.length() < 1800 && d.dot(f) > .3 * d.length(), hold: dir.lockFor(k), on: dir.cur.on, lu: +dir.lock.until.toFixed(2), type: dir.cur.type}); };
    G.cash = 40000; __z.jump(6, 40000); spec.bench.shop(); G.perks.swarm = Math.max(G.perks.swarm | 0, 2); G.perks.swarmk = Math.max(G.perks.swarmk | 0, 1); __z.cont();
    const at = (b, R) => [Math.sin(b) * R, 1950 - Math.cos(b) * R], did = {}; let t = 0, boss = null;
    dir.wipe();
    while (G.state !== 'over' && t < 330 && !(G.state === 'base' && t > 5)) {
      for (let i = 0; i < 12; i++) api.step(TICK);
      if (M.tFlip == null && G.state !== 'wave' && G.state !== 'clear') M.tFlip = dir.now;  /* the wave ended in these steps: from the next tick the director wipes its books (the lock goes with them) and the shot on air finishes on its own */
      api.visuals(.1, performance.now()); t += .1;
      if (!did.a && t > 2) { did.a = 1; for (const [b, k] of [[-1.1, 'shahed'], [0, 'shahed'], [1, 'shahed'], [.4, 'jet'], [-.5, 'jet'], [.1, 'heavy']]) { const [x, z] = at(b, 3800); __z.make(k, x, z); }
        for (let i = 0; i < 8; i++) { const [x, z] = at(.8, 3600), u = __z.make('swarm', x + i * 20, z + i * 10); u.grp = 77; } }
      if (!did.b && t > 12) { did.b = 1; boss = __z.make('boss', 0, -3200); }
      if (did.b && !did.b2 && Z.cine) { did.b2 = t; const n0 = dir.now; Z.cam(.1); M.cineHeld = dir.now === n0; Z.fxTest.endCine(); }
      if (did.b2 && !did.b3 && t > did.b2 + .5) { did.b3 = 1; const el = document.getElementById('zdirlt'); M.card = el?.textContent || ''; M.cardOn = !!el?.classList.contains('on'); }
      if (!did.c && t > 30) { did.c = 1; const s = api.SITES[1]; s.hp = Math.max(30, s.max * .15); const u = __z.make('shahed', s.x + 900, s.z - 900, s); u.tgt = s; u.aim = s.aims[0]; u.p.set(u.aim.x + 150, u.aim.y + 50, u.aim.z - 150); u.v.set(-30, -12, 40); }
      if (!did.d && t > 40) { did.d = 1; const me = api.player, L = []; for (let i = 0; i < 5; i++) { const u = __z.make('shahed', me.p.x + i * 25, me.p.z - 1800); u.p.set(me.p.x + i * 25, me.p.y, me.p.z - 1800 - i * 20); L.push(u); } Z.sw.deploy(Z.sw.mine, 6, 2); M.sstrike = me.dead <= 0 && Z.sw.command('strike'); }
      if (!did.e && t > 75) { did.e = 1; if (boss) while (api.live(boss)) Z.bossHit(boss); }
      if (t > 150 && !did.f) { did.f = 1; G.wq.length = 0; }
      if (t > 190 && !did.g) { did.g = 1; for (const u of api.TH) if (api.live(u)) u.st = 'dead'; }
      const me = api.player, sim = me.p.clone(); IP.begin(.5); let c;
      try { Z.cam(.1); c = dir.cur; if (!Z.cine && c.on && c.A.bot && me.dead <= 0 && me.v.length() > 50) M.ip.push(c.A.p.distanceTo(sim) / (.5 * me.v.length() * TICK)); } finally { IP.end(); }
      cam.updateMatrixWorld();
      if (Z.cine) { M.cine++; continue; } if (!c.on) continue;
      M.frames++; if (c.type === 'fpv') M.fpv++;
      const sj = c.type === 'fpv' ? c.B : c.A, vw = sj.p.clone().applyMatrix4(cam.matrixWorldInverse), nd = sj.p.clone().project(cam);
      if (!(vw.z < -.5 && Math.abs(nd.x) <= 1.02 && Math.abs(nd.y) <= 1.02)) { M.noView++; if (M.bad.length < 6) M.bad.push([c.type, c.label, +t.toFixed(1), +nd.x.toFixed(2), +nd.y.toFixed(2), +vw.z.toFixed(0)]); }
      const cp = cam.position; if (cp.y < api.gh(cp.x, cp.z) + .5) M.under++;
      if (c.type !== 'fpv' && api.sdf(cp.x, cp.y, cp.z) > -.5) M.solid++;
      if ((c.type === 'fpv') !== (api.camMode === 0)) M.mode++;
      if (did.b3 && !M.kb) M.kb = document.getElementById('zdirk')?.textContent || '';
    }
    for (let i = 0; i < 4; i++) { api.step(TICK); api.visuals(.1, performance.now()); Z.cam(.1); }
    Z.flash = f0; M.t = +t.toFixed(1); M.state = G.state; M.end = [G.kills.p + G.kills.h];
    M.log = dir.log.map(l => ({kind: l.kind, type: l.type, why: l.why, t0: l.t0, t1: l.t1, locked: l.locked, dist: Math.round(l.dist)}));  /* the clock as it was: rounded to hundredths, a cut stamped 8.2168 reads 8.22 and a boom of the same reading (which came after it) looked earlier */
    M.stats = dir.stats; M.leaks = dir.leaks(); M.min = dir.MINL; M.ev = dir.slots.filter(s => s.ev && s.s > 0).length;
    return M; } catch (e) { return {error: String(e.stack).slice(0, 1200)}; } });
  if (run.error) { console.log('  ' + run.error); ok(false, 'Director: the scripted wave ran'); } else {
    const L = run.log, kinds = [...new Set(L.map(l => l.kind))], types = [...new Set(L.map(l => l.type))], dur = l => l.t1 - l.t0;
    console.log(`  wave: ${run.t} s, ${run.frames} frames on the director, ${L.length} shots (${run.stats.cuts} cuts, ${run.stats.eases} eases, ${run.stats.interrupts} interrupts, ${run.stats.forced} forced)`);
    console.log('  moments:', kinds.join(', '), '· shots:', types.join(', '), '· rejected:', JSON.stringify(run.stats.rej));
    console.log('  log:', L.map(l => `${l.kind}/${l.type} ${dur(l).toFixed(1)}${l.why === 'end' ? '' : ' ' + l.why}`).join(' | '));
    ok(L.length >= 10 && kinds.length >= 5 && ['intercept', 'boss'].every(k => kinds.includes(k)) && kinds.some(k => ['site', 'threat', 'blast', 'boss down', 'swarm strike'].includes(k)), `Director: it chose ${L.length} shots over ${kinds.length} kinds of moment (${kinds.join(', ')}) in one wave`);
    ok(types.length >= 6 && run.stats.cuts >= 5, `Director: ${types.length} different shots (${types.join(', ')}), ${run.stats.cuts} cuts and ${run.stats.eases} eases`);
    ok(run.frames > 600 && run.noView === 0, `Director: the shot's subject was in view on all ${run.frames} frames` + (run.noView ? ` (${run.noView} not: ${JSON.stringify(run.bad)})` : ''));
    ok(run.under === 0 && run.solid === 0, `Director: the camera was never under the ground (${run.under}) or inside the world's solids (${run.solid}) on ${run.frames} frames`);
    ok(run.mode === 0, `Director: the goggle view (camera mode 0) is on exactly during the FPV shots (${run.fpv} frames)`);
    const rule = L.filter(l => ['end', 'better'].includes(l.why)), early = rule.filter(l => dur(l) < run.min - .05), hard = L.filter(l => l.why === 'interrupt' && dur(l) < 1.8 - .05);
    ok(rule.length >= 5 && !early.length && !hard.length, `Director: shots keep their minimum (${run.min} s; interrupts 1.8 s): shortest ${Math.min(...rule.map(dur)).toFixed(1)} s of ${rule.length} planned cuts, ${L.filter(l => l.why === 'interrupt').length} interrupts` + (early.length ? ' ' + JSON.stringify(early) : ''));
    /* the director's clock moves at its tick and the sim steps run between ticks: a boom stamped with the same reading as a cut came after that cut, so only an earlier stamp can hold it */
    /* the rule is for the wave: once it is over (the base screen opened) the director drops the lock with everything else and the last shot may end whenever it is due */
    const bad = rule.filter(l => l.t1 <= (run.tFlip ?? Infinity) && (l.locked || run.booms.some(b => b.vis && b.k >= 1.2 && b.t < l.t1 - 1e-6 && l.t1 - b.t < b.hold - .15)));
    ok(run.booms.filter(b => b.vis && b.k >= 1.2).length >= 5 && !bad.length, `Director: no planned cut while an explosion in view was still going (${run.booms.filter(b => b.vis && b.k >= 1.2).length} explosions in view)` + (bad.length ? ' ' + JSON.stringify(bad) + ' booms: ' + JSON.stringify(run.booms.filter(b => b.vis && b.k >= 1.2 && bad.some(l => b.t < l.t1 && l.t1 - b.t < b.hold + 1))) : ''));
    ok(run.cineHeld === true, "Director: it steps aside while the game's own boss fly-by cinematic has the camera");
    ok(/MOTHERSHIP/.test(run.card) && run.cardOn && /\d+ DOWN/.test(run.kb), `Director: lower-third name card on the boss's arrival ("${run.card.replace(/\s+/g, ' ')}") and a kill count ("${run.kb}")`);
    ok(run.ip.length >= 8 && run.ip.reduce((a, b) => a + b, 0) / run.ip.length > .6 && run.ip.reduce((a, b) => a + b, 0) / run.ip.length < 1.4, `Director: it points at the in-between (render) pose of the bot, half a tick behind the simulated one (${run.ip.length} frames, mean ratio ${(run.ip.reduce((a, b) => a + b, 0) / Math.max(1, run.ip.length)).toFixed(2)})`);
    console.log('  swarm strike in the wave: ' + (run.sstrike ? (kinds.includes('swarm strike') ? 'shown' : 'ordered, another moment was bigger') : 'none (the bot was down)'));
    ok(run.leaks.tracks === 0 && run.ev === 0 && run.leaks.lock === 0 && run.leaks.card === 0 && run.leaks.booms === 0 && run.state === 'base', `Director: nothing left over after the wave: ${run.leaks.tracks} tracks held, ${run.ev} events, no explosion lock, no card (${JSON.stringify(run.leaks)})`);
  }
  /* the next wave, for the single-moment checks and the cost: the bot's flight is scripted over, tracks are placed by hand */
  await p.evaluate(() => { __z.cont(); });
  /* a site about to be hit while the bot is down: the threat moment, shown from the defender's side */
  const thr = await p.evaluate(() => { const {api, G, Z, spec} = __z, dir = spec.dir, V = api.THREE.Vector3; 
    for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); api.lose('crash');
    const s = api.SITES[1]; s.hp = s.max * .2; const t = __z.make('shahed', s.x + 400, s.z - 400, s); t.tgt = s; t.aim = s.aims[0]; t.p.set(t.aim.x + 100, t.aim.y + 60, t.aim.z - 120); t.v.set(-30, -15, 35);
    dir.wipe(); dir.tick(.05); const c = dir.cur, sl = dir.slots[1];
    const o = {kind: c.kind, type: c.type, A: c.A.ref === t, score: +sl.s.toFixed(2), toSite: Math.round(Math.hypot(api.camera.position.x - s.x, api.camera.position.z - s.z)), int: dir.slots[0].s, rej: dir.stats.rej};
    api.TH.splice(api.TH.indexOf(t), 1); api.scene.remove(t.mesh); s.hp = s.max; return o; });
  console.log('  threat:', JSON.stringify(thr));
  ok(thr.kind === 1 && thr.A && thr.score > .4 && thr.int === 0, `Director: a Shahed seconds from a hurt site with the bot down is the moment (score ${thr.score}), shot as "${thr.type}" ${thr.toSite} m from the site`);
  /* the bot's own intent: the brain's Z.bot.intent {kind, target, why} when it exposes one */
  const it = await p.evaluate(() => { const {api, G, Z, spec} = __z, dir = spec.dir; api.launch(); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    const me = api.player; me.p.set(0, api.gh(0, 2600) + 300, 2600); me.v.set(0, 0, -60); const a = __z.make('shahed', 0, 100), b = __z.make('shahed', 150, 100); for (const u of [a, b]) { u.p.set(u.p.x, me.p.y, -1200); u.v.set(0, 0, 50); u.aim = new api.THREE.Vector3(0, 0, 1950); }
    const B0 = Z.bot, set = (kind, target) => { Z.bot = {intent: {kind, target, why: 'test', sub: '', t: 0, w: 0}}; dir.score(); }, sl = dir.slots;
    set('intercept', null); const was = sl[0].a === a, quiet0 = sl[10].s; set('intercept', b); const now = sl[0].a === b; set('intercept', b.id); const byId = sl[0].a === b;
    set('transit', {x: 0, y: 300, z: 0, label: 'the north ridge'}); const quiet = sl[10].s; set('sortie', {x: 120, y: 200, z: -3000, label: 'a launch site'}); const run = [sl[8].s, sl[8].x, sl[8].z]; set('bomb', {x: 120, y: 200, z: -3000, label: 'a launch site'}); const bomb = [sl[8].s, sl[8].mag, sl[8].at];
    Z.bot = B0; return {was, now, byId, quiet0, quiet, run, bomb}; });
  ok(it.now && it.byId && it.quiet < it.quiet0 && it.run[0] > .4 && it.run[1] === 120 && it.run[2] === -3000 && it.bomb[0] > .9 && it.bomb[2], `Director: it reads the brain's Z.bot.intent: a target that is a track or its id is followed; roaming ("transit") is quiet (${it.quiet} against ${it.quiet0}); a sortie target place is a moment and bombing is a climax (${it.bomb[0]})`);
  /* a swarm strike with nothing else going on: the moment, shot from the swarm's side */
  const sw = await p.evaluate(() => { const {api, G, Z, spec} = __z, dir = spec.dir; api.launch(); G.perks.swarm = Math.max(G.perks.swarm | 0, 2); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    const me = api.player; me.p.set(0, api.gh(0, 2600) + 400, 2600); me.v.set(0, 0, -60); for (let i = 0; i < 5; i++) { const u = __z.make('shahed', i * 25, 2600 - 1800 - i * 20); u.p.set(i * 25, me.p.y, 2600 - 1800 - i * 20); }
    Z.sw.deploy(Z.sw.mine, 6, 2); const ok = Z.sw.command('strike'); dir.wipe(); dir.tick(.05); const c = dir.cur, q = dir.slots[4]; return {ok, kind: c.kind, type: c.type, s: +q.s.toFixed(2), mag: q.mag}; });
  ok(sw.ok && sw.kind === 4 && sw.s > .9 && sw.mag > 4, `Director: a swarm strike is a moment of its own (score ${sw.s}), shot as "${sw.type}"`);
  /* a boss going down with nothing else on air: the moment, from the blast that kills it */
  const bd = await p.evaluate(() => { const {api, G, Z, spec} = __z, dir = spec.dir; api.launch(); for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0});
    const b = __z.make('boss', 0, 400); dir.wipe(); while (api.live(b)) Z.bossHit(b); dir.tick(.05); const c = dir.cur, q = dir.slots[3]; return {kind: c.kind, type: c.type, s: +q.s.toFixed(2), mag: q.mag}; });
  ok(bd.kind === 3 && bd.s > 1.2 && bd.mag > 6, `Director: a boss's death is a moment of its own (score ${bd.s}), shot as "${bd.type}"`);
  /* cost: the scorer allocates nothing, and a frame is a fraction of a millisecond (a crowd of 80 tracks in the air) */
  const cdp = await p.createCDPSession(); await cdp.send('HeapProfiler.enable');
  await p.evaluate(() => { __z.spec.sp.cam = 'chase'; });  /* parks the game loop's own director tick (it would run, unoptimised, between our calls and into the profile); the director stays on and is driven by hand */
  await p.evaluate(() => { const {api, G, spec} = __z, dir = spec.dir, at = (b, R) => [Math.sin(b) * R, 1950 - Math.cos(b) * R]; 
    for (let i = 0; i < 60; i++) { const [x, z] = at(-1.2 + i * .04, 3000 + i * 10), u = __z.make(i % 3 ? 'swarm' : 'shahed', x, z); u.grp = 80 + (i % 4); } for (let i = 0; i < 30000; i++) { dir.score(); dir.decide(); } for (let i = 0; i < 6000; i++) dir.tick(1 / 60); });
  const cost = await p.evaluate(() => { const {api, spec} = __z, dir = spec.dir; let t0 = performance.now(); for (let i = 0; i < 4000; i++) dir.score(); const sc = (performance.now() - t0) / 4000;
    t0 = performance.now(); for (let i = 0; i < 4000; i++) dir.tick(1 / 60); const tk = (performance.now() - t0) / 4000; return {sc: +sc.toFixed(4), tk: +tk.toFixed(4), tracks: api.TH.length}; });
  timingCheck(cost.sc < .15 && cost.tk < .25, `Director: scorer ${cost.sc} ms a run, a frame ${cost.tk} ms with ${cost.tracks} tracks in the air`, ok);
  /* the scorer's allocations: what zdirector.js itself allocates in score (and what it calls in zdirector.js: readIntent, ev), 20000 runs per window after a long warm-up; the least over up to six windows,
     because a deoptimisation inside a window runs a few hundred calls unoptimised and unoptimised code boxes every number. Anything that allocates in every run (one number is 16 bytes) shows in every
     window as 320 KB or more, so the bound is below that: 16 KB, under one byte a run */
  let heap = null;
  for (let attempt = 0; attempt < 6 && !(heap && heap.bytes <= 64); attempt++) {
    await p.evaluate(() => { const dir = __z.spec.dir; for (let i = 0; i < 60000; i++) dir.score(); });
    try { try { await cdp.send('HeapProfiler.startSampling', {samplingInterval: 32, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true}); } catch (e) { await cdp.send('HeapProfiler.startSampling', {samplingInterval: 32}); }
      await p.evaluate(() => { const dir = __z.spec.dir; for (let i = 0; i < 20000; i++) dir.score(); });
      const {profile} = await cdp.send('HeapProfiler.stopSampling'); let bytes = 0, all = 0; const where = [];
      const walk = n => { all += n.selfSize; if (/zdirector\.js/.test(n.callFrame.url) && /^(score|readIntent|ev)$/.test(n.callFrame.functionName) && n.selfSize) { bytes += n.selfSize; where.push(n.callFrame.functionName + ':' + n.callFrame.lineNumber + ' ' + n.selfSize); } for (const c of n.children) walk(c); };
      walk(profile.head); if (!heap || bytes < heap.bytes) heap = {bytes, all, where, attempt}; } catch (e) { console.log('  (heap sampling unavailable: ' + e.message + ')'); break; }
  }
  await p.evaluate(() => { __z.spec.sp.cam = 'director'; });
  if (heap) ok(heap.bytes <= 16000, `Director: the scorer allocates nothing: 20000 runs over 60 tracks, ${heap.bytes} bytes sampled in zdirector.js (best of ${heap.attempt + 1} window${heap.attempt ? 's' : ''})` + (heap.bytes ? ' ' + heap.where.slice(0, 8).join(', ') : ''));
  /* leaving: hooks off, the camera and field of view back, the elements gone */
  const off = await p.evaluate(() => { const {api, G, Z, spec} = __z, dir = spec.dir, c = api.camera; const f = 2 * Math.atan(Math.tan(50 * Math.PI / 180) / c.aspect) * 180 / Math.PI; spec.setCam('chase', true); const o = {act: dir.active, lt: !!document.getElementById('zdirlt'), kb: !!document.getElementById('zdirk'), fov: Math.abs(c.fov - f) < .05, mode: api.camMode};
    spec.setCam('director', true); const on = dir.active && !!document.getElementById('zdirk'); spec.stop(); Z.flash(c.position.clone(), 6); return {...o, on, stopped: !dir.active && !document.getElementById('zdirlt') && !document.getElementById('zdirk'), booms: dir.leaks().booms, cam: api.camMode === (api.S.cam | 0)}; });
  ok(!off.act && !off.lt && !off.kb && off.fov && off.mode === 1 && off.on && off.stopped && off.booms === 0 && off.cam, `Director: switching to another camera or stopping turns it off (hooks idle, field of view and camera mode back, no elements left) (${JSON.stringify(off)})`);
  ok(!errs.length, 'Director: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
}

// ---------- debug mode (zdebug.js, zdbgcheat.js, zdbgreport.js, zdbglog.js): off by default; the panel, every cheat, a marked run saves nothing, the report and the console ring buffer; no speech anywhere ----------
if (want('debug')) {
  const GURL = origin + '/games/interceptor/', DKEY = 'dl-interceptor';
  /* the build stamp is generated, not in git (tools/version.mjs): make it for the "with the file" half, move it away for the "without" half below */
  const {write: stampWrite} = await import('./version.mjs'), {fileURLToPath: toPath} = await import('node:url'), VFILE = toPath(new URL('../games/interceptor/version.js', import.meta.url));
  stampWrite();
  /* a page on a fresh save (extra: more saved keys) with the given query; the clipboard and the downloads are stand-ins that keep what they were given */
  const dpage = async (qs, errs, extra = {}) => {
    const p = await open(browser, GURL + qs, errs);
    await p.evaluate((x, k) => { sessionStorage.setItem('zbossRoster', '0'); localStorage.setItem(k, JSON.stringify({wx: 'clear', ...x})); }, extra, DKEY);
    await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 5); await drawFrames(p);
    await p.evaluate(() => {
      window.__dl = []; window.__clip = null; const c0 = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) { const rec = {name: this.download}; window.__dl.push(rec); fetch(this.href).then(r => r.blob()).then(b => { rec.type = b.type; rec.size = b.size; if (/text/.test(b.type)) b.text().then(t => { rec.text = t; }); }); return; } return c0.call(this); };
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async t => { window.__clip = t; }}});
    });
    return p;
  };
  const ev = (p, fn, ...a) => p.evaluate(fn, ...a);
  const pressF8 = async p => { await p.keyboard.press('F8'); await frames(p, 2); };

  // ---- off by default: no panel, no stylesheet, the console untouched, the cheats refuse; the chord turns it on and the save remembers (an automated browser still needs ?debug=1) ----
  const e0 = [], p0 = await dpage('', e0);
  const off = await ev(p0, () => ({panel: !!document.getElementById('zdbg'), btn: !!document.getElementById('zdbgbtn'), css: !!document.querySelector('link[href*="zdebug.css"]'), on: __z.Z.dbg.on,
    nat: /native code/.test(Function.prototype.toString.call(console.error)), refuse: __z.Z.dbg.c.money(5), flag: JSON.parse(localStorage.getItem('dl-interceptor')).zdbg, fps: __z.Z.dbg.fps.frames}));
  ok(!off.panel && !off.btn && !off.css && !off.on && off.nat && off.refuse === false && off.flag === undefined && off.fps === 0, `Debug: without the flag there is no panel, button or stylesheet, the console is untouched and no frame is sampled (${JSON.stringify(off)})`);
  await p0.keyboard.down('Control'); await p0.keyboard.down('Shift'); await p0.keyboard.press('KeyD'); await p0.keyboard.up('Shift'); await p0.keyboard.up('Control'); await frames(p0, 3);
  const ch = await ev(p0, () => { const el = document.getElementById('zdbg'); return {on: __z.Z.dbg.on, panel: !!el && !el.hidden, btn: !!el && !document.getElementById('zdbgbtn').hidden, css: !!document.querySelector('link[href*="zdebug.css"]'), flag: JSON.parse(localStorage.getItem('dl-interceptor')).zdbg}; });
  ok(ch.on && ch.css && ch.flag === 1 && ch.panel === false && ch.btn === true, `Debug: Ctrl+Shift+D turns it on, loads the panel (a DBG button over the start menu, so the menu stays usable) and remembers it in the save (${JSON.stringify(ch)})`);
  await p0.reload({waitUntil: 'load'}); await p0.waitForFunction(() => window.__z, {timeout: 60000});
  const auto = await ev(p0, () => ({on: __z.Z.dbg.on, panel: !!document.getElementById('zdbg'), flag: JSON.parse(localStorage.getItem('dl-interceptor')).zdbg}));
  ok(!auto.on && !auto.panel && auto.flag === 1, 'Debug: an automated browser ignores the saved flag (the benches and bots never see the panel) unless ?debug=1 is in the URL');
  await p0.keyboard.down('Control'); await p0.keyboard.down('Shift'); await p0.keyboard.press('KeyD'); await p0.keyboard.up('Shift'); await p0.keyboard.up('Control'); await frames(p0, 2);
  const ch2 = await ev(p0, () => ({on: __z.Z.dbg.on, flag: JSON.parse(localStorage.getItem('dl-interceptor')).zdbg, panel: !!document.getElementById('zdbg')}));
  ok(ch2.on && ch2.panel === true && ch2.flag === 1, 'Debug: the chord toggles (on again here)');
  await p0.keyboard.down('Control'); await p0.keyboard.down('Shift'); await p0.keyboard.press('KeyD'); await p0.keyboard.up('Shift'); await p0.keyboard.up('Control'); await frames(p0, 2);
  const ch3 = await ev(p0, () => ({on: __z.Z.dbg.on, flag: JSON.parse(localStorage.getItem('dl-interceptor')).zdbg, panel: !document.getElementById('zdbg').hidden, btn: document.getElementById('zdbgbtn').hidden}));
  ok(!ch3.on && ch3.flag === undefined && !ch3.panel && ch3.btn, 'Debug: and off again: the panel and the button hide and the flag is forgotten');
  ok(!e0.length, 'Debug off: no errors' + (e0.length ? '\n  ' + e0.join('\n  ') : ''));
  await p0.close();

  // ---- ?debug=1: the panel stays a DBG button over the start menu; F8 and the button open it; the readouts ----
  const e1 = [], p1 = await dpage('?debug=1', e1);
  const on1 = await ev(p1, () => { const el = document.getElementById('zdbg'); return {exists: !!el, hidden: el.hidden, btn: !document.getElementById('zdbgbtn').hidden, css: !!document.querySelector('link[href*="zdebug.css"]'),
    saved: JSON.parse(localStorage.getItem('dl-interceptor')).zdbg, sections: [...el.querySelectorAll('summary')].map(s => s.firstChild.textContent.trim()).join('/'), buttons: el.querySelectorAll('button[data-a]').length,
    toast: document.getElementById('zdtoast').textContent}; });
  ok(on1.exists && on1.hidden && on1.btn && on1.css && on1.saved === undefined && on1.sections === 'Live/Cheats/Report' && on1.buttons >= 25 && /DEBUG ON/.test(on1.toast), `Debug: ?debug=1 loads the panel (${on1.sections}, ${on1.buttons} buttons) behind a DBG button so the start menu stays usable, says how to use it, and an automated browser saves nothing`);
  await pressF8(p1);
  const f8 = await ev(p1, () => ({panel: !document.getElementById('zdbg').hidden, btn: document.getElementById('zdbgbtn').hidden}));
  await pressF8(p1);
  const f8b = await ev(p1, () => ({panel: document.getElementById('zdbg').hidden, btn: !document.getElementById('zdbgbtn').hidden}));
  await p1.click('#zdbgbtn'); await frames(p1, 2);
  const f8c = await ev(p1, () => ({panel: !document.getElementById('zdbg').hidden, btn: document.getElementById('zdbgbtn').hidden}));
  ok(f8.panel && f8.btn && f8b.panel && f8b.btn && f8c.panel && f8c.btn, 'Debug: F8 shows and hides the panel, the DBG button brings it back');
  await sleep(1500); await frames(p1, 20);
  const lv = await ev(p1, () => { const d = __z.Z.dbg, r = document.getElementById('zdr').textContent, f = d.fps; return {r, frames: f.frames, hist: f.hist.length, calls: f.calls, p99: f.p99(), now: f.now()}; });
  ok(/FPS \d+/.test(lv.r) && /p99 [\d.]+ ms/.test(lv.r) && /tick \d+/.test(lv.r) && /frames \d+/.test(lv.r) && /tracks \d+ live/.test(lv.r) && /heap/.test(lv.r) && /draw \d+ calls/.test(lv.r) && /wave \d+/.test(lv.r) && /boss:/.test(lv.r) && /co-op: solo/.test(lv.r),
    'Debug readouts: FPS, frame p99, ticks and frames, tracks, draw calls, memory, the wave, the boss and the co-op role\n' + lv.r);
  ok(lv.frames > 10 && lv.hist >= 1 && lv.p99 > 0 && lv.now.fps > 0 && (CI || lv.calls > 0), `Debug readouts: the frame sampler runs (${lv.frames} frames, ${lv.hist} s of history, p99 ${lv.p99.toFixed(1)} ms, ${lv.calls} draw calls)`);
  await pressF8(p1);


  // ---- the cheats, in a run ----
  await play(p1);
  const mo = await ev(p1, () => { const {G, Z} = __z, c0 = G.cash, D = Z.dbg; const r = D.c.money(10000);
    return {gain: G.cash - c0, r: r === G.cash, marked: D.marked, names: D.cheats.map(c => c.name), badge: document.getElementById('zdm').textContent, hasMark: Z.dbg.events(60000).some(e => e.type === 'debug')}; });
  ok(mo.gain === 10000 && mo.r && mo.marked && mo.names.join() === 'money' && mo.badge === 'DEBUG RUN' && mo.hasMark, `Debug cheat money: +$${mo.gain}, the run is marked (${mo.badge}) and the use is recorded`);
  const pk = await ev(p1, () => { const {G, Z} = __z, c = Z.dbg.c, o = {};
    o.rocket = c.perk('rocket'); o.lvlRocket = Z.perkLevel('rocket'); o.swarm = c.perk('swarm', 2); o.lvlSwarm = Z.perkLevel('swarm'); o.owned = Z.rk.st.armed;
    c.allPerks(); o.maxed = Object.keys(__z.ITEMS).filter(k => __z.ITEMS[k].type === 'perk').every(k => Z.perkMaxed(k)); o.optics = Z.perkLevel('optics');
    o.helper = c.helper('gepard') > 0 && Z.def.D.some(d => d.type === 'gepard'); o.supply = (c.supply('harden'), !!G.sup.harden);
    o.weapon = c.weapon('net'); o.wOwn = Z.ars.P(Z.ars.me()).own.has('net') && Z.ars.cur() === 'net'; o.allW = c.allWeapons(); o.bad = [c.perk('nope'), c.helper('rocket'), c.supply('rack'), c.weapon('nope')];
    return o; });
  ok(pk.rocket === 1 && pk.lvlRocket === 1 && pk.swarm === 2 && pk.lvlSwarm === 2 && pk.maxed && pk.optics === 3, `Debug cheat perks: Rocket Assist (level ${pk.lvlRocket}), the swarm (level ${pk.lvlSwarm}), all of them at their top`);
  ok(pk.helper && pk.supply && pk.weapon === 'net' && pk.wOwn && pk.allW >= 7 && pk.bad.every(x => x === false), 'Debug cheat grants: a helper in a free position, a supply, a pilot weapon (loaded), every weapon; unknown ids are refused');
  const un = await ev(p1, async () => { const {G, Z} = __z, c = Z.dbg.c, W = (await import('/games/interceptor/zarsdata.js')).WPN, o = {};
    o.before = Z.itemFrom('gdome'); c.unlock(true); o.on = Z.itemFrom('gdome'); o.wp = W.dart.from; Z.base.refresh(); const i = G.cards.findIndex(k => k.k === 'gdome'), b = document.querySelector(`[data-buy="${i}"]`); o.btn = b && !b.disabled && /Buy/.test(b.textContent);
    c.unlock(false); o.off = Z.itemFrom('gdome'); o.wpOff = W.dart.from; return o; });
  ok(un.before > 1 && un.on === 1 && un.wp === 1 && un.btn && un.off === un.before && un.wpOff > 1, `Debug cheat unlock shop: Golden Dome from wave ${un.before} is open at once and buyable, the pilot weapons too; off puts them back`);
  const wv = await ev(p1, () => { const {G, Z, api} = __z, c = Z.dbg.c, o = {}; c.wave(12); o.a = [G.wave, G.state, !!G.next, G.next && G.next.q.length > 0]; __z.cont(); o.b = [G.wave, G.state, api.liveSites().length];
    c.wave(25); o.c = [G.wave, G.state, api.SITES.length]; c.wave(4); o.d = [G.wave, G.state, api.SITES.length, api.TH.filter(api.live).length]; return o; });
  ok(wv.a[0] === 11 && wv.a[1] === 'base' && wv.a[2] && wv.a[3] && wv.b[0] === 12 && wv.b[1] === 'wave' && wv.c[0] === 24 && wv.c[1] === 'base' && wv.d[0] === 3 && wv.d[1] === 'base' && wv.d[2] === 3 && wv.d[3] === 0,
    `Debug cheat wave: jumps to wave 12 (base screen with its plan, then wave 12 starts), 25 from inside a wave, and back to 4 without the bunker (${JSON.stringify(wv)})`);
  const sp = await ev(p1, () => { const {G, Z, api} = __z, c = Z.dbg.c, o = {}, live = () => api.TH.filter(api.live);
    __z.cont(); G.wq.length = 0; c.clearTracks(); const n0 = live().length; o.made = c.spawn('cruise', 3, 90); const cr = live().filter(t => t.k === 'cruise'); o.cruise = cr.length; o.east = cr.every(t => t.p.x > 5000);
    o.far = c.spawn('ballistic', 1, -45, 30000); o.sw = c.spawn('swarm', 8, 0, 4000); o.swn = live().filter(t => t.k === 'swarm').length; o.grp = new Set(live().filter(t => t.k === 'swarm').map(t => t.grp)).size;
    o.boss = c.spawn('boss', 1, 0); o.mship = live().some(t => t.k === 'boss'); c.clearTracks(); o.cleared = live().length;
    const hidden = Object.keys(__z.KIND).filter(k => __z.KIND[k].bossy && !__z.KIND[k].minor); o.bosses = {}; for (const k of hidden) { o.bosses[k] = c.spawn(k, 1, 0); c.clearTracks(); } o.n = hidden.length; return o; });
  ok(sp.made === 3 && sp.cruise === 3 && sp.east && sp.far === 1 && sp.sw === 8 && sp.swn === 8 && sp.grp === 1 && sp.boss === 1 && sp.mship && sp.cleared === 0, `Debug cheat spawn: 3 cruise missiles from the east (bearing 90), a ballistic at 30 km, an 8-drone swarm in one group, the Mothership; clear tracks empties the sky (${JSON.stringify({made: sp.made, east: sp.east, swn: sp.swn, grp: sp.grp})})`);
  ok(sp.n >= 10 && Object.values(sp.bosses).every(v => v === 1), `Debug cheat spawn: every boss in the registry (${sp.n}, the hidden ones too) can be spawned: ${Object.entries(sp.bosses).filter(([, v]) => v !== 1).map(([k]) => k).join() || 'all did'}`);
  await ev(p1, () => { const {G} = __z; window.__keep = () => { if (G.state === 'base') __z.cont(); if (G.state === 'wave') { G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); } };  /* the wave stays open: nothing spawns, nothing ends it */ });
  const gd = await ev(p1, () => { const {G, Z, api} = __z, c = Z.dbg.c, o = {}, me = api.player; __keep(); c.clearTracks(); api.launch(); __z.sim(.2); o.a = c.god(true);
    api.lose('shot'); o.shot = me.dead <= 0; api.lose('crash'); o.crash = me.dead <= 0; me.mah = api.BCAP * 3; __z.sim(.1); o.bat = [me.dead <= 0, me.mah < 1];
    c.burn(); o.burn = Z.rk.st.t; Z.rk.st.t = 2; __z.sim(1); o.hold = Z.rk.st.t > 10; o.lg = Z.dbg.events(60000).some(e => e.type === 'god');
    api.lose('det'); o.det = me.dead > 0; c.god(false); api.launch(); __z.sim(.2); o.off = c.god(false); api.lose('shot'); o.dies = me.dead > 0; api.launch(); __z.sim(.2); return o; });
  ok(gd.a === true && gd.shot && gd.crash && gd.bat[0] && gd.bat[1] && gd.burn > 14 && gd.hold && gd.lg && gd.det && gd.dies, `Debug cheat god mode: a hit, a crash and a flat pack do not lose the interceptor, the battery stays full and the burn does not run out (burn ${gd.burn}); the burst still spends it; off, a hit kills`);
  const ts = await ev(p1, () => { const {G, Z, api} = __z, c = Z.dbg.c, o = {}; __keep(); o.base = Z.tsc; c.timeScale(4); o.x4 = Z.tsc; o.cap = Z.stepCap; c.timeScale(.25); o.slow = Z.tsc; c.timeScale(99); o.max = Z.tsc;
    c.pause(true); o.paused = Z.tsc; const t0 = api.tick; o.step = [c.step(12), api.tick - t0]; o.stepIn = c.step(1) === 1; c.pause(false); c.timeScale(1); o.back = [Z.tsc, Z.stepCap]; return o; });
  ok(ts.x4 === 4 * ts.base && ts.cap === 48 && ts.slow === .25 * ts.base && ts.max === 8 * ts.base && ts.paused === 0 && ts.step[0] === 12 && ts.step[1] === 12 && ts.stepIn && ts.back[0] === ts.base && ts.back[1] === 0,
    `Debug cheat time: 4x runs the loop at ${ts.x4}x with ${ts.cap} steps a frame, 0.25x and the 8x limit hold, pause stops it, step advances exactly ${ts.step[1]} ticks, back to 1x (${JSON.stringify(ts)})`);
  const wx = await ev(p1, () => { const {Z, api} = __z, S = api.S, c = Z.dbg.c, o = {}; for (const id of ['fog', 'night', 'storm', 'clear']) { c.weather(id); o[id] = api.WX.id; }
    o.bad = c.weather('nope'); o.d = [c.difficulty(2), S.zdiff, Z.diff().n]; c.difficulty(1); o.d2 = S.zdiff; return o; });
  ok(wx.fog === 'fog' && wx.night === 'night' && wx.storm === 'storm' && wx.clear === 'clear' && wx.bad === false && wx.d[0] === 'Hard' && wx.d[1] === 2 && wx.d[2] === 'Hard' && wx.d2 === 1, 'Debug cheat weather and difficulty: set the weather (fog, night, storm, clear), set Hard and back to Normal');
  const cx = await ev(p1, () => { const {Z} = __z, c = Z.dbg.c, o = {}; o.before = Z.codex.all(); o.poolBefore = Z.codex.pool(60).length; c.codex(true); o.on = Z.codex.all(); o.poolOn = Z.codex.pool(60).length; c.codex(false); o.off = Z.codex.all(); return o; });
  ok(!cx.before && cx.on && !cx.off && cx.poolOn > cx.poolBefore, `Debug cheat codex: the whole roster opens for the session (boss pool ${cx.poolBefore} -> ${cx.poolOn}) and closes again`);
  const pd = await ev(p1, () => { const {Z, api} = __z, c = Z.dbg.c, me = api.player, o = {}; me.p.set(900, 400, -2500); o.far = me.p.distanceTo(me.home.mat) > 1000; o.r = c.toPad(); o.near = api.player.p.distanceTo(api.player.home.mat) < 8;
    for (const s of api.SITES) s.hp = 1; o.rep = c.repair(); o.hp = api.SITES.every(s => s.hp === s.max); return o; });
  ok(pd.far && pd.r === true && pd.near && pd.rep && pd.hp, 'Debug cheat to pad and repair: the interceptor goes back to the mat, the sites are whole again');
  const ui1 = await ev(p1, () => { const el = document.getElementById('zdbg'); el.querySelector('#zd-money').value = 500; const g0 = __z.G.cash; el.querySelector('[data-a="money"]').click(); const a = __z.G.cash - g0;
    el.querySelector('#zd-wave').value = 8; el.querySelector('[data-a="wave"]').click(); const w = __z.G.wave; el.querySelector('[data-a="god"]').click(); const g = __z.Z.dbg.D.god, gb = el.querySelector('#zd-god').classList.contains('on'); el.querySelector('[data-a="god"]').click();
    const it = el.querySelector('#zd-item'); it.value = 'perk:rocket'; el.querySelector('#zd-lvl').value = ''; el.querySelector('[data-a="grant"]').click(); return {a, w, g, gb, off: !__z.Z.dbg.D.god, rk: __z.Z.perkLevel('rocket')}; });
  ok(ui1.a === 500 && ui1.w === 7 && ui1.g && ui1.gb && ui1.off && ui1.rk === 1, `Debug panel: its buttons do what they say (money +${ui1.a}, wave jump to ${ui1.w + 1}, god lights up, grant Rocket Assist)`);
  const rs = await ev(p1, () => { const {Z} = __z, c = Z.dbg.c; const names = Z.dbg.cheats.map(x => x.name); const r = c.resetSave(true); return {names, r, saved: localStorage.getItem('dl-interceptor'), reset: Z.dbg.D.reset}; });
  await ev(p1, () => __z.api.save());
  const rs2 = await ev(p1, () => localStorage.getItem('dl-interceptor'));
  ok(rs.r === true && rs.saved === '{"zdbg":1}' && rs2 === '{"zdbg":1}' && ['money', 'perk', 'allPerks', 'helper', 'supply', 'weapon', 'allWeapons', 'unlock', 'wave', 'spawn', 'clearTracks', 'god', 'burn', 'timeScale', 'pause', 'step', 'weather', 'difficulty', 'codex', 'toPad', 'repair'].every(n => rs.names.includes(n)),
    `Debug cheat reset save: the save is wiped (debug stays on) and later saves cannot bring the old one back (${rs2}); ${rs.names.length} cheat uses recorded: ${[...new Set(rs.names)].join(' ')}`);
  ok(!e1.length, 'Debug cheats: no errors' + (e1.length ? '\n  ' + e1.join('\n  ') : ''));
  await p1.close();

  // ---- a marked run saves nothing: no leaderboard entry, best wave, codex, goal or campaign write; a new run starts clean; a cheat on the menu marks the run that follows ----
  const e2 = [], seed = {zbests: {Normal: {wave: 3, kills: 5, earned: 100}}, zruns: [{d: 1, w: 3, doc: 'std', co: 0, t: 1}]};
  const p2 = await dpage('?debug=1', e2, seed); await play(p2);
  const w0 = await ev(p2, () => { const {G, Z, api} = __z, S = api.S, o = {}, L = () => JSON.parse(localStorage.getItem('dl-interceptor')), J = k => JSON.stringify(S[k]), base = {zcodex: J('zcodex'), zmeta: J('zmeta'), zcamp: J('zcamp'), zboss: J('zboss'), zend: J('zend')};
    o.clean = Z.dbg.marked; Z.dbg.c.money(1); o.marked = Z.dbg.marked; o.rec = Z.board.record(1, 15, false); o.runs = S.zruns.length;
    S.zbests = {Normal: {wave: 99, kills: 1, earned: 1}}; S.zcodex = {v: 1, b: {twins: {seen: 1, beaten: 1, allowed: true}}}; S.zmeta = {v: 1, g: {w10: 1}}; S.zcamp = {v: 1, x: 1}; S.zend = {v: 1, best: 9}; api.save(); const s1 = L();
    o.disk = [s1.zbests.Normal.wave, JSON.stringify(s1.zcodex) === base.zcodex, JSON.stringify(s1.zmeta) === base.zmeta, JSON.stringify(s1.zcamp) === base.zcamp, s1.zruns.length, JSON.stringify(s1.zend) === base.zend];
    Z.dbg.poll(); o.mem = [S.zbests.Normal.wave, J('zcodex') === base.zcodex, J('zmeta') === base.zmeta, J('zcamp') === base.zcamp, J('zend') === base.zend]; o.rev = Z.dbg.reverted;
    Z.bosses.ctx.bump('twins', 'met'); Z.bosses.ctx.recAdd('ace', 'kills', 3); o.boss = [JSON.stringify(L().zboss) === base.zboss]; Z.dbg.poll(); o.boss.push(J('zboss') === base.zboss);
    G.wave = 7; Z.gameOver(); o.over = {best: S.zbests.Normal.wave, runs: S.zruns.length, disk: L().zbests.Normal.wave, txt: document.getElementById('zover').textContent, hint: /Debug run/.test(document.getElementById('zover').textContent)};
    return o; });
  ok(!w0.clean && w0.marked && w0.rec === null && w0.runs === 1, 'Debug run: Board.record refuses a marked run (no leaderboard entry)');
  ok(w0.disk.every(Boolean) && w0.disk[0] === 3 && w0.disk[4] === 1 && w0.mem.every(Boolean) && w0.mem[0] === 3 && w0.rev >= 5,
    `Debug run: a save while marked keeps the old bests, codex, goals, campaign and Endless records on disk, and the live settings get them back (${JSON.stringify(w0.disk)} / ${JSON.stringify(w0.mem)}, ${w0.rev} reverted)`);
  ok(w0.boss[0] && w0.boss[1], "Debug run: the boss record (met / lost / the Ace's tally) is not written either");
  ok(w0.over.best === 3 && w0.over.runs === 1 && w0.over.disk === 3 && w0.over.hint && !/NEW BEST/.test(w0.over.txt), `Debug run: game over on wave 7 writes no best wave and no run, and the screen says so (best stays ${w0.over.best})`);
  const w1 = await ev(p2, () => { const {G, Z, api} = __z, S = api.S, o = {}; document.getElementById('zagain').click(); o.marked = Z.dbg.marked; o.cheats = Z.dbg.D.god;
    G.wave = 6; Z.gameOver(); o.best = S.zbests.Normal.wave; o.runs = S.zruns.length; o.disk = JSON.parse(localStorage.getItem('dl-interceptor')).zbests.Normal.wave; return o; });
  ok(w1.marked === false && w1.best === 6 && w1.runs === 2 && w1.disk === 6, `Debug run: the next run starts clean and its game over is recorded as usual (best ${w1.best}, ${w1.runs} runs saved)`);
  const w2 = await ev(p2, () => { const {G, Z, api} = __z, S = api.S, o = {}; Z.stop(); o.c = Z.dbg.c.difficulty(1); o.marked = Z.dbg.marked; api.startMatch(); o.run = [Z.dbg.marked, G.on]; o.rec = Z.board.record(1, 5, false);
    api.startMatch(); o.next = Z.dbg.marked; o.rec2 = !!Z.board.record(1, 5, false); return o; });
  ok(w2.marked && w2.run[0] && w2.run[1] && w2.rec === null && w2.next === false && w2.rec2, 'Debug run: a cheat used on the menu marks the run that follows it, and only that one');
  ok(!e2.length, 'Debug marked runs: no errors' + (e2.length ? '\n  ' + e2.join('\n  ') : ''));
  await p2.close();

  // ---- the Bot Spectator (readouts only) and co-op (the host cheats, a client does not; the host's cheats mark the clients' runs) ----
  const e3 = [], p3 = await dpage('?debug=1', e3); await play(p3);
  const sc = await ev(p3, () => { const {Z} = __z, c = Z.dbg.c, o = {}; __z.spec.sp.on = true; o.refused = c.money(5); Z.dbg.ui.sync(); const el = document.getElementById('zdbg'); o.ro = el.classList.contains('ro') && getComputedStyle(el.querySelector('.cheats')).display === 'none';
    o.badge = document.getElementById('zdm').textContent; o.live = Z.dbg.readout().length > 50; o.marked = Z.dbg.marked; __z.spec.sp.on = false; o.after = c.money(5) !== false; return o; });
  ok(sc.refused === false && sc.ro && /spectator/.test(sc.badge) && sc.live && !sc.marked && sc.after, `Debug spectator: the Bot Spectator gets the readouts and the report only; its cheats are refused and the section is hidden (${sc.badge})`);
  await ev(p3, () => { const {Z} = __z; Z.dbg.D.marked = false; Z.dbg.D.snap = Z.dbg.D.snapJ = null; });
  const co = await ev(p3, () => { const {Z, G} = __z, c = Z.dbg.c, o = {}, d0 = Object.getOwnPropertyDescriptor(Z, 'mirror'); window.__ne = []; Z.netEv = e => { window.__ne.push(e); };
    c.god(true); o.host = window.__ne.map(e => e.join(':')); c.god(false);
    Object.defineProperty(Z, 'mirror', {get: () => true, configurable: true}); Z.dbg.D.marked = false; const g0 = G.cash; o.client = c.money(1000); o.cash = G.cash - g0; Z.dbg.ui.sync(); o.ro = document.getElementById('zdbg').classList.contains('ro'); o.badge = document.getElementById('zdm').textContent;
    o.live = Z.dbg.readout().length > 50; o.before = Z.dbg.marked; Z.dbg.netEv(['god']); o.after = Z.dbg.marked; o.name = Z.dbg.cheats.at(-1).name; Object.defineProperty(Z, 'mirror', d0); return o; });
  ok(co.host[0] === 'D:god' && co.client === false && co.cash === 0 && co.ro && /client/.test(co.badge) && co.live && co.before === false && co.after && co.name === 'host: god', `Debug co-op: the host's cheat is announced to the clients (${co.host[0]}), a client cannot cheat but still reads and reports, and the host's mark makes its run a debug run (${co.name})`);
  ok(!e3.length, 'Debug spectator and co-op: no errors' + (e3.length ? '\n  ' + e3.join('\n  ') : ''));
  await p3.close();

  // ---- the report: every field, parses; the console ring buffer catches an error; the mark key; copy and download ----
  const e4 = [], p4 = await dpage('?debug=1&report', e4);
  const rm = await ev(p4, () => ({msg: document.getElementById('zd-msg').textContent, open: !document.getElementById('zdbg').hidden}));
  ok(rm.open && /report mode/.test(rm.msg), `Debug report: ?debug=1&report opens the panel in report mode, even over the menu ("${rm.msg}")`);
  await pressF8(p4); await play(p4);
  await ev(p4, () => { const {G, Z} = __z; Z.dbg.c.money(500); __z.cont(); G.wq.length = 0; Z.dbg.c.spawn('shahed', 2, 0); __z.sim(3); __z.botKill(.8); __z.sim(1); console.log('debug test line'); console.error('debug test error', new Error('boom here')); console.warn('debug test warn', {a: 1});
    const s = document.createElement('script'); s.textContent = "setTimeout(function () { throw new Error('late boom'); }, 0); Promise.reject(new Error('rejected boom'));"; document.head.append(s);  /* a page script: an evaluate()'s own errors are reported without a message or stack */ });
  await sleep(1300); await frames(p4, 10);
  await ev(p4, () => { document.getElementById('zd-note').value = 'odd stutter after the spawn'; });
  await p4.keyboard.press('F9'); await frames(p4, 2);
  const rp = await ev(p4, async () => { const D = __z.Z.dbg, r = await D.report(), i = r.text.indexOf('=== JSON ==='); let data = null, err = ''; try { data = JSON.parse(r.text.slice(i + 12)); } catch (e) { err = String(e); }
    return {head: r.text.slice(0, i), data, err, marks: D.marks.length, note: document.getElementById('zd-note').value, toast: document.getElementById('zdtoast').textContent, marksUi: document.getElementById('zd-marks').textContent}; });
  const R = rp.data || {};
  ok(!rp.err && R.schema === 1 && ['version', 'env', 'run', 'settings', 'save', 'console', 'events', 'marks', 'fps', 'state', 'cheats'].every(k => k in R), `Debug report: a text summary and the JSON, which parses, with every field (${Object.keys(R).join(', ')})`);
  ok(/^[0-9a-f]{7}$/.test(R.version?.hash) && R.version?.stamp === 'version.js' && typeof R.version?.pkg === 'string' && R.version.pkg.length > 0, `Debug report: the build (version.js: ${R.version?.hash}, ${R.version?.date}, ${R.version?.branch})`);
  ok(/Mozilla/.test(R.env?.userAgent) && typeof R.env?.gpu?.renderer === 'string' && R.env.gpu.renderer.length > 0 && R.env.screen?.w > 0 && R.env.viewport?.w > 0 && R.env.automated === true, `Debug report: the browser and GPU (${R.env?.userAgent?.slice(0, 40)}..., ${R.env?.gpu?.renderer?.slice(0, 50)})`);
  ok(Number.isInteger(R.settings?.setV) && R.settings.setV >= 6 && R.settings?.zdbg === undefined && typeof R.save?.['dl-interceptor'] === 'object' && R.save['dl-interceptor'] !== null && !('zrspeech' in R.settings) && typeof R.save?.droneleague !== 'undefined', 'Debug report: the settings in force and the stored save');  /* setV only grows (v7 added the key bindings): the report must carry whatever version is current */
  const L = R.console?.lines || [], eb = L.find(l => /debug test error/.test(l.msg)), wb = L.find(l => /debug test warn/.test(l.msg)), ub = L.find(l => /late boom/.test(l.msg)), rj = L.find(l => /rejected boom/.test(l.msg));
  ok(L.length > 0 && L.length <= 200 && L.some(l => /debug test line/.test(l.msg) && l.lvl === 'log') && eb && eb.lvl === 'error' && /boom here/.test(eb.msg) && /Error/.test(eb.stack || '') && wb && wb.lvl === 'warn' && /\{"a":1\}/.test(wb.msg), `Debug console: the ring buffer caught the log, the warning and the error with its stack (${L.length} lines)`);
  ok(ub && ub.lvl === 'error' && /Error: late boom|late boom/.test(ub.msg) && /boom/.test(ub.stack || '') && rj && rj.lvl === 'error' && R.console.errors >= 3, `Debug console: an uncaught error and a rejected promise are caught too, with stacks (${R.console?.errors} errors)`);
  const T = new Set((R.events || []).map(e => e.type));
  ok(['wave', 'cheat', 'debug', 'kill', 'radio', 'mark'].every(t => T.has(t)) && (R.events || []).every(e => e.t > 0 && /^\d\d:\d\d:\d\d$/.test(e.at)), `Debug events: the last minute has the wave edges, the cheat, the kill, the radio call and the mark (${[...T].join(' ')}; ${(R.events || []).length} events)`);
  ok(rp.marks === 1 && R.marks?.length === 1 && R.marks[0].note === 'odd stutter after the spawn' && /^\d\d:\d\d:\d\d$/.test(R.marks[0].clock) && R.marks[0].before.length > 3 && R.marks[0].console.length > 0 && rp.note === '' && /MARK #1/.test(rp.toast) && /#1/.test(rp.marksUi),
    `Debug mark: F9 notes the time and the note ("${R.marks?.[0]?.note}" at ${R.marks?.[0]?.clock}) with the minute before it, shows it, and clears the box`);
  ok(Array.isArray(R.fps?.history) && R.fps.history.length >= 1 && R.fps.history[0].fps > 0 && 'p99' in R.fps.history[0] && R.fps.now.fps > 0, `Debug report: the FPS history (${R.fps?.history?.length} s) and the live numbers`);
  const S0 = R.state || {};
  ok(S0.game?.wave === 1 && S0.game?.state === 'wave' && Array.isArray(S0.player?.pos) && S0.player.battery > 0 && Array.isArray(S0.sites) && S0.sites.length === 3 && S0.tracks && 'byKind' in S0.tracks && S0.plan && S0.net?.role === 'solo' && S0.perf && S0.debug?.marked === true && Array.isArray(S0.bosses),
    `Debug report: a state snapshot (wave ${S0.game?.wave}, ${S0.tracks?.live} tracks, the player, the sites, the plan, the co-op role)`);
  ok(R.cheats?.length >= 2 && R.cheats.every(c => c.name && c.clock && c.run >= 1) && R.cheats[0].name === 'money' && R.run?.marked && R.run.why.includes('money') && R.run.why.includes('spawn') && /DEBUG RUN/.test(rp.head), `Debug report: the cheats used (${R.cheats?.map(c => c.name).join(', ')}) and the run flagged`);
  ok(/^DRONE LEAGUE INTERCEPTOR DEBUG REPORT/.test(rp.head) && /Build [0-9a-f]{7}/.test(rp.head) && /Browser Mozilla/.test(rp.head) && /GPU /.test(rp.head) && /Console: \d+ lines, \d+ errors/.test(rp.head) && /Mark #1 at/.test(rp.head), 'Debug report: the readable summary on top says build, browser, GPU, run, FPS, console, marks and cheats');
  await ev(p4, () => { for (let i = 0; i < 300; i++) console.log('ring ' + i); });
  const ring = await ev(p4, async () => { const r = await __z.Z.dbg.report(); const L = r.data.console.lines; return {n: L.length, first: L[0].msg, last: L.at(-1).msg, total: r.data.console.total}; });
  ok(ring.n === 200 && ring.last === 'ring 299' && ring.first === 'ring 100' && ring.total >= 300, `Debug console: the ring keeps the last 200 lines (${ring.first} .. ${ring.last} of ${ring.total})`);
  /* the build stamp: its date is always in the summary; a served game file well newer than it says the stamp may be behind HEAD (a local server sends no Last-Modified: not judged) */
  const sb = await ev(p4, async () => { const f0 = window.fetch, D = __z.Z.dbg, mk = lm => (u, o) => /interceptor\.js/.test(String(u)) && o && o.method === 'HEAD' ? Promise.resolve({headers: {get: k => /last-modified/i.test(k) ? lm : null}}) : f0(u, o);
    window.fetch = mk('Fri, 01 Jan 2100 00:00:00 GMT'); const a = await D.report(); window.fetch = mk('Mon, 01 Jan 2001 00:00:00 GMT'); const b = await D.report(); window.fetch = f0; const c = await D.report();
    return {a: [a.data.version.stampBehind, a.data.version.served.interceptor, /may be behind HEAD/.test(a.text)], b: [b.data.version.stampBehind, /may be behind HEAD/.test(b.text)], c: [c.data.version.stampBehind, /may be behind HEAD/.test(c.text), c.text.split('\n').find(l => /^Build /.test(l))]}; });
  ok(sb.a[0] === true && sb.a[1] === 'Fri, 01 Jan 2100 00:00:00 GMT' && sb.a[2] && sb.b[0] === false && !sb.b[1] && sb.c[0] === null && !sb.c[1] && /^Build [0-9a-f]{7} of \d{4}-\d\d-\d\dT/.test(sb.c[2]),
    `Debug report: the stamp's date is printed, and the report says the stamp may be behind HEAD when the served game files are newer than it (${JSON.stringify(sb.a.slice(0, 1))} / ${JSON.stringify(sb.b)} / none without a header; "${sb.c[2]?.slice(0, 60)}")`);
  await ev(p4, () => { window.__clip = null; window.__dl.length = 0; document.getElementById('zd-shot').checked = true; });
  const cp = await ev(p4, () => __z.Z.dbg.copyReport({shot: true}));
  await sleep(500);
  const cl = await ev(p4, () => ({clip: window.__clip, dl: window.__dl, msg: document.getElementById('zd-msg').textContent}));
  const cdata = (() => { try { return JSON.parse(cl.clip.slice(cl.clip.indexOf('=== JSON ===') + 12)); } catch (e) { return null; } })();
  const txt = cl.dl.find(f => /\.txt$/.test(f.name)), png = cl.dl.find(f => /\.png$/.test(f.name));
  ok(cp.how === 'clipboard' && cdata && cdata.schema === 1 && cl.clip.startsWith('DRONE LEAGUE INTERCEPTOR DEBUG REPORT') && txt && txt.text === cl.clip && /^drone-league-debug-[0-9a-f]{7}-.*\.txt$/.test(txt.name),
    `Debug report: Copy report puts the bundle on the clipboard (${cl.clip?.length} chars) and downloads the same text as ${txt?.name}`);
  ok(png && png.type === 'image/png' && png.size > 100 && /\.png$/.test(cp.png), `Debug report: the screenshot comes as a separate PNG (${png?.name}, ${png?.size} bytes)`);
  await ev(p4, () => { window.__clip = null; window.__dl.length = 0; document.getElementById('zd-shot').checked = false; });
  await p4.keyboard.press('F10'); await sleep(500);
  const f10 = await ev(p4, () => ({clip: !!window.__clip && window.__clip.includes('=== JSON ==='), dl: window.__dl.length}));
  ok(f10.clip && f10.dl === 1, 'Debug report: F10 does the same as the button (without the screenshot)');
  await ev(p4, () => { Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async () => { throw new Error('denied'); }}}); });
  const cp2 = await ev(p4, () => __z.Z.dbg.copyReport());
  const bx = await ev(p4, () => ({how: null, box: !document.getElementById('zd-out').hidden && document.getElementById('zd-out').value.includes('=== JSON ==='), msg: document.getElementById('zd-msg').textContent}));
  ok((cp2.how === '' && bx.box && /saved/.test(bx.msg)) || cp2.how === 'clipboard', 'Debug report: with the clipboard refused it is still saved, and the text is in the box to copy by hand (or the fallback copy worked)');
  const own = e4.filter(x => !/late boom|rejected boom|debug test error/.test(x));
  ok(!own.length, 'Debug report: no unexpected errors' + (own.length ? '\n  ' + own.join('\n  ') : ''));
  await p4.close();

  // ---- a checkout that never made the stamp (version.js is generated and git-ignored) still boots and plays, and the report says "unknown" ----
  const e5 = [], bak = VFILE + '.off'; let nf = null;
  fs.renameSync(VFILE, bak);
  try {
    const p5 = await dpage('?debug=1', e5); await play(p5);
    nf = await ev(p5, async () => { const r = await __z.Z.dbg.report(), d = JSON.parse(r.text.slice(r.text.indexOf('=== JSON ===') + 12)); return {hash: d.version.hash, stamp: d.version.stamp, behind: d.version.stampBehind, head: r.text.split('\n').find(l => /^Build /.test(l)), up: __z.G.on && !!__z.api.player, panel: !!document.getElementById('zdbg')}; });
    await p5.close();
  } finally { fs.renameSync(bak, VFILE); }
  ok(nf && nf.up && nf.panel && nf.hash === 'unknown' && /run node tools\/version\.mjs/.test(nf.stamp) && nf.behind === null && /^Build unknown \(run node tools\/version\.mjs\)/.test(nf.head) && !e5.length,
    `Debug without the stamp file: the game boots and plays, the report says "${nf?.head}"` + (e5.length ? '\n  ' + e5.join('\n  ') : ''));

  // ---- the radio and the guide have no voice: no speechSynthesis anywhere in the game's code ----
  const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(dir + '/' + e.name)) : /\.(m?js|html|css|json)$/.test(e.name) ? [dir + '/' + e.name] : []);
  const {fileURLToPath} = await import('node:url');
  const hits = ['games', 'engine'].flatMap(dn => walk(fileURLToPath(new URL('../' + dn, import.meta.url)))).filter(f => /speechSynthesis|SpeechSynthesis|getVoices|\.speak\(/.test(fs.readFileSync(f, 'utf8')));
  ok(!hits.length, 'Speech is gone: no speechSynthesis, utterance or voice lookup in games/ or engine/' + (hits.length ? '\n  ' + hits.join('\n  ') : ''));
}

/* ---------- craft types (ztypes.js, zplane.js, ztypeui.js): the Dart is the default and stays what it was (tools/flight-golden.mjs holds its flight); the Plane is a fixed-wing: fast cruise,
   bank to turn, a minimum speed below which it sinks (no hover), a pull-up limit, catapult launch, a low pass to land and recharge. The picker and the saved choice, each pilot's model in co-op,
   bots flying each type, and nothing left behind. A new type is one table entry, a model builder and a controller; the checks that can loop over the table do ---------- */
if (want('types')) {
  const TURL = origin + '/games/interceptor/', terrs = [], kmh = v => Math.round(v * 3.6);
  /* a page on a save (zty: the saved craft choice, undefined = none saved), its helpers in place */
  const inject = async q => {
    await q.waitForFunction(() => window.__z, {timeout: 60000}); await frames(q, 5); await drawFrames(q);
    await q.evaluate(() => {
      window.__tk = {thr: 0, yaw: 0, pit: 0, rol: 0};  /* scripted sticks through the game's own input path (Z.botIn): __script(true), then __run(sec, {thr, yaw, pit, rol}) steps the sim and samples the craft */
      window.__script = on => { if (on) __z.Z.botIn = () => __tk; else delete __z.Z.botIn; };
      window.__run = (sec, k, every = .5) => { Object.assign(__tk, {thr: 0, yaw: 0, pit: 0, rol: 0}, k); const me = __z.api.player, o = [];
        for (let i = 0; i < sec / every; i++) { __z.sim(every); const I = me.cx?.info(); o.push({y: me.p.y, ias: I ? I.ias : me.v.length(), gs: Math.hypot(me.v.x, me.v.z), vy: me.v.y, hd: me.cx?.hd ?? 0, n: I?.n ?? 1, stall: I?.stall ?? 0, mode: I?.mode ?? '', dead: me.dead}); } return o; };
      window.__quiet = () => { const {api, G} = __z; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; G.wq.length = 0; G.wq.push({k: 'shahed', at: 1e9, brg: 0}); };  /* no raid, and the wave does not end */
      window.__turn = a => { let s = 0; for (let i = 1; i < a.length; i++) { let d = a[i].hd - a[i - 1].hd; d = Math.atan2(Math.sin(d), Math.cos(d)); s += d; } return s * 180 / Math.PI; };  /* degrees turned over the samples */
    });
  };
  const tpage = async (zty, errs = terrs, x = {}) => {
    const q = await open(browser, TURL, errs);
    await q.evaluate((z, x) => { sessionStorage.setItem('zbossRoster', '0'); sessionStorage.setItem('zonb', '0'); localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zdiff: 1, zmus: 0, ...(z === undefined ? {} : {zty: z}), ...x})); }, zty, x);
    await q.reload({waitUntil: 'load'}); await inject(q); return q;
  };
  const on = q => q.evaluate(() => [...document.querySelectorAll('#zcraft .zcr.on')].map(b => b.dataset.zty).join());

  // ---------- the table, and saved values that are not what the picker saves ----------
  {
    const p = await tpage(undefined);
    const T = await p.evaluate(async () => { const m = await import('/games/interceptor/ztypes.js');
      return {order: m.ORDER.join(), clean: [undefined, null, 'plane', 7, {id: 'plane'}, {v: 1, id: 'plane'}, {v: 9, id: 'plane'}, {v: 1, id: 'jet'}, 'toString', {id: '__proto__'}, {id: ['plane']}].map(x => m.cleanSave(x).id).join(), v: m.cleanSave().v,
        shape: m.ORDER.every(id => { const t = m.TYPES[id]; return t.id === id && t.name && t.call && t.blurb && t.facts.length && t.cam.off.length === 3 && 'buildModel' in t && 'make' in t && 'bot' in t && Array.isArray(t.hud); }), dartPlain: !m.TYPES.dart.buildModel && !m.TYPES.dart.make && !m.TYPES.dart.bot}; });
    ok(T.order === 'dart,plane' && T.shape && T.dartPlain, `Types: the table lists ${T.order} (the Dart first and plain: it flies in interceptor.js; every entry has its name, call sign, facts, camera, model, controller and bot slots)`);
    ok(T.clean === 'dart,dart,plane,dart,plane,plane,plane,dart,dart,dart,dart' && T.v === 1, `Types: a missing, odd or unknown saved choice reads as the Dart, a known id as itself, the version is ${T.v} (${T.clean})`);
    await p.close();
    const bad = [];
    for (const [z, want] of [[undefined, 'dart'], ['x', 'dart'], [7, 'dart'], [{v: 1, id: {}}, 'dart'], [{v: 5, id: 'zzz'}, 'dart'], [{v: 1, id: 'plane'}, 'plane']]) {
      const n0 = terrs.length, q = await tpage(z), r = await q.evaluate(() => ({pick: __z.Z.craft.pick(), save: JSON.stringify(__z.api.S.zty), n: document.querySelectorAll('#zcraft .zcr').length}));
      r.on = await on(q); await play(q); r.ty = await q.evaluate(() => { __z.sim(2); return __z.api.player.ty; });
      if (r.pick !== want || r.ty !== want || r.on !== want || r.n !== 2 || r.save !== JSON.stringify({v: 1, id: want}) || terrs.length > n0) bad.push(JSON.stringify(z) + ' -> ' + JSON.stringify(r));
      await q.close();
    }
    ok(!bad.length, 'Types: odd saved choices boot to a working picker and launch the right craft' + (bad.length ? '\n  ' + bad.join('\n  ') + '\n  ' + terrs.slice(0, 3).join('\n  ') : ''));
  }

  // ---------- the picker (start card and base screen), the saved choice, applied at the next launch ----------
  let p = await tpage(undefined);
  {
    const c0 = await p.evaluate(() => ({n: document.querySelectorAll('#zcraft [data-zty]').length, pressed: document.querySelectorAll('#zcraft [aria-pressed="true"]').length, text: document.getElementById('zcraft').textContent, saved: JSON.parse(localStorage.getItem('dl-interceptor')).zty}));
    ok(c0.n === 2 && await on(p) === 'dart' && c0.pressed === 1 && /Dart/.test(c0.text) && /Plane/.test(c0.text) && c0.saved.id === 'dart', 'Types picker: the start card has a card per type with the Dart chosen by default (aria-pressed on one)');
    await p.click('#zcraft [data-zty="plane"]');
    const c1 = await p.evaluate(() => ({saved: JSON.parse(localStorage.getItem('dl-interceptor')).zty, pick: __z.Z.craft.pick(), facts: document.querySelector('#zcraft [data-zty="plane"] ul').textContent}));
    ok(await on(p) === 'plane' && c1.saved.id === 'plane' && c1.saved.v === 1 && c1.pick === 'plane' && /Minimum speed \d+ km\/h/.test(c1.facts) && /Pull-up limit/.test(c1.facts), `Types picker: choosing the Plane highlights it and saves {v:1, id:"plane"} (card facts: ${c1.facts.slice(0, 70)}...)`);
    await p.reload({waitUntil: 'load'}); await inject(p);
    ok(await on(p) === 'plane', 'Types picker: the choice is still there after a reload');
    await play(p);
    const b0 = await p.evaluate(() => { const me = __z.api.player; return {ty: me.ty, cx: !!me.cx, tag: me.mesh.userData.ty, props: me.props.length, base: __z.G.state, cards: document.querySelectorAll('#zbase [data-zty]').length, on: [...document.querySelectorAll('#zbase .zcr.on')].map(b => b.dataset.zty).join(), head: document.querySelector('#zbase #zsec-craft h3')?.textContent || ''}; });  /* the picker is the Shop's Craft section now */
    ok(b0.ty === 'plane' && b0.cx && b0.tag === 'plane' && b0.props === 1 && b0.base === 'base', `Types: a run opens with the chosen craft (${b0.ty}: its own model with ${b0.props} prop, its own flight controller)`);
    ok(b0.cards === 2 && b0.on === 'plane' && /Craft/.test(b0.head), 'Types picker: the base screen has the same cards at the top of the Shop, the Plane on');
    if (SHOTS) { await drawFrames(p, 2); await p.screenshot({path: SHOTS + '/types-base.png'}); }
    await p.click('#zbase [data-zty="dart"]');
    const b1 = await p.evaluate(() => ({ty: __z.api.player.ty, saved: JSON.parse(localStorage.getItem('dl-interceptor')).zty.id, on: [...document.querySelectorAll('#zbase .zcr.on')].map(b => b.dataset.zty).join()}));
    ok(b1.ty === 'plane' && b1.saved === 'dart' && b1.on === 'dart', 'Types picker: a pick on the base screen is saved at once and waits for the next launch (the craft on the mat is still the Plane)');
    await p.click('#zgo'); await p.waitForFunction(() => __z.G.state === 'wave', {timeout: 10000});
    const b2 = await p.evaluate(() => { const me = __z.api.player; return {ty: me.ty, cx: me.cx, tag: me.mesh.userData.ty, props: me.props.length, models: Object.keys(me.M || {}).join()}; });
    ok(b2.ty === 'dart' && b2.cx === null && b2.tag === 'dart' && b2.props === 4, `Types: the wave start launches the new pick (${b2.ty}, ${b2.props} props, no fixed-wing controller); both models are kept for the next switch (${b2.models})`);
  }

  // ---------- the Dart still hovers; the Plane cannot ----------
  {
    await p.evaluate(() => { __script(true); __quiet(); const me = __z.api.player; me.p.y += 150; me.gt = 0; });
    const h = await p.evaluate(() => { const me = __z.api.player, y0 = me.p.y; const a = __run(6, {thr: __z.api.HOV}, .25); return {dy: me.p.y - y0, speed: Math.max(...a.map(x => x.gs)), ty: me.ty}; });
    ok(h.ty === 'dart' && Math.abs(h.dy) < 12 && h.speed < 8, `Dart: at the hover stick it holds its place in the air (${h.dy.toFixed(1)} m of height change and ${h.speed.toFixed(1)} m/s over 6 s)`);
    await p.evaluate(() => { __script(false); __z.Z.craft.set('plane'); __z.api.relaunch(); });
    const r0 = await p.evaluate(() => { const me = __z.api.player; return {ty: me.ty, mode: me.cx.info().mode, dead: me.dead}; });
    ok(r0.ty === 'plane' && r0.mode === 'pad', `Types: a relaunch applies the pick too (${r0.ty} on the pad, mode ${r0.mode})`);
  }

  // ---------- the Plane: catapult, cruise, bank, pull-up limit, top speed, minimum speed ----------
  {
    await p.evaluate(() => { __script(true); __quiet(); });
    const g0 = await p.evaluate(() => { const a = __run(2, {thr: 0}); return {modes: [...new Set(a.map(x => x.mode))].join(), ias: Math.max(...a.map(x => x.ias))}; });
    ok(g0.modes === 'pad' && g0.ias === 0, 'Plane: with no throttle it waits on the pad (nothing moves)');
    const t0 = await p.evaluate(() => { const me = __z.api.player, y0 = me.p.y; const a = __run(8, {thr: 1}, .25); const f = a.findIndex(x => x.mode === 'fly'); return {modes: [...new Set(a.map(x => x.mode))].join('>'), tFly: f < 0 ? -1 : (f + 1) * .25, ias: a[Math.max(f, 0)].ias, dy: me.p.y - y0, dead: me.dead}; });
    ok(t0.modes === 'cat>fly' && t0.tFly > 0 && t0.tFly <= 4 && t0.ias >= 45 && t0.dy > 20 && !t0.dead, `Plane: throttle up fires the catapult (airborne after ${t0.tFly} s at ${t0.ias.toFixed(0)} m/s, ${t0.dy.toFixed(0)} m up after 8 s)`);
    await p.evaluate(() => { __z.api.player.p.y += 800; });  /* clear of the hills for the rest of the flight checks */
    const c = await p.evaluate(() => { const a = __run(16, {thr: __z.api.HOV}).slice(10); return {lo: Math.min(...a.map(x => x.ias)), hi: Math.max(...a.map(x => x.ias)), vy: Math.abs(a.at(-1).vy)}; });
    ok(c.lo > 56 && c.hi < 68 && c.vy < 6, `Plane: the throttle stick at rest holds cruise (${kmh(c.lo)}-${kmh(c.hi)} km/h, level to within ${c.vy.toFixed(1)} m/s of climb)`);
    const b = await p.evaluate(() => { const a = __run(6, {thr: __z.api.HOV, rol: 1}, .25); return {turn: __turn(a), n: Math.max(...a.map(x => x.n)), dy: a.at(-1).y - a[0].y, ias: a.at(-1).ias}; });
    ok(b.turn > 45 && b.turn < 150 && b.n < 2.65 && Math.abs(b.dy) < 70, `Plane: full right stick banks and turns (${b.turn.toFixed(0)}° in 6 s, ${b.n.toFixed(2)} g, ${b.dy.toFixed(0)} m of height change): wide turns, no spinning on the spot`);
    await p.evaluate(() => __run(8, {thr: __z.api.HOV}));
    const pu = await p.evaluate(() => { const a = __run(3, {thr: __z.api.HOV, pit: -1}, .25); return {n: Math.max(...a.map(x => x.n)), vy: Math.max(...a.map(x => x.vy))}; });
    ok(pu.n > 1.8 && pu.n < 2.62 && pu.vy > 15, `Plane: full back stick pulls up at the limit and no harder (${pu.n.toFixed(2)} g, climbing ${pu.vy.toFixed(0)} m/s)`);
    await p.evaluate(() => __run(10, {thr: __z.api.HOV}));
    const f = await p.evaluate(() => { const a = __run(45, {thr: 1}, 1); return {top: Math.max(...a.map(x => x.ias)), dead: __z.api.player.dead}; });
    ok(f.top > 98 && f.top < 125 && !f.dead, `Plane: full throttle level tops out at ${kmh(f.top)} km/h (the flat-out speed on its card is the same)`);
    await p.evaluate(() => __run(10, {thr: __z.api.HOV}));
    const s = await p.evaluate(() => { const me = __z.api.player; me.v.multiplyScalar(.5); const y0 = me.p.y, a = __run(40, {thr: 0}, .25); return {ias: Math.min(...a.map(x => x.ias)), stall: Math.max(...a.map(x => x.stall)), up: Math.max(...a.map(x => x.y)) - y0, down: y0 - a.at(-1).y, gs: Math.min(...a.map(x => x.gs)), dead: me.dead}; });
    ok(s.stall >= .5 && s.ias < 31.5 && s.up < 40 && s.down > 100 && s.gs > 10 && !s.dead, `Plane: with no thrust it slows to its minimum speed (${kmh(s.ias)} km/h), the nose drops and it sinks (${s.down.toFixed(0)} m lower after 40 s, never above ${Math.max(0, s.up).toFixed(0)} m): it cannot hover (slowest ground speed ${s.gs.toFixed(0)} m/s)`);
    await p.evaluate(() => { const me = __z.api.player, u = me.v.clone().setY(0).normalize(); me.p.y += 600; me.v.copy(u).multiplyScalar(20); });
    const sk = await p.evaluate(() => { const a = __run(3, {thr: 0}, .25); return {vy: a.at(-1).vy, stall: a.at(-1).stall}; });
    ok(sk.vy < -3 && sk.stall > 0, `Plane: below its minimum speed the wing lets go (20 m/s: sinking ${(-sk.vy).toFixed(1)} m/s, stall ${sk.stall.toFixed(2)})`);
    /* the craft's own HUD panel: airspeed and minimum speed in its own elements; the Dart has none */
    const hud = await p.evaluate(() => { const me = __z.api.player; __run(8, {thr: __z.api.HOV}); __z.Z.hud(.016); const e = document.getElementById('zty'); return {shown: !e.hidden, text: e.textContent, tape: !e.querySelector('.zttape').hidden, mark: e.querySelector('.ztmark').style.left}; });
    ok(hud.shown && /AIRSPEED/.test(hud.text) && /MIN SPEED/.test(hud.text) && /km\/h/.test(hud.text) && hud.tape && parseFloat(hud.mark) > 0, `Plane: the HUD panel shows the airspeed and the minimum speed with a bar ("${hud.text.replace(/\s+/g, ' ').slice(0, 60)}")`);
    if (SHOTS) { await p.evaluate(() => { __script(false); __z.api.camMode = 1; }); await drawFrames(p, 2); await p.screenshot({path: SHOTS + '/types-plane-chase.png'}); await p.evaluate(() => { __script(true); __z.api.camMode = 0; }); }
  }

  // ---------- bursts and kills, the pip and the lock: the same for both types ----------
  {
    const kill = async ty => {
      await p.evaluate(ty => { __script(false); __z.Z.craft.set(ty); __z.api.relaunch(); __script(true); __quiet(); }, ty);
      await p.evaluate(() => __run(6, {thr: 1}));
      return p.evaluate(() => { const {api, G} = __z, me = api.player, t = __z.make('shahed', me.p.x + 300, me.p.z - 300), k0 = G.kills.p; t.p.set(me.p.x + 400, me.p.y + 20, me.p.z - 400);
        const kind = __z.botKill(.8); __z.sim(.1); return {ty: me.ty, kind, kills: G.kills.p - k0, dead: me.dead > 0, live: api.live(t)}; });
    };
    for (const ty of ['dart', 'plane']) {
      const k = await kill(ty);
      ok(k.ty === ty && k.kind === 'shahed' && k.kills === 1 && k.dead && !k.live, `${ty === 'dart' ? 'Dart' : 'Plane'}: a burst on a track kills it and costs the interceptor (kills +${k.kills})`);
      const rl = await p.evaluate(() => { __tk.thr = 0; __z.sim(4); const me = __z.api.player; return {ty: me.ty, dead: me.dead, mode: me.cx?.info().mode ?? 'mat'}; });
      ok(rl.ty === ty && rl.dead <= 0 && (ty === 'dart' || rl.mode === 'pad'), `${ty === 'dart' ? 'Dart' : 'Plane'}: the next interceptor is the same type, back on its mat (${rl.mode})`);
    }
    /* the proximity fuse (the Fuse perk): a pass within 7.5 m of a track bursts the warhead with nobody pressing anything */
    await p.evaluate(() => { __script(true); __quiet(); __z.G.perks.fuse = 1; });
    await p.evaluate(() => __run(5, {thr: 1}));
    const fz = await p.evaluate(() => { const {api, G} = __z, me = api.player; me.p.y += 800; __run(4, {thr: api.HOV}); const u = me.v.clone().normalize(), side = new api.THREE.Vector3(-u.z, 0, u.x).normalize();
      const t = __z.make('shahed', 0, 0), P = me.p.clone().addScaledVector(u, me.v.length() * 2.5).addScaledVector(side, 2.5); t.wps.length = 0; let d0 = me.dead, i = 0;
      for (; i < 600 && me.dead <= 0; i++) { t.p.copy(P); t.v.set(0, 0, 0); api.step(1 / 120); }
      delete G.perks.fuse; return {burst: me.dead > 0 && G.detFlag, i, ty: me.ty}; });
    ok(fz.ty === 'plane' && fz.burst, `Plane: the proximity fuse bursts the warhead at a fly-by 2.5 m off a track (${fz.i} steps in), nothing pressed`);
    await p.evaluate(() => { __z.sim(4); __quiet(); });
    /* the lock: a track dead ahead in the sights locks, and the pip (the intercept point) is solved */
    const lk = await p.evaluate(() => { const {api, Z} = __z, me = api.player; __run(5, {thr: 1}); me.p.y += 800; __run(4, {thr: api.HOV}); Z.lk.clear(); const t = __z.make('shahed', 0, 0); t.wps.length = 0; t.spd = 0; let s = 0, tti = 0, ip = null;
      for (let i = 0; i < 80 && !s; i++) { const u = me.v.clone().normalize(); t.p.copy(me.p).addScaledVector(u, 700); t.v.copy(u).multiplyScalar(40); __z.sim(.1); if (Z.lk.t === t) s = (i + 1) / 10; }
      if (s) { tti = Z.lk.L.tti; ip = Z.lk.L.ip.distanceTo(me.p); } return {s, tti, ip, ty: me.ty}; });
    ok(lk.ty === 'plane' && lk.s > 0 && lk.s < 8 && lk.tti > 0 && lk.ip > 200 && lk.ip < 3000, `Plane: a track held in the sights locks in ${lk.s} s and the pip is solved (${lk.ip?.toFixed(0)} m ahead, ${lk.tti?.toFixed(1)} s to go)`);
    await p.evaluate(() => { __script(false); __z.Z.lk.clear(); });
  }

  // ---------- nothing left behind: models are built once, a wave end and many switches leave the scene and the GPU memory where they were ----------
  {
    await p.evaluate(() => { __script(false); __quiet(); });
    const snap = async () => { await drawFrames(p, 2); return p.evaluate(() => { const {api} = __z, i = api.renderer.info.memory; return {kids: api.scene.children.length, geo: i.geometries, tex: i.textures, models: Object.keys(api.player.M || {}).length, th: api.TH.length}; }); };
    const cycle = async () => {
      for (const ty of ['plane', 'dart', 'plane', 'dart']) { await p.evaluate(ty => { __z.Z.craft.set(ty); __z.api.relaunch(); __z.sim(1); }, ty); await drawFrames(p, 2); }
      await p.evaluate(() => { const {api, G} = __z; __z.Z.craft.set('plane'); for (const t of api.TH.filter(api.live)) { t.by = 'p'; api.killThreat(t, true); } G.wq.length = 0; let n = 0; while (G.state === 'wave' && n++ < 200) __z.sim(.5); __z.sim(5); });  /* a wave end: every track down, the base screen back */
      const st = await p.evaluate(() => { const {G} = __z; if (G.state === 'base') { __z.cont(); __z.sim(3); __quiet(); } return G.state; });
      return {st, ...await snap()};
    };
    const c1 = await cycle(), c2 = await cycle(), c3 = await cycle();  /* the first cycle builds both models and wakes lazily made things (an effect pool); the next two must change nothing */
    ok(c1.models === 2 && c3.kids === c2.kids && c3.geo === c2.geo && c3.tex === c2.tex && c2.geo - c1.geo <= 2 && c2.kids === c1.kids, `Types: switching type, relaunching and ending waves leaves the scene and the GPU as they were (scene children ${c1.kids}/${c2.kids}/${c3.kids}, geometries ${c1.geo}/${c2.geo}/${c3.geo}, textures ${c1.tex}/${c2.tex}/${c3.tex}; ${c1.models} models kept)`);
  }

  // ---------- the guide and the radio name the craft ----------
  {
    const g = await p.evaluate(() => { const C = __z.Z.craft, r = {}; C.set('plane'); r.call = C.call(); r.fly = C.guide('fly', false); r.flyPad = C.guide('fly', true); r.say = C.say('fly'); r.look = C.guide('look', false); C.set('dart'); r.dFly = C.guide('fly', false); r.dSay = C.say('fly'); r.dCall = C.call(); return r; });
    ok(g.call === 'Plane One' && /catapult/i.test(g.fly) && /minimum/i.test(g.fly) && /catapult/i.test(g.flyPad) && /Plane One/.test(g.say) && /view/i.test(g.look), `Guide: the Plane's first-wave steps are its own ("${g.fly.replace(/<[^>]+>/g, '').slice(0, 60)}...", call sign ${g.call})`);
    ok(g.dFly === null && g.dSay === null && g.dCall === 'Dart One', 'Guide: the Dart keeps the original steps and call sign (no override)');
    const rd = async ty => p.evaluate(ty => { const {api, G, Z} = __z; Z.craft.set(ty); __quiet(); for (const t of api.TH.filter(api.live)) { t.by = 'p'; api.killThreat(t, true); } G.wq.length = 0; let n = 0; while (G.state === 'wave' && n++ < 200) __z.sim(.5); __z.sim(5);
      Z.radio.calls.length = 0; if (G.state === 'base') __z.cont(); __z.sim(15); return Z.radio.calls.filter(c => c.topic === 'craft').map(c => c.who + ': ' + c.txt); }, ty);
    const rp = await rd('plane'), rdt = await rd('dart');
    ok(rp.length >= 1 && /Plane One/.test(rp[0]) && /catapult/i.test(rp[0]), `Radio: the wave start names the Plane ("${rp[0]}")`);
    ok(rdt.length === 0, 'Radio: the Dart gets no extra call (its lines are the radio\'s own)');
  }
  await p.close();

  // ---------- bots fly each type: your pick when you watch one, the Dart for the benchmark, a real run to wave 8 on Normal, landing to recharge ----------
  {
    const berrs = [];
    const wp = await tpage({v: 1, id: 'plane'}, berrs);
    await wp.evaluate(() => { document.getElementById('zspc').open = true; });
    await wp.click('[data-zsl="Pro"]'); await wp.click('[data-zsd="1"]'); await wp.click('#zspgo');
    await wp.waitForFunction(() => __z.spec.on && __z.G.state === 'base', {timeout: 30000});
    const w0 = await wp.evaluate(() => ({ty: __z.api.player.ty, cur: __z.Z.craft.cur(), pick: __z.Z.craft.pick(), note: document.querySelector('#zcraft small')?.textContent || ''}));
    ok(w0.ty === 'plane' && w0.cur === 'plane', `Bots: Watch a bot flies your pick (${w0.ty}); the picker says so while it runs ("${w0.note}")`);

    const w1 = await wp.evaluate(() => { const {api, spec, Z} = __z; api.startDemo(); spec.bench.start('Pro', 1); const r = {ty: api.player.ty, cur: Z.craft.cur(), note: document.querySelector('#zcraft small')?.textContent || ''}; spec.stop(); r.after = Z.craft.cur(); return r; });
    ok(w1.ty === 'dart' && w1.cur === 'dart' && w1.after === 'plane', `Bots: the benchmark flies the Dart whatever you picked (${w1.ty}), and your pick is back when it stops (${w1.after})`);
    await wp.close();

    const bp = await tpage(undefined, berrs);
    await bp.evaluate(() => __z.spec.bench.start('Pro', 1, {ty: 'plane'}));
    await bp.waitForFunction(() => __z.G.state === 'base', {timeout: 60000});
    const r8 = await bp.evaluate(() => { const {G, api, Z, spec} = __z; let top = 0, guard = 0; const z0 = Z.step; Z.step = dt => { z0(dt); const me = api.player; if (me && me.dead <= 0) top = Math.max(top, me.p.y - api.gh(me.p.x, me.p.z)); };
      while (G.wave < 8 && G.state !== 'over' && guard++ < 40) { spec.bench.shop(); if (G.state === 'base') __z.cont(); spec.bench.wave(); }
      const s = spec.sp.stats; Z.step = z0; return {wave: G.wave, over: G.state === 'over', ty: api.player.ty, simT: Math.round(s.simT), bursts: s.bursts, kills: s.kills.pilot?.n | 0, lost: JSON.stringify(s.deaths), top: Math.round(top), used: api.spent | 0}; });
    console.log('  plane bot, Pro on Normal:', JSON.stringify(r8));
    ok(r8.wave >= 8 && !r8.over && r8.ty === 'plane' && r8.simT > 300 && r8.top > 40, `Bots: a Pro bot flying the Plane reaches wave ${r8.wave} on Normal (${r8.simT} s in the air up to ${r8.top} m, ${r8.kills} kills, ${r8.used} interceptors)`);
    /* a pack running low: it comes home, lines up on the pad, the flare settles it, the pack charges, the catapult throws it out again. The bot's landing is good for most
       approaches, not all (a tree line it cannot see in time, a pack that was too far gone): one more try is allowed, as a player would */
    const ld = await bp.evaluate(() => { const {api, G} = __z; let res = null;
      for (let att = 1; att <= 2; att++) { __quiet(); G.state === 'base' && __z.cont(); api.relaunch(); __quiet(); __z.sim(12); const me = api.player; me.mah = api.BCAP * .905;
        const seq = [], P = me.cx; let mahPad = -1, dead = 0, flare = 0;
        for (let i = 0; i < 4 * 200; i++) { __z.sim(.25); const I = P.info(); if (me.dead > 0) dead++; if (I.flare) flare++; if (seq.at(-1) !== I.mode) seq.push(I.mode); if (I.mode !== 'chg' && mahPad < 0 && seq.includes('chg')) mahPad = me.mah; if (/chg>(pad>)?cat>fly$/.test(seq.join('>'))) break; }
        res = {seq: seq.join('>'), mahPad: Math.round(mahPad), dead, flare, landed: P.landed, att}; if (/roll>chg>(pad>)?cat>fly$/.test(res.seq) && !dead) break; }
      return res; });
    ok(/roll>chg>(pad>)?cat>fly$/.test(ld.seq) && ld.mahPad >= 0 && ld.mahPad < 400 && ld.flare > 0 && ld.landed >= 1 && !ld.dead, `Bots: a low pack brings the Plane home: flare, roll-out, taxi and recharge (pack ${ld.mahPad} mAh used when it is ready), then the catapult again (${ld.seq}, try ${ld.att})`);
    const rl = await bp.evaluate(() => { const {api} = __z, s0 = api.spent; __z.sim(8); const mode0 = api.player.cx.info().mode; api.relaunch(); const I = api.player.cx.info(); return {mode0, mode: I.mode, spent: api.spent - s0, ias: I.ias}; });
    ok(rl.mode0 === 'fly' && rl.mode === 'pad' && rl.ias === 0 && rl.spent === 1, `Plane: R from the air puts a fresh one on the pad (was ${rl.mode0}, now ${rl.mode} at ${rl.ias} m/s; ${rl.spent} interceptor counted)`);
    ok(!berrs.length, 'Bots, types: no errors' + (berrs.length ? '\n  ' + berrs.slice(0, 5).join('\n  ') : ''));
    await bp.close();
  }

  // ---------- co-op: each pilot flies their own type and the others see the right model ----------
  {
    const cerrs = [], CU = origin + '/games/interceptor/?mode=zombies&netloop=40';
    const cpage = async (name, zty) => { const q = await open(browser, CU, cerrs, {page: await newWindow(browser, {noRender: !SHOTS})});
      await q.evaluate(z => { sessionStorage.setItem('zbossRoster', '0'); sessionStorage.setItem('zonb', '0'); localStorage.setItem('dl-interceptor', JSON.stringify({...JSON.parse(localStorage.getItem('dl-interceptor') || '{}'), gmode: 'z', wx: 'clear', zwx: 'menu', zdiff: 1, zty: z})); }, zty);
      await q.reload({waitUntil: 'load'}); await q.waitForFunction(() => window.__z && window.__z.net, {timeout: 60000}); await q.$eval('#zname', (e, n) => { e.value = n; }, name); return q; };
    const cuntil = (q, fn, arg) => q.waitForFunction(fn, {timeout: 60000, polling: 50}, arg).then(() => true, () => false);
    const H = await cpage('Hosty', {v: 1, id: 'dart'}), C = await cpage('Ash', {v: 1, id: 'plane'});
    await H.click('#zhost');
    ok(await cuntil(H, () => __z.G.on && __z.G.state === 'base' && __z.net.n?.code), 'Types, co-op: the host is up on the base screen');
    const code = await H.evaluate(() => __z.net.n.code);
    await C.$eval('#zcode', (e, c) => { e.value = c; }, code); await C.click('#zjoin');
    ok(await cuntil(C, () => __z.G.on && __z.G.state === 'base' && __z.net.rows().length === 2 && !document.getElementById('zbase').hidden), 'Types, co-op: the client joined');
    const own = await Promise.all([H, C].map(q => q.evaluate(() => ({pick: __z.Z.craft.pick(), ty: __z.api.player.ty, online: !!__z.Z.online, head: document.querySelector('#zbase #zsec-craft h3')?.textContent || ''}))));  /* the Craft section's heading */
    ok(own[0].ty === 'dart' && own[1].ty === 'plane' && /each pilot picks their own/.test(own[0].head), `Types, co-op: each pilot has their own pick (host ${own[0].ty}, client ${own[1].ty}); the base screen says each pilot picks`);
    for (const q of [H, C]) await q.evaluate(() => document.querySelector('#zgo').click());
    ok(await cuntil(H, () => __z.G.state === 'wave') && await cuntil(C, () => __z.G.state === 'wave'), 'Types, co-op: wave 1 started on both screens');
    const others = q => q.evaluate(() => [...__z.net.n.pil.values()].map(r => ({ty: r.d.ty, tag: r.d.mesh.userData.ty, props: r.d.props.length, inScene: r.d.mesh.parent === __z.api.scene})));
    ok(await cuntil(H, () => [...__z.net.n.pil.values()].some(r => r.d.ty === 'plane')), 'Types, co-op: the host sees the client as a Plane');
    ok(await cuntil(C, () => __z.net.n.pil.size > 0 && [...__z.net.n.pil.values()].every(r => r.d.ty === 'dart')), 'Types, co-op: the client sees the host as a Dart');
    const oh = await others(H), oc = await others(C);
    ok(oh.length === 1 && oh[0].tag === 'plane' && oh[0].props === 1 && oh[0].inScene && oc.length === 1 && oc[0].tag === 'dart' && oc[0].props === 4 && oc[0].inScene, `Types, co-op: the models are the right ones on each screen (host sees ${JSON.stringify(oh[0])}, client sees ${JSON.stringify(oc[0])})`);
    /* the client changes type at a relaunch: the host's copy of them follows, and back again */
    for (const [ty, tag] of [['dart', 'dart'], ['plane', 'plane']]) {
      await C.evaluate(ty => { __z.Z.craft.set(ty); __z.api.relaunch(); }, ty);
      ok(await cuntil(H, ty => [...__z.net.n.pil.values()].some(r => r.d.ty === ty && r.d.mesh.userData.ty === ty), ty), `Types, co-op: the client relaunches as a ${tag} and the host's copy of them changes model`);
    }
    ok(!cerrs.length, 'Types, co-op: no errors' + (cerrs.length ? '\n  ' + cerrs.slice(0, 5).join('\n  ') : ''));
    await H.close(); await C.close();
  }
  ok(!terrs.length, 'Types: no errors' + (terrs.length ? '\n  ' + terrs.slice(0, 5).join('\n  ') : ''));
}

// ---------- layout (zhome.js, zbase.js): the two reworked screens keep their contract at a laptop, a 1080p screen and a short window ----------
// Start page: ONE big Start button above the fold, every module's card in the #zcards grid (equal cards, the DOM order is the visual order and so the focus order,
// a fold-out opens across the row), nothing wider than the window. Base screen: a header (cash, next wave's upkeep, integrity, the wave) and a footer (Undo, Start
// wave) that never leave the screen, the Shop in sections with counts, a row per item with its one action and "need $X more" when it is out of reach, a detail pane,
// owned things marked, Undo in the footer (and on U).
if (want('layout')) {
  const {p, errs} = await page();
  const SIZES = [[1280, 720], [1920, 1080], [900, 420]], CARDS = ['zcpm', 'zendc', 'zcdxm', 'zspc', 'zmeta', 'zboard', 'zcraft', 'zmp'];
  const rect = `const R = e => { const b = e.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height}; };`;
  /* ---- the start page ---- */
  for (const [w, h] of SIZES) {
    await p.setViewport({width: w, height: h}); await frames(p, 3);
    const m = await p.evaluate(`(() => { ${rect}
      const grid = document.getElementById('zcards'), cards = [...grid.children], play = document.getElementById('play'), pr = R(play), panel = document.getElementById('panel');
      const others = [...document.querySelectorAll('#zhero button')].filter(b => b !== play && b.offsetParent).map(b => R(b).w * R(b).h);
      const rows = {}; for (const c of cards) { const r = R(c); (rows[Math.round(r.t / 6)] ||= []).push(r); }
      const launch = ['zcpm', 'zendc', 'zcdxm', 'zspc', 'zmeta', 'zboard'].map(id => R(document.getElementById(id)));
      return {ids: cards.map(c => c.id), allCards: cards.every(c => c.classList.contains('zhc')), stray: document.querySelectorAll('.zhc').length - cards.length,
        play: pr, fs: parseFloat(getComputedStyle(play).fontSize), big: pr.w * pr.h > Math.max(0, ...others), wOver: panel.scrollWidth - panel.clientWidth,
        bottom: Math.max(...cards.map(c => R(c).b)), inside: cards.every(c => R(c).l >= R(grid).l - 1 && R(c).r <= R(grid).r + 1), cols: new Set(launch.map(r => Math.round(r.l))).size,
        sameW: Math.max(...launch.map(r => r.w)) - Math.min(...launch.map(r => r.w)), rowH: Object.values(rows).every(L => Math.max(...L.map(r => r.h)) - Math.min(...L.map(r => r.h)) < 1.5),
        faces: cards.map(c => [c.querySelector('.zhc-t')?.textContent.trim(), c.querySelector('.zhc-d')?.textContent.trim(), c.querySelector('.zhc-s')?.textContent.trim()]).every(f => f.every(Boolean)),
        coop: R(document.getElementById('zmp')).w / R(document.getElementById('zcpm')).w, vis: cards.map(c => R(c)).sort((a, b) => Math.round(a.t / 6) - Math.round(b.t / 6) || a.l - b.l).map(r => Math.round(r.l) + ',' + Math.round(r.t)).join(';') === cards.map(c => R(c)).map(r => Math.round(r.l) + ',' + Math.round(r.t)).join(';')};
    })()`);
    const fold = w >= 1000 && h >= 700;  /* a laptop and up: the whole page of cards is above the fold; a short window scrolls */
    ok(m.ids.join() === CARDS.join() && m.allCards && !m.stray, `Start page ${w}x${h}: every module's card is in the grid, in order (${m.ids.join(' ')}), nothing outside it (${m.stray})`);
    ok(m.play.t >= 0 && m.play.b <= h && m.play.l >= 0 && m.play.r <= w && m.big && m.fs >= 18, `Start page ${w}x${h}: ONE big Start button, on screen without scrolling (${Math.round(m.play.w)}x${Math.round(m.play.h)}, ${m.fs}px, the other buttons of the row are smaller)`);
    ok(m.wOver <= 1 && m.inside, `Start page ${w}x${h}: nothing wider than the panel (overflow ${m.wOver}px)`);
    ok(m.faces && m.vis, `Start page ${w}x${h}: each card has a title, a line of what it is and its state; the visual order is the DOM (focus) order`);
    if (fold) ok(m.bottom <= h && m.cols === 3 && m.sameW < 1.5 && m.rowH && m.coop > 1.8, `Start page ${w}x${h}: the whole grid is above the fold (bottom ${Math.round(m.bottom)} of ${h}), ${m.cols} columns of equal cards (width spread ${m.sameW.toFixed(1)}px), co-op takes two`);
    if (SHOTS) await p.screenshot({path: `${SHOTS}/z-layout-start-${w}x${h}.png`});
  }
  await p.setViewport({width: 1280, height: 720}); await frames(p, 2);
  { /* a fold-out opens across the whole row, one at a time */
    await p.evaluate(() => { document.getElementById('zspc').open = true; });
    await p.waitForFunction(() => document.getElementById('zspc').getBoundingClientRect().width > 1000, {timeout: 5000}).catch(() => {});
    const w1 = await p.evaluate(() => document.getElementById('zspc').getBoundingClientRect().width);
    await p.evaluate(() => { document.getElementById('zmeta').open = true; });  /* the toggle event is asynchronous: the first one closes when the second opens */
    await p.waitForFunction(() => !document.getElementById('zspc').open, {timeout: 5000}).catch(() => {});
    const o = await p.evaluate(`(() => { ${rect} const o = {w1: 0, wBoth: R(document.getElementById('zmeta')).w, aOpen: document.getElementById('zspc').open, grid: R(document.getElementById('zcards')).w}; document.getElementById('zmeta').open = false; return o; })()`); o.w1 = w1;
    ok(o.w1 >= o.grid - 2 && o.wBoth >= o.grid - 2 && !o.aOpen, `Start page: a fold-out card opens across the whole row (${Math.round(o.w1)} of ${Math.round(o.grid)}px) and opening another closes it`);
  }
  { /* the gamepad on the start page (Z.menuPad: the engine reads the pad only in a run): the D-pad walks the buttons in the order you see, A presses, B folds a card back */
    const g = await p.evaluate(() => { const Z = __z.Z, press = i => Z.menuPad(n => n === i), at = () => document.activeElement.closest('.zhc')?.id || document.activeElement.id, o = {};
      document.activeElement?.blur?.(); press(13); o.first = at(); document.getElementById('zcpopen').focus(); press(13); o.down = at(); press(15); o.right = at(); press(14); o.left = at();
      document.getElementById('zspc').querySelector('summary').focus(); press(0); return o; });
    await p.waitForFunction(() => document.getElementById('zspc').open, {timeout: 5000}).catch(() => {});
    const o1 = await p.evaluate(() => { const open = document.getElementById('zspc').open; __z.Z.menuPad(n => n === 1); return open; });
    await p.waitForFunction(() => !document.getElementById('zspc').open, {timeout: 5000}).catch(() => {});
    const o2 = await p.evaluate(() => !document.getElementById('zspc').open);
    ok(g.first === 'play' && g.down === 'zspc' && g.right === 'zmeta' && g.left === 'zspc' && o1 && o2, `Start page on a gamepad: the D-pad goes Start -> the cards in order (${g.first}, down ${g.down}, right ${g.right}, left ${g.left}), A opens a fold-out (${o1}), B folds it back (${o2})`);
  }
  /* ---- the base screen ---- */
  await play(p);
  await p.evaluate(() => { const {G, Z} = __z; G.cash = 1500; Z.base.refresh(); });
  for (const [w, h] of SIZES) {
    await p.setViewport({width: w, height: h}); await frames(p, 3);
    const b = await p.evaluate(`(() => { ${rect}
      const z = document.getElementById('zbase'), P = z.querySelector('.zpanel'), hd = z.querySelector('.zbh'), ft = z.querySelector('.zbf'), go = document.getElementById('zgo'), un = document.getElementById('zundo');
      const o = {hdr: R(hd), ftr: R(ft), go: R(go), un: R(un), txt: hd.textContent.replace(/\\s+/g, ' ')}, tab = z.querySelector('.ztab'), left = z.querySelector('.zleft');
      tab.scrollTop = 1e6; left.scrollTop = 1e6; P.scrollTop = 1e6;  /* scroll everything as far as it goes: the header and the footer stay where they were */
      o.hdr2 = R(hd); o.ftr2 = R(ft); o.pt = R(P).t; o.scrolls = P.scrollHeight > P.clientHeight + 2; P.scrollTop = 0; tab.scrollTop = 0; left.scrollTop = 0; return o; })()`);
    ok(b.hdr.t >= 0 && b.hdr.b <= h && /Cash/.test(b.txt) && /\$1,500/.test(b.txt) && /Upkeep next wave/.test(b.txt) && /Base integrity/.test(b.txt) && /100%/.test(b.txt) && /Next: wave 1/.test(b.txt), `Base ${w}x${h}: the header shows the wave, cash, next wave's upkeep and integrity ("${b.txt.slice(0, 90)}")`);
    ok(b.ftr.b <= h + 1 && b.go.b <= h + 1 && b.go.t >= 0 && b.go.r <= w && b.un.b <= h + 1 && b.un.r <= w, `Base ${w}x${h}: the footer (Undo, Start wave) is on screen (bottom ${Math.round(b.ftr.b)} of ${h}, Start wave ${Math.round(b.go.w)}x${Math.round(b.go.h)})`);
    ok(Math.abs(b.hdr2.t - b.hdr.t) < 1.5 && Math.abs(b.ftr2.b - b.ftr.b) < 1.5, `Base ${w}x${h}: scrolling the lists, the map column or the whole panel (${b.scrolls ? 'it scrolls' : 'it fits'}) leaves the header and the footer where they are`);
    if (SHOTS) await p.screenshot({path: `${SHOTS}/z-layout-base-${w}x${h}.png`});
  }
  await p.setViewport({width: 1280, height: 720}); await frames(p, 2);
  /* sections with counts, rows with their one action, what is out of reach, what is owned */
  const S = await p.evaluate(`(() => { ${rect} const {G, Z} = __z, z = document.getElementById('zbase'), q = s => [...z.querySelectorAll(s)], first = () => q('.zitem')[0];
    const o = {chips: q('.zsecs [data-sec]').map(b => b.dataset.sec).join(), counts: q('.zsecs [data-sec] i').map(i => i.textContent).join(), heads: q('.zsec h3').length, tabs: q('.ztabs [data-tab]').map(b => b.dataset.tab).join(),
      roles: q('.zitem').every(e => e.querySelector('.zrole')?.textContent.trim()), acts: q('.zitem').filter(e => !e.querySelector('[data-zty]')).every(e => e.querySelectorAll('.zbuy button').length === 1),
      brief: R(z.querySelector('#zbrief')).h, map: R(z.querySelector('#zmap')).h, inLeft: !!z.querySelector('.zleft #zbrief')};
    G.cash = 100; Z.base.refresh(); const ri = G.cards.findIndex(c => c.k === 'rack'), row = z.querySelector('[data-buy="' + ri + '"]').closest('.zitem'), btn = row.querySelector('button');
    o.poor = {cls: row.classList.contains('poor'), dis: btn.disabled, need: row.querySelector('.zneed')?.textContent, want: Z.itemPrice('rack') - 100};
    G.cash = 20000; Z.base.refresh(); const row2 = z.querySelector('[data-buy="' + ri + '"]').closest('.zitem'); o.rich = {pri: row2.querySelector('button').classList.contains('pri'), dis: row2.querySelector('button').disabled, need: !!row2.querySelector('.zneed'), own: row2.classList.contains('own')};
    const d = Z.base.act.place('rack', 0); Z.base.refresh(); const row3 = z.querySelector('[data-buy="' + ri + '"]').closest('.zitem'); o.owned = {own: row3.classList.contains('own'), tag: row3.querySelector('em')?.textContent, n: q('.zitem.own').length, id: d.id};
    return o; })()`);
  ok(S.chips === 'def,sup,gear,perk,craft' && S.tabs === 'shop,armory,sites,chain,sortie' && S.heads === 5 && /^\d+\/\d+,\d+\/\d+,\d+\/\d+,\d+\/\d+,\d+$/.test(S.counts), `Base shop: sections ${S.chips} each with a count (${S.counts}), tabs ${S.tabs}`);
  ok(S.roles && S.acts, 'Base shop: every row says in one line what the item does and has exactly one action button (Buy / Upgrade / Load)');
  ok(S.poor.cls && S.poor.dis && S.poor.need === `need $${S.poor.want.toLocaleString('en-US')} more` && S.rich.pri && !S.rich.dis && !S.rich.need && !S.rich.own, `Base shop: out of reach greys the action and says "${S.poor.need}"; in reach it is the primary button`);
  ok(S.owned.own && /×1 OWNED/.test(S.owned.tag) && S.owned.n >= 1, `Base shop: the owned rack is marked (${S.owned.tag}) and styled apart from the unowned`);
  ok(S.inLeft && S.brief < S.map, `Base: the threat briefing stays readable under the map (${Math.round(S.brief)}px against the map's ${Math.round(S.map)}px)`);
  /* the detail pane follows the pointer */
  { const fi = await p.evaluate(() => __z.G.cards.findIndex(c => c.k === 'flak')), ri = await p.evaluate(() => __z.G.cards.findIndex(c => c.k === 'sam'));
    await p.evaluate(() => { const z = document.getElementById('zbase'); z.querySelector('.ztab').scrollTop = 0; });
    await p.hover(`#zbase [data-det="c:${fi}"]`); const a = await p.$eval('#zdet', e => e.textContent.replace(/\s+/g, ' '));
    await p.hover(`#zbase [data-det="c:${ri}"]`); const c = await p.$eval('#zdet', e => e.textContent.replace(/\s+/g, ' '));
    ok(/Flak mortar/.test(a) && /Price/.test(a) && /Upkeep/.test(a) && /Sells for/.test(a) && /SAM battery/.test(c) && !/Flak mortar/.test(c), `Base shop: the detail pane follows the pointer: full description, price, upkeep and sell value ("${a.slice(0, 70)}…")`); }
  /* the Armory card of what you own: one primary action, the sell value, the detail pane */
  await p.evaluate(() => __z.Z.base.setTab('armory')); await frames(p, 2);
  { const a = await p.evaluate(() => { const z = document.getElementById('zbase'), card = z.querySelector('.zarm.own'); return {n: z.querySelectorAll('.zarm.own').length, pri: card.querySelectorAll('button.pri').length, sell: card.querySelector('[data-sell]')?.textContent, det: document.getElementById('zdet').textContent.replace(/\s+/g, ' ')}; });
    ok(a.n >= 1 && a.pri === 1 && /^Sell \+\$/.test(a.sell) && /Sells for/.test(a.det) && /Upkeep/.test(a.det), `Base armory: the owned card has one primary action and its sell value (${a.sell}); the detail pane shows its upkeep and sell value`); }
  /* Undo lives in the footer (and on U) */
  { await p.evaluate(() => __z.Z.base.setTab('shop')); const id = S.owned.id, c0 = await p.evaluate(() => __z.G.cash);
    const u0 = await p.evaluate(() => { const b = document.getElementById('zundo'); return {dis: b.disabled, txt: b.textContent}; });
    await p.evaluate(id => { __z.Z.base.sell(id); }, id); await frames(p, 2);
    const u1 = await p.evaluate(() => { const b = document.getElementById('zundo'); return {dis: b.disabled, txt: b.textContent, said: document.querySelector('.zbf-s')?.textContent, n: __z.Z.def.D.length}; });
    await p.click('#zundo'); await frames(p, 2);
    const u2 = await p.evaluate(() => ({n: __z.Z.def.D.length, dis: document.getElementById('zundo').disabled, cash: __z.G.cash}));
    await p.evaluate(id => { __z.Z.base.sell(id); }, id); await frames(p, 2);
    await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('KeyU'); await frames(p, 2);
    const u3 = await p.evaluate(() => ({n: __z.Z.def.D.length, dis: document.getElementById('zundo').disabled}));
    ok(u0.dis && /Undo/.test(u0.txt) && !u1.dis && /^Undo −\$\d/.test(u1.txt) && /Sold/.test(u1.said) && u1.n === 0 && u2.n === 1 && u2.dis && u2.cash === c0 && u3.n === 1 && u3.dis, `Base footer: Undo is always there (greyed with nothing sold), after a sale it reads "${u1.txt}" and takes it back (${u1.n} -> ${u2.n} defence, purse back to $${u2.cash}); U does the same`); }
  { /* the header and the footer frame the working area */
    const g = await p.evaluate(() => { const r = e => e.getBoundingClientRect(); return {ftr: r(document.querySelector('#zbase .zbf')).top, hdr: r(document.querySelector('#zbase .zbh')).bottom}; });
    ok(g.ftr > g.hdr + 200, `Base: header ends at ${Math.round(g.hdr)}, footer starts at ${Math.round(g.ftr)}: the middle is the working area`); }
  ok(!errs.length, 'Layout: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
  await p.close();
}

// ---------- keys: rebinding the keyboard / mouse side of the controller panel's switch rows (engine/keys.js, engine/input.js, zkeys.js) ----------
if (want('keys')) {
  const KURL = origin + '/games/interceptor/', DEFK = {fire: 'KeyF', tiltSw: 'KeyL', thermSw: 'KeyH', nextSw: 'KeyN'}, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /* the pure part, in Node: labels, what is refused, a hand-edited save cleaned, the text helpers */
  const KZ = await import('../games/interceptor/zkeys.js'), KE = await import('../engine/keys.js'), {S: NS} = await import('../engine/settings.js');
  const lab = ['KeyF', 'Mouse2', 'Mouse1', 'Mouse0', 'Space', 'Digit0', 'Numpad4', 'ArrowUp', 'ShiftLeft', 'Backquote', 'F11', 'PageUp', 'NumpadAdd', 'IntlBackslash', 'Escape'].map(KE.keyLabel);
  ok(lab.join('|') === 'F|RMB|MMB|LMB|Space|0|Num 4|↑|L Shift|`|F11|PgUp|Num +|\\|Esc' && ['', null, 5, 'constructor', 'toString'].every(c => KE.keyLabel(c) === 'None'),
    `Keys: a code reads as a short label (${lab.join(' ')}); an empty, odd or inherited-property code is None`);
  const taken = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyC', 'KeyV', 'KeyR', 'KeyM', 'KeyT', 'KeyP', 'Escape', 'Tab', 'KeyQ', 'KeyE', 'KeyX', 'KeyZ', 'KeyJ', 'KeyK', 'KeyU', 'KeyB', 'KeyY',
    'Digit1', 'Digit9', 'Numpad3', 'Enter', 'F8', 'F9', 'F10', 'F5', 'ControlLeft', 'AltRight', 'MetaLeft', 'Mouse3'], free = ['KeyG', 'KeyI', 'KeyO', 'Space', 'Digit0', 'ShiftLeft', 'Backquote', 'Mouse1', 'Mouse2'];
  ok(taken.every(c => KZ.reserved(c, 'tiltSw')) && free.every(c => !KZ.reserved(c, 'tiltSw')) && Object.values(DEFK).every(c => !KZ.reserved(c, 'fire')) && KZ.reserved('Mouse0', 'tiltSw') === 'Detonate' && KZ.reserved('Mouse0', 'fire') === '',
    `Keys: the flight keys, C V R M T P Esc, the perks, J K U, B Y, the digits, Enter, the F-keys, Tab and the browser's own are taken; G I O, Space, Digit0, Shift and the middle / right buttons are free; left mouse is Detonate's alone`);
  const custom = {fire: 'Mouse2', tiltSw: 'KeyG', thermSw: 'Space', nextSw: 'KeyO'};
  const cleaned = [undefined, null, 'oops', [1, 2], 5, {}, {fire: 5}, {fire: 'constructor'}, {tiltSw: 'KeyC'}, {fire: 'KeyG', tiltSw: 'KeyG'}, {fire: 'KeyL', tiltSw: 'KeyC'}, {nextSw: 'Mouse0'}, {fire: 'Mouse7'}].map(KZ.cleanKeys);
  ok(cleaned.every(k => same(k, DEFK)) && same(KZ.cleanKeys(custom), custom) && same(KZ.cleanKeys({tiltSw: 'KeyG'}), {...DEFK, tiltSw: 'KeyG'}),
    'Keys: a missing, odd, reserved, doubled or inherited-property binding is cleaned back to the defaults; a good set and a partial one are kept');
  NS.keys = {...DEFK, fire: 'Mouse2', thermSw: 'Space'};
  const tx = [KZ.kl('fire'), KZ.kl('thermSw'), KZ.fireWith(x => `<${x}>`), KZ.fireList()]; NS.keys.fire = 'Mouse0'; tx.push(KZ.fireWith(), KZ.fireList()); delete NS.keys; tx.push(KZ.kl('tiltSw'), KZ.fireWith(x => `<${x}>`));
  ok(tx.join('|') === 'RMB|Space|<RMB> or click|RMB, click|a click|click|L|<F> or click', `Keys: the text helpers follow the binding (${tx.join(' | ')})`);

  const {p, errs} = await page();
  await p.evaluate(async () => {
    window.__in = await import('/engine/input.js');
    window.__kd = (code, down = true) => { const e = new KeyboardEvent(down ? 'keydown' : 'keyup', {code, bubbles: true, cancelable: true}); window.dispatchEvent(e); return e.defaultPrevented; };
    window.__mouse = (type, button, id = 'ov') => { const e = new MouseEvent(type, {button, bubbles: true, cancelable: true}); document.getElementById(id).dispatchEvent(e); return e.defaultPrevented; };
    window.__cell = k => { const c = document.getElementById('kb_' + k); return {t: c.textContent, cap: c.classList.contains('cap'), bad: c.classList.contains('bad')}; };
    window.__cap = k => document.getElementById('kb_' + k).click();
    window.__saved = () => JSON.parse(localStorage.getItem('dl-interceptor') || '{}').keys;
    window.__list = () => ['fire', 'tiltSw', 'thermSw', 'nextSw'].map(k => document.getElementById('kk_' + k).textContent).join('|');
    window.__cells = () => ['fire', 'tiltSw', 'thermSw', 'nextSw'].map(k => __cell(k).t).join('|');
    window.__sk = () => ({...__z.api.S.keys});
  });
  const settle = () => sleep(150);  /* a captured mouse press holds back the click / context menu that follows it for a moment (engine/input.js eat) */
  const d0 = await p.evaluate(() => ({keys: __sk(), setV: __z.api.S.setV, cells: __cells(), list: __list(), reset: !!document.getElementById('keyreset'), labels: [...document.querySelectorAll('#map label')].map(l => l.textContent), menu: __z.api.menuOpen}));
  ok(same(d0.keys, DEFK) && d0.setV === 7 && d0.cells === 'F|L|H|N' && d0.list === 'F / click|L|H|N' && d0.reset && ['Detonate', 'Cam tilt', 'Thermal', 'Next track'].every(r => d0.labels.includes(r)) && d0.menu,
    `Keys: a fresh save has today's keys (${JSON.stringify(d0.keys)}), settings version ${d0.setV}, a key cell on each of the four rows and a Reset link`);

  /* rebind a row through the panel (the menu is up, the backdrop demo runs behind it) */
  await p.evaluate(() => __cap('tiltSw'));
  const c1 = await p.evaluate(() => __cell('tiltSw'));
  await p.evaluate(() => { __kd('KeyG'); __kd('KeyG', false); });
  const c2 = await p.evaluate(() => ({cell: __cell('tiltSw'), keys: __sk(), saved: __saved(), list: __list(), leak: !!__in.keys.KeyG}));
  ok(c1.t === 'press a key or mouse button' && c1.cap && c2.cell.t === 'G' && !c2.cell.cap && c2.keys.tiltSw === 'KeyG' && c2.saved.tiltSw === 'KeyG' && c2.saved.fire === 'KeyF' && c2.list === 'F / click|G|H|N' && !c2.leak,
    `Keys: clicking a key cell asks for a press ("${c1.t}"), the next key (G) becomes the binding, is saved (${JSON.stringify(c2.saved)}), shows in the menu's key list (${c2.list}) and does not leak into the game as a held key`);
  await p.evaluate(() => { __cap('tiltSw'); __kd('Escape'); });
  const c3 = await p.evaluate(() => ({cell: __cell('tiltSw'), keys: __sk()}));
  ok(c3.cell.t === 'G' && !c3.cell.cap && c3.keys.tiltSw === 'KeyG', 'Keys: Esc cancels the capture and keeps the binding');
  await p.evaluate(() => { __cap('tiltSw'); __cap('tiltSw'); });
  const c4 = await p.evaluate(() => __cell('tiltSw'));
  ok(c4.t === 'G' && !c4.cap, 'Keys: clicking the cell again while it waits cancels too');

  /* clashes are refused with a note in the cell, and the binding stays */
  const clash = [];
  for (const [what, act, want] of [['another row', "__kd('KeyG')", 'G is in use: Cam tilt'], ['the camera key', "__kd('KeyC')", 'C is in use: Camera'], ['a debug key', "__kd('F9')", 'F9 is in use: Debug mark'], ['Tab', "__kd('Tab')", 'Tab is in use: the browser'],
    ['a perk', "__kd('KeyQ')", 'Q is in use: Freeze'], ['left mouse on a switch row', "__mouse('mousedown', 0); __mouse('mouseup', 0)", 'LMB is in use: Detonate']]) {
    await p.evaluate(() => __cap('thermSw'));
    await p.evaluate(act); await settle();
    const r = await p.evaluate(() => ({cell: __cell('thermSw'), keys: __sk()}));
    if (r.cell.t !== want || !r.cell.bad || r.cell.cap || r.keys.thermSw !== 'KeyH') clash.push(`${what}: "${r.cell.t}" ${r.keys.thermSw}`);
  }
  ok(!clash.length, 'Keys: a key another row or the game uses, Tab and left mouse on a switch row are refused with a short note in the cell, and the binding stays' + (clash.length ? '\n  ' + clash.join('\n  ') : ''));
  const rv = await p.evaluate(() => new Promise(r => setTimeout(() => r(__cell('thermSw')), 3000)));
  ok(rv.t === 'H' && !rv.bad, 'Keys: the note clears by itself and the cell reads the key again');
  /* the Detonate row may take left mouse (its default button) */
  await p.evaluate(() => __cap('fire'));
  await p.evaluate(() => { __mouse('mousedown', 0); __mouse('mouseup', 0); }); await settle();
  const lm = await p.evaluate(() => ({cell: __cell('fire').t, keys: __sk().fire, list: __list().split('|')[0]}));
  ok(lm.cell === 'LMB' && lm.keys === 'Mouse0' && lm.list === 'LMB', `Keys: the Detonate row can be bound to the left button (cell ${lm.cell}, menu key list "${lm.list}")`);

  /* four rebinds: Detonate Space, Cam tilt G (done), Thermal right mouse, Next track middle mouse */
  await p.evaluate(() => { __cap('fire'); __kd('Space'); __kd('Space', false); __cap('thermSw'); });
  const rbR = await p.evaluate(() => { const down = __mouse('mousedown', 2), ctx = __mouse('contextmenu', 2); __mouse('mouseup', 2); return {down, ctx}; }); await settle();
  await p.evaluate(() => __cap('nextSw'));
  const rbM = await p.evaluate(() => { const down = __mouse('mousedown', 1); __mouse('mouseup', 1); return down; }); await settle();
  const rb = await p.evaluate(() => ({keys: __sk(), cells: __cells(), list: __list(), saved: __saved()}));
  ok(same(rb.keys, {fire: 'Space', tiltSw: 'KeyG', thermSw: 'Mouse2', nextSw: 'Mouse1'}) && same(rb.saved, rb.keys) && rb.cells === 'Space|G|RMB|MMB' && rb.list === 'Space / click|G|RMB|MMB' && rbR.down && rbR.ctx && rbM,
    `Keys: keys and mouse buttons both bind (${rb.cells}); a captured right / middle press and its context menu are swallowed`);

  /* the text that names the keys follows them */
  const tt = await p.evaluate(async () => { const {Z} = __z, cp = await import('/games/interceptor/zcampaign.js'); return {fuse: Z.perkBlurb('fuse'), night: cp.MODS.night.txt, look: Z.onboard.hud('look'), burst: Z.onboard.hud('burst')}; });
  ok(/\(Space, click or the detonate button\)/.test(tt.fuse) && /Thermal \(RMB\) sees in the dark/.test(tt.night) && /<kbd>G<\/kbd> tilts the camera/.test(tt.look) && /Detonate with <kbd>Space<\/kbd> or click within/.test(tt.burst),
    `Keys: the Proximity fuse blurb, the Night-heavy modifier and the first-run guide's camera and burst lines name the bound keys ("${tt.fuse.slice(-40)}", "${tt.night.slice(-36)}", "${tt.look.slice(0, 40)}", "${tt.burst.slice(0, 42)}")`);

  /* in the air: the new keys act, the old ones do not */
  await play(p);
  await p.evaluate(() => { __z.cont(); __z.sim(2); });
  const a0 = await p.evaluate(() => { const {api} = __z, o = {menu: api.menuOpen, up0: api.camUp, state: __z.G.state};
    __kd('KeyL'); __kd('KeyL', false); o.old = api.camUp;
    __kd('KeyG'); __kd('KeyG', false); o.on = api.camUp;
    __kd('KeyG'); __kd('KeyG', false); o.off = api.camUp;
    __kd('KeyF'); o.fOld = __in.fireBtnIn(); __kd('KeyF', false);
    __kd('Space'); o.fNew = __in.fireBtnIn(); __kd('Space', false); o.fUp = __in.fireBtnIn();
    __mouse('mousedown', 0); o.lmb = __in.fireBtnIn(); __mouse('mouseup', 0); o.lmbUp = __in.fireBtnIn(); return o; });
  ok(a0.state === 'wave' && !a0.menu && !a0.up0 && !a0.old && a0.on && !a0.off, `Keys: Cam tilt on its new key (G) toggles the camera, its old key (L) does nothing (${JSON.stringify([a0.old, a0.on, a0.off])})`);
  ok(!a0.fOld && a0.fNew && !a0.fUp && a0.lmb && !a0.lmbUp, `Keys: Detonate on Space fires and releases, F no longer does, left click still fires (${JSON.stringify([a0.fOld, a0.fNew, a0.fUp, a0.lmb, a0.lmbUp])})`);
  const therm = want => until(() => p.evaluate(w => __z.api.thermLook === w, want), {timeout: 30000, every: 100});
  await p.evaluate(() => { __kd('KeyH'); __kd('KeyH', false); });
  await frames(p, 4);
  const t0 = await p.evaluate(() => ({old: __z.api.thermLook, ctx: __mouse('contextmenu', 2)}));
  const t1 = await p.evaluate(() => { const d = __mouse('mousedown', 2); __mouse('mouseup', 2); return d; }), tOn = await therm(true);
  await p.evaluate(() => { __mouse('mousedown', 2); __mouse('mouseup', 2); });
  const tOff = await therm(false);
  ok(t0.old === false && t0.ctx && t1 && tOn && tOff, `Keys: Thermal on the right button switches the thermal camera on (${tOn}) and off (${tOff}), its old key (H) does nothing (${t0.old}), and the press and the context menu are suppressed while flying (${t1}, ${t0.ctx})`);
  const nx = await p.evaluate(() => { const {api} = __z; let n = 0; while (api.TH.filter(api.live).length < 2 && n++ < 400) __z.sim(.25); api.pickT = null;
    __kd('KeyN'); __kd('KeyN', false); const old = api.pickT, mid = __mouse('mousedown', 1), aux = __mouse('auxclick', 1); __mouse('mouseup', 1); return {tracks: api.TH.filter(api.live).length, old: old === null, now: api.pickT !== null, mid, aux}; });
  ok(nx.tracks >= 2 && nx.old && nx.now && nx.mid && nx.aux, `Keys: Next track on the middle button picks a track, N no longer does, and the press does not autoscroll or paste (${JSON.stringify(nx)})`);
  const mn = await p.evaluate(() => { __z.api.showMenu(true); __z.sim(.2); return __mouse('contextmenu', 2); });
  ok(mn === false, 'Keys: with the menu open the right button opens the browser menu as usual');

  /* the pause menu: Esc cancels a capture without closing the menu; a menu that closes under a capture frees the keys */
  const pm = await p.evaluate(() => { const {api} = __z, o = {}; __cap('tiltSw'); __kd('Escape'); __kd('Escape', false); o.menu = api.menuOpen; o.cell = __cell('tiltSw');
    __cap('tiltSw'); api.showMenu(false); __kd('KeyO'); __kd('KeyO', false); o.keys = __sk().tiltSw; o.cell2 = __cell('tiltSw'); o.menu2 = api.menuOpen; return o; });
  ok(pm.menu && pm.cell.t === 'G' && !pm.cell.cap && pm.keys === 'KeyG' && !pm.cell2.cap && pm.cell2.t === 'G' && !pm.menu2, 'Keys: Esc cancels a capture and the pause menu stays open; if the menu closes under a capture, the next key is a game key again and nothing is rebound');

  /* pictures of the panel: waiting for a press, a refusal, and the rebound rows */
  await p.evaluate(() => __z.api.showMenu(true));
  await frames(p, 3);
  if (SHOTS) {
    const pad = async f => { await p.evaluate(() => document.getElementById('kb_tiltSw').scrollIntoView({block: 'center'})); await (await p.$('#pilotpad')).screenshot({path: SHOTS + '/' + f}); };
    await p.evaluate(() => __cap('nextSw')); await pad('z-keys-capture.png');
    await p.evaluate(() => { __kd('Escape'); __cap('thermSw'); __kd('KeyC'); }); await pad('z-keys-refused.png');
    await p.evaluate(() => new Promise(r => setTimeout(r, 2800))); await pad('z-keys-panel.png');
  }

  /* Reset: every row back to its key, saved, shown, and the old keys act again */
  const r0 = await p.evaluate(() => { document.getElementById('keyreset').click(); return {keys: __sk(), saved: __saved(), cells: __cells(), list: __list()}; });
  const r1 = await p.evaluate(() => { const {api} = __z, o = {}; api.showMenu(false); __z.sim(.2); const u = api.camUp;
    __kd('KeyL'); __kd('KeyL', false); const u1 = api.camUp; o.tilt = u1 !== u; __kd('KeyG'); __kd('KeyG', false); o.tiltG = api.camUp !== u1;
    __kd('KeyF'); o.f = __in.fireBtnIn(); __kd('KeyF', false); __kd('Space'); o.sp = __in.fireBtnIn(); __kd('Space', false); o.ctx = __mouse('contextmenu', 2); return o; });
  ok(same(r0.keys, DEFK) && same(r0.saved, DEFK) && r0.cells === 'F|L|H|N' && r0.list === 'F / click|L|H|N', `Keys: Reset keys puts every row back to its default, saves it and shows it (${r0.cells})`);
  ok(r1.tilt && !r1.tiltG && r1.f && !r1.sp && !r1.ctx, `Keys: after Reset the default keys act again (${JSON.stringify(r1)}) and the context menu is left alone`);
  ok(!errs.length, 'Keys: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
  await p.close();

  /* saves: the keys come back from the save, an older save has the defaults, a hand-edited one is cleaned and cannot make a key always held */
  const kerrs = [], q = await open(browser, KURL, kerrs);
  const load = async save => { await q.evaluate(s => { sessionStorage.setItem('zbossRoster', '0'); localStorage.setItem('dl-interceptor', JSON.stringify(s)); }, save); await q.reload({waitUntil: 'load'}); await q.waitForFunction(() => window.__z, {timeout: 60000}); await frames(q, 3);
    return q.evaluate(async () => { const m = await import('/engine/input.js'), S = __z.api.S; return {keys: {...S.keys}, setV: S.setV, cells: ['fire', 'tiltSw', 'thermSw', 'nextSw'].map(k => document.getElementById('kb_' + k).textContent).join('|'), held: m.fireBtnIn()}; }); };
  const s1 = await load({wx: 'clear', setV: 7, keys: custom}), s2 = await load({wx: 'clear', setV: 6, keys: {fire: 'KeyG'}}), s3 = await load({wx: 'clear', setV: 7, keys: {fire: 'constructor', tiltSw: 'KeyC', thermSw: 'KeyG', nextSw: 'KeyG'}});
  const s4 = await load({wx: 'clear', setV: 7, keys: 'oops'}), s5 = await load({wx: 'clear', setV: 7, keys: {fire: 'toString'}}), s6 = await load({wx: 'clear', setV: 7, keys: {fire: 'Mouse1', nextSw: 'KeyN', thermSw: 'KeyG'}});
  ok(same(s1.keys, custom) && s1.cells === 'RMB|G|Space|O' && s1.setV === 7 && !s1.held, `Keys: bindings come back from the save (${s1.cells})`);
  ok(same(s2.keys, DEFK) && s2.setV === 7, 'Keys: a save from before the setting (version 6) has the default keys');
  ok([s3, s4, s5].every(s => same(s.keys, DEFK) && s.setV === 7 && s.cells === 'F|L|H|N' && !s.held), 'Keys: a hand-edited save (reserved or doubled keys, a string, a name inherited from Object) is cleaned to the defaults and no key reads as held');
  ok(same(s6.keys, {fire: 'Mouse1', tiltSw: 'KeyL', thermSw: 'KeyG', nextSw: 'KeyN'}), `Keys: a partial save keeps its good keys and defaults the rest (${JSON.stringify(s6.keys)})`);
  await q.evaluate(() => localStorage.removeItem('dl-interceptor'));
  ok(!kerrs.length, 'Keys: saves: no errors' + (kerrs.length ? '\n  ' + kerrs.slice(0, 5).join('\n  ') : ''));
  await q.close();
}

// ---------- boss practice (zpractice.js, zpracdata.js): a one-on-one run against a boss from the Enemies screen, set up from the boss's own descriptor, driven to a kill, nothing paid or recorded but the best time ----------
if (want('practice')) {
  const PZ = await import('../games/interceptor/zpracdata.js'), PURL = origin + '/games/interceptor/';
  const IDS = [...CDX_ORDER, 'gace'];  /* the 12 campaign bosses in sector order (the Mothership first), then the secret one */
  /* the pure side, in Node: the scenario table, what a kit costs, the save cleaned, the times read */
  const dirty = PZ.cleanPrac({v: 1, b: {ace: {t: [0, 41.26, 'x', 99999], w: 2}, nope: {t: [1]}, twins: {t: 'x', w: -1}, jugg: [1], hive: {t: [5, 0, 0, 0], w: 1.5}, constructor: {t: [1]}}});
  ok([null, 'x', 7, [], {v: 2, b: {ace: {w: 1}}}, {v: 1, b: [1]}, {v: 1, b: 'x'}].every(c => JSON.stringify(PZ.cleanPrac(c)) === '{"v":1,"b":{}}') && JSON.stringify(dirty.b.ace) === '{"t":[0,41.3,0,0],"w":2}' && JSON.stringify(Object.keys(dirty.b).sort()) === '["ace","hive"]'
    && dirty.b.hive.t[0] === 5 && dirty.b.hive.w === 0 && JSON.stringify(PZ.cleanPrac(JSON.parse(JSON.stringify(dirty)))) === JSON.stringify(dirty),
    'Practice save: any value cleans to a valid record (wrong types, unknown ids, times out of range drop out; a time keeps a tenth of a second), and it round-trips through JSON');
  ok(PZ.fmtT(48.34) === '48.3 s' && PZ.fmtT(72.4) === '1:12.4' && PZ.fmtT(119.97) === '2:00.0' && PZ.fmtT(-3) === '0.0 s' && PZ.fmtT('x') === '0.0 s', `Practice: a time reads 48.3 s or 1:12.4 (${PZ.fmtT(48.34)}, ${PZ.fmtT(72.4)}, ${PZ.fmtT(119.97)})`);
  const m0 = PZ.merge({}), m1 = PZ.merge({more: [['sam', 'fuel depot west']], perks: {freeze: 1}, wave: 18});
  ok(JSON.stringify(m0.kit) === JSON.stringify(PZ.DEF.kit) && PZ.cost(m0) === 2750 && m1.kit.length === 4 && m1.kit[3][0] === 'sam' && m1.wave === 18 && m1.lead === 8 && PZ.cost(m1) === 2750 + 2800 + 900 && PZ.DEF.perks.freeze === undefined
    && PZ.cost(PZ.merge({perks: {swarm: 1}})) === 2750 + 2400 + 4 * 30,
    `Practice scenario: the standard kit (a drone rack, a flak mortar, a Gepard gun) costs $${PZ.cost(m0)}; a descriptor's extra kit and loadout are added over it and priced (what rebuilding it costs), the personal swarm's first deployment included`);

  const {p, errs} = await page();
  const reload = async (qs = '') => { await p.goto(PURL + qs, {waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 60000}); await frames(p, 3); };
  /* a profile for the player's rules: the bosses on, no codex or boss record, the weather the menu's; extra = more saved keys */
  const fresh = async (extra = {}, qs = '') => {
    await p.evaluate(x => { sessionStorage.setItem('zbossRoster', '1'); sessionStorage.removeItem('zcodex'); localStorage.setItem('dl-interceptor', JSON.stringify({wx: 'clear', zwx: 'menu', ...x})); }, extra);
    await reload(qs);
    await p.evaluate(() => {
      window.__pk = {
        /* the records a practice run must leave alone, as one string */
        rec() { const S = __z.api.S, b = S.zboss?.b || {}; let n = 0; for (const k in b) n += (b[k].met | 0) + (b[k].won | 0) + (b[k].lost | 0);
          const sum = o => Object.values(o || {}).reduce((x, y) => x + (+y || 0), 0);
          return JSON.stringify({zruns: S.zruns, zbests: S.zbests, zbest: S.zbest, zend: S.zend, zcamp: S.zcamp, zmeta: S.zmeta, zcodex: S.zcodex, zonb: S.zonb, boss: n, ace: sum(S.zboss?.ace), ghost: sum(S.zboss?.ghost)}); },
        /* the bot pilots' kills, boss by boss, until the fight is over (the Mothership stage by stage, the Puppeteer by direct strikes) */
        drive(id, max = 900) { const {api, Z} = __z, R = Z.practice.run; let n = 0;
          for (; n < max && !R.res; n++) { if (api.player.dead > 0) api.launch();
            if (R.spawned && R.t) { if (id === 'boss') { if (api.live(R.t)) Z.bossHit(R.t); } else if (id === 'puppet') { if (api.live(R.t)) Z.bosses.hitAt(R.t, 'kill', R.t.p.clone()); } else Z.bosses.bot(1); }  /* (the Hive's first body is gone at the split: the bots go on with its broods) */
            __z.sim(.3); }
          return {res: R.res, n, tt: R.tt}; }};
    });
  };
  const openEnemies = async () => { await p.evaluate(() => { document.getElementById('zover').hidden = true; if (__z.G.on) __z.api.startDemo(); __z.Z.codex.close(); }); await frames(p, 2); await p.click('#zcdxbtn'); await p.waitForFunction(() => __z.Z.codex.opened, {timeout: 5000}); };
  const btns = () => p.evaluate(() => [...__z.Z.codex.el.querySelectorAll('[data-prac]')].map(b => ({id: b.dataset.prac, off: b.disabled, txt: b.textContent, title: b.title})));
  const starts = async id => { await p.waitForFunction(i => !!__z.Z.codex.el.querySelector(`[data-prac="${i}"]`), {timeout: 5000}, id); await p.evaluate(i => { __z.Z.codex.el.querySelector(`[data-prac="${i}"]`).scrollIntoView({block: 'center'}); }, id);
    await p.click(`#zcdx [data-prac="${id}"]`); await p.waitForFunction(() => __z.Z.practice.on && __z.G.state === 'wave' && !__z.api.menuOpen, {timeout: 20000}); };

  /* ---- who gets the button: a fresh profile has the free baseline boss, a beaten boss has one, a silhouette none; no co-op, no client, no bots ---- */
  await fresh();
  await openEnemies();
  const a0 = await p.evaluate(() => { const X = __z.Z.codex, g = X.el.querySelector('.zcdxg').textContent; return {cards: X.el.querySelectorAll('.zcdxc').length, sil: X.el.querySelectorAll('.zcdxc.new').length, leak: g.includes('Mothership'), practiceText: (g.match(/Practice/g) || []).length}; });
  const b0 = await btns();
  ok(a0.cards === 12 && a0.sil === 12 && b0.length === 1 && b0[0].id === 'boss' && !b0[0].off && b0[0].txt === 'Practice' && !a0.leak && a0.practiceText === 1,
    `Practice button: a fresh profile has exactly one, on the free baseline boss (no name leaks from it); the 11 silhouettes have none (${JSON.stringify(b0.map(b => b.id))})`);
  const a1 = await p.evaluate(() => { const X = __z.Z.codex; X.set('twins', 'beaten', true); X.close(); X.open(); const el = X.el, has = id => !!el.querySelector(`[data-id="${id}"] [data-prac]`);
    const ids = [...el.querySelectorAll('[data-prac]')].map(b => b.dataset.prac); X.set('hive', 'seen', true); X.close(); X.open(); return {ids, jugg: has('jugg'), twins: has('twins'), seenHive: has('hive')}; });
  ok(a1.ids.join() === 'boss,twins' && !a1.jugg && !a1.seenHive && a1.twins, `Practice button: a boss beaten gets one (${a1.ids}); a boss that was only met, or never, has none (jugg ${a1.jugg}, hive met ${a1.seenHive})`);
  const co = await p.evaluate(() => { const {Z} = __z, X = Z.codex, d0 = Object.getOwnPropertyDescriptor(Z, 'online'), c0 = Z.isClient, out = {};
    Object.defineProperty(Z, 'online', {get: () => true, configurable: true}); X.close(); X.open(); out.coop = [...X.el.querySelectorAll('[data-prac]')].map(b => [b.dataset.prac, b.disabled, b.textContent, b.title.length > 20]); out.coopStart = Z.practice.start('boss'); out.coopOn = Z.practice.on;
    Object.defineProperty(Z, 'online', d0); Z.isClient = () => true; X.close(); X.open(); out.client = X.el.querySelectorAll('[data-prac]').length; out.clientStart = Z.practice.start('boss'); Z.isClient = c0;
    sessionStorage.setItem('zcodex', 'all'); X.close(); X.open(); out.bots = X.el.querySelectorAll('[data-prac]').length; out.botStart = Z.practice.start('boss'); sessionStorage.removeItem('zcodex'); X.close(); X.open(); out.back = X.el.querySelectorAll('[data-prac]').length; return out; });
  ok(co.coop.length === 2 && co.coop.every(b => b[1] && /not in co-op/.test(b[2]) && b[3]) && co.coopStart === false && !co.coopOn && co.client === 0 && co.clientStart === false && co.bots === 0 && co.botStart === false && co.back === 2,
    `Practice: in a co-op game the button says so and is off, a co-op client sees none, the bots and the tests (everything unlocked) get none, and none of them can start one (${JSON.stringify(co)})`);
  if (SHOTS) { await p.evaluate(() => { const X = __z.Z.codex; for (const id of ['undertaker', 'puppet', 'siren', 'ace', 'jammer', 'hush']) X.set(id, 'beaten', true); X.close(); X.open(); });
    await p.waitForFunction(() => [...document.querySelectorAll('#zcdx img[data-img]')].every(i => i.src.startsWith('data:image/png')), {timeout: 30000}).catch(() => {});
    await p.evaluate(() => { __z.Z.codex.el.querySelector('[data-id="twins"]').scrollIntoView({block: 'center'}); }); await drawFrames(p, 2); await p.screenshot({path: SHOTS + '/practice-enemies.png'}); }

  /* ---- a run in progress: the button is there but off, and nothing starts over it ---- */
  await fresh({zcodex: {v: 1, b: {twins: {seen: true, beaten: true, allowed: true}}}});
  await play(p);
  const ru = await p.evaluate(() => { const {Z, G} = __z; Z.codex.open(); const b = [...Z.codex.el.querySelectorAll('[data-prac]')].map(x => [x.dataset.prac, x.disabled, x.textContent]); const st = Z.practice.start('twins'); Z.codex.close(); return {b, st, on: Z.practice.on, state: G.state}; });
  ok(ru.b.length === 2 && ru.b.every(x => x[1] && /after this run/.test(x[2])) && ru.st === false && !ru.on && ru.state === 'base', `Practice: over a run in progress the buttons are off ("${ru.b[0]?.[2]}") and a practice cannot start over it (it would throw the run away)`);

  /* ---- the offer when a boss is first added to the codex: on the end screen ---- */
  const of = await p.evaluate(() => { const {Z, G} = __z; Z.codex.note('jugg', 'won'); const nw = [...G.cdx.new]; Z.gameOver(); const zo = document.getElementById('zover'), b = zo.querySelector('[data-prac]');
    const d0 = Object.getOwnPropertyDescriptor(Z, 'online'); Object.defineProperty(Z, 'online', {get: () => true, configurable: true}); const coop = Z.overNote().includes('data-prac'); Object.defineProperty(Z, 'online', d0);
    return {nw, shown: !zo.hidden, text: zo.querySelector('.zcdxnew')?.textContent || '', id: b?.dataset.prac, label: b?.textContent, coop}; });
  ok(of.nw.join() === 'jugg' && of.shown && /Juggernaut/.test(of.text) && of.id === 'jugg' && /^Practice it now/.test(of.label) && !of.coop, `Practice offer: the game-over screen that reports the Juggernaut as added to the codex offers "${of.label}" (${of.text.slice(0, 90)}); not in co-op`);
  await frames(p, 2);
  ok(await p.evaluate(() => { const o = document.getElementById('zover'), n = o.querySelector('.zcdxnew'), b = o.querySelector('.btns'); return !!n && !!b && !!(b.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING); }), 'Practice offer: on the game-over screen it sits above the buttons (not under them, out of sight), as on the sector result');
  if (SHOTS) { await p.evaluate(() => { document.querySelector('#zover [data-prac]')?.scrollIntoView({block: 'center'}); }); await drawFrames(p, 2); await p.screenshot({path: SHOTS + '/practice-offer.png'}); }
  await p.click('#zover [data-prac="jugg"]'); await p.waitForFunction(() => __z.Z.practice.on && __z.G.state === 'wave', {timeout: 10000});
  const of2 = await p.evaluate(() => { const {Z} = __z; return {id: Z.practice.run.id, over: document.getElementById('zover').hidden, menu: __z.api.menuOpen, c: Z.codex.c.b.jugg}; });
  ok(of2.id === 'jugg' && of2.over && !of2.menu && of2.c.beaten, 'Practice offer: pressing it starts the practice run straight away (the end screen is gone, the game is on)');

  /* ---- the first-run guide never gets practice: it does not start in one, does not use up the flag, and holds the buttons off while it runs ---- */
  await fresh({}, '?guide=1');
  const g1 = await p.evaluate(() => { const {Z, api} = __z; const st = Z.practice.start('boss'); return {st, on: Z.practice.on, guide: Z.onboard.on, why: Z.onboard.why, flag: api.S.zonb}; });
  ok(g1.st && g1.on && !g1.guide && g1.why === 'practice' && g1.flag === undefined, `Practice: with the first-run guide due, a practice run does not start it or use up its flag (${JSON.stringify(g1)})`);
  await p.evaluate(() => { __z.api.startDemo(); }); await p.click('#play'); await p.waitForFunction(() => !__z.api.demo && __z.Z.onboard.on, {timeout: 20000});
  const g3 = await p.evaluate(() => { const {Z} = __z; Z.codex.open(); const b = [...Z.codex.el.querySelectorAll('[data-prac]')].map(x => [x.disabled, x.textContent]), st = Z.practice.start('boss'); Z.codex.close(); Z.onboard.skip(); return {b, st, on: Z.practice.on}; });
  ok(g3.b.length === 1 && g3.b[0][0] && /after the guide/.test(g3.b[0][1]) && g3.st === false && !g3.on, `Practice: while the guide runs the button is off ("${g3.b[0]?.[1]}") and nothing starts`);

  /* ---- every boss, from the Enemies screen: set up from its descriptor, driven to a kill, the end screen, the best time, nothing paid or recorded ---- */
  const ALLB = {}; for (const id of IDS) ALLB[id] = {seen: true, beaten: true, allowed: true};
  await fresh({zcodex: {v: 1, b: ALLB}, zmeta: {v: 1, g: {w10: 15, norep: 15, lean: 15, perfect3: 15, hard20: 15, night15: 15, helpers: 15, streak: 15, boss: 0, clutch: 15}}, zload: {doc: 'fortress', kit: ['lrack', 'hflak']}});
  const ctl = await p.evaluate(() => ({doc: __z.Z.meta.load().doc, kit: __z.Z.meta.load().kit.join()}));
  ok(ctl.doc === 'fortress' && ctl.kit === 'lrack,hflak', `Practice (control): this profile plays the Fortress doctrine with the Light rack and Heavy flak kit in an ordinary run (${JSON.stringify(ctl)})`);
  const before = await p.evaluate(() => __pk.rec());
  const T = {};  /* the time to the kill, boss by boss */
  const SPEC = {  /* what each boss's design needs, read just after it appears */
    boss: () => { const t = __z.api.TH.find(u => u.k === 'boss' && __z.api.live(u)); return {stages: t?.stages}; },
    undertaker: () => { const {api, Z} = __z, t = Z.bosses.alive().find(u => u.k === 'undertaker'), a = t?.bs.anchor; if (!t || !a) return {}; const hp0 = t.bs.hp, frac = +(a.hp / a.max).toFixed(2);
      t.p.set(a.x + 8, a.y + 30, a.z - 6); t.bs.gt = 0; Z.practice.run.ut = 44.9; __z.sim(1.2); return {anchor: true, frac, grew: t.bs.hp - hp0, drain: api.SITES.filter(s => s !== a && s.hp < s.max).length}; },
    puppet: () => { const {api, Z} = __z; return {ord: api.TH.filter(u => api.live(u) && !Z.bosses.BOSSES[u.k]).length, rack: Z.def.D.some(d => d.type === 'rack')}; },
    twins: () => { const {api, G} = __z; return {pair: api.TH.filter(u => u.k === 'twins' && api.live(u)).length, freeze: G.perks.freeze, ch: G.ch.freeze | 0}; },
    siren: () => { const {api, Z} = __z, o = api.TH.filter(u => api.live(u) && !Z.bosses.BOSSES[u.k]); return {ord: o.length, iff: o.filter(u => u.iff > 0).length}; },
    jugg: () => ({sam: __z.Z.def.D.some(d => d.type === 'sam')}),
    mirror: () => { const {api, Z, G} = __z, t = Z.bosses.alive().find(u => u.k === 'mirror'), L = t?.bs.L; return {L, spect: api.TH.filter(u => u.k === 'spectre' && api.live(u)).length, hab: G.hab?.n, fav: t?.bs.h?.fav}; },
    ace: () => ({ord: __z.api.TH.filter(u => __z.api.live(u) && !__z.Z.bosses.BOSSES[u.k]).length}),
    jammer: () => { const {api, G, Z} = __z; return {pods: api.TH.filter(u => u.k === 'jpod' && api.live(u)).length, ew: Z.def.D.some(d => d.type === 'ew'), optics: G.perks.optics}; },
    hive: () => ({sam: __z.Z.def.D.some(d => d.type === 'sam')}),
    ghost: () => ({ord: __z.api.TH.filter(u => __z.api.live(u) && !__z.Z.bosses.BOSSES[u.k]).length}),
    hush: () => ({perks: Object.keys(__z.G.perks).length}),
    gace: () => { const {api, G} = __z; return {spect: api.TH.filter(u => u.k === 'spectre' && api.live(u)).length, fallen: Object.keys(G.fallen || {}).length}; }};
  await openEnemies();
  for (const id of IDS) {
    const tag = id === 'boss' ? 'Mothership' : id;
    /* start it from its button on the Enemies screen */
    await starts(id);
    const s0 = await p.evaluate(id => { const {Z, G, api} = __z; Z.hud(.016); const R = Z.practice.run, o = Z.practice.scenario(id), K = (a, b) => a.localeCompare(b);
      const kit = Z.def.D.map(d => d.type + '@' + Z.def.SLOTS[d.slot].n.toLowerCase()).sort(K), want = o.kit.map(([t, n]) => t + '@' + n).sort(K), up = o.perks.swarm ? [0, 4, 6, 8, 10, 12][o.perks.swarm] * 30 : 0, cost = Z.practice.cost(o);
      return {id: R.id, wave: G.wave, want: o.wave, kit: kit.join(), wantKit: want.join(), perks: JSON.stringify(Object.entries(G.perks).sort()), wantPerks: JSON.stringify(Object.entries(o.perks).sort()),
        cashOk: G.cash <= cost && G.cash >= cost - up, cash: G.cash, cost, doc: G.doc, kitOwn: (G.kit || []).length, earned: G.earned, state: G.state, menu: api.menuOpen, demo: api.demo, boss: Z.bosses.alive().length + api.TH.filter(u => u.k === 'boss').length,
        label: document.getElementById('zw').textContent, inb: document.getElementById('zinb').textContent, line: Z.brief.line(), card: Z.briefHTML().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), radio: o.radio, name: R.name,
        buddy: Z.bd ? Z.bd.force?.has === false : true, guide: Z.onboard.on, cp: !!Z.cp.run}; }, id);
    ok(s0.id === id && s0.wave === s0.want && s0.kit === s0.wantKit && s0.perks === s0.wantPerks && s0.cashOk && s0.doc === 'std' && !s0.kitOwn && s0.earned === 0 && s0.state === 'wave' && !s0.menu && !s0.demo && s0.boss === 0 && s0.buddy && !s0.guide && !s0.cp,
      `Practice ${tag}: started from its button, wave ${s0.wave}, kit [${s0.kit}], loadout ${s0.perks}, purse $${s0.cash} (the kit and loadout cost $${s0.cost}), the standard doctrine and none of your kit, nothing yet in the air, no guide / campaign sector${s0.kit === s0.wantKit ? '' : ' (wanted ' + s0.wantKit + ')'}`);
    ok(s0.label === 'PRACTICE · ' + s0.name.toUpperCase() && /^.+ IN \d+ s$/.test(s0.inb) && s0.line === `PRACTICE · ${s0.name}. ${s0.radio}` && s0.card.includes('PRACTICE · ' + s0.name.toUpperCase()) && s0.card.includes('Nothing is paid or recorded'),
      `Practice ${tag}: the HUD reads "${s0.label}" with a count-down ("${s0.inb}"); the briefing's line and card say PRACTICE · ${s0.name} ("${s0.line.slice(0, 70)}…")`);
    /* the lead-in with nothing of the boss in the air, then the boss; the scenario's stream and seeds */
    const o = await p.evaluate(id => { const {Z, api} = __z, R = Z.practice.run, seen = new Set(), sc = Z.practice.scenario(id), ord = () => api.TH.filter(u => api.live(u) && !Z.bosses.BOSSES[u.k] && u.k !== 'boss'), out = {lead: sc.lead};
      for (let t = 0; t < sc.lead - 1; t += .5) { __z.sim(.5); for (const u of ord()) seen.add(u.id); } out.before = !R.spawned && !Z.bosses.alive().length && !api.TH.some(u => u.k === 'boss'); out.seenLead = seen.size;
      __z.sim(1.5); out.spawned = R.spawned; out.alive = id === 'boss' ? api.TH.some(u => u.k === 'boss' && api.live(u)) : Z.bosses.alive().some(u => u.k === id); out.t = +R.t0.toFixed(1);
      Z.hud(.016); out.hud = document.getElementById('zinb').textContent; __z.sim(.5); return out; }, id);
    const sp = await p.evaluate(`(${SPEC[id].toString()})()`);
    const o2 = await p.evaluate(() => { const {Z, api} = __z, seen = new Set(), ord = () => api.TH.filter(u => api.live(u) && !Z.bosses.BOSSES[u.k] && u.k !== 'boss' && u.k !== 'swarm'); let swarm = false;
      for (let t = 0; t < 14; t += .5) { __z.sim(.5); for (const u of ord()) seen.add(u.id); swarm = swarm || api.TH.some(u => u.k === 'swarm'); if (api.player.dead > 0) api.launch(); } return {seen: seen.size, swarm, res: Z.practice.run.res}; });
    ok(o.before && o.spawned && o.alive && o.t >= o.lead - .1 && o.t < o.lead + 1 && /LIVES 3\/3$/.test(o.hud), `Practice ${tag}: ${o.lead} s of lead-in with nothing of the boss in the air, then it appears (t ${o.t} s) and the HUD runs its clock ("${o.hud}")`);
    const SC = {
      boss: () => sp.stages === 3 && o2.swarm,
      undertaker: () => sp.anchor && sp.frac <= .23 && sp.grew === 2 && sp.drain >= 1,
      puppet: () => o.seenLead >= 3 && sp.ord >= 2 && o2.seen >= 3 && sp.rack,
      twins: () => sp.pair === 2 && sp.freeze === 1 && sp.ch === 1,
      siren: () => o.seenLead >= 3 && sp.ord >= 4 && sp.iff >= 3 && o2.seen >= 3,
      jugg: () => sp.sam,
      mirror: () => sp.L && sp.L.rocket === 1 && sp.L.warhead === 1 && sp.L.fuse === 1 && sp.L.swarm === 4 && sp.spect === 4 && sp.hab >= 400 && sp.fav === 'LEVEL SIX',
      ace: () => o.seenLead === 0 && sp.ord === 0 && o2.seen === 0,
      jammer: () => sp.pods >= 3 && sp.ew && sp.optics === 1,
      hive: () => sp.sam && o2.swarm,
      ghost: () => o.seenLead === 0 && o2.seen === 0,
      hush: () => sp.perks === 0 && o.seenLead === 0,
      gace: () => sp.spect >= 4 && sp.fallen === 3}[id];
    ok(SC(), `Practice ${tag}: what its descriptor asks for is in place ${JSON.stringify({spec: sp, leadIn: o.seenLead, later: o2.seen, swarm: o2.swarm})}`);
    if (id === 'ace' && SHOTS) { await p.evaluate(() => { __z.Z.fxTest?.endCine(); __z.api.camMode = 1; __z.sim(.3); }); await drawFrames(p, 3); await p.screenshot({path: SHOTS + '/practice-hud.png'}); await p.evaluate(() => { __z.api.camMode = 0; }); }
    /* the fight: driven to a kill with the bot hooks; the clock stops on it, a short beat, then the end screen */
    const cash0 = await p.evaluate(() => __z.G.cash);
    const k = await p.evaluate(id => __pk.drive(id), id);
    const en = await p.evaluate(() => { const {Z} = __z, R = Z.practice.run; Z.hud(.016); return {res: R.res, tt: R.tt, hud: document.getElementById('zinb').textContent}; });
    await p.evaluate(() => __z.sim(3));
    const end = await p.evaluate(() => { const {G, Z, api} = __z, R = Z.practice.run, zo = document.getElementById('zover');
      return {state: G.state, res: R.res, tt: R.tt, shown: !zo.hidden, h2: zo.querySelector('h2')?.textContent, big: zo.querySelector('.zbig')?.textContent, text: zo.textContent, btns: [...zo.querySelectorAll('button')].map(b => b.id + ':' + b.textContent).join(), cash: G.cash, earned: G.earned,
        brw: Object.keys(G.brw || {}).length, rec: __pk.rec(), stored: JSON.parse(localStorage.getItem('dl-interceptor')).zprac, goal: Z.meta.award('boss'), gotGoals: (G.run?.got || []).length, cx: JSON.stringify(Z.codex.c), name: R.name}; });
    ok(k.res === 'won' && en.res === 'won' && en.tt > 0 && en.tt < 600 && /^DESTROYED · /.test(en.hud), `Practice ${tag}: driven to a kill (${k.n} steps), the run ends on the boss's destruction at ${PZ.fmtT(en.tt)} ("${en.hud}")`);
    T[id] = end.tt;
    const best = end.stored?.b?.[id], shown = PZ.fmtT(end.tt);
    ok(end.state === 'over' && end.shown && end.h2 === 'Practice complete' && end.big === end.name.toUpperCase() && end.text.includes('Time to the kill') && end.text.includes(shown) && end.text.includes('NEW BEST') && end.btns === 'zpracretry:Retry,zpracback:Back to Enemies' && end.text.includes('pays nothing'),
      `Practice ${tag}: the end screen reads "${end.h2}", the time to the kill ${shown}, NEW BEST, with Retry and Back to Enemies`);
    ok(best && best.t[1] === Math.round(end.tt * 10) / 10 && best.t[0] === 0 && best.t[2] === 0 && best.t[3] === 0 && best.w === 1, `Practice ${tag}: the best time is saved for this boss on this difficulty (${JSON.stringify(best)})`);
    ok(end.earned === 0 && end.cash === cash0 && end.brw === 0 && end.rec === before && end.goal === false && end.gotGoals === 0 && end.cx === JSON.stringify({v: 1, b: ALLB}),
      `Practice ${tag}: nothing was paid (earned $${end.earned}, purse $${end.cash} as it was), no trophy, and no codex, boss record, goal, leaderboard, best wave or scar was written` + (end.rec === before ? '' : '\n  ' + before + '\n  ' + end.rec));
    if (id === 'ace') {
      if (SHOTS) { await drawFrames(p, 3); await p.screenshot({path: SHOTS + '/practice-end.png'}); }
      /* Retry: the same boss again at once; a slower kill keeps the old best, a faster one replaces it */
      await p.click('#zpracretry'); await p.waitForFunction(() => __z.Z.practice.on && __z.G.state === 'wave' && !__z.Z.practice.run.res && __z.Z.practice.run.id === 'ace', {timeout: 20000});
      const rt = await p.evaluate(() => { const {Z, G} = __z; return {id: Z.practice.run.id, wt: G.wt, over: document.getElementById('zover').hidden, shot: Z.practice.run.shot}; });
      ok(rt.id === 'ace' && rt.wt < 2 && rt.over && rt.shot === 0, `Practice: Retry starts the same boss again at once (${JSON.stringify(rt)})`);
      await p.evaluate(() => __pk.drive('ace')); await p.evaluate(() => __z.sim(3));
      const r2 = await p.evaluate(() => { const {Z} = __z, R = Z.practice.run; return {tt: R.tt, text: document.getElementById('zover').textContent, best: Z.practice.best('ace'), nb: R.newBest}; });
      const t1 = Math.round(T.ace * 10) / 10, t2 = Math.round(r2.tt * 10) / 10;
      ok(r2.best === Math.min(t1, t2) && r2.nb === (t2 < t1) && (r2.nb ? r2.text.includes('NEW BEST') && r2.text.includes(`(was ${PZ.fmtT(t1)})`) : !r2.text.includes('NEW BEST') && r2.text.includes(PZ.fmtT(t1))),
        `Practice: a second kill (${PZ.fmtT(t2)}) against the first (${PZ.fmtT(t1)}): the best time stays the lower, ${PZ.fmtT(r2.best)}, and the screen says ${r2.nb ? 'NEW BEST' : 'the old best'}`);
    }
    /* Back to Enemies: the menu with the Enemies screen open, the run gone */
    await p.click('#zpracback'); await p.waitForFunction(() => __z.Z.codex.opened && !__z.G.on, {timeout: 10000});
    const bk = await p.evaluate(() => ({on: __z.Z.practice.on, menu: __z.api.menuOpen, cb: __z.Z.codex.el.querySelectorAll('[data-prac]').length, best: __z.Z.codex.el.querySelector('.zcdxpt')?.textContent, n: __z.Z.codex.el.querySelectorAll('.zcdxpt').length}));
    ok(!bk.on && bk.menu && bk.cb === IDS.length && bk.n >= 1, `Practice ${tag}: Back to Enemies leaves the run and opens the Enemies screen on the menu (${bk.cb} buttons, ${bk.n} best times shown, e.g. "${bk.best}")`);
  }
  const after = await p.evaluate(() => __pk.rec());
  ok(after === before, 'Practice: after all 13 runs the records are as they were (boss counters, codex, goals, leaderboard, best waves, Endless, campaign, the guide flag)');
  const pz = await p.evaluate(() => JSON.parse(localStorage.getItem('dl-interceptor')).zprac);
  ok(IDS.every(id => pz.b[id] && pz.b[id].t[1] > 0 && pz.b[id].w >= 1) && Object.keys(pz.b).length === IDS.length, `Practice save: a best time for each of the ${IDS.length} bosses (${IDS.map(id => id + ' ' + PZ.fmtT(pz.b[id]?.t[1])).join(', ')})`);

  /* ---- the ways a practice run ends other than a kill: shot down, the sites fall, the boss gets away ---- */
  const endings = {};
  for (const how of ['craft', 'sites', 'gone']) {
    await openEnemies(); await starts('ace');
    endings[how] = await p.evaluate(how => { const {Z, G, api} = __z, R = Z.practice.run, C = Z.bosses.ctx, rec0 = __pk.rec(), out = {}; __z.sim(how === 'gone' ? 11 : 1);
      if (how === 'craft') for (let i = 0; i < 3; i++) { if (api.player.dead > 0) api.launch(); C.shoot('test'); out['lives' + i] = R.shot; }
      if (how === 'sites') { for (const s of api.SITES) s.hp = 1; for (const s of api.SITES) Z.impact(Z.make('shahed', 0, -2500, s)); }
      if (how === 'gone') C.vanish(R.t, 'escaped');
      __z.sim(3); const zo = document.getElementById('zover'); out.res = R.res; out.state = G.state; out.h2 = zo.querySelector('h2')?.textContent; out.text = zo.textContent; out.shown = !zo.hidden; out.w = JSON.parse(localStorage.getItem('dl-interceptor')).zprac.b.ace.w; out.rec = __pk.rec() === rec0; out.nb = zo.textContent.includes('NEW BEST'); return out; }, how);
  }
  ok(endings.craft.res === 'craft' && endings.craft.lives0 === 1 && endings.craft.lives2 === 3 && endings.craft.state === 'over' && endings.craft.h2 === 'Out of interceptors' && /3 of 3/.test(endings.craft.text) && !endings.craft.nb && endings.craft.rec,
    `Practice end: three interceptors shot down by the boss and the run is over ("${endings.craft.h2}"); a loss shows no new best`);
  ok(endings.sites.res === 'sites' && endings.sites.state === 'over' && endings.sites.h2 === 'Defense collapsed' && /Every site fell/.test(endings.sites.text) && endings.sites.rec, `Practice end: when every site falls the run is over ("${endings.sites.h2}")`);
  ok(endings.gone.res === 'gone' && endings.gone.state === 'over' && /got away/.test(endings.gone.h2) && /It escaped/.test(endings.gone.text) && endings.gone.rec && endings.gone.w === 2 && endings.craft.w === 2 && endings.sites.w === 2,
    `Practice end: a boss that gets away ends it too ("${endings.gone.h2}", "It escaped"); a run that is not a kill adds no win to the record (${endings.gone.w} saved)`);

  /* ---- the HUD fits: the label and the clock at a laptop, a big screen and a short window; the page does not scroll sideways ---- */
  await openEnemies(); await starts('siren'); await p.evaluate(() => __z.sim(10));
  const fit = [];
  for (const [w, h] of [[1280, 720], [1920, 1080], [900, 420]]) {
    await p.setViewport({width: w, height: h}); await frames(p, 3);
    fit.push(await p.evaluate(() => { __z.Z.hud(.016); const L = [...document.getElementById('zhud').querySelector('.zt').children].filter(e => e.getBoundingClientRect().width), r = L.map(e => e.getBoundingClientRect());
      return {vp: innerWidth + 'x' + innerHeight, inside: r.every(q => q.left >= -1 && q.right <= innerWidth + 1), apart: r.every((q, i) => !i || q.left >= r[i - 1].right - 1 || q.top >= r[i - 1].bottom - 1), side: document.documentElement.scrollWidth <= innerWidth + 1, label: document.getElementById('zw').textContent}; }));
  }
  await p.setViewport({width: 1280, height: 720});
  ok(fit.every(f => f.inside && f.apart && f.side && f.label === 'PRACTICE · THE SIREN'), `Practice HUD: the label and the clock stay on screen, apart, with no sideways scroll at ${fit.map(f => f.vp + ' ' + (f.inside && f.apart && f.side ? 'ok' : 'BAD ' + JSON.stringify(f))).join(', ')}`);

  /* ---- a debug-marked run keeps even its best time out of the save ---- */
  const dp = await open(browser, PURL + '?debug=1', errs);
  await dp.evaluate(x => { sessionStorage.setItem('zbossRoster', '1'); sessionStorage.removeItem('zcodex'); localStorage.setItem('dl-interceptor', JSON.stringify({wx: 'clear', zwx: 'menu', ...x})); }, {zcodex: {v: 1, b: {ace: {seen: true, beaten: true, allowed: true}}}});
  await dp.reload({waitUntil: 'load'}); await dp.waitForFunction(() => window.__z, {timeout: 60000}); await frames(dp, 3);
  const dbg = await dp.evaluate(() => { const {Z, api} = __z, st = Z.practice.start('ace'); __z.sim(10); const m0 = Z.dbg.marked, cheat = Z.dbg.c.money(5), M = Z.dbg.marked, R = Z.practice.run;
    for (let n = 0; n < 600 && !R.res; n++) { if (api.player.dead > 0) api.launch(); Z.bosses.bot(1); __z.sim(.3); } __z.sim(3);
    return {st, m0, cheat, M, res: R.res, text: document.getElementById('zover').textContent, stored: JSON.parse(localStorage.getItem('dl-interceptor')).zprac, mem: api.S.zprac, dbg: R.dbg}; });
  ok(dbg.st && !dbg.m0 && dbg.M && dbg.res === 'won' && !dbg.stored && !dbg.mem?.b?.ace && dbg.dbg && /Debug run/.test(dbg.text) && !/NEW BEST/.test(dbg.text), `Practice (debug): a cheat marks the run; the Ace is beaten but no best time is saved, in memory or on disk, and the end screen says "Debug run" (${JSON.stringify({m0: dbg.m0, M: dbg.M, res: dbg.res, stored: dbg.stored})})`);
  await dp.close();

  ok(!errs.length, 'Practice: no errors' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
  await p.close();
}


// ---------- balance: a scripted player who shops sensibly and runs down a share of the tracks; how far does it get? ----------
if (argv.includes('--balance')) {  // about 10 minutes
  for (const skill of [.01, .025]) {  // chance per half second of a player kill: about one kill every 50 s (casual) or 20 s (good)
    const {p, errs} = await page();
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
  const {p, errs} = await page();
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


// ---------- balance: a scripted player who shops sensibly and runs down a share of the tracks; how far does it get? ----------
if (argv.includes('--balance')) {  // about 10 minutes
  for (const skill of [.01, .025]) {  // chance per half second of a player kill: about one kill every 50 s (casual) or 20 s (good)
    const {p, errs} = await page();
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
  const {p, errs} = await page();
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
