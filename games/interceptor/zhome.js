// Zombies start page (the main menu): one grid for the cards the modules add (campaign, endless, enemies, watch a bot, doctrine, leaderboard, craft, co-op).
// The page is: title and a one-line pitch, the difficulty tabs, ONE big Start button (Quick defence; Resume takes over when a run is paused), then #zcards,
// then the settings and controls. A module no longer picks its own place in the menu: it asks Z.home.card(id, {order, tone, tag}) for its element, which
// lands in #zcards sorted by `order` (so the DOM order, and with it the keyboard focus order, is the visual order), and fills it with Z.home.face(...):
//   a glyph, a title, one line of what it is and its live state ("3 of 12 sectors held", "best: wave 21").
// Three kinds of card: a launcher (a button face that starts or opens something: campaign, enemies, endless), a fold-out (tag 'details': the face is the
// summary, the body opens across the whole row: watch a bot, doctrine, leaderboard) and a form (co-op, craft: controls that must stay in reach).
// Orders in use: campaign 10, endless 20, enemies 30, watch a bot 40, doctrine 50, leaderboard 60, craft 70, co-op 80.
// Styles: zombies.css ("start page"). Harness: Z.home.cards() lists the cards in order.
const esc=s=>String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]);
/* line icons on a 24 x 24 grid, drawn with the card's accent colour */
const ICON={
 flag:'<path d="M6 21V4"/><path d="M6 5h11l-2.5 4L17 13H6"/>',
 loop:'<path d="M12 12c-2-3-3.5-4-5.5-4a4 4 0 000 8c2 0 3.5-1 5.5-4zm0 0c2 3 3.5 4 5.5 4a4 4 0 000-8c-2 0-3.5 1-5.5 4z"/>',
 drone:'<circle cx="12" cy="12" r="2.6"/><path d="M9.8 9.8L6.5 6.5M14.2 9.8l3.3-3.3M9.8 14.2l-3.3 3.3M14.2 14.2l3.3 3.3"/><circle cx="5" cy="5" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 team:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .3 5 2.5 5 5.8"/>',
 plane:'<path d="M12 2l2 7 8 4v2l-8-2v5l3 2v1l-5-1-5 1v-1l3-2v-5l-8 2v-2l8-4z"/>',
 shield:'<path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 bars:'<path d="M5 20V12M12 20V5M19 20V9"/><path d="M3 20h18"/>'};
export const icon=n=>`<svg class="zhc-i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[n]||''}</svg>`;
export function initHome(api,G,Z){
 const $=id=>document.getElementById(id),mount=$('zcards');
 const H=Z.home={mount,icon,esc,
  /* the face of a card: icon (a name in ICON), title, one line of what it is, the live state; all plain text */
  face:o=>`<span class="zhc-g">${icon(o.i)}</span><span class="zhc-t">${esc(o.t)}</span><span class="zhc-d">${esc(o.d)}</span><span class="zhc-s" ${o.s?`title="${esc(o.s)}"`:''}>${esc(o.s)}</span>`,
  /* a card in the grid (a div, or a details when tag is 'details'), placed by order; returns the element for the module to fill */
  card(id,o={}){const e=document.createElement(o.tag||'div');e.id=id;e.className='zhc'+(o.tag==='details'?' zhd':'')+(o.cls?' '+o.cls:'');e.dataset.order=o.order??50;if(o.tone)e.dataset.tone=o.tone;
   const at=[...mount.children].find(c=>+c.dataset.order>+e.dataset.order);mount.insertBefore(e,at||null);return e},
  cards:()=>[...mount.children].map(c=>c.id)};
 /* a fold-out scrolls into view when it opens, and the others close: one at a time keeps the page short */
 mount.addEventListener('toggle',e=>{const d=e.target;if(!d.open||!d.classList.contains('zhd'))return;
  for(const o of mount.querySelectorAll('details.zhd[open]'))if(o!==d)o.open=false;d.scrollIntoView?.({block:'nearest'})},true);
 return H}
