// ---------- Player profile: XP, lifetime stats, records, achievements, granted cosmetics (pure: load/clean, commit, view) ----------
// Saved as JSON in localStorage 'droneleague.profile' (its own key, so the settings and their v15 comparison are untouched), loaded
// through the same versioned schema as the settings (config/schema.js): every field is cleaned (untrusted: hand edits, old or broken
// saves never crash and never give impossible values), then PROFILE_MIGRATIONS newer than the save's pv run once each and write it out.
// Your name stays S.name (settings). Training bests stay S.train (settings); the profile only reads them.
//  pv       profile version              xp      total XP (the level is computed from it: progress/xp.js levelOf)
//  st       per mode id {m matches finished, w, l, xp, and the match-rec counts: goals, saves, assists, shots, demos, pops, chains, kills, ...}
//  best     single-match records {goals, saves, chain, kills, xp}     feat   counts of match feats {clean, comeback, ot, champ, gc}
//  streak   wins in a row now, bstreak the best run                   ach    {achievement id: unlock time (ms)}
//  grant    cosmetics 'cat:id' that stay unlocked whatever the level (you wore them before progression)
//  hist     the last 10 finished matches [{m: mode, r: 'W' | 'L', s: [yours, theirs], xp, t: time}]     since: profile created (ms)
// Changing what an old save means: append {v: next, run(P)} to PROFILE_MIGRATIONS (it runs once per save, then writes it).
import {field,runSchema,version} from '../config/schema.js';
import {ACH,achProg,packCounts} from './achievements.js';
import {REC_KEYS,recCounts} from './match-rec.js';
import {UNLOCK,cosKey} from './unlocks.js';
export const PROFILE_KEY='droneleague.profile';
export const STAT_KEYS=['m','w','l','xp',...REC_KEYS],BEST_KEYS=['goals','saves','chain','kills','xp'],FEAT_KEYS=['clean','comeback','ot','champ','gc'];
const MAXN=1e9,MAXT=1e13,HIST=10;
const n0=v=>Number.isFinite(v)&&v>0?Math.min(MAXN,Math.floor(v)):0,ts=v=>Number.isFinite(v)&&v>0&&v<MAXT?Math.floor(v):0;
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:null;
// counters: only the known keys, whole numbers >= 0; sparse (zeros left out) so the save stays small
const counters=keys=>v=>{const o={},s=obj(v)||{};for(const k of keys){const x=n0(s[k]);if(x)o[k]=x}return o};
const modeOk=id=>/^[a-z0-9_]{1,16}$/.test(id)&&!Object.hasOwn(Object.prototype,id)&&id!=='__proto__';  // a mode id; never a key that reaches Object.prototype
function cleanStats(v){const o={},s=obj(v);if(!s)return o;let k=0;for(const id of Object.keys(s)){if(k>=16)break;if(!modeOk(id)||!obj(s[id]))continue;o[id]=counters(STAT_KEYS)(s[id]);k++}return o}
function cleanAch(v){const o={},s=obj(v);if(!s)return o;for(const a of ACH)if(Object.hasOwn(s,a.id)&&s[a.id]){o[a.id]=ts(s[a.id])||1}return o}
const cleanGrant=v=>Array.isArray(v)?[...new Set(v.filter(k=>typeof k==='string'&&UNLOCK.has(k)))].slice(0,64):[];
function cleanHist(v){if(!Array.isArray(v))return[];const out=[];for(const h of v){if(out.length>=HIST)break;if(!obj(h)||typeof h.m!=='string'||!modeOk(h.m)||h.r!=='W'&&h.r!=='L')continue;
 const s=Array.isArray(h.s)&&h.s.length===2?h.s.map(x=>Math.min(999,n0(x))):[0,0];out.push({m:h.m,r:h.r,s,xp:n0(h.xp),t:ts(h.t)})}return out}
// ---- migrations: v1 = progression arrives: what you are wearing now that the unlock table locks stays yours (nobody loses their look)
export const PROFILE_MIGRATIONS=[{v:1,run:(P,ctx)=>{const c=obj(ctx?.cos);if(c)for(const cat in c){const k=cosKey(cat,c[cat]);if(UNLOCK.has(k)&&!P.grant.includes(k))P.grant.push(k)}}}];
export const PROFILE_V=PROFILE_MIGRATIONS[PROFILE_MIGRATIONS.length-1].v;
const KEYS=['pv','xp','st','best','feat','streak','bstreak','ach','grant','hist','since'];
const steps=ctx=>[field('xp',n0),field('st',cleanStats),field('best',counters(BEST_KEYS)),field('feat',counters(FEAT_KEYS)),field('streak',n0),field('bstreak',n0),
 field('ach',cleanAch),field('grant',cleanGrant),field('hist',cleanHist),field('since',v=>ts(v)||ts(ctx?.now)||1),
 field('pv',v=>Number.isInteger(v)&&v>=0&&v<=PROFILE_V?v:v>PROFILE_V?PROFILE_V:0),version('pv',PROFILE_MIGRATIONS.map(m=>({v:m.v,run:P=>m.run(P,ctx)})))];
// the profile from saved JSON: read() returns it (null for none; it may throw); write(P) saves (called after each migration);
// ctx: {cos: the cosmetics worn now (S.cos), now: Date.now()}. Anything that is not a valid profile loads as a fresh one.
export function loadProfile(read,write,ctx={}){let raw={};try{const j=JSON.parse(read()||'{}');if(obj(j))raw=j}catch(e){}
 const P={};for(const k of KEYS)if(Object.hasOwn(raw,k))P[k]=raw[k];
 runSchema(P,steps(ctx),o=>write(pick(o)));return pick(P)}
const pick=P=>{const o={};for(const k of KEYS)if(k in P)o[k]=P[k];return o};
export const newProfile=(ctx={})=>loadProfile(()=>null,()=>{},ctx);
// ---- commits
const add=(dst,src)=>{for(const k in src){const v=n0(src[k]);if(v)dst[k]=Math.min(MAXN,(dst[k]||0)+v)}};
function addBest(P,r,xp){const b=P.best,mx=(k,v)=>{v=n0(v);if(v>(b[k]||0))b[k]=v};mx('goals',r.goals);mx('saves',r.saves);mx('chain',r.bestChain);mx('kills',r.kills);if(xp!=null)mx('xp',xp)}
// a finished match: counts, result, records, feats, streak, XP and the history line
export function commitMatch(P,r,f,xp,now){const m=r.ctx.mode,s=P.st[m]||(P.st[m]={}),T=r.ctx.team;add(s,recCounts(r));add(s,{m:1,[f.won?'w':'l']:1,xp});addBest(P,r,xp);
 for(const k of FEAT_KEYS)if(f[k])P.feat[k]=(P.feat[k]||0)+1;P.streak=f.won?P.streak+1:0;if(P.streak>P.bstreak)P.bstreak=P.streak;P.xp=Math.min(MAXN,P.xp+n0(xp));
 P.hist.unshift({m,r:f.won?'W':'L',s:[r.score[T],r.score[1-T]],xp:n0(xp),t:ts(now)});P.hist.length=Math.min(P.hist.length,HIST);return P}
// a match left before the end: its counts and records stay (they happened), no result, no XP, the win streak is unchanged
export function commitLeft(P,r){const m=r.ctx.mode;add(P.st[m]||(P.st[m]={}),recCounts(r));addBest(P,r,null);return P}
export function addXp(P,xp){P.xp=Math.min(MAXN,P.xp+n0(xp));return P}
// ---- the view achievements read: lifetime stats plus the match in progress (r, may be null), training from S.train
export function view(P,r,train){const st={};for(const m in P.st)st[m]={...P.st[m]};const best={...P.best};
 if(r){const s=st[r.ctx.mode]||(st[r.ctx.mode]={});add(s,recCounts(r));const mx=(k,v)=>{if(v>(best[k]||0))best[k]=v};mx('goals',r.goals);mx('saves',r.saves);mx('chain',r.bestChain);mx('kills',r.kills)}
 let m=0;for(const k in st)m+=st[k].m||0;return{st,best,feat:P.feat,streak:P.streak,bstreak:P.bstreak,m,train:packCounts(train)}}
// achievements that are done in view V but not yet in P: marks them (time now) and returns them
export function unlockAch(P,V,now){const out=[];for(const a of ACH)if(!P.ach[a.id]&&achProg(a,V).done){P.ach[a.id]=ts(now)||1;out.push(a)}return out}
