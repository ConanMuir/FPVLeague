// ---------- the Freestyler bot (DIFF[].fs): pop chains, air dribbles, double taps and spin shots, on repeat ----------
// A show-off and a gauge for the mechanics, not a winner. It gets the ball the Dribbler's way (bots/dribble.js: scoop, catch, carry),
// then on the carry it places the ball on its top where the pop it wants comes from (the pop table below, measured from the real
// pop: the direction comes from the pop axis and where the ball sits inside the motors), and fires it on purpose:
//   lob   pitch-forward pop with the ball at the back: ~17 up, ~16 forward. A chain step: it chases, catches and pops again.
//   up    roll pop with the ball on the far side: ~32 up, ~14 sideways. Sets up an air dribble.
//   side  roll pop with the ball centred: ~22 sideways, ~16 up. Beats a defender in front.
//   drive pitch-forward pop with the ball at the front: ~11 up, ~25 forward. The goal shot.
// Finishers after a chain: drive; an air dribble (keep bumping the ball up off the top toward the goal; every top touch re-earns
// a pop, so it can pop again in the air); a double tap (from 16-32 m out, a lob pop into the backboard, then a strike straight through the rebound); a spin
// shot (a planned strike cut across the ball so contact friction spins it). Same thrust and flight limits as everyone.
import {GH,GW,HL,UP,V3,cl} from '../config/constants.js';
import {BG,BOTV,BR,G} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
import {onHit} from '../physics/world.js';
import {dribble,steer,topOf} from './dribble.js';
import {plan,strikeV} from './league.js';
const _v=new V3(),_t=new V3(),_f=new V3(),_r=new V3(),_q=new V3(),_a=new V3(),_lk=new V3();
// pop moves: stick [roll, pitch, yaw] and where the ball should sit on the top, in body coordinates (x right, z back), as a fraction of the motor offset
const MOVES={hop:{st:[0,.9,0],x:0,z:0},lob:{st:[0,.9,0],x:0,z:.6},drive:{st:[0,.9,0],x:0,z:-.6},upR:{st:[.9,0,0],x:-.6,z:0},upL:{st:[-.9,0,0],x:.6,z:0},sideR:{st:[.9,0,0],x:0,z:0},sideL:{st:[-.9,0,0],x:0,z:0}};
const FIN=[['drive',3],['air',3],['spin',2]],FIN_TAP=[['tap',5],['drive',1],['air',2],['spin',1]];  // inside the double-tap window (16-32 m out: a lob from there comes down above the crossbar) it mostly goes for the backboard
const pick=w=>{let t=0;for(const x of w)t+=x[1];let r=Math.random()*t;for(const x of w)if((r-=x[1])<=0)return x[0];return w[0][0]};
function motorOf(d){return d.popM?Math.max(...d.popM.map(m=>Math.hypot(m[0],m[2])))/Math.SQRT2:1}
// choose the next pop on a carry: chain steps until the chain is long enough and the goal is in reach, then a finisher
function choose(d,gl,D){const ai=d.ai;if(!(ai.cht>0))ai.cht=1+Math.floor(Math.random()*2);
 const s=d.team?1:-1;let foe=null;for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0&&(o.p.z-d.p.z)*s>0&&(o.p.z-d.p.z)*s<30&&Math.abs(o.p.x-d.p.x)<12)foe=o;
 if(foe){ai.fin=null;return foe.p.x>d.p.x===(s<0)?'sideL':'sideR'}  // a defender ahead: pop it past him, away from his side
 if(gl<(D.tapR??80)&&gl>(D.tapA??16)&&Math.random()<(D.tapP??0)){ai.fin='tap';return 'lob'}  // a double tap: carry it into the window, then lob it at the backboard
 const tapW=gl>(D.tapA??16)&&gl<(D.tapB??32);
 if((ai.ch||0)<ai.cht||gl>150){ai.fin=null;return gl<55&&Math.random()<(D.upP??.4)||Math.random()<(D.upA??0)?(Math.random()<.5?'upR':'upL'):Math.random()<(ai.hopP??.6)?'hop':'lob'}
 ai.fin=pick(tapW?FIN_TAP:FIN);return ai.fin==='drive'?'drive':ai.fin==='air'?(Math.random()<.5?'upR':'lob'):'lob'}
// on a carry (called from dribble()): hold the ball where the chosen pop needs it, climb to working height, then pop
export function fsCarry(d,D,dt,a,g,gl){const ai=d.ai;if(!ai.mv)ai.mv=choose(d,gl,D);if(ai.hopP==null)ai.hopP=D.hopP??.6;const M=MOVES[ai.mv],k=motorOf(d);
 // body axes, flattened: the quad faces the goal while it carries (look), so x is to its right and z behind it
 const fx=_f.set(0,0,-1).applyQuaternion(d.q);fx.y=0;fx.normalize();const rx=_r.crossVectors(fx,UP).normalize();
 const off=_q.copy(rx).multiplyScalar(M.x*k).addScaledVector(fx,-M.z*k);  // where the ball should be relative to the quad
 const ex=ball.p.x-off.x-d.p.x,ez=ball.p.z-off.z-d.p.z,ke=D.ke??4,kv=D.kv??8;
 const tap=ai.fin==='tap',vc=tap?12:cl(gl/12,4,D.dv||10),ox=(g.x*vc-ball.v.x)*.8,oz=(g.z*vc-ball.v.z)*.8;
 a.x=kv*(ball.v.x+ke*ex-d.v.x)+ox;a.z=kv*(ball.v.z+ke*ez-d.v.z)+oz;const ah=Math.hypot(a.x,a.z);const am=D.am??40;if(ah>am){a.x*=am/ah;a.z*=am/ah}
 const cy=D.cy||9;a.y=6*(cl((cy-d.p.y)*1.5,-4,5)-d.v.y);
 const up=_t.set(0,1,0).applyQuaternion(d.q).y,ready=Math.hypot(ex,ez)<(D.rdE??.3)*k&&up>(D.rdU??.93)&&d.p.y>cy-(D.rdY??1)&&fx.dot(g)>.85;
 if(d.popC>0&&!(d.popT>0)&&ai.ct>(D.hold??.5)&&(!tap||gl<(D.tapB??32)||ai.ct>4)&&(ready||ai.ct>(tap?4:2.5))&&d.tryPop(M.st)){  // fire (after 2.5 s on the top it goes anyway: it keeps trying); a double tap waits until it is in the window
  ai.ch=(ai.ch||0)+1;ai.ct=0;ai.last=ai.mv;ai.mv=null;
  if(ai.fin==='tap'){ai.fm='follow';ai.fmt=4.5;ai.wall=false}  // the lob is the first touch of a double tap: it should come off the backboard
  else if(ai.fin==='air'||ai.fin==='spin'){ai.fm=ai.fin;ai.fmt=ai.fin==='air'?5:3;ai.at=0}
  else if(!ai.fin&&Math.random()<(D.airP??.35)){ai.fm='air';ai.fmt=4;ai.at=0}  // a chain step can turn into an air dribble
  if(ai.fin)ai.cht=0}}
// air dribble: under the ball and a little behind it (away from the goal), meet it rising so it bounces up and on toward the goal;
// every top touch earns a pop again, and near the goal it spends one as a drive
function airDribble(d,D,dt){const ai=d.ai,top=topOf(d),H0=top+BR,r=_v.subVectors(ball.p,d.p),hd=Math.hypot(r.x,r.z),s=d.team?1:-1;
 if(ball.p.y<BR+1||hd>6||r.y<H0-.5)return false;
 const g=_t.set(0,0,s*(HL+4)).sub(ball.p);g.y=0;const gl=g.length()||1;g.divideScalar(gl);
 const k=motorOf(d),bx=ball.p.x+ball.v.x*.05-g.x*.35*k,bz=ball.p.z+ball.v.z*.05-g.z*.35*k,a=_a;
 a.x=16*(ball.v.x+4*(bx-d.p.x)-d.v.x)+g.x*6;a.z=16*(ball.v.z+4*(bz-d.p.z)-d.v.z)+g.z*6;
 const gap=r.y-H0,bump=hd<1.2?cl(gap*3,3,D.bump??11):-2;a.y=12*(ball.v.y+bump-d.v.y)+(d.p.y<2?(2-d.p.y)*20:0);  // close fast when centred: a bump, not a catch
 if(ai.tch)ai.at=(ai.at||0)+1;
 if(d.popC>0&&!(d.popT>0)&&gap<.6&&hd<1&&(gl<70||ai.at>=4)){d.tryPop(MOVES.drive.st);ai.ch=(ai.ch||0)+1;ai.fm=null}  // the finish: a drive pop out of the air dribble
 steer(d,D,a,g);return true}
// spin shots with the shot planner (bots/league.js plan/strikeV): the last 0.4 s cut across the ball so the contact slides and spins it
function strike(d,D,dt){const ai=d.ai;if(!ai.C){ai.C=new V3();ai.n=new V3();ai.P=new V3();ai.C0=new V3();ai.n0=new V3();ai.P0=new V3()}
 if((ai.pt=(ai.pt||0)-dt)<=0){ai.pt=.05;const s=d.team?1:-1;ai.fsAim=true;
  if(ai.fm==='tap'){ai.gx=cl(ball.p.x*.3,-GW/3,GW/3);ai.gy=GH+9}else{ai.gx=cl(ball.p.x*.4,-GW/2+6,GW/2-6);ai.gy=GH*.4}
  plan(d,D);ai.fsAim=false;ai.spinS=ai.spinS||(Math.random()<.5?-1:1)}
 const vm=D.vmax*BOTV;let vd;
 if(ai.al>.4){vd=strikeV(d,D,dt);if(ai.fm==='spin'&&ai.tt<.4){const lat=_t.crossVectors(ai.n,UP);if(lat.lengthSq()>.01){const sp=Math.max(vd.length(),vm*.85),c=D.cutA??.75;vd.copy(ai.n).multiplyScalar(sp*Math.cos(c)).addScaledVector(lat.normalize(),ai.spinS*sp*Math.sin(c))}}}  // a cut: come in at an angle to the contact normal, so the frame slides across the ball and spins it
 else{vd=_v.copy(ai.C).addScaledVector(ai.n,-10).sub(d.p).multiplyScalar(2).clampLength(0,vm);vd.y+=ai.al<0?4:0}
 const a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);if(d.p.y<1.6&&d.v.y<0)a.y+=-d.v.y*2+(1.6-d.p.y)*8;
 if(ai.tch){ai.fm=null;ai.spinS=0}
 steer(d,D,a,_lk.subVectors(ball.p,d.p));return true}
export function freestyle(d,D,dt){const ai=d.ai;
 // did this quad touch the ball since its last tick? (counted by the onHit listener below)
 ai.tch=(ai.hitN||0)!==(ai.hitS||0);ai.hitS=ai.hitN;
 if(ball.p.y<BR+.4&&ball.c&&!(ai.fm==='follow'))ai.ch=0;  // the ball touched the floor: the chain is over
 if(ai.fm&&(ai.fmt-=dt)<=0)ai.fm=null;
 if(ball.p.y<BR+.4&&ball.c)ai.epi=false;
 else if(!ai.fm&&!ai.epi&&ball.p.y>6&&ball.v.y<0&&!(d.popT>0)){ai.epi=true;const s=d.team?1:-1,gl=Math.hypot(ball.p.x,s*HL-ball.p.z),hd=Math.hypot(ball.p.x-d.p.x,ball.p.z-d.p.z);
  if(gl<150&&hd>15&&ball.v.y<0&&Math.random()<.6){ai.fm='spin';ai.fmt=3}}  // a loose ball in the air it can't get under in time: play a trick shot on it instead
 if(d.popT>0||!ai.fm){dribble(d,D,dt);return}
 if(ai.fm==='air'){if(!airDribble(d,D,dt))dribble(d,D,dt);return}
 if(ai.fm==='follow'&&!ai.wall){const s=d.team?1:-1;if(ball.c&&Math.abs(ball.p.z)>HL-BR-2&&ball.p.y>GH*.5){ai.wall=true;ai.fmt=2.5}  // off the backboard: now strike the rebound
  else{_q.set(cl(ball.p.x,-GW/2,GW/2),D.tapH??17,s*(HL-(D.tapW??10)));const a=_a.subVectors(_q,d.p).multiplyScalar(2).clampLength(0,D.vmax*BOTV).sub(d.v).multiplyScalar(3);steer(d,D,a,_lk.subVectors(ball.p,d.p));return}}  // wait out in front of the goal for the rebound
 if(ai.fm==='follow'){  // the rebound comes back at it: go straight through it, from a little above when it is over the crossbar, so it goes back down into the goal
  if(ai.tch){ai.fm=null;dribble(d,D,dt);return}const vm=D.vmax*BOTV,s=d.team?1:-1;_q.copy(ball.p).addScaledVector(ball.v,.15);if(ball.p.y>GH-2)_q.y+=1.2;
  const side=(d.p.z-_q.z)*-s,lvl=Math.abs(d.p.y-_q.y);let vd;
  if(side<1.5||lvl>3.5){_t.copy(_q).setZ(_q.z-s*7);_t.y=Math.max(2,ball.p.y+ball.v.y*.4-BG*.08+.5);vd=_v.subVectors(_t,d.p).multiplyScalar(3).clampLength(0,vm).add(ball.v);vd.y=cl(vd.y,ball.v.y-12,ball.v.y+12)}  // first get level with it, on the field side, not shooting up past it
  else vd=_v.subVectors(_q,d.p).setLength(vm*.8);  // then go straight through it
  const a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);steer(d,D,a,_lk.subVectors(ball.p,d.p));return}
 strike(d,D,dt)}
onHit(e=>{if(e.type==='ball'&&e.d?.ai)e.d.ai.hitN=(e.d.ai.hitN||0)+1});
