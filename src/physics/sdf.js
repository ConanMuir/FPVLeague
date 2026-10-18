// ---------- physics ----------
// sphere vs plane (n, offset): positional fix + restitution + coulomb friction; returns impact speed
import {GD,GH,GW,H,HL,HW,RC,RF,V3} from '../config/constants.js';
import {_gq} from '../scratch.js';
import {GS} from '../state.js';
import {sdDF} from '../world/highlands.js';
function pl(p,v,r,nx,ny,nz,o,e,f){const d=p.x*nx+p.y*ny+p.z*nz-o;if(d>=r)return 0;const c=r-d;p.x+=nx*c;p.y+=ny*c;p.z+=nz*c;
 const vn=v.x*nx+v.y*ny+v.z*nz;if(vn>=0)return 0;const tx=v.x-nx*vn,ty=v.y-ny*vn,tz=v.z-nz*vn,tl=Math.hypot(tx,ty,tz),k=tl>1e-6?Math.max(0,1-f*-vn*(1+e)/tl):0;
 v.x=tx*k-nx*vn*e;v.y=ty*k-ny*vn*e;v.z=tz*k-nz*vn*e;return -vn}
// interior SDF (positive = outside): rounded arena unioned with the goal boxes (extended into the field so the mouth is open)
function sdArena(x,y,z){const qx=Math.abs(x)-HW+RC,qz=Math.abs(z)-HL+RC,d2=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-RC;
 const ax=d2+RF,ay=Math.abs(y-H/2)-H/2+RF;return Math.hypot(Math.max(ax,0),Math.max(ay,0))+Math.min(Math.max(ax,ay),0)-RF}
function sdGoal(x,y,z){const qx=Math.abs(x)-GW/2,qy=Math.abs(y-GH/2)-GH/2,qz=Math.abs(Math.abs(z)-(HL+GD/2-10))-(GD/2+10);
 return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)}
export const sdf=(x,y,z)=>GS.OBSON?sdDF(x,y,z):Math.min(sdArena(x,y,z),sdGoal(x,y,z)),_an=new V3();
export function sdN(p,out){const h=.02,x=p.x,y=p.y,z=p.z;out.set(sdf(x+h,y,z)-sdf(x-h,y,z),sdf(x,y+h,z)-sdf(x,y-h,z),sdf(x,y,z+h)-sdf(x,y,z-h));const l=out.length();return l>1e-9?out.divideScalar(l):out.set(0,1,0)}
// sphere vs arena surface: positional fix + restitution + coulomb friction; returns impact speed
export function arena(p,v,r,e,f){let m=0;for(let it=0;it<2;it++){const d=sdf(p.x,p.y,p.z);if(d<=-r)break;const n=sdN(p,_an);p.addScaledVector(n,-(d+r));
 const vn=-(v.x*n.x+v.y*n.y+v.z*n.z);if(vn>=0)continue;const tx=v.x+n.x*vn,ty=v.y+n.y*vn,tz=v.z+n.z*vn,tl=Math.hypot(tx,ty,tz),k=tl>1e-6?Math.max(0,1-f*-vn*(1+e)/tl):0;
 v.x=tx*k+n.x*vn*e;v.y=ty*k+n.y*vn*e;v.z=tz*k+n.z*vn*e;m=Math.max(m,-vn)}return m}
// line of sight: sphere-trace the segment through the map (cover blocks bots and turrets as well as bullets)
export function los(a,b){_gq.subVectors(b,a);const L=_gq.length();if(L<1)return true;_gq.divideScalar(L);let t=2;
 for(let i=0;i<70&&t<L-2;i++){const x=a.x+_gq.x*t,y=a.y+_gq.y*t,z=a.z+_gq.z*t,d=sdf(x,y,z);if(d>-.3)return false;t+=Math.max(-d,1)}return t>=L-2}
