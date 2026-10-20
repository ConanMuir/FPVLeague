// Zombies sorties + fog of war. Between waves (from wave 1 on) a pilot can launch one sortie a break from the base screen's Sortie tab: a timed
// flight (SO.clock) past the defence line into the enemy's side of the map (zsites.js) to find and bomb what feeds the next waves:
//  supply convoys   trucks on the roads, each carrying part of one kind for the next wave ("Convoy destroyed: -6 Shaheds next wave"); a convoy
//                   carrying a kind's first appearance delays that kind a wave
//  launch sites     one per sector; destroyed, that sector sends no fast missiles (zdata FAST) next wave and half the wave after, and half its
//                   cruise missiles and jets next wave (the kill chain's Z.fastPlan / Z.cutFast count and cut the fast ones)
//  drone factories  armoured (6 bomb hits); destroyed, a third of the kind it builds stays away for 3 waves
// Every part pays salvage, but you carry it: it is banked when your drone is back inside the line (near a forward position, an outpost, the
// radar or a site). Shot down, crashed, relaunched or late: the salvage is lost (the strike itself still counts). F drops a bomb (3 per drone,
// with a CCIP pipper); the last F is the warhead itself. Be back inside the line when the clock runs out or, solo, the wave starts without
// you: drone and salvage lost, and you relaunch from the mat. A known target can also be hit from the base screen with a strike order
// (money, a share of the drones shot down by its defences, no salvage).
// Fog of war (zfog.js): the far ground starts unknown beyond the radar pad's ground-surveillance circle (Long-range radar widens it); what a
// drone sees (farther the higher it flies) stays known for the run. Known sites, last-seen convoys and their roads show on the Sortie map, the
// overview map and the radar. Hooks: Z.cutPlan (zombies.js plan), Z.xTab / Z.mapFog / Z.cutNote (zbase.js), Z.lq (interceptor.js link),
// Z.so.net* (znet.js 'S' requests and events, snapshot field so). It wraps detonate, hold, step, visuals, hud, overlay, radar, key, pad, start.
// Co-op: the host runs the enemy side, the cuts and every pilot's carried salvage; each pilot flies and bombs, impacts go to the host.
import {KIND,SECTORS,FAST,sectorOf} from './zdata.js';
import {initFog} from './zfog.js';
import {initSites,SO,TGT,TIERK,TIER,PER_TRUCK} from './zsites.js';
import './zsortiebot.js';  // the bots' sorties: a zbotbrain.js hook
const cl=(v,a,b)=>v<a?a:v>b?b:v,sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)},money=n=>'$'+Math.round(n).toLocaleString('en-US');
const SING={shahed:'Shahed',jet:'Geran-3 jet',decoy:'decoy',swarm:'swarm drone',heavy:'armored heavy',cruise:'cruise missile',ballistic:'ballistic missile',hyper:'hypersonic',icbm:'ICBM',boss:'Mothership'};
const PL={shahed:'Shaheds',jet:'Geran-3 jets',decoy:'decoys',swarm:'swarm drones',heavy:'armored heavies',cruise:'cruise missiles',ballistic:'ballistic missiles',hyper:'hypersonics',icbm:'ICBMs',boss:'Motherships'};
const nk=(k,n)=>`${n} ${n===1?SING[k]:PL[k]}`,fmt=s=>{const c=Math.max(0,Math.ceil(s));return`${c/60|0}:${String(c%60).padStart(2,'0')}`};
const SEC=i=>SECTORS[i]?.n||'?';
export function initSortie(api,G,Z){
 const {THREE,FOBS,PADP,SITES,feed,banner,tone,gh}=api,V3=THREE.Vector3,$=id=>document.getElementById(id),_a=new V3(),_b=new V3(),_c=new V3();
 {const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./zsortie.css',import.meta.url).href;document.head.append(l)}
 const fog=initFog(),W=initSites(api,G,Z,fog);
 // this pilot's sortie. used = the break (G.wave) it was flown in; alive / lastT track the drone's lives; home = inside the line
 const S={on:false,t:0,hull:SO.hull,bombs:SO.bombs,carry:0,pad:1,obj:0,home:true,used:-1,alive:false,lastT:0,revT:0,brk:-1,warnT:0,lockT:0,tw:0};
 const CK={};  // the host: what each other pilot carries
 const auth=()=>!Z.mirror,myKey=()=>Z.netMe?.()||'me',me=()=>api.player;
 const pilots=()=>(Z.pilotsK?.()||[[myKey(),api.player]]).filter(([,d])=>d&&d.dead<=0).map(([key,d])=>({key,d}));
 const bombR=lv=>SO.bombR+SO.bombRk*lv,bombsMax=()=>SO.bombs;
 const radarR=()=>SO.radarR*(1+((Z.radarK?.()??1)-1)*.6),sight=d=>cl(SO.sight[0]+SO.sight[1]*(d.p.y-gh(d.p.x,d.p.z)),SO.sight[0],SO.sight[2]);
 const salv=(b,tier)=>Math.round(b*(1+G.wave/20)*TIERK[tier|0]*(Z.diff?.().cash??1)*Z.meta.k('cashK',1));
 const say=(key,a,b,col='#ffc640')=>{if(!key||key===myKey())Z.an?.say(a,b,col,2);else Z.netEv?.(['S','a',key,a,b,col])};
 const team=h=>{feed(h);Z.netEv?.(['f',h])};
 const avail=()=>G.on&&G.state==='base'&&G.wave>=SO.from&&S.used!==G.wave;
 const strikeCost=()=>Math.round((SO.strike.base+SO.strike.perW*G.wave)/50)*50;
 Z.so={S,W,fog};

 // ---------- what strikes take out of the waves (G.cuts), applied to plans ----------
 // a cut: {src, label, k (kind) | sec (launch), n | f (share) | all, w0, w1}. The one for the next wave is applied to G.next when it is made;
 // later waves get it through Z.cutPlan when they are planned. A plan never loses more than SO.cap of its threat points to cuts.
 const ptsOf=e=>{const[k,c]=e.k.split(':');return(KIND[k]?.pts||0)*(+c||1)};
 const prep=P=>{if(P.pts0==null){P.pts0=P.q.reduce((a,e)=>a+ptsOf(e),0);P.cutPts=0;P.cuts=P.cuts||[]}};
 function take(P,match,n){prep(P);const out={};let left=n;
  for(let i=P.q.length-1;i>=0&&left>0;i--){const e=P.q[i],[k,c]=e.k.split(':');if(k==='boss'||!match(k,e))continue;const m=+c||1,u=Math.min(m,left),pts=(KIND[k]?.pts||0)*u;if(P.cutPts+pts>SO.cap*P.pts0)break;
   P.cutPts+=pts;if(u===m)P.q.splice(i,1);else e.k=k+':'+(m-u);out[k]=(out[k]|0)+u;left-=u}
  P.list=P.q.map(e=>e.k);return out}
 const count=(P,match)=>P.q.reduce((a,e)=>{const[k,c]=e.k.split(':');return a+(match(k,e)?+c||1:0)},0);
 const inSec=s=>(k,e)=>sectorOf(e.brg)===s;
 function apply(P,c,w){let out={};
  if(c.src==='launch'){const s=c.sec,F=(k,e)=>FAST.includes(k)&&inSec(s)(k,e),nF=count(P,F),first=w===c.w0;
   if(P===G.next&&Z.cutFast&&first){prep(P);for(const k of FAST){const n=Z.cutFast(s,1e9,k);if(n)out[k]=n}}  /* the kill chain's cut (zombies.js) on the planned wave */
   else Object.assign(out,take(P,F,first?nF:Math.ceil(nF/2)));
   if(first){for(const k of['cruise','jet']){const M=(q,e)=>q===k&&inSec(s)(q,e),n=Math.floor(count(P,M)/2);if(n)Object.assign(out,take(P,M,n))}}}
  else if(c.src==='factory'){const M=q=>q===c.k,n=Math.max(count(P,M)?1:0,Math.round(count(P,M)*c.f));out=take(P,M,n)}
  else if(c.all){out=take(P,q=>q===c.k,1e9)}
  else out=take(P,q=>q===c.k,c.n);
  prep(P);const tidy={};for(const[k,n]of Object.entries(out))if(n>0)tidy[k]=n;if(Object.keys(tidy).length)P.cuts.push([c.label,tidy]);P.list=P.q.map(e=>e.k);return tidy}
 Z.cutPlan=(P,w)=>{for(const c of G.cuts||[])if(w>c.w0&&w<=c.w1)apply(P,c,w)};
 const fxTxt=m=>Object.entries(m).map(([k,n])=>k==='fast'?`−${n} fast missile${n>1?'s':''}`:`−${nk(k,n)}`).join(', ');
 // a new cut: applied to the next wave now (returns what it took), kept for the later waves it covers
 function cut(c){c.w0=G.wave+1;c.w1=c.w1??c.w0;(G.cuts||(G.cuts=[])).push(c);return G.next?apply(G.next,c,c.w0):{}}
 Z.cutNote=()=>{const c=G.next?.cuts;if(!c?.length)return'';return`<p class="zhint zso-cut"><b>Sorties</b>: ${c.map(([lab,m])=>`${fxTxt(m)} (${lab})`).join(' · ')}.</p>`};

 // ---------- salvage: carried until the drone is back inside the line ----------
 function carry(by,v,p){if(!by||v<=0)return;if(by===myKey()){S.carry+=v;if(p)Z.pop(p,`+${money(v)} carried`,'#ffc640')}else{CK[by]=(CK[by]|0)+v;Z.netEv?.(['S','c',by,CK[by]])}}
 function bank(){if(S.carry<=0)return;const c=S.carry;S.carry=0;if(Z.mirror){Z.req?.(['S','bank']);return}G.cash+=c;G.earned+=c;team(`<span class="cg">Salvage banked: +${money(c)}</span>${Z.online?' · '+(Z.netName?.(myKey())||''):''}`);Z.an?.say('SALVAGE BANKED','+'+money(c),'#3ddc84',2);Z.au?.coin?.()}
 function loseCarry(why){if(S.carry>0)feed(`<span class="co">${money(S.carry)} of salvage lost (${why})</span>`);S.carry=0;if(Z.mirror)Z.req?.(['S','lost'])}

 // ---------- the world's events (authority: solo or host) ----------
 W.onPart=(t,q,by)=>{if(!auth())return;const T=TGT[t.t],v=by?salv(q.t==='aa'?TGT.aa.salv:T.salv?.[q.t]||0,t.tier):0;carry(by,v,_a.set(q.x,q.y+q.h+4,q.z));
  if(t.t==='convoy'&&q.t==='truck'&&!t.cargo.all){const trucks=t.parts.filter(p=>p.main).length,per=Math.ceil(t.cargo.n/Math.max(1,trucks)),n=Math.min(per,t.cargo.left??t.cargo.n);t.cargo.left=(t.cargo.left??t.cargo.n)-n;
   const m=n>0?cut({src:'convoy',label:'convoy',k:t.cargo.k,n}):{};t.took=t.took||{};for(const[k,c]of Object.entries(m))t.took[k]=(t.took[k]|0)+c;
   if(t.parts.some(p=>p.main&&p.alive)){say(by,'TRUCK DESTROYED',Object.keys(m).length?`${fxTxt(m)} next wave`:'the next wave is already as thin as strikes can make it');team(`<span class="cg">Supply truck destroyed</span>${Object.keys(m).length?`: ${fxTxt(m)} next wave`:''}${v?` · +${money(v)} salvage`:''}`)}}
  else if(q.t==='aa'||q.t==='aat'){say(by,'AA DOWN',v?`+${money(v)} carried`:'');feed(`<span class="cg">${q.t==='aat'?'AA truck':'AA gun'} destroyed</span>`)}
  else if(q.t==='tel'&&!t.dead){const L=t.parts.filter(p=>p.main),a=L.filter(p=>p.alive).length;say(by,'LAUNCHER DESTROYED',`${a} of ${L.length} left`);feed(`<span class="cg">Launcher destroyed</span> at the ${SEC(t.sec)} launch site (${a} left)`)}};
 W.onDmg=(t,q,by)=>{if(!auth()||t.t!=='factory')return;say(by,'FACTORY HIT',`${q.max-q.hp} of ${q.max}`,'#ff9a3c')};
 W.onPat=(t,q,by)=>{if(auth())carry(by,salv(TGT.pat.salv,t.tier),q.p)};
 W.onDead=(t,by,remote)=>{if(remote||!auth())return;const T=TGT[t.t];if(T.bonus)carry(by,by?salv(T.bonus,t.tier):0,_a.set(t.x,t.y+30,t.z));
  if(t.t!=='convoy')t.rebuild=G.wave+1+(T.rebuild|0);
  if(t.t==='launch'){const m=cut({src:'launch',label:`launch site, ${SEC(t.sec)}`,sec:t.sec,w1:G.wave+2}),tx=Object.keys(m).length?fxTxt(m):'nothing from there';
   say(by,'LAUNCH SITE DESTROYED',`${SEC(t.sec)}: ${tx} next wave`,'#3ddc84');team(`<span class="cg">${SEC(t.sec)} launch site destroyed</span>: ${tx} next wave, half the fast missiles the wave after (it is rebuilt in ${T.rebuild} breaks)`)}
  else if(t.t==='factory'){const m=cut({src:'factory',label:'factory',k:t.kind,f:.35,w1:G.wave+3});say(by,'FACTORY DESTROYED',`−35% ${PL[t.kind]} for 3 waves`,'#3ddc84');
   team(`<span class="cg">Drone factory destroyed</span>: a third of the ${PL[t.kind]} stay away for 3 waves${Object.keys(m).length?` (${fxTxt(m)} next wave)`:''}`)}
  else if(t.t==='convoy'){if(t.cargo.all){const m=cut({src:'convoy',label:'convoy, delayed',k:t.cargo.k,all:1});say(by,'CONVOY DESTROYED',`the first ${PL[t.cargo.k]} come a wave later`,'#3ddc84');team(`<span class="cg">Convoy destroyed</span>: ${fxTxt(m)||'nothing'} next wave, the first ${PL[t.cargo.k]} are delayed`)}
   else{const m=t.took||{};say(by,'CONVOY DESTROYED',`${fxTxt(m)||'cargo lost'} next wave`,'#3ddc84');team(`<span class="cg">Convoy destroyed</span>: ${fxTxt(m)||'its cargo is lost'} next wave`)}}};
 W.onDeliver=t=>{if(t.seen&&auth())feed(`<span class="co">A convoy reached the ${SEC(t.sec)} front</span>: its ${PL[t.cargo.k]} fly next wave`)};
 W.onChase=(t,q,key)=>{if(key===myKey())banner('PATROL DRONE CHASING','cr',1.2);else Z.netEv?.(['S','w',key,'PATROL DRONE CHASING'])};
 W.onHit=(key,dmg,src)=>{if(key===myKey())hurt(dmg,src);else Z.netEv?.(['S','h',key,dmg,src])};
 W.onFire=(q,key)=>{if(Z.netRole?.()==='host')Z.netEv?.(['S','f',q.uid,key])};
 W.onBomb=b=>{const lv=Z.perkLevel?.('warhead')|0;api.boom(b.p,1.3);if(auth())W.blast(b.p,bombR(lv),1,b.by);else Z.req?.(['S','b',Math.round(b.p.x*10)/10,Math.round(b.p.y*10)/10,Math.round(b.p.z*10)/10,lv])};
 function hurt(dmg,src){const d=me();if(!S.on||!d||d.dead>0)return;S.hull-=dmg;Z.an?.hit?.(.7);tone(180,90,.3,.14,'sawtooth');api.FX.emit(d.p,0xffb040,24,6,.4,null,2);
  banner(S.hull>0?(src==='pat'?'PATROL DRONE HIT YOU':'AA HIT')+` · HULL ${Math.max(0,S.hull)}%`:'SHOT DOWN','cr',1.2);
  if(S.hull<=0){feed('<span class="cr">Your drone was shot down</span>');loseCarry('shot down');api.lose('shot')}}
 function kamikaze(p){const d=me();if(auth())W.blast(p.clone(),SO.kamiR,SO.kamiDmg,myKey());else Z.req?.(['S','k',Math.round(p.x),Math.round(p.y),Math.round(p.z)]);
  banner('WARHEAD','co',1.2);loseCarry('the drone went with its warhead');if(d)api.lose('det')}

 // ---------- a new break: rebuilt sites, convoys with cargo from the next wave's plan, the radar's ground circle ----------
 function cargos(){const n=G.wave>=1?1+(G.wave>=6?1:0)+(G.wave>=16?1:0):0,P=G.next;if(!n||!P)return[];const cnt={};for(const q of P.list){const[k,c]=q.split(':');if(PER_TRUCK[k])cnt[k]=(cnt[k]|0)+(+c||1)}
  const ks=Object.keys(cnt);if(!ks.length)return[];const trucks=3+(G.wave>=8?1:0)+(G.wave>=18?1:0),routes=[0,1,2].sort(()=>Math.random()-.5),out=[];
  const fresh=ks.find(k=>Z.kindFrom(k)===G.wave+1&&k!=='cruise');
  for(let i=0;i<n;i++){let k;if(i===0&&fresh){out.push({k:fresh,n:cnt[fresh],all:true,route:routes[i]});continue}
   let s=0;for(const q of ks)s+=cnt[q];let r=Math.random()*s;k=ks[0];for(const q of ks){r-=cnt[q];if(r<=0){k=q;break}}
   out.push({k,n:Math.max(1,Math.min(cnt[k],PER_TRUCK[k]*trucks)),route:routes[i%3]})}return out}
 function onBreak(){S.brk=G.wave;G.cuts=(G.cuts||[]).filter(c=>c.w1>=G.wave+1);W.auth=auth();if(W.auth)W.newBreak(G.wave,cargos());reveal(true)}
 // what pilots (and the radar) see: fog cells, sites in them, convoys and guns in sight
 function reveal(radar){const R=radarR();if(radar&&auth()){fog.reveal(PADP.x,PADP.z,R);for(const t of W.list)if(t.t==='convoy'&&Math.hypot(t.x-PADP.x,t.z-PADP.z)<R){t.seen=true;t.ls={x:t.x,z:t.z}}}
  const L=auth()?pilots():pilots().filter(p=>p.key===myKey());
  for(const p of L){const r=sight(p.d);fog.reveal(p.d.p.x,p.d.p.z,r);for(const t of W.list){if(t.t==='convoy'){if(!t.done&&Math.hypot(t.x-p.d.p.x,t.z-p.d.p.z)<r){if(!t.seen&&p.key===myKey())Z.an?.say('CONVOY SPOTTED',`${t.parts.filter(q=>q.main&&q.alive).length} trucks · ${PL[t.cargo.k]}`,'#ffc640',1);t.seen=true;t.ls={x:t.x,z:t.z}}}
    for(const q of t.parts)if(q.aa&&q.alive&&Math.hypot(q.x-p.d.p.x,q.z-p.d.p.z)<r)q.seen=true}}
  for(const t of W.list)if(t.t!=='convoy'&&!t.known&&fog.known(t.x,t.z)){t.known=true;W.ver++;if(S.on)Z.an?.say(t.t==='launch'?'LAUNCH SITE FOUND':'FACTORY FOUND',`${SEC(t.sec)} · ${TIER[t.tier]}`,'#ffc640',1)}}

 // ---------- the sortie: launch, the clock, home, the end ----------
 const padOf=()=>FOBS[cl(S.pad|0,0,FOBS.length-1)];
 function toPad(d){const f=padOf(),h=d.home;if(!h?.mat||!f.mat||h===f)return;const dy=d.p.y-h.mat.y;d.home=f;d.p.set(f.mat.x,f.mat.y+dy,f.mat.z);const o=W.list.find(t=>t.id===S.obj);if(o)d.q.setFromAxisAngle(_a.set(0,1,0),Math.atan2(f.x-o.x,f.z-o.z))}
 function launch(pad){if(!avail()||Z.isReady?.())return false;if(pad!=null)S.pad=pad;else{const o=W.list.find(t=>t.id===S.obj);if(o){let b=1,bd=1e9;FOBS.forEach((f,i)=>{const d=Math.hypot(f.x-o.x,f.z-o.z);if(d<bd){bd=d;b=i}});S.pad=b}}
  Object.assign(S,{on:true,t:SO.clock,hull:SO.hull,bombs:bombsMax(),carry:0,used:G.wave,home:true,alive:true,lastT:0});Z.base.close();banner('');Z.an?.sumHide?.();Z.an?.radioClear?.();api.launch();const d=me();if(d){toPad(d);S.lastT=d.t}
  Z.an?.say('SORTIE',`${fmt(SO.clock)} · F drops a bomb · back inside the line in time`,'#ffc640',2);feed(`Sortie from <b>${padOf().n}</b>: ${fmt(SO.clock)} on the clock. F drops a bomb (${SO.bombs} a drone), the last F is your warhead. Salvage is banked inside the line.`);
  hud();return true}
 function end(late){if(!S.on)return;S.on=false;S.used=G.wave;S.lock=0;hud();if(late)return;if(G.on&&G.state==='base'){Z.base.open();Z.base.setTab('sortie')}}
 function finish(){const d=me(),alive=d&&d.dead<=0;
  if(alive&&S.home){bank();feed('<span class="cg">Sortie over: back inside the line</span>');end(false);return}
  Z.an?.say('TOO LATE','drone and salvage lost','#ff4d4d',2);feed('<span class="cr">Sortie clock ran out outside the line: drone and salvage lost</span>');loseCarry('late');if(alive)api.lose('late');
  if(!Z.online){end(true);Z.continue();return}end(false)}
 Z.so.launch=launch;Z.so.end=()=>{if(S.on&&S.home)finish()};Z.so.finish=finish;
 const h0=Z.hold;Z.hold=()=>h0()&&!S.on;
 Z.lq=(d,q)=>{if(!S.on)return q;const h=Math.hypot(d.p.x-d.home.x,d.p.z-d.home.z);return Math.max(q,.94-.3*sm((h-3000)/2500))};  // a relay keeps the video link up on sorties
 // F on a sortie: a bomb while there are any, then the warhead
 const dt0=Z.detonate;Z.detonate=()=>{if(!S.on||G.state!=='base')return dt0();const d=me();if(!d||d.dead>0)return;
  if(S.bombs>0){S.bombs--;W.drop(_a.copy(d.p).add(_b.set(0,-.5,0)),d.v,myKey());tone(520,260,.12,.08,'square');banner(`BOMB AWAY · ${S.bombs} LEFT`,'co',.8);return}kamikaze(d.p)};
 function mine(dt){const d=me();if(!d)return;const alive=d.dead<=0;
  if(alive&&(!S.alive||d.t+1e-6<S.lastT)){if(S.alive&&S.carry>0)loseCarry('relaunched');S.hull=SO.hull;S.bombs=bombsMax();toPad(d)}
  if(S.alive&&!alive)loseCarry('drone lost');S.alive=alive;S.lastT=alive?d.t:0;
  if(alive){S.home=W.isHome(d.p.x,d.p.z);if(S.home&&S.carry>0)bank();const q=W.inside(d.p);if(q){kamikaze(d.p);return}}
  if((S.t-=dt)<=0)finish()}
 // co-op: the wave started (all ready, or the host) while this pilot was out
 function startedOut(){const out=!S.home;end(true);if(out){Z.an?.say('TOO LATE','the wave started: drone and salvage lost','#ff4d4d',2);loseCarry('late');if(me()?.dead<=0)api.lose('late')}else bank()}

 // ---------- per step ----------
 const st0=Z.step;Z.step=dt=>{st0(dt);if(!G.on)return;W.auth=auth();
  if(S.on&&G.state!=='base')startedOut();
  if(S.on)mine(dt);
  const live=G.state==='base'&&(S.on||pilots().some(p=>!W.isHome(p.d.p.x,p.d.p.z)));W.step(dt,live?pilots():[],live);if(live&&!auth())W.look(pilots());
  if((S.revT-=dt)<=0){S.revT=.25;reveal(false)}
  let lk=0;for(const t of W.list)for(const q of t.parts)if(q.aa&&q.alive&&q.tk===myKey()&&q.lock>0)lk=1;S.lock=lk||S.tw};
 // co-op host on the base screen (its sim holds there): the enemy side still runs, in real time, while another pilot is out on a sortie
 const vi0=Z.visuals;Z.visuals=dt=>{vi0(dt);W.root.visible=G.on;if(!G.on)return;const now=performance.now(),rdt=Math.min(.05,(now-(S.vt||now))/1000);S.vt=now;
  if(Z.netRole?.()==='host'&&G.state==='base'&&Z.hold()&&rdt>0){W.auth=true;const P=pilots();if(P.some(p=>!W.isHome(p.d.p.x,p.d.p.z)))W.step(rdt,P,true);if((S.revH=(S.revH||0)-rdt)<=0){S.revH=.25;reveal(false)}}
  W.visuals(dt||rdt*(Z.hold()?1:0))};
 // the break starts when the base screen opens for a new wave number (also on a co-op client); a return from a sortie reopens it too
 const op0=Z.base.open;Z.base.open=()=>{if(G.on&&S.brk!==G.wave)onBreak();op0()};
 const zs0=Z.start;Z.start=()=>{S.on=false;S.used=-1;S.brk=-1;S.carry=0;S.obj=0;G.cuts=[];for(const k in CK)delete CK[k];fog.reset();W.reset(1+Math.floor(Math.random()*2e9));zs0()};
 const zx0=Z.stop;Z.stop=()=>{S.on=false;zx0();W.root.visible=false;hud()};
 const k0=Z.key;Z.key=e=>{if(S.on&&Z.base.el.hidden&&(e.code==='Enter'||e.code==='NumpadEnter')){if(S.home)finish();else banner('GET BACK INSIDE THE LINE FIRST','co',1);return true}return k0(e)};
 const p0=Z.pad;Z.pad=e=>{if(S.on&&Z.base.el.hidden&&S.home&&e(3)){finish();return true}return p0(e)};

 // ---------- HUD: clock, hull, bombs, salvage carried, inside / outside the line, AA lock ----------
 const hudEl=document.createElement('div');hudEl.id='zso';hudEl.hidden=true;$('zhud').append(hudEl);let hudS='';
 function hud(){if(!S.on){if(!hudEl.hidden){hudEl.hidden=true;hudS=''}return}hudEl.hidden=false;const d=me(),low=S.t<20&&!S.home;
  const s=`<div class="zso1"><span class="${low?'lo':''}">SORTIE ${fmt(S.t)}</span><span class="hull"><i style="width:${cl(S.hull,0,100)}%" class="${S.hull<40?'lo':''}"></i><em>HULL ${Math.max(0,S.hull)}%</em></span><span>BOMBS ${'●'.repeat(S.bombs)}${'○'.repeat(Math.max(0,bombsMax()-S.bombs))}</span><span class="cy">CARRY ${money(S.carry)}</span></div>
   <div class="zso2 ${S.home?'in':'out'}">${d&&d.dead>0?'DRONE LOST · RELAUNCHING':S.home?'INSIDE THE LINE · ENTER / Y ENDS THE SORTIE':`OUTSIDE THE LINE · ${(Math.max(0,W.dHome(d.p.x,d.p.z)-SO.homeR)/1000).toFixed(1)} km back`}${S.lock?' · <b class="cr">AA TRACKING</b>':''}</div>`;
  if(s!==hudS)hudEl.innerHTML=hudS=s}
 const hu0=Z.hud;Z.hud=dt=>{hu0(dt);hud();if(S.on&&S.lock&&(S.lockT-=dt||.016)<=0){S.lockT=.45;tone(1250,1250,.05,.05,'square')}};

 // ---------- 3D overlay: known targets, guns, patrols, the objective, the CCIP pipper, the way home ----------
 const ov0=Z.overlay;Z.overlay=oc=>{ov0(oc);if(!G.on||G.state!=='base'||!S.on)return;const cam=api.camera,Wd=innerWidth,Ht=innerHeight,d=me();
  const scr=p=>{_c.copy(p).project(cam);return _c.z<1&&Math.abs(_c.x)<1.05&&Math.abs(_c.y)<1.05?[(_c.x*.5+.5)*Wd,(-_c.y*.5+.5)*Ht]:null};
  oc.save();oc.textAlign='center';oc.shadowColor='#000';oc.shadowBlur=4;oc.font='700 12px "JetBrains Mono",monospace';
  for(const t of W.list){if(t.t==='convoy'?!t.seen||t.done:!t.known)continue;const dist=Math.hypot(t.x-cam.position.x,t.z-cam.position.z);if(dist>6000)continue;
   const q=scr(_a.set(t.x,(t.y??gh(t.x,t.z))+(t.t==='factory'?34:16),t.z));if(!q)continue;const M=t.parts.filter(p=>p.main),a=M.filter(p=>p.alive).length;
   oc.fillStyle=t.dead?'#9aa0a8':t.id===S.obj?'#ffe23c':'#ffb070';oc.fillText(`${t.t==='convoy'?'CONVOY':t.t==='launch'?'LAUNCH SITE':'FACTORY'} ${t.dead?'DESTROYED':t.t==='factory'?`${M[0]?.max-M[0]?.hp}/${M[0]?.max} HITS`:`${a}/${M.length}`} · ${dist<1000?Math.round(dist)+' m':(dist/1000).toFixed(1)+' km'}`,q[0],q[1])}
  for(const t of W.list){for(const g of t.parts){if(!g.aa||!g.alive||!g.seen)continue;const q=scr(_a.set(g.x,g.y+4,g.z));if(!q)continue;oc.strokeStyle=oc.fillStyle='#ff4d4d';oc.lineWidth=1.5;oc.strokeRect(q[0]-6,q[1]-6,12,12);oc.fillText(g.tk===myKey()&&g.lock>0?'AA LOCK':'AA',q[0],q[1]-10)}
   for(const g of t.pats){if(g.st==='dead'||!d||g.p.distanceTo(d.p)>1800)continue;const q=scr(g.p);if(!q)continue;oc.strokeStyle=oc.fillStyle='#ff4d4d';oc.beginPath();oc.arc(q[0],q[1],9,0,7);oc.stroke();oc.fillText(g.st==='chase'?'PATROL ▲':'PATROL',q[0],q[1]-14)}}
  const o=W.list.find(t=>t.id===S.obj&&!t.dead);if(o){_a.set(o.x,(o.y??gh(o.x,o.z))+8,o.z);_c.copy(_a).project(cam);let x=_c.x,y=_c.y;const bh=_c.z>1;if(bh){x=-x;y=-y}oc.strokeStyle=oc.fillStyle='#ffe23c';oc.lineWidth=2;
   if(!bh&&Math.abs(x)<.95&&Math.abs(y)<.92){const X=(x*.5+.5)*Wd,Y=(-y*.5+.5)*Ht;oc.beginPath();oc.moveTo(X,Y-12);oc.lineTo(X+12,Y);oc.lineTo(X,Y+12);oc.lineTo(X-12,Y);oc.closePath();oc.stroke()}
   else{const m=Math.max(Math.abs(x)/.88,Math.abs(y)/.8,1e-3);x/=m;y/=m;const X=(x*.5+.5)*Wd,Y=(-y*.5+.5)*Ht;oc.save();oc.translate(X,Y);oc.rotate(Math.atan2(-y,x));oc.beginPath();oc.moveTo(14,0);oc.lineTo(-6,-10);oc.lineTo(-1,0);oc.lineTo(-6,10);oc.closePath();oc.fill();oc.restore();oc.fillText('TARGET',X,Y+24)}}
  if(d&&d.dead<=0&&S.bombs>0&&W.ccip(d.p,d.v,_b)&&_b.distanceTo(d.p)<900){const q=scr(_b);if(q){const R=bombR(Z.perkLevel?.('warhead')|0);let on=false;for(const t of W.list)for(const g of t.parts)if(g.alive&&Math.hypot(g.x-_b.x,g.z-_b.z)-g.r<R)on=true;
    oc.strokeStyle=on?'#3ddc84':'#fff';oc.lineWidth=2;oc.beginPath();oc.arc(q[0],q[1],10,0,7);oc.moveTo(q[0]-2,q[1]);oc.lineTo(q[0]+2,q[1]);oc.stroke();oc.fillStyle=oc.strokeStyle;oc.fillText(on?'BOMB ON TARGET':'BOMB',q[0],q[1]+24)}}
  if(d&&d.dead<=0&&!S.home){let b=null,bd=1e9;for(const h of W.HOME){const q=Math.hypot(h.x-d.p.x,h.z-d.p.z);if(q<bd){bd=q;b=h}}if(b){_c.set(b.x,gh(b.x,b.z)+30,b.z).project(cam);let x=_c.x,y=_c.y;if(_c.z>1){x=-x;y=-y}const m=Math.max(Math.abs(x)/.9,Math.abs(y)/.85,1);x/=m;y/=m;
   oc.fillStyle=S.t<20?'#ff4d4d':'#3ddc84';oc.fillText(`◆ LINE ${((bd-SO.homeR)/1000).toFixed(1)} km`,(x*.5+.5)*Wd,(-y*.5+.5)*Ht)}}
  oc.restore()};

 // ---------- radar: unexplored ground (between waves), known sites, seen convoys, patrols ----------
 const icon=(rc,t,q,a=1)=>{rc.globalAlpha=a;rc.strokeStyle=rc.fillStyle=t.dead?'#7a7f88':t.id===S.obj?'#ffe23c':'#ffb070';rc.lineWidth=2;rc.beginPath();
  if(t.t==='launch'){rc.moveTo(q[0],q[1]-8);rc.lineTo(q[0]+7,q[1]+6);rc.lineTo(q[0]-7,q[1]+6);rc.closePath();rc.stroke()}else if(t.t==='factory'){rc.strokeRect(q[0]-7,q[1]-5,14,10);rc.moveTo(q[0]-7,q[1]-5);rc.lineTo(q[0],q[1]-10);rc.lineTo(q[0]+7,q[1]-5);rc.stroke()}
  else{rc.fillRect(q[0]-5,q[1]-3,10,6)}rc.globalAlpha=1};
 const rd0=Z.radar;Z.radar=(rc,P,sel,K)=>{if(G.on&&G.state==='base')fog.drawRadar(rc,P,.55);rd0(rc,P,sel,K);if(!G.on)return;const a=G.state==='base'?1:.45;
  for(const t of W.list){if(t.t==='convoy'){if(!t.seen||t.done)continue;const q=P(t.ls?.x??t.x,t.ls?.z??t.z);icon(rc,t,q,a)}else if(t.known)icon(rc,t,P(t.x,t.z),a)}
  if(S.on)for(const t of W.list)for(const g of t.pats)if(g.st==='chase'){const q=P(g.p.x,g.p.z);rc.fillStyle='#ff4d4d';rc.fillRect(q[0]-3,q[1]-3,6,6)}};
 Z.mapFog=(g,mx,mz)=>{fog.drawMap(g,mx,mz,.72);g.font='700 10px "JetBrains Mono",monospace';g.textAlign='center';for(const t of W.list)if(t.t!=='convoy'&&t.known&&!t.dead){const X=mx(t.x),Y=mz(t.z);if(X<0||Y<0||X>640||Y>520)continue;icon(g,t,[X,Y])}};

 // ---------- strike orders from the base screen: a few attack drones at a known target; its defences down some, no salvage ----------
 function strike(id,by){const t=W.list.find(u=>u.id===id),c=strikeCost();if(!t||t.dead||t.done||t.struck===G.wave||G.cash<c||G.state!=='base')return null;if(t.t==='convoy'?!t.seen:!t.known)return null;
  G.cash-=c;t.struck=G.wave;const aa=t.parts.filter(q=>q.aa&&q.alive).length,p=cl(.9-.14*aa-.1*t.pats.length,.25,.9),n=SO.strike.drones+(G.wave>=20?1:0);let hits=0;for(let i=0;i<n;i++)if(Math.random()<p)hits++;
  for(let i=0;i<hits;i++){const q=t.parts.find(x=>x.main&&x.alive);if(!q)break;q.hp-=1;if(q.hp<=0){W.wreck(t,q,true);W.onPart(t,q,null)}else W.onDmg(t,q,null);if(!t.parts.some(x=>x.main&&x.alive)&&!t.dead){t.dead=true;W.onDead(t,null)}}
  W.ver++;const nm=TGT[t.t].n.toLowerCase();team(`${by?`<b>${by}</b> ordered a strike`:'Strike'} on the ${nm} (${money(c)}): <span class="${hits?'cg':'co'}">${hits} of ${n} drones got through</span>`);return hits}
 Z.so.strike=strike;

 // ---------- the Sortie tab: launch, known targets with what destroying them does, strikes; a wide map with the fog ----------
 const effect=t=>{const P=G.next;if(!P)return'';const L=P.list,cn=k=>L.reduce((a,q)=>{const[x,c]=q.split(':');return a+(x===k?+c||1:0)},0);
  if(t.t==='convoy'){const k=t.cargo.k;return t.cargo.all?`carries the first ${PL[k]}: destroy it and they come a wave later`:`carries ${nk(k,t.cargo.left??t.cargo.n)} for wave ${G.wave+1}: each truck you destroy takes its share out`}
  if(t.t==='launch'){const f=Z.fastPlan?.()?.[t.sec],fn=f?.total|0,q=P.q?.filter(e=>sectorOf(e.brg)===t.sec)||[],cj=q.filter(e=>e.k==='cruise'||e.k==='jet').length;
   if(!fn&&!cj)return`nothing launches from the ${SEC(t.sec)} next wave. Destroyed, it is down for 2 breaks: half the ${SEC(t.sec)} fast missiles the wave after`;
   return`next wave from the ${SEC(t.sec)}: ${fn?`${fn} fast missile${fn>1?'s':''}, `:''}${cj} jets / cruise. Destroyed: ${fn?`all ${fn} fast missiles and `:''}half the jets / cruise stay home, then half the fast missiles the wave after`}
  return`builds ${PL[t.kind]} (${cn(t.kind)} next wave). Destroyed: a third of them stay away for 3 waves`};
 const defTxt=t=>{const aa=t.parts.filter(q=>q.aa&&q.alive),sa=aa.filter(q=>q.seen).length,pa=t.pats.filter(q=>q.st!=='dead').length;return`${aa.length?`AA ×${sa}${sa<aa.length?'+?':''}`:'no AA seen'}${pa?` · ${pa} patrol${pa>1?'s':''}`:''}`};
 const status=t=>{const M=t.parts.filter(p=>p.main),a=M.filter(p=>p.alive).length;return t.dead?'destroyed':t.done?'delivered':t.t==='factory'?`${M[0].max-M[0].hp}/${M[0].max} hits`:t.t==='convoy'?`${a} truck${a===1?'':'s'}`:`${a}/${M.length} launchers`};
 const salvOf=t=>{let v=0;for(const q of t.parts)if(q.alive)v+=salv(q.aa?TGT.aa.salv:TGT[t.t].salv?.[q.t]||0,t.tier);return v+salv(TGT[t.t].bonus||0,t.tier)};
 const known=()=>W.list.filter(t=>t.t==='convoy'?t.seen&&!t.done:t.known).sort((a,b)=>(a.dead-b.dead)||W.depth(a.x,a.z)-W.depth(b.x,b.z));
 function html(){const can=avail()&&!Z.isReady?.(),c=strikeCost(),K=known(),sel=W.list.find(t=>t.id===S.obj);
  const why=!G.on?'':G.wave<SO.from?`Sorties open after wave ${SO.from}.`:S.used===G.wave?'You have flown your sortie this break.':Z.isReady?.()?'You are marked ready: unready to fly a sortie.':'';
  let h=`<div class="zso-l"><button class="go" data-so="go" ${can?'':'disabled'}>Launch sortie ▸ ${fmt(SO.clock)}</button><span class="zso-pads">${FOBS.map((f,i)=>`<button class="sm ${S.pad===i?'on':''}" data-so="pad:${i}">${f.n.replace('POS ','')}</button>`).join('')}</span></div>
   <p class="zhint">${why?`<b>${why}</b> `:''}Fly past the line, find what feeds the next waves and bomb it: <b>F</b> drops a bomb (${SO.bombs} a drone, aim with the pipper), the last F is your warhead. Salvage is carried: it is banked when you are back inside the line. Shot down or late, it is lost. ${Z.online?'The clock is yours; if the wave starts while you are out, the drone and salvage are lost.':'When the clock runs out outside the line the wave starts without you.'}</p>`;
  h+=`<h3>Known targets · ${K.filter(t=>!t.dead).length}</h3>`;
  if(!K.length)h+=`<p class="zhint">Nothing found yet. The radar watches ${(radarR()/1000).toFixed(1)} km of ground around the pad (Long-range radar widens it); fly out to find the rest. The deeper the site, the more it pays and the better it is defended.</p>`;
  h+=K.map(t=>{const T=TGT[t.t],dd=Math.hypot(t.x-padOf().x,t.z-padOf().z),ok=!t.dead&&t.struck!==G.wave&&G.cash>=c&&G.state==='base';
   return`<div class="zitem zso-t ${t.id===S.obj?'on':''} ${t.dead?'lock':''}"><span class="zg">${T.g}</span><div class="zid"><b>${T.n}</b><em>${SEC(t.sec).toUpperCase()} · ${TIER[t.tier].toUpperCase()}</em>
    <p>${status(t)} · ${(dd/1000).toFixed(1)} km from ${padOf().n.replace('POS ','')} · ${defTxt(t)}${t.dead?'':` · salvage ~${money(salvOf(t))}`}${t.t==='convoy'&&t.ls?' · last seen on its road':''}</p>${t.dead?'':`<p class="zso-fx">${effect(t)}</p>`}</div>
    <div class="zso-b">${t.dead?'':`<button class="sm ${t.id===S.obj?'on':''}" data-so="aim:${t.id}">${t.id===S.obj?'Target ✓':'Target'}</button><button class="sm" data-so="st:${t.id}" ${ok?'':'disabled'} title="A few attack drones; its defences down some. No salvage.">${t.struck===G.wave?'Struck':`Strike ${money(c)}`}</button>`}</div></div>`}).join('');
  const cs=[...new Set((G.cuts||[]).filter(x=>x.w1>=G.wave+1).map(x=>`${x.label}: wave${x.w1>Math.max(G.wave+1,x.w0)?`s ${Math.max(G.wave+1,x.w0)}–${x.w1}`:` ${x.w1}`}`))];
  if(cs.length)h+=`<h3>Strikes in effect</h3><p class="zhint">${cs.join(' · ')}. A wave never loses more than ${Math.round(SO.cap*100)}% of its threat to strikes.</p>`;
  return h}
 function wire(el){for(const b of el.querySelectorAll('[data-so]'))b.onclick=()=>{const[a,v]=b.dataset.so.split(':');
  if(a==='go')launch();else if(a==='pad'){S.pad=+v;Z.base.refresh()}else if(a==='aim'){S.obj=S.obj===+v?0:+v;Z.base.refresh()}
  else if(a==='st'){if(Z.mirror)Z.req?.(['S','st',+v]);else strike(+v,Z.online?Z.netName?.(myKey()):null);Z.base.refresh()}}}
 // the wide map: x -4.5..4.5 km, z -4.5..2.25 km (the whole north and both flanks)
 const FX0=-4500,FX1=4500,FZ0=-4500,FZ1=2250;let bgC=null,homeC=null;
 function map(g,MW,MH){const fx=x=>(x-FX0)/(FX1-FX0)*MW,fz=z=>(z-FZ0)/(FZ1-FZ0)*MH;
  if(!bgC){const src=api.groundTex.image,TW=9000,KP=src.width/TW;bgC=document.createElement('canvas');bgC.width=MW*2;bgC.height=MH*2;const b=bgC.getContext('2d');b.drawImage(src,(FX0+TW/2)*KP,(FZ0+TW/2)*KP,(FX1-FX0)*KP,(FZ1-FZ0)*KP,0,0,bgC.width,bgC.height);b.fillStyle='rgba(6,10,18,.4)';b.fillRect(0,0,bgC.width,bgC.height)}
  g.drawImage(bgC,0,0,MW,MH);
  if(!homeC){homeC=document.createElement('canvas');homeC.width=MW*2;homeC.height=MH*2;const h=homeC.getContext('2d');h.scale(2,2);const r=SO.homeR/(FX1-FX0)*MW;h.fillStyle='#3ddc84';for(const p of W.HOME){h.beginPath();h.arc(fx(p.x),fz(p.z),r+1.5,0,7);h.fill()}
   h.globalCompositeOperation='destination-out';for(const p of W.HOME){h.beginPath();h.arc(fx(p.x),fz(p.z),r-.5,0,7);h.fill()}}
  for(const r of W.routes){g.strokeStyle='rgba(150,140,115,.85)';g.lineWidth=2;g.beginPath();r.X.forEach((x,i)=>g.lineTo(fx(x),fz(r.Z[i])));g.stroke()}
  fog.drawMap(g,fx,fz,.8);g.drawImage(homeC,0,0,MW,MH);
  {const r=radarR()/(FX1-FX0)*MW;g.strokeStyle='rgba(95,227,255,.4)';g.setLineDash([4,5]);g.lineWidth=1;g.beginPath();g.arc(fx(PADP.x),fz(PADP.z),r,0,7);g.stroke();g.setLineDash([])}
  const C=W.SITE_C;g.strokeStyle='rgba(255,255,255,.14)';g.setLineDash([3,6]);for(const b of[-.43,.43]){g.beginPath();g.moveTo(fx(C.x),fz(C.z));g.lineTo(fx(C.x+Math.sin(b)*9000),fz(C.z-Math.cos(b)*9000));g.stroke()}g.setLineDash([]);
  g.font='700 11px "JetBrains Mono",monospace';g.textAlign='center';g.fillStyle='rgba(220,230,255,.55)';for(const[i,b,r]of[[0,-1,4300],[1,0,5600],[2,1,4300]])g.fillText(SEC(i).toUpperCase(),fx(C.x+Math.sin(b)*r),Math.max(14,fz(C.z-Math.cos(b)*r)));
  for(const b of G.next?.brgs||[]){const x=C.x+Math.sin(b)*5200,z=C.z-Math.cos(b)*5200,X=cl(fx(x),12,MW-12),Y=cl(fz(z),12,MH-12),a=Math.atan2(fz(C.z)-Y,fx(C.x)-X);g.save();g.translate(X,Y);g.rotate(a);g.fillStyle='rgba(255,77,77,.85)';g.beginPath();g.moveTo(14,0);g.lineTo(-7,-9);g.lineTo(-3,0);g.lineTo(-7,9);g.closePath();g.fill();g.restore()}
  for(const s of SITES){g.fillStyle=s.hp>0?'#7fd0ff':'#555b66';g.fillRect(fx(s.x)-5,fz(s.z)-5,10,10)}g.strokeStyle='#ffc640';g.lineWidth=2;g.strokeRect(fx(PADP.x)-4,fz(PADP.z)-4,8,8);
  FOBS.forEach((f,i)=>{g.strokeStyle=g.fillStyle=i===S.pad?'#3ddc84':'rgba(61,220,132,.6)';g.lineWidth=i===S.pad?2.5:1.5;g.beginPath();g.moveTo(fx(f.x),fz(f.z)-7);g.lineTo(fx(f.x)+7,fz(f.z)+5);g.lineTo(fx(f.x)-7,fz(f.z)+5);g.closePath();g.stroke()});
  for(const t of W.list){if(t.t!=='convoy'||!t.seen)continue;const r=W.routes[t.route];g.strokeStyle='rgba(255,198,64,.75)';g.lineWidth=2;g.setLineDash([6,5]);g.beginPath();r.X.forEach((x,i)=>g.lineTo(fx(x),fz(r.Z[i])));g.stroke();g.setLineDash([]);
   const p=t.ls||t;icon(g,t,[fx(p.x),fz(p.z)]);g.fillStyle='#ffd77a';g.fillText(t.done?'delivered':t.dead?'destroyed':'last seen',fx(p.x),fz(p.z)-9)}
  for(const t of W.list){if(t.t==='convoy'||!t.known)continue;const X=fx(t.x),Y=fz(t.z);for(const q of t.parts)if(q.aa&&q.alive&&q.seen){g.fillStyle='#ff4d4d';g.fillRect(fx(q.x)-1.5,fz(q.z)-1.5,3,3)}icon(g,t,[X,Y]);
   if(t.dead){g.strokeStyle='#9aa0a8';g.beginPath();g.moveTo(X-6,Y-6);g.lineTo(X+6,Y+6);g.moveTo(X+6,Y-6);g.lineTo(X-6,Y+6);g.stroke()}g.fillStyle=t.dead?'#9aa0a8':'#ffd7b0';g.fillText(t.t==='launch'?'LAUNCH':'FACTORY',X,Y+18)}
  const o=W.list.find(t=>t.id===S.obj);if(o){const p=o.t==='convoy'?o.ls||o:o;g.strokeStyle='#ffe23c';g.lineWidth=2;g.beginPath();g.arc(fx(p.x),fz(p.z),13,0,7);g.stroke()}}
 function click(x,y,MW,MH){const fx=X=>(X-FX0)/(FX1-FX0)*MW,fz=Z2=>(Z2-FZ0)/(FZ1-FZ0)*MH;let b=null,bd=22;for(const t of known()){if(t.dead)continue;const p=t.t==='convoy'?t.ls||t:t,d=Math.hypot(fx(p.x)-x,fz(p.z)-y);if(d<bd){bd=d;b=t}}if(b){S.obj=b.id;Z.base.refresh()}}
 const legend=()=>'<span><i class="ls"></i>your sites</span><span><i class="lso-in"></i>inside the line</span><span><i class="lso-fog"></i>unexplored</span><span><i class="lso-t"></i>known target</span><span><i class="lso-r"></i>last-seen convoy road</span><span><i class="lso-aa"></i>AA gun</span><span><i class="lt"></i>next wave\'s approach</span>';
 Z.xTab={id:'sortie',n:'Sortie',html,wire,map,click,legend};

 // ---------- co-op: the host's world, fog and carried salvage; clients' bombs and requests ----------
 let wv=-1,wT=0,fv=-1,fT=0;
 Z.so.netOut=now=>{const o={};if(W.ver!==wv||now-wT>3000){wv=W.ver;wT=now;o.w=W.ser()}if(fog.ver!==fv||now-fT>3000){fv=fog.ver;fT=now;o.f=fog.pack()}
  if(G.state==='base'&&pilots().some(p=>!W.isHome(p.d.p.x,p.d.p.z))){o.d=W.dyn();const tw={};for(const t of W.list)for(const q of t.parts)if(q.aa&&q.alive&&q.tk&&q.lock>0)tw[q.tk]=1;o.d.tw=tw}
  o.cu=(G.cuts||[]).map(c=>[c.label,c.w0,c.w1]);return o};
 Z.so.netIn=o=>{if(!o||typeof o!=='object')return;W.auth=false;if(o.w)W.des(o.w);if(o.f)fog.unpack(o.f);if(o.d){W.dynIn(o.d);S.tw=o.d.tw&&o.d.tw[myKey()]?1:0}
  if(Array.isArray(o.cu))G.cuts=o.cu.filter(Array.isArray).map(a=>({label:String(a[0]).replace(/[<>&]/g,'').slice(0,40),w0:a[1]|0,w1:a[2]|0}))};
 Z.so.netReq=(k,e,nm)=>{const T=e[1],p=new V3(+e[2]||0,+e[3]||0,+e[4]||0);
  if(T==='b'&&G.state==='base'){if([e[2],e[3],e[4]].every(Number.isFinite))W.blast(p,bombR(cl(e[5]|0,0,3)),1,k)}
  else if(T==='k'&&G.state==='base'){if([e[2],e[3],e[4]].every(Number.isFinite))W.blast(p,SO.kamiR,SO.kamiDmg,k)}
  else if(T==='bank'){const c=CK[k]|0;CK[k]=0;if(c>0){G.cash+=c;G.earned+=c;team(`<span class="cg">Salvage banked: +${money(c)}</span> · <b>${nm}</b>`)}Z.netEv?.(['S','c',k,0])}
  else if(T==='lost'){CK[k]=0;Z.netEv?.(['S','c',k,0])}
  else if(T==='st')strike(e[2]|0,nm)};
 Z.so.netEv=e=>{const T=e[0],mine=e[1]===myKey();
  if(T==='h'&&mine)hurt(+e[2]||0,String(e[3]));else if(T==='c'&&mine)S.carry=Math.max(0,+e[2]||0);else if(T==='a'&&mine)Z.an?.say(String(e[2]).slice(0,40),String(e[3]||'').slice(0,80),String(e[4]||'#ffc640').slice(0,9),2);
  else if(T==='w'&&mine)banner(String(e[2]).slice(0,40),'cr',1.2);
  else if(T==='f'){const q=W.list.flatMap(t=>t.parts).find(x=>x.uid===e[1]),d=(Z.pilotsK?.()||[]).find(([k])=>k===e[2])?.[1];if(q&&d)W.burst(q,d.p,d.v,false)}};

 // ---------- harness (tools/zombies-test.mjs, tools/zbot.mjs) ----------
 if(window.__z)window.__z.so={S,W,fog,SO,TGT,launch,finish,strike,known,cut,apply,reveal,hurt,bombR,
  // fly the drone kinematically to (x, z) at height agl (m above ground) and speed v, stepping the sim; stop early when stop() says so
  fly(x,z,agl=60,v=100,stop){const d=me();if(!d||d.dead>0)return false;const h=1/30;for(let i=0;i<6000;i++){if(!S.on||d.dead>0)return false;const dx=x-d.p.x,dz=z-d.p.z,L=Math.hypot(dx,dz);if(L<v*h*1.5||stop?.())return true;
    const y=gh(d.p.x+dx/L*20,d.p.z+dz/L*20)+agl;d.v.set(dx/L*v,(y-d.p.y)*2,dz/L*v);d.q.setFromAxisAngle(_c.set(0,1,0),Math.atan2(-dx,-dz));d.p.addScaledVector(d.v,h);d.mah=0;window.__z.sim(h)}return false},
  // keep the drone where it is for sec seconds of sim (the sim's physics would drop it)
  hold(sec,v){const d=me();if(!d)return false;const p=d.p.clone(),h=1/30;for(let i=0;i<sec/h;i++){if(d.dead>0)return false;d.p.copy(p);d.v.copy(v||_c.set(0,0,0));d.mah=0;window.__z.sim(h)}return true},
  // a bomb released now from (x, y, z) with velocity (vx, vy, vz)
  drop(x,y,z,vx=0,vy=0,vz=0){W.drop(new V3(x,y,z),new V3(vx,vy,vz),myKey())}};
 return Z.so}
