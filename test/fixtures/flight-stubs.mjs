// Module hooks for test/flight-golden.test.mjs: lets node import src/flight/drone.js (the real Drone.step) without a browser.
// The modules drone.js imports that need the DOM / WebGL / WebAudio / Rapier (render/, audio/, physics/, world/highlands.js) are
// swapped for stubs. Each stub exports exactly the names its importer asks for (read from the importer's `import {...} from`
// lines), as an inert proxy, except physics/sdf.js, which becomes a flat floor at y = 0 so the turtle / self-righting pivots work.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const STUB = /\/src\/(render|audio|physics|ui|modes)\/[^/]+\.js$|\/src\/world\/highlands\.js$/;
const names = (parent, spec) => {
  let src = ''; try { src = fs.readFileSync(fileURLToPath(parent), 'utf8'); } catch (e) { return []; }
  const out = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) if (m[2] === spec) for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/)[0]; if (k) out.add(k); }
  return [...out];
};
export async function resolve(spec, ctx, next) {
  if (ctx.parentURL?.startsWith('stub:')) return next(spec, {...ctx, parentURL: import.meta.url});  // the sdf stub's 'three'
  const r = await next(spec, ctx);
  if (!STUB.test(r.url) || !ctx.parentURL || STUB.test(ctx.parentURL)) return r;
  const kind = /\/physics\/sdf\.js$/.test(r.url) ? 'sdf' : 'proxy';
  return {url: `stub:${kind}?${encodeURIComponent(names(ctx.parentURL, spec).join(','))}#${encodeURIComponent(r.url)}`, shortCircuit: true};
}
export async function load(url, ctx, next) {
  if (!url.startsWith('stub:')) return next(url, ctx);
  const kind = url.slice(5, url.indexOf('?')), list = decodeURIComponent(url.slice(url.indexOf('?') + 1, url.indexOf('#'))).split(',').filter(Boolean);
  let src = 'const P=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==="then"?undefined:P,apply:()=>P,construct:()=>P});\n';
  if (kind === 'sdf') src += "import {Vector3} from 'three';export const sdf=(x,y,z)=>-y,_an=new Vector3();\n" +
    'export function sdN(p,out){const h=.02,x=p.x,y=p.y,z=p.z;out.set(sdf(x+h,y,z)-sdf(x-h,y,z),sdf(x,y+h,z)-sdf(x,y-h,z),sdf(x,y,z+h)-sdf(x,y,z-h));const l=out.length();return l>1e-9?out.divideScalar(l):out.set(0,1,0)}\n';
  for (const n of list) if (!(kind === 'sdf' && ['sdf', 'sdN', '_an'].includes(n))) src += `export const ${n}=P;\n`;
  return {format: 'module', source: src, shortCircuit: true};
}
