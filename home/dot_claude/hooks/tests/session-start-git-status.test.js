'use strict';
/** Tests for session-start-git-status.js (port of the .sh). Run: node --test */

const test = require('node:test');
const assert = require('node:assert/strict');
const sg = require('../session-start-git-status.js');

const base = {
    branch: 'feature/x',
    integ: 'develop',
    branchAgeDays: 0,
    commitsAhead: 0,
    dirtyCount: 0,
    behind: 0,
    staleWorktrees: [],
};

test('clean state produces no warnings', () => {
    assert.deepEqual(sg.buildWarnings(base), []);
});

test('old branch and commits-ahead warn past thresholds', () => {
    const w = sg.buildWarnings({ ...base, branchAgeDays: 5, commitsAhead: 25 });
    assert.equal(w.length, 2);
    assert.match(w[0], /5d old \(>3d\)/);
    assert.match(w[1], /25 commits ahead of develop \(>20\)/);
});

test('thresholds are strict greater-than (boundary = no warn)', () => {
    assert.deepEqual(
        sg.buildWarnings({ ...base, branchAgeDays: 3, commitsAhead: 20 }),
        [],
    );
});

test('protected branches suppress age/ahead warnings', () => {
    for (const branch of ['main', 'develop', 'master']) {
        assert.deepEqual(
            sg.buildWarnings({
                ...base,
                branch,
                branchAgeDays: 99,
                commitsAhead: 99,
            }),
            [],
        );
    }
});

test('dirty / behind / stale worktrees each add a line', () => {
    const w = sg.buildWarnings({
        ...base,
        dirtyCount: 4,
        behind: 2,
        staleWorktrees: ['/wt/a (9d)'],
    });
    assert.match(w[0], /4 uncommitted change\(s\)/);
    assert.match(w[1], /2 commit\(s\) behind upstream/);
    assert.match(w[2], /Stale worktrees \(>7d\): \/wt\/a \(9d\)/);
});

test('missing integration branch skips age/ahead but keeps dirty', () => {
    const w = sg.buildWarnings({
        ...base,
        integ: '',
        branchAgeDays: 99,
        commitsAhead: 99,
        dirtyCount: 1,
    });
    assert.equal(w.length, 1);
    assert.match(w[0], /1 uncommitted change\(s\)/);
});
