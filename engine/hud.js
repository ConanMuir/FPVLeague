// HUD pieces every game shares: the centre banner and the event feed
import {$} from './util.js';
let FEEDMS=4500;
export const setFeedTime=ms=>FEEDMS=ms;
export function banner(txt,cls='',dur=1.2){const c=$('center');c.textContent=txt;c.className=cls;clearTimeout(banner.t);if(dur)banner.t=setTimeout(()=>c.textContent='',dur*1000)}
export function feed(html){const e=document.createElement('div');e.innerHTML=html;$('feed').prepend(e);setTimeout(()=>e.remove(),FEEDMS);while($('feed').children.length>4)$('feed').lastChild.remove()}
