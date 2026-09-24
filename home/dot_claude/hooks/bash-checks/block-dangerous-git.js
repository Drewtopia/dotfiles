'use strict';

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

    if (
        isPush &&
        /push.*(--force([^-]|$)|--force-with-lease|\s-f(\s|$))/.test(cmd)
    ) {
        return block(`force-push detected in '${cmd}'.`);
    }

    if (/git\s+reset(\s+.*)?\s+--hard/.test(cmd))
        return block(`git reset --hard in '${cmd}'.`);
    if (/git\s+clean(\s+.*)?\s+-[a-zA-Z]*f/.test(cmd))
        return block(`git clean -f in '${cmd}'.`);
    if (/git\s+(checkout|restore)\s+\.(\s|$)/.test(cmd)) {
        return block(`bulk working-tree discard in '${cmd}'.`);
    }

    if (/git\s+branch(\s+.*)?\s-D(\s|$)/.test(cmd)) {
        return block(
            `git branch -D (force delete) in '${cmd}'. Use 'wt remove <branch>': it deletes a branch whose changes are merged, even under new SHAs, and runs the worktree hooks.`,
        );
    }
    if (/git\s+branch.*(--delete\s+--force|--force\s+--delete)/.test(cmd)) {
        return block(`force branch delete in '${cmd}'.`);
    }

    if (isPush) {
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
        const refspec = tokens.slice(1);
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
