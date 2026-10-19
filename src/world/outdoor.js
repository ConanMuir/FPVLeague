// ---------- outdoor League maps, detail kit: stadium bowl, terrain shading, instanced props, water. Visual only (no collision). ----------
// Everything here sits outside the arena glass (contour offset > 0) or is paint on the pitch. Code-built: procedural geometry, canvas/data textures.
// Quality (S.gfx via renderer qId) scales instance counts (and hides userData.hi extras on Low) at runtime (applyQ, polled from the terrain's onBeforeRender).
import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {COL,GW,HL,HW,RC,RF,cl} from '../config/constants.js';
import {glow,qId,tex} from '../render/renderer.js';
import {RM} from '../physics/arena-shape.js';
import {fbm,hash2,sm,vnoise} from './noise.js';

export const UT={value:0};  // shared time uniform (water)
const QF={high:1,med:.65,low:.35};
export const RNG=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
// distance outside the arena's rounded plan (the contour offset; negative inside)
export const offR=(x,z)=>{const qx=Math.abs(x)-(HW-RC),qz=Math.abs(z)-(HL-RC);return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-RC};
// quality hook: instanced meshes keep their full count in userData.n and draw a fraction of it (instances are shuffled, so it thins evenly)
export function applyQ(G){const f=QF[qId]||1;G.traverse(o=>{const u=o.userData;if(u.n!=null)o.count=Math.max(1,Math.round(u.n*(u.fix?1:u.qf?u.qf[qId]??1:f)));if(u.hi)o.visible=qId!=='low'})}

// ---------- procedural textures ----------
// tileable value noise (period P cells) and fbm
function pn(x,y,P,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),h=(a,b)=>hash2((a%P+P)%P+s*17.3,(b%P+P)%P-s*7.1);
 const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function pf(x,y,P,s,o=4){let t=0,a=.5,f=1,n=0;for(let i=0;i<o;i++){t+=pn(x*f,y*f,P*f,s+i)*a;n+=a;a*=.5;f*=2}return t/n}
function dataTex(S,fn,lin=true){const d=new Uint8Array(S*S*4),c=[0,0,0];for(let j=0;j<S;j++)for(let i=0;i<S;i++){fn(c,i/S,j/S,i,j);const k=(j*S+i)*4;d[k]=cl(c[0],0,1)*255;d[k+1]=cl(c[1],0,1)*255;d[k+2]=cl(c[2],0,1)*255;d[k+3]=255}
 const t=new THREE.DataTexture(d,S,S);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;if(!lin)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t}
// terrain detail (data, not colour): R grass/ground grain, G rock (cracks + grain), B soft (snow drifts / sand ripples)
let DET=null;export const detTex=()=>DET||(DET=dataTex(512,(c,x,y)=>{const r=hash2(x*913.1,y*577.3);
 c[0]=.45*pf(x*8,y*8,8,1)+.4*pf(x*32,y*32,32,2,2)+.15*r;
 const rd=1-Math.abs(2*pf(x*6,y*6,6,3,3)-1),rd2=1-Math.abs(2*pf(x*14,y*14,14,4,2)-1);c[1]=.62*pf(x*4,y*4,4,5,5)+.2*r+.28-.35*Math.pow(rd,8)-.2*Math.pow(rd2,10);
 c[2]=.7*pf(x*4,y*4,4,6,4)+.3*pf(x*16,y*16,16,7,2)}));
// grass-blade normal map for the pitch
let TN=null;const turfN=()=>TN||(TN=(()=>{const S=256,h=new Float32Array(S*S);for(let j=0;j<S;j++)for(let i=0;i<S;i++)h[j*S+i]=.55*hash2(i*1.37,j*.91)+.45*pf(i/S*16,j/S*64,16,9,2);
 const H=(i,j)=>h[((j+S)%S)*S+(i+S)%S];return dataTex(S,(c,x,y,i,j)=>{const dx=(H(i+1,j)-H(i-1,j))*1.6,dy=(H(i,j+1)-H(i,j-1))*1.6,l=Math.hypot(dx,dy,1);c[0]=.5-dx/l*.5;c[1]=.5-dy/l*.5;c[2]=.5+.5/l})})());
export const turfNormal=()=>turfN();

// ---------- terrain: CPU colour layers (ground/rock/snow, water beds) + shader detail (world-space, triplanar rock, derivative bump) ----------
export function terrainMat(D){const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,metalness:0});const td=detTex();
 m.onBeforeCompile=s=>{Object.assign(s.uniforms,{tDet:{value:td},uSand:{value:D.sand?1:0},uStr:{value:D.strata||0},uBump:{value:D.bump||1}});
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 aw;varying vec2 vAw;varying vec3 vWP,vWN;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvAw=aw;vWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D tDet;uniform float uSand,uStr,uBump;varying vec2 vAw;varying vec3 vWP,vWN;float hD;`)
   .replace('#include <map_fragment>',`#include <map_fragment>
 {vec2 p=vWP.xz;vec3 b=abs(normalize(vWN));b=pow(b,vec3(4.));b/=b.x+b.y+b.z;
  vec3 a=texture2D(tDet,p*.09).rgb,a2=texture2D(tDet,p*.021+.37).rgb,mc=texture2D(tDet,p*.0031).rgb;
  float rp=.5+.5*sin(dot(p,vec2(.6,.8))*1.7+a2.b*14.+a.b*3.),gr=mix(a.r*.6+a2.r*.4,mix(a.b*.5+a2.b*.5,rp,.35),uSand);
  float rk=(texture2D(tDet,vWP.zy*.045).g*b.x+texture2D(tDet,p*.045).g*b.y+texture2D(tDet,vWP.xy*.045).g*b.z)*.7+a2.g*.3;
  float sn=a.b*.4+a2.b*.6;
  hD=mix(mix(gr,rk,vAw.x),sn,vAw.y);
  diffuseColor.rgb*=(.74+.52*hD)*(.9+.2*mc.r);
  diffuseColor.rgb*=1.+uStr*vAw.x*(sin(vWP.y*1.25+rk*2.5)*.09+sin(vWP.y*.31+mc.g*4.)*.1);}`)
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 {float fd=uBump*(1.-smoothstep(60.,450.,length(vViewPosition)))*(.35+.4*vAw.x);vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),r1=cross(sy,normal),r2=cross(normal,sx);
  float det=dot(sx,r1)*faceDirection;vec2 dh=vec2(dFdx(hD),dFdy(hD))*fd*1.4;normal=normalize(abs(det)*normal-sign(det)*(dh.x*r1+dh.y*r2));}`)};
 m.customProgramCacheKey=()=>'terrain1';return m}
// colour/weights per vertex. D: g1 g2 rock rock2 snow bed (hex), snowY (meadow peaks), allSnow (alpine), sand (canyon)
export function terrainGeo(H,D,wl,seg){const g=new THREE.PlaneGeometry(2400,2400,seg,seg);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,H(p.getX(i),p.getZ(i)));g.computeVertexNormals();
 const nm=g.attributes.normal,col=new Float32Array(p.count*3),aw=new Float32Array(p.count*2),C=k=>new THREE.Color(D[k]),g1=C('g1'),g2=C('g2'),r1=C('rock'),r2=C('rock2'),sn=C('snow'),bd=C('bed'),c3=new THREE.Color(),c4=new THREE.Color();
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ny=nm.getY(i),n=fbm(x/60,z/60),n2=vnoise(x/17+3,z/17),sl=1-ny;
  let rk=Math.max(cl((sl-.17+n*.08)/.16,0,1),D.rockY?cl((y-D.rockY+n*40)/60,0,1)*.8:0);
  let s=D.allSnow?1-cl((sl-.32+(n-.5)*.25)/.12,0,1):D.snowY?cl((y-D.snowY+(n-.5)*60)/25,0,1)*(1-cl((sl-.5)/.2,0,1)):0;
  c3.copy(g1).lerp(g2,sm((n-.35)*3.2));c4.copy(r2).lerp(r1,n2);if(D.band)c4.multiplyScalar(.82+.18*Math.sin(y*.45+n*2));c3.lerp(c4,rk).lerp(sn,s).multiplyScalar(.84+.32*n2);
  if(wl!=null&&y<wl+1.2)c3.lerp(bd,cl((wl+1.2-y)/2.5,0,1));
  col.set([c3.r,c3.g,c3.b],i*3);aw[i*2]=rk;aw[i*2+1]=s}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('aw',new THREE.BufferAttribute(aw,2));return g}

// ---------- water: standard material with animated wave normals (lit, fogged, reflects the sky environment). ice: flat, cracked ----------
export function waterMat(o){const m=new THREE.MeshStandardMaterial({color:o.col,roughness:o.ice?.22:.04,metalness:o.ice?0:.1,transparent:true,opacity:o.op??.86,envMapIntensity:o.ice?.6:1.2});
 m.onBeforeCompile=s=>{s.uniforms.uT=UT;s.uniforms.tDet={value:detTex()};
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform float uT;uniform sampler2D tDet;varying vec3 vWP;
vec2 wv(vec2 p,float t){vec2 g=vec2(0.);vec2 d[4];d[0]=vec2(.8,.6);d[1]=vec2(-.5,.86);d[2]=vec2(.97,-.24);d[3]=vec2(-.3,-.95);
 for(int i=0;i<4;i++){float f=.07*pow(2.3,float(i)),a=.2/pow(1.5,float(i));g+=d[i]*cos(dot(p,d[i])*f+t*(.9+.5*float(i)))*a*f*2.;}return g;}`)
   .replace('#include <map_fragment>',`#include <map_fragment>
 ${o.ice?'{float k=texture2D(tDet,vWP.xz*.03).g,k2=texture2D(tDet,vWP.xz*.008+.3).b;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.97,1.),smoothstep(.42,.2,k)*.7+k2*.25);}':'{float k=texture2D(tDet,vWP.xz*.01+uT*.004).b;diffuseColor.rgb*=.85+.3*k;}'}`)
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 {float fd=(1.-smoothstep(60.,600.,length(vViewPosition)))*${o.ice?'.06':'.55'};vec2 gw=(wv(vWP.xz,uT*${o.ice?0:1}.)+(texture2D(tDet,vWP.xz*.06+uT*vec2(.012,.007)).rb+texture2D(tDet,vWP.xz*.023-uT*vec2(.005,.009)).br-1.)*.7)*fd;normal=normalize(normal+(viewMatrix*vec4(-gw.x,0.,-gw.y,0.)).xyz);}`)};
 m.customProgramCacheKey=()=>'water'+(o.ice?1:0);return m}

// ---------- props: vertex-coloured species geometry (trunk, foliage, snow in one mesh), instanced and chunked by sector ----------
const cc=h=>new THREE.Color(h);
function fin(g,col){g.deleteAttribute('uv');if(!g.attributes.normal)g.computeVertexNormals();if(g.index)g=g.toNonIndexed();const p=g.attributes.position,n=g.attributes.normal,a=new Float32Array(p.count*3),c3=new THREE.Color();
 for(let i=0;i<p.count;i++){col(c3,p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i));a[i*3]=c3.r;a[i*3+1]=c3.g;a[i*3+2]=c3.b}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g}
function blob(r,det,amp,seed,sx=1,sy=1,sz=1){let g=new THREE.IcosahedronGeometry(r,det);g.deleteAttribute('uv');g.deleteAttribute('normal');g=mergeVertices(g);const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=1+amp*(vnoise(x/r*1.6+seed*3.1,z/r*1.6+y/r*1.2+seed)-.5)*2;p.setXYZ(i,x*k*sx,y*k*sy,z*k*sz)}g.computeVertexNormals();return g}
const cyl=(r0,r1,h,n=7)=>new THREE.CylinderGeometry(r1,r0,h,n,1).translate(0,h/2,0);
const solid=c=>t=>t.copy(c);
function species(){const BARK=cc('#5a3d27'),BIRCH=cc('#d8d4c8'),LEAF=cc('#4f7d2c'),LEAF2=cc('#6f9a34'),PINE=cc('#2c5a32'),SNOW=cc('#f3f7fb'),DEAD=cc('#7c6a58'),CACT=cc('#4f7a3a'),SCRUB=cc('#8a8a52'),ROCK=cc('#8b8780');
 const leafy=(c,y0,y1,b=1)=>(t,x,y,z,nx,ny)=>t.copy(c).multiplyScalar(b*(.5+.5*cl((y-y0)/(y1-y0),0,1)+.14*ny));
 const M=a=>mergeGeometries(a.map(g=>g.index?g.toNonIndexed():g));const S={};
 S.oak=M([fin(cyl(.09,.05,.55),solid(BARK)),...[[0,.66,0,.28],[.17,.58,.08,.21],[-.15,.6,-.08,.22],[.04,.83,-.03,.19],[-.04,.62,.16,.19]].map(([x,y,z,r],i)=>fin(blob(r,1,.22,i).translate(x,y,z),leafy(i%2?LEAF:LEAF2,.4,.95)))]);
 S.birch=M([fin(cyl(.05,.03,.7),solid(BIRCH)),...[[0,.72,0,.17],[.08,.6,.04,.13],[-.07,.86,-.03,.12]].map(([x,y,z,r],i)=>fin(blob(r,1,.25,i+7,1,1.3,1).translate(x,y,z),leafy(LEAF2,.45,1,1.1)))]);
 S.poplar=M([fin(cyl(.05,.03,.3),solid(BARK)),fin(blob(.16,1,.15,3,1,3.2,1).translate(0,.6,0),leafy(LEAF,.2,1))]);
 const pine=snow=>M([fin(cyl(.06,.03,.35),solid(BARK)),...[0,1,2,3].map(k=>{const r=.36*(1-k*.21),h=.34-k*.03,y0=.14+k*.19;return fin(new THREE.ConeGeometry(r,h,9,1).translate(0,y0+h/2,0),(t,x,y,z,nx,ny)=>{const u=(y-y0)/h;
   t.copy(PINE).multiplyScalar(.5+.6*u);if(snow&&ny>.2&&u>.5+.35*vnoise(x*40+k,z*40))t.copy(SNOW).multiplyScalar(.85+.15*u);if(ny<-.5)t.copy(PINE).multiplyScalar(.35)})})]);
 S.pine=pine(0);S.snowpine=pine(1);
 S.bush=M([[0,.18,0,.22],[.18,.13,.05,.16],[-.15,.14,-.06,.17],[.02,.12,.18,.14]].map(([x,y,z,r],i)=>fin(blob(r,1,.25,i+11,1,.8,1).translate(x,y,z),leafy(i%2?LEAF:LEAF2,0,.35,.9))));
 const rock=top=>fin(blob(.5,1,.32,5,1,.62,1.1).translate(0,.12,0),(t,x,y,z,nx,ny)=>{t.copy(ROCK).multiplyScalar(.72+.4*vnoise(x*7,z*7+y*5));if(top==='moss'&&ny>.55)t.lerp(cc('#55752e'),.75);if(top==='snow'&&ny>.35)t.copy(SNOW);if(top==='red')t.lerp(cc('#b0583a'),.8).multiplyScalar(.85+.2*Math.sin(y*30))});
 S.rockM=rock('moss');S.rockS=rock('snow');S.rockR=rock('red');
 {const rib=g=>{const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),a=Math.atan2(z,x),k=1+.12*Math.cos(a*12);p.setX(i,x*k);p.setZ(i,z*k)}g.computeVertexNormals();return g};
  const col=(t,x,y,z)=>{const a=Math.atan2(z,x);t.copy(CACT).multiplyScalar(.7+.35*(.5+.5*Math.cos(a*12)))},arm=(sd,y,h)=>[fin(rib(new THREE.CylinderGeometry(.055,.055,.2,12)).rotateZ(Math.PI/2).translate(sd*.1,y,0),col),fin(rib(new THREE.CylinderGeometry(.05,.055,h,12,1).translate(sd*.2,y+h/2-.03,0)),col),fin(new THREE.SphereGeometry(.05,10,5,0,Math.PI*2,0,Math.PI/2).translate(sd*.2,y+h-.03,0),col)];
  S.cactus=M([fin(rib(new THREE.CylinderGeometry(.08,.09,.92,12,3).translate(0,.46,0)),col),fin(new THREE.SphereGeometry(.08,12,6,0,Math.PI*2,0,Math.PI/2).translate(0,.92,0),col),...arm(1,.42,.3),...arm(-1,.56,.22)])}
 S.scrub=M([[0,.1,0,.2],[.15,.08,.07,.15],[-.13,.08,-.05,.15]].map(([x,y,z,r],i)=>fin(blob(r,1,.35,i+21,1,.6,1).translate(x,y,z),leafy(SCRUB,0,.25,.95))));
 S.dead=M([fin(cyl(.06,.035,.7),solid(DEAD)),...[[.5,.4,.9],[-.6,.5,2.4],[.35,.62,4.1]].map(([a,y,r])=>fin(cyl(.03,.012,.38,5).rotateZ(a).rotateY(r).translate(0,y,0),solid(DEAD)))]);
 {const parts=[];let y=0;for(let k=0;k<4;k++){const h=.24-k*.02,r0=.16-k*.025+(k===2?-.04:0),r1=r0*.82;parts.push(fin(cyl(r0,r1,h,9).translate(0,y,0),(t,x,yy)=>t.set(k%2?'#c46a42':'#d98a5a').multiplyScalar(.82+.18*Math.sin(yy*60))));y+=h}
  parts.push(fin(blob(.15,1,.3,4,1,.45,1).translate(0,y+.02,0),solid(cc('#6a3a28'))));S.hoodoo=M(parts)}
 S.mound=fin(blob(.5,2,.15,9,1,.35,1),(t,x,y,z,nx,ny)=>t.copy(SNOW).multiplyScalar(.88+.12*ny));
 {const wall=cc('#6b4a32'),body=fin(new THREE.BoxGeometry(1,.55,.75).translate(0,.275,0),(t,x,y,z,nx,ny,nz)=>{t.copy(wall).multiplyScalar(.8+.2*Math.sin(y*80));if(Math.abs(nz)>.9&&Math.abs(x)<.3&&y>.15&&y<.4)t.set('#ffd9a0')});
  const roof=fin(new THREE.CylinderGeometry(.62,.62,1.15,3,1).rotateZ(Math.PI/2).rotateX(-Math.PI/2).scale(1,.55,1).translate(0,.72,0),(t,x,y,z,nx,ny)=>t.copy(ny>.3?SNOW:cc('#3a2a20')));
  S.cabin=M([body,roof,fin(new THREE.BoxGeometry(.1,.3,.1).translate(.3,.95,.12),solid(cc('#5c5c5c')))])}
 return S}
let SP=null;
// place props: rules(x,z,y,slope,dens,o,r) -> [kind, height] or null. Instances shuffled + chunked into 8 sectors so off-screen chunks cull.
export function buildProps(G,H,rules,n,seed,wl){SP=SP||species();const r=RNG(seed),I={},m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),s=new THREE.Vector3(),pp=new THREE.Vector3(),c=new THREE.Color();let k=0;
 for(let i=0;i<n*8&&k<n;i++){const x=(r()-.5)*2000,z=(r()-.5)*2000,o=offR(x,z);if(o<104)continue;const y=H(x,z);if(wl!=null&&y<wl+.8)continue;
  const sl=1-Math.abs(Math.cos(Math.atan(Math.hypot(H(x+2,z)-H(x-2,z),H(x,z+2)-H(x,z-2))/4))),d=fbm(x/90+11,z/90-4);
  const R=rules(x,z,y,sl,d,o,r);if(!R)continue;k++;const[kind,h,tint=1]=R,sx=h*(.85+.3*r()),sz=h*(.85+.3*r());
  e.set(kind.startsWith('rock')?r()*.5:(r()-.5)*.08,r()*6.3,(r()-.5)*.08);q.setFromEuler(e);m4.compose(pp.set(x,y-h*.03-.2,z),q,s.set(sx,h,sz));
  const sec=Math.floor((Math.atan2(z,x)+Math.PI)/(Math.PI/4))&7,key=kind+'|'+sec,v=.9+.2*r(),hu=(r()-.5)*.12*tint;
  c.setRGB(v*(1+hu),v,v*(1-hu));(I[key]||(I[key]=[])).push(m4.clone(),c.clone())}
 const mats={};for(const key in I){const kind=key.split('|')[0],L2=I[key],N=L2.length/2,ord=[...Array(N).keys()];for(let j=N-1;j>0;j--){const t=r()*(j+1)|0;[ord[j],ord[t]]=[ord[t],ord[j]]}
  const mat=mats[kind]||(mats[kind]=new THREE.MeshStandardMaterial({vertexColors:true,roughness:kind.startsWith('rock')||kind==='hoodoo'?.95:.82,flatShading:kind.startsWith('rock')||kind==='hoodoo'||kind==='cabin'}));
  const im=new THREE.InstancedMesh(SP[kind],mat,N);ord.forEach((o,j)=>{im.setMatrixAt(j,L2[2*o]);im.setColorAt(j,L2[2*o+1])});im.computeBoundingSphere();  // props stand outside the sun's shadow frustum (fitShadow 180 m around the pitch): no shadow passes or lookups
  im.userData={n:N,fix:kind==='hoodoo'||kind==='cabin'};G.add(im)}}

// ---------- stadium bowl around the arena: concourse, LED boards, two seating tiers with crowd, floodlights, light masts, screens, banners, plaza ----------
// BASE: the arena's rounded plan at offset 0 with outward normals; a point at offset o is base + n*o (lines and corner arcs alike)
const BASE=(()=>{const st=2,arc=32,pts=[],a=HW-RC,b=HL-RC;
 const line=(x0,z0,x1,z1,nx,nz)=>{const n=Math.max(1,Math.round(Math.hypot(x1-x0,z1-z0)/st));for(let i=0;i<n;i++){const t=i/n;pts.push([x0+(x1-x0)*t,z0+(z1-z0)*t,nx,nz])}};
 const arcF=(cx,cz,a0)=>{for(let i=0;i<arc;i++){const t=a0+i/arc*Math.PI/2,c=Math.cos(t),s=Math.sin(t);pts.push([cx+c*RC,cz+s*RC,c,s])}};
 line(HW,-b,HW,b,1,0);arcF(a,b,0);line(a,HL,-a,HL,0,1);arcF(-a,b,Math.PI/2);line(-HW,b,-HW,-b,-1,0);arcF(-a,-b,Math.PI);line(-a,-HL,a,-HL,0,-1);arcF(a,-b,Math.PI*1.5);return pts})();
// sweep a cross-section polyline [[offset,y],...] around the plan. Each profile segment gets its own vertices (crisp steps). o.seg(i,isTread) filters segments
function sweep(prof,o={}){const N=BASE.length,P=[],Nn=[],U=[],Cc=[],I=[],c3=new THREE.Color();let vA=0;
 for(let s=0;s<prof.length-1;s++){const[o0,y0]=prof[s],[o1,y1]=prof[s+1],dl=Math.hypot(o1-o0,y1-y0);if(dl<1e-6)continue;const tr=Math.abs(y1-y0)<1e-6;if(o.seg&&!o.seg(s,tr)){vA+=dl;continue}
  const ny=(o1-o0)/dl,nh=-(y1-y0)/dl,om=(o0+o1)/2,b0=P.length/3;let u=0;
  for(let i=0;i<=N;i++){const B=BASE[i%N];if(i){const A=BASE[i-1];u+=Math.hypot(B[0]-A[0]+(B[2]-A[2])*om,B[1]-A[1]+(B[3]-A[3])*om)}
   for(const[oo,y,v]of[[o0,y0,vA],[o1,y1,vA+dl]]){const x=B[0]+B[2]*oo,z=B[1]+B[3]*oo;P.push(x,y,z);Nn.push(B[2]*nh,ny,B[3]*nh);U.push(u/(o.us||1),v/(o.vs||1));if(o.col){o.col(c3,x,z,s,y,tr,u);Cc.push(c3.r,c3.g,c3.b)}}}
  for(let i=0;i<N;i++){const k=b0+i*2;if(o.skip){const B=BASE[i],x=B[0]+B[2]*om,z=B[1]+B[3]*om;if(o.skip(x,z))continue}I.push(k,k+2,k+1,k+1,k+2,k+3)}vA+=dl}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Nn,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
 if(Cc.length)g.setAttribute('color',new THREE.Float32BufferAttribute(Cc,3));g.setIndex(I);g.computeBoundingSphere();return g}
// walk along the plan at offset o every `step` metres: fn(x,z,nx,nz,u)
function walk(o,step,fn){const N=BASE.length;let acc=0,u=0;for(let i=0;i<N;i++){const A=BASE[i],B=BASE[(i+1)%N],ax=A[0]+A[2]*o,az=A[1]+A[3]*o,bx=B[0]+B[2]*o,bz=B[1]+B[3]*o,d=Math.hypot(bx-ax,bz-az);
 while(acc<d){const t=acc/d,nx=A[2]+(B[2]-A[2])*t,nz=A[3]+(B[3]-A[3])*t,l=Math.hypot(nx,nz);fn(ax+(bx-ax)*t,az+(bz-az)*t,nx/l,nz/l,u+acc);acc+=step}acc-=d;u+=d}}
const inPocket=(x,z)=>Math.abs(x)<GW/2+RM+2.5&&Math.abs(z)>HL-1;
const teamK=z=>cl(z/70,-1,1);  // +1 blue end (team 0, +z), -1 orange end
// LED board / ribbon texture, daylight version of the Neon Arena boards
function ribbonTex(h,txt){return tex(4096,h,(g,w,H)=>{const seg=w/8;g.fillStyle='#0b1020';g.fillRect(0,0,w,H);
 for(let i=0;i<8;i++){const x=i*seg,c=i%2?'#ff8a2a':'#3d95ff',gr=g.createLinearGradient(x,0,x+seg,0);gr.addColorStop(0,c);gr.addColorStop(.35,'rgba(20,30,60,.0)');g.fillStyle=gr;g.globalAlpha=.55;g.fillRect(x,0,seg,H);g.globalAlpha=1;
  g.fillStyle=c;g.fillRect(x,0,8,H);g.fillRect(x,H-H*.08,seg,H*.08);g.font=`italic 700 ${H*.56}px "Chakra Petch",sans-serif`;g.textBaseline='middle';g.fillStyle=i%4===1?'#ffd060':'#f2f6ff';g.fillText(txt[i%txt.length],x+H*.5,H*.52)}},true)}
function seatTex(){return tex(512,32,(g,w,h)=>{g.fillStyle='#8d9096';g.fillRect(0,0,w,h);const k=w/24;for(let x=1.6*k;x<w-6;x+=.5*k){g.fillStyle='#e9ecef';g.fillRect(x+1,3,.5*k-3,h-6);g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x+1,h-6,.5*k-3,3)}
 g.fillStyle='#b9bcc2';for(let y=0;y<h;y+=4)g.fillRect(0,y,1.6*k,2)},true)}
function panelTex(base,win,lit){return tex(256,256,(g,w,h)=>{g.fillStyle=base;g.fillRect(0,0,w,h);const r=RNG(5);for(let i=0;i<500;i++){g.fillStyle=`rgba(${r()<.5?'0,0,0':'255,255,255'},${r()*.05})`;g.fillRect(r()*w,r()*h,r()*40,r()*40)}
 g.fillStyle='rgba(0,0,0,.25)';for(let x=0;x<w;x+=32)g.fillRect(x,0,2,h);for(let y=0;y<h;y+=64)g.fillRect(0,y,w,3);
 for(let y=16;y<h;y+=64)for(let x=4;x<w;x+=32){g.fillStyle=r()<lit?'#ffd8a0':win;g.fillRect(x,y,24,22)}},true)}
function paveTex(base){return tex(256,256,(g,w,h)=>{g.fillStyle=base;g.fillRect(0,0,w,h);const r=RNG(9);for(let y=0;y<h;y+=32)for(let x=(y/32%2)*32;x<w+64;x+=64){g.fillStyle=`rgba(${r()<.5?'0,0,0':'255,255,255'},${.03+r()*.06})`;g.fillRect(x-62,y+1,62,30)}
 g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=2;for(let y=0;y<=h;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}for(let y=0;y<h;y+=32)for(let x=(y/32%2)*32;x<w;x+=64){g.beginPath();g.moveTo(x,y);g.lineTo(x,y+32);g.stroke()}},true)}
function screenTex(name){return tex(1024,400,(g,w,h)=>{const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'#123a7a');gr.addColorStop(.5,'#0a0f22');gr.addColorStop(1,'#7a3410');g.fillStyle=gr;g.fillRect(0,0,w,h);
 g.strokeStyle='rgba(255,255,255,.07)';for(let y=0;y<h;y+=4){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}g.textAlign='center';g.textBaseline='middle';
 g.font='italic 700 120px "Chakra Petch",sans-serif';g.textAlign='right';g.fillStyle='#3d95ff';g.fillText('DRONE',w/2-8,h*.4);g.textAlign='left';g.fillStyle='#ff8a2a';g.fillText('LEAGUE',w/2+8,h*.4);g.textAlign='center';
 g.font='600 54px "Chakra Petch",sans-serif';g.fillStyle='#e8eef8';g.fillText(name.toUpperCase()+'  STADIUM',w/2,h*.76);g.fillStyle='#3d95ff';g.fillRect(0,h-14,w/2,14);g.fillStyle='#ff8a2a';g.fillRect(w/2,h-14,w/2,14)})}
function bannerTex(){return tex(256,256,(g,w,h)=>{for(const t of[0,1]){const x=t*w/2,c=['#2d6fd8','#e8661a'][t],d=['#173c7a','#7a3108'][t];const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,c);gr.addColorStop(1,d);g.fillStyle=gr;g.fillRect(x,0,w/2,h);
 g.fillStyle='rgba(255,255,255,.9)';g.beginPath();g.moveTo(x,h);g.lineTo(x+w/4,h-34);g.lineTo(x+w/2,h);g.fill();g.fillStyle=c;g.beginPath();g.moveTo(x+6,h);g.lineTo(x+w/4,h-26);g.lineTo(x+w/2-6,h);g.fill();
 g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=5;g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i+Math.PI/6;g.lineTo(x+w/4+30*Math.cos(a),h*.36+30*Math.sin(a))}g.closePath();g.stroke();
 g.fillStyle='#fff';g.fillRect(x+w/4-3,h*.36-12,6,24);g.fillRect(x+w/4-14,h*.36-3,28,6);g.fillRect(x+10,8,w/2-20,5)}})}
export function buildStadium(G,st,name){const g=[];
 const std=(c,map,o={})=>new THREE.MeshStandardMaterial({color:c,map,roughness:.82,metalness:0,...o});
 // concourse + plaza (pave), barrier with a team-colour trim, LED boards behind the glass
 const pave=paveTex(st.pave);const con=new THREE.Mesh(sweep([[1,.03],[14,.03]],{us:6,vs:6,skip:inPocket}),std(0xffffff,pave,{roughness:.9}));con.receiveShadow=true;G.add(con);
 const plz=new THREE.Mesh(sweep([[66,.05],[104,.05]],{us:9,vs:9}),std(0xe8e8e8,pave,{roughness:.92}));plz.receiveShadow=true;G.add(plz);
 const cB=new THREE.Color(COL[0]),cO=new THREE.Color(COL[1]),cWt=new THREE.Color(0xdfe8f5),tc=(t,x,z)=>{const k=teamK(z);t.copy(cWt).lerp(k>0?cB:cO,Math.abs(k))};
 G.add(new THREE.Mesh(sweep([[14,0],[14,2.2]],{skip:inPocket}),std(st.conc)));
 G.add(new THREE.Mesh(sweep([[14,2.2],[14,2.6],[15,2.6]],{col:tc}),new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,color:new THREE.Color(1.15,1.15,1.15)})));
 const ad=ribbonTex(64,['DRONE LEAGUE','5" ACRO ONLY','BETAFLIGHT RATES','FLY FPV']);ad.repeat.set(1/360,1);G.userData.ads=ad;
 const adSkip=(x,z)=>Math.abs(x)<GW/2+RM+1&&Math.abs(z)>HL-RF-1;G.add(new THREE.Mesh(sweep([[.5,RF+.3],[.5,RF+3.1]],{skip:adSkip}),new THREE.MeshBasicMaterial({map:ad})),new THREE.Mesh(sweep([[.62,RF+3.1],[.62,RF+.3]],{skip:adSkip}),std(st.steel)));
 // seating bowl: lower tier 14 rows, walkway + LED ribbon fascia, upper tier 7 rows, back wall
 const prof=[[15,2.6]],rows=[];let o=15,y=2.6;for(let i=0;i<14;i++){rows.push([o+1.05,y]);prof.push([o+=1.9,y]);if(i<13)prof.push([o,y+=.95])}
 prof.push([o+=3,y]);const yF=y;prof.push([o,y+=4.6]);for(let i=0;i<7;i++){rows.push([o+.9,y]);prof.push([o+=1.6,y]);if(i<6)prof.push([o,y+=1.15])}const oB=o,yB=y;prof.push([o,y+=6]);prof.push([o+=2.2,y]);
 const seatC=(t,x,z,s,yy,tr)=>{const k=teamK(z);if(tr){t.set(st.seat).lerp(k>0?cB:cO,Math.abs(k)*.85)}else t.set(st.conc).multiplyScalar(.82)};
 const bowl=new THREE.Mesh(sweep(prof,{col:seatC,seg:(s,tr)=>tr&&s!==27&&s!==43,us:24}),std(0xffffff,seatTex(),{vertexColors:true}));
 const bowlC=new THREE.Mesh(sweep(prof,{col:seatC,seg:(s,tr)=>!(tr&&s!==27&&s!==43),us:8,vs:8}),std(st.conc,null,{vertexColors:true}));
 bowl.receiveShadow=bowlC.receiveShadow=bowlC.castShadow=true;G.add(bowl,bowlC);
 const rib=ribbonTex(96,['DRONE LEAGUE','GO BLUE','GO ORANGE',name.toUpperCase()]);rib.repeat.set(1/300,1);G.userData.rib=rib;
 const ribM=new THREE.MeshBasicMaterial({map:rib,color:0xdddddd});G.add(new THREE.Mesh(sweep([[oB-7*1.6-.08,yF+.4],[oB-7*1.6-.08,yF+4.4]]),ribM),new THREE.Mesh(sweep([[oB-.08,yB+1.6],[oB-.08,yB+5.4]]),ribM));
 const fac=new THREE.Mesh(sweep([[o,y],[o,0]],{us:16,vs:y}),std(0xffffff,panelTex(st.facade,st.win,st.lit)));fac.castShadow=fac.receiveShadow=true;G.add(fac);
 // no roof (the menu orbit camera passes over the bowl at 35-55 m): a floodlight row on the back wall cap, banners on the back wall
 const top=y,lampN=[];walk(oB+1,9,(x,z,nx,nz)=>lampN.push([x,top+.8,z,nx,nz]));
 const lm=new THREE.InstancedMesh(new THREE.BoxGeometry(2.4,1.2,.5),glow(st.lampC,st.lamp),lampN.length),M4=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),V=new THREE.Vector3(),Sv=new THREE.Vector3(1,1,1);
 lampN.forEach(([x,y,z,nx,nz],i)=>{E.set(-.6,Math.atan2(nx,nz),0,'YXZ');M4.compose(V.set(x,y,z),Q.setFromEuler(E),Sv);lm.setMatrixAt(i,M4)});G.add(lm);
 {const bt=bannerTex(),P=[],Uv=[];walk(oB-.3,7,(x,z,nx,nz,u)=>{if(Math.round(u/7)%4)return;const t=teamK(z)>0?0:1,tx=-nz*2,tz=nx*2,y1=top+.4,y0=yB+.2;
   P.push(x-tx,y0,z-tz,x+tx,y0,z+tz,x+tx,y1,z+tz,x-tx,y0,z-tz,x+tx,y1,z+tz,x-tx,y1,z-tz);const a=t*.5,b=a+.5;Uv.push(a,0,b,0,b,1,a,0,b,1,a,1)});
  const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(P,3));bg.setAttribute('uv',new THREE.Float32BufferAttribute(Uv,2));bg.computeVertexNormals();
  G.add(new THREE.Mesh(bg,std(0xffffff,bt,{side:THREE.DoubleSide,emissive:0xffffff,emissiveMap:bt,emissiveIntensity:.18})))}
 // crowd: one box per occupied seat (team shirts toward each end), shuffled so lower quality thins it evenly
 {const r=RNG(77),pal=['#d9dde3','#2a2f38','#c33c3c','#e8c25a','#4f8a4f','#7a5a9a','#e0e0e0','#334a6a'].map(cc),L2=[];const c=new THREE.Color();
  for(const[ro,ry]of rows)walk(ro,1.02,(x,z,nx,nz,u)=>{if(u%24<1.8||r()<.13)return;const k=teamK(z),h=.95+r()*.35;
   if(r()<.5*(.3+.7*Math.abs(k)))c.copy(k>0?cB:cO).multiplyScalar(.75+.4*r());else c.copy(pal[r()*pal.length|0]).multiplyScalar(.7+.5*r());
   E.set(0,Math.atan2(nx,nz),0);M4.compose(V.set(x,ry,z),Q.setFromEuler(E),Sv.set(.56,h,.42));L2.push(M4.clone(),c.clone())});
  const N=L2.length/2,ord=[...Array(N).keys()];for(let j=N-1;j>0;j--){const t=r()*(j+1)|0;[ord[j],ord[t]]=[ord[t],ord[j]]}
  const cr=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1).translate(0,.5,0),new THREE.MeshLambertMaterial(),N);ord.forEach((o2,j)=>{cr.setMatrixAt(j,L2[2*o2]);cr.setColorAt(j,L2[2*o2+1])});cr.userData={n:N,qf:{high:1,med:.8,low:.5}};cr.receiveShadow=true;G.add(cr)}
 // corner light masts (lattice-ish: tapered mast, cross arms, lamp grid facing the centre)
 {const mast=mergeGeometries([cyl(1.6,.9,100,10),...[30,55,80].map(h=>new THREE.CylinderGeometry(2.4,2.4,.8,10).translate(0,h,0))]),mm=std(st.steel,null,{metalness:.55,roughness:.45}),frame=new THREE.BoxGeometry(20,13,1.4),lamp=new THREE.BoxGeometry(2.6,2,.4);
  const lg=[];for(let i=0;i<6;i++)for(let j=0;j<4;j++)lg.push(lamp.clone().translate(-7.5+i*3,-4.5+j*3,-.9));const lgm=mergeGeometries(lg),lmat=glow(st.lampC,st.lamp*1.1);
  for(const[sx,sz]of[[1,1],[-1,1],[1,-1],[-1,-1]]){const cx=sx*(HW-RC+(RC+o+16)*.7071),cz=sz*(HL-RC+(RC+o+16)*.7071),m=new THREE.Mesh(mast,mm);m.position.set(cx,0,cz);m.castShadow=true;G.add(m);
   const hd=new THREE.Group();hd.position.set(cx,104,cz);hd.lookAt(0,10,0);hd.rotateY(Math.PI);const f=new THREE.Mesh(frame,mm);hd.add(f,new THREE.Mesh(lgm,lmat));G.add(hd)}}
 // big screens high above each end (over the menu camera's path), on legs from the back wall
 {const sm2=std(st.steel,null,{metalness:.5,roughness:.5}),stx=screenTex(name);for(const t of[0,1]){const s=t?-1:1,z=s*(HL+oB+1),grp=new THREE.Group();grp.position.set(0,80,z);if(!t)grp.rotation.y=Math.PI;
   const box=new THREE.Mesh(new THREE.BoxGeometry(54,22,3),sm2);const face=new THREE.Mesh(new THREE.PlaneGeometry(50,19.5),new THREE.MeshBasicMaterial({map:stx,color:0xe8e8e8}));face.position.z=1.55;
   const trim=new THREE.Mesh(new THREE.BoxGeometry(54.2,1,3.2),glow(COL[t],1.3));trim.position.y=-11.3;grp.add(box,face,trim);
   for(const lx of[-18,18]){const lh=80-11-top,leg=new THREE.Mesh(new THREE.BoxGeometry(1.4,lh,1.4),sm2);leg.position.set(lx,-11-lh/2,0);grp.add(leg)}G.add(grp)}}
 // plaza lamp posts (hidden on Low)
 {const pts=[];walk(98,30,(x,z)=>pts.push([x,z]));const pg=mergeGeometries([cyl(.25,.18,9,6),new THREE.BoxGeometry(1.6,.4,.6).translate(0,9,0)]),pm=new THREE.InstancedMesh(pg,std(st.steel),pts.length);
  pts.forEach(([x,z],i)=>pm.setMatrixAt(i,M4.makeTranslation(x,0,z)));pm.userData={hi:1};G.add(pm)}
 return{top,back:o}}
