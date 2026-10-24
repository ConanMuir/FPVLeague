/* ---------- opponent model (DIFF[].model): how committed each foe is to the ball, and when he really gets to it ---------- */
/* reachT / firstT (bots/league.js) assume every foe flies flat out at the ball from where he is. A quad hovering goal-side, turning */
/* away or waiting for the first touch is later than that by his reaction and his turnaround. Each think, for every foe: com = his speed */
/* toward where the ball will be when he could first touch it, over a brisk pace (0..1, smoothed over hesT s); ta = that first touch time; */
/* ct = ta + (1 - com) * hes, the closing time the planner, the carry's shield and the look-ahead use. ai.foe is the foe closing soonest. */
/* The fake (bots/league.js thinkIQ): beaten to the ball by a foe who hesitates (com < hesC), the attacker starts a run at it (the challenge, */
/* fkD m short of the quick touch) and pulls out to the shadow spot once he commits (com > fkC); if he keeps hesitating until the run */
/* makes the quad first, it takes the touch early. */
import {V3,cl} from '../config/constants.js';
import {GS} from '../state.js';
import {PDT,PRED,accOf,firstT,vmOf} from './league.js';
const _e=new V3();
export function foeModel(d,D,dt){const ai=d.ai,M=ai.om||(ai.om=new Map());let best=null;const k=Math.min(1,dt/(D.hesT??.3));
 for(const o of GS.drones){if(o.team===d.team||o.dead>0)continue;let m=M.get(o);if(!m)M.set(o,m={o,com:0,ta:4,ct:4});
  const ta=firstT(o,accOf(o),vmOf(o),1),P=PRED[cl(Math.round(ta/PDT)-1,0,PRED.length-1)];_e.subVectors(P,o.p);const l=_e.length()||1;
  const c=cl(o.v.dot(_e)/l/Math.max(20,vmOf(o)*.5),0,1);m.com+=(c-m.com)*k;m.ta=ta;m.ct=ta+(1-m.com)*(D.hes??.35);
  if(!best||m.ct<best.ct)best=m}
 ai.foe=best;return best}
/* the closing time of the soonest foe (4 s when there is none or no model) */
export const foeCT=d=>d.ai.foe?d.ai.foe.ct:4;
