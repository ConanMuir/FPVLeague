// Betaflight rate maths (rc.c) for every rates type; axis 0 roll, 1 pitch, 2 yaw; returns rad/s. The maths itself (rateR, thrCurveR)
// is the shared flight core, flight/core.js, which Riley's games use too; this file picks the profile in use.
import {S} from '../config/settings.js';
import {P3,rateR,thrCurveR} from './core.js';
export {P3,rateR};
// RO.r: a temporary rate profile (the Calibration Lab's working copy) that wins over S.rprof while it is set, so nothing half-tuned is ever saved
export const RO={r:null},RT=()=>RO.r||S.rprof[S.rpi],stk=[0,0,0,0];
export const rate=(axis,x)=>rateR(RT(),axis,x);
export function thrCurve(t){return thrCurveR(RT(),t)}
