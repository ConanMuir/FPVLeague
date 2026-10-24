// Settings: each game keeps its own browser key; the pilot profile (radio and Xbox calibration, rates, camera, flight mode, fire switch) is shared
// under the Drone League key, so a radio calibrated in one game is calibrated in all of them
export const S={};
const SHARED='droneleague',PILOT=['mode','tilt','fov','thrMode','dz','cal','xcal','fireBtn','xfire','fireInv','xflip','flipBtn','rprof','rpi'];
export const PILOT_DEF={mode:"acro",tilt:30,fov:110,thrMode:"full",cal:[{"a":2,"c":0.0275,"s":-0.7922},{"a":5,"c":-0.0431,"s":0.7843},{"a":1,"c":0.0431,"s":-0.8392},{"a":0,"c":-0.0039,"s":0.8235}],dz:0.03,fireBtn:5,xfire:7,xflip:1,flipBtn:-1,xcal:[{a:1,c:0,s:-1,m:'spring'},{a:0,c:0,s:1},{a:3,c:0,s:-1},{a:2,c:0,s:1}]};
// Button / switch bindings in the shared profile are stored in Drone League's form (src/config/settings.js): a button index, -1 for none,
// 'aN' = axis N above +0.5, 'aN-' = axis N below -0.5. The engine's own form (input.js swOn) writes the low side as '-aN' and a learned
// switch as 'aN>m' / 'aN<m' (past the midpoint m). save() writes the shared profile in Drone League's form ('aN>m' becomes 'aN', 'aN<m'
// becomes 'aN-'); this game's own key keeps the exact value, and loadSettings uses it while the shared value is still its reduction.
// loadSettings reads either form (older saves of this engine wrote its own form into the shared profile).
const BTNK=['fireBtn','flipBtn','xfire','xflip'],BRE=/^(-?)a(\d+)(-?)(?:([<>])(-?[\d.]+))?$/;
export const toLeague=b=>{const m=typeof b==='string'&&BRE.exec(b);return m?'a'+m[2]+(m[1]||m[3]||m[4]==='<'?'-':''):b};
export const fromLeague=b=>{const m=typeof b==='string'&&/^a(\d+)-$/.exec(b);return m?'-a'+m[1]:b};
const leagueBtns=o=>{const r={...o};for(const k of BTNK)if(k in r)r[k]=toLeague(r[k]);return r};
let KEY=SHARED;
const read=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(e){return{}}};  // a save that is a number, a string or a list is not a save: `k in own` threw on it and the page never came up
const okCal=a=>Array.isArray(a)&&a.length===4&&a.every(c=>c&&Number.isFinite(c.a)&&Number.isFinite(c.c)&&Number.isFinite(c.s));
// local: pilot fields this game keeps to itself (e.g. a camera tilt that only suits its airframe)
let LOCAL=[];
export function loadSettings(key,DEF,local=[]){KEY=key;LOCAL=local;const own=read(key),sh=key===SHARED?{}:read(SHARED),P={};for(const k of PILOT)if(k in sh&&!local.includes(k))P[k]=sh[k];
 for(const k of BTNK)if(k in P&&k in own&&toLeague(own[k])===toLeague(P[k]))P[k]=own[k];  // the shared value is this game's exact binding, reduced: keep the exact one
 Object.assign(S,PILOT_DEF,DEF,own,P);for(const k of BTNK)if(k in S)S[k]=fromLeague(S[k]);
 if(!okCal(S.cal))S.cal=(DEF.cal||PILOT_DEF.cal).map(c=>({...c}));if(!okCal(S.xcal))S.xcal=(DEF.xcal||PILOT_DEF.xcal).map(c=>({...c}));return S}
/* hooks.persist(S) -> the object a game's own key is written from (default: S itself). The debug mode (games/interceptor/zdebug.js) keeps a debug run's progress out of the save with it */
export const hooks={};
export const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(KEY===SHARED?leagueBtns(S):hooks.persist?hooks.persist(S):S));if(KEY!==SHARED){const sh=read(SHARED);for(const k of PILOT)if(k in S&&!LOCAL.includes(k))sh[k]=BTNK.includes(k)?toLeague(S[k]):S[k];localStorage.setItem(SHARED,JSON.stringify(sh))}}catch(e){}};
