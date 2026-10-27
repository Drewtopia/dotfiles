'use strict';

const os = require('node:os');
const { getCommand } = require('../lib/hook-io');
const { git, currentBranch } = require('../lib/git');
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

// Force-pushes, pushes naming a protected branch and the destructive git commands are dcg's
// (core.git and ~/.config/dcg/packs/git-policy.yaml); this guard keeps what needs git state.
function checkPush({ args, cwd }, branchOf) {
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

/** A repo's primary checkout while linked worktrees exist: its branch stays put. */
function isPrimaryOfMany(cwd) {
    const at = cwd ? ['-C', cwd] : [];
    const dir = git([...at, 'rev-parse', '--absolute-git-dir']);
    const common = git([...at, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (!dir || dir !== common) return false;
    return git([...at, 'worktree', 'list', '--porcelain']).split('\n').filter(l => l.startsWith('worktree ')).length > 1;
}

const isRef = (cwd, name) =>
    Boolean(git([...(cwd ? ['-C', cwd] : []), 'rev-parse', '--verify', '--quiet', `${name}^{commit}`]));

/** Whether a git call moves the checked-out branch or a branch pointer. */
function movesBranch({ sub, args, cwd }, deps) {
    const toks = args.split(/\s+/).filter(Boolean);
    const beforePaths = toks.slice(0, toks.includes('--') ? toks.indexOf('--') : undefined);
    const positional = beforePaths.filter(t => !t.startsWith('-'));
    if (sub === 'switch') return !toks.includes('--help');
    if (sub === 'checkout') {
        if (beforePaths.some(t => /^(-b|-B|--orphan)$/.test(t))) return true;
        return !toks.includes('--') && positional.length === 1 && deps.isRef(cwd, positional[0]);
    }
    return (
        sub === 'branch' &&
        toks.some(t => /^(-f|--force|-B)$/.test(t)) &&
        !toks.some(t => /^(-d|-D|--delete)$/.test(t))
    );
}

function run(input, deps = {}) {
    const branchOf = deps.currentBranch || currentBranch;
    const primary = deps.isPrimaryOfMany || isPrimaryOfMany;
    const refCheck = { isRef: deps.isRef || isRef };
    const cmd = getCommand(input);
    if (!cmd.includes('git')) return { exitCode: 0 };

    for (const call of gitCalls(cmd)) {
        const reason = call.sub === 'push' ? checkPush(call, branchOf) : null;
        if (reason) return block(reason);
        if (movesBranch(call, refCheck) && primary(call.cwd)) {
            return block(
                `'${call.text}' would move the branch of a primary checkout that has worktrees. Open the branch in its own worktree: 'wt switch --create <branch> --no-cd', then 'orca agent launch --agent claude --worktree branch:<branch>' (stash first to carry uncommitted work).`,
            );
        }
    }
    return { exitCode: 0 };
}

module.exports = { run, gitCalls };
