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
 ballistic:{n:'Ballistic missile',tag:'BALLISTIC',pts:50,cash:600,dmg:220,spd:900,y0:32000,hitR:1.2,armor:'hard',from:25,det:1e9,far:70000},
 hyper:{n:'Hypersonic glider',tag:'HYPERSONIC',pts:80,cash:1000,dmg:380,spd:1600,y0:30000,hitR:1.4,armor:'hard',from:30,det:1e9,far:110000},
 icbm:{n:'ICBM warhead',tag:'ICBM',pts:120,cash:1500,dmg:700,spd:2600,y0:120000,hitR:1.2,armor:'hard',from:40,det:1e9,far:160000},
 boss:{n:'Mothership',tag:'MOTHERSHIP',pts:0,cash:2500,dmg:300,spd:30,alt:[650,750],hitR:9,armor:'boss',from:10,det:12000,riley:1}};
export const ORDER=['shahed','jet','decoy','swarm','heavy','cruise','ballistic','hyper','icbm'];

// Defended sites in Zombies: hit points (their sum is Defense Integrity). The command bunker joins at wave 10.
export const SITE_HP={SUBSTATION:400,'FUEL DEPOT':400,APARTMENTS:600,'COMMAND BUNKER':500};
export const BUNKER_WAVE=10;

// wave budget in threat points; wave 1 is the Classic pair (one Shahed, one Geran-3)
export const budget=(w,k=1)=>w===1?26:Math.round((14+12*w+.9*w*w)*k);  // k = the difficulty's wave-size multiplier

// Zombies difficulty (start menu). wave = wave-size multiplier, cash = money per kill and bonus multiplier, start = starting cash,
// hp = site hit-point multiplier, shift = how many waves earlier (+) or later (−) each enemy kind arrives (and grows common), evade = which kinds
// jink and break away from your interceptor (none / some / all). Hard and Nightmare are harder mostly through how the raids fly, not their size:
// tac (raid tactics) tot = time on target (raids from several edges and the fast kinds are held back so everything arrives together; 0-1),
// escort = Gerbera decoys flown with each Shahed (per Shahed, on top of the budget), focus = share of tracks sent at the weakest site (fewest
// defences near it, least hit points left), feint = share that switch to another site part-way in, jink = kill chance helper drones and guns
// lose against an evading kind.
export const ZDIFF=[
 {n:'Easy',wave:.6,cash:1.35,start:2500,hp:1.3,shift:-4,evade:'none',tac:{},txt:'Smaller waves, more money, tougher sites; new enemy types arrive later.'},
 {n:'Normal',wave:1,cash:1,start:1500,hp:1,shift:0,evade:'none',tac:{},txt:'The intended game: generous early, hard late.'},
 {n:'Hard',wave:1.1,cash:.85,start:1200,hp:1,shift:3,evade:'some',tac:{tot:.7,escort:.35,focus:.35,jink:.15},txt:'Raids come together from several edges with decoy escorts and go for your weakest site; jets, heavies, cruise missiles and swarms jink away from you and your helpers; new types come 3 waves early.'},
 {n:'Nightmare',wave:1.2,cash:.7,start:1000,hp:.9,shift:6,evade:'all',tac:{tot:1,escort:.6,focus:.6,feint:.3,jink:.25},txt:'Every raid times its arrival, hunts the weakest site and some switch targets on the way in; everything jinks; new types come 6 waves early. Bring friends.'}];
export const EVADE_SOME=['jet','heavy','cruise','swarm','boss'];
export const isBoss=w=>w>0&&w%10===0;
// the wave a kind first shows up on a difficulty (never before wave 2 except the Classic pair)
export const kindFrom=(k,shift=0)=>{const f=KIND[k].from;return f<=1?f:Math.max(2,f-shift)};
// relative pick weights once unlocked: the newest kind starts rare and grows
export const weight=(k,w,shift=0)=>{const K=KIND[k],f=kindFrom(k,shift);if(w<f)return 0;const age=w-f;return({shahed:6,jet:3.5,decoy:2.5,swarm:2.2,heavy:1.6,cruise:1.4,ballistic:.8,hyper:.5,icbm:.35})[k]*Math.min(1,.45+age*.12)};
export const speedK=w=>Math.min(1.12,1+.004*w);  // slight pace creep for the slow drones; fast threats keep their speed

// economy
export const START_CASH=1500;  // Normal; see ZDIFF
// early rounds pay extra so defences go up fast: x2.2 on wave 1, tapering to x1 by wave 10 (kills and wave bonuses)
export const earlyK=w=>1+1.2*Math.max(0,(10-w)/9);
export const HELPER_SHARE=.7;  // a helper's kill pays 70% of what the same kill pays the player (30% less)
export const clearBonus=w=>150+30*w,perfectBonus=w=>100+20*w;
export const streakMult=(s,max=2)=>1+Math.min(max-1,.1*Math.max(0,s-1));  // +10% per streak step after the first, up to x2 (the Partisan doctrine: x3)
export const CLUTCH_R=600,CLUTCH_K=.5;  // killed within 600 m of its aim point: +50% clutch-save bonus
export const MULTI_BONUS=50;  // per extra kill in one burst
export const REPAIR_PER_HP=3;

// How well each defence works against each kind (0 = can't engage). Shown on the shop cards and used by the defences' target choice.
export const RESIST={
 rack:{shahed:1,jet:.85,decoy:1,swarm:.75,heavy:1,cruise:.45,ballistic:0,hyper:0,icbm:0,boss:.6},
 flak:{shahed:1,jet:0,decoy:1,swarm:1,heavy:1,cruise:0,ballistic:0,hyper:0,icbm:0,boss:.4},
 gepard:{shahed:1,jet:.8,decoy:1,swarm:.9,heavy:.7,cruise:.7,ballistic:0,hyper:0,icbm:0,boss:.5},
 sam:{shahed:1,jet:1,decoy:1,swarm:.25,heavy:1,cruise:1,ballistic:0,hyper:0,icbm:0,boss:1},
 ew:{shahed:1,jet:.5,decoy:1,swarm:0,heavy:.6,cruise:0,ballistic:0,hyper:0,icbm:0,boss:0},
 idome:{shahed:.6,jet:.6,decoy:.6,swarm:.2,heavy:.6,cruise:1,ballistic:1,hyper:0,icbm:0,boss:.6},
 gdome:{shahed:0,jet:0,decoy:0,swarm:0,heavy:0,cruise:0,ballistic:1,hyper:1,icbm:1,boss:0},
 hflak:{shahed:.9,jet:.6,decoy:.9,swarm:.5,heavy:.9,cruise:.35,ballistic:0,hyper:0,icbm:0,boss:.4},
 mpads:{shahed:1,jet:1,decoy:.5,swarm:0,heavy:.8,cruise:.7,ballistic:0,hyper:0,icbm:0,boss:.5}};
RESIST.lrack=RESIST.rack;

// Interceptor drone rack: Mk I-V. hit = chance a drone that reaches its target kills it (before kind modifiers and Mark);
// direct = share of those hits that are direct hits (the only ones that get through armor without Mark).
export const RACK_TIERS=[{n:'Mk I',hit:.30,direct:.25,cost:0,note:'basic seeker'},{n:'Mk II',hit:.50,direct:.35,cost:600,note:'better tracking'},
 {n:'Mk III',hit:.65,direct:.45,cost:1200,note:'predicts manoeuvres'},{n:'Mk IV',hit:.80,direct:.55,cost:2200,note:'endgame shaping'},{n:'Mk V',hit:.90,direct:.7,cost:3600,note:'top seeker and fuse; ignores decoys'}];
export const RACK_CAP=[2,3,4],RACK_CAP_COST=[0,500,800],RACK_REARM=12,RACK_RANGE=3200,DRONE_SPD=118,DRONE_FUEL=60;

// The other helpers: three levels each (lv[0] = as bought). p = kill chance per engagement before RESIST; mag = shots per wave; rng = reach (m).
export const HELP={
 flak:{rng:1800,lv:[{rof:2.8,p:.28},{cost:450,rof:2.2,p:.33,txt:'faster loading'},{cost:750,rof:1.7,p:.4,txt:'better fuzes'}]},
 gepard:{rng:3500,lv:[{p:.22},{cost:900,p:.29,rng:4000,txt:'+range, tighter bursts'},{cost:1500,p:.36,rng:4000,ahead:1,txt:'airburst rounds: bursts catch swarm neighbours'}]},
 sam:{rng:9000,lv:[{mag:4,p:.9},{cost:1200,mag:6,p:.9,txt:'+2 missiles per wave'},{cost:1500,mag:8,p:.92,smart:1,txt:'+2 missiles, seekers ignore decoys'}]},
 ew:{rng:1400,lv:[{p:.35},{cost:700,p:.5,rng:1800,txt:'bigger bubble, stronger'},{cost:1100,p:.65,rng:2300,txt:'widest bubble, strongest'}]},
 idome:{rng:12000,lv:[{mag:6,p:.88},{cost:1800,mag:10,p:.88,over:1,txt:'+4 interceptors; also covers drones when idle'},{cost:2400,mag:14,p:.9,over:1,txt:'+4 interceptors'}]},
 gdome:{rng:9e9,lv:[{mag:2,p:.92},{cost:4000,mag:4,p:.92,txt:'+2 space interceptors'},{cost:5000,mag:6,p:.94,txt:'+2 space interceptors'}]},
 // kit variants (zmeta.js): one level each, no upgrades
 hflak:{rng:2200,alt:2000,lv:[{rof:4,p:.3}]},
 mpads:{rng:4500,lv:[{mag:3,p:.8}]}};

// Player perks: prices per level; active ones (freeze, mark, air) have charges per wave. Mark: helper hits on a marked track count double.
export const PERK={
 freeze:{key:'Q',pad:'D-pad left',cost:[900,800,1200]},mark:{key:'E',pad:'D-pad right',cost:[1000,900,1400]},air:{key:'X',pad:'D-pad up',cost:[1800,1600]},
 radar:{cost:[500,800,1200]},optics:{cost:[600,700,900]},relaunch:{cost:[500,900]},warhead:{cost:[700,1100,1600]},battery:{cost:[900]},aid:{cost:[1200]},rocket:{cost:[1500]},fuse:{cost:[800]},
 lure:{key:'Z',pad:'D-pad down',cost:[1200]},salvage:{cost:[600]}};  // kit perks (zmeta.js): only in the shop of a pilot who brought them

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
 warhead:{type:'perk',n:'Bigger warhead',from:2,glyph:'✹'},battery:{type:'perk',n:'Better battery',from:2,glyph:'▮'},aid:{type:'perk',n:'Foreign Aid',from:4,glyph:'$'},rocket:{type:'perk',n:'Rocket Assist',from:3,glyph:'➹'},fuse:{type:'perk',n:'Proximity fuse',from:1,glyph:'⌾'},
 // kit (zmeta.js): listed only when a pilot brought them
 lrack:{type:'helper',kit:1,n:'Light rack',price:400,from:1,glyph:'△',blurb:'A cheap drone rack: 2 drones, 2.2 km reach, Mk III at most, no refits. Early coverage that falls off late.'},
 hflak:{type:'helper',kit:1,n:'Heavy flak',price:900,from:3,glyph:'✺',blurb:'A heavy mortar whose shells reach jets and cruise missiles up to 2 km high (2.2 km out). Reloads slowly; half as good against swarms. No upgrades.'},
 mpads:{type:'helper',kit:1,n:'MANPADS team',price:1200,from:2,glyph:'↟',blurb:'Three heat-seeking missiles a wave (4.5 km), good against jets and Shaheds. Blind to swarms, fooled by decoys half the time. Moves for free; no upgrades.'},
 lure:{type:'perk',kit:1,n:'Lure beacon',from:2,glyph:'⊛'},salvage:{type:'perk',kit:1,n:'Salvage crews',from:1,glyph:'⚒'},
 // supplies: for the next wave only (SUPPLY below)
 drones:{type:'supply',n:'Reserve drones',from:3,glyph:'▴'},reload:{type:'supply',n:'Missile reloads',from:6,glyph:'⇈'},harden:{type:'supply',n:'Sandbags',from:4,glyph:'▦'},overtime:{type:'supply',n:'Overtime crews',from:5,glyph:'⏱'}};

// ---------- late-game sinks (from wave ~10 the 14 standard positions are full and money piles up; these turn it into decisions) ----------
// Upkeep: from UPKEEP_FROM each defence costs UPKEEP_K of what was spent on it per wave (forward positions and outposts FWD_UPKEEP times that),
// taken from the purse when the wave is cleared. Whatever the purse can't cover leaves the dearest defences short of ammo for the next wave (half load).
export const UPKEEP_FROM=11,UPKEEP_K=.02,FWD_UPKEEP=2;
// Expansion: open one more position (a rear slot at a site, a second pad at a forward position, an outpost north of the river); each costs more.
export const expCost=(n,k=1)=>Math.round(1800*1.4**n*k/100)*100;
// Rebuild a destroyed site: back at REBUILD_HP of its hit points; each rebuild in a run costs more.
export const rebuildCost=n=>3000+2000*n,REBUILD_HP=.4;
// Move a defence to another open position (instead of selling it at a loss); MANPADS teams move for free.
export const moveCost=d=>d.type==='mpads'?0:Math.max(250,Math.round((d.spent||0)*.15/50)*50);
// Supplies: bought on the base screen for the next wave only, once each. Price = per x what they apply to (racks, launchers, live sites, helpers).
export const SUPPLY={
 drones:{per:150,of:'rack',txt:'Every drone rack starts the wave with 2 extra drones ready.'},
 reload:{per:350,of:'launcher',txt:'+2 missiles for every SAM battery, Iron Dome and MANPADS team, +1 for Golden Dome.'},
 harden:{per:300,of:'site',txt:'Sandbags and blast walls: the sites take 25% less damage.'},
 overtime:{per:100,of:'helper',txt:'Every helper reloads and rearms 30% faster.'}};
// Armory refits: one per defence, each a trade (eff = new effectiveness against those kinds; the rest as listed). Switching costs the new refit's price.
export const REFIT={
 rack:[{id:'swarm',n:'Swarm seekers',cost:900,eff:{swarm:1,jet:.6,cruise:.3},splash:1.6,txt:'Kills FPV swarms as well as Shaheds and splashes more of the swarm; 30% worse against jets and cruise missiles.'},
  {id:'range',n:'Long-range drones',cost:1100,rng:4500,cap:-1,txt:'Reach 4.5 km instead of 3.2; one drone fewer in the rack.'}],
 flak:[{id:'heavy',n:'Heavy shells',cost:700,eff:{jet:.35,cruise:.2},alt:2000,rof:1.4,txt:'Reaches jets and cruise missiles, up to 2 km high; reloads 40% slower.'},
  {id:'prox',n:'Proximity fuzes',cost:800,pk:1.35,rng:1300,txt:'+35% kill chance; reach 1.3 km instead of 1.8.'}],
 gepard:[{id:'ap',n:'AP rounds',cost:1000,armor:1,eff:{swarm:.5},txt:'Armored heavies go down to an ordinary hit; 40% worse against swarms.'},
  {id:'radar',n:'Fire-control radar',cost:1200,rngK:1.3,cd:1.6,txt:'+30% reach; a burst every 1.6 s instead of 1.1.'}],
 sam:[{id:'reload',n:'Ready racks',cost:1500,mag:3,cd:7,txt:'+3 missiles a wave; 7 s between launches instead of 3.5.'},
  {id:'long',n:'Long-range seekers',cost:1400,rng:14000,p:.78,txt:'Reach 14 km instead of 9; kill chance 78% instead of 90%.'}],
 ew:[{id:'wide',n:'Wideband',cost:900,eff:{jet:1,cruise:.5},rngK:.7,txt:'Spoofs jets fully and cruise missiles half the time; bubble 30% smaller.'},
  {id:'focus',n:'Focused emitter',cost:800,pk:1.4,rngK:.65,txt:'+40% spoof chance; bubble 35% smaller.'}],
 idome:[{id:'drone',n:'Counter-drone mode',cost:1600,over:1,eff:{shahed:1,jet:1,decoy:1,heavy:1,swarm:.5},mag:-4,txt:'Fires at drones whenever it is idle, at full strength; 4 interceptors fewer.'},
  {id:'bal',n:'Ballistic priority',cost:1600,mag:4,never:1,txt:'+4 interceptors a wave; never fires at drones.'}]};
// Kit helper variants (zmeta.js KIT): only in the shop when a pilot brought them. Light rack: rack rules with these limits.
export const LRACK={rng:2200,cap:2,maxTier:2};
