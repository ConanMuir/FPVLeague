// ---------- drones: meshes ----------
import * as THREE from 'three';
import {COL} from '../config/constants.js';
import {DRAD,onTune} from '../config/tune.js';
import {glow,scene,tex} from './renderer.js';
import {GS} from '../state.js';
const GEO={body:new THREE.BoxGeometry(.6,.22,1.1),canopy:new THREE.BoxGeometry(.46,.22,.62),arm:new THREE.BoxGeometry(2.5,.07,.16),motor:new THREE.CylinderGeometry(.14,.16,.18,12),
 prop:new THREE.CylinderGeometry(.56,.56,.015,24),blade:new THREE.BoxGeometry(1.05,.03,.09),led:new THREE.BoxGeometry(.5,.06,.06),cam:new THREE.BoxGeometry(.26,.24,.2),lens:new THREE.SphereGeometry(.09,12,8)};
export const MAT={carbon:new THREE.MeshStandardMaterial({color:0x16191f,roughness:.45,metalness:.7}),metal:new THREE.MeshStandardMaterial({color:0x8a919c,roughness:.3,metalness:.9}),
 prop:new THREE.MeshBasicMaterial({color:0xaab4c8,transparent:true,opacity:.14,depthWrite:false}),lens:new THREE.MeshStandardMaterial({color:0x050505,roughness:.05,metalness:1}),
 team:COL.map(c=>new THREE.MeshStandardMaterial({color:c,metalness:.4,roughness:.35,emissive:c,emissiveIntensity:.3})),led:COL.map(c=>glow(c,4)),
 blade:COL.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.5,transparent:true,opacity:.55}))};
const markTex=tex(64,64,g=>{g.strokeStyle='#fff';g.lineWidth=7;g.beginPath();g.arc(32,32,22,0,7);g.stroke();g.fillStyle='#fff';g.beginPath();g.arc(32,32,8,0,7);g.fill()});
export const TN=28;  // trail points
onTune(T=>GS.drones.forEach(d=>d.mesh.scale.setScalar(.68*T.size)));  // was part of applyTune()
// the quad's mesh (frame, props, LEDs, camera), its FPV marker sprite and its speed trail
export function buildDrone(d){const g=d.mesh=new THREE.Group(),t=d.team;
  const add=(geo,mat,x,y,z,ry=0,par=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=true;par.add(m);return m};
  add(GEO.body,MAT.carbon,0,0,0);add(GEO.canopy,MAT.team[t],0,.2,.12);add(GEO.arm,MAT.carbon,0,0,0,Math.PI/4);add(GEO.arm,MAT.carbon,0,0,0,-Math.PI/4);
  d.props=[];for(const[x,z]of[[.88,.88],[-.88,.88],[.88,-.88],[-.88,-.88]]){add(GEO.motor,MAT.metal,x,.1,z);const pr=add(GEO.prop,MAT.prop,x,.22,z);pr.castShadow=false;add(GEO.blade,MAT.blade[t],0,0,0,0,pr);d.props.push(pr)}
  add(GEO.led,MAT.led[t],0,.02,.58);add(GEO.cam,MAT.carbon,0,.08,-.62);add(GEO.lens,MAT.lens,0,.08,-.74);
  const sp=d.mark=new THREE.Sprite(new THREE.SpriteMaterial({map:markTex,color:new THREE.Color(COL[t]).multiplyScalar(1.6),depthTest:false,sizeAttenuation:false,toneMapped:false}));sp.scale.set(.022,.022,1);sp.position.y=1.8;sp.renderOrder=5;g.add(sp);
  g.scale.setScalar(.68*DRAD/.8);scene.add(g);d.tp=new Float32Array(TN*3);const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(d.tp,3));
  d.trail=new THREE.Line(tg,new THREE.LineBasicMaterial({color:new THREE.Color(COL[t]).multiplyScalar(2.2),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));d.trail.frustumCulled=false;scene.add(d.trail)}
