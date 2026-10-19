// Frame-time comparison: Classic vs Zombies (wave 1 and a late wave), same weather and view. node tools/zombies-perf.mjs [wave]
import {serve, launch, open, sleep} from './zlib.mjs';
const W = +(process.argv[2] || 28);
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const frames = p => p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = now => { ts.push(now - last); last = now; if (ts.length < 180) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res({avg: +(ts.reduce((a, b) => a + b) / ts.length).toFixed(1), p50: +ts[90].toFixed(1), p95: +ts[171].toFixed(1)}); } }; requestAnimationFrame(f); }));
async function run(mode, setup) {
  const p = await open(b, origin + '/games/interceptor/', errs);
  await p.evaluate(m => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: m, wx: 'clear', cam: 0})), mode);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500); await p.click('#play'); await sleep(500);
  const info = await p.evaluate(setup, W); await sleep(1500);
  const f = await frames(p); await p.close(); return {...f, ...info};
}
const full = W => { const {api, G, Z} = __z, def = Z.def;
  [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['ew', 10], ['idome', 7], ['gdome', 11], ['rack', 12, 2], ['gepard', 13]].forEach(([t, s, l]) => { const d = def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
  __z.jump(W, 20000); G.next = __z.plan(W); __z.cont(); __z.sim(55); api.SITES.forEach(s => s.hp = s.max);
  return {tracks: api.TH.filter(api.live).length, shots: Z.def.shots.length}; };
console.log('classic       ', JSON.stringify(await run('classic', () => { __z.sim(5); return {tracks: __z.api.TH.length}; })));
console.log('zombies w1    ', JSON.stringify(await run('z', () => { __z.cont(); __z.sim(5); return {tracks: __z.api.TH.length}; })));
console.log(`zombies w${W}   `, JSON.stringify(await run('z', full)));
// stress: a late wave with nobody shooting for a while (tracks pile up), then a full defence wakes up mid-swarm
console.log(`zombies stress`, JSON.stringify(await run('z', W => { const {api, G, Z} = __z; __z.jump(W + 4, 0); G.next = __z.plan(W + 4); __z.cont(); __z.sim(70);
  api.SITES.forEach(s => s.hp = s.max); const keep = setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200);
  [['rack', 0, 3], ['rack', 3, 3], ['gepard', 1], ['gepard', 4], ['flak', 6], ['flak', 2], ['sam', 9], ['rack', 12, 2], ['gepard', 13], ['rack', 5, 4], ['flak', 8]].forEach(([t, s, l]) => { const d = Z.def.add(t, s); if (t === 'rack') { d.tier = l; d.cap = 4; } else d.lvl = 1; });
  Z.def.deploy(); __z.sim(3); return {tracks: api.TH.filter(api.live).length, shots: Z.def.shots.length}; })));
console.log('zombies stress, after the governor', JSON.stringify(await run('z', async W => { const {api, G, Z} = __z; __z.jump(W + 4, 0); G.next = __z.plan(W + 4); __z.cont(); __z.sim(70); setInterval(() => api.SITES.forEach(s => s.hp = s.max), 200); await new Promise(r => setTimeout(r, 6000)); return {tracks: api.TH.filter(api.live).length, govOff: Z.perf.off}; })));
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
