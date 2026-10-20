// Zombies re-entry: the late game's big moment. An ICBM warhead coming back into the atmosphere (and, smaller, a ballistic missile in its last
// half minute) is announced so nobody can miss it: an alarm stinger, a rising rumble, a burning plasma streak high in the sky with a long trail
// and a smoke wake, a sky flash, and the banner "RE-ENTRY — FUEL DEPOT — T-23 s" (an arrow at the screen edge when it is out of view).
// The ICBM flies a profile you'd expect: midcourse high above the air, a steep re-entry that burns, and a slower final approach (still about
// 1000 m/s: no pilot catches it, but you see it for a moment). Then the Golden Dome answers: the ground station's uplink fires, a kill vehicle
// drops out of orbit high over you with a bright trail, crosses the sky and meets the warhead head-on: flash, burning debris, a late crack.
// Everything big is drawn on a sky shell inside the camera's far plane (directions kept, sizes in pixels from the true distance), so it reads
// from 100 km away. Trails, glows and debris are pooled and capped; the perf governor thins them.
// Hooks: Z.reMove (zenemy.js fast mover: the ICBM's profile), Z.gdLaunch (zdef.js: where a space interceptor comes out of orbit), Z.reTti
// (time to impact), Z.re (state and event log for tools/zombies-test.mjs). Sounds in zthreatsfx.js (Z.tsfx). All numbers are game values.
import {dot} from '../../engine/render.js';
import {KIND} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a),sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)},lerp=(a,b,u)=>a+(b-a)*u;
const D2R=Math.PI/180;
// ICBM profile: midcourse at VMID to its entry point E (HE above its aim, XE back toward the launch and up to YE off to one side), then a curved
// re-entry: shallow at entry (G0 below the horizon), steepening to G1 for the last dive (so from the defended area the streak climbs across the
// sky instead of sitting on one spot). Speed VE until HD, then it slows to VT at the ground (shape P). BAL_T: a ballistic missile's re-entry
// call comes this many seconds out. KV_H: the Golden Dome aims to meet a warhead around this height.
export const RE={HE:90000,XE:130000,YE:60000,G0:15*D2R,G1:60*D2R,VE:6500,HD:26000,VT:950,P:1.3,VMID:1600,BAL_T:30,KV_H:28000};
export const vAt=h=>h>RE.HD?RE.VE:RE.VT+(RE.VE-RE.VT)*(Math.max(0,h)/RE.HD)**RE.P;
// the nominal path in its own plane (x = distance back from the aim, y = height): a quadratic Bezier E -> C -> aim, C where the two tangents cross
export const C2=(()=>{const c0=Math.cos(RE.G0),s0=Math.sin(RE.G0),c1=Math.cos(RE.G1),s1=Math.sin(RE.G1),L2=(RE.XE*s1-RE.HE*c1)/(c0*s1-s0*c1),L1=(RE.XE-L2*c0)/c1;return[L1*c1,L1*s1]})();
// time to impact along it, tabulated by height (the height falls all the way down)
const NT=400,TH_=new Float32Array(NT+1),TT_=new Float32Array(NT+1);
{const P=u=>{const q=1-u;return[q*q*RE.XE+2*u*q*C2[0],q*q*RE.HE+2*u*q*C2[1]]};let T=0,[x1,y1]=P(1);TH_[NT]=0;TT_[NT]=0;
 for(let i=NT-1;i>=0;i--){const[x0,y0]=P(i/NT);T+=Math.hypot(x0-x1,y0-y1)/vAt((y0+y1)/2);TH_[i]=y0;TT_[i]=T;x1=x0;y1=y0}}
const look=(K,V,x)=>{let a=0,b=NT;if(x>=K[0])return V[0];if(x<=K[NT])return V[NT];while(b-a>1){const m=(a+b)>>1;if(K[m]>x)a=m;else b=m}return V[a]+(V[b]-V[a])*(x-K[a])/(K[b]-K[a]||1)};
export const tOfH=h=>look(TH_,TT_,h),TRE=TT_[0];

export function initReentry(api,G,Z){
 const {THREE,scene,TH,gh}=api,V3=THREE.Vector3,UP=new V3(0,1,0);
 const _a=new V3(),_b=new V3(),_c=new V3(),_s=new V3(),_o=new V3();
 const SITE_C={x:0,z:1950};
 const root=new THREE.Group();root.visible=false;scene.add(root);
 const lean=()=>Z.perf?.off?1:0,cam=()=>api.camera.position;
 let simT=0;const LOG=[],log=e=>{e.at=+simT.toFixed(2);e.w=G.wave;LOG.push(e);if(LOG.length>120)LOG.shift()};

 // ---------- flight ----------
 // E: back toward the launch (the horizontal direction it came from), a seeded distance to one side, HE up. The midcourse is a straight line at VMID,
 // so the time left in it is the height still to lose over the sink rate (a co-op client has the velocity from the host's snapshots, not E)
 const side=t=>(t.id*7919%13/13*.8+.6)*(t.id%2?1:-1);
 function eOf(t,out){const a=t.aim;let dx=t.p.x-a.x,dz=t.p.z-a.z;if(t._db){dx=t._db.x;dz=t._db.z}const L=Math.hypot(dx,dz)||1,ux=dx/L,uz=dz/L,y=t._db?RE.YE*side(t):0;
  return out.set(a.x+ux*RE.XE-uz*y,a.y+RE.HE,a.z+uz*RE.XE+ux*y)}
 const midT=t=>{const h=t.p.y-t.aim.y;if(!(t._ph==='mid'||!t._ph&&h>RE.HE+50))return-1;return t._ph&&!t.net||t.v.y>-1?t.p.distanceTo(eOf(t,_c))/RE.VMID:Math.max(0,h-RE.HE)/-t.v.y};
 // seconds to impact for any fast track (the ICBM by its profile, the others at their constant speed)
 const tti=Z.reTti=t=>{if(t.k==='icbm'){const m=midT(t);return m>=0?m+TRE:tOfH(t.p.y-t.aim.y)}return t.p.distanceTo(t.aim)/Math.max(1,t.v.length()||t.spd)};
 // the re-entry curve of one track: Bezier from where it is now (E) to its aim, C off the nominal plane by half its side step (it swings in: a streak across the sky, not a dot); s = arc length
 function curve(t){const a=t.aim,db=t._db,y=RE.YE*side(t)*.55,bz={E:t.p.clone(),A:a.clone(),C:new V3(a.x+db.x*C2[0]-db.z*y,a.y+C2[1],a.z+db.z*C2[0]+db.x*y),S:new Float32Array(49),L:0};
  if(t._bz){const d=t.p.distanceTo(a);bz.C.copy(t.v).setLength(d*.45).add(t.p)}  /* re-aimed mid-dive (a decoy site): keep the heading, curve onto the new aim */
  let q=bz.E.clone();for(let i=1;i<=48;i++){const p=bez(bz,i/48,_b);bz.S[i]=bz.S[i-1]+p.distanceTo(q);q.copy(p)}bz.L=bz.S[48];t._bz=bz;t._s=0}
 const bez=(bz,u,o)=>{const q=1-u;return o.copy(bz.E).multiplyScalar(q*q).addScaledVector(bz.C,2*u*q).addScaledVector(bz.A,u*u)};
 const uOf=(bz,s)=>{const S=bz.S;if(s<=0)return 0;if(s>=bz.L)return 1;let i=1;while(i<48&&S[i]<s)i++;return(i-1+(s-S[i-1])/Math.max(1e-6,S[i]-S[i-1]))/48};
 Z.reMove=(t,dt)=>{if(t.k!=='icbm'||t.net)return false;const a=t.aim;
  if(!t._ph){t._ph=t.p.y-a.y>RE.HE+1?'mid':'re';let dx=t.p.x-a.x,dz=t.p.z-a.z;const L=Math.hypot(dx,dz)||1;t._db={x:dx/L,z:dz/L};if(t._ph==='re')curve(t)}
  if(t._ph==='mid'){const E=eOf(t,_c),r=_a.subVectors(E,t.p),d=r.length();if(d<=RE.VMID*dt){t.p.copy(E);t._ph='re';curve(t);t.v.subVectors(t._bz.C,t.p).setLength(RE.VE)}else{t.v.copy(r).multiplyScalar(RE.VMID/d);t.p.addScaledVector(t.v,dt)}}
  else{if(t._bz.A.distanceToSquared(a)>1)curve(t);const bz=t._bz,v=vAt(t.p.y-a.y);t._s+=v*dt;
   if(t._s>=bz.L||t.p.y<=gh(t.p.x,t.p.z)+1){t.p.copy(a);Z.impact(t);return true}
   const u=uOf(bz,t._s),q=1-u;bez(bz,u,t.p);t.v.copy(bz.C).sub(bz.E).multiplyScalar(2*q).addScaledVector(_a.subVectors(bz.A,bz.C),2*u).setLength(v)}
  t.spd=Math.max(1,t.p.distanceTo(a)/Math.max(.05,tti(t)));return true};  // t.spd = distance / true time to impact, so every "→ site N s" readout stays right
 // where a track will be tau s from now (a re-entering ICBM along its curve and speed profile; anything else straight on)
 function ahead(t,tau,out){if(t.k!=='icbm'||!t._bz||t._ph!=='re')return out.copy(t.p).addScaledVector(t.v,tau);const bz=t._bz;let s=t._s;
  for(let k=0,n=Math.ceil(tau/.05);k<n;k++){bez(bz,uOf(bz,s),out);s+=vAt(out.y-bz.A.y)*.05}return bez(bz,uOf(bz,s),out)}

 // ---------- Golden Dome: where the kill vehicle comes out of orbit. It meets the warhead about tau s from now (around KV_H on a re-entry), nearly
 // head-on: it drops out of orbit over the defenders (over your interceptor if you're up) and runs out just above the warhead's height, so its trail
 // crosses your sky toward the fireball (a top-down shot would end in a stern chase it loses: the warhead is faster) ----------
 Z.gdLaunch=(t,spd)=>{let tau=5;
  if(t.k==='icbm'&&t._ph==='re'){tau=cl(tti(t)-tOfH(RE.KV_H),3.5,8)}
  const I=ahead(t,tau,_a);
  const me=api.player,from=me&&me.dead<=0&&me.p.distanceTo(I)<90000?me.p:_b.set(SITE_C.x,0,SITE_C.z);
  const hd=_c.set(from.x-I.x,0,from.z-I.z);if(hd.lengthSq()<1)hd.set(0,0,1);hd.normalize().addScaledVector(UP,.25).normalize();
  const p=I.clone().addScaledVector(hd,spd*tau),v=I.clone().sub(p).setLength(spd);log({e:'kv',id:t.id,k:t.k,y:Math.round(p.y),iy:Math.round(I.y),tau:+tau.toFixed(1)});return{p,v}};

 // ---------- drawing on the sky shell ----------
 const RS=30000;  // inside the 40 km far plane
 // a world point on screen: x, y in NDC, front = in front of the camera (view-space depth; NDC z rounds to 1 out there)
 const scr=(p,out)=>{sky(p,out);const cm=api.camera;cm.updateMatrixWorld();const z=_o.copy(out).applyMatrix4(cm.matrixWorldInverse).z;out.project(cm);out.z=z<0?0:2;return out};
 const sky=(p,out)=>{const c=cam(),d=p.distanceTo(c);if(d>RS)out.subVectors(p,c).multiplyScalar(RS/d).add(c);else out.copy(p);return d};
 const pxK=()=>innerHeight/(2*Math.tan(api.camera.fov*Math.PI/360));
 // ribbons: screen-space strips (width in pixels) through a list of points; additive (plasma, kill vehicles, debris, uplink) and normal (smoke)
 const RV=`attribute vec3 oth;attribute float sd;attribute vec2 wa;attribute vec3 col;uniform vec2 res;varying float vS;varying vec3 vC;varying float vA;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){vS=sd;vC=col;vA=wa.y;vec4 a=projectionMatrix*modelViewMatrix*vec4(position,1.);vec4 b=projectionMatrix*modelViewMatrix*vec4(oth,1.);
if(a.w<.5||b.w<.5){vA=0.;a=vec4(0.,0.,2.,1.);}else{vec2 dd=(b.xy/b.w-a.xy/a.w)*res;float L=length(dd);vec2 dr=L>.001?dd/L:vec2(1.,0.);a.xy+=vec2(-dr.y,dr.x)*sd*wa.x/res*a.w;}
gl_Position=a;
#include <logdepthbuf_vertex>
}`,RF=`varying float vS;varying vec3 vC;varying float vA;
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
float e=1.-vS*vS;float a=vA*e*sqrt(e);if(a<.004)discard;gl_FragColor=vec4(vC,a);}`;
 function ribbon(cap,blend){const g=new THREE.BufferGeometry(),A=(n,k)=>{const b=new THREE.BufferAttribute(new Float32Array(cap*2*k),k);b.setUsage(THREE.DynamicDrawUsage);g.setAttribute(n,b);return b.array};
  const R={cap,pos:A('position',3),oth:A('oth',3),sd:A('sd',1),wa:A('wa',2),col:A('col',3),idx:new Uint32Array(cap*6),v:0,i:0};g.setIndex(new THREE.BufferAttribute(R.idx,1));g.setDrawRange(0,0);
  R.m=new THREE.ShaderMaterial({uniforms:{res:{value:new THREE.Vector2(1,1)}},vertexShader:RV,fragmentShader:RF,transparent:true,depthWrite:false,blending:blend,side:THREE.DoubleSide});
  R.mesh=new THREE.Mesh(g,R.m);R.mesh.frustumCulled=false;R.mesh.renderOrder=blend===THREE.AdditiveBlending?5:3;R.g=g;root.add(R.mesh);return R}
 const RA=ribbon(3600,THREE.AdditiveBlending),RN=ribbon(1400,THREE.NormalBlending);
 // one strip: n points in P (sky-shell positions, newest first) with per-point width (px), alpha and colour
 const SP=[];for(let i=0;i<130;i++)SP.push({p:new V3(),w:0,a:0,r:0,g:0,b:0});
 function strip(R,n){if(n<2||R.v+n>R.cap)return;const pr=api.renderer.getPixelRatio();
  for(let j=0;j<n;j++){const q=SP[j],o=j<n-1?SP[j+1].p:_o.copy(q.p).multiplyScalar(2).sub(SP[j-1].p),fl=j<n-1?1:-1;
   for(const s of[-1,1]){const v=R.v++,v3=v*3;R.pos[v3]=q.p.x;R.pos[v3+1]=q.p.y;R.pos[v3+2]=q.p.z;R.oth[v3]=o.x;R.oth[v3+1]=o.y;R.oth[v3+2]=o.z;R.sd[v]=s*fl;R.wa[v*2]=q.w*pr;R.wa[v*2+1]=q.a;R.col[v3]=q.r;R.col[v3+1]=q.g;R.col[v3+2]=q.b}
   if(j<n-1){const b=R.v-2,k=R.i;R.idx[k]=b;R.idx[k+1]=b+1;R.idx[k+2]=b+2;R.idx[k+3]=b+1;R.idx[k+4]=b+3;R.idx[k+5]=b+2;R.i+=6}}}
 function ribbonsEnd(){const sz=api.renderer.getDrawingBufferSize(_b2);for(const R of[RA,RN]){R.m.uniforms.res.value.copy(sz);const g=R.g;g.setDrawRange(0,R.i);for(const k of['position','oth','sd','wa','col'])g.attributes[k].needsUpdate=true;g.index.needsUpdate=true}}
 const _b2=new THREE.Vector2();
 // glows: points sized in pixels from a physical size and the true distance; additive (light) and normal (a coloured body that still reads
 // against a bright day sky, where additive light washes out)
 function points(N,blend,ro){const pos=new Float32Array(N*3),sa=new Float32Array(N*2),gc=new Float32Array(N*3),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('sa',new THREE.BufferAttribute(sa,2));g.setAttribute('gc',new THREE.BufferAttribute(gc,3));
  const m=new THREE.Points(g,new THREE.ShaderMaterial({uniforms:{map:{value:dot}},transparent:true,depthWrite:false,blending:blend,
   vertexShader:`attribute vec2 sa;attribute vec3 gc;varying float vA;varying vec3 vC;\n#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vA=sa.y;vC=gc;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=sa.x;\n#include <logdepthbuf_vertex>\n}`,
   fragmentShader:`uniform sampler2D map;varying float vA;varying vec3 vC;\n#include <logdepthbuf_pars_fragment>\nvoid main(){\n#include <logdepthbuf_fragment>\nfloat a=texture2D(map,gl_PointCoord).a;a=vA*min(1.,a*1.6);if(a<.004)discard;gl_FragColor=vec4(vC,a);}`}));
  m.frustumCulled=false;m.renderOrder=ro;root.add(m);g.setDrawRange(0,0);return{N,pos,sa,gc,g,n:0}}
 const GA=points(96,THREE.AdditiveBlending,6),GB=points(64,THREE.NormalBlending,4);
 function gput(P,p,size,mn,mx,a,r,g,b){if(P.n>=P.N)return;const d=sky(p,_s),i=P.n++,pr=api.renderer.getPixelRatio();P.pos[i*3]=_s.x;P.pos[i*3+1]=_s.y;P.pos[i*3+2]=_s.z;P.sa[i*2]=cl(size*pxK()/Math.max(1,d),mn,mx)*pr;P.sa[i*2+1]=a;P.gc[i*3]=r;P.gc[i*3+1]=g;P.gc[i*3+2]=b}
 const glow=(...a)=>gput(GA,...a),body=(...a)=>gput(GB,...a);
 function pointsEnd(){for(const P of[GA,GB]){P.g.setDrawRange(0,P.n);const A=P.g.attributes;A.position.needsUpdate=A.sa.needsUpdate=A.gc.needsUpdate=true}}

 // ---------- trails: a ring of samples per object; drawn newest first, widening and fading with age, in layers: a coloured body (normal
 // blending: reads on a bright sky) under a hot core (additive: glows, blooms at night). c0 / c1 / c2: colour at the head, the middle, the tail;
 // w0 / w1 = width (m) when new / at the end of its life (the wake spreads); mn / mx = pixel limits ----------
 const L=(R,w0,w1,mn,mx,a,c0,c1,c2)=>({R,w0,w1,mn,mx,a,c0,c1,c2});
 const STY={pl:{cap:120,dt:.08,life:9,L:[L(RN,900,4200,4,90,.92,[2.6,1.5,.5],[1.6,.5,.16],[.42,.36,.33]),L(RA,280,1000,2,30,.9,[3,2.8,2.3],[2.6,1.2,.45],[.9,.25,.1])]},
  pb:{cap:50,dt:.1,life:4.5,L:[L(RN,320,1300,2.6,40,.85,[2.2,1.2,.4],[1.3,.45,.15],[.4,.35,.32]),L(RA,110,380,1.4,16,.8,[2.8,2.2,1.4],[2.2,.8,.3],[.6,.15,.06])]},
  sm:{cap:100,dt:.25,life:24,L:[L(RN,140,2200,2,140,.5,[.62,.6,.58],[.58,.57,.56],[.55,.55,.56])]},
  kv:{cap:70,dt:.05,life:3.5,L:[L(RN,240,1300,3,44,.8,[2.1,2.6,3],[1.3,1.6,1.9],[.8,.82,.86]),L(RA,80,300,1.8,18,1,[2.4,3.2,3.6],[1.1,2.1,3],[.3,.7,1.2])]},
  db:{cap:14,dt:.05,life:.9,L:[L(RN,40,160,1.4,18,.8,[2.2,1.1,.4],[.6,.4,.3],[.3,.28,.27]),L(RA,18,50,1,8,.9,[3,2,1.2],[2,.8,.3],[.6,.2,.1])]}};
 const TRS=[];
 function trail(sty){const S=STY[sty],tr={S,x:new Float32Array(S.cap),y:new Float32Array(S.cap),z:new Float32Array(S.cap),tm:new Float32Array(S.cap),it:new Float32Array(S.cap),n:0,h:0,acc:1e9,head:null};TRS.push(tr);return tr}
 function sample(tr,p,it,dt){tr.acc+=dt;if(tr.acc<tr.S.dt*(1+.6*lean()))return;tr.acc=0;const i=tr.h;tr.x[i]=p.x;tr.y[i]=p.y;tr.z[i]=p.z;tr.tm[i]=simT;tr.it[i]=it;tr.h=(i+1)%tr.S.cap;tr.n=Math.min(tr.S.cap,tr.n+1)}
 const col=(S,u,q)=>{const A=u<.5?S.c0:S.c1,B=u<.5?S.c1:S.c2,k=u<.5?u*2:u*2-1;q.r=lerp(A[0],B[0],k);q.g=lerp(A[1],B[1],k);q.b=lerp(A[2],B[2],k)};
 const TU=new Float32Array(130),TD=new Float32Array(130),TI=new Float32Array(130);
 function drawTrail(tr,hp,hi){const S=tr.S,K=pxK();let n=0;
  const put=(x,y,z,age,it)=>{if(n>=SP.length)return false;TD[n]=sky(_a.set(x,y,z),SP[n].p);TU[n]=cl(age/S.life,0,1);TI[n]=it;n++;return true};
  if(hp)put(hp.x,hp.y,hp.z,0,hi);
  for(let j=0;j<tr.n;j++){const i=(tr.h-1-j+S.cap)%S.cap,age=simT-tr.tm[i];if(age>S.life)break;if(!put(tr.x[i],tr.y[i],tr.z[i],age,tr.it[i]))break}
  for(const Y of S.L){for(let j=0;j<n;j++){const q=SP[j],u=TU[j];q.w=cl(lerp(Y.w0,Y.w1,Math.sqrt(u))*K/Math.max(1,TD[j]),Y.mn,Y.mx);q.a=Y.a*TI[j]*(1-u)*(1-u*.6);col(Y,u,q)}strip(Y.R,n)}
  return n}
 const alive=tr=>tr.head||tr.n&&simT-tr.tm[(tr.h-1+tr.S.cap)%tr.S.cap]<tr.S.life;

 // ---------- the screen: sky flash, banner, edge arrow ----------
 const hud=document.getElementById('hud'),fl=document.createElement('div');fl.id='zreflash';hud.append(fl);
 const ban=document.createElement('div');ban.id='zre';ban.className='osd';hud.append(ban);let banH='';
 const FL={s:0,x:50,y:20,c:'255,236,214'};
 function skyFlash(p,s,c='255,236,214'){if(s<=FL.s*.6)return;FL.s=Math.max(FL.s,s);FL.c=c;const v=scr(p,_a),on=v.z<1;FL.x=on?cl((v.x*.5+.5)*100,-10,110):50;FL.y=on?cl((-v.y*.5+.5)*100,-10,90):-5}
 function flashTick(rdt){FL.s*=Math.exp(-rdt*3.2);if(FL.s<.01){if(fl.style.opacity!=='0')fl.style.opacity='0';return}
  fl.style.background=`radial-gradient(ellipse 90% 75% at ${FL.x.toFixed(1)}% ${FL.y.toFixed(1)}%,rgba(${FL.c},.95) 0,rgba(${FL.c},.38) 30%,rgba(${FL.c},.08) 62%,rgba(${FL.c},0) 85%)`;fl.style.opacity=FL.s.toFixed(3)}

 // ---------- state ----------
 const W=new Set(),KV=[],DB=[];let alarmT=-9,radT=-9;
 const isFast=t=>t.k==='icbm'||t.k==='ballistic'||t.k==='hyper';
 const seen=t=>!Z.seen||Z.seen(t);  // with the kill chain's early warning, a track nobody has picked up yet shows no site / time
 const siteN=t=>seen(t)?(t.tgt?.n||'—'):'TRACKING…';
 const plasma=t=>t.k==='icbm'?sm((RE.HE-(t.p.y-t.aim.y))/16000)*sm((t.v.length()-1500)/2500):t._re?.55:.32;
 const rdt=()=>{const n=performance.now()/1000,d=n-(rdt.t||n);rdt.t=n;return cl(d,0,.1)};
 function start(t){const big=t.k==='icbm',T=Math.ceil(tti(t)),K=KIND[t.k],site=siteN(t);t._re={t0:simT,big};
  log({e:'reentry',id:t.id,k:t.k,T,site,h:Math.round(t.p.y-t.aim.y),v:Math.round(t.v.length())});
  if(simT-alarmT>2.4){alarmT=simT;Z.tsfx?.alarm(big)}
  skyFlash(t.p,big?.8:.28,big?'255,232,205':'255,214,170');
  api.feed(`<span class="${big?'cr':'co'}">RE-ENTRY — ${K.tag} — ${site} — T-${seen(t)?T+' s':'?'}</span>`);
  if(big){Z.an?.say('RE-ENTRY',`${K.n.toUpperCase()} → ${site}${seen(t)?` · T-${T} s`:''}`,'#ff4d4d',3);
   if(simT-radT>8){radT=simT;Z.an?.radio('EARLY WARNING',seen(t)?`Re-entry, re-entry! Warhead coming down on the ${site.toLowerCase()}, ${T} seconds.`:'Re-entry flash! Warhead coming down, tracking it now.',2)}}}
 function intercept(t){const big=t.k==='icbm',p=t.p.clone(),h=p.y-gh(p.x,p.z),kv=KV.find(k=>k.h&&k.h.p.distanceTo(p)<3000||k.end&&simT-k.end<.3&&k.lp.distanceTo(p)<3000);
  log({e:'intercept',id:t.id,k:t.k,h:Math.round(h),by:kv?'gdome':t.by||'?'});
  FX.push({p,t:0,life:big?.9:.6,big},{p:p.clone(),t:0,life:big?6:4,big,puff:1});skyFlash(p,big?.6:.32,'214,240,255');
  const n=Math.round((big?16:9)/(1+lean()));for(let i=0;i<n;i++){let d=DB.find(x=>!x.on);if(!d){if(DB.length>=48)break;d={p:new V3(),v:new V3(),tr:trail('db'),on:false};DB.push(d)}
   d.on=true;d.p.copy(p);d.v.copy(t.v).multiplyScalar(rnd(.15,.4)).add(_a.set(rnd(-1,1),rnd(-.6,1),rnd(-1,1)).normalize().multiplyScalar(rnd(250,900)*(big?1:.6)));d.life=rnd(1.8,4.5);d.l0=d.life;d.tr.n=0;d.tr.head=d.p}
  Z.tsfx?.intercept(p,big);
  if(kv)Z.an?.say('INTERCEPT',`Golden Dome · ${KIND[t.k].tag} destroyed at ${Math.round(h/1000)} km`,'#5fe3ff',2);
  if(t.st==='fall'&&h>3000)t.st='dead'}  // the warhead comes apart up there: no ten-minute fall of a wreck from the stratosphere
 const FX=[];
 // the dish of the Golden Dome that fired (a co-op client has no shooter: the first one)
 const dishOf=h=>{const D=Z.def,d=h.d&&h.d.type==='gdome'?h.d:D.D.find(x=>x.type==='gdome');const s=d&&D.SLOTS[d.slot];return s?new V3(s.x,s.y+6.4,s.z):null};

 // ---------- per frame ----------
 function tick(dt){simT+=dt;GA.n=GB.n=0;RA.v=RA.i=0;RN.v=RN.i=0;const live=api.live;
  // fast tracks: re-entry starts, trails, intercepts
  for(const t of TH)if(isFast(t)&&live(t)&&!W.has(t)&&t.st!=='dead'){W.add(t);t._rp=trail(t.k==='icbm'?'pl':'pb');t._rp.head=t.p;if(t.k!=='hyper'){t._rk=trail('sm');t._rk.head=t.p}}
  let rum=0,urg=null,ut=1e9;
  for(const t of W){
   if(!live(t)){W.delete(t);if(t._rp)t._rp.head=null;if(t._rk)t._rk.head=null;if(!t.impacted&&t.p.y-gh(t.p.x,t.p.z)>1500)intercept(t);continue}
   if(t.k!=='hyper'&&!t._re&&(t.k==='icbm'?t.p.y-t.aim.y<RE.HE-200:tti(t)<=RE.BAL_T))start(t);
   const pl=plasma(t),h=t.p.y-t.aim.y;sample(t._rp,t.p,pl,dt);if(t._rk&&t._re)sample(t._rk,t.p,t.k==='icbm'?cl(.35+.65*(1-h/RE.HE),0,1):.6,dt);
   if(t._re){const T=tti(t);if(T<ut){ut=T;urg=t}rum=Math.max(rum,t.k==='icbm'?(1-T/TRE)**1.2*(.45+.55*cl(1-t.p.distanceTo(cam())/90000,0,1)):.35*cl(1-T/RE.BAL_T,0,1))}}
  if(Z.tsfx)Z.tsfx.rumble=rum;
  // heads
  const fk=.9+.1*Math.sin(simT*37)*Math.sin(simT*23);
  for(const t of W){const pl=plasma(t);
   if(t.k==='icbm'){body(t.p,1000*(.45+pl),8+8*pl,90,.95,lerp(.55,2.7,pl),lerp(.16,1.7,pl),lerp(.08,.6,pl));glow(t.p,400*(.35+pl),5+6*pl,50,(.3+.7*pl)*fk,lerp(1.2,3.2,pl),lerp(.35,2.8,pl),lerp(.1,2.2,pl));if(pl>.25){glow(t.p,4200*pl,16,260,.32*pl*fk,2,1.15,.55);body(t.p,3000*pl,12,200,.22*pl,1.8,1.3,.9)}}
   else{body(t.p,t.k==='hyper'?420:360,6,32,.9,2.3,1.25,.45);glow(t.p,t.k==='hyper'?260:220,4,24,.8*fk,2.6,1.6,.7)}}
  // Golden Dome kill vehicles: new ones (deorbit flash, uplink beam from the dish), then trail and head; a gone one leaves its trail to fade
  for(const h of Z.def?.shots||[])if(h.kind==='space'&&!h._kv){const k={h,tr:trail('kv'),st:simT,lp:h.p.clone(),dish:dishOf(h),end:0};h._kv=k;k.tr.head=h.p;KV.push(k);
   for(let j=8;j>=1;j--){const u=j/8;_a.copy(h.p).addScaledVector(_b.copy(h.v).normalize(),-1600*u*u).add(_c.set(0,24000*u,0));const i=k.tr.h;k.tr.x[i]=_a.x;k.tr.y[i]=_a.y;k.tr.z[i]=_a.z;k.tr.tm[i]=simT-.32*j;k.tr.it[i]=1;k.tr.h=(i+1)%k.tr.S.cap;k.tr.n++}k.tr.acc=0;  /* the drop out of orbit, drawn as the start of its trail */FX.push({p:h.p.clone(),t:0,life:.45,kv:1});if(k.dish)Z.tsfx?.uplink(k.dish);log({e:'kvVis',y:Math.round(h.p.y),tgt:h.tgt?.id})}
  for(let i=KV.length-1;i>=0;i--){const k=KV[i];if(k.h&&!(Z.def?.shots||[]).includes(k.h)){k.h=null;k.end=simT;k.tr.head=null}
   if(k.h){k.lp.copy(k.h.p);sample(k.tr,k.h.p,1,dt);body(k.h.p,300,6,28,.9,2.2,2.7,3.1);glow(k.h.p,180,5,30,fk,2.4,3,3.4)}
   if(k.dish&&simT-k.st<1.2){const u=(simT-k.st)/1.2,a=(1-u)*(1-u);SP[0].p.copy(k.dish);SP[0].w=3;SP[0].a=a;SP[0].r=.6;SP[0].g=2;SP[0].b=2.6;sky(_c.copy(k.h?k.h.p:k.lp),SP[1].p);SP[1].w=2;SP[1].a=a*.7;SP[1].r=.4;SP[1].g=1.4;SP[1].b=2.4;strip(RA,2);glow(k.dish,6,4,14,a,1,2.4,3)}
   if(!k.h&&!alive(k.tr)&&simT-k.st>1.3){KV.splice(i,1);TRS.splice(TRS.indexOf(k.tr),1)}}
  // flashes (intercepts, deorbit burns) and debris burning out
  for(let i=FX.length-1;i>=0;i--){const f=FX[i];if((f.t+=dt)>f.life){FX.splice(i,1);continue}const u=f.t/f.life,a=(1-u)*(1-u);
   if(f.puff){body(f.p,lerp(900,f.big?5200:3000,Math.sqrt(u)),10,300,.55*(1-u)*Math.min(1,f.t*4),.3,.28,.27);continue}
   if(f.kv)glow(f.p,900*(.5+u),8,60,a*1.4,1.6,2.4,3);else{body(f.p,lerp(600,f.big?3400:2000,Math.sqrt(u)),16,240,a*.95,3,2.9,2.6);glow(f.p,lerp(700,f.big?4600:2600,Math.sqrt(u)),22,f.big?320:200,a*1.6,lerp(4,1.2,u),lerp(4,2.2,u),lerp(4,3.2,u));glow(f.p,300,10,40,a*2,4,3.6,3)}}
  for(const d of DB){if(!d.on)continue;if((d.life-=dt)<=0||d.p.y<gh(d.p.x,d.p.z)){d.on=false;d.tr.head=null;continue}d.v.y-=9.81*dt;d.v.multiplyScalar(Math.exp(-dt*.7));d.p.addScaledVector(d.v,dt);
   const b=d.life/d.l0;sample(d.tr,d.p,b,dt);body(d.p,120*b,2,10,b*.9,2.2,1,.35);glow(d.p,90*b,1.5,12,b,2.6,1.4,.6)}
  // draw every trail that still shows (smoke first, the plasma over it)
  let ns=0;for(let i=TRS.length-1;i>=0;i--){const tr=TRS[i];if(!alive(tr)){if(!tr.head&&tr.S!==STY.db&&tr.S!==STY.kv)TRS.splice(i,1);continue}ns+=drawTrail(tr,tr.head,tr.head?tr.it[(tr.h-1+tr.S.cap)%tr.S.cap]||1:0)}
  ribbonsEnd();pointsEnd();
  ST.samples=ns;ST.urg=urg;ST.ut=ut}
 const ST={samples:0,urg:null,ut:0};
 // banner: the most urgent re-entry (and how many more), with the Golden Dome's answer underneath
 function banner(){const L=[...W].filter(t=>t._re&&api.live(t)).sort((a,b)=>tti(a)-tti(b));let h='';
  if(L.length&&G.state==='wave'){const t=L[0],T=Math.ceil(tti(t)),kv=KV.find(k=>k.h&&k.h.tgt===t),cls=t._re.big?'':' b';
   h=`<div class="l${cls}"><b>RE-ENTRY</b> — ${siteN(t)} — T-${seen(t)?T+' s':'?'}${L.length>1?` <i>+${L.length-1}</i>`:''}</div>`;
   if(kv){const eta=Math.max(0,Math.ceil(kv.h.p.distanceTo(t.p)/(kv.h.v.length()+t.v.length())));h+=`<div class="s">GOLDEN DOME KV AWAY · intercept in ${eta} s</div>`}
   else if(t.claim&&/dome/.test(t.claim.d?.type||t.claim.type||''))h+=`<div class="s">IRON DOME ENGAGING</div>`}
  const last=LOG.findLast?.(e=>e.e==='intercept');if(!h&&last&&simT-last.at<2.5&&G.state==='wave')h=`<div class="s ok">INTERCEPTED ✓ ${KIND[last.k]?.tag||''} at ${Math.round(last.h/1000)} km</div>`;
  if(h!==banH){ban.innerHTML=banH=h}}
 // a marker on the warhead (or an arrow at the screen edge pointing at it) with the countdown
 function overlay(oc){const t=ST.urg;if(!t||!api.live(t)||Z.cine)return;const W2=innerWidth,H=innerHeight,v=scr(t.p,_a),T=Math.ceil(tti(t)),c=t._re.big?'#ff4d4d':'#ffb347';
  oc.save();oc.font='700 13px "JetBrains Mono",monospace';oc.textAlign='center';oc.shadowColor='#000';oc.shadowBlur=4;oc.strokeStyle=oc.fillStyle=c;oc.lineWidth=2;
  const lab=`RE-ENTRY${seen(t)?' T-'+T:''}`;
  if(v.z<1&&Math.abs(v.x)<.97&&Math.abs(v.y)<.95){const X=(v.x*.5+.5)*W2,Y=(-v.y*.5+.5)*H,r=16+4*Math.sin(simT*9);oc.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;oc.moveTo(X+Math.cos(a)*r,Y+Math.sin(a)*r);oc.lineTo(X+Math.cos(a)*(r+9),Y+Math.sin(a)*(r+9))}oc.stroke();oc.fillText(lab,X,Y-r-14)}
  else{let x=v.x,y=v.y;if(v.z>1){x=-x;y=-y}const a=Math.atan2(-y,x),m=Math.max(Math.abs(Math.cos(a))/(.5-40/W2),Math.abs(Math.sin(a))/(.5-50/H)),X=W2/2+Math.cos(a)/m*W2,Y=H/2+Math.sin(a)/m*H;
   oc.translate(X,Y);oc.rotate(a);oc.beginPath();oc.moveTo(14,0);oc.lineTo(-8,-10);oc.lineTo(-8,10);oc.closePath();oc.globalAlpha=.6+.4*Math.sin(simT*8);oc.fill();oc.rotate(-a);oc.globalAlpha=1;oc.fillText(lab,-Math.cos(a)*30,-Math.sin(a)*30+4)}
  oc.restore()}

 // ---------- hooks ----------
 function wipe(){W.clear();KV.length=0;DB.length=0;FX.length=0;TRS.length=0;FL.s=0;fl.style.opacity='0';ban.innerHTML=banH='';GA.g.setDrawRange(0,0);GB.g.setDrawRange(0,0);RA.g.setDrawRange(0,0);RN.g.setDrawRange(0,0);if(Z.tsfx)Z.tsfx.rumble=0}
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);if(!G.on)return;root.visible=true;tick(Math.max(0,dt));flashTick(rdt())};
 const h0=Z.hud;Z.hud=dt=>{h0(dt);if(G.on)banner()};
 const o0=Z.overlay;Z.overlay=oc=>{o0(oc);if(G.on)overlay(oc)};
 const s0=Z.start;Z.start=()=>{wipe();s0();root.visible=true};
 const s1=Z.stop;Z.stop=()=>{s1();wipe();root.visible=false};
 Z.re={RE,TRE,vAt,tOfH,log:LOG,
  state:()=>({active:[...W].filter(t=>t._re&&api.live(t)).map(t=>({id:t.id,k:t.k,T:+tti(t).toFixed(1),h:Math.round(t.p.y-t.aim.y),v:Math.round(t.v.length()),site:siteN(t)})),
   kv:KV.filter(k=>k.h).length,kvTrails:KV.length,debris:DB.filter(d=>d.on).length,trails:TRS.length,samples:ST.samples,glow:GA.n+GB.n,ribbon:[RA.i/6,RN.i/6],flash:+FL.s.toFixed(2),banner:ban.textContent,rumble:Z.tsfx?.rumble??0}),
  // where a world point lands on the sky shell, in screen space (tests: is the kill vehicle in view?)
  screen:p=>{const v=scr(p,_a.clone());return{x:+v.x.toFixed(3),y:+v.y.toFixed(3),front:v.z<1}}};
 return Z.re}
