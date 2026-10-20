// Boss: the Siren, an escort jet that broadcasts a false friendly ID. Every drone within its song (900 m, 1200 m once hurt) reads as
// FRIENDLY: green on your radar and brackets, and your helpers and swarm hold fire on it. The Siren itself shows as a friendly too, until a
// pilot gets within 600 m and sees it for what it is (pearl hull, teal-and-pink emitter ring, the singing-face emblem under a fake green
// IFF chevron). It is your eyes against the machine: spot the "friendlies" heading for your sites, kill them by hand, or kill the Siren.
// SINGING (it flies with its own escort raid), SHRIEKING (hurt: its song widens and it slips away to cover another raid), FALTERING (its song
// cuts out 3 s in every 7: your helpers wake up in the gaps). Its warble is what you hear. Beaten: the Captured Transponder trophy.
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
function pearl(C){return C.decal('sr-skin',512,512,(g,w,h)=>{const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#f2eef4');gr.addColorStop(.5,'#dfe9ef');gr.addColorStop(1,'#efe2ee');g.fillStyle=gr;g.fillRect(0,0,w,h);
 for(let y=0,r=0;y<h+20;y+=14,r++)for(let x=(r%2)*10;x<w+20;x+=20){g.strokeStyle=`hsla(${(x+y)%360},55%,70%,.45)`;g.lineWidth=1.5;g.beginPath();g.arc(x,y,10,0,Math.PI);g.stroke()}  // iridescent scales
 C.D2.panels(g,w,h,'#9aa',10,.25)})}
function face(C){return C.decal('sr-face',256,256,(g,w)=>{const c=w/2;g.fillStyle='rgba(20,30,40,.9)';g.beginPath();g.arc(c,c,118,0,7);g.fill();g.strokeStyle='#ff7ad9';g.lineWidth=7;g.stroke();
 g.fillStyle='#e8f7ff';g.beginPath();g.ellipse(c-20,c+6,46,62,0,0,7);g.fill();g.fillStyle='#14202a';g.beginPath();g.ellipse(c-34,c-10,8,12,0,0,7);g.fill();g.beginPath();g.ellipse(c-6,c-10,8,12,0,0,7);g.fill();g.beginPath();g.ellipse(c-20,c+34,12,18,0,0,7);g.fill();  // the singing face
 g.strokeStyle='#5ff0e0';g.lineWidth=6;for(const r of[30,52,74]){g.beginPath();g.arc(c+18,c+30,r,-.7,.7);g.stroke()}
 g.fillStyle='#3ddc84';g.beginPath();g.moveTo(c-60,c-92);g.lineTo(c,c-60);g.lineTo(c+60,c-92);g.lineTo(c+60,c-74);g.lineTo(c,c-42);g.lineTo(c-60,c-74);g.closePath();g.fill();C.D2.text(g,'FRIEND',c,c+96,20,'#3ddc84','900')})}  // the false IFF chevron
const MT={};
function mats(C){if(MT.skin)return MT;const T=C.THREE;return Object.assign(MT,{skin:new T.MeshStandardMaterial({map:pearl(C),roughness:.25,metalness:.35}),dark:new T.MeshStandardMaterial({color:0x2a3440,roughness:.3,metalness:.7}),
 ring:new T.MeshBasicMaterial({color:new T.Color(0x5ff0e0).multiplyScalar(2.5),toneMapped:false}),face:new T.MeshBasicMaterial({map:face(C),transparent:true,alphaTest:.05,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})})}
function model(C){const T=C.THREE,M=mats(C),g=C.group();
 C.mesh(g,new T.LatheGeometry([[0,-6],[.7,-5.6],[1.1,-2],[1.1,2],[.7,4.6],[0,6.4]].map(([r,y])=>new T.Vector2(r,y)),18).rotateX(Math.PI/2),M.skin);
 const w=new T.Shape();w.moveTo(0,2);w.bezierCurveTo(4,1,7,-1,8,-3.2);w.lineTo(0,-2.4);w.lineTo(-8,-3.2);w.bezierCurveTo(-7,-1,-4,1,0,2);const wg=new T.ExtrudeGeometry(w,{depth:.15,bevelEnabled:false}).rotateX(Math.PI/2);
 const uv=wg.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+8)/16,(uv.getY(i)+3.2)/5.2);C.mesh(g,wg,M.skin);
 const ring=C.mesh(g,new T.TorusGeometry(2.4,.22,10,32),M.ring,0,1.6,-2.5,false);ring.rotation.x=Math.PI/2;C.mesh(g,new T.CylinderGeometry(.15,.15,1.4,6),M.dark,0,.9,-2.5);
 for(const s of[-1,1]){const f=C.mesh(g,new T.PlaneGeometry(2,2),M.face,s*1.12,0,0,false);f.rotation.y=s*Math.PI/2;C.mesh(g,new T.BoxGeometry(.12,2.2,2),M.skin,s*1.4,1,-5).rotation.z=-s*.4}
 const waves=[];for(let i=0;i<3;i++){const sp=new T.Sprite(new T.SpriteMaterial({map:ringTex(C),color:new T.Color(0x5ff0e0),transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));sp.position.set(0,1.6,-2.5);g.add(sp);waves.push(sp)}
 g.userData={ring,waves};return g}
const ringTex=C=>C.decal('sr-ring',128,128,(g,w)=>{g.strokeStyle='#fff';g.lineWidth=6;g.beginPath();g.arc(w/2,w/2,w/2-6,0,7);g.stroke()});
const R=t=>t.bs.ph>=1?1200:900,singing=t=>!(t.bs.ph>=2&&(t.bs.age||0)%7>4);
const group=(C,t)=>{const L=C.api.TH.filter(u=>C.api.live(u)&&!C.BOSSES[u.k]);if(!L.length)return null;const c=new C.V3();let n=0;const near=L.filter(u=>u.p.distanceTo(t.p)<1500);
 const S=(near.length?near:L);for(const u of S){c.add(u.p);n++}return c.divideScalar(n)};
registerBoss({id:'siren',n:'The Siren',tag:'FRIENDLY',col:'#5ff0e0',spd:70,alt:[300,600],hitR:2.4,det:9000,cash:900,bounty:4500,far:5600,
 resist:{rack:.5,gepard:.6,sam:.9,mpads:.7,idome:.4,hflak:.4,flak:.2},hp:3,phases:['SINGING','SHRIEKING','FALTERING'],
 note:'an escort that broadcasts a false friendly ID: drones near it show green and your helpers hold fire. Spot it visually (within 600 m it is unmasked) and kill it, or kill what it covers by hand.',warn:'friendlies?',
 spawn:{event:{from:10,p:.05}},
 introFn(C,t){C.Z.an?.radio('OVERLORD','Friendly flight checking in from the north… wait. We have no flights up there.',2);C.api.feed('<span class="cg">IFF: friendly flight inbound.</span> <span class="co">…Nobody filed one.</span>')},
 build:C=>model(C),
 init(C,t){const{api}=C;t.p.y=api.gh(t.p.x,t.p.z)+450;const n=4+Math.floor(C.G.wave/8);for(let i=0;i<n;i++){const u=C.Z.make(i%3?'shahed':'jet',t.p.x+C.rnd(-200,200),t.p.z+C.rnd(-200,200));if(u)u.p.y=t.p.y+C.rnd(-80,80)}},
 tick(C,t,dt){const{api}=C,B=t.bs;for(const d of C.pilots())if(d.p.distanceTo(t.p)<600&&!B.ident){B.ident=1;C.Z.an?.say('SIREN UNMASKED','that "friendly" is the Siren','#5ff0e0',3);api.feed('<span class="cr">That friendly is an enemy: the SIREN.</span> Its covered drones still read green while it sings.')}
  if(B.age>240&&!B.flee)B.flee=1;if(B.flee){C.steer(t,C.levelTo(t,new C.V3(t.p.x,0,-6000),500),95,.5,dt,100);if(t.p.z<-4400)C.vanish(t,'escaped');return true}
  if(B.ph>=1&&!B.hop){B.hop=1;const L=api.TH.filter(u=>api.live(u)&&!C.BOSSES[u.k]&&u.p.distanceTo(t.p)>1500);if(L.length)B.goal=C.pick(L)}
  let c=B.goal&&api.live(B.goal)?B.goal.p:group(C,t);if(!c){const s=C.pick(C.sites());if(!s)return true;c=new C.V3(s.x,s.y+400,s.z-1800)}
  const P=c.clone().add(new C.V3(0,60,0)).addScaledVector(t.v.clone().setY(0).normalize(),-80),d=t.p.distanceTo(P);C.steer(t,C.dirTo(t,P),C.cl(d*.3+40,40,110),1.2,dt,80);
  // the song: everything near it reads friendly (refreshed every step; it fades a moment after the song stops)
  if(singing(t))for(const u of api.TH)if(api.live(u)&&!C.BOSSES[u.k]&&u.p.distanceTo(t.p)<R(t))u.iff=.6;
  return true},
 g:{step(C,dt){for(const u of C.api.TH)if(u.iff>0&&!C.BOSSES[u.k])u.iff=Math.max(0,u.iff-dt)}},
 barName:(C,e)=>e.main.bs.ident?'The Siren':'IFF: friendly flight?',phaseName:(C,e)=>e.main.bs.ident?['SINGING','SHRIEKING','FALTERING'][e.main.bs.ph|0]:'???',
 label:(C,t)=>t.bs.ident?`SIREN <span class="cr">ENEMY · FALSE IFF</span> · ${t.bs.hp}/${t.bs.max}`:'IFF <span class="cg">FRIENDLY</span>',
 tname:(C,t)=>`T${String(t.id).padStart(2,'0')} ${t.bs?.ident?'SIREN':'FRIENDLY'}`,
 hit:(C,t,h)=>h.q==='kill'?2:1,
 status(C,e){const t=e.main,n=C.api.TH.filter(u=>u.iff>0&&C.api.live(u)&&!C.BOSSES[u.k]).length;return`${t.bs.ident?'<b>UNMASKED</b>':'hidden as a friendly · get within 600 m to see it'} · covering <b>${n}</b> drone${n===1?'':'s'} · song ${R(t)} m${t.bs.ph>=2?(singing(t)?' · singing':' · <b>SILENT</b>: helpers can fire'):''}`},
 vis(C,t,dt){const U=t.mesh.userData,T=performance.now()/1000,on=singing(t);U.ring.material.color.setHSL((T*.15)%1>.5?.85:.48,1,on?.6:.2).multiplyScalar(on?2.5:1);
  U.waves.forEach((w,i)=>{const f=(T*.6+i/3)%1;w.scale.setScalar(5+f*60);w.material.opacity=on?(1-f)*.35:0});
  if(t.iff!==(t.bs.ident?0:1))t.iff=t.bs.ident?0:1e9},
 radar(C,rc,P,t){rc.strokeStyle='rgba(61,220,132,.45)';rc.lineWidth=1.5;for(const u of C.api.TH)if(u.iff>0&&C.api.live(u)&&C.Z.seen(u)){const q=P(u.p.x,u.p.z);rc.beginPath();rc.arc(q[0],q[1],9,0,7);rc.stroke()}},
 netOut:(C,t)=>[t.bs.ident|0],netIn(C,t,a){t.bs.ident=a[0]|0},
 aim:(C,t,s)=>Math.random()<s*(t.bs.ident?1:.5)?{p:t.p.clone().addScaledVector(t.v.clone().normalize(),-.9)}:null,
 winTxt:'The Siren is silent. IFF is clean again.',
 sting(S){const t0=S.t+.05,o=S.out(.8);for(const[f0,f1,d]of[[500,1100,0],[660,1320,.3]]){const x=S.osc('sine',f0,t0+d,3.2),v=S.osc('sine',6.5,t0+d,3.2),vg=x.context.createGain();vg.gain.value=40;v.connect(vg).connect(x.frequency);
  x.frequency.setValueAtTime(f0,t0+d);x.frequency.exponentialRampToValueAtTime(f1,t0+d+1.6);x.frequency.exponentialRampToValueAtTime(f0*1.2,t0+d+3.1);x.connect(S.env(t0+d,.07,.3,3.2,o))}},  // a glissando song
 loop(S){const o=S.out(0),x=S.osc('sine',720,S.t,0),y=S.osc('sine',1083,S.t,0),v=S.osc('sine',7,S.t,0),vg=x.context.createGain(),yg=x.context.createGain();vg.gain.value=60;yg.gain.value=.4;v.connect(vg);vg.connect(x.frequency);vg.connect(y.frequency);x.connect(o);y.connect(yg).connect(o);return{g:o,stop(){x.stop();y.stop();v.stop()}}},
 loopVol:(C,t)=>C.cl(1-t.p.distanceTo(C.api.camera.position)/2200,0,1)**2*.06*(singing(t)?1:.15),
 reward:{id:'transponder',n:'Captured Transponder',short:'two drones a wave spoofed into empty fields',txt:'Twenty seconds into every wave, the captured transponder sings to the two drones closest to their targets: they come down in empty fields.',
  wave(C){C.G.trT=20},step(C,dt){const{G,api}=C;if(!(G.trT>0)||G.state!=='wave'||!C.auth())return;if((G.trT-=dt)>0)return;G.trT=0;
   const L=api.TH.filter(t=>api.live(t)&&!C.BOSSES[t.k]&&(t.k==='shahed'||t.k==='jet'||t.k==='heavy')&&!t.spoof).sort((a,b)=>a.p.distanceTo(a.aim)-b.p.distanceTo(b.aim)).slice(0,2);
   for(const t of L){t.spoof=1;C.Z.pop?.(t.p,'SPOOFED','#5ff0e0')}if(L.length)api.feed(`<span class="cb">Captured transponder: ${L.length} drone${L.length>1?'s':''} spoofed</span>`)}}});
