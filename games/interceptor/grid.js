// Uniform grid over the threat tracks (interceptor.js TH) for neighbour queries: helper target choice, the nearest-threat sound, lock-on,
// swarm targeting and screening, fuses, splash and near-miss checks. Square cells of CELL m in x / z (columns: altitude doesn't matter)
// over +-HALF m; tracks farther out sit in the edge cells. A query gives exactly what a loop over TH with the same test would, in TH order.
//
//   grid.near(p, r, fn)   calls fn(t) for every track whose horizontal distance from p ({x, z}) is within r, in TH order (dead ones too:
//                         keep your own tests, e.g. live(t) and an exact 3D range, on top; a 3D range is inside the horizontal one).
//                         fn returning true stops the query. Big radii just scan TH.
//   grid.nearest(p, ok)   the track nearest to p (3D) among those with ok(t) true; on a tie the first in TH, like a plain loop; null if none
//   grid.touch()          something moved tracks while the grid was open (a co-op snapshot snapping one): rebuild before the next query
//   grid.moved()          the farthest any track has moved from t.pp (its position before this tick's move, zombies tracks) at the last
//                         rebuild: for swept checks over a tick; Infinity while the grid is closed
//
// When the cells are used: only inside "open" windows in which tracks don't move. interceptor.js opens one from the start of a sim tick up
// to the threat movers, another after them to the end of the tick, and one while a frame is drawn (open() / close()). The cells are rebuilt
// (O(tracks)) at the first query of a window, and again if TH grew or shrank. Outside the windows (tests, key handlers, network code between
// ticks) every query is a plain scan of TH, so a query is never stale.
// grid.brute = true turns every query into the plain loop it replaces (fn for every track; the callers' own tests do the rest): the test in
// tools/zombies-test.mjs (section grid) checks random scenes against it and plays a whole wave both ways.
export function makeGrid(list,{cell=250,half=12000}={}){
 const N=Math.ceil(2*half/cell),NC=N*N,head=new Int32Array(NC).fill(-1);
 let cap=0,nxt=null,xs=null,zs=null,n=0,last=null,built=false,open=false,depth=0,mv=0;const SCR=[];  /* SCR: one scratch list per nesting level (a query inside a query's fn) */
 const cx=v=>{const i=Math.floor((v+half)/cell);return i<0?0:i>=N?N-1:i};
 function grow(m){cap=Math.max(256,m*2);nxt=new Int32Array(cap);xs=new Float64Array(cap);zs=new Float64Array(cap);SCR.length=0}
 function build(){n=list.length;if(n>cap)grow(n);head.fill(-1);mv=0;
  for(let i=n-1;i>=0;i--){const t=list[i],p=t.p;xs[i]=p.x;zs[i]=p.z;const c=cx(p.x)+cx(p.z)*N;nxt[i]=head[c];head[c]=i;if(t.pp){const m=p.distanceTo(t.pp);if(m>mv)mv=m}}  /* backwards, so each cell lists its tracks in TH order */
  last=n?list[n-1]:null;built=true}
 const fresh=()=>{if(!built||list.length!==n||(n&&list[n-1]!==last))build()};
 const R2=r=>{const q=r+Math.abs(r)*1e-9+1e-6;return q*q};
 function scan(p,r,fn){const r2=R2(r),L=list.length,px=p.x,pz=p.z;for(let i=0;i<L;i++){const t=list[i];if(!t)continue;const dx=t.p.x-px,dz=t.p.z-pz;if(dx*dx+dz*dz<=r2&&fn(t)===true)return}}
 const G={brute:false,
  open(){open=true;built=false},close(){open=false;built=false},touch(){built=false},
  get isOpen(){return open},
  moved(){if(!open||G.brute)return Infinity;fresh();return mv},
  near(p,r,fn){if(G.brute){for(let i=0;i<list.length;i++)if(list[i]&&fn(list[i])===true)return;return}if(!open||!(r<half))return scan(p,r,fn);fresh();
   const x0=cx(p.x-r),x1=cx(p.x+r),z0=cx(p.z-r),z1=cx(p.z+r);if((x1-x0+1)*(z1-z0+1)>2*n+8)return scan(p,r,fn);
   const r2=R2(r),lv=depth;let k=0,runs=0,scr=SCR[lv];if(!scr||scr.length<cap)scr=SCR[lv]=new Int32Array(cap);
   for(let iz=z0;iz<=z1;iz++)for(let ix=x0;ix<=x1;ix++){let i=head[ix+iz*N];if(i<0)continue;runs++;
    for(;i>=0;i=nxt[i]){const dx=xs[i]-p.x,dz=zs[i]-p.z;if(dx*dx+dz*dz<=r2)scr[k++]=i}}
   if(runs>1&&k>1)scr.subarray(0,k).sort();
   depth++;try{for(let j=0;j<k;j++)if(fn(list[scr[j]])===true)return}finally{depth--}},
  nearest(p,ok){let best=null,bd=Infinity,bi=-1;
   if(!open||G.brute||!(Math.abs(p.x)<half&&Math.abs(p.z)<half)){for(let i=0;i<list.length;i++){const t=list[i];if(!t||!ok(t))continue;const d=t.p.distanceToSquared(p);if(d<bd){bd=d;best=t}}return best}
   fresh();const qx=cx(p.x),qz=cx(p.z);
   const cellv=c=>{for(let i=head[c];i>=0;i=nxt[i]){const t=list[i];if(!ok(t))continue;const d=t.p.distanceToSquared(p);if(d<bd||d===bd&&i<bi){bd=d;bi=i;best=t}}};
   for(let k=0;k<N;k++){if(best&&(k-1)*cell>Math.sqrt(bd))break;if(qx-k<0&&qx+k>=N&&qz-k<0&&qz+k>=N)break;
    if(!k){cellv(qx+qz*N);continue}
    for(const iz of[qz-k,qz+k]){if(iz<0||iz>=N)continue;for(let ix=Math.max(0,qx-k);ix<=Math.min(N-1,qx+k);ix++)cellv(ix+iz*N)}
    for(const ix of[qx-k,qx+k]){if(ix<0||ix>=N)continue;for(let iz=Math.max(0,qz-k+1);iz<=Math.min(N-1,qz+k-1);iz++)cellv(ix+iz*N)}}
   return best}};
 return G}
