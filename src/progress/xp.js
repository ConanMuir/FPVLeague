// ---------- XP: levels, match XP and training XP (pure rules: no DOM, no three.js, so npm test checks them) ----------
// Match XP (League, Dogfight: any mode with a clock and opponents) = base + win + performance, from YOUR events only:
//  base         40 x L                           L = match length factor: played seconds / 180, clamped to 0.4..1.67
//  win          60 x L x D                       D = difficulty: the opponents' bot level (DIFF_F), 1.15 with a human opponent online
//  performance  CAP x (1 - e^(-raw x D / CAP))   raw = XPW weights x your counts (shots and pops counted up to CAPS); CAP = 200,
//               so each extra goal is worth less than the one before (diminishing returns per match; never more than CAP)
// Nothing at all without opponents (No bots alone: no goal farming) or when idle (fewer than 3 ball touches, 3 hits or a goal/kill:
// no XP for idling while bot team-mates play). Own goals, Freeplay and the attract demo give none; a left match gives no XP.
// Training XP (packXp): only for doing better than your saved best: newly done shots, the first full clear, a 5% faster best.
export const XPW={goal:25,assist:15,save:15,shot:4,demo:10,pop:3,chain:12,aerial:15,adrib:30,popg:10,clean:20,kill:20,turret:8};
export const CAPS={shots:8,pops:15},PERF_CAP=200,BASE=40,WIN=60;
// difficulty factor per DIFF level (Rookie .. Grand Champion, Dribbler, Freestyler: the two show-off bots count as Legend / All-Star+)
export const DIFF_F=[.6,.75,.9,1,1.15,1.3,1,1.1],HUMAN_F=1.15;
const cl=(v,a,b)=>v<a?a:v>b?b:v;
export const lenF=sec=>cl((+sec||0)/180,.4,5/3);
// ---- levels: XP for the next level grows 60 per level from 300, up to 1200 per level from level 16; level 99 is the top
export const MAX_LV=99,need=lv=>Math.min(1200,300+60*(lv-1));
export function levelOf(xp){xp=Math.max(0,Math.floor(+xp||0));let lv=1,left=xp;while(lv<MAX_LV&&left>=need(lv)){left-=need(lv);lv++}
 const n=lv<MAX_LV?need(lv):0;return{lv,into:left,need:n,frac:n?left/n:1}}
export const xpFor=lv=>{let x=0;for(let l=1;l<lv&&l<MAX_LV;l++)x+=need(l);return x};  // total XP at the start of level lv
// ---- match XP. r: the match record (progress/match-rec.js counts); c: {played: s, won, df: difficulty factor, opp: opponents}
export const isActive=r=>r.touches>=3||r.goals>0||r.hits>=3||r.kills>0;
const PERF=[['goals','goal','Goals'],['assists','assist','Assists'],['saves','save','Saves'],['shots','shot','Shots on target'],['demos','demo','Demolitions'],
 ['pops','pop','Pops on the ball'],['chainSteps','chain','Pop chains'],['aerial','aerial','Aerial goals'],['adrib','adrib','Air dribble goals'],['popg','popg','Pop goals'],
 ['clean','clean','Clean sheet'],['kills','kill','Kills'],['turrets','turret','Turrets destroyed']];
export function matchXp(r,c){const out={total:0,items:[],notes:[],active:isActive(r),eligible:c.opp>0,df:+(c.df||1).toFixed(2),raw:0};
 if(!out.eligible){out.notes.push('No opponents: no XP');return out}
 if(!out.active){out.notes.push('No XP for idling: touch the ball or hit a target a few times');return out}
 const L=lenF(c.played),base=Math.round(BASE*L),win=c.won?Math.round(WIN*L*out.df):0;out.items.push({k:'base',n:'Match played',xp:base});if(win)out.items.push({k:'win',n:'Victory',xp:win});
 const parts=[];let raw=0;for(const[k,w,n]of PERF){const v=Math.min(r[k]||0,CAPS[k]??1e9);if(v>0){const p=v*XPW[w];raw+=p;parts.push({k,n,c:r[k],p})}}
 out.raw=raw;const perf=Math.round(PERF_CAP*(1-Math.exp(-raw*out.df/PERF_CAP)));
 // the performance XP split over its sources in proportion (largest remainder, so the rows add up to it exactly)
 if(perf>0){const sh=parts.map(x=>perf*x.p/raw);let left=perf-sh.reduce((a,v)=>a+Math.floor(v),0);const ord=sh.map((v,i)=>[v-Math.floor(v),i]).sort((a,b)=>b[0]-a[0]);
  const xs=sh.map(Math.floor);for(let j=0;left>0;j++,left--)xs[ord[j%ord.length][1]]++;parts.forEach((x,i)=>{if(xs[i]>0)out.items.push({k:x.k,n:x.n,c:x.c,xp:xs[i]})})}
 if(out.df!==1)out.notes.push(`Opponents ×${out.df}`);if(raw*out.df>PERF_CAP*.5)out.notes.push('Diminishing returns on a big game');
 out.total=out.items.reduce((a,x)=>a+x.xp,0);return out}
// ---- training XP: prev = the saved best before this run ({n, of, t} or null), cur = this run's {n, of, t}, tier 0..2
export function packXp(prev,cur,tier){const out={total:0,items:[]},k=1+.5*(tier|0),pn=prev?.n||0,full=cur.n>=cur.of&&cur.n>0;
 const fresh=Math.max(0,cur.n-pn);if(fresh)out.items.push({k:'shots',n:'New shots done',c:fresh,xp:fresh*Math.round(10*k)});
 if(full&&!(prev&&prev.n>=prev.of))out.items.push({k:'clear',n:'Pack cleared',xp:40*(1+(tier|0))});
 else if(prev&&!fresh&&cur.n===pn&&cur.n>0&&cur.t<prev.t*.95)out.items.push({k:'time',n:'5% faster best time',xp:10});
 out.total=out.items.reduce((a,x)=>a+x.xp,0);return out}
