// Zombies arsenal: the pilot weapon loadout (zweapons.js) and five more base defences (zarsdef.js), numbers in zarsdata.js. This file is the glue:
// per-pilot weapon state, the base screen's Pilot weapon section and the defences' extra controls (carrier parking), the HUD tag, a small
// WebAudio synth for their sounds, co-op routing and the run's arsenal stats (tools/zombies-arsenal-bench.mjs reads them).
// Hooks it uses: zbase.js Z.shopTop / Z.baseBind / Z.defExtra / Z.mapExtra / Z.mapClick, zdef.js Z.defx, znet.js 'A' requests and events (Z.arsNet),
// zombies.js Z.detonate / Z.tstep / Z.helperHit / Z.jink / Z.step / Z.visuals / Z.hud. It is initialised after znet.js, so its Z.detonate is the
// outermost: a co-op client's special weapon goes to the host as ['A','det', ...], resolved with the solo rules.
// Co-op: weapons are personal (each pilot buys from the shared purse and loads their own); the defences are the team's, run by the host.
import {AC,nbuf} from '../../engine/audio.js';
import {KIND,ORDER} from './zdata.js';
import {WPN,WORDER,WEFF,FLARE,laserWx,ARS_HELPERS,CARRIER} from './zarsdata.js';
import {initWeapons} from './zweapons.js';
import {initArsDef} from './zarsdef.js';
import {ARSBOT,registerArsBot} from './zarsbot.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initArsenal(api,G,Z){
 const {THREE,S}=api,$=id=>document.getElementById(id);
 // ---------- per-pilot weapon state: owned weapons, the loaded one, chaff bursts this wave, flares this sortie ----------
 const PS=new Map();
 const A={snd:initSnd(api),on:{},
  P:key=>{let p=PS.get(key);if(!p){p={own:new Set(['std']),cur:'std',ch:0,sch:0};PS.set(key,p)}return p},
  all:()=>PS.values(),me:()=>Z.arsNet?.me()||'me',auth:()=>!Z.mirror,ev:e=>Z.arsNet?.ev(['A',...e])};
 A.cur=()=>A.P(A.me()).cur;
 A.ban=new Set();
 const W=initWeapons(api,G,Z,A),DF=initArsDef(api,G,Z,A);
 Z.ars=A;Object.assign(A,{W,DF,WPN,WORDER,WEFF,bot:ARSBOT});

 // ---------- the run: reset, stats (for the bench), what the bench or a test took out of the game (S.zarsBan: ids, or 'all') ----------
 const ST=()=>G.ars||(G.ars={bought:{},eq:{},wk:{},dk:{},dmax:{}});
 const z0=Z.start;Z.start=()=>{PS.clear();A.parking=0;const b=S.zarsBan;A.ban=new Set(b==='all'?[...WORDER.slice(1),...ARS_HELPERS]:Array.isArray(b)?b.filter(x=>typeof x==='string'):[]);G.ars=null;z0()};
 const cb0=Z.cpBan;Z.cpBan=k=>A.ban.has(k)||!!cb0?.(k);
 // the microwave dome arrives with the FPV swarms (a wave before them, whatever the difficulty or sector)
 const if0=Z.itemFrom;Z.itemFrom=k=>k==='mwave'?Math.max(3,Z.kindFrom('swarm')-1):if0(k);
 // a wave starts (every screen: zdef deploy): chaff refilled, stats; the base screen opens: sortie flares, leftovers cleared
 const dp0=Z.def.deploy;Z.def.deploy=()=>{dp0();W&&A.onWave?.();if(!G.on)return;const s=ST();s.eq[A.cur()]=(s.eq[A.cur()]|0)+1;const n={};
  for(const d of Z.def.D){n[d.type]=(n[d.type]|0)+1;s.dk[d.id]=[d.type,d.kills|0]}for(const[k,c]of Object.entries(n))s.dmax[k]=Math.max(s.dmax[k]|0,c)};
 const bo0=Z.base.open;Z.base.open=()=>{A.onBase?.();A.parking=0;registerArsBot(window.__z);bo0()};  // the shared bot brain (zbotbrain.js), when the build has it, gets the arsenal's hook
 const k0=Z.kill;Z.kill=(t,cat)=>{const was=t.paid;k0(t,cat);if(!was&&t.paid&&t.by==='p'&&G.on){const s=ST(),w=A.cur();s.wk[w]=(s.wk[w]|0)+1}};
 A.stats=()=>{const s=ST(),dk={};for(const d of Z.def.D)s.dk[d.id]=[d.type,d.kills|0];for(const[t,k]of Object.values(s.dk))dk[t]=(dk[t]|0)+k;return{bought:s.bought,eq:s.eq,wk:s.wk,dmax:s.dmax,dkills:dk}};

 // ---------- buying and loading a weapon (base screen) ----------
 const locked=id=>G.wave+1<WPN[id].from;
 A.buyW=id=>{const w=WPN[id],P=A.P(A.me());if(!w||G.state!=='base'||A.ban.has(id))return false;if(P.own.has(id))return A.equip(id);if(locked(id)||G.cash<w.price)return false;
  if(Z.mirror){Z.req(['A','wb',id]);return true}G.cash-=w.price;P.own.add(id);ST().bought[id]=G.wave+1;if(Z.online)Z.arsNet?.team(`<b>${Z.arsNet.name(A.me())}</b> bought the ${w.n.toLowerCase()} · ${money(w.price)}`);A.equip(id);return true};
 A.equip=id=>{const P=A.P(A.me());if(!P.own.has(id)||G.state!=='base')return false;P.cur=id;P.sch=id==='flare'?FLARE.sortie:0;Z.pk.apply();if(Z.mirror)Z.req(['A','we',id]);A.snd.click();return true};
 // how well the loaded weapon suits a track (0 = can't touch it), for the bot pilots
 A.fits=(t,w=A.cur())=>!t?0:w==='net'?(W.netOK(t)?1:0):WEFF[w]?.[t.k]??0;
 // the carrier's best park spot for the next wave: on the approach that brings the most threat points, 2.3 km out from the defended area
 A.bestPark=()=>{const q=G.next?.q||[],by=new Map();for(const e of q){const k=e.k.split(':')[0],n=+e.k.split(':')[1]||1,b=Math.round((e.brg||0)*4)/4;by.set(b,(by.get(b)||0)+(KIND[k]?.pts||0)*n)}
  let b=0,bv=-1;for(const[k,v]of by)if(v>bv){bv=v;b=k}return{x:Math.sin(b)*2300,z:1950-Math.cos(b)*2300}};
 A.autoPark=id=>{const p=A.bestPark();return A.park(id,p.x,p.z)};

 // ---------- co-op: requests on the host, events on the clients ----------
 A.netReq=(k,e,nm)=>{const T=e[0];
  if(T==='det')return A.hostDet(k,String(e[1]),e[2],e[3],e[4]);
  if(T==='we'){const P=A.P(k),id=String(e[1]);if(P.own.has(id)&&G.state==='base'){P.cur=id;P.sch=id==='flare'?FLARE.sortie:0}return}
  if(G.state!=='base'){Z.arsNet.tell(k,'The shop is open between waves.');return}
  if(T==='wb'){const id=String(e[1]),w=WPN[id],P=A.P(k);if(!w||!Object.hasOwn(WPN,id)||P.own.has(id)||A.ban.has(id))return;if(locked(id)){Z.arsNet.tell(k,'Not unlocked yet.');return}
   if(G.cash<w.price){Z.arsNet.tell(k,'Not enough in the purse.');return}G.cash-=w.price;P.own.add(id);P.cur=id;P.sch=id==='flare'?FLARE.sortie:0;Z.arsNet.team(`<b>${nm}</b> bought the ${w.n.toLowerCase()} · ${money(w.price)}`);A.ev(['wo',k,id]);Z.base.refresh();return}
  if(T==='pk'){A.park(e[1]|0,+e[2],+e[3]);return}};
 A.netEv=e=>{if(!Array.isArray(e))return;const f=A.on[e[0]];if(f)try{f(e.slice(1))}catch(err){console.warn('arsenal event',err)}};
 A.on.wo=a=>{if(String(a[0])!==A.me()||!Object.hasOwn(WPN,a[1]))return;const P=A.P(A.me());P.own.add(a[1]);P.cur=a[1];P.sch=a[1]==='flare'?FLARE.sortie:0;A.snd.click();Z.base.refresh()};

 // ---------- base screen: the Pilot weapon section at the top of the Shop tab ----------
 {const st=document.createElement('style');st.textContent='#zbase .zid p b.zs,#zbase .zid p b.zw{font-size:inherit}#zbase .zs{color:#7ff0b0}#zbase .zw{color:#ff9a8a}.zwp.got{border-color:rgba(95,227,255,.6);background:rgba(95,227,255,.06)}#zbase h3 small{font-weight:500;color:var(--dim);font-size:12px;margin-left:6px}'+
  '#zhud #zwpn{font:700 13px var(--mono);color:#9fe8ff;letter-spacing:.06em}#zbase .zpk{display:flex;flex-wrap:wrap;gap:5px;width:100%}#zbase .zpk button{font-size:11.5px;padding:4px 8px}#zbase .zpk button.on{border-color:#ffc640;color:#ffe08a}';document.head.append(st)}
 const chips=id=>ORDER.concat('boss').filter(e=>Z.kindFrom(e)<=G.wave+1).map(e=>{const v=WEFF[id][e]??0;return`<span class="v${v>=.8?'g':v>0?'m':'n'}" title="${KIND[e].n}">${KIND[e].tag}</span>`}).join('');
 Z.shopTop=()=>{if(!G.on)return'';const P=A.P(A.me()),L=WORDER.filter(id=>!A.ban.has(id));if(L.length<2)return'';
  return`<h3 class="zwph">Pilot weapon <small>one loaded at a time · yours${Z.online?' (each pilot buys their own)':''} · swap freely here</small></h3><div class="zitems">${L.map(id=>{const w=WPN[id],own=P.own.has(id),eq=P.cur===id,lk=locked(id);
   const btn=lk?`Wave ${w.from}`:eq?'Loaded ✓':own?'Load':`Buy ${money(w.price)}`;
   return`<div class="zitem zwp ${eq?'got':''} ${lk?'lock':''}"><span class="zg">${w.glyph}</span><div class="zid"><b>${w.n}</b>${eq?'<em>LOADED</em>':own?'<em>OWNED</em>':''}
    <p>${lk?`Arrives with wave ${w.from}. `:''}<b class="zs">Strong:</b> ${w.str} <b class="zw">Weak:</b> ${w.wk}</p><div class="zvs">${chips(id)}</div></div>
    <button class="sm" data-ars="w:${id}" ${lk||eq||!own&&G.cash<w.price?'disabled':''}>${btn}</button></div>`}).join('')}</div>`};
 // a defence's own line in the Armory: what it is doing, and the carrier's parking
 const where=s=>{const a=Math.atan2(s.x,1950-s.z),d=Math.hypot(s.x,s.z-1950);return d<700?'by the radar pad':`${(d/1000).toFixed(1)} km ${a<-.45?'west':a>.45?'east':'north'}`};
 Z.defExtra=d=>{const l=Z.def.L(d);if(!ARS_HELPERS.includes(d.type)||!l)return'';const s=Z.def.SLOTS[d.slot];
  if(d.type==='laser'){const now=laserWx(api.WX),nx=G.next?.wx&&Z.wx?.T[G.next.wx.id],nk=nx?laserWx(nx):null;return`<span class="zst zn">Burn time ×${l.dw} · ${d.kills} burned · next wave: ${nx?`${nx.n}, ${nk<=0?'<span class="cr">no beam (storm)</span>':Math.round(nk*100)+'% power'}`:Math.round(now*100)+'% power'}</span>`}
  if(d.type==='mwave')return`<span class="zst zn">A pulse every ${l.cd} s within ${Z.def.rangeOf(d)} m · ${d.kills} fried</span>`;
  if(d.type==='barrage')return`<span class="zst zn">${l.snags} snags a wave under ${l.alt} m within ${Z.def.rangeOf(d)} m · ${d.kills} snagged</span>`;
  if(d.type==='smoke'){const w=api.WB.length();return`<span class="zst zn">${Math.round(l.p*100)}% of dives within ${Z.def.rangeOf(d)} m lose their aim · wind ${Math.round(w*3.6)} km/h${w>9?' (thins it)':''} · ${d.kills} diverted</span>`}
  if(d.type==='carrier'){const nx=G.next?.brgs||[],seen=new Set(),pre=[];for(const b of nx){const n=b<-.45?'West':b>.45?'East':'North';if(seen.has(n))continue;seen.add(n);pre.push([`${n} approach`,Math.sin(b)*2300,1950-Math.cos(b)*2300])}
   pre.push(['Radar pad',api.PADP.x+(d.slot%2?70:-70),api.PADP.z+90]);
   return`<span class="zst zn">Parked ${where(s)} · ${l.mag} Mk ${['I','II','III','IV','V'][l.tier]} drones a wave in volleys of ${CARRIER.volley} · re-park it every break (free):</span><span class="zpk"><button class="sm ${A.parking===d.id?'on':''}" data-ars="pm:${d.id}">${A.parking===d.id?'Click the map…':'Park on the map'}</button>${pre.map(([n,x,z])=>`<button class="sm" data-ars="pk:${d.id}:${Math.round(x)}:${Math.round(z)}">${n}</button>`).join('')}</span>`}
  return''};
 Z.baseBind=el=>{for(const b of el.querySelectorAll('[data-ars]'))b.onclick=()=>{const a=b.dataset.ars.split(':');
  if(a[0]==='w')A.buyW(a[1]);else if(a[0]==='pm'){A.parking=A.parking===+a[1]?0:+a[1]}else if(a[0]==='pk'){A.park(+a[1],+a[2],+a[3]);A.parking=0}Z.base.refresh()}};
 Z.mapClick=(x,z)=>{if(!A.parking||G.state!=='base')return false;const id=A.parking;A.parking=0;A.park(id,x,z);Z.base.refresh();return true};
 Z.mapExtra=(g,mx,mz)=>{for(const d of Z.def.D){if(d.type!=='carrier')continue;const s=Z.def.SLOTS[d.slot],X=mx(s.x),Y=mz(s.z),r=(mx(s.x+Z.def.rangeOf(d))-X);
   g.strokeStyle=A.parking===d.id?'rgba(255,198,64,.8)':'rgba(95,227,255,.28)';g.lineWidth=1.2;g.setLineDash([5,5]);g.beginPath();g.arc(X,Y,r,0,7);g.stroke();g.setLineDash([]);g.fillStyle='#9fe8ff';g.fillText('CARRIER',X,Y-12)}
  if(A.parking){g.fillStyle='rgba(255,198,64,.95)';g.fillText('Click where the carrier should park',mx(0),mz(-1700))}};

 // ---------- HUD: the loaded weapon (and the pod's chaff) next to the wave counter ----------
 const tag=document.createElement('span');tag.id='zwpn';document.querySelector('#zhud .zt')?.append(tag);let last='';
 const h0=Z.hud;Z.hud=dt=>{h0(dt);const w=A.cur(),P=A.P(A.me()),t=!G.on||w==='std'?'':WPN[w].hud+(w==='flare'?` · CHAFF ${P.ch}`:'');if(t!==last){last=t;tag.textContent=t;tag.hidden=!t}};
 return A}

// ---------- the arsenal's sounds: a small WebAudio synth (no samples), placed in the world like zaudio.js's (distance, delay, air, pan) ----------
function initSnd(api){const V3=api.THREE.Vector3,_r=new V3(),_x=new V3();let out=null,nv=0;
 const vol=()=>cl(api.S.zsfxv??1,0,1),now=()=>AC.currentTime;
 const bus=()=>{if(!AC||!nbuf)return null;if(!out){const c=AC.createDynamicsCompressor();c.threshold.value=-14;c.ratio.value=4;out=AC.createGain();out.gain.value=.85;out.connect(c).connect(AC.destination)}return out};
 const filt=(type,f,q=.7)=>{const b=AC.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b};
 const env=(t0,pk,a,dur)=>{const g=AC.createGain();g.gain.value=.0001;g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(Math.max(pk,.0002),t0+a);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);return g};  /* starts at the floor: a gain is 1 until its first event (zaudio.js env) */
 const nsrc=(t0,dur)=>{const s=AC.createBufferSource();s.buffer=nbuf;s.start(t0,Math.random()*1.4,dur+.05);nv++;s.onended=()=>nv--;return s};
 const osc=(type,t0,dur,f)=>{const o=AC.createOscillator();o.type=type;if(f)o.frequency.value=f;o.start(t0);o.stop(t0+dur+.05);nv++;o.onended=()=>nv--;return o};
 function at(p,ref,max){const b=bus();if(!b||nv>48)return null;const cam=api.camera,d=p?p.distanceTo(cam.position):0,g=max*vol()/(1+(d/ref)**1.5);if(g<.004)return null;
  const t0=now()+.01+(d>100?Math.min(3,d/343):0),lp=filt('lowpass',cl(17000*Math.exp(-d/1400),280,17000),.5);let n=lp;
  if(AC.createStereoPanner&&p){const pn=AC.createStereoPanner();_r.subVectors(p,cam.position).normalize();pn.pan.value=cl(_r.dot(_x.set(1,0,0).applyQuaternion(cam.quaternion)),-.8,.8);lp.connect(pn);n=pn}n.connect(b);return{n:lp,t0,g}}
 const thump=(v,f0,f1,len)=>{const o=osc('sine',v.t0,len);o.frequency.setValueAtTime(f0,v.t0);o.frequency.exponentialRampToValueAtTime(f1,v.t0+len*.8);o.connect(env(v.t0,v.g,.004,len)).connect(v.n)};
 const hiss=(v,type,f,q,pk,a,len,t=0)=>{const s=nsrc(v.t0+t,len),b=filt(type,f,q);s.connect(b).connect(env(v.t0+t,pk,a,len)).connect(v.n);return b};
 return{
  // EMP: a falling electric zap over a low thump, then crackle
  emp(p){const v=at(p,260,1);if(!v)return;const o=osc('sawtooth',v.t0,.7),b=filt('bandpass',1200,2);o.frequency.setValueAtTime(2400,v.t0);o.frequency.exponentialRampToValueAtTime(70,v.t0+.6);o.connect(b).connect(env(v.t0,v.g*.5,.003,.7)).connect(v.n);
   thump(v,90,30,.6);for(let i=0;i<7;i++)hiss(v,'highpass',5000,.7,v.g*.25,.001,.04,.15+i*rnd(.05,.11))},
  // net: a compressed-air launch, and the capture: rope zipping tight, a soft thud
  netShot(p){const v=at(p,120,.7);if(!v)return;hiss(v,'lowpass',700,.8,v.g*.7,.004,.18);thump(v,180,80,.18)},
  net(p){const v=at(p,160,.8);if(!v)return;const b=hiss(v,'bandpass',3200,3,v.g*.45,.01,.35);b.frequency.setValueAtTime(3600,v.t0);b.frequency.exponentialRampToValueAtTime(600,v.t0+.3);thump(v,120,55,.3)},
  // flechette: a sharp crack and the rattle of darts
  flech(p){const v=at(p,200,.5);if(!v)return;  /* the detonations up close peak around -11 dBFS, under the explosions they cause (tools/audio-levels.mjs); they were over */hiss(v,'highpass',2500,.6,v.g*.9,.001,.06);for(let i=0;i<8;i++)hiss(v,'bandpass',3500+i*300,4,v.g*.22,.001,.03,.03+i*.018);thump(v,140,60,.2)},
  // kinetic dart: a metallic clang (inharmonic partials) on a hard impact
  dart(p){const v=at(p,180,.5);if(!v)return;hiss(v,'highpass',1800,.5,v.g*.8,.001,.05);for(const[f,k]of[[523,.5],[1307,.32],[2210,.22],[3400,.15]]){const o=osc('sine',v.t0,.9,f);o.connect(env(v.t0,v.g*k,.002,.9)).connect(v.n)}},
  // cluster: the main pop, then a ripple of small ones
  cluster(p,n){const v=at(p,220,.65);if(!v)return;thump(v,150,50,.3);hiss(v,'lowpass',1600,.6,v.g*.6,.003,.25);for(let i=0;i<n;i++)hiss(v,'bandpass',1200+i*150,1.4,v.g*.3,.002,.08,.35+i*rnd(.06,.14))},
  // flares and chaff: two pops and a burning hiss
  flares(p){const v=at(p,150,.7);if(!v)return;for(const t of[0,.09]){hiss(v,'lowpass',900,.7,v.g*.6,.002,.09,t)}hiss(v,'highpass',3000,.5,v.g*.25,.05,1.2,.1)},
  click(){const v=at(null,1,.25);if(!v)return;const o=osc('square',v.t0,.05,1400);o.connect(env(v.t0,v.g*.4,.001,.05)).connect(v.n)},
  // microwave pulse: a deep swelling whumm and a sizzle
  pulse(p){const v=at(p,400,.6);if(!v)return;const o=osc('sine',v.t0,1,55);o.frequency.setValueAtTime(40,v.t0);o.frequency.linearRampToValueAtTime(70,v.t0+.4);o.connect(env(v.t0,v.g*.9,.25,1)).connect(v.n);
   hiss(v,'bandpass',220,1.2,v.g*.5,.15,.8);hiss(v,'highpass',6000,.5,v.g*.3,.05,.45,.2)},
  // a cable snagging a drone: a plucked steel string and a metallic ping
  twang(p){const v=at(p,200,.9);if(!v)return;const o=osc('sawtooth',v.t0,.9,220),b=filt('lowpass',1800,3);o.frequency.setValueAtTime(260,v.t0);o.frequency.exponentialRampToValueAtTime(150,v.t0+.8);o.connect(b).connect(env(v.t0,v.g*.5,.002,.85)).connect(v.n);
   const q=osc('sine',v.t0,.5,1870);q.connect(env(v.t0,v.g*.2,.001,.5)).connect(v.n)},
  // carrier volley: a quick ripple of rack launches
  volley(p,n){const v=at(p,220,.6);if(!v)return;for(let i=0;i<n;i++){hiss(v,'bandpass',1800,1,v.g*.5,.004,.22,i*.12);const o=osc('sawtooth',v.t0+i*.12,.6),f=filt('lowpass',1400);o.frequency.setValueAtTime(140,v.t0+i*.12);o.frequency.exponentialRampToValueAtTime(300,v.t0+i*.12+.5);o.connect(f).connect(env(v.t0+i*.12,v.g*.12,.04,.6)).connect(v.n)}},
  // smoke generators starting up: a long low hiss
  hiss(p){const v=at(p,150,.5);if(!v)return;hiss(v,'bandpass',1400,.5,v.g*.35,.4,2.6)},
  // the laser's hum while it holds a beam: pitch and brightness climb as the burn builds
  hum(){const b=bus();if(!b)return null;const o=AC.createOscillator(),o2=AC.createOscillator(),f=filt('bandpass',900,3),g=AC.createGain();o.type='sawtooth';o2.type='square';o.frequency.value=110;o2.frequency.value=221;g.gain.value=0;
   o.connect(f);o2.connect(f);f.connect(g).connect(b);o.start();o2.start();
   return{set(dist,prog){const t=now(),fr=110+cl(prog,0,1)*240;g.gain.setTargetAtTime(vol()*.045/(1+(dist/450)**1.5),t,.08);o.frequency.setTargetAtTime(fr,t,.05);o2.frequency.setTargetAtTime(fr*2.01,t,.05);f.frequency.setTargetAtTime(700+cl(prog,0,1)*2400,t,.05)},
    stop(){const t=now();g.gain.setTargetAtTime(0,t,.05);o.stop(t+.3);o2.stop(t+.3)}}}}}
