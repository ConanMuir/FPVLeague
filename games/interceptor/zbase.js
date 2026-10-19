// Zombies base screen, shown between waves with no timer. An overview map of the defended area (sites, slots, your defences, where the
// next wave comes from), a Shop listing every helper and perk, the Armory (upgrade anything you own), Sites (repairs), and Continue.
// Keyboard: arrows move focus, Enter / Space activate, 1-3 tabs, C continue (Esc opens the menu; Cancel backs out of a placement). Gamepad: D-pad, A, B cancel, LB/RB tabs, Y continue.
import {KIND,ITEMS,RESIST,REPAIR_PER_HP,PERK,RACK_TIERS,RACK_CAP,RACK_CAP_COST,RACK_RANGE,ORDER,HELP} from './zdata.js';
const $=id=>document.getElementById(id);
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
const MAPX=[-3200,3200],MAPZ=[-1900,2900],MW=640,MH=Math.round(MW*(MAPZ[1]-MAPZ[0])/(MAPX[1]-MAPX[0]));
export function initBase(Z,api,G){
 const {SITES,PADP,FOBS}=api;
 const el=document.createElement('div');el.id='zbase';el.hidden=true;$('menu').before(el);
 const over=document.createElement('div');over.id='zover';over.hidden=true;$('menu').before(over);
 let tab='shop',focusSlot=-1,mapImg=null;
 const repairK=()=>Z.repairK?.()??1,repairCost=s=>Math.ceil((s.max-s.hp)*REPAIR_PER_HP*repairK());
 const mx=x=>(x-MAPX[0])/(MAPX[1]-MAPX[0])*MW,mz=z=>(z-MAPZ[0])/(MAPZ[1]-MAPZ[0])*MH;

 // ---------- shop: the whole catalogue, grouped (helpers, active perks, passive perks); no random cards, no reroll ----------
 // Helpers can be bought again and again (one per free slot); perks until they reach their top level. Items not unlocked yet show the wave they arrive.
 const GROUPS=[['Helpers',k=>ITEMS[k].type==='helper'],['Active perks',k=>ITEMS[k].type==='perk'&&!!PERK[k].key],['Passive perks',k=>ITEMS[k].type==='perk'&&!PERK[k].key]];
 function deal(){G.cards=[];for(const[g,f]of GROUPS)for(const k of Object.keys(ITEMS))if(f(k))G.cards.push({k,g})}
 const price=k=>ITEMS[k].type==='perk'?Z.perkPrice(k):ITEMS[k].price;
 const locked=k=>G.wave+1<ITEMS[k].from,maxed=k=>ITEMS[k].type==='perk'&&Z.perkMaxed(k);
 function buy(i){const c=G.cards[i];if(!c||locked(c.k)||maxed(c.k))return;const it=ITEMS[c.k],p=price(c.k);if(G.cash<p)return;
  if(it.type==='helper'){if(!Z.def.SLOTS.some((_,j)=>Z.def.slotFree(j)))return;G.placing={i,k:c.k,p};focusSlot=Z.def.SLOTS.findIndex((_,j)=>Z.def.slotFree(j));render();focus('[data-slot]');return}
  G.cash-=p;Z.buyPerk(c.k);render();focus(`[data-buy="${i}"]`)}
 function place(j){const P=G.placing;if(!P||!Z.def.slotFree(j))return;G.cash-=P.p;Z.def.add(P.k,j).spent=P.p;G.placing=null;tab='armory';render();focus('[data-up]')}
 function cancelPlace(){if(!G.placing)return false;G.placing=null;render();focus('[data-buy]');return true}

 // how a defence does against the kinds you have met or are about to meet
 const vsChips=k=>{const R=RESIST[k];if(!R)return'';return ORDER.concat('boss').filter(e=>KIND[e].from<=G.wave+1).map(e=>{const v=R[e]??0;return`<span class="v${v>=.8?'g':v>0?'m':'n'}" title="${KIND[e].n}">${KIND[e].tag}</span>`}).join('')};
 // one compact row per item: glyph, name and level, one-line description (and what a helper is good against), price button
 function rowHTML(c,i){const it=ITEMS[c.k],L=locked(c.k),M=maxed(c.k),p=price(c.k),lvl=it.type==='perk'?Z.perkLevel(c.k):0,own=it.type==='helper'?Z.def.D.filter(d=>d.type===c.k).length:0;
  const tag=it.type==='perk'?(lvl?`LV ${lvl}${M?' · MAX':''}`:''):(own?`×${own} OWNED`:'');
  return`<div class="zitem ${L?'lock':''}"><span class="zg">${it.glyph}</span><div class="zid"><b>${it.n}</b>${tag?`<em>${tag}</em>`:''}
   <p>${L?`Arrives with wave ${it.from}.`:it.type==='perk'?(M?'Fully upgraded.':Z.perkBlurb(c.k)):it.blurb}</p>${it.type==='helper'&&!L?`<div class="zvs">${vsChips(c.k)}</div>`:''}</div>
   <button class="sm" data-buy="${i}" ${L||M||G.cash<p?'disabled':''}>${L?`Wave ${it.from}`:M?'Max':`${it.type==='perk'&&lvl?'Upgrade':'Buy'} ${money(p)}`}</button></div>`}
 function shopHTML(){let h='',g='';G.cards.forEach((c,i)=>{if(c.g!==g){h+=`${g?'</div>':''}<h3>${c.g}</h3><div class="zitems">`;g=c.g}h+=rowHTML(c,i)});return h+'</div>'}
 function defRow(d){const s=Z.def.SLOTS[d.slot],it=ITEMS[d.type];let ups='';
  if(d.type==='rack'){const T=RACK_TIERS[d.tier],N=RACK_TIERS[d.tier+1],ci=RACK_CAP.indexOf(d.cap),nc=RACK_CAP[ci+1];
   ups=`<span class="zst">${T.n} · ${Math.round(T.hit*100)}% kill per hit · ${d.cap} drones · ${d.kills} kills</span>
    ${N?`<span class="zst zn">Next: ${N.n}, ${Math.round(N.hit*100)}% per hit, ${N.note}</span>`:''}
    <button class="sm" data-up="${d.id}:tier" ${N&&G.cash>=N.cost?'':'disabled'}>${N?`${N.n} ${money(N.cost)}`:'Mk V: max'}</button>
    <button class="sm" data-up="${d.id}:cap" ${nc&&G.cash>=RACK_CAP_COST[ci+1]?'':'disabled'}>${nc?`+1 drone ${money(RACK_CAP_COST[ci+1])}`:'4 drones: max'}</button>`}
  else{const H=HELP[d.type],l=H.lv[d.lvl],n=H.lv[d.lvl+1];
   ups=`<span class="zst">level ${d.lvl+1}${l.mag?` · ${l.mag} shots per wave`:''}${d.type==='ew'?` · ${((l.rng||H.rng)/1000).toFixed(1)} km bubble · ${d.kills} spoofed`:` · ${d.kills} kills`}</span>
    ${n?`<span class="zst zn">Next: level ${d.lvl+2}, ${n.txt}</span>`:''}
    <button class="sm" data-up="${d.id}:lvl" ${n&&G.cash>=n.cost?'':'disabled'}>${n?`Level ${d.lvl+2} ${money(n.cost)}`:'Max level'}</button>`}
  const refund=Math.floor((d.spent||it.price)/2),armed=sellArm===d.id;
  return`<div class="zarm"><span class="zg">${it.glyph}</span><div><b>${it.n}</b><small>${s.n}</small></div><div class="zups">${ups}<button class="sm zsell ${armed?'arm':''}" data-sell="${d.id}">${armed?`Confirm: sell for ${money(refund)}`:`Sell ${money(refund)}`}</button></div></div>`}
 // selling frees the slot and refunds half of everything spent on it; it takes a second press to confirm
 let sellArm=0;
 function sell(id){const d=Z.def.D.find(x=>x.id===id);if(!d)return;if(sellArm!==id){sellArm=id;render();focus(`[data-sell="${id}"]`);return}
  sellArm=0;G.cash+=Math.floor((d.spent||ITEMS[d.type].price)/2);Z.def.remove(d);render();focus('[data-up]')}
 function upgrade(id,what){const d=Z.def.D.find(x=>x.id===id);if(!d)return;const c0=G.cash;
  if(d.type==='rack'){if(what==='tier'){const N=RACK_TIERS[d.tier+1];if(N&&G.cash>=N.cost){G.cash-=N.cost;d.tier++}}
   else{const ci=RACK_CAP.indexOf(d.cap),c=RACK_CAP_COST[ci+1];if(c&&G.cash>=c){G.cash-=c;d.cap=RACK_CAP[ci+1];d.ready=d.cap}}}
  else{const n=HELP[d.type].lv[d.lvl+1];if(n&&G.cash>=n.cost){G.cash-=n.cost;d.lvl++}}d.spent=(d.spent||ITEMS[d.type].price)+c0-G.cash;render();focus(`[data-up="${id}:${what}"]`)}
 function upPerk(k){const c=Z.perkPrice(k);if(Z.perkMaxed(k)||G.cash<c)return;G.cash-=c;Z.buyPerk(k);render();focus(`[data-perk="${k}"]`)}

 // ---------- render ----------
 function render(){const integ=SITES.reduce((a,s)=>(a.hp+=Math.max(0,s.hp),a.max+=s.max,a),{hp:0,max:0}),f=integ.hp/integ.max,P=G.placing;
  let body='';
  if(P)body=`<h3>Choose a position for the ${ITEMS[P.k].n.toLowerCase()}</h3><p class="zhint">Pick a slot here or click a free circle on the map. It deploys when the wave starts.</p>
   <div class="zslots">${Z.def.SLOTS.map((s,j)=>Z.def.slotFree(j)?`<button class="sm" data-slot="${j}">${s.n}</button>`:'').join('')}</div><div class="mp"><button class="sm" id="zcancel">Cancel</button></div>`;
  else if(tab==='shop')body=shopHTML();
  else if(tab==='armory'){const perks=Z.perkRows?.(money)||'';body=`${Z.def.D.length?Z.def.D.map(defRow).join(''):'<p class="zhint">No defences yet. Buy helpers from the shop cards.</p>'}${perks?`<h3 style="margin-top:14px">Perks</h3>${perks}`:''}`}
  else body=`<div class="zsites">${SITES.map((s,i)=>{const c=repairCost(s),part=Math.min(s.max-s.hp,Math.floor(G.cash/(REPAIR_PER_HP*repairK())));
   return`<div class="zrow"><span>${s.n}</span><span class="zhp"><b><i style="width:${Math.max(0,s.hp)/s.max*100}%" class="${s.hp<s.max*.35?'lo':s.hp<s.max*.7?'mid':''}"></i></b>${Math.max(0,Math.ceil(s.hp))}/${s.max}</span>
   <button class="sm" data-rep="${i}" ${s.hp>0&&c&&part>0?'':'disabled'}>${s.hp<=0?'Destroyed':!c?'Intact':part<s.max-s.hp?`Repair ${part} hp ${money(Math.ceil(part*REPAIR_PER_HP*repairK()))}`:`Repair ${money(c)}`}</button></div>`}).join('')}</div>
   <p class="zhint">Repairs cost $${(REPAIR_PER_HP*repairK()).toFixed(2)} per hit point${repairK()<1?' (Foreign Aid discount)':''}. A destroyed site can't be rebuilt.</p>`;
  const fc=forecast();
  el.innerHTML=`<div class="zpanel zb"><header><div><h2>${G.wave?`Wave ${G.wave} cleared`:'Briefing'}</h2><div class="zbig">${money(G.cash)}</div></div>
   <div class="zint"><span>Defense integrity ${Math.round(f*100)}% · ${Math.ceil(integ.hp)}/${integ.max}</span><b><i style="width:${(f*100).toFixed(1)}%" class="${f<.3?'lo':f<.6?'mid':''}"></i></b></div>
   <button class="go" id="zgo">Start wave ${G.wave+1} ▸</button></header>
   <div class="zcols"><div class="zmapw"><canvas id="zmap" width="${MW*2}" height="${MH*2}"></canvas>
    <div class="zleg"><span><i class="ls"></i>site</span><span><i class="le"></i>free slot</span><span><i class="ld"></i>your defence</span><span><i class="lf"></i>forward position</span><span><i class="lt"></i>next wave's approach</span></div></div>
   <div class="zside"><nav class="ztabs">${[['shop','Shop'],['armory','Armory'],['sites','Sites']].map(([k,n],i)=>`<button class="sm ${tab===k&&!P?'on':''}" data-tab="${k}"><kbd>${i+1}</kbd> ${n}</button>`).join('')}</nav><div class="ztab">${body}</div></div></div>
   <footer class="zfc"><h3>Wave ${G.wave+1}${fc.boss?' · <span class="cr">BOSS</span>':''}</h3>${fc.html}</footer></div>`;
  $('zgo').onclick=()=>{if(!G.placing)Z.continue()};$('zcancel')&&($('zcancel').onclick=cancelPlace);
  for(const b of el.querySelectorAll('[data-tab]'))b.onclick=()=>{if(G.placing)return;tab=b.dataset.tab;render();focus(`[data-tab="${tab}"]`)};
  for(const b of el.querySelectorAll('[data-buy]'))b.onclick=()=>buy(+b.dataset.buy);
  for(const b of el.querySelectorAll('[data-slot]')){b.onclick=()=>place(+b.dataset.slot);b.onfocus=()=>{focusSlot=+b.dataset.slot;drawMap()}}
  for(const b of el.querySelectorAll('[data-up]'))b.onclick=()=>{const[id,w]=b.dataset.up.split(':');upgrade(+id,w)};
  for(const b of el.querySelectorAll('[data-perk]'))b.onclick=()=>upPerk(b.dataset.perk);
  for(const b of el.querySelectorAll('[data-sell]'))b.onclick=()=>sell(+b.dataset.sell);
  for(const b of el.querySelectorAll('[data-rep]'))b.onclick=()=>{const s=SITES[+b.dataset.rep],k=repairK(),hp=Math.min(s.max-s.hp,Math.floor(G.cash/(REPAIR_PER_HP*k)));if(hp<=0)return;G.cash-=Math.ceil(hp*REPAIR_PER_HP*k);s.hp+=hp;render();focus(`[data-rep="${b.dataset.rep}"]`)};
  const cv=$('zmap');cv.onclick=e=>{if(!G.placing)return;const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*MW,y=(e.clientY-r.top)/r.height*MH;let bj=-1,bd=24;
   Z.def.SLOTS.forEach((s,j)=>{const[sx,sy]=spx(j),d=Math.hypot(sx-x,sy-y);if(Z.def.slotFree(j)&&d<bd){bd=d;bj=j}});if(bj>=0)place(bj)};
  drawMap()}
 // next wave preview: counts per kind, new kinds flagged, approach bearings drawn on the map
 function forecast(){const n={};for(const q of G.next.list){const[k,c]=q.split(':');n[k]=(n[k]||0)+(+c||1)}
  const html=Object.entries(n).map(([k,c])=>{const K=KIND[k],isNew=K.from===G.wave+1||(k==='swarm'&&G.wave+1===K.from);return`<span class="zfk ${isNew?'new':''}">${c}× ${K.n}${isNew?' <b>NEW</b>':''}</span>`}).join('');
  const nw=Object.keys(n).filter(k=>KIND[k].from===G.wave+1).map(k=>`<p class="zhint"><b>${KIND[k].n}</b>: ${Z.kindNote?.(k)||''}</p>`).join('');
  return{html:`<div class="zfks">${html}</div>${nw}`,boss:!!n.boss}}

 // ---------- overview map ----------
 function bg(){if(mapImg)return mapImg;const src=api.groundTex.image,TW=9000,KP=src.width/TW,c=document.createElement('canvas');c.width=MW*2;c.height=MH*2;const g=c.getContext('2d');
  g.drawImage(src,(MAPX[0]+TW/2)*KP,(MAPZ[0]+TW/2)*KP,(MAPX[1]-MAPX[0])*KP,(MAPZ[1]-MAPZ[0])*KP,0,0,c.width,c.height);g.fillStyle='rgba(6,10,18,.45)';g.fillRect(0,0,c.width,c.height);return mapImg=c}
 function drawMap(){const cv=$("zmap");if(!cv||!G.next||el.hidden)return;const g=cv.getContext('2d');g.setTransform(2,0,0,2,0,0);g.drawImage(bg(),0,0,MW,MH);
  g.strokeStyle='rgba(120,200,255,.35)';g.setLineDash([6,6]);g.strokeRect(mx(-api.AW),mz(-api.AW),mx(api.AW)-mx(-api.AW),mz(api.AW)-mz(-api.AW));g.setLineDash([]);
  // approach arrows
  for(const b of G.next.brgs){const R=3800,x=Math.sin(b)*R,z=1950-Math.cos(b)*R,X=Math.min(MW-14,Math.max(14,mx(x))),Y=Math.min(MH-14,Math.max(14,mz(z))),a=Math.atan2(mz(1950)-Y,mx(0)-X);
   g.save();g.translate(X,Y);g.rotate(a);g.fillStyle='rgba(255,77,77,.9)';g.beginPath();g.moveTo(16,0);g.lineTo(-8,-10);g.lineTo(-3,0);g.lineTo(-8,10);g.closePath();g.fill();g.restore()}
  g.font='700 11px "JetBrains Mono",monospace';g.textAlign='center';
  for(const s of SITES){const hp=Math.max(0,s.hp)/s.max;g.fillStyle=s.hp>0?'#7fd0ff':'#555b66';g.fillRect(mx(s.x)-7,mz(s.z)-7,14,14);
   g.strokeStyle=hp>.7?'#3ddc84':hp>.35?'#ffc640':'#ff4d4d';g.lineWidth=3;g.beginPath();g.arc(mx(s.x),mz(s.z),13,-Math.PI/2,-Math.PI/2+hp*Math.PI*2);g.stroke();
   g.fillStyle='#dfe8ff';g.fillText(s.n,mx(s.x),mz(s.z)+28)}
  g.strokeStyle='#ffc640';g.lineWidth=2;g.strokeRect(mx(PADP.x)-5,mz(PADP.z)-5,10,10);
  for(const f of FOBS){g.strokeStyle='#3ddc84';g.beginPath();g.moveTo(mx(f.x),mz(f.z)-7);g.lineTo(mx(f.x)+7,mz(f.z)+5);g.lineTo(mx(f.x)-7,mz(f.z)+5);g.closePath();g.stroke()}
  const foc=document.activeElement?.dataset?.up?Z.def.D.find(d=>d.id===+document.activeElement.dataset.up.split(':')[0]):null;
  Z.def.SLOTS.forEach((s,j)=>{const d=Z.def.D.find(q=>q.slot===j),[X,Y]=spx(j);
   if(d){if(d===foc){const r=Math.min(Z.def.rangeOf(d),20000)/(MAPX[1]-MAPX[0])*MW;g.strokeStyle='rgba(95,227,255,.5)';g.lineWidth=1.5;g.beginPath();g.arc(X,Y,r,0,7);g.stroke()}
    g.fillStyle='#5fe3ff';g.beginPath();g.arc(X,Y,8,0,7);g.fill();g.fillStyle='#04121a';g.font='700 10px "JetBrains Mono",monospace';g.fillText(ITEMS[d.type].glyph,X,Y+3.5)}
   else{const hot=G.placing&&j===focusSlot;g.strokeStyle=hot?'#ffe23c':G.placing?'rgba(255,226,60,.75)':'rgba(220,230,255,.4)';g.lineWidth=hot?3:1.5;g.setLineDash(hot?[]:[3,3]);g.beginPath();g.arc(X,Y,hot?9:7,0,7);g.stroke();g.setLineDash([])}});
  if(G.placing&&focusSlot>=0){const s=Z.def.SLOTS[focusSlot],r=Math.min(HELP[G.placing.k]?.rng||RACK_RANGE,20000)/(MAPX[1]-MAPX[0])*MW;g.strokeStyle='rgba(255,226,60,.45)';g.beginPath();g.arc(mx(s.x),mz(s.z),r,0,7);g.stroke()}}

 // slots are drawn schematically around their site / pad / forward position (true scale would stack them on top of each other)
 function spx(j){const s=Z.def.SLOTS[j];if(s.site){const dx=s.x-s.site.x,dz=s.z-s.site.z,l=Math.hypot(dx,dz)||1;return[mx(s.site.x)+dx/l*24,mz(s.site.z)+dz/l*24]}
  if(/^Radar/.test(s.n))return[mx(PADP.x)+(s.x<PADP.x?-18:18),mz(PADP.z)-6];return[mx(s.x)-14,mz(s.z)+12]}
 const focus=q=>setTimeout(()=>{const b=el.querySelector(q+':not([disabled])');(b||$('zgo'))?.focus();drawMap()},0);
 function open(){document.body.classList.add('zb-open');G.state="base";G.placing=null;tab='shop';deal();el.hidden=false;render();focus('[data-buy]')}
 function close(){el.hidden=true;G.placing=null;document.body.classList.remove('zb-open')}
 // spatial focus move between the visible buttons
 function move(dx,dy){const bs=[...el.querySelectorAll('button:not([disabled])')];if(!bs.length)return;const a=document.activeElement,ra=bs.includes(a)?a.getBoundingClientRect():null;
  if(!ra){bs[0].focus();return}const cx=ra.x+ra.width/2,cy=ra.y+ra.height/2;let best=null,bd=1e9;
  for(const b of bs){if(b===a)continue;const r=b.getBoundingClientRect(),x=r.x+r.width/2-cx,y=r.y+r.height/2-cy,along=x*dx+y*dy;if(along<=4)continue;const d=along+Math.abs(x*dy+y*dx)*2;if(d<bd){bd=d;best=b}}
  best?.focus();drawMap()}
 const setTab=k=>{if(G.placing)return;tab=k;render();focus(`[data-tab="${k}"]`)},TABS=['shop','armory','sites'];
 function key(e){if(el.hidden)return false;const c=e.code;
  if(c==='ArrowUp')move(0,-1);else if(c==='ArrowDown')move(0,1);else if(c==='ArrowLeft')move(-1,0);else if(c==='ArrowRight')move(1,0);
  else if(c==='Space'&&el.contains(document.activeElement))document.activeElement.click();
  else if(c==='Digit1'||c==='Digit2'||c==='Digit3')setTab(TABS[+c.slice(5)-1]);
  else if(c==='KeyC'&&!G.placing)Z.continue();else if(c==='Escape')return cancelPlace();
  else return true;e.preventDefault?.();return true}
 function pad(e){if(el.hidden&&over.hidden)return false;const host=el.hidden?over:el;
  if(e(12))move(0,-1);if(e(13))move(0,1);if(e(14))move(-1,0);if(e(15))move(1,0);if(e(0)&&host.contains(document.activeElement))document.activeElement.click();
  if(!el.hidden){if(e(1))cancelPlace();if(e(4)||e(5)){const i=TABS.indexOf(tab);setTab(TABS[(i+(e(5)?1:2))%3])}if(e(3)&&!G.placing)Z.continue()}return true}
 return{open,close,render,key,pad,el,buy,place,upgrade,setTab,sell}}
