// ---------- game modes: the registry ----------
// Every game mode registers itself here from its own file in src/modes/. The menu's mode buttons, the saved-setting check,
// the online lobby label and setGame() all read this list, so adding a mode is one new file plus one import line in main.js.
// def: {name: menu button + lobby label, title: big menu heading, sub: menu blurb, order: button position,
//       world: 'arena' (pitch, ball, goals, orbs on the pitch) | 'highlands' (Dogfight terrain, guns, turrets, orbs over the valley)}
// A mode with a new kind of world adds a world id here and handles it in setGame() (modes/dogfight.js) and setMap().
export const MODES={};
export function registerMode(id,def){MODES[id]={id,order:99,world:'arena',...def}}
export const modeList=()=>Object.values(MODES).sort((a,b)=>a.order-b.order);
export const modeId=id=>typeof id==='string'&&Object.hasOwn(MODES,id)?id:'league';  // unknown or untrusted ids fall back to League
