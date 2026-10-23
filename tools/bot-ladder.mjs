/* Bot self-play ladder (League, headless): the top levels (Legend, Dribbler, Freestyler) and mutated candidates play each other bot vs bot
   through the real modules in a headless browser at full sim speed (no drawing), with Elo ratings, and each generation's winners are
   written to src/bots/evolved.json, which the game offers as "Gen N <archetype>" levels above Freestyler (bots/evolved.js).
     node tools/bot-ladder.mjs --minutes 30                 evolve for a wall-clock budget (resumes from the file's last generation)
     node tools/bot-ladder.mjs --gens 2 --cands 2           a fixed number of generations
   Options (defaults): --seed 1  --roster Legend,Dribbler,Freestyler  --cands 3 (children per archetype per generation)  --match-min 3
   (sim minutes per match, half each way)  --parallel 2 (pages = matches at once; CPU is shared, keep it at 2)  --out src/bots/evolved.json
   --fresh (ignore the file)  --no-rr / --no-rr-end (skip the round robin before the first generation / after the last)  --json (print the file)
   Deterministic given the seed and the file's state: every match's Math.random is seeded from (seed, generation, archetype, child, match).
   The gate (bot-ladder-lib.mjs gate): a child that wins without touching, holding, shooting and scoring the ball itself, or with the ball
   leaving the arena, is not promoted. See tools/bot-ladder-lib.mjs for the tunable bounds and the loop. */
import path from 'node:path';
import {root, runLadder, tableText} from './bot-ladder-lib.mjs';

const argv = process.argv.slice(2), has = k => argv.includes(k), val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const minutes = +val('--minutes', 0), gens = +val('--gens', 0);
const opts = {minutes: !minutes && !gens ? 30 : minutes, gens, seed: +val('--seed', 1), roster: val('--roster', 'Legend,Dribbler,Freestyler').split(',').map(s => s.trim()).filter(Boolean),
  cands: +val('--cands', 3), matchMin: +val('--match-min', 3), parallel: Math.max(1, +val('--parallel', 2)), out: path.resolve(root, val('--out', 'src/bots/evolved.json')),
  fresh: has('--fresh'), rr: !has('--no-rr'), rrEnd: !has('--no-rr-end')};
console.log(`bot ladder: ${opts.roster.join(', ')}; seed ${opts.seed}; ${opts.minutes ? opts.minutes + ' min budget' : opts.gens + ' generations'}; ${opts.cands} children; ${opts.matchMin} sim min per match; ${opts.parallel} at once; file ${path.relative(root, opts.out)}`);
const D = await runLadder(opts);
console.log(`\ngeneration ${D.gen}, ${D.games} matches played in all; champions: ${Object.entries(D.champs).map(([a, id]) => `${a} = ${id}`).join(', ')}`);
console.log(tableText(D.table));
if (has('--json')) console.log(JSON.stringify(D, null, 1));
