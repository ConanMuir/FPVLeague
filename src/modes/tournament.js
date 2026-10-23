/* ---------- Tournament mode: a bracket of bots and you (tournament/bracket.js), saved while it runs (tournament/store.js) ---------- */
/* The menu's Tournament screen (ui/tournament.js) sets one up: 4 / 8 / 16 entrants, each a bot level or the local pilot, single or double
   elimination, round robin or Swiss, 1v1 to 3v3 with bot team-mates, a match length. Your matches are played as normal matches in this mode
   (the clock, overtime, XP under 'tourn'); a bot v bot match is watched (no player, the spectator camera, GS.spect) or simulated: the real
   step loop run flat out in the frame budget behind the menu (simTick), the sound muted, until the clock runs out and a goal settles any tie.
   Every result goes to the save, so a reload resumes the bracket; a tournament you win is a trophy in the profile (progress/tracker.js tournWon). */
import {AC,BUS,audioInit,setVolumes} from '../audio/audio.js';
import {$,DIFF} from '../config/constants.js';
import {onEv} from '../core/events.js';
import {setGame} from './dogfight.js';
import {exitLab} from './lab.js';
import {applySlots,kickoff,showMenu,startDemo} from './match.js';
import {registerMode} from './registry.js';
import {step} from './step.js';
import {exitTrain} from './training.js';
import {leaveGame,mpMsg} from '../net/net.js';
import {DIFF_F} from '../progress/xp.js';
import {tournWon} from '../progress/tracker.js';
import {compileFor} from '../render/renderer.js';
import {ball} from '../physics/ball.js';
import {GS} from '../state.js';
import * as B from '../tournament/bracket.js';
import {TOURN_KEY,loadTournament,newSave} from '../tournament/store.js';
/* T: the live bracket; save: its saved form; cur: the match in play {id, how: 'play' | 'watch' | 'sim'}; sim: the simulation in progress;
   queue: simulate every bot match in turn; after: the screen to open once the menu is back; trophy: what winning it gave; ver: bumps on every change */
export const TN={T:null,save:null,cur:null,sim:null,queue:false,after:null,trophy:null,last:null,ver:0,tick:null};  /* tick: main.js's sim tick (snapshot + step), set at boot, so a simulated match draws right */
const names=()=>DIFF.map(d=>d.n);
const write=o=>{try{if(o)localStorage.setItem(TOURN_KEY,JSON.stringify(o));else localStorage.removeItem(TOURN_KEY)}catch(e){}};
/** read the saved tournament (main.js boot, after the evolved levels joined DIFF) */
export function tournInit(){let raw=null;try{raw=localStorage.getItem(TOURN_KEY)}catch(e){}const sv=loadTournament(()=>raw,write,names());TN.save=sv;TN.T=sv?B.replay(sv.setup,sv.results):null;
 if(sv&&TN.T.results.length!==sv.results.length){sv.results=TN.T.results.map(r=>({...r}));write(sv)}TN.ver++}  /* results that did not fit the bracket are dropped from the save too */
/** start a tournament from a clean setup (tournament/store.js cleanSetup) */
export function tournNew(setup){tournStop();const T=B.createTournament(setup);TN.T=T;TN.save=newSave(B.setupOf(T));write(TN.save);TN.trophy=TN.last=null;TN.ver++;return T}
export function tournAbandon(){tournStop();TN.T=TN.save=null;TN.trophy=TN.last=null;write(null);TN.ver++}
function record(id,score){const T=TN.T;if(!T||!B.report(T,id,score))return false;TN.save.results.push({id,score:[...score]});write(TN.save);TN.last={id,score:[...score]};TN.ver++;
 if(T.done&&T.entrants[T.champion].kind==='human'){const df=Math.max(1,...T.entrants.filter(e=>e.kind==='bot').map(e=>DIFF_F[e.skill]??1));TN.trophy=tournWon(T.size,df)}return true}
const pl=id=>TN.T?B.playable(TN.T).find(m=>m.id===id)||null:null;
/** the next bot v bot match that can be played */
export const nextBots=()=>TN.T?B.playable(TN.T).find(m=>B.matchKind(TN.T,m)==='bots')||null:null;
/* the teams of a match: the drones rebuilt from its slots, each bot at its entrant's level (bots/league.js reads d.skill) */
function build(m){const {keys,skill}=B.teamsOf(TN.T,m);GS.drones.forEach(d=>d.dispose());GS.drones=[];GS.player=null;GS.lseed=Math.random()*1e9|0;applySlots(keys);
 for(const d of GS.drones)if(d.key in skill)d.skill=skill[d.key];compileFor(GS.drones.flatMap(d=>d.trail?[d.mesh,d.trail]:[d.mesh]))}
function begin(m,how){if(GS.net){mpMsg('Leave the online game to run a tournament.');return false}const q=TN.queue;tournStop();TN.queue=q;exitTrain();exitLab();leaveGame();audioInit();AC?.resume();setGame('tourn');  /* the queue (simulate all) outlives the stop of the match before it: it cleared the queue, so Simulate all ran one match */
 GS.demo=how==='sim';build(m);GS.score=[0,0];GS.clock=TN.T.len;GS.overtime=GS.endPending=false;GS.timeScale=1;GS.spect='';kickoff();TN.cur={id:m.id,how};TN.ver++;return true}
/** play a match yourself (one human in it) */
export function tournPlay(id){const m=pl(id);if(!m||B.matchKind(TN.T,m)!=='play'||!begin(m,'play'))return false;showMenu(false);$('hud').hidden=false;$('resume').hidden=false;return true}
/** watch a bot v bot match: no player, the spectator camera (render/camera.js GS.spect), the clock and the score */
export function tournWatch(id){const m=pl(id);if(!m||B.matchKind(TN.T,m)!=='bots'||!begin(m,'watch'))return false;GS.spect=`${B.entrantName(TN.T,m.a)} v ${B.entrantName(TN.T,m.b)}`;showMenu(false);$('hud').hidden=false;$('resume').hidden=false;return true}
/** simulate a bot v bot match behind the menu: the step loop runs in the frame budget (simTick) until it is decided */
export function tournSim(id){const m=pl(id);if(!m||B.matchKind(TN.T,m)!=='bots'||!begin(m,'sim'))return false;GS.menuOpen=true;GS.paused=true;mute(true);TN.sim={m,t:0,len:TN.T.len,steps:0};return true}
/** simulate every bot match that can be played, one after the other (until a match of yours is the only one left) */
export function tournSimAll(){const n=nextBots();if(!n)return false;TN.queue=true;return tournSim(n.id)||(TN.queue=false)}
export function tournStopQueue(){TN.queue=false}
const mute=on=>{if(!BUS)return;if(on)BUS.mst.gain.setTargetAtTime(0,AC.currentTime,.01);else setVolumes()};
/** one frame of simulation: as many 1/120 s steps as fit in `budget` ms. Match time counts in play; at the end of it the side ahead wins, a
    tie goes on until a goal (the game's overtime), for at most OT_MAX s. A mode switch, an online game or new drones under it end the simulation unrecorded. */
export function simTick(budget=24){const s=TN.sim;if(!s)return;if(!GS.demo||GS.GM!=='tourn'||GS.net||!GS.drones.length||!GS.paused){simEnd(null);return}
 const t0=performance.now(),dt=1/120,tk=TN.tick||step;while(performance.now()-t0<budget){tk(dt);s.steps++;if(GS.state==='play')s.t+=dt;if(s.t>=s.len&&(GS.score[0]!==GS.score[1]||s.t>=s.len+B.OT_MAX)){simEnd(B.settle(GS.score,ball.p.z));return}}}  /* level past OT_MAX of overtime: settled by the ball (tournament/bracket.js), so a stalemate never runs for ever */
function simEnd(score){const s=TN.sim;TN.sim=null;mute(false);GS.paused=false;TN.cur=null;if(!score){TN.queue=false;return}record(s.m.id,score);  /* cut short (a match or an online game started under it): nothing recorded, the world is theirs now */
 if(TN.queue){const n=nextBots();if(n&&tournSim(n.id))return}TN.queue=false;startDemo();TN.after='bracket'}
/** stop whatever tournament match is running (the mode's exit, Leave match, a new tournament); an unfinished match stays to be played */
export function tournStop(){if(TN.sim){TN.sim=null;mute(false);GS.paused=false}TN.cur=null;TN.queue=false;GS.spect=''}
registerMode('tourn',{name:'Tournament',title:'TOURNAMENT',world:'arena',order:3,hidden:true,exit:()=>tournStop(),
 sub:'A bracket of bots and you: single or double elimination, round robin or Swiss, 4 to 16 entrants at the levels you choose, 1v1 to 3v3.'});
/* a played or watched match ends (modes/match.js endFx): its score goes to the bracket; the menu comes back a few seconds later (step.js startDemo) and the bracket opens */
onEv('end',e=>{const c=TN.cur;if(!c||c.how==='sim'||GS.GM!=='tourn'||GS.demo)return;TN.cur=null;GS.spect='';record(c.id,[e.score[0]|0,e.score[1]|0]);TN.after='bracket'});
/* read-only snapshot for tools/tournament-check.mjs and the smoke test */
export const tournSnap=()=>{const T=TN.T;let saved=null;try{saved=JSON.parse(localStorage.getItem(TOURN_KEY))}catch(e){}
 return{on:!!T,format:T?.format??null,size:T?.size??null,done:T?T.done:null,champion:T?T.champion:null,results:T?T.results.length:0,playable:T?B.playable(T).map(m=>m.id):[],
  entrants:T?T.entrants.map((e,i)=>({kind:e.kind,name:B.entrantName(T,i),skill:e.skill??null})):[],cur:TN.cur?{...TN.cur}:null,sim:TN.sim?{t:+TN.sim.t.toFixed(1),steps:TN.sim.steps,score:[...GS.score]}:null,
  queue:TN.queue,after:TN.after,trophy:TN.trophy,last:TN.last,drones:GS.drones.map(d=>({key:d.key,team:d.team,bot:d.bot,skill:d.skill??null})),player:GS.player?.key??null,spect:GS.spect||'',mode:GS.GM,demo:GS.demo,paused:GS.paused,saved}};
