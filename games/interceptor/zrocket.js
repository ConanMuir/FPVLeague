// Zombies perk: Rocket Assist. Each new interceptor carries a strap-on booster that lights once you lift off the mat and burns for 15 s:
// extra thrust along the airframe's nose axis that eases in over about a second, taking the dart to about 3x its normal top speed
// (roughly 1,200 km/h), then tails off at burn-out. Stick rates are untouched, so it steers like the normal dart, just much faster.
// Game-feel numbers, not modelled on any real motor.
// Effects: exhaust flame on the tail, a lingering smoke trail, a synthesized roar, light camera shake, and a HUD bar for the burn left.
import {glow,dot} from '../../engine/render.js';
export const RK={burn:15,top:333,acc:340,ramp:1.2,fade:1.2,lift:4};  // burn s; top speed while burning (m/s, about 1,200 km/h); extra thrust m/s² along the nose; ramp-in s; burn-out tail s; ignites above this AGL
export function initRocket(api,G,Z){
 const {THREE,gh}=api,V3=THREE.Vector3,_a=new V3(),_q=new THREE.Quaternion();
 const st={t:0,armed:false,lastT:1e9,smk:0,snd:null};
 // flame: two nested cones on the tail (white-hot core, orange plume), flickered each frame
 const flame=new THREE.Group(),core=new THREE.Mesh(new THREE.ConeGeometry(.05,.5,10).rotateX(Math.PI).translate(0,-.25,0),glow(0xfff2c0,6)),plume=new THREE.Mesh(new THREE.ConeGeometry(.09,1.1,12).rotateX(Math.PI).translate(0,-.55,0),glow(0xff7a20,4));
 plume.material.transparent=true;plume.material.opacity=.75;plume.material.depthWrite=false;flame.add(plume,core);flame.visible=false;
 // HUD bar
 const bar=document.createElement('div');bar.id='zrk';bar.className='osd';bar.hidden=true;bar.innerHTML='<span>ROCKET</span><b><i id="zrki"></i></b><em id="zrkt"></em>';document.getElementById('hud').append(bar);
 const owned=()=>Z.perkLevel?.('rocket')>0;
 // roar: filtered noise plus a low rumble, faded in and out with the burn
 function sound(on){const AC=api.AC;if(!AC)return;const t=AC.currentTime;
  if(on&&!st.snd){const n=AC.createBufferSource(),len=AC.sampleRate*2,b=AC.createBuffer(1,len,AC.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;n.buffer=b;n.loop=true;
   const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=900;f.Q.value=.7;const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=48;const og=AC.createGain();og.gain.value=.25;
   const g=AC.createGain();g.gain.value=0;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.22,t+.25);n.connect(f);o.connect(og).connect(f);f.connect(g).connect(Z.au?.bus?.sfx||AC.destination);n.start();o.start();st.snd={n,o,g,f}}  /* on zaudio's effects bus: the effects slider, the slow-mo muffle and the compressor apply */
  if(!on&&st.snd){const s=st.snd;s.g.gain.cancelScheduledValues(t);s.g.gain.setTargetAtTime(0,t,.25);s.n.stop(t+1.2);s.o.stop(t+1.2);st.snd=null}}
 function stop(){const me=api.player;if(me){me.boost=0;me.bmax=0}st.t=0;flame.visible=false;bar.hidden=true;sound(false)}
 function step(dt){const me=api.player;if(!me||!G.on){if(st.t>0)stop();return}
  if(me.t<st.lastT){st.armed=owned();if(st.t>0)stop()}st.lastT=me.t;  // a fresh interceptor on the mat: arm the booster
  if(me.dead>0){if(st.t>0)stop();return}
  if(st.armed&&me.p.y-gh(me.p.x,me.p.z)>RK.lift){st.armed=false;st.t=RK.burn;sound(true);api.banner('ROCKET','co',.8)}
  if(st.t>0){st.t-=dt;const e=Math.min(1,(RK.burn-st.t)/RK.ramp),k=e*e*(3-2*e)*Math.min(1,Math.max(0,st.t)/RK.fade);  /* smooth ramp-in, then a short tail at burn-out */
   me.boost=RK.acc*k;me.bmax=Math.max(0,RK.top-(api.S.mod?.maxv||115))*k;api.shake=.03+.05*k;
   if((st.smk-=dt)<=0){st.smk=.03;const tail=_a.set(0,-.55,0).applyQuaternion(me.q).add(me.p);api.SMK.emit(tail,0xcfcac2,1,1.2,7,null,1,.6);api.FX.emit(tail,0xffa040,2,3,.25,null,2.5)}  // smoke lingers ~7 s
   if(st.t<=0)stop()}}
 function visuals(){const me=api.player,on=st.t>0&&me&&me.dead<=0;
  if(on&&flame.parent!==me.mesh)me.mesh.add(flame);flame.visible=!!on;
  if(on){const k=.85+Math.random()*.3;flame.position.copy(me.nozzle.position);flame.scale.set(k,.9+Math.random()*.4,k);const f=Math.max(0,st.t)/RK.burn;$i.style.width=(f*100).toFixed(1)+'%';$t.textContent=Math.max(0,st.t).toFixed(1)+' s'}
  bar.hidden=!on&&!(st.armed&&owned()&&me&&me.dead<=0);if(!on&&!bar.hidden){$i.style.width='100%';$t.textContent='READY'}}
 const $i=document.getElementById('zrki'),$t=document.getElementById('zrkt');
 return{step,visuals,stop,st,sound}}  /* sound: tools/audio-levels.mjs measures the roar */
