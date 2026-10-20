// Boss: the Jammer King, an electronic-warfare aircraft, and its relay pods. While it lives your radar loses range and fills with static, your
// lock-on is slow and your helpers' odds drop. It shows itself once, as a dark silhouette sliding through the haze in front of you, then
// vanishes into the fog: no radar track, no bracket.
// The hunt (so it is a hunt you win by attention, not by flying out your battery at random):
//  * its jamming PULSES: 8 s on, 4 s off. In each WINDOW your radar and lock work, its emitter strobes violet (visible from anywhere if you
//    look the right way) and it shows on radar if you are within 6 km. The bar counts the cycle down.
//  * SIGNAL: the bar reads how hot the jamming is where you are and where you look (cold / cool / warm / hot / burning); the static you hear
//    rises with it. Fly and look toward it.
//  * RELAY PODS (4) hover around your sites. Living pods are jamming strobes on your radar: a violet line from the radar toward each.
//    Kill one and its last transmission draws a BEARING LINE toward the King; two lines cross at a fix circle that shrinks with each pod.
//    Kill them all and the network is down: the King is exposed for good.
//  * OVERLOAD: kills inside the bubbles (1.2 km round a pod, 1.5 km round the King) fill the overload meter; full, the network overloads and
//    the King surfaces for 15 s: low, slow, on radar and lockable.
//  Phases: HIDDEN, HUNTED (hit once: it relocates and pulses faster), CORNERED (its emitter overheats and glows; it runs for the edge).
//  It withdraws after about four minutes. Beaten: the EW Crown trophy.
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
const PER=12,JAM=8,PODR=1200,KINGR=1500;

function kingSkin(C){return C.decal('jk-skin',512,512,(g,w,h)=>{const{D2,rnd}=C;g.fillStyle='#24202e';g.fillRect(0,0,w,h);
 g.strokeStyle='rgba(199,125,255,.55)';g.lineWidth=5;for(let k=0;k<6;k++){g.beginPath();const y=40+k*82;for(let x=0;x<=w;x+=8)g.lineTo(x,y+Math.sin(x/22+k)*12*(k%2?1:.5));g.stroke()}  // carrier waves
 g.fillStyle='rgba(255,230,90,.85)';for(let k=0;k<5;k++){const x=rnd(30,w-60),y=rnd(30,h-60);g.beginPath();g.moveTo(x,y);g.lineTo(x+22,y+28);g.lineTo(x+10,y+28);g.lineTo(x+30,y+60);g.lineTo(x+4,y+34);g.lineTo(x+16,y+34);g.closePath();g.fill()}  // bolts
 D2.panels(g,w,h,'#0b0a10',10,.4);D2.grime(g,w,h,.1)})}
function crownTex(C){return C.decal('jk-crown',256,256,(g,w)=>{const c=w/2,{D2}=C;g.fillStyle='rgba(20,10,30,.92)';D2.hex(g,c,c,120);g.fill();g.strokeStyle='#c77dff';g.lineWidth=8;D2.hex(g,c,c,112);g.stroke();
 g.fillStyle='#ffd84a';g.beginPath();g.moveTo(c-70,c+30);g.lineTo(c-70,c-30);g.lineTo(c-35,c);g.lineTo(c,c-55);g.lineTo(c+35,c);g.lineTo(c+70,c-30);g.lineTo(c+70,c+30);g.closePath();g.fill();
 g.strokeStyle='#c77dff';g.lineWidth=6;for(const r of[30,50,70]){g.beginPath();g.arc(c,c+60,r,-Math.PI*.8,-Math.PI*.2);g.stroke()}D2.text(g,'REX',c,c+12,26,'#24202e','900')})}
function domeTex(C){return C.decal('jk-dome',512,64,(g,w,h)=>{for(let i=0;i<16;i++){g.fillStyle=i%2?'#e8e2d0':'#141018';g.fillRect(i*w/16,0,w/16,h)}g.fillStyle='#c77dff';g.fillRect(0,h*.42,w,h*.16);C.D2.text(g,'· KING · KING · KING · KING ·',w/2,h/2,18,'#24202e','900')})}
function podTex(C){return C.decal('jk-pod',256,128,(g,w,h)=>{g.fillStyle='#2b2733';g.fillRect(0,0,w,h);g.fillStyle='#ffd84a';for(const x of[64,192]){g.beginPath();g.moveTo(x,18);g.lineTo(x+42,100);g.lineTo(x-42,100);g.closePath();g.fill();
  g.strokeStyle='#111';g.lineWidth=5;for(const r of[12,22,32]){g.beginPath();g.arc(x,80,r,-Math.PI*.85,-Math.PI*.15);g.stroke()}g.fillStyle='#111';g.beginPath();g.arc(x,80,5,0,7);g.fill();g.fillStyle='#ffd84a'}
 g.fillStyle='#c77dff';g.fillRect(0,h-14,w,8)})}

const MT={};
function mats(C){if(MT.skin)return MT;const T=C.THREE;Object.assign(MT,{skin:new T.MeshStandardMaterial({map:kingSkin(C),roughness:.55,metalness:.4}),dark:new T.MeshStandardMaterial({color:0x15121b,roughness:.5,metalness:.6}),
 dome:new T.MeshStandardMaterial({map:domeTex(C),roughness:.5,metalness:.3}),crown:new T.MeshBasicMaterial({map:crownTex(C),transparent:true,alphaTest:.05,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
 prop:new T.MeshBasicMaterial({color:0x9aa0aa,transparent:true,opacity:.22,depthWrite:false,side:T.DoubleSide}),emit:new T.MeshBasicMaterial({color:new T.Color(0xc77dff).multiplyScalar(3),toneMapped:false}),
 sil:new T.MeshBasicMaterial({color:0x0c0c10,fog:true}),pod:new T.MeshStandardMaterial({map:podTex(C),roughness:.6,metalness:.3}),red:new T.MeshBasicMaterial({color:new T.Color(0xff2020).multiplyScalar(4),toneMapped:false})});return MT}
function strobe(C,col,k){const T=C.THREE,s=new T.Sprite(new T.SpriteMaterial({map:dot,color:new T.Color(col).multiplyScalar(k),transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,sizeAttenuation:false}));s.scale.set(.05,.05,1);return s}
function kingModel(C){const T=C.THREE,M=mats(C),g=C.group(),m=(geo,mat,x,y,z)=>C.mesh(g,geo,mat,x,y,z);
 m(new T.CylinderGeometry(1.7,1.4,30,16).rotateX(Math.PI/2),M.skin,0,0,0);m(new T.SphereGeometry(1.7,16,10,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2),M.skin,0,0,15);
 m(new T.ConeGeometry(1.4,5,14).rotateX(-Math.PI/2),M.skin,0,.3,-17.4);
 m(new T.BoxGeometry(40,.5,4.2),M.skin,0,1.4,1.5);m(new T.BoxGeometry(13,.3,2.6),M.skin,0,1.6,-17.5);const fin=m(new T.BoxGeometry(.4,7,4),M.skin,0,4.6,-17.6);
 for(const s of[-1,1]){const c=m(new T.PlaneGeometry(3.6,3.6),M.crown,s*.22,5.2,-17.5);c.rotation.y=s*Math.PI/2}
 const props=[];for(const x of[-14,-7,7,14]){m(new T.CylinderGeometry(.75,.6,4.6,12).rotateX(Math.PI/2),M.dark,x,.9,3);const p=m(new T.CircleGeometry(2.4,20),M.prop,x,.9,5.4,false);props.push(p)}
 m(new T.CylinderGeometry(.25,.25,2.6,8),M.dark,0,3.1,-2);m(new T.CylinderGeometry(.25,.25,2.6,8),M.dark,0,3.1,-6);const dome=m(new T.CylinderGeometry(5.5,5.5,1.1,32),M.dome,0,4.8,-4);
 for(let i=0;i<7;i++){m(new T.BoxGeometry(.12,2.2,.5),M.dark,1.1,-1.8,10-i*3.4);m(new T.BoxGeometry(.12,2.2,.5),M.dark,-1.1,-1.8,10-i*3.4)}  // antenna farms under the belly
 const em=m(new T.SphereGeometry(.9,12,8),M.emit,0,-1.6,-1,false),st=strobe(C,0xc77dff,6);st.position.set(0,-1.6,-1);g.add(st);
 g.userData={props,dome,em,st,all:g.children.filter(o=>o.isMesh)};g.userData.own=1;return g}
function podModel(C){const T=C.THREE,M=mats(C),g=C.group();C.mesh(g,new T.CylinderGeometry(1.3,1.3,.9,6),M.pod,0,0,0);
 for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4,x=Math.cos(a)*1.9,z=Math.sin(a)*1.9;C.mesh(g,new T.BoxGeometry(1.9,.12,.18),M.dark,x/2,.2,z/2).rotation.y=-a;C.mesh(g,new T.CircleGeometry(.75,14).rotateX(-Math.PI/2),M.prop,x,.3,z,false)}
 C.mesh(g,new T.CylinderGeometry(.06,.06,3,6),M.dark,0,1.9,0);for(const y of[1.2,2,2.8])C.mesh(g,new T.BoxGeometry(1.4,.06,.06),M.dark,0,y,0);
 const l=C.mesh(g,new T.SphereGeometry(.22,8,6),M.red,0,3.5,0,false),s=strobe(C,0xff3030,4);s.position.set(0,3.5,0);g.add(s);g.userData.l=l;g.userData.s=s;return g}

const king=C=>C.api.TH.find(t=>t.k==='jammer'&&C.api.live(t));
const winOf=B=>!!B&&(B.pt||0)>=(B.ph>=1?6.5:JAM);
const jamOn=(C,u)=>!winOf(u.bs)&&!C.G.brw?.crown;
const need=C=>[6,8,9,10][C.cl(C.DFI(),0,3)];
function signal(C,t){const d=C.api.player;if(!d||d.dead>0)return 0;const r=t.p.distanceTo(d.p),f=new C.V3(0,0,-1).applyQuaternion(C.api.camera.quaternion),face=Math.max(0,f.dot(t.p.clone().sub(C.api.camera.position).normalize()));
 return C.cl(1-r/6000,0,1)**1.3*(.55+.45*face)}
// the fix from the bearing lines: least-squares crossing point, its error shrinking with each line
function fix(B){const L=B.lines||[];if(L.length<2)return null;let a=0,b=0,c=0,d=0,e=0;for(const l of L){const nx=-Math.cos(l.a),nz=Math.sin(l.a),k=nx*l.x+nz*l.z;a+=nx*nx;b+=nx*nz;c+=nz*nz;d+=nx*k;e+=nz*k}
 const det=a*c-b*b;if(Math.abs(det)<1e-6)return null;return{x:(d*c-b*e)/det,z:(a*e-b*d)/det,r:Math.max(150,900/(L.length-1))}}
function relocate(C,t){const B=t.bs,a=C.rnd(-1.6,1.6),R=C.rnd(2500,3700);B.home={x:C.cl(C.siteC.x+Math.sin(a)*R,-3800,3800),z:C.cl(C.siteC.z-Math.cos(a)*R,-3800,3800)}}

registerBoss({id:'jammer',n:'Jammer King',tag:'JAMMER KING',col:'#c77dff',spd:55,alt:[700,900],hitR:4.5,det:6000,cash:1500,bounty:7000,far:5200,
 resist:{rack:.3,gepard:.4,sam:.8,mpads:.5,idome:.4,hflak:.3},hp:6,phases:['HIDDEN','HUNTED','CORNERED'],
 note:'an electronic-warfare aircraft hiding in the fog. Radar, lock-on and helpers degrade while it lives. Hunt it: jamming windows, the signal meter, bearing lines from its relay pods, and overloads when you kill inside its bubbles.',
 warn:'massive jamming',spawn:{event:{from:18,p:.045},boss:30},
 build:C=>kingModel(C),
 init(C,t){const B=t.bs,{api}=C;relocate(C,t);B.pt=0;B.cnt=0;B.surf=0;B.lines=[];B.sil=5;B.exposed=0;
  const cam=api.camera,f=new C.V3(0,0,-1).applyQuaternion(cam.quaternion).setY(0);if(f.lengthSq()<.01)f.set(0,0,-1);f.normalize();const r=new C.V3(-f.z,0,f.x);
  t.p.copy(cam.position).addScaledVector(f,1900).addScaledVector(r,-500);t.p.y=Math.max(cam.position.y+180,api.gh(t.p.x,t.p.z)+260);t.v.copy(r).multiplyScalar(60);
  const n=C.DFI()>=3?5:C.DFI()===0?3:4;for(let i=0;i<n;i++){const a=-1.4+2.8*(i+.5)/n+C.rnd(-.2,.2),R=C.rnd(1500,3000),x=C.cl(C.siteC.x+Math.sin(a)*R,-3900,3900),z=C.cl(C.siteC.z-Math.cos(a)*R,-3900,3900);
   const p=C.spawn('jpod',{x,z,enc:B.enc});if(p){p.bs.y0=api.gh(x,z)+C.rnd(150,280);p.p.y=p.bs.y0;p.bs.init=1;p.bs.hp=p.bs.max=1}}
  C.Z.an?.radio('EARLY WARNING','Massive jamming on every band. Something big is out there… there! Did you see it?',2)},
 introFn(C,t){C.Z.an?.say('JAMMER KING','a silhouette in the haze · then gone','#c77dff',3);C.api.feed('<span style="color:#c77dff">A huge silhouette slid through the haze… and vanished into the fog.</span> Hunt it: windows, signal, relay pods, overloads.')},
 tick(C,t,dt){const B=t.bs,{api}=C;if(B.sil>0){B.sil-=dt;t.p.addScaledVector(t.v,dt);if(B.sil<=0){t.p.set(B.home.x,api.gh(B.home.x,B.home.z)+800,B.home.z);t.v.set(55,0,0)}return true}
  B.pt=((B.pt||0)+dt)%(B.ph>=1?10:PER);if(B.surf>0)B.surf-=dt;
  if(!B.exposed&&!api.TH.some(u=>u.k==='jpod'&&api.live(u))){B.exposed=1;C.Z.an?.say('NETWORK DOWN','the Jammer King is exposed','#c77dff',3);api.feed('<span class="cg">Every relay is down: the Jammer King is exposed.</span>')}
  if(B.age>260&&!B.flee){B.flee=1}
  if(B.flee||B.ph===2){const e=new C.V3(C.cl(t.p.x*3,-5000,5000),0,-5000);C.steer(t,C.levelTo(t,e,B.surf>0?350:700),B.flee?75:62,.5,dt,120);if(Math.abs(t.p.x)>4400||t.p.z<-4400){C.vanish(t,'escaped');for(const u of api.TH)if(u.k==='jpod')C.vanish(u,'gone')}return true}
  const h=B.home,dx=t.p.x-h.x,dz=t.p.z-h.z,d=Math.hypot(dx,dz)||1,tan=new C.V3(-dz/d,0,dx/d),pull=new C.V3(-dx/d,0,-dz/d).multiplyScalar(C.cl((d-500)/300,-1,1));
  const des=tan.add(pull);des.y=C.cl((api.gh(t.p.x,t.p.z)+(B.surf>0?350:800)-t.p.y)/200,-.4,.4);C.steer(t,des.normalize(),B.surf>0?40:55,.45,dt,150);return true},
 seen(C,t){const B=t.bs;if(B.sil>0)return false;if(B.surf>0||B.exposed)return true;if(!winOf(B))return false;const d=C.api.player,pd=C.api.PADP;return t.p.distanceTo(d&&d.dead<=0?d.p:new C.V3(pd.x,t.p.y,pd.z))<6000},
 hid(C,t){return!C.Z.seen(t)&&t.p.distanceTo(C.api.camera.position)>900},
 lockK:(C,u)=>jamOn(C,u)?(u.bs.ph>=2?3:2.5):1,radarK:(C,u)=>jamOn(C,u)?.55:1,jinkK:(C,u)=>jamOn(C,u)?.7:1,lockSelf:()=>1.5,
 hit(C,t,h){return h.q==='kill'?2:h.q==='helper'?1:1},
 hurt(C,t){if(!t.bs.exposed&&t.bs.ph<2){relocate(C,t);C.api.feed('<span style="color:#c77dff">The Jammer King took a hit and relocated.</span>')}},
 phase(C,t,i){if(i===2)C.api.feed('<span style="color:#c77dff">Its emitter is overheating: the King glows and runs for the edge.</span>')},
 death(C,t){for(const u of C.api.TH)if(u.k==='jpod'&&u.st!=='dead'){C.vanish(u,'gone');C.api.boom(u.p,1)}},
 status(C,e){const t=e.main,B=t.bs,w=winOf(B),per=B.ph>=1?10:PER,jam=B.ph>=1?6.5:JAM,left=w?per-B.pt:jam-B.pt,s=signal(C,t),pods=C.api.TH.filter(u=>u.k==='jpod'&&C.api.live(u)).length;
  const lab=s<.15?'COLD':s<.35?'COOL':s<.6?'WARM':s<.8?'HOT':'BURNING',bars='▮'.repeat(Math.round(s*8))+'▯'.repeat(8-Math.round(s*8));
  return`${B.exposed?'<b>EXPOSED</b>':B.surf>0?`<b>SURFACED ${Math.ceil(B.surf)} s</b>`:'HIDDEN'} · ${w?'<b>WINDOW</b>':'JAM'} ${Math.ceil(left)} s · SIGNAL ${bars} <b>${lab}</b><br>relays ${pods} · lines ${B.lines?.length|0} · overload ${B.cnt|0}/${need(C)}`},
 vis(C,t,dt){const B=t.bs,U=t.mesh.userData,cam=C.api.camera.position,d=t.p.distanceTo(cam),M=mats(C),seen=C.Z.seen(t);
  for(const p of U.props)p.rotation.z+=dt*30;U.dome.rotation.y+=dt*.8;
  const sil=B.sil>0;t.mesh.visible=sil||seen||d<1100;if(U.sw!==sil){U.sw=sil;for(const m of U.all)if(m!==U.em){m.userData.m0=m.userData.m0||m.material;m.material=sil?M.sil:m.userData.m0}}
  const w=winOf(B),hot=B.ph>=2||B.surf>0||B.exposed;U.st.visible=!sil&&(w||hot)&&Math.sin(performance.now()/(w?70:160))>-.2;U.em.visible=w||hot;
  if(hot&&(B.sm=(B.sm||0)-dt)<=0){B.sm=.12;C.FX.emit(t.p.clone().add(new C.V3(0,-1.6,0)),0xc77dff,3,4,.5,null,2.5)}},
 radar(C,rc,P,t){const B=t.bs,{api}=C,pd=P(api.PADP.x,api.PADP.z);
  if(jamOn(C,t)){rc.fillStyle='rgba(199,125,255,.5)';for(let i=0;i<70;i++)rc.fillRect(C.rnd(0,500),C.rnd(0,500),C.rnd(1,4),1.5);rc.strokeStyle='rgba(199,125,255,.18)';rc.lineWidth=3;for(let i=0;i<4;i++){const y=C.rnd(0,500);rc.beginPath();rc.moveTo(0,y);rc.lineTo(500,y+C.rnd(-20,20));rc.stroke()}}
  rc.setLineDash([6,6]);rc.strokeStyle='rgba(199,125,255,.55)';rc.lineWidth=2;for(const u of api.TH)if(u.k==='jpod'&&api.live(u)){const a=Math.atan2(u.p.x-api.PADP.x,u.p.z-api.PADP.z),q=P(api.PADP.x+Math.sin(a)*9000,api.PADP.z+Math.cos(a)*9000);rc.beginPath();rc.moveTo(pd[0],pd[1]);rc.lineTo(q[0],q[1]);rc.stroke()}
  rc.setLineDash([]);rc.strokeStyle='#c77dff';rc.lineWidth=2.5;for(const l of B.lines||[]){const a=P(l.x,l.z),b=P(l.x+Math.sin(l.a)*8000,l.z+Math.cos(l.a)*8000);rc.beginPath();rc.moveTo(a[0],a[1]);rc.lineTo(b[0],b[1]);rc.stroke()}
  const F=fix(B);if(F){const c=P(F.x,F.z),e=P(F.x+F.r,F.z);rc.beginPath();rc.arc(c[0],c[1],Math.max(6,Math.hypot(e[0]-c[0],e[1]-c[1])),0,7);rc.stroke();rc.fillStyle='#c77dff';rc.font='700 15px "JetBrains Mono",monospace';rc.fillText('KING?',c[0]+10,c[1]-10)}},
 overlay(C,oc,t,W,H){const B=t.bs,{api}=C,F=fix(B);if(B.sil>0){const q=t.p.clone().project(api.camera);if(q.z<1){oc.fillStyle='#c77dff';oc.fillText('???',(q.x*.5+.5)*W,(-q.y*.5+.5)*H-30)}}
  if(F&&!C.Z.seen(t)){const q=new C.V3(F.x,api.gh(F.x,F.z)+800,F.z).project(api.camera);if(q.z<1&&Math.abs(q.x)<1&&Math.abs(q.y)<1){const X=(q.x*.5+.5)*W,Y=(-q.y*.5+.5)*H;oc.strokeStyle=oc.fillStyle='#c77dff';oc.lineWidth=2;oc.beginPath();oc.moveTo(X,Y-16);oc.lineTo(X+16,Y);oc.lineTo(X,Y+16);oc.lineTo(X-16,Y);oc.closePath();oc.stroke();oc.fillText(`KING? ±${Math.round(F.r)} m`,X,Y+30)}}},
 netOut:(C,t)=>[Math.round((t.bs.pt||0)*10),Math.ceil(t.bs.surf||0),t.bs.exposed|0,t.bs.sil>0?1:0,t.bs.cnt|0],
 netIn(C,t,a){const B=t.bs;B.pt=(a[0]|0)/10;B.surf=a[1]|0;B.exposed=a[2]|0;B.sil=a[3]?1:0;B.cnt=a[4]|0;B.lines=B.lines||[]},
 aim(C,t,s){if(!C.Z.seen(t))return null;return{p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s?-1:-8)}},
 winTxt:'The Jammer King is down. Radar is clean.',escTxt:'withdrew into the fog; the jamming fades',
 sting(S){const t0=S.t+.05,o=S.out(.8);for(let i=0;i<14;i++){const x=S.osc('square',[220,880,330,1320,440][i%5]*(1+Math.random()*.03),t0+i*.07,.08);x.connect(S.env(t0+i*.07,.04,.004,.07,o))}  // a data burst
  const n=S.nz(t0,2.4),f=S.filt('bandpass',1400,1.2);n.connect(f).connect(S.env(t0,.14,.3,2.4,o))},
 loop(S){const o=S.out(0),n=S.nz(S.t,0),f=S.filt('bandpass',1600,.9),w=S.osc('square',420,S.t,0),wf=S.filt('lowpass',900),fm=S.osc('sine',6,S.t,0);
  const g2=n.context.createGain();g2.gain.value=180;fm.connect(g2).connect(w.frequency);n.connect(f).connect(o);const wg=n.context.createGain();wg.gain.value=.25;w.connect(wf).connect(wg).connect(o);return{g:o,stop(){n.stop();w.stop();fm.stop()}}},
 loopVol:(C,t)=>signal(C,t)*(winOf(t.bs)?.03:.13),
 reward:{id:'crown',n:'EW Crown',short:'immune to jamming; lock 25% faster; radar +20%',txt:'The King\'s captured EW suite: enemy jamming no longer touches you (Jammer Kings, the Mothership), your lock-on builds 25% faster and your radar reaches 20% farther.',
  lockK(C,t){const{api}=C,d=api.player;let k=.75;if(api.TH.some(u=>u.k==='boss'&&api.live(u)&&(u.p.distanceTo(t.p)<2500||d&&u.p.distanceTo(d.p)<2500)))k/=1.7;return k},radarK:()=>1.2},
 g:{kill(C,t){if(t.k==='jpod'||t.k==='jammer')return;const k=king(C);if(!k||k.bs.exposed||!C.auth())return;const B=k.bs;
   const inb=t.p.distanceTo(k.p)<KINGR||C.api.TH.some(u=>u.k==='jpod'&&C.api.live(u)&&u.p.distanceTo(t.p)<PODR);if(!inb)return;B.cnt=(B.cnt|0)+1;
   if(B.cnt>=need(C)){B.cnt=0;B.surf=15;C.Z.an?.say('NETWORK OVERLOAD','the Jammer King surfaces · 15 s','#c77dff',3);C.api.feed('<span class="cg">Network overload!</span> The Jammer King is forced down and onto your radar for 15 s.')}}}});

registerBoss({id:'jpod',n:'Relay pod',tag:'RELAY',minor:1,armor:0,spd:1,alt:[150,280],hitR:1.8,det:3000,cash:250,resist:{rack:.9,lrack:.9,gepard:.9,flak:.8,sam:1,mpads:.7,hflak:.8,idome:.5},hp:1,
 build:C=>podModel(C),
 tick(C,t,dt){const B=t.bs;B.ph2=(B.ph2||Math.random()*6)+dt;t.p.y=(B.y0||t.p.y)+Math.sin(B.ph2*.7)*4;t.v.set(Math.cos(B.ph2*.2),0,Math.sin(B.ph2*.2));return true},
 seen:(C,t)=>C.pilots().some(d=>d.p.distanceTo(t.p)<1500),
 hid:(C,t)=>!C.Z.seen(t)&&t.p.distanceTo(C.api.camera.position)>700,
 vis(C,t){const U=t.mesh.userData,on=Math.sin(performance.now()/250+t.id)>.3;U.l.visible=on;U.s.visible=on},
 death(C,t){const k=king(C);if(!k)return;const B=k.bs;(B.lines||(B.lines=[])).push({x:t.p.x,z:t.p.z,a:Math.atan2(k.p.x-t.p.x,k.p.z-t.p.z)+C.rnd(-.05,.05)});
  C.Z.an?.say('RELAY DOWN',`bearing line ${B.lines.length} · ${B.lines.length>1?'fix on your radar':'one more for a fix'}`,'#c77dff',2)},
 aim:(C,t,s)=>({p:t.p.clone().add(new C.V3(0,0,Math.random()<s?1:6))})});
