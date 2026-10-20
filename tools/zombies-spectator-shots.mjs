// Screenshots of the Zombies Bot Spectator (games/interceptor/zspectate.js), headless: the Watch a bot card, the bot shopping with its caption,
// each camera in flight, the tuning panel and the end-of-run report. Run: node tools/zombies-spectator-shots.mjs [OUTDIR] [level] [difficulty 0-3]
import fs from 'node:fs';
import path from 'node:path';
import {serve, launch, open, frames, until, sleep, root} from './zlib.mjs';
const OUT = path.resolve(process.argv[2] || path.join(root, 'shots-spectator')), LV = process.argv[3] || 'Champion', D = +(process.argv[4] ?? 1);
fs.mkdirSync(OUT, {recursive: true});
const {server, origin} = await serve(); const browser = await launch({w: 1280, h: 720});
const errs = [], p = await open(browser, origin + '/games/interceptor/', errs, {w: 1280, h: 720});
await p.evaluate((lv, d) => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0, zsfxv: 0, zspec: {lv, d}})), LV, D);
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z?.spec, {timeout: 120000}); await frames(p, 10);
const shot = async n => { await frames(p, 4); await p.screenshot({path: path.join(OUT, n + '.png')}); console.log('  ' + n + '.png'); };
await p.evaluate(() => { const c = document.getElementById('zspc'); c.open = true; c.scrollIntoView(); });
await shot('1-menu-card');
await p.click('#zspgo');
await until(() => p.evaluate(() => /Buying|Repairing|Upgrading|Opening|Selling/.test(document.getElementById('zspcap')?.textContent || '')), {timeout: 60000});
await shot('2-base-shopping');
await p.evaluate(() => __z.spec.setSpeed(8));
await until(() => p.evaluate(() => __z.G.state === 'wave'), {timeout: 120000});
await p.evaluate(() => __z.spec.setSpeed(1));
// fly until the bot is closing on something, then the cameras
await p.evaluate(() => { for (let i = 0; i < 120 && !/closing|detonating/.test(__z.spec.sp.pilot.intent); i++) __z.sim(.25); });
for (const c of ['chase', 'fpv', 'threat', 'sites', 'free']) { await p.evaluate(c => { __z.spec.setCam(c, true); __z.sim(.3); }, c); await sleep(300); await shot('3-cam-' + c); }
await p.evaluate(() => { __z.spec.setCam('chase'); __z.spec.toggleTune(); const d = document.querySelector('#zsptune details'); if (d) d.open = true; });
await shot('4-tuning');
await p.evaluate(() => { __z.spec.toggleTune(); __z.spec.setPause(true); });
await shot('5-paused');
// a few waves at sim speed, then the end: every site down
await p.evaluate(() => { __z.spec.setPause(false); const {G} = __z; for (let w = 0; w < 3 && G.state !== 'over'; w++) { if (G.state === 'base') { __z.spec.bench.shop(); __z.cont(); } __z.spec.bench.wave(); }
  if (G.state === 'base') { __z.spec.bench.shop(); __z.cont(); } const S = __z.api.SITES; S.forEach((s, i) => s.hp = i ? 0 : 1);
  __z.sim(20); const t = __z.make('shahed', S[0].x + 300, S[0].z - 300, S[0]); t.p.copy(t.aim); __z.Z.impact(t); });
await until(() => p.evaluate(() => !document.getElementById('zover').hidden), {timeout: 30000});
await shot('6-report');
console.log(errs.length ? 'errors:\n  ' + errs.join('\n  ') : 'no errors');
await browser.close(); server.close();
