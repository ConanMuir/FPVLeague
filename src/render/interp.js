// ---------- render interpolation: the sim ticks at 120 Hz (core/loop.js), the screen draws at whatever rate it has ----------
// Leaf module (three only): tools/league-judder.mjs runs it in node.
// A body is any object with a position p (Vector3) and an orientation q (Quaternion): the ball and the local drones (main.js). Their
// p / q are the sim's own state (physics/world.js writes them into Rapier before each step and reads them back after it). The previous
// tick's pose and the sim pose are kept apart from them, in body.__ip, and the drawn pose only sits in p / q between begin() and end():
//   snap()     before every sim tick: remembers each body's pose (the previous state)
//   begin(a)   before the frame is drawn: each body to prev + (sim - prev) * a (q: slerp), so meshes, camera, HUD and sound all see one moment
//   end()      after the frame's reads: the sim pose back, exactly (the stored copy), before anything can step or send it
// No tick runs between begin() and end(), so nothing interpolated ever reaches the physics. A body that moved more than 20 m in one tick
// (a spawn, a kickoff, a reset) is drawn where it is, and so is one that has no snapshot from the latest tick (it just appeared).
// each(f) calls f(body) for every body and must not allocate; nothing here allocates per frame (each body gets its vectors once).
import {Quaternion,Vector3} from 'three';
const JUMP2=400;
export function makeInterp(each){let E=0,A=1,n=0;const sw=[];
 const snap1=b=>{const S=b.__ip||(b.__ip={e:-1,p:new Vector3(),q:new Quaternion(),sp:new Vector3(),sq:new Quaternion()});S.p.copy(b.p);S.q.copy(b.q);S.e=E};
 const lerp1=b=>{const S=b.__ip;if(!S||S.e!==E||S.p.distanceToSquared(b.p)>JUMP2)return;S.sp.copy(b.p);S.sq.copy(b.q);b.p.lerpVectors(S.p,S.sp,A);b.q.slerpQuaternions(S.q,S.sq,A);sw[n++]=b};
 return{
  snap(){E++;each(snap1)},
  begin(a){A=a;n=0;each(lerp1)},
  end(){for(let i=0;i<n;i++){const b=sw[i],S=b.__ip;b.p.copy(S.sp);b.q.copy(S.sq);sw[i]=null}n=0}}}
