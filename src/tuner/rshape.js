// Rate shape <-> rates type. Whatever the Betaflight rates type, one axis has a shape the tuner can reason about:
//  c  centre sensitivity, °/s: the slope of the curve at centre stick (what Actual calls Center Sensitivity)
//  m  max rate, °/s at full stick
//  e  expo, 0..1 (the type's own expo / RC curve)
// toShape/fromShape are inverses up to Betaflight's integer rounding, so the tuner can work in any type and write back
// the raw CLI integers that the rates panel and CLI export already use. fromShape(...,false) skips the rounding
// (rateR accepts fractional values), which the tuner uses to measure how much each knob moves the curve.
import {RTYPES} from '../config/ratetypes.js';
const cl=(v,a,b)=>v<a?a:v>b?b:v;
export function toShape(type,[a,b,x]){const e=x/100;switch(type){
 case'ACTUAL':return{c:a*10,m:Math.max(b*10,a*10),e};
 case'QUICK':return{c:a*2,m:Math.max(b*10,a*2),e};
 case'KISS':return{c:2*a*(1-e),m:2*a/Math.max(.01,1-b/100),e};
 case'RACEFLIGHT':return{c:10*a*(1-e),m:10*a*(1+b/100),e};
 default:{let rr=a/100;if(rr>2)rr+=14.54*(rr-2);return{c:200*rr*(1-e),m:200*rr/Math.max(.01,1-b/100),e}}}}
export function fromShape(type,{c,m,e},round=true){const R=round?Math.round:v=>v,lim=(t,j,v)=>{const[k,mn,mx]=RTYPES[t].f[j];return cl(R(v),Math.ceil(mn/k-1e-9),Math.floor(mx/k+1e-9))};
 m=Math.max(m,c);switch(type){
 case'ACTUAL':return[lim(type,0,c/10),lim(type,1,m/10),lim(type,2,e*100)];
 case'QUICK':return[lim(type,0,c/2),lim(type,1,m/10),lim(type,2,e*100)];
 case'KISS':{const x=lim(type,2,e*100),a=lim(type,0,c/(2*(1-x/100)||1));return[a,cl(R(100*(1-2*a/m)),0,99),x]}
 case'RACEFLIGHT':{const x=lim(type,2,e*100),a=lim(type,0,c/(10*(1-x/100)||1));return[a,lim(type,1,100*(m/(10*a)-1)),x]}
 default:{const x=lim('BETAFLIGHT',2,e*100);let rr=c/(200*(1-x/100)||1);const a=lim('BETAFLIGHT',0,(rr>2?2+(rr-2)/15.54:rr)*100);rr=a/100;if(rr>2)rr+=14.54*(rr-2);
  return[a,cl(R(100*(1-200*rr/m)),0,99),x]}}}
// Actual rates with the same centre / max / expo (the Pro preset tunes in Actual)
export const toActual=(type,ax)=>fromShape('ACTUAL',toShape(type,ax));
