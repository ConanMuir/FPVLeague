import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
// ---------- renderer ----------
export const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.domElement.id='gl';document.body.prepend(renderer.domElement);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
export const scene=new THREE.Scene();scene.background=new THREE.Color(0x04060c);scene.fog=new THREE.Fog(0x04060c,300,900);
export const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.08,1800);
export const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
export const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.75,.45,.82);composer.addPass(bloom);composer.addPass(new OutputPass());
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});

export const hemi=new THREE.HemisphereLight(0x8fb4ff,0x0a0c14,.7);scene.add(hemi);
export const sun=new THREE.DirectionalLight(0xfff4e8,2.4);sun.position.set(30,90,20);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);
Object.assign(sun.shadow.camera,{left:-62,right:62,top:95,bottom:-95,near:10,far:240});sun.shadow.bias=-.0004;scene.add(sun);

export function tex(w,h,draw,rep){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
export const glow=(hex,k=3)=>new THREE.MeshBasicMaterial({color:new THREE.Color(hex).multiplyScalar(k),toneMapped:false});
export function scaleUV(g,sx,sy){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*sx,uv.getY(i)*sy);return g}
