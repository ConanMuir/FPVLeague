// Zombies boss practice: a one-on-one run against any boss you have beaten (and the free baseline boss, the Mothership), from the Enemies screen or the offer
// on the end screen the first time a boss is added to the codex (zcodex.js). It is the real game on the plain Quick defence map at the current difficulty, cut down:
//   the lead-in    a few seconds on the mat with a radio line saying what is coming (the briefing's line, zbrief.js), then the boss appears
//   the scenario   each boss's table entry carries a `practice` descriptor (zbosses.js documents it; the Mothership's is BASE_PRACTICE): the wave it plays at, how far out it
//                  appears, the kit placed on the map, your loadout, a stream of ordinary tracks, state to seed and timers. By default it is the boss alone against your craft and a
//                  standard kit (DEF); the purse starts at exactly what the placed kit and loadout cost and nothing is earned, so it only pays for the warning actions
//   the end        the boss is destroyed (the time to the kill is the result), it withdraws or gets away, every site falls, or it shoots down `lives` of your interceptors:
//                  a practice end screen (Retry, Back to Enemies) with the time and the best time for this boss on this difficulty
// Nothing else is written. A practice run pays no cash (the doctrine's income factor is zero, the bosses' bounty and trophy are skipped), counts nothing toward the codex, the leaderboard,
// the goals, the trophies, the scars or the boss records (zbosses.js bump / recAdd and the codex's writes() look at Z.practice.on), takes no doctrine or kit from your loadout, leaves the
// Little Buddy at home, and a debug-marked run does not save its best time (zdebug.js PROT). The first-run guide, co-op, the bots and the spectator never get it.
// The pure side (the default scenario, the cost of a kit, the save and its cleaning) is zpracdata.js. Save: S.zprac = {v:1, b:{id:{t:[best seconds per difficulty, 0 = none], w:wins}}}.
// Hooks: zcodex.js draws the Practice buttons (Z.practice.btn) and the end-of-run offer (Z.practice.offer); zbrief.js asks Z.practice.info() for the radio line and the card;
// zombies.js asks Z.inbTxt for the HUD's right-hand label; this file wraps Z.start, Z.stop, Z.step, Z.cpOver, Z.waveTxt, Z.meta.load and Z.meta.k, and ctx.shoot of the boss registry.
import {ITEMS,PERK,KIND,ZDIFF} from './zdata.js';
import {BOSSES,BASE_PRACTICE} from './zbosses.js';
import {KNOWN,isUnlocked} from './zcodex.js';
import {DEF,merge,cost,cleanPrac,fmtT} from './zpracdata.js';
const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]),rnd=(a,b)=>a+Math.random()*(b-a);
const pickW=W=>{let t=0;for(const k in W)t+=W[k];let r=Math.random()*t;for(const k in W){r-=W[k];if(r<=0)return k}return Object.keys(W)[0]};
/* a boss's descriptor (the Mothership's is BASE_PRACTICE); null for an id that is not a boss (a minor kind, a brood) */
const descOf=id=>id==='boss'?BASE_PRACTICE.boss:BOSSES[id]&&!BOSSES[id].minor&&!BOSSES[id].child?BOSSES[id].practice||{}:null;
/* the scenario of boss id: its descriptor over the defaults, or null */
const scenario=id=>{const d=descOf(id);return d?merge(d):null};
const GONE={escaped:'It escaped',withdrew:'It withdrew',impacted:'It reached its target',gone:'It left the field'};
const BLOCK={coop:['Practice: not in co-op','Practice is a solo mode: it is not available in a co-op game.'],run:['Practice: after this run','Finish or leave your run first: a practice run starts a new game.'],guide:['Practice: after the guide','Finish the first-wave guide first.']};
export function initPractice(api,G,Z){
 const {S,save,TH,feed,banner}=api,$=id=>document.getElementById(id),B=Z.bosses,C=B.ctx,BO=B.BOSSES,def=Z.def,pk=Z.pk,SITE_C={x:0,z:1950};
 let run=null,armed=null,starting=false,bdWas;
 const ids=()=>[...KNOWN,...Object.keys(BO).filter(k=>!KNOWN.includes(k)&&!BO[k].minor&&!BO[k].child)];
 const rd=()=>cleanPrac(S.zprac,ids()),put=c=>{S.zprac=c;save()};
 const nameOf=id=>id==='boss'?KIND.boss.n:BO[id]?.n||id,colOf=id=>BO[id]?.col||'#ff9a3c';
 const marked=()=>!!Z.dbg?.marked;
 /* why a boss cannot be practised now: '' it can; 'client', 'bots', 'none' and 'locked' also mean the button is not shown at all */
 const block=id=>{if(Z.isClient?.())return'client';if(Z.codex.all())return'bots';if(!scenario(id))return'none';if(!isUnlocked(Z.codex.c,id))return'locked';
  if(Z.online)return'coop';if(Z.onboard?.on)return'guide';if(G.on&&G.state!=='over'&&!api.demo)return'run';return''};

 const P=Z.practice={DEF,scenario,cost,cleanPrac,fmtT,block,
  get on(){return!!run},get run(){return run},
  can:id=>!block(id),
  /* best time on a difficulty (default: the current one), 0 = none */
  best:(id,d=Z.dfi())=>rd().b[id]?.t[d]||0,get rec(){return rd()},
  /* what the briefing says: {id, name, col, radio} while a practice run is on */
  info:()=>run?{id:run.id,name:run.name,col:run.col,radio:run.o.radio,kit:run.o.kit,perks:run.o.perks}:null,
  /* the Practice button of a boss card on the Enemies screen; '' where it is not for this player (a co-op client, the bots, a boss not beaten yet) */
  btn(id){const b=block(id);if(['client','bots','none','locked'].includes(b))return'';const t=P.best(id);
   return`<button class="sm zcdxpr" data-prac="${id}" ${b?'disabled':''} title="${esc(b?BLOCK[b][1]:'One-on-one against this boss on the Quick defence map: nothing is paid or recorded but your best time')}">${b?BLOCK[b][0]:'Practice'}</button>${t?`<small class="zcdxpt" title="Your best time to the kill on ${ZDIFF[Z.dfi()].n}">best ${fmtT(t)}</small>`:''}`},
  /* the end-of-run offer for bosses just added to the codex */
  offer(list){const L=list.filter(id=>!block(id));if(!L.length)return'';
   return L.map(id=>`<button class="sm zcdxpr" data-prac="${id}">Practice it now${L.length>1?`: ${esc(nameOf(id))}`:''}</button>`).join(' ')},
  start(id){if(block(id))return false;armed=id;try{Z.codex.close();$('zover').hidden=true;banner('');api.startMatch()}finally{armed=null}return!!run}};
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-prac]');if(b&&!b.disabled)P.start(b.dataset.prac)});

 // ---------- the run ----------
 const make=id=>{const o=scenario(id);return{id,o,name:nameOf(id),col:colOf(id),wave:o.wave,lead:o.lead,lives:o.lives,shot:0,t:null,t0:0,tt:0,res:'',fin:0,why:'',sn:0,spawned:false,newBest:false,prev:0,dbg:false,cash:0}};
 const bdBack=()=>{if(bdWas!==undefined&&Z.bd){Z.bd.force=bdWas;bdWas=undefined}};
 /* a practice run takes the standard doctrine and no kit (the base is the same for everyone) and leaves the Little Buddy at home: they are read as the run starts */
 const ml0=Z.meta.load,STD={doc:'std',kit:[]};Z.meta.load=()=>starting?STD:ml0();
 const mk0=Z.meta.k;Z.meta.k=(key,d=1)=>run&&key==='cashK'?0:mk0(key,d);  /* nothing is earned */
 const s0=Z.start;
 Z.start=()=>{const id=armed;armed=null;run=id?make(id):null;$('hud').classList.toggle('zprac',!!run);  /* zprac: the top bar makes room for the longer labels (zcodex.css) */
  if(run&&Z.bd){bdWas=Z.bd.force;Z.bd.force={...Z.bd.read(),has:false}}else bdBack();
  starting=!!run;try{s0()}finally{starting=false}
  if(run)begin()};
 const x0=Z.stop;Z.stop=()=>{x0();run=null;armed=null;bdBack();$('hud').classList.remove('zprac')};
 function begin(){const R=run,o=R.o;G.wave=R.wave-1;
  for(const s of Z.sw?.SWS?.values()||[])s.w=-1;  /* the swarm deploys once a wave, and a retry plays the same wave number again: it must not think this one has been deployed */
  for(const[type,name]of o.kit){const j=def.SLOTS.findIndex(s=>s.n.toLowerCase()===String(name).toLowerCase());if(j<0||!ITEMS[type]||!def.slotFree(j,type))continue;const h=def.add(type,j);h.spent=ITEMS[type].price}
  for(const[k,l]of Object.entries(o.perks))if(PERK[k])G.perks[k]=l;
  pk.apply();R.cash=G.cash=cost(o);
  o.setup?.(C,R);
  if(o.stream){R.sn=0;for(let i=0;i<3;i++)G.wq.push({k:pickW(o.stream.kinds),at:i*1.4,brg:rnd(-1,1)})}  /* a few tracks already on their way */
  G.wq.push({k:'shahed',at:1e9,brg:0});  /* the wave stays open while the practice runs: an entry far in the future keeps the director from clearing it, and the bosses that outlive a wave (the Undertaker, the Puppeteer) from withdrawing from an empty queue */
  G.next={list:[],brgs:[0],q:G.wq,wx:{id:'clear'}};  /* clear skies, and the queue is the one the stream fills */
  Z.continue();
  for(const el of [...($('feed')?.children||[])])if(/^Inbound:/.test(el.textContent))el.remove();  /* the wave start's own "WAVE 12" banner and "Inbound:" line are not for a practice run */
  banner('');Z.an?.say('PRACTICE',R.name.toUpperCase(),R.col,3);
  feed(`<span class="cg">Practice: ${esc(R.name)}</span> appears in ${R.lead} s · no pay, no record`)}
 /* a steady stream: a track due now, ahead of the entry that holds the wave open, whenever fewer than `cap` ordinary tracks are in the air */
 function stream(dt){const S0=run.o.stream;if(!S0||(run.sn-=dt)>0)return;run.sn=rnd(S0.gap[0],S0.gap[1]);
  let n=0;for(const t of TH)if(api.live(t)&&!BO[t.k]&&t.k!=='boss')n++;if(n>=S0.cap)return;G.wq.splice(Math.max(0,G.wq.length-1),0,{k:pickW(S0.kinds),at:G.wt,brg:rnd(-1,1)})}
 function appear(){const R=run,o=R.o,opt=o.spawn?.(C,R)||{},b=rnd(-.6,.6);R.spawned=true;R.t0=G.wt;
  R.t=R.id==='boss'?Z.make('boss',SITE_C.x+Math.sin(b)*o.R,SITE_C.z-Math.cos(b)*o.R):B.spawn(R.id,{R:o.R,brg:b,...opt});  /* the Mothership is not in the registry: the director's own spawn, from here */
  if(!R.t){R.res='gone';R.why='gone';R.fin=1}}
 /* the fight is over: 'won' (every body down), 'gone' (it left, withdrew or reached its target), '' while it goes on */
 function look(){const R=run;if(R.id==='boss'){const t=R.t;return t.paid?'won':t.st==='dead'||!TH.includes(t)?'gone':''}
  const e=R.t.bs?.enc;if(!e||!e.over)return'';  /* the encounter the boss opened (the registry drops a finished one from its list within the step) */
  if(e.won)return'won';R.why=e.list.map(u=>u.bs?.gone).find(Boolean)||'gone';return'gone'}
 function record(){const R=run,c=rd(),d=Z.dfi(),e=c.b[R.id]||(c.b[R.id]={t:ZDIFF.map(()=>0),w:0});R.prev=e.t[d];R.newBest=!R.prev||R.tt<R.prev;e.w++;if(R.newBest)e.t[d]=Math.max(.1,Math.round(R.tt*10)/10);
  if(marked())R.dbg=true;else put(c)}  /* a debug-marked run keeps nothing (zdebug.js restores it anyway) */
 const sp0=Z.step;
 Z.step=dt=>{sp0(dt);if(!run||!G.on||api.demo||G.state!=='wave'||Z.mirror)return;const R=run,o=R.o;
  for(let i=G.pops.length-1;i>=0;i--)if(/^\+\$/.test(G.pops[i].txt))G.pops.splice(i,1);  /* no money flies */
  if(R.res){if((R.fin-=dt)<=0)Z.gameOver();return}
  stream(dt);if(!R.spawned&&G.wt>=R.lead)appear();if(!R.spawned||R.res)return;
  if(R.t&&R.t.bs&&o.step)try{o.step(C,R.t,dt,R)}catch(e){console.warn('practice step',e)}
  const r=look();if(!r)return;R.tt=G.wt-R.t0;R.res=r;R.fin=r==='won'?2.4:1.8;if(r==='won')record()};
 /* lives: the boss shooting down your interceptor (the Ace's missile, the Mirror's burst, a Hush pass); a crash or your own burst costs nothing */
 const sh0=C.shoot;C.shoot=(why,Pl,done)=>{const r=sh0(why,Pl,done);if(r&&run&&!run.res&&G.state==='wave'&&(!Pl||Pl===api.player)){run.shot++;feed(`<span class="co">Practice: ${run.shot} of ${run.lives} interceptors lost to ${esc(run.name)}</span>`);
   if(run.shot>=run.lives){run.res='craft';run.fin=1.6;run.tt=G.wt-run.t0}}return r};

 // ---------- the HUD ----------
 const wt0=Z.waveTxt;Z.waveTxt=()=>run?`PRACTICE · ${run.name.toUpperCase()}`:wt0?.();
 /* the right-hand label of the top bar: the count-down to the boss, then the clock and the interceptors left */
 Z.inbTxt=()=>{const R=run;if(!R)return undefined;if(G.state!=='wave')return'';
  if(R.res)return R.res==='won'?`DESTROYED · ${fmtT(R.tt)}`:'PRACTICE OVER';
  if(!R.spawned)return`BOSS IN ${Math.max(0,Math.ceil(R.lead-G.wt))} s`;
  return`${fmtT(G.wt-R.t0)} · LIVES ${Math.max(0,R.lives-R.shot)}/${R.lives}`};

 // ---------- the end screen ----------
 const co0=Z.cpOver;
 Z.cpOver=()=>{if(!run)return co0?co0():false;const R=run;if(!R.res)R.res='sites';if(!R.tt&&R.spawned)R.tt=G.wt-R.t0;banner('');
  const won=R.res==='won',d=Z.dfi(),D=ZDIFF[d],best=P.best(R.id,d),I=Z.integrity(),pc=Math.round(I.max?I.hp/I.max*100:0);
  const title={won:'Practice complete',gone:`${R.name} ${{withdrew:'withdrew',impacted:'reached its target'}[R.why]||'got away'}`,sites:'Defense collapsed',craft:'Out of interceptors'}[R.res],
   what={won:'Boss destroyed',gone:GONE[R.why]||GONE.gone,sites:'Every site fell',craft:`${R.shot} of your interceptors shot down`}[R.res];
  $('zover').innerHTML=`<div class="zpanel zgo zprac ${won?'won':'lost'}" style="--bc:${R.col}"><h2>${esc(title)}</h2><div class="zbig">${esc(R.name.toUpperCase())}</div>
   <div class="zstats"><span>Result</span><b>${esc(what)}</b><span>${won?'Time to the kill':'Time on the field'}</span><b>${R.spawned?fmtT(R.tt):'it never appeared'}</b>
   <span>Best on ${D.n}</span><b>${won&&R.newBest&&!R.dbg?`NEW BEST · ${fmtT(R.tt)}${R.prev?` (was ${fmtT(R.prev)})`:''}`:best?fmtT(best):'none yet'}</b><span>Interceptors lost to it</span><b>${R.shot} of ${R.lives}</b><span>Integrity</span><b>${pc}%</b></div>
   <p class="zhint">A practice run pays nothing and counts toward nothing: the only thing it saves is your best time.${R.dbg||marked()?' <b class="co">Debug run</b>: not even that was saved.':''}</p>
   <div class="btns"><button class="go" id="zpracretry">Retry</button><button id="zpracback">Back to Enemies</button></div></div>`;
  $('zover').hidden=false;
  $('zpracretry').onclick=()=>P.start(R.id);
  $('zpracback').onclick=()=>{$('zover').hidden=true;api.startDemo();Z.codex.open()};
  Z.syncMode?.();setTimeout(()=>$('zpracretry')?.focus(),50);return true};
 return P}
