// ---------- Skill training packs: the pure rules (no DOM, no three.js), so npm test can check them ----------
// Pack data (training/packs.js) is written in a "local" frame where the goal that matters is at -z: x to the right as you face
// that goal, y up, d = metres from its goal line out into the field. Striker/aerial/dribble/pop packs use the goal you attack
// (world -z); goalie packs use your own goal (world +z), i.e. the same frame turned 180 degrees about y.
export const GRACE=3,REST=1.2,SETTLE=.25;  // s: a shot still flying at the buzzer gets GRACE; a ball still on the floor REST s fails; a save counts SETTLE s after the touch
export const toWorld=(x,y,d,HL,flip)=>flip?[-x,y,HL-d]:[x,y,-HL+d];
export const vecWorld=(v,flip)=>flip?[-v[0],v[1],-v[2]]:[v[0],v[1],v[2]];
export const toLocal=(p,HL,flip)=>flip?[-p[0],p[1],HL-p[2]]:[p[0],p[1],p[2]+HL];
// yaw in the data: degrees to the right of facing the goal; returns the world rotation angle about +y (three.js: +angle turns left)
export const yawWorld=(deg,flip)=>(flip?Math.PI:0)-deg*Math.PI/180;
// launch velocity (local frame) that carries the ball from `a` to `b` ([x,y,d]) in T s under gravity g, with the ball's drag
// (v15: dv/dt = -(bd + bd*.02*|v|) v) folded in as a linear drag at the launch speed, refined a few times
export function aimVel(a,b,T,g,bd=0){const dx=b[0]-a[0],dy=b[1]-a[1],dd=b[2]-a[2];let v=[dx/T,dy/T+g*T/2,dd/T];
 for(let it=0;it<4;it++){const s=Math.hypot(...v),k=bd*(1+.02*s)*.8;if(k<1e-6)break;const f=k/(1-Math.exp(-k*T));v=[dx*f,(dy+g*T/k)*f-g/k,dd*f]}
 return v.map(x=>+x.toFixed(3))}
// the ball sits on top of the quad: above it, within its footprint, moving with it (a resting carry raises no touch events)
export function carrying(rel,relV,BR,top){const h=Math.hypot(rel[0],rel[2]);return rel[1]>BR*.5&&rel[1]<top+BR+.8&&h<BR*.9&&Math.hypot(...relV)<6}
// One verdict per physics step while a shot is live. s = {
//  kind: 'goal' | 'save' | 'zone', req: {air?: min height of the scoring touch (ball bottom, m), carry?: s carried on top, pop?: true},
//  t, limit: shot time and time allowed; touched: the player has touched the ball; since: s since the last touch;
//  goal: 1 the ball is in the goal that matters (attack: the target; save: your own), -1 the other goal, 0 neither;
//  pred: the ball is on its way into the goal that matters (predicted); last: {y, pop} of the latest touch; carry: s carried;
//  popped: a pop has touched the ball; land: [x, d] where the ball just landed on the floor (null if it didn't this step);
//  zone: {x, d, r}; rest: s the ball has sat on the floor after a touch }
// Returns null (keep going) or {ok, why}.
export function judge(s){const r=s.req||{},late=s.t>=s.limit,grace=s.t<s.limit+GRACE;
 if(s.kind==='save'){
  if(s.goal===1)return{ok:false,why:'Goal against'};
  if(s.touched&&s.since>=SETTLE&&!s.pred)return{ok:true,why:'Saved'};
  if(late){if(!s.pred)return{ok:true,why:s.touched?'Saved':'Kept out'};if(!grace)return{ok:false,why:'Time'}}
  return null}
 if(s.kind==='zone'){
  if(s.popped&&s.land){const z=s.zone,dx=s.land[0]-z.x,dd=s.land[1]-z.d,miss=Math.hypot(dx,dd);return miss<=z.r?{ok:true,why:'On target'}:{ok:false,why:`Missed by ${Math.round(miss-z.r)} m`}}
  if(s.goal)return{ok:false,why:'Into the goal, not the target'};
  if(s.touched&&s.rest>=REST)return{ok:false,why:s.popped?'Missed':'No pop'};
  if(late&&!(s.popped&&grace))return{ok:false,why:s.popped?'Missed':'Time'};
  return null}
 // 'goal'
 if(s.goal===1){
  if(r.air!=null&&!(s.last&&s.last.y>=r.air))return{ok:false,why:'Not an aerial touch'};
  if(r.carry!=null&&!(s.carry>=r.carry))return{ok:false,why:`Carry it longer (${(s.carry||0).toFixed(1)}/${r.carry} s)`};
  if(r.pop&&!(s.last&&s.last.pop))return{ok:false,why:'Score it with a pop'};
  return{ok:true,why:'Goal'}}
 if(s.goal===-1)return{ok:false,why:'Wrong goal'};
 if(s.touched&&s.rest>=REST)return{ok:false,why:'Ball stopped'};
 if(late&&!(s.touched&&s.pred&&grace))return{ok:false,why:'Time'};
 return null}
// ---- results
// per shot {ok: true (done at least once) | false (tried, not yet) | null (not tried), tries, t: best time of a success}
export const newResults=n=>Array.from({length:n},()=>({ok:null,tries:0,t:null}));
export function record(res,ok,t){res.tries++;if(ok){res.ok=true;res.t=res.t==null?t:Math.min(res.t,t)}else if(res.ok!==true)res.ok=false;return res}
export function packScore(rs){let n=0,t=0,tries=0;for(const r of rs){tries+=r.tries;if(r.ok===true){n++;t+=r.t}}return{n,of:rs.length,t:+t.toFixed(2),tries}}
// a beats b: more shots done, then less total time
export const better=(a,b)=>!b||a.n>b.n||a.n===b.n&&a.n>0&&a.t<b.t-1e-6;
// settings S.train: {packId: {n, of, t}}; anything malformed (or from an older save) is dropped
export function cleanTrain(o){const out={};if(!o||typeof o!=='object'||Array.isArray(o))return out;let k=0;
 for(const id of Object.keys(o)){if(k>=200)break;const v=o[id];if(!/^[a-z0-9-]{1,40}$/.test(id)||!v||typeof v!=='object')continue;const of=v.of|0,n=v.n|0,t=+v.t;
  if(of<1||of>50||n<0||n>of||!Number.isFinite(t)||t<0)continue;out[id]={n,of,t:Math.min(t,9999)};k++}
 return out}
