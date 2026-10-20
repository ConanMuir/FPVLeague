// Hot-path helpers: things that run every frame and must not allocate, churn the DOM or make three.js redo work.
//  txt(el,s) / html(el,s) / css(el,k,v) / cls(el,s) / hide(el,b): DOM writes only when the value changed (an unchanged write still dirties style and layout)
//  depthFix(scene): instanced shadow casters get their own depth material, so three.js's one shared depth material stops flipping between
//   instanced and plain meshes (each flip re-fetches the shadow program: getParameters + the cache key, every frame)
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
