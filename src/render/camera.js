// ---------- camera ----------
import {Matrix4 as M4} from 'three';
import {GD,H,HL,HW,L,QT,V3,W,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {btnOn,keys,pad} from '../input/input.js';
import {LL} from '../modes/longline.js';
import {DRAD,SHK} from '../config/tune.js';
import {nearestFoe} from '../modes/dogfight.js';
import {ball} from '../physics/ball.js';
import {camera,sun} from './renderer.js';
import {_f,_ip,_t,_x} from '../scratch.js';
import {GS} from '../state.js';
import {DCEIL,DHL,DHW,dfAtmos,dfH,dfHt,dfLod} from '../world/highlands.js';
import {sdN,sdf} from '../physics/sdf.js';
import {LOOKS} from '../world/maps.js';
const camPos=new V3(0,20,60),camFwd=new V3(0,0,-1),tiltQ=new QT(),_cp=new V3(),_cn=new V3();let curFov=0,bfov=0,lookK=0,slK=0,slPos=null,chaseOn=false;const _ld=new V3(),_lq=new QT(),_lm=new M4();  // bfov: boost FOV stretch
/* the League chase and ball cams seat the camera 10 m behind the quad, clamped to the arena's box. The arena is rounded (plan corners RC,
   floor / ceiling fillets RF) and its end walls stand at HL outside the goal mouth, so along an end wall or into a corner that seat was
   inside the wall (up to 3 m, the ball cam with the quad by the backboard: the view through the stand). Push the seat, and the smoothed
   position after it, out along the surface normal to a metre of free space */
function arenaFree(p){for(let i=0;i<2;i++){const s=sdf(p.x,p.y,p.z);if(s<=-1)return;sdN(p,_cn);p.addScaledVector(_cn,-(s+1))}}
/* chaseOn: the chase / ball cam drew the last frame. Off (FPV, the menu orbit, a replay), camPos goes stale, and the next chase frame used to
   start the smoothing from there: a switch to the chase cam swooped in from the menu orbit's seat in the stands, 120 m away, through the
   stand for a frame or two. It now snaps to the chase position, as it does after a teleport (a respawn, a map switch: > 40 m away) */
function setFov(h,horizontal=true){const v=horizontal?2*Math.atan(Math.tan(h*Math.PI/360)/camera.aspect)*180/Math.PI:h;if(Math.abs(v-curFov)>.05){curFov=camera.fov=v;camera.updateProjectionMatrix()}}
// FPV camera angle: the fixed "Camera uptilt", or live from a stick/knob/slider axis ("Camera tilt axis") mapped from its -1..1 travel
// onto "Tilt at axis min".."Tilt at axis max" (swap the two to reverse it), lightly smoothed against axis jitter
let tiltNow=null;export function camTilt(dt=0){if(S.tiltAx<0)return tiltNow=S.tilt;const v=pad()?.axes?.[S.tiltAx];if(v==null)return tiltNow??S.tilt;
 const t=S.tiltMin+(S.tiltMax-S.tiltMin)*(Math.max(-1,Math.min(1,v))+1)/2;tiltNow=tiltNow==null?t:tiltNow+(t-tiltNow)*Math.min(1,dt*20);return tiltNow}
// CAM.fn: a replay camera (render/replay.js) that takes over while a goal replay or kill cam plays: fn(camera, dt, setFov)
export const CAM={fn:null};
export function updateCam(dt,now){const me=GS.player;bfov+=((me?.boostOn?14:0)-bfov)*Math.min(1,dt*(me?.boostOn?10:4));
 if(CAM.fn){chaseOn=false;CAM.fn(camera,dt,setFov);camEnd(dt);return}
 if(GS.menuOpen&&GS.demo&&GS.OBSON||!me&&GS.OBSON){chaseOn=false;const t=now*3e-5;camPos.set(Math.sin(t)*300,150+Math.sin(t*1.7)*25,Math.cos(t)*400);camera.position.copy(camPos);camera.lookAt(0,20,0);setFov(55,false);return}
 if(!me&&GS.spect&&!GS.OBSON){chaseOn=false;tvCam(dt);camEnd(dt);return}
 if(GS.menuOpen&&GS.demo||!me){chaseOn=false;const t=now*4e-5;camPos.set(Math.sin(t)*W*.85,45+Math.sin(t*1.7)*10,Math.cos(t)*L*.75);camera.position.copy(camPos);camera.lookAt(ball.p.x*.5,6,ball.p.z*.5);setFov(55,false);return}
 const fpv=GS.camMode===0&&me.dead<=0;me.mesh.visible=!fpv&&me.dead<=0;me.mark.visible=!fpv;
 if(fpv){chaseOn=false;camera.position.copy(me.p).add(_cp.set(0,.25,-.38).multiplyScalar(DRAD/.6).applyQuaternion(me.q));tiltQ.setFromAxisAngle(_x.set(1,0,0),camTilt(dt)*Math.PI/180);camera.quaternion.copy(me.q).multiply(tiltQ);
  const look=!!(keys.KeyG||btnOn(pad(),S.lookBtn)),sl=!look&&S.longline&&LL.d===me&&S.llCam==='sling';lookK+=((look?1:0)-lookK)*Math.min(1,dt*8);slK+=((sl?1:0)-slK)*Math.min(1,dt*(sl?3:5));
  const f=_f.set(0,0,-1).applyQuaternion(me.q).setY(0);if(f.lengthSq()<.05)f.copy(me.v).setY(0);if(f.lengthSq()<.01)f.copy(camFwd);camFwd.lerp(f.normalize(),1-Math.exp(-dt*4)).normalize();
  if(lookK>.01){_ld.copy(camera.position).y-=1;_lm.lookAt(camera.position,_ld,camFwd);_lq.setFromRotationMatrix(_lm);camera.quaternion.slerp(_lq,lookK*lookK*(3-2*lookK))}  // look-down: swing the lens straight down at the line, heading at the top of the screen
  if(slK>.01){const span=me.p.distanceTo(ball.p);_ld.lerpVectors(me.p,ball.p,.3);_cp.copy(me.p).addScaledVector(camFwd,-(span*.55+5)).add(_t.set(0,1.5+span*.05,0));  // sling cam: just behind and above the drone, aimed between drone and ball so drone, cable and ball all fit
   _cp.x=cl(_cp.x,-HW+1,HW-1);_cp.y=cl(_cp.y,.8,H-1);_cp.z=cl(_cp.z,-HL-GD+1,HL+GD-1);arenaFree(_cp);slPos=slPos?slPos.lerp(_cp,1-Math.exp(-dt*6)):_cp.clone();arenaFree(slPos);  /* the sling seat too: behind the quad along an end wall it sat 2 m inside the wall */
   _lm.lookAt(slPos,_ld,_t.set(0,1,0));_lq.setFromRotationMatrix(_lm);const k=slK*slK*(3-2*slK);camera.position.lerp(slPos,k);camera.quaternion.slerp(_lq,k);setFov(S.fov+(100-S.fov)*k+bfov)}else{slPos=null;setFov(S.fov+bfov)}
  GS.llView=slK>.5;me.mesh.visible=me.mark.visible=GS.llView}
 else{GS.llView=false;lookK=slK=0;slPos=null;const f=_f.set(0,0,-1).applyQuaternion(me.q);f.y=0;if(f.lengthSq()<.05)f.copy(me.v).setY(0);if(f.lengthSq()<.01)f.copy(camFwd);f.normalize();
  const foc=GS.OBSON?nearestFoe(me)?.p||_ip.set(0,10,0):ball.p;if(GS.camMode===2||me.dead>0)f.subVectors(foc,me.p).setY(0).normalize();if(f.lengthSq()<.5)f.copy(camFwd);camFwd.lerp(f,1-Math.exp(-dt*5)).normalize();
  const ck=1+.35*(DRAD/.6-1);_cp.copy(me.p).addScaledVector(camFwd,-10*ck).add(_t.set(0,3.6*ck,0));  // chase cam backs off for a bigger quad
if(GS.OBSON){_cp.x=cl(_cp.x,-DHW+1,DHW-1);_cp.z=cl(_cp.z,-DHL+1,DHL-1);if(me.p.y<dfHt(me.p.x,me.p.z)){let k=1;for(let i=1;i<=10;i++){const t=i/10;if(sdf(me.p.x+(_cp.x-me.p.x)*t,me.p.y+(_cp.y-me.p.y)*t,me.p.z+(_cp.z-me.p.z)*t)>-1.5){k=(i-1)/10;break}}_cp.lerpVectors(me.p,_cp,k)}else _cp.y=cl(_cp.y,dfHt(_cp.x,_cp.z)+1.5,DCEIL-1)}else{_cp.x=cl(_cp.x,-HW+1,HW-1);_cp.y=cl(_cp.y,.8,H-1);_cp.z=cl(_cp.z,-HL-GD+1,HL+GD-1);arenaFree(_cp)}  // underground: stay inside the cave, between the quad and the wall
  if(!chaseOn||camPos.distanceToSquared(_cp)>1600)camPos.copy(_cp);chaseOn=true;  /* a cut, not a swoop: into the chase cam, and after a teleport */
  camPos.lerp(_cp,1-Math.exp(-dt*9));
  // the smoothed position lags the clamped target and can cut through rock (a steep shaft or ramp, a tight turn): clamp it the same way
  if(GS.OBSON){if(me.p.y<dfHt(me.p.x,me.p.z)){let k=1;for(let i=1;i<=12;i++){const t=i/12;if(sdf(me.p.x+(camPos.x-me.p.x)*t,me.p.y+(camPos.y-me.p.y)*t,me.p.z+(camPos.z-me.p.z)*t)>-1){k=(i-1)/12;break}}if(k<1)camPos.lerpVectors(me.p,camPos,k)}
   else camPos.y=Math.max(camPos.y,dfHt(camPos.x,camPos.z)+1.5)}
  else arenaFree(camPos);
  camera.position.copy(camPos);camera.lookAt(GS.camMode===2||me.dead>0?foc:_t.copy(me.p).addScaledVector(camFwd,8).setY(me.p.y+1));setFov(100+bfov)}
 camEnd(dt)}
// spectating (GS.spect, a tournament's bot match): a broadcast seat high over the side line that slides along with the ball and tracks it
const _tv=new V3();
function tvCam(dt){const b=ball.p;_cp.set(HW*1.2,34+b.y*.25,b.z*.5);camPos.lerp(_cp,1-Math.exp(-dt*2));_tv.lerp(_t.set(b.x*.85,b.y*.7+3,b.z*.85),1-Math.exp(-dt*5));camera.position.copy(camPos);camera.lookAt(_tv);setFov(62,false)}
// every camera but the menu orbits: the Highlands sun, fog and tree LOD follow it, then the shake
function camEnd(dt){if(GS.OBSON){sun.target.position.set(camera.position.x,0,camera.position.z);sun.position.copy(sun.target.position).add(LOOKS.df.sp);dfAtmos(camera,dt);dfLod(camera)}  // dfAtmos: fog closes in underground; dfLod: far forests draw low-detail trees
 if(GS.shake>.01){camera.position.add(_t.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(GS.shake*.7*SHK));GS.shake*=Math.exp(-dt*4)}}
