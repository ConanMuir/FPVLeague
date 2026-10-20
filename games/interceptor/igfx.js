// Interceptor side of the Graphics quality setting (engine/gfx.js, S.gfx: auto / high / med / low), the optional distance haze (S.haze)
// and the FPS meter (S.fps).
// Applies the level to what interceptor.js builds once: the renderer's pixel ratio (with Auto's dynamic resolution), the sun's shadow map
// size and box, the glow pass, the forest tiles (draw distance, thinning, crown detail by distance (lodD, lodD2), shadows), village house shadows, the
// detail and field shaders (LOD / DETD / GFAR uniforms: no recompiles) and the rain count. Zombies' systems read gfx.k where they spawn
// things (zwx.js weather particles, zfx.js smoke / fire / debris / tracers, buildings.js site fires, zswarm.js swarm detail).
// Distance haze (off by default: the weather's own fog is the look): the fog closes in to 60% of the weather's distances, and whatever the
// fog fully hides is skipped (forest tiles past the fog's far end, the field shader's detail past 80% of it), so the cut-offs can't be seen.
// Everything here is render-side: it hooks the scene's onBeforeRender and the shared frame sampler, never the game loop.
import * as THREE from 'three';
import {gfx,startGovernor,NAMES,GK} from '../../engine/gfx.js';
import {LOD,DETD,GFAR} from '../../engine/render.js';
import {mountFps,setCap} from '../../src/ui/fpsmeter.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {warmStats} from '../../engine/warm.js';
const HAZE=.6;
export function initGfx({renderer,composer,bloom,resize,scene,camera,sun,clouds,S,feed,rain,active,steps}){
 const forest=scene.children.filter(m=>m.userData.forest&&m.userData.tile),houses=scene.children.filter(m=>m.userData.house);
 let pr=0,lk=null,lx=1e9,lz=1e9,lf=0;
 // haze: the weather code sets fog.near / far whenever it changes the look; a value it set (not ours) is the new base
 const fb={n:0,f:0,sn:-1,sf:-1,hz:false};  /* hz: the cloud sprites skip the fog under haze (fully fogged, they turned into grey blobs) */
 function haze(){const f=scene.fog;if(!f)return 1e9;if(fb.hz!==gfx.haze){fb.hz=gfx.haze;clouds?.traverse(o=>{if(o.material){o.material.fog=!fb.hz;o.material.needsUpdate=true}})}if(f.near!==fb.sn||f.far!==fb.sf){fb.n=f.near;fb.f=f.far}const h=gfx.haze?HAZE:1;f.near=fb.sn=fb.n*h;f.far=fb.sf=fb.f*h;return gfx.haze?f.far:1e9}
 // forest tiles: whole within k.near of the camera (so every tree you can hit is drawn), thinned to k.thin out to k.far, gone beyond (or
 // past the fog under haze); crowns of 80 faces past k.lodD and of 20 past k.lodD2 (a few pixels there), the full 180 nearer
 function tiles(ff){const k=gfx.k,x=camera.position.x,z=camera.position.z;if(k===lk&&ff===lf&&Math.abs(x-lx)<40&&Math.abs(z-lz)<40)return;lk=k;lf=ff;lx=x;lz=z;
  const far=Math.min(k.far,ff);GFAR.value=Math.min(k.gFar,ff*.8);
  for(const m of forest){const u=m.userData,[x0,z0,x1,z1]=u.tile,d=Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1)),mid=d>k.near,per=u.geo?2:1,trees=u.n/per;
   m.visible=d<=far;m.count=(mid?Math.max(1,Math.round(trees*k.thin)):trees)*per;if(u.geo)m.geometry=u.geo[d>=(k.lodD2??Infinity)?2:d>=k.lodD?1:0]}}
 const ob=scene.onBeforeRender;scene.onBeforeRender=function(...a){ob.apply(this,a);tiles(haze())};
 // antialiasing: the scene is drawn into the composer's targets, so the canvas's own AA never reached it. High: 4x MSAA on both targets
 // (the scene lands in either, depending on how many passes swapped that frame); Medium: SMAA after the tone-mapping pass; Low: none
 let smaa=null;
 function aa(m){const ms=m==='msaa'&&renderer.capabilities.isWebGL2?Math.min(4,renderer.capabilities.maxSamples):0;
  for(const t of[composer.renderTarget1,composer.renderTarget2])if(t.samples!==ms){t.samples=ms;t.dispose()}
  if(m==='smaa'&&!smaa){const s=new THREE.Vector2();renderer.getDrawingBufferSize(s);smaa=new SMAAPass(s.x,s.y);const i=composer.passes.findIndex(p=>p.constructor.name==='OutputPass');composer.insertPass(smaa,i<0?composer.passes.length:i+1)}
  if(smaa)smaa.enabled=m==='smaa'}
 function apply(g,why){const k=g.k,p=g.pixelRatio();
  if(Math.abs(p-pr)>1e-3){pr=p;renderer.setPixelRatio(p);composer.setPixelRatio(p);resize()}
  if(why==='res')return;
  if(sun.shadow.mapSize.x!==k.sh){sun.shadow.mapSize.set(k.sh,k.sh);sun.shadow.map?.dispose();sun.shadow.map=null}
  const c=sun.shadow.camera;if(c.right!==k.box){Object.assign(c,{left:-k.box,right:k.box,top:k.box,bottom:-k.box});c.updateProjectionMatrix()}
  sun.shadow.normalBias=.4*(2*k.box/k.sh)/(440/4096);  /* the bias follows the texel size: .4 at High, as before */
  aa(k.aa);bloom.enabled=k.bloom>0;LOD.value=k.ground?0:1;DETD.value=k.detD;for(const m of forest)m.castShadow=!!k.treeSh;for(const m of houses)m.castShadow=!!k.houseSh;lk=null;rain();
  if(why==='auto')feed(`<span class="co">Performance: graphics lowered to ${NAMES[g.level]} (Auto)</span>`)}
 gfx.on(apply);gfx.active=active;gfx.steps=steps;
 // the meter sits in the HUD (hidden with it in the menus); detail: the level in effect (H / M / L) and, on Auto, the resolution scale
 const g1={high:'H',med:'M',low:'L'},fm=mountFps({parent:document.getElementById('hud'),on:S.fps,gl:renderer.getContext(),detail:()=>g1[gfx.level]+(gfx.pref==='auto'?' '+Math.round(gfx.scale*100)+'%':'')});
 const sync=()=>{gfx.haze=!!S.haze;setCap(S.fcap);if(S.gfx!==gfx.pref)gfx.set(S.gfx);fm.show(S.fps)};
 gfx.haze=!!S.haze;setCap(S.fcap);gfx.set(S.gfx);startGovernor();
 if(window.__z)Object.assign(window.__z,{gfx,gfxGK:GK,composer,warm:warmStats});  /* read-only, for the harnesses (tools/zombies-perf.mjs, zombies-gfx.mjs) */
 return{sync,meter:fm}}
