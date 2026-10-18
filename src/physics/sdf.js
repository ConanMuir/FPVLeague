// ---------- physics: the map as a signed distance function ----------
// sdf > 0 is solid. League: the arena profile (physics/arena-shape.js, the same shape as the meshes and the Rapier trimesh);
// Dogfight: the Highlands (terrain, walls, ceiling, obstacles). Used by the ball, the bots' predictor and steering, the drone
// pivot (turtle / self-righting) and as a safety net for bodies; collisions themselves are Rapier's (physics/world.js).
import {V3} from '../config/constants.js';
import {GS} from '../state.js';
import {sdDF} from '../world/highlands.js';
import {arenaSD} from './arena-shape.js';
export const sdf=(x,y,z)=>GS.OBSON?sdDF(x,y,z):arenaSD(x,y,z),_an=new V3();
export function sdN(p,out){const h=.02,x=p.x,y=p.y,z=p.z;out.set(sdf(x+h,y,z)-sdf(x-h,y,z),sdf(x,y+h,z)-sdf(x,y-h,z),sdf(x,y,z+h)-sdf(x,y,z-h));const l=out.length();return l>1e-9?out.divideScalar(l):out.set(0,1,0)}
// line of sight: a Rapier ray through the map (cover blocks bots and turrets as well as bullets)
export {los} from './world.js';
