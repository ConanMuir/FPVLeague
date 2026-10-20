// Frame-time comparison: Classic vs Zombies (wave 1 and a late wave), same weather and view. node tools/zombies-perf.mjs [wave] [--gfx=high,med,low]
// --haze: with the distance haze on; --only=classic,w28: only the scenarios whose label contains one of these.
// --gfx: Graphics quality levels to measure (engine/gfx.js); each scenario runs once per level, back to back, so the levels see the same machine
// load. Without it the setting is left at its default (Auto). Headless numbers are pessimistic; compare them with each other, not with a real GPU.
import {serve, launch, open, sleep} from './zlib.mjs';
const arg = process.argv.slice(2), W = +(arg.find(a => /^\d+$/.test(a)) || 28), LV = (arg.find(a => a.startsWith('--gfx='))?.slice(6) || '').split(',').filter(Boolean),
  HAZE = arg.includes('--haze'), ONLY = (arg.find(a => a.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean);
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const frames = p => p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = now => { ts.push(now - last); last = now; if (ts.length < 180) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res({avg: +(ts.reduce((a, b) => a + b) / ts.length).toFixed(1), p50: +ts[90].toFixed(1), p95: +ts[171].toFixed(1)}); } }; requestAnimationFrame(f); }));
async function run1(mode, setup, arg, wx, gfx) {
  const p = await open(b, origin + '/games/interceptor/', errs);
  await p.evaluate((m, g, hz) => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: m, wx: 'clear', zwx: 'menu', cam: 0, ...(g ? {gfx: g} : {}), ...(hz ? {haze: true} : {})})), mode, gfx, HAZE);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z, {timeout: 120000}); await sleep(500); await p.click('#play'); await sleep(500);
  const info = await p.evaluate(setup, arg); if (wx) await p.evaluate(id => { __z.api.S.zwx = 'wave'; __z.Z.wx.set(id); }, wx); await sleep(1500);
  const f = await frames(p); await p.close(); return {...f, ...info};
}
async function run(label, mode, setup, arg = W, wx = null) {
  if (ONLY.length && !ONLY.some(o => label.includes(o))) return;
  for (const g of LV.length ? LV : [null]) console.log((label + (g ? ' ' + g : '')).padEnd(20), JSON.stringify(await run1(mode, setup, arg, wx, g)));
}
const full = W => { const {api, G, Z} = __z, def = Z.def;
  [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13]].forEach(([t, s, l]) => { const d = def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
  __z.jump(W, 20000); G.next = __z.plan(W); __z.cont(); __z.sim(55); api.SITES.forEach(s => s.hp = s.max);
  return {tracks: api.TH.filter(api.live).length, shots: Z.def.shots.length}; };
await run('classic', 'classic', () => { __z.sim(5); return {tracks: __z.api.TH.length}; });
await run('zombies w1', 'z', () => { __z.cont(); __z.sim(5); return {tracks: __z.api.TH.length}; });
await run(`zombies w${W}`, 'z', full);
// stress: a late wave with nobody shooting for a while (tracks pile up), then a full defence wakes up mid-swarm
await run('zombies stress', 'z', W => { const {api, G, Z} = __z; __z.jump(W + 4, 0); G.next = __z.plan(W + 4); __z.cont(); __z.sim(70);
  api.SITES.forEach(s => s.hp = s.max); const keep = setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200);
  [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['rack', 12, 2], ['gepard', 13], ['rack', 5, 4], ['flak', 8]].forEach(([t, s, l]) => { const d = Z.def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
  Z.def.deploy(); __z.sim(3); return {tracks: api.TH.filter(api.live).length, shots: Z.def.shots.length}; });
// the heavier Zombies weathers at the same late wave (rain / snow particles, night effects, storm with lightning)
for (const id of ['storm', 'snow', 'night', 'dust']) await run(`zombies w${W} ${id}`, 'z', full, W, id);
// Auto: the governor (dynamic resolution, then the level) after 6 s of a slow wave
if (!LV.length || LV.includes('auto')) console.log('zombies stress, after the governor (Auto)', JSON.stringify(await run1('z', async W => { const {api, G, Z} = __z; __z.jump(W + 4, 0); G.next = __z.plan(W + 4); __z.cont(); __z.sim(70); setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200); await new Promise(r => setTimeout(r, 6000)); return {tracks: api.TH.filter(api.live).length, govOff: Z.perf.off, level: __z.gfx?.level, scale: __z.gfx?.scale}; }, W, null, 'auto')));
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
