// Zombies campaign: a front line of 12 sectors on a map screen, reached from the Zombies start menu (single runs stay as "Quick defence").
// Each sector is a Zombies run with its own objective (hold N waves), modifiers, weather tendency and reward. Winning a sector holds it and puts
// its neighbours on the front; losing one raises the enemy pressure on its neighbours (bigger waves, less starting cash, capped, and eased again
// by wins nearby), never a lock: every front sector can be retried at once. The capstone (Launch Complex) opens once 7 sectors are held.
//
// Carry-over is small on purpose (strategic progression, never raw power): rewards are relics (each a strength with a cost, one equipped per
// sector) and reserves (a one-off free repair or one extra open position, at most 3 banked, one committed per sector). Doctrine and kit are
// the ordinary unlocks (zmeta.js), picked per sector on the briefing. A fully progressed player has more choices, not a stronger base.
//
// Saved in the Interceptor settings as S.zcamp = {v:1, d: difficulty index (fixed for the campaign), held: [sector ids], pr: {id: pressure 1-2},
// ls: {id: losses}, relics: [owned], eq: equipped relic id or '', res: {repair, slot}, sel: selected sector id, done: 1 once the capstone is held,
// sc: {sector id: the living map's scars as one compact string (craters, burns, rubble; zscars.js)}}. A new campaign starts without any.
// Every read goes through cleanCamp, so a hand-edited, foreign or corrupt save becomes a valid campaign instead of breaking the menu.
//
// Hooks (small, all optional on the other side): zombies.js calls Z.dfMod (difficulty numbers), Z.cpCompose (wave roster), Z.cpWin (objective
// met at a wave clear) and Z.cpOver (the end screen); zbase.js shows Z.cpHTML and asks Z.cpBan; znet.js carries Z.cpNet / Z.cpIn so a co-op
// game plays the host's sector (the host's save is the one that moves); zendless.js starts a held sector as an Endless run (Z.cp.start(id, force, true):
// run.endless, no objective) and shows its button on the briefing (Z.endless.btn). Other features can read the sector through Z.cp: Z.cp.has('raid'),
// Z.cp.n('launchSites'). Modifiers that drive another branch's feature (need) only show up when that feature is there (Z.feat[need] or Z[need]).
import {money} from '../../engine/hot.js';
import {ZDIFF} from './zdata.js';
import {DOCS,DOC_IDS,KIT,KIT_IDS,KIT_MAX} from './zmeta.js';

// ---------- modifiers ----------
// g glyph, n name, txt description (a function of the modifier's number for the numbered ones). Effects: wx = weather tendency [chance per wave
// from wave 2, weathers], mix = wave-roster change (cpCompose below), shift = enemy kinds this many waves earlier, tac = raid tactics (the larger of
// this and the difficulty's), k = 'wave' / 'cash' multiplier, radar = detection-range multiplier, nogd / fragile = special rules,
// need = another branch's feature this modifier drives (alt = what the sector gets instead when that feature isn't in this build)
export const MODS={
 clear:{g:'☼',n:'Clear skies',txt:'Fair weather in most waves: a gentle start.',wx:[.7,['clear','scattered','golden']]},
 night:{g:'☾',n:'Night-heavy',txt:'Most waves are flown at night. Thermal (H) sees in the dark.',wx:[.6,['night']]},
 storm:{g:'ϟ',n:'Storm season',txt:'Rain, heavy storms and fog in most waves.',wx:[.6,['rain','storm','fog']]},
 dust:{g:'∴',n:'Dust and fog',txt:'Dust haze and fog in most waves.',wx:[.55,['dust','fog']]},
 swarm:{g:'⁘',n:'Swarm-heavy',txt:'FPV swarms from wave 3: a third of the Shaheds come as swarms instead.',mix:'swarm'},
 jets:{g:'➶',n:'Jet-heavy',txt:'Two in five Shaheds come as Geran-3 jets instead.',mix:'jets'},
 armor:{g:'▣',n:'Armored column',txt:'Armored heavies from wave 6, in place of a quarter of the Shaheds.',mix:'armor'},
 missile:{g:'⇡',n:'Missile front',txt:n=>`Every enemy type arrives ${n} waves earlier (Iron and Golden Dome too).`,shift:1},
 hyper:{g:'⟫',n:'Hypersonic test range',txt:'From wave 9 a hypersonic glider joins every third wave.',mix:'hyper'},
 nogd:{g:'⊘',n:'No Golden Dome supply line',txt:'Golden Dome is not in the shop: hypersonics fall to a direct hit or land.',nogd:1},
 fragile:{g:'✚',n:'Fragile hospital',txt:'The apartments are a field hospital: 40% fewer hit points, and the sector is lost if it falls.',fragile:1},
 tot:{g:'⌖',n:'Coordinated raids',txt:'Raids time their arrival together and go for your weakest site.',tac:{tot:.7,focus:.35}},
 big:{g:'⊕',n:'Heavy pressure',txt:n=>`Waves ${Math.round(n*100-100)}% bigger.`,k:'wave'},
 poor:{g:'¤',n:'Thin supply line',txt:n=>`All income ${Math.round(100-n*100)}% lower.`,k:'cash'},
 blind:{g:'◌',n:'Blind early warning',txt:'Radar detection ranges 30% shorter.',radar:.7},
 boss5:{g:'⬢',n:'Mothership escort',txt:'A Mothership every 5 waves instead of every 10.',mix:'boss5'},
 raid:{g:'⌂',n:'Enemy launch sites',txt:'Two sectors (the North, then the West) have a second enemy launch site: a sector sends its missiles until both are destroyed.',need:'sorties',launchSites:2,alt:['big',1.1]}};
// The map shows only a sector's MAP_MODS strongest modifiers (a "+n" chip opens the rest); all of them stay in effect and the briefing lists every one.
// Strength = how much the modifier changes the run, 0-10 (arcade judgement): a lost sector, a boss, no Golden Dome and a hypersonic range top the list,
// weather and fair skies are at the bottom. Numbered ones scale with their number; an unknown modifier ranks in the middle.
export const IMPACT={boss5:9,fragile:9,nogd:8,hyper:8,tot:7,raid:6,armor:6,swarm:5.5,jets:5,blind:5,storm:4,dust:3.5,night:3,clear:1};
export const MAP_MODS=3;
export const impact=m=>m.id==='missile'?6+.5*(m.n|0):m.id==='big'?4+20*(m.n-1):m.id==='poor'?5+20*(1-m.n):IMPACT[m.id]??4;
/* strongest first; equal strength keeps the sector's own order */
export const rankMods=ms=>ms.map((m,i)=>({m,i,v:impact(m)})).sort((a,b)=>b.v-a.v||a.i-b.i).map(o=>o.m);
// enemy pressure from lost neighbours: per level, waves +8% and starting cash −10%, at most PR_MAX levels
export const PR_MAX=2,PR_WAVE=1.08,PR_START=.9;

// ---------- relics (one equipped per sector) and reserves (one committed per sector) ----------
// k: doctrine-style multipliers (zmeta k keys) on top of the doctrine's; cash0 extra starting cash; sup a supply loaded free every wave;
// repair repair-price multiplier; radar detection-range multiplier
export const RELICS={
 warchest:{g:'$',n:'War chest',plus:'Start every sector with $1,200 more.',minus:'All income −10%.',cash0:1200,k:{cashK:.9}},
 drill:{g:'⏱',n:'Drill sergeant',plus:'Overtime crews (helpers reload 30% faster) loaded free every wave.',minus:'Helper kills pay 25% less.',sup:'overtime',k:{helperShare:.75}},
 medic:{g:'✚',n:'Field engineers',plus:'Repairs 35% cheaper.',minus:'Armory upgrades and refits cost 15% more.',repair:.65,k:{upK:1.15}},
 sandbag:{g:'▦',n:'Sandbag stockpile',plus:'Sandbags (sites take 25% less damage) loaded free every wave.',minus:'Sites have 15% fewer hit points.',sup:'harden',k:{hpK:.85}},
 ace:{g:'✈',n:'Ace\'s scarf',plus:'Your kills pay +25%.',minus:'Helper kills pay 20% less.',k:{youK:1.25,helperShare:.8}},
 ewnet:{g:'◉',n:'Early-warning net',plus:'Radar detection ranges +30%.',minus:'Wave-clear bonuses −25%.',radar:1.3,k:{clearK:.75}}};
export const RELIC_IDS=Object.keys(RELICS);
export const RESERVES={repair:{g:'⚒',n:'Field repair crew',txt:'Once in the sector: every site repaired to full for free (base screen). Spent only when used.'},
 slot:{g:'⊞',n:'Engineer platoon',txt:'One extra position open from the start (the next expansion keeps its price). Spent when the sector ends.'}};
export const RES_IDS=Object.keys(RESERVES),RES_MAX=3,CAP_NEED=7;

// ---------- sectors: the front runs south (home, bottom of the map) to north (the enemy, top) ----------
// x, y: node on the map (1000 x 620), obj: waves to hold, mods: ids or [id, number], rw: reward (relic, res = one reserve, win = the campaign)
export const SECTORS=[
 {id:'mill',n:'Old Mill',x:170,y:505,obj:8,mods:['clear'],rw:{res:'repair'},brief:'A quiet mill town behind the river. Short and fair: settle in.'},
 {id:'river',n:'River Crossing',x:500,y:500,obj:10,mods:['night'],rw:{relic:'warchest'},brief:'The bridges into the valley, raided after dark.'},
 {id:'silo',n:'Grain Silos',x:830,y:510,obj:10,mods:['swarm'],rw:{relic:'drill'},brief:'Open farmland: the swarms come low over the fields.'},
 {id:'rail',n:'Rail Junction',x:300,y:390,obj:12,mods:['jets','raid'],rw:{res:'slot'},brief:'The junction feeds the whole front. The fast jets want it.'},
 {id:'hosp',n:'Hospital Hill',x:590,y:395,obj:12,mods:['fragile','storm'],rw:{relic:'medic'},brief:'A field hospital in the apartment blocks. If it falls, so does the sector.'},
 {id:'power',n:'Power Station',x:860,y:385,obj:12,mods:['armor',['poor',.85]],rw:{relic:'sandbag'},brief:'Armored columns push on the power station; supplies are short.'},
 {id:'quarry',n:'Quarry',x:120,y:265,obj:15,mods:['dust','tot',['big',1.15]],rw:{res:'repair'},brief:'Dust and fog over the pits, and raids that all arrive at once.'},
 {id:'air',n:'Airfield',x:450,y:270,obj:15,mods:[['missile',5],'jets'],rw:{relic:'ace'},brief:'The enemy\'s missiles reach the airfield early. Hold the runway.'},
 {id:'ridge',n:'Radar Ridge',x:760,y:270,obj:15,mods:['blind','night',['big',1.1]],rw:{relic:'ewnet'},brief:'The early-warning radars are down. Fly by thermal and nerve.'},
 {id:'dam',n:'The Dam',x:320,y:160,obj:18,mods:['swarm','storm','tot',['big',1.1]],rw:{res:'slot'},brief:'Storm swarms on the dam, timed to land together.'},
 {id:'factory',n:'Factory Belt',x:640,y:165,obj:18,mods:['hyper','nogd','armor'],rw:{res:'repair'},brief:'A hypersonic test range, and no Golden Dome this side of the line.'},
 {id:'gate',n:'Launch Complex',x:480,y:55,obj:20,cap:1,mods:[['missile',8],'tot','boss5','raid',['big',1.08]],rw:{win:1},brief:'Where every raid starts. Hold 20 waves and the campaign is won.'}];
export const SEC=Object.fromEntries(SECTORS.map(s=>[s.id,s])),SEC_IDS=SECTORS.map(s=>s.id);
const has=(o,k)=>typeof k==='string'&&Object.hasOwn(o,k);

// ---------- map geometry: each sector's region is its Voronoi cell around the node (plus home cells along the bottom and enemy cells in the top
// corners). Neighbours (who unlocks whom) are the cells that share an edge, so the map and the rules always agree. ----------
export const MW=1000,MH=620;
const HOME=[[500,640],[150,632],[850,632]],ENEMY=[[40,25],[960,25]];
function clipT(P,T,a,b,c,j){const oP=[],oT=[],n=P.length;
 for(let i=0;i<n;i++){const A=P[i],B=P[(i+1)%n],fa=a*A[0]+b*A[1]-c,fb=a*B[0]+b*B[1]-c,X=()=>{const t=fa/(fa-fb);return[A[0]+t*(B[0]-A[0]),A[1]+t*(B[1]-A[1])]};
  if(fa<=0){oP.push(A);oT.push(T[i]);if(fb>0){oP.push(X());oT.push(j)}}else if(fb<=0){oP.push(X());oT.push(T[i])}}
 return[oP,oT]}
export const GEO=(()=>{const pts=[...SECTORS.map(s=>({id:s.id,x:s.x,y:s.y})),...HOME.map(([x,y])=>({id:'home',x,y})),...ENEMY.map(([x,y])=>({id:'enemy',x,y}))];
 const cells=pts.map((a,i)=>{let P=[[0,0],[MW,0],[MW,MH],[0,MH]],T=[-1,-1,-1,-1];
  pts.forEach((b,j)=>{if(j!==i)[P,T]=clipT(P,T,b.x-a.x,b.y-a.y,(b.x*b.x+b.y*b.y-a.x*a.x-a.y*a.y)/2,j)});
  return{id:a.id,poly:P,edges:P.map((p,k)=>({a:p,b:P[(k+1)%P.length],to:T[k]>=0?pts[T[k]].id:null}))}});
 const adj={};for(const c of cells)for(const e of c.edges)if(e.to&&e.to!==c.id&&c.id!=='enemy'&&e.to!=='enemy'&&Math.hypot(e.a[0]-e.b[0],e.a[1]-e.b[1])>20)(adj[c.id]||(adj[c.id]=new Set())).add(e.to);
 return{cells,adj:Object.fromEntries(Object.entries(adj).map(([k,v])=>[k,[...v].sort()]))}})();
export const nbrs=id=>GEO.adj[id]||[];

// ---------- save: defaults and validation ----------
export const VER=1,SC_MAX=3584;  /* SC_MAX: 8 characters a scar, 448 scars at most (zscars.js CAP) */
export const fresh=(d=1)=>({v:VER,d:Number.isInteger(d)&&d>=0&&d<ZDIFF.length?d:1,held:[],pr:{},ls:{},relics:[],eq:'',res:{repair:0,slot:0},sel:'mill',done:0,sc:{}});
const int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b?v:0;
// any value in, a valid campaign out (unknown ids, wrong types and out-of-range numbers are dropped; a save from a newer version starts fresh)
export function cleanCamp(c,d){if(!c||typeof c!=='object'||Array.isArray(c)||c.v!==VER)return fresh(d);
 const C=fresh(Number.isInteger(c.d)&&c.d>=0&&c.d<ZDIFF.length?c.d:d),obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
 C.held=[...new Set(Array.isArray(c.held)?c.held.filter(k=>has(SEC,k)):[])];
 for(const k of SEC_IDS){const p=int(obj(c.pr)[k],0,PR_MAX),l=int(obj(c.ls)[k],0,9999);if(p&&!C.held.includes(k))C.pr[k]=p;if(l)C.ls[k]=l}
 C.relics=[...new Set(Array.isArray(c.relics)?c.relics.filter(k=>has(RELICS,k)):[])];C.eq=has(RELICS,c.eq)&&C.relics.includes(c.eq)?c.eq:'';
 for(const k of RES_IDS)C.res[k]=int(obj(c.res)[k],0,RES_MAX);
 C.sel=has(SEC,c.sel)?c.sel:firstFront(C);C.done=c.done===1&&C.held.includes('gate')?1:0;
 for(const k of SEC_IDS){const v=obj(c.sc)[k];if(typeof v==='string'&&v.length<=SC_MAX&&/^[A-Za-z0-9_-]*$/.test(v))C.sc[k]=v}  /* the scars of a sector: a string of the codec's alphabet (zscars.js decodes and checks it) */
 return C}

// ---------- rules (pure: they take a campaign and return answers or a new campaign) ----------
const ours=(C,id)=>id==='home'||C.held.includes(id);
// held / front (playable now) / sealed (the capstone, on the front but fewer than CAP_NEED held) / locked (behind the enemy line)
export function status(C,id){if(!has(SEC,id))return'locked';if(C.held.includes(id))return'held';if(!nbrs(id).some(n=>ours(C,n)))return'locked';return SEC[id].cap&&C.held.length<CAP_NEED?'sealed':'front'}
export const front=C=>SEC_IDS.filter(id=>status(C,id)==='front');
export const playable=(C,id)=>{const s=status(C,id);return s==='front'||s==='held'};
function firstFront(C){return front(C)[0]||(C.held.length?C.held[C.held.length-1]:'mill')}
// a finished sector: won holds it (first time: the reward, the neighbours come onto the front, nearby pressure eases by one); lost raises the
// pressure on the neighbours not held yet (up to PR_MAX). res: the reserve committed and whether it was spent. Returns {c, ev}.
export function result(C0,id,won,res){const C=cleanCamp(JSON.parse(JSON.stringify(C0))),ev={id,won,first:false,reward:null,opened:[],pressed:[],eased:[],done:false};if(!has(SEC,id))return{c:C,ev};
 if(res&&has(RESERVES,res.k)&&res.spent&&C.res[res.k]>0)C.res[res.k]--;
 if(won){const was=front(C);if(!C.held.includes(id)){C.held.push(id);ev.first=true;const rw=SEC[id].rw;
   if(rw.relic&&!C.relics.includes(rw.relic)){C.relics.push(rw.relic);ev.reward={relic:rw.relic}}
   if(rw.res){C.res[rw.res]=Math.min(RES_MAX,C.res[rw.res]+1);ev.reward={res:rw.res}}
   if(rw.win){C.done=1;ev.done=true}}
  delete C.pr[id];for(const n of nbrs(id))if(C.pr[n]){if(--C.pr[n]<=0)delete C.pr[n];ev.eased.push(n)}
  ev.opened=front(C).filter(k=>!was.includes(k));if(status(C,C.sel)!=='front')C.sel=firstFront(C)}
 else{C.ls[id]=(C.ls[id]|0)+1;for(const n of nbrs(id))if(has(SEC,n)&&!C.held.includes(n)&&(C.pr[n]|0)<PR_MAX){C.pr[n]=(C.pr[n]|0)+1;ev.pressed.push(n)}}
 return{c:C,ev}}

// a sector's modifiers as played: [{id, n}] with the features this build lacks swapped for their alternatives, plus the enemy pressure
export function modsOf(id,pr,feat=()=>false){const out=[];for(const m of SEC[id]?.mods||[]){let[k,n]=Array.isArray(m)?m:[m,null];if(MODS[k].need&&!feat(MODS[k].need))[k,n]=MODS[k].alt;out.push({id:k,n})}
 if(pr>0)out.push({id:'pressure',n:pr});return out}
export const modTxt=m=>m.id==='pressure'?`A neighbouring sector was lost: waves +${Math.round((PR_WAVE**m.n-1)*100)}%, starting cash −${Math.round((1-PR_START**m.n)*100)}%. Eases as you win next door.`:typeof MODS[m.id].txt==='function'?MODS[m.id].txt(m.n):MODS[m.id].txt;
export const modName=m=>m.id==='pressure'?`Enemy pressure ${'I'.repeat(m.n)}`:MODS[m.id].n,modGlyph=m=>m.id==='pressure'?'▲':MODS[m.id].g;
// the numbers a sector puts on top of the difficulty: wave size, money, starting cash, enemy-kind shift, tactics, radar
export function numbersOf(mods){const K={wave:1,cash:1,start:1,shift:0,tac:{},radar:1};
 for(const m of mods){if(m.id==='pressure'){K.wave*=PR_WAVE**m.n;K.start*=PR_START**m.n;continue}const M=MODS[m.id];
  if(M.k)K[M.k]*=m.n;if(M.shift)K.shift+=m.n|0;if(M.radar)K.radar*=M.radar;if(M.tac)for(const[k,v]of Object.entries(M.tac))K.tac[k]=Math.max(K.tac[k]||0,v)}
 return K}

// ---------- the in-game side ----------
export function initCampaign(api,G,Z){
 const {S,save,SITES,feed,banner}=api,$=id=>document.getElementById(id);
 const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);
 const feat=f=>!!(Z.feat?.[f]||Z[f]);
 const C=()=>cleanCamp(S.zcamp,S.zdiff|0),put=c=>{S.zcamp=c;save()};
 const client=()=>!!Z.isClient?.();
 const N0=new Map(SITES.map(s=>[s,s.n])),hospital=()=>[...N0].find(([,n])=>n==='APARTMENTS')?.[0];
 // run: the sector being played (null in Quick defence). armed: the sector the next Z.start plays (set by Continue / Retry / Host in co-op)
 let run=null,armed=null,armedEn=false;const pick={res:''};  // pick.res: the reserve committed on the briefing (or by Retry); armedEn: the armed sector plays as Endless (zendless.js)
 function mkRun(id,pr,relic,res,en){const mods=modsOf(id,pr,feat),K=numbersOf(mods),has1=k=>mods.some(m=>m.id===k);
  return{id,sec:SEC[id],obj:en?1e9:SEC[id].obj,endless:!!en,pr,relic:has(RELICS,relic)?relic:'',res:has(RESERVES,res)?res:'',mods,K,mix:new Set(mods.map(m=>MODS[m.id]?.mix).filter(Boolean)),
   wx:mods.map(m=>MODS[m.id]?.wx).find(Boolean)||null,nogd:has1('nogd'),fragile:has1('fragile'),used:0,res0:'',df:null,dfb:null}}
 const R=()=>run&&RELICS[run.relic];
 Z.cp={get on(){return!!run},get run(){return run},has:k=>!!run&&run.mods.some(m=>m.id===k),n:(k,d=0)=>{if(!run)return d;const m=run.mods.find(m=>m.id==='raid');return k==='launchSites'&&m?MODS.raid.launchSites:d},
  C,put,status:id=>status(C(),id),front:()=>front(C()),result,cleanCamp,SECTORS,MODS,RELICS,GEO,
  start:(id,force,en)=>{const c=C();if(!force&&!playable(c,id))return false;armed=id;armedEn=!!en;$('zover').hidden=true;closeMap();api.startMatch();return!!run}};

 // ---------- hooks into the run ----------
 // difficulty numbers: the campaign's difficulty with the sector's modifiers on top (a derived object, so ZDIFF itself never changes)
 Z.dfMod=d=>{if(!run)return d;if(run.dfb===d)return run.df;const K=run.K,t={...(d.tac||{})};for(const[k,v]of Object.entries(K.tac))t[k]=Math.max(t[k]||0,v);
  run.dfb=d;return run.df=Object.assign(Object.create(d),{wave:d.wave*K.wave,cash:d.cash*K.cash,start:Math.round(d.start*K.start),shift:(d.shift|0)+K.shift,tac:t})};
 // the wave roster: swap some Shaheds for the sector's kind (about the same threat points), add hypersonics or extra Motherships
 const take=(out,k,n)=>{let c=0;for(let i=out.length-1;i>=0&&c<n;i--)if(out[i]===k){out.splice(i,1);c++}return c};
 Z.cpCompose=(out,w)=>{if(!run||!run.mix.size)return out;const sh=()=>out.filter(k=>k==='shahed').length;
  if(run.mix.has('swarm')&&w>=3){const n=take(out,'shahed',Math.round(sh()/3));for(let i=0;i<n;i+=2)out.push('swarm:'+(Math.min(2,n-i)*5+(Math.random()*3|0)))}
  if(run.mix.has('jets')){const n=take(out,'shahed',Math.round(sh()*.4/3)*3);for(let i=0;i<n;i+=3)out.push('jet','jet')}
  if(run.mix.has('armor')&&w>=6){const n=take(out,'shahed',Math.round(sh()/4/3)*3);for(let i=0;i<n;i+=3)out.push('heavy')}
  if(run.mix.has('hyper')&&w>=9&&w%3===0)out.push('hyper');
  if(run.mix.has('boss5')&&w%5===0&&w%10!==0&&!out.includes('boss'))out.unshift('boss');
  return out};
 // relic numbers ride on the doctrine's (zmeta k): M.k('cashK') -> doctrine x relic
 const mk0=Z.meta.k;Z.meta.k=(key,d=1)=>{const v=mk0(key,d),r=R();return r?.k&&r.k[key]!=null?v*r.k[key]:v};
 const rk0=Z.radarK;Z.radarK=()=>(rk0?.()??1)*(run?run.K.radar*(R()?.radar||1):1);
 const rp0=Z.repairK;Z.repairK=()=>(rp0?.()??1)*(R()?.repair||1);
 const if0=Z.itemFrom;Z.itemFrom=k=>k==='gdome'&&run?.nogd?999:if0(k);
 Z.cpBan=k=>k==='gdome'&&!!run?.nogd;
 // weather tendency: from wave 2, this share of the forecasts comes from the sector's weathers (Zombies weather switched off: left alone)
 const wp0=Z.wx.plan;Z.wx.plan=w=>{const p=wp0(w);if(!p||!run?.wx||w<2||Math.random()>=run.wx[0])return p;const L=run.wx[1];return{id:L[Math.random()*L.length|0]}};
 // relic supplies are loaded as the base screen opens (they show as loaded in the shop)
 const bo0=Z.base.open;Z.base.open=()=>{const s=R()?.sup;if(s&&G.on)(G.sup||(G.sup={}))[s]=1;bo0()};
 function restoreSites(){for(const[s,n]of N0)s.n=n}
 const s0=Z.start;Z.start=()=>{const cl0=client();restoreSites();G.cpRes='';
  if(!cl0){const id=armed,en=armedEn;armed=null;armedEn=false;const c=C();run=id&&has(SEC,id)?mkRun(id,en?0:c.pr[id]|0,c.eq,!en&&c.res[pick.res]>0?pick.res:'',en):null;G.dfo=run?c.d:undefined}
  s0();if(!run)return;
  if(run.fragile){const h=hospital();if(h){h.n='HOSPITAL';if(!cl0)h.max=h.hp=Math.round(h.max*.6)}}
  if(cl0)return;
  if(R()?.cash0)G.cash+=R().cash0;
  if(run.res==='slot'){const j=Z.def.SLOTS.findIndex((_,j)=>Z.def.canOpen(j,Z.meta.doc()));if(j>=0)G.open[j]=true;else run.res=''}
  feed(`<span class="cg">Campaign: ${esc(run.sec.n)}</span>: ${run.endless?'no objective, hold as long as you can':`hold ${run.obj} waves`}. ${run.mods.map(m=>modName(m)).join(' · ')}`);
  Z.base.refresh?.()};
 const sp0=Z.stop;Z.stop=()=>{const was=!!run;sp0();restoreSites();if(was&&!client())G.dfo=undefined;run=null};
 // the objective: the wave that makes it is cleared -> sector held (the host or a solo pilot decides; a co-op client mirrors it)
 Z.cpWin=()=>{if(!run||Z.mirror||G.wave<run.obj||G.state!=='clear')return false;G.cpRes='won';Z.gameOver();return true};
 // the hospital rule: it falls, the sector is lost
 const st0=Z.step;Z.step=dt=>{st0(dt);if(run?.fragile&&!Z.mirror&&G.state==='wave'&&!api.demo){const h=hospital();if(h&&h.hp<=0){G.cpRes='lost';G.cpWhy='The field hospital fell.';Z.gameOver()}}};
 // HUD: wave N / objective
 Z.waveTxt=()=>run?G.state==='base'?`WAVE ${G.wave+1}/${run.obj} NEXT`:`WAVE ${G.wave}/${run.obj}`:null;  // zombies.js writes it (once per change)
 // base screen strip: the sector, the objective, the modifiers, the relic, and the reserve (the field repair crew is a button)
 Z.cpHTML=()=>{if(!run)return'';const left=Math.max(0,run.obj-G.wave),r=R(),rs=run.res&&RESERVES[run.res];
  return`<div class="zcpbar"><b>${esc(run.sec.n.toUpperCase())}</b><span class="zcpo">Hold ${run.obj} waves · <em>${left?`${left} to go`:'objective met'}</em></span>
   <span class="zcpm-ch">${run.mods.map(m=>`<i class="${m.id==='pressure'?'pr':''}" title="${esc(modName(m)+': '+modTxt(m))}">${modGlyph(m)} ${esc(modName(m))}</i>`).join('')}</span>
   ${r?`<span class="zcprl" title="${esc(r.plus+' '+r.minus)}">${r.g} ${esc(r.n)}</span>`:''}
   ${rs?run.res==='repair'?`<button class="sm" id="zcprep" ${run.used||client()?'disabled':''}>${rs.g} ${run.used?'Repair crew used':'Field repair crew: all sites to full'}</button>`:`<span class="zcprl">${rs.g} ${esc(rs.n)}</span>`:''}</div>`};
 Z.base.el.addEventListener('click',e=>{if(!e.target.closest?.('#zcprep')||!run||run.res!=='repair'||run.used||client()||G.state!=='base')return;
  for(const s of SITES)if(s.hp>0)s.hp=s.max;run.used=1;feed('<span class="cg">Field repair crew</span>: every site back to full');Z.base.refresh()});
 // co-op: the host's sector rides in the snapshot; a client rebuilds it from the same tables (and only shows it: the host's save moves)
 Z.cpNet=()=>run?{id:run.id,pr:run.pr,r:run.relic,s:run.res,u:run.used,o:run.over||''}:null;
 Z.cpIn=p=>{if(!client())return;if(!p||typeof p!=='object'||!has(SEC,p.id)){if(run){run=null;restoreSites()}return}
  if(!run||run.id!==p.id||run.relic!==p.r||run.res!==p.s){run=mkRun(p.id,Math.min(PR_MAX,Math.max(0,p.pr|0)),p.r,p.s);if(run.fragile){const h=hospital();if(h)h.n='HOSPITAL'}}
  run.used=p.u?1:0;run.over=p.o==='won'||p.o==='lost'?p.o:''};

 // ---------- the end of a sector ----------
 // zombies.js gameOver asks first: in a campaign sector this draws the sector result instead of the Quick defence one
 Z.cpOver=()=>{if(!run)return false;const cl0=client();let ev=null;
  if(!cl0&&!run.over){const won=G.cpRes==='won';run.over=won?'won':'lost';const r=result(C(),run.id,won,run.res?{k:run.res,spent:run.res==='slot'||!!run.used}:null);put(r.c);run.ev=ev=r.ev}
  else ev=run.ev||{won:run.over==='won',first:false,opened:[],pressed:[],eased:[]};
  const won=run.over==='won',c=C(),sec=run.sec,rw=ev.reward,why=!won&&G.cpWhy?G.cpWhy:'';G.cpWhy='';banner('');
  const names=a=>a.map(k=>SEC[k].n).join(', ');
  const rwTxt=rw?.relic?`<p class="zcpgot"><b>Relic: ${RELICS[rw.relic].g} ${RELICS[rw.relic].n}</b> <span class="cg">+ ${RELICS[rw.relic].plus}</span> <span class="co">− ${RELICS[rw.relic].minus}</span></p>`
   :rw?.res?`<p class="zcpgot"><b>Reserve: ${RESERVES[rw.res].g} ${RESERVES[rw.res].n}</b> ${RESERVES[rw.res].txt}</p>`:'';
  const host=!!Z.online&&!cl0,btns=cl0?'<button id="zmenu">Leave the game</button>':`<button class="go" id="zcpmap">Campaign map ▸</button>${won?'':'<button id="zcpretry">Retry sector</button>'}<button id="zmenu">${host?'End the co-op game':'Menu'}</button>`;
  $('zover').innerHTML=`<div class="zpanel zgo zcpres ${won?'won':'lost'}"><h2>${ev.done?'Campaign complete':won?'Sector held':'Sector lost'}</h2><div class="zbig">${esc(sec.n.toUpperCase())}</div>
   ${why?`<p class="zhint"><b>${esc(why)}</b></p>`:''}
   <div class="zstats"><span>Waves held</span><b>${won?run.obj:Math.max(0,G.wave-1)} / ${run.obj}</b><span>Intercepts</span><b>${G.kills.p+G.kills.h}</b><span>by helpers</span><b>${G.kills.h}</b><span>Money earned</span><b>${money(G.earned)}</b><span>Sectors held</span><b>${c.held.length} / ${SECTORS.length}</b></div>
   ${won?(ev.first?rwTxt+(ev.opened.length?`<p class="zhint">The front moves: <b>${names(ev.opened)}</b> ${ev.opened.length>1?'are':'is'} now on the front.</p>`:'')+(ev.eased.length?`<p class="zhint">Pressure eases on ${names(ev.eased)}.</p>`:''):'<p class="zhint">Already held: a replay, no reward.</p>')
    :`<p class="zhint">${ev.pressed.length?`Enemy pressure rises on <b>${names(ev.pressed)}</b> (bigger waves, less starting cash there). `:''}A loss never locks the campaign: retry now, or push elsewhere and come back.</p>`}
   ${ev.done?'<p class="zhint"><b>The Launch Complex is held. The front is yours.</b> Every sector stays open for replays.</p>':''}
   ${cl0?'<p class="zhint">The host\'s campaign: their save moves. Waiting for the host…</p>':''}
   ${G.run?.got?.length?`<p class="zhint">Goals met: ${G.run.got.map(g=>Z.meta.GOALS[g].txt).join(' ')}</p>`:''}
   <div class="btns">${btns}</div></div>`;
  $('zover').hidden=false;
  const mn=$('zmenu');if(mn)mn.onclick=()=>{$('zover').hidden=true;api.startDemo()};
  const mp=$('zcpmap');if(mp)mp.onclick=()=>openMap();
  const rt=$('zcpretry');if(rt)rt.onclick=()=>{armed=run.id;pick.res=run.res&&C().res[run.res]>0?run.res:'';$('zover').hidden=true;api.startMatch()};
  Z.syncMode?.();setTimeout(()=>($('zcpmap')||$('zmenu'))?.focus(),50);return true};

 // ---------- start menu: the campaign card next to the difficulty ----------
 const card=document.createElement('div');card.className='zcpm';card.id='zcpm';$('zdiff').after(card);
 function syncCard(){const c=C(),f=front(c),D=ZDIFF[c.d];
  card.innerHTML=`<div><b>Campaign</b><span>${c.done?'Complete: every sector open for replays':`${c.held.length} of ${SECTORS.length} sectors held · ${D.n}${f.length?` · next: ${esc(SEC[c.sel]?.n||SEC[f[0]].n)}`:''}`}</span></div><button class="go" id="zcpopen">Campaign map ▸</button>`;
  $('zcpopen').onclick=()=>openMap()}
 syncCard();const sy0=Z.syncMode;Z.syncMode=()=>{sy0?.();syncCard()};
 // Quick defence (the play button) never plays an armed sector
 $('play').addEventListener('click',()=>{armed=null;armedEn=false},true);

 // ---------- the campaign map ----------
 const ov=document.createElement('div');ov.id='zcamp';ov.hidden=true;$('menu').before(ov);
 let sel=null,newArm=false,pinned='';  /* pinned: the sector whose "+n" list is held open by a click */
 const mapMods=id=>rankMods(modsOf(id,0,feat));
 /* a sector's "+n" list: the modifiers the map hides, with names, drawn over the map (hover or click the chip) */
 const pop=s=>{const rest=mapMods(s.id).slice(MAP_MODS);if(!rest.length)return'';const pw=Math.round(Math.max(...rest.map(m=>modName(m).length))*7.4+40),px=Math.min(MW-pw-6,Math.max(6,s.x-pw/2)),py=s.y+(s.cap?50:44)+26;
  return`<g class="zc-pop${pinned===s.id?' pin':''}" data-pop="${s.id}"><rect x="${px}" y="${py}" width="${pw}" height="${rest.length*21+10}" rx="6"/>${rest.map((m,i)=>`<g class="zc-pi"><text class="zc-pg" x="${px+16}" y="${py+20+i*21}">${modGlyph(m)}</text><text class="zc-pn" x="${px+30}" y="${py+20+i*21}">${esc(modName(m))}</text></g>`).join('')}</g>`};
 const cellD=c=>'M'+c.poly.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z';
 function svg(c){const st=id=>id==='home'?'home':id==='enemy'?'enemy':status(c,id);
  const cells=GEO.cells.map(g=>`<path class="zc-c ${st(g.id)}${g.id===sel?' sel':''}" d="${cellD(g)}" ${has(SEC,g.id)?`data-sec="${g.id}"`:''}/>`).join('');
  // the front line: every edge between a cell we hold (or home) and one we don't
  let fl='';for(const g of GEO.cells)if(ours(c,g.id))for(const e of g.edges)if(e.to&&!ours(c,e.to)&&Math.hypot(e.a[0]-e.b[0],e.a[1]-e.b[1])>1)fl+=`M${e.a[0].toFixed(1)},${e.a[1].toFixed(1)}L${e.b[0].toFixed(1)},${e.b[1].toFixed(1)}`;
  const roads=[];for(const s of SECTORS)for(const n of nbrs(s.id))if(has(SEC,n)&&n>s.id)roads.push(`M${s.x},${s.y}L${SEC[n].x},${SEC[n].y}`);
  const nodes=SECTORS.map(s=>{const t=status(c,s.id),pr=c.pr[s.id]|0,ms=mapMods(s.id),top=ms.slice(0,MAP_MODS),rest=ms.slice(MAP_MODS),w=(top.length+(rest.length?1:0))*24-3,x0=s.x-w/2,my=s.y+(s.cap?50:44);
   return`<g class="zc-n ${t}${s.id===sel?' sel':''}${s.cap?' cap':''}" data-sec="${s.id}" tabindex="-1">
    ${s.id===sel?`<circle class="zc-ring" cx="${s.x}" cy="${s.y}" r="${s.cap?34:28}"/>`:''}<circle class="zc-dot" cx="${s.x}" cy="${s.y}" r="${s.cap?25:19}"/>
    <text class="zc-ob" x="${s.x}" y="${s.y+5}">${t==='held'?'✓':s.obj}</text>
    <text class="zc-nm" x="${s.x}" y="${s.y+(s.cap?44:38)}">${esc(s.n.toUpperCase())}</text>
    ${top.map((m,i)=>`<g class="zc-mi"><title>${esc(modName(m))}</title><rect x="${x0+i*24}" y="${my}" width="21" height="21" rx="4"/><text x="${x0+i*24+10.5}" y="${my+15.5}">${modGlyph(m)}</text></g>`).join('')}
    ${rest.length?`<g class="zc-more" data-more="${s.id}"><title>${rest.length} more: ${esc(rest.map(modName).join(', '))}</title><rect x="${x0+top.length*24}" y="${my}" width="21" height="21" rx="4"/><text x="${x0+top.length*24+10.5}" y="${my+15.5}">+${rest.length}</text></g>`:''}
    ${pr?`<text class="zc-pr" x="${s.x+(s.cap?26:20)}" y="${s.y-14}">${'▲'.repeat(pr)}</text>`:''}</g>`}).join('');
  return`<svg id="zcsvg" viewBox="0 0 ${MW} ${MH}" role="img" aria-label="Campaign map: ${c.held.length} of ${SECTORS.length} sectors held">
   <defs><pattern id="zc-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V10" stroke="rgba(255,77,77,.13)" stroke-width="3"/></pattern>
   <filter id="zc-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter></defs>
   <rect width="${MW}" height="${MH}" class="zc-bg"/>${cells}
   <path class="zc-river" d="M-10,452 C120,430 210,468 330,446 S520,420 640,452 S860,470 1010,438"/>
   <path class="zc-road" d="${roads.join('')}"/>
   <path class="zc-fl0" d="${fl}" filter="url(#zc-glow)"/><path class="zc-fl" d="${fl}"/>
   <text class="zc-lab" x="${MW/2}" y="${MH-14}">HOME · OUR LINES</text><text class="zc-lab en" x="${MW-16}" y="22" text-anchor="end">ENEMY TERRITORY</text>
   ${nodes}${SECTORS.map(pop).join('')}</svg>`}
 // the selected sector's briefing: status, objective, modifiers, reward, loadout (doctrine, kit, relic, reserve), Continue
 function briefing(c){const s=SEC[sel],t=status(c,sel),pr=c.pr[sel]|0,ms=modsOf(sel,pr,feat),rw=s.rw,lo=Z.meta.load(),open=Z.meta.open,inGame=client()&&G.on;
  const stTxt={held:'HELD · replay for practice, no reward',front:'ON THE FRONT',sealed:`CAPSTONE · hold ${CAP_NEED} sectors to open it (${c.held.length}/${CAP_NEED})`,locked:'BEHIND ENEMY LINES · push the front to reach it'}[t];
  const rwH=rw.win?'<b>Win the campaign.</b>':rw.relic?`<b>Relic: ${RELICS[rw.relic].g} ${RELICS[rw.relic].n}</b><br><span class="cg">+ ${RELICS[rw.relic].plus}</span><br><span class="co">− ${RELICS[rw.relic].minus}</span>`:`<b>Reserve: ${RESERVES[rw.res].g} ${RESERVES[rw.res].n}</b><br>${RESERVES[rw.res].txt}`;
  const go=t==='front'||t==='held';
  return`<div class="zcpst ${t}">${stTxt}</div><h2>${esc(s.n)}</h2><p class="zcpbr-t">${esc(s.brief)}</p>
   <div class="zcpobj"><span>Objective</span><b>Hold ${s.obj} waves</b><span>${ZDIFF[c.d].n}${c.ls[sel]?` · lost ${c.ls[sel]}×`:''}</span></div>
   ${Z.cdxBrief?.(sel)||''}
   <h3>Modifiers</h3><ul class="zcpmods">${ms.map(m=>`<li class="${m.id==='pressure'?'pr':''}"><span class="zg">${modGlyph(m)}</span><div><b>${esc(modName(m))}</b><p>${esc(modTxt(m))}</p></div></li>`).join('')}</ul>
   <h3>Reward ${t==='held'?'<small>claimed</small>':''}</h3><p class="zcprw ${t==='held'?'got':''}">${rwH}</p>
   <h3>Loadout <small>doctrine and kit from your unlocks; one relic and one reserve</small></h3>
   <div class="zdocs">${DOC_IDS.filter(open).map(id=>`<button class="sm ${lo.doc===id?'on':''}" data-cdoc="${id}" title="${esc(DOCS[id].plus+' / '+DOCS[id].minus)}">${DOCS[id].n}</button>`).join('')}</div>
   ${KIT_IDS.some(open)?`<div class="zdocs">${KIT_IDS.filter(open).map(id=>`<button class="sm ${lo.kit.includes(id)?'on':''}" data-ckit="${id}" title="${esc(KIT[id].plus+' / '+KIT[id].minus)}">${KIT[id].n}</button>`).join('')}</div>`:''}
   <div class="zdocs">${c.relics.length?`<button class="sm ${c.eq?'':'on'}" data-crel="">No relic</button>${c.relics.map(id=>`<button class="sm ${c.eq===id?'on':''}" data-crel="${id}" title="${esc(RELICS[id].plus+' / '+RELICS[id].minus)}">${RELICS[id].g} ${RELICS[id].n}</button>`).join('')}`:'<span class="zhint">Relics: win sectors to earn them.</span>'}</div>
   ${c.eq?`<p class="zpm"><span class="cg">+ ${RELICS[c.eq].plus}</span> <span class="co">− ${RELICS[c.eq].minus}</span></p>`:''}
   <div class="zdocs">${RES_IDS.some(k=>c.res[k])?`<button class="sm ${pick.res?'':'on'}" data-cres="">No reserve</button>${RES_IDS.filter(k=>c.res[k]).map(k=>`<button class="sm ${pick.res===k?'on':''}" data-cres="${k}" title="${esc(RESERVES[k].txt)}">${RESERVES[k].g} ${RESERVES[k].n} ×${c.res[k]}</button>`).join('')}`:'<span class="zhint">Reserves: banked from some sector wins (at most 3).</span>'}</div>
   <div class="btns"><button class="go" id="zcpgo" ${go&&!inGame?'':'disabled'}>Continue ▸<small>${t==='held'?'replay':t==='front'?'launch':'locked:'} ${esc(s.n)}</small></button>${$('zhost')&&!Z.online?`<button class="sm" id="zcphost" ${go?'':'disabled'} title="Host a co-op game of this sector: friends join with the code; your campaign save moves">Host in co-op</button>`:''}${go&&!inGame?Z.endless?.btn?.(c,sel,t)||'':''}</div>
   ${inGame?'<p class="zhint">You are in someone else\'s co-op game: their campaign is the one in play.</p>':''}`}
 function render(){const c=C();if(!has(SEC,sel))sel=c.sel;if(pick.res&&!(c.res[pick.res]>0))pick.res='';
  const D=ZDIFF[c.d],f=front(c);
  ov.innerHTML=`<div class="zpanel zcp"><header><div><h2>Campaign</h2><div class="zcps">${D.n} · <b>${c.held.length}</b> of ${SECTORS.length} sectors held · ${c.done?'<span class="cg">campaign complete</span>':`${f.length} on the front`}</div></div>
   <div class="zcpinv">${RES_IDS.map(k=>`<span title="${esc(RESERVES[k].txt)}">${RESERVES[k].g} ${RESERVES[k].n} <b>×${c.res[k]}</b></span>`).join('')}<span title="Relics owned">Relics <b>${c.relics.length}/${RELIC_IDS.length}</b></span></div>
   <button class="sm" id="zcpx">Back <kbd>Esc</kbd></button></header>
   <div class="zcpcols"><div class="zcpmap">${svg(c)}<div class="zleg"><span><i class="lh"></i>held</span><span><i class="lf"></i>on the front</span><span><i class="ll"></i>enemy-held</span><span><i class="lfl"></i>front line</span><span><i class="lpr">▲</i>enemy pressure</span><span>number = waves to hold</span></div></div>
   <div class="zcpbr">${briefing(c)}</div></div>
   <footer class="zcpf"><span class="zhint">Win a sector to hold it and push the front; a loss raises the pressure next door but never locks anything. The capstone opens at ${CAP_NEED} sectors held.</span>
   <button class="sm zsell ${newArm?'arm':''}" id="zcpnew">${newArm?`Confirm: wipe this campaign and start on ${ZDIFF[S.zdiff|0]?.n||'Normal'}`:'New campaign…'}</button></footer></div>`;
  for(const e of ov.querySelectorAll('[data-sec]'))e.onclick=()=>select(e.dataset.sec);
  for(const b of ov.querySelectorAll('[data-more]')){const id=b.dataset.more,p=()=>ov.querySelector(`[data-pop="${id}"]`);b.onmouseenter=()=>p()?.classList.add('show');b.onmouseleave=()=>p()?.classList.remove('show');
   b.onclick=e=>{e.stopPropagation();pinned=pinned===id?'':id;for(const q of ov.querySelectorAll('[data-pop]'))q.classList.toggle('pin',q.dataset.pop===pinned)}}  /* the chip opens its list; a click holds it open */
  $('zcpx').onclick=closeMap;$('zcpgo').onclick=()=>launch(false);if($('zcphost'))$('zcphost').onclick=()=>launch(true);
  $('zcpnew').onclick=()=>{if(!newArm){newArm=true;render();return}newArm=false;put(fresh(S.zdiff|0));Z.cpNew?.();sel=C().sel;pick.res='';render();syncCard()};  /* Z.cpNew: the living map drops the scars still in memory (zscars.js) */
  for(const b of ov.querySelectorAll('[data-cdoc]'))b.onclick=()=>{const l=Z.meta.load();S.zload={...l,doc:b.dataset.cdoc};save();render();Z.syncMode?.()};
  for(const b of ov.querySelectorAll('[data-ckit]'))b.onclick=()=>{const l=Z.meta.load(),k=b.dataset.ckit;let kit=l.kit.includes(k)?l.kit.filter(x=>x!==k):[...l.kit,k];if(kit.length>KIT_MAX)kit=kit.slice(-KIT_MAX);S.zload={...l,kit};save();render();Z.syncMode?.()};
  for(const b of ov.querySelectorAll('[data-crel]'))b.onclick=()=>{const c=C();c.eq=b.dataset.crel;put(cleanCamp(c));render()};
  for(const b of ov.querySelectorAll('[data-cres]'))b.onclick=()=>{pick.res=b.dataset.cres;render()}}
 function select(id){if(!has(SEC,id))return;sel=id;newArm=false;pinned='';const c=C();c.sel=id;put(c);render();$('zcpgo')?.focus({preventScroll:true})}
 function launch(coop){const c=C();if(!playable(c,sel)||client()&&G.on)return;armed=sel;c.sel=sel;put(c);save();closeMap();$('zover').hidden=true;
  if(coop){$('zhost').click();return}
  api.startMatch()}
 function openMap(){const c=C();if(S.zcamp?.v!==VER)put(c);sel=c.sel;newArm=false;pinned='';ov.hidden=false;document.body.classList.add('zcp-open');render();setTimeout(()=>$('zcpgo')?.focus({preventScroll:true}),30)}
 function closeMap(){ov.hidden=true;newArm=false;document.body.classList.remove('zcp-open');if(!$('zover').hidden)setTimeout(()=>$('zcpmap')?.focus(),0);else $('zcpopen')?.focus()}
 Z.cp.openMap=openMap;Z.cp.closeMap=closeMap;Z.cp.select=select;
 // keyboard on the map: arrows move to the nearest sector that way, Enter / Space continue, Esc back
 addEventListener('keydown',e=>{if(ov.hidden)return;const k=e.code;
  if(k==='Escape'){closeMap();e.preventDefault();e.stopImmediatePropagation();return}
  const dir={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[k];
  if(dir){const a=SEC[sel];let best=null,bd=1e9;for(const s of SECTORS){const dx=s.x-a.x,dy=s.y-a.y,al=dx*dir[0]+dy*dir[1];if(al<=4)continue;const d=al+2*Math.abs(dx*dir[1]+dy*dir[0]);if(d<bd){bd=d;best=s}}
   if(best)select(best.id);e.preventDefault();e.stopImmediatePropagation();return}
  e.stopImmediatePropagation()},true);
 return Z.cp}
