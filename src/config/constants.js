// Shared helpers and world constants (metres, seconds). Leaf module: imports nothing but three.
import * as THREE from 'three';
export const $=id=>document.getElementById(id), V3=THREE.Vector3, QT=THREE.Quaternion, cl=(v,a,b)=>v<a?a:v>b?b:v;
// ---------- world constants (metres, seconds) ----------
// arena sizes [name, width, length, ceiling]; an online client builds the host's size (set before its rejoin reload)
export const ARENAS=[['Classic',220,280,90],['Big',280,360,100],['Huge',340,440,115],['Massive',420,540,130]],AI=(()=>{let a=1;try{const n=sessionStorage.getItem('dlArenaNet');sessionStorage.removeItem('dlArenaNet');a=n!=null?+n:JSON.parse(localStorage.getItem('droneleague')||'{}').arena??1}catch(e){}return ARENAS[a]?a:1})();
export const[,W,L,H]=ARENAS[AI],GW=46,GH=18,GD=14,RC=32,RF=10,HW=W/2,HL=L/2;
export const COL=[0x2d8cff,0xff7a1a],CSS=['#3d95ff','#ff8a2a'],TEAM=['BLUE','ORANGE'],UP=new V3(0,1,0);
export const DIFF=[
 {n:'Rookie',kp:.9,kd:2.2,vmax:34,att:7,rate:6,thr:.72,react:.3,noise:4,slack:1.35},
 {n:'Pro',kp:1.1,kd:2.6,vmax:48,att:9,rate:8,thr:.84,react:.18,noise:2,slack:1.2},
 {n:'All-Star',kp:1.3,kd:3,vmax:62,att:11,rate:10,thr:.94,react:.12,noise:1,slack:1.08},
 {n:'Legend',kp:1.5,kd:3.4,vmax:76,att:13,rate:12,thr:1,react:.08,noise:.4,slack:1},
 // iq: the smarter planner in bots/ (shot placement, ball-aware intercepts, rotations, keeper, Dogfight leading); pop: uses pops on a carry. Same flight model and thrust limits as everyone.
 {n:'Champion',kp:1.7,kd:3.6,vmax:80,att:14,rate:13,thr:1,react:.06,noise:.3,slack:.95,iq:1,ka:1.5,fl:.55},
 {n:'Grand Champion',kp:1.9,kd:4.2,vmax:90,att:17,rate:16,thr:1,react:.035,noise:.08,slack:.92,iq:2,ka:1.5,fl:.55,aim:1,demo:1,pop:1},
 // Dribbler: a demonstration of the carry and pop mechanics (bots/dribble.js): its attacker scoops, catches and carries the ball on top and pops it at the goal
 {n:'Dribbler',kp:1.5,kd:3.4,vmax:60,att:22,rate:18,thr:1,react:.06,noise:.3,slack:1,drib:1,pop:1,dv:10,hold:1.2,kc:4,kn:16,kv:8,ke:4},
 // Freestyler: the Dribbler's pickup plus chosen pops, pop chains, air dribbles, double taps and spin shots (bots/freestyle.js)
 {n:'Freestyler',kp:1.5,kd:3.4,vmax:70,att:22,rate:18,thr:1,react:.06,noise:.3,slack:1,drib:1,fs:1,pop:1,dv:10,hold:.5,cy:9,cm:.9,cl:30,kc:4,kn:16,kv:8,ke:4,ka:1.5,fl:.55}];
