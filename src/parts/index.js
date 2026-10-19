// Drone parts: 5 arm sets x 5 chassis x 5 power units, plus an optional attachment (parts/attach.js). computeLoadout() turns three part ids into everything the game needs:
// flight multipliers, mass and inertia, collider descriptors (for the Rapier body), the legacy ground hull / ball box, and a mesh spec.
// Stats come from the geometry: motor positions and part masses give the inertia tensor; thrust x lever arm / inertia gives
// roll and pitch authority; prop drag torque / yaw inertia gives yaw authority; prop size sets thrust, pitch speed and spool;
// part areas / mass give drag; chassis top area x flatness gives ball grip. No module outside parts/ needs to know a part exists.
import {ARMS,motorsOf,rootOf} from './arms.js';
import {CHASSIS} from './chassis.js';
import {POWER} from './power.js';
import {ATTACH} from './attach.js';
export {ARMS,ATTACH,CHASSIS,POWER,motorsOf};
export const SLOTS=['arms','chassis','power','attach'],SLOT_NAMES=['Arms','Chassis','Power','Attachment'],PARTS={arms:ARMS,chassis:CHASSIS,power:POWER,attach:ATTACH};
export const STOCK=Object.freeze(['stock','stock','stock','none']);
const LIST=[ARMS,CHASSIS,POWER,ATTACH];
export const partOf=(slot,id)=>LIST[slot].find(p=>p.id===id);
// untrusted input (saves, the network) -> a valid loadout, or null
export function cleanLoadout(x){if(!Array.isArray(x)||x.length<3||x.length>4)return null;if(x.length===3)x=[...x,'none'];  // saves and peers from before attachments get none
 const o=x.map((id,s)=>typeof id==='string'&&id.length<16&&partOf(s,id)?id:null);return o.every(Boolean)?o:null}
// bots: a random loadout seeded per slot key (each slot independent), so a team is varied but stable for a match
export function seededLoadout(key,seed=0){let h=(2166136261^seed)>>>0;for(const ch of String(key))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
 const rnd=()=>{h=h+0x6D2B79F5>>>0;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
 return LIST.map(l=>l[Math.floor(rnd()*l.length)].id)}

// ---------- reference values: the v15 flight model is "nominal" (multiplier 1); Stock comes out a little under it ----------
const R0=.29,REF_G=620,TW0=9.3;  // 5" prop radius at size 1, nominal all-up weight (g), nominal thrust-to-weight
const RATE0=[1250,900,1250],SNAP0=[.06,.11,.06];  // at authority 1: achievable body rate (deg/s) and time to reach it from rest (s): pitch, yaw, roll
const PEN=.9;  // Stock's authority relative to nominal (on top of its own heavier, flexier parts)
const DRAG_PEN=1.06;  // Stock's drag area relative to nominal

// ---------- geometry and mass properties (grams, metres at size 1) ----------
// fly: a part's flight-only geometry (arms: motor spread, prop size, mass; power: battery block) when its look was reshaped but its handling kept
const flyOf=x=>x.fly?{...x,...x.fly,prop:{...x.prop,...x.fly.prop},batt:{...x.batt,...x.fly.batt}}:x;
function build(ids){const[av,c,pv,t]=ids.map((id,s)=>partOf(s,id)),a=flyOf(av),p=flyOf(pv);const M=motorsOf(a),r=a.prop.r;
 const propM=4.5*(r/R0)**2,rodM=(a.mass-4*propM)/4,motM=p.motor.mass+propM;
 const motorY=a.arm.t/2+p.motor.h/2,propY=a.arm.t/2+p.motor.h+.014;
 const cTop=c.y+c.half[1],battY=cTop+p.batt.half[1]*(1-2*(c.bay||0))+.004,auw=a.mass+c.mass+4*p.motor.mass+p.batt.mass+t.mass;
 // inertia about the origin, then moved to the centre of mass
 let Ix=0,Iy=0,Iz=0,my=0,mz=0;
 const pt=(m,x,y,z)=>{Ix+=m*(y*y+z*z);Iy+=m*(x*x+z*z);Iz+=m*(x*x+y*y);my+=m*y;mz+=m*z};
 const box=(m,hx,hy,hz,x,y,z)=>{Ix+=m*(hy*hy+hz*hz)/3;Iy+=m*(hx*hx+hz*hz)/3;Iz+=m*(hx*hx+hy*hy)/3;pt(m,x,y,z)};
 for(const[x,z]of M)pt(motM,x,motorY,z);
 if(a.arm.style==='h'){const zl=a.front[1]+a.rear[1],zc=(a.rear[1]-a.front[1])/2;for(const s of[-1,1])box(rodM*1.5,a.arm.w1/2,a.arm.t/2,zl/2,s*a.front[0],0,zc);box(rodM,a.front[0],a.arm.t/2,a.arm.w0/2,0,0,0)}
 else for(const[x,z]of M){const[rx,rz]=rootOf(a,x,z),dx=x-rx,dz=z-rz;Ix+=rodM*(rz*rz+rz*dz+dz*dz/3);Iy+=rodM*(rx*rx+rx*dx+dx*dx/3+rz*rz+rz*dz+dz*dz/3);Iz+=rodM*(rx*rx+rx*dx+dx*dx/3);mz+=rodM*(rz+dz/2)}  // a rod from the arm root to the motor
 const shell=c.shape==='pod'?.8:1;box(c.mass,c.half[0]*shell,c.half[1]*shell,c.half[2]*shell,0,c.y,0);
 box(p.batt.mass,...p.batt.half,0,battY,0);
 if(t.mass){const at=t.at==='motors'?['motors']:t.at(c,{cTop}),m=t.mass/at.length;for(const e of at)if(e==='motors')for(const[x,z]of M)pt(m/4,x,motorY,z);else pt(m,...e)}  // attachment mass where it sits
 const cy=my/auw,cz=mz/auw;Ix-=auw*(cy*cy+cz*cz);Iy-=auw*cz*cz;Iz-=auw*cy*cy;
 // thrust (g per motor at full throttle) and control authority (angular acceleration from differential thrust / prop torque)
 const Tm=p.motor.thrust*(r/R0)**1.2*(t.thrust||1),dT=Tm-auw/4,st=a.stiff*R0/r;  // headroom over hover; big props change rpm slower (their inertia)
 const alpha=[dT*M.reduce((s,[,z])=>s+Math.abs(z-cz),0)/Ix*st,  // pitch: thrust x longitudinal lever / Ix
  dT*4*Math.sqrt(p.motor.r/.062)*.3/Iy*st,                       // yaw: reaction torque (bigger bells: more) / Iy
  dT*M.reduce((s,[x])=>s+Math.abs(x),0)/Iz*st];                   // roll: thrust x lateral lever / Iz
 // drag areas per body axis (x side face, y prop-disc face, z front face)
 const[hx,hy,hz]=c.half,[bx,by,bz]=p.batt.half,ad=a.arm.t*a.drag,bell=4*2*p.motor.r*p.motor.h;
 const area=[4*hy*hz*c.cd*(c.shape==='pod'?.8:1)+4*by*bz+M.reduce((s,[,z])=>s+ad*Math.abs(z),0)+bell+4*2*r*.02,
  4*hx*hz*c.cd+4*bx*bz+4*Math.PI*r*r*.25,
  4*hx*hy*c.cd*(c.shape==='pod'?.8:1)+4*bx*by+M.reduce((s,[x])=>s+ad*Math.abs(x),0)+bell+4*2*r*.02];
 if(t.drag)t.drag.forEach((v,i)=>area[i]+=v);
 const grip=c.flat**.6*(4*hx*hz/.18)**.35*(t.grip||1);
 const vb=cTop+pv.batt.half[1]*(1-2*(c.bay||0))+.004;  // what you see: the reshaped arms and pack
 return {a:av,c,p:pv,t,M:motorsOf(av),r:av.prop.r,rf:r,motorY:av.arm.t/2+p.motor.h/2,propY:av.arm.t/2+p.motor.h+.014,cTop,battY:vb,auw,I:[Ix,Iy,Iz],cy,cz,Tm,alpha,area,grip}}
const yExt=B=>Math.max(B.battY+B.p.batt.half[1],B.propY,-(B.c.y-B.c.half[1])),REF=build(STOCK),REF_ALPHA=REF.alpha.map(v=>v/PEN),REF_AREA=REF.area.map(v=>v/DRAG_PEN),REF_IM=(REF.I[0]+REF.I[1]+REF.I[2])/REF.auw;
const r3=v=>+v.toFixed(3),r4=v=>+v.toFixed(4),cl=(v,a,b)=>v<a?a:v>b?b:v;

// ---------- the loadout ----------
// k: drone size scale (tune "Drone size" / 0.75); colliders, hull and box come out in world metres at that size
export function computeLoadout(ids,k=1){ids=cleanLoadout(ids)||[...STOCK];const B=build(ids),{a,c,p,t,M,r,rf}=B,mass=B.auw/REF_G;
 const auth=B.alpha.map((v,i)=>cl(v/REF_ALPHA[i],.5,1.8)),rateMul=auth.map(v=>cl(v**.4,.7,1.3)),snapMul=auth.map(v=>cl(v**-.8,.55,1.8));
 const dq=B.area.map((v,i)=>v/REF_AREA[i]/mass),vp=p.kv.vp*(R0/rf)**.6,tw=4*B.Tm/B.auw;
 const flight={
  thr:tw/TW0,                       // x THR (thrust-to-weight)
  te:p.kv.te,                       // x TE (thrust curve)
  vp,maxv:cl(vp,.85,1.25)**.5,      // x VP (prop pitch speed), x MAXV
  spool:p.kv.spool*(rf/R0)**1.5*(t.spool||1),     // x SPOOL (bigger props spin up slower)
  dl:(dq[0]+dq[1]+dq[2])/3,dq,      // x DL, x the body-axis DQ factors (side, disc, front)
  rmax:RATE0.map((v,i)=>v*rateMul[i]*Math.PI/180),  // achievable body rate (rad/s): pitch, yaw, roll
  snap:SNAP0.map((v,i)=>v*snapMul[i]),  // time from rest to rmax (s); acc = rmax/snap is the airframe's angular acceleration (torque / inertia)
  acc:SNAP0.map((v,i)=>RATE0[i]*rateMul[i]*Math.PI/180/(v*snapMul[i])),  // rad/s²: pitch, yaw, roll
  boost:1/mass,drain:p.drain*(R0/rf)**1.5,  // x BOOST (a fixed shove, so heavier quads get less), x DRAIN (pack capacity; big props are more efficient)
  mass,grip:B.grip,kick:c.kick+(t.kick||0),armor:t.armor||1,wheels:!!t.wheels};  // ball touches: drone mass (1 = nominal), dribble grip, added touch restitution; armor: x damage taken in Dogfight
 // collider descriptors (track B / Rapier): box size = half-extents; capsule, cylinder = [halfHeight, radius]; sphere = [radius]
 const S=v=>r4(v*k),q0=[0,0,0,1],qy=ang=>[0,r4(Math.sin(ang/2)),0,r4(Math.cos(ang/2))],cols=[];
 if(c.shape==='pod')cols.push({shape:'capsule',size:[S(c.half[2]-c.half[0]),S(c.half[0])],pos:[0,S(c.y),0],rot:[.7071,0,0,.7071],tag:'chassis'});
 else cols.push({shape:'box',size:c.half.map(S),pos:[0,S(c.y),0],rot:q0,tag:'chassis'});
 cols.push({shape:'box',size:p.batt.half.map(S),pos:[0,S(B.battY),0],rot:q0,tag:'other'});
 cols.push({shape:'box',size:[S(.055),S(.05),S(.045)],pos:[0,S(c.y+c.cam[0]-.02),S(c.cam[1]+.045)],rot:q0,tag:'camera'});
 if(a.arm.style==='h'){const zl=a.front[1]+a.rear[1],zc=(a.rear[1]-a.front[1])/2;for(const s of[1,-1])cols.push({shape:'box',size:[S(a.arm.w1/2),S(a.arm.t/2),S(zl/2)],pos:[S(s*a.front[0]),0,S(zc)],rot:q0,tag:'arm'});
  cols.push({shape:'box',size:[S(a.front[0]),S(a.arm.t/2),S(a.arm.w0/2)],pos:[0,0,0],rot:q0,tag:'arm'})}
 else for(const[x,z]of M){const[rx,rz]=rootOf(a,x,z),dx=x-rx,dz=z-rz,L=Math.hypot(dx,dz)*.85;cols.push({shape:'box',size:[S(a.arm.w0/2),S(a.arm.t/2),S(L/2)],pos:[S(rx+dx*.575),0,S(rz+dz*.575)],rot:qy(Math.atan2(dx,dz)),tag:'arm'})}
 for(const[x,z]of M)cols.push({shape:'cylinder',size:[S(t.ducts?.03:.02),S(r+(t.ducts||0))],pos:[S(x),S(B.propY),S(z)],rot:q0,tag:'prop'});  // ducts: the ring is the prop hitbox
 if(t.cols)for(const e of t.cols(c,B))cols.push({shape:e.shape,size:e.size.map(S),pos:e.pos.map(S),rot:q0,tag:'other'});
 // legacy collision inputs until the Rapier body lands: ground hull outline (HBP/HBR), ball box (BBX), ground inertia (DI)
 const ext=(i,f)=>Math.max(...M.map(m=>Math.abs(m[i])+f*r)),stack=yExt(B)/yExt(REF);  // vertical extent vs Stock
 const ax=ext(0,.35)*k,az=Math.max(ext(1,.35),c.half[2]+.03)*k,hbr=.13*k*Math.sqrt(stack),cr=.34*k*Math.min(ax,az)/(.55*k);
 const hbp=[];for(const[sx,sz]of[[1,1],[-1,1],[-1,-1],[1,-1]])for(let i=0;i<4;i++){const t=i/3*Math.PI/2,x0=ax-hbr,z0=az-hbr,c0=Math.max(.02,cr-hbr);hbp.push([r4(sx*(x0-c0+c0*Math.cos(t))),0,r4(sz*(z0-c0+c0*Math.sin(t)))])}
 const bbx=[r3(ext(0,.5)*k),r3(.28*k*stack),r3(Math.max(ext(1,.5),c.half[2]+.08)*k)];
 const di=.22*k*k*((B.I[0]+B.I[1]+B.I[2])/B.auw)/REF_IM;
 const hy=[r4(Math.min(-a.arm.t/2-.012,c.y-c.half[1])*k),r4(Math.max(B.battY+p.batt.half[1],B.propY+.02,B.cTop)*k)];  // ground hull height: belly to battery top
 const size=REF_AREA_C?Math.sqrt(areaOf(cols)/k/k/REF_AREA_C):1;  // effective size vs Stock (1 = Stock): mean projected collider area
 return {ids,name:[a,c,p,t].filter(x=>x.id!=='none').map(x=>x.name).join(' · '),auw:Math.round(B.auw),mass:r3(mass),inertia:B.I.map(v=>r4(v/REF_G*k*k)),colliders:cols,flight,
  hbp,hbr:r4(hbr),hy,bbx,di:r4(di),size:r3(size),hitR:r3(2*size),  // hitR: Dogfight bullet radius (2 m for Stock, scales with the hitbox)
  meshSpec:{arms:a,chassis:c,power:p,attach:t,motors:M,motorY:B.motorY,propY:B.propY,battY:B.battY,cTop:B.cTop}}}
// mean projected area of the colliders over the three body axes (overlaps counted twice; it is a size index, not exact)
function areaOf(cols){let A=0;for(const c of cols){const s=c.size;
 if(c.shape==='box'){const[x,y,z]=s,q=c.rot,ry=2*Math.atan2(q[1],q[3]),cx=Math.abs(Math.cos(ry)),sx=Math.abs(Math.sin(ry)),X=x*cx+z*sx,Z=x*sx+z*cx;A+=4*(y*Z+X*Z+X*y)}
 else if(c.shape==='cylinder'){const[h,r]=s;A+=Math.PI*r*r+2*(4*h*r)}
 else if(c.shape==='capsule'){const[h,r]=s;A+=2*(4*h*r+Math.PI*r*r)+Math.PI*r*r}
 else if(c.shape==='sphere')A+=3*Math.PI*s[0]*s[0]}
 return A/3}
let REF_AREA_C=0;REF_AREA_C=areaOf(computeLoadout(STOCK).colliders);
// the rigid-body part of a loadout, in the format the Rapier drone body takes
const REF_TOP=(()=>{const b=computeLoadout(STOCK).bbx;return b[0]*b[2]})();
export const bodyOf=lo=>({mass:lo.mass,inertia:lo.inertia,colliders:lo.colliders});

// ---------- stats (garage bars, balance tool), measured with the default physics settings ----------
// T: the tune values (mod-panel keys); defaults to the built-in ones
export const STATS=[['speed','Speed','km/h'],['punch','Punch','T/W'],['roll','Roll','°/s'],['pitch','Pitch','°/s'],['yaw','Yaw','°/s'],['resp','Response','ms spool'],['boost','Boost','m/s per tank'],['hit','Hit power','g AUW'],['ball','Ball control','grip'],['size','Hitbox','× Stock'],['tough','Toughness','× damage'],['ground','Ground drive','']];
export const SCORED=['speed','punch','roll','pitch','yaw','resp','boost','hit','ball','tough','ground'];  // Hitbox size is a trade, not a score
export function statsOf(lo,T){const f=lo.flight,G=T.grav,dl=T.dl*f.dl,thr=T.thr*f.thr,vp=T.vp*f.vp,maxv=T.maxv*f.maxv,te=T.te*f.te,dt=1/60;
 // level top speed: full throttle at a fixed forward tilt with the game's own drag and inflow model; best speed that still holds height
 let top=0;for(let deg=20;deg<=88;deg+=2){const th=deg*Math.PI/180,s=Math.sin(th),c=Math.cos(th);let vy=0,vz=0;
  for(let i=0;i<540;i++){const va=vy*c-vz*s,acc=thr*cl(1-va/vp,0,1.15);vy+=(acc*c-G)*dt;vz-=acc*s*dt;const sp=Math.hypot(vy,vz);
   if(sp>1e-4){const k=T.dq*sp,uy=vy*c-vz*s,uz=vy*s+vz*c,Dy=uy*(dl+k*1.8*f.dq[1]),Dz=uz*(dl+k*.7*f.dq[2]);let ay=c*Dy+s*Dz,az=-s*Dy+c*Dz;const l=Math.hypot(ay,az)*dt;if(l>sp){ay*=sp/l;az*=sp/l}vy-=ay*dt;vz-=az*dt}
   const s2=Math.hypot(vy,vz);if(s2>maxv){const m=Math.max(maxv/s2,1-dt*2);vy*=m;vz*=m}}
  if(vy>-1)top=Math.max(top,-vz)}
 const real=9.81/G,rate=i=>f.rmax[i]*180/Math.PI*.1/(.1+f.snap[i]+T.tau/1000);  // achievable rate, discounted by the time to reach it
 return {speed:top*real*3.6,punch:thr/G,pitch:rate(0),yaw:rate(1),roll:rate(2),resp:1000/(T.spool*f.spool),boost:T.boost*f.boost*100/(T.drain*f.drain),hit:(1.6+f.kick)/(1/.7+1/f.mass)/(1.6/(1/.7+1)),ball:f.grip*Math.sqrt(lo.bbx[0]*lo.bbx[2]/REF_TOP),size:lo.size,tough:1/f.armor,ground:f.wheels?2:1,
  te,raw:{rmax:f.rmax.map(v=>Math.round(v*180/Math.PI)),snap:f.snap.map(v=>Math.round(v*1000)),spool:+(T.spool*f.spool).toFixed(1)}}}
// every loadout (5 x 5 x 5), for normalising bars
// every loadout: the 125 core builds with no attachment (balance tool), or with every attachment too (garage bar ranges)
export function allLoadouts(att=false){const o=[];for(const a of ARMS)for(const c of CHASSIS)for(const p of POWER)for(const t of att?ATTACH:[ATTACH[0]])o.push([a.id,c.id,p.id,t.id]);return o}
