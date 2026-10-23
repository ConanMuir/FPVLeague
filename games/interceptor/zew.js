/* Electronic warfare: the noise-against-signal duel on your HUD while an emitter (the Jammer King and its relay pods, zboss-jammer.js) lives.
   The boss module feeds this engine each sim tick: where the emitters are and how hard each shouts (update(dt, src)), or null when there is
   no jamming. The engine turns that into one number, the NOISE on your screens (neff, 0..1), and everything the jamming does reads it:
     * the pip (the lock-on intercept point) drifts and jitters (skew), an uncertainty ring grows around it, ghost pips flicker near it
     * ghost tracks blink on the radar, the scope fills with static
     * lock-on takes longer (lockK) and drops now and then (lockDrop); helpers' odds fall (helperK)
   Noise comes from every emitter, each louder the nearer you are to it: a sum of w * (1 - d / R)^1.2 over the emitters, so the King's range
   is long, a pod's short, and every pod destroyed takes its share away. A pulse window (the King's quiet 4 s) removes most of it.
   BURN-THROUGH: a signal meter against the noise. Holding the real target in the seeker (a lock, or one building), closing the range to it
   and the pods already destroyed all raise SIGNAL; the share signal / (signal + noise) is the SNR. Above EW.on the signal burns through: for
   a window of EW.burnT seconds the pip snaps back exactly true and the jamming leaves the scope and the seeker; then the King re-tunes
   (EW.retune seconds before the next burn-through) and the noise comes back.
   The bots use the same functions: zlock.js draws and keeps the pip through skew(), zbotfly.js aims through the same skew(), and the
   helpers' odds and the lock-on time are the same lockK / helperK, so the bot spectator shows the duel the same way you would see it.
   Fair: a floor on usability. The pip never strays past a third of the way to the point, its error fades inside 1.5 km of the track (your
   eyes take over), the ghosts are dim and carry no text, the lock never drops inside 350 m or in its first second, and the lock-on time
   is at worst a little over three times its normal. Everything is state in E: clear() puts it all back exactly (the end of a wave, game over,
   quit), and left() says what is left (the harness asserts all zero). Randomness is a private stream, so the game's sequence is untouched.
   All numbers are game-tuned for feel. */
const cl=(v,a,b)=>v<a?a:v>b?b:v;
export const EW={
 errMax:260,errCap:.3,termR:1500,termK:.12,  /* the pip's drift at full noise (m), its cap as a share of the distance, and the fade inside termR */
 lockX:2.2,helpX:.4,  /* lock-on time: x(1 + lockX) at full noise; helpers lose helpX of their odds */
 drop:.14,dropFrom:.2,dropMin:350,dropHeld:1,  /* lock drops per second at full noise, above this noise, never nearer than this, never before this long held */
 ghosts:3,rGhosts:5,ghostR:90,  /* ghost pips on the HUD, ghost tracks on the radar, a ghost pip's reach (m) */
 win:.88,  /* a pulse window removes this share of the noise */
 on:.58,burnT:5,retune:1.5,rangeR:3000,  /* the SNR that burns through, the window (s), the pause before the next, the range the signal starts to build from */
 snap:.1};  /* how fast the jamming leaves the pip when it burns through (s) */
const hs=(a,b)=>{const x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x)};  /* a hash of two numbers, 0..1 */
export function initEW(api,G,Z){
 const {THREE}=api,V3=THREE.Vector3,_f=new V3(),_r=new V3(),_u=new V3(),_g=new V3();
 const E={on:false,clock:0,nb:0,wk:0,bk:0,neff:0,amp:0,snr:0,burn:0,cd:0,burns:0,age:0,hold:0,killed:0,pods:0,pm:0,lx:1,seed:0x9e3779b9};
 const rnd=()=>(E.seed=(Math.imul(E.seed,1664525)+1013904223)>>>0)/4294967296;
 function clear(){E.on=false;E.clock=0;E.nb=E.wk=E.bk=E.neff=E.amp=E.snr=E.burn=E.cd=E.burns=E.age=E.hold=E.killed=E.pods=E.pm=0;E.lx=1;E.seed=0x9e3779b9}
 /* ---------- the engine: one call per sim tick from the boss module (src: {em:[{x,y,z,w,R}], win, k, lx, pods, pm}, or null) ---------- */
 function update(dt,src){if(!src){if(E.on||E.neff||E.burn)clear();return}
  const me=api.player,live=me&&me.dead<=0,pos=live?me.p:api.camera.position;E.on=true;E.clock+=dt;
  let n=0;for(let i=0;i<src.em.length;i++){const e=src.em[i],d=Math.hypot(e.x-pos.x,e.y-pos.y,e.z-pos.z);if(d<e.R)n+=e.w*Math.pow(1-d/e.R,1.2)}
  E.nb=Math.min(1,n*(src.k??1));E.lx=src.lx??1;E.pods=src.pods|0;E.pm=Math.max(E.pm,src.pm|0,E.pods);E.killed=E.pm?1-E.pods/E.pm:0;
  E.wk+=((src.win?1:0)-E.wk)*(1-Math.exp(-dt/.25));
  /* the signal: the real target held in the seeker, the range to it closing, the emitters already down */
  const lk=Z.lk,tg=lk&&lk.t,cd=lk&&lk.cand,tr=tg||cd||(api.pickT&&api.live(api.pickT)?api.pickT:null);E.hold=tg?1:cd&&lk.prog>0?.3+.45*lk.prog:0;
  let rk=0,ck=0;if(tr&&live&&api.live(tr)){const d=tr.p.distanceTo(me.p);rk=cl(1-d/EW.rangeR,0,1)**1.5;ck=cl(-((tr.v.x-me.v.x)*(tr.p.x-me.p.x)+(tr.v.y-me.v.y)*(tr.p.y-me.p.y)+(tr.v.z-me.v.z)*(tr.p.z-me.p.z))/Math.max(d,1)/70,0,1)}
  const sg=.1+.55*E.hold+.5*rk*(.7+.3*ck)+.5*E.killed,tgt=sg/(sg+1.15*E.nb+.05);E.snr+=(tgt-E.snr)*(1-Math.exp(-dt/(tgt>E.snr?.6:1)));
  /* burn-through: a window of true pip and a clean seeker, then the emitters re-tune */
  if(E.burn>0){E.burn-=dt;E.age+=dt;if(E.burn<=0){E.burn=0;E.cd=EW.retune;E.snr=Math.min(E.snr,EW.on*.7);if(!api.demo&&E.burns===1)api.feed('<span class="co">The jamming returns</span>: the King has re-tuned, and will again')}}
  else{E.age=0;if(E.cd>0)E.cd-=dt;else if(E.snr>=EW.on&&tgt>=EW.on*.92&&E.nb>.25&&E.wk<.5){E.burn=EW.burnT;E.burns++;E.age=0;if(!api.demo){if(E.burns===1)api.feed('<span class="cg"><b>BURN-THROUGH</b></span>: your signal beats the noise, the pip is true for '+EW.burnT+' s (the bar says when)');api.tone?.(760,1500,.14,.05,'triangle')}}}
  E.bk+=((E.burn>0?1:0)-E.bk)*(1-Math.exp(-dt/(E.burn>0?EW.snap:.25)));
  E.neff=E.nb*(1-EW.win*E.wk)*(1-E.bk);E.amp=E.neff>.002?EW.errMax*Math.pow(E.neff,1.2):0;if(E.amp<.02)E.amp=0}
 /* ---------- the effects (every one reads E, and is exactly nothing when E is clear) ---------- */
 /* the pip: p moved in place by the jamming's drift and jitter (a function of the sim clock, so the HUD and a bot flying to it see the same
    pip); from = where you are, d = your range to the track. Returns the uncertainty ring's radius in metres (0 when clean). */
 function skew(p,from,d){if(E.amp<=0)return 0;const a=Math.min(E.amp*cl(d/EW.termR,EW.termK,1),EW.errCap*p.distanceTo(from));if(a<.02)return 0;
  _f.subVectors(p,from);if(_f.lengthSq()<1e-6)return 0;_f.normalize();_r.set(-_f.z,0,_f.x);if(_r.lengthSq()<1e-4)_r.set(1,0,0);_r.normalize();_u.crossVectors(_r,_f);
  const t=E.clock;
  p.addScaledVector(_r,a*(.62*Math.sin(.53*t+1.1)+.22*Math.sin(19.3*t)));p.addScaledVector(_u,a*(.45*Math.sin(.41*t+2.3)+.16*Math.sin(27.1*t+.7)));p.addScaledVector(_f,a*(.55*Math.sin(.37*t+.4)+.18*Math.sin(31.7*t+2.2)));
  return a*1.3}
 /* lock-on time factor, helpers' odds factor, and a lock that the jamming drops (true once; the lock-on module drops it) */
 const lockK=()=>E.on?1+EW.lockX*E.lx*E.neff:1,helperK=()=>E.on?1-EW.helpX*E.neff:1;
 function lockDrop(t,me,dt){if(!E.on||E.neff<EW.dropFrom||E.burn>0)return false;if(t.p.distanceTo(me.p)<EW.dropMin)return false;
  return rnd()<1-Math.exp(-EW.drop*(E.neff-EW.dropFrom)/(1-EW.dropFrom)*dt)}
 const ghostN=()=>E.on&&E.neff>.15?Math.round(E.neff*EW.ghosts):0,radarN=()=>E.on&&E.neff>.1?Math.round(E.neff*EW.rGhosts):0;
 /* ---------- drawing ---------- */
 /* from zlock.js's overlay, after the pip: ghost pips round it, static over it while jammed, a green ring when it has burned through.
    xy = the pip's screen position (or null: off screen), scr(p, W, H) projects a world point with the frame's camera */
 function pipFx(oc,scr,W,H,dp,from,xy,eu){if(!E.on)return;const nf=E.neff,now=performance.now(),fr=Math.floor(now/45),n=ghostN();
  _f.subVectors(dp,from);const ok=_f.lengthSq()>1;if(ok){_f.normalize();_r.set(-_f.z,0,_f.x);if(_r.lengthSq()<1e-4)_r.set(1,0,0);_r.normalize();_u.crossVectors(_r,_f)}
  if(n&&ok){
   oc.save();oc.lineWidth=1.6;oc.setLineDash([3,4]);
   for(let i=0;i<n;i++){const ep=Math.floor(E.clock/1.1+i*.37),th=hs(ep,i)*6.283,m=(EW.ghostR*.5+hs(i,ep)*EW.ghostR+E.amp*.5)*(.6+.4*nf);
    if(((E.clock*1.7+i*.31)%1)>.55)continue;_g.copy(dp).addScaledVector(_r,Math.cos(th)*m).addScaledVector(_u,Math.sin(th)*m);const q=scr(_g,W,H);if(!q||q[0]<0||q[0]>W||q[1]<0||q[1]>H)continue;
    oc.strokeStyle=`rgba(95,227,255,${.28+.2*hs(fr,i)})`;oc.beginPath();oc.arc(q[0],q[1],11,0,7);oc.moveTo(q[0]-17,q[1]);oc.lineTo(q[0]-6,q[1]);oc.moveTo(q[0]+6,q[1]);oc.lineTo(q[0]+17,q[1]);oc.moveTo(q[0],q[1]-17);oc.lineTo(q[0],q[1]-6);oc.moveTo(q[0],q[1]+6);oc.lineTo(q[0],q[1]+17);oc.stroke()}
   oc.restore()}
  if(!xy)return;
  /* the jamming's ring: how far the pip may be off the truth, grows with the noise (violet dashes; gone in a burn-through) */
  if(eu>1&&ok){const q=scr(_g.copy(dp).addScaledVector(_r,eu),W,H);if(q){oc.save();oc.strokeStyle='rgba(199,125,255,.75)';oc.lineWidth=1.6;oc.setLineDash([2,5]);oc.beginPath();oc.arc(xy[0],xy[1],Math.min(Math.max(Math.hypot(q[0]-xy[0],q[1]-xy[1]),16),H*.6),0,7);oc.stroke();oc.restore()}}
  if(nf>.06){const k=Math.min(46,Math.round(10+nf*44)),R=20+10*nf;oc.save();for(let i=0;i<k;i++){const a=hs(fr,i)*6.283,r=Math.sqrt(hs(i,fr+1))*R;oc.fillStyle=i&1?`rgba(199,125,255,${.35+.4*hs(fr+2,i)})`:`rgba(235,235,245,${.2+.3*hs(i,fr+3)})`;
    oc.fillRect(xy[0]+Math.cos(a)*r*1.3-3,xy[1]+Math.sin(a)*r,2+hs(fr+4,i)*6,1.4)}oc.restore()}
  if(E.bk>.05){oc.save();oc.strokeStyle=`rgba(109,255,158,${.85*E.bk})`;oc.lineWidth=2.4;oc.beginPath();oc.arc(xy[0],xy[1],15,0,7);oc.stroke();
   if(E.burn>0&&E.age<.4){const s=E.age/.4;oc.globalAlpha=1-s;oc.lineWidth=2;oc.beginPath();oc.arc(xy[0],xy[1],15+44*s,0,7);oc.stroke()}oc.restore()}}
 /* where the bar goes: just under the boss bar (its height changes with the screen width), read from the page a few times a second */
 let by=214,bt0=0;
 const barY=now=>{if(now-bt0>250){bt0=now;const z=document.getElementById('zbb');by=z&&!z.hidden?Math.round(z.getBoundingClientRect().bottom)+18:214}return by};
 /* the NOISE / SIGNAL bar, under the boss bar: the share of signal in green from the left, the rest static; the tick is the burn-through level */
 function bar(oc,W,H){if(!E.on||!G.on||G.state!=='wave'||api.demo||Z.cine)return;
  const w=Math.min(250,W*.56),h=10,x=(W-w)/2,now=performance.now(),y=barY(now),fr=Math.floor(now/50),bt=E.burn>0,win=E.wk>.5,sn=bt?1:cl(E.snr,0,1);
  oc.save();oc.shadowColor='#000';oc.shadowBlur=4;oc.font='700 11px "JetBrains Mono",monospace';oc.textBaseline='alphabetic';
  const lab=bt?`BURN-THROUGH ${E.burn.toFixed(1)} s`:win?'WINDOW · CLEAR':E.neff>.5?'JAMMED':E.neff>.2?'NOISY':'FAINT',col=bt?'#6dff9e':win?'#c9f5d8':'#c77dff';
  oc.textAlign='left';oc.fillStyle='#e4ebf2';oc.fillText('NOISE ▸ SIGNAL',x,y-5);oc.textAlign='right';oc.fillStyle=col;oc.fillText(lab,x+w,y-5);oc.shadowBlur=0;
  oc.fillStyle='rgba(8,6,16,.78)';oc.fillRect(x-1,y-1,w+2,h+2);
  oc.fillStyle=bt?'#3ddc84':'#2fbf71';oc.fillRect(x,y,Math.max(0,w*sn),h);
  if(sn<1){const x0=x+w*sn,n=Math.min(90,Math.ceil((x+w-x0)/2.5));for(let i=0;i<n;i++){oc.fillStyle=i&1?`rgba(199,125,255,${.45+.4*hs(fr,i)})`:`rgba(235,235,245,${.15+.4*hs(i,fr+1)})`;const hh=2+hs(fr+2,i)*(h-2);oc.fillRect(x0+i*2.5,y+(h-hh)*hs(i,fr+3),2,hh)}}
  oc.fillStyle='#fff';oc.fillRect(x+w*EW.on-1,y-3,2,h+6);oc.strokeStyle='rgba(255,255,255,.35)';oc.lineWidth=1;oc.strokeRect(x-.5,y-.5,w+1,h+1);
  if(bt){oc.fillStyle='rgba(255,255,255,.55)';oc.fillRect(x,y+h+3,w*E.burn/EW.burnT,2)}
  oc.restore()}
 /* ghost tracks on the radar (red blips like the real ones, but they blink and have no heading line); r0 = radar range in metres */
 function radarFx(rc,P){const n=radarN(),me=api.player;if(!n||!me||me.dead>0)return;const RR=api.RRS?.[api.S?.rr|0]||4000;
  rc.save();rc.lineWidth=2.5;rc.font='700 17px "JetBrains Mono",monospace';rc.textAlign='left';
  for(let i=0;i<n;i++){const ep=Math.floor(E.clock/1.3+i*.41);if(((E.clock*2.3+i*.29)%1)>.5)continue;const a=hs(ep,i+7)*6.283,r=(.25+.65*hs(i+3,ep))*RR*.95,q=P(me.p.x+Math.sin(a)*r,me.p.z-Math.cos(a)*r);
   rc.globalAlpha=.55+.35*hs(i,ep);rc.strokeStyle=rc.fillStyle='rgb(255,77,77)';rc.beginPath();rc.moveTo(q[0],q[1]-7);rc.lineTo(q[0]+7,q[1]);rc.lineTo(q[0],q[1]+7);rc.lineTo(q[0]-7,q[1]);rc.closePath();rc.fill();
   rc.fillText(`T${String(10+Math.floor(hs(ep,i)*89)).padStart(2,'0')} ${Math.round(2+hs(i,ep+5)*8)}`,q[0]+10,q[1]-8)}
  rc.restore()}
 /* ---------- hooks ---------- */
 const o0=Z.overlay;Z.overlay=oc=>{o0(oc);bar(oc,innerWidth,innerHeight)};
 const r0=Z.radar;Z.radar=(rc,P,sel,K)=>{r0(rc,P,sel,K);if(G.on&&E.on)radarFx(rc,P)};
 const zs=Z.start;Z.start=()=>{clear();zs()};
 const zx=Z.stop;Z.stop=()=>{zx();clear()};
 /* a one-line read for the boss bar: the pip's error band, or that it is clean */
 const line=()=>!E.on?'':E.burn>0?`<b>BURN-THROUGH ${Math.ceil(E.burn)} s</b> · pip true`:E.amp>=5?`pip ±${Math.max(10,Math.round(E.amp*1.3/10)*10)} m · SNR ${Math.round(E.snr*20)*5}%`:`pip true · SNR ${Math.round(E.snr*20)*5}%`;
 Z.ew={EW,E,update,skew,lockK,helperK,lockDrop,pipFx,line,clear,
  get on(){return E.on},get neff(){return E.on?E.neff:0},get burning(){return E.burn>0},get snr(){return E.snr},get amp(){return E.amp},ghostN,radarN,
  /* what is left (the harness: all zero once the wave is over) */
  left:()=>({ew:E.on?1:0,ewNoise:E.neff>0?1:0,ewBurn:E.burn>0||E.cd>0?1:0,ewGhost:ghostN()+radarN()}),
  state:()=>({on:E.on,nb:+E.nb.toFixed(3),neff:+E.neff.toFixed(3),amp:+E.amp.toFixed(1),snr:+E.snr.toFixed(3),burn:+E.burn.toFixed(2),burns:E.burns,wk:+E.wk.toFixed(2),hold:+E.hold.toFixed(2),killed:+E.killed.toFixed(2),pods:E.pods,pm:E.pm,lockK:+lockK().toFixed(2),helperK:+helperK().toFixed(2),ghosts:ghostN(),rGhosts:radarN()})};
 return Z.ew}
