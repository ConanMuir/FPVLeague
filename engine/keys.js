// Key bindings: S.keys[row] is the keyboard / mouse side of a controller-panel switch row, a KeyboardEvent.code ('KeyF', 'Space') or a mouse button
// ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right). The pure helpers live here, apart from input.js (which needs the page), so any module, and the Node
// harnesses that import a data table, can name a bound key without pulling the DOM in.
import {S} from './settings.js';
const NAME=new Map(Object.entries({Space:'Space',Escape:'Esc',Enter:'Enter',NumpadEnter:'Num Enter',Tab:'Tab',Backspace:'Backspace',Delete:'Del',Insert:'Ins',PageUp:'PgUp',PageDown:'PgDn',
 Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',IntlBackslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',
 NumpadAdd:'Num +',NumpadSubtract:'Num -',NumpadMultiply:'Num *',NumpadDivide:'Num /',NumpadDecimal:'Num .',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',
 ShiftLeft:'L Shift',ShiftRight:'R Shift',ControlLeft:'L Ctrl',ControlRight:'R Ctrl',AltLeft:'L Alt',AltRight:'R Alt',MetaLeft:'L Win',MetaRight:'R Win',CapsLock:'Caps',ContextMenu:'Menu',
 Mouse0:'LMB',Mouse1:'MMB',Mouse2:'RMB'}));
// a code as the short text the UI shows: 'KeyF' → 'F', 'Mouse2' → 'RMB', 'Space' → 'Space', 'Numpad4' → 'Num 4'
export const keyLabel=c=>{if(!okCode(c))return'None';if(NAME.has(c))return NAME.get(c);let m;if((m=/^Key([A-Z])$/.exec(c))||(m=/^Digit(\d)$/.exec(c)))return m[1];if((m=/^Numpad(\d)$/.exec(c)))return'Num '+m[1];
 return c.replace(/([a-z\d])([A-Z])/g,'$1 $2')};
// a code worth binding: the shape of a real KeyboardEvent.code or 'MouseN', capitalised so it can never be an inherited property of the keys map ('constructor', 'toString')
export const okCode=c=>typeof c==='string'&&/^[A-Z][A-Za-z0-9]{1,24}$/.test(c);
// whether a keydown (or a mouse button's stand-in event, input.js initInput) is the key a row is bound to
export const keyHit=(e,k)=>e.code===S.keys?.[k];
