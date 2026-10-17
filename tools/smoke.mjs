// Smoke test: drives headless Microsoft Edge (puppeteer-core) through the built game, dist/index.html, and fails on
// any page/console error or if the sim doesn't run. The same script also runs against the frozen v15 single file
// ("Drone League/drone-league.html", needs internet for its jsDelivr three.js) as a baseline and prints both side by side.
//   npm run smoke                 hardware WebGL if available (SwiftShader fallback)
//   npm run smoke -- --swiftshader  force software WebGL (slow; the sim runs in sim-time, so it just takes longer)
//   npm run smoke -- --no-baseline  skip the v15 baseline
// Needs `npm run build` first. Set EDGE_PATH if msedge.exe isn't in Program Files.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = new Set(process.argv.slice(2));
const SW = argv.has('--swiftshader'), BASELINE = !argv.has('--no-baseline');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- browser ----------
function findEdge() {
  const c = [process.env.EDGE_PATH, ...['PROGRAMFILES(X86)', 'PROGRAMFILES', 'LOCALAPPDATA'].map(k => process.env[k] && path.join(process.env[k], 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  const f = c.find(p => p && fs.existsSync(p));
  if (!f) { console.error('smoke: Microsoft Edge (msedge.exe) not found; set EDGE_PATH'); process.exit(2); }
  return f;
}
const EDGE = findEdge();
// Edge exits at once if it inherits some host variables (e.g. __COMPAT_LAYER or VS Code's CHROME_CRASHPAD_PIPE_NAME)
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const launch = () => puppeteer.launch({executablePath: EDGE, headless: true, env, protocolTimeout: 180000,
  args: ['--window-size=960,540', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', ...(SW ? ['--use-angle=swiftshader'] : ['--ignore-gpu-blocklist'])]});

// ---------- pages: dist/index.html, and the frozen v15 file wrapped as a full document with the same read-only hook ----------
const distFile = path.join(root, 'dist', 'index.html');
if (!fs.existsSync(distFile)) { console.error('smoke: dist/index.html missing; run npm run build'); process.exit(2); }
const pages = {'/new/': fs.readFileSync(distFile, 'utf8'), '/blank': '<!doctype html><title>blank</title>'};
// the claude.ai artifact form (no doctype/head/body), loaded as-is the way a bare file would be
{ const a = path.join(root, 'dist', 'drone-league.artifact.html'); if (fs.existsSync(a)) pages['/artifact/'] = fs.readFileSync(a, 'utf8'); }
{
  const old = fs.readFileSync(path.join(root, 'Drone League', 'drone-league.html'), 'utf8');
  const hook = 'window.__dl={snap:()=>({state,OBSON,demo,clock,score:[...score],ball:ball.p.toArray(),drones:drones.map(d=>({key:d.key,team:d.team,bot:d.bot,dead:d.dead,p:d.p.toArray()}))})};\n';
  const i = old.lastIndexOf('</script>');
  pages['/old/'] = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' +
    old.slice(0, i) + hook + old.slice(i) + '</body></html>';
}
const server = http.createServer((q, r) => {
  const b = pages[q.url.split('?')[0]];
  if (b == null) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); r.end(b);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---------- helpers ----------
const benign = t => /fonts\.(googleapis|gstatic)\.com|favicon\.ico/i.test(t);
async function open(browser, url, errors) {
  const p = await browser.newPage();
  await p.setViewport({width: 960, height: 540});
  p.on('pageerror', e => errors.push('pageerror: ' + (e?.message || e)));
  p.on('console', m => { if (m.type() === 'error' && !benign(m.text() + ' ' + (m.location()?.url || ''))) errors.push('console.error: ' + m.text()); });
  p.on('requestfailed', q => { if (!benign(q.url())) errors.push('request failed: ' + q.url() + ' ' + (q.failure()?.errorText || '')); });
  await p.goto(url, {waitUntil: 'domcontentloaded'});
  return p;
}
const snap = p => p.evaluate(() => window.__dl?.snap() ?? null);
async function waitFor(p, pred, ms, what) {
  const t0 = Date.now();
  for (;;) { const s = await snap(p); if (s && pred(s)) return s; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(100); }
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finite = s => [s.ball, ...s.drones.map(d => d.p)].every(v => v.every(Number.isFinite));
const key = async (p, k) => { await p.keyboard.press(k); await sleep(150); };
const click = async (p, sel) => { await p.$eval(sel, e => e.click()); await sleep(150); };
const text = (p, sel) => p.$eval(sel, e => (e.value ?? e.textContent));
const hidden = (p, sel) => p.$eval(sel, e => e.hidden);
// sample the sim for `simSec` seconds of match clock (the clock counts down in League and Dogfight)
async function run(p, simSec, wallMs) {
  const s0 = await snap(p), path_ = {}, t0 = Date.now(); let prev = s0, ballPath = 0, ballMaxY = s0.ball[1], s = s0, nan = false;
  while (s0.clock - s.clock < simSec && Date.now() - t0 < wallMs) {
    await sleep(200); s = await snap(p); if (!finite(s)) nan = true;
    ballPath += dist(prev.ball, s.ball); ballMaxY = Math.max(ballMaxY, s.ball[1]);
    for (const d of s.drones) { const o = prev.drones.find(x => x.key === d.key); if (o && d.dead <= 0 && o.dead <= 0) path_[d.key] = (path_[d.key] || 0) + dist(o.p, d.p); }
    prev = s;
  }
  const bots = s.drones.filter(d => d.bot).map(d => path_[d.key] || 0);
  return {sim: +(s0.clock - s.clock).toFixed(1), wall: +((Date.now() - t0) / 1000).toFixed(1), nan, ballPath: +ballPath.toFixed(1), ballMaxY: +ballMaxY.toFixed(1),
    ballFromCentre: +Math.hypot(s.ball[0], s.ball[2]).toFixed(1), botPathAvg: +(bots.reduce((a, b) => a + b, 0) / (bots.length || 1)).toFixed(1),
    botPathMin: +Math.min(...bots).toFixed(1), drones: s.drones.length, goals: s.score[0] + s.score[1], state: s.state};
}

// ---------- scenario: menu demo -> League vs bots -> Dogfight -> mod panel -> rates panel -> sensitivity setup ----------
async function scenario(label, url) {
  const browser = await launch(), errors = [], out = {label, errors};
  const wall = SW ? 240000 : 60000;
  try {
    const p = await open(browser, url, errors);
    await waitFor(p, s => s.drones.length > 0, 60000, 'the game to boot');
    out.renderer = await p.evaluate(() => { const g = document.querySelector('canvas#gl')?.getContext('webgl2'); const d = g?.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; });
    // menu demo: bots play behind the menu
    const d0 = await waitFor(p, s => s.state === 'play', wall, 'the demo kickoff to end'); await sleep(SW ? 6000 : 2000); const d1 = await snap(p);
    out.demo = {menuOpen: !(await hidden(p, '#menu')), moved: +Math.max(...d1.drones.map((d, i) => dist(d.p, d0.drones[i].p))).toFixed(1)};
    // Garage: open it, cycle every part in every slot, toggle the hitbox overlay, leave a non-stock loadout on
    if (await p.$('#garbtn')) {
      await click(p, '#garbtn'); const g = {open: !(await hidden(p, '#garage')), parts: 0, stats: []};
      for (const [s, id] of await p.$$eval('#gslots button', l => l.map(b => [b.dataset.s, b.dataset.id]))) {
        await click(p, `#gslots button[data-s="${s}"][data-id="${id}"]`); g.parts++; g.stats.push(await text(p, '#gstats div:first-child span:last-child'));
      }
      await click(p, '#ghit'); await sleep(300); await click(p, '#ghit');
      for (const [s, id] of [['0', 'stretch'], ['1', 'plank'], ['2', 'punch']]) await click(p, `#gslots button[data-s="${s}"][data-id="${id}"]`);
      g.name = await text(p, '#gname'); g.saved = await p.evaluate(() => JSON.parse(localStorage.getItem('droneleague') || '{}').loadout?.join('/'));
      await click(p, '#gok'); g.closed = await hidden(p, '#garage'); g.stats = new Set(g.stats).size; out.garage = g;
    }
    // League vs bots (default settings: 2v2, bots fill, Legend)
    await click(p, '#play');
    await waitFor(p, s => !s.demo && s.state === 'play', wall, 'League kickoff to end');
    out.league = await run(p, 10, wall * 2);
    { const s = await snap(p); out.league.player = s.drones.find(d => d.key === 'h')?.lo; out.league.botLoadouts = [...new Set(s.drones.filter(d => d.bot).map(d => d.lo))].length; }
    // Dogfight: open the menu, press the Dogfight mode button (starts a new match)
    await key(p, 'Escape'); out.menuAfterEsc = !(await hidden(p, '#menu'));
    await click(p, '#m_df');
    await waitFor(p, s => s.OBSON && s.state === 'play', wall, 'Dogfight kickoff to end');
    out.dogfight = await run(p, 4, wall);
    out.dogfight.title = await text(p, '#h1o');
    // camera / flight-mode keys while flying
    await key(p, 'c'); await key(p, 'c'); await key(p, 'c'); await key(p, 'm'); await key(p, 'm');
    // mod panel (T): Physics tab sliders, a slider change and reset, export
    await key(p, 't'); out.mod = {open: !(await hidden(p, '#mod'))};
    await click(p, '#tabp');
    out.mod.sliders = await p.$$eval('#modbody input[type=range]', l => l.length);
    await p.$eval('#m_grav', e => { e.value = '20'; e.dispatchEvent(new Event('input')); }); await sleep(200);
    out.mod.changed = await text(p, '#mo_grav');
    await p.$eval('#m_grav', e => e.parentNode.querySelector('.rs').click()); await sleep(200);
    out.mod.reset = await text(p, '#mo_grav');
    await click(p, '#mexp'); out.mod.export = await text(p, '#mio');
    // Rates tab: table, CLI export and import
    await click(p, '#tabr');
    out.rates = {inputs: await p.$$eval('#rbody input', l => l.length), maxRoll: await text(p, '#rm0')};
    await click(p, '#cexp'); out.rates.cliExport = (await text(p, '#cli')).split('\n').length;
    await p.$eval('#cli', e => { e.value = '# diff\nrateprofile 0\nset rates_type = ACTUAL\nset roll_rc_rate = 20\nset roll_srate = 80\nset roll_expo = 30\nset pitch_rc_rate = 20\nset thr_mid = 40'; });
    await click(p, '#cimp'); out.rates.cliImport = await text(p, '#rmsg'); out.rates.typeAfter = await text(p, '#rtype');
    await sleep(800);  // the rate graphs redraw every frame while the tab is open
    await click(p, '#mclose');
    // easy sensitivity setup walkthrough, from the menu
    await key(p, 'Escape');
    await click(p, '#sensbtn'); const sensOpen = !(await hidden(p, '#sens'));
    for (let i = 0; i < 3; i++) { await click(p, '#snext'); await sleep(200); }
    await click(p, '#snext');
    out.sens = {opened: sensOpen, closed: await hidden(p, '#sens'), msg: await text(p, '#calmsg')};
    // graphics quality: switch through every level live (render targets, MSAA/SMAA, shadow map and bloom get rebuilt)
    if (await p.$('#f_gfx')) for (const q of ['low', 'med', 'high', 'auto']) { await p.$eval('#f_gfx', (e, v) => { e.value = JSON.stringify(v); e.dispatchEvent(new Event('input')); }, q); await sleep(400); }
    out.gfx = await p.evaluate(() => JSON.parse(localStorage.getItem('droneleague') || '{}').gfx ?? null);
    // calibration start/cancel, then back into the match for a moment
    await click(p, '#calbtn'); await sleep(300); await click(p, '#calbtn');
    await click(p, '#resume'); await sleep(1000);
    out.final = await snap(p); out.final = {state: out.final.state, finite: finite(out.final)};
  } catch (e) { errors.push('scenario: ' + e.message); }
  await browser.close();
  return out;
}

// ---------- settings saved by v15 must load the same (localStorage 'droneleague') ----------
const SEED = {mode: 'angle', diff: 1, size: 3, tilt: 35, fov: 120, cam: 1, thrMode: 'spring', len: 120, dz: .05, name: 'Tester', tp: '1', map: 'canyon', ball: 'soccer', game: 'league',
  afire: false, fireBtn: 3, sboost: true, bots: 0, xcal: 'broken', xfire: 2, xflip: 1, flipBtn: 'a5', fireInv: true,
  mod: {thr: 124, maxv: 111, dl: .14, dq: .0065, spool: 30, dbounce: .2, wash: 1, boost: 140, bgrav: 5, grav: 30, kick: 2, bogus: 7, size: 99},
  presets: {Mine: {thr: 200}}, rpi: 2,
  rprof: [{type: 'ACTUAL', ax: [[7, 67, 0], [8, 70, 10], [5, 50, 0]], thrMid: 45, thrExpo: 20, thrLimit: 90}, {type: 'KISS', ax: [[100, 70, 0], [100, 70, 0], [100, 70, 0]], thrMid: 50, thrExpo: 0, thrLimit: 100},
    {type: 'BETAFLIGHT', ax: [[120, 75, 20], [120, 75, 20], [110, 70, 10]], thrMid: 50, thrExpo: 0, thrLimit: 300}]};
async function settings(label, url) {
  const browser = await launch(), errors = [], out = {label, errors};
  try {
    const p = await open(browser, origin + '/blank', errors);
    await p.evaluate(s => localStorage.setItem('droneleague', s), JSON.stringify(SEED));
    await p.goto(url, {waitUntil: 'domcontentloaded'});
    await waitFor(p, s => s.drones.length > 0, 60000, 'the game to boot');
    await sleep(500);
    out.saved = await p.evaluate(() => localStorage.getItem('droneleague'));
    out.ui = await p.evaluate(() => ['f_map', 'f_size', 'f_mode', 'f_tilt', 'rtype', 'rpi', 'm_thr', 'm_grav', 'fireb', 'ax0'].map(id => document.getElementById(id)?.value).join(' '));
  } catch (e) { errors.push('settings: ' + e.message); }
  await browser.close();
  return out;
}

// ---------- run ----------
let failed = false;
const fail = m => { failed = true; console.log('FAIL ' + m); };
const results = {new: await scenario('new (dist/index.html)', origin + '/new/')};
const set = {new: await settings('new', origin + '/new/')};
if (BASELINE) {
  results.old = await scenario('v15 baseline', origin + '/old/');
  set.old = await settings('v15 baseline', origin + '/old/');
}

const show = r => console.log(`\n== ${r.label}  [${r.renderer || '?'}]\n` + JSON.stringify({demo: r.demo, garage: r.garage, league: r.league, dogfight: r.dogfight, mod: r.mod, rates: r.rates, sens: r.sens, final: r.final}, null, 1).replace(/\n\s*/g, ' ') +
  (r.errors.length ? '\n  errors:\n   ' + r.errors.slice(0, 20).join('\n   ') : '\n  no errors'));
for (const k in results) show(results[k]);

// checks on the new build
const n = results.new;
if (n.errors.length) fail(`${n.errors.length} error(s) in the new build`);
const chk = (ok, m) => { if (!ok) fail(m); };
chk(n.demo?.menuOpen && n.demo.moved > 0.5, 'menu demo: bots should be flying behind the menu');
chk(n.league && n.league.sim >= 9 && !n.league.nan, 'League: sim should run 10 s without NaN');
chk(n.league && n.league.ballPath > 1 && n.league.botPathMin > 5, 'League: ball and every bot should move');
chk(n.menuAfterEsc, 'Esc should open the menu');
chk(n.garage?.open && n.garage.closed && n.garage.parts === 15 && n.garage.stats > 5 && n.garage.saved === 'stretch/plank/punch', 'garage: opens, cycles all 15 parts, saves the loadout, closes');
chk(n.league?.player === 'stretch/plank/punch', 'League: the player should fly the garage loadout');
chk(n.league?.botLoadouts >= 2, 'League: bots should spawn with varied loadouts');
chk(n.dogfight && n.dogfight.sim >= 3 && !n.dogfight.nan && n.dogfight.botPathMin > 5 && n.dogfight.title === 'DOGFIGHT', 'Dogfight: should start and bots should fly');
chk(n.mod?.open && n.mod.sliders === 34 && /^20\.0 /.test(n.mod.changed) && /^34\.5 /.test(n.mod.reset) && n.mod.export === '{}', 'mod panel: 34 sliders, change, reset, export');
chk(n.rates?.inputs === 9 && +n.rates.maxRoll > 0 && n.rates.cliExport >= 15 && /^Imported 6 values/.test(n.rates.cliImport) && n.rates.typeAfter === 'ACTUAL', 'rates panel: table, CLI export/import');
chk(n.sens?.opened && n.sens.closed && /Sensitivity saved/.test(n.sens.msg), 'easy sensitivity setup should open, step through and save');
chk(n.final?.finite && n.final.state, 'game should still be running at the end');
chk(n.gfx === 'auto', 'graphics quality should switch live through Low/Medium/High/Auto and save');
if (set.new.errors.length) fail('settings load: ' + set.new.errors.join('; '));
{
  let s = null; try { s = JSON.parse(set.new.saved); } catch {}
  chk(s && s.loadout?.join('/') === 'stock/stock/stock', 'v15 settings: the loadout should migrate to Stock');
  chk(s && s.physV === 3 && s.mod.thr === 345 && s.mod.grav === 30 && s.mod.kick === 2 && s.mod.size === 2.5 && !('bogus' in s.mod) && s.map === 'canyon' && s.rprof[2].thrLimit === 100 && s.xcal.length === 4 && s.gfx === 'auto',
    'v15 settings: migrations (physV 3, 6S defaults, clamping, rate profiles, graphics quality Auto) should apply');
}
console.log('\n== settings from a v15 save\n new: ' + set.new.ui);
if (set.old) {
  console.log(' v15: ' + set.old.ui);
  if (set.old.errors.length || !set.old.saved) console.log('WARN baseline settings run failed: ' + set.old.errors.join('; '));
  else {
    // settings added after v15 (with defaults) are left out of the comparison
    const NEWKEYS = ['gfx', 'loadout'], ns = (() => { try { const o = JSON.parse(set.new.saved); for (const k of NEWKEYS) delete o[k]; return JSON.stringify(o); } catch { return set.new.saved; } })();
    chk(set.old.saved === ns, 'the migrated localStorage settings differ from v15:\n  v15 ' + set.old.saved + '\n  new ' + ns); chk(set.old.ui === set.new.ui, 'settings UI differs from v15'); if (set.old.saved === ns) console.log(' saved settings identical to v15 after migration (ignoring ' + NEWKEYS.join(', ') + ')'); }
}
// baseline comparison: nondeterministic, so only a broad sanity check
if (results.old) {
  const o = results.old;
  if (o.errors.length || !o.league) console.log('WARN baseline did not run cleanly (it needs internet for jsDelivr): ' + o.errors.slice(0, 3).join('; '));
  else {
    console.log('\n== new vs v15 (10 s League, 4 s Dogfight; nondeterministic, so broad ranges only)');
    for (const [m, k] of [['league', 'ballPath'], ['league', 'ballMaxY'], ['league', 'botPathAvg'], ['dogfight', 'botPathAvg']]) {
      const a = n[m]?.[k], b = o[m]?.[k]; const ok = a != null && b != null && a <= Math.max(b * 4, b + 40) && a >= Math.min(b / 4, b - 40);
      console.log(` ${(m + '.' + k).padEnd(20)} new ${String(a).padStart(7)}  v15 ${String(b).padStart(7)}  ${ok ? 'ok' : 'DIFFERENT'}`);
      if (!ok) fail(`${m}.${k} is far from the v15 baseline`);
    }
  }
}
// the artifact form should boot too
if (pages['/artifact/']) {
  const browser = await launch(), errors = [];
  try {
    const p = await open(browser, origin + '/artifact/', errors);
    const a = await waitFor(p, s => s.state === 'play', SW ? 240000 : 60000, 'the artifact demo to start');
    await sleep(1500); const b = await snap(p);
    const moved = Math.max(...b.drones.map((d, i) => dist(d.p, a.drones[i].p)));
    console.log(`
== artifact form (dist/drone-league.artifact.html): demo bots moved ${moved.toFixed(1)} m, ${errors.length} error(s)`);
    if (!(moved > .5)) fail('artifact form: demo should run');
  } catch (e) { errors.push(e.message); }
  if (errors.length) fail('artifact form: ' + errors.join('; '));
  await browser.close();
} else fail('dist/drone-league.artifact.html missing (npm run build runs tools/postbuild.mjs)');
server.close();
console.log(failed ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failed ? 1 : 0);
