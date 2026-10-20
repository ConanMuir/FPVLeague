// Zombies arsenal: every number for the pilot weapons (zweapons.js) and the five extra base defences (zarsdef.js). Pure data like zdata.js, so
// the harnesses and the bot pilots (tools/zbot.mjs) can import it. Importing it also adds the defences to zdata's shop tables (ITEMS, HELP,
// RESIST), so the shop, the Armory, upkeep, selling and co-op treat them like any other helper. Game-balance values chosen for feel.
import {ITEMS,HELP,RESIST} from './zdata.js';

// ---------- pilot weapons: one loaded at a time, bought once per run and swapped freely on the base screen (Shop tab, Pilot weapon) ----------
// price = one-off cost (the standard warhead is free), from = first wave it can be bought, str / wk = the card's strength and weakness lines.
export const WPN={
 std:{n:'Standard warhead',glyph:'✹',price:0,from:1,hud:'WARHEAD',str:'All-round: a 4 m kill radius (Bigger warhead adds to it) and a direct hit beats armor.',wk:'You time it, and a head-on pass at speed needs to be very tight.'},
 net:{n:'Net drone',glyph:'#',price:600,from:2,hud:'NET',str:'A 7 m net, no timing: it catches a slow drone (Shahed, decoy, swarm drone) intact and tows it into a field. A capture pays +60%.',wk:'Useless against anything fast or big: jets, heavies, missiles, the Mothership. One catch per drone.'},
 flech:{n:'Flechette warhead',glyph:'⋙',price:900,from:4,hud:'FLECHETTE',str:'A cone of darts 15 m deep ahead of you: forgiving timing, works head-on, shreds a swarm in one pass.',wk:'Darts bounce off armor (heavies only damaged, no Mothership stages) and do nothing behind you.'},
 flare:{n:'Flare / chaff pod',glyph:'✧',price:800,from:3,hud:'POD',str:'A pod beside a lighter warhead: 4 chaff bursts a wave decoy jets and cruise missiles that pass within 450 m of you into a field; flares beat AA and patrol drones on sorties.',wk:'The warhead loses 1 m of kill radius to make room, and the pod draws +10 A from your pack.'},
 cluster:{n:'Cluster warhead',glyph:'⁂',price:1200,from:7,hud:'CLUSTER',str:'Bursts into 6 bomblets that seek the small tracks within 350 m: one detonation can take a whole cloud.',wk:'A weak main charge; bomblets can\'t tell decoys and do nothing to heavies, missiles or the Mothership.'},
 emp:{n:'EMP warhead',glyph:'ϟ',price:1400,from:6,hud:'EMP',str:'Disables everything within 55 m for 4.5 s: they slow, sink and stop jinking, and your helpers and swarm get +60% kill chance on them (lasers burn them faster).',wk:'Only kills what it touches, so it pays little unless helpers are close. Missiles shrug it off.'},
 dart:{n:'Kinetic dart',glyph:'➶',price:1600,from:9,hud:'DART',str:'No explosive: ram the target and it dies, armor, Mothership stage or missile alike, with a wider window on fast missiles. A miss costs nothing: fly on.',wk:'You must physically hit it: no proximity kill at all, one target per drone, tiny FPV quads are hard to hit.'}};
export const WORDER=['std','net','flech','flare','cluster','emp','dart'];
// how each weapon does against each kind (shop chips, and how the bot pilots value them): 1 = as good as it gets, 0 = can't touch it
export const WEFF={
 std:{shahed:1,jet:.9,decoy:1,swarm:.9,heavy:.5,cruise:.6,ballistic:.15,hyper:.1,icbm:.05,boss:.6},
 net:{shahed:1,jet:0,decoy:.8,swarm:.5,heavy:0,cruise:0,ballistic:0,hyper:0,icbm:0,boss:0},
 flech:{shahed:1,jet:.9,decoy:1,swarm:1,heavy:.1,cruise:.6,ballistic:0,hyper:0,icbm:0,boss:.1},
 flare:{shahed:.85,jet:1,decoy:.85,swarm:.75,heavy:.4,cruise:.9,ballistic:.1,hyper:.05,icbm:.03,boss:.5},
 cluster:{shahed:.9,jet:.6,decoy:.9,swarm:1,heavy:0,cruise:0,ballistic:0,hyper:0,icbm:0,boss:.2},
 emp:{shahed:.7,jet:.7,decoy:.5,swarm:.9,heavy:.7,cruise:.5,ballistic:0,hyper:0,icbm:0,boss:.5},
 dart:{shahed:.8,jet:.7,decoy:.8,swarm:.4,heavy:1,cruise:.6,ballistic:.5,hyper:.4,icbm:.3,boss:1}};
// net: catch radius (m, +rK per Bigger warhead level), slowest it can't hold (m/s), biggest body (hitR), capture bonus (share of the kill's pay), tow time (s)
export const NET={r:7,rK:1,spd:62,size:1.7,bonus:.6,tow:5};
// EMP: disable radius (m, +rK per Bigger warhead level), stun (s), how long a Mothership stops launching (s), blast as a share of the warhead's
// lethal radius, helper / swarm kill chance x helperK on a disabled track (at most 95%), laser burn time x laserK, disabled speed share, sink (m/s)
export const EMP={r:55,rK:8,stun:4.5,boss:8,kill:.25,helperK:1.6,laserK:.6,slow:.45,sink:4};
// flechette: reach (m, +rK per Bigger warhead level), cone half-angle (deg), kill chance inside near (m) and at full reach
export const FLECH={r:15,rK:2,cone:32,near:4,pNear:.95,pFar:.3};
// kinetic dart: contact window beyond the body radius (m); against fast tracks (150 m/s+) the window is wider
export const DART={pad:.35,fastPad:1.2};
// cluster: bomblets, seek radius (m), speed (m/s), life (s), resolve distance (m), main charge as a share of the lethal radius, kill chance per kind
export const CLUSTER={n:6,seek:350,spd:95,life:6,res:5,kill:.6,pk:{swarm:.6,shahed:.5,decoy:.5,jet:.3}};
// flare / chaff pod: chaff bursts a wave, reach (m), decoy chance per burst, the kinds chaff works on, pack draw (A), warhead kill radius change (m), flares per sortie, the chance a flare
// beats an AA burst / a patrol drone's blast (sorties, zsortie.js, when that feature is in the build)
export const FLARE={n:4,r:450,p:.55,kinds:['jet','cruise'],amp:10,leth:-1,sortie:6,aa:.75,pat:.7};

// ---------- base defences ----------
// laser: seconds of beam on a track to burn through it in clear air (lv dw scales it); the weather factor (0 = can't fire) stretches it
export const DWELL={swarm:1.4,shahed:4.4,decoy:3.2,jet:9,heavy:12,cruise:8,boss:10};
export const laserWx=W=>{if(!W)return 1;if((W.rain||0)>=1.5||W.bolts)return 0;const f=W.fog?.[1]??14000;return Math.max(0,Math.min(1,f/6000))*(1-.35*Math.min(1,W.rain||0))};
// microwave dome: kill chance per pulse; it pulses when trig drones it can fry are inside, or any of them within close (m)
export const MWAVE={pk:{swarm:1,decoy:.6,shahed:.3},trig:3,close:300};
// balloon / cable barrage: snag chance per pass below the cable ceiling (lv alt, AGL) inside its reach; balloons; how close to a cable your own drone can fly (m)
export const BARRAGE={pk:{swarm:.55,shahed:.5,decoy:.5,jet:.3,heavy:.35,cruise:.45},n:4,cable:2.2};
// smoke: share of a diving track's aim lost (x lv p), per kind; wind over `wind` m/s thins it (x windK); lasers burn x laserK inside a screen
export const SMOKE={pk:{swarm:1,cruise:.8,shahed:.6,jet:.6,heavy:.6},wind:9,windK:.6,laserK:.5};
// drone carrier: at most `max` (they park, no position needed), drones per volley, seconds between volleys
export const CARRIER={max:2,volley:4,iv:1.5};
export const ARS_HELPERS=['laser','mwave','barrage','smoke','carrier'];

// shop entries, levels (lv[0] = as bought) and the effectiveness chips, added to zdata's tables
Object.assign(HELP,{
 laser:{rng:2000,lv:[{dw:1},{cost:1200,dw:.75,txt:'more power: burns 25% faster'},{cost:1800,dw:.6,rng:2600,txt:'beam director: 2.6 km, burns 40% faster'}]},
 mwave:{rng:650,lv:[{cd:14},{cost:1400,cd:10,txt:'recharges in 10 s'},{cost:2000,cd:8,rng:850,txt:'850 m dome, 8 s recharge'}]},
 barrage:{rng:380,lv:[{snags:4,alt:170},{cost:500,snags:6,alt:190,txt:'more cables: 6 snags a wave, 190 m ceiling'},{cost:800,snags:9,rng:480,alt:220,txt:'wider net: 480 m, 9 snags, 220 m ceiling'}]},
 smoke:{rng:600,lv:[{p:.4},{cost:450,p:.5,txt:'thicker screen: 50%'},{cost:700,p:.6,rng:750,txt:'wider screen: 750 m, 60%'}]},
 carrier:{rng:3200,lv:[{mag:12,tier:1},{cost:1500,mag:16,tier:2,txt:'16 drones, Mk III seekers'},{cost:2200,mag:20,tier:3,txt:'20 drones, Mk IV seekers'}]}});
Object.assign(RESIST,{
 laser:{shahed:.8,jet:.4,decoy:.8,swarm:1,heavy:.3,cruise:.35,ballistic:0,hyper:0,icbm:0,boss:.3},
 mwave:{shahed:.3,jet:0,decoy:.6,swarm:1,heavy:0,cruise:0,ballistic:0,hyper:0,icbm:0,boss:0},
 barrage:{shahed:.5,jet:.3,decoy:.5,swarm:.55,heavy:.35,cruise:.45,ballistic:0,hyper:0,icbm:0,boss:0},
 smoke:{shahed:.6,jet:.6,decoy:0,swarm:1,heavy:.6,cruise:.8,ballistic:0,hyper:0,icbm:0,boss:0},
 carrier:RESIST.rack});
Object.assign(ITEMS,{
 laser:{type:'helper',n:'Laser battery',price:2200,from:8,glyph:'⌁',blurb:'<b class="zs">Strong:</b> holds a beam on one track until it burns through, no dice: 1.4 s on a swarm drone, 4.4 s on a Shahed, 12 s on an armored heavy; 2 km. <b class="zw">Weak:</b> fog, rain, snow and dust stretch the burn, a heavy storm shuts it down, smoke blocks it; slow on jets, never touches missiles.'},
 mwave:{type:'helper',n:'Microwave dome',price:2400,from:10,glyph:'⊚',blurb:'<b class="zs">Strong:</b> a pulse fries every FPV swarm drone within 650 m (decoys 60%, Shaheds 30%), then recharges for 14 s. <b class="zw">Weak:</b> does nothing to jets, heavies, missiles or the Mothership itself.'},
 barrage:{type:'helper',n:'Balloon barrage',price:800,from:4,glyph:'⍥',blurb:'<b class="zs">Strong:</b> passive cables over a position snag tracks flying under 170 m within 380 m: swarms, cruise missiles, Shaheds diving on a site. 4 snags a wave. <b class="zw">Weak:</b> anything higher passes over, so placement is everything; your own interceptor can fly into the cables.'},
 smoke:{type:'helper',n:'Smoke generators',price:700,from:3,glyph:'≈',blurb:'<b class="zs">Strong:</b> tracks diving on targets within 600 m lose their aim 40% of the time and hit a field (camera-guided FPV swarms most of all). <b class="zw">Weak:</b> kills nothing, so it earns nothing; strong wind thins it; it blinds lasers near the site.'},
 carrier:{type:'helper',n:'Drone carrier',price:3000,from:7,glyph:'⧉',blurb:'<b class="zs">Strong:</b> a truck of 12 Mk II interceptor drones you park anywhere on the map (no position needed, up to 2): it pours them out in volleys at tracks within 3.2 km. <b class="zw">Weak:</b> no rearming in a wave, so once it is empty it is done; re-park it every break on the next raid\'s approach.'}});
