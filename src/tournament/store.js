/* ---------- The saved tournament: localStorage 'droneleague.tournament', its own key with its own version (tv), loaded through the ---------- */
/* same versioned schema as the settings and the profile (config/schema.js): every field cleaned (a hand-edited or stale save never crashes),
   then TOURN_MIGRATIONS newer than the save's tv run once each and write it out. The save is the setup plus the results list; the live
   bracket is rebuilt from it (tournament/bracket.js replay), so nothing derived is stored. Pure: no DOM, node runs it (tools/tournament-check.mjs).
    tv        save version          setup   {format, size, team, len, pairing, mates, seed, entrants}   results  [{id, score: [a, b]}]
    started   when it was made (ms)
   A bot entrant is saved by its level name (lv), because the evolved levels (bots/evolved.js) can move in DIFF between builds; a save whose
   level no longer exists cannot resume and loads as none. Changing what an old save means: append {v: next, run(T)} to TOURN_MIGRATIONS. */
import {field,oneOf,runSchema,version} from '../config/schema.js';
import {FORMATS,LENS,PAIRINGS,SIZES} from './bracket.js';
export const TOURN_KEY='droneleague.tournament';
export const PILOTS=[{id:'p1',name:'You'},{id:'p2',name:'Player 2',hidden:true}];  /* p2: the slot exists, but src/input reads one pad and one keyboard map, so it is hidden until a second pilot's input exists */
export const SECOND_PILOT=false;
export const TOURN_MIGRATIONS=[{v:1,run:T=>{}}];  /* v1: the first saved form */
export const TOURN_V=TOURN_MIGRATIONS[TOURN_MIGRATIONS.length-1].v;
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:null,int=(v,lo,hi,d)=>Number.isInteger(v)&&v>=lo&&v<=hi?v:d;
/* one entrant: a human (p1, or p2 only with a second pilot) or a bot by level name; null drops it (the save then fails to resume) */
export function cleanEntrant(e,names){e=obj(e);if(!e)return null;
 if(e.kind==='human'){const p=e.pilot==='p2'&&SECOND_PILOT?'p2':e.pilot==='p2'?null:'p1';if(!p)return null;return{kind:'human',pilot:p,name:String(e.name||PILOTS.find(x=>x.id===p).name).slice(0,16)}}
 if(e.kind==='bot'){const i=names.indexOf(e.lv);if(i<0)return null;return{kind:'bot',lv:names[i],skill:i}}return null}
export const cleanSetup=names=>v=>{const s=obj(v)||{},size=SIZES.includes(s.size)?s.size:0,ents=Array.isArray(s.entrants)?s.entrants.map(e=>cleanEntrant(e,names)):[];
 return{format:oneOf(FORMATS.map(f=>f[0]),'single')(s.format),size,team:int(s.team,1,3,1),len:oneOf(LENS.map(l=>l[0]),180)(s.len),pairing:oneOf(PAIRINGS.map(p=>p[0]),'seed')(s.pairing),
  mates:int(s.mates,0,Math.max(0,names.length-1),Math.min(2,Math.max(0,names.length-1))),seed:int(s.seed,0,2**31-1,0),entrants:ents}};
const cleanResults=v=>Array.isArray(v)?v.filter(r=>obj(r)&&typeof r.id==='string'&&/^[a-z]\d{1,2}-\d{1,2}$/.test(r.id)&&Array.isArray(r.score)&&r.score.length===2&&r.score.every(x=>Number.isInteger(x)&&x>=0&&x<1000)).slice(0,256).map(r=>({id:r.id,score:[r.score[0],r.score[1]]})):[];
const steps=names=>[version('tv',TOURN_MIGRATIONS),field('setup',cleanSetup(names)),field('results',cleanResults),field('started',v=>Number.isFinite(v)&&v>0?Math.floor(v):0)];
/** a saved tournament from its JSON: read() returns it (null for none; it may throw), write(T) saves (called by migrations), names: the DIFF
    level names. Returns null when there is no save or it cannot resume (a level that no longer exists, the wrong number of entrants). */
export function loadTournament(read,write,names){let raw=null;try{raw=obj(JSON.parse(read()||'null'))}catch(e){}if(!raw)return null;
 const T={};for(const k of['tv','setup','results','started'])if(Object.hasOwn(raw,k))T[k]=raw[k];
 runSchema(T,steps(names),o=>write(pick(o)));const s=T.setup;if(!s.size||s.entrants.length!==s.size||s.entrants.some(e=>!e))return null;return pick(T)}
const pick=T=>({tv:T.tv,setup:T.setup,results:T.results,started:T.started});
/** a fresh save for a setup (already clean) */
export const newSave=(setup,now=Date.now())=>({tv:TOURN_V,setup,results:[],started:now});
