/* Zombies debug mode: a panel for the owner and Riley to test things and bring information back. Off by default. On with ?debug=1 (remembered in the save; ?debug=0 forgets it) or
   Ctrl+Shift+D (toggles, remembered); an automated browser (the benches, the bots' harnesses) only with ?debug=1 in the URL, and then nothing is saved. F8 shows or hides the panel
   (or the DBG button), F9 marks a moment, F10 copies the report.
   Panel: Live (FPS, frame p99, ticks and frames, tracks, draw calls, memory, your state, the wave plan, the boss phase, the co-op role), Cheats (zdbgcheat.js: money, grant any perk /
   helper / supply / weapon, Rocket Assist and its burn, jump to a wave, spawn any enemy or boss at a bearing, god mode, time scale and pause / step, to the pad, clear tracks,
   weather, difficulty, unlock the shop and the codex, reset the save) and Report. Every cheat marks the run: while it is marked nothing reaches the leaderboard, the best wave, the
   codex, the goals or the campaign (the save gets the old values back, in memory and on disk), and a new run starts clean. The host's marks reach the co-op clients (znet.js event D).
   Report (zdbgreport.js): "Copy report" copies a text + JSON bundle to the clipboard and downloads it (an optional screenshot as a separate PNG): the build (version.js, written by
   tools/version.mjs), the browser and GPU, settings and save, the last 200 console lines (zdbglog.js), the last 60 s of game events, the FPS history, a state snapshot and the cheats
   used. "Mark" (F9) notes the time and an optional note, with the 60 s before it kept, so a tester can say "it happened at 14:03:10".
   Co-op: the host cheats, a client gets readouts and its own report. The Bot Spectator: readouts only. Harness: Z.dbg (tools/zombies-test.mjs, "debug"). */
import {KIND,ITEMS,PERK,ZDIFF,ORDER} from './zdata.js';
import {WPN} from './zarsdata.js';
import {LOCK} from './zswdata.js';
import {RK} from './zrocket.js';
import {hooks} from '../../engine/settings.js';
import {install as logOn,ev,events,setCtx,fps,consoleLines,consoleCount,clock,wall} from './zdbglog.js';
import {initCheats,WEATHERS} from './zdbgcheat.js';
import {buildReport,fileName,download,copy,shot,dataBlob} from './zdbgreport.js';
export const PROT=['zruns','zbests','zbest','zboss','zcodex','zmeta','zend','zcamp'];  /* the records a debug run must not touch */
const SPEEDS=[.25,.5,1,2,4,8],esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);
const tally=L=>{const o={};for(const k of L){const[a,n]=String(k).split(':');o[a]=(o[a]|0)+(+n||1)}return Object.entries(o).map(([k,n])=>`${k}x${n}`).join(' ')||'-'};

export function initDebug(api,G,Z){
 const {TH,SITES,S,save}=api,$=id=>document.getElementById(id),Q=new URLSearchParams(location.search),auto=!!navigator.webdriver;
 const D={on:false,open:S.zdbgo!==0,openMenu:false,marked:false,carry:false,snap:null,snapJ:null,god:false,ts:1,paused:false,unlock:false,codex:false,instlock:false,cheats:[],marks:[],runs:0,reverted:0,arm:0,reset:false,last:null,
  get spectating(){return!!window.__z?.spec?.on},get client(){return!!Z.mirror}};
 let ui=null,pollT=0,uiT=0,tT=0,started=false;
 const pv={state:'',wave:-1,dead:false,err:0,calls:new WeakSet(),boss:new WeakMap()};

 /* ---------- marking a run and keeping its progress out of the save ---------- */
 function mark(name,args,remote){
  if(!D.marked){D.marked=true;D.carry=!G.on;D.snap={};D.snapJ={};for(const k of PROT){const j=JSON.stringify(S[k]);D.snapJ[k]=j;if(j!==undefined)D.snap[k]=JSON.parse(j)}ev('debug','run marked as a debug run')}
  else if(!G.on)D.carry=true;
  const c={n:D.cheats.length+1,run:D.runs,t:Math.round(performance.now()),clock:clock(performance.now()),wave:G.wave,state:G.state,name:(remote?'host: ':'')+name,args:(args||[]).filter(a=>a!=null).map(a=>typeof a==='object'?JSON.stringify(a):a)};
  D.cheats.push(c);if(D.cheats.length>200)D.cheats.shift();ev('cheat',`${c.name}(${c.args.join(',')})`);
  if(!remote)Z.netEv?.(['D',String(name).slice(0,24)]);ui?.sync()}
 hooks.persist=o=>{if(!D.marked||!D.snap)return o;const c={...o};for(const k of PROT){if(k in D.snap)c[k]=JSON.parse(JSON.stringify(D.snap[k]));else delete c[k]}return c};
 function enforce(){if(!D.marked||!D.snapJ)return;for(const k of PROT){if(JSON.stringify(S[k])!==D.snapJ[k]){if(D.snapJ[k]===undefined)delete S[k];else S[k]=JSON.parse(D.snapJ[k]);D.reverted++}}}
 const bd0=Z.board.record;Z.board.record=(d,w,co)=>D.marked?null:bd0(d,w,co);
 const on0=Z.overNote;Z.overNote=()=>(on0?.()||'')+(D.marked?'<p class="zhint"><b class="co">Debug run</b>: nothing from it was saved (no leaderboard entry, best wave, codex, goal or campaign progress).</p>':'');
 const netEv=a=>{if(Array.isArray(a)&&D.client)mark(String(a[0]||'cheat').replace(/[^\w .:-]/g,'').slice(0,24),[],true)};

 /* ---------- a run starts clean; the cheats' own switches go back ---------- */
 function resetToggles(){D.god=false;D.ts=1;D.paused=false;if(!D.spectating)Z.stepCap=0;if(D.unlock)C.raw.unlock(false);if(D.codex)C.raw.codex(false);if(D.instlock)C.raw.instantLock(false)}
 const z0=Z.start;Z.start=()=>{D.runs++;if(D.marked&&!D.carry){resetToggles();D.marked=false;D.snap=D.snapJ=null;ev('debug','a new run starts clean')}D.carry=false;if(D.paused)D.paused=false;z0();if(D.on)ev('run','run started');ui?.sync()};

 /* ---------- god mode, time ---------- */
 Z.god=why=>{if(!D.on||!G.on)return false;if(D.god&&why!=='det'){ev('god',`saved from ${why}`);return true}const me=api.player;if(me&&me.dead<=0)ev('death',`interceptor lost: ${why}`);return false};
 const s0=Z.step;Z.step=dt=>{s0(dt);if(D.on&&D.god){const me=api.player;if(me){me.mah=0;const rk=Z.rk;if(rk&&rk.st.t>0&&rk.st.t<RK.burn-RK.ramp-.3)rk.st.t=RK.burn-RK.ramp-.3}}};
 {const d0=Object.getOwnPropertyDescriptor(Z,'tsc'),base=()=>d0?d0.get?d0.get.call(Z):d0.value:1;Object.defineProperty(Z,'tsc',{get:()=>base()*(D.on?D.paused?0:D.ts:1),configurable:true})}
 {const if0=Z.itemFrom;Z.itemFrom=k=>D.on&&D.unlock?1:if0(k)}

 /* ---------- the cheats ---------- */
 const C=initCheats(api,G,Z,D,mark);
 D.msg=t=>{ui?.say(t)};D.refresh=()=>ui?.sync();

 /* ---------- game events for the report: what happened in the last minute ---------- */
 setCtx(()=>({w:G.wave,s:G.state}));
 let wrapped=false;
 function wrapEvents(){if(wrapped)return;wrapped=true;
  const k0=Z.kill;Z.kill=(t,cat)=>{const was=t.paid,c0=G.cash;k0(t,cat);if(D.on&&!was&&t.paid)ev('kill',`${t.k} by ${t.by||'?'} +$${Math.round(G.cash-c0)}`)};
  const i0=Z.impact;Z.impact=t=>{const s=t.tgt,h=s?.hp;i0(t);if(D.on&&s)ev('impact',`${t.k} hit ${s.n} ${Math.round(h)}->${Math.round(s.hp)}`)};
  const p0=Z.buyPerk;Z.buyPerk=k=>{p0(k);if(D.on)ev('buy',`perk ${k} level ${G.perks?.[k]|0}`)};
  const A=Z.base?.act;if(A)for(const n of['place','upgrade','refit','move','expand','rebuild','supply','repair','sell']){const f=A[n];if(typeof f!=='function')continue;
   A[n]=function(...a){const c0=G.cash,r=f.apply(this,a);if(D.on&&r)ev('buy',`${n} ${a.filter(x=>typeof x!=='object').join(' ')} $${Math.round(c0-G.cash)}`);return r}}}

 /* ---------- polling: edges the wrappers do not see (state, deaths, boss phases, radio calls, console errors), and the saved records held back ---------- */
 function poll(){
  if(D.marked)enforce();if(!D.on)return;
  const me=api.player;
  if(G.state!==pv.state||G.wave!==pv.wave){ev('wave',`wave ${G.wave} ${G.state}${G.state==='wave'?` (${G.wq.length} queued)`:''}`);pv.state=G.state;pv.wave=G.wave}
  const dead=!!me&&me.dead>0;if(dead!==pv.dead){pv.dead=dead;if(dead)ev('death','interceptor down');else if(me)ev('launch','interceptor on the mat')}
  for(const e of Z.bosses?.encs||[]){const b=e.main?.bs;let s=pv.boss.get(e);if(!s){s={ph:-1,over:false};pv.boss.set(e,s);ev('boss',`${e.id} appears`)}
   if(b&&b.ph!==s.ph){s.ph=b.ph;ev('boss',`${e.id} phase ${b.ph} ${e.D?.phases?.[b.ph]||''} hp ${b.hp}/${b.max}`)}if(e.over&&!s.over){s.over=true;ev('boss',`${e.id} ${e.won?'beaten':'over'}`)}}
  const R=Z.radio;if(R)for(const c of R.calls)if(!pv.calls.has(c)){pv.calls.add(c);ev('radio',`${c.who}: ${c.txt}`)}
  const n=consoleCount();if(n!==pv.err){const L=consoleLines(Math.max(1,Math.min(20,n-pv.err)));pv.err=n;const e=L.reverse().find(l=>l.lvl==='error');if(e){ev('error',e.msg);ui?.toast('console error logged: F10 copies a report')}}}

 /* ---------- readouts ---------- */
 const MB=1048576,k1=v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':String(v|0);
 function readout(){
  const me=api.player,f=fps.now(),ri=api.renderer.info,L=[],live=TH.filter(api.live).length,pf=performance.memory;
  L.push(`FPS ${f.fps}  avg ${f.avg} ms  p99 ${f.p99} ms  worst ${f.max} ms`);
  L.push(`tick ${api.tick}  frames ${fps.frames}  draw ${fps.calls} calls ${k1(fps.tris)} tris`);
  L.push(`tracks ${live} live / ${TH.length}  queue ${G.wq.length}  heap ${pf?Math.round(pf.usedJSHeapSize/MB)+' MB':'n/a'}  gl ${ri.memory.geometries} geo ${ri.memory.textures} tex`);
  if(me){const sp=me.v.length(),rk=Z.rk?.st;L.push(`you ${me.p.x.toFixed(0)}, ${me.p.y.toFixed(0)}, ${me.p.z.toFixed(0)}  ${sp.toFixed(0)} m/s  agl ${(me.p.y-api.gh(me.p.x,me.p.z)).toFixed(0)} m${me.dead>0?`  DOWN ${me.dead.toFixed(1)} s`:''}`);
   L.push(`battery ${Math.max(0,Math.round(100*(1-me.mah/api.BCAP)))}%  ${me.vc.toFixed(2)} V/cell  burn ${rk&&rk.t>0?rk.t.toFixed(1)+' s':rk?.armed?'armed':'-'}  swarm ${Z.sw?.drones?.length|0}`)}
  else L.push('you: no interceptor');
  L.push(`wave ${G.wave} ${G.state}${G.state==='wave'?`  ${(G.wt||0).toFixed(0)} s`:''}  ${Z.diff?.().n||'?'}  ${api.WX?.id||'-'}  cash $${Math.round(G.cash)}`);
  L.push(G.state==='base'&&G.next?`next: ${tally(G.next.list)}  raids ${G.next.brgs?.map(b=>(b*57.3).toFixed(0)).join('/')}`:`left: ${tally((G.wq||[]).map(q=>q.k))}`);
  const be=(Z.bosses?.encs||[]).filter(e=>!e.over);L.push(be.length?be.map(e=>{const b=e.main?.bs||{};return`boss ${e.id}: ${e.D?.phases?.[b.ph]||'phase '+b.ph}  ${b.hp}/${b.max}`}).join(' | '):'boss: none');
  L.push(`co-op: ${Z.netRole?.()||'solo'}${Z.pilots?.()?` (${Z.pilots().length} pilots)`:''}${D.spectating?'  spectator':''}  console ${consoleCount()}`);
  return L.join('\n')}

 /* ---------- marks and the report ---------- */
 function doMark(note){const t=Math.round(performance.now()),m={n:D.marks.length+1,t,clock:clock(t),wall:wall(t),note:String(note||'').slice(0,200),wave:G.wave,state:G.state,fps:fps.now(),
   before:events(60000).slice(-150).map(e=>({...e,at:clock(e.t)})),console:consoleLines(20),history:fps.hist.slice(-10)};
  D.marks.push(m);if(D.marks.length>12)D.marks.shift();ev('mark',`#${m.n} ${m.note}`);ui?.toast(`MARK #${m.n} at ${m.clock}${m.note?' - '+m.note:''}`);ui?.sync();return m}
 const report=async()=>D.last=await buildReport(api,G,Z,D);
 async function copyReport(o={}){const r=await report(),how=await copy(r.text),file=download(fileName(r.data,'txt'),new Blob([r.text],{type:'text/plain'}));let png='';
  if(o.shot){const u=await shot(api);if(u)png=download(fileName(r.data,'png'),dataBlob(u))}
  ev('report',`report ${how?'copied':'saved'} ${file}`);ui?.say(how?`report copied and saved as ${file}${png?' + screenshot':''}`:`could not use the clipboard: saved ${file}; the text is in the box below`);if(!how)ui?.box(r.text);
  return{how,file,png,bytes:r.text.length}}

 /* ---------- the panel ---------- */
 function build(){
  const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./zdebug.css',import.meta.url).href;document.head.append(l);
  const opt=(v,t)=>`<option value="${v}">${esc(t)}</option>`,grp=(n,a)=>a.length?`<optgroup label="${n}">${a.join('')}</optgroup>`:'';
  const items=grp('Perks',Object.keys(PERK).map(k=>opt('perk:'+k,ITEMS[k]?.n||k)))+grp('Helpers',Object.keys(ITEMS).filter(k=>ITEMS[k].type==='helper').map(k=>opt('helper:'+k,ITEMS[k].n)))+
   grp('Supplies',Object.keys(ITEMS).filter(k=>ITEMS[k].type==='supply').map(k=>opt('supply:'+k,ITEMS[k].n)))+grp('Pilot weapons',Object.keys(WPN).map(k=>opt('weapon:'+k,WPN[k].n)));
  const kinds=grp('Enemies',[...ORDER,'boss'].filter(k=>KIND[k]).map(k=>opt(k,KIND[k].n)))+grp('Bosses and parts',Object.keys(KIND).filter(k=>KIND[k].bossy).map(k=>opt(k,KIND[k].n+(KIND[k].minor?' (part)':''))));
  const el=document.createElement('div');el.id='zdbg';el.hidden=true;
  el.innerHTML=`<div class="dh"><b>DEBUG</b><i id="zdm"></i><button data-a="min" title="F8">hide</button></div><div class="db">
<details open><summary>Live</summary><pre id="zdr"></pre></details>
<details open class="cheats"><summary>Cheats <small>mark the run: nothing is saved</small></summary>
 <div class="r"><label>Money</label><input id="zd-money" type="number" value="10000" step="1000"><button data-a="money">add</button><button data-a="setmoney">set</button></div>
 <div class="r"><label>Grant</label><select id="zd-item">${items}</select><input id="zd-lvl" type="number" min="0" max="5" placeholder="top" title="perk level, empty = top"><button data-a="grant">Grant</button></div>
 <div class="r"><button data-a="allperks">All perks</button><button data-a="allweap">All weapons</button><button data-a="burn">Rocket + burn</button></div>
 <div class="r"><label>Wave</label><input id="zd-wave" type="number" min="1" value="10"><button data-a="wave">Jump to</button><button data-a="skip">Skip wave</button></div>
 <div class="r"><label>Spawn</label><select id="zd-kind">${kinds}</select><input id="zd-n" type="number" min="1" value="3" title="how many"><input id="zd-brg" type="number" value="0" title="bearing in degrees: 0 north, 90 east"><input id="zd-rng" type="number" placeholder="m" title="range in metres, empty = the kind's own"><button data-a="spawn">Spawn</button></div>
 <div class="r tg"><button data-a="god" id="zd-god">God mode</button><button data-a="unlock" id="zd-unlock">Unlock shop</button><button data-a="codex" id="zd-codex">Unlock codex</button><button data-a="ilock" id="zd-ilock">Instant lock</button></div>
 <div class="r"><label>Time</label><select id="zd-ts">${SPEEDS.map(s=>opt(s,s+'x')).join('')}</select><button data-a="pause" id="zd-pause">Pause</button><button data-a="step1">+1 tick</button><button data-a="step12">+0.1 s</button></div>
 <div class="r"><button data-a="pad">To pad</button><button data-a="clear">Clear tracks</button><button data-a="repair">Repair sites</button></div>
 <div class="r"><label>Weather</label><select id="zd-wx">${WEATHERS.map(w=>opt(w,w)).join('')}</select><button data-a="wx">Set</button></div>
 <div class="r"><label>Difficulty</label><select id="zd-df">${ZDIFF.map((d,i)=>opt(i,d.n)).join('')}</select><button data-a="df">Set</button><button data-a="reset" class="dng">Reset save</button></div>
</details>
<details open><summary>Report</summary>
 <div class="r"><input id="zd-note" placeholder="what looked odd?" maxlength="200"><button data-a="mark" title="F9">Mark</button></div>
 <div class="r"><button data-a="copy" title="F10">Copy report</button><label class="ck"><input type="checkbox" id="zd-shot"> screenshot</label></div>
 <div id="zd-marks"></div><textarea id="zd-out" readonly hidden rows="6"></textarea></details></div><div id="zd-msg"></div>`;
  document.body.append(el);
  const btn=document.createElement('button');btn.id='zdbgbtn';btn.textContent='DBG';btn.title='debug panel (F8)';btn.hidden=true;btn.onclick=()=>{toggle(true);btn.blur()};document.body.append(btn);
  const tt=document.createElement('div');tt.id='zdtoast';tt.hidden=true;tt.setAttribute('role','status');document.body.append(tt);
  const q=s=>el.querySelector(s),v=s=>q(s).value,num=s=>{const x=parseFloat(v(s));return Number.isFinite(x)?x:null};
  el.addEventListener('mousedown',e=>e.stopPropagation());
  el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key==='Escape')&&e.target.matches?.('input,select')){if(e.key==='Escape')e.stopPropagation();e.target.blur()}});  /* leave a field with Enter or Esc, so the game gets its keys back */
  el.addEventListener('change',e=>{if(e.target.id==='zd-ts')C.timeScale(+v('#zd-ts'));if(e.target.tagName==='SELECT')e.target.blur()});
  el.addEventListener('click',e=>{const b=e.target.closest('button[data-a]');if(!b)return;const a=b.dataset.a;
   if(a==='min')toggle(false);else if(a==='money')C.money(num('#zd-money')||0);else if(a==='setmoney')C.setMoney(num('#zd-money')||0);
   else if(a==='grant'){const[t,k]=v('#zd-item').split(':'),l=num('#zd-lvl');if(t==='perk')C.perk(k,l);else if(t==='helper')C.helper(k);else if(t==='supply')C.supply(k);else C.weapon(k)}
   else if(a==='allperks')C.allPerks();else if(a==='allweap')C.allWeapons();else if(a==='burn')C.burn();
   else if(a==='wave')C.wave(num('#zd-wave')||1);else if(a==='skip')C.skipWave();
   else if(a==='spawn')C.spawn(v('#zd-kind'),num('#zd-n')||1,num('#zd-brg')||0,num('#zd-rng')||0);
   else if(a==='god')C.god();else if(a==='unlock')C.unlock();else if(a==='codex')C.codex();else if(a==='ilock')C.instantLock();
   else if(a==='pause')C.pause();else if(a==='step1')C.step(1);else if(a==='step12')C.step(12);
   else if(a==='pad')C.toPad();else if(a==='clear')C.clearTracks();else if(a==='repair')C.repair();
   else if(a==='wx')C.weather(v('#zd-wx'));else if(a==='df')C.difficulty(+v('#zd-df'));else if(a==='reset')C.resetSave();
   else if(a==='mark'){doMark(v('#zd-note'));U.clearNote()}else if(a==='copy')copyReport({shot:q('#zd-shot').checked});
   b.blur();U.sync()});
  let msgT=0;
  const U={el,btn,
   say(t,keep){const m=q('#zd-msg');if(!m)return;m.textContent=t;m.hidden=false;clearTimeout(msgT);if(!keep)msgT=setTimeout(()=>{m.hidden=true},6000)},
   toast(t){tt.textContent=t;tt.hidden=false;clearTimeout(tT);tT=setTimeout(()=>{tt.hidden=true},4500)},
   box(t){const o=q('#zd-out');o.value=t;o.hidden=false;o.select()},
   note:()=>v('#zd-note'),clearNote(){q('#zd-note').value=''},shot:()=>q('#zd-shot').checked,
   sync(){const ro=D.spectating||D.client,show=D.on&&shown();el.hidden=!show;btn.hidden=!D.on||show;el.classList.toggle('ro',ro);
    q('#zdm').textContent=ro?(D.client?'co-op client: readouts only':'spectator: readouts only'):D.marked?'DEBUG RUN':'';q('#zdm').classList.toggle('mk',D.marked);
    for(const[id,on]of[['god',D.god],['unlock',D.unlock],['codex',D.codex],['ilock',D.instlock],['pause',D.paused]])q('#zd-'+id)?.classList.toggle('on',!!on);
    q('#zd-ts').value=String(D.ts);q('#zd-pause').textContent=D.paused?'Resume':'Pause';
    q('#zd-marks').innerHTML=D.marks.slice(-3).map(m=>`<div class="mk">#${m.n} ${m.clock} w${m.wave} ${esc(m.note)}</div>`).join('')},
   live(){const r=q('#zdr');if(r&&!el.hidden)r.textContent=readout()}};
  return U}
 /* the panel would cover the start menu and the pause menu, so there it stays a DBG button until asked for (F8 or the button); in a run it is shown unless hidden, and that is remembered */
 const inMenu=()=>!!api.menuOpen||!G.on,shown=()=>inMenu()?D.openMenu:D.open;
 function toggle(v){if(!D.on)return;if(inMenu())D.openMenu=v==null?!D.openMenu:!!v;else{D.open=v==null?!D.open:!!v;S.zdbgo=D.open?1:0;if(!auto)save()}ui?.sync()}

 /* ---------- on and off ---------- */
 function startRec(){if(started)return;started=true;const ri=api.renderer.info;ri.autoReset=false;
  fps.probe=()=>{fps.calls=ri.render.calls;fps.tris=ri.render.triangles;ri.reset()};fps.extra=()=>({tracks:TH.length,wave:G.wave,state:G.state});fps.start();wrapEvents()}
 function enable(v,remember=true){
  v=!!v;if(v===D.on)return D.on;
  if(v){logOn();ui=ui||build();startRec();D.on=true;pv.err=consoleCount();ev('debug','debug mode on');ui.toast('DEBUG ON: F8 panel, F9 mark a moment, F10 report')}
  else{D.on=false;resetToggles();if(started){started=false;api.renderer.info.autoReset=true;fps.probe=null;fps.stop()}ev('debug','debug mode off')}
  if(remember){if(v)S.zdbg=1;else delete S.zdbg;save()}
  ui?.sync();return D.on}

 /* ---------- keys: the chord works anywhere; F8 / F9 / F10 once on ---------- */
 addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.shiftKey&&e.code==='KeyD'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)enable(!D.on);return}
  if(!D.on||e.repeat)return;
  if(e.code==='F8'){e.preventDefault();toggle()}else if(e.code==='F9'){e.preventDefault();doMark(ui?.note());ui?.clearNote()}
  else if(e.code==='F10'){e.preventDefault();copyReport({shot:ui?.shot()})}},true);

 /* ---------- four times a second: the records held back, polling, the live readout. From the frame loop while a run draws, and from a timer for the menus and the base screen ---------- */
 function tickUI(){if(!D.on&&!D.marked)return;const now=performance.now();
  if(now-pollT>=240){pollT=now;poll()}if(D.on&&ui&&now-uiT>=240){uiT=now;ui.sync();ui.live()}}
 const v0=Z.visuals;Z.visuals=(dt,...r)=>{v0(dt,...r);tickUI()};
 setInterval(tickUI,250);

 Z.dbg={get on(){return D.on},get marked(){return D.marked},get open(){return D.open},get cheats(){return D.cheats},get marks(){return D.marks},get reverted(){return D.reverted},D,c:C,enable,toggle,mark:doMark,report,copyReport,netEv,readout,poll,PROT,fps,ev,events,consoleLines,get ui(){return ui}};
 Z.dbg.prot=()=>({snap:D.snapJ});

 /* the URL decides first, then the save (never in an automated browser without ?debug=1) */
 const qd=Q.get('debug');
 if(qd==='1')enable(true,!auto);else if(qd==='0'){if(S.zdbg){delete S.zdbg;save()}}else if(!auto&&S.zdbg===1)enable(true,false);
 if(D.on&&Q.has('report')){D.open=D.openMenu=true;ui.say('report mode: F10 or Copy report sends everything; an error also offers it',true);ui.sync()}
 return Z.dbg}
