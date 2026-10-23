/* ---------- team play (DIFF[].team): rotation and passes into a teammate's open lane ---------- */
/* Rotation (rolesIQ in bots/league.js calls rotate): the first man is whoever reaches the ball first, as before, but a quad that has just */
/* struck the ball (its touch while striking, within rotT s) is not sent after it again: it drops back and the second man takes over. The */
/* second man (mid) waits in a lane: laneD m goalward of the ball on the far side from the attacker when the play is in the attacking */
/* half, behind the play as before when it is not. The last man keeps. */
/* Passes: passLane scores, for each teammate, the spot laneD m goalward of where he will be in 0.5 s: the lane is open when no foe reaches */
/* it before him and none stands within laneR m of the line from the ball to it; its value is how much nearer the goal the spot is than the */
/* ball plus his margin over the foes. The planner (thinkIQ) aims the touch there (ai.aimP) when the shot's open-corner margin (ai.gm) is */
/* under passG and the lane is worth more than passV; the carry's evasive pop (evade) favours the pop direction that points down the lane. */
import {HL,HW,V3,cl} from '../config/constants.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
import {accOf,reachT,vmOf} from './league.js';
const _l=new V3(),_m=new V3(),_f=new V3(),_e=new V3();
export function passLane(d,D,out){const s=d.team?1:-1,gz=s*HL;let best=0;
 for(const m of GS.drones){if(m.team!==d.team||m===d||m.dead>0)continue;_m.copy(m.p).addScaledVector(m.v,.5);_f.set(-_m.x*.3,0,gz-_m.z).normalize();_m.addScaledVector(_f,D.laneD??12);_m.y=cl(_m.y,2,12);
  if(Math.abs(_m.x)>HW-6||Math.abs(_m.z)>HL-8||(gz-_m.z)*s<12)continue;  /* no lane into the goal mouth itself or along the walls */
  const tm=reachT(m,_m,accOf(m),vmOf(m));let tf=9,near=1e9;_l.subVectors(_m,ball.p);const L=_l.length()||1;_l.divideScalar(L);
  for(const o of GS.drones){if(o.team===d.team||o.dead>0)continue;tf=Math.min(tf,reachT(o,_m,accOf(o),vmOf(o)));const t=cl(_e.subVectors(o.p,ball.p).dot(_l),0,L);near=Math.min(near,_e.addScaledVector(_l,-t).length())}
  if(near<(D.laneR??10)||tf<tm+(D.laneM??.4))continue;
  const v=(Math.abs(gz-ball.p.z)-Math.abs(gz-_m.z))/HL+(tf-tm)*.15-Math.abs(_m.x)/HW*.2;if(v>best){best=v;out.copy(_m)}}
 return best}
/* rotation: before rolesIQ sorts ms by time to the ball (ai.rs), a quad that just struck it (ai.rot > 0) is pushed back by rotP s unless it is alone */
export function rotate(ms,D){if(ms.length<2)return;for(const d of ms)if(d.ai.rot>0)d.ai.rs+=D.rotP??1}
/* the second man's spot: in the attacking half, laneD goalward of the ball on the side away from the attacker; else behind the play, wide */
export function laneSpot(d,D,at,out){const s=d.team?1:-1,gz=s*HL;
 if(ball.p.z*s>-HL*.1){_f.set(-ball.p.x*.3,0,gz-ball.p.z).normalize();out.copy(ball.p).addScaledVector(_f,D.laneD??12);out.x+=((at?at.p.x:ball.p.x)>ball.p.x?-1:1)*(D.laneX??18);out.y=cl(ball.p.y*.5,4,10);
  out.x=cl(out.x,-HW+8,HW-8);if((gz-out.z)*s<14)out.z=gz-s*14;return true}
 return false}
