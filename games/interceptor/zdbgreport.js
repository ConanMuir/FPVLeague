/* The debug report (zdebug.js): everything a developer needs from a tester's session in one bundle. A readable summary on top, then the JSON after the marker line
   "=== JSON ===" (parse the text after it). Fields: version (git short hash and date from version.js, written by tools/version.mjs, plus when the served game files last changed and whether the stamp may be behind HEAD), env (user agent,
   GPU renderer, screen, memory), run, settings (the live settings) and save (the stored game key and the pilot profile as saved), console (the last 200 lines, errors with stacks),
   events (the last 60 s of game events), marks (F9: each with the 60 s before it), fps (one entry a second plus the live numbers), state (a snapshot of the game), cheats (what was used).
   Nothing in it is sensitive: the save holds settings, records and the pilot name the tester typed. */
import {gpuInfo} from '../../src/ui/fpsmeter.js';
import {gfx} from '../../engine/gfx.js';
import {consoleLines,consoleCount,errorCount,events,fps,wall,clock} from './zdbglog.js';
export const MARKER='=== JSON ===',SCHEMA=1,BEHIND_MS=15*60*1000;  /* the served files may be this much newer than the stamp's commit (the push and the deploy come after it) before the report says the stamp may be behind */
const r1=v=>Math.round(v*10)/10,v3=p=>p?[r1(p.x),r1(p.y),r1(p.z)]:null,tryf=(f,d=null)=>{try{return f()}catch(e){return d}};
const rd=k=>{try{const s=localStorage.getItem(k);return s==null?null:JSON.parse(s)}catch(e){return'unreadable'}};

async function versionInfo(){
 /* version.js is generated and not in git (tools/version.mjs: npm run stamp, and npm run build / npm test write it): a checkout that never made one still boots, and the report says so */
 const o={hash:'unknown',date:'',branch:'',dirty:null,pkg:'',stamp:'none (run node tools/version.mjs)'};
 const m=await import('./version.js').catch(()=>({VERSION:{hash:'unknown',date:null}}));
 if(m.VERSION&&m.VERSION.hash&&m.VERSION.hash!=='unknown'){Object.assign(o,m.VERSION);o.stamp='version.js'}
 if(!o.date)o.date='';
 /* the game files' own Last-Modified (GitHub Pages sets it to the deploy time): well past the stamp's date means newer commits are being served than the stamp names. A local server sends none: then it is not judged */
 try{const r=await fetch(new URL('interceptor.js',import.meta.url),{method:'HEAD',cache:'no-store'}),lm=r.headers.get('last-modified')||'',t=Date.parse(lm),s=Date.parse(o.date);
  o.served={interceptor:lm};o.stampBehind=Number.isFinite(t)&&Number.isFinite(s)?t-s>BEHIND_MS:null}catch(e){}
 return o}

function counts(list){const by={};for(const k of list)by[k]=(by[k]|0)+1;return by}
function snapshot(api,G,Z,D){
 const {TH,SITES,S}=api,me=api.player,out={},sect=(n,f)=>{try{out[n]=f()}catch(e){out[n]={error:String(e&&e.message||e)}}};
 const live=TH.filter(api.live);
 sect('game',()=>({on:G.on,state:G.state,wave:G.wave,waveTime:r1(G.wt||0),cash:Math.round(G.cash),earned:Math.round(G.earned),kills:{...G.kills},streak:G.streak,perfect:G.perfect,best:G.best,
  difficulty:Z.diff?.().n,doctrine:G.doc,kit:G.kit,perks:{...G.perks},charges:{...G.ch},supplies:{...G.sup},trophies:Object.keys(G.brw||{}),weather:api.WX?.id||null,integrity:Z.integrity?.(),
  campaign:Z.cp?.run?{id:Z.cp.run.id??Z.cp.run.sec??null,endless:!!Z.cp.run.endless}:null,online:!!Z.online,demo:!!api.demo,menuOpen:!!api.menuOpen}));
 sect('player',()=>me?{alive:me.dead<=0,dead:r1(me.dead),pos:v3(me.p),vel:v3(me.v),speed:r1(me.v.length()),agl:r1(me.p.y-api.gh(me.p.x,me.p.z)),mah:Math.round(me.mah),bcap:Math.round(api.BCAP),
  battery:r1(100*(1-me.mah/api.BCAP)),cellV:r1(me.vc),throttle:r1(me.thr||0),burn:Z.rk?{t:r1(Z.rk.st.t),armed:!!Z.rk.st.armed}:null,home:me.home?.n||null,camMode:api.camMode,camUp:!!api.camUp,thermal:!!api.thermLook,
  weapon:Z.ars?Z.ars.cur():null,swarmDrones:Z.sw?.drones?.length|0,lock:Z.lk?.t?Z.tname(Z.lk.t):null}:null);
 sect('sites',()=>SITES.map(s=>({n:s.n,hp:Math.round(s.hp),max:s.max})));
 sect('defences',()=>Z.def.D.map(d=>({type:d.type,slot:d.slot,tier:d.tier,lvl:d.lvl,kills:d.kills,ammo:d.ammo,ready:d.ready,by:d.by||undefined})));
 sect('tracks',()=>({live:live.length,total:TH.length,byKind:counts(live.map(t=>t.k)),sample:live.slice(0,40).map(t=>({id:t.id,k:t.k,pos:v3(t.p),spd:Math.round(t.spd),st:t.st,target:t.tgt?.n,dmg:!!t.dmg,claimed:!!t.claim}))}));
 sect('plan',()=>({queued:counts((G.wq||[]).map(q=>q.k.split(':')[0])),queueLeft:(G.wq||[]).length,next:G.next?{list:counts(G.next.list.map(s=>s.split(':')[0])),raids:G.next.brgs?.map(b=>r1(b*57.3)),weather:G.next.wx?.id||null}:null}));
 sect('bosses',()=>(Z.bosses?.encs||[]).map(e=>{const b=e.main?.bs||{};return{id:e.id,over:!!e.over,won:!!e.won,hp:b.hp,max:b.max,phase:b.ph,phaseName:e.D?.phases?.[b.ph]||null,age:r1(b.age||0)}}));
 sect('radio',()=>Z.radio?{calls:Z.radio.calls.slice(-8).map(c=>`${c.who}: ${c.txt}`),made:Z.radio.st.made,played:Z.radio.st.played,errors:Z.radio.err?String(Z.radio.err):null}:null);
 sect('net',()=>({role:Z.netRole?.()||'solo',pilots:Z.pilots?.()?.length||1,name:S.zname||null}));
 sect('spectator',()=>({on:!!window.__z?.spec?.on,bench:!!window.__z?.spec?.sp?.bench}));
 sect('perf',()=>({tick:api.tick,frames:fps.frames,governorMs:r1(Z.perf?.ema||0),drawCalls:fps.calls,triangles:fps.tris,gfx:{level:gfx.level,pref:gfx.pref,scale:r1(gfx.scale||1)},
  gl:{geometries:api.renderer?.info.memory.geometries,textures:api.renderer?.info.memory.textures},heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null}));
 sect('debug',()=>({marked:D.marked,god:D.god,timeScale:D.ts,paused:D.paused,unlockShop:D.unlock,unlockCodex:D.codex,instantLock:D.instlock,reverted:D.reverted|0}));
 return out}

export async function buildReport(api,G,Z,D){
 const now=performance.now(),S=api.S,gl=tryf(()=>api.renderer.getContext()),g=gl?tryf(()=>gpuInfo(gl),{}):{};
 const data={schema:SCHEMA,generated:new Date().toISOString(),uptime:r1(now/1000),version:await versionInfo(),
  env:{userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,cores:navigator.hardwareConcurrency||null,deviceMemoryGB:navigator.deviceMemory||null,
   screen:{w:screen.width,h:screen.height,dpr:devicePixelRatio},viewport:{w:innerWidth,h:innerHeight},url:location.href,automated:!!navigator.webdriver,
   gpu:{name:g.name||'',igpu:!!g.igpu,renderer:g.raw||''},webgl2:!!(gl&&typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext)},
  run:{marked:D.marked,why:D.cheats.length?[...new Set(D.cheats.map(c=>c.name))]:[],wave:G.wave,state:G.state},
  settings:JSON.parse(JSON.stringify(S)),
  save:{'dl-interceptor':rd('dl-interceptor'),droneleague:rd('droneleague')},
  console:{total:consoleCount(),errors:errorCount(),lines:consoleLines(200)},
  events:events(60000).map(e=>({...e,at:clock(e.t)})),
  marks:D.marks.map(m=>({...m})),
  fps:{now:fps.now(),history:fps.hist.slice(),frames:fps.frames},
  state:snapshot(api,G,Z,D),
  cheats:D.cheats.map(c=>({...c}))};
 return{data,text:summary(data)+'\n'+MARKER+'\n'+JSON.stringify(data,null,1)}}

function summary(d){
 const v=d.version,L=[],c=d.console.lines.filter(l=>l.lvl==='error'),e=c[c.length-1];
 L.push(`DRONE LEAGUE INTERCEPTOR DEBUG REPORT (schema ${d.schema})`);
 L.push(`Generated ${d.generated} (local ${clock(performance.now())}), page open ${d.uptime} s`);
 L.push(`Build ${v.hash==='unknown'?'unknown (run node tools/version.mjs)':v.hash}${v.date?` of ${v.date}`:''}${v.branch?` on ${v.branch}`:''}${v.dirty?' (uncommitted changes)':''}, package ${v.pkg||'?'}${v.hash==='unknown'?'':`, stamp ${v.stamp}`}${v.served?.interceptor?`, game files served ${v.served.interceptor}`:''}`);
 if(v.stampBehind)L.push('!! The stamp may be behind HEAD: the served game files are newer than the stamp\'s date, so this build may include later commits than the hash above.');
 L.push(`Browser ${d.env.userAgent}`);
 L.push(`GPU ${d.env.gpu.renderer||d.env.gpu.name||'unknown'}${d.env.gpu.igpu?' (integrated or software)':''}; screen ${d.env.screen.w}x${d.env.screen.h} @${d.env.screen.dpr}, viewport ${d.env.viewport.w}x${d.env.viewport.h}`);
 const g=d.state.game||{};
 L.push(`Run: wave ${g.wave} (${g.state}), ${g.difficulty||'?'}, cash ${g.cash}, ${d.state.net?.role||'solo'}${d.run.marked?`, DEBUG RUN (${d.run.why.join(', ')||'marked'})`:''}`);
 L.push(`FPS now ${d.fps.now.fps} (frame p99 ${d.fps.now.p99} ms, worst ${d.fps.now.max} ms); ${d.fps.history.length} s of history`);
 L.push(`Console: ${d.console.total} lines, ${d.console.errors} errors${e?`; last error: ${e.msg.slice(0,160)}`:''}`);
 L.push(`Events in the last 60 s: ${d.events.length}`);
 if(d.marks.length)for(const m of d.marks)L.push(`Mark #${m.n} at ${m.clock} (wave ${m.wave}, ${m.state}): ${m.note||'(no note)'}`);
 if(d.cheats.length)L.push(`Cheats used (${d.cheats.length}): ${d.cheats.slice(-12).map(x=>`${x.clock} ${x.name}${x.args?.length?`(${x.args.join(',')})`:''}`).join('; ')}`);
 return L.join('\n')}

/* the report as files: the text (summary + JSON) and, when asked, a screenshot of the game canvas */
export function fileName(d,ext){const t=d.generated.replace(/[:.]/g,'-').slice(0,19);return`drone-league-debug-${d.version.hash}-${t}.${ext}`}
export function download(name,blob){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.style.display='none';document.body.append(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(u)},4000);return name}
export async function copy(text){
 try{await navigator.clipboard.writeText(text);return'clipboard'}catch(e){}
 try{const t=document.createElement('textarea');t.value=text;t.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(ok)return'clipboard'}catch(e){}
 return''}
/* a PNG of the game canvas: called from a requestAnimationFrame callback so the frame has just been drawn */
export const shot=api=>new Promise(res=>requestAnimationFrame(()=>{try{res(api.renderer.domElement.toDataURL('image/png'))}catch(e){res('')}}));
export const dataBlob=u=>{const b=atob(u.split(',')[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Blob([a],{type:'image/png'})};
