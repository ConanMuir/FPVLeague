// ---------- Skill training UI: the Training hub (Skill packs / Calibration Lab), the pack browser, the in-shot HUD, the pack summary ----------
import * as THREE from 'three';
import {$,HL} from '../config/constants.js';
import {S} from '../config/settings.js';
import {RADIO,pad,padX} from '../input/input.js';
import {startDemo} from '../modes/match.js';
import {TR,exitTrain,nextShot,prevShot,restartPack,retryShot,startPack} from '../modes/training.js';
import {addHud} from '../modes/registry.js';
import {dot} from '../render/particles.js';
import {scene} from '../render/renderer.js';
import {GS,esc} from '../state.js';
import {toWorld} from '../training/judge.js';
import {CATS,PACKS,TIERS,packsOf} from '../training/packs.js';
import {menuScreen} from './menu.js';
let cat='striker',seen=-1,lastPh='',prevB=[];
const fmtT=t=>t==null?'—':t.toFixed(2)+' s',clock=t=>{t=Math.max(0,t);const s=Math.floor(t);return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}.${Math.floor((t-s)*10)}`};
const bestOf=P=>S.train?.[P.id]||null;
// ---- 3D markers: the target ring (Pops targets) and the untouched ball's path while a shot waits
const ringM=new THREE.MeshBasicMaterial({color:0xffc640,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),
 discM=new THREE.MeshBasicMaterial({color:0xffc640,transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),
 beamM=new THREE.MeshBasicMaterial({color:0xffc640,transparent:true,opacity:.07,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
const zoneG=new THREE.Group();zoneG.visible=false;scene.add(zoneG);
const ring=new THREE.Mesh(new THREE.RingGeometry(.88,1,96).rotateX(-Math.PI/2),ringM),ring2=new THREE.Mesh(new THREE.RingGeometry(.48,.53,64).rotateX(-Math.PI/2),ringM),disc=new THREE.Mesh(new THREE.CircleGeometry(1,64).rotateX(-Math.PI/2),discM),
 beam=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,48,1,true),beamM);beam.position.y=.5;ring.position.y=ring2.position.y=.06;disc.position.y=.05;zoneG.add(disc,ring,ring2,beam);
const pathGeo=new THREE.BufferGeometry(),pathPts=new THREE.Points(pathGeo,new THREE.PointsMaterial({map:dot,size:1.6,color:0x9fe8ff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
pathPts.visible=false;pathPts.frustumCulled=false;scene.add(pathPts);
function markers(){const sh=TR.on&&TR.shot,z=sh&&sh.zone;zoneG.visible=!!z&&TR.ph!=='sum';if(z){const p=toWorld(z.x,0,z.d,HL,TR.flip);zoneG.position.set(p[0],0,p[2]);zoneG.scale.set(z.r,Math.max(14,z.r*2),z.r)}
 pathPts.visible=TR.on&&TR.ph==='ready'&&TR.path.length>1;if(pathPts.visible)pathGeo.setAttribute('position',new THREE.Float32BufferAttribute(TR.path.flat(),3))}
// ---- hub and pack browser
function hubSum(){let done=0,shots=0,of=0;for(const P of PACKS){const b=bestOf(P);of+=P.shots.length;if(b){shots+=b.n;if(b.n===b.of)done++}}
 $('packsum').textContent=`${PACKS.length} packs · ${shots}/${of} shots done · ${done} pack${done===1?'':'s'} complete`;$('packstot').textContent=`${shots}/${of} shots`}
function renderPacks(){hubSum();
 $('ptabs').innerHTML=CATS.map(c=>{const ps=packsOf(c.id),n=ps.reduce((a,P)=>a+(bestOf(P)?.n||0),0),of=ps.reduce((a,P)=>a+P.shots.length,0);
  return`<button class="${c.id===cat?'on':''}" role="tab" aria-selected="${c.id===cat}" data-c="${c.id}"><span>${c.name}</span><small>${n}/${of}</small></button>`}).join('');
 for(const b of $('ptabs').children)b.onclick=()=>{cat=b.dataset.c;renderPacks();$('ptiles').querySelector('button')?.focus({preventScroll:true})};
 $('pblurb').textContent=CATS.find(c=>c.id===cat)?.blurb||'';
 $('ptiles').innerHTML=packsOf(cat).map(P=>{const b=bestOf(P),n=P.shots.length,f=b?b.n/b.of:0,sec=P.shots.map(s=>s.t||P.t);
  return`<button class="ptile t${P.tier}" data-id="${P.id}"><i class="tier">${TIERS[P.tier].name}</i><b>${esc(P.name)}</b><small>${esc(P.blurb)}</small>
   <span class="pmeta">${n} shots · ${Math.min(...sec)===Math.max(...sec)?sec[0]+' s each':Math.min(...sec)+'-'+Math.max(...sec)+' s'}</span>
   <span class="pbar"><u style="width:${Math.round(f*100)}%"></u></span><span class="pbest">${b?`Best <b>${b.n}/${b.of}</b>${b.n?` · ${b.t.toFixed(1)} s`:''}`:'Not played yet'}</span><span class="pplay">Play</span></button>`}).join('');
 for(const b of $('ptiles').children)b.onclick=()=>startPack(b.dataset.id)}
export function initTraining(){
 $('packsbtn').onclick=()=>{renderPacks();menuScreen('packs')};$('packsback').onclick=()=>menuScreen('training');$('trainbtn').addEventListener('click',hubSum);
 const lab=$('labbtn').onclick;$('labbtn').onclick=()=>{exitTrain();lab()};  // the Calibration Lab tile (ui/lab.js wires it)
 // the menu's own buttons (ui/menu.js) leave training first; in the pause menu Restart restarts the pack and Leave goes back to the packs
 for(const id of['host','join']){const f=$(id).onclick;$(id).onclick=()=>{exitTrain();f()}}
 for(const b of $('modes').children)if(b.dataset.m){const f=b.onclick;b.onclick=()=>{exitTrain();f()}}  // a mode button in the pause menu leaves the pack (it used to start the match with training still holding the quad)
 const play=$('play').onclick;$('play').onclick=()=>{if(TR.on)restartPack();else play()};
 const leave=$('leave').onclick;$('leave').onclick=()=>{const t=exitTrain();leave();if(t){renderPacks();menuScreen('packs')}};
 $('trprev').onclick=e=>{prevShot();e.currentTarget.blur()};$('trnext').onclick=e=>{nextShot();e.currentTarget.blur()};$('trretry').onclick=e=>{retryShot();e.currentTarget.blur()};
 $('trsretry').onclick=()=>restartPack();$('trsnext').onclick=()=>{const P=nextPack(TR.pack);if(P)startPack(P.id)};
 $('trsback').onclick=()=>{exitTrain();startDemo();renderPacks();menuScreen('packs')};$('trsmenu').onclick=()=>{exitTrain();startDemo()};
 addEventListener('keydown',e=>{if(!TR.on||GS.menuOpen||e.repeat||e.target.matches?.('textarea,input,select'))return;
  if(TR.ph==='sum'){if(e.code==='Enter'||e.code==='KeyR')restartPack();return}
  if(e.code==='KeyN'||e.code==='BracketRight'||e.code==='PageDown')nextShot();else if(e.code==='KeyB'||e.code==='BracketLeft'||e.code==='PageUp')prevShot();else if(e.code==='Backspace')retryShot()})}
// the next pack: the next tier of this category, then the first pack of the next category
function nextPack(P){if(!P)return null;const i=CATS.findIndex(c=>c.id===P.cat),same=packsOf(P.cat).find(q=>q.tier>P.tier);return same||(CATS[i+1]?packsOf(CATS[i+1].id)[0]:null)}
// ---- in-shot HUD and summary
function hudRender(){const P=TR.pack,n=P.shots.length,sh=TR.shot;$('trname').textContent=P.name;$('trtier').textContent=TIERS[P.tier].name;$('trtier').className='t'+P.tier;$('trnum').textContent=`${TR.i+1} / ${n}`;
 $('trsn').textContent=sh.n;$('trpips').innerHTML=TR.res.map((r,i)=>`<i class="${r.ok===true?'ok':r.ok===false?'miss':''}${i===TR.i?' cur':''}"></i>`).join('');
 $('trtip').textContent=(sh.tip?sh.tip+' · ':'')+goalText();
 const v=TR.verdict;$('trres').innerHTML=v?`<b class="${v.ok?'ok':'miss'}">${v.ok?'Success':'Missed'}</b><span>${esc(v.why)}${v.ok?' · '+fmtT(v.t):''}</span>`:''}
function goalText(){const k=TR.kind,r=TR.req||{};if(k==='save')return'Keep it out of your goal';if(k==='zone')return'Pop it onto the target ring';
 return r.air!=null?`Score with a touch at least ${r.air} m up`:r.carry!=null?`Carry it on top for ${r.carry} s, then score`:r.pop?'Score with a pop (hold a direction + flip)':'Score a goal'}
function sumRender(){const P=TR.pack,s=TR.score,c=CATS.find(x=>x.id===P.cat);$('trscat').textContent=c.name+' training';$('trstitle').textContent=P.name;$('trstier').textContent=TIERS[P.tier].name;$('trstier').className='t'+P.tier;
 $('trsn2').textContent=s.n;$('trsof').textContent=s.of;const b=TR.best;
 $('trsbest').textContent=TR.newBest?'New best!':b?`Best ${b.n}/${b.of}${b.n?' · '+b.t.toFixed(1)+' s':''}`:'';$('trsbest').className=TR.newBest?'nb':'';
 $('trsstats').innerHTML=`<div><span>Shots done</span><b>${s.n} / ${s.of}</b></div><div><span>Total time</span><b>${s.n?s.t.toFixed(1)+' s':'—'}</b></div><div><span>Attempts</span><b>${s.tries}</b></div>`;
 $('trslist').innerHTML=P.shots.map((sh,i)=>{const r=TR.res[i];return`<li class="${r.ok===true?'ok':r.ok===false?'miss':'skip'}"><span>${i+1}</span><b>${esc(sh.n)}</b><em>${r.ok===true?fmtT(r.t):r.ok===false?'missed':'skipped'}</em><small>${r.tries} ${r.tries===1?'try':'tries'}</small></li>`}).join('');
 $('trsnext').hidden=!nextPack(P);$('trsretry').focus({preventScroll:true})}
// gamepad: D-pad left/right = previous/next shot (Y = retry goes through the reset button, input.js); summary: A retry, B skill packs
function padTrain(){const g=pad();if(!g||RADIO.test(g.id)){prevB=[];return}const used=new Set();
 if(padX){for(const c of S.xcal){if(c.a>=100)used.add(c.a-100);if(c.b!=null)used.add(c.b)}for(const b of[S.xfire,S.xflip,S.xboost])if(typeof b==='number')used.add(b)}
 const b=g.buttons.map(x=>x.pressed),pb=prevB,edge=i=>b[i]&&!pb[i];prevB=b;if(GS.menuOpen)return;
 if(TR.ph==='sum'){if(edge(0))restartPack();else if(edge(1))$('trsback').click()}
 else{if(edge(15)&&!used.has(15))nextShot();if(edge(14)&&!used.has(14))prevShot()}}
// per rendered frame
addHud('train',()=>trainFrame());  // the Training mode's per-frame UI (modes/registry.js modeHud, every frame, training or not)
export function trainFrame(){const on=TR.on;$('score').hidden=on;markers();
 if(!on){if(lastPh){lastPh='';$('train').hidden=$('trsum').hidden=true}return}
 padTrain();const m=GS.menuOpen,ph=TR.ph;
 if(m){$('play').textContent='Restart pack';$('leave').textContent='Leave training';$('leave').hidden=false}
 $('train').hidden=m||ph==='sum';$('trsum').hidden=m||ph!=='sum';
 if(TR.ver!==seen||ph!==lastPh){const was=lastPh;seen=TR.ver;lastPh=ph;hudRender();if(ph==='sum'&&was!=='sum')sumRender()}
 $('trready').hidden=ph!=='ready';$('trres').hidden=ph!=='result';
 const tl=TR.limit-TR.t,t=$('trtime');t.textContent=ph==='ready'?clock(TR.limit):ph==='result'&&TR.verdict?clock(TR.verdict.t):tl>=0?clock(tl):'+'+(-tl).toFixed(1);
 t.classList.toggle('low',ph==='live'&&tl<3);t.classList.toggle('over',ph==='live'&&tl<0)}
