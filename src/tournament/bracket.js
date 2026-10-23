/* ---------- Tournament brackets: pure rules (no DOM, no three.js), so npm test and tools/tournament-check.mjs run them in node ---------- */
/* A tournament T is built from a setup (format, size, team size, match length, pairing, the bot team-mates' level and the entrants in
   seed order) and advanced by reporting match scores; the saved form is the setup plus the results list (tournament/store.js), and
   replay() rebuilds the live bracket from it, so a reload resumes where it was. Entrants: {kind:'bot', lv: DIFF level name, skill: DIFF
   index} or {kind:'human', pilot:'p1'|'p2', name}; their index in the list is their seed (0 = top seed). Matches: {id, br: 'w' winners | 'l'
   losers | 'f' final | 'r' round robin | 's' swiss, r: round, i: index in the round, a, b: entrant indexes (null = not known yet), score:
   [goals a, goals b] | null, w: the winner's index | null, wTo / lTo: [match id, 'a' | 'b'] where the winner / loser goes, void: a bracket
   reset that is not needed}. No draws: the game's overtime settles a tie, and report() refuses a level score. */
export const FORMATS=[['single','Single elimination'],['double','Double elimination'],['rr','Round robin'],['swiss','Swiss']];
export const SIZES=[4,8,16],TEAMS=[[1,'1v1'],[2,'2v2 (bot team-mates)'],[3,'3v3 (bot team-mates)']],LENS=[[60,'1 min'],[120,'2 min'],[180,'3 min'],[300,'5 min']];
export const PAIRINGS=[['seed','Seeded (1 v 8, 4 v 5 …)'],['list','As listed (1 v 2, 3 v 4 …)'],['random','Random draw']];
export const formatName=f=>(FORMATS.find(x=>x[0]===f)||FORMATS[0])[1];
export const log2=n=>Math.round(Math.log2(n));
/** the standard bracket order of seeds for n = 2^k entrants: [0, n-1, ...], so seed 1 meets seed n and 4 meets 5 */
export function seedOrder(n){let o=[0];while(o.length<n){const m=o.length*2;o=o.flatMap(x=>[x,m-1-x])}return o}
/** mulberry32: a seeded random draw, the same every replay */
export const mulberry=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
function order(n,pairing,seed){if(pairing==='seed')return seedOrder(n);const o=Array.from({length:n},(_,i)=>i);if(pairing!=='random')return o;
 const rnd=mulberry(seed|0);for(let i=n-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[o[i],o[j]]=[o[j],o[i]]}return o}
const match=(br,r,i,a=null,b=null)=>({id:`${br}${r}-${i}`,br,r,i,a,b,score:null,w:null,wTo:null,lTo:null});
/** a new tournament from its setup: {format, size, team, len, pairing, mates, entrants, seed} (seed: the random draw's) */
export function createTournament(setup){const n=setup.size,T={format:setup.format,size:n,team:setup.team,len:setup.len,pairing:setup.pairing,mates:setup.mates,seed:setup.seed|0,
  entrants:setup.entrants.map(e=>({...e})),matches:[],rounds:0,done:false,champion:null,results:[]};
 if(T.entrants.length!==n||n<4||n>16||n&(n-1))throw new Error(`a tournament needs 4, 8 or 16 entrants, not ${T.entrants.length}`);
 const o=order(n,T.pairing,T.seed),k=log2(n),M=T.matches;
 if(T.format==='single'||T.format==='double'){
  for(let r=1;r<=k;r++)for(let i=0;i<n>>r;i++){const m=match('w',r,i);if(r===1){m.a=o[2*i];m.b=o[2*i+1]}M.push(m)}
  for(let r=1;r<k;r++)for(let i=0;i<n>>r;i++)link(T,`w${r}-${i}`,'w',`w${r+1}-${i>>1}`,i%2?'b':'a');
  if(T.format==='single'){T.rounds=k;return T}
  /* the losers' bracket: odd rounds pair the last losers' round's winners, even rounds take the winners' bracket's losers (in reverse, so
     a quad does not meet the one that just beat it); 2(k-1) rounds, then the grand final and a reset if the losers' champion wins it */
  for(let q=1;q<k;q++){const cnt=n>>(q+1);
   for(let i=0;i<cnt;i++){const m=match('l',2*q-1,i);M.push(m);if(q===1){link(T,`w1-${2*i}`,'l',m.id,'a');link(T,`w1-${2*i+1}`,'l',m.id,'b')}else{link(T,`l${2*q-2}-${2*i}`,'w',m.id,'a');link(T,`l${2*q-2}-${2*i+1}`,'w',m.id,'b')}}
   for(let i=0;i<cnt;i++){const m=match('l',2*q,i);M.push(m);link(T,`l${2*q-1}-${i}`,'w',m.id,'a');link(T,`w${q+1}-${cnt-1-i}`,'l',m.id,'b')}}
  M.push(match('f',1,0),match('f',2,0));link(T,`w${k}-0`,'w','f1-0','a');link(T,`l${2*k-2}-0`,'w','f1-0','b');T.rounds=2*k-2;return T}
 if(T.format==='rr'){const ids=o.slice();T.rounds=n-1;  /* the circle method: one stays, the rest rotate */
  for(let r=1;r<=T.rounds;r++){for(let i=0;i<n/2;i++)M.push(match('r',r,i,ids[i],ids[n-1-i]));ids.splice(1,0,ids.pop())}return T}
 if(T.format==='swiss'){T.rounds=k;const h=n/2;for(let i=0;i<h;i++)M.push(match('s',1,i,o[i],o[i+h]));return T}  /* round 1: the top half against the bottom half */
 throw new Error('unknown format '+T.format)}
function link(T,from,what,to,slot){const m=T.matches.find(x=>x.id===from);m[what==='w'?'wTo':'lTo']=[to,slot]}
export const matchById=(T,id)=>T.matches.find(m=>m.id===id)||null;
/** the matches that can be played now: both entrants known, not yet played, not a reset that is not needed */
export const playable=T=>T.done?[]:T.matches.filter(m=>m.a!=null&&m.b!=null&&!m.score&&!m.void);
/** report a score for a match; false when it cannot be taken (unknown, not playable, a draw, not two goal counts) */
export function report(T,id,score){const m=matchById(T,id);if(!m||!playable(T).includes(m)||!Array.isArray(score)||score.length!==2)return false;
 const sa=score[0]|0,sb=score[1]|0;if(sa<0||sb<0||sa===sb)return false;m.score=[sa,sb];m.w=sa>sb?m.a:m.b;const l=sa>sb?m.b:m.a;T.results.push({id,score:[sa,sb]});
 if(m.wTo){const t=matchById(T,m.wTo[0]);t[m.wTo[1]]=m.w}if(m.lTo){const t=matchById(T,m.lTo[0]);t[m.lTo[1]]=l}
 if(T.format==='single'&&!m.wTo)finish(T,m.w);
 if(T.format==='double'&&m.br==='f'){if(m.r===1){const f2=matchById(T,'f2-0');if(m.w===m.a){f2.void=true;finish(T,m.w)}else{f2.a=m.a;f2.b=m.b}}else finish(T,m.w)}
 if(T.format==='rr'&&T.matches.every(x=>x.score))finish(T,standings(T)[0].i);
 if(T.format==='swiss'&&T.matches.filter(x=>x.r===m.r).every(x=>x.score)){if(m.r>=T.rounds)finish(T,standings(T)[0].i);else swissRound(T,m.r+1)}
 return true}
function finish(T,i){T.done=true;T.champion=i}
/* the next Swiss round: by points (then opponents' points, then seed), everyone against the nearest they have not met; a leftover pairs with the next anyway */
function swissRound(T,r){const left=standings(T).map(s=>s.i),met=(a,b)=>T.matches.some(m=>m.score&&(m.a===a&&m.b===b||m.a===b&&m.b===a));let i=0;
 while(left.length){const a=left.shift();let j=left.findIndex(b=>!met(a,b));if(j<0)j=0;const b=left.splice(j,1)[0];T.matches.push(match('s',r,i++,a,b))}}
/** the standings: [{i: entrant, rank, p: played, w, l, gf, ga, pts, opp, out}], best first. Elimination: still in first, then by how far they
    got (the champion, the final's loser, ...); round robin and Swiss: points (3 a win), then opponents' points (Swiss), goal difference,
    goals for, then seed. Equal on all of that = the same rank. */
export function standings(T){const rows=T.entrants.map((e,i)=>({i,rank:0,p:0,w:0,l:0,gf:0,ga:0,pts:0,opp:0,out:0})),elim=T.format==='single'||T.format==='double',k=log2(T.size);
 for(const m of T.matches){if(!m.score)continue;const A=rows[m.a],B=rows[m.b];A.p++;B.p++;A.gf+=m.score[0];A.ga+=m.score[1];B.gf+=m.score[1];B.ga+=m.score[0];
  if(m.w===m.a){A.w++;B.l++;A.pts+=3}else{B.w++;A.l++;B.pts+=3}
  if(elim){const l=m.w===m.a?m.b:m.a,st=m.br==='w'?(T.format==='single'?m.r:0):m.br==='l'?m.r:2*k-1;rows[l].out=Math.max(rows[l].out,st)}}  /* out: the round that knocked them out (0: still in) */
 if(elim){for(const r of rows)r.stage=r.out||999;if(T.done)rows[T.champion].stage=1e3}
 else for(const r of rows)for(const m of T.matches){if(!m.score)continue;if(m.a===r.i)r.opp+=rows[m.b].pts;else if(m.b===r.i)r.opp+=rows[m.a].pts}
 const key=r=>elim?[r.stage,r.w]:[r.pts,r.opp,r.gf-r.ga,r.gf],cmp=(a,b)=>{const x=key(a),y=key(b);for(let j=0;j<x.length;j++)if(x[j]!==y[j])return y[j]-x[j];return 0};
 rows.sort((a,b)=>cmp(a,b)||a.i-b.i);rows.forEach((r,j)=>{r.rank=j&&!cmp(r,rows[j-1])?rows[j-1].rank:j+1});return rows}
/** rebuild a tournament from its setup and results (a saved one); results that do not fit are skipped */
export function replay(setup,results){const T=createTournament(setup);for(const r of results||[])report(T,r.id,r.score);return T}
/** the setup of a live tournament (what the save keeps) */
export const setupOf=T=>({format:T.format,size:T.size,team:T.team,len:T.len,pairing:T.pairing,mates:T.mates,seed:T.seed,entrants:T.entrants.map(e=>({...e}))});
/** the rounds of a bracket for the view: [{br, r, name, matches}] in bracket order */
export function roundsOf(T){const out=[],k=log2(T.size),cap=s=>s[0].toUpperCase()+s.slice(1);
 const name=(br,r)=>{if(br==='f')return r===1?'Grand final':'Bracket reset';if(br==='r')return`Round ${r}`;if(br==='s')return`Round ${r} of ${T.rounds}`;
  const left=(br==='w'?k:2*k-2)-r,n=left===0?'final':left===1?'semi-finals':left===2?'quarter-finals':`round ${r}`;return T.format==='single'?cap(n):(br==='w'?'Winners ':'Losers ')+n};
 for(const m of T.matches){let g=out.find(x=>x.br===m.br&&x.r===m.r);if(!g){g={br:m.br,r:m.r,name:name(m.br,m.r),matches:[]};out.push(g)}g.matches.push(m)}return out}
/** the two teams of a match for modes/match.js applySlots: {keys: [[blue], [orange]], skill: {key: DIFF index}}. A human entrant flies 'h'
    with bot team-mates at the tournament's mates level; a bot entrant's team all fly its level. There is one local pilot, so a human v
    human match (only a hand-edited save makes one) is flown by bots at the mates level. */
export function teamsOf(T,m){const keys=[[],[]],skill={},play=matchKind(T,m)==='play';
 for(const t of[0,1]){const e=T.entrants[t?m.b:m.a],me=play&&e.kind==='human';
  for(let i=0;i<T.team;i++){const k=me&&i===0?'h':`b${t}${i}`;keys[t].push(k);if(k!=='h')skill[k]=e.kind==='bot'?e.skill:T.mates}}return{keys,skill}}
/** the longest a simulated match stays level past its clock (s of play); then settle() decides it */
export const OT_MAX=300;
/** the score of a simulated match as the clock and OT_MAX leave it: a level score goes to the team whose attacking half the ball is in, by one goal (team 0 attacks -z; on the halfway line team 0, the first entrant); a score with a lead stands */
export const settle=(score,ballZ)=>score[0]!==score[1]?[score[0],score[1]]:ballZ>0?[score[0],score[1]+1]:[score[0]+1,score[1]];
/** a name for an entrant: the human's, or the bot's level with a letter when that level is in the list more than once */
export function entrantName(T,i){const e=T.entrants[i];if(!e)return'?';if(e.kind==='human')return e.name||(e.pilot==='p2'?'Player 2':'You');const same=T.entrants.filter(x=>x.kind==='bot'&&x.lv===e.lv);
 return same.length>1?`${e.lv} ${String.fromCharCode(65+same.indexOf(e))}`:e.lv}
export const isHuman=(T,i)=>T.entrants[i]?.kind==='human';
/** 'play' when the local pilot flies this match (one human in it), 'bots' for bots only (watch or simulate), '' while an entrant is unknown */
export const matchKind=(T,m)=>m.a==null||m.b==null?'':isHuman(T,m.a)!==isHuman(T,m.b)?'play':'bots';
