// Boss: the Puppeteer, a ground unit hiding in plain sight: a farm truck, a haystack, a burnt-out wreck or a broken shed, and it changes
// disguise every time it relocates (every 35-50 s it drives, as a truck, to a new spot; with sorties' fog of war it prefers ground nobody
// has seen, zfog.js). No radar track, no bracket. Every 14 s it strings a thin wire to a drone up to 3 km away: an enemy drone it boosts
// (30% faster), or one of YOUR rack drones or swarm drones, which it hijacks: the drone goes dark and dives on your base.
// How you find it: the wires. Each is a hair-thin silver line from the drone down toward the Puppeteer, glinting as it catches the light; you
// see it on close inspection. When a wired drone strikes (or dies) its wire falls and leaves a rust-red trail on the ground pointing back
// toward where the Puppeteer WAS when it fell. It keeps moving, so read fresh trails and the disguises at their far end.
// Kill it with a direct strike (a proximity burst does nothing; your swarm's ground strike works once it is exposed). HIDDEN, then EXPOSED
// (the first direct hit tears the disguise off: a black marionette spider that bolts and wires faster). It stays up to three waves.
// Beaten: the Puppet Strings trophy.
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
const DIS=['truck','hay','wreck','shed'];
function tx(C,k){return C.decal('pp-'+k,256,256,(g,w,h)=>{const{D2,rnd}=C;
 if(k==='truck'){g.fillStyle='#5c6440';g.fillRect(0,0,w,h);D2.text(g,'AGRO·TRANS',w/2,h/2,30,'rgba(230,225,200,.8)','900');D2.grime(g,w,h,.2)}
 else if(k==='hay'){g.fillStyle='#b99a4c';g.fillRect(0,0,w,h);for(let i=0;i<500;i++){g.strokeStyle=`rgba(${Math.random()<.5?'120,95,40':'230,205,130'},.5)`;g.beginPath();const x=rnd(0,w),y=rnd(0,h);g.moveTo(x,y);g.lineTo(x+rnd(-14,14),y+rnd(-4,4));g.stroke()}}
 else if(k==='wreck'){g.fillStyle='#2a2522';g.fillRect(0,0,w,h);for(let i=0;i<60;i++){g.fillStyle=`rgba(${Math.random()<.5?'120,60,25':'10,8,6'},.5)`;g.beginPath();g.arc(rnd(0,w),rnd(0,h),rnd(4,26),0,7);g.fill()}}
 else if(k==='shed'){g.fillStyle='#6b5a44';g.fillRect(0,0,w,h);g.strokeStyle='#3b3024';g.lineWidth=3;for(let x=0;x<w;x+=24){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}D2.grime(g,w,h,.2)}
 else{g.fillStyle='#0b0b0d';g.fillRect(0,0,w,h);g.strokeStyle='#e8e2d0';g.lineWidth=10;g.beginPath();g.moveTo(40,90);g.lineTo(216,90);g.moveTo(128,40);g.lineTo(128,150);g.stroke();  // a marionette's control bar
  g.lineWidth=2;for(const x of[40,128,216]){g.beginPath();g.moveTo(x,90);g.lineTo(x,240);g.stroke()}g.fillStyle='#c8202a';g.beginPath();g.arc(128,200,18,0,7);g.fill()}})}
const MT={};
function mats(C){if(MT.truck)return MT;const T=C.THREE;for(const k of[...DIS,'spider'])MT[k]=new T.MeshStandardMaterial({map:tx(C,k),roughness:.85,metalness:k==='truck'||k==='spider'?.3:0});
 Object.assign(MT,{dark:new T.MeshStandardMaterial({color:0x111111,roughness:.7,metalness:.4}),glint:new T.MeshStandardMaterial({color:0xdfe6ee,roughness:.08,metalness:1}),
  eye:new T.MeshBasicMaterial({color:new T.Color(0xff2020).multiplyScalar(3),toneMapped:false}),drone:new T.MeshStandardMaterial({color:0x2a3036,roughness:.55,metalness:.5})});return MT}
function model(C){const T=C.THREE,M=mats(C),g=C.group(),sub={};const grp=k=>{const s=new T.Group();g.add(s);sub[k]=s;s.visible=false;return s};
 let s=grp('truck');C.mesh(s,new T.BoxGeometry(2.3,1.8,2),M.truck,0,1.4,2.2);C.mesh(s,new T.BoxGeometry(2.4,1.2,4.2),M.truck,0,1.1,-1);for(const[x,z]of[[-1.1,2],[1.1,2],[-1.1,-2],[1.1,-2]])C.mesh(s,new T.CylinderGeometry(.5,.5,.4,12).rotateZ(Math.PI/2),M.dark,x,.5,z);
 s=grp('hay');for(const[x,z]of[[0,0],[2.2,.6],[-1.4,1.9]])C.mesh(s,new T.CylinderGeometry(.9,.9,1.4,14).rotateZ(Math.PI/2),M.hay,x,.9,z);
 s=grp('wreck');const w=C.mesh(s,new T.BoxGeometry(2,1,4.2),M.wreck,0,.55,0);w.rotation.z=.12;C.mesh(s,new T.BoxGeometry(1.8,.7,2),M.wreck,.1,1.3,-.3).rotation.y=.2;
 s=grp('shed');C.mesh(s,new T.BoxGeometry(4,2.8,.3),M.shed,0,1.4,0);const r=C.mesh(s,new T.BoxGeometry(4.4,.2,2.6),M.shed,0,2.9,.9);r.rotation.x=-.4;C.mesh(s,new T.BoxGeometry(.3,2.4,2),M.shed,1.85,1.2,.9);
 s=grp('spider');C.mesh(s,new T.SphereGeometry(1.3,14,10).scale(1.2,.6,1.5),M.spider,0,1.6,0);C.mesh(s,new T.SphereGeometry(.18,8,6),M.eye,0,1.8,1.9,false);
 for(let i=0;i<6;i++){const a=(i<3?-1:1)*(.5+(i%3)*.6),x=Math.sin(a)*1.6*(i<3?1:-1);const l=C.mesh(s,new T.CylinderGeometry(.07,.07,3,6),M.dark,(i<3?-1:1)*1.6,1.2,(i%3-1)*1.1);l.rotation.z=(i<3?1:-1)*.9}
 // the tell, on every disguise: a little glinting spool and a whip antenna
 C.mesh(g,new T.CylinderGeometry(.22,.22,.3,10),M.glint,.6,2.3,-.4);C.mesh(g,new T.CylinderGeometry(.015,.015,2.6,4),M.glint,.6,3.6,-.4);
 Object.assign(g.userData,{sub});return g}
function droneModel(C){const T=C.THREE,M=mats(C),g=C.group();C.mesh(g,new T.BoxGeometry(.5,.18,.65),M.drone);for(const[x,z]of[[.5,.5],[-.5,.5],[.5,-.5],[-.5,-.5]])C.mesh(g,new T.CylinderGeometry(.28,.28,.03,10),M.dark,x,.12,z,false);
 C.mesh(g,new T.SphereGeometry(.12,6,4),M.eye,0,.15,.35,false);g.scale.setScalar(1.8);return g}
const show=(t,k)=>{const S=t.mesh.userData.sub;if(!S)return;for(const q in S)S[q].visible=q===k};
function spot(C,t){const{api,Z}=C,fog=Z.so?.fog;let best=null;for(let k=0;k<60;k++){const a=Math.random()*6.28,R=C.rnd(900,3000),x=C.cl(C.siteC.x+Math.sin(a)*R,-3800,3800),z=C.cl(C.siteC.z-Math.cos(a)*R,-3800,3800);
  if(Math.abs(z-api.rivZ(x))<120||api.FOBS.some(f=>Math.hypot(f.x-x,f.z-z)<300)||C.sites().some(s=>Math.hypot(s.x-x,s.z-z)<350))continue;if(t&&Math.hypot(x-t.p.x,z-t.p.z)<500)continue;
  best={x,z};if(!fog||!fog.known(x,z)||Math.random()<.2)break}return best||{x:1800,z:-800}}
// wires and the trails they leave
const W=[],PATHS=[];
function drop(C,w,from){const pp=w.pp;if(!pp)return;const dx=pp.p.x-from.x,dz=pp.p.z-from.z,L=Math.hypot(dx,dz)*.7,n=40,pts=[];if(L<20)return;
 for(let i=0;i<=n;i++){const f=i/n,x=from.x+dx/Math.hypot(dx,dz)*L*f,z=from.z+dz/Math.hypot(dx,dz)*L*f;pts.push(x,C.api.gh(x,z)+.35,z)}PATHS.push({pts,age:0,dx:dx/Math.hypot(dx,dz),dz:dz/Math.hypot(dx,dz)});if(PATHS.length>10)PATHS.shift();RB.dirty=1;
 const s=C.sites().reduce((a,b)=>Math.hypot(b.x-from.x,b.z-from.z)<Math.hypot(a.x-from.x,a.z-from.z)?b:a,C.sites()[0]||{n:'base',x:0,z:0});C.api.feed(`<span class="co">A wire fell near the ${String(s.n).toLowerCase()}: the trail points to where the Puppeteer was.</span>`)}
const RB={mesh:null,dirty:0,wl:null,gl:null};
function draw(C){const{THREE:T,api}=C;if(!RB.mesh){const mat=new T.MeshBasicMaterial({color:0x8a2a18,transparent:true,opacity:.75,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4});
  RB.mesh=new T.Mesh(new T.BufferGeometry(),mat);RB.mesh.frustumCulled=false;api.scene.add(RB.mesh);const lg=new T.BufferGeometry();lg.setAttribute('position',new T.BufferAttribute(new Float32Array(16*16*6),3));
  RB.wl=new T.LineSegments(lg,new T.LineBasicMaterial({color:0xdfe6ee,transparent:true,opacity:.32,depthWrite:false}));RB.wl.frustumCulled=false;api.scene.add(RB.wl);
  const gg=new T.BufferGeometry();gg.setAttribute('position',new T.BufferAttribute(new Float32Array(16*3*3),3));RB.gl=new T.Points(gg,new T.PointsMaterial({size:3,sizeAttenuation:false,map:dot,color:new T.Color(0xffffff).multiplyScalar(2),transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));RB.gl.frustumCulled=false;api.scene.add(RB.gl)}
 if(RB.dirty){RB.dirty=0;const P=[];for(const p of PATHS){const a=p.pts,n=a.length/3,ox=-p.dz*1.3,oz=p.dx*1.3;for(let i=0;i<n-1;i++){const A=[a[i*3],a[i*3+1],a[i*3+2]],B=[a[i*3+3],a[i*3+4],a[i*3+5]];
   P.push(A[0]-ox,A[1],A[2]-oz,A[0]+ox,A[1],A[2]+oz,B[0]+ox,B[1],B[2]+oz,A[0]-ox,A[1],A[2]-oz,B[0]+ox,B[1],B[2]+oz,B[0]-ox,B[1],B[2]-oz)}}
  RB.mesh.geometry.dispose();const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));RB.mesh.geometry=g}
 RB.mesh.visible=PATHS.length>0&&C.G.on;
 // the wires: a sagging line from each wired drone to the Puppeteer, with glints sliding down it
 const la=RB.wl.geometry.attributes.position,ga=RB.gl.geometry.attributes.position,T0=performance.now()/1000;let n=0,m=0;
 for(const w of W){const u=w.u,pp=w.pp;if(!u||!pp||pp.st==='dead')continue;const top=pp.p.clone().add(new C.V3(.6,3.6,-.4));for(let i=0;i<15&&n<la.count-1;i++){for(const k of[i,i+1]){const f=k/15,sag=Math.sin(f*Math.PI)*u.p.distanceTo(top)*.06;la.setXYZ(n++,u.p.x+(top.x-u.p.x)*f,u.p.y+(top.y-u.p.y)*f-sag,u.p.z+(top.z-u.p.z)*f)}}
  for(let j=0;j<3&&m<ga.count;j++){const f=(T0*.15+j/3+u.id*.13)%1,sag=Math.sin(f*Math.PI)*u.p.distanceTo(top)*.06;ga.setXYZ(m++,u.p.x+(top.x-u.p.x)*f,u.p.y+(top.y-u.p.y)*f-sag,u.p.z+(top.z-u.p.z)*f)}}
 for(let i=n;i<la.count;i++)la.setXYZ(i,0,-1e4,0);for(let i=m;i<ga.count;i++)ga.setXYZ(i,0,-1e4,0);la.needsUpdate=ga.needsUpdate=true;RB.wl.visible=RB.gl.visible=n>0;RB.gl.material.opacity=.5+.5*Math.sin(T0*9)}
function wire(C,t){const{api,Z}=C,B=t.bs,R=3000;const H=(Z.def?.drones||[]).filter(h=>h.p&&h.p.distanceTo(t.p)<R),S=(Z.sw?.mine?.d||[]).filter(d=>d.p.distanceTo(t.p)<R);
 if((H.length||S.length)&&Math.random()<.55){let p,v;if(H.length){const h=C.pick(H);p=h.p.clone();v=h.v.clone();if(h.tgt&&h.tgt.claim===h)h.tgt.claim=null;const i=Z.def.shots.indexOf(h);if(i>=0)Z.def.shots.splice(i,1)}
  else{const d=C.pick(S);p=d.p.clone();v=d.v.clone();const i=Z.sw.mine.d.indexOf(d);if(i>=0){Z.sw.mine.d.splice(i,1);Z.sw.mine.lost++}}
  const u=C.spawn('ppdrone',{x:p.x,z:p.z,y:p.y,v,enc:B.enc});if(u){u.bs.init=1;u.bs.hp=u.bs.max=1;W.push({u,pp:t,hij:1});B.hij=(B.hij|0)+1;api.feed('<span class="cr">One of your drones went dark… it is turning on the base!</span>');C.Z.an?.radio('OVERLORD','We lost control of a drone! It is diving on us!',1)}return}
 const E=api.TH.filter(u=>api.live(u)&&!C.BOSSES[u.k]&&(u.k==='shahed'||u.k==='jet'||u.k==='heavy')&&!u.pup&&u.p.distanceTo(t.p)<R);if(!E.length)return;const u=C.pick(E);u.pup=t.id;u.spd*=1.3;u.cs*=1.3;W.push({u,pp:t})}
registerBoss({id:'puppet',n:'The Puppeteer',tag:'PUPPETEER',col:'#e8e2d0',spd:14,alt:[0,2],hitR:3.5,det:1,cash:1500,bounty:6000,far:5200,persist:1,resist:{},hp:C=>2/C.hpK(),phases:['HIDDEN','EXPOSED'],phaseAt:[.5],
 note:'a ground unit in disguise that strings wires to drones, boosting enemies and hijacking yours. Follow the glinting wires and the trails they leave; kill it with a direct strike.',warn:'something on the ground pulls the strings',
 spawn:{event:{from:12,p:.045}},
 introFn(C,t){C.Z.an?.say('THE PUPPETEER','somewhere on the ground · follow the wires','#e8e2d0',3);C.Z.an?.radio('OVERLORD','Some of the drones are moving like they are on strings. Look for wires.',2)},
 build:C=>model(C),warm:C=>{draw(C)},
 init(C,t){const B=t.bs,s=spot(C,null);t.p.set(s.x,C.api.gh(s.x,s.z)+.1,s.z);t.v.set(0,0,1);B.dis=C.pick(DIS.slice(1));show(t,B.dis);B.mv=null;B.next=C.rnd(35,50);B.wt=6;B.waves=0},
 save:(C,t)=>({waves:t.bs.waves|0,exposed:t.bs.exposed|0,hp:t.bs.hp,max:t.bs.max}),
 restore(C,t,st){const B=t.bs;B.waves=st.waves|0;B.exposed=st.exposed|0;B.hp=Math.max(1,st.hp|0);B.max=Math.max(B.hp,st.max|0);B.ph=B.exposed?1:0;show(t,B.exposed?'spider':B.dis)},
 withdrawTxt:()=>'<span class="co">The Puppeteer went to ground. It will move in somewhere new next wave.</span>',
 clear(){W.length=0;PATHS.length=0;RB.dirty=1;if(RB.mesh){RB.mesh.visible=false;RB.wl.visible=RB.gl.visible=false}},fxLeft:()=>({wires:W.length,trails:PATHS.length,wireMesh:RB.mesh?.visible||RB.wl?.visible?1:0}),
 wake(C,t){if(++t.bs.waves>=3){C.vanish(t,'escaped');C.api.feed('<span class="co">The Puppeteer pulled up its strings and left.</span>')}},
 tick(C,t,dt){const{api}=C,B=t.bs;B.next-=dt;B.wt-=dt;
  if(B.wt<=0){B.wt=B.ph?9:14;wire(C,t)}
  for(let i=W.length-1;i>=0;i--){const w=W[i];if(w.pp!==t)continue;if(!w.u||w.u.st==='dead'||w.u.st==='fall'||!api.live(w.u)){drop(C,w,w.u?w.u.p:t.p);W.splice(i,1)}}
  if(!B.mv&&B.next<=0){B.mv=spot(C,t);show(t,B.exposed?'spider':'truck')}
  if(B.mv){const d=Math.hypot(B.mv.x-t.p.x,B.mv.z-t.p.z),des=new C.V3(B.mv.x-t.p.x,0,B.mv.z-t.p.z).normalize();C.steer(t,des,B.exposed?22:14,.8,dt,0);t.p.y=api.gh(t.p.x,t.p.z)+.1;
   if(d<12){B.mv=null;B.next=B.exposed?C.rnd(18,26):C.rnd(35,50);const o=B.dis;B.dis=C.pick(DIS.filter(k=>k!==o));show(t,B.exposed?'spider':B.dis);t.v.set(t.v.x,0,t.v.z).setLength(.5)}}
  else{t.v.setY(0).setLength(.5);t.p.y=api.gh(t.p.x,t.p.z)+.1}return true},
 atmos(C,t,o){const c=C.api.camera.position;let d=c.distanceTo(t.p);for(const w of W)if(w.pp===t&&w.u)d=Math.min(d,c.distanceTo(w.u.p));const p=.5+.5*Math.sin(performance.now()/900);
  o.dark=.3+.08*p;o.vign=.48;o.desat=.25;o.light=.75;o.tint.set(0xd8c8a8);o.tintA=.08;return C.cl(1.1-d/700,0,1)},
 seen:()=>false,hid:(C,t)=>!(t.bs.exposed&&t.p.distanceTo(C.api.camera.position)<400),lockSelf:()=>1e3,
 hit(C,t,h){if(h.q==='damage'||h.q==='helper'){h.txt='NOTHING · it takes a direct strike';return 0}return 1},
 phase(C,t,i){if(i>=1&&!t.bs.exposed){t.bs.exposed=1;show(t,'spider');t.bs.next=0;C.Z.an?.say('PUPPETEER EXPOSED','it bolts · one more direct strike','#e8e2d0',2)}},
 death(C){for(let i=W.length-1;i>=0;i--)if(W[i].pp&&W[i].pp.bs.dead)W.splice(i,1)},
 status(C,e){const B=e.main.bs,w=W.filter(q=>q.pp===e.main).length;return`wires <b>${w}</b> · drones hijacked ${B.hij|0} · trails ${PATHS.length} · ${B.exposed?'<b>EXPOSED</b>: it bolts between spots':'disguised · it moves every ~40 s'}<br>look for a glint between a drone and the ground; follow fresh trails`},
 vis(C,t,dt){const B=t.bs;if(B.mv&&Math.random()<dt*4)C.SMK.emit(t.p.clone().add(new C.V3(0,.5,0)),0x8a7a5a,1,1.5,2,null,1,.4)},
 netOut:(C,t)=>[DIS.indexOf(t.bs.dis),t.bs.exposed|0,t.bs.mv?1:0],netIn(C,t,a){t.bs.dis=DIS[a[0]]||'hay';t.bs.exposed=a[1]|0;show(t,t.bs.exposed?'spider':a[2]?'truck':t.bs.dis)},
 aim(C,t,s){if(Math.random()>s*.35)return null;return{p:t.p.clone().add(new C.V3(0,1.2,0)),v:new C.V3()}},
 dbg:()=>({wires:W.length,paths:PATHS.length}),
 winTxt:'The Puppeteer is down. Its strings go slack.',escTxt:'pulled up its strings and left',
 sting(S){const t0=S.t+.05,o=S.out(.8);[659,587,523,494,440,415].forEach((f,i)=>{const x=S.osc('triangle',f,t0+i*.22,1.2),b=S.filt('bandpass',f*2,3);x.connect(b).connect(S.env(t0+i*.22,.08,.003,1.2,o))});  // plucked strings, going down
  for(let i=0;i<5;i++){const n=S.nz(t0+.15+i*.33,.05),b=S.filt('bandpass',1200,4);n.connect(b).connect(S.env(t0+.15+i*.33,.1,.002,.05,o))}},  // wooden clacks
 loop(S){const o=S.out(0),x=S.osc('triangle',233,S.t,0),y=S.osc('triangle',236,S.t,0);x.connect(o);y.connect(o);return{g:o,stop(){x.stop();y.stop()}}},
 loopVol:(C,t)=>C.cl(1-t.p.distanceTo(C.api.camera.position)/500,0,1)**2*.06,
 reward:{id:'strings',n:'Puppet Strings',short:'one jet or heavy a wave turns on its own raid',txt:'Once a wave, the first jet or armoured heavy that comes within 2 km of a site is yours: it turns and rams the nearest other enemy drone.',
  step(C){const{G,api}=C;if(G.state!=='wave'||G.psw===G.wave||!C.auth())return;const u=api.TH.find(t=>api.live(t)&&(t.k==='jet'||t.k==='heavy')&&C.sites().some(s=>Math.hypot(s.x-t.p.x,s.z-t.p.z)<2000));if(!u)return;
   const v=api.TH.filter(t=>t!==u&&api.live(t)&&!C.BOSSES[t.k]&&KOK(t)&&t.p.distanceTo(u.p)<1800).sort((a,b)=>a.p.distanceTo(u.p)-b.p.distanceTo(u.p))[0];if(!v)return;G.psw=G.wave;
   u.by=v.by='h';api.killThreat(v,true);api.killThreat(u,true);api.feed('<span class="cg">Puppet strings: a hijacked drone rammed its own wingman</span>')}},
 g:{vis(C){if(W.length||PATHS.length)draw(C);else if(RB.mesh&&(RB.mesh.visible||RB.wl.visible)){RB.mesh.visible=RB.wl.visible=RB.gl.visible=false}},step(C,dt){let ch=0;for(let i=PATHS.length-1;i>=0;i--){const p=PATHS[i];p.age+=dt;if(p.age>90){PATHS.splice(i,1);ch=1}}if(ch)RB.dirty=1;if(RB.mesh)RB.mesh.material.opacity=.75},
  start(C){W.length=0;PATHS.length=0;RB.dirty=1;const{Z}=C;if(!Z._ppg){Z._ppg=1;const g0=Z.groundTargets;Z.groundTargets=()=>{const L=(typeof g0==='function'?g0():null)||[];
   for(const t of C.api.TH)if(t.k==='puppet'&&C.api.live(t)&&t.bs.exposed)L.push({id:'pp'+t.id,p:t.p,r:4,alive:true,hit(){C.hurt(t,1,{src:'p'})}});return L}}},
  stop(){W.length=0;PATHS.length=0;RB.dirty=1;if(RB.mesh){RB.mesh.visible=false;RB.wl.visible=RB.gl.visible=false}}}});
const KOK=t=>t.k!=='ballistic'&&t.k!=='hyper'&&t.k!=='icbm';
registerBoss({id:'ppdrone',n:'Hijacked drone',tag:'HIJACKED',minor:1,armor:0,spd:70,alt:[60,140],hitR:1.4,det:4500,cash:60,resist:{rack:.8,lrack:.8,gepard:.8,flak:.8,sam:.4,mpads:.5,hflak:.7,idome:.2},hp:1,
 build:C=>droneModel(C),
 tick(C,t,dt){const{api}=C;if(!t.bs.site||t.bs.site.hp<=0){let b=null,bd=1e9;for(const s of C.sites()){const d=Math.hypot(s.x-t.p.x,s.z-t.p.z);if(d<bd){bd=d;b=s}}t.bs.site=b;if(b){t.tgt=b;t.aim=b.aims[0]}}
  const S=t.bs.site;if(!S)return true;const a=t.aim;C.steer(t,C.dirTo(t,a),75,2.2,dt,2);if(t.p.distanceTo(a)<6){C.strike(t,S,30,a);api.boom(t.p,1.5);C.vanish(t,'struck')}return true},
 tname:(C,t)=>`T${String(t.id).padStart(2,'0')} YOUR DRONE (HIJACKED)`,
 aim:(C,t,s)=>({p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s?-.5:-6)})});
