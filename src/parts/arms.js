// Arm sets (frame arms + props). Pure data: parts/index.js derives inertia, authority, thrust and hitboxes from it.
// Units: metres in the body frame at drone size 1 (the default "Drone size" 0.75), x right, y up, -z forward (camera side).
//  front/rear: [lateral x, longitudinal z] of the front and rear motors (mirrored left/right)
//  prop: r = prop radius (sets thrust, pitch speed, spool and the prop hitbox), twist = blade pitch angle at the root (rad)
//  arm: style 'x' (one tapered arm per motor) or 'h' (side rails plus a cross brace), w0/w1 root/tip width, t thickness
//  root: optional {front, rear} [x, z] where the x arms bolt to the body (mirrored like the motors); default the centre
//  plate: optional [half width, front, rear] of a long unibody bottom plate the arms bolt to (dead-cat); prop.chord: blade chord / radius (default .21)
//  mass: grams for the four arms plus props; stiff: how much of the motor's torque reaches the frame (flexy arms waste it)
//  drag: frontal-area factor of the arms themselves
//  good/bad: stat keys this part beats / loses to Stock on (checked by tools/parts-balance.mjs); pros/cons: garage text
export const ARMS=[
 {id:'stock',name:'Stock X',sub:'4 mm budget arms · 5" tri-blades',
  front:[.45,.45],rear:[.45,.45],prop:{r:.29,twist:.38,blades:3},arm:{style:'x',w0:.105,w1:.075,t:.034},mass:98,stiff:.88,drag:1.15,
  good:[],bad:[],
  pros:[],cons:['Flexy 4 mm arms waste a little authority on every axis','Heaviest, draggiest arm set','No strengths']},
 {id:'truex',name:'True-X Freestyle',sub:'equal-spaced 5 mm arms · 5.1" props',
  front:[.47,.47],rear:[.47,.47],prop:{r:.30,twist:.42,blades:3},arm:{style:'x',w0:.1,w1:.07,t:.04},mass:80,stiff:1.04,drag:1,
  good:['roll','pitch','punch','boost'],bad:['resp'],
  pros:['Stiff, equal arms: roll, pitch and yaw all crisp and matched','5.1" props: more punch and a more efficient boost'],cons:['Bigger props spool up slower','Slightly bigger prop hitbox']},
 {id:'stretch',name:'Stretch-X Racer',sub:'narrow, long racing layout · 4.8" props',
  front:[.38,.65],rear:[.38,.65],prop:{r:.275,twist:.48,blades:3},arm:{style:'x',w0:.085,w1:.06,t:.036},mass:66,stiff:1,drag:.78,
  good:['roll','resp'],bad:['pitch','yaw','boost'],
  pros:['Narrow motor spread: the fastest roll of any arms','Small props spool up quickly'],cons:['Long wheelbase: slower pitch and yaw','Small props work harder: shorter boost']},
 {id:'deadcat',name:'Dead-Cat',sub:'10" long-range dead-cat layout · big props out of view',
  front:[.6,.44],rear:[.5,.5],root:{front:[.07,.14],rear:[.07,.1]},plate:[.075,.56,.5],prop:{r:.36,twist:.3,blades:3,chord:.15},arm:{style:'x',w0:.12,w1:.07,t:.045},mass:92,stiff:.93,drag:1.02,
  good:['punch','boost','ball'],bad:['yaw','resp'],
  pros:['Big 10"-style props: big punch and the most efficient boost','Wide, swept front arms: a broad nose that carries the ball'],cons:['Long body, motors spread far: the slowest yaw of any arms','Heavy props: the slowest spool','Bigger target']},
 {id:'squash',name:'Squash-H',sub:'wide, short H-frame · 4.6" props',
  front:[.56,.33],rear:[.56,.33],prop:{r:.255,twist:.42,blades:3},arm:{style:'h',w0:.09,w1:.075,t:.036},mass:80,stiff:1.06,drag:1.08,
  good:['pitch','resp'],bad:['roll','punch','boost'],
  pros:['Short wheelbase: the snappiest pitch','Small props spool up instantly','Compact: the smallest hitbox'],cons:['Wide stance: slow roll','Small props: less punch and a shorter boost']},
];
// motor positions [x,z] in mixer order RR, LR, RF, LF: diagonal pairs spin the same way (Betaflight props-in)
// where motor [x,z]'s arm meets the body
export const rootOf=(a,x,z)=>{const r=a.root&&a.root[z<0?'front':'rear'];return r?[Math.sign(x)*r[0],Math.sign(z)*r[1]]:[0,0]};
export const motorsOf=a=>[[a.rear[0],a.rear[1]],[-a.rear[0],a.rear[1]],[a.front[0],-a.front[1]],[-a.front[0],-a.front[1]]];
