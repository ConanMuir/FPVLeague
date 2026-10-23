/* The Hush's voice (WebAudio synth, no samples): one spatial bus with an HRTF panner at the boss, behind a lowpass that dulls it with distance.
   Voices, all fed by the cue maths in zhush-cue.js: an engine hum (a low saw and triangle with a thin blade whine, pitched with its speed and
   shifted by doppler), the whoosh of a pass (filtered noise that rises as it closes and falls away after it passes), wind-shear (a narrow
   hiss that follows how hard it banks) and the hull creak that tells you a pass is coming (a stick-slip groan gated at a few hertz).
   Everything leaves through dst (the boss loop's gain, then the master bus and its limiter); the voices add up to at most CAP before that.
   The listener (your camera) is set per frame by listen(); stop() and stopAll() tear every node down. */
import {Vector3} from 'three';
import {GAIN, CAP, REF, ROLL, cue} from './zhush-cue.js';
/* the creak's random pitch is drawn every frame it sounds: its own stream, so the frames played never shift the game's Math.random sequence */
let DS = 0x6a09e667; const dr = () => (DS = Math.imul(DS, 1664525) + 1013904223 >>> 0) / 4294967296;
const LIVE = new Set(), _f = new Vector3(), _u = new Vector3();
export const voices = () => LIVE.size;
/* the running voices (the harness reads their commanded levels against the cap) */
export const live = () => [...LIVE];
const cl = (v, a, b) => v < a ? a : v > b ? b : v;
export function hushVoice(AC, nbuf, dst) {
  const src = [], nd = [];
  const gn = (v = 0) => { const x = AC.createGain(); x.gain.value = v; nd.push(x); return x; };
  const fl = (t, hz, q = .7) => { const x = AC.createBiquadFilter(); x.type = t; x.frequency.value = hz; x.Q.value = q; nd.push(x); return x; };
  const os = (t, hz) => { const x = AC.createOscillator(); x.type = t; x.frequency.value = hz; x.start(); src.push(x); return x; };
  const nz = () => { const x = AC.createBufferSource(); x.buffer = nbuf; x.loop = true; x.start(0, dr() * 1.5); src.push(x); return x; };
  const pan = AC.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = REF; pan.rolloffFactor = ROLL; pan.maxDistance = 20000; nd.push(pan);
  const air = fl('lowpass', 17000, .5); air.connect(pan); pan.connect(dst);
  /* the hum: saw + triangle + a sub sine through a lowpass, and a thin whine at the blade rate */
  const humLP = fl('lowpass', 520, .8), humG = gn(), hum = [[os('sawtooth', 60), 1, .5], [os('triangle', 60), 1.006, .8], [os('sine', 30), .5, .9]];
  for (const [o, , a] of hum) o.connect(gn(a)).connect(humLP);
  humLP.connect(humG).connect(air);
  const whineO = os('sine', 380), whineG = gn(); whineO.connect(whineG).connect(air);
  /* the whoosh: noise through a moving bandpass */
  const whF = fl('bandpass', 900, .9), whG = gn(); nz().connect(whF).connect(whG).connect(air);
  /* wind-shear: a narrow hiss */
  const shF = fl('bandpass', 2600, 5), shG = gn(); nz().connect(shF).connect(shG).connect(air);
  /* the creak: a saw groaning through a resonant bandpass, chopped by a square LFO into stick-slip */
  const crO = os('sawtooth', 120), crF = fl('bandpass', 950, 9), gate = gn(.5), crG = gn(), lfo = os('square', 8), lfoG = gn(.5);
  crO.connect(crF).connect(gate).connect(crG).connect(air); lfo.connect(lfoG).connect(gate.gain);
  const lvl = {hum: 0, blade: 0, whoosh: 0, shear: 0, creak: 0}, c = {}, V = {
    lvl, pan, nodes: nd.length + src.length, peak: GAIN.hum + GAIN.blade + GAIN.whoosh + GAIN.shear + GAIN.creak, cap: CAP,
    /* the commanded sum of the voices before distance (what the harness checks against the cap) */
    now: () => lvl.hum + lvl.blade + lvl.whoosh + lvl.shear + lvl.creak,
    /* b, me as in cue(); returns the cue so the caller can use it too */
    set(b, me) {
      if (!LIVE.has(V)) return null;
      cue(c, b, me); const T = AC.currentTime, k = .08, f0 = (46 + .38 * c.sp) * c.dop;
      for (const [o, m] of hum) o.frequency.setTargetAtTime(f0 * m, T, k);
      humLP.frequency.setTargetAtTime(380 + 4 * c.sp, T, .2); whineO.frequency.setTargetAtTime(f0 * 6.3, T, k);
      whF.frequency.setTargetAtTime((420 + 2300 * c.sweep) * Math.min(1.4, c.dop), T, .06);
      shF.frequency.setTargetAtTime(2200 + 900 * (b.yr > 0 ? 1 : -1) * cl(Math.abs(b.yr) / .6, 0, 1), T, .1);
      air.frequency.setTargetAtTime(cl(17000 * Math.exp(-c.d / 1800), 400, 17000), T, .15);
      if (c.creak > 0) { crO.frequency.setValueAtTime(85 + dr() * 160, T); lfo.frequency.setValueAtTime(5 + dr() * 6, T); crF.frequency.setValueAtTime(700 + dr() * 700, T); }
      lvl.hum = c.hum; lvl.blade = c.blade; lvl.whoosh = c.whoosh; lvl.shear = c.shear; lvl.creak = c.creak;
      humG.gain.setTargetAtTime(c.hum, T, .15); whineG.gain.setTargetAtTime(c.blade, T, .15); whG.gain.setTargetAtTime(c.whoosh, T, .05);
      shG.gain.setTargetAtTime(c.shear, T, .08); crG.gain.setTargetAtTime(c.creak, T, .05);
      if (pan.positionX) { pan.positionX.value = b.p.x; pan.positionY.value = b.p.y; pan.positionZ.value = b.p.z; } else pan.setPosition(b.p.x, b.p.y, b.p.z);
      return c;
    },
    stop() {
      if (!LIVE.delete(V)) return;
      for (const g of [humG, whineG, whG, shG, crG]) { try { g.gain.cancelScheduledValues(0); g.gain.value = 0; } catch (e) { /* the context may be closed */ } }
      for (const s of src) { try { s.stop(); } catch (e) { /* already stopped */ } }
      for (const n of [...nd, ...src]) { try { n.disconnect(); } catch (e) { /* already apart */ } }
      lvl.hum = lvl.blade = lvl.whoosh = lvl.shear = lvl.creak = 0;
    }};
  LIVE.add(V); return V;
}
/* the listener is your camera: position and orientation, every frame the boss is up */
export function listen(AC, cam, q) {
  const L = AC.listener, p = cam.position, f = _f.set(0, 0, -1).applyQuaternion(q || cam.quaternion), u = _u.set(0, 1, 0).applyQuaternion(q || cam.quaternion);
  if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
  else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
}
/* back to the defaults once nothing is playing */
export function unlisten(AC) {
  const L = AC?.listener; if (!L) return;
  try { if (L.positionX) { L.positionX.value = L.positionY.value = L.positionZ.value = 0; L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } else { L.setPosition(0, 0, 0); L.setOrientation(0, 0, -1, 0, 1, 0); } } catch (e) { /* closed context */ }
}
export function stopAll(AC) { for (const v of [...LIVE]) v.stop(); unlisten(AC); }
