// ---------- versioned settings: a declarative schema with ordered migrations ----------
// A schema is an ordered list of steps run over the loaded settings object (defaults merged with the saved JSON):
//  field(key, clean, {if, save})  S[key] = clean(S[key], S); clean returns the value to keep (the same value is fine), or DROP to
//                                 delete the key. if(S): run only when true. save: write the settings out after this step.
//  version(key, migrations)       the settings version (S[key] | 0): each {v, run(S)} newer than it runs in list order, then
//                                 S[key] = v and the settings are written out, so a migration runs once per save.
// Steps run in list order and a key is added where its step first assigns it, so the order of the list is also the key order of
// the saved JSON (tools/smoke.mjs compares that against v15). New settings go at the end; a new migration goes at the end of its
// version list with the next number.
// Rule builders for the common cases (each returns a clean function):
export const DROP=Symbol('drop');
const cl=(v,a,b)=>v<a?a:v>b?b:v;
/** one of a fixed list, else def */
export const oneOf=(list,def)=>v=>list.includes(v)?v:def;
/** true only if exactly true */
export const isTrue=()=>v=>v===true;
/** a finite number clamped to [lo, hi] (rounded first if round), else def; strings don't count */
export const num=(lo,hi,def,round=false)=>v=>Number.isFinite(v)?cl(round?Math.round(v):v,lo,hi):def;
/** an integer in [lo, hi), else def */
export const int=(lo,hi,def)=>v=>Number.isInteger(v)&&v>=lo&&v<hi?v:def;
export const field=(k,clean,o={})=>({k,clean,...o});
export const version=(k,migrations)=>({k,migrations});
/** run the schema's steps over S; write(S) saves it */
export function runSchema(S,steps,write){
 for(const s of steps){
  if(s.migrations){for(const m of s.migrations)if((S[s.k]|0)<m.v){m.run(S);S[s.k]=m.v;write(S)}continue}
  if(s.if&&!s.if(S))continue;const v=s.clean(S[s.k],S);if(v===DROP)delete S[s.k];else S[s.k]=v;if(s.save)write(S)}
 return S}
/** settings from storage: read() gives the saved JSON (or null; it may throw), merged over the defaults, then the schema */
export function loadSchema(read,def,steps,write){let S;try{S={...def,...JSON.parse(read()||'{}')}}catch(e){S={...def}}return runSchema(S,steps,write)}
