// Drone League: Rocket League-style ball game for FPV acro quads, plus Dogfight (guns over the Highlands). Both modes share the match, bots and online code.
// The flight model, rates, input, audio, settings and online rooms come from the engine (../../engine).
import * as THREE from 'three';
import {$,V3,QT,cl,UP,esc,seeded} from '../../engine/util.js';
import {S,save,loadSettings} from '../../engine/settings.js';
import {scene,camera,bloom,tex,glow,dot,setFov,fpvCam} from '../../engine/render.js';
import {banner,feed,edgeArrow,fmt} from '../../engine/hud.js';
import {AC,audioInit,audioOn,motorAudio,quadVoice,noise,tone} from '../../engine/audio.js';
import {G,THR,TE,DL,DQ,BZ,BOOST,START,HOV,DRAD,Quad,setWorld,sdN,tuneFlight,attitude,humanControl} from '../../engine/flight.js';
import {rate,initRates,initSens} from '../../engine/rates.js';
import {initInput,padEdges,pad,padX,fireBtnIn,mountPad} from '../../engine/input.js';
import {PILOT_FIELDS,initMenu,syncUI} from '../../engine/menu.js';
import {mountMod,initModPanel,tune,hostTune,setHostTune,toggleMod,tab,modMsg} from '../../engine/modpanel.js';
import {getRoom} from '../../engine/net.js';
import {startLoop} from '../../engine/loop.js';
import {W,L,H,GW,GH,GD,RC,RF,HW,HL,COL,CSS,TEAM,BR,BG,TB,BBX,BTHR,MAXB,DEMO,PBG,PSM,BB,BD,BM,KICK,GSPD,BOTV,SHK,tuneLeague} from './consts.js';
import {sun} from './scene.js';
import {goalG,LOOKS,mapG,mapId,lookBK,snowP,OUT,setMap,BALLS,ballMesh,ballLight,ring,ballTick,setBall} from './arena.js';
import {dfG,DW,DLEN,DHW,DHL,DCEIL,DBASE,cxR,dfH,OBS,sdDF,DSLOTS,buildDF} from './highlands.js';
mountMod();

const DIFF=[
 {n:'Rookie',kp:.9,kd:2.2,vmax:34,att:7,rate:6,thr:.72,react:.3,noise:4,slack:1.35},
 {n:'Pro',kp:1.1,kd:2.6,vmax:48,att:9,rate:8,thr:.84,react:.18,noise:2,slack:1.2},
 {n:'All-Star',kp:1.3,kd:3,vmax:62,att:11,rate:10,thr:.94,react:.12,noise:1,slack:1.08},
 {n:'Legend',kp:1.5,kd:3.4,vmax:76,att:13,rate:12,thr:1,react:.08,noise:.4,slack:1}];
const DEF={mode:"acro",diff:3,size:2,tilt:30,fov:110,cam:0,thrMode:"full",len:180,cal:[{"a":2,"c":0.0275,"s":-0.7922},{"a":5,"c":-0.0431,"s":0.7843},{"a":1,"c":0.0431,"s":-0.8392},{"a":0,"c":-0.0039,"s":0.8235}],dz:0.03,name:'',tp:'auto',map:'arena',ball:'classic',game:'league',afire:true,fireBtn:5,sboost:false,bots:1,xfire:7,xflip:1,flipBtn:-1,xcal:[{a:1,c:0,s:-1,m:'spring'},{a:0,c:0,s:1},{a:3,c:0,s:-1},{a:2,c:0,s:1}]};
loadSettings('droneleague',DEF);if(S.bots!==0)S.bots=1;
if(!['arena','meadow','canyon','alpine'].includes(S.map))S.map='arena';if(!['classic','soccer','plasma','beach'].includes(S.ball))S.ball='classic';if(S.game!=='df')S.game='league';
{const m=new URLSearchParams(location.search).get('mode');if(m==='df'||m==='league')S.game=m}  // the launcher opens Dogfight with ?mode=df

// ---------- particles ----------
const PN=1600,pPos=new Float32Array(PN*3).fill(-999),pCol=new Float32Array(PN*3),pBase=new Float32Array(PN*3),pVel=new Float32Array(PN*3),pLife=new Float32Array(PN);let pi=0;
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const parts=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.9,map:dot,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));parts.frustumCulled=false;scene.add(parts);
const _c=new THREE.Color();
function emit(p,hex,n,spd,life=1,bv=null,k=2){_c.set(hex).multiplyScalar(k);for(let j=0;j<n;j++){const i=pi++%PN,i3=i*3;
 let x=Math.random()*2-1,y=Math.random()*2-1,z=Math.random()*2-1;const m=spd*(.3+Math.random()*.7)/(Math.hypot(x,y,z)||1);
 pPos[i3]=p.x;pPos[i3+1]=p.y;pPos[i3+2]=p.z;pVel[i3]=x*m+(bv?bv.x:0);pVel[i3+1]=y*m+(bv?bv.y:0);pVel[i3+2]=z*m+(bv?bv.z:0);
 pBase[i3]=_c.r;pBase[i3+1]=_c.g;pBase[i3+2]=_c.b;pLife[i]=life*(.5+Math.random()*.5)}}
function updParts(dt){const dmp=Math.exp(-dt*1.8);for(let i=0;i<PN;i++){const i3=i*3;if(pLife[i]<=0)continue;pLife[i]-=dt;
 if(pLife[i]<=0){pPos[i3+1]=-999;pCol[i3]=pCol[i3+1]=pCol[i3+2]=0;continue}
 pVel[i3]*=dmp;pVel[i3+1]=pVel[i3+1]*dmp-3*dt;pVel[i3+2]*=dmp;pPos[i3]+=pVel[i3]*dt;pPos[i3+1]+=pVel[i3+1]*dt;pPos[i3+2]+=pVel[i3+2]*dt;
 const f=Math.min(1,pLife[i]*2);pCol[i3]=pBase[i3]*f;pCol[i3+1]=pBase[i3+1]*f;pCol[i3+2]=pBase[i3+2]*f}
 pGeo.attributes.position.needsUpdate=pGeo.attributes.color.needsUpdate=true}

const near=p=>cl(1-p.distanceTo(camera.position)/130,0,1);

// ---------- physics ----------
// sphere vs plane (n, offset): positional fix + restitution + coulomb friction; returns impact speed
function pl(p,v,r,nx,ny,nz,o,e,f){const d=p.x*nx+p.y*ny+p.z*nz-o;if(d>=r)return 0;const c=r-d;p.x+=nx*c;p.y+=ny*c;p.z+=nz*c;
 const vn=v.x*nx+v.y*ny+v.z*nz;if(vn>=0)return 0;const tx=v.x-nx*vn,ty=v.y-ny*vn,tz=v.z-nz*vn,tl=Math.hypot(tx,ty,tz),k=tl>1e-6?Math.max(0,1-f*-vn*(1+e)/tl):0;
 v.x=tx*k-nx*vn*e;v.y=ty*k-ny*vn*e;v.z=tz*k-nz*vn*e;return -vn}
// interior SDF (positive = outside): rounded arena unioned with the goal boxes (extended into the field so the mouth is open)
function sdArena(x,y,z){const qx=Math.abs(x)-HW+RC,qz=Math.abs(z)-HL+RC,d2=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-RC;
 const ax=d2+RF,ay=Math.abs(y-H/2)-H/2+RF;return Math.hypot(Math.max(ax,0),Math.max(ay,0))+Math.min(Math.max(ax,ay),0)-RF}
function sdGoal(x,y,z){const qx=Math.abs(x)-GW/2,qy=Math.abs(y-GH/2)-GH/2,qz=Math.abs(Math.abs(z)-(HL+GD/2-10))-(GD/2+10);
 return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)}
let OBSON=false;const sdf=(x,y,z)=>OBSON?sdDF(x,y,z):Math.min(sdArena(x,y,z),sdGoal(x,y,z)),_an=new V3();setWorld(sdf);
// sphere vs arena surface: positional fix + restitution + coulomb friction; returns impact speed
function arena(p,v,r,e,f){let m=0;for(let it=0;it<2;it++){const d=sdf(p.x,p.y,p.z);if(d<=-r)break;const n=sdN(p,_an);p.addScaledVector(n,-(d+r));
 const vn=-(v.x*n.x+v.y*n.y+v.z*n.z);if(vn>=0)continue;const tx=v.x+n.x*vn,ty=v.y+n.y*vn,tz=v.z+n.z*vn,tl=Math.hypot(tx,ty,tz),k=tl>1e-6?Math.max(0,1-f*-vn*(1+e)/tl):0;
 v.x=tx*k+n.x*vn*e;v.y=ty*k+n.y*vn*e;v.z=tz*k+n.z*vn*e;m=Math.max(m,-vn)}return m}
function ballPhys(p,v,dt){v.y-=BG*dt;const s=v.length();v.multiplyScalar(Math.max(0,1-(BD+BD*.02*s)*dt));if(s>MAXB)v.multiplyScalar(MAXB/s);p.addScaledVector(v,dt);return arena(p,v,BR,BB,.25)}

const ball={p:new V3(0,BR+6,0),v:new V3(),last:null};

// boost orbs: fly through them to fill the meter; the top of the throttle stick burns it as super boost
const ORBS=[],orbGeoS=new THREE.IcosahedronGeometry(.75,2),orbGeoB=new THREE.IcosahedronGeometry(1.25,2),orbWireG=new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.1,1));
const orbOn=glow(0xffc640,1.8),orbOff=new THREE.MeshBasicMaterial({color:0x6a4a14,transparent:true,opacity:.5}),orbHalo=new THREE.SpriteMaterial({map:dot,color:new THREE.Color(0xffb22a).multiplyScalar(.7),blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),
 orbWire=new THREE.LineBasicMaterial({color:new THREE.Color(0xffd36a).multiplyScalar(1.6),toneMapped:false}),orbBeam=new THREE.MeshBasicMaterial({color:new THREE.Color(0xffb22a).multiplyScalar(1.4),transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
const ORBP=[];for(const[fx,y,fz,b]of[[.84,7,.84,1],[.89,14,0,1],[0,22,.5,1],[0,5,.28],[.4,8,.13],[.6,5,.42],[.72,18,.24],[0,26,.46],[.3,30,0],[.8,10,.6],[.36,12,.78]])
 for(const sx of fx?[-1,1]:[1])for(const sz of fz?[-1,1]:[1])ORBP.push([sx*fx*HW,y,sz*fz*HL,b]);
for(const[x,y,z,b]of ORBP){
 let beam=null;const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);const core=new THREE.Mesh(b?orbGeoB:orbGeoS,orbOn),halo=new THREE.Sprite(orbHalo);halo.scale.setScalar(b?5:3);g.add(core,halo);let wire=null;
 if(b){wire=new THREE.LineSegments(orbWireG,orbWire);g.add(wire);beam=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,y,6,1,true),orbBeam);beam.position.set(x,y/2,z);scene.add(beam)}
 ORBS.push({p:new V3(x,y,z),big:!!b,cd:0,g,core,halo,wire,beam})}

// ---------- drones ----------
const GEO={body:new THREE.BoxGeometry(.6,.22,1.1),canopy:new THREE.BoxGeometry(.46,.22,.62),arm:new THREE.BoxGeometry(2.5,.07,.16),motor:new THREE.CylinderGeometry(.14,.16,.18,12),
 prop:new THREE.CylinderGeometry(.56,.56,.015,24),blade:new THREE.BoxGeometry(1.05,.03,.09),led:new THREE.BoxGeometry(.5,.06,.06),cam:new THREE.BoxGeometry(.26,.24,.2),lens:new THREE.SphereGeometry(.09,12,8)};
const MAT={carbon:new THREE.MeshStandardMaterial({color:0x16191f,roughness:.45,metalness:.7}),metal:new THREE.MeshStandardMaterial({color:0x8a919c,roughness:.3,metalness:.9}),
 prop:new THREE.MeshBasicMaterial({color:0xaab4c8,transparent:true,opacity:.14,depthWrite:false}),lens:new THREE.MeshStandardMaterial({color:0x050505,roughness:.05,metalness:1}),
 team:COL.map(c=>new THREE.MeshStandardMaterial({color:c,metalness:.4,roughness:.35,emissive:c,emissiveIntensity:.3})),led:COL.map(c=>glow(c,4)),
 blade:COL.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.5,transparent:true,opacity:.55}))};
const markTex=tex(64,64,g=>{g.strokeStyle='#fff';g.lineWidth=7;g.beginPath();g.arc(32,32,22,0,7);g.stroke();g.fillStyle='#fff';g.beginPath();g.arc(32,32,8,0,7);g.fill()});
const NAMES=[['Nova','Ace','Vortex'],['Blaze','Rotor','Kestrel']],SLOTS=[[0,4,HL*.72],[-34,4,HL*.82],[34,4,HL*.82]],TN=28;
const _q=new QT(),_v=new V3(),_w=new V3(),_u=new V3();
class Drone extends Quad{
 constructor(team,i,bot,key){super();Object.assign(this,{team,i,bot,key,remote:false,net:null,seen:0,name:NAMES[team][i],thr:HOV,ms:HOV,boost:33,role:'attack',hp:100,life:0,fcd:0,firing:false,
  ai:{t:0,tg:new V3(),tv:new V3(),look:new V3(),nz:new V3()}});this.build();this.spawn()}
 build(){const g=this.mesh=new THREE.Group(),t=this.team;
  const add=(geo,mat,x,y,z,ry=0,par=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=true;par.add(m);return m};
  add(GEO.body,MAT.carbon,0,0,0);add(GEO.canopy,MAT.team[t],0,.2,.12);add(GEO.arm,MAT.carbon,0,0,0,Math.PI/4);add(GEO.arm,MAT.carbon,0,0,0,-Math.PI/4);
  this.props=[];for(const[x,z]of[[.88,.88],[-.88,.88],[.88,-.88],[-.88,-.88]]){add(GEO.motor,MAT.metal,x,.1,z);const pr=add(GEO.prop,MAT.prop,x,.22,z);pr.castShadow=false;add(GEO.blade,MAT.blade[t],0,0,0,0,pr);this.props.push(pr)}
  add(GEO.led,MAT.led[t],0,.02,.58);add(GEO.cam,MAT.carbon,0,.08,-.62);add(GEO.lens,MAT.lens,0,.08,-.74);
  const sp=this.mark=new THREE.Sprite(new THREE.SpriteMaterial({map:markTex,color:new THREE.Color(COL[t]).multiplyScalar(1.6),depthTest:false,sizeAttenuation:false,toneMapped:false}));sp.scale.set(.022,.022,1);sp.position.y=1.8;sp.renderOrder=5;g.add(sp);
  g.scale.setScalar(.68*DRAD/.8);scene.add(g);this.tp=new Float32Array(TN*3);const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(this.tp,3));
  this.trail=new THREE.Line(tg,new THREE.LineBasicMaterial({color:new THREE.Color(COL[t]).multiplyScalar(2.2),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));this.trail.frustumCulled=false;scene.add(this.trail)}
 spawn(){const s=(OBSON?DSLOTS:SLOTS)[this.i],k=this.team?-1:1;this.hd=null;this.flipT=0;this.p.set(s[0]*k,s[1],s[2]*k);this.v.set(0,0,0);this.w.set(0,0,0);this.wt.set(0,0,0);this.q.setFromAxisAngle(UP,this.team?Math.PI:0);
  this.boost=START;this.dead=0;this.hp=100;this.firing=false;this.thr=this.ms=HOV;this.gt=0;for(let j=0;j<TN;j++)this.p.toArray(this.tp,j*3);this.mesh.visible=true}
 dispose(){scene.remove(this.mesh,this.trail)}
 // flight physics is the engine's Quad; the League adds the boost kick feel and the bump sound for your own quad
 onBoost(){if(this===player){shake=Math.max(shake,.25);noise(.35,140,.5);tone(110,320,.3,.12,'sawtooth')}}
 step(dt){const hit=super.step(dt);if(this===player&&hit>10)noise(.16,280,cl(hit/90,0,.25),.7);return hit}}
const _qb=new QT(),_lb=new V3(),_f=new V3();
// ball vs the drone's box (props included): contact normal from the closest point on the box
function ballBox(a,out){const l=_lb.subVectors(ball.p,a.p);if(l.lengthSq()>(BR+2)**2)return false;l.applyQuaternion(_qb.copy(a.q).invert());
 out.set(l.x-cl(l.x,-BBX[0],BBX[0]),l.y-cl(l.y,-BBX[1],BBX[1]),l.z-cl(l.z,-BBX[2],BBX[2]));let d=out.length();
 if(d<1e-4){d=0;out.copy(l);if(out.lengthSq()<1e-6)out.set(0,1,0);out.normalize()}else out.divideScalar(d);if(d>=BR)return false;ballBox.pen=BR-d;out.applyQuaternion(a.q);return true}

// ---------- bots ----------
const PDT=1/50,PRED=Array.from({length:200},()=>new V3()),_bp=new V3(),_bv=new V3();
function predict(){_bp.copy(ball.p);_bv.copy(ball.v);for(const P of PRED){ballPhys(_bp,_bv,PDT);P.copy(_bp)}}
const _a=new V3(),_b=new V3(),_T=new V3(),_ip=new V3(),_aim=new V3(),_dir=new V3(),_lat=new V3(),_t=new V3();
function intercept(d,D){const acc=BTHR*D.thr*.6,vm=D.vmax*BOTV;
 for(let i=0;i<PRED.length;i+=2){const P=PRED[i],t=(i+1)*PDT;_a.subVectors(P,d.p);const dist=_a.length(),v0=dist>0?d.v.dot(_a)/dist:0;
  const tr=(dist/vm+Math.max(0,vm-v0)/acc*.5)*D.slack+.12;if(tr<=t)return P}return PRED[PRED.length-1]}
function threat(team){const oz=team?-1:1;for(let i=0;i<125;i+=4){const P=PRED[i];if(P.z*oz>HL-1&&Math.abs(P.x)<GW/2+2&&P.y<GH+2)return true}return false}
function think(d,D){const ai=d.ai,was=ai.strike;ai.strike=false;const s=d.team?1:-1,ownZ=-s*HL;let role=d.role;
 if(Math.random()<.35)ai.nz.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(D.noise);
 const danger=threat(d.team),near=Math.abs(ball.p.z-ownZ)<30;
 if(role==='keep'&&(danger||near))role='attack';
 if(role==='mid'){if(danger)role='keep';else if(SB()&&d.boost<35&&d.p.distanceTo(ball.p)>30)role='boost'}
 if(role==='attack'){const ip=_ip.copy(intercept(d,D)).add(ai.nz);
  _aim.set(cl(ip.x*.4,-GW/2+4,GW/2-4),cl(ip.y*.5+2,3,GH-3),s*(HL+4));const dir=_dir.subVectors(_aim,ip).normalize();
  const toB=_a.subVectors(ip,d.p),dist=toB.length();toB.divideScalar(dist||1);const al=toB.dot(dir);
  ai.strike=al>(was?.15:.6)||dist<BR+3;
  if(ai.strike){ai.tv.copy(dir).multiplyScalar(-.6);ai.tg.copy(ip).add(ai.tv)}
  else{ai.tg.copy(ip).addScaledVector(dir,-(10+8*(1-al)));const lat=_lat.crossVectors(dir,UP);if(lat.lengthSq()<.01)lat.set(1,0,0);lat.normalize();
   ai.tg.addScaledVector(lat,(Math.sign(lat.dot(_t.subVectors(d.p,ip)))||1)*(1-al)*6);if(al<0)ai.tg.y=Math.max(ai.tg.y,ip.y+4);ai.tv.copy(ball.v).multiplyScalar(.5)}
  ai.look.copy(ip)}
 else if(role==='keep'){const to=_a.set(ball.p.x,0,ball.p.z-ownZ).normalize();ai.tg.set(0,0,ownZ).addScaledVector(to,6);ai.tg.x=cl(ball.p.x*.35,-GW/2+2,GW/2-2);ai.tg.y=cl(ball.p.y*.6,3,GH-2);ai.tv.set(0,0,0);ai.look.copy(ball.p)}
 else if(role==='mid'){ai.tg.lerpVectors(ball.p,_a.set(0,6,ownZ),.45);ai.tg.x+=(ball.p.x>0?-1:1)*10;ai.tg.y=cl(ai.tg.y,5,14);ai.tv.copy(ball.v).multiplyScalar(.3);ai.look.copy(ball.p)}
 else{let best=null,bd=1e9;for(const p of ORBS)if(p.cd<=0){const dd=p.p.distanceToSquared(d.p)*(p.big?.5:1);if(dd<bd){bd=dd;best=p}}
  if(best){ai.tg.copy(best.p);ai.tv.set(0,0,0);ai.look.copy(best.p)}}
 const inMouth=Math.abs(ai.tg.x)<GW/2-2&&ai.tg.y<GH-2;ai.tg.x=cl(ai.tg.x,-HW+2.5,HW-2.5);ai.tg.y=cl(ai.tg.y,1.6,H-3);ai.tg.z=cl(ai.tg.z,-(inMouth?HL+GD-2:HL-2.5),inMouth?HL+GD-2:HL-2.5);const sd=sdf(ai.tg.x,ai.tg.y,ai.tg.z);if(sd>-3){sdN(ai.tg,_lat);ai.tg.addScaledVector(_lat,-(sd+3))}}
function botControl(d,dt){const D=DIFF[S.diff],ai=d.ai;if((ai.t-=dt)<=0){ai.t=D.react*(.7+Math.random()*.6);think(d,D)}
 const vd=ai.strike?_b.copy(ball.p).addScaledVector(ball.v,.1).add(ai.tv).sub(d.p).setLength(D.vmax*BOTV*.8):_b.subVectors(ai.tg,d.p).multiplyScalar(D.kp).add(ai.tv).clampLength(0,D.vmax*BOTV),a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);
 if(d.p.y<1.6&&d.v.y<0)a.y+=-d.v.y*2+(1.6-d.p.y)*8;if(d.p.y>H-4&&d.v.y>0)a.y-=d.v.y*2;
 const lim=Math.min(1,D.thr*BOTV),cap=BTHR*lim+(SB()&&d.boost>5?BOOST:0);if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(d.v,DL+DQ*d.v.length());const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(d.q).dot(T);let thr=need/THR;d.boosting=SB()&&thr>1.02&&al>.9&&d.boost>3;if(d.boosting)thr=(need-BOOST)/THR;thr=Math.max(thr,0)**(1/TE);
 d.thr=cl(thr,0,lim)*cl((al-.1)/.6,.05,1);
 const look=_f.subVectors(ai.look,d.p);look.y=0;if(look.lengthSq()<1)look.set(0,0,d.team?1:-1);look.normalize();attitude(d,T,look,D.att,D.rate,.6)}
function assignRoles(){for(const t of[0,1]){const s=t?1:-1,ms=drones.filter(d=>d.team===t&&d.dead<=0);if(!ms.length)continue;
 const sc=d=>d.p.distanceTo(ball.p)/30+((d.p.z-ball.p.z)*s>0?1.2:0);ms.sort((a,b)=>sc(a)-sc(b));ms[0].role='attack';
 const rest=ms.slice(1).sort((a,b)=>Math.abs(a.p.z+s*HL)-Math.abs(b.p.z+s*HL));rest.forEach((d,i)=>d.role=i===0?'keep':'mid')}}

// ---------- dogfight mode: guns, obstacles, ground turrets, dogfighting bots (same flight model and arena) ----------
let GM=S.game==='df'?'df':'league';
// ground targets: 6 turrets per team on its own half; they need line of sight and reach 200 m
const TUR=[],TUR_HP=60;{const rnd=seeded(11),base=new THREE.CylinderGeometry(2.2,2.8,1.6,16),dome=new THREE.SphereGeometry(1.7,16,10,0,Math.PI*2,0,Math.PI/2),
 barrel=new THREE.CylinderGeometry(.22,.22,3.2,8).rotateX(Math.PI/2).translate(0,0,-1.8),mB=new THREE.MeshStandardMaterial({color:0x2a2f38,roughness:.5,metalness:.6});
 for(let i=0;i<6;i++){let x,z,n=0;do{x=(rnd()-.5)*(DW-420);z=120+rnd()*(DHL-330)}while((sdDF(x,dfH(x,z)+2,z)>-4||Math.abs(x-cxR(z))<45||TUR.some(t=>Math.hypot(t.p.x-x,t.p.z-z)<90))&&++n<80);
  const y=dfH(x,z);for(const t of[0,1]){const s=t?-1:1,g=new THREE.Group(),b=new THREE.Mesh(base,mB),head=new THREE.Group(),d=new THREE.Mesh(dome,MAT.team[t]),br=new THREE.Mesh(barrel,mB);
   g.position.set(s*x,y,s*z);b.position.y=.8;head.position.y=1.6;br.position.y=.9;head.add(d,br);g.add(b,head);g.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true});dfG.add(g);
   TUR.push({isTurret:true,t,team:t,p:new V3(s*x,y+2.2,s*z),hp:TUR_HP,cd:1,re:0,g,head,br,aim:new V3(0,0,-1),tg:null,scan:0})}}}
// boost orbs move out across the map in Dogfight (only shown when Super boost is on)
const DORB=[];{const rnd=seeded(5);for(let i=0;DORB.length<ORBS.length&&i<400;i++){const x=(rnd()-.5)*(DW-360),z=(rnd()-.5)*(DLEN-360),y=dfH(x,z)+14+rnd()*30;if(sdDF(x,y,z)<-6)DORB.push(new V3(x,y,z),new V3(-x,y,-z))}}
ORBS.forEach((o,i)=>{o.p0=o.p.clone();o.dp=DORB[i]||o.p0});
// bullets: pooled tracers drawn as additive line segments
const BN=600,BUL=Array.from({length:BN},()=>({p:new V3(),v:new V3(),life:0,team:0,real:false,by:null,dmg:0,col:0})),bPos=new Float32Array(BN*6),bCol=new Float32Array(BN*6);let bi=0;
const bGeo=new THREE.BufferGeometry();bGeo.setAttribute('position',new THREE.BufferAttribute(bPos,3));bGeo.setAttribute('color',new THREE.BufferAttribute(bCol,3));
{const l=new THREE.LineSegments(bGeo,new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));l.frustumCulled=false;scene.add(l)}
const BSTR=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1).translate(0,0,-.5),new THREE.MeshBasicMaterial({toneMapped:false,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}),BN);BSTR.frustumCulled=false;BSTR.count=0;BSTR.setColorAt(0,new THREE.Color());scene.add(BSTR);
const BSPD=400,FIRE_HZ=12,BCOL=[0x7cc4ff,0xffa060,0xff4040].map(c=>new THREE.Color(c).multiplyScalar(4)),_gd=new V3(),_gp=new V3(),_gq=new V3();
// line of sight: sphere-trace the segment through the map (cover blocks bots and turrets as well as bullets)
function los(a,b){_gq.subVectors(b,a);const L=_gq.length();if(L<1)return true;_gq.divideScalar(L);let t=2;
 for(let i=0;i<70&&t<L-2;i++){const x=a.x+_gq.x*t,y=a.y+_gq.y*t,z=a.z+_gq.z*t,d=sdf(x,y,z);if(d>-.3)return false;t+=Math.max(-d,1)}return t>=L-2}
const gunDir=(d,tilt,out)=>out.set(0,Math.sin(tilt),-Math.cos(tilt)).applyQuaternion(d.q);  // the FPV camera axis (body forward tilted up by the camera uptilt)
function shoot(p,dir,v,team,real,by,dmg,spread,spd){const b=BUL[bi++%BN];b.p.copy(p);b.v.copy(dir);b.v.x+=(Math.random()-.5)*spread;b.v.y+=(Math.random()-.5)*spread;b.v.z+=(Math.random()-.5)*spread;
 b.v.setLength(spd);if(v)b.v.add(v);b.life=spd>200?.95:1.6;b.dist=0;b.team=team;b.real=real;b.by=by;b.dmg=dmg;b.col=by?.isTurret?2:team}
function droneFire(d,dt,real){d.fcd-=dt;if(!d.firing||d.dead>0||d.fcd>0)return;d.fcd=1/FIRE_HZ;const dir=gunDir(d,(d===player?S.tilt:d.tilt??30)*Math.PI/180,_gd);
 // twin guns under the frame, alternating left/right, converging on the crosshair 150 m out (keeps the muzzle out of the FPV view)
 d.gs=-(d.gs||1);const mz=_gp.set(d.gs*.4,-.55,-.3).applyQuaternion(d.q).add(d.p),aimP=_gq.copy(d.p).addScaledVector(dir,150);dir.subVectors(aimP,mz).normalize();
 shoot(mz,dir,d.v,d.team,real,d,8,d.bot?DIFF[S.diff].noise*.012+.006:.006,BSPD);const k=near(d.p);if(k>.05)noise(.05,1800,.1*k,2)}
function segHit(a,b,c,r){_gq.subVectors(b,a);const l2=_gq.lengthSq(),t=l2?cl(_gq.dot(_v.subVectors(c,a))/l2,0,1):0;return _v.copy(a).addScaledVector(_gq,t).distanceToSquared(c)<r*r}
function bullets(dt){for(const b of BUL){if(b.life<=0)continue;b.life-=dt;b.dist+=b.v.length()*dt;const p0=_gp.copy(b.p);b.p.addScaledVector(b.v,dt);
 for(const d of drones){if(d.dead>0||d.team===b.team||d===b.by)continue;if(segHit(p0,b.p,d.p,2)){b.life=0;emit(b.p,COL[d.team],10,8,.4);if(b.real)hitDrone(d,b.dmg,b.by);break}}
 if(b.life>0)for(const t of TUR){if(t.re>0||t.t===b.team)continue;if(segHit(p0,b.p,t.p,2.6)){b.life=0;emit(b.p,0xffc640,10,8,.4);if(b.real)hitTurret(t,b.dmg,b.by);break}}
 if(b.life>0&&sdf(b.p.x,b.p.y,b.p.z)>0){emit(b.p,0xffd0a0,4,6,.3);b.life=0}}}
function turrets(dt){const A=auth(),live=state==='play';for(const t of TUR){if(t.re>0){if(A&&(t.re-=dt)<=0)t.hp=TUR_HP;continue}
 if((t.scan-=dt)<=0){t.scan=.3+Math.random()*.1;let bd=200*200;t.tg=null;for(const d of drones)if(d.dead<=0&&d.team!==t.t){const q=d.p.distanceToSquared(t.p);if(q<bd&&los(_gp.copy(t.p).setY(t.p.y+2),d.p)){bd=q;t.tg=d}}}
 const best=t.tg;if(!best||best.dead>0)continue;const bd=best.p.distanceToSquared(t.p);
 t.aim.copy(best.p).addScaledVector(best.v,Math.sqrt(bd)/160*.8).sub(t.p).normalize();if(live&&(t.cd-=dt)<=0){t.cd=1.4;shoot(_gq.copy(t.p).addScaledVector(t.aim,3).setY(t.p.y+1),t.aim,null,t.t,A,t,5,.09,160)}}}
const keyOf=o=>o.isTurret?'t'+TUR.indexOf(o):o.key,objOf=k=>typeof k!=='string'?null:k[0]==='t'?TUR[+k.slice(1)]:drones.find(x=>x.key===k);
const who=o=>o?.isTurret?`<span class="${o.t?'co':'cb'}">${TEAM[o.t]} turret</span>`:o?tag(o):'Someone';
function hitMark(){const x=$('xh');x.classList.add('hit');clearTimeout(hitMark.t);hitMark.t=setTimeout(()=>x.classList.remove('hit'),130);tone(1500,900,.05,.05,'square')}
function hurt(){const h=$('hurt');h.style.transition='none';h.style.opacity=.5;requestAnimationFrame(()=>{h.style.transition='opacity .5s';h.style.opacity=0});noise(.12,300,.25)}
function boom(o){const p=o.p;emit(p,o.isTurret?0xffc640:COL[o.team],o.isTurret?220:160,30,1.2);emit(p,0xff6a20,90,20,1);shake=Math.max(shake,near(p)*.9);noise(.7,180,.8*near(p))}
// damage: offline and on the host it applies directly; a joining pilot reports their own hits to the host (sequence-numbered, like ball hits)
function hitDrone(d,dmg,by){if(d.lock>performance.now())return;if(by===player)hitMark();if(net&&!net.host){if(by===player)net.hits.push([++net.hseq,d.key,dmg]);return}
 d.hp-=dmg;if(d===player)hurt();if(d.hp<=0)kill(d,by)}
function hitTurret(t,dmg,by){if(by===player)hitMark();if(net&&!net.host){if(by===player)net.hits.push([++net.hseq,keyOf(t),dmg]);return}
 if((t.hp-=dmg)<=0){t.re=25;boom(t);scored(by,t)}}
function kill(d,by){d.hp=100;d.life++;d.lock=performance.now()+800;if(!d.remote){boom(d);d.dead=3;d.mesh.visible=false}scored(by,d)}
function scored(by,v){const bt=by?.isTurret?by.t:by?.team;if(state==='play'&&bt!=null&&bt!==(v.isTurret?v.t:v.team))score[bt]++;
 if(!demo)feed(`${who(by)} ${v.isTurret?'destroyed':'shot down'} ${who(v)}`);if(net?.host)net.kf.push([++net.kfId,by?keyOf(by):'',keyOf(v)]),net.kf.splice(0,net.kf.length-6);
 if(overtime&&auth()&&state==='play')endMatch()}
function applyHit(k,dmg,by){const o=objOf(k);if(!o||!by||o.team===by.team)return;if(o.isTurret){if(o.re<=0)hitTurret(o,dmg,by)}else if(o.dead<=0)hitDrone(o,dmg,by)}
const aimOk=(d,p,f,deg,r=260)=>{_gq.subVectors(p,d.p);const l=_gq.length();return l<r&&_gq.dot(f)/l>Math.cos(deg*Math.PI/180)};
function fireIn(d){if(fireBtnIn())return true;
 if(!S.afire)return false;const f=gunDir(d,S.tilt*Math.PI/180,_gd);return drones.some(e=>e.dead<=0&&e.team!==d.team&&aimOk(d,e.p,f,3.5))||TUR.some(t=>t.re<=0&&t.t!==d.team&&aimOk(d,t.p,f,4))}
// dogfighting bot: pick a target (nearest enemy drone, weighted to what's in front; else an enemy turret), sit ~40 m off its lead point, fire when the camera axis is on it
function dfBot(d,dt){const D=DIFF[S.diff],ai=d.ai;
 if((ai.t-=dt)<=0){ai.t=D.react*(.7+Math.random()*.6);let best=null,bs=1e9;const f=gunDir(d,.52,_gd);
  const vis=o=>o.p.distanceToSquared(d.p)<350*350&&los(d.p,o.p);  // targets behind cover score worse, so bots go for what they can see
  for(const e of drones)if(e.dead<=0&&e.team!==d.team){_a.subVectors(e.p,d.p);const l=_a.length()||1,sc=l*(1.4-_a.dot(f)/l*.4)*(vis(e)?1:1.7);if(sc<bs){bs=sc;best=e}}
  for(const t of TUR)if(t.re<=0&&t.t!==d.team){const l=(t.p.distanceTo(d.p)*(d.i===2?.8:1.8)+30)*(vis(t)?1:1.5);if(l<bs){bs=l;best=t}}
  ai.vis=!!best&&vis(best);  // the third bot on a team leans toward ground targets
  ai.tgt=best;ai.nz.lerp(_t.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize(),.5)}
 const e=ai.tgt&&(e2=>e2.isTurret?e2.re<=0:e2.dead<=0)(ai.tgt)?ai.tgt:null,aim=_ip;let dist=1e9;
 if(e){dist=e.p.distanceTo(d.p);aim.copy(e.p).addScaledVector(ai.nz,dist*(.014+.007*D.noise));if(!e.isTurret)aim.addScaledVector(_t.subVectors(e.v,d.v),dist/BSPD);const to=_dir.subVectors(aim,d.p).normalize();
  ai.tg.copy(aim).addScaledVector(to,-(e.isTurret?55:40));ai.tg.y=Math.max(ai.tg.y,e.isTurret?e.p.y+22:6);ai.look.copy(aim)}
 else{ai.tg.set(0,60,(d.team?1:-1)*DBASE);ai.look.copy(ai.tg)}
 ai.tg.x=cl(ai.tg.x,-DHW+60,DHW-60);ai.tg.z=cl(ai.tg.z,-DHL+60,DHL-60);ai.tg.y=cl(ai.tg.y,dfH(ai.tg.x,ai.tg.z)+10,DCEIL-10);
 const vd=_b.subVectors(ai.tg,d.p).multiplyScalar(D.kp).clampLength(0,Math.max(D.vmax,dist>150?60:0)*BOTV),a=_a.subVectors(vd,d.v).multiplyScalar(D.kd);
 let s=-99;for(const k of[.5,1.1]){const la=_t.copy(d.p).addScaledVector(d.v,k),s2=sdf(la.x,la.y,la.z);s=Math.max(s,s2);if(s2>-8){sdN(la,_lat);a.addScaledVector(_lat,-(s2+8)*12/k)}}  // look-ahead obstacle and terrain avoidance
 const clr=d.p.y-dfH(d.p.x,d.p.z);if(clr<6&&d.v.y<0)a.y+=-d.v.y*2+(6-clr)*8;
 const lim=Math.min(1,D.thr*BOTV),cap=BTHR*lim+(SB()&&d.boost>5?BOOST:0);if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(d.v,DL+DQ*d.v.length());
 // in gun range: tip the quad so the uptilted camera points at the lead (an FPV attack run), keeping enough lift to hold height
 if(e&&ai.vis&&dist<200&&s<=-3&&clr>4){const g=_dir.subVectors(aim,d.p).normalize(),r=_lat.crossVectors(g,UP);if(r.lengthSq()>.01){r.normalize();const gu=_b.copy(g).multiplyScalar(.5).addScaledVector(_t.crossVectors(r,g),.866),ty=T.y;
  T.normalize().lerp(gu,(dist<140?1:.7)*cl((-s-3)/5,0,1)).normalize().multiplyScalar(cl(ty,G*.3,G*2.5)/Math.max(T.y,.35))}}
 const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(d.q).dot(T);let thr=need/THR;d.boosting=SB()&&thr>1.02&&al>.9&&d.boost>3;if(d.boosting)thr=(need-BOOST)/THR;thr=Math.max(thr,0)**(1/TE);d.thr=cl(thr,0,lim)*cl((al-.1)/.6,.05,1);
 const look=_f.subVectors(ai.look,d.p);look.y=0;if(look.lengthSq()<1)look.set(0,0,d.team?1:-1);look.normalize();const th=Math.hypot(T.x,T.z);
 if(th>.08)look.lerp(_lat.set(T.x,0,T.z).divideScalar(th),cl((th-.08)/.2,0,1)).normalize();attitude(d,T,look,D.att*.75,D.rate*.8,.6);
 // stick and throttle smoothing: a pilot's hands, not a flight computer
 const ps=ai.ps||(ai.ps={w:d.wt.clone(),t:d.thr}),k=1-Math.exp(-dt/(.06+.012*D.noise));ps.w.lerp(d.wt,k);d.wt.copy(ps.w);ps.t+=(d.thr-ps.t)*k;d.thr=ps.t;
 d.firing=!!e&&ai.vis&&state==='play'&&aimOk(d,aim,gunDir(d,.52,_gd),3+D.noise*1.5,230)}
function setGame(m){GM=m==='df'?'df':'league';OBSON=GM==='df';if(OBSON)buildDF();setMap(OBSON?'df':S.map);dfG.visible=OBSON;ORBS.forEach(o=>{o.p.copy(OBSON?o.dp:o.p0);o.g.position.copy(o.p)});goalG.visible=!OBSON;ballMesh.visible=!OBSON;BUL.forEach(b=>b.life=0);drones.forEach(d=>d.firing=false);
 $('h1o').textContent=OBSON?'DOGFIGHT':'LEAGUE';$('sub').textContent=OBSON?'Acro quad dogfighting over the Highlands: a 1.4 km valley with a river canyon, mesas, spire fields, hangars to fly through and forests to hide in. Guns on the FPV camera axis, enemy turrets on the ground, bots in the air. Most points wins.':'Rocket-powered soccer for 5-inch acro quads. Betaflight-style rates, FPV uptilt, boost orbs and bots that read the ball.';
 $('m_league').classList.toggle('on',!OBSON);$('m_df').classList.toggle('on',OBSON)}
const _bc=new THREE.Color(),_bm4=new THREE.Matrix4(),_bq=new QT(),_bz=new V3(0,0,1),_bs=new V3();
function dfDraw(now){for(const t of TUR){t.head.visible=t.re<=0;t.g.scale.y=t.re>0?.45:1;if(t.re<=0){t.head.rotation.y=Math.atan2(-t.aim.x,-t.aim.z);t.br.rotation.x=Math.asin(cl(t.aim.y,-1,1))}}
 let ns=0;const m4=_bm4,q=_bq;for(const b of BUL){if(b.life<=0)continue;_gd.copy(b.v).normalize();const w=Math.max(.06,b.p.distanceTo(camera.position)*.005),L2=Math.min(b.col===2?5:10,b.dist);
  q.setFromUnitVectors(_bz,_gd);m4.compose(b.p,q,_bs.set(w,w,L2));BSTR.setMatrixAt(ns,m4);BSTR.setColorAt(ns++,b.by===player?_bc.copy(BCOL[b.col]).multiplyScalar(cl((b.dist-4)/30,.08,1)):BCOL[b.col])}  // your own rounds fade in, so they don't glare up from under the camera
 BSTR.count=ns;BSTR.instanceMatrix.needsUpdate=true;if(BSTR.instanceColor)BSTR.instanceColor.needsUpdate=true;
 for(let i=0;i<BN;i++){const b=BUL[i],j=i*6;if(b.life<=0){if(bCol[j]||bCol[j+3]){bCol.fill(0,j,j+6);bPos.fill(0,j,j+6)}continue}const c=b.by===player?_bc.copy(BCOL[b.col]).multiplyScalar(cl((b.dist-4)/30,.08,1)):BCOL[b.col],L2=Math.min(b.col===2?2.5:5,b.dist);_gd.copy(b.v).normalize();
  bPos[j]=b.p.x;bPos[j+1]=b.p.y;bPos[j+2]=b.p.z;bPos[j+3]=b.p.x-_gd.x*L2;bPos[j+4]=b.p.y-_gd.y*L2;bPos[j+5]=b.p.z-_gd.z*L2;bCol[j]=bCol[j+3]=c.r;bCol[j+1]=bCol[j+4]=c.g;bCol[j+2]=bCol[j+5]=c.b}
 bGeo.attributes.position.needsUpdate=bGeo.attributes.color.needsUpdate=true}
// nearest living enemy drone (enemy cam and the off-screen arrow)
// joining pilot: health, deaths, turrets and the kill feed all come from the host
function dfState(g){const now=performance.now();if(g.hp&&typeof g.hp==='object')for(const k in g.hp){const d=drones.find(x=>x.key===k),v=+g.hp[k];if(!d||!Number.isFinite(v))continue;if(d===player&&v<d.hp-.5&&d.dead<=0)hurt();d.hp=v}
 if(g.lf&&typeof g.lf==='object')for(const k in g.lf){const d=drones.find(x=>x.key===k),l=g.lf[k]|0;if(!d)continue;if(d.lfSeen==null||l<d.lfSeen)d.lfSeen=l;else if(l>d.lfSeen){d.lfSeen=l;if(d===player&&d.dead<=0){boom(d);d.dead=3;d.mesh.visible=false;d.hp=100}}}
 if(Array.isArray(g.tg))g.tg.forEach((v,i)=>{const t=TUR[i];if(!t)return;if(!v&&t.re<=0)boom(t);t.re=v?0:1;t.hp=+v||0});
 if(Array.isArray(g.kf)){const first=net.kfSeen<0;for(const e of g.kf){if(!Array.isArray(e)||!(e[0]>net.kfSeen))continue;net.kfSeen=e[0];const v=objOf(e[2]);if(!first&&v)feed(`${who(objOf(e[1]))} ${v.isTurret?'destroyed':'shot down'} ${who(v)}`)}}}
function nearestFoe(me){let best=null,bd=1e9;for(const e of drones)if(e.dead<=0&&e.team!==me.team){const q=e.p.distanceToSquared(me.p);if(q<bd){bd=q;best=e}}return best}

// ---------- game state ----------
let drones=[],player=null,state='kickoff',stT=3,score=[0,0],clock=180,overtime=false,endPending=false,demo=true,paused=false,menuOpen=true,timeScale=1,shake=0,stepN=0,lastCount=0,camMode=S.cam,koN=0,goalSide=0;
let net=null,room=null,myPeer=null;
const isBot=k=>/^b[01]\d$/.test(k),auth=()=>!net||net.host,SB=()=>net&&!net.host&&net.sb!=null?net.sb:!!S.sboost,nick=()=>String(S.name||'').trim().slice(0,16)||'Pilot';
function nameOf(k,t,i){if(isBot(k))return NAMES[t][i];if(!net)return 'You';if(k===(net.host?'h':myPeer))return nick();
 const p=net.peers.find(x=>x.peer===(k==='h'?net.hostPeer:k));return String(p?.presence?.n||'Pilot').slice(0,16)}
// slots: [[keys of blue],[keys of orange]]; 'h' = host's drone, 'bTI' = bot, anything else = a peer label
function applySlots(T){const old=new Map(drones.map(d=>[d.key,d])),nd=[];player=null;
 T.forEach((arr,t)=>arr.forEach((k,i)=>{let d=old.get(k);if(d&&d.team===t&&d.i===i)old.delete(k);else d=new Drone(t,i,false,k);
  const mine=net?k===(net.host?'h':myPeer):k==='h';d.bot=isBot(k)&&auth();d.remote=!!net&&!mine&&!d.bot;d.name=nameOf(k,t,i);if(mine)player=d;nd.push(d)}));
 old.forEach(d=>d.dispose());drones=nd;if(!player&&demo)player=drones[0]}
function buildTeams(){drones.forEach(d=>d.dispose());drones=[];const n=demo?3:S.size;applySlots([0,1].map(t=>Array.from({length:demo||S.bots?n:t?0:1},(_,i)=>!demo&&!t&&!i?'h':'b'+t+i)))}
function kickoff(){koN++;state='kickoff';stT=3;lastCount=4;ball.p.set(0,BR+6,0);ball.v.set(0,0,0);ball.last=null;ballMesh.visible=!OBSON;drones.forEach(d=>{if(!d.remote)d.spawn()});ORBS.forEach(p=>p.cd=0);predict();assignRoles();
 if(OBSON){TUR.forEach(t=>{t.hp=TUR_HP;t.re=0;t.cd=1+Math.random()});BUL.forEach(b=>b.life=0)}}
const tag=d=>`<span class="${d.team?'co':'cb'}">${esc(d.name)}</span>`;
function goalFx(t,lt){shake=1.4;ballMesh.visible=false;emit(ball.p,COL[t],500,45,1.8);emit(ball.p,0xffffff,150,25,1.2);noise(1.4,300,.8*near(ball.p)+.2,.6);tone(880,180,.9,.18,'sawtooth');
 if(!demo){const d=drones.find(x=>x.key===lt);banner('GOAL!',t?'co':'cb',2.6);feed(`${d&&d.team===t?tag(d):'Own goal'} scores for ${TEAM[t]}`)}}
function goal(t){score[t]++;state='goal';stT=3.2;timeScale=net?1:.3;goalSide=t;goalFx(t,ball.last?.key);if(overtime)endPending=true}
function endFx(){const w=score[0]>score[1]?0:1;banner(`${TEAM[w]} WINS ${score[0]}–${score[1]}`,w?'co':'cb',0);tone(523,1046,.6,.2,'triangle')}
function endMatch(){state='end';stT=5;endFx()}
function demolish(v,by){v.dead=2.5;v.mesh.visible=false;emit(v.p,COL[v.team],160,30,1.2);emit(v.p,0xffc640,80,18,1);shake=Math.max(shake,near(v.p)*.8);noise(.6,200,.7*near(v.p));if(!demo)feed(`${tag(by)} demolished ${tag(v)}`)}
function startMatch(){leaveGame();audioInit({voice:true});AC?.resume();demo=false;buildTeams();score=[0,0];clock=S.len;overtime=endPending=false;kickoff();showMenu(false);$('hud').hidden=false;$('resume').hidden=false}
function startDemo(){demo=true;buildTeams();score=[0,0];kickoff();$('hud').hidden=true;$('resume').hidden=$('leave').hidden=true;banner('');showMenu(true)}
function showMenu(v){menuOpen=v;$('menu').hidden=!v;paused=v&&!demo&&!net}

// ---------- online play (room capability: host simulates ball + bots, each pilot owns their drone) ----------
const r2=v=>[+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(2)],pack=d=>[...r2(d.p),+d.q.x.toFixed(3),+d.q.y.toFixed(3),+d.q.z.toFixed(3),+d.q.w.toFixed(3),...r2(d.v)];
const okArr=(a,n)=>Array.isArray(a)&&a.length>=n&&a.slice(0,n).every(Number.isFinite);
function mpMsg(t){$('mpnote').textContent=t;if(!menuOpen)feed(esc(t))}
function hostSlots(){const hs=[{k:'h',tp:S.tp}];for(const p of[...net.peers].sort((a,b)=>a.peer<b.peer?-1:1)){if(p.sameTab||!p.presence?.n||p.presence.g)continue;hs.push({k:p.peer,tp:String(p.presence.tp)})}
 const size=Math.min(3,Math.max(S.size,Math.ceil(hs.length/2))),T=[[],[]];
 for(const h of hs){let t=h.tp==='0'?0:h.tp==='1'?1:T[0].length<=T[1].length?0:1;if(T[t].length>=size)t=1-t;if(T[t].length<size)T[t].push(h.k)}
 if(S.bots)for(const t of[0,1])for(let i=T[t].length;i<size;i++)T[t].push('b'+t+i);return T}
function setNet(d,a,now,dead,bo,fi,ti){if(!okArr(a,10))return;d.firing=!!fi&&!dead;d.tilt=Number.isFinite(+ti)?cl(+ti,0,60):30;const n=d.net||(d.net={p:new V3(),q:new QT(),v:new V3(),at:0});n.p.fromArray(a,0);n.q.fromArray(a,3).normalize();n.v.fromArray(a,7);n.at=now;
 const was=d.dead>0;d.dead=dead?1:0;d.boostOn=!!bo;d.thr=bo?1:.5;
 if(!d.seen||was&&!dead){d.seen=1;d.p.copy(n.p);d.q.copy(n.q);for(let j=0;j<TN;j++)d.p.toArray(d.tp,j*3)}
 if(!was&&dead){emit(d.p,COL[d.team],160,30,1.2);noise(.6,200,.7*near(d.p))}}
function onHostState(g,now){if(!g||typeof g!=='object')return;net.sb=g.sb==null?null:!!g.sb;if((g.m==='df')!==OBSON)setGame(g.m);if(g.tu&&typeof g.tu==='object'){const j=JSON.stringify(g.tu);if(j!==net.tuJ){net.tuJ=j;setHostTune(g.tu)}}const sj=JSON.stringify(g.sl);
 if(sj!==net.slotsJ&&Array.isArray(g.sl)&&g.sl.length===2&&g.sl.some(a=>Array.isArray(a)&&a.length)&&g.sl.every(a=>Array.isArray(a)&&a.length<=3&&a.every(k=>typeof k==='string'&&k&&k.length<48))){net.slotsJ=sj;net.slots=g.sl;applySlots(g.sl)}
 if(g.ko!==net.ko){net.ko=g.ko;player?.spawn();ball.p.set(0,BR+6,0);ball.v.set(0,0,0);ballMesh.visible=!OBSON;BUL.forEach(b=>b.life=0);lastCount=4;ORBS.forEach(p=>p.cd=0)}
 if(g.st==='goal'&&state!=='goal'){if(okArr(g.bl,3))ball.p.fromArray(g.bl);goalFx(g.gs?1:0,g.lt)}
 if(Array.isArray(g.sc))score=[g.sc[0]|0,g.sc[1]|0];
 if(g.st==='end'&&state!=='end')endFx();
 if(g.ot&&!overtime)banner('OVERTIME','',1.6);
 if(['kickoff','play','goal','end'].includes(g.st))state=g.st;stT=+g.t||0;clock=+g.ck||0;overtime=!!g.ot;
 if(g.bots&&typeof g.bots==='object')for(const k in g.bots){const d=drones.find(x=>x.key===k),a=g.bots[k];if(d&&d.remote&&Array.isArray(a))setNet(d,a,now,a[11],a[10],a[12])}
 if(OBSON)dfState(g)
 const ack=+(g.ack&&g.ack[myPeer])||0;
 if(okArr(g.bl,6)&&state!=='goal'&&(net.seq<=ack||now-net.hitT>600)){ball.v.fromArray(g.bl,3);ball.p.lerp(_t.fromArray(g.bl).addScaledVector(ball.v,.05),.5)}
 if(typeof g.lt==='string'){const d=drones.find(x=>x.key===g.lt);if(d)ball.last=d}}
function netSync(now){if(!net)return;
 for(const p of net.peers){if(p.sameTab)continue;const pr=p.presence;if(!pr||pr===net.last[p.peer])continue;net.last[p.peer]=pr;
  if(pr.g&&!net.host){net.hostPeer=p.peer;onHostState(pr.g,now)}
  const d=drones.find(x=>x.key===(pr.g?'h':p.peer));if(d&&d.remote){d.name=nameOf(d.key,d.team,d.i);setNet(d,pr.s,now,pr.d,pr.b,pr.f,pr.ti)}
  if(net.host&&OBSON&&Array.isArray(pr.hs))for(const h of pr.hs)if(Array.isArray(h)&&+h[0]>(net.hk[p.peer]||0)){net.hk[p.peer]=+h[0];if(state==='play'&&d&&d.dead<=0)applyHit(h[1],cl(+h[2]||0,0,10),d)}
  if(net.host&&pr.h&&+pr.h.s>(net.ack[p.peer]||0)){net.ack[p.peer]=+pr.h.s;if(state==='play'&&okArr(pr.h.p,3)&&okArr(pr.h.v,3)){ball.p.fromArray(pr.h.p);ball.v.fromArray(pr.h.v).clampLength(0,MAXB);if(d)ball.last=d}}}
 if(net.host){const T=hostSlots(),j=JSON.stringify(T);if(j!==net.slotsJ){net.slotsJ=j;net.slots=T;applySlots(T)}return}
 const gone=net.hostPeer?!net.peers.some(p=>p.peer===net.hostPeer):now-net.t0>8000;
 if(!gone)net.gone=0;else if(!net.gone)net.gone=now;else if(now-net.gone>3000){mpMsg(net.hostPeer?'The host left the game.':'No game found with that code.');leaveGame();startDemo()}}
function netSend(now){if(!net||now-net.sendT<33)return;net.sendT=now;const me=player,P={n:nick(),tp:S.tp};
 if(me){P.s=pack(me);P.d=me.dead>0?1:0;P.b=me.boostOn?1:0;if(OBSON){P.f=me.firing?1:0;P.ti=S.tilt}}
 if(net.host){const bots={};for(const d of drones)if(d.bot)bots[d.key]=[...pack(d),d.boostOn?1:0,d.dead>0?1:0,d.firing?1:0];
  P.g={st:state,t:+stT.toFixed(2),sc:score,ck:+clock.toFixed(1),ot:overtime?1:0,ko:koN,gs:goalSide,sl:net.slots,bl:[...r2(ball.p),...r2(ball.v)],ack:net.ack,bots,lt:ball.last?.key||null,tu:S.mod,m:GM,sb:S.sboost?1:0};
  if(OBSON){P.g.hp={};P.g.lf={};for(const d of drones){P.g.hp[d.key]=Math.round(d.hp);P.g.lf[d.key]=d.life}P.g.tg=TUR.map(t=>t.re>0?0:Math.max(1,Math.round(t.hp)));P.g.kf=net.kf}
  if(now-net.lobT>2000){net.lobT=now;room.presence({game:net.code,m:GM,host:nick(),pl:net.slots.flat().filter(k=>!isBot(k)).length,sz:net.slots[0].length}).catch(()=>{})}}
 else{if(net.hit)P.h=net.hit;if(OBSON&&net.hits.length)P.hs=net.hits.slice(-16)}
 net.r.presence(P).catch(()=>{})}
async function enterGame(code,isHost){code=String(code).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,6);if(!room||code.length<2){mpMsg('Enter a game code of 2–6 letters or digits.');return}
 audioInit({voice:true});AC?.resume();leaveGame();mpMsg(isHost?'Starting game…':`Joining ${code.toUpperCase()}…`);let r;
 try{r=await(room.p2p?room.join(code,isHost):room.join('dl-'+code))}catch(e){const c=e?.code||'error';if(isHost&&c==='taken')return enterGame(Math.random().toString(36).slice(2,6),true);mpMsg(c==='not_found'?'No game found with that code.':c==='timeout'?'Could not reach that game. Check the code and your connection.':c==='load_failed'?'Could not load the online library. Check your internet connection.':`Could not open that game (${c}). Try again.`);return}
 const n=net={r,code,host:isHost,peers:[],last:{},seq:0,hit:null,hitT:0,ack:{},slots:null,slotsJ:'',ko:-1,sendT:0,lobT:0,t0:performance.now(),hostPeer:null,gone:0,hits:[],hseq:0,hk:{},kf:[],kfId:0,kfSeen:-1};
 r.onPeers(ch=>{if(net!==n)return;n.peers=ch.peers;const me=ch.peers.find(p=>p.sameTab);if(me&&myPeer!==me.peer){myPeer=me.peer;if(!n.host&&n.slots)applySlots(n.slots)}},
  e=>{if(net===n){mpMsg(e.code==='host_left'?'The host left the game.':`Lost connection to the game (${e.code}).`);leaveGame();startDemo()}});
 r.presence({n:nick(),tp:S.tp}).catch(()=>{});
 demo=false;drones.forEach(d=>d.dispose());drones=[];player=null;score=[0,0];clock=S.len;overtime=endPending=false;
 if(isHost){n.slots=hostSlots();n.slotsJ=JSON.stringify(n.slots);applySlots(n.slots);kickoff();if(room.p2p){try{history.replaceState(null,'','#'+code)}catch(e){}mpMsg(`Hosting game ${code.toUpperCase()}. Friends open this page, type ${code.toUpperCase()} and press Join (or use this page link, it now ends in #${code}).`)}else mpMsg(`Hosting game ${code.toUpperCase()}. Friends who can open this page join from the menu.`)}
 else{state='wait';banner('Joining…','',2)}
 showMenu(false);$('hud').hidden=false;$('resume').hidden=$('leave').hidden=false;paused=false}
function leaveGame(){if(!net)return;const r=net.r;net=null;if(hostTune)setHostTune(null);r.leave().catch(()=>{});room?.presence({game:null,m:null,host:null,pl:null,sz:null}).catch(()=>{});$('leave').hidden=true;if((S.game==='df')!==OBSON)setGame(S.game)}

function step(dt){const A=auth();
 if(state==='kickoff'){stT-=dt;const n=Math.ceil(stT);if(n!==lastCount){lastCount=n;if(!demo){if(n>0){banner(n,'',.9);tone(660,660,.12,.12,'square')}else{banner('GO!','',.6);tone(990,990,.25,.15,'square')}}}if(A&&stT<=0)state='play'}
 else if(state==='goal'){stT-=dt;if(stT<2.4)timeScale=1;if(A&&stT<=0){if(endPending)endMatch();else kickoff()}}
 else if(state==='end'){stT-=dt;if(A&&stT<=0){banner('');if(net){score=[0,0];clock=S.len;overtime=endPending=false;kickoff()}else{startDemo();return}}}
 else if(state==='play'&&!demo&&A){if(!overtime){clock-=dt;if(clock<=0){clock=0;if(score[0]===score[1]){overtime=true;banner('OVERTIME','',1.6)}else endMatch()}}else clock+=dt}
 const frozen=state==='kickoff',live=state==='play'||state==='kickoff';
 for(const d of drones){if(d.remote)continue;if(d.dead>0){if((d.dead-=dt)<=0)d.spawn();continue}
  if(d.bot)(OBSON?dfBot:botControl)(d,dt);else{humanControl(d,dt,{sb:SB(),menu:menuOpen});if(OBSON)d.firing=!menuOpen&&state==='play'&&fireIn(d)}if(frozen)continue;d.step(dt);if(OBSON)droneFire(d,dt,A||d===player);
  if(SB())for(const p of ORBS)if(p.cd<=0&&d.boost<100&&d.p.distanceTo(p.p)<(p.big?2.6:1.8)+DRAD+1){d.boost=Math.min(100,d.boost+(p.big?PBG:PSM));p.cd=p.big?10:4;emit(p.p,0xffc640,p.big?60:24,p.big?14:9,.6);if(d===player)tone(700,1400,.15,.08)}}
 for(const p of ORBS)p.cd-=dt;
 if(OBSON){for(const d of drones)if(d.remote)droneFire(d,dt,false);bullets(dt);turrets(dt)}
 if(!frozen&&live&&!OBSON){const hit=ballPhys(ball.p,ball.v,dt);if(hit>4)noise(.1,900,cl(hit/50,0,.3)*near(ball.p))}
 if(!frozen)for(let i=0;i<drones.length;i++){const a=drones[i];if(a.dead>0)continue;
  if(live&&!a.remote&&!OBSON&&ballBox(a,_v)){const n=_v,pen=ballBox.pen,ib=1/BM,id=1;ball.p.addScaledVector(n,pen*ib/(ib+id));a.p.addScaledVector(n,-pen*id/(ib+id));
   const rv=_w.subVectors(ball.v,a.v).dot(n);if(rv<0){const hk=cl((-rv-6)/30,0,1),j=-(1+TB+(.6-TB)*hk)*rv/(ib+id);ball.v.addScaledVector(n,j*ib*KICK);a.v.addScaledVector(n,-j*id);
    // Rocket League-style extra push along drone->ball (vertical softened), leaning toward where the quad is flying
    const aim=_ip.subVectors(ball.p,a.p);aim.y*=.7;aim.normalize();const sp=a.v.length();if(sp>3)aim.addScaledVector(_lat.copy(a.v).divideScalar(sp),.5).normalize();ball.v.addScaledVector(aim,Math.min(14,-rv*.3)*hk*KICK);
    const gr=(1-hk)*.35;_t.subVectors(ball.v,a.v);_t.addScaledVector(n,-_t.dot(n));ball.v.addScaledVector(_t,-gr);ball.last=a;
    if(net&&!net.host&&a===player){net.hit={s:++net.seq,p:r2(ball.p),v:r2(ball.v)};net.hitT=performance.now()}
    if(-rv>6){noise(.18,700+(-rv)*15,cl(-rv/35,0,.7)*near(ball.p));tone(240,90,.12,cl(-rv/120,0,.25)*near(ball.p));emit(ball.p.clone().addScaledVector(n,-BR),0x9fe8ff,cl(-rv,4,30)|0,10,.5)}}}
  for(let k=i+1;k<drones.length;k++){const b=drones[k];if(b.dead>0||a.remote&&b.remote)continue;const n=_v.subVectors(b.p,a.p),dist=n.length();if(dist>=2*DRAD||dist<1e-4)continue;n.divideScalar(dist);
   const o=2*DRAD-dist,wa=a.remote?0:b.remote?1:.5;a.p.addScaledVector(n,-o*wa);b.p.addScaledVector(n,o*(1-wa));const rv=_w.subVectors(b.v,a.v).dot(n);if(rv>=0)continue;
   if(-rv>DEMO&&a.team!==b.team&&live&&!OBSON){const as=a.v.dot(n),bs=-b.v.dot(n),[vic,by]=as>bs?[b,a]:[a,b];if(!vic.remote)demolish(vic,by)}
   else{const j=-1.5*rv/2;if(!a.remote)a.v.addScaledVector(n,-j);if(!b.remote)b.v.addScaledVector(n,j)}}}
 if(A&&state==='play'&&!OBSON){if(ball.p.z<-(HL+BR))goal(0);else if(ball.p.z>HL+BR)goal(1)}
 if(A&&!OBSON){if(++stepN%4===0)predict();if(stepN%45===0)assignRoles()}}

// ---------- camera ----------
const camPos=new V3(0,20,60),camFwd=new V3(0,0,-1),_cp=new V3();let bfov=0;
function updateCam(dt,now){const me=player;bfov+=((me?.boostOn?14:0)-bfov)*Math.min(1,dt*(me?.boostOn?10:4));
 if(menuOpen&&demo&&OBSON||!me&&OBSON){const t=now*3e-5;camPos.set(Math.sin(t)*300,150+Math.sin(t*1.7)*25,Math.cos(t)*400);camera.position.copy(camPos);camera.lookAt(0,20,0);setFov(55,false);return}
 if(menuOpen&&demo||!me){const t=now*4e-5;camPos.set(Math.sin(t)*W*.85,45+Math.sin(t*1.7)*10,Math.cos(t)*L*.75);camera.position.copy(camPos);camera.lookAt(ball.p.x*.5,6,ball.p.z*.5);setFov(55,false);return}
 const fpv=camMode===0&&me.dead<=0;me.mesh.visible=!fpv&&me.dead<=0;me.mark.visible=!fpv;
 if(fpv)fpvCam(me,bfov);
 else{const f=_f.set(0,0,-1).applyQuaternion(me.q);f.y=0;if(f.lengthSq()<.05)f.copy(me.v).setY(0);if(f.lengthSq()<.01)f.copy(camFwd);f.normalize();
  const foc=OBSON?nearestFoe(me)?.p||_ip.set(0,10,0):ball.p;if(camMode===2||me.dead>0)f.subVectors(foc,me.p).setY(0).normalize();if(f.lengthSq()<.5)f.copy(camFwd);camFwd.lerp(f,1-Math.exp(-dt*5)).normalize();
  _cp.copy(me.p).addScaledVector(camFwd,-10).add(_t.set(0,3.6,0));if(OBSON){_cp.x=cl(_cp.x,-DHW+1,DHW-1);_cp.z=cl(_cp.z,-DHL+1,DHL-1);_cp.y=cl(_cp.y,dfH(_cp.x,_cp.z)+1.5,DCEIL-1)}else{_cp.x=cl(_cp.x,-HW+1,HW-1);_cp.y=cl(_cp.y,.8,H-1);_cp.z=cl(_cp.z,-HL-GD+1,HL+GD-1)}
  camPos.lerp(_cp,1-Math.exp(-dt*9));camera.position.copy(camPos);camera.lookAt(camMode===2||me.dead>0?foc:_t.copy(me.p).addScaledVector(camFwd,8).setY(me.p.y+1));setFov(100+bfov)}
 if(OBSON){sun.target.position.set(camera.position.x,0,camera.position.z);sun.position.copy(sun.target.position).add(LOOKS.df.sp)}
 if(shake>.01){camera.position.add(_t.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(shake*.7*SHK));shake*=Math.exp(-dt*4)}}

// ---------- HUD ----------
const rc=$('radar').getContext('2d');
function radar(){const w=110,h=170,sx=OBSON?w/DW:w/(W+8),sz=OBSON?(h-4)/DLEN:(h-6)/(L+2*GD),X=x=>w/2+x*sx,Z=z=>h/2+z*sz;rc.clearRect(0,0,w,h);
 rc.globalAlpha=.55;if(!OBSON){rc.fillStyle=CSS[1];rc.fillRect(X(-GW/2),Z(-HL-GD),GW*sx,GD*sz);rc.fillStyle=CSS[0];rc.fillRect(X(-GW/2),Z(HL),GW*sx,GD*sz)}else{rc.strokeStyle='rgba(90,170,220,.8)';rc.lineWidth=3;rc.beginPath();for(let z=-DHL;z<=DHL;z+=20)rc.lineTo(X(cxR(z)),Z(z));rc.stroke();rc.fillStyle='rgba(170,185,205,.6)';
  for(const o of OBS){if(o.t==='tree'||o.t==='rock')continue;rc.beginPath();if(o.t==='box'||o.t==='hang')rc.rect(X(o.x-o.hx),Z(o.z-o.hz),Math.max(2,o.hx*2*sx),Math.max(2,o.hz*2*sz));else rc.arc(X(o.x),Z(o.z),Math.max(1.2,(o.t==='ring'?o.R:o.r)*sx),0,7);rc.fill()}
  rc.globalAlpha=1;for(const t of TUR)if(t.re<=0){rc.fillStyle=CSS[t.t];rc.fillRect(X(t.p.x)-2.5,Z(t.p.z)-2.5,5,5)}}rc.globalAlpha=1;
 rc.strokeStyle='rgba(170,195,255,.55)';rc.lineWidth=1;if(OBSON)rc.strokeRect(X(-DHW),Z(-DHL),DW*sx,DLEN*sz);else{rc.strokeRect(X(-HW),Z(-HL),W*sx,L*sz);rc.beginPath();rc.moveTo(X(-HW),Z(0));rc.lineTo(X(HW),Z(0));rc.stroke()}
 for(const d of drones){if(d.dead>0)continue;rc.fillStyle=CSS[d.team];if(d===player){const f=_f.set(0,0,-1).applyQuaternion(d.q),a=Math.atan2(f.x,-f.z);rc.save();rc.translate(X(d.p.x),Z(d.p.z));rc.rotate(a);rc.beginPath();rc.moveTo(0,-7);rc.lineTo(5,5);rc.lineTo(-5,5);rc.closePath();rc.fill();rc.strokeStyle='#fff';rc.stroke();rc.restore()}
  else{rc.beginPath();rc.arc(X(d.p.x),Z(d.p.z),3.2,0,7);rc.fill()}}
 if(OBSON)return;rc.fillStyle='#fff';rc.shadowColor='#9fe8ff';rc.shadowBlur=6;rc.beginPath();rc.arc(X(ball.p.x),Z(ball.p.z),3.6,0,7);rc.fill();rc.shadowBlur=0}
function hud(){if(demo)return;const me=player;$('sb').textContent=score[0];$('so').textContent=score[1];$('clock').textContent=(overtime?'+':'')+fmt(clock);
 if(!me){$('osd').textContent=net?'SPECTATING · GAME '+net.code.toUpperCase():'';$('arrow').hidden=true;radar();return}
 $('osd').innerHTML=`<span><b>${S.mode==='acro'?'ACRO':'ANGLE'}</b> · ${['FPV','CHASE',OBSON?'ENEMY CAM':'BALL CAM'][camMode]} · ${net?'ONLINE '+net.code.toUpperCase():DIFF[S.diff].n.toUpperCase()}</span><span>THR ${String(Math.round(me.thr*100)).padStart(3)}%${me.boostOn?' BOOST':''}  ${String(Math.round(me.v.length()*3.6*9.81/G)).padStart(3)} km/h</span><span>ALT ${(me.p.y*9.81/G).toFixed(1)} m  ROLL ${Math.round(rate(0,1)*180/Math.PI)}°/s</span>${OBSON?`<span>HP ${Math.max(0,Math.round(me.hp))}${me.dead>0?` · RESPAWN ${me.dead.toFixed(1)}`:''}</span>`:''}`;
 $('hpw').hidden=!OBSON;if(OBSON){$('hval').textContent=Math.max(0,Math.round(me.hp));$('hpfill').style.width=cl(me.hp,0,100)+'%'}
 $('bsec').hidden=!SB();$('blbl').textContent=`BOOST · TOP ${Math.round(BZ*100)}% THR`;$('bval').textContent=Math.round(me.boost);$('boostfill').style.width=me.boost+'%';$('xh').hidden=camMode!==0||me.dead>0;
 const foe=OBSON&&nearestFoe(me);edgeArrow(OBSON?foe?.p||ball.p:ball.p,camera,OBSON?!foe:!ballMesh.visible,_t);
 radar()}

// ---------- visuals ----------
function visuals(dt,now){for(const d of drones){
  if(d.remote&&d.net){const k=1-Math.exp(-dt*18),age=Math.min((now-d.net.at)/1000,.25);d.p.lerp(_t.copy(d.net.p).addScaledVector(d.net.v,age),k);d.q.slerp(d.net.q,k);d.v.copy(d.net.v);d.mesh.visible=d.dead<=0}
  d.mesh.position.copy(d.p);d.mesh.quaternion.copy(d.q);d.mesh.scale.setScalar(.68*DRAD/.8*(OBSON&&player&&d.team!==player.team?1.6:1));const sp=(d.dead>0?0:25+d.thr*90)*dt;d.props.forEach((p,i)=>p.rotation.y+=i%3?sp:-sp);
  if(d.dead<=0){d.tp.copyWithin(3,0,(TN-1)*3);d.p.toArray(d.tp,0);d.trail.geometry.attributes.position.needsUpdate=true}
  d.trail.material.opacity=d.dead>0?0:cl((d.v.length()-45)/20,0,.85);
  if(d.boostOn&&d.dead<=0&&state!=='kickoff'){const dn=_v.set(0,-1,0).applyQuaternion(d.q);_w.copy(d.v).multiplyScalar(.4).addScaledVector(dn,22);emit(_t.copy(d.p).addScaledVector(dn,.4),Math.random()<.5?0xffc640:COL[d.team],2,4,.35,_w)}}
 ballMesh.position.copy(ball.p);const hv=Math.hypot(ball.v.x,ball.v.z);if(hv>.01){_q.setFromAxisAngle(_v.set(ball.v.z/hv,0,-ball.v.x/hv),hv*dt/BR);ballMesh.quaternion.premultiply(_q)}
 ballLight.position.copy(ball.p);ballLight.intensity=ballMesh.visible?40:0;ring.position.set(ball.p.x,.04,ball.p.z);ring.material.opacity=ballMesh.visible?cl(1-ball.p.y/30,.08,.9):0;
 for(const o of ORBS){const on=o.cd<=0;o.g.visible=SB();if(o.beam)o.beam.visible=SB()&&!OBSON;o.core.material=on?orbOn:orbOff;o.halo.visible=on;o.g.scale.setScalar(on?1:.35+.35*(1-o.cd/(o.big?10:4)));o.g.position.y=o.p.y+Math.sin(now*.002+o.p.x+o.p.z)*.35;o.core.rotation.y=now*.002;if(o.wire){o.wire.visible=on;o.wire.rotation.set(now*7e-4,now*1e-3,0)}}
 ballTick?.(now);const og=mapG[mapId];if(og)og.userData.clouds.rotation.y+=dt*.004;
 // snow lives in world space (so you fly through it) and wraps inside a 160 m box around the camera
 if(snowP.visible){const a=snowP.geometry.attributes.position,A=a.array,t=now*.001,c=camera.position,wr=(v,o)=>o+((v-o+80)%160+160)%160-80;
  for(let i=0;i<A.length;i+=3){A[i+1]-=dt*(3+(i%7));A[i]+=Math.sin(t+i)*dt*.6;A[i]=wr(A[i],c.x);A[i+1]=wr(A[i+1],c.y);A[i+2]=wr(A[i+2],c.z)}a.needsUpdate=true}
 dfDraw(now);updParts(dt);
 if(audioOn())audioTick(dt)}
// your motors, plus the nearest other quad
function audioTick(dt){const me=player;if(!motorAudio(me,dt,!demo&&!paused&&me&&me.dead<=0))return;
 let o=null,od=1e9;for(const d of drones)if(d!==me&&d.dead<=0){const q=d.p.distanceTo(camera.position);if(q<od){od=q;o=d}}quadVoice(o,od,me,camera)}

// ---------- input events ----------
function cycleCam(){camMode=(camMode+1)%3;S.cam=camMode;save()}
function togglePause(){if(demo)return;showMenu(!menuOpen)}
initInput({menu:()=>menuOpen,pause:togglePause,key:e=>{if(e.code==='KeyC')cycleCam();if(e.code==='KeyR'&&player&&player.dead<=0)player.spawn()}});
const padKeys=e=>{if(e(9))togglePause();if(!menuOpen&&!demo){if(e(4))cycleCam();if(e(3)&&player&&player.dead<=0)player.spawn()}};

// ---------- menu / settings ----------
const FIELDS=[['size','Team size','sel',[[1,'1v1'],[2,'2v2'],[3,'3v3']]],['diff','Bot skill','sel',DIFF.map((d,i)=>[i,d.n])],['bots','Bots','sel',[[1,'Fill empty spots'],[0,'No bots']]],['len','Match length','sel',[[120,'2 min'],[180,'3 min'],[300,'5 min']]],['map','Map','sel',[['arena','Neon Arena'],...Object.entries(OUT).map(([k,c])=>[k,c.name])]],['ball','Ball style','sel',BALLS],
 ...PILOT_FIELDS,['afire','Auto-fire (Dogfight)','sel',[[true,'On'],[false,'Off']]],['sboost','Super boost','sel',[[false,'Off'],[true,'On']]]];
mountPad($('pilotpad'));initMenu(FIELDS,k=>{if(k==='map'&&!OBSON)setMap(S.map);if(k==='ball')setBall(S.ball)});
syncUI();
// online lobby
function renderGames(peers){const box=$('games');box.textContent='';for(const p of peers){const pr=p.presence;if(!pr?.game||p.sameTab)continue;const code=String(pr.game).replace(/[^a-z0-9]/g,'').slice(0,6);if(!code||net?.code===code)continue;
 const b=document.createElement('button');b.className='sm';b.textContent=`Join ${String(pr.host||'Pilot').slice(0,16)} · ${pr.m==='df'?'Dogfight':'League'} · ${code.toUpperCase()} · ${Math.min(6,pr.pl|0)} pilot${(pr.pl|0)===1?'':'s'}`;b.onclick=()=>enterGame(code,false);box.append(b)}}
$('nick').value=S.name||'';$('nick').oninput=e=>{S.name=e.target.value.slice(0,16);save()};$('tpref').value=S.tp;$('tpref').onchange=e=>{S.tp=e.target.value;save()};
$('host').onclick=()=>enterGame(Math.random().toString(36).slice(2,6),true);$('join').onclick=()=>enterGame($('code').value,false);$('code').onkeydown=e=>{if(e.key==='Enter')enterGame($('code').value,false)};
function pickGame(m){if(net){mpMsg('Leave the online game to switch modes.');return}S.game=m;save();setGame(m);if(demo)startDemo();else startMatch()}
$('m_league').onclick=()=>pickGame('league');$('m_df').onclick=()=>pickGame('df');
$('play').onclick=startMatch;$('resume').onclick=()=>showMenu(false);$('leave').onclick=()=>{leaveGame();startDemo()};

// ---------- mod panel ----------
const MODS=[
 ['Drone','grav','Gravity',34.5,2,40,.5,'m/s²'],['Drone','thr','Thrust',345,20,600,5,'m/s²'],['Drone','te','Thrust curve',1.6,1,2.5,.05,'^'],['Drone','vp','Prop pitch speed',240,40,500,5,'m/s'],['Drone','maxv','Top speed',200,20,300,1,'m/s'],
 ['Drone','tau','Stick lag',4,2,60,1,'ms'],['Drone','dl','Linear drag',0.04,0,1,.01,''],['Drone','dq','Air drag',0.0039,0,.03,.0001,''],
 ['Drone','size','Drone size',0.75,.4,2.5,.05,'×'],['Drone','dbounce','Wall bounce',0.05,0,1,.05,''],['Drone','gfric','Ground grip',0.1,0,1,.02,''],['Drone','spool','Motor spool',20,0,150,5,'ms'],['Drone','turtle','Turtle rate',260,60,720,10,'°/s'],['Drone','wash','Prop wash',1.4,0,3,.1,'×'],
 ['Boost','bzone','Boost zone',5,0,30,1,'%'],['Boost','boost','Super boost',60,0,250,1,'m/s²'],['Boost','bkick','Boost kick',8,0,30,1,'m/s'],['Boost','drain','Boost drain',33,0,100,1,'/s'],['Boost','start','Kickoff boost',33,0,100,1,''],
 ['Boost','padb','Big orb refill',100,0,100,5,''],['Boost','pads','Small orb refill',20,0,100,5,''],
 ['Ball','bgrav','Ball gravity',19.5,0,30,.25,'m/s²'],['Ball','bsize','Ball radius',2.6,1,8,.1,'m'],['Ball','bbounce','Ball bounce',0.68,0,1.1,.02,''],['Ball','tbounce','Touch bounce',0.15,0,.6,.05,''],
 ['Ball','bdrag','Ball drag',0.03,0,.5,.005,''],['Ball','bmax','Ball top speed',85,20,200,1,'m/s'],['Ball','bmass','Ball weight',0.7,.1,5,.05,'×'],['Ball','kick','Hit power',1,0,4,.05,'×'],
 ['Match','demo','Demolish speed',40,10,200,1,'m/s'],['Match','speed','Game speed',1,.25,2,.05,'×'],['Match','botv','Bot thrust',1,.3,1.5,.05,'×'],
 ['Look','bloom','Glow',0.9,0,2.5,.05,''],['Look','shake','Camera shake',1,0,3,.1,'×']];
const PRESETS={'Default':{},'Moon ball':{bgrav:1.5,bbounce:.9,bdrag:.01},'Racer':{thr:430,maxv:280,dq:.0028,tau:3,spool:15},
 'Heavy metal':{grav:28,thr:170,size:1.6,bmass:2,kick:1.4,demo:30},'Arcade':{grav:10,thr:45,te:1,maxv:90,dl:.14,dq:.0065,tau:20,kick:1.8,bsize:4,speed:.85},'Giant ball':{bsize:6,bgrav:3,bmass:1.5},'Infinite boost':{drain:0,start:100},'LiftOff real-scale':{grav:9.81,thr:98,vp:68,maxv:60,dl:.04,dq:.0137}};
function migrate(MDEF){if((S.physV|0)<2){const O={thr:124,maxv:111,dl:.14,dq:.0065,spool:30};for(const k in O)if(Math.abs(S.mod[k]-O[k])<1e-9)S.mod[k]=MDEF[k];S.physV=2;save()}  // v2 flight model: move untouched old defaults to the 6S defaults
 if((S.physV|0)<3){const O={dbounce:.2,wash:1,boost:140,bgrav:5};for(const k in O)if(Math.abs(S.mod[k]-O[k])<1e-9)S.mod[k]=MDEF[k];S.physV=3;save()}}  // v3: Riley's mode is the default
function applyTune(){const T=tune();tuneFlight(T);tuneLeague(T,G,THR);bloom.strength=T.bloom*lookBK;
 ballMesh.scale.setScalar(BR/2.6);ring.scale.setScalar(BR/2.6);drones.forEach(d=>d.mesh.scale.setScalar(.68*T.size))}
$('modbtn').onclick=toggleMod;
initModPanel({mods:MODS,presets:PRESETS,migrate,onApply:applyTune});setMap(S.map);setBall(S.ball);
initRates('Drone League');initSens();

$('copyset').onclick=()=>{const o={};for(const k of['mode','diff','size','len','tilt','fov','cam','thrMode','dz','map','ball','cal','xcal','xfire','xflip','flipBtn','bots','mod','rprof','rpi'])o[k]=S[k];const t=JSON.stringify(o);
 const show=()=>{$('mod').hidden=false;tab(false);$('mio').value=t;$('mio').select();modMsg('Select and copy this text')};
 try{navigator.clipboard.writeText(t).then(()=>mpMsg('Settings copied. Paste them to Claude to make them the defaults.'),show)}catch(e){show()}};
{const m=location.hash.match(/^#([a-z0-9]{2,6})$/i);if(m)$('code').value=m[1]}

// ---------- main loop ----------
setGame(GM);startDemo();
startLoop({pre:now=>{padEdges(padKeys);netSync(now)},step,speed:()=>timeScale*GSPD,paused:()=>paused,menu:()=>menuOpen,
 draw:(dt,rdt,now)=>{visuals(dt,now);updateCam(rdt,now);hud()},post:netSend});
(async()=>{room=await getRoom();
 if(room.p2p){$('games').hidden=true;$('mpnote').textContent='Online over the internet: press Host, then send friends this page and the game code. They type the code and press Join.';return}
 $('mpnote').textContent='Host a game, or join one listed here. Bots fill empty slots unless Bots is set to No bots.';
 room.onPeers(ch=>renderGames(ch.peers),e=>{$('mpnote').textContent=`Online play is unavailable here (${e.code}).`;$('host').disabled=$('join').disabled=true})})();
