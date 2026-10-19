// one fixed simulation step (1/120 s): match clock, controls + flight model, the Rapier step (physics/world.js), guns, orbs,
// ball touches, drone-drone contact, goals, bot planning
import {tone} from '../audio/audio.js';
import {assignRoles,botControl,predict} from '../bots/league.js';
import {HL,V3,cl} from '../config/constants.js';
import {POP_T} from '../flight/drone.js';
import {emitEv} from '../core/events.js';
import {S} from '../config/settings.js';
import {BM,BR,DEMO,DRAD,KICK,PBG,PSM,TB} from '../config/tune.js';
import {humanControl} from '../input/input.js';
import {demolish,endMatch,goal,kickoff,startDemo,touchVerdict} from './match.js';
import {r2} from '../net/net.js';
import {ball,ballPre} from '../physics/ball.js';
import {llGoal,llStep,llTouch} from './longline.js';
import {ballTouch,droneTouch,physStep} from '../physics/world.js';
import {emit} from '../render/particles.js';
import {_ip,_lat,_t,_v,_w} from '../scratch.js';
import {GS,SB,auth} from '../state.js';
import {banner} from '../ui/hud.js';
import {ORBS} from '../world/orbs.js';
import {curMode,modeFlag,overlay} from './registry.js';
const _bh=new V3(),_pu=new V3(),_pc=new V3(),_pw2=new V3(),_pr=new V3(),_fr=new V3(),_fs=new V3(),_fc=new V3(),sst=x=>{x=cl(x,0,1);return x*x*(3-2*x)};
// event payloads (core/events.js), one reused object per type: listeners copy what they keep
const E_TOUCH={type:'ball',d:null,tag:'',speed:0,p:_bh,n:null,verdict:''},E_BUMP={type:'drone',d:null,tag:'',other:null,otherTag:'',speed:0},E_JUDGE={d:null,speed:0},
 E_BOUNCE={speed:0},E_COUNT={n:0},E_POP={d:null,p:_pc,n:null,r:0},E_ORB={d:null,big:false,p:null};
// The overlay that is on (the Calibration Lab) and the mode (modes/registry.js) hook in here: pre() may take the step over; then the mode's bot,
// pilot, droneTick and tick hooks, the allowGoals flag, and post(). GS.OBSON is the world (Highlands: no ball, guns), not the mode.
export function step(dt){const O=overlay();if(O&&O.pre&&O.pre(dt)){physStep(dt,false);return}const M=curMode();if(M.pre&&M.pre(dt)){physStep(dt,false);return}const A=auth();  // the Lab's rigs set the drone's state and training holds a waiting shot; Rapier moves it
 if(GS.state==='kickoff'){GS.stT-=dt;const n=Math.ceil(GS.stT);if(n!==GS.lastCount){GS.lastCount=n;if(!GS.demo){if(n>0){banner(n,'',.9);E_COUNT.n=n;emitEv('count',E_COUNT)}else{banner('GO!','',.6);E_COUNT.n=0;emitEv('count',E_COUNT)}}}if(A&&GS.stT<=0)GS.state='play'}
 else if(GS.state==='goal'){GS.stT-=dt;if(GS.stT<2.4)GS.timeScale=Math.min(1,GS.timeScale+dt*1.2);if(A&&GS.stT<=0){if(GS.endPending)endMatch();else kickoff()}}
 else if(GS.state==='end'){GS.stT-=dt;if(A&&GS.stT<=0){banner('');if(GS.net){GS.score=[0,0];GS.clock=S.len;GS.overtime=GS.endPending=false;kickoff()}else{startDemo();return}}}
 else if(GS.state==='play'&&!GS.demo&&A&&!M.free){if(!GS.overtime){GS.clock-=dt;if(GS.clock<=0){GS.clock=0;if(GS.score[0]===GS.score[1]){GS.overtime=true;banner('OVERTIME','',1.6)}else endMatch()}}else GS.clock+=dt}
 const frozen=GS.state==='kickoff',live=GS.state==='play'||GS.state==='kickoff';
 for(const d of GS.drones){if(d.remote)continue;if(d.dead>0){if((d.dead-=dt)<=0)d.spawn(true);continue}
  if(d.bot)(M.bot||botControl)(d,dt);else{humanControl(d,dt);if(M.pilot)M.pilot(d,dt)}if(frozen)continue;d.step(dt)}
 const simBall=!frozen&&live&&!GS.OBSON;if(simBall)ballPre(ball.v,dt);
 if(S.longline&&simBall&&!GS.net)llStep(dt);  // the long line pulls ball and quad (offline only for now)
 physStep(dt,simBall);  // moves every drone and the ball, resolves their contact with the map
 for(const d of GS.drones){if(d.remote||d.dead>0||frozen)continue;if(M.droneTick)M.droneTick(d,dt,A);
  if(SB())for(const p of ORBS)if(p.cd<=0&&d.boost<100&&d.p.distanceTo(p.p)<(p.big?2.6:1.8)+DRAD+1){d.boost=Math.min(100,d.boost+(p.big?PBG:PSM));p.cd=p.big?10:4;E_ORB.d=d;E_ORB.big=!!p.big;E_ORB.p=p.p;emitEv('orb',E_ORB);emit(p.p,0xffc640,p.big?60:24,p.big?14:9,.6);if(d===GS.player)tone(700,1400,.15,.08)}}
 for(const p of ORBS)p.cd-=dt;
 if(M.tick)M.tick(dt,A);
 if(simBall&&ball.hit>3){E_BOUNCE.speed=ball.hit;emitEv('bounce',E_BOUNCE)}  // the ball off the map (audio/sfx.js thuds and the crowd's near miss)
 if(!frozen)for(let i=0;i<GS.drones.length;i++){const a=GS.drones[i];if(a.dead>0)continue;
  let tb;if(live&&!a.remote&&!GS.OBSON&&(tb=ballTouch(a,_v))){const n=_v,pen=tb.pen,ib=1/BM,id=1/a.fl.mass;ball.p.addScaledVector(n,pen*ib/(ib+id));a.p.addScaledVector(n,-pen*id/(ib+id));
   // pop: the ball on the top of the quad, inside its four motors, earns (or refreshes) a pop; the faint ring shows when a new one is earned
   if((!a.bot||a.pops)&&!(a.popT>0)&&n.dot(_pu.set(0,1,0).applyQuaternion(a.q))>.75&&a.popZone(_pc.copy(ball.p).addScaledVector(n,-BR))){if(!(a.popC>0)){E_POP.d=a;E_POP.n=n;E_POP.r=BR*.75;emitEv('popEarn',E_POP)}a.popC=POP_T}
   // during a pop the spinning frame's own speed at the contact point counts, so where the ball meets the turning quad decides the pop
   const av=a.popT>0?_pw2.copy(a.w).applyQuaternion(a.q).cross(_pr.copy(ball.p).addScaledVector(n,-BR).sub(a.p)).add(a.v):a.v;
   // touch bounce: one smooth curve from soft (2 x Touch bounce) to lively (0.6) with hit speed, no dead zone
   const rv=_w.subVectors(ball.v,av).dot(n);if(rv<0){const pop=a.popT>0,hk=pop?cl((-rv-6)/30,0,1):sst(-rv/36),j=-(1+(pop?TB+(.6-TB)*hk:2*TB+(.6-2*TB)*hk)+a.fl.kick)*rv/(ib+id);ball.v.addScaledVector(n,j*ib*KICK);a.v.addScaledVector(n,-j*id);if(S.longline&&!GS.net)llTouch(a);  // a pop keeps the contact model it was tuned with
    // Rocket League's extra impulse, but along the contact normal: the ball leaves the way the face of your hitbox that hit it was facing.
    // (RL's own version runs along the car's centre line with the vertical squashed to 35%, tuned for a car on the ground; a drone hits from every angle.)
    if(!S.longline||GS.net){const aim=_ip.copy(n);  // long line: the ball hangs on the cable instead of being shoved and carried
    const u=BR/.93,rel=Math.min(_t.subVectors(av,ball.v).length(),46*u),sc=rel<=5*u?.65:rel<=23*u?.65-.1*(rel-5*u)/(18*u):.55-.25*(rel-23*u)/(23*u);ball.v.addScaledVector(aim,rel*sc*(pop?hk:sst(rel/12))*KICK);  // RL: 0.65 up to 500 uu/s, 0.55 at 2300, 0.30 at 4600 (uu scaled to this ball)
    // contact friction: the ball's surface rubs on the quad, so glancing hits spin it and a flat top carries it (chassis grip), instead of
    // dragging the ball's velocity toward the quad's. Solid sphere: tangential effective mass 1/m + R^2/I = 3.5/m. During a pop the frame grips the ball instead (above).
    if(a.popT>0){const gr=(1-hk)*.35*Math.min(2,a.fl.grip);_t.subVectors(ball.v,av);_t.addScaledVector(n,-_t.dot(n));ball.v.addScaledVector(_t,-gr)}  // pop: the spinning frame grips the ball and flings it with its surface speed
    else{const r=_fr.copy(n).multiplyScalar(-BR),sv=_fs.crossVectors(ball.w,r).add(ball.v).sub(av);sv.addScaledVector(n,-sv.dot(n));const sl=sv.length();
     if(sl>1e-4){sv.divideScalar(sl);const jt=Math.min((.15+.25*Math.min(2,a.fl.grip))*j,sl/(3.5*ib+id));ball.v.addScaledVector(sv,-jt*ib);a.v.addScaledVector(sv,jt*id);ball.w.addScaledVector(_fc.crossVectors(r,sv),-jt*ib/(.4*BR*BR))}
     if(hk<.3)ball.w.lerp(_fc.copy(a.w).applyQuaternion(a.q),Math.min(1,.12*Math.min(2,a.fl.grip)));}}  // rolling resistance on a resting carry: the ball rides on the frame instead of rolling off it like a marble on glass
    ball.last=a;{const sp=-rv,vd=touchVerdict(a,sp);if(vd){E_JUDGE.d=a;E_JUDGE.speed=sp;emitEv(vd,E_JUDGE)}  // a save / a shot on target: the crowd reacts (audio/sfx.js)
     E_TOUCH.d=a;E_TOUCH.tag=tb.tag;E_TOUCH.speed=sp;_bh.copy(ball.p).addScaledVector(n,-BR);E_TOUCH.n=n;E_TOUCH.verdict=vd;emitEv('touch',E_TOUCH)}  // p, n: contact point and normal (drone -> ball); render/effects.js draws the flash, ring and sparks
    if(GS.net&&!GS.net.host&&a===GS.player){GS.net.hit={s:++GS.net.seq,p:r2(ball.p),v:r2(ball.v)};GS.net.hitT=performance.now()}
    }}
  for(let k=i+1;k<GS.drones.length;k++){const b=GS.drones[k];if(b.dead>0||a.remote&&b.remote)continue;const c=droneTouch(a,b,_v);if(!c)continue;const n=_v;  // the drones' part colliders (physics/world.js BUMP skin)
   const o=c.pen,wa=a.remote?0:b.remote?1:.5;a.p.addScaledVector(n,-o*wa);b.p.addScaledVector(n,o*(1-wa));const rv=_w.subVectors(b.v,a.v).dot(n);if(rv>=0)continue;
   E_BUMP.d=a;E_BUMP.tag=c.ta;E_BUMP.other=b;E_BUMP.otherTag=c.tb;E_BUMP.speed=-rv;emitEv('bump',E_BUMP);
   if(-rv>DEMO&&a.team!==b.team&&live&&!GS.OBSON){const as=a.v.dot(n),bs=-b.v.dot(n),[vic,by]=as>bs?[b,a]:[a,b];if(!vic.remote)demolish(vic,by)}
   else{const ma=a.fl.mass,mb=b.fl.mass,j=-1.5*rv/(1/ma+1/mb);if(!a.remote)a.v.addScaledVector(n,-j/ma);if(!b.remote)b.v.addScaledVector(n,j/mb)}}}  // parts: mass-weighted bump
 if(A&&GS.state==='play'&&modeFlag('allowGoals')){if(S.longline&&!GS.net){const g=llGoal();if(g>=0)goal(g)}else if(ball.p.z<-(HL+BR))goal(0);else if(ball.p.z>HL+BR)goal(1)}  // long line: only a ball towed across the line (or through a hoop) scores
 {const o=overlay();if(o&&o.post)o.post(dt);if(M.post)M.post(dt)}  // e.g. skill training judges its own shots (modes/training.js)
 if(A&&!GS.OBSON){if(++GS.stepN%4===0)predict();if(GS.stepN%45===0)assignRoles()}}
