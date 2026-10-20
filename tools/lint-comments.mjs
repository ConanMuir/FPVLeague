// Lint: code hiding inside a // comment. The dense one-line style here (many statements per line, a // note at the end) has a
// recurring trap: a // comment inserted mid-line silently turns everything after it into comment, the build stays green, and
// the game breaks (see README "Comment lint"). This flags lines whose // comment looks like it swallowed code, for example
//   a();// new note b();c=1;  // old note        -> the comment holds "b();c=1;" and a second //
//   x=1;  // clamp it;y=clamp(y,0,1)             -> ";y=clamp(" after prose
// By default it checks the lines added or changed since the merge base with origin/main (what a PR adds); --all checks
// every line, for tuning. Warn-only: exits 0 unless --strict. Prints GitHub annotations when run in Actions.
//   node tools/lint-comments.mjs [--base <git ref>] [--all] [--strict] [files...]
// A line that really means it (e.g. a comment quoting code) can carry "lint-ok" in its comment.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), opt = k => argv.includes(k), val = k => argv.includes(k) ? argv[argv.indexOf(k) + 1] : null;
const ALL = opt('--all'), STRICT = opt('--strict'), GHA = !!process.env.GITHUB_ACTIONS;
const DIRS = ['src', 'engine', 'games/interceptor', 'tools', 'test'], EXT = /\.(m?js)$/;
const git = (...a) => execFileSync('git', a, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28});

// ---------- comments: a small JS scanner (strings, templates with ${}, regex literals, block comments) ----------
const KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
export function lineComments(src) {
  const out = new Map(); let i = 0, line = 1, prev = '', word = '';  // prev: last significant char; word: last identifier
  const stack = [];  // template nesting: depth of { inside each ${ }
  const n = src.length, isId = c => /[\w$]/.test(c);
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; const ls = src.lastIndexOf('\n', i - 1) + 1;
      out.set(line, {col: i - ls, code: src.slice(ls, i), text: src.slice(i + 2, j).replace(/\r$/, '')}); i = j; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2), e = j < 0 ? n : j + 2; for (let k = i; k < e; k++) if (src[k] === '\n') line++; i = e; continue; }
    if (c === '\'' || c === '"') { i++; while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; } i++; prev = 'a'; word = ''; continue; }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === 0)) {  // template text, from its start or from the end of a ${ }
      if (c === '}') stack.pop();
      i++; while (i < n && src[i] !== '`') { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '\n') line++; if (src[i] === '$' && src[i + 1] === '{') { stack.push(0); i += 2; break; } i++; }
      if (src[i] === '`') { i++; prev = 'a'; word = ''; } else prev = '(';
      continue; }
    if (c === '/') {  // regex literal or division
      const re = !prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || KW.has(word);
      if (re) { i++; let cls = false; while (i < n && src[i] !== '\n') { const ch = src[i]; if (ch === '\\') { i += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; i++; }
        i++; while (i < n && /[a-z]/i.test(src[i])) i++; prev = 'a'; word = ''; continue; }
    }
    if (stack.length) { if (c === '{') stack[stack.length - 1]++; else if (c === '}') stack[stack.length - 1]--; }
    if (isId(c)) { let j = i; while (j < n && isId(src[j])) j++; word = src.slice(i, j); prev = 'a'; i = j; continue; }
    prev = c; word = ''; i++;
  }
  return out;
}

// ---------- the heuristic: does this comment text look like it swallowed code? ----------
// Prose here is full of "x = what it means" and "foo() does this"; code is "x=1", "a.b+=c;", "foo(a);", "foo(a)&&". So:
// an assignment needs no space before the = (or a one-token right side and a ;), and a call needs code punctuation after the ).
const ID = String.raw`[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]\s]{1,12}\])*`, ARGS = String.raw`\((?:[^()]|\([^()]*\))*\)`;
const CODE = [
  String.raw`(?:const|let|var)\s+${ID}\s*=`,                    // const x=
  String.raw`(?:if|for|while|switch)\s*\(`,                     // if(
  String.raw`import\s*[{"*\w]`,                                 // import "..." (quoted text is "..." by then)
  String.raw`${ID}${ARGS}\s*(?:[;,})?]|&&|\|\||\.\w|$)`,        // foo(a); foo(a)&& foo(a).b
  String.raw`${ID}(?:[-+*/%|&]|\*\*)?=(?![=>])\S`,               // x=1 a.b+=c
  String.raw`${ID}\s*(?:[-+*/%|&]?=)(?![=>])\s*[^\s;]+\s*;`,    // x = 1;
  String.raw`${ID}(?:\+\+|--)`];                                // i++
const AFTER_SEMI = new RegExp(String.raw`;\s*(?:${CODE.join('|')})`);   // "...; foo(a);" after a ; inside the comment
const STATEMENT = new RegExp(String.raw`(?:^|[\s;{}])(?:${CODE.slice(3, 6).join('|')})`);
const CODEISH = /[\w$\])](?:\(|\[|\?\.|[-+*/%|&]?=(?![=>]))|\+\+|--|\b(?:let|var|const)\s+[\w$,\s]+;|\b(?:return|break|continue)\b[^;]{0,80}\}[,;]?\s*$|[)\]"]\}+[,;]?\s*$/;  // f( a[ x= i++ "let a;" "return x}"
const PROSE = [/https?:\/\//, /\blint-ok\b/];
export function looksLikeCode(text, code = '') {
  if (PROSE.some(r => r.test(text))) return null;
  const t = text.replace(/`[^`]*`|'[^']*'|"[^"]*"/g, '"..."');  // quoted examples are prose
  const inner = t.indexOf('//');
  if (inner >= 0 && /[;}]\s*$/.test(t.slice(0, inner))) return 'code before a second // in the same comment';  // x();// note y();  // old note
  if (/\S/.test(code) && /[;},]\s*$/.test(t) && CODEISH.test(t)) return 'the comment after code ends like a statement';  // x();// note y=1;
  if (/\)\{|\}\s*else\b/.test(t)) return 'a code block inside the comment';
  if (AFTER_SEMI.test(t)) {
    if (/\S/.test(code)) return 'a statement after ";" inside the comment';
    // a whole-line comment is often an API note ("o.step(dt) physics; o.paused(); o.draw(dt) visuals"): flag it only when most of
    // its ;-separated pieces are code
    const segs = t.split(';').slice(1).map(s => s.trim()).filter(Boolean), START = new RegExp(String.raw`^(?:${CODE.join('|')})`);
    // ... and a piece that runs on into a sentence ("sn=0: the material does its own") is prose
    const isCode = s => START.test(s + ';') && !/\b[a-z]+ [a-z]+ [a-z]+ [a-z]+\b/.test(s);
    if (segs.length && segs.filter(isCode).length * 2 > segs.length) return 'statements after ";" inside the comment';
  }
  if (/\S/.test(code) && STATEMENT.test(t) && /;\s*$/.test(t)) return 'a statement inside a comment after code';  // dense line: x();// note y();
  return null;
}

// ---------- which lines ----------
function changedLines(base) {
  const diff = git('diff', '--unified=0', '--no-color', '--no-ext-diff', base, '--', ...DIRS);
  const m = new Map(); let file = null;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, '').trim(); if (file === '/dev/null' || !EXT.test(file)) file = null; continue; }
    const h = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (h && file) { const s = +h[1], c = h[2] == null ? 1 : +h[2]; const set = m.get(file) || m.set(file, new Set()).get(file); for (let k = 0; k < c; k++) set.add(s + k); }
  }
  return m;
}
function pickBase() {
  const b = val('--base');
  if (b && !/^0+$/.test(b)) { try { git('rev-parse', '--verify', '--quiet', b + '^{commit}'); return b; } catch { console.log(`lint-comments: base ${b} not found; using origin/main`); } }
  for (const ref of ['origin/main', 'main']) { try { const mb = git('merge-base', 'HEAD', ref).trim(); const head = git('rev-parse', 'HEAD').trim(); return mb === head ? 'HEAD~1' : mb; } catch {} }
  return 'HEAD~1';
}

function main() {
  let targets;  // Map file -> Set(lines) or null (every line)
  const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--base');
  if (files.length) targets = new Map(files.map(f => [path.relative(root, path.resolve(f)).split(path.sep).join('/'), null]));
  else if (ALL) targets = new Map(git('ls-files', ...DIRS).split('\n').filter(f => EXT.test(f)).map(f => [f, null]));
  else { const base = pickBase(); targets = changedLines(base); console.log(`lint-comments: lines changed since ${base.slice(0, 12)} in ${targets.size} file(s)`); }
  let hits = 0;
  for (const [file, lines] of targets) {
    const f = path.join(root, file); if (!fs.existsSync(f) || file === 'tools/lint-comments.mjs') continue;  // this file's comments quote the bad patterns on purpose
    const src = fs.readFileSync(f, 'utf8'), cm = lineComments(src), all = src.split('\n');
    for (const [ln, c] of cm) {
      if (lines && !lines.has(ln)) continue;
      const why = looksLikeCode(c.text, c.code); if (!why) continue;
      hits++;
      const raw = all[ln - 1].replace(/\r$/, ''), short = raw.length > 220 ? '... ' + raw.slice(Math.max(0, c.col - 100), c.col + 120) + ' ...' : raw.trim();
      console.log(`${file}:${ln}:${c.col + 1}: ${why}\n    ${short}`);
      if (GHA) console.log(`::warning file=${file},line=${ln},col=${c.col + 1},title=code after // ?::${why}. A // comment ends the line: anything after it is not run. Move the comment to the end of the line or use /* */.`);
    }
  }
  console.log(hits ? `lint-comments: ${hits} suspicious comment(s)${STRICT ? '' : ' (warn-only)'}` : 'lint-comments: ok');
  process.exit(hits && STRICT ? 1 : 0);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
