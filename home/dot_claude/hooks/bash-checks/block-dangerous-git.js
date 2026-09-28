'use strict';

const { getCommand } = require('../lib/hook-io');
const { currentBranch } = require('../lib/git');
const { WRAPPER, unquote, segments, cdBefore } = require('../lib/shell');

const PROTECTED = 'main|master|develop';
const PUSH = /(?:^|[\s'"(`])git((?:\s+-[cC]\s+\S+)*)\s+push(?:\s+([\s\S]*))?$/;
const block = reason => ({
    exitCode: 2,
    stderr: `🛑 BLOCKED: ${reason} The user has prevented you from doing this.`,
});

/**
 * Each `git push` in `cmd`, with its arguments and the directory it runs in, so
 * a branch named elsewhere in the command is not read as the push target.
 */
function pushes(cmd, outerCwd = '') {
    const segs = segments(cmd);
    return segs.flatMap((seg, i) => {
        const cwd = cdBefore(segs, i) || outerCwd;
        const wrapped = seg.match(WRAPPER);
        if (wrapped) return pushes(unquote(wrapped[1]), cwd);
        const m = seg.match(PUSH);
        if (!m) return [];
        const dashC = m[1].match(/-C\s+(\S+)/);
        const args = (m[2] || '').replace(/['"`()]/g, '');
        return [{ args, cwd: dashC ? unquote(dashC[1]) : cwd }];
    });
}

function checkPush({ args, cwd }, branchOf) {
    if (/(^|\s)(--force(=\S*)?|--force-with-lease\S*|-f)(\s|$)/.test(args)) {
        return `force-push detected in 'git push ${args}'.`;
    }
    if (new RegExp(`(^|[\\s:/])(${PROTECTED})(\\s|$)`).test(args)) {
        return `push targets a protected branch (${PROTECTED}) in 'git push ${args}'.`;
    }
    // Bare push (no explicit refspec) pushes the branch checked out in `cwd`.
    const refspec = args
        .split(/\s+/)
        .filter(t => t && !t.startsWith('-'))
        .slice(1);
    if (refspec.length > 0) return null;
    const branch = branchOf(cwd);
    if (branch && new RegExp(`^(${PROTECTED})$`).test(branch)) {
        return `bare push would push protected branch '${branch}'; push a feature branch explicitly ('git push ${args}').`;
    }
    return null;
}

function run(input, deps = {}) {
    const branchOf = deps.currentBranch || currentBranch;
    const cmd = getCommand(input);
    if (!cmd.includes('git')) return { exitCode: 0 };

    for (const push of pushes(cmd)) {
        const reason = checkPush(push, branchOf);
        if (reason) return block(reason);
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

    if (/\bgit\b[^;&|]*\sworktree\s+add(\s|$)/.test(cmd)) {
        return block(
            `raw worktree create in '${cmd}'. Use 'wt switch --create <branch>': it runs the worktree hooks (deps, gitignored env files, mise trust).`,
        );
    }
    if (/\bgit\b[^;&|]*\sworktree\s+remove\b[^;&|]*\s(--force|-f)(\s|$)/.test(cmd)) {
        return block(`forced worktree removal in '${cmd}'. Use 'wt remove <branch>'.`);
    }

    return { exitCode: 0 };
}

module.exports = { run };
