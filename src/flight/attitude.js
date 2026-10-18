// ---------- attitude controller (shared by bots + Angle mode) ----------
import * as THREE from 'three';
import {QT} from '../config/constants.js';
import {_q,_x,_z} from '../scratch.js';
const _m=new THREE.Matrix4(),_qd=new QT();
export function attitude(d,up,fwd,k,maxR,yawW){const z=_z.copy(fwd).addScaledVector(up,-fwd.dot(up));if(z.lengthSq()<1e-4)z.set(0,0,-1).applyQuaternion(d.q).addScaledVector(up,-.99);
 z.normalize().negate();_x.crossVectors(up,z);_m.makeBasis(_x,up,z);_qd.setFromRotationMatrix(_m);const e=_q.copy(d.q).invert().multiply(_qd);if(e.w<0){e.x=-e.x;e.y=-e.y;e.z=-e.z;e.w=-e.w}
 const s=Math.sqrt(Math.max(0,1-e.w*e.w));if(s<1e-5){d.wt.set(0,0,0);return}const a=2*Math.atan2(s,e.w);d.wt.set(e.x/s,e.y/s*yawW,e.z/s).multiplyScalar(Math.min(a*k,maxR))}
