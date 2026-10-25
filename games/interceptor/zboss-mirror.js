// Boss: the Mirror, a black copy of your own interceptor (the Strela body, decals inverted and mirrored, a red eye) grown to 2.6x. It has
// your loadout as you flew into the wave: Rocket Assist (it sprints when far), your warhead (its burst radius), your personal swarm (black
// copies of your drones, in the formation you fly) and it flies like you do: your average height and speed this run, your favourite turn
// side, and it comes at you from the aspect you most often come at tracks from (zbosses.js habit()). It hunts your interceptor: inside its
// burst radius it detonates (you lose the interceptor) and re-forms 1.2 km away; while you are down it dives on your sites.
// It is beaten by breaking your own habits: bursts from your favourite aspect mostly glance off (IT KNEW), from any other aspect they count
// in full; it breaks early against your usual approach and turns the way you turn. REFLECTION, DISTORTION (it copies your swarm again,
// faster), SHATTERING (cracked, erratic). Beaten: the Mirror Shard trophy (faster relaunch, streak kept when you lose an interceptor).
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
import {legionRaise} from './zboss-ace.js';
function invSkin(C){return C.decal('mr-skin',256,1024,(g,w,h)=>{g.fillStyle='#0a0a0b';g.fillRect(0,0,w,h);for(let i=0;i<700;i++){g.fillStyle=`rgba(${Math.random()<.5?'60,0,0':'0,0,0'},${.05+Math.random()*.1})`;g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,4+Math.random()*40)}
 const band=(y0,y1,c)=>{g.fillStyle=c;g.fillRect(0,y0*h,w,(y1-y0)*h)};band(.13,.18,'#7a0d0d');band(.2,.21,'#e8e2d0');band(.82,.84,'#e8e2d0');
 for(const u of[.25,.75]){g.save();g.translate(u*w,h*.62);g.rotate(Math.PI/2);g.scale(-1,1);C.D2.text(g,'9М32',0,0,30,'#c21d1d','700');C.D2.text(g,'ЯOЯЯIM',0,28,17,'#8a1010','700');g.restore();
  g.save();g.translate(u*w,h*.9);g.rotate(Math.PI/2);g.scale(-1,1);C.D2.text(g,'ОСТОРОЖНО',0,0,17,'#c21d1d','700');g.restore()}})}
const MC=new Map();
function darken(C,m){let d=MC.get(m);if(d)return d;const T=C.THREE;if(m.map){d=new T.MeshStandardMaterial({map:invSkin(C),roughness:.35,metalness:.6})}
 else if(m.isMeshBasicMaterial&&!m.transparent){d=new T.MeshBasicMaterial({color:new T.Color(0xff1010).multiplyScalar(4),toneMapped:false})}
 else{d=m.clone();if(d.color)d.color.multiplyScalar(.12);if(d.emissive)d.emissive.set(0x1a0000)}MC.set(m,d);return d}
function model(C){const T=C.THREE,g=new T.Group(),dr=C.api.newDrone(),inner=dr.mesh;C.api.scene.remove(inner);inner.traverse(o=>{if(o.isMesh)o.material=darken(C,o.material)});inner.visible=true;
 inner.rotation.x=Math.PI/2;inner.scale.setScalar(2.6);g.add(inner);const eye=new T.Sprite(new T.SpriteMaterial({map:dot,color:new T.Color(0xff1010).multiplyScalar(3),transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
 eye.scale.set(1.6,1.6,1);eye.position.set(0,0,1.05);g.add(eye);const au=new T.Sprite(new T.SpriteMaterial({map:dot,color:new T.Color(0x300000),transparent:true,opacity:.6,depthWrite:false}));au.scale.set(9,9,1);g.add(au);
 Object.assign(g.userData,{dr,eye,au});return g}
/* Co-op: it copies the pilot it hunts, not the host. The host knows every pilot's perks and swarm; a client's flying habits come in its presence (znet.js Z.pilotHabit).
   Solo, every key below is '' and these read this pilot's own perks, swarm and habits as before. */
const FRESH={n:0,alt:0,spd:0,turn:1,turnK:0,fav:'LEVEL SIX',favK:0,approaches:0,side:'LEFT'},FAV=/^(HIGH|LEVEL|LOW) (SIX|BEAM|HEAD)$/;
const keyOf=(C,d)=>C.Z.pilotKey?.(d)||'',other=(C,k)=>!!k&&C.Z.online&&k!==C.Z.netMe?.();
const perk=(C,k,p)=>other(C,k)?C.Z.pilotPerk(k,p)|0:C.Z.perkLevel?.(p)|0;
const swarmOf=(C,k)=>other(C,k)?C.Z.sw?.SWS?.get(k):C.Z.sw?.mine;
const habOf=(C,k)=>other(C,k)?C.Z.pilotHabit?.(k)||FRESH:C.habit();
const habs=C=>(C.Z.pilotsK?.()||[['',C.api.player]]).map(([k,d])=>d===C.api.player?C.habit():habOf(C,k));
const copy=(C,t,d)=>{const B=t.bs,k=keyOf(C,d),sw=swarmOf(C,k);B.hk=k;B.h=habOf(C,k);B.L={rocket:perk(C,k,'rocket'),warhead:perk(C,k,'warhead'),fuse:perk(C,k,'fuse'),swarm:sw?.d?.length|0,form:sw?.form|0};B.form=B.L.form};
const target=C=>{const L=C.pilots();if(L.length<2)return L[0]||null;const q=L.filter(d=>{const h=habOf(C,keyOf(C,d));return h.n>=240&&h.approaches>=4});return C.pick(q.length?q:L)};  /* more than one pilot up: one of those who have flown enough to be copied */
const hunted=(C,t)=>{const L=C.pilots();if(!L.length)return null;const d=L.find(q=>keyOf(C,q)===t.bs.hk);if(d)return d;const n=C.nearPilot(t.p);if(n)copy(C,t,n);return n};  /* the pilot it copied, or if they are down the nearest one (and it copies them) */
const who=(C,B)=>{const me=!B.hk||B.hk===(C.Z.netMe?.()||'');return{me,poss:me?'your':`${C.Z.netName?.(B.hk)||'a pilot'}'s`,obj:me?'you':'them'}};
registerBoss({id:'mirror',n:'The Mirror',tag:'MIRROR',col:'#ff2a2a',spd:90,alt:[200,600],hitR:2,det:9000,cash:1200,bounty:5500,far:5200,
 resist:{rack:.2,gepard:.25,sam:.4,mpads:.4,idome:.2},hp:5,phases:['REFLECTION','DISTORTION','SHATTERING'],
 note:'a copy of your own interceptor with your loadout and your flying habits. Bursts from your usual approach glance off: break your habits.',warn:'something that flies like you',
 spawn:{event:{from:15,p:.04}},can:C=>habs(C).some(h=>h.n>=240&&h.approaches>=4),
 practice:{radio:'A contact in the dust is flying our pilot\'s pattern, turn for turn. It is learning you.',perks:{rocket:1,warhead:1,fuse:1,swarm:1},  /* it copies a loadout and some habits: the run starts with a standard loadout and a pilot who has flown a few waves */
  setup(C){C.G.hab={n:400,alt:300*400,spd:90*400,L:300,R:100,asp:{'LEVEL SIX':9,'HIGH BEAM':2},side:{LEFT:6,RIGHT:5},dets:0,yaw:null,t:0}}},
 intro:{title:'THE MIRROR',sub:(C,t)=>{const h=t.bs.h||C.habit();return`it flies like ${who(C,t.bs).obj} · ${h.fav} · turns ${h.turn>0?'left':'right'} · ${Math.round(h.alt)} m · ${Math.round(h.spd*3.6)} km/h`},col:'#ff2a2a',radio:'"…" Overlord, there is a contact flying exactly like our pilot. It IS our pilot.'},
 build:C=>model(C),
 init(C,t){const B=t.bs,{api}=C,d=target(C);copy(C,t,d||api.player);const h=B.h;
  if(d){const f=d.v.clone().setY(0);if(f.lengthSq()<1)f.set(0,0,-1);f.normalize();t.p.copy(d.p).addScaledVector(f,1500);t.p.y=Math.max(api.gh(t.p.x,t.p.z)+80,d.p.y);t.v.copy(f).multiplyScalar(-60)}else t.p.y=api.gh(t.p.x,t.p.z)+Math.max(80,h.alt||300);
  if(B.L.swarm)legionRaise(C,t,B.L.swarm,{swarm:1},{sv:'mirror'})},
 tick(C,t,dt){const{api,V3}=C,B=t.bs,P=hunted(C,t),h=B.h,K=C.cl((h.spd||80)*1.1,60,115)*[1,1.1,1.2][B.ph];B.cd=Math.max(0,(B.cd||0)-dt);B.brkCd=(B.brkCd||0)-dt;
  if(B.ph>=1&&(B.dv=(B.dv??6)-dt)<=0){B.dv=B.ph>1?4:6;const s=api.TH.find(u=>u.k==='spectre'&&u.bs.lead===t&&!u.bs.dive&&u.st!=='dead');if(s&&P&&P.p.distanceTo(t.p)<1500)s.bs.dive=1}
  if(B.brkT>0){B.brkT-=dt;const away=new V3().subVectors(t.p,P?P.p:t.p).setY(0).normalize(),side=new V3(-away.z,0,away.x).multiplyScalar(h.turn);C.steer(t,away.add(side).setY(.2).normalize(),K*1.3,2,dt,30);return true}
  if(!P||P.v.length()<10){if(!B.site||B.site.hp<=0)B.site=C.pick(C.sites());const S=B.site;if(!S)return true;const dh=Math.hypot(S.x-t.p.x,S.z-t.p.z);
   C.steer(t,dh<600?C.dirTo(t,new V3(S.x,S.y+3,S.z)):C.levelTo(t,new V3(S.x,0,S.z),h.alt||250),K,1.2,dt,dh<600?2:30);if(dh<25&&t.p.y-S.y<20){C.strike(t,S,50);reform(C,t);B.site=null}return true}
  const r=P.p.distanceTo(t.p);
  // it reacts to you the way you would: early against your favourite approach, late against anything else
  const cv=-new V3().subVectors(t.v,P.v).dot(new V3().subVectors(t.p,P.p))/Math.max(1,r),A=C.aspect(P.p,t),fav=A.key===h.fav,brkR=fav?650*(B.ph>1?1.3:1):220;
  if(r<brkR&&cv>12&&B.brkCd<=0&&r>40){B.brkT=1.2;B.brkCd=fav?2.5:4;return true}
  // its own run at you: from your favourite aspect relative to your flight path
  const f=P.v.clone().setY(0);if(f.lengthSq()<1)f.set(0,0,1);f.normalize();const lat=new V3(-f.z,0,f.x),[el,az]=h.fav.split(' ');
  const off=new V3().addScaledVector(f,az==='SIX'?-220:az==='HEAD'?220:0).addScaledVector(lat,az==='BEAM'?220*(h.side==='LEFT'?1:-1):0);off.y=el==='HIGH'?120:el==='LOW'?-80:0;
  const goal=r>500?P.p.clone().add(off):P.p.clone().addScaledVector(P.v,Math.min(1.5,r/150));const fast=B.L.rocket&&r>900?1.7:1;
  C.steer(t,C.dirTo(t,goal),K*fast,1.4,dt,15);
  if(B.cd<=0&&r<7+B.L.warhead+(B.L.fuse?2:0)){api.boom(t.p,1.3);C.shoot('your own reflection',P);reform(C,t)}
  return true},
 hit(C,t,h){const H=t.bs.h;if(h.at&&H){const A=C.aspect(h.at,t);if(A.key===H.fav){if(h.q==='kill')return 1;if(Math.random()<.75){h.txt='IT KNEW · break your habit';return 0}}}return h.q==='kill'?2:1},
 phase(C,t,i){if(i===1&&t.bs.L.swarm){const n=C.api.TH.filter(u=>u.k==='spectre'&&u.bs.lead===t&&u.st!=='dead').length;legionRaise(C,t,Math.max(0,t.bs.L.swarm-n),{swarm:1},{sv:'mirror'})}},
 status(C,e){const B=e.main.bs,h=B.h||C.habit(),L=B.L||{},w=who(C,B);return`${w.poss} habit: <b>${h.fav}</b> ${Math.round((h.favK||0)*100)}% · it turns <b>${h.turn>0?'LEFT':'RIGHT'}</b> like ${w.obj} · come in any other way<br>its loadout: warhead ${L.warhead|0}${L.rocket?' · rocket':''}${L.swarm?` · swarm ${L.swarm}`:''}`},
 tname:(C,t)=>`T${String(t.id).padStart(2,'0')} YOU?`,
 vis(C,t,dt){const U=t.mesh.userData,B=t.bs;for(const p of U.dr.props)p.rotation.y+=dt*95;U.eye.material.opacity=.7+.3*Math.sin(performance.now()/(B.ph>1?40:200));
  U.au.material.opacity=.45+.15*Math.sin(performance.now()/300);if(B.ph>1&&Math.random()<dt*8)C.FX.emit(t.p,0xff2020,4,4,.3,null,2.5);if(B.ref>0){B.ref-=dt;t.mesh.visible=B.ref<.6||Math.random()<.5}},
 /* co-op: who it hunts (the pilot's key), the habits and the loadout it copied, so a client's bar and intro read the host's numbers, not its own */
 netOut:(C,t)=>{const B=t.bs,h=B.h||FRESH,L=B.L||{};return[h.turn,B.hk||'',h.fav,Math.round(h.favK*100),Math.round(h.alt),Math.round(h.spd),L.warhead|0,L.rocket|0,L.fuse|0,L.swarm|0,L.form|0]},
 netIn(C,t,a){const B=t.bs;B.hk=typeof a[1]==='string'?a[1].slice(0,40):'';B.h={...FRESH,turn:+a[0]<0?-1:1,fav:FAV.test(a[2])?a[2]:'LEVEL SIX',favK:C.cl((+a[3]||0)/100,0,1),alt:+a[4]||0,spd:+a[5]||0};
  B.L={warhead:a[6]|0,rocket:a[7]|0,fuse:a[8]|0,swarm:a[9]|0,form:a[10]|0}},
 aim(C,t,s){const H=t.bs.h,fav=H&&H.fav==='LEVEL SIX';return{p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s*(fav?.4:1)?-.8:-7)}},
 winTxt:'The Mirror shattered. You flew unlike yourself.',
 sting(S){const t0=S.t+.05,o=S.out(.9),x=S.osc('sawtooth',420,t0,2.2),f=S.filt('lowpass',1800,2);x.frequency.setValueAtTime(420,t0);x.frequency.exponentialRampToValueAtTime(70,t0+2);x.connect(f).connect(S.env(t0,.1,1.6,2.2,o));  // your motor, spun down backwards
  [880,698.5,554.4,440].forEach((fq,i)=>{const n=S.osc('triangle',fq*1.03,t0+.3+i*.12,.5);n.connect(S.env(t0+.3+i*.12,.05,.01,.5,o))})},  // your kill chime, upside down and out of tune
 loop(S){const o=S.out(0),a=S.osc('sawtooth',86,S.t,0),b=S.osc('sawtooth',91.5,S.t,0),f=S.filt('lowpass',700,2),w=S.osc('sine',3.3,S.t,0),wg=a.context.createGain();wg.gain.value=9;w.connect(wg).connect(a.frequency);a.connect(f);b.connect(f);f.connect(o);return{g:o,stop(){a.stop();b.stop();w.stop()}}},
 reward:{id:'shard',n:'Mirror Shard',short:'40% faster relaunch; streak kept when you lose an interceptor',txt:'Your reflection is yours now: the next interceptor is on the mat 40% sooner, and losing an interceptor no longer ends your streak.',
  grant(C){const{Z,api}=C;if(!Z.pk._shard){Z.pk._shard=1;const a0=Z.pk.apply;Z.pk.apply=()=>{a0();if(C.G.brw?.shard)api.RELT=api.S.mod.relt*[1,.6,.36][Z.perkLevel('relaunch')|0]*.6}}Z.pk.apply()},
  step(C){const{G,api}=C,d=api.player;if(!d)return;if(d.dead<=0)G.shs=G.streak;else if(!G.detFlag&&G.shs&&!G.streak)G.streak=G.shs}}});
function reform(C,t){const B=t.bs,{api}=C;C.SMK.emit(t.p,0x050505,40,12,3,null,1,.9);B.cd=4;B.ref=1.2;const P=C.nearPilot(t.p),a=Math.random()*6.28;
 if(P){t.p.set(P.p.x+Math.cos(a)*1200,0,P.p.z+Math.sin(a)*1200);t.p.y=Math.max(api.gh(t.p.x,t.p.z)+60,P.p.y);t.v.subVectors(P.p,t.p).setLength(60)}else{t.p.y+=300}}
