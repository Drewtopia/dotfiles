#!/usr/bin/env node
'use strict';
// CwdChanged: warn on entering a repo's MAIN checkout while it is on a ticket branch.

const path = require('node:path');
const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'cwd:changed:worktree-check';
const INTEGRATION = new Set(['main', 'master', 'develop']);

function warningFor(s) {
    if (!s || !s.branch) return '';
    if (!s.isMainCheckout) return '';
    if (INTEGRATION.has(s.branch)) return '';
    return [
        `In the MAIN checkout on branch '${s.branch}' (a non-integration branch).`,
        '',
        'Ticket work belongs in its own worktree, not the main checkout —',
        'concurrent sessions can move refs under you and edits can land on the',
        'wrong branch. Confirm this is intentional before editing here.',
    ].join('\n');
}

// A linked worktree's git-dir is <common>/worktrees/<name>; in the main checkout
// git-dir and common dir are the same path.
function collectState() {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch || branch === 'HEAD') {
        return { branch: '', isMainCheckout: false };
    }
    const gitDir = git(['rev-parse', '--absolute-git-dir']);
    let commonDir = git(['rev-parse', '--git-common-dir']);
    if (commonDir) commonDir = path.resolve(commonDir);
    const isMainCheckout = !!gitDir && gitDir === commonDir;
    return { branch, isMainCheckout };
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) {
        process.stdout.write(raw);
        process.exit(0);
    }
    const msg = warningFor(collectState());
    if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
    else process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module) main();

module.exports = { warningFor, collectState, HOOK_ID };
