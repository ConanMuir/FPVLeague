// Shared helpers and world constants (metres, seconds). Leaf module: imports nothing but three.
import * as THREE from 'three';
export const $=id=>document.getElementById(id), V3=THREE.Vector3, QT=THREE.Quaternion, cl=(v,a,b)=>v<a?a:v>b?b:v;
// ---------- world constants (metres, seconds) ----------
export const W=220,L=280,H=64,GW=46,GH=18,GD=14,RC=32,RF=10,HW=W/2,HL=L/2;
export const COL=[0x2d8cff,0xff7a1a],CSS=['#3d95ff','#ff8a2a'],TEAM=['BLUE','ORANGE'],UP=new V3(0,1,0);
export const DIFF=[
 {n:'Rookie',kp:.9,kd:2.2,vmax:34,att:7,rate:6,thr:.72,react:.3,noise:4,slack:1.35},
 {n:'Pro',kp:1.1,kd:2.6,vmax:48,att:9,rate:8,thr:.84,react:.18,noise:2,slack:1.2},
 {n:'All-Star',kp:1.3,kd:3,vmax:62,att:11,rate:10,thr:.94,react:.12,noise:1,slack:1.08},
 {n:'Legend',kp:1.5,kd:3.4,vmax:76,att:13,rate:12,thr:1,react:.08,noise:.4,slack:1}];
