// ---------- online play (room capability: host simulates ball + bots, each pilot owns their drone) ----------
import {AC,audioInit,near,noise} from '../audio/audio.js';
import {camTilt} from '../render/camera.js';
import {$,AI,ARENAS,COL,QT,V3,cl} from '../config/constants.js';
import {MDEF,cleanMod} from '../config/mods.js';
import {S} from '../config/settings.js';
import {BR,MAXB,applyTune} from '../config/tune.js';
import {TUR,applyHit,dfState,setGame} from '../modes/dogfight.js';
import {BUL} from '../modes/guns.js';
import {applySlots,endFx,goalFx,kickoff,nameOf,showMenu,startDemo} from '../modes/match.js';
import {p2p} from './p2p.js';
import {modeId} from '../modes/registry.js';
import {ball} from '../physics/ball.js';
import {ballMesh} from '../render/ball.js';
import {TN} from '../render/drone-mesh.js';
import {cleanLoadout} from '../parts/index.js';
import {cleanCos,cosIds} from '../parts/cosmetics.js';
import {emit} from '../render/particles.js';
import {_t} from '../scratch.js';
import {GS,esc,isBot,nick} from '../state.js';
import {banner,feed} from '../ui/hud.js';
import {renderGames} from '../ui/menu.js';
import {syncMod} from '../ui/modpanel.js';
import {ORBS} from '../world/orbs.js';
export const r2=v=>[+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(2)],pack=d=>[...r2(d.p),+d.q.x.toFixed(3),+d.q.y.toFixed(3),+d.q.z.toFixed(3),+d.q.w.toFixed(3),...r2(d.v)];
const okArr=(a,n)=>Array.isArray(a)&&a.length>=n&&a.slice(0,n).every(Number.isFinite);
export function mpMsg(t){$('mpnote').textContent=t;if(!GS.menuOpen)feed(esc(t))}
function hostSlots(){const hs=[{k:'h',tp:S.tp}];for(const p of[...GS.net.peers].sort((a,b)=>a.peer<b.peer?-1:1)){if(p.sameTab||!p.presence?.n||p.presence.g)continue;hs.push({k:p.peer,tp:String(p.presence.tp)})}
 const size=Math.min(3,Math.max(S.size,Math.ceil(hs.length/2))),T=[[],[]];
 for(const h of hs){let t=h.tp==='0'?0:h.tp==='1'?1:T[0].length<=T[1].length?0:1;if(T[t].length>=size)t=1-t;if(T[t].length<size)T[t].push(h.k)}
 if(S.bots)for(const t of[0,1])for(let i=T[t].length;i<size;i++)T[t].push('b'+t+i);return T}
// lo: the pilot's part ids, co: cosmetic ids (untrusted; cleanLoadout / cleanCos check them against the known lists)
function setNet(d,a,now,dead,bo,fi,ti,lo,co){if(!okArr(a,10))return;const L=lo&&cleanLoadout(lo);if(L&&L.join()!==d.lo.ids.join())d.setLoadout(L);if(Array.isArray(co))d.setCos(cleanCos(co));d.firing=!!fi&&!dead;d.tilt=Number.isFinite(+ti)?cl(+ti,0,60):30;const n=d.net||(d.net={p:new V3(),q:new QT(),v:new V3(),at:0});n.p.fromArray(a,0);n.q.fromArray(a,3).normalize();n.v.fromArray(a,7);n.at=now;
 const was=d.dead>0;d.dead=dead?1:0;d.boostOn=!!bo;d.thr=bo?1:.5;
 if(!d.seen||was&&!dead){d.seen=1;d.p.copy(n.p);d.q.copy(n.q);for(let j=0;j<TN;j++)d.p.toArray(d.tp,j*3)}
 if(!was&&dead){emit(d.p,COL[d.team],160,30,1.2);noise(.6,200,.7*near(d.p))}}
function onHostState(g,now){if(!g||typeof g!=='object')return;if(g.ar!=null&&g.ar!==AI&&ARENAS[g.ar]&&!GS.net.rl){GS.net.rl=1;mpMsg('Switching to the host\'s '+ARENAS[g.ar][0]+' arena…');try{sessionStorage.setItem('dlArenaNet',g.ar);sessionStorage.setItem('dlRejoin',GS.net.code)}catch(e){}GS.net.r.leave().catch(()=>{});setTimeout(()=>location.reload(),200);return}GS.net.sb=g.sb==null?null:!!g.sb;if(modeId(g.m)!==GS.GM)setGame(g.m);if(g.tu&&typeof g.tu==='object'){const j=JSON.stringify(g.tu);if(j!==GS.net.tuJ){GS.net.tuJ=j;GS.hostTune={...MDEF,...cleanMod(g.tu)};applyTune();syncMod()}}const sj=JSON.stringify(g.sl);
 if(sj!==GS.net.slotsJ&&Array.isArray(g.sl)&&g.sl.length===2&&g.sl.some(a=>Array.isArray(a)&&a.length)&&g.sl.every(a=>Array.isArray(a)&&a.length<=3&&a.every(k=>typeof k==='string'&&k&&k.length<48))){GS.net.slotsJ=sj;GS.net.slots=g.sl;applySlots(g.sl)}
 if(g.ko!==GS.net.ko){GS.net.ko=g.ko;GS.player?.spawn();ball.p.set(0,BR+6,0);ball.v.set(0,0,0);ballMesh.visible=!GS.OBSON;BUL.forEach(b=>b.life=0);GS.lastCount=4;ORBS.forEach(p=>p.cd=0)}
 if(g.st==='goal'&&GS.state!=='goal'){if(okArr(g.bl,3))ball.p.fromArray(g.bl);goalFx(g.gs?1:0,g.lt)}
 if(Array.isArray(g.sc))GS.score=[g.sc[0]|0,g.sc[1]|0];
 if(g.st==='end'&&GS.state!=='end')endFx();
 if(g.ot&&!GS.overtime)banner('OVERTIME','',1.6);
 if(['kickoff','play','goal','end'].includes(g.st))GS.state=g.st;GS.stT=+g.t||0;GS.clock=+g.ck||0;GS.overtime=!!g.ot;
 if(g.bots&&typeof g.bots==='object')for(const k in g.bots){const d=GS.drones.find(x=>x.key===k),a=g.bots[k];if(d&&d.remote&&Array.isArray(a))setNet(d,a,now,a[11],a[10],a[12],undefined,a[13],a[14])}
 if(GS.OBSON)dfState(g)
 const ack=+(g.ack&&g.ack[GS.myPeer])||0;
 if(okArr(g.bl,6)&&GS.state!=='goal'&&(GS.net.seq<=ack||now-GS.net.hitT>600)){ball.v.fromArray(g.bl,3);ball.p.lerp(_t.fromArray(g.bl).addScaledVector(ball.v,.05),.5)}
 if(typeof g.lt==='string'){const d=GS.drones.find(x=>x.key===g.lt);if(d)ball.last=d}}
export function netSync(now){if(!GS.net)return;
 for(const p of GS.net.peers){if(p.sameTab)continue;const pr=p.presence;if(!pr||pr===GS.net.last[p.peer])continue;GS.net.last[p.peer]=pr;
  if(pr.g&&!GS.net.host){GS.net.hostPeer=p.peer;onHostState(pr.g,now)}
  const d=GS.drones.find(x=>x.key===(pr.g?'h':p.peer));if(d&&d.remote){d.name=nameOf(d.key,d.team,d.i);setNet(d,pr.s,now,pr.d,pr.b,pr.f,pr.ti,pr.lo,pr.co)}
  if(GS.net.host&&GS.OBSON&&Array.isArray(pr.hs))for(const h of pr.hs)if(Array.isArray(h)&&+h[0]>(GS.net.hk[p.peer]||0)){GS.net.hk[p.peer]=+h[0];if(GS.state==='play'&&d&&d.dead<=0)applyHit(h[1],cl(+h[2]||0,0,10),d)}
  if(GS.net.host&&pr.h&&+pr.h.s>(GS.net.ack[p.peer]||0)){GS.net.ack[p.peer]=+pr.h.s;if(GS.state==='play'&&okArr(pr.h.p,3)&&okArr(pr.h.v,3)){ball.p.fromArray(pr.h.p);ball.v.fromArray(pr.h.v).clampLength(0,MAXB);if(d)ball.last=d}}}
 if(GS.net.host){const T=hostSlots(),j=JSON.stringify(T);if(j!==GS.net.slotsJ){GS.net.slotsJ=j;GS.net.slots=T;applySlots(T)}return}
 const gone=GS.net.hostPeer?!GS.net.peers.some(p=>p.peer===GS.net.hostPeer):now-GS.net.t0>8000;
 if(!gone)GS.net.gone=0;else if(!GS.net.gone)GS.net.gone=now;else if(now-GS.net.gone>3000){mpMsg(GS.net.hostPeer?'The host left the game.':'No game found with that code.');leaveGame();startDemo()}}
export function netSend(now){if(!GS.net||now-GS.net.sendT<33)return;GS.net.sendT=now;const me=GS.player,P={n:nick(),tp:S.tp};
 if(me){P.s=pack(me);P.d=me.dead>0?1:0;P.b=me.boostOn?1:0;P.lo=me.lo.ids;P.co=cosIds(me.cos);if(GS.OBSON){P.f=me.firing?1:0;P.ti=camTilt()}}
 if(GS.net.host){const bots={};for(const d of GS.drones)if(d.bot)bots[d.key]=[...pack(d),d.boostOn?1:0,d.dead>0?1:0,d.firing?1:0,d.lo.ids,cosIds(d.cos)];
  P.g={st:GS.state,t:+GS.stT.toFixed(2),sc:GS.score,ck:+GS.clock.toFixed(1),ot:GS.overtime?1:0,ko:GS.koN,gs:GS.goalSide,sl:GS.net.slots,bl:[...r2(ball.p),...r2(ball.v)],ack:GS.net.ack,bots,lt:ball.last?.key||null,tu:S.mod,m:GS.GM,sb:S.sboost?1:0,ar:AI};
  if(GS.OBSON){P.g.hp={};P.g.lf={};for(const d of GS.drones){P.g.hp[d.key]=Math.round(d.hp);P.g.lf[d.key]=d.life}P.g.tg=TUR.map(t=>t.re>0?0:Math.max(1,Math.round(t.hp)));P.g.kf=GS.net.kf}
  if(now-GS.net.lobT>2000){GS.net.lobT=now;GS.room.presence({game:GS.net.code,m:GS.GM,host:nick(),pl:GS.net.slots.flat().filter(k=>!isBot(k)).length,sz:GS.net.slots[0].length}).catch(()=>{})}}
 else{if(GS.net.hit)P.h=GS.net.hit;if(GS.OBSON&&GS.net.hits.length)P.hs=GS.net.hits.slice(-16)}
 GS.net.r.presence(P).catch(()=>{})}
export async function enterGame(code,isHost){code=String(code).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,6);if(!GS.room||code.length<2){mpMsg('Enter a game code of 2–6 letters or digits.');return}
 audioInit();AC?.resume();leaveGame();mpMsg(isHost?'Starting game…':`Joining ${code.toUpperCase()}…`);let r;
 try{r=await(GS.room.p2p?GS.room.join(code,isHost):GS.room.join('dl-'+code))}catch(e){const c=e?.code||'error';if(isHost&&c==='taken')return enterGame(Math.random().toString(36).slice(2,6),true);mpMsg(c==='not_found'?'No game found with that code.':c==='timeout'?'Could not reach that game. Check the code and your connection.':c==='load_failed'?'Could not load the online library. Check your internet connection.':`Could not open that game (${c}). Try again.`);return}
 const n=GS.net={r,code,host:isHost,peers:[],last:{},seq:0,hit:null,hitT:0,ack:{},slots:null,slotsJ:'',ko:-1,sendT:0,lobT:0,t0:performance.now(),hostPeer:null,gone:0,hits:[],hseq:0,hk:{},kf:[],kfId:0,kfSeen:-1};
 r.onPeers(ch=>{if(GS.net!==n)return;n.peers=ch.peers;const me=ch.peers.find(p=>p.sameTab);if(me&&GS.myPeer!==me.peer){GS.myPeer=me.peer;if(!n.host&&n.slots)applySlots(n.slots)}},
  e=>{if(GS.net===n){mpMsg(e.code==='host_left'?'The host left the game.':`Lost connection to the game (${e.code}).`);leaveGame();startDemo()}});
 r.presence({n:nick(),tp:S.tp}).catch(()=>{});
 GS.demo=false;GS.drones.forEach(d=>d.dispose());GS.drones=[];GS.player=null;GS.score=[0,0];GS.clock=S.len;GS.overtime=GS.endPending=false;
 if(isHost){n.slots=hostSlots();n.slotsJ=JSON.stringify(n.slots);applySlots(n.slots);kickoff();if(GS.room.p2p){try{history.replaceState(null,'','#'+code)}catch(e){}mpMsg(`Hosting game ${code.toUpperCase()}. Friends open this page, type ${code.toUpperCase()} and press Join (or use this page link, it now ends in #${code}).`)}else mpMsg(`Hosting game ${code.toUpperCase()}. Friends who can open this page join from the menu.`)}
 else{GS.state='wait';banner('Joining…','',2)}
 showMenu(false);$('hud').hidden=false;$('resume').hidden=$('leave').hidden=false;GS.paused=false}
export function leaveGame(){if(!GS.net)return;const r=GS.net.r;GS.net=null;if(GS.hostTune){GS.hostTune=null;applyTune();syncMod()}r.leave().catch(()=>{});GS.room?.presence({game:null,m:null,host:null,pl:null,sz:null}).catch(()=>{});$('leave').hidden=true;if((S.game==='df')!==GS.OBSON)setGame(S.game)}

// connect to the claude.ai room channel, or fall back to PeerJS (p2p) outside claude.ai
export async function connectRoom(){try{GS.room=await window.claude?.use?.('room')}catch(e){GS.room=null}
 {let c=null;try{c=sessionStorage.getItem('dlRejoin');sessionStorage.removeItem('dlRejoin')}catch(e){}if(c)setTimeout(()=>enterGame(c,false),300)}  // back after rebuilding for the host's arena size
 if(!GS.room){GS.room=p2p;$('games').hidden=true;$('mpnote').textContent='Online over the internet: press Host, then send friends this page and the game code. They type the code and press Join.';return}
 $('mpnote').textContent='Host a game, or join one listed here. Bots fill empty slots unless Bots is set to No bots.';
 GS.room.onPeers(ch=>renderGames(ch.peers),e=>{$('mpnote').textContent=`Online play is unavailable here (${e.code}).`;$('host').disabled=$('join').disabled=true})}
