// Fixed-camera screenshots of the outdoor League maps' surroundings (terrain, water, stadium from outside), via the window.__dlMapCam hook in world/maps.js.
//   node tools/map-views.mjs [--html dist/index.html] [--tag v] [--q high] [--maps meadow,canyon,alpine]
// Writes shots/<tag>-<map>-<q>-<view>.png (shots/ is gitignored).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(root, arg('html', 'dist/index.html')), tag = arg('tag', 'v'), QS = arg('q', 'high').split(','), MAPS = arg('maps', 'meadow,canyon,alpine').split(',');
const out = path.join(root, 'shots'); fs.mkdirSync(out, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const page0 = fs.readFileSync(html, 'utf8');
const server = http.createServer((q, r) => { r.writeHead(q.url.startsWith('/g') ? 200 : 404, {'content-type': 'text/html; charset=utf-8'}); r.end(q.url.startsWith('/g') ? page0 : ''); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/g`;
const browser = await launchBrowser({args: ['--window-size=1280,720', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']});
// arena half sizes for the default (Big) arena: HW 140, HL 180
const V = {
  meadow: {aerial: [[320, 200, 520], [0, 0, 0]], lake: [[330, 70, -20], [470, -2, -150]], hills: [[-250, 25, 260], [-520, 30, 520]], stand: [[80, 9, 120], [150, 14, 150]]},
  canyon: {aerial: [[320, 200, 520], [0, 0, 0]], river: [[-250, 40, 120], [-360, -2, -120]], mesas: [[200, 30, -280], [520, 60, -620]], stand: [[80, 9, 120], [150, 14, 150]]},
  alpine: {aerial: [[320, 200, 520], [0, 0, 0]], lake: [[-60, 55, -310], [-60, -2, -490]], peaks: [[260, 40, 200], [600, 150, 600]], stand: [[80, 9, 120], [150, 14, 150]]},
};
for (const q of QS) for (const map of MAPS) {
  const p = await browser.newPage(), errors = [];
  await p.setViewport({width: 1280, height: 720});
  p.on('pageerror', e => errors.push(String(e?.message || e)));
  await p.evaluateOnNewDocument(s => { try { localStorage.setItem('droneleague', s); } catch (e) {} }, JSON.stringify({map, game: 'league', gfx: q, cam: 1}));
  await p.evaluateOnNewDocument(() => addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'body>*:not(canvas){visibility:hidden!important}'; document.head.append(s); }));
  await p.goto(url, {waitUntil: 'domcontentloaded'});
  for (let t = 0; t < 600; t++) { if (await p.evaluate(() => !!window.__dl?.snap().drones.length && !!window.__dlMapCam)) break; await sleep(100); }
  for (const [v, [pos, tgt]] of Object.entries(V[map] || {})) {
    await p.evaluate((a, b) => window.__dlMapCam(a, b), pos, tgt); await sleep(700);
    await p.screenshot({path: path.join(out, `${tag}-${map}-${q}-${v}.png`)}); console.log(`  ${tag}-${map}-${q}-${v}.png`);
  }
  if (errors.length) console.log('  errors: ' + errors.slice(0, 5).join(' | '));
  await p.close();
}
await browser.close(); server.close();
