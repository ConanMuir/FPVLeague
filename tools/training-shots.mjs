// Training screenshots: the Training hub, the pack browser, a shot waiting and in progress, the pack summary (1280x720, plus a phone width).
//   node tools/training-shots.mjs [--tag name]     writes shots/train-<tag>-<view>.png (shots/ is gitignored); needs npm run build
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = (i => i > 0 ? process.argv[i + 1] : 'now')(process.argv.indexOf('--tag'));
const out = path.join(root, 'shots'); fs.mkdirSync(out, {recursive: true});
const page0 = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8'), sleep = ms => new Promise(r => setTimeout(r, ms));
const server = http.createServer((q, r) => { r.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); r.end(page0); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const EDGE = [process.env.EDGE_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const browser = await puppeteer.launch({executablePath: EDGE, headless: true, env, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']});
const snap = p => p.evaluate(() => window.__dl?.snap() ?? null), tr = p => p.evaluate(() => window.__dl.train());
async function waitFor(p, f) { for (let t = 0; t < 600; t++) { const s = await snap(p); if (s && f(s)) return; await sleep(100); } throw new Error('timeout'); }
const shot = (p, n) => p.screenshot({path: path.join(out, `train-${tag}-${n}.png`)});
const click = (p, s) => p.$eval(s, e => e.click());
try {
  const p = await browser.newPage(); await p.setViewport({width: 1280, height: 720}); const errs = []; p.on('pageerror', e => errs.push(e.message));
  // a few best results so the browser shows progress
  await p.evaluateOnNewDocument(() => { try { const s = JSON.parse(localStorage.getItem('droneleague') || '{}'); if (!s.train) { s.train = {'striker-rookie': {n: 6, of: 8, t: 38.4}, 'striker-pro': {n: 2, of: 8, t: 17.9}, 'aerial-rookie': {n: 6, of: 6, t: 21.3}}; localStorage.setItem('droneleague', JSON.stringify(s)); } } catch {} });
  await p.goto(url); await waitFor(p, s => s.state === 'play'); await sleep(1500);
  await shot(p, 'menu');
  await click(p, '#trainbtn'); await sleep(500); await p.mouse.move(400, 400); await shot(p, 'hub');
  await click(p, '#packsbtn'); await sleep(400); await shot(p, 'packs');
  await click(p, '#ptabs [data-c=pops]'); await sleep(300); await p.hover('#ptiles .ptile.t1'); await sleep(300); await shot(p, 'packs-pops');
  await click(p, '#ptabs [data-c=striker]'); await sleep(200);
  await click(p, '#ptiles [data-id=striker-pro]'); await sleep(1500); await shot(p, 'ready');
  await p.keyboard.down('KeyW'); await sleep(250); await p.keyboard.up('KeyW'); await sleep(1600); await shot(p, 'live');
  await p.keyboard.press('KeyC'); await sleep(900); await shot(p, 'live-chase');
  // pops target shot in chase view
  await p.evaluate(() => { document.querySelector('#trnext').click(); }); for (let i = 0; i < 2; i++) { await p.keyboard.press('KeyN'); await sleep(150); }
  await sleep(700); await shot(p, 'ready-pass');
  await p.keyboard.press('Escape'); await sleep(500); await shot(p, 'pause'); await p.keyboard.press('Escape'); await sleep(300);
  // summary: skip to the end
  for (let i = 0; i < 9; i++) { await p.keyboard.press('KeyN'); await sleep(120); } await sleep(900); await shot(p, 'summary');
  // a pops pack with a target
  await click(p, '#trsback'); await sleep(500); await click(p, '#ptabs [data-c=pops]'); await sleep(200); await click(p, '#ptiles [data-id=pops-rookie]'); await sleep(800);
  for (let i = 0; i < 3; i++) { await p.keyboard.press('KeyN'); await sleep(150); } await sleep(800); await shot(p, 'pops-target');
  await p.keyboard.press('Escape'); await sleep(300); await click(p, '#leave'); await sleep(600); await click(p, '#ptabs [data-c=goalie]'); await click(p, '#ptiles [data-id=goalie-pro]'); await sleep(900); await shot(p, 'goalie-ready');
  await p.keyboard.down('KeyD'); await sleep(200); await p.keyboard.up('KeyD'); await sleep(1300); await shot(p, 'goalie-live');
  const m = await browser.newPage(); await m.setViewport({width: 400, height: 860, isMobile: true, hasTouch: true});
  await m.goto(url); await waitFor(m, s => s.state === 'play'); await sleep(1000); await click(m, '#trainbtn'); await sleep(300); await shot(m, 'hub-phone');
  await click(m, '#packsbtn'); await sleep(300); await shot(m, 'packs-phone'); await click(m, '#ptiles [data-id=striker-rookie]'); await sleep(1200); await shot(m, 'ready-phone');
  console.log('training-shots: wrote shots/train-' + tag + '-*.png', errs.length ? 'ERRORS ' + errs.join('; ') : 'no page errors', JSON.stringify(await tr(p)).slice(0, 200));
} finally { await browser.close(); server.close(); }
