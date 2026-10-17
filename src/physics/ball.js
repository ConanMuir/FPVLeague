// ball state + ball physics (the ball is a sphere of radius BR against the arena SDF)
import {V3,cl} from '../config/constants.js';
import {BB,BBX,BD,BG,BR,MAXB} from '../config/tune.js';
import {arena} from './sdf.js';
import {_lb,_qb} from '../scratch.js';
export function ballPhys(p,v,dt){v.y-=BG*dt;const s=v.length();v.multiplyScalar(Math.max(0,1-(BD+BD*.02*s)*dt));if(s>MAXB)v.multiplyScalar(MAXB/s);p.addScaledVector(v,dt);return arena(p,v,BR,BB,.25)}

export const ball={p:new V3(0,BR+6,0),v:new V3(),last:null};
// ball vs the drone's box (props included): contact normal from the closest point on the box
export function ballBox(a,out){const l=_lb.subVectors(ball.p,a.p);if(l.lengthSq()>(BR+2)**2)return false;l.applyQuaternion(_qb.copy(a.q).invert());
 out.set(l.x-cl(l.x,-BBX[0],BBX[0]),l.y-cl(l.y,-BBX[1],BBX[1]),l.z-cl(l.z,-BBX[2],BBX[2]));let d=out.length();
 if(d<1e-4){d=0;out.copy(l);if(out.lengthSq()<1e-6)out.set(0,1,0);out.normalize()}else out.divideScalar(d);if(d>=BR)return false;ballBox.pen=BR-d;out.applyQuaternion(a.q);return true}
