// Physics tunables. They are live `export let` bindings: only applyTune() (below) may assign them, other modules read them.
// Modules that cache something derived from the tune (bloom, ball/drone mesh scale) register onTune(fn); it runs after every applyTune().
import {V3} from './constants.js';
import {S} from './settings.js';
import {GS} from '../state.js';
export let G=15,BR=2.6,DRAD=.8,BG=5,THR=58,BZ=.05,BOOST=140,BKICK=8,GF=.1,TB=.15,SPOOL=.03,TURT=4.5,WASH=1,HBP=[],HBR=.13,BBX=[.6,.28,.65],DI=.22,MAXV=78,TE=1.6,VP=240,BTHR=124,MAXB=85,DEMO=48,DL=.1,DQ=.006,HOV=(G/THR)**(1/TE),TAU=.012,DRAIN=33,START=33,PBG=100,PSM=20,BB=.68,BD=.03,BM=.7,KICK=1,GSPD=1,BOTV=1,SHK=1,DB=.35;
const tuneHooks=[];export const onTune=f=>{tuneHooks.push(f)};
// the host's physics settings (GS.hostTune) win in online games
export function applyTune(){const T=GS.hostTune||S.mod;G=T.grav;THR=T.thr;TE=T.te;VP=T.vp;BTHR=Math.min(THR,160*G/34.5);MAXV=T.maxv;TAU=T.tau/1000;DL=T.dl;DQ=T.dq;DRAD=.8*T.size;{const k=T.size/.75,r=HBR=.13*k,ax=.55*k-r,az=.6*k-r,cr=.34*k-r;BBX=[.6*k,.28*k,.65*k];DI=.22*k*k;HBP=[];  // ground hull: 0.55 x 0.6 m half-size, 0.34 m corner radius, 0.13 m edge radius
  for(const[sx,sz]of[[1,1],[-1,1],[-1,-1],[1,-1]])for(let i=0;i<4;i++){const a=i/3*Math.PI/2;HBP.push(new V3(sx*(ax-cr+cr*Math.cos(a)),0,sz*(az-cr+cr*Math.sin(a))))}}SPOOL=T.spool/1000;GF=T.gfric;TURT=T.turtle*Math.PI/180;WASH=T.wash;DB=T.dbounce;BZ=T.bzone/100;BOOST=T.boost;BKICK=T.bkick;TB=T.tbounce;DRAIN=T.drain;START=T.start;PBG=T.padb;PSM=T.pads;
 BG=T.bgrav;BR=T.bsize;BB=T.bbounce;BD=T.bdrag;MAXB=T.bmax;BM=T.bmass;KICK=T.kick;DEMO=T.demo;GSPD=T.speed;BOTV=T.botv;SHK=T.shake;HOV=(G/THR)**(1/TE);
 tuneHooks.forEach(f=>f(T))}
