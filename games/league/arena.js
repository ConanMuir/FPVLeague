// Drone League arena: rounded floor plan, curved ramp and glass walls (the same shape the physics SDF uses), goals, the Neon Arena stadium,
// the outdoor maps (visual only: every map shares the arena collision shape) and the ball styles (visual only: the hitbox is always a sphere of radius BR)
import * as THREE from 'three';
import {V3,QT,cl,UP,hash2,sm,vnoise,fbm} from '../../engine/util.js';
import {renderer,scene,bloom,tex,glow,scaleUV,dot,skyTex} from '../../engine/render.js';
import {tune} from '../../engine/modpanel.js';
import {W,L,H,GW,GH,GD,RC,RF,HW,HL,COL,BR} from './consts.js';
import {hemi,sun} from './scene.js';
// ---------- arena ----------
const floorTex=tex(1024,Math.round(1024*L/W),(g,w,h)=>{
 g.fillStyle='#0a0f1e';g.fillRect(0,0,w,h);
 const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(255,122,26,.22)');gr.addColorStop(.5,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(45,140,255,.22)');g.fillStyle=gr;g.fillRect(0,0,w,h);
 g.strokeStyle='rgba(130,170,255,.08)';g.lineWidth=2;const s=26;
 for(let y=0,r=0;y<h+s;y+=s*1.5,r++)for(let x=(r%2)*s*.866;x<w+s;x+=s*1.732){g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i+Math.PI/6;g.lineTo(x+s*Math.cos(a),y+s*Math.sin(a))}g.closePath();g.stroke()}
 g.strokeStyle='rgba(215,230,255,.7)';g.fillStyle='#fff';g.lineWidth=5;pitchLines(g,w,h,['rgba(255,140,50,.75)','rgba(70,160,255,.75)']);
});
// rounded arena: plan corners radius RC, floor + ceiling fillets radius RF (same shape the physics SDF uses)
function contour(o,st=1,arc=14){const pts=[],a=HW-RC,b=HL-RC;
 const line=(x0,z0,x1,z1,nx,nz)=>{const n=Math.max(1,Math.round(Math.hypot(x1-x0,z1-z0)/st));for(let i=0;i<n;i++){const t=i/n;pts.push([x0+(x1-x0)*t+nx*o,z0+(z1-z0)*t+nz*o,nx,nz])}};
 const arcF=(cx,cz,a0)=>{for(let i=0;i<arc;i++){const t=a0+i/arc*Math.PI/2,c=Math.cos(t),s=Math.sin(t);pts.push([cx+c*(RC+o),cz+s*(RC+o),c,s])}};
 line(HW,-b,HW,b,1,0);arcF(a,b,0);line(a,HL,-a,HL,0,1);arcF(-a,b,Math.PI/2);line(-HW,b,-HW,-b,-1,0);arcF(-a,-b,Math.PI);line(-a,-HL,a,-HL,0,-1);arcF(a,-b,Math.PI*1.5);return pts}
const prof=[];for(let i=0;i<=8;i++){const f=i/8*Math.PI/2;prof.push([-RF+RF*Math.sin(f),RF-RF*Math.cos(f)])}
for(const y of[GH,GH+(H-RF-GH)/3,GH+2*(H-RF-GH)/3,H-RF])prof.push([0,y]);
for(let i=1;i<=8;i++){const f=i/8*Math.PI/2;prof.push([-RF+RF*Math.cos(f),H-RF+RF*Math.sin(f)])}
const RIM=contour(0,1),inMouth=(x,y,z)=>Math.abs(x)<GW/2&&y<GH&&Math.abs(z)>HL-RF-.5;
function band(r0,r1,mat){const pos=[],uv=[],idx=[],C=RIM,n=C.length,R=r1-r0+1;let len=0;
 for(let i=0;i<=n;i++){const c=C[i%n];if(i)len+=Math.hypot(c[0]-C[i-1][0],c[1]-C[i-1][1]);let vl=0;
  for(let r=r0;r<=r1;r++){const[d,y]=prof[r];if(r>r0)vl+=Math.hypot(d-prof[r-1][0],y-prof[r-1][1]);pos.push(c[0]+c[2]*d,y,c[1]+c[3]*d);uv.push(len/6,vl/6)}}
 for(let i=0;i<n;i++)for(let r=0;r<R-1;r++){const a=i*R+r,b=(i+1)*R+r;
  if(inMouth((pos[a*3]+pos[(b+1)*3])/2,(pos[a*3+1]+pos[(b+1)*3+1])/2,(pos[a*3+2]+pos[(b+1)*3+2])/2))continue;idx.push(a,b,a+1,b,b+1,a+1)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
 const m=new THREE.Mesh(g,mat);scene.add(m);return m}
export const NETM=[],GOALF=[],mouthM=[];export let floorM;
{const sh=new THREE.Shape(),cx=HW-RC,cz=HL-RC,rr=RC-RF;sh.absarc(cx,cz,rr,0,Math.PI/2);sh.absarc(-cx,cz,rr,Math.PI/2,Math.PI);sh.absarc(-cx,-cz,rr,Math.PI,Math.PI*1.5);sh.absarc(cx,-cz,rr,Math.PI*1.5,Math.PI*2);
 const g=new THREE.ShapeGeometry(sh,24),p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/W+.5,p.getY(i)/L+.5);
 const floor=floorM=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:floorTex,emissive:0xffffff,emissiveMap:floorTex,emissiveIntensity:.32,roughness:.38,metalness:.35}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(GW,RF+.6),new THREE.MeshStandardMaterial({color:0x0b1122,roughness:.4,metalness:.35}));m.rotation.x=-Math.PI/2;m.position.set(0,.004,s*(HL-RF/2));m.receiveShadow=true;scene.add(m);mouthM.push(m)}}
export const outer=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:0x070a12,roughness:.95}));outer.rotation.x=-Math.PI/2;outer.position.y=-.03;outer.receiveShadow=true;scene.add(outer);
const gridTex=tex(128,128,(g,w,h)=>{g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=3;g.strokeRect(0,0,w,h);g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=1;g.strokeRect(w/4,h/4,w/2,h/2)},true);
const netTex=tex(64,64,(g,w,h)=>{g.strokeStyle='#fff';g.lineWidth=3;g.strokeRect(0,0,w,h)},true);
const wallMat=new THREE.MeshBasicMaterial({map:gridTex,color:0x3a5c9c,transparent:true,opacity:.42,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
function panel(w,h,x,y,z,ry,mat=wallMat,cell=6){const m=new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(w,h),w/cell,h/cell),mat);m.position.set(x,y,z);m.rotation.y=ry;scene.add(m);return m}
export const rampM=band(0,8,new THREE.MeshStandardMaterial({color:0x121a30,roughness:.3,metalness:.6,emissive:0x5c86d6,emissiveMap:gridTex,emissiveIntensity:.5,side:THREE.DoubleSide}));rampM.receiveShadow=true;
export const wallM=band(8,prof.length-1,wallMat);
export const RIML=[];{const cB=new THREE.Color(COL[0]).multiplyScalar(2.4),cO=new THREE.Color(COL[1]).multiplyScalar(2.4),cW=new THREE.Color(0x9fc4ff).multiplyScalar(1.6);
 const teamCol=z=>cW.clone().lerp(z>0?cB:cO,cl(Math.abs(z)/HL*1.4,0,1));
 const loop=(d,y,col)=>{const P=[],Cl=[],C=RIM;for(let i=0;i<C.length;i++){const a=C[i],b=C[(i+1)%C.length],pa=[a[0]+a[2]*d,y,a[1]+a[3]*d],pb=[b[0]+b[2]*d,y,b[1]+b[3]*d];
  if(y>.1&&inMouth((pa[0]+pb[0])/2,y,(pa[2]+pb[2])/2))continue;P.push(...pa,...pb);const c1=col(pa[2]),c2=col(pb[2]);Cl.push(c1.r,c1.g,c1.b,c2.r,c2.g,c2.b)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('color',new THREE.Float32BufferAttribute(Cl,3));
  const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false}));scene.add(l);RIML.push(l)};
 loop(-RF,.04,teamCol);loop(0,RF,()=>cW);loop(0,H-RF,()=>cW);loop(-RF,H,teamCol)}
// goals: team 0 (blue) defends +z, team 1 (orange) defends -z
export const goalG=new THREE.Group(),_n0=scene.children.length;
for(const t of[0,1]){const s=t?-1:1,z=s*HL,c=COL[t],pm=glow(c,3.2),T=.45;
 const box=(w,h,d,x,y,zz,m)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.set(x,y,zz);scene.add(b);return b};
 box(T,GH,T,-GW/2,GH/2,z,pm);box(T,GH,T,GW/2,GH/2,z,pm);box(GW+T,T,T,0,GH,z,pm);
 const nm=new THREE.MeshBasicMaterial({map:netTex,color:c,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});NETM.push(nm);
 panel(GW,GH,0,GH/2,s*(HL+GD),0,nm,1.2);const top=panel(GW,GD,0,GH,s*(HL+GD/2),0,nm,1.2);top.rotation.x=Math.PI/2;
 panel(GD,GH,-GW/2,GH/2,s*(HL+GD/2),Math.PI/2,nm,1.2);panel(GD,GH,GW/2,GH/2,s*(HL+GD/2),Math.PI/2,nm,1.2);
 const gf=new THREE.Mesh(new THREE.PlaneGeometry(GW,GD),new THREE.MeshStandardMaterial({color:0x0a0f1e,emissive:c,emissiveIntensity:.35}));gf.rotation.x=-Math.PI/2;gf.position.set(0,.01,s*(HL+GD/2));scene.add(gf);GOALF.push(gf);
 const gl=new THREE.PointLight(c,90,45);gl.position.set(0,GH*.6,s*(HL+GD*.6));scene.add(gl)}
scene.children.slice(_n0).forEach(o=>goalG.add(o));scene.add(goalG);
// stadium crowd + light towers + stars (Neon Arena map only)
export const neonG=new THREE.Group();scene.add(neonG);
{const geo=new THREE.BoxGeometry(1,1.3,1),N=16000,im=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial(),N),m=new THREE.Matrix4(),col=new THREE.Color();let n=0;
 for(let k=0;k<14&&n<N;k++){const o=14+k*2.3,y=1.5+k*1.75;for(const[x,z]of contour(o,1.45,Math.round((RC+o)*1.08))){if(n>=N)break;
  m.makeTranslation(x,y,z);im.setMatrixAt(n,m);const r=Math.random(),team=z>0?0:1;
  if(r<.012)col.setRGB(2.2,2.2,2.4);else if(r<.12)col.set(COL[Math.random()<.75?team:1-team]).multiplyScalar(.55+Math.random()*.6);else col.setRGB(.04,.05,.08).multiplyScalar(.6+Math.random());
  im.setColorAt(n++,col)}}
 im.count=n;neonG.add(im);
 for(const[x,z]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const px=x*(HW+52),pz=z*(HL+52);const p=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,H+6,8),new THREE.MeshStandardMaterial({color:0x1a1f2b,metalness:.6,roughness:.5}));p.position.set(px,(H+6)/2,pz);neonG.add(p);
  const head=new THREE.Mesh(new THREE.BoxGeometry(9,4,1.5),glow(0xeaf2ff,4));head.position.set(px,H+7,pz);head.lookAt(0,0,0);neonG.add(head)}
 const sp=[];for(let i=0;i<1600;i++){const t=Math.random()*Math.PI*2,u=Math.random()*.9+.08,r=1000;sp.push(Math.cos(t)*r*Math.sqrt(1-u*u),u*r,Math.sin(t)*r*Math.sqrt(1-u*u))}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));neonG.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xbcd0ff,size:1.6,sizeAttenuation:false,fog:false})))}

// ---------- maps: Neon Arena + outdoor maps. Visual only: every map shares the arena collision shape ----------
export let lookBK=1,mapId='';let uvDone=false;const mapMat={};export const mapG={};
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
// pitch markings in metres (shared by every floor texture)
function pitchLines(g,w,h,box){const k=w/W,t=RF*k;g.beginPath();if(g.roundRect)g.roundRect(t,t,w-2*t,h-2*t,(RC-RF)*k);else g.rect(t,t,w-2*t,h-2*t);g.stroke();
 g.beginPath();g.moveTo(t,h/2);g.lineTo(w-t,h/2);g.stroke();g.beginPath();g.arc(w/2,h/2,W*.13*k,0,7);g.stroke();g.beginPath();g.arc(w/2,h/2,1.2*k,0,7);g.fill();
 const bw=GW*1.5*k,bd=GW*.55*k,sw=GW*1.05*k,sd=GW*.22*k;[[t,1],[h-t,-1]].forEach(([y,s],i)=>{if(box)g.strokeStyle=box[i];g.strokeRect(w/2-bw/2,s>0?y:y-bd,bw,bd);g.strokeRect(w/2-sw/2,s>0?y:y-sd,sw,sd)})}
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
 renderer.toneMappingExposure=K.exp;lookBK=K.bk;bloom.threshold=K.th;bloom.strength=tune().bloom*K.bk;
 floorM.material=A.floor;rampM.material=A.ramp;wallM.material=A.wall;mouthM.forEach((m,i)=>m.material=A.mouth[i]);GOALF.forEach((m,t)=>m.material=A.gf[t]);
 NETM.forEach(m=>{m.blending=O?THREE.NormalBlending:THREE.AdditiveBlending;m.opacity=O?.75:.5;m.needsUpdate=true})}

export const ballMesh=new THREE.Mesh(new THREE.IcosahedronGeometry(BR,2),new THREE.MeshStandardMaterial({color:0xc9d4e6,roughness:.25,metalness:.65,flatShading:true}));ballMesh.castShadow=true;scene.add(ballMesh);
ballMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BR*1.006,1)),new THREE.LineBasicMaterial({color:new THREE.Color(0x9fe8ff).multiplyScalar(2.6),toneMapped:false})));
export const ballLight=new THREE.PointLight(0x9fe8ff,40,26);scene.add(ballLight);
export const ring=new THREE.Mesh(new THREE.RingGeometry(BR*.85,BR*1.05,48),new THREE.MeshBasicMaterial({color:0x9fe8ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));ring.rotation.x=-Math.PI/2;scene.add(ring);

// ball styles (visual only; the hitbox is always a sphere of radius BR)
export const BALLS=[['classic','Classic chrome'],['soccer','Soccer'],['plasma','Plasma core'],['beach','Beach ball']];
// soccer ball = truncated icosahedron drawn per pixel: 12 pentagon + 20 hexagon face normals (w = 1/face distance); the ray hits the face with the largest n.f*w
const SOC=[];{const ph=(1+Math.sqrt(5))/2,add=(x,y,z,d)=>{const v=new V3(x,y,z).normalize();SOC.push(new THREE.Vector4(v.x,v.y,v.z,1/d))};
 for(const a of[-1,1])for(const b of[-1,1]){add(0,a,b*ph,2.32744);add(a,b*ph,0,2.32744);add(b*ph,0,a,2.32744)}
 for(const a of[-1,1])for(const b of[-1,1]){for(const c of[-1,1])add(a,b,c,2.26728);add(0,a/ph,b*ph,2.26728);add(a/ph,b*ph,0,2.26728);add(b*ph,0,a/ph,2.26728)}}
const BSTY={classic:()=>({g:ballMesh.geometry,m:ballMesh.material,kids:[...ballMesh.children],c:0x9fe8ff}),
 soccer:()=>{const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.42,metalness:.05});m.customProgramCacheKey=()=>'soccer';
  m.onBeforeCompile=sh=>{sh.uniforms.uSoc={value:SOC};sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vON;').replace('#include <begin_vertex>','#include <begin_vertex>\nvON=normal;');
   sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vON;uniform vec4 uSoc[32];').replace('#include <color_fragment>',`#include <color_fragment>
   {vec3 n=normalize(vON);float b1=-9.,b2=-9.;int id=0;for(int i=0;i<32;i++){float s=dot(n,uSoc[i].xyz)*uSoc[i].w;if(s>b1){b2=b1;b1=s;id=i;}else if(s>b2)b2=s;}
    diffuseColor.rgb*=(id<12?vec3(.04):vec3(.93))*mix(.3,1.,smoothstep(.002,.009,(b1-b2)/b1));}`)};
  return{g:new THREE.SphereGeometry(BR,64,48),m,c:0xfff4e0}},
 plasma:()=>{const core=new THREE.Mesh(new THREE.IcosahedronGeometry(BR*.42,3),glow(0x3fa8ff,2.6)),cage=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BR*1.01,1)),new THREE.LineBasicMaterial({color:new THREE.Color(0xb48cff).multiplyScalar(2.4),toneMapped:false}));
  return{g:new THREE.IcosahedronGeometry(BR,4),m:new THREE.MeshStandardMaterial({color:0x14224a,roughness:.12,metalness:.3,transparent:true,opacity:.55,emissive:0x2a5cff,emissiveIntensity:.4}),kids:[core,cage],c:0x7aa8ff,
   tick:now=>{core.scale.setScalar(1+.12*Math.sin(now*.008));cage.rotation.set(now*4e-4,now*7e-4,0)}}},
 beach:()=>{const t=tex(512,256,(g,w,h)=>{const C=['#ff4a4a','#ffffff','#2f8cff','#ffffff','#ffd23a','#ffffff'];C.forEach((c,i)=>{g.fillStyle=c;g.fillRect(i*w/6,0,w/6+1,h)});g.fillStyle='#fff';g.fillRect(0,0,w,h*.07);g.fillRect(0,h*.93,w,h*.07)});
  return{g:new THREE.SphereGeometry(BR,48,32),m:new THREE.MeshStandardMaterial({map:t,roughness:.32,metalness:0}),c:0xffd23a}}};
const ballCache={};let ballId='';export let ballTick=null;
export function setBall(id){if(!BSTY[id])id='classic';if(!ballCache.classic)ballCache.classic=BSTY.classic();if(id===ballId)return;ballId=id;const b=ballCache[id]||(ballCache[id]=BSTY[id]());
 ballMesh.clear();ballMesh.geometry=b.g;ballMesh.material=b.m;(b.kids||[]).forEach(k=>ballMesh.add(k));ballTick=b.tick||null;ballLight.color.set(b.c);ring.material.color.set(b.c)}
