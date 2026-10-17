// Settings: each game keeps its own browser key; the pilot profile (radio and Xbox calibration, rates, camera, flight mode, fire switch) is shared
// under the Drone League key, so a radio calibrated in one game is calibrated in all of them
export const S={};
const SHARED='droneleague',PILOT=['mode','tilt','fov','thrMode','dz','cal','xcal','fireBtn','xfire','fireInv','rprof','rpi'];
export const PILOT_DEF={mode:"acro",tilt:30,fov:110,thrMode:"full",cal:[{"a":2,"c":0.0275,"s":-0.7922},{"a":5,"c":-0.0431,"s":0.7843},{"a":1,"c":0.0431,"s":-0.8392},{"a":0,"c":-0.0039,"s":0.8235}],dz:0.03,fireBtn:5,xfire:7,xcal:[{a:1,c:0,s:-1,m:'spring'},{a:0,c:0,s:1},{a:3,c:0,s:-1},{a:2,c:0,s:1}]};
let KEY=SHARED;
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(e){return{}}};
const okCal=a=>Array.isArray(a)&&a.length===4&&a.every(c=>c&&Number.isFinite(c.a)&&Number.isFinite(c.c)&&Number.isFinite(c.s));
export function loadSettings(key,DEF){KEY=key;const own=read(key),sh=key===SHARED?{}:read(SHARED),P={};for(const k of PILOT)if(k in sh)P[k]=sh[k];
 Object.assign(S,PILOT_DEF,DEF,own,P);
 if(!okCal(S.cal))S.cal=(DEF.cal||PILOT_DEF.cal).map(c=>({...c}));if(!okCal(S.xcal))S.xcal=(DEF.xcal||PILOT_DEF.xcal).map(c=>({...c}));return S}
export const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S));if(KEY!==SHARED){const sh=read(SHARED);for(const k of PILOT)if(k in S)sh[k]=S[k];localStorage.setItem(SHARED,JSON.stringify(sh))}}catch(e){}};
