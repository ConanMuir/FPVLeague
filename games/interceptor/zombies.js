// Interceptor: Zombies mode. Endless, growing waves from the map edges against the defended sites; money per intercept, a base screen between
// waves, helpers and perks. interceptor.js stays Riley's Classic game: it calls the hooks below only while Z.on is true.
// api = live access to interceptor.js internals (see the initZombies call there).
import {KIND,ITEMS,ORDER,SITE_HP,BUNKER_WAVE,budget,isBoss,weight,speedK,HELPER_SHARE,ZDIFF,earlyK,clearBonus,perfectBonus,streakMult,CLUTCH_R,CLUTCH_K,MULTI_BONUS,REPAIR_PER_HP} from './zdata.js';
import {initBase} from './zbase.js';
import {initDefences} from './zdef.js';
import {initEnemies} from './zenemy.js';
import {initPerks} from './zperk.js';
import {initWeather} from './zwx.js';
import {initRocket} from './zrocket.js';

const $=id=>document.getElementById(id),cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.random()*a.length|0];
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initZombies(api){
 const {THREE,TH,SITES,S,save,feed,banner,tone,gh}=api,V3=THREE.Vector3;
 const _a=new V3(),_b=new V3();
 const G={on:false,state:'off',wave:0,cash:0,earned:0,kills:{p:0,h:0},streak:0,best:0,wq:[],wt:0,perfect:true,pops:[],clearT:0,wasAlive:false,detFlag:false,next:null,cards:[],placing:null,gid:0};
 const Z={get on(){return G.on},G};
 const SITE_C={x:0,z:1950};  // centre of the defended area

 // ---------- mode choice and Zombies difficulty on the start menu; best wave is kept per difficulty ----------
 const DF=()=>ZDIFF[cl(S.zdiff??1,0,ZDIFF.length-1)];
 const bestOf=d=>((S.zbests||{})[d.n]||(d.n==='Normal'&&S.zbest)||{}).wave|0;  // S.zbest = best from before difficulties existed (Normal)
 {const box=$('gmode'),desc=$('gmdesc'),dbox=document.createElement('div');dbox.className='gmode zdiff';dbox.id='zdiff';dbox.setAttribute('role','group');dbox.setAttribute('aria-label','Zombies difficulty');
  dbox.innerHTML=ZDIFF.map((d,i)=>`<button data-d="${i}">${d.n}</button>`).join('');box.after(dbox);
  const sync=()=>{for(const b of box.querySelectorAll('button'))b.classList.toggle('on',b.dataset.m===S.gmode);const D=DF();G.best=bestOf(D);
   for(const b of dbox.querySelectorAll('button'))b.classList.toggle('on',+b.dataset.d===ZDIFF.indexOf(D));dbox.hidden=S.gmode!=='z';
   desc.innerHTML=S.gmode==='z'?`<b>Zombies</b>: endless, growing waves from every edge. Earn money for each intercept, then spend it between waves on helper drones, guns, missiles, domes and perks. New enemy types every 5 waves, a boss every 10.<br><b>${D.n}</b>: ${D.txt} ${G.best?`Best on ${D.n}: wave ${G.best}.`:''}`:'<b>Classic</b>: Riley\'s Interceptor. One Shahed-136, then one jet Geran-3, each wave.';
   $('play').textContent=S.gmode==='z'?'Hold the line':'Defend'};
  for(const b of box.querySelectorAll('button'))b.onclick=()=>{S.gmode=b.dataset.m;save();sync()};
  for(const b of dbox.querySelectorAll('button'))b.onclick=()=>{S.zdiff=+b.dataset.d;save();sync()};
  const qm=new URLSearchParams(location.search).get('mode');if(qm==='zombies'||qm==='z')S.gmode='z';else if(qm==='classic')S.gmode='classic';  /* Drone League's menu links here with ?mode= */
  if(S.gmode!=='z')S.gmode='classic';save();sync();Z.syncMode=sync}

 // ---------- HUD ----------
 const hudEl=document.createElement('div');hudEl.id='zhud';hudEl.className='osd';hudEl.hidden=true;
 hudEl.innerHTML='<div class="zt"><span id="zw">WAVE 1</span><span id="zc">$0</span><span class="zi"><i id="zib"></i><em id="zit">100%</em></span><span id="zs"></span><span id="zinb"></span></div><div id="zsites"></div><div id="zwarn"></div>';
 $('hud').append(hudEl);
 let lastSites='';
 Z.hud=()=>{pk.hud();const integ=integrity();$('zw').textContent=G.state==='base'?`WAVE ${G.wave+1} NEXT`:`WAVE ${G.wave}`;$('zc').textContent=money(G.cash);
  const f=integ.max?integ.hp/integ.max:0;$('zib').style.width=(f*100).toFixed(1)+'%';$('zib').className=f<.3?'lo':f<.6?'mid':'';$('zit').textContent=`INTEGRITY ${Math.round(f*100)}%`;
  $('zs').textContent=G.streak>1?`STREAK ×${G.streak}`:'';$('zs').hidden=G.streak<2;
  const sh=SITES.map(s=>`<span class="${s.hp>0?(s.hp<s.max*.35?'lo':''):'dead'}">${s.n} ${Math.max(0,Math.ceil(s.hp))}/${s.max}</span>`).join('');if(sh!==lastSites)$('zsites').innerHTML=lastSites=sh;
  const hw=hardT().sort((a,b)=>ttImpact(a)-ttImpact(b)).slice(0,3).map(t=>`${KIND[t.k].tag} → ${t.tgt.n} ${Math.ceil(ttImpact(t))} s`).join(' · ');if(hw!==G.hw)$('zwarn').textContent=G.hw=hw;
  const live=TH.filter(api.live).length,queued=G.wq.length;$('zinb').textContent=G.state==='wave'?`INBOUND ${live+queued}`:''};
 const integrity=()=>{let hp=0,max=0;for(const s of SITES){hp+=Math.max(0,s.hp);max+=s.max}return{hp,max}};

 // ---------- start / stop ----------
 const def=Z.def=initDefences(api,G,Z);
 const en=Z.en=initEnemies(api,G,Z);Z.flash=(p,k)=>en.flash(p,k);
 const pk=Z.pk=initPerks(api,G,Z);
 const rk=Z.rk=initRocket(api,G,Z);
 const base=Z.base=initBase(Z,api,G);
 const wx=Z.wx=initWeather(api,G,Z);  // per-wave weather forecast and effects (zwx.js)
 const openBase=()=>{rk.stop();G.next=plan(G.wave+1);base.open()};
 // Zombies widens the AO, adds the far-field terrain and long radar ranges (25 / 100 / 250 km) for the fast threats
 Z.start=()=>{G.on=true;G.state='base';G.wave=0;G.cash=DF().start;G.earned=0;G.kills={p:0,h:0};G.streak=0;G.wq.length=0;G.pops.length=0;G.perfect=true;
  bunker(false);for(const s of SITES){s.max=s.hp=Math.round((SITE_HP[s.n]||400)*DF().hp)}def.clear();pk.reset();en.farRing().visible=true;if(api.RRS.length===3)api.RRS.push(25000,100000,250000);
  api.AW=4300;api.wave=0;api.wstate='wave';$('hud').classList.add('z');hudEl.hidden=false;$('zover').hidden=true;
  openBase();wx.start(G.next.wx)};
 Z.stop=()=>{if(!G.on&&G.state==='off')return;G.on=false;G.state='off';rk.stop();Z.shadowsBack();bunker(false);for(const s of SITES){s.max=s.hp=3}api.AW=3000;api.applyTune();def.clear();en.hide();en.farRing().visible=false;
  api.RRS.length=3;S.rr=Math.min(S.rr|0,2);$('hud').classList.remove('z');hudEl.hidden=true;base.close();$('zover').hidden=true;G.wq.length=0;wx.stop()};
 Z.hold=()=>G.on&&!api.demo&&(G.state==='base'||G.state==='over');

 // ---------- wave director ----------
 // a wave = a threat-point budget spent on unlocked kinds, split into raids from different edges; each raid spawns over a few seconds
 function compose(w){const out=[];let b=budget(w,DF().wave);if(w===1)return['shahed','jet'];
  if(isBoss(w)){out.push('boss');b=Math.round(b*.6)}
  for(const k of ORDER)if(KIND[k].from===w&&k!=='swarm'){out.push(k);b-=KIND[k].pts}  // a new kind always shows up in its first wave
  const ks=ORDER.filter(k=>weight(k,w)>0);
  while(b>0){let tot=0;for(const k of ks)tot+=weight(k,w);let r=Math.random()*tot,k=ks[0];for(const q of ks){r-=weight(q,w);if(r<=0){k=q;break}}
   if(k==='swarm'){const n=6+(Math.random()*Math.min(10,2+w/3)|0);out.push('swarm:'+n);b-=n*KIND.swarm.pts}else{out.push(k);b-=KIND[k].pts}}
  return out}
 // the next wave is planned when the base screen opens, so it can show what is coming and from where
 function plan(w){const list=compose(w),raids=w===1?1:1+Math.min(4,w/4|0),win=w===1?30:Math.min(100,25+3*w);
  const brgs=[];for(let i=0;i<raids;i++)brgs.push(w===1?(Math.random()-.5)*.6:(Math.random()-.5)*2.6);  // edge bearing per raid: 0 = north, ±1.3 rad = west/east
  const q=list.map((k,i)=>{const ri=w===1?0:i%raids;return{k,at:w===1?(i?25:0):(k==='boss'?5:ri*win/raids+rnd(0,10)),brg:brgs[ri]+rnd(-.12,.12)}}).sort((a,b)=>a.at-b.at);
  return{list,brgs,q,wx:wx.plan(w)}}
 // command bunker: a fourth defended site on the radar pad from wave 10 (its hit points add to Defense Integrity)
 const BK={n:'COMMAND BUNKER',x:api.PADP.x,z:api.PADP.z+20,r:20,aims:[],sol:[],max:SITE_HP['COMMAND BUNKER'],hp:0,zb:1};
 {const y=api.PADP.y+.3,M=new THREE.MeshStandardMaterial({color:0x8d8f88,roughness:.9}),E=new THREE.MeshStandardMaterial({color:0x5b5a3e,roughness:1}),g=new THREE.Group();
  const box=(w,h,d,m,x,y0,z)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y0+h/2,z);o.castShadow=o.receiveShadow=true;g.add(o)};
  box(22,1.2,14,E,0,0,0);box(14,3.6,9,M,0,1,0);box(4,2.6,2,M,0,1,-5.2);box(.3,6,.3,M,5,4.6,2);g.position.set(BK.x,y,BK.z);g.visible=false;api.scene.add(g);BK.mesh=g;BK.y=y;BK.aims.push(new V3(BK.x,y+4.6,BK.z),new V3(BK.x+4,y+4.6,BK.z+2));
  BK.box={x:BK.x,y:y+2.4,z:BK.z,hx:7,hy:2.4,hz:4.5}}
 function bunker(on){const i=SITES.indexOf(BK);if(on&&i<0){SITES.push(BK);BK.max=Math.round(SITE_HP['COMMAND BUNKER']*DF().hp);BK.hp=BK.max;BK.mesh.visible=true;api.PADP.sol.push(BK.box);feed('<span class="cg">Command bunker online</span>: a fourth site to defend (+'+BK.max+' integrity)')}
  if(!on&&i>=0){SITES.splice(i,1);BK.mesh.visible=false;const j=api.PADP.sol.indexOf(BK.box);if(j>=0)api.PADP.sol.splice(j,1)}}
 Z.bunker=bunker;
 function startWave(){G.wave++;api.wave=G.wave;G.state='wave';G.perfect=true;G.wt=0;if(G.wave>=BUNKER_WAVE)bunker(true);const P=G.next||plan(G.wave);G.next=null;G.wq=P.q;wx.start(P.wx);
  banner('WAVE '+G.wave,'cr',2.4);const n={};for(const q of P.list){const k=q.split(':')[0];n[k]=(n[k]||0)+(+q.split(':')[1]||1)}
  feed('Inbound: '+Object.entries(n).map(([k,c])=>`${c}× ${KIND[k].n}`).join(', '));def.deploy();pk.refill();
  if(api.player&&api.player.dead<=0)api.launch()}
 Z.continue=()=>{base.close();startWave()};
 Z.kindNote=k=>({decoy:'cheap and harmless, but looks like a Shahed on radar and soaks up helpers. Cold on thermal.',swarm:'many tiny quads, low and erratic. One burst can take several.',
  heavy:'armored: a proximity burst only damages it. Needs a direct hit, or a marked target for helpers.',cruise:'low, fast and terrain-following. Detected far out.',
  ballistic:'very fast and steep. Only a dome-class defence or a direct hit stops it.',hyper:'extremely fast. Only Golden Dome stops it.',icbm:'the fastest thing in the sky. Golden Dome only.',boss:'a carrier that launches swarms until destroyed. Breaks apart in stages.'})[k]||'';
 Z.waves=dt=>{if(api.demo)return;if(G.state==='wave'){G.wt+=dt;
   while(G.wq.length&&G.wq[0].at<=G.wt){const q=G.wq.shift();spawn(q)}
   if(!G.wq.length&&!TH.some(api.live)){G.state='clear';G.clearT=3;const got=earn(clearBonus(G.wave)+(G.perfect?perfectBonus(G.wave):0),null,null);
    banner(`WAVE ${G.wave} CLEAR`,'cg',2.6);feed(`Wave ${G.wave} clear: <span class="cg">+${money(got)}</span>${G.perfect?' (perfect defence bonus included)':''}`)}}
  else if(G.state==='clear'&&(G.clearT-=dt)<=0)openBase()};

 // spawn points sit on a ring around the defended area at the given bearing; fast kinds come from much farther out (the map extends past the AO)
 function spawn(q){const[k,n]=q.k.split(':'),K=KIND[k],R=K.far||5200,x=SITE_C.x+Math.sin(q.brg)*R,z=SITE_C.z-Math.cos(q.brg)*R;
  if(k==='swarm'){const s=pick(api.liveSites()),g=++G.gid;for(let i=0;i<+n;i++){const u=make(k,x+rnd(-60,60),z+rnd(-60,60),s);if(u)u.grp=g}return}
  make(k,x,z)}
 function make(k,x,z,site){const K=KIND[k],L=api.liveSites();if(!L.length)return null;const s=site||pick(L),aim=pick(s.aims),alt=K.alt?rnd(K.alt[0],K.alt[1]):800;
  const p=new V3(x,gh(x,z)+alt,z),dx=aim.x-x,dz=aim.z-z,d=Math.hypot(dx,dz),px=-dz/d,pz=dx/d;
  const wps=[new V3(x+dx*.35+px*rnd(-900,900),0,z+dz*.35+pz*rnd(-900,900)),new V3(x+dx*.72+px*rnd(-500,500),0,z+dz*.72+pz*rnd(-500,500))];
  const spd=K.spd*(K.spd<150?speedK(G.wave):1)*rnd(.94,1.06);
  const t={id:api.nextId(),k,p,v:new V3(wps[0].x-x,0,wps[0].z-z).setLength(spd),spd,cs:spd,alt,wps,tgt:s,aim,st:'cruise',jet:!!K.jet,mesh:null,prop:null,pd:1e9,dmin:1e9,cvm:0,bank:0,roll:0,spin:0,smoke:0,rb:null,claim:null,by:null};
  en.dress(t);TH.push(t);return t}
 Z.make=make;
 // movers for the kinds Riley's flight code doesn't cover (zenemy.js); true = handled there
 Z.tstep=(t,dt)=>en.tstep(t,dt);

 // ---------- impacts, kills, money ----------
 Z.impact=t=>{t.st='dead';t.impacted=1;if(G.state==='trial')return;const K=KIND[t.k]||KIND.shahed;api.boom(t.aim,K.dmg>100?6:K.dmg>20?4:K.dmg?1.5:.8);if(api.demo||G.state==='over')return;const s=t.tgt;
  if(!K.dmg){feed(`<span class="co">${K.n} hit the ${s.n.toLowerCase()}: a decoy, no damage</span>`);return}
  if(s.hp>0){const was=s.hp;s.hp=Math.max(0,s.hp-K.dmg);G.perfect=false;
   feed(`<span class="cr">${K.n} hit the ${s.n.toLowerCase()}</span> −${K.dmg}${s.hp?'':' · <span class="cr">site destroyed</span>'}`);tone(220,110,.6,.12,'sawtooth');
   if(was>0&&!s.hp)banner(s.n+' DESTROYED','cr',2)}
  pop(t.aim,'−'+K.dmg,'#ff4d4d');
  if(integrity().hp<=0)gameOver()};
 // every kill comes through here (Riley's killThreat calls it): pays out to the player (t.by==='p') or the helpers
 Z.kill=t=>{if(api.demo||t.paid)return;t.paid=1;const K=KIND[t.k]||KIND.shahed,ply=t.by!=='h';
  if(ply)G.kills.p++;else G.kills.h++;
  let c=K.cash*(ply?streakMult(G.streak+1):HELPER_SHARE),why='';
  const da=Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z);if(da<CLUTCH_R&&K.dmg){c+=K.cash*CLUTCH_K;why=' CLUTCH'}
  if(ply&&G.burst){G.burst.n++;if(G.burst.n>1){c+=MULTI_BONUS;why=why||' MULTI'}}
  earn(c,t.p,why)};
 // every payout is scaled by the difficulty and the early-wave boost (x2.2 on wave 1, x1 from wave 10)
 function earn(c,p,why){c=Math.round(c*DF().cash*earlyK(Math.max(1,G.wave)));G.cash+=c;G.earned+=c;if(p)pop(p,`+${money(c)}${why||''}`,why?'#ffe23c':'#3ddc84');return c}
 Z.earn=earn;
 const pop=Z.pop=(p,txt,col)=>{if(G.pops.length>40)G.pops.shift();G.pops.push({p:p.clone(),txt,col,t:0})};

 // player warhead in Zombies: Riley's kill model (pkill from miss distance + fuse delay), plus the one-hit/armor rules
 Z.detonate=()=>{const d=api.player,out=[];G.burst={n:0};
  for(const t of TH)if(api.live(t)){const r=t.p.distanceTo(d.p);if(r>30)continue;const cv=Math.max(0,-_b.subVectors(t.v,d.v).dot(_a.subVectors(t.p,d.p))/(r||1));
   const o=outcome(t,r,cv);t.by='p';
   if(t.k==='boss'){if(o!=='miss'){Z.bossHit(t);out.push(`<span class="cg">${Z.tname(t)} hit</span> (${r.toFixed(1)} m)`)}else out.push(`<span class="co">Missed ${Z.tname(t)}</span>`);continue}
   if(o==='kill'){const cat=r<2.4&&Math.random()<.55;api.killThreat(t,cat);out.push(`<span class="cg">${Z.tname(t)} ${r<KIND[t.k].hitR?'direct hit':'down'}</span> (${r.toFixed(1)} m)`)}
   else if(o==='damage'){api.damage(t);out.push(`<span class="co">${Z.tname(t)} damaged${KIND[t.k].armor===1?' (armored: needs a direct hit)':''}</span>`)}
   else out.push(`<span class="co">Missed ${Z.tname(t)} (${r.toFixed(1)} m)</span>`)}
  const kills=G.burst.n;G.burst=null;G.streak=kills?G.streak+1:0;G.detFlag=true;
  // big readout of how good the timing was: the closest track's miss distance at the moment of the burst, plus a result sound
  let nr=1e9;for(const t of TH)nr=Math.min(nr,t.p.distanceTo(d.p));  // includes the tracks this burst just killed (they leave TH later)
  const dmg=out.some(s=>s.includes('damaged')),txt=kills?`HIT — ${nr.toFixed(1)} m`:dmg?`DAMAGED — ${nr.toFixed(1)} m`:nr<300?`MISSED BY ${Math.round(nr)} m`:'NOTHING IN RANGE';
  banner(txt,kills?'cg':dmg?'co':'cr',1.4);G.det={txt,t:performance.now()};
  if(kills)tone(520,1040,.22,.14,'triangle');else if(dmg)tone(440,520,.2,.1,'triangle');else tone(300,140,.35,.12,'sawtooth');
  api.lose('det');feed(out.join('<br>')||'Detonated: nothing in range')};
 // manual timing is the default in Zombies; the Proximity fuse perk brings back Classic's automatic fuse (contact always fires)
 Z.autoFuse=()=>Z.perkLevel?.('fuse')>0;
 Z.evadeMode=()=>G.state==='trial'?'none':DF().evade;Z.diff=DF;
 // one-hit rules: a direct hit always kills; proximity uses pkill; armor 1 turns a proximity kill into damage; 'hard' needs a direct hit
 function outcome(t,r,cv){const K=KIND[t.k]||KIND.shahed;if(r<K.hitR)return'kill';if(K.armor==='hard')return'miss';
  const p=api.pkill(r,cv);if(Math.random()<p)return K.armor===1||K.armor==='boss'?'damage':'kill';
  const re=r+cv*api.FDLY;if(!t.dmg&&Math.random()<Math.exp(-(((re-1.2)/(5*api.LETH/4))**2)))return'damage';return'miss'}
 Z.outcome=outcome;
 // helper hits: p = the helper's kill chance for this target. Marked targets take double damage from helpers: two rolls (1-(1-p)^2),
 // near-miss damage becomes a kill, and armor is ignored. Unmarked armor turns non-direct hits into damage.
 Z.helperHit=(t,p,direct=.3,dome=false)=>{const K=KIND[t.k]||KIND.shahed,mk=!!t.mark;if(K.armor==='hard'&&!dome)return'miss';if(mk)p=1-(1-p)**2;const r=Math.random();
  if(r<p){if(!mk&&(K.armor===1||K.armor==='boss')&&r>=p*direct)return'damage';return'kill'}
  if(r<p+(1-p)*.3)return mk?'kill':t.dmg?'miss':'damage';return'miss'};
 Z.helperKill=t=>{if(!api.live(t))return;t.by='h';if(KIND[t.k]?.armor==='boss'&&Z.bossHit)return Z.bossHit(t);api.killThreat(t,Math.random()<.4)};

 // ---------- game over ----------
 function gameOver(){G.state='over';api.wstate='over';const D=DF(),nb=G.wave>bestOf(D);
  if(nb){S.zbests={...(S.zbests||{}),[D.n]:{wave:G.wave,kills:G.kills.p+G.kills.h,earned:G.earned}};save();G.best=G.wave}
  banner('');
  $('zover').innerHTML=`<div class="zpanel zgo"><h2>Defense collapsed</h2><div class="zbig">WAVE ${G.wave}</div>
   <div class="zstats"><span>Intercepts</span><b>${G.kills.p+G.kills.h}</b><span>by you</span><b>${G.kills.p}</b><span>by helpers</span><b>${G.kills.h}</b><span>Money earned</span><b>${money(G.earned)}</b><span>Best on ${D.n}</span><b>${nb?'NEW BEST · ':''}wave ${G.best}</b></div>
   <div class="btns"><button class="go" id="zagain">Try again</button><button id="zmenu">Menu</button></div></div>`;
  $('zover').hidden=false;$('zagain').onclick=()=>{$('zover').hidden=true;banner('');api.startMatch()};$('zmenu').onclick=()=>{$('zover').hidden=true;api.startDemo()};
  Z.syncMode?.();setTimeout(()=>$('zagain')?.focus(),50)}
 Z.gameOver=gameOver;

 // ---------- per-step ----------
 Z.step=dt=>{const me=api.player;if(!me)return;const alive=me.dead<=0;
  if(G.wasAlive&&!alive&&!G.detFlag&&G.streak)G.streak=0;  // crashed or flat battery: streak over
  pk.step(dt);rk.step(dt);if(alive){G.detFlag=false;if(G.pp)directHits(me);(G.pp||(G.pp=new V3())).copy(me.p)}else G.pp=null;G.wasAlive=alive;def.step(dt);
  for(const t of TH)if(t.k==='decoy'&&!t.ident&&api.live(t)&&(alive&&me.p.distanceTo(t.p)<900||Z.ident?.(t)))t.ident=1};
 // fast tracks (or your interceptor under Rocket Assist) move metres per step, faster than the fuse's sampling: check the closest approach over the step itself. Only a direct hit counts.
 function directHits(me){const fast=me.v.lengthSq()>150*150;for(const t of TH){if(!api.live(t)||!t.pp||t.spd<150&&!fast)continue;const K=KIND[t.k];
   const r0=_a.subVectors(t.pp,G.pp),dr=_b.subVectors(t.p,me.p).sub(r0),L=dr.lengthSq(),s=L>1e-9?cl(-r0.dot(dr)/L,0,1):0,d=r0.addScaledVector(dr,s).length();
   if(d<K.hitR+.4){t.by='p';G.burst={n:0};api.killThreat(t,true);G.burst=null;G.streak++;G.detFlag=true;feed(`<span class="cg">DIRECT HIT: ${Z.tname(t)} destroyed</span>`);banner('DIRECT HIT','cg',1.6);api.lose('det');return}}}

 // ---------- track display: claimed = yellow, free = red; the selected track gets a white ring ----------
 // radar picture: each kind has a detection range from the radar site (the radar perk stretches it); the fast threats come from early warning.
 // An FPV swarm shows as one labelled track (its lead) plus small dots.
 const lead=new Map();
 Z.seen=t=>{const K=KIND[t.k]||KIND.shahed;if(t.k==='swarm'&&lead.get(t.grp)!==t)return false;return Math.hypot(t.p.x-api.PADP.x,t.p.z-api.PADP.z)<K.det*(Z.radarK?.()??1)};
 const inRange=t=>{const K=KIND[t.k]||KIND.shahed;return Math.hypot(t.p.x-api.PADP.x,t.p.z-api.PADP.z)<K.det*(Z.radarK?.()??1)};
 // in the FPV overlay: swarm members and far tracks (over 4 km, unless selected) are dots, not labelled brackets
 Z.quiet=t=>t.k==='swarm'&&lead.get(t.grp)!==t||t!==G.selNow&&t.p.distanceToSquared(api.camera.position)>16e6;
 Z.rcol=t=>t.claim?'255,226,60':'255,77,77';
 Z.ocol=t=>t.claim?'#ffe23c':'#ff4d4d';
 const shown=t=>t.k==='decoy'&&!t.ident?KIND.shahed:KIND[t.k]||KIND.shahed;  // a decoy passes for a Shahed until identified (close, thermal, or optics)
 Z.tname=t=>`T${String(t.id).padStart(2,'0')} ${shown(t).n}`;
 Z.label=t=>{const K=shown(t),n=t.k==='swarm'?TH.reduce((a,u)=>a+(u.grp===t.grp&&api.live(u)?1:0),0):0;return`${K.tag}${n>1?` ×${n}`:''}${t.k==='boss'?` STAGES ${t.stages}`:''}${K.armor===1?' <span class="co">ARMORED</span>':K.armor==='hard'?' <span class="cr">DIRECT HIT ONLY</span>':''}${t.mark?' <span style="color:#ff6bd6">MARKED</span>':''}${t.claim?' <span style="color:#ffe23c">CLAIMED</span>':''}${Z.eta?.()?` · → ${t.tgt.n} ${Math.ceil(t.p.distanceTo(t.aim)/Math.max(1,t.spd))} s`:''}`};
 Z.slabel=s=>s.hp>0?`${s.n} ${Math.ceil(s.hp)}/${s.max}`:`${s.n} · DESTROYED`;
 // auto-selected track: the most urgent one nobody has claimed, preferring ones you can actually stop
 Z.urgent=()=>{let b=null,bt=1e18;for(const t of TH)if(api.live(t)){let tt=Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/t.spd;if(t.claim)tt+=1e6;if(KIND[t.k]?.armor==='hard')tt+=1e5;if(t.k==='swarm'&&lead.get(t.grp)!==t)tt+=1e4;if(tt<bt){bt=tt;b=t}}return b};
 const hardT=()=>TH.filter(t=>api.live(t)&&KIND[t.k]?.armor==='hard');
 Z.radar=(rc,P,sel)=>{def.radar(rc,P);
  for(const t of TH)if(t.k==='swarm'&&api.live(t)&&lead.get(t.grp)!==t&&inRange(t)){const q=P(t.p.x,t.p.z);rc.fillStyle=t.claim?'#ffe23c':'#ff4d4d';rc.fillRect(q[0]-1.5,q[1]-1.5,3,3)}
  for(const t of hardT()){const q=P(t.aim.x,t.aim.z);rc.strokeStyle='#ff4d4d';rc.lineWidth=2.5;rc.beginPath();rc.moveTo(q[0]-7,q[1]-7);rc.lineTo(q[0]+7,q[1]+7);rc.moveTo(q[0]+7,q[1]-7);rc.lineTo(q[0]-7,q[1]+7);rc.stroke()}  // predicted impact points
  if(!sel||!Z.seen(sel)||!sel.rb)return;const q=P(sel.rb.x,sel.rb.z);rc.strokeStyle='#fff';rc.lineWidth=2;rc.beginPath();rc.arc(q[0],q[1],12,0,7);rc.stroke()};
 const ttImpact=t=>t.p.distanceTo(t.aim)/t.spd;
 Z.overlay=oc=>{const cam=api.camera,W=innerWidth,H=innerHeight;oc.save();oc.textAlign='center';oc.font='700 14px "JetBrains Mono",monospace';oc.shadowColor='#000';oc.shadowBlur=4;
  const sel=api.selT();if(sel&&api.live(sel)){_a.copy(sel.p).project(cam);if(_a.z<1&&Math.abs(_a.x)<1&&Math.abs(_a.y)<1){oc.strokeStyle='rgba(255,255,255,.9)';oc.lineWidth=1.5;oc.beginPath();oc.arc((_a.x*.5+.5)*W,(-_a.y*.5+.5)*H,22,0,7);oc.stroke()}}
  oc.font='700 13px "JetBrains Mono",monospace';
  for(const t of hardT()){_a.copy(t.aim).project(cam);if(_a.z>1||Math.abs(_a.x)>1.05||Math.abs(_a.y)>1.05)continue;const X=(_a.x*.5+.5)*W,Y=(-_a.y*.5+.5)*H;oc.strokeStyle=oc.fillStyle='#ff4d4d';oc.lineWidth=2;oc.setLineDash([5,4]);oc.beginPath();oc.arc(X,Y,26,0,7);oc.stroke();oc.setLineDash([]);oc.fillText(`IMPACT ${Math.ceil(ttImpact(t))}s`,X,Y+42)}
  oc.font='700 14px "JetBrains Mono",monospace';
  for(let i=G.pops.length-1;i>=0;i--){const p=G.pops[i];if(p.t>1.6){G.pops.splice(i,1);continue}_a.copy(p.p).project(cam);if(_a.z>1)continue;
   oc.globalAlpha=cl(2-p.t*1.25,0,1);oc.fillStyle=p.col;oc.fillText(p.txt,(_a.x*.5+.5)*W,(-_a.y*.5+.5)*H-30-p.t*40)}
  pk.overlay(oc,W,H);oc.restore()};
 // performance governor (Zombies only): the forest's shadow pass is the biggest frame cost; if frames stay slow for a few seconds, trees stop casting shadows.
 // Classic is never touched: the shadows come back when Zombies stops.
 const perf={ema:16,last:0,slow:0,off:false,trees:null};
 const trees=()=>perf.trees||(perf.trees=api.scene.children.filter(o=>o.isInstancedMesh&&o.instanceMatrix.count>=10000&&o.castShadow));
 function govern(){const now=performance.now(),ft=now-(perf.last||now);perf.last=now;if(ft<=0||ft>500||G.state!=='wave')return;perf.ema+=(ft-perf.ema)*.05;
  perf.slow=perf.ema>26?perf.slow+ft:0;if(!perf.off&&perf.slow>3000){perf.off=true;for(const o of trees())o.castShadow=false;feed('<span class="co">Performance: tree shadows off to keep the frame rate up</span>')}}
 Z.shadowsBack=()=>{if(perf.off){for(const o of trees())o.castShadow=true;perf.off=false}perf.slow=0;perf.last=0};
 Z.perf=perf;
 Z.visuals=dt=>{govern();wx.step(dt,performance.now());G.selNow=api.selT();for(const p of G.pops)p.t+=dt;lead.clear();for(const t of TH)if(t.k==='swarm'&&api.live(t)&&!lead.has(t.grp))lead.set(t.grp,t);def.visuals();en.visuals(dt);rk.visuals()};
 Z.key=e=>base.el.hidden?pk.key(e):base.key(e);
 Z.pad=e=>base.el.hidden&&$('zover').hidden?pk.pad(e):base.pad(e);

 // ---------- harness hooks (tools/zombies-test.mjs) ----------
 window.__z={G,Z,api,KIND,ITEMS,integrity,
  sim(sec,h=1/120){const n=Math.round(sec/h);for(let i=0;i<n;i++){api.step(h);if(i%12===11)api.visuals(h*12,performance.now())}},
  cont:()=>Z.continue(),make:(k,x,z)=>make(k,x,z),plan:w=>plan(w),jump(w,cash){G.wave=w-1;if(cash!=null)G.cash=cash},
  // helper rack trials: one track of a kind runs in toward a site, one drone of the given tier is launched at it from that site's north slot.
  // Returns kill / damage / miss counts. Sites and money are left as they were.
  trials(tier,kind,n=100,mark=false){const save={cash:G.cash,earned:G.earned,kills:{...G.kills},st:G.state,hp:SITES.map(s=>s.hp)},res={kill:0,damage:0,miss:0};G.state='trial';
   const keep=TH.splice(0);const si=def.SLOTS.findIndex(s=>s.site&&/north/.test(s.n)),d=def.add('rack',si);d.tier=tier;
   for(let i=0;i<n;i++){const s=def.SLOTS[si],b=(Math.random()-.5)*2,R=3000,t=make(kind,s.x+Math.sin(b)*R,s.z-Math.cos(b)*R,s.site);if(!t)break;t.mesh.visible=false;if(mark)t.mark=1e9;
    def.launchDrone(d,t);d.ready=d.cap;let k=0;while(def.drones.length&&k++<120*90){api.step(1/120)}
    if(t.paid||t.st==='fall'||t.st==='dead'&&!t.impacted)res.kill++;else if(t.dmg)res.damage++;else res.miss++;
    for(const u of TH)api.scene.remove(u.mesh);TH.length=0}
   def.D.splice(def.D.indexOf(d),1);TH.push(...keep);Object.assign(G,{cash:save.cash,earned:save.earned,kills:save.kills,state:save.st});SITES.forEach((s,i)=>s.hp=save.hp[i]);return res},
  // scripted player: put the interceptor just behind the most urgent free track, matched to its velocity, and detonate
  botKill(off=1){const me=api.player,t=Z.urgent();if(!me||me.dead>0||!t)return null;me.p.copy(t.p).addScaledVector(_a.copy(t.v).normalize(),-off);me.v.copy(t.v);Z.detonate();return t.k}};
 return Z}
