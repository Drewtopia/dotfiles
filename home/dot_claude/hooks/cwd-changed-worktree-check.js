#!/usr/bin/env node
'use strict';
/**
 * CwdChanged: advisory when the working dir moves into the MAIN checkout of a
 * repo while HEAD is a non-integration (ticket) branch. Concurrent sessions
 * each own a worktree; landing edits in the main checkout on a ticket branch is
 * the branch-contamination footgun the confirm-worktree convention warns about.
 *
 * Non-blocking (CwdChanged cannot block): stdout {"systemMessage": ...}, exit 0.
 * Worst case is a spurious or missing note — it never halts anything.
 * Toggle: HOOKS_DISABLED=cwd:changed:worktree-check
 */

const path = require('node:path');
const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'cwd:changed:worktree-check';
const INTEGRATION = new Set(['main', 'master', 'develop']);

/**
 * Pure: warning text when in the main checkout on a ticket branch, else ''.
 * @param {{branch:string, isMainCheckout:boolean}} s
 */
function warningFor(s) {
    if (!s || !s.branch) return '';
    if (!s.isMainCheckout) return ''; // in a linked worktree -> fine
    if (INTEGRATION.has(s.branch)) return ''; // on an integration branch -> fine
    return [
        `In the MAIN checkout on branch '${s.branch}' (a non-integration branch).`,
        '',
        'Ticket work belongs in its own worktree, not the main checkout —',
        'concurrent sessions can move refs under you and edits can land on the',
        'wrong branch. Confirm this is intentional before editing here.',
    ].join('\n');
}

/**
 * Best-effort repo state from the hook's cwd. A linked worktree's git-dir is
 * <common>/worktrees/<name>, so it differs from the resolved common dir; in the
 * main checkout the two are the same path.
 */
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
