/* ---------- ceiling and wall plays (DIFF[].aerial): set up an aerial off the side wall or the ceiling when the goal is covered ---------- */
/* The planner shoots at the open corner (bots/league.js bestAim). When no corner is open (its margin ai.gm under aerM: the defenders get to */
/* every spot in time), the ball is in the attacking half and low, the attacker plays it high instead: into the side wall when within aerW m */
/* of one (aim: the wall, aerY m up, aerD m out from the goal line), else up onto the ceiling over the box (aim: the ceiling, aerC m out), so */
/* it comes back down in front of the goal above the defenders. The finish is the planner's next pick: the earliest reachable point on the */
/* way down is that aerial (a teammate's when he gets there first, bots/league.js rolesIQ). Only when the drop zone is open is the set-up */
/* worth more than a covered shot: no foe within aerK m of where it comes down, and none who can get there (reachT) inside the aerT s the */
/* ball takes, so against a lone defender in his goal it never happens (he would collect the drop; the 1v1 ablation lost goals to that) and */
/* it is a play for when the defenders are drawn away or busy. The Freestyler's ceiling play and wall feed on a carry (bots/freestyle.js */
/* choose) are chosen by the same cover test, instead of by chance, when it has aerial. */
import {GH,GW,H,HL,HW,V3} from '../config/constants.js';
import {BR} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
import {accOf,keeperOf,reachT,vmOf} from './league.js';
const _z=new V3();
/* the shot is covered: the open-corner margin (seconds the ball beats the quickest defender by, bestAim) is under aerM; on a carry the planner */
/* has not run for a while (the margin is stale after 0.3 s), so then it is a keeper standing in his goal mouth */
export function goalCovered(d,D){const ai=d.ai;if(ai.gm!=null&&GS.stepN-(ai.gmN||0)<36)return ai.gm<(D.aerM??-.05);
 const k=keeperOf(d.team);return !!k&&Math.abs(k.p.z-(d.team?1:-1)*HL)<(D.aerKR??22)&&Math.abs(k.p.x)<GW*.6}
/* the drop zone in front of the goal is clear of foes, and none gets there before the ball comes down */
export function dropOpen(d,D,x){const s=d.team?1:-1;_z.set(x,GH*.8,s*(HL-(D.aerD??28)*.6));const R=D.aerK??16,T=D.aerT??2;
 for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0&&(o.p.distanceToSquared(_z)<R*R||reachT(o,_z,accOf(o),vmOf(o))<T))return false;return true}
/* the set-up: sets out to the wall or ceiling aim point and returns true when a high play is on */
export function aerialAim(d,D,out){const s=d.team?1:-1;if(!goalCovered(d,D)||ball.p.z*s<HL*(D.aerZ??0)||ball.p.y>(D.aerLo??25))return false;
 const wall=HW-Math.abs(ball.p.x)<(D.aerW??60),x=wall?Math.sign(ball.p.x)*(HW-10):ball.p.x*.3;if(!dropOpen(d,D,x))return false;
 if(wall)out.set(Math.sign(ball.p.x)*(HW-1),D.aerY??H*.55,s*(HL-(D.aerD??28)));else out.set(ball.p.x*.3,H-BR-.5,s*(HL-(D.aerC??24)));return true}
