// ---------- One match as seen from your own drone: counts built from game events (pure: progress/tracker.js feeds it plain values) ----------
// Only events about YOUR drone (ctx.key) count for you: your goals, saves, shots, demos, pops, kills. Other pilots' events only matter
// for assists (a team-mate scoring right after your touch), breaking your pop chain / air dribble, and the score.
//  pop chain:   pops that hit the ball in a row (each within CHAIN_GAP s of the last, nobody else touching, the ball not landing)
//  air dribble: 3+ touches of yours with the ball at least AIR_Y m up, each within 1.5 s, over ADRIB_T s or more, then you score within 2.5 s
//  aerial goal: your last touch before the goal was at least AERIAL_Y m up; pop goal: it was during a pop (both within POPGOAL_T s)
//  assist:      the touch before the scorer's (on your team, not the scorer's own) was yours, within ASSIST_T s of the goal
export const REC_KEYS=['touches','goals','og','assists','saves','shots','demos','pops','chains','chainSteps','aerial','adrib','popg','kills','deaths','turrets','hits','conceded'];
export const AIR_Y=2.5,AERIAL_Y=4,CHAIN_GAP=3,ASSIST_T=8,POPGOAL_T=4,ADRIB_T=.75;
// ctx: {mode, key: your drone's key, team: your team}
export function newRec(ctx){const r={ctx:{...ctx},score:[0,0],maxDef:0,log:[],chain:0,chainT:-1e9,bestChain:0,armed:false,air:{n:0,t0:0,t:-1e9},last:null};for(const k of REC_KEYS)r[k]=0;return r}
const mine=(r,k)=>k!=null&&k===r.ctx.key;
// a ball touch. e: {key, team, t: match time (s), y: contact height (m), pop: that drone is mid-pop}
export function recTouch(r,e){r.log.push({key:e.key,team:e.team,t:e.t});if(r.log.length>16)r.log.shift();
 if(!mine(r,e.key)){r.chain=0;r.air.n=0;return}
 r.touches++;
 if(e.pop&&r.armed){r.armed=false;r.pops++;r.chain=r.chain>0&&e.t-r.chainT<=CHAIN_GAP?r.chain+1:1;r.chainT=e.t;if(r.chain>=2){r.chainSteps++;if(r.chain===2)r.chains++}if(r.chain>r.bestChain)r.bestChain=r.chain}
 if(e.y>=AIR_Y){if(r.air.n>0&&e.t-r.air.t<=1.5)r.air.n++;else{r.air.n=1;r.air.t0=e.t}r.air.t=e.t}else r.air.n=0;
 r.last={t:e.t,y:e.y,pop:!!e.pop}}
// you fired a pop (its first touch on the ball counts once, however many contact steps it lasts)
export function recPop(r,key){if(mine(r,key))r.armed=true}
// the ball landed on the floor: chains and air dribbles end
export function recFloor(r){r.chain=0;r.air.n=0}
// a goal. e: {team: scoring team, by: key of the last toucher | null, t}
export function recGoal(r,e){const T=e.team,me=r.ctx.team;r.score[T]++;
 if(T!==me){r.conceded++;r.maxDef=Math.max(r.maxDef,r.score[T]-r.score[me])}
 if(mine(r,e.by)){if(T===me){r.goals++;const l=r.last;if(l&&e.t-l.t<=POPGOAL_T){if(l.y>=AERIAL_Y)r.aerial++;if(l.pop)r.popg++}
  if(r.air.n>=3&&r.air.t-r.air.t0>=ADRIB_T&&e.t-r.air.t<=2.5)r.adrib++}else r.og++}
 else if(T===me&&e.by!=null){let i=r.log.length-1;while(i>=0&&r.log[i].key!==e.by)i--;const s=r.log[i];while(i>=0&&r.log[i].key===e.by)i--;const a=r.log[i];
  if(s&&s.team===me&&a&&mine(r,a.key)&&a.team===me&&e.t-a.t<=ASSIST_T)r.assists++}
 r.log.length=0;r.chain=0;r.air.n=0;r.last=null}
export function recSave(r,key){if(mine(r,key))r.saves++}
export function recShot(r,key){if(mine(r,key))r.shots++}
// a demolition (victim / by: {key, team})
export function recDemo(r,v,by){if(by&&mine(r,by.key)&&v.team!==r.ctx.team)r.demos++}
// Dogfight: a kill (victim {key, team, turret}) / a bullet hit; by: the shooter's key
export function recKill(r,v,by){if(mine(r,v.key))r.deaths++;else if(mine(r,by)&&v.team!==r.ctx.team){if(v.turret)r.turrets++;else r.kills++}}
export function recHit(r,v,by){if(mine(r,by)&&v.team!==r.ctx.team)r.hits++}
// the counts of a match (what the profile adds up)
export function recCounts(r){const o={};for(const k of REC_KEYS)o[k]=r[k];return o}
// the end of the match. e: {winner, overtime, mode, oppBots, mateBots, diffs: the opponent bots' levels}
// returns the feats (match-level achievements) this match earned
export function recFeats(r,e){const won=e.winner===r.ctx.team,lg=r.ctx.mode==='league',vsBots=e.oppBots&&!e.mateBots&&e.diffs.length>0;
 return{won,clean:won&&lg&&r.conceded===0?1:0,comeback:won&&r.maxDef>=2?1:0,ot:won&&e.overtime?1:0,
  champ:won&&lg&&vsBots&&e.diffs.every(d=>d===4||d===5)?1:0,gc:won&&lg&&vsBots&&e.diffs.every(d=>d===5)?1:0}}
