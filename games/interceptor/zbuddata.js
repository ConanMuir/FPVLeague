/* Little Buddy (zbuddy.js): the numbers and the words. Pure data and small helpers, no three.js and no DOM, so the harness imports it too.
   Your Drone League garage quad flies in Zombies as a free helper. The League keeps its settings in localStorage 'droneleague' (src/config/settings.js):
   `loadout` = [arms, chassis, power, attachment] part ids, `cos` = the six cosmetic ids, `physV` = the settings version. Only those three are read.
   All numbers are game-tuned for feel (what a buddy adds to a wave), not measurements of anything. */
export const LEAGUE={key:'droneleague',v:5};  /* the League's settings key and its settings version (SETTINGS_V in src/config/settings.js; the harness checks they match) */
export const SLOT_KEYS=['arms','chassis','power','attach'],COS_KEYS=['paint','decal','props','bell','led','trail'];
export const STOCK_IDS=Object.freeze(['stock','stock','stock','none']);

/* ---------- parts -> Zombies stats ----------
   The stock quad's numbers; each League part then multiplies the ones it drives (a missing number = x1), all four parts multiplied, clamped to x0.6 .. x1.7.
     spd = top speed (m/s)   acc = accel and braking (m/s²)   end = charge (s of flight; it lands at the radar pad to recharge)
     tuf = toughness (hit points)   agi = agility (the sideways accel it can turn with, m/s²)
   Power unit: its motors set spd and acc, its pack sets end. Chassis (the frame) and the attachment set tuf. Arms (the props) set agi.
   A part id that is not listed (a part added to the League later) counts as stock until it gets a row here. */
export const BASE={spd:62,acc:30,end:80,tuf:100,agi:48};
export const PARTS={
 power:{stock:{n:'Stock 6S'},punch:{n:'6S Race Punch',spd:.95,acc:1.3,end:.7},eff:{n:'4S Efficient',spd:.9,acc:1.05,end:1.6},hikv:{n:'High-KV',spd:1.2,acc:1.12,end:.7},lr:{n:'Long-Range Pack',spd:1,acc:.85,end:1.9}},
 arms:{stock:{n:'Stock X'},truex:{n:'True-X Freestyle',agi:1.2},stretch:{n:'Stretch-X Racer',agi:1.05},deadcat:{n:'Dead-Cat',agi:.8},squash:{n:'Squash-H',agi:1.25}},
 chassis:{stock:{n:'Stock Box'},slim:{n:'Slim Racer',tuf:.8},brick:{n:'Brick',tuf:1.4},plank:{n:'Low-Pro Plank',tuf:.9},pod:{n:'Pod',tuf:1.05}},
 attach:{none:{n:'None'},ram:{n:'Ram Bumper',tuf:1.15},cage:{n:'Ball Cage',tuf:1.05},ducts:{n:'Prop Ducts',tuf:1.1,acc:1.1},wheels:{n:'Wheels'},armor:{n:'Armor Plates',tuf:1.4}}};
export const STAT_KEYS=Object.keys(BASE);
const cl=(v,a,b)=>v<a?a:v>b?b:v;
export function statsOf(ids){const m={spd:1,acc:1,end:1,tuf:1,agi:1};
 SLOT_KEYS.forEach((s,i)=>{const r=Object.hasOwn(PARTS[s],ids[i])?PARTS[s][ids[i]]:null;if(r)for(const k of STAT_KEYS)m[k]*=r[k]??1});
 const o={mult:m};for(const k of STAT_KEYS){m[k]=cl(m[k],.6,1.7);o[k]=BASE[k]*m[k]}return o}
const r0=v=>Math.round(v);
/* the tooltip on the HUD card and the base screen: which part drives which number */
export function tipOf(ids,st){const n=SLOT_KEYS.map((s,i)=>Object.hasOwn(PARTS[s],ids[i])?PARTS[s][ids[i]].n:String(ids[i]));
 return['Little Buddy: your Drone League quad, flying for you. Its parts set its numbers:',
  `Motors (${n[2]}) → top speed ${r0(st.spd)} m/s, accel ${r0(st.acc)} m/s²`,
  `Pack (${n[2]}) → ${r0(st.end)} s of charge; it lands at the radar pad to recharge`,
  `Frame (${n[1]}${ids[3]==='none'?'':' + '+n[3]}) → ${r0(st.tuf)} hit points`,
  `Props (${n[0]}) → agility ${r0(st.agi)} m/s² of turn`].join('\n')}

/* ---------- reading the garage ---------- */
const ID=/^[a-z0-9]{1,15}$/;
export function cleanIds(a){if(!Array.isArray(a)||a.length<3||a.length>4)return null;const o=[...a];if(o.length===3)o.push('none');return o.every(x=>typeof x==='string'&&ID.test(x))?o:null}
/* the six cosmetic ids (object or array in COS_KEYS order) -> an array of strings, null where unset; null for anything else */
export function cleanCos(x){if(!x||typeof x!=='object')return null;const arr=Array.isArray(x);return COS_KEYS.map((k,i)=>{const v=arr?x[i]:x[k];return typeof v==='string'&&ID.test(v)?v:null})}
/* rd(key) = the raw saved string (it may throw). has = a League save with a garage loadout exists; ids always a loadout (stock when there is none).
   A save from a newer League (physV above LEAGUE.v) still gives its parts, but its cosmetics format is not trusted. */
export function readGarage(rd){let o=null;try{o=JSON.parse(rd(LEAGUE.key)||'null')}catch(e){}
 const ok=!!o&&typeof o==='object'&&!Array.isArray(o),ids=ok?cleanIds(o.loadout):null,v=ok?o.physV|0:0;
 return{has:!!ids,ids:ids||[...STOCK_IDS],cos:ids&&v<=LEAGUE.v?cleanCos(o.cos):null,v}}

/* ---------- behaviour ---------- */
export const JOBS=['perch','escort','bump','spot','harass','herd','recharge','down'];
export const JOBN={perch:'PERCHED',escort:'ESCORT',bump:'BUMPING',spot:'SPOTTING',harass:'HARASSING',herd:'HERDING',recharge:'RECHARGING',down:'DOWN'};
export const K={
 cap:.07,waveMax:4,    /* its kills: at most 7% of all kills in a run and 4 in a wave (a kill needs the room: canKill in zbuddy.js) */
 rech:10,              /* seconds on the pad from empty to full (it mends 4% hit points a second there too) */
 low:.28,              /* it heads home at this share of a full charge, or sooner when the way home needs more (needChg in zbuddy.js) */
 spotK:.8,spotT:1.2,   /* a track it is spotting locks in x0.8 the time; the mark lasts this long after it last saw it */
 markT:1.5,markEvery:6,/* harassing a boss: marks it for this long every this many seconds (helpers hit it as they would a marked track) */
 slowK:.85,slowT:5,    /* a bump slows a track x0.85 for 5 s (once at a time) */
 herdK:.7,herdT:6,     /* a herding pass slows it x0.7 for 6 s and turns it a little away from its aim point */
 bumpCd:2.6,           /* seconds between bumps */
 pick:[2.2,4],         /* seconds between choosing a job */
 sprint:1.15,          /* x top speed when chasing */
 bossHurt:2.5,         /* hit points a second lost within 70 m of a boss */
 model:2.2};          /* the model is drawn this much over life size so it reads from far */
/* what a bump does to each small drone: kill = chance it brings it down (when the kill share allows), dmg = hit points the buddy loses */
export const RAM={swarm:{kill:.5,dmg:3},decoy:{kill:.4,dmg:5},shahed:{kill:.1,dmg:14}};
export const SAYS={ready:['Buddy: ready when you are','Buddy: powered up'],bump:['Buddy: on it','Buddy: bumping that one'],spot:['Buddy: eyes on your target','Buddy: marking it'],
 harass:['Buddy: going for the weak spot','Buddy: keeping the big one busy'],herd:['Buddy: herding the strays','Buddy: pushing it off'],escort:['Buddy: on your wing','Buddy: covering you'],
 home:['Buddy: low charge, heading home','Buddy: need a recharge'],back:['Buddy: topped up','Buddy: back in the fight'],kill:['Buddy: got one!','Buddy: bump!'],down:['Buddy: going down!','Buddy: mayday']};
export const SAYL=Object.values(SAYS).flat();  /* one flat list: the index into it is what a co-op snapshot carries */
