// Zombies defences: placement slots around the sites, the helpers bought on the base screen, and everything they fire.
// A helper that commits to a track claims it (t.claim): the track turns yellow for the player; a miss or a lost shot releases it (red again).
// Outcomes are game rules: each helper has a kill chance per engagement (zdata HELP / RACK_TIERS) scaled by how well it works against the kind
// (RESIST); Z.helperHit applies armor and Mark. Everything in flight is pooled and drawn instanced.
import {dot,glow} from '../../engine/render.js';
import {KIND,RESIST,RACK_TIERS,RACK_CAP,RACK_REARM,RACK_RANGE,DRONE_SPD,DRONE_FUEL,HELP} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a);
export function initDefences(api,G,Z){
 const {THREE,scene,TH,SITES,PADP,FOBS,gh}=api,V3=THREE.Vector3;
 const _a=new V3(),_b=new V3(),_c=new V3(),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_s=new V3(1,1,1),FWD=new V3(0,0,1);

 // ---------- slots: three around each site, two on the radar pad, one at each forward position ----------
 const SLOTS=[];
 for(const s of SITES)for(const[dir,dx,dz]of[['north',0,-1],['west',-1,0],['east',1,0]]){const d=s.r+22;SLOTS.push({n:`${s.n.toLowerCase()} ${dir}`,x:s.x+dx*d,z:s.z+dz*d,site:s})}
 SLOTS.push({n:'radar west',x:PADP.x-24,z:PADP.z-14},{n:'radar east',x:PADP.x+24,z:PADP.z-14});
 for(const f of FOBS)SLOTS.push({n:f.n.toLowerCase(),x:f.x-12,z:f.z+8});
 for(const s of SLOTS){s.y=gh(s.x,s.z);s.n=s.n.replace(/^./,c=>c.toUpperCase())}

 // ---------- ground meshes ----------
 const M={olive:new THREE.MeshStandardMaterial({color:0x4f5a35,roughness:.7,metalness:.2}),dark:new THREE.MeshStandardMaterial({color:0x22262a,roughness:.6,metalness:.4}),
  tube:new THREE.MeshStandardMaterial({color:0x6b7450,roughness:.6,metalness:.3}),sand:new THREE.MeshStandardMaterial({color:0x9a8d68,roughness:.9}),white:new THREE.MeshStandardMaterial({color:0xd9dcd6,roughness:.5,metalness:.2}),
  dish:new THREE.MeshStandardMaterial({color:0xe8ebee,roughness:.35,metalness:.4,side:THREE.DoubleSide}),bubble:new THREE.MeshBasicMaterial({color:0x5fe3ff,transparent:true,opacity:.07,depthWrite:false,side:THREE.DoubleSide})};
 function kit(){const g=new THREE.Group();g.add$=(geo,m,x,y,z,rx=0,ry=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.rotation.set(rx,ry,0);o.castShadow=true;g.add(o);return o};return g}
 const wheels=(g,w,l,m=M.dark)=>{for(const x of[-w,w])for(const z of[-l,0,l])g.add$(new THREE.CylinderGeometry(.45,.45,.35,12).rotateZ(Math.PI/2),m,x,.45,z)};
 const MESH={
  rack(d){const g=kit();g.add$(new THREE.BoxGeometry(2.6,.9,4.2),M.olive,0,.6,0);wheels(g,1.15,1.3);d.cells=[];for(let i=0;i<4;i++)d.cells.push(g.add$(new THREE.BoxGeometry(.5,1.6,.5),M.tube,-.6+(i%2)*1.2,1.85,-.6+(i>>1)*1.2));g.add$(new THREE.BoxGeometry(.12,3,.12),M.dark,1.1,2.3,1.8);return g},
  flak(d){const g=kit();g.add$(new THREE.CylinderGeometry(2.6,2.9,.8,16),M.sand,0,.4,0);d.aim=g.add$(new THREE.CylinderGeometry(.16,.2,2.4,10),M.dark,0,1.6,0,-.5);g.add$(new THREE.BoxGeometry(.8,.4,.8),M.dark,0,.9,0);return g},
  gepard(d){const g=kit();g.add$(new THREE.BoxGeometry(3.2,1.3,6.6),M.olive,0,1.1,0);for(const x of[-1.5,1.5])g.add$(new THREE.BoxGeometry(.4,.9,6.2),M.dark,x,.5,0);
   const t=new THREE.Group();t.position.set(0,2.3,-.4);g.add(t);d.aim=t;const add=(geo,m,x,y,z,rx=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.rotation.x=rx;o.castShadow=true;t.add(o)};
   add(new THREE.BoxGeometry(2.2,1.1,2.2),M.olive,0,0,0);for(const x of[-1.35,1.35]){add(new THREE.BoxGeometry(.5,.6,1.2),M.olive,x,.1,-.4);add(new THREE.CylinderGeometry(.06,.06,3.2,8).rotateX(Math.PI/2),M.dark,x,.15,-2.4)}
   add(new THREE.CylinderGeometry(.5,.5,.1,16),M.dark,0,1.1,.6,.4);return g},
  sam(d){const g=kit();g.add$(new THREE.BoxGeometry(2.6,1.2,7),M.olive,0,1,0);wheels(g,1.2,2.4);const r=new THREE.Group();r.position.set(0,1.7,1);r.rotation.x=-.75;g.add(r);d.aim=r;d.cells=[];
   for(let i=0;i<8;i++){const o=new THREE.Mesh(new THREE.BoxGeometry(.55,.55,4.2),M.tube);o.position.set(-.85+(i%4)*.57,(i>>2)*.6,-1.8);o.castShadow=true;r.add(o);d.cells.push(o)}return g},
  ew(d){const g=kit();g.add$(new THREE.BoxGeometry(2.4,2.2,5),M.olive,0,1.5,0);wheels(g,1.1,1.8);g.add$(new THREE.CylinderGeometry(.08,.12,9,8),M.dark,0,7,1.6);for(let i=0;i<3;i++)g.add$(new THREE.BoxGeometry(1.4,.12,.12),M.dark,0,9+i*.8,1.6,0,i);
   const b=new THREE.Mesh(new THREE.SphereGeometry(1,24,10,0,Math.PI*2,0,Math.PI/2),M.bubble);b.renderOrder=2;d.bubble=b;b.userData.free=1;return g},
  idome(d){const g=kit();for(const z of[-3,3]){const o=g.add$(new THREE.BoxGeometry(2.6,2.4,3.6),M.sand,0,1.6,z,-.5);d.cells=(d.cells||[]).concat([o])}g.add$(new THREE.BoxGeometry(3.4,.6,9),M.olive,0,.3,0);g.add$(new THREE.BoxGeometry(1.2,2.6,.2),M.white,2.6,1.6,0);return g},
  gdome(d){const g=kit();g.add$(new THREE.CylinderGeometry(2.4,2.6,1.2,20),M.white,0,.6,0);g.add$(new THREE.CylinderGeometry(.35,.35,3,10),M.white,0,2.6,0);
   const dish=new THREE.Mesh(new THREE.SphereGeometry(3.4,24,10,0,Math.PI*2,0,.9),M.dish);dish.position.set(0,6.4,0);dish.rotation.x=Math.PI;dish.castShadow=true;g.add(dish);d.aim=dish;return g}};

 // ---------- things in flight: drones, SAM / dome interceptors, space interceptors, mortar shells, tracers ----------
 // per kind: top speed, acceleration, turn rate (rad/s), climb-out, fuel (s), resolve distance (m), drawn scale
 const PK={drone:{spd:DRONE_SPD,acc:35,turn:2.6,climb:25,fuel:DRONE_FUEL,res:6,mesh:0,s:1,glow:[1,.35,.25],gs:.6},sam:{spd:650,acc:400,turn:4,climb:60,fuel:25,res:14,mesh:1,s:1,glow:[1,.8,.5],gs:1.4,smoke:1},
  tamir:{spd:900,acc:600,turn:5,climb:80,fuel:22,res:16,mesh:1,s:.8,glow:[1,.85,.55],gs:1.3,smoke:1},space:{spd:4200,acc:0,turn:8,climb:0,fuel:40,res:60,mesh:2,s:1,glow:[.8,.9,1],gs:2.2}};
 const PN=160,pGeo=[new THREE.CylinderGeometry(.08,.07,.9,8).rotateX(Math.PI/2),new THREE.CylinderGeometry(.11,.11,2.9,10).rotateX(Math.PI/2),new THREE.ConeGeometry(.5,3,10).rotateX(Math.PI/2)];
 const pMesh=[new THREE.InstancedMesh(pGeo[0],M.olive,PN),new THREE.InstancedMesh(pGeo[1],M.white,PN),new THREE.InstancedMesh(pGeo[2],glow(0xcfe3ff,4),24)];
 for(const m of pMesh){m.count=0;m.frustumCulled=false;scene.add(m)}
 const GN=PN+64,gPos=new Float32Array(GN*3),gCol=new Float32Array(GN*3),gGeo=new THREE.BufferGeometry();gGeo.setAttribute('position',new THREE.BufferAttribute(gPos,3));gGeo.setAttribute('color',new THREE.BufferAttribute(gCol,3));
 const gPts=new THREE.Points(gGeo,new THREE.PointsMaterial({size:7,sizeAttenuation:false,vertexColors:true,map:dot,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));gPts.frustumCulled=false;scene.add(gPts);gGeo.setDrawRange(0,0);
 // tracers: short bright streaks flying at shell speed
 const TN=600,tPos=new Float32Array(TN*6),tGeo=new THREE.BufferGeometry();tGeo.setAttribute('position',new THREE.BufferAttribute(tPos,3));
 const tLines=new THREE.LineSegments(tGeo,new THREE.LineBasicMaterial({color:new THREE.Color(1,.7,.3).multiplyScalar(3),transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));tLines.frustumCulled=false;scene.add(tLines);tGeo.setDrawRange(0,0);
 const tr=[];const tracer=(p,v,life)=>{if(tr.length>=TN){tr.shift()}tr.push({p:p.clone(),v:v.clone(),life})};

 const D=[],shots=[],shells=[],pend=[];  // owned defences, guided shots in the air, mortar shells, cannon bursts on their way
 let did=0,fxBudget=0;
 const L=d=>d.type==='rack'?null:HELP[d.type].lv[d.lvl],rangeOf=d=>d.type==='rack'?RACK_RANGE:(L(d).rng||HELP[d.type].rng);
 function add(type,slot){const d={id:++did,type,slot,tier:0,lvl:0,cap:0,ready:0,cd:0,rearm:0,mesh:null,kills:0,shots:0,ammo:0,jam:new Set()};if(type==='rack'){d.cap=RACK_CAP[0];d.ready=d.cap}D.push(d);return d}
 const slotFree=i=>!D.some(d=>d.slot===i);
 function remove(d){const i=D.indexOf(d);if(i<0)return;D.splice(i,1);if(d.mesh)scene.remove(d.mesh);if(d.bubble)scene.remove(d.bubble);for(const h of shots)if(h.d===d)h.fuel=0;if(d.tgt)release(d)}
 // meshes appear (and magazines refill) when the next wave starts
 function deploy(){for(const h of shots)release(h);shots.length=0;shells.length=0;tr.length=0;pend.length=0;pend.length=0;
  for(const d of D){const s=SLOTS[d.slot];if(!d.mesh){d.mesh=MESH[d.type](d);d.mesh.position.set(s.x,s.y,s.z);d.mesh.rotation.y=Math.atan2(s.x,s.z+1500)+Math.PI;scene.add(d.mesh);
    if(d.bubble){d.bubble.position.set(s.x,s.y,s.z);scene.add(d.bubble)}}
   if(d.bubble)d.bubble.scale.setScalar(rangeOf(d));
   if(d.type==='rack'){d.ready=d.cap;d.rearm=0}else d.ammo=L(d).mag||0;d.jam.clear();d.tgt=null}}
 function clear(){for(const d of D){if(d.mesh)scene.remove(d.mesh);if(d.bubble)scene.remove(d.bubble)}D.length=0;for(const h of shots)release(h);shots.length=0;shells.length=0;tr.length=0;pend.length=0;for(const m of pMesh)m.count=0;gGeo.setDrawRange(0,0);tGeo.setDrawRange(0,0)}

 // ---------- target choice: free, in range, engageable; most urgent first; marked tracks first; leave the player's terminal track alone ----------
 const tti=t=>Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/Math.max(1,t.spd);
 function pickTarget(type,x,z,range,o={}){const R=RESIST[type];let best=null,bs=-1e9;const me=api.player,sel=api.selT();
  for(const t of TH){if(!api.live(t)||t.claim||!Z.seen(t)&&t.k!=='swarm')continue;let e=R[t.k]??1;if(o.over&&e<=0&&KIND[t.k].armor!=='hard')e=.3;if(e<=0)continue;
   if(o.smart&&t.k==='decoy')continue;if(o.only&&!o.only(t))continue;
   const d=Math.hypot(t.p.x-x,t.p.z-z);if(d>range)continue;
   if(t===sel&&me&&me.dead<=0&&me.p.distanceTo(t.p)<1500)continue;
   const sc=-tti(t)+e*30+(t.mark?60:0)+(KIND[t.k].dmg>0?0:-40)+(o.prio?o.prio(t):0);if(sc>bs){bs=sc;best=t}}
  return best}
 const claim=(t,h)=>{t.claim=h;h.tgt=t};
 const release=h=>{if(h.tgt&&h.tgt.claim===h)h.tgt.claim=null;h.tgt=null};

 // ---------- guided shots ----------
 function fire(d,t,kind,p0,extra={}){const P=PK[kind],h={d,kind,P,p:p0.clone(),v:extra.v||new V3(0,P.spd*.3||30,0),fuel:P.fuel,tgt:null,pd:1e9,lost:0,tier:d.tier,pk:extra.pk,direct:extra.direct??.3,dome:!!extra.dome,smk:0};
  claim(t,h);shots.push(h);d.shots++;api.FX.emit(h.p,0xffd080,kind==='drone'?25:60,kind==='drone'?6:14,.5,null,2);if(kind!=='drone'&&kind!=='space')api.SMK.emit(h.p,0xd8d4cc,20,8,4,null,1,.7);return h}
 // rotate unit vector dir toward want by at most a radians (works when want is behind, where a lerp would stall)
 const _ax=new V3(),_tq=new THREE.Quaternion();
 function turnTo(dir,want,a){const c=cl(dir.dot(want),-1,1),ang=Math.acos(c);if(ang<=a){dir.copy(want);return}
  _ax.crossVectors(dir,want);if(_ax.lengthSq()<1e-10)_ax.set(0,1,0).cross(dir).lengthSq()>1e-6?_ax.set(0,1,0).cross(dir):_ax.set(1,0,0);dir.applyQuaternion(_tq.setFromAxisAngle(_ax.normalize(),a)).normalize()}
 function shotStep(h,dt){h.fuel-=dt;const P=h.P,t=h.tgt;
  if(!t||!api.live(t)){release(h);const n=h.kind==='drone'?pickTarget('rack',h.p.x,h.p.z,1800,{smart:h.tier>=4}):null;if(n)claim(n,h);else if((h.lost+=dt)>(h.kind==='drone'?4:1.5)||h.fuel<=0)return end(h,null)}
  if(h.fuel<=0)return end(h,null);
  const T=h.tgt,spd=h.v.length(),ns=P.acc?Math.min(P.spd,spd+P.acc*dt):P.spd;const dir=_a.copy(h.v).normalize();
  if(T){const r=_b.subVectors(T.p,h.p),dist=r.length(),tgo=dist/Math.max(40,ns+(-T.v.dot(r)/dist)),aim=r.addScaledVector(T.v,Math.min(tgo,30)).normalize();
   const climb=P.climb&&h.p.y-gh(h.p.x,h.p.z)<P.climb&&h.fuel>P.fuel-4,want=climb?_c.set(aim.x*.3,1,aim.z*.3).normalize():aim;
   turnTo(dir,want,P.turn*dt);
   // closest approach over this step (fast shots move tens of metres per step)
   const rel=_c.subVectors(h.p,T.p),vr=_b.copy(dir).multiplyScalar(ns).sub(T.v),vv=vr.lengthSq(),s=vv>1e-6?cl(-rel.dot(vr)/vv,0,dt):0,cpa=rel.addScaledVector(vr,s).length();
   if(cpa<P.res)return end(h,T);const d2=h.p.distanceTo(T.p);if(d2>h.pd&&h.pd<P.res*4)return end(h,T);if(d2>h.pd&&h.pd<3000&&h.kind!=='drone'){release(h);return end(h,null)}h.pd=d2}  // one pass: an overshoot is a miss
  h.v.copy(dir).multiplyScalar(ns);h.p.addScaledVector(h.v,dt);if(h.p.y<gh(h.p.x,h.p.z)+.3&&h.fuel<P.fuel-1)return end(h,null);
  if(P.smoke&&(h.smk-=dt)<=0&&fxBudget-->0){h.smk=.05;api.SMK.emit(h.p,0xe6e2da,1,1.5,2.5,null,1,.55)}}
 function end(h,t){const i=shots.indexOf(h);if(i>=0)shots.splice(i,1);release(h);api.boom(h.p,h.kind==='drone'?.45:h.kind==='space'?1.6:.9);const R=h.d.res||(h.d.res={kill:0,damage:0,miss:0,lost:0});if(!t){R.lost++;return null}
  const eff=RESIST[{drone:'rack',sam:'sam',tamir:'idome',space:'gdome'}[h.kind]][t.k]??1,p=h.kind==='drone'?RACK_TIERS[h.tier].hit*eff:h.pk*(eff>0?eff:KIND[t.k].armor==='hard'?0:.3);
  const o=Z.helperHit(t,p,h.kind==='drone'?RACK_TIERS[h.tier].direct:h.direct,h.dome);
  R[o]=(R[o]|0)+1;if(o==='kill'){h.d.kills++;Z.helperKill(t)}else if(o==='damage'&&t.k!=='boss')api.damage(t);
  if(h.kind==='drone'&&t.k==='swarm')splash(h.d,h.p,9,RACK_TIERS[h.tier].hit*.6,t);
  return o}
 function splash(d,p,r,pk,skip){for(const u of TH)if(u!==skip&&u.k==='swarm'&&api.live(u)&&u.p.distanceTo(p)<r&&Math.random()<pk){d.kills++;Z.helperKill(u)}}

 // ---------- each helper's logic ----------
 const sl=d=>SLOTS[d.slot],aimAt=(d,t)=>{if(!d.aim||!d.mesh)return;const s=sl(d);d.mesh.rotation.y=Math.atan2(t.p.x-s.x,t.p.z-s.z)+Math.PI};
 const LOGIC={
  rack(d,dt){if(d.ready<d.cap&&(d.rearm+=dt)>=RACK_REARM){d.rearm=0;d.ready++}d.cells?.forEach((c,i)=>c.visible=i<d.ready);
   if((d.cd-=dt)>0||d.ready<=0)return;const s=sl(d),t=pickTarget('rack',s.x,s.z,RACK_RANGE,{smart:d.tier>=4});if(t){fire(d,t,'drone',_a.set(s.x,s.y+2.5,s.z));d.ready--;d.cd=1.2}},
  // mortar: aims a time-fused shell at where the track will be; the burst can catch others nearby
  flak(d,dt){if((d.cd-=dt)>0)return;const s=sl(d),l=L(d),t=pickTarget('flak',s.x,s.z,HELP.flak.rng,{only:u=>u.p.y-gh(u.p.x,u.p.z)<900});if(!t)return;
   const tof=Math.hypot(t.p.x-s.x,t.p.z-s.z)/300+1.5,at=t.p.clone().addScaledVector(t.v,tof);const sh={d,t,at,time:tof,p:new V3(s.x,s.y+2,s.z),from:new V3(s.x,s.y+2,s.z),T:tof,claim:null};claim(t,sh);shells.push(sh);
   d.cd=l.rof;d.shots++;aimAt(d,t);api.FX.emit(sh.p,0xffc070,20,6,.25,null,2);api.SMK.emit(sh.p,0x9a948a,6,4,2,null,1,.6)},
  // cannon: bursts while it holds a track; tracers show where it is shooting
  gepard(d,dt){const s=sl(d),l=L(d),rng=l.rng||HELP.gepard.rng;let t=d.tgt;if(t&&(!api.live(t)||t.p.distanceTo(_a.set(s.x,s.y,s.z))>rng*1.05)){release(d);t=null}
   if(!t){t=pickTarget('gepard',s.x,s.z,rng);if(t)claim(t,d);else return}aimAt(d,t);if((d.cd-=dt)>0)return;
   const from=_a.set(s.x,s.y+2.5,s.z),dist=t.p.distanceTo(from),tof=dist/1100,lead=_b.copy(t.p).addScaledVector(t.v,tof);
   for(let i=0;i<6;i++){const v=_c.subVectors(lead,from).normalize().add(new V3(rnd(-1,1),rnd(-1,1),rnd(-1,1)).multiplyScalar(.004+dist*1.5e-6)).normalize().multiplyScalar(1100);tracer(from.clone().addScaledVector(v,i*.004),v,tof+.15)}
   d.cd=1.1;d.shots++;api.FX.emit(from,0xffd080,6,4,.15,null,2.5);
   const p=l.p*(RESIST.gepard[t.k]??1)*(1-.5*dist/rng);pend.push({t:tof,fn:()=>{if(!api.live(t)||!G.on)return;const o=Z.helperHit(t,p,.5);if(o==='kill'){d.kills++;Z.helperKill(t);if(l.ahead&&t.k==='swarm')splash(d,t.p,14,.5,t);release(d)}else if(o==="damage"&&t.k!=="boss")api.damage(t)}})},
  sam(d,dt){if((d.cd-=dt)>0||d.ammo<=0)return;const s=sl(d),l=L(d),t=pickTarget('sam',s.x,s.z,HELP.sam.rng,{smart:l.smart,prio:u=>u.k==='swarm'?-80:0});if(!t)return;
   aimAt(d,t);fire(d,t,'sam',_a.set(s.x,s.y+3,s.z),{pk:l.p,direct:1,v:new V3(0,120,0)});d.ammo--;d.cd=3.5;d.cells?.forEach((c,i)=>c.visible=i<d.ammo)},
  // jammer: tracks entering the bubble get one roll; spoofed ones lose their aim and hit an empty field
  ew(d){const s=sl(d),l=L(d),r=l.rng||HELP.ew.rng;for(const t of TH){if(!api.live(t)||d.jam.has(t.id))continue;const e=RESIST.ew[t.k]??0;if(e<=0)continue;
   if(Math.hypot(t.p.x-s.x,t.p.z-s.z)>r)continue;d.jam.add(t.id);if(Math.random()<l.p*e){t.spoof=1;const a=Math.random()*6.28,o=rnd(450,800);t.aim=new V3(t.tgt.x+Math.cos(a)*o,0,t.tgt.z+Math.sin(a)*o);t.aim.y=gh(t.aim.x,t.aim.z);t.wps.length=0;d.kills++;
    api.feed(`<span class="cb">${Z.tname(t)} spoofed by the jammer</span>`)}}},
  idome(d,dt){if((d.cd-=dt)>0||d.ammo<=0)return;const s=sl(d),l=L(d),hard=u=>KIND[u.k].armor==='hard'||u.k==='cruise';
   const t=pickTarget('idome',s.x,s.z,HELP.idome.rng,{over:l.over,only:u=>hard(u)?u.p.distanceTo(_c.set(s.x,s.y,s.z))<14000:(l.over&&u.p.distanceTo(_c.set(s.x,s.y,s.z))<5000),prio:u=>hard(u)?200:0});if(!t)return;
   fire(d,t,'tamir',_a.set(s.x,s.y+3,s.z),{pk:l.p,direct:1,dome:true,v:new V3(rnd(-10,10),160,rnd(-10,10))});d.ammo--;d.cd=1.6},
  // space interceptors: come down from orbit onto the fast tracks anywhere on the map
  gdome(d,dt){if((d.cd-=dt)>0||d.ammo<=0)return;const l=L(d),dome=D.some(e=>e.type==='idome'&&e.ammo>0);
   // saves its magazine for what only it can stop; a ballistic track only as a last-ditch shot when no Iron Dome has interceptors left
   const t=pickTarget('gdome',0,0,9e9,{only:u=>u.k==='hyper'||u.k==='icbm'?u.p.distanceTo(u.aim)<90000:u.k==='ballistic'&&!dome&&u.p.distanceTo(u.aim)<15000,prio:u=>u.k==='ballistic'?-500:0});if(!t)return;
   const p0=t.p.clone().addScaledVector(t.v,4).add(_c.set(rnd(-2000,2000),15000,rnd(-2000,2000)));fire(d,t,'space',p0,{pk:l.p,direct:1,dome:true,v:_b.subVectors(t.p,p0).setLength(PK.space.spd)});d.ammo--;d.cd=2;
   api.feed(`<span class="cb">Golden Dome: space interceptor away at ${Z.tname(t)}</span>`)}};

 function step(dt){fxBudget=40;for(let i=pend.length-1;i>=0;i--)if((pend[i].t-=dt)<=0){const f=pend[i].fn;pend.splice(i,1);f()}for(const d of D)LOGIC[d.type](d,dt);for(let i=shots.length-1;i>=0;i--)if(shots[i])shotStep(shots[i],dt);
  for(let i=shells.length-1;i>=0;i--){const sh=shells[i];sh.time-=dt;const f=1-sh.time/sh.T;sh.p.lerpVectors(sh.from,sh.at,f);sh.p.y+=Math.sin(f*Math.PI)*sh.T*60;
   if(sh.time<=0){shells.splice(i,1);release(sh);const l=L(sh.d),t=sh.t;Z.flash(sh.at,.7);api.SMK.emit(sh.at,0x2a2826,14,7,4,null,1,.85);api.FX.emit(sh.at,0xffb050,30,14,.3,null,2.5);
    if(api.live(t)){const miss=t.p.distanceTo(sh.at),pk=l.p*(RESIST.flak[t.k]??1)*cl(1.4-miss/60,0,1);const o=Z.helperHit(t,pk,.2);if(o==='kill'){sh.d.kills++;Z.helperKill(t)}else if(o==='damage'&&t.k!=='boss')api.damage(t)}
    splash(sh.d,sh.at,26,l.p*.7,t)}}
  for(let i=tr.length-1;i>=0;i--){const q=tr[i];q.p.addScaledVector(q.v,dt);if((q.life-=dt)<=0)tr.splice(i,1)}}
 function visuals(){const n=[0,0,0];let g=0;
  for(const h of shots){const P=h.P,mi=P.mesh;if(n[mi]>=pMesh[mi].instanceMatrix.count)continue;_q.setFromUnitVectors(FWD,_a.copy(h.v).normalize());_m.compose(h.p,_q,_s.setScalar(P.s));pMesh[mi].setMatrixAt(n[mi]++,_m);
   if(g<GN){gPos[g*3]=h.p.x;gPos[g*3+1]=h.p.y;gPos[g*3+2]=h.p.z;gCol[g*3]=P.glow[0]*P.gs;gCol[g*3+1]=P.glow[1]*P.gs;gCol[g*3+2]=P.glow[2]*P.gs;g++}}
  pMesh.forEach((m,i)=>{m.count=n[i];m.instanceMatrix.needsUpdate=true});gGeo.setDrawRange(0,g);gGeo.attributes.position.needsUpdate=gGeo.attributes.color.needsUpdate=true;
  let k=0;for(const q of tr){const o=k*6;tPos[o]=q.p.x;tPos[o+1]=q.p.y;tPos[o+2]=q.p.z;tPos[o+3]=q.p.x-q.v.x*.014;tPos[o+4]=q.p.y-q.v.y*.014;tPos[o+5]=q.p.z-q.v.z*.014;k++}
  tGeo.setDrawRange(0,k*2);tGeo.attributes.position.needsUpdate=true;
  for(const d of D)if(d.bubble)d.bubble.material.opacity=.05+.025*Math.sin(performance.now()/400)}
 // radar: shots as cyan dots with a thin yellow line to their claimed track; your defences as cyan squares (EW bubble as a ring)
 function radar(rc,P,K){rc.lineWidth=1.5;for(const h of shots){const q=P(h.p.x,h.p.z);rc.fillStyle=h.kind==='drone'?'#5fe3ff':'#e8f4ff';rc.fillRect(q[0]-2.5,q[1]-2.5,5,5);if(h.tgt){const u=P(h.tgt.p.x,h.tgt.p.z);rc.strokeStyle='rgba(255,226,60,.55)';rc.beginPath();rc.moveTo(q[0],q[1]);rc.lineTo(u[0],u[1]);rc.stroke()}}
  for(const d of D){const s=sl(d),q=P(s.x,s.z);rc.strokeStyle='#5fe3ff';rc.lineWidth=2;rc.strokeRect(q[0]-4,q[1]-4,8,8);if(d.type==='ew'&&K){rc.strokeStyle='rgba(95,227,255,.3)';rc.beginPath();rc.arc(q[0],q[1],rangeOf(d)*K,0,7);rc.stroke()}}}
 return{SLOTS,D,shots,get drones(){return shots.filter(h=>h.kind==='drone')},add,remove,slotFree,deploy,clear,step,visuals,radar,rangeOf,L,launchDrone:(d,t)=>{const s=sl(d);fire(d,t,'drone',_a.set(s.x,s.y+2.5,s.z))}}}
