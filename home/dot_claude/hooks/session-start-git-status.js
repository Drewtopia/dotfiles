#!/usr/bin/env node
'use strict';
// SessionStart: git workflow warnings and the streams in flight on stdout, which joins session context.

const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'session:start:git-status';
const DEFAULTS = { branchAge: 3, ahead: 20, worktreeAge: 7 };
const PROTECTED = new Set(['main', 'develop', 'master']);

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
    if (s.behind > 0 && s.upstream) {
        w.push(
            `Branch is ${s.behind} commit(s) behind ${s.upstream}: until you pull, read code state from ${s.upstream} (git show ${s.upstream}:<path>, git grep <pattern> ${s.upstream}), not the working tree.`,
        );
    } else if (s.behind > 0) {
        w.push(`Branch is ${s.behind} commit(s) behind upstream.`);
    }
    return w;
}

// One line per linked worktree: the Orca card's status and next step when there is a card,
// else the last commit subject. `merged` means the default branch already holds it.
function buildStreams(streams, t = DEFAULTS) {
    return streams.map(s => {
        const status = s.merged ? 'merged' : s.cardStatus || 'no card';
        const what = s.cardComment || s.lastSubject || '';
        const dirty = s.dirty > 0 ? ` · ${s.dirty} uncommitted` : '';
        const age = s.ageDays > t.worktreeAge ? ` · stale ${s.ageDays}d` : '';
        return `${s.branch} — ${status} — ${what}${dirty}${age}`;
    });
}

const intOr = (raw, fallback = 0) => {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
};

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
    const upstream = git(['rev-parse', '--abbrev-ref', '@{u}']);
    if (upstream) {
        behind = intOr(git(['rev-list', '--count', 'HEAD..@{u}']), 0);
    }

    return {
        branch,
        integ,
        branchAgeDays,
        commitsAhead,
        dirtyCount,
        behind,
        upstream,
    };
}

function collectStreams(nowSec, integ) {
    const cards = orcaCards();
    const porcelain = git(['worktree', 'list', '--porcelain']).split('\n');
    const primary = porcelain[0].replace(/^worktree /, '');
    const streams = [];
    let path = null;
    for (const line of porcelain) {
        const w = /^worktree (.+)$/.exec(line);
        if (w) path = w[1];
        const b = /^branch refs\/heads\/(.+)$/.exec(line);
        if (!b || !path || path === primary) continue;
        const [ts, subject] = gitIn(path, ['log', '-1', '--pretty=format:%ct%x09%s']).split('\t');
        const dirty = gitIn(path, ['status', '--porcelain']).split('\n').filter(Boolean).length;
        const card = cards.get(path) || {};
        streams.push({
            branch: b[1],
            ts: intOr(ts, 0),
            ageDays: Math.floor((nowSec - intOr(ts, nowSec)) / 86400),
            lastSubject: subject || '',
            dirty,
            // A branch cut from the integration tip, or holding only uncommitted work, is an ancestor too.
            merged:
                Boolean(integ) &&
                dirty === 0 &&
                git(['rev-parse', b[1]]) !== git(['rev-parse', integ]) &&
                gitOk(['merge-base', '--is-ancestor', b[1], integ]),
            cardStatus: card.workspaceStatus || '',
            cardComment: card.comment || '',
        });
    }
    return streams.sort((a, b) => b.ts - a.ts);
}

// Orca cards by worktree path; empty outside an Orca terminal, where bare `orca` is the GNOME screen reader.
function orcaCards() {
    const cards = new Map();
    if (!process.env.ORCA_WORKTREE_ID) return cards;
    try {
        const out = execFileSync(process.env.ORCA_CLI_COMMAND || 'orca', ['worktree', 'list', '--json'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 10000,
        });
        for (const w of JSON.parse(out).result?.worktrees ?? []) cards.set(w.path, w);
    } catch {
        // No cards: each stream falls back to its last commit subject.
    }
    return cards;
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
function gitOk(args) {
    try {
        execFileSync('git', args, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function run(nowSec) {
    if (!git(['rev-parse', '--git-dir'])) return { exitCode: 0, output: '' };
    const state = collectState(nowSec);
    const warnings = buildWarnings(state);
    const streams = buildStreams(collectStreams(nowSec, state.integ));
    let output = '';
    if (warnings.length)
        output += 'Git workflow check:\n' + warnings.map(w => `  - ${w}`).join('\n') + '\n';
    if (streams.length)
        output += 'Streams in flight:\n' + streams.map(s => `  - ${s}`).join('\n') + '\n';
    return { exitCode: 0, output };
}

async function main() {
    const raw = await readStdin();
    if (isHookEnabled(HOOK_ID)) {
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
    buildStreams,
    collectState,
    findIntegration,
    run,
    DEFAULTS,
    PROTECTED,
};
