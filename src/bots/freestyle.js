// ---------- the Freestyler bot (DIFF[].fs): pop chains, air dribbles, double taps and spin shots, on repeat ----------
// The top level and the gauge for the mechanics; like the Dribbler it plays this only while the ball is its own (bots/league.js possess).
// It gets the ball the Dribbler's way (bots/dribble.js: scoop, catch, carry),
// then on the carry it holds the ball centred until it earns the pop (only a ball covering all four motors earns one), places it on
// its top where the pop it wants comes from (the pop table below, measured from the real pop: the direction comes from the pop axis
// and where the ball sits inside the motors), and fires it on purpose:
//   lob   pitch-forward pop with the ball at the back: ~17 up, ~16 forward. A chain step: it chases, catches and pops again.
//   up    roll pop with the ball on the far side: ~32 up, ~14 sideways. Sets up an air dribble.
//   side  roll pop with the ball centred: ~22 sideways, ~16 up. Beats a defender in front.
//   drive pitch-forward pop with the ball at the front: ~11 up, ~25 forward. The goal shot.
// Finishers after a chain: drive; an air dribble (keep bumping the ball up off the top toward the goal; every top touch re-earns
// a pop, so it can pop again in the air); a double tap (from 16-32 m out, a lob pop into the backboard, then a strike straight through the rebound); a spin
// pop (yaw flat out under the ball so the frame rubs it up to 10+ rad/s, then pop it; also a chain step). Near a side wall: a wall feed (pop it
// at the wall), and high by the wall a wall pop (pop it off the wall toward the middle). A loose ball in the air gets a brush (a planned strike
// moved to graze its side). Same thrust and flight limits as everyone.
import {GH,GW,H,HL,HW,UP,V3,cl} from '../config/constants.js';
import {hyp2} from '../core/hypot.js';
import {BG,BOTV,BR,G} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
import {onEv} from '../core/events.js';
import {dribble,fly,steer,topOf} from './dribble.js';
import {PRED,PV,plan,strikeV} from './league.js';
const _v=new V3(),_t=new V3(),_f=new V3(),_r=new V3(),_q=new V3(),_a=new V3(),_lk=new V3();
// pop moves: stick [roll, pitch, yaw] and where the ball should sit on the top, in body coordinates (x right, z back), as a fraction of the motor offset
const MOVES={hop:{st:[0,.9,0],x:0,z:0},lob:{st:[0,.9,0],x:0,z:.6},drive:{st:[0,.9,0],x:0,z:-.6},upR:{st:[.9,0,0],x:-.6,z:0},upL:{st:[-.9,0,0],x:.6,z:0},sideR:{st:[.9,0,0],x:0,z:0},sideL:{st:[-.9,0,0],x:0,z:0},hopB:{st:[0,-.9,0],x:0,z:0}};
const FIN=[['drive',3],['air',3],['spin',3]],FIN_TAP=[['tap',5],['drive',1],['air',2],['spin',1]];  // inside the double-tap window (16-32 m out: a lob from there comes down above the crossbar) it mostly goes for the backboard
const pick=w=>{let t=0;for(const x of w)t+=x[1];let r=Math.random()*t;for(const x of w)if((r-=x[1])<=0)return x[0];return w[0][0]};
function motorOf(d){return d.popM?Math.max(...d.popM.map(m=>Math.hypot(m[0],m[2])))/Math.SQRT2:1}
// choose the next pop on a carry: chain steps until the chain is long enough and the goal is in reach, then a finisher
function choose(d,gl,D){const ai=d.ai;ai.swt=0;if(!(ai.cht>0))ai.cht=1+Math.floor(Math.random()*2);
 const s=d.team?1:-1;let foe=null;for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0&&(o.p.z-d.p.z)*s>0&&(o.p.z-d.p.z)*s<30&&Math.abs(o.p.x-d.p.x)<12)foe=o;
 if(foe){ai.fin=null;return foe.p.x>d.p.x===(s<0)?'sideL':'sideR'}  // a defender ahead: pop it past him, away from his side
 if(HW-Math.abs(d.p.x)<(D.ceR??40)&&gl>(D.ceA??40)&&gl<(D.ceB??170)&&Math.random()<(D.ceP??.15)){ai.fin='ceil';return 'hop'}  // a ceiling play: carry it straight up beside the wall onto the ceiling, drop with it and shoot
 if(HW-Math.abs(d.p.x)<(D.wpR??40)&&Math.random()<(D.wpP??.35)){ai.fin='wall';return 'hop'}  // a wall feed: pop it at the side wall, take it high off the wall and pop it back off toward the middle (the wall pop, below)
 if(gl<(D.tapR??80)&&gl>(D.tapA??16)&&Math.random()<(D.tapP??0)){ai.fin='tap';return 'lob'}  // a double tap: carry it into the window, then lob it at the backboard
 const tapW=gl>(D.tapA??16)&&gl<(D.tapB??32);
 if((ai.ch||0)<ai.cht||gl>150){ai.fin=null;ai.spc=0;if(Math.random()<(D.spP??.3)){ai.fin='spin';ai.spc=1;return 'hop'}return gl<55&&Math.random()<(D.upP??.4)||Math.random()<(D.upA??0)?(Math.random()<.5?'upR':'upL'):Math.random()<(ai.hopP??.6)?'hop':'lob'}  // a chain step: a spin pop now and then (fsCarry), the rest hops, lobs and up pops
 ai.spc=0;ai.fin=pick(tapW?FIN_TAP:FIN);return ai.fin==='drive'?'drive':ai.fin==='air'?(Math.random()<.5?'upR':'lob'):ai.fin==='spin'?'hop':'lob'}
// on a carry (called from dribble()): hold the ball where the chosen pop needs it, climb to working height, then pop
export function fsCarry(d,D,dt,a,g,gl){const ai=d.ai;if(!ai.mv)ai.mv=choose(d,gl,D);ai.yw=0;if(ai.hopP==null)ai.hopP=D.hopP??.6;const k=motorOf(d);
 // body axes, flattened: the quad faces the goal while it carries (look), so x is to its right and z behind it
 const fx=_f.set(0,0,-1).applyQuaternion(d.q);fx.y=0;fx.normalize();const rx=_r.crossVectors(fx,UP).normalize();
 const ws=Math.sign(d.p.x)||1,wx=HW-Math.abs(d.p.x),ce=ai.roof=ai.fin==='ceil',wh=!ce&&wx<(D.wpN??18)&&d.p.y>(D.wpY??9),wp=ai.fin==='wall'||wh;
 if(wp){let best=-2;for(const[m,x,z]of[['hop',fx.x,fx.z],['hopB',-fx.x,-fx.z],['sideR',rx.x,rx.z],['sideL',-rx.x,-rx.z]]){const k2=(wh?-ws:ws)*x;if(k2>best){best=k2;ai.mv=m}}}  // high by a side wall: the pop that points off it, toward the middle (a wall pop); a wall feed: the pop that sends it to the wall
 const M=MOVES[ai.mv],pk=d.popC>0?k:k*(D.pk0??.5);  // a pop is only earned with the ball centred over all four motors (flight/drone.js popZone): hold it centred until then, then move it where the pop needs it
 const off=_q.copy(rx).multiplyScalar(M.x*pk).addScaledVector(fx,-M.z*pk);  // where the ball should be relative to the quad
 const ex=ball.p.x-off.x-d.p.x,ez=ball.p.z-off.z-d.p.z,ke=D.ke??4,kv=D.kv??8;
 const tap=ai.fin==='tap',vc=tap?12:cl(gl/12,4,D.dv||10);const ox=((ce?0:g.x*vc)-ball.v.x)*.8,oz=((ce?0:g.z*vc)-ball.v.z)*.8;
 a.x=kv*(ball.v.x+ke*ex-d.v.x)+ox;a.z=kv*(ball.v.z+ke*ez-d.v.z)+oz;const ah=hyp2(a.x,a.z);const am=D.am??40;if(ah>am){a.x*=am/ah;a.z*=am/ah}
 const cy=ce?H-2*BR-topOf(d)+.2:wh?Math.max(D.cy||9,d.p.y-1):D.cy||9;a.y=6*(cl((cy-d.p.y)*1.5,-4,ce?D.ceV??14:5)-d.v.y);  // high by the wall it stays up there; a ceiling play climbs until the ball touches the ceiling
 const up=_t.set(0,1,0).applyQuaternion(d.q).y,ready=hyp2(ex,ez)<(D.rdE??.3)*k&&up>(D.rdU??.93)&&d.p.y>cy-(D.rdY??1)&&(wp||fx.dot(g)>.85);
 if(ce){if(ai.ct>(D.ceT??14)){ai.fin=null;ai.mv=null}  // never got there: back to the chain
  else if(ball.p.y>H-BR-1.5&&Math.abs(ball.v.y)<1.5&&d.popC>0&&!(d.popT>0)){let m='hop',b=-2;for(const[k,x,z]of[['hop',fx.x,fx.z],['hopB',-fx.x,-fx.z],['sideR',rx.x,rx.z],['sideL',-rx.x,-rx.z]])if(x*g.x+z*g.z>b){b=x*g.x+z*g.z;m=k}
   if(d.tryPop(MOVES[m].st)){ai.roof=false;ai.fm='ceil';ai.fmt=5;ai.ceD=D.ceD??.5;ai.fin=null;ai.mv=null;ai.cht=0;ai.ch=(ai.ch||0)+1}}  // on the ceiling: pop it goalward off the ceiling (it comes down fast and forward), drop after it and strike it
  return}
 if(ai.fin==='spin'&&!wh&&ai.ct>(D.hold??.5)&&up>.8){ai.yw=(ai.spinS||(ai.spinS=Math.random()<.5?-1:1))*(D.spinW??15);ai.swt=(ai.swt||0)+dt;  // a spin shot: yaw flat out under the ball, so the frame rubs it up to its own spin (bots/dribble.js applies the yaw)
  const L=-ai.spinS*(D.spinL??.3);if(d.popC>0&&!(d.popT>0)&&(Math.abs(ball.w.y)>=(D.spinR??10)||ai.swt>1))for(const[m,x,z]of[['hop',fx.x,fx.z],['hopB',-fx.x,-fx.z],['sideR',rx.x,rx.z],['sideL',-rx.x,-rx.z]])  // then, still turning, pop it (L: a little early, as the ball leaves a moment after the pop starts)
   if((x*g.x+z*g.z)*Math.cos(L)+(z*g.x-x*g.z)*Math.sin(L)>(D.spinA??.95)&&d.tryPop(MOVES[m].st)){ai.ch=(ai.ch||0)+1;ai.ct=0;ai.last=m;ai.mv=null;ai.yw=0;ai.swt=0;ai.spinS=0;if(!ai.spc)ai.cht=0;break}  // the moment one of the four pop directions sweeps past the goal
  return}
 if(d.popC>0&&!(d.popT>0)&&ai.ct>(D.hold??.5)&&(!tap||gl<(D.tapB??32)||ai.ct>4)&&(ready||wh||ai.ct>(tap?4:2.5))&&d.tryPop(M.st)){  // fire (after 2.5 s on the top it goes anyway: it keeps trying); a double tap waits until it is in the window
  ai.ch=(ai.ch||0)+1;ai.ct=0;ai.last=ai.mv;ai.mv=null;
  if(ai.fin==='tap'){ai.fm='follow';ai.fmt=4.5;ai.wall=false}  // the lob is the first touch of a double tap: it should come off the backboard
  else if(ai.fin==='air'){ai.fm='air';ai.fmt=5;ai.at=0}
  else if(!ai.fin&&(ai.last==='lob'||ai.last==='hop')&&Math.random()<(D.rsC??.25)){ai.fm='reset';ai.fmt=7;ai.rs=0;ai.rst=0}  // an up pop can set up a flip reset
  else if(!ai.fin&&Math.random()<(D.airP??.35)){ai.fm='air';ai.fmt=4;ai.at=0}  // a chain step can turn into an air dribble
  if(ai.fin)ai.cht=0}}
// air dribble: under the ball and a little behind it (away from the goal), meet it rising so it bounces up and on toward the goal;
// every top touch earns a pop again, and near the goal it spends one as a drive
function airDribble(d,D,dt){const ai=d.ai,top=topOf(d),H0=top+BR,r=_v.subVectors(ball.p,d.p),hd=hyp2(r.x,r.z),s=d.team?1:-1;
 if(ball.p.y<BR+1||hd>6||r.y<H0-.5)return false;
 const g=_t.set(0,0,s*(HL+4)).sub(ball.p);g.y=0;const gl=g.length()||1;g.divideScalar(gl);
 const k=motorOf(d),bx=ball.p.x+ball.v.x*.05-g.x*.35*k,bz=ball.p.z+ball.v.z*.05-g.z*.35*k,a=_a;
 a.x=16*(ball.v.x+4*(bx-d.p.x)-d.v.x)+g.x*6;a.z=16*(ball.v.z+4*(bz-d.p.z)-d.v.z)+g.z*6;
 const gap=r.y-H0,bump=hd<1.2?cl(gap*3,3,D.bump??11):-2;a.y=12*(ball.v.y+bump-d.v.y)+(d.p.y<2?(2-d.p.y)*20:0);  // close fast when centred: a bump, not a catch
 if(ai.tch)ai.at=(ai.at||0)+1;
 if(d.popC>0&&!(d.popT>0)&&gap<.6&&hd<1&&(gl<70||ai.at>=4)){d.tryPop(MOVES.drive.st);ai.ch=(ai.ch||0)+1;ai.fm=null}  // the finish: a drive pop out of the air dribble
 steer(d,D,a,g);return true}
// flip reset. The pop is this game's flip: it is earned by the ball touching the top of the frame centred over all four motors, in any attitude,
// and kept for 5 s (flight/drone.js, modes/step.js). So after spending its pop on an up pop it gets above the ball, turns upside down,
// drops onto it top first (earning a new pop in mid-air: the reset), rights itself behind the ball and spends that pop as a dodge into it
// toward the goal (a pitch-forward pop: a 12 m/s shove and the frame turning over through the ball). rs: 0 getting above it, 1 upside down
function flipReset(d,D,dt){const ai=d.ai,H0=topOf(d)+BR,s=d.team?1:-1,a=_a;
 const g=_lk.set(-ball.p.x,0,s*(HL+4)-ball.p.z);g.normalize();const r=_v.subVectors(ball.p,d.p),hd=hyp2(r.x,r.z);ai.rst=(ai.rst||0)+dt;
 if(ai.rs===0){if(ball.p.y<8||ai.rst>(D.rsT??4)){ai.fm=null;return false}
  let A=null;for(let k=1;k<PRED.length;k++)if(PV[k].y<=0){A=PRED[k];break}if(!A){ai.fm=null;return false}  // where it peaks: wait just above that
  const bh=hyp2(ball.v.x,ball.v.z),under=d.p.y<ball.p.y+(D.rsL??1);if(bh>3)_f.set(ball.v.z/bh,0,-ball.v.x/bh);else _f.set(g.z,0,-g.x);if(_f.x*(d.p.x-ball.p.x)+_f.z*(d.p.z-ball.p.z)<0)_f.negate();
  _q.copy(ball.p).addScaledVector(ball.v,.15).addScaledVector(_f,under?D.rsO??5:0);_q.y=(under?A.y:ball.p.y)+H0+(D.rsG??1.5);  // below it: climb 5 m to the side of its path (on the side the quad is on), never up into it; above it: over it
  const ey=_q.y-d.p.y;a.subVectors(_q,d.p).multiplyScalar(3).clampLength(0,D.vmax*BOTV);a.y=ball.v.y+cl(ey*3,-15,D.rsU??24);a.sub(d.v).multiplyScalar(6);a.y=Math.max(a.y,-G*.6);{const ah=hyp2(a.x,a.z),hm=(a.y+G)*1.5+4;if(ah>hm){a.x*=hm/ah;a.z*=hm/ah}}  // up past it at no more than 24 m/s relative (only upside down can it brake against the ball); it may tilt far to get over it
  const vr=Math.max(0,d.v.y-ball.v.y);if(hd<(D.rsH??9)&&-r.y>H0-.3-Math.min(5,vr*vr/(2*(D.rsP??100)*.6))&&-r.y<H0+15){ai.rs=1;ai.rst=0}  // nearly over it (allowing for the climb it has to stop): turn over and push down onto it
  fly(d,D,a,g);return true}
 if(ai.tch){ai.fm=null;if(d.popC>0){ai.fm='rsd';ai.fmt=D.rsF??4}return false}  // reset: now play the ball with the planned strike and spend the pop as a dodge into it (strike, below)
 if(ai.rst>(D.rsI??1.6)||r.y>2.5||d.p.y<10||ball.p.y<6){ai.fm=null;return false}  // upside down: it missed, or it is getting low
  const ay=d.v.y-ball.v.y>-cl(3*(-r.y-H0),D.rsV??6,30)*(hd<1.2?1:.25)?-(D.rsP??100):-(D.rsM??4);  // relative to the ball (both fall alike; upside down it can only push toward it, never brake): get it closing at 4 m/s, then hold that
  if(-r.y<H0+(D.rsC2??1.5)&&hd<4.6&&hd>.1)_q.set(ball.p.x-r.x/hd*4.6,0,ball.p.z-r.z/hd*4.6);else _q.copy(ball.p);  // not well above it yet: stay clear to the side (a tilted frame reaches lower)
  a.set(12*(_q.x-d.p.x)+7*(ball.v.x-d.v.x),0,12*(_q.z-d.p.z)+7*(ball.v.z-d.v.z));const ah=hyp2(a.x,a.z),hm=hd>1.2?D.rsW??30:-ay*.6;if(ah>hm){a.x*=hm/ah;a.z*=hm/ah}a.y=ay-BG;  // over it, tilting no more than ~30 deg so the top meets it
  fly(d,D,a,g);return true}  // the thrust points down along that, so the quad is upside down
// spin shots and double taps with the shot planner (bots/league.js plan/strikeV)
function strike(d,D,dt){const ai=d.ai;if(!ai.C){ai.C=new V3();ai.n=new V3();ai.P=new V3();ai.C0=new V3();ai.n0=new V3();ai.P0=new V3()}
 if((ai.pt=(ai.pt||0)-dt)<=0){ai.pt=.05;const s=d.team?1:-1;ai.fsAim=true;
  if(ai.fm==='tap'){ai.gx=cl(ball.p.x*.3,-GW/3,GW/3);ai.gy=GH+9}else{ai.gx=cl(ball.p.x*.4,-GW/2+6,GW/2-6);ai.gy=GH*.4}
  plan(d,D);ai.fsAim=false}
 const vm=D.vmax*BOTV;let vd;
 if(ai.al>.4&&ai.fm==='spin'){const lat=_t.crossVectors(ai.n,UP);lat.y=0;if(!ai.spinS)ai.spinS=Math.random()<.5?-1:1;lat.normalize().multiplyScalar(ai.spinS*(D.cutO??3.5));  // a brush: the planned strike, but its line moved 3.5 m to the side of the ball's centre,
  ai.C.add(lat);vd=strikeV(d,D,dt);ai.C.sub(lat)}  // so the edge of the frame grazes the ball at speed instead of hitting it square: the contact slides and spins it
 else if(ai.al>.4)vd=strikeV(d,D,dt);
 else{vd=_v.copy(ai.C).addScaledVector(ai.n,-10).sub(d.p).multiplyScalar(2).clampLength(0,vm);vd.y+=ai.al<0?4:0}
 const a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);if(d.p.y<1.6&&d.v.y<0)a.y+=-d.v.y*2+(1.6-d.p.y)*8;
 if(ai.fm==='rsd'&&d.popC>0&&!(d.popT>0)){const fx=_f.set(0,0,-1).applyQuaternion(d.q),r=_t.subVectors(ball.p,d.p),al=r.dot(fx),lat=Math.sqrt(Math.max(0,r.lengthSq()-al*al));  // after a flip reset: the dodge, once the ball is just ahead
  if(al>2&&al<(D.rsR??6.5)&&lat<1.8&&fx.y>-.5&&fx.y<.5&&d.tryPop(MOVES.drive.st))ai.fm=null}
 if(ai.tch){ai.fm=null;ai.spinS=0}
 steer(d,D,a,_lk.subVectors(ball.p,d.p));return true}
export function freestyle(d,D,dt){const ai=d.ai;
 // did this quad touch the ball since its last tick? (counted by the 'touch' listener below)
 ai.tch=(ai.hitN||0)!==(ai.hitS||0);ai.hitS=ai.hitN;
 if(ball.p.y<BR+.4&&ball.c&&!(ai.fm==='follow'))ai.ch=0;  // the ball touched the floor: the chain is over
 if(ai.fm&&(ai.fmt-=dt)<=0){ai.fm=null;ai.spinS=0}
 if(ball.p.y<BR+.4&&ball.c)ai.epi=false;
 else if(!ai.fm&&!ai.epi&&ball.p.y>6&&ball.v.y<0&&!(d.popT>0)){ai.epi=true;const s=d.team?1:-1,gl=hyp2(ball.p.x,s*HL-ball.p.z),hd=hyp2(ball.p.x-d.p.x,ball.p.z-d.p.z);
  if(gl<150&&hd>15&&ball.v.y<0&&Math.random()<.6){ai.fm='spin';ai.fmt=4}}  // a loose ball in the air it can't get under in time: play a trick shot on it instead
 if(!ai.fm&&ball.last===d&&!(d.popT>0)&&ball.p.y>4&&(D.tapF??1)&&(ai.tfT=(ai.tfT||0)-dt)<=0){ai.tfT=.1;const s=d.team?1:-1;  // its own touch (a pop or a shot) is going to hit the backboard: go for the second touch
  for(let i=3;i<125;i+=3){const P=PRED[i];if(P.z*s>HL-BR-2.5){if((P.y>GH+1||Math.abs(P.x)>GW/2+1)&&Math.abs(P.x)<GW*.8&&P.y<GH+28){ai.fm='follow';ai.fmt=4.5;ai.wall=false}break}}}  // above or beside the goal mouth, not in it
 if(d.popT>0||!ai.fm){dribble(d,D,dt);return}
 if(ai.fm==='reset'){if(!flipReset(d,D,dt))dribble(d,D,dt);return}
 if(ai.fm==='ceil'&&(ai.ceD-=dt)>0){const s=d.team?1:-1;_a.set(ball.p.x-d.p.x,0,-s*8).setLength(10);_a.y=-BG;steer(d,D,_a,_lk.set(0,0,s));return}  // the drop: fall away from the ceiling, back from the ball
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
onEv('touch',e=>{if(e.d?.ai)e.d.ai.hitN=(e.d.ai.hitN||0)+1});
