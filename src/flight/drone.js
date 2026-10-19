// ---------- drones: the acro flight model ----------
// step() is the flight model: it sets this tick's velocity v and body rates w; q stays where the tick starts (thrust and drag use
// the attitude at its end, as v15). physics/world.js then integrates p, q from v, w on the drone's Rapier body (built from its parts
// loadout, buildDroneBody) and resolves ground/wall contact; pivot() is the turtle / self-righting lever over the lowest touching point.
import {noise,tone} from '../audio/audio.js';
import {emitEv} from '../core/events.js';
import {HL,QT,UP,V3} from '../config/constants.js';
import {BKICK,BOOST,DB,DL,DQ,DRAD,DRAIN,G,GF,HOV,MAXV,SPOOL,START,TAU,TE,THR,TURT,VP,WASH,onTune} from '../config/tune.js';
import {STOCK,computeLoadout,seededLoadout} from '../parts/index.js';
import {COS_DEF,cleanCos,seededCos} from '../parts/cosmetics.js';
import {_an,sdN,sdf} from '../physics/sdf.js';
import {buildDroneBody,freeDroneBody} from '../physics/world.js';
import {TN,buildDrone,rebuildDrone} from '../render/drone-mesh.js';
import {scene} from '../render/renderer.js';
import {quadAir,rightUp,wrapA} from './core.js';
import {_qb,_u} from '../scratch.js';
import {GS,isBot} from '../state.js';
import {DSLOTS,dfSpawnPoint} from '../world/highlands.js';
import {sm} from '../world/noise.js';
export const NAMES=[['Nova','Ace','Vortex'],['Blaze','Rotor','Kestrel']],SLOTS=[[0,4,HL*.72],[-34,4,HL*.82],[34,4,HL*.82]];
export class Drone{
 constructor(team,i,bot,key){Object.assign(this,{team,i,bot,key,remote:false,net:null,seen:0,name:NAMES[team][i],p:new V3(),v:new V3(),q:new QT(),w:new V3(),wt:new V3(),thr:HOV,ms:HOV,gt:0,wn:new V3(),boost:33,boostOn:false,boosting:false,dead:0,role:'attack',hp:100,life:0,fcd:0,firing:false,
  ai:{t:0,tg:new V3(),tv:new V3(),look:new V3(),nz:new V3()},ph:0,hit:0});this.setLoadout(isBot(key)?seededLoadout(key,GS.lseed):STOCK);this.cos=isBot(key)?seededCos(key,GS.lseed):{...COS_DEF};this.build();this.spawn();buildDroneBody(this)}
 build(){buildDrone(this)}  // mesh, FPV mark and trail: render/drone-mesh.js
 // ---- parts (src/parts): the loadout sets this drone's flight multipliers (this.fl), ground hull, ball box, inertia and hit radius ----
 setLoadout(ids){const lo=computeLoadout(ids,DRAD/.6),re=this.lo&&this.lo.ids.join()!==lo.ids.join();this.lo=lo;this.fl=lo.flight;
  this.hbp=lo.hbp.map(a=>new V3(...a));this.hbr=lo.hbr;this.bbx=lo.bbx;this.di=lo.di;this.hitR=lo.hitR;this.popM=lo.colliders.filter(c=>c.tag==='prop').map(c=>c.pos).sort((a,b)=>Math.atan2(a[0],a[2])-Math.atan2(b[0],b[2]));this.rad=DRAD*lo.size;if(re)rebuildDrone(this);if(this.rb)buildDroneBody(this)}  // Rapier body from the loadout's colliders
 // ---- cosmetics (parts/cosmetics.js): looks only; this.cos ids, this.trailCol/trailCol2/trailStyle for trail effects (render/cos-mat.js) ----
 setCos(c){c=cleanCos(c);if(this.cos&&Object.keys(c).every(k=>c[k]===this.cos[k]))return;this.cos=c;rebuildDrone(this)}
 spawn(spread){const s=(GS.OBSON?DSLOTS:SLOTS)[this.i],k=this.team?-1:1;this.hd=null;this.flipT=0;this.p.set(s[0]*k,s[1],s[2]*k);this.v.set(0,0,0);this.w.set(0,0,0);this.wt.set(0,0,0);this.q.setFromAxisAngle(UP,this.team?Math.PI:0);
  if(spread&&GS.OBSON){const r=dfSpawnPoint(GS.drones.filter(o=>o!==this&&o.dead<=0));this.p.set(r[0],r[1],r[2]);this.q.setFromAxisAngle(UP,r[3])}  // Dogfight respawn: far from everyone alive
  this.boost=START;this.dead=0;this.hp=100;this.firing=false;this.thr=this.ms=HOV;this.gt=0;for(let j=0;j<TN;j++)this.p.toArray(this.tp,j*3);this.mesh.visible=true}
 dispose(){scene.remove(this.mesh,this.trail);this.trail?.geometry.dispose();this.trail?.material.dispose();this.mark?.material.dispose();freeDroneBody(this)}  // the trail and marker are this drone's own (the parts geometry is shared, see parts/mesh.js)
 flipUp(){if(this.dead<=0&&(this.ct||0)>=.2)this.flipT=.35}  // flip over: always, once it has touched the ground or a wall for 0.2 s (any speed)
 // ---- pop: earned by touching the ball with the top of the quad inside its four motors (modes/step.js), held POP_T s.
 // A direction (dominant stick past half) plus the flip button spends it: a locked full turn about that body axis in POP_D s, throttle held,
 // a shove that way (pitch: forward/back, roll: sideways, yaw: spin in place), then back to the exact attitude it started from.
 tryPop(st){if(!(this.popC>0)||this.popT>0||this.dead>0)return false;const v=[st[1],st[2],st[0]],a=v.map(Math.abs),i=a.indexOf(Math.max(...a));if(a[i]<.5)return false;
  const s=-Math.sign(v[i]);this.popC=0;this.popT=POP_D;this.popAx=i;this.popS=s;this.popQ=(this.popQ||new QT()).copy(this.q);this.popThr=this.thr;
  if(i!==1)this.v.addScaledVector(_pz.set(i===2?-s:0,0,i===0?s:0).applyQuaternion(this.q),POP_V);E_POPF.d=this;E_POPF.dur=POP_D;emitEv('popFire',E_POPF);return true}  // the whoosh (audio/sfx.js) listens
 // is world point P on top of the quad and inside the square of its four motors (inset 10%)?
 popZone(P){const c=_pz.copy(P).sub(this.p).applyQuaternion(_qb.copy(this.q).invert()),M=this.popM;if(c.y<-.05||!M||M.length<3)return false;let sg=0;
  for(let i=0;i<M.length;i++){const A=M[i],B=M[(i+1)%M.length],cr=(B[0]-A[0])*.9*(c.z-A[2]*.9)-(B[2]-A[2])*.9*(c.x-A[0]*.9);if(Math.abs(cr)<1e-9)continue;const s=cr>0?1:-1;if(sg&&s!==sg)return false;sg=s}return true}
 step(dt){const gd=(this.gt-=dt)>0;let wt=this.wt;this.piv=0;this.at=gd?0:(this.at||0)+dt;this.ct=gd?(this.ct||0)+dt:this.at>.3?0:(this.ct||0);  // ct: time in contact with the ground or a wall (short hops while sliding don't reset it)
  if(this.flipT>0){this.flipT=Math.max(0,this.flipT-dt);rightUp(this,this.flipT?1-Math.exp(-dt*16):1);this.v.multiplyScalar(Math.exp(-dt*6));this.v.y=Math.max(this.v.y,2.5);this.ms+=(this.thr-this.ms)*.1;this.w.set(0,0,0);this.wt.set(0,0,0);this.ph=1;if(!this.flipT)this.gt=0;return}
  const lk=this.popT>0;if(lk){this.popT=Math.max(0,this.popT-dt);this.thr=this.popThr;if(this.popT>0)this.w.set(0,0,0).setComponent(this.popAx,this.popS*POP_W);else{this.q.copy(this.popQ);this.w.set(0,0,0)}}  // pop: locked turn, sticks ignored, throttle held
  if(this.popC>0)this.popC=Math.max(0,this.popC-dt);
  if(gd&&this.v.lengthSq()<100){wt=_gw.copy(wt);wt.y*=.15;wt.clampLength(0,TURT)}  // turtle-rate sticks and yaw cut only below 10 m/s, so a prop tip grazing the floor in a fast low turn keeps your rates
  // on the ground without enough lift to fly, sticks lever the frame over its lowest edge (turtle-style, no switch needed)
  const F=this.fl;  // parts: this drone's multipliers (src/parts)
  if(!lk&&gd&&this.v.lengthSq()<25&&wt.lengthSq()>.04&&THR*F.thr*this.ms**(TE*F.te)*_u.set(0,1,0).applyQuaternion(this.q).y<G*.9&&this.pivot(wt,dt)){this.pw=0;return}
  // inverted pendulum: resting fully upside down on the floor, it eases itself over onto its feet. The roll rate glides up from zero,
  // peaks while it is on its back and eases off as it comes upright. Once started it carries through; walls, ceiling, sides and sliding never trigger it.
  const cn=this.cn||(this.cn=new V3(0,1,0)),vt=this.v.lengthSq()-this.v.dot(cn)**2,uy=_u.set(0,1,0).applyQuaternion(this.q).y;
  if(!lk&&gd&&uy<.93&&(this.pr?vt<9+(this.pw*DRAD*1.6)**2:cn.y>.6&&uy<-.6&&vt<9)){const up=_u;this.pr=1;const ax=_pa.crossVectors(up,UP);let sn=ax.length();if(sn<.05)ax.set(0,0,1).applyQuaternion(this.q);else ax.divideScalar(sn);
   const tg=PEND*(.5+.5*sm((1-up.y)/2))*(this.thr>.3?1.3:1);this.pw=(this.pw||0)+(tg-(this.pw||0))*(1-Math.exp(-dt/.35));
   if(this.pw>.15){_pw.copy(ax).applyQuaternion(_qb.copy(this.q).invert()).multiplyScalar(this.pw);if(this.pivot(_pw,dt,-1))return;wt=_pw}}else this.pw=this.pr=0  // past the edge (the pivot lost the ground): keep rolling under motor power until upright, so grip can't leave it on its side
  // in the air (flight/core.js, shared with Riley's games): rate loop (parts: the airframe tops out at F.rmax and its torque/inertia caps
  // angular acceleration at F.acc; on the ground, no wheels, sliding faster than 4 m/s, the motors only fight a tumble as hard as their
  // spin allows), prop wash, spool, thrust curve and prop inflow, super boost (onBoost below), gravity, body-axis drag, top speed.
  // Thrust and drag use the attitude at the end of the tick (_qn); q itself stays put
  quadAir(this,dt,K,F,wt,gd,lk,_qn);
  this.ph=1}  // Rapier moves it: p += v*dt, q turned by w*dt (the same integration as v15), then contacts
 onBoost(){if(this===GS.player){GS.shake=Math.max(GS.shake,.25);noise(.35,140,.5);tone(110,320,.3,.12,'sawtooth')}}  // super boost just lit (quadAir)
 pivot(wt,dt,deep=-.15){const ww=_ww.copy(wt).applyQuaternion(this.q);let bv=-.05,ok=false;
  for(const C of this.pts){const r=_br.copy(C.p).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r);if(sdf(P.x,P.y,P.z)+C.r<deep)continue;  // the ground hull's outline (physics/world.js: the loadout's hbp/hbr)
   const n=sdN(P,_an);r.addScaledVector(n,C.r);const s=_vp.crossVectors(ww,r).dot(n);if(-s<bv){bv=-s;_pv.copy(r);ok=true}}  // corner the rotation would push hardest into the ground = pivot
  if(!ok)return false;this.w.copy(wt);this.v.crossVectors(ww,_pv).negate();this.boostOn=false;this.ms+=(this.thr-this.ms)*.1;
  this.ph=1;this.piv=1;this.gt=.12;return true}  // Rapier turns it about the pivot point (which stays put) and keeps it out of the ground
 // ground contact, friction and impacts are physics/world.js (groundContacts); the impact sound is in modes/step.js
}
const _pv=new V3(),_qn=new QT(),_pa=new V3(),_pw=new V3(),PEND=3.6,_pz=new V3();
export const POP_T=5,POP_D=.42,POP_V=12,POP_W=Math.PI*2/POP_D;  // pop: charge lifetime s, locked turn s, shove m/s, turn rate rad/s
const E_POPF={d:null,dur:0};  // the 'popFire' event payload (core/events.js), reused
export {wrapA};  // input/input.js imports it from here; rightUp (flip-over levelling) and wrapA live in flight/core.js
const _gw=new V3(),_ww=new V3(),_br=new V3(),_bp2=new V3(),_vp=new V3(),_rn=new V3();
// the tune for flight/core.js, read live from config/tune.js (its values change only in applyTune)
const K={get G(){return G},get THR(){return THR},get TE(){return TE},get VP(){return VP},get TAU(){return TAU},get SPOOL(){return SPOOL},get WASH(){return WASH},
 get BOOST(){return BOOST},get BKICK(){return BKICK},get DRAIN(){return DRAIN},get DL(){return DL},get DQ(){return DQ},get MAXV(){return MAXV}};
onTune(()=>GS.drones.forEach(d=>d.setLoadout(d.lo.ids)));  // parts: drone size changed, refit hull/box/radius
