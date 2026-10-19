// Zombies defences: placement slots around the sites, the helpers bought on the base screen, and what they launch.
// A helper that commits to a track claims it (t.claim): the track turns yellow for the player; a miss or a lost helper releases it (red again).
import {KIND,RESIST,RACK_TIERS,RACK_CAP,RACK_REARM,RACK_RANGE,DRONE_SPD,DRONE_FUEL} from './zdata.js';
import {dot} from '../../engine/render.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v;
export function initDefences(api,G,Z){
 const {THREE,scene,TH,SITES,PADP,FOBS,gh}=api,V3=THREE.Vector3;
 const _a=new V3(),_b=new V3(),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_s=new V3(1,1,1),FWD=new V3(0,0,1);

 // ---------- slots: three around each site, two on the radar pad, one at each forward position ----------
 const SLOTS=[];
 for(const s of SITES)for(const[dir,dx,dz]of[['north',0,-1],['west',-1,0],['east',1,0]]){const d=s.r+22;SLOTS.push({n:`${s.n.toLowerCase()} ${dir}`,x:s.x+dx*d,z:s.z+dz*d,site:s})}
 SLOTS.push({n:'radar west',x:PADP.x-24,z:PADP.z-14},{n:'radar east',x:PADP.x+24,z:PADP.z-14});
 for(const f of FOBS)SLOTS.push({n:f.n.toLowerCase(),x:f.x-12,z:f.z+8});
 for(const s of SLOTS){s.y=gh(s.x,s.z);s.n=s.n.replace(/^./,c=>c.toUpperCase())}

 // ---------- meshes ----------
 const M={olive:new THREE.MeshStandardMaterial({color:0x4f5a35,roughness:.7,metalness:.2}),dark:new THREE.MeshStandardMaterial({color:0x22262a,roughness:.6,metalness:.4}),
  tube:new THREE.MeshStandardMaterial({color:0x6b7450,roughness:.6,metalness:.3}),ring:new THREE.MeshBasicMaterial({color:0xffe23c,transparent:true,opacity:.35,depthWrite:false})};
 function rackMesh(d){const g=new THREE.Group(),add=(geo,m,x,y,z,rx=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.rotation.x=rx;o.castShadow=true;g.add(o);return o};
  add(new THREE.BoxGeometry(2.6,.9,4.2),M.olive,0,.6,0);for(const x of[-.95,.95])for(const z of[-1.3,1.3])add(new THREE.CylinderGeometry(.38,.38,.3,12).rotateZ(Math.PI/2),M.dark,x*1.05,.38,z);
  d.cells=[];for(let i=0;i<4;i++){const c=add(new THREE.BoxGeometry(.5,1.6,.5),M.tube,-.6+(i%2)*1.2,1.85,-.6+(i>>1)*1.2);d.cells.push(c)}
  add(new THREE.BoxGeometry(.12,3,.12),M.dark,1.1,2.3,1.8);return g}
 const MESH={rack:rackMesh};

 // helper drones in flight: one instanced mesh (olive dart), plus a red nav light point each
 const DN=96,dGeo=new THREE.CylinderGeometry(.08,.07,.9,8).rotateX(Math.PI/2);
 const dMesh=new THREE.InstancedMesh(dGeo,M.olive,DN);dMesh.count=0;dMesh.frustumCulled=false;scene.add(dMesh);
 const lPos=new Float32Array(DN*3),lGeo=new THREE.BufferGeometry();lGeo.setAttribute('position',new THREE.BufferAttribute(lPos,3));
 const lights=new THREE.Points(lGeo,new THREE.PointsMaterial({size:6,sizeAttenuation:false,color:new THREE.Color(0xff6040).multiplyScalar(3),map:dot,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
 lights.frustumCulled=false;scene.add(lights);lGeo.setDrawRange(0,0);

 const D=[],drones=[];  // owned defences, drones in the air
 let did=0;
 function add(type,slot){const d={id:++did,type,slot,tier:0,cap:0,ready:0,cd:0,rearm:0,mesh:null,kills:0,shots:0};if(type==='rack'){d.cap=RACK_CAP[0];d.ready=d.cap}D.push(d);return d}
 const slotFree=i=>!D.some(d=>d.slot===i);
 // meshes appear when the next wave starts
 function deploy(){for(const h of drones)release(h);drones.length=0;for(const d of D){if(!d.mesh){const s=SLOTS[d.slot];d.mesh=MESH[d.type](d);d.mesh.position.set(s.x,s.y,s.z);d.mesh.rotation.y=Math.atan2(s.x-0,s.z+1500)+Math.PI;scene.add(d.mesh)}
  if(d.type==='rack')d.ready=d.cap,d.rearm=0}}
 function clear(){for(const d of D)if(d.mesh)scene.remove(d.mesh);D.length=0;for(const h of drones)release(h);drones.length=0;dMesh.count=0;lGeo.setDrawRange(0,0)}

 // ---------- target choice: free, in range, engageable; most urgent first; leave the player's terminal track alone ----------
 const tti=t=>Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/Math.max(1,t.spd);
 function pickTarget(type,x,z,range,tier=0){const R=RESIST[type];let best=null,bs=-1e9;const me=api.player,sel=api.selT();
  for(const t of TH){if(!api.live(t)||t.claim||!Z.seen(t))continue;const e=R[t.k]??1;if(e<=0)continue;
   if(type==='rack'&&t.k==='decoy'&&tier>=4)continue;  // Mk V seekers see through decoys
   const d=Math.hypot(t.p.x-x,t.p.z-z);if(d>range)continue;
   if(t===sel&&me&&me.dead<=0&&me.p.distanceTo(t.p)<1500)continue;
   const sc=-tti(t)+e*30+(t.mark?60:0)+(KIND[t.k].dmg>0?0:-40);if(sc>bs){bs=sc;best=t}}
  return best}
 const claim=(t,h)=>{t.claim=h;h.tgt=t};
 const release=h=>{if(h.tgt&&h.tgt.claim===h)h.tgt.claim=null;h.tgt=null};

 // ---------- racks and drones ----------
 function launchDrone(d,t){const s=SLOTS[d.slot],h={d,p:new V3(s.x,s.y+2.5,s.z),v:new V3(0,30,0),fuel:DRONE_FUEL,tgt:null,pd:1e9,lost:0,tier:d.tier};claim(t,h);drones.push(h);d.ready--;d.shots++;
  const c=d.cells?.[d.ready];if(c)c.visible=false;api.FX.emit(h.p,0xffd080,25,6,.4,null,2)}
 function rack(d,dt){if(d.ready<d.cap&&(d.rearm+=dt)>=RACK_REARM){d.rearm=0;d.ready++}
  d.cells?.forEach((c,i)=>c.visible=i<d.ready);
  if((d.cd-=dt)>0||d.ready<=0)return;const s=SLOTS[d.slot],t=pickTarget('rack',s.x,s.z,RACK_RANGE,d.tier);if(t){launchDrone(d,t);d.cd=1.2}}
 // flight: climb out, then lead steering at the claimed track with a turn-rate limit; resolve at the closest pass
 function droneStep(h,dt){h.fuel-=dt;const t=h.tgt;
  if(!t||!api.live(t)){release(h);const n=pickTarget('rack',h.p.x,h.p.z,1800,h.tier);if(n)claim(n,h);else if((h.lost+=dt)>4||h.fuel<=0)return burst(h,null)}
  if(h.fuel<=0)return burst(h,null);
  const T=h.tgt,spd=h.v.length(),ns=Math.min(DRONE_SPD,spd+35*dt);let dir=_a.copy(h.v).normalize();
  if(T){const r=_b.subVectors(T.p,h.p),dist=r.length(),tgo=dist/Math.max(40,ns+(-T.v.dot(r)/dist)),aim=r.addScaledVector(T.v,tgo).normalize();
   const climb=h.p.y-gh(h.p.x,h.p.z)<25&&h.fuel>DRONE_FUEL-3;const want=climb?_b.set(aim.x*.3,1,aim.z*.3).normalize():aim;
   const ang=Math.acos(cl(dir.dot(want),-1,1)),turn=2.6*dt;dir.lerp(want,ang>1e-4?Math.min(1,turn/ang):1).normalize();
   const d2=h.p.distanceTo(T.p);if(d2<6||(d2>h.pd&&d2<40))return burst(h,T,d2);h.pd=d2}
  h.v.copy(dir).multiplyScalar(ns);h.p.addScaledVector(h.v,dt);if(h.p.y<gh(h.p.x,h.p.z)+.5)return burst(h,null)}
 // the drone's warhead: tier hit chance x how well drones do against this kind; Mark doubles helper damage (see Z.markRoll)
 function burst(h,t){const i=drones.indexOf(h);if(i>=0)drones.splice(i,1);release(h);api.boom(h.p,.45);if(!t)return null;
  const K=KIND[t.k],T=RACK_TIERS[h.tier],eff=RESIST.rack[t.k]??1;const o=Z.helperHit(t,T.hit*eff,T.direct);
  if(o==='kill'){h.d.kills++;Z.helperKill(t)}else if(o==='damage')api.damage(t);
  if(t.k==='swarm')for(const u of TH)if(u!==t&&u.k==='swarm'&&api.live(u)&&u.p.distanceTo(h.p)<9&&Math.random()<T.hit*.6){h.d.kills++;Z.helperKill(u)}  // the burst catches swarm neighbours
  return o}

 function step(dt){for(const d of D)if(d.type==='rack')rack(d,dt);for(let i=drones.length-1;i>=0;i--)if(drones[i])droneStep(drones[i],dt)}
 function visuals(){let n=0;for(const h of drones){if(n>=DN)break;_q.setFromUnitVectors(FWD,_a.copy(h.v).normalize());_m.compose(h.p,_q,_s);dMesh.setMatrixAt(n,_m);lPos[n*3]=h.p.x;lPos[n*3+1]=h.p.y;lPos[n*3+2]=h.p.z;n++}
  dMesh.count=n;dMesh.instanceMatrix.needsUpdate=true;lGeo.attributes.position.needsUpdate=true;lGeo.setDrawRange(0,n)}
 // radar: drones as cyan dots with a thin line to their claimed track
 function radar(rc,P){rc.lineWidth=1.5;for(const h of drones){const q=P(h.p.x,h.p.z);rc.fillStyle='#5fe3ff';rc.fillRect(q[0]-3,q[1]-3,6,6);if(h.tgt){const u=P(h.tgt.p.x,h.tgt.p.z);rc.strokeStyle='rgba(255,226,60,.55)';rc.beginPath();rc.moveTo(q[0],q[1]);rc.lineTo(u[0],u[1]);rc.stroke()}}
  for(const d of D){const s=SLOTS[d.slot],q=P(s.x,s.z);rc.strokeStyle='#5fe3ff';rc.lineWidth=2;rc.strokeRect(q[0]-4,q[1]-4,8,8)}}
 return{SLOTS,D,drones,add,slotFree,deploy,clear,step,visuals,radar,launchDrone}}
