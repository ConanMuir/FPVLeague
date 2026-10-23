// Boss atmosphere: what a boss's presence does to the battlefield's look (zbosses.js runs it). Each boss module that changes the battlefield
// has an atmos(ctx, t, o) hook: it fills o (fog: a multiplier on the weather's fog distances, fogC / fogMix: the fog colour it pulls toward,
// light: a multiplier on the sun and sky light, dark / desat / tint + tintA / vign / noise: the grade, shim + sp + sr: a heat shimmer around a
// point in the world) and returns how strong it is right now (0..1, e.g. falling off with your distance). Every source eases in on arrival
// (about 1.6 s) and out on its death or retreat (about 2.5 s); several combine (multipliers multiply, the grade takes the stronger).
// It composes with the weather (zwx.js) instead of fighting it: the fog and light changes are applied only while the scene is drawn (the
// scene's onBeforeRender) and put back exactly afterwards (onAfterRender), so the weather, the distance haze (igfx.js) and every system that
// reads the fog or the lights always see the weather's own values. The grade is one post-processing pass, enabled only while a boss uses it.
// Fair: radar and brackets are untouched; the fog never closes in past 1.4 km (or the weather's own distance if that is nearer); the
// darkening spares highlights, so lights, exhausts and muzzle flashes stay readable. Graphics setting: the shimmer is off on Low and the boss
// haze particles scale with gfx.k.fx. Frame time: no allocations per frame; the pass costs nothing while it is off.
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {composer} from '../../engine/render.js';
import {gfx} from '../../engine/gfx.js';
import {warm} from '../../engine/warm.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,FOGMIN=1400;
export function initAtmos(api,G,Z,BOSSES){
 const {THREE,scene}=api;
 const U0={tDiffuse:{value:null},tint:{value:new THREE.Color(1,1,1)},tintA:{value:0},dark:{value:0},desat:{value:0},vign:{value:0},noise:{value:0},t:{value:0},
  shim:{value:0},sc:{value:new THREE.Vector2(.5,.5)},sr:{value:.2},asp:{value:1.7}};
 const pass=new ShaderPass({uniforms:U0,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform vec3 tint;uniform float tintA,dark,desat,vign,noise,t,shim,sr,asp;uniform vec2 sc;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec2 uv=vUv;
 if(shim>0.){vec2 d=(uv-sc)*vec2(asp,1.);float w=shim*smoothstep(sr,0.,length(d));uv+=vec2(sin(uv.y*140.+t*9.),cos(uv.x*120.+t*7.))*.0035*w;}
 vec3 c=texture2D(tDiffuse,uv).rgb;float l=dot(c,vec3(.299,.587,.114));
 c=mix(c,vec3(l),desat);
 c=mix(c,tint*l*2.,tintA);
 c*=mix(1.-dark,1.,smoothstep(.86,.99,l));
 vec2 q=(vUv-.5)*vec2(asp,1.);c*=1.-vign*smoothstep(.3,.95,length(q));
 if(noise>0.){float n=h(floor(vUv*vec2(640.,360.))+fract(t*17.));float band=step(.985,h(vec2(floor(vUv.y*90.),floor(t*24.))));c=mix(c,vec3(n),noise*(.55+.45*band));}
 gl_FragColor=vec4(c,1.);}`});
 const U=pass.uniforms;pass.enabled=false;warm(pass.material);let added=false;  // ShaderPass clones the uniforms it is given: drive its own
 // ---------- sources: one slot per boss track, eased toward what it asks for ----------
 const mkP=()=>({fog:1,fogC:new THREE.Color(),fogMix:0,light:1,dark:0,desat:0,tint:new THREE.Color(1,1,1),tintA:0,vign:0,noise:0,shim:0,sp:new THREE.Vector3(),sr:.22,hasS:false});
 const rs=o=>{o.fog=1;o.fogMix=0;o.light=1;o.dark=0;o.desat=0;o.tintA=0;o.vign=0;o.noise=0;o.shim=0;o.hasS=false;o.sr=.22;o.tint.setRGB(1,1,1);return o};
 const cp=(a,b)=>{a.fog=b.fog;a.fogC.copy(b.fogC);a.fogMix=b.fogMix;a.light=b.light;a.dark=b.dark;a.desat=b.desat;a.tint.copy(b.tint);a.tintA=b.tintA;a.vign=b.vign;a.noise=b.noise;a.shim=b.shim;a.sp.copy(b.sp);a.sr=b.sr;a.hasS=b.hasS};
 const SL=new Map(),FREE=[],tmp=mkP();let frame=0;
 // the combined look this frame (what apply() puts on the scene and the pass)
 const A={on:false,fog:1,fogC:new THREE.Color(),fogMix:0,light:1,dark:0,desat:0,tint:new THREE.Color(1,1,1),tintA:0,vign:0,noise:0,shim:0,sp:new THREE.Vector3(),sr:.22,n:0};
 const ext={};  // built-in sources (the Mothership's shadow), set by zbosses.js: ext.boss(t, o) -> strength
 function want(key,k){let s=SL.get(key);if(!s){s=FREE.pop()||{p:mkP(),e:0,tg:0,f:0};s.e=0;SL.set(key,s)}cp(s.p,tmp);s.tg=cl(k,0,1);s.f=frame}
 let up=0,dn=0,fw=0,tw=0,sw=0;
 // one source into the combined look (a named function: SL.forEach allocates nothing per frame)
 function each(s,key){if(s.f!==frame)s.tg=0;s.e+=(s.tg-s.e)*(s.tg>s.e?up:dn);if(s.tg===0&&s.e<.003){SL.delete(key);FREE.push(s);return}
  const e=s.e,p=s.p;A.n++;A.fog*=1-e*(1-p.fog);A.light*=1-e*(1-p.light);A.dark=Math.max(A.dark,e*p.dark);A.desat=Math.max(A.desat,e*p.desat);A.vign=Math.max(A.vign,e*p.vign);A.noise=Math.max(A.noise,e*p.noise);
  const fm=e*p.fogMix;if(fm>0){A.fogC.r+=p.fogC.r*fm;A.fogC.g+=p.fogC.g*fm;A.fogC.b+=p.fogC.b*fm;fw+=fm;A.fogMix=Math.max(A.fogMix,fm)}
  const ta=e*p.tintA;if(ta>0){A.tint.r+=p.tint.r*ta;A.tint.g+=p.tint.g*ta;A.tint.b+=p.tint.b*ta;tw+=ta;A.tintA=Math.max(A.tintA,ta)}
  if(p.hasS&&e*p.shim>sw){sw=e*p.shim;A.sp.copy(p.sp);A.sr=p.sr}}
 function tick(dt){frame++;if(!G.on){if(SL.size||SV.on)clear();return}
  for(const t of api.TH){if(t.st==='dead')continue;const D=BOSSES[t.k];if(D?!D.atmos||!t.bs:t.k!=='boss'||!ext.boss)continue;rs(tmp);const k=D?D.atmos(atmos.ctx,t,tmp):ext.boss(t,tmp);if(k>0)want(t,k)}
  up=1-Math.exp(-dt/1.6);dn=1-Math.exp(-dt/2.5);fw=tw=sw=0;
  A.fog=1;A.fogMix=0;A.light=1;A.dark=0;A.desat=0;A.tintA=0;A.vign=0;A.noise=0;A.shim=0;A.n=0;A.fogC.setRGB(0,0,0);A.tint.setRGB(0,0,0);
  SL.forEach(each);
  if(fw>0)A.fogC.multiplyScalar(1/fw);if(tw>0)A.tint.multiplyScalar(1/tw);else A.tint.setRGB(1,1,1);A.shim=gfx.level==='low'?0:sw;
  A.on=A.n>0&&!atmos.off;
  const grade=A.on&&(A.tintA>.002||A.dark>.002||A.desat>.002||A.vign>.002||A.noise>.002||A.shim>.002);
  if(grade&&!added){composer.addPass(pass);added=true}pass.enabled=grade;
  if(grade){U.tint.value.copy(A.tint);U.tintA.value=A.tintA;U.dark.value=A.dark;U.desat.value=A.desat;U.vign.value=A.vign;U.noise.value=A.noise;U.t.value=performance.now()/1000;
   U.asp.value=innerWidth/Math.max(1,innerHeight);U.shim.value=0;if(A.shim>0){_v.copy(A.sp).project(api.camera);if(_v.z<1&&Math.abs(_v.x)<1.3&&Math.abs(_v.y)<1.3){U.sc.value.set(_v.x*.5+.5,_v.y*.5+.5);U.shim.value=A.shim;U.sr.value=A.sr}}}
  hook()}
 const _v=new THREE.Vector3();
 // ---------- the scene's fog and lights: changed only while it is drawn, put back exactly afterwards ----------
 const SV={on:false,fn:0,ff:0,fc:new THREE.Color(),sun:0,hemi:0,bg:new THREE.Color(),bgOn:false};
 function apply(){if(SV.on)restore();if(!A.on)return;const f=scene.fog;SV.on=true;
  if(f){SV.fn=f.near;SV.ff=f.far;SV.fc.copy(f.color);const lo=Math.min(f.far,FOGMIN);f.far=Math.max(lo,f.far*A.fog);f.near=Math.min(f.near*A.fog,f.far*.5);f.color.lerp(A.fogC,A.fogMix)}
  SV.sun=api.sun.intensity;SV.hemi=api.hemi.intensity;api.sun.intensity*=A.light;api.hemi.intensity*=A.light;
  SV.bgOn=!!scene.background?.isColor;if(SV.bgOn){SV.bg.copy(scene.background);scene.background.lerp(A.fogC,A.fogMix).multiplyScalar(.5+.5*A.light)}}
 function restore(){if(!SV.on)return;SV.on=false;const f=scene.fog;if(f){f.near=SV.fn;f.far=SV.ff;f.color.copy(SV.fc)}api.sun.intensity=SV.sun;api.hemi.intensity=SV.hemi;if(SV.bgOn&&scene.background?.isColor)scene.background.copy(SV.bg)}
 // installed on the first boss frame, so it wraps whatever else hooks the scene's render (igfx.js's haze runs first and sees clean values)
 let hooked=false;function hook(){if(hooked||!A.on)return;hooked=true;const ob=scene.onBeforeRender,oa=scene.onAfterRender;
  scene.onBeforeRender=function(...a){ob.apply(this,a);apply()};scene.onAfterRender=function(...a){restore();oa.apply(this,a)}}
 // ---------- cleanup: everything off at once (the end of a wave, game over, quit) ----------
 function clear(){for(const s of SL.values())FREE.push(s);SL.clear();restore();A.on=false;A.n=0;pass.enabled=false}
 // the harness: what is applied right now, and the scene's fog and lights as one render would see them (applied, then restored)
 function probe(){apply();const f=scene.fog,o={fogNear:f?.near,fogFar:f?.far,fogCol:f?.color.getHex(),sun:api.sun.intensity,hemi:api.hemi.intensity};restore();return o}
 const atmos={tick,clear,probe,ext,pass,A,get sources(){return SL.size},off:false,
  state:()=>({sources:SL.size,on:A.on,pass:pass.enabled,fog:+A.fog.toFixed(3),light:+A.light.toFixed(3),dark:+A.dark.toFixed(3),desat:+A.desat.toFixed(3),tintA:+A.tintA.toFixed(3),noise:+A.noise.toFixed(3),shim:+A.shim.toFixed(3),vign:+A.vign.toFixed(3)})};
 return atmos}
