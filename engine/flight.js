// Flight helpers for the engine's games: the attitude controller (bots and Angle mode) and rough air (coloured-noise turbulence,
// fin weathervaning). The Interceptor dart (games/interceptor/interceptor.js) flies its own step built from the shared flight core,
// src/flight/core.js, the same air-model code Drone League (src/) flies.
// The League quad that lived here (Quad: rounded-box ground contact, turtle pivots, self-righting, flip-over; humanControl;
// tuneFlight, setWorld) went with Riley's games/league when Drone League became the one League (it is in git history).
import {attitude} from '../src/flight/core.js';
import {V3,QT} from './util.js';

// ---------- attitude controller (shared by bots + Angle mode): src/flight/core.js, re-exported for the games ----------
export {attitude};

// ---------- rough air, for airframes that model it (the Interceptor dart) ----------
export const gn=()=>(Math.random()+Math.random()+Math.random()+Math.random()-2)*1.73;  // ≈ unit normal
// Ornstein-Uhlenbeck step: coloured noise in v with standard deviation sd and correlation time tau (y scaled by ys)
export function ou(v,dt,tau,sd,ys=1){const k=Math.min(1,dt/tau),a=sd*Math.sqrt(2*k);return v.set(v.x*(1-k)+gn()*a,v.y*(1-k)+gn()*a*ys,v.z*(1-k)+gn()*a)}
// weathervane: fins swing the thrust axis (body up) toward the relative wind vr (airspeed s, s > 0) and damp pitch / yaw rate
const _wv=new V3(),_wu=new V3(),_wq=new QT();
export function weathervane(d,vr,s,dt,kw,kd){const up=_wu.set(0,1,0).applyQuaternion(d.q),c=_wv.crossVectors(up,vr.divideScalar(s));
 c.applyQuaternion(_wq.copy(d.q).invert()).multiplyScalar(kw*s*s*dt);d.w.add(c);const dmp=Math.min(1,kd*s*dt);d.w.x-=d.w.x*dmp;d.w.z-=d.w.z*dmp}
