// ---------- HUD: banner, kill/goal feed, OSD, score, off-screen arrow ----------
import {$,CSS,DIFF,GD,GW,HL,HW,L,W,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BZ,G} from '../config/tune.js';
import {rate} from '../flight/rates.js';
import {TUR,nearestFoe} from '../modes/dogfight.js';
import {ball} from '../physics/ball.js';
import {ballMesh} from '../render/ball.js';
import {camera} from '../render/renderer.js';
import {_f,_t} from '../scratch.js';
import {GS,SB,esc} from '../state.js';
import {MODES} from '../modes/registry.js';
import {DHL,DHW,DLEN,DW,OBS,cxR} from '../world/highlands.js';
import {osd} from './osd.js';
export function banner(txt,cls='',dur=1.2){const c=$('center');c.textContent=txt;c.className=cls;clearTimeout(banner.t);if(dur)banner.t=setTimeout(()=>c.textContent='',dur*1000)}
export function feed(html){const e=document.createElement('div');e.innerHTML=html;$('feed').prepend(e);setTimeout(()=>e.remove(),4500);while($('feed').children.length>4)$('feed').lastChild.remove()}
export const tag=d=>`<span class="${d.team?'co':'cb'}">${esc(d.name)}</span>`;
// ---------- HUD ----------
// bottom-right dial (Rocket League's boost meter): boost when Super boost is on, otherwise speed with a throttle arc; Dogfight adds a health ring
// per-frame HUD writes skip the DOM when the value is what this code last wrote (el._v / el._a), so an unchanged readout costs no DOM work
const put=(el,v)=>{if(el._v!==v){el._v=v;el.textContent=v}},putH=(el,h)=>{if(el._v!==h){el._v=h;el.innerHTML=h}};
const arc=(el,f)=>{const v=`${cl(f,0,1)*75} 100`;if(el._a!==v){el._a=v;el.setAttribute('stroke-dasharray',v)}};
function dial(me){const sb=SB(),hp=GS.OBSON;$('dial').classList.toggle('boost',sb);$('dial').classList.toggle('on',!!me.boostOn);
 put($('dnum'),sb?Math.round(me.boost):Math.round(me.v.length()*3.6*9.81/G));put($('dlbl'),sb?'BOOST':'KM/H');$('dial').classList.toggle('pop',me.popC>0);put($('dsub'),me.popC>0?`POP ${me.popC.toFixed(1)}s`:sb?`TOP ${Math.round(BZ*100)}% THR`:`THR ${Math.round(me.thr*100)}%`);arc($('darc'),sb?me.boost/100:me.thr);
 $('dhp').style.display=$('dhpt').style.display=hp?'':'none';if(hp){arc($('dhp'),me.hp/100);$('dhp').style.stroke=`hsl(${cl(me.hp,0,100)*1.2},85%,58%)`}}
const fmt=t=>{t=Math.ceil(t);return`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`};
/* the bot level the HUD names: the level the bots against you fly (a tournament match's entrant, modes/tournament.js sets d.skill; the menu's Bot skill otherwise) */
const foeLevel=me=>{const f=GS.drones.find(d=>d.bot&&d.team!==me.team);return DIFF[f?f.skill??S.diff:S.diff].n};
export function hud(){if(GS.demo)return;const me=GS.player;put($('sb'),GS.score[0]);$('so').textContent=GS.score[1];put($('clock'),MODES[GS.GM]?.free?'FREEPLAY':(GS.overtime?'+':'')+fmt(GS.clock));  // #so is also an id in the sensitivity panel (ui/sens.js writes the first one), so it is always written
 osd(me);if(!me){put($('osd'),GS.net?'SPECTATING · GAME '+GS.net.code.toUpperCase():GS.spect?'SPECTATING · '+GS.spect.toUpperCase():'');$('arrow').hidden=true;return}
 putH($('osd'),`<span><b>${S.mode==='acro'?'ACRO':'ANGLE'}</b> · ${['FPV','CHASE',GS.OBSON?'ENEMY CAM':'BALL CAM'][GS.camMode]} · ${GS.net?'ONLINE '+GS.net.code.toUpperCase():foeLevel(me).toUpperCase()}</span><span>THR ${String(Math.round(me.thr*100)).padStart(3)}%${me.boostOn?' BOOST':''}  ${String(Math.round(me.v.length()*3.6*9.81/G)).padStart(3)} km/h</span><span>ALT ${(me.p.y*9.81/G).toFixed(1)} m  ROLL ${Math.round(rate(0,1)*180/Math.PI)}°/s</span>${GS.OBSON?`<span>HP ${Math.max(0,Math.round(me.hp))}${me.dead>0?` · RESPAWN ${me.dead.toFixed(1)}`:''}</span>`:''}`);
 dial(me);$('xh').hidden=GS.camMode!==0||GS.llView||me.dead>0;
 const a=$('arrow'),foe=GS.OBSON&&nearestFoe(me);_t.copy(GS.OBSON?foe?.p||ball.p:ball.p).project(camera);let x=_t.x,y=_t.y;const behind=_t.z>1;if(behind){x=-x;y=-y}
 if((GS.OBSON?!foe:!ballMesh.visible)||(!behind&&Math.abs(x)<.95&&Math.abs(y)<.9))a.hidden=true;else{a.hidden=false;const m=Math.max(Math.abs(x)/.9,Math.abs(y)/.82,1e-3);x/=m;y/=m;
  a.style.transform=`translate(${(x*.5+.5)*innerWidth-13}px,${(-y*.5+.5)*innerHeight-12}px) rotate(${Math.atan2(x,y)}rad)`}}
