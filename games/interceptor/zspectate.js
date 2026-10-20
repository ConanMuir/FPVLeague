// Zombies Bot Spectator: watch a bot pilot play the real game, to tune and playtest. "Watch a bot" on the Zombies start menu picks a bot
// level (zbotbrain.js LEVELS), a difficulty and optionally a campaign sector, doctrine and kit. The bot flies the interceptor for real
// (zbotfly.js: sticks, detonate, camera switch, relaunch, perk and swarm keys) and shops on the base screen one visible step at a time, each
// with a caption saying why.
// Spectator controls (bar at the bottom, keys in brackets): cameras [C] chase / the bot's FPV / free cam (WASD, Q/E, drag to look, Shift
// faster) / the sites one by one [V next] / threat cam; speed [1-4] 1x 2x 4x 8x, pause [Space], step 0.1 s [.]; tuning panel [K]; stop.
// The tuning panel edits key game numbers live (prices, enemy speed / bounty / damage / spawn weight, difficulty, helper effectiveness,
// income and costs); Export gives the changes as JSON, Reset puts everything back. Changes last until Reset or a page reload.
// On game over a report replaces the end screen: wave reached, the final hit, money over time, purchases by wave with their reasons,
// kills by source. A bot's run never touches your saves: no goals, no leaderboard entry, no best wave, no campaign progress.
// Hooks: interceptor.js reads Z.botIn (sticks), Z.botFire (detonate) and Z.stepCap (steps per frame at high speed); zlock.js / zswarm.js read
// Z.sightCam (the bot's sights). tools/zombies-bench.mjs --real drives __z.spec.bench headless.
import * as brain from './zbotbrain.js';
import {createPilot} from './zbotfly.js';
import {KIND,ITEMS,ZDIFF,HELP,RACK_TIERS,RACK_CAP,RACK_CAP_COST,LRACK,PERK,RESIST,SUPPLY} from './zdata.js';
import {SW} from './zswdata.js';
import {DOCS,DOC_IDS,KIT,KIT_IDS,KIT_MAX} from './zmeta.js';
import {SECTORS} from './zcampaign.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,money=n=>'$'+Math.round(n).toLocaleString('en-US'),esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);
const CAMS=[['chase','Chase'],['fpv','Bot FPV'],['free','Free cam'],['sites','Sites'],['threat','Threat cam']],SPEEDS=[1,2,4,8];
export function initSpectate(api,G,Z){
 const {THREE,S,save,SITES,TH,gh}=api,V3=THREE.Vector3,$=id=>document.getElementById(id);
 const E=window.__z;Object.assign(E,{RESIST,data:{RACK_TIERS,RACK_CAP,RACK_CAP_COST,LRACK,HELP,SUPPLY}});E.brain=brain;
 const sp={on:false,bench:false,P:null,o:null,pilot:null,spd:1,paused:false,cam:'chase',site:0,stats:null,gen:null,next:0,cur:null,starting:false,shopT:0};

 // ---------- style ----------
 const css=document.createElement('style');css.textContent=`
.zspc{margin:0 0 12px;border:1px solid rgba(95,227,255,.45);border-radius:8px;background:linear-gradient(90deg,rgba(95,227,255,.08),rgba(61,220,132,.05))}.zspc[hidden]{display:none}
.zspc summary{cursor:pointer;padding:10px 12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5fe3ff}.zspc summary span{letter-spacing:.02em;text-transform:none;color:var(--dim);margin-left:6px;font-size:12.5px}
.zspc .zmb{padding:0 12px 12px;display:grid;gap:8px}.zspc h4{margin:4px 0 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}.zspc .zdocs{display:flex;flex-wrap:wrap;gap:6px}
.zspc select{font:13px var(--mono);background:rgba(0,0,0,.35);color:var(--ink);border:1px solid var(--edge);border-radius:5px;padding:5px}.zspc .zsp-go{justify-self:start}
#zspbar{position:fixed;left:0;right:0;margin:0 auto;width:max-content;max-width:92vw;top:calc(76px + env(safe-area-inset-top,0px));z-index:7;display:grid;justify-items:center;gap:1px;pointer-events:none;font:700 13px var(--mono);text-shadow:0 0 4px #000;text-align:center;padding:4px 12px;border-radius:6px;background:rgba(4,10,18,.55)}
#zspbar[hidden],#zspctl[hidden]{display:none}#zspbar b{color:#5fe3ff;letter-spacing:.1em}#zspbar span{color:#fff;font-size:14px}#zspbar em{font-style:normal;color:var(--amber);font-size:12px}
#zspctl{position:fixed;left:0;right:0;margin:0 auto;width:max-content;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:7;display:flex;flex-wrap:wrap;justify-content:center;gap:4px;padding:6px 8px;background:var(--panel);border:1px solid var(--edge);border-radius:8px;max-width:96vw}
#zspctl button{font:700 11.5px var(--mono);padding:5px 8px}#zspctl button.on{background:#5fe3ff;color:#04121a;border-color:#5fe3ff}#zspctl i{width:1px;background:var(--edge);margin:0 3px}
#zspcap{position:fixed;left:0;right:0;margin:0 auto;width:max-content;top:calc(10px + env(safe-area-inset-top,0px));z-index:7;max-width:min(760px,94vw);padding:9px 16px;border-radius:8px;background:rgba(4,18,26,.92);border:1px solid #5fe3ff;font:700 15px var(--disp);color:#fff;text-align:center;pointer-events:none}
#zspcap small{display:block;font:11px var(--mono);color:#5fe3ff;letter-spacing:.12em;text-transform:uppercase;margin-bottom:2px}#zspcap[hidden]{display:none}
body.zsp-on #zbase{pointer-events:none}body.zsp-on #zbase .zpanel{opacity:.97}.zsp-hl{outline:3px solid #5fe3ff!important;outline-offset:2px;box-shadow:0 0 18px #5fe3ff!important}
#zsptune{position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top,0px));bottom:calc(64px + env(safe-area-inset-bottom,0px));width:min(380px,calc(100% - 24px));overflow:auto;z-index:8;box-sizing:border-box;padding:12px 14px;background:var(--panel);border:1px solid var(--edge);border-radius:10px;backdrop-filter:blur(8px)}
#zsptune h2{margin:0 0 4px;font-size:18px}#zsptune details{border-top:1px solid var(--edge);padding:4px 0}#zsptune summary{cursor:pointer;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--amber);padding:5px 0}
#zsptune .tr{display:grid;grid-template-columns:1fr 6.5em 1.6em;gap:6px;align-items:center;font-size:12.5px;padding:1px 0}#zsptune .tr label{color:var(--dim)}#zsptune .tr.chg label{color:#5fe3ff}
#zsptune input{width:100%;box-sizing:border-box;font:12px var(--mono);background:rgba(0,0,0,.35);color:var(--ink);border:1px solid var(--edge);border-radius:4px;padding:3px 5px}
#zsptune .tr button{padding:0;background:none;border:0;color:var(--dim);font-size:14px;visibility:hidden}#zsptune .tr.chg button{visibility:visible}#zsptune textarea{width:100%;box-sizing:border-box;font:11px var(--mono);min-height:70px;background:rgba(0,0,0,.35);color:var(--ink);border:1px solid var(--edge);border-radius:5px}
#zsptune .mp{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}#zsptune .note{font-size:11.5px;color:var(--dim);margin:4px 0}
.zsprep{max-width:min(980px,96vw)!important;width:100%}.zsprep h3{margin:14px 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5fe3ff}
.zsprep .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media (max-width:760px){.zsprep .cols{grid-template-columns:1fr}}
.zsprep svg{width:100%;height:auto;background:rgba(0,0,0,.25);border:1px solid var(--edge);border-radius:6px}.zsprep .bars{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;font:12px var(--mono);align-items:center}
.zsprep .bars i{display:block;height:10px;border-radius:2px;background:#5fe3ff}.zsprep .bars i.p{background:var(--amber)}.zsprep .buys{max-height:240px;overflow:auto;border:1px solid var(--edge);border-radius:6px}
.zsprep table{width:100%;border-collapse:collapse;font-size:12px}.zsprep td,.zsprep th{padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;vertical-align:top}.zsprep th{color:var(--dim);font-weight:500;position:sticky;top:0;background:rgba(10,14,22,.95)}
.zsprep td.n{font-family:var(--mono);white-space:nowrap}`;document.head.append(css);

 // ---------- start menu: the Watch a bot card ----------
 const cfg=()=>{const c=S.zspec&&typeof S.zspec==='object'?S.zspec:{};return{lv:brain.level(c.lv)?brain.level(c.lv).n:'Champion',d:cl(c.d|0,0,ZDIFF.length-1),sec:SECTORS.some(s=>s.id===c.sec)?c.sec:'',doc:DOCS[c.doc]?c.doc:'std',kit:Array.isArray(c.kit)?c.kit.filter(k=>KIT[k]).slice(0,KIT_MAX):[]}};
 const card=document.createElement('details');card.className='zspc';card.id='zspc';($('zcpm')||$('zdiff')).after(card);
 function renderCard(){const c=cfg(),L=brain.level(c.lv);
  card.innerHTML=`<summary>Watch a bot <span>${esc(c.lv)} · ${ZDIFF[c.d].n}${c.sec?' · '+esc(SECTORS.find(s=>s.id===c.sec).n):''} · ${DOCS[c.doc].n}${c.kit.length?' · '+c.kit.map(k=>KIT[k].n).join(', '):''}</span></summary>
   <div class="zmb"><p class="note" style="margin:0">A bot pilot plays the real game while you watch: it flies the interceptor, shops between waves and tells you why. Speed, cameras, a live tuning panel and a report at the end. Its runs never touch your saves.</p>
   <h4>Bot level</h4><div class="zdocs">${brain.LEVELS.map(l=>`<button class="sm ${l.n===c.lv?'on':''}" data-zsl="${esc(l.n)}">${esc(l.n)}</button>`).join('')}</div>
   <h4>Difficulty</h4><div class="zdocs">${ZDIFF.map((d,i)=>`<button class="sm ${i===c.d?'on':''}" data-zsd="${i}">${d.n}</button>`).join('')}</div>
   <h4>Campaign sector (optional)</h4><select id="zspsec" aria-label="Campaign sector"><option value="">Quick defence (endless)</option>${SECTORS.map(s=>`<option value="${s.id}" ${s.id===c.sec?'selected':''}>${esc(s.n)} · hold ${s.obj}</option>`).join('')}</select>
   <h4>Doctrine</h4><div class="zdocs">${DOC_IDS.map(id=>`<button class="sm ${id===c.doc?'on':''}" data-zsdoc="${id}">${DOCS[id].n}</button>`).join('')}</div>
   <h4>Kit (up to ${KIT_MAX})</h4><div class="zdocs">${KIT_IDS.map(id=>`<button class="sm ${c.kit.includes(id)?'on':''}" data-zskit="${id}">${KIT[id].n}</button>`).join('')}</div>
   <p class="note" style="margin:0">${esc(L.n)}: shops ${L.shop}, perks ${L.perks}, reaction ${L.fly.react} s, detonates within ${L.fly.fire} m${L.fly.line?', tries to sit on missile lines':''}${L.fly.relaunch?', relaunches from the nearest pad':''}. Every doctrine and kit is open to bots.</p>
   <button class="go zsp-go" id="zspgo">Watch ▸</button></div>`;
  const put=o=>{S.zspec={...cfg(),...o};save();renderCard();card.open=true};
  for(const b of card.querySelectorAll('[data-zsl]'))b.onclick=()=>put({lv:b.dataset.zsl});
  for(const b of card.querySelectorAll('[data-zsd]'))b.onclick=()=>put({d:+b.dataset.zsd});
  for(const b of card.querySelectorAll('[data-zsdoc]'))b.onclick=()=>put({doc:b.dataset.zsdoc});
  for(const b of card.querySelectorAll('[data-zskit]'))b.onclick=()=>{const k=b.dataset.zskit,c0=cfg();let kit=c0.kit.includes(k)?c0.kit.filter(x=>x!==k):[...c0.kit,k];if(kit.length>KIT_MAX)kit=kit.slice(-KIT_MAX);put({kit})};
  $('zspsec').onchange=e=>put({sec:e.target.value});$('zspgo').onclick=()=>start(cfg())}
 const syncCard=()=>{card.hidden=S.gmode!=='z';if(!card.hidden)renderCard()};
 syncCard();const sy0=Z.syncMode;Z.syncMode=()=>{sy0?.();syncCard()};$('gmode').addEventListener('click',()=>setTimeout(syncCard,0));

 // ---------- the run ----------
 const newStats=o=>({lv:o.lv,d:ZDIFF[o.d].n,doc:DOCS[o.doc]?.n||'Standard',kit:o.kit||[],sec:o.sec?SECTORS.find(s=>s.id===o.sec)?.n:'',simT:0,money:[],buys:[],kills:{},lastHit:null,dmg:{},bursts:0,deaths:{det:0,crash:0,bat:0},crashes:[],waves:[],sampleT:0,snap:new Map(),wasDead:false,relaunches:0});
 function start(o){if(sp.on)stop();const P=brain.level(o.lv);if(!P)return false;
  Object.assign(sp,{on:true,bench:!!o.bench,P,o:{...o},spd:1,paused:false,cam:'chase',site:0,gen:null,cur:null,next:0,stats:newStats(o),shopT:0});
  sp.pilot=createPilot(api,G,Z,P,E);
  Z.botIn=(d,dt)=>sp.on&&G.state!=='base'&&G.state!=='over'?sp.pilot.input(d,dt):null;Z.botFire=()=>sp.on&&sp.pilot.fire();Z.sightCam=sight;
  const ld=Z.meta.load;Z.meta.load=()=>({doc:DOCS[o.doc]?o.doc:'std',kit:(o.kit||[]).filter(k=>KIT[k]).slice(0,KIT_MAX)});sp.starting=true;
  try{S.gmode='z';if(o.sec&&Z.cp?.start)Z.cp.start(o.sec,true);else api.startMatch()}finally{Z.meta.load=ld;sp.starting=false}
  reseed(o.d);document.body.classList.add('zsp-on');api.camMode=1;
  if(!sp.bench){ui();api.feed(`<span class="cb">Bot spectator: ${esc(P.n)} on ${ZDIFF[o.d].n}</span>. Keys: C camera · 1-4 speed · Space pause · . step · K tuning · Esc menu`)}
  logMoney();return true}
 // the bot's difficulty, whatever the menu or the campaign says: start cash and site hit points follow it, and the first wave is planned again
 function reseed(d){const D0=Z.diff();G.dfo=d;const D=Z.diff(),k=Z.meta.k('startK');G.cash+=Math.round(D.start*k)-Math.round(D0.start*k);
  for(const s of SITES){s.max=Math.max(1,Math.round(s.max*D.hp/D0.hp));s.hp=s.max}G.next=Z.plan(G.wave+1);Z.wx?.start?.(G.next.wx);Z.base.refresh?.()}
 function stop(){if(!sp.on)return;sp.on=false;delete Z.botIn;delete Z.botFire;delete Z.sightCam;Z.stepCap=0;sp.pilot=null;sp.gen=null;
  document.body.classList.remove('zsp-on');api.camMode=S.cam|0;G.dfo=undefined;for(const id of['zspbar','zspctl','zspcap','zsptune'])$(id)?.remove()}
 // the bot's sights: its FPV camera (down the nose with the tilt switch up), whatever camera the spectator is watching through
 const sq=new THREE.Quaternion(),sx=new V3(1,0,0),sightO={position:new V3(),quaternion:new THREE.Quaternion()};
 function sight(){const me=api.player;if(!me)return null;sightO.position.copy(me.p);sightO.quaternion.copy(me.q).multiply(sq.setFromAxisAngle(sx,(api.camUp?S.tilt:0)*Math.PI/180));return sightO}

 // ---------- hooks ----------
 const zs0=Z.start;Z.start=()=>{if(sp.on&&!sp.starting)stop();zs0()};
 const zt0=Z.stop;Z.stop=()=>{zt0();stop()};
 const h0=Z.hold;Z.hold=()=>h0()||sp.on&&sp.paused&&!api.menuOpen;
 {const d0=Object.getOwnPropertyDescriptor(Z,'tsc'),base=()=>d0?d0.get?d0.get.call(Z):d0.value:1;Object.defineProperty(Z,'tsc',{get:()=>base()*(sp.on&&!sp.bench?sp.spd:1),configurable:true})}
 // no goals, leaderboard, best wave or campaign progress from a bot's run
 for(const k of['waveClear','onKill','onStreak','onRepair']){const f=Z.meta[k];Z.meta[k]=(...a)=>sp.on?undefined:f?.(...a)}
 const ov0=Z.cpOver;Z.cpOver=()=>{if(!sp.on)return ov0?ov0():false;over();return true};
 const st0=Z.step;Z.step=dt=>{st0(dt);if(sp.on&&G.on)tick(dt)};
 const k0=Z.kill;Z.kill=(t,cat)=>{const was=t.paid;k0(t,cat);if(sp.on&&!was&&t.paid)credit(t)};
 const hit=(t,s,h)=>{const l=h-(s?s.hp:0);if(!sp.on||!(l>0))return;const st=sp.stats;st.lastHit={k:t.k,site:s.n,dmg:l,w:G.wave};const D=st.dmg[G.wave]||(st.dmg[G.wave]={});D[t.k]=(D[t.k]|0)+l};
 const i0=Z.impact;Z.impact=t=>{const s=t.tgt,h=s?s.hp:0;sp.hit=[t,s,h];i0(t);if(sp.hit)hit(...sp.hit);sp.hit=null};  /* the final hit ends the game inside i0: over() books it first */
 // a helper's kill: zdef.js counts it on the defence just before calling this, so the defence whose count went up is the one (EW spoofs count too: skipped)
 const hk0=Z.helperKill;Z.helperKill=t=>{if(sp.on&&!t.sw){const st=sp.stats;let b=null;for(const d of Z.def.D)if(d.kills>(st.snap.get(d.id)|0)&&(!b||b.type==='ew'))b=d;for(const d of Z.def.D)st.snap.set(d.id,d.kills);if(b&&b.type!=='ew')t._src=ITEMS[b.type]?.n||b.type}return hk0(t)};
 const d0=Z.detonate;Z.detonate=()=>{if(sp.on)sp.stats.bursts++;return d0()};
 const hh0=Z.helperHit;Z.helperHit=(t,p,...a)=>hh0(t,Math.min(.99,p*(TUNE.v['helper.all']??1)),...a);
 const cc0=Z.cpCompose;Z.cpCompose=(out,w)=>{const o=cc0?cc0(out,w):out;return reweigh(o)};
 const kk=Z.key;Z.key=e=>sp.on?(Z.cine?kk(e):key(e)):kk(e);
 const pp=Z.pad;Z.pad=e=>sp.on?true:pp(e);
 const cam0=Z.cam;Z.cam=dt=>{cam0?.(dt);if(sp.on&&!Z.cine)camTick(dt||1/60)};
 const mk0=Z.meta.k;Z.meta.k=(key,d=1)=>{const v=mk0(key,d),m=TUNE.v['econ.'+key];return m!=null&&typeof v==='number'?v*m:v};

 // who made each kill: the pilot (burst or direct hit), its airstrike, its swarm, or which helper (the defence whose kill count went up)
 function credit(t){const st=sp.stats,K=t.k;let src;
  if(t.by==='p')src=G.strike&&G.strike.n===3?'airstrike':'pilot';else if(t.by==='o')src='co-op pilot';else if(t.sw)src='swarm';else src=t._src||(t.by==null?'damage, failed later':'helpers');
  const s=st.kills[src]||(st.kills[src]={n:0,k:{}});s.n++;s.k[K]=(s.k[K]|0)+1}
 function logMoney(){const st=sp.stats;if(st)st.money.push({w:G.wave,t:Math.round(st.simT),cash:Math.round(G.cash),earned:Math.round(G.earned),st:G.state})}
 let lastState='';
 function tick(dt){const st=sp.stats,me=api.player;if(G.state==='wave'||G.state==='clear'){st.simT+=dt;if((st.sampleT-=dt)<=0){st.sampleT=5;logMoney()}}
  if(G.state!==lastState){if(G.state==='wave'){sp.gen=null;sp.cur=null;sp.next=0;for(const d of Z.def.D)st.snap.set(d.id,d.kills);st.waves.push({w:G.wave,cash:Math.round(G.cash),integ:Math.round(100*Z.integrity().hp/Math.max(1,Z.integrity().max))})}lastState=G.state;logMoney()}
  if(me){const dead=me.dead>0;if(dead&&!st.wasDead){const why=G.detFlag?'det':me.mah>=api.BCAP?'bat':'crash';st.deaths[why]++;if(why==='crash'&&st.crashes.length<40)st.crashes.push({w:G.wave,y:Math.round(me.p.y),agl:Math.round(me.p.y-gh(me.p.x,me.p.z)),x:Math.round(me.p.x),z:Math.round(me.p.z),mode:sp.pilot.st.mode,intent:sp.pilot.st.lastIntent||'',v:Math.round(sp.pilot.st.lastV||0),t:+me.t.toFixed(1)})}st.wasDead=dead}
  if(G.state==='wave'||G.state==='clear')sp.pilot.step(dt);
  if(!sp.bench)hudTick()}

 // ---------- the base screen, one visible step at a time ----------
 const DELAY=1100;
 function shopTick(){if(!sp.on||sp.bench||G.state!=='base'||sp.paused||api.menuOpen)return;const now=performance.now();if(now<sp.next)return;const d=DELAY/sp.spd;
  if(!sp.gen){sp.gen=brain.shopSteps(sp.P,E);sp.cur=null;caption('Base screen','Looking over the shop…');sp.next=now+d*.8;logMoney();return}
  if(sp.cur){const c=sp.cur;sp.cur=null;const c0=G.cash;let r;try{r=c.run()}catch(e){console.warn('bot shop step',e)}const spent=c0-G.cash;
   if(spent>0||c.what==='chain'||c.what==='sell')sp.stats.buys.push({w:G.wave+1,what:c.what,k:c.k||'',why:c.why,cost:Math.round(spent)});Z.base.refresh?.();sp.next=now+d*.45;return}
  let n;try{n=sp.gen.next()}catch(e){console.warn('bot shop',e);n={done:true}}
  if(n.done){sp.gen=null;caption(`Wave ${G.wave+1}`,`Done shopping with ${money(G.cash)} left. Starting wave ${G.wave+1}.`);sp.next=1e18;setTimeout(()=>{if(sp.on&&G.state==='base'){hideCap();sp.next=0;Z.continue()}},d*.9);return}
  sp.cur=n.value;caption(`Base screen · ${money(G.cash)}`,n.value.why);highlight(n.value);sp.next=now+d*.6}
 setInterval(shopTick,50);
 function highlight(s){const B=Z.base,tab=s.what==='repair'||s.what==='rebuild'||s.what==='expand'?'sites':s.what==='upgrade'||s.what==='refit'||s.what==='sell'?'armory':'shop';try{B.setTab?.(tab)}catch(e){}
  const q=s.what==='repair'?`[data-rep="${s.site}"]`:s.what==='rebuild'?`[data-rb="${s.site}"]`:s.what==='expand'?`[data-ex="${s.slot}"]`:s.what==='sell'?`[data-sell="${s.id}"]`:s.what==='refit'?`[data-fit^="${s.id}:"]`:s.what==='upgrade'?`[data-up^="${s.id}:"]`
   :s.k?`[data-buy="${G.cards.findIndex(c=>c.k===s.k)}"]`:null;const el=q&&B.el.querySelector(q);if(el){el.classList.add('zsp-hl');el.scrollIntoView?.({block:'nearest'})}}
 function caption(h,t){if(sp.bench)return;let c=$('zspcap');if(!c){c=document.createElement('div');c.id='zspcap';document.body.append(c)}c.hidden=false;c.innerHTML=`<small>${esc(h)}</small>${esc(t)}`}
 const hideCap=()=>{const c=$('zspcap');if(c)c.hidden=true};

 // ---------- HUD: who is flying, what it is doing; the control bar ----------
 function ui(){let b=$('zspbar');if(!b){b=document.createElement('div');b.id='zspbar';document.body.append(b)}
  let c=$('zspctl');if(!c){c=document.createElement('div');c.id='zspctl';document.body.append(c)}
  c.innerHTML=CAMS.map(([k,n])=>`<button class="sm" data-zcam="${k}">${n}</button>`).join('')+'<i></i>'+SPEEDS.map(s=>`<button class="sm" data-zspd="${s}">${s}×</button>`).join('')+
   '<button class="sm" id="zsppause">Pause</button><button class="sm" id="zspstep">Step</button><i></i><button class="sm" id="zsptbtn">Tune</button><button class="sm" id="zspstop">Stop</button>';
  for(const x of c.querySelectorAll('[data-zcam]'))x.onclick=()=>setCam(x.dataset.zcam,true);
  for(const x of c.querySelectorAll('[data-zspd]'))x.onclick=()=>setSpeed(+x.dataset.zspd);
  $('zsppause').onclick=()=>setPause(!sp.paused);$('zspstep').onclick=stepOnce;$('zsptbtn').onclick=toggleTune;$('zspstop').onclick=()=>api.startDemo();syncCtl()}
 function syncCtl(){const c=$('zspctl');if(!c)return;for(const x of c.querySelectorAll('[data-zcam]'))x.classList.toggle('on',x.dataset.zcam===sp.cam);for(const x of c.querySelectorAll('[data-zspd]'))x.classList.toggle('on',+x.dataset.zspd===sp.spd&&!sp.paused);
  $('zsppause').classList.toggle('on',sp.paused);$('zsppause').textContent=sp.paused?'Resume':'Pause';$('zsptbtn').classList.toggle('on',!!$('zsptune'))}
 let hudLast='';
 function hudTick(){const b=$('zspbar');if(!b)return;const ov=G.state==='over';b.hidden=ov;const c=$('zspctl');if(c)c.hidden=ov;if(ov)return;const me=api.player,lk=Z.lk?.t,camN=CAMS.find(c=>c[0]===sp.cam)[1]+(sp.cam==='sites'?' · '+(SITES[sp.site%SITES.length]?.n||''):'');
  const h=`<b>BOT ${esc(sp.P.n.toUpperCase())} · ${esc(sp.stats.d.toUpperCase())}</b><span>${esc(G.state==='base'?'on the base screen':sp.pilot?.intent||'')}</span><em>${camN} · ${sp.paused?'PAUSED':sp.spd+'×'}${lk?` · LOCK T${String(lk.id).padStart(2,'0')}`:Z.lk?.cand&&Z.lk.prog>0?` · LOCKING ${Math.round(Z.lk.prog*100)}%`:''}${me&&me.dead<=0?` · ${Math.round(me.v.length()*3.6)} km/h · ${Math.round(me.p.y-gh(me.p.x,me.p.z))} m`:''}</em>`;
  if(h!==hudLast)b.innerHTML=hudLast=h}
 function setSpeed(s){sp.spd=s;sp.paused=false;Z.stepCap=Math.ceil(12*s);syncCtl()}
 function setPause(v){sp.paused=v;syncCtl()}
 function stepOnce(){if(!sp.on)return;sp.paused=true;if(G.state==='wave'||G.state==='clear'){for(let i=0;i<12;i++)api.step(1/120)}syncCtl()}

 // ---------- cameras ----------
 const cam={p:new V3(),yaw:0,pit:-.25,fov:70,keys:{},drag:null,tp:new V3(),look:new V3(),sm:new V3(),init:false};
 function setCam(k,click){if(k==='sites'&&sp.cam==='sites'&&click)sp.site++;if(k!=='sites'&&sp.cam!=='sites')sp.site=sp.site|0;
  if(k==='free'&&sp.cam!=='free'){const c=api.camera;cam.p.copy(c.position);const f=new V3(0,0,-1).applyQuaternion(c.quaternion);cam.yaw=Math.atan2(f.x,-f.z);cam.pit=Math.asin(cl(f.y,-1,1))}
  sp.cam=k;cam.init=false;api.camMode=k==='fpv'?0:1;syncCtl()}
 function camTick(dt){if(sp.cam==='chase'||sp.cam==='fpv')return;const c=api.camera,me=api.player;let P=cam.tp,L=cam.look;
  if(sp.cam==='free'){const k=cam.keys,v=(k.ShiftLeft||k.ShiftRight?240:60)*Math.min(dt,.1),f=new V3(Math.sin(cam.yaw)*Math.cos(cam.pit),Math.sin(cam.pit),-Math.cos(cam.yaw)*Math.cos(cam.pit)),r=new V3(Math.cos(cam.yaw),0,Math.sin(cam.yaw));
   if(k.KeyW)cam.p.addScaledVector(f,v);if(k.KeyS)cam.p.addScaledVector(f,-v);if(k.KeyD)cam.p.addScaledVector(r,v);if(k.KeyA)cam.p.addScaledVector(r,-v);if(k.KeyE)cam.p.y+=v;if(k.KeyQ)cam.p.y-=v;
   cam.p.y=Math.max(cam.p.y,gh(cam.p.x,cam.p.z)+2);P=cam.p;L=cam.look.copy(P).add(f)}
  else if(sp.cam==='sites'){const s=SITES[sp.site%SITES.length]||SITES[0],a=performance.now()/9000+sp.site*1.7;P.set(s.x+Math.sin(a)*320,0,s.z-Math.cos(a)*320);P.y=Math.max(gh(P.x,P.z),s.y||0)+110;L.set(s.x,(s.y||gh(s.x,s.z))+20,s.z)}
  else if(sp.cam==='threat'){const t=sp.pilot?.st.tgt&&api.live(sp.pilot.st.tgt)?sp.pilot.st.tgt:Z.urgent?.();
   if(t){const f=new V3().copy(t.v).setY(0);if(f.lengthSq()<1)f.set(0,0,1);f.normalize();P.copy(t.p).addScaledVector(f,-24).add(new V3(0,6,0));const g=gh(P.x,P.z)+4;if(P.y<g)P.y=g;L.copy(t.p).addScaledVector(t.v,.4)}
   else if(me){P.copy(me.p).add(new V3(0,60,140));L.copy(me.p)}}
  if(!cam.init){cam.sm.copy(P);cam.init=true}else cam.sm.lerp(P,sp.cam==='free'?1:1-Math.exp(-dt*4));
  c.position.copy(cam.sm);c.up.set(0,1,0);c.lookAt(L);if(c.fov!==cam.fov){c.fov=cam.fov;c.updateProjectionMatrix()}
  api.sky.position.copy(c.position);const sn=api.sun,o=new V3().subVectors(sn.position,sn.target.position);sn.target.position.set(Math.round(c.position.x/8)*8,gh(c.position.x,c.position.z),Math.round(c.position.z/8)*8);sn.position.copy(sn.target.position).add(o);
  if(me&&me.mesh&&me.dead<=0)me.mesh.visible=true}
 addEventListener('keyup',e=>{cam.keys[e.code]=false});addEventListener('blur',()=>{cam.keys={}});
 addEventListener('pointerdown',e=>{if(sp.on&&sp.cam==='free'&&e.target===api.renderer.domElement||sp.on&&sp.cam==='free'&&e.target.id==='ov')cam.drag={x:e.clientX,y:e.clientY,yaw:cam.yaw,pit:cam.pit}});
 addEventListener('pointermove',e=>{if(!cam.drag)return;cam.yaw=cam.drag.yaw+(e.clientX-cam.drag.x)*.005;cam.pit=cl(cam.drag.pit-(e.clientY-cam.drag.y)*.005,-1.5,1.5)});addEventListener('pointerup',()=>{cam.drag=null});
 // every key is the spectator's while a bot flies (Esc and T still open the menu and the mod panel)
 function key(e){const c=e.code;if(e.type&&e.type!=='keydown')return true;cam.keys[c]=true;
  if(c==='KeyC'){const i=CAMS.findIndex(x=>x[0]===sp.cam);setCam(CAMS[(i+1)%CAMS.length][0])}
  else if(c==='KeyV'){setCam('sites',true)}
  else if(/^Digit[1-4]$/.test(c)||/^Numpad[1-4]$/.test(c))setSpeed(SPEEDS[+c.slice(-1)-1]);
  else if(c==='Space'){setPause(!sp.paused);e.preventDefault?.()}else if(c==='Period'||c==='NumpadDecimal')stepOnce();else if(c==='KeyK')toggleTune();
  return true}

 // ---------- tuning panel ----------
 // values live in the game's own tables (zdata.js KIND, ITEMS, PERK, ZDIFF, HELP, RACK_TIERS; zswdata.js SW), edited in place; TUNE.v keeps
 // what changed (path -> value) and TUNE.d the originals, so Export lists only the changes and Reset puts them back
 const TUNE={v:{},d:{}};
 const ECON=[['cashK','All income ×'],['youK','Pilot kill pay ×'],['helperShare','Helper kill pay ×'],['clearK','Wave-clear bonus ×'],['upkeepK','Upkeep ×'],['upK','Upgrade / refit cost ×'],['repairK','Repair cost ×'],['expK','Expansion cost ×']];
 function rows(){const R=[],di=Z.dfi?Z.dfi():1,D=ZDIFF[di];
  R.push(['Economy (multipliers)',ECON.map(([k,n])=>['econ.'+k,n,1,.05])]);
  R.push([`Difficulty: ${D.n}`,[['wave','Wave size ×',.05],['cash','Money ×',.05],['start','Start cash $',50],['hp','Site HP × (next run)',.05],['shift','Kinds arrive earlier by (waves)',1]].map(([f,n,s])=>[`diff.${di}.${f}`,n,D[f],s])]);
  R.push(['Prices: helpers',Object.keys(ITEMS).filter(k=>ITEMS[k].type==='helper'&&typeof ITEMS[k].price==='number').map(k=>['price.'+k,ITEMS[k].n+' $',ITEMS[k].price,50])]);
  R.push(['Prices: perks (× every level)',Object.keys(PERK).filter(k=>ITEMS[k]&&Array.isArray(PERK[k].cost)).map(k=>['perk.'+k,ITEMS[k].n+' ×',1,.05])]);
  for(const k of Object.keys(KIND))R.push([`Enemy: ${KIND[k].n}`,[['kind.'+k+'.spd','Speed (m/s)',KIND[k].spd,1],['kind.'+k+'.cash','Bounty $',KIND[k].cash,10],['kind.'+k+'.dmg','Site damage',KIND[k].dmg,5],...(k==='boss'?[['boss.stages','Extra stages',0,1]]:[['weight.'+k,'Spawn weight ×',1,.1]])]]);
  R.push(['Helpers: kill chance ×',[['helper.all','Every helper hit ×',1,.05],['help.rack','Drone racks (all tiers)',1,.05],...Object.keys(HELP).filter(k=>ITEMS[k]).map(k=>['help.'+k,ITEMS[k].n,1,.05]),['swarm.pk','Personal swarm passes',1,.05]]]);
  return R}
 const base=p=>p in TUNE.d?TUNE.d[p]:cur(p);
 function cur(p){const[a,b,c]=p.split('.');
  if(a==='econ'||a==='perk'||a==='weight'||a==='help'||a==='swarm'||a==='helper')return TUNE.v[p]??1;if(a==='boss')return TUNE.v[p]??0;
  if(a==='diff')return ZDIFF[+b]?.[c];if(a==='price')return ITEMS[b]?.price;if(a==='kind')return KIND[b]?.[c];return null}
 const hb={};
 function apply(p,v){if(!Number.isFinite(v))return;const[a,b,c]=p.split('.');if(!(p in TUNE.d))TUNE.d[p]=cur(p);
  if(a==='diff'){if(ZDIFF[+b])ZDIFF[+b][c]=c==='shift'?Math.round(v):v}
  else if(a==='price'){if(ITEMS[b])ITEMS[b].price=Math.max(0,Math.round(v))}
  else if(a==='kind'){if(KIND[b])KIND[b][c]=Math.max(0,v)}
  else if(a==='perk'){const P0=hb['perk.'+b]||(hb['perk.'+b]=[...PERK[b].cost]);PERK[b].cost=P0.map(x=>Math.round(x*v/10)*10)}
  else if(a==='help'){if(b==='rack'){const H=hb.rack||(hb.rack=RACK_TIERS.map(t=>t.hit));RACK_TIERS.forEach((t,i)=>t.hit=Math.min(.99,H[i]*v))}
   else if(HELP[b]){const H=hb['h.'+b]||(hb['h.'+b]=HELP[b].lv.map(l=>l.p));HELP[b].lv.forEach((l,i)=>{if(H[i]!=null)l.p=Math.min(.99,H[i]*v)})}}
  else if(a==='swarm'){const H=hb.sw||(hb.sw=SW.mk.map(m=>m.pk));SW.mk.forEach((m,i)=>m.pk=Math.min(.99,H[i]*v))}
  if(v===TUNE.d[p])delete TUNE.v[p];else TUNE.v[p]=v}
 function resetAll(){for(const p of Object.keys(TUNE.d))apply(p,TUNE.d[p]);TUNE.v={}}
 // spawn weights: after the wave is composed, each kind's share is scaled (x0.5 drops about half of them, x2 doubles them)
 function reweigh(out){const W=Object.entries(TUNE.v).filter(([p])=>p.startsWith('weight.'));if(!W.length)return out;let o=out;
  for(const[p,m]of W){const k=p.slice(7),is=q=>q.split(':')[0]===k,keep=[];for(const q of o){if(!is(q)||q==='boss'){keep.push(q);continue}let n=m;while(n>=1){keep.push(q);n--}if(Math.random()<n)keep.push(q)}o=keep}
  return o.length?o:out}
 // extra Mothership stages, added as each one appears
 const bs0=Z.step;Z.step=dt=>{bs0(dt);const x=TUNE.v['boss.stages']|0;if(x)for(const t of TH)if(t.k==='boss'&&!t._tuned&&api.live(t)){t._tuned=1;t.stages=Math.max(1,t.stages+x)}};
 function toggleTune(){const el=$('zsptune');if(el){el.remove();syncCtl();return}const p=document.createElement('aside');p.id='zsptune';document.body.append(p);renderTune();syncCtl()}
 function renderTune(){const p=$('zsptune');if(!p)return;const open=new Set([...p.querySelectorAll('details[open]')].map(d=>d.dataset.g));
  p.innerHTML=`<div style="display:flex;align-items:center;gap:8px"><h2 style="flex:1">Tuning</h2><button class="sm" id="zsptx" aria-label="Close tuning">✕</button></div>
   <p class="note">Changes apply live (prices and enemy numbers on the next purchase or spawn). They last until Reset or a page reload. Flight and warhead physics: the mod panel.</p>
   ${rows().map(([g,R])=>`<details data-g="${esc(g)}" ${open.has(g)?'open':''}><summary>${esc(g)}</summary>${R.map(([path,n,,st])=>{const v=cur(path),ch=path in TUNE.v;
     return`<div class="tr ${ch?'chg':''}"><label for="t_${path}">${esc(n)}</label><input type="number" id="t_${path}" data-tp="${path}" step="${st}" value="${+(+v).toFixed(4)}"><button data-trs="${path}" title="Reset" aria-label="Reset ${esc(n)}">↺</button></div>`}).join('')}</details>`).join('')}
   <div class="mp"><button class="sm" id="zsptexp">Export JSON</button><button class="sm" id="zsptimp">Import</button><button class="sm" id="zsptrst">Reset all</button><button class="sm" id="zsptmod">Mod panel…</button></div>
   <textarea id="zsptio" placeholder="Export puts the changes here as JSON; paste JSON and press Import to apply it." aria-label="Tuning JSON"></textarea><p class="note" id="zsptmsg"></p>`;
  $('zsptx').onclick=toggleTune;
  for(const i of p.querySelectorAll('[data-tp]'))i.onchange=()=>{apply(i.dataset.tp,+i.value);renderTune()};
  for(const b of p.querySelectorAll('[data-trs]'))b.onclick=()=>{const q=b.dataset.trs;apply(q,base(q));delete TUNE.v[q];renderTune()};
  $('zsptexp').onclick=()=>{const t=JSON.stringify(TUNE.v,null,1);$('zsptio').value=t;try{navigator.clipboard?.writeText(t).then(()=>msg('Copied to the clipboard'),()=>msg('Select and copy the text'))}catch(e){msg('Select and copy the text')}};
  $('zsptimp').onclick=()=>{try{const o=JSON.parse($('zsptio').value);if(!o||typeof o!=='object')throw 0;for(const[k,v]of Object.entries(o))if(/^(econ|diff|price|perk|kind|weight|help|helper|swarm|boss)\./.test(k))apply(k,+v);renderTune();msg('Imported')}catch(e){msg('That is not tuning JSON')}};
  $('zsptrst').onclick=()=>{resetAll();renderTune();msg('Everything back to default')};$('zsptmod').onclick=()=>$('modbtn')?.click()}
 const msg=t=>{const m=$('zsptmsg');if(m)m.textContent=t};

 // ---------- the report (instead of the end screen) ----------
 function over(){if(sp.hit){hit(...sp.hit);sp.hit=null}if(sp.bench){sp.done=true;return}hideCap();for(const id of['zspbar','zspctl','zsptune'])if($(id))$(id).hidden=true;const st=sp.stats;logMoney();const won=G.cpRes==='won';
  const cause=st.lastHit?`${KIND[st.lastHit.k]?.n||st.lastHit.k} hit the ${String(st.lastHit.site).toLowerCase()} (−${st.lastHit.dmg}, wave ${st.lastHit.w})`:won?'none: sector held':'—';
  const K=Object.entries(st.kills).sort((a,b)=>b[1].n-a[1].n),kmax=Math.max(1,...K.map(x=>x[1].n)),tot=K.reduce((a,x)=>a+x[1].n,0);
  const tuned=Object.keys(TUNE.v).length?`<p class="zhint">Tuned: ${esc(Object.entries(TUNE.v).map(([k,v])=>k+' '+v).join(', '))}</p>`:'';
  $('zover').innerHTML=`<div class="zpanel zgo zsprep"><h2>${won?'Sector held':'Bot report'}</h2><div class="zbig">WAVE ${G.wave}</div>
   <p class="zhint">${esc(st.lv)} · ${esc(st.d)} · ${esc(st.doc)} doctrine${st.kit.length?' · kit '+esc(st.kit.map(k=>KIT[k]?.n||k).join(', ')):''}${st.sec?' · '+esc(st.sec):' · quick defence'}</p>
   <div class="zstats"><span>Wave reached</span><b>${G.wave}</b><span>Cause of death</span><b>${esc(cause)}</b><span>Intercepts</span><b>${tot}</b><span>Money earned</span><b>${money(G.earned)}</b>
    <span>Interceptors used</span><b>${api.spent|0} (bursts ${st.deaths.det}, crashes ${st.deaths.crash}, flat ${st.deaths.bat})</b><span>Detonations</span><b>${st.bursts} · ${(st.kills.pilot?.n|0)} pilot kills</b><span>Time in the air</span><b>${Math.floor(st.simT/60)}:${String(Math.round(st.simT%60)).padStart(2,'0')}</b></div>
   <div class="cols"><div><h3>Money over time</h3>${chart(st)}</div><div><h3>Kills by source</h3><div class="bars">${K.map(([s,o])=>`<span>${esc(s)}</span><i class="${s==='pilot'||s==='airstrike'?'p':''}" style="width:${(100*o.n/kmax).toFixed(1)}%" title="${esc(Object.entries(o.k).map(([k,n])=>n+'× '+(KIND[k]?.n||k)).join(', '))}"></i><b>${o.n}</b>`).join('')||'<span>none</span>'}</div></div></div>
   <h3>Purchases</h3><div class="buys"><table><tr><th>Wave</th><th>Cost</th><th>Why</th></tr>${st.buys.map(b=>`<tr><td class="n">${b.w}</td><td class="n">${b.cost?money(b.cost):''}</td><td>${esc(b.why)}</td></tr>`).join('')||'<tr><td colspan="3">nothing bought</td></tr>'}</table></div>
   ${tuned}<div class="btns"><button class="go" id="zspagain">Watch again</button><button id="zspexport">Export JSON</button><button id="zmenu">Menu</button></div></div>`;
  $('zover').hidden=false;$('zspagain').onclick=()=>{$('zover').hidden=true;start(sp.o)};$('zmenu').onclick=()=>{$('zover').hidden=true;api.startDemo()};
  $('zspexport').onclick=()=>{const t=JSON.stringify(report(),null,1);try{navigator.clipboard?.writeText(t)}catch(e){}const b=new Blob([t],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`bot-${st.lv.replace(/\s/g,'')}-${st.d}-wave${G.wave}.json`;a.click()};
  Z.syncMode?.();setTimeout(()=>$('zspagain')?.focus(),50)}
 function report(){const st=sp.stats;return{level:st.lv,difficulty:st.d,doctrine:st.doc,kit:st.kit,sector:st.sec||null,wave:G.wave,won:G.cpRes==='won',cause:st.lastHit,earned:Math.round(G.earned),spent:api.spent|0,bursts:st.bursts,deaths:st.deaths,simT:Math.round(st.simT),kills:st.kills,money:st.money,buys:st.buys,damage:st.dmg,waves:st.waves,tuning:TUNE.v}}
 // money over time: the purse (amber) and money earned so far (cyan) against time in the air, a tick per wave
 function chart(st){const M=st.money,W=520,H=200,pad=34;if(M.length<2)return'<p class="zhint">Not enough data.</p>';
  const tmax=Math.max(1,...M.map(m=>m.t)),ymax=Math.max(1,...M.map(m=>Math.max(m.cash,m.earned))),X=t=>pad+(W-pad-8)*t/tmax,Y=v=>H-20-(H-34)*v/ymax;
  const line=k=>M.map((m,i)=>`${i?'L':'M'}${X(m.t).toFixed(1)},${Y(m[k]).toFixed(1)}`).join('');
  const ticks=st.waves.map(w=>{const m=M.find(q=>q.w===w.w&&q.st==='wave');return m?`<line x1="${X(m.t)}" x2="${X(m.t)}" y1="12" y2="${H-20}" stroke="rgba(255,255,255,.08)"/>${w.w%5===0||w.w===1?`<text x="${X(m.t)}" y="${H-6}" fill="#8a93a6" font-size="10" text-anchor="middle">w${w.w}</text>`:''}`:''}).join('');
  return`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Money over time">${ticks}<text x="4" y="14" fill="#8a93a6" font-size="10">${money(ymax)}</text><text x="4" y="${H-22}" fill="#8a93a6" font-size="10">$0</text>
   <path d="${line('earned')}" fill="none" stroke="#5fe3ff" stroke-width="2"/><path d="${line('cash')}" fill="none" stroke="#ffc640" stroke-width="2"/>
   <text x="${W-8}" y="14" fill="#5fe3ff" font-size="11" text-anchor="end">earned</text><text x="${W-8}" y="28" fill="#ffc640" font-size="11" text-anchor="end">purse</text></svg>`}

 // ---------- headless benchmark (tools/zombies-bench.mjs --real) and tests ----------
 E.spec={get on(){return sp.on},sp,start,stop,report,TUNE,apply,resetAll,setCam,setSpeed,setPause,stepOnce,toggleTune,
  bench:{start:(lv,d,o={})=>start({lv,d,doc:o.doc||'std',kit:o.kit||[],sec:o.sec||'',bench:true}),
   shop(){const r=brain.shopNow(sp.P,E);for(const s of r)if(s.spent>0||s.what==='chain'||s.what==='sell')sp.stats.buys.push({w:G.wave+1,what:s.what,k:s.k||'',why:s.why,cost:s.spent});return r.length},
   wave(max=2400){let n=0;while(G.state==='wave'&&n++<max)E.sim(.5);if(G.state==='clear')E.sim(4);return G.state}}};
 return E.spec}
