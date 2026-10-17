// ---------- controller calibration: guided per-channel setup (axis, centre, signed range; buttons/triggers too) ----------
import {tone} from '../audio/audio.js';
import {$} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {BTN,PAIR,padX} from './input.js';
import {feed} from '../ui/hud.js';
import {syncUI} from '../ui/menu.js';
export let calib=null;
export function initCalib(){$('calbtn').onclick=()=>{calib=calib?null:{i:-1,base:null,t:0,used:[],res:[],cand:-1,e:0,back:false};$('calbtn').textContent=calib?'Cancel':'Calibrate controller';if(!calib)$('calmsg').textContent=''}}
export function calTick(g){if(!calib)return;const m=$('calmsg'),now=performance.now();if(!g){m.textContent='Connect the radio or controller and move a stick.';return}const ax=[...g.axes];g.buttons.forEach((b,j)=>ax[100+j]=b.value);
 if(calib.i<0){if(!calib.base||ax.some((v,j)=>Math.abs(v-calib.base[j])>(padX?.12:.04))){calib.base=ax;calib.t=now}else if(now-calib.t>1200)calib.i=0;
  m.textContent='Centre yaw, pitch and roll. Throttle fully DOWN. Hold still…';return}
 if(calib.back){m.textContent='Got it. Let the stick go back (throttle back down).';
  if(ax.every((v,j)=>Math.abs(v-calib.base[j])<.25)){calib.back=false;if(calib.i>3){if(padX){S.xcal=calib.res;const u=calib.res.flatMap(c=>[c.a,c.b==null?-1:100+c.b]);if(typeof S.xfire==='number'&&u.includes(100+S.xfire)){S.xfire=u.includes(100)?(u.includes(107)?2:7):0;feed('Fire moved to '+BTN[S.xfire])}}else{S.cal=calib.res;S.thrMode='full'}save();syncUI();calib=null;$('calbtn').textContent='Calibrate controller';m.textContent='Calibrated. Check the THR/YAW/PIT/ROL bars.'}}return}
 m.textContent=`Step ${calib.i+1} of 4: move ${['THROTTLE fully UP','YAW fully RIGHT','PITCH fully FORWARD','ROLL fully RIGHT'][calib.i]} and hold${padX?' (stick, trigger or bumper)':''}`;
 let best=-1,bd=0;ax.forEach((v,j)=>{if(calib.used.includes(j))return;const d=Math.abs(v-calib.base[j]);if(d>bd){bd=d;best=j}});
 if(bd<.5){calib.cand=-1;return}
 if(calib.cand!==best){calib.cand=best;calib.t=now;calib.e=ax[best]}
 if(Math.abs(ax[best]-calib.base[best])>Math.abs(calib.e-calib.base[best]))calib.e=ax[best];
 if(now-calib.t>450){const b=calib.base[best],e=calib.e;const pr=best>=100?PAIR[best-100]:null;calib.res[calib.i]=calib.i?(best>=100?{a:best,c:0,s:1,...(pr!=null?{b:pr}:{})}:{a:best,c:b,s:e-b}):padX&&best<100&&Math.abs(b)<.5?{a:best,c:b,s:e-b,m:'spring'}:{a:best,c:(b+e)/2,s:(e-b)/2};calib.used.push(best);if(calib.i&&pr!=null)calib.used.push(100+pr);calib.i++;calib.back=true;tone(880,880,.08,.08)}}
