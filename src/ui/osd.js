// ---------- Betaflight-style FPV OSD (Settings > Camera & video, or the O key): timer, attitude, link, throttle, speed, altitude ----------
// Drawn on a canvas over the FPV view in the MAX7456 look: white text with a black outline. Drone League has no battery: no pack voltage,
// mAh, current or low-battery warning (the Interceptor's Zombies keep theirs, games/interceptor).
import {$,DIFF,V3} from '../config/constants.js';
import {S} from '../config/settings.js';
import {G} from '../config/tune.js';
import {camera} from '../render/renderer.js';
import {GS} from '../state.js';
const cv=$('bfosd'),g=cv.getContext('2d'),_f=new V3(),_r=new V3(),B={d:null,t:0,clock:0,last:0};
const pad=(v,n)=>String(v).padStart(n);
export function osd(me){const on=!!(S.osd&&me&&GS.camMode===0&&!GS.llView&&me.dead<=0&&!GS.demo);cv.hidden=!on;$('osd').hidden=on;if(!on)return;
 const now=performance.now(),dt=Math.min(.1,(now-(B.last||now))/1000);B.last=now;
 if(B.d!==me||GS.clock>B.clock+1){B.d=me;B.t=0}B.clock=GS.clock;  // new match or new quad: the flight timer starts again
 if(!GS.paused&&GS.state==='play')B.t+=dt;
 const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
 g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);const fs=Math.round(Math.max(13,Math.min(24,H/30))),lh=fs*1.25,m=fs*1.4;
 g.font=`700 ${fs}px "JetBrains Mono",ui-monospace,monospace`;g.lineJoin='round';g.lineWidth=Math.max(2.5,fs/6);g.strokeStyle='#000';
 const txt=(s,x,y,al='left',col='#fff')=>{g.textAlign=al;g.strokeText(s,x,y);g.fillStyle=col;g.fillText(s,x,y)};
 const kmh=Math.round(me.v.length()*3.6*9.81/G),alt=me.p.y*9.81/G,t=B.t|0;
 // corners: craft name / mode, link, throttle, timer, speed, altitude
 txt((S.name||'DRONE LEAGUE').toUpperCase().slice(0,12),W/2,74+fs,'center');txt(S.mode==='acro'?'ACRO':'ANGL',W/2,74+fs+lh,'center');  // under the scoreboard
 txt(`LQ ${GS.net?'2:100':'100'}`,m,H-m-lh);txt(`THR ${pad(Math.round(me.thr*100),3)}`,m,H-m);
 txt(`${pad(Math.floor(t/60),2).replace(' ','0')}:${String(t%60).padStart(2,'0')}`,W/2,H-m,'center');
 txt(`${pad(kmh,3)}KM/H`,W-m,H-m-180,'right');txt(`${alt.toFixed(1)}M`,W-m,H-m-180+lh,'right');
 if(me.boostOn)txt('BOOST',W/2,H-m-lh*1.6,'center');
 // artificial horizon and sidebars (craft attitude, like Betaflight: not corrected for camera uptilt)
 _f.set(0,0,-1).applyQuaternion(me.q);_r.set(1,0,0).applyQuaternion(me.q);const pitch=Math.asin(Math.max(-1,Math.min(1,_f.y))),roll=Math.atan2(-_r.y,new V3(0,1,0).applyQuaternion(me.q).y);
 const ppd=H/camera.fov,oy=Math.max(-H*.3,Math.min(H*.3,pitch*180/Math.PI*ppd)),hw=Math.min(W,H)*.22;
 g.save();g.translate(W/2,H/2);g.rotate(-roll);g.translate(0,oy);g.strokeStyle='#000';g.lineWidth=5;
 for(let i=-4;i<=4;i++){if(Math.abs(i)<1)continue;const x=i*hw/4.5;g.beginPath();g.moveTo(x-hw/14,0);g.lineTo(x+hw/14,0);g.stroke();g.strokeStyle='#fff';g.lineWidth=2.5;g.stroke();g.strokeStyle='#000';g.lineWidth=5}
 g.restore();
 const sx=hw*1.25,sh=H*.16;g.lineWidth=2.5;for(const s of[-1,1])for(let i=-3;i<=3;i++){const y=H/2+i*sh/3,x=W/2+s*sx,l=i?6:12;g.strokeStyle='#000';g.lineWidth=5;g.beginPath();g.moveTo(x,y);g.lineTo(x-s*l,y);g.stroke();g.strokeStyle='#fff';g.lineWidth=2.5;g.stroke()}}
