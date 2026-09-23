#!/usr/bin/env node
'use strict';
// SessionStart: name the tmux window <branch>·<id4>, or cc:<dir>·<id4> without a branch.
// <id4> (from session_id) keeps concurrent sessions on one branch distinct.

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOK_ID = 'session:start:window-name';

function windowName(dir, sessionId, branch) {
    const id = String(sessionId || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 4);
    const suffix = id ? `·${id}` : '';
    if (branch) return `${branch.replace(/[/\\]/g, '-')}${suffix}`;
    const base = (dir && path.basename(dir)) || 'session';
    return `cc:${base}${suffix}`;
}

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
        /* not in tmux, or tmux missing */
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
