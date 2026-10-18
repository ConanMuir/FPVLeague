// boost orbs: fly through them to fill the meter; the top of the throttle stick burns it as super boost
import * as THREE from 'three';
import {HL,HW,V3} from '../config/constants.js';
import {dot} from '../render/particles.js';
import {fatLines,glow,scene} from '../render/renderer.js';
export const ORBS=[],orbGeoS=new THREE.IcosahedronGeometry(.75,4),orbGeoB=new THREE.IcosahedronGeometry(1.25,4),orbWireG=new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.1,1));
export const orbOn=glow(0xffc640,1.8),orbOff=new THREE.MeshBasicMaterial({color:0x6a4a14,transparent:true,opacity:.5}),orbHalo=new THREE.SpriteMaterial({map:dot,color:new THREE.Color(0xffb22a).multiplyScalar(.7),blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),
 orbWireC=new THREE.Color(0xffd36a).multiplyScalar(1.3),orbBeam=new THREE.MeshBasicMaterial({color:new THREE.Color(0xffb22a).multiplyScalar(1.4),transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
const ORBP=[];for(const[fx,y,fz,b]of[[.84,7,.84,1],[.89,14,0,1],[0,22,.5,1],[0,5,.28],[.4,8,.13],[.6,5,.42],[.72,18,.24],[0,26,.46],[.3,30,0],[.8,10,.6],[.36,12,.78]])
 for(const sx of fx?[-1,1]:[1])for(const sz of fz?[-1,1]:[1])ORBP.push([sx*fx*HW,y,sz*fz*HL,b]);
for(const[x,y,z,b]of ORBP){
 let beam=null;const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);const core=new THREE.Mesh(b?orbGeoB:orbGeoS,orbOn),halo=new THREE.Sprite(orbHalo);halo.scale.setScalar(b?5:3);g.add(core,halo);let wire=null;
 if(b){wire=fatLines(orbWireG.attributes.position.array,.06,{color:orbWireC,px:1});g.add(wire);beam=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,y,6,1,true),orbBeam);beam.position.set(x,y/2,z);scene.add(beam)}
 ORBS.push({p:new V3(x,y,z),big:!!b,cd:0,g,core,halo,wire,beam})}
