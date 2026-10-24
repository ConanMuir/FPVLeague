// Craft types, the Zombies side (the table is ztypes.js): the picker (a card per type on the start card and at the top of the base screen's Shop),
// the saved choice, the craft's own HUD panel (airspeed against its minimum speed for a fixed-wing), and the radio line that names it at launch.
// The choice is S.zty = {v, id} (versioned; an old save, a hand-edited value or an unknown id reads as the Dart). Picking it only saves it: the
// interceptor changes type when it is launched (interceptor.js launch(): the next wave, a relaunch, a new run). A bot run can fly another type than
// your pick (Z.craft.bot(id); the benchmark flies the Dart so zbench.json stays comparable). Co-op: each pilot's type rides in the presence
// packet (znet.js), so the others see the right model. Z.craft.cur() is the type being flown, Z.craft.pick() your own choice.
import {TYPES,ORDER,typeOf,cleanSave,cleanId} from './ztypes.js';
const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
export function initTypes(api,G,Z){
 const {S,save}=api,$=id=>document.getElementById(id);
 {const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./ztypes.css',import.meta.url).href;document.head.append(l)}
 S.zty=cleanSave(S.zty);
 let forced='';
 const C=Z.craft={types:TYPES,order:ORDER,
  cur:()=>forced||S.zty.id,pick:()=>S.zty.id,T:()=>typeOf(C.cur()),of:d=>typeOf(d?.ty),call:()=>C.T().call,
  set(id){S.zty=cleanSave({id});save();render()},
  bot(id){forced=id?cleanId(id):'';render()},
  guide:(step,pad)=>{const g=C.T().guide?.[step];return g?(pad?g.pad:g.kb):null},
  say:step=>C.T().guide?.[step]?.say||null};
 const card=(id,on)=>{const T=TYPES[id];return`<button class="zcr${on?' on':''}" data-zty="${id}" aria-pressed="${on}" title="${esc(T.blurb)}"><b>${esc(T.name)}</b><span>${esc(T.blurb)}</span><ul>${T.facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></button>`};
 const cards=()=>`<div class="zcrs">${ORDER.map(id=>card(id,id===S.zty.id)).join('')}</div>`;

 // ---------- the start card: a card per type, under the difficulty ----------
 const box=document.createElement('div');box.id='zcraft';box.className='zcraft';box.setAttribute('role','group');box.setAttribute('aria-label','Craft');
 ($('zdiff')||$('gmdesc')).after(box);
 const bind=el=>{for(const b of el.querySelectorAll('[data-zty]'))b.onclick=()=>{C.set(b.dataset.zty);if(el!==box)Z.base?.refresh?.()}};
 function render(){S.zty=cleanSave(S.zty);box.innerHTML=`<h4>Craft <small>${forced&&forced!==S.zty.id?`a bot is flying the ${esc(typeOf(forced).name)}`:'you fly it from the next launch'}</small></h4>${cards()}`;bind(box)}

 // ---------- the base screen: the same cards at the top of the Shop ----------
 const st0=Z.shopTop;Z.shopTop=()=>(G.on?`<div class="zcrh" role="heading" aria-level="3">Craft <small>the next wave launches you in it${Z.online?' · each pilot picks their own':''}</small></div>${cards()}`:'')+(st0?.()||'');
 const bb0=Z.baseBind;Z.baseBind=el=>{bb0?.(el);bind(el)};

 // ---------- the craft's HUD panel: its readouts, an airspeed bar with the minimum speed in red, a status line ----------
 const hudEl=document.createElement('div');hudEl.id='zty';hudEl.className='osd';hudEl.hidden=true;
 hudEl.innerHTML='<div class="ztr"></div><div class="zttape"><i class="ztlow"></i><i class="ztmark"></i></div><div class="ztst"></div>';$('hud').append(hudEl);
 const rd=hudEl.querySelector('.ztr'),low=hudEl.querySelector('.ztlow'),mark=hudEl.querySelector('.ztmark'),st=hudEl.querySelector('.ztst'),tape=hudEl.querySelector('.zttape');
 let sig='',cur='';
 function panel(){const me=api.player,T=me&&me.cx&&G.on&&!api.demo&&me.dead<=0&&G.state!=='base'&&G.state!=='over'?typeOf(me.ty):null;
  if(!T||!T.hud.length){if(!hudEl.hidden){hudEl.hidden=true;cur=''}return}
  const i=me.cx.info();if(hudEl.hidden)hudEl.hidden=false;
  if(cur!==T.id){cur=T.id;sig='';tape.hidden=!T.tape}
  const rows=T.hud.map(r=>`<div class="${r.c(i)}"><em>${r.label}</em><b>${r.v(i)}</b></div>`).join(''),s=rows+'|'+T.state(i);
  if(s!==sig){sig=s;rd.innerHTML=rows;st.textContent=T.state(i);st.className='ztst'+(i.stall>0?' r':i.flare?' g':'')}
  if(T.tape){const m=T.tape.max;mark.style.left=(Math.min(1,i.ias/m)*100).toFixed(1)+'%';low.style.width=(Math.min(1,T.tape.min(i)/m)*100).toFixed(1)+'%'}}
 const h0=Z.hud;Z.hud=dt=>{h0(dt);panel()};

 // ---------- the radio names the craft at the start of each wave (the Dart's lines are the radio's own) ----------
 let ws='';const s0=Z.step;Z.step=dt=>{s0(dt);const me=api.player;
  if(G.on&&G.state==='wave'&&ws!=='wave'&&me&&me.cx&&!api.demo&&Z.radio){const T=typeOf(me.ty);Z.radio.say('craft',2,'OVERLORD',`${T.call}, ${T.radio}`,{nb:1})}ws=G.state};
 const sy0=Z.syncMode;Z.syncMode=()=>{sy0?.();render()};
 render();
 return C}
