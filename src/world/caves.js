// ---------- Highlands caves: the underground level (pure maths: world/highlands.js, physics/world.js and bots/dogfight.js use it) ----------
// One description: caverns (ellipsoids) and capsules (tunnels, and entrances from the surface) between named nodes, point-mirrored like
// the map (x,z) -> (-x,-z). From it come sdCave() (negative inside the caves), the bots' waypoint graph, the entrances, and the meshes:
// each piece is meshed on its own and clipped exactly where it enters another piece's free space or comes out of the rock, and the
// terrain is clipped where the caves open (clipIndexed). Those same triangles are drawn and given to Rapier, so what you see is
// what you hit. Caves sit 70-130 m down (the lowest ground is the river canyon at -40), so they keep a solid roof except at entrances.
import {COL} from '../config/constants.js';
import {DBASE,cxR,dfGrid,dfH,dfHt} from './terrain.js';
import {fbm} from './noise.js';
const mir=p=>[-p[0],p[1],-p[2]],mn=n=>n==='H0'?n:n.endsWith("'")?n.slice(0,-1):n+"'";
const top=(x,z,a)=>{let m=-1e9;for(const dx of[-14,0,14])for(const dz of[-14,0,14])m=Math.max(m,dfH(x+dx,z+dz));return m+a};
// nodes: H0 hall under the river (centre), H1 cavern under the blue half (H1' orange), A/B ring waypoints, S1-S3 points above the entrances
const N={H0:[0,-100,0],H1:[-250,-95,280],A:[150,-88,330],B:[300,-90,60],
 S1:[-95,top(-95,545,22),545],  // hillside ramp beside the blue base (~115 m from the pad), down to H1
 S2:[cxR(-200)+6,-22,-200],     // ramp out of the river canyon's east wall, down to the hall
 S3:[300,top(300,60,25),60]};   // vertical shaft in the open hills, down to the ring at B
for(const k of Object.keys(N))if(k!=='H0')N[mn(k)]=mir(N[k]);
const CAV=[['H0',[85,27,95]],['H1',[70,26,80]]],TUN=[['H0','H1',20],['H1','A',20],['A','B',20],['B',"H1'",20],['S1','H1',17],['S2','H0',17],['S3','B',16]];
export const CAVE={nodes:N,pieces:[],entrances:[],adj:{}};
{const P=CAVE.pieces,add=o=>{const lo=[0,1,2].map(i=>o.k==='e'?o.c[i]-o.r[i]:Math.min(o.a[i],o.b[i])-o.r),hi=[0,1,2].map(i=>o.k==='e'?o.c[i]+o.r[i]:Math.max(o.a[i],o.b[i])+o.r);P.push({...o,lo,hi})};
 for(const[n,r]of CAV){add({k:'e',c:N[n],r,n});if(n!=='H0')add({k:'e',c:N[mn(n)],r,n:mn(n)})}
 for(const[a,b,r]of TUN)for(const[x,y]of a==='H0'&&b==='H0'?[[a,b]]:[[a,b],[mn(a),mn(b)]]){const A=N[x],B=N[y],d=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],L=Math.hypot(...d);
  add({k:'c',a:A,b:B,r,L,d:d.map(v=>v/L),n:[x,y],ent:x[0]==='S'});(CAVE.adj[x]||(CAVE.adj[x]=[])).push(y);(CAVE.adj[y]||(CAVE.adj[y]=[])).push(x)}
 // entrance mouths: where the entrance's axis goes into the ground
 for(const p of P)if(p.ent){let lo=0,hi=p.L;for(let i=0;i<40;i++){const t=(lo+hi)/2,q=p.a.map((v,j)=>v+p.d[j]*t);if(q[1]>dfH(q[0],q[2]))lo=t;else hi=t}
  CAVE.entrances.push({p:p.a.map((v,j)=>v+p.d[j]*lo),d:p.d,r:p.r,top:p.a,name:p.n[0]})}}
// signed distance to one piece (negative inside its free space); ellipsoids use the k0(k0-1)/k1 bound (exact zero set)
export function sdPiece(o,x,y,z){if(o.k==='c'){const px=x-o.a[0],py=y-o.a[1],pz=z-o.a[2];let t=px*o.d[0]+py*o.d[1]+pz*o.d[2];t=t<0?0:t>o.L?o.L:t;return Math.hypot(px-o.d[0]*t,py-o.d[1]*t,pz-o.d[2]*t)-o.r}
 const qx=(x-o.c[0])/o.r[0],qy=(y-o.c[1])/o.r[1],qz=(z-o.c[2])/o.r[2],k0=Math.hypot(qx,qy,qz),k1=Math.hypot(qx/o.r[0],qy/o.r[1],qz/o.r[2]);return k1>1e-9?k0*(k0-1)/k1:-Math.min(...o.r)}
// the whole network, capped at 60 m (pieces whose box is farther than the best so far are skipped)
export function sdCave(x,y,z,skip){let m=60;for(const o of CAVE.pieces){if(o===skip)continue;const dx=Math.max(o.lo[0]-x,x-o.hi[0],0),dy=Math.max(o.lo[1]-y,y-o.hi[1],0),dz=Math.max(o.lo[2]-z,z-o.hi[2],0);
  if(dx*dx+dy*dy+dz*dz>=m*m)continue;const d=sdPiece(o,x,y,z);if(d<m)m=d}return m}
export const inCave=(x,y,z)=>y<dfHt(x,z)&&sdCave(x,y,z)<0;  // underground and inside a cave

// ---------- bots: a route through the network ----------
// from/to: {x,y,z}; see(a,b): line of sight. Returns the farthest node along the shortest node route that `from` can see, or null.
const NODES=Object.keys(N),NP=Object.fromEntries(NODES.map(k=>[k,{x:N[k][0],y:N[k][1],z:N[k][2]}])),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function caveRoute(from,to,see){const vis=k=>see(from,NP[k]),cost={},prev={},done=new Set();let best=null,bc=1e9;
 for(const k of NODES)cost[k]=dist(from,NP[k])*(vis(k)?1:4);  // nodes the bot can't see directly cost more to start from
 for(;;){let k=null,c=1e9;for(const n of NODES)if(!done.has(n)&&cost[n]<c){c=cost[n];k=n}if(!k)break;done.add(k);
  const end=c+dist(NP[k],to)*(see(NP[k],to)?1:6);if(end<bc){bc=end;best=k}
  for(const n of CAVE.adj[k]||[]){const c2=c+dist(NP[k],NP[n]);if(c2<cost[n]){cost[n]=c2;prev[n]=k}}}
 if(!best)return null;const path=[];for(let k=best;k;k=prev[k])path.unshift(k);for(let i=path.length-1;i>=0;i--)if(vis(path[i]))return NP[path[i]];return NP[path[0]]}

// ---------- meshes ----------
// clip an indexed mesh to g(p) > 0: triangles crossing g = 0 are cut along it (edge points found by bisection on the true g, shared per
// edge so the cut is watertight); attrs [{a:array,n:size}] are interpolated. Returns {p, idx, attrs}
export function clipIndexed(P,I,attrs,g){const G=[],gv=i=>G[i]??(G[i]=g(P[i*3],P[i*3+1],P[i*3+2])),cut=new Map(),O=[],np=()=>P.length/3;
 const cross=(i,j)=>{const k=i<j?i+','+j:j+','+i;let v=cut.get(k);if(v!=null)return v;const a=i<j?i:j,b=i<j?j:i;let lo=0,hi=1;const ga=gv(a)>0;
  for(let n=0;n<24;n++){const t=(lo+hi)/2;if((g(P[a*3]+(P[b*3]-P[a*3])*t,P[a*3+1]+(P[b*3+1]-P[a*3+1])*t,P[a*3+2]+(P[b*3+2]-P[a*3+2])*t)>0)===ga)lo=t;else hi=t}const t=(lo+hi)/2;
  v=np();for(let c=0;c<3;c++)P.push(P[a*3+c]+(P[b*3+c]-P[a*3+c])*t);for(const A of attrs)for(let c=0;c<A.n;c++)A.a.push(A.a[a*A.n+c]+(A.a[b*A.n+c]-A.a[a*A.n+c])*t);G[v]=0;cut.set(k,v);return v};
 for(let t=0;t<I.length;t+=3){const T=[I[t],I[t+1],I[t+2]],k=T.map(i=>gv(i)>0);if(k[0]&&k[1]&&k[2]){if(area(P,...T)>1e-6)O.push(...T);continue}if(!k[0]&&!k[1]&&!k[2])continue;
  const poly=[];for(let e=0;e<3;e++){const i=T[e],j=T[(e+1)%3];if(k[e])poly.push(i);if(k[e]!==k[(e+1)%3])poly.push(cross(i,j))}
  for(let e=1;e+1<poly.length;e++){const a=poly[0],b=poly[e],c=poly[e+1];if(a!==b&&b!==c&&a!==c&&area(P,a,b,c)>1e-6)O.push(a,b,c)}}
 return{p:P,idx:O,attrs}}
const area=(P,a,b,c)=>{const ux=P[b*3]-P[a*3],uy=P[b*3+1]-P[a*3+1],uz=P[b*3+2]-P[a*3+2],vx=P[c*3]-P[a*3],vy=P[c*3+1]-P[a*3+1],vz=P[c*3+2]-P[a*3+2];return Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2};
const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],hex=h=>[(h>>16&255)/255,(h>>8&255)/255,(h&255)/255],TB=hex(COL[0]),TO=hex(COL[1]);
export const teamTint=z=>{const t=Math.min(1,Math.max(0,(z+60)/120)),s=t*t*(3-2*t);return lerp3(TO,TB,s)};  // orange half (z<0) to blue half (z>0)
// cave walls: unlit rock with the light baked in (floors lighter, ceilings dark, a team glow near the guide strips), and the strips
export function buildCaves(){dfGrid();const W={p:[],c:[],i:[]},S={p:[],c:[],i:[]},rock=[.16,.15,.14];
 const rockShade=(n,glow,z,p)=>{const k=(.4+.35*n[1])*(.62+.55*fbm(p[0]/9+p[1]/17,p[2]/9-p[1]/23)),tt=teamTint(z);return[rock[0]*k+tt[0]*glow,rock[1]*k+tt[1]*glow,rock[2]*k+tt[2]*glow]};
 const grid=(M,rows,cols,vert,wrap)=>{const b=M.p.length/3;for(const r of rows)for(const c of cols){const[p,col]=vert(r,c);M.p.push(...p);M.c.push(...col)}const nc=cols.length;
  for(let r=0;r<rows.length-1;r++)for(let c=0;c<(wrap?nc:nc-1);c++){const c2=(c+1)%nc,a=b+r*nc+c,bb=b+r*nc+c2,cc=b+(r+1)*nc+c2,d=b+(r+1)*nc+c;M.i.push(a,bb,cc,a,cc,d)}};
 const orient=(M,inward)=>{for(let t=0;t<M.i.length;t+=3){const[a,b,c]=[M.i[t],M.i[t+1],M.i[t+2]].map(i=>M.p.slice(i*3,i*3+3)),u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const f=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],m=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3],n=inward(m);
  if(f[0]*n[0]+f[1]*n[1]+f[2]*n[2]<0){const x=M.i[t+1];M.i[t+1]=M.i[t+2];M.i[t+2]=x}}};
 const out=(M,O,g)=>{const R=clipIndexed(M.p,M.i,[{a:M.c,n:3}],g),b=O.p.length/3;O.p.push(...R.p);O.c.push(...R.attrs[0].a);for(const i of R.idx)O.i.push(i+b)};
 const rockSD=(x,y,z)=>dfHt(x,z)-y;
 for(const o of CAVE.pieces){const M={p:[],c:[],i:[]},T={p:[],c:[],i:[]},g=(x,y,z)=>Math.min(sdCave(x,y,z,o),rockSD(x,y,z));
  if(o.k==='e'){const[rx,ry,rz]=o.r,lat=Array.from({length:25},(_,i)=>i/24*Math.PI),lon=Array.from({length:72},(_,i)=>i/72*Math.PI*2);
   grid(M,lat,lon,(f,t)=>{const p=[o.c[0]+rx*Math.sin(f)*Math.cos(t),o.c[1]+ry*Math.cos(f),o.c[2]+rz*Math.sin(f)*Math.sin(t)],q=[(p[0]-o.c[0])/rx/rx,(p[1]-o.c[1])/ry/ry,(p[2]-o.c[2])/rz/rz],l=Math.hypot(...q)||1;
    return[p,rockShade([-q[0]/l,-q[1]/l,-q[2]/l],.05,p[2],p)]},true);
   orient(M,m=>{const q=[(o.c[0]-m[0])/rx/rx,(o.c[1]-m[1])/ry/ry,(o.c[2]-m[2])/rz/rz];return q});
   // a glowing band round the cavern a third of the way up, and a ring of light on its floor
   for(const[fy,w]of[[.62,1.6],[.86,1]]){const b=T.p.length/3,n=96;for(let i=0;i<=n;i++){const t=i/n*Math.PI*2;for(const df of[-w/ry/2,w/ry/2]){const ff=Math.PI-Math.acos(fy)+df,s=.97;
     const p=[o.c[0]+rx*s*Math.sin(ff)*Math.cos(t),o.c[1]+ry*s*Math.cos(ff),o.c[2]+rz*s*Math.sin(ff)*Math.sin(t)];T.p.push(...p);T.c.push(...teamTint(p[2]).map(v=>v*1.6))}}
    for(let i=0;i<n;i++){const a=b+i*2;T.i.push(a,a+1,a+3,a,a+3,a+2)}}}
  else{const{a,b,r,L,d}=o,ref=Math.abs(d[1])<.9?[0,1,0]:[1,0,0],e1n=[d[1]*ref[2]-d[2]*ref[1],d[2]*ref[0]-d[0]*ref[2],d[0]*ref[1]-d[1]*ref[0]],l1=Math.hypot(...e1n),e1=e1n.map(v=>v/l1),
    e2=[e1[1]*d[2]-e1[2]*d[1],e1[2]*d[0]-e1[0]*d[2],e1[0]*d[1]-e1[1]*d[0]],nb=Math.max(1,Math.ceil(L/8)),rows=[];
   for(let k=0;k<6;k++)rows.push([-1,Math.PI/2*(1-k/6)]);for(let k=0;k<=nb;k++)rows.push([0,L*k/nb]);for(let k=1;k<=6;k++)rows.push([1,Math.PI/2*k/6]);
   const NS=48,th=Array.from({length:NS},(_,i)=>i/NS*Math.PI*2),ax=(row)=>{const[s,v]=row;if(s===0)return{c:a.map((q,j)=>q+d[j]*v),rad:r};
    const c0=s<0?a:b,sg=s<0?-1:1;return{c:c0.map((q,j)=>q+sg*d[j]*r*Math.sin(v)),rad:r*Math.cos(v),sc:c0}};
   grid(M,rows,th,(row,t)=>{const{c,rad,sc}=ax(row),dir=[0,1,2].map(j=>Math.cos(t)*e1[j]+Math.sin(t)*e2[j]),p=c.map((q,j)=>q+dir[j]*rad);
    const n=sc?[0,1,2].map(j=>(sc[j]-p[j])/r):dir.map(v=>-v),gl=.32*(Math.max(0,Math.cos(t-Math.PI/2))**14+Math.max(0,Math.cos(t+Math.PI/2))**14);return[p,rockShade(n,gl,p[2],p)]},true);
   orient(M,m=>{let t=(m[0]-a[0])*d[0]+(m[1]-a[1])*d[1]+(m[2]-a[2])*d[2];t=Math.max(0,Math.min(L,t));return[a[0]+d[0]*t-m[0],a[1]+d[1]*t-m[1],a[2]+d[2]*t-m[2]]});
   // guide strips along the ceiling and the floor (1.4 m wide, 15 cm off the wall)
   for(const t0 of[Math.PI/2,-Math.PI/2]){const b0=T.p.length/3,dt=.7/r;for(let k=0;k<=nb;k++)for(const t of[t0-dt,t0+dt]){const p=[0,1,2].map(j=>a[j]+d[j]*L*k/nb+(Math.cos(t)*e1[j]+Math.sin(t)*e2[j])*(r-.15));T.p.push(...p);T.c.push(...teamTint(p[2]).map(v=>v*1.8))}
    for(let k=0;k<nb;k++){const q=b0+k*2;T.i.push(q,q+1,q+3,q,q+3,q+2)}}}
  out(M,W,g);out(T,S,g)}
 return{walls:W,strips:S}}
// check helpers: the nodes' surface opening above each entrance, and a point every few metres along every piece's axis (scripted flights)
export function caveAxes(step=6){const L=[];for(const o of CAVE.pieces)if(o.k==='c'){const n=Math.ceil(o.L/step);const pts=[];for(let i=0;i<=n;i++)pts.push(o.a.map((v,j)=>v+o.d[j]*o.L*i/n));L.push({name:o.n.join('-'),r:o.r,pts,ent:o.ent})}return L}
export {DBASE};
