// Mod panel physics sliders: [group, key, label, default, min, max, step, unit]. S.mod holds the values; applyTune() turns them into the tunables.
import {cl} from './constants.js';
export const MODS=[
 ['Drone','grav','Gravity',34.5,2,40,.5,'m/s²'],['Drone','thr','Thrust',345,20,600,5,'m/s²'],['Drone','te','Thrust curve',1.6,1,2.5,.05,'^'],['Drone','vp','Prop pitch speed',240,40,500,5,'m/s'],['Drone','maxv','Top speed',200,20,300,1,'m/s'],
 ['Drone','tau','Stick lag',4,2,60,1,'ms'],['Drone','dl','Linear drag',0.04,0,1,.01,''],['Drone','dq','Air drag',0.0039,0,.03,.0001,''],
 ['Drone','size','Drone size',2,.4,4,.05,'×'],['Drone','dbounce','Wall bounce',0.05,0,1,.05,''],['Drone','gfric','Ground grip',0.1,0,1,.02,''],['Drone','spool','Motor spool',20,0,150,5,'ms'],['Drone','turtle','Turtle rate',260,60,720,10,'°/s'],['Drone','wash','Prop wash',1.4,0,3,.1,'×'],
 ['Boost','bzone','Boost zone',5,0,30,1,'%'],['Boost','boost','Super boost',60,0,250,1,'m/s²'],['Boost','bkick','Boost kick',8,0,30,1,'m/s'],['Boost','drain','Boost drain',33,0,100,1,'/s'],['Boost','start','Kickoff boost',33,0,100,1,''],
 ['Boost','padb','Big orb refill',100,0,100,5,''],['Boost','pads','Small orb refill',20,0,100,5,''],
 ['Ball','bgrav','Ball gravity',34.5,0,60,.5,'m/s²'],['Ball','bsize','Ball radius',2.6,1,8,.1,'m'],['Ball','bbounce','Ball bounce',0.6,0,1.1,.02,''],['Ball','tbounce','Touch bounce',0.15,0,.6,.05,''],
 ['Ball','bdrag','Ball drag',0.03,0,.5,.005,''],['Ball','bmax','Ball top speed',160,20,300,1,'m/s'],['Ball','bmass','Ball weight',0.2,.05,5,.05,'×'],['Ball','kick','Hit power',1,0,4,.05,'×'],
 ['Match','demo','Demolish speed',40,10,200,1,'m/s'],['Match','speed','Game speed',1,.25,2,.05,'×'],['Match','botv','Bot thrust',1,.3,1.5,.05,'×'],
 ['Look','bloom','Glow',0.9,0,2.5,.05,''],['Look','shake','Camera shake',1,0,3,.1,'×']];
export const MDEF=Object.fromEntries(MODS.map(m=>[m[1],m[3]]));
export const PRESETS={'Default':{},'Moon ball':{bgrav:1.5,bbounce:.9,bdrag:.01},'Racer':{thr:430,maxv:280,dq:.0028,tau:3,spool:15},
 'Heavy metal':{grav:28,thr:170,size:2.8,bmass:2,kick:1.4,demo:30},'Arcade':{grav:10,thr:45,te:1,maxv:90,dl:.14,dq:.0065,tau:20,kick:1.8,bsize:4,speed:.85},'Giant ball':{bsize:6,bgrav:3,bmass:1.5},'Infinite boost':{drain:0,start:100},'LiftOff real-scale':{grav:9.81,thr:98,vp:68,maxv:60,dl:.04,dq:.0137}};
export function cleanMod(o){const r={};if(o&&typeof o==='object')for(const[,k,,,mn,mx]of MODS){const v=+o[k];if(k in o&&Number.isFinite(v))r[k]=cl(v,mn,mx)}return r}
