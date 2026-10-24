// Input: keyboard, mouse fire, gamepad / RC radio through the Gamepad API, Xbox profile, guided calibration and the controller panel
import {$,cl} from './util.js';
import {S,save} from './settings.js';
import {feed,banner} from './hud.js';
import {tone} from './audio.js';
import {syncUI} from './menu.js';
import {toggleMod} from './modpanel.js';
import {keyLabel,okCode} from './keys.js';
// controller detection (RADIO; pad() = the most recently used gamepad; padX: Xbox-style gamepad, with its own calibration profile so a
// radio's stays untouched; BTN, PAIR) is the shared stick code, src/input/sticks.js, the same code Jared's League uses
import {BTN,PAIR,RADIO,pad,padBlocked,padX} from '../src/input/sticks.js';
export {BTN,PAIR,RADIO,pad,padBlocked,padX};
export const keys={},inp={mouseFire:false};
export let calib=null;
export const CAL=()=>padX?S.xcal:S.cal,thrFull=()=>padX?CAL()[0].m!=='spring':S.thrMode==='full';
// sources 0-99 are axes, 100+ are buttons/triggers (analog 0..1); b = paired button pulling the other way (RB/LB, RT/LT)
const src=(g,a,f=0)=>{const v=a>=100?g.buttons[a-100]?.value:g.axes[a];return typeof v==='number'&&Number.isFinite(v)?v:f};  // a missing, text or NaN reading is no reading (one NaN stick value poisoned the interceptor's state for good)
// calibrated channel: (raw - centre) / signed half-range, so direction is baked in
export const axv=(g,i)=>{const c=CAL()[i],v=(src(g,c.a,c.c)-c.c)/(c.s||1)-(c.b!=null?src(g,100+c.b):0);return cl(Math.abs(v)<S.dz?0:v,-1,1)};
// switch mapping: -1 none, a button index, 'aN' = axis N above +0.5, '-aN' = axis N below -0.5, or a learned 'aN>m' / 'aN<m' = axis N past the midpoint m between the
// off and on positions it was learned at (3-position middles and radios that only send part of the range, e.g. -1 → 0, need this).
// Drone League's low form 'aN-' (group 5), the form the shared profile stores (settings.js), reads the same as '-aN'.
const SWRE=/^(-?)a(\d+)(?:([<>])(-?[\d.]+)|(-))?$/;
export const swOn=(g,b)=>{if(b===-1||b==null)return null;if(typeof b!=='string')return !!g.buttons[b]?.pressed;const m=SWRE.exec(b);if(!m)return null;const v=g.axes[+m[2]]??0;
 return m[3]?(m[3]==='>'?v>+m[4]:v<+m[4]):m[1]||m[5]?v<-.5:v>.5};
export const swRead=b=>{const g=pad();return g?swOn(g,b):null};
export const swName=b=>{if(b===-1||b==null)return'None';if(typeof b!=='string')return'Button '+b;const m=SWRE.exec(b)||[];return`Axis ${m[2]} ${m[3]?(m[3]==='>'?'above ':'below ')+m[4]:m[1]||m[5]?'low':'high'}`};
const swAx=b=>typeof b==='string'?+(SWRE.exec(b)||[0,0,-1])[2]:-1;
// fire / detonate: the bound key or mouse button (S.keys.fire, F by default), left mouse, or the fire button or switch (S.fireInv: fire with the switch in the other position)
export function fireBtnIn(){if(keys[S.keys?.fire]||inp.mouseFire)return true;const g=pad(),b=padX?S.xfire:S.fireBtn;return !!(g&&(typeof b==='string'&&g.axes[swAx(b)]===undefined?false:!!swOn(g,b)!==!!S.fireInv))}
// keyboard + mouse: o.menu() = menu open, o.pause() toggles it, o.key(e) gets every other key press while flying, and a mouse button bound to a switch row (S.keys, see mountSwitches)
// as a stand-in event {code: 'Mouse2', ...}; a right or middle button bound to anything does not open the context menu or scroll while flying
export function initInput(o){menuOpen=o.menu;
 const ui=e=>e.target.closest?.('#mod,#menu,button,input,select,textarea'),flying=e=>!o.menu()&&!ui(e),any=c=>Object.values(S.keys||{}).includes(c),rowOf=c=>Object.keys(S.keys||{}).find(r=>r!=='fire'&&S.keys[r]===c);
 addEventListener('keydown',e=>{if(e.target.matches?.('textarea,input:not([type=range]):not([type=checkbox])'))return;if(capOn()){e.preventDefault();if(!e.repeat)capKey(e.code);return}if(learn?.seq&&!e.repeat){e.preventDefault();if(e.code==='Escape'){learn=null;syncSw()}else asnStep(learn.k);return}if(e.code==='KeyT'&&!e.repeat){toggleMod();return}keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&!o.menu())e.preventDefault();if(e.repeat)return;
  if(e.code==='Escape'||e.code==='KeyP')o.pause();if(o.menu())return;
  if(e.code==='KeyM'){S.mode=S.mode==='acro'?'angle':'acro';save();syncUI();banner(S.mode.toUpperCase(),'',.8)}o.key(e)});
 addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>{for(const k in keys)keys[k]=false;inp.mouseFire=false});
 addEventListener('mousedown',e=>{if(!capOn()||e.button===0&&e.target===cell(cap.k))return;e.preventDefault();e.stopPropagation();eat();capKey('Mouse'+e.button)},true);  /* capturing a binding: the next button is it (a click on the cell itself cancels, through its own handler) */
 addEventListener('mousedown',e=>{if(!flying(e))return;const c='Mouse'+e.button;keys[c]=true;if(e.button===0)inp.mouseFire=true;if(!any(c))return;if(e.button)e.preventDefault();if(rowOf(c))o.key({code:c,type:'mousedown',repeat:false,preventDefault(){}})});
 addEventListener('mouseup',e=>{keys['Mouse'+e.button]=false;if(e.button===0)inp.mouseFire=false});
 addEventListener('contextmenu',e=>{if(any('Mouse2')&&flying(e))e.preventDefault()});addEventListener('auxclick',e=>{if(any('Mouse'+e.button)&&flying(e))e.preventDefault()});
 addEventListener('gamepadconnected',e=>{if(RADIO.test(e.gamepad.id)&&S.thrMode!=='full'){S.thrMode='full';save();syncUI();feed('Radio detected: throttle set to full range. Open the menu and press Calibrate radio.')}})}
// gamepad shortcut buttons (never on a radio, never a button the Xbox profile flies with): fn(edge) with edge(i) = button i just pressed
let prevBtn=[];
export function padEdges(fn){const g=pad();if(!g||RADIO.test(g.id))return;if(learn){prevBtn=g.buttons.map(x=>x.pressed);return}  // learning a switch: no shortcuts
 const u=new Set();if(padX)for(const c of S.xcal){if(c.a>=100)u.add(c.a-100);if(c.b!=null)u.add(c.b)}const b=g.buttons.map(x=>x.pressed),e=i=>b[i]&&!prevBtn[i]&&!u.has(i);fn(e);prevBtn=b}

// ---------- controller panel ----------
export function mountPad(el,{fireLabel='Fire',fireNote=null,flip=true,fire=true}={}){el.innerHTML=`<h2 style="margin-top:20px">Controller <span id="gpname" style="text-transform:none;letter-spacing:0"></span></h2>
 <div class="axes" id="axes"></div><div class="btns" id="btns"></div><div class="chans" id="chans"></div>
 <div class="mp"><button class="sm" id="calbtn">Calibrate controller</button><span id="calmsg" class="note" style="margin:0;align-self:center"></span></div>
 <div class="map" id="map"></div>
 <p class="note">RC radio or sim dongle: plug it in by USB and choose “USB Joystick (HID)” on the radio (EdgeTX / OpenTX / Ethos). Move a stick so the browser sees it, then press Calibrate controller and follow the prompts. Xbox controller: works straight away (left stick throttle, centre = hover); calibrate it to put throttle on a trigger or bumper, or yaw on the bumpers (LB/RB) or triggers. It keeps its own setup, separate from your radio. Gamepad shortcut buttons are ignored for radios so switches don't trigger them.</p>`;
 const map=$('map');['Throttle','Yaw','Pitch','Roll'].forEach((n,i)=>{const l=document.createElement('label');l.textContent=n;l.htmlFor='ax'+i;const s=document.createElement('select');s.id='ax'+i;for(let a=0;a<8;a++)s.add(new Option('Axis '+a,a));BTN.forEach((n,j)=>s.add(new Option(n+(j>3&&j<8?'':' button'),100+j)));
  const c=document.createElement('label');c.innerHTML=`<input type="checkbox" id="inv${i}"> invert`;map.append(l,s,c);
  s.onchange=()=>{const a=+s.value,C=CAL(),sg=C[i].s<0?-1:1;C[i]=a<100?{a,c:0,s:sg}:i?{a,c:0,s:sg,...(PAIR[a-100]!=null?{b:PAIR[a-100]}:{})}:{a,c:.5,s:.5*sg};save()};c.firstChild.onchange=()=>{CAL()[i].s=-CAL()[i].s;save()}});
 const btnOpts=(s,none)=>{if(none)s.add(new Option('None','-1'));for(let b=0;b<18;b++)s.add(new Option('Button '+b+(BTN[b]?' ('+BTN[b]+' on Xbox)':''),b));for(let a=2;a<8;a++)s.add(new Option('Switch / trigger axis '+a,'a'+a))};
 if(flip){const l=document.createElement('label');l.textContent='Flip over';l.htmlFor='flipb';const s=document.createElement('select');s.id='flipb';btnOpts(s,true);
  s.onchange=()=>{const v=s.value[0]==='a'?s.value:+s.value;if(padX)S.xflip=v;else S.flipBtn=v;save()};map.append(l,s,document.createElement('span'))}
 if(fire){const l=document.createElement('label');l.textContent=fireLabel;l.htmlFor='fireb';const s=document.createElement('select');s.id='fireb';btnOpts(s);
  s.value=String(S.fireBtn);s.onchange=()=>{const v=s.value[0]==='a'?s.value:+s.value;if(padX)S.xfire=v;else S.fireBtn=v;save()};let c;
  if(fireNote){c=document.createElement('span');c.className='note';c.style.margin=0;c.textContent=fireNote}else{c=document.createElement('label');c.innerHTML='<input type="checkbox" id="fireinv"> invert';c.firstChild.checked=!!S.fireInv;c.firstChild.onchange=e=>{S.fireInv=e.target.checked;save()}}map.append(l,s,c)}
 $('axes').innerHTML=Array.from({length:8},(_,i)=>`<div>${i}<i id="ab${i}"></i></div>`).join('');
 $('chans').innerHTML=['THR','YAW','PIT','ROL'].map((n,i)=>`<div>${n}<b><i id="ch${i}"></i></b></div>`).join('');
 $('calbtn').onclick=()=>{calib=calib?null:{i:-1,base:null,t:0,used:[],res:[],cand:-1,e:0,back:false};$('calbtn').textContent=calib?'Cancel':'Calibrate controller';if(!calib)$('calmsg').textContent=''}}
export function syncPad(){for(let i=0;i<4;i++){$('ax'+i).value=CAL()[i].a;$('inv'+i).checked=CAL()[i].s<0}if($('fireb'))selV($('fireb'),padX?S.xfire:S.fireBtn);if($('flipb'))selV($('flipb'),padX?S.xflip:S.flipBtn);syncSw()}
// show a mapping in a select, adding it as an option if it was learned (e.g. 'a5>0.12')
const selV=(s,b)=>{const v=String(b);if(![...s.options].some(o=>o.value===v))s.add(new Option(swName(b),v));s.value=v;if(s.selectedIndex<0)s.value='-1'};
// RC radio support: guided calibration (finds axis, centre, range and direction per channel)
function calTick(g){if(!calib)return;const m=$('calmsg'),now=performance.now();if(!g){m.textContent='Connect the radio or controller and move a stick.';return}const ax=[...g.axes];g.buttons.forEach((b,j)=>ax[100+j]=b.value);
 if(calib.i<0){if(!calib.base||ax.some((v,j)=>Math.abs(v-calib.base[j])>(padX?.12:.04))){calib.base=ax;calib.t=now}else if(now-calib.t>1200)calib.i=0;
  m.textContent='Centre yaw, pitch and roll. Throttle fully DOWN. Hold still…';return}
 if(calib.back){m.textContent='Got it. Let the stick go back (throttle back down).';
  if(ax.every((v,j)=>Math.abs(v-calib.base[j])<.25)){calib.back=false;if(calib.i>3){if(padX){S.xcal=calib.res;const u=calib.res.flatMap(c=>[c.a,c.b==null?-1:100+c.b]);if(typeof S.xfire==='number'&&u.includes(100+S.xfire)){S.xfire=u.includes(100)?(u.includes(107)?2:7):0;feed('Fire moved to '+BTN[S.xfire])}}else{S.cal=calib.res;S.thrMode='full'}save();syncUI();calib=null;$('calbtn').textContent='Calibrate controller';m.textContent='Calibrated. Check the THR/YAW/PIT/ROL bars.'}}return}
 m.textContent=`Step ${calib.i+1} of 4: move ${['THROTTLE fully UP','YAW fully RIGHT','PITCH fully FORWARD','ROLL fully RIGHT'][calib.i]} and hold${padX?' (stick, trigger or bumper)':''}`;
 let best=-1,bd=0;ax.forEach((v,j)=>{if(calib.used.includes(j))return;const d=Math.abs(v-calib.base[j]);if(d>bd){bd=d;best=j}});
 if(bd<.5){calib.cand=-1;return}
 if(calib.cand!==best){calib.cand=best;calib.t=now;calib.e=ax[best]}
 if(Math.abs(ax[best]-calib.base[best])>Math.abs(calib.e-calib.base[best]))calib.e=ax[best];
 if(now-calib.t>450){const b=calib.base[best],e=calib.e;const pr=best>=100?PAIR[best-100]:null;calib.res[calib.i]=calib.i?(best>=100?{a:best,c:0,s:1,...(pr!=null?{b:pr}:{})}:{a:best,c:b,s:e-b}):padX&&best<100&&Math.abs(b)<.5?{a:best,c:b,s:e-b,m:'spring'}:{a:best,c:(b+e)/2,s:(e-b)/2};calib.used.push(best);if(calib.i&&pr!=null)calib.used.push(100+pr);calib.i++;calib.back=true;tone(880,880,.08,.08)}}
export function menuPad(){const g=pad();if(padX!==menuPad.lx){menuPad.lx=padX;syncUI()}$('gpname').textContent=padBlocked?'· blocked in this view':g?'· '+g.id.slice(0,40)+(RADIO.test(g.id)?' (radio)':padX?' (Xbox layout)':''):'· none yet (move a stick or press a button)';
 for(let i=0;i<8;i++){const v=g?.axes[i]??0,b=$('ab'+i);b.style.height=Math.abs(v)*50+'%';b.style.bottom=v<0?(50-Math.abs(v)*50)+'%':'50%'}
 for(let i=0;i<4;i++){const v=g?axv(g,i):0,b=$('ch'+i);b.style.left=(v<0?50+v*50:50)+'%';b.style.width=Math.abs(v)*50+'%'}
 const bw=$('btns'),nb=g?g.buttons.length:0;if(bw.childElementCount!==nb||bw.dataset.x!==String(padX)){bw.dataset.x=padX;bw.innerHTML=Array.from({length:nb},(_,j)=>`<span>${padX&&BTN[j]?BTN[j]:'B'+j}</span>`).join('')}
 for(let j=0;j<nb;j++){const b=g.buttons[j],e=bw.children[j];e.classList.toggle('on',b.pressed||b.value>.5);e.style.setProperty('--v',Math.round(b.value*100)+'%')}
 calTick(g);learnTick(g);for(const[k]of SWS){if(learn?.k===k)continue;const v=g?swOn(g,S[sk(k)]):null;$('st_'+k).textContent=v==null?'':v?'● ON':'○ off'}}

// ---------- switches: map game functions to radio switches or buttons, each with a Learn button, plus an Assign switches walkthrough ----------
// rows: [setting key, label, default keyboard / mouse code]; 'fire' is the shared fire / detonate mapping (its own setting on an Xbox pad). Without mountSwitches nothing here runs.
// opts.reserved(code, row) names what already uses a key (the game's own keys) or gives '' when the row may take it; opts.onChange() runs when a binding or its text changes.
// The keyboard / mouse side is S.keys[row] (engine/keys.js): the key cell next to Learn, click it and press a key or mouse button (Esc cancels); a key another row or the game uses is refused with a note in the cell.
let SWS=[],learn=null,cap=null;const sk=k=>k==='fire'?(padX?'xfire':'fireBtn'):k,KB={},notes={},cell=k=>$('kb_'+k);
export const swPrev={};
function syncKeys(){for(const[k]of SWS){const c=cell(k);if(!c)continue;c.textContent=cap?.k===k?'press a key or mouse button':notes[k]?.t||keyLabel(S.keys?.[k]);c.classList.toggle('cap',cap?.k===k);c.classList.toggle('bad',!!notes[k])}KB.onChange?.()}
const note=(k,t)=>{clearTimeout(notes[k]?.id);notes[k]={t,id:setTimeout(()=>{delete notes[k];syncKeys()},2600)}};
const refuse=(k,c)=>{if(!okCode(c))return'That key cannot be used';const lab=keyLabel(c);for(const[r,l]of SWS)if(r!==k&&S.keys[r]===c)return`${lab} is in use: ${l}`;const x=KB.reserved?.(c,k);return x?`${lab} is in use: ${x}`:''};
let menuOpen=()=>true;const capOn=()=>{if(cap&&!menuOpen()){cap=null;syncKeys()}return cap};  /* the menu closed under a capture (a pad's Start): flying keys are flying keys again */
function capKey(c){const k=cap.k;cap=null;cell(k).blur();if(c!=='Escape'){const m=refuse(k,c);if(m)note(k,m);else{S.keys[k]=c;save()}}syncKeys()}
function eat(){const f=e=>{e.preventDefault();e.stopPropagation()},t=['click','auxclick','contextmenu'];t.forEach(n=>addEventListener(n,f,true));addEventListener('mouseup',()=>setTimeout(()=>t.forEach(n=>removeEventListener(n,f,true)),60),{once:true,capture:true})}  /* the click / context menu that ends a captured mouse press belongs to the binding, not to what was under the pointer */
export function mountSwitches(rows,opts={}){SWS=rows;Object.assign(KB,opts);if(!S.keys)S.keys={};for(const[k,,d]of SWS)if(!okCode(S.keys[k]))S.keys[k]=d;const map=$('map');
 map.insertAdjacentHTML('beforebegin','<div class="mp"><button class="sm" id="asnbtn">Assign switches</button><button class="sm" id="asnskip" hidden>Skip</button><span id="asnmsg" class="note" style="margin:0;align-self:center"></span></div>');
 map.insertAdjacentHTML('afterend','<p class="note">To map switches, press Assign switches and flip each one when it asks (any key skips), or press Learn next to a single one. The key cell is the keyboard or mouse side: click it, then press a key or mouse button (Esc cancels). <button class="lnk" id="keyreset">Reset keys</button></p>');
 $('keyreset').onclick=()=>{cap=null;for(const[k,,d]of SWS){S.keys[k]=d;delete notes[k]}save();syncKeys()};
 for(const[k,lab]of SWS){const l=document.createElement('label');l.textContent=lab;l.htmlFor='sw_'+k;const s=document.createElement('select');s.id='sw_'+k;s.add(new Option('None','-1'));
  for(let b=0;b<32;b++)s.add(new Option('Button '+b+(BTN[b]?' ('+BTN[b]+' on Xbox)':''),b));for(let a=0;a<16;a++){s.add(new Option(`Switch axis ${a} high`,'a'+a));s.add(new Option(`Switch axis ${a} low`,'-a'+a))}
  s.onchange=()=>{const v=s.value;S[sk(k)]=/a/.test(v)?v:+v;delete swPrev[k];save()};
  const w=document.createElement('span');w.style.cssText='display:flex;gap:6px;align-items:center';w.innerHTML=`<button class="sm" id="ln_${k}" style="padding:4px 10px;font-size:12px">Learn</button><button class="sm kc" id="kb_${k}" title="Keyboard / mouse: click, then press a key or mouse button"></button><span class="note" id="st_${k}" style="margin:0;min-width:3.5em"></span>`;
  map.append(l,s,w);w.firstChild.onclick=()=>{const g=pad();if(!g){$('st_'+k).textContent='no radio';return}cap=null;learn={k,ax:[...g.axes],bt:g.buttons.map(x=>x.pressed),t:performance.now()};syncSw()};
  cell(k).onclick=()=>{if(cap?.k===k){cap=null;syncKeys();return}learn=null;cap={k};delete notes[k];syncSw()}}
 $('asnbtn').onclick=()=>{if(learn?.seq){learn=null;syncSw();return}if(!pad()){$('asnmsg').textContent='No radio yet: move a stick first';return}cap=null;asnStep()};$('asnskip').onclick=()=>asnStep(learn?.k);syncSw()}
function syncSw(){if(!SWS.length)return;for(const[k]of SWS){selV($('sw_'+k),S[sk(k)]);$('ln_'+k).textContent=learn?.k===k?'Flip it…':'Learn'}
 const q=learn?.seq;$('asnbtn').textContent=q?'Stop':'Assign switches';$('asnskip').hidden=!q;$('asnmsg').innerHTML=q?`Flip the switch for <b>${SWS.find(s=>s[0]===learn.k)[1]}</b> (any key skips)`:'';syncKeys()}
// Assign switches: walks the rows in order; each step waits for a flip, then moves on. The next step takes its baseline once the last switch has settled.
function asnStep(k){const i=k==null?0:SWS.findIndex(s=>s[0]===k)+1;learn=i<SWS.length?{k:SWS[i][0],seq:1,ax:null,t:performance.now()}:null;syncSw();if(!learn&&k!=null)$('asnmsg').textContent='Done: all switches assigned'}
function learnTick(g){if(!learn)return;if(!g||!learn.seq&&performance.now()-learn.t>10000){learn=null;syncSw();return}
 if(!learn.ax){if(performance.now()-learn.t>400){learn.ax=[...g.axes];learn.bt=g.buttons.map(x=>x.pressed)}return}const sticks=CAL().map(c=>c.a);let v=null;
 g.buttons.forEach((b,i)=>{if(v==null&&b.pressed&&!learn.bt[i])v=i});
 if(v==null&&learn.cand==null)g.axes.forEach((a,i)=>{if(learn.cand==null&&!sticks.includes(i)&&Math.abs(a-(learn.ax[i]??0))>.3){learn.cand=i;learn.ct=performance.now();learn.cv=a}});
 if(v==null&&learn.cand!=null){const i=learn.cand,a=g.axes[i]??0;if(Math.abs(a-learn.cv)>.02){learn.cv=a;learn.ct=performance.now()}  // wait for the switch to settle
  else if(performance.now()-learn.ct>150){const o=learn.ax[i]??0;learn.cand=null;if(Math.abs(a-o)>.3)v=`a${i}${a>o?'>':'<'}${((a+o)/2).toFixed(2)}`}}  // ON = past the midpoint between where it was and where it went
 if(v!=null){const k=learn.k;S[sk(k)]=v;delete swPrev[k];save();$('st_'+k).textContent=swName(v);tone(880,880,.08,.08);if(learn.seq)asnStep(k);else{learn=null;syncSw()}}}
// switch actions while flying: acts[key]=[set(v), get() or null for a one-shot]. Radio switches (axes, or buttons on a radio, which latch) set the position
// whenever they move; gamepad buttons toggle; a one-shot fires on any flip of a radio switch or press of a button
export function pollSwitches(acts){const g=pad();for(const k in acts){const[set,get]=acts[k],b=S[k],v=g?swOn(g,b):null,p=swPrev[k];swPrev[k]=v;if(v==null||v===p)continue;
 const lat=typeof b==='string'||RADIO.test(g.id);if(!get){if(p!=null&&(lat||v))set()}else if(lat)set(v);else if(v&&p!=null)set(!get())}}
