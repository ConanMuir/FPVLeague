// ---------- replay UI: the REPLAY / KILL CAM badge over the HUD, and the pause menu's Replays screen (this match's goals) ----------
// render/replay.js runs the replays; this file only builds and updates the DOM.
import {$} from '../config/constants.js';
import {GS} from '../state.js';
import {HLS,hlOk,playHL} from '../render/replay.js';
let box=null,tagEl=null,whoEl=null,btn=null,list=null,shown=-1;
/** builds the badge and the menu screen (render/replay.js rpInit, before initMenu wires the menu's buttons) */
export function rpUIInit(){
 box=document.createElement('div');box.id='rp';box.hidden=true;box.innerHTML='<b class="rptag"></b><div class="rpwho"></div><div class="rpskip">Press any key to skip</div>';$('hud').append(box);tagEl=box.firstChild;whoEl=box.children[1];
 btn=document.createElement('button');btn.id='rpbtn';btn.dataset.scr='replays';btn.hidden=true;btn.innerHTML='Replays<small>Goals from this match</small>';$('setbtn').before(btn);
 const sec=document.createElement('section');sec.className='scr';sec.id='scr-replays';sec.hidden=true;sec.setAttribute('aria-label','Replays');
 sec.innerHTML='<div class="shead"><button class="sm back">Back</button><h2>Replays</h2></div><p class="note">The last three goals of this match. Any key skips back to this menu.</p><div id="rplist" class="rplist"></div>';$('scr-online').before(sec);list=$('rplist');
 btn.addEventListener('click',fill)}
function fill(){list.textContent='';HLS.forEach((c,i)=>{if(!hlOk(c))return;const b=document.createElement('button');b.className='sm';b.innerHTML=`Goal ${HLS.length-i} · ${c.label}`;b.onclick=()=>playHL(c);list.append(b)})}
/** the badge: title ('REPLAY', 'KILL CAM', 'HIGHLIGHT') and who (HTML: the scorer / killer, escaped by the caller); null hides it */
export function rpBadge(title,who){if(!box)return;box.hidden=!title;$('hud').classList.toggle('rp',!!title);if(!title)return;tagEl.textContent=title;whoEl.innerHTML=who||'';$('center').textContent=''}
/** every frame: the Replays button shows in the offline pause menu once a goal has a replay */
export function rpMenu(){if(!btn)return;const n=GS.menuOpen&&!GS.demo&&!GS.net&&HLS.some(hlOk)?1:0;if(n!==shown){shown=n;btn.hidden=!n}}
