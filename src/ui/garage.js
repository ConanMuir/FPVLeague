// ---------- Garage: pick arms / chassis / power, turntable preview, stat bars, hitbox overlay ----------
// The loadout lives in S.loadout ([arms, chassis, power] part ids). Changing it re-fits your own drone at once.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {$} from '../config/constants.js';
import {MDEF} from '../config/mods.js';
import {S,save} from '../config/settings.js';
import {PARTS,SLOTS,SLOT_NAMES,STATS,STOCK,allLoadouts,computeLoadout,partOf,statsOf} from '../parts/index.js';
import {buildPartsMesh,colliderWire} from '../parts/mesh.js';
import {MAT} from '../render/drone-mesh.js';
import {GS,esc} from '../state.js';

let V=null,RANGE=null;  // V: preview renderer state (built on first open); RANGE: [min,max] of every stat over all 125 loadouts
function ranges(){if(RANGE)return RANGE;const all=allLoadouts().map(ids=>statsOf(computeLoadout(ids),MDEF));RANGE={stock:statsOf(computeLoadout(STOCK),MDEF)};
 for(const[k]of STATS){const v=all.map(s=>s[k]);RANGE[k]=[Math.min(...v),Math.max(...v)]}return RANGE}
const team=()=>S.tp==='1'?1:0;

// ---------- turntable preview: its own small WebGL canvas, studio lighting, drag to turn ----------
function initView(){const cv=$('gcv'),r=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,preserveDrawingBuffer:true});r.setPixelRatio(Math.min(devicePixelRatio,2));
 r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.05;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;
 const sc=new THREE.Scene(),pm=new THREE.PMREMGenerator(r);sc.environment=pm.fromScene(new RoomEnvironment(),.04).texture;pm.dispose();
 sc.add(new THREE.HemisphereLight(0xa8c0ff,0x141826,.5));const key=new THREE.DirectionalLight(0xfff2e6,2.2);key.position.set(1.6,3.2,1.4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
 Object.assign(key.shadow.camera,{left:-1.2,right:1.2,top:1.2,bottom:-1.2,near:.5,far:8});key.shadow.bias=-.0005;key.shadow.radius=4;sc.add(key);
 const rim=new THREE.DirectionalLight(0x7fb0ff,1.6);rim.position.set(-2,1.4,-2.6);sc.add(rim);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(1.5,64).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x111a2e,roughness:.85,metalness:.1}));floor.position.y=-.24;floor.receiveShadow=true;sc.add(floor);
 const ring=new THREE.Mesh(new THREE.RingGeometry(1.08,1.1,96).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x3d95ff,transparent:true,opacity:.5,toneMapped:false}));ring.position.y=-.235;sc.add(ring);
 const cam=new THREE.PerspectiveCamera(30,1,.05,40),pivot=new THREE.Group();sc.add(pivot);
 V={r,sc,cam,pivot,ang:3.75,el:.42,dist:3.3,spin:true,hold:0,props:[],last:0,raf:0,drone:null,wire:null};
 let drag=null;cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};V.spin=false;cv.setPointerCapture(e.pointerId);cv.style.cursor='grabbing'});
 cv.addEventListener('pointermove',e=>{if(!drag)return;V.ang-=(e.clientX-drag.x)*.01;V.el=Math.min(1.3,Math.max(-.1,V.el+(e.clientY-drag.y)*.006));drag={x:e.clientX,y:e.clientY}});
 const up=()=>{if(drag){drag=null;V.hold=performance.now()+2500;cv.style.cursor=''}};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
 cv.addEventListener('wheel',e=>{e.preventDefault();V.dist=Math.min(6,Math.max(1.8,V.dist*(1+Math.sign(e.deltaY)*.08)))},{passive:false})}
function frame(now){if($('garage').hidden){V.raf=0;return}V.raf=requestAnimationFrame(frame);const dt=Math.min(.05,(now-(V.last||now))/1000);V.last=now;
 const cv=V.r.domElement,w=cv.clientWidth|0,h=cv.clientHeight|0;if(w&&h&&(cv.width!==Math.round(w*V.r.getPixelRatio())||cv.height!==Math.round(h*V.r.getPixelRatio()))){V.r.setSize(w,h,false);V.cam.aspect=w/h;V.cam.updateProjectionMatrix()}
 if(!V.spin&&V.hold&&now>V.hold){V.spin=true;V.hold=0}if(V.spin)V.ang+=dt*.35;V.props.forEach((p,i)=>p.rotation.y+=(i%3?1:-1)*dt*9);
 V.cam.position.set(Math.sin(V.ang)*Math.cos(V.el),Math.sin(V.el),Math.cos(V.ang)*Math.cos(V.el)).multiplyScalar(V.dist);V.cam.lookAt(0,-.02,0);V.r.render(V.sc,V.cam)}
function showDrone(lo){if(V.drone)V.pivot.remove(V.drone);if(V.wire)V.pivot.remove(V.wire);const{group,props}=buildPartsMesh(lo.meshSpec,team(),MAT);
 V.drone=group;V.props=props;V.pivot.add(group);V.wire=colliderWire(lo.colliders);V.wire.visible=$('ghit').checked;V.pivot.add(V.wire)}

// ---------- UI ----------
const fmt={speed:s=>`${Math.round(s.speed)} km/h`,punch:s=>`${s.punch.toFixed(1)}:1 T/W`,pitch:s=>`${s.raw.rmax[0]}°/s ${s.raw.lag[0]}ms`,yaw:s=>`${s.raw.rmax[1]}°/s ${s.raw.lag[1]}ms`,roll:s=>`${s.raw.rmax[2]}°/s ${s.raw.lag[2]}ms`,
 resp:s=>`${s.raw.spool} ms spool`,boost:(s,lo)=>`${(100/(MDEF.drain*lo.flight.drain)).toFixed(1)} s tank`,hit:(s,lo)=>`${lo.auw} g AUW`,ball:s=>`grip ×${s.ball.toFixed(2)}`,size:s=>`×${s.size.toFixed(2)} Stock`};
function update(){const ids=S.loadout,lo=computeLoadout(ids),st=statsOf(lo,MDEF),R=ranges();
 document.querySelectorAll('#gslots button').forEach(b=>b.classList.toggle('on',ids[+b.dataset.s]===b.dataset.id));
 $('gname').textContent=lo.name;$('gauw').textContent=`AUW ${lo.auw} g · ${partOf(2,ids[2]).batt.cells}`;
 const bar=(k,v)=>{const[a,b]=R[k];return Math.max(0,Math.min(1,(v-a)/((b-a)||1)))*100};
 $('gstats').innerHTML=STATS.map(([k,n])=>`<div title="${esc(n)}"><span>${esc(n)}</span><b><i style="width:${bar(k,st[k]).toFixed(1)}%"></i><u style="left:${bar(k,R.stock[k]).toFixed(1)}%"></u></b><span>${esc(fmt[k](st,lo))}</span></div>`).join('');
 $('gdesc').innerHTML=SLOTS.map((_,s)=>{const p=partOf(s,ids[s]);return `<div><h4>${esc(SLOT_NAMES[s])}: ${esc(p.name)}</h4><p>${esc(p.sub)}</p><ul>${p.pros.map(t=>`<li class="p">${esc(t)}</li>`).join('')}${p.cons.map(t=>`<li class="c">${esc(t)}</li>`).join('')}</ul></div>`}).join('');
 if(V)showDrone(lo);
 if(GS.player&&!GS.player.remote)GS.player.setLoadout(ids)}  // your own drone refits now (online, the new ids go out with your next state)
function pick(s,id){if(!partOf(s,id))return;S.loadout=[...S.loadout];S.loadout[s]=id;save();update()}
export function openGarage(){if(!V)initView();$('garage').hidden=false;update();if(!V.raf)V.raf=requestAnimationFrame(frame)}
export function closeGarage(){$('garage').hidden=true}
export function initGarage(){
 $('gslots').innerHTML=SLOTS.map((slot,s)=>`<h3>${esc(SLOT_NAMES[s])}</h3><div class="gpick">${PARTS[slot].map(p=>`<button class="sm" data-s="${s}" data-id="${esc(p.id)}" title="${esc(p.sub)}">${esc(p.name)}</button>`).join('')}</div>`).join('');
 $('gslots').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(b)pick(+b.dataset.s,b.dataset.id)});
 $('garbtn').onclick=openGarage;$('gx').onclick=$('gok').onclick=closeGarage;
 $('gstock').onclick=()=>{S.loadout=[...STOCK];save();update()};
 $('grand').onclick=()=>{S.loadout=SLOTS.map(sl=>{const l=PARTS[sl];return l[Math.floor(Math.random()*l.length)].id});save();update()};
 $('ghit').onchange=()=>{if(V?.wire)V.wire.visible=$('ghit').checked};
 addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('garage').hidden){closeGarage();e.stopImmediatePropagation()}},true)}
// tooling hook (tools/parts-shots.mjs): fixed camera angle, no auto-spin
export const garageView=(ang,el,dist)=>{if(!V)return;V.spin=false;V.hold=0;V.ang=ang;V.el=el;if(dist)V.dist=dist};
