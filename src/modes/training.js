// ---------- Skill training packs (Rocket League's training packs): set shots with the real game physics, no bots ----------
// A pack (training/packs.js) is a list of shots: a ball spawn (position, velocity or aim, spin) and a player spawn. Each shot waits
// frozen ('ready') until you move a stick, then runs ('live') with the shot timer until training/judge.js gives a verdict; the result
// shows for a moment ('result'), then a success moves on to the next shot and a miss resets the same one. After the last shot the
// pack summary shows ('sum') and the best result is saved in S.train. The mode's hooks (modes/registry.js) run while it is the mode:
// pre = trainPre() before the flight model (holds the ready shot), post = trainPost() after the touches (success detection); goals don't score.
import {AC,audioInit,noise,tone} from '../audio/audio.js';
import {$,COL,HL,HW,QT,UP,V3} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {BD,BG,BR} from '../config/tune.js';
import {Drone} from '../flight/drone.js';
import {stk} from '../flight/rates.js';
import {humanControl} from '../input/input.js';
import {setGame} from './dogfight.js';
import {exitLab} from './lab.js';
import {showMenu} from './match.js';
import {registerMode} from './registry.js';
import {leaveGame} from '../net/net.js';
import {ball,ballPhys} from '../physics/ball.js';
import {onEv} from '../core/events.js';
import {ballMesh} from '../render/ball.js';
import {emit} from '../render/particles.js';
import {GS} from '../state.js';
import {aimVel,better,carrying,judge,newResults,packScore,record,toLocal,toWorld,vecWorld,yawWorld} from '../training/judge.js';
import {packById} from '../training/packs.js';
import {TR} from '../training/trstate.js';
import {banner} from '../ui/hud.js';
export {TR};
// hidden: no mode button on the main menu (the Training hub starts packs); free: no match clock, R / Xbox Y = retry shot
registerMode('train',{name:'Training',title:'TRAINING',world:'arena',order:90,free:true,hidden:true,
 sub:'Skill packs: striker, goalie, aerial, dribbling and pop shots with the real ball. Rookie, Pro and All-Star.',
 pre:dt=>trainPre(dt),post:dt=>trainPost(dt),allowGoals:()=>!TR.on,exit:()=>trainOff()});  // leaving the mode (setGame to another) ends the pack
Object.assign(TR,{pack:null,i:0,t:0,rt:0,res:[],shot:null,kind:'goal',req:{},limit:10,flip:false,sp:null,base:null,last:null,verdict:null,touched:false,tt:0,carry:0,rest:0,popped:false,
 wasF:false,pred:false,pk:0,top:.6,score:null,best:null,newBest:false,ver:0,path:[]});
const _u=new V3(),_q=new QT(),_r=new V3(),_rv=new V3(),RESULT_OK=1.7,RESULT_MISS=1.4;
// top of the quad's parts above its centre (the ball rests at top + BR)
const topOf=d=>Math.max(.3,...d.lo.colliders.map(c=>c.pos[1]+(c.shape==='box'?c.size[1]:c.size[0])));
// a shot's spawn in world coordinates
export function shotSpawn(P,sh,top){const f=P.kind==='save',b=sh.ball,dr=sh.drone,dp=new V3(...toWorld(dr.p[0],Math.max(1,dr.p[1]),dr.p[2],HL,f)),dq=new QT().setFromAxisAngle(UP,yawWorld(dr.yaw||0,f));
 if(b.on)return{dp,dq,on:true,bp:dp.clone().add(_u.set(0,top+BR-.05,0)),bv:new V3(),bw:new V3()};
 const x=b.wall!=null?Math.sign(b.wall)*(HW-Math.abs(b.wall)):b.p[0],lp=[Math.max(-HW+BR+1,Math.min(HW-BR-1,x)),b.p[1],b.p[2]],
  v=b.aim?aimVel(lp,b.aim,b.aim[3],BG,BD):b.v||[0,0,0];
 return{dp,dq,on:false,bp:new V3(...toWorld(lp[0],lp[1]+BR,lp[2],HL,f)),bv:new V3(...vecWorld(v,f)),bw:new V3(...vecWorld(b.w||[0,0,0],f))}}
// where the ball will go untouched (the preview line while the shot waits), and whether it goes into the goal that matters
const _pb={p:new V3(),v:new V3(),w:new V3(),c:false,n:new V3()};
function sim(p,v,w,c,n,secs,each){_pb.p.copy(p);_pb.v.copy(v);_pb.w.copy(w);_pb.c=c;_pb.n.copy(n);const dt=1/60;
 for(let k=0;k<secs*60;k++){ballPhys(_pb,dt);const d=toLocal([_pb.p.x,_pb.p.y,_pb.p.z],HL,TR.flip)[2];if(each&&each(_pb.p,k))return null;if(d<-BR)return 1;if(d>2*HL+BR)return -1}return 0}
const willScore=()=>sim(ball.p,ball.v,ball.w,ball.c,ball.n,3)===1;
// ---- pack flow
export function startPack(id){const P=packById(id);if(!P)return false;leaveGame();exitLab();audioInit();AC?.resume();setGame('train');
 GS.drones.forEach(d=>d.dispose());const d=new Drone(0,0,false,'h');d.name='You';d.setLoadout(S.loadout);d.spawn=()=>retryShot();GS.drones=[d];GS.player=d;
 GS.demo=false;GS.state='play';GS.score=[0,0];GS.timeScale=1;GS.overtime=GS.endPending=false;
 Object.assign(TR,{on:true,pack:P,flip:P.kind==='save',res:newResults(P.shots.length),top:topOf(d),score:null,newBest:false,best:S.train?.[P.id]||null});
 showMenu(false);$('hud').hidden=false;$('resume').hidden=false;loadShot(0);return true}
function trainOff(){if(!TR.on)return;TR.on=false;TR.ph='off';TR.ver++;ballMesh.visible=true}
export function exitTrain(){if(!TR.on)return false;trainOff();setGame(S.game);return true}
export function restartPack(){if(TR.pack)startPack(TR.pack.id)}
export function loadShot(i){const P=TR.pack;if(!P)return;i=Math.max(0,Math.min(P.shots.length-1,i));const sh=P.shots[i],k=sh.kind||P.kind;
 Object.assign(TR,{i,shot:sh,kind:k,req:k===P.kind?P.req||{}:{},limit:sh.t||P.t,ph:'ready',t:0,rt:0,base:null,verdict:null,last:null,touched:false,tt:0,carry:0,rest:0,popped:false,pred:false,pk:0});
 TR.sp=shotSpawn(P,sh,TR.top);hold();TR.wasF=ball.p.y<BR+.25;ballMesh.visible=true;const d=GS.player;d.boost=100;d.popC=0;d.hp=100;
 // preview of the untouched ball: where it goes in the first 2.5 s
 TR.path=[];if(!TR.sp.on)sim(TR.sp.bp,TR.sp.bv,TR.sp.bw,false,_u.set(0,1,0),2.5,(p,k)=>{if(k%3===0)TR.path.push(p.toArray());return false});
 TR.ver++;tone(660,660,.08,.06,'square')}
export function retryShot(){if(!TR.on)return;if(TR.ph==='sum'){restartPack();return}loadShot(TR.i)}
export function nextShot(){if(!TR.on||TR.ph==='sum')return;if(TR.i+1<TR.pack.shots.length)loadShot(TR.i+1);else finish()}
export function prevShot(){if(!TR.on||TR.ph==='sum')return;loadShot(TR.i-1)}
export function finish(){if(!TR.on)return;TR.ph='sum';TR.score=packScore(TR.res);const id=TR.pack.id,old=S.train[id];TR.best=old||null;
 TR.newBest=TR.score.n>0&&better(TR.score,old);if(!old||TR.newBest){S.train[id]={n:TR.score.n,of:TR.score.of,t:TR.score.t};save()}hold();TR.ver++}
// start the shot now (the first stick movement does this; tools and the smoke test call it directly)
export function goShot(){if(!TR.on||TR.ph!=='ready')return;ball.v.copy(TR.sp.bv);ball.w.copy(TR.sp.bw);TR.ph='live';TR.t=0;TR.ver++;tone(990,990,.12,.07,'square')}
// the quad and the ball held at the shot's spawn
function hold(){const d=GS.player,s=TR.sp;if(!d||!s)return;d.p.copy(s.dp);d.q.copy(s.dq);d.v.set(0,0,0);d.w.set(0,0,0);d.wt.set(0,0,0);d.flipT=0;d.popT=0;d.popC=0;d.dead=0;
 ball.p.copy(s.bp);ball.v.set(0,0,0);ball.w.set(0,0,0);ball.c=false;ball.last=null}
// latest touch by the player: height of the ball's underside and whether it was a pop
onEv('touch',e=>{if(!TR.on||TR.ph!=='live'||e.d!==GS.player)return;TR.touched=true;TR.tt=TR.t;TR.last={y:+(ball.p.y-BR).toFixed(2),pop:e.d.popT>0};if(TR.last.pop)TR.popped=true});
// ---- per physics step. true = handled (step.js only runs the Rapier step), false = run the normal game step
export function trainPre(dt){const d=GS.player;if(!TR.on||!d)return false;
 if(TR.ph==='ready'){humanControl(d,dt);hold();TR.rt+=dt;const s=[stk[0],stk[1],stk[2],stk[3]];
  if(!TR.base||TR.rt<.25)TR.base=s;else if(s.some((v,i)=>Math.abs(v-TR.base[i])>(i<3?.2:.12)))goShot();return true}
 if(TR.ph==='sum'){hold();d.thr=d.ms=0;return true}
 if(TR.ph==='live')TR.t+=dt;
 return false}
export function trainPost(dt){const d=GS.player;if(!TR.on||!d)return;
 if(TR.ph==='result'){if((TR.rt-=dt)<=0){if(TR.verdict.ok)nextShot();else loadShot(TR.i)}return}
 if(TR.ph!=='live')return;
 const L=toLocal([ball.p.x,ball.p.y,ball.p.z],HL,TR.flip),goal=L[2]<-BR?1:L[2]>2*HL+BR?-1:0;
 if(++TR.pk%4===0||goal)TR.pred=!goal&&willScore();
 _r.subVectors(ball.p,d.p);_rv.subVectors(ball.v,d.v);if(carrying(_r.toArray(),_rv.toArray(),BR,TR.top)){TR.carry+=dt;TR.touched=true}
 const onF=ball.p.y<BR+.25,land=onF&&!TR.wasF?[L[0],L[2]]:null;if(land)TR.land=land.map(x=>+x.toFixed(1));TR.wasF=onF;TR.rest=TR.touched&&onF&&ball.v.length()<2?TR.rest+dt:0;
 const v=judge({kind:TR.kind,req:TR.req,t:TR.t,limit:TR.limit,touched:TR.touched,since:TR.t-TR.tt,goal,pred:TR.pred,last:TR.last,carry:TR.carry,popped:TR.popped,land,zone:TR.shot.zone,rest:TR.rest});
 if(v)verdict(v)}
function verdict(v){TR.verdict={...v,t:+TR.t.toFixed(2)};TR.ph='result';TR.rt=v.ok?RESULT_OK:RESULT_MISS;record(TR.res[TR.i],v.ok,+TR.t.toFixed(2));TR.ver++;
 if(v.ok){if(v.why==='Goal'){ballMesh.visible=false;emit(ball.p,COL[0],420,42,1.6);emit(ball.p,0xffffff,140,24,1.1);noise(1.2,300,.8,.6)}else emit(ball.p,0x7dff9a,160,22,1);
  banner(v.why==='Goal'?'GOAL!':v.why==='Saved'||v.why==='Kept out'?'SAVED!':'ON TARGET!','cb tr-ok',1.5);tone(880,1320,.35,.16,'triangle')}
 else{if(v.why==='Goal against'){ballMesh.visible=false;emit(ball.p,COL[1],300,36,1.4)}banner(v.why==='Goal against'?'SCORED ON':'MISSED','co tr-miss',1.3);tone(300,150,.35,.14,'sawtooth')}}
// read-only snapshot for tools/smoke.mjs and tools/training-check.mjs
export const trainSnap=()=>({on:TR.on,ph:TR.ph,pack:TR.pack?.id??null,i:TR.i,n:TR.pack?.shots.length??0,t:+TR.t.toFixed(2),kind:TR.kind,touched:TR.touched,carry:+TR.carry.toFixed(2),pred:TR.pred,
 last:TR.last,land:TR.land,verdict:TR.verdict,res:TR.res.map(r=>({...r})),score:TR.score,newBest:TR.newBest,saved:TR.pack?S.train[TR.pack.id]??null:null});
