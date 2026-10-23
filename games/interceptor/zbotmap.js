// Zombies bot map sense: what the bot knows of the ground it flies over, for the Bot Spectator (zbotfly.js) and its coverage metric (zbotstat.js).
// Pure logic, no DOM, no three.js objects of its own: it reads the terrain through api.gh / api.rivZ and the sites, forward positions and radar pad
// from the page's api, and finds the houses in the scene so villages count as places to fly over.
//   cells      the coverage grid: 300 m cells over the operational area (the north approach, both flanks and the defended area); mark() flags the
//              cell a drone is over, count() / pct() say how much of the area it has flown over
//   features   the places worth flying to: ridges and hollows (found in the height map), the river valley, villages, the sites, the forward
//              positions and the radar pad; a feature is visited when the drone passes within its radius, low enough to have seen it
//   station    where to wait for the next raid: the spot scored by how well it covers the bearings the raids come in on, how far out it is, how little
//              it has been visited and how far the bot has to fly (stations(), pick())
// All numbers are game-tuned for how the bot flies, not measurements of anything.
const SC={x:0,z:1950};  /* the centre of the defended area, where the raids' bearings are measured from */
export const CELL=300,HALF=4500,NC=2*HALF/CELL;
export const OPS={x0:-4200,x1:4200,z0:-4200,z1:2600};
const cl=(v,a,b)=>v<a?a:v>b?b:v,sm=(a,b,x)=>{const t=cl((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const DIRS=['north','north-east','east','south-east','south','south-west','west','north-west'];
/* compass name of a place as seen from the defended area */
export const dirName=(x,z)=>{const a=Math.atan2(x-SC.x,SC.z-z),i=((Math.round(a/(Math.PI/4))%8)+8)%8;return DIRS[i]};
const kmTxt=d=>d<1000?Math.round(d/10)*10+' m':(d/1000).toFixed(1)+' km';
export function createMap(E){
 const {api}=E,{gh,SITES,FOBS,PADP}=api,rivZ=api.rivZ||(()=>-300);
 const bits=new Uint8Array(NC*NC),ops=[];  /* cells flown over; the cells of the operational area (centre inside OPS) */
 const idx=(x,z)=>{const i=Math.floor((x+HALF)/CELL),j=Math.floor((z+HALF)/CELL);return i<0||j<0||i>=NC||j>=NC?-1:j*NC+i};
 const inOps=(x,z)=>x>=OPS.x0&&x<=OPS.x1&&z>=OPS.z0&&z<=OPS.z1;
 for(let j=0;j<NC;j++)for(let i=0;i<NC;i++){const x=-HALF+(i+.5)*CELL,z=-HALF+(j+.5)*CELL;if(inOps(x,z))ops.push(j*NC+i)}
 let nOps=0,nAll=0;
 const M={bits,total:ops.length,
  /* the drone is over (x, z): flags the cell (and the neighbour cells a 300 m sight reaches when high up) */
  mark(x,z,agl=0){const k=idx(x,z);if(k<0)return false;let n=0;if(!bits[k]){bits[k]=1;n++;if(inOps(x,z))nOps++;nAll++}
   if(agl>150){for(const[dx,dz]of[[CELL,0],[-CELL,0],[0,CELL],[0,-CELL]]){const q=idx(x+dx,z+dz);if(q>=0&&!bits[q]){bits[q]=1;nAll++;if(inOps(x+dx,z+dz))nOps++;n++}}}return n>0},
  seen:(x,z)=>{const k=idx(x,z);return k>=0&&bits[k]===1},
  count:()=>nOps,all:()=>nAll,pct:()=>nOps/Math.max(1,ops.length),
  reset(){bits.fill(0);nOps=nAll=0;for(const f of M.features){f.v=0;f.last=-1e9}},
  /* share of the operational cells inside a box that have been flown over (tests) */
  frac(x0,x1,z0,z1){let a=0,b=0;for(const k of ops){const x=-HALF+((k%NC)+.5)*CELL,z=-HALF+(Math.floor(k/NC)+.5)*CELL;if(x<x0||x>x1||z<z0||z>z1)continue;a++;if(bits[k])b++}return a?b/a:0},
  features:[],SC,dirName};

 // ---------- features: the places to fly to ----------
 const F=M.features,add=(k,n,x,z,r,agl,o={})=>{const f={id:F.length,k,n,x,z,r,agl,v:0,y:gh(x,z),...o};F.push(f);return f};
 for(const s of SITES)add('site','the '+s.n.toLowerCase(),s.x,s.z,260,120);
 for(const f of FOBS)add('fob',f.n.toLowerCase(),f.x,f.z,240,70);
 add('radar','the radar pad',PADP.x,PADP.z,240,110);
 for(let x=-3600;x<=3600;x+=1200)add('river',`the river valley ${dirName(x,rivZ(x))==='north'||dirName(x,rivZ(x))==='south'?'at the centre':x<0?'in the west':'in the east'}`,x,rivZ(x),300,40);
 // ridges (local highs of the height map) and hollows (local lows off the river) found on a 150 m grid
 {const S=150,x0=OPS.x0,z0=OPS.z0,nx=Math.floor((OPS.x1-x0)/S)+1,nz=Math.floor((OPS.z1-z0)/S)+1,H=new Float32Array(nx*nz);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)H[j*nx+i]=gh(x0+i*S,z0+j*S);
  const hs=(i,j)=>H[cl(j,0,nz-1)*nx+cl(i,0,nx-1)],near=(x,z,m)=>[...SITES,...FOBS,PADP].some(s=>Math.hypot(x-s.x,z-s.z)<(s.r||80)+m);
  const hi=[],lo=[];
  for(let j=3;j<nz-3;j++)for(let i=3;i<nx-3;i++){const h=H[j*nx+i],x=x0+i*S,z=z0+j*S;if(near(x,z,500)||Math.abs(z-rivZ(x))<330||Math.abs(x)>4000||z<-4000||z>2400)continue;
   let mx=-1e9,mn=1e9,ring=0,rn=0;for(let dj=-3;dj<=3;dj++)for(let di=-3;di<=3;di++){if(!di&&!dj)continue;const q=hs(i+di,j+dj);mx=Math.max(mx,q);mn=Math.min(mn,q)}
   for(let a=0;a<12;a++){ring+=hs(Math.round(i+8*Math.cos(a*.5236)),Math.round(j+8*Math.sin(a*.5236)));rn++}ring/=rn;
   if(h>=mx&&h-ring>=22)hi.push({x,z,h,pr:h-ring});else if(h<=mn&&ring-h>=22)lo.push({x,z,h,pr:ring-h})}
  const take=(L,k,max,sep,lab,agl)=>{L.sort((a,b)=>b.pr-a.pr);const got=[];for(const c of L){if(got.length>=max)break;if(got.some(g=>Math.hypot(g.x-c.x,g.z-c.z)<sep))continue;got.push(c);
    add(k,`the ${dirName(c.x,c.z)} ${lab}`,c.x,c.z,300,agl,{h:c.h,pr:c.pr})}};
  take(hi,'ridge',8,1300,'ridge',70);take(lo,'hollow',4,1500,'hollow',45)}
 // villages: the houses are instanced meshes in the scene (a wall box 8 x 3.2 x 11 each); clustered on a 500 m grid
 try{const g=new Map();api.scene.traverse(o=>{if(!o.isInstancedMesh||o.count<60)return;const m=o.instanceMatrix.array;
   const sx=Math.hypot(m[0],m[1],m[2]),sy=Math.hypot(m[4],m[5],m[6]),sz=Math.hypot(m[8],m[9],m[10]);if(Math.abs(sx-8)>.05||Math.abs(sy-3.2)>.05||Math.abs(sz-11)>.05)return;
   for(let i=0;i<o.count;i++){const x=m[i*16+12],z=m[i*16+14],k=Math.round(x/500)+','+Math.round(z/500);let c=g.get(k);if(!c)g.set(k,c={x:0,z:0,n:0});c.x+=x;c.z+=z;c.n++}});
  const V=[...g.values()].filter(c=>c.n>=12).map(c=>({x:c.x/c.n,z:c.z/c.n,n:c.n})).sort((a,b)=>b.n-a.n),got=[];
  for(const c of V){if(!inOps(c.x,c.z)||got.some(q=>Math.hypot(q.x-c.x,q.z-c.z)<900))continue;got.push(c);add('village',`the ${dirName(c.x,c.z)} village`,c.x,c.z,330,80,{houses:c.n})}}catch(e){}
 M.byKind=k=>F.filter(f=>f.k===k);
 /* the drone is at p: the features it is over (within the radius, low enough to have looked at them) are visited */
 M.visit=(x,z,y,now=0)=>{const out=[];for(const f of F){if(Math.hypot(x-f.x,z-f.z)>f.r)continue;if(y-f.y>f.agl+260)continue;if(!f.v)out.push(f);f.v++;f.last=now}return out};
 M.featStat=()=>{const o={};for(const f of F){const q=o[f.k]||(o[f.k]={n:0,v:0});q.n++;if(f.v)q.v++}let n=0,v=0;for(const q of Object.values(o)){n+=q.n;v+=q.v}return{by:o,n,v}};

 // ---------- stations ----------
 // axes: the bearings the raids come in on [{b (rad, 0 = north, + east), w (threat points), n}], built by the pilot from the wave queue and the live tracks.
 // A station covers an axis when it is near the ray from the defended area out along the bearing, 1.2-3.8 km from it.
 const ray=(b,r)=>({x:SC.x+Math.sin(b)*r,z:SC.z-Math.cos(b)*r});
 const cover=(s,axes)=>{let t=0,w=0;for(const a of axes){const u=Math.sin(a.b),v=-Math.cos(a.b),px=s.x-SC.x,pz=s.z-SC.z,al=px*u+pz*v,cr=Math.abs(px*v-pz*u);
   t+=a.w*Math.exp(-((cr/900)**2))*sm(900,2300,al)*(1-sm(3500,4300,al));w+=a.w}return w?t/w:0};
 /* ground not yet flown over: the operational area in 900 m blocks (3 x 3 cells), each with the share of its cells still unseen; the ones more than
    a third unseen are candidate stations (a bot sweeping one passes over most of its cells) */
 const BL=3,NB=NC/BL;
 M.blocks=(AW=4300)=>{const out=[];for(let bj=0;bj<NB;bj++)for(let bi=0;bi<NB;bi++){const x=-HALF+(bi+.5)*BL*CELL,z=-HALF+(bj+.5)*BL*CELL;if(!inOps(x,z)||Math.abs(x)>AW-700||z<-AW+700||z>AW-700)continue;
   let n=0,u=0;for(let j=0;j<BL;j++)for(let i=0;i<BL;i++){n++;if(!bits[(bj*BL+j)*NC+bi*BL+i])u++}if(u/n>.34)out.push({x,z,share:u/n,bi,bj})}return out};
 /* candidate stations: every feature, an intercept line on each axis, and the blocks of ground it has not seen */
 M.stations=(axes,AW=4300)=>{const L=F.filter(f=>Math.abs(f.x)<AW-500&&f.z>-AW+500&&f.z<AW-500).map(f=>({...f,src:f}));
  for(const b of M.blocks(AW))L.push({id:'ground'+b.bi+'/'+b.bj,k:'ground',n:`the unexplored ${dirName(b.x,b.z)} ground`,x:b.x,z:b.z,r:420,agl:90,y:gh(b.x,b.z),src:null,share:b.share});
  for(const a of axes)for(const r of[2400,3100,3700]){const p=ray(a.b,Math.min(r,AW-650));L.push({id:'line'+Math.round(a.b*10)+'/'+r,k:'line',n:`the ${dirName(p.x,p.z)} intercept line`,x:p.x,z:p.z,r:300,agl:90,y:gh(p.x,p.z),src:null,line:true})}
  return L};
 /* the best station now: {from: {x, z}, cur: the station held (or null), axes, visits: Map(id -> flown-over count), heldFor: s, noise} */
 M.pick=(o)=>{const L=M.stations(o.axes,o.AW),has=o.axes.length>0;let best=null,bs=-1e9;
  for(const s of L){const d=Math.hypot(s.x-o.from.x,s.z-o.from.z),cv=cover(s,o.axes),f=s.src,nov=s.k==='ground'?.35+.9*s.share:!f?.4:!f.v?1:.1+.4*sm(40,300,(o.now||0)-f.last);
   let sc=(has?3.2:.8)*cv+(has?.9:1.9)*nov+(s.k==='ridge'?.2:s.k==='river'||s.k==='hollow'?.15:s.k==='village'?.25:s.k==='line'?.1:0)-d/5200;
   if(o.cur&&s.id===o.cur.id)sc+=(has?.25:-.4);  /* keep what it holds a while when the raids are coming; move on when nothing is */
   if(!has&&d<500)sc-=.8;sc+=(o.noise||0)*Math.random();
   if(sc>bs){bs=sc;best=s}}
  return best?{...best,score:bs,cover:cover(best,o.axes)}:null};
 /* why it holds a station: "Holding the north-east ridge: 6 inbound" */
 M.why=(s,n,axes)=>{const w={ridge:'Holding',line:'Holding',river:'Following',hollow:'Sheltering in',village:'Circling',site:'Covering',fob:'Staging at',radar:'Over',ground:'Sweeping'}[s.k]||'At';
  const dirs=[...new Set(axes.map(a=>dirName(SC.x+Math.sin(a.b)*3000,SC.z-Math.cos(a.b)*3000)))].slice(0,2);
  return `${w} ${s.n}${n>0?`: ${n} inbound${dirs.length?' from the '+dirs.join(' and '):''}`:s.k==='line'?'':': looking over new ground'}`};
 M.kmTxt=kmTxt;
 return M}
