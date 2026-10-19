// Power (motors + battery). Pure data; parts/index.js turns it into thrust, pitch speed, spool, thrust curve and boost.
//  motor: mass g each, thrust g each on a 5" (r .29) prop at full throttle, bell radius/height (m at size 1, also sets yaw torque)
//  kv: vp = prop pitch speed factor (rpm), te = thrust-curve factor (>1: soft bottom, hard top), spool = motor spool time factor
//  batt: mass g, half-extents [x,y,z] (sits on top of the chassis under a strap), cells label, style 'lipo' | 'liion'
//  look: wrap / label / bell colours (tints of the shared pack, label and metal materials)
//  fly.batt.half: the pack block the flight model uses (packs were drawn bigger later; handling kept)
//  drain: boost drain factor (pack capacity and efficiency: lower lasts longer)
export const POWER=[
 {id:'stock',name:'Stock 6S',sub:'2207 1750KV · 6S 1100 mAh LiPo',motor:{mass:36,thrust:1400,r:.062,h:.06},kv:{vp:1,te:1,spool:1.18},
  batt:{mass:205,half:[.091,.085,.18],cells:'6S 1100',style:'lipo'},fly:{batt:{half:[.07,.045,.15]}},look:{wrap:0x24272e,label:0xffc640,bell:0x8a919c},drain:1.12,
  good:[],bad:[],
  pros:[],cons:['Budget motors: heavy for their thrust, slow to spool','Small pack: boost drains a little fast','No strengths']},
 {id:'punch',name:'6S Race Punch',sub:'2306.5 1950KV · 6S 1050 mAh 120C',motor:{mass:41,thrust:1700,r:.076,h:.055},kv:{vp:.9,te:.95,spool:.72},
  batt:{mass:195,half:[.088,.095,.156],cells:'6S 1050',style:'lipo'},fly:{batt:{half:[.068,.05,.13]}},look:{wrap:0x17181b,label:0xff3b3b,bell:0x34363c},drain:1.38,
  good:['punch','resp','yaw','roll','pitch'],bad:['boost'],
  pros:['Fat 2306 stators: the most thrust and yaw torque','The fastest spool: instant throttle'],cons:['Thirsty: the shortest boost']},
 {id:'eff',name:'4S Efficient',sub:'2204 2300KV · 4S 1500 mAh LiPo',motor:{mass:25,thrust:1280,r:.052,h:.048},kv:{vp:.86,te:.9,spool:1.05},
  batt:{mass:160,half:[.094,.067,.18],cells:'4S 1500',style:'lipo'},fly:{batt:{half:[.072,.035,.15]}},look:{wrap:0x2c3038,label:0x4ade80,bell:0xc4ccd6},drain:.62,
  good:['boost','roll','pitch','resp'],bad:['speed','hit'],
  pros:['Light 2204s on the arm tips: quick on every axis','Efficient: boost lasts twice as long','Softer, more linear thrust curve'],cons:['4S rpm: lower top speed','Light: weaker hits']},
 {id:'hikv',name:'High-KV',sub:'2207 2650KV · 6S 850 mAh, top-end tune',motor:{mass:33,thrust:1420,r:.058,h:.074},kv:{vp:1.24,te:1.12,spool:.88},
  batt:{mass:170,half:[.085,.08,.15],cells:'6S 850',style:'lipo'},fly:{batt:{half:[.065,.042,.125]}},look:{wrap:0x1e1f24,label:0xb57bff,bell:0xd0a24a},drain:1.42,
  good:['speed','resp','punch'],bad:['boost'],
  pros:['Huge rpm: the highest pitch speed and top speed','Quick spool'],cons:['Small pack: boost drains fast','Steeper thrust curve: soft bottom end, touchier hover']},
 {id:'lr',name:'Long-Range Pack',sub:'2207 1700KV · 6S2P 4000 mAh Li-ion + GPS',motor:{mass:34,thrust:1440,r:.062,h:.062},kv:{vp:.97,te:1,spool:1.08},
  batt:{mass:340,half:[.111,.114,.204],cells:'6S2P 4000',style:'liion'},fly:{batt:{half:[.085,.06,.17]}},look:{wrap:0x1d5a6e,label:0xe8edf5,bell:0x8a919c},drain:.42,
  good:['boost','hit'],bad:['punch'],
  pros:['4000 mAh Li-ion: by far the longest boost','Heavy: hits the ball harder'],cons:['Heavy: the least punch']},
];
