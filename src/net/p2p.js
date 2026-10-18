// ---------- standalone online play: PeerJS (WebRTC) stand-in for the claude room API ----------
// host owns the id P2P+code; clients connect to it; host relays each pilot's presence to everyone (star topology)
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
