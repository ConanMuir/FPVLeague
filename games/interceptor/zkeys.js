/* Which key does what: the keyboard / mouse side of the controller panel's four switch rows (engine/input.js mountSwitches). S.keys = {row: code}, a
   KeyboardEvent.code ('KeyF') or a mouse button ('Mouse2'); KEYDEF holds the keys the game always had. Left mouse stays a detonate button on top of the bound key.
   The panel refuses every key the rest of the game reads (USED: the flight keys, the camera / radar / relaunch keys, the perks, the harden / evacuate / decoy keys,
   the swarm and base-screen digits, Enter, Esc, the debug keys, the browser's own); add a key there whenever the game starts reading one. Every line of text that names
   one of the four keys asks kl() (or fireWith / fireList for the detonate button), so the menu, the guide and the briefings show what is actually bound.
   Pure data and text: no page needed (zcampaign.js is imported by Node harnesses too). Harness: tools/zombies-test.mjs "keys". */
import {S} from '../../engine/settings.js';
import {keyLabel,okCode} from '../../engine/keys.js';
export const KEYDEF={fire:'KeyF',tiltSw:'KeyL',thermSw:'KeyH',nextSw:'KeyN'};
const USED=new Map(Object.entries({KeyW:'Throttle up',KeyS:'Throttle down',KeyA:'Yaw left',KeyD:'Yaw right',ArrowUp:'Pitch',ArrowDown:'Pitch',ArrowLeft:'Roll',ArrowRight:'Roll',
 KeyC:'Camera',KeyV:'Radar range',KeyR:'Relaunch',KeyM:'Flight mode',KeyT:'Mod panel',KeyP:'Pause',Escape:'Menu',
 KeyQ:'Freeze',KeyE:'Mark',KeyX:'Air strike',KeyZ:'Lure',KeyJ:'Harden',KeyK:'Evacuate',KeyU:'Decoy',KeyB:'Music',KeyY:'Strategic radar',
 Enter:'Sortie finish',NumpadEnter:'Sortie finish',F8:'Debug panel',F9:'Debug mark',F10:'Debug report',
 Tab:'the browser',ControlLeft:'the browser',ControlRight:'the browser',AltLeft:'the browser',AltRight:'the browser',MetaLeft:'the browser',MetaRight:'the browser',
 CapsLock:'the browser',NumLock:'the browser',ScrollLock:'the browser',Pause:'the browser',PrintScreen:'the browser',ContextMenu:'the browser'}));
for(let i=1;i<=9;i++)USED.set('Digit'+i,'Swarm, base tabs');
for(let i=1;i<=5;i++)USED.set('Numpad'+i,'Swarm');
for(let i=1;i<=12;i++)if(!USED.has('F'+i))USED.set('F'+i,'the browser');
/* what already uses a code (a name for the refusal), or '' when the row may take it; the left mouse button is Detonate's, so only that row may be bound to it, and the side buttons are the browser's (back, forward) */
export const reserved=(c,row)=>c==='Mouse0'?row==='fire'?'':'Detonate':/^Mouse[3-9]$/.test(c)?'the browser':USED.get(c)||'';
/* the saved bindings, made safe: a missing, odd, reserved or doubled one goes back to the key it had, and if that makes two rows share a key they all do */
export function cleanKeys(o){const r={};for(const k in KEYDEF){const c=o&&typeof o==='object'?o[k]:null;r[k]=okCode(c)&&!reserved(c,k)?c:KEYDEF[k]}
 return new Set(Object.values(r)).size===Object.keys(r).length?r:{...KEYDEF}}
/* the label of a row's bound key, for any line of text */
export const kl=k=>keyLabel(S.keys?.[k]||KEYDEF[k]);
/* the detonate button for a sentence: 'F or click' ('a click' when left mouse is the bound button); wrap(label) can mark the label up */
export const fireWith=(wrap=x=>x)=>(S.keys?.fire||KEYDEF.fire)==='Mouse0'?'a click':`${wrap(kl('fire'))} or click`;
/* the same for a list: 'F, click' ('click' alone for left mouse) */
export const fireList=()=>(S.keys?.fire||KEYDEF.fire)==='Mouse0'?'click':`${kl('fire')}, click`;
/* the menu's key list (index.html): the four rows' <kbd> cells follow the bindings */
export function paintKeys(){const f=id=>document.getElementById(id);for(const k in KEYDEF){const e=f('kk_'+k);if(e)e.textContent=k==='fire'&&(S.keys?.fire||KEYDEF.fire)!=='Mouse0'?kl(k)+' / click':kl(k)}}
