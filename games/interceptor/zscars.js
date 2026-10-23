// Interceptor Zombies: the living map. Explosions that reach the ground leave scars that stay: impact craters, scorch patches that spread slowly
// over dry fields while a fire burns and then stop, and rubble where a village house was destroyed (the house is gone, the rubble replaces it).
// Sectors of the campaign keep theirs (saved compactly in the campaign save, zcampaign.js), a quick defence keeps them for the run, and in
// co-op the host's scars are the truth: clients get them in the snapshot at a bounded rate (znet.js) and never make their own.
//
// How it stays glitch-free and cheap (the architecture):
//  - one InstancedBufferGeometry draw per scar type (3 in all), each a small grid; instances are three 4-float attributes (centre and size, yaw and spread, height and fade), no per-frame allocation,
//    every cap is hard (256 craters, 128 burns, 64 rubble) and when full the oldest and smallest scar fades and its slot is reused
//  - the vertex shader lays every grid vertex on the terrain by reading the heightmap (an R32F texture of the terrain mesh's own heights, with the
//    mesh's triangle split, so it lands exactly on what is drawn) and lifts it along the heightmap normal by a few centimetres plus a margin
//    for the grid spacing; depthWrite is off, the draw goes after the opaque terrain and water (transparent pass) and before the particles
//    (renderOrder), so scars neither fight the terrain nor each other. Edges are soft alpha; a scar fades with distance and with its size on
//    screen, so far away it is gone rather than shimmering; the normal-map relief fades out before it can sparkle
//  - burns are decals, not a mask the terrain shader samples: a mask fine enough for a 10 m patch is 1024 squared or more (4 MB repainted and
//    uploaded as burns spread) and costs a texture fetch on every ground pixel for scars that cover a sliver of the screen; a decal costs
//    only the pixels it covers, and its spread is one float per instance (the texture holds the order the ground ignites in)
//  - quality (engine/gfx.js scar, scFar): fewer shown and a nearer fade at Medium and Low; the records (and the save) keep all of them
// Authority: scars are made only by the solo player or the co-op host. Hooks: zombies.js calls initScars(api,G,Z) once, near the end (only the codex comes after it); it wraps Z.flash (every
// explosion), start, stop and visuals. znet.js carries Z.sc.netOut / netIn in the snapshot; zcampaign.js keeps S.zcamp.sc.
import {later,warmers,upload} from '../../engine/idle.js';
import {gfx} from '../../engine/gfx.js';
import {detailTex} from '../../engine/render.js';
import {seeded} from '../../engine/util.js';
import {FA,CW,CH,FU0,NU,NV,fieldLayout,partRects} from './ground.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v;
/* the scars' own random stream (re-seeded when a run starts): cosmetic randomness must not shift the game's Math.random sequence, or a seeded run would differ with and without scars */
let rg=seeded(20241);const rr=()=>rg(),rnd=(a,b)=>a+rr()*(b-a);

// ---------- records: type, position on a 2.2 m grid, size, variant, yaw, spread, age; 6 bytes (8 characters) each ----------
export const CAP=[256,128,64],TYPES=['crater','burn','rubble'],RES=[16,28,14],ORD=[-3,-2,-1],HALF=4500;
const AL='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',AI=new Int8Array(128).fill(-1);for(let i=0;i<64;i++)AI[AL.charCodeAt(i)]=i;
export const qpos=v=>cl(Math.round((v+HALF)/9000*4095),0,4095),dpos=q=>q/4095*9000-HALF,qsz=r=>cl(Math.round(Math.log(r/1.5)/Math.log(1.05)),0,63),dsz=q=>1.5*1.05**q;
export const MAXSC=8*(CAP[0]+CAP[1]+CAP[2]);
// records [[type, xq, zq, sq, vq, yq, pq, aq]] <-> string
export function pack(R){let s='';for(const[t,x,z,sq,v,y,p,a]of R){const A=x<<12|z,B=t<<22|sq<<16|v<<14|y<<9|p<<4|a;for(let k=0;k<4;k++)s+=AL[A>>18-6*k&63];for(let k=0;k<4;k++)s+=AL[B>>18-6*k&63]}return s}
export function unpack(s){const R=[];if(typeof s!=='string'||s.length%8||s.length>MAXSC)return R;const n=[0,0,0];
 for(let i=0;i<s.length;i+=8){let A=0,B=0,bad=false;for(let k=0;k<4;k++){const a=AI[s.charCodeAt(i+k)],b=AI[s.charCodeAt(i+4+k)];if(!(a>=0&&b>=0)){bad=true;break}A=A<<6|a;B=B<<6|b}
  if(bad)continue;const t=B>>22&3;if(t>2||n[t]>=CAP[t])continue;n[t]++;R.push([t,A>>12&4095,A&4095,B>>16&63,B>>14&3,B>>9&31,B>>4&31,B&15])}
 return R}
// a burn's spread takes this long (s) from nothing to its full size, a function of its size alone, so a client and the host agree
export const burnTime=r=>40+2.2*r;

// ---------- the field under a point: how readily it burns (ground.js's layout, the same cells the shader draws) ----------
const FLAM=[.3,1,.85,1,.7,.7,.12,.12,.65];  /* by crop: 0 verge / track / no field, wheat, barley, stubble, sunflower, maize, plough, harrow, meadow */
let CELLS=null;
export function cropAt(x,z){CELLS||=fieldLayout(seeded(11));const ca=Math.cos(FA),sa=Math.sin(FA),gu=(x*ca+z*sa-(FU0-CW/2))/CW,gv=(-x*sa+z*ca-(FU0-CH/2))/CH,i=cl(Math.floor(gu),0,NU-1),j=cl(Math.floor(gv),0,NV-1),
 c=CELLS[j*NU+i],lx=(gu-i-.5)*CW,ly=(gv-j-.5)*CH,R=partRects(c);
 for(let k=0;k<R.length;k++)if(lx>=R[k][0]&&lx<=R[k][2]&&ly>=R[k][1]&&ly<=R[k][3])return(c.parts[k]||c.parts[0]).t;return 0}
// the main roads (interceptor.js's road polylines) do not burn
const onRoad=(x,z)=>Math.abs(x-(120+90*Math.sin(z/700)))<9||Math.abs(z-(1990+30*Math.sin(x/420)))<8;
export const flamAt=(x,z)=>onRoad(x,z)?0:FLAM[cropAt(x,z)];

// ---------- the scar textures: atlases of 2x2 variants built in idle time from a seeded noise table (DataTexture, no canvas) ----------
let NT=null;
const nz=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),x0=xi&255,y0=yi&255,x1=xi+1&255,y1=yi+1&255,
 a=NT[y0*256+x0],b=NT[y0*256+x1],c=NT[y1*256+x0],d=NT[y1*256+x1];return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v};
const fb=(x,y)=>nz(x,y)*.5+nz(x*2.1+7.3,y*2.1+1.7)*.3+nz(x*4.3+3.1,y*4.3+9.4)*.2;
const sstep=(a,b,x)=>{const t=cl((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const SA=256,WA=512;  /* one variant is SA texels square; the atlas is 2x2 */
// slope (rise over run, in the decal's own units) from a height field with a 1-texel border: x to the right, z with the row
function slopes(H,S,N,o,c,r,amp){const w=S+2,i=(r+1)*w+c+1,gx=(H[i+1]-H[i-1])/2*S/2*amp,gz=(H[i+w]-H[i-w])/2*S/2*amp;N[o]=cl(gx*.5+.5,0,1)*255;N[o+1]=cl(gz*.5+.5,0,1)*255}
function* craterCell(A,N,v){const r=seeded(31+v*977),ph=[r()*6.3,r()*6.3],ox=r()*50,oy=r()*50,w=SA+2,H=new Float32Array(w*w);
 const hf=(x,z)=>{const rho=Math.hypot(x,z),th=Math.atan2(z,x),k=1+.13*Math.sin(th*3+ph[0])+.07*Math.sin(th*5+ph[1])+.16*(fb(ox+x*1.7,oy+z*1.7)-.5),q=rho/k;
  const t=Math.min(1,q/.36),bowl=q<.36?-.16*(1-t*t):0,rim=Math.exp(-(((q-.43)/.09)**2))*.05,ap=.014*(fb(ox+x*6,oy+z*6)-.4)*sstep(.95,.4,q);return bowl+rim+ap};
 const cx=(v&1)*SA,cy=(v>>1)*SA;
 for(let rr=0;rr<SA+2;rr++){for(let c=0;c<SA+2;c++)H[rr*w+c]=hf((c-1+.5)/SA*2-1,(rr-1+.5)/SA*2-1);if((rr&31)===31)yield}
 for(let rr=0;rr<SA;rr++){for(let c=0;c<SA;c++){const x=(c+.5)/SA*2-1,z=(rr+.5)/SA*2-1,rho=Math.hypot(x,z),th=Math.atan2(z,x),k=1+.13*Math.sin(th*3+ph[0])+.07*Math.sin(th*5+ph[1])+.16*(fb(ox+x*1.7,oy+z*1.7)-.5),q=rho/k,
   core=1-sstep(.2,.4,q),mid=1-sstep(.3,.78,q),ray=fb(th*2.2+ox,q*3.5+oy),gr=.85+.3*fb(x*9+ox,z*9+oy),lt=sstep(.45,.9,q)*(1-sstep(.7,1,q))*sstep(.35,.7,ray);
   let R=22+(52-22)*mid,G=17+(38-17)*mid,B=13+(27-13)*mid;R+=(76-R)*lt;G+=(62-G)*lt;B+=(48-B)*lt;R*=gr;G*=gr;B*=gr;
   const a=(1-sstep(.55,.98,q))*(.62+.38*mid)*(1-.3*sstep(.5,.9,q)*(1-ray))+core*.35,o=((cy+rr)*WA+cx+c)*4;
   A[o]=R;A[o+1]=G;A[o+2]=B;A[o+3]=cl(a,0,1)*255;
   slopes(H,SA,N,o,c,rr,1.0);N[o+2]=255*(1-.5*(1-sstep(0,.42,q)));N[o+3]=255}
  if((rr&31)===31)yield}}
// rubble: a spill of broken plaster, brick, roof tile and charred wood on an ash-dark ground, stretched to the house plan
function* rubbleCell(A,N,v){const r=seeded(57+v*1319),w=SA+2,H=new Float32Array(w*w),C=new Float32Array(SA*SA*4),ox=r()*50,oy=r()*50;
 const PAL=[[168,160,146],[158,150,136],[112,64,50],[100,58,46],[72,78,82],[26,22,20],[118,116,110],[140,126,104]];
 for(let rr=0;rr<SA;rr++){for(let c=0;c<SA;c++){const x=(c+.5)/SA*2-1,z=(rr+.5)/SA*2-1,e=Math.max(Math.abs(x)-.7,Math.abs(z)-.72)+.16*(fb(ox+x*2,oy+z*2)-.5),b=1-sstep(-.12,.2,e),i=(rr*SA+c)*4,gr=.8+.4*fb(x*8+ox,z*8+oy);
   C[i]=34*gr;C[i+1]=31*gr;C[i+2]=28*gr;C[i+3]=b*.82}if((rr&63)===63)yield}
 for(let n=0;n<150;n++){const px=(r()+r()+r()-1.5)*.6,pz=(r()+r()+r()-1.5)*.6,hw=(.035+r()*r()*.16)*SA/2,hh=(.03+r()*r()*.13)*SA/2,an=r()*3.1416,col=PAL[r()*PAL.length|0],ca=Math.cos(an),sa=Math.sin(an),ht=.02+r()*.1+hw*hh/(SA*SA)*30,
   cx0=(px+1)/2*SA,cz0=(pz+1)/2*SA,R=Math.ceil(Math.hypot(hw,hh))+1,sh=.8+r()*.3;
  for(let rr=Math.max(0,Math.floor(cz0-R));rr<Math.min(SA,cz0+R);rr++)for(let c=Math.max(0,Math.floor(cx0-R));c<Math.min(SA,cx0+R);c++){const dx=c+.5-cx0,dz=rr+.5-cz0,u=dx*ca+dz*sa,t=-dx*sa+dz*ca;if(Math.abs(u)>hw||Math.abs(t)>hh)continue;
   const e=Math.min(1-Math.abs(u)/hw,1-Math.abs(t)/hh),i=(rr*SA+c)*4,hi=(rr+1)*w+c+1,hv=ht*Math.min(1,e*3.5+.25),ed=.62+.38*Math.min(1,e*5);C[i]=col[0]*sh*ed;C[i+1]=col[1]*sh*ed;C[i+2]=col[2]*sh*ed;C[i+3]=1;H[hi]=hv}
  if((n&63)===63)yield}
 const cx=(v&1)*SA,cy=(v>>1)*SA;
 for(let rr=0;rr<SA;rr++){for(let c=0;c<SA;c++){const i=(rr*SA+c)*4,o=((cy+rr)*WA+cx+c)*4;A[o]=C[i];A[o+1]=C[i+1];A[o+2]=C[i+2];A[o+3]=C[i+3]*255;slopes(H,SA,N,o,c,rr,1.6);N[o+2]=255*(.78+.22*cl(H[(rr+1)*w+c+1]/.08,0,1));N[o+3]=255}
  if((rr&63)===63)yield}}
// burn: no colour here, the shader colours it. R = the order the ground ignites in (0 centre .. 1 edge, ragged), G = ash noise, B = streaks along the wind, A = the patch
function* burnCell(A,v){const r=seeded(91+v*733),ph=[r()*6.3,r()*6.3],ox=r()*50,oy=r()*50,cx=(v&1)*SA,cy=(v>>1)*SA;
 for(let rr=0;rr<SA;rr++){for(let c=0;c<SA;c++){const x=(c+.5)/SA*2-1,z=(rr+.5)/SA*2-1,rho=Math.hypot(x,z),th=Math.atan2(z,x),k=1+.18*Math.sin(th*2+ph[0])+.1*Math.sin(th*3+ph[1])+.22*(fb(x*2+ox,z*2+oy)-.5),q=rho/k,
   t=cl(q+.16*(fb(x*5+oy,z*5+ox)-.5),0,1),o=((cy+rr)*WA+cx+c)*4;A[o]=t*255;A[o+1]=fb(x*7+ox,z*7+oy)*255;A[o+2]=nz(x*3.5+ox,z*16+oy)*255;A[o+3]=(1-sstep(.8,1,q))*(.88+.12*fb(x*3,z*3))*255}
  if((rr&31)===31)yield}}

// ---------- the shaders: a standard material whose vertices are laid on the terrain ----------
const VS_PARS=`
attribute vec4 aS;attribute vec4 aP;attribute vec4 aF;
uniform highp sampler2D hTex;uniform sampler2D nTex;uniform vec4 uGrid;uniform vec4 uCam;
varying vec2 vA;varying vec2 vR;varying vec4 vK;varying vec3 vT;varying vec3 vB;varying vec3 vWP;varying float vNS;`;
// aS: centre x z, half extents; aP: yaw, variant, spread, ember; aF: centre height, fade, -, shown. uGrid: -half, 1/spacing, nodes, grid cells per side. uCam: pixels per radian, fade distance
const VS_NORMAL=`
vec3 sc_c=vec3(aS.x,aF.x,aS.y);float sc_dist=distance(cameraPosition,sc_c),sc_rad=max(aS.z,aS.w);
float sc_k=clamp(sqrt(sc_rad*.25),.8,2.2),sc_fd=1.-smoothstep(uCam.y*sc_k*.62,uCam.y*sc_k,sc_dist),sc_pr=sc_rad*uCam.x/max(sc_dist,1.);
float sc_fade=aF.y*aF.w*sc_fd*smoothstep(.6,1.8,sc_pr);
vec4 sc_cc=projectionMatrix*viewMatrix*vec4(sc_c,1.);
if(sc_fade<.004||sc_cc.w<-sc_rad||abs(sc_cc.x)>sc_cc.w+sc_rad*projectionMatrix[0][0]||abs(sc_cc.y)>sc_cc.w+sc_rad*projectionMatrix[1][1]){gl_Position=vec4(0.,0.,2.,1.);return;}
float sc_yw=aP.x,sc_co=cos(sc_yw),sc_si=sin(sc_yw);
vec2 sc_l=position.xy*aS.zw,sc_w=vec2(aS.x+sc_l.x*sc_co-sc_l.y*sc_si,aS.y+sc_l.x*sc_si+sc_l.y*sc_co);
vec2 sc_g=clamp((sc_w-uGrid.x)*uGrid.y,vec2(0.),vec2(uGrid.z-1.001));
ivec2 sc_i=ivec2(sc_g);vec2 sc_f=sc_g-vec2(sc_i);
float sc_a=texelFetch(hTex,sc_i,0).r,sc_d=texelFetch(hTex,sc_i+ivec2(1,0),0).r,sc_b=texelFetch(hTex,sc_i+ivec2(0,1),0).r,sc_e=texelFetch(hTex,sc_i+ivec2(1,1),0).r;
float sc_h=sc_f.x+sc_f.y<=1.?sc_a+(sc_d-sc_a)*sc_f.x+(sc_b-sc_a)*sc_f.y:sc_e+(sc_b-sc_e)*(1.-sc_f.x)+(sc_d-sc_e)*(1.-sc_f.y);
vec3 sc_N=normalize(texture2D(nTex,(sc_g+.5)/uGrid.z).xyz*2.-1.);
float sc_lift=.03+.05*2.*sc_rad/uGrid.w+sc_dist*2.4e-4;  /* a margin that grows with distance: a 16-bit depth buffer is 8 cm coarse at 500 m */
vec3 sc_P=vec3(sc_w.x,sc_h,sc_w.y)+sc_N*sc_lift;
vec3 sc_Tw=vec3(sc_co,0.,sc_si),sc_T=normalize(sc_Tw-sc_N*dot(sc_Tw,sc_N));
vT=mat3(viewMatrix)*sc_T;vB=mat3(viewMatrix)*cross(sc_T,sc_N);vWP=sc_P;
vA=(vec2(mod(aP.y,2.),floor(aP.y/2.))+(position.xy*.5+.5)*.96+.02)*.5;vR=position.xy;vK=vec4(sc_fade,aP.z,aP.w,0.);vNS=1.-smoothstep(120.,420.,sc_dist);
vec3 objectNormal=sc_N;`;
const FS_PARS=`
uniform sampler2D dTex;uniform float uSnow;uniform float uTime;uniform float uNS;
varying vec2 vA;varying vec2 vR;varying vec4 vK;varying vec3 vT;varying vec3 vB;varying vec3 vWP;varying float vNS;`;
const FS_MAP=`
 float fq=max(length(dFdx(vWP.xz)),length(dFdy(vWP.xz))),gw=1.-smoothstep(.04,.14,fq);
 float g1=mix(.5,texture2D(dTex,vWP.xz/7.).r,gw),g2=mix(.5,texture2D(dTex,vWP.xz/53.+.37).g,gw);  /* the terrain's own grain, so a scar is not smoother than the ground it lies on */
#ifdef SC_BURN
 vec4 bt=texture2D(map,vA);float pe=vK.y*1.1,sc_ed=1.-smoothstep(.82,1.,length(vR));
 float burnt=1.-smoothstep(pe-.09,pe,bt.r),since=clamp((pe-bt.r)/.5,0.,1.);
 vec3 fresh=vec3(.11,.065,.035),old=vec3(.032,.028,.026),ash=vec3(.09,.085,.08);
 vec3 bc=mix(fresh,old,since);bc=mix(bc,ash,smoothstep(.62,.9,bt.g)*since*.4)*(.78+.44*bt.b)*(.74+.52*g1)*(.88+.24*g2);
 diffuseColor.rgb=bc;diffuseColor.a*=bt.a*burnt*sc_ed*(.84-.1*bt.b)*vK.x*(1.-.55*uSnow);
#else
 vec4 tc=texture2D(map,vA);float sc_ed=1.-smoothstep(.8,1.,SC_EDGE);
 diffuseColor.rgb*=tc.rgb*(.82+.36*g1)*(.88+.24*g2);diffuseColor.a*=tc.a*sc_ed*vK.x*(1.-.55*uSnow);
#endif`;
const FS_NORMAL=`
#ifndef SC_BURN
 vec4 nt=texture2D(normalMap,vA);vec2 sl=(nt.rg*2.-1.)*uNS*vNS;normal=normalize(normal-sl.x*vT-sl.y*vB);diffuseColor.rgb*=mix(1.,nt.b,vNS);
#endif`;
const FS_EMIT=`
#include <emissivemap_fragment>
#ifdef SC_BURN
 {float bd=pe-bt.r,band=smoothstep(0.,.04,bd)*(1.-smoothstep(.04,.18,bd)),fl=.7+.3*sin(uTime*7.+bt.g*40.)*sin(uTime*4.3+bt.b*31.);totalEmissiveRadiance+=vec3(1.,.34,.07)*band*vK.z*fl*burnt*.75;}
#endif`;

// ---------- one scar type: a pool of slots, the instance attributes, the mesh ----------
class Pool{
 constructor(kind,THREE,U,maps,hTex,nTex){const cap=this.cap=CAP[kind],res=RES[kind];this.kind=kind;this.res=res;
  this.st=new Uint8Array(cap);this.fade=new Float32Array(cap);this.want=new Float32Array(cap);this.pf=new Float32Array(cap);this.glow=new Float32Array(cap);this.ft=new Float32Array(cap);
  this.xq=new Uint16Array(cap);this.zq=new Uint16Array(cap);this.sq=new Uint8Array(cap);this.vq=new Uint8Array(cap);this.yq=new Uint8Array(cap);this.aq=new Uint8Array(cap);
  this.aS=new Float32Array(cap*4);this.aP=new Float32Array(cap*4);this.aF=new Float32Array(cap*4);this.q=[];this.hw=0;this.n=0;this.nd=0;this.sp=0;this.dirty=false;
  const n=res+1,P=new Float32Array(n*n*3),Uv=new Float32Array(n*n*2),I=new Uint16Array(res*res*6);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const o=j*n+i;P[o*3]=i/res*2-1;P[o*3+1]=j/res*2-1;Uv[o*2]=i/res;Uv[o*2+1]=j/res}
  for(let j=0,k=0;j<res;j++)for(let i=0;i<res;i++){const a=j*n+i;I[k++]=a;I[k++]=a+n;I[k++]=a+1;I[k++]=a+1;I[k++]=a+n;I[k++]=a+n+1}
  const g=this.geo=new THREE.InstancedBufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('uv',new THREE.BufferAttribute(Uv,2));g.setIndex(new THREE.BufferAttribute(I,1));
  this.at=[this.aS,this.aP,this.aF].map((a,i)=>{const b=new THREE.InstancedBufferAttribute(a,4);b.setUsage(THREE.DynamicDrawUsage);g.setAttribute(['aS','aP','aF'][i],b);return b});g.instanceCount=0;
  const uG={value:new THREE.Vector4(-HALF,1,1,res)};this.uGrid=uG;
  const m=this.mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,alphaTest:.02,map:maps[0],normalMap:kind===1?null:maps[1]});
  const def=kind===1?'#define SC_BURN\n':`#define SC_EDGE ${kind===2?'max(abs(vR.x),abs(vR.y))':'length(vR)'}\n`;
  m.customProgramCacheKey=()=>'scars'+kind;
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);sh.uniforms.hTex={value:hTex};sh.uniforms.nTex={value:nTex};sh.uniforms.uGrid=uG;
   sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>'+VS_PARS).replace('#include <beginnormal_vertex>',VS_NORMAL).replace('#include <begin_vertex>','vec3 transformed=sc_P;');
   sh.fragmentShader=def+sh.fragmentShader.replace('#include <common>','#include <common>'+FS_PARS).replace('#include <map_fragment>',FS_MAP).replace('#include <normal_fragment_maps>',FS_NORMAL).replace('#include <emissivemap_fragment>',FS_EMIT)};
  const me=this.mesh=new THREE.Mesh(g,m);me.frustumCulled=false;me.matrixAutoUpdate=false;me.receiveShadow=true;me.castShadow=false;me.renderOrder=ORD[kind];me.visible=false;me.userData.scars=kind}
 // quantised record -> instance data
 put(i,xq,zq,sq,vq,yq,pq,aq,gh,fade){const k=this.kind,x=dpos(xq),z=dpos(zq),r=dsz(sq),yaw=yq/32*Math.PI*2;
  this.xq[i]=xq;this.zq[i]=zq;this.sq[i]=sq;this.vq[i]=vq;this.yq[i]=yq;this.aq[i]=aq;this.pf[i]=pq/31;this.glow[i]=k===1&&pq<31?1:0;this.ft[i]=rr();
  const o=i*4,sx=k===1?r*1.3:k===2?r*.74:r,sz=k===1?r*.85:r;
  this.aS[o]=x;this.aS[o+1]=z;this.aS[o+2]=sx;this.aS[o+3]=sz;this.aP[o]=yaw;this.aP[o+1]=vq;this.aP[o+2]=pq/31;this.aP[o+3]=this.glow[i];this.aF[o]=gh(x,z);this.aF[o+1]=fade;this.aF[o+2]=0;this.aF[o+3]=1;
  this.st[i]=1;this.fade[i]=fade;this.want[i]=1;if(i>=this.hw){this.hw=i+1;this.geo.instanceCount=this.hw}this.n++;this.dirty=true}
 slot(){for(let k=0;k<this.cap;k++){const i=(this.sp+k)%this.cap;if(!this.st[i]){this.sp=i+1;return i}}return-1}
 // what to let go first: the oldest and smallest (a burn still spreading is spared); recycle score
 score(i){return this.aq[i]+(1-this.sq[i]/63)*4-(this.kind===1&&this.pf[i]<1?3:0)}
 victim(){let b=-1,bs=-1e9;for(let i=0;i<this.hw;i++)if(this.st[i]===1){const s=this.score(i);if(s>bs){bs=s;b=i}}return b}
 free(i){if(this.st[i]===2)this.nd--;this.st[i]=0;this.aF[i*4+1]=0;this.n--;while(this.hw>0&&!this.st[this.hw-1])this.hw--;this.geo.instanceCount=this.hw;this.dirty=true;
  if(this.q.length){const a=this.q.shift();this.put(i,...a)}}
 drop(i){this.st[i]=2;this.want[i]=0;this.nd++}  /* fades out; its slot is free when it is gone */
 // add; returns the slot, -2 when it waits for a slot to fade out, -1 when refused (rubble is never recycled)
 add(xq,zq,sq,vq,yq,pq,aq,gh,fade=0){const i=this.slot();if(i>=0){this.put(i,xq,zq,sq,vq,yq,pq,aq,gh,fade);return i}
  if(this.kind===2)return-1;
  if(this.nd<=this.q.length){const v=this.victim();if(v<0)return-1;this.drop(v)}  /* a slot already fading is spoken for by whoever waits; else one more victim */
  this.q.push([xq,zq,sq,vq,yq,pq,aq,gh,fade]);return-2}  /* one fading slot per waiting scar, so the queue can never outgrow the cap */
 clear(){this.st.fill(0);this.aF.fill(0);this.q.length=0;this.hw=this.n=this.nd=this.sp=0;this.geo.instanceCount=0;this.dirty=true}
 // fade in / out, spread; dt in seconds, run: the spread advances; returns true when the ground state changed (a slot was released)
 update(dt,run){let ch=false;
  for(let i=0;i<this.hw;i++){if(!this.st[i])continue;const o=i*4;let f=this.fade[i];const w=this.want[i];
   if(f!==w){f=w>f?Math.min(w,f+dt*3):Math.max(w,f-dt*.85);this.fade[i]=f;this.aF[o+1]=f;this.dirty=true;if(this.st[i]===2&&f<=0){this.free(i);ch=true;continue}}
   if(this.kind===1&&this.st[i]===1){let p=this.pf[i];if(p<1&&run){p=Math.min(1,p+dt/burnTime(dsz(this.sq[i])));this.pf[i]=p;this.aP[o+2]=p;this.dirty=true}
    if(p>=1&&this.glow[i]>0){this.glow[i]=Math.max(0,this.glow[i]-dt/4);this.aP[o+3]=this.glow[i];this.dirty=true}}}
  return ch}
 flush(){if(!this.dirty)return;this.dirty=false;for(const a of this.at)a.needsUpdate=true}
}

export function initScars(api,G,Z){
 const {THREE,scene,camera,renderer,gh,SITES,FOBS,PADP}=api,V3=THREE.Vector3;
 const terrain=scene.children.find(o=>o.isMesh&&o.material?.userData?.snow);
 const sc=Z.sc={ready:false,off:!terrain,TYPES,CAP,cRev:-1,worst:0};
 if(!terrain){console.warn('scars: no terrain mesh found');return sc}
 const U={dTex:{value:detailTex()},uSnow:terrain.material.userData.snow,uTime:{value:0},uNS:{value:1.1},uCam:{value:new THREE.Vector4(500,gfx.k.scFar||1100,0,0)}};
 let P=[],MAPS=null,hTex=null,nTex=null,jobs=null,built=false,inited=false,TWd=9000,N=361,rev=0,sent=-1,sentT=0;

 // ---------- built on first need (Zombies chosen, or a sector starting): the terrain's heights and smooth normals as textures, the atlases, the pools ----------
 /* the two textures are made at once, empty (the pools hold them); the first job of the build fills them, 32 thousand heights or 32 rows of normals a slice, and they go to the GPU when it is done.
    The whole of this used to run in one go (about 20 ms), and the warm-up's scar step ran every job in one go (250 ms in one idle slice, a stall of the menu) */
 function terrainTex(){const g=terrain.geometry,pa=g.attributes.position,gp=g.parameters;N=gp.widthSegments+1;TWd=gp.width;const n=N*N,Hh=new Float32Array(n),Nn=new Uint8Array(n*4),seg=TWd/(N-1);
  hTex=new THREE.DataTexture(Hh,N,N,THREE.RedFormat,THREE.FloatType);hTex.minFilter=hTex.magFilter=THREE.NearestFilter;hTex.generateMipmaps=false;
  nTex=new THREE.DataTexture(Nn,N,N,THREE.RGBAFormat);nTex.minFilter=nTex.magFilter=THREE.LinearFilter;nTex.generateMipmaps=false;
  return(function*(){
   for(let k=0;k<n;k++){Hh[k]=pa.getY(k);if((k&32767)===32767)yield}
   for(let j=0;j<N;j++){for(let i=0;i<N;i++){const i1=Math.min(N-1,i+1),i0=Math.max(0,i-1),j1=Math.min(N-1,j+1),j0=Math.max(0,j-1),dx=(Hh[j*N+i1]-Hh[j*N+i0])/((i1-i0)*seg),dz=(Hh[j1*N+i]-Hh[j0*N+i])/((j1-j0)*seg),l=Math.hypot(dx,1,dz),o=(j*N+i)*4;
     Nn[o]=(-dx/l*.5+.5)*255;Nn[o+1]=(1/l*.5+.5)*255;Nn[o+2]=(-dz/l*.5+.5)*255;Nn[o+3]=255}
    if((j&31)===31)yield}
   hTex.needsUpdate=true;nTex.needsUpdate=true})()}
 const mkTex=srgb=>{const t=new THREE.DataTexture(new Uint8Array(WA*WA*4),WA,WA,THREE.RGBAFormat);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;return t};
 function init(){if(inited)return;inited=true;const tj=terrainTex();
  NT=new Float32Array(65536);{const r=seeded(917);for(let i=0;i<NT.length;i++)NT[i]=r()}
  MAPS=[[mkTex(true),mkTex(false)],[mkTex(false),null],[mkTex(true),mkTex(false)]];jobs=[tj];
  for(let v=0;v<4;v++)jobs.push(craterCell(MAPS[0][0].image.data,MAPS[0][1].image.data,v),burnCell(MAPS[1][0].image.data,v),rubbleCell(MAPS[2][0].image.data,MAPS[2][1].image.data,v));
  P=[0,1,2].map(k=>new Pool(k,THREE,U,MAPS[k],hTex,nTex));
  for(const p of P){p.uGrid.value.set(-TWd/2,(N-1)/TWd,N,p.res);scene.add(p.mesh)}sc.pools=P}
 /* one slice of the texture build (a few ms); true when finished */
 function pump(){if(built)return true;if(!jobs.length){built=true;NT=null;for(const m of MAPS)for(const t of m)if(t)t.needsUpdate=true;
  for(const t of[hTex,nTex,...MAPS.flat()])if(t)later(()=>{upload(renderer,t)},{heavy:true});  /* one texture a slice, in idle time, not in the frame that first draws a crater */
  sc.ready=true;for(const p of P)p.dirty=true;rank();vis();return true}
  const t0=performance.now();if(jobs[0].next().done)jobs.shift();sc.worst=Math.max(sc.worst,performance.now()-t0);return false}  /* worst: the longest slice of the build, ms */
 const slice=()=>{if(!pump())later(slice,{heavy:true})};
 let started=false;const start=()=>{if(started)return;started=true;init();later(slice,{heavy:true})};
 const ensure=()=>{init();while(!pump());};
 setTimeout(start,500);  /* from the menu, once the page has settled (the warm-up, zwarm.js, starts the same way) */
 warmers.push(()=>{init();return P.map(p=>p.mesh)});  /* the pools' programs are compiled with the rest; the textures are built in their own slices (start above), not here */

 // ---------- placement rules ----------
 const sol=()=>[PADP,...SITES,...FOBS];
 const nrmY=(x,z)=>{const a=gh(x+3,z)-gh(x-3,z),b=gh(x,z+3)-gh(x,z-3);return 1/Math.hypot(a/6,1,b/6)};
 /* how far the nearest enemy supply road (zsites.js, a ribbon 7.2 m wide laid .35 m above the ground) is: a scar under it would be cut off along its edge */
 const roadGap=(x,z)=>{let d=1e9;const L=Z.so?.W?.routes;if(L)for(const r of L){const X=r.X,Zs=r.Z;for(let i=0;i<X.length-1;i++){const ax=X[i],az=Zs[i],bx=X[i+1]-ax,bz=Zs[i+1]-az,l=bx*bx+bz*bz,t=l>0?cl(((x-ax)*bx+(z-az)*bz)/l,0,1):0,dx=x-ax-t*bx,dz=z-az-t*bz,q=dx*dx+dz*dz;if(q<d)d=q}}return Math.sqrt(d)};
 /* not on the river, a steep slope or the defended ground (the sites' own meshes are their rubble), nor outside the map, nor reaching an enemy road (R: how far it extends) */
 const bad=(x,z,R)=>{if(!(Math.abs(x)<=4400&&Math.abs(z)<=4400&&gh(x,z)>=-9.5&&nrmY(x,z)>=.82))return true;for(const s of sol())if(Math.hypot(x-s.x,z-s.z)<s.r+R*.7+3)return true;return roadGap(x,z)<3.6+R+1};
 let tok=8;  /* scars allowed right now: refilled 3 a second of frame time, 8 at most */
 const live=()=>sc.ready&&G.on&&!api.demo&&!Z.mirror;
 const add=(t,x,z,r,v,yq,pq,aq,fade)=>P[t].add(qpos(x),qpos(z),qsz(r),v,yq,pq,aq,gh,fade);
 sc.add=(t,x,z,r,o={})=>{ensure();rev++;return add(t,x,z,r,o.v??(rr()*4|0),o.y??(rr()*32|0),o.p??31,o.a??0,o.fade??0)};
 // ---- village houses: the instanced walls and roofs. A destroyed one is zero-scaled (shadow too) and its collider lifted away; rubble stands in its place ----
 let HS=null;
 function houses(){if(HS)return HS;const L=scene.children.filter(m=>m.userData.house),w=L[0],r=L[1],col=scene.userData.hcol;if(!w||!r||!col)return HS={n:0};
  const n=w.count,x=new Float32Array(n),z=new Float32Array(n),yw=new Float32Array(n),e=w.instanceMatrix.array;
  for(let i=0;i<n;i++){x[i]=e[i*16+12];z[i]=e[i*16+14];yw[i]=Math.atan2(e[i*16+2],e[i*16])}
  return HS={n,w,r,col,x,z,yw,dead:new Uint8Array(n),sv:new Float32Array(CAP[2]*34),slot:new Int16Array(n).fill(-1),used:0}}
 function houseNear(x,z,m){const h=houses();let b=-1,bd=m;for(let i=0;i<h.n;i++){const d=Math.hypot(h.x[i]-x,h.z[i]-z);if(d<bd){bd=d;b=i}}return b}
 function houseDown(i){const h=houses();if(!h.n||h.dead[i]||h.used>=CAP[2])return false;const o=h.used*34;h.dead[i]=1;h.slot[i]=h.used++;
  for(const[m,q]of[[h.w,0],[h.r,16]]){const a=m.instanceMatrix.array;for(let k=0;k<16;k++)h.sv[o+q+k]=a[i*16+k];for(let k=0;k<12;k++)a[i*16+k]=0;m.instanceMatrix.needsUpdate=true}
  h.sv[o+32]=h.col[i].y;h.col[i].y=1e6;return true}
 function housesBack(){const h=HS;if(!h||!h.n)return;for(let i=0;i<h.n;i++){if(!h.dead[i])continue;const o=h.slot[i]*34;
  for(const[m,q]of[[h.w,0],[h.r,16]]){const a=m.instanceMatrix.array;for(let k=0;k<16;k++)a[i*16+k]=h.sv[o+q+k];m.instanceMatrix.needsUpdate=true}h.col[i].y=h.sv[o+32];h.dead[i]=0;h.slot[i]=-1}h.used=0}
 const rubbleAt=(i,fade)=>{const h=houses();return P[2].add(qpos(h.x[i]),qpos(h.z[i]),qsz(7.4),rr()*4|0,Math.round(((h.yw[i]/(Math.PI*2))%1+1)%1*32)&31,31,0,gh,fade)};

 // ---------- explosions: the one hook (Z.flash) ----------
 function craterAt(x,z,k){const R=cl((1.8+2.4*k**.85)*rnd(.88,1.12),2,16),p=P[0];
  for(let i=0;i<p.hw;i++)if(p.st[i]===1){const r0=dsz(p.sq[i]);if(Math.hypot(dpos(p.xq[i])-x,dpos(p.zq[i])-z)<.25*(R+r0)&&Math.abs(R-r0)<.4*Math.max(R,r0)){p.aq[i]=0;return}}  /* on top of one of the same size: that one is fresh again */
  add(0,x,z,R,rr()*4|0,rr()*32|0,31,0,0);rev++}
 function burnAt(x,z,k){const Rf=Math.min(cl((7+6*k**.8)*flamAt(x,z),0,30),(roadGap(x,z)-4.6)/1.3);if(Rf<5)return;  /* a fire stops short of a road */
  const p=P[1];for(let i=0;i<p.hw;i++)if(p.st[i]===1){const r0=dsz(p.sq[i]);if(Math.hypot(dpos(p.xq[i])-x,dpos(p.zq[i])-z)<.7*r0*p.pf[i]+.4*Rf)return}  /* scorched ground does not catch again */
  const wb=api.WB,yq=Math.round(((Math.atan2(wb.z,wb.x)/(Math.PI*2))%1+1)%1*32)&31;add(1,x,z,Rf,rr()*4|0,yq,Math.round(Math.min(.35,3.2/Rf)*31),0,0);rev++}
 function onBoom(p,k){if(!live()||!(k>=.3))return;const x=p.x,z=p.z;if(!(p.y-gh(x,z)<=1+2.2*k))return;  /* (written so that a NaN anywhere makes nothing) */
  if(tok<1)return;tok--;
  if(k>=1){const h=houses(),rb=7.5+2*k**.8;for(let i=0,c=0;i<h.n&&c<4;i++)if(!h.dead[i]&&Math.hypot(h.x[i]-x,h.z[i]-z)<rb&&rr()<cl((k-.5)/1.5,0,1)&&roadGap(h.x[i],h.z[i])>12&&houseDown(i)){rubbleAt(i,0);c++;rev++}}
  const R=cl(1.8+2.4*k**.85,2,16);if(!bad(x,z,R*1.12)){craterAt(x,z,k);if(k>=1.2&&rr()<cl((k-.8)/1.2,0,1))burnAt(x,z,k)}
  rank()}
 const f0=Z.flash;Z.flash=(p,k)=>{f0(p,k);onBoom(p,k)};
 sc.boom=(p,k)=>{ensure();onBoom(p,k)};

 // ---------- what is shown (quality), save and load ----------
 const ord=[new Int16Array(CAP[0]),new Int16Array(CAP[1]),new Int16Array(CAP[2])];
 function rank(){const k=gfx.k,fr=k.scar??1;U.uCam.value.y=k.scFar||1100;
  for(let t=0;t<P.length;t++){const p=P[t],K=t===2?CAP[2]:Math.max(1,Math.floor(CAP[t]*fr)),o=ord[t];let m=0;
   for(let i=0;i<p.hw;i++)if(p.st[i]){let j=m++;const s=p.score(i);while(j>0&&p.score(o[j-1])>s){o[j]=o[j-1];j--}o[j]=i}
   for(let j=0;j<m;j++)p.aF[o[j]*4+3]=j<K?1:0;p.dirty=true}}
 gfx.on(()=>rank());
 function vis(){const on=sc.ready&&G.on;for(const p of P)p.mesh.visible=on&&p.hw>0}
 const recs=()=>{const R=[];for(let t=0;t<P.length;t++){const p=P[t];for(let i=0;i<p.hw;i++)if(p.st[i]===1)R.push([t,p.xq[i],p.zq[i],p.sq[i],p.vq[i],p.yq[i],Math.round(p.pf[i]*31),p.aq[i]])}return R};
 const encode=()=>pack(recs());
 function clear(){for(const p of P)p.clear();housesBack();rev++;vis()}
 /* replace everything with the records; settle: burns long burnt out; fade: the new ones fade in */
 function load(s,{settle=false,fade=false}={}){ensure();const R=unpack(s);clear();const f=fade?0:1;
  for(const[t,x,z,sq,v,y,pq,aq]of R){const X=dpos(x),Z0=dpos(z);
   if(t===2){const i=houseNear(X,Z0,5);if(i>=0&&houseDown(i))P[2].add(qpos(houses().x[i]),qpos(houses().z[i]),sq,v,y,pq,aq,gh,f);continue}
   if(!bad(X,Z0,dsz(sq)*(t===1?1.3:1)))P[t].add(x,z,sq,v,y,t===1&&settle?31:pq,aq,gh,f)}
  rank();vis();rev++}
 /* merge a snapshot into the live set: what is there stays (no re-fade), what is new fades in, what is gone fades out */
 function apply(s){ensure();const R=unpack(s),key=(t,x,z)=>t<<24|x<<12|z,want=new Map();for(const r of R)want.set(key(r[0],r[1],r[2]),r);
  for(let t=0;t<3;t++){const p=P[t];for(let i=0;i<p.hw;i++)if(p.st[i]===1){const k=key(t,p.xq[i],p.zq[i]),r=want.get(k);
   if(r){want.delete(k);if(t===1&&Math.abs(p.pf[i]-r[6]/31)>.2){p.pf[i]=p.aP[i*4+2]=r[6]/31;p.dirty=true}}else p.drop(i)}}
  for(const[t,x,z,sq,v,y,pq,aq]of want.values()){
   if(t===2){const i=houseNear(dpos(x),dpos(z),5);if(i>=0&&houseDown(i))P[2].add(qpos(houses().x[i]),qpos(houses().z[i]),sq,v,y,pq,aq,gh,0);continue}
   P[t].add(x,z,sq,v,y,pq,aq,gh,0)}
  rank();vis()}
 Object.defineProperties(sc,{rev:{get:()=>rev},built:{get:()=>built}});
 Object.assign(sc,{pack,unpack,encode,load,clear,apply,recs,rank,ensure,bad,roadGap,cropAt,flamAt,houses,houseNear,houseDown,housesBack,burnTime,uniforms:U,vis,
  stats:()=>({craters:P[0]?.n|0,burns:P[1]?.n|0,rubble:P[2]?.n|0,hw:P.map(p=>p.hw),shown:P.map(p=>{let n=0;for(let i=0;i<p.hw;i++)if(p.st[i]&&p.aF[i*4+3])n++;return n}),visible:P.map(p=>p.mesh.visible),ready:sc.ready}),
  list:t=>{const p=P[t],o=[];for(let i=0;i<p.hw;i++)if(p.st[i])o.push({i,st:p.st[i],x:dpos(p.xq[i]),z:dpos(p.zq[i]),r:dsz(p.sq[i]),pf:p.pf[i],age:p.aq[i],fade:p.fade[i]});return o}});

 // ---------- per frame: fades, spread, flames at the fronts, upload ----------
 let wave0=-1,st0='';
 const _w=new V3(),_up=new V3(0,4,0);
 function fireFx(dt){const p=P[1],cam=camera.position,lim=900*gfx.k.fxR;let used=0;
  for(let i=0;i<p.hw&&used<6;i++){if(p.st[i]!==1||p.glow[i]<=0||p.fade[i]<.5)continue;const x=p.aS[i*4],z=p.aS[i*4+1];if(Math.abs(x-cam.x)>lim||Math.abs(z-cam.z)>lim)continue;used++;
   if((p.ft[i]-=dt)>0)continue;p.ft[i]=.3+rr()*.5;const a=rr()*6.283,rd=p.pf[i]*.88*Math.sqrt(rr()),lx=Math.cos(a)*rd*p.aS[i*4+2],lz=Math.sin(a)*rd*p.aS[i*4+3],yw=p.aP[i*4],co=Math.cos(yw),si=Math.sin(yw),
    wx=x+lx*co-lz*si,wz=z+lx*si+lz*co;_w.set(wx,gh(wx,wz)+.4,wz);api.FX.emit(_w,0xff7a20,2,3,.5,null,2.2);if(rr()<.35)api.SMK.emit(_w,0x2d2926,1,2,8,_up,1,.5)}}
 /* the end of a wave (or of the run) saves the sector, and a wave older ages every scar a step. Read on every sim step and every frame, against the state the run started in, so a clear that no frame saw is saved all the same */
 function watch(){if(G.state!==st0){st0=G.state;if(st0==='clear'||st0==='over')persist()}
  if(G.wave!==wave0){if(wave0>=0&&G.wave>wave0)for(const p of P)for(let i=0;i<p.hw;i++)if(p.st[i]&&p.aq[i]<15)p.aq[i]++;wave0=G.wave}}
 function tick(dt){if(!sc.ready)return;watch();
  dt=Math.min(dt,.1);tok=Math.min(8,tok+dt*3);const run=!Z.hold?.()&&(!api.menuOpen||!!Z.online);let ch=false;  /* a fire waits while the game is paused or on the base screen (a co-op game keeps running behind its menu) */for(const p of P)ch=p.update(dt,run)||ch;if(ch)rank();
  U.uTime.value=performance.now()/1000%1000;U.uCam.value.x=camera.projectionMatrix.elements[5]*renderer.domElement.height*.5;
  if(run)fireFx(dt);
  for(const p of P)p.flush();vis()}
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);tick(dt)};
 sc.tick=tick;  /* the scars' own part of a frame, for a harness that must not move the rest of the world (weather, clouds) between two frames it compares */
 // ---------- the run: a sector loads its scars, a quick defence starts clean; they are saved at the end of a wave and of the run ----------
 const camp=()=>Z.cp?.run?.id||null,client=()=>!!Z.isClient?.();
 function persist(){const id=camp();if(!id||client()||!sc.ready||!Z.cp?.put)return;const c=Z.cp.C(),str=encode();c.sc={...(c.sc||{})};if(str)c.sc[id]=str;else delete c.sc[id];Z.cp.put(c)}
 sc.persist=persist;sc.refill=()=>{tok=8};
 Z.cpNew=()=>clear();  /* a new campaign (zcampaign.js): what the last run left must not be saved into it */
 const s0=Z.start;Z.start=()=>{if(G.on)persist();  /* a restart on the same sector keeps what the last run left */
  s0();rg=seeded(20241);wave0=G.wave;st0=G.state;tok=8;sent=-1;sc.cRev=-1;ensure();
  const id=client()?null:camp(),s=id?Z.cp.C().sc?.[id]:null;if(s)load(s,{settle:true});else clear();vis()};
 const z1=Z.stop;Z.stop=()=>{persist();clear();z1()};
 const p1=Z.step;Z.step=dt=>{p1(dt);watch()};
 // ---------- co-op: every snapshot carries the revision, the records go out when it changed (at most about once a second) and now and then ----------
 sc.netOut=now=>{if(!sc.ready||!Z.online||Z.mirror)return null;const due=rev!==sent&&now-sentT>900||now-sentT>5000;if(!due)return{r:rev};sentT=now;sent=rev;return{r:rev,d:encode()}};
 sc.netIn=o=>{if(!Z.mirror||!o||typeof o!=='object')return;if(typeof o.d==='string'&&o.r!==sc.cRev){sc.cRev=o.r;apply(o.d)}};
 return sc}
