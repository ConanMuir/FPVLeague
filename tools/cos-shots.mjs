// Screenshots of cosmetics: the Garage with several looks (both teams) and a League match with them on, into shots/cos/ (gitignored).
//   npm run build && node tools/cos-shots.mjs [--swiftshader]
// Also prints material / program / texture counts in the match (cosmetic materials are cached and shared, never per frame).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots', 'cos'); fs.mkdirSync(out, {recursive: true});
const SW = process.argv.includes('--swiftshader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
const server = http.createServer((q, r) => { r.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); r.end(html); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await launchBrowser({protocolTimeout: 180000,
  args: ['--window-size=1280,860', '--enable-unsafe-swiftshader', ...(SW ? ['--use-angle=swiftshader'] : ['--ignore-gpu-blocklist'])]});
const p = await browser.newPage(); await p.setViewport({width: 1280, height: 860});
const errors = []; p.on('pageerror', e => errors.push(String(e?.message || e))); p.on('console', m => { if (m.type() === 'error' && !/fonts\./.test(m.text())) errors.push(m.text()); });
const url = `http://127.0.0.1:${server.address().port}/`;
async function boot(tp) {
  await p.goto(url, {waitUntil: 'domcontentloaded'});
  await p.evaluate(tp => { const s = JSON.parse(localStorage.getItem('droneleague') || '{}'); s.tp = tp; localStorage.setItem('droneleague', JSON.stringify(s)); }, tp);
  await p.goto(url, {waitUntil: 'domcontentloaded'});
  for (let i = 0; i < 300 && !(await p.evaluate(() => window.__dl?.snap().drones.length)); i++) await sleep(100);
}
const click = sel => p.$eval(sel, e => e.click());
const view = (a, e, d) => p.evaluate((a, e, d) => window.__dl.garageView(a, e, d), a, e, d);
const shot = async (name, sel) => { await sleep(SW ? 1500 : 500); const el = sel ? await p.$(sel) : p; await el.screenshot({path: path.join(out, name + '.png')}); console.log('shots/cos/' + name + '.png'); };
const tab = s => p.evaluate(s => document.querySelector(`#gtabs button[data-s="${s}"]`).click(), s);
const wear = async (look, parts) => {
  await tab(4); await click('#gstock'); await tab(0); await click('#gstock');
  for (const [s, id] of parts || []) await click(`#gslots button[data-s="${s}"][data-id="${id}"]`);
  for (const [c, id] of Object.entries(look)) await click(`#gslots button[data-c="${c}"][data-id="${id}"]`);
};
const LOOKS = [
  ['stock', {}, []],
  ['stripes-candy', {paint: 'candy', decal: 'stripes', props: 'smoke', bell: 'black', led: 'white', trail: 'fire'}, []],
  ['n23-white-slim', {paint: 'white', decal: 'n23', props: 'black', bell: 'team', led: 'team', trail: 'team'}, [['1', 'slim']]],
  ['flames-matte-plank', {paint: 'matte', decal: 'flames', props: 'yellow', bell: 'red', led: 'yellow', trail: 'plasma'}, [['1', 'plank']]],
  ['hex-forged-brick', {paint: 'forged', decal: 'hex', props: 'glow', bell: 'oil', led: 'cyan', trail: 'rainbow'}, [['1', 'brick']]],
  ['tiger-gold-pod', {paint: 'gold', decal: 'tiger', props: 'clear', bell: 'ti', led: 'purple', trail: 'gold'}, [['1', 'pod']]],
  ['chrome-chevron', {paint: 'chrome', decal: 'chevron', props: 'amber', bell: 'gold', led: 'amber', trail: 'white'}, []],
  ['teammet-camo', {paint: 'teammet', decal: 'camo', props: 'pink', bell: 'purple', led: 'pink', trail: 'toxic'}, [['1', 'plank']]],
];
for (const tp of ['0', '1']) {
  await boot(tp);
  if (tp === '1') { await p.$eval('#menu', e => e.style.visibility = 'hidden'); await sleep(4000); await shot('demo-bots'); await p.$eval('#menu', e => e.style.visibility = ''); }  // menu demo: bots on random looks
  await click('#garbtn'); await sleep(800);
  for (const [name, look, parts] of tp === '0' ? LOOKS : LOOKS.filter(l => /chrome|stripes|n23/.test(l[0]))) {
    await wear(look, parts); await tab(4 + Math.min(5, Object.keys(look).length ? 1 : 0)); await view(3.75, .55, 2.9);
    await shot(`garage-${tp === '0' ? 'blue' : 'orange'}-${name}`);
    if (tp === '0' && /n23|flames|stripes/.test(name)) { await view(0.0001, 1.0, 2.6); await shot(`garage-blue-${name}-behind`); }
  }
  if (tp === '0') { for (const s of [4, 5, 6, 7, 8, 9]) { await tab(s); await shot(`tiles-${s}`, '.gside'); } }
}
// in match: blue team (tp 0) wearing a look, chase camera, bots on random cosmetics
await boot('0'); await click('#garbtn'); await sleep(500); await wear(LOOKS[1][1], []); await click('#gok');
await click('#play'); await sleep(1500); await p.keyboard.press('c'); await sleep(SW ? 3000 : 1500);
await shot('ingame-kickoff'); await sleep(5000); await shot('ingame-play');
const info = await p.evaluate(() => window.__dl.cosInfo?.());
console.log('render info', JSON.stringify(info));
console.log(errors.length ? 'errors:\n ' + errors.join('\n ') : 'no errors');
await browser.close(); server.close();
