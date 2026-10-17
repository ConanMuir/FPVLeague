// ---------- drones: the acro flight model ----------
import {noise,tone} from '../audio/audio.js';
import {HL,QT,UP,V3,cl} from '../config/constants.js';
import {BKICK,BOOST,DB,DI,DL,DQ,DRAIN,G,GF,HBP,HBR,HOV,MAXV,SPOOL,START,TAU,TE,THR,TURT,VP,WASH} from '../config/tune.js';
import {_an,sdN,sdf} from '../physics/sdf.js';
import {TN,buildDrone} from '../render/drone-mesh.js';
import {scene} from '../render/renderer.js';
import {_q,_qb,_u,_v,_x,_z} from '../scratch.js';
import {GS} from '../state.js';
import {DSLOTS} from '../world/highlands.js';
export const NAMES=[['Nova','Ace','Vortex'],['Blaze','Rotor','Kestrel']],SLOTS=[[0,4,HL*.72],[-34,4,HL*.82],[34,4,HL*.82]];
export class Drone{
 constructor(team,i,bot,key){Object.assign(this,{team,i,bot,key,remote:false,net:null,seen:0,name:NAMES[team][i],p:new V3(),v:new V3(),q:new QT(),w:new V3(),wt:new V3(),thr:HOV,ms:HOV,gt:0,wn:new V3(),boost:33,boostOn:false,boosting:false,dead:0,role:'attack',hp:100,life:0,fcd:0,firing:false,
  ai:{t:0,tg:new V3(),tv:new V3(),look:new V3(),nz:new V3()}});this.build();this.spawn()}
 build(){buildDrone(this)}  // mesh, FPV mark and trail: render/drone-mesh.js
 spawn(){const s=(GS.OBSON?DSLOTS:SLOTS)[this.i],k=this.team?-1:1;this.hd=null;this.flipT=0;this.p.set(s[0]*k,s[1],s[2]*k);this.v.set(0,0,0);this.w.set(0,0,0);this.wt.set(0,0,0);this.q.setFromAxisAngle(UP,this.team?Math.PI:0);
  this.boost=START;this.dead=0;this.hp=100;this.firing=false;this.thr=this.ms=HOV;this.gt=0;for(let j=0;j<TN;j++)this.p.toArray(this.tp,j*3);this.mesh.visible=true}
 dispose(){scene.remove(this.mesh,this.trail)}
 flipUp(){if(this.dead<=0&&this.v.lengthSq()<400)this.flipT=.35}
 step(dt){const gd=(this.gt-=dt)>0;let wt=this.wt;
  if(this.flipT>0){this.flipT=Math.max(0,this.flipT-dt);rightUp(this,this.flipT?1-Math.exp(-dt*16):1);this.v.multiplyScalar(Math.exp(-dt*6));this.v.y=Math.max(this.v.y,2.5);this.ms+=(this.thr-this.ms)*.1;this.p.addScaledVector(this.v,dt);this.ground();this.w.set(0,0,0);this.wt.set(0,0,0);if(!this.flipT)this.gt=0;return}
  if(gd){wt=_gw.copy(wt);wt.y*=.15;wt.clampLength(0,TURT)}
  // on the ground without enough lift to fly, sticks lever the frame over its lowest edge (turtle-style, no switch needed)
  if(gd&&this.v.lengthSq()<25&&wt.lengthSq()>.04&&THR*this.ms**TE*_u.set(0,1,0).applyQuaternion(this.q).y<G*.9&&this.pivot(wt,dt)){this.pw=0;return}
  // inverted pendulum: upside down or on its side on the ground, it leans further and further over its edge until it lands on its feet
  if(gd&&(THR*this.ms**TE<G||this.v.x**2+this.v.z**2<9)){const up=_u.set(0,1,0).applyQuaternion(this.q);if(up.y<.9&&(up.y<.2||this.v.lengthSq()<25)){const ax=_pa.crossVectors(up,UP);let sn=ax.length();if(sn<.05)ax.set(0,0,1).applyQuaternion(this.q);else ax.divideScalar(sn);
   this.pw=Math.min(9,(this.pw||1.2)+PEND*Math.max(sn,.25)*(this.thr>.3?1.6:1)*dt);if(this.pivot(_pw.copy(ax).applyQuaternion(_qb.copy(this.q).invert()).multiplyScalar(this.pw),dt,-1))return}else this.pw=0}
  this.w.lerp(wt,1-Math.exp(-dt/(gd?.09:TAU)));const up=_u.set(0,1,0).applyQuaternion(this.q),va=this.v.dot(up);
  if(WASH>0&&va<-6&&this.ms>.15){const a=WASH*cl((-va-6)/18,0,1)*this.ms*2.5,k=Math.min(1,dt*9);this.wn.x+=(Math.random()-.5-this.wn.x)*k;this.wn.z+=(Math.random()-.5-this.wn.z)*k;this.w.x+=this.wn.x*a;this.w.z+=this.wn.z*a}  // falling into your own prop wash
  const wl=this.w.length();if(wl>1e-6){_q.setFromAxisAngle(_v.copy(this.w).divideScalar(wl),wl*dt);this.q.multiply(_q).normalize();up.set(0,1,0).applyQuaternion(this.q)}
  this.ms+=(this.thr-this.ms)*(1-Math.exp(-dt/Math.max(1e-3,this.thr>this.ms?SPOOL:SPOOL*1.6)));  // motor spool-up / spin-down
  const was=this.boostOn;this.boostOn=this.boosting&&this.boost>0;let acc=THR*this.ms**TE;  // thrust ~ rpm², shaped by the thrust curve
  acc*=cl(1-va/VP,0,1.15);  // prop inflow: thrust falls off as the air through the disc nears the prop's pitch speed
  // super boost: instant (no spool, no inflow loss), with a kick the moment it lights
  if(this.boostOn){acc+=BOOST;this.boost=Math.max(0,this.boost-DRAIN*dt);if(!was){this.v.addScaledVector(up,BKICK);if(this===GS.player){GS.shake=Math.max(GS.shake,.25);noise(.35,140,.5);tone(110,320,.3,.12,'sawtooth')}}}
  this.v.addScaledVector(up,acc*dt);this.v.y-=G*dt;
  const s=this.v.length();if(s>1e-4){const bx=_x.set(1,0,0).applyQuaternion(this.q),bz=_z.set(0,0,1).applyQuaternion(this.q),k=DQ*s,vx=this.v.dot(bx),vy=this.v.dot(up),vz=this.v.dot(bz);
   _gw.copy(bx).multiplyScalar(vx*(DL+k*.9)).addScaledVector(up,vy*(DL+k*1.8)).addScaledVector(bz,vz*(DL+k*.7));const dl=_gw.length()*dt;this.v.addScaledVector(_gw,-dt*(dl>s?s/dl:1))}  // body-axis drag: the disc face has ~2x the frontal area
  const vm=MAXV*(this.boostOn?1.5:1),s2=this.v.length();if(s2>vm)this.v.multiplyScalar(Math.max(vm/s2,1-dt*2));
  this.p.addScaledVector(this.v,dt);const hit=this.ground();if(this===GS.player&&hit>10)noise(.16,280,cl(hit/90,0,.25),.7)}
 pivot(wt,dt,deep=-.15){const ww=_ww.copy(wt).applyQuaternion(this.q);let bv=-.05,ok=false;
  for(const C of HBP){const r=_br.copy(C).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r);if(sdf(P.x,P.y,P.z)+HBR<deep)continue;
   const n=sdN(P,_an);r.addScaledVector(n,HBR);const s=_vp.crossVectors(ww,r).dot(n);if(-s<bv){bv=-s;_pv.copy(r);ok=true}}  // corner the rotation would push hardest into the ground = pivot
  if(!ok)return false;this.w.copy(wt);this.v.crossVectors(ww,_pv).negate();this.boostOn=false;this.ms+=(this.thr-this.ms)*.1;
  const wl=wt.length();_q.setFromAxisAngle(_v.copy(wt).divideScalar(wl),wl*dt);this.q.multiply(_q).normalize();this.p.addScaledVector(this.v,dt);this.ground();this.gt=.12;return true}
 // rounded rectangular frame vs arena: spheres along a rounded-rectangle outline (no sharp corners to catch), impulses shared between touching points, with lever arms so the quad tips and slides instead of spinning in place
 ground(){let m=0,c=0,dm=0;const ww=_ww.copy(this.w).applyQuaternion(this.q),na=_gw.set(0,0,0);
  for(const C of HBP){const r=_br.copy(C).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r),d=sdf(P.x,P.y,P.z)+HBR;if(d<=0)continue;
   const h=_H[c++];sdN(P,h[1]).negate();h[0].copy(r).addScaledVector(h[1],-HBR);na.add(h[1]);dm=Math.max(dm,d)}
  if(!c)return 0;this.p.addScaledVector(na.normalize(),dm);
  for(let i=0;i<c;i++){const[r,n]=_H[i],vp=_vp.crossVectors(ww,r).add(this.v),vn=vp.dot(n);if(vn>=0)continue;
   const rn=_rn.crossVectors(r,n),den=1+rn.lengthSq()/DI,j=-(1+(-vn>3?DB:0))*vn/den/c*1.15;this.v.addScaledVector(n,j);ww.addScaledVector(rn,j*.45/DI);  // softened: less overshoot, less tumble off a bump
   vp.addScaledVector(n,-vn);const tl=vp.length();if(tl>1e-4){vp.divideScalar(tl);const rt=_rn.crossVectors(r,vp),jt=Math.min(GF*Math.min(j,G*.05/c),tl/(1+rt.lengthSq()/DI)/c);this.v.addScaledVector(vp,-jt);ww.addScaledVector(rt,-jt*.2/DI)}
   m=Math.max(m,-vn)}
  this.w.copy(ww).applyQuaternion(_qb.copy(this.q).invert());this.gt=.12;return m}}
const _H=Array.from({length:16},()=>[new V3(),new V3()]),_pv=new V3(),_pa=new V3(),_pw=new V3(),PEND=14;
export const _rf=new V3(),_qr=new QT(),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
function rightUp(d,k){const f=_rf.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<.01){f.set(0,1,0).applyQuaternion(d.q);f.y=0}_qr.setFromAxisAngle(UP,f.lengthSq()>1e-4?Math.atan2(-f.x,-f.z):0);d.q.slerp(_qr,k)}  // level, keeping the heading
const _gw=new V3(),_ww=new V3(),_br=new V3(),_bp2=new V3(),_vp=new V3(),_rn=new V3();
