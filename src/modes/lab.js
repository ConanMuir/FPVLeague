// ---------- Calibration Lab: a training-pack room where drills measure the pilot and the tuner retunes in real time ----------
// Flight state is read through the Drone (p, v, q, w) and the rigs only clamp it, so this keeps working when the flight model
// moves to Rapier: if Drone.step changes shape, only rigStep() needs a look. step.js hands each physics step here while LAB.on.
// Rigs (how the quad is held so each drill measures one thing):
//  floor   parked on the pad, motors idle                      hover/alt  vertical only, attitude held level
//  snap    position held, only the drill's axis can rotate      gimbal     position held, attitude free
//  dodge   height held and throttle automatic, free to translate within 11 m, tilt stops at 60°
import {AC,audioInit,noise,tone} from '../audio/audio.js';
import {$,QT,UP,V3,cl} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {G,TE,THR} from '../config/tune.js';
import {Drone} from '../flight/drone.js';
import {RO,RT,stk} from '../flight/rates.js';
import {OV,axr,humanControl,pad} from '../input/input.js';
import {setGame} from './dogfight.js';
import {showMenu} from './match.js';
import {leaveGame} from '../net/net.js';
import {ballMesh} from '../render/ball.js';
import {GS} from '../state.js';
import {ANCHOR,DRILLS,ROOM,makeDrill} from '../tuner/drills.js';
import {LAB} from '../tuner/labstate.js';
import {buildRoom,labG} from '../tuner/room.js';
import {extras,makeTuner,onAlt,onDodge,onHover,onRest,onSnap,onTrack,profile} from '../tuner/tuner.js';
export {LAB};
const D2R=Math.PI/180,R2D=180/Math.PI,_u=new V3(),_a=new V3(),_q=new QT(),_qt=new QT(),_qe=new QT(),_f=new V3(),_r=new V3(),LEVEL=new QT(),AXC=['z','x','y'];
Object.assign(LAB,{st:'off',pid:'def',di:0,drill:null,T:null,cd:0,t:0,ang:[0,0,0],err:[0,0,0],tv:[0,0,0],last:'',before:null,saved:false,flash:0,hits:0});
const clone=o=>JSON.parse(JSON.stringify(o));
// pilot settings the Lab may change, as they were when the Lab opened (Revert restores exactly these)
const snapshot=()=>({rprof:clone(S.rprof),rpi:S.rpi,dz:S.dz,dzy:S.dzy,assist:S.assist});
function clearOv(){RO.r=null;for(const k in OV)delete OV[k]}
const apply=()=>{RO.r=profile(LAB.T);Object.assign(OV,extras(LAB.T))};  // instant: the next physics step flies the new tune
function place(d,y){d.p.set(ANCHOR[0],y,ANCHOR[2]);d.v.set(0,0,0);d.w.set(0,0,0);d.wt.set(0,0,0);d.q.copy(LEVEL);d.flipT=0;d.gt=0;d.dead=0;d.mesh.visible=true}
const startY=r=>r==='floor'||r==='hover'?.15:r==='dodge'||r==='alt'?8:ANCHOR[1];
export function enterLab(){leaveGame();audioInit();AC?.resume();setGame('league');buildRoom();labG.visible=true;ballMesh.visible=false;
 GS.drones.forEach(d=>d.dispose());const d=new Drone(0,0,false,'h');d.name='You';d.spawn=()=>place(d,startY(LAB.drill?.rig||'floor'));GS.drones=[d];GS.player=d;place(d,.15);
 GS.demo=false;GS.state='lab';GS.score=[0,0];LAB.cam=GS.camMode;GS.camMode=0;clearOv();LAB.before=snapshot();LAB.saved=false;LAB.T=null;LAB.drill=null;LAB.on=true;LAB.st='intro';
 showMenu(false);$('hud').hidden=true;$('lab').hidden=false;$('resume').hidden=false;$('leave').hidden=false;$('leave').textContent='Leave Lab'}
export function exitLab(){if(!LAB.on)return;LAB.on=false;LAB.st='off';clearOv();labG.visible=false;$('lab').hidden=$('labintro').hidden=$('labsum').hidden=true;
 GS.camMode=LAB.cam??GS.camMode;$('leave').textContent='Leave game';setGame(S.game)}
export function startPack(pid){LAB.pid=pid;clearOv();LAB.T=makeTuner(pid,clone(RT()),{dz:S.dz,dzy:S.dzy,assist:S.assist});LAB.hits=0;LAB.last='';apply();startDrill(0)}
function startDrill(i){LAB.di=i;LAB.drill=makeDrill(DRILLS[i]);LAB.st='ready';LAB.cd=3;LAB.t=0;LAB.ang=[0,0,0];place(GS.player,startY(LAB.drill.rig));tone(660,660,.1,.08,'square')}
function handle(evs){const T=LAB.T;for(const e of evs){let ch=[];
 if(e.kind==='rest'){ch=onRest(T,e.N);LAB.last=e.N?`Sticks at rest: roll/pitch within ${Math.max(e.N[0].need,e.N[1].need).toFixed(3)}, yaw ${e.N[2].need.toFixed(3)}`:'No stick data'}
 else if(e.kind==='hover'){ch=onHover(T,e);LAB.last=e.motor!=null?`Hover at ${Math.round(e.motor*100)}% motor${e.cross!=null?`, yaw cross-talk ${e.cross.toFixed(3)}`:''}`:'Not enough steady hover in the band to measure'}
 else if(e.kind==='snap'){ch=onSnap(T,e.ax,e.M);const M=e.M;LAB.last=M.valid?`Overshoot ${Math.round(M.os)}% · short ${Math.round(M.us)}% · settle ${M.settle==null?'—':Math.round(M.settle)+' ms'} · wobbles ${M.osc} · lag ${M.lag==null?'—':Math.round(M.lag)+' ms'}`:'No stick input on that one'}
 else if(e.kind==='track'){ch=onTrack(T,e.Ms,OV.dz);LAB.last='Tracking error (RMS) '+e.Ms.map((m,i)=>['R','P','Y'][i]+' '+m.rms.toFixed(1)+'°').join(' · ')}
 else if(e.kind==='dodge'){ch=onDodge(T,e.M);const M=e.M;LAB.last=`${M.hit?'Hit':'Dodged'} · reaction ${M.react==null?'—':M.react.toFixed(2)+' s'} · over-correction ${Math.round(M.over)}°`}
 else if(e.kind==='alt'){ch=onAlt(T,e.M);const M=e.M;LAB.last=`In the band after ${M.tEnter==null?'—':M.tEnter.toFixed(1)+' s'} · overshoot ${M.over.toFixed(2)}× · ${M.exits} exits`}
 else if(e.kind==='hit'){LAB.hits++;GS.shake=Math.max(GS.shake,.5);noise(.25,220,.35);LAB.flash=.4}
 if(ch.length){apply();LAB.flash=Math.max(LAB.flash,.01);tone(990,1320,.12,.06)}}}
function nextDrill(){handle(LAB.drill.end());if(LAB.di+1<DRILLS.length)startDrill(LAB.di+1);else finish()}
export function skipDrill(){if(LAB.st==='ready'||LAB.st==='drill')nextDrill()}
export function finish(){if(LAB.drill&&LAB.st==='drill')handle(LAB.drill.end());LAB.st='sum';place(GS.player,.15)}
export function saveTo(slot){const T=LAB.T;if(!T)return;S.rprof[slot]=profile(T);S.rpi=slot;Object.assign(S,extras(T));clearOv();save();LAB.saved=true}
export function discard(){clearOv()}
export function revert(){const B=LAB.before;if(!B)return;S.rprof=clone(B.rprof);S.rpi=B.rpi;S.dz=B.dz;if(B.dzy==null)delete S.dzy;else S.dzy=B.dzy;S.assist=B.assist;clearOv();save();LAB.saved=false}
export function again(){clearOv();LAB.T=null;LAB.drill=null;LAB.st='intro';place(GS.player,.15)}
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
 else if(r==='dodge'){_u.set(0,1,0).applyQuaternion(d.q);d.thr=Math.min(1,(G/Math.max(.5,_u.y)/THR)**(1/TE));d.boosting=false;d.step(dt);d.p.y=8;d.v.y=0;
  const h=Math.hypot(d.p.x,d.p.z);if(h>11){d.p.x*=11/h;d.p.z*=11/h;const vr=(d.v.x*d.p.x+d.v.z*d.p.z)/11;if(vr>0){d.v.x-=vr*d.p.x/11;d.v.z-=vr*d.p.z/11}}
  _u.set(0,1,0).applyQuaternion(d.q);const tl=Math.acos(cl(_u.y,-1,1)),lim=60*D2R;if(tl>lim){_a.crossVectors(_u,UP);if(_a.lengthSq()>1e-8){_q.setFromAxisAngle(_a.normalize(),tl-lim);d.q.premultiply(_q).normalize()}}}
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
