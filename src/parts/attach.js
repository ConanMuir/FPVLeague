// Attachments: the 4th Garage slot, bolt-ons on top of the arms/chassis/power build. Pure data; parts/index.js folds each one
// into mass, inertia, drag, thrust, grip and the hitbox, so the trade-offs come out of the physics like the other parts.
// 'none' is the neutral default (no penalty: attachments are optional). Units: metres at drone size 1, body frame (-z forward).
//  mass: grams; at(c,B): where that mass sits ('motors' spreads it over the four motors); drag: added area [side, prop-disc, front] (m²)
//  cols(c,B): extra colliders {shape,size,pos} (tag 'other'); ducts: grow the prop colliders to the duct ring instead
//  thrust: x motor thrust (ducted props); spool: x spool time; grip: x ball grip; kick: added touch restitution; armor: x damage taken
export const ATTACH=[
 {id:'none',name:'None',sub:'bare frame, nothing bolted on',mass:0,
  good:[],bad:[],pros:['Nothing extra to carry or catch the air'],cons:['No extras']},
 {id:'ram',name:'Ram Bumper',sub:'carbon nose bar on rubber standoffs',mass:45,at:c=>[[0,c.y,-(c.half[2]+.07)]],drag:[.003,0,.03],kick:.3,
  cols:c=>[{shape:'box',size:[.2,.03,.03],pos:[0,c.y,-(c.half[2]+.07)]}],
  good:['hit'],bad:['pitch','yaw','punch','boost'],
  pros:['Hard nose bar: the strongest ball hits and bumps'],cons:['Weight out at the nose: slower pitch and yaw','Extra weight: less punch and boost','Longer hitbox']},
 {id:'cage',name:'Ball Cage',sub:'wire hoops over the stack that cradle the ball',mass:38,at:(c,B)=>[[0,B.cTop+.08,0]],drag:[.01,.03,.016],grip:1.8,kick:-.04,
  cols:(c,B)=>[{shape:'box',size:[c.half[0]+.02,.06,Math.max(.16,c.half[2]*.8)],pos:[0,B.cTop+.08,0]}],
  good:['ball'],bad:['punch','boost'],
  pros:['Cradles the ball on top: much better dribbling and control'],cons:['Extra weight: less punch and boost','Catches the air when flying fast','Taller hitbox']},
 {id:'ducts',name:'Prop Ducts',sub:'cinewhoop-style guards around every prop',mass:56,at:'motors',drag:[.012,.006,.012],thrust:1.15,spool:1.12,ducts:.025,
  good:['punch','speed'],bad:['roll','pitch','yaw','resp','boost'],
  pros:['Ducted props make more thrust: more punch and a little more top speed'],cons:['Weight out at the motors: slower on every axis','Slower spool','Heavier: less boost','Wider hitbox']},
 {id:'wheels',name:'Wheels',sub:'four skate wheels under the arms: roll on the ground like a car',mass:48,at:'motors',drag:[.004,0,.004],wheels:true,
  good:['ground'],bad:['punch','boost','roll','pitch','yaw'],
  pros:['Rolls along the ground and grips sideways: drive, turn and dribble on the floor','Stays planted on a hard landing instead of tumbling'],cons:['Weight out at the motors: slower to rotate, less punch and boost','No help at all in the air']},
 {id:'armor',name:'Armor Plates',sub:'kevlar plates over the stack and arms',mass:90,at:(c,B)=>[[0,c.y,0],[0,c.y,0],'motors'],drag:[.004,.002,.004],armor:.7,
  good:['tough'],bad:['punch','boost','roll','pitch'],
  pros:['Takes 30% less damage in Dogfight'],cons:['The heaviest bolt-on: less punch and boost','Slower to rotate']},
];
