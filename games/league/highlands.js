// Highlands: the Dogfight map. 1.1 x 1.4 km of hills, a river canyon and mountain walls, with mesas, spire fields, hangars you can fly through, bridges, rock arches and forests for cover.
// Everything is seeded and point-mirrored through the centre, so every client builds the same map and both teams get the same lines.
import * as THREE from 'three';
import {V3,QT,cl,UP,seeded,sm,vnoise,fbm} from '../../engine/util.js';
import {scene,glow,dot,skyTex} from '../../engine/render.js';
import {COL} from './consts.js';
import {sun} from './scene.js';
import {LOOKS} from './arena.js';
export const dfG=new THREE.Group();dfG.visible=false;scene.add(dfG);
export const DW=1100,DLEN=1400,DHW=DW/2,DHL=DLEN/2,DCEIL=520,DBASE=DHL-230,CANY=-40;
export const cxR=z=>150*Math.sin(z/230)+55*Math.sin(z/83);  // canyon centre line (odd in z, so the canyon is point-symmetric too)
const dfH0=(x,z)=>(fbm(x/240+11,z/240-4)-.42)*185+Math.pow(1-Math.abs(2*vnoise(x/150+3,z/150+7)-1),2)*80;
export function dfH(x,z){let y=Math.max(-30,(dfH0(x,z)+dfH0(-x,-z))*.5);
 y=CANY+sm((Math.abs(x-cxR(z))-22)/50)*(y-CANY);  // carve the canyon
 const e=Math.max(Math.abs(x)-(DHW-170),Math.abs(z)-(DHL-170),0);y+=sm(e/170)*430*(.7+.15*(vnoise(x/60,z/60)+vnoise(-x/60,-z/60)));  // mountain walls at the edge
 const r=Math.hypot(x,Math.abs(z)-DBASE);return y+(8-y)*(1-sm((r-70)/60))}  // flat team bases at z = ±DBASE
export const OBS=[],OGRID=new Map(),OC=40;
{const rnd=seeded(21),R=(a,b)=>a+rnd()*(b-a),placed=[];
 const free=(x,z,r,canyon)=>Math.abs(x)<DHW-200&&Math.abs(z)<DHL-200&&Math.hypot(x,Math.abs(z)-DBASE)>130+r&&(canyon||Math.abs(x-cxR(z))>r+40)&&placed.every(p=>Math.hypot(p[0]-x,p[1]-z)>p[2]+r+14&&Math.hypot(p[0]+x,p[1]+z)>p[2]+r+14);
 const spot=(r,canyon,tries=80)=>{for(let i=0;i<tries;i++){const x=R(-DHW+200,DHW-200),z=R(0,DHL-200);if(free(x,z,r,canyon))return[x,z]}return null};
 const gmin=(x,z,r)=>Math.min(dfH(x,z),dfH(x+r,z),dfH(x-r,z),dfH(x,z+r),dfH(x,z-r));
 const add=(o,big=true)=>{if(big)placed.push([o.x,o.z,o.rb]);OBS.push(o,{...o,x:-o.x,z:-o.z,mir:1})};
 for(let k=0;k<7;k++){const c=spot(55);if(!c)continue;placed.push([c[0],c[1],55]);for(let i=0;i<34;i++){const a=rnd()*6.3,d=Math.sqrt(rnd())*55,x=c[0]+Math.cos(a)*d,z=c[1]+Math.sin(a)*d,h=R(14,26);
  if(Math.abs(x-cxR(z))<40)continue;add({t:'tree',x,y0:dfH(x,z)-.5,z,h,cr:h*.24,rb:h*.24},false)}}  // forests
 for(let i=0;i<13;i++){const r=R(14,36),s=spot(r);if(!s)continue;const y0=gmin(s[0],s[1],r)-6;add({t:'cyl',x:s[0],z:s[1],r,y0,y1:y0+R(90,330),rb:r})}  // mesas
 for(let k=0;k<2;k++){const c=spot(70);if(!c)continue;placed.push([c[0],c[1],70]);for(let i=0;i<9;i++){const x=c[0]+R(-60,60),z=c[1]+R(-60,60),r=R(3.5,8),y0=gmin(x,z,r)-3;const o={t:'cyl',x,z,r,y0,y1:y0+R(55,180),rb:r};OBS.push(o,{...o,x:-x,z:-z,mir:1})}}  // spire fields
 for(let i=0;i<5;i++){const s=spot(34);if(!s)continue;const ax=rnd()<.5,hx=ax?30:14,hz=ax?14:30,hy=10,g=gmin(s[0],s[1],20),y=g+hy-1.5;add({t:'hang',x:s[0],y,z:s[1],hx,hy,hz,ix:ax?hx+2:hx-1.5,iy:hy-1.5,iz:ax?hz-1.5:hz+2,rb:34})}  // hangars, open at both ends
 for(let i=0;i<7;i++){const w=R(5,9),s=spot(w*1.5);if(!s)continue;const hy=R(20,65),g=gmin(s[0],s[1],w);add({t:'box',x:s[0],y:g+hy-2,z:s[1],hx:w,hy,hz:w,rb:w*1.5})}  // ruined towers
 for(const z of[90,330]){const x=cxR(z);add({t:'box',x,y:-6,z,hx:70,hy:2.2,hz:7,rb:0},false)}  // bridges over the canyon
 for(let i=0;i<5;i++){const s=spot(30,true);if(!s)continue;add({t:'ring',x:s[0],y:dfH(s[0],s[1])-4,z:s[1],R:R(22,30),r:4.5,ax:rnd()<.5,rb:32})}  // rock arches
 for(let i=0;i<40;i++){const r=R(3,9),s=spot(r,true,20);if(!s)continue;add({t:'rock',x:s[0],y:dfH(s[0],s[1])+r*.25,z:s[1],r,rb:r},false)}
 // spatial hash: each 40 m cell lists the obstacles within 10 m of it; sdObs is exact up to 10 m and capped there
 OBS.forEach(o=>{const r=(o.t==='hang'||o.t==='box'?Math.hypot(o.hx,o.hz):o.t==='ring'?o.R+o.r:o.t==='tree'?o.cr:o.r)+10;
  for(let ix=Math.floor((o.x-r+DHW)/OC);ix<=Math.floor((o.x+r+DHW)/OC);ix++)for(let iz=Math.floor((o.z-r+DHL)/OC);iz<=Math.floor((o.z+r+DHL)/OC);iz++){const k=ix*1000+iz;(OGRID.get(k)||OGRID.set(k,[]).get(k)).push(o)}})}
const sdBox=(x,y,z,hx,hy,hz)=>{const qx=Math.abs(x)-hx,qy=Math.abs(y)-hy,qz=Math.abs(z)-hz;return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)};
const sdCyl=(x,y,z,r,y0,y1)=>{const dx=Math.hypot(x,z)-r,dy=Math.abs(y-(y0+y1)/2)-(y1-y0)/2;return Math.min(Math.max(dx,dy),0)+Math.hypot(Math.max(dx,0),Math.max(dy,0))};
function sdObs(x,y,z){const L=OGRID.get(Math.floor((x+DHW)/OC)*1000+Math.floor((z+DHL)/OC));let m=10;if(!L)return m;
 for(const o of L){const lx=x-o.x,lz=z-o.z;let d;
  if(o.t==='cyl')d=sdCyl(lx,y,lz,o.r,o.y0,o.y1);
  else if(o.t==='box')d=sdBox(lx,y-o.y,lz,o.hx,o.hy,o.hz);
  else if(o.t==='hang')d=Math.max(sdBox(lx,y-o.y,lz,o.hx,o.hy,o.hz),-sdBox(lx,y-o.y,lz,o.ix,o.iy,o.iz));
  else if(o.t==='ring'){const a=o.ax?lz:lx,b=o.ax?lx:lz;d=Math.hypot(Math.hypot(a,y-o.y)-o.R,b)-o.r}
  else if(o.t==='tree')d=Math.min(sdCyl(lx,y,lz,.5,o.y0,o.y0+o.h*.4),sdCyl(lx,y,lz,o.cr*.75,o.y0+o.h*.28,o.y0+o.h));
  else d=Math.hypot(lx,y-o.y,lz)-o.r;if(d<m)m=d}return m}
export const sdDF=(x,y,z)=>Math.max(y-DCEIL,Math.abs(x)-DHW,Math.abs(z)-DHL,(dfH(x,z)-y)*.75,-sdObs(x,y,z));
export const DSLOTS=[[0,12,DBASE],[-26,12,DBASE+16],[26,12,DBASE+16]];
const DFC={sky:['#3b6fb0','#79a6d8','#c5dbee','#e6eef2','#9fb38f','#4d6340'],sun:[-.45,.55,-.7],fog:0xc9d9e6};
LOOKS.df={bg:null,fog:new THREE.Fog(DFC.fog,380,1750),hemi:[0xdde9ff,0x55663f,1.05],sun:[0xfff0dc,3],sp:new V3(...DFC.sun).normalize().multiplyScalar(300),sc:[170,170,800],exp:1,bk:.4,th:1};
scene.add(sun.target);
// the map's meshes are built the first time Dogfight is opened
let dfBuilt=false;
export function buildDF(){if(dfBuilt)return;dfBuilt=true;LOOKS.df.bg=skyTex(DFC);const c3=new THREE.Color(),rnd=seeded(3);
 {const g=new THREE.PlaneGeometry(DW+900,DLEN+900,280,350);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,dfH(p.getX(i),p.getZ(i)));g.computeVertexNormals();
  const nm=g.attributes.normal,col=[],grass=new THREE.Color(),rock=new THREE.Color().setRGB(.42,.39,.35,THREE.SRGBColorSpace),sand=new THREE.Color().setRGB(.72,.64,.48,THREE.SRGBColorSpace),snow=new THREE.Color(.95,.97,1);
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=fbm(x/40,z/40);grass.setHSL(.24+n*.06,.42,.2+n*.1,THREE.SRGBColorSpace);c3.copy(grass);
   c3.lerp(rock,cl((.86-nm.getY(i))*5,0,1));if(y<CANY+4)c3.lerp(sand,cl((CANY+4-y)/3,0,1));if(y>150)c3.lerp(snow,cl((y-150)/40,0,1)*cl((nm.getY(i)-.6)*4,0,1));c3.multiplyScalar(.85+n*.3);col.push(c3.r,c3.g,c3.b)}
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));m.receiveShadow=true;dfG.add(m)}
 {const w=new THREE.Mesh(new THREE.PlaneGeometry(DW+900,DLEN+900),new THREE.MeshStandardMaterial({color:0x2f6f8a,roughness:.15,metalness:.2,transparent:true,opacity:.82}));w.rotation.x=-Math.PI/2;w.position.y=CANY+.6;dfG.add(w)}
 for(const t of[0,1]){const s=t?-1:1,pad=new THREE.Mesh(new THREE.CylinderGeometry(60,62,1,48),new THREE.MeshStandardMaterial({color:0x2b3038,roughness:.8,emissive:COL[t],emissiveIntensity:.08}));pad.position.set(0,7.6,s*DBASE);pad.receiveShadow=true;dfG.add(pad);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(60,.5,6,64),glow(COL[t],2));ring.rotation.x=Math.PI/2;ring.position.set(0,8.2,s*DBASE);dfG.add(ring)}
 const mRock=new THREE.MeshStandardMaterial({color:0x7a6450,roughness:.95,flatShading:true}),mCon=new THREE.MeshStandardMaterial({color:0x8d9196,roughness:.85}),mMet=new THREE.MeshStandardMaterial({color:0x6a737c,roughness:.5,metalness:.5}),
  mWood=new THREE.MeshStandardMaterial({color:0x6b5440,roughness:.9}),mStripe=glow(0xffc640,1.2);
 const mesh=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;dfG.add(m);return m};
 const I={trunk:[],crown:[],rock:[]},m4=new THREE.Matrix4(),q=new QT(),sv=new V3(),pv=new V3();
 for(const o of OBS){
  if(o.t==='cyl'){const g=new THREE.CylinderGeometry(o.r*.92,o.r,o.y1-o.y0,o.r>10?11:7,4);const P=g.attributes.position;for(let i=0;i<P.count;i++){const k=1+(rnd()-.5)*.08;P.setX(i,P.getX(i)*k);P.setZ(i,P.getZ(i)*k)}g.computeVertexNormals();mesh(g,mRock,o.x,(o.y0+o.y1)/2,o.z)}
  else if(o.t==='box'){const m=mesh(new THREE.BoxGeometry(o.hx*2,o.hy*2,o.hz*2),o.hx>40?mWood:mCon,o.x,o.y,o.z);if(o.hx>40)m.add(new THREE.Mesh(new THREE.BoxGeometry(o.hx*2,.3,.6).translate(0,o.hy+.1,o.hz-.5),mStripe))}
  else if(o.t==='hang'){const ax=o.ix>o.hx,L=ax?o.hx:o.hz,W2=ax?o.hz:o.hx,th=W2-(ax?o.iz:o.ix),G2=new THREE.Group();G2.position.set(o.x,o.y,o.z);if(!ax)G2.rotation.y=Math.PI/2;dfG.add(G2);
   const slab=(w,h,d,x,y,z,m)=>{const s=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);s.position.set(x,y,z);s.castShadow=s.receiveShadow=true;G2.add(s)};
   slab(L*2,o.hy-o.iy,W2*2,0,(o.hy+o.iy)/2,0,mMet);slab(L*2,o.hy*2,th,0,0,W2-th/2,mMet);slab(L*2,o.hy*2,th,0,0,-W2+th/2,mMet);slab(L*2,.4,W2*2-th*2,0,-o.iy+.2,0,mCon);
   for(const sx of[-1,1])slab(.5,.5,W2*2-th*2,sx*(L-.3),o.iy-.4,0,mStripe)}
  else if(o.t==='ring'){const m=mesh(new THREE.TorusGeometry(o.R,o.r,8,40),mRock,o.x,o.y,o.z);if(o.ax)m.rotation.y=Math.PI/2}
  else if(o.t==='tree'){I.trunk.push(m4.compose(pv.set(o.x,o.y0,o.z),q.identity(),sv.set(1,o.h*.4,1)).clone());I.crown.push(m4.compose(pv.set(o.x,o.y0+o.h*.25,o.z),q.setFromAxisAngle(UP,o.x),sv.set(o.cr,o.h*.78,o.cr)).clone())}
  else I.rock.push(m4.compose(pv.set(o.x,o.y,o.z),q.setFromEuler(new THREE.Euler(o.x,o.z,o.r)),sv.set(o.r,o.r*.8,o.r)).clone())}
 const GI={trunk:[new THREE.CylinderGeometry(.35,.5,1,6).translate(0,.5,0),mWood],crown:[new THREE.ConeGeometry(1,1,7).translate(0,.5,0),new THREE.MeshStandardMaterial({roughness:.9,flatShading:true})],rock:[new THREE.DodecahedronGeometry(1,0),mRock]};
 for(const k in I){const im=new THREE.InstancedMesh(GI[k][0],GI[k][1],I[k].length);I[k].forEach((m,j)=>{im.setMatrixAt(j,m);if(k==='crown')im.setColorAt(j,c3.setHSL(.26+rnd()*.07,.38,.2+rnd()*.1,THREE.SRGBColorSpace))});im.castShadow=im.receiveShadow=true;im.frustumCulled=false;dfG.add(im)}
 const sunS=new THREE.Sprite(new THREE.SpriteMaterial({map:dot,color:new THREE.Color(0xfff0dc).multiplyScalar(3),fog:false,toneMapped:false,depthWrite:false}));sunS.position.copy(LOOKS.df.sp).setLength(1300);sunS.scale.setScalar(150);dfG.add(sunS)}
