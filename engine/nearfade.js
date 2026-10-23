// Weather motes (snow, dust) are world-sized points in a box that wraps around the camera, so now and then one drifts right past the lens
// and draws for a frame or two as a blurry disc over a fifth of the screen (a 0.45 m flake 30 cm away). nearFade(material, a, b) fades a
// PointsMaterial's points out as they come closer than b metres to the camera (gone by a metres); farther ones draw exactly as before.
// Used by Drone League's Alpine snow (src/world/maps.js) and the Interceptor's snow and dust (games/interceptor/zwx.js).
export function nearFade(m,a,b){const ob=m.onBeforeCompile,k=m.customProgramCacheKey,A=a.toFixed(2),B=b.toFixed(2);
 m.onBeforeCompile=function(s,r){ob?.call(this,s,r);
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying float vNearF;').replace('#include <fog_vertex>',`#include <fog_vertex>\n\tvNearF=smoothstep(${A},${B},-mvPosition.z);`);
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vNearF;').replace('#include <premultiplied_alpha_fragment>','gl_FragColor.a*=vNearF;\n\t#include <premultiplied_alpha_fragment>')};
 m.customProgramCacheKey=function(){return(k?k.call(this):'')+'|nearFade'+A+','+B};return m}
