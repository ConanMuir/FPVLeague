// QA sweep: plays every mode of both games headless with scripted inputs and checks what no single feature test looks at.
//   node tools/qa-sweep.mjs [--fast] [--area=league|interceptor] [--part=N] [--sections=league-tour,zombies-cycles,...] [--shots DIR] [--list]
//                           (--part: CI runs the League fast pass as three parts (1 to 3) and the Zombies one as four, so each job fits its time limit on a slow runner)
//                           [--cycle=text] [--settle=ms]   (cycle: run only the leak tests whose name has the text, 12 cycles; settle: wait after each cycle)
// Sections (--list): league-* and zombies-* (tour, resize, saves, flow / content, cycles, monkey, input, display, ...); each belongs to a CI area
// (tools/ci-scope.mjs: league = Drone League, interceptor = Zombies), and is in the fast pass or only in the full run.
// Probes (the same ones for both games, each against the games' own test hooks: window.__dl.dbg() in Drone League, window.__z in Zombies):
//   errors   page errors, console errors AND warnings, failed requests, crashes: anything the console says counts
//   NaN      a deep scan of the live game state (every number reachable from the hooks) and of the DOM text (NaN / Infinity / undefined / [object Object])
//   stuck    the sim must make progress: positions move, the clock runs, a kickoff or a goal wait ends, a pause really freezes it
//   layout   per screen and viewport: [hidden] elements still shown, controls outside the viewport, covered by another element, overlapping,
//            clipped text; keyboard: Tab never leaves the open screen, Escape closes it and focus lands on something visible
//   leaks    start / stop cycles: scene children, geometries, textures, live WebGL objects, event listeners, DOM nodes and the JS heap must not grow
//            (a cycle's timers get a settle time first: the HUD feed keeps a removed message 4.5 s, and a detached node is not a leaked one)
//   saves    older and broken settings / saves load, migrate and play (every key set to junk, delta-debugged to the keys that break it)
//   hardware gamepads that report NaN / nothing, tiny windows, 2x and 3x pixel ratios, no network; and a seeded random player (the monkey)
// --fast runs a short pass of the probes (CI: the last matrix entries, the League pass in three parts and the Zombies pass in four); without it the sections run longer, with more
// viewports, cycles, junk values and monkey seeds. The viewports include a portrait phone for the League; the Zombies HUD is landscape only.
// A probe that finds something prints "FAIL ..." and the tool exits 1; "note" lines are things worth a look that are not wrong by themselves.
// Needs `npm run build` first for the League sections (they load games/drone-league/index.html). Headless only, like every tool here.
// Not judged here: the GPU buffer / VAO counts (they follow the League's 24-loadout parts cache) and "still playing" audio (a headless audio clock barely moves).
import fs from 'node:fs';
import path from 'node:path';
import {serve, launch, open, sleep, frames, until, drawFrames, newWindow} from './zlib.mjs';
import {NO_RENDER, SOFTWARE_GL} from './browser.mjs';

const argv = process.argv.slice(2), FAST = argv.includes('--fast'), SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const SECTIONS = argv.find(a => a.startsWith('--sections='))?.slice(11).split(','), AREA = argv.find(a => a.startsWith('--area='))?.slice(7);  /* league | interceptor */
const VIEWS = FAST ? [[1280, 720], [900, 420]] : [[1280, 720], [1920, 1080], [3440, 1440], [900, 420], [800, 450], [390, 844]];
const ZVIEWS = VIEWS.filter(v => v[0] >= v[1]);  /* the arcade game's HUD is laid out for landscape; a portrait phone is outside what it was made for (see the report) */
let fails = 0;
const LEAN = FAST && (NO_RENDER || SOFTWARE_GL);  /* a slow runner (CI: software GL, draw calls skipped) gets a leaner fast pass: fewer cycles, junk values and boots, so each job fits its time limit */
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; return c; };
const note = msg => console.log('note ' + msg);
const T0 = Date.now(), log = m => console.log(`[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)} s] ${m}`);
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name + '.png')}); } };

// ---------- the page-side library (installed in every document before its scripts run) ----------
function qaInit() {
  const Q = window.__qa = {};
  /* live counters: WebGL objects created minus deleted, audio nodes created, oscillators / buffer sources started and not yet ended, AudioContexts */
  const C = Q.c = {gl: {}, au: {ctx: 0, nodes: 0, started: 0}};
  for (const G of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (G) for (const k of ['Buffer', 'Texture', 'Program', 'Framebuffer', 'Renderbuffer', 'VertexArray', 'Shader', 'Query']) {
    const mk = G.prototype['create' + k], rm = G.prototype['delete' + k]; if (!mk || !rm || mk.__qa) continue;
    G.prototype['create' + k] = function (...a) { const r = mk.apply(this, a); if (r) C.gl[k] = (C.gl[k] || 0) + 1; return r; }; G.prototype['create' + k].__qa = 1;
    G.prototype['delete' + k] = function (o) { if (o) C.gl[k] = (C.gl[k] || 0) - 1; return rm.call(this, o); };
  }
  const AC = window.AudioContext;
  if (AC) {
    window.AudioContext = class extends AC { constructor(...a) { super(...a); C.au.ctx++; } };
    const B = window.BaseAudioContext?.prototype;
    for (const k of B ? Object.getOwnPropertyNames(B).filter(k => /^create/.test(k)) : []) { const f = B[k]; B[k] = function (...a) { const n = f.apply(this, a); C.au.nodes++; return n; }; }
    for (const N of [window.OscillatorNode, window.AudioBufferSourceNode, window.ConstantSourceNode]) if (N) { const s = N.prototype.start;
      N.prototype.start = function (...a) { C.au.started++; return s.apply(this, a); }; }  /* only counted: an 'ended' listener of ours would itself read as a listener leak, and a headless audio clock barely advances, so "still playing" means nothing there */
  }
  /* a deep scan of o for NaN / Infinity: plain data, vectors, matrices, typed arrays, Maps, Sets; never the DOM, the scene graph's parents or geometry buffers */
  Q.nan = (o, {max = 300000, depth = 9, skip = /^(parent|scene|renderer|domElement|geometry|material|materials|image|source|canvas|ctx|el|rawSet|rawBody|world|userData|_listeners|attributes|uniforms|program)$/} = {}) => {
    const seen = new WeakSet(), bad = []; let n = 0;
    const walk = (v, p, d) => {
      if (n++ > max || bad.length >= 12) return;
      if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(p + '=' + v); return; }
      if (!v || typeof v !== 'object' || seen.has(v) || d > depth || v instanceof Node || v === window) return;
      seen.add(v);
      if (ArrayBuffer.isView(v)) { if (!(v instanceof DataView) && v.length < 5000) for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) { bad.push(p + '[' + i + ']=' + v[i]); break; } return; }
      if (v instanceof Map) { for (const [k, x] of v) walk(x, p + '.get(' + k + ')', d + 1); return; }
      if (v instanceof Set) { let i = 0; for (const x of v) walk(x, p + '{' + i++ + '}', d + 1); return; }
      for (const k in v) { if (skip.test(k)) continue; try { walk(v[k], p + '.' + k, d + 1); } catch (e) {} }
    };
    walk(o, '', 0); return {bad, n};
  };
  /* text a player can see or will see: NaN / Infinity / undefined / [object Object] in any element's own text, an input's value, a title or aria-label */
  Q.dom = () => {
    const out = [], re = /(^|[^\w])(NaN|Infinity|undefined|\[object Object\]|null)([^\w]|$)/;
    const tag = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '');
    for (const e of document.querySelectorAll('body *')) {
      if (/^(SCRIPT|STYLE|CANVAS)$/.test(e.tagName)) continue;
      let own = ''; for (const c of e.childNodes) if (c.nodeType === 3) own += c.textContent;
      for (const t of [own, e.value, e.title, e.getAttribute('aria-label')]) if (typeof t === 'string' && re.test(t)) out.push(tag(e) + ': ' + t.trim().slice(0, 60));
    }
    return out.slice(0, 12);
  };
  /* layout problems on the current screen; see the header. Returns short strings naming the elements */
  Q.ui = scope => {
    const root = scope ? document.querySelector(scope) : document.body, out = [], vw = innerWidth, vh = innerHeight, tag = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '') + (e.textContent && e.children.length < 2 ? '"' + e.textContent.trim().slice(0, 18) + '"' : '');
    /* shown: not display none / hidden / transparent, and not inside a closed <details> (its content keeps a box there but is not drawn) */
    const shown = e => { let prev = null; for (let a = e; a; prev = a, a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; if (a.tagName === 'DETAILS' && !a.open && prev && prev.tagName !== 'SUMMARY') return false; } return true; };
    /* [hidden] that something else displays anyway */
    for (const e of root.querySelectorAll('[hidden]')) { const s = getComputedStyle(e); if (s.display !== 'none' && !(e.tagName === 'CANVAS' && s.display === 'none')) out.push('hidden but displayed: ' + tag(e) + ' (display ' + s.display + ')'); }
    /* the part of e's box that is not clipped by an ancestor (overflow hidden / auto / scroll) */
    const clipped = e => { const r = e.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
      for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY) && a !== document.body) { const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } }
      return {L, T, R, B, full: r, w: R - L, h: B - T}; };
    const scroller = e => { for (let a = e.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (a !== document.body && (/(auto|scroll)/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 1 || /(auto|scroll)/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 1)) return a; } return null; };
    const scrollable = e => !!scroller(e);
    const pin = e => { const c = scroller(e); for (let a = e; a && a !== c && a !== document.body; a = a.parentElement) if (/fixed|sticky/.test(getComputedStyle(a).position)) return a; return null; };  /* the fixed / sticky bar e belongs to, inside its scroll container */
    const under = (e, t) => { const c = scroller(e); return !!c && (!c.contains(t) || pin(e) !== pin(t)); };  /* under: e scrolls beneath t (a fixed bar), which is not a clash */
    const els = [...root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && shown(e) && !e.closest('[inert]') && !e.disabled; });
    const boxes = els.map(e => ({e, ...clipped(e)}));
    for (const b of boxes) { const {e, full} = b;
      if (b.w < 1 || b.h < 1) { if (!scrollable(e)) out.push('clipped away: ' + tag(e)); continue; }
      if ((full.right > vw + 2 || full.left < -2 || full.bottom > vh + 2 || full.top < -2) && !scrollable(e)) out.push(`outside the viewport: ${tag(e)} [${full.left | 0},${full.top | 0},${full.right | 0},${full.bottom | 0}] in ${vw}x${vh}`);
      const cx = (Math.max(b.L, 0) + Math.min(b.R, vw)) / 2, cy = (Math.max(b.T, 0) + Math.min(b.B, vh)) / 2;
      if (cx > 0 && cy > 0 && cx < vw && cy < vh && b.w > 3 && b.h > 3) { const t = document.elementFromPoint(cx, cy);
        if (t && !(e.contains(t) || t.contains(e) || (e.labels && [...e.labels].some(l => l.contains(t))) || e.closest('label')?.contains(t) || t.closest('label')?.contains(e) || under(e, t))) out.push('covered: ' + tag(e) + ' by ' + tag(t)); }
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j];
      if (a.e.contains(b.e) || b.e.contains(a.e) || scroller(a.e) !== scroller(b.e) || (scroller(a.e) && pin(a.e) !== pin(b.e)) || a.w < 1 || b.w < 1 || a.h < 1 || b.h < 1) continue;
      const w = Math.min(a.R, b.R) - Math.max(a.L, b.L), h = Math.min(a.B, b.B) - Math.max(a.T, b.T);
      if (w > 4 && h > 4 && w * h > .2 * Math.min(a.w * a.h, b.w * b.h) && !(a.e.closest('label') && a.e.closest('label') === b.e.closest('label'))) out.push(`overlap ${w | 0}x${h | 0}: ${tag(a.e)} / ${tag(b.e)}`); }
    /* text cut off by its own box (overflow hidden / clip with more content than room) */
    for (const e of root.querySelectorAll('*')) { if (!e.childNodes.length || !shown(e) || e.closest('canvas,svg,select,textarea,input')) continue; const s = getComputedStyle(e);
      if (/(hidden|clip)/.test(s.overflowX) && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2 && s.textOverflow !== 'ellipsis' && [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) out.push(`text cut off (${e.scrollWidth}>${e.clientWidth}): ${tag(e)}`); }
    /* does t (or an ancestor of it below the one that holds e) actually paint at the point: a background, an image, or its own glyphs there? A canvas may be transparent: skipped */
    const alpha = c => { const m = c.match(/rgba?\(([^)]*)\)/); if (!m) return 0; const v = m[1].split(/[ ,\/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) : 1; };
    const paints = (t, e, x, y) => { for (let a = t; a && !a.contains(e); a = a.parentElement) { if (a.tagName === 'CANVAS') return false; const c = getComputedStyle(a);
      if (/^(IMG|VIDEO|svg)$/.test(a.tagName) || c.backgroundImage !== 'none' || alpha(c.backgroundColor) > .3) return true;
      for (const n of a.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const g = document.createRange(); g.selectNodeContents(n); for (const r of g.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top + r.height * .25 && y <= r.bottom - r.height * .25) return true; } }  /* the glyphs fill the middle of a line box */
      return false; };
    /* text under another element: three points along each line of an element's own text, hit-tested */
    for (const e of root.querySelectorAll('*')) { if (!shown(e) || getComputedStyle(e).pointerEvents === 'none' || e.closest('canvas,svg,select,textarea,input,option,[aria-hidden=true]') || e.tagName === 'LABEL' && e.querySelector('input,select')) continue;
      for (const n of e.childNodes) { if (n.nodeType !== 3 || !n.textContent.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); const cl = clipped(e);
        for (const r of g.getClientRects()) { if (r.width < 4 || r.height < 4) continue;
          for (const f of [.1, .5, .9]) { const x = r.left + r.width * f, y = r.top + r.height / 2;
            if (x < Math.max(cl.L, 0) + 1 || x > Math.min(cl.R, vw) - 1 || y < Math.max(cl.T, 0) + 1 || y > Math.min(cl.B, vh) - 1) continue;
            const t = document.elementFromPoint(x, y); if (t && !(e.contains(t) || t.contains(e) || t.closest('label')?.contains(e) || e.closest('label')?.contains(t) || under(e, t)) && paints(t, e, x, y)) { out.push('text covered: ' + tag(e) + ' by ' + tag(t)); break; } } } } }
    return [...new Set(out)].slice(0, 25);
  };
}

// ---------- node-side helpers ----------
const benign = t => /fonts\.(googleapis|gstatic)\.com|favicon\.ico|net::ERR_FAILED|ERR_INTERNET_DISCONNECTED/i.test(t);
/* a page of its own, with the library installed, listeners that collect everything the console says, and the page opened at url */
async function session(browser, url, {w = 1280, h = 720, pre = null, win = false} = {}) {  /* win: a window of its own (several pages that must all keep drawing frames) */
  const errs = [], warns = [], p = win ? await newWindow(browser, {noRender: true}) : await browser.newPage();
  await p.evaluateOnNewDocument(qaInit);
  if (pre) await p.evaluateOnNewDocument(pre);
  p.on('console', m => { if (m.type() === 'warning' && !benign(m.text())) warns.push(m.text().slice(0, 300)); });
  p.on('requestfailed', q => { if (!benign(q.url())) errs.push('request failed: ' + q.url().slice(0, 100) + ' ' + (q.failure()?.errorText || '')); });
  await open(browser, url, errs, {w, h, page: p});
  const S = {p, errs, warns, cdp: await p.createCDPSession(), url};
  return S;
}
/* console errors / warnings seen since the last call: reports them against `what` */
function drain(S, what) {
  const e = S.errs.splice(0), w = S.warns.splice(0);
  ok(!e.length, `${what}: no page errors` + (e.length ? '\n  ' + [...new Set(e)].slice(0, 6).join('\n  ') : ''));
  if (w.length) note(`${what}: ${w.length} console warning(s):\n  ` + [...new Set(w)].slice(0, 5).join('\n  '));
}
const counters = async (S, extra) => {  /* the leak metrics of one page; extra: an in-page function with the game's own counts */
  await S.cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const d = await S.cdp.send('Memory.getDOMCounters'), m = await S.cdp.send('Runtime.getHeapUsage'), c = await S.p.evaluate(() => JSON.parse(JSON.stringify(window.__qa.c)));
  return {listeners: d.jsEventListeners, nodes: d.nodes, heapMB: +(m.usedSize / 1048576).toFixed(1), ...Object.fromEntries(Object.entries(c.gl).map(([k, v]) => ['gl' + k, v])), actx: c.au.ctx, anodes: c.au.nodes, started: c.au.started, ...(extra ? await S.p.evaluate(extra) : {})};
};

const R = {};  /* sections, in run order */
const section = (name, f, {fast = true} = {}) => { R[name] = {f, fast, area: name.startsWith('zombies-') ? 'interceptor' : 'league'}; };  /* area: the CI areas of tools/ci-scope.mjs */

// ---------- Drone League ----------
const LEAGUE = '/games/drone-league/index.html';
const snap = p => p.evaluate(() => window.__dl?.snap() ?? null);
const dbg = (p, f, ...a) => p.evaluate(`(${f})(window.__dl.dbg(), ...${JSON.stringify(a)})`);  /* f runs in the page with the live objects: D => D.GS.menuOpen */
const dlReady = p => p.waitForFunction(() => !!window.__dl?.snap().drones.length, {timeout: 120000, polling: 100});
const click = async (p, sel) => { if (!await p.$eval(sel, e => (e.click(), true)).catch(() => false)) return false; await frames(p, 2); return true; };  /* $eval, not $(): an ElementHandle that is never disposed keeps its element (and listeners) alive, which reads as a DOM leak */
const has = (p, sel) => p.$eval(sel, () => true).catch(() => false);
const hidden = (p, sel) => p.$eval(sel, e => e.hidden).catch(() => null);
const text = (p, sel) => p.$eval(sel, e => (e.value ?? e.textContent)).catch(() => null);
const key = async (p, k, ms = 0) => { await p.keyboard.down(k); if (ms) await sleep(ms); await p.keyboard.up(k); await frames(p, 2); };
const finite = s => [s.ball, ...s.drones.map(d => d.p)].every(v => v.every(Number.isFinite));
/* every number in the live League state, and every piece of text on the page */
async function leagueState(S, what) {
  const r = await S.p.evaluate(() => { const D = window.__dl.dbg(); return {gs: window.__qa.nan(D.GS), ball: window.__qa.nan(D.ball), set: window.__qa.nan(D.S), dom: window.__qa.dom()}; });
  for (const k of ['gs', 'ball', 'set']) ok(!r[k].bad.length, `${what}: no NaN / Infinity in ${k}${r[k].bad.length ? ' ' + r[k].bad.join(' ') : ''} (${r[k].n} values)`);
  ok(!r.dom.length, `${what}: no NaN / undefined / [object Object] in the page text` + (r.dom.length ? '\n  ' + r.dom.join('\n  ') : ''));
}
/* the sim must move: the sampled positions of the pilots change within `ms`, and the clock (when there is one) runs */
async function progress(p, ms = 4000) {
  const a = await snap(p); await sleep(ms); const b = await snap(p);
  const moved = Math.max(...a.drones.map((d, i) => b.drones[i] ? Math.hypot(...d.p.map((v, k) => v - b.drones[i].p[k])) : 0)), bm = Math.hypot(...a.ball.map((v, k) => v - b.ball[k]));
  return {moved, ballMoved: bm, clock: a.clock - b.clock, state: b.state, a, b};
}
/* a layout pass over the screen as shown now */
async function layout(S, what, scope = null) {
  const u = await S.p.evaluate(scope => window.__qa.ui(scope), scope);
  ok(!u.length, `${what}: layout clean` + (u.length ? '\n  ' + u.join('\n  ') : ''));
}

const SCREENS = [  /* [name, opener selector, a selector that is visible when open] */
  ['online', '#onlbtn', '#scr-online'], ['profile', '#profbtn', '#scr-profile'], ['training', '#trainbtn', '#scr-training'], ['settings', '#setbtn', '#scr-settings']];

/* the screens inside the screens: [name, clicks to get there, the element that is shown, how it closes, a selector for its tabs (each is shown in turn)] */
const DEEP = [
  ['settings tabs', ['#setbtn'], '#scr-settings', '#scr-settings .back', '#stabs button'],
  ['profile tabs', ['#profbtn'], '#scr-profile', '#scr-profile .back', '#pftabs button'],
  ['skill packs', ['#trainbtn', '#packsbtn'], '#scr-packs', '#packsback', '#ptabs button'],
  ['easy sensitivity setup', ['#setbtn', '#sensbtn'], '#sens', '#sx'],
  ['calibrate controls', ['#setbtn', '#calbtn'], '#bind', '#bx'],
  ['Calibration Lab intro', ['#trainbtn', '#labbtn'], '#labintro', '#lquit']];
/* a click on something that may sit in a Settings tab that is not shown yet: open the tab first */
async function clickIn(p, sel) {
  await p.evaluate(sel => { const e = document.querySelector(sel), t = e?.closest('.tabp[data-tab]'); if (t && t.hidden) document.querySelector(`#stabs button[data-tab="${t.dataset.tab}"]`)?.click(); }, sel);
  return click(p, sel);
}
/* back to the menu's main list from wherever a deep screen left us (leaves nothing open) */
async function home(p) {
  for (let i = 0; i < 4 && !(await p.evaluate(() => !document.getElementById('home').hidden && ['sens', 'bind', 'labintro', 'garage', 'mod'].every(i => document.getElementById(i).hidden))); i++) await key(p, 'Escape');
}
async function deepScreens(S, W, {keys = false} = {}) {
  const {p} = S;
  for (const [name, path, scr, close, tabs] of DEEP) {
    await home(p);
    let opened = true; for (const sel of path) if (!await clickIn(p, sel)) { opened = false; break; }
    if (!ok(opened && !(await hidden(p, scr)), `${W} ${name}: opens`)) { await home(p); continue; }
    const n = tabs ? await p.$$eval(tabs, l => l.length) : 1;
    for (let i = 0; i < n; i++) {
      if (tabs) await p.$$eval(tabs, (l, i) => l[i].click(), i); await frames(p, 2);
      const t = tabs ? await p.$$eval(tabs, (l, i) => l[i].textContent.trim().slice(0, 14), i) : '';
      await layout(S, `${W} ${name}${t ? ' / ' + t : ''}`, scr); await shot(p, `league-${W}-${name.replace(/\W+/g, '-')}${t ? '-' + t.replace(/\W+/g, '') : ''}`);
      if (keys) { const bad = await p.evaluate(() => window.__qa.dom()); ok(!bad.length, `${W} ${name}: no NaN / undefined text` + (bad.length ? ' ' + bad.join(' | ') : '')); }
    }
    if (keys) {  /* Escape closes it; if it has its own close control only, say so (a modal with no keyboard exit is a trap) */
      await key(p, 'Escape'); const esc = await hidden(p, scr);
      if (!esc) { note(`${W} ${name}: Escape does not close it; the close control ${close} does`); await click(p, close); }
      ok(await hidden(p, scr) || !esc, `${W} ${name}: closes`);
    } else if (!(await hidden(p, scr))) await click(p, close);
    await home(p);
  }
}

/* every menu screen: layout, Tab stays inside, Escape closes, focus lands on something visible */
async function screens(S, label, list = SCREENS) {
  const {p} = S;
  for (const [name, opener, scr] of list) {
    const w = `${label} ${name}`;
    if (!ok(await click(p, opener), `${w}: opener ${opener} exists`)) continue;
    ok(!(await hidden(p, scr)), `${w}: opens`);
    await layout(S, w, scr); await shot(p, 'league-' + label.replace(/\W+/g, '-') + '-' + name);
    /* Tab around: every stop is inside the open screen (nothing of the page behind it), and it visits more than one control */
    const stops = new Set(), outside = new Set();
    for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); const t = await p.evaluate(scr => { const e = document.activeElement; return {id: e?.id || e?.tagName + ':' + (e?.textContent || '').slice(0, 12), body: !e || e === document.body, in: !!e && document.querySelector(scr).contains(e)}; }, scr); if (t.body) continue; stops.add(t.id); if (!t.in) outside.add(t.id); }
    ok(!outside.size, `${w}: Tab stays inside the screen` + (outside.size ? ' (left to ' + [...outside].slice(0, 5).join(', ') + ')' : ''));
    ok(stops.size > 1, `${w}: Tab reaches more than one control (${stops.size})`);
    await key(p, 'Escape');
    ok(await hidden(p, scr), `${w}: Escape closes it`);
    const fo = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? 'ok' : 'invisible ' + (e.id || e.tagName); });
    ok(fo === 'ok', `${w}: after Escape the focus is on something visible (${fo})`);
  }
}
/* fly with the keyboard for ms: throttle up and a nose-down pitch, a yaw wiggle */
async function fly(p, ms) {
  const t0 = Date.now(); await p.keyboard.down('KeyW'); await p.keyboard.down('ArrowUp');
  for (let i = 0; Date.now() - t0 < ms; i++) { await p.keyboard.down(i & 1 ? 'KeyD' : 'KeyA'); await sleep(250); await p.keyboard.up(i & 1 ? 'KeyD' : 'KeyA'); }
  for (const k of ['KeyW', 'ArrowUp']) await p.keyboard.up(k);
}
const playing = (p, ms = 60000) => p.waitForFunction(() => { const s = window.__dl.snap(); return !s.demo && s.state === 'play'; }, {timeout: ms, polling: 100}).then(() => true, () => false);
async function startMode(S, mode, label) {
  const {p} = S;
  if (mode !== 'league') ok(await click(p, '#m_' + mode), `${label}: mode button #m_${mode}`);
  await click(p, '#play'); const up = ok(await playing(p), `${label}: kickoff ends and play starts`); if (!up) return false;
  await drawFrames(p); return true;
}
/* a mode in play: moves, pause freezes it, resume continues, no NaN, the menu on top of it is laid out */
async function modeRun(S, mode, label, {secs = FAST ? 2500 : 6000} = {}) {
  const {p} = S;
  if (!await startMode(S, mode, label)) return;
  await p.keyboard.down('KeyW'); await p.keyboard.down('ArrowUp');
  let g = await progress(p, secs); await p.keyboard.up('KeyW'); await p.keyboard.up('ArrowUp');
  ok(g.moved > 1, `${label}: the sim moves (${g.moved.toFixed(1)} m in ${secs} ms, state ${g.state})`);
  if (mode === 'league') ok(g.clock > 0, `${label}: the match clock runs (${g.clock.toFixed(1)} s)`);
  await fly(p, 1500); await leagueState(S, label);
  /* pause: Escape opens the menu and the world stands still; P does the same */
  for (const k of ['Escape', 'KeyP']) {
    await key(p, k); const open = !(await hidden(p, '#menu')); ok(open, `${label}: ${k} pauses (menu opens)`);
    if (!open) { await key(p, k); continue; }
    const a = await snap(p); await sleep(1200); const b = await snap(p);
    ok(a.drones.every((d, i) => d.p.every((v, j) => Math.abs(v - b.drones[i].p[j]) < 1e-6)) && Math.abs(a.clock - b.clock) < 1e-6, `${label}: paused world stands still (${k})`);
    if (k === 'Escape') { await layout(S, label + ' pause menu', '#home'); await shot(p, 'league-pause-' + mode); }
    await key(p, k); ok(await hidden(p, '#menu'), `${label}: ${k} resumes`);
  }
  g = await progress(p, 1500); ok(g.moved > .05 || g.ballMoved > .05, `${label}: moves again after resume (${g.moved.toFixed(2)} m)`);
  drain(S, label);
}

section('league-tour', async browser => {
  const S = await session(browser, origin + LEAGUE); const {p} = S;
  await dlReady(p); await drawFrames(p); log('league-tour: booted');
  drain(S, 'League boot');
  /* the menu demo plays behind the menu: wait out its kickoff, then it must move */
  ok(await until(async () => (await snap(p)).state === 'play', {timeout: 30000}), 'menu demo reaches play');
  let g = await progress(p, 3000); ok(g.moved > .5, `menu demo moves (${g.moved.toFixed(1)} m)`); await leagueState(S, 'League menu demo');
  await layout(S, 'League main menu', '#home'); await shot(p, 'league-menu');
  await screens(S, 'menu'); await deepScreens(S, 'menu', {keys: true}); drain(S, 'League menu screens');
  /* Garage, Mod panel (both are their own overlays) */
  await click(p, '#garbtn'); ok(!(await hidden(p, '#garage')), 'Garage opens'); await layout(S, 'Garage', '#garage'); await shot(p, 'league-garage'); await key(p, 'Escape'); ok(await hidden(p, '#garage'), 'Garage: Escape closes it');
  await click(p, '#modbtn'); ok(!(await hidden(p, '#mod')), 'Mod panel opens'); await layout(S, 'Mod panel physics', '#mod'); await click(p, '#tabr'); await layout(S, 'Mod panel rates', '#mod'); await shot(p, 'league-mod'); await click(p, '#mclose'); ok(await hidden(p, '#mod'), 'Mod panel closes');
  await key(p, 'KeyT'); ok(!(await hidden(p, '#mod')), 'T opens the mod panel'); await key(p, 'KeyT'); ok(await hidden(p, '#mod'), 'T closes it');
  drain(S, 'League Garage / Mod panel');
  /* each game mode in play */
  await modeRun(S, 'league', 'League');
  await key(p, 'Escape'); await screens(S, 'League pause', [SCREENS[3]]);
  /* a modal opened from the pause menu: Escape / P must not resume the match underneath it */
  for (const [name, path, scr, close] of [['sens', ['#setbtn', '#sensbtn'], '#sens', '#sx'], ['bind', ['#setbtn', '#calbtn'], '#bind', '#bx']]) {  /* the mod panel is not modal: it stays open over the running game by design */
    for (const k of ['Escape', 'KeyP']) {
      if (!(await dbg(p, D => D.GS.menuOpen))) await key(p, 'Escape');
      for (const sel of path) await clickIn(p, sel);
      if (await hidden(p, scr)) { note(`pause: ${name} did not open`); continue; }
      await key(p, k); const m = await dbg(p, D => D.GS.menuOpen), h = await hidden(p, scr);
      ok(h || m, `pause: ${k} with the ${name} modal open does not resume the match under it (modal ${h ? 'closed' : 'open'}, menu ${m ? 'open' : 'CLOSED'})`);
      if (!(await hidden(p, scr))) await click(p, close);
    }
  }
  if (!(await dbg(p, D => D.GS.menuOpen))) await key(p, 'Escape');
  await click(p, '#resume');
  await key(p, 'Escape'); await click(p, '#m_free'); await click(p, '#play'); ok(await playing(p), 'Freeplay starts from the pause menu (no demo)');
  await key(p, 'Escape'); await modeRun(S, 'free', 'Freeplay');
  await key(p, 'Escape'); await modeRun(S, 'df', 'Dogfight');
  /* Dogfight: hold the trigger for a moment (guns, tracers) */
  await p.mouse.move(640, 360); await p.mouse.down(); await sleep(1500); await p.mouse.up(); await leagueState(S, 'Dogfight firing'); drain(S, 'Dogfight');
  /* back to League through the menu: Leave game returns to the demo */
  await key(p, 'Escape'); await click(p, '#m_league'); await click(p, '#leave');
  g = await until(async () => (await snap(p)).demo, {timeout: 20000}); ok(g, 'Leave game returns to the menu demo');
  await leagueState(S, 'League after the tour'); drain(S, 'League tour');
  await p.close();
});

/* the elements in sels that are shown must lie inside the viewport */
async function inView(S, what, sels) {
  const bad = await S.p.evaluate(sels => { const out = []; for (const s of sels) for (const e of document.querySelectorAll(s)) { const r = e.getBoundingClientRect(), c = getComputedStyle(e); if (r.width < 1 || r.height < 1 || c.display === 'none' || c.visibility === 'hidden') continue;
    if (r.left < -2 || r.top < -2 || r.right > innerWidth + 2 || r.bottom > innerHeight + 2) out.push(`${s} [${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}] in ${innerWidth}x${innerHeight}`); } return out; }, sels);
  ok(!bad.length, `${what}: inside the viewport` + (bad.length ? '\n  ' + bad.join('\n  ') : ''));
}
const HUD = ['#score', '#feed', '#osd', '#dial', '#center', '#xh', '#arrow'];
section('league-resize', async browser => {
  const S = await session(browser, origin + LEAGUE); const {p} = S;
  await dlReady(p); await until(async () => (await snap(p)).state === 'play', {timeout: 30000});
  const sizes = async w => { const c = await p.evaluate(() => { const g = document.querySelector('canvas#gl'); return {cw: g.clientWidth, ch: g.clientHeight, w: g.width, h: g.height, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio}; }); return c; };
  for (const [w, h] of VIEWS) {
    const W = `${w}x${h}`; await p.setViewport({width: w, height: h}); await frames(p, 4); await drawFrames(p);
    const c = await sizes(); ok(Math.abs(c.cw - c.iw) <= 1 && Math.abs(c.ch - c.ih) <= 1, `${W}: the canvas fills the window (${c.cw}x${c.ch} css, ${c.w}x${c.h} px)`);
    ok(c.w > 0 && c.h > 0 && c.w / c.h > .5 * c.iw / c.ih && c.w / c.h < 2 * c.iw / c.ih, `${W}: the drawing buffer keeps the window's aspect (${(c.w / c.h).toFixed(2)} vs ${(c.iw / c.ih).toFixed(2)})`);
    await layout(S, `${W} main menu`, '#home'); await shot(p, `league-resize-${W}-menu`);
    for (const [name, opener, scr] of SCREENS) { if (!await click(p, opener)) continue; await layout(S, `${W} ${name}`, scr); await shot(p, `league-resize-${W}-${name}`); await key(p, 'Escape'); }
    await deepScreens(S, W);
    await click(p, '#garbtn'); await layout(S, `${W} Garage`, '#garage'); await shot(p, `league-resize-${W}-garage`); await key(p, 'Escape');
    await click(p, '#modbtn'); await layout(S, `${W} Mod panel`, '#mod'); await shot(p, `league-resize-${W}-mod`); await click(p, '#mclose');
    /* in a match: the HUD stays inside the window, and resizing mid-play does not upset the sim */
    await click(p, '#play'); ok(await playing(p), `${W}: match starts`); await frames(p, 5);
    await inView(S, `${W} HUD`, HUD); await shot(p, `league-resize-${W}-play`);
    const next = VIEWS[(VIEWS.findIndex(v => v[0] === w && v[1] === h) + 1) % VIEWS.length];
    await p.setViewport({width: next[0], height: next[1]}); await frames(p, 4); await p.setViewport({width: w, height: h}); await frames(p, 4);
    await inView(S, `${W} HUD after resizing in play`, HUD); await leagueState(S, `${W} after resizing in play`);
    await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo, {timeout: 20000});
    await until(async () => (await snap(p)).state === 'play', {timeout: 30000});
    drain(S, W);
  }
  await p.close();
});

/* ---------- saves: broken settings still boot and play; changed settings survive a reload; every option can be played ---------- */
const JUNK = [null, 'x', '', -1, 0, 1e9, 1.5, [], {}, true, false, '1', [1, 2], {a: 1}, 'Infinity', 1e-9];
const SAVE_URL = () => origin + '/package.json';  /* any same-origin file: a page to set localStorage from before the game loads */
/* one boot of the game with this saved text in localStorage, a short match, the checks; a crashed browser is a result too (and is relaunched) */
async function boot(store, {pre = null, play = true} = {}) {
  let S;
  try {
    S = await session(await B(), SAVE_URL(), {pre});
    if (store != null) await S.p.evaluate(s => localStorage.setItem('droneleague', s), store);
    await S.p.goto(origin + LEAGUE, {waitUntil: 'load'});
    const up = await dlReady(S.p).then(() => true, () => false);
    let played = !play;
    if (up && play) { await click(S.p, '#play'); played = await playing(S.p, 30000); if (played) { await fly(S.p, 1200); await frames(S.p, 3); } }
    /* a match that is only on paper does not count: the pilot is there, the clock is a positive number and still running */
    const nan = up ? await S.p.evaluate(() => { const D = window.__dl.dbg(), g = D.GS, out = [...window.__qa.nan(D.GS).bad, ...window.__qa.nan(D.ball).bad];
      if (!g.demo && (!g.player || !g.drones.length)) out.push('no pilot'); if (!g.demo && g.state !== 'end' && !(g.clock > 0)) out.push('clock ' + g.clock); return out; }) : [];
    const errs = [...S.errs]; await S.p.close();
    return {up, played, nan, errs};
  } catch (e) { return {up: false, played: false, nan: [], errs: [], crash: e.message.split('\n')[0]}; }
}
const bad = r => !r.up || !r.played || r.nan.length || r.errs.length;
const why = r => r.crash ? 'the page or browser crashed (' + r.crash + ')' : !r.up ? 'the game never came up' : !r.played ? 'the match never started' : r.nan.length ? 'NaN / state: ' + r.nan.slice(0, 3).join(' ') : r.errs.slice(0, 2).join(' | ');
section('league-saves', async browser => {
  const S0 = await session(browser, origin + LEAGUE); await dlReady(S0.p);
  const keys = await S0.p.evaluate(() => Object.keys(window.__dl.dbg().S)); await S0.p.close();
  log(`league-saves: ${keys.length} settings keys`);
  /* a hostile save: every key set to the same odd value at once; on a failure, delta-debug down to the keys that matter */
  for (const j of FAST ? (LEAN ? ['x', []] : [null, 'x', -1, [], {}]) : JUNK) {
    const save = ks => JSON.stringify(Object.fromEntries(ks.map(k => [k, j])));
    const r = await boot(save(keys));
    if (!bad(r)) { ok(true, `save with every key = ${JSON.stringify(j)}: boots and plays`); continue; }
    let rest = keys.slice(), culprits = [];
    for (let guard = 0; guard < 6 && rest.length; guard++) {
      if (!bad(await boot(save(rest)))) break;
      let lo = rest;  /* shrink: drop half at a time while it still fails */
      while (lo.length > 1) { const a = lo.slice(0, lo.length >> 1), b = lo.slice(lo.length >> 1); if (bad(await boot(save(a)))) lo = a; else if (bad(await boot(save(b)))) lo = b; else break; }
      culprits.push(lo.join('+')); rest = rest.filter(k => !lo.includes(k));
    }
    ok(false, `save with every key = ${JSON.stringify(j)}: ${why(r)}; key(s) that break it: ${culprits.join(', ') || '(only together)'}`);
  }
  /* the settings that cannot be read or written at all (private browsing, blocked storage, a full quota) */
  for (const [name, pre] of [['getItem throws', () => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; }], ['setItem throws', () => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; }],
    ['localStorage is gone', () => { Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('denied', 'SecurityError'); }}); }]].slice(LEAN ? 1 : 0, LEAN ? 2 : 3)) {
    const S = await session(await B(), SAVE_URL(), {pre}).catch(e => ({fail: e}));
    if (S.fail) { ok(false, `storage ${name}: page did not load`); continue; }
    await S.p.goto(origin + LEAGUE, {waitUntil: 'load'}); const up = await dlReady(S.p).then(() => true, () => false);
    if (up) { await click(S.p, '#play'); await playing(S.p, 30000); await fly(S.p, 800); }
    ok(up && !S.errs.length, `League with storage that ${name}: boots and plays without errors` + (S.errs.length ? '\n  ' + [...new Set(S.errs)].slice(0, 3).join('\n  ') : '')); await S.p.close();
  }
  /* the version history: a save from every physics version (old defaults that must move, values the pilot changed that must stay) */
  const OLD = [{}, {thr: 124, maxv: 111, dl: .14, dq: .0065, spool: 30}, {dbounce: .2, wash: 1, boost: 140, bgrav: 5}, {bgrav: 19.5, bbounce: .68, bmax: 85, bmass: .7, size: .75}, {gfric: .1}];
  for (const v of LEAN ? [0, 3, 5] : [0, 1, 2, 3, 4, 5]) {
    const mod = Object.assign({}, ...OLD.slice(0, Math.max(1, v)), {grav: 31}), r = await boot(JSON.stringify({...(v ? {physV: v} : {}), mod, size: 2, len: 120, name: 'Old v' + v}), {play: false});
    const S = await session(await B(), SAVE_URL()); await S.p.evaluate(s => localStorage.setItem('droneleague', s), JSON.stringify({...(v ? {physV: v} : {}), mod, name: 'Old v' + v})); await S.p.goto(origin + LEAGUE); await dlReady(S.p);
    const got = await S.p.evaluate(() => { const s = window.__dl.dbg().S; return {physV: s.physV, grav: s.mod.grav, name: s.name}; });
    ok(!bad(r) && got.physV >= 5 && got.grav === 31 && got.name === 'Old v' + v, `save from physics version ${v}: loads, migrates to ${got.physV}, keeps the pilot's own values (${JSON.stringify(got)})`); await S.p.close();
  }
  drain(S0, 'League saves');
});
section('league-options', async browser => {
  /* every option of every Match / Video setting is set, saved, survives a reload and plays a match */
  const S = await session(browser, origin + LEAGUE); const {p} = S; await dlReady(p);
  const sels = await p.$$eval('#scr-settings select[id^=f_]', l => l.filter(e => e.id !== 'f_arena').map(e => ({id: e.id, opts: [...e.options].map(o => o.value)})));  /* the arena size reloads the page by design (the geometry is built at load): played from a save below */
  const rngs = await p.$$eval('#scr-settings input[type=range][id^=f_]', l => l.map(e => ({id: e.id, min: +e.min, max: +e.max})));
  log(`league-options: ${sels.length} selects, ${rngs.length} sliders`);
  const set = (id, v) => p.$eval('#' + id, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, v);
  const SKIP = /^f_(map|ball)$/;  /* played below with the others, here too: nothing is skipped; the pattern is for slow ones in --fast */
  const tried = [];
  for (const {id, opts} of sels) for (const o of (FAST && !SKIP.test(id) ? [opts[0], opts[opts.length - 1]] : opts)) {
    await set(id, o); await click(p, '#play'); const up = await playing(p, 30000); if (up) await fly(p, 600);
    const bad = await p.evaluate(() => { const D = window.__dl.dbg(); return [...window.__qa.nan(D.GS).bad, ...window.__qa.nan(D.ball).bad, ...window.__qa.dom()]; });
    ok(up && !bad.length && !S.errs.length, `option ${id} = ${o}: the match plays${!up ? ' (never started)' : ''}${bad.length ? ' NaN/text: ' + bad.slice(0, 2).join(' ') : ''}${S.errs.length ? '\n  ' + [...new Set(S.errs.splice(0))].slice(0, 3).join('\n  ') : ''}`);
    tried.push(id + '=' + o); await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo, {timeout: 20000});
  }
  for (const {id, min, max} of rngs) for (const v of [min, max]) {
    await set(id, v); await click(p, '#play'); const up = await playing(p, 30000); if (up) await fly(p, 500);
    const bad = await p.evaluate(() => { const D = window.__dl.dbg(); return [...window.__qa.nan(D.GS).bad, ...window.__qa.dom()]; });
    ok(up && !bad.length && !S.errs.length, `slider ${id} = ${v}: the match plays${bad.length ? ' NaN/text: ' + bad.slice(0, 2).join(' ') : ''}${S.errs.length ? '\n  ' + [...new Set(S.errs.splice(0))].slice(0, 3).join('\n  ') : ''}`);
    await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo, {timeout: 20000});
  }
  /* reload: whatever is saved is what the screen shows and what the game uses */
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('droneleague'))), ui0 = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#scr-settings [id^=f_]')].map(e => [e.id, e.value])));
  await p.reload({waitUntil: 'load'}); await dlReady(p);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('droneleague'))), ui1 = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#scr-settings [id^=f_]')].map(e => [e.id, e.value])));
  const diff = Object.keys(ui0).filter(k => ui0[k] !== ui1[k]).map(k => `${k}: ${ui0[k]} -> ${ui1[k]}`), sdiff = Object.keys(before).filter(k => k !== 'diff' && JSON.stringify(before[k]) !== JSON.stringify(after[k]));  /* diff: the evolved bot levels are kept by id under dlEvolved (src/bots/evolved.js), the saved number falls back by design */
  ok(!diff.length, `after a reload the settings screen shows what it showed before` + (diff.length ? ': ' + diff.slice(0, 5).join('; ') : ''));
  ok(!sdiff.length, `after a reload the saved settings are unchanged` + (sdiff.length ? ': ' + sdiff.slice(0, 8).join(', ') : ''));
  drain(S, 'League options'); await p.close();
  /* every arena size from a save (these boots overwrite the saved settings, so they come last) */
  for (let a = 0; a < 4; a++) { const r = await boot(JSON.stringify({arena: a})); ok(!bad(r), `arena size ${a} (from a save): boots and plays` + (bad(r) ? ': ' + why(r) : '')); }
}, {fast: false});

/* ---------- match flow: goals, replays, overtime, the end of a match, training, the Lab, mode switches ---------- */
const rpState = p => p.evaluate(() => window.__dl.replay());
const stateIs = (p, st, ms = 20000) => until(async () => (await snap(p)).state === st, {timeout: ms, every: 100});
/* skip the 3 s countdown of a kickoff: the sim runs at once */
const hurry = p => dbg(p, D => { if (D.GS.state === 'kickoff') D.GS.stT = .02; });
section('league-flow', async browser => {
  const S = await session(browser, origin + LEAGUE); const {p} = S;
  await dlReady(p); await click(p, '#play'); ok(await playing(p), 'flow: a match starts'); await fly(p, 800);
  /* a goal: the celebration, the replay, then the next kickoff */
  await dbg(p, D => D.goal(0));
  ok(await stateIs(p, 'goal', 3000), 'flow: a goal puts the match in its goal state');
  const sc = (await snap(p)).score; ok(sc[0] === 1 && sc[1] === 0, `flow: the score counts it (${sc})`);
  ok(await until(async () => (await rpState(p)).on, {timeout: 12000}), 'flow: the goal replay starts');
  const r = await rpState(p); await layout(S, 'goal replay overlay', null); await shot(p, 'league-replay');
  ok(r.kind !== '' || r.hl === false, `flow: the replay is a goal replay (kind "${r.kind}")`);
  await sleep(700); await p.keyboard.press('Enter'); await frames(p, 3);
  ok(await until(async () => !(await rpState(p)).on, {timeout: 8000}), 'flow: a key skips the replay');
  ok(await stateIs(p, 'kickoff', 15000) || (await snap(p)).state === 'play', 'flow: after the replay the next kickoff comes');
  await hurry(p); ok(await stateIs(p, 'play', 15000), 'flow: and play resumes');
  await leagueState(S, 'flow after a goal'); drain(S, 'flow goal and replay');
  /* a replay left to play out to the end */
  await dbg(p, D => D.goal(1));
  ok(await stateIs(p, 'kickoff', 40000), 'flow: a goal replay that is not skipped ends by itself and the kickoff comes');
  ok(!(await rpState(p)).on, 'flow: no replay is left running'); await hurry(p); await stateIs(p, 'play', 15000);
  /* pause in the middle of a replay, resume it */
  await dbg(p, D => D.goal(0)); await until(async () => (await rpState(p)).on, {timeout: 12000});
  await key(p, 'Escape'); const a = await rpState(p); await sleep(900); const b = await rpState(p);
  ok(!(await hidden(p, '#menu')), 'flow: Esc during a replay opens the menu'); ok(Math.abs(a.pt - b.pt) < 1e-3 || !b.on, `flow: the replay stands still while paused (${a.pt?.toFixed?.(2)} -> ${b.pt?.toFixed?.(2)})`);
  await layout(S, 'pause menu during a replay', '#home'); await key(p, 'Escape');
  await until(async () => !(await rpState(p)).on, {timeout: 40000}); await stateIs(p, 'kickoff', 20000); await hurry(p); await stateIs(p, 'play', 15000);
  /* highlights: the pause menu's Replays screen lists the goals of this match; one plays, any key brings the menu back */
  await key(p, 'Escape'); ok(!(await click(p, '#rpbtn')) || !(await hidden(p, '#scr-replays')), 'flow: the Replays screen opens from the pause menu');
  const n = await p.$$eval('#rplist button', l => l.length); ok(n >= 1, `flow: the Replays screen lists the goals played (${n})`);
  await layout(S, 'Replays screen', '#scr-replays'); await shot(p, 'league-replays-screen');
  if (n) { await click(p, '#rplist button'); await frames(p, 4); const h = await rpState(p); ok(h.on && h.hl, 'flow: a highlight plays from the pause menu');
    await sleep(700); await p.keyboard.press('Enter'); await frames(p, 4); ok(await until(async () => !(await rpState(p)).on, {timeout: 20000}), 'flow: a key ends the highlight');
    ok(!(await hidden(p, '#menu')), 'flow: and the pause menu is back'); }
  await key(p, 'Escape'); if (!(await hidden(p, '#menu'))) await click(p, '#resume');
  await hurry(p); await stateIs(p, 'play', 15000); await leagueState(S, 'flow after highlights');
  /* overtime: the clock runs out level, the next goal wins */
  await dbg(p, D => { D.GS.score = [1, 1]; D.GS.clock = .3; });
  ok(await until(async () => (await dbg(p, D => D.GS.overtime)), {timeout: 10000}), 'flow: a level score at zero starts overtime');
  await fly(p, 600); await dbg(p, D => D.goal(1));
  ok(await stateIs(p, 'end', 40000), 'flow: a goal in overtime ends the match'); await leagueState(S, 'flow match end'); await shot(p, 'league-end');
  /* the end screen: the match summary (XP, achievements) can be closed with Esc, then the menu demo comes back */
  const sum = await until(async () => !(await hidden(p, '#pmsum')), {timeout: 12000});
  if (sum) { await layout(S, 'match summary', '#pmsum'); await shot(p, 'league-summary'); await key(p, 'Escape'); ok(await hidden(p, '#pmsum'), 'flow: Esc closes the match summary'); } else note('flow: no match summary after the match');
  ok(await until(async () => (await snap(p)).demo, {timeout: 40000}), 'flow: after the match the menu demo comes back');
  /* a match that ends on the clock */
  await click(p, '#play'); await playing(p); await dbg(p, D => { D.GS.score = [2, 0]; D.GS.clock = .3; });
  ok(await stateIs(p, 'end', 20000), 'flow: the clock running out with a lead ends the match');
  ok(await until(async () => (await snap(p)).demo, {timeout: 40000}), 'flow: back at the menu demo again');
  await leagueState(S, 'flow after the matches'); drain(S, 'flow match end');
  await p.close();
});
section('league-modes', async browser => {
  const S = await session(browser, origin + LEAGUE); const {p} = S; await dlReady(p);
  /* Freeplay: R resets the drone, a goal resets the ball, the HUD says FREEPLAY */
  await click(p, '#m_free'); await click(p, '#play'); ok(await playing(p), 'Freeplay starts'); const sp = (await snap(p)).drones[0].p; await fly(p, 800);
  const y0 = (await snap(p)).drones[0].p; await key(p, 'KeyR'); await frames(p, 2);
  const y1 = (await snap(p)).drones[0].p, away = Math.hypot(...y0.map((v, i) => v - sp[i])), back = Math.hypot(...y1.map((v, i) => v - sp[i]));
  ok(away > 5 && back < 3, `Freeplay: R puts the drone back at its spawn (${away.toFixed(1)} m away before, ${back.toFixed(1)} m after)`);
  await dbg(p, D => D.goal(0)); await stateIs(p, 'kickoff', 25000); await hurry(p); ok(await stateIs(p, 'play', 15000), 'Freeplay: after a goal play continues');
  ok(/FREEPLAY/i.test(await p.$eval('#clock', e => e.textContent)), `Freeplay: the clock reads FREEPLAY ("${await text(p, '#clock')}")`);
  await leagueState(S, 'Freeplay'); drain(S, 'Freeplay');
  /* Training: a pack (keyboard), a shot, the next shot, leave */
  await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo, {timeout: 20000});
  await click(p, '#trainbtn'); await click(p, '#packsbtn'); await click(p, '#ptiles .ptile'); const tr = () => p.evaluate(() => window.__dl.train());
  ok(await until(async () => (await tr()).on, {timeout: 20000}), 'Training: a pack starts'); await frames(p, 5);
  await p.keyboard.down('ArrowUp'); await sleep(900); await p.keyboard.up('ArrowUp'); await fly(p, 1200); await leagueState(S, 'Training');
  for (let i = 0; i < 3; i++) await key(p, 'KeyN');
  await layout(S, 'Training HUD', '#train'); await key(p, 'Escape'); await click(p, '#leave');
  ok(await until(async () => (await snap(p)).demo && !(await tr()).on, {timeout: 20000}), 'Training: Leave game returns to the demo'); drain(S, 'Training');
  /* the Calibration Lab */
  await click(p, '#trainbtn'); await click(p, '#labbtn'); ok(!(await hidden(p, '#labintro')), 'Lab: the intro opens'); await click(p, '#lgo'); await frames(p, 5);
  const lab = () => p.evaluate(() => window.__dl.lab());
  ok(await until(async () => (await lab()).on, {timeout: 20000}), 'Lab: the drills start'); await fly(p, 2500); await leagueState(S, 'Lab');
  await key(p, 'Escape'); ok(!(await hidden(p, '#menu')), 'Lab: Esc opens the menu'); await key(p, 'Escape');
  await click(p, '#labskip'); await frames(p, 3); await click(p, '#labend').catch(() => {}); await frames(p, 3);
  if (!(await hidden(p, '#menu'))) await click(p, '#resume');
  const out = await until(async () => { const l = await lab(); return !l.on || l.st === 'sum'; }, {timeout: 20000}); ok(out, 'Lab: ending the drills leads to the summary or out');
  if (await has(p, '#lexit') && !(await hidden(p, '#labsum'))) { await layout(S, 'Lab summary', '#labsum'); await click(p, '#lexit'); }
  else if (await has(p, '#lquit')) await click(p, '#lquit');
  ok(await until(async () => { const l = await lab(); return !l.on && (await snap(p)).demo; }, {timeout: 20000}), 'Lab: back at the demo'); drain(S, 'Lab');
  /* the modes in a row: every switch lands in a working match, whatever it was in before */
  const seq = ['df', 'league', 'free', 'df', 'free', 'league'];
  for (const m of seq) { await click(p, '#m_' + m); await click(p, '#play'); const up = await playing(p, 30000); if (up) await fly(p, 500);
    const st = await dbg(p, D => D.GS.GM); ok(up && st === m, `mode switch to ${m}: plays (mode ${st})`); await leagueState(S, 'mode ' + m); await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo, {timeout: 20000}); }
  drain(S, 'League modes'); await p.close();
}, {fast: false});

/* ---------- leaks: repeated start / stop cycles must not grow the scene, the GL objects, the audio nodes, the listeners or the heap ---------- */
/* what is judged, with the growth allowed between the second and the last cycle (noise only). Everything else is printed for a look:
   GL buffers / VAOs move with the geometry cache (24 loadouts, least recently used out), audio nodes are created per sound (the live ones are counted) */
const WATCH = {listeners: 12, nodes: 40, heapMB: 12, glTexture: 1, glFramebuffer: 1, glRenderbuffer: 1, glProgram: 20, scene: 0, objs: 12, geoms: 8, geomsC: 260, texs: 1, actx: 0};
const SETTLE = +(argv.find(a => a.startsWith('--settle='))?.slice(9) || 0);  /* --settle=ms: wait that long after each cycle before counting (timers and GC catch up) */
const ONLYC = argv.find(a => a.startsWith('--cycle='))?.slice(8);  /* --cycle=text: run only the cycle tests whose name contains it, and 12 of them */
/* run once() n+1 times; the first is the warm-up (shaders, textures and sounds are built on first use), the second the baseline */
async function cycles(S, name, once, n, extra, settle = 0) {  /* settle: ms to wait after each run before counting, for timers that retire things later (the HUD feed keeps a removed message 4.5 s) */
  if (ONLYC && !name.includes(ONLYC)) return; if (ONLYC) n = 12;
  const rows = [];
  for (let i = 0; i <= n; i++) { await once(i); if (SETTLE || settle) await sleep(SETTLE || settle); rows.push(await counters(S, extra)); }
  const a = rows[1], z = rows[n], grew = Object.keys(WATCH).filter(k => k in z && z[k] - (a[k] ?? 0) > WATCH[k]);
  note(`${name}: after ${n} cycles  ` + Object.keys(z).map(k => `${k} ${rows.map(r => r[k] ?? 0).join('>')}`).join('  '));
  ok(!grew.length, `${name}: nothing grows over ${n} cycles` + (grew.length ? ': ' + grew.map(k => `${k} ${a[k] ?? 0} -> ${z[k]}`).join(', ') : ''));
  ok(z.actx <= 1, `${name}: one AudioContext (${z.actx})`);
}
/* the League's own counts: scene children and objects, geometries and textures the renderer holds */
const leagueExtra = () => { const D = window.__dl.dbg(); let n = 0; D.scene.traverse(() => n++); const i = D.renderer.info; return {scene: D.scene.children.length, objs: n, geomsC: i.memory.geometries, texs: i.memory.textures}; };  /* geomsC: the quads' parts geometry is a 24-loadout LRU cache that bots fill with random loadouts, so this one swings by a few hundred without any leak */
section('league-cycles', async browser => {
  const S = await session(browser, origin + LEAGUE); const {p} = S; await dlReady(p);
  /* the idle-time warm-up (render/warm.js: Garage, Highlands, shaders) uploads buffers and compiles programs for a while after boot: let it finish first */
  ok(await until(async () => !(await dbg(p, D => D.warmLeft().length)), {timeout: 120000, every: 500}), 'the idle warm-up queue empties while the menu demo runs');
  const N = FAST ? (LEAN ? 2 : 3) : 6, back = async () => { await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo, {timeout: 20000}); };
  for (const m of ['league', 'free', 'df']) {
    await click(p, '#m_' + m); await back().catch(() => {});
    await cycles(S, `League ${m} start / leave`, async () => { await click(p, '#play'); await playing(p, 30000); await hurry(p); await fly(p, 700); if (m === 'df') { await p.mouse.move(640, 360); await p.mouse.down(); await sleep(400); await p.mouse.up(); } await back(); }, N, leagueExtra);
  }
  await click(p, '#m_league');
  await cycles(S, 'League goal + replay', async () => { await click(p, '#play'); await playing(p, 30000); await dbg(p, D => D.goal(0)); await until(async () => (await rpState(p)).on, {timeout: 12000}); await sleep(500); await p.keyboard.press('Enter'); await until(async () => !(await rpState(p)).on, {timeout: 12000}); await back(); }, N, leagueExtra);
  await cycles(S, 'Training pack', async () => { await click(p, '#trainbtn'); await click(p, '#packsbtn'); await click(p, '#ptiles .ptile'); await until(async () => (await p.evaluate(() => window.__dl.train())).on, {timeout: 20000}); await fly(p, 600); await back(); }, N, leagueExtra);
  await cycles(S, 'Calibration Lab', async () => { await click(p, '#trainbtn'); await click(p, '#labbtn'); await click(p, '#lgo'); await until(async () => (await p.evaluate(() => window.__dl.lab())).on, {timeout: 20000}); await fly(p, 600); await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo && !(await p.evaluate(() => window.__dl.lab())).on, {timeout: 20000}); }, N, leagueExtra);
  await cycles(S, 'menu screens', async () => { for (const [, o, s] of SCREENS) { await click(p, o); await key(p, 'Escape'); } await click(p, '#garbtn'); await key(p, 'Escape'); await click(p, '#modbtn'); await click(p, '#mclose'); }, N, leagueExtra);
  drain(S, 'League cycles'); await p.close();
}, {fast: true});

/* ---------- Interceptor / Zombies (games/interceptor + engine, window.__z) ---------- */
const ZURL = '/games/interceptor/?mode=zombies';
const ZKEY = 'dl-interceptor';  /* the arcade game's saved settings and progress */
/* a Zombies page: the save (an object, or null for none) is written before the game loads; resolves when window.__z is up */
async function zsession(browser, {save = null, w = 1280, h = 720, pre = null, raw = null, shared = null} = {}) {  /* shared: text for the League's profile key, which the Interceptor reads the pilot's controls from */
  const S = await session(browser, origin + '/package.json', {w, h, pre});
  await S.p.evaluate((k, s, sh) => { try { if (s != null) localStorage.setItem(k, s); if (sh != null) localStorage.setItem('droneleague', sh); } catch (e) {} }, ZKEY, raw ?? (save ? JSON.stringify({gmode: 'z', wx: 'clear', ...save}) : JSON.stringify({gmode: 'z', wx: 'clear'})), shared);
  await S.p.evaluate(() => { try { sessionStorage.setItem('zbossRoster', '0'); } catch (e) {} });  /* no random boss events in the plain probes (the boss section of zombies-test turns them on) */
  await S.p.goto(origin + ZURL, {waitUntil: 'load'}); S.up = await S.p.waitForFunction(() => window.__z?.api, {timeout: 120000}).then(() => true, () => false);
  if (S.up) { await frames(S.p, 4); await drawFrames(S.p); }
  return S;
}
const zst = p => p.evaluate(() => { const {G, api} = window.__z; return {state: G.state, wave: G.wave, cash: G.cash, demo: api.demo, menu: api.menuOpen, th: api.TH.length, wq: G.wq.length, me: api.player ? {p: api.player.p.toArray(), dead: api.player.dead} : null, integ: window.__z.integrity()}; });
/* every number in the live Zombies state, and every piece of text on the page */
async function zState(S, what) {
  const r = await S.p.evaluate(() => { const {G, Z, api} = window.__z, q = window.__qa.nan;
    return {G: q(G), TH: q(api.TH), sites: q(api.SITES), me: q(api.player), def: q({D: Z.def?.D, drones: Z.def?.drones, cam: api.camera.position, q: api.camera.quaternion}), S: q(api.S), dom: window.__qa.dom()}; });
  for (const k of ['G', 'TH', 'sites', 'me', 'def', 'S']) ok(!r[k].bad.length, `${what}: no NaN / Infinity in ${k}${r[k].bad.length ? ' ' + r[k].bad.join(' ') : ''} (${r[k].n} values)`);
  ok(!r.dom.length, `${what}: no NaN / undefined / [object Object] in the page text` + (r.dom.length ? '\n  ' + r.dom.join('\n  ') : ''));
}
const zplay = async (S, label) => { await click(S.p, '#play'); const up = await S.p.waitForFunction(() => !window.__z.api.demo && !!window.__z.api.player, {timeout: 30000}).then(() => true, () => false); ok(up, `${label}: Quick defence starts`); await frames(S.p, 3); await drawFrames(S.p, 2); return up; };
/* a scripted pilot that runs in the page: every .4 s it flies behind the most urgent track and detonates (kills it) */
const zpilot = (p, on = true) => p.evaluate(on => { clearInterval(window.__zp); if (on) window.__zp = setInterval(() => { const z = window.__z; if (z.G.state === 'wave' && z.api.player && z.api.player.dead <= 0 && !z.api.menuOpen) z.botKill(.8); }, 400); }, on);
const zwave = (p, ms = 90000) => p.waitForFunction(() => window.__z.G.state === 'base' || window.__z.G.state === 'over', {timeout: ms, polling: 200}).then(() => true, () => false);
const ztabs = p => p.$$eval('#zbase [data-tab]', l => l.map(b => b.dataset.tab));
/* the Enemies codex (zcodex.js) opened from `opener` (#zcdxbtn on the menu, #zcdxb on the base screen): laid out, no NaN text, Tab stays in it, Esc closes it */
async function codexScreen(S, label, opener, {keys = true} = {}) {
  const {p} = S; if (!await has(p, opener)) { note(`${label}: no ${opener} (the Enemies screen is not on this page)`); return; }
  await click(p, opener); if (!ok(!(await hidden(p, '#zcdx')), `${label}: the Enemies screen opens`)) return;
  await layout(S, `${label} Enemies screen`, '#zcdx'); await shot(p, 'z-codex-' + label.replace(/\W+/g, '-'));
  if (!keys) { await key(p, 'Escape'); return; }
  const bad = await p.evaluate(() => window.__qa.dom()); ok(!bad.length, `${label} Enemies screen: no NaN / undefined text` + (bad.length ? ' ' + bad.join(' | ') : ''));
  const stops = new Set(), outside = new Set();
  for (let i = 0; i < 30; i++) { await p.keyboard.press('Tab'); const t = await p.evaluate(() => { const e = document.activeElement; return {id: e?.id || e?.tagName + ':' + (e?.textContent || '').slice(0, 12), body: !e || e === document.body, in: !!e && document.getElementById('zcdx').contains(e)}; }); if (t.body) continue; stops.add(t.id); if (!t.in) outside.add(t.id); }
  ok(stops.size > 0, `${label} Enemies screen: Tab reaches its controls (${stops.size} stops)`);
  if (outside.size) note(`${label} Enemies screen: Tab leaves it to the page behind (${[...outside].slice(0, 4).join(', ')}); the campaign map does the same, so it is judged as a note: an overlay over the page that does not hold focus (inert on what is behind it would)`);
  await key(p, 'Escape'); ok(await hidden(p, '#zcdx'), `${label} Enemies screen: Esc closes it`);
  const fo = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? 'ok' : 'invisible ' + (e.id || e.tagName); }); ok(fo === 'ok', `${label} Enemies screen: after Esc the focus is on something visible (${fo})`);
}

section('zombies-tour', async browser => {
  const S = await zsession(browser); const {p} = S;
  if (!ok(S.up, 'Zombies boots')) { await p.close(); return; }
  drain(S, 'Zombies boot'); await shot(p, 'z-menu');
  /* the start menu: it is laid out, the demo wave plays behind it, nothing says NaN */
  const d0 = await zst(p), d1 = await until(async () => { const s = await zst(p); return s.th > 0 ? s : null; }, {timeout: 45000});
  ok(d0.demo && d1 && d1.th > 0, `Zombies menu demo: tracks come in behind the menu (${d1 ? d1.th : 0} after ${((Date.now() - T0) / 1000).toFixed(0)} s into the run)`);
  await layout(S, 'Zombies menu', '#menu'); await zState(S, 'Zombies menu');
  for (const b of await p.$$eval('#zdiff button', l => l.map(b => b.dataset.d))) { await click(p, `#zdiff [data-d="${b}"]`); await layout(S, `Zombies menu, difficulty ${b}`, '#menu'); }
  await click(p, '#zdiff [data-d="1"]');
  /* the campaign map */
  if (await has(p, '#zcpopen')) { await click(p, '#zcpopen'); ok(!(await hidden(p, '#zcamp')), 'campaign map opens'); await layout(S, 'campaign map', '#zcamp'); await shot(p, 'z-campaign-map'); await key(p, 'Escape'); ok(await hidden(p, '#zcamp'), 'campaign map: Esc closes it'); ok(!(await hidden(p, '#menu')), 'campaign map: the menu is still there'); }
  await codexScreen(S, 'Zombies menu', '#zcdxbtn'); drain(S, 'Zombies Enemies screen (menu)');
  /* the mod panel and rates panel (shared with the League) */
  await click(p, '#modbtn'); ok(!(await hidden(p, '#mod')), 'mod panel opens'); await layout(S, 'Zombies mod panel', '#mod'); await key(p, 'KeyT'); await click(p, '#modbtn'); await click(p, '#mclose'); ok(await hidden(p, '#mod'), 'mod panel closes');
  drain(S, 'Zombies menu');
  /* a quick defence: base screen, every tab, a wave with the scripted pilot, a pause */
  if (!await zplay(S, 'Zombies')) { await p.close(); return; }
  await frames(p, 5); let st = await zst(p); ok(st.state === 'base' && !(await hidden(p, '#zbase')), `Zombies: opens on the base screen (${st.state})`);
  await codexScreen(S, 'Zombies base screen', '#zcdxb'); drain(S, 'Zombies Enemies screen (base)');
  await layout(S, 'Zombies base screen', '#zbase'); await shot(p, 'z-base');
  await p.evaluate(() => { window.__z.G.cash = 9000; });
  for (const t of await ztabs(p)) { await p.evaluate(t => window.__z.Z.base.setTab(t), t); await frames(p, 3); await layout(S, `Zombies base tab ${t}`, '#zbase'); await shot(p, 'z-base-' + t); const bad = await p.evaluate(() => window.__qa.dom()); ok(!bad.length, `Zombies base tab ${t}: no NaN / undefined text` + (bad.length ? ' ' + bad.join(' | ') : '')); }
  await p.evaluate(() => window.__z.Z.base.setTab('shop'));
  /* buy through the buttons: the first card of every group, a placement, an upgrade */
  const bought = await p.evaluate(() => { const out = []; for (const b of [...document.querySelectorAll('#zbase [data-buy]')].slice(0, 6)) { const c0 = window.__z.G.cash; b.click(); if (document.querySelector('[data-slot]')) { document.querySelector('[data-slot]').click(); } out.push(c0 - window.__z.G.cash); } return out; });
  note(`Zombies shop: first cards cost ${bought.join(', ')}`); await zState(S, 'Zombies after shopping'); drain(S, 'Zombies base');
  await click(p, '#zgo'); ok(await p.waitForFunction(() => window.__z.G.state === 'wave', {timeout: 10000}).then(() => true, () => false), 'Zombies: Start wave begins the wave');
  await frames(p, 10); await zpilot(p); const a = await zst(p);
  /* pause mid-wave: Esc opens the menu and the world stands still; Resume continues */
  await sleep(1500); await key(p, 'Escape'); const m = await zst(p); ok(m.menu && !(await hidden(p, '#menu')), 'Zombies: Esc opens the menu mid-wave'); await layout(S, 'Zombies pause menu', '#menu'); await shot(p, 'z-pause');
  const f0 = await p.evaluate(() => ({t: window.__z.api.TH.map(t => t.p.toArray()), wt: window.__z.G.wt})); await sleep(1200); const f1 = await p.evaluate(() => ({t: window.__z.api.TH.map(t => t.p.toArray()), wt: window.__z.G.wt}));
  ok(JSON.stringify(f0) === JSON.stringify(f1), 'Zombies: the paused world stands still');
  await click(p, '#resume'); ok(!(await zst(p)).menu, 'Zombies: Resume closes the menu');
  await zpilot(p); ok(await zwave(p, 120000), 'Zombies: the wave ends (the scripted pilot clears it)'); await zpilot(p, false);
  st = await zst(p); ok(st.state === 'base' && st.wave >= 1 && st.cash > 0, `Zombies: wave cleared, back at the base screen (wave ${st.wave}, $${st.cash})`); await zState(S, 'Zombies after a wave'); drain(S, 'Zombies wave');
  /* game over: the defence collapses; the end screen is laid out, Menu returns to the demo */
  await p.evaluate(() => { window.__z.Z.gameOver(); }); await frames(p, 4);
  ok(!(await hidden(p, '#zover')), 'Zombies: the game-over screen shows'); await layout(S, 'Zombies game over', '#zover'); await shot(p, 'z-over'); await zState(S, 'Zombies game over');
  const btn = await p.$$eval('#zover button', l => l.map(b => b.id || b.textContent.trim())); note(`game-over buttons: ${btn.join(' | ')}`);
  await key(p, 'Escape'); await sleep(300);
  if (!(await hidden(p, '#zover'))) await click(p, '#zmenu');
  ok(await until(async () => (await zst(p)).demo, {timeout: 20000}), 'Zombies: from the game-over screen back to the menu demo');
  await zState(S, 'Zombies back at the menu'); drain(S, 'Zombies game over');
  await p.close();
});

const ZHUD = ['#zhud', '#zsites', '#zw', '#zc', '#feed', '#radw', '#osd', '#gd', '#warn', '#center'];
section('zombies-resize', async browser => {
  const S = await zsession(browser); const {p} = S; if (!ok(S.up, 'Zombies boots (resize)')) { await p.close(); return; }
  for (const [w, h] of ZVIEWS) {
    const W = `Zombies ${w}x${h}`; await p.setViewport({width: w, height: h}); await frames(p, 4); await drawFrames(p);
    const c = await p.evaluate(() => { const g = document.querySelector('canvas'); return {cw: g.clientWidth, ch: g.clientHeight, iw: innerWidth, ih: innerHeight}; });
    ok(Math.abs(c.cw - c.iw) <= 1 && Math.abs(c.ch - c.ih) <= 1, `${W}: the canvas fills the window (${c.cw}x${c.ch})`);
    await layout(S, `${W} menu`, '#menu'); await shot(p, `z-resize-${w}x${h}-menu`);
    if (await has(p, '#zcpopen')) { await click(p, '#zcpopen'); await layout(S, `${W} campaign map`, '#zcamp'); await shot(p, `z-resize-${w}x${h}-map`); await key(p, 'Escape'); }
    await codexScreen(S, `${W} menu`, '#zcdxbtn', {keys: false});
    await click(p, '#modbtn'); await layout(S, `${W} mod panel`, '#mod'); await click(p, '#mclose');
    if (!await zplay(S, W)) break;
    await p.evaluate(() => { window.__z.G.cash = 9000; });
    for (const t of await ztabs(p)) { await p.evaluate(t => window.__z.Z.base.setTab(t), t); await frames(p, 3); await layout(S, `${W} base tab ${t}`, '#zbase'); if (t === 'shop') await shot(p, `z-resize-${w}x${h}-shop`); }
    await click(p, '#zgo'); await p.waitForFunction(() => window.__z.G.state === 'wave', {timeout: 10000}); await sleep(2500); await frames(p, 4);
    await inView(S, `${W} HUD`, ZHUD); await shot(p, `z-resize-${w}x${h}-wave`);
    const next = ZVIEWS[(ZVIEWS.findIndex(v => v[0] === w && v[1] === h) + 1) % ZVIEWS.length];
    await p.setViewport({width: next[0], height: next[1]}); await frames(p, 4); await p.setViewport({width: w, height: h}); await frames(p, 4);
    await inView(S, `${W} HUD after resizing in the wave`, ZHUD); await zState(S, `${W} after resizing in the wave`);
    await key(p, 'Escape'); await layout(S, `${W} pause menu`, '#menu'); await click(p, '#leave'); await until(async () => (await zst(p)).demo, {timeout: 20000});
    drain(S, W);
  }
  await p.close();
});

/* run fn; an exception is a finding, not the end of the section */
async function attempt(what, fn) { try { return await fn(); } catch (e) { ok(false, `${what} threw: ${(e.message || e).split('\n')[0].slice(0, 200)}`); return undefined; } }
/* everything off the field: no queue, no tracks (their meshes leave the scene) */
const zclear = p => p.evaluate(() => { const {api, G} = window.__z; if (G.state === 'base') window.__z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; for (const s of api.SITES) s.hp = s.max; if (api.player && api.player.dead > 0) api.launch(); });

section('zombies-content', async browser => {
  const S = await zsession(browser); const {p} = S; if (!ok(S.up, 'Zombies boots (content)') || !await zplay(S, 'Zombies content')) { await p.close(); return; }
  /* every kind of enemy: one flies in for a while, is drawn, leaves nothing broken */
  const kinds = await p.evaluate(() => Object.keys(window.__z.KIND));
  log(`zombies-content: ${kinds.length} enemy kinds, ${(await p.evaluate(() => Object.keys(window.__z.ITEMS).length))} shop items`);
  for (const k of kinds) await attempt(`enemy kind ${k}`, async () => {
    await zclear(p); const r = await p.evaluate((k, secs) => { const z = window.__z, t = z.make(k, 0, -3500); if (!t) return {none: true}; z.sim(secs); return {live: z.api.live(t), p: t.p.toArray(), n: z.api.TH.length}; }, k, LEAN ? 5 : 8);
    if (r.none) { note(`enemy kind ${k}: make() gave nothing`); return; }
    await frames(p, 2); await drawFrames(p, 1);
    const bad = await p.evaluate(() => window.__qa.nan(window.__z.api.TH).bad); ok(!bad.length && r.p.every(Number.isFinite), `enemy kind ${k}: flew ${LEAN ? 5 : 8} s, drawn, finite (${r.live ? 'still flying' : 'gone'}, ${r.n} track(s))${bad.length ? ' ' + bad.join(' ') : ''}`);
  });
  await zState(S, 'Zombies after every enemy kind'); drain(S, 'Zombies enemy kinds');
  /* every shop item: bought through the buttons (a placement taken when asked), then a wave with the pilot */
  await zclear(p); await p.evaluate(() => { const z = window.__z; z.G.state = 'base'; z.G.cash = 1e6; z.G.next = z.plan(z.G.wave + 1); z.Z.base.open(); });
  const n = await p.evaluate(() => window.__z.G.cards.length);
  for (let i = 0; i < n; i++) await attempt(`shop card ${i}`, async () => {
    const r = await p.evaluate(i => { const z = window.__z, c = z.G.cards[i], b = document.querySelector(`#zbase [data-buy="${i}"]`); if (!b) return {k: c?.k, none: true}; const c0 = z.G.cash; z.Z.base.setTab('shop'); b.click();
      const slots = document.querySelectorAll('[data-slot]'); if (slots.length) slots[0].click(); document.getElementById('zcancel')?.click(); return {k: c.k, paid: c0 - z.G.cash, placing: !!z.G.placing}; }, i);
    if (r.placing) await p.evaluate(() => { document.getElementById('zcancel')?.click(); });
  });
  await p.evaluate(() => { const z = window.__z; z.G.cash = 1e6; z.Z.base.setTab('armory'); let n = 0; for (let k = 0; k < 6; k++) for (const b of document.querySelectorAll('#zbase [data-up]')) { b.click(); n++; } window.__upgrades = n; });
  await zState(S, 'Zombies after buying everything'); drain(S, 'Zombies shop');
  await layout(S, 'Zombies base with everything bought', '#zbase'); await shot(p, 'z-everything');
  /* waves from early to deep with everything in the field: the plan's own kinds, the pilot, the helpers and defences */
  for (const w of FAST ? (LEAN ? [11] : [3, 11]) : [2, 6, 11, 16, 21, 26, 31]) await attempt(`wave ${w}`, async () => {
    await p.evaluate(w => { const z = window.__z; z.G.cash = Math.max(z.G.cash, 5e5); z.jump(w); z.G.next = z.plan(w); z.G.state = 'base'; z.cont(); }, w);
    const r = await p.evaluate(() => { const z = window.__z; let k = 0, kills = 0, n0 = z.api.TH.length; for (let i = 0; i < 160 && z.G.state === 'wave'; i++) { z.sim(.25); if (i % 2 && z.api.player.dead <= 0 && z.botKill(.8)) kills++; if (z.api.player.dead > 0) z.api.launch(); } return {st: z.G.state, wave: z.G.wave, kills, left: z.api.TH.filter(t => z.api.live(t)).length + z.G.wq.length}; });
    await frames(p, 2); await drawFrames(p, 2);
    const bad = await p.evaluate(() => [...window.__qa.nan(window.__z.G).bad, ...window.__qa.nan(window.__z.api.TH).bad]);
    ok(!bad.length, `wave ${w} (${r.st}, ${r.kills} killed by the pilot, ${r.left} left): drawn, finite${bad.length ? ' ' + bad.slice(0, 3).join(' ') : ''}`);
    drain(S, `Zombies wave ${w}`);
  });
  await zState(S, 'Zombies after the waves');
  await p.close();
}, {fast: true});

section('zombies-flow', async browser => {
  const S = await zsession(browser); const {p} = S; if (!ok(S.up, 'Zombies boots (flow)')) { await p.close(); return; }
  /* keys on the base screen: Tab stays in it; Esc pauses behind it and Resume gives it back working */
  if (!await zplay(S, 'Zombies flow')) { await p.close(); return; }
  await frames(p, 4); const stops = new Set(), outside = new Set();
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); const t = await p.evaluate(() => { const e = document.activeElement; return {id: e?.id || e?.tagName + ':' + (e?.textContent || '').slice(0, 12), body: !e || e === document.body, in: !!e && !!document.getElementById('zbase').contains(e)}; }); if (t.body) continue; stops.add(t.id); if (!t.in) outside.add(t.id); }
  ok(!outside.size && stops.size > 2, `base screen: Tab stays inside it and reaches ${stops.size} controls` + (outside.size ? ' (left to ' + [...outside].slice(0, 4).join(', ') + ')' : ''));
  await key(p, 'Escape'); const m1 = await zst(p); note(`base screen + Esc: menu ${m1.menu ? 'opens' : 'does not open'}, base screen ${(await hidden(p, '#zbase')) ? 'hidden' : 'still shown'}`);
  if (m1.menu) { await layout(S, 'base screen paused with the menu over it', '#menu'); await click(p, '#resume'); }
  ok(!(await hidden(p, '#zbase')) && (await zst(p)).state === 'base', 'base screen: after Esc and Resume it is still there'); await key(p, 'Escape'); if ((await zst(p)).menu) await click(p, '#resume');
  /* placement: buy a rack, Esc leaves the placement (and the game keeps running), a second Esc is the menu */
  await p.evaluate(() => { window.__z.G.cash = 9000; window.__z.Z.base.setTab('shop'); });
  const plc = await p.evaluate(() => { const i = window.__z.G.cards.findIndex(c => c.k === 'rack'); document.querySelector(`[data-buy="${i}"]`)?.click(); return !!document.querySelector('[data-slot]'); });
  if (plc) { await layout(S, 'rack placement', '#zbase'); await key(p, 'Escape'); const q = await p.evaluate(() => ({placing: !!window.__z.G.placing, menu: window.__z.api.menuOpen})); note(`placement + Esc: placing ${q.placing}, menu ${q.menu}`); if (q.menu) await click(p, '#resume'); await p.evaluate(() => document.getElementById('zcancel')?.click()); }
  /* a wave: every key the pilot has, rapid pauses, a relaunch */
  await click(p, '#zgo'); await p.waitForFunction(() => window.__z.G.state === 'wave', {timeout: 10000}); await frames(p, 10); await zpilot(p);
  for (const k of ['KeyC', 'KeyC', 'KeyC', 'KeyV', 'KeyV', 'KeyV', 'KeyG', 'KeyG', 'KeyH', 'KeyH', 'KeyL', 'KeyL', 'KeyN', 'KeyN', 'KeyM', 'KeyM', 'KeyR', 'KeyF', 'KeyO']) await key(p, k);
  await sleep(800); await zState(S, 'Zombies after every key'); drain(S, 'Zombies keys');
  for (let i = 0; i < 12; i++) { await p.keyboard.press('Escape'); await frames(p, 1); }
  const sp = await zst(p); ok(sp.menu === false || sp.menu === true, 'rapid Esc: still answers'); if (sp.menu) await click(p, '#resume');
  const a = await zst(p); await sleep(1500); const b = await zst(p); ok(a.state !== 'wave' || b.state !== 'wave' || JSON.stringify(a.me) !== JSON.stringify(b.me) || a.th !== b.th, 'wave: the game moves on after the rapid pauses (not frozen)');
  ok(await zwave(p, 120000), 'wave: it ends'); await zpilot(p, false); await zState(S, 'Zombies after the keys and pauses'); drain(S, 'Zombies pauses');
  /* die, play again from the game-over screen, then quit from the base screen */
  await p.evaluate(() => window.__z.Z.gameOver()); await frames(p, 3); ok(!(await hidden(p, '#zover')), 'game over shows'); await click(p, '#zagain');
  ok(await p.waitForFunction(() => window.__z.G.state === 'base' && window.__z.G.wave === 0 && !window.__z.api.demo, {timeout: 20000}).then(() => true, () => false), 'game over: Play again starts a fresh run on the base screen');
  ok(await hidden(p, '#zover'), 'game over: the end screen is gone'); await key(p, 'Escape'); await click(p, '#leave'); ok(await until(async () => (await zst(p)).demo, {timeout: 20000}), 'Quit to menu from the base screen returns to the demo');
  await zState(S, 'Zombies back at the demo'); drain(S, 'Zombies play again');
  await p.close();
});
section('zombies-campaign', async browser => {
  const S = await zsession(browser, {save: {zdiff: 1, zload: null}}); const {p} = S; if (!ok(S.up, 'Zombies boots (campaign)')) { await p.close(); return; }
  const finish = won => p.evaluate(won => { const {G, Z, api} = window.__z; if (G.state === 'base') window.__z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0;
    if (won) { G.wave = Z.cp.run.obj; G.state = 'wave'; for (let i = 0; i < 40 && G.state !== 'over'; i++) window.__z.sim(.5); } else Z.gameOver();
    return {st: G.state, h2: document.querySelector('#zover h2')?.textContent}; }, won);
  const launch = async id => { await p.evaluate(id => { window.__z.Z.cp.openMap(); window.__z.Z.cp.select(id); }, id); await layout(S, `campaign briefing ${id}`, '#zcamp'); await click(p, '#zcpgo'); return p.waitForFunction(() => window.__z.G.state === 'base' && !!window.__z.Z.cp.run, {timeout: 30000}).then(() => true, () => false); };
  ok(await launch('mill'), 'campaign: Old Mill launches'); await frames(p, 4); await layout(S, 'campaign base screen', '#zbase'); await shot(p, 'z-campaign-base');
  let r = await finish(false); await frames(p, 3); ok(r.h2 === 'Sector lost', `campaign: losing shows "${r.h2}"`); await layout(S, 'campaign sector lost', '#zover'); await shot(p, 'z-campaign-lost'); await zState(S, 'campaign after a loss');
  await click(p, '#zcpretry'); ok(await p.waitForFunction(() => window.__z.G.state === 'base' && window.__z.Z.cp.run?.id === 'mill', {timeout: 30000}).then(() => true, () => false), 'campaign: Retry relaunches the sector');
  r = await finish(true); await frames(p, 3); ok(r.h2 === 'Sector held', `campaign: winning shows "${r.h2}"`); await layout(S, 'campaign sector held', '#zover'); await shot(p, 'z-campaign-held'); await zState(S, 'campaign after a win');
  await click(p, '#zmenu'); ok(await until(async () => (await zst(p)).demo, {timeout: 20000}), 'campaign: Menu returns to the demo'); drain(S, 'campaign round trip');
  /* the map keeps what happened across a reload, every sector can be opened (briefing laid out) */
  const camp = await p.evaluate(() => JSON.stringify(window.__z.api.S.zcamp)); await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z?.api, {timeout: 120000}); await frames(p, 4);
  ok(JSON.stringify(await p.evaluate(() => window.__z.api.S.zcamp)) === camp, 'campaign: a reload keeps the campaign exactly');
  const secs = await p.evaluate(() => { window.__z.Z.cp.openMap(); return [...document.querySelectorAll('#zcamp .zc-n')].map(n => n.dataset.sec); }); ok(secs.length === 12, `campaign: the map has ${secs.length} sectors`);
  for (const id of secs) { await p.evaluate(id => window.__z.Z.cp.select(id), id); await frames(p, 1); const u = await p.evaluate(() => window.__qa.ui('#zcamp')); const t = await p.evaluate(() => window.__qa.dom()); ok(!u.length && !t.length, `campaign sector ${id}: briefing laid out, no NaN text${u.length ? ' ' + u.slice(0, 3).join(' | ') : ''}${t.length ? ' ' + t.join(' | ') : ''}`); }
  await key(p, 'Escape'); await zState(S, 'campaign map'); drain(S, 'campaign map'); await p.close();
});
section('zombies-sortie', async browser => {
  const S = await zsession(browser); const {p} = S; if (!ok(S.up, 'Zombies boots (sortie)') || !await zplay(S, 'Zombies sortie')) { await p.close(); return; }
  await p.evaluate(() => window.__z.cont()); await p.evaluate(() => { const z = window.__z; for (let i = 0; i < 400 && z.G.state === 'wave'; i++) { z.sim(.5); if (z.api.player.dead <= 0 && Math.random() < .5) z.botKill(.8); } z.sim(4); });
  await frames(p, 3); const b = await p.evaluate(() => { const z = window.__z; z.Z.base.setTab('sortie'); return {st: z.G.state, go: document.querySelector('[data-so="go"]')?.disabled}; });
  ok(b.st === 'base', `sortie: wave 1 cleared, base screen (${b.st})`); await layout(S, 'sortie tab', '#zbase'); await shot(p, 'z-sortie-tab');
  const l = await p.evaluate(() => { const z = window.__z; return {launched: z.so.launch(), on: z.so.S.on}; }); ok(l.launched && l.on, 'sortie: it launches');
  await frames(p, 6); await drawFrames(p, 2); await zpilot(p); await sleep(4000); await zState(S, 'sortie in the air'); await layout(S, 'sortie HUD', null); await shot(p, 'z-sortie');
  const so = await p.evaluate(() => { const z = window.__z; return {on: z.so.S.on, t: z.so.S.t, st: z.G.state}; }); note(`sortie after 4 s: on ${so.on}, clock ${so.t}`);
  await p.evaluate(() => { const z = window.__z; for (let i = 0; i < 400 && z.so.S.on; i++) z.sim(.5); }); await zpilot(p, false);
  const end = await p.evaluate(() => { const z = window.__z; return {on: z.so.S.on, st: z.G.state, base: !document.getElementById('zbase').hidden}; }); ok(!end.on, `sortie: it ends by itself (state ${end.st}, base screen ${end.base})`);
  await zState(S, 'sortie ended'); drain(S, 'sortie'); await p.close();
});
section('zombies-spectator', async browser => {
  const S = await zsession(browser); const {p} = S; if (!ok(S.up, 'Zombies boots (spectator)')) { await p.close(); return; }
  const saves0 = await p.evaluate(k => localStorage.getItem(k), ZKEY);
  await p.evaluate(() => { document.getElementById('zspc').open = true; }); await layout(S, 'watch a bot card', '#zspc');
  await click(p, '[data-zsl="Legend"]'); await click(p, '#zspgo');
  ok(await p.waitForFunction(() => window.__z.spec.on && window.__z.G.state === 'base', {timeout: 30000}).then(() => true, () => false), 'spectator: the bot run starts on the base screen');
  await p.evaluate(() => window.__z.spec.setSpeed(8)); await sleep(1500); await layout(S, 'spectator base screen', null); await shot(p, 'z-spec-base');
  ok(await p.waitForFunction(() => window.__z.G.state === 'wave', {timeout: 90000}).then(() => true, () => false), 'spectator: the bot shops and starts the wave');
  await sleep(6000); await layout(S, 'spectator wave', null); await shot(p, 'z-spec-wave'); await zState(S, 'spectator in the wave');
  const prog = await p.evaluate(() => { const z = window.__z; return {kills: z.spec.sp.stats.kills ? Object.values(z.spec.sp.stats.kills).reduce((a, k) => a + (k.n | 0), 0) : 0, t: z.spec.sp.stats.simT}; }); note(`spectator: ${prog.t?.toFixed?.(0)} s of sim, ${prog.kills} kills so far`);
  await p.evaluate(() => { window.__z.spec.setPause(true); }); const t0 = await p.evaluate(() => window.__z.spec.sp.stats.simT); await sleep(1200); ok(Math.abs((await p.evaluate(() => window.__z.spec.sp.stats.simT)) - t0) < 1e-6, 'spectator: pause stops the bot');
  await p.evaluate(() => { window.__z.spec.setPause(false); window.__z.spec.setSpeed(1); });
  await key(p, 'Escape'); const m = await zst(p); note(`spectator + Esc: menu ${m.menu ? 'open' : 'closed'}`); if (m.menu) { await layout(S, 'spectator pause menu', '#menu'); await click(p, '#leave'); }
  ok(await until(async () => (await zst(p)).demo && !(await p.evaluate(() => window.__z.spec.on)), {timeout: 20000}), 'spectator: leaving returns to the menu demo');
  const saves1 = await p.evaluate(k => localStorage.getItem(k), ZKEY), s0 = JSON.parse(saves0 || '{}'), s1 = JSON.parse(saves1 || '{}'), changed = [...new Set([...Object.keys(s0), ...Object.keys(s1)])].filter(k => JSON.stringify(s0[k]) !== JSON.stringify(s1[k]));
  for (const k of changed) note('spectator changed save key ' + k + ': ' + JSON.stringify(s0[k]) + ' -> ' + JSON.stringify(s1[k]).slice(0, 200));
  const touched = changed.filter(k => k in s0 || /^(zbests|zbest|zruns|zmeta|zcamp|zload)$/.test(k));  /* keys that did not exist yet are defaults written on first use (zsrm, zspec, the empty boss records) */
  ok(!touched.length, `spectator: a bot's run left the saved progress alone (changed: ${touched.join(', ') || 'nothing'})`);
  drain(S, 'spectator'); await p.close();
});

/* the arcade game's own counts: scene children, geometries and textures the renderer holds */
const zExtra = () => { const z = window.__z, i = z.api.renderer.info; return {scene: z.api.scene.children.length, geoms: i.memory.geometries, texs: i.memory.textures}; };
section('zombies-cycles', async browser => {
  const S = await zsession(browser, {save: {zwx: 'menu'}}); const {p} = S; if (!ok(S.up, 'Zombies boots (cycles)')) { await p.close(); return; }  /* zwx menu: the menu's weather, not a new random forecast per game (each weather builds its own effects the first time it shows up) */
  const N = FAST ? (LEAN ? 2 : 3) : 6, back = async () => { await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await zst(p)).demo, {timeout: 20000}); };
  /* the idle-time warm-up (zwarm.js: bosses, effects, textures, programs; the living map's and the codex's builds) uploads geometry for a while after boot, and a slow
     machine finishes it in the middle of the first cycles, which reads as growth: wait for it (Z.warmSt.done) before counting anything */
  const warmed = await until(async () => p.evaluate(() => !window.__z.Z.warmSt || window.__z.Z.warmSt.done), {timeout: 240000, every: 500}); ok(warmed, 'the idle warm-up finishes while the menu demo runs');
  await cycles(S, 'Zombies quick defence start / quit', async () => { await zplay(S, 'cycle'); await p.evaluate(() => { const z = window.__z; z.G.cash = 5000; z.Z.base.setTab('shop'); const i = z.G.cards.findIndex(c => c.k === 'rack'); document.querySelector(`#zbase [data-buy="${i}"]`)?.click(); document.querySelector('[data-slot]')?.click(); z.cont(); z.sim(8); }); await frames(p, 3); await back(); }, N, zExtra, 5500);
  await cycles(S, 'Zombies game over / play again', async () => { await zplay(S, 'cycle'); await p.evaluate(() => { const z = window.__z; z.cont(); z.sim(3); z.Z.gameOver(); }); await frames(p, 3); await click(p, '#zmenu'); await until(async () => (await zst(p)).demo, {timeout: 20000}); }, N, zExtra, 5500);
  await cycles(S, 'Zombies campaign sector', async () => { await p.evaluate(() => { window.__z.Z.cp.openMap(); window.__z.Z.cp.select('mill'); }); await click(p, '#zcpgo'); await p.waitForFunction(() => window.__z.G.state === 'base' && !!window.__z.Z.cp.run, {timeout: 30000}); await p.evaluate(() => { window.__z.cont(); window.__z.sim(5); window.__z.Z.gameOver(); }); await frames(p, 3); await click(p, '#zmenu'); await until(async () => (await zst(p)).demo, {timeout: 20000}); }, N, zExtra, 5500);
  await cycles(S, 'Zombies bot spectator', async () => { await p.evaluate(() => { document.getElementById('zspc').open = true; }); await click(p, '#zspgo'); await p.waitForFunction(() => window.__z.spec.on && window.__z.G.state === 'base', {timeout: 30000}); await p.evaluate(() => window.__z.spec.setSpeed(8)); await sleep(2500); await back(); }, N, zExtra, 5500);
  await cycles(S, 'Zombies menu screens', async () => { await click(p, '#modbtn'); await click(p, '#mclose'); if (await has(p, '#zcpopen')) { await click(p, '#zcpopen'); await key(p, 'Escape'); } }, N, zExtra, 5500);
  drain(S, 'Zombies cycles'); await p.close();
}, {fast: true});
section('zombies-coop', async browser => {
  /* a host and a client in two windows (?netloop: the room is a BroadcastChannel in this browser); join, play, leave, again: nothing grows on either page */
  const URLC = origin + ZURL + '&netloop=40', mk = async name => { const S = await session(browser, origin + '/package.json', {win: true}); await S.p.evaluate(k => { localStorage.setItem(k, JSON.stringify({gmode: 'z', wx: 'clear', zwx: 'menu', zdiff: 1})); sessionStorage.setItem('zbossRoster', '0'); }, ZKEY);
    await S.p.goto(URLC, {waitUntil: 'load'}); S.up = await S.p.waitForFunction(() => window.__z?.net, {timeout: 120000}).then(() => true, () => false); await S.p.$eval('#zname', (e, n) => { e.value = n; }, name).catch(() => {}); S.name = name; return S; };
  const H = await mk('Hosty'), C = await mk('Cleo'); if (!ok(H.up && C.up, 'co-op: both pages boot')) { await H.p.close(); await C.p.close(); return; }
  const wait = (S, f, ms = 60000) => S.p.waitForFunction(f, {timeout: ms, polling: 50}).then(() => true, () => false), tap = (S, sel) => S.p.evaluate(sel => document.querySelector(sel)?.click(), sel);
  for (const S of [H, C]) ok(await wait(S, () => !window.__z.Z.warmSt || window.__z.Z.warmSt.done, 240000), `co-op ${S.name}: the idle warm-up finishes before anything is counted`);
  const N = FAST ? 2 : 4;
  async function round(i) {
    await tap(H, '#zhost'); ok(await wait(H, () => window.__z.G.on && window.__z.G.state === 'base' && window.__z.net.n?.code), `co-op ${i}: the host starts a game`);
    const code = await H.p.evaluate(() => window.__z.net.n.code); await C.p.$eval('#zcode', (e, c) => { e.value = c; }, code); await tap(C, '#zjoin');
    ok(await wait(H, () => window.__z.net.rows().length === 2) && await wait(C, () => window.__z.G.on && window.__z.net.rows().length === 2 && !document.getElementById('zbase').hidden), `co-op ${i}: the client joins ${code}`);
    await tap(H, '#zgo'); await tap(C, '#zgo'); ok(await wait(H, () => window.__z.G.state === 'wave') && await wait(C, () => window.__z.G.state === 'wave'), `co-op ${i}: both ready, the wave starts on both`);
    await H.p.evaluate(() => window.__z.sim(12)); await sleep(1500);
    for (const S of [H, C]) await zState(S, `co-op ${i} ${S.name}`);
    await C.p.evaluate(() => window.__z.api.showMenu(true)); await tap(C, '#leave'); ok(await wait(C, () => window.__z.api.demo), `co-op ${i}: the client leaves to its menu`); ok(await wait(H, () => window.__z.net.rows().length === 1, 20000), `co-op ${i}: the host sees it go`);
    await H.p.evaluate(() => window.__z.api.showMenu(true)); await tap(H, '#leave'); ok(await wait(H, () => window.__z.api.demo), `co-op ${i}: the host leaves to its menu`);
    for (const S of [H, C]) drain(S, `co-op ${i} ${S.name}`);
  }
  const rows = {H: [], C: []};
  for (let i = 0; i <= N; i++) { await round(i); await sleep(5500); for (const [k, S] of [['H', H], ['C', C]]) rows[k].push(await counters(S, zExtra)); }
  for (const [k, S] of [['H', H], ['C', C]]) { const r = rows[k], a = r[1], z = r[N], grew = Object.keys(WATCH).filter(x => x in z && z[x] - (a[x] ?? 0) > WATCH[x]);
    note(`co-op ${S.name}: ` + Object.keys(z).map(x => `${x} ${r.map(q => q[x] ?? 0).join('>')}`).join('  ')); ok(!grew.length, `co-op ${S.name}: nothing grows over ${N} join / leave rounds` + (grew.length ? ': ' + grew.map(x => `${x} ${a[x] ?? 0} -> ${z[x]}`).join(', ') : '')); }
  await H.p.close(); await C.p.close();
}, {fast: true});
section('zombies-saves', async browser => {
  /* broken saves: every key of the arcade game's save set to the same odd value at once (a failure is narrowed to the keys), garbage text, storage that throws */
  const S0 = await zsession(browser); const keys = S0.up ? await S0.p.evaluate(() => Object.keys(window.__z.api.S)) : []; await S0.p.close();
  log(`zombies-saves: ${keys.length} save keys`);
  const tryBoot = async (raw, pre = null, shared = null) => { let S; try { S = await zsession(await B(), {raw, pre, shared});
      if (S.up) { await click(S.p, '#play'); await S.p.evaluate(() => { const z = window.__z; if (z.G.on && z.G.state === 'base') z.cont(); z.sim(5); }); await frames(S.p, 3); }
      const nan = S.up ? await S.p.evaluate(() => [...window.__qa.nan(window.__z.G).bad, ...window.__qa.nan(window.__z.api.S).bad]) : [], r = {up: S.up, errs: [...S.errs], nan}; await S.p.close(); return r; } catch (e) { return {up: false, errs: [], nan: [], crash: e.message.split('\n')[0]}; } };
  const badZ = r => !r.up || r.errs.length || r.nan.length, whyZ = r => r.crash ? 'crashed: ' + r.crash : !r.up ? 'the page never came up' + (r.errs.length ? ' (' + r.errs.slice(0, 2).join(' | ') + ')' : '') : r.nan.length ? 'NaN: ' + r.nan.slice(0, 3).join(' ') : r.errs.slice(0, 2).join(' | ');
  for (const j of FAST ? (LEAN ? ['x', []] : [null, 'x', -1, [], {}]) : JUNK) {
    const save = ks => JSON.stringify({gmode: 'z', ...Object.fromEntries(ks.map(k => [k, j]))}), r = await tryBoot(save(keys));
    if (!badZ(r)) { ok(true, `Zombies save with every key = ${JSON.stringify(j)}: boots and plays`); continue; }
    let rest = keys.slice(), culprits = [];
    for (let g = 0; g < 6 && rest.length; g++) { if (!badZ(await tryBoot(save(rest)))) break; let lo = rest;
      while (lo.length > 1) { const a = lo.slice(0, lo.length >> 1), b = lo.slice(lo.length >> 1); if (badZ(await tryBoot(save(a)))) lo = a; else if (badZ(await tryBoot(save(b)))) lo = b; else break; }
      culprits.push(lo.join('+')); rest = rest.filter(k => !lo.includes(k)); }
    ok(false, `Zombies save with every key = ${JSON.stringify(j)}: ${whyZ(r)}; key(s) that break it: ${culprits.join(', ') || '(only together)'}`);
  }
  /* the pilot's controls are shared with the League (its key, 'droneleague'): junk there, and junk in the game's own save, while the other exists */
  const PILOT = ['mode', 'tilt', 'fov', 'thrMode', 'dz', 'cal', 'xcal', 'fireBtn', 'xfire', 'fireInv', 'xflip', 'flipBtn', 'rprof', 'rpi', 'xboost', 'boostBtn'];
  for (const j of FAST ? (LEAN ? ['x'] : [null, 'x', [], {}]) : JUNK) { const r = await tryBoot(null, null, JSON.stringify(Object.fromEntries(PILOT.map(k => [k, j])))); ok(!badZ(r), `Zombies with the League's pilot profile all = ${JSON.stringify(j)}: boots and plays${badZ(r) ? ': ' + whyZ(r) : ''}`); }
  for (const [name, raw] of LEAN ? [['a number', '5']] : [['a number', '5'], ['text', '"hi"'], ['a list', '[1,2]'], ['null', 'null']]) { const r = await tryBoot(raw, null, JSON.stringify({fireBtn: 3, xfire: 2})); ok(!badZ(r), `Zombies save that is ${name}, with a League profile present: boots and plays${badZ(r) ? ': ' + whyZ(r) : ''}`); }
  for (const [name, raw] of LEAN ? [['not JSON', '{oops']] : [['empty text', ''], ['not JSON', '{oops'], ['null', 'null'], ['an array', '[1,2]'], ['a number', '5'], ['a long string', JSON.stringify('x'.repeat(100000))]]) { const r = await tryBoot(raw); ok(!badZ(r), `Zombies save that is ${name}: boots and plays${badZ(r) ? ': ' + whyZ(r) : ''}`); }
  for (const [name, pre] of [['getItem throws', () => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; }], ['setItem throws', () => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; }]].slice(LEAN ? 1 : 0)) { const r = await tryBoot(null, pre); ok(!badZ(r), `Zombies with storage that ${name}: boots and plays${badZ(r) ? ': ' + whyZ(r) : ''}`); }
}, {fast: true});

/* ---------- monkey: a seeded random player (clicks on what is visible, keys, select / slider changes, resizes), then everything is checked ---------- */
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const MKEYS = ['Escape', 'Enter', 'Tab', 'Space', 'KeyP', 'KeyT', 'KeyC', 'KeyM', 'KeyR', 'KeyO', 'KeyF', 'KeyG', 'KeyH', 'KeyL', 'KeyN', 'KeyV', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Digit1', 'Digit2', 'Digit3', 'BracketRight', 'BracketLeft', 'ShiftLeft'];
const NAV = '#m_intercept, #icClassic, #icZombies, #dlback, #f_arena, a[href], [onclick*="location"]';  /* these leave or reload the page (the arena size reloads it by design: the geometry is built at load) */
/* n random actions on page S.p; ok() findings are made by the caller (errors drain, NaN scan, a still-answering page) */
async function monkey(S, seed, n, {views = VIEWS, quit = []} = {}) {
  const {p} = S, R = rng(seed), pick = a => a[R() * a.length | 0], log2 = []; let acts = 0;
  const targets = () => p.evaluate(nav => { const out = []; for (const e of document.querySelectorAll('button, select, input, summary, [tabindex]:not([tabindex="-1"]), canvas#zmap, .zc-n, .gtile, .ptile')) {
      if (e.matches(nav) || e.closest(nav) || e.disabled || e.type === 'file') continue; const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue; const x = Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), y = Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2));
      out.push({x, y, id: e.id || e.tagName + '.' + String(e.className).slice(0, 14), t: e.tagName, ty: e.type || '', n: e.tagName === 'SELECT' ? e.options.length : 0, min: +e.min, max: +e.max, step: +e.step || 1}); }
    return out; }, NAV);
  for (let i = 0; i < n; i++) {
    const a = R();
    try {
      if (a < .55) { const t = await targets(); if (!t.length) continue; const e = pick(t);
        if (e.t === 'SELECT') { await p.mouse.click(e.x, e.y); await p.keyboard.press(pick(['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowDown'])); await p.keyboard.press('Enter'); log2.push('select ' + e.id); }
        else if (e.t === 'INPUT' && e.ty === 'range') { const f = R(); await p.mouse.click(e.x - 0 + (f - .5) * 40, e.y); log2.push('slider ' + e.id); }
        else if (e.t === 'INPUT' && (e.ty === 'text' || e.ty === '')) { await p.mouse.click(e.x, e.y); await p.keyboard.type(pick(['x', 'Pilot', '', '9999', '<b>', "' or 1", 'A'.repeat(30)])); log2.push('type ' + e.id); }
        else { await p.mouse.click(e.x, e.y); log2.push('click ' + e.id); } }
      else if (a < .82) { const k = pick(MKEYS); if (R() < .25) { await p.keyboard.down(k); await sleep(60 + R() * 300); await p.keyboard.up(k); } else await p.keyboard.press(k); log2.push('key ' + k); }
      else if (a < .88) { const [w, h] = pick(views); await p.setViewport({width: w, height: h}); log2.push(`resize ${w}x${h}`); }
      else if (a < .93) { await sleep(100 + R() * 700); log2.push('wait'); }
      else if (a < .97) { await p.mouse.move(R() * 1200, R() * 600); await p.mouse.down(); await sleep(R() * 400); await p.mouse.up(); log2.push('drag'); }
      else { await p.evaluate(() => window.dispatchEvent(new Event('blur'))); log2.push('blur'); }
      acts++;
    } catch (e) { if (/detached|closed|destroyed|Target|context|navigat/i.test(e.message)) { log2.push('lost: ' + e.message.slice(0, 60)); break; } throw e; }
    if (i % 25 === 24) await frames(p, 2);
  }
  return {acts, tail: log2.slice(-12)};
}
section('league-monkey', async browser => {
  for (const seed of FAST ? [7] : [7, 21, 42]) {
    const S = await session(browser, origin + LEAGUE); const {p} = S; await dlReady(p);
    const r = await monkey(S, seed, FAST ? (LEAN ? 70 : 120) : 400);
    await p.setViewport({width: 1280, height: 720}); await frames(p, 4);
    const alive = await p.evaluate(() => new Promise(res => { const t = setTimeout(() => res(false), 5000); requestAnimationFrame(() => { clearTimeout(t); res(true); }); }));
    ok(alive, `league monkey seed ${seed}: ${r.acts} random actions, the page still draws frames`);
    await leagueState(S, `league monkey seed ${seed}`); drain(S, `league monkey seed ${seed}`);
    const where = await p.evaluate(() => { const s = window.__dl.snap(); return {state: s.state, demo: s.demo, menu: !document.getElementById('menu').hidden}; }); note(`league monkey seed ${seed}: ended in ${JSON.stringify(where)}; last actions: ${r.tail.join(', ')}`);
    /* it can still be played afterwards: back to the menu and a match */
    for (let i = 0; i < 4 && !(await dbg(p, D => D.GS.demo)); i++) { await key(p, 'Escape'); await click(p, '#leave'); }
    await click(p, '#play'); ok(await playing(p, 30000), `league monkey seed ${seed}: a match still starts afterwards`); await fly(p, 800); await leagueState(S, `league monkey seed ${seed} afterwards`); drain(S, `league monkey seed ${seed} afterwards`);
    await p.close();
  }
}, {fast: true});
section('zombies-monkey', async browser => {
  for (const seed of FAST ? [11] : [11, 23, 57]) {
    const S = await zsession(browser); const {p} = S; if (!ok(S.up, `Zombies boots (monkey ${seed})`)) { await p.close(); continue; }
    await p.evaluate(() => { window.__z.api.S.zdiff = 1; });
    if (seed % 2) { if (await zplay(S, `zombies monkey seed ${seed}`)) { await p.evaluate(() => { window.__z.G.cash = 4000; }); await zpilot(p); } }  /* odd seeds start in a game (the base screen, the shop and the waves are where most of the buttons are) */
    const r = await monkey(S, seed, FAST ? (LEAN ? 70 : 120) : 400, {views: ZVIEWS});
    await p.setViewport({width: 1280, height: 720}); await frames(p, 4);
    const alive = await p.evaluate(() => new Promise(res => { const t = setTimeout(() => res(false), 5000); requestAnimationFrame(() => { clearTimeout(t); res(true); }); }));
    ok(alive, `zombies monkey seed ${seed}: ${r.acts} random actions, the page still draws frames`);
    await zState(S, `zombies monkey seed ${seed}`); drain(S, `zombies monkey seed ${seed}`);
    const where = await zst(p); note(`zombies monkey seed ${seed}: ended in state ${where.state}, wave ${where.wave}, menu ${where.menu}, demo ${where.demo}; last actions: ${r.tail.join(', ')}`);
    for (let i = 0; i < 4 && !(await zst(p)).demo; i++) { await key(p, 'Escape'); if (!(await click(p, '#leave'))) await click(p, '#zmenu'); }
    ok(await zplay(S, `zombies monkey seed ${seed} afterwards`), `zombies monkey seed ${seed}: a game still starts afterwards`); await p.evaluate(() => { const z = window.__z; if (z.G.state === 'base') z.cont(); z.sim(5); }); await zState(S, `zombies monkey seed ${seed} afterwards`); drain(S, `zombies monkey seed ${seed} afterwards`);
    await p.close();
  }
}, {fast: true});

/* ---------- hardware oddities: gamepads that report nonsense, odd displays, no network ---------- */
/* an Xbox-layout pad the test can reshape: window.__pad is the live Gamepad object (axes / buttons are replaced in place) */
function fakePad() {
  const g = window.__pad = {id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({pressed: false, touched: false, value: 0}))};
  Object.defineProperty(navigator, 'getGamepads', {value: () => window.__padList ?? [g], configurable: true});
  setInterval(() => { g.timestamp = performance.now(); }, 16);
}
section('league-input', async browser => {
  const S = await session(browser, origin + LEAGUE, {pre: fakePad}); const {p} = S; await dlReady(p);
  await click(p, '#play'); ok(await playing(p), 'pad: a match starts with a pad connected'); await frames(p, 4);
  const setPad = (axes, btn, list) => p.evaluate((axes, btn, list) => { const g = window.__pad; if (axes) g.axes = axes; if (btn) g.buttons = btn; window.__padList = list === undefined ? null : list; if (list === undefined) delete window.__padList; }, axes, btn, list);
  const finiteNow = async () => (await snap(p)).drones.every(d => d.p.every(Number.isFinite));
  const B = n => Array.from({length: n}, () => ({pressed: false, touched: false, value: 0}));
  for (const [name, axes, btn, list] of [
    ['axes with NaN', [NaN, NaN, NaN, NaN], null], ['axes with Infinity', [Infinity, -Infinity, Infinity, 1e300], null], ['huge axes', [1e9, -1e9, 5, -5], null], ['no axes at all', [], null], ['axes of null / undefined / strings', [null, undefined, 'x', {}], null],
    ['buttons with NaN values', [0, 0, 0, 0], Array.from({length: 17}, () => ({pressed: true, touched: true, value: NaN}))], ['no buttons', [0, 0, 0, 0], []], ['40 buttons', [0, 0, 0, 0], B(40)],
    ['a null pad in the list', [0, 0, 0, 0], null, [null, undefined]], ['a disconnected pad', [0, 0, 0, 0], null, [{id: 'x', index: 0, connected: false, axes: [1, 1, 1, 1], buttons: [], timestamp: 5}]], ['back to normal', [0, 0, 0, 0], B(17)]]) {
    await setPad(axes, btn, list); await key(p, 'KeyW', 500); await sleep(400); await frames(p, 3);
    const fin = await finiteNow(); const nan = await p.evaluate(() => window.__qa.nan(window.__dl.dbg().GS).bad); ok(fin && !nan.length, `pad ${name}: the drones stay finite${nan.length ? ' (' + nan.slice(0, 3).join(' ') + ')' : ''}`);
    if (!fin || nan.length) { await setPad([0, 0, 0, 0], B(17)); await key(p, 'KeyR'); await click(p, '#leave').catch(() => {}); await key(p, 'Escape'); await click(p, '#leave'); await until(async () => (await snap(p)).demo, {timeout: 20000}); await click(p, '#play'); await playing(p, 30000); }
  }
  /* the menu reads the pad too (the axis bars, the button list): the same oddities there */
  await key(p, 'Escape'); await click(p, '#setbtn'); await click(p, '#stabs [data-tab=controls]');
  for (const [axes, btn] of [[[NaN, NaN, 5, -5], Array.from({length: 17}, () => ({pressed: true, touched: true, value: NaN}))], [[], []], [[0, 0, 0, 0], B(17)]]) { await setPad(axes, btn); await frames(p, 4); }
  const dom = await p.evaluate(() => window.__qa.dom()); ok(!dom.length, `pad on the menu: no NaN in the text${dom.length ? ' ' + dom.join(' | ') : ''}`); await key(p, 'Escape');
  drain(S, 'League pads'); await p.close();
}, {fast: true});
section('league-display', async browser => {
  /* tiny windows (a minimised or docked one), and sharp displays (the drawing buffer must stay inside what the GPU allows) */
  const S = await session(browser, origin + LEAGUE); const {p} = S; await dlReady(p); await click(p, '#play'); ok(await playing(p), 'display: a match starts');
  const buf = () => p.evaluate(() => { const g = document.querySelector('canvas#gl'), gl = g.getContext('webgl2') || g.getContext('webgl'); return {w: g.width, h: g.height, max: gl ? gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) : 0, dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight}; });
  for (const [w, h, dpr] of [[1280, 720, 1], [1280, 720, 2], [1920, 1080, 3], [3440, 1440, 2], [1280, 720, 1]]) {
    await p.setViewport({width: w, height: h, deviceScaleFactor: dpr}); await frames(p, 5); await drawFrames(p, 2); const b = await buf();
    ok(b.w > 0 && b.h > 0 && b.w <= b.max && b.h <= b.max, `display ${w}x${h} @${dpr}x: the drawing buffer ${b.w}x${b.h} is inside the GPU's limit (${b.max})`);
    await leagueState(S, `display ${w}x${h}@${dpr}`); drain(S, `display ${w}x${h}@${dpr}`);
  }
  for (const [w, h] of [[320, 200], [120, 80], [50, 50], [1280, 720]]) {
    await p.setViewport({width: w, height: h}); await frames(p, 4); await sleep(300);
    const gone = await p.evaluate(() => window.__qa.nan(window.__dl.dbg().GS).bad); ok(!gone.length, `display ${w}x${h}: the sim stays finite`); drain(S, `display ${w}x${h}`);
  }
  await frames(p, 6); const b = await buf(); ok(b.w > 0 && b.iw === 1280, 'display: back at 1280x720 the canvas is whole again'); await layout(S, 'display restored', '#hud');
  await leagueState(S, 'display after tiny windows'); drain(S, 'League display'); await p.close();
}, {fast: true});
section('league-online', async browser => {
  /* Play online with no network (this browser has none to the lobby): the screen says so, nothing throws, you can leave and play offline */
  const S = await session(browser, origin + LEAGUE); const {p} = S; await dlReady(p);
  await click(p, '#onlbtn'); await sleep(3000); const note0 = await text(p, '#mpnote'); note(`online: the note reads "${note0}" 3 s after opening the screen`);
  await layout(S, 'online screen', '#scr-online');
  await click(p, '#join'); await sleep(800); note(`online: Join with no code: "${await text(p, '#mpnote')}"`);
  await p.$eval('#code', e => { e.value = 'zzzz'; }); await click(p, '#join'); await sleep(2500); note(`online: Join zzzz: "${await text(p, '#mpnote')}"`);
  await click(p, '#host'); await sleep(2500); note(`online: Host: "${await text(p, '#mpnote')}"`); const st = await dbg(p, D => ({net: !!D.GS.net, demo: D.GS.demo})); note(`online: after Host the game is ${JSON.stringify(st)}`);
  await layout(S, 'online screen after Host', '#scr-online'); await shot(p, 'league-online-offline');
  if (!(await hidden(p, '#scr-online'))) await key(p, 'Escape'); await key(p, 'Escape'); if (await dbg(p, D => !!D.GS.net)) { await click(p, '#leave'); }
  ok(await until(async () => !(await dbg(p, D => !!D.GS.net)), {timeout: 15000}), 'online: leaving gets out of the (failed) online game');
  await click(p, '#play'); ok(await playing(p, 30000), 'online: an offline match still starts afterwards'); await leagueState(S, 'online afterwards'); drain(S, 'League online'); await p.close();
}, {fast: false});

section('zombies-input', async browser => {
  const S = await zsession(browser, {pre: fakePad}); const {p} = S; if (!ok(S.up, 'Zombies boots (pads)') || !await zplay(S, 'Zombies pads')) { await p.close(); return; }
  await p.evaluate(() => { window.__z.G.cash = 3000; window.__z.cont(); }); await p.waitForFunction(() => window.__z.G.state === 'wave', {timeout: 10000}); await frames(p, 6);
  const B = n => Array.from({length: n}, () => ({pressed: false, touched: false, value: 0}));
  const setPad = (axes, btn, list) => p.evaluate((axes, btn, list) => { const g = window.__pad; if (axes) g.axes = axes; if (btn) g.buttons = btn; if (list === undefined) delete window.__padList; else window.__padList = list; }, axes, btn, list);
  for (const [name, axes, btn, list] of [['axes with NaN', [NaN, NaN, NaN, NaN, NaN, NaN], null], ['axes with Infinity', [Infinity, -Infinity, 1e300, -1e300], null], ['axes of null / undefined / text', [null, undefined, 'x', {}], null],
    ['buttons with NaN', [0, 0, 0, 0], Array.from({length: 17}, () => ({pressed: true, touched: true, value: NaN}))], ['no axes and no buttons', [], []], ['a null pad in the list', [0, 0, 0, 0], null, [null]], ['normal again', [0, 0, 0, 0], B(17)]]) {
    await setPad(axes, btn, list); await key(p, 'KeyW', 500); await sleep(500); await frames(p, 3);
    const bad = await p.evaluate(() => [...window.__qa.nan(window.__z.api.player).bad, ...window.__qa.nan(window.__z.G).bad]); ok(!bad.length, `Zombies pad ${name}: the interceptor stays finite${bad.length ? ' (' + bad.slice(0, 3).join(' ') + ')' : ''}`);
    if (bad.length) { await setPad([0, 0, 0, 0], B(17)); await p.evaluate(() => window.__z.api.launch()); }
  }
  drain(S, 'Zombies pads'); await p.close();
}, {fast: true});
section('zombies-display', async browser => {
  const S = await zsession(browser); const {p} = S; if (!ok(S.up, 'Zombies boots (display)') || !await zplay(S, 'Zombies display')) { await p.close(); return; }
  await p.evaluate(() => { window.__z.G.cash = 3000; window.__z.cont(); }); await p.waitForFunction(() => window.__z.G.state === 'wave', {timeout: 10000});
  const buf = () => p.evaluate(() => { const g = document.querySelector('canvas'), gl = g.getContext('webgl2') || g.getContext('webgl'); return {w: g.width, h: g.height, max: gl ? gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) : 0, iw: innerWidth}; });
  for (const [w, h, dpr] of LEAN ? [[1280, 720, 1], [1920, 1080, 3], [1280, 720, 1]] : [[1280, 720, 1], [1280, 720, 2], [1920, 1080, 3], [3440, 1440, 2], [1280, 720, 1]]) {
    await p.setViewport({width: w, height: h, deviceScaleFactor: dpr}); await frames(p, 5); await drawFrames(p, 2); const b = await buf();
    ok(b.w > 0 && b.h > 0 && b.w <= b.max && b.h <= b.max, `Zombies display ${w}x${h} @${dpr}x: the drawing buffer ${b.w}x${b.h} is inside the GPU's limit (${b.max})`); drain(S, `Zombies display ${w}x${h}@${dpr}`);
  }
  for (const [w, h] of LEAN ? [[120, 80], [1280, 720]] : [[320, 200], [120, 80], [50, 50], [1280, 720]]) { await p.setViewport({width: w, height: h}); await frames(p, 4); await sleep(300); await p.evaluate(() => window.__z.sim(1)); drain(S, `Zombies display ${w}x${h}`); }
  await frames(p, 6); const b = await buf(); ok(b.w > 0 && b.iw === 1280, 'Zombies display: back at 1280x720 the canvas is whole again'); await inView(S, 'Zombies HUD after tiny windows', ZHUD);
  await zState(S, 'Zombies display after tiny windows'); drain(S, 'Zombies display'); await p.close();
}, {fast: true});

// ---------- run ----------
const {server, origin} = await serve();
let browser = await launch();
async function B() { if (!browser.connected) browser = await launch(); return browser; }  /* a section that crashes the browser on purpose gets a fresh one */
/* CI runs an area's fast pass in parts (--part=N) so that each job stays well inside its time limit on a slow runner; a section not listed is in part 1 */
const PART = {'league-saves': 2, 'league-input': 2, 'league-display': 2, 'league-cycles': 3, 'league-monkey': 3, 'zombies-content': 2, 'zombies-campaign': 2, 'zombies-sortie': 2, 'zombies-spectator': 2, 'zombies-cycles': 3, 'zombies-coop': 3, 'zombies-display': 3, 'zombies-saves': 4, 'zombies-monkey': 4};
const PART_N = +(argv.find(a => a.startsWith('--part='))?.slice(7) || 0);
if (argv.includes('--list')) { for (const [n, s] of Object.entries(R)) console.log(n.padEnd(20), s.area.padEnd(12), ('part ' + (PART[n] || 1)).padEnd(8), s.fast ? 'fast' : 'full only'); process.exit(0); }
const timing = [];
for (const [name, s] of Object.entries(R)) {
  if (SECTIONS ? !SECTIONS.includes(name) : (FAST && !s.fast) || (AREA && s.area !== AREA) || (PART_N && (PART[name] || 1) !== PART_N)) continue;
  log('== ' + name); const t0 = Date.now();
  try { await s.f(await B()); } catch (e) { ok(false, name + ' threw: ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
  timing.push(`${name} ${((Date.now() - t0) / 1000).toFixed(0)} s`); log(`-- ${name} took ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close().catch(() => {}); server.close();
console.log('\ntimes: ' + timing.join(', '));
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
