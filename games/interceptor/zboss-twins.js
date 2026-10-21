// Boss: the Twins, CASTOR (white, the sun) and POLLUX (black, the moon). Two fast jets that fly as a pair and protect each other.
// LINKED: while they fly within 140 m of each other a glowing tether joins them and the link soaks your bursts: a proximity hit only strains
// it (two strains snap it for 8 s), a direct hit does one point. SPLIT: near a target they break into a pincer from two sides, the tether
// stretches and snaps; that is your window, every hit counts in full. Then they regroup for the next site. Freeze one of them (Q) and the
// other cannot hold formation: the link breaks. ENRAGED: kill one and the other burns red, faster, rams you if you are close and dives on the
// nearest site. They leave after four runs. Beaten: the Twin Darts trophy (two darts launch at the worst jets every wave).
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
const LINK=140;
function skin(C,i){return C.decal('tw-skin'+i,512,512,(g,w,h)=>{const{D2}=C;g.fillStyle=i?'#15161a':'#e6e8ec';g.fillRect(0,0,w,h);const c=i?'#d0262d':'#2a6fdb';
 g.fillStyle=c;for(const y of[60,92])g.fillRect(0,y,w,16);g.save();g.translate(i?w:0,0);g.scale(i?-1:1,1);g.beginPath();g.moveTo(0,300);g.lineTo(w*.7,200);g.lineTo(w*.7,240);g.lineTo(0,360);g.fill();g.restore();  // mirrored flashes
 D2.panels(g,w,h,i?'#000':'#9aa0a8',10,.3);D2.grime(g,w,h,.07)})}
function emblem(C,i){return C.decal('tw-emb'+i,256,256,(g,w)=>{const c=w/2,{D2}=C;g.fillStyle=i?'#0d0d10':'#f4f4f6';g.beginPath();g.arc(c,c,118,0,7);g.fill();g.lineWidth=8;g.strokeStyle=i?'#d0262d':'#2a6fdb';g.stroke();
 if(i){g.fillStyle='#e8e2d0';g.beginPath();g.arc(c-6,c-10,58,0,7);g.fill();g.fillStyle='#0d0d10';g.beginPath();g.arc(c+18,c-26,52,0,7);g.fill()}  // the moon
 else{g.fillStyle='#f2b21b';g.beginPath();g.arc(c,c-14,40,0,7);g.fill();for(let k=0;k<12;k++){const a=k*Math.PI/6;g.beginPath();g.moveTo(c+Math.cos(a)*48,c-14+Math.sin(a)*48);g.lineTo(c+Math.cos(a+.13)*70,c-14+Math.sin(a+.13)*70);g.lineTo(c+Math.cos(a-.13)*70,c-14+Math.sin(a-.13)*70);g.fill()}}  // the sun
 D2.text(g,'Ⅱ',c,c+70,46,i?'#d0262d':'#2a6fdb','900');D2.text(g,i?'POLLUX 02':'CASTOR 01',c,c+104,18,i?'#e8e2d0':'#1a1c22','900')})}
const MT={};
function mats(C,i){if(MT[i])return MT[i];const T=C.THREE;return MT[i]={skin:new T.MeshStandardMaterial({map:skin(C,i),roughness:.4,metalness:.5}),dark:new T.MeshStandardMaterial({color:i?0x0a0a0c:0x9aa0a8,roughness:.4,metalness:.6}),
 glass:new T.MeshStandardMaterial({color:0x0e1622,roughness:.05,metalness:.9}),emb:new T.MeshBasicMaterial({map:emblem(C,i),transparent:true,alphaTest:.05,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
 hot:new T.MeshBasicMaterial({color:new T.Color(i?0xff5030:0x60a0ff).multiplyScalar(3),toneMapped:false})}}
function model(C,i){const T=C.THREE,M=mats(C,i),g=C.group();
 C.mesh(g,new T.LatheGeometry([[0,-6.5],[.55,-6.2],[.8,-3],[.85,1],[.6,4],[.25,6],[0,7]].map(([r,y])=>new T.Vector2(r,y)),18).rotateX(Math.PI/2),M.skin);
 const w=new T.Shape();w.moveTo(0,-1);w.lineTo(5.6,1.6);w.lineTo(5.9,.6);w.lineTo(0,-3.2);w.lineTo(-5.9,.6);w.lineTo(-5.6,1.6);w.closePath();  // forward-swept wing
 const wg=new T.ExtrudeGeometry(w,{depth:.18,bevelEnabled:false}).rotateX(Math.PI/2).translate(0,.05,-1);C.mesh(g,wg,M.skin);
 const tS=new T.Shape();tS.moveTo(-6.2,0);tS.lineTo(-3.6,0);tS.lineTo(-5.4,2.8);tS.lineTo(-6.4,2.8);tS.closePath();const tf=C.mesh(g,new T.ExtrudeGeometry(tS,{depth:.12,bevelEnabled:false}).translate(0,0,-.06).rotateY(-Math.PI/2),M.skin,0,.5,0);
 for(const s of[-1,1]){const e=C.mesh(g,new T.PlaneGeometry(2.1,2.1),M.emb,s*.09,2,-5.2,false);e.rotation.y=s*Math.PI/2}
 C.mesh(g,new T.CylinderGeometry(.5,.55,.8,14).rotateX(Math.PI/2),M.dark,0,0,-6.6);C.mesh(g,new T.CircleGeometry(.45,14),M.hot,0,0,-7.01,false).rotation.y=Math.PI;
 const cn=C.mesh(g,new T.SphereGeometry(.45,14,8),M.glass,0,.55,3.4);cn.scale.set(.9,.8,2.4);
 const a=new T.Sprite(new T.SpriteMaterial({map:dot,color:new T.Color(0xff3020).multiplyScalar(2),transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));a.scale.set(22,22,1);g.add(a);g.userData.rage=a;return g}
// the tether: one glowing line between the pair (drawn by POLLUX's track)
let TL=null;
function tether(C){if(TL)return TL;const T=C.THREE,geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(32*3),3));
 TL=new T.Line(geo,new T.LineBasicMaterial({color:new T.Color(0x9fe8ff).multiplyScalar(3),transparent:true,opacity:.9,toneMapped:false,blending:T.AdditiveBlending,depthWrite:false}));TL.frustumCulled=false;TL.visible=false;C.api.scene.add(TL);return TL}
const mate=(C,t)=>t.bs.mate&&!t.bs.mate.bs.dead&&t.bs.mate.st!=='dead'?t.bs.mate:null;
const linked=(C,t)=>{const m=mate(C,t);return!!m&&C.api.live(t)&&t.p.distanceTo(m.p)<LINK&&!(t.bs.snap>0)&&!t.bs.rage};
registerBoss({id:'twins',n:'The Twins',tag:'TWINS',col:'#7fb2ff',spd:100,alt:[350,500],hitR:2.4,det:9000,cash:900,bounty:5500,far:6000,
 resist:{rack:.4,gepard:.5,sam:.8,mpads:.8,idome:.4,hflak:.3},hp:3,
 note:'two fast jets flying as a linked pair: the link soaks proximity hits until it snaps or they split for a pincer. Kill one and the other enrages.',warn:'CASTOR and POLLUX',
 spawn:{event:{from:14,p:.05},boss:20},
 intro:{title:'THE TWINS',sub:'CASTOR & POLLUX · linked · they shield each other',col:'#7fb2ff',radio:'Two fast movers in tight formation. They are linked, split them up!'},
 build:(C,t)=>model(C,0),warm:C=>[tether(C),model(C,1)],
 init(C,t){const B=t.bs;if(B.role==null){B.role=0;B.runs=0;B.mode='form';const m=C.spawn('twins',{x:t.p.x+50,z:t.p.z+40,y:t.p.y,enc:B.enc,v:t.v.clone(),set:{role:1,mate:t}});if(m){B.mate=m;swap(C,m)}}
  t.p.y=Math.max(t.p.y,C.api.gh(t.p.x,t.p.z)+420)},
 tick(C,t,dt){const{api,V3}=C,B=t.bs,m=mate(C,t);B.snap=Math.max(0,(B.snap||0)-dt);if(m&&B.role===0)m.bs.snap=Math.max(m.bs.snap||0,B.snap);
  if(B.rage){const d=C.nearPilot(t.p);if(d&&d.p.distanceTo(t.p)<700){C.steer(t,C.dirTo(t,d.p),150,1.6,dt,20);if(d.p.distanceTo(t.p)<9){C.api.boom(t.p,1);if(d===api.player)C.shoot(`${B.role?'POLLUX':'CASTOR'} rammed you`);C.hurt(t,1,{})}return true}
   if(!B.site||B.site.hp<=0){let b=null,bd=1e9;for(const s of C.sites()){const q=Math.hypot(s.x-t.p.x,s.z-t.p.z);if(q<bd){bd=q;b=s}}B.site=b}const s=B.site;if(!s)return true;
   const dh=Math.hypot(s.x-t.p.x,s.z-t.p.z);C.steer(t,dh<700?C.dirTo(t,new V3(s.x,s.y+3,s.z)):C.levelTo(t,new V3(s.x,0,s.z),300),130,1.2,dt,5);if(dh<40&&t.p.y-s.y<30){C.strike(t,s,80);api.boom(t.p,3);t.p.y+=250;B.site=null}return true}
  if(B.role===1&&m){const lb=m.bs;if(lb.mode==='form'||lb.mode==='regroup'){const f=m.v.clone().setY(0).normalize(),r=new V3(-f.z,0,f.x),slot=m.p.clone().addScaledVector(r,45).addScaledVector(f,-15),e=slot.sub(t.p),d=e.length();
    C.steer(t,e.normalize().multiplyScalar(Math.min(1,d/60)).add(m.v.clone().normalize()).normalize(),C.cl(m.spd+d*.5,60,125),1.6,dt,60);return true}}
  const L=B.role===0?B:m?.bs||B;if(B.role===0||!m){if(!B.site||B.site.hp<=0){B.site=C.pick(C.sites());B.mode='form'}}const s=(B.role===0?B:L).site||B.site;if(!s)return true;
  const dh=Math.hypot(s.x-t.p.x,s.z-t.p.z),lead=B.role===0||!m;
  if(lead){if(B.mode==='form'&&dh<2600){B.mode='split';C.Z.an?.say('PINCER','the twins split · the link breaks','#7fb2ff',1)}
   if(B.mode==='regroup'){B.rg-=dt;const out=new V3(t.p.x-s.x,0,t.p.z-s.z).normalize();C.steer(t,out.setY(.15).normalize(),100,.9,dt,60);if(B.rg<=0){B.mode='form';B.site=null;if(++B.runs>=4){C.vanish(t,'escaped');if(m)C.vanish(m,'escaped')}}return true}}
  const mode=lead?B.mode:L.mode;
  if(mode==='form'){C.steer(t,C.levelTo(t,new V3(s.x,0,s.z),450),100,.9,dt,60);return true}
  // the pincer: POLLUX swings wide to come in 60 degrees off CASTOR's line; each dives and bombs, then they regroup
  let aim=new V3(s.x,s.y+4,s.z);if(B.role===1&&dh>900){const a=Math.atan2(t.p.x-s.x,t.p.z-s.z)+1.05;aim=new V3(s.x+Math.sin(a)*1100,0,s.z+Math.cos(a)*1100)}
  C.steer(t,dh<900?C.dirTo(t,aim):C.levelTo(t,aim,350),110,1.1,dt,8);
  if(dh<60&&t.p.y-s.y<40&&!B.bombed){B.bombed=1;C.strike(t,s,40);api.boom(new V3(s.x,s.y+5,s.z),2.5);t.p.y+=200;if(lead){B.mode='regroup';B.rg=12}}
  if(dh>500)B.bombed=0;return true},
 hit(C,t,h){const B=t.bs;if(linked(C,t)){if(h.q==='kill')return 1;B.strain=(B.strain|0)+1;const m=mate(C,t);if(m)m.bs.strain=B.strain;
   if(B.strain>=2){B.snap=8;B.strain=0;if(m){m.bs.snap=8;m.bs.strain=0}h.txt='LINK SNAPPED';C.Z.an?.say('LINK SNAPPED','8 s · hit them now','#7fb2ff',2)}else h.txt='LINK STRAINED 1/2';return 0}
  return h.q==='kill'?2:1},
 death(C,t){const m=mate(C,t);if(m){m.bs.rage=1;m.bs.site=null;C.Z.an?.say(`${m.bs.role?'POLLUX':'CASTOR'} ENRAGED`,'it burns for revenge','#ff3b3b',3);C.Z.an?.radio(m.bs.role?'POLLUX':'CASTOR','"BROTHER!"',2)}},
 phaseName(C,e){const L=e.list.filter(t=>!t.bs.dead);if(L.length<2)return'ENRAGED';return L.some(t=>linked(C,t))?'LINKED':'SPLIT'},
 status(C,e){const L=e.list.filter(t=>!t.bs.dead);if(L.length<2)return'<b>ENRAGED</b>: it rams you when close and dives on sites';const t=L[0];
  return linked(C,t)?`link <b>HOLDING</b> · strain ${t.bs.strain|0}/2 · proximity bursts glance off · freeze one to split them`:`link <b>BROKEN</b>${t.bs.snap>0?` ${Math.ceil(t.bs.snap)} s`:''} · every hit counts`},
 tname:(C,t)=>`T${String(t.id).padStart(2,'0')} ${t.bs?.role?'POLLUX':'CASTOR'}`,
 vis(C,t,dt){const B=t.bs,r=t.mesh.userData.rage;if(r)r.material.opacity=B.rage?.5+.2*Math.sin(performance.now()/90):0;if(B.rage&&(B.sm=(B.sm||0)-dt)<=0){B.sm=.05;C.FX.emit(t.p,0xff4020,2,3,.4,null,2.5)}
  if(B.role!==1)return;const m=mate(C,t),L=tether(C);L.visible=!!m&&linked(C,t);if(!L.visible)return;const a=L.geometry.attributes.position,T=performance.now()/1000;
  for(let i=0;i<32;i++){const f=i/31,j=Math.sin(f*Math.PI)*(1.5+Math.sin(T*20+f*9));a.setXYZ(i,t.p.x+(m.p.x-t.p.x)*f+Math.sin(T*31+i)*j*.3,t.p.y+(m.p.y-t.p.y)*f-Math.sin(f*Math.PI)*3+Math.cos(T*27+i)*j*.3,t.p.z+(m.p.z-t.p.z)*f)}a.needsUpdate=true},
 clear(){if(TL)TL.visible=false},fxLeft:()=>({tether:TL?.visible?1:0}),
 g:{stop(){if(TL)TL.visible=false},vis(C){if(TL&&!C.api.TH.some(t=>t.k==='twins'&&t.st!=='dead'))TL.visible=false}},
 netOut:(C,t)=>[t.bs.role|0,t.bs.rage|0,Math.ceil(t.bs.snap||0),t.bs.strain|0,t.bs.mate?.id|0],
 netIn(C,t,a){const B=t.bs;if(B.role!==(a[0]|0)&&a[0])swap(C,t);B.role=a[0]|0;B.rage=a[1]|0;B.snap=a[2]|0;B.strain=a[3]|0;
  const m=C.api.TH.find(u=>u.id===a[4]);if(m){B.mate=m;const old=t.bs.enc;if(old&&m.bs.enc&&m.bs.enc!==old&&!old.over&&!m.bs.enc.over){C.join(m.bs.enc,t);old.over=true}}},
 aim:(C,t,s)=>({p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s?-.8:-6)}),
 winTxt:'Both twins are down. Nice flying.',escTxt:'the twins broke off and left',
 sting(S){const t0=S.t+.05,o=S.out(.9);for(const s of[-1,1]){const n=S.nz(t0,2.6),f=S.filt('bandpass',800,1.2),p=n.context.createStereoPanner?n.context.createStereoPanner():null;f.frequency.setValueAtTime(400,t0);f.frequency.exponentialRampToValueAtTime(3000,t0+1.6);
  const e=S.env(t0+(s>0?.25:0),.16,.5,2.4);n.connect(f).connect(e);if(p){p.pan.setValueAtTime(s*.9,t0);p.pan.linearRampToValueAtTime(-s*.9,t0+2.2);e.connect(p).connect(o)}else e.connect(o)}  // two jets crossing
  for(const f of[392,587])S.osc('triangle',f,t0+1.2,.6,S.env(t0+1.2,.05,.02,.6,o))},
 loop(S){const o=S.out(0),a=S.osc('sawtooth',150,S.t,0),b=S.osc('sawtooth',153.5,S.t,0),f=S.filt('lowpass',1100,1.4);a.connect(f);b.connect(f);f.connect(o);return{g:o,stop(){a.stop();b.stop()}}},
 reward:{id:'darts',n:'Twin Darts',short:'two darts hunt the worst jets each wave',txt:'Every wave, 12 s in, two Twin Darts launch from POS CENTRE and hunt the two most dangerous jets or cruise missiles (any drone if there are none): 75% each.',
  wave(C){C.G.tdT=12},step(C,dt){const{G,api}=C;if(!(G.tdT>0)||G.state!=='wave'||!C.auth())return;if((G.tdT-=dt)>0)return;G.tdT=0;
   const L=api.TH.filter(t=>api.live(t)&&!C.BOSSES[t.k]&&C.Z.seen(t)&&(KIND_OK(t))).sort((a,b)=>score(b)-score(a)),f=api.FOBS[1],p=new C.V3(f.x,f.y+20,f.z);
   for(let i=0;i<2&&L.length;i++){const b=C.bolt(p,L[i%L.length],{spd:180,pk:.75,col:[1,.55,.3]});if(b)b.retarget=()=>api.TH.filter(t=>api.live(t)&&!C.BOSSES[t.k]&&KIND_OK(t)).sort((a,c)=>score(c)-score(a))[0]}
   if(L.length)api.feed('<span class="cg">Twin Darts away</span>')}}});
const swap=(C,t)=>{const o=t.mesh;o.parent?.remove(o);o.traverse(q=>q.geometry?.dispose());t.mesh=model(C,1);C.api.scene.add(t.mesh)};
const KIND_OK=t=>t.k!=='ballistic'&&t.k!=='hyper'&&t.k!=='icbm'&&!(t.iff>0);
const score=t=>(t.k==='jet'||t.k==='cruise'?100:0)-Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/Math.max(1,t.spd);
