#!/usr/bin/env node
'use strict';
/**
 * SessionStart: name the tmux window cc:<dir>·<id4> so concurrent Claude
 * sessions — even two in the same directory — stay distinct in the window list.
 * <dir> is the cwd basename, <id4> the first 4 alphanumerics of session_id.
 * No-op outside tmux; the rename is a side effect only and never blocks.
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

/** Pure: tmux window name for a cwd + session id. */
function windowName(dir, sessionId) {
    const base = (dir && path.basename(dir)) || 'session';
    const id = String(sessionId || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 4);
    return id ? `cc:${base}·${id}` : `cc:${base}`;
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
    renameWindow(windowName(input.cwd || process.cwd(), input.session_id));
    process.exit(0);
}

if (require.main === module) main();

module.exports = { windowName, HOOK_ID };
