// Zombies battery: a bigger pack than the tuned one (zswdata BAT.k x the mod panel's Battery, 16,000 mAh by default), Better battery doubles
// it, and the top bar shows what is left: charge, flight time at full throttle (with the swarm's draw) and the range that gives at
// cruise (or at your recent average speed when that is faster, e.g. under Rocket Assist). The pack itself is still Riley's model in interceptor.js; zperk.js sets its capacity (api.BCAP).
import {BAT,SW} from './zswdata.js';
export function initBatt(api,G,Z){
 const $=id=>document.getElementById(id),el=document.createElement('span');el.id='zbat';el.innerHTML='<b><i id="zbati"></i></b><em id="zbatt"></em>';
 document.querySelector('#zhud .zt')?.append(el);
 const st=document.createElement('style');st.textContent='#zhud #zbat{gap:8px;font-size:15px}#zbat b{display:block;width:46px;height:12px;border:1px solid rgba(255,255,255,.55);border-radius:2px;position:relative}'+
  '#zbat b:after{content:"";position:absolute;right:-4px;top:3px;width:3px;height:5px;background:rgba(255,255,255,.55)}#zbat i{display:block;height:100%;background:#3ddc84}#zbat i.mid{background:#ffc640}#zbat i.lo{background:#ff4d4d}#zbat.lo em{color:#ff8080}';
 document.head.append(st);
 const B={spd:0,last:'',t:0};
 // capacity factor for zperk.js apply(): the Zombies pack, doubled by Better battery
 Z.batK=()=>BAT.k*(Z.perkLevel?.('battery')?BAT.perk:1);
 // flight time and range left flat out (full throttle plus the swarm's draw): the figure you can count on, whatever you are doing right now
 function hud(dt){const me=api.player,cap=api.BCAP;if(!me||!cap||G.state==='base'||G.state==='over'||me.dead>0){el.hidden=true;return}el.hidden=false;
  B.spd+=(me.v.length()-B.spd)*Math.min(1,dt/6);if((B.t-=dt)>0)return;B.t=.25;
  const dr=Z.craft?.of(me).draw,left=Math.max(0,cap-me.mah),f=left/cap,sec=left*3.6/((dr?dr.full:BAT.full)+(Z.sw?.draw?.()||0)),km=sec*Math.max(dr?dr.cruise:BAT.cruise,B.spd)/1000;  /* dr: another craft type's draw (ztypes.js) */
  const mm=Math.floor(sec/60),ss=Math.floor(sec%60),txt=`${Math.round(f*100)}% · ${mm}:${String(ss).padStart(2,'0')} · ${km<10?km.toFixed(1):Math.round(km)} km`;
  if(txt!==B.last){B.last=txt;$('zbatt').textContent=txt;const i=$('zbati');i.style.width=(f*100).toFixed(1)+'%';i.className=f<.15?'lo':f<.35?'mid':'';el.className=f<.15?'lo':''}}
 const h0=Z.hud;Z.hud=dt=>{h0(dt);hud(dt||1/60)};
 Z.bat={B,get cap(){return api.BCAP},amp:SW.amp};
 return Z.bat}
