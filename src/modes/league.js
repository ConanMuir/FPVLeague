// ---------- League mode: Rocket League-style soccer in the arena ----------
// The match flow lives in modes/match.js and modes/step.js; this file registers the mode.
import {registerMode} from './registry.js';
registerMode('league',{name:'Drone League',title:'LEAGUE',world:'arena',order:0,
 sub:'Rocket-powered soccer for 5-inch acro quads. Betaflight-style rates, FPV uptilt, boost orbs and bots that read the ball.'});
