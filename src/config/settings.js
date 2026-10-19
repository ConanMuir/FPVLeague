// Settings S: defaults (DEF), load from localStorage 'droneleague', and every migration, in the order v15 ran them.
// S is a live `export let`, assigned only here; everyone else mutates its properties and calls save().
import {ARENAS,cl} from './constants.js';
import {MDEF,cleanMod} from './mods.js';
import {RTYPES} from './ratetypes.js';
import {STOCK,cleanLoadout} from '../parts/index.js';
const DEF={mode:"acro",diff:3,size:2,tilt:30,fov:110,cam:0,thrMode:"full",len:180,cal:[{"a":2,"c":0.0275,"s":-0.7922},{"a":5,"c":-0.0431,"s":0.7843},{"a":1,"c":0.0431,"s":-0.8392},{"a":0,"c":-0.0039,"s":0.8235}],dz:0.03,name:'',tp:'auto',map:'arena',ball:'classic',game:'league',afire:true,fireBtn:5,sboost:false,bots:1,arena:1,xfire:7,xflip:1,flipBtn:-1,xcal:[{a:1,c:0,s:-1,m:'spring'},{a:0,c:0,s:1},{a:3,c:0,s:-1},{a:2,c:0,s:1}],gfx:'auto',assist:0,osd:false};
export let S;try{S={...DEF,...JSON.parse(localStorage.getItem('droneleague')||'{}')}}catch(e){S={...DEF}}
if(!Array.isArray(S.cal)||S.cal.length!==4||!S.cal.every(c=>c&&Number.isFinite(c.a)&&Number.isFinite(c.c)&&Number.isFinite(c.s)))S.cal=DEF.cal.map(c=>({...c}));
if(!Array.isArray(S.xcal)||S.xcal.length!==4||!S.xcal.every(c=>c&&Number.isFinite(c.a)&&Number.isFinite(c.c)&&Number.isFinite(c.s)))S.xcal=DEF.xcal.map(c=>({...c}));if(S.bots!==0)S.bots=1;if(!ARENAS[S.arena])S.arena=1;
S.loadout=cleanLoadout(S.loadout)||[...STOCK];  // drone parts [arms, chassis, power]; older saves get Stock
if(!['arena','meadow','canyon','alpine'].includes(S.map))S.map='arena';if(!['classic','soccer','plasma','beach'].includes(S.ball))S.ball='classic';if(typeof S.game!=='string'||!/^[a-z0-9_]{1,16}$/.test(S.game))S.game='league';  // modes register at load; setGame() falls back to League for an unknown id
if(!['auto','high','med','low'].includes(S.gfx))S.gfx='auto';S.osd=S.osd===true;S.longline=S.longline===true;S.tiltAx=Number.isInteger(S.tiltAx)&&S.tiltAx>=-1&&S.tiltAx<8?S.tiltAx:-1;S.tiltMin=Number.isFinite(S.tiltMin)?cl(S.tiltMin,-90,90):-30;S.tiltMax=Number.isFinite(S.tiltMax)?cl(S.tiltMax,-90,90):60;  // camera tilt on an axis (off by default)
S.llLen=Number.isFinite(S.llLen)?cl(S.llLen,8,40):20;S.llW=Number.isFinite(S.llW)?cl(S.llW,1,10):4;if(!['stiff','normal','bungee'].includes(S.llStr))S.llStr='normal';if(!['hoops','goals'].includes(S.llScore))S.llScore='hoops';if(!['sling','fpv'].includes(S.llCam))S.llCam='sling';if(!(Number.isInteger(S.lookBtn)&&S.lookBtn>=-1&&S.lookBtn<32))S.lookBtn=-1;  // long line cable, load and scoringfor(const k of['vMaster','vMotor','vWind','vOther','vFx'])S[k]=Number.isFinite(S[k])?cl(Math.round(S[k]),0,100):100;  // Audio tab volumes in %, 100 = as before  // graphics quality (added after v15; older saves get Auto)
export const save=()=>{try{localStorage.setItem('droneleague',JSON.stringify(S))}catch(e){}};
// physics mod values (v15 ran these when the mod panel was built)
S.mod={...MDEF,...cleanMod(S.mod)};if((S.physV|0)<2){const O={thr:124,maxv:111,dl:.14,dq:.0065,spool:30};for(const k in O)if(Math.abs(S.mod[k]-O[k])<1e-9)S.mod[k]=MDEF[k];S.physV=2;save()}  // v2 flight model: move untouched old defaults to the 6S defaults
if((S.physV|0)<3){const O={dbounce:.2,wash:1,boost:140,bgrav:5};for(const k in O)if(Math.abs(S.mod[k]-O[k])<1e-9)S.mod[k]=MDEF[k];S.physV=3;save()}  // v3: Riley's mode is the default
if((S.physV|0)<4){const O={bgrav:19.5,bbounce:.68,bmax:85,bmass:.7,size:.75};for(const k in O)if(Math.abs(S.mod[k]-O[k])<1e-9)S.mod[k]=MDEF[k];S.physV=4;save()}  // v4: Rocket League ball and car-to-ball scale
if((S.physV|0)<5){if(Math.abs(S.mod.gfric-.1)<1e-9)S.mod.gfric=MDEF.gfric;S.physV=5;save()}  // v5: real ground grip (no wheels = no ice rink)
if(!S.presets||typeof S.presets!=='object')S.presets={};
// rate profiles (v15 ran this when the rates panel was built)
{const ok=r=>r&&RTYPES[r.type]&&Array.isArray(r.ax)&&r.ax.length===3&&r.ax.every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite));
 if(!Array.isArray(S.rprof)||S.rprof.length!==3||!S.rprof.every(ok)){S.rprof=[{"type":"BETAFLIGHT","ax":[[80,70,30],[80,70,30],[80,75,30]],"thrMid":50,"thrExpo":0,"thrLimit":100},{"type":"BETAFLIGHT","ax":[[100,70,0],[100,70,0],[100,70,0]],"thrMid":50,"thrExpo":0,"thrLimit":100},{"type":"ACTUAL","ax":[[7,67,0],[7,67,0],[7,67,0]],"thrMid":50,"thrExpo":0,"thrLimit":100}]}
 for(const r of S.rprof){r.thrMid=cl(+r.thrMid||50,0,100);r.thrExpo=cl(+r.thrExpo||0,0,100);r.thrLimit=cl(+r.thrLimit||100,25,100)}S.rpi=cl(S.rpi|0,0,2);save()}
// v16 controls + Calibration Lab fields (all optional except assist): assist 0..1; dzy yaw deadband (falls back to dz);
// xboost/boostBtn boost button; per-channel r (rest of an axis trigger) and nb (the other direction's control) in cal/xcal
{const B=v=>v===-1||Number.isInteger(v)&&v>=0&&v<32||typeof v==='string'&&/^a\d-?$/.test(v),num=Number.isFinite;S.assist=cl(+S.assist||0,0,1);
 if(S.dzy!=null&&!num(+S.dzy))delete S.dzy;else if(S.dzy!=null)S.dzy=cl(+S.dzy,0,.2);for(const k of['xboost','boostBtn','xfire','fireBtn','xflip','flipBtn'])if(k in S&&!B(S[k]))S[k]=DEF[k]??-1;
 for(const c of[...S.cal,...S.xcal]){if('r'in c&&!num(c.r))delete c.r;if(c.nb&&!(num(c.nb.a)&&num(c.nb.c)&&num(c.nb.s)))delete c.nb}}
