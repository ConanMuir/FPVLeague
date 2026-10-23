/* Zombies "Little Buddy": your Drone League garage quad flies in Zombies as a free helper. Nobody steers it: every few seconds it picks a job on its own.
   Jobs (zbuddata.js JOBS): ESCORT flies on your wing, BUMP rams small drones (FPV swarms, decoys, Shaheds) to slow them and now and then knock one down, SPOT hangs
   by the track you have selected (your pip) and marks it so your lock builds faster, HARASS circles a boss's weak point and marks it for the helpers (it never
   damages a boss, so it can never finish one), HERD pushes lone stragglers off their line and slows them, RECHARGE lands on the radar pad when its charge or
   health runs low and PERCH waits there when there is nothing to do. It talks a little (the HUD card and the feed: "Buddy: on it").
   It is free and there from every wave start while a Drone League garage save exists (zbuddata.js readGarage). One set per wave: a crash (health gone, or the
   charge ran out in the air) keeps it down until the next wave, like the personal swarm. Its numbers come from the garage parts (zbuddata.js PARTS), and
   the hover tooltip on its card and on the base screen shows which part drives which number.
   It must not steal the fun: its kills are capped (K.cap of all kills in a run, K.waveMax a wave; canKill below), most bumps only slow, and a boss is only marked.
   Co-op (znet.js hooks Z.bdOut / bdIn / bdSnap / bdHost / bdGone): each pilot gets their own. Pilots send only their garage loadout (and the track they have
   selected); the host flies every buddy and sends their state in its snapshot, the others draw them from that, dead-reckoned between snapshots (like helper shots). */
import {KIND} from './zdata.js';
import {gfx} from '../../engine/gfx.js';
import {html} from '../../engine/hot.js';
import {K,RAM,JOBS,JOBN,SAYS,SAYL,STOCK_IDS,statsOf,tipOf,readGarage,cleanIds,cleanCos} from './zbuddata.js';
import {loadParts,partsReady,partsFailed,buildModel,freeModel,buildTag,freeTag} from './zbudmodel.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),ST=['off','pad','fly','down'],hyp=(x,z)=>Math.sqrt(x*x+z*z),pct=(v,m)=>cl(Math.round(100*v/m),0,100);
const SAYK={bump:'bump',spot:'spot',harass:'harass',herd:'herd',escort:'escort',recharge:'home'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
export function initBuddy(api,G,Z){
 const {THREE,TH,PADP,gh}=api,V3=THREE.Vector3,$=id=>document.getElementById(id),auth=()=>!Z.mirror;
 const _a=new V3(),_b=new V3(),_c=new V3(),_d=new V3(),_h=new V3(),_e=new THREE.Euler();
 const BD=new Map(),SPOTS=[],SLOW=[];
 const rd=k=>{try{return localStorage.getItem(k)}catch(e){return null}},garage=()=>readGarage(rd);
 let GAR=garage(),bk=0,wasLive=false,lastFeed=-99,shOn=true,hudL='',tipL='';
 const isMain=t=>t.k==='boss'||!!KIND[t.k]?.bossy&&!KIND[t.k].minor;
 const live=()=>G.on&&(G.state==='wave'||G.state==='clear')&&!api.demo;
 const total=()=>G.kills.p+G.kills.h;
 /* a kill needs room: at most K.cap of all kills in the run (this one included) and K.waveMax in this wave */
 const canKill=b=>bk+1<=K.cap*(total()+1)&&(!b||b.wk<K.waveMax);
 const slotP=(b,out)=>{const x=PADP.x-9+6*(b.n&3),z=PADP.z-6;return out.set(x,Math.max(gh(x,z),PADP.y||0)+.35,z)};  /* a spot on the radar pad each (the hut and the mast are on its south side) */

 /* ---------- the buddies: mine, and in co-op one per other pilot (keyed by their peer) ---------- */
 function make(key,src){let n=0;const used=new Set([...BD.values()].map(b=>b.n));while(used.has(n))n++;
  const b={key,src,n,own:key==='me',has:false,ids:[...STOCK_IDS],cos:null,st:statsOf(STOCK_IDS),model:null,tag:null,rb:false,nm:'',
   state:'off',job:'perch',tgt:null,skip:null,jt:0,tc:0,fT:0,w:-1,hp:100,chg:80,hpP:100,chP:100,kills:0,wk:0,bumps:0,cd:0,mkT:0,dT:0,say:-1,sayN:0,sayT:0,spId:0,sel:0,low:false,ph:Math.random()*6,yaw:0,
   p:new V3(),v:new V3(),q:new THREE.Quaternion(),acc:new V3(),np:new V3(),nv:new V3(),goal:new V3()};BD.set(key,b);return b}
 api.interp?.add(each=>{for(const b of BD.values())if(b.state!=='off')each(b)});  /* drawn between its last two sim ticks (engine/interp.js) */
 const mine=make('me',()=>{const d=api.player,t=d&&d.dead<=0?api.selT():null;return d?{p:d.p,v:d.v,ok:d.dead<=0,sel:t&&api.live(t)?t.id:0}:null});
 function adopt(b,ids,cos,has){const k=ids.join()+'|'+(cos||[]).join();if(k!==b.k0){b.k0=k;b.ids=ids;b.cos=cos;b.rb=true;b.st=statsOf(ids);b.tip=tipOf(ids,b.st)}b.has=has}
 const NONE={p:new V3(),v:new V3(),ok:false,sel:0},anchor=b=>b.src?.()||NONE;
 /* the League's parts load once, lazily; models are built then (on the base screen, not mid-wave) and rebuilt if they were the plain stand-in */
 const lp=()=>loadParts().then(()=>{for(const b of BD.values())if(b.has&&(!b.model||b.rb||b.model.kind!=='parts'&&partsReady())){b.rb=true;ensureModel(b)}});

 let force=null;  /* tests: a garage {has, ids, cos} used instead of the saved one (pages of one browser share localStorage, so a co-op test cannot give each pilot their own save) */
 const reread=()=>{GAR=force||garage();adopt(mine,GAR.ids,GAR.cos,GAR.has);if(GAR.has)lp()};
 /* ---------- a wave starts: the buddy is on the pad, charged and mended ---------- */
 function waveStart(b){b.w=G.wave;b.wk=0;b.tgt=b.skip=null;b.spId=0;b.hp=b.st.tuf;b.chg=b.st.end;b.dT=0;b.low=false;
  if(b===mine){reread();b.hp=b.st.tuf;b.chg=b.st.end}
  if(!b.has||b===mine&&Z.idle?.()){b.state='off';return}  /* no garage, or joined mid-wave */
  b.state='pad';b.job='perch';b.jt=.8;slotP(b,b.p);b.v.set(0,0,0);b.yaw=0;api.interp?.cut(b);if(b.own)say(b,'ready')}

 /* ---------- talking: a line on the card, and now and then in the feed (my buddy only) ---------- */
 function say(b,k){if(b.sayT>0&&k!=='down')return;const L=SAYS[k];if(!L)return;const s=L[Math.random()*L.length|0];b.say=SAYL.indexOf(s);b.sayN++;b.sayT=4.5;if(b.own)feedLine(s,k==='down')}
 function feedLine(s,force){const now=performance.now();if(!force&&now-lastFeed<9000)return;lastFeed=now;api.feed(`<span class="cb">${s}</span>`)}

 /* ---------- choosing a job (every few seconds, and at once when its target is gone) ---------- */
 /* the charge it needs to get home from here (with a margin), never less than K.low of a full charge */
 const needChg=b=>Math.max(b.st.end*K.low,slotP(b,_h).distanceTo(b.p)/(b.st.spd*.8)+10);
 function setJob(b,job,tgt=null){const was=b.job;b.job=job;b.tgt=tgt;b.fT=0;b.tc=0;b.jt=rnd(K.pick[0],K.pick[1]);if(job!==was&&SAYK[job]&&b.state!=='down')say(b,SAYK[job]);
  if(b.state==='pad'&&job!=='perch'&&job!=='recharge'){b.state='fly';b.v.set(0,8,0);if(b.low&&b.own)say(b,'back');b.low=false}}
 function think(b,a){const st=b.st,cf=b.chg/st.end,pad=b.state==='pad';
  if(pad&&(cf<.85||b.hp<.8*st.tuf))return b.job==='recharge'?(b.jt=rnd(K.pick[0],K.pick[1])):setJob(b,'recharge');
  let boss=null,bd=1e18,bt=null,bs=-1e9,nb=0,thr=0,sp=null,str=null,ss=1e18;const C=[];
  for(const t of TH){if(!api.live(t)||!KIND[t.k])continue;const d=t.p.distanceTo(b.p);
   if(isMain(t)){if(!Z.hid?.(t)&&d<bd){bd=d;boss=t}continue}  /* a boss you cannot see (the Hush, the Ghost, the Puppeteer in disguise, the Jammer King) is not one it circles: its blip and its marks would point the way */
   if(hyp(t.p.x-PADP.x,t.p.z-PADP.z)<4500)thr++;
   if(RAM[t.k]&&t!==b.skip&&d<2400){nb++;const sc=40/(1+t.p.distanceTo(t.aim)/Math.max(1,t.spd)/20)-d/120;if(sc>bs){bs=sc;bt=t}}
   if(d<3200&&t.spd<76&&t.k!=='decoy'&&KIND[t.k].armor!=='hard'&&C.length<40)C.push(t)}
  if(a.sel){const t=TH.find(u=>u.id===a.sel);if(t&&api.live(t)&&!isMain(t)&&a.ok&&t.p.distanceTo(a.p)<3500&&t.p.distanceTo(b.p)<5000)sp=t}
  for(const t of C){if(t.bdSl>0)continue;let alone=true;for(const u of C)if(u!==t&&u.p.distanceToSquared(t.p)<490000){alone=false;break}
   const eta=t.p.distanceTo(t.aim)/Math.max(1,t.spd);if(alone&&eta<80&&eta<ss){ss=eta;str=t}}
  const fl=a.ok&&(a.v.lengthSq()>64||a.p.y>gh(a.p.x,a.p.z)+12),S={};
  S.recharge=b.chg<needChg(b)||b.hp<.3*st.tuf||b.job==='recharge'&&b.state==='fly'?9:0;  /* once it turns for home it keeps going until it has landed */S.perch=thr===0&&!boss?5:0;S.escort=fl&&(thr>0||hyp(a.p.x-PADP.x,a.p.z-PADP.z)<1500)?2.2+Math.min(1.6,a.p.distanceTo(b.p)/300):0;  /* nothing inbound: it waits on the pad (no charge used) */
  S.bump=bt?3.8+Math.min(2,nb*.2):0;
  S.spot=sp?3.5:0;S.harass=boss&&cf>.3&&b.hp>.4*st.tuf?6.4:0;S.herd=str?2.9:0;
  let best='perch',bv=-1;for(const j of Object.keys(S)){const v=S[j]+(j===b.job?1.2:0)+(S[j]>0?rnd(0,.9):0);if(S[j]>0&&v>bv){bv=v;best=j}}
  if(best==='recharge')b.low=true;
  setJob(b,best,best==='bump'?bt:best==='spot'?sp:best==='harass'?boss:best==='herd'?str:null)}

 /* ---------- flying: a velocity command with the motors' limits (acc along the path, agi sideways), no player input ---------- */
 function fly(b,goal,gv,vmax,dt,brake=true,floor){const st=b.st,r=_a.subVectors(goal,b.p),d=r.length(),vd=_b.copy(r).setLength(brake?Math.min(vmax,Math.sqrt(2*st.acc*.7*d)):vmax);
  if(brake)vd.addScaledVector(gv,1-Math.min(1,d/250));
  const a=_c.subVectors(vd,b.v).multiplyScalar(3),sp=b.v.length();
  if(sp>4){const u=_d.copy(b.v).divideScalar(sp),par=a.dot(u);a.addScaledVector(u,-par);const pl=a.length();if(pl>st.agi)a.multiplyScalar(st.agi/pl);a.addScaledVector(u,cl(par,-st.acc,st.acc))}else a.clampLength(0,st.acc);
  b.acc.copy(a);b.v.addScaledVector(a,dt).clampLength(0,vmax);b.p.addScaledVector(b.v,dt);const g=floor??gh(b.p.x,b.p.z)+3;if(b.p.y<g){b.p.y=g;if(b.v.y<0)b.v.y=0}}
 function orient(b,dt){const sp=b.v.length();
  if(sp>6){let d=Math.atan2(-b.v.x,-b.v.z)-b.yaw;d=((d+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;b.yaw+=d*Math.min(1,dt*6)}
  const bank=b.state==='fly'?-cl((b.acc.x*Math.cos(b.yaw)-b.acc.z*Math.sin(b.yaw))/(b.st.agi||28),-1,1)*.55:0,tilt=b.state==='fly'?cl(sp/b.st.spd,0,1.2)*.5:0;
  b.q.setFromEuler(_e.set(-tilt,b.yaw,bank,'YXZ'))}
 /* the track's lead point for an interceptor flying at sp */
 function lead(b,t,sp,out){const r=_a.subVectors(t.p,b.p),d=r.length(),cv=Math.max(25,sp-t.v.dot(r)/Math.max(d,1));return out.copy(t.p).addScaledVector(t.v,Math.min(d/cv,4))}
 const weak=(t,out)=>{const p=t.pods&&t.pods[Math.max(0,(t.stages|0)-1)];return p&&p.getWorldPosition?p.getWorldPosition(out):out.copy(t.p)};

 /* ---------- what a job does to the world (host / solo only) ---------- */
 function markSpot(t){if(!(t.bdSp>0))SPOTS.push(t);t.bdSp=K.spotT}
 function slow(t,k=K.slowK,s=K.slowT){if(t.bdSl>0||t.st==='dead')return;t.bdSl=s;t.bdK=k;t.spd*=k;t.cs*=k;SLOW.push(t)}
 function bump(b,t){const R=RAM[t.k];b.cd=K.bumpCd;b.bumps++;b.hp-=R.dmg;api.FX.emit(b.p,0xffe0a0,16,8,.3,null,2.2);
  if(R.kill&&canKill(b)&&Math.random()<R.kill){bk++;b.kills++;b.wk++;t.bd=1;Z.helperKill(t);Z.pop?.(t.p,'BUDDY','#5fe3ff');say(b,'kill')}
  else{t.v.x+=rnd(-6,6);t.v.z+=rnd(-6,6);slow(t)}
  b.tgt=null;b.jt=Math.min(b.jt,.6)}
 function herd(b,t){b.fT=2.5;_a.set(t.p.x-t.aim.x,0,t.p.z-t.aim.z);if(_a.lengthSq()>1)t.v.addScaledVector(_a.normalize(),t.v.length()*.12);slow(t,K.herdK,K.herdT);api.FX.emit(b.p,0xbfeaff,8,5,.25,null,1.6);b.tc++;if(b.tc>=2)b.jt=Math.min(b.jt,.6)}
 function crash(b){b.state='down';b.job='down';b.tgt=null;b.dT=0;b.v.multiplyScalar(.6);api.boom(b.p,.5);Z.pop?.(b.p,'BUDDY DOWN','#ff9a3c');say(b,'down')}
 function fall(b,dt){b.dT+=dt;const g=gh(b.p.x,b.p.z)+.5;
  if(b.p.y>g){b.v.y-=22*dt;b.p.addScaledVector(b.v,dt);b.yaw+=dt*6;if(b.p.y<=g){b.p.y=g;b.v.set(0,0,0);api.boom(b.p,.4)}if((b.fT-=dt)<=0){b.fT=.1;api.SMK.emit(b.p,0x2a2725,1,1.5,3,null,1,.8)}}
  else{b.p.y=g;b.v.set(0,0,0)}
  b.q.setFromEuler(_e.set(0,b.yaw,.4,'YXZ'))}

 /* ---------- one buddy for one tick ---------- */
 function sim(b,dt){const st=b.st,a=anchor(b);b.sayT-=dt;b.cd-=dt;b.hpP=pct(b.hp,st.tuf);b.chP=pct(b.chg,st.end);
  if(b.state==='down'){fall(b,dt);return}
  if(b.state==='pad'){b.chg=Math.min(st.end,b.chg+st.end/K.rech*dt);b.hp=Math.min(st.tuf,b.hp+st.tuf*.04*dt);b.v.set(0,0,0);slotP(b,b.p);b.acc.set(0,0,0);
   if((b.jt-=dt)<=0||b.job!=='perch'&&b.job!=='recharge')think(b,a);orient(b,dt);return}
  /* in the air */
  const j=b.job,sprint=j==='bump'||j==='herd';b.chg-=dt*(sprint?1.6:1);if(b.chg<=0||b.hp<=0){crash(b);return}
  if((b.jt-=dt)<=0||(j==='bump'||j==='herd'||j==='spot'||j==='harass')&&(!b.tgt||!api.live(b.tgt))||j!=='recharge'&&j!=='perch'&&b.chg<needChg(b))think(b,a);
  const t=b.tgt,vm=st.spd*(sprint?K.sprint:1),home=slotP(b,_h),G0=b.goal,gv=_c.set(0,0,0);
  if(b.job==='bump'&&t){lead(b,t,vm,G0);fly(b,G0,gv,vm,dt,false);b.tc+=dt;
   if(b.cd<=0&&b.p.distanceTo(t.p)<3.2+(KIND[t.k].hitR||1))bump(b,t);else if(b.tc>10){b.skip=t;b.tgt=null;b.jt=0}}
  else if(b.job==='spot'&&t){_a.set(t.v.z,0,-t.v.x);if(_a.lengthSq()<1)_a.set(1,0,0);G0.copy(t.p).addScaledVector(_a.normalize(),50).y+=10;fly(b,G0,t.v,vm,dt);b.spId=t.id;if(b.p.distanceTo(t.p)<170)markSpot(t)}
  else if(b.job==='harass'&&t){b.ph+=dt*.8;weak(t,G0);G0.x+=Math.cos(b.ph)*55;G0.z+=Math.sin(b.ph)*55;G0.y+=14;fly(b,G0,t.v,vm,dt);const d=b.p.distanceTo(t.p);
   if(d<110&&(b.mkT-=dt)<=0){b.mkT=K.markEvery;t.mark=Math.max(t.mark|0,K.markT);Z.pop?.(t.p,'BUDDY MARK','#ff6bd6')}
   if(d<70)b.hp-=K.bossHurt*dt}
  else if(b.job==='herd'&&t){_a.set(t.v.z,0,-t.v.x).setLength(35);G0.copy(t.p).add(_a).y+=6;fly(b,G0,t.v,vm,dt);b.fT-=dt;if(b.fT<=0&&b.p.distanceTo(t.p)<45)herd(b,t)}
  else if(b.job==='escort'&&a.ok){_a.set(a.v.x,0,a.v.z);if(_a.lengthSq()<25)_a.set(-Math.sin(b.yaw),0,-Math.cos(b.yaw));_a.normalize();
   G0.copy(a.p).addScaledVector(_a,20).addScaledVector(_b.set(-_a.z,0,_a.x),26).addScaledVector(a.v,.5).y+=6;fly(b,G0,a.v,st.spd*(b.p.distanceTo(a.p)>200?K.sprint:1),dt)}
  else{/* recharge, perch, or a job whose reason is gone: head for the pad, and land on it */
   const d=hyp(home.x-b.p.x,home.z-b.p.z),land=d<30;G0.set(home.x,land?home.y:home.y+40,home.z);
   fly(b,G0,gv,land?Math.min(vm,Math.max(6,b.p.distanceTo(home)*1.2)):vm,dt,true,land?home.y:undefined);
   if(land&&b.p.distanceTo(home)<2.2){b.state='pad';b.v.set(0,0,0);b.p.copy(home);if(b.job!=='recharge'&&b.job!=='perch')b.job='perch'}}
  orient(b,dt)}

 /* ---------- a co-op client draws what the host says ---------- */
 function mirror(b,dt){if(b.state==='off')return;const k=1-Math.exp(-dt*8);b.sayT-=dt;b.np.addScaledVector(b.nv,dt);b.p.addScaledVector(b.v,dt).lerp(b.np,k);b.v.lerp(b.nv,k);b.acc.set(0,0,0);
  if(b.state==='down'){b.dT+=dt;b.q.setFromEuler(_e.set(0,b.yaw,.4,'YXZ'))}else orient(b,dt)}

 /* ---------- per tick ---------- */
 function tickFx(dt){for(let i=SPOTS.length-1;i>=0;i--){const t=SPOTS[i];if((t.bdSp-=dt)<=0||t.st==='dead'){t.bdSp=0;SPOTS.splice(i,1)}}
  for(let i=SLOW.length-1;i>=0;i--){const t=SLOW[i];if((t.bdSl-=dt)<=0||t.st==='dead'){if(t.st!=='dead'){t.spd/=t.bdK;t.cs/=t.bdK}t.bdSl=0;SLOW.splice(i,1)}}}
 function clearFx(){for(const t of SPOTS)t.bdSp=0;SPOTS.length=0;for(const t of SLOW){if(t.st!=='dead'){t.spd/=t.bdK;t.cs/=t.bdK}t.bdSl=0}SLOW.length=0}
 function stand(){if(live()||!wasLive)return;wasLive=false;clearFx();for(const b of BD.values()){b.state='off';b.job='perch';b.tgt=null}}
 Z.stateHooks.push(stand);
 function step(dt){const on=live();
  if(!on){stand();return}
  wasLive=true;tickFx(dt);
  for(const b of BD.values()){
   if(!auth()){if(b===mine&&G.state==='wave'&&b.w!==G.wave){b.w=G.wave;reread()}mirror(b,dt);continue}  /* a client reads its garage at each wave start too (it is sent to the host as its loadout) */
   if(G.state==='wave'&&b.w!==G.wave&&(b.has||b===mine))waveStart(b);
   if(b.state!=='off')try{sim(b,dt)}catch(e){console.warn('Little Buddy stood down',e);b.state='off';b.has=false}}}

 /* ---------- drawing: the model (built when first needed, kept), its name tag, the props spinning ---------- */
 function ensureModel(b){if(!b.model||b.rb){b.rb=false;freeModel(b.model);b.model=buildModel(b.ids,b.cos,K.model);api.scene.add(b.model.grp);b.model.grp.traverse(o=>{if(o.isMesh)o.userData.cs=o.castShadow});shOn=null}
  if(!b.tag||b.nmK!==b.nm){freeTag(b.tag);b.nmK=b.nm;b.tag=buildTag(tagText(b));api.scene.add(b.tag)}}  /* nmK: the name the tag was built for (a string compare, no text built per frame) */
 const tagText=b=>b.own?'Little Buddy':`${String(b.nm||'Pilot').slice(0,14)}'s Little Buddy`;
 function visuals(dt){const on=live();
  for(const b of BD.values()){const show=on&&b.state!=='off'&&!(b.state==='down'&&b.dT>10);if(show&&(!b.model||b.rb||b.nmK!==b.nm))ensureModel(b);
   const m=b.model;if(!m)continue;m.grp.visible=show;b.tag.visible=false;if(!show)continue;
   m.grp.position.copy(b.p);m.grp.quaternion.copy(b.q);if(b.state==='fly'){const P=m.props;for(let i=0;i<P.length;i++)P[i].rotation.y+=dt*55*(i===1||i===2?1:-1)}
   const cam=api.camera.position,d=b.p.distanceTo(cam);if(d<2200&&b.state!=='down'){b.tag.visible=true;b.tag.position.copy(b.p);b.tag.position.y+=3.4}}
  const sh=gfx.k.swarm>0;if(sh!==shOn){shOn=sh;for(const b of BD.values())b.model?.grp.traverse(o=>{if(o.isMesh)o.castShadow=sh&&!!o.userData.cs})}  /* Graphics quality Low: no shadows from it */
  hud()}

 /* ---------- HUD card: job, health, charge; the tooltip says which part drives which number ---------- */
 const card=document.createElement('div');card.id='zbd';card.className='osd';card.hidden=true;$('hud').append(card);
 const css=document.createElement('style');css.textContent='#zbd{position:absolute;right:16px;bottom:calc(330px + env(safe-area-inset-bottom,0px));display:grid;gap:3px;font:700 12px var(--mono);background:var(--panel);border:1px solid var(--edge);border-radius:6px;padding:6px 10px;width:178px;pointer-events:auto}'+
  '#zbd .h{display:flex;align-items:baseline;gap:8px;color:#bfeaff;font-size:12px;letter-spacing:.08em}#zbd .h small{margin-left:auto;color:#ffc640;font-size:11px}#zbd .b{display:grid;grid-template-columns:28px 1fr;align-items:center;gap:6px;color:#9fb3c8;font-size:10.5px}'+
  '#zbd .b i{display:block;height:7px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}#zbd .b u{display:block;height:100%;background:#3ddc84}#zbd .b u.mid{background:#ffc640}#zbd .b u.lo{background:#ff4d4d}#zbd .b u.c{background:#5fe3ff}'+
  '#zbd .q{color:#fff;font-weight:500;font-size:11px;min-height:14px}#hud:not(.z) #zbd{display:none}'+
  '.zbdr{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:0 0 12px;padding:8px 12px;border:1px solid var(--edge);border-left:3px solid #5fe3ff;border-radius:6px;background:var(--panel);font:700 12px var(--mono);cursor:help}'+
  '.zbdr b{color:#bfeaff;letter-spacing:.08em}.zbdr em{font-style:normal;font-weight:500;color:var(--dim)}';document.head.append(css);
 const bar=(v,c)=>`<u class="${c||(v<30?'lo':v<60?'mid':'')}" style="width:${v}%"></u>`;
 let hudK=-1;
 function hud(){const b=mine,show=live()&&b.state!=='off';card.hidden=!show;if(!show)return;
  if(b.tip!==tipL)card.title=tipL=b.tip||'';
  const k=(((Math.round(b.hpP)*101+Math.round(b.chP))*8+JOBS.indexOf(b.job)+1)*4+ST.indexOf(b.state))*64+b.say+1;if(k===hudK)return;hudK=k;  /* every number the card shows, packed: the HTML is built only when one changes */
   const q=b.say>=0?SAYL[b.say]:'',h=`<div class="h"><span>LITTLE BUDDY</span><small>${JOBN[b.job]||''}</small></div><div class="b">HP<i>${bar(b.hpP)}</i></div><div class="b">CHG<i>${bar(b.chP,b.chP<K.low*100?'lo':'c')}</i></div><div class="q">${b.state==='down'?'down until the next wave':q}</div>`;
  if(h!==hudL)html(card,hudL=h)}
 /* the base screen's shop tab: a row for it, same tooltip */
 const sh0=Z.shopTop;Z.shopTop=()=>{const top=sh0?.()||'';if(!G.on||!mine.has)return top;const s=mine.st;
  return top+`<div class="zbdr" title="${esc(tipOf(mine.ids,s))}"><b>LITTLE BUDDY</b><span>free · flies itself · one per wave</span><em>speed ${Math.round(s.spd)} · accel ${Math.round(s.acc)} · charge ${Math.round(s.end)} s · hp ${Math.round(s.tuf)} · agility ${Math.round(s.agi)}</em></div>`};

 /* ---------- overlay and radar: SPOTTED under a track it marked, a white dart on the scope ---------- */
 function overlay(oc){if(!live()||!SPOTS.length)return;const cam=api.camera,W=innerWidth,H=innerHeight;oc.save();oc.textAlign='center';oc.font='700 11px "JetBrains Mono",monospace';oc.fillStyle='#bfeaff';oc.shadowColor='#000';oc.shadowBlur=3;
  for(const t of SPOTS){_a.copy(t.p).project(cam);if(_a.z>1||Math.abs(_a.x)>1||Math.abs(_a.y)>1)continue;oc.fillText('SPOTTED',(_a.x*.5+.5)*W,(-_a.y*.5+.5)*H+54)}oc.restore()}
 function radar(rc,P){if(!live())return;for(const b of BD.values()){if(b.state==='off'||b.state==='down')continue;const q=P(b.p.x,b.p.z);rc.fillStyle=b===mine?'#fff':'#bfeaff';rc.beginPath();rc.moveTo(q[0],q[1]-4.5);rc.lineTo(q[0]+3.5,q[1]+3.5);rc.lineTo(q[0]-3.5,q[1]+3.5);rc.closePath();rc.fill()}}

 /* ---------- co-op: loadouts in presence, states in the host's snapshot ---------- */
 Z.bdOut=()=>mine.has&&!Z.idle?.()?[...mine.ids,...(mine.cos||[null,null,null,null,null,null]),anchor(mine).sel|0]:null;
 Z.bdIn=(k,a,r)=>{if(!Array.isArray(a)||a.length<10)return;const ids=cleanIds(a.slice(0,4)),cos=cleanCos(a.slice(4,10));if(!ids)return;
  let b=BD.get(k);if(!b){if(BD.size>=8||String(k).length>40)return;b=make(k,null)}
  b.src=()=>r.seen?{p:r.d.p,v:r.d.v,ok:!r.dead,sel:b.sel}:null;b.nm=r.n||'';b.sel=Number.isFinite(a[10])?a[10]|0:0;adopt(b,ids,cos,true);if(!partsReady()&&!partsFailed())lp()};
 Z.bdSnap=me=>{if(!live())return undefined;const o={};let n=0,r=Math.round;
  for(const b of BD.values()){if(b.state==='off')continue;o[b===mine?me:b.key]=[ST.indexOf(b.state),r(b.p.x*10),r(b.p.y*10),r(b.p.z*10),r(b.v.x),r(b.v.y),r(b.v.z),b.hpP,b.chP,JOBS.indexOf(b.job),b.sayN,b.say,b.kills,b.spId|0];n++}
  return n?o:undefined};
 Z.bdHost=(o,me)=>{if(auth())return;const seen=new Set();
  if(o&&typeof o==='object')for(const[k,a]of Object.entries(o)){if(!Array.isArray(a)||a.length<14||!a.slice(0,14).every(Number.isFinite))continue;
   let b=k===me?mine:BD.get(k);if(!b){if(BD.size>=8||k.length>40)continue;b=make(k,null)}
   const was=b.state;b.state=ST[a[0]]||'off';b.np.set(a[1]/10,a[2]/10,a[3]/10);b.nv.set(a[4],a[5],a[6]);
   if(was==='off'||b.np.distanceToSquared(b.p)>250000){b.p.copy(b.np);b.v.copy(b.nv);api.interp?.cut(b)}
   b.hpP=cl(a[7],0,100);b.chP=cl(a[8],0,100);b.job=JOBS[a[9]]||'perch';b.kills=a[12];b.spId=a[13];
   if(a[10]!==b.sayN){b.sayN=a[10];const s=SAYL[a[11]];if(s){b.say=a[11];if(b===mine)feedLine(s)}}
   if(b===mine&&b.spId){const t=TH.find(u=>u.id===b.spId);if(t&&api.live(t))markSpot(t)}seen.add(b)}
  for(const b of BD.values())if(!seen.has(b))b.state='off'};
 Z.bdGone=k=>{for(const[key,b]of[...BD])if(b!==mine&&(k==null||key===k)){freeModel(b.model);freeTag(b.tag);BD.delete(key)}};

 /* ---------- hooks ---------- */
 const s0=Z.step;Z.step=dt=>{s0(dt);step(dt)};
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);visuals(dt)};
 const o0=Z.overlay;Z.overlay=oc=>{o0(oc);overlay(oc)};
 const r0=Z.radar;Z.radar=(rc,P,sel,K2)=>{r0(rc,P,sel,K2);radar(rc,P)};
 const lj0=Z.lockJam;Z.lockJam=t=>(lj0?.(t)??1)*(t.bdSp>0?K.spotK:1);  /* a spotted track locks in less time (zlock.js reads this) */
 const z0=Z.start;Z.start=()=>{bk=0;reread();for(const b of BD.values()){b.kills=0;b.wk=0;b.w=-1;b.state='off'}z0()};  /* the garage is read first: the base screen opens inside z0 and shows its row */
 const st0=Z.stop;Z.stop=()=>{st0();clearFx();wasLive=false;Z.bdGone();mine.state='off';mine.w=-1;mine.job='perch';mine.tgt=null;if(mine.model)mine.model.grp.visible=false;if(mine.tag)mine.tag.visible=false;card.hidden=true};
 /* tests and tools: the buddies, the garage as read, the kill room, what is left in the world */
 Z.bd={BD,get mine(){return mine},get force(){return force},set force(v){force=v},garage:()=>GAR,read:garage,canKill,get kills(){return bk},markSpot,think,statsOf,
  fx(){let vis=0,tags=0,models=0;for(const b of BD.values()){if(b.model){models++;if(b.model.grp.visible)vis++}if(b.tag?.visible)tags++}return{models,vis,tags,spots:SPOTS.length,slows:SLOW.length,marked:TH.filter(t=>t.bdSp>0||t.bdSl>0).length,buddies:BD.size}}};
 return Z.bd}
