'use strict';
// Tripwire, not a boundary: catches the common shell write forms. Interpreter writes
// (python -c, node -e, awk, git apply, patch) pass unseen.

const os = require('os');
const path = require('path');
const { getCommand } = require('../lib/hook-io');
const { CD, WRAPPER, unquote, mask, splitUnquoted, segments } = require('../lib/shell');
const { isGoverned, unlocked } = require('../edit-governance-guard.cjs');

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

function governedTargets(cmd, startCwd) {
    let cwd = startCwd;
    const hits = [];
    for (const seg of segments(cmd)) {
        const cd = seg.match(CD);
        const wrapped = seg.match(WRAPPER);
        if (cd) cwd = resolve(cd[2], cwd);
        else if (wrapped) hits.push(...governedTargets(unquote(wrapped[1]), cwd));
        else
            hits.push(
                ...segmentTargets(seg)
                    .map(t => resolve(t, cwd))
                    .filter(isGoverned),
            );
    }
    return hits;
}

function run(input, isUnlocked = unlocked) {
    const cmd = getCommand(input);
    if (/edit-governance-guard[^;&|]*--expansion/.test(cmd))
        return {
            exitCode: 2,
            stderr: "🛑 BLOCKED: only the user's /edit-governance invocation grants a governance unlock.",
        };
    if (!MAY_WRITE.test(cmd)) return { exitCode: 0 };
    const hits = governedTargets(cmd, input.cwd || process.cwd());
    if (!hits.length || isUnlocked(input.session_id)) return { exitCode: 0 };
    return {
        exitCode: 2,
        stderr: `🛑 BLOCKED: Bash write to governance surface ${hits[0]}. Stop and ask the user to run /edit-governance; it unlocks this session only.`,
    };
}

module.exports = { run };
