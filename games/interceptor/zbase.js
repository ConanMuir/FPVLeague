// Zombies base screen: shown between waves (no timer). Overview of the sites, repairs, then Continue starts the next wave.
// Keyboard: arrows / Tab move focus, Enter or Space activates, C continues. Gamepad: D-pad moves, A activates, Y continues.
import {KIND,REPAIR_PER_HP} from './zdata.js';
const $=id=>document.getElementById(id);
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initBase(Z,api,G){
 const {SITES}=api;
 const el=document.createElement('div');el.id='zbase';el.hidden=true;$('menu').before(el);
 const over=document.createElement('div');over.id='zover';over.hidden=true;$('menu').before(over);
 const repairCost=s=>Math.ceil((s.max-s.hp)*REPAIR_PER_HP*(Z.repairK?.()??1));
 function render(){const integ=SITES.reduce((a,s)=>(a.hp+=Math.max(0,s.hp),a.max+=s.max,a),{hp:0,max:0}),f=integ.hp/integ.max;
  el.innerHTML=`<div class="zpanel"><header><div><h2>${G.wave?`Wave ${G.wave} cleared`:'Briefing'}</h2><div class="zbig">${money(G.cash)}</div></div>
   <div class="zint"><span>Defense integrity ${Math.round(f*100)}%</span><b><i style="width:${(f*100).toFixed(1)}%" class="${f<.3?'lo':f<.6?'mid':''}"></i></b></div>
   <button class="go" id="zgo">Start wave ${G.wave+1} ▸</button></header>
   <section><h3>Sites</h3><div class="zsites">${SITES.map((s,i)=>{const c=repairCost(s);return`<div class="zrow"><span>${s.n}</span><span class="zhp"><b><i style="width:${s.hp/s.max*100}%"></i></b>${Math.ceil(s.hp)}/${s.max}</span>
    <button class="sm" data-rep="${i}" ${c&&G.cash>=Math.min(c,REPAIR_PER_HP*25)&&s.hp>0?'':'disabled'}>${s.hp<=0?'Destroyed':c?`Repair ${money(Math.min(c,G.cash>=c?c:Math.floor(G.cash/REPAIR_PER_HP)*REPAIR_PER_HP))}`:'Intact'}</button></div>`}).join('')}</div></section></div>`;
  $('zgo').onclick=()=>Z.continue();
  for(const b of el.querySelectorAll('[data-rep]'))b.onclick=()=>{const s=SITES[+b.dataset.rep],k=Z.repairK?.()??1,hp=Math.min(s.max-s.hp,Math.floor(G.cash/(REPAIR_PER_HP*k)));if(hp<=0)return;G.cash-=Math.ceil(hp*REPAIR_PER_HP*k);s.hp+=hp;render();focusSel('[data-rep="'+b.dataset.rep+'"]')}}
 const focusSel=q=>{const b=el.querySelector(q);(b&&!b.disabled?b:$('zgo'))?.focus()};
 function open(first){G.state='base';el.hidden=false;render();setTimeout(()=>$('zgo')?.focus(),30)}
 function close(){el.hidden=true}
 // spatial focus move between the visible buttons
 function move(dx,dy){const bs=[...el.querySelectorAll('button:not([disabled])')];if(!bs.length)return;const a=document.activeElement,ra=bs.includes(a)?a.getBoundingClientRect():null;
  if(!ra){bs[0].focus();return}const cx=ra.x+ra.width/2,cy=ra.y+ra.height/2;let best=null,bd=1e9;
  for(const b of bs){if(b===a)continue;const r=b.getBoundingClientRect(),x=r.x+r.width/2-cx,y=r.y+r.height/2-cy,along=x*dx+y*dy;if(along<=4)continue;const d=along+Math.abs(x*dy+y*dx)*2;if(d<bd){bd=d;best=b}}
  best?.focus()}
 function key(e){if(el.hidden)return false;const c=e.code;
  if(c==='ArrowUp')move(0,-1);else if(c==='ArrowDown')move(0,1);else if(c==='ArrowLeft')move(-1,0);else if(c==='ArrowRight')move(1,0);
  else if(c==='Space'&&el.contains(document.activeElement))document.activeElement.click();
  else if(c==='KeyC')Z.continue();else return c!=='Escape';e.preventDefault?.();return true}
 function pad(e){if(el.hidden&&over.hidden)return false;const host=el.hidden?over:el;
  if(e(12))move(0,-1);if(e(13))move(0,1);if(e(14))move(-1,0);if(e(15))move(1,0);if(e(0)&&host.contains(document.activeElement))document.activeElement.click();if(e(3)&&!el.hidden)Z.continue();return true}
 return{open,close,render,key,pad,el}}
