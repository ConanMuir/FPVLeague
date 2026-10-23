/* ---------- Tournament UI: the setup screen (format, size, the slots), the bracket in progress, the results, the pause-menu wiring ---------- */
/* One menu screen (#scr-tournament, opened by the Tournament button) rendered from the mode's state (modes/tournament.js TN): no tournament =
   the setup, one in progress = the bracket or table with Play / Watch / Simulate on the matches that can be played, finished = the champion
   and the standings. Slots are reordered by their arrows or by dragging a row; the order is the seeding. */
import {$,DIFF} from '../config/constants.js';
import {S} from '../config/settings.js';
import {TN,nextBots,simTick,tournAbandon,tournInit,tournNew,tournPlay,tournSim,tournSimAll,tournStop,tournStopQueue,tournWatch} from '../modes/tournament.js';
import {addHud} from '../modes/registry.js';
import {setGame} from '../modes/dogfight.js';
import {startDemo} from '../modes/match.js';
import {GS,esc} from '../state.js';
import * as B from '../tournament/bracket.js';
import {PILOTS,SECOND_PILOT,cleanSetup} from '../tournament/store.js';
import {menuScreen} from './menu.js';
const names=()=>DIFF.map(d=>d.n),TROPHY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3h3v2a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V6h3zm0 5V8H6a2 2 0 0 0 1 1.7zm10 0v1.7A2 2 0 0 0 18 8z" fill="currentColor"/></svg>';
const clock=t=>{t=Math.max(0,t);return`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`},lenName=l=>(B.LENS.find(x=>x[0]===l)||[l,l+' s'])[1];
/* ---- the setup draft: 16 slots kept, the first `size` used; slot 0 is you, the rest a ladder of the levels */
const D={format:'single',size:8,team:1,len:180,pairing:'seed',mates:2,entrants:[]};
function defaults(){const n=DIFF.length;D.mates=Math.min(S.diff|0,n-1);D.entrants=Array.from({length:16},(_,i)=>i?{kind:'bot',lv:DIFF[(i-1)%n].n}:{kind:'human',pilot:'p1',name:'You'})}
const botAt=i=>({kind:'bot',lv:DIFF[i%DIFF.length].n});
function setEntrant(i,v){const[k,x]=v.split(':');if(k==='h'){D.entrants.forEach((e,j)=>{if(j!==i&&e.kind==='human'&&e.pilot===x)D.entrants[j]=botAt(j)});D.entrants[i]={kind:'human',pilot:x,name:PILOTS.find(p=>p.id===x)?.name||'You'}}  /* one slot per pilot */
 else D.entrants[i]=botAt(+x)}
function moveSlot(i,j){if(i===j||j<0||j>=D.size)return;const e=D.entrants.splice(i,1)[0];D.entrants.splice(j,0,e)}
const opts=(e)=>{const h=PILOTS.filter(p=>!p.hidden||SECOND_PILOT).map(p=>`<option value="h:${p.id}"${e.kind==='human'&&e.pilot===p.id?' selected':''}>${esc(p.name)}</option>`).join('');
 return h+DIFF.map((d,i)=>`<option value="b:${i}"${e.kind==='bot'&&e.lv===d.n?' selected':''}>${esc(d.n)}</option>`).join('')};
function renderSetup(){const sel=(id,list,v)=>`<select id="${id}">${list.map(([k,n])=>`<option value="${k}"${String(k)===String(v)?' selected':''}>${esc(n)}</option>`).join('')}</select>`;
 return`<p class="pblurb">Pick a bracket, fill the slots with bot levels and yourself, arrange the seeding, then play your matches and watch or simulate the bots' ones. It is saved as it goes.</p>
 <div class="tnset">
  <label>Format${sel('tn_format',B.FORMATS,D.format)}</label><label>Entrants${sel('tn_size',B.SIZES.map(n=>[n,n+' players']),D.size)}</label><label>Teams${sel('tn_team',B.TEAMS,D.team)}</label>
  <label>Match length${sel('tn_len',B.LENS,D.len)}</label><label>Pairing${sel('tn_pair',B.PAIRINGS,D.pairing)}</label><label>Your bot team-mates${sel('tn_mates',DIFF.map((d,i)=>[i,d.n]),D.mates)}</label>
 </div>
 <div class="tnslots" id="tnslots">${D.entrants.slice(0,D.size).map((e,i)=>`<div class="tnslot${e.kind==='human'?' hu':''}" draggable="true" data-i="${i}"><span class="tnseed">${i+1}</span><select data-slot="${i}" aria-label="Slot ${i+1}">${opts(e)}</select>
  <button class="sm tnmv" data-mv="${i}:-1" aria-label="Move up"${i?'':' disabled'}>&#9650;</button><button class="sm tnmv" data-mv="${i}:1" aria-label="Move down"${i<D.size-1?'':' disabled'}>&#9660;</button></div>`).join('')}</div>
 <div class="mp"><button class="go sm" id="tnstart">Start tournament</button><button class="sm" id="tnladder">Ladder</button><button class="sm" id="tnrandom">Random bots</button><button class="sm" id="tnreverse">Reverse</button></div>
 <p class="note">${D.pairing==='seed'?'Seeded: slot 1 meets the last slot, slot 2 the one before it, and so on.':D.pairing==='list'?'As listed: slots 1 and 2 meet, 3 and 4, and so on.':'A random draw when the tournament starts.'} Drag a row or use the arrows to change the order.${SECOND_PILOT?'':' A second local pilot needs a second controller map, which the input system does not have yet, so that slot is not offered.'}</p>`}
/* ---- the bracket */
function box(T,m,pl){const live=(TN.cur?.id===m.id)||(TN.sim?.m.id===m.id),can=pl.includes(m)&&!TN.cur&&!TN.sim&&!live,kind=B.matchKind(T,m);
 const row=(i,s)=>`<div class="tns${m.score&&i!=null?(m.w===i?' win':' lose'):''}${i!=null&&B.isHuman(T,i)?' hu':''}"><u>${i==null?'':i+1}</u><span>${i==null?'<i>to be decided</i>':esc(B.entrantName(T,i))}</span><b>${s==null?'':s}</b></div>`;
 const act=m.void?'<small>not needed</small>':live?`<small class="tnlive" data-live="${m.id}">${liveText()}</small>`:can?(kind==='play'?`<button class="sm go" data-act="play" data-id="${m.id}">Play</button>`:`<button class="sm" data-act="watch" data-id="${m.id}">Watch</button><button class="sm" data-act="sim" data-id="${m.id}">Simulate</button>`):'';
 return`<div class="tnm${live?' live':''}${can?' next':''}${m.void?' void':''}">${row(m.a,m.score?.[0])}${row(m.b,m.score?.[1])}${act?`<div class="tna">${act}</div>`:''}</div>`}
const liveText=()=>TN.sim?`Simulating ${GS.score[0]}–${GS.score[1]} · ${clock(TN.sim.t)}${TN.sim.t>=TN.sim.len?' OT':''}`:TN.cur?.how==='watch'?'Watching':'In play';
const cols=(T,rounds,pl)=>`<div class="tnb">${rounds.map(r=>`<div class="tnr"><h4>${esc(r.name)}</h4>${r.matches.map(m=>box(T,m,pl)).join('')}</div>`).join('')}</div>`;
function table(T){const Sx=B.standings(T),sw=T.format==='swiss';
 return`<table class="rt tnt"><thead><tr><th>#</th><th>Entrant</th><th>P</th><th>W</th><th>L</th><th>GF</th><th>GA</th><th>GD</th>${sw?'<th title="opponents\' points">Opp</th>':''}<th>Pts</th></tr></thead><tbody>${Sx.map(r=>`<tr class="${T.done&&r.i===T.champion?'champ':''}${B.isHuman(T,r.i)?' hu':''}"><td>${r.rank}</td><td>${esc(B.entrantName(T,r.i))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gf-r.ga>0?'+':''}${r.gf-r.ga}</td>${sw?`<td>${r.opp}</td>`:''}<td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table>`}
function renderBracket(T){const pl=B.playable(T),R=B.roundsOf(T),elim=T.format==='single'||T.format==='double',nb=nextBots(),busy=!!(TN.cur||TN.sim),played=T.results.length,total=T.matches.filter(m=>!m.void).length-(T.format==='double'&&!T.done?1:0);
 const head=`<div class="tnbar"><span class="note">${esc(B.formatName(T.format))} · ${T.size} entrants · ${T.team}v${T.team} · ${esc(lenName(T.len))} · ${played} of ${total} matches played</span>
  ${TN.queue?'<button class="sm" id="tnstopq">Stop after this match</button>':`<button class="sm" id="tnsimall"${nb&&!busy?'':' disabled'}>Simulate all bot matches</button>`}<button class="sm" id="tnquit"${busy?' disabled':''}>Abandon</button></div>`;
 const body=elim?(T.format==='double'?`<h3 class="pfh">Winners bracket</h3>${cols(T,R.filter(r=>r.br==='w'||r.br==='f'),pl)}<h3 class="pfh">Losers bracket</h3>${cols(T,R.filter(r=>r.br==='l'),pl)}`:cols(T,R,pl)):`${table(T)}<h3 class="pfh">Matches</h3>${cols(T,R,pl)}`;
 return head+body}
function renderResults(T){const c=T.champion,hu=B.isHuman(T,c),tr=TN.trophy,R=B.roundsOf(T),elim=T.format==='single'||T.format==='double';
 return`<div class="tnwin${hu?' mine':''}"><i>${TROPHY}</i><div><span>${hu?'You won the tournament':'Champion'}</span><b>${esc(B.entrantName(T,c))}</b><small>${esc(B.formatName(T.format))} · ${T.size} entrants · ${T.team}v${T.team}${hu&&tr?` · +${tr.xp} XP${tr.lv1>tr.lv0?` · level ${tr.lv1}`:''}${tr.n>1?` · trophy ${tr.n}`:''}`:''}</small></div>
  <div class="mp"><button class="go sm" id="tnnew">New tournament</button></div></div>
 <h3 class="pfh">Final standings</h3>${table(T)}${elim?`<h3 class="pfh">Bracket</h3>${T.format==='double'?cols(T,R.filter(r=>r.br==='w'||r.br==='f'),[])+cols(T,R.filter(r=>r.br==='l'),[]):cols(T,R,[])}`:''}`}
let lastVer=-1;
export function renderTournament(){const T=TN.T;lastVer=TN.ver;$('tnsum').textContent=T?T.done?'Finished':`${T.results.length} of ${T.matches.filter(m=>!m.void).length} played`:'';
 $('tnbody').innerHTML=T?T.done?renderResults(T):renderBracket(T):renderSetup()}
const open=()=>{renderTournament();menuScreen('tournament')};
/* a tournament match over or left: back to your own mode (its menu demo), as leaving Training does, so Play vs bots is a normal match again */
function backToGame(){if(GS.GM!=='tourn'||TN.cur||TN.sim)return;setGame(S.game);if(GS.demo)startDemo()}
/* ---- clicks and changes on the screen, delegated */
function onClick(e){const b=e.target.closest('button');if(!b)return;const id=b.id,act=b.dataset.act;
 if(act){const m=b.dataset.id;if(act==='play'){if(!tournPlay(m))renderTournament()}else if(act==='watch'){if(!tournWatch(m))renderTournament()}else if(act==='sim'){tournSim(m);renderTournament()}return}
 if(b.dataset.mv){const[i,d]=b.dataset.mv.split(':').map(Number);moveSlot(i,i+d);renderTournament();$('tnslots').querySelector(`[data-mv="${i+d}:${d}"]`)?.focus({preventScroll:true});return}
 if(id==='tnstart'){const setup=cleanSetup(names())({...D,seed:Math.random()*2**31|0,entrants:D.entrants.slice(0,D.size)});if(setup.entrants.some(x=>!x))return;tournNew(setup);renderTournament()}
 else if(id==='tnladder'){defaults();renderTournament()}
 else if(id==='tnreverse'){const h=D.entrants.slice(0,D.size).reverse();D.entrants.splice(0,D.size,...h);renderTournament()}
 else if(id==='tnrandom'){for(let i=0;i<D.size;i++)if(D.entrants[i].kind!=='human')D.entrants[i]=botAt(Math.floor(Math.random()*DIFF.length));renderTournament()}
 else if(id==='tnsimall'){tournSimAll();renderTournament()}else if(id==='tnstopq'){tournStopQueue();renderTournament()}
 else if(id==='tnquit'){if(TN.T&&confirm('Abandon this tournament? Its results are lost.')){tournAbandon();renderTournament()}}
 else if(id==='tnnew'){tournAbandon();renderTournament()}}
function onChange(e){const s=e.target;if(!(s instanceof HTMLSelectElement))return;
 if(s.dataset.slot!=null){setEntrant(+s.dataset.slot,s.value);renderTournament();return}
 const k={tn_format:'format',tn_size:'size',tn_team:'team',tn_len:'len',tn_pair:'pairing',tn_mates:'mates'}[s.id];if(!k)return;D[k]=k==='format'||k==='pairing'?s.value:+s.value;renderTournament()}
let drag=-1;
function onDrag(e){const row=e.target.closest?.('.tnslot');if(e.type==='dragstart'){if(!row)return;drag=+row.dataset.i;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(drag))}catch(x){}}
 else if(e.type==='dragover'){if(row&&drag>=0){e.preventDefault();row.classList.add('over')}}else if(e.type==='dragleave'){row?.classList.remove('over')}
 else if(e.type==='drop'){e.preventDefault();if(row&&drag>=0){moveSlot(drag,+row.dataset.i);renderTournament()}drag=-1}else if(e.type==='dragend')drag=-1}
export function initTournament(){tournInit();defaults();
 $('tournbtn').addEventListener('click',renderTournament);  /* ui/menu.js opens the screen (data-scr); the body is rendered fresh */
 const body=$('tnbody');body.addEventListener('click',onClick);body.addEventListener('change',onChange);for(const t of['dragstart','dragover','dragleave','drop','dragend'])body.addEventListener(t,onDrag);
 /* the pause menu during a tournament match: Restart restarts that match, Leave goes back to the bracket (the match stays to be played) */
 const play=$('play').onclick;$('play').onclick=()=>{const c=TN.cur;if(c&&!GS.demo){tournStop();(c.how==='watch'?tournWatch:tournPlay)(c.id);return}play()};
 const leave=$('leave').onclick;$('leave').onclick=()=>{const t=!!TN.cur;tournStop();leave();if(t){backToGame();open()}};
 addHud('tourn',frame)}
/* per rendered frame: drive a simulation, keep the spectator HUD tidy, open the bracket when a match's menu comes back, refresh the screen on changes */
let spectHud=false;
function frame(){if(TN.sim)simTick();
 const sp=!!GS.spect&&!GS.player&&!GS.demo;if(sp!==spectHud){spectHud=sp;$('dial').hidden=sp;$('xh').hidden=sp}
 if(TN.after&&GS.demo&&GS.menuOpen&&!TN.sim){TN.after=null;backToGame();open();return}
 if($('scr-tournament').hidden)return;if(TN.ver!==lastVer){renderTournament();return}
 if(TN.sim){const el=$('tnbody').querySelector(`[data-live="${TN.sim.m.id}"]`);if(el){const t=liveText();if(el.textContent!==t)el.textContent=t}}}
