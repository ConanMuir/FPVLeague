// Mode lifecycle (src/modes/registry.js): flags, overlays, exit / setup / enter order, per-frame hud hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MODES,OVERLAYS,addHud,curMode,modeFlag,modeHud,modeId,overlay,registerMode,registerOverlay,switchMode} from '../src/modes/registry.js';
import {GS} from '../src/state.js';

const log = [];
registerMode('league', {name: 'L', title: 'L', sub: '', order: 0});
registerMode('tfree', {name: 'F', title: 'F', sub: '', order: 2, free: true, enter: c => log.push('enter tfree from ' + (c.prev?.id ?? null)), exit: n => log.push('exit tfree to ' + n.id)});
let on = false, goals = true;
registerMode('tgoal', {name: 'G', title: 'G', sub: '', order: 3, allowGoals: () => goals});
const ov = registerOverlay('tov', {on: () => on, fixedCam: true, allowReset: false});

test('defaults: arena world, goals allowed, reset only in free modes', () => {
  assert.equal(MODES.league.world, 'arena'); assert.equal(MODES.league.allowGoals, true); assert.equal(MODES.league.allowReset, false);
  assert.equal(MODES.tfree.allowReset, true); assert.equal(modeId('nope'), 'league'); assert.equal(modeId('tfree'), 'tfree');
});

test('flags: the mode, function flags, and an overlay that is on wins', () => {
  GS.GM = 'tfree'; assert.equal(curMode().id, 'tfree'); assert.equal(modeFlag('allowReset'), true); assert.equal(modeFlag('fixedCam'), undefined);
  on = true; assert.equal(overlay(), ov); assert.equal(modeFlag('allowReset'), false); assert.equal(modeFlag('fixedCam'), true); assert.equal(modeFlag('allowGoals'), true);
  on = false; assert.equal(overlay(), null);
  GS.GM = 'tgoal'; assert.equal(modeFlag('allowGoals'), true); goals = false; assert.equal(modeFlag('allowGoals'), false);
  GS.GM = 'gone'; assert.equal(curMode().id, 'league');
});

test('lifecycle: exit, then setup, then enter; the same mode only runs setup', () => {
  const setup = M => log.push('setup ' + M.id);
  log.length = 0; switchMode('league', setup); switchMode('tfree', setup); switchMode('tfree', setup); switchMode('bogus', setup);
  assert.deepEqual(log, ['setup league', 'setup tfree', 'enter tfree from league', 'setup tfree', 'exit tfree to league', 'setup league']);
});

test('hud hooks run every frame for every mode and overlay, told whether they are active', () => {
  const seen = []; addHud('tov', (now, a) => seen.push(['tov', now, a])); addHud('tfree', (now, a) => seen.push(['tfree', now, a]));
  GS.GM = 'tfree'; on = false; modeHud(5); on = true; modeHud(6); on = false;
  assert.deepEqual(seen, [['tov', 5, false], ['tfree', 5, true], ['tov', 6, true], ['tfree', 6, true]]);
  assert.throws(() => addHud('nothing', () => {}));
  assert.ok(OVERLAYS.includes(ov));
});
