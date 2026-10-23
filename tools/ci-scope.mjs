// CI: does this push / PR touch an area's files? Run-only-what-changed for the browser jobs.
//   node tools/ci-scope.mjs <area> <base sha or ref>   ->  prints "run=true|false" (also to $GITHUB_OUTPUT) and why
// Areas: league (Drone League: the Vite build in src/, built to games/drone-league; smoke and the *-check tools), interceptor (Zombies: engine/ + games/interceptor, zombies-test and its siblings).
// Shared files (package-lock, the workflow, tools/browser.mjs) count for both. Always runs when the base is unknown (new branch,
// force push, workflow_dispatch) or on main, so main is always fully checked.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const [area, base] = process.argv.slice(2), E = process.env;
const SHARED = [/^package(-lock)?\.json$/, /^\.github\//, /^tools\/browser\.mjs$/];
const AREAS = {
  league: [/^src\//, /^app\.html$/, /^index\.html$/, /^vite\.config\.js$/, /^Drone League\//, /^games\/(drone|jared)-league\//, /^tools\/(smoke|postbuild|check-build|physics-check|pop-check|sound-check|spin-check|training-check|glitch-check|bot-ladder|bot-ladder-lib|bot-ladder-check)\.mjs$/, /^tools\/audio-levels\.mjs$/],
  interceptor: [/^engine\//, /^games\/interceptor\//, /^tools\/(zlib|zombies-[\w-]+|flight-golden|glitch-check|intercept-check)\.mjs$/, /^src\/flight\/core\.js$/, /^src\/input\/sticks\.js$/, /^src\/ui\/fpsmeter\.js$/, /^src\/render\/dynres\.js$/, /^tools\/audio-levels\.mjs$/]};  /* the games import the shared flight core, stick maths, FPS meter and dynamic resolution from src/; audio-levels measures both games */
if (!AREAS[area]) { console.error('area must be one of ' + Object.keys(AREAS).join(', ')); process.exit(2); }
const out = (run, why) => { console.log(`run=${run}  (${area}: ${why})`); if (E.GITHUB_OUTPUT) fs.appendFileSync(E.GITHUB_OUTPUT, `run=${run}\n`); process.exit(0); };

if (E.GITHUB_REF === 'refs/heads/main') out(true, 'main is always fully checked');
if (E.GITHUB_EVENT_NAME === 'workflow_dispatch') out(true, 'manual run');
if (!base || /^0+$/.test(base)) out(true, 'no base to compare with');
const git = (...a) => execFileSync('git', a, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
let files;
try {
  try { git('cat-file', '-e', base + '^{commit}'); } catch { git('fetch', '--quiet', '--depth=1', 'origin', base); }
  files = git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
} catch (e) { out(true, 'could not diff against ' + base); }
const hit = files.filter(f => SHARED.some(r => r.test(f)) || AREAS[area].some(r => r.test(f)));
out(hit.length > 0, hit.length ? `${hit.length} of ${files.length} changed files, e.g. ${hit.slice(0, 3).join(', ')}` : `none of the ${files.length} changed files`);
