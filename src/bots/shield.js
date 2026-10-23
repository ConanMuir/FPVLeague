/* ---------- possession shielding (DIFF[].shield): on a carry, keep the body between the ball and the nearest foe ---------- */
/* The ball rides on the top of the frame, so the carry (bots/dribble.js) holds the quad shO m toward the nearest foe from under the ball's */
/* centre (the ball stays inside the pop zone, flight/drone.js popF): his touch meets the frame first, and a bump from the frame side */
/* leaves the ball on top. A foe ahead (between the ball and the goal) within shA m turns the carry away from his side by up to shD */
/* (a 45 degree swing at shD 1), so the carry goes round him instead of into him. Letting go before contact is the carry's evasive pop */
/* (bots/league.js evade): with shield it fires at the modelled closing time (bots/model.js) under shT s instead of evT, and with team */
/* (bots/team.js) it favours the pop that passes down a teammate's open lane. */
import {V3,cl} from '../config/constants.js';
import {hyp2} from '../core/hypot.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
const _f=new V3();
/* the nearest foe's horizontal direction from the ball (in _f) and his distance, or null */
function nearest(d,R){let foe=null,fd=R*R;for(const o of GS.drones){if(o.team===d.team||o.dead>0)continue;const q=hyp2(o.p.x-ball.p.x,o.p.z-ball.p.z)**2;if(q<fd){fd=q;foe=o}}
 if(!foe)return null;_f.set(foe.p.x-ball.p.x,0,foe.p.z-ball.p.z);const l=_f.length();if(l<1e-3)return null;_f.divideScalar(l);return l}
/* sets out to the (x, z) offset the quad holds from the ball's centre line, and swings the carry direction g away from a foe ahead */
export function shield(d,D,out,g){out.set(0,0,0);const l=nearest(d,D.shR??30);if(l==null)return;
 const w=cl(1-l/(D.shR??30),0,1);out.set(_f.x,0,_f.z).multiplyScalar((D.shO??.3)*w);
 const ah=_f.dot(g);if(ah>.4&&l<(D.shA??25)){const side=_f.x*g.z-_f.z*g.x>0?-1:1,k=(D.shD??1)*cl(1-l/(D.shA??25),0,1)*ah;g.set(g.x+side*g.z*k,0,g.z-side*g.x*k).normalize()}}
