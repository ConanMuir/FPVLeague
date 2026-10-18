// Chassis (body: plates, stack, canopy, camera). Pure data; parts/index.js derives mass, inertia, drag, ball grip and hitboxes.
// Units: metres at drone size 1, body frame (x right, y up, -z forward). The arms bolt on at y = 0.
//  shape: mesh/collider style ('box' | 'slim' | 'brick' | 'plank' | 'pod'); half: half-extents [x,y,z]; y: centre height
//  mass: grams (frame plates, stack, camera, VTX, canopy); cd: form drag factor (exposed stack > rounded shell)
//  flat: how flat and grippy the top and nose are for carrying the ball (round shells let it roll off)
//  kick: added touch restitution (hard bumpers hit harder, a soft deck cushions the ball)
//  bay: how far the battery sinks into the body (0 = strapped on top, 1 = fully inside)
//  cam: FPV camera position [y, z] (z is the lens plane, negative = forward)
export const CHASSIS=[
 {id:'stock',name:'Stock Box',sub:'two-plate stack with alloy standoffs',shape:'box',half:[.16,.065,.28],y:.045,mass:220,cd:1.2,flat:.9,kick:0,cam:[.07,-.31],
  good:[],bad:[],
  pros:[],cons:['Boxy, exposed stack: draggy and heavy for what it does','No strengths']},
 {id:'slim',name:'Slim Racer',sub:'narrow carbon fuselage, low canopy',shape:'slim',half:[.095,.05,.32],y:.03,mass:125,cd:.8,flat:.75,kick:-.02,cam:[.05,-.34],
  good:['speed','punch','boost'],bad:['hit','ball'],
  pros:['Lightest body: more punch and boost','Low frontal area: higher top speed'],cons:['Light: weaker ball hits','Narrow nose: poor ball control']},
 {id:'brick',name:'Brick',sub:'armoured block with bumpers',shape:'brick',half:[.25,.11,.4],y:-.05,mass:246,cd:.94,flat:1.15,kick:.3,cam:[.12,-.39],
  good:['hit','ball'],bad:['speed','roll','pitch','yaw'],
  pros:['Heavy, with hard bumpers: the hardest ball hits','Broad flat top: carries the ball well'],cons:['Big and heavy: slower on every axis','Lots of frontal area: lower top speed','Big target in Dogfight']},
 {id:'plank',name:'Low-Pro Plank',sub:'wide flat deck, arms sandwiched',shape:'plank',half:[.25,.035,.31],y:0,mass:165,cd:.86,flat:1.5,kick:-.05,cam:[.05,-.34],
  good:['ball','punch','boost'],bad:['hit'],
  pros:['Wide flat deck: the best ball control and dribbling','Light and thin: more punch'],cons:['Soft deck: weaker hits']},
 {id:'pod',name:'Pod',sub:'rounded aero shell, mass at the centre',shape:'pod',half:[.13,.13,.32],y:.05,bay:.8,mass:180,cd:.66,flat:.5,kick:.07,cam:[.07,-.36],
  good:['speed','punch','boost'],bad:['ball'],
  pros:['Smooth shell with the pack tucked inside: the lowest drag','Light and nimble for its size'],cons:['Round shell: the ball rolls off, the worst ball control']},
];
