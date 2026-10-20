// Runs proto/webgpu/smoke.html three ways (r160 WebGL CPU particles / r186 WebGPU compute / r186 WebGL 2 fallback) at several particle counts.
//   node proto/webgpu/run-smoke.mjs [--gpu intel|nvidia] [--n 3400,50000,200000] [--shots]
import fs from 'node:fs';
import path from 'node:path';
import {launchBrowser} from '../../tools/browser.mjs';
import {serve, root} from '../../tools/zlib.mjs';
const A = process.argv, arg = (k, d) => { const i = A.indexOf('--' + k); return i > 0 ? A[i + 1] : d; };
const GPU = arg('gpu', 'nvidia'), NS = arg('n', '3400,50000,200000').split(',').map(Number), RS = arg('r', 'gl160,gpu,gpugl').split(','), SHOTS = A.includes('--shots');
const {server, origin} = await serve();
const b = await launchBrowser({protocolTimeout: 600000, args: ['--window-size=1920,1080', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-webgpu', '--disable-frame-rate-limit', '--disable-gpu-vsync', ...(GPU === 'nvidia' ? ['--force_high_performance_gpu'] : [])]});
const out = [];
for (const n of NS) for (const r of RS) {
  const p = await b.newPage(); await p.setViewport({width: 1920, height: 1080}); const errs = [];
  p.on('pageerror', e => errs.push(String(e.message || e))); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
  await p.goto(`${origin}/proto/webgpu/smoke.html?r=${r}&n=${n}&f=${n > 100000 ? 300 : 600}`);
  const res = await p.waitForFunction(() => window.__result, {timeout: 300000, polling: 200}).then(h => h.jsonValue());
  if (SHOTS && n === NS[0]) { fs.mkdirSync(path.join(root, 'proto', 'webgpu', 'shots'), {recursive: true}); await p.screenshot({path: path.join(root, 'proto', 'webgpu', 'shots', `smoke-${r}.png`)}); }
  res.errs = [...new Set(errs)].slice(0, 3); out.push(res); console.log(JSON.stringify(res)); await p.close();
}
fs.writeFileSync(path.join(root, 'proto', 'webgpu', `smoke-${GPU}.json`), JSON.stringify(out, null, 1));
await b.close(); server.close();
