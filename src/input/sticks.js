// ---------- shared stick code: controller detection and the stick-to-command maths of every Drone League game ----------
// One copy for Jared's game (src/input/input.js) and Riley's (engine/input.js, engine/flight.js), like flight/core.js. Leaf module:
// it imports only the flight core and three, touches no DOM when loaded (pad() reads the Gamepad API when called), and runs in node.
// What stays with each game: its calibration format and deadband (axv), switch and button bindings, keyboard state, settings, and
// the Interceptor's own humanControl (fpv mix, 88° Angle, keyboard arming). docs/SHARED-ENGINE.md has the map.
import * as THREE from 'three';
import {attitude,wrapA} from '../flight/core.js';
const V3=THREE.Vector3,UP=new V3(0,1,0);
// RC radios and sim dongles (by gamepad id); anything else with the standard mapping, or an Xbox / XInput id, is an Xbox-style pad
export const RADIO=/edgetx|opentx|radiomaster|frsky|taranis|jumper|tbs|tango|mambo|boxer|zorro|spektrum|betafpv|literadio|flysky|ethos|stm32|dji|interlink|realflight|usb joystick/i;
export const PAIR={4:5,5:4,6:7,7:6};  // a bumper or trigger on yaw/pitch/roll gets its partner for the other direction
export const BTN=['A','B','X','Y','LB','RB','LT','RT','View','Menu','LS','RS','D-up','D-down','D-left','D-right','Xbox'];
const isX=g=>!RADIO.test(g.id)&&(g.mapping==='standard'||/xbox|xinput|045e/i.test(g.id));
// padX: the pad in use is Xbox-style (it gets its own calibration profile, so a radio's stays untouched); padBlocked: the page may not read gamepads
export let padBlocked=false,padX=false;
// the most recently used gamepad
export const pad=()=>{let ps=[];try{ps=navigator.getGamepads?navigator.getGamepads():[]}catch(e){padBlocked=true}let best=null;for(const g of ps)if(g&&g.connected&&(!best||(g.timestamp||0)>(best.timestamp||0)))best=g;if(best)padX=isX(best);return best};
// throttle stick t (-1..1) to throttle 0..1: full range, or sprung with the centre at hover hv
export const stickThr=(t,full,hv)=>full?(t+1)/2:(t>=0?hv+t*(1-hv):hv*(1+t));
// a keyboard stick c eases toward the keys' target t (-1, 0, 1), and back to centre faster
export const kbEase=(c,t,dt)=>c+(t-c)*Math.min(1,dt*(t?14:22));
// the stick or the keyboard, whichever is pushed further
export const pick=(a,b)=>Math.abs(b)>Math.abs(a)?b:a;
// Acro: the sticks are body rates; rate(axis, x) is the game's rates for the profile in use
export function acroCmd(d,rate,rol,pit,yaw){d.wt.set(-rate(1,pit),-rate(2,yaw),-rate(0,rol))}
// Angle: self-levelling. The heading (d.hd) follows the yaw stick only; pitch and roll tilt body up 1.5 per unit of stick from it
const _f=new V3(),_r=new V3(),_hv=new V3();
export function angleCmd(d,rate,rol,pit,yaw,dt){const f=_f.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<.01){f.set(0,-1,0).applyQuaternion(d.q);f.y=0}if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();
 const ch=Math.atan2(-f.x,-f.z);if(d.hd==null||Math.abs(wrapA(d.hd-ch))>1.2)d.hd=ch;d.hd=wrapA(d.hd-rate(2,yaw)*.7*dt);f.set(-Math.sin(d.hd),0,-Math.cos(d.hd));
 const r=_r.crossVectors(f,UP),T=1.5;const u=_hv.copy(UP).addScaledVector(f,pit*T).addScaledVector(r,rol*T).normalize();attitude(d,u,f,16,18,1);d.wt.y-=rate(2,yaw)*.7}
