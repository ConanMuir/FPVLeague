// ---------- human input ----------
import {$,cl} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {BZ,HOV} from '../config/tune.js';
import {rate,stk,thrCurve} from '../flight/rates.js';
import {calib} from './calibration.js';
import {BTN,PAIR,RADIO,acroCmd,angleCmd,kbEase,pad,padBlocked,padX,pick,stickThr} from './sticks.js';
import {showMenu} from '../modes/match.js';
import {GS,SB} from '../state.js';
import {modeFlag} from '../modes/registry.js';
import {banner} from '../ui/hud.js';
import {syncUI} from '../ui/menu.js';
import {toggleMod} from '../ui/modpanel.js';
export const keys={},ks={y:0,p:0,r:0};export let kbThr=HOV,prevBtn=[],mouseFire=false;
// RC radio support: auto-detect + guided calibration (finds axis, centre, range and direction per channel). Detection (RADIO, pad,
// padX: Xbox-style pad with its own calibration profile, so a radio's stays untouched) is the shared stick code, ./sticks.js
export {BTN,PAIR,RADIO,pad,padBlocked,padX};
export const CAL=()=>padX?S.xcal:S.cal,thrFull=()=>padX?CAL()[0].m!=='spring':S.thrMode==='full';
// OV: temporary deadband/assist values (the Calibration Lab's working copy); they win over S while set, so nothing half-tuned is saved
export const OV={},dzOf=i=>i===1?OV.dzy??S.dzy??OV.dz??S.dz:OV.dz??S.dz,assist=()=>OV.assist??S.assist??0;
// sources 0-99 are axes, 100+ are buttons/triggers (analog 0..1; a digital button that reports value 0 while pressed counts as 1).
// r: rest of an axis trigger, used until that axis first reports a non-zero value (some browsers read 0 until the first press).
const seen={};
const src=(g,a,f=0,r)=>{if(a>=100){const b=g.buttons[a-100];return b?(+b.value||(b.pressed?1:0)):f}const v=g.axes[a];if(v==null)return f;if(v!==0)seen[a]=1;return r!=null&&!seen[a]?r:v};
// calibrated channel before the deadband: (raw - centre) / signed half-range, so direction is baked in, minus the other direction's
// control for one-way inputs (b: paired button, nb: any channel)
export const axr=(g,i)=>{const c=CAL()[i];return(src(g,c.a,c.c,c.r)-c.c)/(c.s||1)-(c.b!=null?src(g,100+c.b):0)-(c.nb?(src(g,c.nb.a,c.nb.c,c.nb.r)-c.nb.c)/(c.nb.s||1):0)};
export const axv=(g,i)=>{const v=axr(g,i);return cl(Math.abs(v)<dzOf(i)?0:v,-1,1)};
// a fire / flip / boost binding: button index, 'aN' (axis above +0.5) or 'aN-' (below -0.5); null if that input doesn't exist on this pad
export function btnOn(g,b){if(b==null||b===-1||!g)return null;if(typeof b==='string'){const v=g.axes[parseInt(b.slice(1))];return v==null?null:b.endsWith('-')?v<-.5:v>.5}
 const x=g.buttons[b];return x?!!(x.pressed||x.value>.5):false}
const ss=[0,0,0];
// acro: force Acro whatever S.mode says (the Calibration Lab tunes acro rates). The stick maths (stickThr, kbEase, pick, acroCmd,
// angleCmd) is the shared stick code, ./sticks.js, which Riley's games use too
export function humanControl(d,dt,acro){const g=pad(),bz=SB()?BZ:0;let thr=null,yaw=0,pit=0,rol=0;
 if(g&&!calib){const t=axv(g,0);
  const hv=HOV*(1-bz);thr=stickThr(t,thrFull(),hv);yaw=axv(g,1);pit=axv(g,2);rol=axv(g,3)}
 const k=c=>keys[c]?1:0;
 ks.y=kbEase(ks.y,k('KeyD')-k('KeyA'),dt);ks.p=kbEase(ks.p,k('ArrowUp')-k('ArrowDown'),dt);ks.r=kbEase(ks.r,k('ArrowRight')-k('ArrowLeft'),dt);
 const kt=k('KeyW')-k('KeyS');kbThr+=((kt>0?(bz?.95:1):kt<0?0:HOV*(1-bz))-kbThr)*Math.min(1,dt*10);if(thr===null||kt)thr=kbThr;
 yaw=pick(yaw,ks.y);pit=pick(pit,ks.p);rol=pick(rol,ks.r);
 // assist (0..1, off by default; the Lab's Default preset may use some): stick smoothing up to 70 ms, plus a Horizon-style
 // self-level blend that fades out as the roll/pitch stick moves away from centre
 const as=assist();if(as>0){const f=1-Math.exp(-dt/(as*.07));ss[0]+=(rol-ss[0])*f;ss[1]+=(pit-ss[1])*f;ss[2]+=(yaw-ss[2])*f;rol=ss[0];pit=ss[1];yaw=ss[2]}else{ss[0]=rol;ss[1]=pit;ss[2]=yaw}
 stk[3]=cl(thr,0,1);d.thr=thrCurve(Math.min(1,stk[3]/(1-bz||1)));d.boosting=bz>0&&stk[3]>1-bz+1e-4||SB()&&!!(keys.ShiftLeft||keys.ShiftRight||keys.Space||g&&btnOn(g,padX?S.xboost:S.boostBtn));
 stk[0]=rol;stk[1]=pit;stk[2]=yaw;if(S.mode==='acro'||acro)acroCmd(d,rate,rol,pit,yaw);  // Acro holds whatever attitude you leave it in: no self-level (assist only smooths the sticks)
 else angleCmd(d,rate,rol,pit,yaw,dt);  // Angle: self-levels, the heading follows the yaw stick only
 const fl=flipIn();if(fl&&!flipPrev&&!d.tryPop(stk))d.flipUp();flipPrev=fl}  // flip button: spend a pop if one is held and a direction is in, else flip back over
let flipPrev=false;const flipIn=()=>{if(keys.KeyE)return true;const g=pad();return!!btnOn(g,padX?S.xflip:S.flipBtn)};

// ---------- input events ----------
function cycleCam(){if(modeFlag('fixedCam'))return;GS.camMode=(GS.camMode+1)%3;S.cam=GS.camMode;save()}  // the Lab is FPV only
function togglePause(){if(GS.demo||!$('sens').hidden||!$('bind').hidden)return;showMenu(!GS.menuOpen)}  /* P / the pad's menu button leave a paused match alone while the sensitivity or controls dialog is open */
addEventListener('keydown',e=>{if(e.target.matches?.('textarea,input:not([type=range]):not([type=checkbox])'))return;if(e.code==='KeyT'&&!e.repeat){toggleMod();return}keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&!GS.menuOpen)e.preventDefault();if(e.repeat)return;
 if(e.code==='Escape'||e.code==='KeyP')togglePause();if(GS.menuOpen)return;
 if(e.code==='KeyC')cycleCam();if(e.code==='KeyM'&&!modeFlag('fixedFlightMode')){S.mode=S.mode==='acro'?'angle':'acro';save();syncUI();banner(S.mode.toUpperCase(),'',.8)}if(e.code==='KeyR'&&canReset())GS.player.spawn();if(e.code==='KeyO'){S.osd=!S.osd;save();syncUI();banner('OSD '+(S.osd?'ON':'OFF'),'',.8)}});
addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>{for(const k in keys)keys[k]=false;mouseFire=false});
addEventListener('mousedown',e=>{if(e.button===0&&!GS.menuOpen&&!e.target.closest?.('#mod,#menu,#lab,#bind,button,input,select,textarea'))mouseFire=true});addEventListener('mouseup',e=>{if(e.button===0)mouseFire=false});
// gamepad shortcut buttons (Menu pause, LB camera, Y respawn) skip any button bound to flight, fire, flip or boost
export function padEdges(){const g=pad();if(!g||RADIO.test(g.id))return;const u=new Set();if(padX){for(const c of S.xcal){if(c.a>=100)u.add(c.a-100);if(c.b!=null)u.add(c.b);if(c.nb?.a>=100)u.add(c.nb.a-100)}
  for(const b of[S.xfire,S.xflip,S.xboost,S.lookBtn])if(typeof b==='number'&&b>=0)u.add(b)}
 const b=g.buttons.map(x=>x.pressed),e=i=>b[i]&&!prevBtn[i]&&!u.has(i);
 if(e(9)&&!calib)togglePause();if(!GS.menuOpen&&!GS.demo){if(e(4))cycleCam();if(e(3)&&canReset())GS.player.spawn()}prevBtn=b}
// reset (R / Xbox Y) only in Freeplay; in matches you fly yourself out of trouble
const canReset=()=>!!(GS.player&&GS.player.dead<=0&&!GS.demo&&modeFlag('allowReset'));
