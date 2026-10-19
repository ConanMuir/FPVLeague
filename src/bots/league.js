// ---------- bots (League): ball prediction, intercept, roles, cascaded controller into attitude() ----------
import {DIFF,GD,GH,GW,H,HL,HW,UP,V3,cl} from '../config/constants.js';
import {LL,hoopMode,hoops,ropeLen} from '../modes/longline.js';
import {S} from '../config/settings.js';
import {BG,BOOST,BOTV,BR,BTHR,DL,DQ,G,TE,THR} from '../config/tune.js';
import {attitude} from '../flight/attitude.js';
import {ball,ballPhys} from '../physics/ball.js';
import {sdN,sdf} from '../physics/sdf.js';
import {_T,_a,_b,_dir,_f,_ip,_lat,_t,_u} from '../scratch.js';
import {GS,SB} from '../state.js';
import {ORBS} from '../world/orbs.js';
import {dribble,dribbleSupport} from './dribble.js';
import {freestyle} from './freestyle.js';
// the ball 4 s ahead: the same ball model as the game (physics/ball.js, spin included) without Rapier, at 50 Hz
export const PDT=1/50,PRED=Array.from({length:200},()=>new V3()),PV=Array.from({length:200},()=>new V3()),_pb={p:new V3(),v:new V3(),w:new V3(),c:false,n:new V3()};
export function predict(){_pb.p.copy(ball.p);_pb.v.copy(ball.v);_pb.w.copy(ball.w);_pb.c=ball.c;_pb.n.copy(ball.n);for(let i=0;i<PRED.length;i++){ballPhys(_pb,PDT);PRED[i].copy(_pb.p);PV[i].copy(_pb.v)}}  // PV: its velocity there (the smarter planner aims with it)
const _aim=new V3();
function intercept(d,D){const acc=BTHR*D.thr*.6,vm=D.vmax*BOTV;
 for(let i=0;i<PRED.length;i+=2){const P=PRED[i],t=(i+1)*PDT;_a.subVectors(P,d.p);const dist=_a.length(),v0=dist>0?d.v.dot(_a)/dist:0;
  const tr=(dist/vm+Math.max(0,vm-v0)/acc*.5)*D.slack+.12;if(tr<=t)return P}return PRED[PRED.length-1]}
function threat(team){const oz=team?-1:1;for(let i=0;i<125;i+=4){const P=PRED[i];if(P.z*oz>HL-1&&Math.abs(P.x)<GW/2+2&&P.y<GH+2)return true}return false}
function think(d,D){if(D.iq)return thinkIQ(d,D);const ai=d.ai,was=ai.strike;ai.strike=false;const s=d.team?1:-1,ownZ=-s*HL;let role=d.role;
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
// the Dribbler and Freestyler levels (DIFF[].drib, .fs) have their own controllers: bots/dribble.js, bots/freestyle.js
export function botControl(d,dt){const D=DIFF[d.skill??S.diff],ai=d.ai;if(D.drib){d.pops=true;if(d.role!=='attack')dribbleSupport(d,D);else if(D.fs)freestyle(d,D,dt);else dribble(d,D,dt);return}if((ai.t-=dt)<=0){ai.t=D.react*(.7+Math.random()*.6);think(d,D)}
 if(LL.d===d){const s=d.team?1:-1;ai.strike=false;ai.demo=false;ai.tv.set(0,0,0);
  if(hoopMode()){const hs=hoops().filter(o=>o.c.z*s>0);let o=hs[0];for(const q of hs)if(q.c.distanceToSquared(ball.p)<o.c.distanceToSquared(ball.p))o=q;  // nearest of their rings
   const lead=(o.c.z-ball.p.z)*s;ai.tg.set(o.c.x,Math.min(H-4,o.c.y+ropeLen()+BR+(lead>40?6:0)),o.c.z+s*(lead>25?-8:25))}  // line up in front, then fly through so the ball trails through the ring
  else ai.tg.set(cl(ball.p.x*.3,-GW/3,GW/3),Math.min(GH-2,BR+ropeLen()+1.5),s*(HL+GD*.6));ai.look.copy(ai.tg).setY(d.p.y)}  // goals: tow it low through the goal mouth
 else if(LL.d&&LL.d.team===d.team){const s=d.team?1:-1;ai.strike=false;ai.demo=false;ai.tv.copy(LL.d.v).multiplyScalar(.5);ai.tg.set(LL.d.p.x+(d.i%2?14:-14),LL.d.p.y,LL.d.p.z-s*10);ai.look.set(0,0,s*HL)}  // a teammate has it: fly escort beside and behind
 const vd=ai.demo&&D.iq?demoV(d,D):ai.strike&&D.iq&&ai.C?strikeV(d,D,dt):ai.strike?_b.copy(ball.p).addScaledVector(ball.v,.1).add(ai.tv).sub(d.p).setLength(D.vmax*BOTV*.8):_b.subVectors(ai.tg,d.p).multiplyScalar(D.kp).add(ai.tv).clampLength(0,D.vmax*BOTV),a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);
 if(d.p.y<1.6&&d.v.y<0)a.y+=-d.v.y*2+(1.6-d.p.y)*8;if(d.p.y>H-4&&d.v.y>0)a.y-=d.v.y*2;
 const lim=Math.min(1,D.thr*BOTV),cap=BTHR*lim+(SB()&&d.boost>5?BOOST:0);if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(d.v,DL+DQ*d.v.length());const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(d.q).dot(T);const F=d.fl;let thr=need/(THR*F.thr);d.boosting=SB()&&thr>1.02&&al>.9&&d.boost>3;if(d.boosting)thr=(need-BOOST*F.boost)/(THR*F.thr);thr=Math.max(thr,0)**(1/(TE*F.te));  // parts: this quad's thrust
 d.thr=cl(thr,0,lim)*cl((al-.1)/.6,.05,1);
 const look=_f.subVectors(ai.look,d.p);look.y=0;if(look.lengthSq()<1)look.set(0,0,d.team?1:-1);look.normalize();attitude(d,T,look,D.att,D.rate,.6)
 d.pops=!!D.pop;if(D.pop)popShot(d)}
export function assignRoles(){for(const t of[0,1]){const s=t?1:-1,ms=GS.drones.filter(d=>d.team===t&&d.dead<=0);if(!ms.length)continue;if(DIFF[ms[0].skill??S.diff].iq){rolesIQ(ms,s);continue}
 const sc=d=>d.p.distanceTo(ball.p)/30+((d.p.z-ball.p.z)*s>0?1.2:0);ms.sort((a,b)=>sc(a)-sc(b));ms[0].role='attack';
 const rest=ms.slice(1).sort((a,b)=>Math.abs(a.p.z+s*HL)-Math.abs(b.p.z+s*HL));rest.forEach((d,i)=>d.role=i===0?'keep':'mid')}}
// ---------- the smarter planner (DIFF[].iq: Champion, Grand Champion) ----------
// It plans the shot, not just the touch. A touch adds speed to the ball along the contact normal (modes/step.js), so for each predicted
// ball point it aims the normal at (shot direction * shot speed - the ball's own velocity there), finds the contact point that gives that
// normal (kept off the floor and walls), and checks whether this quad, flying the same flight model, can be there in time coming from
// behind the ball. It then flies a timed run through that point (strikeV). Roles rotate by who can actually reach the ball first.
const _g=new V3(),_n=new V3(),_c=new V3(),_e=new V3(),_k=new V3();
export function reachT(d,X,acc,vm){_k.subVectors(X,d.p);const dist=_k.length();if(dist<1e-3)return 0;const v0=d.v.dot(_k)/dist,vp=Math.sqrt(Math.max(0,d.v.lengthSq()-v0*v0));
 let t;if(v0>=vm)t=dist/v0;else{const ta=(vm-v0)/acc,da=(v0+vm)*.5*ta;t=da>=dist?(Math.sqrt(v0*v0+2*acc*dist)-v0)/acc:ta+(dist-da)/vm}return t+vp/acc*.6}  // straight-line time: accelerate to vm, kill the sideways speed
function keeperOf(team){const gz=(team?1:-1)*HL;let k=null,kd=1e9;for(const e of GS.drones)if(e.team!==team&&e.dead<=0){const q=Math.abs(e.p.z-gz)+Math.abs(e.p.x)*.5;if(q<kd){kd=q;k=e}}return kd<50?k:null}
// where in the goal to put it: away from the defender nearest the goal, low or high against where he sits, lifted for the ball's drop
function goalAim(d,P,kp,out){const gz=(d.team?1:-1)*HL,far=Math.abs(P.z-gz)+Math.abs(P.x)*.3;let x=cl(P.x*.5,-GW/2+6,GW/2-6),y=GH*.4;
 if(d.ai.gx!=null){x=d.ai.gx;y=d.ai.gy}else if(kp&&far>14&&far<120){const f=cl(Math.abs(kp.p.z-gz)/Math.max(far,1),0,1),lx=P.x*f;x=kp.p.x>lx?-(GW/2-5):GW/2-5;y=kp.p.y>GH*.5?4.5:GH-5}
 const tf=far/70;return out.set(x,Math.min(y+.5*BG*tf*tf,H-6),gz*(1+3/HL))}
const _n0=new V3(),_c0=new V3(),_q=new V3(),GA=[];for(const y of[4,GH*.5,GH-4])for(const x of[-GW/2+5,-GW/4,0,GW/4,GW/2-5])GA.push([x,y]);
// the open corner (DIFF[].aim): for each spot in the goal mouth, how much sooner the ball (at ~70 m/s, after this touch) gets along the line
// than the quickest defender can get onto it; the spot with the biggest margin wins
function bestAim(d,D,P,t0){const gz=(d.team?1:-1)*(HL+3),acc=BTHR*.72,vm=D.vmax*BOTV;let best=-1e9;d.ai.gx=null;
 for(const[x,y]of GA){_e.set(x,y,gz);const L=_e.distanceTo(P);let m=1e9;
  for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0)for(const f of[.35,.6,.8,1]){_q.lerpVectors(P,_e,f);m=Math.min(m,reachT(o,_q,acc,vm)-(t0+L*f/70))}
  m-=Math.abs(x)*.004;if(m>best){best=m;d.ai.gx=x;d.ai.gy=y}}}
// earliest time a quad (any skill: assumed as quick as this one) can get a touch on the ball, from any side
function firstT(o,acc,vm,slack){for(let i=1;i<PRED.length;i+=3)if(reachT(o,PRED[i],acc,vm)*slack+.1<=(i+1)*PDT)return(i+1)*PDT;return 4}
export function plan(d,D){const ai=d.ai,acc=BTHR*D.thr*.72,vm=D.vmax*BOTV,vs=vm*.8,R=BR+.75,kp=keeperOf(d.team);let pick=-1,i0=-1;
 if(D.aim)bestAim(d,D,ai.tt>0&&ai.P?ai.P:ball.p,ai.tt>0?ai.tt:0);else if(!ai.fsAim)ai.gx=null;
 for(let i=1;i<PRED.length;i+=2){const P=PRED[i],t=(i+1)*PDT;
  goalAim(d,P,kp,_g).sub(P).normalize();_n.copy(_g).multiplyScalar(vs*1.2).sub(PV[i]).normalize();
  const ny=(P.y-1.6)/(R+10);if(_n.y>ny){const h=Math.hypot(_n.x,_n.z)||1,k=Math.sqrt(Math.max(0,1-ny*ny))/h;_n.x*=k;_n.z*=k;_n.y=ny}  // the contact point and a 10 m run-up to it stay above the floor
  _c.copy(P).addScaledVector(_n,-R);const sd=sdf(_c.x,_c.y,_c.z);if(sd>-1){sdN(_c,_lat);_c.addScaledVector(_lat,-(sd+1));_n.subVectors(P,_c).normalize()}  // ...and off the walls: then it plays the ball along them
  _k.subVectors(_c,d.p);const dist=_k.length(),al=dist<1?1:_k.dot(_n)/dist;let tr;
  if(i0<0){_n0.subVectors(P,d.p).normalize().addScaledVector(_n,.7).normalize();if(_n0.y>ny){const h=Math.hypot(_n0.x,_n0.z)||1,k=Math.sqrt(Math.max(0,1-ny*ny))/h;_n0.x*=k;_n0.z*=k;_n0.y=ny}
   _c0.copy(P).addScaledVector(_n0,-R);if(reachT(d,_c0,acc,vm)*D.slack+.1<=t){i0=i;ai.t0=t;ai.n0.copy(_n0);ai.C0.copy(_c0);ai.P0.copy(P)}}  // the quickest touch: straight at it, bent toward the shot
  if(al>.4)tr=reachT(d,_c,acc,vm);else{const L=6+6*(1-al);tr=reachT(d,_e.copy(_c).addScaledVector(_n,-L),acc,vm)+L/vs+.3*(1-al)}  // from the wrong side it has to go round first
  if(tr*D.slack+.1<=t||i>=PRED.length-2){if(i0<0){i0=i;ai.t0=t;ai.n0.copy(_n);ai.C0.copy(_c);ai.P0.copy(P)}pick=i;ai.al=al;ai.tt=t;ai.n.copy(_n);ai.C.copy(_c);ai.P.copy(P);break}}
 return pick}
function thinkIQ(d,D){const ai=d.ai,s=d.team?1:-1,ownZ=-s*HL;let role=d.role;ai.strike=false;ai.demo=null;
 if(!ai.C){ai.C=new V3();ai.n=new V3();ai.P=new V3();ai.C0=new V3();ai.n0=new V3();ai.P0=new V3()}
 if(Math.random()<.35)ai.nz.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(D.noise);
 const danger=threat(d.team),near=Math.abs(ball.p.z-ownZ)<30;
 if(role==='keep'&&(danger||near))role='attack';
 if(role==='mid'){if(danger)role='keep';else if(SB()&&d.boost<35&&d.p.distanceTo(ball.p)>30)role='boost'}
 if(role==='attack'){plan(d,D);
  // contested: if a foe can touch it before the placed shot is ready, take the quickest touch instead (still bent toward the goal)
  if(ai.t0<ai.tt-.05){const acc=BTHR*D.thr*.72,vm=D.vmax*BOTV;let ot=4;for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0)ot=Math.min(ot,firstT(o,acc,vm,D.slack));
   if(ot<ai.tt+.15){ai.tt=ai.t0;ai.n.copy(ai.n0);ai.C.copy(ai.C0);ai.P.copy(ai.P0);_k.subVectors(ai.C,d.p);const l=_k.length();ai.al=l<1?1:Math.max(.41,_k.dot(ai.n)/l)}}
  ai.C.add(ai.nz);ai.look.copy(ai.P);
  if(ai.al>.4){ai.strike=true;ai.tg.copy(ai.C)}
  else{const L=8+8*(1-ai.al);ai.tg.copy(ai.C).addScaledVector(ai.n,-L);const lat=_lat.crossVectors(ai.n,UP);if(lat.lengthSq()<.01)lat.set(1,0,0);lat.normalize();
   ai.tg.addScaledVector(lat,(Math.sign(lat.dot(_t.subVectors(d.p,ai.P)))||1)*(1-ai.al)*7);if(ai.al<0)ai.tg.y=Math.max(ai.tg.y,ai.P.y+5);ai.tv.copy(ball.v).multiplyScalar(.6)}}
 else if(role==='keep'){const gc=_a.set(0,GH*.4,ownZ),to=_b.subVectors(ball.p,gc);const L=to.length()||1;ai.tg.copy(gc).addScaledVector(to,Math.min(9,L*.3)/L);  // on the ball-goal line: cut the angle
  ai.tg.x=cl(ai.tg.x,-GW/2+3,GW/2-3);ai.tg.y=cl(ai.tg.y,2.5,GH-3);ai.tv.set(0,0,0);ai.look.copy(ball.p)}
 else if(role==='mid'&&D.demo&&ball.p.z*s>HL*.25&&(ai.demo=keeperOf(d.team))&&ai.demo.p.distanceTo(d.p)<140){ai.look.copy(ai.demo.p)}  // the third man takes out the keeper while the attack is on (a demolition needs DEMO m/s of closing speed)
 else if(role==='mid'){ai.demo=null;const at=GS.drones.find(o=>o.team===d.team&&o!==d&&o.role==='attack'&&o.dead<=0);  // second man: behind the play, wide of the attacker, ready for the rebound
  ai.tg.lerpVectors(ball.p,_a.set(0,6,ownZ),.3);ai.tg.x+=((at?at.p.x:ball.p.x)>ball.p.x?-1:1)*14;ai.tg.y=cl(ball.p.y*.7,4,20);ai.tv.copy(ball.v).multiplyScalar(.5);ai.look.copy(ball.p)}
 else{let best=null,bd=1e9;for(const p of ORBS)if(p.cd<=0){const dd=p.p.distanceToSquared(d.p)*(p.big?.5:1);if(dd<bd){bd=dd;best=p}}
  if(best){ai.tg.copy(best.p);ai.tv.set(0,0,0);ai.look.copy(best.p)}}
 if(ai.strike)return;
 const inMouth=Math.abs(ai.tg.x)<GW/2-2&&ai.tg.y<GH-2;ai.tg.x=cl(ai.tg.x,-HW+2.5,HW-2.5);ai.tg.y=cl(ai.tg.y,1.6,H-3);ai.tg.z=cl(ai.tg.z,-(inMouth?HL+GD-2:HL-2.5),inMouth?HL+GD-2:HL-2.5);const sd=sdf(ai.tg.x,ai.tg.y,ai.tg.z);if(sd>-3){sdN(ai.tg,_lat);ai.tg.addScaledVector(_lat,-(sd+3))}}
// the timed run: be (speed x time left) behind the contact point on the normal, moving along it, so it arrives on time and hits through
export function strikeV(d,D,dt){const ai=d.ai,vm=D.vmax*BOTV;ai.tt=Math.max(.04,ai.tt-dt);const along=_c.subVectors(ai.C,d.p).dot(ai.n),sp=cl(along/ai.tt,vm*D.fl,vm);
 _b.copy(ai.C).sub(d.p).addScaledVector(ai.n,-along);  // off the line through the contact point
 _b.y=Math.max(_b.y,1.8-d.p.y);return _b.multiplyScalar(3).addScaledVector(ai.n,sp+(along-sp*ai.tt)*D.ka).clampLength(0,vm)}  // on time: ahead of schedule it eases off (or backs up for a run-up)
// roles by time to the ball (from the right side), with a little stickiness so they don't flap
function rolesIQ(ms,s){const D=DIFF[ms[0].skill??S.diff],acc=BTHR*D.thr*.72,vm=D.vmax*BOTV;
 const sc=d=>{let t=4;for(let i=1;i<PRED.length;i+=4){if(reachT(d,PRED[i],acc,vm)<=(i+1)*PDT){t=(i+1)*PDT;break}}return t+((d.p.z-ball.p.z)*s>2?.6:0)-(d.role==='attack'?.2:0)};
 for(const d of ms)d.ai.rs=sc(d);ms.sort((a,b)=>a.ai.rs-b.ai.rs);ms[0].role='attack';
 const rest=ms.slice(1).sort((a,b)=>Math.abs(a.p.z+s*HL)-Math.abs(b.p.z+s*HL));rest.forEach((d,i)=>d.role=i===0?'keep':'mid')}
// demolition run: full speed at where the target will be (lead by the closing time), so the hit lands well above DEMO
function demoV(d,D){const e=d.ai.demo,vm=D.vmax*BOTV;if(e.dead>0){d.ai.demo=null;return _b.set(0,0,0)}const t=e.p.distanceTo(d.p)/vm;return _b.copy(e.p).addScaledVector(e.v,t).sub(d.p).setLength(vm)}
// pops (DIFF[].pop): bots that can earn a pop (the ball on top of the quad, modes/step.js) spend it when one of the four pop directions
// (pitch forward/back, roll right/left: the ball leaves that way) points at the enemy goal
const _px=new V3(),PS=[[0,.9,0,0,0,-1],[0,-.9,0,0,0,1],[.9,0,0,1,0,0],[-.9,0,0,-1,0,0]];
function popShot(d){if(!(d.popC>0)||d.popT>0)return;_g.set(0,0,(d.team?1:-1)*HL).sub(ball.p);_g.y=0;const gl=_g.length();if(gl>140)return;_g.divideScalar(gl||1);
 for(const p of PS){_px.set(p[3],p[4],p[5]).applyQuaternion(d.q);_px.y=0;const l=_px.length();if(l>.5&&_px.dot(_g)/l>.8){d.tryPop(p);return}}}
