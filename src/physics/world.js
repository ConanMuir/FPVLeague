// ---------- Rapier world: drone and ball rigid bodies, static arena / Highlands colliders, contact handling, ray and shape queries ----------
// Fixed 120 Hz step (main.js accumulates frame time; modes/step.js calls physStep once per tick). The JS state on each drone
// (p q v w) and on the ball (p v w q) stays the source of truth: physStep() writes it into the bodies, steps, and reads it back,
// so spawns, kickoffs, demolitions and online corrections keep working by just setting d.p / ball.p as before.
//  - Drones: the flight model (flight/drone.js) computes this tick's velocity and body rates; Rapier integrates them and resolves
//    contact with the world (restitution from "Wall bounce", no solver friction). Ground friction is ours: from the normal impulse
//    Rapier applied, capped so thrusting into the ground doesn't add grip (v17), at the contact point (spin x.2 as v15).
//  - Ball: by default its contact with the arena is analytic (physics/ball.js against the SDF: exact curved normals, the bot
//    predictor uses the same code). PHYS.ballMesh switches it to Rapier's trimesh contact; tools/physics-check.mjs measures both.
//  - Drone-ball touches and drone-drone contact use Rapier shape-vs-shape queries on each drone's colliders (tags reported),
//    with the v15 response code in modes/step.js.
//  - Bullets: a ray (world) and a 1.4 m sphere cast (drones) from the previous to the new position each tick.
import RAPIER from '@dimforge/rapier3d-compat';
import {GD,H,HL,HW,QT,V3,cl} from '../config/constants.js';
import {BB,BR,DB,DI as DI0,DRAD,BBX,G,GF,HBP,HBR,onTune} from '../config/tune.js';
import {GS} from '../state.js';
import {arenaData,arenaTrimesh} from './arena-shape.js';
import {sdN,sdf} from './sdf.js';
import {ball,ballContact,ballRoll} from './ball.js';
import {dfCollision,sdDFt} from '../world/highlands.js';
import {bodyOf} from '../parts/index.js';
export let R=null,world=null;
export const PHYS={ballMesh:false,net:true,stats:{escapes:0,steps:0,ms:0}};  // net: the escape safety net (checks switch it off for free flight)
// collision groups: membership<<16 | filter. QRY is only ever a query's membership, so query-only colliders never form solver pairs.
export const GW_=1,GB_=2,GHULL=4,GDRONE=8,GBALL=16,GBUL=32,QRY=0x8000,grp=(m,f)=>(m<<16)|f;
const USE={world:GHULL,ball:GBALL,drone:GDRONE,bullet:GBUL};
let arenaCol=null,dfCols=null,ballBody=null,ballCol=null,mapDF=null;const C2D=new Map();  // collider handle -> {d, tag}
const _v=new V3(),_w=new V3(),_n=new V3(),_r=new V3(),_t=new V3(),_q=new QT(),IDQ={x:0,y:0,z:0,w:1},vec=v=>({x:v.x,y:v.y,z:v.z});

export async function initPhysics(){await RAPIER.init();R=RAPIER;world=new R.World({x:0,y:0,z:0});world.timestep=1/120;
 const T=arenaTrimesh(arenaData(),true),st=cd=>world.createCollider(cd.setCollisionGroups(grp(GW_,GHULL|GB_|QRY)).setFriction(1).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0).setRestitutionCombineRule(R.CoefficientCombineRule.Max));
 arenaCol=[st(R.ColliderDesc.trimesh(T.vertices,T.indices,R.TriMeshFlags.FIX_INTERNAL_EDGES)),st(R.ColliderDesc.cuboid(HW+40,10,HL+GD+40).setTranslation(0,-10,0)),st(R.ColliderDesc.cuboid(HW+40,10,HL+GD+40).setTranslation(0,H+10,0))];  // curved surface, floor, ceiling
 ballBody=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(ball.p.x,ball.p.y,ball.p.z).setCcdEnabled(true).setCanSleep(false).setGravityScale(0));
 ballCol=world.createCollider(R.ColliderDesc.ball(BR).setMass(1),ballBody);setBallMode(PHYS.ballMesh);
 onTune(()=>{ballCol.setRadius(BR);ballCol.setRestitution(BB)})}  // drones rebuild their bodies through Drone.setLoadout on tune changes
export function setBallMode(mesh){PHYS.ballMesh=mesh;ballCol.setCollisionGroups(grp(GB_,mesh?GW_|QRY:QRY));ballCol.setFriction(.25);ballCol.setFrictionCombineRule(R.CoefficientCombineRule.Min);ballCol.setRestitution(BB);ballCol.setRestitutionCombineRule(R.CoefficientCombineRule.Max)}

/**
 * The drone's collision description. Drones use loadoutDesc(d.lo) (their parts); defaultDroneDesc() is the v15 stock quad.
 * desc = {mass, inertia:[ix,iy,iz]|null, colliders:[{shape, size, pos, rot, tag, points?, round?, use?}]}
 *  shape  'box' size [hx,hy,hz] half extents | 'sphere' [r] | 'capsule' [halfHeight,r] (local Y) | 'cylinder' [halfHeight,r] (local Y)
 *         | 'hull' points [x,y,z, x,y,z, ...] (or [[x,y,z],...])
 *  pos [x,y,z], rot quaternion [x,y,z,w] in the body frame (+Y up, -Z forward); round: edge radius for box/cylinder/hull (outer size kept for box/cylinder;
 *         a rounded hull is the points grown by round, so a flat outline is fine). Rounded hulls and cylinders become plain convex hulls
 *         sampled from that shape: Rapier 0.14's round convex shapes sink by most of their radius into a FIX_INTERNAL_EDGES trimesh.
 *  tag    'chassis'|'arm'|'prop'|'camera'|'other': reported by ball touches, drone contacts and bullet hits
 *  use    which interactions the collider takes part in (default all): 'world' (solid contact with the arena / terrain; these also
 *         carry the mass when inertia is null and give the turtle pivot points), 'ball' (ball touches), 'drone' (drone-drone
 *         bumps and demolitions), 'bullet' (hit by bullets: a 1.4 m sphere is swept along the bullet path, so the box of the
 *         stock quad is hit within ~2 m of its centre, like v15's 2 m sphere)
 *  mass   kg-equivalent (the stock quad is 1; the flight model's thrust is per unit mass, so mass only changes contact response)
 *  inertia principal moments in the body frame; null = computed from the 'world' colliders at uniform density
 *  pivot  optional [{p:[x,y,z], r}]: points (sphere centres + radius) the turtle / self-righting lever looks at; default: derived
 *         from the 'world' colliders (box corners, capsule ends, cylinder rims, hull points)
 * Prefer rounded boxes, spheres and capsules for 'world' colliders: their contact normals are smooth. Hull facets can give a tilted
 * normal when a flat face slides on the floor, which turns sliding speed into a small bounce.
 */
// a parts loadout (src/parts) as a body: its colliders (chassis, battery, camera, arms, props; tags reported) take ball touches,
// drone bumps and bullets; contact with the map is a rounded box fitted to the loadout's ground hull outline (lo.hbp/hbr), so the
// ground feel stays v15's and scales with the parts; mass from the parts, inertia = v15's soft contact inertia (di/.45 per unit mass)
// split over the axes like the parts' real inertia
export function loadoutDesc(lo){const b=bodyOf(lo),r=lo.hbr,hx=Math.max(...lo.hbp.map(p=>Math.abs(p[0])))+r,hz=Math.max(...lo.hbp.map(p=>Math.abs(p[2])))+r,im=(b.inertia[0]+b.inertia[1]+b.inertia[2])/3;
 return{mass:b.mass,inertia:b.inertia.map(v=>b.mass*lo.di/.45*v/im),pivot:lo.hbp.map(p=>({p,r})),colliders:[
  {shape:'box',size:[hx,r+.001,hz],round:r,pos:[0,0,0],rot:[0,0,0,1],tag:'chassis',use:['world']},...b.colliders.map(c=>({...c,use:['ball','drone','bullet']}))]}}
export function defaultDroneDesc(){const k=HBR/.13;
 return{mass:1,inertia:[DI0/.45,DI0/.45,DI0/.45],pivot:HBP.map(p=>({p:[p.x,0,p.z],r:HBR})),colliders:[
  {shape:'box',size:[.55*k,HBR+.001,.6*k],round:HBR,pos:[0,0,0],rot:[0,0,0,1],tag:'chassis',use:['world']},  // v15 ground hull: 1.1 x 0.26 x 1.2 m, 0.13 m round edges (x size)
  {shape:'box',size:[...BBX],pos:[0,0,0],rot:[0,0,0,1],tag:'chassis',use:['ball','bullet']},  // v15 ball box (props included)
  {shape:'sphere',size:[DRAD-BUMP/2],pos:[0,0,0],rot:[0,0,0,1],tag:'other',use:['drone']}]}}  // v15 drone-drone sphere (with the BUMP skin: DRAD)
const SPH=[[0,1,0],[0,-1,0]];for(let i=0;i<12;i++)for(const la of[-60,-30,0,30,60]){const a=i*Math.PI/6,l=la*Math.PI/180;SPH.push([Math.cos(l)*Math.cos(a),Math.sin(l),Math.cos(l)*Math.sin(a)])}
const grow=(P,r)=>{const o=[];for(let i=0;i<P.length;i+=3)for(const d of SPH)o.push(P[i]+d[0]*r,P[i+1]+d[1]*r,P[i+2]+d[2]*r);return new Float32Array(o)};  // points + sphere (62 directions, < 4 mm short)
function shapeDesc(c){const s=c.size||[],r=c.round||0;
 if(c.shape==='box')return r>0?R.ColliderDesc.roundCuboid(s[0]-r,s[1]-r,s[2]-r,r):R.ColliderDesc.cuboid(s[0],s[1],s[2]);
 if(c.shape==='sphere')return R.ColliderDesc.ball(s[0]);
 if(c.shape==='capsule')return R.ColliderDesc.capsule(s[0],s[1]);
 if(c.shape==='cylinder'){if(!(r>0))return R.ColliderDesc.cylinder(s[0],s[1]);const P=[];for(let i=0;i<16;i++){const a=i*Math.PI/8;for(const y of[-1,1])P.push(Math.cos(a)*(s[1]-r),y*(s[0]-r),Math.sin(a)*(s[1]-r))}return R.ColliderDesc.convexHull(grow(P,r))}
 const P=(c.points||[]).flat();return R.ColliderDesc.convexHull(r>0?grow(P,r):new Float32Array(P))||R.ColliderDesc.ball(.3)}
// local points that can touch the ground, with their radius (turtle pivot + pendulum self-righting look for the lowest one)
function pivotPts(c,lp,lq){const s=c.size||[],r=c.round||0,L=[],add=(x,y,z,rr)=>L.push({p:new V3(x,y,z).applyQuaternion(lq).add(lp),r:rr});
 if(c.shape==='box')for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])add(x*(s[0]-r),y*(s[1]-r),z*(s[2]-r),r);
 else if(c.shape==='sphere')add(0,0,0,s[0]);else if(c.shape==='capsule'){add(0,s[0],0,s[1]);add(0,-s[0],0,s[1])}
 else if(c.shape==='cylinder')for(const y of[-1,1])for(let i=0;i<8;i++){const a=i*Math.PI/4;add(Math.cos(a)*(s[1]-r),y*(s[0]-r),Math.sin(a)*(s[1]-r),r)}
 else{const P=(c.points||[]).flat();for(let i=0;i<P.length;i+=3)add(P[i],P[i+1],P[i+2],r)}return L}
/** Build (or rebuild) drone d's Rapier body from desc (default: its parts loadout d.lo, else the v15 stock quad). Sets d.rb, d.cols [{c, tag, use, lp, lq}], d.pts, d.bound. */
export function buildDroneBody(d,desc){freeDroneBody(d);desc=desc||(d.lo?loadoutDesc(d.lo):defaultDroneDesc());
 const b=d.rb=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(d.p.x,d.p.y,d.p.z).setRotation(vec4(d.q)).setCcdEnabled(true).setCanSleep(false).setGravityScale(0));
 d.cols=[];d.pts=[];let bound=0,vol=0;
 for(const c of desc.colliders){const use=c.use||['world','ball','drone','bullet'],wd=use.includes('world'),lp=new V3(...(c.pos||[0,0,0])),lq=new QT(...(c.rot||[0,0,0,1]));let m=0;for(const u of use)m|=USE[u]||0;
  const cd=shapeDesc(c).setTranslation(lp.x,lp.y,lp.z).setRotation(vec4(lq)).setCollisionGroups(grp(m,(wd?GW_:0)|QRY)).setDensity(0)
   .setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(wd?cl(1.15*(1+DB)-1,0,1):0).setRestitutionCombineRule(R.CoefficientCombineRule.Max);
  const col=world.createCollider(cd,b),e={c:col,tag:c.tag||'other',use,lp,lq,d},s=c.size||[1],P=(c.points||[]).flat();d.cols.push(e);C2D.set(col.handle,e);
  let ext=c.shape==='box'||c.shape==='cylinder'?Math.hypot(...s):c.shape==='capsule'?s[0]+s[1]:c.shape==='sphere'?s[0]:0;for(let i=0;i<P.length;i+=3)ext=Math.max(ext,Math.hypot(P[i],P[i+1],P[i+2])+(c.round||0));
  bound=Math.max(bound,lp.length()+ext);
  if(wd){if(!desc.pivot)d.pts.push(...pivotPts(c,lp,lq));vol+=col.volume()}}
 if(desc.pivot)d.pts=desc.pivot.map(o=>({p:new V3(...o.p),r:o.r}));
 if(desc.inertia)b.setAdditionalMassProperties(desc.mass,{x:0,y:0,z:0},{x:desc.inertia[0],y:desc.inertia[1],z:desc.inertia[2]},IDQ,true);
 else{for(const e of d.cols)if(e.use.includes('world'))e.c.setDensity(desc.mass/Math.max(vol,1e-6));b.recomputeMassPropertiesFromColliders()}
 d.bound=bound;d.ph=0;d.bodyMode='dyn';if(d.dead>0)b.setEnabled(false)}
export function freeDroneBody(d){if(!d.rb)return;for(const e of d.cols)C2D.delete(e.c.handle);world.removeRigidBody(d.rb);d.rb=null;d.cols=[]}
const vec4=q=>({x:q.x,y:q.y,z:q.z,w:q.w});
function setMode(b,o,m){if(o.bodyMode===m)return;if(m==='off'){b.setEnabled(false)}else{if(o.bodyMode==='off')b.setEnabled(true);
 b.setBodyType(m==='dyn'?R.RigidBodyType.Dynamic:R.RigidBodyType.KinematicPositionBased,true)}o.bodyMode=m}

// ---------- the step ----------
// before: drones the flight model stepped this tick have d.ph=1 and this tick's v and body rates w (anything that clamps p q v w
// after Drone.step, like the Calibration Lab's rigs, is integrated from as-is);
// the ball's velocity already has gravity/drag (ballPre). simBall: the ball moves this tick.
export function physStep(dt,simBall){const t0=performance.now();world.timestep=dt;setMap(!!GS.OBSON);  // timestep: goal slow-mo steps by less than 1/120 s
 for(const d of GS.drones){const b=d.rb;if(!b)continue;const m=d.dead>0?'off':d.ph?'dyn':'kin';setMode(b,d,m);
  if(m==='dyn'){b.setTranslation(d.p,true);b.setRotation(vec4(d.q),true);b.setLinvel(d.v,true);b.setAngvel(_v.copy(d.w).applyQuaternion(d.q),true);d.v0=(d.v0||new V3()).copy(d.v)}
  else if(m==='kin'){b.setNextKinematicTranslation(d.p);b.setNextKinematicRotation(vec4(d.q))}}
 {const m=GS.OBSON?'off':simBall?'dyn':'kin';setMode(ballBody,ball,m);
  if(m==='dyn'){ball.v0.copy(ball.v);ballBody.setTranslation(ball.p,true);ballBody.setRotation(vec4(ball.q),true);ballBody.setLinvel(ball.v,true);ballBody.setAngvel(ball.w,true)}
  else if(m==='kin'){ballBody.setNextKinematicTranslation(ball.p);ballBody.setNextKinematicRotation(vec4(ball.q));ball.w.set(0,0,0);ball.c=false}}
 world.step();
 for(const d of GS.drones){if(!d.rb||d.bodyMode!=='dyn')continue;const b=d.rb,t=b.translation(),r=b.rotation(),lv=b.linvel(),av=b.angvel();
  d.p.set(t.x,t.y,t.z);d.q.set(r.x,r.y,r.z,r.w);d.v.set(lv.x,lv.y,lv.z);d.w.set(av.x,av.y,av.z).applyQuaternion(_q.copy(d.q).invert());d.hit=groundContacts(d,dt);
  const s=PHYS.net?(GS.OBSON?sdDFt:sdf)(d.p.x,d.p.y,d.p.z):0;if(s>.05){sdN(d.p,_n);d.p.addScaledVector(_n,-(s+.2));const vn=d.v.dot(_n);if(vn>0)d.v.addScaledVector(_n,-vn*1.2);PHYS.stats.escapes++}  // safety net: never leave the map (Highlands: terrain, walls and ceiling; obstacles' SDF is only approximate)
  d.ph=0}
 ball.hit=0;if(ball.bodyMode==='dyn'){const t=ballBody.translation(),lv=ballBody.linvel(),av=ballBody.angvel(),r=ballBody.rotation();ball.p.set(t.x,t.y,t.z);ball.v.set(lv.x,lv.y,lv.z);ball.w.set(av.x,av.y,av.z);ball.q.set(r.x,r.y,r.z,r.w);
  if(PHYS.ballMesh){let n=null,hit=0;world.contactPairsWith(ballCol,o=>world.contactPair(ballCol,o,(m,fl)=>{for(let i=0;i<m.numContacts();i++)if(m.contactDist(i)<.05){const nn=m.normal();n=_n.set(nn.x,nn.y,nn.z).multiplyScalar(fl?1:-1);break}}));
   if(n){hit=Math.max(0,-ball.v0.dot(n));ballRoll(ball.v,ball.w,n,dt)}ball.hit=hit;if(sdf(ball.p.x,ball.p.y,ball.p.z)>-BR+.3){PHYS.stats.escapes++;ballContact(ball,dt)}}
  else ball.hit=ballContact(ball,dt)}
 PHYS.stats.steps++;PHYS.stats.ms+=performance.now()-t0}
// contacts of a stepped drone with the world: ground timer, impact speed, our ground friction (Rapier's solver friction is 0)
function groundContacts(d,dt){let touch=false,jn=0,hit=0;const DI=d.di||DI0,im=1/d.rb.mass();const n=_n.set(0,0,0),pc=_t.set(0,0,0);let np=0;
 for(const e of d.cols){if(!e.use.includes('world'))continue;world.contactPairsWith(e.c,o=>{if(C2D.has(o.handle))return;world.contactPair(e.c,o,(m,fl)=>{const k=m.numSolverContacts();if(!k)return;touch=true;
   const nn=m.normal(),s=fl?1:-1;let j=0;for(let i=0;i<m.numContacts();i++)j+=m.contactImpulse(i);jn+=j;n.x+=nn.x*s*Math.max(j,1e-3);n.y+=nn.y*s*Math.max(j,1e-3);n.z+=nn.z*s*Math.max(j,1e-3);
   for(let i=0;i<k;i++){const p=m.solverContactPoint(i);pc.x+=p.x;pc.y+=p.y;pc.z+=p.z;np++}
   hit=Math.max(hit,-(d.v0.x*nn.x+d.v0.y*nn.y+d.v0.z*nn.z)*s)})})}
 if(!touch)return 0;d.gt=.12;if(n.lengthSq()<1e-12||!np)return hit;n.normalize();(d.cn||(d.cn=new V3())).copy(n);pc.divideScalar(np);const r=_r.subVectors(pc,d.p);jn*=im;  // d.cn: contact normal (floor up, wall sideways, ceiling down) for the self-righting pendulum; impulse -> velocity change
 // Coulomb friction from the normal impulse, capped at G*.05 so thrusting into the ground doesn't add grip; spin from it x.2 (v15)
 const ww=_w.copy(d.w).applyQuaternion(d.q),vp=_v.crossVectors(ww,r).add(d.v);vp.addScaledVector(n,-vp.dot(n));const tl=vp.length();
 if(tl>1e-4){vp.divideScalar(tl);const rt=_t.crossVectors(r,vp),jt=Math.min(GF*Math.min(jn,G*.05),tl/(1+rt.lengthSq()/DI));d.v.addScaledVector(vp,-jt);ww.addScaledVector(rt,-jt*.2/DI);d.w.copy(ww).applyQuaternion(_q.copy(d.q).invert())}
 return hit}
// League arena or Highlands colliders, swapped with the mode (Highlands built on first use)
function setMap(df){if(df===mapDF)return;mapDF=df;if(df&&!dfCols)buildDF();arenaCol.forEach(c=>c.setEnabled(!df));dfCols?.forEach(c=>c.setEnabled(df))}
function buildDF(){const D=dfCollision(),add=(cd,x,y,z,q)=>{cd.setTranslation(x,y,z).setCollisionGroups(grp(GW_,GHULL|GB_|QRY)).setFriction(1).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0).setRestitutionCombineRule(R.CoefficientCombineRule.Max);
  if(q)cd.setRotation(q);dfCols.push(world.createCollider(cd))};dfCols=[];
 const h=D.hf;add(R.ColliderDesc.heightfield(h.nz,h.nx,h.heights,{x:h.w,y:1,z:h.l},R.HeightFieldFlags.FIX_INTERNAL_EDGES),0,0,0);
 for(const o of D.obs){const q=o.q?{x:o.q[0],y:o.q[1],z:o.q[2],w:o.q[3]}:null;
  if(o.s==='box')add(R.ColliderDesc.cuboid(o.h[0],o.h[1],o.h[2]),...o.p,q);
  else if(o.s==='cyl')add(R.ColliderDesc.cylinder(o.hh,o.r),...o.p,q);
  else if(o.s==='cone')add(R.ColliderDesc.cone(o.hh,o.r),...o.p,q);
  else if(o.s==='cap')add(R.ColliderDesc.capsule(o.hh,o.r),...o.p,q);
  else if(o.s==='hull'){const c=R.ColliderDesc.convexHull(new Float32Array(o.pts));if(c)add(c,...o.p,q)}}}

// ---------- queries ----------
// bullet sweep radius: aim forgiveness around a drone's parts. 1.4 m at the old 0.75 drone size; it shrinks as drones grow (their
// parts already make them bigger targets), so a size-2 stock quad is hit out to ~3 m from its centre instead of ~3.4 m
export const bulletR=()=>cl(1.4*.6/DRAD,.35,1.4);let bulShape=null;
/** first thing a bullet hits moving from p0 by dv this tick: {t (0..1), d (drone)|null, tag, p (hit point)} or null. team/by are skipped. */
export function bulletCast(p0,dv,team,by){const L=dv.length();if(L<1e-6)return null;const dir=_v.copy(dv).divideScalar(L);
 const rh=world.castRay(new R.Ray(p0,dir),L,true,undefined,grp(QRY,GW_));let best=rh?{t:rh.timeOfImpact/L,d:null,tag:'world'}:null;
 const br=bulletR();if(!bulShape||bulShape.radius!==br)bulShape=new R.Ball(br);
 const sh=world.castShape(p0,IDQ,dir,bulShape,0,best?best.t*L:L,true,undefined,grp(QRY,GBUL),undefined,undefined,c=>{const e=C2D.get(c.handle);return!!e&&e.d.team!==team&&e.d!==by&&e.d.dead<=0});
 if(sh){const e=C2D.get(sh.collider.handle);best={t:sh.time_of_impact/L,d:e.d,tag:e.tag}}
 if(best)best.p=new V3().copy(p0).addScaledVector(dv,best.t);return best}
/** line of sight through the map (cover blocks it); the first and last 2 m are ignored, as v15 */
export function los(a,b){const d=_v.subVectors(b,a),L=d.length();if(L<4)return true;d.divideScalar(L);_w.copy(a).addScaledVector(d,2);
 return!world.castRay(new R.Ray(_w,d),L-4,true,undefined,grp(QRY,GW_))}
let tbShape=null,tbR=0;
/** ball vs drone d's 'ball' colliders: n (unit, drone -> ball) and pen like v15's ballBox, plus the tag touched */
export function ballTouch(d,n){if(!d.rb||d.p.distanceToSquared(ball.p)>(BR+d.bound+.5)**2)return null;if(!tbShape||tbR!==BR){tbShape=new R.Ball(BR);tbR=BR}let best=null;
 for(const e of d.cols){if(!e.use.includes('ball'))continue;const c=e.c.contactShape(tbShape,ball.p,IDQ,0);if(c&&c.distance<0&&(!best||c.distance<best.distance))best={distance:c.distance,n:c.normal2,tag:e.tag}}
 if(!best)return null;n.set(-best.n.x,-best.n.y,-best.n.z);if(n.lengthSq()<.5)n.subVectors(ball.p,d.p).normalize();return{pen:-best.distance,tag:best.tag}}
/** drone a vs drone b ('drone' colliders, with the BUMP skin): n (unit, a -> b), pen, tags */
export const BUMP=.4;  // drone-drone contact skin (m): parts within this distance bump (v15's 1.2 m spheres were generous; thin frames need some)
export function droneTouch(a,b,n){if(!a.rb||!b.rb||a.p.distanceToSquared(b.p)>(a.bound+b.bound+BUMP+.2)**2)return null;let best=null;
 for(const ea of a.cols){if(!ea.use.includes('drone'))continue;for(const eb of b.cols){if(!eb.use.includes('drone'))continue;const c=ea.c.contactCollider(eb.c,BUMP);
  if(c&&c.distance<BUMP&&(!best||c.distance<best.distance))best={distance:c.distance,n:c.normal1,ta:ea.tag,tb:eb.tag}}}
 if(!best)return null;n.set(best.n.x,best.n.y,best.n.z);if(n.lengthSq()<.5)n.subVectors(b.p,a.p).normalize();return{pen:BUMP-best.distance,ta:best.ta,tb:best.tb}}
// contact / hit events for gameplay code (track D: zone hits): {type:'ball'|'drone'|'bullet', d, tag, other, otherTag, speed}
const hitFns=[];export const onHit=f=>{hitFns.push(f)},emitHit=e=>{for(const f of hitFns)f(e)};
