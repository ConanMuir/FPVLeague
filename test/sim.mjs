// Simulated pilots for the tuner tests. Deterministic (seeded).
export function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
const DT=1/120;
// Snap rep on the single-axis rig. The pilot sees the angle `react` s late. They push the stick to their habitual
// deflection (h for a 90° move, less for smaller ones) and let go when the angle they see is `want × react` short of the
// target, i.e. they expect the quad to turn at `want` °/s at h. If the real rate is faster they overshoot by about
// (rate - want) × react; slower and they stop short. Then they make small open-loop correction pulses sized from the same
// belief (rate scales with stick), each followed by a look (react) at the result.
export function simSnap(rateDeg,amp,pl,rnd){const s=[],hist=[],n=Math.round(pl.react/DT),dir=Math.sign(amp),A=Math.abs(amp);
 const hx=pl.h*Math.min(1,.4+A/150)*(1+(rnd()-.5)*.12),bel=x=>pl.want*Math.abs(x)/pl.h;let th=0,x=0,mode='react',hold=0,pulse=0;
 for(let k=0;k<Math.round(3.5/DT);k++){const t=k*DT,seen=k>=n?hist[k-n]:0,err=A-seen*dir;
  if(mode==='react'){x=0;if(t>=pl.react)mode='go'}
  else if(mode==='go'){x=hx;if(err<=bel(hx)*pl.react){mode='wait';x=0;hold=n}}
  else if(mode==='wait'){x=0;if(--hold<=0)mode='fix'}
  else if(mode==='fix'){if(Math.abs(err)<2.5)x=0;else{x=Math.sign(err)*Math.min(.35,.08+Math.abs(err)/150);pulse=Math.max(1,Math.round(Math.abs(err)/bel(x)/DT));mode='pulse'}}
  if(mode==='pulse'&&--pulse<=0){mode='wait';hold=n}
  th+=rateDeg((mode==='pulse'||mode==='go'?x:0)*dir)*DT;hist.push(th);s.push({t,x:(mode==='pulse'||mode==='go'?x:0)*dir,th})}
 return{start:0,target:amp,s}}
// one altitude step: a pilot with a proportional-derivative throttle habit (stick = hs + k × height error - kd × climb rate,
// seen `react` s late) on a plant where the motor command from the stick goes through the throttle curve
export function simAlt(curve,hov,from,lo,hi,pl,rnd){const s=[],n=Math.round(pl.react/DT),hist=[];let y=from,vy=0;const mid=(lo+hi)/2;
 for(let k=0;k<Math.round(5/DT);k++){const t=k*DT,seen=k>=n?hist[k-n]:[from,0],e=mid-seen[0],thr=Math.min(1,Math.max(0,pl.hs+pl.k*e-pl.kd*seen[1]+(rnd()-.5)*.02)),m=curve(thr);
  vy+=(34.5*((m/hov)**1.6)-34.5)*DT;vy*=1-DT*.8;y+=vy*DT;if(y<0){y=0;vy=0}hist.push([y,vy]);s.push({t,y,vy,thr,m})}
 return{lo,hi,s}}
