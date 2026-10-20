// Dynamic resolution controller (src/render/dynres.js): drops under slow frames, stops at min, comes back with headroom, and settles
// instead of see-sawing when the frame time follows the pixel count.
import test from 'node:test';
import assert from 'node:assert/strict';
import {dynRes} from '../src/render/dynres.js';

const run = (d, sec, ms) => { let n = 0; for (let t = 0; t < sec * 1000; t += typeof ms === 'function' ? ms(d.scale) : ms) if (d.sample(typeof ms === 'function' ? ms(d.scale) : ms)) n++; return n; };

test('off: parks at full scale and never moves', () => {
  const d = dynRes(); assert.equal(run(d, 10, 80), 0); assert.equal(d.scale, 1);
  d.on = true; run(d, 5, 80); assert.ok(d.scale < 1); d.on = false; d.sample(16); assert.equal(d.scale, 1);
});

test('slow frames: steps down to min and stays there', () => {
  const d = dynRes({min: .6}); d.on = true; run(d, 20, 60); assert.equal(d.scale, .6);
});

test('headroom: comes back up to full scale', () => {
  const d = dynRes(); d.on = true; run(d, 10, 60); assert.equal(d.scale, .6); run(d, 60, 16.7); assert.equal(d.scale, 1);
});

test('frame time that follows the pixel count settles (no see-saw)', () => {
  // a GPU-bound game at 26 ms per frame at full scale: about 0.82 fits a 18.2 ms budget; vsync rounds frames up to 16.7 ms steps
  const d = dynRes(); d.on = true; const ms = s => Math.ceil(26 * s * s / 16.67) * 16.67;
  run(d, 30, ms); const settled = run(d, 120, ms);
  assert.ok(d.scale < 1 && d.scale >= .6, 'scale ' + d.scale);
  assert.ok(settled <= 12, `changed ${settled} times in two settled minutes`);
});
