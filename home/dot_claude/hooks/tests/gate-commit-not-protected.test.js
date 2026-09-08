'use strict';
/** Safety net for gate-commit-not-protected.js — branch injected via deps. */

const { test } = require('node:test');
const assert = require('node:assert');
const { run, commitTarget } = require('../bash-checks/gate-commit-not-protected');

const code = (cmd, branch) =>
    run({ tool_input: { command: cmd } }, { currentBranch: () => branch }).exitCode;

/** Branch per directory, so a `cd` sending the commit elsewhere is observable. */
const codeAt = (cmd, branches) =>
    run({ tool_input: { command: cmd } }, { currentBranch: cwd => branches[cwd || ''] || '' })
        .exitCode;

// On a protected branch, commits block.
for (const branch of ['main', 'master', 'develop']) {
    test(`blocks commit on ${branch}`, () => assert.equal(code('git commit -m "wip"', branch), 2));
    test(`blocks harness-wrapped commit on ${branch}`, () =>
        assert.equal(code('git -c core.hooksPath=/dev/null commit -m x', branch), 2));
    test(`blocks amend on ${branch}`, () =>
        assert.equal(code('git commit --amend --no-edit', branch), 2));
}

// On a feature branch, commits pass.
test('allows commit on a feature branch', () =>
    assert.equal(code('git commit -m "wip"', 'feat/login'), 0));

// Non-commit git/shell commands pass regardless of branch.
for (const cmd of ['git status', 'git push origin develop', 'ls -la']) {
    test(`allows non-commit: ${cmd}`, () => assert.equal(code(cmd, 'develop'), 0));
}

// Cross-repo `git -C <path> commit` does NOT match -> allowed even on develop.
test('allows git -C <path> commit (cross-repo)', () =>
    assert.equal(code('git -C /some/other/repo commit -m x', 'develop'), 0));

// Unresolvable branch (detached / non-repo) defers to allow.
test('allows commit when branch is empty', () => assert.equal(code('git commit -m "wip"', ''), 0));

// A commit named inside an argument is text, not an invocation.
for (const cmd of [
    'echo "run git commit later"',
    'grep -rn "git commit -m" .',
    "node -e \"t('git commit -m x', 'develop')\"",
    'printf \'%s\\n\' "git commit"',
]) {
    test(`allows commit named in an argument: ${cmd}`, () => assert.equal(code(cmd, 'develop'), 0));
}

// A wrapper that executes its argument still counts as an invocation.
for (const cmd of [
    'bash -c "git commit -m x"',
    "sh -c 'git commit -m x'",
    'zsh -c "git commit -m x"',
    'eval "git commit -m x"',
    'xargs git commit',
    'xargs -0 -n1 git commit',
]) {
    test(`blocks wrapped commit on develop: ${cmd}`, () => assert.equal(code(cmd, 'develop'), 2));
}

test('wrapped commit honours an outer cd', () =>
    assert.equal(
        codeAt('cd /repo/other && bash -c "git commit -m x"', {
            '': 'feat/here',
            '/repo/other': 'develop',
        }),
        2,
    ));

// `cd <path> && git commit` lands in <path>, so <path>'s branch is what counts.
test('blocks when cd target is on a protected branch', () =>
    assert.equal(
        codeAt('cd /repo/other && git commit -m x', {
            '': 'feat/here',
            '/repo/other': 'main',
        }),
        2,
    ));

test('allows when cd target is on a feature branch', () =>
    assert.equal(
        codeAt('cd /repo/other && git commit -m x', {
            '': 'develop',
            '/repo/other': 'feat/there',
        }),
        0,
    ));

test('honours a quoted cd path', () =>
    assert.equal(
        codeAt('cd "/repo/with space" && git commit -m x', {
            '': 'feat/here',
            '/repo/with space': 'develop',
        }),
        2,
    ));

// commitTarget reports where the commit lands, or null when there is none.
test('commitTarget resolves the cd target', () =>
    assert.equal(commitTarget('cd /repo/other && git commit -m x'), '/repo/other'));
test('commitTarget is empty for a bare commit', () =>
    assert.equal(commitTarget('git commit -m x'), ''));
test('commitTarget is null for git -C', () =>
    assert.equal(commitTarget('git -C /elsewhere commit -m x'), null));
test('commitTarget is null when no commit runs', () =>
    assert.equal(commitTarget('echo "git commit"'), null));
