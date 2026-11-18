'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../bash-checks/gate-pr-body');

const FULL = '## Summary\nx\n\n## Evidence\ny\n\n## Merge Danger\nz\n';
const input = cmd => ({ tool_input: { command: cmd }, cwd: '/repo' });
const files = map => p => {
    if (p in map) return map[p];
    throw new Error('ENOENT');
};

test('a command with no gh pr create passes', () => {
    assert.equal(run(input('git push -u origin feat/x')).exitCode, 0);
});

test('a body file with all three headings passes', () => {
    const res = run(input('gh pr create --title t --body-file pr.md'), { readFile: files({ '/repo/pr.md': FULL }) });
    assert.equal(res.exitCode, 0);
});

test('a body file missing Merge Danger is blocked and names it', () => {
    const res = run(input('gh pr create -F pr.md'), { readFile: files({ '/repo/pr.md': '## Summary\n## Evidence\n' }) });
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /## Merge Danger/);
    assert.doesNotMatch(res.stderr, /## Summary,/);
});

test('the body file resolves against a cd before the call', () => {
    const res = run(input('cd sub && gh pr create --body-file=pr.md'), { readFile: files({ '/repo/sub/pr.md': FULL }) });
    assert.equal(res.exitCode, 0);
});

test('an inline heredoc body with the headings passes', () => {
    const cmd = `gh pr create --title t --body "$(cat <<'EOF'\n${FULL}EOF\n)"`;
    assert.equal(run(input(cmd)).exitCode, 0);
});

test('a one-line inline body is blocked', () => {
    assert.equal(run(input('gh pr create --title t --body "fixes the thing"')).exitCode, 2);
});

test('no body flag at all is blocked', () => {
    assert.equal(run(input('gh pr create --title t --fill')).exitCode, 2);
});

test('--web, stdin and an unreadable file allow', () => {
    assert.equal(run(input('gh pr create --web')).exitCode, 0);
    assert.equal(run(input('gh pr create --body-file -')).exitCode, 0);
    assert.equal(run(input('gh pr create --body-file gone.md'), { readFile: files({}) }).exitCode, 0);
});

test('gh pr create named inside an argument is text', () => {
    assert.equal(run(input('git commit -m "run gh pr create later"')).exitCode, 0);
});
