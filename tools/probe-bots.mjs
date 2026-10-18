// Probe: League bots vs frame rate. Runs a solo match (no player input) for 10 s of match clock on dist/index.html and the
// frozen single file, each with the CPU unthrottled and throttled, and prints bot/ball movement plus frames per sim second.
//   node tools/probe-bots.mjs [runs]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), RUNS = +process.argv[2] || 2;
const EDGE = ['PROGRAMFILES(X86)', 'PROGRAMFILES'].map(k => process.env[k] && path.join(process.env[k], 'Microsoft', 'Edge', 'Application', 'msedge.exe')).find(p => p && fs.existsSync(p));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const old = fs.readFileSync(path.join(root, 'Drone League', 'drone-league.html'), 'utf8'), i = old.lastIndexOf('</script>');
const hook = 'window.__dl={snap:()=>({ts:timeScale,state,demo,clock,ball:ball.p.toArray(),drones:drones.map(d=>({key:d.key,bot:d.bot,p:d.p.toArray()}))})};\n';
const pages = {'/new/': fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8'),
  '/old/': '<!doctype html><html><head><meta charset="utf-8"></head><body>' + old.slice(0, i) + hook + old.slice(i) + '</body></html>'};
const server = http.createServer((q, r) => { const b = pages[q.url]; if (b == null) { r.writeHead(404); r.end(); return } r.writeHead(200, {'content-type': 'text/html'}); r.end(b) });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`, sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: EDGE, headless: true, env, args: ['--window-size=960,540', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']});
const snap = p => p.evaluate(() => window.__dl?.snap() ?? null);
async function waitFor(p, f) { for (let t = 0; t < 600; t++) { const s = await snap(p); if (s && f(s)) return s; await sleep(100) } throw new Error('timeout') }
async function one(url, throttle) {
  const p = await browser.newPage(); await p.setViewport({width: 960, height: 540});
  const cdp = await p.createCDPSession(); if (throttle) await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle});
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('probe')) { localStorage.clear(); sessionStorage.setItem('probe', 1) } } catch {} });
  await p.goto(origin + url); await waitFor(p, s => s.state === 'play');
  await p.evaluate(() => { window.__fr = 0; (function f() { window.__fr++; requestAnimationFrame(f) })() });
  await p.$eval('#play', e => e.click()); await waitFor(p, s => !s.demo && s.state === 'play');
  const f0 = await p.evaluate(() => window.__fr), s0 = await snap(p), t0 = Date.now();
  let prev = s0, bot = {}, ballPath = 0, maxY = 0, s = s0;
  while (s0.clock - s.clock < 10 && Date.now() - t0 < 120000) {
    await sleep(100); s = await snap(p);
    for (const d of s.drones) { const q = prev.drones.find(x => x.key === d.key); if (d.bot && q) bot[d.key] = (bot[d.key] || 0) + Math.hypot(...d.p.map((v, j) => v - q.p[j])) }
    ballPath += Math.hypot(...s.ball.map((v, j) => v - prev.ball[j])); maxY = Math.max(maxY, s.ball[1]); prev = s;
  }
  const sim = s0.clock - s.clock, fr = await p.evaluate(() => window.__fr) - f0, ts = s.ts; await p.close();
  const b = Object.values(bot);
  return `ts ${ts} ${url} cpu x${throttle || 1}: frames/sim-s ${(fr / sim).toFixed(0).padStart(3)}  wall ${((Date.now() - t0) / 1000).toFixed(1)}s  botAvg ${(b.reduce((a, c) => a + c, 0) / b.length).toFixed(0).padStart(4)}  botMin ${Math.min(...b).toFixed(0).padStart(4)}  ball ${ballPath.toFixed(0).padStart(4)}  ballMaxY ${maxY.toFixed(0)}`;
}
for (let r = 0; r < RUNS; r++) for (const url of ['/new/', '/old/']) for (const t of [0, 6]) console.log(await one(url, t));
await browser.close(); server.close();
