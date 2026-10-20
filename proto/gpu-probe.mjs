// Which GPU does headless Edge give WebGL / WebGPU on this machine, with and without --force_high_performance_gpu? node proto/gpu-probe.mjs
import {launchBrowser} from '../tools/browser.mjs';
import {serve} from '../tools/zlib.mjs';
const {server, origin} = await serve();
for (const extra of [[], ['--enable-unsafe-webgpu'], ['--force_high_performance_gpu'], ['--force_high_performance_gpu', '--enable-unsafe-webgpu']]) {
  const b = await launchBrowser({args: ['--ignore-gpu-blocklist', '--enable-gpu', ...extra]});
  const p = await b.newPage(); await p.goto(origin + '/index.html');
  const r = await p.evaluate(async () => {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2', {powerPreference: 'high-performance'}), e = gl.getExtension('WEBGL_debug_renderer_info');
    const out = {secure: isSecureContext, gl: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'), gpu: !!navigator.gpu, ua: navigator.userAgent.match(/Edg\/[\d.]+/)?.[0]};
    if (navigator.gpu) for (const pp of ['high-performance', 'low-power']) { const a = await navigator.gpu.requestAdapter({powerPreference: pp}); out[pp] = a ? JSON.stringify({v: a.info?.vendor, arch: a.info?.architecture, d: a.info?.description, ts: a.features.has('timestamp-query')}) : null; }
    return out; });
  console.log(JSON.stringify(extra), JSON.stringify(r)); await b.close();
}
server.close();
