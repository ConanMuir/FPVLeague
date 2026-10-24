/* The bot pilot's plane controller (zbotfly.js hands it the velocity it wants; ztypes.js lists it as the plane's bot). Same sticks a player has:
   roll stick = bank, pitch stick = path rate (forward = nose down), throttle stick through the stick's rest point (rest = cruise).
   A plane cannot stop or hover, so it steers toward the direction of the wanted velocity and flies on through (a point it is told to hold
   becomes an orbit); it keeps its speed up, banks no harder than the wing can carry, stays clear of the ground ahead and lands on a pad by a
   low pass when it is told to come home. On the pad it asks for the catapult, on the ground away from a pad it rolls and takes off. */
import {F,stickOf} from './zplane.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v,D2R=Math.PI/180;
const KP=1.4,KG=1.2;  /* heading error to turn rate (1/s); path error to path rate (1/s) */
/* is something solid other than the ground within r metres of the point? (the SDF counts the ground too, whose own distance is about the height over it) */
const near=(api,x,y,z,r)=>{const s=api.sdf(x,y,z);return s>-r&&-s<.9*(y-api.gh(x,z))-1.5};
/* the approach to a pad, once per pad: of 16 headings (the plane arrives flying along minus u) the one whose glide profile G (metres over the pad at 60 m steps out to 900 m:
   a 3.5 degree slope, or 6 m over the highest ground on the way in) is the lowest overall; Gat(A, d) reads it */
function approach(api,P,m){if(P.ap&&P.ap.m===m)return P.ap;let best=null,bs=1e9;
 for(let k=0;k<16;k++){const a=k*Math.PI/8,ux=Math.sin(a),uz=-Math.cos(a),G=[2];let run=0,sum=0;for(let d=60;d<=900;d+=60){run=Math.max(run,api.gh(m.x+ux*d,m.z+uz*d)-m.y);const g=Math.max(d*.06+2,run+6);G.push(g);sum+=g}
  /* anything solid (a building, a tree line, a wall) within 5 m of the way in, or of the roll-out beyond the pad (it floats and rolls a long way before it stops): that heading is out */
  for(let d=-400;d<=500;d+=20){const x=m.x+ux*d,z=m.z+uz*d,gy=api.gh(x,z),hh=d>0?Math.max(d*.06+2,G[Math.min(G.length-1,Math.round(d/60))]):1;
   for(const w of d<300?[-20,0,20]:[0]){const px=x-uz*w,pz=z+ux*w;if(near(api,px,gy+hh,pz,5)||d<150&&near(api,px,gy+3,pz,4))sum+=2000}}
  if(sum<bs){bs=sum;best={m,ux,uz,G}}}
 return P.ap=best}
const Gat=(A,d)=>{const f=cl(d/60,0,A.G.length-1.001),i=f|0;return A.G[i]+(A.G[i+1]-A.G[i])*(f-i)};
export function planeBot(api,me,Vd,head,dt,o={}){const P=me.cx,I=P.info(),H=api.HOV,gh=api.gh,out={thr:0,yaw:0,pit:0,rol:0};
 if(I.mode==='pad'||I.mode==='cat'){out.thr=stickOf(1,H);return out}
 if(I.mode==='chg'){out.thr=0;return out}
 if(I.mode==='roll'){if(I.pl){out.thr=0;return out}out.thr=stickOf(1,H);out.pit=I.ias>F.vs*1.15?-.6:0;return out}  /* just landed on a pad: stop for the charge; away from one: take off again */
 const v=me.v,V=Math.max(P.ias,1),g=api.S.mod?.grav||9.81,sp=v.length(),bk=P.bank;
 /* something solid on the line it is flying within the next few seconds (a tree line, a building): a landing is called off, and a go-around climbs away for a while */
 if(P.ga>0)P.ga-=1/120;
 if((o.land||I.flare)&&!(P.ga>0)){for(const t of[.8,1.6,2.4,3.4]){const x=me.p.x+v.x*t,y=me.p.y+v.y*t,z=me.p.z+v.z*t;if(near(api,x,y,z,7)||near(api,x,y-2.5,z,6)){P.ga=3;P.gn=(P.gn|0)+1;break}}}
 if(I.flare&&P.ga>0){out.thr=1;out.pit=-.5;return out}  /* throttle past 90% hands the stick back from the flare */
 if(I.flare){out.thr=0;return out}  /* the flare has the stick: wings level, nose to the sink it wants, throttle off */
 let dx=Vd.x,dy=Vd.y,dz=Vd.z,dm=Math.hypot(dx,dy,dz),Vt=cl(dm,F.vc*.95,F.vlev);
 if(dm<.5){dx=head.x;dz=head.z;dy=0;dm=1;Vt=F.vc}
 /* coming home: the pad's approach line (the heading whose last 900 m has the most room over the ground), the slope down it, and the flare at the end of it */
 let fin=false;
 if(o.land&&me.home?.mat){const m=me.home.mat,A=approach(api,P,m),px=me.p.x-m.x,pz=me.p.z-m.z,dist=Math.hypot(px,pz),along=px*A.ux+pz*A.uz,cross=Math.abs(px*A.uz-pz*A.ux),alt=me.p.y-m.y;
  fin=along>-30&&along<1100&&cross<.25*Math.max(along,0)+60&&dist<1200&&!(P.ga>0);
  const L=fin?60:900,tx=m.x+A.ux*L,tz=m.z+A.uz*L,rx=tx-me.p.x,rz=tz-me.p.z,rd=Math.max(Math.hypot(rx,rz),1),at=fin?(V>F.fl.v-1&&dist<400?Math.max(30,alt):Gat(A,Math.max(0,dist-60))):A.G[15]+30;  /* too fast for the flare when it gets there: hold its height, go round */
  Vt=46;dx=rx/rd*Vt;dz=rz/rd*Vt;dy=cl((at-alt)*.5,-V*.12,V*.1);dm=Math.hypot(dx,dy,dz)}
 /* the way it wants to turn: signed heading error, positive = turn right */
 let hx=v.x,hz=v.z;if(Math.hypot(hx,hz)<8){hx=head.x;hz=head.z}
 const dh=Math.hypot(dx,dz)||1,cr=hx*dz-hz*dx,dt2=hx*dx+hz*dz,psi=Math.atan2(cr,dt2);
 /* the bank it may use: the wing's cap at this speed with a margin, nothing hard near the stall */
 const cap=Math.min(F.nmax,(V/F.vs)**2)*.8,lim0=Math.min(F.bank,Math.acos(1/Math.max(1.05,cap)))*cl((V-F.vs*1.05)/(F.vs*.3),0,1);
 let lim=lim0;if(o.land)lim=Math.min(lim0,8*D2R+cl((me.p.y-gh(me.p.x,me.p.z))/50,0,1)*50*D2R);  /* coming in to land: the wings level off with the height, so a tip never meets the ground in a turn */
 /* the last 350 m of a run-in on a track: stiffer gains, to put the nose on it */
 const fine=cl(1-((o.near??1e9)-100)/250,0,1),wd=cl(psi*KP*(1+2*fine),-.5,.5);let bc=cl(Math.atan(wd*V/g),-lim,lim);
 if(I.flare)bc=0;
 out.rol=cl(bc/F.bank,-1,1);
 /* the path it wants: the wanted climb or sink, never more than it can climb, and clear of the ground ahead */
 let gd=Math.asin(cl(dy/dm,-1,1));gd=cl(gd,-30*D2R,12*D2R);
 /* a real climb is flown at the speed the motor climbs best at (the speed it gives up for height; the dash comes once it is level with the wanted height),
    and never steeper than the thrust left over drag allows, with a little to spare for the speed to come back */
 if(!o.land){if(gd>3*D2R)Vt=Math.min(Vt,F.vcl);gd=Math.min(gd,Math.asin(cl((P.tmax()-F.c0*V*V-F.ci*1.4/Math.max(V*V,225)-(V<Vt-4?1.3:.3))/g,-.3,.21)))}
 const sx=v.x/Math.max(sp,1),sz=v.z/Math.max(sp,1),vy=v.y;let need=0;
 for(const t of[1.2,2.5,4,6]){const d=Math.max(sp,V)*t,x=me.p.x+sx*d,z=me.p.z+sz*d,h=gh(x,z)+(o.land?4:38);need=Math.max(need,(h-me.p.y)/d)}
 const agl=me.p.y-gh(me.p.x,me.p.z);if(!I.flare&&!fin){gd=Math.max(gd,Math.min(Math.atan(need),12*D2R));if(agl<22)gd=Math.max(gd,vy<2?9*D2R:0)}
 if(P.ga>0)gd=Math.max(gd,9*D2R);
 if(V<F.vs*1.45)gd=Math.min(gd,-2*D2R);
 if(V<F.vs*1.2)gd=Math.min(gd,-9*D2R);
 const gam=Math.asin(cl(vy/Math.max(sp,1),-1,1)),gw=cl((gd-gam)*KG*(1+.6*fine),-F.rate,F.rate),p0=-(gw+gam*F.lvl)/F.rate;
 out.pit=cl(-(gw+gam*F.lvl*(1-Math.abs(cl(p0,-1,1))))/F.rate,-1,1);
 /* the throttle: the speed it wants, the climb it asks for and the load of the turn it is in */
 let u=P.uFor(Vt,Math.sin(gd));
 if(I.flare)u=0;if(V<F.vs*1.45||P.ga>0)u=1;
 out.thr=stickOf(cl(u,0,1),H);if(Math.abs(out.thr-H)<.04)out.thr=H+(out.thr>=H?.04:-.04);  /* a bot flies its own throttle: off the stick's rest point, where the cruise hold would take over */
 return out}
