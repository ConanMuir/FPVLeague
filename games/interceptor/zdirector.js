/* Zombies spectator director: an auto-camera for watching bots play (the "Director" camera of zspectate.js, the default when spectating a
   bot). It cuts between the most dramatic moments of a run like a sports broadcast.
   Moments: a scorer runs ten times a second (every frame at fast-forward) and gives each kind of moment a score from how soon it happens and
   what is at stake: the bot's coming intercept (time to meet from lead.js) and its proximity burst, enemies closing on a site (the weaker the
   site the better), boss entrances and deaths, personal-swarm strikes, site hits and losses, near misses, big explosions, a sortie run on a
   target, wave starts, the bot's own flight (Z.bot.intent {kind, target: {x, y, z, label}, why} from the brain: roaming and shopping are
   quiet, bombing is a climax; the track it is chasing comes from its pilot, or from a target that is a track or its id) and a quiet establishing shot as the floor. Each beat the best moment wins; the one on air gets a bonus so nothing flickers.
   Shots: chase, pursuit (behind the bot, looking at its target), fpv (the bot's nose camera with the goggle look), orbit, wide establishing,
   low trackside, reverse angle, a slow push-in on a boss, the defender's view of a site under attack and a blast shot for the payoff. Each
   moment has its own list of shots, tried in turn and checked before use: camera clear of terrain, trees and buildings (api.sdf), a clear
   line to the subject, the subject in frame. A shot stays at least MINL seconds (HARD for an interrupt, which needs a much bigger moment) and
   at most its own limit. A cut waits while an explosion in view is still going, unless something bigger starts. A cut is a cut; an ease (a
   short dolly that keeps the subject framed) is used when the next shot follows the same subject.
   Broadcast touches: a lower-third name card when a boss arrives, a kill count that ticks in a corner. No replay: the game has no replay
   facility to borrow.
   It runs in the spectator's Z.cam slot (after the game's own camera, before the HUD and overlays) on the render pose of the bodies
   (engine/interp.js has them in between ticks). The scorer allocates nothing per run (fixed slots, scratch vectors); a frame is one pose and
   a couple of terrain samples. Harness: tools/zombies-test.mjs "director"; window.__z.spec.dir has the state, the log and leaks(). */
import {KIND} from './zdata.js';
import {solve} from './lead.js';
import {BOSSES} from './zbosses.js';
import {clampFov} from '../../engine/render.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,ramp=(x,a,b)=>cl((x-a)/(b-a),0,1),sm=t=>t*t*(3-2*t),DEG=Math.PI/180,esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);
export const HARD=1.8,MINL=2.5,MARGIN=.18;
/* [shortest, longest] seconds a shot stays on air */
export const SHOTS={chase:[4,10],pursuit:[3.5,9],fpv:[2.5,8],orbit:[4,9],wide:[4.5,10],low:[3,6.5],reverse:[2,4.5],push:[6,12],defender:[4,9],blast:[2.2,3.6]};
export const KN=['intercept','threat','boss','boss down','swarm strike','site','near miss','blast','sortie','wave','bot','launch','ambient'];
const INT=0,THR=1,BOSS=2,BOSSX=3,SWM=4,SITE=5,MISS=6,BLAST=7,SORT=8,WAVE=9,BOT=10,LAUNCH=11,AMB=12;
/* the shots each kind of moment tries, in turn (fpv first for an intercept a few seconds away) */
const GRAM=[['pursuit','low','chase','wide'],['defender','low','wide','orbit'],['push','orbit','wide','pursuit'],['orbit','wide'],['chase','low','wide'],['orbit','wide'],['reverse','low'],['wide','orbit'],['chase','orbit','wide'],['wide'],['chase','pursuit','low','wide'],['chase','low'],['wide','orbit']];
const G_FPV=['fpv','pursuit','reverse','chase'];
export function initDirector(api,G,Z,opts={}){
 const {THREE,TH,SITES,S:ST,gh}=api,V3=THREE.Vector3,QT=THREE.Quaternion,M4=new THREE.Matrix4(),UP=new V3(0,1,0),X1=new V3(1,0,0),cam=api.camera;
 const SC=new V3(0,0,1950),SCN=new V3(0,30,1950),_a=new V3(),_b=new V3(),_c=new V3(),_f=new V3(),_r=new V3(),_u=new V3(),_e=new V3(),_q=new QT(),LS={p:new V3(),tau:0,unc:0,ok:true};
 let ON=false,shotNo=0,sseq=0,lastKills=-1,prevState='',logN=0,nmT=null,nmDone=false;
 /* the clock, the last scorer run, the bot's flight time, the end and size of the explosion lock, the end of the name card: doubles live in a typed array because a closure variable boxes every new one */
 const T=new Float64Array(12);T[1]=-9;T[10]=-99;
 const BR=[null,null,null,null],BT=new Float64Array(4);let bossN=0;  /* the bosses seen: who, and when the director first saw them */
 const sub=()=>({ref:null,p:new V3(),v:new V3(),live:false,on:false,bot:false,sw:false,cls:3,id:0});
 const mkShot=()=>({on:false,type:'',kind:0,sa:null,st0:0,t0:0,age:0,len:0,min:0,A:sub(),B:sub(),sp:new V3(),h:new V3(0,0,-1),P:new V3(),L:new V3(),P0:new V3(),pe:new V3(),fov:60,fe:60,fovO:60,ease:0,side:1,ang:0,w:0,R:0,hg:0,score:0,blk:0,lost:0,mat:0,label:'',lab:''});
 let cur=mkShot(),nxt=mkShot();
 /* one slot per kind of moment: s the score now, s0 its first score (events fade), mag how big a thing it is (what may interrupt an explosion),
    a and b the bodies it is about, at: x, y, z hold a place it is about */
 const C=KN.map((n,i)=>({i,n,s:0,s0:0,mag:0,a:null,b:null,x:0,y:0,z:0,at:false,ev:false,t0:-1e9,until:-1e9,tau:0,shown:-1e9}));
 for(const i of[BOSSX,SWM,SITE,MISS,BLAST,WAVE,LAUNCH])C[i].ev=true;
 const IN={t:null,k:''},gN=new Int16Array(64),glead=new Array(64).fill(null),SHP=new Float64Array(8).fill(-1);
 const BM={x:new Float64Array(16),y:new Float64Array(16),z:new Float64Array(16),k:new Float64Array(16),t:new Float64Array(16),n:0};
 const LOG=Array.from({length:64},()=>({type:'',kind:'',why:'',t0:0,t1:0,locked:false,lockPow:0,lx:0,ly:0,lz:0,key:0,dist:0}));
 const stats={shots:0,cuts:0,eases:0,interrupts:0,forced:0,kinds:{},types:{},rej:{}};
 for(const n of KN)stats.kinds[n]=0;for(const n of Object.keys(SHOTS))stats.types[n]=0;
 const sdf=(x,y,z)=>api.sdf?api.sdf(x,y,z):-99;
 const botOK=()=>{const m=api.player;return !!m&&m.dead<=0&&!api.demo};

 /* ---------- the bodies the shots point at ---------- */
 function refresh(s,dt){const r=s.ref;if(!r)return;
  if(s.bot){if(r.dead<=0){s.p.copy(r.p);s.v.copy(r.v);s.live=true}else{s.live=false;s.v.set(0,0,0)}return}
  if(s.sw){let n=0;_a.set(0,0,0);_b.set(0,0,0);for(let i=0;i<r.d.length;i++){const d=r.d[i];if(d.st==='strike'||d.st==='gnd'){n++;_a.add(d.p);_b.add(d.v)}}
   if(n){s.p.copy(_a).divideScalar(n);s.v.copy(_b).divideScalar(n);s.live=true}else{s.live=false;s.v.set(0,0,0)}return}
  if(api.live(r)&&r.st!=='fall'){s.p.copy(r.p);s.v.copy(r.v);s.live=true}else{s.live=false;s.v.multiplyScalar(dt>0?Math.exp(-dt*4):1)}}
 function bind(s,ref,x,y,z){s.ref=ref||null;s.bot=s.sw=false;s.live=true;s.on=true;s.id=0;s.v.set(0,0,0);
  if(!ref){s.p.set(x,y,z);s.cls=3;return}
  if(ref.p)s.p.copy(ref.p);else s.p.set(x,y,z);
  if(ref===api.player){s.bot=true;s.cls=4}else if(ref.d&&ref.mode!==undefined){s.sw=true;s.cls=3}else{const K=KIND[ref.k];s.cls=K&&K.armor==='boss'?2:ref.v.length()>=110?1:0;s.id=ref.id|0}
  refresh(s,0)}
 function unbind(s){s.ref=null;s.on=false;s.live=false;s.bot=s.sw=false}

 /* ---------- terrain, buildings, line of sight, framing ---------- */
 /* keeps a camera position over the ground, out of trees and buildings and inside the area; true when that moved it a long way */
 function settle(P,fp){const A=(api.AW||4300)-150,y0=P.y;P.x=cl(P.x,-A,A);P.z=cl(P.z,-A,A);const g=gh(P.x,P.z),lo=g+(fp?.9:4);if(P.y<lo)P.y=lo;
  if(!fp&&api.sdf&&P.y-g<65)for(let i=0;i<10&&sdf(P.x,P.y,P.z)>-3;i++)P.y+=5;return Math.abs(P.y-y0)>45}
 function blocked(P,X){for(let i=1;i<8;i++){const k=i/8,x=P.x+(X.x-P.x)*k,z=P.z+(X.z-P.z)*k;if(P.y+(X.y-P.y)*k<gh(x,z)+1.2)return true}return false}
 /* is X inside the frame of a camera at P looking at L (k: the share of the frame that counts) */
 function inView(P,L,X,fov,k){_f.subVectors(L,P);if(_f.lengthSq()<1e-6)return false;_f.normalize();_r.crossVectors(_f,UP);if(_r.lengthSq()<1e-9)return false;_r.normalize();_u.crossVectors(_r,_f);_e.subVectors(X,P);
  const z=_e.dot(_f);if(z<1)return false;const tv=Math.tan(fov*DEG/2)*k,th=tv*cam.aspect;return Math.abs(_e.dot(_r))<z*th&&Math.abs(_e.dot(_u))<z*tv}
 const lerpTo=(v,t,dt,rate,snap)=>snap||dt<=0?v.copy(t):v.lerp(t,1-Math.exp(-dt*rate));
 const aspectFov=h=>2*Math.atan(Math.tan(clampFov(h)*DEG/2)/cam.aspect)/DEG;
 /* the heading a follow camera uses: the level direction of travel, kept when the subject hangs or climbs straight up */
 function heading(S,A,dt){_b.set(A.v.x,0,A.v.z);if(_b.lengthSq()>25){_b.normalize();if(S.h.lengthSq()<1e-4||dt<=0)S.h.copy(_b);else S.h.lerp(_b,1-Math.exp(-dt*3)).setY(0);if(S.h.lengthSq()<1e-4)S.h.copy(_b);S.h.normalize()}}
 /* look between the subject and the other body when both stay well inside the frame */
 function pair(S,w){const B=S.B;if(!B.on)return;_c.copy(S.L).lerp(B.p,w);if(inView(S.P,_c,S.A.p,S.fov,.78)&&inView(S.P,_c,B.p,S.fov,.78))S.L.copy(_c)}

 /* ---------- the shots: each fills S.P (position), S.L (look point) and S.fov (vertical degrees) ---------- */
 const POSE={
  chase(S,dt){const A=S.A,sp=A.v.length();heading(S,A,dt);const D=cl(sp*.09,6,16);_a.copy(S.h).multiplyScalar(-D);_a.y=D*.3+1.5;lerpTo(S.sp,_a,dt,3.5,S.age<.05);S.P.copy(A.p).add(S.sp);
   S.L.copy(A.p).addScaledVector(S.h,D*.7);S.fov=62+cl(sp/8,0,10);pair(S,.4)},
  pursuit(S,dt){const A=S.A,B=S.B;_b.subVectors(B.p,A.p);const d=_b.length()||1;_b.divideScalar(d);_b.y=cl(_b.y,-.35,.35);_b.normalize();const D=cl(d*.05+7,8,22);
   _a.copy(_b).multiplyScalar(-D);_a.y+=D*.25+2;lerpTo(S.sp,_a,dt,4,S.age<.05);S.P.copy(A.p).add(S.sp);S.L.copy(A.p).lerp(B.p,.55);S.fov=56},
  fpv(S){const me=api.player,k=((ST.mod&&ST.mod.size)||.5)/.5;S.P.copy(me.camO).multiplyScalar(k).applyQuaternion(me.q).add(me.p);_q.setFromAxisAngle(X1,api.camA()*DEG).premultiply(me.q);
   S.L.set(0,0,-100).applyQuaternion(_q).add(S.P);S.fov=aspectFov(ST.fov||110)},
  orbit(S){const A=S.A,a=S.ang+S.w*S.age;S.P.set(A.p.x+Math.cos(a)*S.R,A.p.y+S.hg,A.p.z+Math.sin(a)*S.R);S.L.copy(A.p);S.L.y+=A.cls===2?4:2;S.fov=S.R>150?52:60},
  wide(S){const A=S.A,B=S.B;_a.copy(A.p);if(B.on&&A.p.distanceToSquared(B.p)<1500*1500)_a.lerp(B.p,.5);_b.subVectors(_a,SC).setY(0);if(_b.lengthSq()<250*250){const a=S.ang+S.w*S.age;_b.set(Math.cos(a),0,Math.sin(a))}else _b.normalize();
   S.fov=58;S.P.copy(_a).addScaledVector(_b,S.R+(B.on?.6*A.p.distanceTo(B.p):0));S.P.y=_a.y+S.hg;S.P.x-=_b.z*S.w*S.age*40;S.P.z+=_b.x*S.w*S.age*40;S.L.copy(_a);
   if(B.on&&!(inView(S.P,S.L,A.p,S.fov,.8)&&inView(S.P,S.L,B.p,S.fov,.8)))S.L.copy(A.p)},
  low(S){S.P.copy(S.P0);S.L.copy(S.A.p);S.fov=44;pair(S,.3)},
  reverse(S){S.P.copy(S.P0).addScaledVector(S.h,S.mat*.5*S.age);S.L.copy(S.A.p);S.fov=50;pair(S,.35)},
  push(S){const A=S.A,e=sm(cl(S.age/S.len,0,1)),D=S.R*(1-.82*e),a=S.ang+.25*e;S.P.set(A.p.x+Math.cos(a)*D,A.p.y+S.hg*(1-e)+8,A.p.z+Math.sin(a)*D);S.L.copy(A.p);S.L.y+=4;S.fov=48-18*e},
  defender(S){const A=S.A,t=A.ref;S.P.copy(S.P0);S.L.copy(A.p);S.fov=52;
   if(A.live&&t&&t.aim){_c.copy(S.L).lerp(t.aim,.5*(1-ramp(A.p.distanceTo(t.aim)/Math.max(1,A.v.length()),0,8)));if(inView(S.P,_c,A.p,S.fov,.8)&&inView(S.P,_c,t.aim,S.fov,.8))S.L.copy(_c)}},
  blast(S){S.P.copy(S.P0);S.P.y+=S.age*3;S.L.copy(S.A.p);S.L.y+=8+S.age*3;S.fov=58}};

 /* ---------- starting a shot ---------- */
 /* the shot's bodies: the follow shots hang on the bot, the others on the moment's own subject */
 function roles(S,sl,type){const me=api.player,hasBot=sl.a===me||sl.b===me,oth=sl.a===me?sl.b:sl.a;
  if(type==='pursuit'||type==='fpv'||type==='chase'&&hasBot){if(!hasBot||!botOK())return false;bind(S.A,me);
   if(oth)bind(S.B,oth,sl.x,sl.y,sl.z);else if(sl.at)bind(S.B,null,sl.x,sl.y,sl.z);else unbind(S.B);return type==='chase'||S.B.on}
  if(sl.a)bind(S.A,sl.a,sl.x,sl.y,sl.z);else if(sl.at)bind(S.A,null,sl.x,sl.y,sl.z);else return false;
  if(sl.b)bind(S.B,sl.b,sl.x,sl.y,sl.z);else if(sl.at&&sl.a)bind(S.B,null,sl.x,sl.y,sl.z);else unbind(S.B);return true}
 function setup(S,sl,type){const A=S.A,sp=A.v.length(),side=shotNo%2?1:-1,lim=SHOTS[type];
  S.type=type;S.kind=sl.i;S.sa=sl.a;S.st0=sl.t0;S.t0=T[0];S.age=0;S.side=side;S.blk=0;S.lost=0;S.ang=0;S.w=0;S.mat=0;S.ease=0;S.min=Math.max(MINL,lim[0]);S.len=lim[1];S.sp.copy(A.p);
  S.h.set(A.v.x,0,A.v.z);if(S.h.lengthSq()<1){if(S.B.on)S.h.set(S.B.p.x-A.p.x,0,S.B.p.z-A.p.z);if(S.h.lengthSq()<1)S.h.set(0,0,-1)}S.h.normalize();
  if(type==='orbit'){S.ang=Math.atan2(SC.z-A.p.z,SC.x-A.p.x)+side*1.1;S.w=side*.2;S.R=A.cls===2?120:A.cls===1?150:A.cls===3?260:A.cls===4?42:85;S.hg=A.cls===2?45:A.cls===3?110:A.cls===1?38:22}
  else if(type==='wide'){S.ang=shotNo*2.4;S.w=side*.03;S.R=A.cls===3?520:A.cls===2?420:360;S.hg=A.cls===3?230:150}
  else if(type==='push'){S.ang=Math.atan2(A.v.z,A.v.x)+side*.9;S.R=A.cls===2?260:200;S.hg=50}
  else if(type==='low'||type==='reverse'||type==='defender'||type==='blast')fixed(S,A,type,sp,side);
  S.score=sl.s;S.fe=cam.fov;S.pe.copy(cam.position)}
 /* the shots that wait where they were put */
 function fixed(S,A,type,sp,side){
  if(type==='low'){_b.set(A.v.x,0,A.v.z);if(_b.lengthSq()<1)_b.copy(S.h);_b.normalize();_c.set(-_b.z,0,_b.x).multiplyScalar(side*cl(sp*.9,55,120));S.P0.copy(A.p).addScaledVector(A.v,3.6).add(_c);S.P0.y=gh(S.P0.x,S.P0.z)+10}
  else if(type==='reverse'){_b.set(A.v.x,0,A.v.z);if(_b.lengthSq()<1)_b.copy(S.h);_b.normalize();S.h.copy(_b);S.mat=sp;S.P0.copy(A.p).addScaledVector(_b,cl(sp*2.2,90,240));S.P0.y=Math.max(A.p.y+8,gh(S.P0.x,S.P0.z)+8)}
  else if(type==='defender'){const t=A.ref;if(!t||!t.aim)return;_b.set(A.p.x-t.aim.x,0,A.p.z-t.aim.z);if(_b.lengthSq()<1)_b.set(0,0,-1);_b.normalize();_c.set(-_b.z,0,_b.x);S.P0.copy(t.aim).addScaledVector(_b,90).addScaledVector(_c,side*150);S.P0.y=Math.max(t.aim.y,gh(S.P0.x,S.P0.z))+16}
  else{const a=Math.atan2(A.p.z-SC.z,A.p.x-SC.x)+side*.9,R=cl(110+8*T[4],110,220);S.P0.set(A.p.x+Math.cos(a)*R,A.p.y+45,A.p.z+Math.sin(a)*R)}}
 /* will this shot work: a sensible camera spot, a clear line, the subject in frame */
 function viable(S){const A=S.A,B=S.B,me=api.player,t=S.type;
  if(!A.live&&t!=='orbit'&&t!=='wide'&&t!=='blast')return'gone';
  if((t==='low'||t==='reverse')&&A.v.length()<12)return'slow';
  if(t==='defender'&&!(A.ref&&A.ref.aim))return'gone';
  if(t==='fpv'&&(me.v.length()<8||me.p.y-gh(me.p.x,me.p.z)<6))return'slow';
  if(t==='pursuit'){const d=A.p.distanceTo(B.p);if(d<15||d>1400)return'range'}
  POSE[t](S,0);_a.copy(S.P);if(settle(_a,t==='fpv'))return'terrain';
  if(t==='fpv')return inView(_a,S.L,B.p,S.fov,.6)?'':'frame2';
  if(!inView(_a,S.L,A.p,S.fov,.85))S.L.copy(A.p);
  const d=_a.distanceTo(A.p);if(d<6||d>(t==='wide'?4200:2600))return'range';
  if(blocked(_a,A.p))return'los';
  if(!inView(_a,S.L,A.p,S.fov,.9))return'frame';
  if(t==='pursuit'&&!inView(_a,S.L,B.p,S.fov,.95))return'frame2';
  return''}
 const gram=sl=>sl.i===INT&&sl.tau<7&&T[0]-T[10]>6&&botOK()&&api.player.v.length()>8?G_FPV:GRAM[sl.i];
 function begin(sl,why){const L=gram(sl),n=L.length;let k0=cur.on&&cur.type===L[0]?1%n:0;if(cur.on&&cur.kind===sl.i&&cur.sa===sl.a){const j=L.indexOf(cur.type);if(j>=0)k0=(j+1)%n}
  for(let k=0;k<=n;k++){const type=k<n?L[(k0+k)%n]:'wide';if(!roles(nxt,sl,type))continue;setup(nxt,sl,type);const bad=viable(nxt);if(!bad||k===n)return swap(sl,why);stats.rej[type+':'+bad]=(stats.rej[type+':'+bad]|0)+1}
  unbind(nxt.A);unbind(nxt.B);return false}
 function swap(sl,why){const was=cur.on,same=was&&cur.A.ref&&cur.A.ref===nxt.A.ref&&why!=='interrupt'&&why!=='forced'&&why!=='lost'&&cam.position.distanceTo(nxt.P)<600;
  if(was){if(cur.type==='fpv'&&(why==='forced'||why==='lost'))T[10]=T[0];close(why,nxt.P)}const t=cur;cur=nxt;nxt=t;unbind(nxt.A);unbind(nxt.B);nxt.on=false;cur.on=true;cur.ease=same?(sl.i===AMB||sl.i===WAVE?1.1:.55):0;
  shotNo++;sl.shown=T[0];stats.shots++;stats.kinds[sl.n]++;stats.types[cur.type]++;if(same)stats.eases++;else stats.cuts++;if(why==='interrupt')stats.interrupts++;if(why==='forced'||why==='lost')stats.forced++;
  if(cur.A.ref&&cur.A.ref.k)cur.A.ref._ds=T[0];if(cur.B.ref&&cur.B.ref.k)cur.B.ref._ds=T[0];
  {const r=cur.A.ref&&cur.A.ref.id?cur.A.ref:cur.B.ref&&cur.B.ref.id?cur.B.ref:null;cur.label=`${sl.n}${r?' T'+String(r.id).padStart(2,'0'):''} · ${cur.type}`}cur.lab=' · '+cur.label;
  if(cur.type==='fpv'&&botOK()){api.camMode=0;api.player.mesh.visible=false}else if(api.camMode===0)api.camMode=1;
  return true}
 function close(why,to){const c=cur,l=LOG[logN++%64];l.type=c.type;l.kind=KN[c.kind];l.why=why;l.t0=c.t0;l.t1=T[0];l.locked=T[0]<T[3];l.lockPow=T[4];l.lx=c.L.x;l.ly=c.L.y;l.lz=c.L.z;l.key=c.A.id|0;l.dist=to?cam.position.distanceTo(to):0;c.on=false}

 /* ---------- what is going on: the scorer ---------- */
 function readIntent(){const bi=Z.bot&&Z.bot.intent;let t=null;IN.k=bi&&bi.kind||'';
  if(bi&&bi.target){t=bi.target;if(typeof t==='number'){const id=t;t=null;for(let i=0;i<TH.length;i++)if(TH[i].id===id){t=TH[i];break}}}
  if(!(t&&t.p)){const P=opts.pilot&&opts.pilot();t=P?P.st.line||P.st.tgt:null}
  IN.t=t&&t.p&&api.live(t)?t:null}
 function ev(sl,s,mag,until,x,y,z,a,b){sl.s0=sl.s=s;sl.mag=mag;sl.t0=T[0];sl.until=until;sl.x=x;sl.y=y;sl.z=z;sl.at=true;sl.a=a||null;sl.b=b||null}
 function score(){const me=api.player,ok=botOK(),wave=G.state==='wave'||G.state==='clear',spd=Math.max(1,opts.speed?opts.speed():1);
  if(G.state!==prevState){const was=prevState;prevState=G.state;SHP.fill(-1);
   if((was==='wave'||was==='clear')&&G.state!=='wave'&&G.state!=='clear')wipe(true);
   if(G.state==='wave'&&was!=='wave')ev(C[WAVE],.55,1,T[0]+5,SCN.x,SCN.y,SCN.z);else if(G.state==='clear')ev(C[WAVE],.35,1,T[0]+5,SCN.x,SCN.y,SCN.z)}
  readIntent();const bi=IN.t,I=C[INT],Th=C[THR],B=C[BOSS];
  for(let i=0;i<C.length;i++){const s=C[i];if(s.ev){if(T[0]>=s.until){s.s=0;s.a=s.b=null;s.at=false}else s.s=s.s0*(1-.45*(T[0]-s.t0)/Math.max(.1,s.until-s.t0))}else{s.s=0;s.a=s.b=null;s.at=false}}
  /* the centre of the sites, for the establishing shots */
  {let n=0,x=0,z=0;for(let i=0;i<SITES.length;i++){const s=SITES[i];if(s.hp>0){x+=s.x;z+=s.z;n++}}if(n){SCN.x=x/n;SCN.z=z/n}if(Math.abs(SCN.x-T[6])+Math.abs(SCN.z-T[7])>4){T[6]=SCN.x;T[7]=SCN.z;SCN.y=gh(SCN.x,SCN.z)+30}}
  gN.fill(0);glead.fill(null);for(let i=0;i<TH.length;i++){const t=TH[i];if(t.k==='swarm'&&api.live(t))gN[t.grp&63]++}
  for(let i=0;i<TH.length;i++){const t=TH[i],K=KIND[t.k];if(!K||!api.live(t))continue;
   if(t.k==='swarm'){const g=t.grp&63;if(glead[g])continue;glead[g]=t}
   const boss=K.armor==='boss'&&!(BOSSES[t.k]&&BOSSES[t.k].minor);_a.subVectors(t.aim,t.p);const tti=_a.length()/Math.max(1,t.v.length())/spd,
    stake=boss?1:cl(cl(K.dmg/120,0,1)*.8+(K.armor?.2:0)+(t.k==='swarm'?cl(gN[t.grp&63]*.05,0,.5):0),0,1);
   if(boss){let k=BR.indexOf(t);if(k<0){k=bossN++&3;BR[k]=t;BT[k]=T[0];card(t)}const age=T[0]-BT[k],en=age<14?1.1-.04*age:0,pres=.42+.4*(t.bs&&t.bs.max?1-t.bs.hp/t.bs.max:0),s=Math.max(en,pres);
    if(s>B.s){B.s=s;B.mag=en>pres?3.2:1.6;B.a=t;B.at=false}}
   else if(K.dmg>0&&!t.spoof&&!(t.lure>0)&&t.k!=='decoy'){const w=1-ramp(tti,4,26),h=t.tgt&&t.tgt.max?1-t.tgt.hp/t.tgt.max:0,s=(.2+.8*w)*(.35+.65*stake)*(1+.8*h)*(t.claim?.7:1)*.95;
    if(s>Th.s){Th.s=s;Th.mag=tti<3?3:1.8;Th.a=t;Th.x=t.aim.x;Th.y=t.aim.y;Th.z=t.aim.z;Th.at=true}}
   if(ok&&(t===bi||K.dmg>0&&K.armor!=='hard')){const d=t.p.distanceTo(me.p);
    if(d<4500||t===bi){const L=t.__ld;solve(LS,t.p,t.v,L&&L.n>3?L.a:null,me.p,Math.max(me.v.length(),40)|0,V3);const tau=LS.ok?LS.tau:99,tR=tau/spd,w=d<90?1:1-ramp(tR,6,34),race=tti*spd<50?1-ramp(Math.abs(tti*spd-tau),0,14):0,
      s=(.18+.82*w)*(.5+.32*stake+.18*race)+(t===bi?.2:0);
     if(s>I.s){I.s=s;I.mag=tau<2||d<60?2.6:1.6;I.a=t;I.b=me;I.tau=tau;I.at=false}}}}
  /* the bot itself, and a quiet establishing shot as the floor */
  if(ok){const hunt=bi&&me.p.distanceToSquared(bi.p)<2250000,s=C[BOT];s.s=hunt?.47:IN.k==='station'||IN.k==='transit'||IN.k==='return'||IN.k==='idle'||IN.k==='shop'?.16:.25;s.mag=1;s.a=me;s.b=hunt?bi:null;s.at=false;
   if(me.t<T[2]-.5||(me.t<1&&T[2]>=1))ev(C[LAUNCH],.34,1,T[0]+4.5,me.p.x,me.p.y,me.p.z,me);T[2]=me.t}
  {const s=C[AMB];s.s=wave?.14:.3;s.mag=.5;s.a=null;s.x=SCN.x;s.y=SCN.y;s.z=SCN.z;s.at=true}
  /* sites hit or lost */
  if(wave)for(let i=0;i<SITES.length&&i<8;i++){const s=SITES[i],h=s.hp,l=SHP[i];if(l>=0&&h<l-.5){const dead=h<=0;ev(C[SITE],dead?1.2:.7,dead?5.2:3,T[0]+(dead?5:3),s.x,gh(s.x,s.z)+8,s.z)}SHP[i]=h}
  /* the personal swarm's strikes */
  {const sw=Z.sw&&Z.sw.mine;if(sw){if(sw.sseq!==sseq){if(sw.sseq>sseq&&wave){const p=sw.sp||sw.home;ev(C[SWM],.95,4.2,T[0]+8,p.x,p.y,p.z,sw)}sseq=sw.sseq}
    const q=C[SWM];if(q.a===sw&&q.until>T[0]&&q.until<q.t0+14)for(let i=0;i<sw.d.length;i++)if(sw.d[i].st==='strike'||sw.d[i].st==='gnd'){q.until=Math.max(q.until,T[0]+1.2);break}}}
  /* a pass that missed */
  if(ok&&bi){const d=bi.p.distanceTo(me.p);if(nmT!==bi){nmT=bi;T[9]=1e9;nmDone=false}const m=T[9];
   if(d<m)T[9]=d;else if(m<55&&d>m+7&&!nmDone){nmDone=true;ev(C[MISS],.62,2,T[0]+3.2,bi.p.x,bi.p.y,bi.p.z,bi,me)}if(d>260){T[9]=1e9;nmDone=false}}
  /* a sortie run on a target: the brain's intent (bomb: it is bombing now; sortie: it is heading for one), else the known target the bot is near */
  {const so=Z.so,ib=Z.bot&&Z.bot.intent,sr=C[SORT];
   if(ok&&ib&&ib.target&&(IN.k==='bomb'||IN.k==='sortie')){const g=ib.target,bomb=IN.k==='bomb';sr.s=bomb?.95:.5;sr.mag=bomb?3.4:3;sr.a=me;sr.b=null;sr.x=g.x;sr.y=g.y;sr.z=g.z;sr.at=true}
   if(ok&&so&&so.S&&so.S.on&&so.W){let bd=1400,bt=null;for(let i=0;i<so.W.list.length;i++){const t=so.W.list[i];if(t.dead||t.t==='convoy')continue;const d=Math.hypot(t.x-me.p.x,t.z-me.p.z);if(d<bd){bd=d;bt=t}}
    if(bt){const v=.45+.45*(1-ramp(bd,200,1400));if(v>sr.s){sr.s=v;sr.mag=3;sr.a=me;sr.b=null;sr.x=bt.x;sr.y=bt.y||gh(bt.x,bt.z);sr.z=bt.z;sr.at=true}}}}
  {const k=G.kills.p+G.kills.h;if(k!==lastKills){bugTick(k);lastKills=k}}
  T[1]=T[0]}

 /* ---------- explosions: a cut waits for one in view; a big enough one is a moment of its own ---------- */
 function boom(p,k){if(!ON)return;const i=BM.n++&15;BM.x[i]=p.x;BM.y[i]=p.y;BM.z[i]=p.z;BM.k[i]=k;BM.t[i]=T[0];
  if(k>=5)for(let j=0;j<TH.length;j++){const t=TH[j],K=KIND[t.k];if(K&&K.armor==='boss'&&!(BOSSES[t.k]&&BOSSES[t.k].minor)&&t.p.distanceToSquared(p)<260*260){ev(C[BOSSX],1.25,6.5,T[0]+5.5,p.x,p.y,p.z);break}}
  if(k>=3.8||k>=1.2&&cur.on&&cur.A.p.distanceToSquared(p)<300*300)ev(C[BLAST],cl(.4+.06*k,0,.85),k,T[0]+2.4,p.x,p.y,p.z);
  if(k>=1.2&&cur.on){_f.set(0,0,-1).applyQuaternion(cam.quaternion);_e.subVectors(p,cam.position);const d=_e.length();
   if(d<1800&&_e.dot(_f)>.3*d){if(T[0]>=T[3])T[4]=0;T[3]=Math.max(T[3],T[0]+lockFor(k));T[4]=Math.max(T[4],k)}}}
 const lockFor=k=>cl(.7+.4*k,1,3),fl0=Z.flash;
 Z.flash=(p,k)=>{if(fl0)fl0(p,k);boom(p,k)};

 /* ---------- deciding ---------- */
 const pen=sl=>{if(cur.on&&sl.i===cur.kind&&sl.a===cur.sa)return 0;let p=.3*Math.exp(-(T[0]-sl.shown)/14);const t=sl.a;if(t&&t._ds!==undefined)p+=.2*Math.exp(-(T[0]-t._ds)/9);return p};
 /* the best moment right now (its score, less the penalty for a subject seen lately, is left in T[8]) */
 function top(){let best=null,bs=-1;for(let i=0;i<C.length;i++){const s=C[i];if(s.s<=0)continue;const e=s.s-pen(s);if(e>bs){bs=e;best=s}}T[8]=bs;return best}
 function decide(h=.1){const best=top(),bs=T[8];
  if(!best)return;
  if(!cur.on){begin(best,'start');return}
  const c=cur,age=T[0]-c.t0,same=best.i===c.kind&&best.a===c.sa&&(!best.ev||best.t0===c.st0),sl=C[c.kind],mine=sl.s>0&&sl.a===c.sa&&(!sl.ev||sl.t0===c.st0),locked=T[0]<T[3];
  c.score=(mine?sl.s:.12)-.12*Math.max(0,(age-c.len*.6)/c.len);
  if(c.type!=='fpv'&&blocked(cam.position,c.A.p))c.blk+=h;else c.blk=0;
  let why='';
  if(c.type==='fpv'&&!botOK())why='lost';
  if(!why&&c.blk>.8&&age>=1)why='forced';
  if(!why&&!locked){if(age>=c.len||age>=c.min&&!c.A.live)why='end';else if(age>=c.min&&!same&&bs>c.score+MARGIN)why='better'}
  if(!why&&age>=HARD&&!same&&best.mag>=2.5&&best.mag>(locked?T[4]*1.35+.5:0)&&bs>c.score*1.6+.3)why='interrupt';
  if(why&&!begin(best,why)&&why==='forced')c.blk=0}

 /* ---------- broadcast touches ---------- */
 const css=document.createElement('style');css.textContent=`#zdirlt{position:fixed;left:50%;bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:6;pointer-events:none;padding:8px 22px 8px 14px;border-left:4px solid #ff9a3c;background:linear-gradient(90deg,rgba(6,12,20,.9),rgba(6,12,20,.55));font:700 22px var(--disp);color:#fff;letter-spacing:.06em;opacity:0;transform:translate(-50%,12px);transition:opacity .35s,transform .35s}
#zdirlt.on{opacity:1;transform:translate(-50%,0)}#zdirlt small{display:block;font:11px var(--mono);color:#ff9a3c;letter-spacing:.14em;text-transform:uppercase}
#zdirk{position:fixed;left:18px;top:calc(138px + env(safe-area-inset-top,0px));z-index:6;pointer-events:none;font:700 12px var(--mono);color:#cfe;text-shadow:0 0 4px #000;padding:3px 9px;border-radius:5px;background:rgba(4,10,18,.55);letter-spacing:.08em}
#zdirk b{color:#3ddc84;font-size:17px;display:inline-block}#zdirk.tick b{animation:zdirk .45s}@keyframes zdirk{0%{transform:scale(1.6);color:#fff}100%{transform:scale(1)}}`;
 let lt=null,kb=null;
 function card(t){if(!lt)return;const K=KIND[t.k],D=BOSSES[t.k],I=D&&D.intro,nm=(I&&I.title)||K.n.toUpperCase();let sub=I&&typeof I.sub==='string'?I.sub:'';if(!sub&&t.bs&&t.bs.max)sub=t.bs.max+' hit points';else if(!sub&&t.stages)sub=t.stages+' stages';
  lt.innerHTML=`<small>Wave ${G.wave} · boss</small>${esc(nm)}${sub?`<small style="margin-top:2px;color:#9fb3c8">${esc(sub)}</small>`:''}`;lt.classList.add('on');T[5]=T[0]+4.6}
 function bugTick(k){if(!kb)return;kb.innerHTML=`<b>${k}</b> DOWN`;kb.classList.remove('tick');void kb.offsetWidth;kb.classList.add('tick')}

 /* ---------- placing the camera ---------- */
 const sunO=new V3();
 function place(P,L,fov){if(P.distanceToSquared(L)<.25)L.y+=1;cam.position.copy(P);M4.lookAt(P,L,UP);cam.quaternion.setFromRotationMatrix(M4);
  if(Math.abs(cam.fov-fov)>.01){cam.fov=fov;cam.updateProjectionMatrix()}
  api.sky.position.copy(P);const sn=api.sun;sunO.subVectors(sn.position,sn.target.position);sn.target.position.set(Math.round(P.x/8)*8,gh(P.x,P.z),Math.round(P.z/8)*8);sn.position.copy(sn.target.position).add(sunO);
  if(api.sunDisc)api.sunDisc.position.copy(P).addScaledVector(sunO.normalize(),20000)}
 function frame(dt,again){const c=cur;refresh(c.A,dt);refresh(c.B,dt);c.age=T[0]-c.t0;POSE[c.type](c,dt);let P=c.P;
  if(c.ease>0&&c.age<c.ease){const e=sm(c.age/c.ease);P=_e.lerpVectors(c.pe,c.P,e);c.fovO=c.fe+(c.fov-c.fe)*e}else c.fovO=c.fov;
  P=_c.copy(P);settle(P,c.type==='fpv');
  /* an fpv shot whose target leaves the frame, or whose bot is gone, is cut at once; any other keeps its subject in the frame */
  if(c.type==='fpv'){if(!again&&(!botOK()||!inView(P,c.L,c.B.p,c.fovO,1))){const b=top();if(b&&begin(b,botOK()?'forced':'lost'))return frame(dt,true)}}
  else if(!inView(P,c.L,c.A.p,c.fovO,.85))c.L.copy(c.A.p);
  place(P,c.L,c.fovO);
  const m=api.player;if(m&&m.mesh&&m.dead<=0)m.mesh.visible=c.type!=='fpv'}

 /* ---------- on / off ---------- */
 /* drops every body, event and timer: after a wave (keep: the shot on air finishes on frozen bodies) and on the way out */
 const freeze=s=>{s.ref=null;s.live=false;s.v.set(0,0,0)};
 function wipe(keep){if(keep&&cur.on){freeze(cur.A);freeze(cur.B)}else{if(cur.on)close('off');cur.on=false;unbind(cur.A);unbind(cur.B)}unbind(nxt.A);unbind(nxt.B);cur.sa=nxt.sa=null;
  for(const s of C){s.s=s.s0=0;s.a=s.b=null;s.at=false;s.until=-1e9;s.t0=-1e9;s.shown=-1e9}IN.t=null;nmT=null;BR.fill(null);glead.fill(null);BM.n=0;T[3]=T[4]=0;SHP.fill(-1);T[1]=-9;
  if(lt){lt.classList.remove('on');T[5]=0}}
 function on(){if(ON)return;ON=true;T[0]=0;T[10]=-99;wipe();prevState=G.state;sseq=Z.sw&&Z.sw.mine?Z.sw.mine.sseq:0;lastKills=-1;
  document.head.append(css);lt=document.createElement('div');lt.id='zdirlt';kb=document.createElement('div');kb.id='zdirk';document.body.append(lt,kb)}
 function off(){if(!ON)return;ON=false;wipe();for(const el of[css,lt,kb])if(el)el.remove();lt=kb=null;
  const m=api.player;if(m&&m.mesh&&m.dead<=0)m.mesh.visible=true;
  /* the game remembers the FOV it set last and would leave ours in place */
  cam.fov=aspectFov(api.camMode===0?(ST.fov||110):100);cam.updateProjectionMatrix()}
 function tick(dt){if(!ON)return;T[0]+=dt;
  if(T[5]&&T[0]>T[5]){lt.classList.remove('on');T[5]=0}
  const iv=Math.min(.1,.1/Math.max(1,opts.speed?opts.speed():1));
  if(T[0]-T[1]>=iv||!cur.on){const h=Math.min(.5,T[0]-T[1]);score();decide(h)}
  if(cur.on)frame(dt,false)}
 const leaks=()=>{let tr=0;const chk=r=>{if(r&&r.p&&r.k)tr++};chk(cur.A.ref);chk(cur.B.ref);chk(nxt.A.ref);chk(nxt.B.ref);chk(IN.t);chk(nmT);for(const r of BR)chk(r);for(const s of C){chk(s.a);chk(s.b)}for(const g of glead)chk(g);
  let m=0;for(const s of C)if(s.s>0)m++;return{tracks:tr,moments:m,shot:cur.on?1:0,lock:T[0]<T[3]?1:0,booms:BM.n,card:T[5]?1:0,dom:(lt?1:0)+(kb?1:0)}};
 return{on,off,tick,score,decide,wipe,leaks,boom,lockFor,stats,HARD,MINL,get active(){return ON},get cur(){return cur},get slots(){return C},get now(){return T[0]},get lock(){return{until:T[3],pow:T[4]}},
  get log(){const n=Math.min(logN,64),o=[];for(let i=logN-n;i<logN;i++)o.push(LOG[i%64]);return o},label:()=>cur.on?cur.lab:''}}
