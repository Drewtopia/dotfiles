'use strict';
/**
 * PreToolUse(Bash) check: block `git commit` while HEAD is on a protected
 * (integration) branch. Stops agents committing straight to develop/main
 * instead of cutting a feature branch.
 *
 * Allows `-c key=val` flags between git and commit (matches the harness
 * `git -c core.hooksPath=/dev/null commit` injection). A `git -C <path> commit`
 * (different repo) does NOT match and is allowed — the current-cwd branch is
 * the only thing checked, so cross-repo commits are not false-flagged.
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

function run(input, deps = {}) {
    const branchOf = deps.currentBranch || currentBranch;
    const cmd = getCommand(input);
    if (!cmd) return { exitCode: 0 };

    // `git commit`, allowing `-c key=val` repetitions between git and commit.
    if (!/(^|[^a-zA-Z])git( -c [^ ]+)* commit( |$)/.test(cmd))
        return { exitCode: 0 };

    const branch = branchOf();
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

module.exports = { run, PROTECTED };
