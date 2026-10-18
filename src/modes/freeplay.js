// ---------- Freeplay: you and the ball, no bots, no clock (Rocket League's free play) ----------
// Goals still score and reset the ball. R / Xbox Y (reset) only works here (input.js canReset).
import {registerMode} from './registry.js';
registerMode('free',{name:'Freeplay',title:'FREEPLAY',world:'arena',order:2,free:true,
 sub:'Just you and the ball: no bots, no clock. Practise touches, dribbles, aerials and pops. R (Xbox Y) resets your drone.'});
