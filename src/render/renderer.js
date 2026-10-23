import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {SMAAPass} from 'three/examples/jsm/postprocessing/SMAAPass.js';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {S} from '../config/settings.js';
import {dynRes} from './dynres.js';
import {onFrame,mountFps,setCap} from '../ui/fpsmeter.js';
// ---------- renderer ----------
export const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.domElement.id='gl';document.body.prepend(renderer.domElement);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
export const scene=new THREE.Scene();scene.background=new THREE.Color(0x04060c);scene.fog=new THREE.Fog(0x04060c,300,900);
export const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.15,1800)  // near .15: twice the depth precision far away (FPV hides your own quad);
// post (High/Med): scene -> HalfFloat target (multisampled on High) -> bloom -> tone map + sRGB (OutputPass) -> SMAA (Med, or High without WebGL2 MSAA)
// Low skips the composer: the scene renders straight to the canvas, which has its own (cheap) MSAA, with no bloom
const cap=renderer.capabilities;
export const composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType}));composer.addPass(new RenderPass(scene,camera));
export const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.45,.3,1);composer.addPass(bloom);const out=new OutputPass();composer.addPass(out);
// bloom bright-pass: brightest channel (so blue glows count as much as orange/white) minus the threshold with a soft knee (smoothWidth),
// so a glow just over the threshold gets a faint halo and only properly overbright things bloom hard; lit surfaces stay under it
bloom.highPassUniforms.smoothWidth.value=.35;bloom.materialHighPassFilter.fragmentShader=`uniform sampler2D tDiffuse;uniform float luminosityThreshold,smoothWidth;varying vec2 vUv;
void main(){vec4 t=texture2D(tDiffuse,vUv);float v=max(t.r,max(t.g,t.b)),k=smoothWidth,s=clamp(v-luminosityThreshold+k,0.,2.*k);s=s*s/(4.*k+1e-5);
 gl_FragColor=vec4(t.rgb*max(s,v-luminosityThreshold)/max(v,1e-4),1.);}`;
const smaa=new SMAAPass(innerWidth,innerHeight);smaa.enabled=false;composer.addPass(smaa);
// graphics quality (S.gfx): pixel-ratio cap, AA (msaa: 4x in the composer target; smaa: post pass; canvas: direct render), shadow map size, bloom resolution (0 = off)
// measured on Intel UHD (iGPU) at 1280x720: high ~13.5 ms, med ~8.7 ms, low ~4.9 ms per frame. A multisampled HalfFloat target is what costs on iGPUs, so Med uses SMAA.
export const QUAL={high:{pr:2,aa:'msaa',sh:4096,bl:1},med:{pr:1.25,aa:'smaa',sh:2048,bl:1},low:{pr:1,aa:'canvas',sh:1024,bl:0}};
export function autoQ(){let r='';try{const g=renderer.getContext(),d=g.getExtension('WEBGL_debug_renderer_info');r=d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):''}catch(e){}
 return /swiftshader|llvmpipe|software|basic render/i.test(r)||matchMedia?.('(pointer:coarse)').matches?'low':/intel|mali|adreno|powervr|videocore|apple gpu/i.test(r)&&!/arc/i.test(r)?'med':'high'}
export let Q=QUAL.high,qId='high';let direct=false,shC=null;
{const ss=bloom.setSize.bind(bloom);bloom.setSize=(w,h)=>ss(Math.max(2,Math.round(w*(Q.bl||.5))),Math.max(2,Math.round(h*(Q.bl||.5))))}
const LMAT=[],_rs=new THREE.Vector2();
function sizeAll(){composer.setSize(innerWidth,innerHeight);renderer.getDrawingBufferSize(_rs);LMAT.forEach(m=>{m.resolution.copy(_rs);m.linewidth=m.userData.px*renderer.getPixelRatio()})}
// dynamic resolution (src/render/dynres.js): on Auto only (fixed levels keep their resolution), the render scale follows the frame time between
// 0.6 and 1 of the level's pixel ratio. FPS meter (src/ui/fpsmeter.js) in the HUD's top-right corner: the level in effect (H / M / L) and, on Auto, the scale
export const DYN=dynRes({min:.6,max:1});let pr0=1;
function applyRS(){const pr=pr0*DYN.scale;renderer.setPixelRatio(pr);composer.setPixelRatio(pr);sizeAll()}
export function setRS(k){DYN.scale=k;applyRS()}  /* tools/glitch-check.mjs: a dynamic-resolution step on demand (through main.js __dl.gl) */
onFrame(ms=>{if(DYN.sample(ms))applyRS()});
setCap(S.fcap||0);export const fpsMeter=mountFps({parent:document.getElementById('hud')||document.body,on:S.fps!==false,gl:renderer.getContext(),detail:()=>qId[0].toUpperCase()+(DYN.on?' '+Math.round(DYN.scale*100)+'%':'')});
export function setQuality(id){qId=QUAL[id]?id:autoQ();Q=QUAL[qId];DYN.on=id==='auto';if(!DYN.on)DYN.reset();pr0=Math.min(devicePixelRatio||1,Q.pr);const pr=pr0*DYN.scale,ms=Q.aa==='msaa'&&cap.isWebGL2?Math.min(4,cap.maxSamples):0;
 direct=Q.aa==='canvas';bloom.enabled=Q.bl>0;smaa.enabled=!direct&&!ms;
 // without SMAA the output pass draws to the canvas and needn't swap, so the scene always lands in renderTarget2 and only that one is multisampled
 out.needsSwap=smaa.enabled;if(composer.readBuffer!==composer.renderTarget2)composer.swapBuffers();
 renderer.setPixelRatio(pr);composer.setPixelRatio(pr);[[composer.renderTarget1,0],[composer.renderTarget2,ms]].forEach(([t,n])=>{if(t.samples!==n){t.samples=n;t.dispose()}});
 if(sun.shadow.mapSize.x!==Q.sh){sun.shadow.mapSize.set(Q.sh,Q.sh);sun.shadow.map?.dispose();sun.shadow.map=null}if(shC)fitShadow(...shC);sizeAll()}
// the MSAA resolve skips depth (nothing after the scene pass reads it; resolving multisampled depth is slow on ANGLE/D3D11)
// shader programs: three frees a program when the last material using it is disposed, and every match rebuilds the drones (their trail
// materials too), so going back to a mode compiled shaders again that it had compiled before (0.1-0.5 s frozen). keepPrograms() holds one
// more use of every program compiled so far, so they last the session (a few dozen; GPU memory only). main.js calls it now and then.
export function keepPrograms(){const P=renderer.info.programs;if(P)for(let i=0;i<P.length;i++){const p=P[i];if(!p.__keep){p.__keep=true;p.usedTimes++}}}
// compile the programs the materials under roots (an object or a list) need for the scene as it is set up now (fog, environment, lights, shadows), the way draw() renders
// (into the composer's target, or straight to the canvas), and upload their textures: with KHR_parallel_shader_compile the driver compiles
// in the background, so the first frame that draws them doesn't stall for it (render/warm.js, world/maps.js).
export function compileFor(roots){if(!Array.isArray(roots))roots=[roots];const rt=renderer.getRenderTarget();renderer.setRenderTarget(direct?null:composer.readBuffer);try{for(const r of roots)renderer.compile(r,camera,scene)}finally{renderer.setRenderTarget(rt)}
 for(const r of roots)r.traverse(o=>{const ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[];for(const m of ms)for(const k in m){const t=m[k];if(t&&t.isTexture&&!t.isRenderTargetTexture)renderer.initTexture(t)}})}
export function draw(){if(direct)return renderer.render(scene,camera);const t=composer.renderTarget2;if(t.samples)renderer.properties.get(t).__ignoreDepthValues=true;composer.render()}
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);sizeAll();camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()});

export const hemi=new THREE.HemisphereLight(0x8fb4ff,0x0a0c14,.7);scene.add(hemi);
export const sun=new THREE.DirectionalLight(0xfff4e8,2.4);sun.position.set(30,90,20);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);scene.add(sun);
// sun shadow frustum (half width, half height, far) for a map; biases follow the texel size so they hold at every shadow-map size
export function fitShadow(hx,hy,far){shC=[hx,hy,far];const c=sun.shadow.camera,tx=2*Math.max(hx,hy)/sun.shadow.mapSize.x;Object.assign(c,{left:-hx,right:hx,top:hy,bottom:-hy,near:10,far});c.updateProjectionMatrix();
 sun.shadow.bias=-.00015;sun.shadow.normalBias=tx*.6;sun.shadow.radius=2}
fitShadow(125,155,330);setQuality(S.gfx);

export function tex(w,h,draw,rep){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(16,cap.getMaxAnisotropy());if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
// unlit glow: colour pushed past 1 so it blooms; capped at 2 so whites don't blow out and team colours stay saturated
export const glow=(hex,k=1.6)=>new THREE.MeshBasicMaterial({color:new THREE.Color(hex).multiplyScalar(Math.min(k,2)),toneMapped:false});
export function scaleUV(g,sx,sy){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*sx,uv.getY(i)*sy);return g}
// fat line segments (pairs of points) for rims and cages: w metres wide up close, never thinner than o.px pixels far away (so they stay solid lines
// instead of 1-px shimmer or broken dashes), nudged a little toward the camera so they don't z-fight the surface they sit on. MSAA/SMAA smooth the edges.
// instanced shadow casters get their own depth material, set up as three's shared one: three draws every caster into the shadow map with
// one shared depth material, and each switch between a plain and an instanced mesh made it re-check that material's shader program
// (Highlands: trees and rocks among plain meshes, many times a frame). Materials that need their own depth variant (alpha-tested maps,
// alpha / displacement maps, clipping) keep three's handling. world/maps.js setMap() runs it after a map is built.
const IDEPTH=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
export function instDepth(root){root.traverse(o=>{const m=o.material;if(!o.isInstancedMesh||!o.castShadow||o.customDepthMaterial||!m||Array.isArray(m)||m.alphaMap||m.displacementMap||m.map&&m.alphaTest>0||m.clippingPlanes?.length)return;o.customDepthMaterial=IDEPTH})}
export function fatLines(pos,w,o={}){const g=new LineSegmentsGeometry().setPositions(pos);if(o.colors)g.setColors(o.colors);
 const m=new LineMaterial({linewidth:1,vertexColors:!!o.colors,color:o.color??0xffffff,toneMapped:false,fog:o.fog??true,transparent:!!o.transparent,opacity:o.opacity??1,depthWrite:!o.transparent});
 m.uniforms.worldW={value:w};m.userData.px=o.px??1.5;m.vertexShader=m.vertexShader.replace('uniform float linewidth;','uniform float linewidth,worldW;')
  .replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );','vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );start.xyz-=normalize(start.xyz)*(.06+.002*length(start.xyz));end.xyz-=normalize(end.xyz)*(.06+.002*length(end.xyz));')
  .replace('offset *= linewidth;','offset *= max(linewidth,worldW*projectionMatrix[1][1]*resolution.y*.5/(position.y<.5?clipStart.w:clipEnd.w));');
 LMAT.push(m);renderer.getDrawingBufferSize(m.resolution);m.linewidth=m.userData.px*renderer.getPixelRatio();return new LineSegments2(g,m)}
