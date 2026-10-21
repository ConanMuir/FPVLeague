// Pop rings (src/render/popfx.js): screenshots of a Dribbler bot's earned pops and spent pops in a League 1v1 (plain touches get no ring),
// from the chase cam and FPV of that bot, and from 70 m away (the rings keep a minimum on-screen size). The sim is stepped by hand.
//   node tools/pop-shots.mjs [shots per view and kind]        writes shots/pop-<view>-<n>-<kind>.png (shots/ is gitignored)
import fs from 'node:fs';
import {launchBrowser} from './browser.mjs';
const {createServer} = await import('vite');
const PER = +process.argv[2] || 3;
fs.mkdirSync('shots', {recursive: true});
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await launchBrowser({protocolTimeout: 0,
  args: ['--window-size=1280,720', '--ignore-gpu-blocklist']});
const p = await b.newPage(); await p.setViewport({width: 1280, height: 720}); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|favicon|peerjs|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
await p.goto(server.resolvedUrls.local[0] + 'app.html'); await new Promise(r => setTimeout(r, 6000));
await p.addStyleTag({content: 'body>*:not(#gl),body>*:not(#gl) *{visibility:hidden!important}'});
await p.evaluate(async () => {
  const M = {DF: await import('/src/modes/dogfight.js'), MA: await import('/src/modes/match.js'), ST: await import('/src/modes/step.js'), B: await import('/src/physics/ball.js'),
    S: await import('/src/config/settings.js'), R: await import('/src/render/renderer.js'), V: await import('/src/render/visuals.js'), C: await import('/src/render/camera.js'),
    K: await import('/src/config/constants.js'), GS: (await import('/src/state.js')).GS};
  window.M = M; let now = performance.now(); window.requestAnimationFrame = () => 0;  // the game loop stops: only these frames draw
  const {GS, S} = {GS: M.GS, S: M.S.S}; S.size = 1; S.bots = 1; S.diff = M.K.DIFF.findIndex(d => d.n === 'Dribbler'); M.DF.setGame('league'); M.MA.startMatch();
  GS.paused = true; GS.menuOpen = false; const me = GS.player, bot = GS.drones.find(d => d.bot); GS.player = bot;  // the camera rides on the bot
  const rings = () => M.R.scene.children.filter(o => o.renderOrder === 10 && o.visible && o.material.opacity > .35);
  // run frames until a ring shows (kind by colour), with the view set; returns the kind
  window.until = (view, maxF, want) => { GS.camMode = view === 'fpv' ? 0 : 1; for (let f = 0; f < maxF; f++) {
      for (let k = 0; k < 2; k++) { me.p.set(80, 40, 120); me.v.set(0, 0, 0); M.ST.step(1 / 120); }
      for (const o of [M.B.ball, ...GS.drones]) o._pp = null; now += 1000 / 60; M.V.visuals(1 / 60, now); M.C.updateCam(1 / 60, now);
      if (view === 'far') { const c = M.R.camera, t = M.B.ball.p; c.position.set(t.x + 50, t.y + 25, t.z + 45); c.lookAt(t); }
      M.R.renderer.render(M.R.scene, M.R.camera);
      const r = rings(); for (const o of r) { const c = o.material.color.getHex(), k = c === 0xffc640 ? 'pop' : 'earn'; if (f > 2 && (!want || k === want)) return k; } }
    return null; };
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const view of ['chase', 'fpv', 'far']) for (const want of ['earn', 'pop']) for (let n = 0; n < PER; n++) {
  const kind = await p.evaluate((v, w) => until(v, 7200, w), view, want); if (!kind) { console.log(view, want, n, 'none in 120 s'); continue; }
  await sleep(50); const f = `shots/pop-${view}-${n}-${kind}.png`; await p.screenshot({path: f}); console.log('shot', f);
  await p.evaluate(v => until(v, 20) && 0, view);  // let that ring fade before looking for the next
}
console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs.slice(0, 5)) : 'no page errors');
await b.close(); await server.close(); process.exit(errs.length ? 1 : 0);
