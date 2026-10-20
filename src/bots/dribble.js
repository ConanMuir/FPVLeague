// ---------- the Dribbler bot (DIFF[].drib): a show-off for the carry and pop mechanics, not a winner ----------
// Its attacker scoops the ball off the floor (a low, nose-down run into its bottom half), gets under it and catches it on the top
// of the frame, carries it toward the enemy goal over the pop zone (ball and quad share gravity, so the ball takes the tilted top's
// acceleration and only drifts when their speeds differ), and spends the pop it earns toward the goal. Its teammates keep clear.
// Same flight model and thrust limits as everyone (the controller only chooses an acceleration, like botControl).
import {GW,H,HL,HW,QT,V3,cl} from '../config/constants.js';
import {BG,BOTV,BR,BTHR,DL,DQ,G,TE,THR} from '../config/tune.js';
import {attitude} from '../flight/attitude.js';
import {GS} from '../state.js';
import {ball} from '../physics/ball.js';
import {sdN,sdf} from '../physics/sdf.js';
import {PDT,PRED,PV,reachT} from './league.js';
import {fsCarry} from './freestyle.js';
const _rb=new V3(),_qi=new QT(),_r=new V3(),_a=new V3(),_T=new V3(),_u=new V3(),_g=new V3(),_q=new V3(),_v=new V3(),_lk=new V3(),_px=new V3();
// height of the top of this quad's parts above its centre (the ball rests at top + BR)
export function topOf(d){if(d._topLo!==d.lo){d._topLo=d.lo;d._top=Math.max(...d.lo.colliders.map(c=>c.pos[1]+(c.shape==='box'?c.size[1]:c.size[0])))}return d._top}
// the four pop directions as stick inputs [roll, pitch, yaw] and the body direction the ball leaves in
const PS=[[0,.9,0,0,0,-1],[0,-.9,0,0,0,1],[.9,0,0,1,0,0],[-.9,0,0,-1,0,0]];
export function dribble(d,D,dt){const ai=d.ai,s=d.team?1:-1,top=topOf(d),H0=top+BR,vm=D.vmax*BOTV;d.pops=true;
 const r=_r.subVectors(ball.p,d.p),hd=Math.hypot(r.x,r.z),g=_g.set(0,0,s*(HL+4)).sub(ball.p);g.y=0;const gl=g.length()||1;g.divideScalar(gl);
 const a=_a.set(0,0,0);let look=g;
 // on the top: measured along the frame's own axes, so a ball centred on a tilted quad counts (it sits off to the side of straight above)
 const rb=_rb.copy(r).applyQuaternion(_qi.copy(d.q).invert()),onTop=_u.set(0,1,0).applyQuaternion(d.q).y>.5&&rb.y>H0-.7&&rb.y<H0+.9&&Math.hypot(rb.x,rb.z)<(D.topR??1.4),grounded=ball.p.y<BR+.5&&Math.abs(ball.v.y)<3;
 if(onTop){  // carry: match the ball's velocity, pull back under it, speed both up toward the goal, then pop
  ai.dm='carry';ai.ct=(ai.ct||0)+dt;const vc=cl(gl/12,5,D.dv||10),o=_v.set(g.x*vc-ball.v.x,0,g.z*vc-ball.v.z).multiplyScalar(D.kg??1.2).clampLength(0,8);
  // the ball rides on the top: steer the quad's velocity toward the ball's (plus a pull back under it when it drifts off centre)
  if(D.fs){fsCarry(d,D,dt,a,g,gl);steer(d,D,a,look);if(ai.yw)d.wt.y=ai.yw;return}
  // centred means along the frame's up axis, not straight above it: a pop is only earned with the ball covering all four motors (flight/drone.js popZone).
  // Until it has one it holds the ball there and eases off the push toward the goal (og), so the ball settles on the centre.
  const U=_u.set(0,1,0).applyQuaternion(d.q),og=d.popC>0?1:D.og??.3,ux=U.x*H0*(D.cu??1),uz=U.z*H0*(D.cu??1);
  const ke=D.ke??2.5,kv=D.kv??4,amx=D.am??25;a.x=kv*(ball.v.x+ke*(ball.p.x-d.p.x-ux)-d.v.x)+o.x*og;a.z=kv*(ball.v.z+ke*(ball.p.z-d.p.z-uz)-d.v.z)+o.z*og;  // ball and quad share gravity, so on the tilted top the ball takes the quad's acceleration: o speeds both up toward the goal
  const ah=Math.hypot(a.x,a.z);if(ah>amx){a.x*=amx/ah;a.z*=amx/ah}a.y=6*(cl(((D.cy||3)-d.p.y)*1.5,-3,4)-d.v.y);
  if(d.popC>0&&!(d.popT>0)&&ai.ct>(D.hold??.6)){  // spend the pop toward the goal: the pop direction (pitch fwd/back, roll right/left) that points at it
   let best=null,bd=.55;for(const p of PS){_px.set(p[3],p[4],p[5]).applyQuaternion(d.q);_px.y=0;const l=_px.length();if(l<.5)continue;const k=_px.dot(g)/l;if(k>bd){bd=k;best=p}}
   if(best&&d.tryPop(best))ai.ct=0}}
 else{ai.ct=0;if(!grounded)ai.sct=0;let foe=null;const md=d.p.distanceToSquared(ball.p);for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0){const q=o.p.distanceToSquared(ball.p);if(q<49&&q<md){foe=o;break}}
  if(foe){  // someone else is on the ball: give them room (this bot is here to show the mechanics, not to fight for the ball) and shadow it
   ai.dm='wait';_q.subVectors(d.p,ball.p);_q.y=0;if(_q.lengthSq()<1)_q.set(1,0,0);_q.setLength(15).add(ball.p);_q.y=Math.max(6,ball.p.y);_v.subVectors(_q,d.p).multiplyScalar(2).clampLength(0,vm).add(ball.v);a.subVectors(_v,d.v).multiplyScalar(4)}
  else if(grounded&&hd<30){  // scoop: from behind (along its roll, or away from the goal when it is slow), skim in low (centre ~1 m up), nose down, into the bottom half of the ball: it leaves at ~45 degrees
   ai.dm='scoop';look=_lk.subVectors(ball.p,d.p);ai.sct=(ai.sct||0)+dt;const bs=Math.hypot(ball.v.x,ball.v.z),sw=sdf(ball.p.x,ball.p.y,ball.p.z);let sd=bs>5?_px.set(ball.v.x/bs,0,ball.v.z/bs):_px.copy(g);
   const wx=HW-Math.abs(ball.p.x),wz=HL-Math.abs(ball.p.z),near=D.wallR??20;  // how far the side and end walls are (the floor curves up into them)
   if(wx<near||wz<near&&Math.abs(ball.p.x)>GW/2){_u.set(wx<near?Math.sign(ball.p.x):0,0,wz<near&&Math.abs(ball.p.x)>GW/2?Math.sign(ball.p.z):0).normalize();sd=_px.copy(_u);ai.dm='wallrun'}  // by a wall: run it up the wall from the field side (it comes back down to be caught)
   else if(sw>-BR-10){sdN(ball.p,_u);_u.y=0;if(_u.lengthSq()>.04)sd=_px.copy(_u).normalize()}
   if(ai.sct>6)ai.sct=-1.5;  // stuck: back off to the field side for a moment, then try again
   if(ai.sct<0){_q.copy(ball.p).addScaledVector(sd,-26);_q.y=6;_v.subVectors(_q,d.p).multiplyScalar(2).clampLength(0,vm);a.subVectors(_v,d.v).multiplyScalar(4);steer(d,D,a,look);return}
   let run=D.sbk??24,room=roomBehind(ball.p,sd);if(room<9){sd.negate();ai.dm='wallrun';room=roomBehind(ball.p,sd)}run=Math.min(run,Math.max(8,room));  // no room for the run-up (a wall behind): run it into that wall instead
   _q.copy(ball.p).addScaledVector(sd,-run);_q.y=D.sy??1.4;const behind=_v.subVectors(d.p,ball.p).dot(sd)<-3,rv=Math.hypot(d.v.x-ball.v.x,d.v.z-ball.v.z);
   if(behind&&_q.distanceTo(d.p)<3&&rv<6&&d.p.y<(D.sy??1.4)+.5||ai.sc>0){if(!(ai.sc>0))ai.sc=3.5;ai.sc-=dt;_v.subVectors(ball.p,d.p);_v.y=0;_v.normalize();  // accelerate all the way in, so the quad is nose-down when it meets the ball
    a.copy(_v).multiplyScalar(D.sa??12);_u.subVectors(ball.v,d.v);_u.y=0;a.addScaledVector(_u.addScaledVector(_v,-_u.dot(_v)),4);a.y=Math.max(-5,8*((D.sy??1.4)-d.p.y)-4*d.v.y)}  // gentle on height: thrust goes into the run
   else{const l=_q.distanceTo(d.p);_v.subVectors(_q,d.p).multiplyScalar(2).clampLength(0,Math.min(vm,Math.sqrt((D.sdc??40)*l))).add(ball.v);_v.y=(_q.y-d.p.y)*3;a.subVectors(_v,d.v).multiplyScalar(4)}}  // braking profile: arrive at its speed
  else{ai.sc=0;ai.dm='catch';
   if(hd<(D.nr??10)&&r.y>H0-.3&&(r.y<H0+8||ball.v.y<-4&&r.y<H0+(D.nh??12)||D.fs)){  // under it: centre on it and rise into it slowly (closing at a few m/s), so it lands soft on the top
    if(r.y>H0+.3||hd<1.2||D.apex){const kc=D.kc??2.5,kn=D.kn??10,ex=ball.p.x+ball.v.x*.05-d.p.x,ez=ball.p.z+ball.v.z*.05-d.p.z,el=Math.hypot(ex,ez)||1,cs=D.apex?Math.min(kc,Math.sqrt((D.brk??20)/el)):kc;a.x=kn*(ball.v.x+cs*ex-d.v.x);a.z=kn*(ball.v.z+cs*ez-d.v.z)}  // apex: the closing speed tapers like a braking run, so it arrives under the ball at the ball's own speed  // close in at a speed that falls to the ball's own as the gap closes (no overshoot)
    else{const k=Math.max(0,BR+1.6-hd)*20/(hd||1);a.x=10*(ball.v.x-d.v.x)-r.x*k;a.z=10*(ball.v.z-d.v.z)-r.z*k}  // ball not yet above the top: keep off its side (a side touch knocks it away) and wait under its path
    const gap=r.y-H0;let vy=ball.v.y*(D.cm??.6)+cl(gap*2.5,1,gap>6?D.cl??4:4)*(hd<1.5?1:-.5);
    if(D.apex){if(ball.v.y>1){const ta=ball.v.y/BG,dy=ball.p.y+ball.v.y*ta*.5-H0-(D.apG??.25)-d.p.y;vy=Math.sign(dy)*Math.min(Math.sqrt(2*(D.apA??22)*Math.abs(dy)),Math.abs(dy)/Math.max(ta,.15)*1.5)}  // rising: climb to just under its apex on a braking profile and wait there
     else vy=gap>(D.apW??5)?0:ball.v.y*(D.apM??.95)+cl(gap*2,.5,5)}  // falling: hover until it is close, then drop with it and close gently: near-matched speeds at contact
    if(D.apex&&hd>1.2&&r.y<H0+1.5)vy=Math.min(vy,(ball.p.y-H0-1-d.p.y)*4);  // not under it yet: stay low enough to pass beneath it
    a.y=(D.apex?16:12)*(vy-d.v.y)+(d.p.y<1.5?(1.5-d.p.y)*20:0);if(D.apex)a.y=Math.min(a.y,D.ayM??40)}  // apex: leave thrust for chasing it sideways  // follow its fall only partly: a soft landing, and lift left to steer with
   else{  // on the way: be about 2.5 m under its path where it comes down through a comfortable height, moving with it
    const acc=BTHR*D.thr*.7;let tt=.6,ok=false;for(let pass=0;pass<2&&!ok;pass++)for(let i=3;i<PRED.length;i+=2){const P=PRED[i];if(PV[i].y>0||P.y<H0+2+PV[i].y*PV[i].y/(D.rm??50)||P.y>(pass?40:16))continue;_q.copy(P);_q.y=Math.max(P.y-H0-2.5,1.5);const t=(i+1)*PDT;if(reachT(d,_q,acc,vm)*1.15+.2<=t){tt=t;ok=true;_v.copy(PV[i]);break}}
    if(!ok){_q.copy(ball.p).addScaledVector(ball.v,.25);_q.y=Math.max(ball.p.y-H0-3,1.5);_v.copy(ball.v);tt=.5}  // nowhere comfortable: stay under it, below it, and let it come down
    const l=_q.distanceTo(d.p),vd=_u.subVectors(_q,d.p).divideScalar(cl(tt*.5,.25,.7)).clampLength(0,Math.min(vm,Math.sqrt(60*l)+Math.hypot(_v.x,_v.z)));if(hd<10)vd.y=Math.min(vd.y,(ball.p.y-H0-2-d.p.y)*3+ball.v.y);a.subVectors(vd,d.v).multiplyScalar(D.kd)}}}  // near it, never rise into it from below
 const fl=ai.dm==='scoop'?.7:1.4;if(d.p.y<fl&&d.v.y<0)a.y+=-d.v.y*2+(fl-d.p.y)*8;
 steer(d,D,a,look)}
// acceleration -> thrust and attitude, as botControl does (same limits)
// how far back from P (against dir) the field goes before the floor starts curving up into a wall
function roomBehind(P,dir){const m=10;let t=1e9;if(dir.x>1e-3)t=Math.min(t,(P.x+HW-m)/dir.x);else if(dir.x<-1e-3)t=Math.min(t,(HW-m-P.x)/-dir.x);
 if(dir.z>1e-3)t=Math.min(t,(P.z+HL-m)/dir.z);else if(dir.z<-1e-3)t=Math.min(t,(HL-m-P.z)/-dir.z);return t}
export function steer(d,D,a,look){if(d.p.y>H-10&&a.y>-5&&!d.ai.roof)a.y=-5;  // never chase the ball into the roof (a ceiling play, bots/freestyle.js, means to)
 const sw=sdf(d.p.x,d.p.y,d.p.z);if(sw>-2.2){sdN(d.p,_px);if(_px.y>-.9){const vn=d.v.dot(_px);a.addScaledVector(_px,-(sw+2.2)*25-Math.max(0,vn)*4)}}  // off walls and ramps (not the floor): a frame rubbing a curved wall gets stuck there
 const ah=Math.hypot(a.x,a.z),hm=D.ah??55;if(ah>hm){a.x*=hm/ah;a.z*=hm/ah}a.y=Math.max(a.y,-G*.85,Math.min(ah,hm)/1.7-G);  // never thrust downward or tip past ~60 degrees (it has to stay under the ball): lift is added rather than steering lost
 fly(d,D,a,look)}
// thrust and attitude for a wanted acceleration a (any direction: upside down too), same thrust cap as everyone
export function fly(d,D,a,look){const s=d.team?1:-1,lim=Math.min(1,D.thr*BOTV),cap=BTHR*lim;if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(d.v,DL+DQ*d.v.length());const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(d.q).dot(T),F=d.fl;d.boosting=false;d.thr=cl(Math.max(need/(THR*F.thr),0)**(1/(TE*F.te)),0,lim)*cl((al-.1)/.6,.05,1);
 const lk=_lk.copy(look);lk.y=0;if(lk.lengthSq()<1e-4)lk.set(0,0,s);lk.normalize();attitude(d,T,lk,D.att,D.rate,.6)}
// the Dribbler's teammates stay out of its way: the keeper hovers in its goal mouth, the other holds a spot behind the play; neither touches the ball
export function dribbleSupport(d,D){const ai=d.ai,s=d.team?1:-1,own=-s*HL;ai.dm='support';
 if(d.role==='keep')_q.set(cl(ball.p.x*.3,-12,12),7,own+s*6);else{_q.set(ball.p.x>0?-25:25,9,cl(ball.p.z-s*35,-HL+20,HL-20))}
 const r=_r.subVectors(d.p,ball.p);if(r.length()<BR+6)_q.addScaledVector(r.normalize(),8);  // never in the ball's way
 const a=_a.subVectors(_q,d.p).multiplyScalar(1.5).clampLength(0,D.vmax*BOTV*.6).sub(d.v).multiplyScalar(3);steer(d,D,a,_lk.subVectors(ball.p,d.p))}
