// ---------- long line (Match setting "Long line", off by default) ----------
// Touch the ball and it hangs from your quad on a rope, like a helicopter sling load. Only a towed ball scores (it has to be dragged
// across the goal line), and any other drone that touches the ball takes the line. The rope is a stiff one-sided spring-damper (pulls, never
// pushes) applied as an impulse to both bodies with their real masses, so a heavy swinging ball yanks the quad around, loads the
// throttle and pendulums under it. It hooks under the quad's belly, below the centre of mass, so a swinging load also tips the quad.
import * as THREE from 'three';
import {HL,COL} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BM,BR,DRAD,MAXB} from '../config/tune.js';
import {noise,tone} from '../audio/audio.js';
import {ball} from '../physics/ball.js';
import {scene} from '../render/renderer.js';
import {GS} from '../state.js';
import {feed} from '../ui/hud.js';
export const LL={d:null,cd:0,z:0};  // d: the drone holding the line; cd: no steal until this runs out; z: ball z last tick (goal crossing)
const _n=new THREE.Vector3(),_h=new THREE.Vector3(),_u=new THREE.Vector3(),_r=new THREE.Vector3(),_q=new THREE.Quaternion();
export const ropeLen=()=>7+BR*2;  // hook to the top of the ball
const hookOf=(d,out)=>out.set(0,-.3*DRAD/.6,0).applyQuaternion(d.q).add(d.p);
const who=d=>d===GS.player?'You':d.name;
export function llDrop(){LL.d=null;LL.cd=0}
// a drone touched the ball: it takes the line (opponents steal it; a teammate's touch doesn't take it off you) (if it isn't already on its own line and the last swap has settled)
export function llTouch(d){if(!S.longline||LL.d===d||LL.cd>0||d.dead>0||LL.d&&LL.d.team===d.team)return;const stole=!!LL.d;LL.d=d;LL.cd=.6;LL.z=ball.p.z;
 if(!GS.demo)feed(stole?`${who(d)} stole the line`:`${who(d)} hooked the ball`);if(d===GS.player||stole)tone(stole?520:380,stole?260:760,.18,.12,'triangle')}
// one tick, after the flight model and before the Rapier step (so both bodies move with the rope's impulse this tick)
export function llStep(dt){LL.cd-=dt;const d=LL.d;if(!d)return;if(d.dead>0||!GS.drones.includes(d)){LL.d=null;return}
 const h=hookOf(d,_h),n=_n.subVectors(ball.p,h),dist=n.length(),L=ropeLen()+BR;if(dist<1e-4)return;n.divideScalar(dist);
 const ext=dist-L;LL.j=0;if(ext<=0)return;  // slack: the rope just hangs
 const ib=1/BM,id=1/d.fl.mass,vr=_r.subVectors(ball.v,d.v).dot(n);
 // impulse that stops the ends separating, plus a soft pull-back of the stretch (rope elasticity), never a push
 const me=1/(ib+id),W=18,soft=me*dt*(W*W*ext+2*.7*W*vr),hard=me*(vr+(ext-3)/dt);  // rope as a stiff spring-damper (~0.35 s stretch period), hard stop past 3 m of stretch
 const j=Math.max(0,ext>3?Math.max(soft,hard):Math.min(soft,me*(vr+ext/dt)));LL.j=j*id;if(j<=0)return;
 ball.v.addScaledVector(n,-j*ib);d.v.addScaledVector(n,j*id);const bs=ball.v.length();if(bs>MAXB)ball.v.multiplyScalar(MAXB/bs);
 // the hook sits below the centre of mass: the pull also tips the quad toward the load (body-frame rates, the flight controller fights it)
 _q.copy(d.q).invert();const nb=_u.copy(n).applyQuaternion(_q),hb=-.3*DRAD/.6;d.w.x+=hb*nb.z*j*id*2.2;d.w.z-=hb*nb.x*j*id*2.2;  // r x F with r = (0,hb,0)
 if(j*id>6&&d===GS.player)noise(.08,160,Math.min(.25,j*id/60))}
// goals: only a towed ball counts, and only when it is dragged across the line from the pitch (hooking one already in the net doesn't)
export function llGoal(){if(!LL.d){LL.z=ball.p.z;return -1}const z0=LL.z,z=ball.p.z,e=HL+BR;LL.z=z;if(z0>=-e&&z<-e)return 0;if(z0<=e&&z>e)return 1;return -1}

// ---------- the rope you see: a hanging curve when slack, straight when taut ----------
const N=20,geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));
const mat=new THREE.LineBasicMaterial({color:0xdfe6f2}),line=new THREE.Line(geo,mat);line.frustumCulled=false;line.visible=false;scene.add(line);
export function llDraw(){const d=LL.d;line.visible=!!(S.longline&&d&&d.dead<=0&&ball.p);if(!line.visible)return;mat.color.setHex(COL[d.team]).lerp(new THREE.Color(0xffffff),.55);
 const a=hookOf(d,_h),b=_r.copy(ball.p).addScaledVector(_n.subVectors(a,ball.p).normalize(),BR),dist=a.distanceTo(b),Lr=ropeLen(),sag=dist<Lr?Math.sqrt(Lr*Lr-dist*dist)*.5:0,P=geo.attributes.position.array;
 for(let i=0;i<N;i++){const t=i/(N-1);P[i*3]=a.x+(b.x-a.x)*t;P[i*3+1]=a.y+(b.y-a.y)*t-sag*4*t*(1-t);P[i*3+2]=a.z+(b.z-a.z)*t}geo.attributes.position.needsUpdate=true}
