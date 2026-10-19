// Goal explosion screenshots + frame time: scores a goal in Freeplay with the quad parked in front of the goal, in FPV and chase cam,
// on the Neon Arena and an outdoor map, and grabs frames through the explosion. Runs the live modules through the Vite dev server.
//   node tools/goalfx-shots.mjs [--maps arena,meadow] [--gfx high|med|low]    writes shots/goalfx-<map>-<cam>-<ms>.png (shots/ is gitignored)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const {createServer} = await import('vite');
const arg = (n, d) => (i => i > 0 ? process.argv[i + 1] : d)(process.argv.indexOf(n));
const maps = arg('--maps', 'arena,meadow').split(','), gfx = arg('--gfx', 'high');
fs.mkdirSync('shots', {recursive: true});
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await puppeteer.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, env, args: ['--ignore-gpu-blocklist']});
const p = await b.newPage(); await p.setViewport({width: 1280, height: 720}); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(server.resolvedUrls.local[0] + 'app.html'); await new Promise(r => setTimeout(r, 6000));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.evaluate(async gfx => {
  const DF = await import('/src/modes/dogfight.js'), MA = await import('/src/modes/match.js'), {GS} = await import('/src/state.js'), R = await import('/src/render/renderer.js');
  R.setQuality(gfx); DF.setGame('free'); MA.startMatch(); GS.menuOpen = false;
  // park the quad each frame (no input), so the shots are framed the same every time
  window.__park = null; const loop = () => { const d = GS.player, k = window.__park; if (d && k) { d.p.set(...k.p); d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.q.set(...k.q); } requestAnimationFrame(loop); }; loop();
  // frame-time probe: rAF intervals over a window
  window.__ft = ms => new Promise(res => { const a = []; let l = performance.now(); const t0 = l; const f = n => { a.push(n - l); l = n; if (n - t0 < ms) requestAnimationFrame(f); else { a.sort((x, y) => x - y); res({n: a.length, mean: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2), p95: +a[Math.floor(a.length * .95)].toFixed(2)}); } }; requestAnimationFrame(f); });
}, gfx);
const perf = {};
for (const map of maps) for (const [cam, cm] of [['fpv', 0], ['chase', 1]]) {
  await p.evaluate(async (map, cm) => {
    const M = await import('/src/world/maps.js'), {GS} = await import('/src/state.js'), {ball} = await import('/src/physics/ball.js'), C = await import('/src/config/constants.js');
    M.setMap(map); GS.camMode = cm; GS.state = 'play'; GS.timeScale = 1;
    // quad 34 m out from the orange (-z) goal, looking into it, a little nose-down
    const a = cm ? 0 : .08; window.__park = {p: [6, 9, -(C.HL - 34)], q: [Math.sin(a / 2) * -1, 0, 0, Math.cos(a / 2)]};
    ball.p.set(0, 5, 0); ball.v.set(0, 0, 0);
  }, map, cm);
  await sleep(900);
  const pre = await p.evaluate(() => window.__ft(1500));
  await p.evaluate(async () => { const MA = await import('/src/modes/match.js'), {ball} = await import('/src/physics/ball.js'), C = await import('/src/config/constants.js'); ball.p.set(4, 5, -(C.HL + 6)); MA.goal(0); });
  const t0 = Date.now(); const during = p.evaluate(() => window.__ft(1500));
  for (const ms of [60, 200, 450, 800]) { const w = ms - (Date.now() - t0); if (w > 0) await sleep(w); await p.screenshot({path: `shots/goalfx-${map}-${cam}-${ms}.png`}); }
  perf[`${map}-${cam}`] = {pre, during: await during};
  await sleep(1800); await p.evaluate(async () => { const {GS} = await import('/src/state.js'); GS.state = 'play'; });
}
const info = await p.evaluate(async () => { const R = await import('/src/render/renderer.js'); return {qId: R.qId, gpu: (() => { try { const g = R.renderer.getContext(), d = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(d.UNMASKED_RENDERER_WEBGL); } catch (e) { return ''; } })()}; });
console.log(JSON.stringify({info, perf, errs}, null, 1));
await b.close(); await server.close(); process.exit(errs.length ? 1 : 0);
