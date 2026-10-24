/* Debug recorders for the debug mode (zdebug.js): what a tester's report is made of. Loaded first by interceptor.js, so nothing before the panel is missed.
   Console ring buffer: the last 200 console lines (log / info / warn / error / debug), errors with their stacks, uncaught errors and rejected promises.
   It wraps the console methods, so it is installed only when debug mode is wanted (?debug=1 in the URL, the save's zdbg flag, never in an automated
   browser without the URL flag) or when the panel is enabled later; a normal player's console is untouched.
   Event log: the last 90 s of game events (wave edges, kills, purchases, boss phases, deaths, radio calls, cheats, marks), filled by zdebug.js.
   Frame sampler: every drawn frame's interval from the shared sampler (src/ui/fpsmeter.js): the FPS history (one entry a second), the 99th percentile and the draw calls.
   Nothing here draws, and nothing changes the game. */
import {onFrame} from '../../src/ui/fpsmeter.js';
export const CON_MAX=200,EVT_MS=90000,EVT_MAX=800,HIST_MAX=240,RING=600;
const T0=performance.timeOrigin||Date.now()-performance.now();
export const wall=t=>new Date(T0+t).toISOString();
export const clock=t=>{const d=new Date(T0+t),p=n=>String(n).padStart(2,'0');return`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};

/* ---------- the console ring buffer ---------- */
const con=[];let cn=0,installed=false;
const fmt1=a=>{
 if(typeof a==='string')return a;
 if(a instanceof Error)return`${a.name}: ${a.message}`;
 if(a===null||a===undefined||typeof a==='number'||typeof a==='boolean'||typeof a==='bigint')return String(a);
 if(typeof a==='function')return`[function ${a.name||''}]`;
 if(typeof a==='symbol')return a.toString();
 try{const p=Object.getPrototypeOf(a);if(p===Object.prototype||p===null||Array.isArray(a))return JSON.stringify(a).slice(0,300)}catch(e){}
 try{return`[${a.constructor?.name||'object'}]`}catch(e){return'[object]'}};
const stackOf=(args,skip)=>{const e=args.find(a=>a instanceof Error);let s=e?.stack||new Error().stack||'';if(!e)s=s.split('\n').slice(skip).join('\n');return s.split('\n').slice(0,10).join('\n').slice(0,1500)};
function push(lvl,msg,stack){const e={t:Math.round(performance.now()),lvl,msg:String(msg).slice(0,600)};if(stack)e.stack=stack;con[cn++%CON_MAX]=e}
function hook(lvl,args){const m=args.map(fmt1).join(' ');push(lvl,m,lvl==='error'||lvl==='warn'?stackOf(args,4):'')}
export function install(){
 if(installed)return false;installed=true;
 for(const lvl of['log','info','warn','error','debug']){const o=console[lvl];if(typeof o!=='function')continue;console[lvl]=function(...a){try{hook(lvl,a)}catch(e){}return o.apply(this,a)}}
 addEventListener('error',e=>{try{push('error',`uncaught: ${e.message||e.error||'error'}${e.filename?` at ${String(e.filename).split('/').pop()}:${e.lineno}:${e.colno}`:''}`,String(e.error?.stack||'').split('\n').slice(0,10).join('\n').slice(0,1500))}catch(x){}});
 addEventListener('unhandledrejection',e=>{try{const r=e.reason;push('error',`unhandled rejection: ${r instanceof Error?`${r.name}: ${r.message}`:fmt1(r)}`,String(r?.stack||'').split('\n').slice(0,10).join('\n').slice(0,1500))}catch(x){}});
 return true}
export const consoleLines=(n=CON_MAX)=>{const L=cn<=CON_MAX?con.slice():[...con.slice(cn%CON_MAX),...con.slice(0,cn%CON_MAX)];return L.slice(-n)};
export const consoleCount=()=>cn;
export const errorCount=()=>con.reduce((a,e)=>a+(e.lvl==='error'?1:0),0);
export const consoleClear=()=>{con.length=0;cn=0};
/* debug mode wanted at load: ?debug=1 in the URL, or the save's flag (an automated browser only with the URL flag) */
export const wanted=()=>{try{const q=new URLSearchParams(location.search).get('debug');if(q==='1')return true;if(q==='0'||navigator.webdriver)return false;return JSON.parse(localStorage.getItem('dl-interceptor')||'{}').zdbg===1}catch(e){return false}};
if(wanted())install();

/* ---------- the game-event log ---------- */
const EV=[];let ctxf=null;
export const setCtx=f=>{ctxf=f};
export function ev(type,msg,data){const t=Math.round(performance.now()),e={t,type,msg:String(msg).slice(0,200)};if(data!==undefined)e.data=data;if(ctxf){try{Object.assign(e,ctxf())}catch(x){}}
 EV.push(e);while(EV.length&&t-EV[0].t>EVT_MS||EV.length>EVT_MAX)EV.shift();return e}
export const events=(ms=60000,upTo=Infinity)=>{const t=performance.now();return EV.filter(e=>t-e.t<=ms&&e.t<=upTo)};
export const eventClear=()=>{EV.length=0};

/* ---------- the frame sampler ---------- */
const R=new Float32Array(RING);
export const fps={frames:0,hist:[],calls:0,tris:0,probe:null,extra:null,unsub:null,n:0,acc:0,accN:0,accMax:0,
 start(){if(fps.unsub)return;fps.unsub=onFrame((ms)=>{R[fps.frames++%RING]=ms;fps.acc+=ms;fps.accN++;if(ms>fps.accMax)fps.accMax=ms;try{fps.probe?.()}catch(e){}
  if(fps.acc>=1000){const o={t:Math.round(performance.now()/100)/10,fps:Math.round(fps.accN*1000/fps.acc),p99:+fps.p99().toFixed(1),max:+fps.accMax.toFixed(1),calls:fps.calls};
   try{Object.assign(o,fps.extra?.())}catch(e){}fps.hist.push(o);if(fps.hist.length>HIST_MAX)fps.hist.shift();fps.acc=fps.accN=fps.accMax=0}})},
 stop(){fps.unsub?.();fps.unsub=null},
 /* the 99th percentile of the last (up to 600) frame intervals, in ms */
 p99(){const n=Math.min(fps.frames,RING);if(!n)return 0;const a=Array.from(R.subarray(0,n)).sort((x,y)=>x-y);return a[Math.min(n-1,Math.floor(n*.99))]},
 now(){const n=Math.min(fps.frames,RING);if(!n)return{fps:0,avg:0,p99:0,max:0};let s=0,m=0;for(let i=0;i<n;i++){s+=R[i];if(R[i]>m)m=R[i]}return{fps:Math.round(1000/(s/n)),avg:+(s/n).toFixed(1),p99:+fps.p99().toFixed(1),max:+m.toFixed(1)}}};
