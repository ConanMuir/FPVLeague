// Zombies base screen, shown between waves with no timer. An overview map of the defended area (sites, slots, your defences, where the
// next wave comes from), a Shop listing every helper, supply and perk, the Armory (upgrade, refit, move or sell anything you own), Base (repairs,
// rebuilding a destroyed site, opening more positions, upkeep), and Continue.
// Keyboard: arrows move focus, Enter / Space activate, 1-4 tabs, C continue (Esc opens the menu; Cancel backs out of a placement). Gamepad: D-pad, A, B cancel, LB/RB tabs, Y continue.
import {KIND,ITEMS,RESIST,REPAIR_PER_HP,PERK,RACK_TIERS,RACK_CAP,RACK_CAP_COST,RACK_RANGE,ORDER,HELP,REFIT,LRACK,SUPPLY,UPKEEP_FROM,expCost,rebuildCost,REBUILD_HP,moveCost} from './zdata.js';
const $=id=>document.getElementById(id);
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
const MAPX=[-3200,3200],MAPZ=[-1900,2900],MW=640,MH=Math.round(MW*(MAPZ[1]-MAPZ[0])/(MAPX[1]-MAPX[0]));
export function initBase(Z,api,G){
 const {SITES,PADP,FOBS}=api;
 const el=document.createElement('div');el.id='zbase';el.hidden=true;$('menu').before(el);
 const over=document.createElement('div');over.id='zover';over.hidden=true;$('menu').before(over);
 let tab='shop',focusSlot=-1,mapImg=null;
 const doc=()=>Z.meta.doc(),dk=(k,d=1)=>Z.meta.k(k,d);
 // Z.xTab (sorties, zsortie.js): one extra tab {id, n, html(), wire(el), map(g, W, H), click(x, y, W, H), legend()} that draws its own map
 const tabList=()=>[['shop','Shop'],['armory','Armory'],['sites','Base'],...(Z.chainHTML?[['chain','Kill chain']]:[]),...(Z.xTab?[[Z.xTab.id,Z.xTab.n]]:[])],xt=()=>!!Z.xTab&&tab===Z.xTab.id&&!G.placing;
 const repairK=()=>Z.repairK?.()??1,repairCost=s=>Math.ceil((s.max-s.hp)*REPAIR_PER_HP*repairK());
 const upCost=c=>Math.round(c*dk('upK')/10)*10,refund=d=>Math.floor((d.spent||ITEMS[d.type].price)*dk('sellK',.5));
 const mx=x=>(x-MAPX[0])/(MAPX[1]-MAPX[0])*MW,mz=z=>(z-MAPZ[0])/(MAPZ[1]-MAPZ[0])*MH;
 const def=Z.def;

 // ---------- shop: the whole catalogue, grouped (helpers, supplies for the next wave, active perks, passive perks); no random cards, no reroll ----------
 // Helpers can be bought again and again (one per free position); perks until they reach their top level; supplies once per wave. Items not unlocked
 // yet show the wave they arrive. Kit items (zmeta.js) are listed only when a pilot brought them.
 const GROUPS=[['Helpers',k=>ITEMS[k].type==='helper'],['Supplies for the next wave',k=>ITEMS[k].type==='supply'],['Active perks',k=>ITEMS[k].type==='perk'&&!!PERK[k].key],['Passive perks',k=>ITEMS[k].type==='perk'&&!PERK[k].key]];
 const offered=k=>!ITEMS[k].kit||(ITEMS[k].type==='helper'?Z.meta.teamKit():Z.meta.kit()).includes(k);
 function deal(){G.cards=[];for(const[g,f]of GROUPS)for(const k of Object.keys(ITEMS))if(f(k)&&offered(k)&&!Z.cpBan?.(k))G.cards.push({k,g})}  /* Z.cpBan: an item a campaign sector takes out of the shop */
 // a supply's price: per unit x what it applies to (racks, launchers, live sites or helpers), at least one unit
 const supN=k=>{const of=SUPPLY[k].of;return Math.max(1,of==='rack'?def.D.filter(def.isRack).length:of==='launcher'?def.D.filter(d=>def.magOf(d)>0).length:of==='site'?api.liveSites().length:def.D.length)};
 const supPrice=k=>Math.round(SUPPLY[k].per*supN(k)*dk('supplyK')/10)*10;
 const price=k=>ITEMS[k].type==='perk'?Z.perkPrice(k):ITEMS[k].type==='supply'?supPrice(k):ITEMS[k].price;
 Z.itemPrice=price;
 const locked=k=>G.wave+1<Z.itemFrom(k),maxed=k=>ITEMS[k].type==='perk'?Z.perkMaxed(k):ITEMS[k].type==='supply'?!!G.sup?.[k]:false;
 function buy(i){const c=G.cards[i];if(!c||locked(c.k)||maxed(c.k))return;const it=ITEMS[c.k],p=price(c.k);if(G.cash<p)return;
  if(it.type==='helper'){if(!def.SLOTS.some((_,j)=>def.slotFree(j)))return;G.placing={i,k:c.k,p};focusSlot=def.SLOTS.findIndex((_,j)=>def.slotFree(j));render();focus('[data-slot]');return}
  if(it.type==='supply'){if(Z.req)Z.req(['y',c.k]);else act.supply(c.k)}
  else if(Z.req)Z.req(['p',c.k]);else{G.cash-=p;Z.buyPerk(c.k)}render();focus(`[data-buy="${i}"]`)}
 // Z.req (co-op): every purchase is a request to the host, which owns the shared purse; act.* are the purchases themselves (solo, and the host applying a request)
 const byId=id=>def.D.find(x=>x.id===id);
 const tally=Z.tally=(k,c)=>{if(c>0)(G.spend||(G.spend={}))[k]=(G.spend[k]|0)+c;return c};  // what went into each late-game sink this run (game-over stats, tools/zombies-balance.mjs)
 const act={place(k,j,by){const it=ITEMS[k];if(!it||it.type!=='helper'||!offered(k)||locked(k)||G.cash<it.price||!def.SLOTS[j]||!def.slotFree(j))return null;G.cash-=it.price;const d=def.add(k,j);d.spent=it.price;if(by)d.by=by;return d},
  sell(id){const d=byId(id);if(!d)return null;const r=refund(d);G.cash+=r;def.remove(d);return r},
  upgrade(id,what){const d=byId(id);if(!d)return 0;const c0=G.cash;
   if(def.isRack(d)){if(what==='tier'){const N=RACK_TIERS[d.tier+1],c=N&&upCost(N.cost);if(N&&!(d.type==='lrack'&&d.tier>=LRACK.maxTier)&&G.cash>=c){G.cash-=c;d.tier++}}
    else if(d.type==='rack'){const ci=RACK_CAP.indexOf(d.cap),c=RACK_CAP_COST[ci+1]&&upCost(RACK_CAP_COST[ci+1]);if(c&&G.cash>=c){G.cash-=c;d.cap=RACK_CAP[ci+1];d.ready=def.capOf(d)}}}
   else{const n=HELP[d.type].lv[d.lvl+1],c=n&&upCost(n.cost);if(n&&G.cash>=c){G.cash-=c;d.lvl++}}d.spent=(d.spent||ITEMS[d.type].price)+c0-G.cash;return c0-G.cash},
  // an Armory refit: one per defence, each a trade (zdata REFIT); fitting the other one costs its price again
  refit(id,rid){const d=byId(id),R=d&&(REFIT[d.type]||[]).find(r=>r.id===rid);if(!R||d.refit===rid)return 0;const c=upCost(R.cost);if(G.cash<c)return 0;
   G.cash-=c;d.refit=rid;d.spent=(d.spent||ITEMS[d.type].price)+c;if(def.isRack(d))d.ready=Math.min(d.ready,def.capOf(d));return tally('refit',c)},
  // move a defence to another open position (it redeploys there when the wave starts)
  move(id,j){const d=byId(id),c=d?moveCost(d):0;if(!d||G.cash<c||!def.slotFree(j))return-1;def.move(d,j);G.cash-=c;return tally('move',c)},
  // open one more position; each costs more (zdata expCost); a doctrine can rule some out
  expand(j){const c=expCost(G.exp|0,dk('expK'));if(!def.canOpen(j,doc())||G.cash<c)return 0;G.cash-=c;G.open[j]=true;G.exp=(G.exp|0)+1;return tally('expand',c)},
  // rebuild a destroyed site at 40% of its hit points
  rebuild(i){const s=SITES[i],c=rebuildCost(G.rebuilds|0);if(!s||s.hp>0||G.cash<c)return 0;G.cash-=c;s.hp=Math.round(s.max*REBUILD_HP);G.rebuilds=(G.rebuilds|0)+1;return tally('rebuild',c)},
  supply(k){if(!SUPPLY[k]||locked(k)||G.sup?.[k])return 0;const c=supPrice(k);if(G.cash<c)return 0;G.cash-=c;(G.sup||(G.sup={}))[k]=1;return tally('supply',c)},
  repair(i,hp){const s=SITES[i],k=repairK();if(!s||s.hp<=0)return 0;hp=Math.min(hp|0,s.max-s.hp,Math.floor(G.cash/(REPAIR_PER_HP*k)));if(hp<=0)return 0;G.cash-=Math.ceil(hp*REPAIR_PER_HP*k);s.hp+=hp;Z.meta.onRepair();return hp}};
 function place(j){const P=G.placing;if(!P||!def.slotFree(j))return;
  if(P.mv){if(Z.req)Z.req(['m',P.mv,j]);else act.move(P.mv,j);G.placing=null;tab='armory';render();focus(`[data-mv="${P.mv}"]`);return}
  if(Z.req)Z.req(['b',P.k,j]);else act.place(P.k,j);G.placing=null;tab='armory';render();focus('[data-up]')}
 function cancelPlace(){if(!G.placing)return false;const mv=G.placing.mv;G.placing=null;render();focus(mv?`[data-mv="${mv}"]`:'[data-buy]');return true}

 // how a defence does against the kinds you have met or are about to meet
 const vsChips=k=>{const R=RESIST[k];if(!R)return'';return ORDER.concat('boss').filter(e=>Z.kindFrom(e)<=G.wave+1).map(e=>{const v=R[e]??0;return`<span class="v${v>=.8?'g':v>0?'m':'n'}" title="${KIND[e].n}">${KIND[e].tag}</span>`}).join('')};
 // one compact row per item: glyph, name and level, one-line description (and what a helper is good against), price button
 function rowHTML(c,i){const it=ITEMS[c.k],L=locked(c.k),M=maxed(c.k),p=price(c.k),sup=it.type==='supply',lvl=it.type==='perk'?Z.perkLevel(c.k):0,own=it.type==='helper'?def.D.filter(d=>d.type===c.k).length:0;
  const tag=it.type==='perk'?(lvl?`LV ${lvl}${M?' · MAX':''}`:''):sup?(M?'READY':''):(own?`×${own} OWNED`:'');
  const txt=L?`Arrives with wave ${Z.itemFrom(c.k)}.`:it.type==='perk'?(M?'Fully upgraded.':Z.perkBlurb(c.k)):sup?`${SUPPLY[c.k].txt} ${M?`Loaded for wave ${G.wave+1}.`:`This wave only.`}`:it.blurb;
  return`<div class="zitem ${L?'lock':''} ${sup&&M?'got':''}"><span class="zg">${it.glyph}</span><div class="zid"><b>${it.n}</b>${tag?`<em>${tag}</em>`:''}${it.kit?'<em>KIT</em>':''}
   <p>${txt}</p>${it.type==='helper'&&!L?`<div class="zvs">${vsChips(c.k)}</div>`:''}</div>
   <button class="sm" data-buy="${i}" ${L||M||G.cash<p?'disabled':''}>${L?`Wave ${Z.itemFrom(c.k)}`:M?(sup?'Loaded ✓':'Max'):`${it.type==='perk'&&lvl?'Upgrade':'Buy'} ${money(p)}`}</button></div>`}
 function shopHTML(){let h='',g='';G.cards.forEach((c,i)=>{if(c.g!==g){h+=`${g?'</div>':''}<h3>${c.g}</h3><div class="zitems">`;g=c.g}h+=rowHTML(c,i)});return h+'</div>'}
 const upkeepOf=d=>Z.upkeep?Z.upkeep().per.get(d)|0:0;
 function defRow(d){const s=def.SLOTS[d.slot],it=ITEMS[d.type],up=upkeepOf(d);let ups='';
  if(def.isRack(d)){const T=RACK_TIERS[d.tier],top=d.type==='lrack'?LRACK.maxTier:RACK_TIERS.length-1,N=d.tier<top?RACK_TIERS[d.tier+1]:null,ci=RACK_CAP.indexOf(d.cap),nc=d.type==='rack'?RACK_CAP[ci+1]:null,cc=nc&&upCost(RACK_CAP_COST[ci+1]);
   ups=`<span class="zst">${T.n} · ${Math.round(T.hit*100)}% kill per hit · ${def.capOf(d)} drones · ${(def.rangeOf(d)/1000).toFixed(1)} km · ${d.kills} kills</span>
    ${N?`<span class="zst zn">Next: ${N.n}, ${Math.round(N.hit*100)}% per hit, ${N.note}</span>`:''}
    <button class="sm" data-up="${d.id}:tier" ${N&&G.cash>=upCost(N.cost)?'':'disabled'}>${N?`${N.n} ${money(upCost(N.cost))}`:`${T.n}: max`}</button>
    ${d.type==='rack'?`<button class="sm" data-up="${d.id}:cap" ${nc&&G.cash>=cc?'':'disabled'}>${nc?`+1 drone ${money(cc)}`:'4 drones: max'}</button>`:''}`}
  else{const H=HELP[d.type],l=H.lv[d.lvl],n=H.lv[d.lvl+1],m=def.magOf(d);
   ups=`<span class="zst">${H.lv.length>1?`level ${d.lvl+1}`:'no upgrades'}${m?` · ${m} shots per wave`:''} · ${(def.rangeOf(d)/1000).toFixed(1)} km${d.type==='ew'?` · ${d.kills} spoofed`:` · ${d.kills} kills`}</span>
    ${n?`<span class="zst zn">Next: level ${d.lvl+2}, ${n.txt}</span>`:''}
    ${H.lv.length>1?`<button class="sm" data-up="${d.id}:lvl" ${n&&G.cash>=upCost(n.cost)?'':'disabled'}>${n?`Level ${d.lvl+2} ${money(upCost(n.cost))}`:'Max level'}</button>`:''}`}
  const RF=REFIT[d.type]||[],cur=RF.find(r=>r.id===d.refit);
  if(RF.length)ups+=`<span class="zst zn">${cur?`Refit: <b>${cur.n}</b>. ${cur.txt}`:'Refit (one per defence, each a trade):'}</span>${RF.map(r=>`<button class="sm zfit ${d.refit===r.id?'on':''}" data-fit="${d.id}:${r.id}" title="${r.txt}" ${d.refit!==r.id&&G.cash>=upCost(r.cost)?'':'disabled'}>${d.refit===r.id?'✓ '+r.n:`${r.n} ${money(upCost(r.cost))}`}</button>`).join('')}`;
  const mc=moveCost(d),armed=sellArm===d.id;
  ups+=`<button class="sm" data-mv="${d.id}" ${G.cash>=mc&&def.SLOTS.some((_,j)=>def.slotFree(j))?'':'disabled'}>Move${mc?' '+money(mc):' (free)'}</button>`;
  return`<div class="zarm"><span class="zg">${it.glyph}</span><div><b>${it.n}</b><small>${s.n}${d.by?' · '+d.by:''}${up?` · upkeep ${money(up)}`:''}${d.short?' · <span class="co">short of ammo</span>':''}</small></div><div class="zups">${ups}<button class="sm zsell ${armed?'arm':''}" data-sell="${d.id}">${armed?`Confirm: sell for ${money(refund(d))}`:`Sell ${money(refund(d))}`}</button></div></div>`}
 // selling frees the slot and refunds half of everything spent on it (a quarter under Quartermaster); it takes a second press to confirm
 let sellArm=0;
 function sell(id){const d=byId(id);if(!d)return;if(sellArm!==id){sellArm=id;render();focus(`[data-sell="${id}"]`);return}
  sellArm=0;if(Z.req)Z.req(['s',id]);else act.sell(id);render();focus('[data-up]')}
 function upgrade(id,what){if(!byId(id))return;if(Z.req)Z.req(['g',id,what]);else act.upgrade(id,what);render();focus(`[data-up="${id}:${what}"]`)}
 function refit(id,rid){if(!byId(id))return;if(Z.req)Z.req(['f',id,rid]);else act.refit(id,rid);render();focus(`[data-fit="${id}:${rid}"]`)}
 function startMove(id){const d=byId(id);if(!d||G.cash<moveCost(d))return;G.placing={mv:id,k:d.type};focusSlot=def.SLOTS.findIndex((_,j)=>def.slotFree(j));render();focus('[data-slot]')}
 function expand(j){if(Z.req)Z.req(['x',j]);else act.expand(j);render();focus('[data-ex]')}
 function rebuild(i){if(Z.req)Z.req(['R',i]);else act.rebuild(i);render();focus(`[data-rep="${i}"]`)}
 function upPerk(k){const c=Z.perkPrice(k);if(Z.perkMaxed(k)||G.cash<c)return;if(Z.req)Z.req(['p',k]);else{G.cash-=c;Z.buyPerk(k)}render();focus(`[data-perk="${k}"]`)}

 // Base tab: the sites (repair, or rebuild a destroyed one), the positions you can still open, and the upkeep
 function baseHTML(){const rc=rebuildCost(G.rebuilds|0);
  let h=`<h3>Sites</h3><div class="zsites">${SITES.map((s,i)=>{const c=repairCost(s),part=Math.min(s.max-s.hp,Math.floor(G.cash/(REPAIR_PER_HP*repairK())));
   return`<div class="zrow"><span>${s.n}</span><span class="zhp"><b><i style="width:${Math.max(0,s.hp)/s.max*100}%" class="${s.hp<s.max*.35?'lo':s.hp<s.max*.7?'mid':''}"></i></b>${Math.max(0,Math.ceil(s.hp))}/${s.max}</span>
   ${s.hp<=0?`<button class="sm" data-rb="${i}" ${G.cash>=rc?'':'disabled'}>Rebuild to ${Math.round(REBUILD_HP*100)}% ${money(rc)}</button>`:`<button class="sm" data-rep="${i}" ${c&&part>0?'':'disabled'}>${!c?'Intact':part<s.max-s.hp?`Repair ${part} hp ${money(Math.ceil(part*REPAIR_PER_HP*repairK()))}`:`Repair ${money(c)}`}</button>`}</div>`}).join('')}</div>
   <p class="zhint">Repairs cost $${(REPAIR_PER_HP*repairK()).toFixed(2)} per hit point${repairK()<1?' (discounted)':''}. A destroyed site can be rebuilt to ${Math.round(REBUILD_HP*100)}%; each rebuild costs more.</p>`;
  const can=def.SLOTS.map((_,j)=>j).filter(j=>def.canOpen(j,doc())),nOpen=def.SLOTS.filter((_,j)=>def.slotOpen(j)).length,ec=expCost(G.exp|0,dk('expK'));
  h+=`<h3 style="margin-top:12px">Positions · ${nOpen} open</h3>${can.length?`<p class="zhint">Open another position for <b>${money(ec)}</b> (each one costs more). Forward pads and outposts engage first but cost double upkeep.</p>
   <div class="zexp">${can.map(j=>`<button class="sm" data-ex="${j}" ${G.cash>=ec?'':'disabled'}>${def.SLOTS[j].n}${def.SLOTS[j].fwd?' ▲':''}</button>`).join('')}</div>`:`<p class="zhint">Every position your doctrine allows is open.</p>`}`;
  const U=Z.upkeep?.()||{total:0},nw=G.wave+1;
  h+=`<h3 style="margin-top:12px">Upkeep</h3><p class="zhint">${dk('upkeepK')===0?'Quartermaster: no upkeep.':nw<UPKEEP_FROM?`From wave ${UPKEEP_FROM} each defence costs 2% of what you spent on it per wave (forward positions 4%), paid when a wave is cleared. Unpaid upkeep leaves the dearest defences short of ammo (half load) for a wave.`:`<b>${money(U.total)}</b> due when wave ${nw} is cleared: 2% of what each defence cost (forward positions 4%). Sell what you don't need; whatever the purse can't cover leaves the dearest defences short of ammo for a wave.`}</p>`;
  return h}

 // ---------- render ----------
 function render(){const integ=SITES.reduce((a,s)=>(a.hp+=Math.max(0,s.hp),a.max+=s.max,a),{hp:0,max:0}),f=integ.hp/integ.max,P=G.placing;
  let body='';
  if(P)body=`<h3>${P.mv?`Move the ${ITEMS[P.k].n.toLowerCase()} to`:`Choose a position for the ${ITEMS[P.k].n.toLowerCase()}`}</h3><p class="zhint">Pick a slot here or click a free circle on the map. It deploys when the wave starts.</p>
   <div class="zslots">${def.SLOTS.map((s,j)=>def.slotFree(j)?`<button class="sm" data-slot="${j}">${s.n}</button>`:'').join('')}</div><div class="mp"><button class="sm" id="zcancel">Cancel</button></div>`;
  else if(tab==='shop')body=shopHTML();
  else if(tab==='armory'){const perks=Z.perkRows?.(money)||'';body=`${def.D.length?def.D.map(defRow).join(''):'<p class="zhint">No defences yet. Buy helpers from the shop cards.</p>'}${perks?`<h3 style="margin-top:14px">Perks</h3>${perks}`:''}`}
  else if(tab==='chain'&&Z.chainHTML)body=Z.chainHTML();  /* the kill chain against the fast missiles (zchain.js) */
  else if(xt())body=Z.xTab.html();
  else body=baseHTML();
  const fc=forecast(),D=doc(),U=Z.upkeep?.(),sh=Z.def.D.filter(d=>d.short).length;
  el.innerHTML=`<div class="zpanel zb"><header><div><h2>${G.wave?`Wave ${G.wave} cleared`:'Briefing'}</h2><div class="zbig">${money(G.cash)}</div></div>
   <div class="zint"><span>Defense integrity ${Math.round(f*100)}% · ${Math.ceil(integ.hp)}/${integ.max}</span><b><i style="width:${(f*100).toFixed(1)}%" class="${f<.3?'lo':f<.6?'mid':''}"></i></b></div>
   <button class="go" id="zgo">${Z.goTxt?.()||`Start wave ${G.wave+1} ▸`}</button>
   <div class="zdoc">Doctrine <b>${D.n}</b>${U&&U.total?` · upkeep <b>${money(U.total)}</b> after this wave`:''}${sh?` · <span class="co">${sh} short of ammo (upkeep unpaid)</span>`:''}${G.lastUp?` · last upkeep ${money(G.lastUp)}`:''}</div></header>${Z.coopHTML?.()||''}${Z.cpHTML?.()||''}
   <div class="zcols"><div class="zmapw"><canvas id="zmap" width="${MW*2}" height="${MH*2}"></canvas>
    <div class="zleg">${xt()?Z.xTab.legend():`<span><i class="ls"></i>site</span><span><i class="le"></i>free slot</span><span><i class="ld"></i>your defence</span><span><i class="lf"></i>forward position</span><span><i class="lx">+</i>position to open (Base tab)</span><span><i class="lt"></i>next wave's approach</span>`}</div></div>
   <div class="zside"><nav class="ztabs">${tabList().map(([k,n],i)=>`<button class="sm ${tab===k&&!P?'on':''}" data-tab="${k}"><kbd>${i+1}</kbd> ${n}</button>`).join('')}</nav><div class="ztab">${body}</div></div></div>
   <footer class="zfc"><h3>Wave ${G.wave+1}${fc.boss?' · <span class="cr">BOSS</span>':''}${Z.wx?.note(G.next.wx)||''}</h3>${fc.html}</footer></div>`;
  $('zgo').onclick=()=>{if(!G.placing)Z.continue()};$('zcancel')&&($('zcancel').onclick=cancelPlace);
  for(const b of el.querySelectorAll('[data-tab]'))b.onclick=()=>{if(G.placing)return;tab=b.dataset.tab;render();focus(`[data-tab="${tab}"]`)};
  for(const b of el.querySelectorAll('[data-buy]'))b.onclick=()=>buy(+b.dataset.buy);
  for(const b of el.querySelectorAll('[data-slot]')){b.onclick=()=>place(+b.dataset.slot);b.onfocus=()=>{focusSlot=+b.dataset.slot;drawMap()}}
  for(const b of el.querySelectorAll('[data-ex]')){b.onclick=()=>expand(+b.dataset.ex);b.onfocus=()=>{focusSlot=+b.dataset.ex;drawMap()};b.onblur=()=>{focusSlot=-1;drawMap()}}
  for(const b of el.querySelectorAll('[data-up]'))b.onclick=()=>{const[id,w]=b.dataset.up.split(':');upgrade(+id,w)};
  for(const b of el.querySelectorAll('[data-fit]'))b.onclick=()=>{const[id,r]=b.dataset.fit.split(':');refit(+id,r)};
  for(const b of el.querySelectorAll('[data-mv]'))b.onclick=()=>startMove(+b.dataset.mv);
  for(const b of el.querySelectorAll('[data-perk]'))b.onclick=()=>upPerk(b.dataset.perk);
  for(const b of el.querySelectorAll('[data-sell]'))b.onclick=()=>sell(+b.dataset.sell);
  for(const b of el.querySelectorAll('[data-rb]'))b.onclick=()=>rebuild(+b.dataset.rb);
  for(const b of el.querySelectorAll('[data-kc]'))b.onclick=()=>{const k=b.dataset.kc,i=k.indexOf(':');Z.chain.req(k.slice(0,i),k.slice(i+1));render();focus(`[data-kc="${k}"]`)};
  if(xt())Z.xTab.wire(el);
  for(const b of el.querySelectorAll('[data-rep]'))b.onclick=()=>{const i=+b.dataset.rep,s=SITES[i],k=repairK(),hp=Math.min(s.max-s.hp,Math.floor(G.cash/(REPAIR_PER_HP*k)));if(hp<=0)return;if(Z.req)Z.req(['r',i,hp]);else act.repair(i,hp);render();focus(`[data-rep="${b.dataset.rep}"]`)};
  const cv=$('zmap');cv.onclick=e=>{const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*MW,y=(e.clientY-r.top)/r.height*MH;let bj=-1,bd=24;if(xt()){Z.xTab.click(x,y,MW,MH);return}
   const can=j=>G.placing?def.slotFree(j):tab==='sites'&&def.canOpen(j,doc());def.SLOTS.forEach((s,j)=>{const[sx,sy]=spx(j),d=Math.hypot(sx-x,sy-y);if(can(j)&&d<bd){bd=d;bj=j}});
   if(bj<0)return;if(G.placing)place(bj);else{focusSlot=bj;drawMap();el.querySelector(`[data-ex="${bj}"]`)?.focus()}};
  drawMap()}
 // next wave preview: counts per kind, new kinds flagged, approach bearings drawn on the map
 function forecast(){const n={};for(const q of G.next.list){const[k,c]=q.split(':');n[k]=(n[k]||0)+(+c||1)}
  const isNew=k=>Z.kindFrom(k)===G.wave+1;
  const html=Object.entries(n).map(([k,c])=>{const K=KIND[k];return`<span class="zfk ${isNew(k)?'new':''}">${c}× ${K.n}${isNew(k)?' <b>NEW</b>':''}</span>`}).join('');
  const nw=Object.keys(n).filter(isNew).map(k=>`<p class="zhint"><b>${KIND[k].n}</b>: ${Z.kindNote?.(k)||''}</p>`).join('');
  return{html:`<div class="zfks">${html}</div>${nw}${Z.tacNote?.()||''}${Z.cutNote?.()||''}`,boss:!!n.boss}}

 // ---------- overview map ----------
 function bg(){if(mapImg)return mapImg;const src=api.groundTex.image,TW=9000,KP=src.width/TW,c=document.createElement('canvas');c.width=MW*2;c.height=MH*2;const g=c.getContext('2d');
  g.drawImage(src,(MAPX[0]+TW/2)*KP,(MAPZ[0]+TW/2)*KP,(MAPX[1]-MAPX[0])*KP,(MAPZ[1]-MAPZ[0])*KP,0,0,c.width,c.height);g.fillStyle='rgba(6,10,18,.45)';g.fillRect(0,0,c.width,c.height);return mapImg=c}
 function drawMap(){const cv=$("zmap");if(!cv||!G.next||el.hidden)return;const g=cv.getContext('2d');g.setTransform(2,0,0,2,0,0);g.drawImage(bg(),0,0,MW,MH);
  if(xt()){Z.xTab.map(g,MW,MH);return}Z.mapFog?.(g,mx,mz);  // the extra tab (sorties) draws its own wider map; here: the fog of war over the enemy side
  g.strokeStyle='rgba(120,200,255,.35)';g.setLineDash([6,6]);g.strokeRect(mx(-api.AW),mz(-api.AW),mx(api.AW)-mx(-api.AW),mz(api.AW)-mz(-api.AW));g.setLineDash([]);
  // approach arrows
  for(const b of G.next.brgs){const R=3800,x=Math.sin(b)*R,z=1950-Math.cos(b)*R,X=Math.min(MW-14,Math.max(14,mx(x))),Y=Math.min(MH-14,Math.max(14,mz(z))),a=Math.atan2(mz(1950)-Y,mx(0)-X);
   g.save();g.translate(X,Y);g.rotate(a);g.fillStyle='rgba(255,77,77,.9)';g.beginPath();g.moveTo(16,0);g.lineTo(-8,-10);g.lineTo(-3,0);g.lineTo(-8,10);g.closePath();g.fill();g.restore()}
  g.font='700 11px "JetBrains Mono",monospace';g.textAlign='center';
  for(const s of SITES){const hp=Math.max(0,s.hp)/s.max;g.fillStyle=s.hp>0?'#7fd0ff':'#555b66';g.fillRect(mx(s.x)-7,mz(s.z)-7,14,14);
   g.strokeStyle=hp>.7?'#3ddc84':hp>.35?'#ffc640':'#ff4d4d';g.lineWidth=3;g.beginPath();g.arc(mx(s.x),mz(s.z),13,-Math.PI/2,-Math.PI/2+hp*Math.PI*2);g.stroke();
   g.fillStyle='#dfe8ff';g.fillText(s.n,mx(s.x),mz(s.z)+28)}
  g.strokeStyle='#ffc640';g.lineWidth=2;g.strokeRect(mx(PADP.x)-5,mz(PADP.z)-5,10,10);
  Z.chainMap?.(g,mx,mz,MW,MH);  // boost batteries at their launch edge, point defence at the sites (zchain.js)
  for(const f of FOBS){g.strokeStyle='#3ddc84';g.beginPath();g.moveTo(mx(f.x),mz(f.z)-7);g.lineTo(mx(f.x)+7,mz(f.z)+5);g.lineTo(mx(f.x)-7,mz(f.z)+5);g.closePath();g.stroke()}
  const ae=document.activeElement?.dataset,foc=ae?.up||ae?.fit||ae?.mv?byId(+String(ae.up||ae.fit||ae.mv).split(':')[0]):null;
  def.SLOTS.forEach((s,j)=>{const d=def.D.find(q=>q.slot===j),[X,Y]=spx(j);
   if(d){if(d===foc){const r=Math.min(def.rangeOf(d),20000)/(MAPX[1]-MAPX[0])*MW;g.strokeStyle='rgba(95,227,255,.5)';g.lineWidth=1.5;g.beginPath();g.arc(X,Y,r,0,7);g.stroke()}
    g.fillStyle='#5fe3ff';g.beginPath();g.arc(X,Y,8,0,7);g.fill();g.fillStyle='#04121a';g.font='700 10px "JetBrains Mono",monospace';g.fillText(ITEMS[d.type].glyph,X,Y+3.5)}
   else if(def.slotOpen(j)){const hot=G.placing&&j===focusSlot;g.strokeStyle=hot?'#ffe23c':G.placing?'rgba(255,226,60,.75)':'rgba(220,230,255,.4)';g.lineWidth=hot?3:1.5;g.setLineDash(hot?[]:[3,3]);g.beginPath();g.arc(X,Y,hot?9:7,0,7);g.stroke();g.setLineDash([])}
   else if(def.canOpen(j,doc())){const hot=!G.placing&&j===focusSlot;g.strokeStyle=hot?'#ffc640':'rgba(220,230,255,.22)';g.lineWidth=hot?2.5:1;g.strokeRect(X-5,Y-5,10,10);g.fillStyle=hot?'#ffc640':'rgba(220,230,255,.35)';g.fillText('+',X,Y+4)}});
  if(G.placing&&focusSlot>=0){const s=def.SLOTS[focusSlot],dd=G.placing.mv?byId(G.placing.mv):null,r=Math.min(dd?def.rangeOf(dd):HELP[G.placing.k]?.rng||(G.placing.k==='lrack'?LRACK.rng:RACK_RANGE),20000)/(MAPX[1]-MAPX[0])*MW;g.strokeStyle='rgba(255,226,60,.45)';g.beginPath();g.arc(mx(s.x),mz(s.z),r,0,7);g.stroke()}}

 // slots are drawn schematically around their site / pad / forward position (true scale would stack them on top of each other)
 function spx(j){const s=def.SLOTS[j];if(s.site){const dx=s.x-s.site.x,dz=s.z-s.site.z,l=Math.hypot(dx,dz)||1;return[mx(s.site.x)+dx/l*24,mz(s.site.z)+dz/l*24]}
  if(/^Radar/.test(s.n))return[mx(PADP.x)+(s.x<PADP.x?-18:18),mz(PADP.z)-6];if(s.out)return[mx(s.x),mz(s.z)];return[mx(s.x)+(/pad 2$/.test(s.n)?14:-14),mz(s.z)+12]}
 const focus=q=>setTimeout(()=>{const b=el.querySelector(q+':not([disabled])');(b||$('zgo'))?.focus();drawMap()},0);
 function open(){document.body.classList.add('zb-open');G.state="base";G.placing=null;tab='shop';deal();el.hidden=false;render();focus('[data-buy]')}
 function close(){el.hidden=true;G.placing=null;document.body.classList.remove('zb-open')}
 // redraw for a change made elsewhere (co-op: the purse, the defences, who is ready), keeping focus and the tab's scroll
 function refresh(){if(el.hidden)return;deal();const a=document.activeElement,mine=a&&el.contains(a),k=mine?['buy','slot','up','fit','mv','perk','sell','rep','rb','ex','kc','so','tab'].find(x=>a.dataset[x]!=null):null,
   q=k?`[data-${k}="${a.dataset[k]}"]`:mine&&a.id?'#'+a.id:null,sc=el.querySelector('.ztab')?.scrollTop||0;
  render();const t=el.querySelector('.ztab');if(t)t.scrollTop=sc;if(q)el.querySelector(q)?.focus()}
 // spatial focus move between the visible buttons
 function move(dx,dy){const bs=[...el.querySelectorAll('button:not([disabled])')];if(!bs.length)return;const a=document.activeElement,ra=bs.includes(a)?a.getBoundingClientRect():null;
  if(!ra){bs[0].focus();return}const cx=ra.x+ra.width/2,cy=ra.y+ra.height/2;let best=null,bd=1e9;
  for(const b of bs){if(b===a)continue;const r=b.getBoundingClientRect(),x=r.x+r.width/2-cx,y=r.y+r.height/2-cy,along=x*dx+y*dy;if(along<=4)continue;const d=along+Math.abs(x*dy+y*dx)*2;if(d<bd){bd=d;best=b}}
  best?.focus();drawMap()}
 const setTab=k=>{if(G.placing)return;tab=k;render();focus(`[data-tab="${k}"]`)},TABS=()=>tabList().map(t=>t[0]);  // Kill chain (zchain.js) and Sortie (zsortie.js) come with their files, set up after this one
 function key(e){if(el.hidden)return false;const c=e.code;
  if(c==='ArrowUp')move(0,-1);else if(c==='ArrowDown')move(0,1);else if(c==='ArrowLeft')move(-1,0);else if(c==='ArrowRight')move(1,0);
  else if(c==='Space'&&el.contains(document.activeElement))document.activeElement.click();
  else if(/^Digit[1-9]$/.test(c)&&TABS()[+c.slice(5)-1])setTab(TABS()[+c.slice(5)-1]);
  else if(c==='KeyC'&&!G.placing)Z.continue();else if(c==='Escape')return cancelPlace();
  else return true;e.preventDefault?.();return true}
 function pad(e){if(el.hidden&&over.hidden)return false;const host=el.hidden?over:el;
  if(e(12))move(0,-1);if(e(13))move(0,1);if(e(14))move(-1,0);if(e(15))move(1,0);if(e(0)&&host.contains(document.activeElement))document.activeElement.click();
  if(!el.hidden){if(e(1))cancelPlace();if(e(4)||e(5)){const T=TABS(),i=T.indexOf(tab);setTab(T[(i+(e(5)?1:T.length-1))%T.length])}if(e(3)&&!G.placing)Z.continue()}return true}
 return{open,close,render,refresh,act,key,pad,el,buy,place,upgrade,refit,startMove,expand,rebuild,setTab,sell,offered,supPrice}}
