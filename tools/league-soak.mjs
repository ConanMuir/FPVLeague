// League soak: long bot-vs-bot matches in League (every map) and Dogfight, several level pairings, through the real modules on the Vite
// dev server (like tools/bot-match.mjs). Every tick it checks the ball stays inside the arena (signed distance and bounds), no drone or
// ball goes NaN, and no drone sits inside a wall or cave rock; between chunks real frames are drawn and the scene, GPU memory and JS heap
// are sampled for leaks. Run: node tools/league-soak.mjs [sim minutes per match, default 3] [--quick]
import puppeteer from 'puppeteer-core';
const argv = process.argv.slice(2), MINS = +(argv.find(a => /^\d/.test(a)) || 3), QUICK = argv.includes('--quick');
const {createServer} = await import('vite');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__COMPAT_LAYER|CHROME_|ELECTRON_|VSCODE_)/i.test(k)));
const server = await createServer({root: process.cwd(), logLevel: 'error', server: {port: 0, host: '127.0.0.1'}}); await server.listen();
const b = await puppeteer.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, protocolTimeout: 0, env, args: ['--ignore-gpu-blocklist', '--window-size=960,540']});
const p = await b.newPage(); await p.setViewport({width: 960, height: 540}); const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { const u = m.location()?.url || ''; if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text() + ' ' + u)) errs.push('console.error: ' + m.text() + ' ' + u); }); p.on('error', e => errs.push('page crashed: ' + e.message));
await p.goto(server.resolvedUrls.local[0] + 'app.html'); await new Promise(r => setTimeout(r, 6000)); p.setDefaultTimeout(0);
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
async function heapMB() { const s = await p.target().createCDPSession(); await s.send('HeapProfiler.collectGarbage'); const h = await s.send('Runtime.getHeapUsage'); await s.detach(); return +(h.usedSize / 1048576).toFixed(1); }

await p.evaluate(async () => {
  const M = window.__ls = {DF: await import('/src/modes/dogfight.js'), MA: await import('/src/modes/match.js'), GS: (await import('/src/state.js')).GS, ST: await import('/src/modes/step.js'),
    ball: (await import('/src/physics/ball.js')).ball, C: await import('/src/config/constants.js'), SD: await import('/src/physics/sdf.js'), MP: await import('/src/world/maps.js'), R: await import('/src/render/renderer.js'),
    S: (await import('/src/config/settings.js')).S, CV: await import('/src/world/caves.js')};
  M.lv = x => { const i = M.C.DIFF.findIndex(d => d.n.toLowerCase() === String(x).toLowerCase()); return i >= 0 ? i : +x; };
  // one config: mode, map, two levels, sim seconds; returns per-tick invariant counts
  M.setup = (mode, map, la, lb) => { const {DF, MA, GS, S, MP} = M; if (mode !== 'df') { S.map = map; } DF.setGame(mode); if (mode !== 'df') MP.setMap(map); MA.startDemo(); GS.paused = true; GS.menuOpen = true; GS.score = [0, 0];
    for (const d of GS.drones) d.skill = d.team === 0 ? M.lv(la) : M.lv(lb); MA.kickoff(); M.acc = {ticks: 0, play: 0, goals: 0, ballOut: 0, ballOutMax: 0, ballFar: 0, nan: 0, inWall: 0, inWallMax: 0, stuck: 0, stuckWho: [], demos: 0, pos: new Map()}; };
  M.run = sec => { const {GS, ST, ball, SD, C} = M, A = M.acc, dt = 1 / 120, n = Math.round(sec / dt);
    for (let i = 0; i < n; i++) { const s0 = GS.score[0] + GS.score[1]; ST.step(dt); A.ticks++; if (GS.state === 'play') A.play += dt; if (GS.score[0] + GS.score[1] !== s0) A.goals++;
      if (!Number.isFinite(ball.p.x + ball.p.y + ball.p.z + ball.v.x + ball.v.y + ball.v.z)) A.nan++;
      if (!GS.OBSON) { const d = SD.sdf(ball.p.x, ball.p.y, ball.p.z) + C.BR; if (d > .3) { A.ballOut++; A.ballOutMax = Math.max(A.ballOutMax, d); } if (Math.abs(ball.p.x) > C.HW + 5 || Math.abs(ball.p.z) > C.HL + C.GD + 8 || ball.p.y < -2 || ball.p.y > C.H + 10) A.ballFar++; }
      if (i % 12) continue;  // drones: 10 Hz is plenty
      for (const d of GS.drones) { if (d.dead > 0) continue; if (!Number.isFinite(d.p.x + d.p.y + d.p.z + d.v.x + d.q.w)) { A.nan++; continue; }
        const s = SD.sdf(d.p.x, d.p.y, d.p.z); if (s > .25) { A.inWall++; A.inWallMax = Math.max(A.inWallMax, s); }
        // stuck: alive, in play, moved < 1.5 m over the last 4 s while inside or touching rock
        let h = A.pos.get(d); if (!h) A.pos.set(d, h = {p: d.p.clone(), t: 0, n: 0}); h.t += .1; if (h.t >= 4) { if (GS.state === 'play' && d.p.distanceTo(h.p) < 1.5 && s > -.6) { A.stuck++; if (A.stuckWho.length < 6) A.stuckWho.push(`${d.key}@${d.p.toArray().map(v => Math.round(v))} sdf ${s.toFixed(2)}`); } h.p.copy(d.p); h.t = 0; } } }
    return {state: GS.state, score: [...GS.score]}; };
  // leak probe: geometries the renderer uploaded that are neither disposed nor in the scene any more, by the code that built them
  let BG = Object.getPrototypeOf(M.ball.mesh?.geometry || M.R.scene.children.find(o => o.geometry).geometry); while (!Object.hasOwn(BG, 'setAttribute')) BG = Object.getPrototypeOf(BG);  /* BufferGeometry.prototype of the game's own three.js */
  const ED = Object.getPrototypeOf(BG), add = ED.addEventListener, dis = BG.dispose, sa = BG.setAttribute, made = new WeakMap(), up = new Map();
  BG.setAttribute = function (n, a) { if (!made.has(this)) made.set(this, (new Error().stack.split('\n').slice(2).find(l => !/three|vite\/deps/.test(l)) || '').trim().replace(/https?:\/\/[^/]+/, '').replace(/\?[^:)]*/, '')); return sa.call(this, n, a); };
  ED.addEventListener = function (t, f) { if (t === 'dispose' && this.isBufferGeometry && !up.has(this)) up.set(this, made.get(this) || 'made before the probe'); return add.call(this, t, f); };
  BG.dispose = function () { up.delete(this); return dis.call(this); };
  M.stats = () => { const {R} = M; let objs = 0; const live = new Set(); R.scene.traverse(o => { objs++; if (o.geometry) live.add(o.geometry); }); const m = R.renderer.info.memory, by = {}; let orphan = 0;
    for (const [g, at] of up) if (!live.has(g)) { orphan++; by[at] = (by[at] || 0) + 1; }
    return {objs, geo: m.geometries, tex: m.textures, orphan, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => v + ' x ' + k.slice(0, 140))}; };
});

const LOOKS = await p.evaluate(() => Object.keys(window.__ls.MP.LOOKS).filter(k => k !== 'df'));
const PAIRS = QUICK ? [['Rookie', 'Grand Champion']] : [['Rookie', 'Grand Champion'], ['Legend', 'Champion'], ['Dribbler', 'Freestyler']];
const CONFIGS = [];
for (const map of LOOKS) for (const [a, bb] of PAIRS) CONFIGS.push(['league', map, a, bb]);
for (const [a, bb] of PAIRS) CONFIGS.push(['df', 'df', a, bb]);
console.log(`maps: ${LOOKS.join(', ')}; ${CONFIGS.length} matches of ${MINS} sim minutes`);
const rows = []; let simMin = 0;
const h0 = await heapMB(), s0 = await p.evaluate(() => window.__ls.stats());
for (const [mode, map, la, lb] of CONFIGS) {
  const T0 = Date.now(); await p.evaluate((m, map, a, b) => window.__ls.setup(m, map, a, b), mode, map, la, lb);
  for (let c = 0; c < MINS * 4; c++) { await p.evaluate(() => window.__ls.run(15)); await new Promise(r => setTimeout(r, 30)); }
  simMin += MINS;
  const a = await p.evaluate(() => { const A = window.__ls.acc; return {...A, pos: undefined, play: +(A.play / 60).toFixed(1), ballOutMax: +A.ballOutMax.toFixed(2), inWallMax: +A.inWallMax.toFixed(2)}; });
  const st = await p.evaluate(() => window.__ls.stats());
  rows.push({mode, map, la, lb, ...a, ...st});
  console.log(`  ${mode.padEnd(6)} ${map.padEnd(8)} ${la} v ${lb}: ${a.goals} goals/points, play ${a.play} min | ball out ${a.ballOut} ticks (max ${a.ballOutMax} m) far ${a.ballFar} | NaN ${a.nan} | in wall ${a.inWall} samples (max ${a.inWallMax} m) | stuck ${a.stuck} ${a.stuckWho.join(' ')} | objs ${st.objs} geo ${st.geo} tex ${st.tex} | ${Math.round((Date.now() - T0) / 1000)} s`);
}
const h1 = await heapMB(), s1 = await p.evaluate(() => window.__ls.stats());
// the same configs again: a second pass must not grow the scene or GPU memory (map and mode switches reuse what they built)
for (const [mode, map, la, lb] of CONFIGS) { await p.evaluate((m, map, a, b) => window.__ls.setup(m, map, a, b), mode, map, la, lb); await p.evaluate(() => window.__ls.run(10)); await new Promise(r => setTimeout(r, 30)); }
const h2 = await heapMB(), s2 = await p.evaluate(() => window.__ls.stats());
console.log(`heap MB: start ${h0}, after pass 1 ${h1}, after pass 2 ${h2}; scene objects ${s0.objs} -> ${s1.objs} -> ${s2.objs}; geometries ${s0.geo} -> ${s1.geo} -> ${s2.geo} (left behind ${s0.orphan} -> ${s1.orphan} -> ${s2.orphan}); textures ${s0.tex} -> ${s1.tex} -> ${s2.tex}`);
if (s2.orphan) console.log("  left-behind geometries by where they were made:", JSON.stringify(s2.top));
ok(rows.every(r => !r.nan), 'no NaN in ball or drones');
ok(rows.every(r => r.mode === 'df' || (r.ballOut < 30 && !r.ballFar)), `League: the ball stays in the arena (${rows.filter(r => r.mode !== 'df').map(r => r.ballOut + '/' + r.ballFar).join(' ')})`);
ok(rows.every(r => r.inWall < 50), `drones stay out of walls and rock (samples inside: ${rows.map(r => r.inWall).join(' ')})`);
ok(rows.every(r => r.stuck < 5), `no drone stuck against a wall or in a cave (${rows.map(r => r.stuck).join(' ')})`);
ok([...new Set(rows.map(r => r.mode))].every(m => rows.filter(r => r.mode === m).reduce((a, r) => a + r.goals, 0) > 0), `every mode scores (${rows.map(r => r.goals).join(" ")})`);
// mode lifecycle through the real menu: in a match, open the pause menu and switch League -> Dogfight -> Freeplay -> League with the mode
// buttons, then enter a training pack from its tile, play shots, leave with Leave game; 8 rounds. The mode, world, drones, physics
// bodies and scene must come back to the same state every round.
const LC = [];
for (let round = 0; round < 8; round++) {
  const r = await p.evaluate(async round => { const {MA, GS, ST, DF, R} = window.__ls, W = await import('/src/physics/world.js'), T = await import('/src/modes/training.js'), $ = id => document.getElementById(id), seen = [];
    const run = s => { for (let i = 0; i < s * 120; i++) ST.step(1 / 120); };
    if (GS.demo) { MA.startMatch(); }  /* a real match (the pause menu's mode buttons then start matches too) */
    for (const m of ['df', 'free', 'league']) { MA.showMenu(true); const b = $('m_' + m); if (!b) return {err: 'no mode button ' + m}; b.click(); GS.paused = false; GS.menuOpen = false; run(2);
      seen.push(`${m}:${GS.GM}/${GS.OBSON ? 'hl' : 'ar'}/${GS.drones.length}`); }
    MA.showMenu(true); $('packsbtn')?.click();  /* the Training screen's pack tiles are drawn when it opens */
    const tiles = [...($('ptiles')?.children || [])].filter(b => b.dataset.id), tile = tiles[round % Math.max(1, tiles.length)]; if (!tile) return {err: 'no training tiles'};
    MA.showMenu(true); tile.click(); GS.paused = false; GS.menuOpen = false; const on = T.TR.on, pack = T.TR.pack?.id;
    for (let s = 0; s < 3 && T.TR.on; s++) { run(1); T.goShot(); run(3); T.nextShot(); }
    MA.showMenu(true); $('leave').click(); const off = !T.TR.on; GS.paused = true; GS.menuOpen = true;
    if (!GS.demo) MA.startDemo(); GS.paused = true; GS.menuOpen = true; run(.5);
    const st = window.__ls.stats(); return {seen, on, pack, off, GM: GS.GM, drones: GS.drones.length, bodies: W.world.bodies.len(), colliders: W.world.colliders.len(), objs: st.objs, geo: st.geo, orphan: st.orphan, top: st.top}; }, round);
  LC.push(r); if (r.err) break;
}
console.log('mode lifecycle rounds:'); for (const r of LC) console.log('  ' + (r.err || `${r.seen.join(' ')} | training ${r.pack} on ${r.on} off ${r.off} -> ${r.GM} | drones ${r.drones} bodies ${r.bodies} colliders ${r.colliders} objs ${r.objs} geo ${r.geo} left behind ${r.orphan}`));
ok(LC.every(r => !r.err && r.seen.every(s => { const [want, got] = s.split(':'); return got.startsWith(want + '/'); }) && r.on && r.off), 'mode buttons in the pause menu switch modes, training packs enter and leave');
{ const a = LC[2] || LC[0], z = LC.at(-1); ok(!z.err && z.bodies === a.bodies && z.colliders === a.colliders && z.drones === a.drones && z.objs - a.objs < 30 && z.geo - a.geo < 40, `mode lifecycle leaves nothing behind (round 3 -> 8: bodies ${a.bodies} -> ${z.bodies}, colliders ${a.colliders} -> ${z.colliders}, drones ${a.drones} -> ${z.drones}, objects ${a.objs} -> ${z.objs}, geometries ${a.geo} -> ${z.geo})` + (z.geo - a.geo >= 40 ? ' ' + JSON.stringify(z.top) : '')); }

// many match starts: every one re-rolls the bots' part loadouts; GPU geometries must level off (the parts cache is capped, each drone frees its trail)
const reb = []; for (let k = 0; k < 3; k++) { reb.push(await p.evaluate(() => { const {MA, GS} = window.__ls; for (let i = 0; i < 25; i++) { MA.startDemo(); GS.paused = true; GS.menuOpen = true; window.__ls.ST.step(1 / 120); } return null; })); await new Promise(r => setTimeout(r, 300)); reb[k] = await p.evaluate(() => window.__ls.stats()); }
console.log(`75 match starts: geometries ${reb.map(r => r.geo).join(' -> ')}, left behind ${reb.map(r => r.orphan).join(' -> ')}`);
ok(reb[2].geo - reb[1].geo < 40 && reb[2].orphan < 300, `GPU geometries level off over many match starts (${reb.map(r => r.geo).join(' -> ')} after each 25; uploaded but out of the scene: ${reb[2].orphan}, the parts cache holds at most 24 loadouts)` + (reb[2].orphan >= 300 ? ' ' + JSON.stringify(reb[2].top) : ''));
ok(s2.objs - s1.objs < 50 && s2.tex - s1.tex < 10, `second pass over every map and mode doesn't grow the scene (${s1.objs} -> ${s2.objs} objects, ${s1.tex} -> ${s2.tex} textures)`);
ok(h2 - h1 < 25, `JS heap steady over the second pass (${h1} -> ${h2} MB)`);
ok(!errs.length, 'no page errors' + (errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : ''));
console.log(`league soak: ${CONFIGS.length} matches, ${simMin} sim match-minutes`);
await b.close(); await server.close();
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
