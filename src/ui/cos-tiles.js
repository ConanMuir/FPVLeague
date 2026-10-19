// Garage tiles for cosmetics: a small drawn swatch (CSS / inline SVG, no textures), the name and a rarity strip, as in RL.
// Colours go through teamSafe, so a tile shows the item as it will look on your team.
import {RARITY,teamSafe} from '../parts/cosmetics.js';
import {esc} from '../state.js';

const hx=n=>'#'+(n>>>0).toString(16).padStart(6,'0');
const mix=(a,b,k)=>{const c=i=>Math.round((a>>i&255)*(1-k)+(b>>i&255)*k);return (c(16)<<16)|(c(8)<<8)|c(0)};
const lite=(h,k)=>hx(mix(h,0xffffff,k)),dim=(h,k)=>hx(mix(h,0,k));
const svg=(body,bg='#14171d')=>`<svg viewBox="0 0 80 48" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="80" height="48" fill="${bg}"/>${body}</svg>`;
const WEAVE='repeating-linear-gradient(45deg,rgba(255,255,255,.07) 0 3px,rgba(0,0,0,.18) 3px 6px),repeating-linear-gradient(-45deg,rgba(255,255,255,.05) 0 3px,rgba(0,0,0,.12) 3px 6px)';
function paint(it,t){const c=it.col==null?mix(teamSafe(null,t),0,1-(it.dim||1)):teamSafe(it.col,t),b=hx(c);
 if(it.irid)return `background:linear-gradient(120deg,${b},#f3d9f0 30%,#d4f0ee 55%,${b} 75%,#e8e0ff)`;
 if(it.weave===2)return `background:radial-gradient(circle at 30% 40%,${lite(c,.25)} 0 7%,transparent 9%),radial-gradient(ellipse at 70% 60%,${lite(c,.18)} 0 12%,transparent 15%),radial-gradient(ellipse at 45% 80%,${lite(c,.3)} 0 6%,transparent 8%),radial-gradient(ellipse at 80% 20%,${lite(c,.2)} 0 8%,transparent 10%),${b}`;
 if(it.weave)return `background:${WEAVE},linear-gradient(135deg,${lite(c,.12)},${b} 60%,${dim(c,.3)})`;
 if(it.metal>.8)return `background:linear-gradient(160deg,${lite(c,.6)},${b} 30%,${dim(c,.5)} 52%,${lite(c,.45)} 70%,${dim(c,.2)})`;
 if(it.metal>.4)return `background:radial-gradient(circle at 30% 25%,${lite(c,.45)},${b} 45%,${dim(c,.45)})`;
 return it.coat?`background:linear-gradient(150deg,${lite(c,.35)},${b} 40%,${dim(c,.2)})`:`background:${b}`}
function decal(it,t){const c=hx(teamSafe(null,t));let b='';
 switch(it.pat){case 1:b=`<rect x="0" y="15" width="80" height="6" fill="${c}"/><rect x="0" y="27" width="80" height="6" fill="${c}"/>`;break;
  case 2:b=`<rect x="0" y="18" width="80" height="12" fill="${c}"/><rect x="0" y="13" width="80" height="2" fill="${c}"/><rect x="0" y="33" width="80" height="2" fill="${c}"/>`;break;
  case 3:for(let x=6;x<80;x+=16)b+=`<path d="M${x} 6 L${x+12} 24 L${x} 42" fill="none" stroke="${c}" stroke-width="5"/>`;break;
  case 4:b=`<path d="M80 2 C60 4 52 10 40 8 C48 14 30 16 20 14 C30 20 18 24 6 24 C18 26 30 30 22 34 C34 34 46 38 40 42 C54 40 62 46 80 46Z" fill="${c}"/><path d="M80 12 C66 14 60 18 52 18 C60 22 54 26 46 28 C56 30 64 34 80 36Z" fill="#fff" opacity=".55"/>`;break;
  case 5:for(let y=0;y<56;y+=13)for(let x=-8;x<88;x+=15){const ox=(y/13)%2?7.5:0,X=x+ox;b+=`<polygon points="${X},${y-7.5} ${X+6.5},${y-3.75} ${X+6.5},${y+3.75} ${X},${y+7.5} ${X-6.5},${y+3.75} ${X-6.5},${y-3.75}" fill="none" stroke="${c}" stroke-width="1.4"/>`}break;
  case 6:for(let x=-6;x<86;x+=11)b+=`<path d="M${x} 0 C${x+8} 12 ${x-2} 24 ${x+5} 48 L${x+9} 48 C${x+3} 26 ${x+11} 12 ${x+4} 0Z" fill="${c}"/>`;break;
  case 7:b=`<path d="M4 6 C18 0 28 14 20 22 C12 30 0 18 4 6Z M44 4 C60 2 62 18 50 20 C40 22 36 8 44 4Z M30 30 C44 24 56 36 46 44 C36 50 22 40 30 30Z M62 26 C74 22 80 34 74 40 C66 46 56 34 62 26Z" fill="${c}"/><path d="M50 8 C54 8 56 14 52 15Z M10 10 C14 12 12 18 8 16Z" fill="${dim(teamSafe(null,t),.5)}"/>`;break;
  case 8:for(let y=0;y<48;y+=8)for(let x=0;x<80;x+=8)if((x+y)/8%2)b+=`<rect x="${x}" y="${y}" width="8" height="8" fill="${c}"/>`;break;
  case 9:b=`<text x="40" y="39" text-anchor="middle" font-family="DSEG7 Classic,ui-monospace,monospace" font-weight="900" font-style="italic" font-size="34" fill="${c}">${String(it.num).padStart(2,'0')}</text>`;break;
  case 10:b=`<path d="M0 0 H46 L30 48 H0Z" fill="${c}"/>`;break}
 return svg(b)}
function props(it,t){const c=hx(teamSafe(it.col,t)),o=it.op;let b='';for(let i=0;i<3;i++)b+=`<ellipse cx="40" cy="12" rx="5.5" ry="13" fill="${c}" fill-opacity="${o}" stroke="${c}" stroke-opacity=".9" stroke-width=".8" transform="rotate(${i*120+18} 40 24) translate(0 -1)"/>`;
 return svg(`<circle cx="40" cy="24" r="22" fill="${c}" opacity=".08"/>${b}<circle cx="40" cy="24" r="4" fill="#9aa3b0"/>${it.emis?`<circle cx="40" cy="24" r="22" fill="none" stroke="${c}" stroke-width="2" opacity=".7"/>`:''}`)}
function bell(it,t){if(it.stock)return svg('<circle cx="40" cy="24" r="16" fill="#8a919c"/><circle cx="40" cy="24" r="16" fill="none" stroke="#c9ced6" stroke-width="2"/><circle cx="40" cy="24" r="4" fill="#3a3f47"/>');
 const c=it.col==null?teamSafe(null,t):teamSafe(it.col,t);
 const ring=it.irid?`<circle cx="40" cy="24" r="16" fill="none" stroke="#b07cff" stroke-width="3"/><circle cx="40" cy="24" r="12" fill="none" stroke="#3fd0c0" stroke-width="2.5"/><circle cx="40" cy="24" r="8.5" fill="none" stroke="#e8b040" stroke-width="2"/>`:'';
 return svg(`<circle cx="40" cy="24" r="17" fill="${dim(c,.45)}"/><circle cx="40" cy="24" r="15" fill="${hx(c)}"/><ellipse cx="35" cy="18" rx="7" ry="4" fill="#fff" opacity=".35"/>${ring}<circle cx="40" cy="24" r="4" fill="#2a2d33"/>`)}
function led(it,t){const c=hx(teamSafe(it.col,t));return svg(`<circle cx="40" cy="24" r="16" fill="${c}" opacity=".18"/><circle cx="40" cy="24" r="10" fill="${c}" opacity=".45"/><circle cx="40" cy="24" r="6" fill="#fff"/><circle cx="40" cy="24" r="6" fill="${c}" opacity=".5"/>`)}
function trail(it,t){const a=hx(teamSafe(it.col,t)),b=hx(teamSafe(it.col2,t)),g=it.style==='rainbow'?'<stop offset="0" stop-color="#ff4040"/><stop offset=".33" stop-color="#fff040"/><stop offset=".66" stop-color="#40c8ff"/><stop offset="1" stop-color="#d050ff" stop-opacity="0"/>':`<stop offset="0" stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${b}" stop-opacity="0"/>`;
 const id='tg'+it.id+t,dots=it.style==='sparks'||it.style==='sparkle'?[18,30,44,58,70].map((x,i)=>`<circle cx="${x}" cy="${24+(i%2?7:-7)}" r="${2-i*.25}" fill="${a}"/>`).join(''):'';
 return svg(`<defs><linearGradient id="${id}" x1="1" x2="0">${g}</linearGradient></defs><path d="M78 24 C60 14 30 18 2 ${it.style==='smoke'?30:24} C30 30 60 34 78 24Z" fill="url(#${id})"/>${dots}<circle cx="74" cy="24" r="4" fill="#fff" opacity=".85"/>`)}
const SW={paint:(it,t)=>`<div class="gsw" style="${paint(it,t)}"></div>`,decal:(it,t)=>`<div class="gsw">${decal(it,t)}</div>`,props:(it,t)=>`<div class="gsw">${props(it,t)}</div>`,bell:(it,t)=>`<div class="gsw">${bell(it,t)}</div>`,led:(it,t)=>`<div class="gsw">${led(it,t)}</div>`,trail:(it,t)=>`<div class="gsw">${trail(it,t)}</div>`};
// o.lock: the unlock requirement while it is locked (progress/unlocks.js reqText): the tile shows a padlock and the requirement;
// o.note: a line under the rarity (the Profile's unlock list)
const LOCK='<svg class="glk" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="2.5" y="7" width="11" height="8" rx="1.5" fill="currentColor"/></svg>';
export function cosTile(c,it,t,o={}){const[rn,rc]=RARITY[it.r],lk=o.lock;
 return `<button class="gtile gct${lk?' lck':''}" data-c="${c}" data-id="${esc(it.id)}" style="--rc:${rc}" title="${esc(it.name)}${it.sub?' · '+esc(it.sub):''}${lk?' · Locked: '+esc(lk):''}"><i>Equipped</i>${SW[c](it,t)}<b>${esc(it.name)}</b><small>${esc(rn)}</small>${lk?`<em class="greq">${LOCK}${esc(lk)}</em>`:o.note?`<em class="gnote">${esc(o.note)}</em>`:''}</button>`}
