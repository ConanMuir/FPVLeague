// Drone League renderer setup: night stadium background and fog, sky + sun lights (setMap() restyles them per map)
import * as THREE from 'three';
import {initRender,scene} from '../../engine/render.js';
initRender({far:1800,bl:[.75,.45,.82],exposure:1.05});
scene.background=new THREE.Color(0x04060c);scene.fog=new THREE.Fog(0x04060c,300,900);
export const hemi=new THREE.HemisphereLight(0x8fb4ff,0x0a0c14,.7);scene.add(hemi);
export const sun=new THREE.DirectionalLight(0xfff4e8,2.4);sun.position.set(30,90,20);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);
Object.assign(sun.shadow.camera,{left:-62,right:62,top:95,bottom:-95,near:10,far:240});sun.shadow.bias=-.0004;scene.add(sun);
