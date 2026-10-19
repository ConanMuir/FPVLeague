// Interceptor ground: the farmland's field layout (shared by the painted ground texture and the shader) and the ground material.
// The painted 4096² texture (2.2 m a texel) carries each field's colour and the big shapes; this shader adds what a texture that size
// can't hold: crop rows that follow each field (and turn along the headland), tramlines, straw swaths, plough furrows, mowing stripes,
// two-rut dirt tracks beside the field edges and grass verges, all box-filtered or faded by pixel footprint so nothing shimmers from altitude.
// Fields sit on a grid rotated by FA: cell (i,j) is centred at u=FU0+i*CW, v=FU0+j*CH in the grid frame (x,z rotated by FA).
import * as THREE from 'three';
import {detail} from '../../engine/render.js';
export const FA=.17,CW=620,CH=380,FU0=-6200,NU=20,NV=33,EDGE=6;
// crop types: 1 ripe wheat, 2 green barley, 3 stubble, 4 sunflower, 5 maize, 6 ploughed black earth, 7 harrowed, 8 meadow
export const CROPS=[null,{n:'wheat',w:3,c:['#bea558','#b39a50','#c4aa60','#b69d57']},{n:'barley',w:1.2,c:['#888b4f','#90904e','#7f8449']},{n:'stubble',w:2.6,c:['#b8a874','#ae9c68','#bdae7c','#a9996c']},
 {n:'sunflower',w:1.8,c:['#686f36','#727838','#606933']},{n:'maize',w:1.2,c:['#566b3a','#4d6234','#5c723f']},{n:'plough',w:2.4,c:['#4a3b2c','#423528','#544230','#3d3126']},
 {n:'harrow',w:1.2,c:['#6c5942','#776348','#645238']},{n:'meadow',w:1.2,c:['#667046','#6e784a','#5e6841']}];
// one cell: split mode (0 whole, 1 two parts across u at f, 2 two parts across v at f, 3 three strips across u), crop per part,
// row flip / variant per part, and which of its two low edges carry a tree belt or a dirt track
export function fieldLayout(rnd){const cells=[],pick=()=>{let t=0;for(let k=1;k<9;k++)t+=CROPS[k].w;let r=rnd()*t;for(let k=1;k<9;k++){r-=CROPS[k].w;if(r<=0)return k}return 1};
 for(let j=0;j<NV;j++)for(let i=0;i<NU;i++){const r=rnd(),mode=r<.5?0:r<.78?1:r<.9?2:3,fq=rnd()*4|0,parts=[];
  for(let k=0;k<(mode?mode===3?3:2:1);k++){let t=pick();while(k&&t===parts[k-1].t)t=pick();parts.push({t,flip:rnd()<.22?1:0,v:rnd()*4|0,shade:rnd()})}
  const beltT=rnd()<.5,beltL=rnd()<.3;cells.push({i,j,u:FU0+i*CW,v:FU0+j*CH,mode,f:.35+.1*fq,fq,parts,beltT,beltL,trkT:rnd()<(beltT?.55:.3),trkL:rnd()<(beltL?.55:.3)})}
 return cells}
// part rectangles of a cell in its local frame (centre 0, u across, v down), inset from the cell edge (corridor) and from each other (verge)
export function partRects(c){const hx=CW/2-EDGE,hy=CH/2-EDGE,b=c.mode===1?(c.f-.5)*CW:c.mode===2?(c.f-.5)*CH:0;
 return c.mode===0?[[-hx,-hy,hx,hy]]:c.mode===1?[[-hx,-hy,b-1.2,hy],[b+1.2,-hy,hx,hy]]:c.mode===2?[[-hx,-hy,hx,b-1.2],[-hx,b+1.2,hx,hy]]:
  [[-hx,-hy,-104.5,hy],[-102.1,-hy,102.1,hy],[104.5,-hy,hx,hy]]}
// per-cell data texture (nearest): R,G,B = part crop + 16*flip + 32*variant; A = mode + 4*f step + 16*track on the low-u edge + 32*track on the low-v edge
export function fieldData(cells){const d=new Uint8Array(32*40*4);
 for(const c of cells){const o=(c.i+c.j*32)*4;for(let k=0;k<3;k++){const p=c.parts[k]||c.parts[0];d[o+k]=p.t+16*p.flip+32*p.v}d[o+3]=c.mode+4*c.fq+16*(c.trkL?1:0)+32*(c.trkT?1:0)}
 const t=new THREE.DataTexture(d,32,40,THREE.RGBAFormat);t.magFilter=t.minFilter=THREE.NearestFilter;t.needsUpdate=true;return t}
const GLSL_FN=`
float lnF(float x,float w,float sp){return floor(x/sp)*w+min(fract(x/sp)*sp,w);}
float lines(float x,float sp,float w,float fw){float h=max(fw,1e-3)*.5;return (lnF(x+h+w*.5,w,sp)-lnF(x-h+w*.5,w,sp))/(2.*h);}
float rows(float x,float sp,float fw){return sin(x*6.2832/sp)*(1.-smoothstep(sp*.1,sp*.25,fw));}
float bF(float sp,float fw){return 1.-smoothstep(sp*.05,sp*.16,fw);}
`;
const GLSL=`
{float msk=smoothstep(.15,.85,texture2D(mTex,vWP.xz/9000.+.5).r);
 float M=texture2D(dTex,vWP.xz/700.+.11).g,M2=texture2D(dTex,vWP.xz/2300.+.53).r,M3=texture2D(dTex,vWP.xz/170.+.3).r;
 diffuseColor.rgb*=.84+.32*M;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.08,1.,.84),clamp(M2*1.6-.5,0.,1.));
 diffuseColor.rgb*=mix(vec3(.9,.96,.86),vec3(1.),smoothstep(-12.,30.,vWP.y));
 if(msk>.01){
  vec2 uv=vec2(vWP.x*${Math.cos(FA).toFixed(6)}+vWP.z*${Math.sin(FA).toFixed(6)},-vWP.x*${Math.sin(FA).toFixed(6)}+vWP.z*${Math.cos(FA).toFixed(6)});
  vec2 g=(uv-vec2(${(FU0-CW/2).toFixed(1)},${(FU0-CH/2).toFixed(1)}))/vec2(${CW}.,${CH}.),ci=clamp(floor(g),vec2(0.),vec2(${NU-1}.,${NV-1}.)),lp=(g-ci-.5)*vec2(${CW}.,${CH}.);
  vec4 cd=floor(texture2D(fTex,(ci+.5)/vec2(32.,40.))*255.+.5);
  float md=mod(cd.a,4.),f=.35+.1*mod(floor(cd.a/4.),4.),tL=mod(floor(cd.a/16.),2.),tT=mod(floor(cd.a/32.),2.),t=cd.r;
  vec4 R=vec4(${(-CW/2+EDGE).toFixed(1)},${(-CH/2+EDGE).toFixed(1)},${(CW/2-EDGE).toFixed(1)},${(CH/2-EDGE).toFixed(1)});
  if(md==1.){float b=(f-.5)*${CW}.;if(lp.x<b)R.z=b-1.2;else{R.x=b+1.2;t=cd.g;}}
  else if(md==2.){float b=(f-.5)*${CH}.;if(lp.y<b)R.w=b-1.2;else{R.y=b+1.2;t=cd.g;}}
  else if(md==3.){if(lp.x<-103.3)R.z=-104.5;else if(lp.x<103.3){R.x=-102.1;R.z=102.1;t=cd.g;}else{R.x=104.5;t=cd.b;}}
  vec2 pc=(R.xy+R.zw)*.5,hs=(R.zw-R.xy)*.5,q=lp-pc,e2=hs-abs(q);float e=min(e2.x,e2.y),ec=min(${CW/2}.-abs(lp.x),${CH/2}.-abs(lp.y))-${EDGE}.;
  float ty=mod(t,16.),fl=mod(floor(t/16.),2.),vr=floor(t/32.),HL=13.+vr*3.;
  bool ax=(hs.x>hs.y)!=(fl>.5),head=e<HL;if(head)ax=e2.y<e2.x;
  float rc=ax?q.y:q.x,fw=fwidth(rc),fe=fwidth(e),ph=vr*7.3,k=1.,bb=0.,in1=step(0.,e);
  float tram=head?lines(e-HL+6.9,1e4,.5,fe)+lines(e-HL+5.1,1e4,.5,fe):lines(rc+ph-.9,24.,.5,fw)+lines(rc+ph+.9,24.,.5,fw),tb=1.-smoothstep(.12,.4,head?fe:fw);
  vec3 soil=vec3(.13,.095,.06),tc=diffuseColor.rgb;
  float al=ax?q.x:q.y,nf=1.-smoothstep(.02,.08,fw),st=mix(.5,texture2D(dTex,vec2(rc/2.6,al/45.)+.37).r,nf),lg=1.-smoothstep(1.,4.,fw);
  if(ty==1.){k=(1.-.05*rows(rc,.19,fw))*(.9+.2*st);tc=mix(tc,tc*vec3(.62,.66,.5),tram*.85);bb-=tram*.5*tb;bb+=(st-.5)*.25*(1.-smoothstep(.008,.025,fw));k*=1.+lg*.14*(texture2D(dTex,vec2(rc*.04,al*.006)+.7).r-.5);}
  else if(ty==2.){k=(1.-.06*rows(rc,.19,fw))*(.9+.2*st);tc=mix(tc,soil*1.6,tram*.75);bb-=tram*.5*tb;bb+=(st-.5)*.25*(1.-smoothstep(.008,.025,fw));}
  else if(ty==3.){float sw=lines(rc+ph*.3,7.2,1.7,fw);k=1.+.16*sw-.05;tc=mix(tc,tc*vec3(.7,.68,.6),tram*.5);bb+=(sw*.25-tram*.3)*tb;}
  else if(ty==4.){float r=rows(rc,.7,fw);k=(1.+.13*r)*(.92+.16*st);bb+=r*.1*bF(.7,fw);tc=mix(tc,tc*vec3(.75,.7,.55),tram*.6);}
  else if(ty==5.){float r=rows(rc,.75,fw);k=(1.+.12*r)*(.92+.16*st);bb+=r*.09*bF(.75,fw);tc=mix(tc,soil*1.5,tram*.6);}
  else if(ty==6.){float r=rows(rc+.3*(texture2D(dTex,vWP.xz/9.).g-.5),.42,fw);k=(1.+.1*r)*(1.+.05*(lines(rc+ph,12.,6.,fw)*2.-1.));bb+=r*.4*bF(.42,fw);}
  else if(ty==7.){k=1.+.035*(lines(rc+ph,12.,6.,fw)*2.-1.);float r=rows(rc,.25,fw);k*=1.+.06*r;bb+=r*.12*bF(.25,fw);}
  else if(ty==8.){k=(1.+.075*(lines(rc+ph,3.6,1.8,fw)*2.-1.))*(.86+.28*texture2D(dTex,vWP.xz/11.).g);bb+=(texture2D(dTex,vWP.xz/2.3).r-.5)*.35*(1.-smoothstep(.009,.03,max(length(dFdx(vWP.xz)),length(dFdy(vWP.xz)))));}
  vec3 fc=mix(diffuseColor.rgb,tc*k,in1)*(.93+.14*M3);bb*=in1;fc=mix(fc,fc*.86,(1.-smoothstep(0.,.7,e))*in1);
  float verge=(1.-in1)*step(0.,ec);
  vec3 vg=vec3(.075,.09,.035)*(.75+.5*texture2D(dTex,vWP.xz/3.1).r);
  fc=mix(fc,vg,verge*(1.-smoothstep(-.5,0.,e)));
  // dirt tracks: two ruts and a worn bed beside the cell's low-u and low-v edges
  float dL=lp.x+${CW/2}.,dT=lp.y+${CH/2}.,fx=fwidth(dL),fz=fwidth(dT),
   rut=tL*step(dL,${EDGE}.)*(lines(dL-2.35,1e4,.5,fx)+lines(dL-4.05,1e4,.5,fx))+tT*step(dT,${EDGE}.)*(lines(dT-2.35,1e4,.5,fz)+lines(dT-4.05,1e4,.5,fz)),
   bed=tL*(lines(dL-3.2,1e4,2.6,fx))+tT*(lines(dT-3.2,1e4,2.6,fz));
  fc=mix(fc,mix(fc,vec3(.2,.16,.11),.45),clamp(bed,0.,1.)*(1.-in1));fc=mix(fc,vec3(.16,.125,.085),clamp(rut,0.,1.)*.8);bb-=rut*.35*(1.-smoothstep(.12,.4,max(fx,fz)));
  diffuseColor.rgb=mix(diffuseColor.rgb,fc,msk);hb=hb*mix(1.,.5,msk)+bb*msk;}
 // snow (Zombies weather sets uSnow): settles on the flatter ground first, patchy, and hides the furrows; the fields still show through a little
 // (darker under the ploughland, brighter on stubble) and the roads, villages and yards stay slushier
 if(uSnow>.001){vec3 upV=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz);float sn=uSnow*smoothstep(.55,.85,dot(normal,upV))*smoothstep(.15,.5,M3*.5+uSnow*.75)*(.62+.26*M3+.1*M);float L=dot(diffuseColor.rgb,vec3(.3,.59,.11));sn*=mix(.72,1.,msk);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.74,.76,.8)*(.92+.1*M)*(.86+.9*clamp(L-.16,-.12,.14)),sn);hb*=1.-sn*.7;}}
`;
// the ground material: engine detail (grain and bump, no crop rows of its own) plus the field shader above
// m.userData.snow: uniform {value 0..1} for a snow cover (Zombies weather)
export function groundMaterial(map,fTex,mTex){const m=detail(new THREE.MeshStandardMaterial({map,roughness:1}),7,53,0,.45,0),ob=m.onBeforeCompile,snow=m.userData.snow={value:0};
 m.customProgramCacheKey=()=>'ifields1';
 m.onBeforeCompile=sh=>{ob(sh);sh.uniforms.fTex={value:fTex};sh.uniforms.mTex={value:mTex};sh.uniforms.uSnow=snow;
  sh.fragmentShader=sh.fragmentShader.replace('uniform sampler2D dTex;','uniform sampler2D dTex;uniform sampler2D fTex;uniform sampler2D mTex;uniform float uSnow;'+GLSL_FN).replace('#include <normal_fragment_maps>',GLSL+'#include <normal_fragment_maps>')};
 return m}
