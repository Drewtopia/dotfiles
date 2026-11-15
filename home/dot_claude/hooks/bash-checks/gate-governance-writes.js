'use strict';
// Tripwire, not a boundary: catches the common shell write forms, and interpreter code
// (python, node, ruby) that writes a file and names a governed path. awk, git apply and
// patch pass unseen.

const os = require('os');
const path = require('path');
const { getCommand } = require('../lib/hook-io');
const { CD, WRAPPER, unquote, mask, splitUnquoted, segments } = require('../lib/shell');
const { ASK_DREW, isGoverned, unlocked } = require('../edit-governance-guard.cjs');

const HOME = os.homedir();
const MAY_WRITE = /[>]|\b(tee|rm|touch|mv|cp|sed|perl)\b/;
const ALL_ARGS = new Set(['tee', 'rm', 'touch', 'mv']);
const IN_PLACE = new Set(['sed', 'perl']);
const REDIRECT = /\d*>>?\|?\s*([^\s;&|<>]+)/g;

const resolve = (token, cwd) =>
    path.resolve(cwd, unquote(token).replace(/^(~|\$\{?HOME\}?)(?=\/|$)/, HOME));

function segmentTargets(seg) {
    const targets = [...mask(seg).matchAll(REDIRECT)].map(m =>
        seg.substr(m.index + m[0].length - m[1].length, m[1].length),
    );
    const words = splitUnquoted(seg, REDIRECT).flatMap(p => splitUnquoted(p, /\s+/g));
    const cmd = path.basename(words[0] || '');
    const args = words.slice(1).filter(w => !w.startsWith('-'));
    if (ALL_ARGS.has(cmd)) targets.push(...args);
    else if (cmd === 'cp' && args.length) targets.push(args[args.length - 1]);
    else if (IN_PLACE.has(cmd) && words.some(w => /^-[a-zA-Z]*i|^--in-place/.test(w)))
        targets.push(...args);
    return targets;
}

// A link made in the same command can send a temp path to live config.
const MAKES_LINKS = /(?:^|[\s;&|(])(?:ln|cp\s+(?:-\w+\s+)*-\w*s\w*)(?=\s)/;

function governedTargets(cmd, startCwd, tempExempt = !MAKES_LINKS.test(cmd)) {
    let cwd = startCwd;
    const hits = [];
    for (const seg of segments(cmd)) {
        const cd = seg.match(CD);
        const wrapped = seg.match(WRAPPER);
        if (cd) cwd = resolve(cd[2], cwd);
        else if (wrapped) hits.push(...governedTargets(unquote(wrapped[1]), cwd, tempExempt));
        else
            hits.push(
                ...segmentTargets(seg)
                    .map(t => resolve(t, cwd))
                    .filter(t => (tempExempt ? isGoverned(t) : isGoverned(t, () => false))),
            );
    }
    return hits;
}

const INTERPRETER = /(?:^|[\s;&|(])(?:python3?|node|bun|deno|ruby)(?=\s)/;
const WRITES_FILE =
    /open\([^)]*,\s*(?:mode\s*=\s*)?['"][wax]|\.write_text\(|\.write_bytes\(|writeFile|appendFile|createWriteStream|File\.write|os\.(?:remove|rename|replace|unlink)|shutil\.|unlinkSync|rmSync|renameSync/;
const PATHLIKE = /(?:~|\.{1,2})?\/?[\w.-]+(?:\/[\w.-]+)+|\b(?:AGENTS|CLAUDE)(?:\.local)?\.md\b/g;

// Interpreter code that writes a file: every governed path it names, resolved from the
// directory the interpreter starts in.
function interpreterTargets(cmd, startCwd) {
    if (!INTERPRETER.test(cmd) || !WRITES_FILE.test(cmd)) return [];
    let cwd = startCwd;
    for (const seg of segments(cmd)) {
        if (INTERPRETER.test(` ${seg}`)) break;
        const cd = seg.match(CD);
        if (cd) cwd = resolve(cd[2], cwd);
    }
    return [...cmd.matchAll(PATHLIKE)].map(m => resolve(m[0], cwd)).filter(t => isGoverned(t));
}

function run(input, isUnlocked = unlocked) {
    const cmd = getCommand(input);
    if (/edit-governance-guard[^;&|]*--expansion/.test(cmd))
        return {
            exitCode: 2,
            stderr: "🛑 BLOCKED: only the user's /edit-governance invocation grants a governance unlock.",
        };
    const cwd = input.cwd || process.cwd();
    const hits = [...interpreterTargets(cmd, cwd), ...(MAY_WRITE.test(cmd) ? governedTargets(cmd, cwd) : [])];
    if (!hits.length || isUnlocked(input.session_id)) return { exitCode: 0 };
    return {
        exitCode: 2,
        stderr: `🛑 BLOCKED: Bash write to governance surface ${hits[0]}. ${ASK_DREW}`,
    };
}

module.exports = { run };
