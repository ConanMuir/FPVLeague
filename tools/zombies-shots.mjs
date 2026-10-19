// Zombies screenshots for eyeballing: node tools/zombies-shots.mjs OUTDIR [kinds] [chaos] [base] [perf]
//  kinds  every enemy kind lined up in front of the chase camera
//  chaos  a late wave (default 28) with a full defence, mid-fight, from the FPV and chase cameras; prints frame times
//  base   the base screen at that point
import {serve, launch, open, sleep} from './zlib.mjs';
const [OUT, ...what] = process.argv.slice(2), want = k => !what.length || what.includes(k);
const {server, origin} = await serve(); const b = await launch(); const errs = [];
const p = await open(b, origin + '/games/interceptor/', errs);
await p.evaluate(() => localStorage.setItem('dl-interceptor', JSON.stringify({gmode: 'z', wx: 'clear', cam: 1})));
await p.reload({waitUntil: 'load'}); await p.waitForFunction(() => window.__z); await sleep(500);
await p.click('#play'); await sleep(400);

if (want('kinds')) {
  await p.evaluate(() => { const {api, G} = __z; __z.cont(); G.wq.length = 0; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; });
  await sleep(2800);
  await p.evaluate(() => {
    const {api, G} = __z, cam = api.camera, V = api.THREE.Vector3, f = new V(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize(), r = new V(-f.z, 0, f.x);
    const ks = ['shahed', 'jet', 'decoy', 'heavy', 'cruise', 'ballistic', 'hyper', 'icbm'];
    ks.forEach((k, i) => { const s = i - (ks.length - 1) / 2, t = __z.make(k, cam.position.x + f.x * 60 + r.x * s * 7, cam.position.z + f.z * 60 + r.z * s * 7); t.p.y = cam.position.y + 6; t.v.copy(r).multiplyScalar(.01); t.spd = .01; t.wps.length = 0; t.aim = t.p.clone().addScaledVector(r, 1e5); });
    for (let i = 0; i < 12; i++) { const t = __z.make('swarm', cam.position.x + f.x * 40 + r.x * (i - 6) * 1.2, cam.position.z + f.z * 40 + r.z * (i - 6) * 1.2); t.grp = 999; t.p.y = cam.position.y + 1; t.spd = .01; t.v.set(0, 0, .01); t.aim = t.p.clone().addScaledVector(r, 1e5); t.wps.length = 0; }
    window.__freeze = setInterval(() => { for (const t of api.TH) { t.v.setLength(.01); } }, 16);
  });
  await sleep(600); await p.screenshot({path: OUT + '/z-kinds.png'});
  await p.evaluate(() => { clearInterval(window.__freeze); const {api} = __z; for (const t of api.TH) api.scene.remove(t.mesh); api.TH.length = 0; while (__z.G.state === 'wave') __z.sim(1); });
}
console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close(); server.close();
