// ---------- human input ----------
import {UP,V3,cl} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {BZ,HOV} from '../config/tune.js';
import {attitude} from '../flight/attitude.js';
import {wrapA} from '../flight/drone.js';
import {rate,stk,thrCurve} from '../flight/rates.js';
import {calib} from './calibration.js';
import {showMenu} from '../modes/match.js';
import {_f,_v} from '../scratch.js';
import {GS,SB} from '../state.js';
import {banner} from '../ui/hud.js';
import {syncUI} from '../ui/menu.js';
import {toggleMod} from '../ui/modpanel.js';
export const keys={},ks={y:0,p:0,r:0};export let kbThr=HOV,prevBtn=[],mouseFire=false;
// RC radio support: auto-detect + guided calibration (finds axis, centre, range and direction per channel)
export const RADIO=/edgetx|opentx|radiomaster|frsky|taranis|jumper|tbs|tango|mambo|boxer|zorro|spektrum|betafpv|literadio|flysky|ethos|stm32|dji|interlink|realflight|usb joystick/i;
export const PAIR={4:5,5:4,6:7,7:6};  // a bumper or trigger on yaw/pitch/roll gets its partner for the other direction
export let padBlocked=false;
export let padX=false;  // Xbox-style gamepad: its own calibration profile, so a radio's stays untouched
const isX=g=>!RADIO.test(g.id)&&(g.mapping==='standard'||/xbox|xinput|045e/i.test(g.id));
export const pad=()=>{let ps=[];try{ps=navigator.getGamepads?navigator.getGamepads():[]}catch(e){padBlocked=true}let best=null;for(const g of ps)if(g&&g.connected&&(!best||(g.timestamp||0)>(best.timestamp||0)))best=g;if(best)padX=isX(best);return best};
export const CAL=()=>padX?S.xcal:S.cal,thrFull=()=>padX?CAL()[0].m!=='spring':S.thrMode==='full',BTN=['A','B','X','Y','LB','RB','LT','RT','View','Menu','LS','RS','D-up','D-down','D-left','D-right','Xbox'];
// sources 0-99 are axes, 100+ are buttons/triggers (analog 0..1); b = paired button pulling the other way (RB/LB, RT/LT)
const src=(g,a,f=0)=>a>=100?(g.buttons[a-100]?.value??f):(g.axes[a]??f);
// calibrated channel: (raw - centre) / signed half-range, so direction is baked in
export const axv=(g,i)=>{const c=CAL()[i],v=(src(g,c.a,c.c)-c.c)/(c.s||1)-(c.b!=null?src(g,100+c.b):0);return cl(Math.abs(v)<S.dz?0:v,-1,1)};
const _r=new V3();
export function humanControl(d,dt){const g=pad(),bz=SB()?BZ:0;let thr=null,yaw=0,pit=0,rol=0;
 if(g&&!(GS.menuOpen&&calib)){const t=axv(g,0);
  const hv=HOV*(1-bz);thr=thrFull()?(t+1)/2:(t>=0?hv+t*(1-hv):hv*(1+t));yaw=axv(g,1);pit=axv(g,2);rol=axv(g,3)}
 const k=c=>keys[c]?1:0,sm=(c,t)=>c+(t-c)*Math.min(1,dt*(t?14:22));
 ks.y=sm(ks.y,k('KeyD')-k('KeyA'));ks.p=sm(ks.p,k('ArrowUp')-k('ArrowDown'));ks.r=sm(ks.r,k('ArrowRight')-k('ArrowLeft'));
 const kt=k('KeyW')-k('KeyS');kbThr+=((kt>0?(bz?.95:1):kt<0?0:HOV*(1-bz))-kbThr)*Math.min(1,dt*10);if(thr===null||kt)thr=kbThr;
 const pick=(a,b)=>Math.abs(b)>Math.abs(a)?b:a;yaw=pick(yaw,ks.y);pit=pick(pit,ks.p);rol=pick(rol,ks.r);
 stk[3]=cl(thr,0,1);d.thr=thrCurve(Math.min(1,stk[3]/(1-bz||1)));d.boosting=bz>0&&stk[3]>1-bz+1e-4||SB()&&!!(keys.ShiftLeft||keys.ShiftRight||keys.Space);
 stk[0]=rol;stk[1]=pit;stk[2]=yaw;if(S.mode==='acro')d.wt.set(-rate(1,pit),-rate(2,yaw),-rate(0,rol));
 else{const f=_f.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<.01){f.set(0,-1,0).applyQuaternion(d.q);f.y=0}if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();
  const ch=Math.atan2(-f.x,-f.z);if(d.hd==null||Math.abs(wrapA(d.hd-ch))>1.2)d.hd=ch;d.hd=wrapA(d.hd-rate(2,yaw)*.7*dt);f.set(-Math.sin(d.hd),0,-Math.cos(d.hd));  // heading follows the yaw stick only
  const r=_r.crossVectors(f,UP),T=1.5;const u=_v.copy(UP).addScaledVector(f,pit*T).addScaledVector(r,rol*T).normalize();attitude(d,u,f,16,18,1);d.wt.y-=rate(2,yaw)*.7}
 const fl=flipIn();if(fl&&!flipPrev)d.flipUp();flipPrev=fl}
let flipPrev=false;const flipIn=()=>{if(keys.KeyE)return true;const g=pad(),b=padX?S.xflip:S.flipBtn;if(!g||b===-1||b==null)return false;return typeof b==='string'?(g.axes[+b.slice(1)]??-1)>.5:!!g.buttons[b]?.pressed};

// ---------- input events ----------
function cycleCam(){GS.camMode=(GS.camMode+1)%3;S.cam=GS.camMode;save()}
function togglePause(){if(GS.demo)return;showMenu(!GS.menuOpen)}
addEventListener('keydown',e=>{if(e.target.matches?.('textarea,input:not([type=range]):not([type=checkbox])'))return;if(e.code==='KeyT'&&!e.repeat){toggleMod();return}keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&!GS.menuOpen)e.preventDefault();if(e.repeat)return;
 if(e.code==='Escape'||e.code==='KeyP')togglePause();if(GS.menuOpen)return;
 if(e.code==='KeyC')cycleCam();if(e.code==='KeyM'){S.mode=S.mode==='acro'?'angle':'acro';save();syncUI();banner(S.mode.toUpperCase(),'',.8)}if(e.code==='KeyR'&&GS.player&&GS.player.dead<=0)GS.player.spawn()});
addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>{for(const k in keys)keys[k]=false;mouseFire=false});
addEventListener('mousedown',e=>{if(e.button===0&&!GS.menuOpen&&!e.target.closest?.('#mod,#menu,button,input,select,textarea'))mouseFire=true});addEventListener('mouseup',e=>{if(e.button===0)mouseFire=false});
export function padEdges(){const g=pad();if(!g||RADIO.test(g.id))return;const u=new Set();if(padX)for(const c of S.xcal){if(c.a>=100)u.add(c.a-100);if(c.b!=null)u.add(c.b)}
 const b=g.buttons.map(x=>x.pressed),e=i=>b[i]&&!prevBtn[i]&&!u.has(i);
 if(e(9))togglePause();if(!GS.menuOpen&&!GS.demo){if(e(4))cycleCam();if(e(3)&&GS.player&&GS.player.dead<=0)GS.player.spawn()}prevBtn=b}
