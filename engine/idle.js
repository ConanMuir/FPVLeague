// Idle-time setup: the one-off work a game would otherwise do the first time something is used (build a mesh, link its shader program,
// upload its texture) runs between frames instead, so the first boss, explosion or weather change doesn't stall a frame. Linking a program
// is 100-700 ms on an integrated GPU's D3D compiler, all inside the frame that first draws it.
//   later(f,{heavy}) queue f; it runs between frames (requestIdleCallback), a few ms a slice. heavy: only while setQuiet's test says the
//                    game is quiet (a menu, a pause, a between-waves screen); others also run in the idle time of a busy frame
//   setQuiet(fn)     the game's "nothing time-critical is on screen" test (default: always)
//   warmers          setup a module registers for the game's warm-up to run (games/interceptor/zwarm.js runs them): functions that do
//                    their own work and may return objects (Object3D / material / array) to compile and upload, then let go of
//   (compiling goes through engine/hot.js compileFor: into a render target, as the composer draws)
//   texturesOf(root) the textures root's materials use; upload(renderer,t) uploads one now, if it isn't already
//   ownRandom(f)     f() drawing from the idle tasks' private random stream (see below)
//   idleStats        tasks run, ms spent, the longest task (ms), tasks waiting
const Q=[],ric=typeof requestIdleCallback==='function'?(f)=>requestIdleCallback(f,{timeout:250}):f=>setTimeout(()=>f({timeRemaining:()=>8}),16);
let quiet=()=>true,sched=false;
// tasks draw from their own random stream: building a sample (decals, grime) must not shift the game's Math.random sequence (a seeded
// run, a replay or a determinism test would diverge depending on when the idle slices ran)
let seed=(typeof crypto!=='undefined'&&crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now())>>>0;
const own=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
// f() with that private stream: one-off builds that can run either in idle time or at first use (a decal, the sites' damage stages) use it
// both ways, so the game's sequence is the same whichever happened
export function ownRandom(f){const r0=Math.random;Math.random=own;try{return f()}finally{Math.random=r0}}
export const idleStats={tasks:0,ms:0,worst:0,left:0},warmers=[];
export const setQuiet=f=>{quiet=f};
function pump(dl){sched=false;const t0=performance.now();
 while(Q.length){const q=quiet();if(!q&&Q[0].heavy)break;const spent=performance.now()-t0;if(spent>(q?12:3)||!q&&(dl.timeRemaining?.()??0)<6)break;
  const t=Q.shift(),a=performance.now(),r0=Math.random;Math.random=own;try{t.f()}catch(e){console.warn('idle task',e)}finally{Math.random=r0}const d=performance.now()-a;idleStats.tasks++;idleStats.ms+=d;if(d>idleStats.worst)idleStats.worst=d}
 idleStats.left=Q.length;if(Q.length){if(!quiet()&&Q[0].heavy)setTimeout(kick,250);else kick()}}
function kick(){if(!sched){sched=true;ric(pump)}}
export function later(f,{heavy=false}={}){Q.push({f,heavy});idleStats.left=Q.length;kick()}
const TEX=['map','emissiveMap','alphaMap','normalMap','bumpMap','roughnessMap','metalnessMap','aoMap','lightMap','specularMap','gradientMap','displacementMap'];
export function texturesOf(root,set=new Set()){const add=m=>{if(!m)return;for(const k of TEX)if(m[k]?.isTexture)set.add(m[k]);if(m.uniforms)for(const u of Object.values(m.uniforms))if(u?.value?.isTexture)set.add(u.value)};
 const visit=o=>{if(o?.isMaterial)add(o);else if(o?.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(add)};
 if(Array.isArray(root))root.forEach(r=>texturesOf(r,set));else if(root?.isObject3D)root.traverse(visit);else visit(root);return set}
export function upload(renderer,t){if(!t||t.isRenderTargetTexture||!t.image||!(t.version>0)||renderer.properties.get(t).__version===t.version)return false;renderer.initTexture(t);return true}
