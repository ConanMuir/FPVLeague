// ---------- mod panel ----------
// physics sliders (config/mods.js MODS), presets, export/import
import {$} from '../config/constants.js';
import {MDEF,MODS,PRESETS,cleanMod} from '../config/mods.js';
import {S,save} from '../config/settings.js';
import {applyTune} from '../config/tune.js';
import {GS} from '../state.js';
const dec=st=>st>=1?0:Math.ceil(-Math.log10(st)-1e-9);
export function initModPanel(){{const body=$('modbody');let grp='';
 for(const[g,k,lab,def,mn,mx,st]of MODS){if(g!==grp){grp=g;const h=document.createElement('h3');h.textContent=g;body.append(h)}
  const row=document.createElement('div');row.className='mrow';
  row.innerHTML=`<label for="m_${k}">${lab}</label><input type="range" id="m_${k}" min="${mn}" max="${mx}" step="${st}"><output id="mo_${k}"></output><button class="rs" title="Reset to default" aria-label="Reset ${lab}">↺</button>`;
  body.append(row);const inp=row.querySelector('input');inp.oninput=()=>{S.mod[k]=+inp.value;modChanged()};inp.onchange=()=>inp.blur();
  row.querySelector('.rs').onclick=()=>{S.mod[k]=def;modChanged()}}}
$('mload').onclick=()=>{const p=presetOf($('mpre').value);if(p){S.mod={...MDEF,...cleanMod(p)};modChanged();modMsg('Loaded '+$('mpre').selectedOptions[0].text)}};
$('msave').onclick=()=>{const n=$('mname').value.trim().slice(0,24);if(!n){modMsg('Name your setup first.');return}S.presets[n]={...S.mod};save();renderPresets('u:'+n);$('mname').value='';modMsg('Saved “'+n+'”')};
$('mdel').onclick=()=>{const v=$('mpre').value;if(!v.startsWith('u:')){modMsg('Built-in presets can’t be deleted.');return}delete S.presets[v.slice(2)];save();renderPresets();modMsg('Deleted')};
$('mexp').onclick=()=>{const o={};for(const k in S.mod)if(S.mod[k]!==MDEF[k])o[k]=S.mod[k];const t=JSON.stringify(o);$('mio').value=t;
 try{navigator.clipboard.writeText(t).then(()=>modMsg('Copied to clipboard'),()=>{$('mio').select();modMsg('Select and copy the text below')})}catch(e){$('mio').select();modMsg('Select and copy the text below')}};
$('mimp').onclick=()=>{try{const o=JSON.parse($('mio').value);if(!o||typeof o!=='object')throw 0;S.mod={...MDEF,...cleanMod(o)};modChanged();modMsg('Imported')}catch(e){modMsg('Paste settings text from Export first.')}};
$('mreset').onclick=()=>{S.mod={...MDEF};modChanged();modMsg('Everything back to default')};
$('modbtn').onclick=toggleMod;$('mclose').onclick=toggleMod;}
export function syncMod(){for(const[,k,,def,,,st,u]of MODS){$('m_'+k).value=S.mod[k];$('mo_'+k).textContent=(+S.mod[k]).toFixed(dec(st))+(u?' '+u:'');$('m_'+k).parentNode.classList.toggle('chg',S.mod[k]!==def)}
 $('modnote').textContent=GS.hostTune?"You're in someone else's online game, so their settings are in use. Your changes apply offline or when you host.":''}
function modChanged(){save();applyTune();syncMod()}
export function modMsg(t){$('modmsg').textContent=t;clearTimeout(modMsg.t);modMsg.t=setTimeout(()=>$('modmsg').textContent='',2500)}
export function renderPresets(sel){const s=$('mpre');s.textContent='';for(const n of Object.keys(PRESETS))s.add(new Option(n,'b:'+n));for(const n of Object.keys(S.presets))s.add(new Option('★ '+n,'u:'+n));if(sel)s.value=sel}
const presetOf=v=>v.startsWith('b:')?PRESETS[v.slice(2)]:S.presets[v.slice(2)];
export function toggleMod(){$('mod').hidden=!$('mod').hidden}
