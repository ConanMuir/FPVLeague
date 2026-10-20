// Main loop: fixed 120 Hz physics steps (up to 12 per frame), then drawing. The menu's controller bars and the Rates graphs update here too.
import {composer} from './render.js';
import {menuPad} from './input.js';
import {drawRates} from './rates.js';
import {ratesOpen} from './modpanel.js';
import {capSkip} from '../src/ui/fpsmeter.js';
// o.pre(now) before stepping; o.step(dt) physics; o.speed() time scale; o.slow() slow-mo on; o.paused(); o.draw(dt,realDt,now) visuals/camera/HUD; o.menu() menu open; o.post(now) before render
export function startLoop(o){let last=performance.now(),acc=0;const DT=1/120;
 function frame(now){requestAnimationFrame(frame);if(capSkip(now))return;const dt=Math.min(.05,(now-last)/1000);last=now;o.pre?.(now);  /* capSkip: the frame cap (src/ui/fpsmeter.js) */

  if(!o.paused()){if(o.slow?.()){let r=dt*o.speed();while(r>1e-6){const h=Math.min(DT,r);o.step(h);r-=h}acc=0}else{acc+=dt*o.speed();let n=0;while(acc>=DT&&n++<12){o.step(DT);acc-=DT}}}  // slow-mo (o.slow()) steps every frame by a smaller dt, so nothing stutters
  o.draw(o.paused()?0:dt*o.speed(),dt,now);if(o.menu())menuPad();if(ratesOpen())drawRates();o.post?.(now);composer.render()}
 requestAnimationFrame(frame)}
