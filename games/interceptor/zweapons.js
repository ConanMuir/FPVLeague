// Zombies pilot weapons (numbers in zarsdata.js). One weapon is loaded at a time, picked on the base screen (Shop tab, Pilot weapon, zarsenal.js):
//  std      Riley's fragmentation warhead, as before (zombies.js Z.detonate)
//  net      catches the closest slow, small drone within the net's reach and tows it into a field intact; a capture pays a bonus
//  emp      a small blast plus a pulse that disables every track nearby for a few seconds (slow, sinking, no jinking); helpers, the swarm and
//           lasers get a bonus against disabled tracks (Z.helperHit / Z.jink are wrapped here)
//  flech    a cone of darts ahead of the flight path: forgiving, multi-kill, useless against armor
//  dart     no explosive: kills whatever it physically hits (armor, a Mothership stage, fast missiles with a wider window); a miss costs nothing
//  cluster  a weak main charge plus bomblets that home on the small tracks around
//  flare    the standard warhead plus a pod: chaff bursts decoy jets and cruise missiles near you; flares beat AA and patrols on sorties
//           (Z.so.W.onHit is wrapped when zsortie.js is in the build) and any counter-fire that asks Z.flareSave
// Every detonation is measured (miss distance, closing speed, angle off the nose per track) and resolved by resolve(): solo and on the host
// directly, on a co-op client as an ['A','det', ...] request that the host resolves with the same code (zarsenal.js routes it).
import {KIND} from './zdata.js';
import {WPN,NET,EMP,FLECH,DART,CLUSTER,FLARE} from './zarsdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a);
export function initWeapons(api,G,Z,A){
 const {THREE,TH,scene,feed,banner}=api,V3=THREE.Vector3,_a=new V3(),_b=new V3(),_c=new V3(),live=api.live,snd=A.snd;
 const lvW=key=>key===A.me()?Z.perkLevel('warhead'):Z.arsNet?.perk(key,'warhead')|0;
 const kOf=t=>KIND[t.k]||KIND.shahed;
 // credit a track to the pilot with this key (solo / the host's own: 'p'; another co-op pilot: 'o')
 const who=(t,key)=>{if(key===A.me()||!Z.arsNet)t.by='p';else Z.arsNet.who(t,key)};
 const pkR=(r,cv,LE)=>{const re=r+cv*api.FDLY;return re<1.2?1:Math.exp(-(((re-1.2)/(2.5*LE/4))**2))};  // Riley's kill model with another lethal radius

 // ---------- measuring a burst: per live track within 400 m, its miss distance, closing speed and the cosine of its angle off your heading ----------
 const heading=(d,o)=>{if(d.v.lengthSq()>100)return o.copy(d.v).normalize();o.set(0,1,-1).applyQuaternion(d.q).setY(0);return o.lengthSq()>1e-4?o.normalize():o.set(0,0,-1)};
 function measure(d){const h=heading(d,_c),M=[];for(const t of TH){if(!live(t))continue;const r=t.p.distanceTo(d.p);if(r>400)continue;_a.subVectors(t.p,d.p);
   const cv=Math.max(0,-_b.subVectors(t.v,d.v).dot(_a)/(r||1)),c=r>.01?_a.dot(h)/r:1;M.push({t,r,cv,c})}return M}

 // ---------- resolve a weapon's burst (solo, or the host for any pilot): returns the readout ----------
 // p, v: the drone's position and velocity at the burst; M: measurements; key: whose burst
 function resolve(w,p,v,M,key){const lv=lvW(key),out=[];let kills=0,dmg=0,txt='',col='cg';G.burst={n:0};
  const blast=LE=>{for(const m of M){const t=m.t,K=kOf(t);if(!live(t)||m.r>30)continue;who(t,key);
   if(m.r<K.hitR&&K.armor!=='boss'){api.killThreat(t,true);kills++;out.push(`<span class="cg">${Z.tname(t)} direct hit</span>`);continue}if(K.armor==='hard'||t.k==='boss')continue;
   if(Math.random()<pkR(m.r,m.cv,LE)){if(K.armor===1){api.damage(t);dmg++}else{api.killThreat(t,m.r<2.4&&Math.random()<.55);kills++;out.push(`<span class="cg">${Z.tname(t)} down</span> (${m.r.toFixed(1)} m)`)}}}};
  if(w==='net'){const R=NET.r+NET.rK*lv,near=M.filter(m=>live(m.t)&&m.r<R).sort((a,b)=>a.r-b.r),ok=near.find(m=>netOK(m.t));
   if(ok){capture(ok.t,key,v);kills=1;txt=`NETTED — ${kOf(ok.t).tag}`;out.push(`<span class="cg">${Z.tname(ok.t)} captured intact</span> (+${Math.round(NET.bonus*100)}%)`)}
   else if(near.length){txt=`NET CAN'T HOLD A ${kOf(near[0].t).tag}`;col='cr';out.push(`<span class="co">${Z.tname(near[0].t)} is too ${near[0].t.spd>NET.spd?'fast':'big'} for the net</span>`)}
   else{const nr=M.reduce((a,m)=>Math.min(a,m.r),1e9);txt=nr<300?`NET MISSED BY ${Math.round(nr)} m`:'NET EMPTY';col='cr'}}
  else if(w==='emp'){blast(api.LETH*EMP.kill);const n=stun(p,EMP.r+EMP.rK*lv);txt=`EMP — ${n} DISABLED${kills?` · ${kills} DOWN`:''}`;col=n?'cg':'cr';out.push(`<span class="cb">EMP: ${n} track${n===1?'':'s'} disabled for ${EMP.stun} s</span>`)}
  else if(w==='flech'){const R=FLECH.r+FLECH.rK*lv,cc=Math.cos(FLECH.cone*Math.PI/180);
   for(const m of M){const t=m.t,K=kOf(t);if(!live(t)||m.r>R)continue;who(t,key);const contact=m.r<K.hitR;
    if(!contact&&m.c<cc)continue;if(K.armor==='hard'||t.k==='boss'){if(contact&&K.armor==='hard'){api.killThreat(t,true);kills++}continue}
    const p0=contact||m.r<=FLECH.near?FLECH.pNear:FLECH.pNear+(FLECH.pFar-FLECH.pNear)*(m.r-FLECH.near)/(R-FLECH.near);
    if(Math.random()<p0){if(K.armor===1){if(!t.dmg){api.damage(t);dmg++}out.push(`<span class="co">${Z.tname(t)}: the darts bounce off the armor</span>`)}else{api.killThreat(t,Math.random()<.3);kills++;out.push(`<span class="cg">${Z.tname(t)} shredded</span> (${m.r.toFixed(1)} m)`)}}}
   txt=kills?`FLECHETTE — ${kills} DOWN`:dmg?'FLECHETTE — ARMOR HELD':'FLECHETTE MISSED';col=kills?'cg':dmg?'co':'cr'}
  else if(w==='dart'){const m=M.filter(m=>live(m.t)).sort((a,b)=>a.r-b.r)[0];if(m){const t=m.t;who(t,key);if(t.k==='boss'){Z.bossHit(t);txt='DART — STAGE DOWN'}else{api.killThreat(t,true);txt=`DART — ${kOf(t).tag} DESTROYED`}kills=1;out.push(`<span class="cg">${Z.tname(t)}: kinetic kill</span>`)}else{txt='DART: NO CONTACT';col='cr'}}
  else if(w==='cluster'){blast(api.LETH*CLUSTER.kill);const n=bomblets(p,v,key);txt=`CLUSTER — ${n} BOMBLET${n===1?'':'S'} ON TARGET${kills?` · ${kills} DOWN`:''}`;col=n||kills?'cg':'cr';if(n)kills=Math.max(kills,.5)}
  const k=G.burst.n;G.burst=null;if(!txt)txt=k?`HIT — ${k}`:'MISSED';
  return{txt,col,kills,dmg,out}}
 const netOK=t=>{const K=kOf(t);return K.armor===0&&t.k!=='boss'&&K.hitR<=NET.size&&t.spd<=NET.spd};
 A.netOK=netOK;

 // ---------- net capture: the track is paid as a kill plus the capture bonus, then towed down into a field (st 'cap', drawn until it lands) ----------
 function capture(t,key,v){who(t,key);Z.kill(t,false);const K=kOf(t);Z.earn(K.cash*NET.bonus,t.p,' CAPTURED');capFx(t,v);A.ev(['cap',t.id])}
 function capFx(t,v){t.st='cap';t.capT=0;t.net=0;t.cp0=t.p.clone();const f=_a.set(v?.x||t.v.x,0,v?.z||t.v.z);if(f.lengthSq()<1)f.set(0,0,-1);f.setLength(rnd(60,110));
  t.cp1=new V3(t.p.x+f.x,0,t.p.z+f.z);t.cp1.y=api.gh(t.cp1.x,t.cp1.z)+.4;t.capN=netMesh();NETS.add(t);snd.net(t.p);Z.pop(t.p,'NETTED','#9fe8ff')}
 const NM=new THREE.MeshBasicMaterial({color:0xdfe8ee,wireframe:true,transparent:true,opacity:.85}),NG=new THREE.IcosahedronGeometry(2.6,1),LM=new THREE.LineBasicMaterial({color:0xcfd6dc});
 function netMesh(){const g=new THREE.Group(),n=new THREE.Mesh(NG,NM);g.add(n);const tug=new THREE.Mesh(new THREE.BoxGeometry(.9,.25,.9),new THREE.MeshStandardMaterial({color:0x4f5a35,roughness:.6}));tug.position.y=9;g.add(tug);
  const lg=new THREE.BufferGeometry().setFromPoints([new V3(0,2.4,0),new V3(0,9,0)]);g.add(new THREE.Line(lg,LM));g.userData.own=1;scene.add(g);return g}
 function towStep(t,dt){t.capT+=dt;const u=cl(t.capT/NET.tow,0,1),e=u*u*(3-2*u);t.p.lerpVectors(t.cp0,t.cp1,e);t.p.y=t.cp0.y+(t.cp1.y-t.cp0.y)*e+Math.sin(u*Math.PI)*12;
  t.v.subVectors(t.cp1,t.cp0).multiplyScalar(1/NET.tow);t.mesh.position.copy(t.p);if(t.capN){t.capN.position.copy(t.p);t.capN.rotation.y+=dt*.8}
  if(u>=1){t.st='dead';dropNet(t);api.SMK.emit(t.p,0x9a8d68,10,4,2.5,null,1,.6)}}
 const NETS=new Set(),dropNet=t=>{NETS.delete(t);if(!t.capN)return;scene.remove(t.capN);t.capN.traverse(o=>{if(o.geometry&&o.geometry!==NG)o.geometry.dispose()});t.capN=null};

 // ---------- EMP: disable every track (not the fast missiles) within r of p; a Mothership stops launching its swarms ----------
 function stun(p,r){const ids=[];for(const t of TH){if(!live(t)||kOf(t).armor==='hard'||t.p.distanceTo(p)>r)continue;if(t.k==='boss')t.rel=Math.max(t.rel||0,EMP.boss);
   if(t.st!=='cruise'&&t.k!=='swarm')continue;t.emp=EMP.stun;ids.push(t.id)}
  A.ev(['st',EMP.stun,...ids]);A.ev(['emp',Math.round(p.x),Math.round(p.y),Math.round(p.z),Math.round(r)]);empFx(p,r);return ids.length}
 // disabled: engines and links out, it drifts on at under half speed and sinks (never below 15 m), no steering, no jinking; then it recovers
 function stunStep(t,dt){t.emp-=dt;if(t.pp)t.pp.copy(t.p);else t.pp=t.p.clone();const want=t.cs*EMP.slow;_a.set(t.v.x,0,t.v.z);const h=_a.length();if(h>want)_a.multiplyScalar(Math.max(want/h,1-dt*1.5));
  const g=api.gh(t.p.x,t.p.z);t.v.set(_a.x,t.p.y-g>15?-EMP.sink:0,_a.z);t.p.addScaledVector(t.v,dt);if(t.p.y<g+15)t.p.y=g+15;t.ev=0;t.brk=0;if(t.mesh){t.mesh.position.copy(t.p)}
  if(t.emp<=0){t.emp=0;if(t.k!=='swarm'){t.alt=Math.max(t.alt*.6,t.p.y-g);_a.set(t.v.x,0,t.v.z);if(_a.lengthSq()<1)_a.set(0,0,-1);t.v.copy(_a.setLength(t.spd))}}}
 const ts0=Z.tstep;Z.tstep=(t,dt)=>{if(t.st==='cap'){towStep(t,dt);return true}if(t.emp>0){if(t.net||!live(t)){t.emp-=dt;return ts0(t,dt)}stunStep(t,dt);return true}return ts0(t,dt)};
 // helpers, the swarm and their guns: a disabled track is a sitting duck (more kill chance, no jinking)
 const hh0=Z.helperHit;Z.helperHit=(t,p,direct,dome)=>hh0(t,t.emp>0?Math.min(.95,p*EMP.helperK):p,direct,dome);
 const jk0=Z.jink;Z.jink=t=>t.emp>0?1:jk0(t);
 const lb0=Z.label;Z.label=t=>lb0(t)+(t.emp>0?' <span style="color:#7fd7ff">DISABLED</span>':'');

 // ---------- cluster bomblets: each homes on its own small track (decoys too: no IFF), one roll on arrival ----------
 const BL=[];
 const smallOK=t=>live(t)&&!!CLUSTER.pk[t.k]&&!t.capN;
 function bomblets(p,v,key){const L=TH.filter(t=>smallOK(t)&&t.p.distanceTo(p)<CLUSTER.seek).sort((a,b)=>a.p.distanceTo(p)-b.p.distanceTo(p));if(!L.length){snd.cluster(p,0);return 0}const ids=[];
  for(let i=0;i<CLUSTER.n;i++){const t=L[i%L.length];ids.push(t.id);BL.push({p:p.clone(),v:_a.copy(v).multiplyScalar(.5).add(_b.set(rnd(-1,1),rnd(-.2,1),rnd(-1,1)).multiplyScalar(30)).clone(),t,life:CLUSTER.life,key,auth:true,tr:0})}
  A.ev(['cb',Math.round(p.x),Math.round(p.y),Math.round(p.z),...ids]);snd.cluster(p,CLUSTER.n);api.FX.emit(p,0xffc070,40,14,.4,null,2.5);return Math.min(CLUSTER.n,L.length)}
 function bombStep(dt){for(let i=BL.length-1;i>=0;i--){const b=BL[i];b.life-=dt;let t=b.t;
   if(!t||!live(t)){t=b.t=TH.filter(smallOK).sort((x,y)=>x.p.distanceTo(b.p)-y.p.distanceTo(b.p))[0]||null;if(t&&t.p.distanceTo(b.p)>250)t=b.t=null}
   if(t){_a.subVectors(t.p,b.p);const d=_a.length(),tg=d/CLUSTER.spd;_a.addScaledVector(t.v,Math.min(tg,3)).setLength(CLUSTER.spd);b.v.lerp(_a,Math.min(1,dt*4));
    if(d<CLUSTER.res){BL.splice(i,1);api.boom(b.p,.35);if(b.auth&&Math.random()<CLUSTER.pk[t.k]){who(t,b.key);api.killThreat(t,Math.random()<.5)}continue}}
   else b.v.y-=9.8*dt;
   b.p.addScaledVector(b.v,dt);if(b.life<=0||b.p.y<api.gh(b.p.x,b.p.z)){BL.splice(i,1);api.FX.emit(b.p,0xffa040,8,5,.3,null,2);continue}
   if((b.tr-=dt)<=0){b.tr=.05;api.SMK.emit(b.p,0xcfcac2,1,.6,1.6,null,1,.5);api.FX.emit(b.p,0xffb050,1,1,.15,null,3)}}}

 // ---------- visuals of a burst (on every screen) ----------
 const SHELL=new THREE.Mesh(new THREE.SphereGeometry(1,24,14),new THREE.MeshBasicMaterial({color:new THREE.Color(0x7fd7ff).multiplyScalar(2),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
 SHELL.visible=false;SHELL.frustumCulled=false;scene.add(SHELL);let shT=-1,shR=1;
 function empFx(p,r){SHELL.position.copy(p);shR=r;shT=0;SHELL.visible=true;api.FX.emit(p,0x7fd7ff,160,40,.5,null,3);api.FX.emit(p,0xffffff,40,20,.25,null,3);api.FX.emit(p,0x9fdcff,60,6,1.2,null,2.5);snd.emp(p)}  // electric, not a fireball
 function flechFx(d,p,v){const h=heading(d||{v,q:new THREE.Quaternion()},_c).clone(),up=Math.abs(h.y)<.9?_a.set(0,1,0):_a.set(1,0,0),s1=new V3().crossVectors(h,up).normalize(),s2=new V3().crossVectors(h,s1),tan=Math.tan(FLECH.cone*Math.PI/180);
  for(let i=0;i<26;i++){const a=Math.random()*6.283,r=Math.sqrt(Math.random())*tan,dir=h.clone().addScaledVector(s1,Math.cos(a)*r).addScaledVector(s2,Math.sin(a)*r).normalize();Z.defx.tracer(p,dir.multiplyScalar(700),.025)}
  api.FX.emit(p,0xffe0a0,30,10,.2,null,3);snd.flech(p)}
 function burstFx(w,p,v,d){if(w==='flech')flechFx(d,p,v);else if(w==='dart'){api.FX.emit(p,0xffffff,50,16,.3,null,3);api.FX.emit(p,0xc8d0d8,40,10,.6,null,2);snd.dart(p)}
  else if(w==='net'){snd.netShot(p)}else if(w==='cluster'){api.FX.emit(p,0xffc070,30,10,.3,null,2.5)}}

 // ---------- detonating: the loaded weapon decides (std and the pod's warhead go to zombies.js / znet.js as before) ----------
 const myKey=()=>A.me(),me=()=>api.player;
 let ncT=0;
 const d0=Z.detonate;Z.detonate=()=>{const w=A.cur();if(!G.on||w==='std'||w==='flare'||Z.so?.S?.on)return d0();  /* on a sortie (zsortie.js) F drops its bombs */const d=me();if(!d||d.dead>0)return;
  if(w==='dart'){const t=dartContact(d);if(!t){const n=performance.now();if(n-ncT>1500){ncT=n;banner('DART: RAM IT — NO CONTACT','co',1);snd.click()}return}return go(w,d,[{t,r:t.p.distanceTo(d.p),cv:0,c:1}])}
  go(w,d,measure(d))};
 function go(w,d,M){burstFx(w,d.p,d.v,d);G.detFlag=true;
  if(Z.mirror){Z.req(['A','det',w,M.map(m=>[m.t.id,+m.r.toFixed(2),+m.cv.toFixed(1),+m.c.toFixed(3)]),[+d.p.x.toFixed(1),+d.p.y.toFixed(1),+d.p.z.toFixed(1)],[+d.v.x.toFixed(1),+d.v.y.toFixed(1),+d.v.z.toFixed(1)]]);banner(WPN[w].hud,'co',.8);api.lose(w==='net'||w==='emp'?w:'det');return}
  const R=resolve(w,d.p.clone(),d.v.clone(),M,myKey());readout(R);api.lose(w==='net'||w==='emp'?w:'det')}  // lose('det') is a warhead's fireball
 function readout(R){banner(R.txt,R.col,1.4);G.det={txt:R.txt,t:performance.now()};G.streak=R.kills?G.streak+1:0;
  if(R.kills)api.tone(520,1040,.22,.14,'triangle');else if(R.dmg)api.tone(440,520,.2,.1,'triangle');else api.tone(300,140,.35,.12,'sawtooth');feed(R.out.join('<br>')||R.txt)}
 A.readout=readout;
 // the host resolves another pilot's burst: m = [[track id, miss m, closing m/s, cos off the nose]], p / v as that pilot saw them
 A.hostDet=(key,w,m,p,v)=>{if(!WPN[w]||w==='std'||w==='flare'||!A.P(key).own.has(w))return;const P=new V3(...(Array.isArray(p)?p.slice(0,3).map(Number):[0,0,0])),Vv=new V3(...(Array.isArray(v)?v.slice(0,3).map(Number):[0,0,0]));
  if(![P.x,P.y,P.z,Vv.x,Vv.y,Vv.z].every(Number.isFinite))return;const M=[];
  for(const a of Array.isArray(m)?m.slice(0,60):[]){if(!Array.isArray(a))continue;const t=TH.find(u=>u.id===a[0]);if(!t||!live(t))continue;M.push({t,r:cl(+a[1]||0,0,400),cv:cl(+a[2]||0,0,3000),c:cl(+a[3]||0,-1,1)})}
  burstFx(w,P,Vv,null);const R=resolve(w,P,Vv,M,key);A.ev(['r',key,R.txt,R.col,R.kills?1:0,R.dmg?1:0]);if(R.kills)feed(`<b>${Z.arsNet?.name(key)||'Pilot'}</b> · ${R.txt}`)};
 // the dart's contact: the closest track your drone is touching (swept over the last step for fast closures)
 const dpp=new V3();let dppOk=false;
 function dartContact(d){let b=null,bd=1e9;for(const t of TH){if(!live(t))continue;const K=kOf(t),fast=t.spd>=150||d.v.lengthSq()>150*150,pad=fast?DART.fastPad:DART.pad;let r=t.p.distanceTo(d.p);
   if(fast&&t.pp&&dppOk){const r0=_a.subVectors(t.pp,dpp),dr=_b.subVectors(t.p,d.p).sub(r0),L=dr.lengthSq(),s=L>1e-9?cl(-r0.dot(dr)/L,0,1):0;r=Math.min(r,r0.addScaledVector(dr,s).length())}
   if(r<K.hitR+pad&&r<bd){bd=r;b=t}}return b}

 // ---------- the flare / chaff pod ----------
 // chaff (host / solo): a jet or cruise missile in cruise passing within FLARE.r of a pilot carrying the pod draws a burst (one per track); a decoyed track
 // loses its aim and comes down in a field like a jammed one
 function chaff(dt){const L=Z.arsNet?.pil()||[[myKey(),me()]];for(const[key,d]of L){if(!d||d.dead>0)continue;const P=A.P(key);if(P.cur!=='flare'||P.ch<=0)continue;
   for(const t of TH){if(P.ch<=0)break;if(!live(t)||t.st!=='cruise'||t.spoof||t.chf||!FLARE.kinds.includes(t.k)||t.p.distanceTo(d.p)>FLARE.r)continue;t.chf=1;P.ch--;const ok=Math.random()<FLARE.p;
    if(ok){t.spoof=1;const a=Math.random()*6.28,o=rnd(450,800);t.aim=new V3(t.tgt.x+Math.cos(a)*o,0,t.tgt.z+Math.sin(a)*o);t.aim.y=api.gh(t.aim.x,t.aim.z);t.wps.length=0;feed(`<span class="cb">Chaff: ${Z.tname(t)} decoyed off its target</span>`)}
    else feed(`<span class="co">Chaff: ${Z.tname(t)} burned through it</span>`);
    popFx(d.p,true);A.ev(['ch',key,Math.round(d.p.x),Math.round(d.p.y),Math.round(d.p.z),P.ch,ok?1:0])}}}
 function popFx(p,chaffy){api.FX.emit(p,0xfff0c0,24,12,1.4,_a.set(0,-6,0),3);if(chaffy)api.FX.emit(p,0xd8e0ea,60,8,2.2,_b.set(0,-2,0),1.6);snd.flares(p)}
 A.popFx=popFx;
 // flares against counter-fire: a feature that shoots at a pilot asks Z.flareSave(key, kind) ('aa', 'pat' or anything else) before applying a hit
 Z.flareSave=(key=myKey(),kind='aa')=>{const P=A.P(key);if(P.cur!=='flare'||P.sch<=0)return false;P.sch--;const d=key===myKey()?me():Z.arsNet?.pil()?.find(q=>q[0]===key)?.[1];if(d)popFx(d.p,false);A.ev(['fl',key,P.sch]);
  return Math.random()<(kind==='pat'?FLARE.pat:FLARE.aa)};
 // sorties (zsortie.js / zsites.js, when that branch is in the build): its hit callback W.onHit(key, damage, 'aa' | 'pat') runs on the host; a flare can void it
 function sortieHook(){const W=Z.so?.W;if(!W||W.__fl||typeof W.onHit!=='function')return;const h0=W.onHit;W.onHit=(key,dmg,src)=>{if(Z.flareSave(key,src)){A.ev(['fh',key,src]);if(key===myKey())Z.an?.say('FLARES','beat the '+(src==='pat'?'patrol drone':'AA'),'#ffe08a',1);return}return h0(key,dmg,src)};W.__fl=1}

 // ---------- per step / per frame ----------
 const st0=Z.step;Z.step=dt=>{st0(dt);if(!G.on)return;const d=me();
  if(d&&d.dead<=0){if(A.cur()==='flare')d.mah+=FLARE.amp*dt/3.6;  /* the pod's draw on your pack */
   if(A.cur()==='dart'&&G.state==='wave'){const t=dartContact(d);if(t)go('dart',d,[{t,r:t.p.distanceTo(d.p),cv:0,c:1}])}
   dpp.copy(d.p);dppOk=true}else dppOk=false;
  if(A.auth()){if(G.state==='wave')chaff(dt);sortieHook()}bombStep(dt)};
 const vi0=Z.visuals;Z.visuals=dt=>{vi0(dt);if(shT>=0){shT+=dt;const u=shT/.45;if(u>=1){shT=-1;SHELL.visible=false}else{SHELL.scale.setScalar(Math.max(1,shR*Math.sqrt(u)));SHELL.material.opacity=.35*(1-u)}}
  for(const t of TH)if(t.emp>0&&live(t)&&(t.spk=(t.spk||0)-dt)<=0){t.spk=.12;api.FX.emit(t.p,0x7fd7ff,4,4,.25,null,2.5)}};
 // a new wave: chaff and sortie flares refilled for every pilot with the pod
 A.onWave=()=>{for(const P of A.all())if(P.cur==='flare')P.ch=FLARE.n;Z.pk.apply()};
 // the pod's lighter warhead: the kill radius the perks set (zperk.js apply) minus FLARE.leth while it is loaded
 const pa0=Z.pk.apply;Z.pk.apply=()=>{pa0();if(G.on&&A.cur()==='flare')api.LETH=Math.max(1,api.LETH+FLARE.leth)};
 A.onBase=()=>{for(const P of A.all())P.sch=P.cur==='flare'?FLARE.sortie:0;BL.length=0;for(const t of[...NETS]){if(t.st==='cap')t.st='dead';dropNet(t)}};

 // ---------- co-op events on a client ----------
 A.on.st=a=>{const s=+a[0]||EMP.stun;for(const id of a.slice(1)){const t=TH.find(u=>u.id===id);if(t)t.emp=s}};
 A.on.emp=a=>{if(a.slice(0,4).every(Number.isFinite))empFx(new V3(a[0],a[1],a[2]),cl(a[3],1,200))};
 A.on.cap=a=>{const t=TH.find(u=>u.id===a[0]);if(t&&t.st!=='dead'&&t.st!=='cap')capFx(t,null)};
 A.on.cb=a=>{if(!a.slice(0,3).every(Number.isFinite))return;const p=new V3(a[0],a[1],a[2]);for(const id of a.slice(3,3+CLUSTER.n)){const t=TH.find(u=>u.id===id);BL.push({p:p.clone(),v:new V3(rnd(-30,30),rnd(0,30),rnd(-30,30)),t,life:CLUSTER.life,auth:false,tr:0})}snd.cluster(p,CLUSTER.n)};
 A.on.ch=a=>{const P=A.P(String(a[0]));if(Number.isFinite(a[4]))P.ch=a[4]|0;if(a.slice(1,4).every(Number.isFinite))popFx(new V3(a[1],a[2],a[3]),true)};
 A.on.fl=a=>{const P=A.P(String(a[0]));P.sch=a[1]|0};
 A.on.fh=a=>{if(String(a[0])===myKey())Z.an?.say('FLARES','beat the '+(a[1]==='pat'?'patrol drone':'AA'),'#ffe08a',1)};
 A.on.r=a=>{if(String(a[0])!==myKey())return;A.readout({txt:String(a[1]).slice(0,60),col:/^c[a-z]$/.test(a[2])?a[2]:'co',kills:a[3]?1:0,dmg:a[4]?1:0,out:[]})};
 return{resolve,measure,dartContact,stun,netOK,BL,capture}}
