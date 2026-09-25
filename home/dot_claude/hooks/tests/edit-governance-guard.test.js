'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const {
    decide,
    denyOnError,
    grantOnExpansion,
    isGoverned,
    markerPath,
    unlocked,
} = require('../edit-governance-guard.cjs');

const edit = file_path => ({ tool_input: { file_path } });

test('allows files outside governance paths', () => {
    assert.equal(
        decide(edit('/repo/src/index.ts'), () => false),
        null,
    );
});

test('denies a governance path without an unlock', () => {
    assert.match(
        decide(edit('/repo/.claude/skills/x/SKILL.md'), () => false),
        /Governance surface/,
    );
});

test('denies vault rules in the checkout and in a worktree', () => {
    for (const p of [
        '/home/u/.claude-vault/rules/style.md',
        '/home/u/dev/worktrees/claude-vault/rules-x/rules/style.md',
    ]) {
        assert.match(
            decide(edit(p), () => false),
            /Governance surface/,
            p,
        );
    }
});

test('allows a governance path with a fresh unlock', () => {
    assert.equal(
        decide(edit('/repo/.claude/skills/x/SKILL.md'), () => true),
        null,
    );
});

test('passes the calling session to the unlock check', () => {
    const seen = [];
    decide(
        { session_id: 'abc', tool_input: { file_path: '/repo/AGENTS.md' } },
        sid => (seen.push(sid), false),
    );
    assert.deepEqual(seen, ['abc']);
});

test('governs the settings merge template and the unlock markers', () => {
    assert.ok(isGoverned('/c/home/.chezmoitemplates/claude-settings-merge'));
    assert.ok(isGoverned('/home/u/.claude/governance-unlock/session-abc'));
    assert.ok(!isGoverned('/repo/src/claude.ts'));
});

test('rejects a session id that could escape the marker dir', () => {
    assert.equal(markerPath('../x'), null);
    assert.equal(markerPath(undefined), null);
    assert.equal(grantOnExpansion({ session_id: '../x', command_name: 'edit-governance' }), false);
});

test('only an unlocking command grants, and only its own session', () => {
    const sid = `test-${process.pid}-${Date.now()}`;
    try {
        assert.equal(grantOnExpansion({ session_id: sid, command_name: 'close' }), false);
        assert.equal(unlocked(sid), false);
        assert.equal(grantOnExpansion({ session_id: sid, command_name: 'edit-governance' }), true);
        assert.equal(unlocked(sid), true);
        assert.equal(unlocked(`${sid}-other`), false);
    } finally {
        fs.rmSync(markerPath(sid), { force: true });
    }
});

test('a crash denies instead of allowing', () => {
    const reason = denyOnError(() => {
        throw new Error('boom');
    });
    assert.match(reason, /edit-governance-guard errored: boom/);
});
