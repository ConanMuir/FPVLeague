// Screenshots + frame time for the visuals pass: every map (League maps + Highlands) from fixed cameras, per graphics quality.
// Time is frozen through a requestAnimationFrame/performance.now shim, so the menu-demo orbit camera lands on the same spot every run.
//   node tools/shots.mjs [--html dist/index.html] [--tag after] [--q high,low] [--maps arena,meadow,canyon,alpine,df] [--no-perf] [--perf-all: time every map, not just arena/df] [--dpr 1] [--cam 1 (0 = FPV)]
// Writes shots/<tag>-<map>-<q>-<view>.png (shots/ is gitignored) and prints the average ms per frame (uncapped frame rate) per quality.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(root, arg('html', 'dist/index.html')), tag = arg('tag', 'after'), QS = arg('q', 'high,low').split(','), DPR = +arg('dpr', 1);
const MAPS = arg('maps', 'arena,meadow,canyon,alpine,df').split(','), PERF = !process.argv.includes('--no-perf'), SW = process.argv.includes('--swiftshader');
const out = path.join(root, 'shots'); fs.mkdirSync(out, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const page0 = fs.readFileSync(html, 'utf8');
const server = http.createServer((q, r) => { r.writeHead(q.url.startsWith('/g') ? 200 : 404, {'content-type': 'text/html; charset=utf-8'}); r.end(q.url.startsWith('/g') ? page0 : ''); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/g`;
const browser = await launchBrowser({protocolTimeout: 300000,
  args: ['--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    ...(SW ? ['--use-angle=swiftshader'] : ['--ignore-gpu-blocklist'])]});

// frozen clock: rAF callbacks get window.__T, advanced by window.__step ms per frame; real frame intervals go to window.__ft
const SHIM = `(()=>{const rp=performance.now.bind(performance);window.__T=1e5;window.__step=0;window.__ft=[];let lr=0;performance.now=()=>window.__T;
 const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(()=>{const r=rp();if(lr)window.__ft.push(r-lr);lr=r;window.__T+=window.__step;cb(window.__T)});
 addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='body>*:not(canvas){visibility:hidden!important}';document.head.append(s)})})();`;
async function open(settings) {
  const p = await browser.newPage(), errors = [];
  await p.setViewport({width: 1280, height: 720, deviceScaleFactor: DPR});
  p.on('pageerror', e => errors.push(String(e?.message || e)));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|favicon/.test(m.text())) errors.push(m.text()); });
  await p.evaluateOnNewDocument(SHIM);
  await p.evaluateOnNewDocument(s => { try { localStorage.setItem('droneleague', s); } catch (e) {} }, JSON.stringify(settings));
  await p.goto(url, {waitUntil: 'domcontentloaded'});
  for (let t = 0; t < 600; t++) { if (await p.evaluate(() => !!window.__dl?.snap().drones.length)) break; await sleep(100); }
  p.errors = errors; return p;
}
const frames = async (p, n) => { const c0 = await p.evaluate(() => window.__ft.length); for (let t = 0; t < 400; t++) { if (await p.evaluate(() => window.__ft.length) >= c0 + n) return; await sleep(25); } };
const shot = async (p, name) => { await frames(p, 4); await p.screenshot({path: path.join(out, name + '.png')}); console.log('  ' + name + '.png'); };
const perf = [];
for (const q of QS) for (const map of MAPS) {
  const df = map === 'df', p = await open({map: df ? 'arena' : map, game: df ? 'df' : 'league', gfx: q, cam: +arg('cam', 1)});
  const base = `${tag}-${map}-${q}`;
  // menu demo orbit: League t = now*4e-5, Highlands t = now*3e-5
  for (const [v, t] of (df ? [['orbitA', 0.4], ['orbitB', 3.6], ['orbitC', 5.2]] : [['orbitA', 4.0], ['orbitB', 1.1]])) { await p.evaluate(T => { window.__T = T; }, t / (df ? 3e-5 : 4e-5)); await shot(p, `${base}-${v}`); }
  // a match: chase cam behind the player at kickoff (time runs ~1.2 s so the camera settles, then freezes)
  await p.$eval('#play', e => e.click()); await p.evaluate(() => { window.__step = 16.7; }); await frames(p, 75); await p.evaluate(() => { window.__step = 0; }); await shot(p, `${base}-chase`);
  if (PERF && (map === 'arena' || df || process.argv.includes('--perf-all'))) {  // let the sim run and time real frames (uncapped)
    await p.evaluate(() => { window.__step = 16.7; window.__ft.length = 0; }); await frames(p, 240);
    const ft = await p.evaluate(() => window.__ft.slice(20)); const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    perf.push(`${map.padEnd(6)} ${q.padEnd(5)} ${avg.toFixed(2)} ms/frame (${(1000 / avg).toFixed(0)} fps, ${ft.length} frames)`);
  }
  if (p.errors.length) console.log('  errors: ' + p.errors.slice(0, 5).join(' | '));
  await p.close();
}
{ const p = await browser.newPage(); await p.goto(url); const r = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'), d = g?.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; }); console.log('renderer: ' + r); }
if (perf.length) console.log('frame time (' + tag + '):\n ' + perf.join('\n '));
await browser.close(); server.close();
