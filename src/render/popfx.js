// pop ring: a faint white circle between the top of the quad and the ball, shown briefly when a pop is earned (modes/step.js)
import * as THREE from 'three';
import {scene} from './renderer.js';
const ring=new THREE.Mesh(new THREE.RingGeometry(.86,1,64),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
ring.visible=false;ring.renderOrder=3;scene.add(ring);
const Z=new THREE.Vector3(0,0,1),D=.4;let t=0;
export function popFx(p,n,r){ring.position.copy(p);ring.quaternion.setFromUnitVectors(Z,n);ring.scale.setScalar(r);t=D;ring.visible=true}
export function popTick(dt){if(t<=0)return;t-=dt;ring.material.opacity=.55*Math.max(0,t/D);ring.scale.multiplyScalar(1+dt*.7);if(t<=0)ring.visible=false}
