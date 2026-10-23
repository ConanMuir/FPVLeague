// Boss: the Juggernaut, a heavily armoured cruise missile the size of a building (40 m), slow and low, aimed at your strongest site.
// Only a burst within about 5 m of a glowing weak point hurts it; anywhere else the armour shrugs it off (the readout says so). Weak points
// open in three stages: ARMOURED (the two intakes on its back), BREACHED (each stage cleared blows the plates off the next: the side vents),
// CORE EXPOSED (the belly core and the nose seeker). It degrades as you go: plates blown off and tumbling away, fires where the weak points
// were, a smoke trail that thickens, sparks, the hull scorching darker, and it slows. If it arrives it does 350 damage. SAMs and Iron Dome
// can knock out a weak point now and then; nothing else bothers it. Beaten: the Salvaged Plating trophy (sites take 15% less damage).
import {registerBoss} from './zbosses.js';
const WP=[[2.2,2.9,-11.6,0],[-2.2,2.9,-11.6,0],[3.3,0,0,1],[-3.3,0,0,1],[0,-3.3,5,2],[0,0,24.4,2]];
function hullTex(C){const n=C.rec().b.jugg?.lost|0;return C.decal('jg-hull'+Math.min(12,n),1024,512,(g,w,h)=>{const{D2}=C;g.fillStyle='#4a4f3c';g.fillRect(0,0,w,h);D2.panels(g,w,h,'#1c1e16',16,.45);
 g.fillStyle='rgba(20,20,14,.6)';for(let i=0;i<900;i++)g.fillRect(C.rnd(0,w),C.rnd(0,h),2,2);D2.stripes(g,0,0,w,46,'#f2c21b','#151515',22);
 for(const u of[.25,.75]){g.save();g.translate(u*w,h*.45);g.rotate(-Math.PI/2);D2.text(g,'JUGGERNAUT',0,-20,54,'#e8e2d0','900');D2.text(g,'MK IX · HIGH EXPLOSIVE · DO NOT APPROACH',0,26,18,'#e8e2d0','700');g.restore();
  g.fillStyle='#e8e2d0';for(let i=0;i<Math.min(12,n);i++){const x=u*w+50+(i%4)*24,y=330+(i/4|0)*24;g.fillRect(x,y+10,18,14);g.fillRect(x+3,y+2,5,8);g.fillRect(x+11,y+5,5,5)}}  // sites it has hit
 D2.stripes(g,0,h-40,w,40,'#f2c21b','#151515',22);D2.grime(g,w,h,.14)})}
function embTex(C){return C.decal('jg-emb',256,256,(g,w)=>{const c=w/2,{D2}=C;g.fillStyle='#151515';g.beginPath();g.arc(c,c,118,0,7);g.fill();g.strokeStyle='#f2c21b';g.lineWidth=10;g.stroke();
 g.fillStyle='#e8e2d0';g.beginPath();g.moveTo(c-90,c+14);g.lineTo(c+40,c+14);g.lineTo(c+90,c);g.lineTo(c+40,c-14);g.lineTo(c-90,c-14);g.closePath();g.fill();D2.skull(g,c-10,c-46,30,'#f2c21b','#151515');D2.text(g,'IRON WILL',c,c+60,26,'#f2c21b','900')})}
function plateTex(C){return C.decal('jg-plate',128,128,(g,w,h)=>{g.fillStyle='#5a5a48';g.fillRect(0,0,w,h);g.fillStyle='#2a2a20';for(let x=8;x<w;x+=28)for(const y of[8,h-12])g.beginPath(),g.arc(x,y,3.5,0,7),g.fill();C.D2.grime(g,w,h,.2);g.strokeStyle='#22221a';g.lineWidth=4;g.strokeRect(2,2,w-4,h-4)})}
const MT={};let _pl=null;
function mats(C){const T=C.THREE;if(!MT.emb)Object.assign(MT,{emb:new T.MeshBasicMaterial({map:embTex(C),transparent:true,alphaTest:.05,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
 plate:new T.MeshStandardMaterial({map:plateTex(C),roughness:.7,metalness:.6}),dark:new T.MeshStandardMaterial({color:0x22241c,roughness:.6,metalness:.6}),
 wp:new T.MeshBasicMaterial({color:new T.Color(0xffa020).multiplyScalar(3.2),toneMapped:false}),wpX:new T.MeshStandardMaterial({color:0x111010,roughness:1}),hot:new T.MeshBasicMaterial({color:new T.Color(0xff6a20).multiplyScalar(3),toneMapped:false})});return MT}
function model(C){if(!_pl)_pl=new C.V3();const T=C.THREE,M=mats(C),g=C.group(),hull=new T.MeshStandardMaterial({map:hullTex(C),roughness:.6,metalness:.5});
 C.mesh(g,new T.CylinderGeometry(3,3,34,32,1,true).rotateX(Math.PI/2),hull);C.mesh(g,new T.LatheGeometry([[3,0],[2.8,2.5],[2.2,4.8],[1.2,6.6],[0,7.4]].map(([r,y])=>new T.Vector2(r,y)),28).rotateX(Math.PI/2).translate(0,0,17),hull);
 C.mesh(g,new T.CylinderGeometry(3,1.8,3,28).rotateX(Math.PI/2),M.dark,0,0,-18.5);C.mesh(g,new T.CircleGeometry(1.6,20),M.hot,0,0,-20.05,false).rotation.y=Math.PI;
 for(let k=0;k<4;k++){const f=C.mesh(g,new T.BoxGeometry(.35,6,6),M.dark,0,0,-14);const a=k*Math.PI/2+Math.PI/4;f.position.set(Math.cos(a)*5,Math.sin(a)*5,-14);f.rotation.z=a+Math.PI/2}
 for(const s of[-1,1]){C.mesh(g,new T.BoxGeometry(1.6,1.2,5),M.dark,s*2.2,2.5,-8.4);const e=C.mesh(g,new T.PlaneGeometry(4.2,4.2),M.emb,s*3.02,0,9,false);e.rotation.y=s*Math.PI/2}
 const wps=WP.map(([x,y,z])=>{const m=C.mesh(g,new T.SphereGeometry(.95,14,10),M.wp,x,y,z,false);const r=C.mesh(g,new T.TorusGeometry(1.25,.18,6,18),M.dark,x,y,z,false);r.lookAt(x*2,y*2,z+(z>20?5:0));return m});
 // armour plates: the ones over the stage 2 and 3 weak points, and hull plates that come off as it degrades
 const plates=[],pl=(ang,z,cover,len=6)=>{const m=C.mesh(g,new T.BoxGeometry(3,.28,len),M.plate,Math.cos(ang)*3.15,Math.sin(ang)*3.15,z);m.rotation.z=ang-Math.PI/2;plates.push({m,cover,on:1});return m};
 pl(0,0,2);pl(Math.PI,0,3);pl(-Math.PI/2,5,4);const cap=C.mesh(g,new T.ConeGeometry(1.4,2.2,16).rotateX(Math.PI/2),M.plate,0,0,24.2);plates.push({m:cap,cover:5,on:1});
 for(const a of[.8,2.35,3.9,5.5])for(const z of[-6,8])pl(a,z,-1,5);
 Object.assign(g.userData,{hull,wps,plates,applied:WP.map(()=>0),deb:[]});return g}
const alive=t=>t.bs.wm??63;
const stageOf=t=>{const m=alive(t);for(let s=0;s<3;s++)if(WP.some((w,i)=>w[3]===s&&m>>i&1))return s;return 3};
const exposed=t=>{const s=stageOf(t),m=alive(t);return WP.map((w,i)=>i).filter(i=>WP[i][3]===s&&m>>i&1)};
const wpWorld=(C,t,i)=>{t.mesh.updateMatrixWorld();return new C.V3(WP[i][0],WP[i][1],WP[i][2]).applyMatrix4(t.mesh.matrixWorld)};
const DEB=[];
const _hz={x:0,y:0,z:0};  // haze emit point (reused)

function blow(C,t,p){const g=t.mesh;p.m.updateMatrixWorld();const wp=new C.V3(),q=new C.THREE.Quaternion();p.m.getWorldPosition(wp);p.m.getWorldQuaternion(q);g.remove(p.m);p.on=0;
 p.m.position.copy(wp);p.m.quaternion.copy(q);C.api.scene.add(p.m);const out=wp.clone().sub(t.p).normalize();DEB.push({m:p.m,v:out.multiplyScalar(C.rnd(14,26)).add(t.v.clone().multiplyScalar(.6)),w:new C.V3(C.rnd(-4,4),C.rnd(-4,4),C.rnd(-4,4)),life:6});
 C.FX.emit(wp,0xfff0c0,40,18,.5,null,3);C.api.boom(wp,1.6)}
registerBoss({id:'jugg',n:'Juggernaut',tag:'JUGGERNAUT',col:'#ffb020',spd:34,alt:[140,160],hitR:4,det:16000,cash:2000,bounty:6000,far:5600,
 resist:{sam:.35,idome:.35},burst:1,hp:C=>6/C.hpK(),phases:['ARMOURED','BREACHED','CORE EXPOSED'],phaseAt:[.67,.34],
 note:'a building-sized armoured cruise missile. Only bursts on its glowing weak points hurt it; each stage cleared blows the armour off the next. It hits for 350.',warn:'a building-sized missile',
 spawn:{event:{from:25,p:.04},boss:20},
 intro:{title:'JUGGERNAUT',sub:C=>`armoured · ${WP.length} weak points in three stages · ${C.rec().b.jugg?.lost|0} sites flattened`,col:'#ffb020',radio:'Radar has a monster: one huge, slow cruise missile. Only the glowing weak points will crack it.'},
 build:C=>model(C),
 init(C,t){const B=t.bs;B.wm=63;let b=null;for(const s of C.sites())if(!b||s.hp>b.hp)b=s;B.site=b||t.tgt;t.tgt=B.site;t.aim=B.site.aims[0];t.p.y=C.api.gh(t.p.x,t.p.z)+150},
 tick(C,t,dt){const B=t.bs,s=B.site;if(!s||s.hp<=0){let b=null;for(const q of C.sites())if(!b||q.hp>b.hp)b=q;B.site=b;if(!b)return true}
  const S=B.site,dh=Math.hypot(S.x-t.p.x,S.z-t.p.z),spd=34*(1-.08*stageOf(t));
  if(dh<160||B.dive){B.dive=1;C.steer(t,C.dirTo(t,new C.V3(S.x,S.y+2,S.z)),spd*1.6,.6,dt,0);if(t.p.distanceTo(new C.V3(S.x,S.y+2,S.z))<14||t.p.y<S.y+6){C.strike(t,S,350);C.api.boom(t.p,8);C.api.shake=1;
   C.api.feed(`<span class="cr">The Juggernaut hit the ${S.n.toLowerCase()}</span>`);C.vanish(t,'impacted')}return true}
  C.steer(t,C.levelTo(t,new C.V3(S.x,0,S.z),150),spd,.22,dt,90);return true},
 hit(C,t,h){const E=exposed(t);if(!E.length)return 0;let i=-1;
  if(h.src==='h'){if(Math.random()<.5)i=C.pick(E);else{h.txt='ARMOUR';return 0}}
  else if(h.at){let bd=1e9;for(const j of E){const d=wpWorld(C,t,j).distanceTo(h.at);if(d<bd){bd=d;i=j}}if(bd>5.5){h.txt='ARMOUR · hit a glowing weak point';return 0}}
  else if(h.r!=null){let bd=1e9;for(const j of E){const d=Math.abs(h.r-Math.hypot(WP[j][0],WP[j][1],WP[j][2]));if(d<bd){bd=d;i=j}}if(bd>4){h.txt='ARMOUR';return 0}}else{h.txt='ARMOUR';return 0}
  const s0=stageOf(t);t.bs.wm=alive(t)&~(1<<i);const s1=stageOf(t);h.txt='WEAK POINT';if(s1>s0&&s1<3)C.Z.an?.say('ARMOUR BLOWN OFF','new weak points exposed','#ffb020',2);return 1},
 vis(C,t,dt){const U=t.mesh.userData,m=alive(t),B=t.bs,f=1-(B.hp??6)/(B.max||6),st=stageOf(t),T=performance.now()/1000;
  for(let i=0;i<WP.length;i++){const w=U.wps[i];if(!(m>>i&1)&&!U.applied[i]){U.applied[i]=1;w.material=mats(C).wpX;w.scale.setScalar(.7);
    const P=U.plates.filter(p=>p.on&&p.cover<0);if(P.length)blow(C,t,C.pick(P));C.api.boom(wpWorld(C,t,i),2.5)}
   if(m>>i&1)w.scale.setScalar(WP[i][3]===st?1+.25*Math.sin(T*6+i):.001)}
  for(const p of U.plates)if(p.on&&p.cover>=0&&WP[p.cover][3]<=st)blow(C,t,p);
  U.hull.color.setScalar(1-.55*f);
  if((B.pl=(B.pl||0)-dt)<=0){B.pl=.32-.22*f;const k=t.mesh.localToWorld(_pl.set(C.rnd(-3,3),C.rnd(0,4),-22));C.haze(k,f>.3?0x1e1c1a:0x4a4640,.3+.3*f,40,2)}  // the pall: lingers along the route
  if((B.sm=(B.sm||0)-dt)<=0){B.sm=Math.max(.025,.2-.18*f);C.SMK.emit(t.p.clone().addScaledVector(t.v.clone().normalize(),-20),f>.3?0x1c1a18:0x6a665e,1+Math.round(f*2),2,5+6*f,null,1,.75)}
  for(let i=0;i<WP.length;i++)if(U.applied[i]){const p=wpWorld(C,t,i);if(Math.random()<.5)C.FX.emit(p,Math.random()<.5?0xff7a20:0xffb040,2,3,.5,null,2.5);if(Math.random()<.15)C.SMK.emit(p,0x2a2622,1,1.5,4,null,1,.7)}
  if(f>0&&Math.random()<f*dt*6){const a=Math.random()*6.28,p=t.mesh.localToWorld(new C.V3(Math.cos(a)*3,Math.sin(a)*3,C.rnd(-15,15)));C.FX.emit(p,0xfff4d0,14,16,.25,null,3.5)}},
 overlay(C,oc,t,W,H){const{api}=C,cam=api.camera;if(t.p.distanceTo(cam.position)>2500)return;oc.strokeStyle=oc.fillStyle='#ffb020';oc.lineWidth=2;
  for(const i of exposed(t)){const q=wpWorld(C,t,i).project(cam);if(q.z>1||Math.abs(q.x)>1||Math.abs(q.y)>1)continue;const X=(q.x*.5+.5)*W,Y=(-q.y*.5+.5)*H,R=12+4*Math.sin(performance.now()/120);oc.beginPath();oc.arc(X,Y,R,0,7);oc.stroke();oc.fillText('WEAK POINT',X,Y-R-6)}
  const S=t.bs.site;if(S){const q=t.p.clone().project(cam);if(q.z<1)oc.fillText(`→ ${S.n} ${Math.ceil(Math.hypot(S.x-t.p.x,S.z-t.p.z)/Math.max(1,t.spd))} s`,(q.x*.5+.5)*W,(-q.y*.5+.5)*H+46)}},
 atmos(C,t,o){const B=t.bs,f=1-(B.hp??6)/(B.max||6);o.fog=.5-.25*f;o.fogC.set(0x37322d);o.fogMix=.5+.3*f;o.light=.75-.25*f;o.dark=.15+.3*f;o.desat=.15+.2*f;o.vign=.2+.2*f;o.tint.set(0xd8b890);o.tintA=.08+.08*f;return .6+.4*f},
 status(C,e){const t=e.main,E=exposed(t),S=t.bs.site||t.tgt;  /* a co-op client's copy has the target from the snapshot's statics, not the host's bs.site */return`weak points <b>${E.length}</b> glowing · ${Math.max(0,t.bs.hp)} left in all${S?` · → ${S.n} in <b>${Math.ceil(Math.hypot(S.x-t.p.x,S.z-t.p.z)/Math.max(1,t.spd))} s</b>`:''} · only weak-point hits count`},
 netOut:(C,t)=>[alive(t)],netIn(C,t,a){if(Number.isFinite(a[0]))t.bs.wm=a[0]},
 aim(C,t,s){const E=exposed(t);if(!E.length)return null;const p=wpWorld(C,t,C.pick(E));if(Math.random()>s)p.add(new C.V3(0,8,0));return{p,v:t.v}},
 winTxt:'The Juggernaut is down. Scrap metal everywhere.',
 clear(C){for(const d of DEB){C.api.scene.remove(d.m);d.m.geometry.dispose()}DEB.length=0},fxLeft:()=>({debris:DEB.length}),
 g:{vis(C,dt){for(let i=DEB.length-1;i>=0;i--){const d=DEB[i];d.life-=dt;d.v.y-=9.8*dt;d.m.position.addScaledVector(d.v,dt);d.m.rotation.x+=d.w.x*dt;d.m.rotation.y+=d.w.y*dt;
   if(Math.random()<.3)C.SMK.emit(d.m.position,0x2a2622,1,1,2.5,null,1,.6);if(d.life<=0||d.m.position.y<C.api.gh(d.m.position.x,d.m.position.z)){C.api.scene.remove(d.m);d.m.geometry.dispose();DEB.splice(i,1)}}},
  stop(C){for(const d of DEB){C.api.scene.remove(d.m);d.m.geometry.dispose()}DEB.length=0}},
 sting(S){const t0=S.t+.05,o=S.out(1);for(const f of[41.2,61.7,82.4]){const x=S.osc('sawtooth',f,t0,4),lp=S.filt('lowpass',260,2);x.connect(lp).connect(S.env(t0,.14,.6,4,o))}  // a horn from the deep
  for(let i=0;i<3;i++){const n=S.nz(t0+1+i*.55,.3),b=S.filt('bandpass',2600,6);n.connect(b).connect(S.env(t0+1+i*.55,.12,.002,.3,o))}},  // steel clanks
 loop(S){const o=S.out(0),x=S.osc('sawtooth',38,S.t,0),lp=S.filt('lowpass',180,2),am=S.osc('sine',2,S.t,0),ag=x.context.createGain(),vg=x.context.createGain();ag.gain.value=.5;vg.gain.value=.6;am.connect(ag).connect(vg.gain);x.connect(lp).connect(vg).connect(o);return{g:o,stop(){x.stop();am.stop()}}},
 loopVol:(C,t)=>C.cl(1-t.p.distanceTo(C.api.camera.position)/3500,0,1)**2*.12,
 reward:{id:'plating',n:'Salvaged Plating',short:'sites take 15% less damage',txt:'The Juggernaut\'s armour, bolted onto your sites: every hit on a site does 15% less damage for the rest of the run.',
  impact(C,s,lost){if(C.auth()&&lost>0)s.hp=Math.min(s.max,s.hp+Math.round(lost*.15))}}});
