// Procedural part meshes. buildPartsMesh(meshSpec, team, MAT) returns a THREE.Group in metres at drone size 1 (body frame:
// x right, y up, -z forward) plus the four spinning prop groups. Static pieces are merged per material, so a whole quad is
// about a dozen draw calls. Geometry is cached per loadout and shared by every drone and team; only materials differ.
// Builders are keyed by the part's style (arm.style, chassis.shape, batt.style), so a new part that reuses a style needs no code.
import * as THREE from 'three';
import {mergeGeometries,toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const PI=Math.PI,_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3();
// strip to position + normal, non-indexed, so everything merges
function prep(g,crease){let o=g.index?g.toNonIndexed():g;if(crease!=null)o=toCreasedNormals(o,crease);for(const k of Object.keys(o.attributes))if(k!=='position'&&k!=='normal')o.deleteAttribute(k);if(!o.attributes.normal)o.computeVertexNormals();return o}
// geometry collector: material key -> list of transformed geometries
class Kit{constructor(){this.g={}}
 add(key,geo,p=[0,0,0],r=[0,0,0],s=[1,1,1],crease){const g=prep(geo,crease);_m.compose(_p.set(...p),_q.setFromEuler(_e.set(...r)),_s.set(...s));g.applyMatrix4(_m);(this.g[key]||(this.g[key]=[])).push(g);return g}
 merged(){const o={};for(const k in this.g)o[k]=mergeGeometries(this.g[k],false);return o}}
const rbox=(w,h,d,r,seg=3)=>new RoundedBoxGeometry(w,h,d,seg,Math.min(r,w/2-1e-4,h/2-1e-4,d/2-1e-4));
const cyl=(r0,r1,h,n=20)=>new THREE.CylinderGeometry(r0,r1,h,n);
// flat outline (THREE.Shape, in x/z) extruded to thickness t along y, with a rounded bevel on every edge
function slab(shape,t,bev=.006,curve=14){const b=Math.min(bev,t*.3),g=new THREE.ExtrudeGeometry(shape,{depth:Math.max(1e-3,t-2*b),bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:curve});
 g.translate(0,0,-Math.max(1e-3,t-2*b)/2);g.rotateX(PI/2);return g}  // shape (x, y) -> body (x, z); extrude depth -> y
function rrect(w,d,r){const s=new THREE.Shape(),x=w/2,z=d/2;r=Math.min(r,x,z);s.moveTo(-x+r,-z);s.lineTo(x-r,-z);s.quadraticCurveTo(x,-z,x,-z+r);s.lineTo(x,z-r);s.quadraticCurveTo(x,z,x-r,z);s.lineTo(-x+r,z);s.quadraticCurveTo(-x,z,-x,z-r);s.lineTo(-x,-z+r);s.quadraticCurveTo(-x,-z,-x+r,-z);return s}
const slot=(cx,cz,a,b)=>{const h=new THREE.Path();h.absellipse(cx,cz,a,b,0,PI*2,false);return h};

// ---------- arms ----------
// one tapered arm: root (inside the body) to a round motor pad at distance L along +x, with a lightening slot
function armShape(L,w0,w1,pr){const s=new THREE.Shape(),r0=-.05;
 s.moveTo(r0,-w0/2);s.lineTo(L-pr*1.7,-w1/2);s.quadraticCurveTo(L-pr*.9,-pr,L,-pr);s.absarc(L,0,pr,-PI/2,PI/2,false);s.quadraticCurveTo(L-pr*.9,pr,L-pr*1.7,w1/2);s.lineTo(r0,w0/2);s.lineTo(r0,-w0/2);
 if(L>.3)s.holes.push(slot(L*.45,0,L*.16,Math.min(w0,w1)*.17));return s}
const ARM={
 x(K,a,sp,pr){for(const[x,z]of sp.motors){const L=Math.hypot(x,z);K.add('carbon',slab(armShape(L,a.arm.w0,a.arm.w1,pr),a.arm.t,.007),[0,0,0],[0,Math.atan2(-z,x),0],[1,1,1],.7)}},
 h(K,a,sp,pr){const xm=a.front[0],zf=a.front[1],zr=a.rear[1],w=a.arm.w1;
  for(const sx of[-1,1]){const s=new THREE.Shape();s.moveTo(-zf,-w/2);s.lineTo(zr,-w/2);s.absarc(zr,0,pr,-PI/2,PI/2,false);s.lineTo(-zf,w/2);s.absarc(-zf,0,pr,PI/2,PI*1.5,false);
   s.holes.push(slot((zr-zf)/2-.1,0,.1,w*.17),slot((zr-zf)/2+.13,0,.07,w*.17));K.add('carbon',slab(s,a.arm.t,.007),[sx*xm,0,0],[0,-PI/2,0],[1,1,1],.7)}
  for(const z of[-.12,.12]){const s=rrect(2*xm,a.arm.w0*.8,.02);K.add('carbon',slab(s,a.arm.t*.9,.006),[0,0,z],[0,0,0],[1,1,1],.7)}}};

// ---------- motors: stator base, bell with rounded top and a team-colour band, prop nut ----------
function bellGeo(r,h){const P=[[0,0],[r*.9,0],[r*.9,h*.18],[r*.97,h*.2],[r,h*.26],[r,h-.016],[r*.97,h-.005],[r*.86,h],[r*.3,h],[r*.26,h+.01],[0,h+.01]];
 return new THREE.LatheGeometry(P.map(([x,y])=>new THREE.Vector2(x,y)),28)}
function motors(K,sp,a){const{r,h}=sp.power.motor,y0=a.arm.t/2,bell=tint('metal',sp.power.look?.bell);
 for(const[x,z]of sp.motors){K.add(bell,bellGeo(r,h),[x,y0,z],[0,0,0],[1,1,1],.9);K.add('carbon',cyl(r*.93,r*.93,h*.2,24),[x,y0+h*.1,z]);
  K.add('team',cyl(r*1.012,r*1.012,h*.14,28),[x,y0+h*.58,z]);K.add('metal',cyl(.017,.02,.022,12),[x,y0+h+.02,z]);
  K.add('copper',cyl(r*.95,r*.95,h*.07,24),[x,y0+h*.235,z]);  // stator windings showing under the bell
  for(let i=0;i<6;i++){const v=i*PI/3+PI/6;K.add('chip',rbox(.005,h*.26,r*.36,.002,1),[x+Math.cos(v)*r*.995,y0+h*.4,z+Math.sin(v)*r*.995],[0,-v,0])}  // cooling vents
  const L=Math.hypot(x,z),px=z/L*.007,pz=-x/L*.007,wy=y0+.005;for(const s of[-1,1])K.add('rubber',cyl(.0045,.0045,L*.62,6).rotateX(PI/2),[x*.5+s*px,wy,z*.5+s*pz],[0,Math.atan2(x,z),0])}}  // motor wires along the arm

// ---------- props: a twisted, tapered, cambered blade lofted along the span; mirrored for the other spin direction ----------
const tint=(base,hex)=>hex==null?base:base+'#'+hex.toString(16).padStart(6,'0');  // material key: a tinted copy of a shared material
const _blades=new Map();
function bladeGeo(R,twist,dir){const k=R+'/'+twist+'/'+dir;if(_blades.has(k))return _blades.get(k);
 const N=12,rh=.034,cmax=R*.21,th=.007,sec=[[-.5,0],[-.32,.75],[-.05,1],[.25,.6],[.5,0],[.25,-.15],[-.05,-.25],[-.32,-.2]],m=sec.length,pos=[],idx=[];
 for(let i=0;i<=N;i++){const s=i/N,rr=rh+(R-rh)*s,c=cmax*(s<.28?.5+1.8*s:1-.62*((s-.28)/.72)**1.5)*(i===N?.55:1),tw=twist*(1-.6*s),sw=.18*cmax*s*s;
  for(const[u,v]of sec){const z=u*c+sw,y=v*th*(1-.4*s),y2=y*Math.cos(tw)-z*Math.sin(tw),z2=z*Math.cos(tw)+y*Math.sin(tw);pos.push(rr,y2,z2*dir)}}
 const q=(a,b,c)=>dir>0?idx.push(a,b,c):idx.push(a,c,b);
 for(let i=0;i<N;i++)for(let j=0;j<m;j++){const a=i*m+j,b=i*m+(j+1)%m,c=a+m,d=b+m;q(a,c,b);q(b,c,d)}
 const ct=pos.length/3,cr=ct+1,last=N*m;pos.push(R+.004,0,0,rh,0,0);for(let j=0;j<m;j++){q(last+j,ct,last+(j+1)%m);q(j,(j+1)%m,cr)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const parts=[0,1,2].map(n=>g.clone().rotateY(n*PI*2/3)),hub=cyl(.034,.04,.03,16).translate(0,0,0);
 const out=mergeGeometries([...parts.map(p=>prep(p)),prep(hub)],false);_blades.set(k,out);return out}
const _discs=new Map(),disc=R=>{if(!_discs.has(R))_discs.set(R,new THREE.CircleGeometry(R,40).rotateX(-PI/2));return _discs.get(R)};

// ---------- chassis: plates/shells, camera, LEDs and VTX antenna ----------
function camera(K,c){const y=c.y+c.cam[0],z=c.cam[1]+.05,tilt=.35;
 const at=d=>[0,y+d*Math.sin(tilt),z-d*Math.cos(tilt)];  // along the (uptilted) lens axis
 K.add('carbon',rbox(.1,.09,.08,.018),[0,y,z],[tilt,0,0]);K.add('metal',cyl(.036,.033,.05,20),at(.06),[PI/2+tilt,0,0],[1,1,1],.9);
 K.add('lens',new THREE.SphereGeometry(.027,16,10,0,PI*2,0,PI/2),at(.083),[-PI/2+tilt,0,0]);
 for(const sx of[-1,1])K.add('carbon',rbox(.012,.11,.11,.004,2),[sx*.062,y-.01,z+.005])}
function antenna(K,y,z){const a=.5,dy=Math.cos(a),dz=Math.sin(a);K.add('carbon',cyl(.007,.007,.2,8),[0,y+.1*dy,z+.1*dz],[a,0,0]);K.add('team',cyl(.016,.016,.05,12),[0,y+.2*dy,z+.2*dz],[a,0,0])}  // VTX antenna leaning back
function tail(K,c,sp,y){const z=c.half[2];K.add('led',rbox(Math.max(.1,c.half[0]*1.3),.026,.02,.008,2),[0,y,z+.008]);antenna(K,y+.02,z-.03)}
// flight-controller stack detail: processor, gyro, capacitor and screw heads on the top board
function fc(K,y,z,s=1){K.add('chip',rbox(.034*s,.007,.034*s,.002,1),[0,y,z]);K.add('chip',rbox(.014*s,.006,.014*s,.002,1),[.03*s,y,z-.03*s]);
 K.add('metal',cyl(.011,.011,.028,12),[-.034*s,y+.012,z+.03*s]);for(const sx of[-1,1])for(const sz of[-1,1])K.add('metal',cyl(.006,.006,.006,10),[sx*.045*s,y,z+sz*.045*s])}
const CHASSIS={
 box(K,c,sp){const[hx,hy,hz]=c.half,top=c.y+hy,bot=-sp.arms.arm.t/2-.006;  // two carbon plates, team-anodised standoffs, an exposed stack
  K.add('carbon',slab(rrect(2*hx,2*hz,.05),.012),[0,bot,0],[0,0,0],[1,1,1],.7);K.add('carbon',slab(rrect(2*hx*.92,2*hz*.95,.045),.012),[0,top-.006,0],[0,0,0],[1,1,1],.7);
  for(const sx of[-1,1])for(const sz of[-1,1])K.add('team',cyl(.011,.011,top-bot,10),[sx*(hx-.03),(top+bot)/2,sz*(hz-.04)]);
  K.add('board',rbox(hx*1.25,.05,hx*1.25,.006,2),[0,(top+bot)/2,.02]);K.add('board',rbox(hx*1.1,.022,hx*1.1,.006,2),[0,(top+bot)/2+.045,.02]);fc(K,(top+bot)/2+.06,.02,hx/.16);
  for(const sx of[-1,1])for(const sz of[-1,1])K.add('metal',cyl(.009,.009,.006,12),[sx*(hx-.03),top+.003,sz*(hz-.04)]);  // plate screws
  camera(K,c);tail(K,c,sp,c.y)},
 slim(K,c,sp){const[hx,hy,hz]=c.half;  // narrow fuselage with a pointed nose and a low bubble canopy
  const s=new THREE.Shape();s.moveTo(0,-hz-.05);s.quadraticCurveTo(hx*1.1,-hz*.7,hx,-hz*.25);s.lineTo(hx,hz-.03);s.quadraticCurveTo(hx,hz,hx-.03,hz);s.lineTo(-hx+.03,hz);s.quadraticCurveTo(-hx,hz,-hx,hz-.03);s.lineTo(-hx,-hz*.25);s.quadraticCurveTo(-hx*1.1,-hz*.7,0,-hz-.05);
  K.add('carbon',slab(s,hy*1.1,.012,20),[0,c.y-hy*.35,0],[0,0,0],[1,1,1],.7);
  K.add('team',new THREE.SphereGeometry(1,28,14,0,PI*2,0,PI/2),[0,c.y+hy*.2,.03],[0,0,0],[hx*.9,hy*1.5,hz*.78]);
  K.add('board',rbox(hx*1.4,.03,hz*.9,.008,2),[0,c.y,.06]);fc(K,c.y+.018,.06,.8);camera(K,c);tail(K,c,sp,c.y+hy*.3)},
 brick(K,c,sp){const[hx,hy,hz]=c.half;  // armoured block slung under the arms: team armour panels, rubber bumpers, skid plate
  K.add('carbon',rbox(2*hx,2*hy,2*hz,.05,4),[0,c.y,0]);
  for(const sx of[-1,1])K.add('team',rbox(.02,hy*1.45,hz*1.6,.009,2),[sx*(hx+.006),c.y-hy*.05,0]);
  K.add('team',rbox(hx*1.5,.016,hz*1.5,.008,2),[0,c.y+hy+.004,0]);
  for(const sz of[-1,1])K.add('rubber',rbox(2*hx+.05,hy*.7,.05,.022,3),[0,c.y-hy*.15,sz*(hz+.012)]);
  K.add('metal',rbox(hx*1.6,.014,hz*1.7,.007,2),[0,c.y-hy-.004,0]);camera(K,c);tail(K,c,sp,c.y+hy*.3)},
 plank(K,c,sp){const[hx,hy,hz]=c.half;  // wide flat deck with a chamfered outline, team edge trim and a low hump
  const s=new THREE.Shape(),cx=hx*.55,cz=hz*.4;s.moveTo(-hx+cx,-hz);s.lineTo(hx-cx,-hz);s.lineTo(hx,-hz+cz);s.lineTo(hx,hz-cz);s.lineTo(hx-cx,hz);s.lineTo(-hx+cx,hz);s.lineTo(-hx,hz-cz);s.lineTo(-hx,-hz+cz);s.lineTo(-hx+cx,-hz);
  for(const sx of[-1,1])s.holes.push(slot(sx*hx*.55,.05,hx*.18,hz*.3));
  K.add('carbon',slab(s,2*hy,.01),[0,c.y,0],[0,0,0],[1,1,1],.7);K.add('team',slab(s,.012,.004),[0,c.y+hy+.002,0],[0,0,0],[1.03,1,1.03],.7);
  K.add('board',rbox(.17,.03,.2,.01,2),[0,c.y+hy+.02,.04]);fc(K,c.y+hy+.038,.04);camera(K,c);tail(K,c,sp,c.y+hy*.5)},
 pod(K,c,sp){const[r,,hz]=c.half;  // capsule shell in team colour, dark visor over the camera, the pack slotted into the top
  K.add('team',new THREE.CapsuleGeometry(r,2*(hz-r),10,28),[0,c.y,0],[PI/2,0,0],[1,1,1]);
  K.add('lens',new THREE.SphereGeometry(r*1.02,28,14,0,PI*2,0,PI*.32),[0,c.y,-(hz-r)],[-PI/2,0,0],[1,.92,1]);
  K.add('carbon',rbox(r*2.2,.03,hz*1.3,.012,2),[0,-sp.arms.arm.t/2-.012,0]);K.add('led',rbox(r*1.2,.02,.02,.008,2),[0,c.y+r*.15,hz+.004]);
  antenna(K,c.y+r*.6,hz-.1)}};

// ---------- battery: LiPo brick or Li-ion cells, strap(s), XT60 and leads; GPS puck on the long-range pack ----------
const BATT={
 lipo(K,b,y,L){const[x,h,z]=b.half,lab=tint('label',L?.label);K.add(tint('pack',L?.wrap),rbox(2*x,2*h,2*z,.014,3),[0,y,0]);K.add(lab,rbox(2*x+.004,2*h*.6,2*z*.42,.006,2),[0,y,-z*.12]);
  for(const sz of z>.14?[-.45,.45]:[0])K.add('strap',rbox(2*x+.012,2*h+.01,.03,.006,2),[0,y,sz*z]);
  K.add('label',rbox(.05,.03,.035,.006,2),[0,y+h*.2,z+.04]);K.add('rubber',cyl(.006,.006,.05,6),[.012,y,z+.02],[PI/2,0,0]);K.add('rubber',cyl(.006,.006,.05,6),[-.012,y,z+.02],[PI/2,0,0])},
 liion(K,b,y,L){const[x,h,z]=b.half,rc=x/3;for(const i of[-1,0,1])for(const j of[-1,1])K.add(tint('packLR',L?.wrap),new THREE.CapsuleGeometry(rc*.98,2*z-2*rc,6,16),[i*rc*2,y+j*(h-rc)*.85,0],[PI/2,0,0],[1,1,1]);
  for(const sz of[-.5,0,.5])K.add('strap',rbox(2*x+.014,2*h+.012,.03,.006,2),[0,y,sz*z]);
  K.add('label',rbox(.05,.03,.035,.006,2),[0,y,z+.045]);
  K.add('carbon',cyl(.006,.006,.08,8),[0,y+h+.04,z*.6]);K.add('carbon',cyl(.045,.045,.016,24),[0,y+h+.085,z*.6]);K.add(tint('label',L?.label),cyl(.03,.03,.018,20),[0,y+h+.087,z*.6])}};

// ---------- attachments (parts/attach.js) ----------
const ATT={none:()=>{},
 ram:(K,sp)=>{const c=sp.chassis,z=-(c.half[2]+.07);K.add('carbon',rbox(.42,.07,.05,.018),[0,c.y,z]);K.add('team',rbox(.34,.018,.052,.006),[0,c.y+.036,z]);
  for(const x of[-.1,.1])K.add('rubber',cyl(.013,.013,.07,12),[x,c.y,z+.035],[PI/2,0,0])},
 cage:(K,sp)=>{const c=sp.chassis,y=sp.cTop,hx=c.half[0]+.02,hz=Math.max(.16,c.half[2]*.8);
  for(const z of[-hz*.55,0,hz*.55])K.add('metal',new THREE.TorusGeometry(hx,.01,8,36,PI),[0,y,z],[0,0,0],[1,.8,1]);
  K.add('metal',new THREE.TorusGeometry(hz,.01,8,40,PI),[0,y,0],[0,PI/2,0],[1,.7,1]);K.add('team',new THREE.TorusGeometry(.03,.006,8,20),[0,y+.7*hz+.004,0],[PI/2,0,0])},
 ducts:(K,sp)=>{const R=sp.arms.prop.r+.025;for(const[x,z]of sp.motors){K.add('carbon',new THREE.TorusGeometry(R,.011,10,48),[x,sp.propY-.016,z],[PI/2,0,0]);
  K.add('team',new THREE.TorusGeometry(R,.007,8,48),[x,sp.propY+.012,z],[PI/2,0,0]);for(let i=0;i<4;i++){const a=i*PI/2+PI/4;K.add('carbon',rbox(.012,.03,.012,.004),[x+Math.cos(a)*R,sp.propY-.002,z+Math.sin(a)*R])}}},
 wheels:(K,sp)=>{const R=.06,y=-.13+R;for(const[x,z]of sp.motors){const wx=x*.78,wz=z*.78;  // axle along x, so they roll forward
  K.add('rubber',cyl(R,R,.035,24).rotateZ(PI/2),[wx,y,wz]);K.add('metal',cyl(R*.45,R*.45,.04,16).rotateZ(PI/2),[wx,y,wz]);K.add('carbon',rbox(.014,Math.abs(y)+.02,.03,.005,1),[wx-.026,y/2,wz])}},
 armor:(K,sp)=>{const c=sp.chassis,a=sp.arms;for(const s of[-1,1])K.add('metal',rbox(.014,c.half[1]*1.7,c.half[2]*1.5,.006),[s*(c.half[0]+.009),c.y,0]);
  K.add('team',rbox(c.half[0]*1.5,.012,.03,.004),[0,c.y,-(c.half[2]+.01)]);
  for(const[x,z]of sp.motors){const L=Math.hypot(x,z);K.add('metal',rbox(.05,.012,L*.35,.005),[x*.55,a.arm.t/2+.007,z*.55],[0,Math.atan2(x,z),0])}}};

// ---------- whole quad ----------
const _cache=new Map();
function geometryOf(sp){const key=[sp.arms.id,sp.chassis.id,sp.power.id,sp.attach?.id||'none'].join('/');if(_cache.has(key))return _cache.get(key);
 const K=new Kit(),a=sp.arms,pr=sp.power.motor.r+.014;
 ARM[a.arm.style](K,a,sp,pr);motors(K,sp,a);CHASSIS[sp.chassis.shape](K,sp.chassis,sp);
 BATT[sp.power.batt.style](K,sp.power.batt,sp.battY,sp.power.look);(ATT[sp.attach?.id]||ATT.none)(K,sp);
 const o={frame:K.merged(),props:sp.motors.map((m,i)=>({blade:bladeGeo(a.prop.r,a.prop.twist,i===1||i===2?1:-1),disc:disc(a.prop.r),pos:[m[0],sp.propY,m[1]]}))};
 _cache.set(key,o);return o}
const _tints=new Map();
// M: material set {carbon, metal, lens, prop, team[t], led[t], blade[t], pack, packLR, label, strap, rubber, board}
export function buildPartsMesh(sp,t,M){const G=geometryOf(sp),g=new THREE.Group(),props=[];
 const mat=k=>{const[b,hex]=k.split('#'),m=M[b],o=Array.isArray(m)?m[t]:m;if(!hex)return o;const key=b+'#'+hex+'/'+t;  // tinted copies are cached per material
  let c=_tints.get(key);if(!c||c.userData.src!==o){c=o.clone();c.color.setHex(parseInt(hex,16));c.userData.src=o;_tints.set(key,c)}return c};
 for(const k in G.frame){const m=new THREE.Mesh(G.frame[k],mat(k==='strap'?'team':k));m.castShadow=k!=='led';m.receiveShadow=k==='carbon';g.add(m)}
 for(const p of G.props){const pg=new THREE.Group();pg.position.set(...p.pos);const b=new THREE.Mesh(p.blade,mat('blade'));b.castShadow=true;const d=new THREE.Mesh(p.disc,M.prop);d.position.y=.004;d.renderOrder=2;pg.add(b,d);g.add(pg);props.push(pg)}
 return {group:g,props}}

// ---------- hitbox overlay: the collider descriptors drawn as wireframes (garage) ----------
const TAGC={chassis:0x7dff9a,arm:0x9fe8ff,prop:0xffc640,camera:0xff6a6a,other:0xc89bff};
export function colliderWire(cols,opacity=.9){const g=new THREE.Group();
 for(const c of cols){const s=c.size;let geo;
  if(c.shape==='box')geo=new THREE.EdgesGeometry(new THREE.BoxGeometry(2*s[0],2*s[1],2*s[2]));
  else if(c.shape==='capsule')geo=new THREE.WireframeGeometry(new THREE.CapsuleGeometry(s[1],2*s[0],3,12));
  else if(c.shape==='cylinder')geo=new THREE.EdgesGeometry(new THREE.CylinderGeometry(s[1],s[1],2*s[0],28),30);
  else if(c.shape==='sphere')geo=new THREE.WireframeGeometry(new THREE.SphereGeometry(s[0],12,8));
  else continue;
  const l=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:TAGC[c.tag]||0xffffff,transparent:true,opacity,depthTest:false,toneMapped:false}));
  l.position.set(...c.pos);l.quaternion.set(...c.rot);l.renderOrder=10;g.add(l)}
 return g}
