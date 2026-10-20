// ---------- FPS meter, frame cap and frame sampler: one copy for Jared's game (src/, bundled by Vite) and Riley's (engine/ + games/, raw ES modules) ----------
// Leaf module (no imports, DOM only). onFrame(fn) gets every drawn frame's interval in ms from one shared requestAnimationFrame sampler,
// which knows nothing of either game's loop (so the loop can change under it). The dynamic resolution controller (src/render/dynres.js)
// listens there too.
// Frame cap (setCap(fps), 0 = off): on a fast screen (240 Hz) the game can hold a steady 120 / 80 / 60. Each game's loop asks capSkip(now)
// first thing in its frame and skips the frame (no sim, no draw, its clock not advanced) when it is too soon; the sampler asks the same,
// so the meter and the governor see the frames that were drawn. One answer per rAF timestamp, so the order of the callbacks doesn't matter.
// mountFps({detail, gl}) puts a small meter in the top-right corner: FPS, the average frame time in ms, a sparkline of the last 64 frames,
// green / amber / red at 55 / 30 FPS, and (with gl) a second line naming the GPU the browser gave the game, amber with "iGPU" when it is
// an integrated or software one (a laptop's discrete GPU has to be picked for the browser in the OS's graphics settings). It costs next
// to nothing: the text and the sparkline are redrawn 4 times a second, the box has a fixed size and is contained, and nothing reads
// layout back. Each game places it with its own CSS (#fpsm) clear of its HUD; body.fpson is set while it shows, for moving other
// top-right things out of its way.
let capI=0,capT=0,capNow=-1,capAns=false;
/** frame cap in FPS (0 = none) */
export const setCap=fps=>{capI=fps>0?1000/fps:0;capT=0};
/** true: skip this frame (too soon for the cap). Ask once per frame with the rAF timestamp; repeated asks get the same answer */
export function capSkip(now){if(now===capNow)return capAns;capNow=now;if(!capI)return capAns=false;if(capT&&now-capT<capI-1.5)return capAns=true;capT=capT&&now-capT<capI*2?capT+capI:now;return capAns=false}
const subs=new Set();let raf=0,last=0;
function tick(now){raf=requestAnimationFrame(tick);if(capSkip(now))return;const ms=last?now-last:0;last=now;if(ms>0&&ms<1000)for(const f of subs)f(ms,now)}
/** fn(ms, now) on every drawn frame; returns an unsubscribe function */
export function onFrame(fn){subs.add(fn);if(!raf){last=0;raf=requestAnimationFrame(tick)}return()=>{subs.delete(fn);if(!subs.size&&raf){cancelAnimationFrame(raf);raf=0}}}
/** the GPU behind a WebGL context: {name, igpu} (name shortened from ANGLE's renderer string; igpu: integrated or software) */
export function gpuInfo(gl){let r='';try{const e=gl.getExtension('WEBGL_debug_renderer_info');r=String(e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER))}catch(e){}
 const m=/^ANGLE \((.*)\)$/.exec(r),p=m?m[1].split(', '):[r];let name=(p[1]||p[0]).replace(/\s*\(0x[0-9a-f]+\)/ig,'').replace(/\s*(Direct3D|OpenGL|Vulkan|Metal).*$/i,'').trim()||'unknown GPU';
 const igpu=/swiftshader|llvmpipe|software|basic render/i.test(r)||/intel/i.test(r)&&!/\barc\b/i.test(r)||/radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|mali|adreno|powervr|videocore/i.test(r);
 return{name,igpu,raw:r}}
const CSS='#fpsm{position:fixed;right:12px;top:calc(10px + env(safe-area-inset-top,0px));z-index:1;display:flex;flex-wrap:wrap;align-items:center;align-content:center;gap:3px 6px;box-sizing:border-box;width:214px;height:24px;padding:0 7px;'+
 'background:rgba(6,10,18,.62);border:1px solid rgba(150,180,255,.18);border-radius:4px;font:700 11px/1 "JetBrains Mono",ui-monospace,Consolas,monospace;color:#7dff9a;'+
 'font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;contain:strict;text-shadow:0 0 3px #000}#fpsm.g2{height:38px}'+
 '#fpsm[hidden]{display:none}#fpsm.mid{color:#ffc640}#fpsm.lo{color:#ff6b5e}#fpsm canvas{flex:none;width:44px;height:14px}#fpsm span{flex:1;overflow:hidden}#fpsm em{font-style:normal;font-weight:500;color:#93a0b8}'+
 '#fpsm b{flex:0 0 100%;overflow:hidden;text-overflow:ellipsis;font-weight:500;font-size:10px;color:#93a0b8}#fpsm b.ig{color:#ffc640}';
const N=64;
/** the meter: {el, show(on)}. detail() returns a short extra string (e.g. the resolution scale) shown after the frame time; gl: name the GPU */
export function mountFps({parent=document.body,detail=null,on=true,gl=null}={}){
 if(!document.getElementById('fpsm-css')){const s=document.createElement('style');s.id='fpsm-css';s.textContent=CSS;document.head.append(s)}
 const el=document.createElement('div');el.id='fpsm';el.setAttribute('aria-hidden','true');el.innerHTML='<span>-- FPS</span><canvas width="88" height="28"></canvas>';parent.append(el);
 const tx=el.firstChild,cv=el.children[1],g=cv.getContext('2d'),buf=new Float32Array(N),G=gl?gpuInfo(gl):null,base=G?'g2':'';
 if(G){const b=document.createElement('b');b.textContent=(G.igpu?'iGPU · ':'')+G.name;if(G.igpu)b.className='ig';el.append(b);el.className=base;
  if(G.igpu)console.info(`Rendering on ${G.raw}. If this machine has a discrete GPU, set the browser to "High performance" in the OS graphics settings (Windows: Settings > System > Display > Graphics).`)}
 let k=0,sum=0,n=0,t0=0,off=null,cls='';
 function draw(){g.clearRect(0,0,88,28);for(let i=0;i<N;i++){const v=buf[(k+i)%N];if(!v)continue;const h=Math.min(28,v/50*28);g.fillStyle=v>33.4?'#ff6b5e':v>18.2?'#ffc640':'#3ddc84';g.fillRect(i*1.375,28-h,1.1,h)}}
 function sample(ms,now){buf[k]=ms;k=(k+1)%N;sum+=ms;n++;if(!t0)t0=now;if(now-t0<250)return;
  const avg=sum/n,fps=1000/avg,c=fps>=55?'':fps>=30?'mid':'lo';if(c!==cls){cls=c;el.className=(base+' '+c).trim()}
  const d=detail?.()||'';tx.innerHTML=`${Math.round(fps)} FPS <em>${avg.toFixed(1)} ms${d?' · '+d:''}</em>`;draw();sum=n=0;t0=now}
 const show=v=>{el.hidden=!v;document.body.classList.toggle('fpson',!!v);if(v&&!off){sum=n=t0=0;off=onFrame(sample)}else if(!v&&off){off();off=null}};
 show(on);return{el,show,gpu:G}}
