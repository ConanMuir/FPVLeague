// ---------- the fixed-step clock of main.js frame(): 120 Hz sim ticks, any display rate ----------
// Leaf module (no imports, no DOM): tools/league-judder.mjs replays it in node for a range of refresh rates.
// Each rendered frame adds its real time x rate (time scale x Game speed) to the accumulator and runs the whole ticks it holds (at most
// MAXN a frame). Slow motion (time scale < 1: the goal slow-mo) instead steps every frame by that frame's own smaller dt, so it never
// stutters. advance() returns the render alpha: where the drawn moment sits between the previous tick (0) and the current one (1).
// Leaving slow motion: a slow frame draws the state it stepped to (alpha 1, also on the frame whose ticks bring the time scale back to 1),
// a fixed-step frame draws one tick behind, so the first fixed-step frame starts with a full tick in hand (one tick runs at once). The old
// clock (carry=false) drew that last slow frame a step back and the next ones at half speed: a one-tick hiccup at every goal's end.
export const DT=1/120,MAXN=12;
export function makeLoop(tick,carry=true){let acc=0,slow=false;  // carry=false: the old exit from slow motion (tools/league-judder.mjs compares)
 return{
  /** dt: real seconds since the last frame (capped by the caller); paused: no ticks; scale(): the time scale now (it may change inside a tick); k: Game speed */
  advance(dt,paused,scale,k){if(!paused){if(scale()<1){let r=Math.min(dt,.05)*scale()*k;while(r>1e-6){const h=Math.min(DT,r);tick(h);r-=h}acc=0;slow=true;if(carry)return 1}
    else{if(slow){if(carry)acc=DT;slow=false}acc+=dt*scale()*k;let n=0;while(acc>=DT&&n++<MAXN){tick(DT);acc-=DT}}}
   return scale()<1?1:Math.min(1,acc/DT)},
  get acc(){return acc}}}
