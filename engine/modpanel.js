// Mod panel: the Rates tab (see rates.js) and the Physics tab: sliders from the game's MODS list, presets, export/import. In an online game the host's tune applies.
import {$,cl} from './util.js';
import {S,save} from './settings.js';
export let MODS=[],MDEF={},hostTune=null;let PRESETS={},apply=()=>{};
export const tune=()=>hostTune||S.mod;
export function mountMod(){const a=document.createElement('aside');a.id='mod';a.hidden=true;a.setAttribute('aria-label','Mod panel');a.innerHTML=`
  <div class="mhead"><h2 style="margin:0">Mod panel</h2><span class="note" style="margin:0">T toggles · changes apply live</span><button class="sm" id="mclose" aria-label="Close mod panel">✕</button></div>
  <div class="tabs" role="tablist"><button class="sm on" id="tabr" role="tab" aria-selected="true">Rates</button><button class="sm" id="tabp" role="tab" aria-selected="false">Physics</button></div>
  <section id="paner">
    <div class="mp"><select id="rpi" aria-label="Rate profile"><option value="0">Rate profile 1</option><option value="1">Rate profile 2</option><option value="2">Rate profile 3</option></select><select id="rtype" aria-label="Rates type"><option>BETAFLIGHT</option><option>ACTUAL</option><option>QUICK</option><option>KISS</option><option>RACEFLIGHT</option></select></div>
    <table class="rt"><thead><tr><th></th><th id="rh0"></th><th id="rh1"></th><th id="rh2"></th><th class="mx">Max °/s</th></tr></thead><tbody id="rbody"></tbody></table>
    <canvas id="rgraph" width="680" height="380" aria-label="Rate curves for roll, pitch and yaw"></canvas>
    <h3>Throttle</h3>
    <div class="thr"><div class="tin"><label for="tmid">Throttle MID</label><input type="number" id="tmid" min="0" max="1" step="0.01"><label for="texpo">Throttle EXPO</label><input type="number" id="texpo" min="0" max="1" step="0.01"><label for="tlim">Throttle limit %</label><input type="number" id="tlim" min="25" max="100" step="1"></div><canvas id="tgraph" width="240" height="160" aria-label="Throttle curve"></canvas></div>
    <h3>Betaflight CLI</h3>
    <textarea id="cli" rows="4" placeholder="Paste your quad's Betaflight diff or dump here and press Import CLI. Export CLI gives set commands you can paste into Betaflight." aria-label="Betaflight CLI text"></textarea>
    <div class="mp"><button class="sm" id="cimp">Import CLI</button><button class="sm" id="cexp">Export CLI</button><button class="sm" id="rreset">Reset profile</button><span id="rmsg" class="note" style="margin:0;align-self:center"></span></div>
  </section>
  <section id="panep" hidden>
    <div class="mp"><select id="mpre" aria-label="Preset"></select><button class="sm" id="mload">Load</button><button class="sm" id="mdel">Delete</button></div>
    <div class="mp"><input id="mname" maxlength="24" placeholder="Name this setup" aria-label="Setup name"><button class="sm" id="msave">Save</button><button class="sm" id="mreset">Reset all</button></div>
    <p class="note" id="modnote"></p>
    <div id="modbody"></div>
    <h3>Share a setup</h3>
    <textarea id="mio" rows="3" placeholder="Export copies your setup here. Paste a friend's setup and press Import." aria-label="Settings text"></textarea>
    <div class="mp"><button class="sm" id="mexp">Export</button><button class="sm" id="mimp">Import</button><span id="modmsg" class="note" style="margin:0;align-self:center"></span></div>
  </section>`;document.body.append(a);
 $('tabr').onclick=()=>tab(true);$('tabp').onclick=()=>tab(false);$('mclose').onclick=toggleMod}
export function cleanMod(o){const r={};if(o&&typeof o==='object')for(const[,k,,,mn,mx]of MODS){const v=+o[k];if(k in o&&Number.isFinite(v))r[k]=cl(v,mn,mx)}return r}
// MODS rows: [group, key, label, default, min, max, step, unit]; migrate(MDEF) moves untouched old defaults; onApply() pushes tune() into the game
export function initModPanel({mods,presets,migrate,onApply}){MODS=mods;MDEF=Object.fromEntries(MODS.map(m=>[m[1],m[3]]));PRESETS=presets;apply=onApply;
 S.mod={...MDEF,...cleanMod(S.mod)};migrate?.(MDEF);
 if(!S.presets||typeof S.presets!=='object')S.presets={};
 const body=$('modbody');let grp='';
 for(const[g,k,lab,def,mn,mx,st]of MODS){if(g!==grp){grp=g;const h=document.createElement('h3');h.textContent=g;body.append(h)}
  const row=document.createElement('div');row.className='mrow';
  row.innerHTML=`<label for="m_${k}">${lab}</label><input type="range" id="m_${k}" min="${mn}" max="${mx}" step="${st}"><output id="mo_${k}"></output><button class="rs" title="Reset to default" aria-label="Reset ${lab}">↺</button>`;
  body.append(row);const inp=row.querySelector('input');inp.oninput=()=>{S.mod[k]=+inp.value;modChanged()};inp.onchange=()=>inp.blur();
  row.querySelector('.rs').onclick=()=>{S.mod[k]=def;modChanged()}}
 const presetOf=v=>v.startsWith('b:')?PRESETS[v.slice(2)]:S.presets[v.slice(2)];
 $('mload').onclick=()=>{const p=presetOf($('mpre').value);if(p){S.mod={...MDEF,...cleanMod(p)};modChanged();modMsg('Loaded '+$('mpre').selectedOptions[0].text)}};
 $('msave').onclick=()=>{const n=$('mname').value.trim().slice(0,24);if(!n){modMsg('Name your setup first.');return}S.presets[n]={...S.mod};save();renderPresets('u:'+n);$('mname').value='';modMsg('Saved “'+n+'”')};
 $('mdel').onclick=()=>{const v=$('mpre').value;if(!v.startsWith('u:')){modMsg('Built-in presets can’t be deleted.');return}delete S.presets[v.slice(2)];save();renderPresets();modMsg('Deleted')};
 $('mexp').onclick=()=>{const o={};for(const k in S.mod)if(S.mod[k]!==MDEF[k])o[k]=S.mod[k];const t=JSON.stringify(o);$('mio').value=t;
  try{navigator.clipboard.writeText(t).then(()=>modMsg('Copied to clipboard'),()=>{$('mio').select();modMsg('Select and copy the text below')})}catch(e){$('mio').select();modMsg('Select and copy the text below')}};
 $('mimp').onclick=()=>{try{const o=JSON.parse($('mio').value);if(!o||typeof o!=='object')throw 0;S.mod={...MDEF,...cleanMod(o)};modChanged();modMsg('Imported')}catch(e){modMsg('Paste settings text from Export first.')}};
 $('mreset').onclick=()=>{S.mod={...MDEF};modChanged();modMsg('Everything back to default')};
 renderPresets();apply();syncMod()}
const dec=st=>st>=1?0:Math.ceil(-Math.log10(st)-1e-9);
export function syncMod(){for(const[,k,,def,,,st,u]of MODS){$('m_'+k).value=S.mod[k];$('mo_'+k).textContent=(+S.mod[k]).toFixed(dec(st))+(u?' '+u:'');$('m_'+k).parentNode.classList.toggle('chg',S.mod[k]!==def)}
 $('modnote').textContent=hostTune?"You're in someone else's online game, so their settings are in use. Your changes apply offline or when you host.":''}
// online: the host's tune (null = back to your own)
export function setHostTune(t){hostTune=t?{...MDEF,...cleanMod(t)}:null;apply();syncMod()}
function modChanged(){save();apply();syncMod()}
export function modMsg(t){$('modmsg').textContent=t;clearTimeout(modMsg.t);modMsg.t=setTimeout(()=>$('modmsg').textContent='',2500)}
function renderPresets(sel){const s=$('mpre');s.textContent='';for(const n of Object.keys(PRESETS))s.add(new Option(n,'b:'+n));for(const n of Object.keys(S.presets))s.add(new Option('★ '+n,'u:'+n));if(sel)s.value=sel}
export function toggleMod(){$('mod').hidden=!$('mod').hidden}
export function tab(r){$('paner').hidden=!r;$('panep').hidden=r;$('tabr').classList.toggle('on',r);$('tabp').classList.toggle('on',!r);$('tabr').setAttribute('aria-selected',r);$('tabp').setAttribute('aria-selected',!r)}
// is the Rates tab on screen (its graphs redraw every frame)
export const ratesOpen=()=>!$('mod').hidden&&!$('paner').hidden;
