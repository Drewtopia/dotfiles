'use strict';
/** Safety net for pre-compact-snapshot.js — pure buildSnapshot() + sessionFile(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { buildSnapshot, sessionFile } = require('../pre-compact-snapshot');

const NOW = '2026-01-02T03:04:05.000Z';

test('snapshot renders trigger, branch, cwd, worktree and status block', () => {
    const md = buildSnapshot(
        {
            trigger: 'auto',
            branch: 'feat/x',
            status: ' M a.js\n?? b.js',
            cwd: '/repo',
            worktree: 'repo',
        },
        NOW,
    );
    assert.match(md, new RegExp(`## ${NOW} \\(auto\\)`));
    assert.match(md, /- branch: feat\/x/);
    assert.match(md, /- cwd: \/repo/);
    assert.match(md, /- worktree: repo/);
    assert.match(md, /```[\s\S]*M a\.js[\s\S]*```/);
});

test('clean tree shows (clean); missing fields never throw', () => {
    const md = buildSnapshot({ trigger: 'manual', status: '   ' }, NOW);
    assert.match(md, /\(clean\)/);
    assert.doesNotThrow(() => buildSnapshot(undefined, NOW));
    assert.doesNotThrow(() => buildSnapshot(null, NOW));
});

test('sessionFile sanitises the id against path traversal', () => {
    assert.equal(sessionFile({ session_id: 'abc123' }), 'pre-compact-abc123.md');
    assert.equal(
        sessionFile({ session_id: '../../etc/passwd' }),
        'pre-compact-etcpasswd.md',
    );
    assert.equal(sessionFile({}), 'pre-compact-unknown.md');
    assert.equal(sessionFile(undefined), 'pre-compact-unknown.md');
});
