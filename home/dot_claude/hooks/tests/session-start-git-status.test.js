'use strict';

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

test('dirty / behind each add a line', () => {
    const w = sg.buildWarnings({ ...base, dirtyCount: 4, behind: 2 });
    assert.match(w[0], /4 uncommitted change\(s\)/);
    assert.match(w[1], /2 commit\(s\) behind upstream/);
});

const stream = {
    branch: 'feat/gh12-x',
    ageDays: 1,
    lastSubject: 'feat: last commit',
    dirty: 0,
    merged: false,
    cardStatus: '',
    cardComment: '',
};

test('a stream with a card shows its status and next step', () => {
    const [line] = sg.buildStreams([
        { ...stream, cardStatus: 'in-review', cardComment: 'Next: review PR 10031' },
    ]);
    assert.equal(line, 'feat/gh12-x — in-review — Next: review PR 10031');
});

test('a stream without a card falls back to its last commit subject', () => {
    const [line] = sg.buildStreams([stream]);
    assert.equal(line, 'feat/gh12-x — no card — feat: last commit');
});

test('merged wins over the card status; uncommitted work and age are flagged', () => {
    const [merged] = sg.buildStreams([{ ...stream, merged: true, cardStatus: 'in-review', ageDays: 9 }]);
    assert.equal(merged, 'feat/gh12-x — merged — feat: last commit · stale 9d');
    const [dirty] = sg.buildStreams([{ ...stream, dirty: 3 }]);
    assert.equal(dirty, 'feat/gh12-x — no card — feat: last commit · 3 uncommitted');
});

test('behind names the upstream to read code state from', () => {
    const w = sg.buildWarnings({ ...base, behind: 11, upstream: 'origin/develop' });
    assert.match(w[0], /11 commit\(s\) behind origin\/develop/);
    assert.match(w[0], /git show origin\/develop:<path>/);
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
