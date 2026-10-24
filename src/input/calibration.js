// ---------- Choose your controls: one function at a time, move or press anything (axis, button, trigger, bumper, d-pad) ----------
// Detection is in input/binding.js (baseline, ignores channels moving at rest, every trigger case). Radios save to S.cal
// (and full-range throttle), Xbox/standard pads to S.xcal, so each keeps its own setup. Old bindings stay valid: the format
// only gains optional fields (r: trigger rest, nb: the other direction's control, 'aN-' axis buttons, boost).
import {tone} from '../audio/audio.js';
import {$} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {BTN,CAL,PAIR,padX,pad} from './input.js';
import {btnEntry,calEntry,chans,detect,detector,negEntry,oneWay} from './binding.js';
import {SB,esc} from '../state.js';
import {syncUI} from '../ui/menu.js';
export let calib=null;
const FN=['Throttle','Yaw','Pitch','Roll'];
const STEPS=()=>[{k:0,q:'THROTTLE: push it fully UP and hold'},{k:1,q:'YAW: fully RIGHT and hold'},{k:2,q:'PITCH: fully FORWARD (nose down) and hold'},{k:3,q:'ROLL: fully RIGHT and hold'},
 {k:'fire',q:'FIRE (Dogfight): press the control you want',opt:1},{k:'flip',q:'FLIP OVER: press the control you want',opt:1},...(SB()?[{k:'boost',q:'BOOST: press the control you want',opt:1}]:[])];
const name=(id,x)=>id>=100?(x&&BTN[id-100]?BTN[id-100]:'Button '+(id-100)):'Axis '+id;
const bname=(b,x)=>b==null||b===-1?'none':typeof b==='string'?`Axis ${parseInt(b.slice(1))} ${b.endsWith('-')?'(−)':'(+)'}`:name(100+b,x);
export function initCalib(){$('calbtn').onclick=()=>calib?closeBind(false):openBind();$('bx').onclick=()=>closeBind(false);
 addEventListener('keydown',e=>{if(e.code==='Escape'&&calib){closeBind(false);e.stopImmediatePropagation()}},true);  /* Esc cancels (and does not also resume the paused match behind the dialog) */
 $('bskip').onclick=()=>skip();$('bredo').onclick=()=>{if(calib){calib.sub=null;calib.D=newDet()}};$('bsave').onclick=()=>commit()}
const newDet=()=>detector({used:[...calib.used],base:calib.i||calib.sub!=null?600:900});
export function openBind(){const g=pad(),x=padX;calib={i:0,steps:STEPS(),x,cal:CAL().map(c=>({...c})),fire:x?S.xfire:S.fireBtn,flip:x?S.xflip:S.flipBtn,boost:x?S.xboost:S.boostBtn,used:new Set(),sub:null,done:false,lay:''};
 calib.D=newDet();$('bind').hidden=false;$('bsave').hidden=true;$('calbtn').textContent='Cancel';$('calmsg').textContent='';requestAnimationFrame(tick)}
function closeBind(ok){if(!calib)return;calib=null;$('bind').hidden=true;$('calbtn').textContent='Choose your controls';if(!ok)$('calmsg').textContent=''}
function next(){calib.sub=null;calib.i++;if(calib.i>=calib.steps.length){calib.done=true;$('bsave').hidden=false}else calib.D=newDet();tone(880,880,.08,.08)}
function skip(){if(!calib||calib.done)return;const st=calib.steps[calib.i];
 if(calib.sub!=null){const c=calib.cal[st.k];delete c.b;delete c.nb;if(c.a>=100&&PAIR[c.a-100]!=null)c.b=PAIR[c.a-100];next();return}  // one direction only (or the bumper/trigger partner)
 next()}  // keep the current binding
function got(res){const st=calib.steps[calib.i],k=st.k;calib.used.add(res.id);
 if(typeof k==='number'){if(calib.sub!=null){const c=calib.cal[k];delete c.b;delete c.nb;Object.assign(c,negEntry(res));next();return}
  calib.cal[k]=calEntry(res,k,calib.x);if(k&&oneWay(res)){calib.sub=k;calib.D=newDet();tone(660,660,.06,.06);return}next();return}
 calib[k]=btnEntry(res);next()}
function commit(){const c=calib;if(c.x){S.xcal=c.cal;S.xfire=c.fire;S.xflip=c.flip;if(c.boost!=null)S.xboost=c.boost}else{S.cal=c.cal;S.thrMode='full';S.fireBtn=c.fire;S.flipBtn=c.flip;if(c.boost!=null)S.boostBtn=c.boost}
 save();syncUI();closeBind(true);$('calmsg').textContent='Controls saved. Check the THR/YAW/PIT/ROL bars.'}
// live readout of every axis and button, plus the step prompt
function tick(now){if(!calib)return;requestAnimationFrame(tick);const g=pad(),c=calib,st=c.steps[c.i];
 $('bstep').textContent=c.done?'All set':`Step ${c.i+1} of ${c.steps.length}${st?.opt?' (optional)':''}`;
 $('bdev').textContent=g?`${g.id.slice(0,46)} · ${c.x?'Xbox profile':'radio / other profile'}`:'';
 $('bq').textContent=c.done?'Save to use these controls':c.sub!=null?`${FN[c.sub].toUpperCase()}: now the control for the OTHER direction (or Skip)`:st.q;
 $('bskip').textContent=c.sub!=null?'One direction only':typeof st?.k==='number'?'Keep current':'Skip';$('bskip').disabled=c.done;
 $('bres').innerHTML=FN.map((n,i)=>{const e=c.cal[i];return`<span><b>${n}</b> ${name(e.a,c.x)}${e.b!=null?' / '+name(100+e.b,c.x):e.nb?' / '+name(e.nb.a,c.x):''}${e.m==='spring'?' (centre = hover)':i===0?' (full range)':''}</span>`}).join('')+
  ['fire','flip',...(SB()?['boost']:[])].map(k=>`<span><b>${k[0].toUpperCase()+k.slice(1)}</b> ${bname(c[k],c.x)}</span>`).join('');
 if(!g){$('bmsg').textContent='Connect the radio or controller and move a stick or press a button.';$('blive').textContent='';return}
 const ph=c.done?'done':detect(c.D,g,now),D=c.D;if(!c.done&&ph==='done'){got(D.res);return}
 $('bmsg').textContent=c.done?'':ph==='base'?D.msg:ph==='wait'?(D.cand!=null?`${name(D.cand,c.x)}… hold it`:'Move or press it now'):D.msg;
 const ch=chans(g),ids=Object.keys(ch).map(Number),lay=ids.join();if(lay!==c.lay){c.lay=lay;$('blive').innerHTML=ids.map(id=>`<div id="bl${id}"><span>${esc(name(id,c.x))}</span><b><i></i></b><em></em></div>`).join('')}
 for(const id of ids){const e=$('bl'+id);if(!e)continue;const v=ch[id],i=e.children[1].firstChild;
  if(id<100){i.style.left=(v<0?50+v*50:50)+'%';i.style.width=Math.abs(v)*50+'%'}else{i.style.left='0';i.style.width=v*100+'%'}
  e.children[2].textContent=v.toFixed(2);e.className=(D.cand===id&&ph!=='base'?'cand ':'')+(D.noisy.has(id)?'noisy ':'')+(c.used.has(id)?'used':'');e.title=D.noisy.has(id)?'Moving at rest: ignored for this step':''}}
export function calTick(){}  // kept for menu.js; the wizard runs its own frame loop
