// ---------- Calibration Lab UI: intro (preset + controls), drill overlay, live tuning panel, before/after summary ----------
import {$,V3} from '../config/constants.js';
import {S} from '../config/settings.js';
import {RTYPES} from '../config/ratetypes.js';
import {openBind} from '../input/calibration.js';
import {LAB,discard,endTest,enterLab,exitLab,finish,retry,revert,saveTo,skipDrill,startPack,startTest,targetQ} from '../modes/lab.js';
import {startDemo} from '../modes/match.js';
import {camera} from '../render/renderer.js';
import {GS,esc} from '../state.js';
import {DRILLS} from '../tuner/drills.js';
import {PRESETS,TGTXT} from '../tuner/presets.js';
import {LM} from '../tuner/room.js';
import {fmt,summary} from '../tuner/tuner.js';
import {syncUI} from './menu.js';
import {syncRates} from './rates.js';
import * as THREE from 'three';
let pid='def',lastSt='',panelT=0;const _p=new V3(),_q=new THREE.Quaternion(),_tq=new THREE.Quaternion(),_x=new V3(1,0,0);
const tgts=P=>Object.entries(P.tg).map(([k,v])=>`<span>${TGTXT[k][0]} <b>${TGTXT[k][1].replace('%v',v)}</b></span>`).join('');
function intro(){$('lpre').innerHTML=Object.values(PRESETS).map(P=>`<button class="lcard${P.id===pid?' on':''}" data-p="${P.id}"><b>${P.name}</b><span class="note">${esc(P.blurb)}</span><span class="ltg">${tgts(P)}</span></button>`).join('');
 [...$('lpre').children].forEach(b=>b.onclick=()=>{pid=b.dataset.p;intro()});
 // adapt speed: a choice only on Pro (hover a full second for a one-line explanation); Default always adapts gently
 $('lspeed').innerHTML=pid==='pro'?`<span class="note">Adapt speed</span>${[['gradual','Gradual','Small careful steps that settle over the whole pack and rarely over-correct.'],['quick','Quick','Bigger steps after fewer reps: you feel each change sooner, but it can over-correct.']].map(([k,n,t])=>`<button class="sm${LAB.speed===k?' on':''}" data-s="${k}" data-tip="${t}">${n}</button>`).join('')}`:'<span class="note">Adapt speed: automatic (gentle steps, so a bad rep never throws your settings off)</span>';
 [...$('lspeed').querySelectorAll('button')].forEach(b=>b.onclick=()=>{LAB.speed=b.dataset.s;intro()});tips($('lspeed'));
 $('ldrills').innerHTML=DRILLS.map((d,i)=>`<li><b>${d.name}</b> · ${d.dur} s · <span class="note">${d.goal}</span></li>`).join('')}
export function initLab(){
 $('labbtn').onclick=()=>enterLab();
 $('lbind').onclick=()=>openBind();$('lgo').onclick=()=>startPack(pid);$('lquit').onclick=()=>{exitLab();startDemo()};
 $('labskip').onclick=()=>skipDrill();$('labend').onclick=()=>finish();
 $('lsave').onclick=()=>{saveTo(+$('lslot').value);syncRates();syncUI();$('lsmsg').textContent=`Saved to rate profile ${+$('lslot').value+1} (now active), with deadband and assist. Rates panel and CLI export show it.`;sumBtns()};
 $('ldisc').onclick=()=>{discard();$('lsmsg').textContent='Not saved. Your settings are unchanged.';LAB.done=true;sumBtns()};
 $('lrev').onclick=()=>{revert();syncRates();syncUI();$('lsmsg').textContent='Reverted: rate profiles, deadband and assist are back to how they were before the Lab.';sumBtns()};
 $('ltestb').onclick=()=>startTest();$('lexitt').onclick=()=>endTest();$('lretry').onclick=()=>retry();
 $('lexit').onclick=()=>{if(!LAB.saved)discard();exitLab();startDemo()}}
// hover tooltips: shown after the pointer rests on an element with data-tip for a full second, gone as soon as it leaves
function tips(root){for(const el of root.querySelectorAll('[data-tip]')){let tm=0;el.onpointerenter=()=>{tm=setTimeout(()=>{const t=$('ltip'),r=el.getBoundingClientRect();t.textContent=el.dataset.tip;t.hidden=false;
  t.style.left=Math.min(innerWidth-t.offsetWidth-8,Math.max(8,r.left))+'px';t.style.top=(r.bottom+8)+'px'},1000)};el.onpointerleave=()=>{clearTimeout(tm);$('ltip').hidden=true}}}
function sumBtns(){$('lrev').disabled=!LAB.saved;$('lsave').disabled=LAB.saved}
function sumShow(){const T=LAB.T;LAB.done=false;$('lsmsg').textContent='';$('lslot').value=String(S.rpi);sumBtns();if(!T){$('lsrows').innerHTML='';return}
 const rows=summary(T);$('lstitle').textContent=`${T.P.name} tune · ${T.type} rates · ${T.reps} reps · ${T.changes} changes`;
 $('lsrows').innerHTML=`<tr><th></th><th>Before</th><th>After</th></tr>`+rows.map(r=>`<tr class="${r.changed?'chg':''}"><td>${r.lab}</td><td class="b">${r.from}</td><td class="a">${r.to}</td></tr>`).join('');
 const E=T.E,tg=T.P.tg,m=(v,d=0,u='')=>v==null?'—':(+v).toFixed(d)+u,line=[];
 for(const i of[0,1,2])if(E['s'+i])line.push(`${['Roll','Pitch','Yaw'][i]} snaps: overshoot ${m(E['s'+i].os,0,'%')} (target ≤ ${tg.os}%), settle ${m(E['s'+i].settle,0,' ms')}`);
 if(E.t0)line.push(`Tracking RMS: ${[0,1,2].map(i=>m(E['t'+i]?.rms,1,'°')).join(' / ')} (target ≤ ${tg.track}°)`);if(E.d)line.push(`Dodge: hit ${m(E.d.hit*100,0,'%')}, over-correction ${m(E.d.over,0,'°')} (target ≤ ${tg.over}°)`);
 if(E.a)line.push(`Altitude: overshoot ${m(E.a.over,2,'×')} band (target ≤ ${tg.alt})`);$('lsmet').innerHTML=line.map(l=>`<li>${l}</li>`).join('')}
function panel(){const T=LAB.T,D=LAB.drill;if(!T||!D)return;$('ltop').innerHTML=`<b>${D.def.name}</b> <span>${LAB.di+1}/${DRILLS.length} · ${T.P.name}</span>`;$('lmsg').textContent=LAB.st==='ready'?D.def.goal:D.msg;
 $('lbar').style.width=(LAB.st==='drill'?Math.min(100,LAB.t/D.def.dur*100):0)+'%';
 $('ltg').innerHTML=tgts(T.P);$('llast').textContent=LAB.last||'—';
 $('llog').innerHTML=T.log.slice(-6).reverse().map(l=>`<li class="${l.back?'back':''}">${esc(l.txt)}</li>`).join('')||'<li class="note">No changes yet</li>';
 const h=RTYPES[T.type].h,R=$('lrt');R.innerHTML=`<tr><th></th><th>Centre</th><th>Max</th><th>Expo</th></tr>`+['Roll','Pitch','Yaw'].map((n,i)=>`<tr><th>${n}</th>${['c','m','e'].map(k=>`<td>${fmt(T.p[k+i],T.p[k+i].v)}</td>`).join('')}</tr>`).join('')+
  `<tr><th>Deadband</th><td colspan="3">${fmt(T.p.dz,T.p.dz.v)} · yaw ${fmt(T.p.dzy,T.p.dzy.v)}</td></tr><tr><th>Throttle</th><td colspan="3">mid ${Math.round(T.p.tm.v)} · expo ${Math.round(T.p.te.v)}</td></tr><tr><th>Assist</th><td colspan="3">${T.p.as.v.toFixed(2)}</td></tr>`;R.title=h.join(' / ')}
// per rendered frame
export function labFrame(now){if(!LAB.on){lastSt='';return}if(LAB.st==='test'){const s=Math.max(0,Math.ceil(LAB.testT));$('ltt').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}const key=LAB.st+GS.menuOpen;if(key!==lastSt){const was=lastSt;lastSt=key;$('labintro').hidden=LAB.st!=='intro'||GS.menuOpen;$('labsum').hidden=LAB.st!=='sum'||GS.menuOpen;
  $('labrun').hidden=LAB.st!=='drill'&&LAB.st!=='ready'||GS.menuOpen;if(!was.startsWith(LAB.st)){if(LAB.st==='intro')intro();if(LAB.st==='sum')sumShow()}}
 const D=LAB.drill,run=LAB.st==='drill'||LAB.st==='ready',v=D?.view||{};
 // 3D markers
 LM.band.visible=run&&!!v.band;if(v.band){LM.band.position.y=(v.band[0]+v.band[1])/2;LM.band.scale.y=v.band[1]-v.band[0]}
 LM.tgt.visible=run&&LAB.st==='drill'&&!!D?.target;if(LM.tgt.visible){targetQ(LAB.t,_q);_q.multiply(_tq.setFromAxisAngle(_x,S.tilt*Math.PI/180));LM.tgt.position.copy(GS.player.p).add(_p.set(0,0,-12).applyQuaternion(_q));LM.tgt.quaternion.copy(_q)}
 const P=D?.proj||[];LM.proj.forEach((m,i)=>{const p=run&&P[i];m.visible=!!p&&p.st==='fly';const l=LM.lines[i];l.visible=!!p;if(!p)return;m.position.fromArray(p.p);
  const a=l.geometry.attributes.position;a.setXYZ(0,...p.p);const dx=p.aim.map((x,k)=>x+(x-p.p[k])*.4);a.setXYZ(1,...dx);a.needsUpdate=true;l.material.opacity=p.st==='warn'?.4+.4*Math.sin(now*.03):.25});
 // overlay
 const c=$('labc');if(c.width!==innerWidth||c.height!==innerHeight){c.width=innerWidth;c.height=innerHeight}const g=c.getContext('2d'),W=c.width,H=c.height;g.clearRect(0,0,W,H);
 if(LAB.flash>.05&&LAB.hits){g.fillStyle=`rgba(255,40,40,${LAB.flash*.5})`;g.fillRect(0,0,W,H)}
 if(!run||GS.menuOpen)return;if(now-panelT>150){panelT=now;panel()}
 g.textAlign='center';g.font='700 15px "JetBrains Mono",monospace';
 if(LAB.st==='ready'){g.fillStyle='#fff';g.font='700 italic 96px "Chakra Petch",sans-serif';g.fillText(Math.ceil(LAB.cd),W/2,H*.42);g.font='700 22px "Chakra Petch",sans-serif';g.fillText(D.def.name.toUpperCase(),W/2,H*.42+40);return}
 if(v.dial!=null){const R=Math.min(110,H*.16),cx=W/2,cy=H-R-40,ang=a=>(a%360)*Math.PI/180-Math.PI/2;g.lineWidth=3;g.strokeStyle='rgba(150,180,255,.35)';g.fillStyle='rgba(5,8,16,.55)';g.beginPath();g.arc(cx,cy,R,0,7);g.fill();g.stroke();
  for(let a=0;a<360;a+=45){const t=ang(a);g.beginPath();g.moveTo(cx+Math.cos(t)*R*.86,cy+Math.sin(t)*R*.86);g.lineTo(cx+Math.cos(t)*R,cy+Math.sin(t)*R);g.stroke()}
  const tb=v.tol*Math.PI/180;g.strokeStyle='rgba(61,255,154,.5)';g.lineWidth=R*.18;g.beginPath();g.arc(cx,cy,R*.9,ang(v.target)-tb,ang(v.target)+tb);g.stroke();
  const ndl=(a,col,w,l)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+Math.cos(ang(a))*R*l,cy+Math.sin(ang(a))*R*l);g.stroke()};ndl(v.target,'#3dff9a',5,.98);ndl(v.th,'#fff',4,.8);
  const rem=v.target-v.th;g.fillStyle='#fff';g.fillText(`${['ROLL','PITCH','YAW'][v.dial]} ${rem>0?'+':''}${Math.round(rem)}°`,cx,cy-R-10)}
 if(D.target){g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(W/2,H/2,14,0,7);g.moveTo(W/2-46,H/2);g.lineTo(W/2-18,H/2);g.moveTo(W/2+18,H/2);g.lineTo(W/2+46,H/2);g.stroke()}
 if(v.band){const x=W-46,y0=H*.2,hh=H*.55,Y=y=>y0+hh*(1-y/20),me=GS.player.p.y;g.fillStyle='rgba(5,8,16,.55)';g.fillRect(x-10,y0,20,hh);g.fillStyle='rgba(61,255,154,.55)';g.fillRect(x-10,Y(v.band[1]),20,Y(v.band[0])-Y(v.band[1]));
  const inb=me>=v.band[0]&&me<=v.band[1];g.fillStyle=inb?'#3dff9a':'#fff';g.beginPath();g.moveTo(x-16,Y(me));g.lineTo(x-28,Y(me)-7);g.lineTo(x-28,Y(me)+7);g.fill();g.fillText((me*9.81/34.5).toFixed(1)+' m',x-14,y0+hh+20)}
 for(const p of P){_p.fromArray(p.st==='warn'?p.p:p.p).project(camera);let x=_p.x,y=_p.y;const behind=_p.z>1;if(behind){x=-x;y=-y}
  if(!behind&&Math.abs(x)<.9&&Math.abs(y)<.85){g.strokeStyle='#ff4a3a';g.lineWidth=3;g.beginPath();g.arc((x*.5+.5)*W,(-y*.5+.5)*H,22,0,7);g.stroke();continue}
  const m=Math.max(Math.abs(x)/.9,Math.abs(y)/.85,1e-3);x/=m;y/=m;const sx=(x*.5+.5)*W,sy=(-y*.5+.5)*H,a=Math.atan2(-y,x);g.save();g.translate(sx,sy);g.rotate(a);g.fillStyle='#ff4a3a';g.beginPath();g.moveTo(18,0);g.lineTo(-10,-12);g.lineTo(-10,12);g.fill();g.restore()}}
