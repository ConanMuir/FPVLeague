// ---------- dogfight mode: guns, obstacles, ground turrets, dogfighting bots (same flight model and arena) ----------
// Highlands map: terrain, obstacles and their SDF, spawn slots, look; meshes built by buildDF() on first use
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {COL,QT,UP,V3,cl} from '../config/constants.js';
import {hyp2,hyp3} from '../core/hypot.js';
import {dot} from '../render/particles.js';
import {glow,scene,sun} from '../render/renderer.js';
import {LOOKS,skyTex} from './maps.js';
import {fbm,hash2,sm,vnoise} from './noise.js';
import {propGeo} from './outdoor.js';
import {bldColliders,bldMesh,building,sdBld} from './buildings.js';
import {CANY,DBASE,DCEIL,DHL,DHW,DLEN,DW,PADS,cxR,dfGrid,dfH,dfHt} from './terrain.js';
import {CAVE,SEAM,buildCaves,clipIndexed,inCave,sdCave} from './caves.js';
export {CAVE,inCave,sdCave};
export const dfG=new THREE.Group();dfG.visible=false;scene.add(dfG);
export const seeded=s=>()=>(s=s*16807%2147483647)/2147483647;
// Highlands: the dogfight map. 1.1 x 1.4 km of hills, a river canyon and mountain walls, with mesas, spire fields, hangars you can fly through, bridges, rock arches and forests for cover.
// Everything is seeded and point-mirrored through the centre, so every client builds the same map and both teams get the same lines.
export {CANY,DBASE,DCEIL,DHL,DHW,DLEN,DW,cxR,dfGrid,dfH,dfHt} from './terrain.js';
export const OBS=[],OGRID=new Map(),OC=40;
// tree species (geometry: world/outdoor.js props, scaled s = h*w across): trunk radius tr*s up to th*h, crown a cone [base, top (x h), radius (x s)] or a capsule [centre, half length (x h), radius (x s)]; slightly inside the drawn foliage
const TREE={pine:{w:.75,tr:.045,th:.3,cone:[.16,.96,.3]},snowpine:{w:.75,tr:.045,th:.3,cone:[.16,.96,.3]},oak:{w:1,tr:.07,th:.5,cap:[.68,.05,.3]},birch:{w:.9,tr:.04,th:.55,cap:[.74,.1,.17]},poplar:{w:1,tr:.04,th:.3,cap:[.62,.36,.14]}};
// a tree at (x, z): species k, or from a hash of the place (so the seeded layout is unchanged), broadleaf toward a forest's edge (e: 0 centre .. 1 edge) and low down
function tree(x,z,h,e,k){const y0=dfH(x,z)-.5;if(!k){const u=hash2(x*.71+3.1,z*.53-1.7),v=hash2(z*.37-5.3,x*.61+2.2);
  k=u<.12+.5*e*e+(y0<40?.15:0)?(v<.5?'oak':v<.8?'birch':'poplar'):y0>120?'snowpine':'pine';h*=k==='oak'?.72:k==='birch'?.78:k==='poplar'?.9:1}
 const T=TREE[k],s=h*T.w,cr=(T.cone?T.cone[2]:T.cap[2])*s;return{t:'tree',k,x,y0,z,h,s,tr:Math.max(.4,T.tr*s),cr,rb:cr}}
{const rnd=seeded(21),R=(a,b)=>a+rnd()*(b-a),placed=[];
 const free=(x,z,r,canyon)=>Math.abs(x)<DHW-200&&Math.abs(z)<DHL-200&&Math.hypot(x,Math.abs(z)-DBASE)>130+r&&(canyon||Math.abs(x-cxR(z))>r+40)&&placed.every(p=>Math.hypot(p[0]-x,p[1]-z)>p[2]+r+14&&Math.hypot(p[0]+x,p[1]+z)>p[2]+r+14);
 const spot=(r,canyon,tries=80)=>{for(let i=0;i<tries;i++){const x=R(-DHW+200,DHW-200),z=R(0,DHL-200);if(free(x,z,r,canyon))return[x,z]}return null};
 const gmin=(x,z,r)=>Math.min(dfH(x,z),dfH(x+r,z),dfH(x-r,z),dfH(x,z+r),dfH(x,z-r));
 const clear=(x,z,r)=>{const h=dfH(x,z);return sdCave(x,h-3,z)>r+10&&sdCave(x,h+12,z)>r+10};  // nothing stands in a cave mouth
 const add=(o,big=true)=>{if(!clear(o.x,o.z,o.rb||4))return;if(big)placed.push([o.x,o.z,o.rb]);OBS.push(o,{...o,x:-o.x,z:-o.z,mir:1,...(o.yaw!=null&&{yaw:o.yaw+Math.PI})})};  // the mirror image: turned half round
 for(let k=0;k<7;k++){const c=spot(55);if(!c)continue;placed.push([c[0],c[1],55]);for(let i=0;i<34;i++){const a=rnd()*6.3,d=Math.sqrt(rnd())*55,x=c[0]+Math.cos(a)*d,z=c[1]+Math.sin(a)*d,h=R(14,26);
  if(Math.abs(x-cxR(z))<40)continue;add(tree(x,z,h,d/55),false)}}  // forests: mostly pines, broadleaf round the edges
 for(let i=0;i<13;i++){const r=R(14,36),s=spot(r);if(!s)continue;const y0=gmin(s[0],s[1],r)-6;add({t:'cyl',x:s[0],z:s[1],r,y0,y1:y0+R(90,330),rb:r})}  // mesas
 for(let k=0;k<2;k++){const c=spot(70);if(!c)continue;placed.push([c[0],c[1],70]);for(let i=0;i<9;i++){const x=c[0]+R(-60,60),z=c[1]+R(-60,60),r=R(3.5,8),y0=gmin(x,z,r)-3;const o={t:'cyl',x,z,r,y0,y1:y0+R(55,180),rb:r};if(clear(x,z,r))OBS.push(o,{...o,x:-x,z:-z,mir:1})}}  // spire fields
 for(let i=0;i<5;i++){const s=spot(34);if(!s)continue;const ax=rnd()<.5,hx=ax?30:14,hz=ax?14:30,hy=10,g=gmin(s[0],s[1],20),y=g+hy-1.5;add({t:'hang',x:s[0],y,z:s[1],hx,hy,hz,ix:ax?hx+2:hx-1.5,iy:hy-1.5,iz:ax?hz-1.5:hz+2,rb:34})}  // hangars, open at both ends
 for(let i=0;i<7;i++){const w=R(5,9),s=spot(w*1.5);if(!s)continue;const hy=R(20,65),g=gmin(s[0],s[1],w);add({t:'box',x:s[0],y:g+hy-2,z:s[1],hx:w,hy,hz:w,rb:w*1.5})}  // ruined towers
 for(const z of[90,330]){const x=cxR(z);add({t:'box',x,y:-6,z,hx:70,hy:2.2,hz:7,rb:0},false)}  // bridges over the canyon
 for(let i=0;i<5;i++){const s=spot(30,true);if(!s)continue;add({t:'ring',x:s[0],y:dfH(s[0],s[1])-4,z:s[1],R:R(22,30),r:4.5,ax:rnd()<.5,rb:32})}  // rock arches
 for(let i=0;i<40;i++){const r=R(3,9),s=spot(r,true,20);if(!s)continue;add({t:'rock',x:s[0],y:dfH(s[0],s[1])+r*.25,z:s[1],r,rb:r},false)}
 // landmarks (world/buildings.js), few and far apart: farmsteads (house, a barn open at both ends, a silo, a row of poplars and an oak) and a ruined church, each on a
 // levelled yard (terrain.js PADS: r flat, blending back over b), and watchtowers on hilltops. Clear of the canyon, the caves, the bases and everything placed above
 // (and their mirror images); boulders in a yard are cleared and the trees and boulders round it re-seated on the new ground
 const rough=(x,z,r)=>{let a=1e9,b=-1e9;for(let i=0;i<9;i++){const h=dfH(x+(i%3-1)*r,z+((i/3|0)-1)*r);a=Math.min(a,h);b=Math.max(b,h)}return b-a};
 const roomy=(x,z,r,b)=>OBS.every(o=>o.t==='rock'||Math.hypot(o.x-x,o.z-z)>r+(o.t==='tree'?0:b)+(o.rb||o.r||0)+3);
 const LP=[],lfree=(x,z,r)=>Math.hypot(x,z)>r+5&&Math.hypot(x,Math.abs(z)-DBASE)>130+r&&Math.abs(x-cxR(z))>r+30&&LP.every(p=>Math.hypot(p[0]-x,p[1]-z)>p[2]+r+10&&Math.hypot(p[0]+x,p[1]+z)>p[2]+r+10);
 const site=(r,b,ok,n,best,sp=0)=>{let c0=null,bs=-1e9;for(let i=0;i<n;i++){const x=R(-DHW+200,DHW-200),z=R(0,DHL-200);if(!lfree(x,z,r+b)||!clear(x,z,r+b)||!ok(x,z)||!roomy(x,z,r,b))continue;
  const sc=best?best(x,z):0;if(!c0||sc>bs){c0=[x,z];bs=sc}if(!best)break}if(c0)LP.push([...c0,r+b+sp]);return c0};  // sp: extra room kept round it for later landmarks
 const level=(x,z,r,b)=>{let y=0;for(let i=0;i<9;i++)y+=dfH(x+(i%3-1)*r*.7,z+((i/3|0)-1)*r*.7)/9;PADS.push({x,z,r,b,y,k:.8},{x:-x,z:-z,r,b,y,k:.8});
  for(let i=OBS.length-1;i>=0;i--){const o=OBS[i],d=Math.min(Math.hypot(o.x-x,o.z-z),Math.hypot(o.x+x,o.z+z));if(d>r+b+(o.rb||0))continue;
   if(o.t==='rock'&&d<r+o.r+4)OBS.splice(i,1);else if(o.t==='rock')o.y=dfH(o.x,o.z)+o.r*.25;else if(o.t==='tree')o.y0=dfH(o.x,o.z)-.5}};
 const put=(L,g)=>{if(!L.every(o=>clear(o.x,o.z,o.rb)))return;for(const o of L)if(o.t==='bld'){o.g=g;OBS.push(o,{...o,x:-o.x,z:-o.z,yaw:o.yaw+Math.PI,mir:1,g:g+'m'});
   for(let i=OBS.length-1;i>=0;i--){const b=OBS[i];if(b.t==='rock'&&Math.min(Math.hypot(b.x-o.x,b.z-o.z),Math.hypot(b.x+o.x,b.z+o.z))<o.rb+b.r+3)OBS.splice(i,1)}}else add(o,false)};  // g: drawn as one mesh; boulders under it go
 for(let k=0;k<2;k++){const s=site(22,10,(x,z)=>rough(x,z,15)<22&&dfH(x,z)<110,400,(x,z)=>-rough(x,z,15));if(!s)continue;level(s[0],s[1],22,10);
  const fy=rnd()*6.3,c=Math.cos(fy),n=Math.sin(fy),at=(lx,lz)=>[s[0]+c*lx+n*lz,s[1]-n*lx+c*lz];
  put([building('house',...at(-10.5,-6),fy),building('barn',...at(7,3),fy+Math.PI/2),building('silo',...at(19,-6),fy),...[-12,-3,6,15].map(lz=>tree(...at(-24,lz),R(17,22),1,'poplar')),tree(...at(-6,14),R(13,16),1,'oak')],'farm'+k)}
 {const s=site(18,12,(x,z)=>rough(x,z,13)<16,400,(x,z)=>dfH(x,z));if(s){level(s[0],s[1],18,12);put([building('church',s[0],s[1],rnd()*6.3)],'church')}}
 for(let k=0;k<2;k++){const s=site(8,0,(x,z)=>rough(x,z,4)<3,150,(x,z)=>dfH(x,z),70);if(s)put([building('tower',s[0],s[1],rnd()*6.3)],'tower'+k)}
 // spatial hash: each 40 m cell lists the obstacles within 10 m of it; sdObs is exact up to 10 m and capped there
 OBS.forEach(o=>{const r=(o.t==='hang'||o.t==='box'?Math.hypot(o.hx,o.hz):o.t==='ring'?o.R+o.r:o.t==='tree'?o.cr:o.t==='bld'?o.rb:o.r)+10;
  for(let ix=Math.floor((o.x-r+DHW)/OC);ix<=Math.floor((o.x+r+DHW)/OC);ix++)for(let iz=Math.floor((o.z-r+DHL)/OC);iz<=Math.floor((o.z+r+DHL)/OC);iz++){const k=ix*1000+iz;(OGRID.get(k)||OGRID.set(k,[]).get(k)).push(o)}})}
const sdBox=(x,y,z,hx,hy,hz)=>{const qx=Math.abs(x)-hx,qy=Math.abs(y)-hy,qz=Math.abs(z)-hz;return hyp3(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)};
const sdCyl=(x,y,z,r,y0,y1)=>{const dx=hyp2(x,z)-r,dy=Math.abs(y-(y0+y1)/2)-(y1-y0)/2;return Math.min(Math.max(dx,dy),0)+hyp2(Math.max(dx,0),Math.max(dy,0))};
export function sdObs(x,y,z){const L=OGRID.get((Math.floor((x+DHW)/OC)*1000+Math.floor((z+DHL)/OC))|0);  /* |0: the same whole-number key as a small integer, so the lookup doesn't box a double */let m=10;if(!L)return m;
 for(const o of L){const lx=x-o.x,lz=z-o.z;let d;
  if(o.t==='cyl')d=sdCyl(lx,y,lz,o.r,o.y0,o.y1);
  else if(o.t==='box')d=sdBox(lx,y-o.y,lz,o.hx,o.hy,o.hz);
  else if(o.t==='hang')d=Math.max(sdBox(lx,y-o.y,lz,o.hx,o.hy,o.hz),-sdBox(lx,y-o.y,lz,o.ix,o.iy,o.iz));
  else if(o.t==='ring'){const a=o.ax?lz:lx,b=o.ax?lx:lz;d=hyp2(hyp2(a,y-o.y)-o.R,b)-o.r}
  else if(o.t==='tree'){const T=TREE[o.k],h=o.h,s=o.s,yl=y-o.y0;let c;
   if(T.cone){const a=T.cone[0]*h,b=T.cone[1]*h,r=T.cone[2]*s;c=Math.max(a-yl,(hyp2(lx,lz)*(b-a)+(yl-b)*r)/hyp2(b-a,r))}  // the cone's planes: never more than the true distance
   else{const cy=T.cap[0]*h,hh=T.cap[1]*h;c=hyp3(lx,yl-cl(yl,cy-hh,cy+hh),lz)-T.cap[2]*s}
   d=Math.min(sdCyl(lx,yl,lz,o.tr,0,T.th*h),c)}
  else if(o.t==='bld')d=sdBld(o,lx,y,lz);
  else d=hyp3(lx,y-o.y,lz)-o.r;if(d<m)m=d}return m}
export const sdDFt=(x,y,z)=>Math.max(y-DCEIL,Math.abs(x)-DHW,Math.abs(z)-DHL,Math.min((dfHt(x,z)-y)*.75,sdCave(x,y,z))),sdDF=(x,y,z)=>Math.max(sdDFt(x,y,z),-sdObs(x,y,z));  // sdDFt: without obstacles
export const dfSpawnCount=()=>spawnPoints().length,dfSpawns=()=>spawnPoints();  // checks: respawn points left in the open; Dogfight turrets keep away from them
export const DSLOTS=[[0,12,DBASE],[-26,12,DBASE+16],[26,12,DBASE+16]];
// respawn points spread over the whole valley (built on first use): open air 30 m over the ground, nothing within sdObs's 10 m range
let DSPAWN=null;
function spawnPoints(){if(DSPAWN)return DSPAWN;DSPAWN=[];for(let x=-DHW+140;x<=DHW-140;x+=120)for(let z=-DHL+150;z<=DHL-150;z+=130){const y=dfH(x,z)+30;
 if(y<DCEIL-40&&sdDFt(x,y,z)<-15&&sdObs(x,y,z)>9.9&&sdObs(x,y+15,z)>9.9)DSPAWN.push([x,y,z])}return DSPAWN}
/** a Dogfight respawn point far from everyone alive (others: [{p}] world positions), picked at random among the best three: [x,y,z,yaw facing the valley centre] */
export function dfSpawnPoint(others){const P=spawnPoints(),sc=P.map(p=>{let m=1e9;for(const o of others)m=Math.min(m,Math.hypot(o.p.x-p[0],o.p.y-p[1],o.p.z-p[2]));return[m,p]}).sort((a,b)=>b[0]-a[0]);
 const p=sc[Math.floor(Math.random()*Math.min(3,sc.length))]?.[1]||[0,60,0];return[...p,Math.atan2(p[0],p[2])]}
// underground the fog closes in and darkens (called every frame in Dogfight)
const FOGD=new THREE.Color(0x07090c),FOGS=new THREE.Color();let ug=0;
export function dfAtmos(cam,dt){const F=LOOKS.df.fog,u=cam.position.y<dfHt(cam.position.x,cam.position.z)-2&&sdCave(cam.position.x,cam.position.y,cam.position.z)<2?1:0;ug+=(u-ug)*Math.min(1,dt*3);
 F.color.copy(FOGS.set(DFC.fog)).lerp(FOGD,ug);F.near=380-360*ug;F.far=1750-1450*ug}
const DFC={sky:['#3b6fb0','#79a6d8','#c5dbee','#e6eef2','#9fb38f','#4d6340'],sun:[-.45,.55,-.7],fog:0xc9d9e6};
LOOKS.df={bg:null,fog:new THREE.Fog(DFC.fog,380,1750),hemi:[0xdde9ff,0x55663f,1.05],sun:[0xfff0dc,3],sp:new V3(...DFC.sun).normalize().multiplyScalar(300),sc:[170,170,800],exp:1,bk:.6,th:1.25,br:.3};
scene.add(sun.target);
// collision for physics/world.js: the heightfield (column-major, rows along z) and one collider per obstacle part, taken from the meshes below
const DFOBS=[],ROCK=new THREE.DodecahedronGeometry(1,0),TLOD=[];let lodAt=null;
/** per frame in Dogfight (render/camera.js): every 20 m the camera moves, trees within 230 m go to their species' near (full detail) mesh, the rest to the far one */
export function dfLod(cam){const p=cam.position;if(lodAt&&lodAt.distanceToSquared(p)<400)return;(lodAt||(lodAt=new V3())).copy(p);
 for(const T of TLOD){let h=0,l=0;for(const t of T.L){const near=(t.x-p.x)**2+(t.z-p.z)**2<230*230,im=near?T.hi:T.lo,j=near?h++:l++;im.setMatrixAt(j,t.m);im.setColorAt(j,t.c)}
  for(const[im,n]of[[T.hi,h],[T.lo,l]]){im.count=n;im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;im.computeBoundingSphere()}}}
let TERR=null,CAVES=null;const tri=M=>({vertices:new Float32Array(M.p),indices:new Uint32Array(M.i)});
export function dfCollision(){buildDF();return{terrain:tri(TERR),caves:tri(CAVES.walls),obs:DFOBS}}  // the drawn triangles: terrain cut open at the cave mouths, and the cave walls
// the map's meshes are built the first time Dogfight is opened
let dfBuilt=false;
export function buildDF(){if(dfBuilt)return;dfBuilt=true;LOOKS.df.bg=skyTex(DFC);const c3=new THREE.Color(),rnd=seeded(3);
 {const T=dfGrid(),g=new THREE.PlaneGeometry(T.w,T.l,T.nx,T.nz);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,T.h[i]);
  g.computeVertexNormals();  // PlaneGeometry splits each cell along the same diagonal as Rapier's heightfield, so collision = these triangles
  const nm=g.attributes.normal,col=[],grass=new THREE.Color(),rock=new THREE.Color().setRGB(.42,.39,.35,THREE.SRGBColorSpace),sand=new THREE.Color().setRGB(.72,.64,.48,THREE.SRGBColorSpace),snow=new THREE.Color(.95,.97,1);
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=fbm(x/40,z/40);grass.setHSL(.24+n*.06,.42,.2+n*.1,THREE.SRGBColorSpace);c3.copy(grass);
   c3.lerp(rock,cl((.86-nm.getY(i))*5,0,1));if(y<CANY+9)c3.lerp(sand,sm((CANY+9-y)/8));if(y>150)c3.lerp(snow,cl((y-150)/40,0,1)*cl((nm.getY(i)-.6)*4,0,1));c3.multiplyScalar(.85+n*.3);col.push(c3.r,c3.g,c3.b)}
  // cut the terrain open where the caves come up (clipped exactly along the cave walls); the same triangles are the collision mesh
  const C=clipIndexed(Array.from(p.array),Array.from(g.index.array),[{a:Array.from(nm.array),n:3},{a:col,n:3}],(x,y,z)=>sdCave(x,y,z,null,1)+SEAM),tg=new THREE.BufferGeometry();
  tg.setAttribute('position',new THREE.Float32BufferAttribute(C.p,3));tg.setAttribute('normal',new THREE.Float32BufferAttribute(C.attrs[0].a,3));tg.setAttribute('color',new THREE.Float32BufferAttribute(C.attrs[1].a,3));tg.setIndex(C.idx);TERR={p:C.p,i:C.idx};
  const m=new THREE.Mesh(tg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));m.receiveShadow=true;dfG.add(m)}
 // the caves: unlit rock with its light baked in (the sun can't reach), team-coloured guide strips, and a gold trim round each entrance (no light beams: the user asked for them gone)
 {CAVES=buildCaves();const geo=M=>{const q=new THREE.BufferGeometry();q.setAttribute('position',new THREE.Float32BufferAttribute(M.p,3));q.setAttribute('color',new THREE.Float32BufferAttribute(M.c,3));q.setIndex(M.i);return q};
  dfG.add(new THREE.Mesh(geo(CAVES.walls),new THREE.MeshBasicMaterial({vertexColors:true})),new THREE.Mesh(geo(CAVES.strips),new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,side:THREE.DoubleSide})));
  // the gold trim round each entrance: a thin tube along the rim of the hole, sunk so it stands ~0.35 m proud of the ground. It straddles
  // the rim (0.4 m in, 0.6 m out): the terrain's cut edge and the tunnel wall's top edge are both polylines that wander 0.1-0.2 m either
  // side of the true rim, and a tube just outside it left their seam showing as dark slits and pale wedges along its inner edge.
  // Decoration only: no collider, nothing in the map SDF; the opening it frames is the tunnel itself
  const gold=glow(0xffd36a,1.6);for(const e of CAVE.entrances){const n=new V3(...e.n),c=new V3(...e.p),pts=e.rim.map(q=>{const p=new V3(...q),o=p.clone().sub(c);o.addScaledVector(n,-o.dot(n)).normalize();return p.addScaledVector(o,.1).addScaledVector(n,-.15)});
   dfG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),144,.5,8,true),gold))}}
 {const T=dfGrid(),n1=T.nx+1,y=CANY+.6,P=[],I=[];for(let z=0;z<T.nz;z++)for(let x=0;x<T.nx;x++){const i=z*n1+x;if(Math.min(T.h[i],T.h[i+1],T.h[i+n1],T.h[i+n1+1])>y)continue;const b=P.length/3,x0=-T.w/2+x*T.w/T.nx,z0=-T.l/2+z*T.l/T.nz,x1=x0+T.w/T.nx,z1=z0+T.l/T.nz;
  P.push(x0,y,z0,x1,y,z0,x1,y,z1,x0,y,z1);I.push(b,b+2,b+1,b,b+3,b+2)}const WC=clipIndexed(P,I,[],(x,y,z)=>sdCave(x,y,z,null,1)),wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(WC.p,3));wg.setIndex(WC.idx);wg.computeVertexNormals();
  dfG.add(new THREE.Mesh(wg,new THREE.MeshStandardMaterial({color:0x2f6f8a,roughness:.15,metalness:.2,transparent:true,opacity:.82})))}  // the river: only the grid cells that dip below it (an infinite plane showed up inside the cave entrances)
 for(const t of[0,1]){const s=t?-1:1,pad=new THREE.Mesh(new THREE.CylinderGeometry(60,62,1,96),new THREE.MeshStandardMaterial({color:0x2b3038,roughness:.8,emissive:COL[t],emissiveIntensity:.08}));pad.position.set(0,7.6,s*DBASE);pad.receiveShadow=true;dfG.add(pad);DFOBS.push({s:'cyl',hh:.5,r:62,p:[0,7.6,s*DBASE]});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(60,.5,10,192),glow(COL[t],1.6));ring.rotation.x=Math.PI/2;ring.position.set(0,8.2,s*DBASE);dfG.add(ring)}
 const mRock=new THREE.MeshStandardMaterial({color:0x7a6450,roughness:.95,flatShading:true}),mCon=new THREE.MeshStandardMaterial({color:0x7a7f86,roughness:.9,envMapIntensity:.6}),mMet=new THREE.MeshStandardMaterial({color:0x6a737c,roughness:.5,metalness:.5}),
  mWood=new THREE.MeshStandardMaterial({color:0x6b5440,roughness:.9}),mStripe=glow(0xffc640,1.2);
 const mesh=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;m.userData.st=1;dfG.add(m);return m};  // st: merged below
 const I={rock:[]},TC=new Map(),m4=new THREE.Matrix4(),q=new QT(),sv=new V3(),pv=new V3(),BG=new Map();
 for(const o of OBS){
  if(o.t==='cyl'){const g=new THREE.CylinderGeometry(o.r*.92,o.r,o.y1-o.y0,o.r>10?11:7,4);const P=g.attributes.position;for(let i=0;i<P.count;i++){const k=1+(rnd()-.5)*.08;P.setX(i,P.getX(i)*k);P.setZ(i,P.getZ(i)*k)}g.computeVertexNormals();mesh(g,mRock,o.x,(o.y0+o.y1)/2,o.z);DFOBS.push({s:'hull',pts:[...P.array],p:[o.x,(o.y0+o.y1)/2,o.z]})}
  else if(o.t==='box'){DFOBS.push({s:'box',h:[o.hx,o.hy,o.hz],p:[o.x,o.y,o.z]});const m=mesh(new THREE.BoxGeometry(o.hx*2,o.hy*2,o.hz*2),o.hx>40?mWood:mCon,o.x,o.y,o.z);if(o.hx>40){const st=new THREE.Mesh(new THREE.BoxGeometry(o.hx*2,.3,.6).translate(0,o.hy+.1,o.hz-.5),mStripe);st.userData.st=1;m.add(st)}}
  else if(o.t==='hang'){const ax=o.ix>o.hx,L=ax?o.hx:o.hz,W2=ax?o.hz:o.hx,th=W2-(ax?o.iz:o.ix),G2=new THREE.Group();G2.position.set(o.x,o.y,o.z);if(!ax)G2.rotation.y=Math.PI/2;dfG.add(G2);
   const slab=(w,h,d,x,y,z,m,c=1)=>{const s=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);s.position.set(x,y,z);s.castShadow=s.receiveShadow=true;s.userData.st=1;G2.add(s);
    if(c){G2.updateMatrixWorld();const wp=s.getWorldPosition(new V3()).sub(dfG.position),wq=G2.quaternion;DFOBS.push({s:'box',h:[w/2,h/2,d/2],p:wp.toArray(),q:[wq.x,wq.y,wq.z,wq.w]})}};
   slab(L*2,o.hy-o.iy,W2*2,0,(o.hy+o.iy)/2,0,mMet);slab(L*2,o.hy*2,th,0,0,W2-th/2,mMet);slab(L*2,o.hy*2,th,0,0,-W2+th/2,mMet);slab(L*2,.4,W2*2-th*2,0,-o.iy+.2,0,mCon);
   for(const sx of[-1,1])slab(.5,.5,W2*2-th*2,sx*(L-.3),o.iy-.4,0,mStripe,0)}
  else if(o.t==='ring'){const m=mesh(new THREE.TorusGeometry(o.R,o.r,8,40),mRock,o.x,o.y,o.z);if(o.ax)m.rotation.y=Math.PI/2;
   for(let i=0;i<40;i++){const a0=i/40*Math.PI*2,a1=(i+1)/40*Math.PI*2,p0=new V3(Math.cos(a0)*o.R,Math.sin(a0)*o.R,0),p1=new V3(Math.cos(a1)*o.R,Math.sin(a1)*o.R,0);if(o.ax){p0.applyAxisAngle(UP,Math.PI/2);p1.applyAxisAngle(UP,Math.PI/2)}
    const dv=p1.clone().sub(p0),cq=new QT().setFromUnitVectors(UP,dv.clone().normalize());DFOBS.push({s:'cap',hh:dv.length()/2,r:o.r,p:[o.x+(p0.x+p1.x)/2,o.y+(p0.y+p1.y)/2,o.z+(p0.z+p1.z)/2],q:[cq.x,cq.y,cq.z,cq.w]})}}  // the torus as a ring of capsules
  else if(o.t==='tree'){const T=TREE[o.k],h=o.h,s=o.s;DFOBS.push({s:'cyl',hh:T.th*h/2,r:o.tr,p:[o.x,o.y0+T.th*h/2,o.z]},T.cone?{s:'cone',hh:(T.cone[1]-T.cone[0])*h/2,r:T.cone[2]*s,p:[o.x,o.y0+(T.cone[0]+T.cone[1])*h/2,o.z]}:{s:'cap',hh:T.cap[1]*h,r:T.cap[2]*s,p:[o.x,o.y0+T.cap[0]*h,o.z]});
   const L=TC.get(o.k)||TC.set(o.k,[]).get(o.k),u=hash2(o.x*1.3,o.z*.7),v=.86+.26*hash2(o.z*.9,o.x*1.1);
   L.push({x:o.x,z:o.z,m:m4.compose(pv.set(o.x,o.y0-.02*h,o.z),q.setFromAxisAngle(UP,u*6.28),sv.set(s*(.92+.16*u),h,s*(1.08-.16*u))).clone(),c:c3.setRGB(v*(1.04-.08*u),v,v*(.96+.08*u)).clone()})}
  else if(o.t==='bld'){DFOBS.push(...bldColliders(o));(BG.get(o.g)||BG.set(o.g,[]).get(o.g)).push(o)}
  else{I.rock.push(m4.compose(pv.set(o.x,o.y,o.z),q.setFromEuler(new THREE.Euler(o.x,o.z,o.r)),sv.set(o.r,o.r*.8,o.r)).clone());
   const R4=new THREE.Matrix4().compose(new V3(),q,sv),P=ROCK.attributes.position,pts=[];for(let i=0;i<P.count;i++)pts.push(...new V3().fromBufferAttribute(P,i).applyMatrix4(R4).toArray());DFOBS.push({s:'hull',pts,p:[o.x,o.y,o.z]})}}
 {const im=new THREE.InstancedMesh(ROCK,mRock.clone(),I.rock.length);I.rock.forEach((m,j)=>im.setMatrixAt(j,m));im.castShadow=im.receiveShadow=true;im.frustumCulled=false;dfG.add(im)}  // its own copy of the rock material: one material on plain and instanced meshes made three re-check its shader program twice a frame
 // the static obstacles (mesas, spires, towers, hangars, bridges, arches) merged into one mesh per material and half of the map: they were ~130 draw calls, all drawn again in the shadow pass
 {dfG.updateMatrixWorld(true);const B=new Map(),dead=[];dfG.traverse(o=>{if(!o.isMesh||!o.userData.st)return;const k=o.material.uuid+(o.getWorldPosition(pv).z>0);(B.get(k)||B.set(k,[]).get(k)).push(o);dead.push(o)});
  for(const L of B.values()){const m=new THREE.Mesh(mergeGeometries(L.map(o=>o.geometry.clone().applyMatrix4(o.matrixWorld))),L[0].material);m.castShadow=m.receiveShadow=true;dfG.add(m)}
  for(const o of dead)o.removeFromParent()}
 // trees: per species a near mesh (full detail, casts shadows, culls as a whole when you look away) and a far one (low detail, no shadows: it is
 // beyond the sun's shadow box); dfLod sorts the trees between them as the camera moves
 {const mT=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85});
  for(const[k,L]of TC){const hi=new THREE.InstancedMesh(propGeo(k),mT,L.length),lo=new THREE.InstancedMesh(propGeo(k,1),mT,L.length);hi.castShadow=hi.receiveShadow=true;TLOD.push({L,hi,lo});dfG.add(hi,lo)}
  lodAt=null;dfLod({position:new V3(0,0,DBASE)})}
 // buildings: one mesh per farmstead / church / tower
 for(const L of BG.values())dfG.add(bldMesh(L));
 const sunS=new THREE.Sprite(new THREE.SpriteMaterial({map:dot,color:new THREE.Color(0xfff0dc).multiplyScalar(2),fog:false,toneMapped:false,depthWrite:false}));sunS.position.copy(LOOKS.df.sp).setLength(1300);sunS.scale.setScalar(150);dfG.add(sunS)}
