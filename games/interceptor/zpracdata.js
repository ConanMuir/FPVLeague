// Zombies boss practice, the pure side (no three.js, no DOM, so the harness imports it too): the default scenario, how a boss's `practice` descriptor merges over it,
// what the placed kit costs, the saved best times and how a time reads. zpractice.js is the game side.
// Save: S.zprac = {v:1, b:{id:{t:[best seconds on each difficulty, 0 = none], w:wins}}}, cleaned on every read.
import {ITEMS,PERK,ZDIFF} from './zdata.js';
import {SW} from './zswdata.js';
import {KNOWN} from './zcodex.js';
/* what a boss gets unless its descriptor says otherwise (the descriptor is documented in zbosses.js); a kit entry is [helper, position name] */
export const DEF={wave:12,lead:8,R:2600,lives:3,kit:[['rack','substation north'],['flak','fuel depot north'],['gepard','apartments north']],more:[],perks:{},stream:null,radio:''};
/* the scenario of a descriptor: the defaults under it, the extra kit (`more`) appended to the kit */
export function merge(d){const o={...DEF,...d};o.kit=[...o.kit,...(o.more||[])];o.perks={...o.perks};return o}
/* what the placed kit and the loadout cost (and the personal swarm's first deployment): the purse a practice run starts with, so it can rebuild what was placed and no more */
export function cost(o){let c=0;for(const[t]of o.kit)c+=ITEMS[t]?.price|0;for(const[k,l]of Object.entries(o.perks))for(let i=0;i<l;i++)c+=PERK[k]?.cost[i]|0;if(o.perks.swarm)c+=(SW.n[Math.min(5,o.perks.swarm|0)]|0)*SW.upkeep;return c}

export const PRAC_V=1,MAXT=3600;
/* any value in, a valid record out; unknown ids and wrong types are dropped, a time is a number from 0.1 s to an hour */
export function cleanPrac(c,ids=KNOWN){const o={v:PRAC_V,b:{}};if(!c||typeof c!=='object'||Array.isArray(c)||c.v!==PRAC_V||!c.b||typeof c.b!=='object'||Array.isArray(c.b))return o;
 for(const id of ids){if(typeof id!=='string'||!Object.hasOwn(c.b,id))continue;const e=c.b[id];if(!e||typeof e!=='object'||Array.isArray(e))continue;
  const t=ZDIFF.map((_,i)=>{const v=Array.isArray(e.t)?e.t[i]:0;return typeof v==='number'&&v>=.1&&v<=MAXT?Math.round(v*10)/10:0}),w=Number.isInteger(e.w)&&e.w>0&&e.w<=99999?e.w:0;
  if(t.some(Boolean)||w)o.b[id]={t,w}}
 return o}
/* 48.3 s, 1:12.4 */
export const fmtT=s=>{s=Math.round(Math.max(0,+s||0)*10)/10;const m=Math.floor(s/60),r=s-m*60;return m?`${m}:${r.toFixed(1).padStart(4,'0')}`:`${r.toFixed(1)} s`};
