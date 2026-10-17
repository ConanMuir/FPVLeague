// Main loop: fixed 120 Hz physics steps (up to 12 per frame), then drawing. The menu's controller bars and the Rates graphs update here too.
import {composer} from './render.js';
import {menuPad} from './input.js';
import {drawRates} from './rates.js';
import {ratesOpen} from './modpanel.js';
// o.pre(now) before stepping; o.step(dt) physics; o.speed() time scale; o.paused(); o.draw(dt,realDt,now) visuals/camera/HUD; o.menu() menu open; o.post(now) before render
export function startLoop(o){let last=performance.now(),acc=0;const DT=1/120;
 function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;o.pre?.(now);
  if(!o.paused()){acc+=dt*o.speed();let n=0;while(acc>=DT&&n++<12){o.step(DT);acc-=DT}}
  o.draw(o.paused()?0:dt*o.speed(),dt,now);if(o.menu())menuPad();if(ratesOpen())drawRates();o.post?.(now);composer.render()}
 requestAnimationFrame(frame)}
