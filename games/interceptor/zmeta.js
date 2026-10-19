// Zombies meta-progression between runs: doctrines and kit you unlock with play goals, then pick before a run. Every unlock is a choice with a
// strength and a weakness, never a flat buff: a fully unlocked pilot has more ways to play, not a stronger base (tools/zombies-balance.mjs checks it).
// Loadout per run: one doctrine (it shapes the whole base: positions, money, sites) + up to two kit picks (helper variants and perks).
// Saved in the Interceptor settings: S.zmeta = {v:1, g:{goal id: difficulty bits}} (bit i = earned on ZDIFF[i]), S.zload = {doc, kit:[]}.
// Both are checked on every read, so a hand-edited or corrupt save falls back to the defaults instead of breaking the menu.
// Co-op: the host's doctrine is the team's (it changes the shared base and purse); each pilot brings their own kit, and a helper variant one
// pilot brings is in the shared shop for the whole team (znet.js syncs both).
import {ZDIFF} from './zdata.js';

// ---------- catalogue ----------
// Doctrines. k* = multipliers (start cash, site hit points, repairs, all income, your kills, helper share, wave-clear bonus, upgrades, refund on sale,
// supplies, upkeep, expansions), open = positions open at the start (zdef SLOTS indices; null = the standard 14), never = positions this doctrine can't open.
export const SITE_SLOTS=[0,1,2,3,4,5,6,7,8],RADAR_SLOTS=[9,10],FWD_SLOTS=[11,12,13],REAR_SLOTS=[14,15,16],FWD2_SLOTS=[17,18,19],OUTPOSTS=[20,21];
export const DOCS={
 std:{n:'Standard',plus:'The base as issued: 14 positions, every price as listed.',minus:'Nothing special either way.'},
 fortress:{n:'Fortress',plus:'Sites +20% hit points; repairs 25% cheaper.',minus:'All income −15%. No forward positions or outposts: 11 positions, 14 at most.',hpK:1.2,repairK:.75,cashK:.85,
  open:[...SITE_SLOTS,...RADAR_SLOTS],never:[...FWD_SLOTS,...FWD2_SLOTS,...OUTPOSTS]},
 forward:{n:'Forward Defense',plus:'Both outposts and a second pad at each forward position open from the start (19 positions); forward upkeep halved.',minus:'Starting cash −40%. No rear positions at the sites (19 at most).',startK:.6,fwdUpK:.5,
  open:[...SITE_SLOTS,...RADAR_SLOTS,...FWD_SLOTS,...FWD2_SLOTS,...OUTPOSTS],never:REAR_SLOTS},
 air:{n:'Air Mobile',plus:'Rocket Assist and Fast relaunch at half price, Rocket Assist from wave 1; your kills pay +20%.',minus:'No radar-pad positions or outposts (12 positions, 16 at most); expansions cost 50% more.',youK:1.2,expK:1.5,perkK:{rocket:.5,relaunch:.5},rocketFrom:1,
  open:[...SITE_SLOTS,...FWD_SLOTS],never:[...RADAR_SLOTS,...OUTPOSTS]},
 partisan:{n:'Partisan',plus:'Your kills pay +50% and your streak climbs to ×3.',minus:'Helper kills pay 40% instead of 70%; wave-clear bonuses −30%.',youK:1.5,streakMax:3,helperShare:.4,clearK:.7},
 qm:{n:'Quartermaster',plus:'No upkeep; supplies 40% cheaper.',minus:'Armory upgrades and refits cost 25% more; selling refunds a quarter instead of half.',upkeepK:0,supplyK:.6,upK:1.25,sellK:.25}};
export const DOC_IDS=Object.keys(DOCS);
// Kit: helper variants (new shop items) and perks. Pick up to KIT_MAX per run.
export const KIT={
 lrack:{n:'Light rack',type:'helper',plus:'A $400 drone rack: cheap early coverage.',minus:'2.2 km reach, 2 drones, Mk III at most, no refits.'},
 hflak:{n:'Heavy flak',type:'helper',plus:'A mortar that reaches jets and cruise missiles, up to 2 km high.',minus:'Slow to reload, half as good against swarms, $900.'},
 mpads:{n:'MANPADS team',type:'helper',plus:'$1,200 for 3 heat-seeking missiles a wave (4.5 km); moves for free.',minus:'Blind to swarms; decoys fool it half the time; can\'t be upgraded.'},
 lure:{n:'Lure beacon',type:'perk',plus:'Active (Z / D-pad down): up to 6 drones near your interceptor turn toward a beacon for 8 s.',minus:'Missiles and the Mothership ignore it; one charge a wave.'},
 salvage:{n:'Salvage crews',type:'perk',plus:'Your kills within 1.2 km of a site pay +40%.',minus:'Your kills farther than 3 km from every site pay −30%.'}};
export const KIT_IDS=Object.keys(KIT),KIT_MAX=2;
// Goals: earned in play, tracked per difficulty. min = the easiest difficulty that counts (index into ZDIFF).
export const GOALS={
 w10:{txt:'Clear wave 10.',un:'fortress'},
 helpers:{txt:'From wave 8 on, clear a wave where helpers make every kill and the sites lose under 10%.',un:'lrack'},
 streak:{txt:'Run a streak of 8 kills.',un:'mpads'},
 boss:{txt:'Destroy a Mothership with your own detonation, without the Proximity fuse.',un:'lure'},
 clutch:{txt:'Five clutch saves (kills within 600 m of the target) in one wave.',un:'salvage'},
 norep:{txt:'Clear wave 15 without buying a repair, on Normal or harder.',un:'forward',min:1},
 lean:{txt:'Clear wave 20 with 8 or fewer defences.',un:'hflak'},
 perfect3:{txt:'Three perfect waves in a row, from wave 10 on.',un:'qm'},
 hard20:{txt:'Clear wave 20 on Hard or Nightmare.',un:'air',min:2},
 night15:{txt:'Clear wave 15 on Nightmare.',un:'partisan',min:3}};
export const GOAL_IDS=Object.keys(GOALS);
const unlockOf=id=>GOAL_IDS.find(g=>GOALS[g].un===id);

// ---------- saves: always read through these (defaults + validation) ----------
export function cleanMeta(m){const g={};const src=m&&typeof m==='object'&&m.g&&typeof m.g==='object'&&!Array.isArray(m.g)?m.g:{};
 for(const id of GOAL_IDS){const v=src[id];g[id]=Number.isInteger(v)&&v>0&&v<16?v:0}return{v:1,g}}
export function cleanLoad(l,isOpen){const L=l&&typeof l==='object'?l:{},doc=typeof L.doc==='string'&&Object.hasOwn(DOCS,L.doc)&&isOpen(L.doc)?L.doc:'std';
 const kit=[...new Set(Array.isArray(L.kit)?L.kit.filter(k=>typeof k==='string'&&Object.hasOwn(KIT,k)&&isOpen(k)):[])].slice(0,KIT_MAX);return{doc,kit}}

export function initMeta(api,G,Z){
 const {S,save,feed,banner}=api,$=id=>document.getElementById(id);
 let all=false;  // harness: everything unlocked for this page (tools/zombies-balance.mjs --meta full), never saved
 const meta=()=>cleanMeta(S.zmeta),open=id=>all||id==='std'||!!meta().g[unlockOf(id)];
 const load=()=>cleanLoad(S.zload,open);
 const M=Z.meta={DOCS,KIT,GOALS,open,load,meta,unlockAll(){all=true;sync()},
  // the doctrine in play: the host's in co-op (G.docO, set by znet.js), else this pilot's loadout
  docId:()=>G.on&&G.docO&&DOCS[G.docO]?G.docO:G.on&&G.doc?G.doc:load().doc,
  doc:()=>DOCS[M.docId()]||DOCS.std,
  // this pilot's kit in play, and the team's (co-op: znet.js overrides teamKit with every pilot's picks)
  kit:()=>G.on&&G.kit?G.kit:load().kit,teamKit:()=>M.kit(),has:id=>M.kit().includes(id)};
 // doctrine number with a default: M.k('cashK') -> the doctrine's value or 1
 M.k=(key,d=1)=>{const v=M.doc()[key];return v==null?d:v};

 // ---------- start menu: the Doctrine & unlocks panel (Zombies only) ----------
 const box=document.createElement('details');box.className='zmeta';box.id='zmeta';$('zdiff').after(box);
 const dots=bits=>ZDIFF.map((d,i)=>`<i class="${bits>>i&1?'on':''}" title="${d.n}">${d.n[0]}</i>`).join('');
 function render(){const m=meta(),L=load(),D=DOCS[L.doc],nDone=GOAL_IDS.filter(g=>m.g[g]).length;
  box.innerHTML=`<summary>Doctrine &amp; unlocks <span>${D.n}${L.kit.length?' · '+L.kit.map(k=>KIT[k].n).join(', '):''} · goals ${nDone}/${GOAL_IDS.length}</span></summary>
   <div class="zmb"><h4>Doctrine <small>one per run: it shapes the base, each with a strength and a weakness</small></h4>
   <div class="zdocs">${DOC_IDS.map(id=>`<button class="sm ${L.doc===id?'on':''}" data-doc="${id}" ${open(id)?'':'disabled'} title="${open(id)?DOCS[id].plus:'Locked: '+GOALS[unlockOf(id)].txt}">${open(id)?'':'🔒 '}${DOCS[id].n}</button>`).join('')}</div>
   <p class="zpm"><span class="cg">+ ${D.plus}</span><br><span class="co">− ${D.minus}</span></p>
   <h4>Kit <small>pick up to ${KIT_MAX}: new helpers and perks in your shop</small></h4>
   <div class="zdocs">${KIT_IDS.map(id=>`<button class="sm ${L.kit.includes(id)?'on':''}" data-kit="${id}" ${open(id)?'':'disabled'} title="${open(id)?KIT[id].plus:'Locked: '+GOALS[unlockOf(id)].txt}">${open(id)?'':'🔒 '}${KIT[id].n}</button>`).join('')}</div>
   ${L.kit.map(k=>`<p class="zpm"><b>${KIT[k].n}</b>: <span class="cg">+ ${KIT[k].plus}</span> <span class="co">− ${KIT[k].minus}</span></p>`).join('')}
   <h4>Goals <small>each unlocks one option; the letters show the difficulties you've done it on</small></h4>
   <ul class="zgoals">${GOAL_IDS.map(g=>{const G0=GOALS[g],u=G0.un,nm=(DOCS[u]?DOCS[u].n+' doctrine':KIT[u].n);return`<li class="${m.g[g]?'done':''}"><b>${m.g[g]?'✓':'·'}</b><span>${G0.txt} <em>Unlocks ${nm}.</em></span><span class="zdd">${dots(m.g[g])}</span></li>`}).join('')}</ul>
   <p class="note">Unlocks add options, not power: a doctrine trades one strength for one weakness, and kit takes one of your two picks. In co-op the host's doctrine is the team's; each pilot brings their own kit.</p></div>`;
  for(const b of box.querySelectorAll('[data-doc]'))b.onclick=()=>{const l=load();S.zload={...l,doc:b.dataset.doc};save();render()};
  for(const b of box.querySelectorAll('[data-kit]'))b.onclick=()=>{const l=load(),k=b.dataset.kit;let kit=l.kit.includes(k)?l.kit.filter(x=>x!==k):[...l.kit,k];if(kit.length>KIT_MAX)kit=kit.slice(-KIT_MAX);S.zload={...l,kit};save();render()}}
 const sync=()=>{box.hidden=S.gmode!=='z';if(!box.hidden)render()};
 S.zmeta=meta();S.zload=load();save();sync();
 const sy0=Z.syncMode;Z.syncMode=()=>{sy0?.();sync()};$('gmode').addEventListener('click',()=>setTimeout(sync,0));

 // ---------- goals: per-run record, checked as the run goes ----------
 // G.run: rep repairs bought, perf perfect waves in a row, wk kills this wave {p,h}, clutch this wave, i0 integrity at the wave's start
 M.reset=()=>{G.run={rep:0,perf:0,wk:{p:0,h:0},clutch:0,i0:0,max:0,got:[]}};M.reset();
 function award(id){const m=meta(),di=ZDIFF.indexOf(Z.diff()),min=GOALS[id].min|0;if(!GOALS[id]||di<min||G.state==='trial')return false;
  if(m.g[id]>>di&1)return false;const had=open(GOALS[id].un);m.g[id]|=1<<di;S.zmeta=m;save();G.run.got.push(id);
  const u=GOALS[id].un,nm=DOCS[u]?DOCS[u].n+' doctrine':KIT[u].n;
  if(!had&&!all){banner('UNLOCKED: '+nm.toUpperCase(),'cg',2.6);feed(`<span class="cg">Goal met: ${GOALS[id].txt}</span> Unlocked <b>${nm}</b>: pick it under Doctrine &amp; unlocks on the start menu.`)}
  else feed(`<span class="cg">Goal met on ${Z.diff().n}: ${GOALS[id].txt}</span>`);sync();return true}
 M.award=award;
 M.waveStart=()=>{const R=G.run;R.wk={p:0,h:0};R.clutch=0;const I=Z.integrity();R.i0=I.hp;R.max=I.max};
 // t.by: 'p' this pilot, 'o' another co-op pilot, 'h' a helper
 M.onKill=(t,clutch)=>{const R=G.run;if(t.by!=='h')R.wk.p++;else R.wk.h++;if(t.by==='p'&&clutch&&++R.clutch>=5)award('clutch');
  if(t.k==='boss'&&t.by==='p'&&G.burst&&!Z.autoFuse())award('boss')};
 M.onStreak=s=>{if(s>=8)award('streak')};
 M.onRepair=()=>{G.run.rep++};
 M.waveClear=()=>{const R=G.run,w=G.wave,I=Z.integrity();
  if(w>=10)award('w10');if(w>=15&&!R.rep)award('norep');if(w>=20)award('hard20');if(w>=15)award('night15');if(w>=20&&Z.def.D.length<=8)award('lean');
  if(w>=8&&R.wk.h>0&&!R.wk.p&&R.i0-I.hp<R.max*.1)award('helpers');
  R.perf=G.perfect&&w>=10?R.perf+1:0;if(R.perf>=3)award('perfect3')};
 return M}
