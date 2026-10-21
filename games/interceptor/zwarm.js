// Zombies warm-up: what Zombies would otherwise build, compile and upload the first time it shows up (each boss and its effects, the
// Mothership, the sites' damage stages, the far terrain ring, the weather's particles and cloud deck, explosions, the re-entry streak, the
// camera-feed pass...) is done in idle time instead: from page load while Zombies is the chosen mode, or on the first base screen. Each first
// use of a material made three.js link a shader program inside the frame that drew it: 100-700 ms on an integrated GPU, so a boss arriving
// or the first heavy impact froze the game. Classic never runs it (it starts only once Zombies is picked or running).
// What runs, in order (engine/idle.js queue, a few ms a slice, the heavy steps only while the game is quiet: menu, pause, base screen):
//   the modules' own warmers (engine/idle.js warmers: the sites' damage stages, a Mothership, the far ring); a sample of every boss and
//   minor kind (def.build, plus def.warm(ctx) for the effects and variants a fight makes later: wrecks, other hulls, tethers, spectres); the
//   whole scene, which holds every pooled effect even when hidden; the post-processing passes. Each is compiled as the frame draws it (into
//   the composer's render target), both ways the environment map can be (sky reflections on; off under a cloud deck, at night, in thermal),
//   with the shadow-map depth variant of each shadow caster. Then the textures are uploaded, one per slice, and the warm-up waits until
//   the GPU process has finished every program (KHR_parallel_shader_compile) and runs three.js's first-use check on each, so no frame does.
// Z.warmSt: progress (tools/zombies-hitch.mjs waits for done).
import {later,setQuiet,warmers,compileLike,texturesOf,upload,idleStats} from '../../engine/idle.js';
import {composer} from '../../engine/render.js';
export function initWarm(api,G,Z){
 const {THREE,scene,renderer,camera,S}=api;
 const st=Z.warmSt={started:false,done:false,ms:0,progs:0,tex:0,samples:0,idle:idleStats};
 setQuiet(()=>api.menuOpen||api.demo||!G.on||G.state!=='wave');
 // the environment map's other state: a stand-in cube map (PMREM, same size) when there is none at the moment, so both variants compile
 let envT=null;const other=()=>{if(scene.environment)return null;if(!envT){const pm=new THREE.PMREMGenerator(renderer);envT=pm.fromScene(new THREE.Scene());pm.dispose()}return envT.texture};
 // shadow casters: the shadow map draws each with three.js's depth material, or a copy of it carrying the material's map / alpha test, on
 // the caster's side flipped (WebGLShadowMap getDepthMaterial). Twins of those (kept, so their programs stay cached) compile the same programs
 const DEPTH=new Map(),FLIP={0:1,1:0,2:2};
 function depthTwins(root){const L=new THREE.Group();root.traverse(o=>{if(!o.isMesh||!o.castShadow)return;for(const m of[o.material].flat()){if(!m)continue;const cut=m.alphaTest>0&&(m.map||m.alphaMap),side=m.shadowSide??FLIP[m.side];
   const k=(o.customDepthMaterial?.uuid||'D')+(o.isInstancedMesh?(o.instanceColor?'ic':'i'):'')+(cut?'a'+(m.map?'m':'')+(m.alphaMap?'a':''):'')+side;if(DEPTH.has(k))continue;
   let d=o.customDepthMaterial;if(!d){d=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});d.side=side;if(cut){d.map=m.map;d.alphaMap=m.alphaMap;d.alphaTest=m.alphaTest}}DEPTH.set(k,d);
   const q=o.isInstancedMesh?new THREE.InstancedMesh(o.geometry,d,1):new THREE.Mesh(o.geometry,d);if(o.isInstancedMesh)q.instanceColor=o.instanceColor;L.add(q)}});
  if(!L.children.length)return;const f=scene.fog;scene.fog=null;try{compileLike(renderer,L,scene,camera,true)}finally{scene.fog=f}}  /* the shadow pass draws with the scene's lights but no fog */
 const TX=new Set();
 function compile(root){compileLike(renderer,root,scene,camera);const e0=scene.environment;scene.environment=other();try{compileLike(renderer,root,scene,camera)}finally{scene.environment=e0}
  depthTwins(root);texturesOf(root,TX)}
 // the post-processing passes (the FPV camera feed is off until you fly): to the canvas when last, else into the next pass's target
 function passes(){for(const p of composer?.passes||[]){const m=p.fsQuad?._mesh;if(!m?.material)continue;for(const into of[true,false])compileLike(renderer,m,m,camera,into)}}
 // compile() only queues the work: the GPU process compiles in the background, and the first draw would wait for it (and for three.js's
 // error check). So the warm-up ends when every program made since it started reports done (polled), with its check run here
 let P0=null;
 function settle(end,t0=performance.now()){const live=renderer.info.programs||[];let wait=0;
  for(const q of live){if(P0.has(q))continue;if(!q.isReady()){wait++;continue}P0.add(q);st.progs++;later(()=>{if(renderer.info.programs.includes(q))q.getUniforms()})}
  if(wait&&performance.now()-t0<9e4)setTimeout(()=>settle(end,t0),50);else later(end,{heavy:true})}
 // a sample: compile it, keep its textures for the upload step, free the geometry made for it (a sample is never drawn: nothing was uploaded)
 function take(x){for(const o of[x].flat()){if(!o)continue;compile(o);if(o.isObject3D&&!o.parent&&o.userData.own)o.traverse(q=>q.geometry?.dispose())}}
 function bossSamples(){const B=Z.bosses;if(!B)return;const C=B.ctx;
  for(const[id,D]of Object.entries(B.BOSSES))later(()=>{const t={k:id,id:-1,p:new THREE.Vector3(0,600,0),v:new THREE.Vector3(0,0,60),bs:{hp:1,max:1,ph:0,init:0,dead:0},bank:0,st:'cruise',spd:D.spd||60,cs:D.spd||60,
   mesh:null,shade:0,_seen:1};try{const m=D.build?.(C,t);if(m){m.parent?.remove(m);take(m)}take(D.warm?.(C,t))}catch(e){console.warn('boss warm-up',id,e)}st.samples++},{heavy:true})}
 function start(){if(st.started)return;st.started=true;const t0=performance.now();P0=new Set(renderer.info.programs);
  for(const w of warmers)later(()=>{take(w())},{heavy:true});
  bossSamples();
  later(()=>{compile(scene);passes()},{heavy:true});
  later(()=>{for(const t of TX)later(()=>{if(upload(renderer,t))st.tex++},{heavy:true});
   later(()=>settle(()=>{envT?.dispose();envT=null;st.done=true;st.ms=Math.round(performance.now()-t0)}),{heavy:true})},{heavy:true})}
 // start once Zombies is the chosen mode (menu) or running; Classic never starts it
 const poll=setInterval(()=>{if(S.gmode==='z'||Z.on){clearInterval(poll);start()}},500);
 Z.warmStart=start;return st}
