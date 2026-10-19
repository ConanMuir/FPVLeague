// npm test: tools/lint-comments.mjs flags code swallowed by a // comment, and leaves prose comments alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {lineComments, looksLikeCode} from '../tools/lint-comments.mjs';
const flag = line => { const c = lineComments(line).get(1); return c ? looksLikeCode(c.text, c.code) : null; };

test('a // inserted mid-line in front of code is flagged', () => {
  for (const l of [
    "const a=1;// ground contacts const r=d.p.y-h;if(r<0)hit(r);  // old note",   // the r-definition bug
    "physStep(dt);// load the map colliders setMap(!!GS.OBSON);",                  // the setMap bug
    "a();// note b();c=1;",
    "x=1;  // clamp it;y=clamp(y,0,1)",
    "if(k)go();// TODO check this return 0}",
    "let q=0;// keep it level here q+=w*dt;",
    "f();// note import './x.js';import './y.js';",
  ]) assert.ok(flag(l), 'should flag: ' + l);
});
test('prose comments, URLs, strings and regexes are left alone', () => {
  for (const l of [
    "const C2D=new Map();  // collider handle -> {d, tag}",
    "export const cam=new P(70,1,.15,1800)  // near .15: twice the depth precision far away (FPV hides your own quad);",
    "// o.pre(now) before stepping; o.step(dt) physics; o.paused(); o.draw(dt) visuals; o.menu() menu open",
    "// visibility per weather; th = thermal camera on (stars, beams, lamps hidden)",
    "// p = kill chance per engagement before RESIST; mag = shots per wave; rng = reach (m).",
    "// modes register at load; setGame() falls back to League for an unknown id",
    "fetch(u);  // see https://example.com/a;b=c(d)",
    "const s='a // b; c();';const r=/\\/\\/x;y=1/g;",
    "const t=`x // ${a;b()} y`;",
    "x();  // quoted example: 'a(); b();' lint-ok",
  ]) assert.equal(flag(l), null, 'should not flag: ' + l);
});
test('the scanner finds real comments only', () => {
  const m = lineComments("a='//no';b=/\\/\\//;c=4/2;// yes\nd=`${'//'}`;// two\n/* x // y */ e();");
  assert.deepEqual([...m.keys()], [1, 2]);
  assert.equal(m.get(1).text, ' yes'); assert.equal(m.get(2).text, ' two');
});
