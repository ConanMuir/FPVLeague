// ---------- Dogfight guns: bullet pool, firing, bullet hits, tracer drawing ----------
// bullets: pooled tracers drawn as additive line segments
import * as THREE from 'three';
import {camTilt} from '../render/camera.js';
import {near,noise} from '../audio/audio.js';
import {bulletRock} from '../audio/sfx.js';
import {COL,DIFF,QT,V3,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {TUR,hitDrone,hitTurret} from './dogfight.js';
import {bulletCast} from '../physics/world.js';
import {emitEv} from '../core/events.js';
import {emit} from '../render/particles.js';
import {camera,scene} from '../render/renderer.js';
import {_gd,_gp,_gq,_v} from '../scratch.js';
import {GS} from '../state.js';
// BH: replay hooks (render/replay.js records every round fired and when it ends, for the Dogfight kill cam)
export const BH={shot:null,end:null};
export const BN=600,BUL=Array.from({length:BN},()=>({p:new V3(),v:new V3(),life:0,team:0,real:false,by:null,dmg:0,col:0})),bPos=new Float32Array(BN*6),bCol=new Float32Array(BN*6);let bi=0;
const bGeo=new THREE.BufferGeometry();bGeo.setAttribute('position',new THREE.BufferAttribute(bPos,3));bGeo.setAttribute('color',new THREE.BufferAttribute(bCol,3));
{const l=new THREE.LineSegments(bGeo,new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));l.frustumCulled=false;scene.add(l)}
const BSTR=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1).translate(0,0,-.5),new THREE.MeshBasicMaterial({toneMapped:false,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}),BN);BSTR.frustumCulled=false;BSTR.count=0;BSTR.setColorAt(0,new THREE.Color());scene.add(BSTR);
export const BSPD=400,FIRE_HZ=12,BCOL=[0x7cc4ff,0xffa060,0xff4040].map(c=>new THREE.Color(c).multiplyScalar(4));
export const gunDir=(d,tilt,out)=>out.set(0,Math.sin(tilt),-Math.cos(tilt)).applyQuaternion(d.q);  // the FPV camera axis (body forward tilted up by the camera uptilt)
export function shoot(p,dir,v,team,real,by,dmg,spread,spd){const b=BUL[bi++%BN];b.p.copy(p);b.v.copy(dir);b.v.x+=(Math.random()-.5)*spread;b.v.y+=(Math.random()-.5)*spread;b.v.z+=(Math.random()-.5)*spread;
 b.v.setLength(spd);if(v)b.v.add(v);b.life=spd>200?.95:1.6;b.dist=0;b.team=team;b.real=real;b.by=by;b.dmg=dmg;b.col=by?.isTurret?2:team;if(BH.shot)BH.shot(b);
 const o=(bi-1)%BN*4;BIP[o]=p.x;BIP[o+1]=p.y;BIP[o+2]=p.z;BIP[o+3]=0;BEP[(bi-1)%BN]=bE}  // drawn from the muzzle this tick (gunsLerp)
export function droneFire(d,dt,real){d.fcd-=dt;if(!d.firing||d.dead>0||d.fcd>0)return;d.fcd=1/FIRE_HZ;const dir=gunDir(d,(d===GS.player?camTilt():d.tilt??30)*Math.PI/180,_gd);
 // twin guns under the frame, alternating left/right, converging on the crosshair 150 m out (keeps the muzzle out of the FPV view)
 d.gs=-(d.gs||1);const mz=_gp.set(d.gs*.4,-.55,-.3).applyQuaternion(d.q).add(d.p),aimP=_gq.copy(d.p).addScaledVector(dir,150);dir.subVectors(aimP,mz).normalize();
 shoot(mz,dir,d.v,d.team,real,d,8,d.bot?DIFF[d.skill??S.diff].noise*.012+.006:.006,BSPD);const k=near(d.p);if(k>.05)noise(.05,1800,.1*k,2)}
// hits: a Rapier ray against the map and a 1.4 m sphere cast against the drones' 'bullet' colliders, from where the round was
// to where it is now (rounds at 400 m/s plus the shooter's speed move 3-6 m a tick, so nothing thin can be skipped); turrets are
// 2.6 m spheres along the same segment. The nearest hit along the path wins.
function segT(a,b,c,r){_gq.subVectors(b,a);const l2=_gq.lengthSq(),t=l2?cl(_gq.dot(_v.subVectors(c,a))/l2,0,1):0;return _v.copy(a).addScaledVector(_gq,t).distanceToSquared(c)<r*r?t:null}
const _bd=new V3();
const E_BUL={type:'bullet',d:null,tag:'',other:null};  // the 'bullet' event payload (core/events.js), reused
export function bullets(dt){for(const b of BUL){if(b.life<=0)continue;b.life-=dt;b.dist+=b.v.length()*dt;const p0=_gp.copy(b.p);_bd.copy(b.v).multiplyScalar(dt);b.p.add(_bd);
 const h=bulletCast(p0,_bd,b.team,b.by);let tt=h?h.t:2,tur=null;for(const t of TUR){if(t.re>0||t.t===b.team)continue;const s=segT(p0,b.p,t.p,2.6);if(s!=null&&s<tt){tt=s;tur=t}}
 if(tur){b.life=0;b.p.copy(p0).addScaledVector(_bd,tt);emit(b.p,0xffc640,10,8,.4);if(b.real)hitTurret(tur,b.dmg,b.by)}
 else if(h){b.life=0;b.p.copy(h.p);if(h.d){emit(b.p,COL[h.d.team],10,8,.4);E_BUL.d=h.d;E_BUL.tag=h.tag;E_BUL.other=b.by;emitEv('bullet',E_BUL);if(b.real)hitDrone(h.d,b.dmg,b.by)}else{emit(b.p,0xffd0a0,4,6,.3);bulletRock(b.p)}}if(b.life<=0&&BH.end)BH.end(b)}}
// render interpolation (main.js, beside render/interp.js for the quads and the ball): rounds move 3-6 m a tick, so drawn as simulated they
// stood still on every other frame at 240 Hz. gunsSnap() before every tick keeps each live round's position and travelled distance (and each
// turret's aim) apart from BUL / TUR; gunsLerp(a) moves them a of the way from there to the sim values for the frame's draw, gunsBack() puts
// the sim values back. A round fired this tick is drawn from its muzzle. No allocation per frame.
const BIP=new Float64Array(BN*4),BSIM=new Float64Array(BN*4),BEP=new Int32Array(BN).fill(-1),BSW=new Int32Array(BN);let bE=0,bSN=0,tSW=false;
export function gunsSnap(){bE++;for(let i=0;i<BN;i++){const b=BUL[i];if(b.life<=0)continue;const o=i*4;BIP[o]=b.p.x;BIP[o+1]=b.p.y;BIP[o+2]=b.p.z;BIP[o+3]=b.dist;BEP[i]=bE}
 for(const t of TUR)(t.ipA||(t.ipA=new V3())).copy(t.aim)}
export function gunsLerp(a){bSN=0;for(let i=0;i<BN;i++){const b=BUL[i];if(b.life<=0||BEP[i]!==bE)continue;const o=i*4,p=b.p;BSIM[o]=p.x;BSIM[o+1]=p.y;BSIM[o+2]=p.z;BSIM[o+3]=b.dist;
  p.set(BIP[o]+(p.x-BIP[o])*a,BIP[o+1]+(p.y-BIP[o+1])*a,BIP[o+2]+(p.z-BIP[o+2])*a);b.dist=BIP[o+3]+(b.dist-BIP[o+3])*a;BSW[bSN++]=i}
 tSW=true;for(const t of TUR){if(!t.ipA)continue;(t.simA||(t.simA=new V3())).copy(t.aim);t.aim.lerpVectors(t.ipA,t.simA,a);if(t.aim.lengthSq()>1e-8)t.aim.normalize();else t.aim.copy(t.simA)}}
export function gunsBack(){for(let k=0;k<bSN;k++){const i=BSW[k],o=i*4,b=BUL[i];b.p.set(BSIM[o],BSIM[o+1],BSIM[o+2]);b.dist=BSIM[o+3]}bSN=0;
 if(tSW)for(const t of TUR)if(t.simA)t.aim.copy(t.simA);tSW=false}
const _bc=new THREE.Color(),_bm4=new THREE.Matrix4(),_bq=new QT(),_bz=new V3(0,0,1),_bs=new V3();
export function dfDraw(now){for(const t of TUR){t.head.visible=t.re<=0;t.g.scale.y=t.re>0?.45:1;if(t.re<=0){t.head.rotation.y=Math.atan2(-t.aim.x,-t.aim.z);t.br.rotation.x=Math.asin(cl(t.aim.y,-1,1))}}
 let ns=0;const m4=_bm4,q=_bq;for(const b of BUL){if(b.life<=0)continue;_gd.copy(b.v).normalize();const w=Math.max(.06,b.p.distanceTo(camera.position)*.005),L2=Math.min(b.col===2?5:10,b.dist);
  q.setFromUnitVectors(_bz,_gd);m4.compose(b.p,q,_bs.set(w,w,L2));BSTR.setMatrixAt(ns,m4);BSTR.setColorAt(ns++,b.by===GS.player?_bc.copy(BCOL[b.col]).multiplyScalar(cl((b.dist-4)/30,.08,1)):BCOL[b.col])}  // your own rounds fade in, so they don't glare up from under the camera
 BSTR.count=ns;BSTR.instanceMatrix.needsUpdate=true;if(BSTR.instanceColor)BSTR.instanceColor.needsUpdate=true;
 for(let i=0;i<BN;i++){const b=BUL[i],j=i*6;if(b.life<=0){if(bCol[j]||bCol[j+3]){bCol.fill(0,j,j+6);bPos.fill(0,j,j+6)}continue}const c=b.by===GS.player?_bc.copy(BCOL[b.col]).multiplyScalar(cl((b.dist-4)/30,.08,1)):BCOL[b.col],L2=Math.min(b.col===2?2.5:5,b.dist);_gd.copy(b.v).normalize();
  bPos[j]=b.p.x;bPos[j+1]=b.p.y;bPos[j+2]=b.p.z;bPos[j+3]=b.p.x-_gd.x*L2;bPos[j+4]=b.p.y-_gd.y*L2;bPos[j+5]=b.p.z-_gd.z*L2;bCol[j]=bCol[j+3]=c.r;bCol[j+1]=bCol[j+4]=c.g;bCol[j+2]=bCol[j+5]=c.b}
 bGeo.attributes.position.needsUpdate=bGeo.attributes.color.needsUpdate=true}
