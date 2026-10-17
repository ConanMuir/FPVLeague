// Renderer: Three.js with an UnrealBloom glow pass and ACES tone mapping, canvas textures, sky domes and the FPV camera
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {V3,QT} from './util.js';
import {S} from './settings.js';
export let renderer,scene,camera,composer,bloom;
// far: camera far plane; bl: bloom [strength, radius, threshold]; onResize runs after the renderer resizes (now: also once at start)
export function initRender({far,bl,exposure,onResize,now}){
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.domElement.id='gl';document.body.prepend(renderer.domElement);
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.08,far);
 composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
 bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),...bl);composer.addPass(bloom);composer.addPass(new OutputPass());
 const rs=()=>{renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();onResize?.()};
 addEventListener('resize',rs);if(now)rs()}
export function tex(w,h,draw,rep){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
export const glow=(hex,k=3)=>new THREE.MeshBasicMaterial({color:new THREE.Color(hex).multiplyScalar(k),toneMapped:false});
export function scaleUV(g,sx,sy){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*sx,uv.getY(i)*sy);return g}
export const dot=tex(64,64,(g)=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'#fff');r.addColorStop(.4,'rgba(255,255,255,.6)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64)});
// equirectangular sky: 6-stop gradient (zenith to ground) with a sun glow at c.sun
export function skyTex(c){const d=new V3(...c.sun).normalize(),t=tex(1024,512,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);[0,.3,.46,.5,.53,1].forEach((s,i)=>gr.addColorStop(s,c.sky[i]));g.fillStyle=gr;g.fillRect(0,0,w,h);
 const u=(Math.atan2(d.z,d.x)/(2*Math.PI)+.5)*w,v=(.5-Math.asin(d.y)/Math.PI)*h,r=g.createRadialGradient(u,v,0,u,v,h*.4);r.addColorStop(0,'rgba(255,248,225,.9)');r.addColorStop(.12,'rgba(255,240,205,.4)');r.addColorStop(1,'rgba(255,240,205,0)');g.fillStyle=r;g.fillRect(0,0,w,h)});
 t.mapping=THREE.EquirectangularReflectionMapping;return t}
// camera: field of view set horizontally (like a real FPV lens) unless horizontal=false
let curFov=0;const tiltQ=new QT(),_cp=new V3(),_x=new V3();
export function setFov(h,horizontal=true){const v=horizontal?2*Math.atan(Math.tan(h*Math.PI/360)/camera.aspect)*180/Math.PI:h;if(Math.abs(v-curFov)>.05){curFov=camera.fov=v;camera.updateProjectionMatrix()}}
// FPV camera on the quad's nose, tilted up by the camera uptilt; extra = FOV stretch (super boost)
export function fpvCam(me,extra=0){camera.position.copy(me.p).add(_cp.set(0,.25,-.38).applyQuaternion(me.q));tiltQ.setFromAxisAngle(_x.set(1,0,0),S.tilt*Math.PI/180);camera.quaternion.copy(me.q).multiply(tiltQ);setFov(S.fov+extra)}
