// Calibration Lab presets: what "good" looks like (targets) and how far the tuner may move each setting (bounds).
// Target units: os/us % of the move, settle/lag ms, osc count, track ° RMS, over ° past level, alt × band half-height, react s.
// Bounds: c centre °/s, m max °/s, e expo 0..1 for roll/pitch (cy/my/ey for yaw), dz/dzy stick deadband (fraction of
// half stick; Betaflight deadband = dz × 500, so 0.064 = BF's max of 32: gamepads with stick drift may need up to the menu's
// 0.15), tm/te throttle mid/expo %, tl throttle limit % (a twitchy 10:1 quad gets more stick travel per unit of thrust), as assist 0..1. Everything else stays inside sane Betaflight ranges.
export const PRESETS={
 def:{id:'def',name:'Default',type:null,blurb:'Forgiving: gentler centre and more expo. Keeps your rates type. Never adds assist.',
  tg:{os:12,us:15,settle:600,osc:1,lag:220,track:6,over:20,alt:.6,react:.45},
  b:{c:[60,260],m:[400,900],e:[.15,.7],cy:[50,220],my:[300,720],ey:[.1,.7],dz:[.01,.15],dzy:[.01,.2],tm:[10,70],te:[0,60],tl:[60,100],as:[0,0]},
  g0:.12},
 pro:{id:'pro',name:'Pro',type:'ACTUAL',blurb:'Real FPV pilot setup: Actual rates, high centre and max rate, low expo, no assists. Penalises stick-to-quad lag.',
  tg:{os:5,us:8,settle:300,osc:0,lag:110,track:3.5,over:10,alt:.35,react:.35},
  b:{c:[120,420],m:[600,1300],e:[0,.45],cy:[100,360],my:[400,1000],ey:[0,.45],dz:[0,.15],dzy:[0,.2],tm:[10,60],te:[0,40],tl:[70,100],as:[0,0]},
  g0:.1}};
// labels for showing a preset's targets: key -> [name, format]
export const TGTXT={os:['Overshoot','≤ %v%'],us:['Stops short','≤ %v%'],settle:['Settle','≤ %v ms'],osc:['Wobbles','≤ %v'],lag:['Stick-to-quad lag','≤ %v ms'],
 track:['Tracking error','≤ %v° RMS'],over:['Over-correction','≤ %v°'],alt:['Height overshoot','≤ %v band'],react:['Dodge reaction','≤ %v s']};
