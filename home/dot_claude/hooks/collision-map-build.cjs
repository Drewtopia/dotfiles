#!/usr/bin/env node
/**
 * SessionStart hook — build a file→branch collision map for the current repo.
 *
 * For every git worktree, record which files it changes (committed vs the
 * default branch + uncommitted), so the PreToolUse warner can tell you when a
 * file you're about to edit is ALSO being changed elsewhere. Snapshot at session
 * start — best-effort, silent on any error, never blocks anything.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BRANCHES = ['develop', 'main', 'master'];

function git(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
}

function main() {
    const cwd = process.cwd();
    let commonDir;
    try {
        commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).trim();
    } catch {
        return; // not a git repo — no-op
    }

    // Pick a base branch that exists.
    let base;
    for (const b of DEFAULT_BRANCHES) {
        try {
            git(['rev-parse', '--verify', '--quiet', b], cwd);
            base = b;
            break;
        } catch {
            /* try next */
        }
    }

    // Parse `git worktree list --porcelain` into {path, branch} entries.
    let porcelain = '';
    try {
        porcelain = git(['worktree', 'list', '--porcelain'], cwd);
    } catch {
        return;
    }
    const worktrees = [];
    let cur = {};
    for (const line of porcelain.split('\n')) {
        if (line.startsWith('worktree ')) cur = { path: line.slice(9) };
        else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
        else if (line === '') {
            if (cur.path) worktrees.push(cur);
            cur = {};
        }
    }
    if (cur.path) worktrees.push(cur);

    // path → Set("branch\tworktreeName")
    const map = new Map();
    const add = (file, branch, wtName) => {
        const f = file.trim();
        if (!f) return;
        if (!map.has(f)) map.set(f, new Set());
        map.get(f).add(`${branch}\t${wtName}`);
    };

    for (const wt of worktrees) {
        const branch = wt.branch || '(detached)';
        const wtName = path.basename(wt.path);
        // Committed changes vs base (merge-base ... branch).
        if (base && wt.branch && wt.branch !== base) {
            try {
                for (const f of git(['diff', '--name-only', `${base}...HEAD`], wt.path).split('\n'))
                    add(f, branch, wtName);
            } catch {
                /* ignore */
            }
        }
        // Uncommitted (working tree) changes.
        try {
            for (const line of git(['status', '--porcelain', '--no-renames'], wt.path).split(
                '\n',
            )) {
                const f = line.slice(3); // strip XY status + space
                add(f, branch, wtName);
            }
        } catch {
            /* ignore */
        }
    }

    const lines = [];
    for (const [file, set] of map) for (const bw of set) lines.push(`${file}\t${bw}`);
    try {
        fs.writeFileSync(path.join(commonDir, 'collision-map.tsv'), lines.join('\n') + '\n');
    } catch {
        /* ignore */
    }
}

try {
    main();
} catch {
    /* fail open */
}
process.exit(0);
