// Boss: the Hive, a giant hexagonal drone carrier. It drifts in slowly, launching an FPV swarm from its belly bays every 16 s (the bays glow
// amber just before). HIVE: hurt it to half and it SPLITS into three brood carriers that scatter for three different sites, each launching
// smaller swarms; LAST BROOD when one is left. A brood that reaches its site rams it (120). Bursts anywhere on a body count (proximity 1,
// direct 2) and SAMs bite; airstrikes take a point. Beaten (the hive split and every brood down): the Captured Hive trophy.
import {registerBoss} from './zbosses.js';
function combTex(C){return C.decal('hv-comb',512,256,(g,w,h)=>{const{D2}=C;g.fillStyle='#2a2414';g.fillRect(0,0,w,h);for(let y=0,r=0;y<h+20;y+=21,r++)for(let x=(r%2)*12;x<w+24;x+=24){D2.hex(g,x,y,11);g.fillStyle=Math.random()<.25?'#ffb21e':Math.random()<.5?'#7a6532':'#4a3e22';g.fill();g.strokeStyle='#120f08';g.lineWidth=2;g.stroke()}
 D2.stripes(g,0,0,w,22,'#f2b21b','#141414',14);D2.stripes(g,0,h-22,w,22,'#f2b21b','#141414',14)})}
function embTex(C,k){return C.decal('hv-emb'+k,256,256,(g,w)=>{const c=w/2,{D2}=C;g.fillStyle='#141414';D2.hex(g,c,c,118);g.fill();g.strokeStyle='#f2b21b';g.lineWidth=9;D2.hex(g,c,c,108);g.stroke();
 g.fillStyle='#f2b21b';g.beginPath();g.ellipse(c,c+6,30,46,0,0,7);g.fill();g.fillStyle='#141414';for(const y of[-8,12,32])g.fillRect(c-30,c+y,60,9);g.fillStyle='rgba(242,178,27,.6)';for(const s of[-1,1]){g.beginPath();g.ellipse(c+s*44,c-24,34,18,s*.5,0,7);g.fill()}
 D2.text(g,k?['I','II','III'][k-1]:'HIVE',c,c+92,k?40:30,'#f2b21b','900')})}
const MT={};
function mats(C){if(MT.comb)return MT;const T=C.THREE;return Object.assign(MT,{comb:new T.MeshStandardMaterial({map:combTex(C),roughness:.7,metalness:.3}),dark:new T.MeshStandardMaterial({color:0x17150f,roughness:.6,metalness:.5}),
 prop:new T.MeshBasicMaterial({color:0x8a8a80,transparent:true,opacity:.22,depthWrite:false,side:T.DoubleSide}),bay:new T.MeshBasicMaterial({color:new T.Color(0xffa020),toneMapped:false}),
 emb:[0,1,2,3].map(k=>new T.MeshBasicMaterial({map:embTex(C,k),transparent:true,alphaTest:.05,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}))})}
function model(C,R,k){const T=C.THREE,M=mats(C),g=C.group(),H=R*.38;
 C.mesh(g,new T.CylinderGeometry(R,R*.92,H,6),M.comb);C.mesh(g,new T.CylinderGeometry(R*.6,R,H*.5,6),M.dark,0,H*.75,0);C.mesh(g,new T.CylinderGeometry(R*.92,R*.5,H*.4,6),M.dark,0,-H*.7,0);
 const props=[],bays=[];for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*(R+R*.32),z=Math.sin(a)*(R+R*.32);C.mesh(g,new T.BoxGeometry(R*.34,R*.06,R*.08),M.dark,Math.cos(a)*(R+R*.14),H*.2,Math.sin(a)*(R+R*.14)).rotation.y=-a;
  C.mesh(g,new T.CylinderGeometry(R*.22,R*.22,R*.08,14),M.dark,x,H*.2,z);props.push(C.mesh(g,new T.CircleGeometry(R*.2,18).rotateX(-Math.PI/2),M.prop,x,H*.26,z,false));
  const e=C.mesh(g,new T.PlaneGeometry(R*.5,R*.5),M.emb[k],Math.cos(a+Math.PI/6)*R*.95,0,Math.sin(a+Math.PI/6)*R*.95,false);e.lookAt(Math.cos(a+Math.PI/6)*R*3,0,Math.sin(a+Math.PI/6)*R*3)}
 for(let i=0;i<(k?2:6);i++){const a=i*Math.PI*2/(k?2:6);bays.push(C.mesh(g,new T.CircleGeometry(R*.12,6).rotateX(Math.PI/2),M.bay,Math.cos(a)*R*.45,-H*.92,Math.sin(a)*R*.45,false))}
 Object.assign(g.userData,{props,bays});return g}
function swarmFrom(C,t,n){const{api,G}=C,live=api.TH.reduce((a,u)=>a+(u.k==='swarm'&&api.live(u)?1:0),0);if(live>=160)return;const g=++G.gid;
 for(let i=0;i<n;i++){const u=C.Z.make('swarm',t.p.x+C.rnd(-14,14),t.p.z+C.rnd(-14,14));if(u){u.p.y=t.p.y-8;u.grp=g}}api.feed(`<span class="cr">${t.k==='hive'?'The Hive':'A brood carrier'} launched a swarm (${n})</span>`)}
const near=(C,p)=>{let b=null,bd=1e9;for(const s of C.sites()){const d=Math.hypot(s.x-p.x,s.z-p.z);if(d<bd){bd=d;b=s}}return b};
function carry(C,t,dt,o){const B=t.bs;B.rel=(B.rel??6)-dt;if(B.rel<=0){B.rel=o.every;swarmFrom(C,t,o.n)}
 if(!B.site||B.site.hp<=0)B.site=o.pick();const S=B.site;if(!S)return true;const dh=Math.hypot(S.x-t.p.x,S.z-t.p.z);
 if(dh<o.r||B.dive){B.dive=1;C.steer(t,C.dirTo(t,new C.V3(S.x,S.y+3,S.z)),o.spd*1.6,.5,dt,0);if(t.p.distanceTo(new C.V3(S.x,S.y+3,S.z))<o.r*.4||t.p.y<S.y+6){C.strike(t,S,o.dmg);C.api.boom(t.p,6);C.vanish(t,'impacted')}return true}
 C.steer(t,C.levelTo(t,new C.V3(S.x,0,S.z),o.alt),o.spd,.25,dt,80);return true}
registerBoss({id:'hive',n:'The Hive',tag:'HIVE',col:'#ffb21e',spd:24,alt:[580,620],hitR:9,det:12000,cash:1500,bounty:6500,far:5600,
 resist:{rack:.3,gepard:.4,sam:.8,mpads:.3,idome:.5,hflak:.4,flak:.2},hp:8,phases:['HIVE','SPLIT'],phaseAt:[.5],
 note:'a giant drone carrier that launches swarms; at half strength it splits into three brood carriers that go for three different sites.',warn:'a carrier full of swarms',
 spawn:{event:{from:30,p:.03},boss:30},
 intro:{title:'THE HIVE',sub:'carrier · it splits when hurt · each piece spawns swarms',col:'#ffb21e',radio:'Massive carrier inbound, honeycomb hull. It is full of swarms.'},
 build:C=>model(C,16,0),
 init(C,t){t.p.y=C.api.gh(t.p.x,t.p.z)+600;t.bs.rel=8},
 tick:(C,t,dt)=>carry(C,t,dt,{every:16,n:5+Math.floor(C.G.wave/6),spd:24,alt:600,r:260,dmg:250,pick:()=>C.sites().reduce((a,b)=>a.hp>b.hp?a:b,C.sites()[0])}),
 phase(C,t,i){if(i<1||t.bs.split)return;t.bs.split=1;const{api}=C,L=C.sites();C.Z.an?.say('THE HIVE SPLITS','three brood carriers','#ffb21e',3);api.boom(t.p,8);C.api.shake=.8;
  for(let k=0;k<3;k++){const a=Math.atan2(t.v.x,t.v.z)+(k-1)*2.1,v=new C.V3(Math.sin(a),0,Math.cos(a)).multiplyScalar(36);const b=C.spawn('brood',{x:t.p.x+v.x,z:t.p.z+v.z,y:t.p.y,v,enc:t.bs.enc,set:{n:k+1,site:L[k%Math.max(1,L.length)]}});if(b){b.mesh.parent?.remove(b.mesh);b.mesh.traverse(o=>o.geometry?.dispose());b.mesh=model(C,7,k+1);api.scene.add(b.mesh)}}
  C.vanish(t,'split')},
 hit:(C,t,h)=>h.q==='kill'?2:1,
 done:(C,e)=>e.main.bs.split&&e.list.filter(t=>t.k==='brood').length>0&&e.list.filter(t=>t.k==='brood').every(t=>t.bs.dead&&!t.bs.gone),
 phaseName(C,e){const b=e.list.filter(t=>t.k==='brood'&&!t.bs.dead);return!e.main.bs.split?'HIVE':b.length>1?`SPLIT · ${b.length} BROODS`:'LAST BROOD'},
 status(C,e){const t=e.list.find(u=>C.api.live(u));return t?`next swarm in <b>${Math.max(0,Math.ceil(t.bs.rel||0))} s</b> · swarms aloft ${C.api.TH.filter(u=>u.k==='swarm'&&C.api.live(u)).length}`:''},
 vis(C,t,dt){const U=t.mesh.userData;for(const p of U.props)p.rotation.y+=dt*25;const hot=(t.bs.rel||9)<2.5;for(const b of U.bays)b.material.color.setRGB(hot?3:1.2,hot?1.6:.6,hot?.2:.1)},
 netOut:(C,t)=>[Math.ceil(t.bs.rel||0),t.bs.split|0],netIn(C,t,a){t.bs.rel=a[0]|0;t.bs.split=a[1]|0},
 aim:(C,t,s)=>({p:t.p.clone().add(new C.V3(0,-4,0)).addScaledVector(t.v.clone().normalize(),Math.random()<s?-10:-22)}),
 winTxt:'The Hive and every brood are down.',
 sting(S){const t0=S.t+.05,o=S.out(.8),lp=S.filt('lowpass',900,1.5);lp.connect(S.env(t0,.16,1.2,4,o));for(let i=0;i<9;i++){const x=S.osc('sawtooth',105+i*9.3,t0,4),am=S.osc('sine',18+i*3,t0,4),ag=x.context.createGain();ag.gain.value=.5;am.connect(ag.gain);x.connect(ag).connect(lp)}},  // a swelling buzz
 loop(S){const o=S.out(0),lp=S.filt('lowpass',700,1.2);lp.connect(o);const X=[];for(let i=0;i<4;i++){const x=S.osc('sawtooth',118+i*11,S.t,0);x.connect(lp);X.push(x)}return{g:o,stop(){for(const x of X)x.stop()}}},
 reward:{id:'hive',n:'Captured Hive',short:'a counter-swarm hits the first FPV swarm near your sites each wave',txt:'Each wave, when the first enemy FPV swarm comes within 2.5 km of a site, the captured hive launches six friendly FPVs at it from the radar pad (80% each).',
  step(C){const{G,api}=C;if(G.state!=='wave'||G.hvw===G.wave||!C.auth())return;const S=C.sites(),sw=api.TH.filter(t=>t.k==='swarm'&&api.live(t)&&S.some(s=>Math.hypot(s.x-t.p.x,s.z-t.p.z)<2500));if(!sw.length)return;G.hvw=G.wave;
   const p=new C.V3(api.PADP.x,api.PADP.y+15,api.PADP.z),nx=()=>api.TH.find(t=>t.k==='swarm'&&api.live(t));for(let i=0;i<6;i++){const b=C.bolt(p,sw[i%sw.length],{spd:120,pk:.8,col:[1,.75,.2],trail:.3});if(b)b.retarget=nx}api.feed('<span class="cg">Captured hive: counter-swarm away</span>')}}});
registerBoss({id:'brood',child:1,n:'Brood carrier',tag:'BROOD',col:'#ffb21e',spd:36,alt:[430,470],hitR:5,det:12000,cash:700,resist:{rack:.35,gepard:.5,sam:.9,mpads:.4,idome:.5,hflak:.5,flak:.3},hp:2,
 build:C=>model(C,7,1),introFn:()=>{},
 tick:(C,t,dt)=>carry(C,t,dt,{every:14,n:3+Math.floor(C.G.wave/10),spd:36,alt:450,r:140,dmg:120,pick:()=>t.bs.site&&t.bs.site.hp>0?t.bs.site:near(C,t.p)}),
 hit:(C,t,h)=>h.q==='kill'?2:1,vis(C,t,dt){for(const p of t.mesh.userData.props)p.rotation.y+=dt*30},
 tname:(C,t)=>`T${String(t.id).padStart(2,'0')} BROOD ${['I','II','III'][(t.bs?.n||1)-1]}`,
 netOut:(C,t)=>[t.bs.n|0],netIn(C,t,a){if(a[0]&&t.bs.n!==a[0]){t.bs.n=a[0];t.mesh.parent?.remove(t.mesh);t.mesh.traverse(o=>o.geometry?.dispose());t.mesh=model(C,7,a[0]);C.api.scene.add(t.mesh)}},
 aim:(C,t,s)=>({p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s?-6:-16)})});
