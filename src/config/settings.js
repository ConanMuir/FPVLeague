// Settings S: defaults (DEF), load from localStorage 'droneleague', then the schema below: every check, clamp and migration, in the
// order v15 ran them (config/schema.js runs it; that order is also the saved JSON's key order). physV is the settings version.
// S is a live `export let`, assigned only here; everyone else mutates its properties and calls save().
// Adding a setting: a field() at the end of SCHEMA (with its default in DEF only if v15 had it). Changing what an old save means:
// a {v, run} at the end of MIGRATIONS with the next version number (it runs once, before everything after physV in SCHEMA).
import {ARENAS,DIFF,cl} from './constants.js';
import {MDEF,cleanMod} from './mods.js';
import {RTYPES} from './ratetypes.js';
import {DROP,field,int,isTrue,loadSchema,num,oneOf,version} from './schema.js';
import {STOCK,cleanLoadout} from '../parts/index.js';
import {cleanTrain} from '../training/judge.js';
import {cleanCos} from '../parts/cosmetics.js';
const DEF={mode:"acro",diff:3,size:2,tilt:30,fov:110,cam:0,thrMode:"full",len:180,cal:[{"a":2,"c":0.0275,"s":-0.7922},{"a":5,"c":-0.0431,"s":0.7843},{"a":1,"c":0.0431,"s":-0.8392},{"a":0,"c":-0.0039,"s":0.8235}],dz:0.03,name:'',tp:'auto',map:'arena',ball:'classic',game:'league',afire:true,fireBtn:5,sboost:false,bots:1,arena:1,xfire:7,xflip:1,flipBtn:-1,xcal:[{a:1,c:0,s:-1,m:'spring'},{a:0,c:0,s:1},{a:3,c:0,s:-1},{a:2,c:0,s:1}],gfx:'auto',assist:0,osd:false};
const RPROF=()=>[{"type":"BETAFLIGHT","ax":[[80,70,30],[80,70,30],[80,75,30]],"thrMid":50,"thrExpo":0,"thrLimit":100},{"type":"BETAFLIGHT","ax":[[100,70,0],[100,70,0],[100,70,0]],"thrMid":50,"thrExpo":0,"thrLimit":100},{"type":"ACTUAL","ax":[[7,67,0],[7,67,0],[7,67,0]],"thrMid":50,"thrExpo":0,"thrLimit":100}];
// ---------- migrations of S.mod (physics mod values), keyed by physV ----------
// each resets the values a save still has at the old default to the new default (a value the pilot changed is kept)
const oldDefaults=O=>S=>{for(const k in O)if(Math.abs(S.mod[k]-O[k])<1e-9)S.mod[k]=MDEF[k]};
export const MIGRATIONS=[
 {v:2,run:oldDefaults({thr:124,maxv:111,dl:.14,dq:.0065,spool:30})},  // v2 flight model: move untouched old defaults to the 6S defaults
 {v:3,run:oldDefaults({dbounce:.2,wash:1,boost:140,bgrav:5})},  // v3: Riley's mode is the default
 {v:4,run:oldDefaults({bgrav:19.5,bbounce:.68,bmax:85,bmass:.7,size:.75})},  // v4: Rocket League ball and car-to-ball scale
 {v:5,run:oldDefaults({gfric:.1})}];  // v5: real ground grip (no wheels = no ice rink)
export const SETTINGS_V=MIGRATIONS[MIGRATIONS.length-1].v;
// ---------- the schema ----------
const calOk=v=>Array.isArray(v)&&v.length===4&&v.every(c=>c&&Number.isFinite(c.a)&&Number.isFinite(c.c)&&Number.isFinite(c.s));
const btnOk=v=>v===-1||Number.isInteger(v)&&v>=0&&v<32||typeof v==='string'&&/^a\d-?$/.test(v);  // a button index or an axis used as a button ('a3', 'a3-')
const chanExtras=v=>{for(const c of v){if('r'in c&&!Number.isFinite(c.r))delete c.r;if(c.nb&&!(Number.isFinite(c.nb.a)&&Number.isFinite(c.nb.c)&&Number.isFinite(c.nb.s)))delete c.nb}return v};  // per-channel r (rest of an axis trigger) and nb (the other direction's control)
const profOk=r=>r&&RTYPES[r.type]&&Array.isArray(r.ax)&&r.ax.length===3&&r.ax.every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite));
const button=k=>field(k,v=>btnOk(v)?v:DEF[k]??-1,{if:S=>k in S});
const SCHEMA=[
 field('cal',v=>calOk(v)?v:DEF.cal.map(c=>({...c}))),field('xcal',v=>calOk(v)?v:DEF.xcal.map(c=>({...c}))),
 field('bots',v=>v===0?0:1),field('arena',v=>ARENAS[v]?v:1),
 field('loadout',v=>cleanLoadout(v)||[...STOCK]),  // drone parts [arms, chassis, power, attachment]; older saves get Stock
 field('cos',v=>cleanCos(v)),  // cosmetics {paint, decal, props, bell, led, trail}; older saves (none) and unknown ids get the stock look
 field('map',oneOf(['arena','meadow','canyon','alpine'],'arena')),field('ball',oneOf(['classic','soccer','plasma','beach'],'classic')),
 field('game',v=>typeof v==='string'&&/^[a-z0-9_]{1,16}$/.test(v)?v:'league'),  // modes register at load; setGame() falls back to League for an unknown id
 field('diff',v=>Number.isInteger(+v)&&DIFF[+v]?+v:DEF.diff),  // bot skill: any level in DIFF (Champion and Grand Champion were added after Legend)
 field('gfx',oneOf(['auto','high','med','low'],'auto')),  // graphics quality (added after v15; older saves get Auto)
 ...['vMaster','vMotor','vWind','vOther','vFx','vCrowd'].map(k=>field(k,num(0,100,100,true))),  // Audio tab volumes in %, 100 = as before
 field('osd',isTrue()),field('longline',isTrue()),  // OSD, long line (off by default)
 field('tiltAx',int(-1,8,-1)),field('tiltMin',num(-90,90,-30)),field('tiltMax',num(-90,90,60)),  // camera tilt on an axis (off by default)
 field('llLen',num(8,40,20)),field('llW',num(1,10,4)),field('llStr',oneOf(['stiff','normal','bungee'],'normal')),field('llScore',oneOf(['hoops','goals'],'hoops')),
 field('llCam',oneOf(['sling','fpv'],'sling')),field('lookBtn',int(-1,32,-1)),  // long line cable, load, scoring and view
 field('mod',v=>({...MDEF,...cleanMod(v)})),  // physics mod values
 version('physV',MIGRATIONS),
 field('presets',v=>v&&typeof v==='object'?v:{}),
 field('rprof',v=>{v=Array.isArray(v)&&v.length===3&&v.every(profOk)?v:RPROF();for(const r of v){r.thrMid=cl(+r.thrMid||50,0,100);r.thrExpo=cl(+r.thrExpo||0,0,100);r.thrLimit=cl(+r.thrLimit||100,25,100)}return v}),  // rate profiles
 field('rpi',v=>cl(v|0,0,2),{save:true}),
 // v16 controls + Calibration Lab fields (all optional except assist): assist 0..1; dzy yaw deadband (falls back to dz);
 // xboost/boostBtn boost button; per-channel r and nb in cal/xcal
 field('assist',v=>cl(+v||0,0,1)),
 field('dzy',v=>Number.isFinite(+v)?cl(+v,0,.2):DROP,{if:S=>S.dzy!=null}),
 ...['xboost','boostBtn','xfire','fireBtn','xflip','flipBtn'].map(button),
 field('cal',chanExtras),field('xcal',chanExtras),
 field('train',v=>cleanTrain(v)),  // skill training packs: best result per pack {id: {n, of, t}}; older saves start empty, malformed entries are dropped
 field('fps',v=>v===false?false:DROP,{if:S=>'fps' in S})];  // FPS meter (src/ui/fpsmeter.js): only an Off is kept (absent = on), so older saves load as before
/** the settings from a saved JSON: read() returns it (null for none; it may throw), write(S) saves (called by migrations) */
export const loadSettings=(read,write)=>loadSchema(read,DEF,SCHEMA,write);
const write=o=>{try{localStorage.setItem('droneleague',JSON.stringify(o))}catch(e){}};
export let S=loadSettings(()=>localStorage.getItem('droneleague'),write);
export const save=()=>write(S);
