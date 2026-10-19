// Interceptor buildings, all code-built: the defended sites (substation, fuel depot, apartment blocks, and Zombies' command bunker) and the village houses.
// Each site is built once per damage stage (0 intact, 1 about 75%, 2 about 50%, 3 about 25%, 4 destroyed) from the same seeded layout, so damage only
// grows from one stage to the next: scorch, broken and burning windows, holes and fallen floors, burnt-out plant, rubble. A stage is one merged mesh
// per material (plus its collision boxes and fire / smoke points), so changing stage is a visibility swap. Stage 0 is built at load (Classic shows only
// that); stages 1-4 are built, and their shaders compiled, the first frame Zombies runs. step() follows each site's HP while Zombies is on.
import * as THREE from 'three';
import {tex,detail} from '../../engine/render.js';
import {hash2,vnoise} from '../../engine/util.js';
const V3=THREE.Vector3,PI=Math.PI,_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new V3(),_s=new V3(),_v=new V3(),_n=new THREE.Matrix3();
const D=[0,.12,.32,.58,1];  // damage amount per stage: thresholds for the seeded per-part rolls
export const stageOf=f=>f>=.999?0:f>.625?1:f>.375?2:f>0?3:4;

// ---------- geometry kit: parts are collected per material and baked into one mesh each ----------
const NI=g=>{g=g.index?g.toNonIndexed():g;for(const a of Object.keys(g.attributes))if(a!=='position'&&a!=='normal'&&a!=='uv')g.deleteAttribute(a);return g};
const BOX=NI(new THREE.BoxGeometry(1,1,1)),PLANE=NI(new THREE.PlaneGeometry(1,1).rotateX(-PI/2)),DISC=NI(new THREE.CircleGeometry(.5,32).rotateX(-PI/2)),GC=new Map();
const cylG=(r0,r1,seg=16,open=false)=>{const k=`c${r0},${r1},${seg},${open}`;return GC.get(k)||GC.set(k,NI(new THREE.CylinderGeometry(r0,r1,1,seg,1,open))).get(k)};
const coneG=seg=>GC.get('k'+seg)||GC.set('k'+seg,NI(new THREE.ConeGeometry(1,1,seg))).get('k'+seg);
const sphG=(w=8,h=5)=>GC.get(`s${w},${h}`)||GC.set(`s${w},${h}`,NI(new THREE.SphereGeometry(1,w,h))).get(`s${w},${h}`);
// porcelain / glass insulator: a core with sheds, unit height
const insG=()=>GC.get('ins')||GC.set('ins',NI(new THREE.LatheGeometry((()=>{const p=[new THREE.Vector2(.001,0),new THREE.Vector2(.5,0)];for(let i=0;i<9;i++){const y=.06+i*.1;p.push(new THREE.Vector2(.42,y),new THREE.Vector2(1,y+.02),new THREE.Vector2(.42,y+.06))}p.push(new THREE.Vector2(.42,1),new THREE.Vector2(.001,1));return p})(),10))).get('ins');
// rubble mound (lumpy squashed dome) and a buckled tank shell (crumpled, sagging cylinder), a few seeded variants each
const moundG=v=>GC.get('m'+v)||GC.set('m'+v,(()=>{const g=NI(new THREE.IcosahedronGeometry(1,2)),p=g.attributes.position;for(let i=0;i<p.count;i++){_v.fromBufferAttribute(p,i);const n=vnoise(_v.x*2.3+v*7,_v.z*2.3+_v.y)*.5+vnoise(_v.x*5+v,_v.z*5-v)*.3+vnoise(_v.x*11-v,_v.z*11+_v.y*5)*.2;_v.multiplyScalar(.6+n*.8);_v.y=Math.max(0,_v.y+.15);p.setXYZ(i,_v.x,_v.y,_v.z)}g.computeVertexNormals();return g})()).get('m'+v);
const buckleG=v=>GC.get('b'+v)||GC.set('b'+v,(()=>{const g=NI(new THREE.CylinderGeometry(1,1,1,36,10,false)),p=g.attributes.position;for(let i=0;i<p.count;i++){_v.fromBufferAttribute(p,i);const a=Math.atan2(_v.z,_v.x),y=_v.y+.5,top=.55+.35*vnoise(a*1.6+v*3,v),
  sag=y*top+(y>.98?-.15*vnoise(_v.x*3+v,_v.z*3):0),r=Math.hypot(_v.x,_v.z)*(1+.09*(vnoise(a*3+v,y*6)-.5)*y*2+.05*Math.sin(y*14+a*2)*y);p.setXYZ(i,Math.cos(a)*r,sag-.5,Math.sin(a)*r)}g.computeVertexNormals();return g})()).get('b'+v);
function quadG(a,b,c,d,u0,v0,u1,v1){const g=new THREE.BufferGeometry(),P=[a,b,c,a,c,d],U=[u0,v0,u1,v0,u1,v1,u0,v0,u1,v1,u0,v1],n=new V3().subVectors(b,a).cross(new V3().subVectors(d,a)).normalize(),pos=[],nor=[];
 for(const p of P){pos.push(p.x,p.y,p.z);nor.push(n.x,n.y,n.z)}g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));return g}
// box with world-scaled UVs (tu × tv metres per texture tile)
function tboxG(w,h,d,tu,tv){const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;for(let i=0;i<24;i++){const f=i>>2;uv.setXY(i,uv.getX(i)*(f<2?d:w)/tu,uv.getY(i)*(f===2||f===3?d:h)/tv)}return NI(g)}
function Kit(){const L=new Map(),T=new THREE.Matrix4(),k={L,fx:[],sol:[],wires:[],T,
 at(x=0,y=0,z=0,ry=0,rx=0,rz=0){T.compose(_p.set(x,y,z),_q.setFromEuler(_e.set(rx,ry,rz,'YXZ')),_s.set(1,1,1));return k},
 add(g,mat,x=0,y=0,z=0,ry=0,rx=0,rz=0,sx=1,sy=1,sz=1){_m.compose(_p.set(x,y,z),_q.setFromEuler(_e.set(rx,ry,rz,'YXZ')),_s.set(sx,sy,sz)).premultiply(T);(L.get(mat)||L.set(mat,[]).get(mat)).push([g,_m.clone()]);return k},
 box(w,h,d,mat,x,y0,z,ry=0,rx=0,rz=0){return k.add(BOX,mat,x,y0+h/2,z,ry,rx,rz,w,h,d)},
 cyl(r0,r1,h,mat,x,y0,z,seg=16,open=false){return k.add(cylG(r0,r1,seg,open),mat,x,y0+h/2,z,0,0,0,1,h,1)},
 pipe(r,len,mat,x,y,z,ry=0,seg=10){return k.add(cylG(r,r,seg),mat,x,y,z,ry,0,PI/2,1,len,1)},  // horizontal, along x before ry
 rod(a,b,r,mat,seg=6){_v.subVectors(b,a);const L2=_v.length();_q.setFromUnitVectors(_p.set(0,1,0),_v.normalize());_m.compose(_s.addVectors(a,b).multiplyScalar(.5),_q,_p.set(r,L2,r)).premultiply(T);(L.get(mat)||L.set(mat,[]).get(mat)).push([cylG(1,1,seg),_m.clone()]);return k},
 quad(mat,a,b,c,d,u0=0,v0=0,u1=1,v1=1){(L.get(mat)||L.set(mat,[]).get(mat)).push([quadG(a,b,c,d,u0,v0,u1,v1),T.clone()]);return k},
 decal(mat,x,y,z,s,ry=0,sz=s){return k.add(PLANE,mat,x,y,z,ry,0,0,s,1,sz)},
 solid(x,y0,z,w,h,d){k.sol.push({x,y:y0+h/2,z,hx:w/2,hy:h/2,hz:d/2});return k},solidC(x,z,r,y0,y1){k.sol.push({c:1,x,z,r,y0,y1});return k},
 fire(x,y,z,r){_v.set(x,y,z).applyMatrix4(T);k.fx.push({f:1,x:_v.x,y:_v.y,z:_v.z,r});return k},smoke(x,y,z,r,c=0x1c1a18){_v.set(x,y,z).applyMatrix4(T);k.fx.push({f:0,x:_v.x,y:_v.y,z:_v.z,r,c});return k},
 wire(pts){for(let i=0;i<pts.length-1;i++)k.wires.push(pts[i].clone().applyMatrix4(T),pts[i+1].clone().applyMatrix4(T));return k}};return k}
let wireMat=null;
function bake(k,s){const G=new THREE.Group();G.position.set(s.x,s.y,s.z);
 for(const[mat,list]of k.L){let n=0;for(const[g]of list)n+=g.attributes.position.count;const P=new Float32Array(n*3),N=new Float32Array(n*3),U=new Float32Array(n*2);let o=0;
  for(const[g,m]of list){_n.getNormalMatrix(m);const p=g.attributes.position,nn=g.attributes.normal,uv=g.attributes.uv;
   for(let i=0;i<p.count;i++,o++){_v.fromBufferAttribute(p,i).applyMatrix4(m);P[o*3]=_v.x;P[o*3+1]=_v.y;P[o*3+2]=_v.z;_v.fromBufferAttribute(nn,i).applyMatrix3(_n).normalize();N[o*3]=_v.x;N[o*3+1]=_v.y;N[o*3+2]=_v.z;if(uv){U[o*2]=uv.getX(i);U[o*2+1]=uv.getY(i)}}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3));g.setAttribute('uv',new THREE.BufferAttribute(U,2));g.computeBoundingSphere();
  const me=new THREE.Mesh(g,mat);me.castShadow=!mat.transparent&&!mat.userData.noCast;me.receiveShadow=!mat.userData.noRecv;G.add(me)}
 if(k.wires.length){const g=new THREE.BufferGeometry().setFromPoints(k.wires);G.add(new THREE.LineSegments(g,wireMat||(wireMat=new THREE.LineBasicMaterial({color:0x2a2c2e}))))}
 return G}

// ---------- textures ----------
const H=(a,b)=>hash2(a*1.37+.21,b*2.71+.53);
// panel-block facade, one tile = 8 bays × 9 floors (24 × 27 m). Damage level L breaks more windows, adds soot plumes, and (L>=2) burning rooms in the emissive map
function facadeTex(L){const P=[0,.1,.25,.5][L],S=[0,.35,.6,.85][L],em=L>=2?document.createElement('canvas'):null,W=512,FH=W/9,BW=W/8;let eg=null;if(em){em.width=em.height=W;eg=em.getContext('2d');eg.fillStyle='#000';eg.fillRect(0,0,W,W)}
 const map=tex(W,W,g=>{g.fillStyle='#d3cec2';g.fillRect(0,0,W,W);
  for(let f=0;f<9;f++)for(let b=0;b<8;b++){const t=H(b+30,f)*14-7;g.fillStyle=`rgb(${208+t},${203+t},${192+t})`;g.fillRect(b*BW+1,W-(f+1)*FH+1,BW-2,FH-2)}
  g.fillStyle='#b9b2a4';for(let f=0;f<9;f++)g.fillRect(0,W-f*FH-12,W,3);g.fillStyle='#9c968a';g.fillRect(0,W-17,W,17);  // floor-slab joint bands, darker plinth
  g.strokeStyle='rgba(70,64,56,.45)';g.lineWidth=1.5;g.beginPath();for(let b=0;b<=8;b++){g.moveTo(b*BW,0);g.lineTo(b*BW,W)}for(let f=0;f<=9;f++){g.moveTo(0,W-f*FH);g.lineTo(W,W-f*FH)}g.stroke();
  for(let f=0;f<9;f++)for(let b=0;b<8;b++){const x=b*BW+16,y=W-f*FH-17-28,w=32,h=28,hb=H(b,f),hs=H(b+9,f+3),burn=hb<[0,0,.035,.085][L];
   if(hb<P){g.fillStyle=burn?'#3a1a0a':'#0c0b0a';g.fillRect(x,y,w,h);g.fillStyle='rgba(150,165,175,.5)';for(let i=0;i<3;i++){const cx=x+(H(b,f+i)>.5?w:0),cy=y+(H(b+i,f)>.5?h:0);g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+(cx>x?-1:1)*(4+H(i,b)*9),cy);g.lineTo(cx,cy+(cy>y?-1:1)*(4+H(f,i)*9));g.fill()}
    g.strokeStyle='#cfcac0';g.lineWidth=2;g.beginPath();g.moveTo(x,y+h);g.lineTo(x+w,y+h);if(hs>.5){g.moveTo(x,y);g.lineTo(x,y+h)}g.stroke();
    if(hs<S){g.save();g.translate(x+w/2,y+4);g.scale(1,2.2);const r=g.createRadialGradient(0,-6,2,0,-6,22);r.addColorStop(0,'rgba(14,11,9,.85)');r.addColorStop(1,'rgba(14,11,9,0)');g.fillStyle=r;g.beginPath();g.arc(0,-6,22,0,7);g.fill();g.restore()}
    if(burn){const r=eg.createLinearGradient(0,y,0,y+h);r.addColorStop(0,'#ff7a1a');r.addColorStop(1,'#ffcf70');eg.fillStyle=r;eg.fillRect(x+2,y+3,w-4,h-4);eg.fillStyle='rgba(255,120,30,.35)';eg.fillRect(x-4,y-6,w+8,10)}}
   else{const r=g.createLinearGradient(0,y,0,y+h);r.addColorStop(0,'#5d6b78');r.addColorStop(1,'#232a31');g.fillStyle=r;g.fillRect(x,y,w,h);if(H(b+3,f+7)<.3){g.fillStyle='rgba(205,190,160,.75)';g.fillRect(x+2,y+2,9,h-4)}
    g.strokeStyle='#ece8e0';g.lineWidth=2;g.strokeRect(x,y,w,h);g.beginPath();g.moveTo(x+w/2,y);g.lineTo(x+w/2,y+h);g.moveTo(x,y+9);g.lineTo(x+w,y+9);g.stroke()}
   g.fillStyle='#b4ad9f';g.fillRect(x-3,y+h,w+6,3)}
  if(L>=3)for(let i=0;i<14;i++){const x=H(i,77)*W,y=H(77,i)*W,r=30+H(i,i)*70,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(20,16,12,.6)');gr.addColorStop(1,'rgba(20,16,12,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r)}},true);
 let emt=null;if(em){emt=new THREE.CanvasTexture(em);emt.colorSpace=THREE.SRGBColorSpace;emt.wrapS=emt.wrapT=THREE.RepeatWrapping}return{map,em:emt}}
// a cut through a damaged block: dark rooms, concrete floor slabs every 3 m, partition walls, faded wallpaper, soot (one tile = 12 × 12 m)
const cutTex=()=>tex(256,256,g=>{g.fillStyle='#34312e';g.fillRect(0,0,256,256);const F=64;
 for(let f=0;f<4;f++){let x=0;while(x<256){const w=30+H(x,f)*70;g.fillStyle=['#6b6256','#5d6466','#6e5d55','#4d4a45'][(H(f,x)*4)|0];g.globalAlpha=.55;g.fillRect(x+4,f*F+8,w-8,F-16);g.globalAlpha=1;g.fillStyle='#24211f';g.fillRect(x,f*F,4,F);x+=w}}
 for(let f=0;f<4;f++){g.fillStyle='#9d978c';g.fillRect(0,f*F,256,7);g.fillStyle='rgba(0,0,0,.45)';g.fillRect(0,f*F+7,256,6);for(let x=0;x<256;x+=4)if(H(x,f+9)<.25){g.fillStyle='#34312e';g.fillRect(x,f*F+4+H(x,f)*3,4,4)}}
 for(let i=0;i<10;i++){const x=H(i,5)*256,y=H(5,i)*256,r=20+H(i,i+1)*50,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(10,8,6,.7)');gr.addColorStop(1,'rgba(10,8,6,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r)}},true);
const blobTex=(dark,ring)=>tex(128,128,g=>{for(let i=0;i<40;i++){const a=H(i,dark.length)*7,d=H(2,i)*(ring?22:34),x=64+Math.cos(a)*d,y=64+Math.sin(a)*d,r=8+H(i,9)*22,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(${dark},.2)`);gr.addColorStop(1,`rgba(${dark},0)`);g.fillStyle=gr;g.fillRect(0,0,128,128)}
 if(ring){const gr=g.createRadialGradient(64,64,10,64,64,60);gr.addColorStop(0,'rgba(8,7,6,.7)');gr.addColorStop(.42,'rgba(25,20,15,.55)');gr.addColorStop(.55,'rgba(120,108,90,.55)');gr.addColorStop(1,'rgba(120,108,90,0)');g.fillStyle=gr;g.fillRect(0,0,128,128)}});
// smoke staining round a tank shell (u = round, v = up, top of the canvas = top of the tank): soft plumes rising from a scorched patch, blurred
const sootTex=(base='#ffffff',rust=0)=>tex(512,256,g=>{g.fillStyle=base;g.fillRect(0,0,512,256);const c0=H(3,3)*512;g.filter='blur(7px)';
 for(let i=0;i<70;i++){const x=c0+(H(i,4)-.5)*(H(i,6)<.75?240:520),len=50+H(i,5)*190,w=14+H(5,i)*40,gr=g.createLinearGradient(0,0,0,len);gr.addColorStop(0,'rgba(22,18,14,.32)');gr.addColorStop(1,'rgba(22,18,14,0)');g.fillStyle=gr;for(const o of[0,-512,512])g.fillRect(x+o-w/2,0,w,len)}
 if(rust)for(let i=0;i<40;i++){const x=H(i,8)*512,y=H(8,i)*256,r=10+H(i,i)*40,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(110,62,32,.45)');gr.addColorStop(1,'rgba(110,62,32,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r)}
 for(const o of[0,-512,512]){const gr=g.createRadialGradient(c0+o,70,5,c0+o,70,150);gr.addColorStop(0,'rgba(12,10,8,.75)');gr.addColorStop(1,'rgba(12,10,8,0)');g.fillStyle=gr;g.fillRect(c0+o-150,0,300,256)}g.filter='none'},true);
const meshTex=()=>tex(64,64,g=>{g.strokeStyle='rgba(165,172,176,1)';g.lineWidth=2;g.beginPath();for(let k=-64;k<128;k+=16){g.moveTo(k,0);g.lineTo(k+64,64);g.moveTo(k+64,0);g.lineTo(k,64)}g.stroke()},true);
const railTex=()=>tex(64,64,g=>{g.fillStyle='#c9cdd0';g.fillRect(0,0,64,6);g.fillRect(0,30,64,4);g.fillRect(0,0,5,64);g.fillRect(32,0,4,64)},true);
const cladTex=()=>tex(64,64,g=>{for(let x=0;x<64;x++){const v=200+30*Math.sin(x/64*PI*8);g.fillStyle=`rgb(${v-8},${v},${v+6})`;g.fillRect(x,0,1,64)}},true);

// ---------- materials ----------
let M=null;
function mats(MS){if(M)return M;const std=(o,s1,s2,bk)=>s1?detail(new THREE.MeshStandardMaterial(o),s1,s2,0,bk):new THREE.MeshStandardMaterial(o);
 const F=[0,1,2,3].map(facadeTex),cut=cutTex(),fac=(L,c=0xffffff,k=1)=>{const m=new THREE.MeshStandardMaterial({map:F[L].map,color:new THREE.Color(c).multiplyScalar(k),roughness:.85});if(F[L].em){m.emissiveMap=F[L].em;m.emissive=new THREE.Color(0xff8a3a);m.emissiveIntensity=2.2;m.userData.fire=1}return m};
 const tr=(o)=>Object.assign(new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,...o}),{userData:{noCast:1,noRecv:1}});
 M={conc:std({color:0x8c8a83,roughness:.9},3,19,.35),steel:MS.steel,trafo:MS.met,dark:MS.dark,tank:MS.tank,roof:MS.roof,
  gravel:std({color:0x7c766b,roughness:1},2.2,11,.45),asph:std({color:0x5a5b5a,roughness:.95},2,13,.3),earth:std({color:0x5f6540,roughness:1},1.3,7,.6),pad:std({color:0x8e897f,roughness:.92},3,19,.35),
  lawn:std({color:0x5b6a3a,roughness:1},.9,6,.5),leaf:std({color:0x2f4a22,roughness:.9},1.3,5,.6),bark:new THREE.MeshStandardMaterial({color:0x4a3b2c,roughness:1}),
  rubble:std({color:0x77716a,roughness:1,flatShading:true},.35,2.2,.9),rubbleB:std({color:0x3c3733,roughness:1,flatShading:true},.35,2.2,.9),tankB:new THREE.MeshStandardMaterial({map:sootTex('#57504a',1),roughness:.95,metalness:.05}),tankBF:new THREE.MeshStandardMaterial({map:sootTex('#4d4741',1),roughness:.95,metalness:.05,flatShading:true}),
  bconc:std({color:0x7d7a72,roughness:.95},1.4,8,.35),balc2:new THREE.MeshStandardMaterial({color:0x9fa9a6,roughness:.7}),
  trafoS:std({color:0x3b3e37,roughness:.8,metalness:.3},1,6,.4),burnt:std({color:0x2a2521,roughness:1},.8,5,.5),rust:std({color:0x4a2e1e,roughness:.95},1,6,.4),
  porc:new THREE.MeshStandardMaterial({color:0x7a3622,roughness:.25,metalness:.05}),glassI:new THREE.MeshStandardMaterial({color:0x6d9688,roughness:.15,metalness:.1}),
  brick:std({color:0x9a644a,roughness:.92},.6,4,.35),brickB:std({color:0x3a2a22,roughness:1},.6,4,.4),glass:new THREE.MeshStandardMaterial({color:0x26323c,roughness:.08,metalness:.7}),
  hole:new THREE.MeshStandardMaterial({color:0x080707,roughness:1}),fireWin:new THREE.MeshStandardMaterial({color:0x2a1206,emissive:0xff7a20,emissiveIntensity:2.4,roughness:1}),
  red:new THREE.MeshStandardMaterial({color:0xa8322a,roughness:.6}),band:new THREE.MeshStandardMaterial({color:0x2f5d8c,roughness:.5,metalness:.3}),tankRoof:new THREE.MeshStandardMaterial({color:0xc9ccc8,roughness:.5,metalness:.35}),
  tankS:new THREE.MeshStandardMaterial({color:0xdfe1dc,map:sootTex(),roughness:.85,metalness:.12}),tankIn:new THREE.MeshStandardMaterial({color:0x141210,roughness:1,side:THREE.BackSide}),
  fireSurf:new THREE.MeshStandardMaterial({color:0x000000,emissive:0xff6a14,emissiveIntensity:3,roughness:1}),pipe:new THREE.MeshStandardMaterial({color:0xa6955a,roughness:.55,metalness:.4}),
  clad:new THREE.MeshStandardMaterial({map:cladTex(),color:0xb9c3c9,roughness:.5,metalness:.4}),sand:std({color:0x9c8d68,roughness:1},.5,3,.5),
  balc:new THREE.MeshStandardMaterial({color:0xc7ccc9,roughness:.8}),car:[0x7d1f1f,0x2c3e57,0xb9bbb7,0x2d2f31,0x5c6b3a,0x8a7a5a].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.35,metalness:.5})),
  fence:new THREE.MeshStandardMaterial({map:meshTex(),alphaTest:.45,side:THREE.DoubleSide,roughness:.6,metalness:.5}),rail:new THREE.MeshStandardMaterial({map:railTex(),alphaTest:.5,side:THREE.DoubleSide,roughness:.5,metalness:.5}),
  fac:[0,1,2,3].map(L=>fac(L)),facT:[0,1,2,3].map(L=>fac(L,0xc5d1dc)),fac4:fac(3,0x6a645c),facT4:fac(3,0x5c6268),cut:new THREE.MeshStandardMaterial({map:cut,roughness:1}),
  scorch:tr({map:blobTex('8,6,5'),side:THREE.DoubleSide}),crater:tr({map:blobTex('20,16,12',1)}),spill:tr({map:blobTex('4,4,4'),opacity:.9}),dirt:tr({map:blobTex('62,48,32',1),opacity:.85})};
 for(const m of[M.fence,M.rail,M.clad])m.map.repeat.set(1,1);
 return M}

// ---------- shared parts ----------
// chain-link fence round a rectangle with a gate gap on the +z side; damage knocks panels flat or away
function fence(k,hx,hz,d,seed,gate=7){const M2=M,ph=2.4;let i=0;const side=(x0,z0,x1,z1)=>{const L=Math.hypot(x1-x0,z1-z0),n=Math.ceil(L/3),ry=-Math.atan2(z1-z0,x1-x0);
  for(let j=0;j<n;j++){const t0=j/n,t1=(j+1)/n,ax=x0+(x1-x0)*t0,az=z0+(z1-z0)*t0,bx=x0+(x1-x0)*t1,bz=z0+(z1-z0)*t1,mx=(ax+bx)/2,mz=(az+bz)/2,h=H(seed+i++,j);
   if(Math.abs(mx)<gate&&Math.abs(mz-hz)<1)continue;
   if(h<D[d]*.55)continue;const fl=h<D[d]*.8;k.box(.08,ph,.08,M2.steel,ax,0,az);
   if(fl){k.add(PLANE,M2.fence,mx,.06,mz,ry,0,0,L/n,1,ph);continue}
   k.quad(M2.fence,new V3(ax,0,az),new V3(bx,0,bz),new V3(bx,ph,bz),new V3(ax,ph,az),0,0,L/n/1.2,ph/1.2)}};
 side(-hx,-hz,hx,-hz);side(hx,-hz,hx,hz);side(hx,hz,-hx,hz);side(-hx,hz,-hx,-hz)}
function lightMast(k,x,z,h,d,seed){if(H(seed,1)<D[d]*.6){k.box(.25,.25,h*.8,M.burnt,x+1,.3,z+h*.4,0,0,0);return}k.cyl(.12,.18,h,M.steel,x,0,z,8);k.box(1.6,.35,.5,M.dark,x,h,z)}
function scatter(k,n,hx,hz,y,seed,mats2,cx=0,cz=0){for(let i=0;i<n;i++){const s=.3+H(seed+i,3)**2*1.6;k.box(s,s*(.4+H(i,seed)*.6),s*(.6+H(seed,i)*.8),mats2[i%mats2.length],cx+(H(i,seed+1)-.5)*2*hx,y,cz+(H(seed+1,i)-.5)*2*hz,H(i,i+seed)*6,H(i,2)*.6,H(3,i)*.6)}}
function decals(k,n,hx,hz,y,seed,size=8){for(let i=0;i<n;i++){const s=size*(.4+H(i,seed+4)*.9);k.decal(M.scorch,(H(i,seed)-.5)*2*hx,y+i*.003,(H(seed,i)-.5)*2*hz,s,H(i,seed+8)*6)}}
function insul(k,x,y,z,h,mat=M.porc,r=.32){k.add(insG(),mat,x,y,z,0,0,0,r,h,r)}

// ---------- substation: four transformers between fire walls, lattice gantries, switchgear, control building, fence ----------
const TX=[-36,-12,12,36];
function substation(k,d,sd){const rank=TX.map((x,i)=>i).sort((a,b)=>H(sd,a)-H(sd,b)),kill=[2,3,4,4],soot=[1,2,3,3];
 k.box(120,.4,90,M.gravel,0,0,0).solid(0,0,0,120,.4,90);k.box(122,.3,92,M.pad,0,0,0);k.box(112,.05,5,M.conc,0,.4,0);k.box(7,.05,42,M.conc,0,.4,23);k.box(1.4,.08,30,M.conc,-20,.4,15);
 fence(k,59,44,d,sd*10);lightMast(k,-55,-40,14,d,sd+1);lightMast(k,55,40,14,d,sd+2);lightMast(k,55,-40,14,d,sd+3);
 for(const[i,x]of TX.entries()){const r=rank.indexOf(i),dead=d>=kill[r],sc=d>=soot[r],cz=-12,y0=1;k.box(10,.6,8,M.conc,x,.4,cz);
  if(!dead){const tm=sc?M.trafoS:M.trafo;k.box(6.4,4.2,4.4,tm,x,y0,cz).box(6.8,.25,4.8,tm,x,y0+4.2,cz).solid(x,.4,cz,8,7.2,6);
   for(const sz of[-1,1]){for(let f=0;f<9;f++)k.box(.1,3.2,1.3,tm,x-2.4+f*.6,y0+.45,cz+sz*2.85);k.pipe(.12,5.4,tm,x,y0+3.75,cz+sz*2.3).pipe(.12,5.4,tm,x,y0+.6,cz+sz*2.3)}
   k.pipe(.62,4,tm,x,y0+5.55,cz-1.4,0,14).box(.15,1.1,.15,M.steel,x-1.3,y0+4.45,cz-1.4).box(.15,1.1,.15,M.steel,x+1.3,y0+4.45,cz-1.4);
   for(const b of[-1,0,1]){insul(k,x+b*1.9,y0+4.45,cz+1.1,2.6);k.cyl(.12,.12,.3,M.steel,x+b*1.9,y0+7.05,cz+1.1,8);insul(k,x+b*1.2,y0+4.45,cz-.2,.9,M.porc,.2)}
   if(sc){k.decal(M.scorch,x+2,.45,cz+3,9,1);k.smoke(x,y0+5,cz,.7,0x3d3a36)}}
  else{k.box(6.4,2.6,4.4,M.burnt,x,y0,cz).box(4.2,.9,4.6,M.burnt,x-1,y0+2.6,cz,.2,.08,.3).box(6.8,.25,4.8,M.rust,x+1.5,y0+2.9,cz+1.2,.5,.5,.25).solid(x,.4,cz,8,4,6);
   for(const sz of[-1,1])for(let f=0;f<9;f++)if(H(f+x,sz)>.45)k.box(.1,3.2*(.5+H(f,x)*.5),1.3,M.burnt,x-2.4+f*.6,y0+.2,cz+sz*2.85,0,(H(x,f)-.5)*.5,(H(f,f)-.5)*.6);
   k.pipe(.62,4,M.burnt,x+5.6,.62+.4,cz+3.6,.8,14);for(const b of[-1,1])insul(k,x+b*1.9,y0+2.6,cz+1.1,.6);
   scatter(k,12,6,5,.45,sd*7+i,[M.porc,M.burnt,M.rust],x,cz);k.decal(M.scorch,x,.44,cz,18,i).decal(M.spill,x+1,.46,cz+1,11,i+2);
   if(d<4)k.fire(x,y0+2.8,cz,3).fire(x+2,y0+.8,cz+3,1.6).smoke(x,y0+4,cz,1.4);else k.smoke(x,y0+3,cz,.5,0x47433f)}}
 // fire walls between the transformers
 for(const x of[-24,0,24]){if(d>=4&&H(x,sd)<.6){k.box(.4,3+H(x,1)*2,9,M.conc,x,.4,-12).box(.4,4,3,M.conc,x+2.2,.6,-9,.3,0,1.35);continue}k.box(.4,7.5,9,M.conc,x,.4,-12).solid(x,.4,-12,.4,7.5,9)}
 // lattice gantries (H-frames) where the line comes in, wires down to the transformer bushings
 const latCol=(x,z,h)=>{for(const a of[-.45,.45])for(const b of[-.45,.45])k.box(.13,h,.13,M.steel,x+a,.4,z+b);for(let y=1.5;y<h;y+=1.6){for(const s of[-1,1]){k.box(.9,.07,.07,M.steel,x,.4+y,z+s*.45).box(.07,.07,.9,M.steel,x+s*.45,.4+y,z);
    k.rod(new V3(x-.45,.4+y-1.6,z+s*.45),new V3(x+.45,.4+y,z+s*.45),.035,M.steel).rod(new V3(x+s*.45,.4+y-1.6,z-.45),new V3(x+s*.45,.4+y,z+.45),.035,M.steel)}}};
 const latBeam=(z,y,x0,x1)=>{for(const a of[-.4,.4])for(const b of[-.4,.4])k.box(x1-x0,.12,.12,M.steel,(x0+x1)/2,y+a,z+b);for(let x=x0;x<x1;x+=3)for(const s of[-1,1])k.rod(new V3(x,y-.4,z+s*.4),new V3(x+3,y+.4,z+s*.4),.035,M.steel)};
 for(const[gi,z]of[[0,10],[1,22]]){const down=d>=4||(d>=3&&gi===rank[0]%2);
  if(!down){latCol(-46,z,18);latCol(46,z,18);latBeam(z,17.4,-46,46);k.solid(-46,.4,z,1,18,1).solid(46,.4,z,1,18,1);
   for(const x of TX)for(const b of[-1,0,1]){const ax=x+b*1.9;k.add(insG(),M.glassI,ax,15.4,z,0,0,0,.18,1.6,.18);if(gi===0){const r=rank.indexOf(TX.indexOf(x));if(d<kill[r]){const p0=new V3(ax,15.3,z),p1=new V3(ax,8.6,-10.9),pts=[];for(let t=0;t<=8;t++){const q=p0.clone().lerp(p1,t/8);q.y-=Math.sin(t/8*PI)*1.2;pts.push(q)}k.wire(pts)}}
    else{const pts=[];for(let t=0;t<=8;t++){const q=new V3(ax,15.3,10+t*1.5);q.y-=Math.sin(t/8*PI)*.8;pts.push(q)}k.wire(pts)}}}
  else{latCol(-46,z,d>=4?7:18);k.at(46,0,z,0,0,1.25);latCol(0,0,16);k.at(0,.9,z+4,.14,0,.03);latBeam(0,0,-44,44);k.at();k.decal(M.scorch,0,.44,z,14,gi)}}
 // switchgear rows in front of the transformers: steel frames, post insulators, tubes
 for(const[i,x]of TX.entries()){const r=rank.indexOf(i);if(d>=kill[r]&&H(i,5)<.6)continue;k.box(.3,2.6,.3,M.steel,x-2.2,.4,2).box(.3,2.6,.3,M.steel,x+2.2,.4,2).box(5,.3,.5,M.steel,x,3,2);
  for(const b of[-1.6,0,1.6]){insul(k,x+b,3.3,2,1.4,M.porc,.22);k.pipe(.06,2.4,M.steel,x+b,4.75,3.1,PI/2)}}
 // control building: brick, two floors of windows, flat roof with parapet, steel door, AC units, cable trench to the yard
 const cb=34,cw=26,cdp=12,ch=8,wins=[];for(const sz of[-1,1])for(let f=0;f<2;f++)for(let i=0;i<6;i++)wins.push([-10+i*4,1.3+f*3.6,cb+sz*(cdp/2+.03),sz,H(i+f*6,sz+3)]);
 if(d<4){k.box(cw,ch,cdp,d>=3?M.brickB:M.brick,0,.4,cb).solid(0,.4,cb,cw,ch,cdp);const roofGone=d>=3;
  if(!roofGone){k.box(cw+.4,.35,cdp+.4,M.roof,0,ch+.4,cb);k.box(cw+.4,.7,.3,M.conc,0,ch+.75,cb-cdp/2).box(cw+.4,.7,.3,M.conc,0,ch+.75,cb+cdp/2).box(.3,.7,cdp,M.conc,-cw/2,ch+.75,cb).box(.3,.7,cdp,M.conc,cw/2,ch+.75,cb);k.cyl(.06,.06,6,M.steel,8,ch+.75,cb+2,6)}
  else{k.box(cw/2+.4,.35,cdp+.4,M.burnt,-cw/4,ch+.4,cb).box(cw/2-1,.35,cdp-1,M.burnt,cw/4,ch-1.4,cb,0,0,.35);k.box(cw-1,ch-1,cdp-1,M.hole,0,.6,cb);k.fire(6,ch,cb,3).smoke(6,ch+1,cb,1.3)}
  for(const[x,y,z,sz,h]of wins){const br=d>=1&&h<D[d]+.08,fw=d>=2&&h<D[d]*.5;k.box(2,1.5,.12,fw?M.fireWin:br?M.hole:M.glass,x,y+.4,z);k.box(2.3,.18,.3,M.conc,x,y+.3,z+sz*.1);
   if(br&&d>=2&&h<D[d]*.8)k.quad(M.scorch,new V3(x-1.6,y+1.6,z+sz*.08),new V3(x+1.6,y+1.6,z+sz*.08),new V3(x+1.6,y+4.2,z+sz*.08),new V3(x-1.6,y+4.2,z+sz*.08))}
  k.box(1.3,2.3,.15,M.dark,-cw/2-.04,.4,cb+3,PI/2).box(1.1,.9,.7,M.steel,cw/2+.4,1.4,cb-3).box(1.1,.9,.7,M.steel,cw/2+.4,1.4,cb+1);if(d>=2)k.smoke(-6,ch,cb,.6,0x48443f)}
 else{for(let i=0;i<13;i++)for(const sz of[-1,1]){const h=1.5+H(i,sz+11)*5;k.box(2,h,.4,M.brickB,-cw/2+1+i*2,.4,cb+sz*(cdp/2-.2))}for(let i=0;i<6;i++)for(const sx of[-1,1])k.box(.4,1.5+H(i,sx+4)*4.5,2,M.brickB,sx*(cw/2-.2),.4,cb-cdp/2+1+i*2);
  k.add(moundG(1),M.rubble,0,.4,cb,.5,0,0,10,2.6,4.5).add(moundG(2),M.brickB,-5,.4,cb+1,1,0,0,5,2,3.5).solid(0,.4,cb,cw,3.5,cdp);scatter(k,26,15,9,.45,sd*13,[M.brickB,M.rubble,M.burnt],0,cb);k.smoke(0,3,cb,.8,0x4a4642).smoke(-8,2,cb,.5,0x4a4642)}
 k.box(1.2,.1,40,M.conc,-14,.4,12);
 // yard damage: scorch, craters, debris
 decals(k,[0,3,7,12,18][d],52,38,.42,sd*3,9);if(d>=2)for(let i=0;i<d*2-2;i++)k.decal(M.crater,(H(i,sd+40)-.5)*100,.47+i*.002,(H(sd+40,i)-.5)*70,6+H(i,i)*5);
 scatter(k,[0,5,14,28,50][d],56,40,.4,sd*5,[M.rubble,M.burnt,M.steel,M.rust])}

// ---------- fuel depot: six storage tanks with rings, colour band, stairs and roof rail in a bunded farm, pipe manifold, pump house, loading rack ----------
const TK=[];for(const x of[-34,0,34])for(const z of[-17,17])TK.push([x,z]);
const TST=[[0,1,2,3,3],[0,0,1,2,4],[0,0,0,1,3],[0,0,0,1,4],[0,0,0,0,4],[0,0,0,0,1]];  // per damage rank: tank state at each stage (0 ok, 1 sooty, 2 roof blown + burning, 3 buckled, 4 burnt out)
function depot(k,d,sd){const R=11,rank=TK.map((t,i)=>i).sort((a,b)=>H(sd,a)-H(sd,b));
 k.box(120,.4,90,M.pad,0,0,0).solid(0,0,0,120,.4,90);fence(k,59,44,d,sd*10);lightMast(k,-55,-40,16,d,sd+1);lightMast(k,-55,40,16,d,sd+2);
 // bund walls round the farm and between tank pairs
 for(const[x,z,w,dd,h]of[[0,-31,96,.5,1.3],[0,31,96,.5,1.3],[-48,0,.5,62,1.3],[48,0,.5,62,1.3],[-17,-17,.5,27,.8],[17,-17,.5,27,.8],[-17,17,.5,27,.8],[17,17,.5,27,.8]])k.box(w,h,dd,M.conc,x,.4,z);
 for(const[i,[x,z]]of TK.entries()){const st=TST[rank.indexOf(i)][d],a0=H(i,sd)*6,y0=.4;
  if(st<=1){const sh=st?M.tankS:M.tank;k.cyl(R,R,15,sh,x,y0,z,40).solidC(x,z,R,y0,y0+17);for(const y of[5,10])k.cyl(R+.08,R+.08,.3,M.tank,x,y0+y,z,40,true);k.cyl(R+.05,R+.05,1.6,M.band,x,y0+11.6,z,40,true);
   k.add(coneG(40),M.tankRoof,x,y0+16.1,z,0,0,0,R+.25,2.2,R+.25);k.cyl(R+.1,R+.1,.9,M.rail,x,y0+15,z,40,true);k.cyl(.5,.5,.8,M.steel,x,y0+17,z,8);
   for(let s=0;s<38;s++){const a=a0+s*.05,rr=R+.7;k.box(1.1,.08,.55,M.steel,x+Math.cos(a)*rr,y0+.4+s*.385,z+Math.sin(a)*rr,-a);if(s%3===0)k.box(.06,1,.06,M.steel,x+Math.cos(a)*(R+1.25),y0+.4+s*.385,z+Math.sin(a)*(R+1.25))}
   k.cyl(.14,.14,15.6,M.red,x+Math.cos(a0+PI)*(R+.3),y0,z+Math.sin(a0+PI)*(R+.3),8);k.box(1.4,1.4,.6,M.tankRoof,x+Math.cos(a0+2)*(R+.2),y0+.6,z+Math.sin(a0+2)*(R+.2),-a0-2+PI/2);
   if(st)k.smoke(x+Math.cos(a0)*5,y0+17,z+Math.sin(a0)*5,.8,0x3f3b37).decal(M.scorch,x+Math.cos(a0)*R,.44,z+Math.sin(a0)*R,12,a0)}
  else if(st===2||st===4){const sh=st===2?M.tankS:M.tankB;k.cyl(R,R,13.5,sh,x,y0,z,40,true).cyl(R-.05,R-.05,13.5,M.tankIn,x,y0,z,40,true).solidC(x,z,R,y0,y0+13.5);for(const y of[5,10])k.cyl(R+.08,R+.08,.3,sh,x,y0+y,z,40,true);
   k.add(coneG(20),M.burnt,x+Math.cos(a0)*20,1.6,z+Math.sin(a0)*17,a0,.5,.2,7,1.2,6).add(coneG(20),M.burnt,x-Math.cos(a0)*16,1,z+Math.sin(a0)*19,a0+2,-.35,.1,5,1,4);
   if(st===2){k.add(DISC,M.fireSurf,x,y0+8,z,0,0,0,R*2-.3,1,R*2-.3).fire(x,y0+12,z,7).fire(x+3,y0+14,z-2,4).smoke(x,y0+16,z,2.2)}else k.smoke(x,y0+8,z,.7,0x4a4642);
   k.decal(M.scorch,x,.44,z,30,a0)}
  else{k.add(buckleG(i%3),M.tankBF,x,y0+4,z,a0,0,0,R*1.05,8,R*1.05).solidC(x,z,R,y0,y0+8);k.decal(M.spill,x+3,.45,z,34,a0).decal(M.scorch,x-4,.46,z+2,30,a0+1);
   if(d<4)k.fire(x,y0+6,z,5).fire(x+6,1.5,z+8,3).smoke(x,y0+9,z,2);else k.smoke(x,y0+5,z,.8,0x45413c);scatter(k,8,R,R,.4,i*7+sd,[M.burnt,M.rust],x,z)}}
 // pipe manifold on sleepers between the rows, branches to each tank, pump house and truck loading rack to the east
 for(let x=-46;x<56;x+=6){const brk=d>=3&&H(x,sd+5)<D[d]*.5;k.box(.6,.5,2.6,M.conc,x,.4,0);if(brk){k.pipe(.25,6,M.burnt,x+3,1,-.8,.4).pipe(.25,5.4,M.burnt,x+3,.7,.8,-.3);if(d<4)k.fire(x+3,1.2,0,1.4);continue}
  for(const z of[-.8,0,.8])k.pipe(.25,6,M.pipe,x+3,1.15,z)}
 for(const[x,z]of TK){const s=Math.sign(z),za=z-s*R,zb=s*.8;k.add(cylG(.2,.2,10),M.pipe,x+5,1.15,(za+zb)/2,0,PI/2,0,1,Math.abs(za-zb),1)}
 const ph=d>=3;if(d<4){k.add(tboxG(8,4.5,7,4,4.5),M.clad,53,.4+2.25,14).solid(53,.4,14,8,4.5,7);if(!ph)k.box(8.4,.3,7.4,M.roof,53,4.9,14);else k.box(7.6,4,6.6,M.hole,53,.5,14).smoke(53,5,14,.9).fire(53,4,14,1.5)}
 else{k.box(8,2,7,M.burnt,53,.4,14).add(moundG(3),M.burnt,53,.4,14,0,0,0,5,2.2,4);}
 // loading rack: canopy on four columns over a tanker truck
 const cx=53,cz=-20,down=d>=4;for(const sx of[-3.5,3.5])for(const sz of[-7,7])k.box(.4,down&&sx>0?2.5:6,.4,M.steel,cx+sx,.4,cz+sz);
 if(!down)k.add(tboxG(9,.4,16,4,4),M.clad,cx,6.6,cz);else k.add(tboxG(9,.4,16,4,4),M.burnt,cx+.5,4,cz,0,0,.5);
 const trk=d>=3?M.burnt:M.tank,cab=d>=3?M.burnt:M.car[0];k.box(2.4,.5,11,M.dark,cx,1,cz).pipe(1.25,8.4,trk,cx,2.75,cz-1,PI/2,18).box(2.5,2.4,2.2,cab,cx,1.1,cz+5.4);for(const z of[-4.5,-3,3,5.4])k.pipe(.5,2.5,M.dark,cx,.9,cz+z,0,12);
 if(d===3)k.fire(cx,3,cz,2.5).smoke(cx,5,cz,1.2);
 decals(k,[0,3,7,12,18][d],55,40,.42,sd*3,10);scatter(k,[0,5,12,24,44][d],56,40,.4,sd*5,[M.rubble,M.burnt,M.rust,M.steel])}

// ---------- apartments: four nine-storey panel blocks and a sixteen-storey tower, built as columns (stair section × front/back half)
// so damage takes floors off the top of a column and the neighbours show the cut (rooms and floor slabs); collapsed columns leave rubble ----------
const BL=[[-46,-34,66,14,9,5],[46,-34,66,14,9,5],[-46,34,66,14,9,5],[46,34,66,14,9,5],[0,0,22,22,16,2]];
function heights(sd,d){return BL.map(([,, , ,nf,ns],b)=>{const out=[];let worst=-1,wv=-1;for(let i=0;i<ns;i++)for(let j=0;j<2;j++){const a=H(sd+b*10+i,j+3);if(a>wv){wv=a;worst=i}}
 for(let i=0;i<ns;i++){out.push([0,1].map(j=>{const a=H(sd+b*10+i,j+3),sc=D[d]*(.35+1.25*a);let m=Math.floor(Math.max(0,(sc-.22)/.78)*nf+.3);
  if(d>=1&&i===worst&&b===((sd*7)|0)%5)m=Math.max(m,j?1:2);if(d>=3&&i===worst&&b===((sd*3)|0)%4)m=nf-(d>=4?0:1);return Math.max(0,nf-m)}))}return out})}
function apartments(k,d,sd){const FH=3,hs=heights(sd,d),L=Math.min(d,3);
 // microdistrict ground: lawns, asphalt driveways and parking, footpaths to the entrances, courtyard trees
 k.box(184,.1,146,M.lawn,0,0,0);for(const z of[-62,62])k.box(150,.03,10,M.asph,0,.1,z);for(const z of[-50,50])k.box(176,.03,6,M.asph,0,.1,z);k.box(6,.03,140,M.asph,0,.1,0);for(const z of[-34,34])k.box(150,.03,2.4,M.pad,0,.1,z-9);
 for(let i=0;i<22;i++){const x=(H(i,41)-.5)*170,z=(H(41,i)-.5)*130;if(BL.some(([bx,bz,w,dd])=>Math.abs(x-bx)<w/2+5&&Math.abs(z-bz)<dd/2+5)||Math.abs(Math.abs(z)-56)<10||Math.abs(x)<6)continue;const h=6+H(i,i)*5,bt=d>=3&&H(i,7)<D[d]*.8;
  k.cyl(.2,.3,h*.5,bt?M.burnt:M.bark,x,.1,z,6);if(!bt||d<4)k.add(sphG(8,6),bt?M.burnt:M.leaf,x,h*.62,z,0,0,0,h*.28,h*.32,h*.28)}for(const[x,z]of[[-46,-62],[46,-62],[-46,62],[46,62]])for(let i=0;i<10;i++){const h=H(i+x,z),bt=d>=2&&h<D[d]*.7;k.box(4.2,.85,1.8,bt?M.burnt:M.car[(i+(x>0?2:0))%6],x-27+i*6,.12,z+(H(z,i)-.5)*2,PI/2+(h-.5)*.12).box(2.2,.6,1.6,bt?M.burnt:M.dark,x-27+i*6,.97,z+(H(z,i)-.5)*2,PI/2+(h-.5)*.12);if(bt&&d<4&&i%4===0)k.fire(x-27+i*6,1.5,z,1)}
 for(const[b,[cx,cz,W,Dp,nf,ns]]of BL.entries()){const hh=hs[b],cw=W/ns,cd=Dp/2,tw=b===4,fac=d>=4?(tw?M.facT4:M.fac4):(tw?M.facT:M.fac)[L],uo=H(b,sd)*24,
   hgt=(i,j)=>i<0||j<0||i>=ns||j>=2?-1:hh[i][j];
  for(let i=0;i<ns;i++)for(let j=0;j<2;j++){const h=hgt(i,j),x0=cx-W/2+i*cw,x1=x0+cw,z0=cz-Dp/2+j*cd,z1=z0+cd,top=h*FH,miss=nf-h;
   if(h>0){
    // walls: outside faces carry the facade, faces onto a shorter neighbour show the cut above it
    const face=(ni,nj,a,b2,ux)=>{const n=hgt(ni,nj);if(n<0)k.quad(fac,new V3(a[0],0,a[1]),new V3(b2[0],0,b2[1]),new V3(b2[0],top,b2[1]),new V3(a[0],top,a[1]),(ux[0]+uo)/24,0,(ux[1]+uo)/24,top/27);
     else if(n<h)k.quad(M.cut,new V3(a[0],n*FH,a[1]),new V3(b2[0],n*FH,b2[1]),new V3(b2[0],top,b2[1]),new V3(a[0],top,a[1]),ux[0]/12,n*FH/12,ux[1]/12,top/12)};
    face(i,j-1,[x1,z0],[x0,z0],[x1,x0]);face(i,j+1,[x0,z1],[x1,z1],[x0,x1]);face(i-1,j,[x0,z0],[x0,z1],[z0,z1]);face(i+1,j,[x1,z1],[x1,z0],[z1,z0]);
    k.box(cw+.25,.9,cd+.25,M.conc,(x0+x1)/2,0,(z0+z1)/2);
    if(!miss){k.box(cw,.3,cd,M.roof,(x0+x1)/2,top,(z0+z1)/2);for(const[nx,nz,px,pz,w2,d2]of[[i,j-1,(x0+x1)/2,z0,cw,.25],[i,j+1,(x0+x1)/2,z1,cw,.25],[i-1,j,x0,(z0+z1)/2,.25,cd],[i+1,j,x1,(z0+z1)/2,.25,cd]])if(hgt(nx,nz)<0)k.box(w2,.9,d2,M.conc,px,top,pz);
     if(j===1&&!tw)k.box(3,2.4,4,M.conc,x0+cw/2,top+.3,z0+cd/2);if(H(i,b+j)<.4)k.cyl(.04,.04,3.5,M.steel,x0+2,top+.3,z0+2,5).box(1.6,.05,.05,M.steel,x0+2,top+3,z0+2)}
    else{k.quad(M.cut,new V3(x0,top,z1),new V3(x1,top,z1),new V3(x1,top,z0),new V3(x0,top,z0),0,0,cw/12,cd/12);for(let r=0;r<4;r++){const rx=x0+H(i+r,j)*cw,rz=z0+H(j,i+r)*cd;k.box(1.5+H(r,i)*3,.3,1.2+H(i,r)*2,M.conc,rx,top-.1,rz,H(r,j)*3,(H(j,r)-.5)*.6,(H(r,r+j)-.5)*.8)}
     for(let r=0;r<6;r++)k.box(.05,.8+H(r,i+j)*1.2,.05,M.rust,x0+H(r+i,7)*cw,top,z0+H(7,r+j)*cd,0,(H(r,1)-.5)*.8,(H(1,r)-.5)*.8);
     if(d<4&&H(i,j+b)<.4)k.fire((x0+x1)/2,top+.5,(z0+z1)/2,2.2).smoke((x0+x1)/2,top+2,(z0+z1)/2,1.2);else if(H(i+1,j+b)<.5)k.smoke((x0+x1)/2,top+1,(z0+z1)/2,.6,0x4a4642)}
    // balconies on the south face, entrance canopies on the north
    if(j===1&&!tw)for(let f=1;f<h;f++)for(const u of[.25,.75]){const bx=x0+cw*u;if(d>=2&&H(bx,f)<D[d]*.35)continue;const bm=d>=4||d>=3&&H(f,bx)<D[d]*.5?M.burnt:H(bx,f+.5)<.35?M.balc2:M.balc;k.box(2.8,.16,1.2,bm,bx,f*FH-.1,z1+.6).box(2.8,1,.08,bm,bx,f*FH+.06,z1+1.16)}
    if(j===0&&!tw&&d<4){k.box(3.2,.2,1.6,M.conc,(x0+x1)/2,2.9,z0-.8).box(1.6,2.3,.1,M.dark,(x0+x1)/2,0,z0-.04)}}
   if(miss>0){const v=(i+j+b)%3,amt=Math.min(1,miss/nf),mx=(x0+x1)/2+(j?2:-2),mz=(z0+z1)/2+(j?3:-3),sx=cw*.6+amt*5,sy=.8+amt*(tw?4.5:3.2),sz=cd*.75+amt*4;k.add(moundG(v),h>0||d<4?M.rubble:M.rubbleB,mx,0,mz,H(i,j)*6,0,0,sx,sy,sz);
    // slabs, panels and furniture-sized chunks lying on the heap and spilled round it
    for(let r=0;r<6+miss*2;r++){const a=H(r,i+b*7)*6.3,t=Math.sqrt(H(i+b*7,r))*.85,px=mx+Math.cos(a)*t*sx,pz=mz+Math.sin(a)*t*sz,s=.5+H(r,j+3)*2.2;k.box(s*(1+H(r,5)),s*.25+.1,s,[M.rubble,M.conc,M.cut,M.rubbleB,M.balc][r%5],px,sy*(1-t*t)*.85-.2,pz,a*3,(H(r,9)-.5)*1.2,(H(9,r)-.5)*1.2)}
    scatter(k,4+miss,cw*.6,cd*.9,.1,b*50+i*5+j,[M.rubble,M.rubbleB,M.conc],(x0+x1)/2,(z0+z1)/2+(j?cd:-cd))}}
  // collision: one box per column run of equal height
  for(let j=0;j<2;j++){let i0=0;for(let i=1;i<=ns;i++)if(i===ns||hh[i][j]!==hh[i0][j]){const h=Math.max(hh[i0][j]*FH,1.6),x0=cx-W/2+i0*cw,x1=cx-W/2+i*cw;k.solid((x0+x1)/2,0,cz-Dp/2+(j+.5)*cd,x1-x0,h,cd);i0=i}}}
 decals(k,[0,3,6,10,16][d],80,62,.14,sd*3,9);scatter(k,[0,5,14,30,60][d],85,66,.12,sd*5,[M.rubble,M.rubbleB,M.balc])}

// ---------- command bunker: earth-covered, concrete portal with a blast door, sandbag walls, vents and an antenna mast ----------
// earth mound: a flat top (tw × td) easing down to the footprint (w × dp) with rounded corners, lumpy; cr digs a crater into the top
function moundShape(w,dp,h,tw,td,cr,sd){const g=new THREE.PlaneGeometry(w+2,dp+2,30,20).rotateX(-PI/2),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),dx=Math.max(0,Math.abs(x)-tw/2)/((w-tw)/2),dz=Math.max(0,Math.abs(z)-td/2)/((dp-td)/2),r=Math.min(1,Math.hypot(dx,dz)),
  t=1-r*r*(3-2*r);let y=h*t+(r<1?.35*(vnoise(x*.5+sd,z*.5)-.5)*t:0)-.05;if(cr)y-=cr*Math.max(0,1-Math.hypot(x/(tw*.45),z/(td*.6)))**.7;p.setY(i,y)}g.computeVertexNormals();return NI(g)}
function bunkerKit(k,d,sd){const top=[4.6,4.6,4.4,3.6,2.2][d];k.at(0,0,0,PI);k.add(moundShape(25,17,top,14,8,d>=3?(d>=4?2.2:1.5):0,sd),M.earth,0,0,0).solid(0,0,0,22,top,14);
 if(d>=2)k.decal(M.dirt,-2,top-.2,-1,8+d*2,sd).decal(M.dirt,6,2.2,5,6,sd+2);
 // portal and blast door (on the south side, towards the road), wing walls and sandbags
 if(d<3){k.box(7,4.2,2.2,M.bconc,0,0,-8.6).box(2.6,2.8,.2,M.dark,0,0,-9.75).box(.4,3,4,M.bconc,-3.8,0,-10.2,.5).box(.4,3,4,M.bconc,3.8,0,-10.2,-.5)}
 else{k.box(7,2.4,2.2,M.bconc,0,0,-8.6).box(4,1.6,2,M.bconc,1.8,2.4,-8.4,.1,.15,.3).box(2.6,2.4,.2,M.burnt,0,0,-9.8,0,.12).add(moundG(4),M.rubble,-1,0,-11,0,0,0,3,1.4,2);if(d<4)k.fire(0,1.5,-9.5,1.4)}
 for(const s of[-1,1])for(let r=0;r<3;r++)for(let i=0;i<6;i++){const h=H(i+r*6,s+sd);if(h<D[d]*.6)continue;const fl=h<D[d]*.9;k.add(sphG(),M.sand,s*(3.4+i*.75)+(fl?(h-.5)*3:0),fl?.2:.2+r*.4,-11.6+(fl?h*2:0),(h-.5)*.4,0,0,.42,.21,.3)}
 // vents and mast
 for(const[i,x]of[[0,-4],[1,4]].values()){if(d>=2&&i===0||d>=4){k.cyl(.45,.45,.4,M.burnt,x,top-.3,1.5,10);continue}k.cyl(.45,.45,1.4,M.bconc,x,top-.2,1.5,10).cyl(.65,.65,.15,M.bconc,x,top+1.5,1.5,10)}
 if(d<3){k.cyl(.08,.1,12,M.steel,8,top-.2,3.5,6);for(const y of[6,9])k.box(2,.08,.08,M.steel,8,top+y,3.5);for(const a of[-1,1])k.rod(new V3(8+a,top+9,3.5),new V3(8+a*(d>=1?2.2:1),top+12.5,3.5+(d>=1?a*.8:0)),.03,M.dark);k.add(sphG(10,5),M.steel,0,4.6,-8,0,-.7,0,.7,.25,.7)}
 else k.box(.2,.2,11,M.burnt,9,top,4,.6,-.1,.1);
 if(d>=1)k.decal(M.scorch,2,top+.05,1,6+d*2,sd);if(d>=2)k.decal(M.crater,-3,top+.08,-2,7,sd+1);
 if(d>=3){k.add(moundG(5),M.rubble,0,top-.8,0,0,0,0,4,1.2,3).box(4,.5,3,M.bconc,2,top-.6,-1,.4,.4,.2).box(3,.5,2.5,M.bconc,-2,top-.5,1.5,1,-.35,.25);for(let r=0;r<6;r++)k.box(.05,1.4,.05,M.rust,(H(r,2)-.5)*5,top-.6,(H(2,r)-.5)*3,0,(H(r,3)-.5),(H(3,r)-.5));
  if(d<4)k.fire(0,top,0,2).smoke(0,top+1,0,1.4);else k.smoke(0,top,0,.7,0x4a4642)}
 scatter(k,[0,4,10,20,34][d],12,9,0,sd*5,[M.rubble,M.burnt,M.sand]);k.at()}

// ---------- village houses (instanced in interceptor.js): plastered walls with windows and gable ends, a gable roof with a chimney ----------
export const houseTex=()=>tex(256,128,g=>{g.fillStyle='#e8e2d4';g.fillRect(0,0,256,128);for(let i=0;i<300;i++){g.fillStyle=`rgba(${Math.random()<.5?'0,0,0':'255,255,255'},.04)`;g.fillRect(Math.random()*256,Math.random()*128,6,4)}
 g.fillStyle='#a49b8a';g.fillRect(0,112,256,16);for(const x of[38,128,218]){g.fillStyle='#f4f1ea';g.fillRect(x-17,34,34,46);const r=g.createLinearGradient(0,38,0,76);r.addColorStop(0,'#62717d');r.addColorStop(1,'#26303a');g.fillStyle=r;g.fillRect(x-14,37,28,40);
  g.fillStyle='#f4f1ea';g.fillRect(x-1.5,37,3,40);g.fillRect(x-14,52,28,3);g.fillStyle='#5b6f8a';g.fillRect(x-22,34,6,46);g.fillRect(x+16,34,6,46)}});
export function houseWallGeo(){const b=NI(new THREE.BoxGeometry(1,1,1).translate(0,.5,0)),P=[],N=[],U=[];
 for(const s of[-1,1]){P.push(-.5,1,s*.5,.5,1,s*.5,0,1.75,s*.5);if(s<0)P.splice(P.length-9,9,.5,1,-.5,-.5,1,-.5,0,1.75,-.5);for(let i=0;i<3;i++)N.push(0,0,s);U.push(.02,.9,.1,.9,.06,.98)}
 const g=new THREE.BufferGeometry(),bp=b.attributes.position.array,bn=b.attributes.normal.array,bu=b.attributes.uv.array;
 g.setAttribute('position',new THREE.Float32BufferAttribute([...bp,...P],3));g.setAttribute('normal',new THREE.Float32BufferAttribute([...bn,...N],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([...bu,...U],2));return g}
export function houseRoofGeo(){const P=[],q=(a,b,c,d)=>P.push(...a,...b,...c,...a,...c,...d);q([-.5,0,.5],[0,1,.5],[0,1,-.5],[-.5,0,-.5]);q([.5,0,-.5],[0,1,-.5],[0,1,.5],[.5,0,.5]);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.computeVertexNormals();g.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(P.length/3*2).fill(0),2));
 const c=NI(new THREE.BoxGeometry(.07,.55,.06).translate(.2,.85,.18)),m=new THREE.BufferGeometry();for(const a of['position','normal','uv'])m.setAttribute(a,new THREE.Float32BufferAttribute([...g.attributes[a].array,...c.attributes[a].array],a==='uv'?2:3));return m}

// ---------- site registry, damage stages, fire and smoke ----------
// {scene,renderer,camera,psys,MS}: build(s,type) builds a site's stage 0 now (aims and solids included); step(dt,on) follows HP while on
// impact points (where the threats aim): transformer tops, tank roofs, block roofs
const AIMS={substation:s=>{for(const x of TX)s.aims.push(new V3(s.x+x,s.y+7,s.z-12))},depot:s=>{for(const[x,z]of TK)s.aims.push(new V3(s.x+x,s.y+16,s.z+z))},
 apartments:s=>{for(const[x,z,,,nf]of BL)s.aims.push(new V3(s.x+x,s.y+nf*3,s.z+z))}};
export function initBuildings({scene,renderer,camera,psys,MS}){mats(MS);const reg=[],B={substation,depot,apartments,bunker:bunkerKit},FIRE=psys(1400,3.2,THREE.AdditiveBlending,-5,1.6),SMOKE=psys(1600,17,THREE.NormalBlending,-2.2,.35);
 let ready=false,t=0;const _p2=new V3(),_b=new V3();
 function stage(s,d){const k=Kit();B[s.type](k,d,s.sd);const G=bake(k,s);G.visible=d===0;s.root.add(G);
  return{G,sol:k.sol.map(o=>o.c?{...o,x:o.x+s.x,z:o.z+s.z,y0:o.y0+s.y,y1:o.y1+s.y}:{...o,x:o.x+s.x,y:o.y+s.y,z:o.z+s.z}),fx:k.fx.map(f=>({...f,x:f.x+s.x,y:f.y+s.y,z:f.z+s.z,tt:Math.random()}))}}
 function build(s,type){s.type=type;s.sd=reg.length+1.7;s.stg=0;s.root=new THREE.Group();scene.add(s.root);s.mesh=s.mesh||s.root;AIMS[type]?.(s);
  s.st=[stage(s,0)];s.sol.length=0;s.sol.push(...s.st[0].sol);reg.push(s);return s.root}
 // all damage stages for every site, then compile their shaders once with everything briefly visible (Zombies' first frame, behind the base screen)
 function prepare(){ready=true;for(const s of reg)for(let d=1;d<5;d++)s.st[d]=stage(s,d);
  const vis=[];for(const s of reg){vis.push([s.mesh,s.mesh.visible]);s.mesh.visible=true;for(const x of s.st)x.G.visible=true}try{renderer.compile(scene,camera)}catch(e){}
  for(const[o,v]of vis)o.visible=v;for(const s of reg)s.st.forEach((x,d)=>x.G.visible=d===s.stg)}
 function setStage(s,d){if(d===s.stg)return;s.st[s.stg].G.visible=false;s.st[d].G.visible=true;s.stg=d;if(!s.noSol){s.sol.length=0;s.sol.push(...s.st[d].sol)}}
 function step(dt,on,plume){t+=dt;if(on&&!ready)prepare();
  for(const s of reg){const d=on&&s.max?stageOf(Math.max(0,s.hp)/s.max):0;if(d!==s.stg&&s.st[d])setStage(s,d);if(!s.stg||!s.mesh.visible||dt<=0)continue;
   for(const f of s.st[s.stg].fx){if((f.tt-=dt)>0)continue;
    if(f.f){f.tt=.05;const n=Math.ceil(f.r*.8);for(let i=0;i<n;i++){_p2.set(f.x+(Math.random()-.5)*f.r*1.6,f.y+Math.random()*f.r*.4,f.z+(Math.random()-.5)*f.r*1.6);FIRE.emit(_p2,Math.random()<.5?0xff8a2a:0xffb347,1,f.r*.35,.9,_b.set(0,3+f.r,0),2.2)}}
    else if(plume){f.tt=.5/Math.max(.6,f.r)*(.8+.4*Math.random());_p2.set(f.x+(Math.random()-.5)*f.r*2,f.y,f.z+(Math.random()-.5)*f.r*2);plume(_p2,f.r,f.c===0x1c1a18)}
    else{f.tt=.2/Math.max(.5,f.r);_p2.set(f.x+(Math.random()-.5)*f.r*2,f.y,f.z+(Math.random()-.5)*f.r*2);SMOKE.emit(_p2,f.c,1,1+f.r*.4,8+f.r*2,_b.set(0,3+f.r*2.5,0),1,f.c===0x1c1a18?.42:.3)}}}
  const k=1+.25*Math.sin(t*13)+.15*Math.sin(t*31);for(const m of[...M.fac,...M.facT,M.fac4,M.facT4,M.fireWin,M.fireSurf])if(m.emissiveMap||m===M.fireWin||m===M.fireSurf)m.emissiveIntensity=(m===M.fireSurf?3:2.3)*k;
  FIRE.upd(dt);SMOKE.upd(dt)}
 return{build,step,stageOf,prepare,setStage,get ready(){return ready}}}
