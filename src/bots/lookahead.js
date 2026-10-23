/* ---------- look-ahead planning (DIFF[].look): a few candidate plays flown a couple of seconds ahead with the real flight model ---------- */
/* At most every lkT s the attacker (thinkIQ, bots/league.js) flies up to four candidates in a copy of the game's flight model (flight/core.js */
/* quadAir at 30 Hz with botControl's cascaded controller and the attitude controller; no prop wash, so nothing is drawn from Math.random): */
/*   shot    the planned strike (plan: ai.C, ai.n, ai.tt) flown as strikeV's timed run */
/*   pass    the same run through the contact point that sends the ball down a teammate's open lane (bots/team.js passLane) */
/*   carry   (levels with the carry, DIFF[].drib) the possession approach: under the ball where it comes down to a catchable height */
/*   defend  the goal-side spot: no touch, the quad is home for whatever comes (no flight needed) */
/* A candidate that meets the predicted ball gets the ball's velocity after that touch (closing speed along the line of centres x KF, the */
/* touch model's gain: modes/step.js restitution plus the RL impulse), the ball is rolled on with the real ball model (physics/ball.js */
/* ballPhys at 25 Hz, to lkH s) and valued: +1 for crossing the enemy goal line, -1 for its own, a foe reaching it on the way makes it his */
/* (worth where it is, minus), otherwise where it ends up (toward the goal) and who gets to it first (reachT). A candidate the modelled foe */
/* beats to the touch (bots/model.js closing time) is worth the untouched ball, halved, minus a challenge penalty. The best wins: ai.lk, */
/* read by thinkIQ (pass: the lane plan, defend: the home spot) and possess (carry). */
/* CPU: at most LOOK.perTick look-aheads per tick for every quad together (a count, not a clock, so a match stays the same on every */
/* machine: the ladder and spin-check rely on that); a quad past it keeps its last pick and asks again at its next think, and with no */
/* pick the planner plays as before. LOOK.total / calls is the measured cost of one (tools/bot-match.mjs reports it per tick). */
import {HL,QT,V3,cl} from '../config/constants.js';
import {BKICK,BOOST,BOTV,BR,DL,DQ,DRAIN,G,MAXV,SPOOL,TAU,TE,THR,VP} from '../config/tune.js';
import {attitude,quadAir,turn} from '../flight/core.js';
import {ball,ballPhys} from '../physics/ball.js';
import {GS} from '../state.js';
import {PDT,PRED,PV,accOf,plan,reachT,threat,thrOf,vmOf} from './league.js';
import {topOf} from './dribble.js';
import {foeCT} from './model.js';
import {passLane} from './team.js';
export const LOOK={perTick:1,n:0,tick:-1,calls:0,skipped:0,total:0,picks:{shot:0,pass:0,carry:0,defend:0}};
const K={get G(){return G},get THR(){return THR},get TE(){return TE},get VP(){return VP},get TAU(){return TAU},get SPOOL(){return SPOOL},WASH:0,get BOOST(){return BOOST},get BKICK(){return BKICK},get DRAIN(){return DRAIN},get DL(){return DL},get DQ(){return DQ},get MAXV(){return MAXV}};
const SIM={p:new V3(),v:new V3(),q:new QT(),w:new V3(),wt:new V3(),wn:new V3(),ms:0,thr:0,boost:0,boosting:false,boostOn:false,fl:null,onBoost:null};
const B={p:new V3(),v:new V3(),w:new V3(),c:false,n:new V3()};
const _a=new V3(),_T=new V3(),_u=new V3(),_lk=new V3(),_n=new V3(),_c=new V3(),_tg=new V3(),_qn=new QT(),_lane=new V3(),_q=new V3();
const SV={C:new V3(),n:new V3(),P:new V3(),C0:new V3(),n0:new V3(),P0:new V3(),tt:0,t0:0,al:0};
const DT=1/30,BDT=1/25,KF=1.5;
function start(d){SIM.p.copy(d.p);SIM.v.copy(d.v);SIM.q.copy(d.q);SIM.w.copy(d.w);SIM.wt.copy(d.wt);SIM.wn.set(0,0,0);SIM.ms=d.ms;SIM.thr=d.thr;SIM.fl=d.fl}
/* one step toward the velocity demand vd: botControl's acceleration cascade (kd, the thrust cap, drag), attitude(), quadAir(), integrate */
function fly(D,vd,look,dt){const lim=Math.min(1,D.thr*BOTV),cap=thrOf(D)*lim,a=_a.subVectors(vd,SIM.v).multiplyScalar(D.kd);
 if(SIM.p.y<1.6&&SIM.v.y<0)a.y+=-SIM.v.y*2+(1.6-SIM.p.y)*8;if(a.length()>cap)a.setLength(cap);
 const T=_T.copy(a);T.y+=G;T.addScaledVector(SIM.v,DL+DQ*SIM.v.length());const need=T.length()||1;T.divideScalar(need);
 const al=_u.set(0,1,0).applyQuaternion(SIM.q).dot(T),F=SIM.fl;SIM.thr=cl(Math.max(need/(THR*F.thr),0)**(1/(TE*F.te)),0,lim)*cl((al-.1)/.6,.05,1);
 const lk=_lk.subVectors(look,SIM.p);lk.y=0;if(lk.lengthSq()<1)lk.set(0,0,-1);lk.normalize();attitude(SIM,T,lk,D.att,D.rate,.6);
 quadAir(SIM,dt,K,F,SIM.wt,false,false,_qn);SIM.p.addScaledVector(SIM.v,dt);turn(SIM.q,SIM.w,dt);if(SIM.p.y<1.2){SIM.p.y=1.2;if(SIM.v.y<0)SIM.v.y=0}}
/* strikeV's timed run through C along n, due at tt, t s into it */
function run(D,C,n,tt,t){const vm=D.vmax*BOTV,left=Math.max(.04,tt-t),along=_c.subVectors(C,SIM.p).dot(n),sp=cl(along/left,vm*D.fl,vm);
 _c.copy(C).sub(SIM.p).addScaledVector(n,-along);_c.y=Math.max(_c.y,1.8-SIM.p.y);return _c.multiplyScalar(3).addScaledVector(n,sp+(along-sp*left)*D.ka).clampLength(0,vm)}
/* fly a candidate for up to H s: 'run' (the strike through C along n, due tt) or 'go' (toward tg, moving with tv); returns the time of the first */
/* touch of the predicted ball (B then holds the ball after it; soft: the quad met it from below slower than 8 m/s, a catch), or -1 */
let soft=false;
function flyTo(d,D,kind,C,n,tt,tv,look,H){start(d);const R=BR+.7;let t=0;soft=false;
 while(t<H){const vd=kind==='run'?run(D,C,n,tt,t):_tg.subVectors(C,SIM.p).multiplyScalar(D.kp).add(tv).clampLength(0,D.vmax*BOTV);
  fly(D,vd,look,DT);t+=DT;const j=cl(Math.round(t/PDT)-1,0,PRED.length-1),P=PRED[j],v2=SIM.v.lengthSq()*DT*DT*.25;
  if(SIM.p.distanceToSquared(P)<R*R+v2){_n.subVectors(P,SIM.p).normalize();const rv=_n.dot(SIM.v)-_n.dot(PV[j]);B.p.copy(P);B.v.copy(PV[j]);soft=rv<8&&SIM.p.y<P.y-1;if(rv>0&&!soft)B.v.addScaledVector(_n,rv*KF);return t}}
 return -1}
/* the ball from B at t0 s from now, rolled on: a goal, an own goal, a foe's ball, or where it ends up and whose it is then */
function value(d,D,t0,H){const s=d.team?1:-1;B.w.set(0,0,0);B.c=false;B.n.set(0,1,0);let t=t0;const n=Math.round(H/BDT),k=D.lkS??1.1;
 for(let i=0;i<n;i++){ballPhys(B,BDT);t+=BDT;if(B.p.z*s>HL+BR)return 1;if(B.p.z*s<-HL-BR)return -1;
  if(i%3===2)for(const o of GS.drones)if(o.team!==d.team&&o.dead<=0&&reachT(o,B.p,accOf(o),vmOf(o))*k<t)return -.3+.3*B.p.z*s/HL}
 let tu=9,tf=9;for(const o of GS.drones){if(o.dead>0)continue;const r=reachT(o===d?SIM:o,B.p,accOf(o),vmOf(o));if(o.team===d.team)tu=Math.min(tu,r);else tf=Math.min(tf,r)}
 return .5*B.p.z*s/HL+(tu<tf?.25:-.25)}
const save=ai=>{SV.C.copy(ai.C);SV.n.copy(ai.n);SV.P.copy(ai.P);SV.C0.copy(ai.C0);SV.n0.copy(ai.n0);SV.P0.copy(ai.P0);SV.tt=ai.tt;SV.t0=ai.t0;SV.al=ai.al},
 load=ai=>{ai.C.copy(SV.C);ai.n.copy(SV.n);ai.P.copy(SV.P);ai.C0.copy(SV.C0);ai.n0.copy(SV.n0);ai.P0.copy(SV.P0);ai.tt=SV.tt;ai.t0=SV.t0;ai.al=SV.al};
/* the catch point for the carry candidate: the first predicted point where the ball comes down to a catchable height (PV.y <= 0, under 16 m */
/* over the top) that the quad reaches in time; sets out to the spot under it and returns its time, or -1 */
function catchAt(d,D,out){const H0=topOf(d)+BR,acc=thrOf(D)*D.thr*.7,vm=D.vmax*BOTV;
 for(let i=3;i<PRED.length;i+=4){const P=PRED[i];if(PV[i].y>0||P.y<H0+1||P.y>H0+16)continue;out.set(P.x,Math.max(P.y-H0-2.5,1.5),P.z);const t=(i+1)*PDT;if(reachT(d,out,acc,vm)*1.15+.2<=t)return t}return -1}
const SH={C:new V3(),n:new V3(),P:new V3(),tt:0,al:0},PA={C:new V3(),n:new V3(),P:new V3(),tt:0,al:0};
const keep=(o,ai)=>{o.C.copy(ai.C);o.n.copy(ai.n);o.P.copy(ai.P);o.tt=ai.tt;o.al=ai.al},put=(o,ai)=>{ai.C.copy(o.C);ai.n.copy(o.n);ai.P.copy(o.P);ai.tt=o.tt;ai.al=o.al};
/* a strike candidate's value: never meets the ball, the foe meets it first (the closing time ct), or the ball after the touch */
const strikeVal=(d,D,t,base,ct,H)=>t<0?base-.1:ct<t-.1?base*.5-(D.lkC??.25):value(d,D,t,H-t);
/* the pick: ai.lk ('shot' | 'pass' | 'carry' | 'defend'), or null when this tick's look-aheads are spent (the caller asks again next think) */
export function lookAhead(d,D){const ai=d.ai;if(LOOK.tick!==GS.stepN){LOOK.tick=GS.stepN;LOOK.n=0}
 if(LOOK.n>=LOOK.perTick){LOOK.skipped++;return null}LOOK.n++;const T0=performance.now(),H=D.lkH??2,ct=foeCT(d),s=d.team?1:-1,V=ai.lkv||(ai.lkv={});
 start(d);B.p.copy(ball.p);B.v.copy(ball.v);const base=value(d,D,0,H);let best='shot',bv=-9;V.shot=V.pass=V.carry=V.defend=null;
 /* the shot (the plan at the goal) and the pass (the plan at the current lane or set-up aim, else at the best lane): planned afresh, the current plan restored after */
 const ap=ai.aimP;save(ai);ai.aimP=null;plan(d,D);if(ai.tt>0){keep(SH,ai);V.shot=strikeVal(d,D,flyTo(d,D,'run',SH.C,SH.n,SH.tt,null,SH.P,H),base,ct,H);bv=V.shot}
 let lane=null;if(ap)lane=_lane.copy(ap);else if(D.team&&passLane(d,D,_lane)>0)lane=_lane;
 if(lane){ai.aimP=lane;plan(d,D);if(ai.tt>0){keep(PA,ai);V.pass=strikeVal(d,D,flyTo(d,D,'run',PA.C,PA.n,PA.tt,null,PA.P,H),base,ct,H)-(D.lkP??.05);if(V.pass>bv){bv=V.pass;best='pass'}}}
 ai.aimP=ap;load(ai);
 if(D.drib&&ball.p.y>BR+.5){const tc=catchAt(d,D,_q);if(tc>0){const t=flyTo(d,D,'go',_q,null,0,PV[cl(Math.round(tc/PDT)-1,0,PRED.length-1)],ball.p,Math.min(H,tc+.3));
  V.carry=t<0?base-.1:!soft?value(d,D,t,H-t):ct>t+(D.lkM??.5)?.5*B.p.z*s/HL+(D.lkV??.35):base*.5-(D.lkC??.25);if(V.carry>bv){bv=V.carry;best='carry'}}}
 V.defend=base+(threat(d.team)?(D.lkD??.8):0)-(D.lkF??.15);if(V.defend>bv){bv=V.defend;best='defend'}
 if(best==='shot'&&V.shot!=null){ai.aimP=null;put(SH,ai)}else if(best==='pass'){ai.lane=(ai.lane||new V3()).copy(lane);ai.aimP=ai.lane;put(PA,ai)}  /* shot or pass: that plan is the one to fly now */
 LOOK.total+=performance.now()-T0;LOOK.calls++;LOOK.picks[best]++;ai.lk=best;return best}
