// Drone League world constants (metres, seconds) and the ball / match tune. The flight model's own tune lives in the engine (engine/flight.js).
// Arena: W 220 x L 280 x H 64 m (Rocket League proportions relative to the ball); goals 46 x 18 x 14 m; corner radius RC 32, ramp radius RF 10
export const W=220,L=280,H=64,GW=46,GH=18,GD=14,RC=32,RF=10,HW=W/2,HL=L/2;
export const COL=[0x2d8cff,0xff7a1a],CSS=['#3d95ff','#ff8a2a'],TEAM=['BLUE','ORANGE'];
export let BR=2.6,BG=5,TB=.15,BBX=[.6,.28,.65],BTHR=124,MAXB=85,DEMO=48,PBG=100,PSM=20,BB=.68,BD=.03,BM=.7,KICK=1,GSPD=1,BOTV=1,SHK=1;
// T = the mod panel values; G/THR = the flight model's gravity and thrust (bots get at most 160 m/s² of thrust so they don't get 10:1 punch)
export function tuneLeague(T,G,THR){const k=T.size/.75;BBX=[.6*k,.28*k,.65*k];BTHR=Math.min(THR,160*G/34.5);TB=T.tbounce;PBG=T.padb;PSM=T.pads;
 BG=T.bgrav;BR=T.bsize;BB=T.bbounce;BD=T.bdrag;MAXB=T.bmax;BM=T.bmass;KICK=T.kick;DEMO=T.demo;GSPD=T.speed;BOTV=T.botv;SHK=T.shake}
