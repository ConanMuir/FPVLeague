/* Craft types: what you can fly in Zombies. One table; the rest of the game asks it (typeOf(id)) instead of assuming the dart.
   The Dart is the original craft and the default (it is also what an old save, an unknown id or a hand-edited value turns into); its flight
   and look stay in interceptor.js (Drone), so its entry holds only the text and the numbers the HUD and the bots read.
   ADDING A TYPE = one entry below + a model builder + a flight-controller function (nothing else in the game needs to know it exists):
     id, name, call (radio call sign), blurb, facts[]         the picker cards (start menu, base screen) and the radio / guide text
     buildModel()   -> {group, props[], nozzle}                the craft's mesh, built from shared geometry (a few merged primitives, one or two
                                                               materials: it is built every time a pilot switches to the type, so no new geometry);
                                                               body +Y = nose, +Z = up, +X = right; props spin about their local Y; the exhaust
                                                               and the Rocket Assist flame come out of nozzle along its -Y
     make(drone, X) -> cx                                      the flight controller, made once per Drone that flies the type. X is the world
                                                               (interceptor.js CRAFT: gh, sdf, sdN, WIND, G, HOV, BCAP, ocv, FOBS, MSZ, banner, feed...). cx:
                                                               spawn(pad, bearing)  put the craft on the pad (called for every new interceptor)
                                                               face(bearing)        turn it to a bearing (a sortie moved it to another pad)
                                                               stick(thr, yaw, pit, rol)  this tick's sticks from the player or a bot (thr 0..1, the rest are -1..1)
                                                               step(dt) -> hit      one physics tick; returns the impact speed (over the crash speed = lost)
                                                               info() -> {...}      what hud[] reads; vtop() -> the top speed the lock-on solves with
     hud[]          -> {id, label, v(info), c(info)}           readouts in the craft's own HUD panel (v: text, c: '' | 'a' | 'r'); tape: {max, min(info)}
                                                               draws the airspeed bar (marker, red below the minimum speed)
     state(info)    -> a status line for the panel
     cam {off, chase, tilt}                                    FPV camera mount (body frame, m), chase camera [distance, height], FPV tilt in degrees
                                                               (null = the camera switch decides, as on the dart)
     bot(api, me, Vd, head, dt, o) -> {thr, yaw, pit, rol}     the bot pilot's sticks for a wanted velocity Vd (zbotfly.js asks; null = zbotfly's dart controller)
     guide {fly, look}, radio                                  the first-wave guide's text for flying and for the camera step, the radio line at launch
     draw {full, cruise}                                       pack draw at full throttle (A) and level full-throttle speed (m/s) for the battery gauge
   Everything with a body, a battery and a nose then works as it does on the dart: the pip, the lock, the burst, Rocket Assist, sorties, co-op
   (each pilot's type travels in the presence packet), the bots. */
import {planeModel,makePlane,F as PF,stickOf,cruiseAmps} from './zplane.js';
import {planeBot} from './zplanebot.js';

export const VER=1;
const kmh=v=>Math.round(v*3.6);
export const TYPES={
 dart:{id:'dart',name:'Dart',call:'Dart One',tag:'DART',
  blurb:'The tail-sitter interceptor: takes off straight up from the mat, hovers, turns on the spot and dives onto a track at 360 km/h.',
  facts:['Hovers and climbs straight up','Sharp turns, 360 km/h flat out','About 7 min of flat-out flight on a pack','Relaunches from the mat'],
  flight:{hover:true},buildModel:null,make:null,hud:[],bot:null,guide:null,radio:'',draw:null,
  cam:{off:[0,.37,-.03],chase:[3.4,1.1],tilt:null}},
 plane:{id:'plane',name:'Plane',call:'Plane One',tag:'PLANE',
  blurb:'A small fixed-wing: fast and frugal, it banks to turn and can never hover. Keep above its minimum speed or the nose drops and it sinks. Catapult launch; it lands on a pad by a low pass and recharges.',
  facts:[`Cruise ${kmh(PF.vc)} km/h, ${kmh(PF.vlev)} km/h flat out`,`Minimum speed ${kmh(PF.vs)} km/h`,`Pull-up limit ${PF.nmax} g, wide turns`,`Pack lasts about ${Math.round(25600*3.6/PF.i1/60)} min flat out, ${Math.round(25600*3.6/cruiseAmps()/60)} at cruise`],
  flight:PF,buildModel:planeModel,make:makePlane,
  hud:[{id:'ias',label:'AIRSPEED',v:i=>kmh(i.ias)+' km/h',c:i=>i.stall>0?'r':i.mode==='fly'&&i.ias<i.vmin*1.3?'a':''},{id:'min',label:'MIN SPEED',v:i=>kmh(i.vmin)+' km/h',c:()=>''}],
  tape:{max:PF.vne,min:i=>i.vmin},
  state:i=>i.mode==='pad'?'CATAPULT READY · THROTTLE UP':i.mode==='cat'?'CATAPULT':i.mode==='chg'?`TAXI · RECHARGING ${Math.round(i.ch*100)}%`:i.mode==='roll'?(i.sit?'ON THE GROUND · THROTTLE TO TAKE OFF · R TO RELAUNCH':i.flare?'ROLLING OUT':'ON THE GROUND'):
   i.flare?'FLARE':i.stall>0?'STALL · NOSE DOWN, GET SPEED':i.ias<i.vmin*1.3?'LOW SPEED':i.pad?'PAD AHEAD · LOW AND SLOW TO LAND':'',
  cam:{off:[0,.52,.07],chase:[4.2,1.4],tilt:90},
  bot:planeBot,
  guide:{fly:{kb:'Press <kbd>W</kbd> to launch: the catapult throws the plane off the pad. <kbd>←</kbd><kbd>→</kbd> bank to turn, <kbd>↑</kbd> nose down, <kbd>↓</kbd> nose up, <kbd>A</kbd><kbd>D</kbd> rudder, <kbd>W</kbd><kbd>S</kbd> throttle (let go for cruise). It cannot hover: keep the airspeed above the minimum. Fly out toward the blips on the radar.',
    pad:'Raise the throttle to launch: the catapult throws the plane off the pad. Right stick banks and pitches, left stick throttle and rudder. It cannot hover: keep the airspeed above the minimum. Fly out toward the blips on the radar.',
    say:'Plane One, the catapult is armed. Throttle up when you are ready, and keep your speed up.'},
   look:{kb:'<kbd>C</kbd> changes the view: FPV, chase, threat. The plane keeps its camera on the nose. Watch the airspeed bar: red is a stall.',pad:'LB changes the view: FPV, chase, threat. The plane keeps its camera on the nose. Watch the airspeed bar: red is a stall.',
    say:'Change the view if you want a look around. Watch your airspeed.'}},
  radio:'catapult armed. Throttle up when ready. Keep your speed above the minimum.',
  draw:{full:PF.i1,cruise:PF.vlev}}};
export const ORDER=Object.keys(TYPES);
export const typeOf=id=>Object.hasOwn(TYPES,id)?TYPES[id]:TYPES.dart;
export const cleanId=id=>typeof id==='string'&&Object.hasOwn(TYPES,id)?id:'dart';
/* the saved choice: S.zty = {v, id}. A string (hand-edited), a number, an unknown id or a future version's unknown type all read as the dart; an old save has none */
export const cleanSave=o=>({v:VER,id:cleanId(o&&typeof o==='object'?o.id:o)});
export const thrStick=(u,h)=>stickOf(u,h);
