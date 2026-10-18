// Calibration Lab metrics: pure functions over plain sample arrays (no three.js, no DOM), so they can be unit-tested
// with synthetic stick/attitude traces. Times in s inside samples; results in ms / % / ° as named.
const sg=v=>v>0?1:v<0?-1:0,mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
export const pctl=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.round(p*(s.length-1))))]};
// sign changes of a signal with a hysteresis band (a reversal only counts once it gets past ±h on the other side)
export function crossings(a,h){let st=0,n=0;for(const v of a){const s=v>h?1:v<-h?-1:0;if(s&&st&&s!==st)n++;if(s)st=s}return n}

// ---- snaps: rotate to a target angle on one axis and stop ----
// rep: {start, target (°), s:[{t, x (stick, after deadband), th (angle °)}]}; the trace starts when the target appears.
// returns: os/us % of the move, settle ms (from first reaching the band until it stays there), osc (wobbles: target crossings
// after the first), rev (stick reversals = counter-steering), lag ms (stick onset to 10% of the move), react ms, tReach ms,
// peak / use (peak and median stick on the way there), sat (share of the approach with the stick pinned), reached, settled
export function snapMetrics(rep){const{start,target,s}=rep,A=target-start,dir=sg(A)||1,amp=Math.abs(A);if(!s||s.length<4||amp<5)return null;
 const band=Math.max(4,.06*amp),P=s.map(o=>(o.th-start)*dir),t0=s[0].t;let on=-1;for(let i=0;i<s.length;i++)if(Math.abs(s[i].x)>.15){on=i;break}
 if(on<0)return{valid:false,amp,reached:false};
 let i10=-1,iR=-1;for(let i=on;i<s.length;i++){if(i10<0&&P[i]>=.1*amp)i10=i;if(P[i]>=amp-band){iR=i;break}}
 // first stop: progress past 30% and the angle stops advancing
 let stop=null;for(let i=Math.max(on,1);i<s.length;i++)if(P[i]>.3*amp&&P[i]-P[i-1]<=1e-6){stop=P[i-1];break}if(stop==null)stop=Math.max(...P);
 const peakP=Math.max(...P),os=Math.max(0,peakP-amp)/amp*100,us=stop<amp-band?(amp-stop)/amp*100:0;
 let settle=null,settled=false,osc=0;if(iR>=0){let j=-1;for(let i=s.length-1;i>=iR;i--)if(Math.abs(P[i]-amp)>band){j=i;break}
  settled=j<s.length-1;settle=j<0?0:((settled?s[j+1].t:s[s.length-1].t)-s[iR].t)*1000;osc=Math.max(0,crossings(P.slice(iR).map(p=>p-amp),2)-1)}  // the first pass through the target is the overshoot itself
 const ap=s.slice(on,iR>=0?iR+1:s.length).map(o=>Math.abs(o.x)),act=ap.filter(v=>v>.05);
 return{valid:true,amp,os,us,settle,settled,osc,rev:crossings(s.map(o=>o.x),.12),lag:i10>=0?(s[i10].t-s[on].t)*1000:null,react:(s[on].t-t0)*1000,
  tReach:iR>=0?(s[iR].t-s[on].t)*1000:null,reached:iR>=0,peak:Math.max(...ap),use:pctl(act,.5),sat:ap.filter(v=>v>.95).length/(act.length||1)}}

// ---- small corrections: keep the reticle on a slowly drifting target ----
// s: [{t, e:[roll,pitch,yaw] error ° (target minus quad, body axes), x:[3] sticks after deadband, r:[3] raw sticks, tv:[3] target rate °/s}]
// per axis: rms °, bias (error in the direction the target moves, ÷ rms: > 0 means lagging behind), zc (target crossings / s),
// jit (stick reversals / s), stall (share of time a small stick input sits inside the deadband while off target), use (median stick)
export function trackMetrics(s,dz=0){if(!s||s.length<10)return null;const T=s[s.length-1].t-s[0].t||1;
 return[0,1,2].map(i=>{const e=s.map(o=>o.e[i]),rms=Math.sqrt(mean(e.map(v=>v*v))),mv=s.filter(o=>Math.abs(o.tv[i])>2);
  return{rms,bias:mv.length?mean(mv.map(o=>o.e[i]*sg(o.tv[i])))/(rms||1):0,zc:crossings(e,.5)/T,jit:crossings(s.map(o=>o.x[i]),.06)/T,
   stall:s.filter(o=>Math.abs(o.e[i])>1.5&&Math.abs(o.r[i])>.003&&Math.abs(o.r[i])<=dz).length/s.length,use:pctl(s.map(o=>Math.abs(o.x[i])),.5)}})}

// ---- dodge: one incoming projectile ----
// ev: {t0 (warning shown), hit, s:[{t, x:[roll,pitch] sticks, tilt:[roll,pitch] °}]}
// react s (warning to a deliberate roll/pitch input), peak stick, over ° (tilt past level the other way after the dodge), hit
export function dodgeMetrics(ev){const s=ev.s;if(!s||s.length<4)return null;let react=null,peak=0;
 for(const o of s){const m=Math.max(Math.abs(o.x[0]),Math.abs(o.x[1]));if(react==null&&m>.3)react=o.t-ev.t0;peak=Math.max(peak,m)}
 let ax=0,ip=0,pv=0;s.forEach((o,i)=>{for(const k of[0,1])if(Math.abs(o.tilt[k])>pv){pv=Math.abs(o.tilt[k]);ax=k;ip=i}});
 const dsg=sg(s[ip].tilt[ax]);let over=0;for(let i=ip;i<s.length&&s[i].t-s[ip].t<1.5;i++)over=Math.max(over,-dsg*s[i].tilt[ax]);
 return{react,peak,over,tilt:pv,hit:!!ev.hit}}

// ---- altitude gates: one step of the height band ----
// ev: {lo, hi, s:[{t, y, vy, thr (stick 0..1), m (motor 0..1)}]}
// tEnter s, over (furthest outside the band after first entering, × half-height), exits, inBand share, hover (mean motor while
// steady in the band, or null), sat (share of the approach with the throttle at an end)
export function altMetrics(ev){const{lo,hi,s}=ev;if(!s||s.length<4)return null;const half=(hi-lo)/2||1,inb=y=>y>=lo&&y<=hi;let iE=s.findIndex(o=>inb(o.y));
 let over=0,exits=0,was=true;if(iE>=0)for(let i=iE;i<s.length;i++){const y=s[i].y,d=y>hi?y-hi:y<lo?lo-y:0;over=Math.max(over,d/half);const n=inb(y);if(was&&!n)exits++;was=n}
 const st=iE>=0?s.slice(iE).filter(o=>inb(o.y)&&Math.abs(o.vy)<1.5):[],ap=s.slice(0,iE>=0?iE+1:s.length);
 return{tEnter:iE>=0?s[iE].t-s[0].t:null,over,exits,inBand:s.filter(o=>inb(o.y)).length/s.length,hover:st.length>20?mean(st.map(o=>o.m)):null,
  sat:ap.filter(o=>o.thr>.95||o.thr<.05).length/(ap.length||1)}}

// ---- hold still: sticks at rest ----
// raw: [[roll,pitch,yaw] raw stick before deadband, ...]; need = the deadband that would swallow 98% of it (centre offset included)
export function noiseMetrics(raw){if(!raw||raw.length<10)return null;return[0,1,2].map(i=>{const a=raw.map(r=>r[i]);return{mean:mean(a),need:pctl(a.map(Math.abs),.98)}})}
