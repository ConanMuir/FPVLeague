// Drone League entry point: loads the modules in v15's section order (so the scene is built in the same order), boots, runs the loop.
import './config/constants.js';import './scratch.js';import './config/settings.js';import './config/tune.js';import './flight/rates.js';
import {llDraw,llHudFrame} from './modes/longline.js';
import './render/renderer.js';import './world/arena.js';import './world/maps.js';import './render/particles.js';import './audio/audio.js';
import './physics/sdf.js';import './physics/ball.js';import './render/ball.js';import './world/orbs.js';import './render/drone-mesh.js';import './flight/drone.js';
import './flight/attitude.js';import './input/input.js';import './bots/league.js';import './world/highlands.js';import './modes/dogfight.js';import './modes/guns.js';
import './bots/dogfight.js';import './state.js';import './modes/match.js';import './net/net.js';import './modes/step.js';import './render/camera.js';import './ui/hud.js';
import './render/visuals.js';import './ui/menu.js';import './input/calibration.js';import './ui/modpanel.js';import './ui/rates.js';import './ui/sens.js';import './ui/garage.js';import './net/p2p.js';import './modes/registry.js';import './modes/league.js';import './modes/freeplay.js';import './modes/lab.js';import './ui/lab.js';import './modes/training.js';import './ui/training.js';import './modes/tournament.js';import './ui/tournament.js';
import {$} from './config/constants.js';
import {makeLoop} from './core/loop.js';
import {makeInterp} from './render/interp.js';
import {gunsBack,gunsLerp,gunsSnap} from './modes/guns.js';
import {initPhysics} from './physics/world.js';
import {S} from './config/settings.js';
import {GSPD,applyTune} from './config/tune.js';
import {calib,initCalib} from './input/calibration.js';
import {padEdges} from './input/input.js';
import {setGame} from './modes/dogfight.js';
import {endMatch,goal,startDemo} from './modes/match.js';
import {step} from './modes/step.js';
import {connectRoom,netSend,netSync} from './net/net.js';
import {ball} from './physics/ball.js';
import {ballMesh,setBall} from './render/ball.js';
import {updateCam} from './render/camera.js';
import {camera,compileFor,composer,draw,keepPrograms,renderer,scene,setRS} from './render/renderer.js';
import {warmIdle,warmLeft,warmQueue} from './render/warm.js';
import {warmDFPhys} from './physics/world.js';
import {buildDF} from './world/highlands.js';
import {warmOutdoor} from './world/outdoor.js';
import {capSkip} from './ui/fpsmeter.js';
import {visuals} from './render/visuals.js';
import {GS} from './state.js';
import {hud} from './ui/hud.js';
import {initMenu,menuPad} from './ui/menu.js';
import {initModPanel,renderPresets,syncMod} from './ui/modpanel.js';
import {drawRates,initRates,syncRates} from './ui/rates.js';
import {initSens} from './ui/sens.js';
import {labSnap} from './modes/lab.js';
import {initLab} from './ui/lab.js';
import {garageView,initGarage,warmGarage} from './ui/garage.js';
import {trainSnap} from './modes/training.js';
import {initTraining} from './ui/training.js';
import {initProfile} from './ui/profile.js';
import {profSnap} from './progress/tracker.js';
import {modeHud} from './modes/registry.js';
import {cosInfo} from './render/cos-mat.js';
import {setMap,warmLook} from './world/maps.js';
import {rpDt,rpFrame,rpIn,rpInit,rpOut,rpRec,rpVis,rpState} from './render/replay.js';
import {TN,tournSnap} from './modes/tournament.js';
import {initTournament} from './ui/tournament.js';
// ---------- main loop ----------
// fixed 120 Hz simulation (core/loop.js: timeScale / Game speed change how much sim time a frame covers; pause runs none), drawn between the
// last two ticks: render/interp.js moves the ball and the local quads (modes/guns.js gunsLerp: the tracers and turret heads) alpha of the way
// from the previous tick to the current one for the frame's reads, and end() / gunsBack() put the sim state back before anything steps or sends it.
let last=performance.now();
const IP=makeInterp(f=>{f(ball);for(const d of GS.drones)if(!d.remote)f(d)});  // remote drones are smoothed by visuals() from network state
let simT=0,drawA=1;  /* sim seconds stepped, and the last frame's render alpha (the drawn moment, for __dl.view) */
function tick(dt){simT+=dt;IP.snap();gunsSnap();step(dt);rpRec(dt)}  // rpRec: the replay recorder (render/replay.js)
const LOOP=makeLoop(tick),tScale=()=>GS.timeScale;let nF=0;
function frame(now){requestAnimationFrame(frame);if(capSkip(now))return;const dt=Math.min(.05,(now-last)/1000);last=now;padEdges();netSync(now);  /* capSkip: the frame cap (ui/fpsmeter.js) */
 const a=drawA=LOOP.advance(dt,GS.paused,tScale,GSPD);  // slow-mo steps every frame by a smaller dt, so nothing stutters
 const rp=rpFrame(dt,now);if(rp)rpIn();else{IP.begin(a);gunsLerp(a)}  // a goal replay / kill cam draws recorded state instead (render/replay.js)
 visuals(rp?rpDt():GS.paused?0:dt*GS.timeScale*GSPD,now);llDraw();updateCam(dt,now);hud();llHudFrame();if(rp)rpOut();else{IP.end();gunsBack()}modeHud(now);  // per-frame UI of the modes and overlays (ui/lab.js, ui/training.js)
 if(GS.menuOpen)menuPad();if(!$('mod').hidden&&!$('paner').hidden)drawRates();netSend(now);draw();if(rp)rpVis();if(++nF%30===0)keepPrograms()}  // keepPrograms: compiled shaders stay for the session (render/renderer.js)
// boot, in v15's order (Rapier's WASM is inlined; it initialises before the first drone is built)
initPhysics().then(()=>{
rpInit();initMenu();initCalib();initModPanel();
renderPresets();applyTune();syncMod();setMap(S.map);setBall(S.ball);
initRates();initSens();initLab();initGarage();initTraining();initProfile();initTournament();TN.tick=tick;syncRates();  /* TN.tick: a simulated tournament match steps through the same tick (snapshot + step), so it draws right */
setGame(GS.GM);startDemo();requestAnimationFrame(frame);
// first-use work ahead, in idle time while the menu's demo runs (render/warm.js): every shader of the scene as it is (goal explosion, replay
// and kill-cam effects included), the outdoor maps' shared textures, the Garage, the Highlands
warmQueue('shaders',()=>compileFor(scene));warmQueue('outdoor textures',warmOutdoor);warmQueue('garage',warmGarage);warmQueue('highlands',buildDF);warmQueue('highlands colliders',warmDFPhys);warmQueue('highlands shaders',()=>warmLook('df'));
warmIdle(()=>GS.menuOpen&&GS.demo&&!GS.net&&!document.hidden);
connectRoom()});
// read-only snapshot for tools/smoke.mjs; nothing in the game reads it
window.__dl={bind:()=>calib?{i:calib.i,sub:calib.sub,ph:calib.D?.ph||null,done:!!calib.done}:null,snap:()=>({state:GS.state,OBSON:GS.OBSON,demo:GS.demo,clock:GS.clock,score:[...GS.score],ball:ball.p.toArray(),drones:GS.drones.map(d=>({key:d.key,team:d.team,bot:d.bot,dead:d.dead,p:d.p.toArray(),lo:d.lo.ids.join('/')}))}),lab:labSnap,garageView,cosInfo,train:trainSnap,prof:profSnap,replay:rpState,tourn:tournSnap,
 view:()=>{const P=m=>{const e=m.matrixWorld.elements;return[e[12],e[13],e[14]]},e=camera.matrixWorld.elements,o={t:simT-(1-drawA)/120,cam:P(camera),camU:[e[4],e[5],e[6]],camF:[-e[8],-e[9],-e[10]]};if(ballMesh.visible)o.ball=P(ballMesh);for(const d of GS.drones)if(d.mesh&&d.mesh.visible&&!d.dead)o[d.key]=P(d.mesh);return o},gl:()=>({scene,camera,renderer,composer,setRS}),dbg:()=>({GS,S,ball,scene,renderer,goal,endMatch,warmLeft})};  // tools/glitch-check.mjs: drawn positions; dbg: the live objects, for tools/qa-sweep.mjs (deep NaN scan, scene child counts, forcing a goal or the end)
