// HUD pieces every game shares: the centre banner, the event feed and the off-screen target arrow
import {$} from './util.js';
let FEEDMS=4500;
export const setFeedTime=ms=>FEEDMS=ms;
export function banner(txt,cls='',dur=1.2){const c=$('center');c.textContent=txt;c.className=cls;clearTimeout(banner.t);if(dur)banner.t=setTimeout(()=>c.textContent='',dur*1000)}
export function feed(html){const e=document.createElement('div');e.innerHTML=html;$('feed').prepend(e);setTimeout(()=>e.remove(),FEEDMS);while($('feed').children.length>4)$('feed').lastChild.remove()}
// arrow at the screen edge pointing at p when it is off screen or behind; hide = nothing to point at
export function edgeArrow(p,camera,hide,_t){const a=$('arrow');if(hide){a.hidden=true;return}_t.copy(p).project(camera);let x=_t.x,y=_t.y;const behind=_t.z>1;if(behind){x=-x;y=-y}
 if(!behind&&Math.abs(x)<.95&&Math.abs(y)<.9)a.hidden=true;else{a.hidden=false;const m=Math.max(Math.abs(x)/.9,Math.abs(y)/.82,1e-3);x/=m;y/=m;
  a.style.transform=`translate(${(x*.5+.5)*innerWidth-13}px,${(-y*.5+.5)*innerHeight-12}px) rotate(${Math.atan2(x,y)}rad)`}}
export const fmt=t=>{t=Math.ceil(t);return`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`};
