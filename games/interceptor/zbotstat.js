// Zombies bot legibility and coverage, for the Bot Spectator (zspectate.js / zbotfly.js) and the headless benchmark (tools/zombies-bench.mjs --real).
//   Z.bot.intent   what the bot is doing and why: {kind, sub, why, target: {x, y, z, label} | null, t, w}. kind is one of shop, launch, station, transit,
//                  intercept, lock, line, boss, sortie, bomb, return, strike, relaunch, idle. The camera (zspectate.js) can follow target.
//   the HUD line   the same, as one small line under the spectator bar ("Holding the north-east ridge: 6 inbound"), with the last special action
//                  (swarm strike, freeze, a bomb on a convoy) next to it for a few seconds
//   coverage       map cells flown over (300 m cells of the operational area), places visited (ridges, the river valley, villages, sites, forward
//                  positions), systems used (the arsenal's weapons and defences, the swarm's commands, lock-on, rocket assist, perks, shop actions,
//                  sorties and strikes); logged at every wave end (console + the report's waves) and read by the benchmark (Z.bot.summary())
//   health         stuck watch: a flying bot that has not moved for 25 s in a state that should move is counted (Z.bot.stuck), with where and why
// Z.bot exists once the first Bot Spectator run starts and stays; Z.bot.on says whether a bot is flying now. Pure logic plus one DOM line.
import {createMap,dirName} from './zbotmap.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v;
const MOVES=new Set(['station','transit','intercept','lock','sortie','bomb','return','relaunch']);  /* states in which a bot that stays put is stuck */
/* the systems a bot can use; avail() says whether this build / run has it (the denominator of "systems used") */
const SYS=[
 ['wpn:net','Net drone'],['wpn:flech','Flechette'],['wpn:flare','Flare pod'],['wpn:cluster','Cluster'],['wpn:emp','EMP'],['wpn:dart','Kinetic dart'],
 ['def:laser','Laser'],['def:mwave','Microwave dome'],['def:barrage','Balloon barrage'],['def:smoke','Smoke'],['def:carrier','Drone carrier'],
 ['swarm:screen','Swarm screen'],['swarm:attack','Swarm attack'],['swarm:strike','Swarm strike'],['swarm:form','Swarm formations'],
 ['lock','Lock-on'],['rocket','Rocket assist'],['perk:freeze','Freeze'],['perk:mark','Mark'],['perk:air','Airstrike'],['perk:lure','Lure beacon'],
 ['shop:place','Helpers placed'],['shop:upgrade','Upgrades'],['shop:refit','Refits'],['shop:repair','Repairs'],['shop:expand','Expansion'],['shop:sell','Selling'],['shop:supply','Supplies'],['shop:perk','Perks bought'],
 ['chain','Kill chain'],['warn','Launch alerts'],
 ['sortie:fly','Sorties'],['sortie:convoy','Convoys bombed'],['sortie:launch','Launch sites bombed'],['sortie:factory','Factories bombed'],['sortie:strike','Strike orders'],
 ['camp','Campaign loadout']];
export const SYSTEMS=SYS;
export function installBot(E){
 if(E.bot)return E.bot;
 const {api,G,Z}=E,$=id=>document.getElementById(id);
 const B={get on(){return !!(B.pilot&&E.spec&&E.spec.on)},P:null,pilot:null,map:null,t:0,intent:{kind:'idle',sub:'',why:'',target:null,t:0,w:0},hist:[],used:new Map(),log:[],flashT:0,flash:'',stuck:0,stuckLog:[],modeT:{},
  wait:()=>!!(B.sortie&&B.sortie.on()),sortie:null,wave0:0,sr:{n:0,home:0,bombs:0,hits:0,lost:0,kills:{convoy:0,launch:0,factory:0},banked:0}};
 E.bot=B;Z.bot=B;
 B.map=createMap(E);
 B.get=()=>B.map;
 // ---------- a run starts (a pilot is created) ----------
 B.begin=(P,pilot)=>{B.P=P;B.pilot=pilot;B.t=0;B.hist.length=0;B.used.clear();B.log.length=0;B.stuck=0;B.stuckLog.length=0;B.modeT={};B.map.reset();B.flash='';B.flashT=0;B.still=null;B.lastW=0;B.wave0=0;
  Object.assign(B.sr,{n:0,home:0,bombs:0,hits:0,lost:0,kills:{convoy:0,launch:0,factory:0},banked:0});B.set('idle','Starting',null);return B};
 // ---------- intent ----------
 /* the history keeps a line when the kind or the words change, not when only a distance or a clock ticks over */
 const sig=s=>s.replace(/[0-9][0-9.,]*/g,'#');let sigNow='';
 B.set=(kind,why,target=null,sub='')=>{const I=B.intent;I.target=target;if(I.kind===kind&&I.why===why)return;const g=sig(why);
  if(I.kind!==kind||g!==sigNow){B.hist.push({k:kind,why,t:+B.t.toFixed(1),w:G.wave});if(B.hist.length>80)B.hist.shift();I.t=B.t;sigNow=g}
  I.kind=kind;I.sub=sub;I.why=why;I.w=G.wave};
 /* a special action worth a line for a few seconds, counted as a system used (id) */
 B.use=(id,flash)=>{if(!B.on)return;let u=B.used.get(id);if(!u)B.used.set(id,u={n:0,w0:G.wave,w1:G.wave});u.n++;u.w1=G.wave;if(flash){B.flash=flash;B.flashT=B.t+6}};
 B.did=id=>B.used.has(id);
 // ---------- coverage ----------
 const avail=id=>{
  if(id.startsWith('wpn:'))return !!Z.ars&&!Z.ars.ban?.has(id.slice(4));
  if(id.startsWith('def:'))return !!Z.ars&&!Z.ars.ban?.has(id.slice(4));
  if(id.startsWith('swarm:'))return !!Z.sw;
  if(id==='lock')return !!Z.lk;if(id==='rocket')return !!Z.rk;
  if(id==='perk:lure')return !!(G.kit||[]).includes('lure');
  if(id==='chain')return !!Z.chain;if(id==='warn')return !!Z.warn;
  if(id.startsWith('sortie:'))return !!E.so;
  if(id==='camp')return !!Z.cp?.on;
  return true};
 B.systems=()=>SYS.filter(([id])=>avail(id));
 B.summary=()=>{const sys=B.systems(),used=sys.filter(([id])=>B.used.has(id)),F=B.map.featStat();
  return{cells:B.map.count(),cellsAll:B.map.all(),cellTotal:B.map.total,pct:+B.map.pct().toFixed(3),places:F.v,placesTotal:F.n,placeBy:Object.fromEntries(Object.entries(F.by).map(([k,v])=>[k,v.v+'/'+v.n])),
   systems:used.length,systemsTotal:sys.length,systemIds:used.map(([id])=>id),unused:sys.filter(([id])=>!B.used.has(id)).map(([id])=>id),sorties:{...B.sr,kills:{...B.sr.kills}},stuck:B.stuck,stuckLog:B.stuckLog.slice(0,6),wave:G.wave,log:B.log.map(l=>[l.w,l.cells,l.places,l.systems])}};
 /* two or three rows for the spectator's report (zspectate.js over()) */
 B.statRow=()=>{const s=B.summary();return`<span>Map covered</span><b>${Math.round(s.pct*100)}% · ${s.cells} cells · ${s.places}/${s.placesTotal} places</b><span>Systems used</span><b>${s.systems} of ${s.systemsTotal}</b>${s.sorties.n?`<span>Sorties</span><b>${s.sorties.n} flown, ${s.sorties.home} home, ${s.sorties.bombs} bombs dropped</b>`:''}`};
 B.line=(final)=>{const s=B.summary();return`${final?'run':'wave '+G.wave}: ${s.cells} cells (${Math.round(s.pct*100)}% of the operational area), ${s.places}/${s.placesTotal} places, ${s.systems}/${s.systemsTotal} systems${B.sr.n?`, ${B.sr.n} sortie${B.sr.n>1?'s':''} (${B.sr.home} back home, ${B.sr.hits} parts destroyed)`:''}`};
 /* wave end: log it, and put it on the spectator's wave record (its report and JSON export) */
 const ARSD=['laser','mwave','barrage','smoke','carrier'];
 function waveEnd(){const A=Z.ars?.stats?.();if(A){for(const[w,n]of Object.entries(A.wk||{}))if(n>0&&w!=='std'&&!B.did('wpn:'+w))B.use('wpn:'+w);for(const k of ARSD)if((A.dmax?.[k]|0)>0&&!B.did('def:'+k))B.use('def:'+k)}
  const s=B.summary();B.log.push({w:G.wave,cells:s.cells,pct:s.pct,places:s.places,systems:s.systems});
  const rec=E.spec?.sp?.stats?.waves;if(rec&&rec.length)rec[rec.length-1].cov={cells:s.cells,pct:s.pct,places:s.places,systems:s.systems,stuck:s.stuck};
  try{console.info('[bot] '+B.line())}catch(e){}}
 /* a shop step ran (zbotbrain.js shopSteps): s = the step, r = what it returned */
 const SHOPSYS={place:'shop:place',upgrade:'shop:upgrade',refit:'shop:refit',repair:'shop:repair',rebuild:'shop:repair',expand:'shop:expand',sell:'shop:sell',supply:'shop:supply',buy:'shop:perk',chain:'chain',strike:'sortie:strike'};
 B.shop=(s,r)=>{if(!B.on||r===false)return;const id=SHOPSYS[s.what];if(id)B.use(id);if(s.what==='place'&&ARSD.includes(s.k))B.use('def:'+s.k)};
 // ---------- one sim step ----------
 let lastState='',still=null;
 B.tick=dt=>{if(!B.on)return;B.t+=dt;
  if(G.state!==lastState){if(lastState==='wave'&&G.state!=='wave')waveEnd();lastState=G.state;still=null}
  const me=api.player;if(!me||me.dead>0){still=null;return}
  const p=me.p,agl=p.y-api.gh(p.x,p.z);B.map.mark(p.x,p.z,agl);
  const nf=B.map.visit(p.x,p.z,p.y,B.t);if(nf.length&&G.state==='wave'){const f=nf[0];B.flash=`First time over ${f.n}`;B.flashT=B.t+4}
  const lk=!!(Z.lk&&Z.lk.t);if(lk&&!B.lkWas)B.use('lock');B.lkWas=lk;const rk=!!(Z.rk&&Z.rk.st&&Z.rk.st.t>0);if(rk&&!B.rkWas)B.use('rocket','Rocket assist burn');B.rkWas=rk;
  const k=B.intent.kind;B.modeT[k]=(B.modeT[k]||0)+dt;
  // stuck: in a state that should be moving, less than 30 m in 25 s
  if(!MOVES.has(k)||(me.t||0)<8){still=null;return}
  if(!still||still.k!==k)still={k,x:p.x,y:p.y,z:p.z,t:B.t};
  else if(Math.hypot(p.x-still.x,p.z-still.z)>30||Math.abs(p.y-still.y)>30){still.x=p.x;still.y=p.y;still.z=p.z;still.t=B.t}
  else if(B.t-still.t>25){B.stuck++;if(B.stuckLog.length<12)B.stuckLog.push({w:G.wave,k,why:B.intent.why,x:Math.round(p.x),z:Math.round(p.z),agl:Math.round(agl)});still.t=B.t}};
 // ---------- the HUD line ----------
 {const css=document.createElement('style');css.textContent=`#zspwhy{position:fixed;left:50%;transform:translateX(-50%);z-index:7;pointer-events:none;font:700 13px var(--mono,monospace);color:#fff;text-shadow:0 0 4px #000;padding:3px 12px;border-radius:6px;background:rgba(4,18,26,.66);border:1px solid rgba(95,227,255,.35);max-width:min(780px,92vw);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.zsp-sortie #zspbar{top:calc(140px + env(safe-area-inset-top,0px))}#zspwhy[hidden]{display:none}#zspwhy b{color:#ffc640;letter-spacing:.12em;font-size:11px;margin-right:8px;text-transform:uppercase}#zspwhy em{font-style:normal;color:#3ddc84;margin-left:10px;font-size:12px}`;document.head.append(css)}
 let hudLast='',hudT=0;
 B.hud=()=>{if(B.on&&G.state==='base'&&!(B.sortie&&B.sortie.on())){const c=E.spec.sp&&E.spec.sp.cur;B.set('shop',c?c.why:'Between waves: looking over the shop',null)}
  let el=$('zspwhy');const now=performance.now();if(now-hudT<90&&el)return;hudT=now;
  const so=!!(B.on&&B.sortie&&B.sortie.on());document.body.classList.toggle('zsp-sortie',so);const show=B.on&&G.state!=='over'&&(G.state!=='base'||so);
  if(!show){if(el)el.hidden=true;return}
  if(!el){el=document.createElement('div');el.id='zspwhy';el.setAttribute('aria-live','off');document.body.append(el)}
  const bar=$('zspbar'),r=bar&&!bar.hidden?bar.getBoundingClientRect():null;el.style.top=(r?Math.round(r.bottom+4):120)+'px';el.hidden=false;
  const I=B.intent,h=`<b>${I.kind}</b>${I.why.replace(/[<>&]/g,'')}${B.flash&&B.t<B.flashT?`<em>${B.flash.replace(/[<>&]/g,'')}</em>`:''}`;if(h!==hudLast)el.innerHTML=hudLast=h};
 // ---------- wrappers, installed once: they only count while a bot flies ----------
 const wrap=(o,k,f)=>{if(!o||typeof o[k]!=='function')return;const g=o[k];o[k]=function(...a){const r=g.apply(this,a);try{f(r,...a)}catch(e){}return r}};
 const st0=Z.step;Z.step=dt=>{st0(dt);if(B.on)B.tick(dt)};
 const hu0=Z.hud;Z.hud=dt=>{hu0(dt);if(B.on||$('zspwhy'))B.hud()};
 const zs0=Z.stop;Z.stop=()=>{zs0();document.body.classList.remove('zsp-sortie');$('zspwhy')?.remove()};
 if(Z.sw)wrap(Z.sw,'command',(r,c,arg)=>{if(!B.on||!r)return;const s=Z.sw.mine,nm=c==='form#'||c==='next'||c==='form'?'form':c;
  B.use('swarm:'+(nm==='form'?'form':c),c==='strike'?'Swarm: strike':c==='attack'?'Swarm: attack the lock':c==='screen'?'Swarm: '+(s?.mode||'screen'):null)});
 if(Z.pk)wrap(Z.pk,'use',(r,k)=>{if(B.on&&r)B.use('perk:'+k,{freeze:'Freeze: the worst track slows',mark:'Mark: helpers hit it twice as hard',air:'Airstrike on the crowd',lure:'Lure beacon down'}[k])});
 if(Z.warn)wrap(Z.warn,'act',(r,a)=>{if(B.on&&r!==false)B.use('warn',{harden:'Launch alert: hardening the site',evac:'Launch alert: evacuating the site',decoy:'Launch alert: decoy site'}[a]||null)});
 return B}
export {dirName};
