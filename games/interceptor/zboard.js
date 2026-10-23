// Zombies leaderboard: the bot pilots' benchmark (zbench.json, written by tools/zombies-bench.mjs: the median wave each bot level reaches on
// each difficulty) plus your own runs, on the game-over screen and the start menu. A fresh profile sees only the bots.
// Ranking: one score per entry, wave x the difficulty's weight. The weight comes from the benchmark itself: how much further the bots get on
// Normal than on that difficulty (averaged over the levels), so a wave on Nightmare counts like the Normal wave the same pilots would reach.
// Your runs are saved as S.zruns = [{d: difficulty index, w: wave, doc: doctrine id, co: 1 if co-op, t: time}], checked on every read.
import {ZDIFF} from './zdata.js';
const DN=ZDIFF.map(d=>d.n),MAXRUNS=20;
export function initBoard(api,G,Z){
 const {S,save}=api,$=id=>document.getElementById(id);
 let B=null;  // the benchmark, once loaded
 fetch(new URL('zbench.json',import.meta.url)).then(r=>r.ok?r.json():null).then(j=>{B=clean(j);sync()}).catch(()=>{});
 function clean(j){if(!j||typeof j!=='object'||!Array.isArray(j.levels))return null;const levels=[];
  for(const l of j.levels.slice(0,8)){if(!l||typeof l.n!=='string')continue;const d={};for(const n of DN){const c=l.d?.[n];if(c&&Number.isFinite(c.med))d[n]={med:+c.med,min:+c.min||+c.med,max:+c.max||+c.med};const f=c.fly;if(f&&Number.isFinite(f.med)&&Number.isFinite(f.pct)&&Number.isFinite(f.systems))d[n].fly={med:+f.med,pct:Math.max(0,Math.min(1,+f.pct)),systems:f.systems|0}}levels.push({n:l.n.replace(/[<>&"'`]/g,'').slice(0,24),d})}
  return levels.length?{levels,date:String(j.date||'').slice(0,10),version:String(j.version||'').replace(/[<>&"'`]/g,'').slice(0,24),runs:j.runs|0}:null}
 // difficulty weights: Normal median / this difficulty's median, averaged over the levels (fallback when there is no benchmark)
 function weights(){const w=[.8,1,1.3,1.6];if(!B)return w;return DN.map((n,i)=>{const r=B.levels.filter(l=>l.d.Normal&&l.d[n]).map(l=>l.d.Normal.med/Math.max(1,l.d[n].med));return r.length?r.reduce((a,b)=>a+b,0)/r.length:w[i]})}
 const runs=()=>(Array.isArray(S.zruns)?S.zruns:[]).filter(r=>r&&Number.isInteger(r.d)&&r.d>=0&&r.d<DN.length&&Number.isInteger(r.w)&&r.w>0&&r.w<1000).map(r=>({d:r.d,w:r.w,doc:typeof r.doc==='string'?r.doc.slice(0,12):'std',co:r.co?1:0,t:+r.t||0}));
 // every entry, best first: {bot: level name | null, d, w, score, me: this run}
 function entries(cur){const W=weights(),E=[];
  if(B)for(const l of B.levels)DN.forEach((n,i)=>{const c=l.d[n];if(c)E.push({bot:l.n,d:i,w:Math.round(c.med),score:c.med*W[i],fly:c.fly})});
  for(const r of runs())E.push({bot:null,d:r.d,w:r.w,doc:r.doc,co:r.co,score:r.w*W[r.d],me:!!cur&&r.t===cur.t});
  return E.sort((a,b)=>b.score-a.score||(a.bot?1:0)-(b.bot?1:0))}
 const label=e=>`${e.bot?e.bot+' bot':'You'+(e.co?' (co-op)':'')} · ${DN[e.d]} · wave ${e.w}${e.fly?` · flown: wave ${Math.round(e.fly.med)}, ${Math.round(e.fly.pct*100)}% of the map, ${e.fly.systems} systems`:''}`;
 // a finished run: saved (best 20 by score kept) and returned so the end screen can highlight it
 function record(d,w,co){if(!(w>0))return null;const W=weights(),r={d,w,doc:Z.meta?.docId?.()||'std',co:co?1:0,t:Date.now()};
  S.zruns=[...runs(),r].sort((a,b)=>b.w*W[b.d]-a.w*W[a.d]).slice(0,MAXRUNS);save();sync();return r}
 // the headline: which bot this run beat on its own difficulty, and the next one up
 function verdict(d,w){if(!B)return'';const L=B.levels.filter(l=>l.d[DN[d]]),beat=L.filter(l=>w>l.d[DN[d]].med).pop(),next=L.find(l=>w<=l.d[DN[d]].med);
  if(!beat)return next?`The ${next.n} bot reaches wave ${Math.round(next.d[DN[d]].med)} on ${DN[d]}. Beat it next time.`:'';
  return`You beat the <b>${beat.n} bot</b> on ${DN[d]}!${next?` Next up: the ${next.n} bot (wave ${Math.round(next.d[DN[d]].med)}).`:' Every bot is behind you.'}`}
 function rows(E,cur,max){let i=E.findIndex(e=>e.me);const n=E.length;let a=0,b=Math.min(n,max);if(i>=0&&i>=max-2){a=Math.max(0,Math.min(n-max,i-Math.floor(max/2)));b=Math.min(n,a+max)}
  return E.slice(a,b).map((e,k)=>`<li class="${e.bot?'bot':'you'} ${e.me?'cur':''}"><b>${a+k+1}</b><span>${label(e)}</span></li>`).join('')}
 // the game-over screen's block: the verdict and the table around this run
 function overHTML(cur){const E=entries(cur);if(!E.length)return'';return`<div class="zlb"><p class="zverdict">${cur?verdict(cur.d,cur.w):''}</p><ol>${rows(E,cur,9)}</ol>${note()}</div>`}
 const note=()=>B?`<p class="zhint">Bots: median of ${B.runs} benchmark runs each (${B.date}, ${B.version}). Ranked by wave × difficulty weight.</p>`:'<p class="zhint">No bot benchmark loaded.</p>';
 // start menu: a fold-out next to Doctrine & unlocks
 const box=document.createElement('details');box.className='zmeta zlbm';box.id='zboard';($('zmeta')||$('zdiff')).after(box);
 function sync(){const E=entries(null),you=E.filter(e=>!e.bot).length,open=box.open;
  box.innerHTML=`<summary>Leaderboard <span>${E.length?`${B?B.levels.length+' bot levels':'no bots'}${you?` · your best: ${label(E.find(e=>!e.bot))}`:' · play a run to get on it'}`:'loading…'}</span></summary><div class="zmb zlb"><ol>${rows(E,null,40)}</ol>${note()}</div>`;box.open=open}
 sync();const sy0=Z.syncMode;Z.syncMode=()=>{sy0?.();sync()};
 return Z.board={record,overHTML,entries,verdict,weights,get bench(){return B},sync}}
