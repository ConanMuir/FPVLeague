// ---------- maps: Neon Arena + outdoor maps. Visual only: every map shares the arena collision shape ----------
import * as THREE from 'three';
import {COL,GD,GW,HL,HW,L,QT,RF,UP,V3,W,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {onTune} from '../config/tune.js';
import {dot} from '../render/particles.js';
import {bloom,hemi,renderer,scaleUV,scene,sun,tex} from '../render/renderer.js';
import {GS} from '../state.js';
import {GOALF,NETM,RIML,floorM,gridTex,mouthM,neonG,outer,pitchLines,rampM,wallM} from './arena.js';
import {fbm,sm,vnoise} from './noise.js';
export let lookBK=1,mapId='',uvDone=false;export const mapMat={},mapG={};
onTune(T=>{bloom.strength=T.bloom*lookBK});  // was part of applyTune()
const edgeD=(x,z)=>Math.hypot(Math.max(Math.abs(x)-HW-20,0),Math.max(Math.abs(z)-HL-20,0));
// outdoor map recipes: sky gradient, sun, turf [hue,±,sat,±,light,±], ramp tile [base,hue,±,light,±], terrain low/high colours, hills/mountains/mesas, props
export const OUT={
 meadow:{name:'Meadow',sky:['#1d58b0','#4f8fd8','#acd0f0','#dcebf4','#a7bf9c','#46663a'],sun:[-.5,.62,.6],sc:0xfff0d8,si:3.2,hemi:[0xd8e9ff,0x56703a,1.1],fog:0xcfe0ee,
  turf:[92,22,42,18,27,12],tile:['#3c8731',88,30,20,24],line:'rgba(255,255,255,.88)',wall:0xf2f8ff,lo:[.2,.4,.13],hi:[.5,.52,.47],hiY:[40,140],hill:55,mtn:190,props:['broad','broad','pine'],n:900,clouds:32,ct:0xffffff},
 canyon:{name:'Canyon (sunset)',sky:['#26346e','#6d5c9e','#ee9a6a','#ffcf9a','#c98d5e','#6e4226'],sun:[.72,.16,-.66],sc:0xffb070,si:2.8,hemi:[0xffcfa6,0x8a5030,.95],fog:0xe9b78e,
  turf:[74,18,30,14,26,10],tile:['#b98c5a',28,14,45,20],line:'rgba(255,248,235,.85)',wall:0xffe6cc,lo:[.8,.58,.38],hi:[.62,.3,.17],hiY:[6,50],hill:22,mtn:130,mesa:95,band:1,props:['cactus','cactus','rock'],n:520,clouds:14,ct:0xffc8a0},
 alpine:{name:'Alpine (snow)',sky:['#2f62a0','#6f9fd2','#c8dcee','#eef4f8','#dfe7ef','#b4c2d0'],sun:[.3,.45,.8],sc:0xfff6ee,si:2.6,hemi:[0xe8f0ff,0x9aa8b8,1.25],fog:0xdde8f2,
  turf:[98,18,34,12,25,10],tile:['#7f9bb8',210,18,52,12],line:'rgba(255,255,255,.92)',wall:0x1c64d8,wo:.55,lo:[.9,.93,.97],hi:[.42,.44,.48],hiY:[260,420],hill:70,mtn:360,steep:1,props:['snowpine'],n:1000,clouds:38,ct:0xffffff,snow:1}};
function hgt(c,x,z){const e=edgeD(x,z);let y=sm(e/90)*(fbm(x/140,z/140)*c.hill+e*.05)+cl((e-380)/220,0,1)*fbm(x/90+7,z/90)*c.mtn;
 if(c.mesa)y+=sm(e/50)*cl((fbm(x/170+3,z/170-2)-.5)*14,0,1)*c.mesa*(.7+.3*vnoise(x/40,z/40));return y-.06}
export function skyTex(c){const d=new V3(...c.sun).normalize(),t=tex(1024,512,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);[0,.3,.46,.5,.53,1].forEach((s,i)=>gr.addColorStop(s,c.sky[i]));g.fillStyle=gr;g.fillRect(0,0,w,h);
 const u=(Math.atan2(d.z,d.x)/(2*Math.PI)+.5)*w,v=(.5-Math.asin(d.y)/Math.PI)*h,r=g.createRadialGradient(u,v,0,u,v,h*.4);r.addColorStop(0,'rgba(255,248,225,.9)');r.addColorStop(.12,'rgba(255,240,205,.4)');r.addColorStop(1,'rgba(255,240,205,0)');g.fillStyle=r;g.fillRect(0,0,w,h)});
 t.mapping=THREE.EquirectangularReflectionMapping;return t}
export const LOOKS={arena:{bg:new THREE.Color(0x04060c),fog:scene.fog,hemi:[0x8fb4ff,0x0a0c14,.7],sun:[0xfff4e8,2.4],sp:new V3(42,126,28),sc:[125,155,330],exp:1.05,bk:1,th:.82}};
for(const[id,c]of Object.entries(OUT))LOOKS[id]={bg:null,fog:new THREE.Fog(c.fog,320,1500),hemi:c.hemi,sun:[c.sc,c.si],sp:new V3(...c.sun).normalize().multiplyScalar(260),sc:[180,180,620],exp:1,bk:.4,th:1};
const arenaMat={floor:floorM.material,ramp:rampM.material,wall:wallM.material,mouth:mouthM.map(m=>m.material),gf:GOALF.map(m=>m.material)};
export const snowP=(()=>{const N=2600,p=new Float32Array(N*3);for(let i=0;i<N*3;i++)p[i]=(Math.random()-.5)*160;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
 const s=new THREE.Points(g,new THREE.PointsMaterial({map:dotTex(),color:0xffffff,size:.45,transparent:true,depthWrite:false,opacity:.9}));s.frustumCulled=false;s.visible=false;scene.add(s);return s})();
function dotTex(){return tex(32,32,g=>{const r=g.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,'#fff');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32)})}
function buildOutdoor(id){if(mapG[id])return;const c=OUT[id],G=mapG[id]=new THREE.Group();G.visible=false;scene.add(G);LOOKS[id].bg=skyTex(c);
 const T=c.turf,rnd=(a,b)=>a+Math.random()*b;
 // mown turf: soft colour blotches, mow stripes, per-pixel grain, chalk lines
 const turf=tex(2048,Math.round(2048*L/W),(g,w,h)=>{g.fillStyle=`hsl(${T[0]+T[1]/2},${T[2]+T[3]/2}%,${T[4]+T[5]/2}%)`;g.fillRect(0,0,w,h);const bw=40,bh=Math.round(40*L/W),sm=document.createElement('canvas');sm.width=bw;sm.height=bh;const sg=sm.getContext('2d');
  for(let i=0;i<bw*bh;i++){sg.fillStyle=`hsl(${rnd(T[0],T[1])},${rnd(T[2],T[3])}%,${rnd(T[4],T[5])}%)`;sg.fillRect(i%bw,i/bw|0,1,1)}g.globalAlpha=.55;g.drawImage(sm,0,0,w,h);g.globalAlpha=1;
  for(let i=0;i<22;i++){g.fillStyle=i%2?'rgba(255,255,230,.07)':'rgba(0,20,0,.08)';g.fillRect(0,i*h/22,w,h/22)}
  const im=g.getImageData(0,0,w,h),D=im.data;for(let i=0;i<D.length;i+=4){const n=.84+Math.random()*.28;D[i]*=n;D[i+1]*=n;D[i+2]*=n}g.putImageData(im,0,0);
  g.strokeStyle=g.fillStyle=c.line;g.lineWidth=.45*w/W;pitchLines(g,w,h)});
 const P=c.tile,tile=tex(256,256,(g,w,h)=>{g.fillStyle=P[0];g.fillRect(0,0,w,h);for(let i=0;i<3000;i++){g.fillStyle=`hsla(${rnd(P[1],P[2])},45%,${rnd(P[3],P[4])}%,.7)`;g.fillRect(Math.random()*w,Math.random()*h,1.5,2+Math.random()*4)}},true);
 if(!uvDone){uvDone=true;mouthM.forEach(m=>scaleUV(m.geometry,GW/6,(RF+.6)/6));GOALF.forEach(m=>scaleUV(m.geometry,GW/6,GD/6))}
 const ramp=new THREE.MeshStandardMaterial({map:tile,roughness:.95,side:THREE.DoubleSide});
 mapMat[id]={floor:new THREE.MeshStandardMaterial({map:turf,roughness:.9}),ramp,wall:new THREE.MeshBasicMaterial({map:gridTex,color:c.wall,transparent:true,opacity:c.wo||.3,depthWrite:false,side:THREE.DoubleSide}),
  mouth:mouthM.map(()=>ramp),gf:COL.map(k=>new THREE.MeshStandardMaterial({map:tile,roughness:.95,emissive:k,emissiveIntensity:.12}))};
 const c3=new THREE.Color(),c2=new THREE.Color(),lo=new THREE.Color().setRGB(...c.lo,THREE.SRGBColorSpace),hi=new THREE.Color().setRGB(...c.hi,THREE.SRGBColorSpace);
 // terrain: flat around the stadium, hills, then mountains (and mesas on Canyon)
 {const g=new THREE.PlaneGeometry(2400,2400,200,200);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,hgt(c,p.getX(i),p.getZ(i)));g.computeVertexNormals();
  const nm=g.attributes.normal,col=[];for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=fbm(x/50,z/50);
   let k=cl((y-c.hiY[0])/c.hiY[1],0,1);if(c.steep)k=Math.max(k,cl((.82-nm.getY(i))*4,0,1));c3.copy(lo).lerp(hi,k).multiplyScalar(.82+n*.36);if(c.band&&k>0)c3.multiplyScalar(.86+.14*Math.sin(y*.45));col.push(c3.r,c3.g,c3.b)}
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));m.receiveShadow=true;G.add(m)}
 // props: instanced low-poly trees, snowy pines, cacti, rocks
 {const GEO2={trunk:new THREE.CylinderGeometry(.3,.45,1,6).translate(0,.5,0),crown:new THREE.IcosahedronGeometry(1,1),cone:new THREE.ConeGeometry(1,1,7).translate(0,.5,0),cyl:new THREE.CylinderGeometry(1,1,1,8).translate(0,.5,0),rock:new THREE.DodecahedronGeometry(1,0)};
  const I={},q=new QT(),m4=new THREE.Matrix4(),s=new V3(),pp=new V3(),put=(k,x,y,z,sx,sy,sz,col,rq=q)=>(I[k]||(I[k]=[])).push(m4.compose(pp.set(x,y,z),rq,s.set(sx,sy,sz)).clone(),new THREE.Color(col));
  const hsl=(h,s,l)=>c2.setHSL(h,s,l,THREE.SRGBColorSpace).getHex();let n=0;
  for(let i=0;i<12000&&n<c.n;i++){const x=(Math.random()-.5)*1800,z=(Math.random()-.5)*1800,e=edgeD(x,z);if(e<14||(fbm(x/70,z/70)<.45&&Math.random()>.12))continue;n++;
   const y=hgt(c,x,z)-.2,kind=c.props[Math.random()*c.props.length|0],h=(7+Math.random()*9)*(e>200?1.3:1);q.setFromAxisAngle(UP,Math.random()*6.3);
   if(kind==='broad'){put('trunk',x,y,z,h*.07+.25,h*.5,h*.07+.25,0x5a3e26);const r=h*rnd(.3,.1);put('crown',x,y+h*.62,z,r,r*.85,r,hsl(rnd(.22,.09),.5,rnd(.22,.12)))}
   else if(kind==='pine'||kind==='snowpine'){put('trunk',x,y,z,h*.07+.25,h*.3,h*.07+.25,0x4e3622);put('cone',x,y+h*.18,z,h*.28,h*.9,h*.28,hsl(rnd(.33,.05),.45,rnd(.13,.08)));if(kind==='snowpine')put('cone',x,y+h*.62,z,h*.15,h*.47,h*.15,0xf2f6fb)}
   else if(kind==='cactus'){const ch=h*.5,col=hsl(rnd(.27,.05),.4,rnd(.24,.08));put('cyl',x,y,z,.45,ch,.45,col);for(const sd of[-1,1])if(Math.random()<.8){const ah=ch*rnd(.25,.2);put('cyl',x+sd*.95,y+ch*rnd(.35,.2),z,.32,ah,.32,col);put('cyl',x+sd*.45,y+ch*.38,z,.6,.5,.32,col)}}
   else{const r=rnd(2,e>120?14:6),rq=new QT().setFromEuler(new THREE.Euler(Math.random()*6,Math.random()*6,Math.random()*6));put('rock',x,y+r*.25,z,r,r*.7,r*1.1,c3.copy(hi).multiplyScalar(rnd(.7,.4)).getHex(),rq)}}
  for(const k in I){const L2=I[k],N=L2.length/2,im=new THREE.InstancedMesh(GEO2[k],new THREE.MeshStandardMaterial({roughness:.88,flatShading:true}),N);
   for(let j=0;j<N;j++){im.setMatrixAt(j,L2[2*j]);im.setColorAt(j,L2[2*j+1])}im.castShadow=im.receiveShadow=true;im.frustumCulled=false;G.add(im)}}
 // sun disc + drifting clouds
 const sunS=new THREE.Sprite(new THREE.SpriteMaterial({map:dot,color:new THREE.Color(c.sc).multiplyScalar(3),fog:false,toneMapped:false,depthWrite:false}));sunS.position.copy(LOOKS[id].sp).setLength(1300);sunS.scale.setScalar(150);G.add(sunS);
 const ct=[0,1,2].map(()=>tex(256,128,(g,w,h)=>{for(let i=0;i<24;i++){const x=w*rnd(.18,.64),y=h*rnd(.42,.26),r=rnd(14,30),gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.85)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,w,h)}}));
 const cl2=G.userData.clouds=new THREE.Group();for(let i=0;i<c.clouds;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:ct[i%3],color:c.ct,transparent:true,opacity:.9,depthWrite:false,fog:false})),a=Math.random()*Math.PI*2,r=rnd(450,650),k=rnd(180,220);
  s.position.set(Math.cos(a)*r,rnd(200,180),Math.sin(a)*r);s.scale.set(k,k*.5,1);cl2.add(s)}G.add(cl2)}
export function setMap(id){if(!LOOKS[id])id='arena';if(id===mapId)return;mapId=id;const O=OUT[id],K=LOOKS[id],DF=id==='df';if(O)buildOutdoor(id);const A=O?mapMat[id]:arenaMat;
 neonG.visible=outer.visible=!O&&!DF;[floorM,rampM,wallM,...mouthM,...RIML].forEach(m=>m.visible=!DF);sun.target.position.set(0,0,0);for(const k in mapG)mapG[k].visible=k===id;snowP.visible=!!O?.snow;scene.background=K.bg;scene.fog=K.fog;scene.environment=O||DF?K.bg:null;
 hemi.color.set(K.hemi[0]);hemi.groundColor.set(K.hemi[1]);hemi.intensity=K.hemi[2];sun.color.set(K.sun[0]);sun.intensity=K.sun[1];sun.position.copy(K.sp);
 const sc=sun.shadow.camera;sc.left=-K.sc[0];sc.right=K.sc[0];sc.top=K.sc[1];sc.bottom=-K.sc[1];sc.far=K.sc[2];sc.updateProjectionMatrix();
 renderer.toneMappingExposure=K.exp;lookBK=K.bk;bloom.threshold=K.th;bloom.strength=(GS.hostTune||S.mod).bloom*K.bk;
 floorM.material=A.floor;rampM.material=A.ramp;wallM.material=A.wall;mouthM.forEach((m,i)=>m.material=A.mouth[i]);GOALF.forEach((m,t)=>m.material=A.gf[t]);
 NETM.forEach(m=>{m.blending=O?THREE.NormalBlending:THREE.AdditiveBlending;m.opacity=O?.75:.5;m.needsUpdate=true})}
