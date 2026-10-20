// Bosses: the Ace of Aces ("KOSCHEI", the Deathless) and his secret return, the Ghost of the Ace, plus the spectres the Ghost raises.
// The Ace is a rare event (wave 12 on Normal, once a run unless he got away): a named enemy fighter that duels you one on one. He hunts your
// interceptor and builds a missile lock on your six (a warning tone and the LOCKING ring tell you; break hard and the missile overshoots), he
// snaps guns at you on a head-on pass, he breaks away when you close, and when you are down he makes bombing runs on your sites. He learns:
// every approach you make is filed by aspect (high / level / low, six / beam / head-on) and once you have a favourite he breaks early against it,
// so vary how you come in. His weak moments: the 2.5 s after a missile shot (he flies straight to clear) and the pull-out after a bombing run.
// Hurt badly he runs for the map edge: finish him or he escapes. His record is kept between runs: sites hit, kills, defeats, escapes; the kill
// tally is painted under his canopy. Beaten: the Ace Instinct trophy.
// The Ghost of the Ace: only after you have beaten the Ace once. Each run his wreck lies somewhere on the map (beyond the river line when
// sorties exist, zsortie.js; anywhere in the area otherwise), half-buried, with a thin green wisp over it. Fly within 45 m of it and he returns
// next wave: a spectre of the Ace commanding a legion of spectral copies of what you shot down this run, flying your own swarm's formations
// (zswarm.js). Phases: HAUNT (the legion screens him), LEGION (a fresh legion, a wedge; spectres dive at you), DEATHLESS (he flickers between
// solid and intangible: only solid hits count). Beaten: the Deathless trophy (once a wave, a lost interceptor comes back where it was).
import {registerBoss} from './zbosses.js';
import {dot} from '../../engine/render.js';
import {KIND} from './zdata.js';
const KN='KOSCHEI';

// ---------- model: a twin-tail delta fighter, built in code; decals drawn on canvases ----------
const fitUV=(geo)=>{const uv=geo.attributes.uv;if(!uv)return geo;let a=1e9,b=-1e9,c=1e9,d=-1e9;for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);a=Math.min(a,u);b=Math.max(b,u);c=Math.min(c,v);d=Math.max(d,v)}
 for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)-a)/(b-a||1),(uv.getY(i)-c)/(d-c||1));return geo};
function skinTex(C,ghost){return C.decal('ace-skin'+(ghost?'g':''),512,512,(g,w,h)=>{const{D2,rnd}=C;g.fillStyle=ghost?'#0c2a26':'#3a3d43';g.fillRect(0,0,w,h);
 for(let i=0;i<26;i++){g.fillStyle=ghost?(i%3?'rgba(60,255,200,.12)':'rgba(0,0,0,.4)'):(i%3?'#23252a':'#5b1517');g.beginPath();const x=rnd(0,w),y=rnd(0,h);g.moveTo(x,y);for(let k=0;k<3;k++)g.lineTo(x+rnd(-120,120),y+rnd(-60,60));g.closePath();g.fill()}
 D2.panels(g,w,h,ghost?'#7dffcf':'#101114',12,.35);D2.grime(g,w,h,.1);
 g.fillStyle=ghost?'rgba(125,255,207,.7)':'#b3191e';for(const x of[0,w-46])for(let k=0;k<4;k++){g.beginPath();g.moveTo(x,40+k*22);g.lineTo(x+46,52+k*22);g.lineTo(x,64+k*22);g.fill()}})}  // wingtip chevrons
function insigniaTex(C,ghost){return C.decal('ace-ins'+(ghost?'g':''),256,256,(g,w)=>{const c=w/2,{D2}=C;g.fillStyle=ghost?'rgba(10,40,34,.9)':'#111';g.beginPath();g.arc(c,c,118,0,7);g.fill();
 g.strokeStyle=ghost?'#7dffcf':'#c8202a';g.lineWidth=10;g.beginPath();g.arc(c,c,110,0,7);g.stroke();
 g.fillStyle=ghost?'#b8fff0':'#e8e2d0';g.beginPath();g.moveTo(c-46,c-58);for(let i=0;i<5;i++){g.lineTo(c-46+i*23+11,c-96);g.lineTo(c-46+(i+1)*23,c-58)}g.closePath();g.fill();  // the crown
 D2.skull(g,c,c+16,56,ghost?'#b8fff0':'#e8e2d0',ghost?'#00ffaa':'#c8202a');
 g.strokeStyle=ghost?'#7dffcf':'#c8202a';g.lineWidth=6;g.beginPath();g.moveTo(c+70,c+70);g.lineTo(c-80,c-80);g.stroke();g.fillStyle=g.strokeStyle;g.beginPath();g.ellipse(c+76,c+76,10,16,-Math.PI/4,0,7);g.fill()})}  // Koschei's needle
function nameTex(C,ghost,kills){return C.decal(`ace-name${ghost?'g':''}${Math.min(60,kills)}`,512,128,(g,w,h)=>{const{D2}=C;D2.text(g,KN,150,40,54,ghost?'#9dffe0':'#d42a2a','italic 700');D2.text(g,'13',430,48,84,ghost?'#9dffe0':'#e8e2d0','700');
 g.fillStyle=ghost?'#7dffcf':'#e8e2d0';for(let i=0;i<Math.min(60,kills);i++){const x=20+(i%20)*14,y=86+(i/20|0)*14;g.beginPath();g.moveTo(x,y+10);g.lineTo(x+4,y);g.lineTo(x+8,y+10);g.fill()}  // interceptors he downed
 if(!kills)D2.text(g,'· · ·',150,98,22,'rgba(232,226,208,.4)')})}
function aceMats(C,ghost){const T=C.THREE,ex=ghost?{transparent:true,opacity:.58,depthWrite:false,emissive:new T.Color(0x1aff9a),emissiveIntensity:.55}:{};
 return{skin:new T.MeshStandardMaterial({map:skinTex(C,ghost),roughness:.5,metalness:.45,...ex}),dark:new T.MeshStandardMaterial({color:ghost?0x0a3a30:0x16171a,roughness:.4,metalness:.6,...ex}),
  glass:new T.MeshStandardMaterial({color:ghost?0x40ffd0:0x101820,roughness:.05,metalness:.9,emissive:new T.Color(ghost?0x40ffd0:0x000000),emissiveIntensity:ghost?1:0}),
  hot:new T.MeshBasicMaterial({color:new T.Color(ghost?0x40ffc0:0xff7a30).multiplyScalar(3),toneMapped:false}),
  ins:new T.MeshBasicMaterial({map:insigniaTex(C,ghost),transparent:true,alphaTest:.05,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
  name:new T.MeshBasicMaterial({map:nameTex(C,ghost,C.rec().ace.kills|0),transparent:true,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})}}
const MC={};
export function aceModel(C,ghost,charred){const T=C.THREE,g=C.group(),k=(ghost?'g':'a')+(charred?'c':'');const M=MC[k]&&MC[k].kills===(C.rec().ace.kills|0)?MC[k]:(MC[k]=aceMats(C,ghost));M.kills=C.rec().ace.kills|0;
 if(charred){for(const m of['skin','dark'])M[m]=M[m].clone(),M[m].color=new T.Color(0x2a2522),M[m].roughness=1}
 const body=new T.LatheGeometry([[0,-7.2],[.55,-7],[.85,-5],[1,-1],[.95,2],[.7,4.5],[.35,6.6],[0,7.8]].map(([r,y])=>new T.Vector2(r,y)),20).rotateX(Math.PI/2);C.mesh(g,body,M.skin);
 const wS=new T.Shape();wS.moveTo(0,3.4);wS.lineTo(6.6,-3.2);wS.lineTo(6.6,-4.4);wS.lineTo(-6.6,-4.4);wS.lineTo(-6.6,-3.2);wS.closePath();
 C.mesh(g,fitUV(new T.ExtrudeGeometry(wS,{depth:.22,bevelEnabled:false}).rotateX(Math.PI/2).translate(0,.1,-1.2)),M.skin);
 const cS=new T.Shape();cS.moveTo(0,.9);cS.lineTo(2.3,-.5);cS.lineTo(2.3,-.85);cS.lineTo(-2.3,-.85);cS.lineTo(-2.3,-.5);cS.closePath();C.mesh(g,fitUV(new T.ExtrudeGeometry(cS,{depth:.12,bevelEnabled:false}).rotateX(Math.PI/2).translate(0,.25,4.4)),M.dark);
 const fS=new T.Shape();fS.moveTo(-6.8,0);fS.lineTo(-3.6,0);fS.lineTo(-5.3,3.4);fS.lineTo(-6.9,3.4);fS.closePath();
 for(const s of[-1,1]){const f=C.mesh(g,fitUV(new T.ExtrudeGeometry(fS,{depth:.14,bevelEnabled:false}).translate(0,0,-.07).rotateY(-Math.PI/2)),M.skin,s*1.15,.45,0);f.rotation.z=-s*.22;
  const ins=C.mesh(g,new T.PlaneGeometry(1.7,1.7),M.ins,s*(1.15+.12),2.2,-5.5,false);ins.rotation.y=s*Math.PI/2;ins.rotation.x=0;ins.rotation.z=-s*.22;
  const nm=C.mesh(g,new T.PlaneGeometry(3.4,.85),M.name,s*.99,.25,2.2,false);nm.rotation.y=s*Math.PI/2;
  C.mesh(g,new T.CylinderGeometry(.42,.5,1.1,14).rotateX(Math.PI/2),M.dark,s*.55,0,-7.3);C.mesh(g,new T.CircleGeometry(.4,14),M.hot,s*.55,0,-7.86,false).rotation.y=Math.PI;
  C.mesh(g,new T.BoxGeometry(.5,.7,2.6),M.dark,s*.95,-.15,1.4)}
 const cn=C.mesh(g,new T.SphereGeometry(.5,16,10),M.glass,0,.72,3.7);cn.scale.set(.85,.75,2.6);
 g.userData.hot=M.hot;g.userData.M=M;return g}

// ---------- the Ace's missiles and gun tracers (host): a homing missile you can out-turn, tracers you can see coming ----------
const MS=[],TR=[];
function msStep(C,dt){const{api}=C;for(let i=MS.length-1;i>=0;i--){const m=MS[i],d=m.tg;m.life-=dt;if(!d||d.dead>0||m.life<=0){MS.splice(i,1);api.FX.emit(m.p,0xffd080,12,6,.3,null,2);continue}
  const r=new C.V3().subVectors(d.p,m.p),dist=r.length();if(dist<8){MS.splice(i,1);api.boom(m.p,1.2);if(d===api.player)C.shoot(`${KN}'s missile`)&&C.recAdd('ace','kills');continue}
  const des=r.addScaledVector(d.v,Math.min(2,dist/m.spd)).normalize(),cur=m.v.clone().normalize(),a=Math.acos(C.cl(cur.dot(des),-1,1));if(a>1e-4)cur.lerp(des,Math.min(1,m.turn*dt/a)).normalize();
  m.v.copy(cur).multiplyScalar(m.spd);m.p.addScaledVector(m.v,dt);if(Math.random()<.8)api.SMK.emit(m.p,0xe8e4dc,1,1,2.6,null,1,.55)}
 for(let i=TR.length-1;i>=0;i--){const t=TR[i];t.life-=dt;t.p.addScaledVector(t.v,dt);if(t.life<=0)TR.splice(i,1)}}
function fireMissile(C,t,d){MS.push({p:t.p.clone().add(new C.V3(0,-1.2,0)),v:t.v.clone().setLength(150),spd:175,turn:.95,tg:d,life:9});C.api.FX.emit(t.p,0xffc070,30,10,.4,null,2.5)}

// ---------- the duel AI: shared by the Ace and his ghost ----------
function duel(C,t,dt,o){const{api,G,V3}=C,B=t.bs,ph=B.ph,gh=api.gh;B.mcd=(B.mcd||0)-dt;B.gcd=(B.gcd||0)-dt;B.brkCd=(B.brkCd||0)-dt;B.ext=(B.ext||0)-dt;B.learn=B.learn||{};
 const P=C.nearPilot(t.p),r=P?P.p.distanceTo(t.p):1e9,flying=P&&P.v.length()>12&&r<5000,K=o.spd*[1,1.1,1.22][ph];
 // learning: each run at him from inside 650 m is filed by aspect; a favourite (3 of the same) makes him break early against it
 if(P&&r<650){const cv=-new V3().subVectors(t.v,P.v).dot(new V3().subVectors(t.p,P.p))/r;if(!B.appr&&cv>10){B.appr=1;const A=C.aspect(P.p,t);B.learn[A.key]=(B.learn[A.key]|0)+1;B.last=A.key;
   const f=Object.entries(B.learn).sort((a,b)=>b[1]-a[1])[0];if(f[1]>=3&&f[0]!==B.fav){B.fav=f[0];if(P===api.player)C.Z.an?.radio(o.who,o.taunt(f[0]),2)}}}
 else if(r>900)B.appr=0;
 const favK=B.fav&&B.last===B.fav&&B.appr?Math.min(1,(B.learn[B.fav]|0)/4):0,brkR=330*(1+.9*favK);
 if(B.flee){const e=new V3(Math.sign(t.p.x||1)*5000,0,t.p.z<1950?-5000:t.p.z);C.steer(t,C.levelTo(t,e,500),K*1.25,1,dt,120);if(Math.abs(t.p.x)>4400||Math.abs(t.p.z)>4400){o.escape(C,t)}return true}
 if(B.brkT>0){B.brkT-=dt;const away=new V3().subVectors(t.p,P?P.p:t.p).setY(0).normalize(),side=new V3(-away.z,0,away.x).multiplyScalar(B.bd);const des=away.add(side).setY(B.bv).normalize();
  C.steer(t,des,K*1.3,1.7,dt,60);if(B.brkT<=0&&P&&Math.random()<.55)B.ext=-1;return true}
 if(P&&r<brkR&&B.brkCd<=0){const cv=-new V3().subVectors(t.v,P.v).dot(new V3().subVectors(t.p,P.p))/Math.max(1,r);if(cv>12){const A=C.aspect(P.p,t);B.brkT=1.4;B.brkCd=ph===2?2.4:3.4;B.bd=A.side==='LEFT'?-1:1;B.bv=A.el==='HIGH'?-.35:A.el==='LOW'?.4:(Math.random()<.5?.3:-.3);return true}}
 if(B.ext>0){C.steer(t,new V3().copy(t.v).setY(0).normalize(),K*1.1,.2,dt,80);return true}
 if(!flying){if(!B.site||B.site.hp<=0)B.site=C.pick(C.sites());const s=B.site;if(!s)return true;const dh=Math.hypot(s.x-t.p.x,s.z-t.p.z);
  C.steer(t,C.levelTo(t,new V3(s.x,s.y,s.z),dh<900?140:450),K,.9,dt,60);if(dh<160&&!B.run){B.run=1;C.strike(t,s,o.bomb);o.onBomb?.(C,t);B.ext=3;B.site=null}if(dh>600)B.run=0;return true}
 // hunt: get on your six; a missile lock builds while you sit in his nose cone; guns on a close head-on pass
 const six=new V3().copy(P.v).setY(0);if(six.lengthSq()<1)six.set(0,0,1);six.normalize();const goal=new V3().copy(P.p).addScaledVector(six,-380);goal.y=Math.max(goal.y,gh(goal.x,goal.z)+60);
 const des=new V3().subVectors(r<700?P.p:goal,t.p).normalize();C.steer(t,des,K,1.05,dt,50);
 const fw=new V3().copy(t.v).normalize(),ang=fw.angleTo(new V3().subVectors(P.p,t.p));
 if(r<1150&&r>160&&ang<.35&&B.mcd<=0&&o.missiles)B.lock=Math.min(1,(B.lock||0)+dt/(ph?1.9:2.7));else B.lock=Math.max(0,(B.lock||0)-dt*.7);
 if(B.lock>=1){B.lock=0;B.mcd=ph?5:7;fireMissile(C,t,P);B.ext=2.5;o.onShot?.(C,t,P)}
 if(r<420&&ang<.14&&B.gcd<=0){B.gcd=3;for(let i=0;i<10;i++)TR.push({p:t.p.clone().addScaledVector(fw,6),v:fw.clone().multiplyScalar(600).add(new V3(C.rnd(-12,12),C.rnd(-12,12),C.rnd(-12,12))),life:1});
  if(Math.random()<[.3,.4,.5][ph]*(P===api.player?1:0)&&C.shoot(`${o.who}'s guns`))C.recAdd('ace','kills')}
 return true}

// HUD warnings for you: the lock building on your six, a missile in the air, his nose on you
function warn(C,oc,t,W,H){const{api}=C,d=api.player;if(!d||d.dead>0)return;const B=t.bs;let y=H*.24;oc.font='700 15px "JetBrains Mono",monospace';
 if(B.lock>.05){oc.fillStyle=Math.sin(performance.now()/90)>0?'#ff4d4d':'#ffc640';oc.fillText(`${t.k==='gace'?'THE DEATHLESS':KN} LOCKING ${Math.round(B.lock*100)}% · BREAK`,W/2,y);y+=20;
  if(B.lock>.05&&C.SND.ok&&(B.bp=(B.bp||0)-1/60)<=0){B.bp=.5-.4*B.lock;C.api.tone(1100+600*B.lock,1100+600*B.lock,.06,.05,'square')}}
 for(const m of MS)if(m.tg===d){const r=m.p.distanceTo(d.p);oc.fillStyle='#ff4d4d';oc.fillText(`MISSILE ${Math.round(r)} m · TURN HARD`,W/2,y);y+=20;
  const q=m.p.clone().project(api.camera);let x=q.x,yy=q.y;if(q.z>1){x=-x;yy=-yy}const k=Math.max(Math.abs(x)/.85,Math.abs(yy)/.8,1);oc.beginPath();oc.arc((x/k*.5+.5)*W,(-yy/k*.5+.5)*H,14,0,7);oc.strokeStyle='#ff4d4d';oc.lineWidth=3;oc.stroke()}
 const fw=t.v.clone().normalize(),rv=d.p.clone().sub(t.p);if(rv.length()<700&&fw.angleTo(rv)<.2){oc.fillStyle='#ffc640';oc.fillText('GUNS · HIS NOSE IS ON YOU',W/2,y)}}

// ---------- tracer, missile and spectre drawing ----------
let FXP=null;
function fxPts(C){if(FXP)return FXP;const T=C.THREE,N=120,pos=new Float32Array(N*3),col=new Float32Array(N*3),geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('color',new T.BufferAttribute(col,3));
 const pts=new T.Points(geo,new T.PointsMaterial({size:8,sizeAttenuation:false,vertexColors:true,map:dot,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));pts.frustumCulled=false;geo.setDrawRange(0,0);C.api.scene.add(pts);return FXP={pos,col,geo,N}}
function fxDraw(C){const F=fxPts(C);let n=0;const put=(p,r,g,b)=>{if(n>=F.N)return;F.pos[n*3]=p.x;F.pos[n*3+1]=p.y;F.pos[n*3+2]=p.z;F.col[n*3]=r;F.col[n*3+1]=g;F.col[n*3+2]=b;n++};
 for(const m of MS)put(m.p,3,2,1.1);for(const t of TR)put(t.p,3,2.4,.8);F.geo.setDrawRange(0,n);F.geo.attributes.position.needsUpdate=F.geo.attributes.color.needsUpdate=true}

// spectres: instanced copies of the kinds you killed (green, translucent) or of your own swarm drones (the Mirror's, black with red lights)
const SPI={};
function spDraw(C){const{THREE:T,api,Z}=C,cnt={};for(const k in SPI)cnt[k]=0;const _m=new T.Matrix4();
 for(const t of api.TH){if(t.k!=='spectre'||t.st==='dead')continue;const key=t.sv==='mirror'?'mirror':t.src;let I=SPI[key];
  if(!I){let geo;if(key==='mirror')geo=new T.BoxGeometry(.9,.25,.9);else geo=Z.en.IM[key]?.[0]?.geometry||Z.en.IM.shahed[0].geometry;
   const mat=key==='mirror'?new T.MeshStandardMaterial({color:0x050505,roughness:.3,metalness:.8,emissive:new T.Color(0x600000),emissiveIntensity:.6}):new T.MeshStandardMaterial({color:0x0a3a30,emissive:new T.Color(0x22ffaa),emissiveIntensity:.9,transparent:true,opacity:.55,depthWrite:false});
   I=SPI[key]=new T.InstancedMesh(geo,mat,24);I.frustumCulled=false;I.count=0;api.scene.add(I);cnt[key]=0}
  const i=cnt[key]++;if(i>=24)continue;t.mesh.updateMatrix();_m.copy(t.mesh.matrix).scale(new C.V3(1.4,1.4,1.4).multiplyScalar(key==='mirror'?1.6:key==='swarm'?2.2:1));I.setMatrixAt(i,_m)}
 for(const k in SPI){SPI[k].count=cnt[k]|0;SPI[k].instanceMatrix.needsUpdate=true}}

// ---------- the legion: spectres in formation around their leader (your swarm's formations, zswarm.js slot()) ----------
export function legionRaise(C,lead,n,kinds,o={}){const L=[];const tot=Object.values(kinds).reduce((a,b)=>a+b,0)||1;
 for(let i=0;i<n;i++){let r=Math.random()*tot,src='shahed';for(const[k,c]of Object.entries(kinds)){r-=c;if(r<=0){src=k;break}}
  const p=lead.p.clone().add(new C.V3(C.rnd(-40,40),C.rnd(-10,10),C.rnd(-40,40))),t=C.spawn('spectre',{x:p.x,z:p.z,y:p.y,enc:lead.bs.enc,v:lead.v.clone()});if(!t)break;
  t.src=KIND[src]&&!KIND[src].bossy?src:'shahed';t.sv=o.sv||'ghost';t.bs.lead=lead;t.bs.i=i;t.bs.hp=t.bs.max=1;t.bs.init=1;L.push(t)}return L}
function spectreTick(C,t,dt){const{api,G,V3}=C,B=t.bs,ld=B.lead;if(!ld||ld.bs.dead||ld.st==='dead'){C.vanish(t,'collapsed');api.FX.emit(t.p,t.sv==='mirror'?0xff3020:0x40ffc0,30,10,.8,null,2.5);return true}
 const sq=api.TH.filter(u=>u.k==='spectre'&&u.bs.lead===ld&&u.st!=='dead'&&!u.bs.dive),n=Math.max(1,sq.length),i=Math.max(0,sq.indexOf(t)),form=ld.bs.form|0;
 if(B.dive){const d=C.nearPilot(t.p);if(!d){B.dive=0;return true}const r=d.p.distanceTo(t.p);C.steer(t,C.dirTo(t,d.p),ld.spd*1.2+20,2.2,dt,8);B.dt=(B.dt||0)+dt;
  if(r<7){C.vanish(t,'struck');api.boom(t.p,.8);if(d===api.player)C.shoot(t.sv==='mirror'?'your own drone':'a spectre');return true}if(B.dt>14)B.dive=0;return true}
 const f=ld.v.clone().setY(0);if(f.lengthSq()<1)f.set(0,0,1);f.normalize();const P=C.nearPilot(ld.p),ax=P?new V3().subVectors(P.p,ld.p).setY(0).normalize():f;
 const S=new V3();if(C.Z.sw?.slot)C.Z.sw.slot(form,i,n,ld.p,f,ax,(B.ph2=(B.ph2||Math.random()*6)+dt*.4),S);else S.copy(ld.p).add(new V3(Math.cos(i)*30,0,Math.sin(i)*30));
 S.multiplyScalar(1).sub(ld.p).multiplyScalar(form===0?3.2:2.6).add(ld.p);S.y=Math.max(S.y,api.gh(S.x,S.z)+20);
 const e=new V3().subVectors(S,t.p),dist=e.length();const des=e.normalize().multiplyScalar(Math.min(1,dist/40)).add(ld.v.clone().normalize().multiplyScalar(Math.max(0,1-dist/40)));if(des.lengthSq()<1e-4)des.copy(ld.v).normalize();
 C.steer(t,des.normalize(),Math.min(ld.spd*1.5+30,ld.spd+dist*.8),2.4,dt,15);return true}

// ---------- the wreck (Ghost of the Ace trigger) ----------
const WK={m:null,wisp:0,snd:null};
function wreckPlace(C){const{api,G,Z}=C,gh=api.gh,so=!!Z.so;for(let k=0;k<200;k++){const x=C.rnd(-3800,3800),z=so?C.rnd(-4100,-1300):C.rnd(-3900,3900);
  if(Math.abs(z-api.rivZ(x))<160||Math.hypot(x-C.siteC.x,z-C.siteC.z)<(so?0:1900)||api.FOBS.some(f=>Math.hypot(f.x-x,f.z-z)<500))continue;
  if(so&&Z.so.W?.list?.some(q=>Math.hypot((q.x??1e9)-x,(q.z??1e9)-z)<450))continue;return{x,z,y:gh(x,z),found:false}}return{x:2600,z:-2600,y:gh(2600,-2600),found:false}}
function wreckBuild(C){const{api}=C,w=C.G.wreck;if(!w)return;wreckClear(C);const g=aceModel(C,false,true);g.position.set(w.x,w.y-1.4,w.z);g.rotation.set(.35,C.rnd(0,6),.6);
 for(const c of g.children)if(c.position.x>3||c.position.z<-5)c.rotation.z+=.6;api.scene.add(g);WK.m=g}
function wreckClear(C){if(WK.m){C.api.scene.remove(WK.m);WK.m.traverse(o=>o.geometry?.dispose());WK.m=null}}

// ---------- registration ----------
const ACE={id:'ace',n:'Ace of Aces',tag:KN,col:'#ff3b3b',spd:88,alt:[500,800],hitR:3,det:12000,cash:1500,bounty:6000,far:6000,
 resist:{rack:.25,gepard:.3,sam:.6,mpads:.5,idome:.3,hflak:.15},hp:6,phases:['DUEL','WOUNDED','DESPERATE'],
 note:`a named enemy ace who duels you: he locks your six (break hard when you hear the tone), snaps guns on a head-on pass, bombs your sites while you are down, and learns your favourite approach. Rare, with a big bounty.`,
 warn:'an enemy ace hunting you',spawn:{event:{from:12,p:.04,once:false,again:.3}},
 can:(C,w)=>!C.G.bseen?.ace||C.G.aceEsc&&w-C.G.aceEsc>=6,
 intro:{title:'ACE OF ACES',sub:(C)=>{const r=C.rec().ace;return`${KN} · ${r.kills|0} kills · ${r.hits|0} sites hit · beaten ${r.beaten|0}× · escaped ${r.escaped|0}×`},
  radio:(C)=>C.rec().ace.beaten?`${KN}: "You again. I remember how you fly."`:`${KN}: "Your little drones. Come and dance."`,who:KN},
 build:(C)=>aceModel(C,false),
 init(C,t){const B=t.bs;B.learn={};t.p.y=C.api.gh(t.p.x,t.p.z)+600;C.recAdd('ace','met')},
 tick(C,t,dt){const B=t.bs;if(B.ph>=2&&!B.p2)B.p2=B.age;if(!B.flee&&(B.age>200||B.p2&&B.age-B.p2>50)){B.flee=1;C.Z.an?.radio(KN,'"Another day, little drone."',2)}
  return duel(C,t,dt,{spd:88,missiles:true,bomb:45,who:KN,escape:(C,t)=>{C.vanish(t,'escaped');C.recAdd('ace','escaped');C.G.aceEsc=C.G.wave},
   onBomb:C=>C.recAdd('ace','hits'),taunt:k=>`${KN}: "Always from the ${k.toLowerCase()}. I see you coming."`})},
 hit(C,t,h){const B=t.bs;if(h.q==='helper')return Math.random()<.5?1:0;if(B.brkT>0&&h.q==='damage'&&Math.random()<.5){h.txt='JINKED';return 0}return h.q==='kill'?2:1},
 hurt(C,t){t.bs.lock=Math.max(t.bs.lock||0,.3);t.bs.brkCd=0},
 phase(C,t,i){if(i===1)C.Z.an?.radio(KN,'"A scratch. Now I am angry."',2);if(i===2)C.Z.an?.radio(KN,'"Enough!"',2)},
 jinkK:(C,u,t)=>t===u?.5:1,lockSelf:()=>1.8,
 status(C,e){const B=e.main.bs;return`${B.fav?`READING YOU: <b>${B.fav}</b> · vary your approach`:'learning your approach'}${B.mcd>0&&B.ext>0?' · <b>WINDOW</b>: he is clearing his shot':''}${B.flee?' · <b>RUNNING</b> for the edge':''}`},
 vis(C,t,dt){fxDraw(C);const B=t.bs;if(B.ph>0&&(B.sm=(B.sm||0)-dt)<=0){B.sm=B.ph>1?.04:.09;C.api.SMK.emit(t.p,0x2a2826,1,1.2,4,null,1,.7)}},
 overlay:(C,oc,t,W,H)=>warn(C,oc,t,W,H),
 netOut:(C,t)=>[Math.round((t.bs.lock||0)*100),t.bs.flee?1:0],netIn(C,t,a){t.bs.lock=(a[0]|0)/100;t.bs.flee=a[1]|0},
 aim(C,t,s){const B=t.bs,pen=B.fav&&B.fav===B.last?.45*Math.min(1,(B.learn[B.fav]|0)/4):0,good=Math.random()<s*(1-pen)*(B.brkT>0?.5:1);B.learn['LEVEL SIX']=(B.learn['LEVEL SIX']|0)+1;B.last='LEVEL SIX';if(!B.fav&&B.learn['LEVEL SIX']>=3)B.fav='LEVEL SIX';
  return{p:t.p.clone().addScaledVector(t.v.clone().normalize(),good?-.8:-7)}},
 won(C,e){C.recAdd('ace','beaten');C.Z.an?.radio(KN,'"…not… the needle…"',2);C.api.feed('<span class="cg">KOSCHEI is down.</span> Legends say he never stays dead.')},
 winTxt:`Splash ${KN}! The Ace of Aces is down.`,escTxt:'broke off and escaped toward the border',
 sting(S){const t0=S.t+.05,o=S.out(.9);for(const[f,d]of[[1318,0],[1046,.22],[784,.44]]){const x=S.osc('sawtooth',f,t0+d,.5),fl=S.filt('bandpass',f*1.5,3);x.connect(fl).connect(S.env(t0+d,.07,.02,.5,o))}  // three falling notes: his call
  const n=S.nz(t0,2.2),f=S.filt('bandpass',900,.6);f.frequency.setValueAtTime(300,t0);f.frequency.exponentialRampToValueAtTime(3500,t0+1.4);n.connect(f).connect(S.env(t0,.18,.6,2.2,o))},  // jet scream
 loop(S){const o=S.out(0),g=S.osc('sawtooth',140,S.t,0),f=S.filt('lowpass',900,1.5),n=S.nz(S.t,0),nf=S.filt('bandpass',2200,.8);g.connect(f).connect(o);n.connect(nf).connect(o);return{g:o,stop(){g.stop();n.stop()},set(C,t){const d=t.p.distanceTo(C.api.camera.position);g.frequency.setTargetAtTime(140+60*(t.spd/120)-d*.01,C.api.AC.currentTime,.2)}}},
 reward:{id:'instinct',n:'Ace Instinct',short:'evaders telegraph their break; jets and cruise missiles lock 40% faster',txt:'Tracks that evade show which way they will break (an amber chevron), and your lock on jets and cruise missiles builds 40% faster.',
  lockK:(C,t)=>t.k==='jet'||t.k==='cruise'?.6:1},
 g:{step(C,dt){if(C.auth())msStep(C,dt)},vis(C){if(!C.api.TH.some(t=>t.k==='ace'||t.k==='gace'))fxDraw(C);spDraw(C)},stop(){MS.length=0;TR.length=0},
  overlay(C,oc,W,H){if(!C.G.brw?.instinct)return;const{api,Z}=C,d=api.player;if(!d||d.dead>0)return;oc.strokeStyle='#ffc640';oc.lineWidth=2.5;
   for(const t of api.TH){if(!api.live(t)||!Z.evades?.(t)||t.p.distanceTo(d.p)>1500)continue;const v=t.v.clone().setY(0).normalize(),lat=new C.V3(-v.z,0,v.x),side=(t.p.x-d.p.x)*lat.x+(t.p.z-d.p.z)*lat.z>0?1:-1;
    const a=t.p.clone().project(api.camera),b=t.p.clone().addScaledVector(lat,side*25).project(api.camera);if(a.z>1||b.z>1)continue;const ax=(a.x*.5+.5)*W,ay=(-a.y*.5+.5)*H,bx=(b.x*.5+.5)*W,by=(-b.y*.5+.5)*H,ang=Math.atan2(by-ay,bx-ax);
    oc.save();oc.translate(ax+Math.cos(ang)*26,ay+Math.sin(ang)*26);oc.rotate(ang);oc.beginPath();oc.moveTo(-5,-7);oc.lineTo(4,0);oc.lineTo(-5,7);oc.stroke();oc.restore()}}}};
registerBoss(ACE);

registerBoss({id:'spectre',n:'Spectre',tag:'SPECTRE',minor:1,armor:0,spd:80,alt:[300,600],hitR:2.2,det:6000,cash:80,resist:{rack:.7,lrack:.7,gepard:.8,flak:.6,sam:.5,mpads:.6,hflak:.6,idome:.3},hp:1,
 build:(C)=>new C.THREE.Object3D(),tick:spectreTick,hit:()=>1,
 tname:(C,t)=>`T${String(t.id).padStart(2,'0')} ${t.sv==='mirror'?'YOUR DRONE?':'SPECTRE · '+(KIND[t.src]?.n||'drone')}`,
 aim:(C,t,s)=>({p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s?-.6:-6)})});

registerBoss({id:'gace',n:'Ghost of the Ace',tag:'THE DEATHLESS',col:'#5dffc8',spd:96,alt:[500,800],hitR:3,det:12000,cash:3000,bounty:9000,far:6000,
 resist:{rack:.15,gepard:.2,sam:.4,mpads:.3,idome:.2},hp:9,phases:['HAUNT','LEGION','DEATHLESS'],
 note:'KOSCHEI returns from his wreck with a legion of spectres raised from what you shot down this run.',warn:'he does not stay dead',
 intro:{title:'HE DOES NOT STAY DEAD',sub:C=>`the Ghost of ${KN} · a legion of ${Object.values(C.G.fallen||{}).reduce((a,b)=>a+b,0)} fallen`,col:'#5dffc8',radio:`${KN}: "Did you think a drone could kill me?"`,who:'???'},
 build(C){const g=aceModel(C,true),T=C.THREE,a=new T.Sprite(new T.SpriteMaterial({map:dot,color:new T.Color(0x30ffb0).multiplyScalar(1.6),transparent:true,opacity:.5,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));a.scale.set(30,30,1);g.add(a);g.userData.aura=a;return g},
 init(C,t){const B=t.bs;B.learn={};B.form=3;C.recAdd('ghost','met');const n=Math.min(12,4+Math.floor(Object.values(C.G.fallen||{}).reduce((a,b)=>a+b,0)/8));B.legion=n;legionRaise(C,t,n,C.G.fallen&&Object.keys(C.G.fallen).length?C.G.fallen:{shahed:1})},
 tick(C,t,dt){const B=t.bs;if(B.ph===2){B.gt=(B.gt||0)+dt;B.intang=B.gt%6>3.5}if(!B.flee&&B.age>240)B.flee=1;
  if(B.ph>=1){B.form=1;if((B.dv=(B.dv||8)-dt)<=0){B.dv=B.ph===2?4:6;const s=C.api.TH.find(u=>u.k==='spectre'&&u.bs.lead===t&&!u.bs.dive&&u.st!=='dead');if(s&&C.nearPilot(t.p)?.p.distanceTo(t.p)<2000)s.bs.dive=1}}
  return duel(C,t,dt,{spd:96,missiles:B.ph<2,bomb:60,who:'THE DEATHLESS',escape:(C,t)=>{C.vanish(t,'escaped')},taunt:k=>`"The ${k.toLowerCase()}, always. Even the dead remember."`})},
 hit(C,t,h){if(t.bs.intang){h.txt='INTANGIBLE';return 0}if(h.q==='helper')return Math.random()<.4?1:0;return h.q==='kill'?2:1},
 phase(C,t,i){if(i===1){const live=C.api.TH.filter(u=>u.k==='spectre'&&u.bs.lead===t&&u.st!=='dead').length;legionRaise(C,t,Math.max(0,t.bs.legion-live),C.G.fallen&&Object.keys(C.G.fallen).length?C.G.fallen:{shahed:1});C.Z.an?.radio('THE DEATHLESS','"Rise. All of you. Again."',2)}
  if(i===2)C.Z.an?.radio('THE DEATHLESS','"You cannot kill what is already dead."',2)},
 lockSelf:()=>2.2,jinkK:(C,u,t)=>t===u?.4:1,
 status(C,e){const B=e.main.bs,n=C.api.TH.filter(u=>u.k==='spectre'&&u.bs.lead===e.main&&u.st!=='dead').length;return`LEGION <b>${n}</b> · ${['SCREEN','WEDGE'][B.form===1?1:0]}${B.ph===2?(B.intang?' · <b>INTANGIBLE</b>: wait':' · <b>SOLID</b>: strike now'):''}${B.fav?` · reading you: <b>${B.fav}</b>`:''}`},
 vis(C,t,dt){fxDraw(C);const B=t.bs,a=t.mesh.userData.aura,M=t.mesh.userData.M;if(a){a.material.opacity=B.intang?.15:.45+.15*Math.sin(performance.now()/180)}
  if(M){M.skin.opacity=B.intang?.18:.58;M.dark.opacity=M.skin.opacity}if((B.sm=(B.sm||0)-dt)<=0){B.sm=.05;C.api.FX.emit(t.p,0x40ffc0,2,3,.9,null,2)}},
 overlay:(C,oc,t,W,H)=>warn(C,oc,t,W,H),
 netOut:(C,t)=>[Math.round((t.bs.lock||0)*100),t.bs.intang?1:0,t.bs.form|0],netIn(C,t,a){t.bs.lock=(a[0]|0)/100;t.bs.intang=a[1]|0;t.bs.form=a[2]|0},
 aim(C,t,s){if(t.bs.intang)return null;return{p:t.p.clone().addScaledVector(t.v.clone().normalize(),Math.random()<s*.8?-.8:-7)}},
 won(C){C.recAdd('ghost','beaten')},winTxt:'The Deathless is gone. For now.',
 sting(S){const t0=S.t+.05,o=S.out(1);for(const f of[110,116.5,164.8,174.6]){const x=S.osc('sine',f,t0,4.5),tr=S.osc('sine',.7+Math.random(),t0,4.5),tg=S.env(t0,.05,1.2,4.5,o);x.connect(tg);tr.connect(x.frequency)}  // a detuned dead choir
  const n=S.nz(t0,3.5),f=S.filt('bandpass',2400,4);f.frequency.setValueAtTime(3200,t0);f.frequency.exponentialRampToValueAtTime(600,t0+3.4);n.connect(f).connect(S.env(t0,.12,1.5,3.5,o))},  // a whisper falling away
 loop(S){const o=S.out(0),a=S.osc('sine',98,S.t,0),b=S.osc('sine',103.5,S.t,0),n=S.nz(S.t,0),f=S.filt('bandpass',2600,6);a.connect(o);b.connect(o);n.connect(f).connect(o);return{g:o,stop(){a.stop();b.stop();n.stop()}}},
 reward:{id:'deathless',n:'Deathless',short:'once a wave, a lost interceptor comes back where it was',txt:'Once a wave, the first time your interceptor is lost to a crash, a flat battery or enemy fire, it comes back where it was a moment later, streak kept.',
  save(C,why){const G=C.G;if(G.dlw===G.wave)return false;G.dlw=G.wave;C.api.FX.emit(C.api.player.p,0x40ffc0,60,10,.8,null,3);C.api.banner('DEATHLESS','cg',1.2);return true},
  step(C){const{api,G}=C,d=api.player;if(!d)return;if(d.dead<=0){(G.dlp||(G.dlp=new C.V3())).copy(d.p);G.dls=G.streak;G.dlm=d.mah;return}
   if(G.state==='wave'&&!G.detFlag&&G.dlw!==G.wave&&G.dlp&&d.dead>0&&!d._dlc){d._dlc=1;G.dlw=G.wave;d.dead=0;d.mesh.visible=true;d.p.copy(G.dlp).y+=4;d.v.set(0,0,0);d.w.set(0,0,0);d.gt=.5;if(d.mah>=api.BCAP*.98)d.mah=api.BCAP*.6;G.streak=G.dls|0;
    api.FX.emit(d.p,0x40ffc0,80,12,.9,null,3);api.banner('DEATHLESS','cg',1.4);api.feed('<span class="cg">Deathless: your interceptor came back</span>')}if(d.dead<=0)d._dlc=0}},
 g:{start(C){const{G}=C;C.G.wreck=null;wreckClear(C);if((C.rec().ace.beaten|0)>0){G.wreck=wreckPlace(C);wreckBuild(C)}},
  stop(C){wreckClear(C);if(WK.snd){try{WK.snd.g.gain.value=0;WK.snd.stop()}catch(e){}WK.snd=null}},
  step(C,dt){const{G,api}=C,w=G.wreck;if(!w||w.found||!C.auth())return;const d=C.me();if(!d)return;const dh=Math.hypot(d.p.x-w.x,d.p.z-w.z);w.near=dh;
   if(dh<45&&d.p.y-w.y<60){w.found=true;G.gnext=1;C.recAdd('ghost','found');C.api.banner('THE WRECK OF KOSCHEI','co',3);C.Z.an?.say('YOU FOUND HIS WRECK','something stirs · next wave','#5dffc8',3);
    api.feed('<span style="color:#5dffc8">The wreck of KOSCHEI. The needle is broken… and something stirs.</span> He returns next wave.');if(C.SND.ok)BOSSES_sting(C);api.shake=.6}},
  wave(C){const{G}=C;if(!G.gnext||!C.auth())return;G.gnext=0;const w=G.wreck;const t=C.spawn('gace',{x:w.x,z:w.z,y:w.y+260});if(t){t.v.set(0,40,60)}wreckClear(C);
   C.Z.an?.say('HE DOES NOT STAY DEAD','the Ghost of the Ace','#5dffc8',3);C.api.feed('<span style="color:#5dffc8">The air goes cold. The Deathless rises from his wreck.</span>')},
  note:C=>C.G.gnext?'<p class="zhint"><b style="color:#5dffc8">Something stirs at the wreck of KOSCHEI</b>: next wave, the dead fly again.</p>':'',
  vis(C,dt){const w=C.G.wreck;if(!w||w.found||!WK.m)return;if((WK.wisp-=dt)<=0){WK.wisp=.35;C.api.SMK.emit(new C.V3(w.x+C.rnd(-2,2),w.y+2,w.z+C.rnd(-2,2)),0x8affd8,1,1.2,7,new C.V3(0,4,0),1,.35)}
   const S=C.SND;if(!S.ok)return;const dh=w.near??1e9;if(!WK.snd&&dh<900){const o=S.out(0),n=S.nz(S.t,0),f=S.filt('bandpass',1800,5),l=S.osc('sine',.6,S.t,0),lg=C.api.AC.createGain();lg.gain.value=500;l.connect(lg).connect(f.frequency);n.connect(f).connect(o);WK.snd={g:o,stop(){n.stop();l.stop()}}}
   if(WK.snd)WK.snd.g.gain.setTargetAtTime(C.cl(1-dh/900,0,1)**2*.12*S.vol()*(C.G.state==='wave'||C.Z.so?.S?.on?1:0),C.api.AC.currentTime,.3)}}});
function BOSSES_sting(C){C.BOSSES.gace.sting?.(C.SND)}
