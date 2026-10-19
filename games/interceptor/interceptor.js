// Drone League Interceptor: a tail-sitter dart interceptor against Shahed-136 / Geran-3 waves over steppe farmland.
// The dart keeps its own flight model (thrust along the fuselage, fin side force, wind, battery) below; rates, input and calibration,
// settings, audio synth, mod panel, menu and the main loop come from the engine (../../engine).
import * as THREE from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {$,V3,QT,cl,UP,seeded,sm,vnoise,fbm} from '../../engine/util.js';
import {S,save,loadSettings} from '../../engine/settings.js';
import {initRender,renderer,scene,camera,composer,bloom,tex,glow,dot,setFov,detail,crownGeo} from '../../engine/render.js';
import {banner,feed,setFeedTime} from '../../engine/hud.js';
import {AC,audioInit,audioOn,motorAudio,noise,tone} from '../../engine/audio.js';
import {attitude,gn,ou,weathervane} from '../../engine/flight.js';
import {rate,thrCurve,stk,initRates} from '../../engine/rates.js';
import {keys,pad,axv,thrFull,calib,fireBtnIn,initInput,padEdges,mountPad,mountSwitches,pollSwitches,swRead} from '../../engine/input.js';
import {initMenu,syncUI} from '../../engine/menu.js';
import {mountMod,initModPanel,toggleMod,tab,modMsg} from '../../engine/modpanel.js';
import {startLoop} from '../../engine/loop.js';
import {initZombies} from './zombies.js';
import {strelaBody} from './strela.js';
mountMod();setFeedTime(5500);

// ---------- world constants (metres, seconds; real scale) ----------
// AO = area of operations, ±AW. Threats enter at SPAWNZ (north, -z) and fly toward the defended sites in the south (+z).
let AW=3000;const TW=9000,TN=360,CEIL=4000,SPAWNZ=-2900;  // AW is widened while Zombies runs
let G=15,FS=4,DRAD=.8,THR=58,GF=.1,SPOOL=.03,TURT=4.5,WASH=1,HBP=[],HBR=.13,DI=.22,MAXV=78,TE=1.6,VP=240,DL=.1,DQ=.006,HOV=(G/THR)**(1/TE),TAU=.012,DB=.35,GSPD=1,SHK=1,LETH=4,CRASH=30,RELT=2.5,TSPD=1,TCNT=1,BCAP=16000,MSZ=1,SAGK=1;
const _t=new V3(),_a=new V3(),_b=new V3(),_ip=new V3(),_tv=new V3(),_td=new V3(),_tl=new V3(),_vr=new V3();
const DIFF=[{n:'Light',cnt:.7,spd:.92,gap:1.3},{n:'Heavy',cnt:1,spd:1,gap:1},{n:'Saturation',cnt:1.5,spd:1.06,gap:.7}];
const RRS=[2000,5000,10000];
const DEF={mode:"acro",diff:1,tilt:90,fov:110,cam:0,thrMode:"full",cal:[{"a":2,"c":0.0275,"s":-0.7922},{"a":5,"c":-0.0431,"s":0.7843},{"a":1,"c":0.0431,"s":-0.8392},{"a":0,"c":-0.0039,"s":0.8235}],dz:0.03,fuse:'auto',fireBtn:5,wx:'random',rr:1,fpvMix:1,grain:.5,tiltSw:-1,thermSw:-1,guideSw:-1,nextSw:-1,guide:1,gmode:'classic',skin:'dart',zwx:'wave'};
loadSettings('dl-interceptor',DEF,['tilt']);  // camera tilt stays per game: the dart's camera sits at 90°, a 5-inch quad's at 30°
if(S.fuse!=='manual')S.fuse='auto';S.diff=cl(S.diff|0,0,2);S.rr=cl(S.rr|0,0,2);S.fpvMix=S.fpvMix?1:0;S.grain=cl(+S.grain||0,0,1);
if((S.setV|0)<4){S.tilt=90;S.setV=4}  // v4: interceptor cameras sit at ~90° (switch to level for take-off)

// ---------- renderer ----------
const ov=$('ov'),oc=ov.getContext('2d');let sens;
const resize=initRender({far:40000,near:.05,logDepth:true,bl:[.3,.45,1.4],exposure:.6,onResize:()=>{if(sens)renderer.getDrawingBufferSize(sens.uniforms.res.value);const r=Math.min(devicePixelRatio,2);ov.width=innerWidth*r;ov.height=innerHeight*r;oc.setTransform(r,0,0,r,0,0)}});
scene.fog=new THREE.Fog(0xc9d6e0,1500,9000);
// FPV camera feed as the goggles see it: wide-lens barrel distortion and colour fringing, a soft small-sensor picture with flat CMOS colour,
// shadow-heavy sensor noise and chroma speckle, line flicker, a rolling band, and analog-style breakup (sync jitter, torn lines, snow) as the video link weakens (lq).
// White-hot thermal turns the picture into luminance (hot = white).
sens=new ShaderPass({uniforms:{tDiffuse:{value:null},t:{value:0},gr:{value:.5},th:{value:0},lq:{value:1},ex:{value:1},res:{value:new THREE.Vector2(1,1)}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform float t,gr,th,lq,ex;uniform vec2 res;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){float bad=1.-lq,row=floor(vUv.y*res.y/2.),fr=floor(t*30.);
 vec2 c0=vUv-.5;vec2 uv=.5+c0*(1.+.13*dot(c0,c0))/1.033;  // barrel distortion
 uv.x+=((h(vec2(row*.13,fr))-.5)*.006*bad*bad+(h(vec2(row*.37,fr))>.994-.05*bad?(h(vec2(fr,row))-.5)*.035:0.))*(.3+gr);  // sync jitter and torn lines
 uv.y+=bad>.6&&h(vec2(fr,7.))>.85?(h(vec2(fr,3.))-.5)*.04*bad:0.;  // frame roll on a bad link
 vec2 ca=c0*.0035,p=1.2/res;
 vec3 c=vec3(texture2D(tDiffuse,uv+ca).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-ca).b);  // lateral colour fringing
 vec3 s=(texture2D(tDiffuse,uv+vec2(p.x,0.)).rgb+texture2D(tDiffuse,uv-vec2(p.x,0.)).rgb+texture2D(tDiffuse,uv+vec2(0.,p.y)).rgb+texture2D(tDiffuse,uv-vec2(0.,p.y)).rgb)*.25;
 c=mix(c,s,th>.5?.6:.15);  // small sensor and video compression: soft detail
 float l=dot(c,vec3(.299,.587,.114));
 if(th>.5)c=vec3(pow(clamp((l-.06)*1.35,0.,1.),.85));
 else{c=mix(vec3(l),c,1.08)*ex;c=clamp((c-.45)*1.07+.45,0.,1.)+.008;}  // FPV-cam colour: a touch more saturation and contrast, exposure
 float g=gr*(th>.5?1.6:1.),n=h(vUv*res+fract(t*7.13)*91.)-.5;
 c+=n*g*(th>.5?.1+.22*(1.-l):.04+.13*(1.-l));  // sensor noise, strongest in the shadows
 if(th<.5)c+=(vec3(h(vUv*res*.7+fract(t*3.1)*17.),h(vUv*res*.7+fract(t*5.3)*29.),h(vUv*res*.7+fract(t*2.7)*41.))-.5)*g*.03;  // chroma speckle
 c=mix(c,vec3(h(floor(vUv*res/vec2(2.,1.))+fract(t*11.)*73.)),clamp(bad*bad*1.1-.05,0.,.85));  // snow as the link fades
 c*=1.-g*(th>.5?.05:.012)*h(vec2(row,fr))-(g*(th>.5?.06:.0)+bad*.2)*smoothstep(.0,.08,abs(fract(vUv.y*.7-t*.23)-.5)-.42);  // line flicker and a rolling band
 float d=length(c0*vec2(res.x/res.y,1.));c*=1.-(th>.5?.5:.2)*smoothstep(th>.5?.4:.55,1.15,d);  // lens vignette: light on the colour cam, heavier on the thermal
 gl_FragColor=vec4(c,1.);}`});
sens.enabled=false;composer.addPass(sens);
resize();

const SUND=new V3(-.4,.48,.78).normalize();
const hemi=new THREE.HemisphereLight(0xdde9ff,0x55663f,1);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0dc,3);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);
Object.assign(sun.shadow.camera,{left:-220,right:220,top:220,bottom:-220,near:10,far:1400});sun.shadow.bias=-.0003;sun.shadow.normalBias=.4;scene.add(sun,sun.target);
// physically based sky (Preetham); also baked into the environment map so metal and water pick up the sky
const sky=new Sky();sky.scale.setScalar(30000);scene.add(sky);
const pmrem=new THREE.PMREMGenerator(renderer),envScene=new THREE.Scene(),envSky=new Sky();envSky.scale.setScalar(1000);envScene.add(envSky);let envRT=null;


// ---------- terrain: steppe farmland, windbreak tree belts, villages and a river; the defended sites sit on flattened ground in the south ----------
const rivZ=x=>-300+190*Math.sin(x/840+1)+70*Math.sin(x/260);  // river centre line, crossing the AO west to east
const PADP={n:'RADAR',x:0,z:1250,r:40},SITES=[{n:'SUBSTATION',x:-720,z:1750,r:75},{n:'FUEL DEPOT',x:660,z:1850,r:75},{n:'APARTMENTS',x:30,z:2180,r:95}];
// forward positions on the south bank of the river line: pickup, launch mat, camo net
const FOBS=[['POS WEST',-1700],['POS CENTRE',100],['POS EAST',1900]].map(([n,x])=>({n,x,z:rivZ(x)+330,r:22,fob:1})),SOLG=[PADP,...SITES,...FOBS];
function th0(x,z){let y=(fbm(x/1500+3,z/1500-1)-.45)*150+(fbm(x/320+7,z/320)-.45)*18;
 const e=Math.max(Math.abs(x),Math.abs(z))-AW+300;if(e>0)y+=e*.22*(.6+.6*vnoise(x/400,z/400));  // ridges beyond the AO
 return -14+sm((Math.abs(z-rivZ(x))-55)/160)*(y+14)}  // river valley
SOLG.forEach(f=>{f.y=th0(f.x,f.z);f.sol=[]});
function th(x,z){let y=th0(x,z);for(const f of SOLG){const d=Math.hypot(x-f.x,z-f.z);if(d<f.r+120)y+=(f.y-y)*(1-sm((d-f.r)/120))}return y}
const SEG=TW/TN,HF=new Float32Array((TN+1)**2);for(let j=0;j<=TN;j++)for(let i=0;i<=TN;i++)HF[j*(TN+1)+i]=th(-TW/2+i*SEG,-TW/2+j*SEG);
// exact height of the rendered terrain mesh (same triangle split as PlaneGeometry), so the quad lands on what you see
function gh(x,z){const fx=cl((x+TW/2)/SEG,0,TN-1e-6),fz=cl((z+TW/2)/SEG,0,TN-1e-6),i=fx|0,j=fz|0,u=fx-i,v=fz-j,N=TN+1,A=HF[j*N+i],D=HF[j*N+i+1],B=HF[(j+1)*N+i],C=HF[(j+1)*N+i+1];
 return u+v<=1?A+(D-A)*u+(B-A)*v:C+(B-C)*(1-u)+(D-C)*(1-v)}
const GT=4096,KP=GT/TW,gx=x=>(x+TW/2)*KP,TREES=[],HOUSES=[],PYL=[];
const nearSite=(x,z,m)=>SOLG.some(s=>Math.hypot(x-s.x,z-s.z)<s.r+m);
const groundTex=tex(GT,GT,g=>{const rnd=seeded(7),R=(a,b)=>a+rnd()*(b-a);
 g.fillStyle='#6a7444';g.fillRect(0,0,GT,GT);
 // big steppe fields on a slightly rotated grid (wheat, stubble, sunflower, green crops, black-earth ploughland); windbreak tree belts along many edges
 const FC=['#c4ad5f','#b8a25a','#d2bf73','#7e8c48','#66793a','#4d3e2e','#5e4a35','#9d9a5c','#a08f4a','#59723a'],A=.17,ca=Math.cos(A),sa=Math.sin(A),CW=620,CH=380;
 for(let u=-6200;u<6200;u+=CW)for(let v=-6200;v<6200;v+=CH){const cx=u*ca-v*sa,cz=u*sa+v*ca;if(Math.abs(cx)>TW/2+400||Math.abs(cz)>TW/2+400)continue;
  g.save();g.translate(gx(cx),gx(cz));g.rotate(A);const w=CW*KP,h=CH*KP,split=rnd()<.35;
  for(let k=0;k<(split?2:1);k++){const ww=split?w/2:w,ox=split?(k?w/4:-w/4):0;g.fillStyle=FC[rnd()*FC.length|0];g.fillRect(ox-ww/2+2,-h/2+2,ww-4,h-4);
   g.globalAlpha=.09;g.strokeStyle=rnd()<.5?'#000':'#fff';g.lineWidth=1;g.beginPath();if(rnd()<.5)for(let s=-ww/2+4;s<ww/2-4;s+=3){g.moveTo(ox+s,-h/2+3);g.lineTo(ox+s,h/2-3)}else for(let s=-h/2+4;s<h/2-4;s+=3){g.moveTo(ox-ww/2+3,s);g.lineTo(ox+ww/2-3,s)}g.stroke();g.globalAlpha=1}
  g.fillStyle='rgba(120,110,80,.5)';g.fillRect(-w/2,-h/2,w,1.5);g.fillRect(-w/2,-h/2,1.5,h);  // dirt tracks between fields
  for(const[on,lx0,lz0,lx1,lz1]of[[rnd()<.5,-CW/2,-CH/2,CW/2,-CH/2],[rnd()<.3,-CW/2,-CH/2,-CW/2,CH/2]]){if(!on)continue;g.strokeStyle='#2c3f1f';g.lineWidth=11*KP;g.beginPath();g.moveTo(lx0*KP,lz0*KP);g.lineTo(lx1*KP,lz1*KP);g.stroke();
   const L=Math.hypot(lx1-lx0,lz1-lz0);for(let s=0;s<L;s+=6+rnd()*4){const lx=lx0+(lx1-lx0)*s/L,lz=lz0+(lz1-lz0)*s/L,o=(rnd()-.5)*5,x=cx+lx*ca-lz*sa-o*sa,z=cz+lx*sa+lz*ca+o*ca;
    if(TREES.length<15000&&Math.abs(x)<4300&&Math.abs(z)<4300&&Math.abs(z-rivZ(x))>90&&!nearSite(x,z,30))TREES.push([x,z,R(9,17)])}}
  g.restore()}
 // forest patches along the river and on the hills
 for(let k=0;k<14;k++){const cx=R(-3800,3800),cz=k<6?rivZ(cx)+R(-260,260):R(-3800,2600);if(nearSite(cx,cz,250))continue;for(let i=0;i<300&&TREES.length<17000;i++){const a=rnd()*6.3,d=Math.sqrt(rnd())*180,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d*.7;if(Math.abs(z-rivZ(x))<75)continue;
  g.fillStyle='#283b1c';g.beginPath();g.arc(gx(x),gx(z),6*KP,0,7);g.fill();TREES.push([x,z,R(10,20)])}}
 // river: flood meadow, sand, water
 for(const[wd,c]of[[380,'#6f8045'],[150,'#b2a57c'],[110,'#3b6577']]){g.strokeStyle=c;g.lineWidth=wd*KP;g.lineJoin='round';g.beginPath();for(let x=-TW/2;x<=TW/2;x+=25)g.lineTo(gx(x),gx(rivZ(x)));g.stroke()}
 // roads: a main road north-south, one east-west past the sites, spurs to each site
 const road=(pts,w,c)=>{g.strokeStyle=c;g.lineWidth=w*KP;g.beginPath();pts.forEach(([x,z])=>g.lineTo(gx(x),gx(z)));g.stroke()};
 const NS=[],EW=[];for(let z=-TW/2;z<=TW/2;z+=25)NS.push([120+90*Math.sin(z/700),z]);for(let x=-TW/2;x<=TW/2;x+=25)EW.push([x,1990+30*Math.sin(x/420)]);
 road(NS,13,'#77756d');road(NS,9,'#8e8b82');road(EW,11,'#77756d');road(EW,7,'#8e8b82');for(const s of SOLG)road([[s.x,s.z],[s.x,1990+30*Math.sin(s.x/420)]],6,'#8a877d');
 // villages: yards and houses along a street
 for(let k=0,n=0;k<90&&n<14;k++){const cx=R(-4000,4000),cz=R(-4000,3800);if(Math.abs(cz-rivZ(cx))<260||nearSite(cx,cz,420))continue;n++;
  road([[cx-320*ca,cz-320*sa],[cx+320*ca,cz+320*sa]],6,'#8e8b82');
  for(let i=0,m=30+rnd()*45;i<m;i++){const s=R(-300,300),o=(rnd()<.5?-1:1)*R(20,48),x=cx+s*ca-o*sa,z=cz+s*sa+o*ca;
   g.save();g.translate(gx(x),gx(z));g.rotate(A);g.fillStyle='#788a4b';g.fillRect(-16*KP,-24*KP,32*KP,48*KP);g.fillStyle='#4e6a35';g.fillRect(-14*KP,4*KP,28*KP,18*KP);g.restore();HOUSES.push([x,z,A,rnd()])}}
 for(const s of SOLG){g.fillStyle=s.fob?'#5d5340':s===PADP?'#8a8b84':'#86857c';g.fillRect(gx(s.x-s.r),gx(s.z-s.r*.8),s.r*2*KP,s.r*1.6*KP);if(s.fob)road([[s.x,s.z],[s.x+40,s.z+260]],5,'#7a6f58')}
 const im=g.getImageData(0,0,GT,GT),D=im.data;for(let i=0;i<D.length;i+=4){const n=.9+Math.random()*.2;D[i]*=n;D[i+1]*=n;D[i+2]*=n}g.putImageData(im,0,0)});
{const g=new THREE.PlaneGeometry(TW,TW,TN,TN);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let k=0;k<p.count;k++)p.setY(k,HF[k]);g.computeVertexNormals();
 const m=new THREE.Mesh(g,detail(new THREE.MeshStandardMaterial({map:groundTex,roughness:1}),7,53,1,.45));m.receiveShadow=true;scene.add(m);
 // river surface: a ribbon along the river line only (the low ground elsewhere stays dry)
 const rv=[];for(let x=-TW/2;x<=TW/2;x+=25){const z=rivZ(x),dz=(rivZ(x+1)-z),n=Math.hypot(1,dz),ox=-dz/n*68,oz=1/n*68;rv.push(x+ox,-10.5,z+oz,x-ox,-10.5,z-oz)}
 const ri=[];for(let k=0;k<rv.length/6-1;k++){const a=k*2;ri.push(a,a+2,a+1,a+1,a+2,a+3)}const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rv,3));rg.setIndex(ri);rg.computeVertexNormals();
 scene.add(new THREE.Mesh(rg,new THREE.MeshStandardMaterial({color:0x2f5562,roughness:.08,metalness:.1,side:THREE.DoubleSide})))}
// trees (trunk + two-lobed crown), village houses, power line from the substation
{const m4=new THREE.Matrix4(),q=new QT(),s=new V3(),c=new THREE.Color(),N=TREES.length,
  trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.35,1,7).translate(0,.5,0),detail(new THREE.MeshStandardMaterial({color:0x4a3b2c,roughness:1}),.6,3,0,.25),N),
  crown=new THREE.InstancedMesh(crownGeo(),detail(new THREE.MeshStandardMaterial({roughness:.9,vertexColors:true}),1.3,5,0,.6),N*2);
 TREES.forEach(([x,z,h],i)=>{const y=gh(x,z)-.3,r=h*.26;m4.compose(_t.set(x,y,z),q.identity(),s.set(1+h*.03,h*.55,1+h*.03));trunk.setMatrixAt(i,m4);
  c.setHSL(.23+Math.random()*.08,.38+Math.random()*.15,.12+Math.random()*.08,THREE.SRGBColorSpace);
  for(let k=0;k<2;k++){q.setFromAxisAngle(UP,x*z+k);m4.compose(_t.set(x+(k?r*.4:-r*.3),y+h*(k?.72:.55),z+(k?-r*.3:r*.3)),q,s.set(r*(k?.8:1),r*(k?.9:1.15),r*(k?.8:1)));crown.setMatrixAt(i*2+k,m4);crown.setColorAt(i*2+k,c)}});
 for(const o of[trunk,crown]){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;scene.add(o)}
 const W=['#e9e4d6','#d8d2c0','#c9d6dc','#e6dcc0','#d9c7a8'],RF=['#5a5f66','#7d3b2e','#4f6a4a','#6b6f74','#8a8f96'],walls=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1).translate(0,.5,0),new THREE.MeshStandardMaterial({roughness:.9}),HOUSES.length),
  roofs=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,4).rotateY(Math.PI/4).translate(0,.5,0),new THREE.MeshStandardMaterial({roughness:.7,metalness:.2,flatShading:true}),HOUSES.length);
 HOUSES.forEach(([x,z,a,k],i)=>{const y=gh(x,z)-.3;q.setFromAxisAngle(UP,-a);m4.compose(_t.set(x,y,z),q,s.set(8,3.2,11));walls.setMatrixAt(i,m4);walls.setColorAt(i,c.set(W[i%5]));
  m4.compose(_t.set(x,y+3.2,z),q,s.set(6.4,3,8.4));roofs.setMatrixAt(i,m4);roofs.setColorAt(i,c.set(RF[(k*5)|0]))});
 for(const o of[walls,roofs]){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;scene.add(o)}
 // 110 kV line: lattice pylons every 320 m with sagging conductors (visual only)
 const mS=new THREE.MeshStandardMaterial({color:0x8c9298,roughness:.5,metalness:.6}),leg=new THREE.BoxGeometry(.35,1,.35),arm=new THREE.BoxGeometry(14,.5,.5),wp=[];
 const s0=SITES[0];for(let k=0;k<16;k++){const x=s0.x-160-k*300,z=s0.z-80-k*190+Math.sin(k)*40;if(Math.abs(x)>4300)break;PYL.push([x,z])}
 PYL.forEach(([x,z],k)=>{const y=gh(x,z),G2=new THREE.Group();G2.position.set(x,y,z);G2.rotation.y=Math.atan2(300,190);
  for(const[sx,sz]of[[1,1],[-1,1],[1,-1],[-1,-1]]){const l=new THREE.Mesh(leg,mS);l.scale.y=30;l.position.set(sx*1.6,15,sz*1.6);l.rotation.set(sz*.05,0,-sx*.05);G2.add(l)}
  for(const ay of[24,29]){const a=new THREE.Mesh(arm,mS);a.position.y=ay;G2.add(a)}G2.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(G2);
  if(k){const[px,pz]=PYL[k-1],py=gh(px,pz);for(const off of[-6,0,6])for(const ay of[24,29]){const ox=off*Math.cos(G2.rotation.y),oz=-off*Math.sin(G2.rotation.y);for(let i=0;i<12;i++){const f0=i/12,f1=(i+1)/12,sg=f=>-Math.sin(f*Math.PI)*6;
   wp.push(px+(x-px)*f0+ox,py+(y-py)*f0+ay+sg(f0),pz+(z-pz)*f0+oz,px+(x-px)*f1+ox,py+(y-py)*f1+ay+sg(f1),pz+(z-pz)*f1+oz)}}}});
 const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3));scene.add(new THREE.LineSegments(wg,new THREE.LineBasicMaterial({color:0x2a2c2e})))}
// solid trees and houses: shapes match the instanced meshes (trunk + two crown lobes; walls + roof), bucketed in 50 m cells for the collision SDF
const OC=50,ON=Math.ceil(TW/OC),OG=new Map(),oc0=v=>Math.floor((v+TW/2)/OC);
function oAdd(o,x,z,rad){for(let i=oc0(x-rad);i<=oc0(x+rad);i++)for(let j=oc0(z-rad);j<=oc0(z+rad);j++){let a=OG.get(i+j*ON);if(!a)OG.set(i+j*ON,a=[]);a.push(o)}}
TREES.forEach(([x,z,h])=>{const r=h*.26;oAdd({t:1,x,z,y:gh(x,z)-.3,h,r},x,z,r*1.5)});
HOUSES.forEach(([x,z,a])=>oAdd({x,z,y:gh(x,z)-.3,c:Math.cos(a),s:Math.sin(a)},x,z,8));
function sdObs(x,y,z){const L=OG.get(oc0(x)+oc0(z)*ON);let d=1e9;if(!L)return d;
 for(const o of L){const dx=x-o.x,dy=y-o.y,dz=z-o.z;
  if(o.t){const r=o.r;if(dy>o.h+r)continue;d=Math.min(d,sdCyl(dx,dy,dz,.3,0,o.h*.5),Math.hypot(dx+.3*r,(dy-o.h*.55)/1.15,dz-.3*r)-r,Math.hypot(dx-.4*r,dy-o.h*.72,dz+.3*r)-.8*r)}
  else{if(dy>7)continue;const lx=dx*o.c+dz*o.s,lz=dz*o.c-dx*o.s;d=Math.min(d,sdBox(lx,dy-1.6,lz,4,1.6,5.5),sdBox(lx,dy-4.2,lz,3,1,4))}}return d}

// ---------- weather: sky, sun, clouds, fog, wind, rain ----------
const WXS={clear:{n:'Clear',el:30,az:215,turb:2.2,ray:1.2,fog:[2500,14000],hz:0xc3d3e3,cov:.12,wind:4,dim:0,exp:.55},
 scattered:{n:'Scattered cloud',el:38,az:200,turb:3,ray:1.4,fog:[2000,12000],hz:0xc6d4e0,cov:.6,wind:7,dim:.05,exp:.55},
 overcast:{n:'Overcast',el:40,az:200,turb:8,ray:2,fog:[900,7000],hz:0xa8b0b6,cov:.25,deck:900,wind:9,dim:.8,exp:.62},
 rain:{n:'Rain',el:35,az:200,turb:10,ray:2,fog:[350,3800],hz:0x8d9499,cov:.15,deck:600,rain:1,wind:11,dim:.88,exp:.62},
 storm:{n:'Thunderstorm',el:30,az:200,turb:12,ray:2,fog:[250,2600],hz:0x6a7076,cov:0,deck:450,rain:1.8,wind:16,dim:.93,light:1,exp:.62},
 fog:{n:'Fog',el:18,az:140,turb:6,ray:1,fog:[40,1100],hz:0xb9bfc2,cov:0,wind:2,dim:.45,exp:.6},
 dusk:{n:'Dusk',el:3.5,az:250,turb:6,ray:2.5,fog:[1500,10000],hz:0xc9a585,cov:.4,wind:5,dim:.1,warm:1,exp:.62}};
let WX=null;const WB=new V3(),WIND=new V3();
const cloudTex=tex(256,256,g=>{for(let i=0;i<46;i++){const x=128+(Math.random()-.5)*150,y=140+(Math.random()-.5)*70,r=26+Math.random()*44,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.75)');gr.addColorStop(.6,'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,256,256)}});
const cloudG=new THREE.Group();scene.add(cloudG);
{const rnd=seeded(9);for(let i=0;i<150;i++){const c=new THREE.Group(),x=(rnd()-.5)*20000,z=(rnd()-.5)*20000,y=1100+rnd()*700,k=180+rnd()*320;c.position.set(x,y,z);
 for(let j=0;j<7;j++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTex,transparent:true,depthWrite:false,opacity:.9}));s.position.set((rnd()-.5)*k*1.6,(rnd()-.3)*k*.35,(rnd()-.5)*k*1.2);s.scale.set(k*(1+rnd()),k*(.55+rnd()*.4),1);c.add(s)}cloudG.add(c)}}
const deckTex=tex(512,512,g=>{g.fillStyle='#fff';g.fillRect(0,0,512,512);for(let i=0;i<500;i++){const x=Math.random()*512,y=Math.random()*512,r=20+Math.random()*60,gr=g.createRadialGradient(x,y,0,x,y,r);const v=Math.random()<.5?'0,0,0':'255,255,255';gr.addColorStop(0,`rgba(${v},.12)`);gr.addColorStop(1,`rgba(${v},0)`);g.fillStyle=gr;g.fillRect(0,0,512,512)}},true);
deckTex.repeat.set(24,24);
const deck=new THREE.Mesh(new THREE.PlaneGeometry(40000,40000),new THREE.MeshLambertMaterial({map:deckTex,color:0x9aa0a6,side:THREE.DoubleSide,transparent:true,opacity:.97,depthWrite:false}));deck.rotation.x=-Math.PI/2;scene.add(deck);
const _je=new THREE.Euler();const sunDisc=new THREE.Sprite(new THREE.SpriteMaterial({map:dot,color:new THREE.Color(0xfff2dc).multiplyScalar(4),fog:false,toneMapped:false,depthWrite:false}));sunDisc.scale.setScalar(900);scene.add(sunDisc);
// rain: streaks drawn in a box around the camera, stretched by the drop's velocity relative to the camera (so speed reads as slanted streaks)
const RN=5000,rP=new Float32Array(RN*3),rL=new Float32Array(RN*6);
for(let i=0;i<RN*3;i++)rP[i]=(Math.random()-.5)*120;
const rGeo=new THREE.BufferGeometry();rGeo.setAttribute('position',new THREE.BufferAttribute(rL,3));
const rainL=new THREE.LineSegments(rGeo,new THREE.LineBasicMaterial({color:0xc8d2dc,transparent:true,opacity:.35,depthWrite:false}));rainL.frustumCulled=false;scene.add(rainL);
const camVel=new V3(),camPrev=new V3();let flashT=8,thunder=null,rainN=RN,wxHook=null;
// id: a WXS key ('random' or unknown = a random one), or a whole weather object (Zombies' own table, zwx.js); keep = keep the wind direction
function setWeather(id,keep){const o=id&&typeof id==='object'?id:null;if(!o&&!WXS[id]){const k=Object.keys(WXS);id=k[Math.random()*k.length|0]}WX=o?{...o}:{id,...WXS[id]};
 wxSky();envRT?.dispose();envRT=pmrem.fromScene(envScene);wxLook(thermLook);
 if(keep){WB.setLength(Math.max(.1,WX.wind*.95));return}
 const a=-Math.PI*.15+(Math.random()-.5)*1.2;WB.set(Math.sin(a),0,Math.cos(a)).multiplyScalar(WX.wind*(.7+Math.random()*.5))}  // wind mostly from the north
function wxSky(){const el=WX.el*Math.PI/180,az=WX.az*Math.PI/180;SUND.set(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));
 for(const s of[sky,envSky]){const u=s.material.uniforms;u.sunPosition.value.copy(SUND);u.turbidity.value=WX.turb;u.rayleigh.value=WX.ray;u.mieCoefficient.value=.005;u.mieDirectionalG.value=.8}}
// scene look for the weather; th = white-hot thermal: cold sky goes black, no sun or cloud, engines and vehicles emit heat (the sensor pass turns it to luminance)
let thermLook=false;
function wxLook(th){scene.environment=th||WX.deck||WX.nosky?null:envRT.texture;
 scene.fog.color.set(th?0x404040:WX.hz);scene.fog.near=WX.fog[0]*(th?1.6:1);scene.fog.far=WX.fog[1]*(th?1.6:1);renderer.toneMappingExposure=WX.exp;
 const L=WX.dim;sun.intensity=WX.sunI??(WX.warm?2.2:3.4)*(1-L);sun.color.set(WX.sunC??(WX.warm?0xffb27a:0xfff0dc));hemi.intensity=hemi.userData.base=WX.hemiI??.75+.9*L;hemi.color.set(WX.hemiC??(L>.5?0xc7ccd2:0xdde9ff));hemi.groundColor.set(WX.gndC??(L>.5?0x4c5440:0x55663f));  // the optional overrides (sunI, sunC, hemiI, hemiC, gndC) are only used by Zombies' extra weathers
 deck.visible=!!WX.deck;sky.visible=!th&&!WX.deck&&WX.id!=='fog'&&!WX.nosky;scene.background=sky.visible?null:new THREE.Color(th?0x080808:WX.hz);if(WX.deck){deck.position.y=WX.deck;deck.material.color.setScalar(th?.25:.95-L*.55)}sunDisc.visible=!th&&!WX.deck&&WX.id!=='fog'&&!WX.nodisc;
 sunDisc.material.color.set(WX.discC??0xfff2dc).multiplyScalar(WX.discK??4);sunDisc.scale.setScalar(WX.discS??900);
 cloudG.children.forEach((c,i)=>{c.visible=!th&&i<WX.cov*cloudG.children.length;c.children.forEach(s=>s.material.color.set(WX.warm?0xffd2b0:L>.3?0xb8bec4:0xffffff).multiplyScalar(L>.3?1.3:2.3))});  // sunlit cumulus is brighter than the sky behind it
 for(const[m,k]of[[SHEN,7],[MS.hood,.7],[MS.met,.18],[SHJ,.22],...SHM.map(m=>[m,.16])]){m.emissive.setScalar(th?1:0);m.emissiveIntensity=k}
 bloom.strength=S.mod.bloom*(th?.7:.33);rainL.visible=!!WX.rain;wxHook?.(th)}
function weather(dt,now){const t=now*.001;WIND.copy(WB).multiplyScalar(1+.35*Math.sin(t*.7)+.2*Math.sin(t*2.3+1));if(WX.wind>8)WIND.y=Math.sin(t*1.7)*WX.wind*.08;else WIND.y=0;  // gusts
 if(rainL.visible){const c=camera.position,sp=WX.rain,fall=_a.set(WIND.x,-9-sp*2,WIND.z),k=Math.min(.06,.5/(10+camVel.length()));
  for(let i=0;i<rainN;i++){const i3=i*3,i6=i*6;let x=rP[i3]+fall.x*dt,y=rP[i3+1]+fall.y*dt,z=rP[i3+2]+fall.z*dt;
   x=((x-c.x+60)%120+120)%120-60+c.x;y=((y-c.y+60)%120+120)%120-60+c.y;z=((z-c.z+60)%120+120)%120-60+c.z;rP[i3]=x;rP[i3+1]=y;rP[i3+2]=z;
   const rx=(fall.x-camVel.x)*k,ry=(fall.y-camVel.y)*k,rz=(fall.z-camVel.z)*k;rL[i6]=x;rL[i6+1]=y;rL[i6+2]=z;rL[i6+3]=x-rx;rL[i6+4]=y-ry;rL[i6+5]=z-rz}
  rGeo.attributes.position.needsUpdate=true}
 if(WX.light){if((flashT-=dt)<=0){flashT=5+Math.random()*12;hemi.userData.f=1;thunder=1.5+Math.random()*4}
  const f=hemi.userData.f||0;if(f>0){hemi.userData.f=Math.max(0,f-dt*5);hemi.intensity=hemi.userData.base+f*6*(Math.random()<.7?1:.3)}
  if(thunder!=null&&(thunder-=dt)<=0){thunder=null;noise(3.5,70,.7,.4);noise(1.2,160,.35,.6)}}}

// ---------- defended sites (solid: the interceptor collides with them) ----------
const sdBox=(x,y,z,hx,hy,hz)=>{const qx=Math.abs(x)-hx,qy=Math.abs(y)-hy,qz=Math.abs(z)-hz;return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)};
const sdCyl=(x,y,z,r,y0,y1)=>{const dx=Math.hypot(x,z)-r,dy=Math.abs(y-(y0+y1)/2)-(y1-y0)/2;return Math.min(Math.max(dx,dy),0)+Math.hypot(Math.max(dx,0),Math.max(dy,0))};
const MS={conc:detail(new THREE.MeshStandardMaterial({color:0x9b9d97,roughness:.9}),3,19),met:new THREE.MeshStandardMaterial({color:0x66705f,roughness:.5,metalness:.5}),steel:new THREE.MeshStandardMaterial({color:0xa7adb3,roughness:.4,metalness:.7}),
 brick:new THREE.MeshStandardMaterial({color:0x9a6a4d,roughness:.9}),tank:new THREE.MeshStandardMaterial({color:0xdfe1dc,roughness:.45,metalness:.3}),roof:new THREE.MeshStandardMaterial({color:0x55575a,roughness:.9}),
 dark:new THREE.MeshStandardMaterial({color:0x1d1f21,roughness:.6,metalness:.4})};
const facade=tex(256,256,g=>{g.fillStyle='#c9c4b8';g.fillRect(0,0,256,256);for(let r=0;r<4;r++)for(let c=0;c<4;c++){g.fillStyle=Math.random()<.2?'#d9c48e':'#2c3440';g.fillRect(c*64+14,r*64+16,36,30);g.fillStyle='#b0ab9f';g.fillRect(c*64+10,r*64+48,44,5)}},true);
const MF=new THREE.MeshStandardMaterial({map:facade,roughness:.85});
function part(s,geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(s.x+x,s.y+y,s.z+z);m.castShadow=m.receiveShadow=true;scene.add(m);return m}
function boxS(s,w,h,d,mat,x,y0,z,solid=true){part(s,new THREE.BoxGeometry(w,h,d),mat,x,y0+h/2,z);if(solid)s.sol.push({x:s.x+x,y:s.y+y0+h/2,z:s.z+z,hx:w/2,hy:h/2,hz:d/2})}
function cylS(s,r,h,mat,x,y0,z){part(s,new THREE.CylinderGeometry(r,r,h,32),mat,x,y0+h/2,z);s.sol.push({c:1,x:s.x+x,z:s.z+z,r,y0:s.y+y0,y1:s.y+y0+h})}
function block(s,w,h,d,x,z){const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;for(let i=0;i<24;i++){const f=i>>2;if(f===2||f===3)continue;uv.setXY(i,uv.getX(i)*(f<2?d:w)/16,uv.getY(i)*h/12)}
 part(s,g,[MF,MF,MS.roof,MS.roof,MF,MF],x,h/2,z);s.sol.push({x:s.x+x,y:s.y+h/2,z:s.z+z,hx:w/2,hy:h/2,hz:d/2});s.aims.push(new V3(s.x+x,s.y+h,s.z+z))}
SITES.forEach(s=>{s.aims=[];s.max=3;s.hp=3});
{const s=SITES[0];boxS(s,120,.4,90,MS.conc,0,0,0);  // substation: transformers, gantries, control building
 for(const x of[-36,-12,12,36]){boxS(s,8,7,6,MS.met,x,0,-12);boxS(s,10,5,1.4,MS.met,x,.8,-7.6,false);for(const bx of[-2.5,0,2.5])part(s,new THREE.CylinderGeometry(.25,.35,3,8),MS.steel,x+bx,8.5,-12);s.aims.push(new V3(s.x+x,s.y+7,s.z-12))}
 for(const z of[10,22])for(const x of[-46,46])boxS(s,.8,18,.8,MS.steel,x,0,z);for(const z of[10,22])boxS(s,93,1,1,MS.steel,0,17.5,z,false);
 boxS(s,26,8,12,MS.brick,0,0,34)}
{const s=SITES[1];boxS(s,120,.4,90,MS.conc,0,0,0);  // fuel depot: six storage tanks
 for(const x of[-34,0,34])for(const z of[-17,17]){cylS(s,11,15,MS.tank,x,0,z);part(s,new THREE.ConeGeometry(11.2,2,32),MS.tank,x,16,z);s.aims.push(new V3(s.x+x,s.y+16,s.z+z))}}
{const s=SITES[2];for(const[x,z]of[[-46,-34],[46,-34],[-46,34],[46,34]])block(s,66,27,14,x,z);block(s,22,48,22,0,0)}  // nine-storey panel blocks and a tower
// radar site: a container and a mast with the ground radar (the old catapult pad)
{const s=PADP;boxS(s,40,.3,30,MS.conc,0,0,0);boxS(s,6,2.6,2.4,MS.met,-14,0,8);boxS(s,.5,9,.5,MS.steel,12,0,8);part(s,new THREE.BoxGeometry(2.8,1.1,.2),MS.dark,12,9.5,8).userData.spin=1}
const RADM=scene.children.find(o=>o.userData.spin);
const PADY=PADP.y+.3;
// forward positions: rubber launch mat in the open, pickup under a camo net, ground station mast, battery crates
MS.mat=new THREE.MeshStandardMaterial({color:0x252b22,roughness:1});MS.truck=new THREE.MeshStandardMaterial({color:0x4d5236,roughness:.6,metalness:.3});MS.hood=new THREE.MeshStandardMaterial({color:0x4d5236,roughness:.6,metalness:.3});
const netTex=tex(256,256,g=>{const C=['#3f4a2a','#5a5f35','#6b5a3a','#2f3a22','#7a7048'];for(let i=0;i<260;i++){g.fillStyle=C[i%5];g.beginPath();g.ellipse(Math.random()*256,Math.random()*256,6+Math.random()*16,4+Math.random()*10,Math.random()*3,0,7);g.fill()}
 g.globalCompositeOperation='destination-out';for(let i=0;i<90;i++){g.beginPath();g.arc(Math.random()*256,Math.random()*256,2+Math.random()*7,0,7);g.fill()}
 g.globalCompositeOperation='source-over';g.strokeStyle='#2c3020';g.lineWidth=1.2;for(let k=0;k<256;k+=10){g.beginPath();g.moveTo(k,0);g.lineTo(k+60,256);g.moveTo(0,k);g.lineTo(256,k+60);g.stroke()}},true);
netTex.repeat.set(3,3);MS.net=new THREE.MeshStandardMaterial({map:netTex,alphaTest:.5,side:THREE.DoubleSide,roughness:1});
for(const s of FOBS){s.mat=new V3(s.x,s.y+.06,s.z-7);boxS(s,2.6,.06,2.6,MS.mat,0,0,-7);
 boxS(s,1.9,.8,5.2,MS.truck,5,.45,3);boxS(s,1.8,.85,1.9,MS.truck,5,1.25,2.3);boxS(s,1.85,.3,1.1,MS.hood,5,1.1,.85,false);
 for(const x of[4.1,5.9])for(const z of[1.4,4.6])part(s,new THREE.CylinderGeometry(.38,.38,.28,14).rotateZ(Math.PI/2),MS.dark,x,.38,z);
 for(const x of[4.1,5.9])boxS(s,.08,.45,2.2,MS.truck,x,1.25,4.5,false);
 const ng=new THREE.PlaneGeometry(13,11,12,12).rotateX(-Math.PI/2),np=ng.attributes.position;for(let i=0;i<np.count;i++){const x=np.getX(i),z=np.getZ(i);np.setY(i,Math.max(.25,3.1-2.9*((x/6.5)**2+(z/5.5)**2)**.8)+Math.sin(x*1.7+z)*.08)}ng.computeVertexNormals();
 const net=part(s,ng,MS.net,4,0,3);net.castShadow=false;part(s,new THREE.CylinderGeometry(.04,.04,3.1,6),MS.steel,4,1.55,3);
 boxS(s,.12,5,.12,MS.steel,-3,0,1,false);part(s,new THREE.BoxGeometry(.5,.35,.08),MS.dark,-3,5.1,1);
 for(const[x,z]of[[-1.6,-3.4],[-1.6,-2.6],[-2.4,-3]])boxS(s,.7,.45,.5,MS.met,x,0,z)}

// ---------- particles (fire/sparks additive, smoke alpha-blended) ----------
const _c=new THREE.Color();
function psys(N,size,blend,grav,drag){const P=new Float32Array(N*3).fill(-9999),C=new Float32Array(N*4),B=new Float32Array(N*4),VV=new Float32Array(N*3),LF=new Float32Array(N),L0=new Float32Array(N);let i0=0;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('color',new THREE.BufferAttribute(C,4));
 const pts=new THREE.Points(g,new THREE.PointsMaterial({size,map:dot,vertexColors:true,transparent:true,blending:blend,depthWrite:false,toneMapped:blend!==THREE.AdditiveBlending}));pts.frustumCulled=false;scene.add(pts);
 return{emit(p,hex,n,spd,life=1,bv=null,k=1,a=1){_c.set(hex).multiplyScalar(k);for(let j=0;j<n;j++){const i=i0++%N,i3=i*3,i4=i*4;
   let x=Math.random()*2-1,y=Math.random()*2-1,z=Math.random()*2-1;const m=spd*(.3+Math.random()*.7)/(Math.hypot(x,y,z)||1);
   P[i3]=p.x;P[i3+1]=p.y;P[i3+2]=p.z;VV[i3]=x*m+(bv?bv.x:0);VV[i3+1]=y*m+(bv?bv.y:0);VV[i3+2]=z*m+(bv?bv.z:0);B[i4]=_c.r;B[i4+1]=_c.g;B[i4+2]=_c.b;B[i4+3]=a;LF[i]=L0[i]=life*(.5+Math.random()*.5)}},
  upd(dt){const dm=Math.exp(-dt*drag),wx=WIND.x*(1-dm),wz=WIND.z*(1-dm);for(let i=0;i<N;i++){if(LF[i]<=0)continue;const i3=i*3,i4=i*4;if((LF[i]-=dt)<=0){P[i3+1]=-9999;C[i4+3]=0;continue}
   VV[i3]=VV[i3]*dm+wx;VV[i3+1]=VV[i3+1]*dm-grav*dt;VV[i3+2]=VV[i3+2]*dm+wz;P[i3]+=VV[i3]*dt;P[i3+1]+=VV[i3+1]*dt;P[i3+2]+=VV[i3+2]*dt;
   const f=Math.min(1,LF[i]/L0[i]*2);C[i4]=B[i4];C[i4+1]=B[i4+1];C[i4+2]=B[i4+2];C[i4+3]=B[i4+3]*f}
   g.attributes.position.needsUpdate=g.attributes.color.needsUpdate=true}}}
const FX=psys(3000,1.6,THREE.AdditiveBlending,3,1.8),SMK=psys(2500,10,THREE.NormalBlending,-2.5,.6);
const boomL=new THREE.PointLight(0xffa040,0,600,1.2);scene.add(boomL);

// ---------- audio (engine motor synth; bigger interceptor props turn slower than a 5", wind noise follows airspeed) ----------
let bzo,bzg,bzf;const _ad=new V3();
// nearest threat: the Shahed's two-stroke "moped" buzz, or a jet's turbine whine
const audioStart=()=>audioInit({motor:{rot:[50,300],wind:[45,1.4],phys:()=>[G,TE,VP]},extra:AC=>{bzf=AC.createBiquadFilter();bzf.type='lowpass';bzf.frequency.value=900;bzg=AC.createGain();bzg.gain.value=0;bzo=AC.createOscillator();bzo.type='sawtooth';bzo.frequency.value=95;bzo.connect(bzf).connect(bzg).connect(AC.destination);bzo.start()}});
function audioTick(dt){const me=player,on=!demo&&!paused&&me&&me.dead<=0,t=AC.currentTime;
 const nt=nearestThreat(camera.position);let g=0,fz=95;if(nt&&!paused){const r=_a.subVectors(nt.p,camera.position),d=r.length();g=Math.pow(cl(1-d/(nt.jet?1400:800),0,1),2)*(nt.jet?.07:.1);fz=(nt.jet?nt.spd>70?1400:900:95)*(1-nt.v.dot(r)/d/343)}  // Doppler
 bzg.gain.setTargetAtTime(demo?g*.4:g,t,.1);bzo.frequency.setTargetAtTime(fz,t,.1);bzf.frequency.setTargetAtTime(nt?.jet?4000:900,t,.2);
 motorAudio(me,dt,on,WIND)}
const near=p=>cl(1-p.distanceTo(camera.position)/900,0,1);

// ---------- physics ----------
// world SDF (positive = inside solid): terrain, AO walls, ceiling, trees and houses, and the site structures
function sdf(x,y,z){const g=gh(x,z);let d=Math.max((g-y)*.85,Math.abs(x)-AW,Math.abs(z)-AW,y-CEIL);if(y-g<26){const e=sdObs(x,y,z);if(-e>d)d=-e}
 for(const s of SOLG){if(Math.abs(x-s.x)>s.r+15||Math.abs(z-s.z)>s.r+15||y>s.y+60)continue;
  for(const o of s.sol){const e=o.c?sdCyl(x-o.x,y,z-o.z,o.r,o.y0,o.y1):sdBox(x-o.x,y-o.y,z-o.z,o.hx,o.hy,o.hz);if(-e>d)d=-e}}return d}
const _an=new V3();
function sdN(p,out){const h=.02,x=p.x,y=p.y,z=p.z;out.set(sdf(x+h,y,z)-sdf(x-h,y,z),sdf(x,y+h,z)-sdf(x,y-h,z),sdf(x,y,z+h)-sdf(x,y,z-h));const l=out.length();return l>1e-9?out.divideScalar(l):out.set(0,1,0)}

// ---------- interceptor: tail-sitter dart on the Drone League flight model ----------
// tail-sitter dart: fuselage along the thrust axis (body +Y = nose), camera on a tilt servo in the nose, pulling props near the nose, cruciform tail fins it stands on
const GEO={body:new THREE.CylinderGeometry(.062,.058,.56,18),nose:new THREE.SphereGeometry(.062,18,10,0,Math.PI*2,0,Math.PI/2).scale(1,1.7,1),
 tail:new THREE.ConeGeometry(.058,.08,18).rotateX(Math.PI),fin:(()=>{const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(.1,-.1);s.lineTo(.1,-.2);s.lineTo(0,-.16);s.closePath();return new THREE.ExtrudeGeometry(s,{depth:.006,bevelEnabled:false}).translate(.05,-.16,-.003)})(),
 arm:new THREE.BoxGeometry(.5,.016,.03),motor:new THREE.CylinderGeometry(.026,.03,.04,14),bell:new THREE.CylinderGeometry(.03,.03,.012,14),
 prop:new THREE.CircleGeometry(.13,28).rotateX(-Math.PI/2),blade:new THREE.BoxGeometry(.26,.005,.026),lens:new THREE.SphereGeometry(.026,12,8),band:new THREE.CylinderGeometry(.066,.066,.04,18),
 ant:new THREE.CylinderGeometry(.004,.004,.12,5)};
const MAT={carbon:new THREE.MeshStandardMaterial({color:0x16191f,roughness:.45,metalness:.6}),metal:new THREE.MeshStandardMaterial({color:0x8a919c,roughness:.3,metalness:.9}),
 prop:new THREE.MeshBasicMaterial({color:0xaab4c8,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}),lens:new THREE.MeshStandardMaterial({color:0x050505,roughness:.05,metalness:1}),
 olive:new THREE.MeshStandardMaterial({color:0x5a6240,roughness:.65,metalness:.15}),blade:new THREE.MeshStandardMaterial({color:0x22252a,roughness:.5,transparent:true,opacity:.65}),
 band:new THREE.MeshStandardMaterial({color:0xd8b12a,roughness:.5}),led:glow(0xff3030,4)};
const _q=new QT(),_v=new V3(),_w=new V3(),_u=new V3();
class Drone{
 constructor(){Object.assign(this,{p:new V3(),v:new V3(),q:new QT(),w:new V3(),wt:new V3(),thr:0,ms:0,gt:0,wn:new V3(),vp:0,vc:4.2,tb:new V3(),gu:new V3(),dead:0,mah:0,t:0,home:FOBS[1]});this.build();this.spawn()}
 // two looks share the quad hardware: Riley's dart (Classic default) and a 9K32 Strela-2 body (strela.js; Zombies, or the Classic menu option)
 build(){const g=this.mesh=new THREE.Group(),dart=this.dart=new THREE.Group();this.strela=strelaBody();g.add(dart,this.strela);
  const add=(geo,mat,x,y,z,ry=0,par=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=true;par.add(m);return m};
  add(GEO.body,MAT.olive,0,0,0,0,dart);add(GEO.nose,MAT.olive,0,.28,0,0,dart);add(GEO.tail,MAT.olive,0,-.32,0,0,dart);add(GEO.band,MAT.band,0,.17,0,0,dart);  // fuselage, warhead section behind the nose
  for(let k=0;k<4;k++)add(GEO.fin,MAT.carbon,0,0,0,k*Math.PI/2,dart);
  add(GEO.arm,MAT.carbon,0,.1,0,Math.PI/4);add(GEO.arm,MAT.carbon,0,.1,0,-Math.PI/4);
  this.props=[];for(const[x,z]of[[.17,.17],[-.17,.17],[.17,-.17],[-.17,-.17]]){add(GEO.motor,MAT.metal,x,.12,z);add(GEO.bell,MAT.carbon,x,.143,z);const pr=add(GEO.prop,MAT.prop,x,.152,z);pr.castShadow=false;add(GEO.blade,MAT.blade,0,0,0,0,pr);this.props.push(pr)}
  add(GEO.lens,MAT.lens,0,.36,-.02,0,dart);add(GEO.ant,MAT.carbon,.15,-.3,0,0,dart);add(new THREE.BoxGeometry(.02,.04,.02),MAT.led,0,-.2,.062,0,dart);
  this.nozzle=new THREE.Object3D();this.nozzle.position.set(0,-.375,0);g.add(this.nozzle);  // tail / motor nozzle exit (both looks): attach exhaust effects here, they point along local -Y
  this.look();scene.add(g)}
 look(){const s=Z.on||S.skin==='strela';this.strela.visible=s;this.dart.visible=!s}
 // on the launch mat at the forward position nearest the most urgent track, standing on its fins, nose up, facing the track, motors off
 spawn(){const u=selT(),f=this.home=u?FOBS.reduce((a,b)=>Math.hypot(b.x-u.p.x,b.z-u.p.z)<Math.hypot(a.x-u.p.x,a.z-u.p.z)?b:a):FOBS[1];
  this.p.set(f.mat.x,f.mat.y+(.36+.04)*MSZ+.005,f.mat.z);this.v.set(0,0,0);this.w.set(0,0,0);this.wt.set(0,0,0);
  this.q.setFromAxisAngle(UP,u?Math.atan2(f.x-u.p.x,f.z-u.p.z):0);this.dead=0;this.thr=this.ms=0;this.tb.set(0,0,0);this.gu.set(0,0,0);this.vp=0;this.vc=4.2;this.gt=.12;this.mah=0;this.t=0;this.mesh.visible=true;this.look()}
 step(dt){const gd=(this.gt-=dt)>0;let wt=this.wt;if(gd){wt=_gw.copy(wt);wt.y*=.15;wt.clampLength(0,TURT);if(THR*this.ms**TE<G*.5&&_u.set(0,1,0).applyQuaternion(this.q).y>.7)wt.set(0,0,0)}this.t+=dt;  // standing on its fins below half-hover thrust: the sticks can't tip it over
  // on the ground without enough lift to fly, sticks lever the frame over its lowest edge (turtle-style, no switch needed)
  if(gd&&this.v.lengthSq()<25&&wt.lengthSq()>.04&&THR*this.ms**TE*_u.set(0,1,0).applyQuaternion(this.q).y<G*.9&&_u.y<.7&&this.pivot(wt,dt))return 0;  // only once it has fallen over: standing on its fins it stays put
  if(gd)this.w.lerp(wt,1-Math.exp(-dt/.09));
  else{const au=AMAX*(.55+.45*sm(Math.min(this.ms,1-this.ms)*4)),dw=_dw.subVectors(wt,this.w).multiplyScalar(1-Math.exp(-dt/TAU)),lim=au*dt;if(dw.length()>lim)dw.setLength(lim);this.w.add(dw);this.aero(dt)}  // rate loop with finite authority: differential thrust runs out near idle and full throttle
  const AIR=_ag.copy(WIND).add(this.gu),up=_u.set(0,1,0).applyQuaternion(this.q),va=_vr.subVectors(this.v,AIR).dot(up);
  if(WASH>0&&va<-6&&this.ms>.15){const a=WASH*cl((-va-6)/18,0,1)*this.ms*2.5,k=Math.min(1,dt*9);this.wn.x+=(Math.random()-.5-this.wn.x)*k;this.wn.z+=(Math.random()-.5-this.wn.z)*k;this.w.x+=this.wn.x*a;this.w.z+=this.wn.z*a}  // falling into your own prop wash
  const wl=this.w.length();if(wl>1e-6){_q.setFromAxisAngle(_v.copy(this.w).divideScalar(wl),wl*dt);this.q.multiply(_q).normalize();up.set(0,1,0).applyQuaternion(this.q)}
  this.ms+=(this.thr-this.ms)*(1-Math.exp(-dt/Math.max(1e-3,this.thr>this.ms?SPOOL:SPOOL*1.6)));  // motor spool-up / spin-down
  const I=this.amp=6+220*Math.max(this.ms,0)**1.5;this.mah+=I*dt/3.6;this.vp+=(I*.0011-this.vp)*(1-Math.exp(-dt/(I*.0011>this.vp?.6:2.5)));this.vc=ocv(this.mah/BCAP)-(I*.0016+this.vp)*SAGK;  // pack current (A), mAh used, per-cell voltage: IR drop (1.6 mΩ/cell) + polarisation that builds over ~0.6 s and recovers over ~2.5 s
  let acc=THR*this.ms**TE*Math.min(1.04,(Math.max(this.vc,3)/4.05)**1.6);  // thrust ~ rpm² ~ voltage² at a given throttle: sags with load and as the pack drains (1.0 at a fresh pack in hover)
  acc*=cl(1-va/VP,0,1.15);  // prop inflow: thrust falls off as the air through the disc nears the prop's pitch speed
  this.v.addScaledVector(up,acc*dt);this.v.y-=G*dt;if(this.boost)this.v.addScaledVector(up,this.boost*dt);  // Zombies Rocket Assist: extra thrust along the body axis (never set in Classic)
  const vr=_vr.subVectors(this.v,AIR),s=vr.length();if(s>1e-4){const bx=_x.set(1,0,0).applyQuaternion(this.q),bz=_z.set(0,0,1).applyQuaternion(this.q),k=DQ*s,vx=vr.dot(bx),vy=vr.dot(up),vz=vr.dot(bz);
   _gw.copy(bx).multiplyScalar(vx*(DL+k*FS)).addScaledVector(up,vy*(DL+k)).addScaledVector(bz,vz*(DL+k*FS));const dl=_gw.length()*dt;this.v.addScaledVector(_gw,-dt*(dl>s?s/dl:1))}  // body-axis drag on the airspeed (wind included): the dart slips through the air nose-first, while the fuselage and cruciform fins resist sideways flow (FS x), which swings the velocity onto the nose, so it flies where it points and the fins carry it in level flight
  const s2=this.v.length(),mv=MAXV+(this.bmax||0);if(s2>mv)this.v.multiplyScalar(Math.max(mv/s2,1-dt*2));
  this.p.addScaledVector(this.v,dt);const hit=this.ground();if(hit>9)noise(.12,500,cl(hit/60,0,.4));return hit}
 // airframe aerodynamics and the air it flies through: turbulence (stronger with wind, speed, near the ground and in a Shahed's wake), cruciform fins that
 // weathervane the nose into the airflow and damp pitch/yaw, gusts that push the airframe around. The rate loop has to fight all of it with finite authority.
 aero(dt){const vr=_vr.subVectors(this.v,WIND),s=vr.length(),agl=this.p.y-gh(this.p.x,this.p.z);let wk=0;
  for(const t of TH)if(live(t)){const r=_wk.subVectors(this.p,t.p),dv=_tv.copy(t.v).normalize(),al=r.dot(dv);if(al<-2&&al>-70){const lat=r.addScaledVector(dv,-al).length();if(lat<7)wk=Math.max(wk,(1-lat/7)*(1+al/70))}}
  const sg=(.3+WX.wind*.12+s*.015)*(1+.5*sm(1-agl/60))*(1+2*wk),gs=.08*WX.wind+.2+3*wk;
  this.w.addScaledVector(ou(this.tb,dt,.25,sg,.4),dt);ou(this.gu,dt,1.8,gs,.5);  // coloured noise: sg rad/s² over 0.25 s, gs m/s over 1.8 s
  if(s>6)weathervane(this,vr,s,dt,KW,KD)}  // fins rotate the nose toward the relative wind
 pivot(wt,dt){const ww=_ww.copy(wt).applyQuaternion(this.q);let bv=-.05,ok=false;
  for(const C of HBP){const r=_br.copy(C).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r);if(sdf(P.x,P.y,P.z)+HBR<-.15)continue;
   const n=sdN(P,_an);r.addScaledVector(n,HBR);const s=_vp.crossVectors(ww,r).dot(n);if(-s<bv){bv=-s;_pv.copy(r);ok=true}}  // corner the rotation would push hardest into the ground = pivot
  if(!ok)return false;this.w.copy(wt);this.v.crossVectors(ww,_pv).negate();this.ms+=(this.thr-this.ms)*.1;
  const wl=wt.length();_q.setFromAxisAngle(_v.copy(wt).divideScalar(wl),wl*dt);this.q.multiply(_q).normalize();this.p.addScaledVector(this.v,dt);this.ground();this.gt=.12;return true}
 // rounded rectangular frame vs the world: spheres along a rounded-rectangle outline, impulses shared between touching points, with lever arms so the quad tips and slides instead of spinning in place
 ground(){let m=0,c=0,dm=0;const ww=_ww.copy(this.w).applyQuaternion(this.q),na=_gw.set(0,0,0);
  for(const C of HBP){const r=_br.copy(C).applyQuaternion(this.q),P=_bp2.copy(this.p).add(r),d=sdf(P.x,P.y,P.z)+HBR;if(d<=0)continue;
   const h=_H[c++];sdN(P,h[1]).negate();h[0].copy(r).addScaledVector(h[1],-HBR);na.add(h[1]);dm=Math.max(dm,d)}
  if(!c)return 0;this.p.addScaledVector(na.normalize(),dm);
  for(let i=0;i<c;i++){const[r,n]=_H[i],vp=_vp.crossVectors(ww,r).add(this.v),vn=vp.dot(n);if(vn>=0)continue;
   const rn=_rn.crossVectors(r,n),den=1+rn.lengthSq()/DI,j=-(1+(-vn>3?DB:0))*vn/den/c*1.6;this.v.addScaledVector(n,j);ww.addScaledVector(rn,j/DI);
   vp.addScaledVector(n,-vn);const tl=vp.length();if(tl>1e-4){vp.divideScalar(tl);const rt=_rn.crossVectors(r,vp),jt=Math.min(GF*j,tl/(1+rt.lengthSq()/DI)/c);this.v.addScaledVector(vp,-jt);ww.addScaledVector(rt,-jt*.3/DI)}
   m=Math.max(m,-vn)}
  this.w.copy(ww).applyQuaternion(_qb.copy(this.q).invert());this.gt=.12;return m}}
const _H=Array.from({length:16},()=>[new V3(),new V3()]),_pv=new V3();
const _dw=new V3(),_ag=new V3(),_ax=new V3(),_wk=new V3(),AMAX=140,KW=.003,KD=.01;
const _gw=new V3(),_ww=new V3(),_br=new V3(),_bp2=new V3(),_vp=new V3(),_rn=new V3(),_qb=new QT();
const cellV=d=>d.vc;  // loaded per-cell voltage (see Drone.step)
// LiPo resting voltage per cell vs fraction used: 4.2 full, a long 3.8–3.7 plateau, falling off a cliff past ~85%
function ocv(u){u=cl(u,0,1);return u<.1?4.2-u*2.5:u<.85?3.95-(u-.1)*.4:3.65-(u-.85)*4}

const _x=new V3(),_z=new V3();
// ---------- human input ----------
const ks={y:0,p:0,r:0};let kbThr=HOV,kbArm=false,fireWas=false;
const _f=new V3(),_r=new V3();
function humanControl(d,dt){const g=pad();let thr=null,yaw=0,pit=0,rol=0;
 if(g&&!(menuOpen&&calib)){const t=axv(g,0);
  thr=thrFull()?(t+1)/2:(t>=0?HOV+t*(1-HOV):HOV*(1+t));yaw=axv(g,1);pit=axv(g,2);rol=axv(g,3)}
 const k=c=>keys[c]?1:0,sm=(c,t)=>c+(t-c)*Math.min(1,dt*(t?14:22));
 ks.y=sm(ks.y,k('KeyD')-k('KeyA'));ks.p=sm(ks.p,k('ArrowUp')-k('ArrowDown'));ks.r=sm(ks.r,k('ArrowRight')-k('ArrowLeft'));
 const kt=k('KeyW')-k('KeyS');if(kt>0)kbArm=true;kbThr+=((kt>0?1:kt<0||!kbArm?0:HOV)-kbThr)*Math.min(1,dt*10);  // keyboard: motors stay at idle on the mat until W is first pressed
 if(thr===null||kt)thr=kbThr;
 const pick=(a,b)=>Math.abs(b)>Math.abs(a)?b:a;yaw=pick(yaw,ks.y);pit=pick(pit,ks.p);rol=pick(rol,ks.r);
 stk[3]=cl(thr,0,1);d.thr=thrCurve(stk[3]);
 stk[0]=rol;stk[1]=pit;stk[2]=yaw;
 // Betaflight fpv_mix_degrees: roll and yaw are mixed through the camera angle, so roll stick rolls the picture about the camera's line of sight (at 90° it spins the dart about its fuselage)
 if(S.mode==='acro'){const ro=rate(0,rol),yw=rate(2,yaw),a=S.fpvMix?camA()*Math.PI/180:0,c=Math.cos(a),s=Math.sin(a);d.wt.set(-rate(1,pit),ro*s-yw*c,-ro*c-yw*s)}
 else{const f=fwdH(d.q,_f);if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();  // Angle mode: full stick = 88° of tilt, enough for dart cruise
  const r=_r.crossVectors(f,UP),m=Math.min(1,Math.hypot(pit,rol)),u=_v.copy(UP);if(m>1e-3)u.multiplyScalar(Math.cos(m*1.535)).addScaledVector(_b.copy(f).multiplyScalar(pit).addScaledVector(r,rol).normalize(),Math.sin(m*1.535));attitude(d,u,f,16,18,1);d.wt.y-=rate(2,yaw)*.7}}
// horizontal heading of the airframe: works hovering (camera side) and in dart cruise (nose)
const fwdH=(q,o)=>o.set(0,1,-1).applyQuaternion(q).setY(0);
const fireIn=fireBtnIn;
// camera tilt switch (S.tilt for cruise / level for take-off and hover) and thermal switch: keyboard L / H toggle; a mapped radio switch axis sets the position whenever it moves, a mapped button toggles
let camUp=false,therm=false;const camA=()=>camUp?S.tilt:0;
const setGuide=v=>{S.guide=v?1:0;save();if(!demo)banner(v?'GUIDANCE ON':'GUIDANCE OFF','',.7)};
const setCam=v=>{if(v!==camUp){camUp=v;if(!demo)banner(v?`CAM ${S.tilt}°`:'CAM LEVEL','',.7)}},setTherm=v=>{if(v!==therm){therm=v;if(!demo)banner(v?'THERMAL WHT':'DAY CAM','',.7)}};
const SWA={tiltSw:[setCam,()=>camUp],thermSw:[setTherm,()=>therm],guideSw:[v=>setGuide(v),()=>!!S.guide],nextSw:[()=>nextTrack(),null]};
const switches=()=>pollSwitches(SWA);

// ---------- threats: Shahed-136 / Geran-2 (3.5 m, 2.5 m span, MD-550 two-stroke pusher, ~185 km/h) and jet Geran-3 (3.5 m, 3 m span, turbojet on top, 300–370 km/h) ----------
function shWing(span){const s=new THREE.Shape(),h=span/2;s.moveTo(0,.95);s.lineTo(h,-.95);s.lineTo(h,-1.72);s.lineTo(-h,-1.72);s.lineTo(-h,-.95);s.closePath();return new THREE.ExtrudeGeometry(s,{depth:.06,bevelEnabled:true,bevelThickness:.015,bevelSize:.02,bevelSegments:1}).rotateX(Math.PI/2).translate(0,-.02,0)}
const SHG={body:new THREE.LatheGeometry([[0,-1.78],[.12,-1.76],[.2,-1.6],[.25,-1.2],[.27,-.2],[.27,.9],[.25,1.35],[.2,1.6],[.12,1.73],[0,1.78]].map(([r,y])=>new THREE.Vector2(r,y)),20).rotateX(Math.PI/2),
 wing:shWing(2.5),wingJ:shWing(3),fin:(()=>{const s=new THREE.Shape();s.moveTo(0,-.45);s.lineTo(.5,-.3);s.lineTo(.55,.35);s.lineTo(.1,.5);s.closePath();return new THREE.ExtrudeGeometry(s,{depth:.03,bevelEnabled:false}).rotateY(-Math.PI/2).translate(.015,0,-1.25)})(),
 hub:new THREE.CylinderGeometry(.08,.12,.2,12).rotateX(Math.PI/2),disc:new THREE.CircleGeometry(.4,24),blade:new THREE.BoxGeometry(.78,.07,.025),
 pod:new THREE.CylinderGeometry(.15,.17,1.15,16).rotateX(Math.PI/2),pylon:new THREE.BoxGeometry(.08,.18,.6),ex:new THREE.CylinderGeometry(.12,.12,.03,14).rotateX(Math.PI/2)};
const SHM=[new THREE.MeshStandardMaterial({color:0x1b1c1e,roughness:.8}),new THREE.MeshStandardMaterial({color:0x5f6264,roughness:.75}),new THREE.MeshStandardMaterial({color:0x8a8478,roughness:.75})],SHJ=new THREE.MeshStandardMaterial({color:0x2a2c2e,roughness:.6,metalness:.2}),SHEN=new THREE.MeshStandardMaterial({color:0x1d1f21,roughness:.6,metalness:.4}),EXM=glow(0xff8a3a,4);  // SHEN: engine (hot in thermal)
function shahedMesh(jet){const g=new THREE.Group(),m=jet?SHJ:SHM[Math.random()*3|0],add=(geo,mat,x=0,y=0,z=0)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o};
 add(SHG.body,m);add(jet?SHG.wingJ:SHG.wing,m);const h=jet?1.5:1.25;add(SHG.fin,m,h,-.05,0);add(SHG.fin,m,-h,-.05,0);let prop=null;
 if(jet){add(SHG.pod,SHEN,0,.36,-1.05);add(SHG.pylon,m,0,.2,-1.0);add(SHG.ex,EXM,0,.36,-1.64)}else{add(SHG.hub,SHEN,0,0,-1.86);add(SHG.disc,MAT.prop,0,0,-1.96);prop=add(SHG.blade,MS.dark,0,0,-1.96)}
 scene.add(g);return{g,prop}}
const TH=[],FIRES=[];let tid=0;
const live=t=>t.st==='cruise'||t.st==='dive',liveSites=()=>SITES.filter(s=>s.hp>0);
function spawnThreat(jet){const L=liveSites();if(!L.length)return;const s=L[Math.random()*L.length|0],aim=s.aims[Math.random()*s.aims.length|0],D=DIFF[demo?1:S.diff];
 const x0=(Math.random()-.5)*4600,alt=Math.random()<.35?80+Math.random()*120:250+Math.random()*650,p=new V3(x0,gh(x0,SPAWNZ)+alt,SPAWNZ);
 // dog-leg route: two waypoints off the direct line (they route around air defences), then the target
 const wps=[new V3(cl(x0*.6+(Math.random()-.5)*1600,-2700,2700),0,-1500),new V3(cl(aim.x+(Math.random()-.5)*1800,-2700,2700),0,300+Math.random()*400)];
 const spd=(jet?92:51)*D.spd*TSPD*(.94+Math.random()*.12),m=shahedMesh(jet);
 const t={id:++tid,p,v:new V3(wps[0].x-p.x,0,wps[0].z-p.z).setLength(spd),spd,cs:spd,alt,wps,tgt:s,aim,st:'cruise',jet,mesh:m.g,prop:m.prop,pd:1e9,dmin:1e9,cvm:0,bank:0,roll:0,spin:0,smoke:0,rb:null};TH.push(t);return t}
function turn(t,des,rate,dt){const cur=_tv.copy(t.v).normalize(),a=Math.acos(cl(cur.dot(des),-1,1)),y0=Math.atan2(cur.x,cur.z);
 if(a>1e-5)cur.lerp(des,Math.min(1,rate*dt/a)).normalize();let dy=Math.atan2(cur.x,cur.z)-y0;dy=((dy+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
 t.bank+=(cl(-dy/dt*1.4,-.7,.7)-t.bank)*Math.min(1,dt*2);t.v.copy(cur).multiplyScalar(t.spd)}  // bank into the turn
function threatStep(t,dt){if(t.st==='dead')return;if(t.k&&Z.tstep(t,dt))return;
 if(t.st==='fall'){t.v.y-=9.81*dt;t.v.multiplyScalar(1-.15*dt);t.p.addScaledVector(t.v,dt);t.roll+=t.spin*dt;
  if((t.smoke-=dt)<=0){t.smoke=.05;SMK.emit(t.p,0x2a2725,1,1.5,3,null,1,.8);FX.emit(t.p,0xff7a20,2,2,.4,null,2.5)}
  if(sdf(t.p.x,t.p.y,t.p.z)>-.5){boom(t.p,1.6);t.st='dead'}return}
 if(t.st==='cruise'){
  if(t.tgt.hp<=0){const L=liveSites();if(L.length){t.tgt=L.reduce((a,b)=>Math.hypot(a.x-t.p.x,a.z-t.p.z)<Math.hypot(b.x-t.p.x,b.z-t.p.z)?a:b);t.aim=t.tgt.aims[Math.random()*t.tgt.aims.length|0]}}
  if(t.dmg){t.alt=Math.max(25,t.alt-dt*5);if((t.smoke-=dt)<=0){t.smoke=.08;SMK.emit(t.p,0x2e2b28,1,1.2,4,null,1,.75)}if(t.fail&&(t.fail-=dt)<=0){killThreat(t);if(!demo)feed(`<span class="cg">${tName(t)} failed from its damage, going down</span>`);return}}
  const w=t.wps[0]||t.aim;_td.set(w.x-t.p.x,0,w.z-t.p.z);if(t.wps.length&&_td.length()<Math.max(300,t.spd/.35*1.6))t.wps.shift();
  // jet Geran-3: full speed on the first leg, throttled back to piston speed on the middle leg (fuel), full speed again for the run-in
  if(t.jet){const tgt=(t.wps.length===1?.6:1)*t.cs;t.spd+=(tgt-t.spd)*Math.min(1,dt*.3)}
  const ad=Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z);
  if(!t.wps.length&&ad<Math.max(350,(t.p.y-t.aim.y)*1.1)){t.st='dive';t.spd*=1.15}  // terminal dive, about 45°
  _tl.copy(t.p).addScaledVector(t.v,5);const gy=Math.max(gh(t.p.x,t.p.z),gh(_tl.x,_tl.z))+t.alt;  // holds altitude above the ground
  _td.setLength(t.spd);if(t.ev)_td.applyAxisAngle(UP,t.ev);_td.y=cl((gy-t.p.y)*.4,-7,7);turn(t,_td.normalize(),t.evr||.35,dt)}  // t.ev / t.evr: Zombies evasion (heading offset, turn rate); never set in Classic
 else{t.spd=Math.min(t.spd+4*dt,t.cs*1.45);turn(t,_td.subVectors(t.aim,t.p).normalize(),1.1,dt);if(t.p.distanceTo(t.aim)<4||t.p.y<=gh(t.p.x,t.p.z)+.6){impact(t);return}}
 t.p.addScaledVector(t.v,dt).addScaledVector(WIND,dt*.6)}  // wind drift
function impact(t){if(Z.on)return Z.impact(t);t.st='dead';boom(t.aim,4);if(demo||wstate==='over')return;const s=t.tgt;
 if(s.hp>0){s.hp--;lost++;wl++;FIRES.push({p:t.aim.clone(),t:0});feed(`<span class="cr">Impact</span> on the ${s.n.toLowerCase()}${s.hp?'':' · <span class="cr">site destroyed</span>'}`);tone(220,110,.6,.12,'sawtooth')}
 if(!liveSites().length){wstate='over';wT=8;banner('ALL SITES DESTROYED','cr',0);feed(`Held ${wave-1} wave${wave===2?'':'s'} · ${saved} downed · ${spent} interceptors`)}}
function killThreat(t,cat){if(Z.on)Z.kill(t,cat);if(cat){t.st='dead';boom(t.p,3.2);SMK.emit(t.p,0x1c1a18,30,14,6,_t.set(0,3,0),1.4,.85);if(!demo){saved++;ws++;tone(660,1320,.25,.12,'triangle')}return}t.st='fall';t.spin=(Math.random()<.5?-1:1)*(1+Math.random()*3);t.v.multiplyScalar(.7).add(_t.set((Math.random()-.5)*6,2,(Math.random()-.5)*6));
 boom(t.p,1.2);if(demo)return;saved++;ws++;tone(660,1320,.25,.12,'triangle')}
function boom(p,k){if(Z.on)Z.flash(p,k);FX.emit(p,0xffb040,Math.round(150*k),30*Math.sqrt(k),1.1,null,3);FX.emit(p,0xff5a1a,Math.round(80*k),18*Math.sqrt(k),.9,null,2.5);SMK.emit(p,0x3a3632,Math.round(24*k),8*Math.sqrt(k),5,_t.set(0,5,0),1,.8);
 boomL.position.copy(p);boomL.intensity=Math.max(boomL.intensity,3e4*k);shake=Math.max(shake,near(p)*k*.6);noise(.8*Math.sqrt(k)+.3,130,Math.min(1,.9*near(p)*k+.03))}
function fires(dt){for(const f of FIRES)if((f.t-=dt)<=0){f.t=.06;FX.emit(f.p,0xff7a20,3,3,.8,_t.set(0,7,0),2.5);SMK.emit(f.p,0x2b2724,1,2,9,_t.set(0,8,0),1,.75)}}
const nearestThreat=p=>{let b=null,bd=1e18;for(const t of TH)if(live(t)){const q=t.p.distanceToSquared(p);if(q<bd){bd=q;b=t}}return b};
// most urgent track: least time to reach its target
const urgent=()=>{if(Z.on)return Z.urgent();let b=null,bt=1e18;for(const t of TH)if(live(t)){const tt=Math.hypot(t.aim.x-t.p.x,t.aim.z-t.p.z)/t.spd;if(tt<bt){bt=tt;b=t}}return b};
// selected track: the most urgent unless you picked one with Next track (N); tracks cycle in order of urgency
let pickT=null,gdNow=null;const selT=()=>pickT&&live(pickT)?pickT:urgent();
function nextTrack(){const L=TH.filter(live).sort((a,b)=>Math.hypot(a.aim.x-a.p.x,a.aim.z-a.p.z)/a.spd-Math.hypot(b.aim.x-b.p.x,b.aim.z-b.p.z)/b.spd);if(!L.length)return;pickT=L[(L.indexOf(selT())+1)%L.length];if(!demo)banner('T'+String(pickT.id).padStart(2,'0'),'',.6)}
// midcourse guidance: the ground station turns the latest radar plot of the selected track (updated each sweep, dead-reckoned between) into a predicted intercept point
// 60 m behind the target, solved for your speed (at least cruise), so you arrive in its six. Inside 1.5 km it hands over to terminal: your eyes, the brackets and the pursuit cue.
const GD={pip:new V3(),tp:new V3(),tv:new V3()};
function guidance(me){const t=selT();if(!t||!me)return null;const r=t.rb,age=r?r.age:0;
 if(r)GD.tp.set(r.x+r.vx*age,r.y,r.z+r.vz*age),GD.tv.set(r.vx,0,r.vz);else GD.tp.copy(t.p),GD.tv.copy(t.v);
 const vh=_tv.copy(GD.tv).normalize(),vi=Math.max(me.v.length(),95),rng=GD.tp.distanceTo(me.p);let tau=rng/vi;
 for(let i=0;i<6;i++){GD.pip.copy(GD.tp).addScaledVector(GD.tv,tau);if(t.st!=='dive')GD.pip.addScaledVector(vh,-60);tau=Math.min(150,GD.pip.distanceTo(me.p)/vi)}
 const f=me.v.lengthSq()>100?_tl.copy(me.v).setY(0):fwdH(me.q,_tl),b=Math.atan2(GD.pip.x-me.p.x,-(GD.pip.z-me.p.z)),h=Math.atan2(f.x,-f.z);
 return{t,ttg:tau,rng,ph:rng>1500?'MIDCOURSE':'TERMINAL',herr:((b-h)*180/Math.PI+540)%360-180,dalt:GD.pip.y-me.p.y}}
// warhead: a small fragmentation charge. Kill probability falls off with miss distance; the proximity fuse fires at closest approach but has ~15 ms of delay,
// so at high closing speed it bursts past the target (tail chase ≈ full lethal radius, head-on ≈ direct hit only). fuseR = the 50% kill radius at a closing speed.
const FDLY=.015,pkill=(r,cv)=>{const re=r+cv*FDLY,k=LETH/4;return re<1.2?1:Math.exp(-(((re-1.2)/(2.5*k))**2))},fuseR=cv=>Math.max(.3,1.2+2.08*LETH/4-cv*FDLY);
const aspect=(t,p)=>{const c=_ad.subVectors(p,t.p).normalize().dot(_tv.copy(t.v).normalize());return c<-.5?'TAIL':c>.5?'HEAD-ON':'BEAM'};

// ---------- interceptor life: launch, fuse, detonation, crash, battery ----------
let player=null,demo=true,paused=false,menuOpen=true,shake=0,camMode=S.cam|0;
let wave=0,wstate='brief',wT=0,toSpawn=0,spawnT=0,saved=0,lost=0,spent=0,ws=0,wl=0;
const deadP=new V3(),deadC=new V3();
function launch(){if(!player)player=new Drone();player.spawn();TH.forEach(t=>{t.pd=t.dmin=1e9;t.cvm=0});fireWas=true;kbThr=0;kbArm=false;camUp=false;lqS=1;{const v=typeof S.tiltSw==='string'?swRead(S.tiltSw):null;if(v!=null)camUp=v}
 if(!demo)feed(`On the mat at <b>${player.home.n}</b>. Throttle up to take off`)}
function relaunch(){if(player.dead<=0&&player.p.distanceTo(player.home.mat)>3)spent++;launch()}
function lose(why){const d=player;if(d.dead>0)return;d.dead=RELT;spent++;deadP.copy(d.p);d.mesh.visible=false;
 _f.copy(d.v).setY(0);if(_f.lengthSq()<.01)_f.set(0,0,-1);deadC.copy(d.p).addScaledVector(_f.normalize(),-25).setY(Math.max(d.p.y,gh(d.p.x,d.p.z))+8);
 boom(d.p,why==='det'?.7:.4);if(camMode===0){const f=$('flash');f.style.transition='none';f.style.opacity=why==='det'?.9:.5;requestAnimationFrame(()=>{f.style.transition='opacity .6s';f.style.opacity=0})}
 if(why==='crash')feed('Interceptor lost: crashed');if(why==='bat')feed('Interceptor lost: battery flat')}
const tName=t=>`T${String(t.id).padStart(2,'0')} ${t.k&&Z.on?Z.tname(t):t.jet?'Geran-3':'Shahed'}`;
function detonate(){if(Z.on)return Z.detonate();const d=player,out=[];
 for(const t of TH)if(live(t)){const r=t.p.distanceTo(d.p);if(r>30)continue;const cv=Math.max(0,-_b.subVectors(t.v,d.v).dot(_a.subVectors(t.p,d.p))/(r||1)),re=r+cv*FDLY;
  if(Math.random()<pkill(r,cv)){const cat=re<2.4&&Math.random()<.55;killThreat(t,cat);out.push(`<span class="cg">${tName(t)} ${cat?'destroyed: its warhead went up':'hit, going down'}</span> (${r.toFixed(1)} m)`)}
  else if(!t.dmg&&Math.random()<Math.exp(-(((re-1.2)/(5*LETH/4))**2))){damage(t);out.push(`<span class="co">${tName(t)} damaged, still flying</span> (${r.toFixed(1)} m)`)}
  else out.push(`<span class="co">Missed ${tName(t)}: burst ${re.toFixed(1)} m away</span>${cv>40?' · closing too fast, get in its six':''}`)}
 lose('det');if(!demo)feed(out.join('<br>')||'Detonated: nothing in range')}
// damaged: smoking, slower, sinking; some fail a little later
function damage(t){t.dmg=1;t.cs*=.8;t.spd*=.8;t.fail=Math.random()<.45?6+Math.random()*16:0;FX.emit(t.p,0xffb040,30,8,.6,null,2)}
// warhead: contact always fires it; the proximity fuse fires at closest approach inside its 6 m sensing range; the detonate button fires it any time
function fuse(){const d=player,fire=fireIn(),edge=fire&&!fireWas;fireWas=fire;let hit=false,rec=false;
 for(const t of TH){if(!live(t))continue;const r=_a.subVectors(t.p,d.p).length(),cv=Math.max(0,-_b.subVectors(t.v,d.v).dot(_a)/(r||1));
  if(r<1.5)hit=true;else if(r<LETH*1.5&&r>t.pd)rec=true;
  if(r<20){t.dmin=Math.min(t.dmin,r);t.cvm=Math.max(t.cvm,cv)}else if(t.dmin<20&&r>t.pd&&!demo){feed(`<span class="co">Passed ${tName(t)} ${Math.round(t.dmin)} m off</span>${S.fuse==='auto'?' · outside the 6 m fuse':''}`);t.dmin=1e9;t.cvm=0}
  t.pd=r}
 if(hit||(Z.on?Z.autoFuse():S.fuse==='auto')&&rec||edge)detonate()}

// ---------- waves ----------
function startWave(){wave++;wstate='brief';wT=demo?1:6;toSpawn=2;ws=wl=0;spawnT=0;
 if(!demo){banner('WAVE '+wave,'cr',2.4);feed('Two tracks inbound from the north: a Shahed-136, then a jet Geran-3')}}
function waves(dt){if(Z.on)return Z.waves(dt);
 if(wstate==='over'){if((wT-=dt)<=0)startDemo();return}
 if(wstate==='brief'){if((wT-=dt)<=0)wstate='wave';return}
 if(wstate==='wave'){if(toSpawn>0&&(spawnT-=dt)<=0){toSpawn--;spawnThreat(toSpawn===0);spawnT=(25+Math.random()*20)*DIFF[demo?1:S.diff].gap}  // each wave: one piston Shahed-136, then one jet Geran-3 a little later
  if(!toSpawn&&!TH.some(live)){wstate='clear';wT=5;if(!demo){banner(`WAVE ${wave} CLEAR`,'cg',2.6);feed(`Wave ${wave}: <span class="cg">${ws} down</span> · <span class="cr">${wl} hit${wl===1?'':'s'}</span>`)}}return}
 if(wstate==='clear'&&(wT-=dt)<=0)startWave()}
function resetWorld(){pickT=null;TH.forEach(t=>scene.remove(t.mesh));TH.length=0;FIRES.length=0;SITES.forEach(s=>s.hp=s.max);wave=0;saved=lost=spent=0;tid=0}
function startMatch(){audioStart();AC?.resume();demo=false;resetWorld();setWeather(S.wx);if(S.gmode==='z')Z.start();else{Z.stop();startWave();toSpawn--;spawnThreat(false);spawnT=25+Math.random()*20}launch();showMenu(false);$('hud').hidden=false;$('resume').hidden=$('leave').hidden=false;feed(`Weather: ${WX.n} · wind ${Math.round(WB.length()*3.6)} km/h`)}
function startDemo(){Z.stop();demo=true;resetWorld();setWeather(S.wx);if(player)player.mesh.visible=false;startWave();$('hud').hidden=true;$('resume').hidden=$('leave').hidden=true;banner('');showMenu(true)}
function showMenu(v){menuOpen=v;$('menu').hidden=!v;paused=v&&!demo}

// ---------- camera ----------
const camPos=new V3(0,200,900),camFwd=new V3(0,0,-1),tiltQ=new QT(),_cp=new V3();
function updateCam(dt,now){const me=player;camPrev.copy(camera.position);
 if(demo||!me){const t=now*1.5e-5,tg=nearestThreat(_ip.set(0,300,0));camPos.set(Math.sin(t)*1400,320+Math.sin(t*1.7)*60,900+Math.cos(t)*900);camera.position.copy(camPos);if(tg)camFwd.lerp(_t.copy(tg.p).sub(camPos).normalize(),1-Math.exp(-dt*.5));camera.lookAt(_t.copy(camPos).add(camFwd));setFov(55,false)}
 else if(me.dead>0){camPos.lerp(deadC,1-Math.exp(-dt*3));camera.position.copy(camPos);camera.lookAt(deadP);setFov(100)}
 else{const fpv=camMode===0;me.mesh.visible=!fpv;
  if(fpv){camera.position.copy(me.p).add(_cp.set(0,.37,-.03).multiplyScalar(MSZ).applyQuaternion(me.q));tiltQ.setFromAxisAngle(_x.set(1,0,0),camA()*Math.PI/180);camera.quaternion.copy(me.q).multiply(tiltQ);{const a=(.0003+.001*me.ms)*SHK;camera.quaternion.multiply(_q.setFromEuler(_je.set(gn()*a,gn()*a*.5,gn()*a)))}setFov(S.fov)}
  else{const f=fwdH(me.q,_f);if(f.lengthSq()<.05)f.copy(me.v).setY(0);if(f.lengthSq()<.01)f.copy(camFwd);f.normalize();
   const nt=selT(),foc=nt?nt.p:_ip.set(PADP.x,PADY,PADP.z);if(camMode===2&&nt)f.subVectors(foc,me.p).setY(0).normalize();if(f.lengthSq()<.5)f.copy(camFwd);camFwd.lerp(f,1-Math.exp(-dt*5)).normalize();
   _cp.copy(me.p).addScaledVector(camFwd,-3.4*MSZ).add(_t.set(0,1.1*MSZ,0));_cp.y=Math.max(_cp.y,gh(_cp.x,_cp.z)+.6);
   camPos.lerp(_cp,1-Math.exp(-dt*10));camera.position.copy(camPos);camera.lookAt(camMode===2&&nt?foc:_t.copy(me.p).addScaledVector(camFwd,3*MSZ).setY(me.p.y+.3*MSZ));setFov(100)}}
 if(dt>0)camVel.subVectors(camera.position,camPrev).divideScalar(dt).clampLength(0,200);
 const cp=camera.position;sun.target.position.set(Math.round(cp.x/8)*8,gh(cp.x,cp.z),Math.round(cp.z/8)*8);sun.position.copy(sun.target.position).addScaledVector(SUND,700);sunDisc.position.copy(cp).addScaledVector(SUND,20000);
 sky.position.copy(cp);if(deck.visible){deck.position.x=Math.round(cp.x/400)*400;deck.position.z=Math.round(cp.z/400)*400}
 if(shake>.01){camera.position.add(_t.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(shake*.5*SHK));shake*=Math.exp(-dt*4)}}

// ---------- HUD ----------
// radar scope: heading-up PPI around the interceptor; blips repaint as the sweep passes them (like a real ground radar picture relayed to the goggles)
const rc=$('radar').getContext('2d');let sweep=0;
function radar(dt){const W=500,c=W/2,R=c-14,me=player&&player.dead<=0?player:null,o=me?me.p:_ip.set(PADP.x,0,PADP.z),RR=RRS[S.rr],K=R/RR;
 const f=me?fwdH(me.q,_f):_f.set(0,0,-1);if(f.lengthSq()<1e-4)f.copy(me.v).setY(0);const hd=Math.atan2(f.x,-f.z);  // heading, 0 = north
 const P=(x,z)=>{const dx=x-o.x,dz=z-o.z,ca=Math.cos(-hd),sa=Math.sin(-hd);return[c+(dx*ca-dz*sa)*K,c+(dx*sa+dz*ca)*K]};
 rc.clearRect(0,0,W,W);rc.save();rc.beginPath();rc.arc(c,c,R+2,0,7);rc.fillStyle='rgba(4,14,8,.55)';rc.fill();rc.clip();
 rc.strokeStyle='rgba(90,255,150,.28)';rc.lineWidth=1.5;for(const k of[1/3,2/3,1]){rc.beginPath();rc.arc(c,c,R*k,0,7);rc.stroke()}rc.beginPath();rc.moveTo(c-R,c);rc.lineTo(c+R,c);rc.moveTo(c,c-R);rc.lineTo(c,c+R);rc.stroke();
 // AO boundary, river, sites, pad
 rc.strokeStyle='rgba(120,200,255,.35)';rc.beginPath();for(const[x,z]of[[-AW,-AW],[AW,-AW],[AW,AW],[-AW,AW],[-AW,-AW]]){const q=P(x,z);rc.lineTo(q[0],q[1])}rc.stroke();
 rc.strokeStyle='rgba(90,170,220,.45)';rc.lineWidth=3;rc.beginPath();for(let x=-AW-2000;x<=AW+2000;x+=100){const q=P(x,rivZ(x));rc.lineTo(q[0],q[1])}rc.stroke();
 for(const s of SITES){const q=P(s.x,s.z);rc.fillStyle=s.hp?'#7fd0ff':'#555b66';rc.fillRect(q[0]-6,q[1]-6,12,12)}{const q=P(PADP.x,PADP.z);rc.strokeStyle='#ffc640';rc.lineWidth=2;rc.strokeRect(q[0]-5,q[1]-5,10,10)}
 for(const f of FOBS){const q=P(f.x,f.z);rc.strokeStyle='#3ddc84';rc.lineWidth=2;rc.beginPath();rc.moveTo(q[0],q[1]-6);rc.lineTo(q[0]+6,q[1]+5);rc.lineTo(q[0]-6,q[1]+5);rc.closePath();rc.stroke()}  // forward positions
 // sweep
 const s0=sweep;sweep=(sweep+dt*Math.PI)%(Math.PI*2);const g=rc.createConicGradient?rc.createConicGradient(sweep-Math.PI/2-.6,c,c):null;
 if(g){g.addColorStop(0,'rgba(90,255,150,0)');g.addColorStop(.095,'rgba(90,255,150,.18)');g.addColorStop(.0955,'rgba(90,255,150,0)');rc.fillStyle=g;rc.beginPath();rc.arc(c,c,R,0,7);rc.fill()}
 const sel=selT();rc.font='700 17px "JetBrains Mono",monospace';rc.textAlign='left';
 for(const t of TH){if(t.st==='dead'||Z.on&&!Z.seen(t))continue;const q=P(t.p.x,t.p.z),b=(Math.atan2(q[0]-c,c-q[1])+Math.PI*2)%(Math.PI*2),crossed=s0<=sweep?b>s0&&b<=sweep:b>s0||b<=sweep;
  if(crossed||!t.rb)t.rb={x:t.p.x,z:t.p.z,vx:t.v.x,vz:t.v.z,y:t.p.y,age:0};else t.rb.age+=dt;if(!live(t)&&t.rb.age>1.5)continue;
  const a=cl(1-t.rb.age/2.4,.25,1),bq=P(t.rb.x,t.rb.z),hv=P(t.rb.x+t.rb.vx*20,t.rb.z+t.rb.vz*20),col=!live(t)?'170,170,170':Z.on?Z.rcol(t,sel):t===sel?'255,198,64':t.jet?'255,150,60':'255,77,77';
  rc.globalAlpha=a;rc.strokeStyle=rc.fillStyle=`rgb(${col})`;rc.lineWidth=2.5;rc.beginPath();rc.moveTo(bq[0],bq[1]-7);rc.lineTo(bq[0]+7,bq[1]);rc.lineTo(bq[0],bq[1]+7);rc.lineTo(bq[0]-7,bq[1]);rc.closePath();live(t)?rc.fill():rc.stroke();
  if(live(t)){rc.beginPath();rc.moveTo(bq[0],bq[1]);rc.lineTo(hv[0],hv[1]);rc.stroke();rc.fillText(`T${String(t.id).padStart(2,'0')} ${Math.round((t.rb.y-gh(t.rb.x,t.rb.z))/100)}`,bq[0]+10,bq[1]-8)}}
 rc.globalAlpha=1;if(Z.on)Z.radar(rc,P,sel,K);rc.restore();
 if(gdNow&&gdNow.ph==='MIDCOURSE'){const q=P(GD.pip.x,GD.pip.z);rc.save();rc.setLineDash([10,8]);rc.strokeStyle='#5fe3ff';rc.lineWidth=2;rc.beginPath();rc.moveTo(c,c);rc.lineTo(q[0],q[1]);rc.stroke();rc.setLineDash([]);rc.beginPath();rc.moveTo(q[0],q[1]-8);rc.lineTo(q[0]+8,q[1]);rc.lineTo(q[0],q[1]+8);rc.lineTo(q[0]-8,q[1]);rc.closePath();rc.stroke();rc.restore()}  // guidance line to the PIP
 // own ship, ring labels, north marker
 rc.fillStyle='#3ddc84';rc.beginPath();rc.moveTo(c,c-10);rc.lineTo(c+7,c+8);rc.lineTo(c-7,c+8);rc.closePath();rc.fill();
 rc.fillStyle='rgba(150,255,190,.75)';rc.font='700 15px "JetBrains Mono",monospace';rc.textAlign='center';for(const k of[1/3,2/3,1])rc.fillText((RR*k/1000).toFixed(RR>3000?0:1),c+R*k*.707+10,c-R*k*.707+4);
 const nq=[c+Math.sin(-hd)*(R-2),c-Math.cos(-hd)*(R-2)];rc.fillStyle='#fff';rc.font='700 18px "JetBrains Mono",monospace';rc.fillText('N',nq[0],nq[1]+6);
 rc.strokeStyle='rgba(150,255,190,.5)';rc.lineWidth=2;rc.beginPath();rc.arc(c,c,R+2,0,7);rc.stroke()}
// video link quality from the position's ground-station antenna: falls off past ~1.8 km and drops hard when terrain blocks line of sight (fly higher to get it back)
let lqS=1,lqT=0;
function linkQ(me,dt){if((lqT-=dt)>0)return lqS;lqT=.1;const h=me.home,ax=h.x-3,ay=h.y+5.5,az=h.z+1,d=Math.hypot(me.p.x-ax,me.p.z-az);let q=1-.8*sm((d-1800)/3400);
 for(let i=1;i<20;i++){const f=i/20,x=ax+(me.p.x-ax)*f,z=az+(me.p.z-az)*f;if(gh(x,z)>ay+(me.p.y-ay)*f-1.5&&d>60){q*=.35;break}}
 return lqS+=(q-lqS)*.35}
const rng=d=>d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km';let siteHTML='';
const hdg=v=>String(Math.round((Math.atan2(v.x,-v.z)*180/Math.PI+360)%360)).padStart(3,'0');
function hud(dt){if(demo)return;if(Z.on)Z.hud(dt);const me=player;$('sw').textContent='WAVE '+wave;$('sv').textContent=saved+' DOWN';$('sl').textContent=lost+' HIT'+(lost===1?'':'S');
 const sh=Z.on?'':SITES.map(s=>`<span class="${s.hp?'':'dead'}">${s.n} ${'■'.repeat(s.hp)}${'□'.repeat(s.max-s.hp)}</span>`).join('');if(sh!==siteHTML)$('sites').innerHTML=siteHTML=sh;
 const inb=TH.filter(live).length+(wstate==='wave'||wstate==='brief'?toSpawn:0),sel=selT(),alive=me.dead<=0;
 const cv=cellV(me),fl=me.t|0,ws=WIND.length();
 $('osd').innerHTML=`<span><b>${S.mode==='acro'?'ACRO':'ANGLE'}</b> · ${['FPV','CHASE','THREAT CAM'][camMode]} · ${DIFF[S.diff].n.toUpperCase()} · CAM ${camUp?S.tilt+'°':'LVL'}${therm?' · TI WHT':''} · ${WX.n.toUpperCase()} · WIND ${Math.round(ws*3.6)} km/h ${hdg(_t.copy(WIND).negate())}</span>`+
  (alive?`<span>THR ${String(Math.round(me.thr*100)).padStart(3)}%  ${String(Math.round(me.v.length()*3.6)).padStart(3)} km/h  HDG ${hdg(fwdH(me.q,_f))}</span><span>ALT ${Math.round(me.p.y-gh(me.p.x,me.p.z))} m AGL  ${Math.round(me.p.y)} m MSL  HOME ${me.home.n.slice(4)} ${rng(Math.hypot(me.p.x-me.home.x,me.p.z-me.home.z))}  LQ ${Math.round(lqS*100)}%</span>`+
   `<span class="${cv<3.5?'r':''}">BAT ${(cv*12).toFixed(1)}V 12S  ${String(Math.round(me.amp||0)).padStart(3)}A  ${String(Math.round(me.mah)).padStart(5)} mAh  ${String(fl/60|0).padStart(2,'0')}:${String(fl%60).padStart(2,'0')}</span>`:`<span class="r">NEXT INTERCEPTOR ${me.dead.toFixed(1)}</span>`)+
  `<span>FUSE ${(Z.on?Z.autoFuse():S.fuse==='auto')?'PROX':'MANUAL'} · INBOUND ${inb} · INTERCEPTORS USED ${spent}</span>`;
 if(sel){const r=_a.subVectors(sel.p,me.p),d=r.length(),c2=-_b.subVectors(sel.v,me.v).dot(r)/d,asp=aspect(sel,me.p),win=fuseR(Math.max(0,c2));
  $('trk').innerHTML=`<b style="color:var(--amber)">T${String(sel.id).padStart(2,'0')} ${Z.on?Z.label(sel):sel.jet?'GERAN-3 JET':'SHAHED-136'}</b> ${sel.st==='dive'?'<span class="cr">DIVING</span>':''}<br>${rng(d)} · ALT ${Math.round(sel.p.y-gh(sel.p.x,sel.p.z))} m · ${Math.round(sel.v.length()*3.6)} km/h · HDG ${hdg(sel.v)}<br>${alive?`ASPECT <span class="${asp==='TAIL'?'cg':asp==='HEAD-ON'?'cr':''}">${asp}</span> · CLOSING ${Math.round(c2*3.6)} km/h · KILL R ${win.toFixed(1)} m`:''}`}else $('trk').textContent='NO TRACKS';
 const lq=alive?linkQ(me,dt):1;$('warn').textContent=!alive?'':lq<.45?'VIDEO LINK WEAK · CLIMB OR TURN BACK':Math.abs(me.p.x)>AW-300||Math.abs(me.p.z)>AW-300?'LEAVING THE AO · TURN BACK':cv<3.5?'BATTERY LOW · LAND':'';
 $('xh').hidden=camMode!==0||!alive;
 const a=$('arrow');if(!sel||!alive){a.hidden=true}else{_t.copy(sel.p).project(camera);let x=_t.x,y=_t.y;const behind=_t.z>1;if(behind){x=-x;y=-y}
  if(!behind&&Math.abs(x)<.95&&Math.abs(y)<.9)a.hidden=true;else{a.hidden=false;const m=Math.max(Math.abs(x)/.9,Math.abs(y)/.82,1e-3);x/=m;y/=m;
   a.style.transform=`translate(${(x*.5+.5)*innerWidth-13}px,${(-y*.5+.5)*innerHeight-12}px) rotate(${Math.atan2(x,y)}rad)`}}
  {const g=gdNow=S.guide&&alive&&!Z.on?guidance(me):null;let h='';if(g){const id='T'+String(g.t.id).padStart(2,'0');
   h=g.ph==='MIDCOURSE'?`<b>MIDCOURSE</b> ${id} · PIP ${rng(GD.pip.distanceTo(me.p))} · TTG ${Math.round(g.ttg)} s · ${Math.abs(g.herr)<4?'ON COURSE':(g.herr>0?'► R ':'◄ L ')+Math.round(Math.abs(g.herr))+'°'} · ${Math.abs(g.dalt)<25?'LEVEL':(g.dalt>0?'CLIMB ':'DESCEND ')+Math.round(Math.abs(g.dalt))+' m'}`:`<b>TERMINAL</b> ${id} ${rng(g.rng)} · eyes on, get in its six`}
   $('gd').innerHTML=h}
 radar(dt)}
// FPV overlay: Betaflight-style artificial horizon, target brackets (red per track with range, amber on the most urgent with a pursuit cue behind it), site labels
function overlay(){const W2=innerWidth,H2=innerHeight;oc.clearRect(0,0,W2,H2);if(demo)return;
 const me=player&&player.dead<=0?player:null,ft=Math.tan(camera.fov*Math.PI/360),sel=selT(),scr=p=>{_t.copy(p).project(camera);return _t.z<1&&Math.abs(_t.x)<1.1&&Math.abs(_t.y)<1.1?[(_t.x*.5+.5)*W2,(-_t.y*.5+.5)*H2]:null};
 oc.lineWidth=1.6;oc.font='700 11px "JetBrains Mono",monospace';oc.textAlign='center';oc.shadowColor='#000';oc.shadowBlur=3;
 if(me&&camMode===0){const f=_f.set(0,0,-1).applyQuaternion(camera.quaternion).setY(0);if(f.lengthSq()>1e-4){f.normalize();const r=_r.crossVectors(f,UP),c=camera.position,q1=scr(_ip.copy(c).addScaledVector(f,5000).addScaledVector(r,-900)),q2=scr(_tl.copy(c).addScaledVector(f,5000).addScaledVector(r,900));
   if(q1&&q2){const mx=(q1[0]+q2[0])/2,my=(q1[1]+q2[1])/2,dx=q2[0]-q1[0],dy=q2[1]-q1[1],L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;oc.strokeStyle='rgba(255,255,255,.75)';oc.lineWidth=2;oc.beginPath();
    for(const s of[-1,1])for(let k=0;k<5;k++){const a=s*(40+k*26),b=s*(56+k*26);oc.moveTo(mx+ux*a,my+uy*a);oc.lineTo(mx+ux*b,my+uy*b)}oc.stroke();oc.lineWidth=1.6}}}
 for(const f of FOBS){const d=Math.hypot(f.x-camera.position.x,f.z-camera.position.z);if(d>4000)continue;const q=scr(_ip.set(f.x,f.y+6,f.z));if(q){oc.fillStyle='#3ddc84';oc.fillText(f.n+' '+rng(d),q[0],q[1])}}
 for(const s of SITES){const q=scr(_ip.set(s.x,s.y+34,s.z));if(!q)continue;oc.fillStyle=s.hp?'#7fd0ff':'#8a8f99';oc.fillText(Z.on?Z.slabel(s):s.n+(s.hp?' '+'■'.repeat(s.hp):' · DESTROYED'),q[0],q[1])}
 for(const t of TH){if(t.st==='dead')continue;const q=scr(t.p);if(!q)continue;const[x,y]=q,d=t.p.distanceTo(camera.position),s=Math.max(9,Math.min(70,2.8/d/ft*H2*.5+5)),L=live(t),k=s*.45;
  oc.strokeStyle=oc.fillStyle=!L?'rgba(170,170,170,.55)':Z.on?Z.ocol(t,sel):t===sel?'#ffc640':t.jet?'#ff9640':'#ff4d4d';if(Z.on&&Z.quiet(t)){oc.fillRect(x-2,y-2,4,4);continue}
  oc.beginPath();for(const[sx,sy]of[[-1,-1],[1,-1],[1,1],[-1,1]]){oc.moveTo(x+sx*s,y+sy*s-sy*k);oc.lineTo(x+sx*s,y+sy*s);oc.lineTo(x+sx*s-sx*k,y+sy*s)}oc.stroke();
  if(L&&!(Z.on&&Z.quiet(t)))oc.fillText(`T${String(t.id).padStart(2,'0')} ${rng(d)}${t.st==='dive'?' DIVE':''}`,x,y+s+13);
  // pursuit cue: a point 40 m behind the target along its track, led by your time to get there; fly through it to end up in its six
  if(L&&t===sel&&me&&!Z.on){const vh=_tv.copy(t.v).normalize(),r=_a.subVectors(t.p,me.p).length(),tg=cl(r/Math.max(me.v.length(),40),0,8),cue=_ip.copy(t.p).addScaledVector(t.v,tg*.5).addScaledVector(vh,-40),lp=scr(cue);
   if(lp){oc.beginPath();oc.arc(lp[0],lp[1],7,0,7);oc.moveTo(lp[0]-11,lp[1]);oc.lineTo(lp[0]-4,lp[1]);oc.moveTo(lp[0]+4,lp[1]);oc.lineTo(lp[0]+11,lp[1]);oc.stroke()}}}
 // midcourse PIP: cyan diamond with time to go, or a chevron on the screen edge pointing to it
 if(me&&gdNow&&gdNow.ph==='MIDCOURSE'){_t.copy(GD.pip).project(camera);let x=_t.x,y=_t.y;const bh=_t.z>1;if(bh){x=-x;y=-y}oc.strokeStyle=oc.fillStyle='#5fe3ff';oc.lineWidth=2;
  if(!bh&&Math.abs(x)<.95&&Math.abs(y)<.92){const X=(x*.5+.5)*W2,Y=(-y*.5+.5)*H2;oc.beginPath();oc.moveTo(X,Y-12);oc.lineTo(X+12,Y);oc.lineTo(X,Y+12);oc.lineTo(X-12,Y);oc.closePath();oc.stroke();oc.fillText(`PIP ${Math.round(gdNow.ttg)}s`,X,Y+26)}
  else{const m=Math.max(Math.abs(x)/.88,Math.abs(y)/.8,1e-3);x/=m;y/=m;const X=(x*.5+.5)*W2,Y=(-y*.5+.5)*H2,a=Math.atan2(-y,x);oc.save();oc.translate(X,Y);oc.rotate(a);oc.beginPath();oc.moveTo(14,0);oc.lineTo(-6,-10);oc.lineTo(-1,0);oc.lineTo(-6,10);oc.closePath();oc.fill();oc.restore();oc.fillText('PIP',X,Y+24)}}
 oc.shadowBlur=0}

// ---------- visuals ----------
function visuals(dt,now){const me=player;
 if(me){me.mesh.position.copy(me.p);me.mesh.quaternion.copy(me.q);me.mesh.scale.setScalar(MSZ);const sp=(me.dead>0?0:25+me.thr*90)*dt;me.props.forEach((p,i)=>p.rotation.y+=i%3?sp:-sp)}
 for(const t of TH){t.mesh.position.copy(t.p);t.mesh.lookAt(_t.copy(t.p).add(t.v));t.mesh.rotateZ(t.st==='fall'?t.roll:t.bank);if(t.prop)t.prop.rotation.z+=dt*90}
 for(let i=TH.length-1;i>=0;i--)if(TH[i].st==='dead'){scene.remove(TH[i].mesh);TH.splice(i,1)}
 if(RADM)RADM.rotation.y+=dt*2;boomL.intensity*=Math.exp(-dt*9);FX.upd(dt);SMK.upd(dt);
 if(Z.on)Z.visuals(dt);if(audioOn())audioTick(dt)}

// ---------- input events ----------
function cycleCam(){camMode=(camMode+1)%3;S.cam=camMode;save()}
function togglePause(){if(demo)return;showMenu(!menuOpen)}
initInput({menu:()=>menuOpen,pause:togglePause,key:e=>{if(Z.on&&Z.key(e))return;if(e.code==='KeyC')cycleCam();if(e.code==='KeyL')setCam(!camUp);if(e.code==='KeyH')setTherm(!therm);if(e.code==='KeyG')setGuide(!S.guide);if(e.code==='KeyN')nextTrack();if(e.code==='KeyV'){S.rr=(S.rr+1)%RRS.length;save();syncUI()}if(e.code==='KeyR'&&player&&!demo&&wstate!=='over')relaunch()}});
const padKeys=e=>{if(e(9))togglePause();if(!menuOpen&&!demo){if(Z.on&&Z.pad(e))return;if(e(4))cycleCam();if(e(3)&&player&&wstate!=='over')relaunch()}};
// ---------- menu / settings ----------
const FIELDS=[['diff','Threat level','sel',DIFF.map((d,i)=>[i,d.n])],['wx','Weather','sel',[['random','Random'],...Object.entries(WXS).map(([k,w])=>[k,w.n])]],['fuse','Warhead fuse','sel',[['auto','Proximity (auto)'],['manual','Manual (detonate button)']]],
 ['rr','Radar range','sel',RRS.map((r,i)=>[i,r/1000+' km'])],['mode','Flight mode','sel',[['acro','Acro (rate)'],['angle','Angle (self-level)']]],
 ['tilt','Camera tilt (switch up)','rng',0,90,1,'°'],['fpvMix','FPV angle mix','sel',[[1,'On (follows camera angle)'],[0,'Off']]],['grain','Camera grain','rng',0,1,.05],['guide','Midcourse guidance','sel',[[1,'On (PIP cue from ground radar)'],[0,'Off']]],['skin','Interceptor look (Classic)','sel',[['dart',"Riley's dart"],['strela','Strela-2 missile']]],['zwx','Zombies weather','sel',[['wave','New forecast each wave'],['menu','Use the Weather setting']]],['fov','FPV field of view','rng',80,150,1,'°'],['thrMode','Throttle stick','sel',[['spring','Gamepad (centre = hover)'],['full','Radio (full range)']]],['dz','Stick deadband','rng',0,.15,.005]];
mountPad($('pilotpad'),{flip:false,fire:false});initMenu(FIELDS,k=>{if(k==='wx'&&demo)setWeather(S.wx);if(k==='skin')player?.look()});
mountSwitches([['fire','Detonate','F'],['tiltSw','Cam tilt','L'],['thermSw','Thermal','H'],['guideSw','Guidance','G'],['nextSw','Next track','N']]);
syncUI();
$('play').onclick=startMatch;$('resume').onclick=()=>showMenu(false);$('leave').onclick=startDemo;
// ---------- mod panel ----------
const MODS=[
 ['Interceptor','grav','Gravity',9.81,2,40,.01,'m/s²'],['Interceptor','thr','Thrust',48,20,600,1,'m/s²'],['Interceptor','te','Thrust curve',1.4,1,2.5,.05,'^'],['Interceptor','vp','Prop pitch speed',260,40,500,1,'m/s'],['Interceptor','maxv','Top speed',115,20,300,1,'m/s'],
 ['Interceptor','tau','Stick lag',26,2,60,1,'ms'],['Interceptor','dl','Linear drag',0.01,0,1,.005,''],['Interceptor','dq','Air drag',0.0027,0,.03,.0001,''],['Interceptor','fs','Fin side force',4,.2,12,.1,'×'],
 ['Interceptor','size','Drone size',0.5,.4,2.5,.05,'×'],['Interceptor','dbounce','Wall bounce',0.2,0,1,.05,''],['Interceptor','gfric','Ground grip',0.5,0,1,.02,''],['Interceptor','spool','Motor spool',70,0,150,5,'ms'],['Interceptor','turtle','Turtle rate',260,60,720,10,'°/s'],['Interceptor','wash','Prop wash',1,0,3,.1,'×'],
 ['Interceptor','bcap','Battery',16000,2000,40000,500,'mAh'],
 ['Warhead','leth','Fuse radius',4,1,15,.5,'m'],['Warhead','crash','Crash speed',12,3,120,1,'m/s'],['Warhead','relt','Relaunch time',2.5,0,10,.5,'s'],
 ['Threats','tspd','Threat speed',1,.4,2,.05,'×'],['Threats','tcnt','Threats per wave',1,.3,3,.1,'×'],
 ['Match','speed','Game speed',1,.25,2,.05,'×'],
 ['Look','bloom','Glow',0.9,0,2.5,.05,''],['Look','shake','Camera shake',1,0,3,.1,'×']];
const PRESETS={'Default':{},'League 6S 5-inch':{thr:98,te:1.6,vp:68,maxv:60,dl:.04,dq:.0137,fs:.6,tau:4,spool:20},'Training':{tspd:.6,tcnt:.6,leth:8},'Big warhead':{leth:10}};
// v4: tail-sitter dart aerodynamics (untouched old Interceptor / Warhead values reset)
const migrate=()=>{if((S.physV|0)<4){for(const g of['Interceptor','Warhead'])for(const m of MODS)if(m[0]===g)S.mod[m[1]]=m[3];S.physV=4;save()}
 if((S.physV|0)<5){for(const k of['tau','dl','spool'])S.mod[k]=MODS.find(m=>m[1]===k)[3];S.physV=5;save()}};  // v5: heavier feel (Riley found v4's too floaty)
function applyTune(){const T=S.mod;G=T.grav;THR=T.thr;TE=T.te;VP=T.vp;MAXV=T.maxv;TAU=T.tau/1000;DL=T.dl;DQ=T.dq;FS=T.fs;DRAD=.8*T.size;MSZ=T.size/.5;{const k=MSZ;HBR=.04*k;DI=.1*k*k;  // collision hull: 4 fin tips (it stands on these), 4 prop tips, the nose; 4 cm spheres
  HBP=[[.15,-.36,0],[-.15,-.36,0],[0,-.36,.15],[0,-.36,-.15],[.27,.15,.27],[-.27,.15,.27],[.27,.15,-.27],[-.27,.15,-.27],[0,.4,0]].map(([x,y,z])=>new V3(x,y,z).multiplyScalar(k))}SPOOL=T.spool/1000;GF=T.gfric;TURT=T.turtle*Math.PI/180;WASH=T.wash;DB=T.dbounce;BCAP=T.bcap;
 LETH=T.leth;CRASH=T.crash;RELT=T.relt;TSPD=T.tspd;TCNT=T.tcnt;GSPD=T.speed;SHK=T.shake;bloom.strength=T.bloom*.33;HOV=(G/THR)**(1/TE)}
$('modbtn').onclick=toggleMod;initModPanel({mods:MODS,presets:PRESETS,migrate,onApply:applyTune});initRates('Drone League Interceptor');
$('copyset').onclick=()=>{const o={};for(const k of['mode','diff','tilt','fov','cam','thrMode','dz','fuse','fireBtn','wx','rr','fpvMix','grain','guide','skin','zwx','tiltSw','thermSw','guideSw','nextSw','cal','mod','rprof','rpi'])o[k]=S[k];const t=JSON.stringify(o);
 const show=()=>{$('mod').hidden=false;tab(false);$('mio').value=t;$('mio').select();modMsg('Select and copy this text')};
 try{navigator.clipboard.writeText(t).then(()=>feed('Settings copied. Paste them to Claude to make them the defaults.'),show)}catch(e){show()}};

// ---------- main loop ----------
function step(dt){const me=player;
 if(me&&!demo){if(me.dead>0){if((me.dead-=dt)<=0&&wstate!=='over')launch()}else{humanControl(me,dt);if(me.mah>=BCAP)me.thr=0;const h=me.step(dt);if(h>CRASH)lose('crash');else if(me.mah>=BCAP&&me.gt>0)lose('bat');else fuse()}}
 for(const t of TH)threatStep(t,dt);waves(dt);fires(dt);if(Z.on)Z.step(dt)}
// Zombies mode (zombies.js): everything it needs from this file, as live getters/setters. Every hook above is behind Z.on, so Classic runs as before.
const Z=initZombies({THREE,scene,camera,renderer,S,save,TH,SITES,FOBS,PADP,RRS,WIND,FX,SMK,psys,groundTex,gh,rivZ,live,liveSites,shahedMesh,boom,killThreat,damage,lose,launch,startDemo,showMenu,selT,feed,banner,tone,noise,pkill,FDLY,applyTune,step,visuals,startMatch,SHG,SHM,SHJ,SHEN,EXM,MAT,detail,
 deadP,deadC,get shake(){return shake},set shake(v){shake=v},get player(){return player},get demo(){return demo},get menuOpen(){return menuOpen},get camMode(){return camMode},get pickT(){return pickT},set pickT(v){pickT=v},
 get wave(){return wave},set wave(v){wave=v},get wstate(){return wstate},set wstate(v){wstate=v},nextId:()=>++tid,
 get LETH(){return LETH},set LETH(v){LETH=v},set RELT(v){RELT=v},set BCAP(v){BCAP=v},set SAGK(v){SAGK=v},get AC(){return AC},set shake(v){shake=Math.max(shake,v)},get thermLook(){return thermLook},get WX(){return WX},deck,
 setWeather,wxSky,wxLook,WB,hemi,sun,sunDisc,sky,cloudG,rainL,RN,get rainN(){return rainN},set rainN(v){rainN=cl(v|0,0,RN);rGeo.setDrawRange(0,rainN*2)},set wxHook(f){wxHook=f},set AW(v){AW=v},get AW(){return AW},get saved(){return saved},set saved(v){saved=v},get spent(){return spent}});
startDemo();
startLoop({pre:()=>padEdges(padKeys),step,speed:()=>GSPD*(Z.on?Z.tsc:1),slow:()=>Z.on&&Z.tsc<1,paused:()=>paused||Z.hold(),menu:()=>menuOpen,draw:(vd,dt,now)=>{
 if(!menuOpen&&!demo)switches();
 const fpvOn=!demo&&camMode===0&&player&&player.dead<=0,th=fpvOn&&therm;if(th!==thermLook){thermLook=th;wxLook(th)}  // the camera feed only exists in FPV
 sens.enabled=fpvOn&&!paused;sens.uniforms.th.value=th?1:0;sens.uniforms.gr.value=S.grain;sens.uniforms.t.value=now/1000;sens.uniforms.lq.value=fpvOn?lqS:1;{const lk=_t.set(0,0,-1).applyQuaternion(camera.quaternion).y,sk=cl(.5+lk*1.4,0,1);sens.uniforms.ex.value+=((1.04-.18*sk)-sens.uniforms.ex.value)*Math.min(1,dt*2.5)}  // auto exposure lags like a real cam
 weather(vd,now);visuals(vd,now);updateCam(dt,now);hud(vd);overlay();if(Z.on)Z.overlay(oc)}});
