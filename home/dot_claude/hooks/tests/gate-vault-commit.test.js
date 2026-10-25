'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { run, plan } = require('../bash-checks/gate-vault-commit');

const VAULT = '/v';
// Another session's edit to a tracked file, plus an untracked note.
const DIRTY = ' M mods/merge-watch/hooks/lib.ts\n M memory/tools/wsl-bridge.md\n?? memory/new.md';

const code = (cmd, { root = VAULT, status = DIRTY } = {}) =>
    run(
        { tool_input: { command: cmd } },
        { repoRoot: () => root, vaultRoot: VAULT, status: () => status, currentBranch: () => 'refactor/x' },
    ).exitCode;

test('blocks a commit naming one file while other work is uncommitted', () =>
    assert.equal(code('cd /v && git add memory/tools/wsl-bridge.md && git commit -m "memory: x"'), 2));

test('blocks git -C <vault> add/commit leaving another path dirty', () =>
    assert.equal(code('git -C /v add memory/tools/wsl-bridge.md memory/new.md && git -C /v commit -m x'), 2));

test('blocks commit -a: it names nothing and sweeps in tracked work', () =>
    assert.equal(code('cd /v && git commit -am "x"'), 2));

test('allows when every dirty path is named', () =>
    assert.equal(
        code('cd /v && git add mods memory/tools/wsl-bridge.md memory/new.md && git commit -m x'),
        0,
    ));

test('allows a pathspec commit covering the dirty paths', () =>
    assert.equal(code('cd /v && git commit -m x -- mods memory'), 0));

test('allows git add -A (everything named)', () => assert.equal(code('cd /v && git add -A && git commit -m x'), 0));

test('allows a clean vault', () => assert.equal(code('cd /v && git commit -m x', { status: '' }), 0));

test('treats staged work as part of the commit', () =>
    assert.equal(code('cd /v && git commit -m x', { status: 'M  memory/tools/wsl-bridge.md' }), 0));

test('ignores commits outside the vault', () =>
    assert.equal(code('cd /repo && git commit -m x', { root: '/repo' }), 0));

test('ignores a vault worktree (different root)', () =>
    assert.equal(code('git commit -m x', { root: '/home/u/dev/worktrees/claude-vault/feat-x' }), 0));

test('ignores commands without a commit', () => assert.equal(code('cd /v && git status'), 0));

test('a commit message is not read as a pathspec', () =>
    assert.deepEqual(plan('cd /v && git commit -m "memory: note"').named, []));
