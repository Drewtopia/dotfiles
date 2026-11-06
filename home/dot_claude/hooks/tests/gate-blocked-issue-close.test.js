'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { run, closes, blockers } = require('../bash-checks/gate-blocked-issue-close');

const input = cmd => ({ tool_input: { command: cmd }, cwd: '/repo' });

// A fake gh: `issues` maps number -> { body, state }; `calls` records each argv.
function fakeGh(issues, calls = []) {
    return args => {
        calls.push(args);
        const issue = issues[args[2]];
        if (!issue) throw new Error('not found');
        return args[4] === 'body' ? { body: issue.body } : { state: issue.state };
    };
}

// --- body parsing ---------------------------------------------------------
test('inline Blocked by takes refs after the phrase, not the parent before it', () => {
    const body = 'Parent: #346. Blocked by the pipeline-rewrite ticket and #934.';
    assert.deepEqual(blockers(body), ['934']);
});

test('Blocked by heading takes the bullet list until a blank line', () => {
    const body = [
        '## What',
        'Fix the thing, see #12.',
        '',
        '## Blocked by',
        '- #934',
        '- GH-935 (schema change)',
        '',
        'Related: #77',
    ].join('\n');
    assert.deepEqual(blockers(body), ['934', '935']);
});

test('Blocked by heading list stops at the next heading', () => {
    const body = '## Blocked by\n- #1\n## Notes\n- #2';
    assert.deepEqual(blockers(body), ['1']);
});

test('a "Blocked by:" line with nothing after it opens a list', () => {
    assert.deepEqual(blockers('**Blocked by:**\n- #5\n- #6\n\n#7'), ['5', '6']);
});

test('inline refs stop at the end of the sentence', () => {
    assert.deepEqual(blockers('Blocked by #934. Related: #12.'), ['934']);
});

test('no Blocked by -> no blockers', () => {
    assert.deepEqual(blockers('Parent: #346. See #934.'), []);
    assert.deepEqual(blockers(''), []);
});

// --- command parsing ------------------------------------------------------
test('reads the issue, --repo and -R', () => {
    assert.deepEqual(closes('gh issue close 12', '/r').map(c => [c.issue, c.repo]), [['12', '']]);
    assert.deepEqual(closes('gh issue close 12 --repo o/r').map(c => c.repo), ['o/r']);
    assert.deepEqual(closes('gh issue close -R o/r 12').map(c => [c.issue, c.repo]), [['12', 'o/r']]);
    assert.deepEqual(closes('gh issue close --repo=o/r #12').map(c => [c.issue, c.repo]), [['12', 'o/r']]);
});

test('a flag value is not read as the issue', () => {
    assert.deepEqual(closes('gh issue close -c "done" -r completed 12').map(c => c.issue), ['12']);
});

test('an issue URL names its repo', () => {
    const [c] = closes('gh issue close https://github.com/o/r/issues/9');
    assert.deepEqual([c.issue, c.repo], ['9', 'o/r']);
});

test('runs gh where the command cds to', () => {
    assert.equal(closes('cd /x && gh issue close 1', '/repo')[0].dir, '/x');
});

// --- decision -------------------------------------------------------------
test('blocks when a blocker is open, naming it', () => {
    const gh = fakeGh({
        12: { body: 'Parent: #346. Blocked by the pipeline-rewrite ticket and #934.' },
        934: { state: 'OPEN' },
        346: { state: 'OPEN' },
    });
    const res = run(input('gh issue close 12'), { gh });
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /#934 is open; close it first or edit the Blocked by line/);
    assert.doesNotMatch(res.stderr, /#346/);
});

test('names every open blocker from a heading list', () => {
    const gh = fakeGh({
        12: { body: '## Blocked by\n- #934\n- #935\n- #936' },
        934: { state: 'OPEN' },
        935: { state: 'CLOSED' },
        936: { state: 'OPEN' },
    });
    const res = run(input('gh issue close 12'), { gh });
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /#934, #936 are open; close them first/);
});

test('allows when every blocker is closed', () => {
    const gh = fakeGh({ 12: { body: 'Blocked by #934.' }, 934: { state: 'CLOSED' } });
    assert.equal(run(input('gh issue close 12'), { gh }).exitCode, 0);
});

test('passes --repo through to each lookup', () => {
    const calls = [];
    const gh = fakeGh({ 12: { body: 'Blocked by #934.' }, 934: { state: 'CLOSED' } }, calls);
    run(input('gh issue close 12 -R o/r'), { gh });
    assert.ok(calls.length === 2 && calls.every(a => a.slice(-2).join(' ') === '--repo o/r'));
});

test('a failed body lookup allows', () => {
    const gh = () => {
        throw new Error('network');
    };
    assert.equal(run(input('gh issue close 12'), { gh }).exitCode, 0);
});

test('a failed blocker lookup allows', () => {
    const gh = fakeGh({ 12: { body: 'Blocked by #934.' } });
    assert.equal(run(input('gh issue close 12'), { gh }).exitCode, 0);
});

test('other commands never call gh', () => {
    let called = false;
    const gh = () => ((called = true), {});
    assert.equal(run(input('gh issue view 12'), { gh }).exitCode, 0);
    assert.equal(run(input('git status'), { gh }).exitCode, 0);
    assert.equal(called, false);
});
