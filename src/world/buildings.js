// ---------- Highlands buildings: farmsteads (house, a barn you can fly through, silo), a ruined church, watchtowers ----------
// Code-built from parts. Each part is drawn AND solid (sdBld for the SDF the bots and effects read, bldColliders for Rapier) unless it
// is a flush detail (dec: windows, door boards). Parts are in the building's frame: x along its length, y up from the floor (y = 0),
// rotated by yaw (THREE's rotation about +y) and stood on a stone plinth that reaches below the lowest ground under it.
//  part {s, p, h, r?, c, m, dec?}
//   s 'box' p = centre, h = half extents, r = Euler [x,y,z] (optional) | 'prism' gable roof along x: p = base centre, h = [hx, rise, hz]
//     (a prism's gc, gm: colour and pattern of its gable ends)
//     'pyr' pyramid roof: p = base centre, h = [hx, rise, hz] | 'cyl' p = base centre, h = [r, height] | 'dome' sphere: p = centre, h = [r]
//   c colour, m surface pattern (0 plaster, 1 planks, 2 stone, 3 roof tiles, 4 corrugated metal, 5 banded metal)
import * as THREE from 'three';
import {detTex} from './outdoor.js';
import {dfH} from './terrain.js';

const B=(p,h,c,m,o)=>({s:'box',p,h,c,m,...o}),dec={dec:1};
function house(){const W='#e6dece',R='#7c3528',D='#252b33',Sh='#405c3c',P=[B([0,3.25,0],[6.5,3.25,4],W,0),{s:'prism',p:[0,6.5,0],h:[7.1,4,4.7],c:R,m:3,gc:W,gm:0},B([3.6,8.6,0],[.6,2.6,.6],'#8a4a3a',2)];
 for(const z of[-1,1])for(const x of[-4.5,-1.5,1.5,4.5])for(const y of[1.8,4.7]){if(z>0&&y<3&&x===1.5){P.push(B([x,1.15,z*4.03],[.65,1.15,.05],'#5a3a26',1,dec));continue}
  P.push(B([x,y,z*4.03],[.5,.6,.04],D,0,dec),B([x-.78,y,z*4.05],[.22,.62,.04],Sh,1,dec),B([x+.78,y,z*4.05],[.22,.62,.04],Sh,1,dec))}
 for(const x of[-1,1])P.push(B([x*6.53,4.7,0],[.04,.6,.5],D,0,dec));return P}
// open at both gable ends: a 6.7 m x 11 m doorway straight through
function barn(){const R='#912f22',T='#ece6da',P=[{s:'prism',p:[0,7.2,0],h:[11.6,6,7.2],c:'#57534e',m:4,gc:R,gm:1},B([0,.03,0],[10.8,.04,5.6],'#7d6748',1,dec)];
 for(const z of[-1,1]){P.push(B([0,3.6,z*6.1],[11,3.6,.45],R,1),B([11.05,3.6,z*6.1],[.2,3.6,.62],T,0),B([-11.05,3.6,z*6.1],[.2,3.6,.62],T,0));
  const f=z*6.58;P.push(B([0,5.5,f],[3.1,.15,.04],T,0,dec),B([-3,2.75,f],[.15,2.75,.04],T,0,dec),B([3,2.75,f],[.15,2.75,.04],T,0,dec),B([0,2.75,f],[4.05,.13,.04],T,0,{dec:1,r:[0,0,.742]}),B([0,2.75,f],[4.05,.13,.04],T,0,{dec:1,r:[0,0,-.742]}))}
 for(const x of[-1,1])P.push(B([x*11.05,7,0],[.2,.25,5.7],T,0),B([x*11.62,9.6,0],[.04,1.1,1.1],'#2a2420',1,dec));return P}
const silo=()=>[{s:'cyl',p:[0,-3,0],h:[3.2,19],c:'#b9bdc1',m:5},{s:'dome',p:[0,16,0],h:[3.2],c:'#8f959b',m:5}];
// timber legs braced on two faces (fly through it along x), a lookout cabin on top
function tower(){const Wd='#5e4632',P=[],H=17,a=2.6,ang=Math.atan2(8,2*a),L=Math.hypot(8,2*a)/2;
 for(const x of[-1,1])for(const z of[-1,1])P.push(B([x*a,(H-3)/2,z*a],[.3,(H+3)/2,.3],Wd,1));
 for(const z of[-1,1])for(const y of[4.5,12.5])for(const s of[-1,1])P.push(B([0,y,z*a],[L,.11,.11],Wd,1,{r:[0,0,s*ang]}));
 P.push(B([0,H,0],[3.4,.25,3.4],Wd,1),B([0,H+1.7,0],[2.9,1.45,2.9],'#6e5440',1),{s:'pyr',p:[0,H+3.15,0],h:[3.7,2.6,3.7],c:'#3b3632',m:3});
 for(const s of[-1,1])P.push(B([0,H+2.2,s*2.92],[2.2,.45,.04],'#22262b',0,dec),B([s*2.92,H+2.2,0],[.04,.45,2.2],'#22262b',0,dec));return P}
// a roofless nave with broken walls (a breach on one side, one rafter left) and a bell tower with a slate spire: the landmark on the high ground
function church(){const St='#a8a092',D='#24272b',P=[B([-12.5,12,0],[3.5,12,3.5],St,2),{s:'pyr',p:[-12.5,24,0],h:[3.9,9,3.9],c:'#4a4f57',m:3}];
 for(const s of[-1,1])P.push(B([-12.5,20,s*3.52],[.8,1.6,.04],D,0,dec),B([-12.5+s*3.52,20,0],[.04,1.6,.8],D,0,dec));P.push(B([-16.02,2.3,0],[.04,2.3,1.2],D,0,dec));
 const H1=[10,7.5,9,4.5],H2=[10,9,1.2,6];
 for(let i=0;i<4;i++){const x=-9+5.5*i+2.75;for(const[z,Hs]of[[6,H1],[-6,H2]]){const h=Hs[i];P.push(B([x,h/2,z],[2.75,h/2,.6],St,2));if(h>7)P.push(B([x,5.5,z+Math.sign(z)*.62],[.7,2,.04],D,0,dec))}}
 P.push(B([13.6,4.5,0],[.6,4.5,6.6],St,2),B([14.22,5,0],[.04,2.6,.9],D,0,dec),B([-7,9.6,0],[.25,.3,5.4],'#4a3a2c',1));
 P.push(B([1.5,.8,-3.6],[1.2,.8,.9],St,2,{r:[0,.4,.15]}),B([3.8,.6,-4.6],[.9,.6,.8],St,2,{r:[.2,1.1,0]}),B([-.6,.5,-4.8],[.8,.5,.6],St,2,{r:[0,-.3,.2]}));return P}
const KIND={house,barn,silo,tower,church};

// part geometry in its own frame (non-indexed, flat normals except round parts)
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_v=new THREE.Vector3(),_s=new THREE.Vector3(1,1,1);
function tris(V,T){const p=[];for(const t of T)for(const i of t)p.push(...V[i]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g}
function partGeo(q){const[a,b,c]=q.h;
 if(q.s==='box')return new THREE.BoxGeometry(a*2,b*2,c*2).toNonIndexed();
 if(q.s==='prism')return tris([[-a,0,-c],[a,0,-c],[a,0,c],[-a,0,c],[-a,b,0],[a,b,0]],[[0,4,1],[1,4,5],[3,2,5],[3,5,4],[0,3,4],[1,5,2],[0,1,2],[0,2,3]]);
 if(q.s==='pyr')return tris([[-a,0,-c],[a,0,-c],[a,0,c],[-a,0,c],[0,b,0]],[[0,4,1],[1,4,2],[2,4,3],[3,4,0],[0,1,2],[0,2,3]]);
 if(q.s==='cyl')return new THREE.CylinderGeometry(a,a,b,20,1).translate(0,b/2,0).toNonIndexed();
 return new THREE.SphereGeometry(a,20,6,0,Math.PI*2,0,Math.PI/2).toNonIndexed()}
// part -> building frame
const partM=q=>_m.compose(_v.fromArray(q.p),_q.setFromEuler(_e.set(...(q.r||[0,0,0]))),_s.set(1,1,1));
const bldM=(o,M=new THREE.Matrix4())=>M.makeRotationY(o.yaw).setPosition(o.x,o.y,o.z);

/** a building of kind k at (x, z) turned by yaw: its floor sits on the highest ground under it, the plinth reaches 1.5 m under the lowest.
 *  Returns the obstacle {t:'bld', k, x, y, z, yaw, parts, rb (footprint radius), br (bounding radius round (0, cy, 0)), cy, slope (ground rise over the footprint)} */
export function building(k,x,z,yaw){const P=KIND[k]();let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,ax=0,az=0,y1=0;
 for(const q of P){const[a,b,c]=q.h,rr=q.r?Math.hypot(a,b,c):0,rx=rr||a,rz=rr||(q.s==='cyl'||q.s==='dome'?a:c);ax=Math.max(ax,Math.abs(q.p[0])+rx);az=Math.max(az,Math.abs(q.p[2])+rz);y1=Math.max(y1,q.p[1]+(q.s==='dome'?a:b));
  if(!q.r&&q.p[1]-(q.s==='box'?b:0)<.5){x0=Math.min(x0,q.p[0]-rx);x1=Math.max(x1,q.p[0]+rx);z0=Math.min(z0,q.p[2]-rz);z1=Math.max(z1,q.p[2]+rz)}}  // footprint: the parts standing on the floor
 const c=Math.cos(yaw),s=Math.sin(yaw);let g0=1e9,g1=-1e9;
 for(let i=0;i<=4;i++)for(let j=0;j<=4;j++){const lx=x0+(x1-x0)*i/4,lz=z0+(z1-z0)*j/4,h=dfH(x+c*lx+s*lz,z-s*lx+c*lz);g0=Math.min(g0,h);g1=Math.max(g1,h)}
 const legs=k==='tower'||k==='silo',flr=legs?g0:g1+.15,dep=legs?3:flr-g0+1.5;  // the tower's legs and the silo stand on the lowest ground and reach 3 m into it
 if(!legs)P.push(B([(x0+x1)/2,-dep/2,(z0+z1)/2],[(x1-x0)/2+.4,dep/2,(z1-z0)/2+.4],'#857c6c',2));
 ax=Math.max(ax,Math.abs(x0)+.4,Math.abs(x1)+.4);az=Math.max(az,Math.abs(z0)+.4,Math.abs(z1)+.4);
 return{t:'bld',k,x,y:flr,z,yaw,parts:P,rb:Math.hypot(ax,az),br:Math.hypot(ax,az,(y1+dep)/2),cy:(y1-dep)/2,slope:g1-g0}}

// ---------- SDF (exact for boxes, cylinders and spheres; roofs: the max of their planes, which never overestimates) ----------
const sdBox=(x,y,z,hx,hy,hz)=>{const qx=Math.abs(x)-hx,qy=Math.abs(y)-hy,qz=Math.abs(z)-hz;return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)};
function partInv(q){if(q.mi)return q.mi;const e=partM(q).elements;return q.mi=[e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]]}  // rotation part; its transpose is the inverse
/** distance from world-relative point (lx = x - o.x, y, lz = z - o.z) to building o (capped: beyond 10 m from its bounding sphere it returns that distance) */
export function sdBld(o,lx,y,lz){const yy=y-o.y,r=Math.hypot(lx,yy-o.cy,lz)-o.br;if(r>10)return r;const c=Math.cos(o.yaw),s=Math.sin(o.yaw),bx=c*lx-s*lz,bz=s*lx+c*lz;let m=1e9;
 for(const q of o.parts){if(q.dec)continue;let x=bx-q.p[0],y2=yy-q.p[1],z=bz-q.p[2],d;const[a,b,h]=q.h;
  if(q.s==='box'){if(q.r){const R=partInv(q),u=R[0]*x+R[1]*y2+R[2]*z,v=R[3]*x+R[4]*y2+R[5]*z,w=R[6]*x+R[7]*y2+R[8]*z;x=u;y2=v;z=w}d=sdBox(x,y2,z,a,b,h)}
  else if(q.s==='prism')d=Math.max(Math.abs(x)-a,-y2,(Math.abs(z)*b+y2*h-b*h)/Math.hypot(b,h));
  else if(q.s==='pyr')d=Math.max(-y2,(Math.abs(x)*b+y2*a-a*b)/Math.hypot(a,b),(Math.abs(z)*b+y2*h-b*h)/Math.hypot(b,h));
  else if(q.s==='cyl'){const dx=Math.hypot(x,z)-a,dy=Math.abs(y2-b/2)-b/2;d=Math.min(Math.max(dx,dy),0)+Math.hypot(Math.max(dx,0),Math.max(dy,0))}
  else d=Math.hypot(x,y2,z)-a;if(d<m)m=d}return m}

// ---------- Rapier colliders (physics/world.js buildDF shapes): one per solid part ----------
export function bldColliders(o){const W=bldM(o),wq=new THREE.Quaternion().setFromRotationMatrix(W),out=[],M=new THREE.Matrix4(),pq=new THREE.Quaternion(),c=new THREE.Vector3();
 for(const q of o.parts){if(q.dec)continue;const[a,b,h]=q.h;
  if(q.s==='box'){M.multiplyMatrices(W,partM(q));c.setFromMatrixPosition(M);pq.setFromRotationMatrix(M);out.push({s:'box',h:[a,b,h],p:c.toArray(),q:[pq.x,pq.y,pq.z,pq.w]})}
  else if(q.s==='cyl'){c.set(q.p[0],q.p[1]+b/2,q.p[2]).applyMatrix4(W);out.push({s:'cyl',hh:b/2,r:a,p:c.toArray()})}
  else if(q.s==='dome'){c.fromArray(q.p).applyMatrix4(W);out.push({s:'cap',hh:.001,r:a,p:c.toArray()})}
  else{c.fromArray(q.p).applyMatrix4(W);const V=q.s==='prism'?[[-a,0,-h],[a,0,-h],[a,0,h],[-a,0,h],[-a,b,0],[a,b,0]]:[[-a,0,-h],[a,0,-h],[a,0,h],[-a,0,h],[0,b,0]];
   out.push({s:'hull',pts:V.flatMap(v=>_v.fromArray(v).applyQuaternion(wq).toArray()),p:c.toArray()})}}return out}

// ---------- drawing: all parts of a group of buildings merged into one vertex-coloured mesh; the material adds the surface pattern ----------
let MAT=null;
function bldMat(){if(MAT)return MAT;const m=MAT=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0}),td=detTex();
 m.onBeforeCompile=s=>{s.uniforms.tDet={value:td};
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float aK;varying float vK;varying vec3 vWP,vWN;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvK=aK;vWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D tDet;varying float vK;varying vec3 vWP,vWN;\nfloat bh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}')
   .replace('#include <map_fragment>',`#include <map_fragment>
 {vec3 n=normalize(vWN);vec2 t=normalize(vec2(-n.z,n.x)+vec2(1e-4,0.)),u=abs(n.y)>.86?vWP.xz:vec2(dot(vWP.xz,t),vWP.y);
  float g=texture2D(tDet,u*.13).r,f=.88+.24*g,fd=1.-smoothstep(45.,170.,length(vViewPosition)),k=vK;
  if(k>.5&&k<1.5){float b=u.x/.45,s=fract(b);f*=mix(1.,.62+.38*smoothstep(0.,.07,s)*smoothstep(1.,.93,s),fd)*(.9+.18*bh(vec2(floor(b),3.)));}
  else if(k>1.5&&k<2.5){float r=floor(u.y/.55),b=u.x/1.15+.5*mod(r,2.),e=min(min(fract(u.y/.55),1.-fract(u.y/.55))*.55,min(fract(b),1.-fract(b))*1.15);f*=mix(1.,.62+.38*smoothstep(.015,.06,e),fd)*(.86+.26*bh(vec2(floor(b),r)));}
  else if(k>2.5&&k<3.5){float r=floor(u.y/.32),s=fract(u.y/.32),b=fract(u.x/.42+.5*mod(r,2.));f*=mix(1.,(.66+.34*smoothstep(0.,.4,s))*(.75+.25*smoothstep(0.,.06,b)*smoothstep(1.,.94,b)),fd)*(.9+.16*bh(vec2(floor(u.x/.42+.5*mod(r,2.)),r)));}
  else if(k>3.5&&k<4.5){f*=mix(1.,.8+.2*(.5+.5*sin(u.x*10.5)),fd);}
  else if(k>4.5){float s=fract(u.y/2.4);f*=mix(1.,.86+.14*(.5+.5*sin(u.y*9.))-.25*(1.-smoothstep(0.,.04,min(s,1.-s))),fd);}
  diffuseColor.rgb*=f;}`)};
 m.customProgramCacheKey=()=>'bld1';return m}
/** one mesh for a list of buildings (a farmstead, the church, a tower): parts placed, coloured (a touch of per-part variation), pattern id per vertex */
export function bldMesh(list){const P=[],N=[],C=[],K=[],M=new THREE.Matrix4(),W=new THREE.Matrix4(),col=new THREE.Color(),hs=t=>{const v=Math.sin(t)*43758.5453;return v-Math.floor(v)};let seed=1;
 for(const o of list){bldM(o,W);for(const q of o.parts){const g=partGeo(q),gn=q.gc?g.attributes.normal.clone():null;M.multiplyMatrices(W,partM(q));g.applyMatrix4(M);
  const p=g.attributes.position,n=g.attributes.normal,v=q.dec?1:.93+.14*hs(seed++*91.7+o.x*.13),c1=col.set(q.c).multiplyScalar(v).clone(),c2=col.set(q.gc||q.c).multiplyScalar(v).clone();
  for(let i=0;i<p.count;i++){const gab=gn&&Math.abs(gn.getX(i))>.9,c=gab?c2:c1;P.push(p.getX(i),p.getY(i),p.getZ(i));N.push(n.getX(i),n.getY(i),n.getZ(i));C.push(c.r,c.g,c.b);K.push(gab?q.gm:q.m)}}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));g.setAttribute('aK',new THREE.Float32BufferAttribute(K,1));g.computeBoundingSphere();
 const m=new THREE.Mesh(g,bldMat());m.castShadow=m.receiveShadow=true;return m}
