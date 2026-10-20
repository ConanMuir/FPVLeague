// Zombies sound (WebAudio synth, no samples): the battlefield you hear. Explosions arrive at the speed of sound and dull with distance, helpers
// are audible when they fire (Gepard bursts, SAM / Tamir launch roar, mortar thumps, drone racks), an air-raid siren starts each wave, the
// radio crackles with garbled voice under the callouts, close passes whoosh, and a code-built score rises with the threat picture.
// Everything goes through one compressor so a big moment stays loud without clipping. Volumes: S.zmusv (music) and S.zsfxv (everything else) from the menu sliders; B mutes the music (S.zmus). Zombies only.
import {AC,nbuf} from '../../engine/audio.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)};
export function initAudio(api){
 const {THREE,S}=api,_r=new THREE.Vector3();
 let A=null,nv=0;const MAXV=34;
 // ---------- graph: sfx + music -> compressor -> out; an outdoor slapback echo that distant sounds feed ----------
 function bus(){if(A)return A;if(!AC||!nbuf)return null;const c=AC.createDynamicsCompressor();c.threshold.value=-16;c.knee.value=12;c.ratio.value=5;c.attack.value=.003;c.release.value=.3;
  const out=AC.createGain();out.gain.value=.9;c.connect(out).connect(AC.destination);const sfx=AC.createGain(),dil=filt("lowpass",20000,.9);sfx.connect(dil).connect(c);
  const echo=AC.createDelay(1.5),fb=AC.createGain(),elp=AC.createBiquadFilter(),eo=AC.createGain();echo.delayTime.value=.27;fb.gain.value=.38;elp.type='lowpass';elp.frequency.value=1300;eo.gain.value=.55;echo.connect(elp).connect(fb).connect(echo);elp.connect(eo).connect(c);
  const mus=AC.createGain();mus.gain.value=0;const mlp=AC.createBiquadFilter();mlp.type='lowpass';mlp.frequency.value=12000;mus.connect(mlp).connect(c);
  const curve=new Float32Array(512);for(let i=0;i<512;i++){const x=i/255.5-1;curve[i]=Math.tanh(x*3.2)}
  const ui=AC.createGain();ui.connect(c);A={c,sfx,ui,dil,echo,eo,mus,mlp,curve,sv:-1};vols();return A}
 // the effects volume scales the effects, the radio / announcer bus and the echo return; the music volume is applied in music()
 function vols(){const v=cl(S.zsfxv??1,0,1);if(v===A.sv)return;A.sv=v;const T=now();A.sfx.gain.setTargetAtTime(v,T,.05);A.ui.gain.setTargetAtTime(v,T,.05);A.eo.gain.setTargetAtTime(.55*v,T,.05)}
 const now=()=>AC.currentTime;
 const nsrc=(t0,dur)=>{const s=AC.createBufferSource();s.buffer=nbuf;s.start(t0,Math.random()*1.4,dur+.05);s.onended=()=>nv--;nv++;return s};
 const osc=(type,t0,dur)=>{const o=AC.createOscillator();o.type=type;o.start(t0);o.stop(t0+dur+.05);o.onended=()=>nv--;nv++;return o};
 const filt=(type,f,q=.7)=>{const b=AC.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b};
 // envelope gain: 0 -> peak over a, exponential decay to silence by t0+dur
 const env=(t0,pk,a,dur)=>{const g=AC.createGain();g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(Math.max(pk,.0002),t0+a);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);return g};
 // a sound placed in the world: distance gain, air absorption (lowpass), stereo pan, the speed-of-sound delay, and an echo send when far
 function at(p,ref,max,pri=0){if(!bus()||nv>MAXV-(pri?0:10))return null;const cam=api.camera,d=p?p.distanceTo(cam.position):0,g=max/(1+(d/ref)**1.5);if(g<.004)return null;
  const t0=now()+.01+(d>100?Math.min(3.2,d/343):0),lp=filt('lowpass',cl(17000*Math.exp(-d/1400),280,17000),.5);let n=lp;
  if(AC.createStereoPanner&&p){const pn=AC.createStereoPanner();_r.subVectors(p,cam.position).normalize();pn.pan.value=cl(_r.dot(_x.set(1,0,0).applyQuaternion(cam.quaternion)),-.8,.8);lp.connect(pn);n=pn}
  n.connect(A.sfx);if(d>500){const s=AC.createGain();s.gain.value=cl(d/5000,.08,.45);n.connect(s).connect(A.echo)}return{n:lp,t0,g,d}}
 const _x=new THREE.Vector3();

 // ---------- explosions: noise body that darkens with distance, a pitch-dropping thump, a crack up close ----------
 let bq=0,bqT=0;
 function boom(p,k){const t=now();if(t-bqT>.08){bqT=t;bq=0}if(++bq>5&&k<2)return;const v=at(p,240+90*k,1,k>=2);if(!v)return;const{n,t0,g,d}=v,K=Math.sqrt(k),dur=.5+.55*K+d/3000;
  const s=nsrc(t0,dur),f=filt('lowpass',2000+700*k,.6);f.frequency.setValueAtTime(2200+700*k,t0);f.frequency.exponentialRampToValueAtTime(120,t0+dur);s.connect(f).connect(env(t0,g*cl(.3+.28*k,.2,1.5),.005,dur)).connect(n);
  const o=osc('sine',t0,.7+.25*K);o.frequency.setValueAtTime(90+20/K,t0);o.frequency.exponentialRampToValueAtTime(30,t0+.45+.2*K);o.connect(env(t0,g*cl(.35+.3*k,.2,1.6),.003,.6+.25*K)).connect(n);
  if(d<500){const c=nsrc(t0,.06),h=filt('highpass',2500,.5);c.connect(h).connect(env(t0,g*.5,.001,.07)).connect(n)}}
 // a far rumble with no position (distant artillery, ground shocks)
 function rumble(vol,delay=0,len=2.5){if(!bus()||nv>MAXV-12)return;const t0=now()+delay,s=nsrc(t0,len),f=filt('lowpass',180,.8),g=env(t0,vol,.08,len);s.connect(f).connect(g).connect(A.sfx);const e=AC.createGain();e.gain.value=.5;g.connect(e).connect(A.echo)}

 // ---------- helpers firing ----------
 function gun(p,type){
  if(type==='gepard'){const v=at(p,220,.75);if(!v)return;const{n,t0,g}=v,N=6,iv=.072,s=nsrc(t0,N*iv+.1),b=filt('bandpass',900,.9),eg=AC.createGain(),o=osc('triangle',t0,N*iv+.1),og=AC.createGain();
   eg.gain.setValueAtTime(0,t0);og.gain.setValueAtTime(0,t0);for(let i=0;i<N;i++){const t=t0+i*iv;eg.gain.setValueAtTime(g*.9,t);eg.gain.exponentialRampToValueAtTime(.0001,t+.05);og.gain.setValueAtTime(g*.8,t);og.gain.exponentialRampToValueAtTime(.0001,t+.06);o.frequency.setValueAtTime(170,t);o.frequency.exponentialRampToValueAtTime(55,t+.06)}
   s.connect(b).connect(eg).connect(n);o.connect(og).connect(n);return}
  if(type==='flak'){const v=at(p,200,.7);if(!v)return;const{n,t0,g}=v,o=osc('sine',t0,.4);o.frequency.setValueAtTime(130,t0);o.frequency.exponentialRampToValueAtTime(42,t0+.3);o.connect(env(t0,g,.002,.38)).connect(n);
   const s=nsrc(t0,.3),f=filt('lowpass',700);s.connect(f).connect(env(t0,g*.6,.002,.28)).connect(n);return}
  if(type==='sam'||type==='idome'){const big=type==='sam',v=at(p,300,big?.8:.7,1);if(!v)return;const{n,t0,g}=v,L=big?2.4:1.5,s=nsrc(t0,L),b=filt('bandpass',400,.8);
   b.frequency.setValueAtTime(big?300:600,t0);b.frequency.exponentialRampToValueAtTime(big?1500:2600,t0+.35);b.frequency.exponentialRampToValueAtTime(big?700:1200,t0+L);s.connect(b).connect(env(t0,g,.03,L)).connect(n);
   const r=nsrc(t0,L),f=filt('lowpass',160);r.connect(f).connect(env(t0,g*1.1,.02,L*.8)).connect(n);return}
  if(type==='rack'){const v=at(p,160,.4);if(!v)return;const{n,t0,g}=v,s=nsrc(t0,.25),b=filt('bandpass',1800,1);s.connect(b).connect(env(t0,g*.6,.005,.22)).connect(n);
   const o=osc('sawtooth',t0,.7),f=filt('lowpass',1400);o.frequency.setValueAtTime(140,t0);o.frequency.exponentialRampToValueAtTime(300,t0+.6);o.connect(f).connect(env(t0,g*.18,.05,.7)).connect(n)}}

 // ---------- air-raid siren: a two-tone rotary wail, rising and falling twice, heard across town ----------
 function siren(boss){if(!bus())return;const t0=now()+.15,L=boss?13:10.5,cyc=L/2,g=AC.createGain(),lp=filt('lowpass',1500,.6),pk=boss?.07:.055;
  g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(pk,t0+1.2);g.gain.setValueAtTime(pk,t0+L-2.2);g.gain.exponentialRampToValueAtTime(.0001,t0+L);
  for(const k of[1,1.26]){const o=osc('sawtooth',t0,L);for(let c=0;c<2;c++){const t=t0+c*cyc;o.frequency.setValueAtTime(150*k,t);o.frequency.exponentialRampToValueAtTime(560*k,t+cyc*.42);o.frequency.setValueAtTime(560*k,t+cyc*.58);o.frequency.exponentialRampToValueAtTime(170*k,t+cyc)}
   const v=osc('sine',t0,L),vg=AC.createGain();v.frequency.value=6.5;vg.gain.value=5*k;v.connect(vg).connect(o.frequency);o.connect(lp)}
  lp.connect(g);if(AC.createStereoPanner){const pn=AC.createStereoPanner();pn.pan.value=-.35;g.connect(pn).connect(A.ui)}else g.connect(A.ui);const e=AC.createGain();e.gain.value=.9;g.connect(e).connect(A.echo)}

 // ---------- radio: squelch, garbled band-limited voice (syllables through moving formants), roger beep ----------
 function squelch(t0,v=.07){const s=nsrc(t0,.09),h=filt('highpass',1800,.5);s.connect(h).connect(env(t0,v,.003,.09)).connect(A.ui)}
 function radio(dur){if(!bus()||nv>MAXV-6)return;const t0=now()+.09;squelch(now());dur=cl(dur,.5,2.6);
  const o=osc('sawtooth',t0,dur),f1=filt('bandpass',600,4),f2=filt('bandpass',1600,5),g=AC.createGain(),band=filt('bandpass',1500,.55),sh=AC.createWaveShaper(),out=AC.createGain();
  sh.curve=A.curve;out.gain.value=.05;g.gain.setValueAtTime(.0001,t0);let t=t0;
  while(t<t0+dur-.06){const syl=rnd(.06,.15);o.frequency.setValueAtTime(rnd(100,155),t);o.frequency.linearRampToValueAtTime(rnd(95,165),t+syl);f1.frequency.setValueAtTime(rnd(350,850),t);f2.frequency.setValueAtTime(rnd(1100,2400),t);
   g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(rnd(.6,1),t+.012);g.gain.setTargetAtTime(.0001,t+syl*.75,.02);t+=syl+(Math.random()<.2?rnd(.07,.16):.012)}
  o.connect(f1).connect(g);o.connect(f2).connect(g);g.connect(band).connect(sh).connect(out).connect(A.ui);
  const h=nsrc(t0,dur),hp=filt('highpass',2600,.4);h.connect(hp).connect(env(t0,.012,.05,dur)).connect(A.ui);
  const te=t0+dur+.02;squelch(te,.06);const b=osc('sine',te+.08,.07);b.frequency.value=1250;b.connect(env(te+.08,.035,.004,.07)).connect(A.ui)}

 // ---------- moments ----------
 // near miss: a Doppler whoosh that sweeps across the stereo field
 function whoosh(vol,side){if(!bus()||nv>MAXV-4)return;const t0=now()+.01,s=nsrc(t0,.75),b=filt('bandpass',2400,1.4),g=AC.createGain();b.frequency.setValueAtTime(2600,t0);b.frequency.exponentialRampToValueAtTime(380,t0+.7);
  g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(vol,t0+.22);g.gain.exponentialRampToValueAtTime(.0001,t0+.72);s.connect(b).connect(g);
  if(AC.createStereoPanner){const pn=AC.createStereoPanner();pn.pan.setValueAtTime(cl(-side,-.9,.9),t0);pn.pan.linearRampToValueAtTime(cl(side,-.9,.9),t0+.6);g.connect(pn).connect(A.sfx)}else g.connect(A.sfx)}
 const note=(f,t0,dur,vol,type='triangle',dst)=>{const o=osc(type,t0,dur);o.frequency.value=f;o.connect(env(t0,vol,.006,dur)).connect(dst||A.ui)};
 // your kill: a punchy low thunk under a bright confirm; lvl = kills in the burst (or the streak) lifts it
 function kill(lvl,save){if(!bus())return;const t0=now()+.02,o=osc('sine',t0,.3);o.frequency.setValueAtTime(160,t0);o.frequency.exponentialRampToValueAtTime(48,t0+.22);o.connect(env(t0,.22,.002,.28)).connect(A.ui);
  const base=save?660:587.3,st=[1,1.26,1.5,2,2.52].slice(0,cl(lvl+1,2,5));st.forEach((m,i)=>{note(base*m,t0+.05+i*.065,.32,.045);note(base*m*2,t0+.05+i*.065,.18,.012,'sine')})}
 function bossDown(){if(!bus())return;const t0=now()+.05,lp=filt('lowpass',300,1.2),g=env(t0,.16,.25,3.6);lp.frequency.setValueAtTime(300,t0);lp.frequency.exponentialRampToValueAtTime(2600,t0+.5);lp.frequency.exponentialRampToValueAtTime(500,t0+3.4);lp.connect(g).connect(A.ui);
  for(const f of[73.4,110,146.8,185,220,293.7])for(const dt of[-4,4]){const o=osc('sawtooth',t0,3.6);o.frequency.value=f;o.detune.value=dt;o.connect(lp)}rumble(.35,.1,3.5)}
 // wave start: a low drum and a minor brass stab; boss waves get a longer, darker horn
 function sting(boss){if(!bus())return;const t0=now()+.05,o=osc('sine',t0,1);o.frequency.setValueAtTime(75,t0);o.frequency.exponentialRampToValueAtTime(36,t0+.8);o.connect(env(t0,.3,.003,.9)).connect(A.ui);
  const s=nsrc(t0,.4),f=filt('lowpass',500);s.connect(f).connect(env(t0,.18,.003,.35)).connect(A.ui);
  const L=boss?3.2:1.5,lp=filt('lowpass',200,2),g=env(t0,boss?.13:.1,.04,L);lp.frequency.setValueAtTime(200,t0);lp.frequency.exponentialRampToValueAtTime(boss?1200:1900,t0+.18);lp.frequency.exponentialRampToValueAtTime(260,t0+L);lp.connect(g).connect(A.ui);
  for(const f of(boss?[36.7,73.4,77.8,110,146.8]:[73.4,87.3,110,146.8]))for(const dt of[-6,6]){const o2=osc('sawtooth',t0,L);o2.frequency.value=f;o2.detune.value=dt;o2.connect(lp)}}
 function clearChord(){if(!bus())return;const t0=now()+.05;[293.7,370,440,587.3].forEach((f,i)=>note(f,t0+i*.09,1.8,.035,'triangle'))}
 function star(i,on){if(!bus())return;const t0=now()+.01,f=on?[880,1108.7,1318.5][i]||1318.5:220;note(f,t0,on?.9:.3,on?.06:.04,on?'sine':'triangle');if(on)note(f*2.01,t0,.4,.015,'sine')}
 function siteHit(big){rumble(big?.4:.25,.05,big?3:2)}
 // money landing in the cash counter: a small bright two-note chink (rate-limited, a burst of kills is one ripple, not a wall)
 let coinT=0;function coin(){if(!bus())return;const t0=now();if(t0-coinT<.07)return;coinT=t0;note(1975.5,t0+.01,.09,.022,'sine');note(2637,t0+.05,.16,.018,'sine')}
 function alarm(){if(!bus())return;const t0=now()+.02;for(let i=0;i<3;i++){note(880,t0+i*.22,.12,.03,'square');note(660,t0+i*.22+.11,.1,.03,'square')}}

 // ---------- score: D minor, 100 BPM, layers fade in with intensity (0 calm .. 1 everything on top of you) ----------
 const BPM=100,SIX=60/BPM/4;
 const CH=[[73.42,110,146.83,174.61],[58.27,87.31,116.54,146.83],[49,73.42,98,116.54],[55,82.41,110,138.59]];  // Dm, Bb, Gm, A (2 bars each)
 const M={on:false,step:0,next:0,I:0,pad:null,lv:[0,0,0,0,0,0]};
 function padOn(){if(M.pad)return;const lp=filt('lowpass',380,.9),g=AC.createGain();g.gain.value=0;lp.connect(g).connect(A.mus);const v=[];
  for(let i=0;i<4;i++)for(const dt of[-7,7]){const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=CH[0][i];o.detune.value=dt;o.connect(lp);o.start();v.push([o,i])}
  const l=AC.createOscillator(),lg=AC.createGain();l.frequency.value=.11;lg.gain.value=90;l.connect(lg).connect(lp.frequency);l.start();M.pad={lp,g,v,l}}
 function hat(t,v){const s=nsrc(t,.04),h=filt('highpass',7500,.5);s.connect(h).connect(env(t,v,.001,.035)).connect(A.mus)}
 function kick(t,v){const o=osc('sine',t,.3);o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(42,t+.16);o.connect(env(t,v,.002,.28)).connect(A.mus)}
 function snare(t,v){const s=nsrc(t,.18),h=filt('bandpass',1800,.6);s.connect(h).connect(env(t,v,.002,.17)).connect(A.mus);const o=osc('triangle',t,.1);o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(140,t+.08);o.connect(env(t,v*.6,.002,.09)).connect(A.mus)}
 function tom(t,v,f){const o=osc('sine',t,.4);o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*.6,t+.3);o.connect(env(t,v,.003,.35)).connect(A.mus);const s=nsrc(t,.08),l=filt('lowpass',900);s.connect(l).connect(env(t,v*.4,.002,.07)).connect(A.mus)}
 function bass(t,f,v,len){const o=osc('sawtooth',t,len),l=filt('lowpass',600,4);l.frequency.setValueAtTime(900,t);l.frequency.exponentialRampToValueAtTime(160,t+len);o.frequency.value=f;o.connect(l).connect(env(t,v,.004,len)).connect(A.mus)}
 function pluck(t,f,v){const o=osc('sawtooth',t,.14),b=filt('bandpass',f*2,2);o.frequency.value=f;o.connect(b).connect(env(t,v,.002,.13)).connect(A.mus)}
 const BASS=[0,0,0,1,0,0,2,0],ARP=[2,3,2,1,3,2,1,0];
 function sched(s,t){const L=M.lv,bar=(s>>4)%8,ch=CH[bar>>1],b16=s%16;
  if(b16===0&&bar%2===0&&M.pad){const T=Math.max(t,now());for(const[o,i]of M.pad.v)o.frequency.setTargetAtTime(ch[i],T,.35)}
  if(L[1]>.02&&b16%2===0){const n=BASS[(b16>>1)%8],f=n===1?ch[0]*1.189:n===2?ch[0]*.891:ch[0];bass(t,f,.11*L[1],b16%4===0?.26:.16)}
  if(L[2]>.02){if(b16===0||b16===8||(L[2]>.6&&b16===10))kick(t,.32*L[2]);}
  if(L[3]>.02&&b16%2===0)hat(t,(b16%4===2?.05:.025)*L[3]);
  if(L[4]>.02&&(b16===4||b16===12))snare(t,.12*L[4]);
  if(L[4]>.4&&bar%2===1&&b16>=12)tom(t,.16*L[4],[160,140,120,100][b16-12]);
  if(L[5]>.02)pluck(t,ch[ARP[b16%8]%4]*4,.05*L[5])}
 // I: 0..1 from the director; state: 'wave' | 'clear' | 'base' | 'off'
 function music(I,state,dt){if(!bus())return;vols();const mv=cl(S.zmusv??1,0,1),want=S.zmus!==0&&mv>0&&state!=='off'&&!api.menuOpen;if(want&&!M.on){padOn();M.on=true;M.next=now()+.1;M.step=0}
  const T=now();A.mus.gain.setTargetAtTime(want?(state==='base'?.55:.8)*mv:0,T,want?.8:.25);if(!M.on)return;if(!want&&A.mus.gain.value<.01){return}
  const tgt=state==='wave'?I:state==='clear'?.12:0;M.I+=(tgt-M.I)*Math.min(1,dt*(tgt>M.I?.8:.25));const I2=M.I;
  const th=[0,.18,.32,.42,.58,.8];for(let i=0;i<6;i++)M.lv[i]=sm((I2-th[i])/.12);
  M.pad.g.gain.setTargetAtTime(.05+.03*I2,T,.5);M.pad.lp.frequency.setTargetAtTime(320+1200*I2*I2,T,.6);
  if(M.next<T-.5)M.next=T+.05;while(M.next<T+.18){sched(M.step++,M.next);M.next+=SIX}}
 // slow-mo: the world goes muffled and comes back as time does
 let dl=1;function dilate(s){if(!A||Math.abs(s-dl)<.02)return;dl=s;A.dil.frequency.setTargetAtTime(s>=1?20000:500+s*s*9000,now(),s>=1?.25:.03)}
 function stopMusic(){if(!A)return;A.mus.gain.setTargetAtTime(0,now(),.2);M.I=0}
 return{dilate,coin,boom,rumble,gun,siren,radio,whoosh,kill,bossDown,sting,clearChord,star,siteHit,alarm,music,stopMusic,get ready(){return!!bus()},get bus(){return bus()},M,get dbg(){return{st:AC?.state,nv,step:M.step,I:+M.I.toFixed(2),lv:M.lv.map(v=>+v.toFixed(2))}}}}
