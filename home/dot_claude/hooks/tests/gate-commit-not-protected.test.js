'use strict';
/** Safety net for gate-commit-not-protected.js — branch injected via deps. */

const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../bash-checks/gate-commit-not-protected');

const code = (cmd, branch) =>
    run({ tool_input: { command: cmd } }, { currentBranch: () => branch })
        .exitCode;

// On a protected branch, commits block.
for (const branch of ['main', 'master', 'develop']) {
    test(`blocks commit on ${branch}`, () =>
        assert.equal(code('git commit -m "wip"', branch), 2));
    test(`blocks harness-wrapped commit on ${branch}`, () =>
        assert.equal(
            code('git -c core.hooksPath=/dev/null commit -m x', branch),
            2,
        ));
    test(`blocks amend on ${branch}`, () =>
        assert.equal(code('git commit --amend --no-edit', branch), 2));
}

// On a feature branch, commits pass.
test('allows commit on a feature branch', () =>
    assert.equal(code('git commit -m "wip"', 'feat/login'), 0));

// Non-commit git/shell commands pass regardless of branch.
for (const cmd of ['git status', 'git push origin develop', 'ls -la']) {
    test(`allows non-commit: ${cmd}`, () =>
        assert.equal(code(cmd, 'develop'), 0));
}

// Cross-repo `git -C <path> commit` does NOT match -> allowed even on develop.
test('allows git -C <path> commit (cross-repo)', () =>
    assert.equal(code('git -C /some/other/repo commit -m x', 'develop'), 0));

// Unresolvable branch (detached / non-repo) defers to allow.
test('allows commit when branch is empty', () =>
    assert.equal(code('git commit -m "wip"', ''), 0));
