// ---------- Progression UI: the Profile screen, the post-match summary (XP sources, XP bar, level-ups, unlocks), toasts ----------
// Reads the profile (progress/tracker.js P) and its notifications (onProg); writes nothing but your name (S.name).
import {$} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {onEv} from '../core/events.js';
import {MODES} from '../modes/registry.js';
import {COS_CATS,COS_NAMES} from '../parts/cosmetics.js';
import {ACH,ACH_CATS,achProg,packCounts} from '../progress/achievements.js';
import {P,achView,onProg} from '../progress/tracker.js';
import {LEVEL_UNLOCKS,UNLOCK,cosOf,lockOf,reqText} from '../progress/unlocks.js';
import {levelOf} from '../progress/xp.js';
import {CATS,PACKS,TIERS} from '../training/packs.js';
import {esc} from '../state.js';
import {cosTile} from './cos-tiles.js';
import {menuScreen} from './menu.js';
const fmt=n=>Math.round(+n||0).toLocaleString('en-US'),team=()=>S.tp==='1'?1:0,catName=c=>COS_NAMES[COS_CATS.indexOf(c)]||c;
const itemName=k=>{const o=cosOf(k);return o?`${o.it.name} (${catName(o.c)})`:k};
const day=t=>{try{return new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}catch(e){return''}};
const badge=lv=>`<div class="pflv"><span>Level</span><b>${lv}</b></div>`;
const bar=f=>`<div class="xpbar"><u style="width:${(Math.max(0,Math.min(1,f))*100).toFixed(1)}%"></u></div>`;
function nextUnlock(lv){const n=LEVEL_UNLOCKS.find(([l])=>l>lv),o=n&&cosOf(n[1]);return o?`Next: ${o.it.name} (${catName(o.c)}) at level ${n[0]}`:''}
const TROPHY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3h3v2a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V6h3zm0 5V8H6a2 2 0 0 0 1 1.7zm10 0v1.7A2 2 0 0 0 18 8z" fill="currentColor"/></svg>';
const STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill="currentColor"/></svg>';
// ---- main menu button: your level and how far into it
export function navLevel(){const L=levelOf(P.xp),el=$('proflv');if(el)el.textContent=`Level ${L.lv} · ${ACH.filter(a=>P.ach[a.id]).length}/${ACH.length} achievements`}
// ---- the Profile screen
let TAB='stats';
export function renderProfile(){const L=levelOf(P.xp),done=ACH.filter(a=>P.ach[a.id]).length,unl=[...UNLOCK.keys()].filter(k=>{const[c,id]=k.split(':');return!lockOf(P,c,id)}).length;
 $('pfhead').innerHTML=`${badge(L.lv)}<div class="pfid"><input id="pfname" maxlength="16" placeholder="Pilot name" aria-label="Pilot name" value="${esc(S.name||'')}">${bar(L.frac)}
  <div class="xpnum"><span>${L.need?`${fmt(L.into)} / ${fmt(L.need)} XP to level ${L.lv+1}`:'Top level'}</span><span>${esc(nextUnlock(L.lv))}</span></div><small>${fmt(P.xp)} XP in total · profile started ${esc(day(P.since))}</small></div>
  <div class="pfach">${TROPHY}<b>${done}</b><span>of ${ACH.length}<br>achievements</span></div>`;
 $('pfname').oninput=e=>{S.name=e.target.value.slice(0,16);save();$('nick').value=S.name};
 const T=[['stats','Stats',''],['ach','Achievements',`${done}/${ACH.length}`],['unl','Unlocks',`${unl}/${UNLOCK.size}`],['hist','Matches',`${P.hist.length}`]];
 $('pftabs').innerHTML=T.map(([id,n,s])=>`<button class="${id===TAB?'on':''}" role="tab" aria-selected="${id===TAB}" data-t="${id}"><span>${n}</span><small>${s}</small></button>`).join('');
 for(const b of $('pftabs').children)b.onclick=()=>{TAB=b.dataset.t;renderProfile()};
 $('pfbody').innerHTML=TAB==='ach'?achTab():TAB==='unl'?unlTab():TAB==='hist'?histTab():statsTab();navLevel()}
const row=(n,v)=>`<div><span>${esc(n)}</span><b>${v}</b></div>`,pct=(a,b)=>b?Math.round(100*a/b)+'%':'—';
function card(title,big,rows,cls=''){return`<section class="pfcard ${cls}"><h3>${esc(title)}</h3>${big?`<div class="pfbig">${big}</div>`:''}<div class="pfrows">${rows.join('')}</div></section>`}
function statsTab(){const lg=P.st.league||{},df=P.st.df||{},b=P.best,pc=packCounts(S.train),shots=PACKS.reduce((a,p)=>a+p.shots.length,0);
 const wl=s=>`<b>${fmt(s.w)}</b><i>W</i><b>${fmt(s.l)}</b><i>L</i><em>${pct(s.w||0,(s.w||0)+(s.l||0))} wins</em>`;
 const tb=`<table class="pftr"><thead><tr><th></th>${TIERS.map((t,i)=>`<th class="t${i}">${esc(t.name)}</th>`).join('')}</tr></thead><tbody>${CATS.map(c=>`<tr><td>${esc(c.name)}</td>${TIERS.map((t,i)=>{const P2=PACKS.find(p=>p.cat===c.id&&p.tier===i),x=P2&&S.train?.[P2.id];
  return`<td class="${x&&x.n>=P2.shots.length?'ok':''}" title="${P2?esc(P2.name):''}">${x?`${x.n}/${P2.shots.length}`:'—'}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
 return`<div class="pfgrid">${card('League',wl(lg),[row('Matches',fmt(lg.m)),row('Goals',fmt(lg.goals)),row('Assists',fmt(lg.assists)),row('Saves',fmt(lg.saves)),row('Shots on target',fmt(lg.shots)),row('Demolitions',fmt(lg.demos)),
  row('Pops on the ball',fmt(lg.pops)),row('Pop chains',fmt(lg.chains)),row('Aerial goals',fmt(lg.aerial)),row('Air dribble goals',fmt(lg.adrib)),row('Pop goals',fmt(lg.popg)),row('XP from League',fmt(lg.xp))])}
 ${card('Dogfight',wl(df),[row('Matches',fmt(df.m)),row('Kills',fmt(df.kills)),row('Deaths',fmt(df.deaths)),row('K/D',df.deaths?(df.kills/df.deaths||0).toFixed(2):fmt(df.kills)),row('Turrets destroyed',fmt(df.turrets)),row('XP from Dogfight',fmt(df.xp))])}
 ${card('Records','',[row('Goals in a match',fmt(b.goals)),row('Saves in a match',fmt(b.saves)),row('Longest pop chain',fmt(b.chain)),row('Kills in a match',fmt(b.kills)),row('XP in a match',fmt(b.xp)),row('Best win streak',fmt(P.bstreak)),row('Win streak now',fmt(P.streak))])}
 ${card('Training',`<b>${pc.done}</b><i>of ${PACKS.length} packs cleared</i><em>${fmt(pc.shots)}/${fmt(shots)} shots</em>`,[tb],'pfwide')}</div>`}
function achTab(){const V=achView();return ACH_CATS.map(([c,n])=>`<h3 class="pfh">${esc(n)}</h3><div class="achg">${ACH.filter(a=>a.cat===c).map(a=>{const p=achProg(a,V),on=!!P.ach[a.id];
 return`<div class="achc${on?' done':''}"><i class="achi">${on?TROPHY:Math.floor(p.f*100)+'%'}</i><div class="achb"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><span class="pbar"><u style="width:${(on?100:p.f*100).toFixed(1)}%"></u></span>
  <span class="achn">${on?`Unlocked ${esc(day(P.ach[a.id]))}`:`${fmt(p.v)} / ${fmt(p.goal)}`}${a.reward?` · <em>${on?'':'Unlocks '}${esc(itemName(a.reward))}</em>`:''}</span></div></div>`}).join('')}</div>`).join('')}
function unlTab(){const t=team(),tile=k=>{const o=cosOf(k);if(!o)return'';const lk=lockOf(P,o.c,o.id),u=UNLOCK.get(k);return cosTile(o.c,o.it,t,lk?{lock:reqText(lk)}:{note:P.grant.includes(k)&&!(u.lv&&levelOf(P.xp).lv>=u.lv)&&!(u.ach&&P.ach[u.ach])?'Kept from before':'Unlocked · '+reqText(u).replace('Reach ','').replace('Achievement: ','')})};
 return`<p class="pblurb">Strictly looks: unlocks never change how a quad flies. Parts are always all yours. Everything not listed here is unlocked from the start.</p>
 <h3 class="pfh">Level rewards</h3><div class="gcat gcos pfunl">${LEVEL_UNLOCKS.map(([,k])=>tile(k)).join('')}</div>
 <h3 class="pfh">Achievement rewards</h3><div class="gcat gcos pfunl">${ACH.filter(a=>a.reward).map(a=>tile(a.reward)).join('')}</div>`}
function histTab(){if(!P.hist.length)return'<p class="pblurb">No finished matches yet. Play League or Dogfight against bots or online: every finished match shows here with the XP it gave.</p>';
 return`<ol class="trslist pfhist">${P.hist.map(h=>`<li class="${h.r==='W'?'ok':'miss'}"><span>${h.r}</span><b>${esc(MODES[h.m]?.name||h.m)} · ${h.s[0]}–${h.s[1]}</b><em>+${fmt(h.xp)} XP</em><small>${esc(day(h.t))}</small></li>`).join('')}</ol>`}
// ---- toasts (top right): achievements, level-ups
export function toast(kind,title,name,sub){const box=$('toasts');if(!box)return;const t=document.createElement('div');t.className='toast '+kind;
 t.innerHTML=`<i>${kind==='lvl'?STAR:TROPHY}</i><div><span>${esc(title)}</span><b>${esc(name)}</b>${sub?`<small>${esc(sub)}</small>`:''}</div>`;box.append(t);
 while(box.children.length>4)box.firstChild.remove();setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),450)},5200)}
const achToast=a=>toast('ach','Achievement unlocked',a.name,a.reward?'Unlocks '+itemName(a.reward):a.desc);
// ---- post-match summary: where the XP came from, the XP bar filling (and rolling over on a level-up), what unlocked
let pmT=0;
function summary(x){const M=MODES[x.mode],r=x.res,box=$('pmsum');
 const items=r.items.length?r.items.map(i=>`<li><span>${esc(i.n)}${i.c!=null?` <em>×${i.c}</em>`:''}</span><b>+${fmt(i.xp)}</b></li>`).join(''):`<li class="none"><span>${esc(r.notes[0]||'No XP')}</span><b>+0</b></li>`;
 const notes=r.items.length&&r.notes.length?`<p class="pmnote">${r.notes.map(esc).join(' · ')}</p>`:'';
 const news=[...(x.lv1.lv>x.lv0.lv?[`<li class="lv">${STAR}<span>Level up!</span><b>Level ${x.lv1.lv}</b></li>`]:[]),...x.ach.map(a=>`<li>${TROPHY}<span>Achievement</span><b>${esc(a.name)}</b></li>`),
  ...x.unl.map(k=>`<li class="un"><span>Unlocked</span><b>${esc(itemName(k))}</b></li>`)];
 box.innerHTML=`<div class="trbox pmbox" role="dialog" aria-label="Match summary"><div class="trsh"><span>${esc(M?.name||x.mode)} · match summary</span><h2 class="${x.won?'pmw':'pml'}">${x.won?'Victory':'Defeat'}</h2><i class="pmsc">${x.score[0]} – ${x.score[1]}</i></div>
  <ul class="pmxp">${items}</ul>${notes}<div class="pmtot"><span>XP earned</span><b>+${fmt(r.total)}</b></div>
  <div class="pmlv">${badge(x.lv0.lv)}<div class="pmbar">${bar(x.lv0.frac)}<div class="xpnum"><span id="pmxpn">${x.lv0.need?`${fmt(x.lv0.into)} / ${fmt(x.lv0.need)} XP`:'Top level'}</span><span>${esc(nextUnlock(x.lv1.lv))}</span></div></div></div>
  ${news.length?`<ul class="pmnew">${news.join('')}</ul>`:''}<div class="trsact pmact"><button class="go" id="pmok">Continue</button><button id="pmprof">Profile</button></div></div>`;
 box.hidden=false;$('pmok').onclick=hideSummary;$('pmok').focus({preventScroll:true});
 $('pmprof').onclick=()=>{hideSummary();const go=()=>{if($('menu').hidden)return false;renderProfile();menuScreen('profile');return true};if(!go()){const t=setInterval(()=>{if(go())clearInterval(t)},200);setTimeout(()=>clearInterval(t),8000)}};  // offline the menu opens a few seconds after the end
 // the bar: fill to the end of the old level first on a level-up, then the new level from empty
 const u=box.querySelector('.xpbar u'),lb=box.querySelector('.pflv b'),n=$('pmxpn');clearTimeout(pmT);
 const to=(f,cb)=>{u.style.width=(f*100).toFixed(1)+'%';pmT=setTimeout(cb||(()=>{}),900)};
 pmT=setTimeout(()=>{if(x.lv1.lv>x.lv0.lv)to(1,()=>{u.style.transition='none';u.style.width='0';lb.textContent=x.lv1.lv;box.querySelector('.pflv').classList.add('up');void u.offsetWidth;u.style.transition='';to(x.lv1.frac)});else to(x.lv1.frac);
  n.textContent=x.lv1.need?`${fmt(x.lv1.into)} / ${fmt(x.lv1.need)} XP`:'Top level'},500)}
export function hideSummary(){$('pmsum').hidden=true;clearTimeout(pmT)}
// ---- the training pack summary gets its XP line
function packLine(x){const el=$('trsxp');if(!el)return;const r=x.res;el.hidden=false;
 el.innerHTML=r.total?`<b>+${fmt(r.total)} XP</b><span>${r.items.map(i=>`${esc(i.n)} +${fmt(i.xp)}`).join(' · ')}</span>${badge(x.lv1.lv)}${bar(x.lv1.frac)}`:`<b>+0 XP</b><span>Beat your best (more shots done, or 5% faster) to earn XP from this pack.</span>${badge(x.lv1.lv)}${bar(x.lv1.frac)}`}
export function initProfile(){
 $('profbtn').addEventListener('click',()=>{TAB='stats';renderProfile()});navLevel();
 onProg('ach',a=>{achToast(a);navLevel()});
 onProg('match',x=>{navLevel();for(const a of x.ach)achToast(a);clearTimeout(pmT);pmT=setTimeout(()=>summary(x),1800)});
 onProg('pack',x=>{packLine(x);navLevel();if(x.lv1.lv>x.lv0.lv)toast('lvl','Level up!','Level '+x.lv1.lv,x.unl.length?'Unlocked '+x.unl.map(itemName).join(', '):'');for(const a of x.ach)achToast(a)});
 onEv('count',e=>{if(e.n===0&&!$('pmsum').hidden)hideSummary()});  // online: the next match is under way (GO)
 addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('pmsum').hidden){hideSummary();e.stopImmediatePropagation()}},true)}
