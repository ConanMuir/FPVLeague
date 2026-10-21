// Hot-path helpers: things that run every frame and must not allocate, churn the DOM or make three.js redo work.
//  txt(el,s) / html(el,s) / css(el,k,v) / cls(el,s) / hide(el,b): DOM writes only when the value changed (an unchanged write still dirties style and layout)
//  depthFix(scene): instanced shadow casters get their own depth material, so three.js's one shared depth material stops flipping between
//   instanced and plain meshes (each flip re-fetches the shadow program: getParameters + the cache key, every frame)
//  money(n): '$1,234' like toLocaleString('en-US') (ICU number formatting was ~1.5% of a wave-28 frame), the same text
//  freeze(o): a static object's matrices are computed once and its subtree is no longer walked by updateMatrixWorld
//  compileFor(renderer,scene,camera): renderer.compile() the way the frame really draws, into a render target. A plain compile() targets the
//   screen, so tone-mapped materials get the tone-mapped sRGB variant, while an EffectComposer draws the scene into a render target (no tone
//   mapping, linear): that variant was then compiled again on first sight anyway (1-2 s the first time the camera turned to the sites).
//   compileFor(renderer,root,camera,targetScene,into): root's materials against targetScene's lights / fog / environment, and into=false for
//   something drawn to the canvas (the last post-processing pass). The one compile path: engine/warm.js and engine/idle.js's warm-ups use it
//  hyp(x,z): Math.hypot for two numbers without the varargs allocation (Math.hypot boxes its arguments; it showed up as KB per frame)
import * as THREE from 'three';
export const hyp=(x,z)=>Math.sqrt(x*x+z*z),hyp3=(x,y,z)=>Math.sqrt(x*x+y*y+z*z);
export const txt=(el,s)=>{if(el&&el._t!==s){el._t=s;el.textContent=s}};
export const html=(el,s)=>{if(el&&el._h!==s){el._h=s;el.innerHTML=s}};
export const css=(el,k,v)=>{if(el){const c=el._c||(el._c={});if(c[k]!==v){c[k]=v;el.style[k]=v}}};
export const cls=(el,s)=>{if(el&&el.className!==s)el.className=s};
export const hide=(el,b)=>{if(el&&el.hidden!==b)el.hidden=b};
const DM={};
export function depthFix(scene){scene.traverse(o=>{const M=o.material;if(!o.isInstancedMesh||!o.castShadow||Array.isArray(M)||M.alphaTest>0||M.displacementMap||M.clippingPlanes?.length||o.customDepthMaterial&&!o.customDepthMaterial.userData.hot)return;const k=o.instanceColor?'c':'p';
 let m=DM[k];if(!m){m=DM[k]=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});m.userData.hot=1}if(o.customDepthMaterial!==m)o.customDepthMaterial=m})}
export const money=n=>{const r=Math.round(n);if(!(Math.abs(r)<1e21))return'$'+r.toLocaleString('en-US');if(Object.is(r,-0))return'$-0';return'$'+String(r).replace(/\B(?=(\d{3})+(?!\d))/g,',')};
export function freeze(o){o.updateMatrixWorld(true);o.traverse(q=>{q.matrixAutoUpdate=false});o.matrixWorldAutoUpdate=false;return o}
let _crt=null;
export function compileFor(renderer,scene,camera,target=null,into=true){const rt=renderer.getRenderTarget();_crt=_crt||new THREE.WebGLRenderTarget(1,1);renderer.setRenderTarget(into?_crt:null);try{renderer.compile(scene,camera,target)}finally{renderer.setRenderTarget(rt)}}  // target: the scene whose lights / fog / environment to compile against (three's compile)
