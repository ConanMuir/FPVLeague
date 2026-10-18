// ---------- Highlands terrain: the height function and the map's size (pure maths; world/highlands.js builds the map from it) ----------
import {cl} from '../config/constants.js';
import {sm,vnoise,fbm} from './noise.js';
export const DW=1100,DLEN=1400,DHW=DW/2,DHL=DLEN/2,DCEIL=520,DBASE=DHL-230,CANY=-40;
export const cxR=z=>150*Math.sin(z/230)+55*Math.sin(z/83);  // canyon centre line (odd in z, so the canyon is point-symmetric too)
const dfH0=(x,z)=>(fbm(x/240+11,z/240-4)-.42)*185+Math.pow(1-Math.abs(2*vnoise(x/150+3,z/150+7)-1),2)*80;
export function dfH(x,z){let y=Math.max(-30,(dfH0(x,z)+dfH0(-x,-z))*.5);
 y=CANY+sm((Math.abs(x-cxR(z))-22)/50)*(y-CANY);  // carve the canyon
 const e=Math.max(Math.abs(x)-(DHW-170),Math.abs(z)-(DHL-170),0);y+=sm(e/170)*430*(.7+.15*(vnoise(x/60,z/60)+vnoise(-x/60,-z/60)));  // mountain walls at the edge
 const r=Math.hypot(x,Math.abs(z)-DBASE);return y+(8-y)*(1-sm((r-70)/60))}  // flat team bases at z = ±DBASE
// terrain heights on the mesh's grid (2 km x 2.3 km, ~7 m cells): the terrain mesh and Rapier's heightfield use these same samples
let grid=null;export function dfGrid(){if(grid)return grid;const nx=280,nz=350,w=DW+900,l=DLEN+900,h=new Float32Array((nx+1)*(nz+1));
 for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++)h[iz*(nx+1)+ix]=dfH(-w/2+ix*w/nx,-l/2+iz*l/nz);return grid={nx,nz,w,l,h}}
// terrain height: once the map is built, the mesh triangles (= the Rapier heightfield, cells split (x1,z0)-(x0,z1)); before that dfH()
export const dfHt=(x,z)=>{if(!grid)return dfH(x,z);const T=grid,fx=cl((x+T.w/2)/T.w*T.nx,0,T.nx-1e-9),fz=cl((z+T.l/2)/T.l*T.nz,0,T.nz-1e-9),ix=fx|0,iz=fz|0,u=fx-ix,v=fz-iz,n1=T.nx+1,i=iz*n1+ix,h=T.h;
 return u+v<1?h[i]+u*(h[i+1]-h[i])+v*(h[i+n1]-h[i]):h[i+n1+1]+(1-u)*(h[i+n1]-h[i+n1+1])+(1-v)*(h[i+1]-h[i+n1+1])};
