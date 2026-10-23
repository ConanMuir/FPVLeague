/* Zombies radio chatter: the battle you can hear. Short callouts that follow what the game is doing (new tracks and where they are going, the
   kill chain layer by layer, kills, hits on the sites, sorties, bosses, the helpers and the swarm, your battery, your co-op partners), with
   callsigns: OVERLORD (the base), EARLY WARNING, DART ONE (you), a name for each defence (HORNET, ANVIL, GEPARD...). They are shown as a log on the
   HUD (the last three lines, fading), with a squelch click and a short burst of static through the master bus, and spoken by the browser's
   speechSynthesis when it has one (clipped and quick, like a radio). Nothing is a real-world procedure: all the phrasing is game flavour.
   
   Events are read from the game's state (a scan four times a second, plus the kill hook), never from the host's messages, so a co-op client
   makes its own calls from what its snapshots show. A call goes through note() (merged for a moment: three new tracks from the east are one
   call) and the channel (enqueue / pump): a priority queue with a cooldown per topic, a budget of calls per 20 s per priority, stale calls
   dropped, one call on the air at a time, and only an urgent call (priority 3: a site lost, a missed point defence) cuts the one on the air.
   The legacy subtitle (zannounce.js an.radio) is taken over while this is on: its generic lines are covered by the events here and dropped, its
   scripted ones (a boss's taunts) come through the same channel. Off in the settings, the old subtitle comes back.
   Settings (the same dl-interceptor save as the rest): S.zradio, S.zrspeech, S.zradiov, rows under the other sound sliders.
   Harness: Z.radio (tools/zombies-test.mjs, "radio"). */
import {AC,nbuf} from '../../engine/audio.js';
import {KIND,FAST} from './zdata.js';
export const GAIN_CAP=.08;  /* the loudest any radio sound gets on the master bus input; the master bus and its limiter come after it */
const cl=(v,a,b)=>v<a?a:v>b?b:v,pick=a=>a[Math.random()*a.length|0];
const SITE_C={x:0,z:1950};
const NUM=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
const num=n=>n<13?NUM[n]:String(n),Cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const DIRS=['north','north-east','east','south-east','south','south-west','west','north-west'];
const dirOf=p=>DIRS[((Math.round(Math.atan2(p.x-SITE_C.x,-(p.z-SITE_C.z))/(Math.PI/4))%8)+8)%8];
const etaP=s=>{s=Math.max(1,Math.round(s));return s<10?`${num(s)} second${s>1?'s':''}`:s<57?`${Math.min(55,Math.round(s/5)*5)} seconds`:s<75?'a minute':s<105?'a minute and a half':s<135?'two minutes':`${num(Math.round(s/60))} minutes`};
const pc=f=>{let v=Math.floor(f*20+1e-6)*5;if(f<1)v=Math.min(95,v);if(f>0)v=Math.max(5,v);return`${v} percent`};
const be=s=>/s$/.test(s)?'are':'is',art=n=>/^the /i.test(n)?'the '+n.slice(4):(/^[aeiou]/i.test(n)?'an ':'a ')+n;
const NM={shahed:['Shahed','Shaheds'],decoy:['Shahed','Shaheds'],jet:['Geran-3 jet','Geran-3 jets'],swarm:['FPV swarm','FPV swarms'],heavy:['armored heavy','armored heavies'],cruise:['cruise missile','cruise missiles'],
 ballistic:['ballistic missile','ballistic missiles'],hyper:['hypersonic glider','hypersonic gliders'],icbm:['ICBM warhead','ICBM warheads'],boss:['Mothership','Motherships']};
const noun=(k,n)=>NM[k]?NM[k][n>1?1:0]:n>1?'tracks':'track';
const HNAME={rack:'HORNET',lrack:'HORNET',flak:'ANVIL',hflak:'ANVIL',gepard:'GEPARD',sam:'LANCE',mpads:'SPEAR',idome:'IRON DOME',gdome:'GOLDEN DOME',ew:'SPARKY',laser:'BEAM',mwave:'SIZZLE',barrage:'WEB',smoke:'VEIL',carrier:'HIVE'};
const BASE='OVERLORD',EW='EARLY WARNING',ME='DART ONE';
const FRIENDLY=new Set([BASE,EW,ME,'DEFENCE',...Object.values(HNAME)]);
/* [pitch, rate] of the speech for each kind of voice: the base is low and calm, the early warning brisk, the defences high and quick, a boss slow and low */
const VOICE={base:[.8,1.2],ew:[.95,1.3],me:[1.1,1.25],help:[1.25,1.3],peer:[1,1.25],foe:[.5,.9]};
const vcOf=w=>w===BASE?'base':w===EW?'ew':w===ME?'me':FRIENDLY.has(w)?'help':'foe';
/* the old subtitle's generic lines (zfx.js, zwarn.js): the events below cover them, so with the chatter on they are dropped; everything else (a boss's lines, re-entry, the radar link) passes through */
const GENERIC=[/^(Mothership is down|Splash the Mothership|The carrier is down)/,/^(That was close\. Nice save|Good kill, right over the target|Saved it with seconds)/,/^(Splash \w+\.|Target down\.|Kill confirmed\.)$/,
 /^We've lost the /,/( is hit!| took a hit\.)|^Impact on the /,/^Integrity critical/,/^Heavy contact from the .*: a Mothership/,/^Launch detected, /,/ inbound from the [\w-]+\.$/,
 /^(Air raid warning|Wave \d+ incoming|Radar has new tracks)/,/^(All tracks down|Sky is clear|Raid defeated)/];
/* seconds a topic waits to merge more events into one call (HOLD) and between two of its calls (CD); calls per 20 s by priority (LIM); how long a queued call stays worth saying (TTL) */
const HOLD={trk:1.6,fast:.8,chain:.3,kill:1.6,site:1.5,boss:.5,help:.6,coop:.6,so:.6},CD={trk:6,fast:2,chain:.8,kill:8,site:8,boss:1.5,help:10,coop:3,so:2,bat:6,line:.6};
const LIM=[3,4,6,99],TTL=[6,9,14,20],MAXQ=4,GAP=.45,WIN=20;

export function initRadio(api,G,Z){
 const {TH,SITES,S}=api,$=id=>document.getElementById(id);
 {const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./zradio.css',import.meta.url).href;document.head.append(l)}
 S.zradio=S.zradio!==false;S.zrspeech=S.zrspeech!==false;S.zradiov=typeof S.zradiov==='number'&&isFinite(S.zradiov)?cl(S.zradiov,0,1):.6;  /* a hand-edited or foreign save */
 const R={env:{synth:()=>globalThis.speechSynthesis,utter:()=>globalThis.SpeechSynthesisUtterance},calls:[],q:[],cur:null,err:null,cap:GAIN_CAP,
  st:{made:0,played:0,cut:0,by:{},drop:{quiet:0,cool:0,dup:0,rate:0,full:0,stale:0}},speech:{n:0,cancel:0,live:0,na:0,last:''},au:{n:0,peak:0}};
 const Q=R.q,pend={},last={},win=[],txtAt=new Map(),LN=[],SWG=new Set();
 let T=0,gapT=0,st0='off',sc=0,wq=true,batF=0,critW=false;
 const safe=f=>{try{return f()}catch(e){return null}};
 const hard=()=>!G.on||api.demo||api.menuOpen||G.state==='trial'||G.state==='off'||Z.stepCap>12;  /* Z.stepCap: the Bot Spectator fast-forwarding, when the sim outruns any voice */
 const quiet=()=>hard()||G.state==='over'||G.state==='base'&&!Z.so?.S.on;  /* the base screen is quiet; a sortie flown from it is not */
 const on=()=>S.zradio!==false;
 const vol=()=>(typeof S.zradiov==='number'&&isFinite(S.zradiov)?cl(S.zradiov,0,1):.6)*(typeof S.zsfxv==='number'&&isFinite(S.zsfxv)?cl(S.zsfxv,0,1):1);
 const eta=t=>t.p.distanceTo(t.aim)/Math.max(1,t.spd),site0=t=>t.tgt?.n?t.tgt.n.toLowerCase():'site',hcall=c=>HNAME[c&&(c.type||c.d?.type)]||'DEFENCE';

 /* ---------- the HUD log: the last three calls, each fading after a few seconds (pruned on the sim clock too, so nothing stays) ---------- */
 const el=document.createElement('div');el.id='zchat';$('hud').append(el);
 function show(c){const d=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span');d.className=`zc p${c.pri}${c.vc==='foe'?' foe':''}`;b.textContent=c.who;s.textContent=c.txt;d.append(b,s);el.append(d);LN.push({d,c,exp:T+9});
  while(LN.length>3)LN.shift().d.remove()}
 const prune=()=>{while(LN.length&&T>LN[0].exp)LN.shift().d.remove()};

 /* ---------- sound: a squelch click and a short burst of static per call, on one gain (the radio volume x the effects volume x the cap) into the master bus ---------- */
 let bus=null;
 function busOn(){if(bus)return bus;if(!AC||!nbuf)return null;try{bus=AC.createGain();bus.gain.value=0;bus.connect(AC.destination)}catch(e){bus=null}return bus}
 function noise(t0,dur,type,f,q,pk,att){const s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain();s.buffer=nbuf;fl.type=type;fl.frequency.value=f;fl.Q.value=q;
  g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(pk,t0+att);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);s.connect(fl).connect(g).connect(bus);s.start(t0,Math.random()*1.4,dur+.02);R.au.peak=Math.max(R.au.peak,pk*bus.gain.value)}
 function sound(){const v=vol();if(v<=0||!busOn())return;try{bus.gain.value=v*GAIN_CAP;const t0=AC.currentTime+.01;noise(t0,.04,'highpass',1800,.5,.9,.003);noise(t0+.05,.2,'bandpass',2300,.7,.35,.02);R.au.n++}catch(e){}}

 /* ---------- speech: speechSynthesis when the browser has it, clipped and quick; cut off with the call ---------- */
 const voiceFor=sy=>{const vs=safe(()=>sy.getVoices())||[];return vs.find(v=>/^en[-_]/i.test(v.lang)&&v.localService)||vs.find(v=>/^en/i.test(v.lang))||null};
 function speak(c){const sy=safe(R.env.synth),U=safe(R.env.utter);if(!S.zrspeech||vol()<=0)return false;if(!sy||!U){R.speech.na++;return false}
  try{if(sy.pending)sy.cancel();const u=new U(c.txt.replace(/["“”]/g,'').replace(/—/g,','));const V=VOICE[c.vc]||VOICE.base;u.pitch=V[0];u.rate=V[1];u.volume=cl(.8*vol(),0,.8);u.lang='en-US';
   const v=voiceFor(sy);if(v)u.voice=v;u.onend=u.onerror=()=>{if(R.speech.live>0)R.speech.live--};R.speech.live++;sy.speak(u);R.speech.n++;R.speech.last=c.txt;return true}catch(e){return false}}
 function stopSpeech(){const sy=safe(R.env.synth);if(!sy)return;try{if(R.speech.live>0||sy.speaking||sy.pending){sy.cancel();R.speech.cancel++}}catch(e){}R.speech.live=0}

 /* ---------- the channel: one call on the air at a time ---------- */
 function play(c){c.end=T+cl(.6+c.txt.length/18,1.1,5.5);R.cur=c;win.push(T);R.st.played++;R.calls.push({t:+T.toFixed(2),at:+c.t0.toFixed(2),pri:c.pri,who:c.who,txt:c.txt,topic:c.topic});if(R.calls.length>80)R.calls.shift();show(c);sound();speak(c)}
 function cut(){const c=R.cur;if(!c)return;c.cut=1;R.st.cut++;stopSpeech();R.cur=null;gapT=T+.1;for(const l of LN)if(l.c===c)l.d.classList.add('cut')}
 function pump(){if(R.cur&&T>=R.cur.end){R.cur=null;gapT=T+GAP}if(R.cur)return;
  for(let i=Q.length-1;i>=0;i--)if(T-Q[i].t0>Q[i].ttl){Q.splice(i,1);R.st.drop.stale++}
  if(!Q.length)return;let b=0;for(let i=1;i<Q.length;i++)if(Q[i].pri>Q[b].pri)b=i;if(T<gapT&&Q[b].pri<3)return;play(Q.splice(b,1)[0])}
 function enqueue(topic,c,gated){const p=cl(c.pri|0,0,3),D=R.st.drop;
  if(!on()||hard()||quiet()&&!c.over){D.quiet++;return false}
  if(!gated&&p<3&&T-(last[topic]??-99)<(CD[topic]||0)){D.cool++;return false}
  const tx=txtAt.get(c.txt);if(p<3&&tx!=null&&T-tx<10){D.dup++;return false}
  while(win.length&&T-win[0]>WIN)win.shift();
  if(p<3&&!c.nb&&win.length+Q.length>=LIM[p]){D.rate++;return false}
  if(Q.length>=MAXQ){let lo=0;for(let i=1;i<Q.length;i++)if(Q[i].pri<Q[lo].pri)lo=i;if(Q[lo].pri>p||Q[lo].pri===p&&p<3){D.full++;return false}Q.splice(lo,1);D.full++}
  Q.push({...c,topic,pri:p,t0:T,ttl:TTL[p],vc:c.vc||vcOf(c.who)});txtAt.set(c.txt,T);if(txtAt.size>40)txtAt.delete(txtAt.keys().next().value);last[topic]=T;R.st.made++;R.st.by[topic]=(R.st.by[topic]|0)+1;
  if(p>=3&&R.cur&&R.cur.pri<3)cut();pump();return true}
 /* an event for a topic that merges: it waits HOLD seconds (and the topic's cooldown, unless it is urgent) for company, then one call is made of all of them */
 function note(topic,item){if(quiet()||!on())return;let p=pend[topic];if(!p)p=pend[topic]={t0:T,L:[],over:0,u:false};if(p.L.length<60)p.L.push(item);else p.over++;if(item.u)p.u=true}
 function flushDue(){for(const k in pend){const p=pend[k];if(T-p.t0<(HOLD[k]||0)||!p.u&&T-(last[k]??-99)<(CD[k]||0))continue;delete pend[k];last[k]=T;
   let out=null;try{out=GEN[k](p.L,p)}catch(e){R.err=R.err||e}for(const c of out||[])enqueue(k,c,true)}}
 /* a call that does not merge (wave edges, battery, a scripted line) */
 const say=(topic,pri,who,txt,o)=>enqueue(topic,{pri,who,txt,...o});
 function hush(){Q.length=0;for(const k in pend)delete pend[k];R.cur=null;gapT=0;win.length=0;txtAt.clear();for(const k in last)delete last[k];stopSpeech();for(const l of LN)l.d.remove();LN.length=0;SWG.clear()}

 /* ---------- the calls: several phrasings each, built from a merged group of events ---------- */
 const C=(pri,who,txt,o)=>({pri,who,txt,...o});
 const GEN={
  /* new tracks: grouped by the direction they come from */
  trk(it,p){it=it.filter(a=>api.live(a.t));for(const a of it)a.eta=eta(a.t);const n=it.length+p.over;if(!it.length)return[];
   if(n===1){const a=it[0],nn=noun(a.k,a.n),e=etaP(a.eta);
    return[C(1,BASE,a.k==='swarm'?pick([`FPV swarm, ${num(a.n)} drones, ${a.dir}, going for the ${a.site}.`,`Swarm of ${num(a.n)} from the ${a.dir}, ${e} to the ${a.site}.`]):
     pick([`Track ${a.id}, ${nn}, ${e}, heading for the ${a.site}.`,`New contact, track ${a.id}. ${Cap(nn)} from the ${a.dir}, ${a.site} in ${e}.`,`${Cap(nn)} from the ${a.dir}, track ${a.id}. Target is the ${a.site}, ${e}.`]))]}
   const g={};for(const a of it)(g[a.dir]||(g[a.dir]=[])).push(a);const gs=Object.entries(g).sort((x,y)=>y[1].length-x[1].length);
   if(gs.length===1){const[dir,L]=gs[0],ks=new Set(L.map(a=>a.k)),c=L.length+p.over,what=ks.size===1?noun(L[0].k,c):'tracks',st={};for(const a of L)st[a.site]=(st[a.site]|0)+1;
    const top=Object.entries(st).sort((x,y)=>y[1]-x[1])[0][0],to=Object.keys(st).length===1?`heading for the ${top}`:`mostly the ${top}`,e=etaP(Math.min(...L.map(a=>a.eta)));
    return[C(1,BASE,pick([`${Cap(num(c))} ${what} from the ${dir}, ${to}.`,`${Cap(num(c))} new ${what} from the ${dir}, ${to}. First one in ${e}.`,`${Cap(num(c))} ${what} coming in from the ${dir}, ${to}.`]))]}
   return[C(1,BASE,`${Cap(num(n))} new tracks: ${gs.slice(0,3).map(([d,L])=>`${num(L.length)} from the ${d}`).join(', ')}${gs.length>3?' and more':''}.`)]},
  /* a fast missile picked up by early warning */
  fast(it){it=it.filter(a=>api.live(a.t));for(const a of it)a.eta=eta(a.t);if(!it.length)return[];if(it.length===1){const a=it[0],K=KIND[a.k],e=etaP(a.eta);
    return[C(a.u?3:2,EW,pick([`Launch detected, ${K.n.toLowerCase()}, ${e} to the ${a.site}.`,`${Cap(K.n.toLowerCase())} launch, ${a.dir}. Impact on the ${a.site} in ${e}.`,`Launch! ${Cap(K.n.toLowerCase())} on track ${a.id}, ${a.site}, ${e}.`]))]}
   const e=etaP(Math.min(...it.map(a=>a.eta)));return[C(it.some(a=>a.u)?3:2,EW,pick([`${Cap(num(it.length))} launches detected. First impact in ${e}.`,`${Cap(num(it.length))} missiles up, ${it[0].dir} first. Impact in ${e}.`]))]},
  /* the kill chain, layer by layer (at most two calls from one batch) */
  chain(it){const sec=a=>(['west','north','east'][a.sec]||'launch')+' edge',F={
    bkill:a=>C(2,EW,pick([`Boost-phase intercept, ${sec(a)}. Track ${a.id} is down.`,`Birds away from the ${sec(a)}, track ${a.id} killed in boost.`])),
    bmiss:a=>C(1,EW,pick([`The ${sec(a)} battery missed track ${a.id}. It's through.`,`Boost-phase miss on track ${a.id}. Midcourse next.`])),
    mid:a=>C(1,EW,pick([`Midcourse intercept launched on track ${a.id}.`,`Dome has track ${a.id}.`])),
    mkill:a=>C(2,EW,pick([`Midcourse kill. Track ${a.id} is down.`,`Dome got track ${a.id}.`])),
    mmiss:a=>C(2,EW,pick([`Midcourse missed. Track ${a.id} is still coming.`,`Dome missed track ${a.id}. Terminal next.`])),
    tkill:a=>C(2,EW,pick([`Point defence got track ${a.id} over the ${a.site}.`,`Terminal kill on track ${a.id}.`])),
    tmiss:a=>C(3,EW,pick([`Point defence missed track ${a.id}. Brace, ${a.site}!`,`Track ${a.id} got through point defence. Brace brace!`])),
    brace:a=>C(3,EW,pick([`Track ${a.id} is in terminal on the ${a.site}. ${Cap(etaP(a.eta))}!`,`Brace, brace. Track ${a.id}, ${a.site}, ${etaP(a.eta)}.`])),
    dkill:a=>C(2,EW,pick([`Direct hit! Track ${a.id} is down.`,`Track ${a.id} destroyed.`])),
    xkill:a=>C(1,EW,`Track ${a.id} is down.`)};
   return it.map(a=>F[a.st]?.(a)).filter(Boolean).sort((x,y)=>y.pri-x.pri).slice(0,2)},
  /* kills: one call for the lead shooter, with the total */
  kill(it){const tally={};let tot=0,clutch=null;for(const a of it){tally[a.src]=(tally[a.src]|0)+1;tot++;if(a.clutch)clutch=a}
   if(clutch)return[C(1,BASE,pick([`Close one. That would have hit the ${clutch.site}.`,`Saved the ${clutch.site} with seconds to spare.`,`Good kill, right over the ${clutch.site}.`]))];
   const rank=s=>s==='p'?2:s[0]==='o'?1:0,lead=Object.keys(tally).sort((a,b)=>tally[b]-tally[a]||rank(b)-rank(a))[0],n=tot,a=it.find(x=>x.src===lead),id=a.id;
   const who=lead==='p'?ME:lead[0]==='o'?lead.slice(2).toUpperCase():lead.slice(2);
   return[C(0,who,n>1?pick([`Splash ${num(n)}.`,`${Cap(num(n))} down.`]):lead==='p'?pick([`Splash one.`,`Splash. Track ${id} is down.`,`Target down.`]):pick([`Splash one.`,`Kill confirmed.`,`Target down.`]),{vc:lead==='p'?'me':lead[0]==='o'?'peer':'help'})]},
  /* the sites: a hit, a site in trouble, a site lost */
  site(it){const lost=it.filter(a=>a.h<=0),crit=it.filter(a=>a.crit&&a.h>0);
   if(lost.length)return[C(3,BASE,pick([`We've lost the ${lost[0].site}!`,`The ${lost[0].site} ${be(lost[0].site)} gone!`]))];
   if(crit.length){const a=crit[0];return[C(3,BASE,pick([`The ${a.site} ${be(a.site)} critical, ${pc(a.f)} left!`,`The ${a.site} won't take much more. ${Cap(pc(a.f))}.`]))]}
   const by={};for(const a of it){const b=by[a.site]||(by[a.site]={...a,n:0});b.n+=a.n||1;b.f=a.f;b.kind=a.kind||b.kind}const L=Object.values(by);
   if(L.length>1)return[C(2,BASE,`Hits on the ${L.slice(0,-1).map(a=>a.site).join(', the ')} and the ${L[L.length-1].site}.`)];
   const a=L[0];
   return[C(2,BASE,a.n>1?pick([`The ${a.site} ${be(a.site)} taking hits, ${pc(a.f)} left.`,`More hits on the ${a.site}. ${Cap(pc(a.f))}.`]):
    pick([`The ${a.site} ${be(a.site)} hit, ${pc(a.f)} left.`,`Impact on the ${a.site}. ${Cap(pc(a.f))}.`,a.kind?`${Cap(noun(a.kind,1))} hit the ${a.site}, ${pc(a.f)} left.`:`The ${a.site} took a hit, ${pc(a.f)} left.`]))]},
  /* bosses */
  boss(it){const out=[],arr=it.filter(a=>a.ev==='arr');
   if(arr.length)out.push(C(2,BASE,arr.length>1?`Heavy contacts from the ${arr[0].dir}: ${arr.map(a=>a.name).join(' and ')}.`:pick([`Heavy contact from the ${arr[0].dir}: ${arr[0].name}. ${Cap(etaP(arr[0].eta))} out.`,`Big one coming in from the ${arr[0].dir}. It's ${art(arr[0].name)}.`])));
   for(const a of it){if(a.ev==='ph')out.push(C(2,BASE,pick([`${a.name} is changing: ${a.txt.toLowerCase()}.`,`${a.name}, ${a.txt.toLowerCase()}. Stay on it.`])));
    else if(a.ev==='stage')out.push(C(1,BASE,a.n>0?`Stage down. ${Cap(num(a.n))} left.`:'Last stage is gone. Finish it!'));
    else if(a.ev==='down')out.push(C(2,BASE,pick(['Mothership down! Mop up the swarms.','The carrier is down. Outstanding.','Splash the Mothership!'])))}
   return out.sort((x,y)=>y.pri-x.pri).slice(0,2)},
  /* helpers and the swarm */
  help(it){const sw=it.filter(a=>a.sw),mg=it.filter(a=>!a.sw);
   if(mg.length){const nm=[...new Set(mg.map(a=>a.who))];return[C(0,nm.length===1?nm[0]:BASE,nm.length===1?pick(['Magazine empty.','Out of missiles.','Winchester, reloading next wave.']):`${nm.slice(0,-1).join(', ')} and ${nm[nm.length-1]} are dry.`)]}
   const a=sw[sw.length-1];return[C(0,ME,a.left<=0?'My swarm is gone.':a.dep?`Swarm deployed, ${num(a.left)} drones.`:pick([`Lost a swarm drone, ${num(a.left)} left.`,`Swarm down to ${num(a.left)}.`]))]},
  /* co-op partners */
  coop(it){const a=it[it.length-1],n=a.name;
   return[a.ev==='down'?C(2,BASE,pick([`${n} is down!`,`We lost ${n}'s drone.`])):a.ev==='up'?C(0,BASE,`${n} is back in the air.`):a.ev==='left'?C(1,BASE,`${n} dropped off the net.`):C(1,BASE,`${n} is on the net.`)]},
  /* sorties */
  so(it){const out=[];for(const a of it){
    if(a.ev==='launch')out.push(C(1,ME,pick([`Off the mat. ${Cap(etaP(a.t))} on the clock.`,`Dart One is airborne, sortie clock ${etaP(a.t)}.`])));
    else if(a.ev==='end')out.push(C(2,EW,pick(['Sortie lost.','We lost the drone out there.'])));
    else if(a.ev==='lock')out.push(C(2,EW,pick(['AA is tracking you. Break off!','Gun lock on Dart One. Jink!'])));
    else if(a.ev==='hull')out.push(C(2,ME,pick([`Taking fire, hull at ${a.pct}.`,`I'm hit. Hull ${a.pct}.`])));
    else if(a.ev==='bank')out.push(C(1,BASE,pick(['Salvage is banked.','Cargo is in. Salvage banked.'])));
    else if(a.ev==='found')out.push(C(1,BASE,`${a.what} located in the ${a.sec}.`));
    else if(a.ev==='conv')out.push(C(1,BASE,`Convoy spotted, ${num(a.n)} trucks on the ${a.sec} road.`));
    else if(a.ev==='truck')out.push(C(1,ME,a.left>0?`Truck down, ${num(a.left)} left in the convoy.`:'Last truck is down.'));
    else if(a.ev==='dead')out.push(C(2,BASE,pick([`${a.what} destroyed!`,`${a.what} is gone. Good bombing.`])))}
   return out.sort((x,y)=>y.pri-x.pri).slice(0,2)}};

 /* ---------- reading the game: tracks, sites, helpers, battery, partners, sorties (a scan four times a second) ---------- */
 function tracks(){for(const t of TH){if(!api.live(t))continue;const K=KIND[t.k];if(!K||K.minor)continue;
   if(K.bossy||t.k==='boss'){boss(t,K);continue}
   if(FAST.includes(t.k)){fast(t);continue}
   if(t._rz||!Z.seen(t))continue;
   if(t.k==='swarm'&&t.grp){if(SWG.has(t.grp)){t._rz=1;continue}SWG.add(t.grp)}
   t._rz=1;note('trk',{t,k:t.k==='decoy'&&!t.ident?'shahed':t.k,id:t.id,dir:dirOf(t.p),site:site0(t),eta:eta(t),n:t.k==='swarm'?TH.reduce((a,u)=>a+(u.grp===t.grp&&api.live(u)?1:0),0):1})}}
 function fast(t){const k=t.kc;if(!k)return;const e=eta(t),site=site0(t);
  if(k.det&&!t._rzd){t._rzd=1;note('fast',{t,k:t.k,id:t.id,dir:dirOf(t.p),site,eta:e,u:e<20})}
  if(!t._rzd)return;const s=Z.chainStatus?.(t)||{},it={id:t.id,site,sec:k.sec,k:t.k};
  if(k.b==='miss'&&t._rb!=='miss'){t._rb='miss';note('chain',{...it,st:'bmiss'})}
  if(s.m==='pending'&&!t._rm){t._rm=1;note('chain',{...it,st:'mid'})}
  if((s.mm|0)>(t._rmm|0)){t._rmm=s.mm;note('chain',{...it,st:'mmiss'})}
  if(k.pd==='miss'&&!t._rpd){t._rpd=1;note('chain',{...it,st:'tmiss',u:1})}
  if(!t._rbr&&e<=12&&t.st!=='fall'&&!t.dcy){t._rbr=1;note('chain',{...it,st:'brace',eta:e,u:1})}}
 function boss(t,K){const D=Z.bosses?.BOSSES?.[t.k];
  if(!t._rz){t._rz=1;note('boss',{ev:'arr',name:K.n,dir:dirOf(t.p),eta:eta(t)})}
  const ph=t.bs?.ph|0;if(t._rph==null)t._rph=ph;else if(ph!==t._rph){t._rph=ph;if(D?.phases?.[ph])note('boss',{ev:'ph',name:K.n,txt:D.phases[ph]})}
  if(t.k==='boss'&&Number.isFinite(t.stages)){if(t._rst==null)t._rst=t.stages;else if(t.stages<t._rst){t._rst=t.stages;note('boss',{ev:'stage',n:t.stages})}}}
 const SH=[],SA=[],SN=[];
 function sites(){SITES.forEach((s,i)=>{const h=Math.max(0,s.hp),was=SH[i];SH[i]=h;if(was==null||!(s.max>0)||h>=was-.5)return;
   SA[i]=(SA[i]||0)+was-h;SN[i]=(SN[i]|0)+1;const f=h/s.max,crit=f<.35&&was/s.max>=.35,lh=G.lastHit;  /* small hits add up: a call once they come to 4% of the site, at once for a site in trouble */
   if(h>0&&!crit&&SA[i]<s.max*.04)return;note('site',{site:s.n.toLowerCase(),h,f,crit,n:SN[i],u:h<=0||crit,kind:lh&&lh.site===s.n&&Math.abs(lh.dmg-(was-h))<=1?lh.k:null});SA[i]=SN[i]=0});
  let hp=0,mx=0;for(const s of SITES){hp+=Math.max(0,s.hp);mx+=s.max}
  if(mx&&hp/mx<.3&&hp>0&&!critW){critW=true;say('integ',3,BASE,pick(['Integrity critical. Hold them off!','We are close to collapse. Every kill counts!']))}}
 function helpers(){const d0=Z.def?.D;if(d0)for(const d of d0){const mg=Z.def.magOf?.(d);if(!mg)continue;const a=d.ammo|0;if(d._ra>0&&a<=0)note('help',{who:HNAME[d.type]||'DEFENCE'});d._ra=a}
  const sw=Z.sw?.mine;if(sw){const n=sw.d.length,was=SW.n;if(was!=null&&n<was)note('help',{sw:1,left:n});else if(was===0&&n>0&&G.state==='wave')note('help',{sw:1,left:n,dep:1});SW.n=n}}
 const SW={n:null};
 function battery(){const me=api.player,cap=api.BCAP;if(!me||!cap||me.dead>0||G.state!=='wave'&&!Z.so?.S.on)return;const left=1-me.mah/cap;if(left>.5)batF=0;
  if(left<.12&&!(batF&2)){batF|=3;say('bat',2,BASE,pick(['Dart One, your battery is critical. Bring it home!','Battery critical. Get that drone down!']))}
  else if(left<.3&&!(batF&1)){batF|=1;say('bat',1,ME,pick([`Battery at ${pc(left)}.`,`Down to ${pc(left)} on the pack.`]))}}
 const CP=new Map();
 function coop(){const P=Z.pilotsK?.();if(!P){CP.clear();return}const me=Z.netMe?.(),seen=new Set(),nm=k=>Z.netName?.(k)||'Pilot';
  for(const[k,d]of P){if(k===me)continue;seen.add(k);const c=CP.get(k),dead=d.dead>0,name=nm(k);if(!c){CP.set(k,{dead,name});if(G.state==='wave')note('coop',{ev:'join',name});continue}
   if(dead&&!c.dead)note('coop',{ev:'down',name});else if(!dead&&c.dead)note('coop',{ev:'up',name});c.dead=dead;c.name=name}
  for(const[k,c]of CP)if(!seen.has(k)){CP.delete(k);note('coop',{ev:'left',name:c.name})}}
 const SO={on:false,carry:0,lock:0,hull:100};
 function sortie(){const so=Z.so;if(!so)return;const s=so.S,me=api.player;
  if(s.on&&!SO.on)note('so',{ev:'launch',t:s.t});
  if(!s.on&&SO.on&&!(s.home&&me&&me.dead<=0))note('so',{ev:'end'});  /* a sortie that ends well reopens the base screen, which is quiet: only a lost one is called */
  if(s.on){if(s.lock&&!SO.lock)note('so',{ev:'lock'});if(Math.floor(s.hull/25)<Math.floor(SO.hull/25)&&s.hull>0)note('so',{ev:'hull',pct:pc(s.hull/100)});
   if(SO.carry>0&&s.carry===0&&s.home&&me&&me.dead<=0)note('so',{ev:'bank'})}
  SO.on=s.on;SO.carry=s.carry;SO.lock=s.lock;SO.hull=s.hull;
  for(const t of so.W.list){const sec=['west','north','east'][t.sec]||'front',what=t.t==='launch'?'Launch site':t.t==='factory'?'Drone factory':'Convoy';
   if(t.t==='convoy'){if(t.seen&&!t._rs){t._rs=1;note('so',{ev:'conv',n:t.parts.filter(p=>p.main).length,sec})}
    const left=t.parts.filter(p=>p.main&&p.alive).length;if(t._rn!=null&&left<t._rn&&left>0)note('so',{ev:'truck',left});t._rn=left;
    if(t.dead&&!t._rd){t._rd=1;note('so',{ev:'dead',what})}}
   else{if(t.known&&!t._rk){t._rk=1;note('so',{ev:'found',what,sec})}if(t.dead&&!t._rd){t._rd=1;note('so',{ev:'dead',what})}}}}
 function scan(){if(G.state==='trial')return;try{if(G.state==='wave'||G.state==='clear'){tracks();sites();helpers();battery();coop()}sortie()}catch(e){R.err=R.err||e}}

 /* ---------- kills (the hook sees every one, on a client too) ---------- */
 function noteKill(t,claim){const K=KIND[t.k];if(!K||K.minor||t._rzk)return;t._rzk=1;
  if(t.k==='boss'){note('boss',{ev:'down'});return}
  if(K.bossy)return;
  if(FAST.includes(t.k)){const k=t.kc||{},ty=claim&&(claim.type||claim.d?.type)||'';
   note('chain',{id:t.id,site:site0(t),sec:k.sec,k:t.k,st:k.b==='kill'?'bkill':k.pd==='kill'?'tkill':/dome/.test(ty)?'mkill':t.by==='p'||t.by==='o'?'dkill':'xkill'});return}
  const src=t.by==='o'?'o:'+(Z.netName?.(t.byN)||'Pilot'):t.by==='h'?'h:'+hcall(claim):'p';
  note('kill',{src,id:t.id,clutch:!!K.dmg&&Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)<600,site:site0(t)})}
 const k0=Z.kill;Z.kill=(t,cat)=>{const was=t.paid,cl0=t.claim;k0(t,cat);if(!was&&t.paid&&G.on&&!api.demo&&G.state!=='trial'&&on())noteKill(t,cl0)};

 /* ---------- the wave edges ---------- */
 function stateTick(){const st=G.state;if(st===st0)return;const was=st0;st0=st;
  if(st==='wave'&&was!=='clear'){critW=false;SWG.clear();batF=0;const q=G.wq||[],n=q.reduce((a,e)=>a+(+String(e.k).split(':')[1]||1),0)+TH.reduce((a,t)=>a+(api.live(t)&&!KIND[t.k]?.minor?1:0),0),big=q.some(e=>{const k=String(e.k).split(':')[0];return k==='boss'||KIND[k]?.bossy&&!KIND[k].minor});
   say('wave',1,BASE,big?pick([`Wave ${G.wave}: heavy contact expected. All units stand to.`,`Air raid warning. Wave ${G.wave}, and something big is coming.`]):
    !n?pick([`Wave ${G.wave}. Air raid warning is up.`,`Stand to, wave ${G.wave}.`]):
    pick([`Wave ${G.wave}. Air raid warning is up, about ${num(n)} track${n>1?'s':''} on the way.`,`Stand to, wave ${G.wave}. Radar shows ${num(n)} contact${n>1?'s':''} launching.`,`Wave ${G.wave} incoming, about ${num(n)} track${n>1?'s':''}.`]),{nb:1})}  /* nb: the wave's edges are not held back by the budget */
  else if(st==='clear'&&was==='wave'){let hp=0,mx=0;for(const s of SITES){hp+=Math.max(0,s.hp);mx+=s.max}
   say('wave',2,BASE,G.perfect?pick([`Sky is clear. Wave ${G.wave} held, no damage.`,`Wave ${G.wave} defeated without a scratch.`]):pick([`Sky is clear. Wave ${G.wave} held, integrity ${pc(mx?hp/mx:1)}.`,`All tracks down. Wave ${G.wave} is over, integrity ${pc(mx?hp/mx:1)}.`]),{nb:1})}
  else if(st==='base')hush();
  else if(st==='over')say('wave',3,BASE,pick(['All sites are lost. That is the end.','The defence has collapsed.']),{over:true})}

 /* ---------- the old subtitle: while the chatter is on, its generic lines are dropped (covered above) and its scripted ones come through here ---------- */
 const an=Z.an;
 if(an){const r0=an.radio,c0=an.radioClear;
  an.radio=(who,txt,pri=1)=>{if(!on())return r0(who,txt,pri);txt=String(txt);if(GENERIC.some(re=>re.test(txt)))return;say('line',cl(pri|0,0,2),String(who).slice(0,24),txt.slice(0,160))};
  an.radioClear=()=>{c0?.();hush()}}

 /* ---------- hooks ---------- */
 const s0=Z.step;Z.step=dt=>{s0(dt);if(!G.on)return;T+=dt;stateTick();if((sc-=dt)<=0){sc=.25;scan()}flushDue();pump()};
 let vt=0;const v0=Z.visuals;Z.visuals=dt=>{v0(dt);const q=quiet()&&G.state!=='over';if(q&&!wq)hush();wq=q;stateTick();
  if(G.state==='base'&&(vt-=dt||.016)<=0){vt=.25;scan()}  /* the sorties' baselines keep up while the base screen holds the sim */
  prune()};
 const z0=Z.start;Z.start=()=>{hush();R.calls.length=0;SH.length=SA.length=SN.length=0;CP.clear();SW.n=null;st0='off';Object.assign(SO,{on:false,carry:0,lock:0,hull:100});T=0;sc=0;z0()};
 const z1=Z.stop;Z.stop=()=>{z1();hush();st0='off';SH.length=0;CP.clear()};

 /* ---------- settings rows with the other sound sliders (shown with Zombies picked) ---------- */
 const rows=[];
 {let after=$('o_zsfxv')||$('o_zwx');const set=$('set');
  const row=(lab,inp,out,show)=>{const l=document.createElement('label');l.textContent=lab;l.htmlFor=inp.id;if(after)after.after(l,inp,out);else set?.append(l,inp,out);after=out;rows.push({els:[l,inp,out],show})};
  const sel=(key,lab,hook)=>{const i=document.createElement('select'),o=document.createElement('output');i.id='f_'+key;o.id='o_'+key;i.add(new Option('On','1'));i.add(new Option('Off','0'));
   i.addEventListener('input',()=>{S[key]=i.value==='1';api.save();hook?.();rows.forEach(r=>r.show())});row(lab,i,o,()=>{i.value=S[key]===false?'0':'1';o.textContent=key==='zrspeech'&&!safe(R.env.synth)?'not available in this browser':''})};
  sel('zradio','Zombies radio chatter',()=>{if(!on())hush()});sel('zrspeech','Radio speech (voice)',()=>{if(!S.zrspeech)stopSpeech()});
  {const i=document.createElement('input'),o=document.createElement('output');i.id='f_zradiov';o.id='o_zradiov';i.type='range';i.min=0;i.max=1;i.step=.05;
   i.addEventListener('input',()=>{S.zradiov=+i.value;api.save();rows.forEach(r=>r.show())});row('Radio volume',i,o,()=>{i.value=S.zradiov;o.textContent=Math.round(S.zradiov*100)+'%'})}}
 const sync=()=>{for(const r of rows)r.show()};  /* the rows used to hide unless S.gmode was 'z'; Classic is gone, the setting is dropped on load, and they never showed */
 sync();const sm0=Z.syncMode;Z.syncMode=()=>{sm0?.();sync()};

 /* ---------- harness (tools/zombies-test.mjs): inject events, read the channel ---------- */
 R.note=note;R.say=say;R.scan=scan;R.hush=hush;R.flush=()=>{for(const k in pend){pend[k].t0=-99;last[k]=-99}flushDue();pump()};R.GEN=GEN;
 R.clock=()=>T;R.step=dt=>{T+=dt;flushDue();pump()};R.lines=()=>LN.map(l=>l.d.textContent);R.pend=()=>Object.keys(pend);R.sw=()=>SWG.size;
 R.busGain=()=>bus?bus.gain.value:null;
 Z.radio=R;
 return R}
