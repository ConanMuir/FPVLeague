// Zombies early warning. A fast track (zdata FAST: ballistic, hypersonic, ICBM) is picked up a set time before impact (zdata EWARN: a base,
// plus the Long-range radar perk, plus the early-warning radar bought in the Kill chain tab); a boost battery in its launch sector sees it at
// launch (zchain.js). Until it is picked up it is off the radar and no dome can engage it. Then a launch alert goes up:
//   LAUNCH DETECTED — HYPERSONIC — FUEL DEPOT — 45 s, with its kill chain status underneath (zchain.js),
// and any pilot can act on it mid-flight (keys 1-3, gamepad RB to pick and R3 to do it, or a click on the panel), zdata WACT:
//   1 Harden the target site: it takes 60% less damage from every hit until that track is gone. Costs money; then a cooldown.
//   2 Evacuate it: half damage for the rest of the wave, but its share of the wave-clear bonus is lost this wave and the next.
//   3 Decoy: one from the stock; a chance the warhead turns for a dummy site and comes down in a field.
// The actions apply to the selected track if it is a fast one with an alert, else to the most urgent alert. Co-op: a client's action is a
// request ('W') that the host checks against its own state and applies (znet.js); the result reaches everyone through the team feed.
import {KIND,FAST,EWARN,WACT} from './zdata.js';
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initWarn(api,G,Z){
 const {THREE,TH,SITES,gh}=api,V3=THREE.Vector3,$=id=>document.getElementById(id);
 const isFast=t=>FAST.includes(t.k);
 const tti=t=>t.p.distanceTo(t.aim)/Math.max(1,t.spd);
 const say=h=>Z.online&&Z.team?Z.team(h):api.feed(h);
 // seconds of warning before impact
 // (a campaign sector with the 'blind' modifier, zcampaign.js: radar -30%, so 30% less warning)
 const warnS=Z.warnS=()=>Math.round((EWARN.base+EWARN.perk*(Z.perkLevel?.('radar')|0)+EWARN.lv.slice(0,G.kc?.ewr|0).reduce((a,l)=>a+l.s,0))*(Z.cp?.has?.('blind')?.7:1));
 // the fast kinds are on the radar (and engageable) only once detected; on a co-op client the host's flag counts
 const se0=Z.seen;Z.seen=t=>isFast(t)?!!t.kc?.det:se0(t);
 const alerts=()=>TH.filter(t=>isFast(t)&&TH.includes(t)&&(t.st==='cruise'||t.st==='dive')&&t.kc?.det).sort((a,b)=>tti(a)-tti(b));
 // the track the actions apply to: the selected one if it is a fast track with an alert up, else the most urgent alert
 const focusT=()=>{const s=api.selT?.(),L=alerts();return s&&L.includes(s)?s:L[0]||null};
 // detection (host / solo): when it gets inside the warning time, or at launch if a boost battery covers its sector
 let annT=0,annN=0;
 function detect(){const W=warnS();for(const t of TH){if(!isFast(t)||!t.kc||t.kc.det||!api.live(t))continue;if(!t.kc.cue&&tti(t)>W)continue;t.kc.det=1;annN++;
   const s=Math.ceil(tti(t)),K=KIND[t.k];say(`<span class="cr">LAUNCH DETECTED — ${K.tag} — ${t.tgt.n} — ${s} s</span>${t.kc.cue?' (boost battery saw it launch)':''}`);t.kc.at=performance.now()}
  const now=performance.now();if(annN&&now-annT>2500){annT=now;const t=alerts()[0];if(t&&Z.an){Z.an.say(annN>1?`${annN} LAUNCHES DETECTED`:'LAUNCH DETECTED',`${KIND[t.k].tag} → ${t.tgt.n} · ${Math.ceil(tti(t))} s`,'#ff4d4d',2);Z.an.radio?.('EARLY WARNING',`Launch detected, ${KIND[t.k].n.toLowerCase()}, ${t.tgt.n.toLowerCase()}, ${Math.ceil(tti(t))} seconds.`,2)}
   if(Z.au?.alarm)Z.au.alarm();else api.tone(880,660,.25,.1,'square');annN=0}}

 // ---------- the actions ----------
 const hardOn=s=>!!G.kc.hard[s.n],evacOn=s=>G.kc.evac[s.n]===G.wave;
 // why an action can't be taken right now (null = it can)
 function why(a,t){if(G.state!=='wave')return'between waves';if(!t||!api.live(t))return'no alert';const s=t.tgt;if(!s||s.hp<=0)return'site gone';
  if(a==='harden'){if(hardOn(s))return'hardened';if(G.kc.hcd>0)return Math.ceil(G.kc.hcd)+' s';if(G.cash<WACT.harden.cost(G.wave))return'purse short';return null}
  if(a==='evac')return evacOn(s)?'evacuated':null;
  if(a==='decoy'){if(t.kc?.dc||t.dcy)return'decoy used';if(!(G.kc.decoys>0))return'none left';if(tti(t)<WACT.decoy.minT)return'too late';return null}
  return'?'}
 // apply an action (solo, or the host for any pilot: nm = their name in co-op); id = the track it is for
 function act(a,id,nm){const t=TH.find(u=>u.id===id);if(why(a,t))return null;const s=t.tgt,K=G.kc,who=nm?`<b>${nm}</b>: `:'';
  if(a==='harden'){const c=WACT.harden.cost(G.wave);G.cash-=c;Z.tally?.('warn',c);K.hard[s.n]={id:t.id,g:2};K.hcd=WACT.harden.cd;K.st.harden++;say(`${who}<span class="cb">${s.n} hardened against ${Z.tname(t)}: ${Math.round((1-WACT.harden.k)*100)}% less damage until it lands</span> (−${money(c)})`)}
  else if(a==='evac'){K.evac[s.n]=G.wave;K.st.evac++;say(`${who}<span class="co">${s.n} evacuated: half damage this wave, no income from it this wave and the next</span>`)}
  else if(a==='decoy'){K.decoys--;t.kc.dc=1;K.st.decoy++;if(Math.random()<(WACT.decoy.p[t.k]||0)){K.st.decoyK++;t.dcy=1;const b=Math.random()*6.28,r=700+Math.random()*350;t.aim=new V3(s.x+Math.cos(b)*r,0,s.z+Math.sin(b)*r);t.aim.y=gh(t.aim.x,t.aim.z);t.wps.length=0;if(t.claim){const h=t.claim;if(h.tgt===t)h.tgt=null;t.claim=null}
    say(`${who}<span class="cg">Decoy site: ${Z.tname(t)} turned for the dummy, away from the ${s.n.toLowerCase()}</span>`)}else say(`${who}<span class="co">Decoy site: ${Z.tname(t)} ignored it</span>`)}
  return a}
 // a pilot's key / button / pad press: solo applies it, a co-op client asks the host (znet.js 'W')
 function use(a){const t=focusT(),w=why(a,t);if(w){api.banner(`${a==='evac'?'EVACUATE':a.toUpperCase()}: ${w.toUpperCase()}`,'co',.9);return false}
  if(Z.req){Z.req(['W',a,t.id]);api.tone(700,900,.15,.08,'triangle');return true}return!!act(a,t.id)}
 // co-op host: Z.warn.act(a, id, name)
 Z.warn={act,use,why,alerts,focusT,detect};

 // ---------- damage and income hooks (zombies.js) ----------
 Z.dmgK=s=>(hardOn(s)?WACT.harden.k:1)*(evacOn(s)?WACT.evac.k:1);
 Z.incomeK=()=>{const n=SITES.length||1,w=G.wave;let lost=0;for(const s of SITES)if(G.kc.evac[s.n]===w||G.kc.evac[s.n]===w-1)lost++;if(lost)api.feed(`<span class="co">Evacuated sites earned nothing: wave bonus −${Math.round(100*lost/n)}%</span>`);return 1-lost/n};

 // ---------- per step (host / solo): detection, harden windows, cooldown ----------
 function step(dt){if(!G.on||api.demo||G.state!=='wave'&&G.state!=='clear')return;const K=G.kc;if(K.hcd>0)K.hcd=Math.max(0,K.hcd-dt);if(Z.mirror)return;detect();
  for(const n in K.hard){const h=K.hard[n],t=TH.find(u=>u.id===h.id);if(t&&(t.st==='cruise'||t.st==='dive'))continue;if((h.g-=dt)<=0)delete K.hard[n]}}
 const s0=Z.step;Z.step=dt=>{s0(dt);step(dt)};

 // ---------- the alert panel (right of the screen, above the radar) ----------
 const el=document.createElement('div');el.id='zalert';el.className='osd';$('hud').append(el);let last='',sel=0;
 const ACTS=[['harden','1','HARDEN'],['evac','2','EVACUATE'],['decoy','3','DECOY']];
 el.addEventListener('click',e=>{const b=e.target.closest?.('[data-w]');if(b){use(b.dataset.w);b.blur()}});
 Z.warnHud=()=>{if(!G.on||G.state!=='wave'&&G.state!=='clear'){if(last){el.innerHTML=last='';}return}const L=alerts(),f=focusT();
  if(!L.length){if(last)el.innerHTML=last='';return}
  let h=L.slice(0,3).map(t=>`<div class="za${t===f?' on':''}"><b>LAUNCH DETECTED — ${KIND[t.k].tag} — ${t.tgt.n} — ${Math.ceil(tti(t))} s</b>${t.dcy?'<em class="cg">DECOYED</em>':''}${hardOn(t.tgt)?'<em class="cb">HARDENED</em>':''}${evacOn(t.tgt)?'<em class="co">EVACUATED</em>':''}<span class="zch">${Z.chainLine?Z.chainLine(t):''}</span></div>`).join('');
  if(L.length>3)h+=`<div class="zmore">+${L.length-3} more inbound</div>`;
  h+=`<div class="zact">${ACTS.map(([a,k,n],i)=>{const w=why(a,f),txt=a==='harden'?`${n} ${money(WACT.harden.cost(G.wave))}`:a==='decoy'?`${n} ×${G.kc.decoys|0}`:n;
   return`<button class="sm${i===sel?' pick':''}" data-w="${a}" ${w?'disabled':''}><kbd>${k}</kbd>${txt}${w?` <small>${w}</small>`:''}</button>`}).join('')}</div>`;
  if(h!==last)el.innerHTML=last=h};
 const h0=Z.hud;Z.hud=dt=>{h0(dt);Z.warnHud()};
 // keys 1-3 in flight (the base screen keeps them for its tabs); gamepad RB picks an action, R3 does it
 const KEYS={Digit1:'harden',Digit2:'evac',Digit3:'decoy',Numpad1:'harden',Numpad2:'evac',Numpad3:'decoy'};
 const k0=Z.key;Z.key=e=>{if(Z.base.el.hidden&&G.state==='wave'&&KEYS[e.code]){use(KEYS[e.code]);return true}return k0(e)};
 const p0=Z.pad;Z.pad=e=>{if(Z.base.el.hidden&&G.state==='wave'&&alerts().length){if(e(5)){sel=(sel+1)%ACTS.length;last='';return true}if(e(11)){use(ACTS[sel][0]);return true}}return p0(e)};
 return Z.warn}
