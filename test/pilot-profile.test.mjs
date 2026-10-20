// The shared pilot profile (localStorage 'droneleague'): Drone League (src/config/settings.js) and the engine games (the Interceptor,
// engine/settings.js) read and write the same button keys, fireBtn, flipBtn, xfire and xflip. Drone League's form is the main one:
// a button index, -1, 'aN' (axis N above +0.5) or 'aN-' (below -0.5). The engine writes that form into the shared profile and keeps
// its exact binding (a learned 'aN>m', or '-aN') in its own key; it reads both forms. Before this, a switch learned in the Interceptor
// was reset to the default by Drone League, and an 'aN-' bound in Drone League never fired in the Interceptor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./fixtures/flight-stubs.mjs', import.meta.url);
const store = new Map();
globalThis.localStorage = {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
globalThis.addEventListener ??= () => {};
Object.defineProperty(globalThis, 'navigator', {value: {getGamepads: () => [], userAgent: 'node'}, configurable: true});
const E = await import('../engine/settings.js'), EI = await import('../engine/input.js');
const J = await import('../src/config/settings.js'), JI = await import('../src/input/input.js');

const KEY = 'dl-interceptor', DEF = {mode: 'acro', tilt: 90};
const get = k => JSON.parse(store.get(k) || '{}');
const engineLoad = () => { for (const k in E.S) delete E.S[k]; return E.loadSettings(KEY, DEF, ['tilt']); };
// Drone League's own load of the shared profile (its schema resets any value it does not accept)
const leagueLoad = () => J.loadSettings(() => store.get('droneleague') ?? null, () => {});
const pad = axes => ({axes, buttons: Array.from({length: 17}, (_, i) => ({pressed: i === 3, value: i === 3 ? 1 : 0}))});
const BTN = ['fireBtn', 'flipBtn', 'xfire', 'xflip'];

test('the engine writes Drone League\'s form into the shared profile and keeps its exact binding', () => {
  store.clear(); engineLoad();
  Object.assign(E.S, {fireBtn: 'a5>0.12', flipBtn: '-a3', xfire: 'a4<-0.30', xflip: 2}); E.save();
  assert.deepEqual(BTN.map(k => get('droneleague')[k]), ['a5', 'a3-', 'a4-', 2]);
  assert.deepEqual(BTN.map(k => get(KEY)[k]), ['a5>0.12', '-a3', 'a4<-0.30', 2]);
  const L = leagueLoad();
  assert.deepEqual(BTN.map(k => L[k]), ['a5', 'a3-', 'a4-', 2], 'Drone League keeps them instead of resetting them to its defaults');
  engineLoad();
  assert.deepEqual(BTN.map(k => E.S[k]), ['a5>0.12', '-a3', 'a4<-0.30', 2], 'the Interceptor gets its learned thresholds back');
});

test('a binding changed in Drone League wins, and reads the same in both games', () => {
  store.clear(); engineLoad(); Object.assign(E.S, {fireBtn: 'a5>0.12', flipBtn: '-a3'}); E.save();
  const sh = get('droneleague'); Object.assign(sh, {fireBtn: 'a6-', flipBtn: 'a2', xfire: 4, xflip: -1}); store.set('droneleague', JSON.stringify(sh));
  engineLoad();
  assert.deepEqual(BTN.map(k => E.S[k]), ['-a6', 'a2', 4, -1]);
  E.save(); assert.deepEqual(BTN.map(k => get('droneleague')[k]), ['a6-', 'a2', 4, -1], 'saving again leaves the shared values as Drone League wrote them');
});

test('every Drone League binding means the same in the engine (swOn) as in Drone League (btnOn)', () => {
  const vals = [-1, 0, 3, 7, 'a0', 'a0-', 'a3', 'a3-', 'a7', 'a7-'], positions = [-1, -.6, -.5, -.4, 0, .4, .5, .6, 1];
  for (const b of vals) for (const v of positions) {
    const g = pad([v, v, v, v, v, v, v, v]), j = JI.btnOn(g, b);
    for (const e of [b, E.fromLeague(b)]) assert.equal(EI.swOn(g, e), j, `${JSON.stringify(e)} at ${v}`);
  }
  assert.equal(EI.swName('a3-'), 'Axis 3 low'); assert.equal(EI.swName('-a3'), 'Axis 3 low'); assert.equal(EI.swName('a3'), 'Axis 3 high');
});

test('older saves: the engine\'s own form in the shared profile still loads', () => {
  store.clear(); store.set('droneleague', JSON.stringify({fireBtn: 'a5>0.12', flipBtn: '-a3', xfire: 'a2', xflip: 1}));
  engineLoad();
  assert.deepEqual(BTN.map(k => E.S[k]), ['a5>0.12', '-a3', 'a2', 1]);
  E.save(); assert.deepEqual(BTN.map(k => get('droneleague')[k]), ['a5', 'a3-', 'a2', 1]);
});

test('toLeague / fromLeague', () => {
  const T = [[5, 5], [-1, -1], ['a2', 'a2'], ['-a2', 'a2-'], ['a2-', 'a2-'], ['a5>0.12', 'a5'], ['a5<0.12', 'a5-'], ['a5>-0.4', 'a5'], ['a12', 'a12'], ['junk', 'junk']];
  for (const [a, b] of T) assert.equal(E.toLeague(a), b, JSON.stringify(a));
  for (const [a, b] of [['a2-', '-a2'], ['a2', 'a2'], [5, 5], ['a5>0.12', 'a5>0.12'], ['-a2', '-a2']]) assert.equal(E.fromLeague(a), b, JSON.stringify(a));
});
