// Zombies announcer and comms (DOM, styled in zfx.css): the big kill call ("DOUBLE KILL", "CLUTCH SAVE"), radio subtitles typed out under a
// garbled voice, the end-of-wave card with stars and medals, the rolling cash counter and a red vignette when a site takes a hit.
const cl=(v,a,b)=>v<a?a:v>b?b:v;
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export function initAnnounce(api,G,au){
 const $=id=>document.getElementById(id),hud=$('hud');
 const mk=(id,cls)=>{const e=document.createElement('div');e.id=id;if(cls)e.className=cls;hud.append(e);return e};
 const ann=mk('zann'),rad=mk('zradio'),sum=mk('zsum'),vig=mk('zvig');sum.hidden=true;vig.addEventListener('animationend',e=>{if(e.animationName==='zvig')vig.classList.remove('hit')});
 const restart=(e,c)=>{e.classList.remove(c);void e.offsetWidth;e.classList.add(c)};

 // ---------- announcer: one call at a time; a bigger one replaces a smaller one ----------
 let annEnd=0,annP=0;
 function say(txt,sub,col='#ffc640',pri=1){const t=performance.now();if(t<annEnd&&pri<annP)return;annEnd=t+1300;annP=pri;
  ann.style.setProperty('--c',col);ann.innerHTML=`<div class="a">${txt}</div>${sub?`<div class="s">${sub}</div>`:''}`}

 // ---------- radio: queued callouts; stale ones are dropped, urgent ones cut in ----------
 const Q=[];let cur=null;
 function radio(who,txt,pri=1){const m={who,txt,pri,at:performance.now()};if(pri>=2&&cur&&cur.pri<2){cur=null;Q.unshift(m);return}
  if(Q.length>=3){const i=Q.findIndex(q=>q.pri<pri);if(i<0)return;Q.splice(i,1)}Q.push(m)}
 function radioTick(){const t=performance.now();
  if(cur&&t>cur.end){cur=null;rad.classList.remove('on')}
  if(!cur){while(Q.length&&t-Q[0].at>(Q[0].pri>=2?9000:5000))Q.shift();if(Q.length&&!(G.state==='base'||G.state==='over')){cur=Q.shift();const dur=cl(.45+cur.txt.length*.032,.6,2.6);cur.t0=t;cur.dur=dur*1000;cur.end=t+dur*1000+1700;
    rad.className='on'+(cur.pri>=2?' hi':'');rad.innerHTML=`<b>${cur.who}</b><span></span>`;au.radio(dur)}}
  if(cur){const n=Math.ceil(cl((t-cur.t0)/cur.dur,0,1)*cur.txt.length),s=rad.lastChild;if(s.textContent.length!==n)s.textContent=cur.txt.slice(0,n)}}
 function radioClear(){Q.length=0;cur=null;rad.classList.remove('on')}

 // ---------- end of wave: stars (held, no damage, you pulled your weight) and medals ----------
 let sumT=[];
 function summary(w,st){for(const t of sumT)clearTimeout(t);sumT=[];const tot=st.you+st.help,ace=st.you>=Math.max(1,Math.round(tot*.25)),stars=[true,!!st.perfect,ace];
  const md=[];if(st.perfect)md.push('PERFECT DEFENCE');if(st.you>=5&&ace)md.push('ACE');if(st.clutch)md.push('CLUTCH'+(st.clutch>1?' ×'+st.clutch:''));if(st.multi>=2)md.push(['','','DOUBLE','TRIPLE'][st.multi]||'MULTI ×'+st.multi);
  if(st.boss)md.push('MOTHERSHIP DOWN');if(st.streak>=3)md.push('STREAK '+st.streak);
  sum.innerHTML=`<div class="st">${stars.map(()=>'<i>★</i>').join('')}</div>
   <div class="ln">Intercepts <b>${tot}</b> · you <b>${st.you}</b> · helpers <b>${st.help}</b></div>
   <div class="ln">${st.dmg?`Damage taken <b class="r">−${Math.round(st.dmg)}</b>`:'<b class="g">No damage</b>'} · earned <b class="g">${money(st.cash)}</b></div>
   ${md.length?`<div class="md">${md.map(m=>`<span>${m}</span>`).join('')}</div>`:''}`;
  sum.hidden=false;restart(sum,'in');const I=sum.querySelectorAll('.st i');
  stars.forEach((on,i)=>sumT.push(setTimeout(()=>{if(on)I[i].classList.add('on');else I[i].classList.add('off');au.star(i,on)},450+i*380)))}
 const sumHide=()=>{for(const t of sumT)clearTimeout(t);sumT=[];sum.hidden=true};

 // ---------- cash: rolls up to the new total and bumps when money comes in ----------
 let shown=null,lastCash=0;
 function hudTick(dt){const el=$('zc');if(!el)return;if(shown==null||G.cash<shown||G.state==='base'){shown=G.cash}
  if(G.cash>lastCash+.5)restart(el,'bump');lastCash=G.cash;
  if(shown<G.cash)shown=Math.min(G.cash,shown+Math.max(1,(G.cash-shown)*Math.min(1,dt*7)));el.textContent=money(shown);
  vig.classList.toggle('lo',G.state==='wave'&&Z_integ()<.3)}
 let Z_integ=()=>1;
 function hit(sev){vig.style.setProperty('--v',cl(sev,.25,1));restart(vig,'hit')}
 function reset(){radioClear();sumHide();ann.innerHTML='';shown=null;lastCash=G.cash;vig.className=''}
 return{say,radio,radioTick,radioClear,summary,sumHide,hudTick,hit,reset,set integ(f){Z_integ=f}}}
