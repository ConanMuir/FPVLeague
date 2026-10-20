// Zombies long-range radar layers: a strategic inset next to the radar scope that unlocks as the threats escalate.
//   CONTINENTAL  (unlocks the wave the ballistic / hypersonic missiles arrive on this difficulty): a zoomed-out map 600 km around the
//                defended area (square-root range scale, so the last 100 km still has room): the launch areas beyond the front, each fast
//                track from its launch point to its predicted impact, cruise missiles, Golden Dome kill vehicles.
//   GLOBAL       (unlocks with the ICBMs): a stylised globe; each ICBM's arc from its launch site over the pole, through midcourse, to
//                re-entry, with its phase and the time left.
// Each unlock is announced the first time (call, radio, feed). Y cycles AUTO (shown while something it covers is up) / CONTINENTAL / GLOBAL / OFF.
// With the kill chain (zchain.js / zwarn.js, feature-detected) only tracks early warning has picked up are drawn, a new alert flashes its
// launch point, and each track carries its BOOST / MID / TERMINAL squares. Redrawn 10 times a second. Zombies only. Map and globe are stylised.
import {KIND} from './zdata.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,D2R=Math.PI/180;
// a fixed pseudo-random function (the map and the globe look the same every run)
const hash=(x,y,z)=>{const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s)};
function vnoise(x,y,z){const X=Math.floor(x),Y=Math.floor(y),Zf=Math.floor(z),fx=x-X,fy=y-Y,fz=z-Zf,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz),h=(a,b,c)=>hash(X+a,Y+b,Zf+c),L=(a,b,t)=>a+(b-a)*t;
 return L(L(L(h(0,0,0),h(1,0,0),u),L(h(0,1,0),h(1,1,0),u),v),L(L(h(0,0,1),h(1,0,1),u),L(h(0,1,1),h(1,1,1),u),v),w)}
export function initStratRadar(api,G,Z){
 const {TH,S}=api;
 const SITE_C={x:0,z:1950},DMAX=600000,FAST=['ballistic','hyper','icbm'];
 const hud=document.getElementById('hud'),el=document.createElement('div');el.id='zsr';el.className='osd';el.hidden=true;
 el.innerHTML='<div class="h"><b></b><span></span></div><canvas width="440" height="440"></canvas>';hud.append(el);
 const cv=el.querySelector('canvas'),c=cv.getContext('2d'),hb=el.querySelector('.h b'),hs=el.querySelector('.h span'),W=440,R=W/2;
 const MODES=['auto','cont','glob','off'],MN={auto:'AUTO',cont:'CONTINENTAL',glob:'GLOBAL',off:'OFF'};
 if(!MODES.includes(S.zsrm))S.zsrm='auto';
 const SR={cont:0,glob:0,lw:-1,newT:-99,newL:null,ann:[],draws:0,shown:false,layer:null,n:0};
 let simT=0,acc=1;
 const contFrom=()=>Math.min(Z.kindFrom('ballistic'),Z.kindFrom('hyper')),globFrom=()=>Z.kindFrom('icbm');
 const seen=t=>!Z.seen||Z.seen(t),live=api.live;
 const bearing=p=>Math.atan2(p.x-SITE_C.x,SITE_C.z-p.z);  // 0 = north, + = east
 const tti=t=>Z.reTti?Z.reTti(t):t.p.distanceTo(t.aim)/Math.max(1,t.spd);

 // ---------- unlocks: the wave the kinds arrive (or the first time one is in the air, e.g. a campaign sector that brings them early) ----------
 function unlock(L){if(SR[L])return;SR[L]=G.wave||1;SR.newT=simT;SR.newL=L;const cont=L==='cont';
  SR.ann.push({at:simT+2.6,cont});  /* after the wave call has had its moment */
  api.feed(`<span class="cb">${cont?'Continental radar online':'Global radar online'}</span>: ${cont?'launches and tracks far beyond the map (600 km)':'ICBM tracks from launch, through midcourse, to re-entry'} · <b>Y</b> cycles the long-range view`)}
 function announce(a){Z.an?.say(a.cont?'CONTINENTAL RADAR ONLINE':'GLOBAL RADAR ONLINE',a.cont?'long-range layer · ballistic launches far beyond the map · Y':'ICBM tracks from launch to re-entry · Y','#5fe3ff',3);
  Z.an?.radio('EARLY WARNING',a.cont?'Continental radar is up. You will see the missile launches coming now.':'Global early warning is linked in. We can see the ICBM launches from here.',1);Z.au?.star?.(2,true)}
 function step(dt){simT+=dt;if(!G.on||api.demo)return;
  if(G.state==='wave'&&G.wave!==SR.lw){SR.lw=G.wave;if(G.wave>=contFrom())unlock('cont');if(G.wave>=globFrom())unlock('glob')}
  if(G.state==='wave')for(const t of TH)if(live(t)&&FAST.includes(t.k)){if(!SR.cont)unlock('cont');if(t.k==='icbm'&&!SR.glob)unlock('glob')}
  for(let i=SR.ann.length-1;i>=0;i--)if(simT>=SR.ann[i].at){announce(SR.ann[i]);SR.ann.splice(i,1)}}

 // ---------- which layer shows ----------
 const tracks=k=>TH.filter(t=>live(t)&&k.includes(t.k)&&seen(t));
 function layer(){if(!G.on||api.demo||(G.state!=='wave'&&G.state!=='clear'))return null;const m=S.zsrm;if(m==='off')return null;
  if(m==='glob'&&SR.glob)return'glob';if(m==='cont'&&SR.cont)return'cont';if(m!=='auto')return SR.glob?'glob':SR.cont?'cont':null;
  if(SR.glob&&tracks(['icbm']).length)return'glob';if(SR.cont&&tracks(FAST).length)return'cont';if(simT-SR.newT<12&&SR.newL&&SR[SR.newL])return SR.newL;return null}

 // ---------- continental ----------
 const rOf=d=>R*.94*Math.sqrt(cl(d/DMAX,0,1)),xy=(b,d)=>[R+Math.sin(b)*rOf(d),R-Math.cos(b)*rOf(d)];
 const geo=(()=>{const coast=[],front=[],river=[],nz=b=>vnoise(Math.cos(b)*2+5,Math.sin(b)*2,1.3);for(let i=0;i<=40;i++){const b=1.75+i/40*(2*Math.PI-3.5);coast.push([b,(150+140*nz(b))*1e3])}
  for(let i=0;i<=40;i++){const b=-1.62+i/40*3.24;front.push([b,(240+110*nz(b))*1e3])}
  for(let i=0;i<=24;i++){const d=i/24*DMAX*.8;river.push([.9-1.5*i/24+.25*Math.sin(i*.9),d])}return{coast,front,river}})();
 const LD={ballistic:420e3,hyper:800e3,icbm:2e6},KC={ballistic:'#ffb347',hyper:'#ff6bd6',icbm:'#ff4d4d',cruise:'#ff9a6b'};
 const line=pts=>{c.beginPath();pts.forEach(([b,d],i)=>{const[x,y]=xy(b,d);i?c.lineTo(x,y):c.moveTo(x,y)})};
 const firstSeen=t=>{if(t._srb==null){t._srb=bearing(t.p);t._srt=simT;t._srl=simT}return t};
 const fx=(px)=>`700 ${px}px "JetBrains Mono",monospace`;
 function drawCont(){c.save();c.beginPath();c.arc(R,R,R-2,0,7);c.clip();
  const g=c.createRadialGradient(R,R,0,R,R,R);g.addColorStop(0,'rgba(10,26,40,.92)');g.addColorStop(1,'rgba(4,10,18,.92)');c.fillStyle=g;c.fillRect(0,0,W,W);
  // sea to the south, the front and hostile ground to the north (stylised)
  c.fillStyle='rgba(30,70,120,.35)';line(geo.coast);c.lineTo(0,W);c.lineTo(W,W);c.closePath();c.fill();
  c.fillStyle='rgba(120,24,24,.22)';line(geo.front);{const[x,y]=xy(Math.PI*.55,DMAX);c.lineTo(x,y);c.lineTo(W,0);c.lineTo(0,0);const[x2,y2]=xy(-Math.PI*.55,DMAX);c.lineTo(x2,y2)}c.closePath();c.fill();
  c.strokeStyle='rgba(255,90,90,.55)';c.setLineDash([6,5]);c.lineWidth=2;line(geo.front);c.stroke();c.setLineDash([]);c.strokeStyle='rgba(120,190,255,.45)';c.lineWidth=1.5;line(geo.coast);c.stroke();
  c.strokeStyle='rgba(120,190,255,.25)';line(geo.river);c.stroke();
  // range rings and the launch sectors (the kill chain's West / North / East edges, with their boost batteries when bought)
  c.lineWidth=1;c.font=fx(15);c.fillStyle='rgba(150,200,230,.6)';c.textAlign='left';
  for(const d of[25e3,100e3,250e3,600e3]){c.strokeStyle='rgba(95,227,255,.16)';c.beginPath();c.arc(R,R,rOf(d),0,7);c.stroke();c.fillText(d/1000+'',R+4,R-rOf(d)+15)}
  const sec=[[-.87,'W'],[0,'N'],[.87,'E']];c.textAlign='center';
  sec.forEach(([b,n],i)=>{const[x,y]=xy(b,DMAX*.62);c.fillStyle='rgba(255,140,140,.55)';c.fillText(n,x,y);const B=G.kc?.boost?.[i];if(B){const[bx,by]=xy(b,320e3);c.fillStyle=B.ammo>0?'#3ddc84':'#6b7a70';c.beginPath();c.moveTo(bx,by-7);c.lineTo(bx+6,by+5);c.lineTo(bx-6,by+5);c.closePath();c.fill()}});
  // the defended area and the local radar's reach
  c.strokeStyle='rgba(95,227,255,.6)';c.beginPath();c.arc(R,R,Math.max(3,rOf(api.RRS[S.rr|0]||10000)),0,7);c.stroke();c.fillStyle='#5fe3ff';c.beginPath();c.arc(R,R,4,0,7);c.fill();
  // tracks: launch point (virtual, far beyond the map edge for the long-range kinds), the path flown, the predicted impact
  const L=tracks([...FAST,'cruise']);SR.n=L.length;c.font=fx(14);
  for(const t of L){firstSeen(t);const col=KC[t.k],b=bearing(t.p),d=Math.hypot(t.p.x-SITE_C.x,t.p.z-SITE_C.z),[x,y]=xy(b,d),T=Math.ceil(tti(t));
   if(t.k!=='cruise'){const[lx,ly]=xy(t._srb,LD[t.k]),cx=(lx+x)/2+(ly-y)*.12,cy=(ly+y)/2-(lx-x)*.12;c.strokeStyle=col;c.globalAlpha=.55;c.setLineDash([3,4]);c.lineWidth=1.5;c.beginPath();c.moveTo(lx,ly);c.quadraticCurveTo(cx,cy,x,y);c.stroke();
    c.setLineDash([]);c.globalAlpha=1;if(LD[t.k]<=DMAX){c.fillStyle=col;c.fillRect(lx-3,ly-3,6,6)}
    const ag=simT-t._srl;if(ag<2.5){c.strokeStyle=col;c.globalAlpha=1-ag/2.5;c.lineWidth=2;c.beginPath();c.arc(lx,ly,6+ag*18,0,7);c.stroke();c.globalAlpha=1;c.fillStyle=col;c.fillText('LAUNCH',lx,ly-12)}}
   c.strokeStyle=col;c.globalAlpha=.8;c.setLineDash([2,3]);c.beginPath();c.moveTo(x,y);c.lineTo(R,R);c.stroke();c.setLineDash([]);c.globalAlpha=1;
   const re=t._re&&live(t);c.fillStyle=re&&simT%0.5<.25?'#fff':col;c.beginPath();c.arc(x,y,t.k==='cruise'?3:5,0,7);c.fill();
   if(t.k!=='cruise'){c.fillStyle=col;c.fillText(`${KIND[t.k].tag.slice(0,5)} ${T}s`,x,y-10);
    const s=Z.chainStatus?.(t);if(s){const q=['b','m','t'].map(k=>s[k]);q.forEach((v,i)=>{c.fillStyle=/wait|pending|ready|kill/.test(v)?'#3ddc84':v==='none'?'#a8535a':'#ff4d4d';c.fillRect(x+8+i*7,y+4,5,6)})}}}
  for(const h of Z.def?.shots||[])if(h.kind==='space'){const[x,y]=xy(bearing(h.p),Math.hypot(h.p.x-SITE_C.x,h.p.z-SITE_C.z));c.fillStyle='#5fe3ff';c.fillRect(x-2.5,y-2.5,5,5)}
  c.restore()}

 // ---------- global: orthographic globe, our area low in the picture, the launch sites up over the pole ----------
 const AO={la:48*D2R,lo:32*D2R},VC={la:72*D2R,lo:32*D2R},GR=R*.9;
 const toV=(la,lo)=>[Math.cos(la)*Math.cos(lo),Math.sin(la),Math.cos(la)*Math.sin(lo)];
 // project a unit vector (lifted by h, in earth radii) into the picture; null on the far side
 function gp(v,h=0){const la=Math.asin(cl(v[1],-1,1)),lo=Math.atan2(v[2],v[0]),dl=lo-VC.lo,cc=Math.sin(VC.la)*Math.sin(la)+Math.cos(VC.la)*Math.cos(la)*Math.cos(dl);if(cc<-.02&&h<.02)return null;const k=GR*(1+h);
  return[R+k*Math.cos(la)*Math.sin(dl),R-k*(Math.cos(VC.la)*Math.sin(la)-Math.sin(VC.la)*Math.cos(la)*Math.cos(dl))]}
 // a point at angular distance del along an initial bearing brg (0 = north) from (la, lo)
 const dest=(la,lo,brg,del)=>{const la2=Math.asin(Math.sin(la)*Math.cos(del)+Math.cos(la)*Math.sin(del)*Math.cos(brg)),lo2=lo+Math.atan2(Math.sin(brg)*Math.sin(del)*Math.cos(la),Math.cos(del)-Math.sin(la)*Math.sin(la2));return[la2,lo2]};
 const slerp=(a,b,f)=>{const d=Math.acos(cl(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1)),s=Math.sin(d)||1,ka=Math.sin((1-f)*d)/s,kb=Math.sin(f*d)/s;return[a[0]*ka+b[0]*kb,a[1]*ka+b[1]*kb,a[2]*ka+b[2]*kb]};
 let land=null;
 function landImg(){if(land)return land;const n=120,cv2=document.createElement('canvas');cv2.width=cv2.height=n;const g=cv2.getContext('2d'),im=g.createImageData(n,n),r=n/2*.9;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=(i+.5-n/2)/r,y=-(j+.5-n/2)/r,rho=Math.hypot(x,y);if(rho>=1)continue;const cz=Math.sqrt(1-rho*rho),la=Math.asin(cz*Math.sin(VC.la)+y*Math.cos(VC.la)),lo=VC.lo+Math.atan2(x,cz*Math.cos(VC.la)-y*Math.sin(VC.la));
   const v=toV(la,lo),e=vnoise(v[0]*2.2+7,v[1]*2.2+1,v[2]*2.2+3)*.65+vnoise(v[0]*5+2,v[1]*5,v[2]*5+9)*.35,ice=Math.abs(la)>1.25,o=(j*n+i)*4,L=e>.52||ice,sh=.55+.45*cz;
   if(L){im.data[o]=(ice?190:58+40*(e-.5))*sh;im.data[o+1]=(ice?205:84+30*(e-.5))*sh;im.data[o+2]=(ice?215:56)*sh}else{im.data[o]=14*sh;im.data[o+1]=38*sh;im.data[o+2]=72*sh}im.data[o+3]=235}
  g.putImageData(im,0,0);return land=cv2}
 const PH=t=>{const h=t.p.y-t.aim.y;return t._re?(h<20000?'TERMINAL':'RE-ENTRY'):simT-(t._srt??simT)<6&&!(Z.seen&&t.kc&&!t.kc.cue)?'BOOST':'MIDCOURSE'};
 function arcF(t){const T=tti(t),RT=Z.re?.TRE||31;if(t._re||t.p.y-t.aim.y<(Z.re?.RE.HE||90000))return .88+.12*cl(1-T/RT,0,1);if(t._srm==null)t._srm=Math.max(1,T-RT);return .05+.83*cl(1-(T-RT)/t._srm,0,1)}
 function drawGlob(){c.save();c.fillStyle='rgba(3,7,14,.9)';c.beginPath();c.arc(R,R,R-2,0,7);c.fill();c.imageSmoothingEnabled=true;c.drawImage(landImg(),R-GR/.9,R-GR/.9,2*GR/.9,2*GR/.9);
  const hal=c.createRadialGradient(R,R,GR*.96,R,R,GR*1.06);hal.addColorStop(0,'rgba(95,180,255,0)');hal.addColorStop(.5,'rgba(95,180,255,.35)');hal.addColorStop(1,'rgba(95,180,255,0)');c.fillStyle=hal;c.beginPath();c.arc(R,R,GR*1.06,0,7);c.fill();
  // graticule
  c.strokeStyle='rgba(140,200,255,.18)';c.lineWidth=1;const gl=(f)=>{c.beginPath();let on=false;for(let i=0;i<=96;i++){const q=gp(f(i/96));if(!q){on=false;continue}on?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]);on=true}c.stroke()};
  for(let lo=0;lo<360;lo+=30)gl(u=>toV((-90+180*u)*D2R,lo*D2R));for(let la=-60;la<=60;la+=30)gl(u=>toV(la*D2R,u*2*Math.PI));
  const ao=toV(AO.la,AO.lo),q0=gp(ao);c.fillStyle='#5fe3ff';c.beginPath();c.arc(q0[0],q0[1],5,0,7);c.fill();c.font=fx(14);c.textAlign='left';c.fillText('AO',q0[0]+8,q0[1]+5);
  // each ICBM: launch site ~7000-9000 km out along its bearing, the arc up through midcourse (apogee ~1200 km) and down to us
  const L=tracks(['icbm']);SR.n=L.length;c.textAlign='center';
  for(const t of L){firstSeen(t);const del=(63+((t.id*37)%17))*D2R,[la,lo]=dest(AO.la,AO.lo,t._srb,del),lv=toV(la,lo),f=arcF(t),ph=PH(t),T=Math.ceil(tti(t)),re=ph==='RE-ENTRY'||ph==='TERMINAL';
   const P=u=>gp(slerp(lv,ao,u),.19*Math.sin(Math.PI*u)**.8);
   c.lineWidth=2;c.strokeStyle='rgba(255,77,77,.9)';c.beginPath();for(let i=0;i<=40;i++){const u=f*i/40,q=P(u);if(q)i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1])}c.stroke();
   c.setLineDash([4,5]);c.strokeStyle='rgba(255,77,77,.4)';c.beginPath();for(let i=0;i<=30;i++){const u=f+(1-f)*i/30,q=P(u);if(q)i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1])}c.stroke();c.setLineDash([]);
   const ls=gp(lv);if(ls){c.fillStyle='#ff4d4d';c.fillRect(ls[0]-3,ls[1]-3,6,6);const ag=simT-t._srl;if(ag<2.5){c.strokeStyle='#ff4d4d';c.globalAlpha=1-ag/2.5;c.beginPath();c.arc(ls[0],ls[1],6+ag*16,0,7);c.stroke();c.globalAlpha=1}}
   const m=P(f);if(m){c.fillStyle=re&&simT%.5<.25?'#fff':'#ff4d4d';c.beginPath();c.arc(m[0],m[1],re?6:5,0,7);c.fill();c.fillStyle=re?'#ffd0c0':'#ff8a8a';c.fillText(`${ph} ${T}s`,m[0],m[1]-11)}}
  c.restore()}

 // ---------- per frame: redraw at 10 Hz while shown ----------
 function frame(dt){const L=layer();if(L!==SR.layer){SR.layer=L;el.hidden=!L;acc=1}SR.shown=!!L;el.classList.toggle('new',!!L&&simT-SR.newT<7&&L===SR.newL);if(!L)return;
  for(const t of TH)if(live(t)&&FAST.includes(t.k)){const d=!!seen(t);if(d&&!t._srd){t._srd=1;t._srl=simT}}  /* a launch alert (or the first sight) flashes the launch point */
  if((acc+=dt)<.1)return;acc=0;c.clearRect(0,0,W,W);(L==='glob'?drawGlob:drawCont)();SR.draws++;
  hb.textContent=L==='glob'?'GLOBAL · ICBM':'CONTINENTAL · 600 km';hs.textContent=`${MN[S.zsrm]} · Y`}
 const st0=Z.step;Z.step=dt=>{st0(dt);step(dt)};
 const v0=Z.visuals;Z.visuals=dt=>{v0(dt);if(G.on)frame(performance.now()/1000-(frame.t??performance.now()/1000));frame.t=performance.now()/1000};
 const k0=Z.key;Z.key=e=>{if(G.on&&e.code==='KeyY'&&Z.base?.el?.hidden!==false){let i=MODES.indexOf(S.zsrm);for(let n=0;n<4;n++){i=(i+1)%4;const m=MODES[i];if(m==='auto'||m==='off'||SR[m])break}S.zsrm=MODES[i];api.save();
   api.banner('LONG-RANGE RADAR: '+MN[S.zsrm],'',.9);SR.layer=undefined;return true}return k0(e)};
 const s0=Z.start;Z.start=()=>{s0();Object.assign(SR,{cont:0,glob:0,lw:-1,newT:-99,newL:null,ann:[],layer:null});el.hidden=true};
 const s1=Z.stop;Z.stop=()=>{s1();el.hidden=true;SR.layer=null;SR.ann.length=0};
 Z.sr={state:()=>({cont:SR.cont,glob:SR.glob,mode:S.zsrm,shown:SR.shown,layer:SR.layer,draws:SR.draws,tracks:SR.n,contFrom:contFrom(),globFrom:globFrom()}),SR};
 return Z.sr}
