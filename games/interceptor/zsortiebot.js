// Zombies bots' sorties (zsortie.js), registered as a hook of the bot brain (zbotbrain.js hooks: a shop step on the base screen), so the
// benchmark's bots fly the break's sortie by level without the brain knowing about sorties. The benchmark pilot flies it the way it plays
// waves: kinematically through the harness (E.so.fly / hold / drop, at sim speed), so the guns and patrols still get their chance at it.
// The Bot Spectator's real pilot (zbotfly.js, E.spec.on) doesn't fly sorties: the hook steps aside and the bot just shops and starts the wave.
// Per level (by name):
//   go      chance of flying the break's sortie
//   pick    'near' (the closest known target), 'value' (what it takes out of the next waves for the defences around it) or 'smart' (value,
//           launch sites first when their sector has fast missiles planned, only targets the clock allows, finishes a factory with the warhead)
//   aim     bomb error (m)
//   back    chance of judging the return in time (otherwise it lingers and is late: drone and salvage lost, the wave starts)
//   depth   deepest tier it goes for (0 near, 1 mid, 2 deep)
//   strike  also orders strikes from the base screen on known launch sites when the purse is comfortable
// With nothing known it scouts along the supply roads first. Its run-in: 'near' comes in high and hovers while each bomb falls, 'value'
// lower and quicker, 'smart' low (under most of the guns' cover) with a salvo. After a sortie it shops again with the salvage.
import {hooks,shopSteps} from './zbotbrain.js';
export const SORTIE={Rookie:{go:.15,pick:'near',aim:22,back:.65,depth:0},Pro:{go:.3,pick:'near',aim:14,back:.8,depth:1},'All-Star':{go:.5,pick:'value',aim:9,back:.88,depth:1},
 Champion:{go:.65,pick:'smart',aim:6,back:.94,depth:2},'Grand Champion':{go:.75,pick:'smart',aim:4,back:.97,depth:2,strike:1},Legend:{go:.85,pick:'smart',aim:2.5,back:.99,depth:2,strike:1}};
const V=100;
// one sortie, start to finish (the clock runs at sim speed inside). Returns 'home' or 'late'; counts it in E.so.bot.
function fly(SP,E){const {G,api,Z}=E,so=E.so,W=so.W,R=so.bot||(so.bot={n:0,late:0,lost:0,kills:0,banked:0,strikes:0});
 if(!so.launch())return'no';R.n++;const me=()=>api.player,late=Math.random()>SP.back,c0=G.cash;
 const fastIn=s=>(Z.fastPlan?Z.fastPlan()[s]?.total:0)|0,cnt=k=>G.next.list.reduce((a,q)=>a+(q.split(':')[0]===k?+(q.split(':')[1]||1):0),0);
 const value=t=>t.t==='convoy'?(t.cargo.all?40:(t.cargo.left??t.cargo.n)*10):t.t==='launch'?15+50*fastIn(t.sec)*(SP.pick==='smart'?3:1):12*cnt(t.kind)+30;
 const guard=t=>1+t.parts.filter(q=>q.aa&&q.alive).length+.7*t.pats.filter(q=>q.st!=='dead').length;
 const homeD=()=>{const d=me();let b=1e9;for(const f of api.FOBS)b=Math.min(b,Math.hypot(f.x-d.p.x,f.z-d.p.z));return b};
 const leave=()=>so.S.t<(late?-30:homeD()/V+10),D=t=>Math.hypot(t.x-me().p.x,t.z-me().p.z);
 const pick=()=>{const L=so.known().filter(t=>!t.dead&&!t.done&&t.tier<=SP.depth&&(t.t!=='factory'||G.wave>=6)),sc=t=>value(t)/guard(t);
  if(SP.pick==='smart')return L.filter(t=>(D(t)+Math.hypot(t.x-api.FOBS[1].x,t.z-api.FOBS[1].z))/V+25<so.S.t).sort((a,b)=>sc(b)/(D(b)/1000+1)-sc(a)/(D(a)/1000+1))[0];
  if(SP.pick==='value')return L.sort((a,b)=>sc(b)-sc(a))[0];
  return L.sort((a,b)=>D(a)-D(b))[0]};
 // scouting: along the supply roads first (convoys drive there, launch sites sit near them), then any unexplored ground a kilometre on
 const scout=()=>{const ok=c=>!so.fog.known(c.x,c.z)&&W.tierOf(W.depth(c.x,c.z))<=SP.depth&&Math.abs(c.x)<3900&&Math.abs(c.z)<3900;
  const R2=W.routes.flatMap(r=>[.3,.45,.6,.75].map(f=>W.at(r,r.L*f))).filter(ok);if(R2.length)return R2.sort((a,b)=>D(a)-D(b))[0];
  const C=W.cands().filter(c=>ok(c)&&D(c)>1000);return C.length?C.sort((a,b)=>D(a)-D(b))[0]:null};
 const agl=SP.pick==='smart'?25:SP.pick==='value'?45:70,gap=SP.pick==='smart'?.3:SP.pick==='value'?1.6:3.6;
 for(let leg=0;leg<8&&so.S.on&&!leave();leg++){
  if(me().dead>0){R.lost++;E.sim(3);continue}
  const t=pick();if(!t){const c=scout();if(!c)break;so.fly(c.x,c.z,70,V,leave);continue}
  so.fly(t.x,t.z,agl,V,()=>leave()||D(t)<120);
  const aims=t.parts.filter(x=>x.main&&x.alive),was=aims.length;
  for(let i=0;so.S.bombs>0&&so.S.on&&me().dead<=0&&aims.some(q=>q.alive)&&i<9;i++){const L=aims.filter(x=>x.alive),q=L[i%L.length],a=Math.random()*6.283,e=SP.aim*Math.random();
   so.S.bombs--;so.drop(q.x+Math.cos(a)*e,q.y+60,q.z+Math.sin(a)*e);so.hold(gap)}
  if(gap<3.6&&so.S.on&&me().dead<=0)so.hold(3.6-gap);
  R.kills+=was-aims.filter(q=>q.alive).length;
  if(SP.pick==='smart'&&t.t!=='convoy'&&!t.dead&&me().dead<=0&&so.S.on){const h=t.parts.find(x=>x.main&&x.alive);if(h&&h.hp<=so.SO.kamiDmg){me().p.set(h.x,h.y+h.h*.5,h.z);Z.detonate()}}
  if(so.S.bombs<=0&&me().dead<=0)break}
 if(late&&so.S.on&&me().dead<=0&&!so.S.home)so.hold(so.S.t+1);  /* misjudged the way back: still out there when the clock runs out */
 if(so.S.on&&me().dead<=0){const f=api.FOBS[so.S.pad];so.fly(f.x,f.z+120,60,V,()=>so.S.home)}
 while(so.S.on&&me().dead>0)E.sim(.5);
 if(so.S.on&&!late)so.finish();
 while(so.S.on)E.sim(.5);
 R.banked+=Math.max(0,G.cash-c0);if(G.state!=='base'){R.late++;return'late'}return'home'}
hooks.push({name:'sortie',*shop(P,E){const SP=SORTIE[P.n],so=E.so,G=E.G;
 if(!SP||!so||E.spec?.on||!G.on||G.state!=='base'||G.wave<so.SO.from||so.S.used===G.wave)return;
 if(SP.strike){const c=Math.round((so.SO.strike.base+so.SO.strike.perW*G.wave)/50)*50,fastIn=s=>(E.Z.fastPlan?E.Z.fastPlan()[s]?.total:0)|0;
  for(const t of so.known())if(t.t==='launch'&&!t.dead&&t.struck!==G.wave&&fastIn(t.sec)>=2&&G.cash>c*5)
   yield{why:`Ordering a strike on the ${['West','North','East'][t.sec]} launch site: its fast missiles are planned next wave`,what:'strike',run:()=>{const h=so.strike(t.id);if(h!=null)(so.bot||(so.bot={n:0,late:0,lost:0,kills:0,banked:0,strikes:0})).strikes++;return h}}}
 if(Math.random()>SP.go)return;
 yield{why:'Flying a sortie past the line: find what feeds the next waves, bomb it, bring the salvage home',what:'sortie',run:()=>fly(SP,E)};
 if(G.state==='base')yield*shopSteps(P,E)}});  /* back in time: shop again with the salvage (this hook steps aside now: one sortie a break) */
