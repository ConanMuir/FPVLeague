// value noise + fbm (outdoor maps and Highlands terrain)
import {cl} from '../config/constants.js';
export const hash2=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s)},sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)};
export function vnoise(x,z){const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf),a=hash2(xi,zi),b=hash2(xi+1,zi),c=hash2(xi,zi+1),d=hash2(xi+1,zi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
export const fbm=(x,z)=>vnoise(x,z)*.5+vnoise(x*2.1+5,z*2.1)*.25+vnoise(x*4.3,z*4.3+9)*.125;
