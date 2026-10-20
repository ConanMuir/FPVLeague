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
// Per-body state lives in one property, body.__ip = {e: tick epoch of the snapshot, f: frame it was drawn in, p / q: previous, sp / sq: sim,
// rp / rq: drawn}, so it can't collide with the games' own fields.
export function makeInterp(){const src=[],sw=[];let E=0,F=0,A=1;
 const each=f=>{for(const s of src){if(typeof s==='function')s(f);else for(let i=0;i<s.length;i++)f(s[i])}};
 const st=b=>b.__ip||(b.__ip={e:-1,f:-1,p:new V3(),q:null,sp:new V3(),rp:new V3(),sq:null,rq:null});
 const snap1=b=>{if(!b||!b.p)return;const S=st(b);S.p.copy(b.p);if(b.q&&b.q.isQuaternion){if(!S.q){S.q=new QT();S.sq=new QT();S.rq=new QT()}S.q.copy(b.q)}S.e=E};
 const lerp1=b=>{const S=b&&b.__ip;if(!S||S.e!==E||S.f===F||!b.p)return;const p=b.p;if(S.p.distanceToSquared(p)>JUMP2)return;S.f=F;
  S.sp.copy(p);p.lerpVectors(S.p,S.sp,A);S.rp.copy(p);
  if(S.q&&b.q){S.sq.copy(b.q);b.q.slerpQuaternions(S.q,S.sq,A);S.rq.copy(b.q)}sw.push(b)};
 const I={
  add(s){src.push(s);return s},
  snap(){E++;each(snap1)},
  cut(b){if(b&&b.__ip)b.__ip.e=-1},
  begin(a){F++;sw.length=0;A=a>=1?1:a<=0?0:a;if(A<1)each(lerp1)},
  end(){for(const b of sw){const S=b.__ip;if(b.p.equals(S.rp))b.p.copy(S.sp);else S.e=-1;if(S.q&&b.q){if(b.q.equals(S.rq))b.q.copy(S.sq);else S.e=-1}}sw.length=0},
  get alpha(){return A}};
 return I}
