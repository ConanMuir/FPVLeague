// Shared bits for the Interceptor harnesses (tools/zombies-test.mjs, tools/zombies-shots.mjs): a static server for the repo that serves
// three.js from node_modules instead of jsDelivr (so the tests run offline and fast), and headless Microsoft Edge through puppeteer-core.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {launchBrowser, installRenderStub} from './browser.mjs';
export {frames, until, drawFrames} from './browser.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const threeDir = path.resolve(path.dirname(require.resolve('three')), '..');  // node_modules/three (main entry is build/three.cjs)
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png'};

export async function serve() {
  const server = http.createServer((q, r) => {
    let u = decodeURIComponent(q.url.split('?')[0]);
    let f;
    if (u.startsWith('/__three/')) f = path.join(threeDir, u.slice(9));
    else { if (u.endsWith('/')) u += 'index.html'; f = path.join(root, u); }
    if (!f.startsWith(root) && !f.startsWith(threeDir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {server, origin: `http://127.0.0.1:${server.address().port}`};
}

// the browser (Edge / Chrome, EDGE_PATH / CHROME_PATH) and CI flags come from tools/browser.mjs
export const launch = ({w = 1280, h = 720, sw = false} = {}) => launchBrowser({protocolTimeout: 600000,
  args: [`--window-size=${w},${h}`, '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', ...(sw ? ['--use-angle=swiftshader'] : ['--ignore-gpu-blocklist', '--enable-gpu'])]});

// a page in its own headless window: tabs behind the active one get no frames (no requestAnimationFrame, clicks never finish),
// so harnesses that run several pages at once (tools/zombies-coop.mjs) give each one a window
export async function newWindow(browser, {noRender = false} = {}) {  // noRender: stub its draw calls even locally (installRenderStub force)
  const s = await browser.target().createCDPSession();
  const {targetId} = await s.send('Target.createTarget', {url: 'about:blank', newWindow: true});
  const t = await browser.waitForTarget(t => t._targetId === targetId);
  await s.detach();
  const p = await t.page(); await installRenderStub(p, noRender); return p;
}
const benign = t => /fonts\.(googleapis|gstatic)\.com|favicon\.ico|net::ERR_FAILED|games\/interceptor\/version\.js/i.test(t);  /* version.js is generated (tools/version.mjs) and not in git: a checkout without it answers 404 and the debug report says "unknown" */
// open a page with three.js routed to the local copy; errors collects page errors and console errors
export async function open(browser, url, errors, {w = 1280, h = 720, page = null} = {}) {  // page: an already created page (e.g. its own window, see newWindow)
  const p = page || await browser.newPage();
  p.setDefaultNavigationTimeout(90000);  // a page load or reload is ~10 s on CI's software GL and can pass puppeteer's 30 s default on a busy runner
  await p.setViewport({width: w, height: h});
  await p.setRequestInterception(true);
  p.on('request', q => {
    const u = q.url();
    if (u.startsWith('https://cdn.jsdelivr.net/npm/three@0.160.0/')) {
      const f = path.join(threeDir, u.split('three@0.160.0/')[1].split('?')[0]);
      if (fs.existsSync(f)) return q.respond({status: 200, contentType: 'text/javascript; charset=utf-8', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(f)});
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return q.abort();
    q.continue();
  });
  p.on('error', e => errors.push('page crashed: ' + (e?.message || e)));
  p.on('pageerror', e => errors.push('pageerror: ' + (e?.message || e) + (e?.stack ? ' @ ' + String(e.stack).split('\n').slice(1, 4).map(t => t.trim()).join(' < ') : '')));
  p.on('console', m => { if (m.type() === 'error' && !benign(m.text() + ' ' + (m.location()?.url || ''))) errors.push('console.error: ' + m.text()); });
  await p.goto(url, {waitUntil: 'load', timeout: 120000});
  return p;
}
// brightness of the page as shown (WebGL canvas, overlay and DOM): a screenshot read back through a 2D canvas.
// Returns mean luma (0..255) and the share of near-white pixels (luma > 235) over the rectangle [x0, y0, x1, y1] in 0..1 page units.
export async function luma(p, [x0, y0, x1, y1] = [0, 0, 1, 1], png = null) {  // png: a base64 screenshot already taken (else one is taken now)
  png ??= await p.screenshot({encoding: 'base64'});
  return p.evaluate(async (png, r) => { const im = new Image(); im.src = 'data:image/png;base64,' + png; await im.decode();
    const c = document.createElement('canvas'), W = c.width = im.width, H = c.height = im.height, g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const X0 = Math.round(r[0] * W), Y0 = Math.round(r[1] * H), d = g.getImageData(X0, Y0, Math.max(1, Math.round(r[2] * W) - X0), Math.max(1, Math.round(r[3] * H) - Y0)).data;
    let s = 0, hot = 0, n = 0; for (let i = 0; i < d.length; i += 16) { const l = .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; s += l; if (l > 235) hot++; n++; }
    return {mean: +(s / n).toFixed(1), hot: +(hot / n).toFixed(3)}; }, png, [x0, y0, x1, y1]);
}
