// Zombies personal swarm: a late-game perk line (Personal swarm: 4-12 drones; Swarm drones Mk: better drones). Close-support drones fly
// with your interceptor in a formation you pick and do what you tell them. Numbers: zswdata.js (SW, FORMS); the game rules are the helpers':
// an attack pass rolls the drone's kill chance x RESIST.rack for the kind through Z.helperHit (armor, Mark), so a swarm kill is a helper kill.
//
// One set per wave: the swarm deploys around you when the wave starts (upkeep from the purse, $30 a drone) and what is lost stays lost
// until the next wave; a crash or a relaunch does not bring drones back (they loiter where you went down and rejoin the next interceptor).
// Each drone in the air draws 3 A from your pack, so a big swarm shortens your flight (column formation: 40% less).
//
// Formations (5 / RB cycles): CLOUD orbits you, WEDGE flies a V ahead (hits hardest), LINE abreast sweeps (passes on FPV swarms can take a
// neighbour), SCREEN is a curved wall between you and the threat axis (intercepts the most), COLUMN trails you (keeps up under Rocket
// Assist, draws less). Each sets how far the swarm reaches to defend you and multiplies kill chance and losses (FORMS).
// Commands: 1 / pad A attack my lock (every drone goes after the track you have locked, zlock.js), 2 / B screen (intercept anything near
// you or near your formation axis ahead; again for escort, the default self-defence), 3 / X strike (spend a charge: rocket boosters take
// the swarm at the densest cloud of threats within 4.5 km, or at a ground target, one pass each, survivors come back), 4 / R3 form up.
//
// Co-op (znet.js hooks Z.swOut / swIn / swSnap / swHost / swGone): each pilot's swarm is theirs. Pilots send only their formation, command,
// attack target and strike requests; every screen flies every swarm from those; the host rolls the passes and sends each pilot's drone
// count and strike charges, and the others trim their copies to match. Ground targets for sorties: Z.groundTargets() (see Z.swarm below).
import {dot} from '../../engine/render.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {KIND,RESIST} from './zdata.js';
import {SW,FORMS,MODES,SW_BLURB} from './zswdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),MAXD=64;
export function initSwarm(api,G,Z){
 const {THREE,scene,TH,S}=api,V3=THREE.Vector3,UP=new V3(0,1,0),$=id=>document.getElementById(id);
 const _a=new V3(),_b=new V3(),_c=new V3(),_u=new V3(),_q=new THREE.Quaternion(),_qy=new THREE.Quaternion(),_m=new THREE.Matrix4(),_s=new V3(1.8,1.8,1.8);  /* drawn a little over life size so a formation reads at a glance */
 const lv=k=>Z.perkLevel?.(k)|0,auth=()=>!Z.mirror;
 const pb=Z.perkBlurb;Z.perkBlurb=k=>SW_BLURB[k]?SW_BLURB[k][Math.min(lv(k),SW_BLURB[k].length-1)]:pb(k);

 // ---------- drawing: one instanced mesh for every swarm drone, a glowing nav light each (orange under boosters) ----------
 const geo=mergeGeometries([new THREE.BoxGeometry(.26,.09,.34),new THREE.BoxGeometry(.9,.035,.06).rotateY(Math.PI/4),new THREE.BoxGeometry(.9,.035,.06).rotateY(-Math.PI/4),
  ...[[.32,.32],[-.32,.32],[.32,-.32],[-.32,-.32]].map(([x,z])=>new THREE.CylinderGeometry(.16,.16,.012,10).translate(x,.05,z))]);
 const body=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:0x2a3036,roughness:.55,metalness:.5}),MAXD);body.count=0;body.frustumCulled=false;body.castShadow=true;scene.add(body);
 const gPos=new Float32Array(MAXD*3),gCol=new Float32Array(MAXD*3),gGeo=new THREE.BufferGeometry();gGeo.setAttribute('position',new THREE.BufferAttribute(gPos,3));gGeo.setAttribute('color',new THREE.BufferAttribute(gCol,3));
 const gPts=new THREE.Points(gGeo,new THREE.PointsMaterial({size:9,sizeAttenuation:false,vertexColors:true,map:dot,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));gPts.frustumCulled=false;gGeo.setDrawRange(0,0);scene.add(gPts);

 // ---------- a swarm: one per pilot (mine, and in co-op one per other pilot keyed by their peer) ----------
 const SWS=new Map();
 function make(key,src){const s={key,src,d:[],form:0,mode:'escort',tgt:null,ch:0,mk:0,w:-1,want:null,ww:-1,sseq:0,cseq:0,kills:0,lost:0,ph:Math.random()*6,f:new V3(0,0,-1),ax:new V3(0,0,-1),axT:0,et:0,home:new V3(),col:key==='me'?[.37,.9,1]:[1,.8,.45],did:0,gid:null};SWS.set(key,s);return s}
 api.interp?.add(each=>{for(const s of SWS.values())for(const d of s.d)each(d)});  /* every swarm drone is drawn between its last two sim ticks (engine/interp.js) */
 const mine=make('me',()=>{const me=api.player;return me?{p:me.p,v:me.v,q:me.q,ok:me.dead<=0}:null});
 // where the swarm flies around: the pilot's interceptor, or where it last was while the pilot is down
 function anchor(s,dt){const a=s.src(),A=s.A||(s.A={p:new V3(),v:new V3(),ok:false});
  if(a&&a.ok){A.p.copy(a.p);A.v.copy(a.v);A.ok=true;s.home.copy(a.p);
   const h=_a.set(a.v.x,0,a.v.z);if(h.lengthSq()<64&&a.q){h.set(0,1,0).applyQuaternion(a.q);h.y=0}  /* slow: the nose (a tail-sitter's nose is its local +Y) */
   if(h.lengthSq()>1e-3)s.f.lerp(h.normalize(),1-Math.exp(-dt*3)).normalize()}
  else{A.p.copy(s.home);A.v.set(0,0,0);A.ok=false}
  return A}
 // threat axis (screen formation): toward the tracks around you, the soonest to arrive weighted most
 function axis(s,A){if((s.axT-=1)>0)return;s.axT=30;_b.set(0,0,0);for(const t of TH){if(!api.live(t))continue;const d=t.p.distanceTo(A.p);if(d>4500||d<1)continue;const tt=t.p.distanceTo(t.aim)/Math.max(1,t.spd);_b.addScaledVector(_c.subVectors(t.p,A.p).setY(0).normalize(),1/(tt+5))}
  if(_b.lengthSq()>1e-6)s.ax.lerp(_b.normalize(),.5).normalize();else s.ax.copy(s.f)}
 // formation slots: drone i of n around anchor point A, flying heading f (r = right). Shared by the HUD glyphs (n = 8, north up).
 function slot(form,i,n,A,f,ax,ph,out){const r=_c.set(-f.z,0,f.x);
  if(form===0){const R=11+1.3*n,th=ph+i*2.39996,e=Math.asin(cl(-.55+1.1*(i+.5)/n,-1,1));out.copy(A).addScaledVector(r,Math.cos(th)*Math.cos(e)*R).addScaledVector(f,Math.sin(th)*Math.cos(e)*R).addScaledVector(UP,R*.55*Math.sin(e)+Math.sin(ph*2.3+i)*1.2)}
  else if(form===1){const k=Math.ceil(i/2),sd=i%2?-1:1;out.copy(A).addScaledVector(f,30-8*k).addScaledVector(r,sd*7*k).addScaledVector(UP,2-.8*k)}
  else if(form===2){const k=(i>>1)+1,sd=i%2?-1:1;out.copy(A).addScaledVector(r,sd*8*k).addScaledVector(f,3-.4*k).addScaledVector(UP,1)}
  else if(form===3){const sp=Math.min(110,22*(n-1))*Math.PI/180,a=n>1?-sp/2+sp*i/(n-1):0,ca=Math.cos(a),sa=Math.sin(a);out.copy(A).add(_c.set(ax.x*ca-ax.z*sa,0,ax.z*ca+ax.x*sa).multiplyScalar(55)).addScaledVector(UP,(i%2)*4-2)}
  else{out.copy(A).addScaledVector(f,-(10+7*i)).addScaledVector(r,Math.sin(ph*2+i*.8)*1.5).addScaledVector(UP,.3*i)}
  return out}

 // ---------- deploying: once per wave, upkeep from the purse (solo / host) ----------
 function deploy(s,n,mk){s.d.length=0;s.w=G.wave;s.mk=cl(mk|0,0,SW.mk.length-1);s.ch=SW.mk[s.mk].charges;s.mode='escort';s.tgt=null;s.kills=0;s.lost=0;
  const A=anchor(s,0);for(let i=0;i<n;i++){const p=_a.copy(A.p).add(_b.set(rnd(-6,6),rnd(3,8),rnd(-6,6)));p.y=Math.max(p.y,api.gh(p.x,p.z)+2);
   s.d.push({id:++s.did,p:p.clone(),v:new V3(0,4,0),up:new V3(0,1,0),yaw:0,st:'form',t:null,tt:0,sp:null,fx:0,boost:0,gp:null})}}
 function upkeep(n){const per=SW.upkeep*(Z.meta?.k?.('upkeepK',1)??1);if(!per)return n;const can=Math.min(n,Math.floor(Math.max(0,G.cash)/per)),c=can*per;G.cash-=c;Z.tally?.('swarm',c);return can}
 function waveStart(s){let n=0,mk=0;if(s===mine){if(Z.idle?.())return;n=SW.n[cl(lv('swarm'),0,5)]|0;mk=lv('swarmk')}else if(auth()){n=SW.n[cl(Z.pilotPerk?.(s.key,'swarm')|0,0,5)]|0;mk=Z.pilotPerk?.(s.key,'swarmk')|0}
  else{if(s.ww!==G.wave||s.want==null)return;n=s.want}  /* a co-op client flies other pilots' swarms at the size the host says */
  if(!n){s.w=G.wave;s.d.length=0;return}const n0=n;if(auth())n=upkeep(n);deploy(s,n,mk);
  if(s===mine){api.feed(`<span class="cb">Swarm up: ${n} drone${n>1?'s':''} (${SW.mk[s.mk].n}) · ${FORMS[s.form].n}${auth()&&n?` · upkeep −$${Math.round(n*SW.upkeep*(Z.meta?.k?.('upkeepK',1)??1))}`:''}</span>${n<n0?` <span class="cr">short of money: ${n0-n} stay home</span>`:''}`)}}

 // ---------- what a drone may go after ----------
 const eff=t=>RESIST.rack[t.k]??0;
 const engageable=t=>api.live(t)&&t.st!=='fall'&&eff(t)>0&&KIND[t.k]?.armor!=='hard'&&!(t.k==='decoy'&&t.ident);
 // escort / screen: threats near you, ahead of a wedge, or (screen) along your formation axis; each gets one drone (armor and the boss two)
 function watch(s,A){const F=FORMS[s.form],n=s.d.length;if(!n)return;const busy=new Map();let eng=0;for(const d of s.d)if(d.t&&(d.st==='eng'||d.st==='strike')){busy.set(d.t,(busy.get(d.t)|0)+1);eng++}
  const cap=Math.ceil(n*SW.maxEng[s.mode==='screen'?1:0]),ax=s.form===3?s.ax:s.f,C=[];if(eng>=cap)return;
  for(const t of TH){if(!engageable(t))continue;const dx=t.p.x-A.p.x,dz=t.p.z-A.p.z,d=Math.hypot(dx,dz,t.p.y-A.p.y);if(d>Math.max(SW.screenAxis,F.ahead||0)+200)continue;
   const al=dx*ax.x+dz*ax.z,lat=Math.abs(dx*ax.z-dz*ax.x);let ok=d<F.engR||F.ahead&&al>0&&lat<al*.7&&d<F.ahead;
   if(!ok&&s.mode==='screen')ok=d<SW.screenR||al>0&&al<SW.screenAxis&&lat<SW.screenW;
   if(ok&&(busy.get(t)|0)<((KIND[t.k].armor===1||t.k==='boss')?2:1))C.push([t,d])}
  C.sort((a,b)=>a[1]-b[1]);for(const[t]of C){if(eng>=cap)break;let best=null,bd=1e18;for(const d of s.d){if(d.st!=='form'&&d.st!=='ret')continue;const q=d.p.distanceToSquared(t.p);if(q<bd){bd=q;best=d}}
   if(!best)break;go(best,t,'eng');eng++}}
 const go=(d,t,st)=>{d.st=st;d.t=t;d.tt=0;d.pd=1e9};
 // ---------- commands ----------
 function attack(s,t){if(!t||!engageable(t))return false;s.mode='attack';s.tgt=t;for(const d of s.d)if(d.st!=='strike'&&d.st!=='gnd')go(d,t,'eng');return true}
 function recall(s,mode='escort'){s.mode=mode;s.tgt=null;for(const d of s.d)if(d.st==='eng'||d.st==='strike'||d.st==='gnd'){d.st='ret';d.t=null;d.boost=0}}
 // strike: the densest cloud of threats within reach (tracks in front of you count double), or a ground target (sorties). Returns the aim point.
 function cluster(s,A,fw){let best=null,bs=0;const L=TH.filter(t=>engageable(t)&&t.p.distanceTo(A.p)<SW.strikeR);
  for(const t of L){let n=0;for(const u of L)if(u.p.distanceToSquared(t.p)<350*350)n++;if(fw&&_a.subVectors(t.p,A.p).normalize().dot(fw)>.7)n*=2;if(n>bs){bs=n;best=t}}
  if(!best)return null;const c=new V3();let k=0;for(const u of L)if(u.p.distanceToSquared(best.p)<350*350){c.add(u.p);k++}return c.divideScalar(k)}
 function strikeAt(s,P,g){const n=s.d.length;if(!n)return 0;let k=0;
  if(g){for(const d of s.d){d.st='gnd';d.t=null;d.gp=g;d.tt=0;d.pd=1e9;d.boost=1;k++}s.gid=g.id;return k}
  const M=TH.filter(t=>engageable(t)&&t.p.distanceTo(P)<450).sort((a,b)=>a.p.distanceTo(P)-b.p.distanceTo(P));if(!M.length)return 0;
  s.gid=null;s.d.forEach((d,i)=>{go(d,M[i%M.length],'strike');d.boost=1});return n}
 const ground=()=>{try{const L=Z.groundTargets?.();return Array.isArray(L)?L.filter(g=>g&&g.p&&g.alive!==false):[]}catch(e){return[]}};
 // mine: from the keys / pad / Z.swarm. Returns true when the command took.
 function command(c,arg){const s=mine;if(G.state!=='wave'||!lv('swarm'))return false;if(!s.d.length&&c!=='form'&&c!=='next'){api.banner('SWARM LOST','cr',.8);return false}
  if(c==='next'||c==='form#'){s.form=c==='next'?(s.form+1)%FORMS.length:cl(arg|0,0,FORMS.length-1);api.banner('FORMATION: '+FORMS[s.form].n,'cb',.9);api.tone(700,900,.12,.06,'triangle');return true}
  if(c==='form'){recall(s,'escort');api.banner('SWARM: FORM UP','cb',.8);api.tone(600,800,.12,.06,'triangle');return true}
  if(c==='screen'){const m=s.mode==='screen'?'escort':'screen';recall(s,m);api.banner('SWARM: '+m.toUpperCase(),'cb',.8);api.tone(m==='screen'?800:600,m==='screen'?1000:500,.14,.06,'triangle');return true}
  if(c==='attack'){const t=arg||Z.lk?.t;if(!t){api.banner('NO LOCK','co',.8);api.tone(300,200,.15,.06,'square');return false}if(!attack(s,t)){api.banner('CAN\'T ENGAGE','co',.8);return false}
   api.banner(`SWARM: ATTACK T${String(t.id).padStart(2,'0')}`,'cg',.9);api.tone(500,1000,.18,.08,'square');return true}
  if(c==='strike'){if(s.ch<=0){api.banner('NO STRIKE CHARGES','co',.8);api.tone(300,200,.15,.06,'square');return false}
   const A=anchor(s,0),cam=api.camera,fw=_b.set(0,0,-1).applyQuaternion(cam.quaternion).clone();let g=arg&&arg.ground?arg.ground:null,P=arg&&!g&&arg.p?_c.set(arg.p.x,arg.p.y,arg.p.z).clone():null;
   if(!g&&!P){const GT=ground().filter(q=>_a.set(q.p.x,q.p.y,q.p.z).distanceTo(A.p)<SW.strikeR);const aim=GT.map(q=>[q,_a.set(q.p.x,q.p.y,q.p.z).sub(cam.position).normalize().dot(fw)]).sort((a,b)=>b[1]-a[1])[0];
    P=cluster(s,A,fw);if(aim&&(aim[1]>.94||!P))g=aim[0]}
   if(!g&&!P){api.banner('NO STRIKE TARGET','co',.8);return false}
   const k=strikeAt(s,P,g);if(!k){api.banner('NO STRIKE TARGET','co',.8);return false}s.ch--;s.sseq++;s.sp=g?_a.set(g.p.x,g.p.y,g.p.z).clone():P;
   api.banner(`STRIKE ×${k}`,'cg',1.1);api.tone(220,1400,.5,.1,'sawtooth');api.feed(`<span class="cg">Swarm strike: ${k} drone${k>1?'s':''} on rocket boosters${g?' at a ground target':''}</span>`);return true}
  return false}

 // ---------- flight: formation keeping (a damped spring onto each slot, separation), attack runs, boosted strikes ----------
 const _S=new V3(),_V=new V3(),_acc=new V3();
 function fly(s,dt){const A=anchor(s,dt),n=s.d.length;if(!n)return;s.ph+=dt*(.35+.02*n);if(s.form===3)axis(s,A);else s.axT=0;
  const M=SW.mk[s.mk],F=FORMS[s.form],asp=A.v.length(),fmax=Math.max(M.spd,asp*(F.id==='column'?1.15:.8)+20);
  if(s.mode==='attack'&&(!s.tgt||!api.live(s.tgt)))recall(s,'escort');
  if((s.et-=dt)<=0){s.et=.2;if(s.mode!=='attack')watch(s,A)}
  let si=0;
  for(let i=s.d.length-1;i>=0;i--){const d=s.d[i];if(!d)continue;
   if(d.st==='form'||d.st==='ret'){slot(s.form,si++,n,A.p,s.f,s.ax,s.ph,_S);_S.y=Math.max(_S.y,api.gh(_S.x,_S.z)+4);
    if(d.sp&&d.sp.distanceToSquared(_S)<2500&&dt>0){_V.subVectors(_S,d.sp).divideScalar(dt).sub(A.v).clampLength(0,25).add(A.v)}else _V.copy(A.v);(d.sp||(d.sp=new V3())).copy(_S);
    // velocity command: the slot's own velocity plus a closing speed that grows with the gap (gentle for the cloud, brisk when rejoining)
    const e=_a.subVectors(_S,d.p),dist=e.length(),far=d.st==='ret'||dist>60,vm=fmax+20;
    const vd=_b.copy(_V).addScaledVector(e,Math.min(s.form===0?.7:1,fmax*1.3/Math.max(dist,1)));if(vd.length()>vm)vd.setLength(vm);
    _acc.subVectors(vd,d.v).multiplyScalar(far?2.5:3);if(d.st==='ret'&&dist<15)d.st='form';steer(d,_acc,far?110:s.form===0?40:55,vm,dt)}
   else if(d.st==='eng'||d.st==='strike'){const t=d.t;d.tt+=dt;
    if(!t||!api.live(t)||d.tt>(d.st==='strike'?30:25)||d.p.distanceTo(A.p)>SW.leash&&d.st==='eng'){if(d.st==='strike'&&s.sp){const u=TH.filter(x=>engageable(x)&&x.p.distanceTo(d.p)<600).sort((a,b)=>a.p.distanceTo(d.p)-b.p.distanceTo(d.p))[0];if(u&&d.tt<30){d.t=u;d.pd=1e9;continue}}
     d.st='ret';d.t=null;d.boost=0;continue}
    const r=_a.subVectors(t.p,d.p),dist=r.length(),sp=Math.min(d.st==='strike'?SW.boost:M.spd,Math.max(t.v.length()+70,dist*.8+50)),cv=Math.max(30,sp-t.v.dot(r)/Math.max(dist,1)),tg=Math.min(dist/cv,3),aim=_b.copy(t.p).addScaledVector(t.v,tg);
    const vd=aim.sub(d.p).setLength(sp);if(d.p.y<api.gh(d.p.x,d.p.z)+12&&vd.y<0)vd.y=0;_acc.subVectors(vd,d.v).multiplyScalar(3);
    steer(d,_acc,d.st==='strike'?220:140,sp,dt,true);
    const rel=_a.subVectors(d.p,t.p),vr=_b.subVectors(d.v,t.v),vv=vr.lengthSq(),k=vv>1e-6?cl(-rel.dot(vr)/vv,-dt,0):0,cpa=rel.addScaledVector(vr,k).length();
    if(cpa<(d.st==='strike'?8:6))pass(s,d,t,1);else if(dist>d.pd&&d.pd<35)pass(s,d,t,cl(1.25-d.pd/28,0,1));else d.pd=dist}  /* slows into the target so it can turn onto it; a wide pass still gets a weaker roll */
   else if(d.st==='gnd'){const g=d.gp;d.tt+=dt;if(!g||g.alive===false||d.tt>40){d.st='ret';d.gp=null;d.boost=0;continue}
    const P=_c.set(g.p.x,g.p.y,g.p.z),r=_a.subVectors(P,d.p),dist=r.length(),vd=r.setLength(SW.boost);if(dist>300)vd.y=Math.max(vd.y,(api.gh(d.p.x,d.p.z)+60-d.p.y)*.5);_acc.subVectors(vd,d.v).multiplyScalar(3);steer(d,_acc,220,SW.boost,dt,true);
    if(dist<(g.r||10)+6)gpass(s,d,g)}}
  // separation: no two drones closer than 4.5 m
  for(let i=0;i<s.d.length;i++)for(let j=i+1;j<s.d.length;j++){const a=s.d[i],b=s.d[j],r=_a.subVectors(a.p,b.p),q=r.lengthSq();if(q<20&&q>1e-6){const k=(4.5-Math.sqrt(q))*6*dt;r.normalize().multiplyScalar(k);a.v.add(r);b.v.sub(r)}}}
 function steer(d,acc,amax,vmax,dt,keep){acc.clampLength(0,amax);d.v.addScaledVector(acc,dt).clampLength(0,vmax);d.p.addScaledVector(d.v,dt);const g=api.gh(d.p.x,d.p.z)+2.5;if(d.p.y<g){d.p.y=g;if(d.v.y<0)d.v.y=0}
  const u=_u.copy(acc).multiplyScalar(keep?.35:1);u.y+=9.8;u.normalize();d.up.lerp(u,1-Math.exp(-dt*6)).normalize();if(d.v.x*d.v.x+d.v.z*d.v.z>9)d.yaw=Math.atan2(d.v.x,d.v.z)}
 // an attack pass: the host (or solo) rolls it; a co-op client only shows it and trims its copy when the host's count comes in
 function pass(s,d,t,q=1){const M=SW.mk[s.mk],F=FORMS[s.form];d.boost=0;
  if(!auth()){d.st='ret';d.t=null;return}
  let p=M.pk*eff(t)*(Z.jink?.(t)??1);if(d.st==='strike'||s.mode==='attack')p*=F.pk;if(d.st==='strike')p*=1.15;p=Math.min(.95,p*q);
  const o=Z.helperHit(t,p,M.direct);if(o==='kill'){t.sw=s.key;s.kills++;Z.helperKill(t);Z.pop?.(t.p,'SWARM','#5fe3ff')}else if(o==='damage'&&t.k!=='boss')api.damage(t);
  if(F.splash&&t.k==='swarm')for(const u of TH)if(u!==t&&u.k==='swarm'&&api.live(u)&&u.p.distanceTo(t.p)<14&&Math.random()<p*.5){s.kills++;Z.helperKill(u)}
  d.st='ret';d.t=null;if(Math.random()<M.loss*F.loss)lose(s,d)}
 function gpass(s,d,g){d.boost=0;d.st='ret';d.gp=null;if(!auth())return;try{g.hit?.(1,s.key)}catch(e){console.warn('swarm ground hit',e)}api.boom(_a.set(g.p.x,g.p.y,g.p.z),.6);if(Math.random()<SW.mk[s.mk].loss*.7)lose(s,d)}
 function lose(s,d){const i=s.d.indexOf(d);if(i<0)return;s.d.splice(i,1);s.lost++;api.boom(d.p,.35)}

 // ---------- per step ----------
 const live=()=>G.on&&(G.state==='wave'||G.state==='clear');
 function step(dt){if(!live()){for(const s of SWS.values())s.d.length=0;return}
  for(const s of SWS.values()){if(G.state==='wave'&&s.w!==G.wave)waveStart(s);
   if(!auth()&&s.want!=null&&s.ww===G.wave&&s.w===G.wave){if(s!==mine&&!s.d.length&&s.want>0)deploy(s,s.want,0);trim(s)}fly(s,dt)}  /* a co-op client: the host's count is the truth */
  const me=api.player;if(me&&me.dead<=0&&mine.d.length)me.mah+=draw()*dt/3.6}  /* the swarm's link rides on your pack */
 const draw=()=>mine.d.length*SW.amp*FORMS[mine.form].amp;
 // a co-op client: drop drones until its copy matches the host's count (the ones mid-attack first: those are the ones that went down)
 function trim(s){while(s.d.length>s.want){const d=s.d.find(q=>q.st==='eng'||q.st==='strike'||q.st==='gnd')||s.d[s.d.length-1];lose(s,d)}}

 // ---------- visuals ----------
 function visuals(){let k=0;const on=live();
  if(on)for(const s of SWS.values())for(const d of s.d){if(k>=MAXD)break;_q.setFromUnitVectors(UP,d.up);_qy.setFromAxisAngle(UP,d.yaw);_q.multiply(_qy);_m.compose(d.p,_q,_s);body.setMatrixAt(k,_m);
   const b=d.boost?1:0,c=b?[1.6,.7,.25]:s.col,L=b?2.4:1.6;gPos[k*3]=d.p.x;gPos[k*3+1]=d.p.y+.08;gPos[k*3+2]=d.p.z;gCol[k*3]=c[0]*L;gCol[k*3+1]=c[1]*L;gCol[k*3+2]=c[2]*L;k++;
   if(b&&(d.fx-=1)<=0){d.fx=3;const tail=_a.copy(d.v).setLength(-.6).add(d.p);api.FX.emit(tail,0xffa040,2,3,.25,null,2.5);api.SMK.emit(tail,0xcfcac2,1,1,3,null,1,.5)}}
  body.count=k;body.instanceMatrix.needsUpdate=true;gGeo.setDrawRange(0,k);gGeo.attributes.position.needsUpdate=gGeo.attributes.color.needsUpdate=true;hud()}

 // ---------- HUD: the swarm panel (count, formation diagram, command, strike charges, keys) ----------
 const glyph=FORMS.map((F,fi)=>{const pts=[],f=new V3(0,0,-1),O=new V3();for(let i=0;i<8;i++){const p=slot(fi,i,8,O,f,f,.6,new V3());pts.push(p)}const m=Math.max(1,...pts.map(p=>Math.max(Math.abs(p.x),Math.abs(p.z))));
  return`<svg viewBox="-11 -11 22 22" width="30" height="30">${pts.map(p=>`<circle cx="${(p.x/m*9).toFixed(1)}" cy="${(p.z/m*9).toFixed(1)}" r="1.5" fill="#5fe3ff"/>`).join('')}<path d="M0 -2.6 L2 2 L-2 2Z" fill="#fff"/></svg>`});
 const panel=document.createElement('div');panel.id='zsw';panel.className='osd';panel.hidden=true;$('hud').append(panel);
 const css=document.createElement('style');css.textContent='#zsw{position:absolute;left:18px;bottom:calc(150px + env(safe-area-inset-bottom,0px));display:grid;gap:3px;font:700 12px var(--mono);background:var(--panel);border:1px solid var(--edge);border-radius:6px;padding:7px 10px;min-width:190px}'+
  '#zsw .h{display:flex;align-items:center;gap:8px;font-size:14px;color:#5fe3ff}#zsw .h b{color:#fff}#zsw .h small{color:#9fb3c8;font-size:11px;margin-left:auto}#zsw .m{color:#fff}#zsw .m .a{color:#ffc640}#zsw .k{color:#9fb3c8;font-size:10.5px;line-height:1.5}#zsw kbd{color:var(--amber);font:700 10.5px var(--mono)}'+
  '#zsw .c i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff9a3c;margin-right:3px}#zsw .c i.u{background:none;border:1px solid #ff9a3c}#hud:not(.z) #zsw{display:none}';document.head.append(css);
 let last='';
 function hud(){const s=mine,show=G.on&&lv('swarm')>0&&(G.state==='wave'||G.state==='clear')&&!api.demo;panel.hidden=!show;if(!show)return;const n=SW.n[cl(lv('swarm'),0,5)],F=FORMS[s.form];
  const md=s.mode==='attack'&&s.tgt?`<span class="a">ATTACK T${String(s.tgt.id).padStart(2,'0')}</span>`:s.mode.toUpperCase(),strk=s.d.some(d=>d.st==='strike'||d.st==='gnd'),ch=SW.mk[s.mk].charges;
  const h=`<div class="h">${glyph[s.form]}<span>SWARM <b>${s.d.length}/${n}</b></span><small>${SW.mk[s.mk].n}${s.kills?` · ${s.kills} down`:''}</small></div><div class="m">${F.n} · ${md}${strk?' · <span class="a">STRIKING</span>':''}</div>`+
   `<div class="c">STRIKE ${Array.from({length:ch},(_,i)=>`<i class="${i<s.ch?'':'u'}"></i>`).join('')}${Z.lk?.t?' · <span style="color:#5fe3ff">LOCKED</span>':''}</div><div class="k"><kbd>1</kbd> attack lock <kbd>2</kbd> screen <kbd>3</kbd> strike<br><kbd>4</kbd> form up <kbd>5</kbd> formation</div>`;
  if(h!==last)panel.innerHTML=last=h}
 // tracks your swarm is on get a small cyan tag in the FPV overlay; the radar shows your drones as dots
 function overlay(oc){if(!live()||!mine.d.length)return;const cam=api.camera,W=innerWidth,H=innerHeight,on=new Map();for(const d of mine.d)if(d.t&&api.live(d.t))on.set(d.t,(on.get(d.t)|0)+1);if(!on.size)return;
  oc.save();oc.textAlign='center';oc.font='700 11px "JetBrains Mono",monospace';oc.fillStyle='#5fe3ff';oc.shadowColor='#000';oc.shadowBlur=3;
  for(const[t,c]of on){_a.copy(t.p).project(cam);if(_a.z>1||Math.abs(_a.x)>1||Math.abs(_a.y)>1)continue;oc.fillText(`SW×${c}`,(_a.x*.5+.5)*W,(-_a.y*.5+.5)*H+34)}oc.restore()}
 function radar(rc,P){if(!live())return;for(const s of SWS.values()){rc.fillStyle=s===mine?'#5fe3ff':'#ffd27a';for(const d of s.d){const q=P(d.p.x,d.p.z);rc.fillRect(q[0]-1.5,q[1]-1.5,3,3)}}}

 // ---------- input: keys 1-5 (numpad too), pad A / B / X / RB (unless RB is your detonate button) / R3 ----------
 const KEYS={Digit1:'attack',Digit2:'screen',Digit3:'strike',Digit4:'form',Digit5:'next',Numpad1:'attack',Numpad2:'screen',Numpad3:'strike',Numpad4:'form',Numpad5:'next'};
 function key(e){const c=KEYS[e.code];if(!c||G.state!=='wave'||!lv('swarm'))return false;command(c);return true}
 function pad(e){if(G.state!=='wave'||!lv('swarm'))return false;const fire=[S.fireBtn,S.xfire];for(const[b,c]of[[0,'attack'],[1,'screen'],[2,'strike'],[11,'form'],[5,'next']])if(!fire.includes(b)&&e(b)){command(c);return true}return false}

 // ---------- co-op (znet.js): commands out, other pilots' swarms in, the host's counts ----------
 Z.swOut=()=>lv('swarm')&&!Z.idle?.()?[mine.form,Math.max(0,MODES.indexOf(mine.mode)),mine.mode==='attack'&&mine.tgt?mine.tgt.id:0,mine.sseq,...(mine.sp?[Math.round(mine.sp.x),Math.round(mine.sp.y),Math.round(mine.sp.z)]:[0,0,0]),mine.gid??0]:null;
 Z.swIn=(k,a,r)=>{if(!r?.d||!Array.isArray(a)||a.length<8||!a.slice(0,7).every(Number.isFinite))return;let s=SWS.get(k);
  if(!s){s=make(k,()=>r.seen?{p:r.d.p,v:r.d.v,q:r.d.q,ok:!r.dead}:null);s.sseq=a[3]}s.src=()=>r.seen?{p:r.d.p,v:r.d.v,q:r.d.q,ok:!r.dead}:null;
  s.form=cl(a[0]|0,0,FORMS.length-1);const m=MODES[a[1]|0]||'escort';
  if(m==='attack'){if(s.mode!=='attack'||s.tgt?.id!==a[2]){const t=TH.find(u=>u.id===a[2]);if(t)attack(s,t)}}else if(s.mode!==m)recall(s,m);
  if(a[3]>s.sseq){s.sseq=a[3];if(G.state==='wave'&&(s.ch>0||!auth())){const g=a[7]?ground().find(q=>q.id===a[7]):null;if(strikeAt(s,new V3(a[4],a[5],a[6]),g))s.ch=Math.max(0,s.ch-1)}}};
 Z.swSnap=me=>{const o={};for(const s of SWS.values())o[s===mine?me:s.key]=[s.d.length,s.ch,s.w];return o};
 Z.swHost=(o,me)=>{if(!o||typeof o!=='object')return;for(const[k,a]of Object.entries(o)){if(!Array.isArray(a))continue;const s=k===me?mine:SWS.get(k);if(!s)continue;s.want=cl(a[0]|0,0,12);s.ww=a[2]|0;if(s.ww===s.w&&s===mine)s.ch=cl(a[1]|0,0,3)}};
 Z.swGone=k=>{if(k==null){for(const key of[...SWS.keys()])if(key!=='me')SWS.delete(key);return}SWS.delete(k)};

 // ---------- hooks ----------
 const s0=Z.step;Z.step=dt=>{s0(dt);step(dt)};
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);visuals()};
 const o0=Z.overlay;Z.overlay=oc=>{o0(oc);overlay(oc)};
 const r0=Z.radar;Z.radar=(rc,P,sel,K)=>{r0(rc,P,sel,K);radar(rc,P)};
 const k0=Z.key;Z.key=e=>Z.base.el.hidden&&key(e)||k0(e);
 const p0=Z.pad;Z.pad=e=>Z.base.el.hidden&&$('zover').hidden&&pad(e)||p0(e);
 const st0=Z.stop;Z.stop=()=>{st0();for(const s of SWS.values())s.d.length=0;Z.swGone();body.count=0;gGeo.setDrawRange(0,0);panel.hidden=true};
 // Z.swarm: the small public API (sorties, other modes). Ground targets: define Z.groundTargets = () => [{id, p:{x,y,z}, r, alive, hit(n, pilotKey)}];
 // the strike command then goes for the one under your reticle (or any in reach when no threats are), and every drone that reaches it calls hit(1).
 // Z.swarm.strike(target) sends this pilot's swarm at {p} (air) or at a ground target object directly; it spends a strike charge.
 Z.swarm={FORMS,MODES,get count(){return mine.d.length},get charges(){return mine.ch},get form(){return FORMS[mine.form].id},get mode(){return mine.mode},
  command,setForm:f=>command('form#',typeof f==='string'?FORMS.findIndex(F=>F.id===f):f),strike:t=>command('strike',t&&t.hit?{ground:t}:t)};
 // tests and bots
 Z.sw={mine,SWS,draw,slot,deploy,command,attack:(t)=>command('attack',t),get drones(){return mine.d}};
 return Z.sw}
