// Zombies weather. A wider table than the Weather setting's (interceptor.js WXS): golden hour, night (moon, stars, searchlights, site lamps), snow, dust haze and a heavy storm with
// lightning, on top of Riley's clear / scattered / overcast / rain / fog / dusk. Each wave gets a forecast when the base screen opens (shown in its
// footer); from wave 3 some waves also change part-way through (rain moving in, fog lifting, the sun going down...), blended over about 35 s.
// The menu's "Zombies weather" option can switch this off (then the normal Weather setting is used for every wave).
//
// Fairness: weather only changes the picture (fog distance, light, particles). Radar detection, the track list, the FPV brackets and the guidance
// cue do not depend on it, so bad weather pushes you onto the HUD but never hides a threat. Thermal (H) works in every weather and is the counter
// to night and haze, and the Optics perk (level 2) still lets thermal see through the cloud deck and fog. At night the threats show a dim red
// engine / nav glow and the sites keep their lamps on, so you can still find things by eye.
//
// Cost: every particle set is a fixed, preallocated pool (rain 5000 streaks shared with the Weather setting's, snow 2400, dust 500, stars 900, glows 160,
// two lightning bolts, four searchlight beams), and the per-frame counts halve when Zombies' performance governor sees slow frames and scale with Graphics quality (gfx.k.wx: Medium 60%, Low 30%; rain too, also with the Weather setting's).
import {dot,tex} from '../../engine/render.js';
import {NIGHT} from './buildings.js';
import {SNOW} from '../../engine/render.js';
import {gfx} from '../../engine/gfx.js';
import {nearFade} from '../../engine/nearfade.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,rnd=(a,b)=>a+Math.random()*(b-a);
export function initWeather(api,G,Z){
 const {THREE,scene,S,TH}=api,_c1=new THREE.Color(),_c2=new THREE.Color(),_a=new THREE.Vector3();
 // same fields as Riley's WXS (interceptor.js), plus: sunI / sunC / hemiI / hemiC / gndC light overrides, nosky (flat background), disc* (sun or moon
 // sprite), and the effect flags stars, beams, lamps, glow, snow, dust, bolts
 const T={clear:{n:'Clear',el:30,az:215,turb:2.2,ray:1.2,fog:[2500,14000],hz:0xc3d3e3,cov:.12,wind:4,dim:0,exp:.55},
  scattered:{n:'Scattered cloud',el:38,az:200,turb:3,ray:1.4,fog:[2000,12000],hz:0xc6d4e0,cov:.6,wind:7,dim:.05,exp:.55},
  golden:{n:'Golden hour',el:5,az:255,turb:10,ray:3,fog:[1300,9000],hz:0xe0a66a,cov:.35,wind:5,dim:.05,warm:1,exp:.58,sunI:3.2,sunC:0xff9848,hemiI:.7,hemiC:0xffcf9e,gndC:0x5a4c30},
  overcast:{n:'Overcast',el:40,az:200,turb:8,ray:2,fog:[900,7000],hz:0xa8b0b6,cov:.25,deck:900,wind:9,dim:.8,exp:.62},
  dusk:{n:'Dusk',el:3.5,az:250,turb:6,ray:2.5,fog:[1500,10000],hz:0xc9a585,cov:.4,wind:5,dim:.1,warm:1,exp:.62},
  rain:{n:'Rain',el:35,az:200,turb:10,ray:2,fog:[350,3800],hz:0x8d9499,cov:.15,deck:600,rain:1,wind:11,dim:.88,exp:.62},
  storm:{n:'Heavy storm',el:30,az:200,turb:12,ray:2,fog:[200,2300],hz:0x5b6168,cov:0,deck:420,rain:2.2,wind:17,dim:.95,light:1,bolts:1,exp:.64},
  fog:{n:'Fog',el:18,az:140,turb:6,ray:1,fog:[50,1400],hz:0xb9bfc2,cov:0,wind:2,dim:.45,exp:.6},
  snow:{n:'Snow',el:28,az:190,turb:8,ray:2,fog:[220,2800],hz:0xc9ced4,cov:0,deck:700,wind:8,dim:.75,exp:.68,snow:1,hemiC:0xe6eaf0,gndC:0xa4a8a2},
  dust:{n:'Dust haze',el:22,az:230,turb:14,ray:3,fog:[300,4000],hz:0xb09774,cov:0,wind:13,dim:.35,warm:1,exp:.6,nosky:1,sunI:2.3,sunC:0xffcf98,discC:0xffdcae,discK:2.2,discS:1500,dust:1},
  night:{n:'Night',el:34,az:170,turb:2,ray:.5,fog:[500,5500],hz:0x0d1420,cov:0,wind:5,dim:0,exp:.9,nosky:1,sunI:.95,sunC:0xa4b8e0,hemiI:.38,hemiC:0x7489b5,gndC:0x1c2318,discC:0xe2eaff,discK:1.6,discS:520,stars:1,beams:1,lamps:1,glow:1,thermLift:1}};
 for(const k in T)Object.assign(T[k],{id:k,z:1});
 // forecast pool: [weather, weight, first wave]; mid-wave changes [to, how it reads]
 const POOL=[['clear',3,1],['scattered',3,1],['golden',2,1],['overcast',2,2],['dusk',1.5,3],['rain',2,3],['fog',1.2,4],['dust',1.2,4],['snow',1.2,5],['night',1.6,5],['storm',1.3,6]];
 const SHIFT={clear:[['scattered','clouding up']],scattered:[['clear','clearing up']],overcast:[['rain','rain moving in'],['snow','snow starting']],rain:[['storm','storm building'],['overcast','rain clearing']],
  storm:[['rain','storm easing']],fog:[['overcast','fog lifting']],golden:[['dusk','sun going down']],snow:[['overcast','snow easing']]};
 const on=()=>Z.on&&S.zwx!=='menu',q=()=>(Z.perf&&Z.perf.ema>24?.5:1)*gfx.k.wx;  // q: the governor halves the particles while frames are slow; Graphics quality scales them (engine/gfx.js)
 function plan(w){if(!on())return null;const prev=cur?(cur.B&&cur.done?cur.B.id:cur.A.id):null,L=POOL.filter(([k,,f])=>w>=f&&k!==prev);let tot=0;for(const q of L)tot+=q[1];
  let r=Math.random()*tot,id=L[0][0];for(const[k,wt]of L){r-=wt;if(r<=0){id=k;break}}const p={id},sh=SHIFT[id];
  if(w>=3&&sh&&Math.random()<.3){const[to,why]=sh[Math.random()*sh.length|0];Object.assign(p,{to,why,at:rnd(20,50),dur:35})}return p}
 const vis=W=>{const d=W.fog[1]*.55;return d>=8000?'excellent':d<1000?`about ${Math.round(d/100)*100} m`:`about ${(d/1000).toFixed(1)} km`};
 const note=p=>p?`<span style="color:#9fd6ff;font-weight:600"> · ${T[p.id].n}${p.to?`, ${p.why} later`:''} · visibility ${vis(T[p.id])}</span>`:'';

 // ---------- current weather and the mid-wave blend ----------
 let cur=null,tick=0;
 const say=W=>api.feed(`Weather: <b>${W.n}</b> · wind ${Math.round(api.WB.length()*3.6)} km/h · visibility ${vis(W)}`);
 function start(p){if(!p||!on()||cur&&cur.p===p)return;const A=T[p.id];cur={p,A,B:p.to?T[p.to]:null,at:p.at,dur:p.dur,why:p.why,f:0,done:false};if(api.WX?.id!==A.id||!api.WX.z||api.WX.mix)api.setWeather(A);if(G.wave)say(A)}  // wave 1's weather is set by Z.start; startMatch announces it
 const dflt=(W,k)=>k==='sunI'?(W.warm?2.2:3.4)*(1-W.dim):.75+.9*W.dim;
 const NUM=['el','az','turb','ray','cov','wind','dim','exp'];
 function mix(A,B,f){const o={...(f<.5?A:B),mix:1},L=(a,b)=>a+(b-a)*f;for(const k of NUM)o[k]=L(A[k],B[k]);
  o.fog=[L(A.fog[0],B.fog[0]),L(A.fog[1],B.fog[1])];o.hz=_c1.set(A.hz).lerp(_c2.set(B.hz),f).getHex();
  for(const k of['sunI','hemiI'])if(k in A||k in B)o[k]=L(A[k]??dflt(A,k),B[k]??dflt(B,k));
  o.rain=L(A.rain||0,B.rain||0);o.snow=L(A.snow||0,B.snow||0);
  o.deck=A.deck&&B.deck?L(A.deck,B.deck):A.deck||B.deck||0;o.deckA=A.deck&&B.deck?1:A.deck?1-f:f;return o}
 function blend(f){const W=api.WX,o=mix(cur.A,cur.B,f);for(const k in W)delete W[k];Object.assign(W,o);api.wxSky();api.wxLook(api.thermLook)}
 // sim-time driven (G.wt), drawn at 4 Hz; the end state is applied for real (environment map, wind kept)
 function shift(dt){if(!cur||!cur.B||cur.done||G.state!=='wave')return;const f=cl((G.wt-cur.at)/cur.dur,0,1);if(f<=0)return;
  if(!cur.f){api.feed(`<span class="cb">Weather: ${cur.why}</span>`)}cur.f=f;
  if(f>=1){cur.done=true;api.setWeather(cur.B,true);say(cur.B);return}if((tick-=dt)<=0){tick=.25;blend(f)}}

 // ---------- effects (all pooled) ----------
 const add=o=>{o.frustumCulled=false;o.visible=false;scene.add(o);return o};
 const pts=(n,mat)=>{const P=new Float32Array(n*3),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));return{P,g,o:add(new THREE.Points(g,mat))}};
 // snow: flakes in a 70 m box around the camera, drifting with the wind
 const SN=2400,SB=48,snow=pts(SN,nearFade(new THREE.PointsMaterial({size:.3,map:dot,color:0xffffff,transparent:true,opacity:1,depthWrite:false}),.8,3));  /* nearFade (engine/nearfade.js): flakes and motes passing the lens fade instead of blotting the screen */
 for(let i=0;i<SN*3;i++)snow.P[i]=(Math.random()-.5)*SB;const SW=new Float32Array(128);
 // dust: big soft motes in a 220 m box
 const DN=500,DB=220,dust=pts(DN,nearFade(new THREE.PointsMaterial({size:3.4,map:dot,color:0xc4a477,transparent:true,opacity:.35,depthWrite:false}),6,20));
 for(let i=0;i<DN*3;i++)dust.P[i]=(Math.random()-.5)*DB;
 // stars: a fixed dome that follows the camera
 const stars=pts(900,new THREE.PointsMaterial({size:1.7,sizeAttenuation:false,vertexColors:true,fog:false,transparent:true,depthWrite:false,toneMapped:false}));
 {const C=new Float32Array(900*3);for(let i=0;i<900;i++){const a=Math.random()*6.283,e=Math.asin(.04+Math.random()*.96),R=15000;stars.P.set([Math.cos(e)*Math.sin(a)*R,Math.sin(e)*R,Math.cos(e)*Math.cos(a)*R],i*3);const b=.25+Math.random()**3*1.1;C.set([b*.9,b*.95,b],i*3)}
  stars.g.setAttribute('color',new THREE.BufferAttribute(C,3))}
 // glows: site lamps (static) and a dim red engine / nav light on every live track near the camera (the hot kinds already glow in zenemy.js)
 const GN=160,glow=pts(GN,new THREE.PointsMaterial({size:6,sizeAttenuation:false,map:dot,color:new THREE.Color(0xff5a3c).multiplyScalar(2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
 const LP=[],LS=[];for(const s of[...api.SITES,api.PADP,...api.FOBS]){const n=s.fob?2:6,r=s.r*.85;for(let i=0;i<n;i++){LS.push([s,i*.618%1]);const a=i/n*6.283+.4,x=s.x+Math.cos(a)*r,z=s.z+Math.sin(a)*r;LP.push(x,api.gh(x,z)+7,z)}}
 const lamps=pts(LP.length/3,new THREE.PointsMaterial({size:5,sizeAttenuation:false,map:dot,color:new THREE.Color(0xffcf86).multiplyScalar(2.2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));lamps.P.set(LP);
 // searchlights: four additive cones from the sites, sweeping slowly; bright at the lamp, fading out along the beam (alphaMap reads the green channel: the gradient is grey to black, opaque)
 const beamTex=tex(4,128,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#fff');gr.addColorStop(.5,'#8c8c8c');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,w,h)});
 const BL=2600,beamGeo=new THREE.ConeGeometry(110,BL,20,1,true).rotateX(Math.PI).translate(0,BL/2,0),beamMat=new THREE.MeshBasicMaterial({color:0xc9d6ff,alphaMap:beamTex,transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
 const BS=[api.SITES[0],api.SITES[1],api.SITES[2],api.PADP],beams=BS.map((s,i)=>{const m=add(new THREE.Mesh(beamGeo,beamMat));m.position.set(s.x+(i%2?-1:1)*s.r*.6,s.y+12,s.z-s.r*.5);m.userData.ph=i*1.7;return m});
 const UP=new THREE.Vector3(0,1,0);let beamOn=false;
 // a site's lamps and searchlight die with it: the lamps go out one by one as it loses HP, the beam when it's destroyed (the radar pad's go with the command bunker)
 const hpF=s=>{if(s.fob)return 1;if(s===api.PADP){const b=api.SITES.find(q=>q.n==='COMMAND BUNKER');return b&&b.max?Math.max(0,b.hp)/b.max:1}return s.max?Math.max(0,s.hp)/s.max:1};
 let lampSig='';
 function lampsTick(){const F=new Map();let sig='',n=0;for(const[s]of LS)if(!F.has(s)){const f=hpF(s);F.set(s,f);sig+=(f*40|0)+','}if(sig===lampSig)return;lampSig=sig;
  LS.forEach(([s,k],i)=>{if(F.get(s)>k*.95){lamps.P[n*3]=LP[i*3];lamps.P[n*3+1]=LP[i*3+1];lamps.P[n*3+2]=LP[i*3+2];n++}});lamps.g.setDrawRange(0,n);lamps.g.attributes.position.needsUpdate=true}
 // lightning: two jagged bolts (with a branch), re-shaped and shown when Riley's storm flash fires
 const BN=2,BSEG=26,bolts=Array.from({length:BN},()=>{const P=new Float32Array((BSEG+8)*6),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));
  const o=add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:new THREE.Color(0xe4ebff).multiplyScalar(6),toneMapped:false,fog:false,transparent:true})));o.userData.t=0;return{P,g,o}});
 let bi=0,lastF=0;
 function bolt(){const b=bolts[bi++%BN],c=api.camera.position,f=_a.set(0,0,-1).applyQuaternion(api.camera.quaternion).setY(0);if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();
  const a=Math.atan2(f.x,f.z)+rnd(-1,1),d=rnd(900,3600),x0=c.x+Math.sin(a)*d,z0=c.z+Math.cos(a)*d,top=(api.WX.deck||1200)+60,bot=api.gh(x0,z0);let k=0,x=x0,z=z0,y=top;
  const seg=(x1,y1,z1)=>{b.P.set([x,y,z,x1,y1,z1],k*6);k++;x=x1;y=y1;z=z1};
  for(let i=1;i<=BSEG;i++)seg(x0+rnd(-45,45)*(i<BSEG?1:0),top+(bot-top)*i/BSEG,z0+rnd(-45,45)*(i<BSEG?1:0));
  const j=4+(Math.random()*8|0);x=b.P[j*6];y=b.P[j*6+1];z=b.P[j*6+2];for(let i=0;i<8;i++)seg(x+rnd(-10,40),y-rnd(20,45),z+rnd(-30,30));  // a branch
  b.g.setDrawRange(0,k*2);b.g.attributes.position.needsUpdate=true;b.g.computeBoundingSphere();b.o.userData.t=.32;b.o.visible=true}

 // visibility per weather; th = thermal camera on (stars, beams, lamps, glows and dust hidden, like the clouds)
 function hook(th){const W=api.WX,z=on()&&W&&W.z;
  stars.o.visible=!!(z&&!th&&W.stars);lamps.o.visible=!!(z&&!th&&W.lamps);glow.o.visible=!!(z&&!th&&W.glow);beamOn=!!(z&&!th&&W.beams);beams.forEach((b,i)=>b.visible=beamOn&&hpF(BS[i])>0);
  snow.o.visible=!!(z&&W.snow>.02);api.groundSnow=SNOW.value=z?cl(W.snow||0,0,1):0;dust.o.visible=!!(z&&!th&&W.dust);if(!z)for(const b of bolts)b.o.visible=false;
  api.deck.material.opacity=.97*(z&&W.deckA!=null?W.deckA:1);api.rainL.material.opacity=z&&W.rain>1.5?.5:.35;api.rainL.visible=!!W?.rain&&W.rain>.02;api.rainN=api.RN*(z?cl(W.rain||0,0,1)*q():gfx.k.wx);
  if(z&&th&&W.thermLift){api.sun.intensity=2.4;api.hemi.intensity=api.hemi.userData.base=1.1}  // thermal needs no light: the night picture comes out like the day one
  if(z&&W.mix&&cur&&W.deckA<1&&!th){const o=cur.A.deck?cur.B:cur.A;api.sky.visible=!o.nosky&&o.id!=='fog';scene.background=api.sky.visible?null:new THREE.Color(W.hz)}}  // while a cloud deck fades in or out, the sky of the deck-less side stays up behind it
 api.wxHook=hook;
 function step(dt,now){shift(dt);const W=api.WX,nw=on()&&W&&W.z&&W.lamps&&!api.thermLook;NIGHT.w.value=nw?1:0;
  if(nw){const sub=hpF(api.SITES[0]),apt=hpF(api.SITES[2]);NIGHT.apt.value=.55*apt**.8*(.25+.75*sub);NIGHT.vil.value=.5*sub**1.2}  /* lit windows (buildings.js): the blocks' own damage and the substation's power take them down */
  if(!on()||!W||!W.z)return;if(lamps.o.visible)lampsTick();api.groundSnow=SNOW.value=cl(W.snow||0,0,1);  /* the fields whiten under snow (ground.js), and the roofs, yards and tree tops (engine detail / snowy) */
const c=api.camera.position,t=now*.001,WI=api.WIND,k=q();
  if(snow.o.visible){const n=Math.round(SN*cl(W.snow,0,1)*k),h=SB/2;snow.g.setDrawRange(0,n);const P=snow.P,wx=WI.x*.8,wz=WI.z*.8;for(let j=0;j<64;j++){SW[j]=Math.sin(t*1.3+j)*.5;SW[j+64]=Math.cos(t*1.1+j)*.5}  // flutter: 64 phases a frame, not two trig calls per flake
   for(let i=0;i<n;i++){const i3=i*3;let x=P[i3]+(wx+SW[i&63])*dt,y=P[i3+1]-(1.1+(i&3)*.15)*dt,z=P[i3+2]+(wz+SW[64+(i*7&63)])*dt;
    P[i3]=((x-c.x+h)%SB+SB)%SB-h+c.x;P[i3+1]=((y-c.y+h)%SB+SB)%SB-h+c.y;P[i3+2]=((z-c.z+h)%SB+SB)%SB-h+c.z}snow.g.attributes.position.needsUpdate=true}
  if(dust.o.visible){const n=Math.round(DN*k),h=DB/2;dust.g.setDrawRange(0,n);const P=dust.P;
   for(let i=0;i<n;i++){const i3=i*3;let x=P[i3]+WI.x*dt,y=P[i3+1]+Math.sin(t*.4+i)*.3*dt,z=P[i3+2]+WI.z*dt;
    P[i3]=((x-c.x+h)%DB+DB)%DB-h+c.x;P[i3+1]=((y-c.y+h)%DB+DB)%DB-h+c.y;P[i3+2]=((z-c.z+h)%DB+DB)%DB-h+c.z}dust.g.attributes.position.needsUpdate=true}
  if(stars.o.visible)stars.o.position.copy(c);
  if(glow.o.visible){let g=0;const P=glow.P;for(const u of TH){if(g>=GN)break;if(!api.live(u)||u.k==='jet'||u.k==='cruise'||u.k==='ballistic'||u.k==='hyper'||u.k==='icbm'||u.p.distanceToSquared(c)>36e6)continue;P[g*3]=u.p.x;P[g*3+1]=u.p.y;P[g*3+2]=u.p.z;g++}
   glow.g.setDrawRange(0,g);glow.g.attributes.position.needsUpdate=true}
  beams.forEach((b,i)=>{b.visible=beamOn&&hpF(BS[i])>0;if(!b.visible)return;const ph=b.userData.ph,a=ph+.7*Math.sin(t*.11+ph),e=1.05+.3*Math.sin(t*.17+ph*2);b.quaternion.setFromUnitVectors(UP,_a.set(Math.cos(e)*Math.sin(a),Math.sin(e),-Math.cos(e)*Math.cos(a)))});
  if(W.bolts){const f=api.hemi.userData.f||0;if(f>lastF+.5)bolt();lastF=f}
  for(const b of bolts)if(b.o.visible){b.o.userData.t-=dt;b.o.material.opacity=Math.random()<.3?.35:1;if(b.o.userData.t<=0)b.o.visible=false}}
 function stop(){cur=null;NIGHT.w.value=0;SNOW.value=0}
 return{T,plan,start,step,note,stop,mix,get cur(){return cur},set:id=>{const p={id};start(p);return p}}}
