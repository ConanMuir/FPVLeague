// Shared headless-browser setup for every tool that drives puppeteer-core (smoke, the *-check and *-shots tools, zlib.mjs).
// Picks the browser in one place:
//   EDGE_PATH, then CHROME_PATH, then PUPPETEER_EXECUTABLE_PATH, then the platform's usual Edge / Chrome / Chromium install.
// Environment flags:
//   CI=true (set by GitHub Actions)  software WebGL (SwiftShader), no Chrome sandbox on Linux, timing checks warn-only
//   DL_SWIFTSHADER=1 / 0             force software WebGL on / off (default: on in CI, off locally)
//   DL_TIMING_WARN=1 / 0             timing (ms budget) checks only warn / fail (default: warn in CI, fail locally)
//   DL_NORENDER=1 / 0                skip WebGL draw calls except where a check asks for drawn frames (default: on in CI, off locally)
//   DL_HIGHGPU=1                     use the high-performance GPU on a dual-GPU laptop (headless otherwise picks the integrated one)
//   DL_CPU_THROTTLE=N                slow every page's CPU N times (Chrome DevTools throttling), to reproduce a slow CI runner locally
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const E = process.env, flag = (k, dflt) => E[k] == null || E[k] === '' ? dflt : !/^(0|false|no|off)$/i.test(E[k]);
export const CI = flag('CI', false);
export const SOFTWARE_GL = flag('DL_SWIFTSHADER', CI);
export const TIMING_WARN = flag('DL_TIMING_WARN', CI);
export const NO_RENDER = flag('DL_NORENDER', CI);
export const HIGH_GPU = flag('DL_HIGHGPU', false);

function candidates() {
  const pf = ['PROGRAMFILES(X86)', 'PROGRAMFILES', 'LOCALAPPDATA'].map(k => E[k]).filter(Boolean);
  if (process.platform === 'win32') return [
    ...pf.map(d => path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ...pf.map(d => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'))];
  if (process.platform === 'darwin') return ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  return ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
}
let found;
// the browser executable; exits with code 2 and a hint if none is found
export function findBrowser() {
  if (found) return found;
  for (const k of ['EDGE_PATH', 'CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH']) if (E[k]) {
    if (fs.existsSync(E[k])) return (found = E[k]);
    console.error(`${k}=${E[k]} does not exist`); process.exit(2);
  }
  found = candidates().find(p => fs.existsSync(p));
  if (!found) { console.error('No Edge / Chrome / Chromium found; set EDGE_PATH or CHROME_PATH to the browser executable'); process.exit(2); }
  return found;
}
// Edge exits at once if it inherits some host variables (e.g. __COMPAT_LAYER or VS Code's CHROME_CRASHPAD_PIPE_NAME)
export const browserEnv = Object.fromEntries(Object.entries(E).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));

// the tool's own args plus the environment's: software GL swaps the GPU flags for SwiftShader; Linux CI runners need --no-sandbox
export function browserArgs(args = []) {
  let a = args.filter(x => !(SOFTWARE_GL && /^--(ignore-gpu-blocklist|enable-gpu|use-angle=)/.test(x)));
  if (SOFTWARE_GL) a.push('--use-angle=swiftshader');
  else if (HIGH_GPU) a.push('--force_high_performance_gpu');
  if (!a.includes('--enable-unsafe-swiftshader')) a.push('--enable-unsafe-swiftshader');  // Chrome 137+ only falls back to SwiftShader with this
  if (CI && process.platform === 'linux') a.push('--no-sandbox', '--disable-dev-shm-usage');
  return [...new Set(a)];
}
// puppeteer.launch with the browser, env and args above; opts are passed through (protocolTimeout, defaultViewport, ...)
export async function launchBrowser(opts = {}) {
  let b;  // a CI runner sometimes fails to start the browser at all ("WS endpoint" timeout): try three times before giving up
  for (let i = 0; ; i++) {
    try { b = await puppeteer.launch({headless: true, ...opts, executablePath: findBrowser(), env: browserEnv, args: browserArgs(opts.args)}); break; }
    catch (e) { if (i >= 2) throw e; console.warn(`browser launch failed (${e.message.split('\n')[0]}), retrying`); await new Promise(r => setTimeout(r, 3000)); }
  }
  const np = b.newPage.bind(b);
  b.newPage = async (...a) => { const p = await np(...a); await installRenderStub(p); return p; };
  return b;
}

// ---------- no-render mode: the sim and UI run at full speed on software GL ----------
// SwiftShader draws the games at ~1 fps on a CI runner, and almost every check only needs simulation state. With NO_RENDER every
// page gets a WebGL stub: the draw calls (and clears / blits) are skipped while window.__dlNoRender is true. Everything else still
// runs: shaders compile and link, buffers and textures upload, three.js walks the scene, so GL errors still show. drawFrames()
// turns drawing back on for a few frames where a check wants real pixels drawn (each scene, each graphics quality, ...).
function renderStub(on) {
  window.__dlNoRender = on;
  const SKIP = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer'];
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of SKIP) {
    const f = C.prototype[m]; if (!f || f.__stub) continue;
    const g = function (...a) { if (window.__dlNoRender) return; return f.apply(this, a); }; g.__stub = true; C.prototype[m] = g;
  }
}
// force: stub this page even locally (a harness that needs no pixels and runs several game windows at once, tools/zombies-coop.mjs)
export const installRenderStub = async (p, force = false) => { if (+E.DL_CPU_THROTTLE > 1) await (await p.createCDPSession()).send('Emulation.setCPUThrottlingRate', {rate: +E.DL_CPU_THROTTLE});
  if (NO_RENDER || force) await p.evaluateOnNewDocument(renderStub, true); };
// draw n real frames (no-op locally, where everything is drawn anyway)
export async function drawFrames(page, n = 3) {
  if (!NO_RENDER) return;
  await page.evaluate(() => { window.__dlNoRender = false; });
  try { await frames(page, n); } finally { await page.evaluate(() => { window.__dlNoRender = true; }).catch(() => {}); }
}

// a timing check (ms budgets): fails locally, only warns in CI or with DL_TIMING_WARN=1. Returns true when it passed.
export function timingCheck(ok, msg, check) {
  if (ok || !TIMING_WARN) { check(ok, msg); return ok; }
  console.log('  WARN ' + msg + ' (timing check is warn-only here: ' + (CI ? 'CI' : 'DL_TIMING_WARN') + ')');
  if (E.GITHUB_ACTIONS) console.log('::warning title=timing check::' + msg.replace(/[\r\n]+/g, ' '));
  return false;
}

// state-driven waits: poll f() (async allowed) until it returns something truthy; on timeout return the last value
// (throw: true makes the timeout an Error naming `what`)
export async function until(f, {timeout = 30000, every = 50, what = 'a condition', throw: t = false} = {}) {
  const t0 = Date.now(); let v;
  for (;;) { v = await f(); if (v) return v; if (Date.now() - t0 > timeout) { if (t) throw new Error('timed out waiting for ' + what); return v; } await new Promise(r => setTimeout(r, every)); }
}
// wait until the page has drawn n more animation frames (the rendered state has caught up), however slow the frames are
export async function frames(page, n = 3, timeout = 60000) {
  await page.evaluate((n, timeout) => new Promise(res => { let k = 0; const t = setTimeout(res, timeout); const f = () => { if (++k >= n) { clearTimeout(t); res(); } else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n, timeout);
}
// wait for Drone League (app.html / dist/index.html) to boot: window.__dl is up and the demo has drones
export const gameReady = (page, timeout = SOFTWARE_GL ? 180000 : 60000) => page.waitForFunction(() => !!window.__dl?.snap().drones.length, {timeout, polling: 100});
