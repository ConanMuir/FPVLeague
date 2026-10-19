// ---------- goal explosion (Rocket League style): flash, team-colour shockwave shell + rings, spark streaks, light pulse, goal glow, camera shake ----------
// goalBoom(t,p) starts it (modes/match.js goalFx); goalFxTick(dt,now) runs it from visuals(), after the ball light is set. Purely visual (runs on joiners too).
// Everything is built once and pooled: no allocations per goal or per frame. The sparks move entirely in the vertex shader (one uniform per frame).
// Runs on real time (not the goal slow-mo), ~1.5 s; Low quality draws fewer sparks.
import * as THREE from 'three';
import {COL,HL} from '../config/constants.js';
import {camera,scene,qId} from './renderer.js';
import {ballLight} from './ball.js';
import {dot} from './particles.js';
import {GS} from '../state.js';
import {goalG} from '../world/arena.js';
const DUR=1.5,NS=180,NS_LOW=70,SDRAG=2.2,SGRAV=30;
const add={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false};
// premultiplied: the colour adds light (so it glows on the dark arena) and alpha also covers what's behind (so it still reads in team colour over snow or a bright sky)
const pre={...add,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor};
// shockwave shell: a sphere drawn bright at its silhouette and clear in the middle (fresnel), so it never fills the screen even with the camera inside it
const shellM=new THREE.ShaderMaterial({...pre,side:THREE.DoubleSide,uniforms:{uC:{value:new THREE.Color()},uA:{value:0}},
 vertexShader:`varying vec3 vN,vV;void main(){vec4 m=modelViewMatrix*vec4(position,1.);vN=normalMatrix*normal;vV=-m.xyz;gl_Position=projectionMatrix*m;}`,
 fragmentShader:`uniform vec3 uC;uniform float uA;varying vec3 vN,vV;void main(){float r=1.-abs(dot(normalize(vN),normalize(vV)));float e=uA*(pow(r,3.)*.9+.04);gl_FragColor=vec4(uC*e,min(e*.8,.85));}`});
const shell=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),shellM);
// rings: a plane whose shader draws a soft band at its edge (inner edge soft, outer edge crisp) and a faint fill
const ringM=()=>new THREE.ShaderMaterial({...pre,side:THREE.DoubleSide,uniforms:{uC:{value:new THREE.Color()},uA:{value:0},uW:{value:.2}},
 vertexShader:`varying vec2 vU;void main(){vU=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform vec3 uC;uniform float uA,uW;varying vec2 vU;void main(){float d=length(vU);if(d>1.)discard;float x=(d-1.+uW)/uW;
  float a=x<0.?0.:smoothstep(0.,.75,x)*(1.-smoothstep(.9,1.,x));float e=uA*(a+.05*d*d);gl_FragColor=vec4(uC*e,min(e*.8,.85));}`});
const PL=new THREE.PlaneGeometry(2,2),ringV=new THREE.Mesh(PL,ringM()),ringG=new THREE.Mesh(PL,ringM());ringG.rotation.x=-Math.PI/2;
// flash: a white-hot core and a wider team-colour halo (camera-facing sprites)
const core=new THREE.Sprite(new THREE.SpriteMaterial({map:dot,...add,color:0xffffff})),halo=new THREE.Sprite(new THREE.SpriteMaterial({map:dot,...add,blending:THREE.NormalBlending,color:0xffffff}));
// sparks: instanced streaks; per spark a start offset, velocity, life and colour; position(t) is closed-form (drag + gravity, floor clamp)
const sg=new THREE.InstancedBufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,0,1,0,1,-1,0,1,1,0],3));sg.setIndex([0,2,1,1,2,3]);
const aP=new Float32Array(NS*3),aV=new Float32Array(NS*3),aL=new Float32Array(NS*2),aC=new Float32Array(NS*3);
[['aP',aP,3],['aV',aV,3],['aL',aL,2],['aC',aC,3]].forEach(([n,a,k])=>sg.setAttribute(n,new THREE.InstancedBufferAttribute(a,k)));sg.instanceCount=0;
const sparkM=new THREE.ShaderMaterial({...pre,side:THREE.DoubleSide,uniforms:{uT:{value:0},uO:{value:new THREE.Vector3()}},
 vertexShader:`attribute vec3 aP,aV,aC;attribute vec2 aL;uniform float uT;uniform vec3 uO;varying vec3 vC;varying float vY;
 const float K=${SDRAG.toFixed(2)},G=${SGRAV.toFixed(1)};
 vec3 at(float t){vec3 p=uO+aP+aV*(1.-exp(-K*t))/K;p.y-=.5*G*t*t;p.y=max(p.y,.15);return p;}
 void main(){float t=uT,f=1.-t/aL.x;if(f<=0.){gl_Position=vec4(0.,0.,2.,1.);return;}
  vec3 h=at(t),tl=at(max(0.,t-.06));vec4 H=viewMatrix*vec4(h,1.),T=viewMatrix*vec4(tl,1.);vec3 dir=H.xyz-T.xyz;
  if(dot(dir,dir)<1e-4)dir=vec3(0.,1e-2,0.);vec3 sd=normalize(cross(dir,H.xyz))*aL.y*(1.-.75*position.x);
  vec4 P=mix(H,T,position.x);P.xyz+=sd*position.y;gl_Position=projectionMatrix*P;vC=aC*f*f*(1.-.6*position.x);vY=position.y;}`,
 fragmentShader:`varying vec3 vC;varying float vY;void main(){float k=1.-vY*vY;gl_FragColor=vec4(vC*k,min(1.,length(vC))*k*.35);}`});
const sparks=new THREE.Mesh(sg,sparkM);
const ALL=[shell,ringV,ringG,core,halo,sparks];ALL.forEach(o=>{o.visible=false;o.frustumCulled=false;o.renderOrder=4;scene.add(o)});
// goal glow: the meshes/lights of each goal (side 0 = +z, blue's goal), found once in goalG; materials are read when a goal starts (setMap swaps some)
let SIDES=null;const GL=[];  // GL: [{o, mat, col, op, ei, li}] for the goal being lit
function findSides(){SIDES=[[],[]];const b=new THREE.Box3(),c=new THREE.Vector3();
 goalG.children.forEach(o=>{let z=o.position.z;if(o.isMesh){b.setFromObject(o);z=b.getCenter(c).z}SIDES[z>0?0:1].push(o)})}
const base=Array.from({length:16},()=>({o:null,mat:null,col:new THREE.Color(),op:0,ei:0,li:0}));
const C=new THREE.Color(),W=new THREE.Color(1,1,1),O=new THREE.Vector3(),LP=new THREE.Vector3(),bl={col:new THREE.Color(),dist:0,on:false};
let t0=-1,last=0,el=0,side=0,amp=1,warm=2;  // warm: draw everything once, invisible, on the first frames so the shaders compile before the first goal (no hitch)
function restore(){for(const e of GL){if(e.o.isLight)e.o.intensity=e.li;else{e.mat.color.copy(e.col);e.mat.opacity=e.op;if(e.mat.emissive)e.mat.emissiveIntensity=e.ei}}GL.length=0;
 if(bl.on){ballLight.color.copy(bl.col);ballLight.distance=bl.dist;bl.on=false}}
export function goalBoom(t,p){if(!SIDES)findSides();restore();const c=COL[t];O.copy(p);side=p.z>0?0:1;const s=side?-1:1;
 // the light sits a little out of the goal mouth so it lights the field, not just the pocket
 LP.set(p.x,Math.max(14,p.y),s*(HL-6));bl.col.copy(ballLight.color);bl.dist=ballLight.distance;bl.on=true;ballLight.color.set(c);ballLight.distance=170;
 let k=0;for(const o of SIDES[side]){if(k>=base.length)break;const e=base[k];if(o.isLight){e.o=o;e.li=o.intensity}else if(o.isMesh&&o.material?.color){const m=o.material;e.o=o;e.mat=m;e.col.copy(m.color);e.op=m.opacity;e.ei=m.emissiveIntensity??0}else continue;GL.push(e);k++}
 shellM.uniforms.uC.value.set(c).lerp(W,.1);ringV.material.uniforms.uC.value.set(c).lerp(W,.18);ringG.material.uniforms.uC.value.set(c);halo.material.color.set(c);
 shell.position.copy(p);core.position.copy(p);halo.position.copy(p);ringV.position.set(p.x,Math.max(p.y,3),s*(HL-.5));ringG.position.set(p.x,.12,s*(HL-2));
 // sparks: out of the goal into the field and upward, team colour, white-hot and gold
 const n=qId==='low'?NS_LOW:NS;for(let i=0;i<n;i++){const i3=i*3;let x=Math.random()*2-1,y=Math.random()*2-1,z=Math.random()*2-1;const l=Math.hypot(x,y,z)||1;x/=l;y/=l;z/=l;
  z=-s*(Math.abs(z)*1.3+.35);y=Math.abs(y)*.9+.15;const sp=(35+Math.random()*75)/Math.hypot(x,y,z);
  aP[i3]=x*1.5;aP[i3+1]=y*1.5;aP[i3+2]=z*1.5;aV[i3]=x*sp;aV[i3+1]=y*sp;aV[i3+2]=z*sp;aL[i*2]=.7+Math.random()*.8;aL[i*2+1]=.12+Math.random()*.16;
  const r=Math.random();C.set(r<.55?c:r<.8?0xffffff:0xffc640).multiplyScalar(r<.55?2.2:1.6);aC[i3]=C.r;aC[i3+1]=C.g;aC[i3+2]=C.b}
 sg.instanceCount=n;['aP','aV','aL','aC'].forEach(a=>sg.attributes[a].needsUpdate=true);sparkM.uniforms.uO.value.copy(p);
 // shake: strong up close, a nudge from across the field (camera.js scales it by the Camera shake setting)
 const d=camera.position.distanceTo(p);if(!GS.demo)GS.shake=Math.max(GS.shake,.75*Math.max(.25,1-d/140));
 t0=0;el=0;last=0;warm=0;ALL.forEach(o=>o.visible=true)}
const eo=x=>1-(1-x)**3;
export function goalFxTick(dt,now){if(t0<0){if(warm){ALL.forEach(o=>o.visible=warm===2);if(warm===2)core.material.opacity=halo.material.opacity=0;warm--}return}const rdt=last?Math.min(.05,(now-last)/1000):0;last=now;if(dt>0)el+=rdt;const t=el,u=t/DUR;  // real time; frozen while paused
 if(u>=1){t0=-1;ALL.forEach(o=>o.visible=false);sg.instanceCount=0;restore();return}
 // fade anything big when the camera is right on top of it (FPV chasing the ball in), so it reads as a burst, not a white screen
 const d=camera.position.distanceTo(O);amp=Math.min(1,.3+d/30);
 const f=Math.max(0,1-t/.35);core.scale.setScalar(3+t*40);core.material.opacity=f*f*amp;halo.scale.setScalar(10+eo(Math.min(1,t/.5))*40);halo.material.opacity=Math.max(0,1-t/.6)**2*.4*amp;
 shell.scale.setScalar(2+eo(Math.min(1,t/1.1))*30);shellM.uniforms.uA.value=Math.max(0,1-t/1.1)**1.8*.9;
 const v=Math.min(1,t/1.2);ringV.scale.setScalar(2+eo(v)*44);ringV.material.uniforms.uA.value=(1-v)**1.3*1.2;ringV.material.uniforms.uW.value=.22-.15*v;
 const g=Math.min(1,Math.max(0,t-.04)/1.4);ringG.scale.setScalar(3+eo(g)*75);ringG.material.uniforms.uA.value=(1-g)**1.6*.8;ringG.material.uniforms.uW.value=.14-.1*g;
 sparkM.uniforms.uT.value=t;
 // light pulse: a sharp flash that dies away; the ball light (dark while the ball is hidden) is reused, so no light is added to the scene
 const lp=Math.min(1,t/.04)*Math.exp(-t*3.2);ballLight.position.copy(LP);ballLight.intensity=2600*lp;
 // the goal frame, back panel, rim, net, floor and goal lights flare up in their own colour (a few beats, fading)
 const gp=Math.exp(-t*2.2)*(.75+.25*Math.cos(t*16));
 for(const e of GL){if(e.o.isLight){e.o.intensity=e.li*(1+10*gp);continue}if(e.o.material!==e.mat)continue;const m=e.mat;
  m.color.copy(e.col).multiplyScalar(1+1.1*gp);m.opacity=Math.min(1,e.op*(1+.8*gp));if(m.emissive)m.emissiveIntensity=e.ei*(1+5*gp)}}
