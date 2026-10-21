// Idle-time setup: the one-off work a game would otherwise do the first time something is used (build a mesh, link its shader program,
// upload its texture) runs between frames instead, so the first boss, explosion or weather change doesn't stall a frame. Linking a program
// is 100-700 ms on an integrated GPU's D3D compiler, all inside the frame that first draws it.
//   later(f,{heavy}) queue f; it runs between frames (requestIdleCallback), a few ms a slice. heavy: only while setQuiet's test says the
//                    game is quiet (a menu, a pause, a between-waves screen); others also run in the idle time of a busy frame
//   setQuiet(fn)     the game's "nothing time-critical is on screen" test (default: always)
//   warmers          setup a module registers for the game's warm-up to run (games/interceptor/zwarm.js runs them): functions that do
//                    their own work and may return objects (Object3D / material / array) to compile and upload, then let go of
//   compileLike(renderer,root,scene,camera) compile root's materials for scene the way the frame draws it. An EffectComposer draws the scene
//                    into a render target (no tone mapping, linear output), a plain renderer.compile() targets the canvas: another variant,
//                    so a warm-up that way compiled programs nothing used. The scene's last draw target is watched (scene.onBeforeRender);
//                    into (true / false) forces a render target / the canvas: a shadow map is a render target, the last pass draws to the canvas
//   texturesOf(root) the textures root's materials use; upload(renderer,t) uploads one now, if it isn't already
//   idleStats        tasks run, ms spent, the longest task (ms), tasks waiting
import * as THREE from 'three';
const Q=[],ric=typeof requestIdleCallback==='function'?(f)=>requestIdleCallback(f,{timeout:250}):f=>setTimeout(()=>f({timeRemaining:()=>8}),16);
let quiet=()=>true,sched=false,rt1=null;
// tasks draw from their own random stream: building a sample (decals, grime) must not shift the game's Math.random sequence (a seeded
// run, a replay or a determinism test would diverge depending on when the idle slices ran)
let seed=(typeof crypto!=='undefined'&&crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now())>>>0;
const own=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
export const idleStats={tasks:0,ms:0,worst:0,left:0},warmers=[];
export const setQuiet=f=>{quiet=f};
function pump(dl){sched=false;const t0=performance.now();
 while(Q.length){const q=quiet();if(!q&&Q[0].heavy)break;const spent=performance.now()-t0;if(spent>(q?12:3)||!q&&(dl.timeRemaining?.()??0)<6)break;
  const t=Q.shift(),a=performance.now(),r0=Math.random;Math.random=own;try{t.f()}catch(e){console.warn('idle task',e)}finally{Math.random=r0}const d=performance.now()-a;idleStats.tasks++;idleStats.ms+=d;if(d>idleStats.worst)idleStats.worst=d}
 idleStats.left=Q.length;if(Q.length){if(!quiet()&&Q[0].heavy)setTimeout(kick,250);else kick()}}
function kick(){if(!sched){sched=true;ric(pump)}}
export function later(f,{heavy=false}={}){Q.push({f,heavy});idleStats.left=Q.length;kick()}
const watched=new WeakSet();
function watch(scene){if(!scene.isScene||watched.has(scene))return;watched.add(scene);const ob=scene.onBeforeRender;scene.onBeforeRender=function(r,s,c,rt){scene.userData.drawRT=rt?1:0;return ob.apply(this,arguments)}}
export function compileLike(renderer,root,scene,camera,into=scene.userData.drawRT!==0){watch(scene);const prev=renderer.getRenderTarget();rt1||=new THREE.WebGLRenderTarget(1,1);
 renderer.setRenderTarget(into?rt1:null);try{renderer.compile(root,camera,scene)}catch(e){console.warn('warm-up compile',e)}finally{renderer.setRenderTarget(prev)}}
const TEX=['map','emissiveMap','alphaMap','normalMap','bumpMap','roughnessMap','metalnessMap','aoMap','lightMap','specularMap','gradientMap','displacementMap'];
export function texturesOf(root,set=new Set()){const add=m=>{if(!m)return;for(const k of TEX)if(m[k]?.isTexture)set.add(m[k]);if(m.uniforms)for(const u of Object.values(m.uniforms))if(u?.value?.isTexture)set.add(u.value)};
 const visit=o=>{if(o?.isMaterial)add(o);else if(o?.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(add)};
 if(Array.isArray(root))root.forEach(r=>texturesOf(r,set));else if(root?.isObject3D)root.traverse(visit);else visit(root);return set}
export function upload(renderer,t){if(!t||t.isRenderTargetTexture||!t.image||!(t.version>0)||renderer.properties.get(t).__version===t.version)return false;renderer.initTexture(t);return true}
