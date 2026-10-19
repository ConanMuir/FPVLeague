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
// nodes: H0 hall under the river (centre), H1 cavern under the blue half (H1' orange), A/B ring waypoints, S1-S3 points above the
// entrances; second level: D0 deep hall under H0, D1 deep cavern under the blue half, Q1 the foot of the shaft under H1
const N={H0:[0,-100,0],H1:[-250,-95,280],A:[150,-88,330],B:[300,-90,60],D0:[0,-200,0],D1:[-210,-190,170],Q1:[-250,-195,280],
 S1:[-95,top(-95,545,22),545],  // hillside ramp beside the blue base (~115 m from the pad), down to H1
 S2:[cxR(-200)+6,-22,-200],     // ramp out of the river canyon's east wall, down to the hall
 S3:[300,top(300,60,25),60]};   // vertical shaft in the open hills, down to the ring at B
for(const k of Object.keys(N))if(k!=='H0'&&k!=='D0')N[mn(k)]=mir(N[k]);
const CAV=[['H0',[85,27,95]],['H1',[70,26,80]],['D0',[70,24,70]],['D1',[55,22,60]]];
// spiral ramp (and its mirror): 1.25 turns of radius 48 round (-324.5, 100), from the ring tunnel B'-H1 at -92 down to -185 (14 deg)
const SPI=Array.from({length:61},(_,i)=>{const t=i/60*Math.PI*2.5;return[-324.5+48*Math.cos(t),-92.4-92.6*i/60,100+48*Math.sin(t)]});
// routes (polylines between nodes or points; corners become arcs of radius 2.5 r): [points, radius, options {n: name, self: own mirror,
// spiral: keep the points as they are, ent: entrance}]; each is mirrored unless self
const ROUTES=[[['H0','H1'],20],[['H1','A'],20],[['A',[250,-88,280],[200,-90,180],'B'],20,{n:'S-bend'}],[['B',"H1'"],20],  // level 1: hall to each half, ring with an S-bend
 [['H0',[-130,-92,0],[-130,-92,140],'H1'],18,{n:'corners'}],         // second way from the hall: two hard turns, crossing the first one (they split and rejoin)
 [[[-50,-89,305],[-20,-92,230],[-70,-94,160],[-112,-97,126]],16,{n:'branch'}],  // S-bend branch from the ring back to the hall tunnel (a loop)
 [['A','H0'],8.5,{n:'crawl'}],                                       // crawl-way: a tight straight shortcut from the ring to the hall
 [[[0,-110,0],'D0'],14,{self:1,n:'shaft-H0'}],                        // shaft from the hall floor down to the deep hall
 [[[-250,-100,280],'Q1'],14,{n:'shaft-H1'}],[['Q1','D1'],16],          // shaft from H1 down, then across to D1
 [['D0',[-90,-198,30],[-110,-195,110],'D1'],16,{n:'deep-S'}],         // level 2: S-bends from the deep hall to D1
 [['D1',[-60,-196,250],[120,-194,190],"D1'"],16,{n:'deep-ring'}],        // deep ring round the deep hall
 [['Q1','D0'],8,{n:'deep-crawl'}],                                        // deep crawl-way
 [SPI,15,{spiral:1,n:'spiral'}],[[SPI[60],'D1'],15,{n:'spiral-D1'}],                // the spiral ramp and the tunnel from its foot to D1
 [['S1','H1'],17,{ent:1}],[['S2','H0'],17,{ent:1}],[['S3','B'],16,{ent:1}]];
export const CAVE={nodes:N,pieces:[],entrances:[],graph:{p:[],adj:[]}};
const P3=q=>typeof q==='string'?N[q]:q,sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],len3=v=>Math.hypot(...v),nrm=v=>{const l=len3(v)||1;return v.map(x=>x/l)};
// a polyline with its corners rounded (quadratic arcs of radius about f) and resampled every <= 8 m
function dense(P,f,round){const R=[P[0]];for(let i=1;i<P.length-1;i++){const u=nrm(sub3(P[i],P[i-1])),v=nrm(sub3(P[i+1],P[i])),c=u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
  if(!round||c>.999){R.push(P[i]);continue}const ang=Math.acos(Math.max(-1,c)),t=Math.min(f*Math.tan(ang/2),.45*len3(sub3(P[i],P[i-1])),.45*len3(sub3(P[i+1],P[i]))),A=P[i].map((x,j)=>x-u[j]*t),B=P[i].map((x,j)=>x+v[j]*t),k=Math.max(3,Math.ceil(ang/.1));
  for(let s=0;s<=k;s++){const w=s/k;R.push([0,1,2].map(j=>(1-w)*(1-w)*A[j]+2*(1-w)*w*P[i][j]+w*w*B[j]))}}R.push(P[P.length-1]);
 const O=[R[0]];for(let i=1;i<R.length;i++){const a=R[i-1],b=R[i],L=len3(sub3(b,a)),n=Math.ceil(L/8);if(L<1e-6)continue;for(let s=1;s<=n;s++)O.push(a.map((x,j)=>x+(b[j]-x)*s/n))}return O}
{const P=CAVE.pieces,G=CAVE.graph,key=new Map(),node=p=>{const k=p.map(v=>v.toFixed(2)).join(',');let i=key.get(k);if(i==null){i=G.p.length;key.set(k,i);G.p.push({x:p[0],y:p[1],z:p[2]});G.adj.push([])}return i},
  link=(i,j)=>{if(i!==j&&!G.adj[i].includes(j)){G.adj[i].push(j);G.adj[j].push(i)}},box=(pts,r)=>[[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))-r),[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))+r)];
 for(const[n,r]of CAV)for(const m of n==='H0'||n==='D0'?[n]:[n,mn(n)]){const lo=N[m].map((v,i)=>v-r[i]),hi=N[m].map((v,i)=>v+r[i]);P.push({k:'e',c:N[m],r,n:m,lo,hi});node(N[m])}
 for(const[pts,r,o={}]of ROUTES)for(const mirror of o.self?[0]:[0,1]){const src=pts.map(q=>mirror?(typeof q==='string'?(N[mn(q)]?mn(q):q):mir(q)):q),C=src.map(P3),D=dense(C,2.5*r,!o.spiral&&!o.ent);
  const segs=[];for(let i=0;i<D.length-1;i++){const a=D[i],L=len3(sub3(D[i+1],a)),[lo,hi]=box([a,D[i+1]],r);segs.push({a,d:sub3(D[i+1],a).map(v=>v/L),L,lo,hi})}
  const[lo,hi]=box(D,r);P.push({k:'r',pts:D,segs,r,lo,hi,ent:!!o.ent,n:o.n?o.n+(mirror?"'":''):src.filter(q=>typeof q==='string').join('-')});
  let prev=null;for(let i=0;i<D.length;i++)if(i===0||i===D.length-1||i%3===0){const k=node(D[i]);if(prev!=null)link(prev,k);prev=k}}  // waypoints every ~24 m along the route
 // route ends join the nearest node of whatever they open into (a cavern, or the middle of another tunnel)
 for(const pc of P)if(pc.k==='r')for(const e of[pc.pts[0],pc.pts[pc.pts.length-1]]){const k=node(e);let best=-1,bd=60;G.p.forEach((q,i)=>{if(i===k||G.adj[k].includes(i))return;const d=Math.hypot(q.x-e[0],q.y-e[1],q.z-e[2]);if(d<bd&&inside(e,q)){bd=d;best=i}});if(best>=0)link(k,best)}
 // entrance mouths: where the entrance's axis goes into the ground
 for(const p of P)if(p.ent){const s=p.segs[0];let lo=0,hi=p.segs.reduce((m,q)=>m+q.L,0);const at=t=>{let u=t;for(const q of p.segs){if(u<=q.L)return q.a.map((v,j)=>v+q.d[j]*u);u-=q.L}return p.pts[p.pts.length-1]};
  for(let i=0;i<40;i++){const t=(lo+hi)/2,q=at(t);if(q[1]>dfH(q[0],q[2]))lo=t;else hi=t}CAVE.entrances.push({p:at(lo),d:s.d,r:p.r,top:p.pts[0],name:p.n.split('-')[0]})}}
// is the straight line between a route end and a graph point inside the caves (so they can be joined)?
function inside(a,q){for(let i=1;i<8;i++){const w=i/8;if(sdCave(a[0]+(q.x-a[0])*w,a[1]+(q.y-a[1])*w,a[2]+(q.z-a[2])*w)>-2)return false}return true}
// signed distance to one piece (negative inside its free space); ellipsoids use the k0(k0-1)/k1 bound (exact zero set)
export function sdPiece(o,x,y,z){if(o.k==='r'){let m=1e9;for(const s of o.segs){const dx=Math.max(s.lo[0]-x,x-s.hi[0],0),dy=Math.max(s.lo[1]-y,y-s.hi[1],0),dz=Math.max(s.lo[2]-z,z-s.hi[2],0);if(dx*dx+dy*dy+dz*dz>=(m+o.r)*(m+o.r))continue;
  const px=x-s.a[0],py=y-s.a[1],pz=z-s.a[2];let t=px*s.d[0]+py*s.d[1]+pz*s.d[2];t=t<0?0:t>s.L?s.L:t;const d=Math.hypot(px-s.d[0]*t,py-s.d[1]*t,pz-s.d[2]*t)-o.r;if(d<m)m=d}return m}  // a route: the union of its segments' capsules
 const qx=(x-o.c[0])/o.r[0],qy=(y-o.c[1])/o.r[1],qz=(z-o.c[2])/o.r[2],k0=Math.hypot(qx,qy,qz),k1=Math.hypot(qx/o.r[0],qy/o.r[1],qz/o.r[2]);return k1>1e-9?k0*(k0-1)/k1:-Math.min(...o.r)}
// the whole network, capped at 60 m (or less: clipping only needs the sign, and a small cap skips most primitives). Primitives (caverns
// and single route segments) are bucketed on a 3D grid (32 m cells, each listing those whose box comes within 60 m of it; a finer one,
// 8 m cells within 4 m, for small caps); outside the grid nothing is nearer than the cap. Boxes farther than the best so far are skipped.
var GRID=null,GRID4=null;  // var: sdCave first runs while the description above is being built
function primGrid(M){const prims=[];for(const o of CAVE.pieces)if(o.k==='r')for(const s of o.segs)prims.push({o,s,r:o.r,lo:s.lo,hi:s.hi});else prims.push({o,lo:o.lo,hi:o.hi});
 const C=M>8?32:8,o0=[0,1,2].map(j=>Math.min(...prims.map(p=>p.lo[j]))-M),n=[0,1,2].map(j=>Math.ceil((Math.max(...prims.map(p=>p.hi[j]))+M-o0[j])/C)),cells=Array.from({length:n[0]*n[1]*n[2]},()=>[]),
  c=(p,j,e)=>Math.min(n[j]-1,Math.max(0,Math.floor((e-o0[j])/C)));
 for(const p of prims)for(let i=c(p,0,p.lo[0]-M);i<=c(p,0,p.hi[0]+M);i++)for(let j=c(p,1,p.lo[1]-M);j<=c(p,1,p.hi[1]+M);j++)for(let k=c(p,2,p.lo[2]-M);k<=c(p,2,p.hi[2]+M);k++)cells[(i*n[1]+j)*n[2]+k].push(p);
 return{C,o0,n,cells}}
export function sdCave(x,y,z,skip,cap=60){const G=cap<=4?GRID4||(GRID4=primGrid(4)):GRID||(GRID=primGrid(60)),i=Math.floor((x-G.o0[0])/G.C),j=Math.floor((y-G.o0[1])/G.C),k=Math.floor((z-G.o0[2])/G.C);let m=cap;
 if(i<0||j<0||k<0||i>=G.n[0]||j>=G.n[1]||k>=G.n[2])return m;
 for(const p of G.cells[(i*G.n[1]+j)*G.n[2]+k]){if(p.o===skip)continue;const dx=Math.max(p.lo[0]-x,x-p.hi[0],0),dy=Math.max(p.lo[1]-y,y-p.hi[1],0),dz=Math.max(p.lo[2]-z,z-p.hi[2],0);
  if(dx*dx+dy*dy+dz*dz>(m>0?m*m:0))continue;let d;if(p.s){const s=p.s,px=x-s.a[0],py=y-s.a[1],pz=z-s.a[2];let t=px*s.d[0]+py*s.d[1]+pz*s.d[2];t=t<0?0:t>s.L?s.L:t;const qx=px-s.d[0]*t,qy=py-s.d[1]*t,qz=pz-s.d[2]*t;d=Math.sqrt(qx*qx+qy*qy+qz*qz)-p.r}else d=sdPiece(p.o,x,y,z);if(d<m)m=d}return m}
// seams overlap: every surface is kept 0.35 m past where it meets the next one (more than the worst chord error, ~0.27 m), so
// neighbouring pieces and the terrain overlap a little instead of meeting edge to edge with hairline cracks a round could slip through
export const SEAM=.35;
export const inCave=(x,y,z)=>y<dfHt(x,z)&&sdCave(x,y,z)<0;  // underground and inside a cave

// ---------- bots: a route through the network ----------
// from/to: {x,y,z}; see(a,b): line of sight. Dijkstra over the waypoint graph from the 8 nodes nearest the bot (dearer if it can't see
// them) to the 8 nearest the target; returns the farthest node along that route the bot can see (string pulling), or null.
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),nearest=(q,k)=>CAVE.graph.p.map((p,i)=>[dist(p,q),i]).sort((a,b)=>a[0]-b[0]).slice(0,k);
export function caveRoute(from,to,see){const G=CAVE.graph,n=G.p.length,cost=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),done=new Uint8Array(n),goal=new Map();
 for(const[d,i]of nearest(from,8))cost[i]=d*(see(from,G.p[i])?1:4);for(const[d,i]of nearest(to,8))goal.set(i,d*(see(G.p[i],to)?1:6));
 let best=-1,bc=Infinity;for(;;){let k=-1,c=Infinity;for(let i=0;i<n;i++)if(!done[i]&&cost[i]<c){c=cost[i];k=i}if(k<0||c>=bc)break;done[k]=1;
  if(goal.has(k)&&c+goal.get(k)<bc){bc=c+goal.get(k);best=k}for(const j of G.adj[k]){const c2=c+dist(G.p[k],G.p[j]);if(c2<cost[j]){cost[j]=c2;prev[j]=k}}}
 if(best<0)return null;const path=[];for(let k=best;k>=0;k=prev[k])path.unshift(k);for(let i=Math.min(path.length-1,8);i>0;i--)if(see(from,G.p[path[i]]))return G.p[path[i]];return G.p[path[0]]}

// ---------- meshes ----------
// clip an indexed mesh to g(p) > 0: triangles crossing g = 0 are cut along it (edge points found by bisection on the true g, shared per
// edge so the cut is watertight); attrs [{a:array,n:size}] are interpolated. Returns {p, idx, attrs}
export function clipIndexed(P,I,attrs,g){const G=[],gv=i=>G[i]??(G[i]=g(P[i*3],P[i*3+1],P[i*3+2])),cut=new Map(),O=[],np=()=>P.length/3;
 // first split (at their midpoints) edges longer than 1.5 m that cross g = 0 (ends or midpoint on different sides), a few times over, so the straight cuts
 // follow curved seams (where three tunnels meet, a cut across an 8 m triangle can miss the curve by more than the seam overlap).
 // Splits are decided per edge, so both triangles on an edge split it alike (no T-junctions).
 for(let pass=0;pass<4;pass++){const mid=new Map(),NI=[],force=new Set(),ek=(a,b)=>a<b?a*4194304+b:b*4194304+a;let any=false;
  for(let t=0;t<I.length;t+=3){const[a,b,c]=[I[t],I[t+1],I[t+2]],s0=gv(a)>0;if(s0===gv(b)>0&&s0===gv(c)>0&&(g((P[a*3]+P[b*3]+P[c*3])/3,(P[a*3+1]+P[b*3+1]+P[c*3+1])/3,(P[a*3+2]+P[b*3+2]+P[c*3+2])/3)>0)!==s0){force.add(ek(a,b));force.add(ek(b,c));force.add(ek(c,a))}}  // an island inside one triangle
  const midv=(a,b)=>{const k=a<b?a*4194304+b:b*4194304+a;let v=mid.get(k);if(v!==undefined)return v;const ex=P[a*3]-P[b*3],ey=P[a*3+1]-P[b*3+1],ez=P[a*3+2]-P[b*3+2],l=Math.sqrt(ex*ex+ey*ey+ez*ez),ga=gv(a),gb=gv(b);
   v=-1;if(l>.8&&(force.has(k)||(ga>0)!==(gb>0)||(g((P[a*3]+P[b*3])/2,(P[a*3+1]+P[b*3+1])/2,(P[a*3+2]+P[b*3+2])/2)>0)!==(ga>0))){v=np();for(let c=0;c<3;c++)P.push((P[a*3+c]+P[b*3+c])/2);for(const A of attrs)for(let c=0;c<A.n;c++)A.a.push((A.a[a*A.n+c]+A.a[b*A.n+c])/2);any=true}mid.set(k,v);return v};
  for(let t=0;t<I.length;t+=3){const v=[I[t],I[t+1],I[t+2]],e=[midv(v[0],v[1]),midv(v[1],v[2]),midv(v[2],v[0])],n=e.filter(x=>x>=0).length,V=r=>v[r%3],E=r=>e[r%3];
   if(n===0)NI.push(...v);else if(n===3)NI.push(v[0],e[0],e[2],e[0],v[1],e[1],e[2],e[1],v[2],e[0],e[1],e[2]);
   else if(n===1){const r=e.findIndex(x=>x>=0);NI.push(V(r),E(r),V(r+2),E(r),V(r+1),V(r+2))}
   else{const r=[0,1,2].find(r=>E(r+2)<0);NI.push(E(r),V(r+1),E(r+1),V(r),E(r),E(r+1),V(r),E(r+1),V(r+2))}}
  I=NI;if(!any)break}
 const cross=(i,j)=>{const k=i<j?i*4194304+j:j*4194304+i;let v=cut.get(k);if(v!=null)return v;const a=i<j?i:j,b=i<j?j:i;let lo=0,hi=1;const ga=gv(a)>0;
  for(let n=0;n<18;n++){const t=(lo+hi)/2;if((g(P[a*3]+(P[b*3]-P[a*3])*t,P[a*3+1]+(P[b*3+1]-P[a*3+1])*t,P[a*3+2]+(P[b*3+2]-P[a*3+2])*t)>0)===ga)lo=t;else hi=t}const t=(lo+hi)/2;
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
 const out=(M,O,g)=>{const R=clipIndexed(M.p,M.i,[{a:M.c,n:3}],g),re=new Map();for(const i of R.idx){let j=re.get(i);if(j==null){j=O.p.length/3;re.set(i,j);O.p.push(R.p[i*3],R.p[i*3+1],R.p[i*3+2]);O.c.push(R.attrs[0].a[i*3],R.attrs[0].a[i*3+1],R.attrs[0].a[i*3+2])}O.i.push(j)}};  // only the vertices still in use
 const rockSD=(x,y,z)=>dfHt(x,z)-y;
 for(const o of CAVE.pieces){const M={p:[],c:[],i:[]},T={p:[],c:[],i:[]},g=(x,y,z)=>Math.min(sdCave(x,y,z,o,1),rockSD(x,y,z))+SEAM;
  if(o.k==='e'){const[rx,ry,rz]=o.r,lat=Array.from({length:25},(_,i)=>i/24*Math.PI),lon=Array.from({length:72},(_,i)=>i/72*Math.PI*2);
   grid(M,lat,lon,(f,t)=>{const sf=f===0||f===Math.PI?0:Math.sin(f),p=[o.c[0]+rx*sf*Math.cos(t),o.c[1]+ry*Math.cos(f),o.c[2]+rz*sf*Math.sin(t)],q=[(p[0]-o.c[0])/rx/rx,(p[1]-o.c[1])/ry/ry,(p[2]-o.c[2])/rz/rz],l=Math.hypot(...q)||1;
    return[p,rockShade([-q[0]/l,-q[1]/l,-q[2]/l],.05,p[2],p)]},true);
   orient(M,m=>{const q=[(o.c[0]-m[0])/rx/rx,(o.c[1]-m[1])/ry/ry,(o.c[2]-m[2])/rz/rz];return q});
   // a glowing band round the cavern a third of the way up, and a ring of light on its floor
   for(const[fy,w]of[[.62,1.6],[.86,1]]){const b=T.p.length/3,n=96;for(let i=0;i<=n;i++){const t=i/n*Math.PI*2;for(const df of[-w/ry/2,w/ry/2]){const ff=Math.PI-Math.acos(fy)+df,s=.97;
     const p=[o.c[0]+rx*s*Math.sin(ff)*Math.cos(t),o.c[1]+ry*s*Math.cos(ff),o.c[2]+rz*s*Math.sin(ff)*Math.sin(t)];T.p.push(...p);T.c.push(...teamTint(p[2]).map(v=>v*1.6))}}
    for(let i=0;i<n;i++){const a=b+i*2;T.i.push(a,a+1,a+3,a,a+3,a+2)}}}
  else{const{pts,r}=o,n=pts.length,tan=i=>nrm(sub3(pts[Math.min(n-1,i+1)],pts[Math.max(0,i-1)])),frame=d=>{const ref=Math.abs(d[1])<.9?[0,1,0]:[1,0,0],e1=nrm([d[1]*ref[2]-d[2]*ref[1],d[2]*ref[0]-d[0]*ref[2],d[0]*ref[1]-d[1]*ref[0]]);
    return[e1,[e1[1]*d[2]-e1[2]*d[1],e1[2]*d[0]-e1[0]*d[2],e1[0]*d[1]-e1[1]*d[0]]]},rows=[];  // a swept tube: one ring per route point, framed by world up (so ceiling and floor stay put round bends)
   const d0=nrm(sub3(pts[1],pts[0])),d1=nrm(sub3(pts[n-1],pts[n-2]));
   for(let k=0;k<6;k++){const v=Math.PI/2*(1-k/6);rows.push({c:pts[0].map((q,j)=>q-d0[j]*r*Math.sin(v)),rad:k===0?0:r*Math.cos(v),f:frame(d0),sc:pts[0]})}
   for(let i=0;i<n;i++)rows.push({c:pts[i],rad:r,f:frame(tan(i))});
   for(let k=1;k<=6;k++){const v=Math.PI/2*k/6;rows.push({c:pts[n-1].map((q,j)=>q+d1[j]*r*Math.sin(v)),rad:k===6?0:r*Math.cos(v),f:frame(d1),sc:pts[n-1]})}
   const NS=r>12?36:28,th=Array.from({length:NS},(_,i)=>i/NS*Math.PI*2);
   grid(M,rows,th,(R,t)=>{const[e1,e2]=R.f,dir=[0,1,2].map(j=>Math.cos(t)*e1[j]+Math.sin(t)*e2[j]),p=R.c.map((q,j)=>q+dir[j]*R.rad);
    const nn=R.sc?[0,1,2].map(j=>(R.sc[j]-p[j])/r):dir.map(v=>-v),gl=.32*(Math.max(0,Math.cos(t-Math.PI/2))**14+Math.max(0,Math.cos(t+Math.PI/2))**14);return[p,rockShade(nn,gl,p[2],p)]},true);
   orient(M,m=>{let bx=0,by=0,bz=0,bd=1e18;for(const sg of o.segs){const px=m[0]-sg.a[0],py=m[1]-sg.a[1],pz=m[2]-sg.a[2];let t=px*sg.d[0]+py*sg.d[1]+pz*sg.d[2];t=t<0?0:t>sg.L?sg.L:t;
    const qx=sg.a[0]+sg.d[0]*t,qy=sg.a[1]+sg.d[1]*t,qz=sg.a[2]+sg.d[2]*t,dd=(qx-m[0])**2+(qy-m[1])**2+(qz-m[2])**2;if(dd<bd){bd=dd;bx=qx;by=qy;bz=qz}}return[bx-m[0],by-m[1],bz-m[2]]});
   // guide strips along the ceiling and the floor (1.4 m wide, 15 cm off the wall)
   for(const t0 of[Math.PI/2,-Math.PI/2]){const b0=T.p.length/3,dt=.7/r;for(let i=0;i<n;i++){const[e1,e2]=frame(tan(i));for(const t of[t0-dt,t0+dt]){const p=[0,1,2].map(j=>pts[i][j]+(Math.cos(t)*e1[j]+Math.sin(t)*e2[j])*(r-.15));T.p.push(...p);T.c.push(...teamTint(p[2]).map(v=>v*1.8))}}
    for(let i=0;i<n-1;i++){const q=b0+i*2;T.i.push(q,q+1,q+3,q,q+3,q+2)}}}
  out(M,W,g);out(T,S,g)}
 return{walls:W,strips:S}}
// check helper: every route's points, about 8 m apart (scripted flights)
export function caveAxes(){return CAVE.pieces.filter(o=>o.k==='r').map(o=>({name:o.n,r:o.r,pts:o.pts,ent:o.ent}))}
export {DBASE};
