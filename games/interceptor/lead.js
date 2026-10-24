/* Lead solution: where an interceptor flying straight at speed s from here meets a track, and when. One solver for every aim aid that
   claims to show the meet point: today Zombies' lock-on intercept overlay (zlock.js).
   It runs in the sim tick on sim state; the overlays draw the stored world point through the frame's (interpolated) camera, so the
   point never mixes the two. A meet point is a fixed place in the world: interpolating the camera does not move it.
   The track is modelled as flying on at constant speed while turning at its current rate (a constant-turn model): its acceleration
   comes from its velocity tick to tick (track(), smoothed over about 0.25 s). A straight track gives the exact quadratic answer, which
   also covers tracks faster than you (head-on). A turning one is iterated; the turn is capped at half a circle. unc = how far off the
   point could be if the track changes what it is doing (grows with its unexplained acceleration and the time to go), for drawing. */
const TURN_MIN=.3,EMA=.25;
/* t.__ld: {pv: previous velocity, a: smoothed acceleration, n: ticks seen, k: the tick of the last call}. Call once per sim tick for a track you solve for; tick (a counter that
   goes up by one a tick) lets it see a gap: the lock on a track was dropped and taken again, and the velocity left from then is no basis for an acceleration. */
export function track(t,dt,V3,tick){let L=t.__ld;if(!L)L=t.__ld={pv:new V3().copy(t.v),a:new V3(),n:0,k:tick};else if(tick!=null&&L.k!=null&&tick-L.k>2){L.pv.copy(t.v);L.a.set(0,0,0);L.n=0}  /* a gap: start again from now, or the whole change since then lands in one tick as a huge turn */
  L.k=tick;if(dt>0){const k=Math.min(1,dt/EMA);
  L.a.x+=((t.v.x-L.pv.x)/dt-L.a.x)*k;L.a.y+=((t.v.y-L.pv.y)/dt-L.a.y)*k;L.a.z+=((t.v.z-L.pv.z)/dt-L.a.z)*k;L.n++}L.pv.copy(t.v);return L}
/* the track's position tau seconds on: p + v tau when straight, else rotated about the turn axis at rate w */
function ahead(o,p,v,ax,w,tau){if(w<1e-6)return o.copy(p).addScaledVector(v,tau);const th=Math.min(Math.PI,w*tau),te=th/w;
  /* v(t) = v cos wt + (axis x v) sin wt, integrated over [0, te], then straight on along the turned heading for any remaining time */
  const sx=Math.sin(th)/w,cx=(1-Math.cos(th))/w,nx=ax.y*v.z-ax.z*v.y,ny=ax.z*v.x-ax.x*v.z,nz=ax.x*v.y-ax.y*v.x;
  o.set(p.x+v.x*sx+nx*cx,p.y+v.y*sx+ny*cx,p.z+v.z*sx+nz*cx);if(tau>te){const c=Math.cos(th),s=Math.sin(th),r=tau-te;o.x+=(v.x*c+nx*s)*r;o.y+=(v.y*c+ny*s)*r;o.z+=(v.z*c+nz*s)*r}return o}
/* solve: out.p = meet point, out.tau = seconds, out.unc = metres, out.ok = an intercept exists at that speed. tp/tv: track position and
   velocity, ta: its acceleration (or null), mp: your position, s: your speed. */
export function solve(out,tp,tv,ta,mp,s,V3){const W=out._w||(out._w={ax:new V3(),r:new V3(),q:new V3()});const r=W.r.subVectors(tp,mp),vv=tv.lengthSq();
  const a=vv-s*s,b=2*r.dot(tv),c=r.lengthSq();let tau=Math.sqrt(c)/Math.max(s,1),ok=true;
  if(Math.abs(a)<1e-6){if(b<0)tau=-c/b;else ok=false}else{const D=b*b-4*a*c;if(D>=0){const r1=(-b-Math.sqrt(D))/(2*a),r2=(-b+Math.sqrt(D))/(2*a),m=Math.min(r1>0?r1:1e9,r2>0?r2:1e9);if(m<1e9)tau=m;else ok=false}else ok=false}
  /* the turn: rate w = |a perpendicular to v| / |v|, about the axis v x a */
  let w=0;const sp=Math.sqrt(vv);if(ta&&sp>1){const ap=W.q.copy(ta).addScaledVector(tv,-ta.dot(tv)/vv),am=ap.length();if(am>TURN_MIN){w=am/sp;W.ax.crossVectors(tv,ap).normalize()}}
  if(w>0){for(let i=0;i<16;i++){ahead(W.q,tp,tv,W.ax,w,tau);const t2=W.q.distanceTo(mp)/Math.max(s,1);if(Math.abs(t2-tau)<1e-4){tau=t2;break}tau=t2}}
  tau=Math.min(tau,120);ahead(out.p,tp,tv,W.ax,w,tau);out.tau=tau;out.ok=ok||w>0;
  /* uncertainty: the speed change the model ignores, plus a share of the turn (it may straighten out before then), over the time to go */
  const apar=ta&&sp>1?Math.abs(ta.dot(tv))/sp:0;out.unc=Math.min(500,2+.5*apar*tau*tau+(w>0?.15*w*sp*tau*tau:0));return out}
