// ---------- game modes and overlays: the registry and the mode lifecycle ----------
// Every game mode registers itself here from its own file in src/modes/. The menu's mode buttons, the saved-setting check,
// the online lobby label and setGame() all read this list, and the core loop (modes/step.js), the HUD, input and net code reach
// the mode only through the hooks below, so adding a mode is one new file plus one import line in main.js (docs/ARCHITECTURE.md).
// def (everything optional except name/title/sub):
//  name: menu button + lobby label   title: big menu heading   sub: menu blurb   order: button position   hidden: no menu button
//  world: 'arena' (pitch, ball, goals, orbs on the pitch) | 'highlands' (Dogfight terrain, guns, turrets, orbs over the valley; GS.OBSON)
//  free: no match clock, one pilot and no bots (Freeplay, Training); the HUD clock reads FREEPLAY
//  allowGoals: the ball scores in the goals (default true)   allowReset: R / Xbox Y respawns you (default = free)
//    (flags may be functions, read when needed)
//  enter({prev}) / exit(next): the lifecycle, run by setGame() (modes/dogfight.js) when the mode changes, exit before the world swaps
//  pre(dt): start of each 1/120 s step; return true to take the step over (only the Rapier step runs after it)
//  post(dt): end of each step, after touches and goals      tick(dt, auth): mode simulation after the drones move (guns, turrets)
//  bot(d, dt): bot controller (default bots/league.js)      pilot(d, dt): after the local pilot's controls are read (fire button)
//  droneTick(d, dt, auth): per local drone after the Rapier step
//  hud(now, active): every rendered frame, for every mode and overlay that has one, active or not (so it can hide its UI)
//  net: {pilot(P, me) every pilot's own packet, host(g) the host's game state, joiner(P) a joiner's packet,
//        fromHost(g) a joiner reads the host's state, fromPeer(pr, d, peer) the host reads a pilot's packet}
// Overlays (registerOverlay) sit on top of whatever mode is set while on() is true (the Calibration Lab switches League / Freeplay
// underneath). They take the same hooks; their pre / post run before the mode's, and a flag they define wins over the mode's.
// Overlay-only flags: fixedCam (C doesn't cycle the camera), fixedFlightMode (M doesn't toggle acro / angle).
import {GS} from '../state.js';
export const MODES={},OVERLAYS=[];
export function registerMode(id,def){return MODES[id]={id,order:99,world:'arena',allowGoals:true,allowReset:!!def.free,...def}}
export function registerOverlay(id,def){const o={id,on:()=>false,...def};OVERLAYS.push(o);return o}
export const modeList=()=>Object.values(MODES).sort((a,b)=>a.order-b.order);
export const modeId=id=>typeof id==='string'&&Object.hasOwn(MODES,id)?id:'league';  // unknown or untrusted ids fall back to League
// the mode in play, and the overlay that is on (or null)
export const curMode=()=>MODES[GS.GM]||MODES.league;
export function overlay(){for(let i=0;i<OVERLAYS.length;i++)if(OVERLAYS[i].on())return OVERLAYS[i];return null}
// a flag (allowGoals, allowReset, fixedCam, ...): the overlay's if it sets one, else the mode's; function flags are called
export function modeFlag(k){const o=overlay(),v=o&&o[k]!==undefined?o[k]:curMode()[k];return typeof v==='function'?v():v}
// lifecycle, run by setGame(): exit() of the mode being left, setup(M) (the world swap), then enter() of the new mode (also on the
// first setGame at boot). Setting the mode that is already on runs only setup.
let cur=null;
export function switchMode(id,setup){const M=MODES[modeId(id)],was=cur,ch=was!==M;if(ch&&was&&was.exit)was.exit(M);setup(M);if(ch){cur=M;if(M.enter)M.enter({prev:was})}return M}
// UI modules (ui/lab.js, ui/training.js) attach their per-frame hud hook to the mode / overlay their modes/ file registered
export function addHud(id,fn){const t=MODES[id]||OVERLAYS.find(o=>o.id===id);if(!t)throw new Error('no mode or overlay '+id);t.hud=fn}
export function modeHud(now){const o=overlay(),m=curMode();for(let i=0;i<OVERLAYS.length;i++){const x=OVERLAYS[i];if(x.hud)x.hud(now,x===o)}for(const k in MODES){const x=MODES[k];if(x.hud)x.hud(now,x===m)}}
