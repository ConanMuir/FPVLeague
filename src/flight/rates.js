// Betaflight rate maths (rc.c) for every rates type; axis 0 roll, 1 pitch, 2 yaw; returns rad/s
import {cl} from '../config/constants.js';
import {S} from '../config/settings.js';
// RO.r: a temporary rate profile (the Calibration Lab's working copy) that wins over S.rprof while it is set, so nothing half-tuned is ever saved
export const RO={r:null},RT=()=>RO.r||S.rprof[S.rpi],P3=x=>x*x*x,stk=[0,0,0,0];
export const rate=(axis,x)=>rateR(RT(),axis,x);
// pure: rate of profile R (any rates type) on one axis at stick x (-1..1), rad/s
export function rateR(R,axis,x){const[rc,sr,ex]=R.ax[axis],a=Math.abs(x);let r;
 switch(R.type){
  case'ACTUAL':{const e=ex/100,ef=a*(Math.pow(x,5)*e+x*(1-e)),cs=rc*10;r=x*cs+Math.max(0,sr*10-cs)*ef;break}
  case'QUICK':{const rr=rc*2,md=Math.max(sr*10,rr),e=ex/100,sf=(md/rr-1)/(md/rr),c=P3(a)*e+a*(1-e);r=x*rr/cl(1-c*sf,.01,1);break}
  case'KISS':{const c=ex/100;r=2000/cl(1-a*sr/100,.01,1)*(P3(x)*c+x*(1-c))*(rc/1000);break}
  case'RACEFLIGHT':{r=10*rc*(1+.01*ex*(x*x-1))*x*(1+a*sr*.01);break}
  default:{const e=ex/100,y=x*P3(a)*e+x*(1-e);let rr=rc/100;if(rr>2)rr+=14.54*(rr-2);r=200*rr*y/cl(1-a*sr/100,.01,1)}}
 return cl(r,-1998,1998)*Math.PI/180}
export function thrCurve(t){const R=RT(),m=R.thrMid/100,e=R.thrExpo/100,d=t-m,y=d>0?1-m:m;return cl((m+d*(1-e+e*d*d/(y*y||1)))*R.thrLimit/100,0,1)}
