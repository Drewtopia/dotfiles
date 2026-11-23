'use strict';

const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getCommand } = require('../lib/hook-io');
const { git, currentBranch } = require('../lib/git');
const { WRAPPER, unquote, mask, segments, cdBefore } = require('../lib/shell');

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

/** `s` with quoted text masked, each `$(...)` or backtick span masked on its own so a quote around it does not hide it. */
function maskKeepingSubst(s) {
    let out = mask(s);
    for (const m of s.matchAll(/\$\([^)]*\)|`[^`]*`/g))
        out = out.slice(0, m.index) + mask(m[0]) + out.slice(m.index + m[0].length);
    return out;
}

const TEXT_READERS = new Set(['atuin', 'grep', 'rg', 'ag', 'echo', 'printf', 'jq']);
const LEAD = /^(?:until|while|if|then|do|else|!|\{|[A-Za-z_]\w*=\S*)$/;

/** The program whose arguments hold position `at` in `seg`: the first word of its command. */
function programBefore(seg, at) {
    const head = seg.slice(0, at);
    const start = Math.max(head.lastIndexOf('$('), head.lastIndexOf('`'), head.lastIndexOf('(')) + 1;
    const words = head.slice(start).replace(/^\(/, '').trim().split(/\s+/);
    return path.basename(words.find(w => !LEAD.test(w)) || '');
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
        // Quoted git is inert only as text handed to a reader (a search term); a `$(...)`
        // around it, or any other program, may run it.
        const real = maskKeepingSubst(seg).search(GIT);
        const at = real >= 0 ? real : seg.search(GIT);
        if (at < 0 || (real < 0 && TEXT_READERS.has(programBefore(seg, at)))) return [];
        const m = seg.slice(at).match(GIT);
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

/**
 * Whether `branch` has a pull request, by `gh pr view`. Anything but gh's own "no pull
 * requests found" (no gh, no network, a timeout) counts as having one, so the lease blocks.
 */
function hasPr(cwd, branch) {
    const res = spawnSync('gh', ['pr', 'view', branch, '--json', 'number'], {
        cwd: cwd || undefined,
        encoding: 'utf8',
        timeout: 5000,
    });
    return !(res.status !== 0 && /no pull requests? found/i.test(res.stderr || ''));
}

// A lease push may rewrite only the branch checked out where it runs, before anyone reviews
// it: not a protected branch, and not one with a pull request. Every other case is blocked.
function checkLease({ args, cwd }, refspec, deps) {
    const branch = deps.branchOf(cwd);
    if (!branch || branch === 'HEAD') return 'a --force-with-lease push needs a checked-out branch.';
    if (new RegExp(`^(${PROTECTED})$`).test(branch)) return `--force-with-lease would rewrite protected branch '${branch}'.`;
    const own = r => [branch, 'HEAD', `HEAD:${branch}`, `${branch}:${branch}`].includes(r.replace(/^refs\/heads\//, ''));
    if (!refspec.every(own))
        return `--force-with-lease may rewrite only the checked-out branch '${branch}', not '${refspec.join(' ')}'.`;
    if (deps.hasPr(cwd, branch))
        return `'${branch}' has a pull request (or gh could not tell), so --force-with-lease would rewrite reviewed history. Push a new commit instead, or ask the user to run '! git push ${args}'.`;
    return null;
}

// Plain force-pushes, pushes naming a protected branch and the destructive git commands are
// dcg's (core.git and ~/.config/dcg/packs/git-policy.yaml); this guard keeps what needs git state.
function checkPush({ args, cwd }, deps) {
    const branchOf = deps.branchOf;
    const refspec = args
        .split(/\s+/)
        .filter(t => t && !t.startsWith('-'))
        .slice(1);
    if (/(?:^|\s)--force-with-lease(?:=\S*)?(?=\s|$)/.test(args)) {
        const reason = checkLease({ args, cwd }, refspec, deps);
        if (reason) return reason;
    }
    // Bare push (no explicit refspec) pushes the branch checked out in `cwd`.
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
        const reason = call.sub === 'push' ? checkPush(call, { branchOf, hasPr: deps.hasPr || hasPr }) : null;
        if (reason) return block(reason);
        if (movesBranch(call, refCheck) && primary(call.cwd)) {
            return block(
                `'${call.text}' would move the branch of a primary checkout that has worktrees. Open the branch in its own worktree: 'wt new <branch> --no-cd', then 'orca agent launch --agent claude --worktree branch:<branch>' (stash first to carry uncommitted work).`,
            );
        }
    }
    return { exitCode: 0 };
}

module.exports = { run, gitCalls };
