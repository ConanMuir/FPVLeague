// one fixed simulation step (1/120 s): match clock, drones, orbs, ball, touches, drone-drone contact, goals, bot planning
import {near,noise,tone} from '../audio/audio.js';
import {dfBot} from '../bots/dogfight.js';
import {assignRoles,botControl,predict} from '../bots/league.js';
import {HL,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BM,BR,DEMO,DRAD,KICK,PBG,PSM,TB} from '../config/tune.js';
import {humanControl} from '../input/input.js';
import {LAB,labStep} from './lab.js';
import {fireIn,turrets} from './dogfight.js';
import {bullets,droneFire} from './guns.js';
import {demolish,endMatch,goal,kickoff,startDemo} from './match.js';
import {r2} from '../net/net.js';
import {ball,ballBox,ballPhys} from '../physics/ball.js';
import {emit} from '../render/particles.js';
import {_ip,_lat,_t,_v,_w} from '../scratch.js';
import {GS,SB,auth} from '../state.js';
import {banner} from '../ui/hud.js';
import {ORBS} from '../world/orbs.js';
export function step(dt){if(LAB.on){labStep(dt);return}const A=auth();
 if(GS.state==='kickoff'){GS.stT-=dt;const n=Math.ceil(GS.stT);if(n!==GS.lastCount){GS.lastCount=n;if(!GS.demo){if(n>0){banner(n,'',.9);tone(660,660,.12,.12,'square')}else{banner('GO!','',.6);tone(990,990,.25,.15,'square')}}}if(A&&GS.stT<=0)GS.state='play'}
 else if(GS.state==='goal'){GS.stT-=dt;if(GS.stT<2.4)GS.timeScale=1;if(A&&GS.stT<=0){if(GS.endPending)endMatch();else kickoff()}}
 else if(GS.state==='end'){GS.stT-=dt;if(A&&GS.stT<=0){banner('');if(GS.net){GS.score=[0,0];GS.clock=S.len;GS.overtime=GS.endPending=false;kickoff()}else{startDemo();return}}}
 else if(GS.state==='play'&&!GS.demo&&A){if(!GS.overtime){GS.clock-=dt;if(GS.clock<=0){GS.clock=0;if(GS.score[0]===GS.score[1]){GS.overtime=true;banner('OVERTIME','',1.6)}else endMatch()}}else GS.clock+=dt}
 const frozen=GS.state==='kickoff',live=GS.state==='play'||GS.state==='kickoff';
 for(const d of GS.drones){if(d.remote)continue;if(d.dead>0){if((d.dead-=dt)<=0)d.spawn();continue}
  if(d.bot)(GS.OBSON?dfBot:botControl)(d,dt);else{humanControl(d,dt);if(GS.OBSON)d.firing=!GS.menuOpen&&GS.state==='play'&&fireIn(d)}if(frozen)continue;d.step(dt);if(GS.OBSON)droneFire(d,dt,A||d===GS.player);
  if(SB())for(const p of ORBS)if(p.cd<=0&&d.boost<100&&d.p.distanceTo(p.p)<(p.big?2.6:1.8)+DRAD+1){d.boost=Math.min(100,d.boost+(p.big?PBG:PSM));p.cd=p.big?10:4;emit(p.p,0xffc640,p.big?60:24,p.big?14:9,.6);if(d===GS.player)tone(700,1400,.15,.08)}}
 for(const p of ORBS)p.cd-=dt;
 if(GS.OBSON){for(const d of GS.drones)if(d.remote)droneFire(d,dt,false);bullets(dt);turrets(dt)}
 if(!frozen&&live&&!GS.OBSON){const hit=ballPhys(ball.p,ball.v,dt);if(hit>4)noise(.1,900,cl(hit/50,0,.3)*near(ball.p))}
 if(!frozen)for(let i=0;i<GS.drones.length;i++){const a=GS.drones[i];if(a.dead>0)continue;
  if(live&&!a.remote&&!GS.OBSON&&ballBox(a,_v)){const n=_v,pen=ballBox.pen,ib=1/BM,id=1;ball.p.addScaledVector(n,pen*ib/(ib+id));a.p.addScaledVector(n,-pen*id/(ib+id));
   const rv=_w.subVectors(ball.v,a.v).dot(n);if(rv<0){const hk=cl((-rv-6)/30,0,1),j=-(1+TB+(.6-TB)*hk)*rv/(ib+id);ball.v.addScaledVector(n,j*ib*KICK);a.v.addScaledVector(n,-j*id);
    // Rocket League-style extra push along drone->ball (vertical softened), leaning toward where the quad is flying
    const aim=_ip.subVectors(ball.p,a.p);aim.y*=.7;aim.normalize();const sp=a.v.length();if(sp>3)aim.addScaledVector(_lat.copy(a.v).divideScalar(sp),.5).normalize();ball.v.addScaledVector(aim,Math.min(14,-rv*.3)*hk*KICK);
    const gr=(1-hk)*.35;_t.subVectors(ball.v,a.v);_t.addScaledVector(n,-_t.dot(n));ball.v.addScaledVector(_t,-gr);ball.last=a;
    if(GS.net&&!GS.net.host&&a===GS.player){GS.net.hit={s:++GS.net.seq,p:r2(ball.p),v:r2(ball.v)};GS.net.hitT=performance.now()}
    if(-rv>6){noise(.18,700+(-rv)*15,cl(-rv/35,0,.7)*near(ball.p));tone(240,90,.12,cl(-rv/120,0,.25)*near(ball.p));emit(ball.p.clone().addScaledVector(n,-BR),0x9fe8ff,cl(-rv,4,30)|0,10,.5)}}}
  for(let k=i+1;k<GS.drones.length;k++){const b=GS.drones[k];if(b.dead>0||a.remote&&b.remote)continue;const n=_v.subVectors(b.p,a.p),dist=n.length();if(dist>=2*DRAD||dist<1e-4)continue;n.divideScalar(dist);
   const o=2*DRAD-dist,wa=a.remote?0:b.remote?1:.5;a.p.addScaledVector(n,-o*wa);b.p.addScaledVector(n,o*(1-wa));const rv=_w.subVectors(b.v,a.v).dot(n);if(rv>=0)continue;
   if(-rv>DEMO&&a.team!==b.team&&live&&!GS.OBSON){const as=a.v.dot(n),bs=-b.v.dot(n),[vic,by]=as>bs?[b,a]:[a,b];if(!vic.remote)demolish(vic,by)}
   else{const j=-1.5*rv/2;if(!a.remote)a.v.addScaledVector(n,-j);if(!b.remote)b.v.addScaledVector(n,j)}}}
 if(A&&GS.state==='play'&&!GS.OBSON){if(ball.p.z<-(HL+BR))goal(0);else if(ball.p.z>HL+BR)goal(1)}
 if(A&&!GS.OBSON){if(++GS.stepN%4===0)predict();if(GS.stepN%45===0)assignRoles()}}
