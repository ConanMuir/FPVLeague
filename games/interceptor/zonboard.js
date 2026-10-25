/* Zombies first-wave onboarding: a one-time guide for a pilot who has never played. The very first Quick defence (or campaign sector) on this
   browser makes wave 1 a guided wave: OVERLORD on the radio (zradio.js) and a small prompt card teach, in order and only when each is relevant,
   flying and the camera, locking a track, the pip, the burst and the proximity fuse, the first helper (base screen), sorties, then Rocket Assist
   when it opens and the swarm commands when a swarm is up. A prompt waits for the action it teaches and times out if the action never comes; it
   never pauses or blocks play. "Skip guide" (on the card, and in the pause menu) ends it at once. Wave 1 is a little gentler (at most 3 tracks,
   the first one later and the rest spread out, all flying at 3/4 speed): the same wave, with time to read. Nothing after wave 1 changes.
   Once it has started (not only once it has finished) S.zonb is set in the save, so it never shows again on this browser: not after a reload,
   in a new run or a campaign sector, not after a settings reset (the save keeps it); a wiped save takes the flag with it. The Bot Spectator
   and benches, co-op (host and clients) and automated browsers (navigator.webdriver: the test harnesses) never get it. ?guide=1 lets a harness
   run it (it still respects S.zonb), ?guide=0 turns it off. There is no replay for players.
   Harness: Z.onboard (tools/zombies-test.mjs, "onboard"). */
import {pad} from '../../engine/input.js';
import {SO} from './zsites.js';
import {kl,fireWith} from './zkeys.js';
export const GN={max:3,lead:3,space:1.9,slow:.75};  /* the guided wave: at most 3 tracks, the first after 3 s and the rest spread 1.9x wider, flying at 3/4 speed */
const FLY=60,NEAR=160,SEE=1800,POLL=.1,GAP=.5,OKT=1.1,OPENS=3;  /* metres flown to count as flying; metres from its locked track the pip has done its job; metres from a track that ends the look-around; seconds between checks, between two prompts, a done prompt stays; times a dropped prompt may come back */
const k=s=>`<kbd>${s}</kbd>`,gp=()=>{try{return!!pad()}catch(e){return false}};

export function initOnboard(api,G,Z){
 const {TH,S}=api,$=id=>document.getElementById(id);
 {const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./zonboard.css',import.meta.url).href;document.head.append(l)}
 const Q=new URLSearchParams(location.search).get('guide'),auto=!!navigator.webdriver;  /* auto: a headless harness or bench, which only gets the guide when it asks (?guide=1) */
 const A={on:false,why:'',ended:'',cur:null,st:{},n:{},ev:{},log:[],acc:0,gap:0,gentle:false,p0:null,k0:0,lt:0,cam:[false,0],d0:0,sw0:null};
 let card=null,mo=null,last='';
 const me=()=>api.player,alive=()=>{const m=me();return!!m&&m.dead<=0},wave=()=>G.state==='wave',w1=()=>wave()&&G.wave===1&&alive(),base=()=>G.state==='base'&&!Z.base.el.hidden;
 const near=r=>{const m=me();if(!m)return false;for(const t of TH)if(api.live(t)&&t.p.distanceTo(m.p)<r)return true;return false},seen=()=>TH.some(t=>api.live(t)&&Z.seen(t));
 const rackAt=()=>G.cards.findIndex(c=>c.k==='rack'),cardAt=key=>G.cards.findIndex(c=>c.k===key),owned=()=>(Z.perkLevel?.('rocket')|0)>0;
 const shopBtn=key=>$('zbase').querySelector(`[data-buy="${cardAt(key)}"]`)||$('zbase').querySelector('[data-tab="shop"]');  /* the item's buy button, or the Shop tab while another tab is open */
 const swKey=()=>{const m=Z.sw?.mine;return m?[m.mode,m.form,m.sseq,m.tgt?m.tgt.id:0,m.ch].join():''};

 /* ---------- the steps, in the order they are taught: ready = relevant now, done = the action happened, ttl = seconds it waits ---------- */
 const STEPS=[
  {id:'brief',ttl:30,by:1,info:1,ready:()=>base()&&G.wave===0,done:()=>G.wave>=1,hl:()=>$('zgo'),ok:'',
   hud:()=>`Briefing. Money buys defenders and perks: fly wave 1 first and shop with what you earn, or spend it now. Press <b>Start wave 1</b> when you are ready; I will coach you in the air.`,
   say:'Welcome to the line, Dart One. Start the wave when you are ready and I will talk you through it.'},
  {id:'fly',ttl:25,flight:1,ready:()=>w1(),done:()=>!!A.ev.fly,ok:'Airborne.',
   hud:()=>Z.craft?.guide('fly',gp())||(gp()?`Raise the throttle to take off. Left stick throttle and yaw, right stick pitch and roll. Fly out toward the blips on the radar.`:`Press ${k('W')} to take off. ${k('W')}${k('S')} throttle (let go to hover), ${k('A')}${k('D')} yaw, ${k('↑')}${k('↓')}${k('←')}${k('→')} pitch and roll. Fly out toward the blips on the radar.`),
   say:'Dart One, you are cleared to launch. Get up and fly out toward the contacts.'},
  {id:'look',ttl:12,flight:1,ready:()=>w1()&&!near(SEE),done:()=>!!A.ev.look,ok:'Good view.',
   hud:()=>Z.craft?.guide('look',gp())||(gp()?`The camera switch sets 90° for cruising (level for hover). LB changes the view: FPV, chase, threat.`:`${k(kl('tiltSw'))} tilts the camera up to 90° for cruising (level for hover). ${k('C')} changes the view: FPV, chase, threat.`),
   say:'Tilt the camera up for the cruise. Change the view if you want a look around.'},
  {id:'lock',ttl:60,flight:1,ready:()=>w1()&&seen(),done:()=>!!A.ev.lock,ok:'Locked.',
   hud:()=>`Track inbound: the amber blip on the radar, bottom right. Fly at it and hold the dashed ring on it until it locks.`,
   say:'Contact. Put the dashed ring on the track and hold it there. That is a lock.'},
  {id:'pip',ttl:14,flight:1,ready:()=>w1()&&!!Z.lk?.t,done:()=>!!A.ev.burst||(!!Z.lk?.t&&me().p.distanceTo(Z.lk.t.p)<NEAR),ok:'On the pip.',
   hud:()=>`Locked. The cyan marker is the <b>pip</b>: where you meet the track if you fly straight at it, with the seconds to intercept. Fly at the pip, not at the drone.`,
   say:'Locked. Fly at the pip, the marker, not at the drone. That is where you meet it.'},
  {id:'burst',ttl:40,flight:1,ready:()=>w1()&&seen()&&(!!A.ev.lock||near(400)),done:()=>!!A.ev.burst,ok:'Burst away.',
   hud:()=>gp()?`Detonate with the fire button (RB) within a few metres of the track. The Proximity fuse perk (Shop) fires at closest approach for you.`:`Detonate with ${fireWith(k)} within a few metres of the track. The Proximity fuse perk (Shop) fires at closest approach for you.`,
   say:'Get close and burst. A few metres is a kill. The proximity fuse in the shop will do the timing for you.'},
  {id:'helper',ttl:75,by:3,ready:()=>base()&&G.wave>=1&&rackAt()>=0&&G.cash>=Z.itemPrice('rack')&&!A.ev.helper,done:()=>!!A.ev.helper,ok:'Helper bought.',
   hl:()=>G.placing?$('zbase').querySelector('[data-slot]'):shopBtn('rack'),
   hud:()=>G.placing?`Pick a free position for it, from the list or on the map. It deploys when the next wave starts.`:`Wave cleared. Spend it: in the <b>Shop</b>, buy an <b>Interceptor drone rack</b> for a free position. Helpers fight for you while you fly.`,
   say:'Good work. Spend the money: put a drone rack on the line.'},
  {id:'sortie',ttl:45,by:3,ready:()=>base()&&!!Z.xTab&&!!Z.so&&G.wave>=SO.from&&!Z.so.S.on&&Z.so.S.used!==G.wave,done:()=>!!A.ev.tab,ok:'Sortie tab open.',hl:()=>$('zbase').querySelector(`[data-tab="${Z.xTab?.id}"]`),
   hud:()=>`Sorties are open: the <b>Sortie</b> tab sends you past the line to bomb the convoys, launch sites and factories that feed the next waves. One a break. Take a look.`,
   say:'Between waves you can fly a sortie behind the enemy line. The Sortie tab has the details.'},
  {id:'rocket',ttl:60,by:()=>Z.itemFrom('rocket')+3,ready:()=>base()&&G.wave>=1&&!owned()&&Z.itemFrom('rocket')<=G.wave+1&&cardAt('rocket')>=0,done:()=>owned(),ok:'Rocket Assist bought.',hl:()=>shopBtn('rocket'),
   hud:()=>`<b>Rocket Assist</b> is open (Shop, Passive perks): every liftoff gets a 15 s rocket burst, about 3x top speed, same stick rates.`,
   say:'Rocket Assist is available. Every launch gets a fifteen second burn.'},
  {id:'rocketfly',ttl:9,by:()=>Z.itemFrom('rocket')+5,info:1,ready:()=>wave()&&alive()&&owned()&&(Z.rk?.st.t>0),done:()=>!!A.ev.burn&&!(Z.rk?.st.t>0),ok:'',
   hud:()=>`Rocket burn: the bar shows what is left. You steer as usual, just faster. It tails off at burn-out.`,
   say:'Rocket burn. Steer as normal, you are fast now.'},
  {id:'swarm',ttl:45,by:()=>Z.itemFrom('swarm')+8,ready:()=>wave()&&alive()&&(Z.sw?.drones.length|0)>0,done:()=>A.sw0!=null&&swKey()!==A.sw0,ok:'Command given.',on:()=>{A.sw0=swKey()},
   hud:()=>`Swarm commands: ${k(1)} attack your lock · ${k(2)} screen · ${k(3)} strike · ${k(4)} form up · ${k(5)} next formation (pad A / B / X / R3 / RB).`,
   say:'Swarm is up. One attacks your lock, two screens, three strikes, four forms up.'}];

 /* ---------- what the pilot has done, read from the game's state ---------- */
 function poll(){const m=me(),ev=A.ev;
  if(w1()){if(!A.p0){A.p0=m.p.clone();A.k0=G.kills.p;A.lt=m.t;A.cam=[api.camUp,api.camMode]}
   if(m.t<A.lt)A.cam=[api.camUp,api.camMode];A.lt=m.t;  /* a fresh interceptor puts the camera switch back */
   if(m.p.distanceTo(A.p0)>=FLY)ev.fly=1;if(api.camUp!==A.cam[0]||api.camMode!==A.cam[1])ev.look=1;if(G.kills.p>A.k0)ev.burst=1}
  if(wave()&&Z.lk?.t)ev.lock=1;
  if(Z.def.D.length>A.d0)ev.helper=1;
  if(Z.rk?.st.t>0)ev.burn=1;
  if(base()&&Z.xTab&&Z.base.el.querySelector('[data-tab].on')?.dataset.tab===Z.xTab.id||Z.so?.S.on||Z.so?.S.used===G.wave)ev.tab=1}

 /* ---------- the card ---------- */
 function mk(){const d=document.createElement('div');d.id='zob';d.setAttribute('role','status');d.setAttribute('aria-live','polite');d.hidden=true;
  d.innerHTML='<div class="h"><b>GUIDE</b><button type="button" id="zobskip">Skip guide</button></div><p class="t"></p>';d.querySelector('button').onclick=()=>end('skip');document.body.append(d);return d}
 const sk2=document.createElement('button');sk2.id='zobskip2';sk2.textContent='Skip guide';sk2.hidden=true;sk2.onclick=()=>end('skip');$('modbtn')?.before(sk2);
 function vis(){if(!card)return;const v=!!A.cur&&!api.menuOpen&&!Z.cine;if(card.hidden===v)card.hidden=!v}  /* the card steps aside for the pause menu and the kill cam */
 function paint(){const c=A.cur;if(!card||!c)return;const h=c.fin?`✓ ${c.step.ok}`:c.step.hud();if(h!==last){card.querySelector('.t').innerHTML=last=h}
  card.classList.toggle('ok',!!c.fin);vis()}
 /* the base screen redraws itself; the button a prompt points at gets its glow back after each redraw */
 /* the card is docked at the bottom of the base screen: a button scrolled to the bottom edge of its list sat under it, so the list scrolls a little further */
 function clear(e){const c=card&&!card.hidden&&card.getBoundingClientRect(),r=e.getBoundingClientRect(),t=e.closest('.ztab');if(c&&t&&!(r.right<=c.left||r.left>=c.right||r.bottom<=c.top||r.top>=c.bottom))t.scrollTop+=r.bottom-c.top+12}
 function glow(show){const s=A.cur?.step;for(const e of document.querySelectorAll('.zob-hl'))e.classList.remove('zob-hl');if(!s?.hl||!base())return;try{const e=s.hl();if(e){e.classList.add('zob-hl');if(show===true){e.scrollIntoView?.({block:'nearest'});clear(e)}}}catch(e){}}  /* show: scroll it into view (once, when the prompt opens, not on every redraw) */
 function say(s){const R=Z.radio;if(!R||!s.say)return;let t=Z.craft?.say(s.id)||s.say;if(Z.craft)t=t.replace(/Dart One/g,Z.craft.call());  /* the craft's own line for flying and the camera, and its call sign (ztypes.js) */
  try{R.say('guide',2,'OVERLORD',t,{nb:1,over:true,soft:1,alive:()=>A.cur?.step===s})}catch(e){}}  /* soft: in a wave a battle call goes first, and may cut in on this line; alive: not worth saying once the prompt is gone (zradio.js) */

 /* ---------- the flow ---------- */
 function open(s){A.cur={step:s,left:s.ttl,fin:0};A.n[s.id]=(A.n[s.id]|0)+1;A.log.push(s.id);s.on?.();last='';say(s);
  if(s.hl&&!mo&&Z.base.el){mo=new MutationObserver(()=>glow());mo.observe(Z.base.el,{childList:true,subtree:true})}paint();glow(true)}
 function close(res){const c=A.cur;if(!c)return;const s=c.step;A.cur=null;A.gap=GAP;last='';
  if(res==='drop')A.st[s.id]=A.n[s.id]>=OPENS?'timeout':A.st[s.id];else A.st[s.id]=res;
  if(mo){mo.disconnect();mo=null}glow();if(card)card.hidden=true}
 /* the wave-1 prompts end with wave 1; what was never taught is not taught later. The others have until their wave (by) has been played: the first helper and the sortie through wave 3's break, Rocket Assist and the swarm a few waves after the shop opens them. Then the step is dropped, so the guide always finishes, whatever the pilot did or did not buy */
 function expire(){const brk=G.state==='clear'||G.state==='base',w1=G.wave>=1&&brk||G.wave>=2;
  for(const s of STEPS){if(A.st[s.id])continue;const by=typeof s.by==='function'?s.by():s.by;if(s.flight?w1:G.wave>by){if(A.cur?.step===s)close(A.cur.fin?'done':'timeout');A.st[s.id]=A.st[s.id]||'timeout'}}}
 function pick(){for(const s of STEPS){if(A.st[s.id])continue;if(s.done()){A.st[s.id]='done';continue}if(s.ready()){open(s);return}}}
 /* the guided wave: tracks it spawns fly slower (the plan was thinned and spread in gentle()) */
 function slow(){if(!A.gentle)return;if(G.wave!==1||G.state==='clear'||G.state==='over'){A.gentle=false;return}if(G.state!=='wave')return;
  for(const t of TH)if(!t._ob&&api.live(t)){t._ob=1;if(t.spd<150){t.spd*=GN.slow;t.cs*=GN.slow;t.v.multiplyScalar(GN.slow)}}}
 function gentle(P){if(P.ob)return;P.ob=1;if(P.q.length>GN.max){P.q.length=GN.max;P.list=P.q.map(e=>e.k)}for(const e of P.q)e.at=+(GN.lead+e.at*GN.space).toFixed(1);A.gentle=true}
 function run(dt){if(!G.on||G.state==='over'){end(G.on?'over':'off');return}
  poll();slow();expire();const c=A.cur;
  if(c){const s=c.step;
   if(c.fin){if((c.fin-=dt)<=0)close('done')}
   else if(s.done()){if(s.info)close('done');else{c.fin=OKT;paint()}}
   else if(!s.ready())close('drop')
   else if((c.left-=dt)<=0)close(s.info?'done':'timeout');
   else paint()}
  if(!A.cur&&(A.gap-=dt)<=0)pick();
  if(A.on&&STEPS.every(s=>A.st[s.id]))end('done');else paint()}
 function tick(dt){if(api.menuOpen){vis();return}A.acc+=dt;if(A.acc<POLL)return;const d=A.acc;A.acc=0;run(d)}
 function end(why,quiet){if(!A.on)return;A.on=false;A.ended=why;A.cur=null;A.gentle=false;if(mo){mo.disconnect();mo=null}
  for(const e of document.querySelectorAll('.zob-hl'))e.classList.remove('zob-hl');card?.remove();card=null;last='';sk2.hidden=true}
 /* eligible: a first solo run on a human's browser. The save flag is set as the guide starts, so a run left halfway never brings it back */
 function begin(){const why=S.zonb?'seen':Z.online?'coop':window.__z?.spec?.on?'bot':Q==='0'||auto&&Q!=='1'?'auto':'';A.why=why;if(why)return;
  S.zonb=1;api.save();Object.assign(A,{on:true,ended:'',cur:null,st:{},n:{},ev:{},log:[],acc:0,gap:0,gentle:false,p0:null,d0:Z.def.D.length,sw0:null});
  card=mk();sk2.hidden=false}

 /* ---------- hooks ---------- */
 const z0=Z.start;Z.start=()=>{end('restart');z0();begin()};
 const zs=Z.stop;Z.stop=()=>{zs();end('left')};
 const c0=Z.continue;Z.continue=()=>{if(A.on&&G.state==='base'&&G.wave===0&&G.next)gentle(G.next);c0()};
 const d0=Z.detonate;Z.detonate=()=>{if(A.on&&wave())A.ev.burst=1;return d0()};
 const s0=Z.step;Z.step=dt=>{s0(dt);if(A.on&&!Z.hold())tick(dt)};
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);if(A.on){if(Z.hold())tick(dt||.016);else vis()}};

 /* ---------- harness (tools/zombies-test.mjs): read the guide, drive it, end it ---------- */
 Z.onboard={get on(){return A.on},get why(){return A.why},get ended(){return A.ended},get step(){return A.cur?.step.id||null},get fin(){return!!A.cur?.fin},get log(){return A.log},get st(){return A.st},get ev(){return A.ev},get gentle(){return A.gentle},
  get text(){return card?.querySelector('.t')?.textContent||''},get shown(){return!!card&&!card.hidden},steps:STEPS.map(s=>s.id),hud:id=>STEPS.find(s=>s.id===id)?.hud()||'',skip:()=>end('skip'),run,GN};
 return Z.onboard}
