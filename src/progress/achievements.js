// ---------- Achievements: visible goals with progress bars (pure data and rules, so npm test checks them) ----------
// Each: id (saved in the profile: never rename one; unknown ids in a save are dropped), cat, name, desc, goal (the number to reach),
// val(V): the current number from the profile view V (progress/profile.js view(): lifetime stats plus the match in progress),
// reward: the cosmetic 'cat:id' it unlocks (progress/unlocks.js). Stats count League and Dogfight matches only (not Freeplay or Training).
import {PACKS} from '../training/packs.js';
const st=(m,k)=>V=>V.st[m]?.[k]||0,best=k=>V=>V.best[k]||0,feat=k=>V=>V.feat[k]||0;
export const TIER_N=[0,1,2].map(t=>PACKS.filter(P=>P.tier===t).length);
// training counts from S.train ({packId: {n, of, t}}): packs cleared (every shot done), per tier
export function packCounts(train){const o={done:0,tier:[0,0,0],shots:0};if(!train||typeof train!=='object')return o;
 for(const P of PACKS){const b=train[P.id];if(!b)continue;o.shots+=Math.min(b.n|0,P.shots.length);if((b.n|0)>=P.shots.length){o.done++;o.tier[P.tier]++}}return o}
export const ACH_CATS=[['score','Scoring'],['pops','Pops'],['def','Defence'],['match','Matches'],['train','Training'],['df','Dogfight']];
export const ACH=[
 {id:'goal1',cat:'score',name:'Off the Mark',desc:'Score a goal in a League match.',goal:1,val:st('league','goals')},
 {id:'goal25',cat:'score',name:'Sharpshooter',desc:'Score 25 League goals.',goal:25,val:st('league','goals')},
 {id:'goal100',cat:'score',name:'Centurion',desc:'Score 100 League goals.',goal:100,val:st('league','goals'),reward:'decal:n99'},
 {id:'hat',cat:'score',name:'Hat Trick',desc:'Score 3 goals in one match.',goal:3,val:best('goals'),reward:'decal:check'},
 {id:'aerial',cat:'score',name:'Air Mail',desc:'Score with a touch at least 4 m off the floor.',goal:1,val:st('league','aerial')},
 {id:'adrib',cat:'score',name:'Air Dribbler',desc:'Score after carrying the ball through the air on your quad.',goal:1,val:st('league','adrib'),reward:'trail:comet'},
 {id:'popg',cat:'score',name:'Pop Shot',desc:'Score with a pop.',goal:1,val:st('league','popg')},
 {id:'assist10',cat:'score',name:'Playmaker',desc:'Set up 10 goals for a team-mate.',goal:10,val:st('league','assists')},
 {id:'shots50',cat:'score',name:'Trigger Happy',desc:'Put 50 shots on target.',goal:50,val:st('league','shots')},
 {id:'chain3',cat:'pops',name:'Chain Reaction',desc:'Pop the ball 3 times in a row before it lands.',goal:3,val:best('chain'),reward:'props:glow'},
 {id:'chain5',cat:'pops',name:'Juggler',desc:'Pop the ball 5 times in a row before it lands.',goal:5,val:best('chain')},
 {id:'pops100',cat:'pops',name:'Popcorn',desc:'Hit the ball with 100 pops in matches.',goal:100,val:st('league','pops')},
 {id:'save1',cat:'def',name:'Last Line',desc:'Make a save.',goal:1,val:st('league','saves')},
 {id:'save50',cat:'def',name:'The Wall',desc:'Make 50 saves.',goal:50,val:st('league','saves'),reward:'bell:oil'},
 {id:'save5m',cat:'def',name:'Brick Wall',desc:'Make 5 saves in one match.',goal:5,val:best('saves')},
 {id:'clean',cat:'def',name:'Clean Sheet',desc:'Win a League match without conceding.',goal:1,val:feat('clean'),reward:'paint:jade'},
 {id:'demo1',cat:'def',name:'Wrecking Ball',desc:'Demolish an opponent.',goal:1,val:st('league','demos')},
 {id:'demo25',cat:'def',name:'Demolition Crew',desc:'Demolish 25 opponents.',goal:25,val:st('league','demos')},
 {id:'win1',cat:'match',name:'First Win',desc:'Win a League match.',goal:1,val:st('league','w')},
 {id:'win25',cat:'match',name:'Seasoned',desc:'Win 25 League matches.',goal:25,val:st('league','w'),reward:'decal:n01'},
 {id:'streak3',cat:'match',name:'Hot Streak',desc:'Win 3 matches in a row.',goal:3,val:V=>V.bstreak||0,reward:'props:gold'},
 {id:'comeback',cat:'match',name:'Comeback Kid',desc:'Win a match after trailing by 2 goals.',goal:1,val:feat('comeback')},
 {id:'ot',cat:'match',name:'Sudden Death',desc:'Win a match in overtime.',goal:1,val:feat('ot')},
 {id:'champ',cat:'match',name:'Champion Material',desc:'Win a League match against Champion bots or harder, with no bot team-mates.',goal:1,val:feat('champ')},
 {id:'gc',cat:'match',name:'Giant Slayer',desc:'Win a League match against Grand Champion bots, with no bot team-mates.',goal:1,val:feat('gc'),reward:'paint:gold'},
 {id:'m50',cat:'match',name:'Regular',desc:'Finish 50 matches.',goal:50,val:V=>V.m||0},
 {id:'pack1',cat:'train',name:'Homework',desc:'Clear every shot of a training pack.',goal:1,val:V=>V.train.done},
 {id:'rookies',cat:'train',name:'Graduate',desc:'Clear every Rookie training pack.',goal:TIER_N[0],val:V=>V.train.tier[0]},
 {id:'allstar',cat:'train',name:'All-Star',desc:'Clear every All-Star training pack.',goal:TIER_N[2],val:V=>V.train.tier[2],reward:'trail:gold'},
 {id:'packs10',cat:'train',name:'Student of the Game',desc:'Clear 10 training packs.',goal:10,val:V=>V.train.done},
 {id:'kill1',cat:'df',name:'First Blood',desc:'Shoot down a drone in Dogfight.',goal:1,val:st('df','kills')},
 {id:'kill10',cat:'df',name:'Dogfighter',desc:'Shoot down 10 drones.',goal:10,val:st('df','kills')},
 {id:'ace',cat:'df',name:'Ace',desc:'Shoot down 5 drones in one Dogfight match.',goal:5,val:best('kills'),reward:'led:ace'},
 {id:'kill100',cat:'df',name:'Top Gun',desc:'Shoot down 100 drones.',goal:100,val:st('df','kills'),reward:'trail:contrail'},
 {id:'tur10',cat:'df',name:'Tank Buster',desc:'Destroy 10 enemy turrets.',goal:10,val:st('df','turrets')},
 {id:'dfwin',cat:'df',name:'Air Superiority',desc:'Win a Dogfight match.',goal:1,val:st('df','w')}];
export const achById=id=>ACH.find(a=>a.id===id);
// progress of one achievement in view V: {v: current (capped at goal), goal, f: 0..1, done}
export function achProg(a,V){const v=Math.max(0,Math.min(a.goal,+a.val(V)||0));return{v,goal:a.goal,f:a.goal?v/a.goal:1,done:v>=a.goal}}
