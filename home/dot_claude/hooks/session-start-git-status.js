#!/usr/bin/env node
'use strict';
/**
 * SessionStart: git workflow warnings (non-blocking; printed to stdout, which
 * Claude Code appends to session context).
 * Faithful port of session-start-git-status.sh — branch age, commits-ahead,
 * dirty tree, behind-upstream, stale worktrees. Always exits 0.
 *
 * Toggle: HOOKS_DISABLED=session:start:git-status
 */

const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'session:start:git-status';
const DEFAULTS = { branchAge: 3, ahead: 20, worktreeAge: 7 };
const PROTECTED = new Set(['main', 'develop', 'master']);

/**
 * Pure: assemble warning lines from collected repo state.
 * @param {{branch:string, integ:string, branchAgeDays:(number|null),
 *   commitsAhead:(number|null), dirtyCount:number, behind:number,
 *   staleWorktrees:string[]}} s
 */
function buildWarnings(s, t = DEFAULTS) {
    const w = [];
    if (s.integ && !PROTECTED.has(s.branch)) {
        if (s.branchAgeDays != null && s.branchAgeDays > t.branchAge) {
            w.push(
                `Branch '${s.branch}' is ${s.branchAgeDays}d old (>${t.branchAge}d). Consider merging or splitting.`,
            );
        }
        if (s.commitsAhead != null && s.commitsAhead > t.ahead) {
            w.push(
                `Branch '${s.branch}' is ${s.commitsAhead} commits ahead of ${s.integ} (>${t.ahead}).`,
            );
        }
    }
    if (s.dirtyCount > 0)
        w.push(`Working tree has ${s.dirtyCount} uncommitted change(s).`);
    if (s.behind > 0)
        w.push(`Branch is ${s.behind} commit(s) behind upstream.`);
    if (s.staleWorktrees && s.staleWorktrees.length) {
        w.push(
            `Stale worktrees (>${t.worktreeAge}d): ${s.staleWorktrees.join(' ')}`,
        );
    }
    return w;
}

const intOr = (raw, fallback = 0) => {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
};

/** First existing integration branch, or '' if none. */
function findIntegration() {
    for (const b of ['develop', 'main', 'master']) {
        if (git(['rev-parse', '--verify', b])) return b;
    }
    return '';
}

function collectState(nowSec, t = DEFAULTS) {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const integ = findIntegration();

    let branchAgeDays = null;
    let commitsAhead = null;
    if (integ && !PROTECTED.has(branch)) {
        const first = git([
            'log',
            '--reverse',
            '--pretty=format:%H',
            `${integ}..HEAD`,
        ]).split('\n')[0];
        if (first) {
            const firstTs = intOr(
                git(['log', '-1', '--pretty=format:%ct', first]),
                0,
            );
            if (firstTs) branchAgeDays = Math.floor((nowSec - firstTs) / 86400);
        }
        commitsAhead = intOr(git(['rev-list', '--count', `${integ}..HEAD`]), 0);
    }

    const dirtyCount = git(['status', '--porcelain'])
        .split('\n')
        .filter(Boolean).length;

    let behind = 0;
    if (git(['rev-parse', '--abbrev-ref', '@{u}'])) {
        behind = intOr(git(['rev-list', '--count', 'HEAD..@{u}']), 0);
    }

    const staleWorktrees = [];
    const mainTop = git(['rev-parse', '--show-toplevel']);
    const porcelain = git(['worktree', 'list', '--porcelain']).split('\n');
    for (const line of porcelain) {
        const m = /^worktree (.+)$/.exec(line);
        if (!m) continue;
        const wt = m[1];
        if (wt === mainTop) continue;
        const lastTs = intOr(
            gitIn(wt, ['log', '-1', '--pretty=format:%ct']),
            0,
        );
        if (!lastTs) continue;
        const ageDays = Math.floor((nowSec - lastTs) / 86400);
        if (ageDays > t.worktreeAge) staleWorktrees.push(`${wt} (${ageDays}d)`);
    }

    return {
        branch,
        integ,
        branchAgeDays,
        commitsAhead,
        dirtyCount,
        behind,
        staleWorktrees,
    };
}

const { execFileSync } = require('node:child_process');
function gitIn(cwd, args) {
    try {
        return execFileSync('git', ['-C', cwd, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return '';
    }
}

function run(nowSec) {
    if (!git(['rev-parse', '--git-dir'])) return { exitCode: 0, output: '' };
    const warnings = buildWarnings(collectState(nowSec));
    if (!warnings.length) return { exitCode: 0, output: '' };
    const output =
        'Git workflow check:\n' +
        warnings.map(w => `  - ${w}`).join('\n') +
        '\n';
    return { exitCode: 0, output };
}

async function main() {
    const raw = await readStdin();
    if (
        isHookEnabled(HOOK_ID, { profiles: ['minimal', 'standard', 'strict'] })
    ) {
        try {
            const { output } = run(Math.floor(Date.now() / 1000));
            if (output) process.stdout.write(output);
            else process.stdout.write(raw);
        } catch {
            process.stdout.write(raw);
        }
    } else {
        process.stdout.write(raw);
    }
    process.exit(0);
}

if (require.main === module) main();

module.exports = {
    buildWarnings,
    collectState,
    findIntegration,
    run,
    DEFAULTS,
    PROTECTED,
};
