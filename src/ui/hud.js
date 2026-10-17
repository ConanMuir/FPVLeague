// ---------- HUD: banner, kill/goal feed, OSD, score, radar, off-screen arrow ----------
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
import {DHL,DHW,DLEN,DW,OBS,cxR} from '../world/highlands.js';
export function banner(txt,cls='',dur=1.2){const c=$('center');c.textContent=txt;c.className=cls;clearTimeout(banner.t);if(dur)banner.t=setTimeout(()=>c.textContent='',dur*1000)}
export function feed(html){const e=document.createElement('div');e.innerHTML=html;$('feed').prepend(e);setTimeout(()=>e.remove(),4500);while($('feed').children.length>4)$('feed').lastChild.remove()}
export const tag=d=>`<span class="${d.team?'co':'cb'}">${esc(d.name)}</span>`;
// ---------- HUD ----------
const rc=$('radar').getContext('2d');
function radar(){const w=110,h=170,sx=GS.OBSON?w/DW:w/(W+8),sz=GS.OBSON?(h-4)/DLEN:(h-6)/(L+2*GD),X=x=>w/2+x*sx,Z=z=>h/2+z*sz;rc.clearRect(0,0,w,h);
 rc.globalAlpha=.55;if(!GS.OBSON){rc.fillStyle=CSS[1];rc.fillRect(X(-GW/2),Z(-HL-GD),GW*sx,GD*sz);rc.fillStyle=CSS[0];rc.fillRect(X(-GW/2),Z(HL),GW*sx,GD*sz)}else{rc.strokeStyle='rgba(90,170,220,.8)';rc.lineWidth=3;rc.beginPath();for(let z=-DHL;z<=DHL;z+=20)rc.lineTo(X(cxR(z)),Z(z));rc.stroke();rc.fillStyle='rgba(170,185,205,.6)';
  for(const o of OBS){if(o.t==='tree'||o.t==='rock')continue;rc.beginPath();if(o.t==='box'||o.t==='hang')rc.rect(X(o.x-o.hx),Z(o.z-o.hz),Math.max(2,o.hx*2*sx),Math.max(2,o.hz*2*sz));else rc.arc(X(o.x),Z(o.z),Math.max(1.2,(o.t==='ring'?o.R:o.r)*sx),0,7);rc.fill()}
  rc.globalAlpha=1;for(const t of TUR)if(t.re<=0){rc.fillStyle=CSS[t.t];rc.fillRect(X(t.p.x)-2.5,Z(t.p.z)-2.5,5,5)}}rc.globalAlpha=1;
 rc.strokeStyle='rgba(170,195,255,.55)';rc.lineWidth=1;if(GS.OBSON)rc.strokeRect(X(-DHW),Z(-DHL),DW*sx,DLEN*sz);else{rc.strokeRect(X(-HW),Z(-HL),W*sx,L*sz);rc.beginPath();rc.moveTo(X(-HW),Z(0));rc.lineTo(X(HW),Z(0));rc.stroke()}
 for(const d of GS.drones){if(d.dead>0)continue;rc.fillStyle=CSS[d.team];if(d===GS.player){const f=_f.set(0,0,-1).applyQuaternion(d.q),a=Math.atan2(f.x,-f.z);rc.save();rc.translate(X(d.p.x),Z(d.p.z));rc.rotate(a);rc.beginPath();rc.moveTo(0,-7);rc.lineTo(5,5);rc.lineTo(-5,5);rc.closePath();rc.fill();rc.strokeStyle='#fff';rc.stroke();rc.restore()}
  else{rc.beginPath();rc.arc(X(d.p.x),Z(d.p.z),3.2,0,7);rc.fill()}}
 if(GS.OBSON)return;rc.fillStyle='#fff';rc.shadowColor='#9fe8ff';rc.shadowBlur=6;rc.beginPath();rc.arc(X(ball.p.x),Z(ball.p.z),3.6,0,7);rc.fill();rc.shadowBlur=0}
const fmt=t=>{t=Math.ceil(t);return`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`};
export function hud(){if(GS.demo)return;const me=GS.player;$('sb').textContent=GS.score[0];$('so').textContent=GS.score[1];$('clock').textContent=(GS.overtime?'+':'')+fmt(GS.clock);
 if(!me){$('osd').textContent=GS.net?'SPECTATING · GAME '+GS.net.code.toUpperCase():'';$('arrow').hidden=true;radar();return}
 $('osd').innerHTML=`<span><b>${S.mode==='acro'?'ACRO':'ANGLE'}</b> · ${['FPV','CHASE',GS.OBSON?'ENEMY CAM':'BALL CAM'][GS.camMode]} · ${GS.net?'ONLINE '+GS.net.code.toUpperCase():DIFF[S.diff].n.toUpperCase()}</span><span>THR ${String(Math.round(me.thr*100)).padStart(3)}%${me.boostOn?' BOOST':''}  ${String(Math.round(me.v.length()*3.6*9.81/G)).padStart(3)} km/h</span><span>ALT ${(me.p.y*9.81/G).toFixed(1)} m  ROLL ${Math.round(rate(0,1)*180/Math.PI)}°/s</span>${GS.OBSON?`<span>HP ${Math.max(0,Math.round(me.hp))}${me.dead>0?` · RESPAWN ${me.dead.toFixed(1)}`:''}</span>`:''}`;
 $('hpw').hidden=!GS.OBSON;if(GS.OBSON){$('hval').textContent=Math.max(0,Math.round(me.hp));$('hpfill').style.width=cl(me.hp,0,100)+'%'}
 $('bsec').hidden=!SB();$('blbl').textContent=`BOOST · TOP ${Math.round(BZ*100)}% THR`;$('bval').textContent=Math.round(me.boost);$('boostfill').style.width=me.boost+'%';$('xh').hidden=GS.camMode!==0||me.dead>0;
 const a=$('arrow'),foe=GS.OBSON&&nearestFoe(me);_t.copy(GS.OBSON?foe?.p||ball.p:ball.p).project(camera);let x=_t.x,y=_t.y;const behind=_t.z>1;if(behind){x=-x;y=-y}
 if((GS.OBSON?!foe:!ballMesh.visible)||(!behind&&Math.abs(x)<.95&&Math.abs(y)<.9))a.hidden=true;else{a.hidden=false;const m=Math.max(Math.abs(x)/.9,Math.abs(y)/.82,1e-3);x/=m;y/=m;
  a.style.transform=`translate(${(x*.5+.5)*innerWidth-13}px,${(-y*.5+.5)*innerHeight-12}px) rotate(${Math.atan2(x,y)}rad)`}
 radar()}
