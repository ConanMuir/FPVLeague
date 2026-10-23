/* ---------- evolved bot levels in the game: src/bots/evolved.json (written by tools/bot-ladder.mjs) goes on the end of DIFF ---------- */
/* Imported first by bots/league.js, so the levels are in DIFF before the menu lists them (ui/menu.js reads DIFF when it loads; match.js
   pulls league.js in before the menu). Without the file nothing changes: import.meta.glob matches nothing and the build carries no JSON. */
import {DIFF} from '../config/constants.js';
import {S} from '../config/settings.js';
import {DIFF_F} from '../progress/xp.js';
import {evolvedLevels} from './evolved-levels.js';
const FILES=import.meta.glob('./evolved.json',{eager:true,import:'default'});
export const EVOLVED=evolvedLevels(FILES['./evolved.json'],DIFF.map(d=>d.n));
for(const p of EVOLVED){const b=DIFF.findIndex(d=>d.n===p.arch);DIFF_F.push(DIFF_F[b]??1);DIFF.push(p)}  /* XP counts it as its archetype */
/* the saved bot skill can't point at these yet (settings.js checks it against DIFF before they exist and writes the default back), so the
   pick is kept by id on its own and restored here; the menu's select (ui/menu.js f_diff) sets S.diff before this listener sees the event */
const KEY='dlEvolved';
if(EVOLVED.length){try{const id=localStorage.getItem(KEY),i=id?DIFF.findIndex(d=>d.id===id):-1;if(i>=0)S.diff=i}catch(e){}
 if(typeof document!=='undefined')document.addEventListener('input',e=>{if(e.target?.id!=='f_diff')return;try{const d=DIFF[S.diff];if(d?.id)localStorage.setItem(KEY,d.id);else localStorage.removeItem(KEY)}catch(e){}})}
