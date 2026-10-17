// Flight model: LiftOff-style acro quad (rates, spool, thrust curve, prop inflow, body-axis drag, prop wash, super boost),
// rounded-box ground contact with turtle-style pivots (thrust shoving into the ground slides rather than grips), the attitude controller (bots + Angle mode) and stick input.
// A game hands it the world's collision shape with setWorld(sdf) and its physics sliders with tuneFlight(T).
import * as THREE from 'three';
import {V3,QT,cl,UP} from './util.js';
import {S} from './settings.js';
import {pad,axv,keys,thrFull,calib,flipIn} from './input.js';
import {rate,thrCurve,stk} from './rates.js';
export let G=15,DRAD=.8,THR=58,BZ=.05,BOOST=140,BKICK=8,GF=.1,SPOOL=.03,TURT=4.5,WASH=1,HBP=[],HBR=.13,DI=.22,MAXV=78,TE=1.6,VP=240,DL=.1,DQ=.006,HOV=(G/THR)**(1/TE),TAU=.012,DRAIN=33,START=33,DB=.35;
// ground impulse feel: [impulse factor, impact spin, friction torque] (Drone League v12 softened bumps; Interceptor keeps the older, livelier bumps)
let GK=1.15,GS=.45,GT=.2;
export function setGroundFeel(k,spin,fric){GK=k;GS=spin;GT=fric}
// T = physics sliders (grav, thr, te, vp, maxv, tau, dl, dq, size, spool, gfric, turtle, wash, dbounce; bzone, boost, bkick, drain, start when the game has super boost)
export function tuneFlight(T){G=T.grav;THR=T.thr;TE=T.te;VP=T.vp;MAXV=T.maxv;TAU=T.tau/1000;DL=T.dl;DQ=T.dq;DRAD=.8*T.size;{const k=T.size/.75,r=HBR=.13*k,ax=.55*k-r,az=.6*k-r,cr=.34*k-r;DI=.22*k*k;HBP=[];  // ground hull: 0.55 x 0.6 m half-size, 0.34 m corner radius, 0.13 m edge radius
  for(const[sx,sz]of[[1,1],[-1,1],[-1,-1],[1,-1]])for(let i=0;i<4;i++){const a=i/3*Math.PI/2;HBP.push(new V3(sx*(ax-cr+cr*Math.cos(a)),0,sz*(az-cr+cr*Math.sin(a))))}}SPOOL=T.spool/1000;GF=T.gfric;TURT=T.turtle*Math.PI/180;WASH=T.wash;DB=T.dbounce;
 if('bzone' in T){BZ=T.bzone/100;BOOST=T.boost;BKICK=T.bkick;DRAIN=T.drain;START=T.start}HOV=(G/THR)**(1/TE)}
// world collision shape: signed distance, positive = inside solid
let world=()=>1;
export const setWorld=f=>{world=f},sdf=(x,y,z)=>world(x,y,z);
export function sdN(p,out){const h=.02,x=p.x,y=p.y,z=p.z;out.set(sdf(x+h,y,z)-sdf(x-h,y,z),sdf(x,y+h,z)-sdf(x,y-h,z),sdf(x,y,z+h)-sdf(x,y,z-h));const l=out.length();return l>1e-9?out.divideScalar(l):out.set(0,1,0)}

const _q=new QT(),_v=new V3(),_u=new V3(),_x=new V3(),_z=new V3(),_an=new V3();
const _H=Array.from({length:16},()=>[new V3(),new V3()]),_pv=new V3();
const _gw=new V3(),_ww=new V3(),_br=new V3(),_bp2=new V3(),_vp=new V3(),_rn=new V3(),_qb=new QT();
// a game's drone extends Quad: it builds its own mesh and spawn, and may define onBoost() (super boost just lit)
// flip-over (E / flip button): level the quad keeping its heading
const _pa=new V3(),_pw=new V3(),PEND=14,_rf=new V3(),_qr=new QT(),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
function rightUp(d,k){const f=_rf.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<.01){f.set(0,1,0).applyQuaternion(d.q);f.y=0}_qr.setFromAxisAngle(UP,f.lengthSq()>1e-4?Math.atan2(-f.x,-f.z):0);d.q.slerp(_qr,k)}  // level, keeping the heading
export class Quad{
 constructor(){Object.assign(this,{p:new V3(),v:new V3(),q:new QT(),w:new V3(),wt:new V3(),thr:0,ms:0,gt:0,wn:new V3(),boost:0,boostOn:false,boosting:false,dead:0})}
 flipUp(){if(this.dead<=0&&this.v.lengthSq()<400)this.flipT=.35}
 // one physics step; returns the ground impact speed
 step(dt){const gd=(this.gt-=dt)>0;let wt=this.wt;
  if(this.flipT>0){this.flipT=Math.max(0,this.flipT-dt);rightUp(this,this.flipT?1-Math.exp(-dt*16):1);this.v.multiplyScalar(Math.exp(-dt*6));this.v.y=Math.max(this.v.y,2.5);this.ms+=(this.thr-this.ms)*.1;this.p.addScaledVector(this.v,dt);this.ground();this.w.set(0,0,0);this.wt.set(0,0,0);if(!this.flipT)this.gt=0;return 0}
  if(gd){wt=_gw.copy(wt);wt.y*=.15;wt.clampLength(0,TURT)}
  // on the ground without enough lift to fly, sticks lever the frame over its lowest edge (turtle-style, no switch needed)
  if(gd&&this.v.lengthSq()<25&&wt.lengthSq()>.04&&THR*this.ms**TE*_u.set(0,1,0).applyQuaternion(this.q).y<G*.9&&this.pivot(wt,dt)){this.pw=0;return 0}
  // inverted pendulum: upside down or on its side on the ground, it leans further and further over its edge until it lands on its feet
  if(gd&&(THR*this.ms**TE<G||this.v.x**2+this.v.z**2<9)){const up=_u.set(0,1,0).applyQuaternion(this.q);if(up.y<.9&&(up.y<.2||this.v.lengthSq()<25)){const ax=_pa.crossVectors(up,UP);let sn=ax.length();if(sn<.05)ax.set(0,0,1).applyQuaternion(this.q);else ax.divideScalar(sn);
   this.pw=Math.min(9,(this.pw||1.2)+PEND*Math.max(sn,.25)*(this.thr>.3?1.6:1)*dt);if(this.pivot(_pw.copy(ax).applyQuaternion(_qb.copy(this.q).invert()).multiplyScalar(this.pw),dt,-1))return 0}else this.pw=0}
  this.w.lerp(wt,1-Math.exp(-dt/(gd?.09:TAU)));const up=_u.set(0,1,0).applyQuaternion(this.q),va=this.v.dot(up);
  if(WASH>0&&va<-6&&this.ms>.15){const a=WASH*cl((-va-6)/18,0,1)*this.ms*2.5,k=Math.min(1,dt*9);this.wn.x+=(Math.random()-.5-this.wn.x)*k;this.wn.z+=(Math.random()-.5-this.wn.z)*k;this.w.x+=this.wn.x*a;this.w.z+=this.wn.z*a}  // falling into your own prop wash
  const wl=this.w.length();if(wl>1e-6){_q.setFromAxisAngle(_v.copy(this.w).divideScalar(wl),wl*dt);this.q.multiply(_q).normalize();up.set(0,1,0).applyQuaternion(this.q)}
  this.ms+=(this.thr-this.ms)*(1-Math.exp(-dt/Math.max(1e-3,this.thr>this.ms?SPOOL:SPOOL*1.6)));  // motor spool-up / spin-down
  const was=this.boostOn;this.boostOn=this.boosting&&this.boost>0;let acc=THR*this.ms**TE;  // thrust ~ rpm², shaped by the thrust curve
  acc*=cl(1-va/VP,0,1.15);  // prop inflow: thrust falls off as the air through the disc nears the prop's pitch speed
  // super boost: instant (no spool, no inflow loss), with a kick the moment it lights
  if(this.boostOn){acc+=BOOST;this.boost=Math.max(0,this.boost-DRAIN*dt);if(!was){this.v.addScaledVector(up,BKICK);this.onBoost?.()}}
  this.v.addScaledVector(up,acc*dt);this.v.y-=G*dt;
  const s=this.v.length();if(s>1e-4){const bx=_x.set(1,0,0).applyQuaternion(this.q),bz=_z.set(0,0,1).applyQuaternion(this.q),k=DQ*s,vx=this.v.dot(bx),vy=this.v.dot(up),vz=this.v.dot(bz);
   _gw.copy(bx).multiplyScalar(vx*(DL+k*.9)).addScaledVector(up,vy*(DL+k*1.8)).addScaledVector(bz,vz*(DL+k*.7));const dl=_gw.length()*dt;this.v.addScaledVector(_gw,-dt*(dl>s?s/dl:1))}  // body-axis drag: the disc face has ~2x the frontal area
  const vm=MAXV*(this.boostOn?1.5:1),s2=this.v.length();if(s2>vm)this.v.multiplyScalar(Math.max(vm/s2,1-dt*2));
  this.p.addScaledVector(this.v,dt);return this.ground()}
 pivot(wt,dt,deep=-.15){const ww=_ww.copy(wt).applyQuaternion(this.q);let bv=-.05,ok=false;
  for(const C of HBP){const r=_br.copy(C).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r);if(sdf(P.x,P.y,P.z)+HBR<deep)continue;
   const n=sdN(P,_an);r.addScaledVector(n,HBR);const s=_vp.crossVectors(ww,r).dot(n);if(-s<bv){bv=-s;_pv.copy(r);ok=true}}  // corner the rotation would push hardest into the ground = pivot
  if(!ok)return false;this.w.copy(wt);this.v.crossVectors(ww,_pv).negate();this.boostOn=false;this.ms+=(this.thr-this.ms)*.1;
  const wl=wt.length();_q.setFromAxisAngle(_v.copy(wt).divideScalar(wl),wl*dt);this.q.multiply(_q).normalize();this.p.addScaledVector(this.v,dt);this.ground();this.gt=.12;return true}
 // rounded rectangular frame vs the world: spheres along a rounded-rectangle outline (no sharp corners to catch), impulses shared between touching points, with lever arms so the quad tips and slides instead of spinning in place
 ground(){let m=0,c=0,dm=0;const ww=_ww.copy(this.w).applyQuaternion(this.q),na=_gw.set(0,0,0);
  for(const C of HBP){const r=_br.copy(C).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r),d=sdf(P.x,P.y,P.z)+HBR;if(d<=0)continue;
   const h=_H[c++];sdN(P,h[1]).negate();h[0].copy(r).addScaledVector(h[1],-HBR);na.add(h[1]);dm=Math.max(dm,d)}
  if(!c)return 0;this.p.addScaledVector(na.normalize(),dm);
  for(let i=0;i<c;i++){const[r,n]=_H[i],vp=_vp.crossVectors(ww,r).add(this.v),vn=vp.dot(n);if(vn>=0)continue;
   const rn=_rn.crossVectors(r,n),den=1+rn.lengthSq()/DI,j=-(1+(-vn>3?DB:0))*vn/den/c*GK;this.v.addScaledVector(n,j);ww.addScaledVector(rn,j*GS/DI);
   vp.addScaledVector(n,-vn);const tl=vp.length();if(tl>1e-4){vp.divideScalar(tl);const rt=_rn.crossVectors(r,vp),jt=Math.min(GF*Math.min(j,G*.05/c),tl/(1+rt.lengthSq()/DI)/c);this.v.addScaledVector(vp,-jt);ww.addScaledVector(rt,-jt*GT/DI)}
   m=Math.max(m,-vn)}
  this.w.copy(ww).applyQuaternion(_qb.copy(this.q).invert());this.gt=.12;return m}}

// ---------- attitude controller (shared by bots + Angle mode) ----------
const _m=new THREE.Matrix4(),_qd=new QT(),_ax=new V3(),_az=new V3(),_aq=new QT();
export function attitude(d,up,fwd,k,maxR,yawW){const z=_az.copy(fwd).addScaledVector(up,-fwd.dot(up));if(z.lengthSq()<1e-4)z.set(0,0,-1).applyQuaternion(d.q).addScaledVector(up,-.99);
 z.normalize().negate();_ax.crossVectors(up,z);_m.makeBasis(_ax,up,z);_qd.setFromRotationMatrix(_m);const e=_aq.copy(d.q).invert().multiply(_qd);if(e.w<0){e.x=-e.x;e.y=-e.y;e.z=-e.z;e.w=-e.w}
 const s=Math.sqrt(Math.max(0,1-e.w*e.w));if(s<1e-5){d.wt.set(0,0,0);return}const a=2*Math.atan2(s,e.w);d.wt.set(e.x/s,e.y/s*yawW,e.z/s).multiplyScalar(Math.min(a*k,maxR))}

// ---------- human input: sticks (or keyboard) to target body rates, Betaflight rates; Angle mode self-levels ----------
// o.sb: super boost on (top BZ of the stick is boost); o.menu: menu open (sticks are ignored while calibrating)
const ks={y:0,p:0,r:0},_f=new V3(),_r=new V3(),_hv=new V3();let kbThr=HOV,flipPrev=false;
export function humanControl(d,dt,{sb=false,menu=false}={}){const g=pad(),bz=sb?BZ:0;let thr=null,yaw=0,pit=0,rol=0;
 if(g&&!(menu&&calib)){const t=axv(g,0);
  const hv=HOV*(1-bz);thr=thrFull()?(t+1)/2:(t>=0?hv+t*(1-hv):hv*(1+t));yaw=axv(g,1);pit=axv(g,2);rol=axv(g,3)}
 const k=c=>keys[c]?1:0,sm=(c,t)=>c+(t-c)*Math.min(1,dt*(t?14:22));
 ks.y=sm(ks.y,k('KeyD')-k('KeyA'));ks.p=sm(ks.p,k('ArrowUp')-k('ArrowDown'));ks.r=sm(ks.r,k('ArrowRight')-k('ArrowLeft'));
 const kt=k('KeyW')-k('KeyS');kbThr+=((kt>0?(bz?.95:1):kt<0?0:HOV*(1-bz))-kbThr)*Math.min(1,dt*10);if(thr===null||kt)thr=kbThr;
 const pick=(a,b)=>Math.abs(b)>Math.abs(a)?b:a;yaw=pick(yaw,ks.y);pit=pick(pit,ks.p);rol=pick(rol,ks.r);
 stk[3]=cl(thr,0,1);d.thr=thrCurve(Math.min(1,stk[3]/(1-bz||1)));d.boosting=bz>0&&stk[3]>1-bz+1e-4||sb&&!!(keys.ShiftLeft||keys.ShiftRight||keys.Space);
 stk[0]=rol;stk[1]=pit;stk[2]=yaw;if(S.mode==='acro')d.wt.set(-rate(1,pit),-rate(2,yaw),-rate(0,rol));
 else{const f=_f.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<.01){f.set(0,-1,0).applyQuaternion(d.q);f.y=0}if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();
  const ch=Math.atan2(-f.x,-f.z);if(d.hd==null||Math.abs(wrapA(d.hd-ch))>1.2)d.hd=ch;d.hd=wrapA(d.hd-rate(2,yaw)*.7*dt);f.set(-Math.sin(d.hd),0,-Math.cos(d.hd));  // heading follows the yaw stick only
  const r=_r.crossVectors(f,UP),T=1.5;const u=_hv.copy(UP).addScaledVector(f,pit*T).addScaledVector(r,rol*T).normalize();attitude(d,u,f,16,18,1);d.wt.y-=rate(2,yaw)*.7}
 const fl=flipIn();if(fl&&!flipPrev)d.flipUp();flipPrev=fl}

// ---------- rough air, for airframes that model it (the Interceptor dart; the League quad doesn't use these) ----------
export const gn=()=>(Math.random()+Math.random()+Math.random()+Math.random()-2)*1.73;  // ≈ unit normal
// Ornstein-Uhlenbeck step: coloured noise in v with standard deviation sd and correlation time tau (y scaled by ys)
export function ou(v,dt,tau,sd,ys=1){const k=Math.min(1,dt/tau),a=sd*Math.sqrt(2*k);return v.set(v.x*(1-k)+gn()*a,v.y*(1-k)+gn()*a*ys,v.z*(1-k)+gn()*a)}
// weathervane: fins swing the thrust axis (body up) toward the relative wind vr (airspeed s, s > 0) and damp pitch / yaw rate
const _wv=new V3(),_wu=new V3(),_wq=new QT();
export function weathervane(d,vr,s,dt,kw,kd){const up=_wu.set(0,1,0).applyQuaternion(d.q),c=_wv.crossVectors(up,vr.divideScalar(s));
 c.applyQuaternion(_wq.copy(d.q).invert()).multiplyScalar(kw*s*s*dt);d.w.add(c);const dmp=Math.min(1,kd*s*dt);d.w.x-=d.w.x*dmp;d.w.z-=d.w.z*dmp}
