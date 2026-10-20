// Shader warm-up for Riley's games: compile every material the game can use while the menu is up, so the first explosion, boss, weather
// change, swarm or thermal switch doesn't stall a frame compiling shaders and uploading textures.
//   warm(x)        register a Material, an Object3D (mesh, group, points...) or an array of them that is not always in the scene, e.g. a mesh
//                  built on spawn: warm(bossMesh(3).g). Things already in the scene (even hidden ones) need nothing. Registered after the
//                  warm-up has run, x is compiled straight away (in the background where the browser can).
//   warmUp(o)      run once the scene is built (games/interceptor: during the menu). o.variants: [[apply, undo], ...] scene states that change
//                  shader programs (no environment map under cloud / at night / in thermal...), each compiled too.
// Programs depend on the scene's lights, fog and environment, so everything is compiled against the real scene (renderer.compile with it as
// the target scene). Textures are uploaded too (renderer.initTexture). Off with ?nowarm in the URL (for measuring the hitch it saves).
import * as THREE from 'three';
import {renderer,scene,camera} from './render.js';
const REG=[],TEX=['map','emissiveMap','alphaMap','normalMap','bumpMap','roughnessMap','metalnessMap','aoMap','lightMap','envMap','specularMap','gradientMap'];
const OFF=typeof location!=='undefined'&&/[?&]nowarm\b/.test(location.search);
let done=false,box=null,pts=null,rt=null;
export const warmStats={ms:0,programs:0,ran:false};
function holder(list){const g=new THREE.Group();g.visible=false;
 for(const x of list){if(!x)continue;if(x.isMaterial){box||=new THREE.BoxGeometry(1,1,1);pts||=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));g.add(x.isPointsMaterial?new THREE.Points(pts,x):x.isLineBasicMaterial?new THREE.LineSegments(box,x):new THREE.Mesh(box,x))}
  else if(x.isObject3D&&!x.parent)g.add(x)}return g}
function texOf(o,set){const ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[];for(const m of ms){for(const k of TEX)if(m[k]?.isTexture)set.add(m[k]);
 if(m.uniforms)for(const u of Object.values(m.uniforms))if(u?.value?.isTexture)set.add(u.value)}}
// the scene is drawn into the composer's render target (the program then has no tone mapping and a linear output), so it is compiled with one bound
function compile(root,target){const t=new Set(),prev=renderer.getRenderTarget();root.traverse(o=>texOf(o,t));rt||=new THREE.WebGLRenderTarget(1,1);
 renderer.setRenderTarget(rt);try{renderer.compile(root,camera,target)}catch(e){console.warn('warm-up',e)}renderer.setRenderTarget(prev);
 for(const x of t)if(!x.isRenderTargetTexture&&x.image)try{renderer.initTexture(x)}catch(e){}}
export function warm(x){if(Array.isArray(x)){x.forEach(warm);return}if(!x)return;if(!done||OFF){REG.push(x);return}
 const g=holder([x]);scene.add(g);compile(g,scene);scene.remove(g);for(const c of[...g.children])g.remove(c)}
export function warmUp({variants=[]}={}){if(done||OFF)return warmStats;done=true;const t0=performance.now(),p0=renderer.info.programs?.length||0;
 const g=holder(REG);scene.add(g);
 compile(scene,scene);for(const[apply,undo]of variants){apply();compile(scene,scene);undo()}
 scene.remove(g);for(const c of[...g.children])g.remove(c);REG.length=0;
 Object.assign(warmStats,{ms:Math.round(performance.now()-t0),programs:(renderer.info.programs?.length||0)-p0,ran:true});return warmStats}
