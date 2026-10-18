// Betaflight rates types for the Rates panel and S.rprof.
// f: [display multiplier, min, max] in the units Configurator shows; stored values are Betaflight's raw CLI integers
export const RTYPES={BETAFLIGHT:{h:['RC Rate','Super Rate','RC Expo'],f:[[.01,.01,2.55],[.01,0,1],[.01,0,1]],d:[100,70,0]},
 ACTUAL:{h:['Center Sens.','Max Rate','Expo'],f:[[10,10,2000],[10,10,2000],[.01,0,1]],d:[7,67,0]},
 QUICK:{h:['RC Rate','Max Rate','Expo'],f:[[.01,.01,2.55],[10,0,2000],[.01,0,1]],d:[100,67,0]},
 KISS:{h:['RC Rate','Rate','RC Curve'],f:[[.01,.01,2.55],[.01,0,.99],[.01,0,1]],d:[100,70,0]},
 RACEFLIGHT:{h:['Rate','Acro+','Expo'],f:[[10,10,2550],[1,0,255],[1,0,100]],d:[37,80,50]}};
export const defRates=(type='BETAFLIGHT')=>({type,ax:[0,1,2].map(()=>[...RTYPES[type].d]),thrMid:50,thrExpo:0,thrLimit:100});
