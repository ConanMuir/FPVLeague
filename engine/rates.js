// Rates: Betaflight rate maths (rc.c) for every rates type, three rate profiles, the throttle curve, and the Configurator-style Rates tab with CLI import/export
import {$,cl} from './util.js';
import {S,save} from './settings.js';
import {pad,axv,thrFull,calib,keys} from './input.js';
// axis 0 roll, 1 pitch, 2 yaw; returns rad/s
export const RT=()=>S.rprof[S.rpi],stk=[0,0,0,0];const P3=x=>x*x*x;
export function rate(axis,x){const R=RT(),[rc,sr,ex]=R.ax[axis],a=Math.abs(x);let r;
 switch(R.type){
  case'ACTUAL':{const e=ex/100,ef=a*(Math.pow(x,5)*e+x*(1-e)),cs=rc*10;r=x*cs+Math.max(0,sr*10-cs)*ef;break}
  case'QUICK':{const rr=rc*2,md=Math.max(sr*10,rr),e=ex/100,sf=(md/rr-1)/(md/rr),c=P3(a)*e+a*(1-e);r=x*rr/cl(1-c*sf,.01,1);break}
  case'KISS':{const c=ex/100;r=2000/cl(1-a*sr/100,.01,1)*(P3(x)*c+x*(1-c))*(rc/1000);break}
  case'RACEFLIGHT':{r=10*rc*(1+.01*ex*(x*x-1))*x*(1+a*sr*.01);break}
  default:{const e=ex/100,y=x*P3(a)*e+x*(1-e);let rr=rc/100;if(rr>2)rr+=14.54*(rr-2);r=200*rr*y/cl(1-a*sr/100,.01,1)}}
 return cl(r,-1998,1998)*Math.PI/180}
export function thrCurve(t){const R=RT(),m=R.thrMid/100,e=R.thrExpo/100,d=t-m,y=d>0?1-m:m;return cl((m+d*(1-e+e*d*d/(y*y||1)))*R.thrLimit/100,0,1)}

// f: [display multiplier, min, max] in the units Configurator shows; stored values are Betaflight's raw CLI integers
const RTYPES={BETAFLIGHT:{h:['RC Rate','Super Rate','RC Expo'],f:[[.01,.01,2.55],[.01,0,1],[.01,0,1]],d:[100,70,0]},
 ACTUAL:{h:['Center Sens.','Max Rate','Expo'],f:[[10,10,2000],[10,10,2000],[.01,0,1]],d:[7,67,0]},
 QUICK:{h:['RC Rate','Max Rate','Expo'],f:[[.01,.01,2.55],[10,0,2000],[.01,0,1]],d:[100,67,0]},
 KISS:{h:['RC Rate','Rate','RC Curve'],f:[[.01,.01,2.55],[.01,0,.99],[.01,0,1]],d:[100,70,0]},
 RACEFLIGHT:{h:['Rate','Acro+','Expo'],f:[[10,10,2550],[1,0,255],[1,0,100]],d:[37,80,50]}};
const defRates=(type='BETAFLIGHT')=>({type,ax:[0,1,2].map(()=>[...RTYPES[type].d]),thrMid:50,thrExpo:0,thrLimit:100});
const AXN=['ROLL','PITCH','YAW'],AXC=['#ff5a5a','#5ad46a','#4aa8ff'],deg=r=>r*180/Math.PI;
function rMsg(t){$('rmsg').textContent=t;clearTimeout(rMsg.t);rMsg.t=setTimeout(()=>$('rmsg').textContent='',3000)}
export function syncRates(){const R=RT(),T=RTYPES[R.type];$('rpi').value=S.rpi;$('rtype').value=R.type;T.h.forEach((h,j)=>$('rh'+j).textContent=h);
 for(let i=0;i<3;i++){for(let j=0;j<3;j++){const[k,mn,mx]=T.f[j],el=$('ri'+i+j);el.min=mn;el.max=mx;el.step=k;el.value=(R.ax[i][j]*k).toFixed(k<1?2:0)}$('rm'+i).textContent=Math.round(deg(rate(i,1)))}
 $('tmid').value=(R.thrMid/100).toFixed(2);$('texpo').value=(R.thrExpo/100).toFixed(2);$('tlim').value=R.thrLimit}
// validate the stored rate profiles and wire up the Rates tab; title heads the exported CLI text
export function initRates(title){
 {const ok=r=>r&&RTYPES[r.type]&&Array.isArray(r.ax)&&r.ax.length===3&&r.ax.every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite));
  if(!Array.isArray(S.rprof)||S.rprof.length!==3||!S.rprof.every(ok)){S.rprof=[{"type":"BETAFLIGHT","ax":[[80,70,30],[80,70,30],[80,75,30]],"thrMid":50,"thrExpo":0,"thrLimit":100},{"type":"BETAFLIGHT","ax":[[100,70,0],[100,70,0],[100,70,0]],"thrMid":50,"thrExpo":0,"thrLimit":100},{"type":"ACTUAL","ax":[[7,67,0],[7,67,0],[7,67,0]],"thrMid":50,"thrExpo":0,"thrLimit":100}]}
  for(const r of S.rprof){r.thrMid=cl(+r.thrMid||50,0,100);r.thrExpo=cl(+r.thrExpo||0,0,100);r.thrLimit=cl(+r.thrLimit||100,25,100)}S.rpi=cl(S.rpi|0,0,2);save()}
 $('rbody').innerHTML=AXN.map((n,i)=>`<tr><th style="color:${AXC[i]}">${n}</th>${[0,1,2].map(j=>`<td><input type="number" id="ri${i}${j}" aria-label="${n} value ${j+1}"></td>`).join('')}<td class="mx" id="rm${i}"></td></tr>`).join('');
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)$('ri'+i+j).onchange=e=>{const R=RT(),[k,mn,mx]=RTYPES[R.type].f[j];R.ax[i][j]=Math.round(cl(+e.target.value||0,mn,mx)/k);save();syncRates()};
 $('tmid').onchange=e=>{RT().thrMid=Math.round(cl(+e.target.value||0,0,1)*100);save();syncRates()};
 $('texpo').onchange=e=>{RT().thrExpo=Math.round(cl(+e.target.value||0,0,1)*100);save();syncRates()};
 $('tlim').onchange=e=>{RT().thrLimit=Math.round(cl(+e.target.value||100,25,100));save();syncRates()};
 $('rpi').onchange=e=>{S.rpi=+e.target.value;save();syncRates();rMsg('Using rate profile '+(S.rpi+1))};
 $('rtype').onchange=e=>{const R=RT(),t=e.target.value;R.type=t;R.ax=[0,1,2].map(()=>[...RTYPES[t].d]);save();syncRates();rMsg(t+' rates loaded with their defaults')};
 $('rreset').onclick=()=>{S.rprof[S.rpi]=defRates(RT().type);save();syncRates();rMsg('Profile reset')};
 const cliText=()=>{const R=RT(),L=[`# ${title} rate profile ${S.rpi+1}`,`rateprofile ${S.rpi}`,`set rates_type = ${R.type}`];
  ['roll','pitch','yaw'].forEach((n,i)=>L.push(`set ${n}_rc_rate = ${R.ax[i][0]}`,`set ${n}_expo = ${R.ax[i][2]}`,`set ${n}_srate = ${R.ax[i][1]}`));
  L.push(`set thr_mid = ${R.thrMid}`,`set thr_expo = ${R.thrExpo}`,`set throttle_limit_type = SCALE`,`set throttle_limit_percent = ${R.thrLimit}`);return L.join('\n')};
 $('cexp').onclick=()=>{const t=cliText();$('cli').value=t;try{navigator.clipboard.writeText(t).then(()=>rMsg('Copied. Paste into the Betaflight CLI, then type save.'),()=>{$('cli').select();rMsg('Select and copy the text above')})}catch(e){$('cli').select();rMsg('Select and copy the text above')}};
 $('cimp').onclick=()=>{const v={};for(const m of $('cli').value.matchAll(/^\s*set\s+(\w+)\s*=\s*(\S+)/gim))v[m[1].toLowerCase()]=m[2];
  const R=RT(),num=(...ks)=>{for(const k of ks)if(k in v&&Number.isFinite(+v[k]))return cl(Math.round(+v[k]),0,255)};let n=0;
  const ty=String(v.rates_type||'').toUpperCase();if(RTYPES[ty]){R.type=ty;n++}
  ['roll','pitch','yaw'].forEach((a,i)=>{const vals=[num(a+'_rc_rate',i<2?'rc_rate':'rc_rate_yaw'),num(a+'_srate'),num(a+'_expo',i<2?'rc_expo':'rc_expo_yaw')];vals.forEach((x,j)=>{if(x!=null){R.ax[i][j]=x;n++}})});
  const tm=num('thr_mid'),te=num('thr_expo'),tl=num('throttle_limit_percent');if(tm!=null){R.thrMid=Math.min(100,tm);n++}if(te!=null){R.thrExpo=Math.min(100,te);n++}if(tl!=null){R.thrLimit=cl(tl,25,100);n++}
  save();syncRates();rMsg(n?`Imported ${n} values into profile ${S.rpi+1}`:'No Betaflight rate settings found in that text.')};
 syncRates()}
// live rate curves with the sticks' current position, and the throttle curve
export function drawRates(){const gp=pad(),s=gp&&!calib?[axv(gp,3),axv(gp,2),axv(gp,1),thrFull()?(axv(gp,0)+1)/2:stk[3]]:stk;
 {const c=$('rgraph'),g=c.getContext('2d'),w=c.width,h=c.height,top=Math.max(200,Math.ceil(Math.max(...[0,1,2].map(i=>deg(rate(i,1))))/200)*200),L=64,B=h-34,X=v=>L+v*(w-L-14),Y=v=>B-v/top*(B-14);
  g.clearRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.4)';g.fillRect(0,0,w,h);g.font='18px "JetBrains Mono",monospace';g.lineWidth=1;
  for(let i=0;i<=4;i++){const v=top*i/4;g.strokeStyle='rgba(150,180,255,.16)';g.beginPath();g.moveTo(L,Y(v));g.lineTo(w-14,Y(v));g.stroke();g.fillStyle='#93a0b8';g.textAlign='right';g.fillText(Math.round(v),L-8,Y(v)+6)}
  for(let i=0;i<=4;i++){g.strokeStyle='rgba(150,180,255,.16)';g.beginPath();g.moveTo(X(i/4),14);g.lineTo(X(i/4),B);g.stroke();g.fillStyle='#93a0b8';g.textAlign='center';g.fillText(i*25+'%',X(i/4),h-8)}
  for(let a=2;a>=0;a--){g.strokeStyle=AXC[a];g.lineWidth=3.5;g.beginPath();for(let i=0;i<=100;i++){const x=i/100,y=Y(deg(rate(a,x)));i?g.lineTo(X(x),y):g.moveTo(X(x),y)}g.stroke()}
  g.textAlign='left';for(let a=0;a<3;a++){const x=Math.abs(s[a]||0),v=deg(rate(a,x));g.fillStyle=AXC[a];g.beginPath();g.arc(X(x),Y(v),8,0,7);g.fill();g.fillText(`${AXN[a]} ${Math.round(v)}°/s`,L+12,32+a*24)}}
 {const c=$('tgraph'),g=c.getContext('2d'),w=c.width,h=c.height,X=v=>10+v*(w-20),Y=v=>h-10-v*(h-20),t=cl(s[3]||0,0,1);
  g.clearRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.4)';g.fillRect(0,0,w,h);g.strokeStyle='rgba(150,180,255,.25)';g.lineWidth=1;g.beginPath();g.moveTo(X(0),Y(0));g.lineTo(X(1),Y(1));g.stroke();
  g.strokeStyle='#ffc640';g.lineWidth=3;g.beginPath();for(let i=0;i<=60;i++){const x=i/60;i?g.lineTo(X(x),Y(thrCurve(x))):g.moveTo(X(x),Y(thrCurve(x)))}g.stroke();
  g.fillStyle='#fff';g.beginPath();g.arc(X(t),Y(thrCurve(t)),6,0,7);g.fill()}}
// beginner sensitivity walkthrough: three plain questions, written into the current rate profile as Actual rates (center sens / max rate / expo)
export function initSens(){const el=document.createElement('div');el.innerHTML=`<div class="sbox"><div class="mhead"><b id="sstep">Step 1 of 4</b><span class="note" style="margin:0">Easy sensitivity setup</span><button class="sm" id="sx">✕</button></div>
       <h3 id="sq"></h3><p class="note" id="sd"></p><div class="sch" id="sch"></div><div id="sl"><input type="range" id="sr"><output id="so"></output></div>
       <div class="sbars" id="sbars"></div>
       <div class="mp"><button class="sm" id="sback">Back</button><button class="sm" id="snext">Next</button></div></div>`;el.id='sens';el.hidden=true;document.body.append(el);
{const W={max:670,feel:1,yaw:1},FEEL=[[120,55,'Smooth','Gentle around centre, easy to hold steady. Good for learning.'],[180,35,'Balanced','The usual freestyle feel.'],[260,15,'Twitchy','Small moves react fast. For racers.']],
 SPD=[[450,'Chill'],[670,'Normal'],[900,'Fast'],[1200,'Pro']],YW=[[.7,'Slower'],[1,'Same'],[1.15,'Faster']];let st=0,bak=null,iv=0;
 const apply=()=>{const[c,e]=FEEL[W.feel],ax=f=>[Math.round(Math.min(c,W.max*f)/10),Math.round(W.max*f/10),e];S.rprof[S.rpi]={...RT(),type:'ACTUAL',ax:[ax(1),ax(1),ax(YW[W.yaw][0])]}};
 const choices=(list,cur,set)=>{const h=$('sch');h.textContent='';list.forEach((t,i)=>{const b=document.createElement('button');b.className='sm'+(i===cur?' on':'');b.textContent=t;b.onclick=()=>{set(i);show()};h.append(b)})};
 function show(){$('sstep').textContent=`Step ${st+1} of 4`;$('sback').disabled=!st;$('snext').textContent=st<3?'Next':'Save';$('sl').hidden=st!==0;apply();
  if(st===0){$('sq').textContent='How fast should it spin at full stick?';$('sd').textContent='This is how fast a flip or roll goes with the stick pushed all the way. Pick one, then fine-tune with the slider.';
   choices(SPD.map(([v,n])=>`${n} ${v}°/s`),SPD.findIndex(x=>x[0]===W.max),i=>W.max=SPD[i][0]);const r=$('sr');r.min=300;r.max=1500;r.step=10;r.value=W.max;$('so').textContent=W.max+'°/s';r.oninput=()=>{W.max=+r.value;$('so').textContent=W.max+'°/s';[...$('sch').children].forEach(b=>b.classList.remove('on'));apply()}}
  else if(st===1){$('sq').textContent='How should small stick moves feel?';$('sd').textContent=FEEL[W.feel][3];choices(FEEL.map(f=>f[2]),W.feel,i=>W.feel=i)}
  else if(st===2){$('sq').textContent='Yaw (spinning flat) speed?';$('sd').textContent='Most pilots keep yaw a bit slower than flips and rolls.';choices(YW.map(y=>y[1]),W.yaw,i=>W.yaw=i)}
  else{$('sq').textContent='Try it';$('sd').textContent='Move your sticks (or arrow keys and A/D). The bars show how fast the drone will spin. Go back to change anything, or Save.';$('sch').textContent=''}}
 const tick=()=>{const g=pad(),v=g?[axv(g,3),axv(g,2),axv(g,1)]:[(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0),(keys.ArrowUp?1:0)-(keys.ArrowDown?1:0),(keys.KeyD?1:0)-(keys.KeyA?1:0)];
  $('sbars').innerHTML=st<3?'':AXN.map((n,i)=>{const r=Math.abs(deg(rate(i,v[i])));return `<div>${n}<b><i style="width:${Math.min(100,r/15)}%"></i></b>${Math.round(r)}°/s</div>`}).join('')};
 const close=ok=>{if(!ok&&bak)S.rprof[S.rpi]=bak;else{apply();save();syncRates()}$('sens').hidden=true;clearInterval(iv);bak=null};
 $('sensbtn').onclick=()=>{bak=JSON.parse(JSON.stringify(RT()));st=0;$('sens').hidden=false;show();iv=setInterval(tick,80)};
 $('sx').onclick=()=>close(false);$('sback').onclick=()=>{st=Math.max(0,st-1);show()};$('snext').onclick=()=>{if(st<3){st++;show()}else{close(true);$('calmsg').textContent='Sensitivity saved (rate profile '+(S.rpi+1)+'). Fine-tune any time in Rates.'}}}}
