// ---------- first-use work, done ahead in idle time ----------
// Some things are built or compiled the first time they are needed, and the game froze when you got there: the Garage (its own
// renderer and lighting, the stat bar ranges over every loadout, its shaders: ~1 s), the first Dogfight (Highlands terrain, caves and
// obstacles, their colliders, then ~1.6 s of shader compiles in the first frame), the first outdoor map (the textures they share).
// main.js queues those tasks here; after boot they run one per idle period (requestIdleCallback) while ready() holds (the menu's attract
// demo, nothing being played). A task is still one piece of work the browser can't split, so it shows as one stall of the menu demo
// instead of a freeze when you open the Garage or start a Dogfight. A task whose thing already exists (you got there first) costs nothing.
// Leaf module (no imports).
const Q=[],LOG=[];let started=false;
/** queue fn (runs once, in idle time) */
export function warmQueue(name,fn){Q.push({name,fn})}
/** start working through the queue, delay ms after boot, only while ready() is true */
export function warmIdle(ready,delay=3000){if(started)return;started=true;
 const idle=f=>window.requestIdleCallback?requestIdleCallback(f,{timeout:3000}):setTimeout(f,100);
 const next=()=>idle(()=>{if(!Q.length)return;if(!ready()){setTimeout(next,1000);return}const t=Q.shift(),t0=performance.now();try{t.fn()}catch(e){console.warn('warm-up '+t.name+' failed',e)}LOG.push([t.name,Math.round(performance.now()-t0)]);setTimeout(next,250)});
 setTimeout(next,delay)}
/** read-only (tools/frame-perf.mjs): tasks still queued, and [name, ms] of those done */
export const warmLeft=()=>Q.map(t=>t.name),warmLog=()=>LOG.slice();
