// beginner sensitivity walkthrough: three plain questions, written into the current rate profile as Actual rates (center sens / max rate / expo)
import {$} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {RT,rate} from '../flight/rates.js';
import {axv,keys,pad} from '../input/input.js';
import {AXN,deg,syncRates} from './rates.js';
export function initSens(){{const W={max:670,feel:1,yaw:1},FEEL=[[120,55,'Smooth','Gentle around centre, easy to hold steady. Good for learning.'],[180,35,'Balanced','The usual freestyle feel.'],[260,15,'Twitchy','Small moves react fast. For racers.']],
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
