// ---------- match flow: teams/slots, kickoff, goals, end, menu state ----------
import {AC,audioInit,near,noise,tone} from '../audio/audio.js';
import {llDrop} from './longline.js';
import {assignRoles,predict} from '../bots/league.js';
import {$,COL,TEAM} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BR} from '../config/tune.js';
import {Drone,NAMES} from '../flight/drone.js';
import {TUR,TUR_HP} from './dogfight.js';
import {BUL} from './guns.js';
import {leaveGame} from '../net/net.js';
import {ball} from '../physics/ball.js';
import {ballMesh} from '../render/ball.js';
import {emit} from '../render/particles.js';
import {GS,auth,isBot,nick} from '../state.js';
import {banner,feed,tag} from '../ui/hud.js';
import {ORBS} from '../world/orbs.js';
import {MODES} from './registry.js';
export function nameOf(k,t,i){if(isBot(k))return NAMES[t][i];if(!GS.net)return 'You';if(k===(GS.net.host?'h':GS.myPeer))return nick();
 const p=GS.net.peers.find(x=>x.peer===(k==='h'?GS.net.hostPeer:k));return String(p?.presence?.n||'Pilot').slice(0,16)}
// slots: [[keys of blue],[keys of orange]]; 'h' = host's drone, 'bTI' = bot, anything else = a peer label
export function applySlots(T){const old=new Map(GS.drones.map(d=>[d.key,d])),nd=[];GS.player=null;
 T.forEach((arr,t)=>arr.forEach((k,i)=>{let d=old.get(k);if(d&&d.team===t&&d.i===i)old.delete(k);else d=new Drone(t,i,false,k);
  const mine=GS.net?k===(GS.net.host?'h':GS.myPeer):k==='h';d.bot=isBot(k)&&auth();d.remote=!!GS.net&&!mine&&!d.bot;d.name=nameOf(k,t,i);if(mine){GS.player=d;d.setLoadout(S.loadout)}nd.push(d)}));
 old.forEach(d=>d.dispose());GS.drones=nd;if(!GS.player&&GS.demo)GS.player=GS.drones[0]}
function buildTeams(){GS.drones.forEach(d=>d.dispose());GS.drones=[];GS.lseed=Math.random()*1e9|0;const n=GS.demo?3:S.size,free=!GS.demo&&MODES[GS.GM]?.free;applySlots([0,1].map(t=>Array.from({length:free?(t?0:1):GS.demo||S.bots?n:t?0:1},(_,i)=>!GS.demo&&!t&&!i?'h':'b'+t+i)))}
export function kickoff(){llDrop();GS.koN++;GS.state='kickoff';GS.stT=3;GS.timeScale=1;GS.lastCount=4;ball.p.set(0,BR+6,0);ball.v.set(0,0,0);ball.last=null;ballMesh.visible=!GS.OBSON;GS.drones.forEach(d=>{if(!d.remote)d.spawn()});ORBS.forEach(p=>p.cd=0);predict();assignRoles();
 if(GS.OBSON){TUR.forEach(t=>{t.hp=TUR_HP;t.re=0;t.cd=1+Math.random()});BUL.forEach(b=>b.life=0)}}
export function goalFx(t,lt){ballMesh.visible=false;emit(ball.p,COL[t],500,45,1.8);emit(ball.p,0xffffff,150,25,1.2);noise(1.4,300,.8*near(ball.p)+.2,.6);tone(880,180,.9,.18,'sawtooth');
 if(!GS.demo){const d=GS.drones.find(x=>x.key===lt);banner('GOAL!',t?'co':'cb',2.6);feed(`${d&&d.team===t?tag(d):'Own goal'} scores for ${TEAM[t]}`)}}
export function goal(t){GS.score[t]++;GS.state='goal';GS.stT=3.2;GS.timeScale=GS.net?1:.3;GS.goalSide=t;goalFx(t,ball.last?.key);if(GS.overtime)GS.endPending=true}
export function endFx(){const w=GS.score[0]>GS.score[1]?0:1;banner(`${TEAM[w]} WINS ${GS.score[0]}–${GS.score[1]}`,w?'co':'cb',0);tone(523,1046,.6,.2,'triangle')}
export function endMatch(){GS.state='end';GS.stT=5;endFx()}
export function demolish(v,by){v.dead=2.5;v.mesh.visible=false;emit(v.p,COL[v.team],160,30,1.2);emit(v.p,0xffc640,80,18,1);GS.shake=Math.max(GS.shake,near(v.p)*.8);noise(.6,200,.7*near(v.p));if(!GS.demo)feed(`${tag(by)} demolished ${tag(v)}`)}
export function startMatch(){leaveGame();audioInit();AC?.resume();GS.demo=false;buildTeams();GS.score=[0,0];GS.clock=S.len;GS.overtime=GS.endPending=false;kickoff();showMenu(false);$('hud').hidden=false;$('resume').hidden=false}
export function startDemo(){GS.demo=true;buildTeams();GS.score=[0,0];kickoff();$('hud').hidden=true;$('resume').hidden=$('leave').hidden=true;banner('');showMenu(true)}
export function showMenu(v){GS.menuOpen=v;$('menu').hidden=!v;if(v){$('menu').classList.toggle('pause',!GS.demo);$('play').textContent=MODES[GS.GM]?.free?(GS.demo?'Start freeplay':'Restart freeplay'):GS.demo?'Play vs bots':'Restart match';$('play').classList.toggle('go',GS.demo);$('leave').hidden=GS.demo&&!GS.net;$('leave').textContent=GS.net?'Leave game':'Leave match';for(const s of document.querySelectorAll('#menu .scr'))s.hidden=true;$('home').hidden=false}GS.paused=v&&!GS.demo&&!GS.net}
