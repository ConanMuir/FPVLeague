// ---------- arena ----------
// pitch markings in metres (shared by every floor texture)
import * as THREE from 'three';
import {COL,GD,GH,GW,H,HL,HW,L,RC,RF,W,cl} from '../config/constants.js';
import {fatLines,glow,scene,tex} from '../render/renderer.js';
import {RM,arenaData} from '../physics/arena-shape.js';
export function pitchLines(g,w,h,box){const k=w/W,t=RF*k;g.beginPath();if(g.roundRect)g.roundRect(t,t,w-2*t,h-2*t,(RC-RF)*k);else g.rect(t,t,w-2*t,h-2*t);g.stroke();
 g.beginPath();g.moveTo(t,h/2);g.lineTo(w-t,h/2);g.stroke();g.beginPath();g.arc(w/2,h/2,W*.13*k,0,7);g.stroke();g.beginPath();g.arc(w/2,h/2,1.2*k,0,7);g.fill();
 const bw=GW*1.5*k,bd=GW*.55*k,sw=GW*1.05*k,sd=GW*.22*k;[[t,1],[h-t,-1]].forEach(([y,s],i)=>{if(box)g.strokeStyle=box[i];g.strokeRect(w/2-bw/2,s>0?y:y-bd,bw,bd);g.strokeRect(w/2-sw/2,s>0?y:y-sd,sw,sd)})}
// centre emblem: a hex badge with a quad silhouette and the wordmark (Neon Arena floor)
function emblem(g,cx,cy,R){g.save();g.translate(cx,cy);const hex=r=>{g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i;g.lineTo(r*Math.cos(a),r*Math.sin(a))}g.closePath()};
 hex(R);g.fillStyle='rgba(10,16,32,.85)';g.fill();g.lineWidth=R*.05;g.strokeStyle='rgba(215,230,255,.75)';g.stroke();hex(R*.86);g.lineWidth=R*.015;g.strokeStyle='rgba(160,200,255,.35)';g.stroke();
 g.fillStyle='rgba(215,230,255,.85)';for(const[sx,sy]of[[1,1],[-1,1],[1,-1],[-1,-1]]){g.save();g.rotate(Math.atan2(sy,sx));g.fillRect(0,-R*.035,R*.42,R*.07);g.restore();g.beginPath();g.arc(sx*R*.3,sy*R*.3,R*.15,0,7);g.lineWidth=R*.03;g.stroke()}
 g.fillRect(-R*.1,-R*.16,R*.2,R*.32);g.font=`italic 700 ${R*.2}px "Chakra Petch",sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillStyle='#3d95ff';g.fillText('DRONE',0,R*.62);g.fillStyle='#ff8a2a';g.fillText('LEAGUE',0,R*.83);g.restore()}
const floorTex=tex(2048,Math.round(2048*L/W),(g,w,h)=>{
 g.fillStyle='#0a0f1e';g.fillRect(0,0,w,h);
 const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(255,122,26,.3)');gr.addColorStop(.42,'rgba(255,122,26,.04)');gr.addColorStop(.5,'rgba(0,0,0,0)');gr.addColorStop(.58,'rgba(45,140,255,.04)');gr.addColorStop(1,'rgba(45,140,255,.3)');g.fillStyle=gr;g.fillRect(0,0,w,h);
 g.strokeStyle='rgba(130,170,255,.08)';g.lineWidth=3;const s=52;
 for(let y=0,r=0;y<h+s;y+=s*1.5,r++)for(let x=(r%2)*s*.866;x<w+s;x+=s*1.732){g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i+Math.PI/6;g.lineTo(x+s*Math.cos(a),y+s*Math.sin(a))}g.closePath();g.stroke()}
 g.strokeStyle='rgba(215,230,255,.7)';g.fillStyle='#fff';g.lineWidth=8;pitchLines(g,w,h,['rgba(255,140,50,.75)','rgba(70,160,255,.75)']);
 emblem(g,w/2,h/2,W*.1*w/W);
});
// contour of the rounded plan, offset o (crowd stands and rim lines)
function contour(o,st=1,arc=14){const pts=[],a=HW-RC,b=HL-RC;
 const line=(x0,z0,x1,z1,nx,nz)=>{const n=Math.max(1,Math.round(Math.hypot(x1-x0,z1-z0)/st));for(let i=0;i<n;i++){const t=i/n;pts.push([x0+(x1-x0)*t+nx*o,z0+(z1-z0)*t+nz*o,nx,nz])}};
 const arcF=(cx,cz,a0)=>{for(let i=0;i<arc;i++){const t=a0+i/arc*Math.PI/2,c=Math.cos(t),s=Math.sin(t);pts.push([cx+c*(RC+o),cz+s*(RC+o),c,s])}};
 line(HW,-b,HW,b,1,0);arcF(a,b,0);line(a,HL,-a,HL,0,1);arcF(-a,b,Math.PI/2);line(-HW,b,-HW,-b,-1,0);arcF(-a,-b,Math.PI);line(-a,-HL,a,-HL,0,-1);arcF(a,-b,Math.PI*1.5);return pts}
const RIM=contour(0,1),inMouth=(x,y,z)=>Math.abs(x)<GW/2+RM&&y<GH&&Math.abs(z)>HL-RF-.5;
// the surface itself comes from physics/arena-shape.js (the same profile as the collision trimesh and the SDF), with analytic normals
const AR=arenaData(),geo=P=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(P.n,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(P.uv,2));g.setIndex(P.idx);return g},mesh=(P,mat)=>{const m=new THREE.Mesh(geo(P),mat);scene.add(m);return m};
export const NETM=[],GOALF=[],mouthM=[];export let floorM;
{floorM=mesh(AR.floor,new THREE.MeshStandardMaterial({map:floorTex,emissive:0xffffff,emissiveMap:floorTex,emissiveIntensity:.32,roughness:.38,metalness:.35}));floorM.receiveShadow=true;
 for(const t of[1,0]){const m=mesh(AR.mouth[t],new THREE.MeshStandardMaterial({color:0x0b1122,roughness:.4,metalness:.35}));m.receiveShadow=true;mouthM.push(m)}}  // mouth floors (-z first, as v15)
export const outer=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:0x070a12,roughness:.95}));outer.rotation.x=-Math.PI/2;outer.position.y=-.03;outer.receiveShadow=true;scene.add(outer);
export const gridTex=tex(128,128,(g,w,h)=>{g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=3;g.strokeRect(0,0,w,h);g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=1;g.strokeRect(w/4,h/4,w/2,h/2)},true);
const netTex=tex(64,64,(g,w,h)=>{g.strokeStyle='#fff';g.lineWidth=3;g.strokeRect(0,0,w,h)},true);
const wallMat=new THREE.MeshBasicMaterial({map:gridTex,color:0x3a5c9c,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
export const rampM=mesh(AR.ramp,new THREE.MeshStandardMaterial({color:0x121a30,roughness:.3,metalness:.6,emissive:0x5c86d6,emissiveMap:gridTex,emissiveIntensity:.5,side:THREE.DoubleSide}));rampM.receiveShadow=true;
export const wallM=mesh(AR.wall,wallMat);
export const RIML=[];{const cB=new THREE.Color(COL[0]).multiplyScalar(1.1),cO=new THREE.Color(COL[1]).multiplyScalar(1.1),cW=new THREE.Color(0x9fc4ff).multiplyScalar(.9);  // just over the bloom threshold: thin far lines bead if they bloom hard
 const teamCol=z=>cW.clone().lerp(z>0?cB:cO,cl(Math.abs(z)/HL*1.4,0,1));
 const loop=(d,y,col)=>{const P=[],Cl=[],C=RIM;for(let i=0;i<C.length;i++){const a=C[i],b=C[(i+1)%C.length],pa=[a[0]+a[2]*d,y,a[1]+a[3]*d],pb=[b[0]+b[2]*d,y,b[1]+b[3]*d];
  if(y>.1&&inMouth((pa[0]+pb[0])/2,y,(pa[2]+pb[2])/2))continue;P.push(...pa,...pb);const c1=col(pa[2]),c2=col(pb[2]);Cl.push(c1.r,c1.g,c1.b,c2.r,c2.g,c2.b)}
  const l=fatLines(P,.22,{colors:Cl});scene.add(l);RIML.push(l)};
 loop(-RF,.04,teamCol);loop(0,RF,()=>cW);loop(0,H-RF,()=>cW);loop(-RF,H,teamCol)}
// goals: team 0 (blue) defends +z, team 1 (orange) defends -z. Rounded rim (lit like the ramp) with a glow line along it, rounded net pocket.
export const goalG=new THREE.Group(),_n0=scene.children.length;
for(const t of[0,1]){const s=t?-1:1,c=COL[t],pm=glow(c,2);
 const rim=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(AR.rim[t].map(p=>new THREE.Vector3(...p))),AR.rim[t].length*2,.22,8),pm);scene.add(rim);
 const nm=new THREE.MeshBasicMaterial({map:netTex,color:c,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});NETM.push(nm);mesh(AR.nets[t],nm);
 const gf=mesh(AR.goalF[t],new THREE.MeshStandardMaterial({color:0x0a0f1e,emissive:c,emissiveIntensity:.35}));GOALF.push(gf);  // meets the mouth floor and the nets exactly (shared vertices), so no z-offset
 const gl=new THREE.PointLight(c,90,45);gl.position.set(0,GH*.6,s*(HL+GD*.6));scene.add(gl)}
scene.children.slice(_n0).forEach(o=>goalG.add(o));scene.add(goalG);
// stadium crowd + light towers + stars (Neon Arena map only)
export const neonG=new THREE.Group();scene.add(neonG);
{const geo=new THREE.BoxGeometry(1,1.3,1),N=16000,im=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial(),N),m=new THREE.Matrix4(),col=new THREE.Color();let n=0;
 for(let k=0;k<14&&n<N;k++){const o=14+k*2.3,y=1.5+k*1.75;for(const[x,z]of contour(o,1.45,Math.round((RC+o)*1.08))){if(n>=N)break;
  m.makeTranslation(x,y,z);im.setMatrixAt(n,m);const r=Math.random(),team=z>0?0:1;
  if(r<.012)col.setRGB(1.15,1.15,1.25);else if(r<.12)col.set(COL[Math.random()<.75?team:1-team]).multiplyScalar(.4+Math.random()*.45);else col.setRGB(.04,.05,.08).multiplyScalar(.6+Math.random());
  im.setColorAt(n++,col)}}
 im.count=n;neonG.add(im);
 for(const[x,z]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const px=x*(HW+52),pz=z*(HL+52);const p=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,H+6,16),new THREE.MeshStandardMaterial({color:0x1a1f2b,metalness:.6,roughness:.5}));p.position.set(px,(H+6)/2,pz);neonG.add(p);
  const head=new THREE.Mesh(new THREE.BoxGeometry(9,4,1.5),glow(0xeaf2ff,1.5));head.position.set(px,H+7,pz);head.lookAt(0,0,0);neonG.add(head)}
 const sp=[];for(let i=0;i<1600;i++){const t=Math.random()*Math.PI*2,u=Math.random()*.9+.08,r=1000;sp.push(Math.cos(t)*r*Math.sqrt(1-u*u),u*r,Math.sin(t)*r*Math.sqrt(1-u*u))}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));neonG.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xbcd0ff,size:1.6,sizeAttenuation:false,fog:false})))}
// ---------- stadium ring (Neon Arena): concourse floor between the glass and the stands, a barrier in front of the crowd,
// and scrolling LED ad boards along the foot of the glass, Rocket League style ----------
// strip(oA,yA,oB,yB): a band along the rounded plan from offset oA at height yA to offset oB at height yB; u runs along the contour (metres)
function strip(oA,yA,oB,yB,skipMouth){const A=contour(oA,2),B=contour(oB,2),p=[],uv=[],idx=[];let u=0;
 for(let i=0;i<=A.length;i++){const a=A[i%A.length],b=B[i%B.length];if(i){const q=A[(i-1)%A.length];u+=Math.hypot(a[0]-q[0],a[1]-q[1])}p.push(a[0],yA,a[1],b[0],yB,b[1]);uv.push(u,0,u,1)}
 for(let i=0;i<A.length;i++){const k=i*2,m=A[i],n=A[(i+1)%A.length];if(skipMouth&&inMouth((m[0]+n[0])/2,yA,(m[1]+n[1])/2))continue;idx.push(k,k+1,k+2,k+1,k+3,k+2)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}
const adTex=tex(4096,64,(g,w,h)=>{g.fillStyle='#060912';g.fillRect(0,0,w,h);const seg=w/8;
 for(let i=0;i<8;i++){const x=i*seg;g.fillStyle=i%2?'#ff8a2a':'#3d95ff';g.fillRect(x,0,6,h);g.fillRect(x,h-5,seg,5);
  g.font='italic 700 38px "Chakra Petch",sans-serif';g.textBaseline='middle';g.fillStyle=i%4===1?'#ffc640':'#e8f0ff';g.fillText(['DRONE LEAGUE','5" ACRO ONLY','BETAFLIGHT RATES','FLY FPV'][i%4],x+22,h/2)}},true);
adTex.wrapT=THREE.ClampToEdgeWrapping;adTex.repeat.set(1/360,1);  // one 360 m run of eight panels per texture width
const conTex=tex(256,256,(g,w,h)=>{g.fillStyle='#1c2436';g.fillRect(0,0,w,h);g.strokeStyle='rgba(140,170,230,.12)';g.lineWidth=2;for(let i=0;i<=w;i+=64){g.beginPath();g.moveTo(i,0);g.lineTo(i,h);g.stroke()}},true);conTex.repeat.set(1/8,1);
{const con=new THREE.Mesh(strip(1,.02,13,.02),new THREE.MeshStandardMaterial({map:conTex,color:0x9aa6c0,roughness:.6,metalness:.4}));con.receiveShadow=true;neonG.add(con);  // concourse
 const bar=new THREE.Mesh(strip(13,0,13,2.6),new THREE.MeshStandardMaterial({color:0x10151f,roughness:.5,metalness:.5,side:THREE.DoubleSide}));neonG.add(bar);  // crowd barrier
 const trim=[],C=contour(13,2);for(let i=0;i<C.length;i++){const a=C[i],b=C[(i+1)%C.length];trim.push(a[0],2.6,a[1],b[0],2.6,b[1])}
 const tl=fatLines(trim,.16,{color:new THREE.Color(0x9fc4ff).multiplyScalar(.9)});neonG.add(tl);
 const ad=new THREE.Mesh(strip(.5,RF+.3,.5,RF+3.1,true),new THREE.MeshBasicMaterial({map:adTex,color:0xffffff,side:THREE.BackSide,toneMapped:true}));neonG.add(ad)}  // LED boards just behind the glass
// goal frames: a team-colour border on the end wall around each mouth, and a lit back panel in the pocket
const goalPanelTex=tex(256,128,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);g.strokeStyle='#fff';g.lineWidth=3;const s=16;
 for(let y=0,r=0;y<h+s;y+=s*1.5,r++)for(let x=(r%2)*s*.866;x<w+s;x+=s*1.732){g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i+Math.PI/6;g.lineTo(x+s*.85*Math.cos(a),y+s*.85*Math.sin(a))}g.closePath();g.stroke()}},true);
for(const t of[0,1]){const s=t?-1:1,c=COL[t];
 const o=new THREE.Shape(),hw=GW/2+RM+5,top=GH+RM+4;o.moveTo(-hw,RF);o.lineTo(-hw,top-3);o.quadraticCurveTo(-hw,top,-hw+3,top);o.lineTo(hw-3,top);o.quadraticCurveTo(hw,top,hw,top-3);o.lineTo(hw,RF);o.lineTo(GW/2+RM+1.2,RF);
 o.lineTo(GW/2+RM+1.2,GH+RM-1);o.quadraticCurveTo(GW/2+RM+1.2,GH+RM+1.2,GW/2+RM-1,GH+RM+1.2);o.lineTo(-GW/2-RM+1,GH+RM+1.2);o.quadraticCurveTo(-GW/2-RM-1.2,GH+RM+1.2,-GW/2-RM-1.2,GH+RM-1);o.lineTo(-GW/2-RM-1.2,RF);o.closePath();
 const fr=new THREE.Mesh(new THREE.ShapeGeometry(o,8),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(.55),transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
 fr.position.set(0,0,s*(HL-.15));if(t)fr.rotation.y=Math.PI;goalG.add(fr);
 const bp=new THREE.Mesh(new THREE.PlaneGeometry(GW-4,GH-2),new THREE.MeshBasicMaterial({map:goalPanelTex,color:new THREE.Color(c).multiplyScalar(.9),transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
 bp.position.set(0,GH/2,s*(HL+GD-.3));if(!t)bp.rotation.y=Math.PI;goalG.add(bp)}
export function arenaTick(dt){adTex.offset.x=(adTex.offset.x+dt*.012)%1}  // the LED boards scroll
