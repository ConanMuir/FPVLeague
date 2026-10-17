// ball visuals: mesh, light, ground ring and the ball styles (visual only; the hitbox is always a sphere of radius BR)
import * as THREE from 'three';
import {V3} from '../config/constants.js';
import {BR,onTune} from '../config/tune.js';
import {glow,scene,tex} from './renderer.js';
export const ballMesh=new THREE.Mesh(new THREE.IcosahedronGeometry(BR,2),new THREE.MeshStandardMaterial({color:0xc9d4e6,roughness:.25,metalness:.65,flatShading:true}));ballMesh.castShadow=true;scene.add(ballMesh);
ballMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BR*1.006,1)),new THREE.LineBasicMaterial({color:new THREE.Color(0x9fe8ff).multiplyScalar(2.6),toneMapped:false})));
export const ballLight=new THREE.PointLight(0x9fe8ff,40,26);scene.add(ballLight);
export const ring=new THREE.Mesh(new THREE.RingGeometry(BR*.85,BR*1.05,48),new THREE.MeshBasicMaterial({color:0x9fe8ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));ring.rotation.x=-Math.PI/2;scene.add(ring);

// ball styles (visual only; the hitbox is always a sphere of radius BR)
export const BALLS=[['classic','Classic chrome'],['soccer','Soccer'],['plasma','Plasma core'],['beach','Beach ball']];
// soccer ball = truncated icosahedron drawn per pixel: 12 pentagon + 20 hexagon face normals (w = 1/face distance); the ray hits the face with the largest n.f*w
const SOC=[];{const ph=(1+Math.sqrt(5))/2,add=(x,y,z,d)=>{const v=new V3(x,y,z).normalize();SOC.push(new THREE.Vector4(v.x,v.y,v.z,1/d))};
 for(const a of[-1,1])for(const b of[-1,1]){add(0,a,b*ph,2.32744);add(a,b*ph,0,2.32744);add(b*ph,0,a,2.32744)}
 for(const a of[-1,1])for(const b of[-1,1]){for(const c of[-1,1])add(a,b,c,2.26728);add(0,a/ph,b*ph,2.26728);add(a/ph,b*ph,0,2.26728);add(b*ph,0,a/ph,2.26728)}}
const BSTY={classic:()=>({g:ballMesh.geometry,m:ballMesh.material,kids:[...ballMesh.children],c:0x9fe8ff}),
 soccer:()=>{const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.42,metalness:.05});m.customProgramCacheKey=()=>'soccer';
  m.onBeforeCompile=sh=>{sh.uniforms.uSoc={value:SOC};sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vON;').replace('#include <begin_vertex>','#include <begin_vertex>\nvON=normal;');
   sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vON;uniform vec4 uSoc[32];').replace('#include <color_fragment>',`#include <color_fragment>
   {vec3 n=normalize(vON);float b1=-9.,b2=-9.;int id=0;for(int i=0;i<32;i++){float s=dot(n,uSoc[i].xyz)*uSoc[i].w;if(s>b1){b2=b1;b1=s;id=i;}else if(s>b2)b2=s;}
    diffuseColor.rgb*=(id<12?vec3(.04):vec3(.93))*mix(.3,1.,smoothstep(.002,.009,(b1-b2)/b1));}`)};
  return{g:new THREE.SphereGeometry(BR,64,48),m,c:0xfff4e0}},
 plasma:()=>{const core=new THREE.Mesh(new THREE.IcosahedronGeometry(BR*.42,3),glow(0x3fa8ff,2.6)),cage=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BR*1.01,1)),new THREE.LineBasicMaterial({color:new THREE.Color(0xb48cff).multiplyScalar(2.4),toneMapped:false}));
  return{g:new THREE.IcosahedronGeometry(BR,4),m:new THREE.MeshStandardMaterial({color:0x14224a,roughness:.12,metalness:.3,transparent:true,opacity:.55,emissive:0x2a5cff,emissiveIntensity:.4}),kids:[core,cage],c:0x7aa8ff,
   tick:now=>{core.scale.setScalar(1+.12*Math.sin(now*.008));cage.rotation.set(now*4e-4,now*7e-4,0)}}},
 beach:()=>{const t=tex(512,256,(g,w,h)=>{const C=['#ff4a4a','#ffffff','#2f8cff','#ffffff','#ffd23a','#ffffff'];C.forEach((c,i)=>{g.fillStyle=c;g.fillRect(i*w/6,0,w/6+1,h)});g.fillStyle='#fff';g.fillRect(0,0,w,h*.07);g.fillRect(0,h*.93,w,h*.07)});
  return{g:new THREE.SphereGeometry(BR,48,32),m:new THREE.MeshStandardMaterial({map:t,roughness:.32,metalness:0}),c:0xffd23a}}};
const ballCache={};export let ballId='',ballTick=null;
export function setBall(id){if(!BSTY[id])id='classic';if(!ballCache.classic)ballCache.classic=BSTY.classic();if(id===ballId)return;ballId=id;const b=ballCache[id]||(ballCache[id]=BSTY[id]());
 ballMesh.clear();ballMesh.geometry=b.g;ballMesh.material=b.m;(b.kids||[]).forEach(k=>ballMesh.add(k));ballTick=b.tick||null;ballLight.color.set(b.c);ring.material.color.set(b.c)}
onTune(()=>{ballMesh.scale.setScalar(BR/2.6);ring.scale.setScalar(BR/2.6)});  // was part of applyTune()
