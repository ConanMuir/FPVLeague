// Zombies lock-on: an earned aim aid (Zombies has no lead indicators). Hold a track inside the small reticle zone at the centre of your view
// and a lock builds: a ring closes on the track and a tone beeps faster and higher. At full lock the tone goes steady, the track becomes your
// selected track and an intercept-path overlay draws the curve to fly to meet it, with the time to intercept. Lose the track from view for
// a moment and the lock drops. Weather slows the lock (low visibility, rain; thermal helps), so does jamming (near a Mothership, or whatever
// Z.lockJam(t) returns); the Optics perk speeds it up. On Hard and Nightmare an evading track jinks when it is locked and can break it.
// The lock is what the personal swarm's "attack my lock" goes after (zswarm.js). Numbers: zswdata.js LOCK.
import {LOCK} from './zswdata.js';
import {track as leadTrack,solve as leadSolve} from './lead.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,D2R=Math.PI/180;
export function initLock(api,G,Z){
 const {THREE,TH,S}=api,V3=THREE.Vector3,_a=new V3(),_b=new V3(),_f=new V3(),_p=new V3(),_v2=new V3();
 const L={cand:null,prog:0,tgt:null,full:false,lost:0,held:0,ip:new V3(),tti:0,unc:0,sol:{p:new V3(),tau:0,unc:0,ok:true},ph:0,snd:null,st:0,brk:null,n:{start:0,try:0,lock:0,lost:0,broken:0,faded:0,gone:0,held:0}};  // n: counts for tuning (tracks entering the reticle, attempts past 25%, locks, lost by aim, broken by a jink, part-built locks that faded, targets killed or gone)
 const lv=k=>Z.perkLevel?.(k)|0;
 // seconds to lock this track from here: range, Optics, weather (visibility through the current fog, rain; thermal sees further), jamming
 function lockTime(t,me){const d=t.p.distanceTo(me.p);let k=LOCK.t*(1+Math.max(0,d-800)/1000*LOCK.far)*LOCK.optics[cl(lv('optics'),0,3)];
  const fog=api.scene.fog,vis=(fog?fog.far:9000)*(api.thermLook?2.5:1),W=api.WX||{};k*=1+1.2*cl((5000-vis)/5000,0,1)+.25*(W.rain||0)+(W.nosky&&!api.thermLook?.5:0);
  return k*jamK(t,me)}
 function jamK(t,me){let k=1;for(const u of TH)if(u.k==='boss'&&api.live(u)&&(u.p.distanceTo(t.p)<LOCK.jamR||u.p.distanceTo(me.p)<LOCK.jamR)){k=LOCK.jam;break}return k*(Z.lockJam?.(t)??1)}
 const lockable=t=>api.live(t)&&t.st!=='fall'&&(Z.seen?.(t)??true);
 // your sights: the interceptor's camera in FPV (what you see is what you lock); in the chase and threat views, the airframe's own boresight
 // (down the nose), not the view camera. The chase camera only follows the heading, so with it a track above or below could never be
 // brought into the reticle, and the threat camera always looks at the selected track, which locked it without aiming. Z.sightCam (the bot
 // pilot's FPV camera, zspectate.js) overrides it.
 const _sq=new THREE.Quaternion(),_sx=new V3(1,0,0),SO={position:new V3(),quaternion:new THREE.Quaternion()};
 function sights(){const s=Z.sightCam?.();if(s)return s;const me=api.player;if(api.camMode===0||!me)return api.camera;SO.position.copy(me.p);SO.quaternion.copy(me.q).multiply(_sq.setFromAxisAngle(_sx,Math.PI/2));return SO}
 // how far off the sights a full lock may drift before it starts to slip: LOCK.keep degrees, wider up close (LOCK.keepR metres either side), so the
 // last seconds of a run-in, where the track sweeps across the view, don't drop it
 const keepA=d=>Math.max(LOCK.keep*D2R,Math.atan2(LOCK.keepR||0,Math.max(d,1)));
 function acquire(t,quiet){L.n.lock++;L.full=true;L.tgt=t;L.cand=null;L.prog=1;L.lost=0;L.held=0;api.pickT=t;if(!quiet){api.banner('LOCK','cg',.6)}Z.onLock?.(t)}
 function drop(why){const had=L.full;L.full=false;L.tgt=null;L.cand=null;L.prog=0;L.lost=0;if(had&&why){api.banner(why,'co',.8);blip(700,300)}}
 // an evading track (Hard / Nightmare) that knows it is locked jinks now and then; a jink can break the lock
 function evasion(t,dt){const m=Z.evadeMode?.(),B=LOCK.brk[m];if(!B||!Z.evades?.(t))return false;
  if(t.net)return Math.random()<B[0]*B[1]*dt;  /* a co-op client mirrors the track: the host flies it, so just the odds */
  if(L.held>1&&!(t.brk>0)&&(t.brkCd||0)<=0&&Math.random()<B[0]*dt){t.brk=1.6;t.brkCd=5;t.brkDir=Math.random()<.5?-1:1}
  if(t.brk>1.3&&!t.lkJ){t.lkJ=1;return Math.random()<B[1]}if(!(t.brk>0))t.lkJ=0;return false}  /* each jink (one of yours closing inside 350 m, or this one) rolls once */
 /* where to fly to meet it: lead.js, the same solver as Classic's PIP, on sim state every tick of the lock. The point is where you actually meet
    the track flying straight at your speed (at least 40 m/s; flat out when you can't catch it at that), allowing for its turn; L.unc says
    how far that could move if it changes what it is doing. */
 function intercept(t,me,dt){const ld=leadTrack(t,dt,V3),O=L.sol,s=Math.max(me.v.length(),40);leadSolve(O,t.p,t.v,ld.a,me.p,s,V3);
  if(!O.ok)leadSolve(O,t.p,t.v,ld.a,me.p,Math.max(s,(S.mod?.maxv||115)+(me.bmax||0)),V3);L.ip.copy(O.p);L.tti=O.tau;L.unc=O.unc}
 function step(dt){L.clock=(L.clock||0)+(dt||0);const me=api.player,on=G.on&&G.state==='wave'&&me&&me.dead<=0&&!api.demo&&!Z.cine&&!Z.idle?.();
  if(!on){if(L.full&&L.tgt&&!api.live(L.tgt))L.n.gone++;if(L.full||L.prog||L.cand){L.full=false;L.tgt=null;L.cand=null;L.prog=0}L.st=0;return}
  // a track is in your sights when the reticle is on it, or when you are flying straight at it (the flight path): at 40-70 m/s the dart flies
  // 10-20 degrees nose-high to hold its height, so with the camera tilted up a track you are running straight down sits below the reticle
  const cam=LS.cam=sights();_f.set(0,0,-1).applyQuaternion(cam.quaternion);LS.fp=me.v.lengthSq()>400?_v2.copy(me.v).normalize():null;LS.me=me;LS.dt=dt;
  if(L.full){const t=L.tgt;if(!api.live(t)){L.n.gone++;drop(t&&t.st!=='dead'&&t.st!=='fall'?'LOCK LOST':'');return step0()}
   const d=t.p.distanceTo(me.p);L.lost=ang(t)>keepA(d)||d>LOCK.range*1.25?L.lost+dt:0;if(L.lost>LOCK.keepT){L.n.lost++;L.mem={t,until:L.clock+(LOCK.mem||0)};drop('LOCK LOST');return step0()}
   if(evasion(t,dt)){L.n.broken++;drop('LOCK BROKEN');return step0()}L.held+=dt;L.n.held+=dt;intercept(t,me,dt);if(api.pickT!==t)api.pickT=t;L.st=2;return}
  step0()}
 // the per-tick search without closures: its state in LS, the angle test and the grid callback made once
 const LS={cam:null,fp:null,me:null,dt:0,best:null,ba:0},ang=t=>{const a=_f.angleTo(_p.subVectors(t.p,LS.cam.position));return LS.fp?Math.min(a,LS.fp.angleTo(_p.subVectors(t.p,LS.me.p))):a},
  lsCb=t=>{if(!lockable(t)||t.p.distanceTo(LS.me.p)>LOCK.range)return;const a=ang(t);if(a<LS.ba){LS.ba=a;LS.best=t}};
 function step0(){const me=LS.me,dt=LS.dt;LS.best=null;LS.ba=LOCK.cone*D2R;api.grid.near(me.p,LOCK.range,lsCb);const best=LS.best;LS.best=null;
   if(best){if(best!==L.cand){if(L.cand&&L.prog>.05)L.n.faded++;L.cand=best;L.prog=0;L.n.start++;L.tried=0}if(!(best.brk>0&&Z.evades?.(best)))L.prog+=(dt||0)/lockTime(best,me)*(L.mem&&L.mem.t===best&&L.clock<L.mem.until?LOCK.memK||1:1);  /* re-locking a track you just lost is quicker */if(!L.tried&&L.prog>=.25){L.tried=1;L.n.try++}if(L.prog>=1)acquire(best)}
   else if(L.cand){L.prog=Math.max(0,L.prog-(dt||0)*LOCK.decay/LOCK.t);if(!L.prog||!api.live(L.cand)){if(L.cand)L.n.faded++;L.cand=null}}
   L.st=L.full?2:L.cand?1:0}

 // ---------- sound: beeps that speed up and rise while it builds, a steady warbling tone at lock ----------
 function snd(){const AC=api.AC;if(!AC)return null;if(L.snd)return L.snd;const o=AC.createOscillator(),f=AC.createBiquadFilter(),g=AC.createGain();o.type='square';o.frequency.value=600;f.type='lowpass';f.frequency.value=2400;g.gain.value=0;
  o.connect(f).connect(g).connect(AC.destination);o.start();return L.snd={o,g}}
 function blip(f0,f1){const A=api.AC;if(!A||!G.on)return;const v=cl(S.zsfxv??1,0,1)*.05;if(!v)return;const t=A.currentTime,o=A.createOscillator(),g=A.createGain();o.type='square';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+.18);
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0005,t+.2);o.connect(g).connect(A.destination);o.start(t);o.stop(t+.22)}
 function sound(dt){const s=L.st?snd():L.snd;if(!s)return;const A=api.AC,t=A.currentTime,vol=cl(S.zsfxv??1,0,1)*(api.menuOpen?0:1);let v=0,fq=600;
  if(L.st===1){const rate=3+11*L.prog;L.ph+=dt*rate;v=(L.ph%1)<.45?.035:0;fq=480+700*L.prog}else if(L.st===2){v=.026;fq=1250+40*Math.sin(t*30)}
  s.g.gain.setTargetAtTime(v*vol,t,.006);s.o.frequency.setTargetAtTime(fq,t,.01)}

 // ---------- overlay: reticle zone, the closing ring, the lock diamond and the intercept path ----------
 function scr(p,W,H){_p.copy(p).project(api.camera);return _p.z<1&&Math.abs(_p.x)<1.2&&Math.abs(_p.y)<1.2?[(_p.x*.5+.5)*W,(-_p.y*.5+.5)*H]:null}
 function overlay(oc,W,H){const me=api.player;if(!G.on||G.state!=='wave'||!me||me.dead>0||Z.cine||api.demo)return;const cam=api.camera,tf=Math.tan(cam.fov*D2R/2);
  const rz=Math.tan(LOCK.cone*D2R)/tf*H/2,sc=sights(),rc=sc===cam?[W/2,H/2]:scr(_a.set(0,0,-1).applyQuaternion(sc.quaternion).multiplyScalar(1000).add(sc.position),W,H);  /* the reticle sits where your sights point */
  oc.save();oc.lineWidth=1.5;oc.strokeStyle='rgba(255,255,255,.45)';oc.setLineDash([3,5]);if(rc){oc.beginPath();oc.arc(rc[0],rc[1],rz,0,7);oc.stroke()}oc.setLineDash([]);
  oc.textAlign='center';oc.font='700 12px "JetBrains Mono",monospace';oc.shadowColor='#000';oc.shadowBlur=4;
  if(L.st===1&&L.cand&&L.prog>0){const q=scr(L.cand.p,W,H);if(q){const R=16+54*(1-L.prog),a0=performance.now()/300;oc.strokeStyle=oc.fillStyle='#ffc640';oc.lineWidth=2;oc.beginPath();oc.arc(q[0],q[1],R,0,7);oc.stroke();
    for(let i=0;i<4;i++){const a=a0+i*Math.PI/2;oc.beginPath();oc.moveTo(q[0]+Math.cos(a)*(R-6),q[1]+Math.sin(a)*(R-6));oc.lineTo(q[0]+Math.cos(a)*(R+6),q[1]+Math.sin(a)*(R+6));oc.stroke()}
    oc.fillText(`LOCKING ${Math.round(L.prog*100)}%`,q[0],q[1]-R-8)}}
  if(L.st===2&&L.tgt){const t=L.tgt,q=scr(t.p,W,H);oc.strokeStyle=oc.fillStyle='#5fe3ff';oc.lineWidth=2.2;
   if(q){const R=20;oc.beginPath();oc.moveTo(q[0],q[1]-R);oc.lineTo(q[0]+R,q[1]);oc.lineTo(q[0],q[1]+R);oc.lineTo(q[0]-R,q[1]);oc.closePath();oc.stroke();oc.fillText(`LOCK T${String(t.id).padStart(2,'0')}`,q[0],q[1]-R-8)}
   /* intercept path: a straight dashed line from your interceptor (drawn where the frame draws it) to the meet point, the path the solution
      assumes; chevrons along it every quarter */
   const p0=me.p,pts=[];for(let i=0;i<=24;i++){_a.lerpVectors(p0,L.ip,i/24);pts.push(scr(_a,W,H))}
   oc.setLineDash([8,6]);oc.lineWidth=2;oc.beginPath();let pen=false;for(const q2 of pts){if(!q2){pen=false;continue}if(pen)oc.lineTo(q2[0],q2[1]);else oc.moveTo(q2[0],q2[1]);pen=true}oc.stroke();oc.setLineDash([]);
   for(let i=6;i<pts.length-1;i+=6){const a=pts[i],b=pts[i+1];if(!a||!b)continue;const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);oc.save();oc.translate(a[0],a[1]);oc.rotate(ang);oc.beginPath();oc.moveTo(-5,-6);oc.lineTo(3,0);oc.lineTo(-5,6);oc.stroke();oc.restore()}
   const ip=scr(L.ip,W,H),txt=`INTERCEPT ${L.tti<10?L.tti.toFixed(1):Math.round(L.tti)} s`;
   if(ip&&ip[0]>0&&ip[0]<W&&ip[1]>0&&ip[1]<H){const d=Math.max(1,L.ip.distanceTo(cam.position)),ur=L.unc/d/tf*H/2;if(ur>14){oc.save();oc.globalAlpha=.45;oc.setLineDash([2,4]);oc.beginPath();oc.arc(ip[0],ip[1],Math.min(ur,H),0,7);oc.stroke();oc.restore()}  /* how far the point may move if the track changes course */
    oc.beginPath();oc.arc(ip[0],ip[1],11,0,7);oc.moveTo(ip[0]-17,ip[1]);oc.lineTo(ip[0]-6,ip[1]);oc.moveTo(ip[0]+6,ip[1]);oc.lineTo(ip[0]+17,ip[1]);oc.moveTo(ip[0],ip[1]-17);oc.lineTo(ip[0],ip[1]-6);oc.stroke();oc.fillText(txt,ip[0],ip[1]+30)}
   else{_p.copy(L.ip).project(cam);let x=_p.x,y=_p.y;if(_p.z>1){x=-x;y=-y}const m=Math.max(Math.abs(x)/.86,Math.abs(y)/.78,1e-3);x/=m;y/=m;const X=(x*.5+.5)*W,Y=(-y*.5+.5)*H;
    oc.save();oc.translate(X,Y);oc.rotate(Math.atan2(-y,x));oc.beginPath();oc.moveTo(16,0);oc.lineTo(-6,-11);oc.lineTo(-1,0);oc.lineTo(-6,11);oc.closePath();oc.fill();oc.restore();oc.fillText(txt,X,Y+26)}}
  oc.restore()}
 // ---------- hooks (zombies.js calls initLock before the game-feel and co-op layers wrap these) ----------
 const s0=Z.step;Z.step=dt=>{s0(dt);step(dt)};
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);sound(dt)};
 const o0=Z.overlay;Z.overlay=oc=>{o0(oc);overlay(oc,innerWidth,innerHeight)};
 const st0=Z.stop;Z.stop=()=>{st0();drop('');L.st=0;if(L.snd){try{L.snd.g.gain.value=0}catch(e){}}};
 // Z.lk: the swarm's "attack my lock" and the bots (force: a lock without the hold, for the bot pilots and the tests)
 Z.lk={get t(){return L.full&&api.live(L.tgt)?L.tgt:null},get prog(){return L.full?1:L.prog},get cand(){return L.cand},get tti(){return L.tti},get unc(){return L.unc},ip:L.ip,L,lockTime,
  force(t){if(t&&api.live(t))acquire(t,true)},clear(){drop('')},sights};
 return Z.lk}
