// Calibration Lab drills: small state machines over plain observations (no three.js), one per drill. The Lab mode
// (modes/lab.js) feeds tick(o) every physics step and turns the returned events into tuner updates; it reads d.rig
// (how the quad is held) and d.view (what to draw).
// o: {t drill time s, x:[roll,pitch,yaw] sticks, raw:[3] sticks before deadband, thr stick 0..1, motor 0..1, ang:[3] angle °
// turned on each axis (integrated rates), err:[3] tracking error °, tv:[3] target rate °/s, tilt:[roll,pitch] °,
// p:[x,y,z] position m, vy m/s, dz deadband}
import {altMetrics,dodgeMetrics,noiseMetrics,pctl,snapMetrics,trackMetrics} from './metrics.js';
export const ROOM={hx:18,hz:18,h:20},ANCHOR=[0,9,0];
export const DRILLS=[
 {id:'still',name:'Hold still & hover',dur:22,goal:'Sets stick deadband and throttle mid'},
 {id:'roll',name:'Roll snaps',dur:30,ax:0,goal:'Sets roll rate and expo'},
 {id:'pitch',name:'Pitch snaps',dur:30,ax:1,goal:'Sets pitch rate and expo'},
 {id:'yaw',name:'Yaw snaps',dur:25,ax:2,goal:'Sets yaw rate and expo'},
 {id:'track',name:'Small corrections',dur:30,goal:'Sets centre sensitivity, expo and deadband'},
 {id:'dodge',name:'Dodge',dur:35,goal:'Sets max rate and assist'},
 {id:'alt',name:'Altitude gates',dur:30,goal:'Sets throttle mid and expo'}];
const AXW=['ROLL','PITCH','YAW'],DIRW=[['right','left'],['forward','back'],['right','left']];
export function makeDrill(def,rnd=Math.random){const D={def,rig:'gimbal',view:{},msg:'',t:0,reps:0},pick=a=>a[Math.floor(rnd()*a.length)];
 // ---- hold still: hands off on the floor, then hover in a band with the right stick centred
 if(def.id==='still'){const raw=[],yaw=[],mot=[];D.rig='floor';
  D.tick=o=>{D.t=o.t;if(o.t<5){D.rig='floor';D.msg='Hands off the sticks (radio: throttle down). Measuring stick noise…';if(o.t>1.2)raw.push([...o.raw]);
    if(o.t+1/120>=5){D.rig='hover';D.reps++;return[{kind:'rest',N:noiseMetrics(raw)}]}return[]}
   D.rig='hover';D.view={band:[6.6,9.4]};D.msg='Take off and hover inside the green band. Keep roll, pitch and yaw centred.';
   if(o.t>7){yaw.push(Math.abs(o.raw[2]));if(o.p[1]>6.6&&o.p[1]<9.4&&Math.abs(o.vy)<1.5)mot.push(o.motor)}return[]};
  D.end=()=>[{kind:'hover',motor:mot.length>60?mot.reduce((a,b)=>a+b,0)/mot.length:null,cross:yaw.length>60?pctl(yaw,.9):null}];return D}
 // ---- snaps on one axis: rotate to the target needle and stop dead
 if(def.ax!=null){const ax=def.ax,amps=ax===0?[60,90,120,180]:ax===1?[45,90,135,180]:[45,90,135];let rep=null,inT=0;D.rig='snap';
  const next=(o)=>{const a=pick(amps)*(rnd()<.5?-1:1);rep={start:o.ang[ax],target:o.ang[ax]+a,t0:o.t,s:[]};inT=0;
   D.msg=`${AXW[ax]} ${a>0?DIRW[ax][0]:DIRW[ax][1]} ${Math.abs(a)}° and stop dead on the target`};
  D.tick=o=>{D.t=o.t;if(!rep)next(o);const th=o.ang[ax];rep.s.push({t:o.t-rep.t0,x:o.x[ax],th});const band=Math.max(4,.06*Math.abs(rep.target-rep.start));
   inT=Math.abs(th-rep.target)<band&&Math.abs(o.x[ax])<.15?inT+1/120:0;D.view={dial:ax,th,target:rep.target,tol:band,start:rep.start};
   if(inT>.45||o.t-rep.t0>3.5){const M=snapMetrics(rep);next(o);D.reps++;return M?[{kind:'snap',ax,M}]:[]}return[]};
  D.end=()=>[];return D}
 // ---- small corrections: keep the reticle on a slowly drifting target (all three axes)
 if(def.id==='track'){const ph=Array.from({length:6},()=>rnd()*6.28),A=[[12,5],[9,4],[16,6]],F=[[.35,.8],[.3,.7],[.25,.6]];let win=[],w0=3;D.rig='gimbal';
  D.target=t=>{const k=Math.min(1,t/2);return A.map((a,i)=>k*(a[0]*Math.sin(F[i][0]*t+ph[i*2])+a[1]*Math.sin(F[i][1]*t+ph[i*2+1])))};
  D.rate=t=>{const k=Math.min(1,t/2);return A.map((a,i)=>k*(a[0]*F[i][0]*Math.cos(F[i][0]*t+ph[i*2])+a[1]*F[i][1]*Math.cos(F[i][1]*t+ph[i*2+1])))};
  D.tick=o=>{D.t=o.t;D.msg='Keep the crosshair on the green target and its bar level with yours. Small, smooth corrections.';D.view={tgt:D.target(o.t)};
   if(o.t<w0)return[];win.push({t:o.t,e:[...o.err],x:[...o.x],r:[...o.raw],tv:[...o.tv]});
   if(o.t-w0>=5){const Ms=trackMetrics(win,o.dz);win=[];w0=o.t;D.reps++;return Ms?[{kind:'track',Ms}]:[]}return[]};
  D.end=()=>[];return D}
 // ---- dodge: projectiles from the walls, aimed where you were when the warning appears; throttle is held for you
 if(def.id==='dodge'){const P=[],ev=[];let nextT=1.5;D.rig='dodge';D.proj=P;
  const wallHit=(p,d)=>{let t=1e9;for(const[k,h]of[[0,ROOM.hx-.5],[2,ROOM.hz-.5]]){if(d[k]>1e-6)t=Math.min(t,(h-p[k])/d[k]);if(d[k]<-1e-6)t=Math.min(t,(-h-p[k])/d[k])}
   if(d[1]>1e-6)t=Math.min(t,(ROOM.h-.5-p[1])/d[1]);if(d[1]<-1e-6)t=Math.min(t,(.5-p[1])/d[1]);return t};
  D.tick=o=>{D.t=o.t;const out=[];D.msg='Throttle is held for you. Get off the red line before the shot. Then level out cleanly.';
   if(o.t>=nextT&&o.t<def.dur-3){nextT=o.t+2.4+rnd()*.8;const az=rnd()*6.283,el=(rnd()-.5)*.3,d=[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)],t=wallHit(o.p,d);
    const pr={p:o.p.map((v,k)=>v+d[k]*t),aim:[...o.p],v:[0,0,0],st:'warn',t0:o.t,hit:false,ev:{t0:o.t,hit:false,s:[],tEnd:null}};P.push(pr);ev.push(pr.ev)}
   for(const pr of P){if(pr.st==='warn'&&o.t-pr.t0>=.9){pr.st='fly';const d=pr.aim.map((v,k)=>v-pr.p[k]),l=Math.hypot(...d)||1;pr.v=d.map(v=>v/l*28)}
    if(pr.st==='fly'){pr.p=pr.p.map((v,k)=>v+pr.v[k]/120);const r=pr.p.map((v,k)=>v-o.p[k]),dist=Math.hypot(...r);
     if(!pr.hit&&dist<1.6){pr.hit=pr.ev.hit=true;out.push({kind:'hit'})}
     if(dist>4&&r[0]*pr.v[0]+r[1]*pr.v[1]+r[2]*pr.v[2]>0||Math.abs(pr.p[0])>ROOM.hx||Math.abs(pr.p[2])>ROOM.hz||pr.p[1]<0||pr.p[1]>ROOM.h){pr.st='gone';pr.ev.tEnd=o.t}}}
   for(let i=P.length-1;i>=0;i--)if(P[i].st==='gone')P.splice(i,1);
   for(let i=ev.length-1;i>=0;i--){const e=ev[i];e.s.push({t:o.t,x:[o.x[0],o.x[1]],tilt:[...o.tilt]});if(o.t-e.t0>5||e.tEnd!=null&&o.t-e.tEnd>1.5){ev.splice(i,1);const M=dodgeMetrics(e);D.reps++;if(M)out.push({kind:'dodge',M})}}
   return out};
  D.end=()=>[];return D}
 // ---- altitude gates: hold the band while it steps up and down (attitude held level)
 if(def.id==='alt'){const H=[12,6,14,7,11,5,13,8];let k=0,st=null;D.rig='alt';
  const next=o=>{const y=H[k++%H.length];st={lo:y-1.2,hi:y+1.2,t0:o.t,s:[]}};
  D.tick=o=>{D.t=o.t;if(!st)next(o);D.msg='Throttle only: get into the green band and hold it. It moves every 5 seconds.';D.view={band:[st.lo,st.hi]};
   st.s.push({t:o.t-st.t0,y:o.p[1],vy:o.vy,thr:o.thr,m:o.motor});if(o.t-st.t0>=5){const M=altMetrics(st);next(o);D.reps++;return M?[{kind:'alt',M}]:[]}return[]};
  D.end=()=>[];return D}
 throw new Error('unknown drill '+def.id)}
