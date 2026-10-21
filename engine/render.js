// Renderer: Three.js with an UnrealBloom glow pass and ACES tone mapping, canvas textures, the FPV field of view and surface detail
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {V3,vnoise,hash2,sm} from './util.js';
export let renderer,scene,camera,composer,bloom;
// far/near: camera planes; logDepth: logarithmic depth buffer (big worlds); bl: bloom [strength, radius, threshold]; onResize runs after the renderer resizes (now: also once at start). Returns the resize function
export function initRender({far,near=.08,logDepth=false,bl,exposure,onResize,now}){
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',...(logDepth?{logarithmicDepthBuffer:true}:{})});
 renderer.domElement.id='gl';document.body.prepend(renderer.domElement);
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,near,far);
 composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
 bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),...bl);composer.addPass(bloom);composer.addPass(new OutputPass());
 const rs=()=>{renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();onResize?.()};
 addEventListener('resize',rs);if(now)rs();return rs}
export function tex(w,h,draw,rep){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
export const glow=(hex,k=3)=>new THREE.MeshBasicMaterial({color:new THREE.Color(hex).multiplyScalar(k),toneMapped:false});
export const dot=tex(64,64,(g)=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'#fff');r.addColorStop(.4,'rgba(255,255,255,.6)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64)});
// camera: field of view set horizontally (like a real FPV lens) unless horizontal=false
let curFov=0;
export function setFov(h,horizontal=true){const v=horizontal?2*Math.atan(Math.tan(h*Math.PI/360)/camera.aspect)*180/Math.PI:h;if(Math.abs(v-curFov)>.05){curFov=camera.fov=v;camera.updateProjectionMatrix()}}
// ---------- surface detail (shared by games' terrain, trees and buildings) ----------
// close-up detail: two scales of tiling noise multiplied over the field texture so the ground keeps grain at low level.
// The noise lattice wraps at the tile edge (vp), so the repeats join without a seam (a seam showed up as a crack line in the bump).
const vp=(x,z,P)=>{const w=i=>(i%P+P)%P,xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf),a=hash2(w(xi),w(zi)),b=hash2(w(xi+1),w(zi)),c=hash2(w(xi),w(zi+1)),d=hash2(w(xi+1),w(zi+1));return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v};
function makeDetail(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),im=g.createImageData(256,256),D=im.data,N=(x,y,f)=>vp(x/256*f,y/256*f,f)*.6+vp(x/256*f*4,y/256*f*4,f*4)*.4;
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4,n=N(x,y,8),a=n*.7+Math.random()*.3,b=N(x,y,4);D[i]=a*255;D[i+1]=b*255;D[i+2]=n*255;D[i+3]=255}g.putImageData(im,0,0);  /* b: the smooth part of r alone, for the bump */
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t}
let _dTex=null;export const detailTex=()=>_dTex||(_dTex=makeDetail());  // built on first use
// surface detail in world space (works on instanced meshes too): two scales of noise over the albedo, bump-mapped normals from the same noise so the light picks out
// clods, tufts and leaves; terrain (tr) also gets large-scale colour variation and crop rows that fade out before they alias.
// snow cover (SNOW.value 0..1, set by Interceptor Zombies' weather): upward faces of every detail() material whiten (sn=2, foliage: the sides frost over a little too, so tree crowns do not go black under the dim snow light; sn=0: the material does its own, like the
// farmland); snowy(m) gives a plain material the same. 0 everywhere else, and the shader then skips it.
export const SNOW={value:0};
// LOD.value 1 = Low graphics (engine/gfx.js): the detail bump (and the Interceptor field shader, ground.js) is skipped; a uniform, so no recompile
export const LOD={value:0};
// proximity (Graphics quality): DETD = distance (m) past which the detail bump is skipped (it has faded out by then anyway), GFAR = distance by
// which the Interceptor field shader's detail fades out and is skipped (ground.js); 1e9 = everywhere
export const DETD={value:1e9},GFAR={value:1e9};
export function snowy(m){m.customProgramCacheKey=()=>'snowy';m.onBeforeCompile=sh=>{sh.uniforms.uSnowD=SNOW;sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uSnowD;').replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nif(uSnowD>.001)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.74,.76,.8),clamp(uSnowD*smoothstep(.5,.85,dot(normal,normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz))),0.,.92));')};return m}
export function detail(m,s1=7,s2=53,tr=0,bk=.35,sn=1){m.customProgramCacheKey=()=>`dt${s1},${s2},${tr},${bk},${sn}`;const dTex=detailTex();m.onBeforeCompile=sh=>{sh.uniforms.dTex={value:dTex};sh.uniforms.uSnowD=SNOW;sh.uniforms.uLoD=LOD;sh.uniforms.uDetD=DETD;
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;').replace('#include <project_vertex>','#include <project_vertex>\n#ifdef USE_INSTANCING\nvWP=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;\n#else\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;\n#endif');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;uniform sampler2D dTex;uniform float uSnowD;uniform float uLoD;uniform float uDetD;').replace('#include <map_fragment>',`#include <map_fragment>
 float hb=0.;{vec2 q=vWP.xz+vec2(0.,vWP.y*.7);vec4 ta=texture2D(dTex,q/${s1.toFixed(2)});float a=ta.r,b=texture2D(dTex,q/${s2.toFixed(2)}+.37).g,fq=max(length(dFdx(q)),length(dFdy(q)));
 hb=(ta.b-.5)*.65*(1.-smoothstep(${(s1/256*1.5).toFixed(4)},${(s1/256*5).toFixed(4)},fq))+(b-.5)*.35*(1.-smoothstep(${(s2/256*2).toFixed(4)},${(s2/256*6).toFixed(4)},fq));a=mix(ta.b*.7+.15,a,1.-smoothstep(${(s1/256*.35).toFixed(4)},${(s1/256*1.2).toFixed(4)},fq));diffuseColor.rgb*=(.78+.44*a)*(.86+.28*b);
 /* the bump uses the smooth noise only (the per-texel grain in r gave blocky, sparkling normals) and fades once its finest detail is under a few pixels;
  the grain itself gives way to its average once a texel gets near pixel size (sampled any finer it only shimmers) */
 ${tr?`float M=texture2D(dTex,vWP.xz/700.+.11).g,M2=texture2D(dTex,vWP.xz/2300.+.53).r;diffuseColor.rgb*=.82+.36*M;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.1,1.,.82),clamp(M2*1.6-.5,0.,1.));
 vec2 rq=mat2(.986,.169,-.169,.986)*vWP.xz;float fw=1.-smoothstep(.05,.14,fwidth(rq.x)),rw=(sin(rq.x*8.38)*.5+.5)*fw*smoothstep(.35,.6,M);diffuseColor.rgb*=1.-.1*rw;hb+=rw*.2;`:''}}`)
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 if(uLoD<.5&&length(vViewPosition)<uDetD){vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),r1=cross(sy,normal),r2=cross(normal,sx);float det=dot(sx,r1);vec2 dH=vec2(dFdx(hb),dFdy(hb))*${bk.toFixed(3)};normal=normalize(abs(det)*normal-sign(det)*(dH.x*r1+dH.y*r2));}
 ${sn?`if(uSnowD>.001)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.74,.76,.8),clamp(uSnowD*(${sn>1?'.3+.7*':''}smoothstep(.5,.85,dot(normal,normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz))))*(.8+.4*texture2D(dTex,vWP.xz/9.+.2).g),0.,.92));`:''}`)};return m}
// tree crown: a lumpy sphere (noise-displaced), darker underneath and inside (cheap ambient occlusion)
export function crownGeo(d=2){const g=new THREE.IcosahedronGeometry(1,d),p=g.attributes.position,c=new Float32Array(p.count*3),v=new V3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=v.clone().normalize(),k=1+.22*(vnoise(n.x*2.6+5,n.z*2.6+n.y*1.7)-.5)+.12*(vnoise(n.x*6+1,n.y*6-n.z*3)-.5);v.copy(n).multiplyScalar(k);v.y=v.y*.92-.04;p.setXYZ(i,v.x,v.y,v.z);
  const ao=.42+.58*sm((n.y+.9)/1.6)*(.75+.5*(k-.9));c[i*3]=c[i*3+1]=c[i*3+2]=ao}
 g.setAttribute('color',new THREE.BufferAttribute(c,3));g.computeVertexNormals();return g}
