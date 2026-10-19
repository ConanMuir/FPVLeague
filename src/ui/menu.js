// ---------- menu / settings ----------
import {$,AI,ARENAS,DIFF} from '../config/constants.js';
import {S,save} from '../config/settings.js';
import {BTN,CAL,PAIR,RADIO,axv,pad,padBlocked,padX} from '../input/input.js';
import {setGame} from '../modes/dogfight.js';
import {LAB,exitLab} from '../modes/lab.js';
import {MODES,modeId,modeList} from '../modes/registry.js';
import {showMenu,startDemo,startMatch} from '../modes/match.js';
import {enterGame,leaveGame,mpMsg} from '../net/net.js';
import {BALLS,setBall} from '../render/ball.js';
import {setQuality} from '../render/renderer.js';
import {GS} from '../state.js';
import {feed} from './hud.js';
import {modMsg} from './modpanel.js';
import {tab} from './rates.js';
import {OUT,setMap} from '../world/maps.js';
const FIELDS=[['size','Team size','sel',[[1,'1v1'],[2,'2v2'],[3,'3v3']]],['diff','Bot skill','sel',DIFF.map((d,i)=>[i,d.n])],['bots','Bots','sel',[[1,'Fill empty spots'],[0,'No bots']]],['len','Match length','sel',[[120,'2 min'],[180,'3 min'],[300,'5 min']]],['arena','Arena size','sel',ARENAS.map((a,i)=>[i,`${a[0]} (${a[1]}×${a[2]} m)`])],['map','Map','sel',[['arena','Neon Arena'],...Object.entries(OUT).map(([k,c])=>[k,c.name])]],['ball','Ball style','sel',BALLS],['gfx','Graphics quality','sel',[['auto','Auto'],['high','High'],['med','Medium'],['low','Low (integrated GPUs)']]],
 ['mode','Flight mode','sel',[['acro','Acro (rate)'],['angle','Angle (self-level)']]],
 ['tilt','Camera uptilt','rng',0,60,1,'°'],['fov','FPV field of view','rng',80,150,1,'°'],['thrMode','Throttle stick','sel',[['spring','Gamepad (centre = hover)'],['full','Radio (full range)']]],['dz','Stick deadband','rng',0,.15,.005],['assist','Flight assist','rng',0,1,.05],['afire','Auto-fire (Dogfight)','sel',[[true,'On'],[false,'Off']]],['sboost','Super boost','sel',[[false,'Off'],[true,'On']]]];
// settings tab for each field (the rest go on Match); Controls and Keys tabs hold the controller block and the key list
const FTAB={mode:'flight',thrMode:'flight',dz:'flight',assist:'flight',map:'video',ball:'video',gfx:'video',tilt:'video',fov:'video'};
// builds the settings and controller-mapping rows and wires the menu buttons (v15 ran this at load)
export function initMenu(){
for(const[k,lab,type,...o]of FIELDS){const setEl=FTAB[k]?$('set_'+FTAB[k]):$('set');const l=document.createElement('label');l.textContent=lab;l.htmlFor='f_'+k;setEl.append(l);let inp;
 if(type==='sel'){inp=document.createElement('select');for(const[v,t]of o[0])inp.add(new Option(t,JSON.stringify(v)))}else{inp=document.createElement('input');inp.type='range';[inp.min,inp.max,inp.step]=o}
 inp.id='f_'+k;const out=document.createElement('output');out.id='o_'+k;setEl.append(inp,out);
 inp.addEventListener('input',()=>{S[k]=type==='sel'?JSON.parse(inp.value):+inp.value;save();syncUI();if(k==='map'&&!GS.OBSON)setMap(S.map);if(k==='ball')setBall(S.ball);if(k==='gfx')setQuality(S.gfx);if(k==='arena'&&S.arena!==AI&&!GS.net){mpMsg('Building the '+ARENAS[S.arena][0]+' arena…');setTimeout(()=>location.reload(),60)}})}  // arena geometry is built at load, so a new size reloads the page
const map=$('map');['Throttle','Yaw','Pitch','Roll'].forEach((n,i)=>{const l=document.createElement('label');l.textContent=n;l.htmlFor='ax'+i;const s=document.createElement('select');s.id='ax'+i;for(let a=0;a<8;a++)s.add(new Option('Axis '+a,a));BTN.forEach((n,j)=>s.add(new Option(n+(j>3&&j<8?'':' button'),100+j)));
 const c=document.createElement('label');c.innerHTML=`<input type="checkbox" id="inv${i}"> invert`;map.append(l,s,c);
 s.onchange=()=>{const a=+s.value,C=CAL(),sg=C[i].s<0?-1:1;C[i]=a<100?{a,c:0,s:sg}:i?{a,c:0,s:sg,...(PAIR[a-100]!=null?{b:PAIR[a-100]}:{})}:{a,c:.5,s:.5*sg};save()};c.firstChild.onchange=()=>{CAL()[i].s=-CAL()[i].s;save()}});
const btnOpts=(s,none)=>{if(none)s.add(new Option('None','-1'));for(let b=0;b<18;b++)s.add(new Option('Button '+b+(BTN[b]?' ('+BTN[b]+' on Xbox)':''),b));for(let a=2;a<8;a++)s.add(new Option('Switch / trigger axis '+a,'a'+a))};
{const l=document.createElement('label');l.textContent='Flip over';l.htmlFor='flipb';const s=document.createElement('select');s.id='flipb';btnOpts(s,true);
 s.onchange=()=>{const v=s.value[0]==='a'?s.value:+s.value;if(padX)S.xflip=v;else S.flipBtn=v;save()};map.append(l,s,document.createElement('span'))}
{const l=document.createElement('label');l.textContent='Fire';l.htmlFor='fireb';const s=document.createElement('select');s.id='fireb';btnOpts(s);
 s.value=String(S.fireBtn);s.onchange=()=>{const v=s.value[0]==='a'?s.value:+s.value;if(padX)S.xfire=v;else S.fireBtn=v;save()};const c=document.createElement('label');c.innerHTML='<input type="checkbox" id="fireinv"> invert';c.firstChild.checked=!!S.fireInv;c.firstChild.onchange=e=>{S.fireInv=e.target.checked;save()};map.append(l,s,c)}
$('axes').innerHTML=Array.from({length:8},(_,i)=>`<div>${i}<i id="ab${i}"></i></div>`).join('');
$('chans').innerHTML=['THR','YAW','PIT','ROL'].map((n,i)=>`<div>${n}<b><i id="ch${i}"></i></b></div>`).join('');
syncUI();
addEventListener('gamepadconnected',e=>{if(RADIO.test(e.gamepad.id)&&S.thrMode!=='full'){S.thrMode='full';save();syncUI();feed('Radio detected: throttle set to full range. Open the menu and press Calibrate radio.')}});
$('nick').value=S.name||'';$('nick').oninput=e=>{S.name=e.target.value.slice(0,16);save()};$('tpref').value=S.tp;$('tpref').onchange=e=>{S.tp=e.target.value;save()};
$('host').onclick=()=>{exitLab();enterGame(Math.random().toString(36).slice(2,6),true)};$('join').onclick=()=>{exitLab();enterGame($('code').value,false)};$('code').onkeydown=e=>{if(e.key==='Enter'){exitLab();enterGame($('code').value,false)}};
for(const b of $('stabs').children)b.onclick=()=>{for(const x of $('stabs').children)x.classList.toggle('on',x===b);for(const p of document.querySelectorAll('#scr-settings .tabp'))p.hidden=p.dataset.tab!==b.dataset.tab};
 // sub-screens (Play online, Settings): open over the menu, Back or Esc returns to the main list
 for(const b of document.querySelectorAll('#home [data-scr]'))b.onclick=()=>menuScreen(b.dataset.scr);for(const b of document.querySelectorAll('#menu .back'))b.onclick=()=>menuScreen(null);
 addEventListener('keydown',e=>{if(e.code==='Escape'&&GS.menuOpen&&document.querySelector('#menu .scr:not([hidden])')){menuScreen(null);e.stopImmediatePropagation()}},true);
 for(const M of modeList()){if(M.hidden)continue;const b=document.createElement('button');b.className='sm';b.id='m_'+M.id;b.dataset.m=M.id;b.textContent=M.name;b.onclick=()=>pickGame(M.id);$('modes').append(b)}  // one button per registered mode (modes/registry.js)
$('play').onclick=()=>{exitLab();startMatch()};$('resume').onclick=()=>showMenu(false);$('leave').onclick=()=>{exitLab();leaveGame();startDemo()};
$('copyset').onclick=()=>{const o={};for(const k of['mode','diff','size','len','tilt','fov','cam','thrMode','dz','map','ball','cal','xcal','xfire','xflip','flipBtn','bots','mod','rprof','rpi','assist','dzy','xboost','boostBtn','loadout'])o[k]=S[k];const t=JSON.stringify(o);
 const show=()=>{$('mod').hidden=false;tab(false);$('mio').value=t;$('mio').select();modMsg('Select and copy this text')};
 try{navigator.clipboard.writeText(t).then(()=>mpMsg('Settings copied. Paste them to Claude to make them the defaults.'),show)}catch(e){show()}};
{const m=location.hash.match(/^#([a-z0-9]{2,6})$/i);if(m)$('code').value=m[1]}
}
export function syncUI(){for(const[k,,type]of FIELDS){const inp=$('f_'+k);inp.value=type==='sel'?JSON.stringify(S[k]):S[k];
 $('o_'+k).textContent=type==='rng'?(k==='tilt'||k==='fov'?S[k]+'°':(+S[k]).toFixed(2)):''}
 for(let i=0;i<4;i++){$('ax'+i).value=CAL()[i].a;$('inv'+i).checked=CAL()[i].s<0}$('fireb').value=String(padX?S.xfire:S.fireBtn);$('flipb').value=String(padX?S.xflip:S.flipBtn)}
function pickGame(m){if(GS.net){mpMsg('Leave the online game to switch modes.');return}const lab=LAB.on;exitLab();S.game=m;save();setGame(m);if(GS.demo||lab)startDemo();else startMatch()}
export function menuScreen(id){for(const s of document.querySelectorAll('#menu .scr'))s.hidden=s.id!=='scr-'+id;$('home').hidden=!!id;(id?document.querySelector('#scr-'+id+' .back'):$(GS.demo?'play':'resume'))?.focus({preventScroll:true})}
export function menuPad(){const g=pad();if(padX!==menuPad.lx){menuPad.lx=padX;syncUI()}$('gpname').textContent=padBlocked?'· blocked in this view':g?'· '+g.id.slice(0,40)+(RADIO.test(g.id)?' (radio)':padX?' (Xbox layout)':''):'· none yet (move a stick or press a button)';
 for(let i=0;i<8;i++){const v=g?.axes[i]??0,b=$('ab'+i);b.style.height=Math.abs(v)*50+'%';b.style.bottom=v<0?(50-Math.abs(v)*50)+'%':'50%'}
 for(let i=0;i<4;i++){const v=g?axv(g,i):0,b=$('ch'+i);b.style.left=(v<0?50+v*50:50)+'%';b.style.width=Math.abs(v)*50+'%'}
 const bw=$('btns'),nb=g?g.buttons.length:0;if(bw.childElementCount!==nb||bw.dataset.x!==String(padX)){bw.dataset.x=padX;bw.innerHTML=Array.from({length:nb},(_,j)=>`<span>${padX&&BTN[j]?BTN[j]:'B'+j}</span>`).join('')}
 for(let j=0;j<nb;j++){const b=g.buttons[j],e=bw.children[j];e.classList.toggle('on',b.pressed||b.value>.5);e.style.setProperty('--v',Math.round(b.value*100)+'%')}
 }
// online lobby
export function renderGames(peers){const box=$('games');box.textContent='';for(const p of peers){const pr=p.presence;if(!pr?.game||p.sameTab)continue;const code=String(pr.game).replace(/[^a-z0-9]/g,'').slice(0,6);if(!code||GS.net?.code===code)continue;
 const b=document.createElement('button');b.className='sm';b.textContent=`Join ${String(pr.host||'Pilot').slice(0,16)} · ${MODES[modeId(pr.m)].name} · ${code.toUpperCase()} · ${Math.min(6,pr.pl|0)} pilot${(pr.pl|0)===1?'':'s'}`;b.onclick=()=>enterGame(code,false);box.append(b)}}
