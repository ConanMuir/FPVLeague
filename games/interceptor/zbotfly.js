// Zombies bot pilot in the air: flies the real interceptor through the same inputs a player has. Every physics step it works out where it
// wants the dart to go, turns that into stick positions (acro: body rates through your Betaflight rate curves, throttle through your throttle
// curve) and hands them to interceptor.js (Z.botIn); it presses detonate (Z.botFire), the camera tilt switch (L), relaunch (R), next track (N)
// and the perk and swarm keys like a player would. Lock-on comes from holding its sights on a track (its FPV camera, Z.sightCam).
// No teleporting: it takes off from the mat, climbs, runs tracks down, misses and comes round again, crashes if it flies into the ground.
// Skill (zbotbrain.js LEVELS[].fly): reaction time, aim wander, detonate timing, target choice, line-sitting on the fast missiles, relaunch.
//
// Flying the dart: thrust acts along the nose and the fins swing the velocity onto the nose, so it flies like a missile at speed and like a
// tail-sitting quad in a hover. The pilot asks for an acceleration (from a velocity it wants), adds gravity, and points the nose: in a hover
// straight along the needed thrust, at speed a few degrees off the flight path so the fins' side force turns it. Throttle sets the thrust.
import {attitude} from '../../engine/flight.js';
import {rate,thrCurve} from '../../engine/rates.js';
import {KIND} from './zdata.js';
import {tactics} from './zbotbrain.js';
import {installBot} from './zbotstat.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)},gauss=()=>(Math.random()+Math.random()+Math.random()+Math.random()-2)*1.73;
// stick that gives this output of a monotonic curve f on [lo, hi] (bisection): rates and throttle curves are the player's, so the bot inverts them
function inv(f,y,lo,hi){let a=lo,b=hi;if(y<=f(a))return a;if(y>=f(b))return b;for(let i=0;i<22;i++){const m=(a+b)/2;if(f(m)<y)a=m;else b=m}return(a+b)/2}
export function createPilot(api,G,Z,P,E){
 const {THREE,TH,S,gh}=api,V3=THREE.Vector3,UP=new V3(0,1,0),F=P.fly;
 const _a=new V3(),_b=new V3(),_c=new V3(),_n=new V3(),_h=new V3(),_f=new V3(),_v=new V3(),_A=new V3(),_W=new V3(),WT=new V3(),fake={q:null,wt:WT};
 const st={t:0,look:0,tact:0,tgt:null,mode:'idle',intent:'',plan:null,fire:false,aimN:new V3(),line:null,lineT:null,stuck:0,launchT:0,lastMe:null,sw:'',passes:0,fired:0,tgtT:0,why:''};
 const B=installBot(E);  /* intent, coverage and the HUD line (zbotstat.js) */
 const live=t=>api.live(t)&&t.st!=='fall';
 const topV=me=>(S.mod.maxv||115)+(me.bmax||0);
 const ttiOf=t=>Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/Math.max(1,t.spd);
 const name=t=>Z.tname?Z.tname(t):`T${String(t.id).padStart(2,'0')} ${KIND[t.k]?.n}`;
 const rng=d=>d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km';
 const agl=p=>p.y-gh(p.x,p.z);

 // ---------- choosing a target (every F.react seconds, or when the current one is gone) ----------
 function decoyOK(t){if(t.k!=='decoy')return true;if(t._bd==null)t._bd=!t.ident||Math.random()<F.decoy?1:0;return t.ident?!!t._bd&&Math.random()<F.decoy:true}
 function pick(me,from){const S0=Math.max(80,F.cruise*topV(me)),L=[];
  for(const t of TH){if(!live(t)||KIND[t.k]?.armor==='hard')continue;const d=t.p.distanceTo(from);if(!(Z.seen?.(t)??true)&&d>1500)continue;if(t.k==='decoy'&&t.ident&&!decoyOK(t))continue;
   if(t.st==='dive'&&ttiOf(t)<3&&d>400)continue;L.push([t,d])}
  if(!L.length)return null;let best=null,bs=1e18;
  for(const[t,d]of L){let s;const tt=ttiOf(t),reach=F.pick==='smart'?Math.min(300,icpt(t,from,S0)+(t.spd<S0*.75?4:0)):d/S0;
   if(F.pick==='near')s=d;
   else if(F.pick==='urgent')s=tt+(t.k==='swarm'&&t!==lead(t)?60:0);
   else{s=tt+.6*reach+(tt-reach<-4?80:0)+(t.claim?25:0)+(t.k==='decoy'?120:0)+(t.k==='swarm'&&t!==lead(t)?8:0)-Math.min(30,(KIND[t.k]?.dmg||0)/8)+(t.k==='boss'?-20:0)}
   if(t===st.tgt)s-=F.pick==='near'?150:d<700?120:6;  /* stick with what it is chasing unless something is clearly better; never mid-attack */
   if(s<bs){bs=s;best=t}}
  return best}
 // time to meet a track flying straight at speed S from here (Infinity: it outruns you)
 const icpt=(t,from,S)=>{const r=_b.subVectors(t.p,from),a=t.v.lengthSq()-S*S,b=2*r.dot(t.v),c=r.lengthSq();if(Math.abs(a)<1e-6)return b<0?-c/b:Infinity;const q=b*b-4*a*c;if(q<0)return Infinity;
  const r1=(-b-Math.sqrt(q))/(2*a),r2=(-b+Math.sqrt(q))/(2*a),m=Math.min(r1>0?r1:1e9,r2>0?r2:1e9);return m<1e9?m:Infinity};
 const lead=t=>{if(t.k!=='swarm')return t;let b=t;for(const u of TH)if(u.grp===t.grp&&api.live(u)&&u.id<b.id)b=u;return b};
 // a ballistic / hypersonic / ICBM track it will try to meet head-on by sitting on its line (decided once per track)
 function pickLine(me){if(!(F.line>0))return null;let best=null,bt=1e9;
  for(const t of TH){if(!api.live(t)||KIND[t.k]?.armor!=='hard')continue;const tt=lineTT(t);if(tt<4||tt>80)continue;
   if(t._bl==null)t._bl=Math.random()<F.line?1:0;if(!t._bl)continue;if(lineGo(me,t)>tt-4)continue;if(tt<bt){bt=tt;best=t}}
  return best}
 // the hover point on a fast track's line, 140 m up from its aim point. Ballistic and ICBM tracks come down one straight line; a hypersonic
 // glider cruises at 30 km and dives at 45 degrees from 30 km out (zenemy.js), so its line is the dive's
 function lineDir(t,o){o.subVectors(t.p,t.aim);if(t.k==='hyper'){const h=Math.hypot(o.x,o.z)||1;o.set(o.x/h*30000,30000,o.z/h*30000)}return o.normalize()}
 function linePt(t,o){const u=lineDir(t,_b);o.copy(t.aim).addScaledVector(u,140);const g=gh(o.x,o.z)+25;if(o.y<g)o.y=g;return o}
 function lineTT(t){if(t.k!=='hyper')return t.p.distanceTo(t.aim)/Math.max(1,t.spd);const h=Math.hypot(t.p.x-t.aim.x,t.p.z-t.aim.z);return(Math.max(0,h-30000)+Math.hypot(Math.min(h,30000),Math.min(h,30000)))/Math.max(1,t.spd)}
 const lineGo=(me,t)=>linePt(t,_c).distanceTo(me.p)/Math.max(60,F.cruise*topV(me)*.8)+5;  /* flying there, then settling into the hover */
 function loiterPt(o){let bx=0,bz=0,n=0;for(const q of G.wq||[]){bx+=Math.sin(q.brg);bz-=Math.cos(q.brg);n++}for(const t of TH)if(api.live(t)){bx+=(t.p.x)/5000;bz+=(t.p.z-1950)/5000;n++}
  const l=Math.hypot(bx,bz)||1;o.set(n?bx/l*1300:0,0,1950+(n?bz/l*1300:-1300));o.y=gh(o.x,o.z)+220;return o}

 function think(me,alive){const from=alive||!me.home?me.p:_c.set(me.home.x,gh(me.home.x,me.home.z)+150,me.home.z);
  if(st.line&&(!api.live(st.line)||alive&&lineGo(me,st.line)>lineTT(st.line)+2&&linePt(st.line,_a).distanceTo(me.p)>30))st.line=null;
  if(alive&&!st.line)st.line=pickLine(me);
  const t=pick(me,from);if(t!==st.tgt){st.tgt=t;st.plan=null;st.tgtT=st.t}
  if(t&&!st.line)api.pickT=t;else if(st.line)api.pickT=st.line;
  // relaunch (R): a fresh interceptor at the pad nearest the target, when that is much quicker than flying there; also a flat pack far from anything
  if(alive&&F.relaunch&&st.t-st.launchT>6&&me.home){const bat=1-me.mah/Math.max(1,api.BCAP),goal=st.line?linePt(st.line,_a):t?t.p:null;
   if(goal){const d=goal.distanceTo(me.p);let df=1e9;for(const f of api.FOBS)df=Math.min(df,Math.hypot(f.x-goal.x,f.z-goal.z));
    if(d>3200&&df<d*.4||bat<.1&&d>1500){st.why=d>3200?'a fresh interceptor from the nearest pad is quicker':'battery low';api.relaunch?.();st.launchT=st.t;return}}}
  // tipped over on the ground: press R
  if(alive&&me.v.lengthSq()<1&&agl(me.p)<2&&_v.set(0,1,0).applyQuaternion(me.q).y<.5){if((st.stuck+=F.react)>3){st.stuck=0;st.why='tipped over';api.relaunch?.();st.launchT=st.t}}else st.stuck=0}

 // ---------- turning a wanted acceleration into sticks ----------
 function sticks(me,A,head,dt,look){const M=S.mod,g=M.grav||9.81,THR=M.thr||48,TE=M.te||1.4,VP=M.vp||260,DQ=M.dq,DL=M.dl,FS=M.fs||4;
  const R=_A.copy(A);R.y+=g;const s=me.v.length();
  // hover: point the nose along the thrust it needs (at most 80 degrees off vertical)
  const Nh=_n.copy(R);if(Nh.lengthSq()<1e-6)Nh.set(0,1,0);Nh.normalize();
  if(Nh.y<.17){const hl=Math.hypot(Nh.x,Nh.z);if(hl>.3)Nh.set(Nh.x/hl*.985,.17,Nh.z/hl*.985);else Nh.set(0,1,0)}  /* thrust can't point down: to sink faster than it falls, stay upright and cut the throttle */
  let aT=Math.max(0,R.dot(Nh)),N=Nh;
  // at speed: the nose a little off the flight path, toward the side it has to turn, so the fins' side force does the turning
  if(s>8){const vh=_h.copy(me.v).divideScalar(s),Ap=R.dot(vh),Pp=_f.copy(R).addScaledVector(vh,-Ap);
   if(s>40&&Ap<0&&Pp.length()<-Ap*.5){const sx=-vh.z,sz=vh.x,c=(0-me.p.x)*sx+(1950-me.p.z)*sz>=0?1:-1;Pp.x+=sx*c*-Ap;Pp.z+=sz*c*-Ap}  // fast and told to stop dead: a dart can't brake, it turns (toward the middle of the area)
   const ap=Pp.length(),drag=DQ*s*s+DL*s,Lk=(DL+DQ*s*FS)*s;
   const al=Math.min(.7,Math.atan2(ap,Lk+Math.max(0,Ap+drag))),Na=_v.copy(vh).multiplyScalar(Math.cos(al));if(ap>1e-6)Na.addScaledVector(Pp,Math.sin(al)/ap);
   const aTa=Math.max(0,(Ap+drag)/Math.max(.35,Math.cos(al))),w=sm((s-8)/22)*Math.max(sm((Ap/Math.max(1e-6,R.length())-.1)/.5),sm((s-40)/40));
   if(_n.dot(Na)<0){if(w>.5)_n.copy(Na)}else _n.multiplyScalar(1-w).addScaledVector(Na,w).normalize();N=_n;aT=aT*(1-w)+aTa*w}  // slow and turning hard about (the thrust it needs points well off the flight path): thrust-vector round like a quad; fast: always the fins
  aT-=me.boost||0;
  const nose=_c.set(0,1,0).applyQuaternion(me.q),va=me.v.dot(nose),infl=cl(1-va/VP,.05,1.15),volt=cl((Math.max(me.vc||4,3)/4.05)**1.6,.5,1.04);
  const ms=cl((Math.max(0,aT)/(THR*infl*volt))**(1/TE),0,1);
  // body attitude: nose = N, camera side toward the heading in a hover, the picture upright in cruise
  const hz=Math.hypot(N.x,N.z);if(hz>.05)_h.set(N.x/hz,0,N.z/hz);else _h.copy(head);
  _f.copy(_h).multiplyScalar(N.y).addScaledVector(UP,-hz);const wc=sm((s-15)/20);  /* cruise: the picture upright; hover: keep facing the heading whichever way it tilts, so a correction is a tilt, not a yaw swing */
  if(wc<1){_v.copy(head).addScaledVector(N,-head.dot(N));if(_v.lengthSq()>1e-4)_f.multiplyScalar(wc).addScaledVector(_v.normalize(),1-wc)}
  if(look&&N.angleTo(look)<.35)N=_n.copy(look);  // holding the sights on a track: the nose goes where it is looking
  fake.q=me.q;attitude(fake,N,_f,18,14,1);
  // body rates -> stick positions through the player's rate curves (acro, with Betaflight's FPV angle mix when it is on)
  const a=S.fpvMix?(api.camUp?S.tilt:0)*Math.PI/180:0,c=Math.cos(a),sn=Math.sin(a);
  const pit=inv(x=>rate(1,x),-WT.x,-1,1),rol=inv(x=>rate(0,x),sn*WT.y-c*WT.z,-1,1),yaw=inv(x=>rate(2,x),-c*WT.y-sn*WT.z,-1,1),thr=inv(thrCurve,ms,0,1);
  return{thr,yaw,pit,rol}}

 // ---------- where it wants to go: a velocity, with terrain and the edge of the area kept clear ----------
 function want(me,Vd,kv,floor){const p=me.p,s=me.v.length();for(const q of api.SITES)if(Math.hypot(q.x-p.x,q.z-p.z)<(q.r||80)+200)floor=Math.max(floor,75);const ag=agl(p);  // the sites' buildings stand up to ~40 m: keep above them

  Vd.y=Math.max(Vd.y,-Math.max(4,(ag-floor)*.35));  /* a glide slope: never sink faster than it can level off above the floor */
  for(const k of[.6,1.2,2.6,2.6+s/14]){_a.copy(p).addScaledVector(me.v,k);const ah=_a.y-gh(_a.x,_a.z);if(ah<floor)Vd.y=Math.max(Vd.y,(floor-ah)*1.3+2)}
  if(ag<floor*.5)Vd.y=Math.max(Vd.y,6+(floor*.5-ag));
  const AW=(api.AW||4300)-450;for(const ax of['x','z']){const q=p[ax]+me.v[ax]*(2.5+s/90),e=Math.abs(q)-AW;if(e>0)Vd[ax]-=Math.sign(q)*(20+e)}  // the edge of the area is a wall: turn back before it, looking 2.5 s ahead and more at speed
  const A=_W.subVectors(Vd,me.v).multiplyScalar(kv),Am=Math.max(55,Math.min(250,.006*s*s));if(A.length()>Am)A.setLength(Am);return A}  // at speed the fins pull far harder than the motors push

 // ---------- one physics step: guidance, the detonate press, the camera switch ----------
 const Vd=new V3(),head=new V3(0,0,-1),ip=new V3(),LOOK=new V3();
 // flying to a point and stopping on it: a speed that it can still brake from (drag, then thrust-vectoring), stiff for the last few metres. Sets Vd, returns the gain
 function approach(e,d,vmax){const sp=Math.min(vmax,d<8?2.2*d:Math.sqrt(12*d)+7);Vd.copy(e).multiplyScalar(sp/Math.max(d,1e-3));return d<8?4:d<60?2.5:2}
 function input(me,dt){st.t+=dt;let look=null;const ag=agl(me.p),s=me.v.length(),onMat=ag<3&&s<3&&me.t<6;let kv=1.6,floor=30;
  if(st.lastMe!==me.t&&me.t<.02)st.launchT=st.t;
  const k=dt/1.5,an=F.aim*Math.sqrt(2*k);st.aimN.multiplyScalar(1-k).add(_a.set(gauss()*an,gauss()*an*.6,gauss()*an));
  const t=st.tgt&&live(st.tgt)?st.tgt:null,L=st.line&&api.live(st.line)?st.line:null;
  if(t)head.set(t.p.x-me.p.x,0,t.p.z-me.p.z);if(head.lengthSq()<1)head.set(0,0,-1);head.normalize();
  if(onMat||me.t<1.2&&ag<12){st.mode='mat';const rk=Z.rk?.st?.armed;Vd.set(rk?head.x*30:0,rk?10:16,rk?head.z*30:0);kv=2.5;floor=0;st.intent=`taking off from ${me.home?.n||'the mat'}${rk?' · rocket armed':''}`}  // Rocket Assist lights 4 m up: lean toward the target first
  else if(ag<18&&me.t<8&&!(me.boost>0)&&st.mode==='mat'){Vd.set(head.x*12,14,head.z*12);kv=2;floor=0;st.intent=`climbing out of ${me.home?.n||'the mat'}`}
  else if(st.hold){st.mode='hold';const e=_a.subVectors(st.hold,me.p),d=e.length();kv=approach(e,d,60);floor=10;st.intent=`holding position · ${d.toFixed(1)} m off`}  /* tests: hover on a point */
  else if(L){st.mode='line';head.set(L.p.x-me.p.x,0,L.p.z-me.p.z);if(head.lengthSq()>1)head.normalize();else head.set(0,0,-1);const H=linePt(L,ip),e=_a.subVectors(H,me.p),d=e.length(),tt=lineTT(L);
   kv=approach(e,d,F.cruise*topV(me));floor=12;
   st.intent=`sitting on the line of ${name(L)} · impact in ${Math.ceil(tt)} s${d>8?' · '+rng(d)+' to go':''}`}
  else if(t){st.mode='chase';const rel=_a.subVectors(t.p,me.p),d=rel.length(),top=topV(me),S0=Math.max(70,Math.min(top*.97,F.cruise*top)),fastT=t.spd>.75*S0||me.boost>0;
   const vr=_b.subVectors(t.v,me.v),cv=Math.max(0,-vr.dot(rel)/Math.max(d,1)),dTerm=Math.max(350,4*cv),tAgl=agl(t.p);
   if(d>dTerm||fastT){const sp=fastT?Math.max(S0,s):S0;let tau=d/sp;const a2=t.v.lengthSq()-sp*sp,b2=2*rel.dot(t.v),c2=rel.lengthSq();
    if(Math.abs(a2)>1e-6){const q=b2*b2-4*a2*c2;if(q>=0){const r1=(-b2-Math.sqrt(q))/(2*a2),r2=(-b2+Math.sqrt(q))/(2*a2),m=Math.min(r1>0?r1:1e9,r2>0?r2:1e9);if(m<1e9)tau=m}}
    tau=Math.min(tau,60);ip.copy(t.p).addScaledVector(t.v,tau);if(!fastT&&t.v.lengthSq()>1){const f=_c.copy(t.v).normalize(),ahead=rel.dot(f)<0;ip.addScaledVector(f,-Math.min(ahead?420:220,d*(ahead?.35:.12)))}  /* slow tracks: come in toward their six, wider when meeting one head-on */
    if(d<dTerm)ip.add(st.aimN);Vd.subVectors(ip,me.p).setLength(sp);kv=d<dTerm?3.2:1.6;
    st.intent=`${d<dTerm?'closing on':'chasing'} ${name(t)} · ${rng(d)}`;
    // lock-on: a pilot who uses it holds its sights on a track it is coming up behind or abeam (one meeting it head-on it turns into the six of first)
    // until the lock builds: pure pursuit, its aim wander as sight error; then it keeps its course within 10 degrees of the line of sight
    const LK=Z.lk,asp=rel.dot(t.v)/Math.max(1e-6,d*t.v.length());if(LK&&F.lockAim>0&&d<3400&&d>120&&!t.dmg&&asp>-.2){if(t._la==null)t._la=Math.random()<F.lockAim?1:0;
     if(t._la){const los=_c.copy(rel).divideScalar(d);if(LK.t!==t){Vd.copy(los).multiplyScalar(Math.max(sp,s*.9));look=LOOK.copy(st.aimN).multiplyScalar(1/60).add(los).normalize();st.intent=`locking on ${name(t)} · ${rng(d)}${LK.cand===t&&LK.prog>0?' · '+Math.round(LK.prog*100)+'%':''}`}
      else if(Vd.angleTo(los)>.17){const v=Vd.length(),u=_v.copy(Vd).addScaledVector(los,-Vd.dot(los)).normalize();Vd.copy(los).multiplyScalar(Math.cos(.17)).addScaledVector(u,Math.sin(.17)).multiplyScalar(v)}}}}
   else{const aim=_c.copy(t.p).add(st.aimN),los=aim.sub(me.p),dl=los.length();los.divideScalar(Math.max(dl,1));  /* its velocity plus a closing speed straight at it: it runs the track down from wherever it is */
    const Vc=cl(.5*d+6,8,58);Vd.copy(t.v).addScaledVector(los,Vc);if(Vd.length()>top)Vd.setLength(top);kv=d<40?2.2:2.8;st.intent=`closing on ${name(t)} · ${rng(d)}`;
    if(Z.lk&&t._la&&d>60){look=LOOK.copy(los);if(Z.lk.t!==t&&Z.lk.cand===t&&Z.lk.prog>0)st.intent+=` · locking ${Math.round(Z.lk.prog*100)}%`}}  // the run-in: sights on it (it is in front now), so a lock builds or holds
   floor=Math.max(d<500?cl(tAgl-10,t.k==='swarm'?8:15,30):30,s*(d<120?.08:.25));  // the faster it goes, the more ground it keeps under it (a pull-out at rocket speed takes hundreds of metres)
   if(d<90)detonate(me,t,dt);
   if(st.plan)st.intent=`detonating on ${name(t)}`}
  else{const lowBat=me.mah/Math.max(1,api.BCAP)>.9&&!F.relaunch,P0=lowBat&&me.home?_c.set(me.home.x,gh(me.home.x,me.home.z)+40,me.home.z):loiterPt(_c),e=_a.subVectors(P0,me.p),d=e.length();
   st.mode=lowBat?'home':'loiter';kv=approach(e,d,F.cruise*topV(me));
   st.intent=lowBat?'returning to mat':G.state==='clear'?'wave cleared · holding':'holding over the sites'+(st.sw?'':' · no tracks in reach')}
  if(me.boost>0&&(st.mode==='line'||st.mode==='hold'||st.mode==='loiter'||st.mode==='home')){const sp=Vd.length();if(sp>1)Vd.setLength(Math.max(sp,topV(me)*.9));kv=1.6}  // the rocket can't be throttled back: circle the point until it burns out
  if(st.sw&&st.mode!=='mat')st.intent+=' · '+st.sw;
  // camera tilt switch: level for take-off, 90 degrees once it is away from the mat (its sights look down the nose)
  if(!onMat&&ag>10&&!api.camUp)api.camUp=true;
  st.lastMe=me.t;st.lastIntent=st.intent;st.lastV=s;
  {const tg=t||L,K={mat:'launch',hold:'idle',line:'line',home:'return',loiter:'station'}[st.mode]||(tg&&Z.lk?.t===tg?'lock':'intercept');B.set(K,st.intent,tg?{x:tg.p.x,y:tg.p.y,z:tg.p.z,label:name(tg)}:null)}
  const A=want(me,Vd,kv,floor);return sticks(me,A,head,dt,look)}

 // manual detonation: when the closest approach is a moment away and close enough, press detonate at that moment (with this pilot's timing
 // error); when it is already as close as it will get (sitting in the track's six, or passing), press now if that is close enough
 function detonate(me,t,dt){if(Z.autoFuse?.()&&!st.plan)return;const r=_a.subVectors(t.p,me.p),vr=_b.subVectors(t.v,me.v),vv=Math.max(1e-6,vr.lengthSq()),tc=-r.dot(vr)/vv,dc=_c.copy(r).addScaledVector(vr,Math.max(0,tc)).length(),d=r.length();
  const K=KIND[t.k]||{},want=K.armor==='boss'?Math.max(F.fire,6):K.armor===1&&F.pick==='smart'?Math.min(F.fire,K.hitR||2):F.fire;
  if(st.plan&&st.plan.id!==t.id)st.plan=null;
  if(!st.plan&&tc>dt&&tc<.35&&dc<want)st.plan={at:st.t+Math.max(0,tc+gauss()*F.det),id:t.id};
  else if(!st.plan&&d<want&&(tc<=dt||dc>d-.25||tc>1.5))st.plan={at:st.t+Math.abs(gauss()*F.det),id:t.id};
  if(st.plan&&st.t>=st.plan.at){st.plan=null;if(d<want*1.6+3){st.fire=true;st.fired++}}
  else if(st.plan&&tc<-.15&&d>want*2+4){st.plan=null;st.passes++}}

 // per physics step from zspectate.js: tactics (perks, swarm) every half second, the radar picture every F.react seconds
 function step(dt){const me=api.player;if(!me)return;const alive=me.dead<=0;if(!alive)st.t+=dt;
  if((st.look-=dt)<=0){st.look=F.react*(.7+Math.random()*.6);think(me,alive)}
  if(st.tgt&&!live(st.tgt)){st.tgt=null;st.look=Math.min(st.look,F.react*.5)}
  if((st.tact-=dt)<=0){st.tact=.5;if(G.state==='wave')st.sw=tactics(P,E,{me})||''}
  if(!alive){st.intent=me.dead>0?`next interceptor in ${me.dead.toFixed(1)} s`:st.intent;B.set('relaunch',st.intent,null)}}
 const pilot={st,input,step,linePt:t=>linePt(t,new V3()),lineTT,fire(){const f=st.fire;st.fire=false;return f},get intent(){return st.intent},reset(){st.tgt=null;st.line=null;st.plan=null;st.fire=false;st.look=0}};
 B.begin(P,pilot);return pilot}
