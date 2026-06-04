'use strict';
/** Safety net for warn-worktree-convention.js — pure warningFor(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { warningFor } = require('../warn-worktree-convention');

// worktree add outside the convention -> warns.
for (const cmd of [
    'git worktree add ../sibling-wt -b feat/x',
    'git worktree add /tmp/wt origin/develop',
    'git  worktree  add   ./next feat/y',
]) {
    test(`warns: ${cmd}`, () => {
        const msg = warningFor(cmd);
        assert.match(msg, /\.claude\/worktrees\//);
    });
}

// On-convention or non-worktree commands stay silent.
for (const cmd of [
    'git worktree add .claude/worktrees/feat-x -b feat/x',
    'git worktree add -b feat/z .claude/worktrees/feat-z origin/develop',
    'git worktree list',
    'git status',
    'ls -la',
    '',
]) {
    test(`silent: ${cmd || '(empty)'}`, () =>
        assert.equal(warningFor(cmd), ''));
}
