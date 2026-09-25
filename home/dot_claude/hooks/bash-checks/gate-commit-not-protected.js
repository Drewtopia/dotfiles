'use strict';
// Only a segment that starts with git counts, so a commit named inside an argument
// is text. `git -C <path> commit` names another repo explicitly and is allowed;
// an unresolvable branch allows rather than wedging the commit.

const { getCommand } = require('../lib/hook-io');
const { currentBranch } = require('../lib/git');

const PROTECTED = /^(main|master|develop)$/;
const SEGMENT = /(?:&&|\|\||;|\||\n)/;
const GIT_COMMIT = /^git((?: -[cC] [^ ]+)*) commit(?: |$)/;
const CD = /^cd\s+(?:--\s+)?(['"]?)([^'"]+)\1\s*$/;
const WRAPPER = /^(?:eval|xargs(?:\s+-\S+)*|(?:ba|z)?sh\s+-c)\s+([\s\S]+)$/;

const unquote = s => s.replace(/^(['"])([\s\S]*)\1$/, '$2');

/** Nearest `cd` before `index`, whose path is where later segments run. */
function cdBefore(segments, index) {
    for (let j = index - 1; j >= 0; j--) {
        const cd = segments[j].match(CD);
        if (cd) return cd[2];
    }
    return '';
}

/**
 * Where a `git commit` invocation in `cmd` would run, or null when `cmd` holds
 * no such invocation. '' means the hook's own working directory.
 */
function commitTarget(cmd) {
    const segments = cmd.split(SEGMENT).map(s => s.trim());
    for (let i = 0; i < segments.length; i++) {
        const flags = segments[i].match(GIT_COMMIT);
        if (flags) {
            if (/ -C /.test(flags[1])) return null;
            return cdBefore(segments, i);
        }
        const wrapped = segments[i].match(WRAPPER);
        if (wrapped) {
            const inner = commitTarget(unquote(wrapped[1]));
            if (inner !== null) return inner || cdBefore(segments, i);
        }
    }
    return null;
}

function run(input, deps = {}) {
    const branchOf = deps.currentBranch || currentBranch;
    const cmd = getCommand(input);
    if (!cmd) return { exitCode: 0 };

    const target = commitTarget(cmd);
    if (target === null) return { exitCode: 0 };

    const branch = branchOf(target);
    if (!branch || !PROTECTED.test(branch)) return { exitCode: 0 };

    return {
        exitCode: 2,
        stderr: [
            `🛑 BLOCKED: commit on protected branch '${branch}'.`,
            '',
            'Cut a feature branch first, then commit there:',
            '  git switch -c <type>/<slug>        # carries the staged changes',
            '  wt switch --create <type>/<slug>   # new work',
            '',
            `If committing on '${branch}' is truly intentional, run it yourself`,
            'with the ! prefix (runs in your session, bypassing this guard):',
            '  ! git commit ...',
        ].join('\n'),
    };
}

module.exports = { run, PROTECTED, commitTarget };
