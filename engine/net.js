// Online rooms. On claude.ai a game uses the artifact room capability; anywhere else p2p gives the same calls over PeerJS (WebRTC).
// The host owns the id prefix+code; clients connect to it; the host relays each pilot's presence to everyone (star topology)
const P2P='droneleague-v1-';
function loadPeer(){return window.Peer?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';s.onload=res;s.onerror=()=>rej({code:'load_failed'});document.head.append(s)})}
function p2pRoom(isHost,code){return new Promise((res,rej)=>{
 const peer=new Peer(isHost?P2P+code:'dlp-'+Math.random().toString(36).slice(2,12)),others=new Map(),conns=new Map(),hs=[],errs=[];let me=null,open=false,conn=null;
 const snap=()=>[me,...others.values()],fire=()=>{const peers=snap();hs.forEach(h=>h({peers}))},fail=c=>{if(!open){clearTimeout(timer);peer.destroy();rej({code:c})}else{open=false;errs.forEach(f=>f({code:c}))}};
 const api={presence(p){me.presence={...me.presence,...p};const m={t:'p',from:me.peer,d:me.presence};if(isHost){for(const c of conns.values())if(c.open)c.send(m)}else if(conn?.open)conn.send(m);return Promise.resolve()},
  onPeers(h,e){hs.push(h);if(e)errs.push(e);setTimeout(()=>h({peers:snap()}),0);return()=>{}},leave(){open=false;peer.destroy();return Promise.resolve()}};
 const timer=setTimeout(()=>fail('timeout'),15000);
 peer.on('error',e=>fail(e.type==='unavailable-id'?'taken':e.type==='peer-unavailable'?'not_found':e.type||'error'));
 peer.on('open',id=>{me={peer:isHost?'host':id,sameTab:true,isMe:true,presence:{}};
  if(isHost){open=true;clearTimeout(timer);res(api);
   peer.on('connection',c=>{c.on('open',()=>{conns.set(c.peer,c);others.set(c.peer,{peer:c.peer,sameTab:false,isMe:false,presence:{}});fire();c.send({t:'p',from:'host',d:me.presence})});
    c.on('data',m=>{if(!m||m.t!=='p'||!m.d||typeof m.d!=='object')return;others.set(c.peer,{peer:c.peer,sameTab:false,isMe:false,presence:m.d});fire();for(const[k,o]of conns)if(k!==c.peer&&o.open)o.send({t:'p',from:c.peer,d:m.d})});
    c.on('close',()=>{conns.delete(c.peer);others.delete(c.peer);fire();for(const o of conns.values())if(o.open)o.send({t:'x',from:c.peer})})})}
  else{conn=peer.connect(P2P+code,{serialization:'json'});conn.on('open',()=>{open=true;clearTimeout(timer);res(api)});
   conn.on('data',m=>{if(!m||typeof m.from!=='string'||m.from.length>48)return;if(m.t==='x')others.delete(m.from);else if(m.t==='p'&&m.d&&typeof m.d==='object')others.set(m.from,{peer:m.from,sameTab:false,isMe:false,presence:m.d});else return;fire()});
   conn.on('close',()=>fail('host_left'))}})})}
export const p2p={p2p:true,presence:()=>Promise.resolve(),onPeers:()=>()=>{},join:(code,isHost)=>loadPeer().then(()=>p2pRoom(isHost,code))};
// test loopback (?netloop, or ?netloop=ms of one-way delay): the pages of one browser talk over a BroadcastChannel with the same calls and the same
// rules (one host per code, clients join it, everyone sees everyone's presence, 'host_left' when the host goes). Headless harnesses use it because
// the PeerJS cloud may be out of reach there; it never carries anything between machines.
function loopRoom(isHost,code,ms){return new Promise((res,rej)=>{
 const ch=new BroadcastChannel('dl-loop-'+code),id=isHost?'host':'lp-'+Math.random().toString(36).slice(2,10),others=new Map(),hs=[],errs=[],me={peer:id,sameTab:true,isMe:true,presence:{}};let open=false;
 const snap=()=>[me,...others.values()],fire=()=>{const peers=snap();hs.forEach(h=>h({peers}))},post=m=>{try{ch.postMessage(m)}catch(e){}};
 const done=(ok,c)=>{clearTimeout(timer);if(ok){open=true;res(api);post({t:'p',from:id,d:me.presence});post({t:'hi',from:id})}else{try{ch.close()}catch(e){}rej({code:c})}};
 const api={presence(p){me.presence={...me.presence,...p};if(open)post({t:'p',from:id,d:me.presence});return Promise.resolve()},
  onPeers(h,e){hs.push(h);if(e)errs.push(e);setTimeout(()=>h({peers:snap()}),0);return()=>{}},leave(){if(open){open=false;post({t:'x',from:id})}try{ch.close()}catch(e){}return Promise.resolve()}};
 const on=m=>{if(!m||typeof m.from!=='string'||m.from===id)return;
  if(m.t==='who'&&isHost&&open)post({t:'here',from:id,to:m.from});
  else if(m.t==='here'&&m.to===id&&!open)done(!isHost,'taken');
  else if(m.t==='hi'&&open)post({t:'p',from:id,d:me.presence});
  else if(m.t==='p'&&open&&m.d&&typeof m.d==='object'){others.set(m.from,{peer:m.from,sameTab:false,isMe:false,presence:m.d});fire()}
  else if(m.t==='x'&&open){others.delete(m.from);fire();if(m.from==='host'&&!isHost){open=false;errs.forEach(f=>f({code:'host_left'}))}}};
 ch.onmessage=e=>{if(ms)setTimeout(()=>on(e.data),ms);else on(e.data)};
 const timer=setTimeout(()=>done(isHost,'not_found'),isHost?300:3000);post({t:'who',from:id})})}
export const loop={p2p:true,loop:true,presence:()=>Promise.resolve(),onPeers:()=>()=>{},join:(code,isHost)=>loopRoom(isHost,code,+new URLSearchParams(location.search).get('netloop')||0)};
// the claude.ai room when there is one, else the PeerJS stand-in (or the loopback when the page asks for it)
export async function getRoom(){if(new URLSearchParams(location.search).has('netloop'))return loop;let r=null;try{r=await window.claude?.use?.('room')}catch(e){r=null}return r||p2p}
