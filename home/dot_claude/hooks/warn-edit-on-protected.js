#!/usr/bin/env node
'use strict';
/**
 * PreToolUse(Edit|Write|MultiEdit): warn (but allow) when editing files while
 * HEAD is on a protected (integration) branch. Early nudge to cut a feature
 * branch before changes pile up on develop/main — the backstop is the harder
 * commit block (gate-commit-not-protected).
 *
 * Warn-but-allow: stdout {"systemMessage": ...}, exit 0. A typo fix on develop
 * the user explicitly asked for still goes through.
 *
 * Toggle: HOOKS_DISABLED=pre:edit:warn-on-protected
 */

const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { currentBranch } = require('./lib/git');

const HOOK_ID = 'pre:edit:warn-on-protected';
const PROTECTED = /^(main|master|develop)$/;

/** Pure: the warning message for a branch, or '' if no warning is warranted. */
function warningFor(branch) {
    if (!branch || !PROTECTED.test(branch)) return '';
    return [
        `⚠️  Editing on protected branch '${branch}'.`,
        'Cut a feature branch before changes accumulate:',
        '  git switch -c <type>/<slug>',
        `If this edit on '${branch}' is intentional, proceed.`,
    ].join('\n');
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) {
        process.stdout.write(raw);
        process.exit(0);
    }
    let msg = '';
    try {
        msg = warningFor(currentBranch());
    } catch {
        msg = '';
    }
    if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
    else process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module) main();

module.exports = { warningFor, PROTECTED, HOOK_ID };
