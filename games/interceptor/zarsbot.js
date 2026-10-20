// Zombies arsenal: how the bot pilots use it. One source of truth for both bot hosts: the shared bot brain (zbotbrain.js, when the build has
// it: zarsenal.js pushes ARSBOT onto its hooks and marks the arsenal's items as known, so its generic "try something new" leaves them alone)
// and today's tools/zbot.mjs (its SHOP runs ARSBOT.shop and its teleporting pilot asks ARSBOT.run how to use the loaded weapon).
// Pure logic, no three.js: everything comes in through E (window.__z: {api, G, Z, KIND, ITEMS}).
//   level  ars 0 sticks to the standard warhead and only builds what a naive shopper would (barrage, smoke, a laser); 1 buys a weapon by rule
//          of thumb (flechette when swarms come, the net early on); 2 picks the weapon that suits the next wave's threat mix (WEFF, with some
//          noise); 3 also weighs its own base (EMP with many helpers, the pod against jets and cruise missiles, the dart for direct hits on fast
//          missiles). From level by name (ARS_LV) unless the profile carries its own `ars`.
//   P.force a weapon id: always load it once it can (tools/zombies-arsenal-bench.mjs force:X)
import {WPN,WORDER,WEFF,ARS_HELPERS,laserWx} from './zarsdata.js';
export const ARS_LV={Rookie:0,Pro:1,'All-Star':2,Champion:3,'Grand Champion':3,Legend:3};
const lvOf=P=>P.ars??ARS_LV[P.n]??0;
const step=(why,what,run,o={})=>({why,what,run,...o});
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
// the defences each kind of shopper builds, in order, and how many of each
const DORDER={naive:['barrage','smoke','laser'],basic:['carrier','mwave','laser','barrage'],smart:['mwave','laser','carrier','barrage','smoke']};
const CAP={naive:{barrage:1,smoke:1,laser:1},basic:{carrier:1,mwave:1,laser:2,barrage:1},smart:{mwave:2,laser:2,carrier:2,barrage:2,smoke:2}};
const WHY={laser:'a dwell-time kill, no dice: best against swarms and Shaheds in clear weather',mwave:'a pulse that fries a whole FPV swarm',carrier:'12 drones parked on the main approach, no position needed',
 barrage:'cables over a site: catches what dives on it and low swarms',smoke:'diving tracks near a site lose their aim'};
export const ARSBOT={name:'arsenal',
 // a base screen: the weapon for the next wave, then the defences (ctx.afford(cost): within what this level dares spend; ctx.keep: the reserve)
 *shop(P,E,ctx={}){const {G,Z,KIND,ITEMS:IT}=E,A=Z.ars,def=Z.def;if(!A||!G.next)return;const lv=lvOf(P),nw=G.wave+1,afford=ctx.afford||(c=>G.cash>=c),keep=ctx.keep??0,part=ctx.part;  // part: 'weapon' / 'early' (microwave, laser, carrier: worth a place ahead of the helpers) / 'def' / all
  const kf=k=>Z.kindFrom?Z.kindFrom(k):KIND[k].from,cnt={};for(const q of G.next.list){const[k,c]=q.split(':');cnt[k]=(cnt[k]|0)+(+c||1)}
  // ---- the pilot weapon: value each on the next wave's threat mix ----
  if((lv||P.force)&&(!part||part==='weapon')){const me=A.P(A.me()),pts=k=>(cnt[k]|0)*(KIND[k]?KIND[k].pts:0),hard=['ballistic','hyper','icbm'].reduce((a,k)=>a+(cnt[k]|0),0),noise={};
   const val=id=>{let v=0;for(const k in cnt)v+=pts(k)*(WEFF[id][k]??0);
    if(lv>=3){if(id==='emp')v*=Math.min(1.25,.35+def.D.length/12);if(id==='flare')v+=(pts('jet')+pts('cruise'))*.25;if(id==='dart')v+=hard*40*(P.fast||0)*8;if(id==='net'&&nw<15)v*=1.15;if(id==='cluster')v*=(cnt.swarm|0)>=10?1.3:1.1}
    else if(lv===2)v*=noise[id]??=.8+Math.random()*.4;return v};
   const ok=id=>!A.ban.has(id)&&nw>=WPN[id].from;let L=WORDER.filter(ok);if(lv===1)L=L.filter(id=>id==='std'||id==='net'||id==='flech');
   const best=L.reduce((b,id)=>val(id)>val(b)?id:b,'std'),bestOwned=[...me.own].filter(ok).reduce((b,id)=>val(id)>val(b)?id:b,'std');
   const pick=P.force&&WPN[P.force]?(ok(P.force)?P.force:'std'):lv===1?((cnt.swarm|0)>=6&&ok('flech')?'flech':nw<=9&&ok('net')?'net':'std'):best;
   if(!me.own.has(pick)&&G.cash-WPN[pick].price>=Math.max(keep,WPN[pick].price*(lv>=3?1:2))&&(P.force||lv===1||val(pick)>val(bestOwned)*1.12))
    yield step(`Buying the ${WPN[pick].n} (${money(WPN[pick].price)}): it suits wave ${nw}'s threats`,'weapon',()=>A.buyW(pick),{k:pick,cost:WPN[pick].price});
   const load=()=>me.own.has(pick)?pick:lv===1?'std':bestOwned;
   if(A.cur()!==load())yield step(`Loading the ${WPN[load()].n} for wave ${nw}`,'weapon',()=>A.equip(load()),{k:load()})}
  // ---- the defences ----
  if(part==='weapon')return;
  const shop=DORDER[P.shop]?P.shop:'basic',caps=CAP[shop],nOf=k=>def.D.filter(d=>d.type===k).length,smart=shop==='smart';
  const nxw=G.next.wx&&Z.wx?.T[G.next.wx.id],lwx=nxw?laserWx(nxw):1,from=k=>Z.itemFrom?Z.itemFrom(k):IT[k].from;
  const siteSlot=k=>def.SLOTS.findIndex((s,j)=>def.slotFree(j)&&s.site&&!def.D.some(d=>d.type===k&&def.SLOTS[d.slot].site===s.site));
  for(const k of DORDER[shop]){if(part==='early'&&(shop==='naive'||k==='barrage'&&(nw<6||nOf(k))||k==='smoke'&&(!smart||nw<8||nOf(k))))continue;if(A.ban.has(k)||!IT[k]||nw<from(k)||nOf(k)>=caps[k])continue;if(k==='mwave'&&nw<kf('swarm')-1)continue;if(k==='laser'&&smart&&lwx<=.3&&!nOf(k))continue;
   const price=Z.itemPrice?Z.itemPrice(k):IT[k].price;if(!afford(price)||G.cash-price<keep)continue;
   if(k==='carrier'){const j=def.SLOTS.findIndex((_,j)=>def.slotFree(j,'carrier'));if(j>=0)yield step(`Buying a ${IT[k].n.toLowerCase()} (${money(price)}): ${WHY[k]}`,'place',()=>Z.base.act.place(k,j),{k,slot:j,cost:price});continue}
   let j=smart&&(k==='barrage'||k==='smoke')?siteSlot(k):-1;if(j<0)j=def.SLOTS.findIndex((_,j)=>def.slotFree(j));
   if(j<0&&P.sell&&(k==='mwave'||k==='laser')){const w=def.D.filter(d=>d.type==='flak'||d.type==='ew'||d.type==='lrack'||d.type==='barrage'&&d.kills<G.wave/2).sort((a,b)=>a.kills-b.kills)[0];
    if(w){yield step(`Selling the ${IT[w.type].n.toLowerCase()} at ${def.SLOTS[w.slot].n} to make room for a ${IT[k].n.toLowerCase()}`,'sell',()=>Z.base.act.sell(w.id),{id:w.id});j=def.SLOTS.findIndex((_,j)=>def.slotFree(j))}}
   if(j>=0){const jj=j;yield step(`Buying a ${IT[k].n.toLowerCase()} (${money(price)}) at ${def.SLOTS[jj].n}: ${WHY[k]}`,'place',()=>Z.base.act.place(k,jj),{k,slot:jj,cost:price})}}
  // carriers: re-parked every break on the approach that brings the most threat points
  if(shop!=='naive'&&part!=='early')for(const d of def.D)if(d.type==='carrier'){const b=A.bestPark(),s=def.SLOTS[d.slot];if(Math.hypot(s.x-b.x,s.z-b.z)>5)yield step('Parking the drone carrier on the main approach','park',()=>A.autoPark(d.id),{id:d.id})}},
 // the brain's per-tick tactics: nothing extra (the weapon's use is in how the pilot fires it, run() below for the teleporting pilot)
 wave(){},
 // the teleporting pilot (tools/zbot.mjs WAVE): which track to run down with the loaded weapon, and where to put the interceptor before firing.
 // Returns {t, off, at} (fire from `off` metres behind `at`, default t's position), or null to let the pilot do its usual run.
 run(P,E,u,bad){const {api,Z,KIND}=E,A=Z.ars;if(!A)return null;const lv=lvOf(P),w=A.cur(),live=()=>api.TH.filter(api.live),tti=t=>Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/Math.max(1,t.spd);
  let t=u;if(lv>=2&&t&&A.fits(t)<.5)t=live().filter(q=>KIND[q.k].armor!=='hard'&&!q.claim&&A.fits(q)>=.5).sort((a,b)=>tti(a)-tti(b))[0]||u;if(!t)return null;
  const centre=r=>{const c=t.p.clone().multiplyScalar(0);let n=0;for(const q of live())if(q.p.distanceTo(t.p)<r){c.add(q.p);n++}return n?c.divideScalar(n):t.p.clone()};
  if(w==='flare'&&Math.random()<(P.miss||0)*.3)bad=true;  /* the pod's lighter warhead forgives less */
  if(w==='emp')return{t,off:bad?70:12,at:centre(60)};if(w==='cluster')return{t,off:bad?420:80,at:centre(200)};if(w==='net')return{t,off:bad?12:3};
  if(w==='dart')return{t,off:bad||Math.random()<.3?3:.6};return{t,off:bad?7:.8}},
 fastK:(E)=>E.Z.ars?.cur()==='dart'?1.4:1};
// mark the arsenal's items as known to the brain and hook it in (once); E = window.__z
export const registerArsBot=E=>{const b=E?.brain;if(!b?.hooks||b.hooks.includes(ARSBOT))return;b.hooks.push(ARSBOT);if(b.KNOWN)for(const k of ARS_HELPERS)b.KNOWN.add(k)};
