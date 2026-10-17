// Binding detection: which control did the pilot just move? Pure and frame-driven (plain {axes, buttons} objects, a clock in
// ms), so it is unit-tested with synthetic gamepads. Channel ids: 0-99 axes, 100+j buttons (analog value 0..1), the same ids
// S.cal / S.xcal use.
//
// Triggers show up differently per browser/driver, and each case is handled:
//  - analog button (Chrome "standard" mapping): value 0..1. Digital buttons that report value 0 while pressed count as 1.
//  - axis resting at -1 (Firefox, many DirectInput pads): moves -1 -> +1.
//  - axis that reads 0 until it is first pressed, then rests at -1 (Chrome on some pads): the press is caught (0 -> +1); on
//    release the axis settles at -1, which becomes its rest, and the binding is flagged so the game treats the never-touched 0
//    as rest too (no phantom half-throttle).
//  - both at once (axis and button for the same trigger): both deflect fully; the button wins the tie.
// Robustness: every step starts with a short baseline. Channels that move at rest (noisy, drifting, accelerometers) are
// ignored for that step; a baseline spoiled by a big movement restarts. A detection needs a clear deliberate change (30% of
// the channel's travel) held by the same channel for 250 ms, and the binding is only stored once the control is released.
export const chans=g=>{const o={};(g?.axes||[]).forEach((v,i)=>o[i]=Number.isFinite(+v)?+v:0);(g?.buttons||[]).forEach((b,j)=>{const v=+(b?.value??0)||0;o[100+j]=v||(b?.pressed?1:0)});return o};
const span=id=>id>=100?1:2,dev=(D,id,v)=>Math.abs(v-D.rest[id])/span(id)+(id>=100?.03:0);
// o: {used: [ids to skip], base: baseline ms (default 900), hold: ms (250), noise: rest tolerance for axes (0.08; buttons 0.15)}
export function detector(o={}){return{ph:'base',used:new Set(o.used||[]),bms:o.base??900,hold:o.hold??250,tol:o.noise??.08,t0:null,lo:{},hi:{},sum:{},n:0,tries:0,
 rest:{},zero:new Set(),noisy:new Set(),cand:null,ct:0,ext:0,lastV:null,stT:0,res:null,msg:''}}
// feed one frame; returns the phase: 'base' (capturing rest) -> 'wait' (move a control) -> 'release' -> 'done' (D.res set)
export function detect(D,g,now){const ch=chans(g);
 if(D.ph==='base'){if(D.t0==null)D.t0=now;let spoilt=false;
  for(const id in ch){const v=ch[id];D.lo[id]=Math.min(D.lo[id]??v,v);D.hi[id]=Math.max(D.hi[id]??v,v);D.sum[id]=(D.sum[id]||0)+v;if(D.hi[id]-D.lo[id]>.5&&!D.used.has(+id))spoilt=true}D.n++;
  if(spoilt&&D.tries<3){D.tries++;D.t0=now;D.lo={};D.hi={};D.sum={};D.n=0;D.msg='Something moved: hands off for a moment…';return D.ph}
  if(now-D.t0<D.bms){D.msg='Hands off the sticks for a moment…';return D.ph}
  for(const id in D.sum){const r=D.sum[id]/D.n;D.rest[id]=r;if(D.hi[id]-D.lo[id]>(id>=100?.15:D.tol))D.noisy.add(+id);if(+id<100&&D.lo[id]===0&&D.hi[id]===0)D.zero.add(+id)}
  D.ph='wait';D.msg='';return D.ph}
 if(D.ph==='wait'){let best=null,bd=0;for(const id in ch){const k=+id;if(D.used.has(k)||D.noisy.has(k)||D.rest[k]==null)continue;const d=dev(D,k,ch[id]);if(d>bd){bd=d;best=k}}
  if(best==null||bd<.3){D.cand=null;return D.ph}
  if(D.cand!==best){D.cand=best;D.ct=now;D.ext=ch[best]}
  if(Math.abs(ch[best]-D.rest[best])>Math.abs(D.ext-D.rest[best]))D.ext=ch[best];
  if(now-D.ct>=D.hold){D.ph='release';D.lastV=ch[best];D.stT=now;D.msg='Got it. Let go.'}return D.ph}
 if(D.ph==='release'){const id=D.cand,v=ch[id]??D.rest[id],r=D.rest[id];if(Math.abs(v-D.lastV)>.03){D.lastV=v;D.stT=now}
  if(Math.abs(v-r)>Math.abs(D.ext-r))D.ext=v;
  // settled (not moving for 200 ms) back at rest; or "late": an axis trigger that read 0 until its first press and now rests at -1
  const still=now-D.stT>=200,back=still&&Math.abs(v-r)<.25*span(id),late=still&&id<100&&D.zero.has(id)&&D.ext>.5&&v<-.5;
  if(back||late){const rest=late?v:r;D.res={id,rest,ext:D.ext,dir:Math.sign(D.ext-rest)||1,btn:id>=100,trig:id<100&&Math.abs(rest)>.5,late};D.ph='done'}
  else D.msg='Let it go back to rest…';return D.ph}
 return D.ph}
// what the detector found, as stored in S.cal / S.xcal (i: 0 throttle, 1 yaw, 2 pitch, 3 roll). x: Xbox profile (spring throttle
// on a centred stick). r = rest of an axis trigger, used until that axis first reports (see input.js src()).
export function calEntry(res,i,x){const{id,rest,ext}=res,r=res.trig?{r:rest}:{};
 if(res.btn)return i?{a:id,c:0,s:1}:{a:id,c:.5,s:.5};
 if(!i)return x&&!res.trig&&Math.abs(rest)<.5?{a:id,c:rest,s:ext-rest,m:'spring'}:{a:id,c:(rest+ext)/2,s:(ext-rest)/2,...r};
 return{a:id,c:rest,s:ext-rest,...r}}
// the other direction of a one-way control (button or trigger) for yaw/pitch/roll: a paired button index (old format, b) or any channel (nb)
export const negEntry=res=>res.btn?{b:res.id-100}:{nb:{a:res.id,c:res.rest,s:res.ext-res.rest,...(res.trig?{r:res.rest}:{})}};
// a fire / flip / boost binding: button index, or 'aN' (axis above +0.5) / 'aN-' (axis below -0.5)
export const btnEntry=res=>res.btn?res.id-100:'a'+res.id+(res.dir<0?'-':'');
export const oneWay=res=>res.btn||res.trig;
