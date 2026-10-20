// After `npm run build`: is the committed games/drone-league/index.html what src/ builds to? Compares the fresh build with the
// file in HEAD, ignoring line endings: a Windows checkout has CRLF sources, so its build carries "\r\n" inside string literals
// where a Linux build has "\n". Prints a GitHub warning (or a line) when they differ; always exits 0.
//   node tools/check-build.mjs
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), rel = 'games/drone-league/index.html';
const BS = String.fromCharCode(92), norm = s => s.replace(/\r/g, '').split(BS + 'r' + BS + 'n').join(BS + 'n');  // CRs and "\r\n" escapes
let committed = null;
try { committed = execFileSync('git', ['show', 'HEAD:' + rel], {cwd: root, encoding: 'utf8', maxBuffer: 1 << 28}); } catch {}
const built = fs.readFileSync(path.join(root, rel), 'utf8');
if (committed != null && norm(committed) === norm(built)) console.log(`${rel} matches the build`);
else {
  const msg = `The committed ${rel} differs from what src/ builds to: run npm run build and commit it`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning file=${rel}::${msg}` : 'WARN ' + msg);
}
