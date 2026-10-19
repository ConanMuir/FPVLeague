// ---------- Progression tracker: game events (core/events.js) -> your match record -> XP, stats and achievements in your profile ----------
// Listens only; gameplay code has no progression calls. A match is recorded from its first kickoff at 0-0 (or, joining someone's
// game, from the first countdown of a match that starts at 0-0) in a mode with a clock and opponents (League, Dogfight), with no
// overlay (Calibration Lab) and not in the attract demo. 'end' commits it: stats, result, XP, records, achievements. Leaving early
// keeps the counts but gives no XP. Training packs give XP through the 'pack' event. Everything is computed here, on this machine,
// from your own drone's events; the profile is never sent online, so no one else can add XP to it.
// The UI (ui/profile.js) subscribes with onProg('match' | 'pack' | 'ach', fn).
import {onEv} from '../core/events.js';
import {S,save as saveSettings} from '../config/settings.js';
import {BR} from '../config/tune.js';
import {COS_DEF} from '../parts/cosmetics.js';
import {curMode,overlay} from '../modes/registry.js';
import {ball} from '../physics/ball.js';
import {GS,isBot} from '../state.js';
import {DIFF_F,HUMAN_F,levelOf,matchXp,packXp} from './xp.js';
import {newRec,recCounts,recDemo,recFeats,recFloor,recGoal,recHit,recKill,recPop,recSave,recShot,recTouch} from './match-rec.js';
import {PROFILE_KEY,addXp,commitLeft,commitMatch,loadProfile,unlockAch,view} from './profile.js';
import {lockOf,newlyUnlocked} from './unlocks.js';
const write=o=>{try{localStorage.setItem(PROFILE_KEY,JSON.stringify(o))}catch(e){}};
function load(){let raw=null;try{raw=localStorage.getItem(PROFILE_KEY)}catch(e){}
 if(raw){try{JSON.parse(raw)}catch(e){try{localStorage.setItem(PROFILE_KEY+'.bak',raw)}catch(e2){}}}  // an unreadable save is kept aside, not silently lost
 return loadProfile(()=>raw,write,{cos:S.cos,now:Date.now()})}
export const P=load();
export const saveProfile=()=>write(P);
// what you wear must be unlocked (only a hand-edited save can get here: v1 grants what you wore before progression)
{let ch=false;for(const c in COS_DEF)if(lockOf(P,c,S.cos[c])){S.cos={...S.cos,[c]:COS_DEF[c]};ch=true}if(ch)saveSettings()}
// training packs cleared before progression came in count for the Training achievements (marked quietly at boot)
if(unlockAch(P,view(P,null,S.train),Date.now()).length)saveProfile();
// ---- UI subscriptions
const SUBS={match:[],pack:[],ach:[]};
export const onProg=(t,fn)=>{SUBS[t].push(fn)};
const tell=(t,x)=>{for(const f of SUBS[t])try{f(x)}catch(e){console.error(e)}};
// ---- the match being recorded
let R=null;
const mt=()=>R?Math.max(0,GS.overtime?R.len+GS.clock:R.len-GS.clock):0;  // match time (s) from the synced clock (counts up in overtime)
function eligible(){const me=GS.player;return!GS.demo&&!!me&&!curMode().free&&!overlay()&&GS.drones.some(d=>d.team!==me.team)}
function begin(){const me=GS.player;R=newRec({mode:GS.GM,key:me.key,team:me.team});R.len=GS.clock}
function left(){if(!R)return;const r=R;R=null;if(Object.values(recCounts(r)).some(v=>v>0)){commitLeft(P,r);saveProfile()}}
// the record, if the match is still the one being recorded (a mode switch, the Lab or Training ends it)
function cur(){if(R&&(GS.demo||GS.GM!==R.ctx.mode||overlay()||!GS.player||GS.player.key!==R.ctx.key))left();return R}
function liveAch(){if(!R)return;const a=unlockAch(P,view(P,R,S.train),Date.now());if(a.length){saveProfile();for(const x of a)tell('ach',x)}}
onEv('kickoff',()=>{if(!eligible()){left();return}if(!GS.score[0]&&!GS.score[1]&&!GS.overtime){left();begin()}});
onEv('count',()=>{if(!R&&GS.net&&!GS.net.host&&eligible()&&!GS.score[0]&&!GS.score[1]&&!GS.overtime)begin()});  // joining: the host runs the kickoffs
onEv('touch',e=>{const r=cur();if(!r)return;const d=e.d;if(ball.p.y<BR+.3)recFloor(r);const n=r.pops;recTouch(r,{key:d.key,team:d.team,t:mt(),y:e.p.y,pop:d.popT>0});if(r.pops!==n)liveAch()});
onEv('popFire',e=>{const r=cur();if(r)recPop(r,e.d.key)});
onEv('bounce',()=>{const r=cur();if(r&&ball.p.y<BR+1)recFloor(r)});  // the ball hit the floor (not a wall or the ceiling)
onEv('save',e=>{const r=cur();if(r){recSave(r,e.d.key);liveAch()}});
onEv('shot',e=>{const r=cur();if(r){recShot(r,e.d.key);liveAch()}});
onEv('goal',e=>{const r=cur();if(r){recGoal(r,{team:e.team,by:e.by,t:mt()});liveAch()}});
onEv('demo',e=>{const r=cur();if(r&&e.d){recDemo(r,{key:e.d.key,team:e.d.team},e.by?{key:e.by.key,team:e.by.team}:null);liveAch()}});
onEv('kill',e=>{const r=cur(),v=e.d;if(!r||!v)return;recKill(r,{key:v.isTurret?null:v.key,team:v.isTurret?v.t:v.team,turret:!!v.isTurret},e.by&&!e.by.isTurret?e.by.key:null);liveAch()});
onEv('bullet',e=>{const r=cur();if(r&&e.d)recHit(r,{team:e.d.team},e.other&&!e.other.isTurret?e.other.key:null)});
onEv('end',e=>{const r=cur();if(!r)return;const played=mt();R=null;if(Array.isArray(e.score))r.score=[e.score[0]|0,e.score[1]|0];  // the final score (Dogfight scores kills, not goals)
 const T=r.ctx.team,opp=GS.drones.filter(d=>d.team!==T),mates=GS.drones.filter(d=>d.team===T&&d.key!==r.ctx.key),bots=opp.filter(d=>isBot(d.key));
 const diffs=GS.net?[]:bots.map(d=>d.skill??S.diff),df=GS.net?(opp.some(d=>!isBot(d.key))?HUMAN_F:1):diffs.length?Math.max(...diffs.map(i=>DIFF_F[i]??1)):1;
 const f=recFeats(r,{winner:e.winner,overtime:GS.overtime,oppBots:opp.length>0&&bots.length===opp.length,mateBots:mates.some(d=>isBot(d.key)),diffs});
 const res=matchXp({...recCounts(r),clean:f.clean},{played,won:f.won,df,opp:opp.length});
 const before={xp:P.xp,ach:{...P.ach},grant:[...P.grant]},now=Date.now();commitMatch(P,r,f,res.total,now);const ach=unlockAch(P,view(P,null,S.train),now);saveProfile();
 tell('match',{mode:r.ctx.mode,won:f.won,score:[r.score[T],r.score[1-T]],team:T,feats:f,res,counts:recCounts(r),played,xp0:before.xp,xp1:P.xp,lv0:levelOf(before.xp),lv1:levelOf(P.xp),ach,unl:newlyUnlocked(before,P)})});
// ---- training packs: XP only for beating your saved best
onEv('pack',e=>{if(!e||typeof e.of!=='number')return;const x=packXp(e.prev,{n:e.n,of:e.of,t:e.t},e.tier),before={xp:P.xp,ach:{...P.ach},grant:[...P.grant]};
 addXp(P,x.total);const ach=unlockAch(P,view(P,null,S.train),Date.now());saveProfile();
 tell('pack',{id:e.id,res:x,xp0:before.xp,xp1:P.xp,lv0:levelOf(before.xp),lv1:levelOf(P.xp),ach,unl:newlyUnlocked(before,P)})});
// read-only snapshot for tools (tools/progress-check.mjs, smoke)
export const profSnap=()=>({xp:P.xp,lv:levelOf(P.xp).lv,ach:Object.keys(P.ach),st:JSON.parse(JSON.stringify(P.st)),best:{...P.best},hist:P.hist.map(h=>({...h})),rec:R?{mode:R.ctx.mode,...recCounts(R)}:null});
export const achView=()=>view(P,R,S.train);
