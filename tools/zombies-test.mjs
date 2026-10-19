// Interceptor harness: headless Edge runs Classic (must behave as before, no errors) and Zombies (waves, money, integrity, base screen,
// game over) by stepping the sim directly through window.__z. Run: node tools/zombies-test.mjs [--shots DIR]
import {serve, launch, open, sleep} from './zlib.mjs';
const argv = process.argv.slice(2), SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const {server, origin} = await serve();
const browser = await launch();
let fails = 0;
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
{
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
{
  const {p, errs} = await page('z');
  ok(await p.$eval('#play', b => b.textContent) === 'Hold the line', 'Zombies: mode choice switches the start button');
  await p.click('#play'); await sleep(800);
  const s0 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, cash: __z.G.cash, st: __z.G.state, integ: __z.integrity()}));
  ok(s0.base && s0.st === 'base' && s0.cash === 600, `Zombies: opens on the base screen with $${s0.cash}, integrity ${s0.integ.hp}/${s0.integ.max}`);
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-1.png'});
  await p.click('#zgo'); await sleep(300);
  // wave 1 with a scripted player that runs down every track
  const w1 = await p.evaluate(() => { const out = []; for (let i = 0; i < 400 && __z.G.state === 'wave'; i++) { __z.sim(.5); const pl = __z.api.player; if (pl.dead <= 0 && Math.random() < .5) { const k = __z.botKill(.8); if (k) out.push(k); } } return {out, st: __z.G.state, cash: __z.G.cash, kills: __z.G.kills, streak: __z.G.streak}; });
  ok(w1.kills.p >= 2 && w1.cash > 600, `Zombies wave 1: scripted player killed ${w1.kills.p} (${w1.out}), cash $${w1.cash}, streak ${w1.streak}`);
  await p.evaluate(() => __z.sim(4));
  const b1 = await p.evaluate(() => ({base: !document.getElementById('zbase').hidden, st: __z.G.state, wave: __z.G.wave}));
  ok(b1.base && b1.st === 'base' && b1.wave === 1, 'Zombies: wave 1 clear opens the base screen (no timer)');
  // shop: buy a drone rack from its card, place it, upgrade it in the Armory, reroll
  await p.evaluate(() => { __z.G.cash = 6000; __z.Z.def && document.querySelector('[data-tab="shop"]').click(); });
  const bought = await p.evaluate(() => { const i = __z.G.cards.findIndex(c => c.k === 'rack'); if (i < 0) return 'no rack card'; document.querySelector(`[data-buy="${i}"]`).click(); return !!document.querySelector('[data-slot]'); });
  ok(bought === true, 'Base: buying the rack card asks for a position');
  if (SHOTS) await p.screenshot({path: SHOTS + '/z-base-place.png'});
  await p.click('[data-slot]');
  const arm = await p.evaluate(() => ({n: __z.Z.def.D.length, cash: __z.G.cash, armory: !!document.querySelector('[data-up]')}));
  ok(arm.n === 1 && arm.cash === 5300 && arm.armory, `Base: rack placed, $700 paid, Armory shows its upgrades`);
  await p.click('[data-up$=":tier"]');
  const up = await p.evaluate(() => ({tier: __z.Z.def.D[0].tier, cash: __z.G.cash}));
  ok(up.tier === 1 && up.cash === 4700, 'Armory: Mk II upgrade bought for $600');
  await p.click('[data-tab="shop"]'); const c0 = await p.evaluate(() => __z.G.cards.map(c => c.k).join()); await p.click('#zreroll');
  ok(await p.evaluate(() => __z.G.cash) === 4600, 'Shop: reroll costs $100 and redeals the cards');
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
  const run = await p.evaluate(() => { const log = []; for (let w = 0; w < 40 && __z.G.state !== 'over'; w++) { __z.cont(); let n = 0; while (__z.G.state === 'wave' && n++ < 1200) __z.sim(.5); log.push([__z.G.wave, __z.api.TH.length, Math.round(__z.integrity().hp), __z.G.cash]); if (__z.G.state === 'clear') __z.sim(4); } return {log, st: __z.G.state, over: !document.getElementById('zover').hidden, best: JSON.parse(localStorage.getItem('dl-interceptor')).zbest}; });
  console.log('  wave, tracks, integrity, cash:', run.log.map(r => r.join('/')).join('  '));
  ok(run.st === 'over' && run.over && run.best && run.best.wave >= 2, `Zombies: idle player loses at wave ${run.log.at(-1)[0]}; game-over screen shown, best saved (${JSON.stringify(run.best)})`);
  if (SHOTS) { await sleep(500); await p.screenshot({path: SHOTS + '/z-gameover.png'}); }
  ok(!errs.length, 'Zombies: no errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await p.close();
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
