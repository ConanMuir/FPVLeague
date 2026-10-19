// ---------- drones: the acro flight model ----------
// step() is the flight model: it sets this tick's velocity v and body rates w; q stays where the tick starts (thrust and drag use
// the attitude at its end, as v15). physics/world.js then integrates p, q from v, w on the drone's Rapier body (built from its parts
// loadout, buildDroneBody) and resolves ground/wall contact; pivot() is the turtle / self-righting lever over the lowest touching point.
import {noise,tone} from '../audio/audio.js';
import {popWhoosh} from '../audio/sfx.js';
import {HL,QT,UP,V3,cl} from '../config/constants.js';
import {BKICK,BOOST,DB,DL,DQ,DRAD,DRAIN,G,GF,HOV,MAXV,SPOOL,START,TAU,TE,THR,TURT,VP,WASH,onTune} from '../config/tune.js';
import {STOCK,computeLoadout,seededLoadout} from '../parts/index.js';
import {_an,sdN,sdf} from '../physics/sdf.js';
import {buildDroneBody,freeDroneBody} from '../physics/world.js';
import {TN,buildDrone,rebuildDrone} from '../render/drone-mesh.js';
import {scene} from '../render/renderer.js';
import {_q,_qb,_u,_v,_x,_z} from '../scratch.js';
import {GS,isBot} from '../state.js';
import {DSLOTS,dfSpawnPoint} from '../world/highlands.js';
import {sm} from '../world/noise.js';
export const NAMES=[['Nova','Ace','Vortex'],['Blaze','Rotor','Kestrel']],SLOTS=[[0,4,HL*.72],[-34,4,HL*.82],[34,4,HL*.82]];
export class Drone{
 constructor(team,i,bot,key){Object.assign(this,{team,i,bot,key,remote:false,net:null,seen:0,name:NAMES[team][i],p:new V3(),v:new V3(),q:new QT(),w:new V3(),wt:new V3(),thr:HOV,ms:HOV,gt:0,wn:new V3(),boost:33,boostOn:false,boosting:false,dead:0,role:'attack',hp:100,life:0,fcd:0,firing:false,
  ai:{t:0,tg:new V3(),tv:new V3(),look:new V3(),nz:new V3()},ph:0,hit:0});this.setLoadout(isBot(key)?seededLoadout(key,GS.lseed):STOCK);this.build();this.spawn();buildDroneBody(this)}
 build(){buildDrone(this)}  // mesh, FPV mark and trail: render/drone-mesh.js
 // ---- parts (src/parts): the loadout sets this drone's flight multipliers (this.fl), ground hull, ball box, inertia and hit radius ----
 setLoadout(ids){const lo=computeLoadout(ids,DRAD/.6),re=this.lo&&this.lo.ids.join()!==lo.ids.join();this.lo=lo;this.fl=lo.flight;
  this.hbp=lo.hbp.map(a=>new V3(...a));this.hbr=lo.hbr;this.bbx=lo.bbx;this.di=lo.di;this.hitR=lo.hitR;this.popM=lo.colliders.filter(c=>c.tag==='prop').map(c=>c.pos).sort((a,b)=>Math.atan2(a[0],a[2])-Math.atan2(b[0],b[2]));this.rad=DRAD*lo.size;if(re)rebuildDrone(this);if(this.rb)buildDroneBody(this)}  // Rapier body from the loadout's colliders
 spawn(spread){const s=(GS.OBSON?DSLOTS:SLOTS)[this.i],k=this.team?-1:1;this.hd=null;this.flipT=0;this.p.set(s[0]*k,s[1],s[2]*k);this.v.set(0,0,0);this.w.set(0,0,0);this.wt.set(0,0,0);this.q.setFromAxisAngle(UP,this.team?Math.PI:0);
  if(spread&&GS.OBSON){const r=dfSpawnPoint(GS.drones.filter(o=>o!==this&&o.dead<=0));this.p.set(r[0],r[1],r[2]);this.q.setFromAxisAngle(UP,r[3])}  // Dogfight respawn: far from everyone alive
  this.boost=START;this.dead=0;this.hp=100;this.firing=false;this.thr=this.ms=HOV;this.gt=0;for(let j=0;j<TN;j++)this.p.toArray(this.tp,j*3);this.mesh.visible=true}
 dispose(){scene.remove(this.mesh,this.trail);freeDroneBody(this)}
 flipUp(){if(this.dead<=0&&(this.ct||0)>=.2)this.flipT=.35}  // flip over: always, once it has touched the ground or a wall for 0.2 s (any speed)
 // ---- pop: earned by touching the ball with the top of the quad inside its four motors (modes/step.js), held POP_T s.
 // A direction (dominant stick past half) plus the flip button spends it: a locked full turn about that body axis in POP_D s, throttle held,
 // a shove that way (pitch: forward/back, roll: sideways, yaw: spin in place), then back to the exact attitude it started from.
 tryPop(st){if(!(this.popC>0)||this.popT>0||this.dead>0)return false;const v=[st[1],st[2],st[0]],a=v.map(Math.abs),i=a.indexOf(Math.max(...a));if(a[i]<.5)return false;
  const s=-Math.sign(v[i]);this.popC=0;this.popT=POP_D;this.popAx=i;this.popS=s;this.popQ=(this.popQ||new QT()).copy(this.q);this.popThr=this.thr;
  if(i!==1)this.v.addScaledVector(_pz.set(i===2?-s:0,0,i===0?s:0).applyQuaternion(this.q),POP_V);if(this===GS.player)popWhoosh(POP_D);return true}
 // is world point P on top of the quad and inside the square of its four motors (inset 10%)?
 popZone(P){const c=_pz.copy(P).sub(this.p).applyQuaternion(_qb.copy(this.q).invert()),M=this.popM;if(c.y<-.05||!M||M.length<3)return false;let sg=0;
  for(let i=0;i<M.length;i++){const A=M[i],B=M[(i+1)%M.length],cr=(B[0]-A[0])*.9*(c.z-A[2]*.9)-(B[2]-A[2])*.9*(c.x-A[0]*.9);if(Math.abs(cr)<1e-9)continue;const s=cr>0?1:-1;if(sg&&s!==sg)return false;sg=s}return true}
 step(dt){const gd=(this.gt-=dt)>0;let wt=this.wt;this.piv=0;this.at=gd?0:(this.at||0)+dt;this.ct=gd?(this.ct||0)+dt:this.at>.3?0:(this.ct||0);  // ct: time in contact with the ground or a wall (short hops while sliding don't reset it)
  if(this.flipT>0){this.flipT=Math.max(0,this.flipT-dt);rightUp(this,this.flipT?1-Math.exp(-dt*16):1);this.v.multiplyScalar(Math.exp(-dt*6));this.v.y=Math.max(this.v.y,2.5);this.ms+=(this.thr-this.ms)*.1;this.w.set(0,0,0);this.wt.set(0,0,0);this.ph=1;if(!this.flipT)this.gt=0;return}
  const lk=this.popT>0;if(lk){this.popT=Math.max(0,this.popT-dt);this.thr=this.popThr;if(this.popT>0)this.w.set(0,0,0).setComponent(this.popAx,this.popS*POP_W);else{this.q.copy(this.popQ);this.w.set(0,0,0)}}  // pop: locked turn, sticks ignored, throttle held
  if(this.popC>0)this.popC=Math.max(0,this.popC-dt);
  if(gd){wt=_gw.copy(wt);wt.y*=.15;wt.clampLength(0,TURT)}
  // on the ground without enough lift to fly, sticks lever the frame over its lowest edge (turtle-style, no switch needed)
  const F=this.fl;  // parts: this drone's multipliers (src/parts)
  if(!lk&&gd&&this.v.lengthSq()<25&&wt.lengthSq()>.04&&THR*F.thr*this.ms**(TE*F.te)*_u.set(0,1,0).applyQuaternion(this.q).y<G*.9&&this.pivot(wt,dt)){this.pw=0;return}
  // inverted pendulum: resting fully upside down on the floor, it eases itself over onto its feet. The roll rate glides up from zero,
  // peaks while it is on its back and eases off as it comes upright. Once started it carries through; walls, ceiling, sides and sliding never trigger it.
  const cn=this.cn||(this.cn=new V3(0,1,0)),vt=this.v.lengthSq()-this.v.dot(cn)**2,uy=_u.set(0,1,0).applyQuaternion(this.q).y;
  if(!lk&&gd&&uy<.93&&(this.pr?vt<9+(this.pw*DRAD*1.6)**2:cn.y>.6&&uy<-.6&&vt<9)){const up=_u;this.pr=1;const ax=_pa.crossVectors(up,UP);let sn=ax.length();if(sn<.05)ax.set(0,0,1).applyQuaternion(this.q);else ax.divideScalar(sn);
   const tg=PEND*(.5+.5*sm((1-up.y)/2))*(this.thr>.3?1.3:1);this.pw=(this.pw||0)+(tg-(this.pw||0))*(1-Math.exp(-dt/.35));
   if(this.pw>.15){_pw.copy(ax).applyQuaternion(_qb.copy(this.q).invert()).multiplyScalar(this.pw);if(this.pivot(_pw,dt,-1))return;wt=_pw}}else this.pw=this.pr=0  // past the edge (the pivot lost the ground): keep rolling under motor power until upright, so grip can't leave it on its side
  if(lk);else if(gd&&F.wheels)this.w.lerp(wt,1-Math.exp(-dt/.09));else{const r=F.rmax,am=gd&&this.v.lengthSq()>16?Math.min(1,.02+this.ms*1.5):1,a=[F.acc[0]*am,F.acc[1]*am,F.acc[2]*am],k=1-Math.exp(-dt/(gd?.09:TAU));  // parts: the airframe tops out at rmax and its torque/inertia caps angular acceleration; on the ground (no wheels), sliding faster than 4 m/s, the motors only fight a tumble as hard as their spin allows
   this.w.x+=cl((cl(wt.x,-r[0],r[0])-this.w.x)*k,-a[0]*dt,a[0]*dt);this.w.y+=cl((cl(wt.y,-r[1],r[1])-this.w.y)*k,-a[1]*dt,a[1]*dt);this.w.z+=cl((cl(wt.z,-r[2],r[2])-this.w.z)*k,-a[2]*dt,a[2]*dt)}const up=_u.set(0,1,0).applyQuaternion(this.q),va=this.v.dot(up);
  if(!lk&&WASH>0&&va<-6&&this.ms>.15){const a=WASH*cl((-va-6)/18,0,1)*this.ms*2.5,k=Math.min(1,dt*9);this.wn.x+=(Math.random()-.5-this.wn.x)*k;this.wn.z+=(Math.random()-.5-this.wn.z)*k;this.w.x+=this.wn.x*a;this.w.z+=this.wn.z*a}  // falling into your own prop wash
  const qn=_qn.copy(this.q),wl=this.w.length();if(wl>1e-6){_q.setFromAxisAngle(_v.copy(this.w).divideScalar(wl),wl*dt);qn.multiply(_q).normalize();up.set(0,1,0).applyQuaternion(qn)}  // where this tick ends up
  this.ms+=(this.thr-this.ms)*(1-Math.exp(-dt/Math.max(1e-3,this.thr>this.ms?SPOOL*F.spool:SPOOL*F.spool*1.6)));  // motor spool-up / spin-down
  const was=this.boostOn;this.boostOn=this.boosting&&this.boost>0;let acc=THR*F.thr*this.ms**(TE*F.te);  // thrust ~ rpm², shaped by the thrust curve
  acc*=cl(1-va/(VP*F.vp),0,1.15);  // prop inflow: thrust falls off as the air through the disc nears the prop's pitch speed
  // super boost: instant (no spool, no inflow loss), with a kick the moment it lights
  if(this.boostOn){acc+=BOOST*F.boost;this.boost=Math.max(0,this.boost-DRAIN*F.drain*dt);if(!was){this.v.addScaledVector(up,BKICK);if(this===GS.player){GS.shake=Math.max(GS.shake,.25);noise(.35,140,.5);tone(110,320,.3,.12,'sawtooth')}}}
  this.v.addScaledVector(up,acc*dt);this.v.y-=G*dt;
  const s=this.v.length();if(s>1e-4){const bx=_x.set(1,0,0).applyQuaternion(qn),bz=_z.set(0,0,1).applyQuaternion(qn),k=DQ*s,vx=this.v.dot(bx),vy=this.v.dot(up),vz=this.v.dot(bz);
   const dl=DL*F.dl;_gw.copy(bx).multiplyScalar(vx*(dl+k*.9*F.dq[0])).addScaledVector(up,vy*(dl+k*1.8*F.dq[1])).addScaledVector(bz,vz*(dl+k*.7*F.dq[2]));const dd=_gw.length()*dt;this.v.addScaledVector(_gw,-dt*(dd>s?s/dd:1))}  // body-axis drag: the disc face has ~2x the frontal area
  const vm=MAXV*F.maxv*(this.boostOn?1.5:1),s2=this.v.length();if(s2>vm)this.v.multiplyScalar(Math.max(vm/s2,1-dt*2));
  this.ph=1}  // Rapier moves it: p += v*dt, q turned by w*dt (the same integration as v15), then contacts
 pivot(wt,dt,deep=-.15){const ww=_ww.copy(wt).applyQuaternion(this.q);let bv=-.05,ok=false;
  for(const C of this.pts){const r=_br.copy(C.p).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r);if(sdf(P.x,P.y,P.z)+C.r<deep)continue;  // the ground hull's outline (physics/world.js: the loadout's hbp/hbr)
   const n=sdN(P,_an);r.addScaledVector(n,C.r);const s=_vp.crossVectors(ww,r).dot(n);if(-s<bv){bv=-s;_pv.copy(r);ok=true}}  // corner the rotation would push hardest into the ground = pivot
  if(!ok)return false;this.w.copy(wt);this.v.crossVectors(ww,_pv).negate();this.boostOn=false;this.ms+=(this.thr-this.ms)*.1;
  this.ph=1;this.piv=1;this.gt=.12;return true}  // Rapier turns it about the pivot point (which stays put) and keeps it out of the ground
 // ground contact, friction and impacts are physics/world.js (groundContacts); the impact sound is in modes/step.js
}
const _pv=new V3(),_qn=new QT(),_pa=new V3(),_pw=new V3(),PEND=3.6,_pz=new V3();
export const POP_T=5,POP_D=.42,POP_V=12,POP_W=Math.PI*2/POP_D;  // pop: charge lifetime s, locked turn s, shove m/s, turn rate rad/s
export const _rf=new V3(),_qr=new QT(),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
function rightUp(d,k){const f=_rf.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<.01){f.set(0,1,0).applyQuaternion(d.q);f.y=0}_qr.setFromAxisAngle(UP,f.lengthSq()>1e-4?Math.atan2(-f.x,-f.z):0);d.q.slerp(_qr,k)}  // level, keeping the heading
const _gw=new V3(),_ww=new V3(),_br=new V3(),_bp2=new V3(),_vp=new V3(),_rn=new V3();
onTune(()=>GS.drones.forEach(d=>d.setLoadout(d.lo.ids)));  // parts: drone size changed, refit hull/box/radius
