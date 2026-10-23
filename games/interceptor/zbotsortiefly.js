// Zombies bot sorties, flown for real: the Bot Spectator's pilot (zbotfly.js) takes the break's sortie (zsortie.js) the way a player does, through its
// own sticks. zsortiebot.js has the benchmark pilot's version, which flies the same clock kinematically.
//   plan()    which known target is worth the break and can be done inside the clock (what it cuts from the next waves over the guns and patrols around
//             it, nearest first), or scouting along the supply roads / over unseen ground when nothing is known; null when there is no time
//   launch()  presses the Sortie tab's launch: the objective set, the pad nearest it
//   nav()     every physics step, the point to fly to and what to press: out to an entry point on the run's axis, the run in low and fast along the
//             convoy's road or the launchers' row with a bomb dropped when the CCIP pipper (W.ccip) is over a live part, a second pass if bombs are
//             left, the warhead on the last launchers / a factory's last hit points, then home: inside the line with the clock in hand, and Enter
// Where there is a ridge between the bot and a gun the gun cannot see it (zsites.js los), so it flies low: 22 m above the ground on the run, 45 m on the
// way out, 100 m when scouting (the fog lifts farther from higher up). All numbers are game-tuned.
import {SORTIE} from './zsortiebot.js';
import {SECTORS,KIND} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v;
const SEC=i=>SECTORS[i]?.n||'?';
const V=85;  /* the average ground speed it plans with (climb-out, turns and the run-in included), m/s */
export function createFlier(E,B,F,P){
 const {api,G,Z}=E,so=E.so;if(!so)return null;
 const {S,W,SO,fog}=so,{gh,FOBS}=api,V3=api.THREE.Vector3;
 const SP=SORTIE[P.n]||SORTIE.Champion,GO=P.explore>=3?1:P.explore>=2?.6:0,DEPTH=P.explore>=3?Math.max(1,SP.depth):SP.depth;
 const st={ph:'idle',t:null,sc:null,u:[0,1],pass:0,abort:false,bombT:0,lastT:1e9,thinkT:0,slow:0,ban:new Set(),cash0:0};
 const out={x:0,y:0,z:0,speed:80,agl:40,floor:25,kv:1.8,fire:false,kind:'sortie',why:'',label:'',tgt:null};
 const _c=new V3();
 const top=d=>(api.S.mod.maxv||115)+(d.bmax||0);
 const dHome=(x,z)=>W.dHome(x,z);
 const nearHome=(x,z)=>{let b=null,bd=1e9;for(const h of W.HOME){const d=Math.hypot(h.x-x,h.z-z);if(d<bd){bd=d;b=h}}return b};
 const mains=t=>t.parts.filter(q=>q.main&&q.alive);
 const pos=t=>t.t==='convoy'?(t.ls||t):t;
 const kmT=d=>d<1000?Math.round(d/10)*10+' m':(d/1000).toFixed(1)+' km';
 const fastIn=s=>(Z.fastPlan?Z.fastPlan()[s]?.total:0)|0,cnt=k=>(G.next?.list||[]).reduce((a,q)=>a+(q.split(':')[0]===k?+(q.split(':')[1]||1):0),0);
 /* what a target is worth: the cargo of a convoy, the planned fast missiles of a launch site, the kind a factory builds; over the guns and patrols around it */
 const value=t=>t.t==='convoy'?(t.cargo.all?40:(t.cargo.left??t.cargo.n)*10):t.t==='launch'?15+50*fastIn(t.sec)*3:12*cnt(t.kind)+30;
 const guard=t=>1+t.parts.filter(q=>q.aa&&q.alive).length+.7*t.pats.filter(q=>q.st!=='dead').length;
 const nm=k=>KIND[k]?.n||k;
 const desc=t=>t.t==='convoy'?`${SEC(t.sec).toLowerCase()} road convoy${t.cargo?.k?' ('+nm(t.cargo.k)+'s)':''}`:t.t==='launch'?`${SEC(t.sec).toLowerCase()} launch site`:`${nm(t.kind)} factory`;
 const effect=t=>t.t==='convoy'?(t.cargo.all?'it carries the first '+nm(t.cargo.k)+'s':'each truck takes its cargo out of next wave'):t.t==='launch'?(fastIn(t.sec)?`${fastIn(t.sec)} fast missile${fastIn(t.sec)>1?'s':''} planned from there`:'it feeds the jets and cruise missiles'):'a third of what it builds stays away for 3 waves';
 /* the clock a target takes from a position: out, a pass or two, back */
 const need=(fx,fz,t)=>{const q=pos(t);return(Math.hypot(q.x-fx,q.z-fz)+dHome(q.x,q.z))/V+26};
 const known=()=>so.known().filter(t=>!t.dead&&!t.done&&!st.ban.has(t.id)&&t.tier<=DEPTH&&(t.t!=='factory'||G.wave>=6)&&mains(t).length);
 function best(fx,fz,left){let b=null,bs=-1;for(const t of known()){if(need(fx,fz,t)>left)continue;const q=pos(t),d=Math.hypot(q.x-fx,q.z-fz),sc=value(t)/guard(t)/(d/1000+1);if(sc>bs){bs=sc;b=t}}return b}
 /* unseen ground along the supply roads first (convoys drive there, the launch sites sit near them), then any unexplored ground a kilometre on */
 function scoutPt(fx,fz){const D=c=>Math.hypot(c.x-fx,c.z-fz),ok=c=>!fog.known(c.x,c.z)&&W.tierOf(W.depth(c.x,c.z))<=DEPTH&&Math.abs(c.x)<3900&&Math.abs(c.z)<3900;
  const R2=W.routes.flatMap((r,i)=>[.3,.45,.6,.75].map(f=>({...W.at(r,r.L*f),road:r.sec}))).filter(ok);if(R2.length)return R2.sort((a,b)=>D(a)-D(b))[0];
  const C=W.cands().filter(c=>ok(c)&&D(c)>1000);return C.length?{...C.sort((a,b)=>D(a)-D(b))[0],road:null}:null}
 const padFor=(x,z)=>{let b=FOBS[1],bd=1e9;for(const f of FOBS){const d=Math.hypot(f.x-x,f.z-z);if(d<bd){bd=d;b=f}}return b};
 const roadTxt=s=>s==null?'unseen ground':'the '+SEC(s).toLowerCase()+' road';

 // ---------- before the launch (the shop hook, zsortiebot.js) ----------
 function plan(){if(!GO||Math.random()>GO||S.used===G.wave||!G.on||G.state!=='base'||G.wave<SO.from||Z.isReady?.())return null;
  const left=SO.clock-14,f=FOBS[1],t0=best(f.x,f.z,left);
  if(t0){const q=pos(t0),pad=padFor(q.x,q.z),t=best(pad.x,pad.z,left)||t0;return{t,why:`Sortie: the ${desc(t)}, ${effect(t)}`}}
  const sc=scoutPt(f.x,f.z);if(sc)return{t:null,sc,why:`Sortie: nothing known to hit yet, scouting ${roadTxt(sc.road)} for convoys and launch sites`};
  return null}
 function launch(pl){const q=pl.t?pos(pl.t):pl.sc,pad=padFor(q.x,q.z);if(pl.t)S.obj=pl.t.id;
  /* the flare pod, when it owns one: 6 flares a sortie beat the guns' bursts and the patrol drones 3 times in 4 (zweapons.js flareSave); the wave's weapon goes back on after */
  const A=Z.ars;if(A&&!A.ban?.has('flare')){const w=A.P(A.me());if(w.own.has('flare')&&w.cur!=='flare'){st.prevW=w.cur;A.equip('flare');B.use('wpn:flare','Flare pod loaded for the sortie')}}
  if(!so.launch(FOBS.indexOf(pad))){if(st.prevW){Z.ars.equip(st.prevW);st.prevW=null}return false}
  st.ban.clear();Object.assign(st,{cash0:G.cash,slow:0,ph:'think',t:pl.t,sc:pl.sc||null,pass:0,abort:false,bombT:0,lastT:1e9,thinkT:0});
  B.sr.n++;B.use('sortie:fly');B.set('sortie',pl.why,null);const c=document.getElementById('zspcap');if(c)c.hidden=true;return true}
 const on=()=>{const v=!!S.on;if(!v&&st.prevW){const w=st.prevW;st.prevW=null;Z.ars?.equip(w)}return v};

 // ---------- the flight ----------
 /* the run's axis (a unit vector in x, z; the entry point is 1.1 km back along it, the exit 700 m past the target). A convoy is run along its road, either
    way; a site from the heading, of twelve, where the last 1.1 km at 22 m above the ground is seen by the fewest guns (zsites.js los: a ridge between a gun
    and the drone hides it) and the whole run stays inside the area. Bombs reach the neighbours of what they land on, so the direction hardly matters. */
 const AO=3700,inAO=(x,z)=>Math.abs(x)<AO&&Math.abs(z)<AO;
 const los=(a,b)=>{for(let i=1;i<10;i++){const f=i/10,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f,y=a.y+(b.y-a.y)*f;if(gh(x,z)>y-1)return false}return true};
 function exposure(t,u,q){const R=SO.aa.rng+SO.aa.rngW*Math.min(40,G.wave),guns=t.parts.filter(x=>x.aa&&x.alive).map(x=>({x:x.x,y:gh(x.x,x.z)+2.5,z:x.z}));let e=0;
  for(let i=0;i<=12;i++){const s=-1100+i*150,x=q.x+u[0]*s,z=q.z+u[1]*s,pt={x,y:gh(x,z)+22,z};for(const g of guns){const d=Math.hypot(x-g.x,z-g.z);if(d<R&&los(g,pt))e+=1-d/R}}return e}
 function axis(t,fx,fz){const q=pos(t);let cand;
  if(t.t==='convoy'){const p=t.parts.find(x=>x.main&&x.alive)||t.parts[0],u=[Math.sin(p.yaw),Math.cos(p.yaw)];cand=[u,[-u[0],-u[1]]]}
  else cand=Array.from({length:12},(_,k)=>[Math.sin(k*Math.PI/6),Math.cos(k*Math.PI/6)]);
  let b=null,bs=1e18;
  for(const u of cand){const ex=q.x-u[0]*1100,ez=q.z-u[1]*1100;if(!inAO(ex,ez)||!inAO(q.x+u[0]*250,q.z+u[1]*250))continue;
   const sc=exposure(t,u,q)*3+Math.hypot(ex-fx,ez-fz)/2500+(t.t==='convoy'?0:Math.abs(Math.atan2((q.x-fx)*u[1]-(q.z-fz)*u[0],(q.x-fx)*u[0]+(q.z-fz)*u[1]))*.4);if(sc<bs){bs=sc;b=u}}
  return b||cand[0]}
 /* where a falling bomb will land (cached per bomb) and how many hit points of a part the bombs already in the air will take */
 function landing(b){if(b._L)return b._L;let x=b.p.x,y=b.p.y,z=b.p.z,vx=b.v.x,vy=b.v.y,vz=b.v.z;const k=1-.015*.05;for(let i=0;i<400;i++){vy-=9.81*.05;vx*=k;vy*=k;vz*=k;x+=vx*.05;y+=vy*.05;z+=vz*.05;if(y<=gh(x,z)+.3)break}return b._L={x,z}}
 const bombR=()=>so.bombR(Z.perkLevel?.('warhead')|0);
 const covered=q=>{let n=0;for(const b of W.bombs){const L=landing(b);if(Math.hypot(L.x-q.x,L.z-q.z)-q.r<bombR()-2)n++}return n};
 /* a bomb now: the pipper is over a live part that the bombs in the air will not already finish */
 function release(d,t,now){if(S.bombs<=0||now-st.bombT<.28||!W.ccip(d.p,d.v,_c))return false;
  for(const q of mains(t))if(Math.hypot(_c.x-q.x,_c.z-q.z)-q.r<bombR()-2&&q.hp-covered(q)>0){st.bombT=now;B.sr.bombs++;return true}return false}
 /* the warhead is worth it on the last of a launch site (a 14 m blast reaches its neighbours) and on a factory down to its last hit points */
 function canKami(t){if(!t||S.bombs>0)return false;const m=mains(t);if(!m.length)return false;
  if(t.t==='factory')return m[0].hp<=SO.kamiDmg&&S.hull>20;if(t.t==='launch')return m.length<=3&&S.hull>20;return false}
 const enter=(t,p)=>{st.t=t;st.u=axis(t,p.x,p.z);st.pass=0;st.ph='out'};
 function finishNow(d){if(S.home&&d.dead<=0){const c=Math.max(0,Math.round(G.cash-st.cash0));B.sr.banked+=c;B.sr.home++;B.set('return',`Sortie over: back inside the line${c?`, ${c} of salvage banked`:''}`,null);so.finish();st.ph='idle'}}
 /* one physics step: fills and returns `out` (null when the sortie is over) */
 function nav(d,dt){if(!S.on){st.ph='idle';return null}
  const p=d.p,now=B.t,o=out;o.fire=false;o.kv=1.8;o.kind='sortie';o.tgt=null;
  if(d.t<st.lastT-.5){if(st.lastT<1e8)B.sr.lost++;if(st.ph!=='home')st.ph='think'}  /* a new interceptor (the launch itself, or after being shot down) */
  st.lastT=d.t;
  if((st.ph==='out'||st.ph==='run'||st.ph==='scout')&&d.t>12&&Math.hypot(d.v.x,d.v.z)<14){if((st.slow+=dt)>6){st.slow=0;if(st.t)st.ban.add(st.t.id);st.sc=null;st.ph='think'}}else st.slow=0;
  const dh=dHome(p.x,p.z),back=Math.max(0,dh-SO.homeR)/V*1.15+6;
  if(!st.abort&&(S.t<back+8||S.hull<28))st.abort=true;
  if(st.abort&&st.ph!=='home')st.ph='home';
  let t=st.t;
  // the target gone (killed, or no part standing) while it flies: pick again
  if((st.ph==='out'||st.ph==='run'||st.ph==='kami')&&(!t||t.dead||t.done||!mains(t).length))st.ph='think';
  if(st.ph==='out'&&need(p.x,p.z,t)>S.t+6)st.ph='think';
  if(st.ph==='scout'&&now-st.thinkT>1.5){st.thinkT=now;const f=best(p.x,p.z,S.t-6);if(f){enter(f,p);B.set('sortie',`Sortie: found the ${desc(f)}, ${effect(f)}`,null)}}
  if(st.ph==='think'){const keep=t&&!t.dead&&!t.done&&mains(t).length&&need(p.x,p.z,t)<=S.t+6?t:null,f=keep||(S.bombs>0?best(p.x,p.z,S.t-6):null);
   if(f)enter(f,p);else if(!t&&st.sc&&S.t>back+25)st.ph='scout';else st.ph='home'}
  t=st.t;let g,why='';
  switch(st.ph){
  case'scout':{if(!st.sc||fog.known(st.sc.x,st.sc.z)||Math.hypot(st.sc.x-p.x,st.sc.z-p.z)<350){st.sc=scoutPt(p.x,p.z);if(!st.sc){st.ph='home';return nav(d,dt)}}
   const s=st.sc,dd=Math.hypot(s.x-p.x,s.z-p.z);g=[s.x,s.z,gh(s.x,s.z)+60];o.speed=1e3;o.agl=60;o.floor=30;
   why=`Sortie: scouting ${roadTxt(s.road)} · ${kmT(dd)} to unseen ground · ${Math.ceil(S.t)} s on the clock`;o.label='unseen ground';o.tgt={x:s.x,y:g[2],z:s.z};break}
  case'out':{const q=pos(t),u=st.u,ex=q.x-u[0]*1100,ez=q.z-u[1]*1100,dd=Math.hypot(ex-p.x,ez-p.z),dT=Math.hypot(q.x-p.x,q.z-p.z),
    s0=(p.x-q.x)*u[0]+(p.z-q.z)*u[1],lat=Math.abs((p.x-q.x)*u[1]-(p.z-q.z)*u[0]);
   if(dd<260||(s0<-250&&s0>-1300&&lat<140)){st.ph='run';return nav(d,dt)}
   const a=dT<2800?25:45;g=[ex,ez,gh(ex,ez)+a];o.speed=1e3;o.agl=a;o.floor=a>30?30:20;
   why=`Sortie: ${desc(t)} · ${kmT(dT)} out · ${Math.ceil(S.t)} s on the clock`;o.label=desc(t);o.tgt={x:q.x,y:gh(q.x,q.z)+10,z:q.z};break}
  case'run':{const q=pos(t),u=st.u,s0=(p.x-q.x)*u[0]+(p.z-q.z)*u[1];
   if(s0>(S.bombs>0?380:620)){/* past it: a second pass if there are bombs and time, else the warhead or home */
    if(S.bombs>0&&st.pass<1&&S.t>back+30&&S.hull>45){st.pass++;st.u=[-u[0],-u[1]];st.ph='out'}else st.ph=canKami(t)?'kami':'home';return nav(d,dt)}
   const sg=cl(s0+300,-1200,800);g=[q.x+u[0]*sg,q.z+u[1]*sg];g[2]=gh(g[0],g[1])+22;o.speed=Math.min(top(d)*.9,95);o.agl=22;o.floor=14;o.kv=2.4;
   if(release(d,t,now))o.fire=true;
   const a=mains(t).length;why=`Bombing run on the ${desc(t)} · ${S.bombs} bomb${S.bombs===1?'':'s'} left · ${a} target${a===1?'':'s'} standing`;o.kind='bomb';o.label=desc(t);o.tgt={x:q.x,y:gh(q.x,q.z)+10,z:q.z};
   if(S.bombs<=0&&now-st.bombT>2.6)st.ph=canKami(t)?'kami':'home';break}
  case'kami':{const q=mains(t)[0];if(!q||!canKami(t)){st.ph='home';return nav(d,dt)}
   g=[q.x,q.z,q.y+q.h*.5];o.speed=Math.min(top(d)*.85,80);o.agl=6;o.floor=3;o.kv=2.6;o.kind='bomb';const dd=Math.hypot(q.x-p.x,q.z-p.z,p.y-g[2]),reach=Math.hypot(Math.max(0,Math.hypot(q.x-p.x,q.z-p.z)-q.r),Math.max(0,p.y-(q.y+q.h)));
   if(reach<SO.kamiR-3)o.fire=true;why=`Warhead run: finishing the ${desc(t)} · ${kmT(dd)}`;o.label=desc(t);o.tgt={x:q.x,y:g[2],z:q.z};break}
  default:{/* home: to a point inside the line, then Enter */
   if(S.home){finishNow(d);return null}
   const h=nearHome(p.x,p.z),l=Math.hypot(h.x-p.x,h.z-p.z)||1,r=Math.max(0,l-(SO.homeR-350)),x=p.x+(h.x-p.x)/l*r,z=p.z+(h.z-p.z)/l*r;
   g=[x,z,gh(x,z)+45];o.speed=1e3;o.agl=45;o.floor=26;o.kind='return';
   why=`Sortie: back to the line · ${kmT(Math.max(0,l-SO.homeR))} to go · ${Math.ceil(S.t)} s left${S.carry?` · $${S.carry|0} carried`:''}`;o.label='the line';o.tgt={x:h.x,y:gh(h.x,h.z)+30,z:h.z}}}
  g=[cl(g[0],-AO,AO),cl(g[1],-AO,AO),g[2]];
  // a goal behind the nose: a dart turns wide and loses speed doing it, so first a point 700 m ahead and 450 m toward the goal's side
  let dx=g[0]-p.x,dz=g[1]-p.z,l=Math.hypot(dx,dz)||1;const sp=Math.hypot(d.v.x,d.v.z);
  if(sp>25&&l>350&&st.ph!=='kami'){const vx=d.v.x/sp,vz=d.v.z/sp;if((dx*vx+dz*vz)/l<-.2){const sd=dx*-vz+dz*vx>0?1:-1;g=[p.x+vx*700-vz*sd*450,p.z+vz*700+vx*sd*450,0];dx=g[0]-p.x;dz=g[1]-p.z;l=Math.hypot(dx,dz)||1;g[2]=gh(g[0],g[1])+o.agl}}
  // a point 260 m along the way at the height the highest ground in the next 540 m allows (terrain-following); the goal itself when it is closer than that
  const k=Math.min(1,260/l),ux=dx/l,uz=dz/l,ax=p.x+dx*k,az=p.z+dz*k;let hi=-1e9;for(let i=1;i<=6;i++){const s=Math.min(l,i*90);hi=Math.max(hi,gh(p.x+ux*s,p.z+uz*s))}
  o.x=ax;o.z=az;o.y=k>=1?g[2]:Math.max(gh(ax,az),hi-8)+o.agl;o.why=why;
  return o}
 /* kills and the systems they count for, while the bot flies (wrapped once; E.bot is whichever run is current) */
 if(!W._botWrap){W._botWrap=1;const op=W.onPart,od=W.onDead;
  W.onPart=(t,q,by)=>{op?.(t,q,by);const b=E.bot;if(!b?.on||!S.on||!by||!q.main)return;const k=t.t==='convoy'?'convoy':t.t==='launch'?'launch':null;if(k){b.sr.kills[k]++;b.use('sortie:'+k,{convoy:'Truck destroyed',launch:'Launcher destroyed'}[k])}};
  W.onDead=(t,by,rem)=>{od?.(t,by,rem);const b=E.bot;if(!b?.on||!by)return;if(t.t==='factory'){b.sr.kills.factory++;b.use('sortie:factory','Drone factory destroyed')}}}
 return{plan,launch,nav,on,st,reset(){st.ph='idle';st.t=null;st.sc=null}}}
