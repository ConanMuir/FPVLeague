// Zombies enemies codex: the bosses as set events first, then as enemies you choose.
//
// Campaign: every sector introduces one boss as a scripted event (SET below: which boss, at which wave, with a radio warning). Beating it
// marks it beaten in the save (S.zcodex = {v:1, b:{id:{seen, beaten, allowed}}}); meeting it or losing to it marks it seen. A campaign
// sector plays only its own set piece: the old every-10-waves Mothership and the random boss events are replaced by it (the capstone keeps
// its "Mothership escort" modifier), and a boss wave without one brings a heavy raid.
//
// Quick defence (and the Endless mode): the boss rotation draws only from the bosses you have beaten AND left allowed (the Enemies screen has
// the switch), plus the free baseline boss (FREE: the Mothership, so a fresh profile still meets it on wave 10). With every boss blocked boss
// waves bring a heavy raid instead. Unlocked bosses come more often than the old once-per-10-waves Mothership: the pool rotates on every
// boss wave, a second boss may join from wave 30 (a third from 60)
// and each unlocked boss rolls its own rare event as before. A boss does not come before its first boss wave (zbosses spawn.boss, or its
// event wave), and the Undertaker's own trigger (a lost or neglected site) and the Ghost of the Ace's wreck follow the same rules.
//
// Enemies screen (menu and base screen button): a grid of the 12 campaign bosses. Unbeaten ones are dark silhouettes (the real model drawn
// flat by a small software rasteriser, no GL) named "???" with a hint of the sector that introduces them; beaten ones show in full with
// name, one line, trophy and the Allowed switch. Secret bosses (SECRET: the Ghost of the Ace, the MIRV boss of the future) only appear once found.
//
// Bots, the bench and the tests play with the whole roster: the codex is "all unlocked, all allowed" while a Bot Spectator run is on or
// sessionStorage zcodex is 'all' (tools/zombies-bench.mjs and friends set it), the old rotation applies and nothing is written to the save.
//
// Hooks (all optional on the other side): zombies.js calls initCodex last. It wraps Z.bossCompose (the rotation), ctx.spawn of the boss
// registry (the gate), Z.step (record deltas, the set piece's wave start), Z.kill / Z.impact (the Mothership has no record), Z.cpHTML (the
// base screen's Enemies bar), Z.cpOver / Z.overNote (what was unlocked), Z.syncMode, and offers Z.cdxBrief(sector) to the campaign
// briefing. codexPool() is exported for the Endless mode; Z.codex has the rest.
import {KIND,budget} from './zdata.js';
import {SECTORS,SEC} from './zcampaign.js';
import {ownRandom} from '../../engine/idle.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);

// ---------- the sector set pieces: sector -> {boss, wave, warn (the radio line, no name), direct (not queued: the Undertaker's own trigger)} ----------
// Difficulty climbs with the map: the carrier, a saboteur, a hidden puppeteer, the twins, a false friend, the armoured missile, a mimic, the
// ace, the jammer, the hive, the stealth bomber, and at the capstone the Hush, the registry's own last boss (first boss wave 45).
// Each boss sits in the sector whose modifiers it plays against (farmland hay for the Puppeteer, the radar blackout for the Jammer King...).
// The wave leaves a few more after it; the two persistent bosses (Undertaker, Puppeteer) get the most room.
export const SET={
 mill:{boss:'boss',wave:5,warn:'Command to all stations: a heavy carrier is crossing the line, slow and big. Take its pods out one by one.'},
 river:{boss:'undertaker',wave:5,direct:1,warn:'Saboteurs hit us in the dark. Something is coming to strip what they broke. Repair it, or kill it small.'},
 silo:{boss:'puppet',wave:6,warn:'Wires in the wheat. Something on the ground is pulling the drones\' strings. Follow the glint.'},
 rail:{boss:'twins',wave:8,warn:'Two fast movers over the junction, flying as one. Split them.'},
 hosp:{boss:'siren',wave:8,warn:'Friendly transponders inbound? We have nothing of ours in the air. Trust your eyes, not the scope.'},
 power:{boss:'jugg',wave:9,warn:'The scope shows something the size of a building, and slow. Armoured. Find where it glows.'},
 quarry:{boss:'mirror',wave:10,warn:'A contact in the dust is flying our pilot\'s pattern, turn for turn. It is learning you.'},
 air:{boss:'ace',wave:11,warn:'The enemy ace is on the airfield net. He is hunting our interceptor. Break hard when you hear the tone.'},
 ridge:{boss:'jammer',wave:11,warn:'Heavy jamming over the ridge. Radar and lock are going. Fly by what you can see.'},
 dam:{boss:'hive',wave:14,warn:'A honeycomb carrier over the dam, full of swarms. When it breaks, it breaks into three.'},
 factory:{boss:'ghost',wave:14,warn:'A flash on the scope and gone. Stealth bomber over the belt. Look for the contrail.'},
 gate:{boss:'hush',wave:17,warn:'All stations: lights out over the Launch Complex. Do not look for it. Listen.'}};
// the grid's order is the map's: sector by sector. SECRET: never listed until found (reserved ids, the MIRV boss is not written yet).
export const ORDER=SECTORS.filter(s=>SET[s.id]).map(s=>SET[s.id].boss),SECRET=['gace','mirv'],KNOWN=[...ORDER,...SECRET],FREE=['boss'];  /* FREE: bosses that are in Quick defence from the start (the Mothership, the baseline boss; Old Mill still introduces it: beating it there marks it beaten in the codex) */
export const sectorOf=id=>SECTORS.find(s=>SET[s.id]?.boss===id)||null;
// the codex's own words (the boss modules' notes are long); the model, colours, trophy and numbers come from the registry
export const DEX={
 boss:{one:'A slow flying-wing carrier. It launches FPV swarms until you strip its pods, one hit at a time.'},
 undertaker:{one:'A salvage drone that strips wrecked sites and leeches the rest. Repair the wreck to starve it.'},
 puppet:{one:'A ground unit in disguise, stringing wires to drones and hijacking yours. Strike it direct.'},
 twins:{one:'Two linked jets that shield each other. Snap the link, then kill one and the other rages.'},
 siren:{one:'An escort broadcasting a false friendly ID: your helpers hold fire. Spot it by eye.'},
 jugg:{one:'A 40 m armoured cruise missile. Only bursts on its glowing weak points count.'},
 mirror:{one:'A copy of your own interceptor that flies the way you do. Break your habits.'},
 ace:{one:'KOSCHEI, an enemy ace who duels you: he locks your six, bombs your sites and learns your approach.'},
 jammer:{one:'An electronic-warfare aircraft. It jams radar and lock and spoofs your pip until you burn through.'},
 hive:{one:'A honeycomb carrier full of swarms. At half strength it splits into three brood carriers.'},
 ghost:{one:'A stealth bomber with no radar track and no bracket. Hunt its contrail and its heat shimmer.'},
 hush:{one:'A near-silent flyer in total darkness. Radar fills with static: listen, and strike when it passes.'},
 gace:{one:'KOSCHEI returns from his wreck with a legion of spectres raised from everything you shot down.'}};

// ---------- save ----------
export const CODEX_V=1;
// any value in, a valid codex out: {v, b:{id:{seen, beaten, allowed}}}; unknown ids and wrong types are dropped, beaten implies seen, allowed is on unless it is exactly false
export function cleanCodex(c,ids=KNOWN){const o={v:CODEX_V,b:{}};if(!c||typeof c!=='object'||Array.isArray(c)||c.v!==CODEX_V||!c.b||typeof c.b!=='object'||Array.isArray(c.b))return o;
 for(const id of ids){if(typeof id!=='string'||!Object.hasOwn(c.b,id))continue;const e=c.b[id];if(!e||typeof e!=='object'||Array.isArray(e))continue;const beaten=e.beaten===true;o.b[id]={seen:beaten||e.seen===true,beaten,allowed:e.allowed!==false}}
 return o}
export const isUnlocked=(c,id)=>FREE.includes(id)||!!c.b[id]?.beaten;
export const isAllowed=(c,id)=>isUnlocked(c,id)&&c.b[id]?.allowed!==false;

// ---------- the rotation (pure: the game passes what it knows) ----------
const EVK=[.7,1,1.25,1.5],EXTRA_FROM=30,EXTRA2_FROM=60;
// drop some of the raid to make room for a boss (never another boss)
const trim=(out,rnd,p,isBoss)=>{for(let i=out.length-1;i>=0;i--)if(rnd()<p&&!isBoss(out[i]))out.splice(i,1)};
// a boss wave with no boss: the budget the boss's slot took off (the heavy end of what has arrived by this wave), as armoured heavies, cruise missiles and jets
export function heavyRaid(w,b,from,rnd=Math.random){const W={heavy:3,cruise:2,jet:3},ks=Object.keys(W).filter(k=>from(k)<=w),out=[];if(!ks.length)ks.push('shahed'),W.shahed=1;
 let tot=0;for(const k of ks)tot+=W[k];while(b>0&&out.length<90){let r=rnd()*tot,k=ks[0];for(const q of ks){r-=W[q];if(r<=0){k=q;break}}out.push(k);b-=KIND[k].pts}return out}
// Quick defence / Endless wave w. out = the plan so far ('boss' in it on a boss wave). o: pool (allowed ids), info(id) -> {debut, event, can(w)} | null, seen (met this
// run), shift (the difficulty's), dfi, bevW (the last event wave), heavy(w) -> kinds, isBoss(kind), rnd. Returns {out, bevW}.
export function rotate(out,w,o){const{pool,info,seen={},shift=0,dfi=1,heavy,isBoss=()=>false}=o,rnd=o.rnd||Math.random;let bevW=o.bevW??-99;
 const can=id=>{const f=info(id);return!!f&&w>=f.debut-(f.fixed?0:shift)&&(!f.can||f.can(w))};  /* fixed: the Mothership is on its wave whatever the difficulty (Easy's negative shift would put it at wave 14, i.e. 20) */
 const pick=L=>{let tot=0;for(const id of L)tot+=seen[id]?1:3;let r=rnd()*tot;for(const id of L){r-=seen[id]?1:3;if(r<=0)return id}return L[L.length-1]};  /* the ones not met this run first */
 const bi=out.indexOf('boss');
 if(bi>=0){const el=pool.filter(can);
  if(!el.length){out.splice(bi,1);out.push(...heavy(w));return{out,bevW}}
  const first=pick(el);out[bi]=first;
  if(w>=EXTRA_FROM){let n=w>=EXTRA2_FROM?2:1;const left=el.filter(id=>id!==first),ch=Math.min(.9,.5*EVK[cl(dfi,0,3)]);
   while(n-->0&&left.length&&rnd()<ch){const id=pick(left);left.splice(left.indexOf(id),1);out.push(id);trim(out,rnd,.15,isBoss)}}
  return{out,bevW}}
 if(w-bevW<3)return{out,bevW};  /* events: at most one a wave, three waves apart, never on a boss wave; only the eligible roll */
 const el=pool.filter(id=>{const f=info(id),E=f&&f.event;return E&&w>=E.from-shift&&!(E.once&&seen[id])&&(!f.can||f.can(w))});
 for(const id of el.length>1?el.sort(()=>rnd()-.5):el){const E=info(id).event;
  if(rnd()<E.p*EVK[cl(dfi,0,3)]*(E.again&&seen[id]?E.again:1)){bevW=w;trim(out,rnd,.2,isBoss);out.push(id);break}}
 return{out,bevW}}
// a campaign sector's wave w: its set piece on its wave (queued, unless direct), the every-10 Mothership gone (kept with the Mothership-escort modifier)
export function scripted(out,w,S,keep,heavy,rnd=Math.random,isBoss=()=>false){const hit=!!S&&S.wave===w,q=hit&&!S.direct,bi=out.indexOf('boss');
 if(bi>=0&&!keep){out.splice(bi,1);if(q)out.splice(bi,0,S.boss);else out.push(...heavy(w))}
 else if(q&&!out.includes(S.boss)){trim(out,rnd,.25,isBoss);out.push(S.boss)}
 return out}

// ---------- silhouettes: the boss model drawn flat to a 2D canvas by a small software rasteriser (no GL: runs anywhere, headless too) ----------
const LOOK=[-.62,.52,.78];  /* from the model toward the camera: front, left, above */
// models that hide their real form until the fight: how to show it (the Puppeteer's disguises are switched off in its build; the codex draws the spider under them)
const POSE={puppet:m=>{const S=m.userData.sub;if(S)for(const q in S)S[q].visible=q==='spider'}};
// the model's triangles in world space: P = 9 floats a triangle, M = its material, C = [r,g,b,glow] per material, S = 1 for a two-sided one
function soupOf(THREE,root){root.updateMatrixWorld(true);const P=[],M=[],C=[],S=[],V=THREE.Vector3,a=new V(),b=new V(),c=new V(),m4=new THREE.Matrix4(),im=new THREE.Matrix4(),mi=new Map();
 const avg=t=>{if(t.userData.cdxAvg)return t.userData.cdxAvg;let v=[1,1,1];try{const i=t.image;if(i&&(i.width||i.videoWidth)){const k=document.createElement('canvas');k.width=k.height=8;const g=k.getContext('2d',{willReadFrequently:true});g.drawImage(i,0,0,8,8);
   const d=g.getImageData(0,0,8,8).data;let r=0,gr=0,bl=0,n=0;for(let j=0;j<64;j++)if(d[j*4+3]>20){r+=d[j*4];gr+=d[j*4+1];bl+=d[j*4+2];n++}if(n)v=[r/n/255,gr/n/255,bl/n/255]}}catch(e){}return t.userData.cdxAvg=v};
 const skip=m=>!m||m.visible===false||m.colorWrite===false||m.wireframe||m.blending===THREE.AdditiveBlending||m.transparent&&m.opacity<.4;
 const matOf=m=>{let i=mi.get(m);if(i!=null)return i;const h=m.color?m.color.getHex():0xffffff,raw=m.color?Math.max(m.color.r,m.color.g,m.color.b):1,t=m.map?avg(m.map):[1,1,1];let r=(h>>16&255)*t[0],g=(h>>8&255)*t[1],bl=(h&255)*t[2];
  if(m.emissive&&m.emissiveIntensity>0&&m.emissive.getHex()){const e=m.emissive.getHex(),k=Math.min(1,m.emissiveIntensity);r+=(e>>16&255)*k;g+=(e>>8&255)*k;bl+=(e&255)*k}
  i=C.length;C.push([cl(r,0,255),cl(g,0,255),cl(bl,0,255),m.isMeshBasicMaterial&&raw>1.2?1:0]);S.push(m.side===THREE.DoubleSide?1:0);mi.set(m,i);return i};
 root.traverseVisible(o=>{if(!o.isMesh||!o.geometry||!o.geometry.attributes.position)return;const g=o.geometry,pa=g.attributes.position,ix=g.index,ms=Array.isArray(o.material)?o.material:[o.material];
  const parts=Array.isArray(o.material)&&g.groups.length?g.groups.map(q=>({s:q.start,n:q.count,m:ms[q.materialIndex]})):[{s:0,n:ix?ix.count:pa.count,m:ms[0]}];
  const n=o.isInstancedMesh?Math.min(o.count,64):1;
  for(let k=0;k<n;k++){if(o.isInstancedMesh){o.getMatrixAt(k,im);m4.multiplyMatrices(o.matrixWorld,im)}else m4.copy(o.matrixWorld);
   for(const q of parts){if(skip(q.m))continue;const mat=matOf(q.m),step=Math.max(1,Math.ceil(q.n/3/60000))*3;
    for(let i=q.s;i+2<q.s+q.n;i+=step){const ia=ix?ix.getX(i):i,ib=ix?ix.getX(i+1):i+1,ic=ix?ix.getX(i+2):i+2;
     a.fromBufferAttribute(pa,ia).applyMatrix4(m4);b.fromBufferAttribute(pa,ib).applyMatrix4(m4);c.fromBufferAttribute(pa,ic).applyMatrix4(m4);
     P.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);M.push(mat)}}}});
 return{P:Float32Array.from(P),M:Uint16Array.from(M),C,S,n:M.length}}
// the soup from the camera: flat black (a silhouette) or Lambert-shaded in the materials' colours, painter's order; a canvas W x H
function draw(soup,full,W=480,H=300){const{P,M,C,S,n}=soup,cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');if(!n)return cv;
 const el=Math.hypot(...LOOK),E=LOOK.map(v=>v/el),f=E.map(v=>-v);  /* f: the way the camera looks */
 let rx=-f[2],rz=f[0];const rl=Math.hypot(rx,rz)||1;rx/=rl;rz/=rl;const r=[rx,0,rz],u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];  /* right = f x up, up = r x f */
 const Lx=E[0]*.35-.5,Ly=E[1]*.35+.8,Lz=E[2]*.35+.1,Ll=Math.hypot(Lx,Ly,Lz),L=[Lx/Ll,Ly/Ll,Lz/Ll];
 const X=new Float32Array(n*3),Y=new Float32Array(n*3),D=new Float32Array(n),SH=new Uint8Array(n),OK=new Uint8Array(n);let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
 for(let t=0;t<n;t++){const o=t*9;let dz=0;for(let k=0;k<3;k++){const px=P[o+k*3],py=P[o+k*3+1],pz=P[o+k*3+2],sx=px*r[0]+py*r[1]+pz*r[2],sy=px*u[0]+py*u[1]+pz*u[2];X[t*3+k]=sx;Y[t*3+k]=sy;dz+=px*f[0]+py*f[1]+pz*f[2];
   if(sx<x0)x0=sx;if(sx>x1)x1=sx;if(sy<y0)y0=sy;if(sy>y1)y1=sy}D[t]=dz/3;
  const ux=P[o+3]-P[o],uy=P[o+4]-P[o+1],uz=P[o+5]-P[o+2],vx=P[o+6]-P[o],vy=P[o+7]-P[o+1],vz=P[o+8]-P[o+2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const nl=Math.hypot(nx,ny,nz);
  if(nl<1e-9)continue;nx/=nl;ny/=nl;nz/=nl;let face=nx*E[0]+ny*E[1]+nz*E[2];if(face<0){if(!S[M[t]]){OK[t]=full?0:1;continue}nx=-nx;ny=-ny;nz=-nz}  /* away from the camera: a closed one-sided surface is hidden */
  OK[t]=1;SH[t]=Math.round(cl(.34+.78*Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]),0,1.2)*10)}
 const m=.07,s=Math.min(W*(1-2*m)/Math.max(1e-6,x1-x0),H*(1-2*m)/Math.max(1e-6,y1-y0)),ox=W/2-(x0+x1)/2*s,oy=H/2+(y0+y1)/2*s;
 const tri=(t,flip)=>{const a=t*3,b=flip?a+2:a+1,c=flip?a+1:a+2;g.moveTo(X[a]*s+ox,oy-Y[a]*s);g.lineTo(X[b]*s+ox,oy-Y[b]*s);g.lineTo(X[c]*s+ox,oy-Y[c]*s);g.closePath()};
 const area=t=>{const a=t*3;return(X[a+1]-X[a])*(Y[a+2]-Y[a])-(X[a+2]-X[a])*(Y[a+1]-Y[a])};
 if(!full){g.fillStyle='#04070c';g.beginPath();for(let t=0;t<n;t++){const q=area(t);if(Math.abs(q)<1e-9)continue;tri(t,q<0)}g.fill();return cv}  /* every triangle one way round, so overlaps add up instead of cancelling */
 const ord=[];for(let t=0;t<n;t++)if(OK[t]&&Math.abs(area(t))>1e-9)ord.push(t);ord.sort((p,q)=>D[q]-D[p]);
 const col=new Map(),css=(mt,sh)=>{const k=mt*16+sh;let v=col.get(k);if(!v){const c=C[mt],gl=c[3],l=gl?1.1:sh/10;v=`rgb(${Math.round(cl(c[0]*l*1.12+10,0,255))},${Math.round(cl(c[1]*l*1.12+10,0,255))},${Math.round(cl(c[2]*l*1.12+10,0,255))})`;col.set(k,v)}return v};
 g.lineWidth=.8;g.lineJoin='round';for(const t of ord){const c=css(M[t],SH[t]);g.fillStyle=g.strokeStyle=c;g.beginPath();tri(t,area(t)<0);g.fill();g.stroke()}
 return cv}
// coverage and brightness of a drawn canvas (the tests: a silhouette is all dark, a full model has colour)
export function pixels(cv){const w=cv.width,h=cv.height,d=cv.getContext('2d').getImageData(0,0,w,h).data;let n=0,mx=0,col=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<40)continue;n++;const a=d[i],b=d[i+1],c=d[i+2];mx=Math.max(mx,a,b,c);if(Math.max(a,b,c)-Math.min(a,b,c)>40)col++}
 return{cover:n/(w*h),max:mx,col:n?col/n:0}}

// ---------- the in-game side ----------
let ST=null;
// the bosses the rotation may draw right now (unlocked and allowed; all of them for bots and tests). For the Endless mode: codexPool() before it plans a boss wave.
export const codexPool=()=>ST?ST.pool():[];
export function initCodex(api,G,Z){
 const B=Z.bosses;if(!B)return null;
 const {THREE,S,save,feed,TH}=api,BOSSES=B.BOSSES,ROSTER=B.ROSTER,C=B.ctx,$=id=>document.getElementById(id);
 let force=null,prev='';
 /* bots, the bench and the tests: the whole roster, the old rotation, nothing written. A Bot Spectator run turns it on by itself (E.spec is set last) */
 const all=()=>{if(force)return force==='all';try{if(sessionStorage.getItem('zcodex')==='all')return true}catch(e){}return!!window.__z?.spec?.on};
 let _ids=null;const ids=()=>_ids||(_ids=[...KNOWN,...Object.keys(BOSSES).filter(k=>!KNOWN.includes(k)&&!BOSSES[k].minor&&!BOSSES[k].child)]);  /* the registry is complete once the roster is imported */
 const load=()=>cleanCodex(S.zcodex,ids()),put=c=>{S.zcodex=c;save();sync()};
 const writes=()=>B.roster!==false&&!all()&&!Z.mirror&&!api.demo&&G.on;  /* roster false: the harness's plain Zombies sections leave the save alone */
 const info=id=>{const D=BOSSES[id];if(id==='boss')return{debut:10,fixed:1};const sp=D?.spawn;if(!sp)return null;const ev=sp.event||null;
  return{debut:Math.max(10,sp.boss??ev?.from??10),event:ev,can:D.can?w=>D.can(C,w):null}};
 const camp=()=>{const r=Z.cp?.run;return r&&!r.endless?r:null};  /* a campaign sector's run; an Endless run (zendless.js) is not one: it plays the Quick defence rotation and the pool, with no set piece */
 const poolIds=()=>['boss',...ROSTER.filter(id=>BOSSES[id].spawn)];
 const shift=()=>Z.diff?.().shift|0;
 /* the allowed bosses; with a wave, only those that may come on it (past their first boss wave, and the boss's own condition) */
 const pool=w=>{const c=load(),a=all();return poolIds().filter(id=>(a||isAllowed(c,id))&&(w==null||(f=>!!f&&w>=f.debut-(f.fixed?0:shift())&&(!f.can||f.can(w)))(info(id))))};
 ST={pool};
 const isB=k=>k==='boss'||!!BOSSES[k],heavy=w=>heavyRaid(w,Math.round(budget(w,Z.diff?.().wave??1)*.4),k=>Z.kindFrom(k));
 const name=id=>BOSSES[id]?.n||KIND[id]?.n||id,col=id=>BOSSES[id]?.col||'#ff9a3c';
 G.cdx={last:{},new:[],m:0,pt:0,sc:0};

 // ---------- the rotation: the wave plan ----------
 const bc0=Z.bossCompose;
 Z.bossCompose=(out,w)=>{if(Z.mirror||G.state==='trial'||B.roster===false||G.bforce&&BOSSES[G.bforce])return bc0?bc0(out,w):out;  /* the same early outs as the roster's, and its debug trigger */
  const run=camp();if(run)return scripted(out,w,SET[run.id],run.mods.some(m=>m.id==='boss5'),heavy,Math.random,isB);
  if(all())return bc0?bc0(out,w):out;
  const r=plan(out,w);G.bevW=r.bevW;return r.out};
 /* the Quick defence rotation (the Endless mode can call it too): {out, bevW} */
 const plan=(out,w,o={})=>rotate(out,w,{pool:pool(),info,seen:G.bseen||{},shift:shift(),dfi:Z.dfi?.()|0,bevW:G.bevW,heavy,isBoss:isB,...o});

 // ---------- the gate: a boss's own trigger (the Undertaker's lost site) or a secret chain goes through ctx.spawn; it needs the codex's yes ----------
 const sp0=C.spawn;
 const gate=(id,o)=>{const D=BOSSES[id];if(!D||D.minor||D.child||o?.enc||o?.set?.keep||B.roster===false||all()||SECRET.includes(id))return true;
  const run=camp();if(run)return SET[run.id]?.boss===id;return isAllowed(load(),id)};
 C.spawn=(id,o)=>gate(id,o)?sp0(id,o):null;

 // ---------- the record: meeting and beating a boss ----------
 const KEYS=['met','won','lost'],news=(id)=>{const nm=name(id);G.cdx.new.push(id);feed(`<span class="cg">Enemies: <b>${esc(nm)}</b> is in your codex.</span> It can now come to Quick defence (Enemies to switch it off).`);Z.an?.say('CODEX UPDATED',nm,col(id),2)};
 function note(id,f){if(!writes()||!ids().includes(id))return;const c=load(),had=c.b[id],e=had||(c.b[id]={seen:false,beaten:false,allowed:true}),first=f==='won'&&!e.beaten,ch=!had||!e.seen||first;
  e.seen=true;if(first){e.beaten=true;e.allowed=true}if(ch)put(c);if(first)news(id)}
 /* the boss registry counts met / won / lost in S.zboss: the codex watches the counters */
 function poll(){const r=S.zboss?.b;if(!r||typeof r!=='object')return;for(const id of ids()){const o=r[id];if(!o||typeof o!=='object')continue;const l=G.cdx.last[id]||(G.cdx.last[id]={met:0,won:0,lost:0});
  for(const f of KEYS){const v=Number.isFinite(o[f])?o[f]|0:0;if(v>l[f])note(id,f);l[f]=v}}}
 const snap=()=>{const L={},r=S.zboss?.b;if(r&&typeof r==='object')for(const id of ids()){const o=r[id];if(o&&typeof o==='object')L[id]={met:o.met|0,won:o.won|0,lost:o.lost|0}}return L};
 const k0=Z.kill;Z.kill=(t,cat)=>{const was=t.paid;k0(t,cat);if(!was&&t.paid&&t.k==='boss')note('boss','won')};  /* the Mothership has no record of its own */
 const i0=Z.impact;Z.impact=t=>{if(t.k==='boss')note('boss','lost');i0(t)};

 // ---------- a set piece's wave: the radio warning, the Undertaker's saboteurs ----------
 function onWave(){const run=camp(),S0=run&&SET[run.id];if(!S0||S0.wave!==G.wave||B.roster===false)return;
  Z.an?.radio('OVERLORD',S0.warn,2);
  if(S0.direct&&!Z.mirror){  /* the Undertaker comes for a site that is down: the saboteurs put one there */
   const L=api.SITES.filter(s=>s.hp>0&&!s.zb&&!(run.fragile&&s.n==='HOSPITAL')).sort((a,b)=>b.hp/b.max-a.hp/a.max),s=L[0];
   if(s){const hp=Math.round(s.max*.22);if(s.hp>hp){s.hp=hp;feed(`<span class="cr">Saboteurs hit the ${s.n.toLowerCase()}</span>`)}
    B.spawn(S0.boss,{x:s.x,z:s.z-1600,set:{anchor:s}})}}}
 const st0=Z.step;
 Z.step=dt=>{st0(dt);if(!G.on||api.demo)return;const X=G.cdx;
  if((X.pt-=dt)<=0){X.pt=.2;poll()}  /* the record is read five times a second */
  if(G.state!==prev){const was=prev;prev=G.state;if(G.state==='wave'&&was!=='wave')onWave()}
  if(!X.m&&G.state==='wave'&&(X.sc-=dt)<=0){X.sc=.5;for(const t of TH)if(t.k==='boss'&&api.live(t)){X.m=1;note('boss','met');break}}};
 const zs=Z.start;Z.start=()=>{zs();prev='';G.cdx={last:snap(),new:[],m:0,pt:0,sc:0}};

 // ---------- silhouettes ----------
 const SOUP=new Map(),URL_=new Map();
 function build(id){const t={k:id,id:-1,p:new THREE.Vector3(0,600,0),v:new THREE.Vector3(0,0,60),bs:{hp:1,max:1,ph:0,init:0,dead:0},bank:0,st:'cruise',spd:60,cs:60,mesh:null,shade:0,_seen:1,wps:[],pods:null};let m=null;
  try{ownRandom(()=>{if(id==='boss'){Z.en.dress(t);m=t.mesh}else m=BOSSES[id]?.build?.(C,t)||null})}catch(e){console.warn('codex model',id,e)}
  if(m?.parent)m.parent.remove(m);if(m&&POSE[id])try{POSE[id](m)}catch(e){console.warn('codex pose',id,e)}return m}
 function soup(id){let s=SOUP.get(id);if(s!==undefined)return s;const m=build(id);s=null;if(m){try{s=ownRandom(()=>soupOf(THREE,m))}catch(e){console.warn('codex soup',id,e)}if(s&&!s.n)s=null}SOUP.set(id,s);return s}
 const shot=(id,full)=>{const s=soup(id);return s?draw(s,!!full):null};
 const url=(id,full)=>{const k=id+(full?'f':'s');let u=URL_.get(k);if(u===undefined){const cv=shot(id,full);u=cv?cv.toDataURL('image/png'):'';URL_.set(k,u)}return u};

 // ---------- the Enemies screen ----------
 const view=(id,c)=>{const D=BOSSES[id],e=c.b[id]||{},bt=!!e.beaten,st=bt?'beaten':e.seen?'seen':'new',sec=sectorOf(id),rec=S.zboss?.b?.[id]||{},nf=info(id);
  return{id,st,secret:SECRET.includes(id)||!sec,name:bt?name(id):'???',one:bt?(DEX[id]?.one||D?.note||''):'',tr:bt&&D?.reward?{n:D.reward.n,short:D.reward.short||D.reward.txt}:null,col:col(id),
   hint:sec?`Introduced in ${sec.n}, wave ${SET[sec.id].wave}.${e.seen?' You have met it.':''}`:'Found, not introduced.',sector:sec?.id||null,
   allowed:e.allowed!==false,free:FREE.includes(id),pool:poolIds().includes(id),tog:poolIds().includes(id)||!!D&&!D.spawn&&!SECRET.includes(id),from:nf?nf.debut:0,won:rec.won|0,met:rec.met|0}};  /* tog: the Allowed switch (the Undertaker has no wave, only its trigger) */
 const rows=()=>{const c=load(),R=ORDER.map(id=>view(id,c));for(const id of ids())if(!ORDER.includes(id)&&(c.b[id]?.seen||c.b[id]?.beaten))R.push(view(id,c));return R};
 const count=()=>{const c=load();return{n:ORDER.filter(id=>c.b[id]?.beaten).length,of:ORDER.length}};
 const poolTxt=()=>{const p=pool();return p.length?p.map(name).join(', '):'none'};
 const ov=document.createElement('div');ov.id='zcdx';ov.hidden=true;$('menu').before(ov);
 let rst=false,opened=null;
 function card(r){const bt=r.st==='beaten';
  return`<article class="zcdxc ${r.st}${r.secret?' sec':''}" style="--bc:${r.col}" data-id="${r.id}" role="group" aria-label="${esc(r.name)}">
   <div class="zcdxi"><img alt="${bt?esc(r.name)+' model':'Unknown enemy, silhouette'}" data-img="${r.id}" data-full="${bt?1:0}"></div>
   <div class="zcdxn"><h3>${esc(r.name)}</h3><em>${bt?'BEATEN':r.st==='seen'?'MET':'UNKNOWN'}</em></div>
   ${bt?`<p class="zcdxd">${esc(r.one)}</p><p class="zcdxtr">${r.tr?`<b>Trophy: ${esc(r.tr.n)}</b> ${esc(r.tr.short)}`:'No trophy: the classic boss pays cash only.'}</p>
    <p class="zcdxm">${r.pool?`Quick defence from wave ${r.from}`:r.tog?'Comes when a site is neglected':'Appears only when you find it'}${r.met?` · beaten ${r.won}×`:''}</p>
    ${r.tog?togBtn(r):''}`
   :`<p class="zcdxh">${esc(r.hint)}</p>${r.free&&r.tog?`<p class="zcdxm">In Quick defence from wave ${r.from}, from the start</p>${togBtn(r)}`:''}`}</article>`}
 const togBtn=r=>`<button class="sm zcdxa ${r.allowed?'on':''}" data-allow="${r.id}" aria-pressed="${r.allowed}" title="${r.allowed?'This boss can come to Quick defence':'Quick defence will not send this boss'}">${r.allowed?'Allowed ✓':'Blocked'}</button>`;
 function render(){const R=rows(),c=count(),a=all();
  ov.innerHTML=`<div class="zpanel zcdxp" role="dialog" aria-modal="true" aria-label="Enemies"><header><div><h2>Enemies</h2><div class="zcdxs"><b>${c.n}</b> of ${c.of} bosses beaten${a?' · <span class="co">bots and tests: everything unlocked</span>':''}</div></div>
   <div class="zcdxact"><button class="sm" data-all="1">Allow all</button><button class="sm" data-all="0">Block all</button></div><button class="sm" id="zcdxx">Back <kbd>Esc</kbd></button></header>
   <p class="zhint">Each campaign sector introduces one boss. Beat it and it joins your codex: it can then come to Quick defence on boss waves, and you choose which ones. The Mothership is the baseline: always in the pool unless you block it. With every boss blocked, boss waves bring a heavy raid instead.
   <b>Quick defence pool:</b> ${esc(poolTxt())}.</p>
   <div class="zcdxg">${R.map(card).join('')}</div>
   <footer class="zcdxf"><span class="zhint">Unknown contacts stay in the dark until you beat them in the campaign.</span><button class="sm zsell ${rst?'arm':''}" id="zcdxrs">${rst?'Confirm: forget every boss':'Forget all enemies…'}</button></footer></div>`;
  $('zcdxx').onclick=close;$('zcdxrs').onclick=()=>{if(!rst){rst=true;render();$('zcdxrs').focus();return}rst=false;put(cleanCodex(null));render()};
  for(const b of ov.querySelectorAll('[data-allow]'))b.onclick=()=>{const id=b.dataset.allow,c=load();if(!isUnlocked(c,id))return;const e=c.b[id]||(c.b[id]={seen:false,beaten:false,allowed:true});e.allowed=e.allowed===false;put(c);render();ov.querySelector(`[data-allow="${id}"]`)?.focus()};
  for(const b of ov.querySelectorAll('[data-all]'))b.onclick=()=>{const c=load(),v=b.dataset.all==='1';for(const id of ids())if(isUnlocked(c,id)){const e=c.b[id]||(c.b[id]={seen:false,beaten:false,allowed:true});e.allowed=v}put(c);render();ov.querySelector(`[data-all="${b.dataset.all}"]`)?.focus()};
  fill()}
 /* the pictures one slice at a time: the first open builds each model once (a few ms each), after that they are cached */
 function fill(){const els=[...ov.querySelectorAll('img[data-img]')];let i=0;const step=()=>{if(ov.hidden||i>=els.length)return;const el=els[i++];if(el.isConnected){const u=url(el.dataset.img,el.dataset.full==='1');if(u)el.src=u;el.parentNode.classList.add('rdy')}setTimeout(step,16)};setTimeout(step,10)}
 function open(){rst=false;opened=document.activeElement;ov.hidden=false;document.body.classList.add('zcdx-open');render();setTimeout(()=>$('zcdxx')?.focus({preventScroll:true}),30)}
 function close(){if(ov.hidden)return;ov.hidden=true;rst=false;document.body.classList.remove('zcdx-open');const o=opened;opened=null;setTimeout(()=>{const b=o&&o.isConnected&&!o.hidden?o:$('zcdxb')||$('zcdxbtn');b?.focus?.()},0)}
 /* keys while it is up: arrows move between the buttons, Esc closes; nothing reaches the game or the base screen under it */
 addEventListener('keydown',e=>{if(ov.hidden)return;const k=e.code;
  if(k==='Escape'){close();e.preventDefault();e.stopImmediatePropagation();return}
  const dir={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[k];
  if(dir){move(dir[0],dir[1]);e.preventDefault()}e.stopImmediatePropagation()},true);
 function move(dx,dy){const bs=[...ov.querySelectorAll('button:not([disabled])')];if(!bs.length)return;const a=document.activeElement,ra=bs.includes(a)?a.getBoundingClientRect():null;if(!ra){bs[0].focus();return}
  const cx=ra.x+ra.width/2,cy=ra.y+ra.height/2;let best=null,bd=1e9;for(const b of bs){if(b===a)continue;const r=b.getBoundingClientRect(),x=r.x+r.width/2-cx,y=r.y+r.height/2-cy,al=x*dx+y*dy;if(al<=4)continue;const d=al+Math.abs(x*dy+y*dx)*2;if(d<bd){bd=d;best=b}}best?.focus()}
 const pd0=Z.pad;Z.pad=e=>{if(ov.hidden)return pd0?pd0(e):false;if(e(1))close();if(e(12))move(0,-1);if(e(13))move(0,1);if(e(14))move(-1,0);if(e(15))move(1,0);if(e(0))document.activeElement?.click?.();return true};

 // ---------- the buttons: the start menu and the base screen ----------
 const mb=document.createElement('div');mb.className='zcpm zcdxm';mb.id='zcdxm';($('zcpm')||$('zdiff')).after(mb);  /* a card under the campaign's */
 function sync(){const c=count();mb.innerHTML=`<div><b>Enemies</b><span>${c.n} of ${c.of} bosses beaten · Quick defence boss pool: ${esc(poolTxt())}</span></div><button id="zcdxbtn" title="The campaign's bosses: silhouettes until you beat them; beaten ones can come to Quick defence">Enemies ▸</button>`;$('zcdxbtn').onclick=()=>open()}
 sync();const sy0=Z.syncMode;Z.syncMode=()=>{sy0?.();sync()};
 const ch0=Z.cpHTML;
 Z.cpHTML=()=>{const h=ch0?.()||'',c=count(),run=camp(),S0=run&&SET[run.id],cd=load();
  const t=run?(S0?`This sector's boss event: wave ${S0.wave}${cd.b[S0.boss]?.beaten?`, ${esc(name(S0.boss))}`:' (unknown contact)'}`:''):`${Z.cp?.run?.endless?'Endless':'Quick defence'} boss pool: ${esc(poolTxt())}${pool().length?'':' (boss waves bring a heavy raid)'}`;
  return h+`<div class="zcdxbar"><span><b>Enemies</b> ${c.n} of ${c.of} bosses beaten${t?' · '+t:''}</span><button class="sm" id="zcdxb">Enemies ▸</button></div>`};
 Z.base.el.addEventListener('click',e=>{if(e.target.closest?.('#zcdxb'))open()});
 /* the campaign briefing's line (zcampaign.js asks) */
 Z.cdxBrief=id=>{const S0=SET[id];if(!S0)return'';const bt=load().b[S0.boss]?.beaten;
  return`<div class="zcdxbr ${bt?'bt':''}" title="Beat a sector's boss to add it to your codex (Enemies)"><span>Boss event · wave ${S0.wave}</span><b>${bt?esc(name(S0.boss)):'???'}</b>${bt?'<em>in your codex</em>':''}</div>`};
 /* what this run added to the codex, on the sector result and the game-over screen */
 const newTxt=()=>{const L=G.cdx.new;return L.length?`<p class="zhint zcdxnew"><b>Enemies:</b> ${L.map(id=>`<b style="color:${col(id)}">${esc(name(id))}</b>`).join(', ')} added to your codex. It can now come to Quick defence.</p>`:''};
 const co0=Z.cpOver;if(co0)Z.cpOver=()=>{if(G.on)poll();const r=co0();if(r){const b=$('zover')?.querySelector('.btns'),t=newTxt();if(b&&t)b.insertAdjacentHTML('beforebegin',t)}return r};
 const on0=Z.overNote;Z.overNote=()=>{if(G.on)poll();return(on0?.()||'')+newTxt()};

 Z.codex={get c(){return load()},rows,view,pool,plan,all,force:v=>{force=v||null},open,close,note,poll,shot,url,pixels,count,sync,SET,ORDER,SECRET,DEX,
  set(id,field,v){const c=load();if(!ids().includes(id))return false;const e=c.b[id]||(c.b[id]={seen:false,beaten:false,allowed:true});e[field]=v;if(field==='beaten'&&v)e.seen=true;put(c);return true},
  reset(){put(cleanCodex(null))},get opened(){return!ov.hidden},el:ov,info,gate,heavy,soup};
 return Z.codex}
