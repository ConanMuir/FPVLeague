// Zombies enemies: instanced rendering for every kind (one draw call per kind and part, however many are in the air), movers for the kinds
// Riley's Shahed code doesn't fly (FPV swarms, ballistic / hypersonic / ICBM tracks), the Mothership boss, and the far-field terrain ring
// that extends the map so the fast threats can start far out.
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {dot,glow} from '../../engine/render.js';
import {fbm,sm} from '../../engine/util.js';
import {warm} from '../../engine/warm.js';
import {KIND,EVADE_SOME} from './zdata.js';
import {hyp} from '../../engine/hot.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a);
export function initEnemies(api,G,Z){
 const {THREE,scene,TH,gh,SHG,SHM,SHJ,SHEN,EXM}=api,V3=THREE.Vector3;
 const _a=new V3(),_b=new V3(),_m=new THREE.Matrix4(),_s=new V3(),_c=new THREE.Color();

 // ---------- geometry: Riley's Shahed parts merged into one mesh per material ----------
 const part=(g,x=0,y=0,z=0,s=1)=>{const c=g.index?g.toNonIndexed():g.clone();for(const k of Object.keys(c.attributes))if(!['position','normal','uv'].includes(k))c.deleteAttribute(k);if(!c.attributes.uv)c.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(c.attributes.position.count*2),2));c.scale(s,s,s);c.translate(x,y,z);return c};
 const merge=a=>mergeGeometries(a);
 const shBody=merge([part(SHG.body),part(SHG.wing),part(SHG.fin,1.25,-.05,0),part(SHG.fin,-1.25,-.05,0)]),shHub=merge([part(SHG.hub,0,0,-1.86)]);
 const jtBody=merge([part(SHG.body),part(SHG.wingJ),part(SHG.fin,1.5,-.05,0),part(SHG.fin,-1.5,-.05,0),part(SHG.pylon,0,.2,-1)]),jtPod=merge([part(SHG.pod,0,.36,-1.05)]),jtEx=merge([part(SHG.ex,0,.36,-1.64)]);
 const cyl=(r0,r1,h,n=12)=>new THREE.CylinderGeometry(r0,r1,h,n).rotateX(Math.PI/2);
 const crBody=merge([part(cyl(.32,.32,5.6),0,0,0),part(new THREE.ConeGeometry(.32,1.2,12).rotateX(Math.PI/2),0,0,3.4),part(new THREE.BoxGeometry(3.2,.05,.7),0,-.1,.2),part(new THREE.BoxGeometry(.05,.8,.6),0,.4,-2.5),part(new THREE.BoxGeometry(1.2,.05,.5),0,0,-2.6)]),crEx=merge([part(cyl(.22,.22,.1),0,0,-2.85)]);
 const fpv=merge([part(new THREE.BoxGeometry(.7,.06,.07)).rotateY(Math.PI/4),part(new THREE.BoxGeometry(.7,.06,.07)).rotateY(-Math.PI/4),part(new THREE.BoxGeometry(.16,.1,.24),0,.05,0)]);
 const balBody=merge([part(cyl(.46,.46,6,14)),part(new THREE.ConeGeometry(.46,1.8,14).rotateX(Math.PI/2),0,0,3.9),part(new THREE.BoxGeometry(1.8,.04,.6),0,0,-2.6),part(new THREE.BoxGeometry(.04,1.8,.6),0,0,-2.6)]);
 const hyBody=merge([part(new THREE.ConeGeometry(1,5,3).rotateX(Math.PI/2).scale(1.3,.35,1))]),rvBody=merge([part(new THREE.ConeGeometry(.6,2.4,14).rotateX(Math.PI/2))]);
 const MAT={decoy:new THREE.MeshStandardMaterial({color:0x9c927a,roughness:.85}),swarm:new THREE.MeshStandardMaterial({color:0x202326,roughness:.6,metalness:.3}),
  heavy:new THREE.MeshStandardMaterial({color:0x2b2f2a,roughness:.5,metalness:.55}),steel:new THREE.MeshStandardMaterial({color:0xb9bcbf,roughness:.35,metalness:.7}),
  heat:new THREE.MeshStandardMaterial({color:0x2a2420,roughness:.4,metalness:.5,emissive:new THREE.Color(0xff6a20),emissiveIntensity:1.2})};
 // per kind: [geometry, material, capacity] parts, and the drawing scale
 const VIS={shahed:{s:1,parts:[[shBody,SHM[1],260,1],[shHub,SHEN,260]]},jet:{s:1,parts:[[jtBody,SHJ,160],[jtPod,SHEN,160],[jtEx,EXM,160]]},decoy:{s:.85,parts:[[shBody,MAT.decoy,160]]},
  heavy:{s:1.45,parts:[[shBody,MAT.heavy,80],[shHub,SHEN,80]]},cruise:{s:1,parts:[[crBody,SHJ,80],[crEx,EXM,80]]},swarm:{s:1,parts:[[fpv,MAT.swarm,700]]},
  ballistic:{s:1,parts:[[balBody,MAT.steel,40]]},hyper:{s:1,parts:[[hyBody,MAT.heat,30]]},icbm:{s:1,parts:[[rvBody,MAT.heat,30]]}};
 const IM={};for(const k in VIS){IM[k]=VIS[k].parts.map(([g,m,n,col])=>{const im=new THREE.InstancedMesh(g,m,n);im.count=0;im.frustumCulled=false;im.castShadow=false;im.userData.col=col;if(col)im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(n*3).fill(1),3);scene.add(im);return im})}
 // bright points: jet and cruise exhausts, re-entry glow of the fast tracks (they stay visible at range)
 const GN=400,gPos=new Float32Array(GN*3),gCol=new Float32Array(GN*3),gGeo=new THREE.BufferGeometry();gGeo.setAttribute('position',new THREE.BufferAttribute(gPos,3));gGeo.setAttribute('color',new THREE.BufferAttribute(gCol,3));
 const gPts=new THREE.Points(gGeo,new THREE.PointsMaterial({size:9,sizeAttenuation:false,vertexColors:true,map:dot,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));gPts.frustumCulled=false;scene.add(gPts);gGeo.setDrawRange(0,0);
 const SHADE=[[1,1,1],[.45,.45,.45],[1.35,1.28,1.15]];

 function visuals(dt){const cnt={};for(const k in IM)cnt[k]=0;let g=0;const cam=api.camera.position;
  for(const t of TH){if(!t.inst||t.st==='dead')continue;const V=VIS[t.k];if(!V)continue;const i=cnt[t.k]++;const ims=IM[t.k];if(i>=ims[0].count&&i>=ims[0].instanceMatrix.count)continue;
   t.mesh.updateMatrix();_m.copy(t.mesh.matrix);if(V.s!==1)_m.scale(_s.setScalar(V.s));for(const im of ims){if(i<im.instanceMatrix.count){im.setMatrixAt(i,_m);if(im.userData.col){const c=SHADE[t.shade|0];im.setColorAt(i,_c.setRGB(c[0],c[1],c[2]))}}}
   const hot=KIND[t.k].armor==='hard'||t.k==='cruise'||t.k==='jet';
   if(hot&&g<GN){gPos[g*3]=t.p.x;gPos[g*3+1]=t.p.y;gPos[g*3+2]=t.p.z;const w=t.k==='jet'?[1,.55,.25]:t.k==='cruise'?[1,.7,.35]:[1,.85,.6];gCol[g*3]=w[0];gCol[g*3+1]=w[1];gCol[g*3+2]=w[2];g++;
    if(KIND[t.k].armor==='hard'&&(t.trl=(t.trl||0)-dt)<=0&&t.p.y<25000&&t.p.distanceTo(cam)<20000){t.trl=.06;api.SMK.emit(t.p,0xd8d4cc,1,2,6,null,1,.55)}}}
  for(const k in IM)for(const im of IM[k]){im.count=Math.min(cnt[k],im.instanceMatrix.count);im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true}
  gGeo.setDrawRange(0,g);gGeo.attributes.position.needsUpdate=gGeo.attributes.color.needsUpdate=true}
 function hide(){for(const k in IM)for(const im of IM[k])im.count=0;gGeo.setDrawRange(0,0)}

 // ---------- movers ----------
 // FPV swarm: each member keeps a loose slot around its group's path, low and weaving, then they all dive on their aim points
 function swarm(t,dt){if(!t.off){t.off=new V3(rnd(-45,45),0,rnd(-45,45));t.ph=Math.random()*6}t.ph+=dt;
  const w=t.wps[0]||t.aim;_a.set(w.x-t.p.x,0,w.z-t.p.z);if(t.wps.length&&_a.length()<250)t.wps.shift();
  const ad=hyp(t.aim.x-t.p.x,t.aim.z-t.p.z);
  if(ad<260||t.st==='dive'){t.st='dive';_a.subVectors(t.aim,t.p);if(_a.length()<4||t.p.y<=gh(t.p.x,t.p.z)+.5){Z.impact(t);return true}_a.normalize().multiplyScalar(t.spd*1.3);t.v.lerp(_a,Math.min(1,dt*3));t.p.addScaledVector(t.v,dt);return true}
  const k=cl(ad/1500,0,1);_a.set(w.x+t.off.x*k-t.p.x,0,w.z+t.off.z*k-t.p.z).normalize();
  _a.x+=Math.sin(t.ph*1.7+t.id)*.35;_a.z+=Math.cos(t.ph*1.3+t.id)*.35;_a.setY(0).normalize().multiplyScalar(t.spd);
  _a.y=cl((gh(t.p.x,t.p.z)+t.alt-t.p.y)*.8,-6,6);t.v.lerp(_a,Math.min(1,dt*2.2));t.p.addScaledVector(t.v,dt).addScaledVector(api.WIND,dt*.4);return true}
 // ballistic: a steep straight run at constant speed onto its aim point; hypersonic: glides high, then dives in the last 30 km; ICBM: straight down the line
 function fast(t,dt){if(Z.reMove?.(t,dt))return true;  /* the ICBM's midcourse / re-entry profile (zreentry.js) */
  const r=_a.subVectors(t.aim,t.p),d=r.length();if(d<t.spd*dt*1.2||t.p.y<=gh(t.p.x,t.p.z)+1){t.p.copy(t.aim);Z.impact(t);return true}
  if(t.k==='hyper'){const hd=hyp(r.x,r.z);if(hd>30000){r.y=(30000+gh(t.aim.x,t.aim.z)-t.p.y)*.2;}}
  t.v.copy(r.normalize()).multiplyScalar(t.spd);t.p.addScaledVector(t.v,dt);return true}
 const mover=(t,dt)=>t.k==='swarm'?swarm(t,dt):KIND[t.k].armor==='hard'?fast(t,dt):false;

 // ---------- Mothership boss: big flying wing on Riley's cruise code, launches swarms until destroyed, breaks apart stage by stage ----------
 const BM={wing:new THREE.MeshStandardMaterial({color:0x2a2d30,roughness:.55,metalness:.45}),pod:new THREE.MeshStandardMaterial({color:0x3c3f42,roughness:.5,metalness:.5}),led:glow(0xff3030,5)};
 function bossMesh(stages){const g=new THREE.Group(),s=new THREE.Shape();s.moveTo(0,9);s.lineTo(17,-5);s.lineTo(14,-8);s.lineTo(0,-4);s.lineTo(-14,-8);s.lineTo(-17,-5);s.closePath();
  const w=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:1.4,bevelEnabled:true,bevelThickness:.4,bevelSize:.5,bevelSegments:1}).rotateX(Math.PI/2).translate(0,.7,0),BM.wing);g.add(w);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6,2,14,16).rotateX(Math.PI/2).translate(0,.4,0),BM.pod));
  const pods=[];for(let i=0;i<stages;i++){const x=(i-(stages-1)/2)*(26/Math.max(1,stages-1)),p=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.1,4.5,12).rotateX(Math.PI/2),BM.pod);p.position.set(stages>1?x:0,-1.2,-3+Math.abs(x)*.25);g.add(p);pods.push(p);
   const l=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6),BM.led);l.position.set(p.position.x,-1.2,p.position.z-2.4);g.add(l);p.userData.led=l}
  g.traverse(o=>{if(o.isMesh)o.castShadow=true});g.userData.own=1;scene.add(g);return{g,pods}}  // own: its geometries are disposed with the track (interceptor.js dropMesh)
 {const b=bossMesh(3).g;api.scene.remove(b);warm(b)}  /* the Mothership is built when it spawns: compile its materials during the menu (engine/warm.js) */
 function bossTick(t,dt){if(t.st!=='cruise'&&t.st!=='dive')return;if((t.rel-=dt)<=0&&t.st==='cruise'){t.rel=rnd(18,24);const n=5+Math.floor(G.wave/6),live=TH.reduce((a,u)=>a+(u.k==='swarm'&&api.live(u)?1:0),0);
   if(live<160){const g=++G.gid;for(let i=0;i<n;i++){const u=Z.make('swarm',t.p.x+rnd(-12,12),t.p.z+rnd(-12,12));if(u){u.p.y=t.p.y-6;u.grp=g}}api.feed(`<span class="cr">${Z.tname(t)} launched an FPV swarm (${n})</span>`)}}}
 Z.bossHit=t=>{if(!api.live(t))return;t.stages--;const p=t.pods?.[t.stages];if(p){p.visible=false;p.userData.led.visible=false;p.getWorldPosition(_b);api.boom(_b,2.2)}
  t.spd*=.9;t.cs*=.9;
  if(t.stages<=0){api.feed(`<span class="cg">${Z.tname(t)} destroyed</span>`);api.killThreat(t,true);api.boom(t.p,8);return}
  Z.earn(300,t.p,' STAGE');api.feed(`<span class="cg">${Z.tname(t)}: stage down, ${t.stages} left</span>`)};

 // Z.tstep: true = handled here. Riley's code flies Shahed, Geran-3, decoys, heavies, cruise missiles and the boss; falling wrecks too.
 // evasion (Hard: some kinds, Nightmare: all but the fast missiles), in cruise only: a constant weave, and a hard break to one side (and down) when your
 // interceptor closes inside 350 m. Riley-flown kinds get it as a heading offset (t.ev, rad) that their own steering follows at t.evr rad/s;
 // swarm drones get a sideways push on their velocity instead.
 const _e=new V3();
 function evade(t,dt){const mode=Z.evadeMode?.()||'none',K=KIND[t.k];t.ev=0;t.evr=0;if(mode==='none'||K.armor==='hard'||t.st!=='cruise')return;if(mode==='some'&&!EVADE_SOME.includes(t.k))return;
  const vh=Math.hypot(t.v.x,t.v.z);if(vh<1)return;const lx=-t.v.z/vh,lz=t.v.x/vh,m=mode==='all'?1:.8;
  t.jph=(t.jph??Math.random()*6)+dt*(.9+(t.id%5)*.15);let ev=Math.sin(t.jph)*(t.k==='jet'||t.k==='cruise'?.3:.35)*m;
  t.brkCd=(t.brkCd||0)-dt;
  if(api.think(t.id))for(const me of Z.pilots?.()||[api.player])if(me&&me.dead<=0&&!(t.brk>0)&&t.brkCd<=0){  /* the break decision on its turn (api.think); the weave every tick */_e.subVectors(t.p,me.p);const d=_e.length();if(d<350&&_e.dot(me.v)-_e.dot(t.v)>0){t.brk=1.6;t.brkCd=5;t.brkDir=(_e.x*lx+_e.z*lz)>0?1:-1}}  // closing on it: break away from your side (Z.pilots: every co-op pilot's interceptor)
  if(t.brk>0){t.brk-=dt;ev+=t.brkDir*.9*m*Math.sin(Math.PI*cl(1-t.brk/1.6,0,1));t.alt=Math.max(30,t.alt-18*dt)}
  if(K.riley){t.ev=ev;t.evr=1.1;return}
  const j=ev*vh*1.5*dt;t.v.x+=lx*j;t.v.z+=lz*j}
 function tstep(t,dt){if(t.pp)t.pp.copy(t.p);else t.pp=t.p.clone();const K=KIND[t.k];if(!K)return false;evade(t,dt);
  if(t.k==='boss')bossTick(t,dt);if(K.riley||t.st==='fall')return false;return mover(t,dt)}

 // ---------- spawn extras per kind (called from make) ----------
 function dress(t){const K=KIND[t.k];t.inst=t.k!=='boss';t.shade=Math.random()*3|0;
  if(K.armor==='hard'){t.p.y=gh(t.p.x,t.p.z)+K.y0;t.wps.length=0;t.v.subVectors(t.aim,t.p).setLength(t.spd);t.st='cruise'}
  if(t.k==='boss'){t.stages=3+Math.floor(G.wave/20);const b=bossMesh(t.stages);t.mesh=b.g;t.pods=b.pods;t.rel=8}else t.mesh=new THREE.Object3D()}

 // ---------- far field: a ring of coarse terrain from the edge of the 9 km map out to ~58 km, seamless with the detailed terrain ----------
 let ring=null;
 function farRing(){if(ring)return ring;const H=4500,NS=360,P=NS*4,K=22,pos=new Float32Array(P*(K+1)*3),col=new Float32Array(P*(K+1)*3),idx=[];
  const FC=[[.77,.68,.37],[.72,.64,.35],[.49,.55,.28],[.40,.47,.23],[.30,.24,.18],[.37,.29,.21],[.62,.6,.36],[.35,.45,.23]].map(c=>c.map(v=>v*.82));
  const y0=new Float32Array(P);
  for(let k=0;k<=K;k++){const h=H*(1+((k/K)**1.8)*12);for(let i=0;i<P;i++){const s=i/NS|0,f=(i%NS)/NS*2-1,ux=s===0?f:s===1?1:s===2?-f:-1,uz=s===0?-1:s===1?f:s===2?1:-f;
    const x=ux*h,z=uz*h,o=(k*P+i)*3;let y;if(!k){y=gh(cl(x,-H+.01,H-.01),cl(z,-H+.01,H-.01));y0[i]=y}else{const far=(fbm(x/7000+3,z/7000-2)-.45)*500+60;y=y0[i]+(far-y0[i])*sm(k/6)}
    pos[o]=x;pos[o+1]=y;pos[o+2]=z;const c=FC[Math.abs(Math.floor(x/640)*7+Math.floor(z/410)*13)%FC.length],n=.85+.3*fbm(x/900,z/900);col[o]=c[0]*n;col[o+1]=c[1]*n;col[o+2]=c[2]*n}}
  for(let k=0;k<K;k++)for(let i=0;i<P;i++){const a=k*P+i,b=k*P+(i+1)%P,c=(k+1)*P+i,d=(k+1)*P+(i+1)%P;idx.push(a,c,b,b,c,d)}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(idx);geo.computeVertexNormals();
  ring=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));ring.frustumCulled=false;ring.visible=false;scene.add(ring);return ring}

 // ---------- flashes: every explosion also gets a screen-sized additive flash, so the fight still reads at 1-3 km (particles go sub-pixel there) ----------
 const FN=160,fPos=new Float32Array(FN*3),fAtt=new Float32Array(FN*2),fGeo=new THREE.BufferGeometry();fGeo.setAttribute('position',new THREE.BufferAttribute(fPos,3));fGeo.setAttribute('sa',new THREE.BufferAttribute(fAtt,2));
 const fMat=new THREE.ShaderMaterial({uniforms:{map:{value:dot}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec2 sa;varying float vA;\n#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vA=sa.y;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=sa.x;\n#include <logdepthbuf_vertex>\n}`,
  fragmentShader:`uniform sampler2D map;varying float vA;\n#include <logdepthbuf_pars_fragment>\nvoid main(){\n#include <logdepthbuf_fragment>\nfloat a=texture2D(map,gl_PointCoord).a*vA;gl_FragColor=vec4(vec3(1.,.72,.38)*a*2.2,a);}`});
 const fPts=new THREE.Points(fGeo,fMat);fPts.frustumCulled=false;scene.add(fPts);fGeo.setDrawRange(0,0);
 const FL=[];
 function flash(p,k){if(FL.length>=FN)FL.shift();FL.push({p:p.clone(),k:Math.min(4,k),t:0,life:.25+.12*Math.min(4,k)})}
 function flashes(dt){const cam=api.camera.position,H=innerHeight;let n=0;for(let i=FL.length-1;i>=0;i--){const f=FL[i];if((f.t+=dt)>f.life){FL.splice(i,1);continue}}
  for(const f of FL){const d=f.p.distanceTo(cam),u=f.t/f.life;fPos[n*3]=f.p.x;fPos[n*3+1]=f.p.y;fPos[n*3+2]=f.p.z;fAtt[n*2]=cl((8+16*f.k)*(1+.6*u)*Math.min(1.6,900/Math.max(d,300))*H/720,4,90);fAtt[n*2+1]=(1-u)*(1-u);n++}
  fGeo.setDrawRange(0,n);fGeo.attributes.position.needsUpdate=fGeo.attributes.sa.needsUpdate=true}
 return{visuals:dt=>{visuals(dt);flashes(dt)},hide:()=>{hide();FL.length=0;fGeo.setDrawRange(0,0)},tstep,dress,farRing,IM,flash}}
