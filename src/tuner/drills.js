// Calibration Lab drills: small state machines over plain observations (no three.js), one per drill. The Lab mode
// (modes/lab.js) feeds tick(o) every physics step and turns the returned events into tuner updates; it reads d.rig
// (how the quad is held) and d.view (what to draw).
// o: {t drill time s, x:[roll,pitch,yaw] sticks, raw:[3] sticks before deadband, thr stick 0..1, motor 0..1, ang:[3] angle °
// turned on each axis (integrated rates), err:[3] tracking error °, tv:[3] target rate °/s, tilt:[roll,pitch] °,
// p:[x,y,z] position m, vy m/s, dz deadband}
import {altMetrics,holdMetrics,noiseMetrics,pctl,snapMetrics,trackMetrics} from './metrics.js';
export const ROOM={hx:18,hz:18,h:20},ANCHOR=[0,9,0];
export const DRILLS=[
 {id:'still',name:'Hold still & hover',dur:22,goal:'Sets stick deadband and throttle mid'},
 {id:'roll',name:'Roll snaps',dur:30,ax:0,goal:'Sets roll rate and expo'},
 {id:'pitch',name:'Pitch snaps',dur:30,ax:1,goal:'Sets pitch rate and expo'},
 {id:'yaw',name:'Yaw snaps',dur:25,ax:2,goal:'Sets yaw rate and expo'},
 {id:'track',name:'Small corrections',dur:30,goal:'Sets centre sensitivity, expo and deadband'},
 {id:'alt',name:'Altitude gates',dur:30,goal:'Sets throttle mid and expo'}];
const AXW=['ROLL','PITCH','YAW'],DIRW=[['right','left'],['forward','back'],['right','left']];
export function makeDrill(def,rnd=Math.random){const D={def,rig:'gimbal',view:{},msg:'',t:0,reps:0},pick=a=>a[Math.floor(rnd()*a.length)];
 // ---- hold still: hands off on the floor, then hover in a band with the right stick centred
 if(def.id==='still'){const raw=[],yaw=[],mot=[];let hw=[],h0=7;D.rig='floor';
  D.tick=o=>{D.t=o.t;if(o.t<5){D.rig='floor';D.msg='Hands off the sticks (radio: throttle down). Measuring stick noise…';if(o.t>1.2)raw.push([...o.raw]);
    if(o.t+1/120>=5){D.rig='hover';D.reps++;return[{kind:'rest',N:noiseMetrics(raw)}]}return[]}
   D.rig='hover';D.view={band:[6.6,9.4]};D.msg='Take off and hover inside the green band. Keep roll, pitch and yaw centred.';
   if(o.t>7){yaw.push(Math.abs(o.raw[2]));if(o.p[1]>6.6&&o.p[1]<9.4&&Math.abs(o.vy)<1.5)mot.push(o.motor);hw.push({t:o.t,y:o.p[1],vy:o.vy,thr:o.thr,m:o.motor});
    if(o.t-h0>=1.5){const M=holdMetrics(hw,6.6,9.4);hw=[];h0=o.t;return M?[{kind:'hold',M}]:[]}}return[]};  // live: can you hold the hover?
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
 if(def.id==='track'){const ph=Array.from({length:6},()=>rnd()*6.28),A=[[12,5],[9,4],[16,6]],F=[[.35,.8],[.3,.7],[.25,.6]];let win=[],w0=3;D.rig='gimbal';  // corrections are judged every 2.5 s
  D.target=t=>{const k=Math.min(1,t/2);return A.map((a,i)=>k*(a[0]*Math.sin(F[i][0]*t+ph[i*2])+a[1]*Math.sin(F[i][1]*t+ph[i*2+1])))};
  D.rate=t=>{const k=Math.min(1,t/2);return A.map((a,i)=>k*(a[0]*F[i][0]*Math.cos(F[i][0]*t+ph[i*2])+a[1]*F[i][1]*Math.cos(F[i][1]*t+ph[i*2+1])))};
  D.tick=o=>{D.t=o.t;D.msg='Keep the crosshair on the green target and its bar level with yours. Small, smooth corrections.';D.view={tgt:D.target(o.t)};
   if(o.t<w0)return[];win.push({t:o.t,e:[...o.err],x:[...o.x],r:[...o.raw],tv:[...o.tv]});
   if(o.t-w0>=2.5){const Ms=trackMetrics(win,o.dz);win=[];w0=o.t;D.reps++;return Ms?[{kind:'track',Ms}]:[]}return[]};
  D.end=()=>[];return D}
 // ---- altitude gates: hold the band while it steps up and down (attitude held level)
 if(def.id==='alt'){const H=[12,6,14,7,11,5,13,8];let k=0,st=null,hw=[],h0=0;D.rig='alt';
  const next=o=>{const y=H[k++%H.length];st={lo:y-1.2,hi:y+1.2,t0:o.t,s:[]}};
  D.tick=o=>{D.t=o.t;if(!st)next(o);D.msg='Throttle only: get into the green band and hold it. It moves every 5 seconds.';D.view={band:[st.lo,st.hi]};
   st.s.push({t:o.t-st.t0,y:o.p[1],vy:o.vy,thr:o.thr,m:o.motor});if(o.t-st.t0>1.5){hw.push({t:o.t,y:o.p[1],vy:o.vy,thr:o.thr,m:o.motor});if(o.t-h0>=1.5&&hw.length>60){const M=holdMetrics(hw,st.lo,st.hi);hw=[];h0=o.t;if(M){const e=[{kind:'hold',M}];if(o.t-st.t0>=5){const A=altMetrics(st);next(o);hw=[];D.reps++;if(A)e.push({kind:'alt',M:A})}return e}}}
   if(o.t-st.t0>=5){hw=[];const M=altMetrics(st);next(o);D.reps++;return M?[{kind:'alt',M}]:[]}return[]};
  D.end=()=>[];return D}
 throw new Error('unknown drill '+def.id)}
