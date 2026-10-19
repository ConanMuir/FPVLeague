// ---------- the Dribbler bot (DIFF[].drib): a show-off for the carry and pop mechanics, not a winner ----------
// Its attacker scoops the ball off the floor (a low, nose-down run into its bottom half), gets under it and catches it on the top
// of the frame, carries it toward the enemy goal over the pop zone (ball and quad share gravity, so the ball takes the tilted top's
// acceleration and only drifts when their speeds differ), and spends the pop it earns toward the goal. Its teammates keep clear.
// Same flight model and thrust limits as everyone (the controller only chooses an acceleration, like botControl).
import {HL,V3,cl} from '../config/constants.js';
import {BOTV,BR,BTHR,DL,DQ,G,TE,THR} from '../config/tune.js';
import {attitude} from '../flight/attitude.js';
import {GS} from '../state.js';
import {ball} from '../physics/ball.js';
import {sdN,sdf} from '../physics/sdf.js';
import {PDT,PRED,PV,reachT} from './league.js';
const _r=new V3(),_a=new V3(),_T=new V3(),_u=new V3(),_g=new V3(),_q=new V3(),_v=new V3(),_lk=new V3(),_px=new V3();
// height of the top of this quad's parts above its centre (the ball rests at top + BR)
export function topOf(d){if(d._topLo!==d.lo){d._topLo=d.lo;d._top=Math.max(...d.lo.colliders.map(c=>c.pos[1]+(c.shape==='box'?c.size[1]:c.size[0])))}return d._top}
// the four pop directions as stick inputs [roll, pitch, yaw] and the body direction the ball leaves in
const PS=[[0,.9,0,0,0,-1],[0,-.9,0,0,0,1],[.9,0,0,1,0,0],[-.9,0,0,-1,0,0]];
export function dribble(d,D,dt){const ai=d.ai,s=d.team?1:-1,top=topOf(d),H0=top+BR,vm=D.vmax*BOTV;d.pops=true;
 const r=_r.subVectors(ball.p,d.p),hd=Math.hypot(r.x,r.z),g=_g.set(0,0,s*(HL+4)).sub(ball.p);g.y=0;const gl=g.length()||1;g.divideScalar(gl);
 const a=_a.set(0,0,0);let look=g;
 const onTop=r.y>H0-.7&&r.y<H0+.9&&hd<1.4,grounded=ball.p.y<BR+.5&&Math.abs(ball.v.y)<3;
 if(onTop){  // carry: match the ball's velocity, pull back under it, speed both up toward the goal, then pop
  ai.dm='carry';ai.ct=(ai.ct||0)+dt;const vc=cl(gl/12,5,D.dv||10),o=_v.set(g.x*vc-ball.v.x,0,g.z*vc-ball.v.z).multiplyScalar(D.kg??1.2).clampLength(0,8);
  // the ball rides on the top: steer the quad's velocity toward the ball's (plus a pull back under it when it drifts off centre)
  const ke=D.ke??2.5,kv=D.kv??4,amx=D.am??25;a.x=kv*(ball.v.x+ke*(ball.p.x-d.p.x)-d.v.x)+o.x;a.z=kv*(ball.v.z+ke*(ball.p.z-d.p.z)-d.v.z)+o.z;  // ball and quad share gravity, so on the tilted top the ball takes the quad's acceleration: o speeds both up toward the goal
  const ah=Math.hypot(a.x,a.z);if(ah>amx){a.x*=amx/ah;a.z*=amx/ah}a.y=6*(cl(((D.cy||3)-d.p.y)*1.5,-3,4)-d.v.y);
  if(d.popC>0&&!(d.popT>0)&&ai.ct>(D.hold??.6)){  // spend the pop toward the goal: the pop direction (pitch fwd/back, roll right/left) that points at it
   let best=null,bd=.55;for(const p of PS){_px.set(p[3],p[4],p[5]).applyQuaternion(d.q);_px.y=0;const l=_px.length();if(l<.5)continue;const k=_px.dot(g)/l;if(k>bd){bd=k;best=p}}
   if(best&&d.tryPop(best))ai.ct=0}}
 else{ai.ct=0;if(!grounded)ai.sct=0;let foe=null;const md=d.p.distanceToSquared(ball.p);for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0){const q=o.p.distanceToSquared(ball.p);if(q<49&&q<md){foe=o;break}}
  if(foe){  // someone else is on the ball: give them room (this bot is here to show the mechanics, not to fight for the ball) and shadow it
   ai.dm='wait';_q.subVectors(d.p,ball.p);_q.y=0;if(_q.lengthSq()<1)_q.set(1,0,0);_q.setLength(15).add(ball.p);_q.y=Math.max(6,ball.p.y);_v.subVectors(_q,d.p).multiplyScalar(2).clampLength(0,vm).add(ball.v);a.subVectors(_v,d.v).multiplyScalar(4)}
  else if(grounded&&hd<30){  // scoop: from behind (along its roll, or away from the goal when it is slow), skim in low (centre ~1 m up), nose down, into the bottom half of the ball: it leaves at ~45 degrees
   ai.dm='scoop';look=_lk.subVectors(ball.p,d.p);ai.sct=(ai.sct||0)+dt;const bs=Math.hypot(ball.v.x,ball.v.z),sw=sdf(ball.p.x,ball.p.y,ball.p.z);let sd=bs>5?_px.set(ball.v.x/bs,0,ball.v.z/bs):_px.copy(g);
   if(sw>-BR-10){sdN(ball.p,_u);_u.y=0;if(_u.lengthSq()>.04)sd=_px.copy(_u).normalize()}  // by a wall: run it up the wall (it comes back down to be caught)
   if(ai.sct>5)sd.set(-sd.z,0,sd.x);if(ai.sct>9)ai.sct=0;  // stuck: try from the side
   _q.copy(ball.p).addScaledVector(sd,-(D.sbk??14));_q.y=D.sy??1;const behind=_v.subVectors(d.p,ball.p).dot(sd)<-3,rv=Math.hypot(d.v.x-ball.v.x,d.v.z-ball.v.z);
   if(behind&&_q.distanceTo(d.p)<3&&rv<6&&d.p.y<(D.sy??1)+.5||ai.sc>0){if(!(ai.sc>0))ai.sc=2;ai.sc-=dt;_v.subVectors(ball.p,d.p);_v.y=0;_v.normalize();  // accelerate all the way in, so the quad is nose-down when it meets the ball
    a.copy(_v).multiplyScalar(D.sa??26);_u.subVectors(ball.v,d.v);_u.y=0;a.addScaledVector(_u.addScaledVector(_v,-_u.dot(_v)),4);a.y=Math.max(-5,8*((D.sy??1)-d.p.y)-4*d.v.y)}  // gentle on height: thrust goes into the run
   else{const l=_q.distanceTo(d.p);_v.subVectors(_q,d.p).multiplyScalar(2).clampLength(0,Math.min(vm,Math.sqrt(40*l))).add(ball.v);_v.y=(_q.y-d.p.y)*3;a.subVectors(_v,d.v).multiplyScalar(4)}}  // braking profile: arrive at its speed
  else{ai.sc=0;ai.dm='catch';
   if(hd<(D.nr??10)&&r.y>H0-.3&&(r.y<H0+8||ball.v.y<-4&&r.y<H0+(D.nh??12))){  // under it: centre on it and rise into it slowly (closing at a few m/s), so it lands soft on the top
    if(r.y>H0+.3||hd<1.2){const kc=D.kc??2.5,kn=D.kn??10;a.x=kn*(ball.v.x+kc*(ball.p.x+ball.v.x*.05-d.p.x)-d.v.x);a.z=kn*(ball.v.z+kc*(ball.p.z+ball.v.z*.05-d.p.z)-d.v.z)}  // close in at a speed that falls to the ball's own as the gap closes (no overshoot)
    else{const k=Math.max(0,BR+1.6-hd)*20/(hd||1);a.x=10*(ball.v.x-d.v.x)-r.x*k;a.z=10*(ball.v.z-d.v.z)-r.z*k}  // ball not yet above the top: keep off its side (a side touch knocks it away) and wait under its path
    const gap=r.y-H0,vy=ball.v.y*(D.cm??.6)+cl(gap*2.5,1,4)*(hd<1.5?1:-.5);a.y=12*(vy-d.v.y)+(d.p.y<1.5?(1.5-d.p.y)*20:0)}  // follow its fall only partly: a soft landing, and lift left to steer with
   else{  // on the way: be about 2.5 m under its path where it comes down through a comfortable height, moving with it
    const acc=BTHR*D.thr*.7;let tt=.6,ok=false;for(let pass=0;pass<2&&!ok;pass++)for(let i=3;i<PRED.length;i+=2){const P=PRED[i];if(PV[i].y>0||P.y<H0+2+PV[i].y*PV[i].y/(D.rm??50)||P.y>(pass?40:16))continue;_q.copy(P);_q.y=Math.max(P.y-H0-2.5,1.5);const t=(i+1)*PDT;if(reachT(d,_q,acc,vm)*1.15+.2<=t){tt=t;ok=true;_v.copy(PV[i]);break}}
    if(!ok){_q.copy(PRED[Math.min(PRED.length-1,40)]);_q.y=Math.max(_q.y-H0-2.5,1.5);_v.copy(ball.v);tt=.8}
    const l=_q.distanceTo(d.p),vd=_u.subVectors(_q,d.p).divideScalar(cl(tt*.5,.25,.7)).clampLength(0,Math.min(vm,Math.sqrt(60*l)+Math.hypot(_v.x,_v.z)));if(hd<10)vd.y=Math.min(vd.y,(ball.p.y-H0-2-d.p.y)*3+ball.v.y);a.subVectors(vd,d.v).multiplyScalar(D.kd)}}}  // near it, never rise into it from below
 const fl=ai.dm==='scoop'?.7:1.4;if(d.p.y<fl&&d.v.y<0)a.y+=-d.v.y*2+(fl-d.p.y)*8;
 steer(d,D,a,look)}
// acceleration -> thrust and attitude, as botControl does (same limits)
function steer(d,D,a,look){const s=d.team?1:-1;
 const ah=Math.hypot(a.x,a.z),hm=D.ah??55;if(ah>hm){a.x*=hm/ah;a.z*=hm/ah}a.y=Math.max(a.y,-G*.85,Math.min(ah,hm)/1.7-G);  // never thrust downward or tip past ~60 degrees (it has to stay under the ball): lift is added rather than steering lost
 const lim=Math.min(1,D.thr*BOTV),cap=BTHR*lim;if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(d.v,DL+DQ*d.v.length());const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(d.q).dot(T),F=d.fl;d.boosting=false;d.thr=cl(Math.max(need/(THR*F.thr),0)**(1/(TE*F.te)),0,lim)*cl((al-.1)/.6,.05,1);
 const lk=_lk.copy(look);lk.y=0;if(lk.lengthSq()<1e-4)lk.set(0,0,s);lk.normalize();attitude(d,T,lk,D.att,D.rate,.6)}
// the Dribbler's teammates stay out of its way: the keeper hovers in its goal mouth, the other holds a spot behind the play; neither touches the ball
export function dribbleSupport(d,D){const ai=d.ai,s=d.team?1:-1,own=-s*HL;ai.dm='support';
 if(d.role==='keep')_q.set(cl(ball.p.x*.3,-12,12),7,own+s*6);else{_q.set(ball.p.x>0?-25:25,9,cl(ball.p.z-s*35,-HL+20,HL-20))}
 const r=_r.subVectors(d.p,ball.p);if(r.length()<BR+6)_q.addScaledVector(r.normalize(),8);  // never in the ball's way
 const a=_a.subVectors(_q,d.p).multiplyScalar(1.5).clampLength(0,D.vmax*BOTV*.6).sub(d.v).multiplyScalar(3);steer(d,D,a,_lk.subVectors(ball.p,d.p))}
