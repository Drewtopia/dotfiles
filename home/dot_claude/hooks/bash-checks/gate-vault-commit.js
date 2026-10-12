'use strict';
// Every session shares the vault's primary checkout, so a commit there beside uncommitted
// work it does not name lands on another session's branch. Worktrees hold one stream each.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCommand } = require('../lib/hook-io');
const { git, repoRoot, currentBranch } = require('../lib/git');
const { unquote, splitUnquoted, segments: splitSegments, cdBefore } = require('../lib/shell');

const GIT = /^git((?:\s+-[cC]\s+\S+)*)\s+(add|commit)(?=\s|$)/;
// Commit options that take a value, so the value is not read as a pathspec.
const COMMIT_VALUE = new Set([
    '-m', '-F', '-C', '-c', '-t', '--message', '--file', '--author', '--date', '--template',
    '--reuse-message', '--reedit-message', '--fixup', '--squash', '--trailer', '--cleanup',
]);
const ADD_EVERYTHING = new Set(['-A', '--all', '.', ':/', ':/*']);

const expand = p => p.replace(/^~(?=\/|$)/, os.homedir());
const words = s => splitUnquoted(s, /\s+/g).map(unquote);

/**
 * The commit's directory, the absolute paths the command names for it, and whether an
 * add stages everything; null when `cmd` holds no git commit.
 */
function plan(cmd) {
    const segs = splitSegments(cmd);
    const named = [];
    let all = false;
    let dir = null;
    segs.forEach((seg, i) => {
        const m = seg.match(GIT);
        if (!m) return;
        const dashC = /-C\s+(\S+)/.exec(m[1]);
        const here = path.resolve(expand(unquote(dashC ? dashC[1] : cdBefore(segs, i) || '.')));
        const args = words(seg.slice(m[0].length));
        if (m[2] === 'add') {
            for (const a of args) {
                if (ADD_EVERYTHING.has(a)) all = true;
                else if (!a.startsWith('-')) named.push(path.resolve(here, expand(a)));
            }
            return;
        }
        dir = here;
        for (let j = 0; j < args.length; j++) {
            if (args[j] === '--') {
                args.slice(j + 1).forEach(a => named.push(path.resolve(here, expand(a))));
                break;
            }
            if (COMMIT_VALUE.has(args[j])) j++;
            else if (!args[j].startsWith('-')) named.push(path.resolve(here, expand(args[j])));
        }
    });
    return dir === null ? null : { dir, named, all };
}

function realVault() {
    try {
        return fs.realpathSync(path.join(os.homedir(), '.claude-vault'));
    } catch {
        return '';
    }
}

/** Unstaged or untracked paths (repo-relative) from `git status --porcelain=v1`. */
function unstaged(porcelain) {
    return porcelain
        .split('\n')
        .filter(l => l[0] === ' ' || l[0] === '?')
        .map(l => l.slice(3).replace(/^.* -> /, '').replace(/^"(.*)"$/, '$1'));
}

function run(input, deps = {}) {
    const cmd = getCommand(input);
    const p = cmd && plan(cmd);
    if (!p || p.all) return { exitCode: 0 };

    const root = (deps.repoRoot || repoRoot)(p.dir);
    const vault = deps.vaultRoot ?? realVault();
    if (!root || !vault || path.resolve(root) !== vault) return { exitCode: 0 };

    const status = (deps.status || (r => git(['-C', r, 'status', '--porcelain=v1', '--untracked-files=all'])))(root);
    const covered = f => p.named.some(n => {
        const rel = path.relative(root, n);
        return rel === '' || f === rel || f.startsWith(`${rel}/`);
    });
    const outside = unstaged(status).filter(f => !covered(f));
    if (outside.length === 0) return { exitCode: 0 };

    const branch = (deps.currentBranch || currentBranch)(root) || 'unknown';
    const shown = outside.slice(0, 5).map(f => `  ${f}`);
    if (outside.length > 5) shown.push(`  … and ${outside.length - 5} more`);
    return {
        exitCode: 2,
        stderr: [
            `🛑 BLOCKED: the vault checkout holds uncommitted work this commit does not name:`,
            ...shown,
            `That is probably another session's stream; the commit would land on its branch '${branch}'.`,
            'Commit from your own vault worktree:',
            '  wt -C ~/.claude-vault switch --create <type>/<slug> --no-cd',
            "If this is your own stream's partial commit, run it yourself with the ! prefix.",
        ].join('\n'),
    };
}

module.exports = { run, plan, unstaged };
