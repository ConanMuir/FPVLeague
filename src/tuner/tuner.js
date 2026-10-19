// Real-time auto-tuner for the Calibration Lab. Pure (no DOM, no three.js): the Lab feeds it one rep's metrics at a time
// and applies profile()/extras() straight away so the pilot feels every change.
//
// How it moves a setting (explainable on purpose):
//  - Each drill keeps a running average of its metrics (first reps weigh most, then an EMA with alpha 0.3), so one odd rep
//    can't swing the tune.
//  - Each setting has its own step size, starting at the preset's g0 (Default 12%, Pro 10% of the value for rates; of the
//    allowed range for expo, throttle and assist). A step that reverses the previous direction means the tuner went past the
//    sweet spot, so that setting's step shrinks to 55%; two steps the same way grow it back by 10% (never above g0).
//  - Hard bounds from the preset (sane Betaflight ranges) clamp every value.
//  - After a change, the next two reps of the same drill are the verdict: if their score is clearly worse than before the
//    change (> 1.3x + 0.25), the change is backed off to the old value and that setting's step is halved. A drill makes at
//    most one change per verdict, so the pilot never chases a moving target.
//  - Deadband and throttle mid are measured, not searched: they move straight toward the measured value (still bounded).
import {rateR} from '../flight/rates.js';
import {PRESETS} from './presets.js';
import {fromShape,toShape} from './rshape.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,R=Math.round,AXN=['Roll','Pitch','Yaw'],ema=(o,n,a)=>o==null?n:o+(n-o)*a,mean=a=>a.reduce((s,v)=>s+v,0)/(a.length||1);
export const rel=(v,t)=>Math.max(0,(v??0)-t)/Math.max(t,1);
export const fmt=(q,v)=>q.mul?R(v)+' '+q.u:q.k==='dz'||q.k==='dzy'?`${v.toFixed(3)} (BF ${R(v*500)})`:q.d===0?R(v)+q.u:v.toFixed(q.d);
// prof: the rate profile to start from ({type, ax, thrMid, thrExpo, thrLimit}); ext: {dz, dzy, assist}
export function makeTuner(pid,prof,ext={}){const P0=PRESETS[pid]||PRESETS.def,P={...P0,g0:P0.g0*(ext.speed||1)},type=P.type||prof.type,sh=prof.ax.map(a=>toShape(prof.type,a));
 const T={P,pid:P.id,type,thrLimit:prof.thrLimit??100,p:{},E:{},log:[],pend:[],loss:{},reps:0,changes:0,dzFloor:null};
 const add=(k,v,[lo,hi],o)=>{T.p[k]={k,v:cl(v,lo,hi),v0:v,lo,hi,g:P.g0,sg:0,n:0,...o}};
 sh.forEach((s,i)=>{const y=i===2;add('c'+i,s.c,P.b[y?'cy':'c'],{mul:1,lab:AXN[i]+' centre',u:'°/s'});add('m'+i,s.m,P.b[y?'my':'m'],{mul:1,lab:AXN[i]+' max rate',u:'°/s'});add('e'+i,s.e,P.b[y?'ey':'e'],{lab:AXN[i]+' expo',d:2})});
 add('dz',ext.dz??.03,P.b.dz,{lab:'Stick deadband',d:3});add('dzy',ext.dzy??ext.dz??.03,P.b.dzy,{lab:'Yaw deadband',d:3});
 add('tm',prof.thrMid??50,P.b.tm,{lab:'Throttle mid',u:'',d:0});add('te',prof.thrExpo??0,P.b.te,{lab:'Throttle expo',u:'',d:0});add('tl',prof.thrLimit??100,P.b.tl||[100,100],{lab:'Throttle limit',u:'%',d:0});add('as',ext.assist||0,P.b.as,{lab:'Assist',d:2});
 if(type!==prof.type)T.log.push({txt:`${P.name} preset tunes in ${type} rates: your ${prof.type} curve converted with the same centre, max and expo`});
 for(const k in T.p){const q=T.p[k];if(Math.abs(q.v-q.v0)>1e-9)T.log.push({k,from:q.v0,to:q.v,txt:`${P.name} range: ${q.lab} ${fmt(q,q.v0)} → ${fmt(q,q.v)}`})}
 return T}
const shape=(T,i)=>({c:T.p['c'+i].v,m:Math.max(T.p['m'+i].v,T.p['c'+i].v),e:T.p['e'+i].v});
// the working rate profile, in the rates panel's raw integers
export const profile=T=>({type:T.type,ax:[0,1,2].map(i=>fromShape(T.type,shape(T,i))),thrMid:R(T.p.tm.v),thrExpo:R(T.p.te.v),thrLimit:R(T.p.tl.v)});
export const extras=T=>({dz:+T.p.dz.v.toFixed(3),dzy:+T.p.dzy.v.toFixed(3),assist:+T.p.as.v.toFixed(2)});
// °/s on axis i at stick x, with one knob scaled (continuous, before rounding)
export function rateAt(T,i,x,k,f=1){const s=shape(T,i);if(k)s[k]*=f;const ax=[[0,0,0],[0,0,0],[0,0,0]];ax[i]=fromShape(T.type,s,false);return rateR({type:T.type,ax},i,x)*180/Math.PI}
// the knob (centre or max rate) that changes the rate most at the stick deflection the pilot actually uses, among the knobs
// that still have room to move in direction s
export function knob(T,i,x,s=0){const r=rateAt(T,i,x),room=k=>{const q=T.p[k+i];return s>0?q.v<q.hi-.5:s<0?q.v>q.lo+.5:true};
 const dc=room('c')?rateAt(T,i,x,'c',1.05)-r:-1,dm=room('m')?rateAt(T,i,x,'m',1.05)-r:-1;return(dm>dc?'m':'c')+i}
// one bounded, adaptive step on setting k in direction s (+1/-1); mag 0..1 scales the step (at least a quarter step)
export function nudge(T,k,s,mag,why){const q=T.p[k];if(!q||q.hi-q.lo<1e-9)return null;
 if(q.sg&&q.sg!==s)q.g=Math.max(q.g*.55,T.P.g0*.15);else if(q.sg===s)q.g=Math.min(T.P.g0,q.g*1.1);q.sg=s;q.n++;
 const st=q.g*cl(mag||0,.25,1),to=cl(q.mul?q.v*Math.exp(s*st):q.v+s*st*(q.hi-q.lo),q.lo,q.hi);
 if(Math.abs(to-q.v)<(q.mul?.5:(q.hi-q.lo)*.003))return null;  // already at a bound
 const c={k,from:q.v,to,why,txt:`${why} → ${s>0?'raising':'lowering'} ${q.lab} ${fmt(q,q.v)}→${fmt(q,to)}`,rep:T.reps};q.v=to;T.log.push(c);T.changes++;return c}
// measured settings: move straight toward the measurement, at most maxF of the range per update
export function setTo(T,k,target,maxF,why){const q=T.p[k],to=cl(cl(target,q.v-maxF*(q.hi-q.lo),q.v+maxF*(q.hi-q.lo)),q.lo,q.hi);
 if(Math.abs(to-q.v)<(q.hi-q.lo)*.004)return null;const c={k,from:q.v,to,why,txt:`${why} → ${q.lab} ${fmt(q,q.v)}→${fmt(q,to)}`,rep:T.reps};q.v=to;T.log.push(c);T.changes++;return c}
// one rep of drill group grp scored `loss` (0 = on target): judge pending changes, then say whether a new change may be made
function verdict(T,grp,loss){T.loss[grp]=ema(T.loss[grp],loss,.5);let ok=true;
 for(const c of T.pend.filter(c=>c.grp===grp)){c.after.push(loss);T.pend.splice(T.pend.indexOf(c),1);const a=mean(c.after);  // judged after one more rep, so the tune keeps moving while you fly
  if(a>c.before*1.3+.25){const q=T.p[c.k];q.v=c.from;q.g=Math.max(q.g*.5,T.P.g0*.15);q.sg=0;ok=false;
   T.log.push({k:c.k,from:c.to,to:c.from,back:1,txt:`Worse after that change (score ${c.before.toFixed(2)}→${a.toFixed(2)}) → backing off ${q.lab} to ${fmt(q,c.from)}`})}}
 return ok}
const track=(T,grp,c)=>{if(c){c.grp=grp;c.before=T.loss[grp]??0;c.after=[];T.pend.push(c)}return c};
const stats=(T,key,M,keys)=>{const E=T.E[key]||(T.E[key]={n:0}),a=Math.max(.3,1/(++E.n));for(const k of keys)if(M[k]!=null)E[k]=ema(E[k],+M[k],a);return E};
const p0=v=>R(v??0);

// ---- snaps on axis i: overshoot -> less rate where the stick was; stopping short / pinned stick -> more; wobble -> expo (Default) or less centre (Pro)
export function onSnap(T,i,M){if(!M||!M.valid)return[];T.reps++;const E=stats(T,'s'+i,{...M,miss:M.reached?0:1},['os','us','settle','osc','rev','lag','sat','use','miss']),tg=T.P.tg,pro=T.pid==='pro',A=AXN[i];
 const L=rel(E.os,tg.os)+rel(E.us,tg.us)+.6*rel(E.settle,tg.settle)+.5*Math.max(0,E.osc-tg.osc)+(pro?.5*rel(E.lag,tg.lag):0)+E.miss;if(!verdict(T,'s'+i,L))return[];
 const n=(k,s,m,why)=>track(T,'s'+i,nudge(T,k,s,m,why)),x=cl(E.use||.5,.1,1);let c=null;
 if(E.os>tg.os)c=n(knob(T,i,x,-1),-1,rel(E.os,tg.os),`${A} overshoot ${p0(E.os)}% (target ≤ ${tg.os}%) at ~${p0(x*100)}% stick`);
 else if(E.osc>tg.osc+.5)c=pro?n(knob(T,i,.15,-1),-1,.6,`${A} wobbles ${E.osc.toFixed(1)}× around the target`):n('e'+i,1,.6,`${A} wobbles ${E.osc.toFixed(1)}× around the target`);
 else if(E.sat>.35)c=n('m'+i,1,E.sat,`${A} stick pinned for ${p0(E.sat*100)}% of the move`);
 else if(E.us>tg.us||E.miss>.5)c=n(knob(T,i,x,1),1,Math.max(rel(E.us,tg.us),E.miss),`${A} stops ${p0(E.us)}% short (target ≤ ${tg.us}%)`);
 else if(pro&&E.lag>tg.lag)c=T.p['e'+i].v>.2?n('e'+i,-1,rel(E.lag,tg.lag),`${A} stick-to-quad lag ${p0(E.lag)} ms (target ≤ ${tg.lag} ms)`):n('c'+i,1,rel(E.lag,tg.lag),`${A} stick-to-quad lag ${p0(E.lag)} ms (target ≤ ${tg.lag} ms)`);
 else if(E.settle>tg.settle)c=n(knob(T,i,.2,1),1,rel(E.settle,tg.settle),`${A} creeps in slowly (settle ${p0(E.settle)} ms, target ≤ ${tg.settle} ms)`);
 return c?[c]:[]}

// ---- small corrections, per axis over one window: lagging the target -> more centre; hunting around it -> more expo (Default) / less centre (Pro);
// small inputs swallowed by the deadband -> smaller deadband (never below the measured stick noise); jittery sticks (Default) -> a little smoothing assist
export function onTrack(T,Ms,dzNow){if(!Ms)return[];T.reps++;const tg=T.P.tg,pro=T.pid==='pro',out=[];let jit=0;
 Ms.forEach((M,i)=>{const E=stats(T,'t'+i,M,['rms','bias','zc','jit','stall','use']),A=AXN[i],g='t'+i;jit+=E.jit/3;if(!verdict(T,g,rel(E.rms,tg.track)))return;
  const n=(k,s,m,why)=>track(T,g,nudge(T,k,s,m,why));let c=null;
  if(E.rms>tg.track){if(E.bias>.35)c=n('c'+i,1,rel(E.rms,tg.track),`${A} lags the drifting target (${E.rms.toFixed(1)}° RMS, target ≤ ${tg.track}°)`);
   else if(E.zc>.6||E.jit>1)c=pro?n(knob(T,i,.15,-1),-1,.5,`${A} hunts around the target (${E.zc.toFixed(1)} crossings/s)`):n('e'+i,1,.5,`${A} hunts around the target (${E.zc.toFixed(1)} crossings/s)`)}
  if(c)out.push(c);
  if(E.stall>.15){const k=i===2?'dzy':'dz',q=T.p[k],c2=setTo(T,k,Math.max(T.dzFloor?.[i===2?1:0]??q.lo,q.v*.8),.05,`small ${A} corrections lost in the deadband ${p0(E.stall*100)}% of the time`);if(c2)out.push(c2)}});
 if(!pro&&jit>1.5&&!out.length){const c=nudge(T,'as',1,.4,`jittery sticks (${jit.toFixed(1)} reversals/s)`);if(c)out.push(c)}
 return out}

// ---- holding a height (live, every ~1.5 s in the hover and altitude drills): can you hold the throttle?
// bouncing through the band -> softer throttle around hover (more expo); sinking or climbing with the stick held still -> throttle mid
// follows the motor you actually need; stick pinned at an end and still outside the band -> less expo (more authority)
// the quad's real hover throttle (from its thrust and weight): throttle mid goes there at once, so the expo flattens the curve
// around hover instead of around mid-stick; set at the start of every pack and retry
export function onHoverPhys(T,h){if(!(h>0&&h<1))return[];T.hovPhys=h;const c=setTo(T,'tm',100*h/(T.p.tl.v/100),1,`your quad hovers at ${R(h*100)}% throttle`);return c?[c]:[]}
// after the throttle limit moves, throttle mid follows so the curve still pivots on the real hover
function repivot(T,out){if(!T.hovPhys)return;const c=setTo(T,'tm',100*T.hovPhys/(T.p.tl.v/100),1,`throttle mid re-centred on hover at ${R(T.p.tl.v)}% limit`);if(c)out.push(c)}
export function onHold(T,M){if(!M)return[];T.reps++;const out=[],tg=T.P.tg,band=(M.hi-M.lo)||2.4;
 if(!T.hovPhys&&M.steady&&Math.abs(M.drift)>.6){const c=setTo(T,'tm',M.motor*100,.06,`${M.drift<0?'sinks':'climbs'} ${Math.abs(M.drift).toFixed(1)} m/s with the throttle held still`);if(c)out.push(c)}
 const loss=Math.max(0,M.amp/band-.5)+.4*Math.max(0,M.bounce-.5)+(1-M.inb);if(!verdict(T,'h',loss))return out;const n=(k,s,m,why)=>{const c=track(T,'h',nudge(T,k,s,m,why));if(c)out.push(c)};
 const soften=(m,w)=>{if(T.p.te.v<T.p.te.hi-.5)n('te',1,m,w);else{n('tl',-1,m,w+' with the throttle curve already soft');repivot(T,out)}};  // first softer around hover (expo), then less thrust per stick (throttle limit)
 if(M.bounce>.6&&M.amp>band*.45)soften(Math.min(1,M.amp/band),`can't hold the height: bouncing ${M.amp.toFixed(1)} m at ${M.bounce.toFixed(1)}/s`);
 else if(M.above>.35&&M.sat<.35)soften(Math.min(1,M.above*1.4),`over-throttling: above the band ${R(M.above*100)}% of the time`);
 else if(M.below>.35&&M.sat<.2)n('te',1,Math.min(1,M.below*1.4),`under-throttling: below the band ${R(M.below*100)}% of the time`);
 else if(M.sat>.35&&M.inb<.5)n('te',-1,M.sat,`throttle at the end of its travel ${Math.round(M.sat*100)}% of the time and still outside the band`);
 return out}

// ---- altitude gates: throttle mid follows the measured hover; bouncing through the band -> more throttle expo; slow with the stick at an end -> less
// (the altitude drill also scores each 5 s band)
export function onAlt(T,M){if(!M)return[];T.reps++;const out=[],tg=T.P.tg;if(M.hover!=null&&!T.hovPhys){T.hov=ema(T.hov,M.hover,.5);const c=setTo(T,'tm',T.hov*100,.15,`hovers at ${p0(T.hov*100)}% motor`);if(c)out.push(c)}
 const E=stats(T,'a',{...M,tEnter:M.tEnter??6},['over','exits','tEnter','sat']);
 if(!verdict(T,'a',rel(E.over,tg.alt)+.3*Math.max(0,E.exits-1)+.3*rel(E.tEnter,2.5)))return out;const n=(k,s,m,why)=>{const c=track(T,'a',nudge(T,k,s,m,why));if(c)out.push(c)};
 if(E.over>tg.alt||E.exits>1.5)n('te',1,Math.max(rel(E.over,tg.alt),.4),`height overshoots the band (${E.over.toFixed(2)}× band, ${E.exits.toFixed(1)} exits)`);
 else if(E.tEnter>2.5&&E.sat>.3)n('te',-1,.6,`slow to reach the new height (${E.tEnter.toFixed(1)} s) with the throttle at the end of its travel`);
 return out}

// ---- hold still. Hands off: the deadband must swallow the resting stick (centre offset + noise), with a small margin
// (Pro keeps it tight). Hover: yaw cross-talk from working the throttle stick sets the yaw deadband; the hover motor sets throttle mid.
export function onRest(T,N){if(!N)return[];const pad=T.pid==='pro'?.005:.01,rp=Math.max(N[0].need,N[1].need),y=N[2].need;T.dzFloor=[rp,y];
 return[setTo(T,'dz',rp*1.25+pad,1,`sticks rest within ${rp.toFixed(3)} of centre`),setTo(T,'dzy',y*1.25+pad,1,`yaw rests within ${y.toFixed(3)} of centre`)].filter(Boolean)}
export function onHover(T,{motor,cross}){const out=[];if(cross!=null&&T.dzFloor){const c=setTo(T,'dzy',Math.max(T.dzFloor[1]*1.25,cross*1.1),.3,`yaw moves ${cross.toFixed(3)} while you work the throttle`);if(c)out.push(c)}
 if(motor!=null&&!T.hovPhys){T.hov=motor;const c=setTo(T,'tm',motor*100,1,`hovers at ${p0(motor*100)}% motor`);if(c)out.push(c)}return out}

// before/after rows for the end-of-pack summary
export const summary=T=>Object.values(T.p).map(q=>({k:q.k,lab:q.lab,from:fmt(q,q.v0),to:fmt(q,q.v),changed:Math.abs(q.v-q.v0)>(q.mul?.5:(q.hi-q.lo)*.003)}));
