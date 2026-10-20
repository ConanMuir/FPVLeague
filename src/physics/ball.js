// ball state + ball physics. The ball is a Rapier dynamic body (physics/world.js integrates it); its contact with the arena is
// analytic against the SDF (exact normals on every curve, so no facet bumps), and the bots' predictor runs this same code.
//  ballPre: gravity BG, drag BD (+ quadratic), top speed MAXB (v15).
//  ballContact: an impact (a new contact faster than 1 m/s) bounces with restitution BB and Coulomb friction .25 at the contact
//  point, which spins the ball up (a solid sphere: rolling costs at most 2/7 of the slip). While it stays in contact it rolls:
//  its velocity turns with the surface normal (so a curve changes its direction, not its speed), what is left pushing into the
//  surface (gravity) is removed with no bounce and no friction loss, the spin follows the rolling, and a rolling resistance of
//  .25*BG on flat ground (v15's 4.9 m/s^2 roll-out on the floor) fades out on slopes, so the ball rolls up a quarter-pipe and a
//  wall and back down without bleeding speed (v15 lost most of it to sliding friction against the centripetal force).
//  ballSpin: off the map (in the air, or resting on a quad) spin above BALL.wFree fades (time constant wTau) and anything above
//  BALL.wMax goes within ~0.15 s, so a ball that rolled fast and was then hit or flew off a ramp does not keep spinning hard in the
//  air. No Magnus: spin never bends the flight, it only shows and changes the next bounce. On the map the spin follows the roll.
import {QT,V3} from '../config/constants.js';
import {BB,BD,BG,BR,MAXB} from '../config/tune.js';
import {sdN,sdf} from './sdf.js';
export const ball={p:new V3(0,BR+6,0),v:new V3(),w:new V3(),q:new QT(),c:false,n:new V3(),last:null,hit:0,v0:new V3()};  // c, n: touching the map last tick, and its normal
export const BALL={mu:.25,rr:.25,wFree:8,wTau:1.2,wMax:16};  // impact friction, rolling resistance (x BG on flat ground); spin in rad/s: free level, fade time above it (s), cap (ballSpin, and touches in modes/step.js)
const VI=1,_n=new V3(),_r=new V3(),_c=new V3(),_t=new V3(),_qr=new QT();
export function ballPre(v,dt){v.y-=BG*dt;const s=v.length();v.multiplyScalar(Math.max(0,1-(BD+BD*.02*s)*dt));if(s>MAXB)v.multiplyScalar(MAXB/s)}
// sphere of radius BR vs the map SDF (b = {p, v, w, c, n}); returns the impact speed. Still touching the same surface = the normal
// turned less than ~25 deg since last tick (curves turn it < 6 deg a tick even at top speed); anything else is an impact.
export function ballContact(b,dt){const{p,v,w}=b;let m=0,touch=false;
 for(let it=0;it<2;it++){const d=sdf(p.x,p.y,p.z);if(d<=-BR-.02)break;touch=true;const n=sdN(p,_n);if(d<=-BR)break;  // n points into the wall
  p.addScaledVector(n,-(d+BR));const vn=v.dot(n);if(vn<=0&&!(b.c&&!it))continue;
  if(b.c&&n.dot(b.n)>.9){if(!it){v.applyQuaternion(_qr.setFromUnitVectors(b.n,n));const v2=v.dot(n);if(v2>0)v.addScaledVector(n,-v2)}else v.addScaledVector(n,-vn)}  // rolling on: turn with the surface (no speed lost to the curve), drop what pushes into it
  else if(vn<VI)v.addScaledVector(n,-vn);  // settling
  else{const r=_r.copy(n).multiplyScalar(BR),c=_c.crossVectors(w,r).add(v),cn=c.dot(n),jn=(1+BB)*vn;v.addScaledVector(n,-jn);c.addScaledVector(n,-cn);const tl=c.length();
   if(tl>1e-6){const jt=Math.min(BALL.mu*jn,tl*2/7),t=c.divideScalar(tl);v.addScaledVector(t,-jt);w.addScaledVector(_t.crossVectors(r,t),-jt/(.4*BR*BR))}m=Math.max(m,vn)}}
 if(touch){b.n.copy(_n);if(v.dot(_n)>-1){_n.negate();if(b.c&&!m)w.crossVectors(_n,v).divideScalar(BR);ballRoll(v,w,_n,dt)}}  // spin follows the roll
 b.c=touch;return m}
// rolling resistance on a surface with normal n (pointing out of the surface): full on the floor, fading out by ~37 deg of slope
export function ballRoll(v,w,n,dt){const s=Math.min(1,Math.max(0,(n.y-.8)/.2)),a=BALL.rr*BG*s*s*(3-2*s);if(a<=0)return;const vn=v.dot(n),t=_t.copy(v).addScaledVector(n,-vn),tl=t.length();if(tl<1e-6)return;
 const k=Math.max(0,1-a*dt/tl);v.copy(t.multiplyScalar(k)).addScaledVector(n,vn);w.multiplyScalar(k)}
// one step of the whole ball (bots' predict(): the same model without Rapier)
export function ballPhys(b,dt){ballPre(b.v,dt);b.p.addScaledVector(b.v,dt);const m=ballContact(b,dt);ballSpin(b,dt);return m}
// spin off the map (after ballContact, which sets b.c): above wFree it fades, above wMax it goes fast
export function ballSpin(b,dt){if(b.c)return;const w=b.w,s=w.length();if(s<=BALL.wFree)return;let t=s-(s-BALL.wFree)*(1-Math.exp(-dt/BALL.wTau));if(t>BALL.wMax)t=BALL.wMax+(t-BALL.wMax)*Math.exp(-dt/.15);w.multiplyScalar(t/s)}
