// ---------- shared flight core: the acro quad maths every Drone League game flies on ----------
// One copy for Jared's game (src/, bundled by Vite) and Riley's games (engine/ and games/, raw ES modules: they import
// ../../src/flight/core.js straight from the server). Leaf module: it imports only three, which Vite resolves for src/ and the
// games' import map resolves for games/, so both get the same THREE as the rest of their code. Pure maths on the drone object:
// no DOM, no audio, no game state, so it also runs in node (test/flight-golden.test.mjs).
// What stays with each game, as config or hooks: the tune (K), parts multipliers (F), ground contact (Rapier in src/, Quad.ground
// in engine/), turtle / self-righting / flip-over triggers, pops, the ball, and the Interceptor's dart (finite-authority rate
// loop, fins, wind, battery, Rocket Assist), which builds its step from the blocks below. docs/SHARED-ENGINE.md has the map.
// Every block here is the exact expression the games used before (same operations in the same order), so the goldens match
// bit for bit; keep it that way unless a feel change is intended (then re-record the goldens and say so).
import * as THREE from 'three';
const V3=THREE.Vector3,QT=THREE.Quaternion,cl=(v,a,b)=>v<a?a:v>b?b:v,UP=new V3(0,1,0);
export const P3=x=>x*x*x,wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));

// ---------- rates: Betaflight rate maths (rc.c) for every rates type ----------
// f: [display multiplier, min, max] in the units Configurator shows; stored values are Betaflight's raw CLI integers
export const RTYPES={BETAFLIGHT:{h:['RC Rate','Super Rate','RC Expo'],f:[[.01,.01,2.55],[.01,0,1],[.01,0,1]],d:[100,70,0]},
 ACTUAL:{h:['Center Sens.','Max Rate','Expo'],f:[[10,10,2000],[10,10,2000],[.01,0,1]],d:[7,67,0]},
 QUICK:{h:['RC Rate','Max Rate','Expo'],f:[[.01,.01,2.55],[10,0,2000],[.01,0,1]],d:[100,67,0]},
 KISS:{h:['RC Rate','Rate','RC Curve'],f:[[.01,.01,2.55],[.01,0,.99],[.01,0,1]],d:[100,70,0]},
 RACEFLIGHT:{h:['Rate','Acro+','Expo'],f:[[10,10,2550],[1,0,255],[1,0,100]],d:[37,80,50]}};
export const defRates=(type='BETAFLIGHT')=>({type,ax:[0,1,2].map(()=>[...RTYPES[type].d]),thrMid:50,thrExpo:0,thrLimit:100});
// rate of profile R on one axis (0 roll, 1 pitch, 2 yaw) at stick x (-1..1), rad/s
export function rateR(R,axis,x){const[rc,sr,ex]=R.ax[axis],a=Math.abs(x);let r;
 switch(R.type){
  case'ACTUAL':{const e=ex/100,ef=a*(Math.pow(x,5)*e+x*(1-e)),cs=rc*10;r=x*cs+Math.max(0,sr*10-cs)*ef;break}
  case'QUICK':{const rr=rc*2,md=Math.max(sr*10,rr),e=ex/100,sf=(md/rr-1)/(md/rr),c=P3(a)*e+a*(1-e);r=x*rr/cl(1-c*sf,.01,1);break}
  case'KISS':{const c=ex/100;r=2000/cl(1-a*sr/100,.01,1)*(P3(x)*c+x*(1-c))*(rc/1000);break}
  case'RACEFLIGHT':{r=10*rc*(1+.01*ex*(x*x-1))*x*(1+a*sr*.01);break}
  default:{const e=ex/100,y=x*P3(a)*e+x*(1-e);let rr=rc/100;if(rr>2)rr+=14.54*(rr-2);r=200*rr*y/cl(1-a*sr/100,.01,1)}}
 return cl(r,-1998,1998)*Math.PI/180}
// throttle curve of profile R (thr_mid, thr_expo, throttle limit): stick 0..1 -> motor command 0..1
export function thrCurveR(R,t){const m=R.thrMid/100,e=R.thrExpo/100,d=t-m,y=d>0?1-m:m;return cl((m+d*(1-e+e*d*d/(y*y||1)))*R.thrLimit/100,0,1)}

// ---------- attitude controller (bots + Angle mode): body-rate command d.wt that turns d toward body up = up, heading fwd ----------
const _m=new THREE.Matrix4(),_qd=new QT(),_ax=new V3(),_az=new V3(),_aq=new QT();
export function attitude(d,up,fwd,k,maxR,yawW){const z=_az.copy(fwd).addScaledVector(up,-fwd.dot(up));if(z.lengthSq()<1e-4)z.set(0,0,-1).applyQuaternion(d.q).addScaledVector(up,-.99);
 z.normalize().negate();_ax.crossVectors(up,z);_m.makeBasis(_ax,up,z);_qd.setFromRotationMatrix(_m);const e=_aq.copy(d.q).invert().multiply(_qd);if(e.w<0){e.x=-e.x;e.y=-e.y;e.z=-e.z;e.w=-e.w}
 const s=Math.sqrt(Math.max(0,1-e.w*e.w));if(s<1e-5){d.wt.set(0,0,0);return}const a=2*Math.atan2(s,e.w);d.wt.set(e.x/s,e.y/s*yawW,e.z/s).multiplyScalar(Math.min(a*k,maxR))}

// ---------- flip-over (E / flip button): level the quad keeping its heading; k = slerp share this tick ----------
const _rf=new V3(),_qr=new QT();
export function rightUp(d,k){const f=_rf.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<.01){f.set(0,1,0).applyQuaternion(d.q);f.y=0}_qr.setFromAxisAngle(UP,f.lengthSq()>1e-4?Math.atan2(-f.x,-f.z):0);d.q.slerp(_qr,k)}

// ---------- the air model, block by block ----------
// F: an airframe's multipliers (Jared's parts, src/parts: computeLoadout().flight). ONE is the plain quad: every multiplier 1
// (x * 1 is exact, so it flies bit for bit like code without multipliers) and no rate or angular-acceleration cap.
const INF=[Infinity,Infinity,Infinity];
export const ONE=Object.freeze({thr:1,te:1,vp:1,spool:1,dl:1,dq:[1,1,1],maxv:1,boost:1,drain:1,rmax:INF,acc:INF,wheels:false});
const _q=new QT(),_v=new V3(),_u=new V3(),_x=new V3(),_z=new V3(),_gw=new V3();
// rate loop: body rates w chase the target wt with time constant tau (0.09 s on the ground), capped per axis at F.rmax, with the
// angular acceleration capped at F.acc (on the ground, sliding faster than 4 m/s, as hard as the motors' spin allows).
// With ONE's infinite caps this is exactly w.lerp(wt, 1 - exp(-dt/tau)). Wheels on the ground: a plain 0.09 s lerp.
export function rateLoop(d,wt,dt,tau,F,gd){if(gd&&F.wheels){d.w.lerp(wt,1-Math.exp(-dt/.09));return}
 const r=F.rmax,am=gd&&d.v.lengthSq()>16?Math.min(1,.02+d.ms*1.5):1,a0=F.acc[0]*am,a1=F.acc[1]*am,a2=F.acc[2]*am,k=1-Math.exp(-dt/(gd?.09:tau));
 d.w.x+=cl((cl(wt.x,-r[0],r[0])-d.w.x)*k,-a0*dt,a0*dt);d.w.y+=cl((cl(wt.y,-r[1],r[1])-d.w.y)*k,-a1*dt,a1*dt);d.w.z+=cl((cl(wt.z,-r[2],r[2])-d.w.z)*k,-a2*dt,a2*dt)}
// falling into your own prop wash (va: airspeed along body up): coloured random kicks on roll and pitch (uses Math.random)
export function propWash(d,va,dt,wash){if(wash>0&&va<-6&&d.ms>.15){const a=wash*cl((-va-6)/18,0,1)*d.ms*2.5,k=Math.min(1,dt*9);d.wn.x+=(Math.random()-.5-d.wn.x)*k;d.wn.z+=(Math.random()-.5-d.wn.z)*k;d.w.x+=d.wn.x*a;d.w.z+=d.wn.z*a}}
// turn attitude q by body rates w for dt (in place); false when w is too small to turn
export function turn(q,w,dt){const wl=w.length();if(wl>1e-6){_q.setFromAxisAngle(_v.copy(w).divideScalar(wl),wl*dt);q.multiply(_q).normalize();return true}return false}
// motor spool-up / spin-down toward d.thr; sp = spool time constant (s), spin-down 1.6x slower
export function spool(d,dt,sp){d.ms+=(d.thr-d.ms)*(1-Math.exp(-dt/Math.max(1e-3,d.thr>d.ms?sp:sp*1.6)))}
// thrust ~ rpm², shaped by the thrust curve exponent te; prop inflow: thrust falls off as the air through the disc (va) nears the pitch speed vp
export const thrust=(ms,thr,te)=>thr*ms**te,inflow=(va,vp)=>cl(1-va/vp,0,1.15);
// body-axis drag on v from the airspeed vr (vr = v in still air): linear dl plus quadratic dq * speed per body axis, with
// shape factors c and the airframe's multipliers m (the quad: c = .9, 1.8, .7, the disc face having ~2x the frontal area)
export function bodyDrag(v,vr,q,up,dl,dq,c0,c1,c2,m,dt){const s=vr.length();if(s>1e-4){const bx=_x.set(1,0,0).applyQuaternion(q),bz=_z.set(0,0,1).applyQuaternion(q),k=dq*s,vx=vr.dot(bx),vy=vr.dot(up),vz=vr.dot(bz);
  _gw.copy(bx).multiplyScalar(vx*(dl+k*c0*m[0])).addScaledVector(up,vy*(dl+k*c1*m[1])).addScaledVector(bz,vz*(dl+k*c2*m[2]));const dd=_gw.length()*dt;v.addScaledVector(_gw,-dt*(dd>s?s/dd:1))}}
// top speed vm: above it, bleed off quickly rather than clip
export function capSpeed(v,vm,dt){const s2=v.length();if(s2>vm)v.multiplyScalar(Math.max(vm/s2,1-dt*2))}

// ---------- the League quad in the air: one tick of rates, wash, spool, thrust, super boost, gravity, drag, top speed ----------
// d: {v, w, q, wn, ms, thr, boost, boosting, boostOn}, may define onBoost() (super boost just lit). K: the tune
// {G, THR, TE, VP, TAU, SPOOL, WASH, BOOST, BKICK, DRAIN, DL, DQ, MAXV}; F: multipliers (ONE for a plain quad); wt: target body
// rates; gd: touching the ground; lk: rates locked (a pop: the caller has set w, sticks and wash are ignored).
// Sets this tick's v and w. qn receives the attitude at the end of the tick (thrust and drag use it): pass d.q to turn the quad
// here (engine/ Quad), or a spare quaternion when something else integrates q (src/: Rapier turns d.q by w).
export function quadAir(d,dt,K,F,wt,gd,lk,qn){
 if(!lk)rateLoop(d,wt,dt,K.TAU,F,gd);const up=_u.set(0,1,0).applyQuaternion(d.q),va=d.v.dot(up);
 if(!lk)propWash(d,va,dt,K.WASH);
 qn.copy(d.q);if(turn(qn,d.w,dt))up.set(0,1,0).applyQuaternion(qn);
 spool(d,dt,K.SPOOL*F.spool);
 const was=d.boostOn;d.boostOn=d.boosting&&d.boost>0;let acc=thrust(d.ms,K.THR*F.thr,K.TE*F.te);
 acc*=inflow(va,K.VP*F.vp);
 if(d.boostOn){acc+=K.BOOST*F.boost;d.boost=Math.max(0,d.boost-K.DRAIN*F.drain*dt);if(!was){d.v.addScaledVector(up,K.BKICK);d.onBoost?.()}}  // super boost: instant (no spool, no inflow loss), with a kick the moment it lights
 d.v.addScaledVector(up,acc*dt);d.v.y-=K.G*dt;
 bodyDrag(d.v,d.v,qn,up,K.DL*F.dl,K.DQ,.9,1.8,.7,F.dq,dt);
 capSpeed(d.v,K.MAXV*F.maxv*(d.boostOn?1.5:1),dt)}
