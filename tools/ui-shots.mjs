// UI screenshots: main menu, garage, in-match HUD (League + Dogfight) at 1280x720 and a phone-width menu.
//   node tools/ui-shots.mjs [--tag name]     writes shots/ui-<tag>-<view>.png (shots/ is gitignored); needs npm run build
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
const snap = p => p.evaluate(() => window.__dl?.snap() ?? null);
async function waitFor(p, f) { for (let t = 0; t < 600; t++) { const s = await snap(p); if (s && f(s)) return; await sleep(100); } throw new Error('timeout'); }
const shot = (p, n) => p.screenshot({path: path.join(out, `ui-${tag}-${n}.png`)});
try {
  const p = await browser.newPage(); await p.setViewport({width: 1280, height: 720});
  await p.goto(url); await waitFor(p, s => s.state === 'play'); await sleep(1500);
  await shot(p, 'menu');
  for (const [b, n] of [['#setbtn', 'settings'], ['#onlbtn', 'online']]) if (await p.$(b)) { await p.$eval(b, e => e.click()); await sleep(400); await shot(p, n); await p.keyboard.press('Escape'); await sleep(300); }
  if (await p.$('#garbtn')) { await p.$eval('#garbtn', e => e.click()); await sleep(1200); await shot(p, 'garage'); await p.$eval('#gok', e => e.click()); await sleep(300); }
  await p.$eval('#play', e => e.click()); await waitFor(p, s => !s.demo && s.state === 'play'); await sleep(2500);
  await shot(p, 'hud-league');
  await p.keyboard.press('c'); await sleep(800); await shot(p, 'hud-league-chase');
  await p.keyboard.press('Escape'); await sleep(600); await shot(p, 'pause');
  await p.$eval('#m_df', e => e.click()); await waitFor(p, s => s.OBSON && s.state === 'play'); await sleep(2500);
  await shot(p, 'hud-dogfight');
  const m = await browser.newPage(); await m.setViewport({width: 400, height: 860, isMobile: true, hasTouch: true});
  await m.goto(url); await waitFor(m, s => s.state === 'play'); await sleep(1500); await shot(m, 'menu-phone');
  console.log('ui-shots: wrote shots/ui-' + tag + '-*.png');
} finally { await browser.close(); server.close(); }
