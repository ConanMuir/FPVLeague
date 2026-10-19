// Zombies game feel: the battlefield reacts. Kills get a hit-stop, a short slow-mo and a kill cam that follows the wreck down; explosions get
// a shockwave, a dust ring on the ground, burning debris; wrecks and impacts leave fires with smoke columns that hang over the field for a
// minute; the front line flickers and rumbles on the horizon; helpers are heard when they fire; the radio calls each raid; the score rises
// with the threat picture; each wave ends with stars. Sound in zaudio.js, DOM in zannounce.js (styles in zfx.css).
// Hooks: zombies.js calls initFX(api,G,Z) once, last. It wraps Z.flash / kill / impact / detonate / continue / step / visuals / hud / key /
// start / stop (each still calls the original first), and adds Z.tsc (time scale) that interceptor.js's loop reads. Classic never gets here.
import {dot,tex} from '../../engine/render.js';
import {KIND,CLUTCH_R} from './zdata.js';
import {initAudio} from './zaudio.js';
import {initAnnounce} from './zannounce.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)},pick=a=>a[Math.random()*a.length|0];
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initFX(api,G,Z){
 const {THREE,scene,TH,gh,S}=api,V3=THREE.Vector3,UP=new V3(0,1,0);
 const _a=new V3(),_b=new V3(),_m=new THREE.Matrix4();
 const root=new THREE.Group();root.visible=false;scene.add(root);  // everything drawn here, hidden outside Zombies so Classic draws nothing extra
 const au=Z.au=initAudio(api),an=Z.an=initAnnounce(api,G,au);
 const SITE_C={x:0,z:1950};
 const live=api.live,cam=()=>api.camera.position;
 const lean=()=>Z.perf?.off?1.7:1;  // the perf governor has had to drop tree shadows: thin the smoke too

 // ---------- time: hit-stop, then slow-mo, then ease back (real time, so it never sticks); the loop runs at Z.tsc ----------
 const TS={s:1,t0:-9,stop:0,hold:0,ease:0,lo:1};
 const rt=()=>performance.now()/1000;
 function slowmo(lo,hold,ease,stop=.06){const t=rt();if(TS.s<1&&lo>TS.lo)return;Object.assign(TS,{t0:t,lo,hold,ease,stop})}
 function tsTick(){const t=rt()-TS.t0;TS.s=t<TS.stop?.04:t<TS.stop+TS.hold?TS.lo:t<TS.stop+TS.hold+TS.ease?TS.lo+(1-TS.lo)*sm((t-TS.stop-TS.hold)/TS.ease):1;au.dilate(TS.s)}
 Object.defineProperty(Z,'tsc',{get:()=>G.on&&!Z.online&&(G.state==='wave'||G.state==='clear')&&!api.menuOpen?TS.s:1,configurable:true});  // co-op: no slow-mo, the host's clock is everyone's

 // ---------- kill cam: after your own burst the dead-cam follows the wreck down and slowly orbits it ----------
 const KC={on:false,t:null,p:new V3(),off:new V3()};
 function killCam(t){const me=api.player;if(!me||me.dead<=0||!api.deadP)return;KC.on=true;KC.t=t;KC.p.copy(t.p);KC.off.subVectors(api.deadC,api.deadP);if(KC.off.lengthSq()<4)KC.off.set(0,8,24);KC.off.multiplyScalar(t.st==="fall"?.85:1.4)}
 function camTick(dt){if(!KC.on)return;const me=api.player;if(!me||me.dead<=0){KC.on=false;return}
  if(KC.t&&KC.t.st==='fall')KC.p.copy(KC.t.p);api.deadP.lerp(KC.p,1-Math.exp(-dt*7));KC.off.applyAxisAngle(UP,dt*.4);
  const c=api.deadC.copy(api.deadP).add(KC.off),g=gh(c.x,c.z)+5;if(c.y<g)c.y=g}

 // ---------- shockwaves: a bright expanding ring in the air (billboard), a dust ring rolling over the ground (flat) ----------
 const SWN=24;
 function swMesh(flat){const geo=new THREE.PlaneGeometry(2,2),at=new THREE.InstancedBufferAttribute(new Float32Array(SWN*2),2);geo.setAttribute('sw',at);
  const mat=new THREE.ShaderMaterial({defines:flat?{FLAT:1}:{},uniforms:{col:{value:flat?new THREE.Color(.36,.31,.25):new THREE.Color(.97,.95,.9)}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
   vertexShader:`attribute vec2 sw;varying vec2 vUv;varying float vA;\n#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vUv=position.xy;vA=sw.y;\n#ifdef FLAT\nvec4 mv=modelViewMatrix*instanceMatrix*vec4(position.x*sw.x,0.,position.y*sw.x,1.);\n#else\nvec4 mv=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mv.xy+=position.xy*sw.x;\n#endif\ngl_Position=projectionMatrix*mv;\n#include <logdepthbuf_vertex>\n}`,
   fragmentShader:`uniform vec3 col;varying vec2 vUv;varying float vA;\n#include <logdepthbuf_pars_fragment>\nvoid main(){\n#include <logdepthbuf_fragment>\nfloat r=length(vUv);if(r>1.)discard;\n#ifdef FLAT\nfloat a=(smoothstep(.45,.9,r)*smoothstep(1.,.9,r)*.9+.25*smoothstep(.95,.3,r))*vA;gl_FragColor=vec4(col,a);\n#else\nfloat e=smoothstep(.8,.96,r)*smoothstep(1.,.96,r);gl_FragColor=vec4(mix(col,col*.38,smoothstep(.95,1.,r)),(e*.62+.05*smoothstep(1.,.4,r))*vA);\n#endif\n}`});
  const m=new THREE.InstancedMesh(geo,mat,SWN);m.count=0;m.frustumCulled=false;m.renderOrder=3;root.add(m);return{m,at,L:[]}}
 const SW=[swMesh(false),swMesh(true)];
 function wave(i,p,R,life,a0){const s=SW[i];if(s.L.length>=SWN)s.L.shift();s.L.push({p:p.clone(),R,life,a0,t:0})}
 function swTick(dt){for(const s of SW){let n=0;for(let i=s.L.length-1;i>=0;i--){const w=s.L[i];if((w.t+=dt)>w.life)s.L.splice(i,1)}
   for(const w of s.L){const u=w.t/w.life;_m.makeTranslation(w.p.x,w.p.y,w.p.z);s.m.setMatrixAt(n,_m);s.at.array[n*2]=w.R*(1-(1-u)**3)+.5;s.at.array[n*2+1]=w.a0*(1-u)*(1-u);n++}
   s.m.count=n;if(n){s.m.instanceMatrix.needsUpdate=true;s.at.needsUpdate=true}}}

 // ---------- glow points (debris embers, fires) sized in pixels so they still read from far away ----------
 const GN=140,gPos=new Float32Array(GN*3),gSa=new Float32Array(GN*2),gC=new Float32Array(GN*3),gGeo=new THREE.BufferGeometry();
 gGeo.setAttribute('position',new THREE.BufferAttribute(gPos,3));gGeo.setAttribute('sa',new THREE.BufferAttribute(gSa,2));gGeo.setAttribute('gc',new THREE.BufferAttribute(gC,3));
 const gPts=new THREE.Points(gGeo,new THREE.ShaderMaterial({uniforms:{map:{value:dot}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec2 sa;attribute vec3 gc;varying float vA;varying vec3 vC;\n#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vA=sa.y;vC=gc;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=sa.x;\n#include <logdepthbuf_vertex>\n}`,
  fragmentShader:`uniform sampler2D map;varying float vA;varying vec3 vC;\n#include <logdepthbuf_pars_fragment>\nvoid main(){\n#include <logdepthbuf_fragment>\nfloat a=texture2D(map,gl_PointCoord).a*vA;gl_FragColor=vec4(vC*a,a);}`}));
 gPts.frustumCulled=false;root.add(gPts);gGeo.setDrawRange(0,0);
 let gn=0;const pxK=()=>innerHeight/(2*Math.tan(api.camera.fov*Math.PI/360));
 function glowPt(p,size,minPx,maxPx,a,r,g,b){if(gn>=GN)return;const d=Math.max(1,p.distanceTo(cam())),i=gn++;gPos[i*3]=p.x;gPos[i*3+1]=p.y;gPos[i*3+2]=p.z;gSa[i*2]=cl(size*pxK()/d,minPx,maxPx);gSa[i*2+1]=a;gC[i*3]=r;gC[i*3+1]=g;gC[i*3+2]=b}

 // ---------- particle systems of our own (Riley's FX / SMK pools stay for his effects) ----------
 const sys=(...a)=>{const s=api.psys(...a);root.add(scene.children[scene.children.length-1]);return s},FLM=sys(500,3.4,THREE.AdditiveBlending,-6,1.4),TRL=sys(700,4.5,THREE.NormalBlending,-.6,.9);

 // ---------- smoke: soft puffs that grow as they rise and thin out, drifting with the wind and fogged like the scene.
 // Two rings: columns over fires (0..SC) and black bursts left in the sky by explosions (SC..SN) ----------
 const SN=2600,SC=2050,sPos=new Float32Array(SN*3).fill(-1e5),sSa=new Float32Array(SN*4),sV=new Float32Array(SN*3),sAge=new Float32Array(SN).fill(-1),sL=new Float32Array(SN),sS0=new Float32Array(SN),sGr=new Float32Array(SN),sA0=new Float32Array(SN),sH0=new Float32Array(SN),sH1=new Float32Array(SN),sRv=new Float32Array(SN),sB=new Float32Array(SN);
 const sGeo=new THREE.BufferGeometry();sGeo.setAttribute('position',new THREE.BufferAttribute(sPos,3));sGeo.setAttribute('sa',new THREE.BufferAttribute(sSa,4));
 const puff=tex(64,64,g=>{for(let i=0;i<7;i++){const x=32+rnd(-9,9),y=32+rnd(-9,9),r=rnd(13,22),gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}});
 const sU=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{map:{value:null},k:{value:500}}]);sU.map.value=puff;
 const sPts=new THREE.Points(sGeo,new THREE.ShaderMaterial({uniforms:sU,fog:true,transparent:true,depthWrite:false,
  vertexShader:`attribute vec4 sa;uniform float k;varying float vA;varying float vS;varying float vR;\n#include <common>\n#include <fog_pars_vertex>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vS=sa.z;vR=sa.w;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;float s=sa.x*k/max(1.,-mvPosition.z);vA=sa.y*(s>420.?420./s:s<3.?s/3.:1.)*smoothstep(6.,30.,-mvPosition.z);gl_PointSize=vA<.008?0.:clamp(s,3.,420.);\n#include <logdepthbuf_vertex>\n#include <fog_vertex>\n}`,
  fragmentShader:`uniform sampler2D map;varying float vA;varying float vS;varying float vR;\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\nvoid main(){\n#include <logdepthbuf_fragment>\nvec2 c=gl_PointCoord-.5;float s=sin(vR),o=cos(vR);c=mat2(o,-s,s,o)*c;float a=texture2D(map,c+.5).a*vA;if(a<.004)discard;gl_FragColor=vec4(vS,vS*.96,vS*.92,a);\n#include <fog_fragment>\n}`}));
 sPts.frustumCulled=false;sPts.renderOrder=2;root.add(sPts);
 const sCur=[0,SC];
 function smoke(ring,p,vx,vy,vz,life,size,grow,a,h0,h1,buoy=.06){const lo=ring?SC:0,hi=ring?SN:SC;let i=sCur[ring];if(i>=hi)i=lo;sCur[ring]=i+1;const i3=i*3;
  sPos[i3]=p.x;sPos[i3+1]=p.y;sPos[i3+2]=p.z;sV[i3]=vx;sV[i3+1]=vy;sV[i3+2]=vz;sAge[i]=0;sL[i]=life;sS0[i]=size;sGr[i]=grow;sA0[i]=a;sH0[i]=h0;sH1[i]=h1;sRv[i]=rnd(-.25,.25);sB[i]=buoy;sSa[i*4+3]=Math.random()*6.28}
 let sOn=0;
 function smokeTick(dt){const w=api.WIND,dm=Math.exp(-dt*.3);let n=0;
  for(let i=0;i<SN;i++){if(sAge[i]<0)continue;const i3=i*3,i4=i*4,age=(sAge[i]+=dt),u=age/sL[i];if(u>=1){sAge[i]=-1;sSa[i4+1]=0;sPos[i3+1]=-1e5;continue}n++;
   sV[i3]=sV[i3]*dm+w.x*(1-dm);sV[i3+1]*=Math.exp(-dt*sB[i]);sV[i3+2]=sV[i3+2]*dm+w.z*(1-dm);sPos[i3]+=sV[i3]*dt;sPos[i3+1]+=sV[i3+1]*dt;sPos[i3+2]+=sV[i3+2]*dt;
   sSa[i4]=sS0[i]+sGr[i]*age;sSa[i4+1]=sA0[i]*Math.min(1,age*(i>=SC?.9:2.5))*(1-u)*(1-u*.4);sSa[i4+2]=sH0[i]+(sH1[i]-sH0[i])*u;sSa[i4+3]+=sRv[i]*dt}
  sOn=n;if(n||sGeo.userData.was){sGeo.attributes.position.needsUpdate=sGeo.attributes.sa.needsUpdate=true}sGeo.userData.was=n;
  const fov=api.camera.fov*Math.PI/180;sU.k.value=api.renderer.domElement.height/(2*Math.tan(fov/2))}
 function smokeClear(){sAge.fill(-1);sPos.fill(-1e5);sSa.fill(0);sGeo.attributes.position.needsUpdate=sGeo.attributes.sa.needsUpdate=true}

 // ---------- burning debris: fragments thrown out of a big burst, trailing smoke, embers until they land ----------
 const DN=70,DB=[];for(let i=0;i<DN;i++)DB.push({on:false,p:new V3(),v:new V3(),life:0,tr:0});let db0=0;
 function debris(p,k,n){for(let i=0;i<n;i++){const d=DB[db0++%DN];d.on=true;d.p.copy(p);d.v.set(rnd(-1,1),rnd(-.15,1),rnd(-1,1)).normalize().multiplyScalar(rnd(9,24)*(1+.15*k));d.life=rnd(1.4,3);d.tr=0}}
 let trB=0;
 function dbTick(dt){for(const d of DB){if(!d.on)continue;if((d.life-=dt)<=0){d.on=false;continue}d.v.y-=9.81*dt;d.v.multiplyScalar(Math.exp(-dt*.5));d.p.addScaledVector(d.v,dt);
   if(d.p.y<gh(d.p.x,d.p.z)){d.on=false;continue}if((d.tr-=dt)<=0&&trB-->0){d.tr=.04;TRL.emit(d.p,0x2b2826,1,.6,1.8,null,1,.55)}
   const f=Math.min(1,d.life*1.5);glowPt(d.p,1.1,1.5,14,f,1.8,.75,.25)}}

 // ---------- fires: wrecks on the ground and impact points burn, then smoulder; the smoke column drifts with the wind ----------
 const FN=16,FI=[];
 function fire(p,k=1,life=38){let f;if(FI.length>=FN){f=FI.reduce((a,b)=>b.age/b.life>a.age/a.life?b:a)}else{f={p:new V3()};FI.push(f)}
  f.p.copy(p);f.p.y=gh(p.x,p.z)+.5;Object.assign(f,{k,life,age:0,sT:0,fT:0,ph:Math.random()*9})}
 function fireTick(dt){const c=cam();for(let i=FI.length-1;i>=0;i--){const f=FI[i];f.age+=dt;const u=f.age/f.life;if(u>=1.5){FI.splice(i,1);continue}
   const d=f.p.distanceTo(c),far=d>3500,fl=u<1?1-u*u:0,sk=u<1?1:1-(u-1)*2;
   if((f.sT-=dt)<=0){const lit=u<1;f.sT=(far?.5:.25)*lean()/Math.max(.35,sk);const s=far?1.5:1;smoke(0,f.p,rnd(-.8,.8),9+5*f.k,rnd(-.8,.8),rnd(16,24)*(.8+.2*f.k),(5+5*f.k)*s,(2+2.2*f.k)*s,lit?.62:.3*sk,lit?.08:.28,lit?.34:.48)}
   if(fl>0&&!far&&(f.fT-=dt)<=0){f.fT=.05;_a.set(0,2,0);FLM.emit(_b.copy(f.p).add(_a.set(rnd(-2,2)*f.k,.5,rnd(-2,2)*f.k)),Math.random()<.5?0xff7a20:0xffb040,2,2.2,.7,null,2.4)}
   if(fl>0){const T=performance.now(),fk=.75+.25*Math.sin(T*.017+f.ph)*Math.sin(T*.011+f.ph*2);glowPt(_b.copy(f.p).setY(f.p.y+2),5*f.k,2.5,40,fl*fk*.9,1.9,.8,.3)}}}

 // ---------- the front: artillery flashing and rumbling on the horizon, AA tracer streams climbing far away ----------
 const TN=240,tPos=new Float32Array(TN*6),tGeo=new THREE.BufferGeometry();tGeo.setAttribute('position',new THREE.BufferAttribute(tPos,3));
 const tLines=new THREE.LineSegments(tGeo,new THREE.LineBasicMaterial({color:new THREE.Color(1,.55,.25).multiplyScalar(4),transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));tLines.frustumCulled=false;root.add(tLines);tGeo.setDrawRange(0,0);
 const TR=[];const FR={art:4,aa:9,salvo:null,aaS:null};
 function edge(R0,R1){const b=Math.random()*6.283,r=rnd(R0,R1),x=SITE_C.x+Math.sin(b)*r,z=SITE_C.z-Math.cos(b)*r;return new V3(x,gh(x,z),z)}
 function frontTick(dt){if(G.state!=='wave'){TR.length=0;return}
  if((FR.art-=dt)<=0){FR.art=rnd(3,9);FR.salvo={p:edge(9000,15000),n:Math.random()<.35?rnd(3,6)|0:1,t:0}}
  const s=FR.salvo;if(s&&(s.t-=dt)<=0){s.t=rnd(.18,.5);_a.copy(s.p).add(_b.set(rnd(-250,250),rnd(0,30),rnd(-250,250)));fl0(_a,rnd(2.5,4));if(Math.random()<.6)au.rumble(rnd(.05,.11),rnd(1,3),rnd(1.8,3));if(--s.n<=0)FR.salvo=null}
  if((FR.aa-=dt)<=0){FR.aa=rnd(7,18);const p=edge(6000,10000),a=Math.random()*6.283;FR.aaS={p,t:rnd(1.5,3),dir:new V3(Math.sin(a)*.5,1,Math.cos(a)*.5),k:0}}
  const q=FR.aaS;if(q){if((q.t-=dt)<=0)FR.aaS=null;else if((q.k-=dt)<=0){q.k=.07;q.dir.x+=rnd(-.05,.05);q.dir.z+=rnd(-.05,.05);if(TR.length<TN)TR.push({p:q.p.clone().setY(q.p.y+3),v:_a.copy(q.dir).normalize().multiplyScalar(rnd(600,760)).clone(),life:rnd(2.4,3.4)})}}
  for(let i=TR.length-1;i>=0;i--){const t=TR[i];t.v.y-=9.81*dt;t.p.addScaledVector(t.v,dt);if((t.life-=dt)<=0)TR.splice(i,1)}
  let k=0;for(const t of TR){const o=k*6;tPos[o]=t.p.x;tPos[o+1]=t.p.y;tPos[o+2]=t.p.z;tPos[o+3]=t.p.x-t.v.x*.03;tPos[o+4]=t.p.y-t.v.y*.03;tPos[o+5]=t.p.z-t.v.z*.03;k++}
  tGeo.setDrawRange(0,k*2);tGeo.attributes.position.needsUpdate=true}

 // ---------- every explosion (Z.flash is called by Riley's boom and by the helpers' bursts) ----------
 const fl0=Z.flash;
 Z.flash=(p,k)=>{fl0(p,k);if(!G.on||api.demo)return;au.boom(p,k);const d=p.distanceTo(cam());
  if(k>=.9&&d<7000)wave(0,p,9*Math.sqrt(k)+3,.32+.06*k,cl(.35+.2*k,.3,1.4));
  if(k>=1.4&&p.y-gh(p.x,p.z)<25&&d<6000)wave(1,_a.copy(p).setY(gh(p.x,p.z)+.6),16*Math.sqrt(k)+8,1.6+.25*k,.7);
  if(k>=1.2&&d<3000)debris(p,k,Math.min(9,Math.round(1+1.7*k)));
  if(k>=.6&&d<9000&&p.y-gh(p.x,p.z)>25){const n=Math.round(Math.min(6,1+k*1.4)/lean());for(let i=0;i<n;i++)smoke(1,_a.copy(p).add(_b.set(rnd(-1,1),rnd(-1,1),rnd(-1,1)).multiplyScalar(1.5*k)),rnd(-1.5,1.5),rnd(0,1.2),rnd(-1.5,1.5),rnd(9,15),2+2*k,1.4+.9*k,.45,.1,.32,.4)}
  if(k>=3&&d<2500)api.shake=Math.max(api.shake,(1-d/2500)*k*.12)};

 // ---------- per-wave record for the summary card ----------
 const W={you:0,help:0,dmg:0,clutch:0,multi:0,boss:0,streak:0,e0:0,st:'off',crit:false};
 const newWave=()=>Object.assign(W,{you:0,help:0,dmg:0,clutch:0,multi:0,boss:0,streak:0,e0:G.earned,crit:false});

 // ---------- kills: grouped per frame (one burst, one airstrike) so a multi-kill is one call ----------
 const KB=[];
 const k0=Z.kill;Z.kill=(t,cat)=>{const c0=G.cash,hb=t.claim;k0(t,cat);if(!G.on||api.demo||G.state==='trial'||!t.paid||t._kf||t.by==='o')return;t._kf=1;KB.push({t,c:G.cash-c0,ply:t.by!=='h',by:HN[hb&&(hb.type||hb.d?.type)]})};
 const HN={rack:'DRONE RACK',flak:'FLAK',gepard:'GEPARD',sam:'SAM',idome:'IRON DOME',gdome:'GOLDEN DOME'};
 let hRad=0;
 function flushKills(){if(!KB.length)return;const P=[],H=[];for(const k of KB)(k.ply?P:H).push(k);KB.length=0;W.you+=P.length;W.help+=H.length;
  const clutchOf=k=>{const K=KIND[k.t.k]||KIND.shahed;return K.dmg>0&&Math.hypot(k.t.aim.x-k.t.p.x,k.t.aim.z-k.t.p.z)<CLUTCH_R};
  const boss=[...P,...H].find(k=>k.t.k==='boss');if(boss){W.boss++;au.bossDown();an.say('MOTHERSHIP DESTROYED',money(boss.c)+(boss.ply?' · your kill':''),'#ff9a3c',3);slowmo(.15,1.1,.9,.08);killCam(boss.t);
   an.radio('OVERLORD',pick(['Mothership is down! Outstanding.','Splash the Mothership! Great work.','The carrier is down. Mop up the swarms.']),2)}
  if(P.length){const n=P.length,cash=P.reduce((a,k)=>a+k.c,0),cs=P.filter(clutchOf).length,me=api.player,dead=me&&me.dead>0;W.clutch+=cs;W.multi=Math.max(W.multi,n);W.streak=Math.max(W.streak,G.streak);
   const lead=P.find(clutchOf)||P[0],K=KIND[lead.t.k]||KIND.shahed;
   if(!boss){const sub=[];if(G.streak>=2)sub.push('STREAK ×'+G.streak);sub.push('+'+money(cash));
    if(n>=2)an.say(['','','DOUBLE KILL','TRIPLE KILL','QUAD KILL'][n]||'MULTI KILL ×'+n,sub.join(' · '),'#ffc640',2);
    else if(cs)an.say('CLUTCH SAVE',`${Math.round(Math.hypot(lead.t.aim.x-lead.t.p.x,lead.t.aim.z-lead.t.p.z))} m from the ${lead.t.tgt.n.toLowerCase()} · ${sub.join(' · ')}`,'#5fe3ff',2);
    else an.say((lead.t.k==='decoy'&&!lead.t.ident?'SHAHED':K.tag)+' DOWN',sub.join(' · '),'#3ddc84',1)}
   au.kill(Math.max(n,Math.min(4,G.streak)),cs>0);
   if(dead&&!boss){slowmo(n>=2?.2:.3,n>=2?.55:.35,.45);killCam(lead.t)}else if(n>=3&&!boss)slowmo(.35,.3,.4,0);
   if(cs&&Math.random()<.6)an.radio('OVERLORD',pick(['That was close. Nice save.','Good kill, right over the target.','Saved it with seconds to spare.']),1)}
  if(H.length&&!boss&&rt()-hRad>14&&Math.random()<.35){hRad=rt();const n=H.length;an.radio(H[0].by||'DEFENCE',n>1?`Splash ${NUM[n]||n}.`:pick(['Splash one.','Target down.','Kill confirmed.']),0)}}
 // multi-kills inside one detonation are already grouped by the frame; directHits and airstrikes come through Z.kill too
 const s0=Z.bossHit;if(s0)Z.bossHit=t=>{const n=t.stages;s0(t);if(G.on&&!api.demo&&t.stages<n&&t.stages>0){an.say('STAGE DOWN',`${t.stages} left`,'#ff9a3c',1);au.rumble(.25,.2,2)}};

 // ---------- impacts on the sites ----------
 const lastHit={};
 const i0=Z.impact;Z.impact=t=>{const s=t.tgt,hp0=s?s.hp:0;i0(t);if(!G.on||api.demo||G.state==='trial'||G.state==='over'&&!s)return;const K=KIND[t.k]||KIND.shahed;
  if(K.dmg)fire(t.aim,K.dmg>100?2:K.dmg>=40?1.4:.6,K.dmg>100?60:K.dmg>=40?45:25);if(!s||!K.dmg||hp0<=0)return;const lost=hp0-s.hp;W.dmg+=lost;
  an.hit(cl(lost/150,.3,1));au.siteHit(lost>100);const d=t.aim.distanceTo(cam());api.shake=Math.max(api.shake,cl(1-d/3000,0,1)*.6);
  const I=integ();if(s.hp<=0)an.radio('OVERLORD',`We've lost the ${s.n.toLowerCase()}!`,2);
  else if(rt()-(lastHit[s.n]||0)>6){lastHit[s.n]=rt();an.radio('OVERLORD',pick([`${cap(s.n.toLowerCase())} is hit!`,`Impact on the ${s.n.toLowerCase()}!`,`${cap(s.n.toLowerCase())} took a hit.`])+` ${Math.round(s.hp)} left.`,1)}
  if(I<.3&&!W.crit&&I>0){W.crit=true;au.alarm();an.radio('OVERLORD','Integrity critical. Hold them off!',2)}};
 const cap=s=>s.replace(/^./,c=>c.toUpperCase());
 const integ=()=>{let h=0,m=0;for(const s of api.SITES){h+=Math.max(0,s.hp);m+=s.max}return m?h/m:1};an.integ=integ;

 // ---------- radio: raid callouts as tracks appear, grouped by direction ----------
 const NAMES={shahed:['Shahed','Shaheds'],decoy:['Shahed','Shaheds'],jet:['Geran-3 jet','Geran-3 jets'],swarm:['FPV quad','FPV quads'],heavy:['armored heavy','armored heavies'],cruise:['cruise missile','cruise missiles'],
  ballistic:['ballistic missile','ballistic missiles'],hyper:['hypersonic glider','hypersonic gliders'],icbm:['ICBM warhead','ICBM warheads'],boss:['Mothership','Motherships']};
 const NUM=['no','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
 const DIRS=['north','north-east','east','south-east','south','south-west','west','north-west'];
 const dirOf=p=>DIRS[((Math.round(Math.atan2(p.x-SITE_C.x,-(p.z-SITE_C.z))/(Math.PI/4))%8)+8)%8];
 const RQ=new Map();
 function seeTracks(){if(G.state!=='wave')return;const t0=rt();for(const t of TH){if(t._seen||!live(t))continue;t._seen=1;if(t.k==='swarm'&&t.grp&&RQ.has('g'+t.grp)){RQ.get('g'+t.grp).n.swarm++;continue}
   const hard=KIND[t.k]?.armor==='hard',key=t.k==='swarm'?'g'+t.grp:(hard?'h':t.k==='boss'?'b':'r')+dirOf(t.p);let g=RQ.get(key);if(!g){g={at:t0,dir:dirOf(t.p),n:{},hard,boss:t.k==='boss',t};RQ.set(key,g)}const k=t.k==='decoy'?'shahed':t.k;g.n[k]=(g.n[k]||0)+1}
  for(const[key,g]of RQ){if(t0-g.at<1.6)continue;RQ.delete(key);const parts=Object.entries(g.n).map(([k,c])=>k==='swarm'?`an FPV swarm of ${c}`:`${c<=12?NUM[c]:c} ${NAMES[k][c>1?1:0]}`);
   const list=parts.length>1?parts.slice(0,-1).join(', ')+' and '+parts[parts.length-1]:parts[0];
   if(g.boss)an.radio('OVERLORD',`Heavy contact from the ${g.dir}: a Mothership. It's carrying swarms.`,2);
   else if(g.hard){const tt=Math.round(g.t.p.distanceTo(g.t.aim)/g.t.spd);an.radio('EARLY WARNING',`Launch detected, bearing ${g.dir}: ${list}. Impact in ${tt} seconds.`,2)}
   else an.radio('OVERLORD',`${cap(list)} inbound from the ${g.dir}.`,key[0]==='g'?0:1)}}

 // ---------- helpers firing: heard, with a muzzle flash on the guns ----------
 function helpersTick(){for(const d of Z.def.D){if(d._fs===d.shots)continue;const first=d._fs===undefined;d._fs=d.shots;if(first)continue;const s=Z.def.SLOTS[d.slot];_a.set(s.x,s.y+3,s.z);
   au.gun(_a,d.type);if(d.type==='gepard')fl0(_a,.25);if(d.type==='sam'||d.type==='idome'){fl0(_a,.6);api.SMK.emit(_a,0xcfcac0,14,10,6,_b.set(0,2,0),1,.6)}}}

 // ---------- near misses: a whoosh when something flies past close ----------
 function nearTick(){const me=api.player;if(!me||me.dead>0)return;const c=cam();for(const t of TH){if(!live(t))continue;const d2=t.p.distanceToSquared(c);if(d2>6400){t._nd=undefined;continue}const d=Math.sqrt(d2);
   if(t._nd!==undefined&&d>t._nd&&t._nd<32&&!t._wh){t._wh=1;const rv=_a.subVectors(t.v,me.v).length();if(rv>25){_b.subVectors(t.p,c).normalize();const side=_b.dot(_a.set(1,0,0).applyQuaternion(api.camera.quaternion));au.whoosh(cl(.35*(1-t._nd/32)+.08,0,.4),side)}}t._nd=d}}

 // ---------- intensity for the score: how many, how close to impact, a boss, a failing defence ----------
 function intensity(){let n=0,tmin=1e9,boss=false;for(const t of TH){if(!live(t))continue;n++;const K=KIND[t.k];if(t.k==='boss')boss=true;if(K&&K.dmg&&!(t.k==='decoy'&&t.ident)){const tt=Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/Math.max(1,t.spd);if(tt<tmin)tmin=tt}}
  return cl(.22+.22*cl(n/14,0,1)+.5*cl((48-tmin)/38,0,1)+(boss?.25:0)+(integ()<.3?.12:0),0,1)}

 // wrecks that fall to the ground keep burning where they land (FPV quads just pop)
 function wrecks(){for(const t of TH){if(t.st==='fall')t._fall=1;else if(t.st==='dead'&&t._fall===1){t._fall=2;if(!t.impacted&&t.k!=='swarm'&&t.p.y-gh(t.p.x,t.p.z)<20)fire(t.p,(KIND[t.k]?.dmg|0)>50?1.2:.9,45)}}}

 // ---------- wrapped hooks ----------
 const c0=Z.continue;Z.continue=()=>{c0();if(!G.on)return;newWave();an.sumHide();RQ.clear();const boss=TH.some(t=>t.k==='boss')||(G.wq||[]).some(q=>q.k==='boss');au.siren(boss);au.sting(boss);FR.art=rnd(2,5);FR.aa=rnd(4,9);
  if(boss)an.say('MOTHERSHIP INBOUND','air raid warning','#ff4d4d',3);an.radio('OVERLORD',boss?`Air raid warning. Wave ${G.wave}: heavy contact, all units stand to.`:pick([`Air raid warning. Wave ${G.wave}, all units stand to.`,`Wave ${G.wave} incoming. Air raid warning is up.`,`Radar has new tracks. Wave ${G.wave}, stand to.`]),1)};
 const st0=Z.step;Z.step=dt=>{st0(dt);trB=Math.min(trB+dt*400,40);seeTracks();helpersTick();wrecks();
  if(G.state!==W.st){const was=W.st;W.st=G.state;if(G.state==='clear'&&was==='wave'){an.summary(G.wave,{...W,perfect:G.perfect,cash:G.earned-W.e0});au.clearChord();an.radio('OVERLORD',pick(['All tracks down. Good work.','Sky is clear. Rearm and stand by.','Raid defeated. Well done.']),1)}
   if(G.state==='over'){au.rumble(.5,0,4);an.radioClear?.()}}};
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);tsTick();flushKills();gn=0;camTick(dt);swTick(dt);dbTick(dt);fireTick(dt);frontTick(dt);nearTick();an.radioTick();
  smokeTick(dt);FLM.upd(dt);TRL.upd(dt);gGeo.setDrawRange(0,gn);gGeo.attributes.position.needsUpdate=gGeo.attributes.sa.needsUpdate=gGeo.attributes.gc.needsUpdate=true;
  au.music(intensity(),G.state==='wave'?'wave':G.state==='clear'?'clear':G.state==='base'?'base':'off',api.menuOpen?0:Math.max(dt,1/120))};
 const h0=Z.hud;Z.hud=dt=>{h0(dt);an.hudTick(dt||1/60)};
 const ky=Z.key;Z.key=e=>{if(e.code==='KeyB'){S.zmus=S.zmus===0?1:0;api.save();api.banner(S.zmus?'MUSIC ON':'MUSIC OFF','',.8);return true}return ky(e)};
 function wipe(){KB.length=0;FI.length=0;smokeClear();FLM.upd(1e3);TRL.upd(1e3);TR.length=0;for(const d of DB)d.on=false;for(const s of SW){s.L.length=0;s.m.count=0}gn=0;gGeo.setDrawRange(0,0);tGeo.setDrawRange(0,0);KC.on=false;TS.s=1;TS.t0=-9;RQ.clear();FR.salvo=FR.aaS=null}
 const z0=Z.start;Z.start=()=>{wipe();z0();an.reset();newWave();W.st=G.state;root.visible=true};
 const z1=Z.stop;Z.stop=()=>{const was=G.on;z1();if(!was)return;wipe();an.reset();au.stopMusic();root.visible=false};
 // harness: what the FX layer is doing right now (tools/zombies-fx.mjs)
 Z.fxState=()=>({tsc:Z.tsc,killCam:KC.on,fires:FI.length,fireAt:FI.map(f=>[f.p.x,f.p.y,f.p.z]),smoke:sOn,debris:DB.filter(d=>d.on).length,waves:SW[0].L.length+SW[1].L.length,tracers:TR.length,glow:gn,music:au.dbg,W:{...W}});
 Z.fxTest={slowmo,fire,debris,wave,killCam};
 // damaged sites (buildings.js damage stages) send their standing smoke through the same columns, so a hit's black plume and the burning site read as one
 Z.plume=(p,k,dark)=>smoke(0,p,rnd(-.6,.6),5+3*k,rnd(-.6,.6),rnd(14,22),3+4*k,1.6+1.8*k,dark?.5:.28,dark?.07:.3,dark?.3:.5);
 return{}}
