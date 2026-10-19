// Menu settings grid: each game lists its fields ([key, label, 'sel', options] or [key, label, 'rng', min, max, step]); the pilot fields are shared
import {$} from './util.js';
import {S,save} from './settings.js';
import {syncPad} from './input.js';
export const PILOT_FIELDS=[['mode','Flight mode','sel',[['acro','Acro (rate)'],['angle','Angle (self-level)']]],
 ['tilt','Camera uptilt','rng',0,60,1,'°'],['fov','FPV field of view','rng',80,150,1,'°'],['thrMode','Throttle stick','sel',[['spring','Gamepad (centre = hover)'],['full','Radio (full range)']]],['dz','Stick deadband','rng',0,.15,.005]];
let FIELDS=[];
// onField(key) runs after a field changes (and is saved)
export function initMenu(fields,onField){FIELDS=fields;const setEl=$('set');
 for(const[k,lab,type,...o]of FIELDS){const l=document.createElement('label');l.textContent=lab;l.htmlFor='f_'+k;setEl.append(l);let inp;
  if(type==='sel'){inp=document.createElement('select');for(const[v,t]of o[0])inp.add(new Option(t,JSON.stringify(v)))}else{inp=document.createElement('input');inp.type='range';[inp.min,inp.max,inp.step]=o}
  inp.id='f_'+k;const out=document.createElement('output');out.id='o_'+k;setEl.append(inp,out);
  inp.addEventListener('input',()=>{S[k]=type==='sel'?JSON.parse(inp.value):+inp.value;save();syncUI();onField?.(k)})}}
export function syncUI(){for(const[k,,type]of FIELDS){const inp=$('f_'+k);inp.value=type==='sel'?JSON.stringify(S[k]):S[k];
 $('o_'+k).textContent=type==='rng'?(k==='tilt'||k==='fov'?S[k]+'°':(+S[k]).toFixed(2)):''}
 syncPad()}
