// Graphics quality for Riley's games (engine/ + games/): one shared level that every system reads, like Drone League's S.gfx (src/render/renderer.js).
//   import {gfx} from '../../engine/gfx.js';
//   gfx.k.wx          the current level's factors (table GK below); read them when you spawn or draw, e.g. count = Math.round(N * gfx.k.fx)
//   gfx.level         'high' | 'med' | 'low' (what is in effect); gfx.pref is the setting: 'auto' | 'high' | 'med' | 'low'
//   gfx.on(fn)        fn(gfx, why) after every change (why: 'set' the setting, 'auto' the governor stepped a level, 'res' the dynamic resolution
//                     scale moved); returns an unsubscribe function. Systems that build things once (shadow map, tree tiles) re-apply here.
//   gfx.pixelRatio()  the renderer pixel ratio for the level and the current dynamic resolution scale
//   gfx.haze          the optional distance haze is on (S.haze, games/interceptor/igfx.js): the fog is closer, so far things may be skipped
// High is the look the games had before the setting existed. Auto starts at High and owns the governor: it lowers the render resolution
// first (dynamic resolution, src/render/dynres.js, down to 0.6), and if frames are still slow at the lowest scale it steps down a level
// (High, then Medium, then Low) after 3 s of slow frames each. The scale only moves while gfx.active() is true (the game sets it: flying,
// not in a menu), a level only steps while gfx.steps() is also true (Interceptor: a Zombies wave), and never back up on its own:
// gfx.resetAuto() (leaving Zombies) goes back to High. High / Medium / Low are fixed: no governor and no dynamic resolution, so what you
// pick is what you get.
import {onFrame} from '../src/ui/fpsmeter.js';
import {dynRes} from '../src/render/dynres.js';
// aa: antialiasing (msaa: 4x MSAA scene targets, smaa: SMAA pass, '': none); pr: pixel-ratio cap; res: render scale on top (Low and Medium render fewer pixels even on a 1x screen); sh / box: sun shadow map size and
// half-width of the shadow box (m); treeSh: trees cast shadows; near / far: forest tiles within near (m) are drawn whole, out to far thinned
// to `thin` of their trees, beyond far not at all; wx: weather particles; fx: smoke, fire, debris and tracer rates; ground: the field
// shader's crop rows and the surface bump (0 = flat texture); bld: site fires and smoke; swarm: swarm drone detail (shadows, booster puffs);
// bloom: glow pass; houseSh: village houses cast shadows.
// Proximity (detail falls off with distance; on High only where it can't be seen): lodD / lodD2: forest tiles past these (m) get 80- / 20-face crowns (180 nearer)
// (at 3 km a crown is two pixels); gFar: the field shader's rows, tracks and verges fade out by this distance and are skipped beyond;
// detD: the surface bump is skipped past this (it has faded to nothing by then); fxR: explosion shockwaves, debris and smoke and the fires'
// flames are skipped this much nearer (×7000 m, 3000 m, 3500 m...); bldFar: site fires and smoke past this (m) are thinned to a third.
export const GK={
 high:{aa:'msaa',pr:1.5,res:1,sh:4096,box:220,treeSh:1,near:Infinity,far:Infinity,thin:1,wx:1,fx:1,ground:1,bld:1,swarm:1,bloom:1,houseSh:1,lodD:900,lodD2:2500,gFar:6000,detD:2000,fxR:1,bldFar:Infinity},
 med:{aa:'smaa',pr:1.25,res:.9,sh:2048,box:170,treeSh:1,near:2200,far:6500,thin:.5,wx:.6,fx:.7,ground:1,bld:.7,swarm:1,bloom:1,houseSh:1,lodD:900,lodD2:2000,gFar:3500,detD:1000,fxR:.7,bldFar:3000},
 low:{aa:'',pr:1,res:.75,sh:1024,box:120,treeSh:0,near:1300,far:3800,thin:.35,wx:.3,fx:.45,ground:0,bld:.4,swarm:0,bloom:0,houseSh:0,lodD:0,lodD2:1300,gFar:1,detD:0,fxR:.45,bldFar:1500}};
export const LEVELS=['high','med','low'],PREFS=['auto',...LEVELS],NAMES={auto:'Auto',high:'High',med:'Medium',low:'Low'};
export const cleanPref=v=>PREFS.includes(v)?v:'auto';
const subs=new Set(),dyn=dynRes({min:.6,max:1});
export const gfx={pref:'auto',level:'high',k:GK.high,dyn,haze:false,active:()=>true,steps:()=>true,ema:16,
 on(fn){subs.add(fn);return()=>subs.delete(fn)},
 emit(why){for(const f of subs)try{f(gfx,why)}catch(e){console.error(e)}},
 set(p){p=cleanPref(p);gfx.pref=p;dyn.on=p==='auto';if(p!=='auto'){gfx.level=p;dyn.reset()}else if(!LEVELS.includes(gfx.level))gfx.level='high';gfx.k=GK[gfx.level];slow=0;gfx.emit('set')},
 resetAuto(){if(gfx.pref!=='auto')return;const ch=gfx.level!=='high'||dyn.scale!==dyn.max;gfx.level='high';gfx.k=GK.high;dyn.reset();slow=0;if(ch)gfx.emit('set')},
 pixelRatio:()=>Math.min(globalThis.devicePixelRatio||1,gfx.k.pr)*Math.max(.5,gfx.k.res*dyn.scale),
 get scale(){return dyn.scale}};
// the governor: every frame (one rAF sampler shared with the FPS meter, independent of the game loop)
let slow=0,started=false;
export function startGovernor(){if(started)return;started=true;onFrame(ms=>{gfx.ema+=(Math.min(ms,250)-gfx.ema)*.05;if(gfx.pref!=='auto')return;
 const act=gfx.active();if(act&&dyn.sample(ms))gfx.emit('res');if(!act){slow=0;return}
 slow=gfx.ema>26&&dyn.scale<=dyn.min+1e-6&&gfx.steps()?slow+ms:0;
 if(slow>3000&&gfx.level!=='low'){slow=0;gfx.level=LEVELS[LEVELS.indexOf(gfx.level)+1];gfx.k=GK[gfx.level];gfx.emit('auto')}})}
