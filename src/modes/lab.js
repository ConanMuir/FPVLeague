// ---------- Calibration Lab: a training-pack room where drills measure the pilot and the tuner retunes in real time ----------
// Flight state is read through the Drone (p, v, q, w) and the rigs only clamp it, so this keeps working when the flight model
// moves to Rapier: if Drone.step changes shape, only rigStep() needs a look. The Lab is an overlay (modes/registry.js): while LAB.on, step.js hands each physics step to its pre() below.
// Rigs (how the quad is held so each drill measures one thing):
//  floor   parked on the pad, motors idle                      hover/alt  vertical only, attitude held level
//  snap    position held, only the drill's axis can rotate      gimbal     position held, attitude free
import {AC,audioInit,noise,tone} from '../audio/audio.js';
import {$,QT,UP,V3,cl} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {BR,G,TE,THR} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {Drone} from '../flight/drone.js';
import {RO,RT,stk} from '../flight/rates.js';
import {OV,axr,humanControl,pad} from '../input/input.js';
import {setGame} from './dogfight.js';
import {showMenu} from './match.js';
import {registerOverlay} from './registry.js';
import {leaveGame} from '../net/net.js';
import {ballMesh} from '../render/ball.js';
import {GS} from '../state.js';
import {ANCHOR,DRILLS,ROOM,makeDrill} from '../tuner/drills.js';
import {LAB} from '../tuner/labstate.js';
import {buildRoom,labG} from '../tuner/room.js';
import {extras,makeTuner,onAlt,onHold,onHover,onHoverPhys,onRest,onSnap,onTrack,profile} from '../tuner/tuner.js';
export {LAB};
const D2R=Math.PI/180,R2D=180/Math.PI,_u=new V3(),_a=new V3(),_q=new QT(),_qt=new QT(),_qe=new QT(),_f=new V3(),_r=new V3(),LEVEL=new QT(),AXC=['z','x','y'];
Object.assign(LAB,{speed:'gradual',testT:0,st:'off',pid:'def',di:0,drill:null,T:null,cd:0,t:0,ang:[0,0,0],err:[0,0,0],tv:[0,0,0],last:'',before:null,saved:false,flash:0,hits:0});
const clone=o=>JSON.parse(JSON.stringify(o));
// pilot settings the Lab may change, as they were when the Lab opened (Revert restores exactly these)
const snapshot=()=>({rprof:clone(S.rprof),rpi:S.rpi,dz:S.dz,dzy:S.dzy,assist:S.assist});
function clearOv(){RO.r=null;for(const k in OV)delete OV[k]}
const apply=()=>{RO.r=profile(LAB.T);Object.assign(OV,extras(LAB.T))};  // instant: the next physics step flies the new tune
function place(d,y){d.p.set(ANCHOR[0],y,ANCHOR[2]);d.v.set(0,0,0);d.w.set(0,0,0);d.wt.set(0,0,0);d.q.copy(LEVEL);d.flipT=0;d.gt=0;d.dead=0;d.mesh.visible=true}
const startY=r=>r==='floor'||r==='hover'?.15:r==='alt'?8:ANCHOR[1];
export function enterLab(){leaveGame();audioInit();AC?.resume();setGame('league');buildRoom();labG.visible=true;ballMesh.visible=false;
 GS.drones.forEach(d=>d.dispose());const d=new Drone(0,0,false,'h');d.name='You';d.spawn=()=>place(d,startY(LAB.drill?.rig||'floor'));GS.drones=[d];GS.player=d;place(d,.15);
 GS.demo=false;GS.state='lab';GS.score=[0,0];LAB.cam=GS.camMode;GS.camMode=0;clearOv();LAB.before=snapshot();LAB.saved=false;LAB.T=null;LAB.drill=null;LAB.on=true;LAB.st='intro';
 showMenu(false);$('hud').hidden=true;$('lab').hidden=false;$('resume').hidden=false;$('leave').hidden=false;$('leave').textContent='Leave Lab'}
export function exitLab(){if(!LAB.on)return;LAB.on=false;LAB.st='off';clearOv();labG.visible=false;$('lab').hidden=$('labintro').hidden=$('labsum').hidden=true;
 GS.camMode=LAB.cam??GS.camMode;$('leave').textContent='Leave game';setGame(S.game)}
// adapt speed: Default always steps gently; Pro picks Gradual (the preset's own step) or Quick (bigger steps, sooner)
export const speedOf=pid=>pid==='pro'?(LAB.speed==='quick'?1.8:1):.85;
const hoverOf=d=>d?.fl?(G/(THR*d.fl.thr))**(1/(TE*d.fl.te)):null;  // motor share that holds this quad up (its parts' thrust and weight)
export function startPack(pid){LAB.pid=pid;clearOv();LAB.T=makeTuner(pid,clone(RT()),{dz:S.dz,dzy:S.dzy,assist:S.assist,speed:speedOf(pid)});onHoverPhys(LAB.T,hoverOf(GS.player));LAB.hits=0;LAB.last='';apply();startDrill(0)}
function startDrill(i){LAB.di=i;LAB.drill=makeDrill(DRILLS[i]);LAB.st='ready';LAB.cd=3;LAB.t=0;LAB.ang=[0,0,0];place(GS.player,startY(LAB.drill.rig));tone(660,660,.1,.08,'square')}
function handle(evs){const T=LAB.T;for(const e of evs){let ch=[];
 if(e.kind==='rest'){ch=onRest(T,e.N);LAB.last=e.N?`Sticks at rest: roll/pitch within ${Math.max(e.N[0].need,e.N[1].need).toFixed(3)}, yaw ${e.N[2].need.toFixed(3)}`:'No stick data'}
 else if(e.kind==='hover'){ch=onHover(T,e);LAB.last=e.motor!=null?`Hover at ${Math.round(e.motor*100)}% motor${e.cross!=null?`, yaw cross-talk ${e.cross.toFixed(3)}`:''}`:'Not enough steady hover in the band to measure'}
 else if(e.kind==='snap'){ch=onSnap(T,e.ax,e.M);const M=e.M;LAB.last=M.valid?`Overshoot ${Math.round(M.os)}% · short ${Math.round(M.us)}% · settle ${M.settle==null?'—':Math.round(M.settle)+' ms'} · wobbles ${M.osc} · lag ${M.lag==null?'—':Math.round(M.lag)+' ms'}`:'No stick input on that one'}
 else if(e.kind==='track'){ch=onTrack(T,e.Ms,OV.dz);LAB.last='Tracking error (RMS) '+e.Ms.map((m,i)=>['R','P','Y'][i]+' '+m.rms.toFixed(1)+'°').join(' · ')}
 else if(e.kind==='hold'){ch=onHold(T,e.M);const M=e.M;LAB.last=`Holding height: ${Math.round(M.inb*100)}% in the band · bounce ${M.amp.toFixed(1)} m · drift ${M.drift.toFixed(1)} m/s`}
 else if(e.kind==='alt'){ch=onAlt(T,e.M);const M=e.M;LAB.last=`In the band after ${M.tEnter==null?'—':M.tEnter.toFixed(1)+' s'} · overshoot ${M.over.toFixed(2)}× · ${M.exits} exits`}
 if(ch.length){apply();LAB.flash=Math.max(LAB.flash,.01);tone(990,1320,.12,.06)}}}
function nextDrill(){handle(LAB.drill.end());if(LAB.di+1<DRILLS.length)startDrill(LAB.di+1);else finish()}
export function skipDrill(){if(LAB.st==='ready'||LAB.st==='drill')nextDrill()}
export function finish(){if(LAB.drill&&LAB.st==='drill')handle(LAB.drill.end());LAB.st='sum';place(GS.player,.15)}
export function saveTo(slot){const T=LAB.T;if(!T)return;S.rprof[slot]=profile(T);S.rpi=slot;Object.assign(S,extras(T));clearOv();save();LAB.saved=true}
export function discard(){clearOv()}
export function revert(){const B=LAB.before;if(!B)return;S.rprof=clone(B.rprof);S.rpi=B.rpi;S.dz=B.dz;if(B.dzy==null)delete S.dzy;else S.dzy=B.dzy;S.assist=B.assist;clearOv();save();LAB.saved=false}
export function again(){clearOv();LAB.T=null;LAB.drill=null;LAB.st='intro';place(GS.player,.15)}
// Retry training: run the drills again starting from the tuned values, and keep improving on them
export function retry(){if(!LAB.T){again();return}onHoverPhys(LAB.T,hoverOf(GS.player));LAB.saved=false;LAB.hits=0;LAB.last='';apply();startDrill(0)}
// Test first: TEST_S of freeplay (you and the ball, no bots) flying the tuned settings, then back to the results
export const TEST_S=60;
export function startTest(){const d=GS.player;if(!LAB.T||!d)return;apply();LAB.st='test';LAB.testT=TEST_S;labG.visible=false;$('lab').hidden=true;setGame('free');
 ball.p.set(0,BR+6,0);ball.v.set(0,0,0);ball.last=null;ballMesh.visible=true;d.spawn=Drone.prototype.spawn;d.spawn();GS.state='play';$('hud').hidden=false;$('ltest').hidden=false}
export function endTest(){if(LAB.st!=='test')return;const d=GS.player;LAB.st='sum';$('ltest').hidden=$('hud').hidden=true;$('lab').hidden=false;setGame('league');
 labG.visible=true;ballMesh.visible=false;GS.state='lab';d.spawn=()=>place(d,startY(LAB.drill?.rig||'floor'));place(d,.15)}
export function testTick(dt){if(LAB.on&&LAB.st==='test'&&(LAB.testT-=dt)<=0)endTest()}
// the overlay: on while LAB.on, over League (rigs) or Freeplay (Test first); the rigs take every physics step except during the test flight
registerOverlay('lab',{on:()=>LAB.on,pre:dt=>{testTick(dt);if(LAB.st==='test')return false;labStep(dt);return true},enter:enterLab,exit:exitLab,fixedCam:true,fixedFlightMode:true});
// ---- one physics step (1/120 s)
export function labStep(dt){const d=GS.player;if(!LAB.on||!d)return;LAB.flash=Math.max(0,LAB.flash-dt);
 if(LAB.st!=='drill'&&LAB.st!=='ready'){place(d,.15);d.thr=d.ms=0;return}
 const D=LAB.drill;humanControl(d,dt,true);
 if(LAB.st==='ready'){place(d,startY(D.rig));if(D.rig==='floor')d.thr=d.ms=0;if((LAB.cd-=dt)<=0){LAB.st='drill';LAB.t=0;tone(990,990,.2,.1,'square')}return}
 rigStep(d,D,dt);
 const w=d.w;LAB.ang[0]-=w.z*dt*R2D;LAB.ang[1]-=w.x*dt*R2D;LAB.ang[2]-=w.y*dt*R2D;
 if(D.target)trackErr(d,D,LAB.t);
 const g=pad(),x=[stk[0],stk[1],stk[2]],raw=g?[axr(g,3),axr(g,2),axr(g,1)]:x;
 _f.set(0,0,-1).applyQuaternion(d.q);_r.set(1,0,0).applyQuaternion(d.q);
 handle(D.tick({t:LAB.t,x,raw,thr:stk[3],motor:d.thr,ang:[...LAB.ang],err:[...LAB.err],tv:[...LAB.tv],tilt:[-Math.asin(cl(_r.y,-1,1))*R2D,-Math.asin(cl(_f.y,-1,1))*R2D],p:d.p.toArray(),vy:d.v.y,dz:OV.dz??S.dz}));
 if((LAB.t+=dt)>=D.def.dur)nextDrill()}
function rigStep(d,D,dt){const r=D.rig;
 if(r==='floor'){place(d,.15);d.thr=d.ms=0;return}
 if(r==='hover'||r==='alt'){d.wt.set(0,0,0);d.w.set(0,0,0);d.q.copy(LEVEL);d.step(dt);d.p.x=ANCHOR[0];d.p.z=ANCHOR[2];d.v.x=d.v.z=0;d.q.copy(LEVEL);d.w.set(0,0,0)}
 else if(r==='snap'){const k=AXC[D.def.ax];for(const c of'xyz')if(c!==k){d.wt[c]=0;d.w[c]=0}d.step(dt);d.p.fromArray(ANCHOR);d.v.set(0,0,0);for(const c of'xyz')if(c!==k)d.w[c]=0}
 else if(r==='gimbal'){d.step(dt);d.p.fromArray(ANCHOR);d.v.set(0,0,0)}
 // the box: trivial collision (clamp + kill the velocity into the wall)
 const m=1.2;if(Math.abs(d.p.x)>ROOM.hx-m){d.p.x=Math.sign(d.p.x)*(ROOM.hx-m);d.v.x=0}if(Math.abs(d.p.z)>ROOM.hz-m){d.p.z=Math.sign(d.p.z)*(ROOM.hz-m);d.v.z=0}if(d.p.y>ROOM.h-m){d.p.y=ROOM.h-m;d.v.y=Math.min(0,d.v.y)}}
// tracking: target attitude = start attitude turned by the drill's target angles; error = that rotation seen from the quad, in stick axes
export const targetQ=(t,out)=>{const a=LAB.drill.target(t);return out.copy(LEVEL).multiply(_qt.setFromAxisAngle(_a.set(0,1,0),-a[2]*D2R)).multiply(_qt.setFromAxisAngle(_a.set(1,0,0),-a[1]*D2R)).multiply(_qt.setFromAxisAngle(_a.set(0,0,1),-a[0]*D2R))};
function trackErr(d,D,t){const qT=targetQ(t,_qe);const e=_q.copy(d.q).invert().multiply(qT);if(e.w<0){e.x=-e.x;e.y=-e.y;e.z=-e.z;e.w=-e.w}
 const s=Math.sqrt(Math.max(0,1-e.w*e.w)),ang=2*Math.atan2(s,e.w),k=s>1e-6?ang/s*R2D:2*R2D;LAB.err=[-e.z*k,-e.x*k,-e.y*k];LAB.tv=D.rate(t)}
// read-only snapshot for tools/smoke.mjs
export const labSnap=()=>({on:LAB.on,st:LAB.st,pid:LAB.pid,drill:LAB.drill?.def.id??null,di:LAB.di,t:+LAB.t.toFixed(2),cd:LAB.cd,rig:LAB.drill?.rig??null,ang:[...LAB.ang],
 target:LAB.drill?.view?.target??null,err:[...LAB.err],band:LAB.drill?.view?.band??null,y:GS.player?.p.y??null,tilt:GS.player?(()=>{_r.set(1,0,0).applyQuaternion(GS.player.q);return -Math.asin(cl(_r.y,-1,1))*R2D})():0,
 proj:(LAB.drill?.proj||[]).map(p=>({st:p.st,p:[...p.p]})),reps:LAB.T?.reps??0,changes:LAB.T?.changes??0,log:(LAB.T?.log||[]).slice(-3).map(l=>l.txt),working:RO.r?clone(RO.r):null,saved:LAB.saved})
