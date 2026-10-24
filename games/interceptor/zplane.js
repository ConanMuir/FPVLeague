/* The Plane (craft type, ztypes.js): a small fixed-wing for Zombies. Fast cruise, banks to turn, a minimum speed below which the wing lets go
   (the nose drops and it sinks: it cannot hover), a gentle pull-up limit and a long-lasting pack. It leaves the pad on a catapult roll and
   lands by a low pass over any forward pad: the auto-flare settles it, it rolls out and the pack is recharged. Game-tuned numbers, not a
   model of any real aircraft.
   Body frame as the dart's: +Y nose, +Z up, +X right (the camera, the pip, the lock and the rocket booster all take the nose from +Y).
   Flight is a point mass in the air (wind axes): thrust along the path, drag from a parasite and an induced term, and a lift force of n g
   (n = the load factor the sticks ask for, capped by what the wing can carry at this speed: (V / Vs)^2, and by F.nmax) turned by the bank.
   The attitude follows from the path: nose = path + the angle of attack, up = the lift direction. Roll stick = bank, pitch stick =
   path rate (stick forward = nose down, like the quad's), yaw stick = a little rudder. Everything on the ground is scripted:
   pad (waiting), cat (the catapult roll), fly, roll (wheels down), chg (taxi to the cradle and recharge). */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ou} from '../../engine/flight.js';
import {noise,tone} from '../../engine/audio.js';

const V3=THREE.Vector3,QT=THREE.Quaternion,M4=THREE.Matrix4,D2R=Math.PI/180,cl=(v,a,b)=>v<a?a:v>b?b:v,sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)};

/* the numbers: speeds in m/s, loads in g, rates in rad/s, accelerations in m/s^2, currents in A */
export const F={vs:28,vc:62,vne:135,nmax:2.6,nmin:-1,rate:.22,bank:65*D2R,broll:2.6,yawr:.2,lvl:.15,a0:4.5*D2R,
 at:4.8,te:1.4,vp:200,c0:2.25e-4,ci:1500,tm:.3,i0:8,i1:118,
 cat:{v:52,len:24,inc:12*D2R},up:14*D2R,sink:5,bankL:22*D2R,fl:{r:150,agl:14,v:58},chg:3.2,rest:.19,vlow:1.12,hdn:.66};
/* the throttle stick to the throttle level and back; the stick's rest point (the keyboard's hover point HOV, 0.32 by default) is half throttle = cruise */
export const lvlOf=(s,h)=>s<=h?.5*s/h:.5+.5*(s-h)/(1-h);
export const stickOf=(u,h)=>u<=.5?u/.5*h:h+(u-.5)/.5*(1-h);
const feed=(X,t)=>X.feed?.(t);

/* ---------- the model: one merged, vertex-coloured mesh (grey-green airframe, orange tips, dark gear and dome) and a translucent pusher prop ---------- */
let GE=null,MT=null;
const geos=()=>{if(GE)return GE;
 const col=(g,c)=>{const C=new THREE.Color(c),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=C.r;a[i*3+1]=C.g;a[i*3+2]=C.b}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g};
 const flat=g=>{g=g.index?g.toNonIndexed():g;g.deleteAttribute('uv');return g};
 const plate=(pts,t,m)=>{const s=new THREE.Shape();s.moveTo(...pts[0]);for(const p of pts.slice(1))s.lineTo(...p);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:t,bevelEnabled:false}).translate(0,0,-t/2);if(m)g.applyMatrix4(m);return g};
 const toYZ=new M4().makeBasis(new V3(0,1,0),new V3(0,0,1),new V3(1,0,0));  /* a shape drawn in (y, z), thickness along x */
 const tint=(g,f)=>{const p=g.attributes.position,c=g.attributes.color;for(let i=0;i<p.count;i++){const k=f(p.getX(i),p.getY(i),p.getZ(i));if(k){c.setXYZ(i,k.r,k.g,k.b)}}return g};
 const OR=new THREE.Color(0xe8742a),GREY=0x9aa08e,GREYB=0x858c7a,DK=0x2a2c2e;
 const fus=col(flat(new THREE.LatheGeometry([[0,-.55],[.026,-.54],[.04,-.48],[.05,-.36],[.066,-.18],[.075,0],[.078,.18],[.072,.36],[.055,.48],[.03,.55],[0,.57]].map(([r,y])=>new THREE.Vector2(r,y)),14)),GREY);
 const wing=tint(col(flat(plate([[0,.2],[.8,.12],[.8,.01],[0,-.06],[-.8,.01],[-.8,.12]],.014).translate(0,0,.05)),GREYB),(x,y,z)=>Math.abs(x)>.68?OR:null);
 const stab=tint(col(flat(plate([[0,-.38],[.25,-.43],[.25,-.5],[0,-.52],[-.25,-.5],[-.25,-.43]],.01).translate(0,0,.03)),GREYB),(x)=>Math.abs(x)>.19?OR:null);
 const fin=tint(col(flat(plate([[-.34,.03],[-.46,.2],[-.53,.2],[-.53,.03]],.011,toYZ)),GREYB),(x,y,z)=>z>.15?OR:null);
 const tip=s=>col(flat(plate([[.02,.05],[-.03,.05],[-.04,.14],[.0,.14]],.008,toYZ).translate(s*.8,0,0)),0xe8742a);
 const gear=[[0,.3],[.2,-.06],[-.2,-.06]].map(([x,y])=>col(flat(new THREE.CylinderGeometry(.006,.006,.13,5).rotateX(0).translate(x,y,-.12)),DK)),
  wheel=[[0,.3],[.2,-.06],[-.2,-.06]].map(([x,y])=>col(flat(new THREE.CylinderGeometry(.03,.03,.02,10).rotateZ(Math.PI/2).translate(x,y,-.165)),DK));
 const dark=[col(flat(new THREE.SphereGeometry(.03,10,6).translate(0,.555,.012)),DK),col(flat(new THREE.CylinderGeometry(.034,.03,.07,10).translate(0,-.575,0)),DK)];
 GE={body:mergeGeometries([fus,wing,stab,fin,tip(1),tip(-1),...gear,...wheel,...dark]),
  prop:new THREE.CircleGeometry(.12,24).rotateX(-Math.PI/2),blade:new THREE.BoxGeometry(.24,.004,.022)};
 MT={body:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.62,metalness:.12}),prop:new THREE.MeshBasicMaterial({color:0xaab4c8,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}),
  blade:new THREE.MeshStandardMaterial({color:0x22252a,roughness:.5,transparent:true,opacity:.65})};
 return GE};
/* the craft's group: {group, props: the parts that spin (about their local Y), nozzle: the exhaust exit (flame along its -Y)} */
export function planeModel(){const G=geos(),g=new THREE.Group(),body=new THREE.Mesh(G.body,MT.body);body.castShadow=true;g.add(body);
 const pr=new THREE.Mesh(G.prop,MT.prop);pr.position.y=-.62;pr.castShadow=false;const bl=new THREE.Mesh(G.blade,MT.blade);pr.add(bl);g.add(pr);
 const nozzle=new THREE.Object3D();nozzle.position.set(0,-.66,0);g.add(nozzle);return{group:g,props:[pr],nozzle}}

/* ---------- the flight ---------- */
const HULL=[[0,.56,.01],[0,-.55,.0],[.8,.06,.05],[-.8,.06,.05],[0,-.48,.2],[0,0,-.06]],GEAR=[[0,.3,-.185],[.2,-.06,-.185],[-.2,-.06,-.185]];
const _m=new M4(),_X=new V3(),_Z=new V3(),_air=new V3(),_va=new V3(),_xw=new V3(),_u0=new V3(),_r0=new V3(),_lf=new V3(),_pp=new V3(),_nose=new V3(),_up=new V3(),_P=new V3(),_n=new V3(),_h=new V3(),_q1=new QT(),_q2=new QT(),UP=new V3(0,1,0);
/* q from a nose direction and a rough up (body +Y = nose, +Z = up, +X = right = nose x up) */
function orient(q,nose,up){_X.crossVectors(nose,up).normalize();_Z.crossVectors(_X,nose);_m.makeBasis(_X,nose,_Z);return q.setFromRotationMatrix(_m)}
const HEADS=[0,...Array.from({length:12},(_,k)=>[(k+1)*Math.PI/12,-(k+1)*Math.PI/12]).flat()].concat(Math.PI);  /* catapult headings tried, nearest the bearing first */
const hv=(psi,o)=>o.set(Math.sin(psi),0,-Math.cos(psi));  /* heading psi (0 = north = -z, clockwise) to a unit vector */

/* the plane's flight controller for one Drone d. X: what the world gives it (interceptor.js: terrain, solids, wind, the pack, the pads) */
export function makePlane(d,X){
 const P={chT:3.2,padLand:false,dr:0,sg:0,up:0,mode:'pad',bank:0,alpha:0,u0:new V3(0,1,0),k:{thr:0,yaw:0,pit:0,rol:0},hd:0,ct:0,ct0:new V3(),ch:0,ch0:new V3(),chq:new QT(),flare:false,pad:1e9,agl:0,n:1,vmin:F.vs,ias:0,stall:0,warn:0,sit:false,landed:0,crash:0,sz:1};
 const mat=(f=d.home)=>f.mat;
 const nearPad=()=>{let b=null,bd=1e18;for(const f of X.FOBS){const q=(f.x-d.p.x)**2+(f.z-d.p.z)**2;if(q<bd){bd=q;b=f}}P.fob=b;return P.pad=Math.sqrt(bd)};
 const agl=()=>d.p.y-X.gh(d.p.x,d.p.z);
 /* the pack and the motor: spool toward the throttle (the main loop zeroes d.thr when the pack is flat), the pack's current, its voltage */
 /* cruise hold: with the throttle stick at its rest point (the keyboard released, a gamepad centred) the throttle holds the cruise speed through turns and climbs;
    anything off the rest point is the pilot's own throttle. The thrust it needs is the drag and the climb of the last tick plus a push toward the cruise speed. */
 function power(dt){let u=cl(d.thr,0,1);
  if(P.k.auto&&P.mode==='fly'&&u>0){u=P.uFor(F.vc,P.sg/X.G);d.thr=u}
  if(P.flare)u=0;d.ms+=(u-d.ms)*(1-Math.exp(-dt/F.tm));
  const I=d.amp=F.i0+(F.i1-F.i0)*Math.max(d.ms,0)**1.5;d.mah+=I*dt/3.6;d.vp+=(I*.0011-d.vp)*(1-Math.exp(-dt/(I*.0011>d.vp?.6:2.5)));d.vc=X.ocv(d.mah/X.BCAP)-(I*.0016+d.vp)*X.SAGK}
 const vf=()=>cl(Math.max(d.vc,3)/3.95,.6,1.02);  /* thrust sags a little with the pack */
 /* the throttle level that holds speed Vt on a path with this sine of climb: the thrust for the drag and the climb of the last tick, plus a push toward Vt (bots use it too) */
 P.uFor=(Vt,sg)=>{const V=Math.max(P.ias,1),Tn=P.dr+X.G*sg+.3*(Vt-V);return Tn<=0?0:cl((Tn/(F.at*cl(1-V/F.vp,.1,1)*vf()))**(1/F.te),0,1)};
 /* the stick, from the player or the bot: thr 0..1 (the stick, rest = cruise), yaw, pit (forward = nose down), rol (right = bank right) */
 P.stick=(thr,yaw,pit,rol)=>{const k=P.k;k.thr=thr;k.yaw=yaw;k.pit=pit;k.rol=rol;k.auto=Math.abs(thr-X.HOV)<.035;d.thr=lvlOf(thr,X.HOV)};
 /* on the pad, nose along the way to the track (ang: the dart's bearing, heading = -ang), level; the heading is turned off any solid thing in the way of the catapult run */
 P.spawn=(f,ang)=>{const m=f.mat,s=X.MSZ;let psi=-ang,best=-1;
  /* the first heading (nearest the bearing) whose climb-out is clear for 200 m with 2.5 m to spare; else the clearest */
  for(const o of HEADS){hv(-ang-o,_h);let t=2;
   for(;t<=200;t+=3){const y=m.y+.7*s+(t<F.cat.len?t*Math.tan(F.cat.inc):F.cat.len*Math.tan(F.cat.inc)+(t-F.cat.len)*Math.tan(F.up)),w0=t<F.cat.len?.9:1.4;
    if([-w0,0,w0].some(w=>X.sdf(m.x+_h.x*t-_h.z*w,y,m.z+_h.z*t+_h.x*w)>-2.5))break}
   if(t>best){best=t;psi=-ang-o}if(t>200)break}
  P.psi=psi;hv(psi,_h);
  d.p.set(m.x,m.y+F.rest*s,m.z);d.v.set(0,0,0);d.w.set(0,0,0);d.wt.set(0,0,0);orient(d.q,_h,UP);Object.assign(P,{padLand:false,mode:'pad',bank:0,alpha:0,ct:0,flare:false,sit:false,landed:0,crash:0,warn:0,stall:0,hd:psi});
  d.ms=0;d.thr=0;d.gt=0;d.mah=0;d.vp=0;d.vc=4.2;d.t=0;d.dead=0;d.tb.set(0,0,0);d.gu.set(0,0,0)};
 /* turn the waiting plane to face a bearing (a sortie pad change) */
 P.face=ang=>{P.psi=-ang;hv(P.psi,_h);if(P.mode==='pad')orient(d.q,_h,UP)};
 /* ground: touch test with the airframe (2: a part that is not a wheel, 1: only the wheels, 0: clear) */
 function touch(){const s=X.MSZ;let g=0;
  for(const p of HULL){_P.set(p[0]*s,p[1]*s,p[2]*s).applyQuaternion(d.q).add(d.p);if(X.sdf(_P.x,_P.y,_P.z)+.04>0){P.hit=[p.join(),_P.x,_P.y,_P.z,X.gh(_P.x,_P.z)];return 2}}
  for(const p of GEAR){_P.set(p[0]*s,p[1]*s,p[2]*s).applyQuaternion(d.q).add(d.p);if(X.sdf(_P.x,_P.y,_P.z)+.03>0){g=1;break}}return g}
 const sdAt=(x,y,z)=>X.sdf(x,y,z);
 function fly(dt){const g=X.G,k=P.k;power(dt);
  const AIR=_air.copy(X.WIND).add(d.gu);ou(d.gu,dt,1.8,.08*X.wind+.2,.5);
  const va=_va.subVectors(d.v,AIR);let V=va.length();if(V<1){va.set(0,1,0).applyQuaternion(d.q);V=1}const xw=_xw.copy(va).divideScalar(V),gam=Math.asin(cl(xw.y,-1,1));
  P.ias=V;P.agl=agl()-F.rest*X.MSZ;
  /* the low pass over a pad: slow enough, low enough, close enough: the flare takes the stick (a gentle sink, wings level, throttle off) and keeps it to the touchdown;
     pulling back hard or throttle up is a go-around */
  nearPad();const fl=F.fl;
  if(P.flare){if(P.agl>fl.agl*2||k.pit<-.6||d.thr>.9)P.flare=false}
  else if(P.pad<fl.r&&P.agl<fl.agl&&V<fl.v&&d.v.y<1.5&&k.pit>-.6&&d.thr<.9)P.flare=true;
  const eff=sm((V-F.vs*.7)/(F.vs*.5));
  let bc=k.rol*F.bank*eff,gd=-k.pit*F.rate-gam*F.lvl*(1-Math.abs(k.pit));
  if(P.up>0){P.up-=dt;if(P.agl<30){bc=cl(bc,-.35,.35);if(k.pit<.3)gd=Math.max(gd,cl((F.up-gam)*1.5,-.1,.2))}}  /* climb-out assist after the catapult: wings nearly level and fourteen degrees up until it is clear of the pad's trees */
  if(P.flare){const vt=-cl(.9+P.agl*.5,.9,3.2),gt=Math.asin(cl(vt/V,-.3,.05));gd=cl((gt-gam)*2.5,-.5,.5);bc=0}
  P.bank+=(bc-P.bank)*(1-Math.exp(-dt*(P.flare?4:F.broll)));const bk=P.bank,cb=Math.max(.35,Math.cos(bk));
  const nc=(gd*V+g*Math.cos(gam))/(g*cb),cap=Math.min(F.nmax,(V/F.vs)**2),n=cl(nc,F.nmin,cap);P.n=n;
  P.vmin=F.vs*Math.sqrt(cl(nc,1,F.nmax));P.stall=cl((P.vmin*F.vlow-V)/(P.vmin*(F.vlow-.9)),0,1);
  /* wind axes: the lift direction is the in-plane up turned by the bank */
  const u0=_u0.set(0,1,0).addScaledVector(xw,-xw.y);if(u0.lengthSq()<1e-4)u0.copy(P.u0);else u0.normalize();P.u0.copy(u0);
  const r0=_r0.crossVectors(xw,u0),lf=_lf.copy(u0).multiplyScalar(Math.cos(bk)).addScaledVector(r0,Math.sin(bk));
  const T=F.at*Math.max(d.ms,0)**F.te*cl(1-V/F.vp,.1,1)*vf()+(d.boost||0),Dr=F.c0*V*V+F.ci*n*n/Math.max(V*V,225),vcap=F.vne+(d.bmax||0);
  const Vd=T-Dr-g*xw.y-Math.max(0,V-vcap)*3;P.dr=Dr;P.sg=g*xw.y;
  ou(d.tb,dt,.25,(.3+X.wind*.12+V*.015)*.5,.4);
  const pp=_pp.copy(lf).multiplyScalar(n*g);pp.y-=g;pp.addScaledVector(xw,g*xw.y).addScaledVector(d.tb,1);
  xw.addScaledVector(pp,dt/V);
  const yw=-k.yaw*F.yawr*eff*dt;if(yw){const c=Math.cos(yw),s=Math.sin(yw),x=xw.x;xw.x=x*c+xw.z*s;xw.z=-x*s+xw.z*c}
  xw.normalize();V=cl(V+Vd*dt,0,vcap+30);d.v.copy(xw).multiplyScalar(V).add(AIR);d.p.addScaledVector(d.v,dt);
  /* the attitude: the path and the lift direction again, the nose the angle of attack off the path (nose-down through the stall) */
  const w0=_u0.set(0,1,0).addScaledVector(xw,-xw.y);if(w0.lengthSq()<1e-4)w0.copy(P.u0);else w0.normalize();
  const w1=_r0.crossVectors(xw,w0),l2=_lf.copy(w0).multiplyScalar(Math.cos(bk)).addScaledVector(w1,Math.sin(bk));
  const aT=cl(F.a0*n/Math.max((V/F.vc)**2,.15),-8*D2R,16*D2R)-sm((F.vs*1.03-V)/(F.vs*.3))*34*D2R;P.alpha+=(aT-P.alpha)*(1-Math.exp(-dt/.12));
  const ca=Math.cos(P.alpha),sa=Math.sin(P.alpha);_nose.copy(xw).multiplyScalar(ca).addScaledVector(l2,sa);_up.copy(l2).multiplyScalar(ca).addScaledVector(xw,-sa);orient(d.q,_nose,_up);
  P.hd=Math.atan2(xw.x,-xw.z);d.gt=0;
  /* the ground */
  if(P.agl<45){const c=touch();if(c===2)return P.crash=1e3;
   if(c===1){X.sdN(_P.copy(d.p),_n);_n.negate();const vn=-d.v.dot(_n),pitch=Math.asin(cl(_nose.y,-1,1));
    if(P.agl>1.5||vn>F.sink||Math.abs(bk)>F.bankL||pitch<-8*D2R||pitch>22*D2R||_n.y<.9){P.hit=["gear",P.agl,vn,bk*57.3,pitch*57.3,_n.y];return P.crash=1e3}
    return land(vn)}}
  /* a stall's warning: a quick beep while the wing is close to letting go */
  if(P.stall>0&&P.agl>8&&(P.warn-=dt)<=0){P.warn=.35;tone(900,900,.07,.035,'square')}
  return 0}
 function land(vn){const h=Math.hypot(d.v.x,d.v.z);P.mode='roll';P.hd=Math.atan2(d.v.x,-d.v.z);P.padLand=P.flare;P.flare=false;P.bank=0;d.v.y=0;d.gt=.12;P.landed++;if(h<1)P.hd=P.psi;noise(.12,300,cl(vn/30,.03,.2));return vn}
 function roll(dt){const k=P.k,s=X.MSZ;power(dt);let V=Math.hypot(d.v.x,d.v.z);nearPad();const pad=P.padLand||P.pad<110,u=cl(d.thr,0,1),go=u>.6;P.ias=V;P.agl=0;P.flare=false;
  let a=(go?F.at*Math.max(d.ms,0)**F.te*cl(1-V/F.vp,.1,1)*vf()+(d.boost||0):0)-.9-(u<.55?(pad?11:5.5):0);  /* throttle past 60% is thrust (a take-off run); under 55% the wheel brakes, hard on a pad */
  V=Math.max(0,V+a*dt);if(V<.05&&a<0)V=0;P.hd+=k.yaw*.75*Math.min(1,V/6)*dt;hv(P.hd,_h);
  const x0=d.p.x,z0=d.p.z,y0=d.p.y;d.p.x+=_h.x*V*dt;d.p.z+=_h.z*V*dt;
  const gy=X.gh(d.p.x,d.p.z)+F.rest*s;d.p.y+=(gy-d.p.y)*Math.min(1,dt*40);d.v.set(_h.x*V,(d.p.y-y0)/dt,_h.z*V);
  /* a solid thing at nose or wing height ahead: stop if it is a bump, crash if it is not */
  for(const o of[[0,.56],[.8,.06],[-.8,.06]]){_P.set(0,0,0).addScaledVector(_r0.set(Math.cos(P.hd),0,Math.sin(P.hd)),o[0]*s).addScaledVector(_h,o[1]*s).add(d.p);_P.y+=.1*s;if(sdAt(_P.x,_P.y,_P.z)>-.05){if(V>12)return P.crash=1e3;V=0;d.p.x=x0;d.p.z=z0;d.v.set(0,0,0);break}}
  const sl=Math.atan2(X.gh(d.p.x+_h.x,d.p.z+_h.z)-X.gh(d.p.x-_h.x,d.p.z-_h.z),2),ps=sl+(V>F.vs*.6?4*D2R:0);
  _nose.copy(_h).multiplyScalar(Math.cos(ps));_nose.y=Math.sin(ps);orient(d.q,_nose,UP);d.w.set(0,0,0);
  if(u>.6&&V>F.vs*1.1&&(k.pit<-.1||V>F.vs*1.35)){P.mode='fly';P.alpha=6*D2R;d.v.set(_h.x*V,V*.07,_h.z*V);d.gt=0;return 0}
  if(V<.4&&u<.55){d.v.set(0,0,0);if(pad&&P.fob){P.mode='chg';P.ch=0;P.chT=cl(Math.hypot(d.p.x-P.fob.mat.x,d.p.z-P.fob.mat.z)/30,F.chg,9);P.ch0.copy(d.p);P.chq.copy(d.q);d.home=P.fob;feed(X,`Landed at <b>${P.fob.n}</b>: recharging`);X.banner?.('LANDED','cg',1.2)}else{P.sit=true;d.gt=.12}}else{P.sit=false;d.gt=pad?0:.12}
  return 0}
 /* taxi to the cradle on the pad while the pack charges, then wait for the catapult */
 function chg(dt){P.ch+=dt;const f=sm(P.ch/P.chT),m=mat(),s=X.MSZ;d.thr=0;d.ms=0;d.v.set(0,0,0);d.amp=0;P.ias=0;
  const tx=P.ch0.x+(m.x-P.ch0.x)*f,tz=P.ch0.z+(m.z-P.ch0.z)*f;d.p.set(tx,X.gh(tx,tz)+F.rest*s,tz);  /* on its wheels over the ground */
  hv(P.psi,_h);orient(_q1,_h,UP);d.q.slerpQuaternions(P.chq,_q1,f);d.mah=Math.max(0,d.mah*(1-dt/Math.max(.05,P.chT*.85-P.ch+dt)));
  if(P.ch>=P.chT){d.mah=0;P.padLand=false;d.vc=4.2;d.vp=0;P.mode='pad';d.q.copy(_q1);d.p.set(m.x,m.y+F.rest*s,m.z);feed(X,'<span class="cg">Pack recharged</span>: throttle up for the catapult');X.banner?.('RECHARGED','cg',1)}
  return 0}
 function pad(dt){d.ms+=(0-d.ms)*(1-Math.exp(-dt*3));d.amp=F.i0*.2;d.v.set(0,0,0);P.ias=0;P.flare=false;P.agl=0;
  if(d.thr>F.hdn){P.mode='cat';P.ct=0;P.ct0.copy(d.p);hv(P.psi,_h);noise(.35,900,.12);X.banner?.('CATAPULT','co',.7)}return 0}
 function cat(dt){const C=F.cat,a=C.v*C.v/(2*C.len),s=X.MSZ;P.ct+=dt;power(dt);d.ms=Math.max(d.ms,cl(P.ct*3,0,.9));
  const t=P.ct,V=Math.min(C.v,a*t),L=Math.min(C.len,.5*a*t*t);hv(P.psi,_h);
  d.p.set(P.ct0.x+_h.x*L,P.ct0.y+L*Math.tan(C.inc),P.ct0.z+_h.z*L);d.v.set(_h.x*V*Math.cos(C.inc),V*Math.sin(C.inc),_h.z*V*Math.cos(C.inc));P.ias=V;
  _nose.copy(_h).multiplyScalar(Math.cos(C.inc));_nose.y=Math.sin(C.inc);orient(d.q,_nose,UP);d.gt=.12;
  if(L>=C.len){P.mode='fly';P.alpha=C.inc;P.bank=0;d.gt=0;P.up=4}return 0}
 P.step=dt=>{d.t+=dt;d.w.set(0,0,0);let h=0;
  switch(P.mode){case'pad':h=pad(dt);break;case'cat':h=cat(dt);break;case'roll':h=roll(dt);break;case'chg':h=chg(dt);break;default:h=fly(dt)}
  const c=P.crash;P.crash=0;return c||h};
 P.vtop=()=>F.vne+(d.bmax||0);
 /* what the HUD shows (ztypes.js) */
 P.info=()=>({ias:P.ias,vmin:P.mode==='fly'?P.vmin:F.vs,mode:P.mode,stall:P.stall,flare:P.flare,pad:P.pad<F.fl.r*1.4,agl:P.agl,sit:P.sit,ch:cl(P.ch/P.chT,0,1),n:P.n,pl:P.padLand});
 return P}
