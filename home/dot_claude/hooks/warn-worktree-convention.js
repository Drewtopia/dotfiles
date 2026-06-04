#!/usr/bin/env node
'use strict';
/**
 * PreToolUse(Bash|PowerShell): warn (but allow) on `git worktree add` targeting
 * a path outside .claude/worktrees/. Prefer EnterWorktree, which auto-places the
 * worktree under .claude/worktrees/<name> (already gitignored at the repo root).
 * Sibling worktree paths pollute the parent tree and show up as stray entries in
 * unrelated `git status`.
 *
 * Standalone (not a dispatcher bash-check) because the dispatcher is block/allow
 * only — warn-but-allow needs its own process emitting {"systemMessage":...}.
 *
 * Warn-but-allow: stdout {"systemMessage": ...}, exit 0.
 * Toggle: HOOKS_DISABLED=pre:bash:warn-worktree-convention
 */

const { readStdin, getCommand } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOK_ID = 'pre:bash:warn-worktree-convention';

/** Pure: warning for a `git worktree add` outside the convention, else ''. */
function warningFor(cmd) {
    if (!cmd) return '';
    if (!/git\s+worktree\s+add/.test(cmd)) return '';
    if (cmd.includes('.claude/worktrees/')) return '';
    return [
        'git worktree add outside .claude/worktrees/ convention.',
        '',
        'Preferred: use EnterWorktree (auto-places under .claude/worktrees/<name>).',
        'Alternative: git worktree add -b <branch> .claude/worktrees/<name> <base>.',
        '',
        "Sibling paths pollute the parent dir tree and aren't gitignored — stray",
        'edits show up in unrelated git status. The .claude/ dir is already',
        'gitignored at the repo root.',
        '',
        'If this is intentional (IDE-pinned path, cross-repo symlink), proceed.',
    ].join('\n');
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) {
        process.stdout.write(raw);
        process.exit(0);
    }
    let input = {};
    try {
        input = JSON.parse(raw || '{}');
    } catch {
        input = {};
    }
    const msg = warningFor(getCommand(input));
    if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
    else process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module) main();

module.exports = { warningFor, HOOK_ID };
