/* Little Buddy's look (zbuddy.js). The model is built by Drone League's own part builder (src/parts/mesh.js buildPartsMesh) from the garage loadout, with the
   League's cosmetics on compact materials (no carbon-weave / decal shader: the League's material code needs its renderer, and the page's bundle is not here).
   src/parts/* are plain ES modules, so they load from the page as they are (the importmap in index.html maps three/examples/jsm/ for them); they are imported
   lazily and only when a garage save exists. If they cannot be loaded (this page served without src/), a small quad built from boxes stands in.
   The name tag is a sprite with a constant screen size. */
import * as THREE from 'three';
import {glow} from '../../engine/render.js';

let PM=null,pending=null;  /* PM: the loaded League modules, false once loading failed */
export const partsReady=()=>PM,partsFailed=()=>PM===false;
/* starts the lazy import once; resolves to the modules or false */
export function loadParts(){return pending||(pending=Promise.all([import('../../src/parts/index.js'),import('../../src/parts/mesh.js'),import('../../src/parts/cosmetics.js')])
 .then(([a,m,c])=>(PM={computeLoadout:a.computeLoadout,cleanLoadout:a.cleanLoadout,STOCK:a.STOCK,buildPartsMesh:m.buildPartsMesh,cosItem:c.cosItem,teamSafe:c.teamSafe}))
 .catch(e=>{console.warn('Little Buddy: Drone League parts not loaded, using the plain quad',e);return PM=false}))}

const std=(c,r=.5,m=.3,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...o});
const TEAM=0x2d8cff;  /* the League's blue team colour: this is your side's drone */
/* the League's material set for buildPartsMesh, cosmetics applied (looks only). cos = six ids or null (the stock look) */
function matSet(cos){const P=PM.cosItem,ts=h=>PM.teamSafe(h,0),pa=P('paint',cos?.[0]),pr=P('props',cos?.[2]),be=P('bell',cos?.[3]),le=P('led',cos?.[4]),own=[];
 const mk=m=>(own.push(m),m),tc=new THREE.Color(TEAM);
 const M={carbon:mk(new THREE.MeshPhysicalMaterial({color:pa.col==null?tc.clone().multiplyScalar(pa.dim||.55):ts(pa.col),roughness:pa.rough??.5,metalness:pa.metal??.15,clearcoat:pa.coat??(pa.id==='carbon'?1:0),clearcoatRoughness:.18})),
  metal:mk(std(0x8a919c,.3,.9)),prop:mk(new THREE.MeshBasicMaterial({color:0xaab4c8,transparent:true,opacity:.14,depthWrite:false})),lens:mk(std(0x050505,.05,1)),
  team:[mk(std(TEAM,.35,.4,{emissive:TEAM,emissiveIntensity:.3}))],led:[mk(glow(le.col==null?TEAM:ts(le.col),2))],blade:[mk(std(TEAM,.5,0,{transparent:true,opacity:.55}))],
  pack:mk(std(0x23262d,.55,.15)),packLR:mk(std(0x1d5a6e,.45,.2)),label:mk(std(0xffc640,.5,.1)),copper:mk(std(0xb8642e,.35,.85)),chip:mk(std(0x0e0f12,.4,.2)),rubber:mk(std(0x0c0d10,.9,0)),board:mk(std(0x1f3a2a,.6,.3))};
 if(!be.stock){M.bell=mk(std(ts(be.col??TEAM),be.rough??.36,.85));M.fixed=['bell']}
 if(le.col!=null)M.ant=mk(std(ts(le.col),.35,.4,{emissive:ts(le.col),emissiveIntensity:.6}));
 if(pr.id!=='team'){const c=ts(pr.col??TEAM);M.blade=[mk(std(c,.5,0,{transparent:pr.op<1,opacity:pr.op,depthWrite:pr.op>=1,emissive:pr.emis?c:0,emissiveIntensity:pr.emis?1.4:0}))];
  M.prop=mk(M.prop.clone());M.prop.color.lerp(new THREE.Color(c),.5);M.prop.opacity=.14*(.6+.6*pr.op)}
 M.own=own;return M}

/* the stand-in: a plain X quad in the League's blue */
function plain(){const g=new THREE.Group(),props=[],m=std(0x1b1e24,.5,.3),t=std(TEAM,.4,.4,{emissive:TEAM,emissiveIntensity:.3}),p=new THREE.MeshBasicMaterial({color:0xaab4c8,transparent:true,opacity:.2,depthWrite:false});
 const add=(geo,mat,x=0,y=0,z=0,ry=0)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.rotation.y=ry;o.castShadow=true;g.add(o);return o};
 add(new THREE.BoxGeometry(.34,.12,.56),m,0,.05,0);add(new THREE.BoxGeometry(.2,.04,.3),t,0,.13,.02);add(new THREE.BoxGeometry(1.1,.03,.07),m,0,0,0,Math.PI/4);add(new THREE.BoxGeometry(1.1,.03,.07),m,0,0,0,-Math.PI/4);
 for(const[x,z]of[[.4,.4],[-.4,.4],[.4,-.4],[-.4,-.4]]){const pg=new THREE.Group();pg.position.set(x,.08,z);pg.add(new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.01,18),p));g.add(pg);props.push(pg)}
 return{group:g,props,own:[m,t,p]}}

/* a model for a garage loadout: {grp, props (the four prop groups to spin), kind 'parts' | 'plain', own (materials to free)} */
export function buildModel(ids,cos,scale){let r=null,kind='plain';
 if(PM)try{const lo=PM.computeLoadout(PM.cleanLoadout(ids)||PM.STOCK),M=matSet(cos),b=PM.buildPartsMesh(lo.meshSpec,0,M);r={group:b.group,props:b.props,own:M.own};kind='parts'}catch(e){console.warn('Little Buddy: model failed',e)}
 if(!r)r=plain();
 const grp=new THREE.Group();grp.add(r.group);grp.scale.setScalar(scale);grp.visible=false;grp.userData.free=1;  /* geometry is shared with the League's cache: only the materials are ours */
 return{grp,props:r.props,kind,own:r.own,body:r.group}}
export function freeModel(m){if(!m)return;m.grp.removeFromParent();for(const x of m.own||[])x.dispose()}

/* name tag: a sprite whose size does not change with distance */
export function buildTag(text){const c=document.createElement('canvas');c.width=256;c.height=48;const g=c.getContext('2d');
 g.font='700 28px "Chakra Petch",Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=6;g.strokeStyle='rgba(0,0,0,.85)';g.strokeText(text,128,25);g.fillStyle='#d4f2ff';g.fillText(text,128,25);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,depthTest:false,sizeAttenuation:false,toneMapped:false}));
 s.scale.set(.27,.05,1);s.renderOrder=6;s.userData.text=text;return s}
export function freeTag(s){if(!s)return;s.removeFromParent();s.material.map?.dispose();s.material.dispose()}
