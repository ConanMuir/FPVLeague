// Audio (WebAudio synth): 4 motor voices with the Betaflight quad-X mixer split, motor whine, prop hiss and wind
import {V3,cl} from './util.js';
export let AC=null,nbuf;let MOT={rot:[70,470],wind:[40,1.3],phys:()=>[15,1.6,240]},mg,mf,mw,pf,pg,wf,wg,awp=null;const mo=[],aw=new V3(),_au=new V3(),_ad=new V3();
// 4 motors, each a tri-blade prop buzz (blade-pass sawtooth + harmonic) over the shaft tone; a slight per-motor offset gives the real beating
// extra(AC) adds a game's own sounds; motor: {rot:[idle Hz, span], wind:[speed scale, cap], phys:()=>[gravity, thrust curve exponent, prop pitch speed]}
// for the game's flight model (the default phys is the old League quad's: 15, 1.6, 240)
export function audioInit({extra,motor}={}){if(AC)return;if(motor)MOT={...MOT,...motor};try{AC=new(window.AudioContext||window.webkitAudioContext)();masterBus(AC);mf=AC.createBiquadFilter();mf.type='lowpass';mf.Q.value=.9;mg=AC.createGain();mg.gain.value=0;mf.connect(mg).connect(AC.destination);
 for(let i=0;i<4;i++){const v=[];[['sawtooth',.3,3],['square',.05,6],['sine',.16,1]].forEach(([t,g0,h])=>{const o=AC.createOscillator(),g=AC.createGain();o.type=t;g.gain.value=g0;o.connect(g).connect(mf);o.start();v.push([o,h])});mo.push({v,off:1+(i-1.5)*.009})}
 mw=AC.createOscillator();mw.type='triangle';const wg0=AC.createGain();wg0.gain.value=.02;mw.connect(wg0).connect(mg);mw.start();mw.g=wg0;  // ESC/motor whine: shaft rpm x 7 pole pairs
 nbuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);const ch=nbuf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;
 const loop=(type,q,out=AC.destination)=>{const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=nbuf;s.loop=true;f.type=type;f.Q.value=q;g.gain.value=0;s.connect(f).connect(g).connect(out);s.start();return[f,g]};
 [pf,pg]=loop('bandpass',.7);[wf,wg]=loop('lowpass',.4);  // prop wash hiss, wind over the camera
 extra?.(AC);
}catch(e){AC=null}}
export const audioOn=()=>!!(AC&&mo.length);
// master bus: every sound in the game (engine, Classic, Zombies) reaches the speakers through one gain and a limiter. AC.destination is
// re-pointed at the bus so code that connects to AC.destination needs no change; setMaster(0..1) scales everything
let MST=null;const MASTER=.45;
function masterBus(A){const out=A.destination,g=A.createGain(),lim=A.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=6;lim.ratio.value=12;lim.attack.value=.002;lim.release.value=.15;
 g.gain.value=MASTER;g.connect(lim).connect(out);MST=g;try{Object.defineProperty(A,'destination',{value:g,configurable:true})}catch(e){}}
export const setMaster=v=>{if(MST)MST.gain.value=MASTER*cl(+v||0,0,1.5)};
// shaft speed (Hz): thrust ~ rpm² so rpm follows ms^(TE/2); props unload and spin up a little as air flows through the disc
const rotHz=d=>{const[,te,vp]=MOT.phys();return(MOT.rot[0]+MOT.rot[1]*Math.max(d.ms,0)**(te/2))*(1+.12*cl(d.v.dot(_au.set(0,1,0).applyQuaternion(d.q))/vp,-.5,1))};
// your own quad; on = flying (not in the menu, not crashed); air = wind velocity (wind noise follows airspeed). Returns false when silent
export function motorAudio(me,dt,on,air=null){const t=AC.currentTime;
 if(!on){mg.gain.setTargetAtTime(0,t,.06);pg.gain.setTargetAtTime(0,t,.06);wg.gain.setTargetAtTime(0,t,.06);awp=null;return false}
 const r=rotHz(me),ms=Math.max(me.ms,0),up=_au.set(0,1,0).applyQuaternion(me.q),va=me.v.dot(up),sp=air?_ad.subVectors(me.v,air).length():me.v.length(),WS=MOT.phys()[0]/9.81;
 if(awp&&dt>0)aw.lerp(_ad.subVectors(me.w,awp).divideScalar(dt),Math.min(1,dt*16));awp=(awp||new V3()).copy(me.w);  // smoothed angular accel = how hard the mixer is splitting the motors
 const mix=[[-1,1,-1],[-1,-1,1],[1,1,1],[1,-1,-1]];  // Betaflight quad-X: RR, FR, RL, FL (roll, pitch, yaw)
 mo.forEach((m,i)=>{const[a,b,c]=mix[i],k=cl((a*aw.z+b*aw.x)*.0035+c*aw.y*.002,-.35,.35),f=r*m.off*(1+k);for(const[o,h]of m.v)o.frequency.setTargetAtTime(f*h,t,.012)});
 const wash=va<-6?cl((-va-6)/18,0,1)*ms:0,flut=1+wash*(Math.random()-.5)*1.4;  // falling into your own wash: the props chop through dirty air
 mg.gain.setTargetAtTime((.04+.075*ms**.9+(me.boostOn?.03:0))*flut,t,.02);mf.frequency.setTargetAtTime(900+r*3*2.6,t,.03);
 mw.frequency.setTargetAtTime(r*7,t,.02);mw.g.gain.setTargetAtTime(.006+.018*ms,t,.05);
 pf.frequency.setTargetAtTime(r*4.2,t,.03);pg.gain.setTargetAtTime((.015+.09*ms**1.5)*(1+wash*1.5),t,.03);
 const ws=cl(sp/WS/MOT.wind[0],0,MOT.wind[1]);wf.frequency.setTargetAtTime(200+ws*1400,t,.1);wg.gain.setTargetAtTime(.17*ws*ws,t,.1);return true}
export function noise(dur,freq,vol,q=1){if(!AC||vol<.005)return;const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain(),t=AC.currentTime;s.buffer=nbuf;f.type='bandpass';f.frequency.value=freq;f.Q.value=q;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(AC.destination);s.start(t);s.stop(t+dur)}
export function tone(f0,f1,dur,vol,type='sine'){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime;o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(AC.destination);o.start(t);o.stop(t+dur)}
