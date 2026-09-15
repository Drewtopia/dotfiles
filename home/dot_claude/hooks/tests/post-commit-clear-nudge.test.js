'use strict';
/** Safety net for post-commit-clear-nudge.js — pure runsGitCommit()/freshCommit()/noticeFor(). */

const { test } = require('node:test');
const assert = require('node:assert');
const {
    runsGitCommit,
    freshCommit,
    noticeFor,
    FRESH_SECONDS,
} = require('../post-commit-clear-nudge');

const COMMITS = [
    'git commit -m "fix: x"',
    'git add a.js && git commit -F - <<\'MSG\'\nfix: x\nMSG',
    'git -C /repo commit -m x',
    'cd sub; git commit --amend --no-edit',
    '/usr/bin/git commit -m x',
];
for (const command of COMMITS) {
    test(`commit: ${JSON.stringify(command)}`, () => assert.ok(runsGitCommit(command)));
}

const NOT_COMMITS = ['git log --oneline', 'git commit-tree abc', 'echo commit', 'gitcommit', '', undefined];
for (const command of NOT_COMMITS) {
    test(`not a commit: ${JSON.stringify(command)}`, () =>
        assert.equal(runsGitCommit(command), false));
}

test('freshCommit accepts a commit made just now', () =>
    assert.deepEqual(freshCommit('1000\tabc1234\tfix: x', 1030), {
        sha: 'abc1234',
        subject: 'fix: x',
    }));

test('freshCommit rejects a commit older than the window', () =>
    assert.equal(freshCommit('1000\tabc1234\tfix: x', 1000 + FRESH_SECONDS + 1), null));

test('freshCommit keeps tabs inside the subject', () =>
    assert.equal(freshCommit('1000\tabc\ta\tb', 1000).subject, 'a\tb'));

for (const line of ['', 'not-a-log-line', 'abc\tdef\tghi', undefined]) {
    test(`freshCommit rejects ${JSON.stringify(line)}`, () =>
        assert.equal(freshCommit(line, 1000), null));
}

test('noticeFor names the commit and /clear', () => {
    const notice = noticeFor({ sha: 'abc1234', subject: 'fix: x' });
    assert.match(notice, /abc1234 "fix: x"/);
    assert.match(notice, /\/clear/);
});
