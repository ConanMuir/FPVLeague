// Gameplay effects (src/render/effects.js): screenshots of scripted scenarios in chase and FPV, plus frame time with the effects on/off.
// Runs the live modules in headless Edge through the Vite dev server; the sim is stepped by hand (the game loop is paused) so shots repeat.
//   node tools/fx-shots.mjs [--only boost,hover,tumble,hit] [--maps arena,meadow,canyon,alpine] [--q high] [--no-perf] [--no-shots]
// Writes shots/fx-<scenario>-<cam>.png (shots/ is gitignored) and prints frame times per quality.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const {createServer} = await import('vite');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', 'boost,hover,tumble,hit').split(','), MAPS = arg('maps', 'arena,meadow,canyon,alpine').split(','), Q = arg('q', 'high');
const PERF = !process.argv.includes('--no-perf'), SHOTS = !process.argv.includes('--no-shots');
fs.mkdirSync('shots', {recursive: true});
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await puppeteer.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, env, protocolTimeout: 300000,
  args: ['--window-size=1280,720', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit']});
const p = await b.newPage(); await p.setViewport({width: 1280, height: 720}); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|favicon|peerjs|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
await p.goto(server.resolvedUrls.local[0]); await new Promise(r => setTimeout(r, 6000));
await p.addStyleTag({content: 'body>*:not(#gl),body>*:not(#gl) *{visibility:hidden!important}'});
await p.evaluate(async () => {
  const M = {DF: await import('/src/modes/dogfight.js'), MA: await import('/src/modes/match.js'), ST: await import('/src/modes/step.js'), I: await import('/src/input/input.js'),
    B: await import('/src/physics/ball.js'), S: await import('/src/config/settings.js'), R: await import('/src/render/renderer.js'), V: await import('/src/render/visuals.js'),
    C: await import('/src/render/camera.js'), MP: await import('/src/world/maps.js'), FX: await import('/src/render/effects.js'), GS: (await import('/src/state.js')).GS};
  window.M = M; let now = performance.now(); window.requestAnimationFrame = () => 0;  // stops the game loop: only these frames draw
  // one rendered frame of 1/60 s: two sim ticks (keys + a per-tick hook), effects, camera, draw
  window.frames = (n, hook) => { const {GS} = M; for (let f = 0; f < n; f++) { for (let k = 0; k < 2; k++) { hook?.(GS.player, f, k); M.ST.step(1 / 120); }
    for (const o of [M.B.ball, ...GS.drones]) o._pp = null; now += 1000 / 60; GS.player.boost = 100; M.V.visuals(1 / 60, now); M.C.updateCam(1 / 60, now); if (window.side) { const c = M.R.camera, d = GS.player; c.position.copy(d.p).add(d.p.clone().set(22, 5, -6)); c.lookAt(d.p.x, d.p.y, d.p.z - 8); d.mesh.visible = true; } M.R.draw(); } };
  window.setup = (map, q, cam) => { const {GS} = M; M.S.S.sboost = true; M.S.S.map = map; M.R.setQuality(window.Q || q); M.DF.setGame('free'); M.MA.startMatch(); M.MP.setMap(map);
    GS.paused = true; GS.state = 'play'; GS.menuOpen = false; window.side = cam === 2; GS.camMode = cam === 2 ? 1 : cam; GS.shake = 0; for (const k in M.I.keys) delete M.I.keys[k];
    const d = GS.player; d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.wt.set(0, 0, 0); d.q.set(0, 0, 0, 1); M.B.ball.p.set(60, 2.6, 60); M.B.ball.v.set(0, 0, 0); return d; };
});
const CN = ['fpv', 'chase', 'side'];
if (Q !== 'high') await p.evaluate(q => { window.Q = q; }, Q);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { await sleep(50); await p.screenshot({path: `shots/fx-${name}${Q === 'high' ? '' : '-' + Q}.png`}); console.log('shot', name); };
// scenarios: each sets the player up, runs frames, returns; cam 1 = chase, 0 = FPV
const SC = {
  boost: async (cam) => { await p.evaluate(cam => { const d = setup('arena', 'high', cam); const {QT, V3} = {QT: d.q.constructor, V3: d.p.constructor};
    d.p.set(0, 12, 60); d.q.setFromAxisAngle(new V3(1, 0, 0), -.75); d.v.set(0, 0, -50); M.I.keys.ShiftLeft = true; M.I.keys.KeyW = true;
    frames(40, (d) => { d.w.set(0, 0, 0); if (d.p.y > 14) d.v.y = Math.min(d.v.y, 0); }); }, cam); await shot('boost-' + CN[cam]); },
  hover: async (cam) => { for (const map of MAPS) { await p.evaluate((cam, map) => { const d = setup(map, 'high', cam); d.p.set(0, 3.2, 40); M.I.keys.KeyW = true;
      const q = d.q.clone().setFromAxisAngle(d.p.clone().set(1, 0, 0), -.5); frames(70, (d) => { d.p.y = 3.2; d.v.y = 0; d.v.x = 2; d.v.z = -6; d.w.set(0, 0, 0); d.q.copy(q); }); }, cam, map); await shot(`hover-${map}-${CN[cam]}`); } },
  tumble: async (cam) => { for (const map of ['arena', 'meadow']) for (const at of [14, 32, 100]) { await p.evaluate((cam, map, at) => { const d = setup(map, 'high', cam); const V3 = d.p.constructor;
      d.p.set(0, 5, 60); d.q.setFromAxisAngle(new V3(1, 0, 0), -.35); d.v.set(0, -18, -55); M.I.keys.KeyS = true; frames(at); }, cam, map, at); await shot(`tumble-${map}-${at}-${CN[cam]}`); } },
  hit: async (cam) => { for (const at of [3, 10]) { await p.evaluate((cam, at) => { const d = setup('arena', 'high', cam); d.p.set(0, 9, 30); d.v.set(0, 0, -75);
      M.B.ball.p.set(0, 9, 0); M.B.ball.v.set(0, 0, 0); let n = 0;
      while (M.B.ball.v.z > -10 && n++ < 60) frames(1, (d) => { if (M.B.ball.v.z > -10) { M.B.ball.v.set(0, 0, 0); M.B.ball.p.set(0, 9, 0); d.v.set(0, 0, -75); d.p.y = 9; d.w.set(0, 0, 0); d.q.set(0, 0, 0, 1); } });
      frames(at); }, cam, at); await shot(`hit-${at}-${CN[cam]}`); } },
};
if (SHOTS) for (const s of ONLY) for (const cam of [1, 0, 2]) await SC[s](cam);
if (PERF) {
  // frame time: the real game loop (unpaused, uncapped), League 3v3 vs bots with super boost, the player pinned low and boosting; effects on vs off
  const pp = await b.newPage(); await pp.setViewport({width: 1280, height: 720}); pp.on('pageerror', e => errs.push(e.message));
  await pp.goto(server.resolvedUrls.local[0]); await new Promise(r => setTimeout(r, 6000)); await pp.addStyleTag({content: 'body>*:not(#gl),body>*:not(#gl) *{visibility:hidden!important}'});
  for (const q of ['high', 'low']) {
    const r = await pp.evaluate(async q => { const M = {DF: await import('/src/modes/dogfight.js'), MA: await import('/src/modes/match.js'), I: await import('/src/input/input.js'), S: await import('/src/config/settings.js'),
        R: await import('/src/render/renderer.js'), FX: await import('/src/render/effects.js')}, {GS} = await import('/src/state.js'); M.S.S.sboost = true; M.S.S.size = 3; M.S.S.bots = 1; M.R.setQuality(q); M.DF.setGame('league'); M.MA.startMatch(); GS.camMode = 1; GS.menuOpen = false;
      for (const k in M.I.keys) delete M.I.keys[k]; GS.paused = false; await new Promise(r => setTimeout(r, 3500));
      const pin = () => { const d = GS.player; if (!d) return; d.boost = 100; M.I.keys.ShiftLeft = true; if (d.p.y > 4) { d.p.y = 4; d.v.y = Math.min(0, d.v.y); } requestAnimationFrame(pin); }; pin();
      const meas = async on => { M.FX.FX.on = on; await new Promise(r => setTimeout(r, 800)); const ft = []; let l = performance.now(); M.FX.FX.ms = 0;
        await new Promise(res => { const f = t => { ft.push(t - l); l = t; if (ft.length < 400) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        ft.sort((a, b) => a - b); return {avg: +(ft.reduce((a, b) => a + b, 0) / ft.length).toFixed(2), p95: +ft[Math.floor(ft.length * .95)].toFixed(2), fxMsPerFrame: +(M.FX.FX.ms / ft.length).toFixed(3), live: on ? M.FX.FX.stats() : undefined}; };
      const out = {off1: await meas(false), on1: await meas(true), off2: await meas(false), on2: await meas(true), off3: await meas(false), on3: await meas(true)}; GS.paused = true; M.I.keys.ShiftLeft = false; return out; }, q);
    console.log('perf', q, JSON.stringify(r));
  }
}
console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs.slice(0, 5)) : 'no page errors');
await b.close(); await server.close(); process.exit(errs.length ? 1 : 0);
