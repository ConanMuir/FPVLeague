// Zombies battery: a bigger pack than Classic (zswdata BAT.k x the tuned capacity; Classic keeps Riley's 16,000 mAh), Better battery doubles
// it, and the top bar shows what is left as charge, flight time at your recent average draw and range at your recent average speed (or at
// full-throttle cruise while you hover). The pack itself is still Riley's model in interceptor.js; zperk.js sets its capacity (api.BCAP).
import {BAT,SW} from './zswdata.js';
export function initBatt(api,G,Z){
 const $=id=>document.getElementById(id),el=document.createElement('span');el.id='zbat';el.innerHTML='<b><i id="zbati"></i></b><em id="zbatt"></em>';
 document.querySelector('#zhud .zt')?.append(el);
 const st=document.createElement('style');st.textContent='#zhud #zbat{gap:8px;font-size:15px}#zbat b{display:block;width:46px;height:12px;border:1px solid rgba(255,255,255,.55);border-radius:2px;position:relative}'+
  '#zbat b:after{content:"";position:absolute;right:-4px;top:3px;width:3px;height:5px;background:rgba(255,255,255,.55)}#zbat i{display:block;height:100%;background:#3ddc84}#zbat i.mid{background:#ffc640}#zbat i.lo{background:#ff4d4d}#zbat.lo em{color:#ff8080}';
 document.head.append(st);
 const B={amp:40,spd:0,last:'',t:0};
 // capacity factor for zperk.js apply(): the Zombies pack, doubled by Better battery
 Z.batK=()=>BAT.k*(Z.perkLevel?.('battery')?BAT.perk:1);
 // what the swarm draws (zswarm.js adds it to the pack); averaged with the motors over ~6 s for the estimate
 function hud(dt){const me=api.player,cap=api.BCAP;if(!me||!cap||G.state==='base'||G.state==='over'||me.dead>0){el.hidden=true;return}el.hidden=false;
  const a=(me.amp||0)+(Z.sw?.draw?.()||0),k=Math.min(1,dt/6);B.amp+=(a-B.amp)*k;B.spd+=(me.v.length()-B.spd)*k;
  if((B.t-=dt)>0)return;B.t=.25;const left=Math.max(0,cap-me.mah),f=left/cap,sec=left*3.6/Math.max(8,B.amp),fly=B.spd>25,km=sec*(fly?B.spd:BAT.cruise*Math.max(8,B.amp)/226)/1000;
  const mm=Math.floor(sec/60),ss=Math.floor(sec%60),txt=`${Math.round(f*100)}% · ${mm}:${String(ss).padStart(2,'0')} · ${km<10?km.toFixed(1):Math.round(km)} km${fly?'':' cruise'}`;
  if(txt!==B.last){B.last=txt;$('zbatt').textContent=txt;const i=$('zbati');i.style.width=(f*100).toFixed(1)+'%';i.className=f<.15?'lo':f<.35?'mid':'';el.className=f<.15?'lo':''}}
 const h0=Z.hud;Z.hud=dt=>{h0(dt);hud(dt||1/60)};
 Z.bat={B,get cap(){return api.BCAP},amp:SW.amp};
 return Z.bat}
