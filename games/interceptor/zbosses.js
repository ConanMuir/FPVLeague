// Zombies boss roster: the shared registry (registerBoss) and the director that runs every registered boss. The bosses themselves live in
// zboss-*.js (one file each: model and decals, AI, phases, reward), listed in zboss-roster.js; the secret MIRV boss registers the same way.
//
// registerBoss(def): def.id is also the track kind (KIND[id], armour 'boss' unless def.armor says otherwise), def.resist = how well each helper
// type works against it (zdata RESIST, default 0), def.minor = a kind a boss brings along (relay pods, spectres, brood carriers, hijacked drones):
// no boss bar, no intro, no reward. Every hook is optional and gets ctx (below) first:
//   build(ctx,t)          the model (a THREE.Group, +Z forward; its geometry is freed with the track)
//   init(ctx,t)           host, the track's first step (place it, set its state); tick(ctx,t,dt) host, flies it every step
//   vis(ctx,t,dt)         every screen, every frame (lights, fires, decal swaps, aura)
//   hit(ctx,t,h)          returns the damage a hit does (0 = shrugged off; set h.txt to say why). h.q: 'kill' a direct hit, 'damage' a
//                         proximity burst, 'helper' a helper's kill roll, 'air' an airstrike; h.src 'p' you, 'o' another pilot, 'h' a helper;
//                         h.at = where your warhead went off
//   phase(ctx,t,i)        the bar's phase changed; phases = names, phaseAt = hit-point fractions where they change (default thirds)
//   seen(ctx,t) radar, hid(ctx,t) no FPV brackets, lockK / radarK / jinkK while it is alive, overlay(ctx,oc,t,W,H), radar(ctx,rc,P,t)
//   status(ctx,enc) the bar's status line; done(ctx,enc) the fight is won; persist = it outlives a wave: when the rest of the wave is down it
//   withdraws (save(ctx,t) keeps its run state; the track and its effects go) and comes back when the next wave starts (restore(ctx,t,state))
//   clear(ctx)            drop every effect the module draws or plays (wires, tethers, debris, missiles...): called at the end of each wave,
//                         at game over, quit and restart, together with the director's own cleanup (clearAll below)
//   netOut(ctx,t) / netIn(ctx,t,a) co-op extras; aim(ctx,t,skill) where a bot pilot would burst (tools/zbot.mjs),
//                         hear(ctx,t,pilot) what a pilot perceives of a boss that is heard, not seen (the Hush; the bots read it, zboss-brain.js)
//   spawn {boss: first boss wave it can replace the Mothership on, event: {from, p, once}}, reward {id, n, txt, ...effect hooks},
//   intro {title, sub, col} (or introFn), sting(snd) its signature sound, loop(snd) its presence sound (volume from loopVol(ctx,t))
//   g {init, start, step, vis, overlay, radar, wave, base, stop, note}: run-wide hooks (the Ghost of the Ace's wreck, the Undertaker's trigger)
// Numbers are game-balance values for feel, not real-world figures.
import {KIND,RESIST} from './zdata.js';
import {tex,dot} from '../../engine/render.js';
import {AC,nbuf} from '../../engine/audio.js';
import {gfx} from '../../engine/gfx.js';
import {warm} from '../../engine/warm.js';
import {initAtmos} from './zatmos.js';
import {particlePool} from '../../engine/particles.js';
import {ownRandom} from '../../engine/idle.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.random()*a.length|0];
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export const BOSSES={},ROSTER=[],REWARDS={};
export function registerBoss(def){const id=def.id;
 KIND[id]={n:def.n,tag:def.tag||def.n.toUpperCase(),pts:0,cash:def.cash??0,dmg:def.dmg??0,spd:def.spd??60,alt:def.alt||[400,600],hitR:def.hitR??3,armor:def.armor??'boss',from:999,det:def.det??9000,far:def.far,bossy:1,minor:def.minor?1:0};
 for(const h of Object.keys(RESIST))RESIST[h][id]=def.resist?.[h]??0;
 BOSSES[id]=def;if(!def.minor&&!def.child&&!ROSTER.includes(id))ROSTER.push(id);if(def.reward)REWARDS[def.reward.id]={...def.reward,boss:id};return def}
export const isBossKind=k=>!!BOSSES[k];
// decal canvases: one texture per key, drawn once (g = 2D context, w, h)
const DEC=new Map();
export const decal=(key,w,h,draw,rep)=>{let t=DEC.get(key);if(!t){t=ownRandom(()=>tex(w,h,draw,rep));DEC.set(key,t)}return t};  /* drawn with the idle stream (engine/idle.js): the warm-up may draw it first */
// shared drawing helpers for decals
export const D2={
 text(g,s,x,y,px,col,font='700',al='center'){g.font=`${font} ${px}px "Arial Narrow",Arial,sans-serif`;g.textAlign=al;g.textBaseline='middle';g.fillStyle=col;g.fillText(s,x,y)},
 stripes(g,x,y,w,h,c1,c2,k=14){g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.fillStyle=c1;g.fillRect(x,y,w,h);g.fillStyle=c2;for(let i=-h;i<w+h;i+=k*2){g.beginPath();g.moveTo(x+i,y);g.lineTo(x+i+k,y);g.lineTo(x+i+k-h,y+h);g.lineTo(x+i-h,y+h);g.fill()}g.restore()},
 panels(g,w,h,col,n=10,a=.25){g.strokeStyle=col;g.globalAlpha=a;g.lineWidth=1.5;for(let i=1;i<n;i++){g.beginPath();g.moveTo(i*w/n+rnd(-3,3),0);g.lineTo(i*w/n+rnd(-3,3),h);g.stroke()}for(let j=1;j<n/2;j++){g.beginPath();g.moveTo(0,j*h/(n/2));g.lineTo(w,j*h/(n/2));g.stroke()}
  g.globalAlpha=a*.8;g.fillStyle=col;for(let i=0;i<n*20;i++)g.fillRect(rnd(0,w),rnd(0,h),1.5,1.5);g.globalAlpha=1},
 grime(g,w,h,a=.12){for(let i=0;i<160;i++){g.fillStyle=`rgba(${Math.random()<.6?'0,0,0':'255,255,255'},${rnd(.02,a)})`;g.beginPath();g.ellipse(rnd(0,w),rnd(0,h),rnd(2,24),rnd(1,8),rnd(0,3),0,7);g.fill()}},
 skull(g,x,y,r,c,eye='#000'){g.fillStyle=c;g.beginPath();g.arc(x,y-r*.15,r,Math.PI*.95,Math.PI*2.05);g.lineTo(x+r*.6,y+r*.75);g.lineTo(x-r*.6,y+r*.75);g.closePath();g.fill();g.fillStyle=eye;for(const s of[-1,1]){g.beginPath();g.ellipse(x+s*r*.38,y-r*.1,r*.24,r*.28,0,0,7);g.fill()}
  g.beginPath();g.moveTo(x,y+r*.15);g.lineTo(x+r*.12,y+r*.4);g.lineTo(x-r*.12,y+r*.4);g.fill();for(let i=-2;i<=2;i++)g.fillRect(x+i*r*.2-r*.05,y+r*.55,r*.1,r*.22)},
 hex(g,x,y,r){g.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3+Math.PI/6;g.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}g.closePath()}};

export function initBosses(api,G,Z){
 const {THREE,scene,TH,gh,S,save,feed,banner}=api,V3=THREE.Vector3,$=id=>document.getElementById(id);
 const _a=new V3(),_b=new V3(),_c=new V3(),_s=new V3();
 const auth=()=>!Z.mirror,DFI=()=>Z.dfi?.()??1,hpK=()=>[.75,1,1.25,1.5][cl(DFI(),0,3)];
 const live=api.live,mine=t=>!!BOSSES[t.k];

 // ---------- the record kept between runs (localStorage through the settings): who you met, beat, lost to; the Ace's own tally ----------
 const rec=()=>{let r=S.zboss;if(!r||typeof r!=='object'||Array.isArray(r))r={};if(!r.b||typeof r.b!=='object'||Array.isArray(r.b))r.b={};
  for(const k of['ace','ghost']){if(!r[k]||typeof r[k]!=='object'||Array.isArray(r[k]))r[k]={};for(const f of Object.keys(r[k]))if(!Number.isFinite(r[k][f]))r[k][f]=0}
  for(const k of Object.keys(r.b)){const o=r.b[k];if(!o||typeof o!=='object'||Array.isArray(o))r.b[k]={met:0,won:0,lost:0};else for(const f of['met','won','lost'])o[f]=Number.isFinite(o[f])?o[f]:0}r.v=1;S.zboss=r;return r};
 const bump=(id,f,n=1)=>{const r=rec();const o=r.b[id]||(r.b[id]={met:0,won:0,lost:0});o[f]=(o[f]|0)+n;save()};
 const recAdd=(k,f,n=1)=>{const r=rec();r[k][f]=(r[k][f]|0)+n;save()};

 // ---------- sound: a small synth on the effects volume (S.zsfxv). sting = the boss's signature, loop = its presence while alive ----------
 const SND={get ok(){return!!AC&&!!nbuf&&!api.demo},vol:()=>cl(S.zsfxv??1,0,1),
  out(v=1){const g=AC.createGain();g.gain.value=v*SND.vol();g.connect(AC.destination);return g},
  osc(type,f,t0,dur,dst){const o=AC.createOscillator();o.type=type;o.frequency.value=f;o.start(t0);if(dur)o.stop(t0+dur+.05);if(dst)o.connect(dst);return o},
  nz(t0,dur,dst){const s=AC.createBufferSource();s.buffer=nbuf;s.loop=!dur;s.start(t0,Math.random()*1.2,dur?dur+.05:undefined);if(dst)s.connect(dst);return s},
  filt(type,f,q=.7){const b=AC.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b},
  env(t0,pk,a,dur,dst){const g=AC.createGain();g.gain.value=.0001;g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(Math.max(pk,.0002),t0+a);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);if(dst)g.connect(dst);return g},
  get t(){return AC.currentTime}};
 const sting=id=>{const D=BOSSES[id];if(!D?.sting||!SND.ok)return;try{D.sting(SND)}catch(e){console.warn('boss sting',e)}};
 const LOOPS=new Map();
 const stopLoops=()=>{for(const L of LOOPS.values())if(L){try{L.g.gain.cancelScheduledValues(0);L.g.gain.value=0;L.stop?.()}catch(e){}}LOOPS.clear()};
 function loops(){const want=new Set();if(SND.ok&&G.on&&!api.menuOpen)for(const t of TH)if(live(t)&&mine(t)&&BOSSES[t.k].loop&&!LOOPS.has(t)){try{LOOPS.set(t,BOSSES[t.k].loop(SND))}catch(e){console.warn('boss loop',e);LOOPS.set(t,null)}}
  for(const[t,L]of LOOPS){const D=BOSSES[t.k];if(!G.on||api.menuOpen||t.st==='dead'||!TH.includes(t)){if(L){try{L.g.gain.setTargetAtTime(0,AC.currentTime,.2);setTimeout(()=>L.stop?.(),800)}catch(e){}}LOOPS.delete(t);continue}
   if(!L)continue;const v=D.loopVol?D.loopVol(ctx,t):cl(1-t.p.distanceTo(api.camera.position)/2500,0,1)**2*.07;L.g.gain.setTargetAtTime(v*SND.vol()*(live(t)?1:.25),AC.currentTime,.15);L.set?.(ctx,t)}}

 // ---------- particle pools of the bosses' own (fire, sparks, smoke, contrails), so the cleanup can empty them; same look as the game's ----------
 function pool(N,size,blend,grav,drag){const P=new Float32Array(N*3).fill(-1e5),C=new Float32Array(N*4),B=new Float32Array(N*4),VV=new Float32Array(N*3),LF=new Float32Array(N),L0=new Float32Array(N);let i0=0,live=0;const c=new THREE.Color();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('color',new THREE.BufferAttribute(C,4));
  const pts=new THREE.Points(g,new THREE.PointsMaterial({size,map:dot,vertexColors:true,transparent:true,blending:blend,depthWrite:false,toneMapped:blend!==THREE.AdditiveBlending}));pts.frustumCulled=false;scene.add(pts);
  return{pts,emit(p,hex,n,spd,life=1,bv=null,k=1,a=1){c.set(hex).multiplyScalar(k);for(let j=0;j<n;j++){const i=i0++%N,i3=i*3,i4=i*4;let x=Math.random()*2-1,y=Math.random()*2-1,z=Math.random()*2-1;const m=spd*(.3+Math.random()*.7)/(Math.hypot(x,y,z)||1);
    P[i3]=p.x;P[i3+1]=p.y;P[i3+2]=p.z;VV[i3]=x*m+(bv?bv.x:0);VV[i3+1]=y*m+(bv?bv.y:0);VV[i3+2]=z*m+(bv?bv.z:0);B[i4]=c.r;B[i4+1]=c.g;B[i4+2]=c.b;B[i4+3]=a;LF[i]=L0[i]=life*(.5+Math.random()*.5)}live=1},
   upd(dt){if(!live)return;live=0;const dm=Math.exp(-dt*drag),W=api.WIND,wx=W.x*(1-dm),wz=W.z*(1-dm);for(let i=0;i<N;i++){if(LF[i]<=0)continue;const i3=i*3,i4=i*4;if((LF[i]-=dt)<=0){P[i3+1]=-1e5;C[i4+3]=0;live=1;continue}live=1;
    VV[i3]=VV[i3]*dm+wx;VV[i3+1]=VV[i3+1]*dm-grav*dt;VV[i3+2]=VV[i3+2]*dm+wz;P[i3]+=VV[i3]*dt;P[i3+1]+=VV[i3+1]*dt;P[i3+2]+=VV[i3+2]*dt;const f=Math.min(1,LF[i]/L0[i]*2);C[i4]=B[i4];C[i4+1]=B[i4+1];C[i4+2]=B[i4+2];C[i4+3]=B[i4+3]*f}
    g.attributes.position.needsUpdate=g.attributes.color.needsUpdate=true},
   clear(){live=0;LF.fill(0);P.fill(-1e5);C.fill(0);g.attributes.position.needsUpdate=g.attributes.color.needsUpdate=true},get active(){let n=0;for(let i=0;i<N;i++)if(LF[i]>0)n++;return n}}}
 // the bosses' own two pools on the engine's pooled particles (engine/particles.js: one draw per blend mode, only the live window of each
 // emitter is walked and uploaded, so idle emitters cost nothing); their own budget, so the game's pools keep theirs (the pool above is the fallback
 // for a build without engine/particles.js)
 const PA=particlePool?particlePool(scene,{max:1500,blend:THREE.AdditiveBlending,map:dot,toneMapped:false,wind:api.WIND}):null,PN=particlePool?particlePool(scene,{max:2400,map:dot,wind:api.WIND}):null;
 function shared(N,size,blend,grav,drag,scaled){const P=blend===THREE.AdditiveBlending?PA:PN;if(!P)return pool(N,size,blend,grav,drag);const e=P.emitter(N,size,grav,drag,scaled);
  return{pts:P.pts,emit:e.emit,upd:e.upd,clear:e.clear,get active(){return e.live}}}
 const BFX=shared(1500,1.6,THREE.AdditiveBlending,3,1.8,true),BSMK=shared(1800,10,THREE.NormalBlending,-2.5,.6,true);
 // haze: big slow puffs (a smoke pall, fog banks, mist, a swarm cloud) for the bosses' atmosphere (zatmos.js); counts scale with gfx.k.fx
 const BHZ=shared(600,70,THREE.NormalBlending,-.25,.12,false);  // not scaled by the pool: haze() below thins it with gfx.k.fx itself
 const haze=(p,hex,a,life,spd=1.5)=>{if(Math.random()<gfx.k.fx)BHZ.emit(p,hex,1,spd,life,null,1,a)};
 // ---------- flight helpers for the movers ----------
 const _tv=new V3();
 // turn the velocity toward des (unit) at rate rad/s, speed toward spd, bank into the turn, move, keep agl metres off the ground
 function steer(t,des,spd,rate,dt,agl=30){if(t.frz>0)spd*=.5;const cur=_tv.copy(t.v);let sp=cur.length();if(sp<1e-3){cur.copy(des);sp=1}else cur.divideScalar(sp);
  const a=Math.acos(cl(cur.dot(des),-1,1)),y0=Math.atan2(cur.x,cur.z);if(a>1e-5)cur.lerp(des,Math.min(1,rate*dt/a)).normalize();let dy=Math.atan2(cur.x,cur.z)-y0;dy=((dy+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  t.bank+=(cl(-dy/Math.max(dt,1e-4)*1.1,-1.2,1.2)-t.bank)*Math.min(1,dt*3);const ns=sp+(spd-sp)*Math.min(1,dt*.9);t.v.copy(cur).multiplyScalar(ns);t.spd=t.cs=Math.max(ns,1);
  t.p.addScaledVector(t.v,dt);const g=gh(t.p.x,t.p.z)+agl;if(t.p.y<g){t.p.y=g;if(t.v.y<0)t.v.y=0}}
 const dirTo=(t,p,o=new V3())=>o.subVectors(p,t.p).normalize();
 // a level heading toward p holding hAGL over the ground
 const levelTo=(t,p,hAGL,o=new V3())=>{o.set(p.x-t.p.x,0,p.z-t.p.z);const L=o.length()||1;o.divideScalar(L);o.y=cl((gh(t.p.x,t.p.z)+hAGL-t.p.y)/Math.max(60,L*.15),-.5,.5);return o.normalize()};
 const me=()=>{const d=api.player;return d&&d.dead<=0&&!api.demo?d:null};
 const pilots=()=>(Z.pilots?.()||[api.player]).filter(d=>d&&d.dead<=0);
 const nearPilot=p=>{let b=null,bd=1e18;for(const d of pilots()){const q=d.p.distanceToSquared(p);if(q<bd){bd=q;b=d}}return b};
 // relative aspect of a point (where you are) against a track: high / level / low and six / beam / head-on, left / right of its nose
 function aspect(from,t){const v=_a.copy(t.v);if(v.lengthSq()<1)v.set(0,0,1);v.normalize();const r=_b.subVectors(from,t.p),d=r.length()||1,c=r.dot(v)/d,el=r.y/d;
  const side=(v.z*r.x-v.x*r.z)>0?'LEFT':'RIGHT';return{el:el>.28?'HIGH':el<-.28?'LOW':'LEVEL',az:c<-.45?'SIX':c>.45?'HEAD':'BEAM',side,key:`${el>.28?'HIGH':el<-.28?'LOW':'LEVEL'} ${c<-.45?'SIX':c>.45?'HEAD':'BEAM'}`}}

 // ---------- your habits this run (the Mirror flies like you, the Ace reads you): height, speed, turn side, how you come at a track ----------
 const HB=()=>G.hab||(G.hab={n:0,alt:0,spd:0,L:0,R:0,asp:{},side:{LEFT:0,RIGHT:0},dets:0,yaw:null,t:0});
 function habits(dt){const d=me();if(!d||G.state!=='wave')return;const H=HB();if((H.t-=dt)>0)return;H.t=.25;const s=d.v.length();if(s<15)return;
  H.n++;H.alt+=d.p.y-gh(d.p.x,d.p.z);H.spd+=s;const yaw=Math.atan2(d.v.x,d.v.z);if(H.yaw!=null){let dy=yaw-H.yaw;dy=((dy+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;if(dy>.03)H.L++;else if(dy<-.03)H.R++}H.yaw=yaw;
  for(const t of TH){if(!live(t)||mine(t))continue;const r=t.p.distanceTo(d.p);if(r>420||r<30){if(r>600)t._hb=0;continue}if(t._hb)continue;const cv=-_c.subVectors(t.v,d.v).dot(_s.subVectors(t.p,d.p))/r;if(cv<5)continue;
   t._hb=1;const A=aspect(d.p,t);H.asp[A.key]=(H.asp[A.key]|0)+1;H.side[A.side]++}}
 const habit=()=>{const H=HB(),n=Math.max(1,H.n),tot=Object.values(H.asp).reduce((a,b)=>a+b,0),fav=Object.entries(H.asp).sort((a,b)=>b[1]-a[1])[0];
  return{n:H.n,alt:H.alt/n,spd:H.spd/n,turn:H.L>=H.R?1:-1,turnK:Math.max(H.L,H.R)/Math.max(1,H.L+H.R),fav:fav?fav[0]:'LEVEL SIX',favK:fav&&tot?fav[1]/tot:0,approaches:tot,side:H.side.LEFT>=H.side.RIGHT?'LEFT':'RIGHT'}};

 // ---------- encounters: one per boss fight (a pair of twins, a hive and its broods, a ghost and its legion share one) ----------
 const encs=()=>G.benc||(G.benc=[]);
 function newEnc(t){const D=BOSSES[t.k],e={id:t.k,D,list:[t],main:t,t0:G.wt||0,won:false,over:false,ph:0,st:{}};encs().push(e);t.bs.enc=e;return e}
 function join(e,t){if(!t)return;t.bs.enc=e;if(!e.list.includes(t))e.list.push(t)}
 const fightOf=t=>t?.bs?.enc;
 const encLive=e=>e.list.some(t=>live(t));

 // ---------- spawning ----------
 const SITE_C={x:0,z:1950};
 function spawn(id,o={}){const D=BOSSES[id];if(!D||!G.on)return null;const L=api.liveSites();if(!L.length)return null;
  const b=o.brg??(Math.random()-.5)*2.4,R=o.R??(KIND[id].far||5200),x=o.x??SITE_C.x+Math.sin(b)*R,z=o.z??SITE_C.z-Math.cos(b)*R;
  const t=Z.make(id,x,z,o.site);if(!t)return null;if(o.y!=null)t.p.y=o.y;if(o.v)t.v.copy(o.v);if(o.enc)join(o.enc,t);if(o.set)Object.assign(t.bs,o.set);return t}
 const maxHp=D=>Math.max(1,Math.round((typeof D.hp==='function'?D.hp(ctx):D.hp??3)*(D.minor?1:hpK())));

 // ---------- hits: every kill and damage call on a boss kind lands here (the game's code calls api.killThreat / api.damage / Z.bossHit) ----------
 const kt0=api.killThreat,dm0=api.damage,bh0=Z.bossHit;let inDet=0,pctx=null,pr=0;const LOG=[];
 const airNow=()=>G.strike&&G.strike.n===3;
 api.killThreat=(t,cat)=>{if(!mine(t)||!t.bs||t.bs.dead)return kt0(t,cat);if(t.bs.det)return;const air=airNow();hitBy(t,air?'air':t.by==='h'?'helper':'kill',air?'p':t.by==='o'?'o':t.by==='h'?'h':'p')};
 api.damage=t=>{if(!mine(t)||!t.bs)return dm0(t);if(t.bs.det)return;if(inDet||pctx===t)hitBy(t,'damage',t.by==='o'?'o':'p');else spark(t.p)};
 Z.bossHit=t=>{if(!mine(t))return bh0?.(t);const air=airNow();hitBy(t,air?'air':'helper',air?'p':'h')};
 const oc0=Z.outcome;Z.outcome=(t,r,cv)=>{if(mine(t)){pctx=t;pr=r;if(BOSSES[t.k].burst&&r<45)return'damage'}return oc0(t,r,cv)};  /* co-op: a client's burst, rolled on the host */
 const spark=p=>{BFX.emit(p,0xfff0c0,18,14,.35,null,3)};
 function hitBy(t,q,src){if(Z.mirror||!t.bs||t.bs.dead)return;const D=BOSSES[t.k],d=api.player,h={q,src,at:src==='p'&&d?d.p.clone():null,r:pctx===t?pr:null,txt:''};
  let n=D.hit?D.hit(ctx,t,h):q==='kill'?2:1;n=Math.max(0,n|0);LOG.push({t,n,txt:h.txt});if(LOG.length>32)LOG.shift();  /* only the last is read (Z.detonate clears it); helpers hit between bursts, and kept, it held every dead track */
  if(!n){spark(h.at||t.p);if(h.txt&&src!=='h')Z.pop?.(t.p,h.txt,'#9fb3c8');return}hurt(t,n,h)}
 function hurt(t,n,h={}){const B=t.bs;if(!B||B.dead)return;B.hp=Math.max(0,B.hp-n);B.hitT=performance.now();api.boom(h.at&&h.at.distanceTo(t.p)<40?h.at:t.p,1.4);Z.pop?.(t.p,`−${n} ${t.bs.hp}/${t.bs.max}`,'#ffb347');
  if(B.hp<=0){kill(t,h.src==='h'?'h':h.src==='o'?'o':'p');return}phaseCheck(t);BOSSES[t.k].hurt?.(ctx,t,n,h)}
 function phaseOf(t){const D=BOSSES[t.k],P=D.phases;if(!P)return 0;const at=D.phaseAt||P.map((_,i)=>1-i/P.length).slice(1),f=t.bs.hp/t.bs.max;let i=0;for(const a of at)if(f<=a+1e-6)i++;return Math.min(i,P.length-1)}
 function phaseCheck(t){const D=BOSSES[t.k];if(!D.phases)return;const i=phaseOf(t);if(i!==t.bs.ph){t.bs.ph=i;D.phase?.(ctx,t,i);if(!D.minor){Z.an?.say(D.phases[i],D.n,D.col||'#ff9a3c',2);Z.au?.rumble(.3,0,2)}}}
 function kill(t,by='p'){const B=t.bs;if(!B||B.dead)return;B.dead=1;t.by=by;const D=BOSSES[t.k];try{D.death?.(ctx,t)}catch(e){console.warn('boss death',e)}
  if(D.minor){kt0(t,true);return}api.boom(t.p,D.boomK||6);kt0(t,true);Z.fxTest?.slowmo(.18,.9,.8,.06);Z.au?.bossDown()}
 // gone without a kill (it escaped, impacted, or a split replaced it): no money, no reward
 function vanish(t,why){if(!t.bs||t.bs.dead)return;t.bs.dead=1;t.bs.gone=why||'gone';t.st='dead';if(why==='escaped'&&!BOSSES[t.k].minor){const D=BOSSES[t.k];feed(`<span class="co">${D.n} ${D.escTxt||'got away'}</span>`);Z.an?.say(`${D.tag||D.n.toUpperCase()} ESCAPED`,'no reward','#9fb3c8',2)}}
 // impact on a site (bosses that ram or bomb): through Z.impact so sandbags, fires, integrity and game over all apply
 function strike(t,site,dmg,aim){const fk={k:'shahed',tgt:site,aim:aim||site.aims[0],p:(aim||site.aims[0]).clone(),st:'cruise',_bdmg:dmg};Z.impact(fk);return fk}
 const i0=Z.impact;Z.impact=t=>{if(t._bdmg!=null){const s=t.tgt,K=KIND.shahed,dm=K.dmg;K.dmg=t._bdmg;try{i0(t)}finally{K.dmg=dm}return}const s=t.tgt,h0=s?.hp;i0(t);if(s&&h0>0&&s.hp>0)for(const R of rew())R.impact?.(ctx,s,h0-s.hp)};

 // ---------- the reward: run-long, listed on the base screen. Effects are the reward's own hooks (rew() = what you hold) ----------
 const rew=()=>Object.keys(G.brw||{}).map(k=>REWARDS[k]).filter(Boolean);
 function grant(id,silent){const R=REWARDS[id];if(!R)return false;G.brw=G.brw||{};if(G.brw[id])return false;G.brw[id]=1;R.grant?.(ctx);
  if(!silent){feed(`<span class="cg">Boss trophy: <b>${R.n}</b></span> · ${R.txt}`);Z.an?.radio('OVERLORD',`Trophy recovered: ${R.n}. ${R.short||''}`,2)}return true}
 function won(e){if(e.over)return;e.over=true;e.won=true;const D=e.D;bump(e.id,'won');const w=Math.max(1,G.wave),cash=Math.round((D.bounty||2500)*(1+w/25));Z.earn?.(cash,e.main.p,' BOSS');
  Z.an?.say(`${D.tag||D.n.toUpperCase()} DEFEATED`,`+${money(cash)}${D.reward?' · '+D.reward.n:''}`,D.col||'#ff9a3c',3);Z.an?.radio('OVERLORD',D.winTxt||`${D.n} is down. Outstanding.`,2);
  Z.netEv?.(['B',e.id,cash,D.reward?.n||'']);  /* the other pilots' screens get the same banner (Z.bossWon) */
  if(D.reward)grant(D.reward.id);D.won?.(ctx,e)}
 function lost(e){if(e.over)return;e.over=true;bump(e.id,'lost');e.D.lost?.(ctx,e)}
 function encTick(){for(const e of encs()){if(e.over)continue;const bodies=e.list.filter(t=>!BOSSES[t.k].minor);if(e.D.done?e.D.done(ctx,e):bodies.length&&bodies.every(t=>t.bs.dead&&!t.bs.gone)){won(e);continue}if(!encLive(e)&&!e.list.some(t=>t.st==='fall'))lost(e)}
  G.benc=encs().filter(e=>!e.over||(G.wt||0)-e.t0<1)}

 // ---------- the wave plan: some bosses replace the every-10 Mothership, the others are rare events after a wave of their own ----------
 // boss waves: wave 10 is always the Mothership; from 20 the pool is the Mothership and every boss whose first boss wave has come (earlier on
 // Hard / Nightmare by the difficulty's shift), favouring ones not met this run. Events: at most one a wave, three waves apart, never on a
 // boss wave; each eligible boss rolls its chance (x0.7 Easy, x1.25 Hard, x1.5 Nightmare); the wave around an event is 20% smaller.
 const EVK=[.7,1,1.25,1.5];
 Z.bossCompose=(out,w)=>{if(Z.mirror||G.state==='trial'||Z.bosses?.roster===false)return out;  /* roster false: the harness's plain-Zombies sections */const sh=Z.diff?.().shift|0,seen=G.bseen||(G.bseen={});
  if(G.bforce&&BOSSES[G.bforce]){const id=G.bforce;G.bforce=null;out.push(id);return out}
  const bi=out.indexOf('boss');
  if(bi>=0){if(w<20)return out;const pool=[['boss',seen.boss?1:2]];for(const id of ROSTER){const D=BOSSES[id];if(D.spawn?.boss&&w>=D.spawn.boss-sh&&(!D.can||D.can(ctx,w)))pool.push([id,seen[id]?1:3])}
   let tot=pool.reduce((a,p)=>a+p[1],0),r=Math.random()*tot;for(const[id,k]of pool){r-=k;if(r<=0){out[bi]=id;break}}return out}
  if(w-(G.bevW??-99)<3)return out;
  // only the eligible roll, so early waves draw no random numbers (their raids stay exactly as they were before the roster)
  const el=ROSTER.filter(id=>{const D=BOSSES[id],E=D.spawn?.event;return E&&w>=E.from-sh&&!(E.once&&seen[id])&&!(D.can&&!D.can(ctx,w))});
  for(const id of el.length>1?el.sort(()=>Math.random()-.5):el){const D=BOSSES[id],E=D.spawn.event;
   if(Math.random()<E.p*EVK[cl(DFI(),0,3)]*(E.again&&seen[id]?E.again:1)){G.bevW=w;for(let i=out.length-1;i>=0;i--)if(Math.random()<.2&&!BOSSES[out[i]])out.splice(i,1);out.push(id);break}}
  return out};

 // ---------- per step (host and every screen): first steps, intros, habits, run-wide hooks, bosses that withdraw, rewards ----------
 Z.tstep=(ts0=>(t,dt)=>{const D=BOSSES[t.k];if(!D||t.net)return ts0(t,dt);if(t.pp)t.pp.copy(t.p);else t.pp=t.p.clone();
  if(!t.bs.init){t.bs.init=1;t.bs.max=t.bs.hp=maxHp(D);if(!t.bs.enc&&!D.minor){newEnc(t);(G.bseen||(G.bseen={}))[t.k]=1;if(!t.bs.keep)bump(t.k,'met')}D.init?.(ctx,t);if(t.bs.keep){D.restore?.(ctx,t,t.bs.keep);if(t.bs.wake)D.wake?.(ctx,t)}}
  t.bs.age=(t.bs.age||0)+dt;if(D.tick)return D.tick(ctx,t,dt)!==false;return false})(Z.tstep);
 let st0=G.state;
 function intro(t){const D=BOSSES[t.k];t.bs.intro=1;if(D.minor)return;sting(t.k);if(D.introFn){D.introFn(ctx,t);return}const I=D.intro||{};
  const title=I.title||D.n.toUpperCase(),sub=typeof I.sub==='function'?I.sub(ctx,t):I.sub||'';Z.fxTest?.cine('boss',t,t.p,title,sub);
  Z.an?.say(title,sub,I.col||D.col||'#ff4d4d',3);if(I.radio)Z.an?.radio(I.who||'OVERLORD',typeof I.radio==='function'?I.radio(ctx,t):I.radio,2)}
 /* a wave ends (every effect goes), a wave starts, the base screen opens. Read on every step; a co-op client also calls it the moment its mirrored state changes
    (znet.js), because the base and game-over screens pause the sim: a client that never got a step in the wave's clear state would not see the wave end at all */
 function trans(){if(G.state===st0)return;const was=st0;st0=G.state;if(was==='wave'&&G.state!=='wave')clearAll('wave over');if(G.state==='wave'&&was!=='wave')waveStart();if(G.state==='base'&&was!=='base'){for(const D of Object.values(BOSSES))D.g?.base?.(ctx);for(const R of rew())R.base?.(ctx)}}
 Z.bossTrans=()=>{if(G.on)trans()};
 const s0=Z.step;Z.step=dt=>{s0(dt);if(!G.on)return;pctx=null;habits(dt);
  /* the fights are judged before the wave-end cleanup below closes them all unrecorded: the boss that was the last track down wins in this very step */
  if(auth())encTick();
  trans();
  if(G.state==='wave'||G.state==='clear')for(const t of TH)if(mine(t)&&!t.bs.intro&&live(t))intro(t);
  for(const D of Object.values(BOSSES))D.g?.step?.(ctx,dt);
  for(const R of rew())R.step?.(ctx,dt);
  if(auth()&&G.state==='wave'&&!G.wq.length){const L=TH.filter(live);if(L.length&&L.every(t=>mine(t)&&BOSSES[t.k].persist))for(const t of L)withdraw(t)}};
 // a boss that outlives the wave: its run state is kept (G.bkeep), the track and every effect go; it comes back next wave
 function withdraw(t){const D=BOSSES[t.k];(G.bkeep||(G.bkeep={}))[t.k]=D.save?D.save(ctx,t):{};const e=t.bs.enc;if(e)e.over=true;t.bs.dead=1;t.bs.gone='withdrew';t.st='dead';
  for(const u of TH)if(u.bs?.enc===e&&u!==t&&u.st!=='dead'){u.bs.dead=1;u.st='dead'}if(D.withdrawTxt)feed(D.withdrawTxt(ctx,t))}
 // ---------- the one cleanup path: every boss effect ends with the wave (and at game over, quit, restart). Kept: records, trophies, withdrawn
 // bosses' run state, the Ghost of the Ace's wreck (a map feature, not an effect). A boss still in the air here is simply gone. ----------
 function clearAll(why){for(const t of TH){if(mine(t)&&t.st!=='dead'){if(t.bs&&!t.bs.dead){t.bs.dead=1;t.bs.gone=why}t.st='dead'}if(t.iff)t.iff=0}
  for(const e of encs())e.over=true;G.benc=[];stopLoops();BO.length=0;bGeo.setDrawRange(0,0);BFX.clear();BSMK.clear();BHZ.clear();atmos.clear();for(const m of SHD){m.visible=false;m.userData.a=0}bar.hidden=true;barH='';
  for(const D of Object.values(BOSSES)){try{D.clear?.(ctx)}catch(e){console.warn('boss clear',e)}}}
 Z.bossClear=clearAll;
 function waveStart(){const K=G.bkeep||{};G.bkeep={};if(auth())for(const[id,st]of Object.entries(K)){const D=BOSSES[id];if(!D||!st||st.gone)continue;const t=spawn(id,{...(st.at||{}),set:{keep:st}});if(t)t.bs.wake=1}for(const D of Object.values(BOSSES))D.g?.wave?.(ctx);for(const R of rew())R.wave?.(ctx);
  /* a co-op client has no queue (placeholders only): the plan the host sent for this wave names the boss */
  const kinds=Z.mirror?(Z.netPlan?.()?.list||[]).map(k=>String(k).split(':')[0]):(G.wq||[]).map(q=>q.k.split(':')[0]);
  const nx=TH.filter(t=>mine(t)&&live(t)&&!BOSSES[t.k].minor).length+kinds.filter(k=>BOSSES[k]).length;
  if(nx){const q=kinds.find(k=>BOSSES[k]);const D=q?BOSSES[q]:null;if(D)setTimeout(()=>{if(G.on&&G.state==='wave'){Z.an?.say(`${D.tag||D.n.toUpperCase()} INBOUND`,D.warn||'boss contact','#ff4d4d',3);Z.au?.siren?.(true)}},60)}}

 // ---------- radar, lock, helpers: what an alive boss does to them, and what your trophies do ----------
 const alive=()=>TH.filter(t=>mine(t)&&live(t));
 const lj0=Z.lockJam;Z.lockJam=t=>{let k=lj0?.(t)??1;for(const u of alive()){const D=BOSSES[u.k];if(D.lockK)k*=D.lockK(ctx,u,t)}for(const R of rew())if(R.lockK)k*=R.lockK(ctx,t);if(mine(t)&&BOSSES[t.k].lockSelf)k*=BOSSES[t.k].lockSelf(ctx,t);return k};
 const rk0=Z.radarK;Z.radarK=()=>{let k=rk0?.()??1;for(const u of alive()){const D=BOSSES[u.k];if(D.radarK)k*=D.radarK(ctx,u)}for(const R of rew())if(R.radarK)k*=R.radarK(ctx);return k};
 const jk0=Z.jink;Z.jink=t=>{let k=jk0?.(t)??1;for(const u of alive()){const D=BOSSES[u.k];if(D.jinkK)k*=D.jinkK(ctx,u,t)}return k};
 const se0=Z.seen;Z.seen=t=>{const D=BOSSES[t.k];if(D?.seen)return D.seen(ctx,t);for(const R of rew())if(R.seen){const v=R.seen(ctx,t);if(v!=null)return v}return se0(t)};
 const id0=Z.ident;Z.ident=t=>rew().some(R=>R.ident?.(ctx,t))||!!id0?.(t);
 Z.hid=t=>{const D=BOSSES[t.k];return!!(D?.hid&&D.hid(ctx,t))};
 const rc0=Z.rcol;Z.rcol=(t,s)=>t.iff>0?'61,220,132':rc0(t,s);
 const ocl0=Z.ocol;Z.ocol=(t,s)=>t.iff>0?'#3ddc84':ocl0(t,s);
 const tn0=Z.tname;Z.tname=t=>{const D=BOSSES[t.k];if(D?.tname)return D.tname(ctx,t);if(t.iff>0&&!D)return`T${String(t.id).padStart(2,'0')} FRIENDLY`;return tn0(t)};
 const lb0=Z.label;Z.label=t=>{const D=BOSSES[t.k];if(D?.label)return D.label(ctx,t);if(t.iff>0)return'IFF <span class="cg">FRIENDLY</span>';return lb0(t)+(D&&t.bs&&!D.minor?` · ${t.bs.hp}/${t.bs.max}`:'')};
 const kn0=Z.kindNote;Z.kindNote=k=>BOSSES[k]?.note||kn0(k);
 const tc0=Z.tacNote;Z.tacNote=()=>{let h=tc0?.()||'';const q=(G.next?.list||[]).map(s=>s.split(':')[0]).filter(k=>BOSSES[k]);
  for(const k of q){const D=BOSSES[k];h+=`<p class="zhint"><b class="cr">BOSS · ${D.n}</b>: ${D.note||''}</p>`}
  for(const D of Object.values(BOSSES)){const n=D.g?.note?.(ctx);if(n)h+=n}
  const R=rew();if(R.length)h+=`<p class="zhint"><b class="cg">Boss trophies</b>: ${R.map(r=>`<b>${r.n}</b> (${r.short||r.txt})`).join(' · ')}</p>`;return h};
 const dt0=Z.detonate;Z.detonate=()=>{inDet=1;LOG.length=0;const st=G.streak,d=api.player,B=[];
  // bosses that judge the burst themselves (weak points) get it once, from anywhere within 45 m
  if(d)for(const t of TH)if(mine(t)&&live(t)&&BOSSES[t.k].burst&&t.p.distanceTo(d.p)<45){t.by='p';hitBy(t,'burst','p');t.bs.det=1;B.push(t)}
  try{dt0()}finally{inDet=0;for(const t of B)t.bs.det=0}
  if(LOG.length){const L=LOG[LOG.length-1],D=BOSSES[L.t.k];if(!D.minor){G.streak=L.n?st+1:st;banner(L.n?`HIT — ${(D.tag||D.n).toUpperCase()} −${L.n}`:L.txt||'NO EFFECT',L.n?'cg':'co',1.4)}}};

 // ---------- friendly bolts: the trophies' own interceptors (Twin darts, the captured hive's counter-swarm) ----------
 const BO=[],BN=48,bPos=new Float32Array(BN*3),bCol=new Float32Array(BN*3),bGeo=new THREE.BufferGeometry();bGeo.setAttribute('position',new THREE.BufferAttribute(bPos,3));bGeo.setAttribute('color',new THREE.BufferAttribute(bCol,3));
 const bPts=new THREE.Points(bGeo,new THREE.PointsMaterial({size:10,sizeAttenuation:false,vertexColors:true,map:dot,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));bPts.frustumCulled=false;bGeo.setDrawRange(0,0);scene.add(bPts);
 function bolt(from,t,o={}){if(BO.length>=BN||!t)return null;const b={p:from.clone(),v:new V3(0,o.spd||150,0),t,spd:o.spd||150,pk:o.pk??.7,col:o.col||[.4,.9,1],life:o.life||40,trail:o.trail??.6,sw:o.sw};BO.push(b);return b}
 function boltTick(dt){if(!BO.length){if(bGeo.drawRange.count)bGeo.setDrawRange(0,0);return}for(let i=BO.length-1;i>=0;i--){const b=BO[i];b.life-=dt;const t=b.t;if(!t||!live(t)||b.life<=0){if(b.retarget&&b.life>0){b.t=b.retarget();if(b.t)continue}BO.splice(i,1);continue}
   const r=_a.subVectors(t.p,b.p),d=r.length();if(d<9){BO.splice(i,1);api.boom(b.p,.6);if(auth()){const o=Z.helperHit(t,b.pk,.6);if(o==='kill')Z.helperKill(t);else if(o==='damage')api.damage(t)}continue}
   const des=r.addScaledVector(t.v,Math.min(3,d/b.spd)).normalize();b.v.lerp(des.multiplyScalar(b.spd),Math.min(1,dt*3)).setLength(b.spd);b.p.addScaledVector(b.v,dt);
   if(Math.random()<b.trail)BSMK.emit(b.p,0xd8d4cc,1,1,2.2,null,1,.45)}
  let n=0;for(const b of BO){bPos[n*3]=b.p.x;bPos[n*3+1]=b.p.y;bPos[n*3+2]=b.p.z;bCol[n*3]=b.col[0]*2;bCol[n*3+1]=b.col[1]*2;bCol[n*3+2]=b.col[2]*2;n++}
  bGeo.setDrawRange(0,n);bGeo.attributes.position.needsUpdate=bGeo.attributes.color.needsUpdate=true}

 // ---------- the boss bar (top of the screen): name, phase, hit points (one bar per body), the fight's status line ----------
 const bar=document.createElement('div');bar.id='zbb';bar.className='osd';bar.hidden=true;$('hud').append(bar);
 const css=document.createElement('style');css.textContent=`#zbb{position:absolute;top:calc(122px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(460px,82vw);display:grid;gap:3px;text-align:center;font:700 12px var(--mono);pointer-events:none}
#zbb .n{font:italic 700 19px var(--disp,'Chakra Petch'),sans-serif;letter-spacing:.07em;color:#fff;text-shadow:0 0 12px var(--bc),0 2px 0 rgba(0,0,0,.6)}#zbb .n small{font:700 12px var(--mono);color:var(--bc);margin-left:8px;letter-spacing:.04em}
#zbb .bars{display:flex;gap:6px}#zbb .bar{flex:1;height:9px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.28);border-radius:3px;overflow:hidden;position:relative}
#zbb .bar i{position:absolute;inset:0 auto 0 0;background:var(--bc);box-shadow:0 0 8px var(--bc);transition:width .25s}#zbb .bar u{position:absolute;top:0;bottom:0;width:2px;background:rgba(0,0,0,.75)}#zbb .bar.dead{opacity:.35}
#zbb .s{color:#e4ebf2;font-size:11.5px;text-shadow:0 0 3px #000}#zbb .s b{color:var(--bc)}#hud:not(.z) #zbb,#hud.zcine #zbb{display:none}`;document.head.append(css);
 let barH='';
 function barTick(){const e=encs().find(e=>!e.over&&encLive(e)&&e.list.some(t=>live(t)));if(!e||!G.on||api.demo){if(!bar.hidden)bar.hidden=true;return}
  const D=e.D,main=e.list.find(t=>live(t)&&!BOSSES[t.k].minor)||e.main,B=main.bs;if(!B?.max)return;const ph=D.phaseName?D.phaseName(ctx,e):D.phases?.[B.ph]||'';
  const bodies=e.list.filter(t=>!BOSSES[t.k].minor&&t.bs?.max),at=D.phaseAt||(D.phases?D.phases.map((_,i)=>1-i/D.phases.length).slice(1):[]);
  const h=`<div class="n">${(D.barName?.(ctx,e)||D.n).toUpperCase()}<small>${ph}</small></div><div class="bars">${bodies.map(t=>`<span class="bar ${t.bs.dead?'dead':''}"><i style="width:${(t.bs.dead?0:t.bs.hp/t.bs.max*100).toFixed(1)}%"></i>${at.map(a=>`<u style="left:${(a*100).toFixed(1)}%"></u>`).join('')}</span>`).join('')}</div><div class="s">${D.status?.(ctx,e)||''}</div>`;
  bar.style.setProperty('--bc',D.col||'#ff4d4d');if(h!==barH)bar.innerHTML=barH=h;bar.hidden=false}

 // ---------- hooks: visuals, overlay, radar, hud, start / stop ----------
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);BFX.pts.visible=BSMK.pts.visible=BHZ.pts.visible=G.on;atmos.tick(api.menuOpen?0:dt);if(!G.on)return;BFX.upd(dt);BSMK.upd(dt);BHZ.upd(dt);shadows(dt);for(const t of TH)if(mine(t)&&t.bs&&t.st!=='dead')BOSSES[t.k].vis?.(ctx,t,dt);for(const D of Object.values(BOSSES))D.g?.vis?.(ctx,dt);boltTick(api.menuOpen?0:dt);loops()};
 const o0=Z.overlay;Z.overlay=oc=>{o0(oc);if(!G.on||api.demo||Z.cine)return;const W=innerWidth,H=innerHeight;oc.save();oc.textAlign='center';oc.font='700 12px "JetBrains Mono",monospace';oc.shadowColor='#000';oc.shadowBlur=4;
  for(const t of TH)if(mine(t)&&t.bs&&t.st!=='dead')BOSSES[t.k].overlay?.(ctx,oc,t,W,H);for(const D of Object.values(BOSSES))D.g?.overlay?.(ctx,oc,W,H);oc.restore()};
 const r0=Z.radar;Z.radar=(rc,P,sel,K)=>{r0(rc,P,sel,K);if(!G.on)return;rc.save();for(const t of TH)if(mine(t)&&t.bs&&t.st!=='dead')BOSSES[t.k].radar?.(ctx,rc,P,t);for(const D of Object.values(BOSSES))D.g?.radar?.(ctx,rc,P);rc.restore()};
 const h0=Z.hud;Z.hud=dt=>{h0(dt);barTick()};
 const zs=Z.start;Z.start=()=>{clearAll('restart');zs();G.bkeep={};G.benc=[];G.brw={};G.bseen={};G.bevW=-99;G.hab=null;G.fallen={};BO.length=0;rec();
  const q=new URLSearchParams(location.search).get('zboss');G.bforce=q&&BOSSES[q]?q:null;for(const D of Object.values(BOSSES))D.g?.start?.(ctx)};
 const zx=Z.stop;Z.stop=()=>{zx();clearAll('quit');G.bkeep={};for(const D of Object.values(BOSSES))D.g?.stop?.(ctx)};
 // kills you made of ordinary kinds this run (the Ghost of the Ace raises them as spectres)
 const k0=Z.kill;Z.kill=(t,cat)=>{const was=t.paid;k0(t,cat);if(!was&&t.paid&&!mine(t)&&(t.by==='p'||t.by==='o')&&G.fallen)G.fallen[t.k]=(G.fallen[t.k]|0)+1;if(mine(t))BOSSES[t.k].killed?.(ctx,t);if(!was&&t.paid)for(const D of Object.values(BOSSES))D.g?.kill?.(ctx,t)};

 // ---------- co-op: the host's boss state rides on each boss track in the snapshot (znet.js) ----------
 Z.bossOut=t=>{if(!t.bs)return[];const D=BOSSES[t.k];return[t.bs.hp|0,t.bs.max|0,t.bs.ph|0,...(D.netOut?.(ctx,t)||[])]};
 /* a co-op client holds the trophies the host won (znet.js sends the ids). The pilot-local ones work there as they do solo (radar, lock-on, the Crown's immunity, the Array's ears, Deathless,
    the Shard); the ones that run the host's world (the Hive's counter-swarm, the Darts, the Ledger, the Plating...) guard themselves with auth() */
 Z.brwIn=ids=>{if(auth()||!Array.isArray(ids))return;const B=G.brw||(G.brw={});
  for(const id of ids){const R=typeof id==='string'?REWARDS[id]:null;if(!R||B[id])continue;B[id]=1;try{R.grant?.(ctx)}catch(e){console.warn('trophy',e)}feed(`<span class="cg">Boss trophy: <b>${R.n}</b></span> · ${R.txt}`)}};
 /* a co-op client: the host's win over a boss (znet.js event B: kind, bounty, trophy), shown and heard like the host's own */
 Z.bossWon=a=>{const D=BOSSES[a[0]];if(!D||D.minor||auth())return;const nm=String(a[2]||'').replace(/[<>&"'`]/g,'').slice(0,40);
  Z.an?.say(`${D.tag||D.n.toUpperCase()} DEFEATED`,`+${money(+a[1]||0)}${nm?' · '+nm:''}`,D.col||'#ff9a3c',3);Z.an?.radio('OVERLORD',D.winTxt||`${D.n} is down. Outstanding.`,2);Z.au?.bossDown()};
 Z.bossIn=(t,a)=>{if(!t.bs||!Array.isArray(a))return;const D=BOSSES[t.k];if(Number.isFinite(a[0]))t.bs.hp=a[0];if(Number.isFinite(a[1])&&a[1]>0)t.bs.max=a[1];if(Number.isFinite(a[2])&&a[2]!==t.bs.ph){t.bs.ph=a[2]|0;D.phase?.(ctx,t,t.bs.ph);if(!D.minor&&D.phases?.[t.bs.ph])Z.an?.say(D.phases[t.bs.ph],D.n,D.col||'#ff9a3c',2)}  /* the phase banner, as phaseCheck gives it on the host */
  if(!t.bs.enc&&!D.minor){t.bs.init=1;newEnc(t)}D.netIn?.(ctx,t,a.slice(3))};

 // ---------- what the boss modules get ----------
 const ctx={api,G,Z,THREE,V3,S,SND,FX:BFX,SMK:BSMK,HAZE:BHZ,haze,gfx,BOSSES,REWARDS,decal,D2,cl,rnd,pick,money,auth,me,pilots,nearPilot,aspect,habit,steer,dirTo,levelTo,spawn,join,fightOf,encs,hurt,kill,vanish,strike,grant,rew,bolt,BO,rec,recAdd,bump,hpK,DFI,spark,intro,
  get wt(){return G.wt||0},
  // lose your interceptor to enemy fire (the Ace's missile, the Mirror's burst); the Deathless trophy may save it (zboss-ace.js)
  shoot(why){const d=me();if(!d)return false;if(rew().some(R=>R.save?.(ctx,why)))return false;api.lose('shot');feed(`<span class="cr">Interceptor lost: ${why}</span>`);return true},
  // a tidy group: geometries made for one track are freed with it (interceptor.js dropMesh)
  group(){const g=new THREE.Group();g.userData.own=1;return g},
  mesh(g,geo,mat,x=0,y=0,z=0,shadow=true){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=shadow;g.add(m);return m},
  sites:()=>api.liveSites(),siteC:SITE_C};
 // ---------- atmosphere (zatmos.js): what each boss does to the battlefield's look, eased in and out, composed with the weather ----------
 const atmos=initAtmos(api,G,Z,BOSSES);atmos.ctx=ctx;Z.atmos=atmos;
 // the Mothership (zenemy.js): a looming soft shadow on the ground under it, cast along the sun, and the light dims as you pass beneath
 // its silhouette (the flying wing, nose toward +z = the top of the canvas... drawn flipped so +z is up), blurred, inside a soft dark pool
 const shTex=decal('mship-shadow',256,256,(g,w)=>{const c=w/2,r=g.createRadialGradient(c,c,10,c,c,c);r.addColorStop(0,'rgba(0,0,0,.55)');r.addColorStop(.6,'rgba(0,0,0,.3)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,w);
  g.filter='blur(7px)';g.fillStyle='rgba(0,0,0,.95)';g.beginPath();g.moveTo(c,c+80);g.lineTo(c+110,c-30);g.lineTo(c+92,c-52);g.lineTo(c,c-24);g.lineTo(c-92,c-52);g.lineTo(c-110,c-30);g.closePath();g.fill();g.filter='none'});
 const shMat=new THREE.MeshBasicMaterial({map:shTex,color:0x000000,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
 const SHD=[0,1,2].map(()=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1,12,12).rotateX(-Math.PI/2),shMat.clone());m.visible=false;m.renderOrder=1;m.frustumCulled=false;m.userData.a=0;scene.add(m);return m});warm(shMat);
 const _sd=new V3(),_gp=new V3();
 function shGround(t,out){_sd.subVectors(api.sun.position,api.sun.target.position).normalize();const y=gh(t.p.x,t.p.z),k=_sd.y>.2?(t.p.y-y)/_sd.y:0;out.copy(t.p).addScaledVector(_sd,-k);out.y=gh(out.x,out.z)+.6;return t.p.y-y}
 // draped over the ground: each vertex sits on the terrain (a flat plane would sink into the hills)
 function drape(m){const a=m.geometry.attributes.position,s=m.scale.x,c=m.position,co=Math.cos(m.rotation.y),si=Math.sin(m.rotation.y);for(let i=0;i<a.count;i++){const lx=a.getX(i),lz=a.getZ(i),x=c.x+(lx*co+lz*si)*s,z=c.z+(lz*co-lx*si)*s;a.setY(i,(gh(x,z)+1.2-c.y)/s)}a.needsUpdate=true}
 function shadows(dt){let i=0;for(const t of TH){if(t.k!=='boss'||!live(t)||i>=SHD.length)continue;const m=SHD[i++],alt=shGround(t,m.position);m.scale.setScalar(110+alt*.05);m.rotation.y=Math.atan2(t.v.x,t.v.z);if((m.userData.dr=(m.userData.dr||0)-dt)<=0){m.userData.dr=.1;drape(m)}m.userData.a+=(.85-m.userData.a)*Math.min(1,dt*.8);m.material.opacity=m.userData.a;m.visible=true}
  for(;i<SHD.length;i++){const m=SHD[i];if(!m.visible)continue;m.userData.a*=Math.exp(-dt*1.2);m.material.opacity=m.userData.a;if(m.userData.a<.01)m.visible=false}}
 atmos.ext.boss=(t,o)=>{shGround(t,_gp);const d=Math.hypot(api.camera.position.x-_gp.x,api.camera.position.z-_gp.z);o.light=.42;o.dark=.5;o.vign=.42;o.desat=.18;o.fog=.75;o.fogC.set(0x23262c);o.fogMix=.35;return cl(1.15-d/1000,0,1)};
 const dr0=Z.en.dress;Z.en.dress=t=>{const D=BOSSES[t.k];if(!D)return dr0(t);t.inst=false;t.shade=0;t._seen=1;t.bank=t.bank||0;t.bs={hp:1,max:1,ph:0,init:0,dead:0};
  let m=null;try{m=D.build?D.build(ctx,t):null}catch(e){console.warn('boss build',t.k,e)}t.mesh=m||new THREE.Object3D();if(t.mesh.parent!==scene)scene.add(t.mesh)};

 // harness and the spectator: spawn any boss now, force one into the next plan, read the record, grant a trophy
 Z.bosses={BOSSES,ROSTER,REWARDS,ctx,roster:(()=>{try{return sessionStorage.getItem('zbossRoster')!=='0'}catch(e){return true}})(),  /* the harness turns it off for its plain-Zombies sections */
 spawn:(id,o)=>spawn(id,o),force:id=>{if(BOSSES[id])G.bforce=id;return!!BOSSES[id]},rec,grant,habit,
  get encs(){return encs()},get shadows(){return SHD},
  // what is left of the bosses' effects (tests: all zero after a wave ends)
  fx(){const o={tracks:TH.filter(t=>mine(t)&&t.st!=='dead').length,loops:LOOPS.size,fx:BFX.active,smoke:BSMK.active,haze:BHZ.active,atmos:atmos.sources,grade:atmos.pass.enabled?1:0,shadows:SHD.filter(m=>m.visible).length,bolts:BO.length,bar:!bar.hidden,iff:TH.filter(t=>t.iff>0&&t.st!=='dead').length,encs:encs().filter(e=>!e.over).length};
   for(const D of Object.values(BOSSES))if(D.fxLeft)Object.assign(o,D.fxLeft(ctx));return o},alive:()=>TH.filter(t=>mine(t)&&t.st!=='dead'),
  // a pilot hit as if your warhead went off at the given point (tests): q 'kill' direct, 'damage' proximity
  hitAt(t,q,at){const d=api.player;if(at&&d)d.p.copy(at);inDet=1;try{hitBy(t,q,'p')}finally{inDet=0}},
  // bot pilots (tools/zbot.mjs): a burst on a live boss from where the boss module says a pilot of this skill would be
  bot(skill){const d=me();if(!d)return null;const L=TH.filter(t=>mine(t)&&live(t)&&BOSSES[t.k].aim).sort((a,b)=>(BOSSES[a.k].minor?1:0)-(BOSSES[b.k].minor?1:0));for(const t of L){const A=BOSSES[t.k].aim(ctx,t,skill);if(!A)continue;
   d.p.copy(A.p);d.v.copy(A.v||t.v);t.by='p';Z.detonate();return t.k}return null}};
 /* run-wide setup that needs the finished ctx (the Hush mounts its audio-assist setting) */
 for(const D of Object.values(BOSSES)){try{D.g?.init?.(ctx)}catch(e){console.warn('boss init',e)}}
 return Z.bosses}
