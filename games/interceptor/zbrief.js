// Zombies threat briefing: one card on the base screen that says what the next wave brings, read from the real wave plan (G.next, the very
// object startWave spawns), so it cannot disagree with the wave that follows. Three to five lines with an icon each: the tracks by type, where
// they come from (and when), the alerts (a boss, the fast missiles), the weather and wind, and the special things of the break (a sortie
// to fly, what a campaign sector or an Endless run changes). It collapses to one line (the same line the radio reads out at the start of the
// wave); the choice is kept in the settings (S.zbrief).
// Honest but not exhaustive: it never says a thing the plan does not hold, and how much it says depends on the INTEL level, which comes
// from the warning time the player has bought (Z.warnS: the Long-range radar perk and the early-warning radar of the Kill chain tab, shorter
// under the campaign's Blind early warning). BASIC: types and numbers, the launch sector, the boss, the weather. GOOD: compass bearings with
// shares, the number of raids and when they launch. HIGH: the fast missiles by sector, the decoys, when the weather turns. FULL: the heaviest
// raid and the moment of peak pressure. The types and numbers are the same at every level (the footer's list shows them too).
// Hooks: zbase.js calls Z.briefHTML in the base screen; Z.brief.add(fn) lets another module put a line in (fn(data) -> text or [text]).
// Everything is read from G.next, so a sortie that cuts the plan changes the card at once (the base screen redraws).
import {KIND,ORDER,SECTORS,FAST,sectorOf,isBoss} from './zdata.js';
const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);
export const TIERS=['BASIC','GOOD','HIGH','FULL'],TIER_AT=[32,48,64];  /* warning time (s) at which each level starts: 20 s is the base, a full radar and early-warning net is 74 s */
export const tierOf=s=>TIER_AT.filter(c=>s>=c).length;
const DIR8=['N','NE','E','SE','S','SW','W','NW'],DIRW={N:'north',NE:'north-east',E:'east',SE:'south-east',S:'south',SW:'south-west',W:'west',NW:'north-west'};
export const dirOf=b=>DIR8[((Math.round(b*4/Math.PI)%8)+8)%8];  /* a raid's bearing (0 = north, negative = west) as a compass point */
const SING={shahed:'Shahed',jet:'Geran-3',decoy:'decoy',swarm:'FPV',heavy:'armored heavy',cruise:'cruise missile',ballistic:'ballistic',hyper:'hypersonic',icbm:'ICBM'};
const PLUR={shahed:'Shaheds',jet:'Geran-3s',decoy:'decoys',swarm:'FPV',heavy:'armored heavies',cruise:'cruise missiles',ballistic:'ballistics',hyper:'hypersonics',icbm:'ICBMs'};
const nm=(k,n)=>(n===1?SING[k]:PLUR[k])||KIND[k]?.n||k;
const isBossK=k=>!!KIND[k]&&(KIND[k].armor==='boss'||!!KIND[k].bossy);
const fmt=s=>{s=Math.max(0,Math.round(s));return`${s/60|0}:${String(s%60).padStart(2,'0')}`};
const R5=v=>Math.round(v/5)*5;
const andL=a=>a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];  /* a, b and c */

/* the plan as a list of entries {k, n, brg, at}: a co-op client has no timed queue, only the list and the raids' bearings */
function entries(P){const q=Array.isArray(P?.q)?P.q:[];
 if(q.length)return q.map(e=>{const[k,c]=String(e.k).split(':');return{k,n:+c||1,brg:+e.brg||0,at:Number.isFinite(e.at)?e.at:null}});
 const L=Array.isArray(P?.list)?P.list:[],B=Array.isArray(P?.brgs)&&P.brgs.length?P.brgs:[0];
 return L.map((s,i)=>{const[k,c]=String(s).split(':');return{k,n:+c||1,brg:+B[i%B.length]||0,at:null}})}

/* the analysis, pure: a plan in, what the card says out. o = {w: the wave, tier, isNew(k), kinds known to the shop are not needed} */
export function analyse(P,o={}){if(!P)return null;const E=entries(P).filter(e=>KIND[e.k]),tier=o.tier??1,w=o.w|0;
 const by={},pts=e=>Math.max(4,(KIND[e.k].pts||0)*e.n);let n=0,tot=0;
 for(const e of E){const b=by[e.k]||(by[e.k]={k:e.k,n:0,g:0});b.n+=e.n;b.g++;n+=e.n;tot+=pts(e)}
 const kinds=[...ORDER.filter(k=>by[k]),...Object.keys(by).filter(k=>!ORDER.includes(k)).sort()].map(k=>({...by[k],nm:KIND[k].n,tag:KIND[k].tag,isNew:!!o.isNew?.(k),boss:isBossK(k)}));
 /* direction: the launch sector at every level, the compass point with its share from GOOD up */
 const dm=new Map(),sm=new Map();
 for(const e of E){const d=dirOf(e.brg),s=sectorOf(e.brg),p=pts(e);dm.set(d,(dm.get(d)||0)+p);sm.set(s,(sm.get(s)||0)+p)}
 const share=m=>[...m].sort((a,b)=>b[1]-a[1]).map(([id,p])=>({id,share:p/Math.max(1,tot)}));
 const dirs=share(dm),secs=share(sm).map(x=>({...x,n:SECTORS[x.id].n}));
 const ats=E.map(e=>e.at).filter(Number.isFinite),timed=ats.length>0;
 /* the launch window and the peak (the busiest 10 s of launches) */
 let t0=null,t1=null,peak=null;
 if(timed){t0=Math.min(...ats);t1=Math.max(...ats);const W=10;let bp=-1;if(tier>=3)for(const e of E)if(Number.isFinite(e.at)){let s=0;for(const f of E)if(Number.isFinite(f.at)&&f.at>=e.at&&f.at<e.at+W)s+=pts(f);if(s>bp){bp=s;peak=e.at+W/2}}}
 /* the heaviest raid: every entry joins the nearest of the plan's bearings */
 let heavy=null;const B=Array.isArray(P.brgs)?P.brgs:[];
 if(B.length){const r=B.map(()=>({n:0,p:0}));for(const e of E){let bi=0,bd=9;B.forEach((b,i)=>{const d=Math.abs(b-e.brg);if(d<bd){bd=d;bi=i}});r[bi].n+=e.n;r[bi].p+=pts(e)}
  let hi=0;r.forEach((x,i)=>{if(x.p>r[hi].p)hi=i});heavy={d:dirOf(B[hi]),n:r[hi].n,share:r[hi].p/Math.max(1,r.reduce((a,x)=>a+x.p,0))}}
 const fast=FAST.filter(k=>by[k]).map(k=>({k,n:by[k].n,secs:[...new Set(E.filter(e=>e.k===k).map(e=>sectorOf(e.brg)))].map(i=>SECTORS[i].n)}));
 return{w,tier,tn:TIERS[tier],n,pts:tot,kinds,dirs,secs,raids:Math.max(1,B.length),t0,t1,peak,heavy,fast,decoys:by.decoy?.n|0,
  boss:kinds.filter(k=>k.boss).map(k=>({k:k.k,nm:k.nm,n:k.n})),wx:P.wx||null,cuts:Array.isArray(P.cuts)?P.cuts:[]}}

export function initBrief(api,G,Z){
 const {S,save}=api,$=id=>document.getElementById(id);
 const B=Z.brief={},extra=[];
 B.analyse=analyse;B.tierOf=tierOf;B.dirOf=dirOf;
 const collapsed=()=>S.zbrief===1;
 B.collapsed=collapsed;
 B.add=fn=>{if(typeof fn==='function'&&!extra.includes(fn))extra.push(fn)};
 /* the intel level: the warning time bought (Long-range radar, early-warning radar), the Blind early warning of a campaign sector shortens it */
 B.warn=()=>{const s=Z.warnS?.();return Number.isFinite(s)?s:36};
 B.tier=()=>tierOf(B.warn());
 /* a boss is due on this wave: the usual every 10, the campaign's Mothership escort (every 5), an Endless run's extra ones */
 B.bossDue=w=>isBoss(w)||(!!Z.cp?.has?.('boss5')&&w%5===0)||!!Z.endless?.due?.(w);
 B.nextBoss=w=>{for(let v=w+1;v<=w+12;v++)if(B.bossDue(v))return v;return 0};
 const wxInfo=p=>{const T=Z.wx?.T,A=p&&T?.[p.id];if(!A)return null;
  const vis=W=>{const d=W.fog[1]*.55;return d>=8000?'excellent':d<1000?`${Math.round(d/100)*100} m`:`${(d/1000).toFixed(1)} km`};
  return{id:p.id,n:A.n,lo:R5(A.wind*.7*3.6),hi:R5(A.wind*1.2*3.6),vis:vis(A),to:p.to&&T[p.to]?T[p.to].n:'',why:p.why||'',at:p.at}};
 /* the briefing of the wave about to start: data for the card, the harness and the radio (null outside the base screen) */
 B.data=()=>{const P=G.next;if(!G.on||!P||!Array.isArray(P.list))return null;const w=G.wave+1,tier=B.tier();
  const D=analyse(P,{w,tier,isNew:k=>Z.kindFrom?.(k)===w});if(!D)return null;
  D.warn=B.warn();D.wxi=wxInfo(P.wx);D.due=B.bossDue(w);D.next=D.due?0:B.nextBoss(w);
  D.sortie=!!Z.so?.S&&G.wave>=1&&Z.so.S.used!==G.wave;
  /* what a campaign sector changes in this particular wave: the modifiers whose mark is in the plan (swarms, jets, heavies, a hypersonic, the extra Mothership) */
  D.mods=[];const run=Z.cp?.run,has=k=>D.kinds.some(x=>x.k===k);
  if(run){const M=Z.cp.MODS,mark={swarm:()=>has('swarm'),jets:()=>has('jet'),armor:()=>has('heavy'),hyper:()=>has('hyper'),boss5:()=>D.boss.length>0&&w%5===0&&w%10!==0};
   for(const m of run.mods)if(mark[m.id]?.()&&M[m.id])D.mods.push({id:m.id,g:M[m.id].g,n:M[m.id].n})}
  D.extra=[];for(const f of extra){let r=null;try{r=f(D)}catch(e){r=null}for(const s of[].concat(r||[]))if(typeof s==='string'&&s)D.extra.push(s)}
  return D};
 /* ---------- the one line (collapsed card, radio) ---------- */
 /* "Wave 14: 103 tracks, mostly FPV, from the north-west and north. Boss: Mothership." (the most numerous kind if it is half or more, else the top two) */
 const lineOf=D=>{const ks=D.kinds.filter(k=>!k.boss).sort((a,b)=>b.n-a.n),nk=k=>PLUR[k.k]||k.nm,dw=D.dirs.slice(0,2).filter(d=>d.share>=.2).map(d=>DIRW[d.id]);
  let a=`Wave ${D.w}: ${D.n} track${D.n===1?'':'s'}`;
  if(ks.length)a+=ks.length===1?', '+nk(ks[0]):ks[0].n*2>D.n-D.boss.reduce((x,b)=>x+b.n,0)?', mostly '+nk(ks[0]):', '+andL(ks.slice(0,2).map(nk));
  if(dw.length)a+=`, from the ${andL(dw)}`;else if(D.dirs[0])a+=`, from the ${DIRW[D.dirs[0].id]}`;a+='.';
  if(D.boss.length)a+=` Boss: ${andL(D.boss.map(b=>b.nm))}.`;
  else if(D.fast.length)a+=` Fast missiles from the ${andL([...new Set(D.fast.flatMap(f=>f.secs))]).toLowerCase()}.`;
  return a};
 B.line=()=>{const D=B.data();return D?lineOf(D):''};
 /* ---------- the card ---------- */
 const rows=D=>{const L=[];
  /* 1 the tracks */
  L.push(['✈','',`<b>${D.n} tracks</b> · ${D.kinds.map(k=>`<span class="zbk${k.isNew?' new':''}${k.boss?' boss':''}" title="${esc(k.nm)}">${k.n}× ${esc(k.k==='swarm'?'FPV'+(k.g>1?` (${k.g} swarms)`:''):k.boss?k.nm:nm(k.k,k.n))}${k.isNew?' <em>NEW</em>':''}</span>`).join(' ')}`]);
  /* 2 where from and when */
  const sec=D.secs.filter(s=>s.share>=.15).slice(0,3);
  if(D.tier<1)L.push(['⌖','',`From ${andL((sec.length?sec:D.secs.slice(0,1)).map(s=>`<b>${s.n}</b>`))}`]);
  else{const dd=D.dirs.filter(d=>d.share>=.1).slice(0,3),rest=1-dd.reduce((a,d)=>a+d.share,0);
   L.push(['⌖','',`From ${dd.map(d=>`<b>${d.id}</b> ${R5(d.share*100)}%`).join(' · ')}${rest>.08?` · other ${R5(rest*100)}%`:''} · ${D.raids} raid${D.raids>1?'s':''}${D.t0!=null?` · launching ${fmt(D.t0)}–${fmt(D.t1)}`:''}${D.tier>=3&&D.peak!=null?` · peak ~${fmt(D.peak)}`:''}${D.tier>=3&&D.heavy&&D.raids>1?` · heaviest raid ${D.heavy.d} (${D.heavy.n})`:''}`])}
  /* 3 alerts: bosses, the fast missiles, decoys */
  const al=[];
  if(D.boss.length)al.push(`<b class="cr">BOSS WAVE</b>: ${D.boss.map(b=>esc(b.nm)).join(', ')}`);
  else if(D.next)al.push(`next boss: wave ${D.next} (${D.next-D.w} wave${D.next-D.w>1?'s':''} on)`);
  if(D.fast.length)al.push(`<span class="cr">fast missiles</span>: ${D.fast.map(f=>`${f.n} ${nm(f.k,f.n)}${D.tier>=2?` (${f.secs.join(', ')})`:''}`).join(' · ')}`);
  if(D.decoys&&D.tier>=2)al.push(`${D.decoys} of the Shaheds on radar are decoys`);
  if(al.length)L.push(['⚠','',al.join(' · ')]);
  /* 4 weather */
  const x=D.wxi;
  if(x)L.push(['☁','',`<b>${esc(x.n)}</b> · wind ${x.lo}–${x.hi} km/h · visibility ${x.vis}${x.to?` · ${esc(x.why||x.to)}${D.tier>=2&&Number.isFinite(x.at)?` ~${fmt(x.at)} in`:' later'}`:''}`]);
  /* 5 the break: a sortie, the sector's changes, sorties' cuts, other modules */
  const ev=[];
  if(D.sortie)ev.push('a <b>sortie</b> can still be flown');
  if(D.cuts.length)ev.push(`strikes cut the wave: ${D.cuts.map(c=>esc(c[0])).join(', ')}`);
  if(D.mods.length)ev.push(`sector: ${D.mods.map(m=>`${m.g} ${esc(m.n)}`).join(' ')}`);
  for(const s of D.extra)ev.push(esc(s));
  if(ev.length)L.push(['⚑','',ev.join(' · ')]);
  return L};
 B.html=()=>{const D=B.data();if(!D)return'';const col=collapsed(),pips=[0,1,2,3].map(i=>`<i class="${i<=D.tier?'on':''}"></i>`).join('');
  return`<section class="zbrief${col?' col':''}" id="zbrief" aria-label="Threat briefing">
   <header><b>THREAT BRIEFING</b><span class="zbw">WAVE ${D.w}</span><span class="zbi" title="Intel ${D.tn}: ${D.warn} s of warning. The Long-range radar and the early-warning radar (Kill chain tab) sharpen the briefing.">${pips}<em>INTEL ${D.tn}</em></span>
   <button class="sm" id="zbtog" aria-expanded="${!col}" aria-controls="zbrows">${col?'Show ▾':'Hide ▴'}</button></header>
   ${col?`<p class="zbl" id="zbrows">${esc(lineOf(D))}${D.wxi?` <span>${esc(D.wxi.n)}, wind ${D.wxi.lo}–${D.wxi.hi} km/h.</span>`:''}</p>`:`<ul class="zbrows" id="zbrows">${rows(D).map(([g,c,h])=>`<li><i class="zbg">${g}</i><span>${h}</span></li>`).join('')}</ul>`}</section>`};
 Z.briefHTML=B.html;
 B.toggle=()=>{S.zbrief=collapsed()?0:1;save();Z.base.refresh?.();return collapsed()};
 Z.base.el.addEventListener('click',e=>{if(e.target.closest?.('#zbtog'))B.toggle()});
 /* the radio: the one line, when the wave starts (the old subtitle channel; a radio module that takes it over reads it out) */
 const c0=Z.continue;Z.continue=()=>{const l=!Z.online&&G.on&&G.state==='base'?B.line():'';c0();if(l)Z.an?.radio?.('OVERLORD',l,1)};
 return B}
