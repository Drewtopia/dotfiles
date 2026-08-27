#!/usr/bin/env node
'use strict';
/**
 * SessionStart: name the tmux window <branch>·<id4> in a git worktree (matching
 * the worktrunk session name), or cc:<dir>·<id4> outside git. The <id4> suffix —
 * first 4 alphanumerics of session_id — keeps concurrent Claude sessions on the
 * same branch/dir distinct. No-op outside tmux; the rename never blocks.
 *
 * Replaces the former inline `tmux rename-window cc:$(basename $PWD)` command,
 * which could not read session_id (it lives in the hook's stdin payload).
 *
 * Toggle: HOOKS_DISABLED=session:start:window-name
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOK_ID = 'session:start:window-name';

/** Pure: tmux window name for a cwd, session id, and optional git branch. In a
 *  worktree the branch names the window; outside git it falls back to cc:<dir>. */
function windowName(dir, sessionId, branch) {
    const id = String(sessionId || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 4);
    const suffix = id ? `·${id}` : '';
    if (branch) return `${branch.replace(/[/\\]/g, '-')}${suffix}`;
    const base = (dir && path.basename(dir)) || 'session';
    return `cc:${base}${suffix}`;
}

/** Current branch of `dir`, or '' when not in a git worktree or HEAD is detached. */
function gitBranch(dir) {
    try {
        return execFileSync('git', ['-C', dir || '.', 'symbolic-ref', '--quiet', '--short', 'HEAD'], {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
    } catch {
        return '';
    }
}

function renameWindow(name) {
    try {
        execFileSync('tmux', ['rename-window', name], { stdio: 'ignore' });
    } catch {
        /* not in tmux / tmux missing -> no-op */
    }
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID) || !process.env.TMUX) process.exit(0);
    const input = parseInput(raw);
    const dir = input.cwd || process.cwd();
    renameWindow(windowName(dir, input.session_id, gitBranch(dir)));
    process.exit(0);
}

if (require.main === module) main();

module.exports = { windowName, HOOK_ID };
