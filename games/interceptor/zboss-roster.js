// The boss roster: every boss module registers itself with zbosses.js when imported. Add a new boss (the secret MIRV boss, say) by
// writing zboss-<name>.js with registerBoss(...) and importing it here.
import {hooks} from './zbotbrain.js';
import {bossBrain} from './zboss-brain.js';
import './zboss-ace.js';
import './zboss-jammer.js';
import './zboss-twins.js';
import './zboss-jugg.js';
import './zboss-ghost.js';
import './zboss-hive.js';
import './zboss-mirror.js';
import './zboss-undertaker.js';
import './zboss-siren.js';
import './zboss-puppet.js';
// the bots (benchmark and Bot Spectator) handle the bosses through the shared brain's hooks
if (!hooks.includes(bossBrain)) hooks.push(bossBrain);
