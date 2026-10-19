// ---------- replays: Rocket League-style goal replays (League) and the kill cam (Dogfight), from a ring buffer of render state ----------
// Record: main.js tick() calls rpRec(dt) after every sim step; every 1/60 s of sim time the ball and up to MD drones go into a
// preallocated ring of RN samples (10 s): position, quaternion, velocity, throttle + motor spool, flags (boost, dead, pop). The cosmetic
// events (touch, bump, bounce, popEarn, popFire, goal) go into an event ring, and every Dogfight round fired into a shot ring (guns.js BH).
// Play: a window of the ring is copied into a clip; each rendered frame rpIn() swaps the clip's state at the playback time into the ball
// and drone objects (snapshot interpolation: lerp / slerp between the two samples around it; no physics runs), visuals() draws it with
// the usual trails, flames, ball trail and touch rings, and rpOut() / rpVis() put the live state back, the way main.js lerpIn / lerpOut
// do. Recorded events go to the onFx listeners only (core/events.js replayEv), so effects and sounds replay (sounds ducked) but no
// judge, stat or bot ever sees a replayed touch or goal. The sim isn't deterministic (Rapier, Math.random, frame timing), so this
// replays what was drawn instead of re-simulating it.
// Memory: ring 600 x 89 floats (214 KB) + 4 clips of 600 samples (855 KB) + events and shots (~45 KB), all allocated once.
// Timing: a goal replay starts CEL s after the goal and fits the post-goal wait: goal() (modes/match.js) asks goalHold() how much longer
// to wait, so the host's stT (sent to joiners) covers it; offline the replay ends the wait when it is over or skipped; online the host
// ends it early once every pilot's replay is over (each pilot sends rs, see rpVote and net/net.js).
import {AC,BUS,near,noise,setVolumes} from '../audio/audio.js';
import {COL,GD,GH,GW,H,HL,HW,QT,V3,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {DRAD,GSPD} from '../config/tune.js';
import {onEv,replayEv} from '../core/events.js';
import {CAL,pad} from '../input/input.js';
import {BH,BN,BUL} from '../modes/guns.js';
import {showMenu} from '../modes/match.js';
import {curMode,overlay} from '../modes/registry.js';
import {ball} from '../physics/ball.js';
import {GS,auth,isBot} from '../state.js';
import {rpBadge,rpMenu,rpUIInit} from '../ui/replay.js';
import {dfHt} from '../world/highlands.js';
import {ballMesh} from './ball.js';
import {CAM} from './camera.js';
import {TN} from './drone-mesh.js';
import {fxReset} from './effects.js';
import {emit} from './particles.js';
const HZ=60,RN=600,MD=6,BS=11,DS=13,ST=BS+MD*DS,CN=600,EN=256,ES=12,CE=128,SN=1024,SS=7,CS=512;  // ST floats per sample: ball 11 + 13 per drone
const CEL=2,FOOT=5,POST=1,SLOW=.35,KD=.35;  // goal: wait before the replay (the live explosion), footage before / after the goal (s), slow-mo rate; kill cam start delay
// ---------- recorder ----------
const RT=new Float64Array(RN),RD=new Float32Array(RN*ST),ROS=[];let rh=0,rn=0,rt=0,rLast=-1e9,rosN=0,kickT=-1e9;  // rt: recorder clock (sim s)
const ET=new Float64Array(EN),EV=new Float32Array(EN*ES);let eh=0,en=0;  // events: [type, drone col, other col, p xyz, n xyz, speed, a, b]
const SHT=new Float64Array(SN*2),SHD=new Float32Array(SN*SS);let sh=0,sn=0;  // rounds: t0, t1 | p xyz, v xyz, colour
const col=d=>{for(let k=0;k<rosN;k++)if(ROS[k]===d)return k;return -1};
function wB(A,o){const b=ball;A[o]=b.p.x;A[o+1]=b.p.y;A[o+2]=b.p.z;A[o+3]=b.q.x;A[o+4]=b.q.y;A[o+5]=b.q.z;A[o+6]=b.q.w;A[o+7]=b.v.x;A[o+8]=b.v.y;A[o+9]=b.v.z;A[o+10]=ballMesh.visible?1:0}
function wD(A,o,d){A[o]=d.p.x;A[o+1]=d.p.y;A[o+2]=d.p.z;A[o+3]=d.q.x;A[o+4]=d.q.y;A[o+5]=d.q.z;A[o+6]=d.q.w;A[o+7]=d.v.x;A[o+8]=d.v.y;A[o+9]=d.v.z;A[o+10]=d.thr;A[o+11]=d.ms;
 A[o+12]=(d.boostOn?1:0)|(d.dead>0?2:0)|(d.popT>0?4:0)}
/** after every sim step (main.js tick): one sample every 1/60 s of sim time; a new set of drones (a match, a join) starts the ring over */
export function rpRec(dt){rt+=dt;if(rt-rLast<1/HZ-1e-4)return;rLast=rt;const D=GS.drones,m=Math.min(MD,D.length);let same=m===rosN;for(let i=0;same&&i<m;i++)same=ROS[i]===D[i];
 if(!same){rn=en=sn=0;rosN=m;ROS.length=m;for(let i=0;i<m;i++)ROS[i]=D[i]}
 const o=rh*ST;RT[rh]=rt;wB(RD,o);for(let k=0;k<rosN;k++)wD(RD,o+BS+k*DS,ROS[k]);rh=(rh+1)%RN;if(rn<RN)rn++}
function ev(type,a,b,p,n,sp,x,y){const i=eh,o=i*ES;eh=(eh+1)%EN;if(en<EN)en++;ET[i]=rt;EV[o]=type;EV[o+1]=a;EV[o+2]=b;EV[o+3]=p?p.x:0;EV[o+4]=p?p.y:0;EV[o+5]=p?p.z:0;EV[o+6]=n?n.x:0;EV[o+7]=n?n.y:0;EV[o+8]=n?n.z:0;EV[o+9]=sp;EV[o+10]=x;EV[o+11]=y}
const T_TOUCH=1,T_BUMP=2,T_BOUNCE=3,T_EARN=4,T_FIRE=5,T_GOAL=6;
onEv('touch',e=>{const k=col(e.d);if(k>=0&&e.p&&e.n)ev(T_TOUCH,k,-1,e.p,e.n,e.speed,0,0)});
onEv('bump',e=>{const a=col(e.d),b=col(e.other);if(a>=0&&b>=0&&e.speed>14)ev(T_BUMP,a,b,null,null,e.speed,0,0)});
onEv('bounce',e=>ev(T_BOUNCE,-1,-1,null,null,e.speed,0,0));
onEv('popEarn',e=>{const k=col(e.d);if(k>=0)ev(T_EARN,k,-1,e.p,e.n,0,e.r,0)});
onEv('popFire',e=>{const k=col(e.d);if(k>=0)ev(T_FIRE,k,-1,null,null,0,e.dur,0)});
function shotRec(b){const i=sh;sh=(sh+1)%SN;if(sn<SN)sn++;SHT[i*2]=rt;SHT[i*2+1]=rt+b.life;const o=i*SS;SHD[o]=b.p.x;SHD[o+1]=b.p.y;SHD[o+2]=b.p.z;SHD[o+3]=b.v.x;SHD[o+4]=b.v.y;SHD[o+5]=b.v.z;SHD[o+6]=b.col;b.rpI=i;b.rpT=rt}
function shotEnd(b){const i=b.rpI;if(i!=null&&SHT[i*2]===b.rpT)SHT[i*2+1]=rt}
// ---------- clips: a copied window of the ring (CLIPS[0] the kill cam, 1..3 the last three goals, which the pause menu can replay) ----------
const mkClip=()=>({n:0,t:new Float64Array(CN),d:new Float32Array(CN*ST),ros:[],nd:0,en:0,et:new Float64Array(CE),ev:new Float32Array(CE*ES),sn:0,st:new Float64Array(CS*2),sd:new Float32Array(CS*SS),
 kind:'',tA:0,tB:0,tGoal:0,tTouch:-1,slow:false,cut1:0,cut2:0,team:0,side:1,gx:0,scorer:null,killer:null,victim:null,dur:0,label:'',who:''});
const CLIPS=[mkClip(),mkClip(),mkClip(),mkClip()];export const HLS=[];let gi=0;  // HLS: goal clips for the pause menu, newest first
const cpy=(D,o,A,a,n)=>{for(let x=0;x<n;x++)D[o+x]=A[a+x]};
function copyClip(c,tA,tB){c.n=0;const first=(rh-rn+RN)%RN;let prev=-1;
 for(let j=0;j<rn&&c.n<CN;j++){const i=(first+j)%RN,t=RT[i];if(t<tA){prev=i;continue}if(t>tB)break;if(!c.n&&prev>=0){c.t[0]=RT[prev];cpy(c.d,0,RD,prev*ST,ST);c.n=1}
  c.t[c.n]=t;cpy(c.d,c.n*ST,RD,i*ST,ST);c.n++}
 c.ros.length=0;for(let k=0;k<rosN;k++)c.ros.push(ROS[k]);c.nd=rosN;c.tA=c.n?Math.max(tA,c.t[0]):tA;c.tB=c.n?c.t[c.n-1]:tA;
 c.en=0;const ef=(eh-en+EN)%EN;for(let j=0;j<en&&c.en<CE;j++){const i=(ef+j)%EN,t=ET[i];if(t<c.tA||t>c.tB)continue;c.et[c.en]=t;cpy(c.ev,c.en*ES,EV,i*ES,ES);c.en++}
 c.sn=0;const sf=(sh-sn+SN)%SN;for(let j=0;j<sn&&c.sn<CS;j++){const i=(sf+j)%SN,t0=SHT[i*2],t1=SHT[i*2+1];if(t1<c.tA||t0>c.tB)continue;c.st[c.sn*2]=t0;c.st[c.sn*2+1]=t1;cpy(c.sd,c.sn*SS,SHD,i*SS,SS);c.sn++}
 return c.n>=2}
// playback speed at clip time t: SLOW for the final touch (from .25 s before to .4 s after, eased in and out over .15 s), else 1
function rateAt(c,t){if(!c.slow)return 1;const a=c.tTouch-.25,b=c.tTouch+.4,r=.15;if(t<a-r||t>b+r)return 1;const s=t<a?(a-t)/r:t>b?(t-b)/r:0;return SLOW+(1-SLOW)*s*s*(3-2*s)}
// real seconds to play [tA, tB] (slow-mo included), plus the hold after it so the replayed goal explosion gets 1.4 s
function playLen(c){let s=0,g=0;for(let t=c.tA;t<c.tB;t+=1/240){const d=1/240/rateAt(c,t);s+=d;if(t>=c.tGoal)g+=d}return s+(c.kind==='goal'?Math.max(0,1.4-g):0)}
// the last touch before the goal (the scorer's, and the slow-mo point); events from the ring, or the clip's when it is copied
function lastTouch(tGoal,tA,by){let any=-1;for(let j=0;j<en;j++){const i=(eh-1-j+EN)%EN,t=ET[i];if(t>tGoal)continue;if(t<tA)break;if(EV[i*ES]!==T_TOUCH)continue;if(by<0||EV[i*ES+1]===by)return t;if(any<0)any=t}return any}
// ---------- goal replays ----------
const PEND={on:false,w:0,tGoal:0,team:0,by:-1,gid:-1,p:new V3(),est:0};let RS=null;  // RS: the goal id whose replay this pilot is done with (online vote)
const gid=()=>GS.net&&!GS.net.host?GS.net.ko:GS.koN;
const goalOk=()=>!GS.demo&&S.replay!=='off'&&!GS.OBSON&&!curMode().free&&!overlay()&&rn>HZ&&GS.drones.length>0;
onEv('goal',e=>{if(RP.on&&!RP.hl)stop();goalRT=0;PEND.gid=gid();if(!goalOk()){RS=PEND.gid;PEND.on=false;return}
 PEND.on=true;PEND.w=0;PEND.tGoal=rt;PEND.team=e.team;PEND.p.copy(e.p);let by=-1;for(let k=0;k<rosN;k++)if(ROS[k].key===e.by)by=k;PEND.by=by;
 ev(T_GOAL,by,-1,e.p,null,0,e.team,0);
 const c=EST;c.kind='goal';c.tGoal=rt;c.tA=footStart(rt);c.tB=rt+POST;c.tTouch=lastTouch(rt,c.tA,by);c.slow=S.replay!=='fast'&&c.tTouch>c.tA;PEND.est=playLen(c)});
const EST={kind:'',tA:0,tB:0,tGoal:0,tTouch:-1,slow:false};  // the plan at the moment of the goal (goalHold)
const footStart=tGoal=>Math.max(tGoal-FOOT,kickT+2.2,rn?RT[(rh-rn+RN)%RN]:tGoal);
/** goal() (host / offline): how much longer than the usual 3.2 s the post-goal wait must be for the replay (sim seconds) */
export function goalHold(){if(!PEND.on||!auth())return 0;return Math.max(0,CEL+Math.min(PEND.est,12)+.4-3.2)*GSPD}
/** online: the goal whose replay this pilot has finished, skipped or turned off (sent as rs; the host starts the kickoff once all are done) */
export const rpVote=()=>RS??undefined;
// the wait after a goal ends early: no less than the usual 3.2 s (real time) after the goal, otherwise right away
let goalRT=0;  // real seconds since the goal
function shorten(){if(GS.state==='goal'&&auth()&&GS.goalLen>3.2)GS.stT=Math.min(GS.stT,Math.max(.25,3.2-goalRT)*GSPD)}
function goalDone(){RS=PEND.gid;if(!GS.net)shorten()}
function humansDone(){const n=GS.net;if(RS!==GS.koN)return false;for(const T of n.slots||[])for(const k of T){if(k==='h'||isBot(k))continue;const p=n.peers.find(x=>x.peer===k);if(p&&+p.presence?.rs!==GS.koN)return false}return true}
function startGoal(){PEND.on=false;const c=CLIPS[1+gi++%3];c.kind='goal';c.tGoal=PEND.tGoal;
 if(!copyClip(c,footStart(PEND.tGoal),Math.min(rt,PEND.tGoal+POST))){goalDone();return}
 const by=PEND.by;c.scorer=by>=0?c.ros[by]:null;c.team=PEND.team;c.side=PEND.p.z>0?1:-1;c.gx=(PEND.p.x>=0?-1:1)*(GW/2+14);
 const avail=GS.net?GS.stT/GSPD-.3:1e9;for(let slow=S.replay!=='fast';;){c.tTouch=-1;for(let i=c.en-1;i>=0;i--){if(c.ev[i*ES]!==T_TOUCH||c.et[i]>c.tGoal)continue;if(c.tTouch<0)c.tTouch=c.et[i];if(by<0||c.ev[i*ES+1]===by){c.tTouch=c.et[i];break}}
  c.slow=slow&&c.tTouch>c.tA;c.dur=playLen(c);if(c.dur<=avail)break;if(c.tA<c.tGoal-2){c.tA+=.25;continue}if(slow){slow=false;continue}c.dur=0;break}
 if(c.dur<1.5){goalDone();return}
 // shots: the scorer's chase cam up to just after the last touch, the ball cam following the shot, the goal-line cam for the finish
 c.cut2=c.tGoal-.75;c.cut1=c.tTouch>0?Math.min(c.tTouch+.3,c.cut2):c.tA;if(c.cut2-c.cut1<.5)c.cut1=c.cut2=Math.max(c.cut1,c.tGoal-1.1);
 const d=c.scorer,own=d&&d.team!==c.team;c.who=d?`${own?'OWN GOAL · ':''}<span class="${d.team?'co':'cb'}">${esc(d.name)}</span>`:'GOAL';
 c.label=`${GS.score[0]}–${GS.score[1]} · ${d?esc(d.name)+(own?' (own goal)':''):c.team?'Orange':'Blue'}`;
 for(let i=HLS.length-1;i>=0;i--)if(HLS[i]===c)HLS.splice(i,1);HLS.unshift(c);begin(c,false)}
const esc=s=>String(s).replace(/[&<>"']/g,ch=>'&#'+ch.charCodeAt(0)+';');
// ---------- the kill cam (Dogfight): your quad shot down -> the last ~2.5 s from the killer's camera, during the respawn wait ----------
let wasDead=false,kcW=-1,kcT=0,kcBy=null;
function killWatch(rd,now){const me=GS.player,dead=!!me&&me.dead>0;
 if(dead&&!wasDead&&GS.OBSON&&!GS.demo&&S.killcam!==false&&!RP.on){kcW=0;kcT=rt;kcBy=now-GS.killedAt<1500?GS.killedBy:null}
 wasDead=dead;if(kcW<0)return;if(!dead||!GS.OBSON){kcW=-1;return}kcW+=rd;if(kcW<KD)return;kcW=-1;
 const c=CLIPS[0];c.kind='kill';if(!copyClip(c,kcT-2.1,Math.min(rt,kcT+.35)))return;c.victim=me;c.killer=kcBy&&(kcBy.isTurret||c.ros.includes(kcBy))?kcBy:null;c.slow=false;c.tGoal=1e9;c.dur=playLen(c);
 c.who=c.killer?`Shot down by ${c.killer.isTurret?`<span class="${c.killer.t?'co':'cb'}">${c.killer.t?'Orange':'Blue'} turret</span>`:`<span class="${c.killer.team?'co':'cb'}">${esc(c.killer.name)}</span>`}`:'Shot down';begin(c,false)}
// ---------- playback ----------
const RP={on:false,hl:false,bul:false,c:null,pt:0,i:0,ei:0,el:0,fx:0,hold:0,shot:'',fresh:false,cm:0,pf:new Uint8Array(MD),nsv:0,sv:[]};
const sB={p:new V3(),q:new QT(),v:new V3(),vis:false};
function begin(c,hl){RP.on=true;RP.hl=hl;RP.c=c;RP.pt=c.tA;RP.i=0;RP.ei=0;while(RP.ei<c.en&&c.et[RP.ei]<c.tA)RP.ei++;RP.el=0;RP.hold=0;RP.shot='';RP.fresh=true;
 for(let k=0;k<c.nd;k++)RP.pf[k]=c.d[BS+k*DS+12]&2?1:0;CAM.fn=rpCam;duck(true);rpBadge(c.kind==='kill'?'KILL CAM':hl?'HIGHLIGHT':'REPLAY',c.who)}
function stop(){if(!RP.on)return;const hl=RP.hl;RP.on=false;RP.hl=false;CAM.fn=null;duck(false);rpBadge(null);resetTrails();if(hl)showMenu(true)}
function resetTrails(){for(const d of GS.drones){if(!d.tp)continue;for(let j=0;j<TN;j++)d.p.toArray(d.tp,j*3)}fxReset()}
function duck(on){if(!AC||!BUS)return;if(!on){setVolumes();return}const t=AC.currentTime,v=k=>((S[k]??100)/100)**2;BUS.fx.gain.setTargetAtTime(v('vFx')*.4,t,.05);BUS.mot.gain.setTargetAtTime(v('vMotor')*.25,t,.05);
 BUS.wind.gain.setTargetAtTime(0,t,.05);BUS.oth.gain.setTargetAtTime(v('vOther')*.3,t,.05)}
/** a pause-menu highlight: plays with the match paused, then the pause menu comes back */
export function playHL(c){if(RP.on||!hlOk(c))return;showMenu(false);GS.paused=true;begin(c,true)}
export const hlOk=c=>c.nd>0&&c.ros.every(d=>GS.drones.includes(d));
// skipping: any key (not Esc / P, which pause) or a gamepad button not bound to a stick channel, once the replay has run .3 s
function skip(){if(!RP.on||GS.menuOpen||RP.el<.3)return;const goal=RP.c.kind==='goal'&&!RP.hl;stop();if(goal)goalDone()}
const pb=new Uint8Array(32);let lastSt='';
function padSkip(){const g=pad();if(!g)return;const C=CAL();for(let i=0;i<g.buttons.length&&i<32;i++){const on=g.buttons[i].pressed?1:0;
 if(on&&!pb[i]){let bound=false;for(const c of C)if(c.a===100+i||c.b===i||c.nb?.a===100+i)bound=true;if(!bound)skip()}pb[i]=on}}
/** every rendered frame, before the scene is drawn: starts, advances and ends replays; true while one is drawn (main.js then calls rpIn / rpOut / rpVis) */
export function rpFrame(dt,now){const rd=GS.menuOpen||GS.paused&&!RP.hl?0:dt;if(GS.state==='kickoff'&&lastSt!=='kickoff'){kickT=rt;PEND.on=false}lastSt=GS.state;if(GS.state==='goal')goalRT+=rd;  // kickoff (host, offline and joiners): goal footage never reaches back past it
 if(RP.on)padSkip();else pb.fill(0);
 if(PEND.on){if(GS.state!=='goal'||GS.demo){PEND.on=false}else if((PEND.w+=rd)>=CEL)startGoal()}
 if(GS.net?.host&&GS.state==='goal'&&GS.goalLen>3.2&&!RP.on&&!PEND.on&&humansDone())shorten();
 killWatch(rd,now);rpMenu();if(!RP.on)return false;const c=RP.c;
 if(RP.hl?GS.menuOpen:c.kind==='goal'?GS.state!=='goal':!GS.player||GS.player.dead<=0||!GS.OBSON){stop();return false}
 const r=rateAt(c,RP.pt);RP.fx=rd*r;RP.el+=rd;if(RP.pt<c.tB)RP.pt=Math.min(c.tB,RP.pt+rd*r);else if(RP.el>=c.dur||c.kind==='kill'){const g=c.kind==='goal'&&!RP.hl;stop();if(g)goalDone();return false}
 return true}
/** effects time step for visuals() while a replay is drawn (real time x the slow-mo rate) */
export const rpDt=()=>RP.fx;
const _a=new V3(),_b=new V3(),_q=new QT(),_qb=new QT();
function lerp3(v,A,a,b,k){v.set(A[a]+(A[b]-A[a])*k,A[a+1]+(A[b+1]-A[a+1])*k,A[a+2]+(A[b+2]-A[a+2])*k)}
function slerp4(q,A,a,b,k){_q.set(A[a],A[a+1],A[a+2],A[a+3]);_qb.set(A[b],A[b+1],A[b+2],A[b+3]);q.slerpQuaternions(_q,_qb,k)}
function save(d){const s=d._rs||(d._rs={p:new V3(),q:new QT(),v:new V3(),thr:0,ms:0,bo:false,dead:0,popT:0,vis:false});s.p.copy(d.p);s.q.copy(d.q);s.v.copy(d.v);s.thr=d.thr;s.ms=d.ms;s.bo=d.boostOn;s.dead=d.dead;s.popT=d.popT;s.vis=d.mesh.visible;RP.sv[RP.nsv++]=d}
// bullets: the live pool is put aside and filled with the clip's rounds where they were at the playback time (guns.js dfDraw draws them)
const BSV=new Float32Array(BN*9),BBY=new Array(BN).fill(null);
function bulIn(c,pt){for(let i=0;i<BN;i++){const b=BUL[i],o=i*9;BSV[o]=b.p.x;BSV[o+1]=b.p.y;BSV[o+2]=b.p.z;BSV[o+3]=b.v.x;BSV[o+4]=b.v.y;BSV[o+5]=b.v.z;BSV[o+6]=b.life;BSV[o+7]=b.dist||0;BSV[o+8]=b.col;BBY[i]=b.by;b.life=0}
 let n=0;for(let j=0;j<c.sn&&n<BN;j++){const t0=c.st[j*2],t1=c.st[j*2+1];if(pt<t0||pt>=t1)continue;const b=BUL[n++],o=j*SS,s=pt-t0;b.v.set(c.sd[o+3],c.sd[o+4],c.sd[o+5]);b.p.set(c.sd[o],c.sd[o+1],c.sd[o+2]).addScaledVector(b.v,s);b.life=t1-pt;b.dist=b.v.length()*s;b.col=c.sd[o+6];b.by=null}}
function bulOut(){for(let i=0;i<BN;i++){const b=BUL[i],o=i*9;b.p.set(BSV[o],BSV[o+1],BSV[o+2]);b.v.set(BSV[o+3],BSV[o+4],BSV[o+5]);b.life=BSV[o+6];b.dist=BSV[o+7];b.col=BSV[o+8];b.by=BBY[i];BBY[i]=null}}
// recorded events at the playback time, to the cosmetic (onFx) listeners; payloads reused
const P_T={type:'ball',d:null,tag:'',speed:0,p:new V3(),n:new V3(),verdict:''},P_B={type:'drone',d:null,tag:'',other:null,otherTag:'',speed:0},P_BO={speed:0},P_E={d:null,p:new V3(),n:new V3(),r:0},P_F={d:null,dur:0},P_G={team:0,by:null,p:new V3()};
function fire(c,j){const o=j*ES,E=c.ev,ty=E[o],d=E[o+1]>=0?c.ros[E[o+1]]:null;
 if(ty===T_TOUCH&&d){P_T.d=d;P_T.speed=E[o+9];P_T.p.set(E[o+3],E[o+4],E[o+5]);P_T.n.set(E[o+6],E[o+7],E[o+8]);replayEv('touch',P_T)}
 else if(ty===T_BUMP&&d){P_B.d=d;P_B.other=c.ros[E[o+2]];P_B.speed=E[o+9];replayEv('bump',P_B)}
 else if(ty===T_BOUNCE){P_BO.speed=E[o+9];replayEv('bounce',P_BO)}
 else if(ty===T_EARN&&d){P_E.d=d;P_E.p.set(E[o+3],E[o+4],E[o+5]);P_E.n.set(E[o+6],E[o+7],E[o+8]);P_E.r=E[o+10];replayEv('popEarn',P_E)}
 else if(ty===T_FIRE&&d){P_F.d=d;P_F.dur=E[o+10];replayEv('popFire',P_F)}
 else if(ty===T_GOAL){P_G.team=E[o+10];P_G.by=d?d.key:null;P_G.p.set(E[o+3],E[o+4],E[o+5]);replayEv('goal',P_G)}}
let FR=0;
/** swap the clip's state at the playback time into the ball and drones (after the sim steps, before visuals) */
export function rpIn(){const c=RP.c,pt=RP.pt,A=c.d;GS.rpOn=true;RP.nsv=0;FR++;
 let i=RP.i;while(i<c.n-2&&c.t[i+1]<=pt)i++;RP.i=i;const j=Math.min(i+1,c.n-1),t0=c.t[i],t1=c.t[j],k=t1>t0?cl((pt-t0)/(t1-t0),0,1):0,oa=i*ST,ob=j*ST,near1=k<.5?oa:ob;
 sB.p.copy(ball.p);sB.q.copy(ball.q);sB.v.copy(ball.v);sB.vis=ballMesh.visible;lerp3(ball.p,A,oa,ob,k);slerp4(ball.q,A,oa+3,ob+3,k);lerp3(ball.v,A,oa+7,ob+7,k);ballMesh.visible=A[near1+10]>.5&&!GS.OBSON;
 for(let n=0;n<c.nd;n++){const d=c.ros[n];if(!d.mesh||!d.mesh.parent)continue;d._rpF=FR;save(d);const a=oa+BS+n*DS,b=ob+BS+n*DS,f=A[(k<.5?a:b)+12];
  const jump=(A[b]-A[a])**2+(A[b+1]-A[a+1])**2+(A[b+2]-A[a+2])**2>400,kk=jump?(k<.5?0:1):k;  // a respawn between the two samples: no sliding across the map
  lerp3(d.p,A,a,b,kk);slerp4(d.q,A,a+3,b+3,kk);lerp3(d.v,A,a+7,b+7,kk);d.thr=A[a+10]+(A[b+10]-A[a+10])*kk;d.ms=A[a+11]+(A[b+11]-A[a+11])*kk;
  d.boostOn=!!(f&1);d.dead=f&2?1:0;d.popT=f&4?.2:0;d.mesh.visible=!(f&2)&&!(c.kind==='kill'&&d===c.killer);if(d.fx)d.fx.g=0;
  const dd=f&2?1:0;if(dd&&!RP.pf[n]&&!RP.fresh){emit(d.p,COL[d.team],160,30,1.2);emit(d.p,0xffc640,80,18,1);noise(.6,200,.7*near(d.p))}RP.pf[n]=dd}  // shot down / demolished: the burst
 for(const d of GS.drones)if(d._rpF!==FR){save(d);d.dead=1;d.boostOn=false;d.mesh.visible=false}  // not in the clip: hidden
 RP.cm=GS.camMode;GS.camMode=1;RP.bul=GS.OBSON;if(RP.bul)bulIn(c,pt);
 if(RP.fresh){RP.fresh=false;resetTrails()}
 while(RP.ei<c.en&&c.et[RP.ei]<=pt)fire(c,RP.ei++)}
/** the live state back (before the HUD's net packet); the meshes keep the replay's transforms for this frame's draw */
export function rpOut(){ball.p.copy(sB.p);ball.q.copy(sB.q);ball.v.copy(sB.v);
 for(let n=0;n<RP.nsv;n++){const d=RP.sv[n],s=d._rs;d.p.copy(s.p);d.q.copy(s.q);d.v.copy(s.v);d.thr=s.thr;d.ms=s.ms;d.boostOn=s.bo;d.dead=s.dead;d.popT=s.popT}
 GS.camMode=RP.cm;if(RP.bul)bulOut();RP.bul=false;GS.rpOn=false}
/** after the frame is drawn: the live visibility of the ball and drones back */
export function rpVis(){ballMesh.visible=sB.vis;for(let n=0;n<RP.nsv;n++){const d=RP.sv[n];d.mesh.visible=d._rs.vis;RP.sv[n]=null}RP.nsv=0}
// ---------- replay cameras ----------
const cp=new V3(),cl3=new V3(),fw=new V3(0,0,-1),_t=new V3(),_f=new V3(),_cq=new QT(),_tq=new QT(),_x=new V3(1,0,0);
const inArena=v=>{v.x=cl(v.x,-HW+1,HW-1);v.y=cl(v.y,.8,H-1);v.z=cl(v.z,-HL-GD+1,HL+GD-1);return v};
function rpCam(cam,dt,setFov){const c=RP.c,s=c.kind==='kill'?(c.killer?'killer':'victim'):RP.pt<c.cut1?(c.scorer?'chase':'ball'):RP.pt<c.cut2?'ball':'goal';
 const cut=s!==RP.shot;RP.shot=s;const fdt=RP.fx,k=n=>cut?1:1-Math.exp(-fdt*n);
 if(s==='chase'){const d=c.scorer;_f.set(0,0,-1).applyQuaternion(d.q).setY(0);if(_f.lengthSq()<.05)_f.copy(d.v).setY(0);_f.normalize();_t.subVectors(ball.p,d.p).setY(0);if(_t.lengthSq()>1)_f.multiplyScalar(.4).addScaledVector(_t.normalize(),.6);
  if(_f.lengthSq()<.01)_f.copy(fw);fw.lerp(_f.normalize(),k(4)).normalize();const sc=1+.35*(DRAD/.6-1);cp.lerp(inArena(_t.copy(d.p).addScaledVector(fw,-11*sc).add(_a.set(0,4*sc,0))),k(6));cl3.lerp(_t.lerpVectors(d.p,ball.p,.4),k(8));setFov(80,false)}
 else if(s==='ball'){_f.copy(ball.v).setY(0);if(_f.lengthSq()<16)_f.set(0,0,c.side);fw.lerp(_f.normalize(),k(3)).normalize();cp.lerp(inArena(_t.copy(ball.p).addScaledVector(fw,-16).add(_a.set(0,5,0))),k(5));cl3.lerp(_t.copy(ball.p).addScaledVector(ball.v,.12),k(10));setFov(70,false)}
 else if(s==='goal'){cp.set(c.gx,7,c.side*(HL-16));_t.set(0,GH*.4,c.side*HL);if(ballMesh.visible)_t.lerp(ball.p,.6);cl3.lerp(_t,k(6));setFov(55,false)}  // beside the goal mouth, looking between the ball and the goal
 else if(s==='killer'){const K=c.killer;if(K.isTurret){cp.copy(K.p).add(_a.set(0,2.5,0));cl3.lerp(c.victim.p,k(10));setFov(50,false)}
  else{_tq.setFromAxisAngle(_x,(K.tilt??30)*Math.PI/180).premultiply(K.q);cam.position.copy(K.p).add(_t.set(0,.25,-.38).multiplyScalar(DRAD/.6).applyQuaternion(K.q));_cq.slerp(_tq,cut?1:k(25));cam.quaternion.copy(_cq);setFov(100,false);return}}
 else{const d=c.victim;_f.copy(d.v).setY(0);if(_f.lengthSq()<1)_f.set(0,0,-1).applyQuaternion(d.q).setY(0);fw.lerp(_f.normalize(),k(4)).normalize();_t.copy(d.p).addScaledVector(fw,-12).add(_a.set(0,4,0));_t.y=Math.max(_t.y,dfHt(_t.x,_t.z)+2);cp.lerp(_t,k(6));cl3.lerp(d.p,k(10));setFov(85,false)}
 cam.position.copy(cp);cam.lookAt(cl3)}
// ---------- setup (main.js, before the menu is built) ----------
export function rpInit(){if(!['on','fast','off'].includes(S.replay))S.replay='on';if(typeof S.killcam!=='boolean')S.killcam=true;BH.shot=shotRec;BH.end=shotEnd;rpUIInit();
 addEventListener('keydown',e=>{if(e.repeat||!RP.on||RP.el<.3||GS.menuOpen||['Escape','KeyP','KeyT'].includes(e.code)||e.target.matches?.('textarea,input,select'))return;skip();e.stopImmediatePropagation()},true);  // capture: the key that skips doesn't also cycle the camera etc.
 addEventListener('pointerdown',e=>{if(RP.on&&!e.target.closest?.('#menu,#mod,#lab,button,input,select,textarea'))skip()})}
/** read-only state for tools (tools/replay-check.mjs) */
export const rpState=()=>({on:RP.on,hl:RP.hl,kind:RP.c?.kind||'',pt:RP.pt,el:RP.el,shot:RP.shot,pend:PEND.on,rs:RS,rn,rt,hl3:HLS.length,clip:RP.c&&{n:RP.c.n,tA:RP.c.tA,tB:RP.c.tB,tGoal:RP.c.tGoal,tTouch:RP.c.tTouch,dur:RP.c.dur,slow:RP.c.slow,cut1:RP.c.cut1,cut2:RP.c.cut2}});
export const rpDebug={RT,RD,ST,BS,DS,CLIPS,get rh(){return rh},get rn(){return rn},skip:()=>skip()};
