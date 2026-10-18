// ---------- game state ----------
// Shared mutable state. ES modules can't reassign another module's `let`, so every v15 global that several modules
// reassign lives here as GS.<name>, with its v15 name and initial value.
import {S} from './config/settings.js';
export const GS={drones:[],player:null,state:'kickoff',stT:3,score:[0,0],clock:180,overtime:false,endPending:false,demo:true,paused:false,menuOpen:true,timeScale:1,shake:0,stepN:0,lastCount:0,camMode:S.cam,koN:0,goalSide:0,
 net:null,room:null,myPeer:null,  // online play (net/)
 hostTune:null,  // the host's physics settings while in someone else's online game (applyTune uses them)
 lseed:Math.random()*1e9|0,  // bots' random part loadouts are seeded from this and their slot key (re-rolled per match)
 GM:S.game,OBSON:false};  // game mode; OBSON: Dogfight is on (Highlands SDF, spawns, guns)
export const isBot=k=>/^b[01]\d$/.test(k),auth=()=>!GS.net||GS.net.host,SB=()=>GS.net&&!GS.net.host&&GS.net.sb!=null?GS.net.sb:!!S.sboost,esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),nick=()=>String(S.name||'').trim().slice(0,16)||'Pilot';
