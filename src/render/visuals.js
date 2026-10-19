// ---------- visuals ----------
import {AC,audioTick,mo} from '../audio/audio.js';
import {cl} from '../config/constants.js';
import {BR,DRAD} from '../config/tune.js';
import {dfDraw} from '../modes/guns.js';
import {ball} from '../physics/ball.js';
import {ballLight,ballMesh,ballTick,ring} from './ball.js';
import {TN} from './drone-mesh.js';
import {updParts} from './particles.js';
import {camera} from './renderer.js';
import {_q,_t} from '../scratch.js';
import {GS,SB} from '../state.js';
import {mapG,mapId,snowP} from '../world/maps.js';
import {arenaTick} from '../world/arena.js';
import {popTick} from './popfx.js';
import {gameFx} from './effects.js';
import {ORBS,orbOff,orbOn} from '../world/orbs.js';
export function visuals(dt,now){for(const d of GS.drones){
  if(d.remote&&d.net){const k=1-Math.exp(-dt*18),age=Math.min((now-d.net.at)/1000,.25);d.p.lerp(_t.copy(d.net.p).addScaledVector(d.net.v,age),k);d.q.slerp(d.net.q,k);d.v.copy(d.net.v);d.mesh.visible=d.dead<=0}
  d.mesh.position.copy(d.p);d.mesh.quaternion.copy(d.q);d.mesh.scale.setScalar(.68*DRAD/.8*(GS.OBSON&&GS.player&&d.team!==GS.player.team?1.6:1));const sp=(d.dead>0?0:25+d.thr*90)*dt;d.props.forEach((p,i)=>p.rotation.y+=i%3?sp:-sp);
  if(d.dead<=0){d.tp.copyWithin(3,0,(TN-1)*3);d.p.toArray(d.tp,0);d.trail.geometry.attributes.position.needsUpdate=true}
  d.trail.material.opacity=d.dead>0?0:cl((d.v.length()-45)/20,0,.85);}
 gameFx(dt,now);  // boost flames/trails, motor glow, prop-wash dust, ground sparks + scuffs, ball trail + hit flashes (render/effects.js)
 ballMesh.position.copy(ball.p);ballMesh.quaternion.copy(ball.q);  // the ball really spins now (physics/ball.js)
 ballLight.position.copy(ball.p);ballLight.intensity=ballMesh.visible?40:0;ring.position.set(ball.p.x,.04,ball.p.z);ring.material.opacity=ballMesh.visible?cl(1-ball.p.y/30,.08,.9):0;
 for(const o of ORBS){const on=o.cd<=0;o.g.visible=SB();if(o.beam)o.beam.visible=SB()&&!GS.OBSON;o.core.material=on?orbOn:orbOff;o.halo.visible=on;o.g.scale.setScalar(on?1:.35+.35*(1-o.cd/(o.big?10:4)));o.g.position.y=o.p.y+Math.sin(now*.002+o.p.x+o.p.z)*.35;o.core.rotation.y=now*.002;if(o.wire){o.wire.visible=on;o.wire.rotation.set(now*7e-4,now*1e-3,0)}}
 ballTick?.(now);arenaTick(dt);popTick(dt);const og=mapG[mapId];if(og)og.userData.clouds.rotation.y+=dt*.004;
 // snow lives in world space (so you fly through it) and wraps inside a 160 m box around the camera
 if(snowP.visible){const a=snowP.geometry.attributes.position,A=a.array,t=now*.001,c=camera.position,wr=(v,o)=>o+((v-o+80)%160+160)%160-80;
  for(let i=0;i<A.length;i+=3){A[i+1]-=dt*(3+(i%7));A[i]+=Math.sin(t+i)*dt*.6;A[i]=wr(A[i],c.x);A[i+1]=wr(A[i+1],c.y);A[i+2]=wr(A[i+2],c.z)}a.needsUpdate=true}
 dfDraw(now);updParts(dt);
 if(AC&&mo.length)audioTick(dt)}
