// Flight model: LiftOff-style acro quad (rates, spool, thrust curve, prop inflow, body-axis drag, prop wash, super boost),
// rounded-box ground contact with turtle-style pivots (thrust shoving into the ground slides rather than grips), the attitude controller (bots + Angle mode) and stick input.
// A game hands it the world's collision shape with setWorld(sdf) and its physics sliders with tuneFlight(T).
// The air model, rates maths, attitude controller and flip-over levelling are the shared flight core, src/flight/core.js (one copy
// for every game: Jared's League flies the same code); this file keeps the Quad's own ground contact, turtle and self-righting.
import {attitude,quadAir,rightUp,wrapA,ONE} from '../src/flight/core.js';
import {V3,QT,cl,UP,sm} from './util.js';
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

const _q=new QT(),_v=new V3(),_u=new V3(),_an=new V3();
const _H=Array.from({length:16},()=>[new V3(),new V3()]),_pv=new V3();
const _gw=new V3(),_ww=new V3(),_br=new V3(),_bp2=new V3(),_vp=new V3(),_rn=new V3(),_qb=new QT();
// a game's drone extends Quad: it builds its own mesh and spawn, and may define onBoost() (super boost just lit)
// flip-over (E / flip button): rightUp (src/flight/core.js) levels the quad keeping its heading
const _pa=new V3(),_pw=new V3(),PEND=3.6;
// the tune for quadAir, read live from the lets above (tuneFlight sets them)
const K={get G(){return G},get THR(){return THR},get TE(){return TE},get VP(){return VP},get TAU(){return TAU},get SPOOL(){return SPOOL},get WASH(){return WASH},
 get BOOST(){return BOOST},get BKICK(){return BKICK},get DRAIN(){return DRAIN},get DL(){return DL},get DQ(){return DQ},get MAXV(){return MAXV}};
export class Quad{
 constructor(){Object.assign(this,{p:new V3(),v:new V3(),q:new QT(),w:new V3(),wt:new V3(),thr:0,ms:0,gt:0,wn:new V3(),boost:0,boostOn:false,boosting:false,dead:0})}
 flipUp(){if(this.dead<=0&&this.v.lengthSq()<400)this.flipT=.35}
 // one physics step; returns the ground impact speed
 step(dt){const gd=(this.gt-=dt)>0;let wt=this.wt;
  if(this.flipT>0){this.flipT=Math.max(0,this.flipT-dt);rightUp(this,this.flipT?1-Math.exp(-dt*16):1);this.v.multiplyScalar(Math.exp(-dt*6));this.v.y=Math.max(this.v.y,2.5);this.ms+=(this.thr-this.ms)*.1;this.p.addScaledVector(this.v,dt);this.ground();this.w.set(0,0,0);this.wt.set(0,0,0);if(!this.flipT)this.gt=0;return 0}
  if(gd){wt=_gw.copy(wt);wt.y*=.15;wt.clampLength(0,TURT)}
  // on the ground without enough lift to fly, sticks lever the frame over its lowest edge (turtle-style, no switch needed)
  if(gd&&this.v.lengthSq()<25&&wt.lengthSq()>.04&&THR*this.ms**TE*_u.set(0,1,0).applyQuaternion(this.q).y<G*.9&&this.pivot(wt,dt)){this.pw=0;return 0}
  // inverted pendulum: resting fully upside down on the floor, it eases itself over onto its feet. The roll rate glides up from zero,
  // peaks while it is on its back and eases off as it comes upright. Once started it carries through; walls, ceiling, sides and sliding never trigger it.
  const cn=this.cn||(this.cn=new V3(0,1,0)),vt=this.v.lengthSq()-this.v.dot(cn)**2,uy=_u.set(0,1,0).applyQuaternion(this.q).y;
  if(gd&&uy<.93&&(this.pr?vt<9+(this.pw*DRAD*1.6)**2:cn.y>.6&&uy<-.6&&vt<9)){const up=_u;this.pr=1;const ax=_pa.crossVectors(up,UP);let sn=ax.length();if(sn<.05)ax.set(0,0,1).applyQuaternion(this.q);else ax.divideScalar(sn);
   const tg=PEND*(.5+.5*sm((1-up.y)/2))*(this.thr>.3?1.3:1);this.pw=(this.pw||0)+(tg-(this.pw||0))*(1-Math.exp(-dt/.35));
   if(this.pw>.15&&this.pivot(_pw.copy(ax).applyQuaternion(_qb.copy(this.q).invert()).multiplyScalar(this.pw),dt,-1))return 0}else this.pw=this.pr=0
  // in the air: the shared League quad (src/flight/core.js quadAir, the same code Jared's League flies): rates (w eases toward wt,
  // tau TAU, 0.09 s on the ground), prop wash, q turned by w*dt, motor spool, thrust curve and prop inflow, super boost (kick, onBoost),
  // gravity, body-axis drag (the disc face has ~2x the frontal area), top speed. ONE: no parts multipliers, no rate caps
  quadAir(this,dt,K,ONE,wt,gd,false,this.q);
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
  if(!c)return 0;this.p.addScaledVector(na.normalize(),dm);(this.cn||(this.cn=new V3())).copy(na);  // contact normal: floor up, wall sideways, ceiling down
  for(let i=0;i<c;i++){const[r,n]=_H[i],vp=_vp.crossVectors(ww,r).add(this.v),vn=vp.dot(n);if(vn>=0)continue;
   const rn=_rn.crossVectors(r,n),den=1+rn.lengthSq()/DI,j=-(1+(-vn>3?DB:0))*vn/den/c*GK;this.v.addScaledVector(n,j);ww.addScaledVector(rn,j*GS/DI);
   vp.addScaledVector(n,-vn);const tl=vp.length();if(tl>1e-4){vp.divideScalar(tl);const rt=_rn.crossVectors(r,vp),jt=Math.min(GF*Math.min(j,G*.05/c),tl/(1+rt.lengthSq()/DI)/c);this.v.addScaledVector(vp,-jt);ww.addScaledVector(rt,-jt*GT/DI)}
   m=Math.max(m,-vn)}
  this.w.copy(ww).applyQuaternion(_qb.copy(this.q).invert());this.gt=.12;return m}}

// ---------- attitude controller (shared by bots + Angle mode): src/flight/core.js, re-exported for the games ----------
export {attitude};

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
