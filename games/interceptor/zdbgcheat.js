/* The debug mode's cheats (zdebug.js): what a tester uses to reach a situation quickly. Every one goes through run(): it refuses when debug mode is off, in the
   Bot Spectator and on a co-op client (only the host cheats), marks the run as a debug run (zdebug.js: no leaderboard, best wave, codex, goal or campaign
   writes while it is marked) and records the use for the report. C.* are the same functions the panel's buttons call; the harness calls them too.
   Money, perks and helpers are granted outright (a helper in the first free position, a perk at its top level); Unlock shop opens every item whatever the
   wave; Unlock codex plays the whole roster for the session without writing the save (zcodex.js force). Co-op: the host's cheats ride on the host's state. */
import {KIND,ITEMS,PERK,ZDIFF,BUNKER_WAVE} from './zdata.js';
import {WPN,FLARE} from './zarsdata.js';
import {LOCK} from './zswdata.js';
import {RK} from './zrocket.js';
import {hooks} from '../../engine/settings.js';
const SITE_C={x:0,z:1950},rnd=(a,b)=>a+Math.random()*(b-a);
export const WEATHERS=['clear','scattered','golden','overcast','dusk','rain','fog','dust','snow','night','storm'];
export function initCheats(api,G,Z,D,mark){
 const {TH,SITES,S,save}=api,W0={},L0={t:LOCK.t,far:LOCK.far};
 const refuse=(name,why)=>{D.msg?.(`${name}: ${why}`);return false};
 /* o.run: needs a run in progress (not the menu, not the game-over screen) */
 const run=(name,args,fn,o={})=>{
  if(!D.on)return refuse(name,'debug mode is off');
  if(D.spectating)return refuse(name,'the Bot Spectator shows readouts only');
  if(D.client)return refuse(name,'only the host cheats in co-op');
  if(o.run&&(!G.on||G.state==='over'||api.demo))return refuse(name,'start a run first');
  mark(name,args);let r=null;try{r=fn()}catch(e){console.warn('debug cheat',name,e);r=null}D.refresh?.();return r};
 const def=()=>Z.def,base=()=>{if(G.state==='base')Z.base?.refresh?.()};

 /* ---------- money, perks, helpers, supplies, weapons ---------- */
 const lvlOf=(k,l)=>{const max=PERK[k].cost.length;return l==null||l===''?max:Math.max(0,Math.min(max,l|0))};
 const setPerk=(k,l)=>{G.perks=G.perks||{};if(l>0)G.perks[k]=l;else delete G.perks[k]};
 const needPerks=()=>{if(!G.perks)G.perks={};if(!G.ch)G.ch={}};
 /* the switches themselves, without the run() checks and the mark: a new run puts them back through these */
 const raw={
  unlock(on){D.unlock=on==null?!D.unlock:!!on;for(const id of Object.keys(WPN)){if(D.unlock){if(!(id in W0))W0[id]=WPN[id].from;WPN[id].from=1}else if(id in W0)WPN[id].from=W0[id]}base();return D.unlock},
  codex(on){D.codex=on==null?!D.codex:!!on;Z.codex?.force(D.codex?'all':null);Z.codex?.sync?.();return D.codex},
  instantLock(on){D.instlock=on==null?!D.instlock:!!on;LOCK.t=D.instlock?.05:L0.t;LOCK.far=D.instlock?0:L0.far;return D.instlock}};
 const C={
  money:n=>run('money',[n],()=>{G.cash=Math.max(0,Math.round(G.cash+(+n||0)));base();return G.cash}),
  setMoney:n=>run('setMoney',[n],()=>{G.cash=Math.max(0,Math.round(+n||0));base();return G.cash}),
  perk:(k,l)=>run('perk',[k,l],()=>{if(!PERK[k])return false;needPerks();setPerk(k,lvlOf(k,l));Z.pk.refill();Z.pk.apply();base();return G.perks[k]|0},{run:1}),
  allPerks:()=>run('allPerks',[],()=>{needPerks();for(const k of Object.keys(PERK))setPerk(k,lvlOf(k));Z.pk.refill();Z.pk.apply();base();return Object.keys(G.perks).length},{run:1}),
  helper:k=>run('helper',[k],()=>{const it=ITEMS[k];if(!it||it.type!=='helper')return false;const d=def(),j=d.SLOTS.findIndex((_,i)=>d.slotFree(i,k));if(j<0)return false;
   const o=d.add(k,j);o.spent=it.price;if(G.state==='wave')d.deploy();base();return o.id},{run:1}),
  supply:k=>run('supply',[k],()=>{if(ITEMS[k]?.type!=='supply')return false;(G.sup||(G.sup={}))[k]=1;base();return true},{run:1}),
  weapon:id=>run('weapon',[id],()=>{const A=Z.ars;if(!A||!WPN[id])return false;const P=A.P(A.me());P.own.add(id);P.cur=id;P.sch=id==='flare'?FLARE.sortie:0;if(id==='flare')P.ch=FLARE.n;Z.pk.apply();base();return id},{run:1}),
  allWeapons:()=>run('allWeapons',[],()=>{const A=Z.ars;if(!A)return false;const P=A.P(A.me());for(const id of Object.keys(WPN))P.own.add(id);Z.pk.apply();base();return P.own.size},{run:1}),
  /* Rocket Assist at level 1 if missing, and its burn lit right now (the bar and the roar included) */
  burn:()=>run('burn',[],()=>{const me=api.player,rk=Z.rk;if(!me||me.dead>0||!rk)return false;needPerks();if(!(G.perks.rocket|0)){setPerk('rocket',1);Z.pk.apply()}rk.st.armed=false;rk.st.t=RK.burn;rk.sound(true);return true},{run:1}),
  unlock:on=>run('unlock',[on],()=>raw.unlock(on)),
  codex:on=>run('codex',[on],()=>raw.codex(on)),
  instantLock:on=>run('instantLock',[on],()=>raw.instantLock(on)),
  raw,

  /* ---------- waves, enemies, bosses ---------- */
  wave:n=>run('wave',[n],()=>{n=Math.max(1,Math.min(999,n|0));C._clear();G.wq.length=0;G.wave=n-1;if(n-1<BUNKER_WAVE)Z.bunker(false);Z.openBase();return n},{run:1}),
  skipWave:()=>run('skipWave',[],()=>{C._clear();G.wq.length=0;return G.state},{run:1}),
  /* n tracks of any kind (a boss through the boss registry, so its intro and bar run) at a bearing in degrees (0 north, 90 east) and a range from the defended area (default: the kind's own) */
  spawn:(kind,n=1,deg=0,range=0)=>run('spawn',[kind,n,deg,range],()=>{
   const K=KIND[kind];if(!K)return 0;if(G.state==='base'){Z.continue();G.wq.length=0}
   const b=(+deg||0)*Math.PI/180,R=range>0?+range:(K.far||5200),B=Z.bosses?.BOSSES[kind],site=api.liveSites()[0];let made=0;n=Math.max(1,Math.min(200,n|0));
   const grp=kind==='swarm'?++G.gid:0;
   for(let i=0;i<n;i++){const a=b+(n>1&&!grp?(i-(n-1)/2)*.04:0),x=SITE_C.x+Math.sin(a)*R+(grp?rnd(-60,60):0),z=SITE_C.z-Math.cos(a)*R+(grp?rnd(-60,60):0);
    const t=B?Z.bosses.spawn(kind,{brg:a,R}):Z.make(kind,x,z,grp?site:undefined);if(t){if(grp)t.grp=grp;made++}}
   return made},{run:1}),
  clearTracks:()=>run('clearTracks',[],()=>C._clear(),{run:1}),
  _clear:()=>{let n=0;Z.bossClear?.('debug');for(const t of TH)if(api.live(t)){t.st='dead';n++}return n},

  /* ---------- the interceptor and time ---------- */
  god:on=>run('god',[on],()=>{D.god=on==null?!D.god:!!on;return D.god}),
  toPad:()=>run('toPad',[],()=>{if(!api.player)return false;api.launch();return true},{run:1}),
  repair:()=>run('repair',[],()=>{for(const s of SITES)s.hp=s.max;return true},{run:1}),
  timeScale:x=>run('timeScale',[x],()=>{x=+x;if(!(x>0))x=1;D.ts=Math.max(.25,Math.min(8,x));D.paused=false;C._cap();return D.ts}),
  pause:on=>run('pause',[on],()=>{D.paused=on==null?!D.paused:!!on;C._cap();return D.paused}),
  step:(ticks=1)=>run('step',[ticks],()=>{if(G.state!=='wave'&&G.state!=='clear')return 0;const n=Math.max(1,Math.min(600,ticks|0));for(let i=0;i<n;i++)api.step(1/120);api.visuals(n/120,performance.now());return n},{run:1}),
  _cap:()=>{Z.stepCap=D.ts>1&&!D.paused?Math.ceil(12*D.ts):0},

  /* ---------- the world: weather, difficulty, the save ---------- */
  weather:id=>run('weather',[id],()=>{const wx=Z.wx;if(!wx?.T[id])return false;wx.set(id);if(api.WX?.id!==id)api.setWeather(wx.T[id]);return id},{run:1}),
  difficulty:i=>run('difficulty',[i],()=>{i=Math.max(0,Math.min(ZDIFF.length-1,i|0));S.zdiff=i;if(G.dfo!=null)G.dfo=i;save();Z.syncMode?.();return ZDIFF[i].n}),
  /* wipes this game's save (the pilot's radio profile stays) and reloads; debug mode stays on. force: no second click */
  resetSave:force=>{if(!D.on||D.spectating||D.client)return refuse('resetSave','not allowed here');
   if(!force&&!(D.arm>performance.now())){D.arm=performance.now()+4000;D.msg?.('press Reset save again within 4 s');return'armed'}
   D.arm=0;return run('resetSave',[],()=>{hooks.persist=()=>({zdbg:1});try{localStorage.setItem('dl-interceptor',JSON.stringify({zdbg:1}))}catch(e){}D.reset=true;if(!force)setTimeout(()=>location.reload(),60);return true})}
 };
 return C}
