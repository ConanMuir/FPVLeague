// ---------- Dogfight mode: turrets, damage, kills and scoring, fire input, mode switch (setGame), joiner state ----------
// ground targets: 6 turrets per team on its own half; they need line of sight and reach 200 m
import * as THREE from 'three';
import {near,noise,tone} from '../audio/audio.js';
import {$,COL,TEAM,V3} from '../config/constants.js';
import {S} from '../config/settings.js';
import {btnOn,keys,mouseFire,pad,padX} from '../input/input.js';
import {BUL,gunDir,shoot} from './guns.js';
import {endMatch} from './match.js';
import {MODES,modeId,registerMode} from './registry.js';
import {los} from '../physics/sdf.js';
import {ballMesh} from '../render/ball.js';
import {MAT} from '../render/drone-mesh.js';
import {emit} from '../render/particles.js';
import {_gd,_gp,_gq} from '../scratch.js';
import {GS,auth} from '../state.js';
import {feed,tag} from '../ui/hud.js';
import {goalG} from '../world/arena.js';
import {DHL,DLEN,DW,buildDF,cxR,dfG,dfH,sdDF,seeded} from '../world/highlands.js';
import {setMap} from '../world/maps.js';
import {ORBS} from '../world/orbs.js';
export const TUR=[],TUR_HP=60;{const rnd=seeded(11),base=new THREE.CylinderGeometry(2.2,2.8,1.6,16),dome=new THREE.SphereGeometry(1.7,16,10,0,Math.PI*2,0,Math.PI/2),
 barrel=new THREE.CylinderGeometry(.22,.22,3.2,8).rotateX(Math.PI/2).translate(0,0,-1.8),mB=new THREE.MeshStandardMaterial({color:0x2a2f38,roughness:.5,metalness:.6});
 for(let i=0;i<6;i++){let x,z,n=0;do{x=(rnd()-.5)*(DW-420);z=120+rnd()*(DHL-330)}while((sdDF(x,dfH(x,z)+2,z)>-4||Math.abs(x-cxR(z))<45||TUR.some(t=>Math.hypot(t.p.x-x,t.p.z-z)<90))&&++n<80);
  const y=dfH(x,z);for(const t of[0,1]){const s=t?-1:1,g=new THREE.Group(),b=new THREE.Mesh(base,mB),head=new THREE.Group(),d=new THREE.Mesh(dome,MAT.team[t]),br=new THREE.Mesh(barrel,mB);
   g.position.set(s*x,y,s*z);b.position.y=.8;head.position.y=1.6;br.position.y=.9;head.add(d,br);g.add(b,head);g.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true});dfG.add(g);
   TUR.push({isTurret:true,t,team:t,p:new V3(s*x,y+2.2,s*z),hp:TUR_HP,cd:1,re:0,g,head,br,aim:new V3(0,0,-1),tg:null,scan:0})}}}
// boost orbs move out across the map in Dogfight (only shown when Super boost is on)
const DORB=[];{const rnd=seeded(5);for(let i=0;DORB.length<ORBS.length&&i<400;i++){const x=(rnd()-.5)*(DW-360),z=(rnd()-.5)*(DLEN-360),y=dfH(x,z)+14+rnd()*30;if(sdDF(x,y,z)<-6)DORB.push(new V3(x,y,z),new V3(-x,y,-z))}}
ORBS.forEach((o,i)=>{o.p0=o.p.clone();o.dp=DORB[i]||o.p0});
export function turrets(dt){const A=auth(),live=GS.state==='play';for(const t of TUR){if(t.re>0){if(A&&(t.re-=dt)<=0)t.hp=TUR_HP;continue}
 if((t.scan-=dt)<=0){t.scan=.3+Math.random()*.1;let bd=200*200;t.tg=null;for(const d of GS.drones)if(d.dead<=0&&d.team!==t.t){const q=d.p.distanceToSquared(t.p);if(q<bd&&los(_gp.copy(t.p).setY(t.p.y+2),d.p)){bd=q;t.tg=d}}}
 const best=t.tg;if(!best||best.dead>0)continue;const bd=best.p.distanceToSquared(t.p);
 t.aim.copy(best.p).addScaledVector(best.v,Math.sqrt(bd)/160*.8).sub(t.p).normalize();if(live&&(t.cd-=dt)<=0){t.cd=1.4;shoot(_gq.copy(t.p).addScaledVector(t.aim,3).setY(t.p.y+1),t.aim,null,t.t,A,t,5,.09,160)}}}
const keyOf=o=>o.isTurret?'t'+TUR.indexOf(o):o.key,objOf=k=>typeof k!=='string'?null:k[0]==='t'?TUR[+k.slice(1)]:GS.drones.find(x=>x.key===k);
const who=o=>o?.isTurret?`<span class="${o.t?'co':'cb'}">${TEAM[o.t]} turret</span>`:o?tag(o):'Someone';
function hitMark(){const x=$('xh');x.classList.add('hit');clearTimeout(hitMark.t);hitMark.t=setTimeout(()=>x.classList.remove('hit'),130);tone(1500,900,.05,.05,'square')}
function hurt(){const h=$('hurt');h.style.transition='none';h.style.opacity=.5;requestAnimationFrame(()=>{h.style.transition='opacity .5s';h.style.opacity=0});noise(.12,300,.25)}
function boom(o){const p=o.p;emit(p,o.isTurret?0xffc640:COL[o.team],o.isTurret?220:160,30,1.2);emit(p,0xff6a20,90,20,1);GS.shake=Math.max(GS.shake,near(p)*.9);noise(.7,180,.8*near(p))}
// damage: offline and on the host it applies directly; a joining pilot reports their own hits to the host (sequence-numbered, like ball hits)
export function hitDrone(d,dmg,by){if(d.lock>performance.now())return;if(by===GS.player)hitMark();if(GS.net&&!GS.net.host){if(by===GS.player)GS.net.hits.push([++GS.net.hseq,d.key,dmg]);return}
 d.hp-=dmg;if(d===GS.player)hurt();if(d.hp<=0)kill(d,by)}
export function hitTurret(t,dmg,by){if(by===GS.player)hitMark();if(GS.net&&!GS.net.host){if(by===GS.player)GS.net.hits.push([++GS.net.hseq,keyOf(t),dmg]);return}
 if((t.hp-=dmg)<=0){t.re=25;boom(t);scored(by,t)}}
function kill(d,by){d.hp=100;d.life++;d.lock=performance.now()+800;if(!d.remote){boom(d);d.dead=3;d.mesh.visible=false}scored(by,d)}
function scored(by,v){const bt=by?.isTurret?by.t:by?.team;if(GS.state==='play'&&bt!=null&&bt!==(v.isTurret?v.t:v.team))GS.score[bt]++;
 if(!GS.demo)feed(`${who(by)} ${v.isTurret?'destroyed':'shot down'} ${who(v)}`);if(GS.net?.host)GS.net.kf.push([++GS.net.kfId,by?keyOf(by):'',keyOf(v)]),GS.net.kf.splice(0,GS.net.kf.length-6);
 if(GS.overtime&&auth()&&GS.state==='play')endMatch()}
export function applyHit(k,dmg,by){const o=objOf(k);if(!o||!by||o.team===by.team)return;if(o.isTurret){if(o.re<=0)hitTurret(o,dmg,by)}else if(o.dead<=0)hitDrone(o,dmg,by)}
export const aimOk=(d,p,f,deg,r=260)=>{_gq.subVectors(p,d.p);const l=_gq.length();return l<r&&_gq.dot(f)/l>Math.cos(deg*Math.PI/180)};
export function fireIn(d){if(keys.KeyF||mouseFire)return true;const v=btnOn(pad(),padX?S.xfire:S.fireBtn);if(v!=null&&v!==!!S.fireInv)return true;  // invert: fire with the switch/button in the other position
 if(!S.afire)return false;const f=gunDir(d,S.tilt*Math.PI/180,_gd);return GS.drones.some(e=>e.dead<=0&&e.team!==d.team&&aimOk(d,e.p,f,3.5))||TUR.some(t=>t.re<=0&&t.t!==d.team&&aimOk(d,t.p,f,4))}
registerMode('df',{name:'Dogfight',title:'DOGFIGHT',world:'highlands',order:1,
 sub:'Acro quad dogfighting over the Highlands: a 1.4 km valley with a river canyon, mesas, spire fields, hangars to fly through and forests to hide in. Guns on the FPV camera axis, enemy turrets on the ground, bots in the air. Most points wins.'});
// switch game mode (any registered mode): sets the world up for it and updates the menu heading and mode buttons
export function setGame(m){const M=MODES[modeId(m)];GS.GM=M.id;GS.OBSON=M.world==='highlands';if(GS.OBSON)buildDF();setMap(GS.OBSON?'df':S.map);dfG.visible=GS.OBSON;ORBS.forEach(o=>{o.p.copy(GS.OBSON?o.dp:o.p0);o.g.position.copy(o.p)});goalG.visible=!GS.OBSON;ballMesh.visible=!GS.OBSON;BUL.forEach(b=>b.life=0);GS.drones.forEach(d=>d.firing=false);
 $('h1o').textContent=M.title;$('sub').textContent=M.sub;for(const b of $('modes').children)b.classList.toggle('on',b.dataset.m===GS.GM)}
// nearest living enemy drone (enemy cam and the off-screen arrow)
// joining pilot: health, deaths, turrets and the kill feed all come from the host
export function dfState(g){const now=performance.now();if(g.hp&&typeof g.hp==='object')for(const k in g.hp){const d=GS.drones.find(x=>x.key===k),v=+g.hp[k];if(!d||!Number.isFinite(v))continue;if(d===GS.player&&v<d.hp-.5&&d.dead<=0)hurt();d.hp=v}
 if(g.lf&&typeof g.lf==='object')for(const k in g.lf){const d=GS.drones.find(x=>x.key===k),l=g.lf[k]|0;if(!d)continue;if(d.lfSeen==null||l<d.lfSeen)d.lfSeen=l;else if(l>d.lfSeen){d.lfSeen=l;if(d===GS.player&&d.dead<=0){boom(d);d.dead=3;d.mesh.visible=false;d.hp=100}}}
 if(Array.isArray(g.tg))g.tg.forEach((v,i)=>{const t=TUR[i];if(!t)return;if(!v&&t.re<=0)boom(t);t.re=v?0:1;t.hp=+v||0});
 if(Array.isArray(g.kf)){const first=GS.net.kfSeen<0;for(const e of g.kf){if(!Array.isArray(e)||!(e[0]>GS.net.kfSeen))continue;GS.net.kfSeen=e[0];const v=objOf(e[2]);if(!first&&v)feed(`${who(objOf(e[1]))} ${v.isTurret?'destroyed':'shot down'} ${who(v)}`)}}}
export function nearestFoe(me){let best=null,bd=1e9;for(const e of GS.drones)if(e.dead<=0&&e.team!==me.team){const q=e.p.distanceToSquared(me.p);if(q<bd){bd=q;best=e}}return best}
