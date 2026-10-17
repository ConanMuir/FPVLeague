// ---------- bots (League): ball prediction, intercept, roles, cascaded controller into attitude() ----------
import {DIFF,GD,GH,GW,H,HL,HW,UP,V3,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BOOST,BOTV,BR,BTHR,DL,DQ,G,TE,THR} from '../config/tune.js';
import {attitude} from '../flight/attitude.js';
import {ball,ballPhys} from '../physics/ball.js';
import {sdN,sdf} from '../physics/sdf.js';
import {_T,_a,_b,_dir,_f,_ip,_lat,_t,_u} from '../scratch.js';
import {GS,SB} from '../state.js';
import {ORBS} from '../world/orbs.js';
// the ball 4 s ahead: the same ball model as the game (physics/ball.js, spin included) without Rapier, at 50 Hz
const PDT=1/50,PRED=Array.from({length:200},()=>new V3()),_pb={p:new V3(),v:new V3(),w:new V3(),c:false,n:new V3()};
export function predict(){_pb.p.copy(ball.p);_pb.v.copy(ball.v);_pb.w.copy(ball.w);_pb.c=ball.c;_pb.n.copy(ball.n);for(const P of PRED){ballPhys(_pb,PDT);P.copy(_pb.p)}}
const _aim=new V3();
function intercept(d,D){const acc=BTHR*D.thr*.6,vm=D.vmax*BOTV;
 for(let i=0;i<PRED.length;i+=2){const P=PRED[i],t=(i+1)*PDT;_a.subVectors(P,d.p);const dist=_a.length(),v0=dist>0?d.v.dot(_a)/dist:0;
  const tr=(dist/vm+Math.max(0,vm-v0)/acc*.5)*D.slack+.12;if(tr<=t)return P}return PRED[PRED.length-1]}
function threat(team){const oz=team?-1:1;for(let i=0;i<125;i+=4){const P=PRED[i];if(P.z*oz>HL-1&&Math.abs(P.x)<GW/2+2&&P.y<GH+2)return true}return false}
function think(d,D){const ai=d.ai,was=ai.strike;ai.strike=false;const s=d.team?1:-1,ownZ=-s*HL;let role=d.role;
 if(Math.random()<.35)ai.nz.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(D.noise);
 const danger=threat(d.team),near=Math.abs(ball.p.z-ownZ)<30;
 if(role==='keep'&&(danger||near))role='attack';
 if(role==='mid'){if(danger)role='keep';else if(SB()&&d.boost<35&&d.p.distanceTo(ball.p)>30)role='boost'}
 if(role==='attack'){const ip=_ip.copy(intercept(d,D)).add(ai.nz);
  _aim.set(cl(ip.x*.4,-GW/2+4,GW/2-4),cl(ip.y*.5+2,3,GH-3),s*(HL+4));const dir=_dir.subVectors(_aim,ip).normalize();
  const toB=_a.subVectors(ip,d.p),dist=toB.length();toB.divideScalar(dist||1);const al=toB.dot(dir);
  ai.strike=al>(was?.15:.6)||dist<BR+3;
  if(ai.strike){ai.tv.copy(dir).multiplyScalar(-.6);ai.tg.copy(ip).add(ai.tv)}
  else{ai.tg.copy(ip).addScaledVector(dir,-(10+8*(1-al)));const lat=_lat.crossVectors(dir,UP);if(lat.lengthSq()<.01)lat.set(1,0,0);lat.normalize();
   ai.tg.addScaledVector(lat,(Math.sign(lat.dot(_t.subVectors(d.p,ip)))||1)*(1-al)*6);if(al<0)ai.tg.y=Math.max(ai.tg.y,ip.y+4);ai.tv.copy(ball.v).multiplyScalar(.5)}
  ai.look.copy(ip)}
 else if(role==='keep'){const to=_a.set(ball.p.x,0,ball.p.z-ownZ).normalize();ai.tg.set(0,0,ownZ).addScaledVector(to,6);ai.tg.x=cl(ball.p.x*.35,-GW/2+2,GW/2-2);ai.tg.y=cl(ball.p.y*.6,3,GH-2);ai.tv.set(0,0,0);ai.look.copy(ball.p)}
 else if(role==='mid'){ai.tg.lerpVectors(ball.p,_a.set(0,6,ownZ),.45);ai.tg.x+=(ball.p.x>0?-1:1)*10;ai.tg.y=cl(ai.tg.y,5,14);ai.tv.copy(ball.v).multiplyScalar(.3);ai.look.copy(ball.p)}
 else{let best=null,bd=1e9;for(const p of ORBS)if(p.cd<=0){const dd=p.p.distanceToSquared(d.p)*(p.big?.5:1);if(dd<bd){bd=dd;best=p}}
  if(best){ai.tg.copy(best.p);ai.tv.set(0,0,0);ai.look.copy(best.p)}}
 const inMouth=Math.abs(ai.tg.x)<GW/2-2&&ai.tg.y<GH-2;ai.tg.x=cl(ai.tg.x,-HW+2.5,HW-2.5);ai.tg.y=cl(ai.tg.y,1.6,H-3);ai.tg.z=cl(ai.tg.z,-(inMouth?HL+GD-2:HL-2.5),inMouth?HL+GD-2:HL-2.5);const sd=sdf(ai.tg.x,ai.tg.y,ai.tg.z);if(sd>-3){sdN(ai.tg,_lat);ai.tg.addScaledVector(_lat,-(sd+3))}}
export function botControl(d,dt){const D=DIFF[S.diff],ai=d.ai;if((ai.t-=dt)<=0){ai.t=D.react*(.7+Math.random()*.6);think(d,D)}
 const vd=ai.strike?_b.copy(ball.p).addScaledVector(ball.v,.1).add(ai.tv).sub(d.p).setLength(D.vmax*BOTV*.8):_b.subVectors(ai.tg,d.p).multiplyScalar(D.kp).add(ai.tv).clampLength(0,D.vmax*BOTV),a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);
 if(d.p.y<1.6&&d.v.y<0)a.y+=-d.v.y*2+(1.6-d.p.y)*8;if(d.p.y>H-4&&d.v.y>0)a.y-=d.v.y*2;
 const lim=Math.min(1,D.thr*BOTV),cap=BTHR*lim+(SB()&&d.boost>5?BOOST:0);if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(d.v,DL+DQ*d.v.length());const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(d.q).dot(T);let thr=need/THR;d.boosting=SB()&&thr>1.02&&al>.9&&d.boost>3;if(d.boosting)thr=(need-BOOST)/THR;thr=Math.max(thr,0)**(1/TE);
 d.thr=cl(thr,0,lim)*cl((al-.1)/.6,.05,1);
 const look=_f.subVectors(ai.look,d.p);look.y=0;if(look.lengthSq()<1)look.set(0,0,d.team?1:-1);look.normalize();attitude(d,T,look,D.att,D.rate,.6)}
export function assignRoles(){for(const t of[0,1]){const s=t?1:-1,ms=GS.drones.filter(d=>d.team===t&&d.dead<=0);if(!ms.length)continue;
 const sc=d=>d.p.distanceTo(ball.p)/30+((d.p.z-ball.p.z)*s>0?1.2:0);ms.sort((a,b)=>sc(a)-sc(b));ms[0].role='attack';
 const rest=ms.slice(1).sort((a,b)=>Math.abs(a.p.z+s*HL)-Math.abs(b.p.z+s*HL));rest.forEach((d,i)=>d.role=i===0?'keep':'mid')}}
