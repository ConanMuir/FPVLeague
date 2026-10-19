// ---------- typed event bus: game events for sound, effects, judges, bots and stats ----------
// Leaf module (no imports). Producers call emitEv(type, payload); consumers subscribe with onEv(type, fn), which returns an unsubscribe.
// Listeners run synchronously, in the order they subscribed, inside the producer's call, so they see the world exactly as the producer
// left it (ball and drones mid-step for the physics events).
//
// Cost: emitEv does no allocation. Listener lists are copied on subscribe/unsubscribe, never on emit, so a listener may unsubscribe
// itself (or add others) while an event is being delivered. Hot producers (touch, bump, ground) check hasEv(type) first when building
// the payload costs anything.
//
// Payloads are REUSED: each producer keeps one object per event type (and its vectors) and overwrites it for every event. A listener
// must read what it needs before returning and copy anything it keeps (vectors with .copy(), numbers by value); never store the payload
// or its p / n. The payload's `type` field is the old physics/world.js onHit type for the four contact events, so onHit listeners keep working.
//
// Event types and payloads (d = Drone; p, n = THREE.Vector3; team = 0 blue / 1 orange):
//  touch    a drone touched the ball (modes/step.js)       {type:'ball', d, tag: part touched, speed: closing speed (m/s), p: contact point, n: normal drone->ball,
//                                                           verdict: '' | 'save' | 'shot' (match crowd judgement: a defender turned an on-target ball away / a shot on target)}
//  bump     two drones touched (modes/step.js)             {type:'drone', d, tag, other: Drone, otherTag, speed}
//  bullet   a bullet hit a drone (modes/guns.js)           {type:'bullet', d, tag, other: shooter (Drone | turret | null)}
//  ground   a stepped drone touched the map (physics/world.js), every tick in contact  {type:'ground', d, tag:'chassis', speed: impact speed, slide: sliding speed, p, n: surface normal}
//  bounce   the ball hit the map hard (> 3 m/s) (modes/step.js)   {speed}
//  popEarn  a drone earned (or refreshed after none) a pop: the ball on top, inside the motors (modes/step.js)  {d, p: ring centre, n: ring facing, r: ring radius}
//  popFire  a drone fired its pop (flight/drone.js)         {d, dur: the locked turn (s)}
//  save     a defender turned an on-target ball away (modes/step.js, before the touch event)  {d, speed}
//  shot     a touch sent the ball on target at the other goal, over 12 m/s (modes/step.js, before the touch event)  {d, speed}
//  goal     a goal, on the host and on joiners (modes/match.js goalFx)  {team: scoring team, by: key of the last toucher | null, p: ball position}
//  demo     a demolition (modes/match.js)                  {d: victim, by: Drone}
//  kill     Dogfight: a drone shot down or a turret destroyed (modes/dogfight.js, host/offline)  {d: victim drone or turret, by: Drone | turret | null}
//  kickoff  a kickoff starts (modes/match.js)              {n: kickoff number (GS.koN)}
//  count    the kickoff countdown ticks, 3 2 1 then 0 = GO (modes/step.js, not in the attract demo)  {n}
//  orb      a drone picked up a boost orb (modes/step.js)  {d, big: bool, p: orb position}
//  end      the match ended (modes/match.js endFx, host and joiners)  {winner: team, score: GS.score}
// Replays: effects and sound subscribe with onFx instead, so they also hear the recorded copies a replay sends (see the end of this file).
// Adding a type: add it to EVENTS with a one-line payload description above, emit it from its producer with a reused payload object.
export const EVENTS=['touch','bump','bullet','ground','bounce','popEarn','popFire','save','shot','goal','demo','kill','kickoff','count','orb','end'];
const L=Object.create(null);for(const t of EVENTS)L[t]=[];
const check=t=>{if(!L[t])throw new Error('unknown event type: '+t)};
/** subscribe fn(payload) to an event type; returns a function that unsubscribes it */
export function onEv(type,fn){check(type);L[type]=[...L[type],fn];return()=>{L[type]=L[type].filter(f=>f!==fn)}}
/** deliver payload to every listener of type (no allocation; unknown types are a programming error and throw) */
export function emitEv(type,e){const a=L[type];if(!a)check(type);for(let i=0;i<a.length;i++)a[i](e)}
/** is anyone listening? (lets hot producers skip building a payload) */
export const hasEv=type=>L[type]?.length>0;
// Replays (render/replay.js) send recorded copies of some events with replayEv. Only cosmetic listeners, subscribed with onFx (effects
// and sound), hear those; onEv listeners (judges, stats, bots, progression) never do, so a replayed touch or goal can't count twice.
const F=Object.create(null);for(const t of EVENTS)F[t]=[];
/** subscribe a cosmetic listener: it hears every live event (like onEv) and every replayed one; returns the unsubscribe */
export function onFx(type,fn){const off=onEv(type,fn);F[type]=[...F[type],fn];return()=>{off();F[type]=F[type].filter(f=>f!==fn)}}
/** deliver a replayed event to the onFx listeners only */
export function replayEv(type,e){const a=F[type];if(!a)check(type);for(let i=0;i<a.length;i++)a[i](e)}
