// ball state + ball physics. The ball is a Rapier dynamic body (physics/world.js integrates it); its contact with the arena is
// analytic against the SDF (exact normals on every curve, so no facet bumps), and the bots' predictor runs this same code.
//  ballPre: gravity BG, drag BD (+ quadratic), top speed MAXB (v15).
//  ballContact: an impact (a new contact faster than 1 m/s) bounces with restitution BB and Coulomb friction .25 at the contact
//  point, which spins the ball up (a solid sphere: rolling costs at most 2/7 of the slip). While it stays in contact it rolls:
//  the normal velocity is removed with no bounce and no friction loss, the spin follows the rolling, and a rolling resistance of
//  .25*BG on flat ground (v15's 4.9 m/s^2 roll-out on the floor) fades out on slopes, so the ball rolls up a quarter-pipe and a
//  wall and back down without bleeding speed (v15 lost most of it to sliding friction against the centripetal force).
import {QT,V3} from '../config/constants.js';
import {BB,BD,BG,BR,MAXB} from '../config/tune.js';
import {sdN,sdf} from './sdf.js';
export const ball={p:new V3(0,BR+6,0),v:new V3(),w:new V3(),q:new QT(),c:false,n:new V3(),last:null,hit:0,v0:new V3()};  // c, n: touching the map last tick, and its normal
const MU=.25,RRK=.25,VI=1,_n=new V3(),_r=new V3(),_c=new V3(),_t=new V3();
export function ballPre(v,dt){v.y-=BG*dt;const s=v.length();v.multiplyScalar(Math.max(0,1-(BD+BD*.02*s)*dt));if(s>MAXB)v.multiplyScalar(MAXB/s)}
// sphere of radius BR vs the map SDF (b = {p, v, w, c, n}); returns the impact speed. Still touching the same surface = the normal
// turned less than ~25 deg since last tick (curves turn it < 6 deg a tick even at top speed); anything else is an impact.
export function ballContact(b,dt){const{p,v,w}=b;let m=0,touch=false;
 for(let it=0;it<2;it++){const d=sdf(p.x,p.y,p.z);if(d<=-BR-.02)break;touch=true;const n=sdN(p,_n);if(d<=-BR)break;  // n points into the wall
  p.addScaledVector(n,-(d+BR));const vn=v.dot(n);if(vn<=0)continue;
  if(b.c&&n.dot(b.n)>.9||vn<VI)v.addScaledVector(n,-vn);  // rolling along (or settling on) the surface
  else{const r=_r.copy(n).multiplyScalar(BR),c=_c.crossVectors(w,r).add(v),cn=c.dot(n),jn=(1+BB)*vn;v.addScaledVector(n,-jn);c.addScaledVector(n,-cn);const tl=c.length();
   if(tl>1e-6){const jt=Math.min(MU*jn,tl*2/7),t=c.divideScalar(tl);v.addScaledVector(t,-jt);w.addScaledVector(_t.crossVectors(r,t),-jt/(.4*BR*BR))}m=Math.max(m,vn)}}
 if(touch){b.n.copy(_n);if(v.dot(_n)>-1){_n.negate();if(b.c&&!m)w.crossVectors(_n,v).divideScalar(BR);ballRoll(v,w,_n,dt)}}  // spin follows the roll
 b.c=touch;return m}
// rolling resistance on a surface with normal n (pointing out of the surface): full on the floor, fading out by ~37 deg of slope
export function ballRoll(v,w,n,dt){const s=Math.min(1,Math.max(0,(n.y-.8)/.2)),a=RRK*BG*s*s*(3-2*s);if(a<=0)return;const vn=v.dot(n),t=_t.copy(v).addScaledVector(n,-vn),tl=t.length();if(tl<1e-6)return;
 const k=Math.max(0,1-a*dt/tl);v.copy(t.multiplyScalar(k)).addScaledVector(n,vn);w.multiplyScalar(k)}
// one step of the whole ball (bots' predict(): the same model without Rapier)
export function ballPhys(b,dt){ballPre(b.v,dt);b.p.addScaledVector(b.v,dt);return ballContact(b,dt)}
