// ---------- rates (Betaflight Configurator style) ----------
// rate types and defaults: config/ratetypes.js; rate maths: flight/rates.js
import {$,cl} from '../config/constants.js';
import {RTYPES,defRates} from '../config/ratetypes.js';
import {S,save} from '../config/settings.js';
import {RT,rate,stk,thrCurve} from '../flight/rates.js';
import {calib} from '../input/calibration.js';
import {assist,axv,dzOf,pad,thrFull} from '../input/input.js';
export const AXN=['ROLL','PITCH','YAW'],AXC=['#ff5a5a','#5ad46a','#4aa8ff'],deg=r=>r*180/Math.PI;
function rMsg(t){$('rmsg').textContent=t;clearTimeout(rMsg.t);rMsg.t=setTimeout(()=>$('rmsg').textContent='',3000)}
export function syncRates(){const R=RT(),T=RTYPES[R.type];$('rpi').value=S.rpi;$('rtype').value=R.type;T.h.forEach((h,j)=>$('rh'+j).textContent=h);
 for(let i=0;i<3;i++){for(let j=0;j<3;j++){const[k,mn,mx]=T.f[j],el=$('ri'+i+j);el.min=mn;el.max=mx;el.step=k;el.value=(R.ax[i][j]*k).toFixed(k<1?2:0)}$('rm'+i).textContent=Math.round(deg(rate(i,1)))}
 $('tmid').value=(R.thrMid/100).toFixed(2);$('texpo').value=(R.thrExpo/100).toFixed(2);$('tlim').value=R.thrLimit}
function cliText(){const R=RT(),L=[`# Drone League rate profile ${S.rpi+1}`,`rateprofile ${S.rpi}`,`set rates_type = ${R.type}`];
 ['roll','pitch','yaw'].forEach((n,i)=>L.push(`set ${n}_rc_rate = ${R.ax[i][0]}`,`set ${n}_expo = ${R.ax[i][2]}`,`set ${n}_srate = ${R.ax[i][1]}`));
 L.push(`set thr_mid = ${R.thrMid}`,`set thr_expo = ${R.thrExpo}`,`set throttle_limit_type = SCALE`,`set throttle_limit_percent = ${R.thrLimit}`);
 // stick deadband: Betaflight's deadband / yaw_deadband are RC units (0-32 / 0-100 of 500 per half stick), global in Betaflight too
 L.push(`set deadband = ${Math.min(32,Math.round(dzOf(0)*500))}`,`set yaw_deadband = ${Math.min(100,Math.round(dzOf(1)*500))}`);if(assist())L.push(`# Drone League assist ${assist().toFixed(2)} (no Betaflight equivalent)`);return L.join('\n')}
export function tab(r){$('paner').hidden=!r;$('panep').hidden=r;$('tabr').classList.toggle('on',r);$('tabp').classList.toggle('on',!r);$('tabr').setAttribute('aria-selected',r);$('tabp').setAttribute('aria-selected',!r)}
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
// wires the Rates tab inputs, CLI import/export and the tab buttons (v15 ran this at load)
export function initRates(){
$('rbody').innerHTML=AXN.map((n,i)=>`<tr><th style="color:${AXC[i]}">${n}</th>${[0,1,2].map(j=>`<td><input type="number" id="ri${i}${j}" aria-label="${n} value ${j+1}"></td>`).join('')}<td class="mx" id="rm${i}"></td></tr>`).join('');
for(let i=0;i<3;i++)for(let j=0;j<3;j++)$('ri'+i+j).onchange=e=>{const R=RT(),[k,mn,mx]=RTYPES[R.type].f[j];R.ax[i][j]=Math.round(cl(+e.target.value||0,mn,mx)/k);save();syncRates()};
$('tmid').onchange=e=>{RT().thrMid=Math.round(cl(+e.target.value||0,0,1)*100);save();syncRates()};
$('texpo').onchange=e=>{RT().thrExpo=Math.round(cl(+e.target.value||0,0,1)*100);save();syncRates()};
$('tlim').onchange=e=>{RT().thrLimit=Math.round(cl(+e.target.value||100,25,100));save();syncRates()};
$('rpi').onchange=e=>{S.rpi=+e.target.value;save();syncRates();rMsg('Using rate profile '+(S.rpi+1))};
$('rtype').onchange=e=>{const R=RT(),t=e.target.value;R.type=t;R.ax=[0,1,2].map(()=>[...RTYPES[t].d]);save();syncRates();rMsg(t+' rates loaded with their defaults')};
$('rreset').onclick=()=>{S.rprof[S.rpi]=defRates(RT().type);save();syncRates();rMsg('Profile reset')};
$('cexp').onclick=()=>{const t=cliText();$('cli').value=t;try{navigator.clipboard.writeText(t).then(()=>rMsg('Copied. Paste into the Betaflight CLI, then type save.'),()=>{$('cli').select();rMsg('Select and copy the text above')})}catch(e){$('cli').select();rMsg('Select and copy the text above')}};
$('cimp').onclick=()=>{const v={};for(const m of $('cli').value.matchAll(/^\s*set\s+(\w+)\s*=\s*(\S+)/gim))v[m[1].toLowerCase()]=m[2];
 const R=RT(),num=(...ks)=>{for(const k of ks)if(k in v&&Number.isFinite(+v[k]))return cl(Math.round(+v[k]),0,255)};let n=0;
 const ty=String(v.rates_type||'').toUpperCase();if(RTYPES[ty]){R.type=ty;n++}
 ['roll','pitch','yaw'].forEach((a,i)=>{const vals=[num(a+'_rc_rate',i<2?'rc_rate':'rc_rate_yaw'),num(a+'_srate'),num(a+'_expo',i<2?'rc_expo':'rc_expo_yaw')];vals.forEach((x,j)=>{if(x!=null){R.ax[i][j]=x;n++}})});
 const tm=num('thr_mid'),te=num('thr_expo'),tl=num('throttle_limit_percent');if(tm!=null){R.thrMid=Math.min(100,tm);n++}if(te!=null){R.thrExpo=Math.min(100,te);n++}if(tl!=null){R.thrLimit=cl(tl,25,100);n++}
 const db=num('deadband'),ydb=num('yaw_deadband');if(db!=null){S.dz=Math.min(.15,db/500);n++}if(ydb!=null){S.dzy=Math.min(.2,ydb/500);n++}
 save();syncRates();rMsg(n?`Imported ${n} values into profile ${S.rpi+1}`:'No Betaflight rate settings found in that text.')};
$('tabr').onclick=()=>tab(true);$('tabp').onclick=()=>tab(false);$('ratesbtn').onclick=()=>{$('mod').hidden=false;tab(true)};}
