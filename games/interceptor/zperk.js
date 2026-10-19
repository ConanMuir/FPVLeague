// Zombies player perks. Active (charges refill every wave): Freeze (Q / D-pad left), Mark (E / D-pad right), Airstrike (X / D-pad up).
// Passive: long-range radar, optics (thermal through cloud, decoy IFF, target and impact time on track boxes), fast relaunch, bigger warhead, better battery, Foreign Aid.
import {KIND,PERK,ITEMS} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v;
export function initPerks(api,G,Z){
 const {THREE,TH,S}=api,V3=THREE.Vector3,_a=new V3(),$=id=>document.getElementById(id);
 const lv=k=>G.perks?.[k]|0;
 const FREEZE=[null,{n:1,s:6,k:1},{n:2,s:8,k:1},{n:2,s:8,k:2}],MARK=[null,{n:1,s:15},{n:2,s:18},{n:3,s:20}],AIR=[null,{n:1},{n:2}];
 const BLURB={
  freeze:['Q / D-pad left: slows the most dangerous track by 50% for 6 s. 1 charge per wave.','2 charges per wave, 8 s each.','Each use freezes the two most dangerous tracks.'],
  mark:['E / D-pad right: marks your selected track for 15 s. Helper hits on it count double: two kill rolls, near misses kill, armor is ignored, and helpers go for it first. 1 charge per wave.','2 charges per wave, 18 s each.','3 charges per wave, 20 s each.'],
  air:['X / D-pad up: strike jets hit the densest cluster of tracks; everything within 260 m goes down (a boss loses a stage). 1 charge per wave.','2 charges per wave.'],
  radar:['Radar detection range ×1.3: tracks show up earlier.','Detection ×1.6.','Detection ×2.'],
  optics:['Thermal sees through cloud and fog.','IFF: decoys are flagged at any range.','Track boxes show each track\'s target site and time to impact.'],
  relaunch:['Next interceptor on the mat in 1.5 s.','Next interceptor in 0.9 s.'],
  warhead:['Warhead kill radius +1 m (the fuse window grows with it).','+2 m.','+3 m.'],
  battery:['Pack +25% capacity and 25% less voltage sag.','+50% capacity, half the sag.'],
  aid:['Foreign Aid: site repairs cost 30% less.'],
  fuse:['Your warhead fires by itself at the closest approach inside 6 m, like Classic. Without it you time the burst yourself (F, click or the detonate button).'],
  rocket:['Every interceptor gets a 15 s rocket burst when it lifts off the mat: roughly double the speed, same handling. HUD bar shows the burn left.']};
 Z.perkLevel=lv;Z.perkMaxed=k=>lv(k)>=PERK[k].cost.length;Z.perkPrice=k=>PERK[k].cost[lv(k)]??0;Z.perkBlurb=k=>BLURB[k][Math.min(lv(k),BLURB[k].length-1)];
 Z.buyPerk=k=>{G.perks[k]=lv(k)+1;if(['freeze','mark','air'].includes(k))G.ch[k]=(G.ch[k]|0)+1;apply()};
 Z.radarK=()=>[1,1.3,1.6,2][lv('radar')];Z.repairK=()=>lv('aid')?.7:1;Z.ident=()=>lv('optics')>=2;Z.eta=()=>lv('optics')>=3;
 // passive effects on Riley's interceptor (restored by applyTune when Zombies stops)
 function apply(){const T=S.mod;api.LETH=T.leth+lv('warhead');api.RELT=T.relt*[1,.6,.36][lv('relaunch')];api.BCAP=T.bcap*(1+.25*lv('battery'));api.SAGK=1-.25*lv('battery')}
 function reset(){G.perks={};G.ch={};apply()}
 function refill(){G.ch={freeze:FREEZE[lv('freeze')]?.n|0,mark:MARK[lv('mark')]?.n|0,air:AIR[lv('air')]?.n|0};G.strike=null}
 Z.perkRows=money=>Object.keys(PERK).filter(k=>lv(k)).map(k=>{const m=Z.perkMaxed(k),c=Z.perkPrice(k);
  return`<div class="zarm"><span class="zg">${ITEMS[k].glyph}</span><div><b>${ITEMS[k].n}</b><small>level ${lv(k)}${PERK[k].key?` · key ${PERK[k].key}`:''}</small></div><div class="zups"><span class="zst zn">${m?'Max level':'Next: '+Z.perkBlurb(k)}</span>${m?'':`<button class="sm" data-perk="${k}" ${G.cash>=c?'':'disabled'}>Upgrade ${money(c)}</button>`}</div></div>`}).join('');

 // ---------- actives ----------
 const danger=t=>(KIND[t.k]?.dmg||1)/Math.max(1,Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/Math.max(1,t.spd));
 function use(k){if(G.state!=='wave'||!(G.ch[k]>0))return false;const me=api.player;
  if(k==='freeze'){const F=FREEZE[lv('freeze')],L=TH.filter(t=>api.live(t)&&!t.frz).sort((a,b)=>danger(b)-danger(a)).slice(0,F.k);if(!L.length)return false;
   for(const t of L){t.frz=F.s;t.spd*=.5;t.cs*=.5;Z.pop(t.p,'FROZEN','#9fe8ff')}api.feed(`<span class="cb">Freeze: ${L.map(Z.tname).join(', ')} slowed for ${F.s} s</span>`);api.tone(1200,600,.4,.08,'triangle')}
  if(k==='mark'){const M=MARK[lv('mark')],s=api.selT(),t=s&&api.live(s)?s:TH.filter(api.live).sort((a,b)=>danger(b)-danger(a))[0];if(!t)return false;t.mark=M.s;Z.pop(t.p,'MARKED','#ff6bd6');api.feed(`<span style="color:#ff6bd6">Marked ${Z.tname(t)} for ${M.s} s: helper hits count double</span>`);api.tone(500,900,.25,.08,'square')}
  if(k==='air'){const L=TH.filter(t=>api.live(t)&&KIND[t.k]?.armor!=='hard');if(!L.length)return false;let best=L[0],bn=0;
   for(const t of L){let n=0;for(const u of L)if(u.p.distanceToSquared(t.p)<260*260)n++;if(n>bn){bn=n;best=t}}
   const C=new V3(),Cv=new V3();let cn=0;for(const u of L)if(u.p.distanceToSquared(best.p)<260*260){C.add(u.p);Cv.add(u.v);cn++}  // centre on the cluster, not on one member
   G.strike={p:C.divideScalar(cn),v:Cv.divideScalar(cn),t:1.6,n:0};api.feed(`<span class="cg">Airstrike inbound on ${bn} track${bn>1?'s':''}</span>`);api.banner('AIRSTRIKE','cg',1.2)}
  G.ch[k]--;return true}
 function step(dt){for(const t of TH){if(t.frz>0&&(t.frz-=dt)<=0){t.frz=0;t.spd*=2;t.cs*=2}if(t.mark>0&&(t.mark-=dt)<=0)t.mark=0}
  const s=G.strike;if(s){s.p.addScaledVector(s.v,dt);if((s.t-=dt)<=0&&s.n<6){s.t=.12;const p=_a.copy(s.p).addScaledVector(s.v,(s.n-2.5)*.6);api.boom(p,3);s.n++;
    if(s.n===3)for(const t of TH)if(api.live(t)&&KIND[t.k]?.armor!=='hard'&&t.p.distanceTo(s.p)<260){t.by='p';if(t.k==='boss')Z.bossHit(t);else api.killThreat(t,Math.random()<.5)}}
   if(s.n>=6)G.strike=null}
  // optics 1: the thermal camera sees through the cloud deck and most of the fog
  if(lv('optics')>=1&&api.thermLook&&api.WX){api.deck.visible=false;api.scene.fog.near=api.WX.fog[0]*4;api.scene.fog.far=Math.max(api.WX.fog[1]*4,9000)}}
 const KEYS={KeyQ:'freeze',KeyE:'mark',KeyX:'air'},PADS={14:'freeze',15:'mark',12:'air'};
 function key(e){const k=KEYS[e.code];if(!k)return false;use(k);return true}
 function pad(e){for(const b in PADS)if(e(+b)){use(PADS[b]);return true}return false}

 // ---------- HUD: perk bar, lead cross, frozen / marked tags ----------
 const bar=document.createElement('div');bar.id='zpk';bar.className='osd';$('hud').append(bar);let last='';
 function hud(){const h=[['freeze','Q'],['mark','E'],['air','X']].filter(([k])=>lv(k)).map(([k,key])=>`<span class="${G.ch[k]>0?'':'off'}"><kbd>${key}</kbd>${ITEMS[k].n.toUpperCase()} ${G.ch[k]|0}</span>`).join('');if(h!==last)bar.innerHTML=last=h}
 function overlay(oc,W,H){const cam=api.camera,sel=api.selT(),me=api.player;
  for(const t of TH){if(!api.live(t)||!(t.frz>0||t.mark>0))continue;_a.copy(t.p).project(cam);if(_a.z>1||Math.abs(_a.x)>1||Math.abs(_a.y)>1)continue;const X=(_a.x*.5+.5)*W,Y=(-_a.y*.5+.5)*H;
   if(t.mark>0){oc.strokeStyle='#ff6bd6';oc.lineWidth=2;oc.beginPath();oc.moveTo(X,Y-30);oc.lineTo(X+30,Y);oc.lineTo(X,Y+30);oc.lineTo(X-30,Y);oc.closePath();oc.stroke()}
   if(t.frz>0){oc.fillStyle='#9fe8ff';oc.fillText('❄ '+Math.ceil(t.frz),X,Y-36)}}}
 return{reset,refill,step,key,pad,hud,overlay,apply,use}}
