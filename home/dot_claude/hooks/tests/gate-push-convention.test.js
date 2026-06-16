'use strict';
/**
 * Unit tests for gate-push-convention.js. The branch decision is delegated to
 * commit-check (a subprocess), so tests inject a fake `check` plus `repoRoot`
 * and `currentBranch` to exercise the decision logic deterministically without
 * spawning anything.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { run, isGitPush } = require('../bash-checks/gate-push-convention');

const input = cmd => ({ tool_input: { command: cmd } });
const deps = (over = {}) => ({
    repoRoot: () => '/repo',
    currentBranch: () => 'bad_branch',
    check: () => ({ ok: true }),
    ...over,
});

// --- push detection -------------------------------------------------------
const PUSHES = [
    'git push',
    'git push origin feat/x',
    'git  push', // extra whitespace must not slip the gate
    'git -c key=val push',
    'FOO=bar git push',
];
const NON_PUSHES = ['git status', 'npm test', 'git pushd', 'pushing'];

for (const c of PUSHES) test(`isGitPush true: ${c}`, () => assert.ok(isGitPush(c)));
for (const c of NON_PUSHES)
    test(`isGitPush false: ${c}`, () => assert.ok(!isGitPush(c)));

// --- decision logic -------------------------------------------------------
test('non-push command allowed without invoking commit-check', () => {
    let called = false;
    const d = deps({ check: () => ((called = true), { ok: false }) });
    assert.equal(run(input('git status'), d).exitCode, 0);
    assert.equal(called, false);
});

test('push outside a repo allowed without invoking commit-check', () => {
    let called = false;
    const d = deps({
        repoRoot: () => '',
        check: () => ((called = true), { ok: false }),
    });
    assert.equal(run(input('git push'), d).exitCode, 0);
    assert.equal(called, false);
});

test('valid branch (commit-check ok) allowed', () => {
    assert.equal(run(input('git push'), deps({ check: () => ({ ok: true }) })).exitCode, 0);
});

test('commit-check unavailable degrades to allow', () => {
    assert.equal(
        run(input('git push'), deps({ check: () => ({ unavailable: true }) })).exitCode,
        0,
    );
});

test('invalid branch (commit-check fail) blocks with detail + branch name', () => {
    const d = deps({
        currentBranch: () => 'bad_branch',
        check: () => ({ ok: false, output: 'commit-check: branch name invalid' }),
    });
    const res = run(input('git push -u origin bad_branch'), d);
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /bad_branch/);
    assert.match(res.stderr, /commit-check: branch name invalid/);
    assert.match(res.stderr, /conventionalbranch\.org/);
});
