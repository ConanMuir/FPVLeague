// ---------- FPS meter and frame sampler: one copy for Jared's game (src/, bundled by Vite) and Riley's (engine/ + games/, raw ES modules) ----------
// Leaf module (no imports, DOM only). onFrame(fn) gets every frame's interval in ms from one shared requestAnimationFrame sampler, which
// knows nothing of either game's loop (so the loop can change under it). The dynamic resolution controller (src/render/dynres.js)
// listens there too.
// mountFps({detail}) puts a small meter in the top-right corner: FPS, the average frame time in ms, a sparkline of the last 64 frames,
// green / amber / red at 55 / 30 FPS. It costs next to nothing: the text and the sparkline are redrawn 4 times a second, the box has
// a fixed size and is contained, and nothing reads layout back. Each game places it with its own CSS (#fpsm) clear of its HUD; body.fpson
// is set while it shows, for moving other top-right things out of its way.
const subs=new Set();let raf=0,last=0;
function tick(now){raf=requestAnimationFrame(tick);const ms=last?now-last:0;last=now;if(ms>0&&ms<1000)for(const f of subs)f(ms,now)}
/** fn(ms, now) on every frame; returns an unsubscribe function */
export function onFrame(fn){subs.add(fn);if(!raf){last=0;raf=requestAnimationFrame(tick)}return()=>{subs.delete(fn);if(!subs.size&&raf){cancelAnimationFrame(raf);raf=0}}}
const CSS='#fpsm{position:fixed;right:12px;top:calc(10px + env(safe-area-inset-top,0px));z-index:1;display:flex;align-items:center;gap:6px;box-sizing:border-box;width:214px;height:24px;padding:0 7px;'+
 'background:rgba(6,10,18,.62);border:1px solid rgba(150,180,255,.18);border-radius:4px;font:700 11px/1 "JetBrains Mono",ui-monospace,Consolas,monospace;color:#7dff9a;'+
 'font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;contain:strict;text-shadow:0 0 3px #000}'+
 '#fpsm[hidden]{display:none}#fpsm.mid{color:#ffc640}#fpsm.lo{color:#ff6b5e}#fpsm canvas{flex:none;width:44px;height:14px}#fpsm span{flex:1;overflow:hidden}#fpsm em{font-style:normal;font-weight:500;color:#93a0b8}';
const N=64;
/** the meter: {el, show(on)}. detail() returns a short extra string (e.g. the resolution scale) shown after the frame time */
export function mountFps({parent=document.body,detail=null,on=true}={}){
 if(!document.getElementById('fpsm-css')){const s=document.createElement('style');s.id='fpsm-css';s.textContent=CSS;document.head.append(s)}
 const el=document.createElement('div');el.id='fpsm';el.setAttribute('aria-hidden','true');el.innerHTML='<span>-- FPS</span><canvas width="88" height="28"></canvas>';parent.append(el);
 const tx=el.firstChild,cv=el.lastChild,g=cv.getContext('2d'),buf=new Float32Array(N);
 let k=0,sum=0,n=0,t0=0,off=null,cls='';
 function draw(){g.clearRect(0,0,88,28);for(let i=0;i<N;i++){const v=buf[(k+i)%N];if(!v)continue;const h=Math.min(28,v/50*28);g.fillStyle=v>33.4?'#ff6b5e':v>18.2?'#ffc640':'#3ddc84';g.fillRect(i*1.375,28-h,1.1,h)}}
 function sample(ms,now){buf[k]=ms;k=(k+1)%N;sum+=ms;n++;if(!t0)t0=now;if(now-t0<250)return;
  const avg=sum/n,fps=1000/avg,c=fps>=55?'':fps>=30?'mid':'lo';if(c!==cls)el.className=cls=c;
  const d=detail?.()||'';tx.innerHTML=`${Math.round(fps)} FPS <em>${avg.toFixed(1)} ms${d?' · '+d:''}</em>`;draw();sum=n=0;t0=now}
 const show=v=>{el.hidden=!v;document.body.classList.toggle('fpson',!!v);if(v&&!off){sum=n=t0=0;off=onFrame(sample)}else if(!v&&off){off();off=null}};
 show(on);return{el,show}}
