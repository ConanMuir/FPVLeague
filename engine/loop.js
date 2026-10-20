// Main loop: a fixed 120 Hz simulation tick (the 1/120 s step the flight model and its golden tests use) fed from an accumulator, then one
// drawing pass per display frame. Up to 12 ticks run in a frame (o.cap() can raise it); past that the backlog is dropped, so a slow machine runs the game slower
// instead of spiralling. Game speed and slow-mo scale the time fed in, never the tick. The draw gets alpha (0..1): how far real time has got
// from the last tick toward the next, so a game can draw everything in between its previous and current tick (engine/interp.js) and stay
// smooth whatever the frame rate. The menu's controller bars and the Rates graphs update here too.
import {composer} from './render.js';
import {menuPad} from './input.js';
import {drawRates} from './rates.js';
import {ratesOpen} from './modpanel.js';
export const TICK=1/120,MAXTICKS=12;
// o.cap() ticks per frame at most (default MAXTICKS; a fast-forwarding spectator raises it); o.pre(now) before stepping; o.step(dt) one tick (dt is always TICK); o.speed() time scale; o.paused(); o.draw(dt,realDt,now,alpha) visuals/camera/HUD; o.menu() menu open; o.post(now) before render
export function startLoop(o){let last=performance.now(),acc=0;
 function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;o.pre?.(now);
  if(!o.paused()){acc+=dt*o.speed();let n=0;const cap=o.cap?.()||MAXTICKS;while(acc>=TICK&&n<cap){o.step(TICK);acc-=TICK;n++}if(acc>=TICK)acc=TICK*.999}
  o.draw(o.paused()?0:dt*o.speed(),dt,now,Math.min(1,acc/TICK));if(o.menu())menuPad();if(ratesOpen())drawRates();o.post?.(now);composer.render()}
 requestAnimationFrame(frame)}
