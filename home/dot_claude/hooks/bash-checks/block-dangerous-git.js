'use strict';

const os = require('node:os');
const { getCommand } = require('../lib/hook-io');
const { currentBranch } = require('../lib/git');
const { WRAPPER, unquote, segments, cdBefore } = require('../lib/shell');

const PROTECTED = 'main|master|develop';
const GIT = /(?:^|[\s'"(`])git((?:\s+(?:-[cC]\s+\S+|--\S+))*)\s+([\s\S]*)$/;
const block = reason => ({
    exitCode: 2,
    stderr: `🛑 BLOCKED: ${reason} The user has prevented you from doing this.`,
});

const ASSIGN = /^([A-Za-z_]\w*)=(\S+)$/;

// The hook reads the command before the shell expands it: variables assigned earlier
// in the command, the environment's, and `~` are expanded here; a directory still
// naming a variable resolves to '' (the session's own).
function resolveDir(dir, vars = {}) {
    const expanded = dir
        .replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, name) => vars[name] ?? process.env[name] ?? m)
        .replace(/^~(?=\/|$)/, os.homedir());
    return /[$`]/.test(expanded) ? '' : expanded;
}

/** `NAME=value` assignments in the segments before `index`, their own values expanded. */
function assignedBefore(segs, index) {
    const vars = {};
    for (const seg of segs.slice(0, index)) {
        const m = seg.match(ASSIGN);
        if (m) vars[m[1]] = resolveDir(unquote(m[2]), vars) || unquote(m[2]);
    }
    return vars;
}

/**
 * Each git invocation in `cmd`, as its own text and the directory it runs in, so
 * a flag or branch named by another command in the line is not read as its own.
 */
function gitCalls(cmd, outerCwd = '') {
    const segs = segments(cmd);
    return segs.flatMap((seg, i) => {
        const vars = assignedBefore(segs, i);
        const cwd = resolveDir(cdBefore(segs, i), vars) || outerCwd;
        const wrapped = seg.match(WRAPPER);
        if (wrapped) return gitCalls(unquote(wrapped[1]), cwd);
        const m = seg.match(GIT);
        if (!m) return [];
        const dashC = m[1].match(/-C\s+(\S+)/);
        const tail = m[2].replace(/['"`()]/g, '').trim();
        const [sub = '', ...rest] = tail.split(/\s+/);
        return [
            {
                sub,
                args: rest.join(' '),
                text: `git ${tail}`,
                cwd: dashC ? resolveDir(unquote(dashC[1]), vars) : cwd,
            },
        ];
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

function checkCall({ sub, text }) {
    if (sub === 'reset' && /\s--hard(\s|$)/.test(text)) return `git reset --hard in '${text}'.`;
    if (sub === 'clean' && /\s-[a-zA-Z]*f/.test(text)) return `git clean -f in '${text}'.`;
    if (/^git\s+(checkout|restore)\s+\.(\s|$)/.test(text)) {
        return `bulk working-tree discard in '${text}'.`;
    }
    if (sub === 'branch' && /\s-D(\s|$)/.test(text)) {
        return `git branch -D (force delete) in '${text}'. Use 'wt remove <branch>': it deletes a branch whose changes are merged, even under new SHAs, and runs the worktree hooks.`;
    }
    if (sub === 'branch' && /(--delete\s+--force|--force\s+--delete)/.test(text)) {
        return `force branch delete in '${text}'.`;
    }
    if (sub === 'worktree' && /\sworktree\s+add(\s|$)/.test(text)) {
        return `raw worktree create in '${text}'. Use 'wt switch --create <branch>': it runs the worktree hooks (deps, gitignored env files, mise trust).`;
    }
    if (sub === 'worktree' && /\sworktree\s+remove\b.*\s(--force|-f)(\s|$)/.test(text)) {
        return `forced worktree removal in '${text}'. Use 'wt remove <branch>'.`;
    }
    return null;
}

function run(input, deps = {}) {
    const branchOf = deps.currentBranch || currentBranch;
    const cmd = getCommand(input);
    if (!cmd.includes('git')) return { exitCode: 0 };

    for (const call of gitCalls(cmd)) {
        const reason = call.sub === 'push' ? checkPush(call, branchOf) : checkCall(call);
        if (reason) return block(reason);
    }
    return { exitCode: 0 };
}

module.exports = { run, gitCalls };
