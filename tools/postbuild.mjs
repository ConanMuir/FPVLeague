// After `vite build`: dist/app.html is the whole game in one file (JS + CSS inlined); renamed to dist/index.html for the tools.
//  a) copy it to games/jared-league/index.html (the launcher's "Drone League (Jared's build)" card)
//  b) write dist/drone-league.artifact.html: the same page without <!doctype>/<html>/<head>/<body>, for a claude.ai artifact
//     (the artifact host adds those). Layout of that file: <title>, <link>s, <style>, the markup, then the module script.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'index.html');
if (fs.existsSync(path.join(root, 'dist', 'app.html'))) fs.renameSync(path.join(root, 'dist', 'app.html'), dist);
const html = fs.readFileSync(dist, 'utf8');
const fail = m => { console.error('postbuild: ' + m); process.exit(1); };

// a) standalone
const standalone = path.join(root, 'games', 'jared-league', 'index.html');
fs.mkdirSync(path.dirname(standalone), {recursive: true});
fs.writeFileSync(standalone, html);

// b) artifact. Cut the inlined script out first (index-based: an inline script can't contain "</script>"),
// then pick the other pieces out of what is left.
const s0 = html.indexOf('<script'), s1 = html.indexOf('</script>', s0);
if (s0 < 0 || s1 < 0 || html.indexOf('<script', s0 + 1) !== -1 && html.indexOf('<script', s0 + 1) < s1) fail('expected exactly one inline <script>');
if (html.indexOf('<script', s1) !== -1) fail('expected exactly one inline <script>');
const scriptTag = html.slice(s0, html.indexOf('>', s0) + 1);
if (/\ssrc=/.test(scriptTag)) fail('script was not inlined');
const js = html.slice(html.indexOf('>', s0) + 1, s1);
const rest = html.slice(0, s0) + html.slice(s1 + '</script>'.length);
const head = rest.slice(rest.indexOf('<head>') + 6, rest.indexOf('</head>'));
const body = rest.slice(rest.indexOf('<body>') + 6, rest.lastIndexOf('</body>'));
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] || fail('no <title>');
const links = head.match(/<link\b[^>]*>/gi) || [];
if (links.some(l => /rel="?stylesheet/i.test(l) && !/fonts\.googleapis\.com/.test(l))) fail('a local stylesheet was not inlined');
const styles = head.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
if (!styles.some(s => /\[hidden\]\{display:none!important\}/.test(s))) fail('the [hidden]{display:none!important} rule is missing');
const artifact = [title, ...links, ...styles, body.trim(), '<script type="module">' + js + '</script>', ''].join('\n');
fs.writeFileSync(path.join(root, 'dist', 'drone-league.artifact.html'), artifact);

const kb = n => (n / 1024).toFixed(0) + ' kB';
console.log(`postbuild: dist/index.html ${kb(html.length)} -> games/jared-league/index.html; dist/drone-league.artifact.html ${kb(artifact.length)}`);
