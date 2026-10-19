// Interceptor: Zombies mode. Endless, growing waves from the map edges against the defended sites; money per intercept, a base screen between
// waves, helpers and perks. interceptor.js stays Riley's Classic game: it calls the hooks below only while Z.on is true.
// api = live access to interceptor.js internals (see the initZombies call there).
import {KIND,ORDER,SITE_HP,budget,isBoss,weight,speedK,START_CASH,HELPER_SHARE,clearBonus,perfectBonus,streakMult,CLUTCH_R,CLUTCH_K,MULTI_BONUS,REPAIR_PER_HP} from './zdata.js';
import {initBase} from './zbase.js';

const $=id=>document.getElementById(id),cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.random()*a.length|0];
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initZombies(api){
 const {THREE,TH,SITES,S,save,feed,banner,tone,gh}=api,V3=THREE.Vector3;
 const _a=new V3(),_b=new V3();
 const G={on:false,state:'off',wave:0,cash:0,earned:0,kills:{p:0,h:0},streak:0,best:0,wq:[],wt:0,perfect:true,pops:[],clearT:0,wasAlive:false,detFlag:false,sitesHp:{}};
 const Z={get on(){return G.on},G};
 const SITE_C={x:0,z:1950};  // centre of the defended area

 // ---------- mode choice on the start menu ----------
 {const box=$('gmode'),desc=$('gmdesc');
  const sync=()=>{for(const b of box.querySelectorAll('button'))b.classList.toggle('on',b.dataset.m===S.gmode);
   desc.innerHTML=S.gmode==='z'?`<b>Zombies</b>: endless, growing waves from every edge. Earn money for each intercept, then spend it between waves on helper drones, guns, missiles, domes and perks. New enemy types every 5 waves, a boss every 10. ${G.best?`Best: wave ${G.best}.`:''}`:'<b>Classic</b>: Riley\'s Interceptor. One Shahed-136, then one jet Geran-3, each wave.';
   $('play').textContent=S.gmode==='z'?'Hold the line':'Defend'};
  for(const b of box.querySelectorAll('button'))b.onclick=()=>{S.gmode=b.dataset.m;save();sync()};
  G.best=(S.zbest&&S.zbest.wave)|0;if(S.gmode!=='z')S.gmode='classic';sync();Z.syncMode=sync}

 // ---------- HUD ----------
 const hudEl=document.createElement('div');hudEl.id='zhud';hudEl.className='osd';hudEl.hidden=true;
 hudEl.innerHTML='<div class="zt"><span id="zw">WAVE 1</span><span id="zc">$0</span><span class="zi"><i id="zib"></i><em id="zit">100%</em></span><span id="zs"></span></div><div id="zsites"></div><div id="zinb"></div>';
 $('hud').append(hudEl);
 let lastSites='';
 Z.hud=()=>{const integ=integrity();$('zw').textContent=G.state==='base'?`WAVE ${G.wave+1} NEXT`:`WAVE ${G.wave}`;$('zc').textContent=money(G.cash);
  const f=integ.max?integ.hp/integ.max:0;$('zib').style.width=(f*100).toFixed(1)+'%';$('zib').className=f<.3?'lo':f<.6?'mid':'';$('zit').textContent=`INTEGRITY ${Math.round(f*100)}%`;
  $('zs').textContent=G.streak>1?`STREAK ×${G.streak}`:'';$('zs').hidden=G.streak<2;
  const sh=SITES.map(s=>`<span class="${s.hp>0?(s.hp<s.max*.35?'lo':''):'dead'}">${s.n} ${Math.max(0,Math.ceil(s.hp))}/${s.max}</span>`).join('');if(sh!==lastSites)$('zsites').innerHTML=lastSites=sh;
  const live=TH.filter(api.live).length,queued=G.wq.length;$('zinb').textContent=G.state==='wave'?`INBOUND ${live+queued}${queued?` · ${queued} still to come`:''}`:''};
 const integrity=()=>{let hp=0,max=0;for(const s of SITES){hp+=Math.max(0,s.hp);max+=s.max}return{hp,max}};

 // ---------- start / stop ----------
 const base=initBase(Z,api,G);
 Z.start=()=>{G.on=true;G.state='base';G.wave=0;G.cash=START_CASH;G.earned=0;G.kills={p:0,h:0};G.streak=0;G.wq.length=0;G.pops.length=0;G.perfect=true;
  for(const s of SITES){s.max=s.hp=SITE_HP[s.n]||400}
  api.AW=4300;api.wave=0;api.wstate='wave';$('hud').classList.add('z');hudEl.hidden=false;$('zover').hidden=true;
  base.open(true)};
 Z.stop=()=>{if(!G.on&&G.state==='off')return;G.on=false;G.state='off';for(const s of SITES){s.max=s.hp=3}api.AW=3000;api.applyTune();
  $('hud').classList.remove('z');hudEl.hidden=true;base.close();$('zover').hidden=true;G.wq.length=0};
 Z.hold=()=>G.on&&!api.demo&&(G.state==='base'||G.state==='over');

 // ---------- wave director ----------
 // a wave = a threat-point budget spent on unlocked kinds, split into raids from different edges; each raid spawns over a few seconds
 function compose(w){const out=[];let b=budget(w,S.diff|0);if(w===1)return['shahed','jet'];
  if(isBoss(w)){out.push('boss');b=Math.round(b*.6)}
  const ks=ORDER.filter(k=>weight(k,w)>0);
  while(b>0){let tot=0;for(const k of ks)tot+=weight(k,w);let r=Math.random()*tot,k=ks[0];for(const q of ks){r-=weight(q,w);if(r<=0){k=q;break}}
   if(k==='swarm'){const n=6+(Math.random()*Math.min(10,2+w/3)|0);out.push('swarm:'+n);b-=n*KIND.swarm.pts}else{out.push(k);b-=KIND[k].pts}}
  return out}
 function startWave(){G.wave++;api.wave=G.wave;G.state='wave';G.perfect=true;G.wt=0;
  const list=compose(G.wave),raids=G.wave===1?1:1+Math.min(4,G.wave/4|0),win=G.wave===1?30:Math.min(100,25+3*G.wave);
  const edges=[];for(let i=0;i<raids;i++)edges.push((Math.random()-.5)*2.6);  // edge bearing per raid: 0 = north, ±1.3 rad = west/east
  G.wq=list.map((k,i)=>{const ri=G.wave===1?0:i%raids;return{k,at:G.wave===1?(i?25:0):(k==='boss'?5:ri*win/raids+rnd(0,10)),brg:edges[ri]+rnd(-.12,.12)}}).sort((a,b)=>a.at-b.at);
  banner('WAVE '+G.wave,'cr',2.4);const n={};for(const q of list){const k=q.split(':')[0];n[k]=(n[k]||0)+(+q.split(':')[1]||1)}
  feed('Inbound: '+Object.entries(n).map(([k,c])=>`${c}× ${KIND[k].n}`).join(', '));
  if(api.player&&api.player.dead<=0)api.launch()}
 Z.continue=()=>{base.close();startWave()};
 Z.waves=dt=>{if(api.demo)return;if(G.state==='wave'){G.wt+=dt;
   while(G.wq.length&&G.wq[0].at<=G.wt){const q=G.wq.shift();spawn(q)}
   if(!G.wq.length&&!TH.some(api.live)){G.state='clear';G.clearT=3;const b=clearBonus(G.wave)+(G.perfect?perfectBonus(G.wave):0);earn(b,null,null);
    banner(`WAVE ${G.wave} CLEAR`,'cg',2.6);feed(`Wave ${G.wave} clear: <span class="cg">+${money(clearBonus(G.wave))}</span>${G.perfect?` · perfect defence <span class="cg">+${money(perfectBonus(G.wave))}</span>`:''}`)}}
  else if(G.state==='clear'&&(G.clearT-=dt)<=0){G.state='base';base.open(false)}};

 // spawn points sit on a ring around the defended area at the given bearing; fast kinds come from much farther out (the map extends past the AO)
 function spawn(q){const[k,n]=q.k.split(':'),K=KIND[k],R=K.far||5200,x=SITE_C.x+Math.sin(q.brg)*R,z=SITE_C.z-Math.cos(q.brg)*R;
  if(k==='swarm'){for(let i=0;i<+n;i++)make(k,x+rnd(-60,60),z+rnd(-60,60));return}
  make(k,x,z)}
 function make(k,x,z,site){const K=KIND[k],L=api.liveSites();if(!L.length)return null;const s=site||pick(L),aim=pick(s.aims),alt=K.alt?rnd(K.alt[0],K.alt[1]):800;
  const p=new V3(x,gh(x,z)+alt,z),dx=aim.x-x,dz=aim.z-z,d=Math.hypot(dx,dz),px=-dz/d,pz=dx/d;
  const wps=[new V3(x+dx*.35+px*rnd(-900,900),0,z+dz*.35+pz*rnd(-900,900)),new V3(x+dx*.72+px*rnd(-500,500),0,z+dz*.72+pz*rnd(-500,500))];
  const spd=K.spd*(K.spd<150?speedK(G.wave):1)*rnd(.94,1.06),m=api.shahedMesh(!!K.jet);
  const t={id:api.nextId(),k,p,v:new V3(wps[0].x-x,0,wps[0].z-z).setLength(spd),spd,cs:spd,alt,wps,tgt:s,aim,st:'cruise',jet:!!K.jet,mesh:m.g,prop:m.prop,pd:1e9,dmin:1e9,cvm:0,bank:0,roll:0,spin:0,smoke:0,rb:null,claim:null,by:null};
  TH.push(t);return t}
 // own movers for the kinds Riley's flight code doesn't cover (filled in with the roster); true = handled
 Z.tstep=(t,dt)=>!!(t.k&&!KIND[t.k].riley&&t.st!=='fall'&&mover(t,dt));
 const mover=()=>false;

 // ---------- impacts, kills, money ----------
 Z.impact=t=>{t.st='dead';const K=KIND[t.k]||KIND.shahed;api.boom(t.aim,K.dmg>100?6:K.dmg>20?4:K.dmg?1.5:.8);if(api.demo||G.state==='over')return;const s=t.tgt;
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
 function earn(c,p,why){c=Math.round(c);G.cash+=c;G.earned+=c;if(p)pop(p,`+${money(c)}${why||''}`,why?'#ffe23c':'#3ddc84')}
 Z.earn=earn;
 const pop=(p,txt,col)=>{if(G.pops.length>40)G.pops.shift();G.pops.push({p:p.clone(),txt,col,t:0})};

 // player warhead in Zombies: Riley's kill model (pkill from miss distance + fuse delay), plus the one-hit/armor rules
 Z.detonate=()=>{const d=api.player,out=[];G.burst={n:0};
  for(const t of TH)if(api.live(t)){const r=t.p.distanceTo(d.p);if(r>30)continue;const cv=Math.max(0,-_b.subVectors(t.v,d.v).dot(_a.subVectors(t.p,d.p))/(r||1));
   const o=outcome(t,r,cv);t.by='p';
   if(o==='kill'){const cat=r<2.4&&Math.random()<.55;api.killThreat(t,cat);out.push(`<span class="cg">${Z.tname(t)} ${r<KIND[t.k].hitR?'direct hit':'down'}</span> (${r.toFixed(1)} m)`)}
   else if(o==='damage'){api.damage(t);out.push(`<span class="co">${Z.tname(t)} damaged${KIND[t.k].armor===1?' (armored: needs a direct hit)':''}</span>`)}
   else out.push(`<span class="co">Missed ${Z.tname(t)} (${r.toFixed(1)} m)</span>`)}
  const kills=G.burst.n;G.burst=null;G.streak=kills?G.streak+1:0;G.detFlag=true;
  api.lose('det');feed(out.join('<br>')||'Detonated: nothing in range')};
 // one-hit rules: a direct hit always kills; proximity uses pkill; armor 1 turns a proximity kill into damage; 'hard' needs a direct hit
 function outcome(t,r,cv){const K=KIND[t.k]||KIND.shahed;if(r<K.hitR)return'kill';if(K.armor==='hard')return'miss';
  const p=api.pkill(r,cv);if(Math.random()<p)return K.armor===1||K.armor==='boss'?'damage':'kill';
  const re=r+cv*api.FDLY;if(!t.dmg&&Math.random()<Math.exp(-(((re-1.2)/(5*api.LETH/4))**2)))return'damage';return'miss'}
 Z.outcome=outcome;

 // ---------- game over ----------
 function gameOver(){G.state='over';api.wstate='over';const best=S.zbest||{};const nb=G.wave>(best.wave|0);
  if(nb){S.zbest={wave:G.wave,kills:G.kills.p+G.kills.h,earned:G.earned};save();G.best=G.wave}
  banner('');
  $('zover').innerHTML=`<div class="zpanel zgo"><h2>Defense collapsed</h2><div class="zbig">WAVE ${G.wave}</div>
   <div class="zstats"><span>Intercepts</span><b>${G.kills.p+G.kills.h}</b><span>by you</span><b>${G.kills.p}</b><span>by helpers</span><b>${G.kills.h}</b><span>Money earned</span><b>${money(G.earned)}</b><span>Best</span><b>${nb?'NEW BEST · ':''}wave ${G.best}</b></div>
   <div class="btns"><button class="go" id="zagain">Try again</button><button id="zmenu">Menu</button></div></div>`;
  $('zover').hidden=false;$('zagain').onclick=()=>{$('zover').hidden=true;banner('');api.startMatch()};$('zmenu').onclick=()=>{$('zover').hidden=true;api.startDemo()};
  Z.syncMode?.();setTimeout(()=>$('zagain')?.focus(),50)}
 Z.gameOver=gameOver;

 // ---------- per-step ----------
 Z.step=dt=>{const me=api.player;if(!me)return;const alive=me.dead<=0;
  if(G.wasAlive&&!alive&&!G.detFlag&&G.streak)G.streak=0;  // crashed or flat battery: streak over
  if(alive)G.detFlag=false;G.wasAlive=alive};

 // ---------- track display: claimed = yellow, free = red; the selected track gets a white ring ----------
 Z.seen=t=>{const K=KIND[t.k]||KIND.shahed;return Math.hypot(t.p.x-api.PADP.x,t.p.z-api.PADP.z)<K.det};
 Z.rcol=t=>t.claim?'255,226,60':'255,77,77';
 Z.ocol=t=>t.claim?'#ffe23c':'#ff4d4d';
 Z.tname=t=>`T${String(t.id).padStart(2,'0')} ${(KIND[t.k]||KIND.shahed).n}`;
 Z.label=t=>{const K=KIND[t.k]||KIND.shahed;return`${K.tag}${K.armor===1?' <span class="co">ARMORED</span>':K.armor==='hard'?' <span class="cr">DIRECT HIT ONLY</span>':''}${t.claim?' <span style="color:#ffe23c">CLAIMED</span>':''}`};
 Z.slabel=s=>s.hp>0?`${s.n} ${Math.ceil(s.hp)}/${s.max}`:`${s.n} · DESTROYED`;
 Z.urgent=()=>{let b=null,bt=1e18,bf=null,bft=1e18;for(const t of TH)if(api.live(t)){const tt=Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/t.spd;if(tt<bt){bt=tt;b=t}if(!t.claim&&tt<bft){bft=tt;bf=t}}return bf||b};
 Z.radar=(rc,P,sel)=>{if(!sel||!Z.seen(sel)||!sel.rb)return;const q=P(sel.rb.x,sel.rb.z);rc.strokeStyle='#fff';rc.lineWidth=2;rc.beginPath();rc.arc(q[0],q[1],12,0,7);rc.stroke()};
 Z.overlay=oc=>{const cam=api.camera,W=innerWidth,H=innerHeight;oc.save();oc.textAlign='center';oc.font='700 14px "JetBrains Mono",monospace';oc.shadowColor='#000';oc.shadowBlur=4;
  const sel=api.selT();if(sel&&api.live(sel)){_a.copy(sel.p).project(cam);if(_a.z<1&&Math.abs(_a.x)<1&&Math.abs(_a.y)<1){oc.strokeStyle='rgba(255,255,255,.9)';oc.lineWidth=1.5;oc.beginPath();oc.arc((_a.x*.5+.5)*W,(-_a.y*.5+.5)*H,22,0,7);oc.stroke()}}
  for(let i=G.pops.length-1;i>=0;i--){const p=G.pops[i];if(p.t>1.6){G.pops.splice(i,1);continue}_a.copy(p.p).project(cam);if(_a.z>1)continue;
   oc.globalAlpha=cl(2-p.t*1.25,0,1);oc.fillStyle=p.col;oc.fillText(p.txt,(_a.x*.5+.5)*W,(-_a.y*.5+.5)*H-30-p.t*40)}
  oc.restore()};
 Z.visuals=dt=>{for(const p of G.pops)p.t+=dt};
 Z.key=e=>base.key(e);
 Z.pad=e=>base.pad(e);

 // ---------- harness hooks (tools/zombies-test.mjs) ----------
 window.__z={G,Z,api,KIND,integrity,
  sim(sec,h=1/120){const n=Math.round(sec/h);for(let i=0;i<n;i++){api.step(h);if(i%12===11)api.visuals(h*12,performance.now())}},
  cont:()=>Z.continue(),jump(w,cash){G.wave=w-1;if(cash!=null)G.cash=cash},
  // scripted player: put the interceptor just behind the most urgent free track, matched to its velocity, and detonate
  botKill(off=1){const me=api.player,t=Z.urgent();if(!me||me.dead>0||!t)return null;me.p.copy(t.p).addScaledVector(_a.copy(t.v).normalize(),-off);me.v.copy(t.v);Z.detonate();return t.k}};
 return Z}
