// Zombies bot roaming: where the real pilot (zbotfly.js) waits for the next track when nothing is in reach, so it is out over the ground instead of
// hovering at the base. It reads the raids (the wave queue and the live tracks) as bearings, scores the map's stations (zbotmap.js: ridges, the river
// valley, villages, the sites, forward positions, and an intercept line on each bearing) by how well they cover those bearings, how far out they are
// and how little the bot has seen of them, flies there at the station's height, and orbits it until the picture changes. With no raid in sight it
// tours places it has not flown over yet. It hands the pilot a point to fly to and the words for the HUD line; the pilot still decides to chase.
// Skill: F (the level's fly profile) only scales its cruise speed; P.explore (zbotbrain.js LEVELS) says whether the level roams at all.
const cl=(v,a,b)=>v<a?a:v>b?b:v;
export function createRoam(E,B,F){
 const {api,G,KIND}=E,M=B.map,SC=M.SC,gh=api.gh;
 const R={cur:null,since:0,arr:0,dwell:12,ph:Math.random()*6.283,axes:[],inb:0,sig:'',sigPick:'',axT:-9,wantRelaunch:false,legs:0,txT:-9,txS:null,
  out:{x:0,y:0,z:0,speed:60,floor:30,kind:'station',why:'',what:'',label:'',st:null}};
 /* the raids as bearings: the queued spawns (they come in from the edge at their bearing) and the live tracks outside the defended area; the fast
    missiles are left out (they are the kill chain's and the line-sitter's business, and nobody waits for them on a ridge) */
 function scan(){const A=new Map();let inb=0;const add=(b,w)=>{const k=Math.round(b/.3);let a=A.get(k);if(!a)A.set(k,a={b,w:0,n:0});a.b=(a.b*a.w+b*w)/(a.w+w);a.w+=w;a.n++};
  for(const q of G.wq||[]){const[k,c]=q.k.split(':'),K=KIND[k];if(!K)continue;inb+=+c||1;if(K.armor!=='hard')add(q.brg,(K.pts||1)*(+c||1))}  /* a boss is worth 0 points: weigh it as one, or its bearing is 0/0 (NaN) and no station scores */
  for(const t of api.TH){if(!api.live(t))continue;inb++;const K=KIND[t.k];if(!K||K.armor==='hard')continue;const px=t.p.x-SC.x,pz=t.p.z-SC.z;if(Math.hypot(px,pz)<1300)continue;add(Math.atan2(px,-pz),K.pts||1)}
  R.axes=[...A.values()];R.inb=inb;R.sig=R.axes.filter(a=>a.w>2).map(a=>Math.round(a.b/.3)).sort().join(',')}
 function pick(me){const s=M.pick({axes:R.axes,from:me.p,cur:R.cur,AW:api.AW||4300,now:B.t,noise:.25});
  if(!s)return;R.cur=s;R.since=B.t;R.arr=0;R.sigPick=R.sig;R.dwell=(R.axes.length?13:9)+Math.random()*(R.axes.length?10:7);R.legs++}
 /* the point to fly to now. me: the interceptor; returns the shared out object. */
 R.nav=(me,dt)=>{const t=B.t;if(t-R.axT>1.5){R.axT=t;scan()}
  if(!R.cur||(R.arr?t-R.arr>R.dwell:t-R.since>70)||(R.axes.length&&R.sig!==R.sigPick&&t-R.since>6&&(R.arr||t-R.since>6)))pick(me);
  const s=R.cur,o=R.out,p=me.p,d=Math.hypot(s.x-p.x,s.z-p.z),rad=s.k==='ground'?s.r:s.k==='river'?230:s.k==='site'||s.k==='radar'?200:150;
  if(d<500&&!R.arr)R.arr=t;
  if(d<rad*3){R.ph+=dt*((s.k==='ground'?58:40)/rad)}
  const near=d<rad*3,ox=near?s.x+Math.cos(R.ph)*rad:s.x,oz=near?s.z+Math.sin(R.ph)*rad:s.z;
  o.x=ox;o.z=oz;o.y=gh(ox,oz)+s.agl;o.floor=Math.min(40,s.agl*.5);o.speed=d>700?1e3:s.k==='ground'?58:45;
  /* the words (a distance in them, the raids' bearings) are rebuilt four times a second, or when the station or the kind of leg changes: not on every sim tick */
  const kind=d>500?'transit':'station';if(kind!==o.kind||s!==R.txS||t-R.txT>=.25||t<R.txT){R.txT=t;R.txS=s;o.kind=kind;const km=M.kmTxt(d);
   if(d>500){o.what=`flying to ${s.n} · ${km}`;o.why=`Off to ${s.n} (${km})${R.inb?`: ${R.inb} inbound`:' to look over new ground'}${R.cur.k==='river'?', down in the valley':R.cur.k==='ridge'?', up on the crest':''}`}
  else{o.what=`holding ${s.n}${R.inb?' · '+R.inb+' inbound':''}`;o.why=M.why(s,R.inb,R.axes)}}
  o.label=s.n;o.st=s;
  /* a fresh interceptor from the pad when the pack is nearly spent and nothing is in reach (the pilot presses R) */
  R.wantRelaunch=F.relaunch>0&&me.mah/Math.max(1,api.BCAP)>.72&&d<1e5;
  return o};
 R.reset=()=>{R.cur=null;R.axT=-9;R.legs=0;R.txT=-9;R.txS=null};
 return R}
