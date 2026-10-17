// Input: keyboard, mouse fire, gamepad / RC radio through the Gamepad API, Xbox profile, guided calibration and the controller panel
import {$,cl} from './util.js';
import {S,save} from './settings.js';
import {feed,banner} from './hud.js';
import {tone} from './audio.js';
import {syncUI} from './menu.js';
import {toggleMod} from './modpanel.js';
export const keys={},inp={mouseFire:false};
export let padBlocked=false,padX=false,calib=null;  // padX: Xbox-style gamepad, with its own calibration profile so a radio's stays untouched
export const RADIO=/edgetx|opentx|radiomaster|frsky|taranis|jumper|tbs|tango|mambo|boxer|zorro|spektrum|betafpv|literadio|flysky|ethos|stm32|dji|interlink|realflight|usb joystick/i;
const isX=g=>!RADIO.test(g.id)&&(g.mapping==='standard'||/xbox|xinput|045e/i.test(g.id));
// the most recently used gamepad
export const pad=()=>{let ps=[];try{ps=navigator.getGamepads?navigator.getGamepads():[]}catch(e){padBlocked=true}let best=null;for(const g of ps)if(g&&g.connected&&(!best||(g.timestamp||0)>(best.timestamp||0)))best=g;if(best)padX=isX(best);return best};
export const CAL=()=>padX?S.xcal:S.cal,thrFull=()=>padX?CAL()[0].m!=='spring':S.thrMode==='full',BTN=['A','B','X','Y','LB','RB','LT','RT','View','Menu','LS','RS','D-up','D-down','D-left','D-right','Xbox'];
export const PAIR={4:5,5:4,6:7,7:6};  // a bumper or trigger on yaw/pitch/roll gets its partner for the other direction
// sources 0-99 are axes, 100+ are buttons/triggers (analog 0..1); b = paired button pulling the other way (RB/LB, RT/LT)
const src=(g,a,f=0)=>a>=100?(g.buttons[a-100]?.value??f):(g.axes[a]??f);
// calibrated channel: (raw - centre) / signed half-range, so direction is baked in
export const axv=(g,i)=>{const c=CAL()[i],v=(src(g,c.a,c.c)-c.c)/(c.s||1)-(c.b!=null?src(g,100+c.b):0);return cl(Math.abs(v)<S.dz?0:v,-1,1)};
// fire / detonate: F, left mouse, or the fire button or switch (S.fireInv: fire with the switch in the other position)
export function fireBtnIn(){if(keys.KeyF||inp.mouseFire)return true;const g=pad(),b=padX?S.xfire:S.fireBtn;return !!(g&&((typeof b==='string'?(g.axes[+b.slice(1)]??(S.fireInv?1:-1))>.5:!!g.buttons[b]?.pressed)!==!!S.fireInv))}
// flip over: E, or the flip button (Xbox B by default; none on a radio until you map one)
export const flipIn=()=>{if(keys.KeyE)return true;const g=pad(),b=padX?S.xflip:S.flipBtn;if(!g||b===-1||b==null)return false;return typeof b==='string'?(g.axes[+b.slice(1)]??-1)>.5:!!g.buttons[b]?.pressed};
// keyboard + mouse: o.menu() = menu open, o.pause() toggles it, o.key(e) gets every other key press while flying
export function initInput(o){
 addEventListener('keydown',e=>{if(e.target.matches?.('textarea,input:not([type=range]):not([type=checkbox])'))return;if(e.code==='KeyT'&&!e.repeat){toggleMod();return}keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&!o.menu())e.preventDefault();if(e.repeat)return;
  if(e.code==='Escape'||e.code==='KeyP')o.pause();if(o.menu())return;
  if(e.code==='KeyM'){S.mode=S.mode==='acro'?'angle':'acro';save();syncUI();banner(S.mode.toUpperCase(),'',.8)}o.key(e)});
 addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>{for(const k in keys)keys[k]=false;inp.mouseFire=false});
 addEventListener('mousedown',e=>{if(e.button===0&&!o.menu()&&!e.target.closest?.('#mod,#menu,button,input,select,textarea'))inp.mouseFire=true});addEventListener('mouseup',e=>{if(e.button===0)inp.mouseFire=false});
 addEventListener('gamepadconnected',e=>{if(RADIO.test(e.gamepad.id)&&S.thrMode!=='full'){S.thrMode='full';save();syncUI();feed('Radio detected: throttle set to full range. Open the menu and press Calibrate radio.')}})}
// gamepad shortcut buttons (never on a radio, never a button the Xbox profile flies with): fn(edge) with edge(i) = button i just pressed
let prevBtn=[];
export function padEdges(fn){const g=pad();if(!g||RADIO.test(g.id))return;const u=new Set();if(padX)for(const c of S.xcal){if(c.a>=100)u.add(c.a-100);if(c.b!=null)u.add(c.b)}
 const b=g.buttons.map(x=>x.pressed),e=i=>b[i]&&!prevBtn[i]&&!u.has(i);fn(e);prevBtn=b}

// ---------- controller panel ----------
export function mountPad(el,{fireLabel='Fire',fireNote=null,flip=true}={}){el.innerHTML=`<h2 style="margin-top:20px">Controller <span id="gpname" style="text-transform:none;letter-spacing:0"></span></h2>
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
 {const l=document.createElement('label');l.textContent=fireLabel;l.htmlFor='fireb';const s=document.createElement('select');s.id='fireb';btnOpts(s);
  s.value=String(S.fireBtn);s.onchange=()=>{const v=s.value[0]==='a'?s.value:+s.value;if(padX)S.xfire=v;else S.fireBtn=v;save()};let c;
  if(fireNote){c=document.createElement('span');c.className='note';c.style.margin=0;c.textContent=fireNote}else{c=document.createElement('label');c.innerHTML='<input type="checkbox" id="fireinv"> invert';c.firstChild.checked=!!S.fireInv;c.firstChild.onchange=e=>{S.fireInv=e.target.checked;save()}}map.append(l,s,c)}
 $('axes').innerHTML=Array.from({length:8},(_,i)=>`<div>${i}<i id="ab${i}"></i></div>`).join('');
 $('chans').innerHTML=['THR','YAW','PIT','ROL'].map((n,i)=>`<div>${n}<b><i id="ch${i}"></i></b></div>`).join('');
 $('calbtn').onclick=()=>{calib=calib?null:{i:-1,base:null,t:0,used:[],res:[],cand:-1,e:0,back:false};$('calbtn').textContent=calib?'Cancel':'Calibrate controller';if(!calib)$('calmsg').textContent=''}}
export function syncPad(){for(let i=0;i<4;i++){$('ax'+i).value=CAL()[i].a;$('inv'+i).checked=CAL()[i].s<0}$('fireb').value=String(padX?S.xfire:S.fireBtn);if($('flipb'))$('flipb').value=String(padX?S.xflip:S.flipBtn)}
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
 calTick(g)}
