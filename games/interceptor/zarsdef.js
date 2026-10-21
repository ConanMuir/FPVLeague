// Zombies arsenal: five more base defences, each a different trade (numbers in zarsdata.js). They plug into zdef.js through Z.defx.reg (a mesh
// builder and per-step logic), so placing, the Armory, upkeep, selling, moving and the co-op defence list work as for any helper. Visuals and
// sounds live here.
//  laser    dwell-time kill: holds its beam on one track until it burns through (no dice); the weather (zwx.js state, api.WX) sets the burn rate
//           and a heavy storm shuts it down; smoke between it and the target slows it; Mark and an EMP speed it up
//  mwave    microwave dome: a pulse fries every FPV swarm drone in its radius (decoys and Shaheds sometimes), then recharges; nothing else
//  barrage  balloon / cable barrage: passive; snags tracks under its cable ceiling inside its reach, a few a wave; your own drone can hit a cable
//  smoke    smoke generators: tracks diving on targets near it lose their aim and hit a field (no kills, no money); wind thins it
//  carrier  drone carrier: parked anywhere (a park spot, zdef.js SLOTS 22-23, that moves with it), pours out its drones in volleys, no rearm
// Co-op: the host runs them (zdef.js); clients get events for what they can't see in the snapshot: the laser's target, a pulse, a snag, a volley,
// where a carrier is parked.
import {dot} from '../../engine/render.js';
import {gfx} from '../../engine/gfx.js';
import {HELP} from './zdata.js';
import {DWELL,laserWx,MWAVE,BARRAGE,SMOKE,CARRIER,EMP} from './zarsdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),fxn=n=>Math.max(1,Math.round(n*gfx.k.fx));  // Graphics quality thins the particles (engine/gfx.js)
export function initArsDef(api,G,Z,A){
 const {THREE,scene,TH,gh}=api,V3=THREE.Vector3,X=Z.defx,def=Z.def,snd=A.snd,live=api.live,_a=new V3(),_b=new V3(),_c=new V3();
 const {M,kit,wheels}=X,LV=d=>HELP[d.type].lv[d.lvl],R=d=>def.rangeOf(d),sl=d=>def.SLOTS[d.slot];
 const mine=t=>def.D.filter(d=>d.type===t);
 const hot=(hex,k)=>new THREE.MeshBasicMaterial({color:new THREE.Color(hex).multiplyScalar(k),toneMapped:false});
 const SMM=new THREE.SpriteMaterial({map:dot,color:0xa6a6a2,transparent:true,opacity:0,depthWrite:false});
 const MT={lens:hot(0xff5070,2.4),glass:new THREE.MeshStandardMaterial({color:0x223040,roughness:.15,metalness:.8}),dome:new THREE.MeshStandardMaterial({color:0xe9ecef,roughness:.45,metalness:.1}),
  emit:hot(0xff7ad0,1.6),bal:new THREE.MeshStandardMaterial({color:0xb8bec4,roughness:.5,metalness:.35}),cable:new THREE.MeshBasicMaterial({color:0x2a2d30}),can:new THREE.MeshStandardMaterial({color:0x3d4630,roughness:.7,metalness:.3})};

 // ---------- meshes ----------
 const MESH={
  laser(d){const g=kit();g.add$(new THREE.BoxGeometry(3,1,6),M.olive,0,.9,0);wheels(g,1.3,1.8);g.add$(new THREE.CylinderGeometry(.7,.9,1.6,12),M.dark,0,2.2,0);
   const h=new THREE.Group();h.position.set(0,3.4,0);g.add(h);d.head=h;d.aim=h;const add=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;h.add(o);return o};
   add(new THREE.BoxGeometry(1.8,1.6,2.6),M.olive,0,0,0);add(new THREE.CylinderGeometry(.75,.75,.5,20).rotateX(Math.PI/2),MT.glass,0,0,-1.45);d.lens=add(new THREE.CylinderGeometry(.42,.42,.1,16).rotateX(Math.PI/2),MT.lens,0,0,-1.72);
   for(const x of[-1.15,1.15])add(new THREE.BoxGeometry(.4,1.1,1.6),M.dark,x,0,.2);return g},
  mwave(d){const g=kit();g.add$(new THREE.BoxGeometry(4.2,1.3,4.2),M.sand,0,.65,0);g.add$(new THREE.CylinderGeometry(1.6,1.8,1.2,16),M.dark,0,1.9,0);
   const dm=new THREE.Mesh(new THREE.SphereGeometry(2.4,24,12,0,Math.PI*2,0,Math.PI/2),MT.dome);dm.position.y=2.5;dm.castShadow=true;g.add(dm);d.dome=dm;
   const r=new THREE.Mesh(new THREE.TorusGeometry(2.45,.12,8,32).rotateX(Math.PI/2),MT.emit);r.position.y=2.6;g.add(r);d.ring=r;return g},
  barrage(d){const g=kit();g.add$(new THREE.BoxGeometry(2.4,1.1,4.4),M.olive,0,.8,0);wheels(g,1.1,1.5);g.add$(new THREE.CylinderGeometry(.7,.7,1.6,14).rotateZ(Math.PI/2),M.dark,0,1.9,.9);
   d.bal=[];for(let i=0;i<BARRAGE.n;i++){const b=new THREE.Group(),body=new THREE.Mesh(new THREE.SphereGeometry(1,16,10).scale(4,4,9.5),MT.bal);body.castShadow=true;b.add(body);
    for(const a of[0,2.094,4.189]){const pv=new THREE.Group(),f=new THREE.Mesh(new THREE.BoxGeometry(.2,3.6,4),MT.bal);f.position.set(0,4,7.6);pv.rotation.z=a;pv.add(f);b.add(pv)}  // three tail fins
    const c=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,1,5),MT.cable);g.add(b,c);d.bal.push({b,c,ph:Math.random()*6})}return g},
  smoke(d){const g=kit();g.add$(new THREE.BoxGeometry(2.6,.9,4.6),M.olive,0,.7,0);wheels(g,1.15,1.6);for(let i=0;i<3;i++){g.add$(new THREE.CylinderGeometry(.42,.42,1.8,12),MT.can,-.75+i*.75,2,-.8);g.add$(new THREE.CylinderGeometry(.16,.22,.9,8),M.dark,-.75+i*.75,3.2,-.8)}
   g.add$(new THREE.BoxGeometry(2.2,1.2,1.6),M.dark,0,1.7,1.2);
   // the screen: soft grey sprites in unit coordinates; zdef.js places d.bubble on the position and scales it to the reach (like the EW bubble)
   const sg=new THREE.Group();sg.material={};sg.userData.free=1;d.puffs=[];for(let i=0;i<30;i++){const sp=new THREE.Sprite(SMM.clone()),a=Math.random()*6.283,r=Math.sqrt(Math.random())*.6;
    sp.userData={x:Math.cos(a)*r,z:Math.sin(a)*r,y:.03+Math.random()*.05,k:.09+Math.random()*.08,ph:Math.random()*6.283};sp.position.set(sp.userData.x,sp.userData.y,sp.userData.z);sp.scale.setScalar(sp.userData.k);sg.add(sp);d.puffs.push(sp)}
   sg.visible=false;d.bubble=sg;return g},
  carrier(d){const g=kit();g.add$(new THREE.BoxGeometry(3,1.3,10),M.olive,0,1.2,0);for(const z of[-3.6,-1.2,1.2,3.6])for(const x of[-1.3,1.3])g.add$(new THREE.CylinderGeometry(.6,.6,.45,14).rotateZ(Math.PI/2),M.dark,x,.6,z);
   g.add$(new THREE.BoxGeometry(2.8,1.8,2.2),M.olive,0,2.5,3.7);g.add$(new THREE.BoxGeometry(2.4,.6,.1),MT.glass,0,2.9,2.55);d.cells=[];
   for(let i=0;i<20;i++){const r=i/4|0,c=i%4;d.cells.push(g.add$(new THREE.BoxGeometry(.55,.9,.55),M.tube,-1.05+c*.7,2.35,2-r*.95))}return g}};

 // ---------- logic (host / solo; zdef.js calls it every step during a wave) ----------
 const smoked=p=>{for(const e of def.D)if(e.type==='smoke'&&e.mesh){const s=sl(e);if(Math.hypot(p.x-s.x,p.z-s.z)<R(e))return true}return false};
 function setLz(d,t){d.lz=t?{t,prog:0}:null;if(t)d.shots++;A.ev(['lz',d.id,t?t.id:0])}
 const LOGIC={
  laser(d,dt){const s=sl(d),l=LV(d),rg=R(d),wx=d.wx=laserWx(api.WX);let z=d.lz;
   if(z&&(!live(z.t)||Math.hypot(z.t.p.x-s.x,z.t.p.z-s.z)>rg*1.05||wx<=0)){X.release(d);setLz(d,null);z=null}
   if(wx<=0)return;if(!z){if((d.cd-=dt)>0)return;const t=X.pickTarget(d,s.x,s.z,rg,{prio:u=>-(DWELL[u.k]||9)*6+(u.emp>0?25:0)});if(!t)return;X.claim(t,d);setLz(d,t);z=d.lz}
   const t=z.t;X.aimAt(d,t);z.prog+=dt*burn(d,t,wx)/(DWELL[t.k]*l.dw);
   if(z.prog>=1){if(t.k==='boss'){Z.bossHit(t);z.prog=0;if(!live(t)){X.release(d);setLz(d,null)}}else{d.kills++;Z.helperKill(t);X.release(d);setLz(d,null);d.cd=1}}},
  mwave(d,dt){if((d.cd-=dt)>0)return;const s=sl(d),rg=R(d),P=_a.set(s.x,s.y,s.z),L=[];let n=0,close=false;
   api.grid.near(P,rg,t=>{if(!live(t))return;const pk=MWAVE.pk[t.k];if(!pk)return;const r=t.p.distanceTo(P);if(r>rg)return;L.push([t,pk]);if(t.k==='swarm')n++;if(r<MWAVE.close)close=true});
   if(!(n>=MWAVE.trig||close&&L.length))return;for(const[t,pk]of L)if(Math.random()<pk*(t.emp>0?EMP.helperK:1)){d.kills++;Z.helperKill(t)}
   d.cd=LV(d).cd*X.otK();d.shots++;pulse(d);A.ev(['mw',d.id])},
  barrage(d){const s=sl(d),l=LV(d),rg=R(d);if((d.snag|0)>=l.snags)return;
   api.grid.near(s,rg,t=>{if(!live(t)||d.jam.has(t.id))return;const pk=BARRAGE.pk[t.k];if(!pk||Math.hypot(t.p.x-s.x,t.p.z-s.z)>rg||t.p.y-gh(t.p.x,t.p.z)>l.alt)return;d.jam.add(t.id);
    if(Math.random()<pk){d.snag=(d.snag|0)+1;d.kills++;snag(d,t);A.ev(['sn',d.id,t.id]);Z.helperKill(t);if(d.snag>=l.snags){api.feed(`<span class="co">${def.SLOTS[d.slot].n}: the barrage cables are all used up for this wave</span>`);return true}}})},
  smoke(d){const s=sl(d),l=LV(d),rg=R(d),wk=d.wk=api.WB.length()>SMOKE.wind?SMOKE.windK:1;
   api.grid.near(s,rg+400,t=>{if(!live(t)||t.st!=='dive'||t.spoof||d.jam.has(t.id))return;const e=SMOKE.pk[t.k];if(!e||Math.hypot(t.aim.x-s.x,t.aim.z-s.z)>rg)return;d.jam.add(t.id);  /* a diver is within a few hundred metres of its aim */
    if(Math.random()<l.p*e*wk){t.spoof=1;t.smk=1;const a=Math.random()*6.28,o=rnd(150,320);t.aim=new V3(t.aim.x+Math.cos(a)*o,0,t.aim.z+Math.sin(a)*o);t.aim.y=gh(t.aim.x,t.aim.z);t.wps.length=0;d.kills++;
     api.feed(`<span class="cb">${Z.tname(t)} lost its aim in the smoke</span>`)}})},
  carrier(d,dt){d.cells?.forEach((c,i)=>c.visible=i<d.ammo);if(d.ammo<=0||(d.cd-=dt)>0)return;const s=sl(d),l=LV(d);let n=0;d.tier=l.tier;
   for(let i=0;i<CARRIER.volley&&d.ammo>0;i++){const t=X.pickTarget(d,s.x,s.z,R(d),{smart:l.tier>=4});if(!t)break;X.fire(d,t,'drone',_a.set(s.x+rnd(-1.2,1.2),s.y+3.2,s.z+rnd(-3,3)));d.ammo--;n++}
   if(n){d.cd=CARRIER.iv;volley(d,n);A.ev(['cv',d.id,n])}}};
 // the laser's burn rate: weather, smoke over the target, Mark, an EMP-disabled target
 const burn=(d,t,wx)=>wx*(smoked(t.p)?SMOKE.laserK:1)*(t.mark>0?1.4:1)/(t.emp>0?EMP.laserK:1);
 for(const k of Object.keys(MESH))X.reg(k,MESH[k],LOGIC[k]);

 // ---------- the wave starts: snag counts, laser state, carrier seekers; balloons up; the host re-sends where carriers are parked ----------
 const dep0=def.deploy;def.deploy=()=>{dep0();for(const d of def.D){if(d.type==='barrage'){d.snag=0;hoist(d)}if(d.type==='laser'){d.lz=null;d.cd=0}if(d.type==='carrier'){d.tier=LV(d).tier;d.cd=0;if(A.auth())parkEv(d)}if(d.type==='mwave')d.cd=0}};
 // balloons on a ring around the position, at the cable ceiling over the ground under each, cables down to the ground (world placement, then into the mesh's frame)
 function hoist(d){if(!d.mesh||!d.bal)return;const s=sl(d),l=LV(d),rr=R(d)*.55;d.mesh.updateMatrixWorld(true);d.bw=[];
  d.bal.forEach((q,i)=>{const a=i/d.bal.length*6.283+.4,x=s.x+Math.cos(a)*rr,z=s.z+Math.sin(a)*rr,g0=gh(x,z),y=g0+l.alt;d.bw.push({x,z,y,g0});
   q.b.position.copy(d.mesh.worldToLocal(_a.set(x,y,z)));q.b.rotation.y=a;const c0=d.mesh.worldToLocal(_b.set(x,g0,z)).clone(),c1=d.mesh.worldToLocal(_c.set(x,y-4,z));
   q.c.position.copy(c0).add(c1).multiplyScalar(.5);q.c.scale.set(1,c1.distanceTo(c0),1)})}
 // a carrier's park spot moves to where it is parked (solo / host; a client gets the 'pk' event)
 function parkAt(d,x,z){const s=sl(d);if(!s?.park)return false;const W=api.AW-150;x=cl(x,-W,W);z=cl(z,-W,4000);s.x=x;s.z=z;s.y=gh(x,z);if(d.mesh){d.mesh.position.set(x,s.y,z);d.mesh.rotation.y=Math.atan2(x,z+1500)+Math.PI}return true}
 const parkEv=d=>{const s=sl(d);A.ev(['pk',d.slot,Math.round(s.x),Math.round(s.z)])};
 A.park=(id,x,z)=>{const d=def.D.find(q=>q.id===id);if(!d||d.type!=='carrier'||!Number.isFinite(x)||!Number.isFinite(z))return false;if(Z.mirror){Z.req(['A','pk',id,Math.round(x),Math.round(z)]);return true}
  if(!parkAt(d,x,z))return false;parkEv(d);Z.base?.refresh?.();return true};
 A.on.pk=a=>{const s=def.SLOTS[a[0]];if(!s?.park||!Number.isFinite(a[1])||!Number.isFinite(a[2]))return;const d=def.D.find(q=>q.slot===a[0]);if(d)parkAt(d,a[1],a[2]);else{s.x=a[1];s.z=a[2];s.y=gh(a[1],a[2])}Z.base?.refresh?.()};

 // ---------- visuals and sounds (every screen) ----------
 const beams=new Map();
 const BM=new THREE.MeshBasicMaterial({color:new THREE.Color(0xff3a5a).multiplyScalar(3),transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
 const BG=new THREE.CylinderGeometry(.22,.22,1,6,1,true).translate(0,.5,0).rotateX(Math.PI/2);
 const SPN=16,spPos=new Float32Array(SPN*3),spGeo=new THREE.BufferGeometry();spGeo.setAttribute('position',new THREE.BufferAttribute(spPos,3));
 const spots=new THREE.Points(spGeo,new THREE.PointsMaterial({size:14,sizeAttenuation:false,map:dot,color:new THREE.Color(0xff6a80).multiplyScalar(2.5),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));spots.frustumCulled=false;scene.add(spots);spGeo.setDrawRange(0,0);
 function beam(d){let b=beams.get(d);if(!b){b=new THREE.Mesh(BG,BM);b.frustumCulled=false;scene.add(b);beams.set(d,b)}return b}
 const shells=[],SHM=new THREE.MeshBasicMaterial({color:new THREE.Color(0xff9ad8).multiplyScalar(1.4),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 const SHG=new THREE.SphereGeometry(1,28,12,0,Math.PI*2,0,Math.PI/2);
 function pulse(d){const s=sl(d);let m=shells.find(q=>!q.on);if(!m){m={o:new THREE.Mesh(SHG,SHM.clone()),on:false};m.o.frustumCulled=false;scene.add(m.o);shells.push(m)}m.on=true;m.t=0;m.r=R(d);m.o.position.set(s.x,s.y,s.z);m.o.visible=true;
  snd.pulse(_a.set(s.x,s.y+3,s.z));api.FX.emit(_a,0xff9ad8,fxn(40),20,.4,null,2)}
 function snag(d,t){snd.twang(t.p);api.FX.emit(t.p,0xd8dde2,fxn(20),8,.4,null,1.6);Z.pop?.(t.p,'SNAGGED','#cfd6dc')}
 function volley(d,n){const s=sl(d);snd.volley(_a.set(s.x,s.y+3,s.z),n)}
 A.on.lz=a=>{const d=def.D.find(q=>q.id===a[0]);if(!d)return;const t=a[1]?TH.find(u=>u.id===a[1]):null;d.lz=t?{t,prog:0}:null};
 A.on.mw=a=>{const d=def.D.find(q=>q.id===a[0]);if(d)pulse(d)};
 A.on.sn=a=>{const d=def.D.find(q=>q.id===a[0]),t=TH.find(u=>u.id===a[1]);if(d&&t)snag(d,t)};
 A.on.cv=a=>{const d=def.D.find(q=>q.id===a[0]);if(d)volley(d,a[1]|0)};
 let smT=0,hum=null;
 function visuals(dt){const cam=api.camera.position,on=G.on&&(G.state==='wave'||G.state==='clear');let sp=0,best=null,bd=2600;
  for(const[d,b]of beams)if(!def.D.includes(d)||!d.lz||!d.mesh||!on){b.visible=false;if(!def.D.includes(d)){scene.remove(b);beams.delete(d)}}
  for(const d of def.D){if(!d.mesh)continue;
   if(d.type==='laser'){const z=d.lz;if(!z||!on||!live(z.t)){if(z&&!live(z.t))d.lz=null;continue}const t=z.t,b=beam(d);if(Z.mirror){X.aimAt(d,t);z.prog+=dt*burn(d,t,laserWx(api.WX))/(DWELL[t.k]*LV(d).dw)}
    const s=sl(d),dx=t.p.x-s.x,dz=t.p.z-s.z,hd=Math.hypot(dx,dz);if(d.head)d.head.rotation.x=Math.atan2(t.p.y-(s.y+3.4),hd);d.lens.getWorldPosition(_a);
    b.position.copy(_a);b.lookAt(t.p);b.scale.set(1+_a.distanceTo(cam)/900,1+_a.distanceTo(cam)/900,_a.distanceTo(t.p));b.visible=true;b.material.opacity=.55+.3*Math.random();
    if(sp<SPN){spPos.set([t.p.x,t.p.y,t.p.z],sp*3);sp++}if(sp<SPN){spPos.set([_a.x,_a.y,_a.z],sp*3);sp++}
    if((d.spk=(d.spk||0)-dt)<=0){d.spk=.07;api.FX.emit(t.p,0xffa0a0,fxn(3),5,.25,null,2.5)}
    const dc=Math.min(_a.distanceTo(cam),t.p.distanceTo(cam));if(dc<bd){bd=dc;best={d,t,dc}}}
   else if(d.type==='mwave'&&d.ring){const k=d.cd>0?1-Math.min(1,d.cd/LV(d).cd):1;d.ring.material.color.setRGB(1*(.4+1.4*k),.48*(.4+1.4*k),.82*(.4+1.4*k))}
   else if(d.type==='barrage'&&d.bw){const T=performance.now()/1000;d.bal.forEach(q=>{q.b.position.y+=Math.sin(T*.6+q.ph)*.012})}
   else if(d.type==='smoke'&&d.bubble){const sg=d.bubble,show=on&&G.state==='wave';d.so=cl((d.so||0)+(show?dt/3:-dt/3),0,1);sg.visible=d.so>0;const T=performance.now()/1000,W=api.WIND,rg=R(d);  /* the screen builds over 3 s and drifts with the wind */
    if(sg.visible)for(const[i,q]of d.puffs.entries()){if(i>=Math.round(d.puffs.length*gfx.k.fx)){q.visible=false;continue}q.visible=true;const u=q.userData,dx=((u.x+W.x*T*.0015/(rg/600))%1.2+1.8)%1.2-.6;q.position.set(dx,u.y+.01*Math.sin(T*.3+u.ph),u.z);q.material.opacity=.9*d.so*Math.min(1,1.6*(1-Math.abs(dx)/.7))*(.8+.2*Math.sin(T*.5+u.ph))}
    if(!d.hissed){d.hissed=1;const s=sl(d);snd.hiss(_c.set(s.x,s.y+2,s.z))}}}
  spGeo.setDrawRange(0,sp);spGeo.attributes.position.needsUpdate=true;
  for(const m of shells)if(m.on){m.t+=dt;const u=m.t/.7;if(u>=1){m.on=false;m.o.visible=false;continue}m.o.scale.setScalar(Math.max(1,m.r*Math.sqrt(u)));m.o.material.opacity=.32*(1-u)}
  if(best&&on){if(!hum)hum=snd.hum();hum?.set(best.dc,best.d.lz?.prog||0)}else if(hum){hum.stop();hum=null}
  if(!on){for(const d of mine('smoke'))d.hissed=0}}
 // your own drone and the barrage cables: fly into one (or a balloon) and it is a crash
 function cables(){const me=api.player;if(!me||me.dead>0||G.state!=='wave')return;for(const d of def.D){if(d.type!=='barrage'||!d.bw)continue;
   for(const q of d.bw){const h=Math.hypot(me.p.x-q.x,me.p.z-q.z);if(h<BARRAGE.cable&&me.p.y<q.y||h<7&&Math.abs(me.p.y-q.y)<4){api.lose('crash');api.banner('CABLE STRIKE','cr',1.6);api.feed('<span class="cr">Your interceptor flew into a barrage cable</span>');snd.twang(me.p);return}}}}
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);visuals(dt)};
 const st0=Z.step;Z.step=dt=>{st0(dt);if(G.on)cables()};
 // the laser's burn on the FPV overlay: a red arc filling around the target it is burning
 const ov0=Z.overlay;Z.overlay=oc=>{ov0(oc);if(!G.on||G.state!=='wave')return;const cam=api.camera,W=innerWidth,H=innerHeight;oc.save();oc.lineWidth=3;oc.strokeStyle='#ff4d6d';
  for(const d of def.D){const z=d.lz;if(d.type!=='laser'||!z||!live(z.t))continue;_a.copy(z.t.p).project(cam);if(_a.z>1||Math.abs(_a.x)>1||Math.abs(_a.y)>1)continue;const x=(_a.x*.5+.5)*W,y=(-_a.y*.5+.5)*H;
   oc.beginPath();oc.arc(x,y,17,-Math.PI/2,-Math.PI/2+cl(z.prog,0,1)*6.283);oc.stroke()}oc.restore()};
 // radar: barrage and smoke reach as faint rings, carriers as cyan diamonds
 const rd0=Z.radar;Z.radar=(rc,P,sel,K)=>{rd0(rc,P,sel,K);if(!K)return;rc.save();rc.lineWidth=1.5;for(const d of def.D){const s=sl(d),q=P(s.x,s.z);
   if(d.type==='barrage'||d.type==='smoke'){rc.strokeStyle=d.type==='smoke'?'rgba(200,200,200,.35)':'rgba(200,220,235,.35)';rc.setLineDash([4,4]);rc.beginPath();rc.arc(q[0],q[1],R(d)*K,0,7);rc.stroke();rc.setLineDash([])}
   if(d.type==='carrier'){rc.fillStyle='#5fe3ff';rc.beginPath();rc.moveTo(q[0],q[1]-7);rc.lineTo(q[0]+7,q[1]);rc.lineTo(q[0],q[1]+7);rc.lineTo(q[0]-7,q[1]);rc.closePath();rc.fill()}}rc.restore()};
 const stop0=Z.stop;Z.stop=()=>{stop0();for(const b of beams.values()){scene.remove(b)}beams.clear();if(hum){hum.stop();hum=null}for(const m of shells){m.on=false;m.o.visible=false}spGeo.setDrawRange(0,0)};
 return{parkAt,hoist,smoked,burn,MESH,LOGIC}}
