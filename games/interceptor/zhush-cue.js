/* The Hush's sound picture: what a listener hears of it, as plain numbers. Pure maths (no three.js, no DOM, no audio), so the same function
   feeds the speakers (zhush-snd.js), the optional audio-assist HUD cue (zboss-hush.js), and the bot pilots' hearing (zboss-brain.js / aim),
   and every screen in a co-op game computes it from the synced boss position and velocity.
   The boss b: {p, v (any {x,y,z}), yr (heading change, rad/s), md (0 circling, 1 winding up, 2 on a pass), wf (windup 0..1), ph (phase)}.
   The listener me: {p, v, f (forward unit), u (up unit)}. All gains are game-tuned, not measurements; GAIN is the nominal peak of each voice
   before distance (the speakers sum at most CAP, and the master bus and its limiter come after). */
export const MD = {orbit: 0, wind: 1, run: 2};
export const GAIN = {hum: .07, blade: .02, whoosh: .1, shear: .04, creak: .06};
export const CAP = .3;  /* the most the voices may add up to, pre master bus */
export const REF = 300, ROLL = .5, SOUND = 343;
const cl = (v, a, b) => v < a ? a : v > b ? b : v;
/* distance rolloff, the same inverse model the panner uses (refDistance REF, rolloffFactor ROLL) */
export const atten = d => REF / (REF + ROLL * Math.max(0, d - REF));
/* fills and returns o:
   d (m), az (rad, 0 ahead, + to the right, +-PI behind), el (rad up), cs (closing speed m/s, + coming at you), sp (its speed), dop (pitch factor),
   at (distance gain), sweep (1 head-on .. 0 receding), hum / blade / whoosh / shear / creak (voice gains before distance), tot (their sum),
   loud (0..1, how well you hear it: the voices after distance) */
export function cue(o, b, me) {
  const dx = b.p.x - me.p.x, dy = b.p.y - me.p.y, dz = b.p.z - me.p.z, d = Math.hypot(dx, dy, dz) || 1, ux = dx / d, uy = dy / d, uz = dz / d;
  const cs = -((b.v.x - me.v.x) * ux + (b.v.y - me.v.y) * uy + (b.v.z - me.v.z) * uz), sp = Math.hypot(b.v.x, b.v.y, b.v.z), f = me.f, u = me.u;
  const rx = f.y * u.z - f.z * u.y, ry = f.z * u.x - f.x * u.z, rz = f.x * u.y - f.y * u.x;  /* right = forward x up */
  const X = dx * rx + dy * ry + dz * rz, Y = dx * u.x + dy * u.y + dz * u.z, Zf = dx * f.x + dy * f.y + dz * f.z;
  o.d = d; o.az = Math.atan2(X, Zf); o.el = Math.atan2(Y, Math.hypot(X, Zf)); o.cs = cs; o.sp = sp;
  o.dop = cl(SOUND / (SOUND - .6 * cs), .55, 1.8); o.at = atten(d); o.sweep = cl((cs + sp) / (2 * Math.max(sp, 1)), 0, 1);
  const run = b.md === MD.run, quiet = b.ph >= 2 && !run;  /* last phase: the engine is cut between passes */
  o.hum = GAIN.hum * (run ? 1 : quiet ? .12 : .8); o.blade = GAIN.blade * (run ? 1 : quiet ? .05 : .3);
  o.whoosh = GAIN.whoosh * cl((sp - 80) / 100, 0, 1) ** 1.3 * (.45 + .55 * cl((cs + 40) / (sp + 40), 0, 1));
  o.shear = GAIN.shear * cl((Math.abs(b.yr || 0) - .1) / .45, 0, 1) * cl(sp / 100, 0, 1);
  o.creak = b.md === MD.wind ? GAIN.creak * (.5 + .5 * cl(b.wf || 0, 0, 1)) : 0;
  o.tot = o.hum + o.blade + o.whoosh + o.shear + o.creak; o.loud = cl(o.tot * o.at / .045, 0, 1);
  return o;
}
