// ---------- long line (Match setting "Long line", off by default) ----------
// Touch the ball and it hangs from your quad on a cable, like a helicopter sling load; any opponent who touches the ball takes the line.
// The cable is a one-sided spring-damper (pulls, never pushes) applied as an impulse to both ends with their masses. On the line the
// ball counts as "Load weight" x its normal weight, so it hangs on the quad, loads the throttle, swings and snatches. The hook sits under
// the belly, below the centre of mass, so a swinging load also tips the quad toward it.
// Scoring ("Long line scoring"): Hoops (default) = Quidditch-style rings on posts at each end, tow the ball through one of the other
// team's rings toward their end wall; Goals = drag the ball across the goal line. Only a ball on a line scores either way.
import * as THREE from 'three';
import {COL,H,HL,cl} from '../config/constants.js';
import {S} from '../config/settings.js';
import {BM,BR,DRAD,G,MAXB} from '../config/tune.js';
const BG_=()=>G;  // your quad's weight per unit mass
import {noise,tone} from '../audio/audio.js';
import {ball} from '../physics/ball.js';
import {glow,scene} from '../render/renderer.js';
import {$,TEAM} from '../config/constants.js';
import {GS} from '../state.js';
import {feed} from '../ui/hud.js';
export const LL={d:null,cd:0,z:0,j:0,load:0};  // load: cable tension / your quad's weight, smoothed (the badge's bar)  // d: the drone holding the line; cd: no steal until this runs out; z: ball z last tick (scoring); j: last tug (m/s)
const _n=new THREE.Vector3(),_h=new THREE.Vector3(),_u=new THREE.Vector3(),_r=new THREE.Vector3(),_q=new THREE.Quaternion();
export const ropeLen=()=>S.llLen;  // hook to the top of the ball (m)
const STIFF={stiff:30,normal:16,bungee:7};  // cable stretch: natural frequency of the stretch (rad/s)
const hookOf=(d,out)=>out.set(0,-.3*DRAD/.6,0).applyQuaternion(d.q).add(d.p);
const who=d=>d===GS.player?'You':d.name;
export const hoopMode=()=>S.longline&&S.llScore==='hoops'&&!GS.OBSON&&!GS.net;
export function llDrop(){LL.d=null;LL.cd=0;LL.z=ball.p.z}
// a drone touched the ball: it takes the line (opponents steal it; a teammate's touch doesn't take it off you; .6 s between swaps)
export function llTouch(d){if(!S.longline||LL.d===d||LL.cd>0||d.dead>0||LL.d&&LL.d.team===d.team)return;const stole=!!LL.d;LL.d=d;LL.cd=.6;
 if(!GS.demo)feed(stole?`${who(d)} stole the line`:`${who(d)} hooked the ball`);if(d===GS.player||stole)tone(stole?520:380,stole?260:760,.18,.12,'triangle')}
// one tick, after the flight model and before the Rapier step (so both bodies move with the cable's impulse this tick)
export function llStep(dt){LL.cd-=dt;LL.j=0;LL.load*=.97;if(hoopMode())hoopHit();const d=LL.d;if(!d)return;if(d.dead>0||!GS.drones.includes(d)){LL.d=null;return}
 const h=hookOf(d,_h),n=_n.subVectors(ball.p,h),dist=n.length(),L=ropeLen()+BR;if(dist<1e-4)return;n.divideScalar(dist);
 const ext=dist-L;if(ext<=0)return;  // slack: the cable just hangs
 const ib=1/(BM*S.llW),id=1/d.fl.mass,vr=_r.subVectors(ball.v,d.v).dot(n),me=1/(ib+id),W=STIFF[S.llStr]||16,cap=L*.15;
 // spring-damper on the stretch, never past "no separating" (no overshoot), and a hard stop past 15% stretch
 const soft=me*dt*(W*W*ext+2*.7*W*vr),hard=me*(vr+(ext-cap)/dt),j=Math.min(Math.max(0,ext>cap?Math.max(soft,hard):Math.min(soft,me*(vr+ext/dt))),4/id);if(j<=0)return;  // at most 4 m/s of tug on the quad per tick: a snatch spreads over a few ticks instead of teleporting the camera
 ball.v.addScaledVector(n,-j*ib);d.v.addScaledVector(n,j*id);LL.j=j*id;LL.load+=(j*id/dt/(BG_()||1)-LL.load)*.08;const bs=ball.v.length();if(bs>MAXB)ball.v.multiplyScalar(MAXB/bs);
 // the hook sits below the centre of mass: the pull also tips the quad toward the load (body-frame rates, the flight controller fights it)
 _q.copy(d.q).invert();const nb=_u.copy(n).applyQuaternion(_q),hb=-.3*DRAD/.6;d.w.x+=hb*nb.z*j*id*2.2;d.w.z-=hb*nb.x*j*id*2.2;  // r x F with r = (0,hb,0)
 if(j*id>.25&&d===GS.player)noise(.08,140,Math.min(.22,j*id/8))}  // a creak when it snatches
// scoring for this tick: -1, or the team that scored (0 scores at the -z end, as goal())
export function llGoal(){const z0=LL.z,z=ball.p.z;LL.z=z;if(!LL.d)return -1;
 if(hoopMode()){for(const o of HOOPS){const zc=o.c.z,s=Math.sign(zc);if((z0-zc)*s<0&&(z-zc)*s>=0){const x=ball.p.x,y=ball.p.y;  // crossed the ring's plane heading for that end wall
   if(Math.hypot(x-o.c.x,y-o.c.y)<o.r-BR*.5){return s<0?0:1}}}return -1}
 const e=HL+BR;if(z0>=-e&&z<-e)return 0;if(z0<=e&&z>e)return 1;return -1}

// ---------- hoops: three rings on posts in front of each end (centre high, sides lower), sized to the ball ----------
const HOOPS=[],hoopG=new THREE.Group();hoopG.visible=false;scene.add(hoopG);let hoopBR=0,hoopH=0;
const ringR=()=>BR*2.3+1.5,TUBE=.55;
function buildHoops(){hoopBR=BR;hoopH=H;HOOPS.length=0;hoopG.clear();const R=ringR();
 for(const s of[-1,1])for(const[x,y]of[[-28,24],[0,36],[28,24]]){const c=new THREE.Vector3(x,Math.min(y,H*.45),s*(HL-38)),team=s<0?1:0;  // the -z end's rings are Orange's to defend
  HOOPS.push({c,r:R});const m=glow(COL[team],1.8),ring=new THREE.Mesh(new THREE.TorusGeometry(R,TUBE,12,48),m);ring.position.copy(c);hoopG.add(ring);
  const ph=c.y-R,post=new THREE.Mesh(new THREE.CylinderGeometry(.45,.6,ph,10),new THREE.MeshStandardMaterial({color:0x2a3142,roughness:.5,metalness:.6}));post.position.set(c.x,ph/2,c.z);hoopG.add(post)}}
// the ball bounces off the rings and posts (drones fly through them)
function hoopHit(){if(hoopBR!==BR||hoopH!==H)buildHoops();const p=ball.p,v=ball.v;
 for(const o of HOOPS){const q=_r.subVectors(p,o.c),rho=Math.hypot(q.x,q.y);let nx,ny,nz,dd;
  if(rho>1e-4){const k=(rho-o.r)/rho;nx=q.x*k;ny=q.y*k;nz=q.z}else{nx=0;ny=-o.r;nz=q.z}dd=Math.hypot(nx,ny,nz);  // nearest point on the ring's centre circle -> ball
  if(dd<BR+TUBE&&dd>1e-4){const n=_u.set(nx/dd,ny/dd,nz/dd);p.addScaledVector(n,BR+TUBE-dd);const vn=v.dot(n);if(vn<0)v.addScaledVector(n,-1.6*vn)}
  const top=o.c.y-o.r;if(p.y<top+BR){const dx=p.x-o.c.x,dz=p.z-o.c.z,hd=Math.hypot(dx,dz);if(hd<BR+.6&&hd>1e-4){const n=_u.set(dx/hd,0,dz/hd);p.addScaledVector(n,BR+.6-hd);const vn=v.dot(n);if(vn<0)v.addScaledVector(n,-1.6*vn)}}}}
export const hoops=()=>{if(hoopBR!==BR||hoopH!==H)buildHoops();return HOOPS};

// ---------- the cable you see: a hanging curve when slack, straight when taut ----------
const N=24,PTS=Array.from({length:N},()=>new THREE.Vector3()),cmat=new THREE.MeshStandardMaterial({color:0xdfe6f2,roughness:.6,metalness:.2});
let cable=null;
export function llDraw(){const hv=hoopMode();if(hv&&!HOOPS.length)buildHoops();hoopG.visible=hv;const d=LL.d,on=!!(S.longline&&d&&d.dead<=0);if(cable)cable.visible=on;if(!on)return;
 cmat.color.setHex(COL[d.team]).lerp(new THREE.Color(0xffffff),.6);
 const a=hookOf(d,_h),b=_r.copy(ball.p).addScaledVector(_n.subVectors(a,ball.p).normalize(),BR),dist=a.distanceTo(b),Lr=ropeLen(),sag=dist<Lr?Math.sqrt(Lr*Lr-dist*dist)*.5:0;
 const t0=d===GS.player&&GS.camMode===0&&!GS.llView?Math.min(.35,4/Math.max(dist,.1)):0;  // in your own FPV view the first 4 m under the lens is skipped and the cable is thinner (it filled the screen)
 for(let i=0;i<N;i++){const t=t0+(1-t0)*i/(N-1);PTS[i].set(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t-sag*4*t*(1-t),a.z+(b.z-a.z)*t)}
 const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(PTS),N,(t0?.035:.07)*DRAD/.6,5,false);if(cable){cable.geometry.dispose();cable.geometry=g}else{cable=new THREE.Mesh(g,cmat);cable.frustumCulled=false;scene.add(cable)}}

// ---------- reference for where the ball is: the "who has it" badge, a load gauge, and a marker on the ground under the ball ----------
// Load gauge (above the speed dial, only while you hold the line): a top-down scope centred on your quad with your nose up. The ring is the
// cable length; the dot is the ball (inside = slack, on the ring = hanging taut); the tick from the dot is where it is swinging; the
// numbers are how far below you it hangs and the cable load (x your quad's weight). The ground marker is a ring under the ball and
// a drop line to it, so from any camera angle you can see where it is over the pitch.
let hudKey='';const _f=new THREE.Vector3(),_g=new THREE.Vector3();
const mk=new THREE.Group();mk.visible=false;scene.add(mk);
const mkRing=new THREE.Mesh(new THREE.RingGeometry(.86,1,48).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.6,depthWrite:false,toneMapped:false}));mk.add(mkRing);
const mkDrop=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1,6).translate(0,.5,0),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.35,depthWrite:false,toneMapped:false}));mk.add(mkDrop);
function llHud(d){const box=$('llbox');if(!box)return;const mine=!!d&&d===GS.player,show=S.longline&&!GS.demo&&!GS.net&&!GS.menuOpen;
 const key=!show?'':!d?'loose':mine?'me':d.team+':'+d.name;if(key!==hudKey){hudKey=key;box.hidden=!show||!d;box.classList.toggle('mine',mine);box.style.setProperty('--tc',['#3d95ff','#ff8a2a'][d?.team??0]);
  $('llhdr').textContent=!d?'':mine?'YOU HAVE THE BALL':`${d.team===GS.player?.team?'TEAMMATE':TEAM[d.team]} · ${d.name.toUpperCase()} HAS IT`}
 const sc=show&&mine&&!GS.llView;$('llscope').hidden=!sc;if(sc)scope(d)}
function scope(d){const cv=$('llscope'),g=cv.getContext('2d'),W=cv.width,c=W/2,R=W*.36,L=ropeLen()+BR,tc=['#3d95ff','#ff8a2a'][d.team];
 const f=_f.set(0,0,-1).applyQuaternion(d.q);f.y=0;if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();const rt=_g.set(-f.z,0,f.x);  // heading frame: forward, right
 const dx=ball.p.x-d.p.x,dz=ball.p.z-d.p.z,fw=dx*f.x+dz*f.z,sd=dx*rt.x+dz*rt.z,k=R/L,clampR=(x,y)=>{const m=Math.hypot(x,y),lim=W*.46;return m>lim?[x*lim/m,y*lim/m]:[x,y]};
 const[bx,by]=clampR(sd*k,-fw*k),rvx=ball.v.x-d.v.x,rvz=ball.v.z-d.v.z,vf=rvx*f.x+rvz*f.z,vs=rvx*rt.x+rvz*rt.z;
 g.clearRect(0,0,W,W);g.fillStyle='rgba(5,8,16,.55)';g.beginPath();g.arc(c,c,W*.48,0,7);g.fill();
 g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=1;g.beginPath();g.moveTo(c,c-W*.46);g.lineTo(c,c+W*.46);g.moveTo(c-W*.46,c);g.lineTo(c+W*.46,c);g.stroke();
 g.strokeStyle='rgba(255,255,255,.12)';g.beginPath();g.arc(c,c,R*.5,0,7);g.stroke();g.strokeStyle=tc;g.lineWidth=2;g.beginPath();g.arc(c,c,R,0,7);g.stroke();
 g.fillStyle='#fff';g.beginPath();g.moveTo(c,c-9);g.lineTo(c-6,c+6);g.lineTo(c,c+3);g.lineTo(c+6,c+6);g.closePath();g.fill();  // you, nose up
 g.strokeStyle='rgba(255,255,255,.55)';g.setLineDash([3,3]);g.beginPath();g.moveTo(c,c);g.lineTo(c+bx,c+by);g.stroke();g.setLineDash([]);
 g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.moveTo(c+bx,c+by);g.lineTo(c+bx+vs*k*.35,c+by-vf*k*.35);g.stroke();  // where it is swinging (0.35 s ahead)
 g.fillStyle=tc;g.strokeStyle='#fff';g.beginPath();g.arc(c+bx,c+by,6,0,7);g.fill();g.stroke();
 const below=d.p.y-ball.p.y;g.font='700 11px "JetBrains Mono",monospace';g.textAlign='center';g.fillStyle='#fff';g.fillText((below>=0?'↓':'↑')+Math.abs(below).toFixed(0)+' m',c,W-6);
 g.fillStyle=LL.load>1.2?'#ff6b5a':'#cfe3ff';g.fillText('LOAD '+LL.load.toFixed(1)+'×',c,13)}
export function llHudFrame(){const d=LL.d;llHud(S.longline?d:null);
 mk.visible=!!(S.longline&&!GS.OBSON&&ball.p&&!GS.demo);if(!mk.visible)return;const s=BR*1.15;mkRing.scale.setScalar(s);mkRing.position.set(ball.p.x,.06,ball.p.z);
 mkRing.material.color.setHex(d?COL[d.team]:0xffffff);mkDrop.position.set(ball.p.x,0,ball.p.z);mkDrop.scale.set(1,Math.max(.01,ball.p.y-BR),1);mkDrop.material.color.copy(mkRing.material.color)}
