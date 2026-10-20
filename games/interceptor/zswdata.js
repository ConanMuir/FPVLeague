// Zombies personal swarm, lock-on and battery: every number in one place. Pure data (no three.js), so the harnesses can import it too.
// All numbers are game-balance values chosen for feel (pace, readability, solo balance), not real-world performance figures.
// The two swarm perks register themselves in zdata's PERK / ITEMS below, so the shop, co-op (znet.js) and the bots see them like any other perk.
import {PERK,ITEMS} from './zdata.js';

// ---------- personal swarm (zswarm.js) ----------
// Personal swarm: level = how many drones deploy each wave (one set per wave: a crash or relaunch does not bring lost ones back).
// Swarm Mk: better drones. pk = kill chance of one attack pass on a Shahed (other kinds scale by zdata RESIST.rack, armor and Mark through
// Z.helperHit), direct = share of those hits that go through armor, loss = chance a drone is lost on a pass (blast, debris, return fire),
// spd = attack speed (m/s), charges = strike charges per wave.
export const SW={
 n:[0,4,6,8,10,12],
 mk:[{n:'Mk I',pk:.45,direct:.3,loss:.4,spd:150,charges:1},{n:'Mk II',pk:.58,direct:.4,loss:.3,spd:165,charges:1},{n:'Mk III',pk:.7,direct:.5,loss:.2,spd:180,charges:2}],
 upkeep:30,  // $ per drone deployed, paid from the purse when the wave starts (the doctrine's upkeep factor applies; Quartermaster: free)
 amp:3,  // A drawn from your pack per drone in the air (the swarm's relay link rides on your interceptor)
 boost:330,  // strike speed under rocket boosters (m/s)
 leash:4500,  // drones give up a chase this far from you and come back
 strikeR:4500,  // a strike picks the densest cloud of threats within this range (or a ground target, see Z.swarm.strike)
 screenR:900,screenAxis:1800,screenW:300,  // Screen: threats within 900 m of you, or within 300 m of your formation axis up to 1.8 km ahead
 maxEng:[.5,1],  // share of the swarm that may peel off at once: escort (self-defence) / screen
 from:12,mkFrom:15};
// Formations: slot geometry lives in zswarm.js. engR = self-defence radius (m) in escort; pk / loss / amp = multipliers; ahead = engage
// radius bonus for threats in front (wedge), splash = an attack pass on an FPV swarm can take a neighbour (line abreast).
export const FORMS=[
 {id:'cloud',n:'CLOUD',engR:320,pk:1,loss:.85,amp:1,txt:'a loose cloud orbiting you: all-round cover, the safest for the drones'},
 {id:'wedge',n:'WEDGE',engR:220,ahead:520,pk:1.25,loss:1,amp:1,txt:'a V out in front: hits hardest (+25% kill chance on attacks and strikes), covers your nose'},
 {id:'line',n:'LINE',engR:300,pk:1,loss:1,amp:1,splash:1,txt:'line abreast: a wide sweep, passes on FPV swarms can take a neighbour too'},
 {id:'screen',n:'SCREEN',engR:520,pk:.9,loss:.9,amp:1.1,txt:'a curved wall between you and the threat axis: intercepts the most incoming'},
 {id:'column',n:'COLUMN',engR:180,pk:.9,loss:1,amp:.6,txt:'a file trailing you: keeps up at Rocket Assist speed, draws 40% less from your pack, guards your six'}];
export const MODES=['escort','screen','attack','strike'];
Object.assign(PERK,{swarm:{key:'1-5',pad:'A / B / X / RB',cost:[2400,1500,1800,2200,2600]},swarmk:{cost:[2000,3000]}});
Object.assign(ITEMS,{swarm:{type:'perk',n:'Personal swarm',from:SW.from,glyph:'⁂'},swarmk:{type:'perk',n:'Swarm drones Mk',from:SW.mkFrom,glyph:'⋰'}});
export const SW_BLURB={
 swarm:['A cloud of 4 close-support drones flies with you, deployed once per wave (a crash or relaunch does not replace lost ones). 1 attack my lock · 2 screen · 3 strike (rocket boosters, 1 charge a wave) · 4 form up · 5 next formation (pad A / B / X / R3 / RB). Each drone draws 3 A from your pack and $30 upkeep a wave.',
  '6 drones.','8 drones.','10 drones.','12 drones (the most you can manage).'],
 swarmk:['Mk II drones: kill chance 45% → 58% a pass, lost on 30% of passes instead of 40%, faster.','Mk III drones: 70% a pass, lost on 20%, and 2 strike charges a wave.']};

// ---------- lock-on (zlock.js) ----------
// cone = half-angle of the reticle zone, keep = how far off the reticle a full lock survives (and for how long), t = seconds to lock a
// close target in clear air, far = extra lock time per km past 800 m, decay = how fast a part-built lock fades when the target leaves the zone.
// optics = lock-time factor per Optics level; brk = chance per second that a locked evader (Hard / Nightmare) jinks, and that a jink breaks the lock.
export const LOCK={cone:5,keep:14,keepT:.8,range:3500,t:1.4,far:.45,decay:1.6,optics:[1,.8,.65,.5],brk:{some:[.3,.45],all:[.45,.7]},jam:1.7,jamR:2500};

// ---------- battery (zbatt.js; Classic keeps Riley's 16,000 mAh) ----------
// Zombies flies a bigger pack than Classic: k x the tuned capacity (the mod panel's Battery value). Better battery doubles it.
export const BAT={k:1.6,perk:2,full:226,cruise:100};  // full: pack current at full throttle (A, Riley's motor model); cruise: full-throttle level speed (m/s), for the range readout
