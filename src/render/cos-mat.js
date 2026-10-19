// Cosmetic materials (parts/cosmetics.js data -> Three.js materials). Looks only: geometry and colliders never change.
// cosMats(MAT, cos, team, spec) returns the material set buildPartsMesh() takes: the stock MAT with the cosmetic keys
// (carbon = paint, team, bell, ant, led, blade, prop) swapped. Every material is cached by what it depends on and shared
// by all drones wearing the same item, so a match holds a handful of extra materials and nothing is created per frame.
// Paint and decals are one shader (the stock carbon weave, generalised with uniforms), so all paints share a program.
import * as THREE from 'three';
import {BELLS,DECALS,LEDS,PAINTS,PROPS,TRAILS,cosIds,cosItem,teamSafe} from '../parts/cosmetics.js';
import {GS} from '../state.js';
import {glow,renderer,scene} from './renderer.js';

const C=new Map();  // material cache: key -> material
const cached=(k,f)=>{let m=C.get(k);if(!m){m=f();m.name='cos:'+k;C.set(k,m)}return m};
export const cosMatCount=()=>C.size;
// tooling (tools/cos-shots.mjs, smoke): cached cosmetic materials, distinct materials in the scene, GPU programs and textures
export function cosInfo(){const S=new Set();scene.traverse(o=>{if(o.material)[].concat(o.material).forEach(m=>S.add(m))});const id=d=>cosIds(d.cos).join('/');return {you:GS.player?id(GS.player):null,botLooks:new Set(GS.drones.filter(d=>d.bot).map(id)).size,trail:GS.player?.trailStyle,cosMats:C.size,sceneMats:S.size,programs:renderer.info.programs?.length,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries}}
const dark=(hex,k)=>new THREE.Color(hex).multiplyScalar(k);

// ---------- paint + decal shader ----------
// object-space position/normal (metres at drone size 1, x right, y up, -z forward), so the patterns need no UVs and
// line up on every part; fwidth fades the fine detail out where it would alias
const DECAL_GLSL=`varying vec3 vWP;varying vec3 vWN;uniform float uWeave,uDec,uNum;uniform vec3 uDecCol;uniform vec4 uBox;uniform vec2 uDecMR;
float twill(vec2 p){vec2 c=floor(p);float d=mod(c.x+c.y,4.);vec2 f=fract(p);return d<2.?.55+.45*sin(f.x*3.1416):.55+.45*sin(f.y*3.1416);}
float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float aas(float e,float v){float w=max(fwidth(v),1e-4);return smoothstep(e-w,e+w,v);}
float hexd(vec2 p){vec2 r=vec2(1.,1.732),h=r*.5,a=mod(p,r)-h,b=mod(p-h,r)-h,g=dot(a,a)<dot(b,b)?a:b;g=abs(g);return .5-max(dot(g,vec2(.5,.866)),g.x);}
float seg(vec2 p,vec2 a,vec2 b,float t){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return 1.-aas(t,length(pa-ba*h));}
float digit(vec2 p,float n){  // seven segments in a 1 x 2 box centred on 0
 float b=n<.5?63.:n<1.5?6.:n<2.5?91.:n<3.5?79.:n<4.5?102.:n<5.5?109.:n<6.5?125.:n<7.5?7.:n<8.5?127.:111.,m=0.,t=.16;
 vec2 A[7];A[0]=vec2(-.38,.9);A[1]=vec2(.42,.82);A[2]=vec2(.42,-.08);A[3]=vec2(-.38,-.9);A[4]=vec2(-.42,-.82);A[5]=vec2(-.42,.08);A[6]=vec2(-.38,0.);
 vec2 B[7];B[0]=vec2(.38,.9);B[1]=vec2(.42,.08);B[2]=vec2(.42,-.82);B[3]=vec2(.38,-.9);B[4]=vec2(-.42,-.08);B[5]=vec2(-.42,.82);B[6]=vec2(.38,0.);
 for(int i=0;i<7;i++){if(mod(floor(b/exp2(float(i))),2.)>.5)m=max(m,seg(p,A[i],B[i],t));}return m;}
// mask (x) and how much to lighten (y > 0) or darken (y < 0) the decal colour there
vec2 decal(vec3 p,vec3 n){if(uDec<.5)return vec2(0.);
 float inB=step(abs(p.x),uBox.x+.012)*step(abs(p.z),uBox.z+.03),top=smoothstep(.2,.5,n.y),nb=step(-.5,n.y),face=(1.-smoothstep(.55,.8,abs(n.x)))*nb;
 if(uDec<1.5)return vec2((1.-aas(.013,abs(abs(p.x)-.034)))*inB*face,0.);
 if(uDec<2.5){float d=abs(p.x);return vec2(max(1.-aas(.026,d),1.-aas(.004,abs(d-.045)))*inB*face,0.);}
 if(uDec<3.5){float v=-p.z-abs(p.x)*1.1;return vec2((1.-aas(.42,fract(v*9.)))*inB*top,0.);}
 if(uDec<4.5){float f=-p.z/max(uBox.z,.05),u=abs(n.x)>.6?(p.y-uBox.w)*1.7:p.x,L=.15+.5*(.5+.5*sin(u*55.+1.3))+.18*sin(u*127.+.4);
  return vec2(aas(1.-L*1.5,f)*inB*nb,.6*aas(1.-L*.75,f));}
 if(uDec<5.5){vec3 w=abs(n);vec2 q=w.x>w.y&&w.x>w.z?p.zy:w.y>w.z?p.xz:p.xy;return vec2(1.-aas(.07,hexd(q*32.)),0.);}
 if(uDec<6.5){float v=sin(p.z*38.+sin(p.x*21.)*1.8+sin(p.y*30.+p.x*9.)*.8);return vec2(aas(.5+.25*sin(p.x*13.+p.z*7.),v)*nb,0.);}
 if(uDec<7.5){float v=vn(p*13.)+.5*vn(p*29.+3.1);return vec2(aas(.86,v)*nb,-.45+.45*aas(1.08,v));}
 if(uDec<8.5){float c=mod(floor(p.x/.025+.5)+floor(p.z/.025),2.);return vec2(c*inB*smoothstep(.5,.7,n.y),0.);}
 if(uDec<9.5){float H=min(uBox.z*1.3,uBox.x*1.6),tens=floor(uNum/10.),ones=mod(uNum,10.);vec2 q=vec2(p.x,-p.z)/(H*.5);
  float m=tens>.5?max(digit(q-vec2(-.6,0.),tens),digit(q-vec2(.6,0.),ones)):digit(q,ones);return vec2(m*inB*smoothstep(.5,.7,n.y),0.);}
 return vec2(aas(0.,-p.z-abs(p.x)*.45+.01)*inB*nb,0.);}`;
function shade(m,U,key){m.userData.u=U;m.customProgramCacheKey=()=>'cospaint'+key;
 m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vWN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=position;vWN=normal;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n'+DECAL_GLSL).replace('#include <color_fragment>',`#include <color_fragment>
 vec2 dec=decal(vWP,normalize(vWN));float decM=dec.x;
 {vec3 p=vWP*110.,w=abs(normalize(vWN));w/=w.x+w.y+w.z;float fw=fwidth(p.x)+fwidth(p.y)+fwidth(p.z),aa=1.-smoothstep(.4,1.2,fw),t=1.;
  if(uWeave>1.5){float f=vn(vWP*55.+vn(vWP*18.)*2.5);t=mix(.5,1.35,smoothstep(.38,.62,f))*(.85+.3*vn(vWP*160.));aa=1.-smoothstep(.8,2.4,fw*.5);}
  else if(uWeave>.5)t=.55+.95*(twill(p.yz)*w.x+twill(p.xz)*w.y+twill(p.xy)*w.z);
  diffuseColor.rgb*=mix(1.,t,aa*(1.-decM));
  vec3 dc=dec.y>0.?mix(uDecCol,vec3(1.),dec.y):uDecCol*(1.+dec.y);diffuseColor.rgb=mix(diffuseColor.rgb,dc,decM);}`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,uDecMR.y,decM);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,uDecMR.x,decM);')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=1.-decM;')};
 return m}
const U=(weave,dec,col,box,mr)=>({uWeave:{value:weave},uDec:{value:dec.pat},uNum:{value:dec.num||0},uDecCol:{value:new THREE.Color(col)},uBox:{value:new THREE.Vector4(...box)},uDecMR:{value:new THREE.Vector2(...mr)}});
const boxOf=spec=>{const c=spec.chassis,h=c.half;return c.shape==='pod'?[h[0]*.9,h[0],h[2],c.y]:[h[0],h[1],h[2],c.y]};
const paintCol=(P,t)=>P.col==null?dark(teamSafe(null,t),P.dim||1):new THREE.Color(teamSafe(P.col,t));

function paintMat(P,D,t,spec,MAT){if(P.id==='carbon'&&!D.pat)return MAT.carbon;  // stock: the original material, untouched
 const box=boxOf(spec);return cached(['paint',P.id,D.id,t,box.map(v=>v.toFixed(3))].join('/'),()=>{
  const m=new THREE.MeshPhysicalMaterial({color:paintCol(P,t),roughness:P.rough,metalness:P.metal,clearcoat:P.coat||0,clearcoatRoughness:.08,iridescence:P.irid||0,iridescenceIOR:1.6,iridescenceThicknessRange:[200,700]});
  return shade(m,U(P.weave||0,D,P.col==null?0xe8ecf2:teamSafe(null,t),box,[.25,.32]),'P')})}  // on Team Metallic the decal is white
// team-coloured parts (canopies, shells, standoffs, bands): stay team; a decal shows on them in the paint colour
function teamMat(P,D,t,spec,MAT){if(!D.pat)return MAT.team[t];const box=boxOf(spec);
 return cached(['team',P.id,D.id,t,box.map(v=>v.toFixed(3))].join('/'),()=>{const m=MAT.team[t].clone();
  const pc=P.id==='carbon'||P.weave?new THREE.Color(0x0e1014):paintCol(P,t);return shade(m,U(0,D,pc,box,[P.metal,Math.max(.2,P.rough)]),'T')})}
// the battery wrap (part's own colour) with the deck decals: race numbers, chequers, stripes, chevrons, flames
function packMat(D,t,spec,MAT){const b=spec.power.batt,lr=b.style==='liion';return cached(['pack',D.id,t,spec.power.id].join('/'),()=>{const m=(lr?MAT.packLR:MAT.pack).clone();
 const w=spec.power.look?.wrap;if(w!=null)m.color.setHex(w);return shade(m,U(0,D,teamSafe(null,t),[b.half[0],b.half[1],b.half[2],spec.battY],[.25,.4]),'K')})}
function bellMat(B,t){return cached(['bell',B.id,t].join('/'),()=>B.irid?new THREE.MeshPhysicalMaterial({color:B.col,roughness:B.rough,metalness:1,iridescence:1,iridescenceIOR:2.1,iridescenceThicknessRange:[250,900]}):
 new THREE.MeshStandardMaterial({color:teamSafe(B.col,t),roughness:B.rough??.36,metalness:.85}))}
function ledMat(L,t){return cached(['led',L.id,t].join('/'),()=>glow(teamSafe(L.col,t),2))}
function antMat(L,t){return cached(['ant',L.id,t].join('/'),()=>{const c=teamSafe(L.col,t);return new THREE.MeshStandardMaterial({color:c,metalness:.4,roughness:.35,emissive:c,emissiveIntensity:.6})})}
function bladeMat(R,t){return cached(['blade',R.id,t].join('/'),()=>{const c=teamSafe(R.col,t),o=R.op<1;
 return new THREE.MeshStandardMaterial({color:c,roughness:.5,transparent:o,opacity:R.op,depthWrite:!o,emissive:R.emis?c:0,emissiveIntensity:R.emis?1.4:0})})}
function discMat(R,t,MAT){return cached(['disc',R.id,t].join('/'),()=>{const m=MAT.prop.clone();m.color.lerp(new THREE.Color(teamSafe(R.col,t)),.5);m.opacity=MAT.prop.opacity*(.6+.6*R.op);return m})}

const SETS=new Map();
// the material set for one drone: MAT with the cosmetic keys replaced (cached per cosmetics + team + chassis)
export function cosMats(MAT,cos,t,spec){if(!cos)return MAT;const key=[cos.paint,cos.decal,cos.props,cos.bell,cos.led,t,spec.chassis.id,spec.power.id].join('/');let M=SETS.get(key);if(M)return M;
 const P=cosItem('paint',cos.paint),D=cosItem('decal',cos.decal),R=cosItem('props',cos.props),B=cosItem('bell',cos.bell),L=cosItem('led',cos.led);M={...MAT};
 const FD=D.pack?DECALS[0]:D;M.carbon=paintMat(P,FD,t,spec,MAT);const tm=teamMat(P,FD,t,spec,MAT);M.team=[0,1].map(i=>i===t?tm:MAT.team[i]);M.fixed=[];  // FD: the decal on the frame
 if(D.box){M.pack=M.packLR=packMat(D,t,spec,MAT);M.fixed.push('pack','packLR')}
 if(!B.stock){M.bell=bellMat(B,t);M.fixed.push('bell')}
 if(L.col!=null){M.led=MAT.led.map((m,i)=>i===t?ledMat(L,t):m);M.ant=antMat(L,t)}
 if(R.id!=='team'){M.blade=MAT.blade.map((m,i)=>i===t?bladeMat(R,t):m);M.prop=discMat(R,t,MAT)}
 SETS.set(key,M);return M}

// ---------- trail: colour and style the boost/speed trail reads (drone.trailCol, trailCol2, trailStyle) ----------
const RAIN=[0xff4040,0xffb030,0xfff040,0x40ff70,0x40c8ff,0x6060ff,0xd050ff];
export function cosTrail(d){const T=cosItem('trail',d.cos?.trail),t=d.team;d.trailStyle=T.style;
 d.trailCol=new THREE.Color(teamSafe(T.col,t));d.trailCol2=new THREE.Color(teamSafe(T.col2,t));  // team: one flat colour, as the stock trail
 if(T.style==='rainbow'){d.trailCols=RAIN.map(h=>new THREE.Color(h))}else d.trailCols=null}
// the speed-trail line's vertex colours (head to tail), written once when the cosmetics change
export function paintTrail(d,n){const a=d.trail?.geometry?.attributes?.color;if(!a)return;const c=new THREE.Color();
 for(let j=0;j<n;j++){const s=j/(n-1);if(d.trailCols){const l=d.trailCols,x=s*(l.length-1),i=Math.min(l.length-2,x|0);c.copy(l[i]).lerp(l[i+1],x-i)}else c.copy(d.trailCol).lerp(d.trailCol2,s*s);
  c.multiplyScalar(1.5);a.setXYZ(j,c.r,c.g,c.b)}a.needsUpdate=true}
export {BELLS,DECALS,LEDS,PAINTS,PROPS,TRAILS};
