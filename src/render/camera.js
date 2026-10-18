// ---------- camera ----------
import {GD,H,HL,HW,L,QT,V3,W,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {DRAD,SHK} from '../config/tune.js';
import {nearestFoe} from '../modes/dogfight.js';
import {ball} from '../physics/ball.js';
import {camera,sun} from './renderer.js';
import {_f,_ip,_t,_x} from '../scratch.js';
import {GS} from '../state.js';
import {DCEIL,DHL,DHW,dfAtmos,dfH,dfHt} from '../world/highlands.js';
import {sdf} from '../physics/sdf.js';
import {LOOKS} from '../world/maps.js';
const camPos=new V3(0,20,60),camFwd=new V3(0,0,-1),tiltQ=new QT(),_cp=new V3();let curFov=0,bfov=0;  // bfov: boost FOV stretch
function setFov(h,horizontal=true){const v=horizontal?2*Math.atan(Math.tan(h*Math.PI/360)/camera.aspect)*180/Math.PI:h;if(Math.abs(v-curFov)>.05){curFov=camera.fov=v;camera.updateProjectionMatrix()}}
export function updateCam(dt,now){const me=GS.player;bfov+=((me?.boostOn?14:0)-bfov)*Math.min(1,dt*(me?.boostOn?10:4));
 if(GS.menuOpen&&GS.demo&&GS.OBSON||!me&&GS.OBSON){const t=now*3e-5;camPos.set(Math.sin(t)*300,150+Math.sin(t*1.7)*25,Math.cos(t)*400);camera.position.copy(camPos);camera.lookAt(0,20,0);setFov(55,false);return}
 if(GS.menuOpen&&GS.demo||!me){const t=now*4e-5;camPos.set(Math.sin(t)*W*.85,45+Math.sin(t*1.7)*10,Math.cos(t)*L*.75);camera.position.copy(camPos);camera.lookAt(ball.p.x*.5,6,ball.p.z*.5);setFov(55,false);return}
 const fpv=GS.camMode===0&&me.dead<=0;me.mesh.visible=!fpv&&me.dead<=0;me.mark.visible=!fpv;
 if(fpv){camera.position.copy(me.p).add(_cp.set(0,.25,-.38).multiplyScalar(DRAD/.6).applyQuaternion(me.q));tiltQ.setFromAxisAngle(_x.set(1,0,0),S.tilt*Math.PI/180);camera.quaternion.copy(me.q).multiply(tiltQ);setFov(S.fov+bfov)}
 else{const f=_f.set(0,0,-1).applyQuaternion(me.q);f.y=0;if(f.lengthSq()<.05)f.copy(me.v).setY(0);if(f.lengthSq()<.01)f.copy(camFwd);f.normalize();
  const foc=GS.OBSON?nearestFoe(me)?.p||_ip.set(0,10,0):ball.p;if(GS.camMode===2||me.dead>0)f.subVectors(foc,me.p).setY(0).normalize();if(f.lengthSq()<.5)f.copy(camFwd);camFwd.lerp(f,1-Math.exp(-dt*5)).normalize();
  const ck=1+.35*(DRAD/.6-1);_cp.copy(me.p).addScaledVector(camFwd,-10*ck).add(_t.set(0,3.6*ck,0));  // chase cam backs off for a bigger quad
if(GS.OBSON){_cp.x=cl(_cp.x,-DHW+1,DHW-1);_cp.z=cl(_cp.z,-DHL+1,DHL-1);if(me.p.y<dfHt(me.p.x,me.p.z)){let k=1;for(let i=1;i<=10;i++){const t=i/10;if(sdf(me.p.x+(_cp.x-me.p.x)*t,me.p.y+(_cp.y-me.p.y)*t,me.p.z+(_cp.z-me.p.z)*t)>-1.5){k=(i-1)/10;break}}_cp.lerpVectors(me.p,_cp,k)}else _cp.y=cl(_cp.y,dfHt(_cp.x,_cp.z)+1.5,DCEIL-1)}  // underground: stay inside the cave, between the quad and the wallelse{_cp.x=cl(_cp.x,-HW+1,HW-1);_cp.y=cl(_cp.y,.8,H-1);_cp.z=cl(_cp.z,-HL-GD+1,HL+GD-1)}
  camPos.lerp(_cp,1-Math.exp(-dt*9));camera.position.copy(camPos);camera.lookAt(GS.camMode===2||me.dead>0?foc:_t.copy(me.p).addScaledVector(camFwd,8).setY(me.p.y+1));setFov(100+bfov)}
 if(GS.OBSON){sun.target.position.set(camera.position.x,0,camera.position.z);sun.position.copy(sun.target.position).add(LOOKS.df.sp);dfAtmos(camera,dt)}  // dfAtmos: fog closes in underground
 if(GS.shake>.01){camera.position.add(_t.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(GS.shake*.7*SHK));GS.shake*=Math.exp(-dt*4)}}
