// ---------- Dogfight bots ----------
// dogfighting bot: pick a target (nearest enemy drone, weighted to what's in front; else an enemy turret), sit ~40 m off its lead point, fire when the camera axis is on it
import {DIFF,UP,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BOOST,BOTV,BTHR,DL,DQ,G,TE,THR} from '../config/tune.js';
import {attitude} from '../flight/attitude.js';
import {TUR,aimOk} from '../modes/dogfight.js';
import {BSPD,gunDir} from '../modes/guns.js';
import {los,sdN,sdf} from '../physics/sdf.js';
import {_T,_a,_b,_dir,_f,_gd,_ip,_lat,_t,_u} from '../scratch.js';
import {GS,SB} from '../state.js';
import {DBASE,DCEIL,DHL,DHW,dfH} from '../world/highlands.js';
export function dfBot(d,dt){const D=DIFF[S.diff],ai=d.ai;
 if((ai.t-=dt)<=0){ai.t=D.react*(.7+Math.random()*.6);let best=null,bs=1e9;const f=gunDir(d,.52,_gd);
  const vis=o=>o.p.distanceToSquared(d.p)<350*350&&los(d.p,o.p);  // targets behind cover score worse, so bots go for what they can see
  for(const e of GS.drones)if(e.dead<=0&&e.team!==d.team){_a.subVectors(e.p,d.p);const l=_a.length()||1,sc=l*(1.4-_a.dot(f)/l*.4)*(vis(e)?1:1.7);if(sc<bs){bs=sc;best=e}}
  for(const t of TUR)if(t.re<=0&&t.t!==d.team){const l=(t.p.distanceTo(d.p)*(d.i===2?.8:1.8)+30)*(vis(t)?1:1.5);if(l<bs){bs=l;best=t}}
  ai.vis=!!best&&vis(best);  // the third bot on a team leans toward ground targets
  ai.tgt=best;ai.nz.lerp(_t.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize(),.5)}
 const e=ai.tgt&&(e2=>e2.isTurret?e2.re<=0:e2.dead<=0)(ai.tgt)?ai.tgt:null,aim=_ip;let dist=1e9;
 if(e){dist=e.p.distanceTo(d.p);aim.copy(e.p).addScaledVector(ai.nz,dist*(.014+.007*D.noise));if(!e.isTurret)aim.addScaledVector(_t.subVectors(e.v,d.v),dist/BSPD);const to=_dir.subVectors(aim,d.p).normalize();
  ai.tg.copy(aim).addScaledVector(to,-(e.isTurret?55:40));ai.tg.y=Math.max(ai.tg.y,e.isTurret?e.p.y+22:6);ai.look.copy(aim)}
 else{ai.tg.set(0,60,(d.team?1:-1)*DBASE);ai.look.copy(ai.tg)}
 ai.tg.x=cl(ai.tg.x,-DHW+60,DHW-60);ai.tg.z=cl(ai.tg.z,-DHL+60,DHL-60);ai.tg.y=cl(ai.tg.y,dfH(ai.tg.x,ai.tg.z)+10,DCEIL-10);
 const vd=_b.subVectors(ai.tg,d.p).multiplyScalar(D.kp).clampLength(0,Math.max(D.vmax,dist>150?60:0)*BOTV),a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);
 let s=-99;for(const k of[.5,1.1]){const la=_t.copy(d.p).addScaledVector(d.v,k),s2=sdf(la.x,la.y,la.z);s=Math.max(s,s2);if(s2>-8){sdN(la,_lat);a.addScaledVector(_lat,-(s2+8)*12/k)}}  // look-ahead obstacle and terrain avoidance
 const clr=d.p.y-dfH(d.p.x,d.p.z);if(clr<6&&d.v.y<0)a.y+=-d.v.y*2+(6-clr)*8;
 const lim=Math.min(1,D.thr*BOTV),cap=BTHR*lim+(SB()&&d.boost>5?BOOST:0);if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(d.v,DL+DQ*d.v.length());
 // in gun range: tip the quad so the uptilted camera points at the lead (an FPV attack run), keeping enough lift to hold height
 if(e&&ai.vis&&dist<200&&s<=-3&&clr>4){const g=_dir.subVectors(aim,d.p).normalize(),r=_lat.crossVectors(g,UP);if(r.lengthSq()>.01){r.normalize();const gu=_b.copy(g).multiplyScalar(.5).addScaledVector(_t.crossVectors(r,g),.866),ty=T.y;
  T.normalize().lerp(gu,(dist<140?1:.7)*cl((-s-3)/5,0,1)).normalize().multiplyScalar(cl(ty,G*.3,G*2.5)/Math.max(T.y,.35))}}
 const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(d.q).dot(T);const F=d.fl;let thr=need/(THR*F.thr);d.boosting=SB()&&thr>1.02&&al>.9&&d.boost>3;if(d.boosting)thr=(need-BOOST*F.boost)/(THR*F.thr);thr=Math.max(thr,0)**(1/(TE*F.te));  // parts: this quad's thrustd.thr=cl(thr,0,lim)*cl((al-.1)/.6,.05,1);
 const look=_f.subVectors(ai.look,d.p);look.y=0;if(look.lengthSq()<1)look.set(0,0,d.team?1:-1);look.normalize();const th=Math.hypot(T.x,T.z);
 if(th>.08)look.lerp(_lat.set(T.x,0,T.z).divideScalar(th),cl((th-.08)/.2,0,1)).normalize();attitude(d,T,look,D.att*.75,D.rate*.8,.6);
 // stick and throttle smoothing: a pilot's hands, not a flight computer
 const ps=ai.ps||(ai.ps={w:d.wt.clone(),t:d.thr}),k=1-Math.exp(-dt/(.06+.012*D.noise));ps.w.lerp(d.wt,k);d.wt.copy(ps.w);ps.t+=(d.thr-ps.t)*k;d.thr=ps.t;
 d.firing=!!e&&ai.vis&&GS.state==='play'&&aimOk(d,aim,gunDir(d,.52,_gd),3+D.noise*1.5,230)}
