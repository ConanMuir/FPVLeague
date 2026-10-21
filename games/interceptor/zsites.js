// Zombies sorties: the enemy's side of the map (zsortie.js runs the sortie itself). One supply road per sector from the map edge to a
// staging point near the front, a launch site per sector, drone factories deeper in, supply convoys on the roads every break, and their
// defenders: ZU-23 AA guns (on the ground and on trucks) and interceptor patrol drones that chase you and blow up close. Everything is
// code-built: one vertex-coloured mesh per structure, shared geometry, a burnt material for wrecks. Bombs fall with your drone's speed;
// blasts damage whatever parts they reach. All numbers are game-balance values chosen for an arcade feel, not real-world figures.
// Authority: solo, or the co-op host, simulates convoys, guns, patrols and damage. A co-op client draws the host's world (ser / des) and
// only flies its own bombs, whose impacts go to the host.
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {seeded} from '../../engine/util.js';
import {ORDER,sectorOf} from './zdata.js';
import {warmers} from '../../engine/idle.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a);

// clock = sortie length (s); from = first break with sorties (after wave 1); hull = what your drone takes on a sortie; bombs per drone, blast
// radius (+ per Bigger warhead level); a last F is the warhead itself (kami: radius, damage). sight = fog reveal around your drone [base, per m
// above ground, max]; radarR = ground surveillance around the radar pad. homeR = how close to a forward position, outpost, the radar or a site
// counts as back inside the line; minDepth = how far past it enemy sites start. aa: reach (+ per wave), lock time, time between bursts, kill
// share of a burst, damage, tracer speed. pat: speed, turn rate, detection, chase fuel, blast radius, damage, orbit. strike: order price.
export const SO={clock:120,from:1,hull:100,bombs:3,bombR:9,bombRk:1.5,kamiR:14,kamiDmg:3,sight:[450,1.2,1400],radarR:2600,homeR:1300,minDepth:1700,
 aa:{rng:850,rngW:6,lock:1.1,cd:1.9,p:.5,dmg:34,tracer:900},pat:{spd:82,turn:1.6,det:1100,fuel:22,blast:10,dmg:55,orbit:260,alt:140},
 truck:{spd:13,gap:26},strike:{base:300,perW:35,drones:3},cap:.45};
// targets: salvage per part (x (1 + wave/20) x depth tier [1, 1.25, 1.5]), a bonus when the whole target goes; the effect is in zsortie.js
export const TGT={
 convoy:{n:'Supply convoy',g:'⛟',salv:{truck:70,aat:90}},
 launch:{n:'Launch site',g:'⇡',salv:{tel:100},bonus:350,rebuild:2},
 factory:{n:'Drone factory',g:'⌂',salv:{hall:0},bonus:1100,hp:6,rebuild:3},
 aa:{n:'AA gun',salv:60},pat:{salv:50}};
export const TIERK=[1,1.25,1.5],TIER=['near','mid','deep'];
// what a factory can build (weights) and what a convoy can carry per truck
export const FKIND={shahed:5,jet:3,decoy:2,heavy:2,swarm:2},PER_TRUCK={shahed:2,jet:1,decoy:3,heavy:1,swarm:6,cruise:1};

export function initSites(api,G,Z,fog){
 const {THREE,scene,gh,FOBS,PADP,SITES}=api,V3=THREE.Vector3,SITE_C={x:0,z:1950};
 const root=new THREE.Group();root.visible=false;scene.add(root);
 const _a=new V3(),_b=new V3(),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_s=new V3(),_p=new V3(),_c=new THREE.Color();

 // ---------- geography: home (back inside the line), depth, sectors, candidate spots ----------
 const HOME=[...FOBS,...Z.def.SLOTS.filter(s=>s.out),PADP,...SITES.slice(0,3)].map(h=>({x:h.x,z:h.z}));
 const dHome=(x,z)=>{let d=1e9;for(const h of HOME)d=Math.min(d,Math.hypot(x-h.x,z-h.z));return d};
 const depth=(x,z)=>{let d=1e9;for(const f of FOBS)d=Math.min(d,Math.hypot(x-f.x,z-f.z));return d};
 const brg=(x,z)=>Math.atan2(x-SITE_C.x,SITE_C.z-z),tierOf=d=>d<2600?0:d<3450?1:2,LIM=3850;
 const enemy=(x,z)=>Math.abs(x)<=LIM&&Math.abs(z)<=LIM&&Math.abs(brg(x,z))<1.4&&dHome(x,z)>SO.minDepth;
 let CAND=null;
 const cands=()=>CAND||(CAND=(()=>{const a=[];for(let x=-LIM;x<=LIM;x+=150)for(let z=-LIM;z<=1500;z+=150){if(!enemy(x,z)||Math.abs(z-api.rivZ(x))<260)continue;
  const h=[gh(x,z),gh(x+28,z),gh(x-28,z),gh(x,z+28),gh(x,z-28)];if(Math.max(...h)-Math.min(...h)>9)continue;a.push({x,z,d:depth(x,z),s:sectorOf(brg(x,z))})}return a})());

 // ---------- code-built geometry: parts merged into one vertex-coloured mesh ----------
 const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d),CY=(a,b,h,n=10,o=false,t0=0,tl=Math.PI*2)=>new THREE.CylinderGeometry(a,b,h,n,1,o,t0,tl);
 function geo(list){const gs=list.map(([g0,col,x=0,y=0,z=0,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1])=>{const g=g0.index?g0.toNonIndexed():g0.clone();for(const k of Object.keys(g.attributes))if(k!=='position'&&k!=='normal')g.deleteAttribute(k);
   g.applyMatrix4(_m.compose(_p.set(x,y,z),_q.setFromEuler(_e.set(rx,ry,rz)),_s.set(sx,sy,sz)));_c.setHex(col);const n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=_c.r;a[i*3+1]=_c.g;a[i*3+2]=_c.b}
   g.setAttribute('color',new THREE.BufferAttribute(a,3));return g});const m=mergeGeometries(gs);m.computeBoundingSphere();return m}
 const C={ol:0x4b5232,ol2:0x3b4127,can:0x857a55,dk:0x1c1e20,cn:0x8d8b85,cn2:0x6c6a64,rust:0x6e4d36,wh:0xd6d6cf,red:0xa3392a,sand:0x8e7b56,gl:0x22303e,net:0x37432d,yel:0xb08f2c};
 const wheels=(x,zs,r=.55)=>zs.flatMap(z=>[[CY(r,r,.42),C.dk,x,r,z,0,0,Math.PI/2],[CY(r,r,.42),C.dk,-x,r,z,0,0,Math.PI/2]]);
 const cab=(w,y,z,c)=>[[B(w,2,1.9),c,0,y,z],[B(w-.3,.7,.06),C.gl,0,y+.4,z+.96]];
 const MIS=.35,mb=[0,2.6,-3.4],md=[0,Math.cos(MIS),Math.sin(MIS)],mAt=k=>[mb[0],mb[1]+md[1]*k,mb[2]+md[2]*k];
 const telBase=[[B(2.7,.6,11),C.dk,0,1,0],...cab(2.7,2.2,4.3,C.ol),[B(2.6,1.5,5.4),C.ol,0,1.95,-.4],[B(.5,.35,8.5),C.ol2,.95,2.75,-.2],[B(.5,.35,8.5),C.ol2,-.95,2.75,-.2],...wheels(1.25,[3.6,1.8,-1.6,-3.6])];
 const GEO={
  truck:geo([[B(2.3,.5,7.6),C.dk,0,.95,0],...cab(2.3,2.05,2.75,C.ol),[B(2.4,2.3,4.8),C.can,0,2.35,-1],[B(2.5,.12,4.9),C.ol2,0,3.5,-1],...wheels(1.15,[2.6,-1.2,-2.6])]),
  aat:geo([[B(2.3,.5,7.6),C.dk,0,.95,0],...cab(2.3,2.05,2.75,C.ol2),[B(2.4,.35,4.8),C.ol2,0,1.4,-1],[B(2.4,.6,.2),C.sand,0,1.85,1.3],[B(.2,.6,4.6),C.sand,1.1,1.85,-1],[B(.2,.6,4.6),C.sand,-1.1,1.85,-1],...wheels(1.15,[2.6,-1.2,-2.6])]),
  tel:geo([...telBase,[CY(.48,.48,9.5,12),C.wh,...mAt(4.75),MIS],[CY(0,.48,1.7,12),C.red,...mAt(10.35),MIS],[B(1.9,.05,.9),C.dk,...mAt(.6),MIS],[B(.05,1.9,.9),C.dk,...mAt(.6),MIS],[B(.5,4,.5),C.ol2,0,4.4,-2.6,MIS]]),
  telW:geo([...telBase,[B(.6,.4,6),C.dk,0,3.1,-1.5,.12],[CY(.48,.3,3,8),C.dk,1.6,.5,-6,1.2,.6]]),
  hall:geo([[B(46,11,26),C.cn,0,5.5,0],[CY(13,13,46,18,true,0,Math.PI),0x535c64,0,11,0,0,0,Math.PI/2,.45,1,1],[B(46,.3,26.4),C.cn2,0,11,0],[B(12,7,16),C.cn2,29,3.5,-3],
   [B(8,7,.3),C.dk,-12,3.5,13.1],[B(8,7,.3),C.dk,0,3.5,13.1],[B(8,7,.3),C.dk,12,3.5,13.1],[CY(1.3,1.6,24),C.rust,16,12,-9],[CY(1.3,1.6,22),C.rust,21,11,-9],
   [B(64,4,2),C.cn2,0,2,-22],[B(2,4,42),C.cn2,-33,2,0],[B(62,.3,20),C.cn2,0,.15,24],[B(2,.3,1),C.yel,-6,.32,18],[B(2,.3,1),C.yel,6,.32,18],
   ...[-20,-12,-4,4,12,20].map(x=>[new THREE.ConeGeometry(1.5,3.4,3),C.ol,x,.5,29,Math.PI/2,0,0,1,1,.22])]),
  rubble:geo([[B(64,4,2),C.cn2,0,2,-22],[B(2,4,42),C.cn2,-33,2,0],[B(62,.3,20),C.cn2,0,.15,24],[B(14,3,10),C.cn2,-12,1.2,2,.2,.3,.1],[B(12,4,9),C.dk,8,1.6,-4,-.15,.6,.08],
   [B(18,2,8),C.cn,0,.9,8,.05,-.2,.12],[B(10,5,7),C.cn2,24,2,-4,.3,.1,-.2],[CY(1.3,1.6,7),C.rust,16,3.5,-9],[B(46,.6,26),C.dk,0,.3,0],[CY(13,13,14,10,true,0,Math.PI),0x3c4248,-14,2,4,.3,.2,Math.PI/2+.4,.45,1,1]]),
  aaBase:geo([[new THREE.TorusGeometry(3.2,.55,6,18),C.sand,0,.3,0,Math.PI/2],[B(1.6,.5,2.8),C.ol2,0,.65,0],[B(3.6,.18,.22),C.dk,0,.35,0],[B(.22,.18,3.6),C.dk,0,.35,0]]),
  turret:geo([[B(1.1,.7,1.3),C.ol2,0,0,0],[B(.5,.4,.5),C.dk,0,.5,-.8],[CY(.06,.06,2.8,6),C.dk,.2,.15,1.5,Math.PI/2],[CY(.06,.06,2.8,6),C.dk,-.2,.15,1.5,Math.PI/2],[B(.06,.7,1),C.ol2,.65,.1,.1],[B(.06,.7,1),C.ol2,-.65,.1,.1]]),
  crate:geo([[B(1.2,1,2),C.ol2,0,.5,0],[B(1.2,1,2),C.ol2,1.5,.5,.3],[B(1.2,1,2),C.ol2,.7,1.5,.1]]),
  net:geo([[B(1,.06,1),C.net,0,0,0]]),pad:geo([[B(1,1,1),C.cn2,0,0,0]]),
  pat:geo([[B(1.9,.1,.13),C.dk,0,0,0,0,Math.PI/4],[B(1.9,.1,.13),C.dk,0,0,0,0,-Math.PI/4],[B(.42,.26,.75),0x2a2d30,0,.05,0],[B(.16,.1,.16),0xff3a2a,0,.2,.25]]),
  bomb:geo([[CY(.12,.12,.7,8),C.dk,0,0,0,Math.PI/2],[B(.32,.02,.14),C.ol2,0,0,-.3],[B(.02,.32,.14),C.ol2,0,0,-.3]])};
 const MAT=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.1}),BURN=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,color:0x3a3430});
 const RMAT=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
 warmers.push(()=>{const g=new THREE.BoxGeometry();return[MAT,BURN,RMAT].map(m=>{const o=new THREE.Mesh(g,m);o.castShadow=o.receiveShadow=true;return o})});  /* the sites' materials meet the scene when a run builds them: samples for the warm-up (zwarm.js) */
 const mesh=(g,x,y,z,ry=0,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(g,MAT);m.position.set(x,y,z);m.rotation.y=ry;m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;root.add(m);return m};

 // ---------- the world ----------
 // W.list: targets {id, t: 'convoy'|'launch'|'factory', x, z, y, sec, tier, parts, dead, known, ...}; a part {uid, t, main, aa, x, y, z, r, h, hp, max, alive, mesh}
 const W={seed:1,routes:[],list:[],nid:1,bombs:[],later:[],tr:[],auth:true,ver:0,on:false};
 const kill0=()=>{for(const t of W.list)drop(t);W.list.length=0;for(const r of W.routes)root.remove(r.mesh);W.routes.length=0;for(const b of W.bombs)root.remove(b.mesh);W.bombs.length=0;W.later.length=0};
 function drop(t){for(const p of t.parts){if(p.mesh)root.remove(p.mesh);if(p.tur)root.remove(p.tur)}for(const m of t.extra||[])root.remove(m);for(const q of t.pats||[])if(q.mesh)root.remove(q.mesh)}
 const part=(t,o)=>{const p={uid:t.id*16+t.parts.length,t:'',main:false,aa:false,x:0,y:0,z:0,r:3,h:3,hp:1,max:1,alive:true,yaw:0,lock:0,cd:rnd(0,1),los:false,losT:0,tk:null,seen:false,...o};t.parts.push(p);return p};
 // ---------- roads: one per sector, from beyond the map edge through a deep spot to a staging point near the front; 25 m samples ----------
 function mkRoute(R,sec){const S=cands().filter(c=>c.s===sec),pick=(lo,hi)=>{const L=S.filter(c=>c.d>=lo&&c.d<=hi),A=L.length?L:S;return A[R()*A.length|0]};
  const st=sec===1?[R()*2400-1200,-4460]:[(sec?1:-1)*4460,-1100-R()*2400],mid=pick(2900,3500),end=pick(1900,2350),j=a=>a+(R()-.5)*700;
  const cp=[st,[j((st[0]+mid.x)/2),j((st[1]+mid.z)/2)],[mid.x,mid.z],[j((mid.x+end.x)/2),j((mid.z+end.z)/2)],[end.x,end.z]].map(([x,z])=>[cl(x,-4470,4470),cl(z,-4470,4470)]),dense=[];
  for(let i=0;i<cp.length-1;i++){const p0=cp[i-1]||cp[i],p1=cp[i],p2=cp[i+1],p3=cp[i+2]||p2;for(let k=0;k<24;k++){const t=k/24,t2=t*t,t3=t2*t;
   dense.push([0,1].map(a=>.5*(2*p1[a]+(-p0[a]+p2[a])*t+(2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*t2+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*t3)))}}dense.push(cp[cp.length-1]);
  const X=[dense[0][0]],Zs=[dense[0][1]],cum=[0];let acc=0;for(let i=1;i<dense.length;i++){const d=Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]);acc+=d;if(acc-cum[cum.length-1]>=25||i===dense.length-1){X.push(dense[i][0]);Zs.push(dense[i][1]);cum.push(acc)}}
  const r={sec,X,Z:Zs,cum,L:acc};r.mesh=road(r);return r}
 function road(r){const n=r.X.length,pos=new Float32Array(n*6),col=new Float32Array(n*6),idx=[];
  for(let i=0;i<n;i++){const a=Math.max(0,i-1),b=Math.min(n-1,i+1),dx=r.X[b]-r.X[a],dz=r.Z[b]-r.Z[a],l=Math.hypot(dx,dz)||1,nx=-dz/l*3.6,nz=dx/l*3.6;
   for(let s=0;s<2;s++){const x=r.X[i]+(s?-nx:nx),z=r.Z[i]+(s?-nz:nz),o=(i*2+s)*3;pos[o]=x;pos[o+1]=gh(x,z)+.35;pos[o+2]=z;const k=.92+.08*Math.sin(i*1.7+s);col[o]=.27*k;col[o+1]=.25*k;col[o+2]=.21*k}
   if(i<n-1){const q=i*2;idx.push(q,q+2,q+1,q+1,q+2,q+3)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,RMAT);m.receiveShadow=true;root.add(m);return m}
 W.at=(r,s)=>{s=cl(s,0,r.L);let lo=0,hi=r.cum.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(r.cum[m]<=s)lo=m;else hi=m}const f=(s-r.cum[lo])/Math.max(1e-6,r.cum[hi]-r.cum[lo]),x=r.X[lo]+(r.X[hi]-r.X[lo])*f,z=r.Z[lo]+(r.Z[hi]-r.Z[lo])*f;
  return{x,z,yaw:Math.atan2(r.X[hi]-r.X[lo],r.Z[hi]-r.Z[lo])}};

 // ---------- sites ----------
 const near=(x,z,m)=>W.list.some(t=>!t.dead&&t.t!=='convoy'&&Math.hypot(t.x-x,t.z-z)<m);
 // a spot in a sector within a depth band, away from other sites and the roads; prefers ground nobody has seen yet
 function spot(sec,lo,hi){const ok=c=>c.s===sec&&c.d>=lo&&c.d<=hi&&!near(c.x,c.z,700)&&!W.routes.some(r=>r.X.some((x,i)=>i%4===0&&Math.hypot(x-c.x,r.Z[i]-c.z)<90));
  let L=cands().filter(ok);const un=L.filter(c=>!fog.known(c.x,c.z));if(un.length)L=un;if(!L.length)L=cands().filter(c=>c.s===sec&&!near(c.x,c.z,500));return L.length?L[Math.random()*L.length|0]:null}
 const aaN=(t,w)=>t==='launch'?Math.min(4,1+Math.floor(w/14)):Math.min(5,2+Math.floor(w/10));
 const patN=(t,w)=>t==='launch'?(w>=8?Math.min(2,1+Math.floor(w/20)):0):(w>=5?Math.min(3,1+Math.floor(w/14)):0);
 // one site of type ty in sector sec; o (co-op client): the host's description instead of a new layout
 function build(ty,sec,w,o){const c=o||spot(sec,ty==='factory'?3300:2700,ty==='factory'?9e9:3900);if(!c)return null;
  const t={id:o?o.id:W.nid++,t:ty,x:c.x,z:c.z,sec,tier:o?o.tier:tierOf(depth(c.x,c.z)),parts:[],dead:false,known:false,built:o?o.built:w,extra:[],pats:[],kind:o?o.kind:null,yaw:Math.atan2(SITE_C.x-c.x,SITE_C.z-c.z)};
  if(!o&&ty==='factory'){const ks=Object.keys(FKIND).filter(k=>Z.kindFrom(k)<=w+3);let s=0;for(const k of ks)s+=FKIND[k];let r=Math.random()*s;t.kind=ks[0];for(const k of ks){r-=FKIND[k];if(r<=0){t.kind=k;break}}}
  let y=-1e9;for(let a=0;a<8;a++)y=Math.max(y,gh(c.x+Math.cos(a)*30,c.z+Math.sin(a)*30));y=Math.max(y,gh(c.x,c.z));t.y=y+.25;
  const W2=ty==='factory'?74:46;t.extra.push(mesh(GEO.pad,c.x,t.y-7,c.z,t.yaw,W2,14,W2+(ty==='factory'?10:0)));
  const ca=Math.cos(t.yaw),sa=Math.sin(t.yaw),L=(lx,lz)=>[c.x+lx*ca+lz*sa,c.z-lx*sa+lz*ca];
  if(o){for(const q of o.parts)addPart(t,q.t,q.x,q.z,q.yaw,q.hp,q.max)}
  else if(ty==='launch'){const n=2+(w>=18?1:0)+(w>=30?1:0);for(let i=0;i<n;i++){const[x,z]=L((i-(n-1)/2)*11,0);addPart(t,'tel',x,z,t.yaw)}}
  else addPart(t,'hall',c.x,c.z,t.yaw,TGT.factory.hp,TGT.factory.hp);
  if(!o)for(let i=0,n=aaN(ty,w);i<n;i++){const a=t.yaw+(i+.5)/n*Math.PI*2+rnd(-.3,.3),d=ty==='factory'?rnd(70,120):rnd(40,70);addPart(t,'aa',c.x+Math.sin(a)*d,c.z+Math.cos(a)*d,a)}
  {const[x,z]=L(ty==='factory'?-40:16,ty==='factory'?18:-12);t.extra.push(mesh(GEO.crate,x,gh(x,z),z,t.yaw+.4))}
  if(ty==='launch'){const[x,z]=L(-18,-14);const nm=mesh(GEO.net,x,t.y+3.2,z,t.yaw,12,1,9);t.extra.push(nm)}
  pats(t,w);W.list.push(t);W.ver++;return t}
 function addPart(t,ty,x,z,yaw,hp=1,max=1){const y=ty==='aa'?gh(x,z)+.05:t.y,p=part(t,{t:ty,main:ty!=='aa',aa:ty==='aa',x,y,z,yaw,hp,max,r:ty==='hall'?17:ty==='tel'?4.2:2.6,h:ty==='hall'?13:ty==='tel'?4:2.2});
  p.mesh=mesh(ty==='hall'?GEO.hall:ty==='tel'?GEO.tel:GEO.aaBase,x,y,z,yaw);if(ty==='aa'){p.tur=mesh(GEO.turret,x,y+1.5,z,yaw);p.tur.rotation.order='YXZ';p.y=y}
  if(hp<=0)wreck(t,p,true);return p}
 function pats(t,w){for(const q of t.pats)if(q.mesh)root.remove(q.mesh);t.pats=[];if(t.dead)return;for(let i=0,n=patN(t.t,w);i<n;i++){const q={uid:t.id*16+8+i,p:new V3(t.x,t.y+SO.pat.alt,t.z),v:new V3(),st:'orbit',fuel:SO.pat.fuel,ph:i*2.1,tk:null};
  q.mesh=new THREE.Mesh(GEO.pat,MAT);q.mesh.scale.setScalar(1.3);root.add(q.mesh);t.pats.push(q)}}

 // ---------- convoys: 3-5 trucks on a road, one kind of cargo for the next wave; AA trucks from wave 6 ----------
 function convoy(ri,w,cargo,o){const r=W.routes[ri];if(!r)return null;const t={id:o?o.id:W.nid++,t:'convoy',route:ri,sec:r.sec,tier:0,parts:[],dead:false,known:false,seen:false,ls:null,halt:0,cargo,extra:[],pats:[]};
  const n=o?o.parts.length:3+(w>=8?1:0)+(w>=18?1:0),aa=o?0:(w>=6?1:0)+(w>=16?1:0),s0=o?0:convoyStart(r,(n+aa)*SO.truck.gap);
  if(o)for(const q of o.parts)tpart(t,q.t,q.s,q.hp);else{for(let i=0;i<n+aa;i++){const ty=aa&&(i===1||i===n+aa-1&&aa>1)?'aat':'truck';tpart(t,ty,s0-i*SO.truck.gap,1)}}
  const p=W.at(r,t.parts[0].s);t.x=p.x;t.z=p.z;t.tier=tierOf(depth(p.x,p.z));W.list.push(t);W.ver++;return t}
 // where a new convoy's lead truck starts: 12-42% along its road, but with every truck already inside the area a pilot can reach
 // (the roads begin beyond the map edge, outside the AO wall at 4.3 km)
 function convoyStart(r,span){let sIn=0;for(let i=0;i<r.X.length;i++)if(Math.abs(r.X[i])<4000&&Math.abs(r.Z[i])<4000){sIn=r.cum[i];break}
  return Math.min(r.L*.85,Math.max(sIn+span,r.L*rnd(.12,.42)))}
 function tpart(t,ty,s,hp){const p=part(t,{t:ty,main:ty==='truck',aa:ty==='aat',s,r:3.4,h:3.2,hp:Math.max(0,hp),max:1});p.mesh=mesh(ty==='aat'?GEO.aat:GEO.truck,0,0,0);if(ty==='aat'){p.tur=mesh(GEO.turret,0,0,0);p.tur.rotation.order='YXZ'}
  place(t,p);if(hp<=0)wreck(t,p,true);return p}
 function place(t,p){const r=W.routes[t.route],q=W.at(r,p.s);p.x=q.x;p.z=q.z;p.y=gh(q.x,q.z);p.yaw=q.yaw;if(p.mesh){p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=p.yaw}if(p.tur)p.tur.position.set(p.x-Math.sin(p.yaw)*1,p.y+2.6,p.z-Math.cos(p.yaw)*1)}

 // ---------- wrecks, blasts, bombs ----------
 const fire=(p,k,life)=>Z.fxTest?.fire(p,k,life);
 // a part goes: burnt mesh, its explosion and fire (quiet: rebuilding a client's view, no effects)
 function wreck(t,p,quiet){p.alive=false;p.hp=0;if(p.t==='tel')p.mesh.geometry=GEO.telW;if(p.t==='hall'){p.mesh.geometry=GEO.rubble}p.mesh.material=BURN;if(p.tur)p.tur.visible=false;
  if(t.t==='convoy'&&p.mesh)p.mesh.rotation.z=rnd(-.12,.12);if(quiet)return;const at=_a.set(p.x,p.y+p.h*.5,p.z).clone();
  api.boom(at,p.t==='hall'?5:p.t==='tel'?3.2:p.t==='aa'?1.8:2.4);fire(at,p.t==='hall'?1.6:1,p.t==='hall'?90:55);
  if(p.t==='tel')W.later.push({t:.45,f:()=>{api.boom(_b.set(at.x,at.y+6,at.z),2.2);api.shake=.3}});
  if(p.t==='hall')for(let i=0;i<3;i++)W.later.push({t:.4+i*.5,f:()=>{const q=new V3(at.x+rnd(-18,18),at.y+rnd(2,10),at.z+rnd(-10,10));api.boom(q,rnd(2.5,3.5));fire(q,1.1,80)}})}
 // damage everything within R of p (bombs 1, the warhead 3); returns what it hit. by: the pilot's key. Authority only.
 W.blast=(p,R,dmg,by)=>{const hit=[];for(const t of W.list){for(const q of t.parts){if(!q.alive)continue;const dh=Math.hypot(p.x-q.x,p.z-q.z)-q.r,dv=p.y-(q.y+q.h);
    if(Math.hypot(Math.max(0,dh),Math.max(0,dv))>R)continue;q.hp-=dmg;hit.push([t,q]);if(q.hp<=0){wreck(t,q);W.onPart?.(t,q,by)}else{api.boom(_a.set(q.x,q.y+q.h,q.z),1.6);fire(_a,.8,30);W.onDmg?.(t,q,by)}
    if(t.t==='convoy')t.halt=10;if(!t.dead&&!t.parts.some(x=>x.main&&x.alive)){t.dead=true;W.onDead?.(t,by)}W.ver++}
   for(const q of t.pats)if(q.st!=='dead'&&q.p.distanceTo(p)<R+4){patDie(t,q,true);W.onPat?.(t,q,by)}}return hit};
 // is p inside a structure? (bombs stop there, a drone flying into one sets off its warhead)
 W.inside=p=>{for(const t of W.list)for(const q of t.parts){if(!q.alive)continue;if(Math.hypot(p.x-q.x,p.z-q.z)<q.r*.8&&p.y<q.y+q.h&&p.y>q.y-1)return q}return null};
 W.drop=(p,v,by)=>{const m=new THREE.Mesh(GEO.bomb,MAT);m.position.copy(p);root.add(m);W.bombs.push({p:p.clone(),v:v.clone(),by,life:25,mesh:m})};
 function bombs(dt){for(let i=W.bombs.length-1;i>=0;i--){const b=W.bombs[i];b.v.y-=9.81*dt;b.v.multiplyScalar(1-.015*dt);b.p.addScaledVector(b.v,dt);b.life-=dt;
   if(b.p.y<=gh(b.p.x,b.p.z)+.3||W.inside(b.p)||b.life<=0){b.p.y=Math.max(b.p.y,gh(b.p.x,b.p.z)+.3);root.remove(b.mesh);W.bombs.splice(i,1);W.onBomb?.(b)}}}
 // where a bomb dropped now would land (the CCIP pipper): same physics, 50 ms steps
 W.ccip=(p,v,out)=>{const q=_a.copy(p),u=_b.copy(v);for(let i=0;i<400;i++){u.y-=9.81*.05;u.multiplyScalar(1-.015*.05);q.addScaledVector(u,.05);if(q.y<=gh(q.x,q.z)+.3)return out.set(q.x,gh(q.x,q.z),q.z)}return null};

 // ---------- defenders (authority): AA guns lock on, then fire bursts; patrols orbit, chase and blow up close ----------
 const los=(a,b)=>{for(let i=1;i<10;i++){const f=i/10,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f,y=a.y+(b.y-a.y)*f;if(gh(x,z)>y-1)return false}return true};
 const aaRng=()=>SO.aa.rng+SO.aa.rngW*Math.min(40,G.wave);
 function aaStep(t,q,dt,pilots){q.cd-=dt;q.losT-=dt;const at=_a.set(q.x,q.y+2.5,q.z),R=aaRng();let best=null,bd=R;
  for(const P of pilots){const d=P.d.p.distanceTo(at);if(d<bd){bd=d;best=P}}
  if(!best){q.lock=Math.max(0,q.lock-dt);q.tk=null;return}
  if(q.losT<=0||q.tk!==best.key){q.losT=.4;q.los=los(at,best.d.p)}if(!q.los){q.lock=Math.max(0,q.lock-2*dt);q.tk=null;return}
  q.tk=best.key;q.lock+=dt;q.seen=true;aim(q,best.d.p);
  if(q.lock>=SO.aa.lock&&q.cd<=0){q.cd=SO.aa.cd*rnd(.85,1.15);const me=best.d,v=me.v.length(),agl=me.p.y-gh(me.p.x,me.p.z);
   const p=SO.aa.p*Math.min(1.4,1+G.wave/60)*(1-.6*bd/R)*(1-.5*Math.min(1,v/110))*(agl<30?.5:1),hit=Math.random()<p;W.onFire?.(q,best.key,hit);burst(q,me.p,me.v,hit);if(hit)W.onHit?.(best.key,SO.aa.dmg,'aa')}}
 function aim(q,p){if(!q.tur)return;const dx=p.x-q.tur.position.x,dz=p.z-q.tur.position.z,dy=p.y-q.tur.position.y;q.tur.rotation.y=Math.atan2(dx,dz);q.tur.rotation.x=-Math.atan2(dy,Math.hypot(dx,dz))}
 function patDie(t,q,boom){q.st='dead';if(q.mesh)q.mesh.visible=false;if(boom)api.boom(q.p,1.2)}
 function patStep(t,q,dt,pilots){if(q.st==='dead')return;const P=SO.pat;
  if(q.st==='orbit'){q.ph+=dt*.12;const tx=t.x+Math.cos(q.ph)*P.orbit,tz=t.z+Math.sin(q.ph)*P.orbit,ty=gh(tx,tz)+P.alt;_a.set(tx-q.p.x,ty-q.p.y,tz-q.p.z);q.v.lerp(_a.clampLength(0,32),Math.min(1,dt*1.5));q.p.addScaledVector(q.v,dt);
   for(const p of pilots)if(p.d.p.distanceTo(q.p)<P.det){q.st='chase';q.tk=p.key;q.fuel=P.fuel;W.onChase?.(t,q,p.key);break}return}
  const tg=pilots.find(p=>p.key===q.tk)||pilots[0];q.fuel-=dt;
  if(!tg||q.fuel<=0){patDie(t,q,true);return}
  const d=tg.d.p.distanceTo(q.p),tgo=Math.min(2.5,d/P.spd);_a.copy(tg.d.p).addScaledVector(tg.d.v,tgo).sub(q.p).normalize().multiplyScalar(P.spd);
  const cur=_b.copy(q.v);if(cur.lengthSq()<1)cur.copy(_a).multiplyScalar(.3);const ang=cur.angleTo(_a),k=ang>1e-4?Math.min(1,P.turn*dt/ang):1;q.v.copy(cur.normalize().lerp(_a.normalize(),k).normalize().multiplyScalar(P.spd));
  q.p.addScaledVector(q.v,dt);if(q.p.y<gh(q.p.x,q.p.z)+3)q.p.y=gh(q.p.x,q.p.z)+3;
  if(tg.d.p.distanceTo(q.p)<P.blast){patDie(t,q,true);W.onHit?.(tg.key,P.dmg,'pat')}}
 // one step of the enemy side while someone is out on a sortie (solo / host). pilots: [{key, d}] alive interceptors
 W.step=(dt,pilots,live)=>{bombs(dt);for(let i=W.later.length-1;i>=0;i--){const l=W.later[i];if((l.t-=dt)<=0){W.later.splice(i,1);l.f()}}if(!W.auth||!live||W.calm)return;  /* W.calm (tests): guns, patrols and convoys hold still */
  for(const t of W.list){if(t.t==='convoy'&&!t.done){if(t.halt>0)t.halt-=dt;else{for(const p of t.parts)if(p.alive){p.s+=SO.truck.spd*dt;place(t,p)}}
    const L=t.parts.filter(p=>p.alive),r=W.routes[t.route];if(L.length){t.x=L[0].x;t.z=L[0].z}if(L.some(p=>p.main)&&L.some(p=>p.s>=r.L)){t.done=true;for(const p of L){p.alive=false;p.mesh.visible=false;if(p.tur)p.tur.visible=false}W.onDeliver?.(t);W.ver++}}
   for(const q of t.parts)if(q.aa&&q.alive)aaStep(t,q,dt,pilots);for(const q of t.pats)patStep(t,q,dt,pilots)}};
 // a co-op client: aim the guns at the nearest pilot (looks only; the host fires)
 W.look=pilots=>{for(const t of W.list)for(const q of t.parts){if(!q.aa||!q.alive)continue;let b=null,bd=aaRng();for(const P of pilots){const d=P.d.p.distanceTo(_a.set(q.x,q.y,q.z));if(d<bd){bd=d;b=P}}if(b)aim(q,b.d.p)}};

 // ---------- tracers: pooled line segments (additive), a burst of 7 from the gun at the pilot (on target if hit, spread if not) ----------
 const TN=112,tPos=new Float32Array(TN*6),tCol=new Float32Array(TN*6),tGeo=new THREE.BufferGeometry();tGeo.setAttribute('position',new THREE.BufferAttribute(tPos,3));tGeo.setAttribute('color',new THREE.BufferAttribute(tCol,3));
 const tLines=new THREE.LineSegments(tGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));tLines.frustumCulled=false;root.add(tLines);tGeo.setDrawRange(0,0);
 function burst(q,tp,tv,hit){const from=new V3(q.x,q.y+(q.t==='aat'?2.8:1.7),q.z),d=from.distanceTo(tp),tt=d/SO.aa.tracer;
  for(let i=0;i<7;i++){const aimP=_a.copy(tp).addScaledVector(tv,tt);if(!hit)aimP.add(_b.set(rnd(-1,1),rnd(-.6,1),rnd(-1,1)).multiplyScalar(rnd(8,22)));if(W.tr.length>=TN)W.tr.shift();
   W.tr.push({o:from.clone(),dir:aimP.sub(from).normalize().clone(),t:-i*.07,life:Math.min(2.2,tt+.5)})}
  api.FX.emit(from,0xffc060,6,1.2,.15,null,2);Z.au?.gun(from,'gepard')}
 W.burst=burst;
 function tracers(dt){let n=0;for(let i=W.tr.length-1;i>=0;i--){const r=W.tr[i];r.t+=dt;if(r.t>r.life){W.tr.splice(i,1);continue}}
  for(const r of W.tr){if(r.t<0)continue;const h=_a.copy(r.o).addScaledVector(r.dir,r.t*SO.aa.tracer),tl=_b.copy(h).addScaledVector(r.dir,-14),o=n*6;
   tPos[o]=h.x;tPos[o+1]=h.y;tPos[o+2]=h.z;tPos[o+3]=tl.x;tPos[o+4]=tl.y;tPos[o+5]=tl.z;tCol[o]=1;tCol[o+1]=.85;tCol[o+2]=.4;tCol[o+3]=.5;tCol[o+4]=.18;tCol[o+5]=.04;n++}
  tGeo.setDrawRange(0,n*2);tGeo.attributes.position.needsUpdate=tGeo.attributes.color.needsUpdate=true}
 // per frame: patrols and bombs drawn where they are, chimney smoke near the camera, tracers
 let smT=0;
 W.visuals=dt=>{for(const b of W.bombs){b.mesh.position.copy(b.p);b.mesh.lookAt(_a.copy(b.p).add(b.v))}
  for(const t of W.list)for(const q of t.pats){if(!q.mesh)continue;q.mesh.visible=q.st!=='dead';if(q.st==='dead')continue;q.mesh.position.copy(q.p);if(q.v.lengthSq()>1)q.mesh.rotation.y=Math.atan2(q.v.x,q.v.z)}
  if((smT-=dt)<=0){smT=.6;const cam=api.camera.position;for(const t of W.list)if(t.t==='factory'&&!t.dead&&Math.hypot(cam.x-t.x,cam.z-t.z)<3500&&Z.plume){const ca=Math.cos(t.yaw),sa=Math.sin(t.yaw);for(const[lx,lz,hh]of[[16,-9,24],[21,-9,22]])Z.plume(_a.set(t.x+lx*ca+lz*sa,t.y+hh,t.z-lx*sa+lz*ca),.5,true)}}
  tracers(dt)};

 // ---------- the world over a run: new each game; each break new convoys, rebuilt sites, reinforced guns, fresh patrols ----------
 W.reset=seed=>{kill0();W.seed=seed;W.nid=1;W.ver++;const R=seeded(seed);for(let s=0;s<3;s++)W.routes.push(mkRoute(R,s))};
 W.populate=w=>{for(let s=0;s<3;s++)if(!W.list.some(t=>t.t==='launch'&&t.sec===s&&(!t.dead||t.rebuild>w)))build('launch',s,w);
  const nf=1+(w>=12?1:0)+(w>=24?1:0);let have=W.list.filter(t=>t.t==='factory'&&(!t.dead||t.rebuild>w)).length;
  for(const s of[0,1,2].sort(()=>Math.random()-.5)){if(have>=nf)break;if(W.list.some(t=>t.t==='factory'&&t.sec===s&&(!t.dead||t.rebuild>w)))continue;if(build('factory',s,w))have++}};
 // a new break: wrecks of old convoys and long-dead sites go, dead guns at live sites are replaced, patrols refuel, convoys roll (cargo from zsortie.js)
 W.newBreak=(w,cargos)=>{for(let i=W.list.length-1;i>=0;i--){const t=W.list[i];if(t.t==='convoy'||t.dead&&t.rebuild<=w){drop(t);W.list.splice(i,1)}}
  for(const t of W.list)if(t.dead&&t.rebuild==null)t.rebuild=w+(TGT[t.t].rebuild|0);
  W.populate(w);
  for(const t of W.list){if(t.dead)continue;const need=aaN(t.t,w);for(const q of t.parts)if(q.aa&&!q.alive){q.alive=true;q.hp=1;q.mesh.material=MAT;if(q.tur)q.tur.visible=true}
   let have=t.parts.filter(q=>q.aa).length;while(have<need){const a=Math.random()*6.283,d=t.t==='factory'?rnd(70,120):rnd(40,70);addPart(t,'aa',t.x+Math.sin(a)*d,t.z+Math.cos(a)*d,a);have++}pats(t,w)}
  for(const c of cargos)convoy(c.route,w,c);W.ver++};
 W.convoy=convoy;W.build=build;W.wreck=wreck;W.pats=pats;W.place=place;
 W.tierOf=tierOf;W.depth=depth;W.dHome=dHome;W.isHome=(x,z)=>dHome(x,z)<SO.homeR;W.enemy=enemy;W.HOME=HOME;W.root=root;W.cands=cands;W.brg=brg;W.SITE_C=SITE_C;W.GEO=GEO;W.MAT=MAT;

 // ---------- co-op: the host describes the world, a client rebuilds it (positions, parts, hit points; quiet wrecks) ----------
 const KI=k=>Math.max(0,ORDER.indexOf(k)),KN=i=>ORDER[i|0]||'shahed';
 // a part the host says is gone: the host's explosion arrives as its own event, so here only the wreck and its fire
 const lateWreck=(t,p)=>{wreck(t,p,true);if(G.on)fire(new V3(p.x,p.y+p.h*.5,p.z),p.t==='hall'?1.6:1,60)};
 W.ser=()=>({seed:W.seed,s:W.list.filter(t=>t.t!=='convoy').map(t=>[t.id,t.t==='launch'?0:1,Math.round(t.x),Math.round(t.z),t.sec,t.tier,KI(t.kind),t.built|0,t.dead?1:0,t.known?1:0,t.rebuild??-1,
   t.parts.map(q=>[q.t==='tel'?0:q.t==='hall'?1:2,Math.round(q.x),Math.round(q.z),+q.yaw.toFixed(2),Math.max(0,q.hp|0),q.max])]),
  c:W.list.filter(t=>t.t==='convoy').map(t=>[t.id,t.route,KI(t.cargo.k),t.cargo.n|0,t.cargo.all?1:0,t.seen?1:0,t.ls?[Math.round(t.ls.x),Math.round(t.ls.z)]:0,t.done?1:0,t.parts.map(q=>[q.t==='aat'?1:0,Math.round(q.s),q.alive?1:0])])});
 W.des=o=>{if(!o||typeof o!=='object')return;if(Number.isFinite(o.seed)&&o.seed!==W.seed){W.reset(o.seed)}const seen=new Set();
  for(const a of Array.isArray(o.s)?o.s:[]){if(!Array.isArray(a)||a.length<12)continue;const[id,ty,x,z,sec,tier,ki,built,dead,known,reb,ps]=a;seen.add(id);let t=W.list.find(u=>u.id===id);
   if(!t){t=build(ty?'factory':'launch',sec|0,G.wave,{id,x:+x,z:+z,tier:tier|0,built,kind:KN(ki),parts:(Array.isArray(ps)?ps:[]).map(q=>({t:['tel','hall','aa'][q[0]|0]||'aa',x:+q[1],z:+q[2],yaw:+q[3]||0,hp:q[4]|0,max:q[5]|0||1}))});if(!t)continue}
   t.known=t.known||!!known;t.rebuild=reb>=0?reb:undefined;if(Array.isArray(ps))ps.forEach((q,i)=>{const p=t.parts[i];if(!p)return;if(p.alive&&!(q[4]>0))lateWreck(t,p);else if(!p.alive&&q[4]>0){p.alive=true;p.mesh.material=MAT;if(p.tur)p.tur.visible=true}p.hp=q[4]|0});
   if(dead&&!t.dead){t.dead=true;W.onDead?.(t,null,true)}t.dead=!!dead}
  for(const a of Array.isArray(o.c)?o.c:[]){if(!Array.isArray(a)||a.length<9)continue;const[id,ri,ki,n,all,sn,ls,done,ps]=a;seen.add(id);let t=W.list.find(u=>u.id===id);
   if(!t){t=convoy(ri|0,G.wave,{k:KN(ki),n:n|0,all:!!all},{id,parts:(Array.isArray(ps)?ps:[]).map(q=>({t:q[0]?'aat':'truck',s:+q[1]||0,hp:q[2]?1:0}))});if(!t)continue}
   t.seen=t.seen||!!sn;if(Array.isArray(ls))t.ls={x:+ls[0],z:+ls[1]};if(done&&!t.done){t.done=true;for(const p of t.parts){p.mesh.visible=false;if(p.tur)p.tur.visible=false}}
   if(Array.isArray(ps))ps.forEach((q,i)=>{const p=t.parts[i];if(!p)return;if(p.alive&&!q[2])lateWreck(t,p)});if(!t.done)t.dead=!t.parts.some(p=>p.main&&p.alive)}
  for(let i=W.list.length-1;i>=0;i--)if(!seen.has(W.list[i].id)){drop(W.list[i]);W.list.splice(i,1)}};
 // moving things, at snapshot rate while a sortie is on: truck positions, patrols
 W.dyn=()=>({c:W.list.filter(t=>t.t==='convoy'&&!t.done).map(t=>[t.id,t.parts.map(p=>Math.round(p.s))]),p:W.list.flatMap(t=>t.pats.map(q=>[q.uid,q.st==='dead'?0:1,Math.round(q.p.x),Math.round(q.p.y),Math.round(q.p.z)]))});
 W.dynIn=d=>{if(!d)return;for(const a of Array.isArray(d.c)?d.c:[]){const t=W.list.find(u=>u.id===a[0]);if(!t||!Array.isArray(a[1]))continue;a[1].forEach((s,i)=>{const p=t.parts[i];if(p&&p.alive&&Number.isFinite(s)){p.s=s;place(t,p)}});const L=t.parts.find(p=>p.alive);if(L){t.x=L.x;t.z=L.z}}
  for(const a of Array.isArray(d.p)?d.p:[]){for(const t of W.list){const q=t.pats.find(u=>u.uid===a[0]);if(!q)continue;if(!a[1]&&q.st!=='dead')patDie(t,q,true);else if(a[1]){q.st='chase';_a.set(a[2],a[3],a[4]);q.v.subVectors(_a,q.p).multiplyScalar(4);q.p.lerp(_a,.6)}}}};
 return W}
