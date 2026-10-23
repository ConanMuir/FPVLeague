// Zombies selling and undo. Everything you own on the base screen can be sold, and a sale is taken back with an Undo on its card until the wave starts.
// What it pays: all of what you spent on it THIS base screen (bought, upgraded or refitted since the last wave: it was never used), and the
// doctrine's sell share (zmeta sellK: 50%, a quarter for the Quartermaster) of everything spent on it before. A position you paid to open (Base
// tab) can be closed again on the same terms; the standard positions, the sites and anything the doctrine or a reserve opened are never for
// sale, so a sale can never take the base below what it started with. Sellable: defences and domes (zdef.js), opened positions, the kill chain's
// boost batteries and point defence (zchain.js). Selling a Golden Dome also pays back the space interceptors the remaining domes can't hold.
// Co-op: the host owns the ledger (G.sold) and every sale and undo is a request to it (znet.js 'U' and 'q', and the existing 's' and 'K'); its
// snapshot carries the ledger and the price paid for each opened position (netOut / netIn) so a client's cards show the same figures.
import {ITEMS,STOCK} from './zdata.js';
import {money} from '../../engine/hot.js';
export function initSell(api,G,Z){
 const {SITES}=api,def=Z.def,safe=s=>String(s??'').replace(/[<>&"'`]/g,'').slice(0,40);
 const K=()=>Z.meta?.k('sellK',.5)??.5,pct=()=>Math.round(K()*100);
 /* spent: all the money in it; s0: how much of that was there when this base screen opened (older = sold at the doctrine's share) */
 const part=(spent,s0)=>{const sp=Math.max(0,spent|0),old=Math.min(sp,Math.max(0,s0|0)),fresh=sp-old;return{sp,old,fresh,r:Math.floor(old*K())+fresh}};
 const val=(spent,s0)=>part(spent,s0).r;
 const why=(spent,s0)=>{const p=part(spent,s0);
  return !p.sp?'Nothing was spent on it.':!p.old?`Full refund: bought this base screen (${money(p.sp)}).`:!p.fresh?`${pct()}% of the ${money(p.sp)} spent on it.`
   :`All ${money(p.fresh)} spent this screen + ${pct()}% of the earlier ${money(p.old)}.`};
 /* a defence that never went through the shop (no spent figure) counts as older */
 const dpart=d=>part(d.spent||ITEMS[d.type].price,d.s0??(d.spent?0:ITEMS[d.type].price));
 const dval=d=>dpart(d).r,dwhy=d=>why(d.spent||ITEMS[d.type].price,d.s0??(d.spent?0:ITEMS[d.type].price));
 let seq=0;
 const reset=()=>{G.sold=[];G.xp={}};
 reset();
 const add=rec=>{rec.id=++seq;(G.sold||(G.sold=[])).push(rec);return rec};
 const say=h=>Z.team?Z.team(h):api.feed(h);
 const list=k=>(G.sold||[]).filter(r=>r.k===k);
 const glyph=r=>r.k==='d'?ITEMS[r.b]?.glyph||'▲':r.k==='x'?'⊞':r.k==='b'?'⇡':'⌖';

 // ---------- defences and domes ----------
 function sellDef(d){const p=dpart(d);let r=p.r,stk=0;
  if(d.type==='gdome'&&G.kc){const left=def.D.filter(q=>q!==d&&q.type==='gdome').length,over=Math.max(0,G.kc.stock-STOCK.cap*left);if(over){stk=over;r+=over*STOCK.per;G.kc.stock-=over}}
  const st={};for(const[k,v]of Object.entries(d))if(typeof v==='number'||typeof v==='string'||typeof v==='boolean')st[k]=v;
  add({k:'d',name:ITEMS[d.type].n,a:d.slot,b:d.type,at:def.D.indexOf(d),r,st,stk});
  G.cash+=r;def.remove(d);return r}

 // ---------- positions you paid to open (G.xp[j] = {c: price, w: the base screen it was bought on}) ----------
 const xfresh=x=>x.f!=null?!!x.f:x.w===G.wave;
 const xval=j=>{const x=G.xp?.[j];return x?xfresh(x)?x.c|0:Math.floor((x.c|0)*K()):0};
 const xwhy=j=>{const x=G.xp?.[j];return!x?'':xfresh(x)?`Full refund: opened this base screen (${money(x.c)}).`:`${pct()}% of the ${money(x.c)} it cost to open.`};
 const xcan=j=>{const x=G.xp?.[j],d=def.D.find(q=>q.slot===j);return!x||!def.slotOpen(j)?'Not for sale.':d?`Sell or move the ${ITEMS[d.type].n.toLowerCase()} there first.`:''};
 const owned=()=>Object.keys(G.xp||{}).map(Number).filter(j=>def.SLOTS[j]&&def.slotOpen(j));
 function closeX(j){j=j|0;if(xcan(j))return null;const x=G.xp[j],r=xval(j);
  G.cash+=r;G.open[j]=false;G.exp=Math.max(0,(G.exp|0)-1);delete G.xp[j];add({k:'x',name:def.SLOTS[j].n,a:j,b:'',at:0,r,x});return r}

 // ---------- the kill chain's boost batteries and point defence (zchain.js sells them with its own buttons) ----------
 /* the sale is already decided there: pay the figure this returns, then clear the slot */
 function logChain(k,a,name,rec){const r=val(rec.spent,rec.s0);add({k,name,a,b:'',at:0,r,rec:{...rec}});return r}

 // ---------- undo ----------
 /* '' when the sale can be taken back, else why not */
 function can(r){if(G.state!=='base')return'The wave has started.';if(G.cash<r.r)return`Needs ${money(r.r)} in the purse.`;
  if(r.k==='d')return def.slotFree(r.a,r.b)?'':'Its position was taken.';
  if(r.k==='x')return!def.slotOpen(r.a)&&def.canOpen(r.a,Z.meta.doc())?'':'That position can\'t be reopened.';
  if(r.k==='b')return G.kc?.boost[r.a]?'That edge has a new battery.':'';
  const s=SITES[r.a];return!s||s.hp<=0||G.kc?.pd[s.n]?'That site has point defence again, or is gone.':''}
 function undo(id){const i=(G.sold||[]).findIndex(r=>r.id===(id|0)),r=G.sold[i];if(!r||can(r))return null;G.cash-=r.r;
  if(r.k==='d'){const d=def.add(r.b,r.a);Object.assign(d,r.st);def.D.splice(def.D.indexOf(d),1);def.D.splice(Math.min(r.at,def.D.length),0,d);if(r.stk)G.kc.stock+=r.stk}
  else if(r.k==='x'){G.open[r.a]=true;G.exp=(G.exp|0)+1;G.xp[r.a]=r.x}
  else if(r.k==='b')G.kc.boost[r.a]=r.rec;
  else G.kc.pd[SITES[r.a].n]=r.rec;
  G.sold.splice(i,1);return{msg:`took back the ${r.name.toLowerCase()}`,c:r.r}}
 /* the Undo button on the card of what was sold (chain tab: the empty edge or site) */
 const undoBtn=(k,a)=>{const r=list(k).find(q=>q.a===a);if(!r)return'';const w=can(r);return`<button class="sm" data-undo="${r.id}" ${w?`disabled title="${w}"`:''}>Undo sale −${money(r.r)}</button>`};

 // ---------- co-op: the ledger and the opened positions ride in the host's snapshot ----------
 const netOut=()=>({d:(G.sold||[]).map(r=>[r.id,r.k,r.name,r.r,r.a,r.b,r.at|0]),x:Object.fromEntries(Object.entries(G.xp||{}).map(([j,x])=>[j,[x.c|0,xfresh(x)?1:0]]))});
 function netIn(o){if(!o||typeof o!=='object')return;G.sold=[];G.xp={};
  if(Array.isArray(o.d))for(const a of o.d.slice(0,40)){if(!Array.isArray(a)||typeof a[1]!=='string'||a[1].length!==1||!'dxbp'.includes(a[1]))continue;
   G.sold.push({id:a[0]|0,k:a[1],name:safe(a[2]),r:Math.max(0,a[3]|0),a:a[4]|0,b:ITEMS[a[5]]?a[5]:'',at:Math.max(0,a[6]|0)})}
  if(o.x&&typeof o.x==='object')for(const[j,a]of Object.entries(o.x)){if(def.SLOTS[+j]&&Array.isArray(a)&&Number.isFinite(+a[0]))G.xp[+j]={c:Math.max(0,+a[0]),f:a[1]?1:0}}}

 // ---------- the ledger lives for one break: it starts empty at the first base.open of a wave and goes when the wave starts ----------
 /* a sortie closes the base screen and opens it again, still the same break: what was bought and sold before it keeps its full refund and its Undo (G.sbk = the wave the break is for) */
 const bo=Z.base.open;Z.base.open=()=>{if(G.sbk!==G.wave){G.sbk=G.wave;G.sold=[];
  for(const d of def.D)d.s0=d.spent||ITEMS[d.type].price;
  for(const b of G.kc?.boost||[])if(b)b.s0=b.spent;for(const P of Object.values(G.kc?.pd||{}))P.s0=P.spent}
  bo()};
 const bc=Z.base.close;Z.base.close=()=>{if(!Z.so?.S.on){G.sold=[];G.sbk=-1}bc()};
 /* what the positions cost (G.xp) lasts the run; a new run starts with none */
 const s0=Z.start;Z.start=()=>{G.xp={};G.sbk=-1;s0()};
 const s1=Z.stop;Z.stop=()=>{s1();reset();G.sbk=-1};
 Z.sell={part,val,why,dval,dwhy,dpart,sellDef,xval,xwhy,xcan,owned,closeX,logChain,can,undo,undoBtn,list,glyph,say,netOut,netIn,pct};
 return Z.sell}
