'use strict';
/**
 * PreToolUse(Bash) check: gate `git push` on conventional-commit branch naming.
 * Port of gate-git-push-convention.sh.
 *
 * Defers (allows) on force-push and protected-branch push — those are handled
 * by block-dangerous-git. Otherwise the pushed branch must match
 *   <prefix>(<scope>)?!?/<slug>
 * else block with a rename suggestion.
 *
 * run(input) -> { exitCode: 0 } | { exitCode: 2, stderr }
 */

const { getCommand } = require('../lib/hook-io');
const { currentBranch, repoRoot } = require('../lib/git');

const PROTECTED = 'main|master|develop';
const CONV =
    '(feat|fix|chore|refactor|docs|test|perf|ci|build|style|revert)(\\([a-z0-9_-]+\\))?!?/[A-Za-z0-9._/-]+';

function run(input) {
    const cmd = getCommand(input);
    if (!cmd) return { exitCode: 0 };

    // Only act on `git push` (allowing `-c key=val` between git and push).
    if (!/(^|[^a-zA-Z])git( -c [^ ]+)* push( |$)/.test(cmd))
        return { exitCode: 0 };

    // Defer to stricter hooks for force-push and protected-branch push.
    if (/push.*(--force([^-]|$)|--force-with-lease|\s-f(\s|$))/.test(cmd))
        return { exitCode: 0 };
    if (new RegExp(`([\\s:/])(${PROTECTED})(\\s|$)`).test(cmd))
        return { exitCode: 0 };

    const branch = currentBranch();
    if (branch && new RegExp(`^(${PROTECTED})$`).test(branch))
        return { exitCode: 0 };

    // Everything after `push` — bare vs argful.
    const m = cmd.match(/git(?: -c [^ ]+)* push\s*(.*)/);
    const pushTail = (m ? m[1] : '').replace(/\s*"$/, '');

    if (pushTail === '') {
        if (branch && new RegExp(`^${CONV}$`).test(branch))
            return { exitCode: 0 };
    } else if (new RegExp(`(^|[\\s:/])${CONV}(\\s|$)`).test(pushTail)) {
        return { exitCode: 0 };
    }

    // Non-conventional → block with rename suggestion.
    const worktree = repoRoot() || '<unknown>';
    const pushArgs = (cmd.match(/git(?: -c [^ ]+)* push (.*)/) || [, ''])[1];
    const b = branch || '<unknown>';

    return {
        exitCode: 2,
        stderr: [
            `⚠️  Branch "${b}" does not match conventional-commit naming.`,
            '',
            'Expected shape: <prefix>(<scope>)?!?/<slug>',
            '  prefixes: feat fix chore refactor docs test perf ci build style revert',
            '  examples: chore/oxlint-fix',
            '            feat(auth)/login-flow',
            '            fix(api)/null-deref',
            '            feat!/breaking-change',
            '',
            'Either:',
            '  • Rename the branch:',
            '      git branch -m <new-conventional-name>',
            '  • Or push yourself with the ! prefix (the ! runs it in your session):',
            `      ! cd "${worktree}"; git push ${pushArgs}`,
            '',
            `Branch:   ${b}`,
            `Worktree: ${worktree}`,
        ].join('\n'),
    };
}

module.exports = { run };
