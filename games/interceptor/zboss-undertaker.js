// Boss: the Undertaker, a salvage crane-drone that feeds on neglect. It comes when you lose a site, or when a wave starts with a site under
// 30% that you left unrepaired (from wave 6). It hovers over the wreck stripping it, and while it works it LEECHES the other sites: a dark red
// tether to each, their hit points ticking down (never below 1), an alert on the HUD and the radio. It GROWS: an armour plate every 20 s it is
// left alone and two more over every base screen, bolted on visibly, up to ten. Hits strip plates first, then its two-point core; once it is
// IRONCLAD (7+ plates) half the proximity bursts glance off. It outlives a wave (it waits over the wreck through the base screen, where the
// forecast says how big it has grown).
// Counterplay is base care: repair or rebuild the site it strips above 35% and it is starved (three plates fall off) and moves to the next
// wreck, or leaves if there is none; kill it early while it is small (helpers reach it too). Beaten: the Undertaker's Ledger trophy.
import {registerBoss} from './zbosses.js';
const MAXA=10,STARVE=.35;
function bodyTex(C){const n=C.rec().b.undertaker?.met|0;return C.decal('ut-body'+Math.min(20,n),512,256,(g,w,h)=>{const{D2}=C;g.fillStyle='#16151a';g.fillRect(0,0,w,h);D2.panels(g,w,h,'#000',10,.5);
 g.fillStyle='#d9d2bf';for(const x of[90,w-90]){g.fillRect(x-7,40,14,90);g.fillRect(x-30,66,60,14)}  // grave crosses
 D2.text(g,'UNDERTAKER',w/2,64,40,'#d9d2bf','900');D2.text(g,'SALVAGE · RECLAMATION · NO RETURNS',w/2,104,15,'#9a9385','700');
 g.strokeStyle='#d9d2bf';g.lineWidth=3;for(let i=0;i<Math.min(20,n);i++){const x=w/2-130+i*13;g.beginPath();g.moveTo(x,150);g.lineTo(x,180);g.stroke();if(i%5===4){g.beginPath();g.moveTo(x-52,174);g.lineTo(x+2,156);g.stroke()}}  // the sites it has stripped
 D2.stripes(g,0,h-24,w,24,'#d9d2bf','#16151a',16);D2.grime(g,w,h,.15)})}
function rustTex(C){return C.decal('ut-rust',128,128,(g,w,h)=>{g.fillStyle='#5b3a24';g.fillRect(0,0,w,h);for(let i=0;i<120;i++){g.fillStyle=`rgba(${Math.random()<.5?'140,70,30':'30,20,14'},${Math.random()*.35})`;g.beginPath();g.arc(Math.random()*w,Math.random()*h,Math.random()*9,0,7);g.fill()}
 g.fillStyle='#2a1c12';for(const x of[10,w-14])for(const y of[10,h-14])g.beginPath(),g.arc(x+2,y+2,4,0,7),g.fill();g.strokeStyle='#2a1c12';g.lineWidth=4;g.strokeRect(2,2,w-4,h-4)})}
const MT={};
function mats(C){if(MT.body)return MT;const T=C.THREE;return Object.assign(MT,{body:new T.MeshStandardMaterial({map:bodyTex(C),roughness:.7,metalness:.4}),dark:new T.MeshStandardMaterial({color:0x0e0d10,roughness:.5,metalness:.7}),
 rust:new T.MeshStandardMaterial({map:rustTex(C),roughness:.9,metalness:.5}),prop:new T.MeshBasicMaterial({color:0x777777,transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide}),
 eye:new T.MeshBasicMaterial({color:new T.Color(0xff2a10).multiplyScalar(3),toneMapped:false})})}
function model(C){const T=C.THREE,M=mats(C),g=C.group();
 const lid=new T.Shape();lid.moveTo(-2.4,-6);lid.lineTo(2.4,-6);lid.lineTo(3.4,2.5);lid.lineTo(2.2,6);lid.lineTo(-2.2,6);lid.lineTo(-3.4,2.5);lid.closePath();  // a coffin, seen from above
 const lg=new T.ExtrudeGeometry(lid,{depth:2.6,bevelEnabled:false}).rotateX(Math.PI/2).translate(0,1.3,0);const uv=lg.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+3.4)/6.8,(uv.getY(i)+6)/12);C.mesh(g,lg,M.body);
 const fans=[];for(const[x,z]of[[-4.6,4],[4.6,4],[-4.6,-4],[4.6,-4]]){C.mesh(g,new T.TorusGeometry(1.7,.3,8,20).rotateX(Math.PI/2),M.dark,x,.6,z);C.mesh(g,new T.BoxGeometry(Math.abs(x)-2,.3,.4),M.dark,x/2,.6,z);fans.push(C.mesh(g,new T.CircleGeometry(1.6,18).rotateX(-Math.PI/2),M.prop,x,.6,z,false))}
 const claws=[];for(const s of[-1,1]){const a=new T.Group();a.position.set(s*1.6,-1.4,1.5);C.mesh(a,new T.CylinderGeometry(.18,.18,6,8),M.dark,0,-3,0);for(const k of[-1,1])C.mesh(a,new T.BoxGeometry(.25,2.2,.25),M.dark,k*.5,-6.6,0).rotation.z=k*.5;g.add(a);claws.push(a)}
 C.mesh(g,new T.SphereGeometry(.5,10,8),M.eye,0,0,6.2,false);
 const plates=[];for(let i=0;i<MAXA;i++){const a=(i%5)/5*Math.PI*2,y=i<5?1.5:-.5,p=C.mesh(g,new T.BoxGeometry(2.6,1.8,.35),M.rust,Math.cos(a)*3.6,y,Math.sin(a)*5.4);p.lookAt(Math.cos(a)*20,y,Math.sin(a)*30);p.visible=false;plates.push(p)}
 g.userData={fans,claws,plates};return g}
// tethers: a dark red line to each site it drains
let TG=null;
function tethers(C){if(TG)return TG;const T=C.THREE,geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(6*24*3),3));TG=new T.LineSegments(geo,new T.LineBasicMaterial({color:new T.Color(0xff2a20).multiplyScalar(2.5),transparent:true,opacity:.8,toneMapped:false,depthWrite:false}));TG.frustumCulled=false;TG.visible=false;C.api.scene.add(TG);return TG}
const armor=t=>Math.max(0,(t.bs.hp|0)-2);
const rate=t=>.5+.12*armor(t);
const drained=(C,t)=>t.bs.on?C.sites().filter(s=>s!==t.bs.anchor&&s.hp>1):[];
const victim=C=>{const L=C.api.SITES.filter(s=>s.hp<=0||s.hp<s.max*.3);return L.sort((a,b)=>a.hp-b.hp)[0]||null};
function grow(C,t,n,why){const B=t.bs,a0=armor(t),add=Math.min(n,MAXA-a0);if(add<=0)return;B.hp+=add;B.max=Math.max(B.max,B.hp);C.Z.pop?.(t.p,`ARMOUR +${add}`,'#ff6a50');if(why)C.api.feed(`<span class="cr">The Undertaker ${why}: armour ${armor(t)}/${MAXA}</span>`)}
function starve(C,t){const B=t.bs,a=armor(t),k=Math.min(3,a);if(k){B.hp-=k;C.Z.pop?.(t.p,`−${k} PLATES`,'#9fe8ff')}B.anchor=null;B.on=0;const v=victim(C);
 if(v){B.anchor=v;C.api.feed(`<span class="cg">Repaired: the Undertaker is starved and moves to the ${v.n.toLowerCase()}</span>`)}else{C.api.feed('<span class="cg">Nothing left to strip: the Undertaker leaves.</span>');B.leave=1}}
registerBoss({id:'undertaker',n:'The Undertaker',tag:'UNDERTAKER',col:'#ff5a40',spd:45,alt:[25,40],hitR:5,det:9000,cash:1000,bounty:3500,far:5200,persist:1,
 resist:{rack:.45,lrack:.45,gepard:.5,sam:.7,mpads:.4,flak:.35,hflak:.45,idome:.3},hp:C=>2/C.hpK(),
 note:'a salvage drone that strips a wrecked or neglected site and leeches the others, growing armour while you leave it. Repair the site it strips, or kill it early.',warn:'a scavenger over your wreck',
 introFn(C,t){C.Z.an?.say('THE UNDERTAKER','it feeds on what you neglect','#ff5a40',3);C.Z.an?.radio('OVERLORD','Something is stripping our wreck. It is draining the other sites!',2)},
 build:C=>model(C),warm:C=>tethers(C),
 init(C,t){const B=t.bs;B.anchor=B.anchor||victim(C);B.gt=0;B.waves=0;t.p.y=C.api.gh(t.p.x,t.p.z)+260},
 save:(C,t)=>{const A=t.bs.anchor;return{anchor:C.api.SITES.indexOf(A),hp:t.bs.hp,max:t.bs.max,waves:t.bs.waves|0,at:A?{x:A.x+8,z:A.z-6}:null}},
 restore(C,t,st){const B=t.bs,S=C.api.SITES;B.anchor=S[st.anchor]||victim(C);B.hp=Math.max(2,st.hp|0);B.max=Math.max(B.hp,st.max|0);B.waves=st.waves|0;if(B.anchor)t.p.set(B.anchor.x+8,B.anchor.y+30,B.anchor.z-6)},
 withdrawTxt:(C,t)=>`<span class="cr">The Undertaker sinks into the ${t.bs.anchor?t.bs.anchor.n.toLowerCase()+' wreck':'ground'} to wait out the break. It will be back, bigger.</span>`,
 clear(){if(TG)TG.visible=false},fxLeft:()=>({tethers:TG?.visible?1:0}),
 wake(C,t){const B=t.bs;B.waves++;grow(C,t,2,'grew over the break');if(B.anchor&&B.anchor.hp>B.anchor.max*STARVE)starve(C,t);C.Z.an?.say('THE UNDERTAKER',`still here · armour ${armor(t)}/${MAXA}`,'#ff5a40',2)},
 tick(C,t,dt){const{api}=C,B=t.bs;if(B.leave){C.steer(t,C.levelTo(t,new C.V3(t.p.x,0,-6000),300),60,.6,dt,80);if(t.p.z<-4400)C.vanish(t,'escaped');return true}
  if(!B.anchor){B.anchor=victim(C);if(!B.anchor){B.leave=1;return true}}const A=B.anchor;if(A.hp>A.max*STARVE){starve(C,t);return true}
  const P=new C.V3(A.x+8,A.y+30,A.z-6),d=t.p.distanceTo(P);
  if(d>40){B.on=0;C.steer(t,C.dirTo(t,P),C.cl(d*.5,8,50),1.2,dt,20);return true}
  B.on=1;t.p.lerp(P,Math.min(1,dt));t.v.set(Math.sin(B.age*.3),0,Math.cos(B.age*.3));
  B.gt+=dt;if(B.gt>=20){B.gt=0;grow(C,t,1)}
  if((B.dr=(B.dr||0)+dt)>=1){B.dr-=1;const r=rate(t),L=drained(C,t);for(const s of L)s.hp=Math.max(1,s.hp-r);B.tot=(B.tot||0)+r*L.length;
   if((B.al=(B.al||0)-1)<=0&&L.length){B.al=12;const msg=`Undertaker draining ${L.map(s=>s.n.toLowerCase()).join(', ')} · −${r.toFixed(1)}/s each`;api.feed(`<span class="cr">${msg}</span>`);C.Z.an?.radio('OVERLORD',msg+'!',1)}}
  return true},
 hit(C,t,h){if(armor(t)>=7&&h.q==='damage'&&Math.random()<.5){h.txt='IRONCLAD';return 0}return h.q==='kill'?2:1},
 phaseName:(C,e)=>{const a=armor(e.main);return a<3?'STRIPPING':a<7?'ENTRENCHED':'IRONCLAD'},
 status(C,e){const t=e.main,B=t.bs,L=drained(C,t);return`armour <b>${armor(t)}/${MAXA}</b> (+1 every 20 s, +2 a break) · ${B.anchor?`stripping the ${B.anchor.n.toLowerCase()}`:'looking'}${L.length?` · <b>draining ${L.length} site${L.length>1?'s':''} −${rate(t).toFixed(1)}/s</b>`:''}<br>repair the ${B.anchor?B.anchor.n.toLowerCase():'wreck'} above ${STARVE*100}% to starve it`},
 vis(C,t,dt){const U=t.mesh.userData,B=t.bs,a=armor(t);for(const f of U.fans)f.rotation.y+=dt*35;U.plates.forEach((p,i)=>{p.visible=i<a});for(const c of U.claws)c.rotation.x=B.on?Math.sin(performance.now()/300)*.4:0;
  if(B.on&&Math.random()<dt*6&&B.anchor)C.FX.emit(new C.V3(B.anchor.x+C.rnd(-12,12),B.anchor.y+2,B.anchor.z+C.rnd(-12,12)),0xfff0c0,10,8,.3,null,3);
  const L=drained(C,t),G=tethers(C);G.visible=L.length>0&&t.st!=='dead';if(!G.visible)return;const pa=G.geometry.attributes.position,T=performance.now()/1000;let n=0;
  for(const s of L)for(let i=0;i<24;i++){for(const k of[i,i+1]){const f=k/24,sag=Math.sin(f*Math.PI)*40;pa.setXYZ(n++,t.p.x+(s.x-t.p.x)*f,t.p.y+(s.y+25-t.p.y)*f+sag*(1-f)*.5+Math.sin(T*3+f*20)*1.5,t.p.z+(s.z-t.p.z)*f)}}
  for(let i=n;i<pa.count;i++)pa.setXYZ(i,0,-1e4,0);pa.needsUpdate=true;G.material.opacity=.5+.3*Math.sin(T*4);
  if(Math.random()<dt*10){const s=C.pick(L),f=(T*.5)%1;C.FX.emit(new C.V3(s.x+(t.p.x-s.x)*f,s.y+25+(t.p.y-s.y-25)*f,s.z+(t.p.z-s.z)*f),0xff3020,2,1,.4,null,2.5)}},
 netOut:(C,t)=>[C.api.SITES.indexOf(t.bs.anchor),t.bs.on|0],netIn(C,t,a){t.bs.anchor=C.api.SITES[a[0]]||null;t.bs.on=a[1]|0},
 aim:(C,t,s)=>({p:t.p.clone().add(new C.V3(0,Math.random()<s?1:8,0)),v:new C.V3()}),
 won(C,e){const a=armor(e.main);if(a)C.Z.earn?.(a*250,e.main.p,' PLATES')},winTxt:'The Undertaker is scrap. Bury it.',
 sting(S){const t0=S.t+.05,o=S.out(.9);for(const[f,k]of[[196,.5],[392,.25],[466,.18],[587,.12],[784,.08]]){const x=S.osc('sine',f,t0,5);x.connect(S.env(t0,k*.3,.005,5,o))}  // a funeral bell
  for(let i=0;i<8;i++){const n=S.nz(t0+1.4+i*.09,.06),b=S.filt('bandpass',3200,5);n.connect(b).connect(S.env(t0+1.4+i*.09,.06,.002,.06,o))}},  // chains
 loop(S){const o=S.out(0),x=S.osc('triangle',55,S.t,0),y=S.osc('sine',82.5,S.t,0);x.connect(o);y.connect(o);return{g:o,stop(){x.stop();y.stop()}}},
 loopVol:(C,t)=>C.cl(1-t.p.distanceTo(C.api.camera.position)/2500,0,1)**2*.12+(t.bs.on?.02:0),
 reward:{id:'ledger',n:'Undertaker\'s Ledger',short:'every base screen, damaged sites get 4% back',txt:'At every base screen each damaged (not destroyed) site gets 4% of its hit points back for free.',
  base(C){for(const s of C.api.SITES)if(s.hp>0&&s.hp<s.max)s.hp=Math.min(s.max,s.hp+Math.round(s.max*.04))}},
 g:{start(C){C.G.utq=null;C.G.utW=-99;C.G.uthp=null},stop(){if(TG)TG.visible=false},
  step(C,dt){const{G,api}=C;if(!C.auth()||!G.on)return;const prev=G.uthp||[];G.uthp=api.SITES.map(s=>s.hp);
   if(G.state==='wave'&&G.wave>=6-(C.Z.diff?.().shift|0)){api.SITES.forEach((s,i)=>{if(prev[i]>0&&s.hp<=0&&!G.utq)G.utq={s,t:8}})}
   if(G.utq&&G.state==='wave'&&(G.utq.t-=dt)<=0){const s=G.utq.s;G.utq=null;summon(C,s)}
   if(TG&&!api.TH.some(t=>t.k==='undertaker'&&api.live(t)))TG.visible=false},
  wave(C){const{G}=C;if(!C.auth()||G.wave<6-(C.Z.diff?.().shift|0))return;const v=victim(C);if(v)summon(C,v)},
  note(C){const K=C.G.bkeep?.undertaker;if(!K)return'';const A=C.api.SITES[K.anchor],a=Math.max(0,(K.hp|0)-2),n=C.api.SITES.filter(s=>s!==A&&s.hp>1).length;
   return`<p class="zhint"><b style="color:#ff5a40">UNDERTAKER</b> waits in the ${A?A.n.toLowerCase()+' wreck':'ground'}: armour <b>${a}/${MAXA}</b>, <b>+2</b> when the wave starts, then draining about ${(.5+.12*Math.min(MAXA,a+2)).toFixed(1)} hp/s from each of ${n} sites. Repair or rebuild the ${A?A.n.toLowerCase():'wreck'} above ${STARVE*100}% to starve it, or kill it early.</p>`}}});
function summon(C,s){const{G,api}=C;if(api.TH.some(t=>t.k==='undertaker'&&t.st!=='dead')||G.bkeep?.undertaker||G.wave-(G.utW??-99)<3)return;G.utW=G.wave;const t=C.spawn('undertaker',{x:s.x,z:s.z-1600,set:{anchor:s}});
 if(t)api.feed(`<span class="cr">Something is coming for the ${s.n.toLowerCase()} wreck…</span>`)}
