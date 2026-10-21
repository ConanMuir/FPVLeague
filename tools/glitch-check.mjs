// Visual glitch hunt for both games, headless: consecutive drawn frames while things move, checked for one-frame flicker, black / blown-out
// frames, non-finite or teleporting drawn positions, and a few geometric invariants.
//   node tools/glitch-check.mjs [parts] [--shots=DIR] [--n=40]
// parts (default: all): river  classic  zombies  league  dogfight
//   river     Interceptor terrain: the river's water ribbon never floats over dry ground (every ribbon edge buried in its bank, every
//             bank 70-300 m out above the water), checked against the drawn terrain mesh (no frames needed)
//   classic   Interceptor Classic: the menu demo and a flight on each camera (FPV, chase, threat), Graphics High / Medium / Low / Auto, every
//             weather, a weather change, pausing
//   zombies   Interceptor Zombies with the Bot Spectator flying: each camera, each Graphics level, the base screen opening and closing
//   league    Drone League (needs npm run build): the menu demo, League on each map and camera, kickoff, a goal, slow-mo, the replay
//   dogfight  Drone League Dogfight (the Highlands): each camera, in and out of a cave
// Frames are sampled at 192x108 straight after each drawn frame (requestAnimationFrame, after the game's own callback, before the
// frame is presented). For each frame i with neighbours i-1 and i+1:
//   flicker   in some 16x12 px cell, more than 45 % of the pixels are drawn for frame i only (differ from both neighbours, which agree):
//             a pop, a black or white flash, z-fighting, transparent sort swaps. Moving things change i-1 -> i+1 too, and thin moving lines
//             (markings, wires, rings) cover too little of a cell to pass.
//   black     more than 40 % of the frame near-black where its neighbours are not (a black flash, NaNs in the post chain)
//   blowout   more than 25 % of the frame clipped white where its neighbours are not (bloom fireflies, an exposure spike)
//   pop       a drawn object (camera, drones, ball, threats) is off its path for one frame (drawn at a wrong place, e.g. its sim instead
//             of its interpolated pose, or the origin)
//   sweep     a teleport drawn through an in-between frame (interpolation not cut after a respawn or a kickoff)
//   roll      the camera's up vector turns > 20 degrees in a frame, twice as much as its view direction (lookAt flipping at the vertical)
//   jump      (reported only) a drawn object leaves its constant-velocity path by more than 1.5 m: hits, camera cuts, hard turns
//   nan       a non-finite drawn position
// --shots=DIR writes each flagged frame with its neighbours (i-1, i, i+1, upscaled) and one full-size screenshot per scene to DIR.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {serve, launch, open, sleep, frames, until, root} from './zlib.mjs';
const A = process.argv.slice(2), arg = k => A.find(a => a.startsWith('--' + k + '='))?.split('=')[1];
const PARTS = new Set(A.filter(a => !a.startsWith('--')).length ? A.filter(a => !a.startsWith('--')) : ['river', 'classic', 'zombies', 'league', 'dogfight']);
const SHOTS = arg('shots') ? path.resolve(arg('shots')) : null, N = +(arg('n') || 40);
if (SHOTS) fs.mkdirSync(SHOTS, {recursive: true});
let fails = 0; const errs = [], summary = [];
const chk = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };

// ---------- in-page frame probe ----------
// installed once per page; __gp.run(n, canvasFn, trackFn) samples the next n drawn frames and resolves with per-frame stats and thumbnails
function installProbe() {
  if (window.__gp) return;
  const W = 192, H = 108, BX = 12, BY = 9, bw = W / BX, bh = H / BY, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', {willReadFrequently: true});
  // per block: the share of its pixels drawn for frame i only (differs from both neighbours by > 30, while the neighbours agree within 12)
  const flashB = (a, b, c) => { const o = new Float32Array(BX * BY), L = (d, i) => d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, la = L(a, i), lb = L(b, i), lc = L(c, i); if (Math.abs(la - lc) < 12 && Math.abs(lb - la) > 30 && Math.abs(lb - lc) > 30) o[((y / bh) | 0) * BX + ((x / bw) | 0)]++; } for (let k = 0; k < o.length; k++) o[k] = 100 * o[k] / (bw * bh); return o; };
  const diffB = (a, b) => { const o = new Float32Array(BX * BY); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; o[((y / bh) | 0) * BX + ((x / bw) | 0)] += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); } for (let k = 0; k < o.length; k++) o[k] /= bw * bh * 3; return o; };
  window.__gp = {W, H, BX, BY, run(n, canvasFn, trackFn) {
    return new Promise(res => {
      const F = [], px = []; let k = 0;
      const tick = now => {
        if (k >= n) { finish(); return; }
        requestAnimationFrame(tick);
        const src = canvasFn(); if (!src) return;
        g.drawImage(src, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data;
        let blk = 0, wht = 0, lum = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; lum += l; if (l < 6) blk++; if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) wht++; }
        let tr = null; try { tr = trackFn ? trackFn() : null; } catch (e) { tr = {err: String(e)}; }
        F.push({t: now, lum: lum / (W * H), black: blk / (W * H), white: wht / (W * H), tr, png: c.toDataURL('image/png')}); px.push(new Uint8ClampedArray(d)); k++;
      };
      const finish = () => {
        for (let i = 1; i < F.length - 1; i++) {
          const a = diffB(px[i - 1], px[i]), b = diffB(px[i], px[i + 1]), cc = diffB(px[i - 1], px[i + 1]), fx = flashB(px[i - 1], px[i], px[i + 1]);
          let best = -1e9, at = 0, ga = 0, gb = 0, gc = 0;
          for (let j = 0; j < a.length; j++) { ga += a[j]; gb += b[j]; gc += cc[j]; if (fx[j] > best) { best = fx[j]; at = j; } }
          F[i].flick = +best.toFixed(1); F[i].flickAt = [at % BX, (at / BX) | 0, +a[at].toFixed(1), +b[at].toFixed(1), +cc[at].toFixed(1)]; F[i].step = +(ga / a.length).toFixed(2); F[i].spike = +((Math.min(ga, gb) - gc) / a.length).toFixed(2);
        }
        res(F);
      };
      requestAnimationFrame(tick);
    });
  }};
}

// ---------- node side: flags from a frame sequence ----------
function analyse(tag, F) {
  const flags = [];
  const FT = 45;  /* % of a 16x12 cell drawn for one frame only: thin lines sweeping past (field markings, wires) stay well under it */
  for (let i = 1; i < F.length - 1; i++) {
    const f = F[i], p = F[i - 1], q = F[i + 1];
    if (f.flick > FT) flags.push({i, kind: 'flicker', v: f.flick, steps: f.flickAt});
    if (f.black > .4 && p.black < f.black - .3 && q.black < f.black - .3) flags.push({i, kind: 'black', v: +f.black.toFixed(2)});
    if (f.white > .25 && p.white < f.white - .2 && q.white < f.white - .2) flags.push({i, kind: 'blowout', v: +f.white.toFixed(2)});
  }
  // drawn positions, against the drawn sim time when the game gives it (a long frame or a capped dt is not a jump):
  //   pop    frame i off the path from i-1 to i+1 (time-weighted), and not by a cut (after a cut, i and i+1 agree): drawn somewhere wrong
  //          for one frame
  //   sweep  two big steps in a row between small ones: a teleport (respawn, kickoff) drawn through an in-between frame instead of cut
  //   jump   (reported, not failed) leaves its constant-velocity path by > 1.5 m and half its step: hits, cuts, hard turns
  const T = f => f.tr?.t ?? f.t / 1000, P = (f, id) => f?.tr?.o?.[id], D = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ids = new Set(); for (const f of F) if (f.tr && f.tr.o) for (const k in f.tr.o) ids.add(k);
  for (const id of ids) for (let i = 1; i < F.length - 1; i++) {
    const a = P(F[i - 1], id), b = P(F[i], id), c = P(F[i + 1], id); if (!a || !b || !c) continue;
    if (![...a, ...b, ...c].every(Number.isFinite)) { flags.push({i, kind: 'nan', id}); continue; }
    const t1 = T(F[i]) - T(F[i - 1]), t2 = T(F[i + 1]) - T(F[i]); if (t1 <= 1e-5 || t2 <= 1e-5) continue;
    const s1 = D(a, b), s2 = D(b, c), k = t1 / (t1 + t2), m = [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k], o = D(m, b);
    const e = Math.hypot(c[0] - b[0] - (b[0] - a[0]) * t2 / t1, c[1] - b[1] - (b[1] - a[1]) * t2 / t1, c[2] - b[2] - (b[2] - a[2]) * t2 / t1);
    if (o > 1 && o > .75 * D(a, c) + .5) flags.push({i, kind: 'pop', id, v: +o.toFixed(1), steps: [+s1.toFixed(2), +s2.toFixed(2)]});
    else if (e > 1.5 && e > .5 * (s1 + s2)) flags.push({i, kind: 'jump', id, v: +e.toFixed(1), steps: [+s1.toFixed(2), +s2.toFixed(2)]});
    const z = P(F[i - 2], id), w = P(F[i + 2], id);
    if (z && w && s1 > 3 && s2 > 3) { const q = Math.max(D(z, a), D(c, w)); if (Math.min(s1, s2) > 4 * q + 1 && Math.abs(s1 - s2) < .6 * Math.max(s1, s2)) flags.push({i, kind: 'sweep', id, v: +(s1 + s2).toFixed(1), steps: [+D(z, a).toFixed(2), +s1.toFixed(2), +s2.toFixed(2), +D(c, w).toFixed(2)]}); }
  }
  // camera orientation: a roll or turn of more than 20 degrees in one frame (a lookAt flipping over the vertical, a snap)
  const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))) * 180 / Math.PI;
  for (let i = 1; i < F.length; i++) { const a = F[i - 1].tr?.ax, b = F[i].tr?.ax; if (!a?.camU || !b?.camU) continue;
    const du = ang(a.camU, b.camU), df = ang(a.camF, b.camF), cut = D(F[i - 1].tr.o.cam, F[i].tr.o.cam) > 20;
    if (!cut && du > 20 && du > 2 * df) flags.push({i, kind: 'roll', v: +du.toFixed(0), steps: [+df.toFixed(1)]}); }
  for (const f of F) if (f.tr?.err) { flags.push({i: F.indexOf(f), kind: 'track-error', v: f.tr.err}); break; }
  const fl = F.slice(1, -1).map(f => f.flick), mx = Math.max(...fl), step = F.slice(1, -1).map(f => f.step).sort((x, y) => x - y)[(F.length - 2) >> 1];
  summary.push({tag, frames: F.length, maxFlick: mx, medStep: step, flags: flags.length});
  console.log(`  ${tag}: ${F.length} frames, motion ${step} /255 per frame, max flicker ${mx}${flags.length ? ', ' + flags.length + ' flag(s): ' + flags.slice(0, 6).map(f => `#${f.i} ${f.kind}${f.id ? ' ' + f.id : ''} ${f.v ?? ''}${f.steps ? ' [' + f.steps.join(' ') + ']' : ''}`).join('; ') : ''}`);
  if (SHOTS) for (const f of flags.slice(0, 8)) for (const d of [-1, 0, 1]) { const fr = F[f.i + d]; if (fr) fs.writeFileSync(path.join(SHOTS, `${tag}-f${f.i}-${f.kind}${d < 0 ? '-a' : d > 0 ? '-c' : '-b'}.png`), Buffer.from(fr.png.split(',')[1], 'base64')); }
  return flags;
}
async function seq(p, tag, canvasExpr, trackExpr, n = N) {
  await p.evaluate(installProbe);
  const F = await p.evaluate((n, ce, te) => window.__gp.run(n, new Function('return ' + ce)(), te ? new Function('return ' + te)() : null), n, canvasExpr, trackExpr);
  const fl = analyse(tag, F);
  if (SHOTS) await p.screenshot({path: path.join(SHOTS, tag + '.png')});
  return fl;
}
const expectClean = (tag, fl, kinds = ['flicker', 'black', 'blowout', 'pop', 'sweep', 'roll', 'nan', 'track-error']) => { const bad = fl.filter(f => kinds.includes(f.kind)); chk(!bad.length, `${tag}: no ${kinds.join(' / ')}${bad.length ? ' (' + bad.length + ': ' + bad.slice(0, 3).map(f => `#${f.i} ${f.kind}${f.id ? ' ' + f.id : ''} ${f.v ?? ''}`).join('; ') + ')' : ''}`); };

// ---------- Interceptor ----------
const IC = '()=>__z.api.renderer.domElement';
// drawn positions: the camera, the player's dart and every threat's mesh (world matrix, i.e. what was drawn)
const IT = `()=>{const {api}=__z,o={},c=api.camera;c.updateMatrixWorld();const E=c.matrixWorld.elements;o.cam=[E[12],E[13],E[14]];const ax={camU:[E[4],E[5],E[6]],camF:[-E[8],-E[9],-E[10]]};
 const me=api.player;if(me&&me.mesh&&me.mesh.visible&&me.dead<=0){const e=me.mesh.matrixWorld.elements;o.me=[e[12],e[13],e[14]]}
 for(const t of api.TH||[]){if(t.mesh&&t.mesh.visible&&t.mesh.parent){const e=t.mesh.matrixWorld.elements;o['t'+(t.id??api.TH.indexOf(t))]=[e[12],e[13],e[14]]}}return {o,ax,t:(api.tick-1+api.interp.alpha)/120}}`;
async function iPage(b, origin, store, q = '') {
  const p = await open(b, origin + '/games/interceptor/' + q, errs, {w: 1280, h: 720});
  await p.evaluate(s => localStorage.setItem('dl-interceptor', JSON.stringify(s)), store);
  await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z?.gfx, {timeout: 120000}); await frames(p, 20); return p;
}
const setSel = (p, id, v) => p.$eval('#f_' + id, (e, v) => { e.value = JSON.stringify(v); e.dispatchEvent(new Event('input')); }, v);

async function river(b, origin) {
  console.log('river');
  const p = await iPage(b, origin, {gmode: 'classic', wx: 'clear'});
  const r = await p.evaluate(() => {
    const {api} = __z, m = api.scene.children.find(o => o.userData.river); if (!m) return {missing: true};
    const P = m.geometry.attributes.position, out = {edges: P.count, buried: 0, worstEdge: -1e9, bank: 0, worstBank: -1e9};
    for (let i = 0; i < P.count; i += 2) {
      const x0 = P.getX(i), z0 = P.getZ(i), x1 = P.getX(i + 1), z1 = P.getZ(i + 1), y = P.getY(i), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.abs(cx) > 4300) continue;
      for (const [x, z] of [[x0, z0], [x1, z1]]) {
        const h = api.gh(x, z) - y; out.worstEdge = Math.max(out.worstEdge, -h); if (h > 0) out.buried++;
        const dx = (x - cx) / 68, dz = (z - cz) / 68;
        for (let o = 70; o <= 300; o += 10) { const d = y - api.gh(cx + dx * o, cz + dz * o); if (d > .01) out.bank++; out.worstBank = Math.max(out.worstBank, d); }
      }
    }
    out.checked = P.count; return out;
  });
  chk(!r.missing, 'the river mesh is tagged (userData.river)');
  if (!r.missing) {
    chk(r.worstEdge < 0, `every water ribbon edge is buried in its bank (${r.buried} edge points checked, the highest sits ${(-r.worstEdge).toFixed(2)} m under the ground)`);
    chk(r.bank === 0, `no dry bank 70-300 m from the river lies below the water (${r.bank} points below, worst ${r.worstBank.toFixed(2)} m)`);
  }
  await p.close();
}

async function classic(b, origin) {
  console.log('classic');
  const p = await iPage(b, origin, {gmode: 'classic', wx: 'clear', cam: 1, gfx: 'high', fps: false});
  expectClean('classic-demo', await seq(p, 'classic-demo', IC, IT));
  await p.click('#play'); await frames(p, 30);
  // the dart flies itself: throttle up and roll gently (keyboard), so the camera and the dart move and turn
  const fly = async on => p.evaluate(on => { const k = ['KeyW', 'KeyD']; for (const c of k) window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', {code: c, key: c.slice(3).toLowerCase()})); }, on);
  for (const [cam, cn] of [[0, 'fpv'], [1, 'chase'], [2, 'threat']]) {
    await p.evaluate(c => { __z.api.camMode = c; }, cam);
    for (const g of ['high', 'med', 'low', 'auto']) {
      await setSel(p, 'gfx', g); await frames(p, 10);
      await fly(true); expectClean(`classic-${cn}-${g}`, await seq(p, `classic-${cn}-${g}`, IC, IT)); await fly(false);
    }
  }
  await p.evaluate(() => { __z.api.camMode = 1; }); await setSel(p, 'gfx', 'high');
  const wx = await p.$$eval('#f_wx option', l => l.map(o => { try { return JSON.parse(o.value); } catch (e) { return o.value; } }).filter(v => v !== 'random'));
  for (const w of wx) {
    await p.evaluate(w => __z.api.setWeather(w), w); await frames(p, 15);
    expectClean(`classic-wx-${w}`, await seq(p, `classic-wx-${w}`, IC, IT, 24));
  }
  // a weather change mid-sequence: the switch itself must not flash
  await p.evaluate(w => setTimeout(() => __z.api.setWeather(w), 150), wx[0]);
  expectClean('classic-wx-change', await seq(p, 'classic-wx-change', IC, IT), ['black', 'blowout', 'pop', 'sweep', 'nan']);
  await p.close();
}

async function zombies(b, origin) {
  console.log('zombies');
  const p = await iPage(b, origin, {gmode: 'z', wx: 'clear', zwx: 'menu', zmus: 0, zsfxv: 0, gfx: 'high', fps: false, zspec: {lv: 'Champion', d: 1}});
  await p.waitForFunction(() => window.__z?.spec, {timeout: 120000});
  await p.evaluate(() => document.getElementById('zspgo').click());
  await until(() => p.evaluate(() => !!window.__z?.spec?.setSpeed && !!window.__z.G).catch(() => false), {timeout: 120000});
  await p.evaluate(() => __z.spec.setSpeed(8));
  await until(() => p.evaluate(() => window.__z?.G?.state === 'wave').catch(() => false), {timeout: 180000});
  await p.evaluate(() => __z.spec.setSpeed(1)); await frames(p, 60);
  for (const [cam, cn] of [[0, 'fpv'], [1, 'chase'], [2, 'threat']]) {
    await p.evaluate(c => { __z.api.camMode = c; }, cam);
    for (const g of ['high', 'med', 'low', 'auto']) { await setSel(p, 'gfx', g).catch(() => p.evaluate(g => __z.gfx.set?.(g), g)); await frames(p, 10); expectClean(`zombies-${cn}-${g}`, await seq(p, `zombies-${cn}-${g}`, IC, IT)); }
  }
  await p.close();
}

// ---------- Drone League ----------
const LC = `()=>document.querySelector('canvas#gl')`;
const LT = `()=>{const v=window.__dl.view?.();if(!v)return null;const t=v.t,ax={camU:v.camU,camF:v.camF};delete v.t;delete v.camU;delete v.camF;return {o:v,ax,t}}`;
async function lPage(b, origin) {
  const p = await open(b, origin + '/new/', errs, {w: 1280, h: 720});
  await p.waitForFunction(() => window.__dl?.snap?.().drones.length > 0, {timeout: 120000}); await frames(p, 30); return p;
}
const snap = p => p.evaluate(() => window.__dl.snap());
async function league(b, origin) {
  console.log('league');
  const p = await lPage(b, origin);
  expectClean('league-demo', await seq(p, 'league-demo', LC, LT));
  await p.$eval('#play', e => e.click());
  await until(() => p.evaluate(() => { const s = window.__dl.snap(); return !s.demo && s.state === 'play'; }), {timeout: 60000});
  const maps = await p.$$eval('#f_map option', l => l.map(o => JSON.parse(o.value)));
  for (const map of maps) {
    await setSel(p, 'map', map); await frames(p, 30);
    for (let c = 0; c < 3; c++) { expectClean(`league-${map}-cam${c}`, await seq(p, `league-${map}-cam${c}`, LC, LT)); await p.keyboard.press('c'); await frames(p, 5); }
  }
  await p.close();
}
async function dogfight(b, origin) {
  console.log('dogfight');
  const p = await lPage(b, origin);
  await p.keyboard.press('Escape'); await frames(p, 5); await p.$eval('#m_df', e => e.click());
  await until(() => p.evaluate(() => { const s = window.__dl.snap(); return s.OBSON && s.state === 'play'; }), {timeout: 90000}); await frames(p, 30);
  for (let c = 0; c < 3; c++) { expectClean(`dogfight-cam${c}`, await seq(p, `dogfight-cam${c}`, LC, LT)); await p.keyboard.press('c'); await frames(p, 5); }
  await p.close();
}

// ---------- run ----------
const {server, origin} = await serve();
let lserver = null, lorigin = null;
if (PARTS.has('league') || PARTS.has('dogfight')) {
  const f = path.join(root, 'dist', 'index.html'); if (!fs.existsSync(f)) { console.error('glitch-check: dist/index.html missing; run npm run build'); process.exit(2); }
  const html = fs.readFileSync(f, 'utf8');
  lserver = http.createServer((q, r) => { if (q.url.startsWith('/new/')) { r.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); r.end(html); } else { r.writeHead(404); r.end(); } });
  await new Promise(r => lserver.listen(0, '127.0.0.1', r)); lorigin = `http://127.0.0.1:${lserver.address().port}`;
}
const b = await launch({w: 1280, h: 720});
try {
  if (PARTS.has('river')) await river(b, origin);
  if (PARTS.has('classic')) await classic(b, origin);
  if (PARTS.has('zombies')) await zombies(b, origin);
  if (PARTS.has('league')) await league(b, lorigin);
  if (PARTS.has('dogfight')) await dogfight(b, lorigin);
} catch (e) { errs.push('glitch-check: ' + (e.stack || e.message)); }
await b.close(); server.close(); lserver?.close();
const real = errs.filter(e => !/favicon|ERR_FAILED|AudioContext/i.test(e));
chk(!real.length, `no page errors${real.length ? ': ' + real.slice(0, 5).join(' | ') : ''}`);
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(fails ? `glitch-check: ${fails} failure(s)` : 'glitch-check: all clean');
process.exit(fails ? 1 : 0);
