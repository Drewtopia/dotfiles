'use strict';
/**
 * PreToolUse(Bash) check: block destructive git commands.
 * Port of block-dangerous-git.sh.
 *
 * Blocks: force-push (any branch), reset --hard, clean -f, bulk checkout/restore
 * ".", branch -D / --delete --force, push to a protected branch (explicit
 * refspec OR bare push while on a protected branch).
 *
 * run(input) -> { exitCode: 0 } | { exitCode: 2, stderr }
 */

const { getCommand } = require('../lib/hook-io');
const { currentBranch } = require('../lib/git');

const PROTECTED = 'main|master|develop';
const block = reason => ({
    exitCode: 2,
    stderr: `🛑 BLOCKED: ${reason} The user has prevented you from doing this.`,
});

function run(input) {
    const cmd = getCommand(input);
    if (!cmd) return { exitCode: 0 };

    const isPush = /git\s+push/.test(cmd);

    // Force-push (any branch)
    if (
        isPush &&
        /push.*(--force([^-]|$)|--force-with-lease|\s-f(\s|$))/.test(cmd)
    ) {
        return block(`force-push detected in '${cmd}'.`);
    }

    // Destructive working-tree / history operations
    if (/git\s+reset(\s+.*)?\s+--hard/.test(cmd))
        return block(`git reset --hard in '${cmd}'.`);
    if (/git\s+clean(\s+.*)?\s+-[a-zA-Z]*f/.test(cmd))
        return block(`git clean -f in '${cmd}'.`);
    if (/git\s+(checkout|restore)\s+\.(\s|$)/.test(cmd)) {
        return block(`bulk working-tree discard in '${cmd}'.`);
    }

    // Force-delete branch
    if (/git\s+branch(\s+.*)?\s-D(\s|$)/.test(cmd)) {
        return block(`git branch -D (force delete) in '${cmd}'.`);
    }
    if (/git\s+branch.*(--delete\s+--force|--force\s+--delete)/.test(cmd)) {
        return block(`force branch delete in '${cmd}'.`);
    }

    // Push to a protected branch
    if (isPush) {
        // Explicit refspec containing a protected name: ' main', 'HEAD:main', etc.
        if (new RegExp(`([\\s:/])(${PROTECTED})(\\s|$)`).test(cmd)) {
            return block(
                `push targets a protected branch (${PROTECTED}) in '${cmd}'.`,
            );
        }
        // Bare push (no explicit refspec) pushes the CURRENT branch.
        const m = cmd.match(/git(?: -c [^ ]+)* push\s*(.*)/);
        const pushTail = m ? m[1] : '';
        const tokens = pushTail
            .split(/\s+/)
            .filter(t => t && !t.startsWith('-'));
        const refspec = tokens.slice(1); // drop the remote (first token)
        if (refspec.length === 0) {
            const branch = currentBranch();
            if (branch && new RegExp(`^(${PROTECTED})$`).test(branch)) {
                return block(
                    `bare push would push protected branch '${branch}'; push a feature branch explicitly ('${cmd}').`,
                );
            }
        }
    }

    return { exitCode: 0 };
}

module.exports = { run };
