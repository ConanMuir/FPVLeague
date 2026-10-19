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
 ballistic:{n:'Ballistic missile',tag:'BALLISTIC',pts:50,cash:600,dmg:160,spd:900,y0:32000,hitR:1.2,armor:'hard',from:25,det:1e9,far:70000},
 hyper:{n:'Hypersonic glider',tag:'HYPERSONIC',pts:80,cash:1000,dmg:240,spd:1600,y0:30000,hitR:1.4,armor:'hard',from:30,det:1e9,far:110000},
 icbm:{n:'ICBM warhead',tag:'ICBM',pts:120,cash:1500,dmg:400,spd:2600,y0:120000,hitR:1.2,armor:'hard',from:40,det:1e9,far:160000},
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
export const REROLL=n=>100+75*n;  // n = rerolls already bought this visit

// How well each defence works against each kind (0 = can't engage). Shown on the shop cards and used by the defences' target choice.
export const RESIST={
 rack:{shahed:1,jet:.85,decoy:1,swarm:.75,heavy:1,cruise:.45,ballistic:0,hyper:0,icbm:0,boss:.6},
 flak:{shahed:1,jet:0,decoy:1,swarm:1,heavy:1,cruise:0,ballistic:0,hyper:0,icbm:0,boss:.4},
 gepard:{shahed:1,jet:.8,decoy:1,swarm:.9,heavy:.7,cruise:.7,ballistic:0,hyper:0,icbm:0,boss:.5},
 sam:{shahed:1,jet:1,decoy:1,swarm:.25,heavy:1,cruise:1,ballistic:0,hyper:0,icbm:0,boss:1},
 ew:{shahed:1,jet:.5,decoy:1,swarm:0,heavy:.6,cruise:0,ballistic:0,hyper:0,icbm:0,boss:0},
 idome:{shahed:.6,jet:.6,decoy:.6,swarm:.2,heavy:.6,cruise:1,ballistic:1,hyper:0,icbm:0,boss:.6},
 gdome:{shahed:0,jet:0,decoy:0,swarm:0,heavy:0,cruise:0,ballistic:1,hyper:1,icbm:1,boss:0}};

// Interceptor drone rack: Mk I-V. hit = chance a drone that reaches its target kills it (before kind modifiers and Mark);
// direct = share of those hits that are direct hits (the only ones that get through armor without Mark).
export const RACK_TIERS=[{n:'Mk I',hit:.30,direct:.25,cost:0,note:'basic seeker'},{n:'Mk II',hit:.50,direct:.35,cost:600,note:'better tracking'},
 {n:'Mk III',hit:.65,direct:.45,cost:1200,note:'predicts manoeuvres'},{n:'Mk IV',hit:.80,direct:.55,cost:2200,note:'endgame shaping'},{n:'Mk V',hit:.90,direct:.7,cost:3600,note:'top seeker and fuse; ignores decoys'}];
export const RACK_CAP=[2,3,4],RACK_CAP_COST=[0,500,800],RACK_REARM=12,RACK_RANGE=3200,DRONE_SPD=118,DRONE_FUEL=60;

// The other helpers: three levels each (lv[0] = as bought). p = kill chance per engagement before RESIST; mag = shots per wave; rng = reach (m).
export const HELP={
 flak:{rng:1800,lv:[{rof:2.4,p:.35},{cost:350,rof:1.8,p:.42,txt:'faster loading'},{cost:600,rof:1.3,p:.5,txt:'better fuzes'}]},
 gepard:{rng:3500,lv:[{p:.28},{cost:900,p:.36,rng:4000,txt:'+range, tighter bursts'},{cost:1500,p:.45,rng:4000,ahead:1,txt:'airburst rounds: bursts catch swarm neighbours'}]},
 sam:{rng:9000,lv:[{mag:4,p:.9},{cost:1200,mag:6,p:.9,txt:'+2 missiles per wave'},{cost:1500,mag:8,p:.92,smart:1,txt:'+2 missiles, seekers ignore decoys'}]},
 ew:{rng:1400,lv:[{p:.35},{cost:700,p:.5,rng:1800,txt:'bigger bubble, stronger'},{cost:1100,p:.65,rng:2300,txt:'widest bubble, strongest'}]},
 idome:{rng:12000,lv:[{mag:6,p:.88},{cost:1800,mag:10,p:.88,over:1,txt:'+4 interceptors; also covers drones when idle'},{cost:2400,mag:14,p:.9,over:1,txt:'+4 interceptors'}]},
 gdome:{rng:9e9,lv:[{mag:2,p:.92},{cost:4000,mag:4,p:.92,txt:'+2 space interceptors'},{cost:5000,mag:6,p:.94,txt:'+2 space interceptors'}]}};

// Player perks: prices per level; active ones (freeze, mark, air) have charges per wave. Mark: helper hits on a marked track count double.
export const PERK={
 freeze:{key:'Q',pad:'D-pad left',cost:[900,800,1200]},mark:{key:'E',pad:'D-pad right',cost:[1000,900,1400]},air:{key:'X',pad:'D-pad up',cost:[1800,1600]},
 radar:{cost:[500,800,1200]},optics:{cost:[600,700,900]},relaunch:{cost:[500,900]},warhead:{cost:[700,1100,1600]},battery:{cost:[500,900]},aid:{cost:[1200]}};

// shop items: helpers are placed on a slot; perks belong to the player
export const ITEMS={
 rack:{type:'helper',n:'Interceptor drone rack',price:700,from:1,glyph:'▲',blurb:'Launches interceptor drones at tracks in range (3.2 km). A drone claims its track: it turns yellow for you. Upgrade Mk I→V in the Armory.'},
 flak:{type:'helper',n:'Flak mortar',price:450,from:1,glyph:'✸',blurb:'Lobs airburst shells at slow, low tracks within 1.8 km. Great against swarms. Useless against jets and missiles.'},
 ew:{type:'helper',n:'EW jammer',price:1100,from:3,glyph:'≋',blurb:'Jams satellite navigation in a 1.4 km bubble: spoofed tracks hit empty fields instead of the site. FPV swarms are fibre-guided and immune.'},
 gepard:{type:'helper',n:'Gepard gun',price:1600,from:3,glyph:'≡',blurb:'Twin 35 mm cannons with radar, 3.5 km. Solid against drones, jets and cruise missiles.'},
 sam:{type:'helper',n:'SAM battery',price:2800,from:6,glyph:'⇑',blurb:'Long-range missiles (9 km): 4 per wave, nearly always a kill and armor doesn\'t matter. Wasted on swarms and decoys.'},
 idome:{type:'helper',n:'Iron Dome',price:4200,from:20,glyph:'◠',blurb:'Dome-class interceptors: stops ballistic and cruise missiles. 6 per wave.'},
 gdome:{type:'helper',n:'Golden Dome',price:9000,from:28,glyph:'✦',blurb:'Space-based interceptors: the only answer to hypersonic and ICBM tracks. 2 per wave, anywhere on the map.'},
 freeze:{type:'perk',n:'Freeze',from:2,glyph:'❄'},mark:{type:'perk',n:'Mark',from:2,glyph:'◎'},air:{type:'perk',n:'Airstrike',from:6,glyph:'✈'},
 radar:{type:'perk',n:'Long-range radar',from:2,glyph:'◉'},optics:{type:'perk',n:'Optics',from:2,glyph:'◈'},relaunch:{type:'perk',n:'Fast relaunch',from:2,glyph:'↻'},
 warhead:{type:'perk',n:'Bigger warhead',from:2,glyph:'✹'},battery:{type:'perk',n:'Better battery',from:2,glyph:'▮'},aid:{type:'perk',n:'Foreign Aid',from:4,glyph:'$'}};
