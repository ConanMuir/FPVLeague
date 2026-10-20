// Shared pooled particles. One Points draw per blend mode (additive fire and sparks, alpha-blended smoke) holds every feature's emitters, instead of
// a Points object, a draw call and a full buffer upload each. The look is three's PointsMaterial unchanged (same map, vertex colours, fog, tone
// mapping, size attenuation); only gl_PointSize takes a per-particle size, so emitters of different sizes share a draw.
//   const pool=particlePool(scene,{max,blend,map,toneMapped,wind})   wind: a Vector3 the particles drift with (read each update)
//   const e=pool.emitter(N,size,grav,drag,scaled=true)               a ring of N particles in the pool, the old psys() interface (scaled: thinned by PFX.scale):
//   e.emit(p,hex,n,spd,life=1,bv=null,k=1,a=1)  n particles at p, random directions at spd*(.3..1) plus bv, colour hex*k, alpha a, life*(.5..1) s
//   e.upd(dt)                                   ages and moves them (only the live window of the ring is touched)
// Each emitter only walks and uploads its live window (oldest live to newest), so an idle emitter costs nothing and a busy one uploads what moved.
// PFX.scale (0..1, default 1) thins every scaled emitter's counts: games/interceptor sets it to the Graphics level's gfx.k.fx (engine/gfx.js).
import * as THREE from 'three';
export const PFX={scale:1};
const _c=new THREE.Color();
export function particlePool(scene,{max,blend=THREE.NormalBlending,map=null,toneMapped=true,wind=null}){
 const P=new Float32Array(max*3).fill(-9999),C=new Float32Array(max*4),S=new Float32Array(max),g=new THREE.BufferGeometry();
 const aP=new THREE.BufferAttribute(P,3),aC=new THREE.BufferAttribute(C,4),aS=new THREE.BufferAttribute(S,1);for(const a of[aP,aC,aS])a.setUsage(THREE.DynamicDrawUsage);
 g.setAttribute('position',aP);g.setAttribute('color',aC);g.setAttribute('psize',aS);g.setDrawRange(0,0);
 const m=new THREE.PointsMaterial({size:1,map,vertexColors:true,transparent:true,blending:blend,depthWrite:false,toneMapped});
 m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('uniform float size;','uniform float size;\nattribute float psize;').replace('gl_PointSize = size;','gl_PointSize = size * psize;')};
 m.customProgramCacheKey=()=>'ppool';
 const pts=new THREE.Points(g,m);pts.frustumCulled=false;pts.matrixAutoUpdate=false;scene.add(pts);
 const E=[];let used=0;
 // dirty slots since the last upload, per emitter (ring counters lo..hi), flushed right before the scene renders
 function flush(){let any=false;for(const e of E){if(e.dlo>=e.dhi)continue;any=true;const N=e.N,n=Math.min(N,e.dhi-e.dlo),a=e.dlo%N,b0=e.base;
   const span=(s,c)=>{aP.addUpdateRange((b0+s)*3,c*3);aC.addUpdateRange((b0+s)*4,c*4);aS.addUpdateRange(b0+s,c)};
   if(a+n<=N)span(a,n);else{span(a,N-a);span(0,n-(N-a))}e.dlo=e.dhi=e.tail}
  if(any)aP.needsUpdate=aC.needsUpdate=aS.needsUpdate=true}
 const ob=scene.onBeforeRender;scene.onBeforeRender=function(...a){ob.apply(this,a);flush()};
 function emitter(N,size,grav=0,drag=0,scaled=true){const base=used;used+=N;if(used>max)throw new Error('particle pool full');g.setDrawRange(0,used);S.fill(size,base,base+N);
  const VV=new Float32Array(N*3),B=new Float32Array(N*4),LF=new Float32Array(N),L0=new Float32Array(N);
  // ring counters: head = next slot to write, tail = oldest that may still live; slot = counter % N
  const e={N,base,head:0,tail:0,dlo:0,dhi:0,frac:0,
   emit(p,hex,n,spd,life=1,bv=null,k=1,a=1){if(scaled&&PFX.scale<1){e.frac+=n*PFX.scale;n=e.frac|0;e.frac-=n}_c.set(hex).multiplyScalar(k);
    for(let j=0;j<n;j++){const i=e.head++%N,q=base+i,i3=i*3,q3=q*3,i4=i*4;if(e.head-e.tail>N)e.tail=e.head-N;
     let x=Math.random()*2-1,y=Math.random()*2-1,z=Math.random()*2-1;const h=Math.sqrt(x*x+y*y+z*z),m=spd*(.3+Math.random()*.7)/(h||1);
     P[q3]=p.x;P[q3+1]=p.y;P[q3+2]=p.z;VV[i3]=x*m+(bv?bv.x:0);VV[i3+1]=y*m+(bv?bv.y:0);VV[i3+2]=z*m+(bv?bv.z:0);B[i4]=_c.r;B[i4+1]=_c.g;B[i4+2]=_c.b;B[i4+3]=a;LF[i]=L0[i]=life*(.5+Math.random()*.5)}
    if(e.dlo>=e.dhi)e.dlo=e.tail;e.dhi=e.head;if(e.head-e.dlo>N)e.dlo=e.head-N},
   upd(dt){if(e.tail>=e.head)return;const dm=Math.exp(-dt*drag),wx=wind?wind.x*(1-dm):0,wz=wind?wind.z*(1-dm):0;
    for(let k=e.tail;k<e.head;k++){const i=k%N;if(LF[i]<=0)continue;const q=base+i,i3=i*3,q3=q*3,i4=i*4,q4=q*4;if((LF[i]-=dt)<=0){P[q3+1]=-9999;C[q4+3]=0;continue}
     VV[i3]=VV[i3]*dm+wx;VV[i3+1]=VV[i3+1]*dm-grav*dt;VV[i3+2]=VV[i3+2]*dm+wz;P[q3]+=VV[i3]*dt;P[q3+1]+=VV[i3+1]*dt;P[q3+2]+=VV[i3+2]*dt;
     const f=Math.min(1,LF[i]/L0[i]*2);C[q4]=B[i4];C[q4+1]=B[i4+1];C[q4+2]=B[i4+2];C[q4+3]=B[i4+3]*f}
    if(e.dlo>=e.dhi)e.dlo=e.tail;e.dhi=e.head;while(e.tail<e.head&&LF[e.tail%N]<=0)e.tail++},
   // everything off at once (a reset), uploaded with the next frame
   clear(){LF.fill(0);for(let i=0;i<N;i++){P[(base+i)*3+1]=-9999;C[(base+i)*4+3]=0}e.dlo=0;e.dhi=N;e.head=N;e.tail=N},
   get live(){let n=0;for(let k=e.tail;k<e.head;k++)if(LF[k%N]>0)n++;return n}};
  E.push(e);return e}
 return{pts,emitter,flush,get used(){return used}}}
