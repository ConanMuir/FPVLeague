// Zombies kill chain: the layered defence against the fast kinds (zdata FAST: ballistic, hypersonic, ICBM). Each fast track passes up to
// three layers and each layer gets its own roll, so buying layers (and placing them) is the late-game strategy:
//  boost phase  a forward battery per launch sector (West / North / East edge, zdata BOOST): one shot at each track launched from its sector
//               as it climbs out, while its magazine lasts. Its sensors also see those launches (full early warning, zwarn.js).
//  midcourse    Iron Dome (ballistic) and Golden Dome (zdef.js). When the Golden Dome's magazine for the wave is empty it reloads from a stock
//               of space interceptors bought between waves (zdata STOCK); rounds it loaded but didn't fire go back into the stock.
//  terminal     point defence at a site (zdata PDEF): a laser turret's last-chance roll at each heavy hitter diving onto that site; a few
//               charges a wave, the last one kept for a fast track when one is inbound to its site.
// Each fast track's chain status (BOOST ✗ → MID ✓ pending → TERMINAL ready) shows on the alert panel (zwarn.js), the track box, the radar
// and the 3D impact marker. The base screen's Kill chain tab (zbase.js) sells it all. State: G.kc, and t.kc on each fast track.
// Co-op: the host runs the chain; its snapshot carries G.kc and the per-track status (znet.js 'kc'); purchases are requests (znet.js 'K').
import {KIND,FAST,SECTORS,sectorOf,chainFrom,BOOST,STOCK,PDEF,EWARN,WACT} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a);
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initChain(api,G,Z){
 const {THREE,scene,TH,SITES,gh}=api,V3=THREE.Vector3,_a=new V3();
 const SITE_C={x:0,z:1950};  // centre of the defended area (zombies.js): spawn bearings are measured from here
 const fresh=()=>({boost:[null,null,null],pd:{},stock:0,ewr:0,decoys:0,hard:{},evac:{},hcd:0,
  st:{boost:0,boostK:0,mid:0,pd:0,pdK:0,stock:0,harden:0,evac:0,decoy:0,decoyK:0}});  // st: what the chain did this run (bench, tests)
 G.kc=fresh();
 const isFast=t=>FAST.includes(t.k);
 const from=()=>chainFrom(k=>Z.kindFrom(k));
 const sellK=()=>Z.meta?.k('sellK',.5)??.5;
 const gdomes=()=>Z.def.D.filter(d=>d.type==='gdome');
 const stockCap=()=>STOCK.cap*gdomes().length;
 const say=h=>Z.online&&Z.team?Z.team(h):api.feed(h);  // co-op host: the whole team sees it
 const siteBy=n=>SITES.find(s=>s.n===n);

 // ---------- per-track state: t.kc = {sec: launch sector, b: boost status, bt: seconds to the boost roll, cue: seen at launch, det: detected,
 // mc: a dome shot holds it, mm: midcourse misses, pd: point defence status, dc: decoy tried} ----------
 const bearing=t=>Math.atan2(t.p.x-SITE_C.x,SITE_C.z-t.p.z);
 function adopt(t){const sec=sectorOf(bearing(t)),B=G.kc.boost[sec],k={sec,b:'none',bt:0,cue:B?1:0,det:0,mc:0,mm:0,pd:'',dc:0};t.kc=k;
  if(B){if(B.ammo>0){B.ammo--;k.b='wait';k.bt=rnd(4,6)}else k.b='empty'}}
 // boost phase: the battery's one shot as the track climbs out
 function boostRoll(t){const k=t.kc,B=G.kc.boost[k.sec];G.kc.st.boost++;const p=BOOST.lv[B?B.lvl:0].p[t.k]||0,S=SECTORS[k.sec].n;
  if(Math.random()<p){k.b='kill';G.kc.st.boostK++;Z.helperKill(t);say(`<span class="cg">Boost-phase intercept: ${Z.tname(t)} down over the ${S.toLowerCase()} edge</span>`);return}
  k.b='miss';say(`<span class="co">Boost battery ${S}: missed ${Z.tname(t)}</span>`)}
 // midcourse: the Golden Dome reloads from the stock when its magazine is empty and something only it can stop is up
 const gdWants=()=>{const dome=Z.def.D.some(e=>e.type==='idome'&&e.ammo>0);
  return TH.some(u=>api.live(u)&&!u.claim&&!u.dcy&&Z.seen(u)&&((u.k==='hyper'||u.k==='icbm')&&u.p.distanceTo(u.aim)<90000||u.k==='ballistic'&&!dome&&u.p.distanceTo(u.aim)<15000))};
 function restock(){if(G.kc.stock<=0)return;const d=gdomes().find(d=>d.ammo<=0);if(!d||!gdWants())return;d.ammo=1;d.stk=(d.stk|0)+1;G.kc.stock--;G.kc.st.stock++}
 // terminal: each point defence takes one roll at the biggest hitter diving onto its site
 function pdStep(){for(const s of SITES){const P=G.kc.pd[s.n];if(!P||P.ch<=0||s.hp<=0)continue;const L=PDEF.lv[P.lvl];let best=null,bd=0;
   const fastIn=TH.some(u=>api.live(u)&&u.tgt===s&&isFast(u)&&!u.dcy&&!(u.kc?.pd));
   for(const t of TH){if(!api.live(t)||t.tgt!==s||t.dcy||t.spoof||t.lure>0||t.pdT||!(L.p[t.k]>0))continue;const d=t.p.distanceTo(t.aim);
    if(d>(isFast(t)?PDEF.rng:PDEF.near))continue;if(!isFast(t)&&fastIn&&P.ch<=1)continue;const dm=KIND[t.k].dmg;if(dm>bd){bd=dm;best=t}}
   if(!best)continue;P.ch--;best.pdT=1;G.kc.st.pd++;beam(s,best.p);Z.flash(best.p,1.2);
   const hit=Math.random()<L.p[best.k];if(best.kc)best.kc.pd=hit?'kill':'miss';
   if(hit){G.kc.st.pdK++;Z.helperKill(best);say(`<span class="cg">Point defence at the ${s.n.toLowerCase()}: ${Z.tname(best)} destroyed</span>`)}
   else say(`<span class="co">Point defence at the ${s.n.toLowerCase()} missed ${Z.tname(best)}</span>`)}}

 // ---------- wave edges: magazines and charges refill when a wave starts; unfired stock goes back when it ends ----------
 function waveStart(){for(const B of G.kc.boost)if(B)B.ammo=BOOST.lv[B.lvl].mag;for(const n in G.kc.pd)G.kc.pd[n].ch=PDEF.lv[G.kc.pd[n].lvl].ch;G.kc.hard={}}
 function waveEnd(){for(const d of gdomes())if(d.stk){const back=Math.min(d.stk,Math.max(0,d.ammo));G.kc.stock+=back;G.kc.st.stock-=back;d.stk=0}}
 let st0='';
 function step(dt){if(!G.on||api.demo)return;const st=G.state;if(st!==st0){if(st==='wave'&&!Z.mirror)waveStart();if(st0==='wave'&&!Z.mirror)waveEnd();st0=st}
  for(const b of beams)b.t-=dt;
  if(Z.mirror||st!=='wave'&&st!=='clear')return;
  for(const t of TH){if(!isFast(t)||!api.live(t))continue;if(!t.kc)adopt(t);const k=t.kc;
   if(k.b==='wait'&&(k.bt-=dt)<=0)boostRoll(t);if(!api.live(t))continue;
   const dome=t.claim&&/dome/.test(t.claim.d?.type||t.claim.type||'');if(dome&&!k.mc)G.kc.st.mid++;if(k.mc&&!dome)k.mm++;k.mc=dome?1:0}  /* a dome shot let go of a track that still flies: a midcourse miss */
  restock();pdStep()}

 // ---------- status of a fast track's chain (host and co-op client alike: built from synced state) ----------
 // b: none (no battery in its sector) / empty (battery out of shots) / wait / miss / kill. m: pending / ready / miss / none. t: ready / miss / empty / none.
 function status(t){const k=t.kc||{};const ty=t.claim&&(t.claim.d?.type||t.claim.type)||'';
  let m='none';if(/dome/.test(ty))m='pending';else{const ok=t.k==='ballistic'?Z.def.D.some(d=>(d.type==='idome'||d.type==='gdome')&&d.ammo>0)||gdomes().length&&G.kc.stock>0:Z.def.D.some(d=>d.type==='gdome'&&d.ammo>0)||gdomes().length&&G.kc.stock>0;m=ok?'ready':k.mm?'miss':'none'}
  const P=t.tgt&&G.kc.pd[t.tgt.n];const tm=k.pd==='miss'?'miss':!P?'none':P.ch>0?'ready':'empty';
  return{b:k.b||'none',m,mm:k.mm|0,t:tm}}
 // a layer that isn't there reads ✗ (dim red: a gap you could fill); one that tried and failed reads ✗ missed
 const BTXT={none:'✗',empty:'✗ no shots',wait:'… firing',miss:'✗ missed',kill:'✓'},MTXT={pending:'✓ pending',ready:'ready',miss:'✗ missed',none:'✗'},TTXT={ready:'ready',miss:'✗ missed',empty:'✗ no charge',none:'✗'};
 const good=s=>s==='wait'||s==='pending'||s==='ready'||s==='kill';
 // "BOOST ✗ → MID ✓ pending → TERMINAL ready", with each step coloured (html) or plain (text)
 Z.chainLine=(t,html=true)=>{const s=status(t),seg=[['BOOST',BTXT[s.b],s.b],['MID',MTXT[s.m]+(s.mm&&s.m!=='miss'?` (${s.mm} miss${s.mm>1?'es':''})`:''),s.m],['TERMINAL',TTXT[s.t],s.t]];
  return seg.map(([n,v,c])=>html?`<span class="${good(c)?'cg':c==='none'?'zgap':'cr'}">${n} ${v}</span>`:`${n} ${v}`).join(html?' <i>→</i> ':' → ')};
 Z.chainStatus=status;
 const l0=Z.label;Z.label=t=>l0(t)+(isFast(t)&&t.kc?`<br><small>${Z.chainLine(t)}</small>`:'');
 // radar: three small squares next to each detected fast track's impact marker (boost, mid, terminal: green = working / pending, red = gap, grey = none)
 const SQ=c=>good(c)?'#3ddc84':c==='none'?'#a8535a':'#ff4d4d';
 const rd0=Z.radar;Z.radar=(rc,P,sel,K)=>{rd0(rc,P,sel,K);if(!G.on)return;
  for(const t of TH){if(!isFast(t)||!api.live(t)||!Z.seen(t))continue;const s=status(t),q=P(t.aim.x,t.aim.z);[s.b,s.m,s.t].forEach((c,i)=>{rc.fillStyle=SQ(c);rc.fillRect(q[0]+11+i*7,q[1]-3,5,6)})}
  for(const s of SITES){const D=G.kc.pd[s.n];if(!D||s.hp<=0)continue;const q=P(s.x,s.z);rc.strokeStyle=D.ch>0?'rgba(95,227,255,.8)':'rgba(255,77,77,.6)';rc.lineWidth=1.5;rc.beginPath();rc.arc(q[0],q[1],9,0,7);rc.stroke()}};
 // the 3D impact marker gets the chain status under its countdown
 const ov0=Z.overlay;Z.overlay=oc=>{ov0(oc);if(!G.on)return;const cam=api.camera,W=innerWidth,H=innerHeight;oc.save();oc.textAlign='center';oc.font='700 11px "JetBrains Mono",monospace';oc.shadowColor='#000';oc.shadowBlur=4;
  for(const t of TH){if(!isFast(t)||!api.live(t)||!Z.seen(t))continue;_a.copy(t.aim).project(cam);if(_a.z>1||Math.abs(_a.x)>1.05||Math.abs(_a.y)>1.05)continue;const s=status(t),X=(_a.x*.5+.5)*W,Y=(-_a.y*.5+.5)*H;
   const parts=[['B',s.b],['M',s.m],['T',s.t]];let x=X-30;for(const[n,c]of parts){oc.fillStyle=SQ(c);oc.fillText(n+(good(c)?'✓':'✗'),x,Y+56);x+=30}}
  oc.restore()};

 // ---------- point defence turrets at the sites, and their beams ----------
 const MT={base:new THREE.MeshStandardMaterial({color:0x3b4048,roughness:.5,metalness:.5}),lens:new THREE.MeshBasicMaterial({color:0x9ff4ff})};
 function pdMesh(s){const g=new THREE.Group(),o=(geo,m,y)=>{const x=new THREE.Mesh(geo,m);x.position.y=y;x.castShadow=true;g.add(x);return x};
  o(new THREE.CylinderGeometry(1.6,1.9,1.6,14),MT.base,.8);o(new THREE.SphereGeometry(1.25,16,10,0,Math.PI*2,0,Math.PI/2),MT.base,1.6);const b=o(new THREE.CylinderGeometry(.22,.22,2.4,8).rotateZ(Math.PI/2),MT.base,2.2);b.position.x=1.2;o(new THREE.SphereGeometry(.3,8,6),MT.lens,2.25).position.x=2.4;
  const a=-.75,d=s.r+16,x=s.x+Math.sin(a)*d,z=s.z+Math.cos(a)*d;g.position.set(x,gh(x,z),z);g.userData.free=1;scene.add(g);return g}
 const meshes={};
 function syncMeshes(){for(const s of SITES){const want=!!G.kc.pd[s.n]&&G.on;if(want&&!meshes[s.n])meshes[s.n]=pdMesh(s);if(!want&&meshes[s.n]){scene.remove(meshes[s.n]);meshes[s.n].traverse(q=>q.geometry?.dispose());delete meshes[s.n]}}}
 const BN=8,bPos=new Float32Array(BN*6),bGeo=new THREE.BufferGeometry();bGeo.setAttribute('position',new THREE.BufferAttribute(bPos,3));bGeo.setDrawRange(0,0);
 const bLine=new THREE.LineSegments(bGeo,new THREE.LineBasicMaterial({color:new THREE.Color(.6,1,1).multiplyScalar(4),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));bLine.frustumCulled=false;scene.add(bLine);
 const beams=[];
 function beam(s,p){if(beams.length>=BN)beams.shift();const m=meshes[s.n];beams.push({a:m?new V3(m.position.x+2.4,m.position.y+2.3,m.position.z):new V3(s.x,s.y+6,s.z),b:p.clone(),t:.3,si:SITES.indexOf(s)})}
 function visuals(){syncMeshes();let n=0;for(let i=beams.length-1;i>=0;i--)if(beams[i].t<=0)beams.splice(i,1);for(const b of beams){const o=n*6;bPos[o]=b.a.x;bPos[o+1]=b.a.y;bPos[o+2]=b.a.z;bPos[o+3]=b.b.x;bPos[o+4]=b.b.y;bPos[o+5]=b.b.z;n++}
  bGeo.setDrawRange(0,n*2);bGeo.attributes.position.needsUpdate=true;bLine.material.opacity=.9}

 // ---------- purchases (solo, and the host applying a co-op request): a = what, x = which (sector, site index, count, "from>to") ----------
 // returns the money spent (refunds negative) and a line for the team feed, or null if it can't be done
 function act(a,x){const K=G.kc,B=K.boost,c0=G.cash,lock=G.wave+1<from();let msg='';
  const pay=c=>{if(G.cash<c)return false;G.cash-=c;Z.tally?.('chain',c);return true};
  if(lock&&a!=='bs'&&a!=='ps')return null;
  if(a==='bb'){const i=x|0;if(!SECTORS[i]||B[i]||!pay(BOOST.price))return null;B[i]={lvl:0,ammo:0,spent:BOOST.price};msg=`built a boost battery at the ${SECTORS[i].n.toLowerCase()} edge`}
  else if(a==='bu'){const i=x|0,b=B[i],n=b&&BOOST.lv[b.lvl+1];if(!n||!pay(n.cost))return null;b.lvl++;b.spent+=n.cost;msg=`upgraded the ${SECTORS[i].n.toLowerCase()} boost battery`}
  else if(a==='bm'){const[f,t]=String(x).split('>').map(Number);if(!B[f]||!SECTORS[t]||B[t]||!pay(BOOST.move))return null;B[t]=B[f];B[f]=null;msg=`moved the boost battery from the ${SECTORS[f].n.toLowerCase()} to the ${SECTORS[t].n.toLowerCase()} edge`}
  else if(a==='bs'){const i=x|0;if(!B[i])return null;G.cash+=Math.floor(B[i].spent*sellK());B[i]=null;msg=`sold the ${SECTORS[i].n.toLowerCase()} boost battery`}
  else if(a==='pb'){const s=SITES[x|0];if(!s||s.hp<=0||K.pd[s.n]||!pay(PDEF.price))return null;K.pd[s.n]={lvl:0,ch:0,spent:PDEF.price};msg=`built point defence at the ${s.n.toLowerCase()}`}
  else if(a==='pu'){const s=SITES[x|0],P=s&&K.pd[s.n],n=P&&PDEF.lv[P.lvl+1];if(!n||!pay(n.cost))return null;P.lvl++;P.spent+=n.cost;msg=`upgraded the ${s.n.toLowerCase()} point defence`}
  else if(a==='ps'){const s=SITES[x|0],P=s&&K.pd[s.n];if(!P)return null;G.cash+=Math.floor(P.spent*sellK());delete K.pd[s.n];msg=`sold the ${s.n.toLowerCase()} point defence`}
  else if(a==='st'){const n=cl(x|0,1,8),room=stockCap()-K.stock,m=Math.min(n,room);if(m<=0||!pay(STOCK.per*m))return null;K.stock+=m;msg=`bought ${m} space interceptor${m>1?'s':''} for the Golden Dome`}
  else if(a==='ew'){const n=EWARN.lv[K.ewr];if(!n||!pay(n.cost))return null;K.ewr++;msg=`upgraded the early-warning radar (+${n.s} s warning)`}
  else if(a==='dc'){const n=cl(x|0,1,6),m=Math.min(n,WACT.decoy.cap-K.decoys);if(m<=0||!pay(WACT.decoy.per*m))return null;K.decoys+=m;msg=`bought ${m} decoy site${m>1?'s':''}`}
  else return null;
  syncMeshes();return{c:c0-G.cash,msg}}
 // a click on the base screen: solo applies it, a co-op client asks the host (znet.js 'K')
 const req=(a,x)=>{if(Z.req)Z.req(['K',a,x]);else act(a,x)};
 Z.chain={act,req,status,stats:()=>({...G.kc.st,bat:G.kc.boost.map(b=>b?b.lvl+1:0).join(''),pds:Object.keys(G.kc.pd).length,ewr:G.kc.ewr}),get from(){return from()},stockCap,
  netOut,netIn,reset:()=>{G.kc=fresh();st0='';beams.length=0;syncMeshes()}};

 // ---------- the base screen's Kill chain tab (zbase.js calls Z.chainHTML and binds [data-kc] buttons through Z.chain.req) ----------
 const pct=p=>Math.round(p*100)+'%';
 Z.chainHTML=()=>{const K=G.kc,lock=G.wave+1<from(),cash=G.cash,btn=(a,x,txt,ok,t='')=>`<button class="sm" data-kc="${a}:${x}" ${ok?'':'disabled'}${t?` title="${t}"`:''}>${txt}</button>`;
  if(lock)return`<p class="zhint">The kill chain arrives with wave ${from()}, two waves before the ballistic missiles. Three layers against every fast missile: a boost battery at the launch edge, midcourse space interceptors for the Golden Dome, and point defence at the site it dives on. Each layer gets its own chance; buying layers is how the late game is won.</p>`;
  const fp=Z.fastPlan?.()||[],nf=fp.reduce((a,s)=>a+s.total,0),W=Z.warnS?.()|0;
  let h=`<p class="zhint">Every ballistic, hypersonic and ICBM track passes three layers, each with its own chance. ${nf?`Wave ${G.wave+1} launches: ${fp.map(s=>`<b>${s.n}</b> ${s.total?FAST.filter(k=>s[k]).map(k=>s[k]+'× '+KIND[k].tag.toLowerCase()).join(', '):'none'}`).join(' · ')}.`:`No fast missiles in wave ${G.wave+1}.`}</p>`;
  h+=`<h3>Boost phase · one battery per launch edge</h3>`;
  h+=SECTORS.map((S,i)=>{const b=K.boost[i],L=b&&BOOST.lv[b.lvl],n=b&&BOOST.lv[b.lvl+1],f=fp[i]?.total|0;
   if(!b)return`<div class="zarm"><span class="zg">⇡</span><div><b>${S.n} edge</b><small>${f?`<span class="co">${f} fast launch${f>1?'es':''} next wave</span>`:'no fast launches next wave'}</small></div><div class="zups"><span class="zst">One shot at each fast missile launched from the ${S.n.toLowerCase()} edge as it climbs out: ballistic ${pct(BOOST.lv[0].p.ballistic)}, hypersonic ${pct(BOOST.lv[0].p.hyper)}, ICBM ${pct(BOOST.lv[0].p.icbm)}; ${BOOST.lv[0].mag} shots a wave. Its sensors give full warning of those launches.</span>${btn('bb',i,'Build '+money(BOOST.price),cash>=BOOST.price)}${SECTORS.map((T,j)=>K.boost[j]&&j!==i?btn('bm',j+'>'+i,`Move ${T.n} here ${money(BOOST.move)}`,cash>=BOOST.move):'').join('')}</div></div>`;
   return`<div class="zarm"><span class="zg">⇡</span><div><b>${S.n} edge · boost battery</b><small>level ${b.lvl+1} · ${f?`<span class="co">${f} fast launch${f>1?'es':''} next wave</span>`:'no fast launches next wave'}</small></div><div class="zups"><span class="zst">${L.mag} shots a wave · ballistic ${pct(L.p.ballistic)} · hypersonic ${pct(L.p.hyper)} · ICBM ${pct(L.p.icbm)}</span>${n?`<span class="zst zn">Next: ${n.txt}</span>`:''}${n?btn('bu',i,'Level 2 '+money(n.cost),cash>=n.cost):''}${btn('bs',i,'Sell '+money(Math.floor(b.spent*sellK())),true)}</div></div>`}).join('');
  const nG=gdomes().length,cap=stockCap(),gl=gdomes().reduce((a,d)=>a+Z.def.magOf(d),0);
  h+=`<h3 style="margin-top:12px">Midcourse · Iron Dome and Golden Dome</h3><div class="zarm"><span class="zg">✦</span><div><b>Space interceptors</b><small>${nG?`${K.stock} in stock · ${gl} a wave from ${nG} Golden Dome${nG>1?'s':''}`:'needs a Golden Dome'}</small></div><div class="zups"><span class="zst">The Golden Dome reloads from this stock when its magazine for the wave is empty (unfired rounds come back). Up to ${STOCK.cap} per Golden Dome. More magazine: upgrade it in the Armory.</span>${btn('st',1,'Buy 1 '+money(STOCK.per),nG&&K.stock<cap&&cash>=STOCK.per)}${btn('st',2,'Buy 2 '+money(STOCK.per*2),nG&&K.stock+2<=cap&&cash>=STOCK.per*2)}</div></div>`;
  h+=`<h3 style="margin-top:12px">Terminal · point defence at a site</h3>`;
  h+=SITES.map((s,i)=>{const P=K.pd[s.n],L=P&&PDEF.lv[P.lvl],n=P&&PDEF.lv[P.lvl+1];
   if(!P)return`<div class="zarm"><span class="zg">⌖</span><div><b>${s.n}</b><small>${s.hp>0?'no point defence':'destroyed'}</small></div><div class="zups"><span class="zst">A laser turret: last-chance shot at fast missiles (ballistic ${pct(PDEF.lv[0].p.ballistic)}, hypersonic ${pct(PDEF.lv[0].p.hyper)}, ICBM ${pct(PDEF.lv[0].p.icbm)}) and cruise missiles or heavies diving on this site; ${PDEF.lv[0].ch} charges a wave.</span>${btn('pb',i,'Build '+money(PDEF.price),s.hp>0&&cash>=PDEF.price)}</div></div>`;
   return`<div class="zarm"><span class="zg">⌖</span><div><b>${s.n} · point defence</b><small>level ${P.lvl+1}</small></div><div class="zups"><span class="zst">${L.ch} charges a wave · ballistic ${pct(L.p.ballistic)} · hypersonic ${pct(L.p.hyper)} · ICBM ${pct(L.p.icbm)} · cruise ${pct(L.p.cruise)}</span>${n?`<span class="zst zn">Next: ${n.txt}</span>`:''}${n?btn('pu',i,'Level 2 '+money(n.cost),cash>=n.cost):''}${btn('ps',i,'Sell '+money(Math.floor(P.spent*sellK())),true)}</div></div>`}).join('');
  const ne=EWARN.lv[K.ewr];
  h+=`<h3 style="margin-top:12px">Early warning and the warning actions</h3><div class="zarm"><span class="zg">◉</span><div><b>Early-warning radar</b><small>level ${K.ewr} · fast missiles show up ${W} s before impact</small></div><div class="zups"><span class="zst">Warning time: ${EWARN.base} s, +${EWARN.perk} s per Long-range radar level, +${EWARN.lv[0].s} s per level here; a boost battery sees every launch from its edge.</span>${ne?btn('ew',0,`+${ne.s} s ${money(ne.cost)}`,cash>=ne.cost):'<span class="zst zn">Max level</span>'}</div></div>
   <div class="zarm"><span class="zg">◇</span><div><b>Decoy sites</b><small>${K.decoys} in stock</small></div><div class="zups"><span class="zst">During a launch alert, key 3 sets one off: ballistic ${pct(WACT.decoy.p.ballistic)}, hypersonic ${pct(WACT.decoy.p.hyper)}, ICBM ${pct(WACT.decoy.p.icbm)} chance the warhead goes for the dummy site. Up to ${WACT.decoy.cap}.</span>${btn('dc',1,'Buy 1 '+money(WACT.decoy.per),K.decoys<WACT.decoy.cap&&cash>=WACT.decoy.per)}${btn('dc',2,'Buy 2 '+money(WACT.decoy.per*2),K.decoys+2<=WACT.decoy.cap&&cash>=WACT.decoy.per*2)}</div></div>
   <p class="zhint">In flight, when a launch alert is up: <b>1</b> Harden its target site (${Math.round((1-WACT.harden.k)*100)}% less damage until it lands; ${money(WACT.harden.cost(G.wave+1))}, then ${WACT.harden.cd} s to the next), <b>2</b> Evacuate it (half damage for the rest of the wave, but no income from it this wave and the next), <b>3</b> Decoy. Gamepad: RB picks, R3 does it.</p>`;
  return h};
 // the overview map: boost batteries at their edge, point defence rings at the sites (zbase.js drawMap)
 Z.chainMap=(g,mx,mz,MW,MH)=>{g.save();g.font='700 10px "JetBrains Mono",monospace';g.textAlign='center';
  SECTORS.forEach((S,i)=>{const b=[-.87,0,.87][i],R=3600,x=Math.sin(b)*R,z=SITE_C.z-Math.cos(b)*R,X=cl(mx(x),40,MW-40),Y=cl(mz(z),16,MH-30),on=!!G.kc.boost[i];
   g.strokeStyle=g.fillStyle=on?'#5fe3ff':'rgba(220,230,255,.35)';g.lineWidth=on?2:1;g.beginPath();g.moveTo(X,Y-7);g.lineTo(X+7,Y);g.lineTo(X,Y+7);g.lineTo(X-7,Y);g.closePath();on?g.fill():g.stroke();g.fillText(on?`BOOST ${S.id} L${G.kc.boost[i].lvl+1}`:`${S.id} edge`,X,Y+19)});
  for(const s of SITES)if(G.kc.pd[s.n]){g.strokeStyle='#5fe3ff';g.lineWidth=1.5;g.setLineDash([2,3]);g.beginPath();g.arc(mx(s.x),mz(s.z),19,0,7);g.stroke();g.setLineDash([])}
  g.restore()};

 // ---------- co-op: the host sends G.kc and each fast track's status; a client mirrors them ----------
 // kc = {b: [[level, shots] or 0 per sector], pd: {site index: [level, charges]}, s: stock, e: early-warning level, d: decoys, h: hardened site indices,
 //  v: {site index: wave evacuated}, c: harden cooldown (s), fp: next wave's fast launches per sector, T: [[id, detected, boost status, mid misses, pd status, decoy flags]], bm: beams}
 const BS=['none','empty','wait','miss','kill'],PS=['','miss','kill'];
 function netOut(){const K=G.kc,ix=n=>SITES.findIndex(s=>s.n===n);return{b:K.boost.map(b=>b?[b.lvl,b.ammo]:0),pd:Object.fromEntries(Object.entries(K.pd).map(([n,P])=>[ix(n),[P.lvl,P.ch]])),s:K.stock,e:K.ewr,d:K.decoys,
  h:Object.keys(K.hard).map(ix),v:Object.fromEntries(Object.entries(K.evac).map(([n,w])=>[ix(n),w])),c:Math.max(0,Math.ceil(K.hcd)),fp:G.state==='base'?Z.fastPlan?.():null,
  T:TH.filter(t=>isFast(t)&&t.kc&&api.live(t)).map(t=>[t.id,t.kc.det?1:0,BS.indexOf(t.kc.b),t.kc.mm|0,PS.indexOf(t.kc.pd),(t.kc.dc?1:0)|(t.dcy?2:0)]),
  bm:beams.filter(b=>b.t>.1).map(b=>[b.si,Math.round(b.b.x),Math.round(b.b.y),Math.round(b.b.z)])}}
 const N=v=>Number.isFinite(+v)?+v:0;
 function netIn(c){if(!c||typeof c!=='object')return;const K=G.kc,site=i=>SITES[i|0]?.n;
  if(Array.isArray(c.b))K.boost=[0,1,2].map(i=>Array.isArray(c.b[i])?{lvl:cl(N(c.b[i][0]),0,BOOST.lv.length-1),ammo:N(c.b[i][1]),spent:BOOST.price}:null);
  if(c.pd&&typeof c.pd==='object'){K.pd={};for(const[i,a]of Object.entries(c.pd)){const n=site(i);if(n&&Array.isArray(a))K.pd[n]={lvl:cl(N(a[0]),0,PDEF.lv.length-1),ch:N(a[1]),spent:PDEF.price}}}
  K.stock=N(c.s);K.ewr=cl(N(c.e),0,EWARN.lv.length);K.decoys=N(c.d);K.hcd=N(c.c);
  K.hard={};if(Array.isArray(c.h))for(const i of c.h){const n=site(i);if(n)K.hard[n]={id:0,g:1}}
  K.evac={};if(c.v&&typeof c.v==='object')for(const[i,w]of Object.entries(c.v)){const n=site(i);if(n)K.evac[n]=N(w)}
  if(Array.isArray(c.fp))K.fp=c.fp;
  if(Array.isArray(c.T))for(const a of c.T){if(!Array.isArray(a))continue;const t=TH.find(u=>u.id===a[0]);if(!t)continue;const k=t.kc||(t.kc={sec:1,b:'none',det:0,mm:0,pd:'',dc:0});
   k.det=a[1]?1:0;k.b=BS[a[2]]||'none';k.mm=N(a[3]);k.pd=PS[a[4]]||'';k.dc=a[5]&1?1:0;t.dcy=a[5]&2?1:0}
  if(Array.isArray(c.bm))for(const a of c.bm){const s=SITES[a?.[0]|0];if(!s||!a.slice(1,4).every(Number.isFinite)||beams.some(b=>b.si===a[0]&&b.b.distanceToSquared(_a.set(a[1],a[2],a[3]))<4e4))continue;beam(s,new V3(a[1],a[2],a[3]))}}
 // on a co-op client the forecast comes from the host
 const fp0=Z.fastPlan;Z.fastPlan=()=>Z.mirror&&G.kc.fp?G.kc.fp:fp0();

 // ---------- hooks: start / stop, per step, per frame ----------
 const z0=Z.start;Z.start=()=>{Z.chain.reset();z0()};
 const z1=Z.stop;Z.stop=()=>{z1();G.kc=fresh();syncMeshes();beams.length=0;bGeo.setDrawRange(0,0)};
 const s0=Z.step;Z.step=dt=>{s0(dt);step(dt)};
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);visuals()};
 return Z.chain}
