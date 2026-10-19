// Interceptor Zombies co-op: 2-4 pilots in one game over the engine's rooms (engine/net.js: the claude.ai room, PeerJS p2p elsewhere, or the
// ?netloop test loopback). Same pattern as Drone League online (src/net/net.js): star topology through the host, everything carried in presence.
//
// Authority. The host runs the whole Zombies world: the wave director, every track, the helpers and their shots, the sites, the shared purse,
// the weather plan. Every pilot flies their own interceptor locally and sends its state. A client's detonation is measured on the client against
// the tracks as that pilot saw them (miss distance and closing speed per track in range) and sent to the host, which rolls the kill / damage /
// miss with the same rules as solo, applies it and sends the result back; a swept direct hit on a fast track is reported the same way. Shop
// purchases, repairs, sales, upgrades and active perks from clients are requests the host checks against the purse and applies.
//
// Messages (presence objects, merged per pilot):
//  every pilot, 20 Hz (the host 10 Hz): n name, s [pos 2 dp, quat 3 dp, vel 1 dp], d dead, rk rocket burning, sl track it is running down (flying, within
//   1.5 km, shown to the others as claimed by that pilot), sk streak, rd ready for wave N, lt joined mid-wave, es last host event seen,
//   ev (clients) [seq, type, ...] requests until the host acks them
//  host, g = snapshot every 100 ms (up to 250 ms in big waves): state, wave, purse, sites, wind, tracks T [id, kind, x y z in dm, vx vy vz in m/s,
//   flags, phase(, boss stages)], their static part TS [id, site, aim x y z, swarm group, shade] when new and once a second, helper shots S and
//   defences D (zdef.js netOut), events ev [id, type, ...] (b explosion, k kill + who, i impact, g gun burst, f team feed, m note to one pilot),
//   per-pilot perks, detonation results dr, acks ak, roster pl, the next wave's plan nx, rejected pilots rj
// Clients dead-reckon tracks and shots from position + velocity and pull toward each snapshot; other pilots' drones are interpolated the same way.
//
// Money: one shared purse. Everything you can buy is shared (helpers, repairs, the team perks Long-range radar and Foreign Aid) or helps the
// team (your own perks), most income in later waves is helper kills that belong to nobody, and the big items (Iron Dome $4,200, Golden Dome
// $9,000) need the whole team's money; with one purse nobody has to gift. Every purchase is announced with the buyer's name, defences show who
// bought them, and the HUD and base screen show each pilot's kills.
import {getRoom} from '../../engine/net.js';
import {KIND,ITEMS,PERK,ORDER} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,okArr=(a,n)=>Array.isArray(a)&&a.length>=n&&a.slice(0,n).every(Number.isFinite);
const KI=[...ORDER,'boss'],HT=['rack','flak','gepard','sam','ew','idome','gdome'],TEAM=['radar','aid'],MAXP=4;
const clean=n=>String(n??'').replace(/[<>&"'`]/g,'').trim().slice(0,16)||'Pilot';
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
// the host's feed lines are HTML; a client keeps only <b>, <br> and <span class="c?"> from them
const safe=h=>String(h).slice(0,400).replace(/<(?!\/?b>|br>|\/span>|span class="c[a-z]">)[^>]*>?/g,'');
export function initNet(api,G,Z){
 const {THREE,TH,SITES,S,save,feed,banner,tone}=api,V3=THREE.Vector3,$=id=>document.getElementById(id),_t=new V3(),_a=new V3();
 let room=null,net=null,lobT=0;
 const myName=()=>clean(S.zname);
 Object.defineProperty(Z,'online',{get:()=>!!net&&G.on,configurable:true});
 Object.defineProperty(Z,'mirror',{get:()=>!!net&&!net.host&&G.on,configurable:true});
 Object.defineProperty(Z,'req',{get:()=>net&&G.on?req:undefined,configurable:true});
 Z.idle=()=>!!net&&net.late&&G.on;
 Z.pilots=()=>net?[api.player,...[...net.pil.values()].filter(r=>r.seen).map(r=>r.d)]:null;

 // ---------- lobby on the Zombies start menu: name, Host co-op, code + Join (and open games, in a claude.ai room) ----------
 const box=document.createElement('div');box.id='zmp';box.className='zmp';
 box.innerHTML=`<h3>Co-op <small>2–4 pilots, one shared purse</small></h3><div class="mp"><input id="zname" maxlength="16" placeholder="Pilot name" aria-label="Pilot name"><button class="sm" id="zhost">Host co-op</button></div>
  <div class="mp"><input id="zcode" maxlength="6" placeholder="Game code" aria-label="Game code"><button class="sm" id="zjoin">Join</button></div><div id="zgames"></div>
  <p class="note" id="zmpnote">One pilot hosts and gets a game code; friends open this page, pick Zombies, type the code and press Join. Pilots who join mid-wave come in at the next base screen.</p>`;
 $('zdiff').after(box);
 const lobby=()=>{box.hidden=S.gmode!=='z';$('zhost').disabled=$('zjoin').disabled=!!net};
 const sy0=Z.syncMode;Z.syncMode=()=>{sy0?.();lobby()};lobby();$('gmode').addEventListener('click',()=>setTimeout(lobby,0));
 $('zname').value=S.zname||'';$('zname').onchange=()=>{S.zname=clean($('zname').value);save()};
 $('zhost').onclick=()=>enter(Math.random().toString(36).slice(2,6),true);$('zjoin').onclick=()=>enter($('zcode').value,false);$('zcode').onkeydown=e=>{if(e.key==='Enter')enter($('zcode').value,false)};
 const msg=(t,warn)=>{const n=$('zmpnote');n.textContent=t;n.classList.toggle('warn',!!warn);if(G.on&&!api.menuOpen)feed(t.replace(/[<>&]/g,''))};
 // while in a co-op game, Hold the line just goes back to it (a restart is the host's call)
 $('play').addEventListener('click',e=>{if(net&&G.on){e.stopImmediatePropagation();api.showMenu(false)}},true);
 function games(peers){const b=$('zgames');b.textContent='';for(const p of peers){const pr=p.presence;if(!pr?.zg||p.sameTab)continue;const code=String(pr.zg).replace(/[^a-z0-9]/g,'').slice(0,6);if(!code||net?.code===code)continue;
  const e=document.createElement('button');e.className='sm';e.textContent=`Join ${clean(pr.host)} · Zombies co-op · ${code.toUpperCase()} · ${cl(pr.pl|0,1,MAXP)}/${MAXP} pilots`;e.onclick=()=>enter(code,false);b.append(e)}}
 (async()=>{try{room=await getRoom()}catch(e){room=null}if(!room||room.p2p)return;room.onPeers?.(ch=>games(ch.peers),()=>{})})();

 // ---------- joining and leaving ----------
 async function enter(code,isHost){code=String(code).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,6);if(code.length<2){msg('Enter a game code of 2–6 letters or digits.',1);return}
  if($('zname').value.trim()){S.zname=clean($('zname').value);save()}
  if(!room){try{room=await getRoom()}catch(e){}}if(!room){msg('Online play is not available here.',1);return}
  leave();msg(isHost?'Starting a co-op game…':`Joining ${code.toUpperCase()}…`);let r;
  try{r=await(room.p2p?room.join('z'+code,isHost):room.join('dlz-'+code))}catch(e){const c=e?.code||'error';if(isHost&&c==='taken')return enter(Math.random().toString(36).slice(2,6),true);
   msg(c==='not_found'?'No game found with that code.':c==='timeout'?'Could not reach that game. Check the code and your connection.':c==='load_failed'?'Could not load the online library. Check your internet connection.':`Could not open that game (${c}). Try again.`,1);return}
  const n=net={r,code,host:isHost,me:null,hostPeer:null,peers:[],last:{},t0:performance.now(),gone:0,tk:0,sendT:0,vt:0,
   eid:0,evs:[],hk:{},ak:{},esv:{},rdv:{},ltv:{},skv:{},perks:{},kc:{},dr:{},names:{},order:[],rj:[],ps:{},gid:1,sn:0,snapIv:100,mute:0,
   out:[],oseq:Date.now(),evSeen:-1,drSeen:0,ts:new Map(),tm:new Map(),pl:[],gid0:0,late:false,rd:0,pil:new Map(),sig:'',nx:null,nxJ:'',pkJ:''};
  r.onPeers(ch=>{if(net!==n)return;n.peers=ch.peers;const me=ch.peers.find(p=>p.sameTab);if(me)n.me=me.peer},
   e=>{if(net===n)ended(e.code==='host_left'?'The host left the game. Co-op game over.':`Lost connection to the game (${e.code}).`)});
  r.presence({z:1,n:myName()}).catch(()=>{});lobby();document.body.classList.add('zcoop');
  if(isHost){if(S.gmode!=='z'){S.gmode='z';save();Z.syncMode?.()}G.dfo=undefined;api.startMatch();if(room.p2p){try{history.replaceState(null,'','#z'+code)}catch(e){}}
   msg(`Hosting co-op game ${code.toUpperCase()}. Friends open this page, pick Zombies, type ${code.toUpperCase()} and press Join${room.p2p?' (or open this page\'s link, it now ends in #z'+code+')':''}.`)}
  else msg(`Joining ${code.toUpperCase()}… waiting for the host.`)}
 function leave(){if(!net)return;const n=net;net=null;n.r.leave().catch(()=>{});for(const r of n.pil.values())api.scene.remove(r.d.mesh);n.pil.clear();G.dfo=undefined;for(const t of TH)t.pc=null;
  if(n.host&&!room?.p2p)room?.presence?.({zg:null,host:null,pl:null})?.catch?.(()=>{});
  $('leave').textContent='Quit to menu';document.body.classList.remove('zcoop');try{if(/^#z/.test(location.hash))history.replaceState(null,'',location.pathname+location.search)}catch(e){}lobby()}
 // the game ends for this pilot (host gone, connection lost, game full): back to the menu with the reason on it
 function ended(why){leave();if(G.on||!api.demo){$('zover').hidden=true;api.startDemo()}msg(why,1);banner('')}
 const zs=Z.start;Z.start=()=>{zs();if(!net)return;$('leave').textContent='Leave co-op game';if(net.host){net.gid++;net.perks={};net.kc={};net.dr={};net.rd=0}};
 const z1=Z.stop;Z.stop=()=>{leave();z1()};
 addEventListener('pagehide',()=>{if(net)net.r.leave().catch(()=>{})});
 {const m=/^#z([a-z0-9]{2,6})$/.exec(location.hash);if(m)setTimeout(()=>{$('zcode').value=m[1];enter(m[1],false)},400)}

 // ---------- tick: read everyone's presence, then send ours. Runs every frame (Z.visuals, also while the base screen pauses the sim) and from a timer ----------
 function tick(){if(!net)return;const now=performance.now();if(now-net.tk<15)return;net.tk=now;recv(now);if(net)send(now)}
 setInterval(()=>{if(net&&performance.now()-net.tk>150)tick()},100);
 const pack=d=>[+d.p.x.toFixed(2),+d.p.y.toFixed(2),+d.p.z.toFixed(2),+d.q.x.toFixed(3),+d.q.y.toFixed(3),+d.q.z.toFixed(3),+d.q.w.toFixed(3),+d.v.x.toFixed(1),+d.v.y.toFixed(1),+d.v.z.toFixed(1)];
 function send(now,force){const n=net;if(!n||!force&&now-n.sendT<(n.host?n.snapIv:50))return;n.sendT=now;const me=api.player,P={z:1,n:myName(),rd:n.rd|0,es:n.evSeen,lt:n.late?1:0,sk:G.streak|0};
  if(me&&G.on&&!api.demo){P.s=pack(me);P.d=me.dead>0?1:0;P.rk=(me.boost||0)>1?1:0;const s=api.selT();P.sl=s&&me.dead<=0&&me.v.lengthSq()>64&&api.live(s)&&s.p.distanceTo(me.p)<1500?s.id:0}
  if(n.host){if(G.on)P.g=snap(now)}else P.ev=n.out.slice(-32);
  n.r.presence(P).catch(()=>{});
  if(n.host&&room&&!room.p2p&&now-lobT>2000){lobT=now;room.presence({zg:n.code,host:myName(),pl:rows().length}).catch(()=>{})}}
 function recv(now){const n=net,seen=new Set();
  for(const p of n.peers){if(p.sameTab)continue;const pr=p.presence;if(!pr||!pr.z)continue;seen.add(p.peer);if(pr.g&&!n.host)n.hostPeer=p.peer;
   if(pr===n.last[p.peer])continue;n.last[p.peer]=pr;
   if(n.host){if(!hostPeer(p.peer,pr))continue}
   else if(pr.g){onHost(pr.g,now);if(net!==n)return}
   if(!n.host&&!n.pl.some(q=>q[0]===p.peer))continue;
   pilotIn(p.peer,pr,now)}
  for(const[k,r]of n.pil)if(!seen.has(k)||!n.host&&!n.pl.some(q=>q[0]===k)){api.scene.remove(r.d.mesh);n.pil.delete(k)}
  if(n.host){for(const k of Object.keys(n.names))if(!seen.has(k))gone(k);n.rj=n.rj.filter(k=>seen.has(k));readyCheck();baseSig()}
  else{const g=n.hostPeer?!n.peers.some(p=>p.peer===n.hostPeer):now-n.t0>8000;if(!g)n.gone=0;else if(!n.gone)n.gone=now;else if(now-n.gone>3000)return ended(n.hostPeer?'The host left the game. Co-op game over.':'No game found with that code.')}
  claims()}
 const nameOf=k=>k===net?.me?myName():net?.pil.get(k)?.n||net?.names[k]||net?.pl.find(p=>p[0]===k)?.[1]||'Pilot';
 // other pilots' interceptors: a Strela-2 body each (interceptor.js Drone), drawn where their presence says, with a name tag
 function pilotIn(k,pr,now){const n=net;if(!G.on)return;let r=n.pil.get(k);if(!r){r={d:api.newDrone(),n:'',np:new V3(),nq:new THREE.Quaternion(),nv:new V3(),at:0,dead:0,seen:0,sl:0,rk:0};r.d.mesh.visible=false;n.pil.set(k,r)}
  r.n=clean(pr.n);r.sl=pr.sl|0;r.rk=pr.rk?1:0;
  if(okArr(pr.s,10)){r.np.fromArray(pr.s,0);r.nq.fromArray(pr.s,3).normalize();r.nv.fromArray(pr.s,7);r.at=now;if(!r.seen){r.seen=1;r.d.p.copy(r.np);r.d.q.copy(r.nq)}}
  const dead=pr.d?1:0;if(dead&&!r.dead&&r.seen&&G.on){n.mute=1;api.boom(r.d.p,.7);n.mute=0}r.dead=r.d.dead=dead}
 // a track another pilot is running down shows their name (and helpers on the host leave it alone, zdef pickTarget)
 function claims(){for(const t of TH)t.pc=null;for(const[k,r]of net.pil){if(!r.sl||r.dead||!r.seen)continue;const t=TH.find(u=>u.id===r.sl);if(t&&api.live(t)&&t.p.distanceTo(r.d.p)<1600)t.pc=nameOf(k)}}

 // ---------- host: the roster (up to 4 pilots), requests, events, snapshots ----------
 function hostPeer(k,pr){const n=net;if(n.rj.includes(k))return false;if(okArr(pr.s,10))n.ps[k]=pr.s;
  if(!n.names[k]){if(Object.keys(n.names).length>=MAXP-1){n.rj.push(k);return false}n.names[k]=clean(pr.n);n.order.push(k);n.kc[k]=n.kc[k]|0;n.hk[k]=0;
   team(`<b>${n.names[k]}</b> joined${G.state==='base'||G.state==='over'?'':' · in at the next base screen'}`)}
  n.names[k]=clean(pr.n);n.skv[k]=pr.sk|0;n.rdv[k]=pr.rd|0;n.ltv[k]=pr.lt?1:0;n.esv[k]=Number.isFinite(+pr.es)?+pr.es:-1;
  if(Array.isArray(pr.ev))for(const e of pr.ev){if(!Array.isArray(e)||!(+e[0]>(n.hk[k]||0)))continue;n.hk[k]=+e[0];try{apply(k,e.slice(1),+e[0])}catch(err){console.warn('co-op request',err)}}
  n.ak[k]=n.hk[k];return true}
 function gone(k){const n=net,nm=n.names[k];if(!nm)return;for(const o of[n.names,n.esv,n.rdv,n.ltv,n.skv,n.hk,n.ak,n.dr,n.ps])delete o[k];n.order=n.order.filter(x=>x!==k);team(`<b>${nm}</b> left the game`)}
 const ev=e=>{const n=net;n.evs.push([++n.eid,...e]);if(n.evs.length>240)n.evs.splice(0,n.evs.length-240)};
 const team=h=>{feed(h);if(net?.host)ev(['f',h])};
 const tell=(k,t)=>{if(k===net.me)feed(`<span class="co">${t}</span>`);else ev(['m',k,t])};
 const who=(t,k)=>{t.by=k===net.me?'p':'o';t.byN=k;t.sk=net.skv[k]|0};
 // a request from pilot k (the host's own come through here too, so every purchase is announced the same way)
 function apply(k,e,seq){const nm=nameOf(k),T=e[0];
  if(T==='d')return hostDet(k,seq,e[1],e[2]);
  if(T==='h'){const t=TH.find(u=>u.id===e[1]);if(t&&api.live(t)&&reach(k,t)){who(t,k);G.burst={n:0};api.killThreat(t,true);G.burst=null}net.dr[k]={s:seq,o:t?[[e[1],'k',0]]:[],nr:0,dh:1};return}
  if(T==='u'){Z.pk.use(String(e[1]),{lv:e[2]|0,sel:e[3]|0,by:k,n:nm});return}
  if(G.state!=='base'){tell(k,'The shop is open between waves.');return}
  const B=Z.base.act;
  if(T==='b'){const it=ITEMS[e[1]],s=Z.def.SLOTS[e[2]|0],d=it&&B.place(e[1],e[2]|0,nm);if(d)team(`<b>${nm}</b> bought a ${it.n.toLowerCase()} · ${s.n} · ${money(it.price)}`);else tell(k,'That position was taken, or the purse is short.')}
  else if(T==='p'){const kk=String(e[1]),P=PERK[kk],it=ITEMS[kk];if(!P||!it||G.wave+1<it.from)return;const mine=k===net.me||TEAM.includes(kk),L=mine?G.perks[kk]|0:net.perks[k]?.[kk]|0,c=P.cost[L];
   if(c==null||G.cash<c){tell(k,'Not enough in the purse.');return}G.cash-=c;if(mine)Z.buyPerk(kk);else(net.perks[k]||(net.perks[k]={}))[kk]=L+1;
   team(`<b>${nm}</b> bought ${it.n}${L?' level '+(L+1):''}${TEAM.includes(kk)?' for the team':''} · ${money(c)}`)}
  else if(T==='g'){const d=Z.def.D.find(x=>x.id===e[1]),c=d?B.upgrade(e[1],String(e[2])):0;if(c)team(`<b>${nm}</b> upgraded the ${ITEMS[d.type].n.toLowerCase()} · ${money(c)}`)}
  else if(T==='s'){const d=Z.def.D.find(x=>x.id===e[1]),r=d?B.sell(e[1]):null;if(r!=null)team(`<b>${nm}</b> sold the ${ITEMS[d.type].n.toLowerCase()} · +${money(r)}`)}
  else if(T==='r'){const i=e[1]|0,hp=B.repair(i,e[2]|0);if(hp)team(`<b>${nm}</b> repaired the ${SITES[i].n.toLowerCase()} · +${hp} hp`)}
  baseSig(true)}
 // a client's burst: [track id, miss distance, closing speed] per track it saw within 30 m; rolled here with the solo rules (Z.outcome)
 // a pilot's burst or direct hit only counts on tracks near where that pilot last said it was (its own lag and the track's speed allowed for):
 // a client can't down tracks across the map by sending their ids
 function reach(k,t){const s=net.ps[k];if(!okArr(s,10))return false;return _a.fromArray(s,0).distanceTo(t.p)<60+(t.spd+Math.hypot(s[7],s[8],s[9]))*.6}  // s: the state in the same packet as the request
 function hostDet(k,seq,hits,nr){const out=[];G.burst={n:0};
  if(Array.isArray(hits))for(const h of hits.slice(0,40)){if(!Array.isArray(h))continue;const t=TH.find(u=>u.id===h[0]),r=cl(+h[1]||0,0,30),cv=cl(+h[2]||0,0,3000);if(!t||!api.live(t)||!reach(k,t)){out.push([h[0],'m',r]);continue}
   who(t,k);const o=Z.outcome(t,r,cv);
   if(t.k==='boss'){if(o!=='miss'){Z.bossHit(t);out.push([t.id,'b',r])}else out.push([t.id,'m',r]);continue}
   if(o==='kill'){api.killThreat(t,r<2.4&&Math.random()<.55);out.push([t.id,'k',r])}else if(o==='damage'){api.damage(t);out.push([t.id,'d',r])}else out.push([t.id,'m',r])}
  G.burst=null;net.dr[k]={s:seq,o:out,nr:+(+nr||0).toFixed(1)}}
 // kills, impacts, explosions and gun bursts become events for the clients
 const k0=Z.kill;Z.kill=(t,cat)=>{const was=t.paid;k0(t,cat);if(!net||!net.host||was||!t.paid||!G.on)return;const by=t.by==='p'?net.me:t.by==='o'?t.byN:'';if(by)net.kc[by]=(net.kc[by]|0)+1;
  ev(['k',t.id,cat?1:0,by||'']);if(t.by==='o')feed(`<b>${nameOf(by)}</b> · <span class="cg">${Z.tname(t)} down</span>`)};
 const i0=Z.impact;Z.impact=t=>{i0(t);if(net&&net.host&&G.on)ev(['i',t.id])};
 const f0=Z.flash;Z.flash=(p,k)=>{f0(p,k);if(net&&net.host&&G.on&&!net.mute&&p!==api.player?.p)ev(['b',Math.round(p.x),Math.round(p.y),Math.round(p.z),Math.round(k*10)])};
 Z.onGun=(d,t)=>{if(net&&net.host)ev(['g',d.id,t.id])};
 const q10=v=>Math.round(v*10);
 function snap(now){const n=net,T=[],TS=[],full=++n.sn%10===0;
  for(const t of TH){if(!api.live(t)&&t.st!=='fall')continue;const ki=KI.indexOf(t.k);if(ki<0)continue;const c=t.claim,ct=c?HT.indexOf(c.type||c.d?.type)+1:0;
   const f=(t.dmg?1:0)|(t.ident?2:0)|(t.mark>0?4:0)|(t.frz>0?8:0)|(t.spoof?16:0)|(ct>0?ct<<5:0),a=[t.id,ki,q10(t.p.x),q10(t.p.y),q10(t.p.z),Math.round(t.v.x),Math.round(t.v.y),Math.round(t.v.z),f,t.st==='fall'?2:t.st==='dive'?1:0];
   if(t.k==='boss')a.push(t.stages|0);T.push(a);if(!t.nb)t.nb=now;
   if(full||now-t.nb<1500)TS.push([t.id,Math.max(0,SITES.indexOf(t.tgt)),Math.round(t.aim.x),Math.round(t.aim.y),Math.round(t.aim.z),t.grp|0,t.shade|0])}
  n.snapIv=cl(100+(T.length-60)*1.2,100,250);
  const es=Object.keys(n.names).map(k=>n.esv[k]??-1),mn=es.length?Math.min(...es):n.eid,D=Z.def.netOut(),nx=G.state==='base'&&G.next?{list:G.next.list,brgs:G.next.brgs.map(b=>+b.toFixed(3)),wx:G.next.wx||null}:null;
  return{v:1,gid:n.gid,st:G.state,w:G.wave,c:Math.round(G.cash),e:Math.round(G.earned),k:[G.kills.p,G.kills.h],df:cl(S.zdiff??1,0,3),wt:+(G.wt||0).toFixed(1),iq:G.wq.length,
   sh:SITES.map(s=>Math.ceil(s.hp)),sm:SITES.map(s=>s.max),bk:SITES.length>3?1:0,wb:[+api.WB.x.toFixed(1),+api.WB.z.toFixed(1)],T,TS,S:D.S,D:D.D,
   ev:n.evs.filter(e=>e[0]>mn).slice(-120),eid:n.eid,pk:n.perks,tp:{radar:G.perks.radar|0,aid:G.perks.aid|0},dr:n.dr,ak:n.ak,pl:rows(),nx,rj:n.rj}}
 // roster rows [key, name, kills, ready for the next wave, joined mid-wave]; a client shows its own ready state at once
 function rows(){const n=net;if(!n)return[];const nw=G.wave+1;
  if(n.host)return[[n.me||'host',myName(),n.kc[n.me||'host']|0,n.rd===nw?1:0,0],...n.order.filter(k=>n.names[k]).map(k=>[k,n.names[k],n.kc[k]|0,n.rdv[k]===nw?1:0,n.ltv[k]|0])];
  return n.pl.map(p=>p[0]===n.me?[p[0],myName(),p[2],n.rd===nw?1:0,n.late?1:0]:p)}
 // ready-up: Continue (button, C, pad Y) toggles this pilot's ready flag; the wave starts when every pilot is ready, or when the host forces it
 const cont=Z.continue;
 Z.continue=()=>{if(!net||!G.on)return cont();if(G.state!=='base')return;net.rd=net.rd===G.wave+1?0:G.wave+1;Z.base.refresh();if(net.host)readyCheck();else send(performance.now(),true)};
 function readyCheck(){if(!G.on||G.state!=='base')return;const R=rows();if(R.length&&R.every(p=>p[3])){team(`All ${R.length} pilot${R.length>1?'s':''} ready: wave ${G.wave+1}`);cont()}}
 Z.base.el.addEventListener('click',e=>{if(e.target.closest?.('#zforce')&&net?.host&&G.state==='base'){team(`<b>${myName()}</b> started wave ${G.wave+1}`);cont()}});
 Z.goTxt=()=>{if(!net)return null;const R=rows(),r=R.filter(p=>p[3]).length;return net.rd===G.wave+1?`Ready ✓ · ${r}/${R.length} pilots`:`Ready for wave ${G.wave+1} ▸`};
 Z.coopHTML=()=>{if(!net)return'';const R=rows();
  return`<div class="zcoop"><b>CO-OP ${net.code.toUpperCase()}</b>${R.map(p=>`<span class="${p[3]?'rd':''}">${p[1]}${p[0]===net.me?' (you)':''} · ${p[2]} down${p[3]?' · READY':p[4]?' · joining':''}</span>`).join('')}
   <em>Shared purse: anyone can spend it. The wave starts when every pilot is ready${net.host?'':', or when the host starts it'}.</em>${net.host?'<button class="sm" id="zforce">Start now</button>':''}</div>`};
 Z.overBtns=()=>!net?null:net.host?'<button class="go" id="zagain">Play again (all pilots)</button><button id="zmenu">End the co-op game</button>':'<button id="zmenu">Leave the game</button>';
 Z.overNote=()=>net&&!net.host?'<p class="zhint">Waiting for the host to start a new game…</p>':'';
 // base screen redraw when something changed elsewhere (purse, defences, perks, who is ready)
 function baseSig(force){if(!net||!G.on||G.state!=='base'||Z.base.el.hidden)return;const s=JSON.stringify([Math.round(G.cash),Z.def.D.map(d=>[d.id,d.tier,d.lvl,d.cap]),G.perks,rows(),SITES.map(s=>Math.ceil(s.hp)),net.nxJ]);
  if(force||s!==net.sig){net.sig=s;Z.base.refresh()}}

 // ---------- client: mirror the host's snapshot ----------
 const byId=id=>net.tm.get(id)||null;
 function onHost(g,now){const n=net;if(!g||typeof g!=='object'||g.v!==1)return;
  if(Array.isArray(g.rj)&&g.rj.includes(n.me))return ended(`Game ${n.code.toUpperCase()} is full (${MAXP} pilots).`);
  n.pl=Array.isArray(g.pl)?g.pl.filter(a=>Array.isArray(a)&&typeof a[0]==='string').slice(0,MAXP).map(a=>[a[0],clean(a[1]),a[2]|0,a[3]?1:0,a[4]?1:0]):[];
  if(g.gid!==n.gid0){n.gid0=g.gid;G.dfo=cl(g.df|0,0,3);n.ts.clear();n.evSeen=g.eid|0;n.late=g.st!=='base'&&g.st!=='over';n.nxJ='';n.pkJ='';n.rd=0;
   if(S.gmode!=='z'){S.gmode='z';save();Z.syncMode?.()}$('zover').hidden=true;api.startMatch();if(net!==n)return;msg(`In co-op game ${n.code.toUpperCase()}.`)}
  G.dfo=cl(g.df|0,0,3);G.cash=+g.c||0;G.earned=+g.e||0;if(okArr(g.k,2))G.kills={p:g.k[0],h:g.k[1]};G.wt=+g.wt||0;
  if(!!g.bk!==SITES.length>3)Z.bunker(!!g.bk);
  if(Array.isArray(g.sh))SITES.forEach((s,i)=>{if(Number.isFinite(g.sm?.[i]))s.max=g.sm[i];if(Number.isFinite(g.sh[i]))s.hp=g.sh[i]});
  if(okArr(g.wb,2))api.WB.set(g.wb[0],0,g.wb[1]);
  perksIn(g);Z.def.netIn(null,g.D,byId);
  n.tm=new Map(TH.map(t=>[t.id,t]));
  if(Array.isArray(g.ev)){if(n.evSeen<0)n.evSeen=g.eid|0;for(const e of g.ev)if(Array.isArray(e)&&e[0]>n.evSeen){n.evSeen=e[0];try{event(e)}catch(err){console.warn('co-op event',err)}}}
  tracksIn(g.T,g.TS);Z.def.netIn(g.S,null,byId);
  stateIn(g);if(net!==n)return;
  G.wq=Array.from({length:cl(g.iq|0,0,400)},()=>({k:'',at:1e9}));
  if(g.ak&&+g.ak[n.me])n.out=n.out.filter(e=>e[0]>+g.ak[n.me]);
  const R=g.dr?.[n.me];if(R&&+R.s>n.drSeen){n.drSeen=+R.s;result(R)}
  baseSig()}
 function stateIn(g){const n=net,st=g.st,w=g.w|0;
  if(g.nx&&typeof g.nx==='object'&&Array.isArray(g.nx.list)){const j=JSON.stringify(g.nx);if(j!==n.nxJ){n.nxJ=j;n.nx={list:g.nx.list.map(String).filter(q=>KIND[q.split(':')[0]]),brgs:(g.nx.brgs||[]).map(Number).filter(Number.isFinite),q:[],wx:g.nx.wx&&Z.wx.T[g.nx.wx.id]?g.nx.wx:null};if(G.state==='base')G.next=n.nx}}
  if(st==='base'){n.late=false;if(G.state!=='base'){$('zover').hidden=true;G.wave=w;api.wave=w;Z.rk.stop();G.next=n.nx||Z.plan(w+1);Z.base.open()}else G.wave=w}
  else if(st==='wave'){if(G.state==='base'&&!n.late){G.wave=w-1;G.next=n.nx||{list:[],brgs:[],q:[],wx:null};cont()}
   else if(G.state!=='wave'&&G.state!=='clear'){Z.base.close();G.state='wave';G.wave=w;api.wave=w;n.late=true;Z.def.deploy();banner(`WAVE ${w} IN PROGRESS`,'co',2.4);feed('You join at the next base screen. Watch the radar meanwhile.')}
   else{G.wave=w;if(G.state==='clear')G.state='wave'}}
  else if(st==='clear'){if(G.state==='wave'){G.state='clear';if(!n.late)banner(`WAVE ${G.wave} CLEAR`,'cg',2.6)}}
  else if(st==='over'){if(G.state!=='over'){G.wave=w;Z.base.close();Z.gameOver()}}}
 // perks: the host keeps each pilot's own levels; the team perks (radar, Foreign Aid) are the host's
 function perksIn(g){const mine=g.pk&&typeof g.pk==='object'&&g.pk[net.me]||{},tp=g.tp||{},P={};
  for(const k of Object.keys(PERK)){const v=cl((TEAM.includes(k)?tp[k]:mine[k])|0,0,PERK[k].cost.length);if(v)P[k]=v}
  const j=JSON.stringify(P);if(j===net.pkJ)return;net.pkJ=j;G.ch=G.ch||{};
  for(const k of['freeze','mark','air'])if((P[k]|0)>(G.perks[k]|0))G.ch[k]=(G.ch[k]|0)+(P[k]|0)-(G.perks[k]|0);
  G.perks=P;Z.pk.apply()}
 function event(e){const T=e[1];
  if(T==='b'){if(okArr(e.slice(2),4))api.boom(new V3(e[2],e[3],e[4]),cl(e[5]/10,.05,10));return}
  if(T==='f'){feed(safe(e[2]));return}
  if(T==='m'){if(e[2]===net.me)feed(`<span class="co">${String(e[3]).replace(/[<>&]/g,'').slice(0,200)}</span>`);return}
  if(T==='g'){const d=Z.def.D.find(x=>x.id===e[2]),t=byId(e[3]);if(d&&t&&d.mesh)Z.def.burst(d,t);return}
  const t=byId(e[2]);if(!t||t.st==='dead')return;
  if(T==='k'){if(t.paid)return;const by=String(e[4]||'');t.by=by===net.me?'p':by?'o':'h';t.byN=by;if(e[3])t.st='dead';else{t.st='fall';t.spin=(Math.random()<.5?-1:1)*(1+Math.random()*3)}
   Z.kill(t,!!e[3]);if(by&&by!==net.me)feed(`<b>${nameOf(by)}</b> · <span class="cg">${Z.tname(t)} down</span>`)}
  else if(T==='i'){t.p.copy(t.aim);Z.impact(t)}}
 function tracksIn(T,TS){if(!Array.isArray(T))return;const n=net,seen=new Set();
  if(Array.isArray(TS))for(const a of TS)if(okArr(a,5)){n.ts.set(a[0],a);const t=n.tm.get(a[0]);if(t){t.tgt=SITES[a[1]]||t.tgt;t.aim.set(a[2],a[3],a[4])}}
  for(const a of T){if(!okArr(a,10))continue;let t=n.tm.get(a[0]);if(t&&t.st==='dead')continue;if(!t){const s=n.ts.get(a[0]);if(!s)continue;t=mk(a,s);if(!t)continue;n.tm.set(t.id,t)}seen.add(t.id);upd(t,a)}
  for(const t of TH)if(t.net&&t.st!=='dead'&&!seen.has(t.id))t.st='dead';
  for(const id of n.ts.keys())if(!seen.has(id))n.ts.delete(id)}
 function mk(a,s){const k=KI[a[1]],K=KIND[k];if(!K)return null;
  const t={id:a[0],k,p:new V3(),v:new V3(),spd:1,cs:1,alt:0,wps:[],tgt:SITES[s[1]]||SITES[0],aim:new V3(s[2],s[3],s[4]),st:'cruise',jet:!!K.jet,mesh:null,prop:null,pd:1e9,dmin:1e9,cvm:0,bank:0,roll:0,spin:0,smoke:0,rb:null,claim:null,by:null,net:1,np:new V3(),nv:new V3()};
  if(s[5])t.grp=s[5];Z.en.dress(t);t.shade=cl(s[6]|0,0,2);t.st='cruise';t.p.set(a[2]/10,a[3]/10,a[4]/10);t.np.copy(t.p);t.v.set(a[5],a[6],a[7]);TH.push(t);return t}
 function upd(t,a){t.np.set(a[2]/10,a[3]/10,a[4]/10);t.nv.set(a[5],a[6],a[7]);t.v.copy(t.nv);const sp=t.v.length();if(sp>.1)t.spd=t.cs=sp;
  if(t.p.distanceToSquared(t.np)>Math.max(3600,sp*sp*.25))t.p.copy(t.np);
  const f=a[8]|0,c=(f>>5)&7;t.dmg=f&1?1:0;if(f&2)t.ident=1;t.mark=f&4?Math.max(t.mark||0,.3):0;t.frz=f&8?Math.max(t.frz||0,.3):0;t.spoof=f&16?1:0;t.claim=c?{type:HT[c-1]}:null;
  const st=a[9]|0;if(st===2&&t.st!=='fall'){t.st='fall';t.spin=t.spin||(Math.random()<.5?-1:1)*(1+Math.random()*2)}else if(st<2&&t.st!=='fall')t.st=st?'dive':'cruise';
  if(t.k==='boss'&&Number.isFinite(a[10])&&a[10]<t.stages){for(let i=Math.max(0,a[10]);i<t.stages;i++){const p=t.pods?.[i];if(p){p.visible=false;if(p.userData.led)p.userData.led.visible=false}}t.stages=a[10];Z.an?.say('STAGE DOWN',`${t.stages} left`,'#ff9a3c',1)}}
 // mirrored tracks: dead-reckoned from the last snapshot, pulled onto it; wrecks fall with the host's numbers and smoke here
 const ts0=Z.tstep;Z.tstep=(t,dt)=>{if(!t.net)return ts0(t,dt);if(t.pp)t.pp.copy(t.p);else t.pp=t.p.clone();
  t.np.addScaledVector(t.nv,dt);t.p.addScaledVector(t.v,dt).lerp(t.np,1-Math.exp(-dt*6));
  if(t.st==='fall'){t.roll+=t.spin*dt;if((t.smoke-=dt)<=0){t.smoke=.05;api.SMK.emit(t.p,0x2a2725,1,1.5,3,null,1,.8);api.FX.emit(t.p,0xff7a20,2,2,.4,null,2.5)}}
  else if(t.dmg&&(t.smoke-=dt)<=0){t.smoke=.08;api.SMK.emit(t.p,0x2e2b28,1,1.2,4,null,1,.75)}
  return true};
 // detonation on a client: measure every track in range as this pilot sees it, ask the host to roll it; the readout comes back with the result
 const dt0=Z.detonate;Z.detonate=()=>Z.mirror?clientDet():dt0();
 function clientDet(){const d=api.player,h=[];let nr=1e9;
  for(const t of TH)if(api.live(t)){const r=t.p.distanceTo(d.p);nr=Math.min(nr,r);if(r>30)continue;const cv=Math.max(0,-_a.subVectors(t.v,d.v).dot(_t.subVectors(t.p,d.p))/(r||1));h.push([t.id,+r.toFixed(2),+cv.toFixed(1)])}
  G.detFlag=true;if(h.length){req(['d',h,+nr.toFixed(1)]);banner('BURST','co',.8)}else{G.streak=0;const txt=nr<300?`MISSED BY ${Math.round(nr)} m`:'NOTHING IN RANGE';banner(txt,'cr',1.4);G.det={txt,t:performance.now()};tone(300,140,.35,.12,'sawtooth')}
  api.lose('det')}
 function result(R){if(R.dh)return;const o=Array.isArray(R.o)?R.o.filter(a=>Array.isArray(a)):[],k=o.filter(a=>a[1]==='k'||a[1]==='b').length,d=o.filter(a=>a[1]==='d').length,best=o.reduce((m,a)=>a[1]!=='m'?Math.min(m,+a[2]||0):m,1e9),nr=+R.nr||1e9;
  const txt=k?`HIT — ${best.toFixed(1)} m`:d?`DAMAGED — ${best.toFixed(1)} m`:nr<300?`MISSED BY ${nr.toFixed(1)} m`:'NOTHING IN RANGE';
  banner(txt,k?'cg':d?'co':'cr',1.4);G.det={txt,t:performance.now()};G.streak=k?G.streak+1:0;
  if(k)tone(520,1040,.22,.14,'triangle');else if(d)tone(440,520,.2,.1,'triangle');else tone(300,140,.35,.12,'sawtooth');
  feed(o.map(([id,c,r])=>{const t=byId(id),nm=t?Z.tname(t):'T'+String(id|0).padStart(2,'0');r=(+r||0).toFixed(1);return c==='k'?`<span class="cg">${nm} down</span> (${r} m)`:c==='b'?`<span class="cg">${nm} hit</span> (${r} m)`:c==='d'?`<span class="co">${nm} damaged</span> (${r} m)`:`<span class="co">Missed ${nm} (${r} m)</span>`}).join('<br>')||'Detonated: nothing in range')}
 function req(e){if(!net)return 0;if(net.host){apply(net.me||'host',e,0);return 0}const s=++net.oseq;net.out.push([s,...e]);if(net.out.length>64)net.out.splice(0,net.out.length-64);send(performance.now(),true);return s}

 // ---------- drawing: other pilots (mesh, name tags, radar), the roster on the HUD ----------
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);if(!net)return;tick();if(!net)return;const now=performance.now(),rdt=Math.min(.1,(now-(net.vt||now))/1000),sc=api.player?.mesh.scale.x||1;net.vt=now;
  for(const r of net.pil.values()){const d=r.d;if(!r.seen){d.mesh.visible=false;continue}const k=1-Math.exp(-rdt*14),age=Math.min((now-r.at)/1000,.3);
   d.p.lerp(_t.copy(r.np).addScaledVector(r.nv,age),k);d.q.slerp(r.nq,k);d.v.copy(r.nv);d.mesh.position.copy(d.p);d.mesh.quaternion.copy(d.q);d.mesh.scale.setScalar(sc);d.mesh.visible=!r.dead;
   const sp=(r.dead?0:70)*rdt;d.props.forEach((p,i)=>p.rotation.y+=i%3?sp:-sp);
   if(r.rk&&!r.dead&&(r.fx=(r.fx||0)-rdt)<=0){r.fx=.03;const tail=_a.set(0,-.55*sc,0).applyQuaternion(d.q).add(d.p);api.FX.emit(tail,0xffa040,3,3,.25,null,2.5);api.SMK.emit(tail,0xcfcac2,1,1.2,5,null,1,.55)}}};
 const ov0=Z.overlay;Z.overlay=oc=>{ov0(oc);if(!net||!net.pil.size)return;const cam=api.camera,W=innerWidth,H=innerHeight;oc.save();oc.textAlign='center';oc.font='700 12px "JetBrains Mono",monospace';oc.shadowColor='#000';oc.shadowBlur=4;oc.strokeStyle=oc.fillStyle='#5fe3ff';oc.lineWidth=1.5;
  for(const[k,r]of net.pil){if(!r.seen||r.dead)continue;_t.copy(r.d.p).project(cam);if(_t.z>1||Math.abs(_t.x)>1.05||Math.abs(_t.y)>1.05)continue;const X=(_t.x*.5+.5)*W,Y=(-_t.y*.5+.5)*H,d=r.d.p.distanceTo(cam.position);
   oc.fillText(`${nameOf(k)} ${d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km'}`,X,Y-16);oc.beginPath();oc.moveTo(X-6,Y-9);oc.lineTo(X,Y-3);oc.lineTo(X+6,Y-9);oc.stroke()}
  oc.restore()};
 const rd0=Z.radar;Z.radar=(rc,P,sel,K)=>{rd0(rc,P,sel,K);if(!net)return;rc.font='700 14px "JetBrains Mono",monospace';rc.textAlign='left';rc.fillStyle='#5fe3ff';
  for(const[k,r]of net.pil){if(!r.seen||r.dead)continue;const q=P(r.d.p.x,r.d.p.z);rc.beginPath();rc.moveTo(q[0],q[1]-8);rc.lineTo(q[0]+6,q[1]+6);rc.lineTo(q[0]-6,q[1]+6);rc.closePath();rc.fill();rc.fillText(nameOf(k).slice(0,8),q[0]+9,q[1]+5)}};
 const zco=document.createElement('div');zco.id='zco';$('zhud').append(zco);
 const h0=Z.hud;Z.hud=dt=>{h0(dt);if(!net){if(zco.textContent)zco.textContent='';return}const t=`CO-OP ${net.code.toUpperCase()} · `+rows().map(p=>`${p[1]} ${p[2]}`).join(' · ');if(t!==zco.textContent)zco.textContent=t;
  if(net.late)$('zinb').textContent='WAVE IN PROGRESS · YOU JOIN AT THE NEXT BASE SCREEN'};

 // ---------- harness (tools/zombies-coop.mjs) ----------
 if(window.__z)window.__z.net={get n(){return net},enter,leave,tick,rows,send:()=>net&&send(performance.now(),true)};
 return{}}
