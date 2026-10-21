// ---------- Cosmetic unlocks: which Garage cosmetics a level or an achievement unlocks (pure data and rules) ----------
// Strictly looks: nothing here reaches the flight model, and parts (trade-offs, not upgrades) are never locked. Every item not
// listed is free from the start (all the defaults and most of the list), so a new pilot already has a full Garage to play with.
// A locked item is unlocked by its level, its achievement, or a grant (progress/profile.js: items you wore before progression came in).
import {ACH} from './achievements.js';
import {COS,COS_DEF} from '../parts/cosmetics.js';
import {levelOf} from './xp.js';
export const LEVEL_UNLOCKS=[[3,'led:amber'],[4,'props:ice'],[5,'decal:flames'],[6,'paint:forged'],[8,'trail:fire'],[9,'decal:tiger'],[10,'paint:midnight'],[12,'props:amber'],
 [13,'bell:ti'],[15,'paint:teammet'],[18,'decal:n88'],[20,'paint:chrome'],[30,'paint:pearl'],[40,'trail:rainbow'],[50,'paint:bchrome']];
// key 'cat:id' -> {lv} or {ach}
export const UNLOCK=new Map([...LEVEL_UNLOCKS.map(([lv,k])=>[k,{lv}]),...ACH.filter(a=>a.reward).map(a=>[a.reward,{ach:a.id}])]);
export const cosKey=(c,id)=>c+':'+id;
// the requirement still in the way of cat/id for profile P ({lv} / {ach}), or null when it is unlocked
export function lockOf(P,c,id){const k=cosKey(c,id),u=UNLOCK.get(k);if(!u||COS_DEF[c]===id)return null;if(P&&(P.grant?.includes(k)||u.lv&&levelOf(P.xp).lv>=u.lv||u.ach&&P.ach?.[u.ach]))return null;return u}
export const isUnlocked=(P,c,id)=>!lockOf(P,c,id);
export function reqText(u){if(!u)return'';if(u.lv)return'Reach level '+u.lv;const a=ACH.find(x=>x.id===u.ach);return'Achievement: '+(a?a.name:u.ach)}
// the cosmetic {cat, id, item} a key names (null if unknown)
export function cosOf(k){const[c,id]=String(k).split(':'),it=COS[c]?.find(x=>x.id===id);return it?{c,id,it}:null}
// the cosmetics that unlock between two profile states (for "Unlocked: ..." after a match): keys
export function newlyUnlocked(before,after){const out=[];for(const k of UNLOCK.keys()){const[c,id]=k.split(':');if(lockOf(before,c,id)&&!lockOf(after,c,id))out.push(k)}return out}
