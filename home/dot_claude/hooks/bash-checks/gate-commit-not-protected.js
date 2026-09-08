'use strict';
/**
 * PreToolUse(Bash) check: block `git commit` while HEAD is on a protected
 * (integration) branch. Stops agents committing straight to develop/main
 * instead of cutting a feature branch.
 *
 * Only a command segment that *starts* with git counts, so a commit named
 * inside an argument (`echo "run git commit later"`, a test fixture, a message
 * body) is text, not an invocation. Wrappers that execute their argument
 * (`bash -c`, `eval`, `xargs`) are unwrapped and rescanned, so hiding a commit
 * one level in does not evade the gate.
 *
 * Allows `-c key=val` flags between git and commit (matches the harness
 * `git -c core.hooksPath=/dev/null commit` injection). A `git -C <path> commit`
 * (different repo) is allowed — the caller named another repo explicitly.
 * A preceding `cd <path>` in the same command resolves the branch there, since
 * that, not the hook's own working directory, is where the commit lands.
 *
 * Defers (allows) when the branch can't be resolved — detached HEAD or non-repo
 * — better to allow than to wedge a commit.
 *
 * run(input, deps?) -> { exitCode: 0 } | { exitCode: 2, stderr }
 * deps.currentBranch lets tests inject a branch without a live repo.
 */

const { getCommand } = require('../lib/hook-io');
const { currentBranch } = require('../lib/git');

const PROTECTED = /^(main|master|develop)$/;
const SEGMENT = /(?:&&|\|\||;|\||\n)/;
const GIT_COMMIT = /^git((?: -[cC] [^ ]+)*) commit(?: |$)/;
const CD = /^cd\s+(?:--\s+)?(['"]?)([^'"]+)\1\s*$/;
// Wrappers that run their argument as a command, so a commit hides one level in.
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
            '  git switch -c <type>/<slug>   # e.g. fix/null-deref',
            '',
            `If committing on '${branch}' is truly intentional, run it yourself`,
            'with the ! prefix (runs in your session, bypassing this guard):',
            '  ! git commit ...',
        ].join('\n'),
    };
}

module.exports = { run, PROTECTED, commitTarget };
