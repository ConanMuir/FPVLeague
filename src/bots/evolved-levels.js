/* ---------- evolved bot levels: the self-play ladder's output (tools/bot-ladder.mjs -> src/bots/evolved.json) as DIFF entries ---------- */
/* Leaf module (no imports): bots/evolved.js (the game) and tools/bot-ladder-check.mjs (node) both use it. The file keeps every promoted
   profile with its generation, parent and rating; the game offers the latest generation of each archetype (Legend, Dribbler, Freestyler),
   named "Gen 4 Dribbler", in the archetypes' own order after the stock levels: a few entries at most, never one per generation. */
export const MAX_LEVELS=3;
/** the levels to add to DIFF from the file's data (null / malformed: none); names: the stock level names, for the order */
export function evolvedLevels(data,names=[]){if(!data||!Array.isArray(data.profiles))return[];const best=new Map();
 for(const p of data.profiles){if(!p||typeof p.arch!=='string'||!p.profile||typeof p.profile!=='object'||!(p.gen>0))continue;const b=best.get(p.arch);if(!b||p.gen>b.gen)best.set(p.arch,p)}
 const rank=a=>{const i=names.indexOf(a);return i<0?names.length:i};
 return[...best.values()].sort((a,b)=>rank(a.arch)-rank(b.arch)||a.gen-b.gen).slice(0,MAX_LEVELS).map(p=>({...p.profile,n:`Gen ${p.gen} ${p.arch}`,id:String(p.id),gen:p.gen,arch:p.arch}))}
