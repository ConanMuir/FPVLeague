// ---------- arena ----------
// pitch markings in metres (shared by every floor texture)
import * as THREE from 'three';
import {COL,GD,GH,GW,H,HL,HW,L,RC,RF,W,cl} from '../config/constants.js';
import {glow,scaleUV,scene,tex} from '../render/renderer.js';
export function pitchLines(g,w,h,box){const k=w/W,t=RF*k;g.beginPath();if(g.roundRect)g.roundRect(t,t,w-2*t,h-2*t,(RC-RF)*k);else g.rect(t,t,w-2*t,h-2*t);g.stroke();
 g.beginPath();g.moveTo(t,h/2);g.lineTo(w-t,h/2);g.stroke();g.beginPath();g.arc(w/2,h/2,W*.13*k,0,7);g.stroke();g.beginPath();g.arc(w/2,h/2,1.2*k,0,7);g.fill();
 const bw=GW*1.5*k,bd=GW*.55*k,sw=GW*1.05*k,sd=GW*.22*k;[[t,1],[h-t,-1]].forEach(([y,s],i)=>{if(box)g.strokeStyle=box[i];g.strokeRect(w/2-bw/2,s>0?y:y-bd,bw,bd);g.strokeRect(w/2-sw/2,s>0?y:y-sd,sw,sd)})}
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
export const gridTex=tex(128,128,(g,w,h)=>{g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=3;g.strokeRect(0,0,w,h);g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=1;g.strokeRect(w/4,h/4,w/2,h/2)},true);
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
 for(const[x,z]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const px=x*(HW+52),pz=z*(HL+52);const p=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,70,8),new THREE.MeshStandardMaterial({color:0x1a1f2b,metalness:.6,roughness:.5}));p.position.set(px,35,pz);neonG.add(p);
  const head=new THREE.Mesh(new THREE.BoxGeometry(9,4,1.5),glow(0xeaf2ff,4));head.position.set(px,71,pz);head.lookAt(0,0,0);neonG.add(head)}
 const sp=[];for(let i=0;i<1600;i++){const t=Math.random()*Math.PI*2,u=Math.random()*.9+.08,r=1000;sp.push(Math.cos(t)*r*Math.sqrt(1-u*u),u*r,Math.sin(t)*r*Math.sqrt(1-u*u))}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));neonG.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xbcd0ff,size:1.6,sizeAttenuation:false,fog:false})))}
