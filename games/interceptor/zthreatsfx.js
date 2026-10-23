// Zombies threat sound (WebAudio synth, no samples): every incoming threat is heard where it is and as it moves. Each kind has its own voice
// (prop drones buzz, FPV quads whine, the jet Geran roars, cruise missiles hiss), placed by distance, air absorption and stereo, pitched by
// Doppler (yours and theirs) and heard late by the speed of sound: from where it was when the sound left it. Supersonic tracks are silent
// until their shock cone reaches you, so you hear them AFTER they pass: the crack (an N-wave, the double "ba-boom"), then the rumble and the
// tearing roar of the wake. A close pass whoosh-es and shakes the picture. If nobody stops them, they fly past with the right sound.
// Voice budget: VMAX continuous voices (the loudest / closest tracks, with hysteresis so they don't flap) and OMAX one-shots at a time; the
// rest are skipped, so 100+ tracks cost the same as 8. The perf governor (tree shadows off) lowers VMAX.
// Also the late-game event sounds for zreentry.js: the re-entry alarm, the rising rumble, the Golden Dome uplink and the intercept crack.
// Everything goes into zaudio's effects bus: the Zombies effects slider, the slow-mo muffle and the compressor apply. Zombies only.
// PATCH holds the synth on its own (context, noise buffer, destination, start time, level), so tools/audio-levels.mjs renders the
// same sounds in an OfflineAudioContext and measures them against the explosions and the music. Levels are game values chosen by ear and meter.
import {AC,nbuf} from '../../engine/audio.js';
import {KIND} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a);
export const CS=343;  // speed of sound (m/s)
export const VMAX=8,OMAX=8,BCAP=3.5;  // continuous voices, one-shots at a time, longest speed-of-sound delay (s; like zaudio's explosions)

// ---------- patches ----------
const bq=(c,type,f,q=.7)=>{const b=c.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b};
const env=(c,t0,pk,a,dur)=>{const g=c.createGain();g.gain.value=.0001;g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(Math.max(pk,.0002),t0+a);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);return g};  /* starts at the floor: a gain is 1 until its first event (zaudio.js env) */
const noiseSrc=(c,nb,t0,dur)=>{const s=c.createBufferSource();s.buffer=nb;s.loop=true;s.start(t0,Math.random()*1.4);s.stop(t0+dur+.05);return s};
const NW=new WeakMap();
// the N-wave: pressure jumps up, falls straight through zero, jumps back. Its two jumps are the "ba-boom"
function nwave(c){let b=NW.get(c);if(b)return b;const sr=c.sampleRate,L=Math.round(sr*.3),N=Math.round(sr*.12),r=Math.max(2,Math.round(sr*.0005));b=c.createBuffer(1,L,sr);const d=b.getChannelData(0);
 for(let i=0;i<L;i++)d[i]=i<r?i/r:i<N?1-2*(i-r)/(N-r):i<N+r?-1+(i-N)/r:0;NW.set(c,b);return b}
export const PATCH={
 // sonic boom: the N-wave (len = seconds between the two cracks), a felt thump, then a rolling rumble; dull 0..1 = far (duller, slower edges)
 boom(c,nb,dst,t0,lv,{len=.12,dull=0,roll=1}={}){const s=c.createBufferSource();s.buffer=nwave(c);s.playbackRate.value=.12/cl(len,.03,.4);
  const lp=bq(c,'lowpass',cl(11000*(1-dull)**2+220,220,11000),.5),g=c.createGain();g.gain.value=lv;s.connect(lp).connect(g).connect(dst);s.start(t0);
  const o=c.createOscillator();o.frequency.setValueAtTime(64,t0);o.frequency.exponentialRampToValueAtTime(28,t0+.4);o.connect(env(c,t0,lv*.95,.008,.5)).connect(dst);o.start(t0);o.stop(t0+.55);
  if(roll>0&&nb){const n=noiseSrc(c,nb,t0+.04,.4+roll*2.6),f=bq(c,'lowpass',420*(1-.5*dull),.8);f.frequency.setValueAtTime(460*(1-.5*dull),t0);f.frequency.exponentialRampToValueAtTime(65,t0+.3+roll*2.4);
   n.connect(f).connect(env(c,t0+.04,lv*.95*Math.min(1.4,roll),.22,.4+roll*2.6)).connect(dst)}
  return t0+.5+roll*2.6},
 // a pass: band-limited noise sweeping down while it crosses the stereo field; low = a roar under it (jets, missiles)
 whoosh(c,nb,dst,t0,lv,{dur=.8,f0=2600,f1=380,p0=-.6,p1=.6,low=0}={}){const n=noiseSrc(c,nb,t0,dur),b=bq(c,'bandpass',f0,1.1),g=env(c,t0,lv,dur*.3,dur);b.frequency.setValueAtTime(f0,t0);b.frequency.exponentialRampToValueAtTime(f1,t0+dur*.9);n.connect(b).connect(g);
  let o=g;if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.setValueAtTime(cl(p0,-1,1),t0);p.pan.linearRampToValueAtTime(cl(p1,-1,1),t0+dur*.7);g.connect(p);o=p}o.connect(dst);
  if(low>0){const r=noiseSrc(c,nb,t0,dur*1.6),f=bq(c,'lowpass',380,.7);f.frequency.setValueAtTime(520,t0);f.frequency.exponentialRampToValueAtTime(110,t0+dur*1.5);r.connect(f).connect(env(c,t0,lv*low,dur*.25,dur*1.6)).connect(dst)}
  return t0+dur*1.6},
 // the re-entry stinger: falling klaxon sweeps (three for an ICBM, two for a ballistic missile); big adds a low brass hit and a sub drop
 alarm(c,nb,dst,t0,lv,big=1){const n=big?3:2;for(let i=0;i<n;i++){const t=t0+i*.31;for(const[m,ty]of[[1,'sawtooth'],[1.5,'square']]){const o=c.createOscillator();o.type=ty;o.frequency.setValueAtTime(1500*m,t);o.frequency.exponentialRampToValueAtTime(470*m,t+.27);
    o.connect(bq(c,'bandpass',1300,.8)).connect(env(c,t,lv*(m>1?.18:.5),.006,.29)).connect(dst);o.start(t);o.stop(t+.32)}}
  if(big){const L=2.2,lp=bq(c,'lowpass',180,1.6);lp.frequency.setValueAtTime(180,t0);lp.frequency.exponentialRampToValueAtTime(1700,t0+.16);lp.frequency.exponentialRampToValueAtTime(240,t0+L);lp.connect(env(c,t0,lv*.55,.03,L)).connect(dst);
   for(const f of[41.2,55,61.7,82.4])for(const dt of[-8,8]){const o=c.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=dt;o.connect(lp);o.start(t0);o.stop(t0+L+.05)}
   const s=c.createOscillator();s.frequency.setValueAtTime(95,t0);s.frequency.exponentialRampToValueAtTime(26,t0+1.3);s.connect(env(c,t0,lv*.9,.004,1.4)).connect(dst);s.start(t0);s.stop(t0+1.45)}
  return t0+(big?2.3:.7)},
 // the rising rumble of a re-entry, as one sound (tools only; in the game it is a live voice that follows the warhead): dur seconds of swell
 rumble(c,nb,dst,t0,lv,dur=6){const n=noiseSrc(c,nb,t0,dur),f=bq(c,'lowpass',50,.9);f.frequency.setValueAtTime(50,t0);f.frequency.exponentialRampToValueAtTime(380,t0+dur);const g=c.createGain();g.gain.value=.0001;g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(lv,t0+dur);g.gain.linearRampToValueAtTime(.0001,t0+dur+.05);n.connect(f).connect(g).connect(dst);
  const s=c.createOscillator();s.frequency.setValueAtTime(30,t0);s.frequency.linearRampToValueAtTime(44,t0+dur);const sg=c.createGain();sg.gain.value=.0001;sg.gain.setValueAtTime(.0001,t0);sg.gain.exponentialRampToValueAtTime(lv*.6,t0+dur);sg.gain.linearRampToValueAtTime(.0001,t0+dur+.05);s.connect(sg).connect(dst);s.start(t0);s.stop(t0+dur+.1);return t0+dur},
 // Golden Dome uplink: the ground station's rising lock chirp and two confirm beeps
 uplink(c,nb,dst,t0,lv){const o=c.createOscillator();o.type='triangle';o.frequency.setValueAtTime(700,t0);o.frequency.exponentialRampToValueAtTime(2600,t0+.32);o.connect(env(c,t0,lv,.01,.36)).connect(dst);o.start(t0);o.stop(t0+.4);
  for(let i=0;i<2;i++){const b=c.createOscillator(),t=t0+.4+i*.12;b.frequency.value=1760;b.connect(env(c,t,lv*.7,.004,.08)).connect(dst);b.start(t);b.stop(t+.1)}return t0+.7}};

// per kind: o1 / o2 = [Hz, wave, gain], n = noise [Hz, filter, Q, gain], lp = brightest lowpass up close, lfo = [Hz, depth] (prop flutter),
// lv = level at the reference distance ref (m), sh = shake on a pass at 0 m, rpm = pitch follows the throttle (jets). ss = the roar a supersonic
// track leaves behind once its boom has reached you (ballistic, hypersonic, ICBM, Golden Dome kill vehicles)
const VK={
 shahed:{o1:[118,'sawtooth',.5],o2:[236,'square',.12],n:[700,'lowpass',.8,.22],lp:1800,lfo:[7.5,.3],lv:.3,ref:150,sh:.25},
 decoy:{o1:[152,'sawtooth',.45],o2:[304,'square',.1],n:[900,'lowpass',.8,.2],lp:2000,lfo:[9,.3],lv:.2,ref:110,sh:.15},
 heavy:{o1:[84,'sawtooth',.55],o2:[168,'square',.15],n:[520,'lowpass',.8,.3],lp:1300,lfo:[6,.22],lv:.4,ref:190,sh:.35},
 boss:{o1:[52,'sawtooth',.6],o2:[104,'sawtooth',.3],n:[400,'lowpass',.7,.35],lp:1000,lfo:[3.4,.2],lv:.62,ref:340,sh:.6},
 swarm:{o1:[410,'sawtooth',.32],o2:[823,'square',.07],n:[3000,'bandpass',1,.18],lp:5200,lfo:[13,.3],lv:.15,ref:60,sh:.08},
 jet:{o1:[2300,'sine',.07],o2:[1150,'triangle',.05],n:[950,'lowpass',.6,1],lp:2800,lfo:[0,0],lv:.42,ref:260,sh:.4,rpm:1},
 cruise:{o1:[3400,'sine',.06],o2:[1700,'triangle',.04],n:[1900,'bandpass',.6,1],lp:5200,lfo:[0,0],lv:.4,ref:250,sh:.5},
 ss:{o1:[44,'sine',.35],o2:[88,'triangle',.08],n:[320,'lowpass',.7,1],lp:1500,lfo:[1.7,.25],lv:.5,ref:900,sh:0}};
// supersonic booms: level at the reference distance (700 m), N-wave length (s), shake when it passes within 1.5 km
const BOOM={ballistic:{lv:.7,len:.11,sh:.7},hyper:{lv:.75,len:.1,sh:.8},icbm:{lv:.8,len:.09,sh:.9},kv:{lv:.45,len:.05,sh:.45}};

export function initThreatSfx(api,G,Z){
 const {THREE,TH}=api,V3=THREE.Vector3,_a=new V3(),_b=new V3(),_r=new V3(),_x=new V3();
 const bus=()=>Z.au?.bus||null,now=()=>AC.currentTime;
 const on=()=>G.on&&!api.demo&&!api.menuOpen&&(G.state==='wave'||G.state==='clear');
 const lean=()=>Z.perf?.off?2:0;
 const LOG=[],log=e=>{e.at=+simT.toFixed(2);LOG.push(e);if(LOG.length>80)LOG.shift()};
 const ST={booms:0,whoosh:0,drop:0,peakV:0,peakO:0,src:0,cand:0};
 let simT=0,selT=0,whT=0;
 // ---------- one-shots: positional (pan, air absorption, the distance delay), counted against OMAX ----------
 const OS=[];  // end times of the one-shots playing
 const oneOk=()=>{const t=now();for(let i=OS.length-1;i>=0;i--)if(OS[i]<t)OS.splice(i,1);if(OS.length>=OMAX){ST.drop++;return false}return true};
 function spot(p,d,t0){const A=bus(),lp=bq(AC,'lowpass',cl(17000*Math.exp(-d/1500),260,17000),.5);let n=lp;
  if(AC.createStereoPanner&&p){const pn=AC.createStereoPanner();_r.subVectors(p,api.camera.position).normalize();pn.pan.value=cl(_r.dot(_x.set(1,0,0).applyQuaternion(api.camera.quaternion)),-.85,.85);lp.connect(pn);n=pn}
  n.connect(A.sfx);if(d>600){const e=AC.createGain();e.gain.value=cl(d/6000,.08,.4);n.connect(e).connect(A.echo)}return lp}
 // ---------- continuous voices: one fixed graph per slot, retuned to the kind it plays ----------
 const V=[];
 function mkVoice(){const A=bus();if(!A)return null;const c=AC,v={o1:c.createOscillator(),o2:c.createOscillator(),g1:c.createGain(),g2:c.createGain(),ns:c.createBufferSource(),nf:c.createBiquadFilter(),gn:c.createGain(),lp:bq(c,'lowpass',2000,.6),am:c.createGain(),lfo:c.createOscillator(),lg:c.createGain(),vg:c.createGain(),pn:c.createStereoPanner?c.createStereoPanner():null,o:null,k:null,die:0,lvl:0};
  v.ns.buffer=nbuf;v.ns.loop=true;v.vg.gain.value=0;v.o1.connect(v.g1).connect(v.lp);v.o2.connect(v.g2).connect(v.lp);v.ns.connect(v.nf).connect(v.gn).connect(v.lp);v.lp.connect(v.am).connect(v.vg);v.lfo.connect(v.lg).connect(v.am.gain);
  (v.pn?v.vg.connect(v.pn):v.vg).connect(A.sfx);const t=now();v.o1.start(t);v.o2.start(t);v.lfo.start(t);v.ns.start(t,Math.random()*1.4);return v}
 function kill(v){const t=now();for(const s of[v.o1,v.o2,v.ns,v.lfo])try{s.stop(t+.02)}catch(e){}try{v.vg.disconnect();v.pn?.disconnect()}catch(e){}}
 function tune(v,k){const K=VK[k],t=now();v.k=k;v.o1.type=K.o1[1];v.o2.type=K.o2[1];v.g1.gain.setValueAtTime(K.o1[2],t);v.g2.gain.setValueAtTime(K.o2[2],t);v.nf.type=K.n[1];v.nf.Q.value=K.n[2];v.gn.gain.setValueAtTime(K.n[3],t);
  v.lfo.frequency.setValueAtTime(K.lfo[0]||.1,t);v.lg.gain.setValueAtTime((K.lfo[1]||0)/2,t);v.am.gain.setValueAtTime(1-(K.lfo[1]||0)/2,t)}
 const vkOf=(o,k)=>o._sb!=null||k==='kv'?'ss':VK[k]?k:null;
 // ---------- the listener: the camera, its velocity smoothed; a jump (camera cut, relaunch) resets every pass tracker ----------
 const L={p:new V3(),pp:new V3(),v:new V3(),ok:false,jump:false};
 function listen(dt){const c=api.camera.position;L.jump=!L.ok||c.distanceTo(L.pp)>Math.max(60,dt*600);if(!L.jump&&dt>0)L.v.lerp(_a.subVectors(c,L.pp).divideScalar(dt),Math.min(1,dt*8));else L.v.set(0,0,0);L.pp.copy(c);L.p.copy(c);L.ok=true}
 // closest distance from the listener to the segment a..b (a fast source moves tens of metres a frame)
 const seg=(ax,ay,az,b,c)=>{const dx=b.x-ax,dy=b.y-ay,dz=b.z-az,L2=dx*dx+dy*dy+dz*dz,s=L2>1e-9?cl(((c.x-ax)*dx+(c.y-ay)*dy+(c.z-az)*dz)/L2,0,1):0;return Math.hypot(ax+dx*s-c.x,ay+dy*s-c.y,az+dz*s-c.z)};
 // ---------- sources: live tracks (a swarm is one voice, its nearest drone, louder with its size) and Golden Dome kill vehicles ----------
 const SRC=[],grp=new Map();
 function gather(){SRC.length=0;grp.clear();const c=L.p;
  for(const t of TH){if(!api.live(t)||!KIND[t.k])continue;const d=t.p.distanceTo(c);
   if(t.k==='swarm'&&t.grp){const g=grp.get(t.grp);if(g){g.n++;passTrack(t,'swarm',d);if(d<g.d){g.o=t;g.d=d}continue}grp.set(t.grp,{o:t,d,n:1,k:'swarm'})}
   else SRC.push({o:t,d,n:1,k:t.k});passTrack(t,t.k,d)}
  for(const g of grp.values())SRC.push(g);
  for(const h of Z.def?.shots||[])if(h.kind==='space'){const d=h.p.distanceTo(c);SRC.push({o:h,d,n:1,k:'kv'});passTrack(h,'kv',d)}
  ST.src=SRC.length}
 // pass tracker: the moment a source stops closing in, it has just passed its closest point
 const BQ=[];  // booms on their way to the listener: {at (audio time), ...}
 function passTrack(o,k,d){const s=o._ts||(o._ts={dp:-1,x:0,y:0,z:0,cl:0});
  if(s.dp>=0&&!L.jump){if(d<s.dp-.01)s.cl=1;else if(s.cl&&d>s.dp+.01){s.cl=0;pass(o,k,seg(s.x,s.y,s.z,o.p,L.p))}}
  s.dp=d;s.x=o.p.x;s.y=o.p.y;s.z=o.p.z}
 function pass(o,k,dm){const sp=o.v.length(),rv=_a.subVectors(o.v,L.v).length();
  if(sp>CS*1.05){const B=BOOM[k];if(!B)return;const M=sp/CS,dl=Math.min(BCAP,dm/CS*Math.sqrt(1-1/(M*M))),lv=B.lv/(1+(dm/700)**1.3);if(lv<.003)return;  /* the shock cone reaches you this long after the closest point */
   const at=now()+dl,q=BQ.find(b=>Math.abs(b.at-at)<.12);if(q){q.lv=Math.min(1,Math.hypot(q.lv,lv));q.sh=Math.max(q.sh,B.sh*cl(1-dm/1500,0,1))}else BQ.push({at,p:o.p.clone(),lv,len:B.len*(1+dm/25000),dull:cl(dm/9000,0,.85),roll:cl(.6+dm/4000,.6,1.6),sh:B.sh*cl(1-dm/1500,0,1),whoosh:dm<450?cl(1-dm/450,0,1):0,v:o.v.clone()});  /* two cones landing together make one bigger boom */
   o._sb=simT+dl;log({e:'pass',k,d:Math.round(dm),sup:1,delay:+dl.toFixed(2),id:o.id});return}
  const K=VK[k];if(!K)return;const Rn=24+rv*.45;if(dm>Rn)return;o._wh=1;  /* claims the pass: zfx's generic whoosh stays quiet */
  if(now()-whT<.12||!oneOk())return;whT=now();const f=cl(1-dm/Rn,0,1),side=_b.subVectors(o.p,L.p).normalize().dot(_x.set(1,0,0).applyQuaternion(api.camera.quaternion)),big=k==='jet'||k==='cruise'||k==='heavy'||k==='boss';
  OS.push(PATCH.whoosh(AC,nbuf,bus().sfx,now()+.01,cl(.12+.3*f*cl(rv/120,.4,1.4),0,.48),{dur:cl(1.1-rv/400,.45,1),f0:big?2000:2800,f1:big?260:420,p0:-side,p1:side,low:big?.8:k==='swarm'?0:.35}));
  api.shake=Math.max(api.shake,K.sh*f);ST.whoosh++;log({e:'whoosh',k,d:Math.round(dm),id:o.id})}
 function booms(){const t=now();for(let i=BQ.length-1;i>=0;i--){const b=BQ[i];if(b.at>t+.03)continue;BQ.splice(i,1);if(!oneOk())continue;const d=b.p.distanceTo(L.p),n=spot(b.p,d*.25,t);
   OS.push(PATCH.boom(AC,nbuf,n,Math.max(t,b.at),b.lv,{len:b.len,dull:b.dull,roll:b.roll}));ST.booms++;if(b.sh>0)api.shake=Math.max(api.shake,b.sh);
   if(b.whoosh>0&&oneOk()){const side=_b.subVectors(b.p,L.p).normalize().dot(_x.set(1,0,0).applyQuaternion(api.camera.quaternion));OS.push(PATCH.whoosh(AC,nbuf,bus().sfx,t+.05,.35*b.whoosh,{dur:1.4,f0:1800,f1:160,p0:side,p1:-side,low:1.1}))}
   log({e:'boom',lv:+b.lv.toFixed(3)})}}
 // ---------- picking who gets a voice (every 0.12 s), then retuning the voices every frame ----------
 const lvlAt=(K,d,n)=>K.lv/(1+(d/K.ref)**1.6)*Math.min(2.2,Math.sqrt(n));
 function pick(){const cap=VMAX-lean(),c=[];for(const s of SRC){const vk=vkOf(s.o,s.k);if(!vk)continue;if(vk==='ss'&&!(s.o._sb!=null&&simT>=s.o._sb&&simT-s.o._sb<9))continue;
   const sc=lvlAt(VK[vk],s.d,s.n)*(V.some(v=>v.o===s.o&&!v.die)?1.4:1);if(sc>.0025)c.push([sc,s])}ST.cand=c.length;
  c.sort((a,b)=>b[0]-a[0]);const keep=new Set(c.slice(0,cap).map(x=>x[1].o));
  for(const v of V)if(!v.die&&!keep.has(v.o)){v.die=now()+.35;v.vg.gain.setTargetAtTime(0,now(),.08)}
  for(const[,s]of c.slice(0,cap)){if(V.some(v=>v.o===s.o&&!v.die))continue;let v=V.find(v=>v.die&&v.die<now());if(v){V.splice(V.indexOf(v),1);kill(v)}if(V.filter(v=>!v.die).length>=cap)break;
   v=mkVoice();if(!v)break;v.o=s.o;tune(v,vkOf(s.o,s.k));V.push(v)}}
 function voices(){const t=now(),right=_x.set(1,0,0).applyQuaternion(api.camera.quaternion).clone();
  for(let i=V.length-1;i>=0;i--){const v=V[i];if(v.die){if(v.die<t){kill(v);V.splice(i,1)}continue}const s=SRC.find(q=>q.o===v.o);if(!s){v.die=t+.35;v.vg.gain.setTargetAtTime(0,t,.08);continue}
   const o=s.o,K=VK[v.k],sp=o.v.length();if(vkOf(o,s.k)!==v.k)tune(v,vkOf(o,s.k));
   // retarded position: where it was when the sound you hear now left it (subsonic; a supersonic wake is heard from where it is)
   _r.subVectors(o.p,L.p);let tau=0;if(sp<CS){const a=sp*sp-CS*CS,b=-2*_r.dot(o.v),c2=_r.lengthSq();tau=(-b-Math.sqrt(Math.max(0,b*b-4*a*c2)))/(2*a)}
   _a.copy(o.p).addScaledVector(o.v,-Math.max(0,tau));const d=Math.max(1,_a.distanceTo(L.p)),u=_b.subVectors(L.p,_a).divideScalar(d);
   const fd=cl((CS-L.v.dot(u))/Math.max(40,CS-o.v.dot(u)),.45,2.2),rpm=K.rpm&&o.cs?cl(.72+.28*o.spd/o.cs,.6,1.15):o.st==='dive'?1.08:1,f=fd*rpm,lv=lvlAt(K,d,s.n);
   v.o1.frequency.setTargetAtTime(K.o1[0]*f,t,.05);v.o2.frequency.setTargetAtTime(K.o2[0]*f,t,.05);v.nf.frequency.setTargetAtTime(K.n[0]*f,t,.05);
   v.lp.frequency.setTargetAtTime(cl(Math.min(K.lp*f,17000*Math.exp(-d/1300)),220,17000),t,.08);v.vg.gain.setTargetAtTime(lv,t,.07);v.lvl=lv;
   if(v.pn)v.pn.pan.setTargetAtTime(cl(-u.dot(right),-.9,.9),t,.05)}
  ST.peakV=Math.max(ST.peakV,V.filter(v=>!v.die).length)}
 function releaseAll(){const t=AC?now():0;for(const v of V){if(!v.die){v.die=t+.35;v.vg.gain.setTargetAtTime(0,t,.08)}}}

 // ---------- the re-entry rumble: one live voice that swells with the most urgent re-entry (zreentry.js sets the level 0..1) ----------
 const RB={n:null,want:0,lvl:0,off:0};
 function rumbleTick(){const A=bus();if(!A)return;const t=now();
  if(RB.want>.01&&!RB.n){const n=AC.createBufferSource();n.buffer=nbuf;n.loop=true;const f=bq(AC,'lowpass',60,.9),g=AC.createGain(),s=AC.createOscillator(),sg=AC.createGain();g.gain.value=0;sg.gain.value=0;s.frequency.value=32;
   n.connect(f).connect(g).connect(A.sfx);s.connect(sg).connect(A.sfx);n.start(t,Math.random());s.start(t);RB.n={n,f,g,s,sg}}
  if(!RB.n)return;const w=on()?RB.want:0;RB.lvl+=(w-RB.lvl)*.2;RB.n.g.gain.setTargetAtTime(.2*w,t,w>RB.lvl?.6:.25);RB.n.sg.gain.setTargetAtTime(.12*w,t,.6);  /* at full it held -18 dBFS RMS for seconds, louder than the impact it leads to: 4 dB down */RB.n.f.frequency.setTargetAtTime(55+330*w*w,t,.5);RB.n.s.frequency.setTargetAtTime(30+16*w,t,.8);
  if(w<.01){if((RB.off+=1)>240){try{RB.n.n.stop();RB.n.s.stop();RB.n.g.disconnect();RB.n.sg.disconnect()}catch(e){}RB.n=null;RB.off=0}}else RB.off=0}

 // ---------- per frame (Zombies visuals) ----------
 function tick(dt){if(!AC||!bus())return;if(!on()){releaseAll();BQ.length=0;RB.want=0;rumbleTick();for(let i=V.length-1;i>=0;i--)if(V[i].die<now()){kill(V[i]);V.splice(i,1)}return}
  simT+=dt;listen(dt);gather();if((selT-=dt)<=0||L.jump){selT=.12;pick()}voices();booms();rumbleTick();ST.peakO=Math.max(ST.peakO,OS.length)}
 // this takes over zfx's generic near-miss whoosh (it would double the pass): tracks near the camera are claimed before zfx looks at them
 const v0=Z.visuals;Z.visuals=dt=>{if(G.on&&AC&&bus()){const c=api.camera.position;for(const t of TH)if(!t._wh&&t.p.distanceToSquared(c)<1e4)t._wh=1}v0(dt);if(G.on)tick(Math.max(0,dt))};
 const z1=Z.stop;Z.stop=()=>{z1();releaseAll();BQ.length=0;RB.want=0};

 // ---------- event sounds (zreentry.js) ----------
 const ui=()=>bus()?.ui;
 Z.tsfx={VK,BOOM,VMAX,OMAX,
  alarm(big){if(!bus())return;OS.push(PATCH.alarm(AC,nbuf,ui(),now()+.02,big?.2:.13,big?1:0));log({e:'alarm',big:big?1:0})},
  set rumble(w){RB.want=cl(w,0,1)},get rumble(){return RB.want},
  uplink(p){if(!bus()||!oneOk())return;const d=p.distanceTo(api.camera.position),n=spot(p,d,now());OS.push(PATCH.uplink(AC,nbuf,n,now()+.02+Math.min(BCAP,d/CS),.07/(1+(d/900)**1.2)+.012));log({e:'uplink'})},
  // an intercept: the crack and rolling thunder, late by the distance (capped) and duller the farther it is; big = an ICBM warhead
  intercept(p,big){if(!bus())return;const d=p.distanceTo(api.camera.position),dl=Math.min(BCAP+.5,d/CS),n=spot(p,d*.2,now());if(!oneOk())return;
   OS.push(PATCH.boom(AC,nbuf,n,now()+dl,cl((big?.55:.38)/(1+(d/5000)**1.3),.015,.6),{len:big?.16:.1,dull:cl(d/60000,.2,.8),roll:cl(1.6-d/40000,.8,1.6)}));log({e:'icpt',d:Math.round(d),delay:+dl.toFixed(2)})},
  stats:()=>({voices:V.filter(v=>!v.die).length,fading:V.filter(v=>v.die).length,oneShots:OS.filter(t=>t>now()).length,peakV:ST.peakV,peakO:ST.peakO,booms:ST.booms,whoosh:ST.whoosh,drop:ST.drop,src:ST.src,cand:ST.cand,
   kinds:V.filter(v=>!v.die).map(v=>v.k),ids:V.filter(v=>!v.die).map(v=>v.o?.id),lv:V.filter(v=>!v.die).map(v=>+v.lvl.toFixed(4)),pending:BQ.length,rumble:+RB.lvl.toFixed(2)}),
  log:LOG,reset(){ST.peakV=ST.peakO=ST.booms=ST.whoosh=ST.drop=0;LOG.length=0;BQ.length=0}};
 return Z.tsfx}
