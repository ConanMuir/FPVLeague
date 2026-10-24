// ---------- audio (WebAudio synth) ----------
import {V3,cl} from '../config/constants.js';
import {G,TE,VP} from '../config/tune.js';
import {camera} from '../render/renderer.js';
import {GS} from '../state.js';
import {S} from '../config/settings.js';
import {sfxInit,sfxTick} from './sfx.js';
export let AC=null,BUS=null,LIM=null,mg,mf,nbuf,mw,pf,pg,wf,wg,ov=null,awp=null;export const mo=[],aw=new V3(),_au=new V3(),_ar=new V3(),_ad=new V3();
// master limiter (LIM, after the master volume): sounds that stack up (a goal with a hard hit, a landing and full motors) are held
// under 0 dBFS instead of clipping. Fast attack, high ratio, threshold -3 dB: normal play stays below it and passes untouched.
// The browsers' compressor adds its own make-up gain (about +1.45 dB at these settings, measured by tools/audio-levels.mjs); the gain after it takes that back.
function limiter(){const c=AC.createDynamicsCompressor();c.threshold.value=-3;c.knee.value=2;c.ratio.value=20;c.attack.value=.002;c.release.value=.15;const g=AC.createGain();g.gain.value=.846;c.connect(g);return{c,g}}
// 4 motors, each a tri-blade prop buzz (blade-pass sawtooth + harmonic) over the shaft tone; a slight per-motor offset gives the real beating
export function audioInit(){if(AC)return;try{AC=new(window.AudioContext||window.webkitAudioContext)();const mst=AC.createGain();try{const l=limiter();LIM=l.c;mst.connect(l.c);l.g.connect(AC.destination)}catch(e){LIM=null;mst.connect(AC.destination)}BUS={mst};for(const k of['mot','wind','oth','fx','crowd']){BUS[k]=AC.createGain();BUS[k].connect(mst)}  // Audio tab volumes: master, then own motors, wind, other quads, effects, crowd
 mf=AC.createBiquadFilter();mf.type='lowpass';mf.Q.value=.9;mg=AC.createGain();mg.gain.value=0;mf.connect(mg).connect(BUS.mot);
 for(let i=0;i<4;i++){const v=[];[['sawtooth',.3,3],['square',.05,6],['sine',.16,1]].forEach(([t,g0,h])=>{const o=AC.createOscillator(),g=AC.createGain();o.type=t;g.gain.value=g0;o.connect(g).connect(mf);o.start();v.push([o,h])});mo.push({v,off:1+(i-1.5)*.009})}
 mw=AC.createOscillator();mw.type='triangle';const wg0=AC.createGain();wg0.gain.value=.02;mw.connect(wg0).connect(mg);mw.start();mw.g=wg0;  // ESC/motor whine: shaft rpm x 7 pole pairs
 nbuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);const ch=nbuf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;
 const loop=(type,q,out=AC.destination)=>{const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=nbuf;s.loop=true;f.type=type;f.Q.value=q;g.gain.value=0;s.connect(f).connect(g).connect(out);s.start();return[f,g]};
 [pf,pg]=loop('bandpass',.7,BUS.mot);[wf,wg]=loop('lowpass',.4,BUS.wind);  // prop wash hiss, wind over the camera
 const pan=AC.createStereoPanner?AC.createStereoPanner():null,og=AC.createGain(),of=AC.createBiquadFilter();og.gain.value=0;of.type='lowpass';of.frequency.value=2500;of.connect(og);if(pan)og.connect(pan).connect(BUS.oth);else og.connect(BUS.oth);
 const oo=[['sawtooth',.4,3],['sine',.25,1]].map(([t,g0,h])=>{const o=AC.createOscillator(),g=AC.createGain();o.type=t;g.gain.value=g0;o.connect(g).connect(of);o.start();return[o,h]});
 const[on,onf]=loop('bandpass',.8,of);onf.gain.value=.35;ov={oo,og,pan,on};  // the nearest other quad, with distance, doppler and pan
 sfxInit();setVolumes()}catch(e){AC=null;BUS=null}}
// slider % -> gain, squared so the slider feels even to the ear; while a replay plays (duckReplay) each bus is also scaled by DUCK
let ducked=false;const DUCK={mot:.25,wind:0,oth:.3,fx:.4,crowd:.5};
export function setVolumes(){if(!BUS)return;const t=AC.currentTime;for(const[k,s]of[['mst','vMaster'],['mot','vMotor'],['wind','vWind'],['oth','vOther'],['fx','vFx'],['crowd','vCrowd']])BUS[k].gain.setTargetAtTime(((S[s]??100)/100)**2*(ducked?DUCK[k]??1:1),t,ducked?.05:.02)}
// replays (render/replay.js): effects -8 dB, crowd -6 dB, motors and the other quads lower, wind off; the sliders still apply
export function duckReplay(on){ducked=!!on;setVolumes()}
// shaft speed (Hz): thrust ~ rpm² so rpm follows ms^(TE/2); props unload and spin up a little as air flows through the disc
const rotHz=d=>(70+470*Math.max(d.ms,0)**(TE/2))*(1+.12*cl(d.v.dot(_au.set(0,1,0).applyQuaternion(d.q))/VP,-.5,1));
export function audioTick(dt){sfxTick(dt);const me=GS.player,on=!GS.demo&&!GS.paused&&me&&me.dead<=0,t=AC.currentTime;
 if(!on){mg.gain.setTargetAtTime(0,t,.06);pg.gain.setTargetAtTime(0,t,.06);wg.gain.setTargetAtTime(0,t,.06);ov.og.gain.setTargetAtTime(0,t,.06);awp=null;return}
 const r=rotHz(me),ms=Math.max(me.ms,0),up=_au.set(0,1,0).applyQuaternion(me.q),va=me.v.dot(up),sp=me.v.length(),WS=G/9.81;
 if(awp&&dt>0)aw.lerp(_ad.subVectors(me.w,awp).divideScalar(dt),Math.min(1,dt*16));awp=(awp||new V3()).copy(me.w);  // smoothed angular accel = how hard the mixer is splitting the motors
 const mix=[[-1,1,-1],[-1,-1,1],[1,1,1],[1,-1,-1]];  // Betaflight quad-X: RR, FR, RL, FL (roll, pitch, yaw)
 mo.forEach((m,i)=>{const[a,b,c]=mix[i],k=cl((a*aw.z+b*aw.x)*.0035+c*aw.y*.002,-.35,.35),f=r*m.off*(1+k);for(const[o,h]of m.v)o.frequency.setTargetAtTime(f*h,t,.012)});
 const wash=va<-6?cl((-va-6)/18,0,1)*ms:0,flut=1+wash*(Math.random()-.5)*1.4;  // falling into your own wash: the props chop through dirty air
 mg.gain.setTargetAtTime((.03+.053*ms**.9+(me.boostOn?.02:0))*flut,t,.02);mf.frequency.setTargetAtTime(900+r*3*2.6,t,.03);  /* full throttle + boost peaks near -14 dBFS: a bed, 3 dB under a ball hit (tools/audio-levels.mjs) */
 mw.frequency.setTargetAtTime(r*7,t,.02);mw.g.gain.setTargetAtTime(.006+.018*ms,t,.05);
 pf.frequency.setTargetAtTime(r*4.2,t,.03);pg.gain.setTargetAtTime((.012+.07*ms**1.5)*(1+wash*1.5),t,.03);
 const ws=cl(sp/WS/40,0,1.3);wf.frequency.setTargetAtTime(200+ws*1400,t,.1);wg.gain.setTargetAtTime(.17*ws*ws,t,.1);
 let o=null,od=1e9;for(const d of GS.drones)if(d!==me&&d.dead<=0){const q=d.p.distanceTo(camera.position);if(q<od){od=q;o=d}}
 const R0=160;if(!o||od>R0){ov.og.gain.setTargetAtTime(0,t,.1);return}
 const dir=_ad.subVectors(camera.position,o.p).divideScalar(od||1),C=343*WS,dop=cl(C/Math.max(C*.3,C-(o.v.dot(dir)-me.v.dot(dir))),.6,1.8),fr=rotHz(o)*dop;
 for(const[x,h]of ov.oo)x.frequency.setTargetAtTime(fr*h,t,.03);ov.on.frequency.setTargetAtTime(fr*4,t,.03);
 ov.og.gain.setTargetAtTime(.09*(.35+Math.max(o.ms,0))*(1-od/R0)**2,t,.05);if(ov.pan)ov.pan.pan.setTargetAtTime(cl(-dir.dot(_ar.set(1,0,0).applyQuaternion(camera.quaternion)),-.9,.9),t,.05)}
export function noise(dur,freq,vol,q=1,out){if(!AC||vol<.005)return;const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain(),t=AC.currentTime;s.buffer=nbuf;f.type='bandpass';f.frequency.value=freq;f.Q.value=q;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(out||BUS.fx);s.start(t);s.stop(t+dur)}
export function tone(f0,f1,dur,vol,type='sine',out){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime;o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(out||BUS.fx);o.start(t);o.stop(t+dur)}
export const near=p=>cl(1-p.distanceTo(camera.position)/130,0,1);
