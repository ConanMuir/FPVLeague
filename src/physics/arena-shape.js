// ---------- arena shape: one profile for the visual meshes, the collision trimesh and the analytic SDF ----------
// Rocket League-style stadium: quarter-pipes floor->wall and wall->ceiling (radius RF), rounded vertical corners (RC),
// goal mouths with a rounded rim (radius RM) where the end wall meets the goal (posts, crossbar and the cut in the ramp
// beside the mouth), and goal interiors with rounded back and top edges (RG). W/L/H, the goal size, RF and RC are as v15,
// so spawns, orbs and pitch markings still line up.
//  arenaSD(x,y,z)  analytic SDF (positive = solid). The rim is an exact rolling-ball fillet: the arena surface and the goal
//                  walls always meet at 90 degrees, so the round union below is exact there.
//  buildArena()    the surface as pieces (floor, mouth[2], goalF[2], ramp, wall, nets[2], ceil, plus the post glow paths);
//                  every piece is generated from the same parametric profile, so seams share vertices bit for bit, and
//                  arenaTrimesh() welds them into one closed, consistently oriented mesh for Rapier.
// Pure maths (three is only used for earcut), so tools/physics-check.mjs can import it in node.
import {ShapeUtils,Vector2} from 'three';
import {GD,GH,GW,H,HL,HW,RC,RF} from '../config/constants.js';
export const RM=2.5,RG=3;  // mouth rim fillet radius, goal interior edge radius
const P2=Math.PI/2,LAM=12,XW=GW/2+LAM,YT=GH+LAM,NF=32,NC=12,NM=10,NB=41,NK=8,CX=GW/2-RG,CY=GH-RG,GDR=GD-RG;
// ---------- SDF ----------
// v15's rounded arena: plan corners RC, floor/ceiling fillets RF (negative inside)
function sdBand(x,y,z){const qx=Math.abs(x)-HW+RC,qz=Math.abs(z)-HL+RC,d2=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-RC;
 const ax=d2+RF,ay=Math.abs(y-H/2)-H/2+RF;return Math.hypot(Math.max(ax,0),Math.max(ay,0))+Math.min(Math.max(ax,ay),0)-RF}
// goal pocket: rounded box (RG) from 20 m inside the field to the back of the goal, reaching below the floor (no floor of its own)
function sdPocket(x,y,z){const qx=Math.abs(x)-GW/2+RG,qy=Math.abs(y-(GH-40)/2)-(GH+40)/2+RG,qz=Math.abs(Math.abs(z)-(HL+GD/2-10))-(GD/2+10)+RG;
 return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)-RG}
// round union of the two free spaces (rounds the solid's convex edge where they meet), then the floor plane
export function arenaSD(x,y,z){const a=sdBand(x,y,z),g=sdPocket(x,y,z);return Math.max(Math.max(RM,Math.min(a,g))-Math.hypot(Math.max(RM-a,0),Math.max(RM-g,0)),-y)}

// ---------- profile ----------
// rows across the band (floor -> ramp -> wall -> ceiling fillet): t 'r' ramp angle, 'w' wall height, 'c' ceiling-fillet angle
const ROWS=[];for(let k=0;k<NF;k++)ROWS.push({t:'r',a:k*P2/NF});
const wy=[RF,(RF+CY)/2,CY];for(let j=1;j<NC/2;j++)wy.push(CY+(RG+LAM)*Math.tan(j*P2/NC));wy.push(YT);{const n=Math.ceil((H-RF-YT)/4);for(let i=1;i<=n;i++)wy.push(YT+(H-RF-YT)*i/n)}
for(const y of wy)ROWS.push({t:'w',a:y});for(let k=1;k<=NF;k++)ROWS.push({t:'c',a:k*P2/NF});
const NL=NF+3,IYT=ROWS.findIndex(r=>r.t==='w'&&r.a===YT),IRT=NF;  // leg rows 0..NL-1 (floor to the top of the posts); row IRT = top of the ramp
// profile point: [plan offset (outward), height, normal along the outward plan normal, normal up]
function prof(r){if(r.t==='r'){const s=Math.sin(r.a),c=Math.cos(r.a);return[-RF+RF*s,RF-RF*c,-s,c]}if(r.t==='w')return[0,r.a,-1,0];const s=Math.sin(r.a),c=Math.cos(r.a);return[-RF+RF*c,H-RF+RF*s,-c,-s]}
const rho=r=>r.t==='r'?RF*r.a:r.t==='w'?P2*RF+r.a-RF:P2*RF+H-2*RF+RF*r.a;  // profile arc length from the floor
const V=(p,n,uv)=>({p,n,uv});
function bandV(px,pz,nx,nz,r,len){const[d,y,nd,ny]=prof(r);return V([px+nx*d,y,pz+nz*d],[nx*nd,ny,nz*nd],[len/6,r.t==='r'?rho(r)/6:(rho(r)-P2*RF)/6])}
// contour columns (v15 order): side x=+HW, corner, end z=+HL (x from +a to -a), corner, side x=-HW, corner, end z=-HL, corner
const a0=HW-RC,b0=HL-RC,COLS=[];
{const end=[];const n=Math.ceil((a0-XW)/2);for(let i=0;i<n;i++)end.push(a0-i*(a0-XW)/n);end.push(XW);
 for(let j=NC/2+1;j<NC;j++)end.push(CX+(RG+LAM)/Math.tan(j*P2/NC));for(let i=0;i<NB;i++)end.push(CX-i*(2*CX)/(NB-1));
 for(let j=NC-1;j>NC/2;j--)end.push(-(CX+(RG+LAM)/Math.tan(j*P2/NC)));end.push(-XW);for(let i=n-1;i>0;i--)end.push(-(a0-i*(a0-XW)/n));
 const side=[],ns=Math.ceil(2*b0/2);for(let i=0;i<ns;i++)side.push(-b0+i*2*b0/ns);
 const arc=(cx,cz,t0)=>{for(let i=0;i<48;i++){const t=t0+i/48*P2;COLS.push({px:cx+Math.cos(t)*RC,pz:cz+Math.sin(t)*RC,nx:Math.cos(t),nz:Math.sin(t)})}};
 for(const z of side)COLS.push({px:HW,pz:z,nx:1,nz:0});arc(a0,b0,0);for(const x of end)COLS.push({px:x,pz:HL,nx:0,nz:1,e:1});arc(-a0,b0,P2);
 for(const z of side)COLS.push({px:-HW,pz:-z,nx:-1,nz:0});arc(-a0,-b0,Math.PI);for(const x of end)COLS.push({px:-x,pz:-HL,nx:0,nz:-1,e:-1});arc(a0,-b0,Math.PI*1.5);
 let len=0;COLS.forEach((c,i)=>{if(i)len+=Math.hypot(c.px-COLS[i-1].px,c.pz-COLS[i-1].pz);c.len=len})}
// contour length along the end walls: len(x) = LEN-x on the +z end, LMZ+x on the -z end (texture u for the goal windows)
const LEN=COLS.find(c=>c.e===1&&c.px===XW).len+XW,LMZ=COLS.find(c=>c.e===-1&&c.px===-XW).len+XW;

// ---------- one goal (local frame, +z end; the -z goal is its mirror) ----------
// A goal is one grid of U-shaped rings around the mouth: arena-side rings (offsets of the rim on the ramp/wall, the outer one
// is the window's boundary in the band), the rim fillet (angle phi), goal-side rings (side walls, top corners and roof, the
// lower part of each bent from the ramp cut to a vertical line), the back fillet (beta), then the flat back wall.
// Samples along every ring: right leg (rows 0..NL-1), right corner (NC-1), crossbar (NB), left corner, left leg.
const SAMP=[];for(let r=0;r<NL;r++)SAMP.push({k:'l',s:1,r});for(let j=1;j<NC;j++)SAMP.push({k:'c',s:1,j});for(let i=0;i<NB;i++)SAMP.push({k:'b',x:CX-i*(2*CX)/(NB-1),i});
for(let j=NC-1;j>0;j--)SAMP.push({k:'c',s:-1,j});for(let r=NL-1;r>=0;r--)SAMP.push({k:'l',s:-1,r});
const UL=(()=>{const L=[];let u=0;SAMP.forEach((q,i)=>{if(i){const a=uPos(SAMP[i-1]),b=uPos(q);u+=Math.hypot(a[0]-b[0],a[1]-b[1])}L.push(u)});return L;
 function uPos(q){return q.k==='l'?[q.s*CX+q.s*RG,q.r<NF?q.r/NF*RF:ROWS[q.r].a]:q.k==='c'?[q.s*(CX+RG*Math.cos(q.j*P2/NC)),CY+RG*Math.sin(q.j*P2/NC)]:[q.x,GH]}})();
function arenaRing(dl,q){const w=((dl-RM)/(LAM-RM))**1.5,lu=v=>(v.lu=1,v);
 if(q.k==='l')return lu(bandV(q.s*(GW/2+dl),HL,0,1,ROWS[q.r],LEN-q.s*(GW/2+dl)));
 if(q.k==='b')return lu(bandV(q.x,HL,0,1,{t:'w',a:GH+dl},LEN-q.x));
 const al=q.j*P2/NC,R=RG+dl;let x,y;
 if(w>=1){if(q.j<NC/2){x=CX+(RG+LAM);y=CY+(RG+LAM)*Math.tan(al)}else if(q.j===NC/2){x=CX+(RG+LAM);y=YT}else{x=CX+(RG+LAM)/Math.tan(al);y=YT}}
 else{const sx=q.j<=NC/2?R:R/Math.tan(al),sy=q.j<NC/2?R*Math.tan(al):R;x=CX+(1-w)*R*Math.cos(al)+w*sx;y=CY+(1-w)*R*Math.sin(al)+w*sy}
 return lu(bandV(q.s*x,HL,0,1,{t:'w',a:y},LEN-q.s*x))}
function filletRing(ph,q,last){const c=last?0:Math.cos(ph),s=last?1:Math.sin(ph),k1=RM*(1-c),k2=RM*(1-s),uv=[0,0];
 if(q.k==='l'){if(q.r<NF){const t0=Math.acos(RF/(RF+k1)),th=t0+(P2-t0)*q.r/NF,sn=Math.sin(th),cs=Math.cos(th),zr=HL-RF+RF*sn,yr=RF-RF*cs;
   return V([q.s*(GW/2+k2),q.r?yr-k1*cs:0,zr+k1*sn],[-q.s*s,c*cs,-c*sn],uv)}
  return V([q.s*(GW/2+k2),ROWS[q.r].a,HL+k1],[-q.s*s,0,-c],uv)}
 if(q.k==='b')return V([q.x,GH+k2,HL+k1],[0,-s,-c],uv);
 const al=q.j*P2/NC,ca=Math.cos(al),sa=Math.sin(al),R=RG+k2;return V([q.s*(CX+R*ca),CY+R*sa,HL+k1],[-q.s*s*ca,-s*sa,-c],uv)}
function goalRing(dg,q){const m=(dg-RM)/(GDR-RM),z=HL+dg,uv=[UL[SAMP.indexOf(q)]/1.2,dg/1.2];
 if(q.k==='l'){if(q.r<NF){const t=q.r/NF,t0=Math.acos(RF/(RF+dg)),th=t0+(P2-t0)*t,za=HL-RF+(RF+dg)*Math.sin(th),ya=RF-(RF+dg)*Math.cos(th);
   return V([q.s*GW/2,q.r?(1-m)*ya+m*t*RF:0,m>=1?z:(1-m)*za+m*z],[-q.s,0,0],uv)}return V([q.s*GW/2,ROWS[q.r].a,z],[-q.s,0,0],uv)}
 if(q.k==='b')return V([q.x,GH,z],[0,-1,0],uv);
 const al=q.j*P2/NC,ca=Math.cos(al),sa=Math.sin(al);return V([q.s*(CX+RG*ca),CY+RG*sa,z],[-q.s*ca,-sa,0],uv)}
function capRing(be,q,last){const cb=last?0:Math.cos(be),sb=last?1:Math.sin(be),z=HL+GDR+RG*sb,uv=[UL[SAMP.indexOf(q)]/1.2,(GDR+RG*be)/1.2];
 if(q.k==='l')return V([q.s*(CX+RG*cb),q.r<NF?q.r/NF*RF:ROWS[q.r].a,z],[-q.s*cb,0,-sb],uv);
 if(q.k==='b')return V([q.x,CY+RG*cb,z],[0,-cb,-sb],uv);
 const al=q.j*P2/NC,ca=Math.cos(al),sa=Math.sin(al);return V([q.s*(CX+RG*cb*ca),CY+RG*cb*sa,z],[-q.s*cb*ca,-cb*sa,-sb],uv)}
// goal-side ring whose floor point is exactly z = HL (splits the mouth floor from the goal floor)
const DGH=(()=>{let lo=RM,hi=GDR;for(let i=0;i<60;i++){const m=(lo+hi)/2;if(goalRing(m,SAMP[0]).p[2]<HL)lo=m;else hi=m}return(lo+hi)/2})();

// ---------- builder ----------
function piece(){const P={p:[],n:[],uv:[],idx:[],map:new Map()};P.v=v=>{let i=P.map.get(v);if(i==null){i=P.p.length/3;P.map.set(v,i);P.p.push(...v.p);P.n.push(...v.n);P.uv.push(...v.uv)}return i};return P}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],crs=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// triangle, wound so its face normal agrees with the vertices' (analytic) normals; slivers of zero area are dropped
function tri(P,A,B,C){const f=crs(sub(B.p,A.p),sub(C.p,A.p));if(Math.hypot(...f)<1e-9)return;const n=[A.n[0]+B.n[0]+C.n[0],A.n[1]+B.n[1]+C.n[1],A.n[2]+B.n[2]+C.n[2]];
 if(f[0]*n[0]+f[1]*n[1]+f[2]*n[2]<0)P.idx.push(P.v(A),P.v(C),P.v(B));else P.idx.push(P.v(A),P.v(B),P.v(C))}
const quad=(P,A,B,C,D)=>{tri(P,A,B,C);tri(P,A,C,D)};
// flat polygon (list of vertex objects, all at one height) triangulated with earcut
function poly(P,L,ny){const c=L.map(v=>new Vector2(v.p[0],v.p[2]));for(const[a,b,cc]of ShapeUtils.triangulateShape(c,[])){const A=L[a],B=L[b],C=L[cc];
 const f=crs(sub(B.p,A.p),sub(C.p,A.p));if(Math.abs(f[1])<1e-9)continue;if(f[1]*ny<0)P.idx.push(P.v(A),P.v(C),P.v(B));else P.idx.push(P.v(A),P.v(B),P.v(C))}}
const flr=(x,z,uv)=>V([x,0,z],[0,1,0],uv);
const mir=v=>V([v.p[0],v.p[1],-v.p[2]],[v.n[0],v.n[1],-v.n[2]],v.lu?[(LMZ+v.p[0])/6,v.uv[1]]:v.uv),mirC=new Map(),M=(v,e)=>{if(e>0)return v;let m=mirC.get(v);if(!m)mirC.set(v,m=mir(v));return m};

export function buildArena(){mirC.clear();
 const out={floor:piece(),ramp:piece(),wall:piece(),ceil:piece(),mouth:[piece(),piece()],goalF:[piece(),piece()],nets:[piece(),piece()],rim:[[],[]]};
 // band vertices (shared by the band and the outer ring of each goal window)
 const BV=COLS.map(c=>ROWS.map(r=>bandV(c.px,c.pz,c.nx,c.nz,r,c.len))),nc=COLS.length,inWin=c=>c.e&&Math.abs(c.px)<=XW;
 for(let i=0;i<nc;i++){const i2=(i+1)%nc,ca=COLS[i],cb=COLS[i2];for(let r=0;r<ROWS.length-1;r++){if(inWin(ca)&&inWin(cb)&&r+1<=IYT)continue;
  quad(r<IRT?out.ramp:out.wall,BV[i][r],BV[i2][r],BV[i2][r+1],BV[i][r+1])}}
 const bvAt=(x,e,ri)=>BV[COLS.findIndex(c=>c.e===e&&c.px===x*e)][ri];
 for(let i=0;i<nc;i++)if(COLS[i].e===1){const j=COLS.findIndex(d=>d.e===-1&&d.px===COLS[i].px);if(j>=0)for(let r=0;r<ROWS.length;r++)mirC.set(BV[i][r],BV[j][r])}  // the -z window's outer ring is the -z band
 // the goal grid (+z frame); outer ring = band vertices on the window boundary
 const ARENA=[LAM,9,6.5,4.5],GOALR=[...new Set([DGH,4.5,6.5,8.5,GDR].filter(d=>d===DGH||Math.abs(d-DGH)>.5))].sort((a,b)=>a-b),FIL=Array.from({length:NM+1},(_,m)=>m*P2/NM);
 const rowOfY=y=>ROWS.findIndex(r=>r.t==='w'&&r.a===y);
 const outer=SAMP.map(q=>{if(q.k==='l')return bvAt(q.s*XW,1,q.r);if(q.k==='b')return bvAt(q.x,1,IYT);
  return q.j<=NC/2?bvAt(q.s*XW,1,q.j<NC/2?rowOfY(CY+(RG+LAM)*Math.tan(q.j*P2/NC)):IYT):bvAt(q.s*(CX+(RG+LAM)/Math.tan(q.j*P2/NC)),1,IYT)});
 const rings=[{v:outer,kind:'a'}];for(const d of ARENA.slice(1))rings.push({v:SAMP.map(q=>arenaRing(d,q)),kind:'a'});
 FIL.forEach((f,m)=>rings.push({v:SAMP.map(q=>filletRing(f,q,m===NM)),kind:'f'}));
 for(const d of GOALR)rings.push({v:SAMP.map(q=>goalRing(d,q)),kind:'g',d});
 {const h=rings.find(r=>r.d===DGH).v;for(const i of[0,SAMP.length-1])h[i]=flr(h[i].p[0],HL,h[i].uv)}  // exactly on z = HL
 for(let k=1;k<=NK;k++)rings.push({v:SAMP.map(q=>capRing(k*P2/NK,q,k===NK)),kind:'k'});
 const nf0=1+ARENA.length-1;  // index of the fillet's first ring
 // fillet UVs: continue the ramp texture across the rim
 for(let m=0;m<=NM;m++)rings[nf0+m].v.forEach(v=>{v.uv=[(LEN-v.p[0])/6,(v.p[1]+(v.p[2]-HL+RF))/6];v.lu=1});
 const back=[];{const ys=SAMP.slice(0,NL).map(q=>q.r<NF?q.r/NF*RF:ROWS[q.r].a),last=rings[rings.length-1].v;
  for(let r=0;r<NL;r++){back.push([]);for(let i=0;i<NB;i++){const q=SAMP[NL+NC-1+i];back[r].push(r===NL-1?last[NL+NC-1+i]:i===0?last[r]:i===NB-1?last[SAMP.length-1-r]:V([q.x,ys[r],HL+GD],[0,0,-1],[q.x/1.2,ys[r]/1.2]))}}}
 for(const e of[1,-1]){const t=e>0?0:1,nets=out.nets[t];
  for(let k=0;k<rings.length-1;k++){const A=rings[k],B=rings[k+1];for(let i=0;i<SAMP.length-1;i++){const q=SAMP[i],q2=SAMP[i+1];
   const a=M(A.v[i],e),b=M(A.v[i+1],e),c=M(B.v[i+1],e),d=M(B.v[i],e);let P;
   if(k<nf0)P=q.k==='l'&&q2.k==='l'&&Math.max(q.r,q2.r)<=IRT?out.ramp:out.wall;  // arena side of the window
   else if(k<nf0+NM)P=out.ramp;  // the rim itself (lit like the ramp; a glow line marks the posts)
   else if((a.p[2]+b.p[2]+c.p[2]+d.p[2])*e/4<HL)P=out.ramp;  // cut face of the ramp beside the mouth
   else P=nets;quad(P,a,b,c,d)}}
  for(let r=0;r<NL-1;r++)for(let i=0;i<NB-1;i++)quad(nets,M(back[r][i],e),M(back[r][i+1],e),M(back[r+1][i+1],e),M(back[r+1][i],e));
  // floors: mouth (z from HL-RF to HL) and goal floor (z from HL), bounded by the bottom samples of every ring
  const bot=(k,side)=>M(rings[k].v[side>0?0:SAMP.length-1],e),fk=rings.map((r,k)=>k).filter(k=>rings[k].kind==='f'),gk=rings.map((r,k)=>k).filter(k=>rings[k].kind==='g'),kk=rings.map((r,k)=>k).filter(k=>rings[k].kind==='k');
  const ih=gk.find(k=>rings[k].d===DGH),uvM=v=>{v.uv=[(v.p[0]+GW/2)/GW,(Math.abs(v.p[2])-HL+RF)/(RF+.6)];return v},uvG=v=>{v.uv=[(v.p[0]+GW/2)/GW,(Math.abs(v.p[2])-HL)/GD];return v};
  const mouth=[...fk.map(k=>bot(k,1)),...gk.filter(k=>k<=ih).map(k=>bot(k,1)),...gk.filter(k=>k<=ih).reverse().map(k=>bot(k,-1)),...fk.slice().reverse().map(k=>bot(k,-1))];
  poly(out.mouth[t],mouth.map(v=>uvM(V(v.p,[0,1,0],[0,0]))),1);
  const gf=[...gk.filter(k=>k>=ih).map(k=>bot(k,1)),...kk.map(k=>bot(k,1)),...back[0].slice(1,-1).map(v=>M(v,e)),...kk.slice().reverse().map(k=>bot(k,-1)),...gk.filter(k=>k>=ih).reverse().map(k=>bot(k,-1))];
  poly(out.goalF[t],gf.map(v=>uvG(V(v.p,[0,1,0],[0,0]))),1);
  // post glow path: the middle of the rim fillet
  out.rim[t]=rings[nf0+NM/2].v.map(v=>M(v,e).p)}
 // field floor: the band's bottom row, with each goal window's arena-side ring bottoms in place of the window columns
 {const L=[],bots=(e,side)=>[...ARENA.keys(),nf0].filter(k=>k<ARENA.length||k===nf0).map(k=>M(rings[k].v[side>0?0:SAMP.length-1],e));  // outer ring -> rim
  for(let i=0;i<nc;i++){const c=COLS[i];if(c.e&&Math.abs(c.px)<=XW){if(c.px===XW*c.e)L.push(...bots(c.e,c.e),...bots(c.e,-c.e).reverse());continue}L.push(BV[i][0])}  // a window: walk its bottom edge
  // drop repeats (the outer ring bottoms are the window's boundary columns)
  const F=L.filter((v,i)=>v!==L[(i+L.length-1)%L.length]);poly(out.floor,F.map(v=>V(v.p,[0,1,0],[v.p[0]/HW/2+.5,-v.p[2]/HL/2+.5])),1);
  poly(out.ceil,COLS.map((c,i)=>BV[i][ROWS.length-1]),-1)}
 return out}
// all pieces welded into one indexed mesh (exactly equal positions share an index): Rapier's trimesh with FIX_INTERNAL_EDGES
export function arenaTrimesh(A){const key=new Map(),vs=[],ix=[];
 for(const P of[A.floor,A.ramp,A.wall,A.ceil,...A.mouth,...A.goalF,...A.nets]){const map=[];for(let i=0;i<P.p.length/3;i++){const k=P.p[i*3]+','+P.p[i*3+1]+','+P.p[i*3+2];let j=key.get(k);if(j==null){j=vs.length/3;key.set(k,j);vs.push(P.p[i*3],P.p[i*3+1],P.p[i*3+2])}map.push(j)}
  for(const i of P.idx)ix.push(map[i])}
 return{vertices:new Float32Array(vs),indices:new Uint32Array(ix)}}
export const ARENA_ROWS=ROWS,ARENA_COLS=COLS;
