// Drone League entry point: loads the modules in v15's section order (so the scene is built in the same order), boots, runs the loop.
import './config/constants.js';import './scratch.js';import './config/settings.js';import './config/tune.js';import './flight/rates.js';
import './render/renderer.js';import './world/arena.js';import './world/maps.js';import './render/particles.js';import './audio/audio.js';
import './physics/sdf.js';import './physics/ball.js';import './render/ball.js';import './world/orbs.js';import './render/drone-mesh.js';import './flight/drone.js';
import './flight/attitude.js';import './input/input.js';import './bots/league.js';import './world/highlands.js';import './modes/dogfight.js';import './modes/guns.js';
import './bots/dogfight.js';import './state.js';import './modes/match.js';import './net/net.js';import './modes/step.js';import './render/camera.js';import './ui/hud.js';
import './render/visuals.js';import './ui/menu.js';import './input/calibration.js';import './ui/modpanel.js';import './ui/rates.js';import './ui/sens.js';import './net/p2p.js';
import {$} from './config/constants.js';
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
import {composer} from './render/renderer.js';
import {visuals} from './render/visuals.js';
import {GS} from './state.js';
import {hud} from './ui/hud.js';
import {initMenu,menuPad} from './ui/menu.js';
import {initModPanel,renderPresets,syncMod} from './ui/modpanel.js';
import {drawRates,initRates,syncRates} from './ui/rates.js';
import {initSens} from './ui/sens.js';
import {setMap} from './world/maps.js';
// ---------- main loop ----------
let last=performance.now(),acc=0;const DT=1/120;
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;padEdges();netSync(now);
 if(!GS.paused){acc+=dt*GS.timeScale*GSPD;let n=0;while(acc>=DT&&n++<12){step(DT);acc-=DT}}
 visuals(GS.paused?0:dt*GS.timeScale*GSPD,now);updateCam(dt,now);hud();if(GS.menuOpen)menuPad();if(!$('mod').hidden&&!$('paner').hidden)drawRates();netSend(now);composer.render()}
// boot, in v15's order
initMenu();initCalib();initModPanel();
renderPresets();applyTune();syncMod();setMap(S.map);setBall(S.ball);
initRates();initSens();syncRates();
setGame(GS.GM);startDemo();requestAnimationFrame(frame);
connectRoom();
// read-only snapshot for tools/smoke.mjs; nothing in the game reads it
window.__dl={snap:()=>({state:GS.state,OBSON:GS.OBSON,demo:GS.demo,clock:GS.clock,score:[...GS.score],ball:ball.p.toArray(),drones:GS.drones.map(d=>({key:d.key,team:d.team,bot:d.bot,dead:d.dead,p:d.p.toArray()}))})};
