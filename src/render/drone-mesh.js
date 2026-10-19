// ---------- drones: meshes ----------
import * as THREE from 'three';
import {COL} from '../config/constants.js';
import {DRAD,onTune} from '../config/tune.js';
import {glow,scene,tex} from './renderer.js';
import {GS} from '../state.js';
import {buildPartsMesh} from '../parts/mesh.js';
import {cosMats,cosTrail,paintTrail} from './cos-mat.js';
export const MAT={carbon:new THREE.MeshStandardMaterial({color:0x16191f,roughness:.45,metalness:.7}),metal:new THREE.MeshStandardMaterial({color:0x8a919c,roughness:.3,metalness:.9}),
 prop:new THREE.MeshBasicMaterial({color:0xaab4c8,transparent:true,opacity:.14,depthWrite:false}),lens:new THREE.MeshStandardMaterial({color:0x050505,roughness:.05,metalness:1}),
 team:COL.map(c=>new THREE.MeshStandardMaterial({color:c,metalness:.4,roughness:.35,emissive:c,emissiveIntensity:.3})),led:COL.map(c=>glow(c,2)),
 blade:COL.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.5,transparent:true,opacity:.55})),
 // drone parts (src/parts/mesh.js): battery wraps, labels, bumpers, flight-controller boards
 pack:new THREE.MeshStandardMaterial({color:0x23262d,roughness:.55,metalness:.15}),packLR:new THREE.MeshStandardMaterial({color:0x1d5a6e,roughness:.45,metalness:.2}),
 label:new THREE.MeshStandardMaterial({color:0xffc640,roughness:.5,metalness:.1}),copper:new THREE.MeshStandardMaterial({color:0xb8642e,roughness:.35,metalness:.85}),chip:new THREE.MeshStandardMaterial({color:0x0e0f12,roughness:.4,metalness:.2}),rubber:new THREE.MeshStandardMaterial({color:0x0c0d10,roughness:.9}),board:new THREE.MeshStandardMaterial({color:0x1f3a2a,roughness:.6,metalness:.3})};
// carbon fibre: a 2x2 twill weave drawn per pixel from the object-space position (triplanar), faded out where it would alias
MAT.carbon.customProgramCacheKey=()=>'weave';
MAT.carbon.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vWN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=position;vWN=normal;');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vWN;float twill(vec2 p){vec2 c=floor(p);float d=mod(c.x+c.y,4.);vec2 f=fract(p);return d<2.?.55+.45*sin(f.x*3.1416):.55+.45*sin(f.y*3.1416);}').replace('#include <color_fragment>',`#include <color_fragment>
 {vec3 p=vWP*110.,w=abs(normalize(vWN));w/=w.x+w.y+w.z;float t=twill(p.yz)*w.x+twill(p.xz)*w.y+twill(p.xy)*w.z;float fw=fwidth(p.x)+fwidth(p.y)+fwidth(p.z);
  diffuseColor.rgb*=mix(1.,.55+.95*t,1.-smoothstep(.4,1.2,fw));}`)};
const markTex=tex(64,64,g=>{g.strokeStyle='#fff';g.lineWidth=7;g.beginPath();g.arc(32,32,22,0,7);g.stroke();g.fillStyle='#fff';g.beginPath();g.arc(32,32,8,0,7);g.fill()});
export const TN=28;  // trail points
onTune(T=>GS.drones.forEach(d=>d.mesh.scale.setScalar(.68*T.size)));  // was part of applyTune()
// the quad's mesh (parts from its loadout d.lo, see src/parts), its FPV marker sprite and its speed trail
export const PARTS_SCALE=1/.51;  // parts are built in metres at size 1; the outer group carries .68*size (visuals), so .68*.75 = .51 -> 1
function partsGroup(d){const{group,props}=buildPartsMesh(d.lo.meshSpec,d.team,cosMats(MAT,d.cos,d.team,d.lo.meshSpec));group.scale.setScalar(PARTS_SCALE);d.props=props;return group}
export function buildDrone(d){const g=d.mesh=new THREE.Group(),t=d.team;g.add(d.body=partsGroup(d));
  const sp=d.mark=new THREE.Sprite(new THREE.SpriteMaterial({map:markTex,color:new THREE.Color(COL[t]).multiplyScalar(1.3),depthTest:false,sizeAttenuation:false,toneMapped:false}));sp.scale.set(.022,.022,1);sp.position.y=1.8;sp.renderOrder=5;g.add(sp);
  g.scale.setScalar(.68*DRAD/.8);scene.add(g);d.tp=new Float32Array(TN*3);const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(d.tp,3));tg.setAttribute('color',new THREE.BufferAttribute(new Float32Array(TN*3),3));
  d.trail=new THREE.Line(tg,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));d.trail.frustumCulled=false;scene.add(d.trail);cosTrail(d);paintTrail(d,TN)}  // trail colours from the cosmetics (render/cos-mat.js)
// new loadout: swap the parts group, keep the marker, trail and transform (geometry is cached and shared, so nothing to dispose)
export function rebuildDrone(d){if(!d.mesh)return;d.mesh.remove(d.body);d.mesh.add(d.body=partsGroup(d));cosTrail(d);paintTrail(d,TN)}  // also new cosmetics
