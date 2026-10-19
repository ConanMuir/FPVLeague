// Zombies mode catalogue: enemy kinds, site hit points, wave budget, prices. Pure data (no three.js), so the harnesses can import it too.
// All numbers are game-balance values chosen for feel (pace, readability, money curve), not real-world performance figures.

// Enemy kinds. pts = wave-budget cost, cash = reward for a player kill (helpers earn half), dmg = site damage on impact,
// spd = cruise speed (m/s), alt = [min,max] AGL, hitR = body radius for a direct hit, armor: 0 = one hit, 1 = proximity only damages
// (needs a direct or marked hit), 'hard' = only a direct hit or a dome interceptor, from = first wave it appears, det = radar detection range (m).
// riley = moves with Riley's Shahed/Geran flight code (cruise legs + terminal dive); the rest have their own movers in zombies.js.
export const KIND={
 shahed:{n:'Shahed-136',tag:'SHAHED',pts:10,cash:100,dmg:40,spd:51,alt:[80,900],hitR:1.6,armor:0,from:1,det:6500,riley:1,col:'#ff4d4d'},
 jet:{n:'Geran-3 jet',tag:'GERAN-3',pts:16,cash:150,dmg:55,spd:92,alt:[150,900],hitR:1.7,armor:0,from:1,det:7000,riley:1,jet:1},
 decoy:{n:'Gerbera decoy',tag:'GERBERA',pts:4,cash:30,dmg:0,spd:46,alt:[80,700],hitR:1.4,armor:0,from:5,det:6500,riley:1,decoy:1},
 swarm:{n:'FPV swarm',tag:'FPV',pts:2,cash:20,dmg:10,spd:36,alt:[25,70],hitR:.8,armor:0,from:11,det:4500},
 heavy:{n:'Armored heavy',tag:'HEAVY',pts:30,cash:300,dmg:90,spd:60,alt:[150,700],hitR:2.1,armor:1,from:15,det:7500,riley:1},
 cruise:{n:'Cruise missile',tag:'CRUISE',pts:35,cash:350,dmg:110,spd:210,alt:[35,60],hitR:1.3,armor:0,from:20,det:16000,riley:1,far:22000},
 ballistic:{n:'Ballistic missile',tag:'BALLISTIC',pts:50,cash:600,dmg:160,spd:900,hitR:1.2,armor:'hard',from:25,det:1e9,far:70000},
 hyper:{n:'Hypersonic glider',tag:'HYPERSONIC',pts:80,cash:1000,dmg:240,spd:1600,hitR:1.4,armor:'hard',from:30,det:1e9,far:110000},
 icbm:{n:'ICBM warhead',tag:'ICBM',pts:120,cash:1500,dmg:400,spd:2600,hitR:1.2,armor:'hard',from:40,det:1e9,far:160000},
 boss:{n:'Mothership',tag:'MOTHERSHIP',pts:0,cash:2500,dmg:300,spd:30,alt:[650,750],hitR:9,armor:'boss',from:10,det:12000,riley:1}};
export const ORDER=['shahed','jet','decoy','swarm','heavy','cruise','ballistic','hyper','icbm'];

// Defended sites in Zombies: hit points (their sum is Defense Integrity). The command bunker joins at wave 10.
export const SITE_HP={SUBSTATION:400,'FUEL DEPOT':400,APARTMENTS:600,'COMMAND BUNKER':500};
export const BUNKER_WAVE=10;

// wave budget in threat points; wave 1 is the Classic pair (one Shahed, one Geran-3)
export const budget=(w,diff=1)=>w===1?26:Math.round((14+9*w+.35*w*w)*[.75,1,1.35][diff]);
export const isBoss=w=>w>0&&w%10===0;
// relative pick weights once unlocked: the newest kind starts rare and grows
export const weight=(k,w)=>{const K=KIND[k];if(w<K.from)return 0;const age=w-K.from;return({shahed:6,jet:3.5,decoy:2.5,swarm:2.2,heavy:1.6,cruise:1.4,ballistic:.8,hyper:.5,icbm:.35})[k]*Math.min(1,.45+age*.12)};
export const speedK=w=>Math.min(1.12,1+.004*w);  // slight pace creep for the slow drones; fast threats keep their speed

// economy
export const START_CASH=600;
export const HELPER_SHARE=.5;  // helpers earn this share of a kill's cash
export const clearBonus=w=>150+30*w,perfectBonus=w=>100+20*w;
export const streakMult=s=>1+Math.min(1,.1*Math.max(0,s-1));  // +10% per streak step after the first, up to x2
export const CLUTCH_R=600,CLUTCH_K=.5;  // killed within 600 m of its aim point: +50% clutch-save bonus
export const MULTI_BONUS=50;  // per extra kill in one burst
export const REPAIR_PER_HP=2.2;
