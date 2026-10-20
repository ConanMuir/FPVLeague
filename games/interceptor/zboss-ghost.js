// Boss: the Ghost, a stealth flying wing. It is not on your radar and gets no bracket until you see it with your own eyes (1.2 km, 2.5 km on
// the thermal camera, where its exhaust slots glow white). Find it by what it leaves: a long white contrail while it cruises high (HIGH), a
// faint heat shimmer behind it, and after the first hit a dark fuel-leak trail (WOUNDED, it drops low and runs faster). Your lock slips off
// it after about 2 s and cannot re-lock for 3 s, so close in on the trail and burst by eye. It makes three bombing passes (a bomb you can see
// fall, 90 damage) and then leaves. LAST PASS: hurt badly it dives at treetop height for the weakest site. Beaten: the Spectre Optics trophy.
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
import {KIND} from './zdata.js';
function ramTex(C){return C.decal('gh-ram',512,512,(g,w,h)=>{g.fillStyle='#1b1d20';g.fillRect(0,0,w,h);g.strokeStyle='rgba(60,64,70,.5)';g.lineWidth=1;for(let i=0;i<w;i+=16){g.beginPath();g.moveTo(i,0);g.lineTo(i+h*.3,h);g.stroke();g.beginPath();g.moveTo(0,i);g.lineTo(w,i-w*.3);g.stroke()}
 g.fillStyle='rgba(40,42,48,.9)';for(let k=0;k<8;k++){const x=C.rnd(40,w-80),y=C.rnd(40,h-60);g.beginPath();g.moveTo(x,y);g.lineTo(x+60,y+12);g.lineTo(x+40,y+30);g.closePath();g.fill()}  // RAM patches
 C.D2.text(g,'G-0',w*.78,h*.62,30,'rgba(70,74,80,.9)','900');C.D2.text(g,'NO STEP',w*.3,h*.4,16,'rgba(70,74,80,.9)','700');C.D2.grime(g,w,h,.05)})}
function wraith(C){return C.decal('gh-wraith',256,256,(g,w)=>{const c=w/2;g.fillStyle='rgba(56,60,66,.95)';g.beginPath();g.moveTo(c-60,c+90);g.quadraticCurveTo(c-70,c-90,c,c-96);g.quadraticCurveTo(c+70,c-90,c+60,c+90);
 for(let i=0;i<5;i++)g.lineTo(c+60-i*30-15,c+(i%2?90:70));g.closePath();g.fill();g.fillStyle='#16181b';for(const s of[-1,1]){g.beginPath();g.ellipse(c+s*22,c-30,10,16,0,0,7);g.fill()}g.beginPath();g.ellipse(c,c+8,14,22,0,0,7);g.fill()})}  // low-vis wraith
const MT={};
function mats(C){if(MT.ram)return MT;const T=C.THREE;return Object.assign(MT,{ram:new T.MeshStandardMaterial({map:ramTex(C),roughness:.85,metalness:.2}),
 slot:new T.MeshStandardMaterial({color:0x101010,roughness:.5,emissive:new T.Color(0xffffff),emissiveIntensity:0}),
 ins:new T.MeshBasicMaterial({map:wraith(C),transparent:true,alphaTest:.05,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})})}
function model(C){const T=C.THREE,M=mats(C),g=C.group(),s=new T.Shape();s.moveTo(0,11);s.lineTo(17,-1.5);s.lineTo(15,-3.5);s.lineTo(11,-1.4);s.lineTo(7.5,-4.2);s.lineTo(4,-1.6);s.lineTo(0,-4.4);s.lineTo(-4,-1.6);s.lineTo(-7.5,-4.2);s.lineTo(-11,-1.4);s.lineTo(-15,-3.5);s.lineTo(-17,-1.5);s.closePath();
 const geo=new T.ExtrudeGeometry(s,{depth:.9,bevelEnabled:true,bevelThickness:.35,bevelSize:.5,bevelSegments:2}).rotateX(Math.PI/2).translate(0,.45,0);const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+17)/34,(uv.getY(i)+5)/16);
 C.mesh(g,geo,M.ram);C.mesh(g,new T.SphereGeometry(2.2,16,8,0,Math.PI*2,0,Math.PI/2).scale(1,.45,2.4),M.ram,0,.8,3);
 for(const x of[-3.4,3.4]){C.mesh(g,new T.BoxGeometry(2,.15,1.1),M.slot,x,1.15,-2.4)}
 for(const x of[-9,9]){const i=C.mesh(g,new T.PlaneGeometry(2.4,2.4),M.ins,x,1.12,1.2,false);i.rotation.x=-Math.PI/2}
 const sh=[];for(const x of[-3.4,3.4]){const p=new T.Sprite(new T.SpriteMaterial({map:dot,color:new T.Color(0xffffff),transparent:true,opacity:.08,depthWrite:false,blending:T.AdditiveBlending}));p.scale.set(6,3,1);p.position.set(x,1.4,-5);g.add(p);sh.push(p)}
 g.userData.sh=sh;return g}
const BOMBS=[];
const seenBy=(C,t)=>C.pilots().some(d=>d.p.distanceTo(t.p)<(C.api.thermLook?2500:1200));
registerBoss({id:'ghost',n:'Ghost',tag:'GHOST',col:'#b8c4d0',spd:75,alt:[1050,1150],hitR:4,det:9000,cash:1200,bounty:5000,far:6500,
 resist:{gepard:.3,sam:.5,mpads:.2},hp:4,phases:['HIGH','WOUNDED','LAST PASS'],phaseAt:[.75,.26],
 note:'a stealth bomber: no radar track, no bracket. Find its contrail, its heat shimmer (thermal sees it farther) or its leak trail; your lock slips off it.',warn:'something on the edge of the radar',
 spawn:{event:{from:16,p:.05},boss:40},
 intro:{title:'GHOST',sub:'stealth bomber · no radar track · follow the contrail',col:'#b8c4d0',radio:'A flash on the scope and gone. Stealth bomber. Eyes up, look for the contrail.'},
 build:C=>model(C),
 init(C,t){const B=t.bs;B.pass=0;B.site=null;t.p.y=C.api.gh(t.p.x,t.p.z)+1100},
 tick(C,t,dt){const B=t.bs,{api}=C;B.lcd=Math.max(0,(B.lcd||0)-dt);
  if(B.pass>=3||B.leave){const e=t.p.clone().setY(0).normalize().multiplyScalar(6000);C.steer(t,C.levelTo(t,e,B.ph?300:1100),90,.4,dt,60);if(Math.abs(t.p.x)>4600||Math.abs(t.p.z)>4600)C.vanish(t,'escaped');return true}
  if(!B.site||B.site.hp<=0){const L=C.sites();if(!L.length)return true;B.site=B.ph>=2?L.reduce((a,b)=>a.hp<b.hp?a:b):C.pick(L);B.out=0}
  const S=B.site,dh=Math.hypot(S.x-t.p.x,S.z-t.p.z),alt=B.ph>=2?120:B.ph?320:1100,spd=B.ph?95:75;
  if(B.out>0){B.out-=dt;C.steer(t,t.v.clone().setY(0).normalize(),spd,.2,dt,80);if(B.out<=0)B.site=null;return true}
  C.steer(t,C.levelTo(t,new C.V3(S.x,0,S.z),alt),spd,.35,dt,70);
  // bombs away a little before overhead, so the bomb falls onto the site
  const lead=Math.sqrt(2*Math.max(1,t.p.y-S.y)/9.8)*spd;if(dh<lead+20&&!B.drop){B.drop=1;BOMBS.push({p:t.p.clone(),v:t.v.clone(),s:S,t});C.Z.an?.say('BOMBS AWAY','the Ghost is over the '+S.n.toLowerCase(),'#ff4d4d',1)}
  if(B.drop&&dh>lead+300){B.drop=0;B.pass++;B.out=22}return true},
 seen:(C,t)=>seenBy(C,t),hid:(C,t)=>!seenBy(C,t),lockSelf:(C,t)=>t.bs.lcd>0?1e3:1.6,
 hit(C,t,h){return h.q==='kill'?2:1},
 phase(C,t,i){if(i===1)C.api.feed('<span class="co">The Ghost is leaking fuel: follow the dark trail. It is running low and fast.</span>');if(i===2)C.api.feed('<span class="cr">The Ghost is diving for your weakest site!</span>')},
 status(C,e){const B=e.main.bs;return`passes ${B.pass|0}/3 · ${B.ph?'<b>LEAK TRAIL</b>':'<b>CONTRAIL</b> high'} · not on radar · lock slips after 2 s${C.api.thermLook?' · <b>THERMAL</b>: you see it farther':' · thermal (H) sees it farther'}`},
 vis(C,t,dt){const B=t.bs,M=mats(C),{api,Z}=C;M.slot.emissiveIntensity=api.thermLook?2.5:0;const f=t.v.clone().normalize();
  for(const s of t.mesh.userData.sh){s.material.opacity=.06+.05*Math.sin(performance.now()/40+s.position.x);s.scale.set(6+Math.sin(performance.now()/70)*1.5,3,1)}
  if((B.ct=(B.ct||0)-dt)<=0){B.ct=.15;for(const x of[-3.4,3.4]){const p=t.mesh.localToWorld(new C.V3(x,1,-8));
   if(B.ph===0&&t.p.y-api.gh(t.p.x,t.p.z)>800)C.SMK.emit(p,0xf4f6f8,1,.3,14,null,1.1,.55);else if(B.ph>0)C.SMK.emit(p,0x24221f,1,.6,9,null,1,.7)}}
  // the lock slips: about 2 s held, then 3 s before it can be locked again (each screen runs its own lock)
  if(Z.lk?.t===t){B.lh=(B.lh||0)+dt;if(B.lh>2.1){Z.lk.clear();B.lh=0;B.lcd=3;api.banner('LOCK SLIPPED','co',1)}}else B.lh=0},
 netOut:(C,t)=>[t.bs.pass|0],netIn(C,t,a){t.bs.pass=a[0]|0},
 aim(C,t,s){if(Math.random()>s*.8)return null;return{p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s?-1:-8)}},
 winTxt:'The Ghost is down. Nobody saw it coming, not even it.',escTxt:'slipped away',
 clear(){BOMBS.length=0},fxLeft:()=>({bombs:BOMBS.length}),
 g:{step(C,dt){if(!C.auth())return;for(let i=BOMBS.length-1;i>=0;i--){const b=BOMBS[i];b.v.y-=9.8*dt;b.v.multiplyScalar(1-.05*dt);b.p.addScaledVector(b.v,dt);if(Math.random()<.4)C.SMK.emit(b.p,0x7a766e,1,.5,2,null,1,.5);
   if(b.p.y<=C.api.gh(b.p.x,b.p.z)+2){BOMBS.splice(i,1);C.api.boom(b.p,5);const d=Math.hypot(b.p.x-b.s.x,b.p.z-b.s.z);if(b.s.hp>0&&d<220)C.strike(b.t,b.s,90)}}},stop(){BOMBS.length=0}},
 sting(S){const t0=S.t+.05,o=S.out(1),n=S.nz(t0,4),f=S.filt('bandpass',500,2);f.frequency.setValueAtTime(260,t0);f.frequency.linearRampToValueAtTime(900,t0+2);f.frequency.linearRampToValueAtTime(300,t0+4);n.connect(f).connect(S.env(t0,.2,1.5,4,o));  // a hollow wind
  for(let i=0;i<4;i++){const x=S.osc('sine',52,t0+.6+i*.85,.25);x.frequency.exponentialRampToValueAtTime(34,t0+.85+i*.85);x.connect(S.env(t0+.6+i*.85,.3,.01,.25,o))}},  // a heartbeat
 loop(S){const o=S.out(0),n=S.nz(S.t,0),f=S.filt('lowpass',320,1.5);n.connect(f).connect(o);return{g:o,stop(){n.stop()}}},
 loopVol:(C,t)=>C.cl(1-t.p.distanceTo(C.api.camera.position)/1800,0,1)**2*.18,
 reward:{id:'spectre',n:'Spectre Optics',short:'cruise missiles seen 50% farther; decoys always flagged',txt:'The Ghost\'s sensor suite: your radar picks up cruise missiles 50% farther out and every decoy is identified at any range.',
  seen(C,t){if(t.k!=='cruise')return null;const pd=C.api.PADP;return Math.hypot(t.p.x-pd.x,t.p.z-pd.z)<KIND.cruise.det*1.5*(C.Z.radarK?.()??1)},ident:(C,t)=>t?.k==='decoy'}});
