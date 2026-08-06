#!/usr/bin/env node
'use strict';
/**
 * PreToolUse(Edit|Write|MultiEdit): block edits to non-ignored files while HEAD
 * is on a protected (integration) branch.
 *
 * Was warn-and-allow, paired with the harder commit block
 * (gate-commit-not-protected) as the backstop. That backstop only catches a
 * session that reaches `git commit` — one that edits, verifies and stops leaves
 * the whole change sitting uncommitted on develop, which is what happened to
 * the disclosures flake fix (2026-07-22). The first edit is the only point that
 * catches it.
 *
 * Deny: stderr + exit 2. Gitignored paths are exempt — per-checkout, never
 * committed, so a protected branch has nothing to lose by letting them through.
 * Untracked-but-not-ignored paths are still blocked: they are about to become
 * tracked, which is the thing being prevented.
 *
 * Toggle: HOOKS_DISABLED=pre:edit:block-on-protected
 */

const { dirname } = require('node:path');
const { existsSync } = require('node:fs');
const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'pre:edit:block-on-protected';
const PROTECTED = /^(main|master|develop)$/;

/** Pure: the denial message for a branch, or '' if the edit is allowed. */
function denialFor(branch) {
    if (!branch || !PROTECTED.test(branch)) return '';
    return [
        `Blocked: editing on protected branch '${branch}'.`,
        'Work belongs in a worktrunk worktree, not the shared checkout.',
        '',
        'Use the worktrunk:wt-switch-create skill. It creates the worktree AND',
        'moves this session into it, so retrying the same edit lands in the new',
        'tree with cwd, reads and any running process all agreeing.',
        '',
        'Do not reach for `wt switch --create --no-cd` here: --no-cd leaves the',
        'session in the shared checkout editing through absolute paths, which is',
        'the split-brain state this block exists to avoid.',
        '',
        `Override for this session with HOOKS_DISABLED=${HOOK_ID}`,
    ].join('\n');
}

/**
 * Branch of the checkout the FILE lives in, not the session's cwd — a session
 * rooted in the main tree editing inside a worktree is the normal case, and
 * asking cwd there would report develop and block the very thing we want.
 * Returns '' when the path is gitignored (nothing to protect) or outside a
 * repo, which {@link denialFor} reads as "allow".
 */
function branchFor(filePath) {
    if (!filePath) return '';
    // Write can target a directory that does not exist yet. `git -C <missing>`
    // exits non-zero, git() swallows that to '', and denialFor reads '' as
    // "allow" — so a new file under a new directory bypassed the block. Walk up
    // to the nearest existing ancestor so the checkout is still identified.
    let dir = dirname(filePath);
    while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir);
    // Load-bearing: `check-ignore` exits 1 with no output when the path is NOT
    // ignored, and git() swallows that to ''. Only an ignored path yields a
    // non-empty string. If git() ever stops swallowing, this inverts into
    // allow-everything.
    if (git(['-C', dir, 'check-ignore', '--', filePath])) return '';
    return git(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']);
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) {
        process.stdout.write(raw);
        process.exit(0);
    }
    let msg = '';
    try {
        msg = denialFor(branchFor(JSON.parse(raw)?.tool_input?.file_path));
    } catch {
        msg = '';
    }
    if (msg) {
        process.stderr.write(msg);
        process.exit(2);
    }
    process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module) main();

module.exports = { denialFor, branchFor, PROTECTED, HOOK_ID };
