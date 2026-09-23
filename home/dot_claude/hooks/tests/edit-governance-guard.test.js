'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { decide, denyOnError } = require('../edit-governance-guard.cjs');

const edit = file_path => ({ tool_input: { file_path } });

test('allows files outside governance paths', () => {
    assert.equal(decide(edit('/repo/src/index.ts'), () => false), null);
});

test('denies a governance path without an unlock', () => {
    assert.match(decide(edit('/repo/.claude/skills/x/SKILL.md'), () => false), /Governance surface/);
});

test('allows a governance path with a fresh unlock', () => {
    assert.equal(decide(edit('/repo/.claude/skills/x/SKILL.md'), () => true), null);
});

test('a crash denies instead of allowing', () => {
    const reason = denyOnError(() => {
        throw new Error('boom');
    });
    assert.match(reason, /edit-governance-guard errored: boom/);
});
