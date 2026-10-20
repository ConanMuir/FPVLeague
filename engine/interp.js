// Render interpolation for a fixed-tick sim (engine/loop.js ticks at 120 Hz, the display runs at whatever it runs at).
// A body is any object with a position p (THREE.Vector3) and, optionally, an orientation q (THREE.Quaternion).
//   snap()      before every sim tick: remembers where each registered body is (its previous state)
//   begin(a)    just before drawing a frame: moves every body to prev + (cur - prev) * a (q: slerp), so the meshes, the camera, the overlays,
//               the radar and the sounds all see one consistent in-between moment
//   end()       right after drawing: the sim values go back. Draw code that moved a body itself (a co-op snapshot snapping a track) keeps
//               its move, and that body is drawn where it is until the next tick.
//   add(src)    registers bodies: an array of bodies (read live, so pushing to and splicing it later is fine), or a function each=>{...}
//               that calls each(body) for every body (for nested lists). Bodies that appeared since the last tick are drawn where they are.
//   cut(body)   a teleport (spawn, respawn on the mat): drawn where it is now, not swept across from where it was
// Moves of more than 400 m in one tick are taken as teleports too. Nothing is allocated per frame (each body gets its spare vectors once).
// Always pair begin() and end() (try / finally): between them the bodies hold their drawn, not their simulated, state.
import * as THREE from 'three';
const V3=THREE.Vector3,QT=THREE.Quaternion,JUMP2=400*400;
export function makeInterp(){const src=[],sw=[];let E=0,F=0;
 const each=f=>{for(const s of src){if(typeof s==='function')s(f);else for(let i=0;i<s.length;i++)f(s[i])}};
 const snap1=b=>{if(!b||!b.p)return;(b._ip||(b._ip=new V3())).copy(b.p);if(b.q&&b.q.isQuaternion)(b._iq||(b._iq=new QT())).copy(b.q);b._ie=E};
 let A=1;
 const lerp1=b=>{if(!b||b._ie!==E||b._if===F||!b.p)return;const p=b.p,ip=b._ip;if(ip.distanceToSquared(p)>JUMP2)return;b._if=F;
  (b._sp||(b._sp=new V3())).copy(p);p.lerpVectors(ip,b._sp,A);(b._rp||(b._rp=new V3())).copy(p);
  if(b._iq&&b.q){(b._sq||(b._sq=new QT())).copy(b.q);b.q.slerpQuaternions(b._iq,b._sq,A);(b._rq||(b._rq=new QT())).copy(b.q)}sw.push(b)};
 const I={
  add(s){src.push(s);return s},
  snap(){E++;each(snap1)},
  cut(b){if(b)b._ie=-1},
  begin(a){F++;sw.length=0;A=a>=1?1:a<=0?0:a;if(A<1)each(lerp1)},
  end(){for(const b of sw){if(b.p.equals(b._rp))b.p.copy(b._sp);else b._ie=-1;if(b._rq&&b.q&&b._iq){if(b.q.equals(b._rq))b.q.copy(b._sq);else b._ie=-1}}sw.length=0},
  get alpha(){return A}};
 return I}
