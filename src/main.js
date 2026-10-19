// Drone League entry point: loads the modules in v15's section order (so the scene is built in the same order), boots, runs the loop.
import './config/constants.js';import './scratch.js';import './config/settings.js';import './config/tune.js';import './flight/rates.js';
import {llDraw,llHudFrame} from './modes/longline.js';
import './render/renderer.js';import './world/arena.js';import './world/maps.js';import './render/particles.js';import './audio/audio.js';
import './physics/sdf.js';import './physics/ball.js';import './render/ball.js';import './world/orbs.js';import './render/drone-mesh.js';import './flight/drone.js';
import './flight/attitude.js';import './input/input.js';import './bots/league.js';import './world/highlands.js';import './modes/dogfight.js';import './modes/guns.js';
import './bots/dogfight.js';import './state.js';import './modes/match.js';import './net/net.js';import './modes/step.js';import './render/camera.js';import './ui/hud.js';
import './render/visuals.js';import './ui/menu.js';import './input/calibration.js';import './ui/modpanel.js';import './ui/rates.js';import './ui/sens.js';import './ui/garage.js';import './net/p2p.js';import './modes/registry.js';import './modes/league.js';import './modes/freeplay.js';import './modes/lab.js';import './ui/lab.js';
import {$,QT,V3} from './config/constants.js';
import {initPhysics} from './physics/world.js';
import {S} from './config/settings.js';
import {GSPD,applyTune} from './config/tune.js';
import {initCalib} from './input/calibration.js';
import {padEdges} from './input/input.js';
import {setGame} from './modes/dogfight.js';
import {startDemo} from './modes/match.js';
import {step} from './modes/step.js';
import {connectRoom,netSend,netSync} from './net/net.js';
import {ball} from './physics/ball.js';
import {setBall} from './render/ball.js';
import {updateCam} from './render/camera.js';
import {draw} from './render/renderer.js';
import {visuals} from './render/visuals.js';
import {GS} from './state.js';
import {hud} from './ui/hud.js';
import {initMenu,menuPad} from './ui/menu.js';
import {initModPanel,renderPresets,syncMod} from './ui/modpanel.js';
import {drawRates,initRates,syncRates} from './ui/rates.js';
import {initSens} from './ui/sens.js';
import {labSnap} from './modes/lab.js';
import {initLab,labFrame} from './ui/lab.js';
import {garageView,initGarage} from './ui/garage.js';
import {setMap} from './world/maps.js';
// ---------- main loop ----------
// fixed 120 Hz simulation (timeScale / Game speed change how much sim time a frame covers; pause runs none), rendered between
// the last two ticks: each frame draws drones and the ball at alpha = leftover/DT of the way from the previous tick to the current one.
let last=performance.now(),acc=0;const DT=1/120,_ip=[];
const BODIES=()=>[ball,...GS.drones.filter(d=>!d.remote)];  // remote drones are smoothed by visuals() from network state
function tick(dt){for(const o of BODIES()){(o._pp||(o._pp=new V3())).copy(o.p);(o._pq||(o._pq=new QT())).copy(o.q)}step(dt)}
function lerpIn(a){_ip.length=0;for(const o of BODIES()){if(!o._pp||o._pp.distanceToSquared(o.p)>400)continue;const q=o.q.clone();_ip.push(o,o.p.clone(),q);o.p.lerpVectors(o._pp,o.p,a);o.q.slerpQuaternions(o._pq,q,a)}}  // slerpQuaternions(a,b) copies a into itself first, so b must not be o.q (that froze the rendered attitude a tick behind)
function lerpOut(){for(let i=0;i<_ip.length;i+=3){_ip[i].p.copy(_ip[i+1]);_ip[i].q.copy(_ip[i+2])}_ip.length=0}
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;padEdges();netSync(now);
 if(!GS.paused){if(GS.timeScale<1){let r=Math.min(dt,.05)*GS.timeScale*GSPD;while(r>1e-6){const h=Math.min(DT,r);tick(h);r-=h}acc=0}else{acc+=dt*GS.timeScale*GSPD;let n=0;while(acc>=DT&&n++<12){tick(DT);acc-=DT}}}  // slow-mo steps every frame by a smaller dt, so nothing stutters
 lerpIn(GS.timeScale<1?1:Math.min(1,acc/DT));visuals(GS.paused?0:dt*GS.timeScale*GSPD,now);llDraw();updateCam(dt,now);hud();llHudFrame();lerpOut();labFrame(now);
 if(GS.menuOpen)menuPad();if(!$('mod').hidden&&!$('paner').hidden)drawRates();netSend(now);draw()}
// boot, in v15's order (Rapier's WASM is inlined; it initialises before the first drone is built)
initPhysics().then(()=>{
initMenu();initCalib();initModPanel();
renderPresets();applyTune();syncMod();setMap(S.map);setBall(S.ball);
initRates();initSens();initLab();initGarage();syncRates();
setGame(GS.GM);startDemo();requestAnimationFrame(frame);
connectRoom()});
// read-only snapshot for tools/smoke.mjs; nothing in the game reads it
window.__dl={snap:()=>({state:GS.state,OBSON:GS.OBSON,demo:GS.demo,clock:GS.clock,score:[...GS.score],ball:ball.p.toArray(),drones:GS.drones.map(d=>({key:d.key,team:d.team,bot:d.bot,dead:d.dead,p:d.p.toArray(),lo:d.lo.ids.join('/')}))}),lab:labSnap,garageView};
