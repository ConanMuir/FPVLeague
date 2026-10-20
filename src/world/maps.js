// ---------- maps: Neon Arena + outdoor maps. Visual only: every map shares the arena collision shape ----------
import * as THREE from 'three';
import {COL,GD,GW,HL,HW,L,RF,V3,W,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {onTune} from '../config/tune.js';
import {dot} from '../render/particles.js';
import {bloom,fitShadow,hemi,qId,renderer,scaleUV,scene,sun,tex} from '../render/renderer.js';
import {GS} from '../state.js';
import {GOALF,NETM,RIML,floorM,gridTex,mouthM,neonG,outer,pitchLines,rampM,wallM} from './arena.js';
import {fbm,sm,vnoise} from './noise.js';
import {UT,applyQ,buildProps,buildStadium,offR,terrainGeo,terrainMat,turfNormal,waterMat} from './outdoor.js';
export let lookBK=1,mapId='',uvDone=false;export const mapMat={},mapG={};
onTune(T=>{bloom.strength=T.bloom*lookBK});  // was part of applyTune()
const edgeD=(x,z)=>Math.hypot(Math.max(Math.abs(x)-HW-20,0),Math.max(Math.abs(z)-HL-20,0));
// outdoor map recipes: sky gradient, sun, turf [hue,±,sat,±,light,±], ramp tile [base,hue,±,light,±], hills/mountains/mesas, prop count n,
// water (lake/river carved into the terrain; ice on Alpine), D terrain colour layers (outdoor.js terrainGeo), st stadium palette (buildStadium), rules prop species by place
export const OUT={
 meadow:{name:'Meadow',sky:['#1d58b0','#4f8fd8','#acd0f0','#dcebf4','#a7bf9c','#46663a'],sun:[-.5,.62,.6],sc:0xfff0d8,si:3.2,hemi:[0xd8e9ff,0x56703a,1.1],fog:0xcfe0ee,
  turf:[92,22,42,18,27,12],tile:['#3c8731',88,30,20,24],line:'rgba(255,255,255,.88)',wall:0xf2f8ff,hill:55,mtn:190,n:2600,clouds:32,ct:0xffffff,
  water:{t:'lake',x:HW+330,z:-150,rx:125,rz:80,d:-7,wl:-1.6,col:0x2f5a6a},
  D:{g1:'#3a6a26',g2:'#7d9645',rock:'#8a857a',rock2:'#5c5952',snow:'#f2f5f8',bed:'#3c4a3e',snowY:175,rockY:125,bump:.5},
  st:{conc:'#bfc3c8',seat:'#e4e7ea',pave:'#b8b2a6',facade:'#d9dde2',win:'#4d6a86',lit:.05,roof:'#eef2f6',roofTop:'#cdd4dc',steel:'#7d8792',lampC:0xfff4e0,lamp:1.15},
  rules:(x,z,y,sl,d,o,r)=>{if(sl>.45)return r()<.25?['rockM',3+r()*6]:null;if(y>150)return r()<.3?['rockM',3+r()*6]:null;if(d<.5&&r()>.16)return null;const v=r();
   if(v<.07)return['rockM',2+r()*5];if(v<.22)return['bush',5+r()*4];if(y>70||v<.45&&d>.62)return['pine',14+r()*10];if(v<.55)return['poplar',15+r()*8];if(v<.66)return['birch',11+r()*6];return['oak',11+r()*8,1.5]}},
 canyon:{name:'Canyon (sunset)',sky:['#26346e','#6d5c9e','#ee9a6a','#ffcf9a','#c98d5e','#6e4226'],sun:[.72,.16,-.66],sc:0xffb070,si:2.8,hemi:[0xffcfa6,0x8a5030,.95],fog:0xe9b78e,
  turf:[78,18,34,14,31,10],tile:['#b98c5a',28,14,45,20],line:'rgba(255,248,235,.85)',wall:0xffe6cc,hill:22,mtn:130,mesa:95,n:1800,clouds:14,ct:0xffc8a0,
  water:{t:'river',x:-HW-215,a:38,p:170,w:30,d:-8,wl:-2.4,col:0x2f6a62},
  D:{g1:'#c48a58',g2:'#d8a46c',rock:'#b05a34',rock2:'#7c3c22',snow:'#f0e0d0',bed:'#5a4a3a',sand:1,strata:1,band:1,bump:.7},
  st:{conc:'#cfa686',seat:'#efe2d2',pave:'#c99a72',facade:'#c9946a',win:'#5a3a2a',lit:.35,roof:'#f0e2d0',roofTop:'#9a4e30',steel:'#4c3e38',lampC:0xffe2b0,lamp:2},
  rules:(x,z,y,sl,d,o,r)=>{if(sl>.5)return r()<.12?['rockR',4+r()*8]:null;const v=r();if(v<.035&&o>170)return['hoodoo',24+r()*30];if(v<.22)return['rockR',2+r()*(o>200?12:5)];
   if(v<.48)return d>.42?['scrub',4+r()*4]:null;if(v<.74)return['cactus',8+r()*8];if(v<.8)return['dead',8+r()*7];return d>.5?['scrub',3+r()*3]:null}},
 alpine:{name:'Alpine (snow)',sky:['#2f62a0','#6f9fd2','#c8dcee','#eef4f8','#dfe7ef','#b4c2d0'],sun:[.3,.45,.8],sc:0xfff6ee,si:2.6,hemi:[0xe8f0ff,0x9aa8b8,1.05],fog:0xdde8f2,
  turf:[98,18,34,12,25,10],tile:['#b4c2d0',210,14,74,10],line:'rgba(255,255,255,.92)',wall:0x1c64d8,wo:.3,exp:.9,hill:70,mtn:360,n:2800,clouds:38,ct:0xffffff,snow:1,
  water:{t:'lake',x:-60,z:-HL-310,rx:190,rz:95,d:-6,wl:-1.4,col:0x8fb8d4,ice:1},
  D:{g1:'#e9eff6',g2:'#dbe5ef',rock:'#62666d',rock2:'#3c4148',snow:'#f3f7fb',bed:'#9fb8cc',allSnow:1,bump:.6},
  st:{conc:'#9aa4ae',seat:'#d5dce4',pave:'#e3e9f0',facade:'#6b4e38',win:'#2a3a4a',lit:.25,roof:'#3d4854',roofTop:'#f2f6fa',steel:'#2f363e',lampC:0xf4f8ff,lamp:1.3},
  rules:(x,z,y,sl,d,o,r)=>{if(sl>.5||y>240)return r()<.25?['rockS',4+r()*10]:null;const v=r(),w=OUT.alpine.water,ld=Math.hypot((x-w.x)/w.rx,(z-w.z)/w.rz);
   if(ld>1.25&&ld<1.7&&v<.06)return['cabin',10+r()*3];if(v<.1)return['rockS',2+r()*6];if(v<.18)return['mound',6+r()*8];if(d<.42&&r()>.22)return null;return['snowpine',13+r()*12]}}};
function hgt(c,x,z){const e=edgeD(x,z),f=sm((offR(x,z)-95)/110);let y=f*sm(e/90)*(fbm(x/140,z/140)*c.hill+e*.05)+cl((e-380)/220,0,1)*fbm(x/90+7,z/90)*c.mtn;
 if(c.mesa)y+=f*sm(e/50)*cl((fbm(x/170+3,z/170-2)-.5)*14,0,1)*c.mesa*(.7+.3*vnoise(x/40,z/40));
 const w=c.water;if(w){const d=w.t==='river'?Math.abs(x-w.x-w.a*Math.sin(z/w.p+1))/w.w:Math.hypot((x-w.x)/w.rx,(z-w.z)/w.rz);y+=(w.d-y)*(w.t==='river'?sm((1.25-d)/.5):sm((2.4-d)/1.5)*.35+sm((1.25-d)/.4)*.65)}return y-.06-1.4*(1-sm(e/40))}  // sunk 1.5 m under the pitch and stands (the turf sat 6 cm above it and z-fought far away), back to ground level 40 m out
export function skyTex(c){const d=new V3(...c.sun).normalize(),t=tex(1024,512,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);[0,.3,.46,.5,.53,1].forEach((s,i)=>gr.addColorStop(s,c.sky[i]));g.fillStyle=gr;g.fillRect(0,0,w,h);
 const u=(Math.atan2(d.z,d.x)/(2*Math.PI)+.5)*w,v=(.5-Math.asin(d.y)/Math.PI)*h,r=g.createRadialGradient(u,v,0,u,v,h*.4);r.addColorStop(0,'rgba(255,248,225,.9)');r.addColorStop(.12,'rgba(255,240,205,.4)');r.addColorStop(1,'rgba(255,240,205,0)');g.fillStyle=r;g.fillRect(0,0,w,h)});
 t.mapping=THREE.EquirectangularReflectionMapping;return t}
// per-map look: background, fog, hemisphere [sky, ground, intensity], sun [colour, intensity], sun position, shadow frustum [half w, half h, far], exposure,
// bloom: bk (x the Glow slider), th (threshold, linear luminance: only glow materials should pass it), br (radius)
// Neon Arena reflections: a dark bowl with the four light towers, a ring of crowd light and team-coloured ends, prefiltered once (PMREM)
const neonEnv=(()=>{const s=new THREE.Scene(),add=(geo,c,x,y,z,side)=>{const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:c,side}));m.position.set(x,y,z);s.add(m);m.lookAt(0,0,0);return m};
 add(new THREE.SphereGeometry(60,32,16),0x06080f,0,0,0,THREE.BackSide);add(new THREE.CylinderGeometry(44,44,5,48,1,true),0x1c2638,0,6,0,THREE.BackSide);
 for(const[x,z]of[[-1,-1],[1,-1],[1,1],[-1,1]])add(new THREE.PlaneGeometry(9,4),new THREE.Color(0xeaf2ff).multiplyScalar(6),x*24,30,z*30);
 for(const t of[0,1])add(new THREE.PlaneGeometry(30,8),new THREE.Color(COL[t]).multiplyScalar(.9),0,8,(t?-1:1)*50);
 const pm=new THREE.PMREMGenerator(renderer),e=pm.fromScene(s,.02).texture;pm.dispose();return e})();
export const LOOKS={arena:{bg:new THREE.Color(0x04060c),env:neonEnv,fog:scene.fog,hemi:[0x8fb4ff,0x0a0c14,.7],sun:[0xfff4e8,2.4],sp:new V3(42,126,28),sc:[125,155,330],exp:1,bk:1,th:.9,br:.35}};
for(const[id,c]of Object.entries(OUT))LOOKS[id]={bg:null,fog:new THREE.Fog(c.fog,320,1500),hemi:c.hemi,sun:[c.sc,c.si],sp:new V3(...c.sun).normalize().multiplyScalar(260),sc:[180,180,620],exp:c.exp||1,bk:.6,th:1.25,br:.3};
const arenaMat={floor:floorM.material,ramp:rampM.material,wall:wallM.material,mouth:mouthM.map(m=>m.material),gf:GOALF.map(m=>m.material)};
export const snowP=(()=>{const N=2600,p=new Float32Array(N*3);for(let i=0;i<N*3;i++)p[i]=(Math.random()-.5)*160;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
 const s=new THREE.Points(g,new THREE.PointsMaterial({map:dotTex(),color:0xffffff,size:.45,transparent:true,depthWrite:false,opacity:.9}));s.frustumCulled=false;s.visible=false;scene.add(s);return s})();
function outEmblem(g,cx,cy,R,line){g.save();g.translate(cx,cy);const hex=r=>{g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i;g.lineTo(r*Math.cos(a),r*Math.sin(a))}g.closePath()};
 hex(R);g.fillStyle='rgba(255,255,255,.1)';g.fill();g.lineWidth=R*.045;g.strokeStyle=line;g.stroke();hex(R*.86);g.lineWidth=R*.014;g.stroke();
 g.fillStyle=line;for(const[sx,sy]of[[1,1],[-1,1],[1,-1],[-1,-1]]){g.save();g.rotate(Math.atan2(sy,sx));g.fillRect(0,-R*.035,R*.42,R*.07);g.restore();g.beginPath();g.arc(sx*R*.3,sy*R*.3,R*.15,0,7);g.lineWidth=R*.03;g.stroke()}
 g.fillRect(-R*.1,-R*.16,R*.2,R*.32);g.font=`italic 700 ${R*.2}px "Chakra Petch",sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(61,149,255,.85)';g.fillText('DRONE',0,R*.62);g.fillStyle='rgba(255,138,42,.85)';g.fillText('LEAGUE',0,R*.83);g.restore()}
function dotTex(){return tex(32,32,g=>{const r=g.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,'#fff');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32)})}
function buildOutdoor(id){if(mapG[id])return;const c=OUT[id],G=mapG[id]=new THREE.Group();G.visible=false;scene.add(G);LOOKS[id].bg=skyTex(c);
 const T=c.turf,rnd=(a,b)=>a+Math.random()*b;
 // mown turf: soft colour blotches, mow stripes, per-pixel grain, chalk lines
 const turf=tex(2048,Math.round(2048*L/W),(g,w,h)=>{g.fillStyle=`hsl(${T[0]+T[1]/2},${T[2]+T[3]/2}%,${T[4]+T[5]/2}%)`;g.fillRect(0,0,w,h);const bw=40,bh=Math.round(40*L/W),sm=document.createElement('canvas');sm.width=bw;sm.height=bh;const sg=sm.getContext('2d');
  for(let i=0;i<bw*bh;i++){sg.fillStyle=`hsl(${rnd(T[0],T[1])},${rnd(T[2],T[3])}%,${rnd(T[4],T[5])}%)`;sg.fillRect(i%bw,i/bw|0,1,1)}g.globalAlpha=.55;g.drawImage(sm,0,0,w,h);g.globalAlpha=1;
  for(let i=0;i<22;i++){g.fillStyle=i%2?'rgba(255,255,230,.07)':'rgba(0,20,0,.08)';g.fillRect(0,i*h/22,w,h/22)}
  for(let i=0;i<14;i++){g.fillStyle=i%2?'rgba(255,255,230,.03)':'rgba(0,20,0,.035)';g.fillRect(i*w/14,0,w/14,h)}
  const k=w/W,eg=g.createRadialGradient(w/2,h/2,w*.2,w/2,h/2,h*.62);eg.addColorStop(0,'rgba(0,0,0,0)');eg.addColorStop(1,'rgba(0,15,0,.18)');g.fillStyle=eg;g.fillRect(0,0,w,h);
  [[0,'rgba(255,122,26,.09)'],[1,'rgba(45,140,255,.09)']].forEach(([e,f])=>{const bw=GW*1.5*k,bd=GW*.55*k,t=RF*k;g.fillStyle=f;g.fillRect(w/2-bw/2,e?h-t-bd:t,bw,bd)});
  g.strokeStyle=g.fillStyle=c.line;g.lineWidth=.45*w/W;pitchLines(g,w,h);outEmblem(g,w/2,h/2,W*.1*k,c.line);
  const im=g.getImageData(0,0,w,h),D=im.data;for(let i=0;i<D.length;i+=4){const n=.86+Math.random()*.24;D[i]*=n;D[i+1]*=n;D[i+2]*=n}g.putImageData(im,0,0)});
 const P=c.tile,tile=tex(256,256,(g,w,h)=>{g.fillStyle=P[0];g.fillRect(0,0,w,h);for(let i=0;i<3000;i++){g.fillStyle=`hsla(${rnd(P[1],P[2])},45%,${rnd(P[3],P[4])}%,.7)`;g.fillRect(Math.random()*w,Math.random()*h,1.5,2+Math.random()*4)}},true);
 if(!uvDone){uvDone=true;mouthM.forEach(m=>scaleUV(m.geometry,GW/6,(RF+.6)/6));GOALF.forEach(m=>scaleUV(m.geometry,GW/6,GD/6))}
 const ramp=new THREE.MeshStandardMaterial({map:tile,roughness:.95,side:THREE.DoubleSide});
 const tn=turfNormal();tn.repeat.set(W/2.5,L/2.5);
 mapMat[id]={floor:new THREE.MeshStandardMaterial({map:turf,roughness:.88,normalMap:tn,normalScale:new THREE.Vector2(.55,.55)}),ramp,wall:new THREE.MeshBasicMaterial({map:gridTex,color:c.wall,transparent:true,opacity:c.wo||.14,depthWrite:false,side:THREE.DoubleSide}),
  mouth:mouthM.map(()=>ramp),gf:COL.map(k=>new THREE.MeshStandardMaterial({map:tile,roughness:.95,emissive:k,emissiveIntensity:.12}))};
 // terrain (colour layers + shader detail), water, stadium bowl, instanced props
 const H=(x,z)=>hgt(c,x,z),w=c.water;
 const ter=new THREE.Mesh(terrainGeo(H,c.D,w?.wl,240),terrainMat(c.D));ter.receiveShadow=true;G.add(ter);
 if(w){const g=w.t==='river'?new THREE.PlaneGeometry(w.w*3.2,2400,1,240):new THREE.CircleGeometry(1,72);g.rotateX(-Math.PI/2);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);if(w.t==='river')p.setX(i,x+w.x+w.a*Math.sin(z/w.p+1));else{p.setX(i,w.x+x*w.rx*1.3);p.setZ(i,w.z+z*w.rz*1.3)}}
  const wm=new THREE.Mesh(g,waterMat(w));wm.position.y=w.wl;wm.receiveShadow=true;G.add(wm)}
 buildStadium(G,c.st,c.name.split(' ')[0]);buildProps(G,H,c.rules,c.n,id.length*7919+13,w?.wl);
 // per-frame hook (terrain is always drawn while this map shows): quality scaling, water time, scrolling boards
 let t0=0;ter.onBeforeRender=()=>{const t=performance.now()*.001,dt=t0?Math.min(t-t0,.1):0;t0=t;UT.value=t%1000;if(G.userData.q!==qId){G.userData.q=qId;applyQ(G)}
  if(G.userData.ads)G.userData.ads.offset.x=(G.userData.ads.offset.x+dt*.012)%1;if(G.userData.rib)G.userData.rib.offset.x=(G.userData.rib.offset.x-dt*.008)%1};
 // sun disc + drifting clouds
 const sunS=new THREE.Sprite(new THREE.SpriteMaterial({map:dot,color:new THREE.Color(c.sc).multiplyScalar(2),fog:false,toneMapped:false,depthWrite:false}));sunS.position.copy(LOOKS[id].sp).setLength(1300);sunS.scale.setScalar(150);G.add(sunS);
 const ct=[0,1,2].map(()=>tex(256,128,(g,w,h)=>{for(let i=0;i<40;i++){const x=w*rnd(.15,.7),y=h*rnd(.38,.3),r=rnd(8,26)*(1-Math.abs(x/w-.5)),gr=g.createRadialGradient(x,y-r*.2,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(.6,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,w,h)}
  g.globalCompositeOperation='source-atop';const sh=g.createLinearGradient(0,h*.3,0,h*.75);sh.addColorStop(0,'rgba(255,255,255,0)');sh.addColorStop(1,'rgba(120,132,150,.55)');g.fillStyle=sh;g.fillRect(0,0,w,h)}));
 const cl2=G.userData.clouds=new THREE.Group();for(let i=0;i<c.clouds;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:ct[i%3],color:c.ct,transparent:true,opacity:.9,depthWrite:false,fog:false})),a=Math.random()*Math.PI*2,r=rnd(450,650),k=rnd(180,220);
  s.position.set(Math.cos(a)*r,rnd(200,180),Math.sin(a)*r);s.scale.set(k,k*.5,1);cl2.add(s)}G.add(cl2)}
// screenshot hook for tools/map-views.mjs: pins the camera at p looking at t (null releases it). Overrides whatever camera.js set, just before each render
window.__dlMapCam=(p,t)=>{scene.onBeforeRender=p?(r,s,cam)=>{cam.position.set(...p);cam.lookAt(...t);cam.fov=60;cam.updateProjectionMatrix();cam.updateMatrixWorld()}:()=>{}};
export function setMap(id){if(!LOOKS[id])id='arena';if(id===mapId)return;mapId=id;const O=OUT[id],K=LOOKS[id],DF=id==='df';if(O)buildOutdoor(id);const A=O?mapMat[id]:arenaMat;
 neonG.visible=outer.visible=!O&&!DF;[floorM,rampM,wallM,...mouthM,...RIML].forEach(m=>m.visible=!DF);sun.target.position.set(0,0,0);for(const k in mapG)mapG[k].visible=k===id;snowP.visible=!!O?.snow;scene.background=K.bg;scene.fog=K.fog;scene.environment=K.env||(O||DF?K.bg:null);
 hemi.color.set(K.hemi[0]);hemi.groundColor.set(K.hemi[1]);hemi.intensity=K.hemi[2];sun.color.set(K.sun[0]);sun.intensity=K.sun[1];sun.position.copy(K.sp);
 fitShadow(...K.sc);
 renderer.toneMappingExposure=K.exp;lookBK=K.bk;bloom.threshold=K.th;bloom.radius=K.br;bloom.strength=(GS.hostTune||S.mod).bloom*K.bk;
 floorM.material=A.floor;rampM.material=A.ramp;wallM.material=A.wall;mouthM.forEach((m,i)=>m.material=A.mouth[i]);GOALF.forEach((m,t)=>m.material=A.gf[t]);
 NETM.forEach(m=>{m.blending=O?THREE.NormalBlending:THREE.AdditiveBlending;m.forceSinglePass=!O;m.opacity=O?.75:.5;m.needsUpdate=true})}
