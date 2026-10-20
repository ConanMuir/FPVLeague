// ---------- dynamic resolution: one copy for Jared's game (src/render/renderer.js) and Riley's (engine/gfx.js) ----------
// Leaf module, pure logic (it also runs in node: test/dynres.test.mjs). Feed it every frame's interval (fpsmeter.js onFrame); when the
// frames run over budget it lowers the render scale in 0.1 steps down to min, and when there is headroom it brings it back in 0.05 steps.
// Hysteresis, so it settles instead of see-sawing:
//  - down: the smoothed frame time (EMA) over budget × 1.15 for 0.6 s; then a 1 s pause so the new scale shows in the numbers first;
//  - up: the EMA at or under budget × 0.95 for 3 s. A rAF interval cannot show headroom below the display's refresh (vsync caps it), so a
//    raise is a probe: if frames go over budget within 6 s of it, that raise is undone (back 0.05, not 0.1) and that scale becomes the cap.
//    Probing the cap again waits `probe` ms, which doubles with each failure (up to 60 s); a raise to the cap that holds 6 s clears it.
// on=false parks it at max. sample() returns true when the scale changed (the caller applies it: pixel ratio, render targets).
export function dynRes({min=.6,max=1,budget=1000/55}={}){
 const o={scale:max,min,max,budget,ema:budget,on:false,probe:3000,cap:9,slow:0,fast:0,hold:0,upAt:-1e9,t:0};
 const r=v=>Math.round(v*100)/100;
 o.reset=()=>{o.scale=o.max;o.ema=o.budget;o.slow=o.fast=o.hold=0;o.probe=3000;o.cap=9;o.upAt=-1e9};
 o.sample=ms=>{if(!(ms>0))return false;ms=Math.min(ms,250);o.t+=ms;o.ema+=(ms-o.ema)*.1;
  if(!o.on){if(o.scale!==o.max){o.scale=o.max;return true}return false}
  if(o.upAt>0&&o.t-o.upAt>6000){if(o.scale>=o.cap-1e-6){o.cap=9;o.probe=Math.max(3000,o.probe/2)}o.upAt=-1e9}
  if(o.hold>0){o.hold-=ms;return false}
  if(o.ema>o.budget*1.15){o.fast=0;o.slow+=ms;if(o.slow>=600&&o.scale>o.min){const probe=o.t-o.upAt<6000;
    if(probe){o.cap=o.scale;o.probe=Math.min(60000,o.probe*2)}o.upAt=-1e9;o.scale=Math.max(o.min,r(o.scale-(probe?.05:.1)));o.slow=0;o.hold=1000;return true}}
  else if(o.ema<=o.budget*.95){o.slow=0;o.fast+=ms;const next=Math.min(o.max,r(o.scale+.05));
   if(o.scale<o.max&&o.fast>=(next>=o.cap-1e-6?o.probe:3000)){o.scale=next;o.fast=0;o.upAt=o.t;o.hold=500;return true}}
  else o.slow=o.fast=0;
  return false};
 return o}
