// Screenshots of every drone part on a Stock base, from the Garage preview, into shots/parts/ (gitignored).
//   npm run build && node tools/parts-shots.mjs [--swiftshader]
// Also: the whole Garage screen, Stock with the hitbox overlay, and a few angles of a mixed loadout.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots', 'parts'); fs.mkdirSync(out, {recursive: true});
const SW = process.argv.includes('--swiftshader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = [process.env.EDGE_PATH, ...['PROGRAMFILES(X86)', 'PROGRAMFILES', 'LOCALAPPDATA'].map(k => process.env[k] && path.join(process.env[k], 'Microsoft', 'Edge', 'Application', 'msedge.exe'))].find(p => p && fs.existsSync(p));
if (!EDGE) { console.error('Microsoft Edge not found; set EDGE_PATH'); process.exit(2); }
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
const server = http.createServer((q, r) => { r.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); r.end(html); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({executablePath: EDGE, headless: true, env, protocolTimeout: 180000,
  args: ['--window-size=1280,860', '--enable-unsafe-swiftshader', ...(SW ? ['--use-angle=swiftshader'] : ['--ignore-gpu-blocklist'])]});
const p = await browser.newPage(); await p.setViewport({width: 1280, height: 860});
const errors = []; p.on('pageerror', e => errors.push(String(e?.message || e))); p.on('console', m => { if (m.type() === 'error' && !/fonts\./.test(m.text())) errors.push(m.text()); });
await p.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded'});
for (let i = 0; i < 300 && !(await p.evaluate(() => window.__dl?.snap().drones.length)); i++) await sleep(100);
await p.$eval('#garbtn', e => e.click()); await sleep(800);
const click = sel => p.$eval(sel, e => e.click());
const view = (a, e, d) => p.evaluate((a, e, d) => window.__dl.garageView(a, e, d), a, e, d);
const shot = async (name, sel = '.gview') => { await sleep(SW ? 1500 : 450); const el = await p.$(sel); await el.screenshot({path: path.join(out, name + '.png')}); console.log('shots/parts/' + name + '.png'); };
const ids = await p.$$eval('#gslots button', l => l.map(b => [b.dataset.s, b.dataset.id]));
for (const [s, id] of ids) {
  await click('#gstock'); if (id !== 'stock' || s === '0') { await click(`#gslots button[data-s="${s}"][data-id="${id}"]`); }
  await view(3.75, .45, 3.1);
  await shot(`${['arms', 'chassis', 'power'][s]}-${id}`);
}
await click('#gstock'); await click('#ghit'); await view(3.75, .5, 3.1); await shot('stock-hitbox'); await click('#ghit');
for (const [s, id] of [['0', 'deadcat'], ['1', 'brick'], ['2', 'lr']]) await click(`#gslots button[data-s="${s}"][data-id="${id}"]`);
for (const [n, a, e] of [['front', 0, .25], ['side', Math.PI / 2, .2], ['top', 0.0001, 1.3]]) { await view(a, e, 3.1); await shot('mix-' + n); }
await click('#gstock'); await view(3.75, .45, 3.1); await shot('garage-screen', '.gbox');
// in game: League with a non-stock loadout, chase camera, bots on random loadouts
for (const [s, id] of [['0', 'truex'], ['1', 'pod'], ['2', 'hikv']]) await click(`#gslots button[data-s="${s}"][data-id="${id}"]`);
await click('#gok'); await click('#play'); await sleep(1200); await p.keyboard.press('c'); await sleep(SW ? 3000 : 1500);
await p.screenshot({path: path.join(out, 'ingame-chase.png')}); console.log('shots/parts/ingame-chase.png');
console.log(errors.length ? 'errors:\n ' + errors.join('\n ') : 'no errors');
await browser.close(); server.close();
