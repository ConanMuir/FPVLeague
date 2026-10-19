// ---------- Skill training packs: plain data. Add a pack by adding an entry to PACKS (it shows up in the browser by category). ----------
// Coordinates are in the pack's local frame (training/judge.js): facing the goal that matters, x metres to the right, d metres
// out from its goal line, y metres up. Striker/Aerial/Dribbling/Pops use the goal you attack; Goalie uses your own goal.
// shot = {n: name, tip?: one line shown before the shot,
//  ball: {p: [x, y, d] (y = height of the ball's underside, 0 = on the floor), v?: [vx, vy, vd] m/s (vd < 0 = toward the goal),
//         aim?: [x, y, d, T] (launch it to reach that point in T s; used instead of v), w?: spin rad/s, on?: true (resting on top of the quad),
//         wall?: m (x is measured from the side wall instead: +right wall, -left wall)},
//  drone: {p: [x, y, d] (centre height), yaw?: degrees to the right of facing the goal (default 0)},
//  zone?: {x, d, r} (Pops targets), t?: seconds (overrides the pack's)}
// pack = {id, cat, tier (0 Rookie, 1 Pro, 2 All-Star), name, blurb, kind: 'goal' | 'save' | 'zone' (per shot: shot.kind), req?, t, shots}
// Success (training/judge.js): goal = the ball crosses the target goal line (req: air = scoring touch at least that high; carry = s
// carried on top first; pop = the scoring touch is a pop); save = touched, then the ball is no longer on its way in (or the time runs
// out with it kept out); zone = after a pop the ball's first landing is inside the target ring.
export const TIERS=[{id:'rookie',name:'Rookie'},{id:'pro',name:'Pro'},{id:'allstar',name:'All-Star'}];
export const CATS=[
 {id:'striker',name:'Striker',blurb:'Shots on goal from set ball positions: still balls, rollers, crosses and volleys.'},
 {id:'goalie',name:'Goalie',blurb:'Shots fired at your goal. Get a touch on it so it stays out.'},
 {id:'aerial',name:'Aerial',blurb:'Balls hanging, lobbed and coming off the walls. Score with a touch high in the air.'},
 {id:'dribble',name:'Dribbling',blurb:'Keep the ball on top of your quad, carry it, then shoot.'},
 {id:'pops',name:'Pops',blurb:'Earn a pop with the ball on top, then pop it into the goal or onto a target.'}];
const ON={p:[0,0,0],on:true},F=1.5;  // F: a quad parked on the floor
export const PACKS=[
 // ---- Striker
 {id:'striker-rookie',cat:'striker',tier:0,name:'First Touches',blurb:'Still and slow balls near the goal. Drive through the middle of the ball.',kind:'goal',t:10,shots:[
  {n:'Centre, still',ball:{p:[0,0,28]},drone:{p:[0,F,60]}},
  {n:'Left of goal',ball:{p:[-14,0,32]},drone:{p:[-6,F,66]}},
  {n:'Right of goal',ball:{p:[14,0,32]},drone:{p:[6,F,66]}},
  {n:'Rolling in',ball:{p:[0,0,55],v:[0,0,-10]},drone:{p:[0,F,85]}},
  {n:'Drop and score',tip:'Meet it as it bounces',ball:{p:[0,14,30]},drone:{p:[0,F,62]}},
  {n:'Cross roll',ball:{p:[-30,0,36],v:[12,0,0]},drone:{p:[10,F,70]}},
  {n:'Coming at you',ball:{p:[0,0,30],v:[0,0,12]},drone:{p:[0,F,72]}},
  {n:'Angle from the right',ball:{p:[22,0,24]},drone:{p:[40,F,58],yaw:-28}}]},
 {id:'striker-pro',cat:'striker',tier:1,name:'Angles',blurb:'Passes from the corners, bouncing balls and tight angles.',kind:'goal',t:8,shots:[
  {n:'Far post roller',ball:{p:[-30,0,40],v:[10,0,-6]},drone:{p:[-50,F,75],yaw:30}},
  {n:'Bouncing centre',ball:{p:[0,10,50],v:[0,14,-8]},drone:{p:[0,F,85]}},
  {n:'Corner pass',ball:{p:[-70,0,30],v:[28,6,0]},drone:{p:[0,F,70]}},
  {n:'Right corner pass',ball:{p:[70,0,30],v:[-28,6,0]},drone:{p:[0,F,70]}},
  {n:'Over your head',tip:'It comes from behind you',ball:{p:[0,6,85],v:[0,18,-22]},drone:{p:[0,F,60]}},
  {n:'Tight angle',ball:{p:[34,0,14]},drone:{p:[55,F,45],yaw:-34}},
  {n:'Long range',ball:{p:[0,0,80]},drone:{p:[0,F,105]}},
  {n:'Side roll',ball:{p:[40,0,45],v:[-14,0,-4]},drone:{p:[-20,F,80],yaw:30}}]},
 {id:'striker-allstar',cat:'striker',tier:2,name:'Volleys',blurb:'Crosses in the air, balls running away and long bombs.',kind:'goal',t:7,shots:[
  {n:'Centre volley',ball:{p:[-60,6,40],v:[30,22,0]},drone:{p:[0,F,72]}},
  {n:'High cross right',ball:{p:[60,6,35],v:[-30,24,0]},drone:{p:[0,F,70]}},
  {n:'From the sky',ball:{p:[0,40,45]},drone:{p:[0,F,80]}},
  {n:'Over the shoulder',ball:{p:[10,4,100],v:[0,22,-38]},drone:{p:[0,F,70]}},
  {n:'Running away',ball:{p:[8,0,30],v:[0,0,24]},drone:{p:[-6,F,50]}},
  {n:'Corner bounce',ball:{p:[-55,8,20],v:[10,20,10]},drone:{p:[-10,F,65],yaw:-20}},
  {n:'Long bomb',ball:{p:[0,0,110],v:[0,0,-6]},drone:{p:[0,F,135]}},
  {n:'Wall roll',ball:{p:[0,0,60],wall:14,v:[12,0,-14]},drone:{p:[0,F,80],yaw:20}}]},
 // ---- Goalie (your own goal; you start in front of it, facing the field)
 {id:'goalie-rookie',cat:'goalie',tier:0,name:'Keeper Basics',blurb:'Slow shots at the middle of the goal. Fly into the ball\'s path.',kind:'save',t:6,shots:[
  {n:'Straight roller',ball:{p:[0,0,70],aim:[0,0,-3,2.2]},drone:{p:[0,6,6],yaw:180}},
  {n:'Left low',ball:{p:[-20,0,70],aim:[-10,2,-3,2]},drone:{p:[0,6,6],yaw:180}},
  {n:'Right low',ball:{p:[20,0,70],aim:[10,2,-3,2]},drone:{p:[0,6,6],yaw:180}},
  {n:'Lob centre',ball:{p:[0,0,60],aim:[0,9,-3,2.2]},drone:{p:[0,6,6],yaw:180}},
  {n:'From the left',ball:{p:[-50,0,60],aim:[-6,4,-3,2.2]},drone:{p:[0,6,6],yaw:180}},
  {n:'From the right',ball:{p:[50,0,60],aim:[6,4,-3,2.2]},drone:{p:[0,6,6],yaw:180}}]},
 {id:'goalie-pro',cat:'goalie',tier:1,name:'Corners',blurb:'Faster shots into the corners and angled drives.',kind:'save',t:6,shots:[
  {n:'Top left',ball:{p:[0,0,75],aim:[-16,11,-3,1.6]},drone:{p:[0,6,6],yaw:180}},
  {n:'Top right',ball:{p:[0,0,75],aim:[16,11,-3,1.6]},drone:{p:[0,6,6],yaw:180}},
  {n:'Bottom left',ball:{p:[-15,0,75],aim:[-18,1,-3,1.6]},drone:{p:[0,6,6],yaw:180}},
  {n:'Bottom right',ball:{p:[15,0,75],aim:[18,1,-3,1.6]},drone:{p:[0,6,6],yaw:180}},
  {n:'Bouncer',ball:{p:[0,10,70],aim:[5,3,-3,1.6]},drone:{p:[0,6,6],yaw:180}},
  {n:'Angled from the right',ball:{p:[60,0,50],aim:[-14,7,-3,1.6]},drone:{p:[0,6,6],yaw:180}},
  {n:'Angled from the left',ball:{p:[-60,0,50],aim:[14,7,-3,1.6]},drone:{p:[0,6,6],yaw:180}}]},
 {id:'goalie-allstar',cat:'goalie',tier:2,name:'Rockets',blurb:'Hard, fast and close. Read it early.',kind:'save',t:6,shots:[
  {n:'Rocket top corner',ball:{p:[-10,0,85],aim:[17,11,-3,1.2]},drone:{p:[0,6,6],yaw:180}},
  {n:'Low drive',ball:{p:[10,0,85],aim:[-18,1,-3,1.1]},drone:{p:[0,6,6],yaw:180}},
  {n:'Close range',ball:{p:[0,0,40],aim:[17,10,-3,.85]},drone:{p:[0,6,6],yaw:180}},
  {n:'Dipping lob',ball:{p:[0,0,60],aim:[-12,9,-3,2]},drone:{p:[0,6,6],yaw:180}},
  {n:'Tight angle',ball:{p:[-75,4,25],aim:[8,6,-3,1.3]},drone:{p:[0,6,6],yaw:180}},
  {n:'Swerve',ball:{p:[30,0,80],aim:[-16,6,-3,1.2],w:[0,6,0]},drone:{p:[0,6,6],yaw:180}},
  {n:'Fast and low',ball:{p:[0,0,90],aim:[3,1,-3,1]},drone:{p:[0,6,6],yaw:180}}]},
 // ---- Aerial (the scoring touch must be at least req.air m up)
 {id:'aerial-rookie',cat:'aerial',tier:0,name:'Lift Off',blurb:'Balls popped up in front of the goal. Hit them before they land.',kind:'goal',req:{air:6},t:8,shots:[
  {n:'Pop-up',ball:{p:[0,6,32],v:[0,26,0]},drone:{p:[0,F,58]}},
  {n:'Pop-up left',ball:{p:[-14,6,34],v:[0,26,0]},drone:{p:[-6,F,60]}},
  {n:'Pop-up right',ball:{p:[14,6,34],v:[0,26,0]},drone:{p:[6,F,60]}},
  {n:'Hanging high',ball:{p:[0,24,36],v:[0,14,0]},drone:{p:[0,F,60]}},
  {n:'Floating to you',ball:{p:[0,12,30],v:[0,24,10]},drone:{p:[0,F,64]}},
  {n:'Gentle lob',ball:{p:[-24,4,45],v:[8,30,-2]},drone:{p:[0,F,72]}}]},
 {id:'aerial-pro',cat:'aerial',tier:1,name:'Up and Over',blurb:'High lobs, crosses and balls bouncing off the side walls.',kind:'goal',req:{air:10},t:8,shots:[
  {n:'High lob',ball:{p:[0,4,70],v:[0,36,-12]},drone:{p:[0,F,80]}},
  {n:'Cross from the left',ball:{p:[-60,6,30],v:[22,30,0]},drone:{p:[0,F,65]}},
  {n:'Cross from the right',ball:{p:[60,6,30],v:[-22,30,0]},drone:{p:[0,F,65]}},
  {n:'Off the right wall',ball:{p:[0,10,40],wall:10,v:[22,20,-4]},drone:{p:[0,F,70]}},
  {n:'Off the left wall',ball:{p:[0,10,40],wall:-10,v:[-22,20,-4]},drone:{p:[0,F,70]}},
  {n:'Sky ball',ball:{p:[0,40,40],v:[0,10,0]},drone:{p:[0,F,70]}},
  {n:'Back post',ball:{p:[20,8,20],v:[-6,28,6]},drone:{p:[-10,F,60]}}]},
 {id:'aerial-allstar',cat:'aerial',tier:2,name:'Wall Riders',blurb:'Balls rolled up and bounced off the walls, and high drops. Meet them in the air.',kind:'goal',req:{air:12},t:7,shots:[
  {n:'Wall roll right',ball:{p:[0,0,50],wall:14,v:[30,0,-6]},drone:{p:[0,F,75]}},
  {n:'Wall roll left',ball:{p:[0,0,50],wall:-14,v:[-30,0,-6]},drone:{p:[0,F,75]}},
  {n:'High off the right wall',ball:{p:[0,24,35],wall:12,v:[26,12,-6]},drone:{p:[0,F,70]}},
  {n:'High off the left wall',ball:{p:[0,24,35],wall:-12,v:[-26,12,-6]},drone:{p:[0,F,70]}},
  {n:'Top shelf lob',ball:{p:[0,4,90],v:[0,42,-20]},drone:{p:[0,F,100]}},
  {n:'From the ceiling',ball:{p:[-20,60,45],v:[6,0,0]},drone:{p:[0,F,80]}},
  {n:'Backboard',tip:'It bounces off the wall above the goal',ball:{p:[0,10,60],v:[0,30,-40]},drone:{p:[0,F,70]}},
  {n:'Corner cross',ball:{p:[-70,8,25],v:[30,30,0]},drone:{p:[10,F,70]}}]},
 // ---- Dribbling (carried on top for req.carry s before the goal)
 {id:'dribble-rookie',cat:'dribble',tier:0,name:'Balance',blurb:'The ball starts on top of your quad. Carry it in.',kind:'goal',req:{carry:1},t:12,shots:[
  {n:'On your back',ball:ON,drone:{p:[0,8,50]}},
  {n:'Left lane',ball:ON,drone:{p:[-20,8,55]}},
  {n:'Right lane',ball:ON,drone:{p:[20,8,55]}},
  {n:'Longer run',ball:ON,drone:{p:[0,8,80]}},
  {n:'Low and slow',ball:ON,drone:{p:[0,5,45]}},
  {n:'From the corner',ball:ON,drone:{p:[-40,8,60],yaw:30}}]},
 {id:'dribble-pro',cat:'dribble',tier:1,name:'Catch and Carry',blurb:'Catch dropped balls on top, then carry them in.',kind:'goal',req:{carry:1.5},t:12,shots:[
  {n:'Soft drop',ball:{p:[0,16,60]},drone:{p:[0,8,60]}},
  {n:'Drop left',ball:{p:[-20,16,65]},drone:{p:[-20,8,65]}},
  {n:'Drop right',ball:{p:[20,16,65]},drone:{p:[20,8,65]}},
  {n:'Drop ahead',ball:{p:[0,16,62]},drone:{p:[0,8,70]}},
  {n:'High drop',ball:{p:[0,30,70]},drone:{p:[0,8,70]}},
  {n:'Long carry',ball:ON,drone:{p:[0,8,100]}},
  {n:'Drop behind',ball:{p:[0,16,68]},drone:{p:[0,8,60]}}]},
 {id:'dribble-allstar',cat:'dribble',tier:2,name:'Flick Masters',blurb:'Lobs to catch, long carries from halfway.',kind:'goal',req:{carry:2},t:12,shots:[
  {n:'Lob to you',ball:{p:[0,8,90],aim:[0,11,60,1.4]},drone:{p:[0,10,60]}},
  {n:'Lob from the left',ball:{p:[-30,8,70],aim:[0,11,60,1.4]},drone:{p:[0,10,60]}},
  {n:'Lob from the right',ball:{p:[30,8,70],aim:[0,11,60,1.4]},drone:{p:[0,10,60]}},
  {n:'Halfway line',ball:ON,drone:{p:[0,8,120]}},
  {n:'Over the top',ball:{p:[0,10,40],aim:[0,11,70,1.4]},drone:{p:[0,10,70]}},
  {n:'Sideways carry',ball:ON,drone:{p:[-50,8,70],yaw:40}},
  {n:'Drop and run',ball:{p:[0,30,100]},drone:{p:[0,8,100]}}]},
 // ---- Pops (goal: the scoring touch is a pop; zone: after a pop, the first landing is inside the ring)
 {id:'pops-rookie',cat:'pops',tier:0,name:'First Pops',blurb:'The ball starts on top: you have a pop. Hold a direction and press flip.',kind:'goal',req:{pop:true},t:10,shots:[
  {n:'Pop it in',ball:ON,drone:{p:[0,10,32]}},
  {n:'Pop from the left',ball:ON,drone:{p:[-10,10,34]}},
  {n:'Pop from the right',ball:ON,drone:{p:[10,10,34]}},
  {n:'Target: short',kind:'zone',ball:ON,drone:{p:[0,8,60]},zone:{x:0,d:24,r:10}},
  {n:'Target: left',kind:'zone',ball:ON,drone:{p:[0,8,60]},zone:{x:-14,d:27,r:10}},
  {n:'Target: right',kind:'zone',ball:ON,drone:{p:[0,8,60]},zone:{x:14,d:27,r:10}}]},
 {id:'pops-pro',cat:'pops',tier:1,name:'Pop Shots',blurb:'Longer pops, angled pops and smaller targets.',kind:'goal',req:{pop:true},t:9,shots:[
  {n:'Mid-range pop',ball:ON,drone:{p:[0,12,48]}},
  {n:'Pop from the left',ball:ON,drone:{p:[-24,12,48],yaw:25}},
  {n:'Pop from the right',ball:ON,drone:{p:[24,12,48],yaw:-25}},
  {n:'Catch and pop',ball:{p:[0,22,40]},drone:{p:[0,10,40]}},
  {n:'Target: long',kind:'zone',ball:ON,drone:{p:[0,10,80]},zone:{x:0,d:42,r:8}},
  {n:'Target: far left',kind:'zone',ball:ON,drone:{p:[0,10,80]},zone:{x:-22,d:46,r:8}},
  {n:'Target: far right',kind:'zone',ball:ON,drone:{p:[0,10,80]},zone:{x:22,d:46,r:8}}]},
 {id:'pops-allstar',cat:'pops',tier:2,name:'Pop Masters',blurb:'Long pops, catches into pops and small, far targets.',kind:'goal',req:{pop:true},t:8,shots:[
  {n:'Long-range pop',ball:ON,drone:{p:[0,14,70]}},
  {n:'Lob, catch, pop',ball:{p:[-20,8,70],aim:[0,13,50,1.3]},drone:{p:[0,10,50]}},
  {n:'Sideways pop',ball:ON,drone:{p:[30,12,40],yaw:-60}},
  {n:'Target: deep',kind:'zone',ball:ON,drone:{p:[0,12,100]},zone:{x:0,d:58,r:6}},
  {n:'Target: corner',kind:'zone',ball:ON,drone:{p:[0,12,90]},zone:{x:-34,d:54,r:7}},
  {n:'Target: behind you',kind:'zone',ball:ON,drone:{p:[0,10,60],yaw:180},zone:{x:0,d:97,r:7}},
  {n:'Catch and pop: target',kind:'zone',ball:{p:[0,24,70]},drone:{p:[0,10,70]},zone:{x:0,d:33,r:7}}]}];
export const packById=id=>PACKS.find(p=>p.id===id)||null;
export const packsOf=cat=>PACKS.filter(p=>p.cat===cat).sort((a,b)=>a.tier-b.tier);
