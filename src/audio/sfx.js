// ---------- game sound effects: all synthesized (WebAudio), no audio files ----------
// Ground scrapes / landing thuds / tumble clatter, ball hits / bounces / rolling, the arena crowd, goal horn + stinger,
// kickoff countdown, pop whoosh, Dogfight bullet impacts on rock. audio.js owns the context, the shared 2 s noise buffer
// (nbuf) and the volume buses (BUS.fx effects, BUS.crowd crowd, both under BUS.mst master); it calls sfxInit() once and
// sfxTick(dt) every rendered frame.
// CPU: four looped noise sources in total (scrape, ball roll, crowd bed, crowd voices) are built once and only their params move;
// one-shots are a handful of short-lived nodes each, capped by a voice limit (VMAX) and per-sound rate limits.
// Every entry point counts its trigger in SND.n (tools/sound-check.mjs reads them) and then returns quietly if there is no
// AudioContext (headless, blocked autoplay, old browser), so nothing here can throw for lack of audio.
import {AC,BUS,nbuf,near,tone} from './audio.js';
import {GH,GW,HL,V3,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BR} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {onEv,onFx} from '../core/events.js';
import {camera} from '../render/renderer.js';
import {GS} from '../state.js';
import {inCave} from '../world/caves.js';
import {MODES} from '../modes/registry.js';
export const SND={n:{},scrape:0,roll:0,crowd:0,cheer:0};  // trigger counters + current loop levels (for checks / debugging)
const cnt=k=>{SND.n[k]=(SND.n[k]||0)+1};
const VMAX=32;let vEnd=[];  // voice limit for one-shots: end times of the voices still sounding
function slot(dur){const t=AC.currentTime;if(vEnd.length>=VMAX){vEnd=vEnd.filter(e=>e>t);if(vEnd.length>=VMAX)return false}vEnd.push(t+dur);return true}
const _x=new V3(),_y=new V3();
// stereo placement + distance for a world point: a panner into the effects bus (null p = centred, e.g. your own quad)
function dest(p,out){out=out||BUS.fx;if(!p||!AC.createStereoPanner)return out;const d=_x.subVectors(p,camera.position),L=d.length();if(L<2)return out;
 const pn=AC.createStereoPanner();pn.pan.value=cl(d.dot(_y.set(1,0,0).applyQuaternion(camera.quaternion))/L,-1,1)*.8;pn.connect(out);return pn}
// one-shot noise: filter type/freq (optionally swept to f1), attack a, exponential decay; random offset into the shared buffer
// (the gain starts at 0 before its first event: a GainNode is 1 until then, and with t0 inside a render quantum the source's first frames leaked
// through at full gain, a random click up to -3 dBFS; tools/audio-levels.mjs)
function nz(t0,dur,f,vol,q=1,out,type='bandpass',f1=0,a=.003){if(vol<.004)return;const s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain();s.buffer=nbuf;fl.type=type;fl.Q.value=q;
 fl.frequency.setValueAtTime(f,t0);if(f1)fl.frequency.exponentialRampToValueAtTime(f1,t0+dur);g.gain.value=0;g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+a);g.gain.exponentialRampToValueAtTime(.001,t0+dur);
 s.connect(fl).connect(g).connect(out||BUS.fx);s.start(t0,Math.random()*1.5);s.stop(t0+dur+.02)}
// one-shot oscillator with a pitch glide f0 -> f1
function os(t0,f0,f1,dur,vol,type='sine',out,a=.002){if(vol<.004)return;const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),t0+dur);
 g.gain.value=0;g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+a);g.gain.exponentialRampToValueAtTime(.001,t0+dur);o.connect(g).connect(out||BUS.fx);o.start(t0);o.stop(t0+dur+.02)}
const rnd=(a,b)=>a+Math.random()*(b-a),now=()=>performance.now()/1000;  // rate limits run on wall time (works with or without a context)
// a looped noise source through a filter chain into a gain (persistent; only params change)
function loopNz(filters,out){const s=AC.createBufferSource(),g=AC.createGain();s.buffer=nbuf;s.loop=true;let n=s;for(const F of filters){const fl=AC.createBiquadFilter();[fl.type,fl.frequency.value,fl.Q.value]=F;n.connect(fl);n=F.node=fl}
 g.gain.value=0;n.connect(g).connect(out);s.start(0,Math.random()*1.5);return g}

let L=null;  // persistent voices, built by sfxInit
export function sfxInit(){if(L||!AC)return;const pan=()=>AC.createStereoPanner?AC.createStereoPanner():AC.createGain();
 // scrape: grit = high-passed noise through a band that rises with slide speed; frame-rate amplitude jitter makes it rough
 const sP=pan();sP.connect(BUS.fx);const sF=[['highpass',350,.7],['bandpass',1200,.9]],sG=loopNz(sF,sP);
 // ball roll: a low rumble (low-passed noise) pulsed by a sine LFO at twice the spin rate (the panel seams going round)
 const rP=pan();rP.connect(BUS.fx);const rF=[['lowpass',120,1.4]],rG=loopNz(rF,rP),rl=AC.createOscillator(),rd=AC.createGain();rl.frequency.value=2;rd.gain.value=0;rl.connect(rd).connect(rG.gain);rl.start();
 // crowd bed: two broad noise bands (chest + voice) with two slow LFOs on the level = the murmur of thousands
 const cF=[['bandpass',420,.6],['peaking',1150,.8]],cG=loopNz(cF,BUS.crowd);cF[1].node.gain.value=6;
 const lf=[[.23,.06],[.61,.035]].map(([f,dp])=>{const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=dp;o.connect(g).connect(cG.gain);o.start();return g});
 // crowd voices: the cheer / ooh / groan layer, two formant bands (F1, F2) swept per reaction, plus a bright band for the roar
 const vS=AC.createBufferSource();vS.buffer=nbuf;vS.loop=true;const f1=AC.createBiquadFilter(),f2=AC.createBiquadFilter(),f3=AC.createBiquadFilter(),vG=AC.createGain(),rG2=AC.createGain();
 f1.type=f2.type=f3.type='bandpass';f1.Q.value=4;f2.Q.value=5;f3.Q.value=.6;f1.frequency.value=500;f2.frequency.value=1100;f3.frequency.value=1900;vG.gain.value=0;rG2.gain.value=0;
 vS.connect(f1).connect(vG);vS.connect(f2).connect(vG);vS.connect(f3).connect(rG2);vG.connect(BUS.crowd);rG2.connect(BUS.crowd);vS.start(0,.7);
 L={sG,sP,sF:sF[1].node,rG,rP,rF:rF[0].node,rl,rd,cG,cF:cF[0].node,lf,f1,f2,vG,roar:rG2,ex:0,tens:0};
 onEv('ground',e=>{try{groundHit(e.d,e.speed,e.p)}catch(err){}});onEv('save',e=>{try{crowdSave(e.d,e.speed)}catch(err){}});onEv('shot',e=>{try{crowdShot(e.d)}catch(err){}});
 onFx('touch',e=>{try{ballHit(e.d,e.speed,e.verdict)}catch(err){}})}

// ---------- game events (core/events.js) ----------
// contacts (ground, touch) and the crowd's save / shot listen from sfxInit on, once audio exists; the rest from load, like the direct calls they replace
onFx('bounce',e=>ballBounce(e.speed));onEv('count',e=>countdown(e.n));onFx('goal',e=>goalSfx(e.team,e.p));
onFx('popEarn',e=>{if(e.d===GS.player)tone(1500,2200,.08,.05)});onFx('popFire',e=>{if(e.d===GS.player)popWhoosh(e.dur)});
// landing / wall impact of a quad: a low sine thump (pitch drops like a body hitting a floor) + low-passed noise; a hard one adds
// the frame's ring (three inharmonic partials, a carbon plate) and a short high crack; spinning into it adds clatter.
// Levels: the hardest landing peaks about 5 dB under the hardest ball hit and 3 dB under the goal boom (tools/audio-levels.mjs); it was 2 dB over both
export function groundHit(d,speed,p){if(!d||!(speed>2))return;const w=now();if(d._sgt&&w-d._sgt<.07&&speed<(d._sgs||0)*1.5)return;cnt('thud');d._sgt=w;d._sgs=speed;if(!AC)return;
 const t0=AC.currentTime;const k=cl((speed-2)/26,0,1),v=near(d.p)*(d===GS.player?1:.8);if(v*k<.01||!slot(.4))return;const o=dest(d===GS.player?null:d.p);
 os(t0,90+speed*1.5,36,.16+.12*k,.24*k**.8*v,'sine',o);nz(t0,.1+.08*k,300+speed*8,.22*k*v,.8,o,'lowpass');
 if(k>.3){for(const f of[517,1393,2287])os(t0,f*rnd(.94,1.06),f*.97,.08+.18*k,.04*k*v,'sine',o);nz(t0,.035,2600,.15*k*v,1.2,o)}
 if(d.w&&d.w.length()>8)clatter(d,v*k)}
// tumble clatter: tiny clicks of props and arms on the floor (narrow high noise burst + a short triangle "tok")
function clatter(d,v){cnt('clatter');if(!AC||v<.01||!slot(.05))return;const t0=AC.currentTime,o=dest(d===GS.player?null:d.p);
 nz(t0,.025,rnd(1800,4800),.14*v,4,o);os(t0,rnd(650,1300),rnd(380,600),.03,.06*v,'triangle',o)}  /* the clicks under a tumbling landing kept it 1 dB over the mid cap; 4 dB down */

// ball touch by a quad: a hollow "thwump" (sine dropping 150+ -> 60 Hz: the big inflated shell), a bandpassed slap that gets brighter
// with speed, a sub boom on the big ones, and, when the touch left the ball spinning fast, a whistling friction "zip" (narrow noise sweep)
let ballT=0,ballS=0;
export function ballHit(d,speed,verdict=''){crowdHit(d,speed,verdict);if(!(speed>1.5))return;const w=now();if(w-ballT<.05&&speed<ballS*1.4)return;cnt('ballHit');ballT=w;ballS=speed;const spin=ball.w.length()*BR;
 if(!AC)return;const t0=AC.currentTime;const k=cl(speed/40,0,1),v=near(ball.p);if(v<.02||!slot(.5))return;const o=dest(ball.p);
 os(t0,150+speed*2.2,60,.14+.14*k,(.16+.34*k)*v,'sine',o);nz(t0,.05+.06*k,1100+speed*35,(.1+.38*k)*v,.8,o);  /* the hardest hit peaks near -7 dBFS, 20 of them in a second under -4 */
 if(k>.6)os(t0,72,38,.38,.32*(k-.5)*v,'sine',o);
 const s=cl((spin-6)/30,0,1);if(s>.05){cnt('ballSpin');nz(t0+.01,.12+.12*s,1400+spin*20,.16*s*v,7,o,'bandpass',3400+spin*45,.02)}}
// ball off the floor / walls (physics ball.hit = impact speed): rubbery "bonk" (two sines, low body + shell), a thump of noise;
// off a wall or the ceiling the arena panel rings a little (narrow 2.4 kHz band); near a goal mouth it's a near miss for the crowd
let bncT=0;
export function ballBounce(hit){if(!(hit>3))return;const w=now();if(w-bncT<.04)return;cnt('ballBounce');bncT=w;
 const floor=ball.n&&ball.n.y>.7;if(!floor)nearMiss(hit);if(!AC)return;const t0=AC.currentTime;const k=cl(hit/40,0,1),v=near(ball.p);if(v<.02||!slot(.3))return;const o=dest(ball.p);
 os(t0,110+hit*2,62,.2+.1*k,.4*k**.7*v,'sine',o);os(t0,260+hit*3,190,.09,.12*k*v,'triangle',o);nz(t0,.07,500+hit*12,.3*k*v,1.1,o);
 if(!floor&&!GS.OBSON)nz(t0,.28,2400,.07*k*v,12,o)}

// ---------- crowd reactions ----------
// bias: your own team's moments get the home roar, the other side's get a smaller one (and a groan when they score on you)
const mine=team=>!GS.player||GS.player.team===team;
function crowdOn(){return!!L&&!GS.demo&&!GS.OBSON&&GS.state!=='lab'}
// a reaction: kind 'cheer' (roar swell), 'ooh' (rising then falling vowel), 'aww' (falling groan); lvl 0..1, hold s
function react(kind,lvl,hold=.8){cnt('crowd_'+kind);if(!AC||!crowdOn())return;const t=AC.currentTime,{f1,f2,vG,roar}=L;lvl=cl(lvl,0,1.2);
 if(kind==='cheer'){roar.gain.cancelScheduledValues(t);roar.gain.setTargetAtTime(.22*lvl,t,.12);roar.gain.setTargetAtTime(.03,t+hold,.9);  /* a save's roar sits 3 dB under the whole goal, not level with it */
  vG.gain.cancelScheduledValues(t);vG.gain.setTargetAtTime(.16*lvl,t,.1);vG.gain.setTargetAtTime(0,t+hold,.7);f1.frequency.setTargetAtTime(700,t,.1);f2.frequency.setTargetAtTime(1250,t,.1);
  L.ex=Math.max(L.ex,lvl);if(lvl>.6)for(let i=0;i<2+lvl*3;i++){const w=t+rnd(.1,hold),f=rnd(1900,3100);if(slot(.5))os(w,f,f*rnd(.85,1.15),rnd(.25,.6),.018*lvl,'sine',BUS.crowd,.05)}}  // stadium whistles
 else{const up=kind==='ooh',[a1,b1,a2,b2]=up?[300,480,700,1000]:[620,330,1050,680];vG.gain.cancelScheduledValues(t);f1.frequency.cancelScheduledValues(t);f2.frequency.cancelScheduledValues(t);
  f1.frequency.setValueAtTime(a1,t);f2.frequency.setValueAtTime(a2,t);f1.frequency.linearRampToValueAtTime(b1,t+.35);f2.frequency.linearRampToValueAtTime(b2,t+.35);
  if(up){f1.frequency.linearRampToValueAtTime(a1,t+hold);f2.frequency.linearRampToValueAtTime(a2,t+hold)}
  vG.gain.setValueAtTime(vG.gain.value,t);vG.gain.linearRampToValueAtTime(.45*lvl,t+.18);vG.gain.setTargetAtTime(0,t+hold*.7,.35)}}
// a touch the crowd reacts to: a save or a shot on target come as their own events (modes/match.js judges them); a hard hit otherwise gets a cheer
function crowdHit(d,speed,verdict){if(!d||GS.state!=='play'||verdict)return;if(speed>30){cnt('bigHit');react('cheer',mine(d.team)?.45:.3,.5)}}
const crowdSave=(d,speed)=>{cnt('save');react('cheer',(mine(d.team)?.75:.45)+cl((speed-15)/40,0,.3),1.2)};
const crowdShot=d=>{cnt('shot');react('ooh',mine(d.team)?.55:.4,1)};  // a shot on target: the crowd draws breath
// a hard bounce off the back wall right beside / over the goal mouth: "ooooh"
function nearMiss(hit){if(GS.state!=='play'||hit<8)return;const p=ball.p;if(Math.abs(p.z)<HL-BR-3)return;const ax=Math.abs(p.x)-GW/2,ay=p.y-GH;if(ax>14||ay>14||(ax<0&&ay<0))return;
 cnt('nearMiss');react('ooh',.5+cl((14-Math.max(ax,ay))/14,0,.5),1.3)}

// ---------- goal: explosion boom + horn + team stinger + crowd ----------
// boom: low-passed noise burst and a sub sine dropping 90 -> 30 Hz. Horn: the stadium air horn, three detuned sawtooths on an
// A-major chord (110 / 138.6 / 164.8 Hz) through a resonant low-pass, scooping up 6% into pitch, held ~1.8 s. Stinger: a quick
// triangle arpeggio in the scoring team's key (blue C major, orange D major) over the horn's tail.
// Levels: the whole goal lands about 4.5 dB (momentary loudness) above a hard ball hit, not 9; tools/sound-level.mjs measures it.
export function goalSfx(t,p){cnt('goal');if(!AC)return;const t0=AC.currentTime,v=.4+.6*near(p||ball.p),o=dest(p||ball.p);
 nz(t0,1.4,700,.55*v,.5,o,'lowpass',120,.01);os(t0,90,30,1.1,.3*v,'sine',o);nz(t0,.5,2200,.15*v,.7,o,'bandpass',800);
 if(GS.demo)return;cnt('horn');const h0=t0+.18,hl=AC.createBiquadFilter(),hg=AC.createGain();hl.type='lowpass';hl.frequency.value=950;hl.Q.value=3;hg.gain.value=0;hg.gain.setValueAtTime(0,h0);
 hg.gain.linearRampToValueAtTime(.08,h0+.06);hg.gain.setValueAtTime(.08,h0+1.7);hg.gain.exponentialRampToValueAtTime(.001,h0+2.2);hl.connect(hg).connect(BUS.fx);
 for(const[f,dt]of[[110,-3],[110,4],[138.6,-2],[164.8,3]]){const x=AC.createOscillator();x.type='sawtooth';x.detune.value=dt*2;x.frequency.setValueAtTime(f*.94,h0);x.frequency.exponentialRampToValueAtTime(f,h0+.12);x.connect(hl);x.start(h0);x.stop(h0+2.25)}
 const base=t?587.3:523.3;[1,1.26,1.498,2].forEach((r,i)=>os(h0+.15+i*.09,base*r,base*r,.32+(i===3?.4:0),.05,'triangle'));
 react('cheer',mine(t)?.8:.45,3);if(GS.player&&!mine(t))setTimeout(()=>react('aww',.6,1.4),150)}
// kickoff: 3-2-1 pips (sine 880 + octave click, like a race start) and a brighter GO chord with an upward air sweep; the crowd builds
export function countdown(n){cnt(n>0?'count':'go');if(!AC)return;const t0=AC.currentTime;
 if(n>0){os(t0,880,880,.18,.16,'sine',0,.004);os(t0,1760,1760,.05,.04,'triangle');nz(t0,.02,4200,.05,2)}
 else{for(const[f,ty]of[[1318.5,'sine'],[1760,'sine'],[880,'triangle']])os(t0,f,f,.5,.09,ty,0,.004);nz(t0,.45,400,.12,1.4,0,'bandpass',3200,.05);react('cheer',.35,.4)}}
// pop: the quad's locked flip, an air whoosh (noise band sweeping 500 -> 2600 -> 800 Hz over the turn) and a soft low "thup" at the start
export function popWhoosh(dur=.4){cnt('pop');if(!AC||!slot(dur))return;const t0=AC.currentTime,s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain();
 s.buffer=nbuf;fl.type='bandpass';fl.Q.value=1.6;fl.frequency.setValueAtTime(500,t0);fl.frequency.exponentialRampToValueAtTime(2600,t0+dur*.45);fl.frequency.exponentialRampToValueAtTime(800,t0+dur);
 g.gain.value=0;g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.32,t0+dur*.35);g.gain.exponentialRampToValueAtTime(.001,t0+dur+.05);s.connect(fl).connect(g).connect(BUS.fx);s.start(t0,Math.random()*1.5);s.stop(t0+dur+.08);
 os(t0,180,90,.09,.12)}
// Dogfight bullet into rock / ground: a sharp crack (high noise burst), a chip (short falling triangle), now and then a ricochet whine;
// in the caves (bullet or camera underground) two darker echoes follow at ~90 and ~200 ms
let rockT=0;
export function bulletRock(p){const w=now();if(w-rockT<.025)return;cnt('rock');rockT=w;if(!AC)return;const t0=AC.currentTime,v=near(p);if(v<.03||!slot(.3))return;const o=dest(p);
 nz(t0,.035,3200,.35*v,1.5,o);os(t0,1400,500,.03,.1*v,'triangle',o);if(Math.random()<.2){const f=rnd(3000,4200);os(t0+.01,f,f*.45,.28,.05*v,'sine',o)}
 let cave=false;try{cave=inCave(p.x,p.y,p.z)||inCave(camera.position.x,camera.position.y,camera.position.z)}catch(e){}
 if(cave){cnt('rockEcho');nz(t0+.09,.06,2000,.14*v,1.2,o);nz(t0+.2,.08,1500,.06*v,1,o)}}

// ---------- per frame: loops (scrape, roll, crowd bed) ----------
export function sfxTick(dt){if(!L)return;const t=AC.currentTime,on=!GS.demo&&!GS.paused;
 // scrape: the loudest sliding quad near the camera (in contact this tick, speed along the surface)
 let sv=0,sd=null,ss=0;if(on)for(const d of GS.drones){if(d.dead>0||!(d.slide>1.2)||!(d.gt>0))continue;const k=near(d.p)**2*cl((d.slide-1.2)/24,0,1)*(d===GS.player?1:.8);if(k>sv){sv=k;sd=d;ss=d.slide}}
 SND.scrape=sv;if(sv>.01)cnt('scrape');L.sG.gain.setTargetAtTime(.3*sv*(.7+.6*Math.random()),t,.015);if(sd){L.sF.frequency.setTargetAtTime(700+ss*55,t,.04);if(L.sP.pan)L.sP.pan.setTargetAtTime(sd===GS.player?0:panOf(sd.p),t,.05)}
 // tumbling on the ground: clatter clicks at a rate that follows the spin
 if(on)for(const d of GS.drones){if(d.dead>0||!(d.gt>0)||!d.w)continue;const w=d.w.length();if(w<7){d._clk=0;continue}d._clk=(d._clk||0)+dt*(w-5)*.5;while(d._clk>1){d._clk-=1;clatter(d,near(d.p)*cl((w-7)/20,.2,1)*.8)}}
 // ball roll: in contact, moving; pulsed at twice the spin rate
 const bon=on&&!GS.OBSON&&ball.c&&ball.bodyMode==='dyn',bs=bon?ball.v.length():0,rv=bon?cl((bs-1)/30,0,1)*near(ball.p):0;SND.roll=rv;if(rv>.01)cnt('roll');
 L.rG.gain.setTargetAtTime(.5*rv,t,.08);L.rF.frequency.setTargetAtTime(70+bs*5,t,.1);L.rl.frequency.setTargetAtTime(Math.max(.5,ball.w.length()/Math.PI),t,.1);L.rd.gain.setTargetAtTime(.35*rv,t,.1);if(L.rP.pan&&bon)L.rP.pan.setTargetAtTime(panOf(ball.p),t,.1);
 // crowd bed: Neon Arena and the outdoor stadiums (not Dogfight, not the Lab); building through the countdown, tense when the
 // ball is near a goal, loud after a goal, quieter between plays; freeplay has a sparse crowd
 const c=crowdOn()&&!GS.paused,out=S.map!=='arena',free=!!MODES[GS.GM]?.free;
 let lvl=0;if(c){const st=GS.state,tz=cl((Math.abs(ball.p.z)-(HL-70))/60,0,1);L.tens+=(tz-L.tens)*Math.min(1,dt*1.5);
  lvl=st==='kickoff'?.32+.18*cl(1-GS.stT/3,0,1):st==='play'?.3+.3*L.tens:st==='goal'?(GS.stT>1.6?.75:.24):st==='end'?.6:.2;lvl*=free?.45:1;lvl*=out?.8:1}
 L.ex=Math.max(0,L.ex-dt*.35);SND.crowd=lvl;SND.cheer=L.ex;if(lvl>.01)cnt('crowdBed');
 L.cG.gain.setTargetAtTime(.22*lvl,t,.6);L.cF.frequency.setTargetAtTime(out?340:430,t,1);L.lf.forEach((g,i)=>g.gain.setTargetAtTime(c?.22*lvl*(i?.16:.27):0,t,.5));
 if(!c){L.vG.gain.setTargetAtTime(0,t,.2);L.roar.gain.setTargetAtTime(0,t,.2)}
 else if(L.ex>.4&&Math.random()<dt*14*L.ex){if(slot(.03))nz(t,.025,rnd(1100,2200),.04*L.ex,1.2,BUS.crowd)}}  // claps in the roar
const panOf=p=>{const d=_x.subVectors(p,camera.position),l=d.length();return l<2?0:cl(d.dot(_y.set(1,0,0).applyQuaternion(camera.quaternion))/l,-1,1)*.8};
