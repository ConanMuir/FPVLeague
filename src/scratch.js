// Scratch vectors/quaternions shared across modules. v15 reused these same instances in many functions; they stay shared
// so the maths is identical. Use them only for short-lived values inside one function.
import {QT,V3} from './config/constants.js';
export const _q=new QT(),_v=new V3(),_w=new V3(),_u=new V3(),_qb=new QT(),_lb=new V3(),_x=new V3(),_z=new V3(),_f=new V3();
export const _a=new V3(),_b=new V3(),_T=new V3(),_ip=new V3(),_dir=new V3(),_lat=new V3(),_t=new V3(),_gd=new V3(),_gp=new V3(),_gq=new V3();
