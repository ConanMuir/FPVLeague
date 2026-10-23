// Zombies Endless: once the campaign's capstone (the Launch Complex) is held, any held sector can be played with no objective. It is the
// ordinary run on that sector (its modifiers, the doctrine, kit and relic of the map) that keeps going, and from wave RAMP (20, the capstone's
// objective, the longest a campaign sector asks) the waves climb past everything the campaign tops out at:
//   tracks     each wave is bigger than the usual curve by 2.5% a wave past RAMP (the plan stops growing at CAP_TRACKS = 600 tracks, every FPV of
//              a swarm counting: the sim and the draw have a budget, so past that the climb is carried by the rest)
//   speed      the slow drones fly faster, 1% a wave on top of the usual 12% (up to +60%)
//   armour     1.5% a wave of the Shahed points arrive as armored heavies instead (up to 60%): proximity bursts only damage them
//   damage     every hit on a site is 1% a wave heavier (no limit)
//   bosses     a boss every 10 waves up to wave 20, every 5 up to 50, every 3 after it; two at a time from RAMP + 30, three from RAMP + 60
//              (extra boss waves are a quarter lighter in everything else). They are drawn from the boss codex's pool (zcodex.js): the bosses you have unlocked and allowed
// Milestone every 10 waves: the wave is cleared and every site is repaired by a quarter, with a purse of $800 x (wave / 10).
// The sector's scars (zscars.js) carry in from the campaign, grow with every wave and are saved at every wave clear and at the end,
// into the same place the campaign keeps them (S.zcamp.sc), so the next run on that sector starts on the same ground.
// The run is an ordinary campaign run that never ends in a win and never costs the campaign anything: a loss does not raise the pressure
// next door. It ends on the Endless screen, and the wave reached goes on the Endless table, S.zend = {v:1, runs: [{d, w, sec, ms, t}] (the best 10),
// ms: the highest milestone, sec: the sector last played}. Every read goes through cleanEnd.
// Hooks: zcampaign.js starts it (Z.cp.start(id, force, true)) and shows Z.endless.btn on the sector briefing; this file wraps Z.cpCompose (the
// escalation), Z.cpHTML, Z.cpOver, Z.waveTxt, Z.dmgK, Z.step, Z.syncMode and the enemies' dress. The bot bench plays it with --endless (off by default).
import {ZDIFF,KIND} from './zdata.js';
import {SEC} from './zcampaign.js';
import {money} from '../../engine/hot.js';
export const RAMP=20,CAP_TRACKS=600,MS_EVERY=10,MS_REPAIR=.25,MAXRUNS=10;
export const climb=w=>Math.max(0,(w|0)-RAMP);
export const countK=w=>1+.025*climb(w);
export const speedK=w=>Math.min(1.6,1+.01*climb(w));
export const armorK=w=>Math.min(.6,.015*climb(w));
export const dmgK=w=>1+.01*climb(w);
export const bossEvery=w=>w<=RAMP?10:w<=50?5:3;
export const bossCount=w=>1+(climb(w)>=30?1:0)+(climb(w)>=60?1:0);
export const bossDue=w=>w>0&&(w%10===0||w>RAMP&&w%bossEvery(w)===0);
export const milestone=w=>w>0&&w%MS_EVERY===0;
export const msBonus=w=>Math.round(800*w/MS_EVERY);
const int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b?v:0;
/* any value in, a valid Endless record out (a hand-edited or foreign save becomes an empty one) */
export function cleanEnd(e){const o={v:1,runs:[],ms:0,sec:'gate'};if(!e||typeof e!=='object'||Array.isArray(e)||e.v!==1)return o;
 for(const r of(Array.isArray(e.runs)?e.runs:[]).slice(0,60)){if(!r||typeof r!=='object')continue;const d=r.d,w=r.w;if(!Number.isInteger(d)||d<0||d>=ZDIFF.length||!Number.isInteger(w)||w<1||w>9999)continue;
  o.runs.push({d,w,sec:typeof r.sec==='string'&&Object.hasOwn(SEC,r.sec)?r.sec:'gate',ms:int(r.ms,0,999),t:Number.isFinite(r.t)?+r.t:0})}
 o.runs.sort((a,b)=>b.w-a.w||a.t-b.t);o.runs.length=Math.min(o.runs.length,MAXRUNS);o.ms=int(e.ms,0,9999);if(typeof e.sec==='string'&&Object.hasOwn(SEC,e.sec))o.sec=e.sec;return o}
const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);
export const label=r=>`Endless, wave ${r.w} · ${SEC[r.sec]?.n||'?'} · ${ZDIFF[r.d]?.n||'?'}`;

export function initEndless(api,G,Z){
 const {S,save,SITES,feed,banner}=api,$=id=>document.getElementById(id);
 const E=Z.endless={RAMP,CAP_TRACKS,climb,countK,speedK,armorK,dmgK,bossEvery,bossCount,bossDue,milestone,msBonus,cleanEnd,label};
 const rd=()=>S.zend=cleanEnd(S.zend);
 const run=()=>Z.cp?.run?.endless?Z.cp.run:null,on=()=>!!run();
 E.on=on;E.due=w=>on()&&bossDue(w);E.runs=()=>rd().runs;E.state=()=>rd();
 const unlocked=()=>{try{return Z.cp.C().done===1}catch(e){return false}};
 E.unlocked=unlocked;
 /* where the button starts it: the sector last played if it is held, else the capstone */
 E.sector=()=>{const c=Z.cp.C(),s=rd().sec;return c.held.includes(s)?s:c.held.includes('gate')?'gate':c.held[0]||'gate'};
 E.start=(id,force)=>{const c=Z.cp.C(),sid=typeof id==='string'&&Object.hasOwn(SEC,id)?id:E.sector();
  if(!force&&(!unlocked()||!c.held.includes(sid)||Z.online||Z.isClient?.()))return false;
  const e=rd();e.sec=sid;save();return Z.cp.start(sid,true,true)};

 /* ---------- the climb ---------- */
 const isB=k=>{const K=KIND[String(k).split(':')[0]];return!!K&&(K.armor==='boss'||!!K.bossy)};
 /* n bosses for wave w, drawn from the boss codex's pool (zcodex.js Z.codex.pool(w): the bosses you have unlocked and allowed that may come on that wave), none twice while the pool lasts.
    With every boss switched off the codex gives its heavy raid instead (Z.codex.plan), as it does in the Quick defence. The codex also plans the Endless run's own boss waves (the
    Quick defence rotation: zcodex.js leaves Endless out of the campaign's set pieces), so this only tops them up to the count of the climb. */
 function bosses(w,n,taken=[]){const C=Z.codex,pool=()=>C?.pool?C.pool(w):['boss'],all=pool(),p=all.filter(k=>!taken.includes(k));  /* taken: the bosses the plan already holds, so a wave never gets the same one twice while the pool has another */
  if(!all.length){const t=['boss'];C.plan(t,w);return t.filter(k=>!isB(k))}
  const out=[];while(out.length<n){if(!p.length)p.push(...all);out.push(p.splice(Math.random()*p.length|0,1)[0])}return out}
 function escalate(out,w){if(climb(w)<=0)return out;
  /* armour: three Shaheds out, one armored heavy in */
  const n=Math.round(out.filter(k=>k==='shahed').length*armorK(w)/3)*3;
  if(n>0){let c=0;for(let i=out.length-1;i>=0&&c<n;i--)if(out[i]==='shahed'){out.splice(i,1);c++}for(let i=0;i<c;i+=3)out.push('heavy')}
  /* bosses: the due waves get their count; a wave that was not a boss wave gives up a quarter of the rest */
  if(bossDue(w)){const have=out.filter(isB).length,want=bossCount(w);
   if(want>have){if(!have)for(let i=out.length-1;i>=0;i--)if(!isB(out[i])&&!/^(ballistic|hyper|icbm)$/.test(out[i])&&Math.random()<.25)out.splice(i,1);
    out.push(...bosses(w,want-have,out))}}
  /* more of everything: each entry but the bosses is copied by the wave's extra share, up to the cap */
  const f=countK(w)-1;let room=CAP_TRACKS-units(out);
  if(f>0&&room>0){const add=[];for(const e of out)if(!isB(e)){const c=Math.floor(f)+(Math.random()<f%1?1:0);for(let j=0;j<c;j++)add.push(e)}
   for(let i=add.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[add[i],add[j]]=[add[j],add[i]]}  /* a random share when the cap cuts the copies short */
   for(const e of add){const u=units(e);if(u>room)continue;room-=u;out.push(e)}}
  return out}
 const units=e=>(Array.isArray(e)?e:[e]).reduce((a,k)=>{const[n,c]=String(k).split(':');return a+(KIND[n]&&KIND[n].armor!=='boss'?+c||1:0)},0);  /* tracks in a plan: every FPV of a swarm counts */
 const cc0=Z.cpCompose;Z.cpCompose=(out,w)=>{out=cc0?cc0(out,w):out;return on()?escalate(out,w):out};
 /* the slow drones fly faster (right after a track is made: its speed, cruise speed and velocity together) */
 const dr0=Z.en.dress;Z.en.dress=t=>{dr0(t);if(on()&&climb(G.wave)>0&&t.spd<150&&!isB(t.k)){const m=speedK(G.wave);t.spd*=m;t.cs*=m;t.v.multiplyScalar(m)}};
 const dk0=Z.dmgK;Z.dmgK=(s,t)=>(dk0?dk0(s,t):1)*(on()?dmgK(G.wave):1);

 /* ---------- the briefing says what the climb is (zbrief.js) ---------- */
 Z.brief?.add(D=>{if(!on())return null;const w=D.w;if(climb(w)<=0)return`Endless: the climb starts after wave ${RAMP}`;
  const nm=Math.ceil((w+1)/MS_EVERY)*MS_EVERY,p=v=>Math.round(v*100);
  return[`Endless +${p(countK(w)-1)}% tracks · +${p(speedK(w)-1)}% speed · ${p(armorK(w))}% of the Shaheds armored · sites take +${p(dmgK(w)-1)}%`,`boss every ${bossEvery(w)} waves${bossCount(w)>1?` (${bossCount(w)} at a time)`:''} · milestone wave ${milestone(w)?w:nm}: +${money(msBonus(milestone(w)?w:nm))} and a repair`]});

 /* ---------- the run: banner text, the strip, the milestones ---------- */
 const wt0=Z.waveTxt;Z.waveTxt=()=>on()?G.state==='base'?`WAVE ${G.wave+1} NEXT ∞`:`WAVE ${G.wave} ∞`:wt0?.();
 const hh0=Z.cpHTML;Z.cpHTML=()=>{const h=hh0?.()||'';if(!on())return h;
  return h.replace(/<span class="zcpo">[\s\S]*?<\/span>/,`<span class="zcpo">ENDLESS ∞ · <em>${climb(G.wave+1)>0?`climbing, wave ${G.wave+1}`:`the climb starts after wave ${RAMP}`}</em> · best wave ${rd().runs[0]?.w||0}</span>`)};
 let done0=0;  /* the last wave whose clear was looked at (a wave with nothing left in it is cleared on its first tick, so the state change itself can be missed) */
 const s0=Z.start;Z.start=()=>{s0();G.end={ms:[],rec:0};done0=0;if(on())feed(`<span class="cg">Endless</span>: no objective. The climb starts after wave ${RAMP}; a milestone every ${MS_EVERY} waves.`)};
 const sp0=Z.step;Z.step=dt=>{sp0(dt);if(!on()||Z.mirror||api.demo||G.state!=='clear'||G.wave<1||G.wave===done0)return;done0=G.wave;cleared()};
 function cleared(){const w=G.wave;if(!milestone(w))return;const b=msBonus(w);G.cash+=b;G.earned+=b;
  for(const s of SITES)if(s.hp>0)s.hp=Math.min(s.max,s.hp+Math.round(s.max*MS_REPAIR));
  (G.end||(G.end={ms:[],rec:0})).ms.push(w);const e=rd();if(w>e.ms){e.ms=w;save()}
  banner(`MILESTONE · WAVE ${w}`,'cg',2.6);feed(`<span class="cg">Milestone: wave ${w}</span> +${money(b)} and every site repaired by ${Math.round(MS_REPAIR*100)}%`);Z.an?.say?.('MILESTONE',`WAVE ${w}`,'#ffc640',2)}

 /* ---------- the leaderboard: the Endless table, on the start menu and on the end screen ---------- */
 function record(w){const r=run(),e=rd();if(!r||!(w>0))return null;const en=G.end||(G.end={ms:[],rec:0});if(en.rec)return null;en.rec=1;
  const x={d:Z.dfi?.()??1,w,sec:r.id,ms:en.ms.length?Math.max(...en.ms):0,t:Date.now()};e.runs=[...e.runs,x];S.zend=cleanEnd(e);S.zend.sec=r.id;save();syncBoard();return x}
 const rows=(cur,max)=>rd().runs.slice(0,max).map((r,i)=>`<li class="you${cur&&r.t===cur.t?' cur':''}"><b>${i+1}</b><span>${esc(label(r))}${r.ms?` · milestone ${r.ms}`:''}</span></li>`).join('');
 E.rows=rows;
 const box=document.createElement('details');box.className='zmeta zlbm';box.id='zendboard';($('zboard')||$('zdiff')).after(box);
 function syncBoard(){const R=rd().runs,open=box.open;box.hidden=!R.length&&!unlocked();
  box.innerHTML=`<summary>Endless <span>${R.length?`best: ${esc(label(R[0]))}`:unlocked()?'no run yet':'locked'}</span></summary><div class="zmb zlb">${R.length?`<ol>${rows(null,MAXRUNS)}</ol>`:`<p class="zhint">${unlocked()?'Start an Endless run from the campaign map or the Endless button.':'Hold the Launch Complex to unlock Endless.'}</p>`}</div>`;box.open=open}

 /* ---------- the buttons: the sector briefing (zcampaign.js hook) and the campaign card on the start menu ---------- */
 E.btn=(c,id,t)=>{const held=t==='held',ok=c.done===1&&held,why=c.done!==1?'Hold the Launch Complex to unlock Endless':held?'':'Hold this sector first';
  return`<button class="sm zendb" id="zcpend" ${ok?'':'disabled'} title="${esc(ok?'No objective: the waves keep climbing and the sector keeps its scars':why)}">Endless ∞</button>`};
 const ov=$('zcamp');ov?.addEventListener('click',e=>{if(!e.target.closest?.('#zcpend'))return;const id=Z.cp.C().sel;E.start(id)});
 const card=$('zcpm');
 function syncCard(){if(!card)return;card.querySelector('#zendgo')?.remove();if(!unlocked())return;const id=E.sector();
  card.insertAdjacentHTML('beforeend',`<button class="sm zendb" id="zendgo" title="${esc('Endless: no objective on '+(SEC[id]?.n||'')+', the waves keep climbing')}">Endless ∞ · ${esc(SEC[id]?.n||'')}</button>`)}
 card?.addEventListener('click',e=>{if(e.target.closest?.('#zendgo'))E.start(E.sector())});
 const sm0=Z.syncMode;Z.syncMode=()=>{sm0?.();syncCard();syncBoard()};
 syncCard();syncBoard();

 /* ---------- the end of an Endless run ---------- */
 const co0=Z.cpOver;Z.cpOver=()=>{const r=run();if(!r)return co0?co0():false;banner('');
  const w=G.wave,cur=record(w),e=rd(),best=e.runs[0]?.w||w,nb=cur&&cur.w>=best&&e.runs.filter(x=>x.w===best).length===1,ms=G.end?.ms||[];
  $('zover').innerHTML=`<div class="zpanel zgo zcpres lost zendover"><h2>Endless run over</h2><div class="zbig">WAVE ${w}</div>
   <div class="zstats"><span>Sector</span><b>${esc(r.sec.n)}</b><span>Intercepts</span><b>${G.kills.p+G.kills.h}</b><span>by helpers</span><b>${G.kills.h}</b><span>Money earned</span><b>${money(G.earned)}</b><span>Milestones</span><b>${ms.length?ms.join(' · '):'none yet'}</b><span>Best Endless</span><b>${nb?'NEW BEST · ':''}wave ${best}</b>${G.lastHit&&KIND[G.lastHit.k]?`<span>Final blow</span><b>${esc(KIND[G.lastHit.k].n)} · ${esc(String(G.lastHit.site).toLowerCase())}</b>`:''}</div>
   <div class="zlb"><ol>${rows(cur,5)}</ol></div>
   <p class="zhint">The sector keeps its scars. The campaign is untouched: an Endless run never costs it a thing.</p>
   <div class="btns"><button class="go" id="zendagain">Endless again</button><button id="zcpmap">Campaign map ▸</button><button id="zmenu">Menu</button></div></div>`;
  $('zover').hidden=false;
  $('zendagain').onclick=()=>{const id=r.id;$('zover').hidden=true;banner('');E.start(id,true)};
  $('zcpmap').onclick=()=>Z.cp.openMap();$('zmenu').onclick=()=>{$('zover').hidden=true;api.startDemo()};
  Z.syncMode?.();setTimeout(()=>$('zendagain')?.focus(),50);return true};
 return E}
