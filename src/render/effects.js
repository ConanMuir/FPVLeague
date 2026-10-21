// ---------- gameplay effects: code-built, pooled, no per-frame allocation ----------
// - boost: a flame jet under every motor (one draw call per quad) + a ribbon trail + embers; motor-wash glow under the props at high throttle
// - prop wash: dust kicked off the ground / walls under a low quad (thrust axis traced against the SDF), tinted per map
// - ground scrapes: sparks + fading scuff decals where the frame skids or tumbles (the 'ground' event, core/events.js)
// - ball: a speed-based ribbon trail, and a flash + sparks on hard hits (no ring: rings only mark pops) (the 'touch' event, with p and n from modes/step.js)
// Everything scales with the graphics quality (renderer.js qId). Trail colour: d.trailCol (THREE.Color from the Trail cosmetic, render/cos-mat.js, or 0xRRGGBB), else the team colour,
// fading to d.trailCol2 down the ribbon; d.trailStyle picks the ribbon's look and the boost embers (RSTY), d.trailCols the rainbow.
import * as THREE from 'three';
import {COL,V3,cl} from '../config/constants.js';
import {BR,DRAD,G} from '../config/tune.js';
import {ball} from '../physics/ball.js';
import {onEv,onFx} from '../core/events.js';
import {sdN,sdf} from '../physics/sdf.js';
import {GS} from '../state.js';
import {mapId} from '../world/maps.js';
import {ballLight,ballMesh} from './ball.js';
import {PARTS_SCALE} from './drone-mesh.js';
import {camera,qId,scene} from './renderer.js';

const QK={high:{k:1,dec:96,dl:7},med:{k:.6,dec:56,dl:5},low:{k:.3,dec:24,dl:3}};let QQ=QK.high,T=0;  // T: effects clock (s), stops while paused
const rnd=Math.random,_a=new V3(),_b=new V3(),_c=new V3(),_d=new V3(),_e=new V3(),_n=new V3(),_t1=new V3(),_t2=new V3(),_col=new THREE.Color(),_col2=new THREE.Color(),Z=new V3(0,0,1);
const fogU=()=>THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
const FOGF=add=>`#ifdef USE_FOG
 {float ff=smoothstep(fogNear,fogFar,vFogDepth);${add?'a*=1.-ff;':'col=mix(col,fogColor,ff);'}}
#endif`;

// ---------- particles: instanced camera-facing quads (billboards, or streaks stretched along their velocity) ----------
const PV=`attribute vec3 iP;attribute vec3 iV;attribute vec4 iC;attribute vec2 iS;attribute vec4 iN;uniform float uK;varying vec4 vC;varying vec2 vUv;varying float vSh;varying vec4 vPl;varying vec3 vVP;
#include <fog_pars_vertex>
void main(){vec2 c=position.xy;vec4 mvPosition=modelViewMatrix*vec4(iP,1.);float nf=smoothstep(.8,4.,-mvPosition.z);  // fade out right in front of the camera (FPV)
#ifdef STREAK
 vec4 tl=modelViewMatrix*vec4(iP-iV*uK,1.);vec2 sd=mvPosition.xy/max(-mvPosition.z,.05)-tl.xy/max(-tl.z,.05);float l=length(sd);sd=l>1e-6?sd/l:vec2(1.,0.);
 mvPosition=mix(tl,mvPosition,c.x*.5+.5);mvPosition.xy+=vec2(-sd.y,sd.x)*c.y*iS.x+sd*c.x*iS.x;
#else
 float s=sin(iS.y*7.),k=cos(iS.y*7.);mvPosition.xy+=mat2(k,s,-s,k)*c*iS.x;
#endif
 vC=vec4(iC.rgb,iC.a*nf);vUv=c;vSh=iS.y;vVP=mvPosition.xyz;gl_Position=projectionMatrix*mvPosition;
 vPl=vec4(0.,0.,0.,1e4);if(dot(iN.xyz,iN.xyz)>.25){vec3 nv=normalize((viewMatrix*vec4(iN.xyz,0.)).xyz),p0=(viewMatrix*vec4(iN.xyz*iN.w,1.)).xyz;vPl=vec4(nv,dot(vVP-p0,nv)/(.35*iS.x+.2));}  // the surface it came off: height over it, in fade widths
#include <fog_vertex>
}`;
const PF=add=>`varying vec4 vC;varying vec2 vUv;varying float vSh;varying vec4 vPl;varying vec3 vVP;
#include <fog_pars_fragment>
void main(){float r2=dot(vUv,vUv);
#ifdef STREAK
 float a=(1.-smoothstep(0.,1.,abs(vUv.y)))*smoothstep(-1.,-.2,vUv.x)*(1.-smoothstep(.8,1.,vUv.x));
#else
 float a;if(vSh<.5){float an=atan(vUv.y,vUv.x),q=max(0.,1.-r2*(1.+.14*sin(an*3.+vSh*40.)+.07*sin(an*5.-vSh*25.)));a=q*q*(.55+.45*q);}  // puff: soft round, a slightly billowy edge
 else a=(1.-smoothstep(.35,1.,r2))*(vSh>1.5?1.-smoothstep(.15,.5,abs(vUv.y)):1.);
#endif
 if(vPl.w<1e3)a*=smoothstep(0.,1.,vPl.w/max(-dot(normalize(vVP),vPl.xyz),.08));  // soft against the surface it came off (depth behind it along the view ray), so where the quad cuts into the ground it shows no hard edge
 a*=vC.a;if(a<.004)discard;vec3 col=vC.rgb;
${FOGF(add)}
 gl_FragColor=vec4(col,a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const QV=new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),QI=[0,1,2,0,2,3];
const upd=(a,n)=>{a.clearUpdateRanges();a.addUpdateRange(0,n);a.needsUpdate=true};
class Pool{
 constructor(n,add,streak,ro){this.n=n;this.h=0;this.act=0;this.add=add;const F=k=>new Float32Array(n*k);
  Object.assign(this,{p:F(3),v:F(3),c:F(3),a:F(1),life:F(1),age:F(1),s0:F(1),s1:F(1),dr:F(1),gr:F(1),sh:F(1),bo:F(1),pl:F(4)});
  const g=this.g=new THREE.InstancedBufferGeometry();g.setIndex(QI);g.setAttribute('position',new THREE.BufferAttribute(QV,3));
  const at=(nm,k)=>{const a=new THREE.InstancedBufferAttribute(F(k),k);a.setUsage(THREE.DynamicDrawUsage);g.setAttribute(nm,a);return a};
  this.iP=at('iP',3);this.iV=at('iV',3);this.iC=at('iC',4);this.iS=at('iS',2);this.iN=at('iN',4);g.instanceCount=0;
  const m=this.mat=new THREE.ShaderMaterial({uniforms:{...fogU(),uK:{value:.03}},defines:streak?{STREAK:''}:{},vertexShader:PV,fragmentShader:PF(add),
   transparent:true,depthWrite:false,fog:true,toneMapped:!add,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
  this.m=new THREE.Mesh(g,m);this.m.frustumCulled=false;this.m.renderOrder=ro;scene.add(this.m)}
 // position, velocity, colour (linear, >1 blooms on additive pools), alpha, life (s), size start/end (half width, m), drag (1/s), gravity (m/s²), shape (0 puff, 1 chip, 2 blade; rotation for billboards), floor bounce
 spawn(px,py,pz,vx,vy,vz,r,g,b,a,life,s0,s1,dr,gr,sh,bo){const i=this.h;this.h=(i+1)%this.n;if(this.life[i]<=0)this.act++;const i3=i*3,P=this.p,V=this.v,C=this.c;
  P[i3]=px;P[i3+1]=py;P[i3+2]=pz;V[i3]=vx;V[i3+1]=vy;V[i3+2]=vz;C[i3]=r;C[i3+1]=g;C[i3+2]=b;this.a[i]=a;this.life[i]=life;this.age[i]=0;this.s0[i]=s0;this.s1[i]=s1;this.dr[i]=dr;this.gr[i]=gr;this.sh[i]=sh;this.bo[i]=bo;this.pl.fill(0,i*4,i*4+4);this.last=i}
 // the surface (unit normal n, through point p) the last spawned particle fades into instead of cutting
 plane(n,p){const i=this.last*4;this.pl[i]=n.x;this.pl[i+1]=n.y;this.pl[i+2]=n.z;this.pl[i+3]=n.dot(p)}
 update(dt,floor){const g=this.g;if(!this.act){g.instanceCount=0;return}let k=0;const IP=this.iP.array,IV=this.iV.array,IC=this.iC.array,IS=this.iS.array,P=this.p,V=this.v,C=this.c,add=this.add;
  const IN=this.iN.array,PL=this.pl;for(let i=0;i<this.n;i++){const L=this.life[i];if(L<=0)continue;const ag=this.age[i]+=dt;if(ag>=L){this.life[i]=0;this.act--;continue}
   const i3=i*3,f=Math.exp(-this.dr[i]*dt);V[i3]*=f;V[i3+1]=V[i3+1]*f-this.gr[i]*dt;V[i3+2]*=f;P[i3]+=V[i3]*dt;P[i3+1]+=V[i3+1]*dt;P[i3+2]+=V[i3+2]*dt;
   if(floor&&this.bo[i]>0&&P[i3+1]<.04&&V[i3+1]<0){P[i3+1]=.04;V[i3+1]*=-this.bo[i];V[i3]*=.55;V[i3+2]*=.55}  // League maps: the floor is y = 0
   const u=1-ag/L,al=this.a[i]*(add?u*u:Math.min(1,ag/.07)*u*Math.sqrt(u)),k3=k*3,k4=k*4;
   IP[k3]=P[i3];IP[k3+1]=P[i3+1];IP[k3+2]=P[i3+2];IV[k3]=V[i3];IV[k3+1]=V[i3+1];IV[k3+2]=V[i3+2];IC[k4]=C[i3];IC[k4+1]=C[i3+1];IC[k4+2]=C[i3+2];IC[k4+3]=al;
   IS[k*2]=this.s0[i]+(this.s1[i]-this.s0[i])*(1-u*u);IS[k*2+1]=this.sh[i];IN[k4]=PL[i*4];IN[k4+1]=PL[i*4+1];IN[k4+2]=PL[i*4+2];IN[k4+3]=PL[i*4+3];k++}
  g.instanceCount=k;if(k){upd(this.iP,k*3);upd(this.iV,k*3);upd(this.iC,k*4);upd(this.iS,k*2);upd(this.iN,k*4)}}}
const ADD=new Pool(1400,true,false,4),SPK=new Pool(700,true,true,4),DUST=new Pool(1600,false,false,3);

// ---------- ribbon trails (boost, ball): a camera-facing strip through the recent positions, additive, soft edges, hot core ----------
// styles (the Trail cosmetic's d.trailStyle, render/cos-mat.js): 0 stream, 1 fire, 2 plasma, 3 sparks, 4 sparkle, 5 smoke, 6 rainbow (uR: the 7 colours head to tail)
// colour runs uCol (head) to uCol2 (tail); vU: 0 at the head .. 1 at the end of its life
const RSTY={stream:0,fire:1,plasma:2,sparks:3,sparkle:4,smoke:5,rainbow:6};
const RV=`attribute float aA;attribute float aS;attribute float aU;varying float vA;varying float vS;varying float vU;
#include <fog_pars_vertex>
void main(){vA=aA;vS=aS;vU=aU;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const RFS=`uniform vec3 uCol;uniform vec3 uCol2;uniform vec3 uHot;uniform vec3 uR[7];uniform float uSt;uniform float uT;varying float vA;varying float vS;varying float vU;
#include <fog_pars_fragment>
float h1(float x){return fract(sin(x*127.1)*43758.5453);}
float n1(float x){float i=floor(x),f=fract(x);return mix(h1(i),h1(i+1.),f*f*(3.-2.*f));}
void main(){float e=1.-abs(vS),a=vA*smoothstep(0.,.8,e),hot=pow(max(e,0.),6.)*smoothstep(.35,.9,vA);vec3 base=mix(uCol,uCol2,smoothstep(0.,.9,vU));
 if(uSt>.5&&uSt<1.5){float fl=n1(vU*14.-uT*22.+vS*1.5)*.6+n1(vU*33.-uT*41.)*.4;a*=(.45+.8*fl)*smoothstep(0.,.2+.6*fl,e);base=mix(uCol*1.25,uCol2,smoothstep(0.,.75,vU+.25*(1.-fl)));hot*=1.5;}
 else if(uSt>1.5&&uSt<2.5){float b=.5+.5*sin(vU*46.-uT*34.);a*=.65+.55*b;hot=max(hot,pow(max(e,0.),2.5)*.55*b);base*=1.+.5*b;}
 else if(uSt>2.5&&uSt<3.5){float z=vU*22.-uT*9.;a*=smoothstep(.25,.8,e)*(.35+.65*step(.25+.5*h1(floor(z)),fract(z)));}
 else if(uSt>3.5&&uSt<4.5){vec2 c=vec2(vU*60.,vS*1.6+1.6),f=fract(c)-.5;float g=step(.8,h1(floor(c.x)*3.7+floor(c.y)*5.9+floor(uT*14.)*11.3))*smoothstep(.45,.05,length(f));a*=.5+2.4*g*smoothstep(0.,.5,vA);base+=g*vec3(1.2,1.,.55);}  // glints: round twinkles in cells along the ribbon
 else if(uSt>4.5&&uSt<5.5){a*=.5*(.45+.9*n1(vU*8.-uT*2.5+vS*1.7))*smoothstep(0.,1.,e);hot=0.;}
 else if(uSt>5.5){float x=clamp(vU,0.,1.)*6.;base=uR[0];for(int i=0;i<6;i++)base=mix(base,uR[i+1],clamp(x-float(i),0.,1.));}
 if(a<.003)discard;vec3 col=mix(base,uSt>.5?mix(uHot,uCol*1.3,.55):uHot,hot);  // styled trails keep their colour in the hot core
${FOGF(true)}
 gl_FragColor=vec4(col,a);
#include <colorspace_fragment>
}`;
class Ribbon{
 constructor(N,life,grow){this.N=N;this.life=life;this.grow=grow;this.n=0;this.h=0;this.last=-1;this.owner=null;const M=N+1;
  this.sp=new Float32Array(N*3);this.st=new Float64Array(N);this.sk=new Float32Array(N);this.sw=new Float32Array(N);this.tp=new Float32Array(M*3);this.tk=new Float32Array(M);this.tw=new Float32Array(M);this.tu=new Float32Array(M);
  const g=this.g=new THREE.BufferGeometry(),sd=new Float32Array(M*2),ix=[];for(let i=0;i<M;i++){sd[i*2]=-1;sd[i*2+1]=1;if(i<N)ix.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2)}
  this.pos=new THREE.BufferAttribute(new Float32Array(M*6),3).setUsage(THREE.DynamicDrawUsage);this.al=new THREE.BufferAttribute(new Float32Array(M*2),1).setUsage(THREE.DynamicDrawUsage);this.au=new THREE.BufferAttribute(new Float32Array(M*2),1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position',this.pos);g.setAttribute('aA',this.al);g.setAttribute('aU',this.au);g.setAttribute('aS',new THREE.BufferAttribute(sd,1));g.setIndex(ix);g.setDrawRange(0,0);
  this.mat=new THREE.ShaderMaterial({uniforms:{...fogU(),uCol:{value:new THREE.Color()},uCol2:{value:new THREE.Color()},uHot:{value:new THREE.Color(1.6,1.5,1.3)},uR:{value:Array.from({length:7},()=>new THREE.Color())},uSt:{value:0},uT:{value:0}},vertexShader:RV,fragmentShader:RFS,
   transparent:true,depthWrite:false,fog:true,toneMapped:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  this.m=new THREE.Mesh(g,this.mat);this.m.frustumCulled=false;this.m.renderOrder=4;this.m.visible=false;scene.add(this.m)}
 reset(){this.n=0;this.last=-1;this.m.visible=false}
 // head p this frame with intensity k and width w; a new sample every 1/60 s; draws everything younger than life (s)
 tick(p,k,w){if(this.n&&p.distanceToSquared(_a.fromArray(this.sp,this.h*3))>900)this.n=0;  // teleported (kickoff, respawn): start over
  if(T-this.last>=1/60||this.last<0){this.h=(this.h+this.N-1)%this.N;p.toArray(this.sp,this.h*3);this.st[this.h]=T;this.sk[this.h]=k;this.sw[this.h]=w;this.n=Math.min(this.n+1,this.N);this.last=T}
  let m=1,mx=k;p.toArray(this.tp,0);this.tk[0]=k;this.tw[0]=w;this.tu[0]=0;this.mat.uniforms.uT.value=T;
  for(let j=0;j<this.n;j++){const i=(this.h+j)%this.N,age=T-this.st[i];if(age>=this.life)break;const u=age/this.life;
   this.tp[m*3]=this.sp[i*3];this.tp[m*3+1]=this.sp[i*3+1];this.tp[m*3+2]=this.sp[i*3+2];this.tk[m]=this.sk[i]*(1-u)*(1-u);this.tw[m]=this.sw[i]*(1+this.grow*u);this.tu[m]=u;mx=Math.max(mx,this.tk[m]);m++}
  if(m<3||mx<.005){this.m.visible=false;return}
  const P=this.pos.array,A=this.al.array,U=this.au.array,tp=this.tp,cp=camera.position;
  for(let i=0;i<m;i++){const a=Math.max(0,i-1),b=Math.min(m-1,i+1);_b.set(tp[a*3]-tp[b*3],tp[a*3+1]-tp[b*3+1],tp[a*3+2]-tp[b*3+2]);_a.fromArray(tp,i*3);
   _c.subVectors(cp,_a);_d.crossVectors(_b,_c);const l=_d.length();if(l>1e-6)_d.multiplyScalar(this.tw[i]/l);else _d.set(0,this.tw[i],0);
   P[i*6]=_a.x-_d.x;P[i*6+1]=_a.y-_d.y;P[i*6+2]=_a.z-_d.z;P[i*6+3]=_a.x+_d.x;P[i*6+4]=_a.y+_d.y;P[i*6+5]=_a.z+_d.z;A[i*2]=A[i*2+1]=i?this.tk[i]:this.tk[0]*.6;U[i*2]=U[i*2+1]=this.tu[i]}
  upd(this.pos,m*6);upd(this.al,m*2);upd(this.au,m*2);this.g.setDrawRange(0,(m-1)*6);this.m.visible=true}}
const RIB=[],ballRib=new Ribbon(40,.55,-.75);

// ---------- boost flame + motor glow: one shared geometry (8 motor slots x outer cone, inner core, glow disc), placed by uniforms ----------
const FG=(()=>{const P=[],Mi=[],Tt=[],Rr=[],Ll=[],ix=[];let v=0;const RS=12;
 for(let mi=0;mi<8;mi++)for(const L of[0,1,2]){const rings=L<2?9:5,b=v;
  for(let r=0;r<rings;r++){const t=r/(rings-1);for(let s=0;s<=RS;s++){const a=s/RS*Math.PI*2,f=L<2?1:t;P.push(0,0,0);Mi.push(mi);Tt.push(L<2?t:0);Rr.push(Math.cos(a)*f,Math.sin(a)*f);Ll.push(L);v++}}
  for(let r=0;r<rings-1;r++)for(let s=0;s<RS;s++){const i=b+r*(RS+1)+s;ix.push(i,i+RS+1,i+1,i+1,i+RS+1,i+RS+2)}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('aM',new THREE.Float32BufferAttribute(Mi,1));g.setAttribute('aT',new THREE.Float32BufferAttribute(Tt,1));
 g.setAttribute('aR',new THREE.Float32BufferAttribute(Rr,2));g.setAttribute('aL',new THREE.Float32BufferAttribute(Ll,1));g.setIndex(ix);return g})();
const FV=`uniform vec4 uM[8];uniform float uR,uLen,uB,uTime;attribute float aM,aT,aL;attribute vec2 aR;varying float vT,vL,vRim,vA;
#include <fog_pars_vertex>
void main(){int mi=int(aM+.5);vec4 m=uM[mi];vec3 p,nr;float fl=1.+.14*sin(uTime*47.+aM*2.1)+.08*sin(uTime*83.+aM*5.3);
 if(aL<1.5){float core=step(.5,aL),len=uLen*mix(1.,.42,core)*fl*uB,r=uR*mix(1.,.5,core)*(1.+1.3*aT)*pow(max(0.,1.-aT),.6)*(.4+.6*uB);p=m.xyz+vec3(aR.x*r,-aT*len,aR.y*r);nr=normalize(vec3(aR.x,.3,aR.y));}
 else{float r=uR*2.8;p=m.xyz+vec3(aR.x*r,-.05*uR,aR.y*r);nr=vec3(0.,-1.,0.);}
 p*=m.w;vec4 mvPosition=modelViewMatrix*vec4(p,1.);vRim=abs(dot(normalize(normalMatrix*nr),normalize(-mvPosition.xyz)));vT=aT;vL=aL;vA=length(aR);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const FF=`uniform vec3 uCol,uHot;uniform float uB,uG,uTime;varying float vT,vL,vRim,vA;
#include <fog_pars_fragment>
void main(){vec3 col;float a;
 if(vL>1.5){col=uCol*.5+vec3(.35,.4,.5);a=uG*pow(max(0.,1.-vA),2.2);}
 else if(vL>.5){col=uHot;a=uB*pow(max(0.,1.-vT),1.3)*pow(clamp(vRim,0.,1.),1.5);}
 else{col=mix(uHot*.7,uCol,smoothstep(0.,.5,vT));a=uB*pow(max(0.,1.-vT),1.6)*pow(clamp(vRim,0.,1.),2.2)*(.72+.28*sin(vT*24.-uTime*70.))*.85;}
 if(a<.003)discard;
${FOGF(true)}
 gl_FragColor=vec4(col,a);
#include <colorspace_fragment>
}`;
function flameMat(){return new THREE.ShaderMaterial({uniforms:{...fogU(),uM:{value:Array.from({length:8},()=>new THREE.Vector4())},uR:{value:.1},uLen:{value:1},uB:{value:0},uG:{value:0},uTime:{value:0},
 uCol:{value:new THREE.Color()},uHot:{value:new THREE.Color(2.6,2.1,1.5)}},vertexShader:FV,fragmentShader:FF,transparent:true,depthWrite:false,fog:true,toneMapped:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending})}
const PS=PARTS_SCALE;
// per-drone state, made on first use; the flame mesh rides on the drone's mesh (hidden with it, e.g. your own quad in FPV)
function fxOf(d){let f=d.fx;if(f)return f;f=d.fx={mat:flameMat(),mesh:null,props:null,hex:-1,col:new THREE.Color(),col2:new THREE.Color(),st:0,bk:0,gl:0,dA:0,eA:0,sA:0,
 g:0,gs:0,gi:0,gp:new V3(),gn:new V3(),sc:new V3(),scOk:false,pr:.1};
 if(d.mesh){f.mesh=new THREE.Mesh(FG,f.mat);f.mesh.frustumCulled=false;f.mesh.renderOrder=3;f.mesh.visible=false;d.mesh.add(f.mesh)}return f}
function placeFlames(d,f){f.props=d.props;const M=f.mat.uniforms.uM.value;let pr=0;
 for(let i=0;i<8;i++){const pg=d.props?.[i];if(!pg){M[i].set(0,0,0,0);continue}const disc=pg.children[1]?.geometry;if(disc){if(!disc.boundingSphere)disc.computeBoundingSphere();pr=Math.max(pr,disc.boundingSphere.radius)}
  M[i].set(pg.position.x*PS,pg.position.y*PS,pg.position.z*PS,1)}
 pr=(pr||.065)*PS;f.pr=pr;for(let i=0;i<8;i++)if(M[i].w)M[i].y-=.2*pr;f.mat.uniforms.uR.value=.36*pr;f.mat.uniforms.uLen.value=3.6*pr}

// ---------- scuff decals: quads lying on the surface, a darkening (multiply) pass and a hot glow (additive) pass ----------
const DV=`attribute vec3 iP;attribute vec3 iX;attribute vec3 iY;attribute vec4 iT;attribute vec3 iH;varying vec2 vUv;varying vec4 vT;varying vec3 vH;
#include <fog_pars_vertex>
void main(){vUv=position.xy;vT=iT;vH=iH;vec4 mvPosition=modelViewMatrix*vec4(iP+position.x*iX+position.y*iY,1.);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const DF=mul=>`varying vec2 vUv;varying vec4 vT;varying vec3 vH;
#include <fog_pars_fragment>
float hs(float x){return fract(sin(x*127.1+vT.w*311.7)*43758.55);}
void main(){vec2 u=vUv;float e=(1.-smoothstep(.5,1.,abs(u.x)))*(1.-smoothstep(.45,1.,abs(u.y)));
 float y=(u.y*.5+.5)*11.,i=floor(y),f=fract(y),g=hs(i),ln=step(.3,g)*(1.-smoothstep(.1,.45,abs(f-.5)))*(.45+.55*g),len=.35+.65*hs(i+7.);
 ln*=1.-smoothstep(len-.25,len,abs(u.x+(hs(i+3.)-.5)*.5));float m=e*(.3+.7*ln);
${mul?`vec3 col=mix(vec3(1.),vT.rgb,m);
#ifdef USE_FOG
 col=mix(col,vec3(1.),smoothstep(fogNear,fogFar,vFogDepth));
#endif
 gl_FragColor=vec4(col,1.);}`:`float a=1.;vec3 col=vH*e*(.25+ln);
${FOGF(true)}
 gl_FragColor=vec4(col*a,1.);
#include <colorspace_fragment>
}`}`;
const DN=96;const DEC={n:0,h:0,p:new Float32Array(DN*3),x:new Float32Array(DN*3),y:new Float32Array(DN*3),t:new Float32Array(DN*3),a:new Float32Array(DN),ht:new Float32Array(DN),hc:new Float32Array(DN*3),age:new Float32Array(DN),life:new Float32Array(DN),sd:new Float32Array(DN)};
const decG=new THREE.InstancedBufferGeometry();decG.setIndex(QI);decG.setAttribute('position',new THREE.BufferAttribute(QV,3));
const dAt=(nm,k)=>{const a=new THREE.InstancedBufferAttribute(new Float32Array(DN*k),k);a.setUsage(THREE.DynamicDrawUsage);decG.setAttribute(nm,a);return a};
const dP=dAt('iP',3),dX=dAt('iX',3),dY=dAt('iY',3),dT=dAt('iT',4),dH=dAt('iH',3);decG.instanceCount=0;
const decMul=new THREE.Mesh(decG,new THREE.ShaderMaterial({uniforms:fogU(),vertexShader:DV,fragmentShader:DF(true),fog:true,transparent:true,depthWrite:false,toneMapped:false,
 blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.DstColorFactor,blendDst:THREE.ZeroFactor,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}));
const decAdd=new THREE.Mesh(decG,new THREE.ShaderMaterial({uniforms:fogU(),vertexShader:DV,fragmentShader:DF(false),fog:true,transparent:true,depthWrite:false,toneMapped:false,
 blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}));
decMul.frustumCulled=decAdd.frustumCulled=false;decMul.renderOrder=1;decAdd.renderOrder=2;scene.add(decMul,decAdd);
// a scuff from a to b (centre line) on the surface with normal n, half width w; heat: how hot it glows when fresh
function scuff(a,b,n,w,heat){const D=DEC,i=D.h%Math.min(DN,QQ.dec);D.h=i+1;D.n=Math.max(D.n,i+1);const i3=i*3,S=SURF[surf()];
 _e.subVectors(b,a);let l=_e.length();if(l<1e-3){_e.set(1,0,0).addScaledVector(n,-n.x);if(_e.lengthSq()<.01)_e.set(0,0,1).addScaledVector(n,-n.z);_e.normalize();l=0}else _e.divideScalar(l);
 _c.addVectors(a,b).multiplyScalar(.5).addScaledVector(n,.03);_c.toArray(D.p,i3);_d.copy(_e).multiplyScalar(l*.5+w*.8).toArray(D.x,i3);_d.crossVectors(n,_e).multiplyScalar(w).toArray(D.y,i3);
 D.t[i3]=S.sc[0];D.t[i3+1]=S.sc[1];D.t[i3+2]=S.sc[2];D.a[i]=S.sa;D.ht[i]=heat*S.heat;D.hc[i3]=1;D.hc[i3+1]=.42;D.hc[i3+2]=.12;D.age[i]=0;D.life[i]=QQ.dl*(.8+.4*rnd());D.sd[i]=rnd()*100}
function decTick(dt){const D=DEC;if(!D.n){decG.instanceCount=0;return}let k=0;const P=dP.array,X=dX.array,Y=dY.array,Tt=dT.array,Hh=dH.array;
 for(let i=0;i<D.n;i++){if(D.life[i]<=0)continue;const ag=D.age[i]+=dt;if(ag>=D.life[i]){D.life[i]=0;continue}const i3=i*3,k3=k*3,u=ag/D.life[i],fa=D.a[i]*Math.min(1,(1-u)/.45),h=D.ht[i]*Math.max(0,1-ag/.8)**2;
  for(let j=0;j<3;j++){P[k3+j]=D.p[i3+j];X[k3+j]=D.x[i3+j];Y[k3+j]=D.y[i3+j];Hh[k3+j]=D.hc[i3+j]*h*3}
  for(let j=0;j<3;j++)Tt[k*4+j]=1-(1-D.t[i3+j])*fa;Tt[k*4+3]=D.sd[i];k++}
 decG.instanceCount=k;if(k){upd(dP,k*3);upd(dX,k*3);upd(dY,k*3);upd(dT,k*4);upd(dH,k*3)}}

// ---------- per-map surfaces: prop-wash dust, scuff tint (multiply), heat glow, sparks on this ground ----------
// dust kinds: [share, r,g,b, alpha, size0, size1, life, drag, gravity, shape, speed, lift]; shape 0 = soft puff, 1 = chip, 2 = blade
const SURF={
 arena:{dust:[[1,.62,.7,.86,.075,.9,4.6,1.3,2.2,-.6,0,1,1]],sc:[.3,.32,.38],sa:.6,heat:1,spark:1},
 meadow:{dust:[[.35,.5,.72,.2,1,.15,.15,1.1,1,26,2,.8,2.8],[.2,.16,.3,.07,1,.13,.13,1.1,1,26,2,.8,2.8],[.45,.82,.84,.66,.2,1.1,4.8,1.3,2.3,-.4,0,1,.9]],sc:[.36,.28,.16],sa:.75,heat:.12,spark:.45},
 canyon:{dust:[[.8,.74,.52,.36,.19,1.3,7,1.7,1.9,-.3,0,1.1,1.1],[.2,.42,.27,.16,1,.06,.06,.9,1,26,1,.8,2.2]],sc:[.55,.38,.26],sa:.55,heat:.25,spark:.7},
 alpine:{dust:[[.72,.92,.95,1,.22,1.1,5.8,1.5,2.3,-.2,0,1,1.1],[.28,1.2,1.25,1.3,.9,.045,.045,1.2,1.4,7,1,.7,2.4]],sc:[.55,.62,.78],sa:.5,heat:.12,spark:.4},
 df:{dust:[[.5,.36,.5,.16,1,.15,.15,1.1,1,26,2,.8,2.8],[.5,.62,.58,.44,.16,1.1,4.8,1.3,2.2,-.3,0,1,.9]],sc:[.38,.32,.22],sa:.7,heat:.12,spark:.5},
 wall:{dust:[[1,.62,.66,.74,.06,.8,3.8,1,2.4,0,0,.9,.6]]}};
const surf=()=>SURF[mapId]?mapId:'arena';
function spawnDust(p,n,w,d,wall){const S=wall?SURF.wall:SURF[surf()],K=S.dust,s=DRAD/2;let r=rnd(),k=K[0];for(const q of K){if(r<q[0]){k=q;break}r-=q[0]}
 _t1.set(n.y,n.z,-n.x).cross(n);if(_t1.lengthSq()<1e-6)_t1.set(1,0,0);_t1.normalize();_t2.crossVectors(n,_t1);
 const an=rnd()*Math.PI*2,ca=Math.cos(an),sa=Math.sin(an),rr=(.3+rnd()*rnd()*3.2)*s,sp=(7+rnd()*14)*(.45+w)*k[11],lf=k[12]*(1+rnd()*2.5)*(.5+w);
 _a.copy(p).addScaledVector(n,.25*s).addScaledVector(_t1,ca*rr).addScaledVector(_t2,sa*rr);
 _b.copy(_t1).multiplyScalar(ca*sp).addScaledVector(_t2,sa*sp).addScaledVector(n,lf);_c.copy(d.v).addScaledVector(n,-d.v.dot(n));_b.addScaledVector(_c,.2);
 const v=.8+.4*rnd(),ch=k[10]>0,sz=ch?k[5]*s*(.7+.6*rnd()):k[5]*s;
 DUST.spawn(_a.x,_a.y,_a.z,_b.x,_b.y,_b.z,k[1]*v,k[2]*v,k[3]*v,k[4]*(ch?1:.6+.6*w),k[7]*(.6+.6*rnd()),sz,ch?sz:k[6]*s*(.8+.5*w),k[8],k[9],ch?k[10]+rnd()*.4:rnd()*.4,ch?.25:0);if(!ch)DUST.plane(n,p)}
// prop wash: trace the thrust axis down to the surface; strength by motor spool (or boost) and height
function wash(d,f,dt){const s=DRAD/2,Rw=(9+6*s)*(f.bk>.1?1.5:1),st=Math.max(cl((d.ms-.1)/.55,0,1)**1.2,f.bk*.95);if(st<.04)return;
 let x0=sdf(d.p.x,d.p.y,d.p.z);if(x0>-.05||-x0>Rw)return;  // inside the map (a cave mouth, the safety net) or nothing close by
 const dn=_n.set(0,-1,0).applyQuaternion(d.q);let t=0,hit=false;for(let i=0;i<16;i++){const x=-sdf(d.p.x+dn.x*t,d.p.y+dn.y*t,d.p.z+dn.z*t);if(x<.2){hit=true;break}t+=Math.max(x,.4);if(t>Rw)return}
 if(!hit)return;const hp=_e.copy(d.p).addScaledVector(dn,t),n=sdN(hp,_d).negate(),wall=Math.abs(n.y)<.6;
 const w=st*(1-t/Rw)**1.4*Math.max(.35,-dn.dot(n));if(w<.02)return;hp.addScaledVector(n,.15);
 f.dA+=w*120*QQ.k*dt;let c=0;while(f.dA>=1&&c++<12){f.dA--;spawnDust(hp,n,w,d,wall)}if(f.dA>1)f.dA=1}
// sparks + scuffs from this frame's ground contacts (accumulated from the 'ground' events of every tick)
function scrape(d,f,dt){if(!f.g){f.scOk=false;return}f.g=0;const sl=f.gs,im=f.gi,p=f.gp,n=f.gn,s=DRAD/2,S=SURF[surf()],q=QQ.k*(GS.OBSON?SURF.df.spark:S.spark);f.gs=f.gi=0;
 const sd=_b.copy(d.v).addScaledVector(n,-d.v.dot(n));const sv=sd.length();if(sv>.5)sd.divideScalar(sv);else sd.set(0,0,0);
 f.sA+=cl((sl-6)/30,0,1.6)*240*q*dt;if(im>9)f.sA+=Math.min(50,(im-9)*2.4)*q;let c=0;
 while(f.sA>=1&&c++<60){f.sA--;const sp=sl*(.35+.65*rnd()),up=(2+rnd()*9)*(1+im*.04),h=rnd();
  SPK.spawn(p.x+n.x*.1,p.y+n.y*.1,p.z+n.z*.1,sd.x*sp+n.x*up+(rnd()-.5)*8,sd.y*sp+n.y*up+(rnd()-.5)*8,sd.z*sp+n.z*up+(rnd()-.5)*8,3.2,1.5+h*1.3,.45+h*.6,1,.18+rnd()*.35,.045*s,.03*s,1.4,G*.7,0,.35)}
 if(f.sA>1)f.sA=1;
 // a chip of the ground on grass / dirt / snow when it digs in
 if(S!==SURF.arena&&(sl>8||im>10)){f.dA+=(sl*2+im*3)*QQ.k*dt;let k=0;while(f.dA>=1&&k++<10){f.dA--;spawnDust(p,n,.6,d,false)}}
 if(sl>5||im>12){const w=(.3+.25*cl(im/30,0,1)+.15*cl(sl/40,0,1))*s;
  if(!f.scOk){f.sc.copy(p);f.scOk=true;if(im>12)scuff(p,p,n,w*1.6,cl(im/30,.4,1))}
  else if(p.distanceToSquared(f.sc)>(1.1*s)**2){if(p.distanceToSquared(f.sc)<(8*s)**2)scuff(f.sc,p,n,w,cl(sl/30,.2,1));f.sc.copy(p)}}
 else f.scOk=false}

// ---------- hard ball hits: flash, shock ring, sparks ----------
const ringTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);
 r.addColorStop(0,'rgba(255,255,255,0)');r.addColorStop(.76,'rgba(255,255,255,0)');r.addColorStop(.9,'rgba(255,255,255,1)');r.addColorStop(.95,'rgba(255,255,255,.3)');r.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=r;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})();
const RINGS=Array.from({length:6},()=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:ringTex,color:0xffffff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}));
 m.visible=false;m.renderOrder=4;m.userData={t:0,d:.4,r0:1,r1:3,a:1};scene.add(m);return m});let ringI=0;
function ballHit(e){const sp=e.speed;if(sp<7||!ballMesh.visible)return;const k=cl((sp-7)/50,0,1),p=e.p,n=e.n,c=_col.copy(ballLight.color),q=QQ.k;
 ADD.spawn(p.x,p.y,p.z,0,0,0,c.r*1.2+.3,c.g*1.2+.3,c.b*1.2+.3,.2+.3*k,.1+.08*k,BR*(.35+.3*k),BR*(.7+.7*k),0,0,0,0);  // flash
 ADD.spawn(p.x,p.y,p.z,0,0,0,2,2,2,.25+.35*k,.06+.04*k,BR*(.15+.15*k),BR*(.35+.35*k),0,0,0,0);  // white-hot core
 const N=Math.round((5+40*k)*q);for(let i=0;i<N;i++){_a.set(rnd()-.5,rnd()-.5,rnd()-.5).normalize();if(_a.dot(n)<0)_a.addScaledVector(n,-1.6*_a.dot(n));_a.addScaledVector(n,.3).normalize();
  const v=(12+rnd()*30)*(.5+k),h=rnd();SPK.spawn(p.x,p.y,p.z,_a.x*v+ball.v.x*.3,_a.y*v+ball.v.y*.3,_a.z*v+ball.v.z*.3,c.r*1.6+h,c.g*1.6+h,c.b*1.6+h,1,.2+rnd()*.3,.05*BR,.03*BR,2,G*.4,0,.3)}
}  /* no shock ring on ordinary hits: rings only mark pops (render/popfx.js) */
function ringTick(dt){for(const m of RINGS){if(!m.visible)continue;const u=m.userData;u.t+=dt;const x=u.t/u.d;if(x>=1){m.visible=false;continue}
 const e=1-(1-x)**3;m.scale.setScalar(u.r0+(u.r1-u.r0)*e);m.material.opacity=u.a*(1-x)**1.5}}

onEv('ground',e=>{if(!e.d.mesh)return;const f=fxOf(e.d);if(!f.g){f.g=1;f.gs=f.gi=0}f.gs=Math.max(f.gs,e.slide);f.gi=Math.max(f.gi,e.speed);f.gp.copy(e.p);f.gn.copy(e.n)});
onFx('touch',e=>{if(e.p)ballHit(e)});
onFx('bump',e=>{if(e.speed>14&&e.other){const p=_e.addVectors(e.d.p,e.other.p).multiplyScalar(.5),N=Math.round(Math.min(40,e.speed)*QQ.k);
  for(let i=0;i<N;i++){_a.set(rnd()-.5,rnd()-.5,rnd()-.5).normalize().multiplyScalar(10+rnd()*25);const h=rnd();SPK.spawn(p.x,p.y,p.z,_a.x,_a.y,_a.z,3,1.6+h,.5+h*.5,1,.2+rnd()*.3,.08,.05,1.5,G*.6,0,.35)}}});

// boost embers, by trail style: stream (team / white) half hot sparks, fire hot col..col2, plasma glowing orbs, sparks fast streaks, sparkle hanging glints, smoke puffs, rainbow every colour
function embers(d,f,dn,s,dt){const st=f.st;f.eA+=[90,130,70,120,110,45,90][st]*QQ.k*dt;let c=0;
 while(f.eA>=1&&c++<10){f.eA--;const h=rnd(),v=18+rnd()*10,C=_col2;
  _a.set(rnd()-.5,rnd()-.5,rnd()-.5).multiplyScalar(5).addScaledVector(dn,v).addScaledVector(d.v,.4);_b.copy(d.p).addScaledVector(dn,(.5+rnd()*.4)*s);
  if(st===3){_a.addScaledVector(_e.set(rnd()-.5,rnd()-.5,rnd()-.5),22);C.copy(f.col).lerp(f.col2,h);SPK.spawn(_b.x,_b.y,_b.z,_a.x,_a.y,_a.z,C.r*2.6,C.g*2.6,C.b*2.6,1,.2+rnd()*.25,.05*s,.03*s,1.2,G*.5,0,0)}
  else if(st===5){C.copy(f.col).lerp(f.col2,h*h*.6);_a.multiplyScalar(.12).addScaledVector(d.v,.08);DUST.spawn(_b.x,_b.y,_b.z,_a.x,_a.y,_a.z,C.r,C.g,C.b,.3,1.1+rnd()*.6,.5*s,2.6*s,1.4,-.8,rnd()*.4,0)}
  else if(st===4){const w=h<.3;C.copy(f.col);_a.multiplyScalar(.25);ADD.spawn(_b.x+(rnd()-.5)*s,_b.y+(rnd()-.5)*s,_b.z+(rnd()-.5)*s,_a.x,_a.y,_a.z,w?2.4:C.r*2.6,w?2.3:C.g*2.6,w?2:C.b*2.6,1,.35+rnd()*.45,.09*s,.02*s,2.5,-.5,rnd()*.4,0)}
  else if(st===2){C.copy(f.col).lerp(f.col2,h);_a.multiplyScalar(.6);ADD.spawn(_b.x,_b.y,_b.z,_a.x,_a.y,_a.z,C.r*2.8,C.g*2.8,C.b*2.8,.9,.3+rnd()*.2,.26*s,.04*s,3,0,0,0)}
  else{if(st===6&&d.trailCols)C.copy(d.trailCols[rnd()*d.trailCols.length|0]);else if(st===1)C.copy(f.col).lerp(f.col2,h);else C.copy(f.col);const hot=st===0&&h<.5;
   ADD.spawn(_b.x,_b.y,_b.z,_a.x,_a.y,_a.z,hot?2.6:C.r*2.4,hot?1.7:C.g*2.4,hot?.55:C.b*2.4,.8,.25+rnd()*.2,(st===1?.3:.22)*s,.06*s,1.8,-2,0,0)}}}

// ---------- per frame (render/visuals.js, after the drones are placed) ----------
// FX.on: false hides every effect (A/B frame-time checks, tools/fx-shots.mjs); FX.ms: time spent in gameFx (ms, summed)
export const FX={on:true,ms:0,stats:()=>({add:ADD.act,spark:SPK.act,dust:DUST.act,decals:decG.instanceCount,ribbons:RIB.filter(r=>r.m.visible).length,ball:ballRib.m.visible}),objs:()=>fxObjs()};let fxWas=true;const fxObjs=()=>[ADD.m,SPK.m,DUST.m,decMul,decAdd,ballRib.m,...RIB.map(r=>r.m),...RINGS,...GS.drones.map(d=>d.fx?.mesh).filter(Boolean)];
// fxReset: start every ribbon trail over and drop the frame's ground contacts (a replay cut: the quads and ball jump to recorded places)
export function fxReset(){for(const r of RIB)r.reset();ballRib.reset();for(const d of GS.drones)if(d.fx)d.fx.g=0}
export function gameFx(dt,now){if(!FX.on){if(fxWas){fxWas=false;for(const o of fxObjs())o.visible=false}return}if(!fxWas){fxWas=true;for(const o of[ADD.m,SPK.m,DUST.m,decMul,decAdd])o.visible=true}
 const t0=performance.now();gameFx1(dt);FX.ms+=performance.now()-t0}
function gameFx1(dt){QQ=QK[qId]||QK.high;T+=dt;const fpv=GS.camMode===0,cp=camera.position;let ri=0;
 for(const d of GS.drones){const f=fxOf(d);if(!f.mesh)continue;const live=d.dead<=0;
  const tc=d.trailCol,hex=tc?.isColor?tc.getHex():tc??COL[d.team];if(hex!==f.hex){f.hex=hex;f.col.set(hex);f.mat.uniforms.uCol.value.copy(f.col).multiplyScalar(2.2)}
  if(f.props!==d.props)placeFlames(d,f);
  const bo=live&&d.boostOn&&GS.state!=='kickoff';f.bk+=((bo?1:0)-f.bk)*Math.min(1,dt*(bo?14:7));
  f.gl+=((live?.42*cl((d.ms-.55)/.4,0,1)+.25*f.bk:0)-f.gl)*Math.min(1,dt*6);
  const U=f.mat.uniforms;U.uB.value=f.bk;U.uG.value=f.gl;U.uTime.value=T;f.mesh.visible=f.bk>.01||f.gl>.01;
  const near=d.p.distanceToSquared(cp)<250*250,s=DRAD/2;
  // boost trail + embers
  const rb=RIB[ri]||(RIB[ri]=new Ribbon(36,.6,2.2));ri++;if(rb.owner!==d){rb.owner=d;rb.reset()}
  const dn=_n.set(0,-1,0).applyQuaternion(d.q);
  const st=f.st=RSTY[d.trailStyle]||0,c2=d.trailCol2;f.col2.copy(c2?.isColor?c2:f.col);
  if(f.bk>.01||rb.m.visible){_c.copy(d.p).addScaledVector(dn,.35*s);const RU=rb.mat.uniforms;RU.uCol.value.copy(f.col).multiplyScalar(1.4);RU.uCol2.value.copy(f.col2).multiplyScalar(1.4);RU.uSt.value=st;
   if(st===6&&d.trailCols)for(let i=0;i<7;i++)RU.uR.value[i].copy(d.trailCols[Math.min(i,d.trailCols.length-1)]).multiplyScalar(1.5);
   rb.tick(_c,f.bk*(st===5?.55:.7),.55*s*(.5+.5*f.bk)*(st===5?1.7:st===3?.65:st===1?1.2:1));if(fpv&&d===GS.player)rb.m.visible=false}
  if(bo&&near&&dt>0)embers(d,f,dn,s,dt);
  if(live&&near&&dt>0){wash(d,f,dt);scrape(d,f,dt)}else f.g=0}
 for(;ri<RIB.length;ri++){RIB[ri].owner=null;RIB[ri].m.visible=false}
 // ball trail: faint at rolling speeds, a bright comet tail at shot speeds
 if(ballMesh.visible&&!GS.OBSON){const sp=ball.v.length(),k=.1*cl((sp-12)/20,0,1)+.75*cl((sp-30)/100,0,1)**1.1;ballRib.mat.uniforms.uCol.value.copy(ballLight.color).multiplyScalar(1.5);ballRib.mat.uniforms.uCol2.value.copy(ballRib.mat.uniforms.uCol.value);ballRib.tick(ball.p,k,BR*.92)}
 else ballRib.reset();
 const fl=!GS.OBSON;ADD.update(dt,fl);SPK.update(dt,fl);DUST.update(dt,fl);decTick(dt);ringTick(dt)}
